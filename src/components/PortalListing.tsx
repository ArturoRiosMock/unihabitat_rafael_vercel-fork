"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, MapPin, Building, SlidersHorizontal, X,
  ArrowUpDown, List, Map as MapIcon,
  Ruler, Tag, Layers, Star,
  ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { PortalCardMedia, PortalCardSkeleton } from "@/components/PortalCardMedia";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { useFavoritos } from "@/hooks/useFavoritos";
import { createClient } from "@/lib/supabase/client";
import { ensureCompradorForEmail } from "@/app/actions/compradores";
import { fetchPortalMapPoints } from "@/app/actions/portal";
import { fmtM, getPortalPriceDisplay, shortAddr } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";
import { portalCardToAsset } from "@/lib/portal-listing";
import {
  PORTAL_PAGE_SIZE_OPTIONS,
  portalQueryToSearchParams,
  type PortalListingPage,
  type PortalMapPoint,
  type PortalPageSize,
  type PortalQuery,
  type PortalSortKey,
} from "@/lib/portal-listing";

const PortalAssetsMap = dynamic(
  () => import("@/components/PortalAssetsMap").then((mod) => mod.PortalAssetsMap),
  {
    ssr: false,
    loading: () => <div className="h-[480px] w-full animate-pulse rounded-xl border border-border bg-cream2" />,
  },
);

const SORT_OPTIONS: { value: PortalSortKey; label: string }[] = [
  { value: "none", label: "Sin ordenar" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "sqm_asc", label: "Superficie: menor a mayor" },
  { value: "sqm_desc", label: "Superficie: mayor a menor" },
  { value: "pob_az", label: "Población: A → Z" },
];

export function PortalListing({
  query,
  listing,
}: {
  query: PortalQuery;
  listing: PortalListingPage;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sensitiveVisible } = usePortalAuth();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(query.q);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [compradorId, setCompradorId] = useState<string | null>(null);
  const { isFavorito, toggleFavorito } = useFavoritos(compradorId);
  const [mapPoints, setMapPoints] = useState<PortalMapPoint[] | null>(null);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    setQ(query.q);
  }, [query.q]);

  useEffect(() => {
    const rawCat = searchParams.get("cat");
    if (rawCat && rawCat.toUpperCase() === "REO") {
      startTransition(() => {
        router.replace(`/portal${portalQueryToSearchParams(query)}`, { scroll: false });
      });
    }
  }, [query, router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const devCookie = document.cookie.split("; ").find((c) => c.startsWith("dev-auth="));
      if (devCookie) {
        try {
          const dev = JSON.parse(decodeURIComponent(devCookie.split("=").slice(1).join("=")));
          const cid = dev.compradorId ?? dev.comprador_id ?? null;
          if (cid) {
            if (!cancelled) setCompradorId(cid);
            return;
          }
        } catch { /* Supabase */ }
      }
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (cancelled || !user?.email) return;
        const nombre = (user.user_metadata?.nombre as string | undefined) || user.email;
        const cid = await ensureCompradorForEmail(user.email, nombre);
        if (!cancelled) setCompradorId(cid);
      } catch { /* sin sesión */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const push = useCallback((patch: Partial<PortalQuery>) => {
    const next: PortalQuery = { ...query, ...patch };
    const href = `/portal${portalQueryToSearchParams(next)}`;
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [query, router]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (q.trim() === query.q) return;
      push({ q: q.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q, query.q, push]);

  useEffect(() => {
    if (viewMode !== "map") return;
    let cancelled = false;
    setMapPoints(null);
    setMapError("");
    fetchPortalMapPoints({
      q: query.q,
      cat: query.cat,
      prov: query.prov,
      pob: query.pob,
      tipo: query.tipo,
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setMapError(result.error);
        setMapPoints([]);
        return;
      }
      setMapPoints(result.points);
    }).catch(() => {
      if (!cancelled) {
        setMapError("No se pudo cargar el mapa");
        setMapPoints([]);
      }
    });
    return () => { cancelled = true; };
  }, [viewMode, query.q, query.cat, query.prov, query.pob, query.tipo]);

  const { cat: catOptions, prov: provOptions, pob: pobOptions, tip: tipOptions } = listing.options;
  const hasFilters = Boolean(query.q || query.cat || query.prov || query.pob || query.tipo);

  const clearFilters = () => push({ q: "", cat: "", prov: "", pob: "", tipo: "", page: 1 });

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8">
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
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {([
              query.cat ? { label: query.cat, clear: () => push({ cat: "", prov: "", pob: "", page: 1 }) } : null,
              query.tipo ? { label: query.tipo, clear: () => push({ tipo: "", page: 1 }) } : null,
              query.prov ? { label: query.prov, clear: () => push({ prov: "", pob: "", page: 1 }) } : null,
              query.pob ? { label: query.pob, clear: () => push({ pob: "", page: 1 }) } : null,
            ] as const).filter((chip): chip is { label: string; clear: () => void } => chip !== null)
              .map((chip) => (
                <span key={chip.label} className="flex items-center gap-1 rounded-full bg-gold/20 px-3 py-1.5 text-xs font-medium text-gold">
                  {chip.label}
                  <button type="button" onClick={chip.clear}><X size={11} /></button>
                </span>
              ))}
          </div>
        </div>

        <div className="mt-6 w-full max-w-full rounded-lg border border-border bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-end gap-2.5">
            <FilterSelect
              label="Categoría"
              value={query.cat}
              onChange={(value) => push({ cat: value, prov: "", pob: "", page: 1 })}
              options={catOptions}
            />
            <FilterSelect
              label="Provincia"
              value={query.prov}
              onChange={(value) => push({ prov: value, pob: "", page: 1 })}
              options={provOptions}
            />
            <FilterSelect
              label="Población"
              value={query.pob}
              onChange={(value) => push({ pob: value, page: 1 })}
              options={pobOptions}
            />
            <FilterSelect
              label="Tipología"
              value={query.tipo}
              onChange={(value) => push({ tipo: value, page: 1 })}
              options={tipOptions}
            />
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

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin text-gold" aria-hidden />
              Actualizando propiedades…
            </span>
          ) : listing.total === 0 ? (
            <>0 propiedades publicadas</>
          ) : (
            <>
              Mostrando{" "}
              <span className="font-semibold text-navy">{listing.rangeStart}–{listing.rangeEnd}</span>
              {" "}de <span className="font-semibold text-navy">{listing.total}</span>
              {listing.total === 1 ? " propiedad" : " propiedades"}
              {listing.totalPages > 1 && (
                <span> · página <span className="font-semibold text-navy">{listing.page}</span> de {listing.totalPages}</span>
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
              value={query.pageSize}
              onChange={(event) => push({ pageSize: Number(event.target.value) as PortalPageSize, page: 1 })}
              className="cursor-pointer appearance-none rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-text outline-none transition-all focus:border-navy"
              aria-label="Propiedades por página"
            >
              {PORTAL_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={12} className="text-muted" />
            <select
              value={query.sort}
              onChange={(event) => push({ sort: event.target.value as PortalSortKey, page: 1 })}
              className="cursor-pointer appearance-none rounded-md border border-border bg-white px-2.5 py-1.5 text-xs text-text outline-none transition-all focus:border-navy"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {listing.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-red-800">No se pudieron cargar las propiedades</p>
          <p className="mt-1 text-xs text-red-600/90">{listing.error}</p>
        </div>
      ) : listing.items.length > 0 ? (
        <>
          {viewMode === "map" ? (
            mapError ? (
              <div className="flex h-[480px] items-center justify-center rounded-xl border border-border bg-white text-sm text-muted">
                {mapError}
              </div>
            ) : mapPoints == null ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                <div className="col-span-full h-[480px] animate-pulse rounded-xl border border-border bg-cream2" />
              </div>
            ) : (
              <PortalAssetsMap points={mapPoints} />
            )
          ) : (
            <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${pending ? "opacity-70" : ""}`}>
              {listing.items.map((card) => {
                const asset = portalCardToAsset(card);
                const price = getPortalPriceDisplay(asset);
                const activo = card.propiedades[0]?.activoId ?? "";
                const groupSize = activo ? listing.groupCounts[activo] : undefined;
                return (
                  <Link
                    key={card.id}
                    href={assetPortalHref(asset)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative">
                      <PortalCardMedia
                        map={card.map}
                        lat={card.lat}
                        lng={card.lng}
                        alt={card.pob && card.pob !== "—" ? card.pob : "Mapa del inmueble"}
                      />
                      <div className="absolute left-3 top-3 flex gap-1.5">
                        {card.propiedades[0]?.categoria && (
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            card.propiedades[0].categoria === "NPL"
                              ? "bg-amber-500/90 text-white"
                              : "bg-emerald-600/90 text-white"
                          }`}>
                            {card.propiedades[0].categoria}
                          </span>
                        )}
                        {card.tip && (
                          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                            {card.tip}
                          </span>
                        )}
                      </div>
                      {groupSize && groupSize > 1 && (
                        <div className="absolute bottom-3 left-3">
                          <span className="flex items-center gap-1 rounded-md bg-navy/85 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                            <Layers size={11} />
                            {groupSize} inmuebles asociados al {card.propiedades[0]?.categoria ?? "NPL"}
                          </span>
                        </div>
                      )}
                      {compradorId && (
                        <button
                          type="button"
                          aria-label={isFavorito(card.id) ? "Quitar de favoritos" : "Marcar como favorito"}
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleFavorito(card.id); }}
                          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-all hover:bg-white"
                        >
                          <Star size={16} className={isFavorito(card.id) ? "fill-gold text-gold" : "text-muted hover:text-gold"} />
                        </button>
                      )}
                    </div>
                    <div className="flex h-[148px] flex-col p-4">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{card.pob}, {card.prov}</span>
                        {card.cp && <span className="shrink-0 text-border">· {card.cp}</span>}
                      </div>
                      <h3 className="truncate text-sm font-semibold text-navy">
                        {shortAddr(asset)}
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </h3>
                      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
                        {card.sqm ? (
                          <span className="flex items-center gap-1">
                            <Ruler size={11} /> {fmtM(card.sqm)}
                          </span>
                        ) : null}
                        {sensitiveVisible && card.id && (
                          <span className="flex items-center gap-1 truncate">
                            <Tag size={10} />
                            <span className="max-w-[120px] truncate font-mono text-[10px]">{card.id}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-auto flex items-end justify-between border-t border-border/50 pt-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{price.label}</div>
                          <span className="text-lg font-bold text-navy">{price.value}</span>
                        </div>
                        {price.kind === "precio" && card.sqm && card.precio ? (
                          <span className="text-[10px] text-muted">
                            {Math.round(card.precio / card.sqm).toLocaleString("es-ES")} €/m²
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {viewMode === "list" && listing.totalPages > 1 && (
            <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Paginación de propiedades">
              <button
                type="button"
                disabled={listing.page <= 1}
                onClick={() => push({ page: Math.max(1, listing.page - 1) })}
                className="flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-navy transition-colors hover:border-navy disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="px-2 text-xs text-muted">
                Página <span className="font-semibold text-navy">{listing.page}</span> de {listing.totalPages}
              </span>
              <button
                type="button"
                disabled={listing.page >= listing.totalPages}
                onClick={() => push({ page: Math.min(listing.totalPages, listing.page + 1) })}
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
          {listing.suspendedMatchCount > 0 ? (
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Hay {listing.suspendedMatchCount} inmueble{listing.suspendedMatchCount === 1 ? "" : "s"} con estos filtros
              {query.cat ? ` (${query.cat})` : ""} en el CRM, pero ninguno está publicado.
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

export function PortalListingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8" aria-busy="true" aria-label="Cargando propiedades">
      <div className="mb-10 h-[280px] rounded-2xl bg-navy" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <PortalCardSkeleton key={index} />)}
      </div>
    </div>
  );
}
