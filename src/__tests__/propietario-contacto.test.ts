import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseTemplateExcel } from "@/lib/normalize-excel";
import { propiedadPatchFromExcelRaw } from "@/lib/propiedad-canonical";
import {
  migratePropietarioContacto,
  type OwnerMigrationInput,
} from "@/lib/propietario-contacto";
import { stripPropiedadPii } from "@/lib/supabase/db";
import type { Propiedad } from "@/lib/types";

function workbook(rows: unknown[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Carga");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = new File([new Uint8Array(buffer)], "carga.xlsx");
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(buffer),
    configurable: true,
  });
  return file;
}

const baseRow = ["SI", "NPL", "1890034VK1419S0010DS", "ESC-1"];

describe("migratePropietarioContacto", () => {
  it("pasa el nombre único histórico a Propietario y no lo copia a Contacto", () => {
    const legacy: OwnerMigrationInput = {
      propietario: "—",
      contacto: null,
      telefono: "",
      mail: "—",
      ownerName: "Ana López",
      ownerTel: "600111222",
      ownerMail: "ana@example.com",
    };

    expect(migratePropietarioContacto(legacy)).toEqual({
      propietario: "Ana López",
      contacto: "—",
      telefono: "600111222",
      mail: "ana@example.com",
    });
  });

  it("no pisa propietario, contacto, teléfono ni email que ya tienen valor", () => {
    const current: OwnerMigrationInput = {
      propietario: "Propietario actual",
      contacto: "Persona de contacto",
      telefono: "611000000",
      mail: "actual@example.com",
      ownerName: "Nombre viejo del inmueble",
      ownerTel: "600000000",
      ownerMail: "viejo@example.com",
    };

    const once = migratePropietarioContacto(current);
    expect(once).toEqual({
      propietario: "Propietario actual",
      contacto: "Persona de contacto",
      telefono: "611000000",
      mail: "actual@example.com",
    });
    expect(migratePropietarioContacto(once)).toEqual(once);
  });

  it("deja contacto vacío en guion aunque el propietario ya estuviera informado", () => {
    expect(migratePropietarioContacto({
      propietario: "Solo propietario",
      contacto: "  ",
      telefono: "611",
      mail: "a@b.com",
    })).toEqual({
      propietario: "Solo propietario",
      contacto: "—",
      telefono: "611",
      mail: "a@b.com",
    });
  });
});

describe("parseTemplateExcel — propietario y contacto", () => {
  it("mapea las columnas Propietario y Contacto del formato nuevo", async () => {
    const file = workbook([
      ["Propietario", "Contacto", "Telefono", "mail", "Publicar", "Categoria", "Referencia", "ID1"],
      ["Ana López", "Carlos Ruiz", "600111222", "ana@example.com", ...baseRow],
    ]);

    const parsed = await parseTemplateExcel(file);

    expect(parsed.propiedades[0]).toMatchObject({
      propietario: "Ana López",
      contacto: "Carlos Ruiz",
      telefono: "600111222",
      mail: "ana@example.com",
    });
  });

  it("acepta el formato antiguo con una sola columna de nombre", async () => {
    const file = workbook([
      ["Propietario / Vendedor", "Telefono", "mail", "Publicar", "Categoria", "Referencia", "ID1"],
      ["Sergio Vidal", "673006438", "a@b.com", ...baseRow],
    ]);

    const parsed = await parseTemplateExcel(file);

    expect(parsed.propiedades[0].propietario).toBe("Sergio Vidal");
    expect(parsed.propiedades[0].contacto).toBe("");
    expect(parsed.propiedades[0].telefono).toBe("673006438");
    expect(parsed.propiedades[0].mail).toBe("a@b.com");
  });

  it("si conviven la columna nueva y la antigua, usa Propietario y Contacto", async () => {
    const file = workbook([
      ["Propietario / Vendedor", "Propietario", "Contacto", "Publicar", "Categoria", "Referencia", "ID1"],
      ["Nombre viejo", "Nombre nuevo", "Persona", ...baseRow],
    ]);

    const parsed = await parseTemplateExcel(file);

    expect(parsed.propiedades[0].propietario).toBe("Nombre nuevo");
    expect(parsed.propiedades[0].contacto).toBe("Persona");
  });
});

describe("excel_raw proyecta propietario y contacto", () => {
  it("copia las cabeceras nuevas y el alias antiguo a las columnas", () => {
    expect(propiedadPatchFromExcelRaw({
      Carga: {
        "Propietario / Vendedor": "Ana López",
        Contacto: "Carlos Ruiz",
        Telefono: "600111222",
        mail: "ana@example.com",
      },
    })).toMatchObject({
      propietario: "Ana López",
      contacto: "Carlos Ruiz",
      telefono: "600111222",
      mail: "ana@example.com",
    });
  });
});

describe("stripPropiedadPii", () => {
  it("oculta propietario, contacto, teléfono, email y el excel en bruto", () => {
    const full = {
      id: "P1",
      inmuebleId: "A1",
      activoId: "ACT",
      categoria: "NPL",
      propietario: "Ana López",
      contacto: "Carlos Ruiz",
      telefono: "600",
      mail: "ana@example.com",
      faseInterna: "Disponible",
      faseC: "fp-pub",
      proceso: "—",
      deuda: 10,
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
      fechaLanzamiento: "—",
      lanzamiento: "—",
      infoOcupantes: "—",
      inscrito: "—",
      cargas: "—",
      registralmenteOk: "—",
      excelRaw: { Hoja: { Propietario: "Ana López", Contacto: "Carlos Ruiz" } },
    } satisfies Propiedad;

    const hidden = stripPropiedadPii(full);

    expect(hidden.propietario).toBe("—");
    expect(hidden.contacto).toBe("—");
    expect(hidden.telefono).toBe("—");
    expect(hidden.mail).toBe("—");
    expect(hidden.excelRaw).toBeUndefined();
    expect(hidden.deuda).toBe(10);
    expect(hidden.faseInterna).toBe("Disponible");
  });
});
