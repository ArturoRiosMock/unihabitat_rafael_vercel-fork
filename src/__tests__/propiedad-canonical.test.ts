import { describe, expect, it } from "vitest";
import {
  canonicalFieldsFromExcelRaw,
  propiedadPatchFromExcelRaw,
} from "@/lib/propiedad-canonical";

describe("proyección de Deuda y Proceso desde excel_raw", () => {
  it("copia la deuda y el proceso de la hoja a las columnas de la propiedad", () => {
    const patch = propiedadPatchFromExcelRaw({
      Plantilla: {
        Deuda: "12.500,50 €",
        Proceso: "Ejecución",
        Precio: "90000",
      },
    });

    expect(patch).toEqual({ deuda: 12500.5, proceso: "Ejecución" });
  });

  it("acepta el alias Precio de la deuda y ignora hojas sin esas cabeceras", () => {
    const canonical = canonicalFieldsFromExcelRaw({
      Otra: { Municipio: "León" },
      NPL: { "Precio de la deuda": "1.000", Proceso: "  " },
    });

    expect(canonical.deuda).toEqual({ present: true, value: 1000 });
    expect(canonical.proceso).toEqual({ present: true, value: "—" });
  });

  it("no toca las columnas si el Excel no trae esas cabeceras", () => {
    expect(propiedadPatchFromExcelRaw({ Hoja: { Precio: "10" } })).toEqual({});
  });

  it("una celda vacía borra el valor canónico", () => {
    expect(propiedadPatchFromExcelRaw({
      Hoja: { Deuda: "", Proceso: "—" },
    })).toEqual({ deuda: null, proceso: "—" });
  });
});
