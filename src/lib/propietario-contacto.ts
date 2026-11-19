/**
 * Propietario y contacto de la carga (`propiedades`).
 * El nombre histórico queda en Propietario. Contacto es un campo aparte.
 * Teléfono y email no se mueven de fila: solo se rellenan si estaban vacíos.
 */

export const PROPIETARIO_HEADER_ALIASES = [
  "Propietario",
  "Propietario / Vendedor",
  "Propietario/Vendedor",
] as const;

export const CONTACTO_HEADER_ALIASES = [
  "Contacto",
  "Persona de contacto",
] as const;

/** Columnas de `propiedades` que solo lee y escribe el admin. */
export const PROPIEDAD_PII_COLUMNS = ["propietario", "contacto", "telefono", "mail"] as const;

const BLANK_OWNER_VALUES = new Set(["", "—", "-", "–"]);

export function isBlankOwnerValue(value: string | null | undefined): boolean {
  if (value == null) return true;
  return BLANK_OWNER_VALUES.has(value.trim());
}

export interface OwnerMigrationInput {
  propietario?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  mail?: string | null;
  /** `assets.owner_name` del esquema anterior, si sigue existiendo. */
  ownerName?: string | null;
  ownerTel?: string | null;
  ownerMail?: string | null;
}

export interface OwnerMigrationResult {
  propietario: string;
  contacto: string;
  telefono: string;
  mail: string;
}

/**
 * Misma regla que `supabase/migrations/20261119e_propietario_contacto.sql`.
 * No pisa un valor ya informado. El nombre legado va a Propietario, nunca a Contacto.
 */
export function migratePropietarioContacto(row: OwnerMigrationInput): OwnerMigrationResult {
  return {
    propietario: keepOrLegacy(row.propietario, row.ownerName),
    contacto: keepOrLegacy(row.contacto, null),
    telefono: keepOrLegacy(row.telefono, row.ownerTel),
    mail: keepOrLegacy(row.mail, row.ownerMail),
  };
}

function keepOrLegacy(current: string | null | undefined, legacy: string | null | undefined): string {
  if (!isBlankOwnerValue(current)) return current!.trim();
  if (!isBlankOwnerValue(legacy)) return legacy!.trim();
  return "—";
}

export function touchesPropiedadPii(fields: Record<string, unknown>): boolean {
  return Object.keys(fields).some((key) =>
    (PROPIEDAD_PII_COLUMNS as readonly string[]).includes(key),
  );
}

function foldHeader(value: string): string {
  return value
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

const PROPIETARIO_FOLDED = new Set(PROPIETARIO_HEADER_ALIASES.map(foldHeader));
const CONTACTO_FOLDED = new Set(CONTACTO_HEADER_ALIASES.map(foldHeader));

function cellForStoredOwner(value: string): string {
  return isBlankOwnerValue(value) ? "" : value.trim();
}

/**
 * Si el excel_raw de la propiedad tiene esas cabeceras, las alinea con
 * Propietario y Contacto. No crea columnas que el Excel no traía.
 */
export function applyOwnerFieldsToExcelRaw(
  excelRaw: Record<string, Record<string, string>> | null | undefined,
  fields: { propietario?: string | null; contacto?: string | null },
): Record<string, Record<string, string>> | null {
  if (!excelRaw || typeof excelRaw !== "object" || Array.isArray(excelRaw)) return null;
  let changed = false;
  const next: Record<string, Record<string, string>> = {};
  for (const [sheet, cols] of Object.entries(excelRaw)) {
    const copy: Record<string, string> = { ...cols };
    for (const header of Object.keys(copy)) {
      const folded = foldHeader(header);
      if (fields.propietario != null && PROPIETARIO_FOLDED.has(folded)) {
        copy[header] = cellForStoredOwner(String(fields.propietario));
        changed = true;
      } else if (fields.contacto != null && CONTACTO_FOLDED.has(folded)) {
        copy[header] = cellForStoredOwner(String(fields.contacto));
        changed = true;
      }
    }
    next[sheet] = copy;
  }
  return changed ? next : null;
}
