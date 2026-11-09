"use client";

import { useEffect, useState } from "react";
import { updatePropiedadFields } from "@/app/actions/assets";
import { FASE_INTERNA_OPTIONS, faseToCode } from "@/lib/fase-interna";
import type { Asset } from "@/lib/types";
import { displaySituacion } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface SituacionFieldProps {
  asset: Asset;
  /** El admin edita; el agente solo ve el valor. */
  canEdit: boolean;
  onSaved?: () => void;
}

const selectCls =
  "w-full cursor-pointer appearance-none rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text outline-none focus:border-navy disabled:cursor-wait disabled:opacity-50";

/**
 * Estado «Situación» de la pestaña Características.
 * Persiste en `propiedades.fase_interna` de la primera propiedad, el mismo
 * campo que el selector «Fase interna» de la pestaña Administrador.
 */
export function SituacionField({ asset, canEdit, onSaved }: SituacionFieldProps) {
  const displayed = displaySituacion(asset);
  const propiedadId = asset.propiedades[0]?.id ?? "";
  const editable = canEdit && propiedadId.length > 0;
  const [value, setValue] = useState(displayed === "—" ? "" : displayed);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(displayed === "—" ? "" : displayed);
  }, [displayed, asset.id]);

  const handleChange = async (next: string) => {
    if (!editable || !next || next === value) return;
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await updatePropiedadFields(propiedadId, {
        fase_interna: next,
        fase_c: faseToCode(next),
      });
      onSaved?.();
      toast.success("Situación actualizada");
    } catch (err) {
      setValue(previous);
      toast.error("No se pudo guardar la situación", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="group" aria-label="Situación" className="rounded-lg border border-border bg-white px-3 py-3 shadow-sm">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted">
        Situación
      </div>
      {editable ? (
        <select
          id="situacion-activo"
          aria-label="Situación"
          value={value}
          disabled={saving}
          onChange={(event) => void handleChange(event.target.value)}
          className={selectCls}
        >
          <option value="">—</option>
          {FASE_INTERNA_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          {value && !(FASE_INTERNA_OPTIONS as readonly string[]).includes(value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      ) : (
        <div className="rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text">
          {displayed}
        </div>
      )}
    </div>
  );
}
