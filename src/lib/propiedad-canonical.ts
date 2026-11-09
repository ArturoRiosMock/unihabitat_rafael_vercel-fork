import { isEmptyExcelCell } from "@/lib/excel-raw-utils";
import { parseLocaleMoneyInput } from "@/lib/utils";

/**
 * Cabeceras del Excel que proyectan a `propiedades.deuda`.
 * «Deuda» es la columna de la plantilla. «Precio de la deuda» es el alias
 * que usa el cliente para el mismo importe.
 */
const DEUDA_ALIASES = ["DEUDA", "PRECIO DE LA DEUDA", "PRECIO DEUDA"];
const PROCESO_ALIASES = ["PROCESO"];

export interface CanonicalField<T> {
  /** Había una cabecera reconocible en alguna hoja. */
  present: boolean;
  value: T;
}

export interface CanonicalProjection {
  deuda: CanonicalField<number | null>;
  proceso: CanonicalField<string>;
}

/** Misma normalización de cabeceras que el import (sin acentos, mayúsculas). */
export function foldHeader(value: string): string {
  return value
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

function findAlias(
  excelRaw: Record<string, Record<string, string>>,
  aliases: readonly string[],
): { present: boolean; raw: string } {
  let empty: string | null = null;
  for (const cols of Object.values(excelRaw)) {
    for (const [header, val] of Object.entries(cols)) {
      if (!aliases.includes(foldHeader(header))) continue;
      if (!isEmptyExcelCell(val)) return { present: true, raw: val };
      if (empty === null) empty = val ?? "";
    }
  }
  if (empty !== null) return { present: true, raw: "" };
  return { present: false, raw: "" };
}

/**
 * Lee Deuda y Proceso desde el blob `excel_raw`.
 * Si la cabecera no está, `present` es false y no hay que tocar la columna.
 * Si está vacía, el valor canónico queda vacío (deuda null, proceso «—»).
 */
export function canonicalFieldsFromExcelRaw(
  excelRaw: Record<string, Record<string, string>>,
): CanonicalProjection {
  const deuda = findAlias(excelRaw, DEUDA_ALIASES);
  const proceso = findAlias(excelRaw, PROCESO_ALIASES);
  const procesoText = proceso.raw.trim();
  return {
    deuda: {
      present: deuda.present,
      value: deuda.present ? parseLocaleMoneyInput(deuda.raw) : null,
    },
    proceso: {
      present: proceso.present,
      value: proceso.present ? (procesoText || "—") : "—",
    },
  };
}

/** Columnas de `propiedades` que hay que actualizar junto con `excel_raw`. */
export function propiedadPatchFromExcelRaw(
  excelRaw: Record<string, Record<string, string>>,
): { deuda?: number | null; proceso?: string } {
  const canonical = canonicalFieldsFromExcelRaw(excelRaw);
  const patch: { deuda?: number | null; proceso?: string } = {};
  if (canonical.deuda.present) patch.deuda = canonical.deuda.value;
  if (canonical.proceso.present) patch.proceso = canonical.proceso.value;
  return patch;
}
