import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  extraerMensajesWhatsapp,
  telefonosEquivalentes,
  verificarWebhookWhatsapp,
  whatsappHabilitado,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function desactivado() {
  return NextResponse.json({ ok: false, error: "WhatsApp desactivado" }, { status: 404 });
}

/**
 * Verificación GET de Meta y alta de mensajes entrantes.
 * No responde si WHATSAPP_ENABLED no es exactamente true.
 */
export async function GET(request: Request) {
  if (!whatsappHabilitado(process.env)) return desactivado();
  const url = new URL(request.url);
  const verificado = verificarWebhookWhatsapp({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  }, process.env.WHATSAPP_VERIFY_TOKEN);
  if (!verificado.ok) {
    return NextResponse.json({ ok: false, error: "Verificación rechazada" }, { status: 403 });
  }
  return new NextResponse(verificado.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  if (!whatsappHabilitado(process.env)) return desactivado();
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo no válido" }, { status: 400 });
  }
  const mensajes = extraerMensajesWhatsapp(payload);
  if (mensajes.length === 0) return NextResponse.json({ ok: true, guardados: 0 });

  try {
    const sb = await createServiceClient();
    const { data, error } = await sb.from("compradores").select("id, tel");
    if (error) throw new Error(error.message);
    const compradores = (data ?? []) as Array<{ id: string; tel: string | null }>;
    let guardados = 0;
    for (const mensaje of mensajes) {
      const comprador = compradores.find((row) => telefonosEquivalentes(row.tel, mensaje.telefono));
      const { error: insertError } = await sb.from("whatsapp_mensajes").insert({
        comprador_id: comprador?.id ?? null,
        telefono: mensaje.telefono,
        wamid: mensaje.wamid,
        direccion: "entrante",
        tipo: mensaje.tipo,
        cuerpo: mensaje.cuerpo,
        raw: payload,
      });
      if (insertError) {
        if (insertError.code === "23505") continue;
        throw new Error(insertError.message);
      }
      guardados += 1;
    }
    return NextResponse.json({ ok: true, guardados });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el mensaje";
    console.error("[whatsapp] webhook:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
