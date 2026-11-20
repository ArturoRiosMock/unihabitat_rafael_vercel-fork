"use client";

import { useState } from "react";
import {
  ETIQUETA_SEGUIMIENTO,
  SEGUIMIENTOS_OFERTA,
  type SeguimientoOferta,
} from "@/lib/oferta-workflow";

/** Selector del seguimiento, aparte del estado de la oferta. */
export function OfertaSeguimientoControl({
  seguimiento,
  disabled,
  onChange,
}: {
  seguimiento: SeguimientoOferta;
  disabled?: boolean;
  onChange: (valor: SeguimientoOferta) => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);

  async function cambiar(valor: string) {
    if (!(SEGUIMIENTOS_OFERTA as readonly string[]).includes(valor) || valor === seguimiento) return;
    setGuardando(true);
    try {
      await onChange(valor as SeguimientoOferta);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-navy" data-testid="oferta-seguimiento">
      <span className="font-semibold uppercase tracking-wider text-muted">Seguimiento</span>
      <select
        aria-label="Seguimiento"
        value={seguimiento}
        disabled={disabled || guardando}
        onChange={(event) => void cambiar(event.target.value)}
        className="rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-navy disabled:opacity-50"
      >
        {SEGUIMIENTOS_OFERTA.map((valor) => (
          <option key={valor} value={valor}>{ETIQUETA_SEGUIMIENTO[valor]}</option>
        ))}
      </select>
    </label>
  );
}
