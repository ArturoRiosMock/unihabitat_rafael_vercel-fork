import * as XLSX from "xlsx";
import type { Asset } from "@/lib/types";
import { assetsExportFilename, assetsToExcelRows } from "@/lib/asset-excel";

/** Workbook de SheetJS. Importar este módulo solo al pulsar exportar. */
export function buildAssetsWorkbook(assets: readonly Asset[]): XLSX.WorkBook {
  const rows = assetsToExcelRows(assets);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
    { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 36 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 22 }, { wch: 22 },
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
