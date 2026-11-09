"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { updateAssetFields } from "@/app/actions/assets";
import { parseLocaleMoneyInput } from "@/lib/utils";
import { toast } from "@/lib/toast";

export type FieldDef = {
  label: string;
  dbCol: string;
  value: string;
  mono?: boolean;
  colSpan?: number;
  /** `precio` y otras columnas numéricas: guardar número o `null`, no "—" */
  numeric?: boolean;
};

interface EditableSectionProps {
  title: string;
  assetId: string;
  fields: FieldDef[];
  cols?: number;
  onSaved?: () => void;
  /**
   * Persistencia. Por defecto actualiza `assets`. La ficha administrativa
   * pasa `updatePropiedadFields` porque Deuda y Proceso viven en `propiedades`.
   */
  persist?: (id: string, patch: Record<string, string | number | null>) => Promise<void>;
}

const inputCls =
  "w-full rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text outline-none transition-all placeholder:text-muted/50 focus:border-navy focus:bg-white";
const monoInputCls = inputCls + " font-mono text-[11px]";

export function EditableSection({ title, assetId, fields, cols = 4, onSaved, persist }: EditableSectionProps) {
  const initial = useRef<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (f.numeric) {
        init[f.dbCol] = f.value === "—" || f.value == null || f.value === "" ? "" : f.value;
      } else {
        init[f.dbCol] = f.value === "—" ? "" : f.value;
      }
    }
    initial.current = init;
    setValues(init);
  }, [fields]);

  const fieldMeta = (dbCol: string) => fields.find(f => f.dbCol === dbCol);

  const dirty = Object.keys(values).some((k) => {
    const next = values[k] ?? "";
    const prev = initial.current[k] ?? "";
    const f = fieldMeta(k);
    if (f?.numeric) {
      const a = parseLocaleMoneyInput(next);
      const b = parseLocaleMoneyInput(prev);
      if (a == null && b == null) return false;
      if (a == null || b == null) return true;
      return Math.abs(a - b) > 1e-9;
    }
    return next !== prev;
  });

  const handleChange = useCallback((dbCol: string, v: string) => {
    setValues(prev => ({ ...prev, [dbCol]: v }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(values)) {
        const prev = initial.current[k] ?? "";
        const next = v ?? "";
        if (next === prev) continue;
        const f = fieldMeta(k);
        if (f?.numeric) {
          const n = parseLocaleMoneyInput(next);
          const prevN = parseLocaleMoneyInput(prev);
          const changed =
            (n == null && prevN != null) ||
            (n != null && prevN == null) ||
            (n != null && prevN != null && Math.abs(n - prevN) > 1e-9);
          if (changed) patch[k] = n;
        } else {
          patch[k] = next.trim() || "—";
        }
      }
      if (Object.keys(patch).length > 0) {
        await (persist ?? updateAssetFields)(assetId, patch);
        initial.current = { ...values };
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        onSaved?.();
      }
    } catch (err) {
      toast.error("Error al guardar la sección", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
        {title}
      </div>
      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {fields.map(f => (
          <div key={f.dbCol} className="flex flex-col gap-0.5" style={f.colSpan ? { gridColumn: `span ${f.colSpan}` } : undefined}>
            <label htmlFor={`field-${f.dbCol}`} className="text-[9px] font-semibold uppercase tracking-wider text-muted">{f.label}</label>
            <input
              id={`field-${f.dbCol}`}
              value={values[f.dbCol] ?? ""}
              onChange={e => handleChange(f.dbCol, e.target.value)}
              placeholder="—"
              inputMode={f.numeric ? "decimal" : undefined}
              className={f.mono ? monoInputCls : inputCls}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-navy px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-navy3 disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
