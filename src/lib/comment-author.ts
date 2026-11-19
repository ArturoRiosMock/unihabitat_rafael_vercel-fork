/** Etiqueta visible cuando el autor es administrador o no hay dato de autor. */
export const GESTOR_AUTHOR_LABEL = "Gestor";

export interface CommentAuthorInput {
  author?: string | null;
  authorRole?: string | null;
}

/**
 * Nombre que se muestra en un comentario.
 * El administrador nunca aparece con su nombre real: sale «Gestor».
 * Un agente o un comprador salen con su nombre. Sin autor, también «Gestor».
 */
export function displayCommentAuthor(input: CommentAuthorInput): string {
  if (input.authorRole === "admin") return GESTOR_AUTHOR_LABEL;
  const name = input.author?.trim() ?? "";
  if (!name) return GESTOR_AUTHOR_LABEL;
  return name;
}

/**
 * Fecha y hora de un comentario, en español.
 * Devuelve null si no hay fecha o no se puede leer.
 */
export function formatCommentTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
