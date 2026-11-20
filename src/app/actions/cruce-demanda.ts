"use server";

import { actionError, type ActionResult } from "@/lib/action-result";
import { getServerSession } from "@/lib/auth-server";
import { displayCommentAuthor } from "@/lib/comment-author";
import { fetchAssignedVendedorId, touchUltimaGestionAgente } from "@/lib/comprador-gestion-run";
import { enviosRecientesDe, mensajeYaEnviado } from "@/lib/comprador-envios";
import {
  demandaVacia,
  normalizarDemanda,
  puedeBuscarOportunidades,
  puedeEditarDemanda,
  puedeLanzarCruce,
  puedeLeerDemanda,
  puedeMarcarEstado,
  type ActorCruce,
  type DemandaComprador,
  type DemandaInput,
  type EjecucionCruce,
  type EncajeComprador,
  type EstadoOportunidad,
  type FichaPublicaOportunidad,
  type NivelCruce,
  type OportunidadVista,
} from "@/lib/cruce-demanda";
import {
  deleteDemanda,
  fetchActivoParaCruce,
  fetchUltimaEjecucion,
  insertDemanda,
  listarEncajeActivo,
  listDemandasComprador,
  listEnviosComprador,
  listOportunidadesVista,
  runCruceDemanda,
  setEstadoDemanda,
} from "@/lib/cruce-demanda-run";
import type { UserSession } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function actorDe(session: UserSession, compradorId: string | null): ActorCruce {
  return {
    role: session.role,
    vendedorId: session.vendedorId ?? null,
    compradorId,
  };
}

async function compradorIdDeSesion(
  sb: SupabaseClient,
  session: UserSession,
): Promise<string | null> {
  if (session.compradorId) return session.compradorId;
  if (!session.email) return null;
  const { data, error } = await sb
    .from("compradores")
    .select("id")
    .ilike("email", session.email.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

async function contexto(compradorId: string): Promise<
  | { ok: false; error: string }
  | { ok: true; sb: SupabaseClient; actor: ActorCruce; assigned: string | null }
> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "Acceso denegado" };
  const sb = await createServiceClient();
  const propio = session.role === "cliente" ? await compradorIdDeSesion(sb, session) : null;
  const assigned = session.role === "vendedor" ? await fetchAssignedVendedorId(sb, compradorId) : null;
  return { ok: true, sb, actor: actorDe(session, propio), assigned };
}

export async function fetchDemandaComprador(
  compradorId: string,
): Promise<ActionResult<{ demanda: DemandaComprador; demandas: DemandaComprador[] }>> {
  try {
    const ctx = await contexto(compradorId);
    if (!ctx.ok) return ctx;
    if (!puedeLeerDemanda(ctx.actor, compradorId, ctx.assigned)) {
      return { ok: false, error: "No tienes acceso a este comprador" };
    }
    const demandas = await listDemandasComprador(ctx.sb, compradorId);
    const activa = demandas.find((demanda) => demanda.estado !== "archivada") ?? demandaVacia(compradorId);
    return { ok: true, demanda: activa, demandas };
  } catch (err) {
    return actionError(err, "No se pudo cargar la demanda");
  }
}

export async function guardarDemandaComprador(
  compradorId: string,
  input: DemandaInput,
): Promise<ActionResult<{ demanda: DemandaComprador; demandas: DemandaComprador[] }>> {
  try {
    const ctx = await contexto(compradorId);
    if (!ctx.ok) return ctx;
    if (!puedeEditarDemanda(ctx.actor, compradorId, ctx.assigned)) {
      return { ok: false, error: "No tienes acceso a este comprador" };
    }
    const plan = normalizarDemanda(compradorId, input);
    if (!plan.ok) return plan;
    const session = await getServerSession();
    const autor = displayCommentAuthor({
      author: session?.nombre,
      authorRole: session?.role,
    });
    const demanda = await insertDemanda(ctx.sb, plan.demanda, {
      nombre: autor,
      rol: session?.role ?? "admin",
    });
    if (ctx.actor.role === "vendedor" && ctx.actor.vendedorId === ctx.assigned) {
      await touchUltimaGestionAgente(ctx.sb, compradorId);
    }
    const demandas = await listDemandasComprador(ctx.sb, compradorId);
    return { ok: true, demanda, demandas };
  } catch (err) {
    return actionError(err, "No se pudo guardar la demanda");
  }
}

async function demandaDelComprador(
  compradorId: string,
  demandaId: string,
): Promise<
  | { ok: false; error: string }
  | { ok: true; sb: SupabaseClient; actor: ActorCruce; assigned: string | null }
> {
  const ctx = await contexto(compradorId);
  if (!ctx.ok) return ctx;
  if (!puedeEditarDemanda(ctx.actor, compradorId, ctx.assigned)) {
    return { ok: false, error: "No tienes acceso a este comprador" };
  }
  const demandas = await listDemandasComprador(ctx.sb, compradorId);
  if (!demandas.some((demanda) => demanda.id === demandaId)) {
    return { ok: false, error: "Demanda no encontrada" };
  }
  return ctx;
}

export async function archivarDemandaComprador(
  compradorId: string,
  demandaId: string,
): Promise<ActionResult<{ demandas: DemandaComprador[] }>> {
  try {
    const ctx = await demandaDelComprador(compradorId, demandaId);
    if (!ctx.ok) return ctx;
    await setEstadoDemanda(ctx.sb, demandaId, "archivada");
    const demandas = await listDemandasComprador(ctx.sb, compradorId);
    return { ok: true, demandas };
  } catch (err) {
    return actionError(err, "No se pudo archivar la demanda");
  }
}

export async function borrarDemandaComprador(
  compradorId: string,
  demandaId: string,
): Promise<ActionResult<{ demandas: DemandaComprador[] }>> {
  try {
    const ctx = await demandaDelComprador(compradorId, demandaId);
    if (!ctx.ok) return ctx;
    await deleteDemanda(ctx.sb, demandaId);
    const demandas = await listDemandasComprador(ctx.sb, compradorId);
    return { ok: true, demandas };
  } catch (err) {
    return actionError(err, "No se pudo borrar la demanda");
  }
}

export async function fetchOportunidadesComprador(
  compradorId: string,
): Promise<ActionResult<{ oportunidades: OportunidadVista[] }>> {
  try {
    const ctx = await contexto(compradorId);
    if (!ctx.ok) return ctx;
    if (!puedeLeerDemanda(ctx.actor, compradorId, ctx.assigned)) {
      return { ok: false, error: "No tienes acceso a este comprador" };
    }
    const oportunidades = await listOportunidadesVista(ctx.sb, compradorId);
    return { ok: true, oportunidades };
  } catch (err) {
    return actionError(err, "No se pudieron cargar las oportunidades");
  }
}

async function cruceDeUno(
  compradorId: string,
  registrar: boolean,
  confirmarReenvio: boolean,
): Promise<ActionResult<{
  nivel: NivelCruce | null;
  fichas: FichaPublicaOportunidad[];
  email: "enviado" | "omitido" | "error" | "desactivado";
  requiereConfirmacion: boolean;
  avisos: Array<{ assetId: string; enviadoAt: string; mensaje: string }>;
}>> {
  const ctx = await contexto(compradorId);
  if (!ctx.ok) return ctx;
  if (!puedeBuscarOportunidades(ctx.actor, ctx.assigned)) {
    return { ok: false, error: "No tienes acceso a este comprador" };
  }
  const session = await getServerSession();
  const enviadoPor = displayCommentAuthor({ author: session?.nombre, authorRole: session?.role });
  if (registrar && !confirmarReenvio) {
    const previo = await runCruceDemanda(ctx.sb, {
      origen: "manual",
      registrar: false,
      soloCompradorId: compradorId,
      emailEnabled: false,
      excluirRecientes: false,
    });
    const detallePrevio = previo.detalles[0];
    const assetIds = detallePrevio?.assetIds ?? [];
    const envios = await listEnviosComprador(ctx.sb, compradorId);
    const recientes = enviosRecientesDe(
      envios.map((envio) => ({ assetId: envio.assetId, enviadoAt: envio.enviadoAt })),
      assetIds,
      new Date(),
    );
    if (recientes.length > 0) {
      return {
        ok: true,
        nivel: detallePrevio?.nivel ?? null,
        fichas: detallePrevio?.fichas ?? [],
        email: "desactivado",
        requiereConfirmacion: true,
        avisos: recientes.map((envio) => ({
          assetId: envio.assetId,
          enviadoAt: envio.enviadoAt,
          mensaje: mensajeYaEnviado(envio.enviadoAt),
        })),
      };
    }
  }
  const resultado = await runCruceDemanda(ctx.sb, {
    origen: "manual",
    registrar,
    soloCompradorId: compradorId,
    enviadoPor,
    excluirRecientes: false,
  });
  if (registrar && ctx.actor.role === "vendedor" && ctx.actor.vendedorId === ctx.assigned) {
    await touchUltimaGestionAgente(ctx.sb, compradorId);
  }
  const detalle = resultado.detalles[0];
  if (detalle?.omitidoPorCupo) {
    return { ok: false, error: "Esta semana ya se han enviado 2 avisos a este comprador" };
  }
  return {
    ok: true,
    nivel: detalle?.nivel ?? null,
    fichas: detalle?.fichas ?? [],
    email: detalle?.email ?? "desactivado",
    requiereConfirmacion: false,
    avisos: [],
  };
}

/** Previsualiza el cruce de un comprador sin registrar ni enviar email. */
export async function buscarOportunidadesComprador(
  compradorId: string,
): Promise<ActionResult<{
  nivel: NivelCruce | null;
  fichas: FichaPublicaOportunidad[];
  email: "enviado" | "omitido" | "error" | "desactivado";
  requiereConfirmacion: boolean;
  avisos: Array<{ assetId: string; enviadoAt: string; mensaje: string }>;
}>> {
  try {
    return await cruceDeUno(compradorId, false, false);
  } catch (err) {
    return actionError(err, "No se pudo buscar oportunidades");
  }
}

/** Registra las oportunidades nuevas de un comprador. El email depende del flag. */
export async function registrarOportunidadesComprador(
  compradorId: string,
  confirmarReenvio = false,
): Promise<ActionResult<{
  nivel: NivelCruce | null;
  fichas: FichaPublicaOportunidad[];
  email: "enviado" | "omitido" | "error" | "desactivado";
  requiereConfirmacion: boolean;
  avisos: Array<{ assetId: string; enviadoAt: string; mensaje: string }>;
}>> {
  try {
    return await cruceDeUno(compradorId, true, confirmarReenvio);
  } catch (err) {
    return actionError(err, "No se pudieron registrar las oportunidades");
  }
}

export async function marcarOportunidadEstado(
  oportunidadId: string,
  estado: EstadoOportunidad,
): Promise<ActionResult> {
  try {
    const session = await getServerSession();
    if (!session) return { ok: false, error: "Acceso denegado" };
    if (!oportunidadId) return { ok: false, error: "Oportunidad no encontrada" };
    const sb = await createServiceClient();
    const { data, error } = await sb
      .from("comprador_oportunidades")
      .select("id, comprador_id")
      .eq("id", oportunidadId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Oportunidad no encontrada" };
    const compradorId = data.comprador_id as string;
    const propio = session.role === "cliente" ? await compradorIdDeSesion(sb, session) : null;
    const assigned = session.role === "vendedor" ? await fetchAssignedVendedorId(sb, compradorId) : null;
    const permiso = puedeMarcarEstado(actorDe(session, propio), compradorId, assigned, estado);
    if (!permiso.ok) return permiso;
    const { error: updateError } = await sb
      .from("comprador_oportunidades")
      .update({ estado })
      .eq("id", oportunidadId);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  } catch (err) {
    return actionError(err, "No se pudo actualizar el estado");
  }
}

export async function fetchCompradoresEncajeActivo(
  assetId: string,
): Promise<ActionResult<{ publicado: boolean; compradores: EncajeComprador[] }>> {
  try {
    const session = await getServerSession();
    if (!session || session.role !== "admin") {
      return { ok: false, error: "Solo el gestor puede ver el encaje de demanda" };
    }
    const sb = await createServiceClient();
    const activo = await fetchActivoParaCruce(sb, assetId);
    if (!activo) return { ok: false, error: "Activo no encontrado" };
    if (!activo.publicado) return { ok: true, publicado: false, compradores: [] };
    const compradores = await listarEncajeActivo(sb, activo);
    return { ok: true, publicado: true, compradores };
  } catch (err) {
    return actionError(err, "No se pudo calcular el encaje");
  }
}

export async function fetchUltimoCruceDemanda(): Promise<ActionResult<{ ejecucion: EjecucionCruce | null }>> {
  try {
    const session = await getServerSession();
    if (!session || !puedeLanzarCruce(actorDe(session, null))) {
      return { ok: false, error: "Solo el gestor puede ver el cruce de demanda" };
    }
    const sb = await createServiceClient();
    const ejecucion = await fetchUltimaEjecucion(sb);
    return { ok: true, ejecucion };
  } catch (err) {
    return actionError(err, "No se pudo cargar el último cruce");
  }
}

export async function lanzarCruceDemandaManual(): Promise<ActionResult<{ ejecucion: EjecucionCruce }>> {
  try {
    const session = await getServerSession();
    if (!session || !puedeLanzarCruce(actorDe(session, null))) {
      return { ok: false, error: "Solo el gestor puede lanzar el cruce de demanda" };
    }
    const sb = await createServiceClient();
    const resultado = await runCruceDemanda(sb, {
      origen: "manual",
      registrar: true,
      excluirRecientes: true,
      enviadoPor: displayCommentAuthor({ author: session.nombre, authorRole: session.role }),
    });
    return {
      ok: true,
      ejecucion: {
        origen: resultado.origen,
        compradores: resultado.compradores,
        conDemanda: resultado.conDemanda,
        oportunidades: resultado.oportunidades,
        porNivel: resultado.porNivel,
        emailsEnviados: resultado.emailsEnviados,
        emailsOmitidos: resultado.emailsOmitidos,
        createdAt: resultado.createdAt,
      },
    };
  } catch (err) {
    return actionError(err, "No se pudo lanzar el cruce");
  }
}
