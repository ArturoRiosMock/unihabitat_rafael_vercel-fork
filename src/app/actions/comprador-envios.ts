"use server";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getServerSession } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import { fetchAssignedVendedorId } from "@/lib/comprador-gestion-run";
import {
  enviosRecientesDe,
  esCanalEnvio,
  mensajeYaEnviado,
  textoConfirmacionReenvio,
  type CanalEnvio,
  type EnvioComprador,
} from "@/lib/comprador-envios";
import {
  puedeBuscarOportunidades,
  puedeLeerDemanda,
  type ActorCruce,
} from "@/lib/cruce-demanda";
import { insertarEnvios, listEnviosComprador } from "@/lib/cruce-demanda-run";
import type { UserSession } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const CANALES_MANUALES: CanalEnvio[] = ["manual", "email", "whatsapp"];

function actorDe(session: UserSession, compradorId: string | null): ActorCruce {
  return {
    role: session.role,
    vendedorId: session.vendedorId ?? null,
    compradorId,
  };
}

async function contexto(compradorId: string): Promise<
  | { ok: false; error: string }
  | { ok: true; sb: SupabaseClient; actor: ActorCruce; assigned: string | null; session: UserSession }
> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "Acceso denegado" };
  const sb = await createServiceClient();
  let propio: string | null = null;
  if (session.role === "cliente") {
    propio = session.compradorId ?? null;
    if (!propio && session.email) {
      const { data, error } = await sb
        .from("compradores")
        .select("id")
        .ilike("email", session.email.trim())
        .limit(1)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      propio = (data?.id as string | undefined) ?? null;
    }
  }
  const assigned = session.role === "vendedor" ? await fetchAssignedVendedorId(sb, compradorId) : null;
  return { ok: true, sb, actor: actorDe(session, propio), assigned, session };
}

export async function fetchEnviosComprador(
  compradorId: string,
): Promise<ActionResult<{ envios: EnvioComprador[] }>> {
  try {
    const ctx = await contexto(compradorId);
    if (!ctx.ok) return ctx;
    if (!puedeLeerDemanda(ctx.actor, compradorId, ctx.assigned)) {
      return { ok: false, error: "No tienes acceso a este comprador" };
    }
    const envios = await listEnviosComprador(ctx.sb, compradorId);
    return { ok: true, envios };
  } catch (err) {
    return actionError(err, "No se pudieron cargar los envíos");
  }
}

export async function registrarEnvioManual(input: {
  compradorId: string;
  assetId: string;
  canal: string;
  nota?: string;
  confirmar?: boolean;
}): Promise<ActionResult<{ requiereConfirmacion: boolean; mensaje: string }>> {
  try {
    const ctx = await contexto(input.compradorId);
    if (!ctx.ok) return ctx;
    if (!puedeBuscarOportunidades(ctx.actor, ctx.assigned)) {
      return { ok: false, error: "No tienes acceso a este comprador" };
    }
    const assetId = input.assetId.trim();
    if (!assetId) return { ok: false, error: "Indica el activo" };
    if (!esCanalEnvio(input.canal) || !CANALES_MANUALES.includes(input.canal)) {
      return { ok: false, error: "El canal no es válido" };
    }
    const { data: asset, error: assetError } = await ctx.sb
      .from("assets")
      .select("id")
      .eq("id", assetId)
      .maybeSingle();
    if (assetError) return { ok: false, error: assetError.message };
    if (!asset) return { ok: false, error: "Activo no encontrado" };

    const envios = await listEnviosComprador(ctx.sb, input.compradorId);
    const recientes = enviosRecientesDe(
      envios.map((envio) => ({ assetId: envio.assetId, enviadoAt: envio.enviadoAt })),
      [assetId],
      new Date(),
    );
    if (recientes.length > 0 && !input.confirmar) {
      return {
        ok: true,
        requiereConfirmacion: true,
        mensaje: textoConfirmacionReenvio(recientes) || mensajeYaEnviado(recientes[0].enviadoAt),
      };
    }

    const enviadoPor = displayCommentAuthor({
      author: ctx.session.nombre,
      authorRole: ctx.session.role,
    });
    await insertarEnvios(
      ctx.sb,
      input.compradorId,
      [assetId],
      [input.canal],
      enviadoPor,
      input.nota,
    );
    return { ok: true, requiereConfirmacion: false, mensaje: "Envío registrado" };
  } catch (err) {
    return actionError(err, "No se pudo registrar el envío");
  }
}
