/**
 * Workflow de ofertas. Vive fuera de los archivos "use server" para poder
 * testearlo y para que el cliente no reexporte tipos desde una server action.
 *
 * No firmada: realizada → contraofertada → rechazada.
 * Firmada: aceptada → pbc_solicitada → firmada (con fecha de firma).
 * La contraoferta actualiza la misma fila (un comprador, un activo).
 */

import { displayCommentAuthor } from "@/lib/comment-author";

export const OFERTA_ESTADOS = [
  "realizada",
  "contraofertada",
  "rechazada",
  "aceptada",
  "pbc_solicitada",
  "firmada",
] as const;

export type OfertaEstado = (typeof OFERTA_ESTADOS)[number];

/**
 * Seguimiento comercial. No forma parte del workflow
 * (realizada → … → firmada) y se puede cambiar en cualquier momento.
 */
export const SEGUIMIENTOS_OFERTA = [
  "pendiente",
  "en_seguimiento",
  "enviado",
  "sin_respuesta",
] as const;

export type SeguimientoOferta = (typeof SEGUIMIENTOS_OFERTA)[number];

export const ETIQUETA_SEGUIMIENTO: Record<SeguimientoOferta, string> = {
  pendiente: "Pendiente",
  en_seguimiento: "En seguimiento",
  enviado: "Enviado",
  sin_respuesta: "Sin respuesta",
};

export type GrupoOferta = "no_firmada" | "firmada";

export const ETIQUETA_ESTADO: Record<OfertaEstado, string> = {
  realizada: "Oferta realizada",
  contraofertada: "Contraofertada",
  rechazada: "Rechazada",
  aceptada: "Aceptada",
  pbc_solicitada: "Solicitamos documentación (PBC)",
  firmada: "Fecha de firma",
};

export const ETIQUETA_GRUPO: Record<GrupoOferta, string> = {
  no_firmada: "No firmada",
  firmada: "Firmada",
};

/** Mensaje cuando el índice único comprador+activo rechaza el alta. */
export const MENSAJE_OFERTA_DUPLICADA = "Este comprador ya tiene una oferta en este activo";

export const MENSAJE_OFERTA_AGENTE_DUPLICADA = "Este agente ya tiene una oferta en este activo";

/**
 * Cambiar el estado no escribe al comprador.
 * El alta de oferta sigue avisando al vendedor o a soporte, y ese envío
 * pasa por `sendEmail` (`EMAIL_DRY_RUN`).
 */
export const OFERTA_ESTADO_EMAIL_COMPRADOR = false;

export interface OfertaHistorialRow {
  id: string;
  oferta_id: string;
  estado_desde: string | null;
  estado_hasta: string;
  importe_anterior: number | null;
  importe_nuevo: number | null;
  nota: string | null;
  author: string | null;
  author_role: string | null;
  /** Relleno solo cuando la fila registra un cambio de seguimiento. */
  seguimiento_desde?: string | null;
  seguimiento_hasta?: string | null;
  created_at: string;
}

export interface OfertaRow {
  id: string;
  comprador_id: string | null;
  vendedor_id: string | null;
  asset_id: string;
  propuesta_euros: number;
  comentarios: string | null;
  /** Nombre visible del comentario. El admin llega como «Gestor». */
  comentarios_author?: string | null;
  comentarios_author_role?: string | null;
  estado: OfertaEstado;
  /** Independiente de `estado`. Por defecto pendiente. */
  seguimiento: SeguimientoOferta;
  nda_enviado_at: string | null;
  nda_firmado_at: string | null;
  fecha_firma: string | null;
  contraoferta_nota: string | null;
  created_at: string;
  updated_at: string;
  historial?: OfertaHistorialRow[];
}

export interface CambioOfertaInput {
  ofertaId: string;
  estado: OfertaEstado;
  importe?: number | null;
  nota?: string | null;
  fechaFirma?: string | null;
}

export type CambioOfertaResultado =
  | {
      ok: true;
      estado: OfertaEstado;
      importe: number | null;
      nota: string | null;
      fechaFirma: string | null;
    }
  | { ok: false; error: string };

export const ORIGENES_INTERES = ["asignado", "nda", "favorito"] as const;

export type OrigenInteres = (typeof ORIGENES_INTERES)[number];

export const ETIQUETA_ORIGEN: Record<OrigenInteres, string> = {
  asignado: "Asignado",
  nda: "NDA del activo",
  favorito: "Favorito",
};

export interface EventoInteres {
  compradorId: string;
  origen: OrigenInteres;
  fecha: string;
}

export interface InteresAgrupado {
  compradorId: string;
  /** Fecha más antigua entre los orígenes, sin duplicar al comprador. */
  fecha: string;
  origenes: Array<{ origen: OrigenInteres; fecha: string }>;
}

export interface ClienteInteresado {
  compradorId: string;
  nombre: string;
  agente: string;
  fecha: string;
  origenes: Array<{ origen: OrigenInteres; fecha: string }>;
}

export function esOfertaEstado(value: string): value is OfertaEstado {
  return (OFERTA_ESTADOS as readonly string[]).includes(value);
}

export function esSeguimientoOferta(value: string): value is SeguimientoOferta {
  return (SEGUIMIENTOS_OFERTA as readonly string[]).includes(value);
}

export function etiquetaSeguimiento(value: string): string {
  if (esSeguimientoOferta(value)) return ETIQUETA_SEGUIMIENTO[value];
  return value;
}

export function seguimientoODefecto(value: string | null | undefined): SeguimientoOferta {
  if (value && esSeguimientoOferta(value)) return value;
  return "pendiente";
}

/**
 * El seguimiento no tiene transiciones: cualquiera de los cuatro valores
 * es válido, y no mueve el estado de workflow.
 */
export function validarSeguimiento(
  actual: string | null | undefined,
  siguiente: string,
): { ok: true; desde: SeguimientoOferta; hasta: SeguimientoOferta } | { ok: false; error: string } {
  if (!esSeguimientoOferta(siguiente)) {
    return { ok: false, error: "Seguimiento no válido" };
  }
  const desde = seguimientoODefecto(actual);
  if (desde === siguiente) {
    return { ok: false, error: "El seguimiento ya está en ese estado" };
  }
  return { ok: true, desde, hasta: siguiente };
}

export interface SeguimientoCambio {
  ofertaId: string;
  desde: SeguimientoOferta;
  hasta: SeguimientoOferta;
  author: string;
  authorRole: string;
  at: string;
}

/**
 * Punto de extensión para automatizaciones al cambiar el seguimiento.
 * Hoy no hay ninguna registrada: quien quiera reaccionar llama a
 * `registrarAutomatizacionSeguimiento` al arrancar el proceso.
 */
export type AutomatizacionSeguimiento = (evento: SeguimientoCambio) => void | Promise<void>;

const automatizacionesSeguimiento: AutomatizacionSeguimiento[] = [];

export function registrarAutomatizacionSeguimiento(fn: AutomatizacionSeguimiento): () => void {
  automatizacionesSeguimiento.push(fn);
  return () => {
    const index = automatizacionesSeguimiento.indexOf(fn);
    if (index >= 0) automatizacionesSeguimiento.splice(index, 1);
  };
}

export async function notificarCambioSeguimiento(evento: SeguimientoCambio): Promise<void> {
  for (const automatizacion of [...automatizacionesSeguimiento]) {
    await automatizacion(evento);
  }
}

/**
 * El agente edita el seguimiento si tiene la sección Ofertas
 * (ver o editar). El admin siempre puede.
 */
export function puedeEditarSeguimiento(input: {
  role: "admin" | "vendedor" | "cliente";
  puedeVerOfertas: boolean;
}): boolean {
  switch (input.role) {
    case "admin":
      return true;
    case "vendedor":
      return input.puedeVerOfertas;
    case "cliente":
      return false;
    default: {
      const unreachable: never = input.role;
      return unreachable;
    }
  }
}

export function etiquetaEstado(estado: string): string {
  if (esOfertaEstado(estado)) return ETIQUETA_ESTADO[estado];
  return estado;
}

/**
 * Estados anteriores al workflow. La migración SQL usa el mismo mapa
 * y guarda el valor viejo en `ofertas.estado_legacy`.
 * `nda_enviado_at` y `nda_firmado_at` no se borran.
 */
export function migrarEstadoLegacy(estado: string): OfertaEstado | null {
  switch (estado) {
    case "pendiente":
      return "realizada";
    case "validada":
    case "nda_enviado":
      return "aceptada";
    case "rechazada":
      return "rechazada";
    case "nda_firmado":
      return "firmada";
    case "realizada":
    case "contraofertada":
    case "aceptada":
    case "pbc_solicitada":
    case "firmada":
      return estado;
    default:
      return null;
  }
}

export function transicionesDesde(estado: OfertaEstado): OfertaEstado[] {
  switch (estado) {
    case "realizada":
      return ["contraofertada", "rechazada", "aceptada"];
    case "contraofertada":
      return ["contraofertada", "rechazada", "aceptada"];
    case "rechazada":
      return [];
    case "aceptada":
      return ["pbc_solicitada"];
    case "pbc_solicitada":
      return ["firmada"];
    case "firmada":
      return [];
    default: {
      const unreachable: never = estado;
      return unreachable;
    }
  }
}

export function esTransicionValida(desde: OfertaEstado, hacia: OfertaEstado): boolean {
  return transicionesDesde(desde).includes(hacia);
}

export function grupoOferta(estado: string): GrupoOferta | null {
  if (!esOfertaEstado(estado)) return null;
  switch (estado) {
    case "realizada":
    case "contraofertada":
    case "rechazada":
      return "no_firmada";
    case "aceptada":
    case "pbc_solicitada":
    case "firmada":
      return "firmada";
    default: {
      const unreachable: never = estado;
      return unreachable;
    }
  }
}

export function agruparOfertasPorFirma<T extends { estado: string }>(
  ofertas: T[],
): { noFirmada: T[]; firmada: T[]; otras: T[] } {
  const noFirmada: T[] = [];
  const firmada: T[] = [];
  const otras: T[] = [];
  for (const oferta of ofertas) {
    const grupo = grupoOferta(oferta.estado);
    if (grupo === "no_firmada") noFirmada.push(oferta);
    else if (grupo === "firmada") firmada.push(oferta);
    else otras.push(oferta);
  }
  return { noFirmada, firmada, otras };
}

/**
 * Fecha de firma. Acepta `YYYY-MM-DD` (mediodía UTC, para no correr el día)
 * o un ISO completo. Devuelve null si no se puede leer.
 */
export function normalizarFechaFirma(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const day = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    const iso = `${day}T12:00:00.000Z`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.toISOString().slice(0, 10) !== day) return null;
    return iso;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function validarCambioOferta(
  actual: { estado: string },
  cambio: { estado: OfertaEstado; importe?: number | null; nota?: string | null; fechaFirma?: string | null },
): CambioOfertaResultado {
  if (!esOfertaEstado(actual.estado)) {
    return { ok: false, error: "Estado de oferta no reconocido" };
  }
  if (!esTransicionValida(actual.estado, cambio.estado)) {
    return {
      ok: false,
      error: `No se puede pasar de ${etiquetaEstado(actual.estado)} a ${etiquetaEstado(cambio.estado)}`,
    };
  }
  if (cambio.estado === "contraofertada") {
    const importe = Number(cambio.importe);
    if (!Number.isFinite(importe) || importe <= 0) {
      return { ok: false, error: "La contraoferta necesita un importe mayor que 0" };
    }
    const nota = (cambio.nota ?? "").trim();
    if (!nota) {
      return { ok: false, error: "La contraoferta necesita una nota" };
    }
    return { ok: true, estado: cambio.estado, importe, nota, fechaFirma: null };
  }
  if (cambio.estado === "firmada") {
    const fechaFirma = normalizarFechaFirma(cambio.fechaFirma);
    if (!fechaFirma) {
      return { ok: false, error: "La fecha de firma es obligatoria" };
    }
    return { ok: true, estado: cambio.estado, importe: null, nota: null, fechaFirma };
  }
  return { ok: true, estado: cambio.estado, importe: null, nota: null, fechaFirma: null };
}

export function mensajeErrorOferta(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}): string {
  const blob = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  const duplicada = error.code === "23505"
    || /duplicate key|unique constraint|ofertas_comprador_asset_uidx|ofertas_vendedor_asset_uidx/i.test(blob);
  if (!duplicada) return error.message?.trim() || "No se pudo registrar la oferta";
  if (/ofertas_vendedor_asset_uidx/i.test(blob) && !/ofertas_comprador_asset_uidx/i.test(blob)) {
    return MENSAJE_OFERTA_AGENTE_DUPLICADA;
  }
  return MENSAJE_OFERTA_DUPLICADA;
}

/**
 * Autor que se guarda en el historial. El admin queda como «Gestor»,
 * igual que en los comentarios.
 */
export function authorHistorial(session: { role: string; nombre?: string | null }): {
  author: string;
  author_role: string;
} {
  return {
    author: displayCommentAuthor({ author: session.nombre, authorRole: session.role }),
    author_role: session.role,
  };
}

export function puedeVerOferta(input: {
  role: "admin" | "vendedor" | "cliente";
  vendedorId: string | null;
  /** Agente asignado al comprador de la oferta, si lo hay. */
  compradorAsignadoA: string | null;
  ofertaVendedorId: string | null;
  ofertaCompradorId: string | null;
}): boolean {
  switch (input.role) {
    case "admin":
      return true;
    case "cliente":
      return false;
    case "vendedor": {
      if (!input.vendedorId) return false;
      if (input.ofertaVendedorId && input.ofertaVendedorId === input.vendedorId) return true;
      if (input.ofertaCompradorId && input.compradorAsignadoA === input.vendedorId) return true;
      return false;
    }
    default: {
      const unreachable: never = input.role;
      return unreachable;
    }
  }
}

export function agruparIntereses(eventos: EventoInteres[]): InteresAgrupado[] {
  const map = new Map<string, InteresAgrupado>();
  for (const evento of eventos) {
    const compradorId = evento.compradorId.trim();
    if (!compradorId || !evento.fecha) continue;
    const current = map.get(compradorId);
    if (!current) {
      map.set(compradorId, {
        compradorId,
        fecha: evento.fecha,
        origenes: [{ origen: evento.origen, fecha: evento.fecha }],
      });
      continue;
    }
    const same = current.origenes.find((item) => item.origen === evento.origen);
    if (!same) {
      current.origenes.push({ origen: evento.origen, fecha: evento.fecha });
    } else if (evento.fecha < same.fecha) {
      same.fecha = evento.fecha;
    }
    if (evento.fecha < current.fecha) current.fecha = evento.fecha;
  }
  return [...map.values()].sort((a, b) => {
    if (a.fecha === b.fecha) return a.compradorId.localeCompare(b.compradorId);
    return a.fecha < b.fecha ? 1 : -1;
  });
}

/**
 * El NDA del activo lo firman agentes y compradores. Solo entra en
 * «clientes interesados» si el usuario es un comprador.
 */
export function eventosNdaCompradores(
  firmas: Array<{ userId: string; acceptedAt: string }>,
  compradorIdPorUsuario: ReadonlyMap<string, string>,
): EventoInteres[] {
  const eventos: EventoInteres[] = [];
  for (const firma of firmas) {
    const compradorId = compradorIdPorUsuario.get(firma.userId);
    if (!compradorId) continue;
    eventos.push({ compradorId, origen: "nda", fecha: firma.acceptedAt });
  }
  return eventos;
}

export function filtrarInteresesParaActor(
  eventos: EventoInteres[],
  actor: { role: "admin" | "vendedor" | "cliente"; vendedorId: string | null },
  asignacion: ReadonlyMap<string, string | null>,
): EventoInteres[] {
  switch (actor.role) {
    case "admin":
      return eventos;
    case "cliente":
      return [];
    case "vendedor": {
      if (!actor.vendedorId) return [];
      return eventos.filter((evento) => asignacion.get(evento.compradorId) === actor.vendedorId);
    }
    default: {
      const unreachable: never = actor.role;
      return unreachable;
    }
  }
}
