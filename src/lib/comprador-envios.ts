/**
 * Historial de activos enviados a un comprador.
 * La ventana de 14 días avisa en el alta manual y excluye el cruce automático.
 */

export const CANALES_ENVIO = ["email", "whatsapp", "manual", "cruce"] as const;
export type CanalEnvio = (typeof CANALES_ENVIO)[number];

export const ETIQUETA_CANAL_ENVIO: Record<CanalEnvio, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  manual: "Manual",
  cruce: "Cruce",
};

export const DIAS_SIN_REPETIR_ENVIO = 14;

export interface EnvioReciente {
  assetId: string;
  enviadoAt: string;
}

export interface EnvioComprador {
  id: string;
  compradorId: string;
  assetId: string;
  canal: string;
  enviadoPor: string;
  enviadoAt: string;
  nota: string;
}

export function esCanalEnvio(value: string): value is CanalEnvio {
  return (CANALES_ENVIO as readonly string[]).includes(value);
}

export function etiquetaCanalEnvio(canal: string): string {
  if (esCanalEnvio(canal)) return ETIQUETA_CANAL_ENVIO[canal];
  return canal;
}

/** Fecha corta dd/mm en UTC, estable para el aviso. */
export function etiquetaFechaEnvio(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function mensajeYaEnviado(iso: string): string {
  const fecha = etiquetaFechaEnvio(iso);
  return fecha ? `Ya enviado el ${fecha}` : "Ya enviado";
}

export function dentroDeVentanaEnvio(
  enviadoAt: string,
  ahora: Date,
  dias: number = DIAS_SIN_REPETIR_ENVIO,
): boolean {
  const time = new Date(enviadoAt).getTime();
  if (Number.isNaN(time)) return false;
  const desde = ahora.getTime() - dias * 24 * 60 * 60 * 1000;
  return time >= desde;
}

/**
 * Para cada activo pedido, el envío más reciente que cae en la ventana.
 * Si no hay ninguno, el activo no sale.
 */
export function enviosRecientesDe(
  envios: EnvioReciente[],
  assetIds: readonly string[],
  ahora: Date,
  dias: number = DIAS_SIN_REPETIR_ENVIO,
): EnvioReciente[] {
  const buscados = new Set(assetIds);
  const mejor = new Map<string, EnvioReciente>();
  for (const envio of envios) {
    if (!buscados.has(envio.assetId)) continue;
    if (!dentroDeVentanaEnvio(envio.enviadoAt, ahora, dias)) continue;
    const prev = mejor.get(envio.assetId);
    if (!prev || envio.enviadoAt > prev.enviadoAt) mejor.set(envio.assetId, envio);
  }
  return [...mejor.values()].sort((a, b) => a.assetId.localeCompare(b.assetId, "es"));
}

export function textoConfirmacionReenvio(envios: EnvioReciente[]): string {
  if (envios.length === 0) return "";
  const lineas = envios.map((envio) => `${envio.assetId}: ${mensajeYaEnviado(envio.enviadoAt)}`);
  return `${lineas.join("\n")}\n¿Quieres enviarlo de nuevo?`;
}
