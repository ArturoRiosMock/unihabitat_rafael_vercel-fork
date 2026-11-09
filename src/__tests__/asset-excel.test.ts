import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { Asset, Propiedad } from "@/lib/types";
import {
  assetsExportFilename,
  assetsToExcelRows,
  buildAssetsWorkbook,
  resolveAssetsForExport,
} from "@/lib/asset-excel";

function propiedad(partial: Partial<Propiedad> = {}): Propiedad {
  return {
    id: "P1",
    inmuebleId: "ACT__1234567VK1234S0001AB",
    activoId: "ACT",
    categoria: "NPL",
    propietario: "—",
    contacto: "—",
    telefono: "—",
    mail: "—",
    faseInterna: "Publicado",
    faseC: "fp-pub",
    proceso: "Ejecución",
    deuda: 15000,
    precioPublicacion: null,
    lien: "—",
    collateralId: "",
    idPrinex: "",
    idPrinexCorto: "",
    idProperty: "",
    dataRef: "",
    portfolio: "—",
    folder: "—",
    mainLocalCcc14: "—",
    stageStatus: "—",
    stageSubstatus: "—",
    tipologia: "—",
    juzgadoLarga: "—",
    codigoProcedimiento: "—",
    ultimaFaseCalculada: "—",
    hitoJudicial: "—",
    fechaLanzamiento: "12/03/2024",
    lanzamiento: "—",
    infoOcupantes: "—",
    inscrito: "—",
    cargas: "—",
    registralmenteOk: "—",
    ...partial,
  };
}

function asset(partial: Partial<Asset> & Pick<Asset, "id">): Asset {
  return {
    referencia: "",
    prov: "Madrid",
    pob: "Valdemoro",
    cp: "28340",
    addr: "Calle Mayor 1",
    tip: "PISO",
    tipC: "tp-viv",
    precio: 120000,
    fav: false,
    chk: false,
    sqm: 85,
    tvia: "CALLE",
    nvia: "MAYOR",
    num: "1",
    esc: "—",
    pla: "—",
    pta: "—",
    map: "",
    clase: "URBANO",
    uso: "Residencial",
    bien: "VIVIENDA",
    supC: "85",
    supG: "—",
    coef: "—",
    ccaa: "Madrid",
    fullAddr: "",
    desc: "—",
    pub: true,
    propiedades: [propiedad({ inmuebleId: partial.id })],
    ...partial,
  };
}

describe("exportación Excel de activos", () => {
  const selected = asset({
    id: "ACT__1234567VK1234S0001AB",
    referencia: "1234567VK1234S0001AB",
    publishedAt: "2026-03-15T12:00:00.000Z",
    chk: true,
  });
  const filteredOnly = asset({
    id: "OTRO__999",
    referencia: "999",
    prov: "Alicante",
    pub: false,
    publishedAt: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    precio: null,
    sqm: null,
    chk: false,
    propiedades: [],
  });

  it("exporta la selección y, si no hay, todos los filtrados", () => {
    expect(resolveAssetsForExport([selected, filteredOnly])).toEqual({
      assets: [selected],
      source: "selected",
    });
    const unselected = [{ chk: false, id: "a" }, { chk: false, id: "b" }];
    expect(resolveAssetsForExport(unselected)).toEqual({
      assets: unselected,
      source: "filtered",
    });
    expect(resolveAssetsForExport([])).toEqual({ assets: [], source: "filtered" });
  });

  it("incluye las columnas del cliente y la fecha de publicación en Madrid", () => {
    const [row, hidden] = assetsToExcelRows([selected, filteredOnly]);
    expect(row).toMatchObject({
      ID: "ACT__1234567VK1234S0001AB",
      "Ref. catastral": "1234567VK1234S0001AB",
      "ID activo": "ACT",
      Categoría: "NPL",
      Provincia: "Madrid",
      Población: "Valdemoro",
      CP: "28340",
      Tipología: "PISO",
      "m²": 85,
      Precio: 120000,
      Deuda: 15000,
      Situación: "Publicado",
      Proceso: "Ejecución",
      Publicado: "Sí",
      "Fecha de publicación": "2026-03-15 13:00",
      "Fecha de lanzamiento": "12/03/2024",
    });
    expect(row.Dirección).toContain("MAYOR");
    expect(hidden).toMatchObject({
      Publicado: "No",
      "Fecha de publicación": "",
      Precio: null,
      Deuda: null,
      "m²": null,
      Categoría: "",
      Situación: "",
    });
  });

  it("usa created_at como fecha si el publicado aún no tiene published_at", () => {
    const [row] = assetsToExcelRows([
      asset({
        id: "SIN-SELLO",
        pub: true,
        publishedAt: null,
        createdAt: "2025-04-02T22:15:00.000Z",
        propiedades: [],
      }),
    ]);
    expect(row["Fecha de publicación"]).toBe("2025-04-03 00:15");

    const [derived] = assetsToExcelRows([
      asset({ id: "GRP__REF-CAT", referencia: "", propiedades: [] }),
    ]);
    expect(derived["Ref. catastral"]).toBe("REF-CAT");
    expect(derived["ID activo"]).toBe("GRP");
  });

  it("genera un libro .xlsx con el nombre fechado", () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    expect(assetsExportFilename(now)).toBe("activos-2026-11-09.xlsx");

    const workbook = buildAssetsWorkbook([selected]);
    const sheet = workbook.Sheets.Activos;
    expect(sheet).toBeTruthy();
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(json).toHaveLength(1);
    expect(json[0]?.ID).toBe(selected.id);
    expect(json[0]?.["Ref. catastral"]).toBe("1234567VK1234S0001AB");
    expect(sheet["!autofilter"]).toBeTruthy();
  });
});
