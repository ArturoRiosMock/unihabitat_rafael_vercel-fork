import { displayCommentAuthor, formatCommentTimestamp } from "@/lib/comment-author";

/**
 * Autor y fecha de un comentario. La regla «Gestor» vive en
 * `displayCommentAuthor`, no en cada pantalla.
 */
export function CommentByline({
  author,
  authorRole,
  createdAt,
}: {
  author?: string | null;
  authorRole?: string | null;
  createdAt?: string | null;
}) {
  const label = displayCommentAuthor({ author, authorRole });
  const when = formatCommentTimestamp(createdAt);

  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="comentario-meta">
      <span className="text-xs font-semibold text-navy">{label}</span>
      {when ? <span className="text-[11px] text-muted">{when}</span> : null}
    </span>
  );
}
