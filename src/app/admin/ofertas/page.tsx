"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { raiseActionError } from "@/lib/action-result";
import { fetchOfertas, updateOfertaEstado, updateOfertaSeguimiento } from "@/app/actions/ofertas";
import { fetchCompradores } from "@/app/actions/compradores";
import { fetchAssetByIdForAdmin } from "@/app/actions/assets";
import type { Asset, Comprador } from "@/lib/types";
import Link from "next/link";
import { FileText, Loader2, Euro, X } from "lucide-react";
import { fmt } from "@/lib/utils";
import { CommentByline } from "@/components/CommentByline";
import { OfertaEstadoForm, OfertaHistorialLista } from "@/components/OfertaEstadoForm";
import { OfertaSeguimientoControl } from "@/components/OfertaSeguimientoControl";
import { nombreVisible } from "@/lib/comprador-oferta";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_GRUPO,
  ETIQUETA_SEGUIMIENTO,
  OFERTA_ESTADOS,
  SEGUIMIENTOS_OFERTA,
  agruparOfertasPorFirma,
  etiquetaEstado,
  type OfertaEstado,
  type OfertaRow,
  type SeguimientoOferta,
} from "@/lib/oferta-workflow";
import { toast } from "@/lib/toast";

const ESTADO_COLOR: Record<OfertaEstado, string> = {
  realizada: "bg-blue/10 text-blue",
  contraofertada: "bg-gold/10 text-gold",
  rechazada: "bg-red/10 text-red",
  aceptada: "bg-green/10 text-green",
  pbc_solicitada: "bg-navy/10 text-navy",
  firmada: "bg-green/10 text-green",
};

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
  const [fEstado, setFEstado] = useState<OfertaEstado | "">("");
  const [fSeguimiento, setFSeguimiento] = useState<SeguimientoOferta | "">("");
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
  }, [fEstado, fSeguimiento, assetFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const [ofertasData, compradoresData] = await Promise.all([
        fetchOfertas(fEstado, fSeguimiento),
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
  const grupos = useMemo(() => agruparOfertasPorFirma(filteredOfertas), [filteredOfertas]);

  const filterAsset = assetFilter ? assetsMap.get(assetFilter) ?? assets.find(a => a.id === assetFilter) : undefined;

  const clearAssetFilter = () => {
    router.replace("/admin/ofertas");
  };

  async function handleEstadoChange(ofertaId: string, cambio: {
    estado: OfertaEstado;
    importe?: number;
    nota?: string;
    fechaFirma?: string;
  }) {
    setUpdatingId(ofertaId);
    try {
      const result = await updateOfertaEstado({ ofertaId, ...cambio });
      raiseActionError(result);
      await loadData();
      toast.success("Estado de oferta actualizado", { description: etiquetaEstado(cambio.estado) });
    } catch (err) {
      console.error("Error updating estado:", err);
      toast.error("Error al actualizar el estado de la oferta", { description: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSeguimiento(ofertaId: string, seguimiento: SeguimientoOferta) {
    setUpdatingId(ofertaId);
    try {
      const result = await updateOfertaSeguimiento(ofertaId, seguimiento);
      raiseActionError(result);
      await loadData();
      toast.success("Seguimiento actualizado", { description: ETIQUETA_SEGUIMIENTO[seguimiento] });
    } catch (err) {
      toast.error("No se pudo cambiar el seguimiento", {
        description: err instanceof Error ? err.message : String(err),
      });
      throw err;
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

  const bloques = [
    { key: "no_firmada" as const, titulo: ETIQUETA_GRUPO.no_firmada, items: grupos.noFirmada },
    { key: "firmada" as const, titulo: ETIQUETA_GRUPO.firmada, items: grupos.firmada },
  ];

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
          <label htmlFor="filtro-estado-oferta" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</label>
          <select
            id="filtro-estado-oferta"
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value as OfertaEstado | "")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-1.5 text-xs text-text outline-none focus:border-navy"
          >
            <option value="">Todos</option>
            {OFERTA_ESTADOS.map((estado) => (
              <option key={estado} value={estado}>{ETIQUETA_ESTADO[estado]}</option>
            ))}
          </select>
          <label htmlFor="filtro-seguimiento-oferta" className="text-[10px] font-semibold uppercase tracking-wider text-muted">Seguimiento</label>
          <select
            id="filtro-seguimiento-oferta"
            value={fSeguimiento}
            onChange={(e) => setFSeguimiento(e.target.value as SeguimientoOferta | "")}
            className="rounded-md border border-border bg-cream2 px-2.5 py-1.5 text-xs text-text outline-none focus:border-navy"
          >
            <option value="">Todos</option>
            {SEGUIMIENTOS_OFERTA.map((valor) => (
              <option key={valor} value={valor}>{ETIQUETA_SEGUIMIENTO[valor]}</option>
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
              {assetFilter ? "No hay ofertas para este activo" : "No hay ofertas"}
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
          <div className="space-y-8">
            {bloques.map((bloque) => (
              bloque.items.length === 0 ? null : (
                <section key={bloque.key} data-testid={`grupo-ofertas-${bloque.key}`}>
                  <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
                    {bloque.titulo} ({bloque.items.length})
                  </h2>
                  <div className="space-y-3">
                    {bloque.items.map((oferta) => (
                      <OfertaCard
                        key={oferta.id}
                        oferta={oferta}
                        comprador={oferta.comprador_id ? compradores.get(oferta.comprador_id) : undefined}
                        agenteNombre={oferta.vendedor_id ? vendedoresMap.get(oferta.vendedor_id)?.nombre : undefined}
                        asset={assetsMap.get(oferta.asset_id)}
                        updating={updatingId === oferta.id}
                        onEstado={(cambio) => handleEstadoChange(oferta.id, cambio)}
                        onSeguimiento={(valor) => handleSeguimiento(oferta.id, valor)}
                      />
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function OfertaCard({
  oferta,
  comprador,
  agenteNombre,
  asset,
  updating,
  onEstado,
  onSeguimiento,
}: {
  oferta: OfertaRow;
  comprador: Comprador | undefined;
  agenteNombre: string | undefined;
  asset: Asset | undefined;
  updating: boolean;
  onEstado: (cambio: {
    estado: OfertaEstado;
    importe?: number;
    nota?: string;
    fechaFirma?: string;
  }) => Promise<void>;
  onSeguimiento: (valor: SeguimientoOferta) => Promise<void>;
}) {
  if (!asset) return null;
  const actorNombre = (comprador ? nombreVisible(comprador) : "") || agenteNombre || (oferta.vendedor_id ? "Agente" : "—");
  const actorEmail = comprador?.email ?? "";
  const actorIni = comprador?.ini ?? "AG";
  const actorCol = comprador?.col ?? "#1e3a5f,#3d6b9f";
  const agente = comprador?.agente?.trim() || agenteNombre || "Gestor";
  const color = ESTADO_COLOR[oferta.estado] ?? "bg-cream text-muted";

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
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
              <div className="flex flex-wrap items-center gap-2">
                {comprador ? (
                  <Link href={`/admin/compradores/${comprador.id}`} className="text-sm font-semibold text-navy hover:underline">
                    {actorNombre}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-navy">{oferta.vendedor_id ? `Agente: ${actorNombre}` : actorNombre}</span>
                )}
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${color}`}>
                  {etiquetaEstado(oferta.estado)}
                </span>
              </div>
              <div className="text-xs text-muted">{actorEmail || `Agente: ${agente}`}</div>
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
            <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted">
              <span>Tipo: {asset.tip}</span>
              {asset.precio ? <span>Precio estimado: {fmt(asset.precio)}</span> : null}
              <span>Agente: {agente}</span>
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
          {oferta.fecha_firma ? (
            <div className="mt-1 text-[10px] text-green">
              Firma {new Date(oferta.fecha_firma).toLocaleDateString("es-ES")}
            </div>
          ) : null}
        </div>
      </div>

      {oferta.comentarios ? (
        <div className="mb-4 ml-12 rounded-md bg-cream2 px-3 py-2">
          <CommentByline
            author={oferta.comentarios_author}
            authorRole={oferta.comentarios_author_role}
            createdAt={oferta.created_at}
          />
          <p className="mt-1 text-xs text-text">{oferta.comentarios}</p>
        </div>
      ) : null}

      <div className="ml-12">
        <OfertaEstadoForm
          estado={oferta.estado}
          importeActual={oferta.propuesta_euros}
          disabled={updating}
          onSubmit={onEstado}
        />
        <OfertaSeguimientoControl
          seguimiento={oferta.seguimiento}
          disabled={updating}
          onChange={onSeguimiento}
        />
        <OfertaHistorialLista historial={oferta.historial} />
      </div>
    </div>
  );
}
