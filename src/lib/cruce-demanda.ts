/**
 * Cruce de demanda del comprador con activos publicados.
 * Lógica pura: sin "use server", sin Supabase y sin envío de email.
 */

import { assetPortalHref, assetPrivateHref } from "@/lib/public-slug";

export const LIMITE_OPORTUNIDADES_DEFECTO = 5;
export const LIMITE_OPORTUNIDADES_MAX = 50;

export const NIVELES_CRUCE = ["poblacion", "provincia", "sin_categoria", "solo_categoria"] as const;
export type NivelCruce = (typeof NIVELES_CRUCE)[number];

export const ESTADOS_OPORTUNIDAD = ["ofrecida", "vista", "interesado", "descartada"] as const;
export type EstadoOportunidad = (typeof ESTADOS_OPORTUNIDAD)[number];

export const CANALES_OPORTUNIDAD = ["cron", "manual"] as const;
export type CanalOportunidad = (typeof CANALES_OPORTUNIDAD)[number];

export const ESTADOS_QUE_MARCA_COMPRADOR: EstadoOportunidad[] = ["interesado", "descartada"];

/** Catálogo que la ficha ofrece. El cruce también acepta categorías libres del Excel. */
export const CATALOGO_CATEGORIAS = [
  "Vivienda",
  "Local",
  "Suelo",
  "Nave",
  "Parking",
  "Trastero",
  "Oficina",
  "Edificio",
  "CDR",
  "NPL",
] as const;

const FAMILIA_CATEGORIA: Record<string, string> = {
  VIVIENDA: "VIVIENDA",
  PISO: "VIVIENDA",
  CASA: "VIVIENDA",
  CHALET: "VIVIENDA",
  RESIDENCIAL: "VIVIENDA",
  ATICO: "VIVIENDA",
  DUPLEX: "VIVIENDA",
  APARTAMENTO: "VIVIENDA",
  LOCAL: "LOCAL",
  COMERCIAL: "LOCAL",
  SUELO: "SUELO",
  SOLAR: "SUELO",
  TERRENO: "SUELO",
  PARCELA: "SUELO",
  NAVE: "NAVE",
  INDUSTRIAL: "NAVE",
  PARKING: "PARKING",
  GARAJE: "PARKING",
  PLAZA: "PARKING",
  TRASTERO: "TRASTERO",
  OFICINA: "OFICINA",
  EDIFICIO: "EDIFICIO",
};

export const ETIQUETA_NIVEL: Record<NivelCruce, string> = {
  poblacion: "Categoría y población",
  provincia: "Categoría y provincia",
  sin_categoria: "Ubicación sin categoría",
  solo_categoria: "Solo categoría",
};

export const ETIQUETA_ESTADO_OPORTUNIDAD: Record<EstadoOportunidad, string> = {
  ofrecida: "Ofrecida",
  vista: "Vista",
  interesado: "Interesado",
  descartada: "Descartada",
};

export const ESTADOS_DEMANDA = ["activa", "archivada"] as const;
export type EstadoDemanda = (typeof ESTADOS_DEMANDA)[number];

export interface DemandaComprador {
  /** Vacío en el algoritmo; la fila guardada lo trae. */
  id?: string;
  compradorId: string;
  categorias: string[];
  provincias: string[];
  poblaciones: string[];
  precioMin: number | null;
  precioMax: number | null;
  estado?: EstadoDemanda;
  createdAt?: string;
  autor?: string | null;
  autorRol?: string | null;
}

export interface DemandaInput {
  categorias?: string[];
  provincias?: string[];
  poblaciones?: string[];
  precioMin?: number | null;
  precioMax?: number | null;
}

export interface ActivoCruce {
  id: string;
  publicado: boolean;
  provincia: string;
  poblacion: string;
  precio: number | null;
  /** Tipología del inmueble y categoría/tipología de sus cargas. */
  categorias: string[];
  tip: string;
  publicSlug?: string;
}

export interface ActorCruce {
  role: "admin" | "vendedor" | "cliente" | null;
  vendedorId: string | null;
  compradorId: string | null;
}

export interface CruceHit {
  compradorId: string;
  assetId: string;
  nivel: NivelCruce;
}

export interface CruceComprador {
  id: string;
  email: string;
  nombre: string;
  agenteEmail: string | null;
}

export interface OportunidadInsert {
  compradorId: string;
  assetId: string;
  nivel: NivelCruce;
  canal: CanalOportunidad;
}

export interface EjecucionCruce {
  origen: "cron" | "manual";
  compradores: number;
  conDemanda: number;
  oportunidades: number;
  porNivel: Record<NivelCruce, number>;
  emailsEnviados: number;
  emailsOmitidos: number;
  createdAt?: string;
}

export interface FichaPublicaOportunidad {
  assetId: string;
  titulo: string;
  lugar: string;
  precioLabel: string | null;
  url: string;
  nivel: NivelCruce;
}

export interface EnvioResumen {
  compradorId: string;
  to: string;
  cc?: string;
  nombre: string;
  oportunidades: FichaPublicaOportunidad[];
}

export interface CruceStore {
  listCompradores(): Promise<CruceComprador[]>;
  listDemandas(): Promise<DemandaComprador[]>;
  listActivosPublicados(): Promise<ActivoCruce[]>;
  listOfrecidos(compradorIds: string[]): Promise<Array<{ compradorId: string; assetId: string }>>;
  insertOportunidades(rows: OportunidadInsert[]): Promise<void>;
  insertEjecucion(row: EjecucionCruce): Promise<void>;
}

export interface OpcionesCruce {
  limite?: number;
  origen: "cron" | "manual";
  /** Si viene, solo cruza a ese comprador. El lote completo no se registra en el historial. */
  soloCompradorId?: string;
  registrar: boolean;
  emailEnabled: boolean;
  origenPublico?: string;
  /**
   * Activos ya enviados a ese comprador. El cruce automático los mete aquí
   * para no repetirlos. El alta manual pide confirmación en la action.
   */
  excluir?: Array<{ compradorId: string; assetId: string }>;
  /**
   * Compradores que ya tienen 2 avisos esta semana. No se registran en
   * esta pasada: el siguiente lote aún puede ofrecerles el activo.
   */
  compradoresSinCupo?: ReadonlySet<string>;
  enviarEmail?: (envio: EnvioResumen) => Promise<"enviado" | "error" | "omitido">;
}

export interface ResultadoCruceComprador {
  compradorId: string;
  nivel: NivelCruce | null;
  assetIds: string[];
  fichas: FichaPublicaOportunidad[];
  email: "enviado" | "omitido" | "error" | "desactivado";
  omitidoPorCupo?: boolean;
}

export interface ResultadoCruce extends EjecucionCruce {
  detalles: ResultadoCruceComprador[];
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

/** Mayúsculas, sin tildes y con espacios colapsados. */
export function normalizarLugar(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function clavesCategoria(raw: string): string[] {
  const folded = normalizarLugar(raw);
  if (!folded) return [];
  const claves = new Set<string>();
  claves.add(FAMILIA_CATEGORIA[folded] ?? folded);
  for (const token of folded.split(/[^A-Z0-9]+/).filter(Boolean)) {
    const familia = FAMILIA_CATEGORIA[token];
    if (familia) claves.add(familia);
  }
  return [...claves];
}

export function categoriasCoinciden(demanda: string[], activo: string[]): boolean {
  const buscadas = new Set(demanda.flatMap(clavesCategoria));
  if (buscadas.size === 0) return false;
  for (const clave of activo.flatMap(clavesCategoria)) {
    if (buscadas.has(clave)) return true;
  }
  return false;
}

export function precioEnRango(
  precio: number | null,
  min: number | null,
  max: number | null,
): boolean {
  const tieneMin = min != null && Number.isFinite(min);
  const tieneMax = max != null && Number.isFinite(max);
  if (!tieneMin && !tieneMax) return true;
  if (precio == null || !Number.isFinite(precio)) return false;
  if (tieneMin && precio < (min as number)) return false;
  if (tieneMax && precio > (max as number)) return false;
  return true;
}

export function lugarCoincide(valor: string, preferencias: string[]): boolean {
  if (preferencias.length === 0) return false;
  const clave = normalizarLugar(valor);
  if (!clave) return false;
  return preferencias.some((preferencia) => normalizarLugar(preferencia) === clave);
}

export function limiteEfectivo(limite?: number): number {
  if (limite == null || !Number.isFinite(limite) || limite < 1) return LIMITE_OPORTUNIDADES_DEFECTO;
  return Math.min(Math.floor(limite), LIMITE_OPORTUNIDADES_MAX);
}

export function cruceDemandaEmailEnabled(value: string | undefined | null): boolean {
  const normalizado = (value ?? "").trim().toLowerCase();
  return normalizado === "true" || normalizado === "1" || normalizado === "yes" || normalizado === "si" || normalizado === "sí";
}

export function limiteDesdeEnv(value: string | undefined | null): number {
  if (value == null || value.trim() === "") return LIMITE_OPORTUNIDADES_DEFECTO;
  return limiteEfectivo(Number(value));
}

export function etiquetaNivel(nivel: NivelCruce): string {
  switch (nivel) {
    case "poblacion":
    case "provincia":
    case "sin_categoria":
    case "solo_categoria":
      return ETIQUETA_NIVEL[nivel];
    default: {
      const desconocido: never = nivel;
      return desconocido;
    }
  }
}

function tieneTilde(value: string): boolean {
  const folded = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return value.normalize("NFD") !== folded;
}

function etiquetaPreferida(prev: string, next: string): string {
  const prevTilde = tieneTilde(prev);
  const nextTilde = tieneTilde(next);
  if (nextTilde && !prevTilde) return next;
  if (prevTilde && !nextTilde) return prev;
  const prevCaps = prev === prev.toUpperCase();
  const nextCaps = next === next.toUpperCase();
  if (prevCaps && !nextCaps) return next;
  if (!prevCaps && nextCaps) return prev;
  return prev;
}

export function normalizarLista(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const visible = raw.trim().replace(/\s+/g, " ");
    const clave = normalizarLugar(visible);
    if (!clave) continue;
    const prev = byKey.get(clave);
    byKey.set(clave, prev ? etiquetaPreferida(prev, visible) : visible);
  }
  return [...byKey.values()];
}

export function partirLista(raw: string): string[] {
  return normalizarLista(raw.split(/[,;\n]/));
}

export function validarRangoPrecio(min: number | null, max: number | null): Ok<Record<never, never>> | Err {
  if (min != null && (!Number.isFinite(min) || min < 0)) {
    return { ok: false, error: "El precio mínimo no es válido" };
  }
  if (max != null && (!Number.isFinite(max) || max < 0)) {
    return { ok: false, error: "El precio máximo no es válido" };
  }
  if (min != null && max != null && min > max) {
    return { ok: false, error: "El precio mínimo no puede superar al máximo" };
  }
  return { ok: true };
}

export function normalizarDemanda(
  compradorId: string,
  input: DemandaInput,
): Ok<{ demanda: DemandaComprador }> | Err {
  const precioMin = input.precioMin ?? null;
  const precioMax = input.precioMax ?? null;
  const rango = validarRangoPrecio(precioMin, precioMax);
  if (!rango.ok) return rango;
  return {
    ok: true,
    demanda: {
      compradorId,
      categorias: normalizarLista(input.categorias ?? []),
      provincias: normalizarLista(input.provincias ?? []),
      poblaciones: normalizarLista(input.poblaciones ?? []),
      precioMin,
      precioMax,
    },
  };
}

export function demandaVacia(compradorId: string): DemandaComprador {
  return {
    compradorId,
    categorias: [],
    provincias: [],
    poblaciones: [],
    precioMin: null,
    precioMax: null,
  };
}

function candidatos(
  demanda: DemandaComprador,
  activos: ActivoCruce[],
  yaOfrecidos: Set<string>,
): ActivoCruce[] {
  return activos.filter((activo) => {
    if (!activo.publicado) return false;
    if (yaOfrecidos.has(activo.id)) return false;
    return precioEnRango(activo.precio, demanda.precioMin, demanda.precioMax);
  });
}

function ordenar(activos: ActivoCruce[]): ActivoCruce[] {
  return [...activos].sort((a, b) => a.id.localeCompare(b.id, "es"));
}

/**
 * Cascada por comprador, solo sobre activos publicados que aún no se le han ofrecido.
 * 1. categoría + población
 * 2. si no hay, categoría + provincia
 * 3. si no hay, provincia o población sin categoría
 * Sin ubicación en la demanda: solo categoría.
 */
export function cruzarDemanda(input: {
  demanda: DemandaComprador;
  activos: ActivoCruce[];
  yaOfrecidos: Iterable<string>;
  limite?: number;
}): { nivel: NivelCruce | null; hits: CruceHit[] } {
  const ya = new Set(input.yaOfrecidos);
  const pool = candidatos(input.demanda, input.activos, ya);
  const tieneCategoria = input.demanda.categorias.length > 0;
  const tieneUbicacion = input.demanda.provincias.length > 0 || input.demanda.poblaciones.length > 0;
  if (!tieneCategoria && !tieneUbicacion) return { nivel: null, hits: [] };

  let nivel: NivelCruce;
  let elegidos: ActivoCruce[];

  if (!tieneUbicacion) {
    nivel = "solo_categoria";
    elegidos = pool.filter((activo) => categoriasCoinciden(input.demanda.categorias, activo.categorias));
  } else {
    const porPoblacion = tieneCategoria
      ? pool.filter((activo) => (
        categoriasCoinciden(input.demanda.categorias, activo.categorias)
        && lugarCoincide(activo.poblacion, input.demanda.poblaciones)
      ))
      : [];
    if (porPoblacion.length > 0) {
      nivel = "poblacion";
      elegidos = porPoblacion;
    } else {
      const porProvincia = tieneCategoria
        ? pool.filter((activo) => (
          categoriasCoinciden(input.demanda.categorias, activo.categorias)
          && lugarCoincide(activo.provincia, input.demanda.provincias)
        ))
        : [];
      if (porProvincia.length > 0) {
        nivel = "provincia";
        elegidos = porProvincia;
      } else {
        nivel = "sin_categoria";
        elegidos = pool.filter((activo) => (
          lugarCoincide(activo.poblacion, input.demanda.poblaciones)
          || lugarCoincide(activo.provincia, input.demanda.provincias)
        ));
      }
    }
  }

  const limite = limiteEfectivo(input.limite);
  const hits = ordenar(elegidos).slice(0, limite).map((activo) => ({
    compradorId: input.demanda.compradorId,
    assetId: activo.id,
    nivel,
  }));
  return { nivel: hits.length > 0 ? nivel : null, hits };
}

const ORDEN_NIVEL_CRUCE: Record<NivelCruce, number> = {
  poblacion: 0,
  provincia: 1,
  solo_categoria: 2,
  sin_categoria: 3,
};

/**
 * Cruza todas las demandas activas de un comprador y se queda con el
 * mejor nivel de cada activo, hasta el límite del envío.
 */
export function cruzarDemandas(input: {
  demandas: DemandaComprador[];
  activos: ActivoCruce[];
  yaOfrecidos: Iterable<string>;
  limite?: number;
}): { nivel: NivelCruce | null; hits: CruceHit[] } {
  const activas = input.demandas.filter((demanda) => demanda.estado !== "archivada");
  const ya = new Set(input.yaOfrecidos);
  const porAsset = new Map<string, CruceHit>();
  for (const demanda of activas) {
    const cruce = cruzarDemanda({
      demanda,
      activos: input.activos,
      yaOfrecidos: ya,
      limite: LIMITE_OPORTUNIDADES_MAX,
    });
    for (const hit of cruce.hits) {
      const previo = porAsset.get(hit.assetId);
      if (!previo || ORDEN_NIVEL_CRUCE[hit.nivel] < ORDEN_NIVEL_CRUCE[previo.nivel]) {
        porAsset.set(hit.assetId, hit);
      }
    }
  }
  const ordenados = [...porAsset.values()].sort((a, b) => {
    const nivel = ORDEN_NIVEL_CRUCE[a.nivel] - ORDEN_NIVEL_CRUCE[b.nivel];
    if (nivel !== 0) return nivel;
    return a.assetId.localeCompare(b.assetId, "es");
  });
  const hits = ordenados.slice(0, limiteEfectivo(input.limite));
  const nivel = hits.reduce<NivelCruce | null>((mejor, hit) => {
    if (!mejor || ORDEN_NIVEL_CRUCE[hit.nivel] < ORDEN_NIVEL_CRUCE[mejor]) return hit.nivel;
    return mejor;
  }, null);
  return { nivel, hits };
}

/**
 * Mejor nivel al que este activo encaja con la demanda.
 * La ficha del activo lo usa para listar compradores. El envío semanal
 * sigue la cascada del conjunto, no mezcla niveles.
 */
export function nivelEncajeActivo(demanda: DemandaComprador, activo: ActivoCruce): NivelCruce | null {
  if (!activo.publicado) return null;
  if (!precioEnRango(activo.precio, demanda.precioMin, demanda.precioMax)) return null;
  const tieneCategoria = demanda.categorias.length > 0;
  const tieneUbicacion = demanda.provincias.length > 0 || demanda.poblaciones.length > 0;
  const categoria = tieneCategoria && categoriasCoinciden(demanda.categorias, activo.categorias);
  const poblacion = lugarCoincide(activo.poblacion, demanda.poblaciones);
  const provincia = lugarCoincide(activo.provincia, demanda.provincias);
  if (!tieneUbicacion) return categoria ? "solo_categoria" : null;
  if (categoria && poblacion) return "poblacion";
  if (categoria && provincia) return "provincia";
  if (poblacion || provincia) return "sin_categoria";
  return null;
}

export function puedeLeerDemanda(
  actor: ActorCruce,
  compradorId: string,
  assignedVendedorId: string | null,
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "vendedor") {
    return Boolean(actor.vendedorId) && actor.vendedorId === assignedVendedorId;
  }
  if (actor.role === "cliente") {
    return Boolean(actor.compradorId) && actor.compradorId === compradorId;
  }
  return false;
}

export function puedeEditarDemanda(
  actor: ActorCruce,
  compradorId: string,
  assignedVendedorId: string | null,
): boolean {
  return puedeLeerDemanda(actor, compradorId, assignedVendedorId);
}

export function puedeBuscarOportunidades(
  actor: ActorCruce,
  assignedVendedorId: string | null,
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "vendedor") {
    return Boolean(actor.vendedorId) && actor.vendedorId === assignedVendedorId;
  }
  return false;
}

export function puedeLanzarCruce(actor: ActorCruce): boolean {
  return actor.role === "admin";
}

export function puedeMarcarEstado(
  actor: ActorCruce,
  compradorId: string,
  assignedVendedorId: string | null,
  estado: EstadoOportunidad,
): Ok<Record<never, never>> | Err {
  if (!puedeLeerDemanda(actor, compradorId, assignedVendedorId)) {
    return { ok: false, error: "No tienes acceso a este comprador" };
  }
  if (!ESTADOS_OPORTUNIDAD.includes(estado)) {
    return { ok: false, error: "Estado no válido" };
  }
  if (actor.role === "cliente" && !ESTADOS_QUE_MARCA_COMPRADOR.includes(estado)) {
    return { ok: false, error: "Solo puedes marcar interesado o descartada" };
  }
  return { ok: true };
}

export function planEnvioResumen(input: {
  emailEnabled: boolean;
  compradorEmail: string;
  agenteEmail?: string | null;
}): { enviar: false; motivo: "flag" | "sin_email" } | { enviar: true; to: string; cc?: string } {
  if (!input.emailEnabled) return { enviar: false, motivo: "flag" };
  const to = input.compradorEmail.trim();
  if (!to.includes("@")) return { enviar: false, motivo: "sin_email" };
  const cc = (input.agenteEmail ?? "").trim();
  if (cc.includes("@") && cc.toLowerCase() !== to.toLowerCase()) {
    return { enviar: true, to, cc };
  }
  return { enviar: true, to };
}

export function formatearPrecio(precio: number | null): string | null {
  if (precio == null || !Number.isFinite(precio)) return null;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(precio);
}

/** Ficha pública: tipología, lugar y precio. Sin referencia catastral ni cargas. */
export function fichaPublicaOportunidad(
  activo: ActivoCruce,
  nivel: NivelCruce,
  origenPublico: string,
): FichaPublicaOportunidad {
  const lugar = [activo.poblacion, activo.provincia].map((parte) => parte.trim()).filter(Boolean).join(", ");
  const path = assetPortalHref({ id: activo.id, publicSlug: activo.publicSlug });
  const base = origenPublico.replace(/\/+$/, "");
  return {
    assetId: activo.id,
    titulo: activo.tip.trim() || "Inmueble",
    lugar: lugar || "España",
    precioLabel: formatearPrecio(activo.precio),
    url: `${base}${path}`,
    nivel,
  };
}

export function hrefPrivadoActivo(activo: Pick<ActivoCruce, "id" | "publicSlug">): string {
  return assetPrivateHref({ id: activo.id, publicSlug: activo.publicSlug });
}

function porNivelVacio(): Record<NivelCruce, number> {
  return { poblacion: 0, provincia: 0, sin_categoria: 0, solo_categoria: 0 };
}

export async function ejecutarCruce(
  store: CruceStore,
  opciones: OpcionesCruce,
): Promise<ResultadoCruce> {
  const limite = limiteEfectivo(opciones.limite);
  const [compradores, demandas, activos] = await Promise.all([
    store.listCompradores(),
    store.listDemandas(),
    store.listActivosPublicados(),
  ]);
  const activoPorId = new Map(activos.map((activo) => [activo.id, activo]));
  const compradorPorId = new Map(compradores.map((comprador) => [comprador.id, comprador]));
  const grupos = new Map<string, DemandaComprador[]>();
  for (const demanda of demandas) {
    if (demanda.estado === "archivada") continue;
    const lista = grupos.get(demanda.compradorId) ?? [];
    lista.push(demanda);
    grupos.set(demanda.compradorId, lista);
  }

  let objetivos = [...grupos.keys()];
  if (opciones.soloCompradorId) {
    objetivos = objetivos.filter((id) => id === opciones.soloCompradorId);
  }
  const ofrecidos = await store.listOfrecidos(objetivos);
  const yaPorComprador = new Map<string, Set<string>>();
  for (const fila of ofrecidos) {
    const set = yaPorComprador.get(fila.compradorId) ?? new Set<string>();
    set.add(fila.assetId);
    yaPorComprador.set(fila.compradorId, set);
  }

  const porNivel = porNivelVacio();
  const detalles: ResultadoCruceComprador[] = [];
  const aInsertar: OportunidadInsert[] = [];
  const envios = new Map<string, EnvioResumen>();
  const canal: CanalOportunidad = opciones.origen === "cron" ? "cron" : "manual";
  const origenPublico = opciones.origenPublico ?? "";
  const quiereEmail = opciones.registrar && opciones.emailEnabled && Boolean(opciones.enviarEmail);

  for (const compradorId of objetivos) {
    if (opciones.compradoresSinCupo?.has(compradorId)) {
      detalles.push({
        compradorId,
        nivel: null,
        assetIds: [],
        fichas: [],
        email: "omitido",
        omitidoPorCupo: true,
      });
      continue;
    }
    const ya = new Set(yaPorComprador.get(compradorId) ?? []);
    for (const excluido of opciones.excluir ?? []) {
      if (excluido.compradorId === compradorId) ya.add(excluido.assetId);
    }
    const cruce = cruzarDemandas({
      demandas: grupos.get(compradorId) ?? [],
      activos,
      yaOfrecidos: ya,
      limite,
    });
    for (const hit of cruce.hits) {
      porNivel[hit.nivel] += 1;
      aInsertar.push({ ...hit, canal });
    }
    const comprador = compradorPorId.get(compradorId);
    const fichas = cruce.hits.flatMap((hit) => {
      const activo = activoPorId.get(hit.assetId);
      return activo ? [fichaPublicaOportunidad(activo, hit.nivel, origenPublico)] : [];
    });
    const plan = planEnvioResumen({
      emailEnabled: quiereEmail && fichas.length > 0,
      compradorEmail: comprador?.email ?? "",
      agenteEmail: comprador?.agenteEmail,
    });
    if (plan.enviar) {
      envios.set(compradorId, {
        compradorId,
        to: plan.to,
        cc: plan.cc,
        nombre: comprador?.nombre?.trim() || "cliente",
        oportunidades: fichas,
      });
    }
    detalles.push({
      compradorId,
      nivel: cruce.nivel,
      assetIds: cruce.hits.map((hit) => hit.assetId),
      fichas,
      email: fichas.length === 0 || !quiereEmail ? "desactivado" : "omitido",
    });
  }

  if (opciones.registrar && aInsertar.length > 0) {
    await store.insertOportunidades(aInsertar);
  }

  let emailsEnviados = 0;
  if (quiereEmail && opciones.enviarEmail) {
    const enviar = opciones.enviarEmail;
    for (const detalle of detalles) {
      const envio = envios.get(detalle.compradorId);
      if (!envio) {
        detalle.email = detalle.assetIds.length === 0 ? "desactivado" : "omitido";
        continue;
      }
      try {
        const estado = await enviar(envio);
        detalle.email = estado === "enviado" || estado === "omitido" || estado === "error"
          ? estado
          : "error";
      } catch {
        detalle.email = "error";
      }
      if (detalle.email === "enviado") emailsEnviados += 1;
    }
  }

  const emailsOmitidos = detalles.filter((detalle) => (
    detalle.assetIds.length > 0 && detalle.email !== "enviado"
  )).length;

  const resultado: ResultadoCruce = {
    origen: opciones.origen,
    compradores: detalles.filter((detalle) => detalle.assetIds.length > 0).length,
    conDemanda: objetivos.length,
    oportunidades: aInsertar.length,
    porNivel,
    emailsEnviados,
    emailsOmitidos,
    createdAt: new Date().toISOString(),
    detalles,
  };

  if (opciones.registrar && !opciones.soloCompradorId) {
    await store.insertEjecucion(resultado);
  }
  return resultado;
}

export interface OportunidadVista {
  id: string;
  compradorId: string;
  assetId: string;
  nivel: NivelCruce;
  canal: CanalOportunidad;
  estado: EstadoOportunidad;
  createdAt: string;
  titulo: string;
  lugar: string;
  precioLabel: string | null;
  hrefPublico: string;
  hrefPrivado: string;
}

export interface EncajeComprador {
  compradorId: string;
  nombre: string;
  agente: string;
  nivel: NivelCruce;
}

const ORDEN_NIVEL: Record<NivelCruce, number> = {
  poblacion: 0,
  provincia: 1,
  solo_categoria: 2,
  sin_categoria: 3,
};

export function ordenarEncaje(filas: EncajeComprador[]): EncajeComprador[] {
  return [...filas].sort((a, b) => {
    const nivel = ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel];
    if (nivel !== 0) return nivel;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
