"use client";

import { useState, useEffect } from "react";
import { fetchOfertasByComprador } from "@/app/actions/ofertas";
import { etiquetaEstado, type OfertaEstado, type OfertaRow } from "@/lib/oferta-workflow";
import { fetchAssetById } from "@/app/actions/assets";
import { fetchCurrentSession } from "@/app/actions/session";
import { ensureCompradorForEmail, fetchCompradorDeSesion } from "@/app/actions/compradores";
import type { Asset } from "@/lib/types";
import Link from "next/link";
import { ArrowLeft, FileText, CheckCircle2, Clock, XCircle, Loader2, Euro, AlertCircle } from "lucide-react";
import { assetPrivateHref } from "@/lib/public-slug";
import { CommentByline } from "@/components/CommentByline";

export default function MisOfertasPage() {
  const [ofertas, setOfertas] = useState<OfertaRow[]>([]);
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [loading, setLoading] = useState(true);
  const [compradorId, setCompradorId] = useState<string | null>(null);
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const session = await fetchCurrentSession();
      if (!session?.email) return;
      let row = await fetchCompradorDeSesion();
      let cid = row?.id ?? null;
      if (!cid) {
        cid = await ensureCompradorForEmail(session.email, session.nombre || "Usuario");
      }
      setCompradorId(cid);

      const ofertasData = await fetchOfertasByComprador(cid);
      setOfertas(ofertasData);

      const assetIds = [...new Set(ofertasData.map(o => o.asset_id))];
      const assetPromises = assetIds.map(id => fetchAssetById(id));
      const assetResults = await Promise.all(assetPromises);
      const assetMap = new Map<string, Asset>();
      assetResults.forEach(a => { if (a) assetMap.set(a.id, a); });
      setAssets(assetMap);
    } catch (err) {
      console.error("Error loading ofertas:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gold" />
      </div>
    );
  }

  if (!compradorId) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="py-16 text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-border" />
          <p className="text-sm text-muted">No se encontró tu perfil de comprador</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/portal/privado" className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-navy">
        <ArrowLeft size={14} /> Volver a mi zona
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-navy">Mis Ofertas</h1>

      {ofertas.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={40} className="mx-auto mb-3 text-border" />
          <p className="text-sm text-muted">No has presentado ninguna oferta aún</p>
          <Link href="/portal" className="mt-3 inline-block text-xs text-gold hover:underline">
            Explorar propiedades
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {ofertas.map(oferta => {
            const asset = assets.get(oferta.asset_id);
            if (!asset) return null;

            const estadoConfig: Record<OfertaEstado, { icon: typeof CheckCircle2; color: string; bg: string }> = {
              realizada: { icon: Clock, color: "text-blue", bg: "bg-blue/10" },
              contraofertada: { icon: FileText, color: "text-gold", bg: "bg-gold/10" },
              rechazada: { icon: XCircle, color: "text-red", bg: "bg-red/10" },
              aceptada: { icon: CheckCircle2, color: "text-green", bg: "bg-green/10" },
              pbc_solicitada: { icon: FileText, color: "text-navy", bg: "bg-navy/10" },
              firmada: { icon: CheckCircle2, color: "text-green", bg: "bg-green/10" },
            };

            const config = estadoConfig[oferta.estado];
            const Icon = config.icon;

            return (
              <div key={oferta.id} className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Link
                        href={assetPrivateHref(asset)}
                        className="text-base font-semibold text-navy hover:underline"
                      >
                        {asset.pob}, {asset.prov}
                      </Link>
                      <span className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold ${config.bg} ${config.color}`}>
                        <Icon size={12} />
                        {etiquetaEstado(oferta.estado)}
                      </span>
                    </div>
                    <div className="mb-2 text-xs text-muted">{asset.tip}</div>
                    {oferta.comentarios && (
                      <div className="mt-2 rounded-md bg-cream2 px-3 py-2">
                        <CommentByline
                          author={oferta.comentarios_author}
                          authorRole={oferta.comentarios_author_role}
                          createdAt={oferta.created_at}
                        />
                        <p className="mt-1 text-xs text-text">{oferta.comentarios}</p>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <div className="mb-1 flex items-center gap-1.5 text-xl font-bold text-gold">
                      <Euro size={18} />
                      {oferta.propuesta_euros.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-muted">
                      {new Date(oferta.created_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>

                {oferta.estado === "firmada" && oferta.fecha_firma ? (
                  <div className="mt-4 rounded-lg border border-green bg-green/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-green">
                      <CheckCircle2 size={14} />
                      <span className="font-medium">
                        Fecha de firma: {new Date(oferta.fecha_firma).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                ) : null}

                {oferta.contraoferta_nota ? (
                  <p className="mt-3 text-xs text-text">Contraoferta: {oferta.contraoferta_nota}</p>
                ) : null}

                {oferta.estado === "rechazada" && (
                  <div className="mt-4 rounded-lg border border-red/20 bg-red/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-red">
                      <XCircle size={14} />
                      <span className="font-medium">Oferta rechazada</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Tu oferta ha sido rechazada por el administrador.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
