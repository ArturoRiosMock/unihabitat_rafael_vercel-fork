/**
 * Cupo de avisos al comprador: como mucho 2 por semana (lunes a domingo UTC).
 * El cron del cruce ya corre lunes y jueves. El tope vive también en la base,
 * en el trigger de `comprador_avisos`.
 */

export const MAX_AVISOS_POR_SEMANA = 2;

export interface PlanAvisoComprador {
  email: boolean;
  whatsapp: boolean;
  bloqueadoPorCupo: boolean;
}

/** Lunes de la semana UTC, `YYYY-MM-DD`. */
export function lunesSemanaUtc(ahora: Date): string {
  const dia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const weekday = dia.getUTCDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  dia.setUTCDate(dia.getUTCDate() - diff);
  return dia.toISOString().slice(0, 10);
}

export function puedeEnviarAviso(avisosEnSemana: number): boolean {
  return Number.isFinite(avisosEnSemana) && avisosEnSemana < MAX_AVISOS_POR_SEMANA;
}

/**
 * Un aviso es el lote (email y WhatsApp juntos cuentan como uno).
 * Si la semana ya lleva 2, no sale ningún canal.
 */
export function planAvisoComprador(input: {
  avisosEnSemana: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  aceptaWhatsapp: boolean;
  tieneTelefono: boolean;
  tieneEmail: boolean;
}): PlanAvisoComprador {
  if (!puedeEnviarAviso(input.avisosEnSemana)) {
    return { email: false, whatsapp: false, bloqueadoPorCupo: true };
  }
  return {
    email: input.emailEnabled && input.tieneEmail,
    whatsapp: input.whatsappEnabled && input.aceptaWhatsapp && input.tieneTelefono,
    bloqueadoPorCupo: false,
  };
}

export function resumenOportunidadesWhatsapp(
  oportunidades: Array<{ titulo: string; lugar: string; precioLabel: string | null }>,
): string {
  const lineas = oportunidades.slice(0, 5).map((item) => {
    const partes = [item.titulo, item.lugar, item.precioLabel].filter(Boolean);
    return partes.join(" · ");
  });
  const extra = oportunidades.length > 5 ? ` y ${oportunidades.length - 5} más` : "";
  const texto = `${lineas.join("; ")}${extra}`.trim();
  return texto.slice(0, 900) || "Nuevas oportunidades en tu portal";
}
