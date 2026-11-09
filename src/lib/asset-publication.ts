import type { Asset } from "@/lib/types";

/** Zona del cliente. Evita que el día cambie según el huso del navegador o del CI. */
export const PUBLICATION_TIME_ZONE = "Europe/Madrid";

type PublicationFields = Pick<Asset, "pub" | "publishedAt" | "createdAt">;

/**
 * Fecha efectiva de publicación.
 * 1. `publishedAt` si existe (también tras despublicar: se conserva).
 * 2. Si está publicado y aún no hay sello, `createdAt` (columna ausente o backfill pendiente).
 * 3. Si no está publicado y no hay sello, no hay fecha.
 */
export function effectivePublishedAt(asset: PublicationFields): string | null {
  if (asset.publishedAt) return asset.publishedAt;
  if (asset.pub && asset.createdAt) return asset.createdAt;
  return null;
}

export function publicationTimestamp(asset: PublicationFields): number | null {
  const iso = effectivePublishedAt(asset);
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/**
 * Orden por fecha de publicación. Las filas sin fecha quedan siempre al final,
 * tanto en «más reciente» como en «más antigua».
 */
export function compareByPublicationDate(a: PublicationFields, b: PublicationFields, dir: 1 | -1): number {
  const va = publicationTimestamp(a);
  const vb = publicationTimestamp(b);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return (va - vb) * dir;
}

function madridParts(value: string | Date): Intl.DateTimeFormatPart[] | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PUBLICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** Fecha corta para la tabla admin: `dd/mm/aaaa` en Europe/Madrid. */
export function formatPublicationDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = madridParts(iso);
  if (!parts) return "—";
  return `${part(parts, "day")}/${part(parts, "month")}/${part(parts, "year")}`;
}

/** Fecha y hora para Excel: `aaaa-mm-dd hh:mm` en Europe/Madrid. */
export function formatPublicationDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = madridParts(iso);
  if (!parts) return "";
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")} ${part(parts, "hour")}:${part(parts, "minute")}`;
}

export function publicationFileDate(now: Date): string {
  const parts = madridParts(now);
  if (!parts) return "sin-fecha";
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export function publicationListLabel(asset: PublicationFields): { text: string; title?: string } {
  const iso = effectivePublishedAt(asset);
  if (!iso) return { text: "—", title: "Sin fecha de publicación" };
  const text = formatPublicationDate(iso);
  if (!asset.publishedAt) {
    return {
      text,
      title: "Fecha aproximada: alta del activo. Al publicar se guarda la fecha real en published_at.",
    };
  }
  return { text, title: "Última fecha de publicación. Se conserva al despublicar." };
}

/** PostgREST / Postgres cuando `assets.published_at` todavía no está migrada. */
export function isMissingPublishedAtColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!error?.message) return false;
  const mentionsColumn = /published_at/i.test(error.message);
  const missing =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|schema cache|could not find/i.test(error.message);
  return mentionsColumn && missing;
}
