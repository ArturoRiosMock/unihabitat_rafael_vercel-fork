"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchEnviosComprador, registrarEnvioManual } from "@/app/actions/comprador-envios";
import { raiseActionError } from "@/lib/action-result";
import { formatCommentTimestamp } from "@/lib/comment-author";
import {
  CANALES_ENVIO,
  etiquetaCanalEnvio,
  type CanalEnvio,
} from "@/lib/comprador-envios";
import { useApp } from "@/lib/context";
import { toast } from "@/lib/toast";

interface EnvioVista {
  id: string;
  assetId: string;
  canal: string;
  enviadoPor: string;
  enviadoAt: string;
  nota: string;
}

/**
 * Activos ya enviados a un comprador y alta de un envío manual.
 * El aviso de 14 días pide confirmación antes de repetir.
 */
export function ActivosEnviadosBloque({ compradorId }: { compradorId: string }) {
  const { assets } = useApp();
  const [envios, setEnvios] = useState<EnvioVista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assetId, setAssetId] = useState("");
  const [canal, setCanal] = useState<CanalEnvio>("manual");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchEnviosComprador(compradorId);
      raiseActionError(result);
      setEnvios(result.envios);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los envíos");
    } finally {
      setLoading(false);
    }
  }, [compradorId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sugerencias = useMemo(() => {
    const q = assetId.trim().toLowerCase();
    if (q.length < 2) return [];
    return assets.filter((asset) => (
      asset.id.toLowerCase().includes(q)
      || asset.referencia.toLowerCase().includes(q)
      || asset.pob.toLowerCase().includes(q)
    )).slice(0, 6);
  }, [assetId, assets]);

  async function registrar(confirmar: boolean) {
    setGuardando(true);
    setAviso("");
    try {
      const result = await registrarEnvioManual({
        compradorId,
        assetId,
        canal,
        nota,
        confirmar,
      });
      raiseActionError(result);
      if (result.requiereConfirmacion) {
        setAviso(result.mensaje);
        return;
      }
      setAssetId("");
      setNota("");
      toast.success("Envío registrado");
      await cargar();
    } catch (err) {
      toast.error("No se pudo registrar el envío", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-white p-5 shadow-sm" data-testid="activos-enviados">
      <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">Activos enviados</h2>
      <p className="mb-3 text-xs text-muted">
        Historial de lo que ya se le ha mandado. Si el activo se envió en los últimos 14 días, hay que confirmar.
      </p>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gold" /></div>
      ) : error ? (
        <p className="rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-sm text-red" role="alert">{error}</p>
      ) : envios.length === 0 ? (
        <p className="mb-4 text-sm text-muted">Todavía no hay activos enviados.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {envios.map((envio) => (
            <li key={envio.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/admin/assets/${encodeURIComponent(envio.assetId)}`} className="font-medium text-navy hover:underline">
                {envio.assetId}
              </Link>
              <span className="text-xs text-muted">
                {formatCommentTimestamp(envio.enviadoAt) ?? "—"}
                {" · "}
                {etiquetaCanalEnvio(envio.canal)}
                {" · "}
                {envio.enviadoPor || "Gestor"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <div>
          <label htmlFor={`envio-activo-${compradorId}`} className="sr-only">Activo</label>
          <input
            id={`envio-activo-${compradorId}`}
            value={assetId}
            onChange={(event) => { setAssetId(event.target.value); setAviso(""); }}
            placeholder="Id o referencia del activo"
            className="w-full rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
          />
        </div>
        <label className="sr-only" htmlFor={`envio-canal-${compradorId}`}>Canal</label>
        <select
          id={`envio-canal-${compradorId}`}
          value={canal}
          onChange={(event) => setCanal(event.target.value as CanalEnvio)}
          className="rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
        >
          {CANALES_ENVIO.filter((item) => item !== "cruce").map((item) => (
            <option key={item} value={item}>{etiquetaCanalEnvio(item)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void registrar(false)}
          disabled={guardando || !assetId.trim()}
          className="rounded-md bg-navy px-3 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Registrar envío"}
        </button>
      </div>
      {sugerencias.length > 0 ? (
        <ul className="mt-2 rounded-md border border-border bg-cream2">
          {sugerencias.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => setAssetId(asset.id)}
                className="w-full px-2.5 py-1.5 text-left text-xs text-navy hover:bg-white"
              >
                {asset.id} · {asset.pob}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`envio-nota-${compradorId}`} className="sr-only">Nota</label>
      <input
        id={`envio-nota-${compradorId}`}
        value={nota}
        onChange={(event) => setNota(event.target.value)}
        placeholder="Nota (opcional)"
        className="mt-2 w-full rounded-md border border-border bg-cream2 px-2.5 py-2 text-sm outline-none focus:border-navy"
      />
      {aviso ? (
        <div className="mt-3 rounded-md border border-gold/40 bg-gold/5 p-3" role="alert">
          <p className="whitespace-pre-line text-sm text-navy">{aviso}</p>
          <button
            type="button"
            onClick={() => void registrar(true)}
            disabled={guardando}
            className="mt-2 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
          >
            Enviar de nuevo
          </button>
        </div>
      ) : null}
    </section>
  );
}
