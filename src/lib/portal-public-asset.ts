import { unstable_cache } from "next/cache";
import type { Asset } from "@/lib/types";
import {
  ASSET_PUBLIC_SELECT,
  PROPIEDAD_PUBLIC_SELECT,
  rowToAssetPublic,
  rowToPropiedadPublic,
} from "@/lib/supabase/db";
import { createPublicClient, hasPublicSupabaseEnv } from "@/lib/supabase/public";
import { PUBLIC_PORTAL_TAG } from "@/lib/portal-revalidate";

const FICHA_SELECT = `${ASSET_PUBLIC_SELECT},propiedades(${PROPIEDAD_PUBLIC_SELECT})`;

function assemble(row: Record<string, unknown> | null): Asset | null {
  if (!row) return null;
  const asset = rowToAssetPublic(row);
  const props = Array.isArray(row.propiedades) ? row.propiedades : [];
  asset.propiedades = props.map((prop) => rowToPropiedadPublic(prop));
  if (!asset.pub) return null;
  return asset;
}

async function loadByColumn(column: "public_slug" | "id", value: string): Promise<Asset | null> {
  if (!value || !hasPublicSupabaseEnv()) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("assets")
    .select(FICHA_SELECT)
    .eq(column, value)
    .eq("pub", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return assemble(data as unknown as Record<string, unknown> | null);
}

async function loadSiblings(asset: Asset): Promise<Asset[]> {
  const activoId = asset.propiedades[0]?.activoId?.trim() ?? "";
  if (!activoId || activoId === "—") return [];
  const supabase = createPublicClient();
  const { data: propRows, error: propErr } = await supabase
    .from("propiedades")
    .select("inmueble_id")
    .eq("activo_id", activoId);
  if (propErr) throw new Error(propErr.message);
  const ids = [...new Set((propRows ?? []).map((row) => String(row.inmueble_id)).filter(Boolean))]
    .filter((id) => id !== asset.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("assets")
    .select(FICHA_SELECT)
    .in("id", ids)
    .eq("pub", true);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => assemble(row as unknown as Record<string, unknown>))
    .filter((item): item is Asset => item != null);
}

async function loadFicha(column: "public_slug" | "id", value: string): Promise<{
  asset: Asset;
  siblings: Asset[];
} | null> {
  const asset = await loadByColumn(column, value);
  if (!asset) return null;
  try {
    const siblings = await loadSiblings(asset);
    return { asset, siblings };
  } catch {
    return { asset, siblings: [] };
  }
}

const cachedBySlug = unstable_cache(
  (slug: string) => loadFicha("public_slug", slug),
  ["public-ficha-slug-v1"],
  { revalidate: 300, tags: [PUBLIC_PORTAL_TAG] },
);

const cachedById = unstable_cache(
  (id: string) => loadFicha("id", id),
  ["public-ficha-id-v1"],
  { revalidate: 300, tags: [PUBLIC_PORTAL_TAG] },
);

export async function getCachedPublicFichaBySlug(slug: string) {
  const key = slug.trim();
  if (!key || !hasPublicSupabaseEnv()) return null;
  try {
    return await cachedBySlug(key);
  } catch (err) {
    console.error("[getCachedPublicFichaBySlug]", err);
    return loadFicha("public_slug", key);
  }
}

export async function getCachedPublicFichaById(id: string) {
  const key = id.trim();
  if (!key || !hasPublicSupabaseEnv()) return null;
  try {
    return await cachedById(key);
  } catch (err) {
    console.error("[getCachedPublicFichaById]", err);
    return loadFicha("id", key);
  }
}
