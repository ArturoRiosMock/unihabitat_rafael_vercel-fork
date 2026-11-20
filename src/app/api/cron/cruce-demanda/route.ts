import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/lib/comprador-gestion";
import { runCruceDemanda } from "@/lib/cruce-demanda-run";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron (vercel.json, lunes y jueves 07:00 UTC) llama esta ruta con
 * `Authorization: Bearer ${CRON_SECRET}`.
 * El email al comprador solo sale si CRUCE_DEMANDA_EMAIL_ENABLED=true.
 */
export async function GET(request: Request) {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const sb = await createServiceClient();
    const resultado = await runCruceDemanda(sb, { origen: "cron", registrar: true });
    return NextResponse.json({
      ok: true,
      compradores: resultado.compradores,
      conDemanda: resultado.conDemanda,
      oportunidades: resultado.oportunidades,
      porNivel: resultado.porNivel,
      emailsEnviados: resultado.emailsEnviados,
      emailsOmitidos: resultado.emailsOmitidos,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cruzar la demanda";
    console.error("[cron] cruce-demanda:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
