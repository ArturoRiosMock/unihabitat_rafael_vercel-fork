"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Save, Loader2, CheckCircle2 } from "lucide-react";
import { updatePropiedadExcelRaw } from "@/app/actions/assets";
import { normalizeExcelCellInput } from "@/lib/excel-raw-utils";
import { toast } from "@/lib/toast";

function cloneRaw(r: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  return JSON.parse(JSON.stringify(r)) as Record<string, Record<string, string>>;
}

const inputCls =
  "w-full rounded-md border border-border bg-cream2 px-2.5 py-[7px] text-xs text-text outline-none transition-all placeholder:text-muted/70 focus:border-navy focus:bg-white";
const monoInputCls = inputCls + " font-mono text-[11px]";

interface EditableExcelRawSectionProps {
  assetId: string;
  excelRaw: Record<string, Record<string, string>>;
  cols?: number;
  onSaved?: () => void;
}

export function EditableExcelRawSection({
  assetId,
  excelRaw,
  cols = 4,
  onSaved,
}: EditableExcelRawSectionProps) {
  const initial = useRef<Record<string, Record<string, string>>>(cloneRaw(excelRaw));
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>(() => cloneRaw(excelRaw));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const c = cloneRaw(excelRaw);
    initial.current = c;
    setDraft(c);
  }, [excelRaw]);

  const handleChange = useCallback((sheet: string, header: string, v: string) => {
    setDraft((prev) => ({
      ...prev,
      [sheet]: {
        ...prev[sheet],
        [header]: normalizeExcelCellInput(v),
      },
    }));
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);

  const handleSave = async () => {
    setSaving(true);
    try {
      // `assetId` es el id de la propiedad (PK). El guardado también copia
      // Deuda y Proceso a las columnas canónicas de esa fila.
      await updatePropiedadExcelRaw(assetId, draft);
      initial.current = cloneRaw(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (err) {
      toast.error("Error al guardar Excel raw", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const sheetNames = Object.keys(draft);

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
        Datos Completos del Proveedor
      </div>
      <div className="space-y-6">
        {sheetNames.map((sheet) => {
          const colsMap = draft[sheet] ?? {};
          const headers = Object.keys(colsMap);
          if (headers.length === 0) return null;
          return (
            <div key={sheet}>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-navy/80">
                Hoja: {sheet}
              </h4>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {headers.map((header) => (
                  <div key={`${sheet}::${header}`} className="flex min-w-0 flex-col gap-0.5">
                    <label className="text-[9px] font-semibold uppercase tracking-wider text-muted">
                      {header}
                    </label>
                    <input
                      value={colsMap[header] ?? ""}
                      onChange={(e) => handleChange(sheet, header, e.target.value)}
                      placeholder="--"
                      className={monoInputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
          className="flex items-center gap-1.5 rounded-md bg-navy px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-navy3 disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
