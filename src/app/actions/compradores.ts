"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rowToComprador, compradorToRow } from "@/lib/supabase/db";
import type { Comprador, CompradorAcceso } from "@/lib/types";
import { actionError, type ActionResult } from "@/lib/action-result";
import { getServerSession, requireAdmin, requireAdminOrVendor } from "@/lib/auth-server";
import type { UserSession } from "@/lib/permissions";
import {
  canReadComprador,
  planCompradorCreate,
  planCompradorUpdate,
  type CompradorActor,
  type CompradorFieldInput,
} from "@/lib/comprador-gestion";
import {
  datosFirmaFromRow,
  inicialesComprador,
  normalizarDatosFirma,
  patchDatosFirma,
  splitNombreCompleto,
  type DatosFirma,
} from "@/lib/comprador-oferta";
import {
  fetchAssignedVendedorId,
  runReasignacionInactividad,
} from "@/lib/comprador-gestion-run";
import type { SupabaseClient } from "@supabase/supabase-js";

function actorOf(session: UserSession): CompradorActor {
  return { role: session.role, vendedorId: session.vendedorId ?? null };
}

async function assignmentMap(
  sb: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await sb
    .from("vendedor_compradores")
    .select("comprador_id, vendedor_id, assigned_at")
    .in("comprador_id", ids)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const compradorId = row.comprador_id as string;
    if (!map.has(compradorId)) map.set(compradorId, row.vendedor_id as string);
  }
  return map;
}

function presentComprador(row: Record<string, unknown>, agenteId: string | null): Comprador {
  return { ...rowToComprador(row), agenteId };
}

async function reassignQuietly(sb: SupabaseClient): Promise<void> {
  try {
    await runReasignacionInactividad(sb);
  } catch (err) {
    console.error("[compradores] reasignación de inactividad omitida:", err);
  }
}

/**
 * Admin: todos los compradores. Agente: solo los que tiene asignados.
 * Antes de leer, aplica la regla de 90 días (además del cron).
 * Cliente y anónimo reciben lista vacía: esta ficha no es del portal.
 */
export async function fetchCompradores(): Promise<Comprador[]> {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && session.role !== "vendedor")) return [];
  if (session.role === "vendedor" && !session.vendedorId) return [];

  const sb = await createServiceClient();
  await reassignQuietly(sb);

  let query = sb.from("compradores").select("*").order("created_at", { ascending: false });
  if (session.role === "vendedor") {
    const { data: links, error: linkErr } = await sb
      .from("vendedor_compradores")
      .select("comprador_id")
      .eq("vendedor_id", session.vendedorId);
    if (linkErr) throw new Error(linkErr.message);
    const ids = (links ?? []).map((row) => row.comprador_id as string);
    if (ids.length === 0) return [];
    query = sb.from("compradores").select("*").in("id", ids).order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const agents = await assignmentMap(sb, rows.map((row) => row.id as string));
  return rows.map((row) => presentComprador(row, agents.get(row.id as string) ?? null));
}

export async function fetchCompradorById(id: string): Promise<Comprador | null> {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && session.role !== "vendedor")) return null;

  const sb = await createServiceClient();
  const assigned = await fetchAssignedVendedorId(sb, id);
  if (!canReadComprador(actorOf(session), assigned)) return null;

  const { data, error } = await sb.from("compradores").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? presentComprador(data, assigned) : null;
}

export async function fetchCompradorByEmail(email: string): Promise<Comprador | null> {
  const supabase = await createClient();
  const trimmed = email.trim();
  const { data, error } = await supabase
    .from("compradores")
    .select("*")
    .ilike("email", trimmed)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToComprador(data) : null;
}

/**
 * Resuelve `auth.users.id` por email vía Admin API (best-effort).
 * Devuelve null si el usuario no existe en Auth o si la API admin no está disponible.
 */
async function resolveAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  try {
    const sb = await createServiceClient();
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = data?.users?.find((x) => (x.email || "").toLowerCase() === target);
    return u?.id ?? null;
  } catch {
    return null;
  }
}

/** Crea un registro de comprador si no existe (portal público / dev-auth sin fila en BD). */
export async function ensureCompradorForEmail(
  email: string,
  nombre: string,
  apellidos?: string,
): Promise<string> {
  const existing = await fetchCompradorByEmail(email);
  const userId = await resolveAuthUserIdByEmail(email);

  if (existing) {
    if (userId) {
      const sb = await createServiceClient();
      const { data: row } = await sb
        .from("compradores")
        .select("user_id")
        .eq("id", existing.id)
        .maybeSingle();
      if (!row?.user_id) {
        await sb.from("compradores").update({ user_id: userId }).eq("id", existing.id);
      }
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  const partes = apellidos != null
    ? { nombre: nombre.trim(), apellidos: apellidos.trim() }
    : splitNombreCompleto(nombre);
  const nombrePila = partes.nombre || "Usuario";
  const c: Comprador = {
    id,
    nombre: nombrePila,
    apellidos: partes.apellidos,
    tipoPersona: "fisica",
    razonSocial: "",
    documento: "",
    direccion: "",
    cp: "",
    poblacion: "",
    provincia: "",
    pais: "España",
    ini: inicialesComprador(nombrePila, partes.apellidos),
    col: "#2563a8,#0d2a4a",
    tipo: "Free",
    agente: "Admin",
    email: email.trim(),
    tel: "",
    intereses: "",
    presupuesto: "",
    activos: "0",
    actividad: "",
    estado: "Nuevo",
    estadoC: "fp-nd",
    nda: "Pendiente",
    // Oferta/portal no abre el área privada; solo admin activa acceso.
    acceso: "sin_acceso",
  };
  await upsertComprador(c);
  if (userId) {
    const sb = await createServiceClient();
    await sb.from("compradores").update({ user_id: userId }).eq("id", id);
  }
  return id;
}

export async function upsertComprador(c: Comprador): Promise<void> {
  const supabase = await createClient();
  const row = compradorToRow(c);
  const { error } = await supabase
    .from("compradores")
    .upsert(row, { onConflict: "id", ignoreDuplicates: false });
  if (error) throw new Error(error.message);
}

export async function createComprador(input: {
  nombre: string;
  apellidos?: string;
  email: string;
  tel?: string;
  tipo?: "Privado" | "Free";
  agente?: string;
  acceso?: CompradorAcceso;
}): Promise<Comprador> {
  const session = await requireAdminOrVendor();
  const plan = planCompradorCreate(actorOf(session), input, session.nombre);
  if (!plan.ok) throw new Error(plan.error);

  const sb = await createServiceClient();
  const { data: existing, error: existingErr } = await sb
    .from("compradores")
    .select("id")
    .ilike("email", plan.email)
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing) throw new Error("Ya existe un comprador con ese email");

  const now = new Date().toISOString();

  const c: Comprador = {
    id: crypto.randomUUID(),
    nombre: plan.nombre,
    apellidos: plan.apellidos,
    tipoPersona: "fisica",
    razonSocial: "",
    documento: "",
    direccion: "",
    cp: "",
    poblacion: "",
    provincia: "",
    pais: "España",
    ini: inicialesComprador(plan.nombre, plan.apellidos),
    col: "#2563a8,#0d2a4a",
    tipo: input.tipo ?? "Privado",
    agente: plan.agenteNombre,
    email: plan.email,
    tel: input.tel?.trim() || "",
    intereses: "",
    presupuesto: "",
    activos: "0",
    actividad: "",
    estado: "Nuevo",
    estadoC: "fp-nd",
    nda: "Pendiente",
    acceso: plan.acceso,
    ultimaGestionAgenteAt: plan.renewsGestion ? now : null,
    agenteId: plan.assignVendedorId,
  };
  const { error } = await sb.from("compradores").insert({
    ...compradorToRow(c),
    ...(plan.renewsGestion ? { ultima_gestion_agente_at: now } : {}),
  });
  if (error) throw new Error(error.message);

  if (plan.assignVendedorId) {
    const { error: linkErr } = await sb.from("vendedor_compradores").insert({
      vendedor_id: plan.assignVendedorId,
      comprador_id: c.id,
    });
    if (linkErr) throw new Error(linkErr.message);
  }
  return c;
}

export async function updateCompradorFields(
  id: string,
  fields: CompradorFieldInput,
): Promise<ActionResult> {
  try {
    const session = await requireAdminOrVendor();
    if (!id || Object.keys(fields).length === 0) return { ok: true };

    const sb = await createServiceClient();
    const assigned = await fetchAssignedVendedorId(sb, id);
    const plan = planCompradorUpdate(actorOf(session), assigned, fields);
    if (!plan.ok) {
      return {
        ok: false,
        error: plan.error === "Solo el agente asignado puede editar este comprador"
          ? "No tienes acceso a este comprador"
          : plan.error,
      };
    }
    if (Object.keys(plan.patch).length === 0) return { ok: true };

    const row: Record<string, string> = { ...plan.patch };
    if (plan.renewsGestion) row.ultima_gestion_agente_at = new Date().toISOString();
    const { error } = await sb.from("compradores").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return actionError(err, "No se pudo guardar la ficha");
  }
}

/**
 * El comprador actualiza su propia ficha de firma.
 * El email queda anclado a la cuenta: no se puede cambiar desde el portal.
 */
export async function updateMisDatosComprador(datos: DatosFirma): Promise<ActionResult> {
  try {
    const session = await getServerSession();
    if (!session?.email || session.role !== "cliente") {
      return { ok: false, error: "Acceso denegado" };
    }

    const sb = await createServiceClient();
    const { data, error } = await sb
      .from("compradores")
      .select("*")
      .ilike("email", session.email.trim())
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Comprador no encontrado" };

    const stored = datosFirmaFromRow(data);
    const next = normalizarDatosFirma({ ...datos, email: stored.email });
    const patch = patchDatosFirma(stored, next);
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error: updateError } = await sb.from("compradores").update(patch).eq("id", data.id);
    if (updateError) return { ok: false, error: updateError.message };
    return { ok: true };
  } catch (err) {
    return actionError(err, "No se pudieron guardar los datos");
  }
}

export async function setCompradorAcceso(id: string, acceso: CompradorAcceso): Promise<ActionResult> {
  return updateCompradorFields(id, { acceso });
}

/** Comprador de la sesión actual: cookie dev-auth o usuario Supabase. */
export async function fetchCompradorDeSesion(): Promise<Comprador | null> {
  const session = await getServerSession();
  if (!session?.email) return null;
  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("compradores")
    .select("*")
    .ilike("email", session.email.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToComprador(data) : null;
}

export async function deleteComprador(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;
  const sb = await createServiceClient();
  const { error } = await sb.from("compradores").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
