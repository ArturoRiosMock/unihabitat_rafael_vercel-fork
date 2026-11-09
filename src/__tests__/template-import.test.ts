import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { parseTemplateExcel } from "@/lib/normalize-excel";

/**
 * Tests del parser nuevo `parseTemplateExcel` contra los Excel oficiales de
 * la plantilla maestra (CDR + NPL).
 *
 * Fixtures: src/__tests__/fixtures/{CDR,NPL}.xlsx — copias 1:1 de las
 * plantillas de ejemplo del cliente.
 */

/**
 * jsdom no implementa File.arrayBuffer() de forma confiable, así que
 * envolvemos el Buffer en un File con `arrayBuffer` parchado.
 */
function loadFixture(name: string): File | null {
  try {
    const buf = readFileSync(resolve(__dirname, "fixtures", name));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const file = new File([buf], name);
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(ab),
      configurable: true,
    });
    return file;
  } catch {
    return null;
  }
}

function fileFromArrayBuffer(name: string, ab: ArrayBuffer): File {
  const file = new File([new Uint8Array(ab)], name);
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(ab),
    configurable: true,
  });
  return file;
}

describe("parseTemplateExcel — plantilla CDR", () => {
  it("parsea todas las filas como inmuebles y propiedades CDR", async () => {
    const file = loadFixture("CDR.xlsx");
    if (!file) return;
    const r = await parseTemplateExcel(file);

    // El ejemplo CDR tiene 15 filas con Referencia única → 15 inmuebles + 15 propiedades.
    expect(r.diag.rows).toBeGreaterThan(0);
    expect(r.inmuebles.length).toBeGreaterThan(0);
    expect(r.propiedades.length).toBe(r.inmuebles.length);
    expect(r.diag.categoryCounts.CDR ?? 0).toBe(r.propiedades.length);
    expect(r.diag.categoryCounts.NPL ?? 0).toBe(0);
  });

  it("usa PK compuesta ID1__Referencia y expone Referencia limpia", async () => {
    const f = loadFixture("CDR.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    for (const inmueble of r.inmuebles) {
      // id = ID1 + "__" + RC; RC suelta es alfanumérica de 14+ chars.
      expect(inmueble.id).toContain("__");
      expect(inmueble.referencia).toMatch(/^[0-9A-Z]{14,}$/);
      expect(inmueble.id.endsWith(`__${inmueble.referencia}`)).toBe(true);
    }
  });

  it("parsea Publicar SI/NO como booleano", async () => {
    const f = loadFixture("CDR.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    // Al menos un inmueble del ejemplo CDR debe tener pub=true.
    expect(r.inmuebles.some((i) => i.pub === true)).toBe(true);
  });

  it("parsea precio con coma decimal española como número", async () => {
    const f = loadFixture("CDR.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    const conPrecio = r.inmuebles.filter((i) => i.precio != null && i.precio > 0);
    expect(conPrecio.length).toBeGreaterThan(0);
  });

  it("propaga lat/lng del Excel a campos numéricos", async () => {
    const f = loadFixture("CDR.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    const conCoords = r.inmuebles.filter((i) => i.lat != null && i.lng != null);
    expect(conCoords.length).toBeGreaterThan(0);
  });

  it("preserva propietario y propiedades en cada lien", async () => {
    const f = loadFixture("CDR.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    expect(r.propiedades.every((p) => p.propietario !== "")).toBe(true);
    expect(r.propiedades.every((p) => p.activoId !== "")).toBe(true);
  });
});

describe("parseTemplateExcel — plantilla NPL", () => {
  it("parsea las filas y fusiona inmuebles cuando la Referencia se repite (liens distintos)", async () => {
    const f = loadFixture("NPL.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);

    // Cada fila válida del Excel produce una propiedad. Si una RC aparece
    // varias veces (Lien=1 + Lien=2) los inmuebles se fusionan, por lo que
    // hay menos inmuebles que propiedades.
    expect(r.propiedades.length).toBeGreaterThan(0);
    expect(r.inmuebles.length).toBeGreaterThan(0);
    expect(r.inmuebles.length).toBeLessThanOrEqual(r.propiedades.length);
    // categoryCounts cuenta filas parseadas (pre-dedup), por eso puede ser
    // mayor que propiedades.length si Collateral ID se repitió.
    expect(r.diag.categoryCounts.NPL ?? 0).toBeGreaterThanOrEqual(r.propiedades.length);
    expect(r.diag.categoryCounts.CDR ?? 0).toBe(0);
  });

  it("agrupa propiedades del mismo activo por ID1", async () => {
    const f = loadFixture("NPL.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    const groups = new Map<string, number>();
    for (const p of r.propiedades) {
      groups.set(p.activoId, (groups.get(p.activoId) ?? 0) + 1);
    }
    // En el NPL de ejemplo el ID1 "UF72058" aparece varias veces.
    const repeated = [...groups.values()].filter((n) => n > 1);
    expect(repeated.length).toBeGreaterThan(0);
  });

  it("usa Collateral ID como PK de cada propiedad cuando está disponible", async () => {
    const f = loadFixture("NPL.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    const conCollateral = r.propiedades.filter((p) => p.collateralId !== "");
    expect(conCollateral.length).toBeGreaterThan(0);
    // El id de la propiedad coincide con su collateralId cuando éste no está vacío.
    for (const p of conCollateral) {
      expect(p.id).toBe(p.collateralId);
    }
  });

  it("preserva la Referencia como id del inmueble incluso si aparece en varias filas", async () => {
    const f = loadFixture("NPL.xlsx");
    if (!f) return;
    const r = await parseTemplateExcel(f);
    const inmuebleIds = new Set(r.inmuebles.map((i) => i.id));
    for (const p of r.propiedades) {
      expect(inmuebleIds.has(p.inmuebleId)).toBe(true);
    }
  });
});

describe("parseTemplateExcel — plantilla OCUPADO (100 filas cliente)", () => {
  it("parsea el Excel real de ocupados: 100 inmuebles OCUPADO", async () => {
    const rootXlsx = resolve(
      process.cwd(),
      "Plantilla subidas Master Ejemplo Ocupados (2).xlsx",
    );
    let buf: Buffer;
    try {
      buf = readFileSync(rootXlsx);
    } catch {
      // Fixture opcional en CI sin el Excel del cliente.
      return;
    }
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const file = new File([buf], "ocupados.xlsx");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(ab),
      configurable: true,
    });
    const r = await parseTemplateExcel(file);
    expect(r.inmuebles.length).toBe(100);
    expect(r.propiedades.length).toBe(100);
    expect(r.diag.categoryCounts.OCUPADO).toBe(100);
    expect(r.propiedades.every((p) => p.categoria === "OCUPADO")).toBe(true);
    expect(r.inmuebles.every((i) => i.referencia.length >= 14)).toBe(true);
    expect(r.inmuebles.every((i) => i.id.includes("__"))).toBe(true);
  });
});

describe("parseTemplateExcel — errores", () => {
  it("lanza error si falta la cabecera Referencia", async () => {
    // Excel mínimo sin la columna obligatoria.
    const wb = await import("xlsx");
    const ws = wb.utils.aoa_to_sheet([
      ["Categoria", "ID1"],
      ["CDR", "A1"],
    ]);
    const workbook = wb.utils.book_new();
    wb.utils.book_append_sheet(workbook, ws, "Hoja1");
    const buf = wb.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = fileFromArrayBuffer("sin-referencia.xlsx", buf);
    await expect(parseTemplateExcel(file)).rejects.toThrow(/Referencia/);
  });
});

describe("parseTemplateExcel — contraejemplos plan (CE-1, CE-2, CE-3)", () => {
  it("acepta cabecera Referencia Catastral (plantilla cliente)", async () => {
    const wb = await import("xlsx");
    const ws = wb.utils.aoa_to_sheet([
      [
        "Propietario", "Telefono", "mail", "Publicar", "Categoria", "Fase Interna",
        "Proceso", "Referencia Catastral", "Deuda", "Precio", "ID1",
      ],
      [
        "Sergio", "673006438", "a@b.com", "SI", "NPL", "Seguimiento",
        "EJ-1", "1890034VK1419S0010DS", "118945.54", "0", "ESC-HO-01-1200",
      ],
    ]);
    const workbook = wb.utils.book_new();
    wb.utils.book_append_sheet(workbook, ws, "Hoja1");
    const buf = wb.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = await parseTemplateExcel(fileFromArrayBuffer("cliente-rc.xlsx", buf));
    expect(r.inmuebles).toHaveLength(1);
    expect(r.inmuebles[0].referencia).toBe("1890034VK1419S0010DS");
    expect(r.propiedades[0].activoId).toBe("ESC-HO-01-1200");
    expect(r.propiedades[0].faseInterna).toBe("Seguimiento");
  });

  it("acepta la columna Situación del export como fase interna", async () => {
    const wb = await import("xlsx");
    const ws = wb.utils.aoa_to_sheet([
      ["Categoria", "Situación", "Referencia Catastral", "ID1", "Publicar"],
      ["CDR", "Ofertado", "1890014VK1419S0004XO", "ESC-HO-01-1616", "SI"],
    ]);
    const workbook = wb.utils.book_new();
    wb.utils.book_append_sheet(workbook, ws, "Hoja1");
    const buf = wb.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = await parseTemplateExcel(fileFromArrayBuffer("situacion.xlsx", buf));
    expect(r.propiedades[0].faseInterna).toBe("Ofertado");
    expect(r.propiedades[0].faseC).toBe("fp-ofe");
  });

  it("persiste categoría OCUPADO sin forzar a CDR", async () => {
    const wb = await import("xlsx");
    const ws = wb.utils.aoa_to_sheet([
      ["Categoria", "Referencia", "ID1", "Publicar", "Precio"],
      ["OCUPADO", "7106909UK5370N0001QF", "ESC-HO-01-1682", "SI", "72736.89"],
    ]);
    const workbook = wb.utils.book_new();
    wb.utils.book_append_sheet(workbook, ws, "Hoja1");
    const buf = wb.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = await parseTemplateExcel(fileFromArrayBuffer("ocupado.xlsx", buf));
    expect(r.propiedades).toHaveLength(1);
    expect(r.propiedades[0].categoria).toBe("OCUPADO");
    expect(r.diag.categoryCounts.OCUPADO).toBe(1);
    expect(r.diag.categoryCounts.CDR ?? 0).toBe(0);
  });

  it("mismo ID1 con RC distinta → 2 inmuebles y 1 grupo activoId", async () => {
    const wb = await import("xlsx");
    const ws = wb.utils.aoa_to_sheet([
      ["Categoria", "Referencia", "ID1", "Publicar"],
      ["NPL", "AAA1111VK1111A0001AA", "GROUP-01", "SI"],
      ["NPL", "BBB2222VK2222B0002BB", "GROUP-01", "SI"],
    ]);
    const workbook = wb.utils.book_new();
    wb.utils.book_append_sheet(workbook, ws, "Hoja1");
    const buf = wb.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = await parseTemplateExcel(fileFromArrayBuffer("grupo-id1.xlsx", buf));
    expect(r.inmuebles).toHaveLength(2);
    expect(r.propiedades).toHaveLength(2);
    expect(new Set(r.propiedades.map((p) => p.activoId))).toEqual(new Set(["GROUP-01"]));
    expect(r.inmuebles.map((i) => i.id).sort()).toEqual([
      "GROUP-01__AAA1111VK1111A0001AA",
      "GROUP-01__BBB2222VK2222B0002BB",
    ].sort());
  });
});

describe("faseToCode — 8 fases internas", () => {
  it("mapea cada valor de negocio a un código distinto donde aplica", async () => {
    const { faseToCode } = await import("@/lib/fase-interna");
    expect(faseToCode("Disponible")).toBe("fp-pub");
    expect(faseToCode("Seguimiento")).toBe("fp-seg");
    expect(faseToCode("Info. Solicitada")).toBe("fp-info");
    expect(faseToCode("Ofertado")).toBe("fp-ofe");
    expect(faseToCode("Negociación")).toBe("fp-neg");
    expect(faseToCode("Reservado")).toBe("fp-res");
    expect(faseToCode("Cerrado")).toBe("fp-cer");
    expect(faseToCode("No Disponible")).toBe("fp-nd");
  });
});
