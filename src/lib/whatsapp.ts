/**
 * Adaptador de WhatsApp Cloud API (Meta).
 * Desactivado salvo WHATSAPP_ENABLED=true. En dry-run solo escribe un log
 * y no llama a la API: el cliente aún no ha dado el número de WhatsApp Business.
 *
 * La plantilla aprobada en Meta debe tener dos variables de cuerpo:
 * {{1}} nombre del comprador y {{2}} resumen de oportunidades.
 */

import { resumenOportunidadesWhatsapp } from "@/lib/aviso-comprador";

const GRAPH_VERSION = "v21.0";

export interface WhatsappEnv {
  WHATSAPP_ENABLED?: string;
  WHATSAPP_DRY_RUN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_TEMPLATE_OPORTUNIDADES?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  [key: string]: string | undefined;
}

export interface OportunidadWhatsapp {
  titulo: string;
  lugar: string;
  precioLabel: string | null;
}

export type ResultadoWhatsapp = "enviado" | "omitido" | "error";

export interface MensajeWhatsappEntrante {
  telefono: string;
  wamid: string;
  cuerpo: string;
  tipo: string;
}

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function flagActivo(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

/** Solo `true` activa el adaptador y el webhook. Cualquier otro valor lo apaga. */
export function whatsappHabilitado(env: WhatsappEnv): boolean {
  return flagActivo(env.WHATSAPP_ENABLED);
}

/**
 * Por defecto está en dry-run. Hay que poner WHATSAPP_DRY_RUN=false
 * para llamar a la API de Meta.
 */
export function whatsappEnDryRun(env: WhatsappEnv): boolean {
  const value = (env.WHATSAPP_DRY_RUN ?? "").trim().toLowerCase();
  if (!value) return true;
  return value === "true" || value === "1" || value === "yes" || value === "si" || value === "sí";
}

/** Dígitos en formato internacional, sin +. Un móvil español de 9 cifras lleva 34. */
export function telefonoWhatsapp(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function telefonosEquivalentes(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = telefonoWhatsapp(a);
  const right = telefonoWhatsapp(b);
  if (!left || !right) return false;
  return left === right;
}

export function verificarWebhookWhatsapp(
  query: { mode: string | null; token: string | null; challenge: string | null },
  verifyToken: string | undefined,
): { ok: true; challenge: string } | { ok: false } {
  const esperado = (verifyToken ?? "").trim();
  if (!esperado) return { ok: false };
  if (query.mode !== "subscribe") return { ok: false };
  if (!query.token || query.token !== esperado) return { ok: false };
  if (!query.challenge) return { ok: false };
  return { ok: true, challenge: query.challenge };
}

function texto(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cuerpoMensaje(mensaje: Record<string, unknown>): string {
  const tipo = texto(mensaje.type);
  if (tipo === "text") {
    const text = mensaje.text;
    if (text && typeof text === "object" && "body" in text) {
      return texto((text as { body?: unknown }).body);
    }
  }
  if (tipo === "button") {
    const button = mensaje.button;
    if (button && typeof button === "object" && "text" in button) {
      return texto((button as { text?: unknown }).text);
    }
  }
  return tipo ? `[${tipo}]` : "";
}

/** Mensajes entrantes del POST de Meta. Ignora estados de entrega. */
export function extraerMensajesWhatsapp(payload: unknown): MensajeWhatsappEntrante[] {
  if (!payload || typeof payload !== "object") return [];
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];
  const mensajes: MensajeWhatsappEntrante[] = [];
  for (const item of entry) {
    if (!item || typeof item !== "object") continue;
    const changes = (item as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const lista = (value as { messages?: unknown }).messages;
      if (!Array.isArray(lista)) continue;
      for (const mensaje of lista) {
        if (!mensaje || typeof mensaje !== "object") continue;
        const row = mensaje as Record<string, unknown>;
        const telefono = texto(row.from);
        const wamid = texto(row.id);
        if (!telefono || !wamid) continue;
        mensajes.push({
          telefono,
          wamid,
          cuerpo: cuerpoMensaje(row),
          tipo: texto(row.type) || "desconocido",
        });
      }
    }
  }
  return mensajes;
}

export function payloadPlantillaOportunidades(input: {
  to: string;
  template: string;
  nombre: string;
  oportunidades: OportunidadWhatsapp[];
}): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.template,
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: input.nombre || "cliente" },
            { type: "text", text: resumenOportunidadesWhatsapp(input.oportunidades) },
          ],
        },
      ],
    },
  };
}

/**
 * Envía la plantilla de oportunidades. No lanza: devuelve el resultado
 * para que el cruce pueda seguir con el resto de compradores.
 */
export async function enviarWhatsappOportunidades(
  input: {
    telefono: string;
    nombre: string;
    oportunidades: OportunidadWhatsapp[];
  },
  env: WhatsappEnv = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<ResultadoWhatsapp> {
  if (!whatsappHabilitado(env)) return "omitido";
  if (!input.oportunidades.length) return "omitido";
  const to = telefonoWhatsapp(input.telefono);
  if (!to) return "omitido";
  const template = (env.WHATSAPP_TEMPLATE_OPORTUNIDADES ?? "").trim();
  const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  if (!template || !phoneNumberId) {
    console.error("[whatsapp] Falta WHATSAPP_TEMPLATE_OPORTUNIDADES o WHATSAPP_PHONE_NUMBER_ID");
    return "error";
  }
  const body = payloadPlantillaOportunidades({
    to,
    template,
    nombre: input.nombre,
    oportunidades: input.oportunidades,
  });
  if (whatsappEnDryRun(env)) {
    console.info("[whatsapp:dry-run]", {
      to,
      template,
      nombre: input.nombre,
      oportunidades: input.oportunidades.length,
    });
    return "enviado";
  }
  const token = (env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    console.error("[whatsapp] Falta WHATSAPP_ACCESS_TOKEN");
    return "error";
  }
  try {
    const response = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("[whatsapp]", response.status, detail.slice(0, 400));
      return "error";
    }
    return "enviado";
  } catch (err) {
    console.error("[whatsapp]", err instanceof Error ? err.message : err);
    return "error";
  }
}
