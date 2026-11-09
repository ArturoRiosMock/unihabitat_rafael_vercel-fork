/* ============================================================
 * PropCRM — Modelo de dominio
 * ============================================================
 *
 * Tras la migración inmuebles ↔ propiedades:
 *   - `Asset`     representa el INMUEBLE FÍSICO (1 por Referencia catastral).
 *                 Es lo que se vende, lista en el portal, oferta y favoritea.
 *   - `Propiedad` representa una CARGA / lien / colateral. N por inmueble.
 *                 Contiene propietario del préstamo, deuda, fase judicial,
 *                 identificadores del sistema origen y datos contables.
 *
 * Cada Asset trae embebido su array `propiedades`. Para campos que antes
 * vivían en `asset.adm.*` / `asset.fase` / `asset.ownerName`, leer desde
 * `asset.propiedades[0]?.<campo>` o iterar todas las cargas.
 */

export interface Propiedad {
  /** PK — Collateral ID (NPL) / ID Property (CDR) / hash determinístico. */
  id: string;
  /** FK al inmueble físico (= Asset.id = Referencia catastral). */
  inmuebleId: string;
  /** Agrupador de propiedades del mismo activo/préstamo (col "ID1" del Excel). */
  activoId: string;
  /** Categoría del producto (col "Categoria") — texto libre del Excel. */
  categoria: string;

  // Comerciales — propietario del préstamo (col 0-3 del Excel).
  propietario: string;
  contacto: string;
  telefono: string;
  mail: string;

  // Contables / judicial básico (col 6-7, 30 del Excel).
  faseInterna: string;
  faseC: string;
  proceso: string;
  deuda: number | null;
  precioPublicacion: number | null;
  lien: string;

  // Identificadores del sistema origen.
  collateralId: string;
  idPrinex: string;
  idPrinexCorto: string;
  idProperty: string;
  dataRef: string;

  // Portafolio / clasificación.
  portfolio: string;
  folder: string;
  mainLocalCcc14: string;
  stageStatus: string;
  stageSubstatus: string;
  tipologia: string;

  // Judicial extendido.
  juzgadoLarga: string;
  codigoProcedimiento: string;
  ultimaFaseCalculada: string;
  hitoJudicial: string;
  fechaLanzamiento: string;
  lanzamiento: string;
  infoOcupantes: string;

  // Estado registral (CDR).
  inscrito: string;
  cargas: string;
  registralmenteOk: string;

  /** Fila Excel en bruto: { "Hoja2": { "Header": "Value", ... } }. */
  excelRaw?: Record<string, Record<string, string>>;
}

export interface Asset {
  /** PK compuesta = `${activoId}__${referencia}` (cuando se carga desde Excel).
   *  Permite que la misma Referencia catastral aparezca en varios activos. */
  id: string;
  /** Referencia catastral limpia, para mostrar en UI admin (no en URL pública). */
  referencia: string;
  /** Slug público opaco para /portal/inmueble/[slug]. */
  publicSlug?: string;
  prov: string;
  pob: string;
  cp: string;
  addr: string;
  tip: string;
  tipC: string;
  precio: number | null;
  fav: boolean;
  /** Flag local de UI para checks (no persiste). */
  chk: boolean;
  sqm: number | null;
  tvia: string;
  nvia: string;
  num: string;
  esc: string;
  pla: string;
  pta: string;
  map: string;
  clase: string;
  uso: string;
  bien: string;
  supC: string;
  supG: string;
  coef: string;
  ccaa: string;
  fullAddr: string;
  desc: string;
  pub: boolean;
  /**
   * Última publicación en el portal (ISO 8601). Se conserva al despublicar.
   * `null` si nunca se publicó o si la columna aún no existe en la base.
   */
  publishedAt?: string | null;
  /** Alta del registro (`assets.created_at`). Fallback si no hay `publishedAt`. */
  createdAt?: string | null;
  age?: string;
  lat?: number | null;
  lng?: number | null;
  /** Cargas / liens / colaterales asociados al inmueble. Puede venir vacío
   *  si el inmueble no tiene propiedades cargadas (ej.: registro huérfano). */
  propiedades: Propiedad[];
}

export type CompradorAcceso = "sin_acceso" | "activo";

export interface Comprador {
  id: string;
  nombre: string;
  ini: string;
  col: string;
  tipo: "Privado" | "Free";
  agente: string;
  email: string;
  tel: string;
  intereses: string;
  presupuesto: string;
  activos: string;
  actividad: string;
  estado: string;
  estadoC: string;
  nda: "Firmada" | "Pendiente";
  /** Portal privado: sin_acceso hasta activación manual admin. */
  acceso: CompradorAcceso;
}

export interface Vendedor {
  id: string;
  nombre: string;
  ini: string;
  col: string;
  cartera: string;
  activo: string;
  agente: string;
  tel: string;
  email: string;
  ultimo: string;
  estado: string;
  estadoC: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  agente: string;
  detalle: string;
  prioridad: "urgente" | "normal" | "baja" | "completada";
  fecha: string;
  done: boolean;
}

export interface NoteEntry {
  author: string;
  date: string;
  text: string;
}

export interface DocItem {
  name: string;
  meta: string;
  iconType: "pdf" | "xls" | "img";
}

export interface ChatMessage {
  from: "cli" | "adm";
  text: string;
  time: string;
}
