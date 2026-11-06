"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { fetchOfertas, updateOfertaEstado, type OfertaRow } from "@/app/actions/ofertas";
import { fetchCompradores } from "@/app/actions/compradores";
import { fetchAssetByIdForAdmin } from "@/app/actions/assets";
import type { Asset, Comprador } from "@/lib/types";
import Link from "next/link";
import { FileText, CheckCircle2, XCircle, Send, Loader2, AlertCircle, Euro, X } from "lucide-react";
import { fmt } from "@/lib/utils";
import { toast } from "@/lib/toast";

const ESTADO_FILTRO: Array<OfertaRow["estado"] | ""> = [
  "",
  "pendiente",
  "nda_enviado",
  "nda_firmado",
  "validada",
  "rechazada",
];

const ESTADO_OPCIONES: OfertaRow["estado"][] = [
  "pendiente",
  "validada",
  "rechazada",
  "nda_enviado",
  "nda_firmado",
];

export default function OfertasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
          Cargando ofertas…
        </div>
      }
    >
      <OfertasPageInner />
    </Suspense>
  );
}

function OfertasPageInner() {
  const { assets, vendedores, session } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetFilter = searchParams.get("asset") ?? "";
  const [ofertas, setOfertas] = useState<OfertaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fEstado, setFEstado] = useState<OfertaRow["estado"] | "">("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [compradores, setCompradores] = useState<Map<string, Comprador>>(new Map());
  const [assetsMap, setAssetsMap] = useState<Map<string, Asset>>(new Map());

  const isAgente = session?.role === "vendedor";
  const pageTitle = isAgente ? "Mis ofertas" : "Ofertas de Compradores";

  const vendedoresMap = useMemo(() => {
    const m = new Map<string, (typeof vendedores)[number]>();
    vendedores.forEach((v) => m.set(v.id, v));
    return m;
  }, [vendedores]);

  useEffect(() => {
    loadData();
  }, [fEstado, assetFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const [ofertasData, compradoresData] = await Promise.all([
        fetchOfertas(fEstado),
        fetchCompradores(),
      ]);
      setOfertas(ofertasData);
      const compMap = new Map<string, Comprador>();
      compradoresData.forEach(c => compMap.set(c.id, c));
      setCompradores(compMap);

      const assetIds = [...new Set([
        ...ofertasData.map(o => o.asset_id),
        ...(assetFilter ? [assetFilter] : []),
      ])];
      const assetPromises = assetIds.map(id => fetchAssetByIdForAdmin(id));
      const assetResults = await Promise.all(assetPromises);
      const assetMap = new Map<string, Asset>();
      assetResults.forEach(a => { if (a) assetMap.set(a.id, a); });
      setAssetsMap(assetMap);
    } catch (err) {
      console.error("Error loading ofertas:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredOfertas = useMemo(
    () => assetFilter ? ofertas.filter(o => o.asset_id === assetFilter) : ofertas,
    [ofertas, assetFilter],
  );

  const filterAsset = assetFilter ? assetsMap.get(assetFilter) ?? assets.find(a => a.id === assetFilter) : undefined;

  const clearAssetFilter = () => {
    router.replace("/admin/ofertas");
  };

  async function handleEstadoChange(ofertaId: string, nuevoEstado: OfertaRow["estado"]) {
    setUpdatingId(ofertaId);
    try {
      await updateOfertaEstado(ofertaId, nuevoEstado);
      await loadData();
      toast.success("Estado de oferta actualizado", { description: `Nuevo estado: ${nuevoEstado.replace(/_/g, " ")}` });
    } catch (err) {
      console.error("Error updating estado:", err);
      toast.error("Error al actualizar el estado de la oferta", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gold" />
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-navy">{pageTitle}</h1>
          <span className="rounded-md bg-cream px-2.5 py-0.5 text-xs font-medium text-muted">
            {filteredOfertas.length} {filteredOfertas.length === 1 ? "oferta" : "ofertas"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</label>
          <select
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value as OfertaRow["estado"] | "")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-1.5 text-xs text-text outline-none focus:border-navy"
          >
            {ESTADO_FILTRO.map((e) => (
              <option key={e || "all"} value={e}>{e || "Todos"}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-5">
        {assetFilter && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Filtro activo:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/20 bg-navy/5 px-3 py-1 text-xs font-medium text-navy">
              Activo: {filterAsset ? `${filterAsset.pob}, ${filterAsset.prov}` : assetFilter}
              <button
                type="button"
                onClick={clearAssetFilter}
                className="rounded-full p-0.5 text-muted transition-colors hover:bg-navy/10 hover:text-navy"
                aria-label="Quitar filtro de activo"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}
        {filteredOfertas.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={40} className="mx-auto mb-3 text-border" />
            <p className="text-sm text-muted">
              {assetFilter ? "No hay ofertas para este activo" : "No hay ofertas pendientes"}
            </p>
            {assetFilter ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <p className="w-full text-xs text-muted">
                  Para registrar una oferta, ábrela desde el detalle del activo (botón Oferta).
                </p>
                <Link
                  href={`/admin/assets/${encodeURIComponent(assetFilter)}`}
                  className="rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy3"
                >
                  Volver al activo
                </Link>
                <button
                  type="button"
                  onClick={clearAssetFilter}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-navy hover:bg-cream"
                >
                  Quitar filtro
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOfertas.map(oferta => {
              const comprador = oferta.comprador_id ? compradores.get(oferta.comprador_id) : undefined;
              const agente = oferta.vendedor_id ? vendedoresMap.get(oferta.vendedor_id) : undefined;
              const asset = assetsMap.get(oferta.asset_id);
              if (!asset) return null;
              if (!comprador && !agente && !oferta.vendedor_id) return null;

              const actorNombre = comprador?.nombre
                ?? agente?.nombre
                ?? (oferta.vendedor_id ? "Agente" : "—");
              const actorEmail = comprador?.email ?? agente?.email ?? "";
              const actorIni = comprador?.ini ?? agente?.ini ?? "AG";
              const actorCol = comprador?.col ?? agente?.col ?? "#1e3a5f,#3d6b9f";
              const actorHref = comprador
                ? `/admin/compradores/${comprador.id}`
                : oferta.vendedor_id
                  ? `/admin/agentes/${oferta.vendedor_id}`
                  : null;

              const estadoColors: Record<OfertaRow["estado"], string> = {
                pendiente: "bg-blue/10 text-blue",
                validada: "bg-green/10 text-green",
                rechazada: "bg-red/10 text-red",
                nda_enviado: "bg-gold/10 text-gold",
                nda_firmado: "bg-green/10 text-green",
              };

              return (
                <div
                  key={oferta.id}
                  className="rounded-lg border border-border bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: `linear-gradient(135deg,${actorCol})` }}
                        >
                          {actorIni}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {actorHref ? (
                              <Link
                                href={actorHref}
                                className="text-sm font-semibold text-navy hover:underline"
                              >
                                {comprador ? actorNombre : `Agente: ${actorNombre}`}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold text-navy">
                                {oferta.vendedor_id ? `Agente: ${actorNombre}` : actorNombre}
                              </span>
                            )}
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${estadoColors[oferta.estado]}`}>
                              {oferta.estado.replace("_", " ")}
                            </span>
                          </div>
                          <div className="text-xs text-muted">{actorEmail}</div>
                        </div>
                      </div>
                      <div className="ml-12">
                        <Link
                          href={`/admin/assets/${asset.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-navy hover:underline"
                        >
                          {asset.pob}, {asset.prov} — {asset.id}
                          <span className="sr-only"> (se abre en una pestaña nueva)</span>
                        </Link>
                        <div className="mt-1 flex items-center gap-4 text-xs text-muted">
                          <span>Tipo: {asset.tip}</span>
                          {asset.precio && <span>Precio estimado: {fmt(asset.precio)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <div className="mb-1 flex items-center gap-1.5 text-lg font-bold text-gold">
                        <Euro size={16} />
                        {oferta.propuesta_euros.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-muted">
                        {new Date(oferta.created_at).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>

                  {oferta.comentarios && (
                    <div className="mb-4 ml-12 rounded-md bg-cream2 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
                        Comentarios
                      </div>
                      <p className="text-xs text-text">{oferta.comentarios}</p>
                    </div>
                  )}

                  <div className="ml-12 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`estado-${oferta.id}`} className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Cambiar estado
                      </label>
                      <select
                        id={`estado-${oferta.id}`}
                        value={oferta.estado}
                        disabled={updatingId === oferta.id}
                        onChange={(e) => void handleEstadoChange(oferta.id, e.target.value as OfertaRow["estado"])}
                        className="rounded-md border border-border bg-cream2 px-2.5 py-1.5 text-xs text-text outline-none focus:border-navy disabled:opacity-50"
                      >
                        {ESTADO_OPCIONES.map((e) => (
                          <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    {oferta.estado === "pendiente" && (
                      <>
                        <button
                          type="button"
                          disabled={updatingId === oferta.id}
                          onClick={() => void handleEstadoChange(oferta.id, "validada")}
                          className="flex items-center gap-1.5 rounded-lg bg-green px-3 py-1.5 text-xs font-medium text-white hover:bg-green/90 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Validar
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === oferta.id}
                          onClick={() => void handleEstadoChange(oferta.id, "rechazada")}
                          className="flex items-center gap-1.5 rounded-lg bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/90 disabled:opacity-50"
                        >
                          <XCircle size={14} /> Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === oferta.id}
                          onClick={() => void handleEstadoChange(oferta.id, "nda_enviado")}
                          className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                        >
                          <Send size={14} /> Enviar NDA
                        </button>
                      </>
                    )}
                    {oferta.estado === "validada" && (
                      <button
                        type="button"
                        disabled={updatingId === oferta.id}
                        onClick={() => void handleEstadoChange(oferta.id, "nda_enviado")}
                        className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
                      >
                        <Send size={14} /> Enviar NDA
                      </button>
                    )}
                    {oferta.estado === "nda_enviado" && (
                      <div className="flex items-center gap-2 rounded-lg bg-gold/10 px-3 py-1.5 text-xs text-gold">
                        <AlertCircle size={14} />
                        NDA enviado. Esperando firma del cliente.
                      </div>
                    )}
                    {oferta.estado === "nda_firmado" && (
                      <div className="flex items-center gap-2 rounded-lg bg-green/10 px-3 py-1.5 text-xs text-green">
                        <CheckCircle2 size={14} />
                        NDA firmado el {new Date(oferta.nda_firmado_at!).toLocaleDateString("es-ES")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
