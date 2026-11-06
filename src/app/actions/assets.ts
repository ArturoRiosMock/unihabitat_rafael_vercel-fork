"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  rowToAsset, rowToAssetPublic, assetToRow,
  rowToPropiedad, rowToPropiedadPublic, propiedadToRow,
  mergeExcelRawMaps,
} from "@/lib/supabase/db";
import type { Asset, Propiedad } from "@/lib/types";
import { buildStaticMapUrl } from "@/lib/catastro/geoapify";
import {
  requireAdmin, requireAdminOrVendor, requireEditPermission, requireAssetAccess,
} from "@/lib/auth-server";
import { buildPublicSlug } from "@/lib/public-slug";

// PostgREST aplica `db-max-rows = 1000` por request; paginamos manualmente.
const POSTGREST_PAGE_SIZE = 1000;
const MAX_PAGES = 100;

async function fetchAllPaginated<Row>(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
): Promise<Row[]> {
  const all: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * POSTGREST_PAGE_SIZE;
    const to = from + POSTGREST_PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) {
      console.error(`[${label}] Supabase error en página ${page} (range ${from}-${to}):`, error.message);
      throw new Error(error.message);
    }
    const batch = (data ?? []) as Row[];
    all.push(...batch);
    if (batch.length < POSTGREST_PAGE_SIZE) break;
  }
  return all;
}

/* ------------------------------------------------------------------ */
/*  Reads (Inmuebles)                                                 */
/* ------------------------------------------------------------------ */

export async function fetchAssets(): Promise<Asset[]> {
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllPaginated<any>("fetchAssets", () =>
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
  );
  return rows.map(rowToAsset);
}

export async function fetchPublicAssets(): Promise<Asset[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllPaginated<any>("fetchPublicAssets", () =>
    supabase.from("assets").select("*").eq("pub", true).order("created_at", { ascending: false }),
  );
  const inmuebles = rows.map(rowToAssetPublic);
  // Adjuntamos propiedades (sin PII) para que el portal pueda mostrar categoría / agrupar.
  if (inmuebles.length === 0) return inmuebles;
  const ids = inmuebles.map((a) => a.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propsCollected: any[] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_PAGE_SIZE) {
    const slice = ids.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase
      .from("propiedades").select("*").in("inmueble_id", slice);
    if (error) throw new Error(error.message);
    if (data) propsCollected.push(...data);
  }
  const byInmueble = new Map<string, ReturnType<typeof rowToPropiedadPublic>[]>();
  for (const row of propsCollected) {
    const p = rowToPropiedadPublic(row);
    const list = byInmueble.get(p.inmuebleId);
    if (list) list.push(p);
    else byInmueble.set(p.inmuebleId, [p]);
  }
  for (const a of inmuebles) a.propiedades = byInmueble.get(a.id) ?? [];
  return inmuebles;
}

export async function fetchAssetsByIds(ids: string[]): Promise<Asset[]> {
  if (ids.length === 0) return [];
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collected: any[] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_PAGE_SIZE) {
    const slice = ids.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase.from("assets").select("*").in("id", slice);
    if (error) throw new Error(error.message);
    if (data) collected.push(...data);
  }
  return collected.map(rowToAssetPublic);
}

/**
 * Inmuebles públicos del mismo grupo (activoId / ID1), vía query a `propiedades`.
 * Incluye el inmueble actual si está publicado.
 */
export async function fetchPublicAssetsByActivoId(activoId: string): Promise<Asset[]> {
  const key = activoId?.trim();
  if (!key || key === "—") return [];
  const supabase = await createClient();
  const { data: propRows, error: propErr } = await supabase
    .from("propiedades")
    .select("inmueble_id")
    .eq("activo_id", key);
  if (propErr) throw new Error(propErr.message);
  const inmuebleIds = [...new Set((propRows ?? []).map((r) => r.inmueble_id as string).filter(Boolean))];
  if (inmuebleIds.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetRows: any[] = [];
  for (let i = 0; i < inmuebleIds.length; i += POSTGREST_PAGE_SIZE) {
    const slice = inmuebleIds.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .in("id", slice)
      .eq("pub", true);
    if (error) throw new Error(error.message);
    if (data) assetRows.push(...data);
  }
  const inmuebles = assetRows.map(rowToAssetPublic);
  if (inmuebles.length === 0) return inmuebles;

  const ids = inmuebles.map((a) => a.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propsCollected: any[] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_PAGE_SIZE) {
    const slice = ids.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase.from("propiedades").select("*").in("inmueble_id", slice);
    if (error) throw new Error(error.message);
    if (data) propsCollected.push(...data);
  }
  const byInmueble = new Map<string, ReturnType<typeof rowToPropiedadPublic>[]>();
  for (const row of propsCollected) {
    const p = rowToPropiedadPublic(row);
    const list = byInmueble.get(p.inmuebleId);
    if (list) list.push(p);
    else byInmueble.set(p.inmuebleId, [p]);
  }
  for (const a of inmuebles) a.propiedades = byInmueble.get(a.id) ?? [];
  return inmuebles;
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const asset = rowToAssetPublic(data);
  const { data: props, error: pErr } = await supabase
    .from("propiedades").select("*").eq("inmueble_id", id);
  if (pErr) throw new Error(pErr.message);
  asset.propiedades = (props ?? []).map(rowToPropiedadPublic);
  return asset;
}

/**
 * Fetches sibling assets sharing the same activoId (ID1) for admin view.
 * Returns all assets (not just public ones) linked via propiedades.activo_id.
 * Excludes the current asset from the result.
 */
export async function fetchAssetsByActivoIdForAdmin(activoId: string, excludeId?: string): Promise<Asset[]> {
  const key = activoId?.trim();
  if (!key || key === "—") return [];
  await requireAdminOrVendor();
  const supabase = await createServiceClient();

  const { data: propRows, error: propErr } = await supabase
    .from("propiedades")
    .select("inmueble_id")
    .eq("activo_id", key);
  if (propErr) throw new Error(propErr.message);

  let inmuebleIds = [...new Set((propRows ?? []).map((r) => r.inmueble_id as string).filter(Boolean))];
  if (excludeId) {
    inmuebleIds = inmuebleIds.filter((id) => id !== excludeId);
  }
  if (inmuebleIds.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetRows: any[] = [];
  for (let i = 0; i < inmuebleIds.length; i += POSTGREST_PAGE_SIZE) {
    const slice = inmuebleIds.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .in("id", slice);
    if (error) throw new Error(error.message);
    if (data) assetRows.push(...data);
  }
  const inmuebles = assetRows.map(rowToAsset);
  if (inmuebles.length === 0) return inmuebles;

  const ids = inmuebles.map((a) => a.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propsCollected: any[] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_PAGE_SIZE) {
    const slice = ids.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase.from("propiedades").select("*").in("inmueble_id", slice);
    if (error) throw new Error(error.message);
    if (data) propsCollected.push(...data);
  }
  const byInmueble = new Map<string, ReturnType<typeof rowToPropiedad>[]>();
  for (const row of propsCollected) {
    const p = rowToPropiedad(row);
    const list = byInmueble.get(p.inmuebleId);
    if (list) list.push(p);
    else byInmueble.set(p.inmuebleId, [p]);
  }
  for (const a of inmuebles) a.propiedades = byInmueble.get(a.id) ?? [];
  return inmuebles;
}

/** Resuelve ficha pública/privada por slug opaco (sin catastral en URL). */
export async function fetchAssetByPublicSlug(slug: string): Promise<Asset | null> {
  const key = slug?.trim();
  if (!key) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets").select("*").eq("public_slug", key).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const asset = rowToAssetPublic(data);
  const { data: props, error: pErr } = await supabase
    .from("propiedades").select("*").eq("inmueble_id", asset.id);
  if (pErr) throw new Error(pErr.message);
  asset.propiedades = (props ?? []).map(rowToPropiedadPublic);
  return asset;
}

export interface ImportSchemaPreflightResult {
  ok: boolean;
  errors: string[];
}

/**
 * Fail-fast antes de escribir batches: columnas/constraints requeridos por el importador.
 * Requiere RPC `import_schema_preflight` (migración feedback-cliente).
 */
export async function assertImportSchemaReady(): Promise<ImportSchemaPreflightResult> {
  await requireAdmin();
  const supabase = await createServiceClient();
  const errors: string[] = [];

  const { error: colErr } = await supabase
    .from("assets")
    .select("id, referencia, public_slug")
    .limit(1);
  if (colErr) {
    errors.push(`Schema assets incompatible: ${colErr.message}`);
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("import_schema_preflight");
  if (rpcErr) {
    errors.push(
      `No se pudo validar schema (¿migración aplicada?): ${rpcErr.message}`,
    );
  } else if (rpcData && typeof rpcData === "object") {
    const payload = rpcData as { ok?: boolean; errors?: string[] };
    if (payload.ok === false && Array.isArray(payload.errors)) {
      errors.push(...payload.errors);
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function fetchAssetByIdForAdmin(id: string): Promise<Asset | null> {
  const session = await requireAdminOrVendor();
  await requireAssetAccess(session, id);
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("assets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const asset = rowToAsset(data);
  const { data: props, error: pErr } = await supabase
    .from("propiedades").select("*").eq("inmueble_id", id);
  if (pErr) throw new Error(pErr.message);
  asset.propiedades = (props ?? []).map(rowToPropiedad);
  return asset;
}

/* ------------------------------------------------------------------ */
/*  Reads (Propiedades)                                               */
/* ------------------------------------------------------------------ */

export async function fetchPropiedades(): Promise<Propiedad[]> {
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllPaginated<any>("fetchPropiedades", () =>
    supabase.from("propiedades").select("*").order("created_at", { ascending: false }),
  );
  return rows.map(rowToPropiedad);
}

export async function fetchPropiedadesPublic(): Promise<Propiedad[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAllPaginated<any>("fetchPropiedadesPublic", () =>
    supabase.from("propiedades").select("*"),
  );
  return rows.map(rowToPropiedadPublic);
}

export async function fetchPropiedadesByInmuebleIds(ids: string[]): Promise<Propiedad[]> {
  if (ids.length === 0) return [];
  const supabase = await createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collected: any[] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_PAGE_SIZE) {
    const slice = ids.slice(i, i + POSTGREST_PAGE_SIZE);
    const { data, error } = await supabase
      .from("propiedades").select("*").in("inmueble_id", slice);
    if (error) throw new Error(error.message);
    if (data) collected.push(...data);
  }
  return collected.map(rowToPropiedad);
}

/* ------------------------------------------------------------------ */
/*  Upsert (Inmuebles)                                                */
/* ------------------------------------------------------------------ */

const EMPTY_VALS = new Set(["—", ""]);
const PRESERVE_FIELDS = new Set(["id", "created_at", "updated_at"]);

function isEmptyVal(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string" && EMPTY_VALS.has(v.trim())) return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeRowPreferNonEmpty(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: Record<string, any> = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (PRESERVE_FIELDS.has(key)) continue;
    const inVal = incoming[key];
    const exVal = existing[key];

    if (key === "pub") {
      if (inVal === true) merged[key] = true;
      continue;
    }
    if (key === "fav") continue;
    if ((key === "lat" || key === "lng") && inVal == null && exVal != null) continue;
    if (key === "map" && isEmptyVal(inVal) && !isEmptyVal(exVal)) continue;

    if (!isEmptyVal(inVal)) merged[key] = inVal;
  }
  return merged;
}

function isProviderStaticMapUrl(m: string): boolean {
  const u = m.toLowerCase();
  return u.includes("maps.geoapify.com") || u.includes("staticmap.openstreetmap.de");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMapFromLatLng(row: Record<string, any>): void {
  const lat = row.lat;
  const lng = row.lng;
  if (lat == null || lng == null) return;
  const la = typeof lat === "number" ? lat : parseFloat(String(lat));
  const lo = typeof lng === "number" ? lng : parseFloat(String(lng));
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
  const current = String(row.map ?? "").trim();
  if (current && !isProviderStaticMapUrl(current)) return;
  const geo = buildStaticMapUrl(String(lo), String(la));
  if (geo) { row.map = geo; return; }
  row.map = `https://staticmap.openstreetmap.de/staticmap?center=${encodeURIComponent(String(la))},${encodeURIComponent(String(lo))}&zoom=15&size=600x400`;
}

function dedupAssetsById(assets: Asset[]): { deduped: Asset[]; duplicates: Map<string, number> } {
  const byId = new Map<string, Asset>();
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const a of assets) {
    const prev = byId.get(a.id);
    if (prev) {
      byId.set(a.id, { ...prev, ...a });
      counts.set(a.id, (counts.get(a.id) ?? 1) + 1);
    } else {
      byId.set(a.id, a);
      order.push(a.id);
    }
  }
  return { deduped: order.map((id) => byId.get(id)!), duplicates: counts };
}

export interface UpsertAssetsResult {
  inserted: number;
  updated: number;
  errors: string[];
  duplicatesMerged: Record<string, number>;
}

export async function upsertAssets(assets: Asset[]): Promise<UpsertAssetsResult> {
  await requireAdmin();
  const supabase = await createServiceClient();
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;

  const preflight = await assertImportSchemaReady();
  if (!preflight.ok) {
    return {
      inserted: 0,
      updated: 0,
      errors: preflight.errors.map((e) => `Preflight: ${e}`),
      duplicatesMerged: {},
    };
  }

  const { deduped, duplicates } = dedupAssetsById(assets);
  const duplicatesMerged: Record<string, number> = {};
  for (const [id, n] of duplicates) duplicatesMerged[id] = n;

  // Prefetch slugs existentes (paginado) para evitar colisiones en el batch.
  const takenSlugs = new Set<string>();
  {
    const slugRows = await fetchAllPaginated<{ public_slug: string | null }>(
      "upsertAssets.slugs",
      () => supabase.from("assets").select("public_slug"),
    );
    for (const r of slugRows) {
      if (r.public_slug) takenSlugs.add(String(r.public_slug));
    }
  }

  const BATCH_SIZE = 50;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((a) => a.id);

    const { data: existingRows, error: fetchErr } = await supabase
      .from("assets").select("*").in("id", batchIds);
    if (fetchErr) { errors.push(`Batch ${i}: ${fetchErr.message}`); continue; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingMap = new Map<string, Record<string, any>>();
    for (const row of existingRows ?? []) existingMap.set(row.id, row);

    const rows = batch.map((a) => {
      const existing = existingMap.get(a.id);
      const keepSlug = existing?.public_slug ? String(existing.public_slug) : a.publicSlug;
      if (keepSlug) takenSlugs.delete(keepSlug);
      const publicSlug = buildPublicSlug(
        { id: a.id, tip: a.tip, pob: a.pob, publicSlug: keepSlug },
        takenSlugs,
      );
      takenSlugs.add(publicSlug);
      a.publicSlug = publicSlug;

      const incoming = assetToRow(a);
      incoming.public_slug = publicSlug;
      if (!incoming.referencia) {
        incoming.referencia = a.referencia || (existing?.referencia ?? "") || a.id.split("__")[1] || a.id;
      }
      const merged = existing ? mergeRowPreferNonEmpty(existing, incoming) : incoming;
      merged.public_slug = publicSlug;
      if (!merged.referencia) merged.referencia = incoming.referencia;
      applyMapFromLatLng(merged);
      return merged;
    });

    const { error: upsertErr } = await supabase
      .from("assets").upsert(rows, { onConflict: "id", ignoreDuplicates: false });

    if (upsertErr) {
      console.error(`[upsertAssets] batch ${i}: ${upsertErr.message}`, batchIds);
      errors.push(`Batch ${i}: ${upsertErr.message}`);
    } else {
      for (const r of rows) {
        if (existingMap.has(r.id)) updated++;
        else inserted++;
      }
    }
  }

  return { inserted, updated, errors, duplicatesMerged };
}

/* ------------------------------------------------------------------ */
/*  Upsert (Propiedades)                                              */
/* ------------------------------------------------------------------ */

export interface UpsertPropiedadesResult {
  inserted: number;
  updated: number;
  errors: string[];
  duplicatesMerged: Record<string, number>;
}

function dedupPropiedadesById(propiedades: Propiedad[]): { deduped: Propiedad[]; duplicates: Map<string, number> } {
  const byId = new Map<string, Propiedad>();
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const p of propiedades) {
    const prev = byId.get(p.id);
    if (prev) {
      const mergedExcelRaw = mergeExcelRawMaps(prev.excelRaw, p.excelRaw);
      byId.set(p.id, { ...prev, ...p, excelRaw: mergedExcelRaw });
      counts.set(p.id, (counts.get(p.id) ?? 1) + 1);
    } else {
      byId.set(p.id, p);
      order.push(p.id);
    }
  }
  return { deduped: order.map((id) => byId.get(id)!), duplicates: counts };
}

export async function upsertPropiedades(propiedades: Propiedad[]): Promise<UpsertPropiedadesResult> {
  await requireAdmin();
  const supabase = await createServiceClient();
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;

  const preflight = await assertImportSchemaReady();
  if (!preflight.ok) {
    return {
      inserted: 0,
      updated: 0,
      errors: preflight.errors.map((e) => `Preflight: ${e}`),
      duplicatesMerged: {},
    };
  }

  const { deduped, duplicates } = dedupPropiedadesById(propiedades);
  const duplicatesMerged: Record<string, number> = {};
  for (const [id, n] of duplicates) duplicatesMerged[id] = n;

  const BATCH_SIZE = 50;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((p) => p.id);

    const { data: existingRows, error: fetchErr } = await supabase
      .from("propiedades").select("id, excel_raw").in("id", batchIds);
    if (fetchErr) { errors.push(`Batch ${i}: ${fetchErr.message}`); continue; }

    const existingIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingExcelRaw = new Map<string, any>();
    for (const r of existingRows ?? []) {
      existingIds.add(r.id);
      existingExcelRaw.set(r.id, r.excel_raw);
    }

    const rows = batch.map((p) => {
      const row = propiedadToRow(p);
      const prevExcel = existingExcelRaw.get(p.id);
      if (prevExcel) {
        const merged = mergeExcelRawMaps(prevExcel, row.excel_raw);
        if (merged) row.excel_raw = merged;
      }
      return row;
    });

    const { error: upsertErr } = await supabase
      .from("propiedades").upsert(rows, { onConflict: "id", ignoreDuplicates: false });

    if (upsertErr) {
      console.error(`[upsertPropiedades] batch ${i}: ${upsertErr.message}`, batchIds);
      errors.push(`Batch ${i}: ${upsertErr.message}`);
    } else {
      for (const r of rows) {
        if (existingIds.has(r.id)) updated++;
        else inserted++;
      }
    }
  }

  return { inserted, updated, errors, duplicatesMerged };
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                         */
/* ------------------------------------------------------------------ */

export async function toggleAssetPub(id: string): Promise<boolean> {
  const session = await requireEditPermission("activos");
  await requireAssetAccess(session, id);
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("assets").select("pub").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Inmueble no encontrado");
  const newPub = !data.pub;
  const { error: updateErr } = await supabase
    .from("assets").update({ pub: newPub }).eq("id", id);
  if (updateErr) throw new Error(updateErr.message);

  // Al publicar, recalcular matching y notificar compradores top.
  if (newPub) {
    try {
      const { computeMatchesForAsset } = await import("@/app/actions/matching");
      await computeMatchesForAsset(id);
    } catch (err) {
      console.warn("[toggleAssetPub] matching falló (best-effort):", err);
    }
  }

  return newPub;
}

export async function updateAssetFields(
  id: string,
  fields: Record<string, string | number | null>
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  const session = await requireEditPermission("activos");
  await requireAssetAccess(session, id);
  const supabase = await createServiceClient();
  const { error } = await supabase.from("assets").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Actualiza campos de una fila en `propiedades` (fase_interna, proceso, etc.). */
export async function updatePropiedadFields(
  propiedadId: string,
  fields: Record<string, string | number | null>,
): Promise<void> {
  if (!propiedadId || Object.keys(fields).length === 0) return;
  await requireEditPermission("activos");
  const supabase = await createServiceClient();
  const { error } = await supabase.from("propiedades").update(fields).eq("id", propiedadId);
  if (error) throw new Error(error.message);
}

const MAX_EXCEL_RAW_JSON_CHARS = 500_000;

function validateExcelRawPayload(obj: unknown): Record<string, Record<string, string>> {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("Formato excel_raw inválido");
  }
  const out: Record<string, Record<string, string>> = {};
  for (const [sk, sv] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof sk !== "string" || sk.length > 200) throw new Error("Nombre de hoja inválido");
    if (sv == null || typeof sv !== "object" || Array.isArray(sv)) {
      throw new Error(`Contenido de hoja "${sk}" inválido`);
    }
    const inner: Record<string, string> = {};
    for (const [hk, hv] of Object.entries(sv as Record<string, unknown>)) {
      if (typeof hk !== "string" || hk.length > 500) throw new Error("Nombre de columna inválido");
      inner[hk] = hv == null ? "" : String(hv).slice(0, 50_000);
    }
    out[sk] = inner;
  }
  const json = JSON.stringify(out);
  if (json.length > MAX_EXCEL_RAW_JSON_CHARS) {
    throw new Error("excel_raw demasiado grande; reduzca el contenido");
  }
  return out;
}

/** Actualiza el excel_raw de una propiedad (lien). En el nuevo modelo el blob
 *  de Excel vive a nivel propiedad, no inmueble. */
export async function updatePropiedadExcelRaw(
  propiedadId: string,
  excelRaw: Record<string, Record<string, string>>,
): Promise<void> {
  await requireAdmin();
  const validated = validateExcelRawPayload(excelRaw);
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("propiedades").update({ excel_raw: validated }).eq("id", propiedadId);
  if (error) throw new Error(error.message);
}

export async function deleteAssetsByIds(ids: string[]): Promise<{ deleted: number }> {
  await requireAdmin();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { deleted: 0 };
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("assets").delete().in("id", unique).select("id");
  if (error) throw new Error(error.message);
  return { deleted: data?.length ?? 0 };
}

export async function toggleAssetFav(id: string): Promise<void> {
  await requireAdminOrVendor();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets").select("fav").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const { error: updateErr } = await supabase
    .from("assets").update({ fav: !data.fav }).eq("id", id);
  if (updateErr) throw new Error(updateErr.message);
}
