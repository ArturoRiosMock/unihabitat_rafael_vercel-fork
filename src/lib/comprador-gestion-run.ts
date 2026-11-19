import type { SupabaseClient } from "@supabase/supabase-js";
import { REASIGNAR_INACTIVOS_RPC } from "@/lib/comprador-gestion";

/** Agente actualmente asignado, o null si el comprador es del gestor. */
export async function fetchAssignedVendedorId(
  sb: SupabaseClient,
  compradorId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("vendedor_compradores")
    .select("vendedor_id")
    .eq("comprador_id", compradorId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.vendedor_id as string | undefined) ?? null;
}

/** Marca la última gestión del agente asignado. No la llama el admin. */
export async function touchUltimaGestionAgente(
  sb: SupabaseClient,
  compradorId: string,
  at: Date = new Date(),
): Promise<void> {
  const { error } = await sb
    .from("compradores")
    .update({ ultima_gestion_agente_at: at.toISOString() })
    .eq("id", compradorId);
  if (error) throw new Error(error.message);
}

/**
 * Pasa al gestor los compradores con 90 días sin gestión del agente.
 * Una sola transacción en Postgres (la función SQL).
 */
export async function runReasignacionInactividad(
  sb: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await sb.rpc(REASIGNAR_INACTIVOS_RPC, {
    p_now: now.toISOString(),
  });
  if (error) throw new Error(error.message);
  const count = typeof data === "number" ? data : Number(data ?? 0);
  return Number.isFinite(count) ? count : 0;
}
