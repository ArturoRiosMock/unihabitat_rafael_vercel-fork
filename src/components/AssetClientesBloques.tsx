"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchClientesInteresados } from "@/app/actions/asset-clientes";
import { raiseActionError } from "@/lib/action-result";
import { fetchOfertasByAsset, updateOfertaEstado, updateOfertaSeguimiento } from "@/app/actions/ofertas";
import { fetchCompradores } from "@/app/actions/compradores";
import { OfertaEstadoForm, OfertaHistorialLista } from "@/components/OfertaEstadoForm";
import { OfertaSeguimientoControl } from "@/components/OfertaSeguimientoControl";
import { formatCommentTimestamp } from "@/lib/comment-author";
import { nombreVisible } from "@/lib/comprador-oferta";
import {
  ETIQUETA_ORIGEN,
  etiquetaEstado,
  grupoOferta,
  type ClienteInteresado,
  type OfertaEstado,
  type OfertaRow,
  type SeguimientoOferta,
} from "@/lib/oferta-workflow";
import type { Comprador } from "@/lib/types";
import { toast } from "@/lib/toast";

function euros(value: number): string {
  return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Los dos bloques de la pestaña Clientes: interesados y ofertas del activo.
 * Los datos ya vienen filtrados en el servidor.
 */
export function AssetClientesBloques({ assetId }: { assetId: string }) {
  const [interesados, setInteresados] = useState<ClienteInteresado[]>([]);
  const [ofertas, setOfertas] = useState<OfertaRow[]>([]);
  const [compradores, setCompradores] = useState<Map<string, Comprador>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientes, rows, fichas] = await Promise.all([
        fetchClientesInteresados(assetId),
        fetchOfertasByAsset(assetId),
        fetchCompradores(),
      ]);
      setInteresados(clientes);
      setOfertas(rows);
      setCompradores(new Map(fichas.map((ficha) => [ficha.id, ficha])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los clientes");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cambiarEstado(ofertaId: string, cambio: {
    estado: OfertaEstado;
    importe?: number;
    nota?: string;
    fechaFirma?: string;
  }) {
    setUpdatingId(ofertaId);
    try {
      const result = await updateOfertaEstado({ ofertaId, ...cambio });
      raiseActionError(result);
      await load();
      toast.success("Estado de oferta actualizado", { description: etiquetaEstado(cambio.estado) });
    } finally {
      setUpdatingId(null);
    }
  }

  async function cambiarSeguimiento(ofertaId: string, seguimiento: SeguimientoOferta) {
    setUpdatingId(ofertaId);
    try {
      const result = await updateOfertaSeguimiento(ofertaId, seguimiento);
      raiseActionError(result);
      await load();
      toast.success("Seguimiento actualizado");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="mb-6 flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mb-8 flex flex-col gap-6">
      {error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red" role="alert">{error}</p>
      ) : null}

      <section data-testid="clientes-interesados">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Los clientes interesados ({interesados.length})
        </h2>
        {interesados.length === 0 ? (
          <p className="rounded-lg border border-border bg-white p-4 text-sm text-muted">
            Ningún cliente ha mostrado interés en este activo.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Agente</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Origen</th>
                </tr>
              </thead>
              <tbody>
                {interesados.map((cliente) => (
                  <tr key={cliente.compradorId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/compradores/${cliente.compradorId}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {cliente.nombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-text">{cliente.agente}</td>
                    <td className="px-3 py-2 text-muted">
                      {formatCommentTimestamp(cliente.fecha) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-text">
                      {cliente.origenes.map((origen) => (
                        <span key={origen.origen} className="mr-2 inline-block">
                          {ETIQUETA_ORIGEN[origen.origen]}
                          <span className="text-muted"> · {formatCommentTimestamp(origen.fecha) ?? "—"}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section data-testid="ofertas-recibidas">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Ofertas recibidas ({ofertas.length})
        </h2>
        {ofertas.length === 0 ? (
          <p className="rounded-lg border border-border bg-white p-4 text-sm text-muted">
            No hay ofertas recibidas sobre este activo.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {ofertas.map((oferta) => {
              const comprador = oferta.comprador_id ? compradores.get(oferta.comprador_id) : undefined;
              const nombre = comprador ? nombreVisible(comprador) : (oferta.comprador_id ? oferta.comprador_id : "Sin comprador");
              const agente = comprador?.agente?.trim() || "Gestor";
              const grupo = grupoOferta(oferta.estado);
              return (
                <article key={oferta.id} className="rounded-lg border border-border bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {oferta.comprador_id ? (
                        <Link
                          href={`/admin/compradores/${oferta.comprador_id}`}
                          className="text-sm font-semibold text-navy hover:underline"
                        >
                          {nombre}
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold text-navy">{nombre}</p>
                      )}
                      <p className="text-[11px] text-muted">Agente: {agente}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {formatCommentTimestamp(oferta.created_at) ?? "—"}
                        {grupo ? ` · ${grupo === "firmada" ? "Firmada" : "No firmada"}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gold">{euros(oferta.propuesta_euros)} €</p>
                      <p className="text-[11px] font-semibold text-navy">{etiquetaEstado(oferta.estado)}</p>
                      {oferta.fecha_firma ? (
                        <p className="text-[11px] text-muted">
                          Firma: {formatCommentTimestamp(oferta.fecha_firma)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {oferta.contraoferta_nota ? (
                    <p className="mb-2 text-xs text-text">Contraoferta: {oferta.contraoferta_nota}</p>
                  ) : null}
                  <OfertaEstadoForm
                    estado={oferta.estado}
                    importeActual={oferta.propuesta_euros}
                    disabled={updatingId === oferta.id}
                    onSubmit={(cambio) => cambiarEstado(oferta.id, cambio)}
                  />
                  <OfertaSeguimientoControl
                    seguimiento={oferta.seguimiento}
                    disabled={updatingId === oferta.id}
                    onChange={(valor) => cambiarSeguimiento(oferta.id, valor)}
                  />
                  <OfertaHistorialLista historial={oferta.historial} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
