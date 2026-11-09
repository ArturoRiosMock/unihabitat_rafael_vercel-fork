"use server";

import { getServerSession, requireAdmin } from "@/lib/auth-server";
import {
  canReadNota,
  planNotaInsert,
  type NotaScope,
} from "@/lib/nota-visibility";
import type { UserSession } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";

export interface NotaRow {
  id: string;
  asset_id: string | null;
  comprador_id: string | null;
  author: string;
  author_id?: string | null;
  scope?: NotaScope | null;
  text: string;
  created_at: string;
}

async function buyerIdFor(session: UserSession): Promise<string | null> {
  if (session.compradorId) return session.compradorId;
  if (session.role !== "cliente") return null;
  const supabase = await createServiceClient();
  let query = supabase.from("compradores").select("id");
  if (session.userId) {
    query = query.or(`user_id.eq.${session.userId},email.ilike.${session.email}`);
  } else if (session.email) {
    query = query.ilike("email", session.email);
  } else {
    return null;
  }
  const { data } = await query.limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Notas visibles para la sesión.
 *
 * Admin: todas las del alcance (`activo` en Características y Agentes,
 * `privada` solo en Administrador, o las de un comprador si se pide).
 * Agente: solo las de activo que creó.
 * Comprador: solo las suyas del portal.
 *
 * El filtro se aplica aquí (service role) y en las políticas SELECT.
 */
export async function fetchNotas(opts: {
  assetId?: string;
  compradorId?: string;
  scope?: NotaScope;
}): Promise<NotaRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const scope: NotaScope = opts.scope ?? "activo";
  const compradorId = session.role === "cliente" ? await buyerIdFor(session) : null;
  const view = {
    scope,
    compradorId: session.role === "cliente" ? compradorId : (opts.compradorId ?? null),
  };

  if (session.role === "vendedor" && scope === "privada") return [];
  if (session.role === "cliente" && !compradorId) return [];

  const supabase = await createServiceClient();
  let query = supabase.from("notas").select("*");
  if (opts.assetId) query = query.eq("asset_id", opts.assetId);

  if (session.role === "cliente") {
    query = query.eq("comprador_id", compradorId!);
  } else if (opts.compradorId) {
    query = query.eq("comprador_id", opts.compradorId);
  } else if (scope === "privada") {
    query = query.eq("scope", "privada").is("comprador_id", null);
  } else {
    query = query.eq("scope", "activo").is("comprador_id", null);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const visibilitySession = {
    role: session.role,
    userId: session.userId ?? null,
    nombre: session.nombre,
    compradorId,
  };
  return ((data ?? []) as NotaRow[]).filter((row) => canReadNota(visibilitySession, row, view));
}

export async function createNota(params: {
  assetId?: string;
  compradorId?: string;
  author: string;
  text: string;
  scope?: NotaScope;
}): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const compradorId = session.role === "cliente" ? await buyerIdFor(session) : null;
  const plan = planNotaInsert({
    role: session.role,
    userId: session.userId ?? null,
    nombre: session.nombre,
    compradorId,
    assetId: params.assetId,
    requestedCompradorId: params.compradorId,
    scope: params.scope ?? "activo",
    text: params.text,
  });
  if (!plan.ok) throw new Error(plan.error);

  const supabase = await createServiceClient();
  const { error } = await supabase.from("notas").insert(plan.row);
  if (error) throw new Error(error.message);
}

/**
 * Borra una nota individual. Solo el rol admin.
 *
 * Los agentes no pueden borrar notas (ni las suyas ni las de otros): hoy no
 * había borrado y se mantiene así. La fila se elimina en `public.notas` con
 * el cliente service-role, después de `requireAdmin()`, para que también
 * funcione con la cookie de demo (dev-auth), cuyo `auth.uid()` no pasa
 * `is_admin()`.
 */
export async function deleteNota(id: string): Promise<void> {
  await requireAdmin();
  const noteId = id.trim();
  if (!noteId) throw new Error("Nota no válida");

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("notas")
    .delete()
    .eq("id", noteId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nota no encontrada");
}
