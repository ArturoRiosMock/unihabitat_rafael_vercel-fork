"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatCommentTimestamp } from "@/lib/comment-author";
import { parseLocaleMoneyInput } from "@/lib/utils";
import {
  etiquetaEstado,
  transicionesDesde,
  type OfertaEstado,
  type OfertaHistorialRow,
} from "@/lib/oferta-workflow";

function euros(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OfertaHistorialLista({ historial }: { historial: OfertaHistorialRow[] | undefined }) {
  if (!historial || historial.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5" data-testid="oferta-historial">
      {historial.map((item) => {
        const cuando = formatCommentTimestamp(item.created_at);
        const desde = item.estado_desde ? etiquetaEstado(item.estado_desde) : "Alta";
        const hacia = etiquetaEstado(item.estado_hasta);
        return (
          <li key={item.id} className="rounded-md bg-cream2 px-3 py-2 text-[11px] text-text">
            <span className="font-semibold text-navy">{item.author || "Gestor"}</span>
            {cuando ? <span className="text-muted"> · {cuando}</span> : null}
            <span> · {desde} → {hacia}</span>
            {item.importe_nuevo != null ? <span> · {euros(item.importe_nuevo)} €</span> : null}
            {item.nota ? <p className="mt-1 text-text">{item.nota}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function OfertaEstadoForm({
  estado,
  importeActual,
  disabled,
  onSubmit,
}: {
  estado: OfertaEstado;
  importeActual: number;
  disabled?: boolean;
  onSubmit: (cambio: {
    estado: OfertaEstado;
    importe?: number;
    nota?: string;
    fechaFirma?: string;
  }) => Promise<void>;
}) {
  const opciones = transicionesDesde(estado);
  const [destino, setDestino] = useState<OfertaEstado | "">("");
  const [importe, setImporte] = useState(String(importeActual || ""));
  const [nota, setNota] = useState("");
  const [fechaFirma, setFechaFirma] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  if (opciones.length === 0) {
    return (
      <p className="text-[11px] text-muted" data-testid="oferta-estado-cerrado">
        {etiquetaEstado(estado)}. No hay más pasos.
      </p>
    );
  }

  async function guardar() {
    if (!destino) {
      setError("Selecciona el estado siguiente");
      return;
    }
    if (destino === "contraofertada") {
      const parsed = parseLocaleMoneyInput(importe);
      if (parsed == null || parsed <= 0) {
        setError("La contraoferta necesita un importe mayor que 0");
        return;
      }
      if (!nota.trim()) {
        setError("La contraoferta necesita una nota");
        return;
      }
    }
    if (destino === "firmada" && !fechaFirma) {
      setError("La fecha de firma es obligatoria");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const parsed = destino === "contraofertada" ? parseLocaleMoneyInput(importe) : null;
      await onSubmit({
        estado: destino,
        importe: parsed ?? undefined,
        nota: destino === "contraofertada" ? nota : undefined,
        fechaFirma: destino === "firmada" ? fechaFirma : undefined,
      });
      setDestino("");
      setNota("");
      setFechaFirma("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="oferta-estado-form">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Cambiar estado
          <select
            aria-label="Cambiar estado"
            value={destino}
            disabled={disabled || guardando}
            onChange={(event) => {
              setDestino(event.target.value as OfertaEstado | "");
              setError("");
            }}
            className="rounded-md border border-border bg-cream2 px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-text outline-none focus:border-navy disabled:opacity-50"
          >
            <option value="">Seleccionar…</option>
            {opciones.map((opcion) => (
              <option key={opcion} value={opcion}>{etiquetaEstado(opcion)}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || guardando || !destino}
          onClick={() => void guardar()}
          className="rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy3 disabled:opacity-50"
        >
          {guardando ? <Loader2 size={12} className="animate-spin" /> : "Guardar estado"}
        </button>
      </div>
      {destino === "contraofertada" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Importe de la contraoferta
            <input
              aria-label="Importe de la contraoferta"
              data-testid="oferta-contraoferta-importe"
              inputMode="decimal"
              value={importe}
              disabled={guardando}
              onChange={(event) => setImporte(event.target.value)}
              className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-text outline-none focus:border-navy"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Nota
            <input
              aria-label="Nota de la contraoferta"
              data-testid="oferta-contraoferta-nota"
              value={nota}
              disabled={guardando}
              onChange={(event) => setNota(event.target.value)}
              className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-text outline-none focus:border-navy"
            />
          </label>
        </div>
      ) : null}
      {destino === "firmada" ? (
        <label className="flex max-w-xs flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Fecha de firma
          <input
            aria-label="Fecha de firma"
            data-testid="oferta-fecha-firma"
            type="date"
            value={fechaFirma}
            disabled={guardando}
            onChange={(event) => setFechaFirma(event.target.value)}
            className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal text-text outline-none focus:border-navy"
          />
        </label>
      ) : null}
      {error ? <p className="text-[11px] text-red" role="alert">{error}</p> : null}
    </div>
  );
}
