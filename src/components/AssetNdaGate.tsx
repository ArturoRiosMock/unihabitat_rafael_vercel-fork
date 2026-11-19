"use client";

import { useEffect, useState, type FormEvent } from "react";
import { acceptAssetNda, fetchAssetNdaSigners } from "@/app/actions/documentos";
import { displayNdaSignerName, formatCommentTimestamp } from "@/lib/comment-author";
import { ASSET_NDA_PROVISIONAL_NOTICE, type AssetNdaSignerRow } from "@/lib/nda";
import { CheckCircle2, Loader2, Shield } from "lucide-react";

export function AssetNdaAcceptForm({
  assetId,
  assetLabel,
  text,
  version,
  onAccepted,
}: {
  assetId: string;
  assetLabel: string;
  text: string;
  version: string;
  onAccepted: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [nombre, setNombre] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = accepted && nombre.trim().length > 0 && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      await acceptAssetNda({ assetId, nombre, accepted });
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la aceptación");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mx-auto max-w-2xl rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
        <Shield size={14} /> Firmar / Aceptar NDA
      </div>
      <h2 className="text-base font-semibold text-navy">Documentación de {assetLabel}</h2>
      <p className="mt-1 text-xs text-muted">
        Para ver y descargar los documentos de este activo hay que aceptar su NDA. No da acceso a ningún otro activo.
      </p>
      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        {ASSET_NDA_PROVISIONAL_NOTICE} Versión {version}.
      </p>
      <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-cream2 p-3 text-sm leading-relaxed text-text">
        {text}
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5"
        />
        He leído y acepto
      </label>
      <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted">
        Nombre completo
        <input
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          autoComplete="name"
          placeholder="Nombre y apellidos"
          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-text outline-none focus:border-navy"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-red">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-1.5 rounded-md bg-navy px-3 py-2 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Firmar / Aceptar NDA
        </button>
      </div>
    </form>
  );
}

export function AssetNdaSigners({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<AssetNdaSignerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAssetNdaSigners(assetId)
      .then((signers) => {
        if (!cancelled) setRows(signers);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
        NDA aceptados
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Quién ha aceptado el NDA de este activo y cuándo. El nombre es el que escribió al firmar.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Cargando firmas…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nadie ha firmado el NDA de este activo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const when = formatCommentTimestamp(row.acceptedAt);
            return (
              <li key={`${row.nombreFirma}-${row.acceptedAt}-${row.version}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-cream2 px-3 py-2">
                <span className="text-sm font-medium text-navy">{displayNdaSignerName(row.nombreFirma)}</span>
                <span className="text-[11px] text-muted">
                  {when ?? row.acceptedAt} · v. {row.version}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
