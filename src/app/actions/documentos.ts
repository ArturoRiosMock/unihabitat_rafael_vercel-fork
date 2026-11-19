"use server";

import { headers } from "next/headers";
import { getServerSession } from "@/lib/auth-server";
import {
  canReadDocumento,
  canWriteDocumento,
  listAssetDocumentosDecision,
  readDocumentoDecision,
  type DocumentoAccessFacts,
  type DocumentoRecord,
} from "@/lib/documento-access";
import {
  ASSET_NDA_VERSION,
  NDA_NOT_ACCEPTED,
  assertNdaSignature,
  assetNdaLabel,
  buildAssetNdaText,
  type AssetDocumentosGate,
  type AssetNdaSignerRow,
} from "@/lib/nda";
import type { UserSession } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/server";

export interface DocRow {
  id: string;
  asset_id: string | null;
  comprador_id: string | null;
  name: string;
  storage_path: string;
  icon_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

const SIGNED_URL_TTL_SECONDS = 3600;

function guessIconType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "img";
  if (["zip", "rar", "7z"].includes(ext)) return "zip";
  return "other";
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

async function resolveCompradorId(session: UserSession, sb: ServiceClient): Promise<string | null> {
  if (session.compradorId) return session.compradorId;
  if (session.role !== "cliente") return null;
  let query = sb.from("compradores").select("id");
  if (session.userId) {
    query = query.or(`user_id.eq.${session.userId},email.ilike.${session.email}`);
  } else if (session.email) {
    query = query.ilike("email", session.email);
  } else {
    return null;
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

async function assignedAssetIds(sb: ServiceClient, vendedorId: string, assetIds: string[]): Promise<string[]> {
  const unique = [...new Set(assetIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await sb
    .from("vendedor_assets")
    .select("asset_id")
    .eq("vendedor_id", vendedorId)
    .in("asset_id", unique);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { asset_id: string }).asset_id));
}

async function acceptedNdaAssetIds(sb: ServiceClient, userId: string | null, assetIds: string[]): Promise<string[]> {
  const unique = [...new Set(assetIds.filter(Boolean))];
  if (!userId || unique.length === 0) return [];
  const { data, error } = await sb
    .from("asset_nda_aceptaciones")
    .select("asset_id")
    .eq("user_id", userId)
    .eq("version", ASSET_NDA_VERSION)
    .in("asset_id", unique);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { asset_id: string }).asset_id));
}

async function resolveSessionUserId(session: UserSession, sb: ServiceClient): Promise<string | null> {
  if (session.userId) return session.userId;
  const email = session.email?.trim().toLowerCase();
  if (!email) return null;
  try {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = data?.users?.find((row) => (row.email || "").toLowerCase() === email);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function actorFor(session: UserSession, sb: ServiceClient, assetIds: string[]): Promise<DocumentoAccessFacts> {
  switch (session.role) {
    case "admin":
      return { role: "admin" };
    case "vendedor": {
      const userId = await resolveSessionUserId(session, sb);
      const vendedorId = session.vendedorId ?? null;
      const [assigned, accepted] = await Promise.all([
        vendedorId ? assignedAssetIds(sb, vendedorId, assetIds) : Promise.resolve([]),
        acceptedNdaAssetIds(sb, userId, assetIds),
      ]);
      return {
        role: "vendedor",
        vendedorId,
        assignedAssetIds: assigned,
        acceptedNdaAssetIds: accepted,
      };
    }
    case "cliente": {
      const [compradorId, userId] = await Promise.all([
        resolveCompradorId(session, sb),
        resolveSessionUserId(session, sb),
      ]);
      return {
        role: "cliente",
        compradorId,
        acceptedNdaAssetIds: await acceptedNdaAssetIds(sb, userId, assetIds),
      };
    }
    default: {
      const _exhaustive: never = session.role;
      throw new Error(`Acceso denegado (${String(_exhaustive)})`);
    }
  }
}

function throwUnlessOk(decision: "ok" | "nda" | "denied"): void {
  switch (decision) {
    case "ok":
      return;
    case "nda":
      throw new Error(NDA_NOT_ACCEPTED);
    case "denied":
      throw new Error("Acceso denegado");
    default: {
      const _exhaustive: never = decision;
      throw new Error(`Acceso denegado (${String(_exhaustive)})`);
    }
  }
}

function assertCanRead(actor: DocumentoAccessFacts, doc: DocumentoRecord): void {
  throwUnlessOk(readDocumentoDecision(actor, doc));
}

export async function fetchDocumentos(opts: { assetId?: string; compradorId?: string }): Promise<DocRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const sb = await createServiceClient();
  const assetId = opts.assetId?.trim() || "";

  switch (session.role) {
    case "vendedor": {
      const actor = await actorFor(session, sb, [assetId]);
      throwUnlessOk(assetId ? listAssetDocumentosDecision(actor, assetId) : "denied");
      const { data, error } = await sb
        .from("documentos")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as DocRow[]).filter((row) => canReadDocumento(actor, row));
    }
    case "cliente": {
      const actor = await actorFor(session, sb, assetId ? [assetId] : []);
      if (actor.role !== "cliente" || !actor.compradorId) return [];
      if (assetId) throwUnlessOk(listAssetDocumentosDecision(actor, assetId));
      let query = sb.from("documentos").select("*").eq("comprador_id", actor.compradorId);
      if (assetId) query = query.eq("asset_id", assetId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as DocRow[];
      if (assetId) return rows.filter((row) => canReadDocumento(actor, row));
      const userId = await resolveSessionUserId(session, sb);
      const accepted = await acceptedNdaAssetIds(
        sb,
        userId,
        rows.flatMap((row) => (row.asset_id ? [row.asset_id] : [])),
      );
      const withNda: DocumentoAccessFacts = { ...actor, acceptedNdaAssetIds: accepted };
      return rows.filter((row) => canReadDocumento(withNda, row));
    }
    case "admin": {
      let query = sb.from("documentos").select("*");
      if (assetId) query = query.eq("asset_id", assetId);
      if (opts.compradorId) query = query.eq("comprador_id", opts.compradorId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DocRow[];
    }
    default: {
      const _exhaustive: never = session.role;
      throw new Error(`Acceso denegado (${String(_exhaustive)})`);
    }
  }
}

export async function uploadDocumento(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const file = formData.get("file") as File | null;
  const assetIdRaw = formData.get("asset_id");
  const compradorIdRaw = formData.get("comprador_id");
  const assetId = typeof assetIdRaw === "string" && assetIdRaw.trim() ? assetIdRaw.trim() : null;
  const compradorId = typeof compradorIdRaw === "string" && compradorIdRaw.trim() ? compradorIdRaw.trim() : null;
  const uploadedBy = (formData.get("uploaded_by") as string) || session.nombre || "Admin";

  if (!file) throw new Error("No se adjuntó archivo");

  const sb = await createServiceClient();
  const actor = await actorFor(session, sb, assetId ? [assetId] : []);
  if (!canWriteDocumento(actor, assetId)) throw new Error("Acceso denegado");

  // El agente no puede colgar el archivo de un comprador: solo el admin asocia comprador_id.
  const storedCompradorId = session.role === "admin" ? compradorId : null;
  const folder = assetId ? `assets/${assetId}` : storedCompradorId ? `compradores/${storedCompradorId}` : "general";
  const storagePath = `${folder}/${Date.now()}_${file.name}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageErr } = await sb.storage.from("documentos").upload(storagePath, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });
  if (storageErr) throw new Error(storageErr.message);

  const { error: dbErr } = await sb.from("documentos").insert({
    asset_id: assetId,
    comprador_id: storedCompradorId,
    name: file.name,
    storage_path: storagePath,
    icon_type: guessIconType(file.name),
    size_bytes: file.size,
    uploaded_by: uploadedBy,
  });
  if (dbErr) throw new Error(dbErr.message);
}

export async function deleteDocumento(id: string): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const sb = await createServiceClient();
  const { data, error: fetchErr } = await sb
    .from("documentos")
    .select("id, asset_id, comprador_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!data) throw new Error("Documento no encontrado");

  const row = data as DocumentoRecord & { storage_path?: string };
  const actor = await actorFor(session, sb, row.asset_id ? [row.asset_id] : []);
  if (!canWriteDocumento(actor, row.asset_id)) throw new Error("Acceso denegado");

  if (row.storage_path) {
    await sb.storage.from("documentos").remove([row.storage_path]);
  }

  const { error } = await sb.from("documentos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * URL firmada del bucket privado `documentos` (1 h).
 * El bucket no es público: una URL sin firma devolvía Bucket not found.
 * Solo se firma si la fila existe, la sesión puede leerla y, si es de un
 * activo, quien no es admin ya aceptó el NDA de ese activo.
 */
export async function getDocumentUrl(storagePath: string): Promise<string> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");
  const path = storagePath.trim();
  if (!path) throw new Error("Acceso denegado");

  const sb = await createServiceClient();
  const { data, error: fetchErr } = await sb
    .from("documentos")
    .select("asset_id, comprador_id, storage_path")
    .eq("storage_path", path)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!data) throw new Error("Acceso denegado");

  const row = data as DocumentoRecord;
  const actor = await actorFor(session, sb, row.asset_id ? [row.asset_id] : []);
  assertCanRead(actor, row);

  const { data: signed, error } = await sb.storage.from("documentos").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate signed URL");
  }
  return signed.signedUrl;
}

async function loadAssetNdaLabel(sb: ServiceClient, assetId: string): Promise<string> {
  const { data, error } = await sb
    .from("assets")
    .select("id, referencia, pob, addr")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Activo no encontrado");
  return assetNdaLabel(data as { id: string; referencia?: string | null; pob?: string | null; addr?: string | null });
}

/** La pestaña de documentación: abierta, o el texto del NDA de este activo. */
export async function getAssetDocumentosGate(assetId: string): Promise<AssetDocumentosGate> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");
  const id = assetId.trim();
  if (!id) throw new Error("Acceso denegado");

  const sb = await createServiceClient();
  const actor = await actorFor(session, sb, [id]);
  const decision = listAssetDocumentosDecision(actor, id);
  if (decision === "denied") throw new Error("Acceso denegado");
  if (decision === "ok") return { state: "open" };

  const assetLabel = await loadAssetNdaLabel(sb, id);
  return {
    state: "nda",
    version: ASSET_NDA_VERSION,
    text: buildAssetNdaText(assetLabel),
    assetLabel,
  };
}

async function requestClientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip: ip || null, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

/** Registra la firma del NDA del activo. El admin no necesita firmar. */
export async function acceptAssetNda(input: { assetId: string; nombre: string; accepted: boolean }): Promise<void> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");
  if (session.role === "admin") return;

  const assetId = input.assetId.trim();
  if (!assetId) throw new Error("Acceso denegado");
  const nombre = assertNdaSignature(input.nombre, input.accepted);

  const sb = await createServiceClient();
  const actor = await actorFor(session, sb, [assetId]);
  const decision = listAssetDocumentosDecision(actor, assetId);
  if (decision === "denied") throw new Error("Acceso denegado");
  if (decision === "ok") return;

  const userId = await resolveSessionUserId(session, sb);
  if (!userId) throw new Error("No se pudo identificar al usuario");
  await loadAssetNdaLabel(sb, assetId);
  const meta = await requestClientMeta();
  const { error } = await sb.from("asset_nda_aceptaciones").insert({
    asset_id: assetId,
    user_id: userId,
    nombre_firma: nombre,
    ip: meta.ip,
    user_agent: meta.userAgent,
    version: ASSET_NDA_VERSION,
  });
  if (error && !isUniqueViolation(error)) throw new Error(error.message);
}

/** Quién aceptó el NDA de este activo. Solo el admin. */
export async function fetchAssetNdaSigners(assetId: string): Promise<AssetNdaSignerRow[]> {
  const session = await getServerSession();
  if (!session || session.role !== "admin") throw new Error("Acceso denegado");
  const id = assetId.trim();
  if (!id) return [];

  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("asset_nda_aceptaciones")
    .select("nombre_firma, accepted_at, version")
    .eq("asset_id", id)
    .order("accepted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const signer = row as { nombre_firma: string; accepted_at: string; version: string };
    return {
      nombreFirma: signer.nombre_firma,
      acceptedAt: signer.accepted_at,
      version: signer.version,
    };
  });
}
