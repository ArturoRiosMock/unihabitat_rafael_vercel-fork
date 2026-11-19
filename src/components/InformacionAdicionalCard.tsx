"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  fetchInformacionAdicional,
  saveInformacionAdicional,
} from "@/app/actions/informacion-adicional";
import { CommentByline } from "@/components/CommentByline";
import type { InformacionAdicionalView } from "@/lib/informacion-adicional";
import { toast } from "@/lib/toast";

const EMPTY_INFO: InformacionAdicionalView = {
  texto: "",
  author: null,
  authorRole: null,
  updatedAt: null,
};

interface InformacionAdicionalCardProps {
  assetId: string;
  /** El administrador edita. El agente solo lee el texto ya guardado. */
  canWrite: boolean;
}

export function InformacionAdicionalCard({ assetId, canWrite }: InformacionAdicionalCardProps) {
  const [view, setView] = useState<InformacionAdicionalView>(EMPTY_INFO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchInformacionAdicional(assetId)
      .then((value) => {
        if (!cancelled) setView(value);
      })
      .catch(() => {
        if (!cancelled) setView(EMPTY_INFO);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveInformacionAdicional(assetId, view.texto);
      const fresh = await fetchInformacionAdicional(assetId);
      setView(fresh);
      toast.success("Información adicional guardada");
    } catch (err) {
      toast.error("No se pudo guardar la información adicional", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label="Información Adicional"
      className="mt-3 rounded-lg border border-border bg-white p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-gold after:h-px after:flex-1 after:bg-border">
        Información Adicional
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Cargando información adicional…
        </div>
      ) : canWrite ? (
        <>
          {view.author ? (
            <div className="mb-2">
              <CommentByline author={view.author} authorRole={view.authorRole} createdAt={view.updatedAt} />
            </div>
          ) : null}
          <textarea
            aria-label="Texto de información adicional"
            value={view.texto}
            onChange={(event) => setView((current) => ({ ...current, texto: event.target.value }))}
            rows={4}
            className="w-full rounded-md border border-border bg-cream2 p-3 text-sm leading-[1.7] text-text outline-none focus:border-navy"
            placeholder="Notas internas visibles para todos los agentes. Solo el administrador puede editarlas."
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar información adicional
            </button>
          </div>
        </>
      ) : (
        <>
          {view.author ? (
            <div className="mb-2">
              <CommentByline author={view.author} authorRole={view.authorRole} createdAt={view.updatedAt} />
            </div>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-[1.7] text-text">
            {view.texto.trim() ? view.texto : "Sin información adicional"}
          </p>
        </>
      )}
    </section>
  );
}
