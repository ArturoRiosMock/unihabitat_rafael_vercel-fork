"use server";

import { getServerSession } from "@/lib/auth-server";
import {
  canListAssetDocumentos,
  canReadDocumento,
  canWriteDocumento,
  type DocumentoAccessFacts,
  type DocumentoRecord,
} from "@/lib/documento-access";
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

async function actorFor(session: UserSession, sb: ServiceClient, assetIds: string[]): Promise<DocumentoAccessFacts> {
  switch (session.role) {
    case "admin":
      return { role: "admin" };
    case "vendedor":
      return {
        role: "vendedor",
        vendedorId: session.vendedorId ?? null,
        assignedAssetIds: session.vendedorId ? await assignedAssetIds(sb, session.vendedorId, assetIds) : [],
      };
    case "cliente":
      return { role: "cliente", compradorId: await resolveCompradorId(session, sb) };
    default: {
      const _exhaustive: never = session.role;
      throw new Error(`Acceso denegado (${String(_exhaustive)})`);
    }
  }
}

function assertCanRead(actor: DocumentoAccessFacts, doc: DocumentoRecord): void {
  if (!canReadDocumento(actor, doc)) throw new Error("Acceso denegado");
}

export async function fetchDocumentos(opts: { assetId?: string; compradorId?: string }): Promise<DocRow[]> {
  const session = await getServerSession();
  if (!session) throw new Error("Acceso denegado");

  const sb = await createServiceClient();
  const assetId = opts.assetId?.trim() || "";

  switch (session.role) {
    case "vendedor": {
      const actor = await actorFor(session, sb, [assetId]);
      if (!assetId || !canListAssetDocumentos(actor, assetId)) {
        throw new Error("Acceso denegado");
      }
      const { data, error } = await sb
        .from("documentos")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as DocRow[]).filter((row) => canReadDocumento(actor, row));
    }
    case "cliente": {
      const compradorId = await resolveCompradorId(session, sb);
      if (!compradorId) return [];
      let query = sb.from("documentos").select("*").eq("comprador_id", compradorId);
      if (assetId) query = query.eq("asset_id", assetId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const actor: DocumentoAccessFacts = { role: "cliente", compradorId };
      return ((data ?? []) as DocRow[]).filter((row) => canReadDocumento(actor, row));
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
 * Solo se firma si la fila existe y la sesión puede leerla.
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
