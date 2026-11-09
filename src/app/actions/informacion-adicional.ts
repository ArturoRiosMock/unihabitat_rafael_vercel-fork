"use server";

import { getServerSession } from "@/lib/auth-server";
import {
  canReadInformacionAdicional,
  planInformacionAdicionalWrite,
} from "@/lib/informacion-adicional";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Texto de «Información Adicional» de un activo.
 * Lo leen admin y agentes. No lee `notas` ni las notas privadas.
 */
export async function fetchInformacionAdicional(assetId: string): Promise<string> {
  const session = await getServerSession();
  if (!session || !canReadInformacionAdicional(session.role)) {
    throw new Error("Acceso denegado");
  }
  const id = assetId.trim();
  if (!id) throw new Error("Activo no válido");

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("asset_informacion_adicional")
    .select("texto")
    .eq("asset_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.texto === "string" ? data.texto : "";
}

/** Persistencia por activo. Solo admin. El agente queda rechazado en servidor. */
export async function saveInformacionAdicional(assetId: string, text: string): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const plan = planInformacionAdicionalWrite(session.role, text);
  if (!plan.ok) throw new Error(plan.error);

  const id = assetId.trim();
  if (!id) throw new Error("Activo no válido");

  const supabase = await createServiceClient();
  const { error } = await supabase.from("asset_informacion_adicional").upsert(
    {
      asset_id: id,
      texto: plan.texto,
      updated_at: new Date().toISOString(),
      updated_by: session.userId ?? null,
    },
    { onConflict: "asset_id" },
  );
  if (error) throw new Error(error.message);
}
