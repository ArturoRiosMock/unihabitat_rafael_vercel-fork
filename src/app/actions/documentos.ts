"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

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

function guessIconType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "img";
  if (["zip", "rar", "7z"].includes(ext)) return "zip";
  return "other";
}

export async function fetchDocumentos(opts: { assetId?: string; compradorId?: string }): Promise<DocRow[]> {
  const supabase = await createClient();
  let query = supabase.from("documentos").select("*");

  if (opts.assetId) query = query.eq("asset_id", opts.assetId);
  if (opts.compradorId) query = query.eq("comprador_id", opts.compradorId);

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DocRow[];
}

export async function uploadDocumento(formData: FormData): Promise<void> {
  const serviceClient = await createServiceClient();
  const file = formData.get("file") as File | null;
  const assetId = formData.get("asset_id") as string | null;
  const compradorId = formData.get("comprador_id") as string | null;
  const uploadedBy = (formData.get("uploaded_by") as string) || "Admin";

  if (!file) throw new Error("No se adjuntó archivo");

  const folder = assetId ? `assets/${assetId}` : compradorId ? `compradores/${compradorId}` : "general";
  const storagePath = `${folder}/${Date.now()}_${file.name}`;

  // Upload file to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: storageErr } = await serviceClient.storage
    .from("documentos")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (storageErr) throw new Error(storageErr.message);

  // Insert metadata row
  const { error: dbErr } = await serviceClient.from("documentos").insert({
    asset_id: assetId,
    comprador_id: compradorId,
    name: file.name,
    storage_path: storagePath,
    icon_type: guessIconType(file.name),
    size_bytes: file.size,
    uploaded_by: uploadedBy,
  });
  if (dbErr) throw new Error(dbErr.message);
}

export async function deleteDocumento(id: string): Promise<void> {
  const serviceClient = await createServiceClient();

  // Get storage path before deleting the row
  const { data, error: fetchErr } = await serviceClient
    .from("documentos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);

  if (data?.storage_path) {
    await serviceClient.storage.from("documentos").remove([data.storage_path]);
  }

  const { error } = await serviceClient.from("documentos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient.storage
    .from("documentos")
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to generate signed URL");
  }
  return data.signedUrl;
}
