import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/lib/comprador-gestion";
import { runReasignacionInactividad } from "@/lib/comprador-gestion-run";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron (vercel.json) llama esta ruta con
 * `Authorization: Bearer ${CRON_SECRET}`.
 * La misma reasignación también corre al listar compradores.
 */
export async function GET(request: Request) {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const sb = await createServiceClient();
    const reasignados = await runReasignacionInactividad(sb);
    return NextResponse.json({ ok: true, reasignados });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo reasignar";
    console.error("[cron] reasignar-compradores:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
