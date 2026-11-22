import type { Asset, Propiedad } from "@/lib/types";
import {
  assetMatchesListFilters,
  buildAssetListFilterOptions,
  uniqueFilterOptions,
  type AssetListFilters,
} from "@/lib/asset-filters";

/** Tarjetas por página. El móvil medido no aguanta 100–200 mapas/filas. */
export const PORTAL_PAGE_SIZE_OPTIONS = [24, 48] as const;
export type PortalPageSize = (typeof PORTAL_PAGE_SIZE_OPTIONS)[number];
export const PORTAL_PAGE_SIZE_DEFAULT: PortalPageSize = 24;

export const PORTAL_SORTS = ["none", "price_asc", "price_desc", "sqm_asc", "sqm_desc", "pob_az"] as const;
export type PortalSortKey = (typeof PORTAL_SORTS)[number];

export interface PortalQuery {
  q: string;
  cat: string;
  prov: string;
  pob: string;
  tipo: string;
  sort: PortalSortKey;
  page: number;
  pageSize: PortalPageSize;
}

export interface PortalCardProp {
  id: string;
  inmuebleId: string;
  activoId: string;
  categoria: string;
  deuda: number | null;
  precioPublicacion: number | null;
  collateralId: string;
  idPrinex: string;
  idProperty: string;
  mainLocalCcc14: string;
  portfolio: string;
  /** Solo en el catálogo de servidor para la búsqueda de admin. No se envía al cliente. */
  propietario?: string;
  contacto?: string;
}

/** Columnas de la tarjeta del listado. No incluye excel_raw ni PII. */
export interface PortalCard {
  id: string;
  publicSlug?: string;
  referencia: string;
  prov: string;
  pob: string;
  cp: string;
  addr: string;
  fullAddr: string;
  ccaa: string;
  tip: string;
  tvia: string;
  nvia: string;
  num: string;
  clase: string;
  uso: string;
  bien: string;
  precio: number | null;
  sqm: number | null;
  map: string;
  lat: number | null;
  lng: number | null;
  pub: boolean;
  propiedades: PortalCardProp[];
}

export interface PortalFilterOptions {
  cat: string[];
  prov: string[];
  pob: string[];
  tip: string[];
}

export interface PortalListingPage {
  items: PortalCard[];
  total: number;
  page: number;
  pageSize: PortalPageSize;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  options: PortalFilterOptions;
  suspendedMatchCount: number;
  /** activoId → nº de inmuebles del catálogo visible (solo si > 1). */
  groupCounts: Record<string, number>;
  error: string | null;
}

export interface PortalMapPoint {
  id: string;
  lat: number;
  lng: number;
  precio: number | null;
  href: string;
  title: string;
  priceLabel: string;
  priceValue: string;
}

type SearchRole = "admin" | "other";

const SORT_SET = new Set<string>(PORTAL_SORTS);

export function normalizePortalCat(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw.toUpperCase() === "REO") return "";
  return raw;
}

export function clampPortalPageSize(raw: number): PortalPageSize {
  if (raw >= 48) return 48;
  return 24;
}

export function parsePortalSearchParams(
  source: Record<string, string | string[] | undefined> | URLSearchParams,
): PortalQuery {
  const read = (key: string): string => {
    if (source instanceof URLSearchParams) return source.get(key) ?? "";
    const value = source[key];
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  };
  const sortRaw = read("sort");
  const page = Number.parseInt(read("page"), 10);
  const size = Number.parseInt(read("size"), 10);
  return {
    q: read("q").trim(),
    cat: normalizePortalCat(read("cat")),
    prov: read("prov"),
    pob: read("pob"),
    tipo: read("tipo"),
    sort: SORT_SET.has(sortRaw) ? (sortRaw as PortalSortKey) : "none",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: clampPortalPageSize(Number.isFinite(size) ? size : PORTAL_PAGE_SIZE_DEFAULT),
  };
}

export function portalQueryToSearchParams(query: PortalQuery): string {
  const params = new URLSearchParams();
  if (query.cat) params.set("cat", query.cat);
  if (query.prov) params.set("prov", query.prov);
  if (query.pob) params.set("pob", query.pob);
  if (query.tipo) params.set("tipo", query.tipo);
  if (query.q) params.set("q", query.q);
  if (query.sort !== "none") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== PORTAL_PAGE_SIZE_DEFAULT) params.set("size", String(query.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function stubProp(partial: PortalCardProp): Propiedad {
  return {
    id: partial.id,
    inmuebleId: partial.inmuebleId,
    activoId: partial.activoId,
    categoria: partial.categoria,
    propietario: partial.propietario ?? "—",
    contacto: partial.contacto ?? "—",
    telefono: "—",
    mail: "—",
    faseInterna: "—",
    faseC: "fp-nd",
    proceso: "—",
    deuda: partial.deuda,
    precioPublicacion: partial.precioPublicacion,
    lien: "—",
    collateralId: partial.collateralId,
    idPrinex: partial.idPrinex,
    idPrinexCorto: "",
    idProperty: partial.idProperty,
    dataRef: "",
    portfolio: partial.portfolio,
    folder: "—",
    mainLocalCcc14: partial.mainLocalCcc14,
    stageStatus: "—",
    stageSubstatus: "—",
    tipologia: "—",
    juzgadoLarga: "—",
    codigoProcedimiento: "—",
    ultimaFaseCalculada: "—",
    hitoJudicial: "—",
    fechaLanzamiento: "—",
    lanzamiento: "—",
    infoOcupantes: "—",
    inscrito: "—",
    cargas: "—",
    registralmenteOk: "—",
  };
}

/** Adapta la tarjeta al filtro compartido con /admin. */
export function portalCardToAsset(card: PortalCard): Asset {
  return {
    id: card.id,
    referencia: card.referencia,
    publicSlug: card.publicSlug,
    prov: card.prov,
    pob: card.pob,
    cp: card.cp,
    addr: card.addr,
    tip: card.tip,
    tipC: "",
    precio: card.precio,
    fav: false,
    chk: false,
    sqm: card.sqm,
    tvia: card.tvia,
    nvia: card.nvia,
    num: card.num,
    esc: "",
    pla: "",
    pta: "",
    map: card.map,
    lat: card.lat,
    lng: card.lng,
    clase: card.clase,
    uso: card.uso,
    bien: card.bien,
    supC: "",
    supG: "",
    coef: "",
    ccaa: card.ccaa,
    fullAddr: card.fullAddr,
    desc: "",
    pub: card.pub,
    propiedades: card.propiedades.map(stubProp),
  };
}

export function portalCardSearchBlob(card: PortalCard, role: SearchRole): string {
  const propBlob = card.propiedades
    .map((p) =>
      [
        p.activoId,
        p.categoria,
        p.idPrinex,
        p.idProperty,
        p.collateralId,
        p.mainLocalCcc14,
        p.portfolio,
        ...(role === "admin" ? [p.propietario, p.contacto] : []),
      ].join(" "),
    )
    .join(" ");
  return [
    card.id,
    card.pob,
    card.prov,
    card.cp,
    card.ccaa,
    card.addr,
    card.fullAddr,
    card.tvia,
    card.nvia,
    card.num,
    card.tip,
    card.bien,
    card.clase,
    card.uso,
    card.precio != null ? String(card.precio) : "",
    propBlob,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function portalCardMatches(
  card: PortalCard,
  filters: AssetListFilters,
  q: string,
  role: SearchRole,
): boolean {
  if (!assetMatchesListFilters(portalCardToAsset(card), filters)) return false;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const blob = portalCardSearchBlob(card, role);
  return terms.every((term) => blob.includes(term));
}

export function sortPortalCards(cards: readonly PortalCard[], sort: PortalSortKey): PortalCard[] {
  const copy = [...cards];
  if (sort === "price_asc") copy.sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity));
  else if (sort === "price_desc") copy.sort((a, b) => (b.precio ?? 0) - (a.precio ?? 0));
  else if (sort === "sqm_asc") copy.sort((a, b) => (a.sqm ?? Infinity) - (b.sqm ?? Infinity));
  else if (sort === "sqm_desc") copy.sort((a, b) => (b.sqm ?? 0) - (a.sqm ?? 0));
  else if (sort === "pob_az") copy.sort((a, b) => (a.pob || "").localeCompare(b.pob || "", "es"));
  return copy;
}

export function portalFilterOptions(
  catalog: readonly PortalCard[],
  allCategorias: readonly string[],
  filters: AssetListFilters,
): PortalFilterOptions {
  const assets = catalog.map(portalCardToAsset);
  const scoped = buildAssetListFilterOptions(assets, filters);
  return {
    cat: uniqueFilterOptions([...allCategorias]),
    prov: scoped.prov,
    pob: scoped.pob,
    tip: scoped.tip,
  };
}

/** Conteos de colaterales sobre el catálogo visible, no solo la página. */
export function portalGroupCounts(catalog: readonly PortalCard[]): Record<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const card of catalog) {
    const activo = card.propiedades[0]?.activoId?.trim();
    if (!activo || activo === "—") continue;
    const set = groups.get(activo);
    if (set) set.add(card.id);
    else groups.set(activo, new Set([card.id]));
  }
  const counts: Record<string, number> = {};
  for (const [activo, ids] of groups) {
    if (ids.size > 1) counts[activo] = ids.size;
  }
  return counts;
}

export function stripPortalCard(card: PortalCard): PortalCard {
  return {
    ...card,
    propiedades: card.propiedades.map(({ propietario: _p, contacto: _c, ...rest }) => rest),
  };
}

export function paginatePortalCards(input: {
  catalog: readonly PortalCard[];
  unpublished?: readonly PortalCard[];
  allCategorias: readonly string[];
  query: PortalQuery;
  role: SearchRole;
  /** Visitante: el conteo de suspendidos solo si el filtro público queda vacío. */
  countSuspended: boolean;
}): PortalListingPage {
  const filters: AssetListFilters = {
    cat: input.query.cat,
    prov: input.query.prov,
    pob: input.query.pob,
    tipo: input.query.tipo,
  };
  const matched = input.catalog.filter((card) =>
    portalCardMatches(card, filters, input.query.q, input.role),
  );
  const sorted = sortPortalCards(matched, input.query.sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / input.query.pageSize));
  const page = Math.min(input.query.page, totalPages);
  const start = (page - 1) * input.query.pageSize;
  const items = sorted.slice(start, start + input.query.pageSize).map(stripPortalCard);
  const groupCounts = portalGroupCounts(input.catalog);
  const pageGroups: Record<string, number> = {};
  for (const item of items) {
    const activo = item.propiedades[0]?.activoId?.trim();
    if (activo && groupCounts[activo]) pageGroups[activo] = groupCounts[activo];
  }

  let suspendedMatchCount = 0;
  if (input.countSuspended && total === 0) {
    suspendedMatchCount = (input.unpublished ?? []).filter((card) =>
      portalCardMatches(card, filters, "", "other"),
    ).length;
  }

  return {
    items,
    total,
    page,
    pageSize: input.query.pageSize,
    totalPages,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(page * input.query.pageSize, total),
    options: portalFilterOptions(input.catalog, input.allCategorias, filters),
    suspendedMatchCount,
    groupCounts: pageGroups,
    error: null,
  };
}

export function emptyPortalListing(query: PortalQuery, error: string | null): PortalListingPage {
  return {
    items: [],
    total: 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: 1,
    rangeStart: 0,
    rangeEnd: 0,
    options: { cat: [], prov: [], pob: [], tip: [] },
    suspendedMatchCount: 0,
    groupCounts: {},
    error,
  };
}
