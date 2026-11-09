"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { NotaRow } from "@/app/actions/notas";

/** Texto del `window.confirm` antes de borrar una nota individual. */
export const DELETE_NOTA_CONFIRM =
  "¿Eliminar esta nota?\n\nSe borrará de forma permanente.";

function formatNoteDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Tarjeta de una nota de activo. El botón «Borrar» solo aparece si el padre
 * pasa `onDelete` (hoy, solo el rol admin).
 */
export function AssetNoteCard({
  note,
  onDelete,
}: {
  note: NotaRow;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!onDelete || deleting) return;
    if (!window.confirm(DELETE_NOTA_CONFIRM)) return;
    setDeleting(true);
    try {
      await onDelete(note.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-3" data-testid="nota-activo">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-navy">{note.author}</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{formatNoteDate(note.created_at)}</span>
          {onDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              aria-label="Borrar nota"
              className="flex items-center gap-1 rounded-md border border-red/20 px-2 py-1 text-[11px] font-medium text-red hover:bg-red/5 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Borrar
            </button>
          )}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-text">{note.text}</p>
    </div>
  );
}
