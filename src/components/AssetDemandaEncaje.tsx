"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchCompradoresEncajeActivo } from "@/app/actions/cruce-demanda";
import { raiseActionError } from "@/lib/action-result";
import { ETIQUETA_NIVEL, type EncajeComprador } from "@/lib/cruce-demanda";

/** Compradores cuya demanda encaja con este activo. Solo gestor. */
export function AssetDemandaEncaje({ assetId }: { assetId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicado, setPublicado] = useState(true);
  const [compradores, setCompradores] = useState<EncajeComprador[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchCompradoresEncajeActivo(assetId);
        raiseActionError(result);
        if (cancelled) return;
        setPublicado(result.publicado);
        setCompradores(result.compradores);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo calcular el encaje");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <section className="mb-6" data-testid="demanda-encaje">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
        Demanda que encaja ({compradores.length})
      </h2>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gold" /></div>
      ) : error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red" role="alert">{error}</p>
      ) : !publicado ? (
        <p className="rounded-lg border border-border bg-white p-4 text-sm text-muted">
          El activo no está publicado. El cruce solo ofrece activos disponibles en el portal.
        </p>
      ) : compradores.length === 0 ? (
        <p className="rounded-lg border border-border bg-white p-4 text-sm text-muted">
          Ningún comprador tiene una demanda que encaje con este activo.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-cream2 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2">Comprador</th>
                <th className="px-3 py-2">Agente</th>
                <th className="px-3 py-2">Nivel</th>
              </tr>
            </thead>
            <tbody>
              {compradores.map((comprador) => (
                <tr key={comprador.compradorId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link href={`/admin/compradores/${comprador.compradorId}`} className="font-medium text-navy hover:underline">
                      {comprador.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-text">{comprador.agente}</td>
                  <td className="px-3 py-2 text-text">{ETIQUETA_NIVEL[comprador.nivel]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
