export const INFORMACION_ADICIONAL_MAX = 20_000;

export type InformacionAdicionalRole = "admin" | "vendedor" | "cliente";

export type InformacionAdicionalWritePlan =
  | { ok: true; texto: string }
  | { ok: false; error: string };

/** Admin y cualquier agente leen el cuadro. El comprador y el anónimo no. */
export function canReadInformacionAdicional(role: InformacionAdicionalRole): boolean {
  return role === "admin" || role === "vendedor";
}

/**
 * Solo el administrador escribe. El agente que llame a la action recibe error
 * aunque la UI no muestre el botón.
 */
export function planInformacionAdicionalWrite(
  role: InformacionAdicionalRole,
  text: string,
): InformacionAdicionalWritePlan {
  if (role !== "admin") {
    return { ok: false, error: "Solo el administrador puede modificar la información adicional" };
  }
  const texto = text.replace(/\u0000/g, "").trim();
  if (texto.length > INFORMACION_ADICIONAL_MAX) {
    return { ok: false, error: "La información adicional supera el máximo permitido" };
  }
  return { ok: true, texto };
}
