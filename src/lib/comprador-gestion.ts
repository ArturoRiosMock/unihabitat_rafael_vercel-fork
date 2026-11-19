/**
 * Regla de negocio: el agente gestiona sus compradores.
 * Si pasan 90 días sin gestión suya, el comprador pasa al gestor (admin).
 * La lógica vive aquí, fuera de los archivos "use server", para poder testearla
 * y para que Turbopack no reexporte tipos desde una server action.
 */

import { inicialesComprador } from "@/lib/comprador-oferta";

export const GESTION_WINDOW_DAYS = 90;
export const GESTION_WARNING_DAYS = 15;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const GESTION_WINDOW_MS = GESTION_WINDOW_DAYS * DAY_MS;

/** Texto de auditoría al pasar el comprador al gestor. */
export const REASIGNACION_COMENTARIO = "Reasignado a Gestor por 90 días sin gestión";

/** RPC de la migración `20261119c_compradores_gestion_agente.sql`. */
export const REASIGNAR_INACTIVOS_RPC = "reasignar_compradores_inactivos";

export type CompradorActorRole = "admin" | "vendedor" | "cliente";

export interface CompradorActor {
  role: CompradorActorRole;
  vendedorId: string | null;
}

export type GestionEvento = "alta" | "edicion" | "comentario" | "oferta";

export type CompradorAccesoValor = "sin_acceso" | "activo";

export interface CompradorFieldInput {
  nombre?: string;
  apellidos?: string;
  email?: string;
  tel?: string;
  tipo?: "Privado" | "Free";
  agente?: string;
  estado?: string;
  intereses?: string;
  presupuesto?: string;
  nda?: "Firmada" | "Pendiente";
  acceso?: CompradorAccesoValor;
  tipoPersona?: "fisica" | "juridica";
  razonSocial?: string;
  documento?: string;
  direccion?: string;
  cp?: string;
  poblacion?: string;
  provincia?: string;
  pais?: string;
}

export interface GestionSnapshot {
  id: string;
  assignedVendedorId: string | null;
  ultimaGestionAgenteAt: string | null;
}

export interface ReasignacionPlanItem {
  compradorId: string;
  comentario: typeof REASIGNACION_COMENTARIO;
  agente: "Admin";
  desasignar: true;
}

export interface PlazoGestion {
  /** Días enteros que faltan, redondeados hacia arriba. 0 si el plazo venció. */
  days: number | null;
  /** Quedan menos de 15 días y el comprador sigue asignado. */
  warning: boolean;
  /** El plazo de 90 días ya se cumplió. */
  due: boolean;
}

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

const FICHA_KEYS = [
  "nombre",
  "apellidos",
  "email",
  "tel",
  "tipo",
  "estado",
  "intereses",
  "presupuesto",
  "nda",
  "razonSocial",
  "documento",
  "direccion",
  "cp",
  "poblacion",
  "provincia",
  "pais",
] as const;

const FICHA_COLUMN: Record<(typeof FICHA_KEYS)[number], string> = {
  nombre: "nombre",
  apellidos: "apellidos",
  email: "email",
  tel: "tel",
  tipo: "tipo",
  estado: "estado",
  intereses: "intereses",
  presupuesto: "presupuesto",
  nda: "nda",
  razonSocial: "razon_social",
  documento: "documento",
  direccion: "direccion",
  cp: "cp",
  poblacion: "poblacion",
  provincia: "provincia",
  pais: "pais",
};

export function canReadComprador(
  actor: CompradorActor,
  assignedVendedorId: string | null,
): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "vendedor":
      return !!actor.vendedorId && actor.vendedorId === assignedVendedorId;
    case "cliente":
      return false;
    default: {
      const unreachable: never = actor.role;
      return unreachable;
    }
  }
}

export function canWriteComprador(
  actor: CompradorActor,
  assignedVendedorId: string | null,
): boolean {
  return canReadComprador(actor, assignedVendedorId);
}

export function canReassignComprador(actor: CompradorActor): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "vendedor":
    case "cliente":
      return false;
    default: {
      const unreachable: never = actor.role;
      return unreachable;
    }
  }
}

export function canDeleteComprador(actor: CompradorActor): boolean {
  return canReassignComprador(actor);
}

/**
 * Alta, edición, comentario u oferta renuevan el plazo solo si las hace
 * el agente asignado. La gestión del admin no reinicia el reloj.
 * La oferta cuenta cuando va ligada a ese comprador.
 */
export function eventoRenuevaGestion(input: {
  evento: GestionEvento;
  actor: CompradorActor;
  assignedVendedorId: string | null;
  compradorId?: string | null;
}): boolean {
  if (input.actor.role !== "vendedor" || !input.actor.vendedorId) return false;
  switch (input.evento) {
    case "alta":
      return true;
    case "edicion":
    case "comentario":
      return input.actor.vendedorId === input.assignedVendedorId;
    case "oferta":
      return !!input.compradorId && input.actor.vendedorId === input.assignedVendedorId;
    default: {
      const unreachable: never = input.evento;
      return unreachable;
    }
  }
}

/** Al cambiar de agente, el nuevo plazo empieza en la asignación. */
export function asignacionReiniciaPlazo(
  previousVendedorId: string | null,
  nextVendedorId: string | null,
): boolean {
  return !!nextVendedorId && previousVendedorId !== nextVendedorId;
}

export function diasRestantesGestion(ultima: Date, now: Date): number {
  const remaining = GESTION_WINDOW_MS - (now.getTime() - ultima.getTime());
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

export function debeReasignar(ultima: Date, now: Date, assigned: boolean): boolean {
  if (!assigned) return false;
  return now.getTime() - ultima.getTime() >= GESTION_WINDOW_MS;
}

/** Aviso cuando falta estrictamente menos de 15 días. */
export function esAvisoGestion(ultima: Date, now: Date, assigned: boolean): boolean {
  if (!assigned) return false;
  const remaining = GESTION_WINDOW_MS - (now.getTime() - ultima.getTime());
  return remaining > 0 && remaining < GESTION_WARNING_DAYS * DAY_MS;
}

export function plazoGestion(
  ultimaIso: string | null | undefined,
  assigned: boolean,
  now: Date = new Date(),
): PlazoGestion {
  if (!assigned || !ultimaIso) return { days: null, warning: false, due: false };
  const ultima = new Date(ultimaIso);
  if (Number.isNaN(ultima.getTime())) return { days: null, warning: false, due: false };
  const due = debeReasignar(ultima, now, true);
  return {
    days: diasRestantesGestion(ultima, now),
    warning: esAvisoGestion(ultima, now, true),
    due,
  };
}

export function etiquetaDiasGestion(days: number | null): string | null {
  if (days == null) return null;
  if (days <= 0) return "Plazo agotado";
  if (days === 1) return "Queda 1 día";
  return `Quedan ${days} días`;
}

export function formatGestionFecha(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function planReasignacion(rows: GestionSnapshot[], now: Date): ReasignacionPlanItem[] {
  const planned: ReasignacionPlanItem[] = [];
  for (const row of rows) {
    if (!row.assignedVendedorId || !row.ultimaGestionAgenteAt) continue;
    const ultima = new Date(row.ultimaGestionAgenteAt);
    if (Number.isNaN(ultima.getTime())) continue;
    if (!debeReasignar(ultima, now, true)) continue;
    planned.push({
      compradorId: row.id,
      comentario: REASIGNACION_COMENTARIO,
      agente: "Admin",
      desasignar: true,
    });
  }
  return planned;
}

export function cronRequestAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}

export interface CreateCompradorPlan {
  nombre: string;
  apellidos: string;
  email: string;
  acceso: CompradorAccesoValor;
  /** El agente queda asignado a sí mismo. El admin asigna después. */
  assignVendedorId: string | null;
  agenteNombre: string;
  renewsGestion: boolean;
}

export function planCompradorCreate(
  actor: CompradorActor,
  input: {
    nombre: string;
    apellidos?: string;
    email: string;
    acceso?: CompradorAccesoValor;
    agente?: string;
  },
  agenteNombre: string,
): Ok<CreateCompradorPlan> | Err {
  switch (actor.role) {
    case "cliente":
      return { ok: false, error: "Acceso denegado" };
    case "vendedor":
      if (!actor.vendedorId) return { ok: false, error: "Vendedor sin ID asignado" };
      break;
    case "admin":
      break;
    default: {
      const unreachable: never = actor.role;
      return unreachable;
    }
  }

  const nombre = input.nombre.trim();
  const apellidos = input.apellidos?.trim() ?? "";
  const email = input.email.trim().toLowerCase();
  if (!nombre || !email) return { ok: false, error: "Nombre y email son obligatorios" };

  if (actor.role === "vendedor") {
    const vendedorId = actor.vendedorId;
    if (!vendedorId) return { ok: false, error: "Vendedor sin ID asignado" };
    return {
      ok: true,
      nombre,
      apellidos,
      email,
      acceso: "sin_acceso",
      assignVendedorId: vendedorId,
      agenteNombre: agenteNombre.trim() || "Agente",
      renewsGestion: true,
    };
  }

  return {
    ok: true,
    nombre,
    apellidos,
    email,
    acceso: input.acceso === "activo" ? "activo" : "sin_acceso",
    assignVendedorId: null,
    agenteNombre: input.agente?.trim() || "Admin",
    renewsGestion: false,
  };
}

export interface UpdateCompradorPlan {
  patch: Record<string, string>;
  renewsGestion: boolean;
}

export function planCompradorUpdate(
  actor: CompradorActor,
  assignedVendedorId: string | null,
  fields: CompradorFieldInput,
): Ok<UpdateCompradorPlan> | Err {
  if (!canWriteComprador(actor, assignedVendedorId)) {
    return {
      ok: false,
      error: actor.role === "vendedor"
        ? "Solo el agente asignado puede editar este comprador"
        : "Acceso denegado",
    };
  }

  if (actor.role === "vendedor" && (fields.acceso != null || fields.agente != null)) {
    return { ok: false, error: "Solo el gestor puede reasignar o cambiar el acceso al portal" };
  }

  const patch: Record<string, string> = {};
  for (const key of FICHA_KEYS) {
    const value = fields[key];
    if (value == null) continue;
    const trimmed = value.trim();
    if ((key === "nombre" || key === "email") && !trimmed) {
      return { ok: false, error: "Nombre y email son obligatorios" };
    }
    const column = FICHA_COLUMN[key];
    patch[column] = key === "email" ? trimmed.toLowerCase() : trimmed;
  }
  if (fields.nombre != null && fields.apellidos != null) {
    patch.ini = inicialesComprador(fields.nombre, fields.apellidos);
  }
  if (fields.tipoPersona != null) {
    switch (fields.tipoPersona) {
      case "fisica":
      case "juridica":
        patch.tipo_persona = fields.tipoPersona;
        break;
      default: {
        const unreachable: never = fields.tipoPersona;
        return { ok: false, error: `Tipo de persona no válido: ${String(unreachable)}` };
      }
    }
  }
  if (actor.role === "admin" && fields.acceso != null) {
    patch.acceso = fields.acceso;
  }
  if (actor.role === "admin" && fields.agente != null) {
    patch.agente = fields.agente.trim();
  }

  const renewsGestion = eventoRenuevaGestion({
    evento: "edicion",
    actor,
    assignedVendedorId,
  }) && Object.keys(patch).length > 0;

  return { ok: true, patch, renewsGestion };
}
