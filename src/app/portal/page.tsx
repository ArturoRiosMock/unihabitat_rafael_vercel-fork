"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useApp } from "@/lib/context";
import { fmtM, getPortalPriceDisplay, shortAddr } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";
import {
  buildAssetListFilterOptions,
  buildCatFilterOptions,
  assetMatchesListFilters,
  portalCatalogAssets,
  countAssetsMatchingListFilters,
} from "@/lib/asset-filters";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, MapPin, Building, SlidersHorizontal, X,
  ArrowUpDown, List, Map as MapIcon,
  Ruler, Tag, Layers, Star,
  ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { Suspense } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { InteractiveMap } from "@/components/InteractiveMap";
import { PortalAssetsMap } from "@/components/PortalAssetsMap";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { useFavoritos } from "@/hooks/useFavoritos";
import { createClient } from "@/lib/supabase/client";
import { ensureCompradorForEmail } from "@/app/actions/compradores";

function normalizePortalCat(raw: string | null): string {
  if (!raw) return "";
  // REO no es categoría de filtro: catálogo completo.
  if (raw.toUpperCase() === "REO") return "";
  return raw;
}

type SortKey = "none" | "price_asc" | "price_desc" | "sqm_asc" | "sqm_desc" | "pob_az";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "none", label: "Sin ordenar" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "sqm_asc", label: "Superficie: menor a mayor" },
  { value: "sqm_desc", label: "Superficie: mayor a menor" },
  { value: "pob_az", label: "Población: A → Z" },
];

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const SKELETON_CARD_COUNT = 6;

function PortalPropertyCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
      aria-hidden
    >
      <div className="relative h-[180px] overflow-hidden bg-cream2">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-cream2 via-white to-cream2" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <div className="h-5 w-14 animate-pulse rounded-md bg-border2" />
          <div className="h-5 w-16 animate-pulse rounded-md bg-border2" />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="h-3 w-3/4 max-w-[200px] animate-pulse rounded bg-cream2" />
        <div className="h-4 w-full animate-pulse rounded bg-cream2" />
        <div className="flex gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-cream2" />
          <div className="h-3 w-20 animate-pulse rounded bg-cream2" />
        </div>
        <div className="flex items-end justify-between border-t border-border/50 pt-3">
          <div className="h-6 w-24 animate-pulse rounded bg-cream2" />
          <div className="h-3 w-14 animate-pulse rounded bg-cream2" />
        </div>
      </div>
    </div>
  );
}

function PortalContent() {
  const { assets, assetsLoading, assetsError } = useApp();
  const { sensitiveVisible, isStaff, userResolved } = usePortalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalogAssets = useMemo(
    () => portalCatalogAssets(assets, userResolved && isStaff),
    [assets, isStaff, userResolved],
  );

  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState(() => normalizePortalCat(searchParams.get("cat")));
  const [fProv, setFProv] = useState(() => searchParams.get("prov") ?? "");
  const [fPob, setFPob] = useState(() => searchParams.get("pob") ?? "");
  const [fTipo, setFTipo] = useState(() => searchParams.get("tipo") ?? "");
  const [sortBy, setSortBy] = useState<SortKey>("none");
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const { isFavorito, toggleFavorito } = useFavoritos(compradorId);

  // Leer URL → estado (pob es filtro de población, no búsqueda libre).
  useEffect(() => {
    const rawCat = searchParams.get("cat");
    if (rawCat && rawCat.toUpperCase() === "REO") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cat");
      router.replace(`/portal${next.toString() ? `?${next}` : ""}`, { scroll: false });
      return;
    }
    setFCat(normalizePortalCat(rawCat));
    setFProv(searchParams.get("prov") ?? "");
    setFPob(searchParams.get("pob") ?? "");
    setFTipo(searchParams.get("tipo") ?? "");
  }, [searchParams, router]);

  // Escribir estado → URL (solo cat|prov|pob|tipo).
  useEffect(() => {
    const params = new URLSearchParams();
    if (fCat) params.set("cat", fCat);
    if (fProv) params.set("prov", fProv);
    if (fPob) params.set("pob", fPob);
    if (fTipo) params.set("tipo", fTipo);
    const next = params.toString();
    const cur = new URLSearchParams();
    for (const k of ["cat", "prov", "pob", "tipo"] as const) {
      const v = searchParams.get(k);
      if (v) cur.set(k, v);
    }
    if (cur.toString() === next) return;
    router.replace(`/portal${next ? `?${next}` : ""}`, { scroll: false });
  }, [fCat, fProv, fPob, fTipo, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const devCookie = document.cookie.split("; ").find(c => c.startsWith("dev-auth="));
      if (devCookie) {
        try {
          const dev = JSON.parse(decodeURIComponent(devCookie.split("=").slice(1).join("=")));
          const cid = dev.compradorId ?? dev.comprador_id ?? null;
          if (cid) {
            if (!cancelled) setCompradorId(cid);
            return;
          }
        } catch { /* fallthrough — probamos Supabase */ }
      }
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (cancelled || !user?.email) return;
        const nombre = (user.user_metadata?.nombre as string | undefined) || user.email;
        const cid = await ensureCompradorForEmail(user.email, nombre);
        if (!cancelled) setCompradorId(cid);
      } catch { /* sin sesión real — sin compradorId */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeListFilters = useMemo(
    () => ({ cat: fCat, prov: fProv, pob: fPob, tipo: fTipo }),
    [fCat, fProv, fPob, fTipo],
  );

  // Categorías: mismo listado que /admin. Resto de filtros en cascada según catálogo visible.
  const listFilterOptions = useMemo(
    () => buildAssetListFilterOptions(catalogAssets, activeListFilters),
    [catalogAssets, activeListFilters],
  );
  const catOptions = useMemo(() => buildCatFilterOptions(assets), [assets]);
  const { prov: provOptions, pob: pobOptions, tip: tipOptions } = listFilterOptions;

  const handleCatChange = (v: string) => {
    setFCat(v);
    setFProv("");
    setFPob("");
  };

  const handleProvChange = (v: string) => {
    setFProv(v);
    if (fPob) setFPob("");
  };

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

    const result = catalogAssets.filter(a => {
      if (!assetMatchesListFilters(a, {
        cat: fCat,
        prov: fProv,
        pob: fPob,
        tipo: fTipo,
      })) return false;
      if (terms.length === 0) return true;

      const propBlob = a.propiedades.map((p) => [
        p.activoId, p.categoria, p.idPrinex, p.idProperty, p.collateralId,
        p.mainLocalCcc14, p.portfolio,
        ...(sensitiveVisible ? [p.propietario] : []),
      ].join(" ")).join(" ");
      const searchable = [
        a.id, a.pob, a.prov, a.cp, a.ccaa,
        a.addr, a.fullAddr, a.tvia, a.nvia, a.num,
        a.tip, a.bien, a.clase, a.uso,
        a.precio != null ? String(a.precio) : "",
        propBlob,
      ].filter(Boolean).join(" ").toLowerCase();

      return terms.every(t => searchable.includes(t));
    });

    if (sortBy === "price_asc") result.sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity));
    else if (sortBy === "price_desc") result.sort((a, b) => (b.precio ?? 0) - (a.precio ?? 0));
    else if (sortBy === "sqm_asc") result.sort((a, b) => (a.sqm ?? Infinity) - (b.sqm ?? Infinity));
    else if (sortBy === "sqm_desc") result.sort((a, b) => (b.sqm ?? 0) - (a.sqm ?? 0));
    else if (sortBy === "pob_az") result.sort((a, b) => (a.pob || "").localeCompare(b.pob || ""));

    return result;
  }, [catalogAssets, q, fCat, fProv, fPob, fTipo, sortBy, sensitiveVisible]);

  const suspendedMatchCount = useMemo(() => {
    if (isStaff || filtered.length > 0) return 0;
    return countAssetsMatchingListFilters(
      assets.filter((a) => !a.pub),
      activeListFilters,
    );
  }, [assets, isStaff, filtered.length, activeListFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [q, fCat, fProv, fPob, fTipo, sortBy, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const hasFilters = Boolean(q || fCat || fProv || fPob || fTipo);

  const clearFilters = useCallback(() => {
    setQ(""); setFCat(""); setFProv(""); setFPob(""); setFTipo("");
  }, []);

  // Group assets by activo (loan) ID for "X inmuebles asociados" badge.
  const groupsByContract = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of catalogAssets) {
      const activo = a.propiedades[0]?.activoId;
      if (activo && activo !== "—" && activo.trim()) {
        if (!map[activo]) map[activo] = [];
        map[activo].push(a.id);
      }
    }
    return map;
  }, [catalogAssets]);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8">
      {/* ── Hero ── */}
      <div className="mb-10 overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-navy3 to-navy p-8 md:p-12">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-white md:text-3xl">
            Encuentra tu próxima oportunidad inmobiliaria
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Explora nuestra selección de activos NPL y REO. Propiedades verificadas con información catastral completa.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/10 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-gold/50 focus:ring-2 focus:ring-gold/10"
              placeholder="Buscar por ref. catastral, municipio, provincia, dirección, ID, cartera..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {([
              fCat ? { label: fCat, clear: () => setFCat("") } : null,
              fTipo ? { label: fTipo, clear: () => setFTipo("") } : null,
              fProv ? { label: fProv, clear: () => setFProv("") } : null,
              fPob ? { label: fPob, clear: () => setFPob("") } : null,
            ] as const).filter((c): c is { label: string; clear: () => void } => c !== null)
              .map((chip) => (
                <span key={chip.label} className="flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1.5 text-xs font-medium text-gold">
                  {chip.label}
                  <button type="button" onClick={chip.clear}><X size={11} /></button>
                </span>
              ))}
          </div>
        </div>

        {/* ── Filter bar (dentro del hero) ── */}
        <div className="mt-6 w-full max-w-full rounded-lg border border-border bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-end gap-2.5">
            <FilterSelect label="Categoría" value={fCat} onChange={handleCatChange} options={catOptions} />
            <FilterSelect label="Provincia" value={fProv} onChange={handleProvChange} options={provOptions} />
            <FilterSelect label="Población" value={fPob} onChange={setFPob} options={pobOptions} />
            <FilterSelect label="Tipología" value={fTipo} onChange={setFTipo} options={tipOptions} />
            <div className="h-8 w-px self-end bg-border2" />
            <div className="flex gap-1.5 self-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-border px-2.5 py-[7px] text-muted transition-colors hover:border-red hover:text-red"
                aria-label="Limpiar filtros"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results bar with sort + pagination ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {assetsLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin text-gold" aria-hidden />
              Cargando propiedades…
            </span>
          ) : filtered.length === 0 ? (
            <>0 propiedades publicadas</>
          ) : (
            <>
              Mostrando{" "}
              <span className="font-semibold text-navy">{rangeStart}–{rangeEnd}</span>
              {" "}de <span className="font-semibold text-navy">{filtered.length}</span>
              {filtered.length === 1 ? " propiedad" : " propiedades"}
              {totalPages > 1 && (
                <span> · página <span className="font-semibold text-navy">{safePage}</span> de {totalPages}</span>
              )}
            </>
          )}
          {hasFilters && <span> · filtros activos</span>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-border bg-white">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-navy text-white" : "text-muted hover:text-navy"}`}
              aria-pressed={viewMode === "list"}
            >
              <List size={13} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${viewMode === "map" ? "bg-navy text-white" : "text-muted hover:text-navy"}`}
              aria-pressed={viewMode === "map"}
            >
              <MapIcon size={13} /> Mapa
            </button>
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-navy">
              <X size={12} /> Limpiar
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Por página</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value) as PageSize)}
              disabled={assetsLoading}
              className="cursor-pointer appearance-none rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-text outline-none transition-all focus:border-navy disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Propiedades por página"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={12} className="text-muted" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              disabled={assetsLoading}
              className="cursor-pointer appearance-none rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-text outline-none transition-all focus:border-navy disabled:cursor-not-allowed disabled:opacity-50"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Property grid ── */}
      {assetsLoading ? (
        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Cargando propiedades"
        >
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
            <PortalPropertyCardSkeleton key={i} />
          ))}
        </div>
      ) : assetsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-red-800">No se pudieron cargar las propiedades</p>
          <p className="mt-1 text-xs text-red-600/90">{assetsError}</p>
        </div>
      ) : filtered.length > 0 ? (
        <>
        {viewMode === "map" ? (
          <PortalAssetsMap assets={filtered} />
        ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map(a => {
            const price = getPortalPriceDisplay(a);
            return (
            <Link
              key={a.id}
              href={assetPortalHref(a)}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              {/* Image + badges */}
              <div className="relative">
                <InteractiveMap
                  key={`map-${a.id}-${a.lat ?? "x"}-${a.lng ?? "x"}`}
                  lat={a.lat}
                  lng={a.lng}
                  mapImageUrl={a.map}
                  label={a.pob && a.pob !== "—" ? a.pob : undefined}
                  className="h-[180px] w-full transition-transform group-hover:scale-[1.02]"
                />
                {/* NPL / REO badge */}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {a.propiedades[0]?.categoria && (
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      a.propiedades[0].categoria === "NPL"
                        ? "bg-amber-500/90 text-white"
                        : "bg-emerald-600/90 text-white"
                    }`}>
                      {a.propiedades[0].categoria}
                    </span>
                  )}
                  {a.tip && (
                    <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      {a.tip}
                    </span>
                  )}
                </div>
                {/* Collateral group badge */}
                {(() => {
                  const activo = a.propiedades[0]?.activoId ?? "";
                  const group = activo ? groupsByContract[activo] : undefined;
                  if (!group || group.length <= 1) return null;
                  return (
                    <div className="absolute bottom-3 left-3">
                      <span className="flex items-center gap-1 rounded-md bg-navy/85 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                        <Layers size={11} />
                        {group.length} inmuebles asociados al {a.propiedades[0]?.categoria ?? "NPL"}
                      </span>
                    </div>
                  );
                })()}
                {compradorId && (
                  <button
                    type="button"
                    aria-label={isFavorito(a.id) ? "Quitar de favoritos" : "Marcar como favorito"}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorito(a.id); }}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all hover:bg-white"
                  >
                    <Star size={16} className={isFavorito(a.id) ? "fill-gold text-gold" : "text-muted hover:text-gold"} />
                  </button>
                )}
              </div>

              {/* Card content */}
              <div className="p-4">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{a.pob}, {a.prov}</span>
                  {a.cp && <span className="shrink-0 text-border">· {a.cp}</span>}
                </div>
                <h3 className="truncate text-sm font-semibold text-navy">
                  {shortAddr(a)}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </h3>

                {/* Details row */}
                <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
                  {a.sqm && (
                    <span className="flex items-center gap-1">
                      <Ruler size={11} /> {fmtM(a.sqm)}
                    </span>
                  )}
                  {sensitiveVisible && a.id && (
                    <span className="flex items-center gap-1 truncate">
                      <Tag size={10} />
                      <span className="max-w-[120px] truncate font-mono text-[10px]">{a.id}</span>
                    </span>
                  )}
                </div>

                {/* Precio (CDR) o Deuda (NPL) */}
                <div className="mt-3 flex items-end justify-between border-t border-border/50 pt-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{price.label}</div>
                    <span className="text-lg font-bold text-navy">{price.value}</span>
                  </div>
                  {price.kind === "precio" && a.sqm && a.precio ? (
                    <span className="text-[10px] text-muted">
                      {Math.round(a.precio / a.sqm).toLocaleString("es-ES")} €/m²
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          );
          })}
        </div>
        )}

        {viewMode === "list" && totalPages > 1 && (
          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="Paginación de propiedades"
          >
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span className="px-2 text-xs text-muted">
              Página <span className="font-semibold text-navy">{safePage}</span> de {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </nav>
        )}
        </>
      ) : (
        <div className="py-20 text-center">
          <Building size={40} strokeWidth={1} className="mx-auto text-border" />
          <p className="mt-3 text-sm font-medium text-navy">No hay propiedades que coincidan</p>
          {suspendedMatchCount > 0 ? (
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Hay {suspendedMatchCount} inmueble{suspendedMatchCount === 1 ? "" : "s"} con estos filtros
              {fCat ? ` (${fCat})` : ""} en el CRM, pero ninguno está publicado.
              Actívalos desde <Link href="/admin" className="font-medium text-gold hover:text-gold2">Admin → Propiedades</Link>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">Prueba a ajustar los filtros de búsqueda</p>
          )}
          {hasFilters && (
            <button onClick={clearFilters} className="mx-auto mt-4 flex items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold2">
              <SlidersHorizontal size={12} /> Limpiar todos los filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense>
      <PortalContent />
    </Suspense>
  );
}
