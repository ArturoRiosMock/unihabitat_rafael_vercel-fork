import type { Asset, Propiedad, Comprador, Vendedor, Tarea } from "../types";

/** Une mapas excel_raw al reimportar: por hoja, preferir celda no vacía del incoming. */
export function mergeExcelRawMaps(
  existing: Record<string, Record<string, string>> | null | undefined,
  incoming: Record<string, Record<string, string>> | null | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) return existing ?? undefined;
  if (!existing || Object.keys(existing).length === 0) return { ...incoming };
  const out: Record<string, Record<string, string>> = { ...existing };
  for (const sheet of Object.keys(incoming)) {
    const inc = incoming[sheet];
    const prev = out[sheet] ?? {};
    const merged: Record<string, string> = { ...prev };
    const keys = new Set([...Object.keys(prev), ...Object.keys(inc)]);
    for (const k of keys) {
      const bv = inc[k];
      const av = merged[k];
      const bOk = bv != null && bv !== "" && bv !== "—";
      const aOk = av != null && av !== "" && av !== "—";
      if (bOk) merged[k] = bv;
      else if (aOk) merged[k] = av;
      else merged[k] = (bv ?? av ?? "") as string;
    }
    out[sheet] = merged;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Row ↔ Model mappers (snake_case DB ↔ camelCase App)               */
/* ------------------------------------------------------------------ */

function finiteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToAsset(r: any): Asset {
  return {
    id: r.id,
    referencia: r.referencia ?? "",
    publicSlug: r.public_slug ?? undefined,
    prov: r.prov ?? "", pob: r.pob ?? "", cp: r.cp ?? "",
    addr: r.addr ?? "", tip: r.tip ?? "", tipC: r.tip_c ?? "",
    precio: r.precio != null ? Number(r.precio) : null,
    fav: r.fav ?? false, chk: false, sqm: r.sqm != null ? Number(r.sqm) : null,
    tvia: r.tvia ?? "", nvia: r.nvia ?? "", num: r.num ?? "",
    esc: r.esc ?? "", pla: r.pla ?? "", pta: r.pta ?? "",
    map: r.map ?? "",
    clase: r.clase ?? "", uso: r.uso ?? "", bien: r.bien ?? "",
    supC: r.sup_c ?? "", supG: r.sup_g ?? "", coef: r.coef ?? "",
    ccaa: r.ccaa ?? "", fullAddr: r.full_addr ?? "", desc: r.descr ?? "",
    pub: r.pub ?? false,
    publishedAt: r.published_at ?? null,
    createdAt: r.created_at ?? null,
    age: r.age,
    lat: finiteOrNull(r.lat),
    lng: finiteOrNull(r.lng),
    propiedades: [],
  };
}

/**
 * Mapper para llamadas desde el portal público / cliente. Aquí el inmueble
 * NO tiene PII propia — toda la PII vive en las propiedades. La sanitización
 * de propiedades para público se hace en `rowToPropiedadPublic`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToAssetPublic(r: any): Asset {
  return rowToAsset(r);
}

export function assetToRow(a: Asset) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    id: a.id, referencia: a.referencia,
    prov: a.prov, pob: a.pob, cp: a.cp, addr: a.addr,
    tip: a.tip, tip_c: a.tipC, precio: a.precio,
    fav: a.fav, sqm: a.sqm, tvia: a.tvia, nvia: a.nvia, num: a.num,
    esc: a.esc, pla: a.pla, pta: a.pta, map: a.map,
    clase: a.clase, uso: a.uso, bien: a.bien, sup_c: a.supC, sup_g: a.supG,
    coef: a.coef, ccaa: a.ccaa, full_addr: a.fullAddr, descr: a.desc,
    pub: a.pub, age: a.age,
  };
  if (a.publicSlug) row.public_slug = a.publicSlug;
  if (a.lat != null) row.lat = a.lat;
  if (a.lng != null) row.lng = a.lng;
  return row;
}

/* ------------------------------------------------------------------ */
/*  Propiedad (carga / lien / colateral)                              */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPropiedad(r: any): Propiedad {
  return {
    id: r.id,
    inmuebleId: r.inmueble_id,
    activoId: r.activo_id,
    categoria: String(r.categoria ?? "").trim() || "CDR",
    propietario: r.propietario ?? "—",
    contacto: r.contacto ?? "—",
    telefono: r.telefono ?? "—",
    mail: r.mail ?? "—",
    faseInterna: r.fase_interna ?? "—",
    faseC: r.fase_c ?? "fp-nd",
    proceso: r.proceso ?? "—",
    deuda: r.deuda != null ? Number(r.deuda) : null,
    precioPublicacion: r.precio_publicacion != null ? Number(r.precio_publicacion) : null,
    lien: r.lien ?? "—",
    collateralId: r.collateral_id ?? "",
    idPrinex: r.id_prinex ?? "",
    idPrinexCorto: r.id_prinex_corto ?? "",
    idProperty: r.id_property ?? "",
    dataRef: r.data_ref ?? "",
    portfolio: r.portfolio ?? "—",
    folder: r.folder ?? "—",
    mainLocalCcc14: r.main_local_ccc14 ?? "—",
    stageStatus: r.stage_status ?? "—",
    stageSubstatus: r.stage_substatus ?? "—",
    tipologia: r.tipologia ?? "—",
    juzgadoLarga: r.juzgado_larga ?? "—",
    codigoProcedimiento: r.codigo_procedimiento ?? "—",
    ultimaFaseCalculada: r.ultima_fase_calculada ?? "—",
    hitoJudicial: r.hito_judicial ?? "—",
    fechaLanzamiento: r.fecha_lanzamiento ?? "—",
    lanzamiento: r.lanzamiento ?? "—",
    infoOcupantes: r.info_ocupantes ?? "—",
    inscrito: r.inscrito ?? "—",
    cargas: r.cargas ?? "—",
    registralmenteOk: r.registralmente_ok ?? "—",
    ...(r.excel_raw && typeof r.excel_raw === "object" && !Array.isArray(r.excel_raw)
      ? { excelRaw: r.excel_raw as Record<string, Record<string, string>> }
      : {}),
  };
}

/** Versión pública sin PII del propietario del préstamo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToPropiedadPublic(r: any): Propiedad {
  const full = rowToPropiedad(r);
  const { excelRaw: _excelRaw, ...rest } = full;
  return {
    ...rest,
    propietario: "—",
    contacto: "—",
    telefono: "—",
    mail: "—",
  };
}

export function propiedadToRow(p: Propiedad) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = {
    id: p.id,
    inmueble_id: p.inmuebleId,
    activo_id: p.activoId,
    categoria: p.categoria,
    propietario: p.propietario,
    contacto: p.contacto,
    telefono: p.telefono,
    mail: p.mail,
    fase_interna: p.faseInterna,
    fase_c: p.faseC,
    proceso: p.proceso,
    deuda: p.deuda,
    precio_publicacion: p.precioPublicacion,
    lien: p.lien,
    collateral_id: p.collateralId || null,
    id_prinex: p.idPrinex || null,
    id_prinex_corto: p.idPrinexCorto || null,
    id_property: p.idProperty || null,
    data_ref: p.dataRef || null,
    portfolio: p.portfolio,
    folder: p.folder,
    main_local_ccc14: p.mainLocalCcc14,
    stage_status: p.stageStatus,
    stage_substatus: p.stageSubstatus,
    tipologia: p.tipologia,
    juzgado_larga: p.juzgadoLarga,
    codigo_procedimiento: p.codigoProcedimiento,
    ultima_fase_calculada: p.ultimaFaseCalculada,
    hito_judicial: p.hitoJudicial,
    fecha_lanzamiento: p.fechaLanzamiento,
    lanzamiento: p.lanzamiento,
    info_ocupantes: p.infoOcupantes,
    inscrito: p.inscrito,
    cargas: p.cargas,
    registralmente_ok: p.registralmenteOk,
  };
  if (p.excelRaw && Object.keys(p.excelRaw).length > 0) row.excel_raw = p.excelRaw;
  return row;
}

/**
 * Adjunta las propiedades a sus inmuebles. Útil después de fetchear
 * `assets` y `propiedades` por separado: `attachPropiedades(assets, props)`
 * llena `asset.propiedades[]` con las que tengan `inmueble_id = asset.id`.
 */
export function attachPropiedades(assets: Asset[], propiedades: Propiedad[]): Asset[] {
  const byInmueble = new Map<string, Propiedad[]>();
  for (const p of propiedades) {
    const list = byInmueble.get(p.inmuebleId);
    if (list) list.push(p);
    else byInmueble.set(p.inmuebleId, [p]);
  }
  return assets.map((a) => ({ ...a, propiedades: byInmueble.get(a.id) ?? [] }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToComprador(r: any): Comprador {
  const acceso = r.acceso === "sin_acceso" ? "sin_acceso" : "activo";
  return {
    id: r.id, nombre: r.nombre, ini: r.ini ?? "", col: r.col ?? "#2563a8,#0d2a4a",
    tipo: r.tipo ?? "Free", agente: r.agente ?? "Admin", email: r.email,
    tel: r.tel ?? "", intereses: r.intereses ?? "", presupuesto: r.presupuesto ?? "",
    activos: r.activos ?? "0", actividad: r.actividad ?? "",
    estado: r.estado ?? "Nuevo", estadoC: r.estado_c ?? "fp-nd",
    nda: r.nda ?? "Pendiente",
    acceso,
  };
}

export function compradorToRow(c: Comprador) {
  return {
    id: c.id, nombre: c.nombre, ini: c.ini, col: c.col, tipo: c.tipo,
    agente: c.agente, email: c.email, tel: c.tel, intereses: c.intereses,
    presupuesto: c.presupuesto, activos: c.activos, actividad: c.actividad,
    estado: c.estado, estado_c: c.estadoC, nda: c.nda,
    acceso: c.acceso === "sin_acceso" ? "sin_acceso" : "activo",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToVendedor(r: any): Vendedor {
  return {
    id: r.id, nombre: r.nombre, ini: r.ini ?? "", col: r.col ?? "#2563a8,#0d2a4a",
    cartera: r.cartera ?? "", activo: r.activo ?? "", agente: r.agente ?? "Admin",
    tel: r.tel ?? "", email: r.email ?? "", ultimo: r.ultimo ?? "",
    estado: r.estado ?? "", estadoC: r.estado_c ?? "fp-nd",
  };
}

export function vendedorToRow(v: Vendedor) {
  return {
    id: v.id, nombre: v.nombre, ini: v.ini, col: v.col, cartera: v.cartera,
    activo: v.activo, agente: v.agente, tel: v.tel, email: v.email,
    ultimo: v.ultimo, estado: v.estado, estado_c: v.estadoC,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToTarea(r: any): Tarea {
  return {
    id: r.id, titulo: r.titulo, agente: r.agente ?? "Admin",
    detalle: r.detalle ?? "", prioridad: r.prioridad ?? "normal",
    fecha: r.fecha ?? "", done: r.done ?? false,
  };
}

export function tareaToRow(t: Tarea) {
  return {
    id: t.id, titulo: t.titulo, agente: t.agente, detalle: t.detalle,
    prioridad: t.prioridad, fecha: t.fecha, done: t.done,
  };
}
