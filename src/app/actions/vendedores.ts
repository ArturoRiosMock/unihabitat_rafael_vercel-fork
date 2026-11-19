"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rowToVendedor, vendedorToRow } from "@/lib/supabase/db";
import { getServerSession, requireAdmin } from "@/lib/auth-server";
import { asignacionReiniciaPlazo, canReadComprador } from "@/lib/comprador-gestion";
import { fetchAssignedVendedorId } from "@/lib/comprador-gestion-run";
import { createNotificacion } from "@/app/actions/notificaciones";
import { inviteAgenteByEmail } from "@/lib/auth/agente-invite";
import { nombreCompleto } from "@/lib/comprador-oferta";
import type { Vendedor } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Lectura                                                            */
/* ------------------------------------------------------------------ */

export async function fetchVendedores(): Promise<Vendedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToVendedor);
}

export async function fetchVendedorById(id: string): Promise<Vendedor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToVendedor(data) : null;
}

/* ------------------------------------------------------------------ */
/*  Mutaciones (CRUD)                                                  */
/* ------------------------------------------------------------------ */

function deriveInitials(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  );
}

export interface VendedorInput {
  /** Si no se pasa, se genera un id estable a partir del email/nombre. */
  id?: string;
  nombre: string;
  email?: string;
  tel?: string;
  cartera?: string;
  estado?: string;
  estadoC?: string;
  col?: string;
  ini?: string;
}

export interface CreateVendedorResult {
  vendedor: Vendedor;
  /** Estado de la invitación: 'sent' = email enviado; 'skipped' = sin email;
   *  'reused' = el usuario ya tenía cuenta (también se reenvía recovery);
   *  'failed' = no se pudo enviar (ver `inviteError`). */
  invite: "sent" | "reused" | "skipped" | "failed";
  inviteError?: string;
}

export async function createVendedor(
  input: VendedorInput,
): Promise<CreateVendedorResult> {
  await requireAdmin();
  const sb = await createServiceClient();

  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio");
  const id = (input.id ?? crypto.randomUUID()).trim();
  const ini = (input.ini || deriveInitials(nombre)).toUpperCase().slice(0, 2);

  const email = (input.email ?? "").trim().toLowerCase();

  let invite: CreateVendedorResult["invite"] = "skipped";
  let inviteError: string | undefined;
  let userId: string | null = null;

  if (email) {
    const result = await inviteAgenteByEmail({ email, nombre });
    userId = result.userId;
    if (result.ok) {
      invite = result.alreadyExisted ? "reused" : "sent";
    } else {
      invite = "failed";
      inviteError = result.error;
      console.warn("[vendedores.create] invitación falló:", result.error);
    }
  }

  const v: Vendedor = {
    id,
    nombre,
    ini,
    col: input.col || "#2563a8,#0d2a4a",
    cartera: input.cartera || "",
    activo: "",
    agente: "Admin",
    tel: input.tel || "",
    email,
    ultimo: "",
    estado: input.estado || "Activo",
    estadoC: input.estadoC || "fp-pub",
  };

  const baseRow = vendedorToRow(v);
  const row = { ...baseRow, ...(userId ? { user_id: userId } : {}) };
  let { error } = await sb
    .from("vendedores")
    .upsert(row, { onConflict: "id", ignoreDuplicates: false });

  if (error && userId && /user_id/i.test(error.message) && /column|schema cache/i.test(error.message)) {
    console.warn("[vendedores] tabla sin columna user_id; reintentando sin ella. Aplica supabase-migration-agentes.sql para vincular agente↔auth.users.");
    ({ error } = await sb
      .from("vendedores")
      .upsert(baseRow, { onConflict: "id", ignoreDuplicates: false }));
  }

  if (error) throw new Error(error.message);
  return { vendedor: v, invite, inviteError };
}

/**
 * Reenvía un nuevo enlace seguro al email del agente para que (re)defina su
 * contraseña. Crea la cuenta de Auth si no existía. Devuelve detalle del
 * resultado para que la UI pueda mostrarlo.
 */
export interface ReinviteVendedorResult {
  ok: boolean;
  message: string;
  alreadyExisted: boolean;
}

export async function reinviteVendedor(
  vendedorId: string,
): Promise<ReinviteVendedorResult> {
  await requireAdmin();
  const sb = await createServiceClient();

  const { data: vRow, error: vErr } = await sb
    .from("vendedores")
    .select("email, nombre")
    .eq("id", vendedorId)
    .maybeSingle();

  if (vErr) {
    return { ok: false, message: vErr.message, alreadyExisted: false };
  }
  if (!vRow) {
    return { ok: false, message: "Agente no encontrado.", alreadyExisted: false };
  }
  const email = ((vRow.email as string | undefined) ?? "").trim().toLowerCase();
  const nombre = ((vRow.nombre as string | undefined) ?? "").trim();
  if (!email) {
    return {
      ok: false,
      message: "Este agente no tiene email. Añádelo antes de reenviar la invitación.",
      alreadyExisted: false,
    };
  }

  const result = await inviteAgenteByEmail({ email, nombre, isReinvite: true });

  if (result.userId) {
    try {
      await sb
        .from("vendedores")
        .update({ user_id: result.userId })
        .eq("id", vendedorId);
    } catch {
      /* columna user_id puede no existir; ignoramos */
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      message: result.error ?? "No se pudo reenviar la invitación.",
      alreadyExisted: result.alreadyExisted,
    };
  }

  return {
    ok: true,
    message: result.alreadyExisted
      ? `Nuevo enlace seguro enviado a ${email}.`
      : `Cuenta creada y enlace de bienvenida enviado a ${email}.`,
    alreadyExisted: result.alreadyExisted,
  };
}

export async function updateVendedor(
  id: string,
  patch: Partial<VendedorInput>,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {};
  if (patch.nombre != null) {
    row.nombre = patch.nombre.trim();
    row.ini = (patch.ini || deriveInitials(patch.nombre)).toUpperCase().slice(0, 2);
  }
  if (patch.email != null) row.email = patch.email.trim().toLowerCase();
  if (patch.tel != null) row.tel = patch.tel;
  if (patch.cartera != null) row.cartera = patch.cartera;
  if (patch.estado != null) row.estado = patch.estado;
  if (patch.estadoC != null) row.estado_c = patch.estadoC;
  if (patch.col != null) row.col = patch.col;

  // Re-vincular user_id si cambió el email.
  if (patch.email != null) {
    try {
      const email = (patch.email ?? "").trim().toLowerCase();
      if (email) {
        const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        const u = data?.users?.find((x) => (x.email || "").toLowerCase() === email);
        row.user_id = u?.id ?? null;
      } else {
        row.user_id = null;
      }
    } catch {
      /* admin API no disponible — dejamos el user_id como estaba */
    }
  }

  let { error } = await sb.from("vendedores").update(row).eq("id", id);
  if (error && "user_id" in row && /user_id/i.test(error.message) && /column|schema cache/i.test(error.message)) {
    console.warn("[vendedores] tabla sin columna user_id; reintentando update sin ella.");
    const { user_id: _omit, ...rowNoUserId } = row;
    ({ error } = await sb.from("vendedores").update(rowNoUserId).eq("id", id));
  }
  if (error) throw new Error(error.message);
}

export async function deleteVendedor(id: string): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const { error } = await sb.from("vendedores").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/*  Asignaciones (agente ↔ comprador / agente ↔ activo)                */
/* ------------------------------------------------------------------ */

/**
 * Resuelve el `auth.users.id` de un agente para emitir notificaciones.
 * Devuelve `null` si el agente todavía no se ha registrado en Supabase Auth.
 */
async function resolveAgenteUserId(
  vendedorId: string,
): Promise<{ userId: string | null; nombre: string; email: string }> {
  const sb = await createServiceClient();
  const { data: vRow } = await sb
    .from("vendedores")
    .select("user_id, email, nombre")
    .eq("id", vendedorId)
    .maybeSingle();

  const nombre = (vRow?.nombre as string | undefined) ?? "Agente";
  const email = (vRow?.email as string | undefined) ?? "";
  let userId = (vRow?.user_id as string | undefined) ?? null;

  if (!userId && email) {
    try {
      const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = data?.users?.find(
        (x) => (x.email || "").toLowerCase() === email.toLowerCase(),
      );
      userId = u?.id ?? null;
      if (userId) {
        await sb.from("vendedores").update({ user_id: userId }).eq("id", vendedorId);
      }
    } catch {
      /* admin API caída — sin notificación esta vez */
    }
  }

  return { userId, nombre, email };
}

async function notifyAgente(params: {
  vendedorId: string;
  tipo: "asignacion_comprador" | "asignacion_activo" | "desasignacion";
  mensaje: string;
  referenciaId: string;
}): Promise<void> {
  const { userId, nombre, email } = await resolveAgenteUserId(params.vendedorId);
  if (!userId) return; // sin user vinculado; la notificación no se entrega
  await createNotificacion({
    userId,
    tipo: params.tipo,
    mensaje: params.mensaje,
    referenciaId: params.referenciaId,
    email: email || undefined,
    recipientName: nombre,
  });
}

/**
 * Asigna un comprador a un agente. Es una operación "set" (no acumulativa):
 * limpia asignaciones previas del comprador y deja solo al nuevo agente.
 * Esto refleja la regla de negocio actual ("un comprador, un agente"); si
 * más adelante se permite multi-agente, sustituir por simple insert.
 */
export async function setCompradorAgente(
  compradorId: string,
  vendedorId: string | null,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const previous = await fetchAssignedVendedorId(sb, compradorId);
  if (previous === vendedorId) return;

  // 1. Limpiamos asignaciones previas del comprador.
  await sb.from("vendedor_compradores").delete().eq("comprador_id", compradorId);

  // 2. Si vendedorId es null el comprador vuelve a ser del gestor.
  if (!vendedorId) {
    await sb
      .from("compradores")
      .update({ agente: "Admin" })
      .eq("id", compradorId);
    return;
  }

  // 3. Insertamos la nueva relación + actualizamos el campo legacy
  //    `compradores.agente` (texto libre) para que la UI antigua siga
  //    mostrando el nombre.
  const { data: vRow } = await sb
    .from("vendedores")
    .select("nombre")
    .eq("id", vendedorId)
    .maybeSingle();
  const agenteNombre = (vRow?.nombre as string | undefined) || "Agente";

  const { error: insErr } = await sb
    .from("vendedor_compradores")
    .insert({ vendedor_id: vendedorId, comprador_id: compradorId });
  if (insErr) throw new Error(insErr.message);

  const compradorPatch: Record<string, string> = { agente: agenteNombre };
  if (asignacionReiniciaPlazo(previous, vendedorId)) {
    compradorPatch.ultima_gestion_agente_at = new Date().toISOString();
  }
  const { error: updErr } = await sb
    .from("compradores")
    .update(compradorPatch)
    .eq("id", compradorId);
  if (updErr) throw new Error(updErr.message);

  // 4. Notificación al agente.
  const { data: cRow } = await sb
    .from("compradores")
    .select("nombre, apellidos, email")
    .eq("id", compradorId)
    .maybeSingle();
  const compradorNombre = nombreCompleto(
    cRow?.nombre as string | undefined,
    cRow?.apellidos as string | undefined,
  ) || "un comprador";
  await notifyAgente({
    vendedorId,
    tipo: "asignacion_comprador",
    mensaje: `Te han asignado al comprador ${compradorNombre}.`,
    referenciaId: compradorId,
  });
}

/**
 * Asigna un activo a un agente como agente principal. Igual que
 * `setCompradorAgente`, sustituye la asignación previa.
 */
export async function setAssetAgente(
  assetId: string,
  vendedorId: string | null,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();

  await sb.from("vendedor_assets").delete().eq("asset_id", assetId);

  if (!vendedorId) {
    await sb.from("assets").update({ age: "" }).eq("id", assetId);
    return;
  }

  const { data: vRow } = await sb
    .from("vendedores")
    .select("nombre")
    .eq("id", vendedorId)
    .maybeSingle();
  const agenteNombre = (vRow?.nombre as string | undefined) || "Agente";

  const { error: insErr } = await sb
    .from("vendedor_assets")
    .insert({ vendedor_id: vendedorId, asset_id: assetId });
  if (insErr) throw new Error(insErr.message);

  await sb.from("assets").update({ age: agenteNombre }).eq("id", assetId);

  await notifyAgente({
    vendedorId,
    tipo: "asignacion_activo",
    mensaje: `Te han asignado el activo ${assetId}.`,
    referenciaId: assetId,
  });
}

/**
 * Lee el agente principal asignado a un comprador (o null).
 */
export async function getCompradorAgente(
  compradorId: string,
): Promise<string | null> {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && session.role !== "vendedor")) {
    throw new Error("Acceso denegado");
  }
  const sb = await createServiceClient();
  const assigned = await fetchAssignedVendedorId(sb, compradorId);
  if (
    !canReadComprador(
      { role: session.role, vendedorId: session.vendedorId ?? null },
      assigned,
    )
  ) {
    throw new Error("Solo el agente asignado puede ver este comprador");
  }
  return assigned;
}

export async function getAssetAgente(
  assetId: string,
): Promise<string | null> {
  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("vendedor_assets")
    .select("vendedor_id")
    .eq("asset_id", assetId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.vendedor_id as string | undefined) ?? null;
}
