"use server";

import { getServerSession } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import {
  canReadCompradorComentarios,
  planCompradorComentarioInsert,
  type CompradorComentario,
} from "@/lib/comprador-comentarios";
import { createServiceClient } from "@/lib/supabase/server";

interface ComentarioStored {
  id: string;
  comprador_id: string;
  author: string | null;
  author_role: string | null;
  text: string;
  created_at: string;
}

function presentComentario(row: ComentarioStored): CompradorComentario {
  return {
    id: row.id,
    compradorId: row.comprador_id,
    author: displayCommentAuthor({ author: row.author, authorRole: row.author_role }),
    authorRole: row.author_role,
    text: row.text,
    createdAt: row.created_at,
  };
}

async function assignedVendedorId(compradorId: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("vendedor_compradores")
    .select("vendedor_id")
    .eq("comprador_id", compradorId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.vendedor_id as string | undefined) ?? null;
}

/**
 * Historial de llamadas y acciones de un comprador, más reciente primero.
 * Admin ve todos. El agente solo el comprador que gestiona.
 */
export async function fetchCompradorComentarios(compradorId: string): Promise<CompradorComentario[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const id = compradorId.trim();
  if (!id) throw new Error("Comprador no válido");

  const assigned = await assignedVendedorId(id);
  if (
    !canReadCompradorComentarios({
      role: session.role,
      vendedorId: session.vendedorId ?? null,
      assignedVendedorId: assigned,
    })
  ) {
    throw new Error(
      session.role === "vendedor"
        ? "Solo el agente asignado puede comentar este comprador"
        : "Acceso denegado",
    );
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("comprador_comentarios")
    .select("id, comprador_id, author, author_role, text, created_at")
    .eq("comprador_id", id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ComentarioStored[]).map(presentComentario);
}

/** Alta de un comentario de llamada o acción. El autor sale de la sesión. */
export async function createCompradorComentario(compradorId: string, text: string): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const id = compradorId.trim();
  if (!id) throw new Error("Comprador no válido");

  const assigned = await assignedVendedorId(id);
  const plan = planCompradorComentarioInsert({
    role: session.role,
    userId: session.userId ?? null,
    nombre: session.nombre,
    vendedorId: session.vendedorId ?? null,
    assignedVendedorId: assigned,
    compradorId: id,
    text,
  });
  if (!plan.ok) throw new Error(plan.error);

  const supabase = await createServiceClient();
  const { error } = await supabase.from("comprador_comentarios").insert(plan.row);
  if (error) throw new Error(error.message);
}
