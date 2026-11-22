import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { createPublicClient, hasPublicSupabaseEnv } from "@/lib/supabase/public";
import { ASSET_LIST_SELECT, PROPIEDAD_CARD_SELECT } from "@/lib/supabase/db";
import { getPortalPriceDisplay, shortAddr } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";
import { PUBLIC_PORTAL_TAG } from "@/lib/portal-revalidate";
import {
  emptyPortalListing,
  paginatePortalCards,
  portalCardMatches,
  portalCardToAsset,
  type PortalCard,
  type PortalCardProp,
  type PortalListingPage,
  type PortalMapPoint,
  type PortalQuery,
} from "@/lib/portal-listing";

const PAGE = 1000;
const MAX_PAGES = 100;

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCard(row: any, includePii: boolean): PortalCard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (row.propiedades ?? []) as any[];
  const propiedades: PortalCardProp[] = props.map((p) => ({
    id: text(p.id),
    inmuebleId: text(p.inmueble_id || row.id),
    activoId: text(p.activo_id),
    categoria: text(p.categoria).trim() || "CDR",
    deuda: num(p.deuda),
    precioPublicacion: num(p.precio_publicacion),
    collateralId: text(p.collateral_id),
    idPrinex: text(p.id_prinex),
    idProperty: text(p.id_property),
    mainLocalCcc14: text(p.main_local_ccc14),
    portfolio: text(p.portfolio),
    ...(includePii
      ? { propietario: text(p.propietario), contacto: text(p.contacto) }
      : {}),
  }));
  return {
    id: text(row.id),
    publicSlug: text(row.public_slug) || undefined,
    referencia: text(row.referencia),
    prov: text(row.prov),
    pob: text(row.pob),
    cp: text(row.cp),
    addr: text(row.addr),
    fullAddr: text(row.full_addr),
    ccaa: text(row.ccaa),
    tip: text(row.tip),
    tvia: text(row.tvia),
    nvia: text(row.nvia),
    num: text(row.num),
    clase: text(row.clase),
    uso: text(row.uso),
    bien: text(row.bien),
    precio: num(row.precio),
    sqm: num(row.sqm),
    map: text(row.map),
    lat: num(row.lat),
    lng: num(row.lng),
    pub: Boolean(row.pub),
    propiedades,
  };
}

async function fetchPages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

async function fetchCatalog(staff: boolean): Promise<PortalCard[]> {
  const includePii = staff && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const propCols = includePii
    ? `${PROPIEDAD_CARD_SELECT},propietario,contacto`
    : PROPIEDAD_CARD_SELECT;
  const select = `${ASSET_LIST_SELECT},propiedades(${propCols})`;
  const supabase = staff && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await createServiceClient()
    : createPublicClient();
  const rows = await fetchPages((from, to) => {
    let query = supabase
      .from("assets")
      .select(select)
      .order("created_at", { ascending: false });
    if (!staff) query = query.eq("pub", true);
    return query.range(from, to);
  });
  return rows.map((row) => toCard(row, includePii));
}

async function fetchCategorias(): Promise<string[]> {
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await createServiceClient()
    : createPublicClient();
  const rows = await fetchPages((from, to) =>
    supabase.from("propiedades").select("categoria").range(from, to),
  );
  return rows.map((row) => text(row.categoria));
}

const cachedPublishedCatalog = unstable_cache(
  () => fetchCatalog(false),
  ["portal-catalog-published-v1"],
  { revalidate: 120, tags: [PUBLIC_PORTAL_TAG] },
);

const cachedStaffCatalog = unstable_cache(
  () => fetchCatalog(true),
  ["portal-catalog-staff-v1"],
  { revalidate: 120, tags: [PUBLIC_PORTAL_TAG] },
);

const cachedCategorias = unstable_cache(
  () => fetchCategorias(),
  ["portal-categorias-v1"],
  { revalidate: 120, tags: [PUBLIC_PORTAL_TAG] },
);

async function catalog(staff: boolean): Promise<PortalCard[]> {
  try {
    return staff ? await cachedStaffCatalog() : await cachedPublishedCatalog();
  } catch (err) {
    console.error("[portal-catalog] caché no disponible, consulta directa:", err);
    return fetchCatalog(staff);
  }
}

/** Listado paginado. El navegador solo recibe una página de tarjetas. */
export async function loadPortalListing(input: {
  query: PortalQuery;
  staff: boolean;
  role: "admin" | "vendedor" | "cliente" | null;
}): Promise<PortalListingPage> {
  if (!hasPublicSupabaseEnv()) {
    return emptyPortalListing(input.query, "Supabase no configurado");
  }
  try {
    const [visibleRaw, categorias] = await Promise.all([
      catalog(input.staff),
      cachedCategorias().catch(() => [] as string[]),
    ]);
    const visible = input.staff ? visibleRaw : visibleRaw.filter((card) => card.pub);
    const role = input.role === "admin" ? "admin" : "other";
    const allCategorias = categorias.length > 0
      ? categorias
      : visible.flatMap((card) => card.propiedades.map((p) => p.categoria));
    const page = paginatePortalCards({
      catalog: visible,
      allCategorias,
      query: input.query,
      role,
      countSuspended: false,
    });
    if (!input.staff && page.total === 0) {
      const all = await catalog(true).catch(() => [] as PortalCard[]);
      const withSuspended = paginatePortalCards({
        catalog: visible,
        unpublished: all.filter((card) => !card.pub),
        allCategorias,
        query: input.query,
        role,
        countSuspended: true,
      });
      return withSuspended;
    }
    return page;
  } catch (err) {
    console.error("[loadPortalListing]", err);
    return emptyPortalListing(
      input.query,
      err instanceof Error ? err.message : "No se pudieron cargar las propiedades",
    );
  }
}

export async function loadPortalMapPoints(input: {
  query: PortalQuery;
  staff: boolean;
  role: "admin" | "vendedor" | "cliente" | null;
}): Promise<PortalMapPoint[]> {
  const listingCatalog = input.staff
    ? await catalog(true)
    : (await catalog(false)).filter((card) => card.pub);
  const role = input.role === "admin" ? "admin" : "other";
  const filters = {
    cat: input.query.cat,
    prov: input.query.prov,
    pob: input.query.pob,
    tipo: input.query.tipo,
  };
  const matched = listingCatalog.filter((card) =>
    portalCardMatches(card, filters, input.query.q, role),
  );
  const points: PortalMapPoint[] = [];
  for (const card of matched) {
    if (card.lat == null || card.lng == null) continue;
    const asset = portalCardToAsset(card);
    const price = getPortalPriceDisplay(asset);
    points.push({
      id: card.id,
      lat: card.lat,
      lng: card.lng,
      precio: card.precio,
      href: assetPortalHref(asset),
      title: shortAddr(asset) || card.pob || card.id,
      priceLabel: price.label,
      priceValue: price.value,
    });
  }
  return points;
}
