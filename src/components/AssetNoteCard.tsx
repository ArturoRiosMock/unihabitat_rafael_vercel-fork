"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { NotaRow } from "@/app/actions/notas";
import { CommentByline } from "@/components/CommentByline";

/** Texto del `window.confirm` antes de borrar una nota individual. */
export const DELETE_NOTA_CONFIRM =
  "¿Eliminar esta nota?\n\nSe borrará de forma permanente.";

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
        <CommentByline author={note.author} authorRole={note.author_role} createdAt={note.created_at} />
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
      </div>
      <p className="text-sm leading-relaxed text-text">{note.text}</p>
    </div>
  );
}
