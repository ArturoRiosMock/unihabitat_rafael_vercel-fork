"use client";

import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/lib/context";
import { fmt, fmtM, displayAssetAddress, getProceso, getDeudaTotal } from "@/lib/utils";
import {
  buildAssetListFilterOptions,
  assetMatchesListFilters,
} from "@/lib/asset-filters";
import Link from "next/link";
import type { Asset } from "@/lib/types";
import { Search, Star, X, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Plus, Check, Trash2, Download } from "lucide-react";
import { UploadActivosModal } from "./UploadActivosModal";
import { FilterSelect } from "@/components/FilterSelect";
import { deleteAssetsByIds, toggleAssetPub } from "@/app/actions/assets";
import { isAdmin } from "@/lib/auth-helpers";
import { getCategoria, getFaseInterna, getFaseC, getActivoId } from "@/lib/utils";
import { compareByPublicationDate, publicationListLabel } from "@/lib/asset-publication";
import { downloadAssetsWorkbook, resolveAssetsForExport } from "@/lib/asset-excel";
import { toast } from "@/lib/toast";

type SortCol = "prov" | "pob" | "sqm" | "precio" | "cat" | "addr" | "cp" | "tip" | "fase" | "proceso" | "deuda" | "pub" | "publishedAt";

const ASSET_GRID =
  "grid-cols-[32px_28px_72px_100px_100px_1fr_56px_56px_100px_minmax(6rem,1fr)_minmax(4.5rem,88px)_72px_90px_108px_95px_28px]";

const SORT_LABELS: Record<SortCol, string> = {
  cat: "Cat.",
  prov: "Provincia",
  pob: "Población",
  addr: "Dirección",
  cp: "C.P.",
  sqm: "m²",
  tip: "Tipo",
  fase: "Situación",
  proceso: "Proceso",
  deuda: "Deuda",
  pub: "Estado",
  publishedAt: "Publicación",
  precio: "Precio",
};

const TABLE_COLS: SortCol[] = [
  "cat", "prov", "pob", "addr", "cp", "sqm", "tip", "fase", "proceso", "deuda", "pub", "publishedAt", "precio",
];

const PAGE_SIZE_OPTIONS = [250, 500, 1000] as const;
const DEFAULT_PAGE_SIZE = 500;

const pillClass: Record<string, string> = {
  "tp-viv": "bg-blue/8 text-blue",
  "tp-park": "bg-[#5a7a8a]/8 text-[#5a7a8a]",
  "tp-tras": "bg-muted/8 text-muted",
  "tp-local": "bg-orange/8 text-orange",
  "fp-pub": "bg-green/8 text-green",
  "fp-sus": "bg-red/8 text-red",
  "fp-seg": "bg-blue/8 text-blue",
  "fp-info": "bg-blue/8 text-blue",
  "fp-ofe": "bg-gold/15 text-gold3",
  "fp-neg": "bg-orange/8 text-orange",
  "fp-res": "bg-orange/8 text-orange",
  "fp-cer": "bg-muted/8 text-muted",
  "fp-nd": "bg-muted/8 text-muted",
};

function PublicationDate({ asset }: { asset: Asset }) {
  const publication = publicationListLabel(asset);
  return (
    <span className="whitespace-nowrap text-[11px] text-muted" title={publication.title}>
      {publication.text}
    </span>
  );
}

export default function ActivosPage() {
  const { assets, toggleFav, toggleChk, toggleChkAll, session, removeAssetsByIds } = useApp();
  const userIsAdmin = isAdmin(session);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fProv, setFProv] = useState("");
  const [fPob, setFPob] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fFase, setFFase] = useState("");
  const [fProceso, setFProceso] = useState("");
  const [fDeuda, setFDeuda] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("prov");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    let res = assets.filter(a => {
      if (!assetMatchesListFilters(a, {
        cat: fCat,
        prov: fProv,
        pob: fPob,
        tipo: fTipo,
        estado: fEstado,
        fase: fFase,
        proceso: fProceso,
        deuda: fDeuda,
      })) return false;
      if (favOnly && !a.fav) return false;
      if (q) {
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        const propBlob = a.propiedades.map((p) => [
          p.id, p.activoId, p.categoria, p.propietario, p.contacto,
          p.faseInterna, p.proceso, p.collateralId, p.idPrinex, p.idProperty,
          p.mainLocalCcc14, p.portfolio, p.folder,
        ].join(" ")).join(" ");
        const blob = [
          a.id, a.prov, a.pob, a.cp, a.ccaa,
          a.addr, a.fullAddr, a.tvia, a.nvia, a.num,
          a.tip, a.bien, a.clase, a.uso,
          String(a.precio || ""), String(a.sqm || ""),
          propBlob,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!terms.every(t => blob.includes(t))) return false;
      }
      return true;
    });
    res.sort((a, b) => {
      if (sortCol === "publishedAt") return compareByPublicationDate(a, b, sortDir);
      const va = sortCol === "addr" ? displayAssetAddress(a)
        : sortCol === "cat" ? getCategoria(a)
        : sortCol === "fase" ? getFaseInterna(a)
        : sortCol === "proceso" ? getProceso(a)
        : sortCol === "deuda" ? getDeudaTotal(a)
        : sortCol === "pub" ? (a.pub ? 1 : 0)
        : a[sortCol as "prov" | "pob" | "sqm" | "precio" | "cp" | "tip"];
      const vb = sortCol === "addr" ? displayAssetAddress(b)
        : sortCol === "cat" ? getCategoria(b)
        : sortCol === "fase" ? getFaseInterna(b)
        : sortCol === "proceso" ? getProceso(b)
        : sortCol === "deuda" ? getDeudaTotal(b)
        : sortCol === "pub" ? (b.pub ? 1 : 0)
        : b[sortCol as "prov" | "pob" | "sqm" | "precio" | "cp" | "tip"];
      if (va === null || va === undefined) return sortDir;
      if (vb === null || vb === undefined) return -sortDir;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * sortDir;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
      return 0;
    });
    return res;
  }, [assets, q, fCat, fProv, fPob, fTipo, fEstado, fFase, fProceso, fDeuda, favOnly, sortCol, sortDir]);

  // Reinicia a la página 1 cuando cambian filtros, búsqueda, orden o pageSize:
  // evita quedar "atrapado" en página 5 tras filtrar a 3 resultados.
  useEffect(() => {
    setCurrentPage(1);
  }, [q, fCat, fProv, fPob, fTipo, fEstado, fFase, fProceso, fDeuda, favOnly, sortCol, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const activeListFilters = useMemo(
    () => ({
      cat: fCat, prov: fProv, pob: fPob, tipo: fTipo, estado: fEstado,
      fase: fFase, proceso: fProceso, deuda: fDeuda,
    }),
    [fCat, fProv, fPob, fTipo, fEstado, fFase, fProceso, fDeuda],
  );

  const {
    cat: catOptions, prov: provOptions, pob: pobOptions, tip: tipOptions,
    estado: estadoOptions, fase: faseOptions, proceso: procesoOptions, deuda: deudaOptions,
  } = useMemo(() => buildAssetListFilterOptions(assets, activeListFilters), [assets, activeListFilters]);

  const handleCatChange = (v: string) => {
    setFCat(v);
    setFProv("");
    setFPob("");
  };

  const handleProvChange = (v: string) => {
    setFProv(v);
    if (fPob) setFPob("");
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1);
    else {
      setSortCol(col);
      setSortDir(col === "publishedAt" ? -1 : 1);
    }
  };

  const clearFilters = () => {
    setQ(""); setFCat(""); setFProv(""); setFPob(""); setFTipo(""); setFEstado("");
    setFFase(""); setFProceso(""); setFDeuda("");
    if (favOnly) setFavOnly(false);
  };

  const selectedInFiltered = useMemo(() => filtered.filter(a => a.chk).map(a => a.id), [filtered]);
  const selectedCount = selectedInFiltered.length;
  const exportSelection = useMemo(() => resolveAssetsForExport(filtered), [filtered]);
  const excelTitle = exportSelection.source === "selected"
    ? `Descarga ${exportSelection.assets.length} activo(s) seleccionado(s) dentro del filtro actual`
    : `Sin selección: descarga los ${exportSelection.assets.length} activo(s) filtrados, de todas las páginas`;

  const handleDownloadExcel = () => {
    if (exportSelection.assets.length === 0) return;
    downloadAssetsWorkbook(exportSelection.assets);
  };

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedCount} activo(s) seleccionado(s)?\n\nSe borrarán también mensajes, notas, documentos y oportunidades asociados.`)) return;
    setDeleting(true);
    try {
      const { deleted } = await deleteAssetsByIds(selectedInFiltered);
      removeAssetsByIds(selectedInFiltered);
      try {
        window.dispatchEvent(new Event("propcrm-assets-updated"));
      } catch { /* ignore */ }
      toast.success("Activos eliminados", { description: `${deleted} activo(s) eliminados correctamente.` });
    } catch (err) {
      toast.error("Error al borrar los activos seleccionados", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeleting(false);
    }
  };

  // (Bulk "Forzar Catastro" se eliminó del flujo de uploads. La acción manual
  // sigue disponible por inmueble desde la ficha en /admin/assets/[id].)

  const handleTogglePub = async (id: string) => {
    try {
      await toggleAssetPub(id);
      window.dispatchEvent(new Event("propcrm-assets-updated"));
    } catch (err) {
      toast.error("No se pudo cambiar el estado de publicación", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const groupCountByActivoId = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assets) {
      const id = getActivoId(a);
      if (!id || id === "—") continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [assets]);

  const allChk = filtered.length > 0 && filtered.every(a => a.chk);

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown size={11} className="opacity-40" />;
    return sortDir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  };

  return (
    <>
      <UploadActivosModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {/* Topbar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">Propiedades</h1>
          <span className="rounded-md bg-cream px-2.5 py-0.5 text-xs font-medium text-muted">{assets.length} activos</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold">{userIsAdmin ? "Admin" : "Agente"}</span>
          {userIsAdmin && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-navy3"
            >
              <Plus size={14} /> Nuevo Activo
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-4 text-sm text-text shadow-sm outline-none transition-all placeholder:text-muted/70 focus:border-navy focus:ring-2 focus:ring-navy/5"
            placeholder="Buscar por dirección, municipio, referencia, cartera, tipología..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="mb-3 rounded-lg border border-border bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-end gap-2.5">
            <FilterSelect label="Categoría" value={fCat} onChange={handleCatChange} options={catOptions} />
            <FilterSelect label="Provincia" value={fProv} onChange={handleProvChange} options={provOptions} />
            <FilterSelect label="Población" value={fPob} onChange={setFPob} options={pobOptions} />
            <FilterSelect label="Tipología" value={fTipo} onChange={setFTipo} options={tipOptions} />
            <FilterSelect label="Estado" value={fEstado} onChange={setFEstado} options={estadoOptions} />
            <FilterSelect label="Situación" value={fFase} onChange={setFFase} options={faseOptions} />
            <FilterSelect label="Proceso" value={fProceso} onChange={setFProceso} options={procesoOptions} />
            <FilterSelect label="Deuda" value={fDeuda} onChange={setFDeuda} options={deudaOptions} />
            <div className="flex min-w-[90px] flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Favoritos</label>
              <button
                onClick={() => setFavOnly(!favOnly)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-[7px] text-xs font-medium transition-all ${favOnly ? "border-gold/30 bg-gold/5 text-gold" : "border-border bg-cream2 text-muted"}`}
              >
                <Star size={12} className={favOnly ? "fill-gold" : ""} />
                {favOnly ? "Favoritos" : "Todos"}
              </button>
            </div>
            <div className="h-8 w-px self-end bg-border2" />
            <div className="flex gap-1.5 self-end">
              <button type="button" onClick={clearFilters} className="rounded-md border border-border px-2.5 py-[7px] text-muted transition-colors hover:border-red hover:text-red" title="Limpiar filtros"><X size={14} /></button>
            </div>
          </div>
        </div>

        {/* Results bar */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <p className="text-xs text-muted">
            Mostrando <strong className="font-semibold text-navy">{paged.length}</strong> de {filtered.length} activos
            {filtered.length !== assets.length && <> (filtrado de {assets.length})</>}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ordenar:</span>
            {([["prov", "Provincia"], ["pob", "Población"], ["sqm", "m²"], ["precio", "Precio"], ["publishedAt", "F. publicación"]] as const).map(([col, label]) => (
              <button
                key={col}
                type="button"
                onClick={() => handleSort(col)}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  sortCol === col ? "border-navy/20 bg-navy/5 text-navy" : "border-border bg-white text-muted hover:border-navy/20"
                }`}
              >
                {label} <SortIcon col={col} />
              </button>
            ))}
            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={exportSelection.assets.length === 0}
              title={excelTitle}
              className="flex items-center gap-1.5 rounded-md border border-navy/20 bg-white px-2.5 py-1 text-[11px] font-medium text-navy transition-colors hover:bg-navy/5 disabled:opacity-40"
            >
              <Download size={12} /> Descargar Excel{exportSelection.assets.length > 0 ? ` (${exportSelection.assets.length})` : ""}
            </button>
            {userIsAdmin && (
              <>
                <div className="mx-0.5 hidden h-4 w-px self-center bg-border2 sm:block" aria-hidden />
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={deleting || selectedCount === 0}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
                >
                  <Trash2 size={12} /> Borrar seleccionados{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-white shadow-sm">
          <div className={`grid ${ASSET_GRID} items-center gap-1.5 bg-navy px-3.5 py-2.5`}>
            <div
              className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] transition-all ${allChk ? "border-gold bg-gold text-white" : "border-white/25 hover:border-white/50"}`}
              onClick={() => toggleChkAll(filtered.map(a => a.id))}
            >{allChk && <Check size={10} strokeWidth={3} />}</div>
            <div />
            {TABLE_COLS.map(col => (
              <div key={col} className={`flex cursor-pointer select-none items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${sortCol === col ? "text-gold" : "text-white/35 hover:text-white/60"}`} onClick={() => handleSort(col)}>
                {SORT_LABELS[col]}
              </div>
            ))}
            <div />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">No se encontraron activos</div>
          ) : (
            paged.map(a => (
              <Link
                key={a.id}
                href={`/admin/assets/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`grid ${ASSET_GRID} items-start gap-1.5 border-b border-border2 px-3.5 py-1.5 transition-colors last:border-b-0 hover:bg-cream/50 min-h-[46px]`}
              >
                <div
                  className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] transition-all ${a.chk ? "border-navy bg-navy text-white" : "border-border hover:border-navy/40"}`}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggleChk(a.id); }}
                >{a.chk && <Check size={10} strokeWidth={3} />}</div>
                <div
                  className="cursor-pointer"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(a.id); }}
                >
                  <Star size={14} className={`transition-all ${a.fav ? "fill-gold text-gold" : "text-border hover:text-gold/50"}`} />
                </div>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-xs">{getCategoria(a)}</span>
                  {(groupCountByActivoId.get(getActivoId(a)) ?? 0) > 1 && (
                    <span className="w-fit rounded bg-navy/8 px-1 py-px text-[9px] font-semibold text-navy">
                      {groupCountByActivoId.get(getActivoId(a))} inmuebles
                    </span>
                  )}
                </span>
                <span className="truncate text-xs">{a.prov}</span>
                <span className="truncate text-xs">{a.pob}</span>
                <span className="truncate text-xs text-muted">
                  {displayAssetAddress(a)}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </span>
                <span className="font-mono text-[11px] text-muted">{a.cp}</span>
                <span className="text-xs text-muted">{fmtM(a.sqm)}</span>
                <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ${pillClass[a.tipC] || ""}`}>{a.tip}</span>
                <span className={`min-w-0 max-w-full rounded-md px-2 py-0.5 text-left text-[10px] font-semibold leading-snug whitespace-normal break-words ${pillClass[getFaseC(a)] || ""}`}>{getFaseInterna(a)}</span>
                <span className="truncate text-[10px] text-muted" title={getProceso(a)}>{getProceso(a)}</span>
                <span className="text-xs font-medium text-navy">{getDeudaTotal(a) != null ? fmt(getDeudaTotal(a)!) : "—"}</span>
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); void handleTogglePub(a.id); }}
                  className={`flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    a.pub
                      ? "bg-green/10 text-green hover:bg-green/20"
                      : "bg-muted/10 text-muted hover:bg-muted/20"
                  }`}
                  title={a.pub ? "Hacer no publicado" : "Hacer publicado"}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${a.pub ? "bg-green" : "bg-muted"}`} />
                  {a.pub ? "Publicado" : "No publicado"}
                </button>
                <PublicationDate asset={a} />
                <span className="text-sm font-semibold text-navy">{fmt(a.precio)}</span>
                <ChevronRight size={14} className="text-border" />
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted">Página <strong className="font-semibold text-navy">{safePage}</strong> de {totalPages}</p>
            <div className="flex items-center gap-1">
              <label htmlFor="pageSize" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Por página:</label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="rounded-md border border-border bg-white px-1.5 py-0.5 text-xs text-text outline-none transition-colors hover:border-navy/30 focus:border-navy"
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Página anterior"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-xs text-muted transition-colors hover:border-navy/30 hover:text-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
            >&lsaquo;</button>
            <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-navy px-2 text-xs font-semibold text-white">{safePage}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Página siguiente"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-xs text-muted transition-colors hover:border-navy/30 hover:text-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
            >&rsaquo;</button>
          </div>
        </div>
      </div>
    </>
  );
}
