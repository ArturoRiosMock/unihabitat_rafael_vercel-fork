"use server";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getServerSession } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import {
  canReadCompradorComentarios,
  planCompradorComentarioInsert,
  type CompradorComentario,
} from "@/lib/comprador-comentarios";
import { eventoRenuevaGestion } from "@/lib/comprador-gestion";
import { touchUltimaGestionAgente } from "@/lib/comprador-gestion-run";
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
export async function fetchCompradorComentarios(
  compradorId: string,
): Promise<ActionResult<{ comentarios: CompradorComentario[] }>> {
  try {
    const session = await getServerSession();
    if (!session) return { ok: false, error: "Acceso denegado" };

    const id = compradorId.trim();
    if (!id) return { ok: false, error: "Comprador no válido" };

    const assigned = await assignedVendedorId(id);
    if (
      !canReadCompradorComentarios({
        role: session.role,
        vendedorId: session.vendedorId ?? null,
        assignedVendedorId: assigned,
      })
    ) {
      return {
        ok: false,
        error: session.role === "vendedor"
          ? "No tienes acceso a este comprador"
          : "Acceso denegado",
      };
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("comprador_comentarios")
      .select("id, comprador_id, author, author_role, text, created_at")
      .eq("comprador_id", id)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, comentarios: ((data ?? []) as ComentarioStored[]).map(presentComentario) };
  } catch (err) {
    return actionError(err, "No se pudieron cargar los comentarios");
  }
}

/** Alta de un comentario de llamada o acción. El autor sale de la sesión. */
export async function createCompradorComentario(
  compradorId: string,
  text: string,
): Promise<ActionResult> {
  try {
    const session = await getServerSession();
    if (!session) return { ok: false, error: "Acceso denegado" };

    const id = compradorId.trim();
    if (!id) return { ok: false, error: "Comprador no válido" };

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
    if (!plan.ok) {
      return {
        ok: false,
        error: plan.error === "Solo el agente asignado puede comentar este comprador"
          ? "No tienes acceso a este comprador"
          : plan.error,
      };
    }

    const supabase = await createServiceClient();
    const { error } = await supabase.from("comprador_comentarios").insert(plan.row);
    if (error) return { ok: false, error: error.message };

    if (
      eventoRenuevaGestion({
        evento: "comentario",
        actor: { role: session.role, vendedorId: session.vendedorId ?? null },
        assignedVendedorId: assigned,
      })
    ) {
      await touchUltimaGestionAgente(supabase, id);
    }
    return { ok: true };
  } catch (err) {
    return actionError(err, "No se pudo guardar el comentario");
  }
}
