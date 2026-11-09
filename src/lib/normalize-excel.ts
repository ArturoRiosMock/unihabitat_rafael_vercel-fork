/* ============================================================
 * PropCRM — Parser de plantilla maestra única (CDR/NPL)
 * ============================================================
 *
 * El sistema ya no soporta los formatos de proveedores antiguos
 * (Proveedor 1/2/3 + Enriquecido). La plantilla oficial tiene
 * un núcleo común de columnas (0-31) y dos extensiones específicas
 * según la columna "Categoria" (CDR o NPL).
 *
 * Modelo de salida:
 *   - 1 fila del Excel → 1 propiedad (lien/carga)
 *   - N filas con misma `Referencia` → 1 inmueble (merge fill-empty)
 *   - `ID1` agrupa propiedades del mismo activo/préstamo
 */

import * as XLSX from "xlsx";
import type { Asset, Propiedad } from "./types";
import { faseToCode } from "./fase-interna";

export interface ParseTemplateResult {
  inmuebles: Asset[];
  propiedades: Propiedad[];
  diag: {
    sheet: string;
    rows: number;
    parsed: number;
    skipped: number;
    skippedReasons: Record<string, number>;
    /** Conteos por categoría tal cual en el Excel (dinámico). */
    categoryCounts: Record<string, number>;
  };
}

/* ------------------------------------------------------------------ */
/*  Header normalization                                              */
/* ------------------------------------------------------------------ */

/** NFD + uppercase + sin acentos. Tolerante a variantes. */
function fold(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

/** Localiza el índice de la primera cabecera que case con cualquiera de los alias. */
function indexOfHeader(headers: unknown[], aliases: string[]): number {
  const folded = headers.map(fold);
  for (const alias of aliases) {
    const target = fold(alias);
    const i = folded.indexOf(target);
    if (i >= 0) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/*  Cell parsers                                                      */
/* ------------------------------------------------------------------ */

function s(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Preserva el valor tal cual; vacío queda vacío (el cliente prefiere ver
 *  celdas en blanco a "—" cuando el Excel no aporta dato). */
function preserveOrEmpty(v: string): string {
  return v ?? "";
}

/** Parsea "10,500000" / "289600.88" / "10500" → number; vacío → null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const str = String(v).trim();
  if (!str) return null;
  // "1.000,5" → tirar puntos como separadores de miles y coma como decimal.
  // "10,5"    → reemplazar coma por punto.
  // "10.5"    → tal cual.
  const hasDot = str.includes(".");
  const hasComma = str.includes(",");
  let normalized = str;
  if (hasDot && hasComma) {
    normalized = str.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = str.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "SI" / "NO" / "TRUE" / "FALSE" → boolean. */
function bool(v: unknown): boolean {
  const f = fold(v);
  return f === "SI" || f === "SÍ" || f === "TRUE" || f === "1" || f === "YES" || f === "Y";
}

/* ------------------------------------------------------------------ */
/*  Categoría → tipC / faseC                                          */
/* ------------------------------------------------------------------ */

/**
 * Normaliza el campo "Bien" o "Tipo Inmueble" a una tipología canónica
 * SOLO cuando el valor encaja con un patrón conocido. Para valores
 * desconocidos (ej. "OTROS", "NAVE INDUSTRIAL CON OFICINA") preserva el
 * texto original del Excel — no quiere imponer un default "Vivienda".
 *
 * Devuelve "" cuando la celda viene vacía.
 */
export function normalizeTipo(bien: string): string {
  const raw = (bien ?? "").trim();
  if (!raw) return "";
  const f = fold(raw);
  if (f === "—") return "";
  if (/PISO|APARTAMENTO/.test(f)) return "Piso";
  if (/VIVIENDA UNIFAMILIAR|CASA|CHALET/.test(f)) return "Casa / Chalet";
  if (/VIVIENDA/.test(f)) return "Vivienda";
  if (/GARAJE|APARCAMIENTO|PARKING/.test(f)) return "Garaje";
  if (/TRASTERO/.test(f)) return "Trastero";
  if (/LOCAL|COMERCIAL/.test(f)) return "Comercial";
  if (/OFICINA/.test(f)) return "Oficina";
  if (/NAVE|INDUSTRIAL/.test(f)) return "Nave";
  if (/SUELO|TERRENO|PARCELA/.test(f)) return "Suelo";
  if (/EDIFICIO/.test(f)) return "Edificio";
  if (/OBRA/.test(f)) return "Obra Sin Finalizar";
  // No mapea a ninguna tipología canónica: devolvemos el bien tal cual
  // (capitalizado al estilo Excel: primera letra mayúscula, resto minúsculas).
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function tipoToCode(tip: string): string {
  switch (tip) {
    case "Piso": return "tp-pis";
    case "Vivienda": return "tp-viv";
    case "Casa / Chalet": return "tp-cha";
    case "Garaje": return "tp-gar";
    case "Trastero": return "tp-tra";
    case "Comercial": return "tp-loc";
    case "Oficina": return "tp-ofi";
    case "Nave": return "tp-nav";
    case "Suelo": return "tp-sue";
    case "Edificio": return "tp-edi";
    case "Obra Sin Finalizar": return "tp-obr";
    case "": return "";
    default: return "tp-otr";
  }
}

/** True si la categoría (fold) es NPL — decide qué extensión de columnas usar. */
function isNplCategoria(categoria: string): boolean {
  return fold(categoria) === "NPL";
}

/* ------------------------------------------------------------------ */
/*  Schema mappings                                                   */
/* ------------------------------------------------------------------ */

/** Alias por campo para encontrar la columna en la cabecera. */
const CORE_HEADERS = {
  propietario: ["Propietario"],
  contacto: ["Contacto"],
  telefono: ["Telefono", "Teléfono"],
  mail: ["mail", "Mail", "Email", "E-mail"],
  publicar: ["Publicar"],
  categoria: ["Categoria", "Categoría"],
  faseInterna: ["Fase Interna", "Situación", "Situacion"],
  proceso: ["Proceso"],
  referencia: ["Referencia", "Referencia Catastral", "ReferenciaCatastral"],
  clase: ["Clase"],
  uso: ["Uso"],
  bien: ["Bien"],
  provincia: ["Provincia"],
  municipio: ["Municipio"],
  cp: ["Código Postal", "Codigo Postal", "CP"],
  direccion: ["Dirección Completa", "Direccion Completa"],
  tvia: ["Tipo de Vía", "Tipo de Via"],
  nvia: ["Nombre de Vía", "Nombre de Via"],
  numero: ["Número", "Numero"],
  escalera: ["Escalera"],
  planta: ["Planta"],
  puerta: ["Puerta"],
  supConstruida: ["Superficie Construida (m²)", "Superficie Construida (m2)", "Superficie Construida"],
  supGrafica: ["Superficie Gráfica (m²)", "Superficie Grafica (m2)", "Superficie Gráfica"],
  longitud: ["Longitud"],
  latitud: ["Latitud"],
  antiguedad: ["Antigüedad", "Antiguedad"],
  coefPart: ["Coeficiente Part.", "Coeficiente Participación", "Coef. Part."],
  descripcion: ["Descripción Activo", "Descripcion Activo", "Descripción", "Descripcion"],
  precio: ["Precio"],
  deuda: ["Deuda"],
  id1: ["ID1"],
};

const CDR_EXT_HEADERS = {
  idProperty: ["ID Property"],
  folder: ["Folder"],
  portfolio: ["Portfolio"],
  distrito: ["Distrito"],
  tipologia: ["Tipologia", "Tipología"],
  stageStatus: ["Stage Status"],
  stageSubstatus: ["Stage SubStatus"],
  precioPublicacion: ["Precio Publicacion", "Precio Publicación"],
  referenciaCatastral: ["ReferenciaCatastral", "Referencia Catastral"],
  inscrito: ["Inscrito"],
  cargas: ["Cargas"],
  registralmenteOk: ["Registralmente ok", "Registralmente OK"],
  fechaLanzamiento: ["Fecha lanzamiento"],
  lanzamiento: ["Lanzamiento"],
  hitoJudicial: ["Hito Judicial"],
  infoOcupantes: ["Información ocupantes", "Informacion ocupantes"],
};

const NPL_EXT_HEADERS = {
  dataRef: ["Data Ref.", "Data Ref"],
  portfolio: ["Portfolio"],
  mainLocalCcc14: ["Main Local CCC14"],
  lien: ["Lien"],
  collateralId: ["Collateral ID"],
  idPrinex: ["ID Prinex"],
  idPrinexCorto: ["ID Prinex Corto"],
  ccaa: ["CCAA"],
  tipoInmueble: ["Tipo Inmueble"],
  juzgadoLarga: ["Juzgado Larga"],
  codigoProcedimiento: ["Código Procedimiento", "Codigo Procedimiento"],
  ultimaFaseCalculada: ["Última Fase Calculada", "Ultima Fase Calculada"],
};

/* ------------------------------------------------------------------ */
/*  Index resolution                                                  */
/* ------------------------------------------------------------------ */

type IndexMap<T extends Record<string, string[]>> = { [K in keyof T]: number };

function resolveIndices<T extends Record<string, string[]>>(
  headers: unknown[], aliasMap: T,
): IndexMap<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {};
  for (const key of Object.keys(aliasMap) as Array<keyof T>) {
    out[key] = indexOfHeader(headers, aliasMap[key]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Row → Inmueble + Propiedad                                        */
/* ------------------------------------------------------------------ */

interface ParsedRow {
  inmueble: Asset;
  propiedad: Propiedad;
}

function parseRow(
  row: unknown[],
  core: IndexMap<typeof CORE_HEADERS>,
  cdrExt: IndexMap<typeof CDR_EXT_HEADERS>,
  nplExt: IndexMap<typeof NPL_EXT_HEADERS>,
  rawHeaders: string[],
  sheetName: string,
): ParsedRow | { skip: string } {
  const cell = (idx: number): string => (idx >= 0 ? s(row[idx]) : "");

  // 1. PK compuesta del inmueble = ID1 + Referencia.
  //    La misma Referencia catastral puede aparecer en varios ID1 (activos
  //    distintos que tienen el mismo inmueble físico como colateral); en ese
  //    caso queremos persistirlos por separado, no fusionarlos.
  const referencia = cell(core.referencia);
  const id1 = cell(core.id1);
  if (!referencia) return { skip: "sin Referencia" };
  if (!id1) return { skip: "sin ID1" };
  const inmuebleId = `${id1}__${referencia}`;

  // 2. Categoría — texto libre del Excel (CDR, NPL, OCUPADO, …)
  const categoria = fold(cell(core.categoria)) || "CDR";
  const npl = isNplCategoria(categoria);

  // 3. Inmueble (físico)
  const bien = cell(core.bien);
  const tipoSource = npl && nplExt.tipoInmueble >= 0
    ? cell(nplExt.tipoInmueble)
    : bien;
  const tip = normalizeTipo(tipoSource);

  const longitud = num(row[core.longitud]);
  const latitud = num(row[core.latitud]);

  const inmueble: Asset = {
    id: inmuebleId,
    referencia,
    prov: preserveOrEmpty(cell(core.provincia)),
    pob: preserveOrEmpty(cell(core.municipio)),
    cp: preserveOrEmpty(cell(core.cp)),
    addr: preserveOrEmpty(cell(core.direccion)),
    tip,
    tipC: tipoToCode(tip),
    precio: num(row[core.precio]),
    fav: false,
    chk: false,
    sqm: num(row[core.supConstruida]),
    tvia: preserveOrEmpty(cell(core.tvia)),
    nvia: preserveOrEmpty(cell(core.nvia)),
    num: preserveOrEmpty(cell(core.numero)),
    esc: preserveOrEmpty(cell(core.escalera)),
    pla: preserveOrEmpty(cell(core.planta)),
    pta: preserveOrEmpty(cell(core.puerta)),
    map: "",
    clase: preserveOrEmpty(cell(core.clase)),
    uso: preserveOrEmpty(cell(core.uso)),
    bien: preserveOrEmpty(bien),
    supC: preserveOrEmpty(cell(core.supConstruida)),
    supG: preserveOrEmpty(cell(core.supGrafica)),
    coef: preserveOrEmpty(cell(core.coefPart)),
    ccaa: preserveOrEmpty(npl ? cell(nplExt.ccaa) : ""),
    fullAddr: preserveOrEmpty(cell(core.direccion)),
    desc: preserveOrEmpty(cell(core.descripcion)),
    pub: bool(row[core.publicar]),
    age: preserveOrEmpty(cell(core.antiguedad)),
    lat: latitud,
    lng: longitud,
    propiedades: [],
  };

  // 4. PK de la propiedad
  let propId = "";
  if (npl && nplExt.collateralId >= 0) propId = cell(nplExt.collateralId);
  if (!propId && cdrExt.idProperty >= 0) propId = cell(cdrExt.idProperty);
  if (!propId) propId = `${id1}__${referencia}`;

  // 5. Excel raw
  const excelRaw: Record<string, string> = {};
  for (let c = 0; c < row.length && c < rawHeaders.length; c++) {
    const h = rawHeaders[c];
    if (!h) continue;
    const v = s(row[c]);
    if (v) excelRaw[h] = v;
  }

  const faseInterna = cell(core.faseInterna);
  const ultimaFaseCalculada = npl ? cell(nplExt.ultimaFaseCalculada) : "";

  const propiedad: Propiedad = {
    id: propId,
    inmuebleId,
    activoId: id1,
    categoria,

    propietario: preserveOrEmpty(cell(core.propietario)),
    contacto: preserveOrEmpty(cell(core.contacto)),
    telefono: preserveOrEmpty(cell(core.telefono)),
    mail: preserveOrEmpty(cell(core.mail)),

    faseInterna: preserveOrEmpty(faseInterna),
    faseC: faseToCode(faseInterna),
    proceso: preserveOrEmpty(cell(core.proceso)),
    deuda: num(row[core.deuda]),
    precioPublicacion: !npl ? num(row[cdrExt.precioPublicacion]) : null,
    lien: preserveOrEmpty(npl ? cell(nplExt.lien) : ""),

    collateralId: npl ? cell(nplExt.collateralId) : "",
    idPrinex: npl ? cell(nplExt.idPrinex) : "",
    idPrinexCorto: npl ? cell(nplExt.idPrinexCorto) : "",
    idProperty: !npl ? cell(cdrExt.idProperty) : "",
    dataRef: npl ? cell(nplExt.dataRef) : "",

    portfolio: preserveOrEmpty(
      npl ? cell(nplExt.portfolio) : cell(cdrExt.portfolio),
    ),
    folder: preserveOrEmpty(!npl ? cell(cdrExt.folder) : ""),
    mainLocalCcc14: preserveOrEmpty(npl ? cell(nplExt.mainLocalCcc14) : ""),
    stageStatus: preserveOrEmpty(!npl ? cell(cdrExt.stageStatus) : ""),
    stageSubstatus: preserveOrEmpty(!npl ? cell(cdrExt.stageSubstatus) : ""),
    tipologia: preserveOrEmpty(!npl ? cell(cdrExt.tipologia) : ""),

    juzgadoLarga: preserveOrEmpty(npl ? cell(nplExt.juzgadoLarga) : ""),
    codigoProcedimiento: preserveOrEmpty(npl ? cell(nplExt.codigoProcedimiento) : ""),
    ultimaFaseCalculada: preserveOrEmpty(ultimaFaseCalculada),
    hitoJudicial: preserveOrEmpty(!npl ? cell(cdrExt.hitoJudicial) : ""),
    fechaLanzamiento: preserveOrEmpty(!npl ? cell(cdrExt.fechaLanzamiento) : ""),
    lanzamiento: preserveOrEmpty(!npl ? cell(cdrExt.lanzamiento) : ""),
    infoOcupantes: preserveOrEmpty(!npl ? cell(cdrExt.infoOcupantes) : ""),

    inscrito: preserveOrEmpty(!npl ? cell(cdrExt.inscrito) : ""),
    cargas: preserveOrEmpty(!npl ? cell(cdrExt.cargas) : ""),
    registralmenteOk: preserveOrEmpty(!npl ? cell(cdrExt.registralmenteOk) : ""),

    excelRaw: Object.keys(excelRaw).length > 0 ? { [sheetName]: excelRaw } : undefined,
  };

  return { inmueble, propiedad };
}

/* ------------------------------------------------------------------ */
/*  Inmueble merge (cuando una RC aparece en varias filas)            */
/* ------------------------------------------------------------------ */

function pickStr(curr: string, next: string): string {
  const c = curr?.trim();
  const n = next?.trim();
  if (n) return n;
  return c || "";
}

function mergeInmuebles(prev: Asset, next: Asset): Asset {
  return {
    ...prev,
    referencia: next.referencia || prev.referencia,
    prov: pickStr(prev.prov, next.prov),
    pob: pickStr(prev.pob, next.pob),
    cp: pickStr(prev.cp, next.cp),
    addr: pickStr(prev.addr, next.addr),
    tip: next.tip || prev.tip,
    tipC: next.tipC || prev.tipC,
    precio: next.precio ?? prev.precio,
    sqm: next.sqm ?? prev.sqm,
    tvia: pickStr(prev.tvia, next.tvia),
    nvia: pickStr(prev.nvia, next.nvia),
    num: pickStr(prev.num, next.num),
    esc: pickStr(prev.esc, next.esc),
    pla: pickStr(prev.pla, next.pla),
    pta: pickStr(prev.pta, next.pta),
    clase: pickStr(prev.clase, next.clase),
    uso: pickStr(prev.uso, next.uso),
    bien: pickStr(prev.bien, next.bien),
    supC: pickStr(prev.supC, next.supC),
    supG: pickStr(prev.supG, next.supG),
    coef: pickStr(prev.coef, next.coef),
    ccaa: pickStr(prev.ccaa, next.ccaa),
    fullAddr: pickStr(prev.fullAddr, next.fullAddr),
    desc: pickStr(prev.desc, next.desc),
    pub: prev.pub || next.pub,
    age: pickStr(prev.age ?? "", next.age ?? "") || prev.age,
    lat: next.lat ?? prev.lat,
    lng: next.lng ?? prev.lng,
  };
}

/* ------------------------------------------------------------------ */
/*  Main entry                                                        */
/* ------------------------------------------------------------------ */

export async function parseTemplateExcel(file: File): Promise<ParseTemplateResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (allRows.length < 2) {
    return {
      inmuebles: [], propiedades: [],
      diag: {
        sheet: sheetName, rows: 0, parsed: 0, skipped: 0,
        skippedReasons: {}, categoryCounts: {},
      },
    };
  }

  const headers = allRows[0] as unknown[];
  const rawHeaders = headers.map((h) => s(h));

  const core = resolveIndices(headers, CORE_HEADERS);
  const cdrExt = resolveIndices(headers, CDR_EXT_HEADERS);
  const nplExt = resolveIndices(headers, NPL_EXT_HEADERS);

  if (core.referencia < 0) {
    throw new Error(
      'Cabecera "Referencia" / "Referencia Catastral" no encontrada en la primera hoja del Excel.',
    );
  }
  if (core.id1 < 0) {
    throw new Error('Cabecera "ID1" no encontrada en la primera hoja del Excel.');
  }
  if (core.categoria < 0) {
    throw new Error('Cabecera "Categoria" no encontrada en la primera hoja del Excel.');
  }

  const inmueblesById = new Map<string, Asset>();
  const propiedades: Propiedad[] = [];
  const skippedReasons: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  let parsed = 0;
  let skipped = 0;

  const dataRows = allRows.slice(1);
  for (const row of dataRows) {
    if (!row || (row as unknown[]).every((c) => s(c) === "")) {
      skipped++;
      skippedReasons["fila vacía"] = (skippedReasons["fila vacía"] ?? 0) + 1;
      continue;
    }

    const result = parseRow(row as unknown[], core, cdrExt, nplExt, rawHeaders, sheetName);
    if ("skip" in result) {
      skipped++;
      skippedReasons[result.skip] = (skippedReasons[result.skip] ?? 0) + 1;
      continue;
    }

    const prev = inmueblesById.get(result.inmueble.id);
    inmueblesById.set(
      result.inmueble.id,
      prev ? mergeInmuebles(prev, result.inmueble) : result.inmueble,
    );
    propiedades.push(result.propiedad);
    const cat = result.propiedad.categoria || "CDR";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    parsed++;
  }

  // Dedup propiedades (defensivo).
  const propsById = new Map<string, Propiedad>();
  for (const p of propiedades) propsById.set(p.id, p);

  return {
    inmuebles: [...inmueblesById.values()],
    propiedades: [...propsById.values()],
    diag: {
      sheet: sheetName,
      rows: dataRows.length,
      parsed,
      skipped,
      skippedReasons,
      categoryCounts,
    },
  };
}
