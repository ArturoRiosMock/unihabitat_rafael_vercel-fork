import * as XLSX from "xlsx";
import type { Asset } from "@/lib/types";
import {
  effectivePublishedAt,
  formatPublicationDateTime,
  publicationFileDate,
} from "@/lib/asset-publication";
import { displayAssetAddress, getActivoId, getCategoria, getDeudaTotal, getFaseInterna, getProceso } from "@/lib/utils";

export interface AssetExcelRow {
  ID: string;
  "Ref. catastral": string;
  "ID activo": string;
  Categoría: string;
  Provincia: string;
  Población: string;
  CP: string;
  Dirección: string;
  Tipología: string;
  "m²": number | null;
  Precio: number | null;
  Deuda: number | null;
  Situación: string;
  Proceso: string;
  Publicado: "Sí" | "No";
  "Fecha de publicación": string;
  "Fecha de lanzamiento": string;
}

function cellText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text === "—" ? "" : text;
}

function cadastralReference(asset: Asset): string {
  const direct = cellText(asset.referencia);
  if (direct) return direct;
  const parts = asset.id.split("__");
  return parts.length > 1 ? parts.slice(1).join("__") : asset.id;
}

function activoId(asset: Asset): string {
  const fromPropiedad = cellText(getActivoId(asset));
  if (fromPropiedad) return fromPropiedad;
  const parts = asset.id.split("__");
  return parts.length > 1 ? parts[0] : "";
}

function launchDate(asset: Asset): string {
  const raw = asset.propiedades.find((propiedad) => cellText(propiedad.fechaLanzamiento))?.fechaLanzamiento;
  return cellText(raw);
}

/** Filas seleccionadas del filtro, o todo el filtro si no hay selección. */
export function resolveAssetsForExport<T extends { chk: boolean }>(filtered: readonly T[]): {
  assets: T[];
  source: "selected" | "filtered";
} {
  const selected = filtered.filter((asset) => asset.chk);
  if (selected.length > 0) return { assets: selected, source: "selected" };
  return { assets: [...filtered], source: "filtered" };
}

export function assetsExportFilename(now: Date = new Date()): string {
  return `activos-${publicationFileDate(now)}.xlsx`;
}

export function assetsToExcelRows(assets: readonly Asset[]): AssetExcelRow[] {
  return assets.map((asset) => ({
    ID: asset.id,
    "Ref. catastral": cadastralReference(asset),
    "ID activo": activoId(asset),
    Categoría: cellText(getCategoria(asset)),
    Provincia: cellText(asset.prov),
    Población: cellText(asset.pob),
    CP: cellText(asset.cp),
    Dirección: cellText(displayAssetAddress(asset)),
    Tipología: cellText(asset.tip),
    "m²": asset.sqm ?? null,
    Precio: asset.precio ?? null,
    Deuda: getDeudaTotal(asset),
    Situación: cellText(getFaseInterna(asset)),
    Proceso: cellText(getProceso(asset)),
    Publicado: asset.pub ? "Sí" : "No",
    "Fecha de publicación": formatPublicationDateTime(effectivePublishedAt(asset)),
    "Fecha de lanzamiento": launchDate(asset),
  }));
}

export function buildAssetsWorkbook(assets: readonly Asset[]): XLSX.WorkBook {
  const rows = assetsToExcelRows(assets);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
    { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 36 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 20 }, { wch: 20 },
  ];
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Activos");
  return workbook;
}

export function downloadAssetsWorkbook(assets: readonly Asset[], now: Date = new Date()): void {
  XLSX.writeFile(buildAssetsWorkbook(assets), assetsExportFilename(now));
}
