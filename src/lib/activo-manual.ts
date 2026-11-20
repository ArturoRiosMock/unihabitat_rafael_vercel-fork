/**
 * Alta manual de un activo. Vive fuera de las server actions para poder
 * validarla sin Supabase y sin reexportar tipos desde un archivo "use server".
 */

import { isPlausibleCadastralRef, normalizeCadastralRef } from "@/lib/catastro/dnp";
import { FASE_INTERNA_OPTIONS, faseToCode } from "@/lib/fase-interna";

export interface AltaActivoInput {
  referencia: string;
  tipo: string;
  direccion: string;
  municipio: string;
  provincia: string;
  cp?: string;
  superficie?: number | null;
  precio?: number | null;
  descripcion?: string;
  situacion?: string;
  deuda?: number | null;
  proceso?: string;
  propietario?: string;
  contacto?: string;
  telefono?: string;
  mail?: string;
  /** true publica el activo. Por defecto queda en borrador. */
  activar?: boolean;
}

export interface AltaActivoNormalizada {
  id: string;
  referencia: string;
  tipo: string;
  direccion: string;
  municipio: string;
  provincia: string;
  cp: string;
  superficie: number | null;
  precio: number | null;
  descripcion: string;
  situacion: string;
  faseCodigo: string;
  deuda: number | null;
  proceso: string;
  propietario: string;
  contacto: string;
  telefono: string;
  mail: string;
  publicado: boolean;
}

export interface PrecargaCatastro {
  direccion: string;
  municipio: string;
  provincia: string;
  cp: string;
  superficie: number | null;
  tipo: string;
  descripcion: string;
}

const MENSAJE_DUPLICADO = "Ya existe un activo con esta referencia";

export function mensajeReferenciaDuplicada(): string {
  return MENSAJE_DUPLICADO;
}

/** Referencia catastral sin espacios. Si tiene forma de catastro, se normaliza. */
export function normalizarReferenciaActivo(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (isPlausibleCadastralRef(trimmed)) return normalizeCadastralRef(trimmed);
  return trimmed.toUpperCase();
}

function texto(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

function vacio(raw: string | undefined): string {
  const value = texto(raw);
  return value || "—";
}

function numeroOpcional(
  value: number | null | undefined,
  etiqueta: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${etiqueta} no es válido` };
  }
  return { ok: true, value };
}

function esSituacion(value: string): boolean {
  return (FASE_INTERNA_OPTIONS as readonly string[]).includes(value);
}

export function validarAltaActivo(
  input: AltaActivoInput,
): { ok: true; activo: AltaActivoNormalizada } | { ok: false; error: string } {
  const referencia = normalizarReferenciaActivo(input.referencia);
  if (!referencia) return { ok: false, error: "La referencia catastral es obligatoria" };
  const tipo = texto(input.tipo);
  if (!tipo) return { ok: false, error: "El tipo es obligatorio" };
  const direccion = texto(input.direccion);
  if (!direccion) return { ok: false, error: "La dirección es obligatoria" };
  const municipio = texto(input.municipio);
  if (!municipio) return { ok: false, error: "El municipio es obligatorio" };
  const provincia = texto(input.provincia);
  if (!provincia) return { ok: false, error: "La provincia es obligatoria" };

  const superficie = numeroOpcional(input.superficie, "La superficie");
  if (!superficie.ok) return superficie;
  const precio = numeroOpcional(input.precio, "El precio");
  if (!precio.ok) return precio;
  const deuda = numeroOpcional(input.deuda, "La deuda");
  if (!deuda.ok) return deuda;

  const situacion = texto(input.situacion);
  if (situacion && !esSituacion(situacion)) {
    return { ok: false, error: "La situación no es válida" };
  }

  const cp = (input.cp ?? "").trim();
  if (cp && !/^\d{5}$/.test(cp)) {
    return { ok: false, error: "El código postal no es válido" };
  }

  return {
    ok: true,
    activo: {
      id: referencia,
      referencia,
      tipo,
      direccion,
      municipio,
      provincia,
      cp,
      superficie: superficie.value,
      precio: precio.value,
      descripcion: texto(input.descripcion),
      situacion: situacion || "—",
      faseCodigo: situacion ? faseToCode(situacion) : "fp-nd",
      deuda: deuda.value,
      proceso: vacio(input.proceso),
      propietario: vacio(input.propietario),
      contacto: vacio(input.contacto),
      telefono: vacio(input.telefono),
      mail: vacio(input.mail),
      publicado: input.activar === true,
    },
  };
}

/** true si el id o la referencia limpia ya están en otro activo. */
export function referenciaDuplicada(
  existentes: Array<{ id: string; referencia: string }>,
  referencia: string,
): boolean {
  const clave = normalizarReferenciaActivo(referencia);
  if (!clave) return false;
  return existentes.some((row) => {
    const id = normalizarReferenciaActivo(row.id);
    const ref = normalizarReferenciaActivo(row.referencia);
    return id === clave || ref === clave;
  });
}

function campoVisible(value: string | undefined): string {
  const limpio = (value ?? "").trim();
  if (!limpio || limpio === "—") return "";
  return limpio;
}

/** Lo que el formulario rellena tras consultar el catastro. No guarda nada. */
export function precargaDesdeCatastro(partial: {
  fullAddr?: string;
  addr?: string;
  pob?: string;
  prov?: string;
  cp?: string;
  sqm?: number | null;
  uso?: string;
  tip?: string;
  desc?: string;
}): PrecargaCatastro {
  const superficie = partial.sqm;
  return {
    direccion: campoVisible(partial.fullAddr) || campoVisible(partial.addr),
    municipio: campoVisible(partial.pob),
    provincia: campoVisible(partial.prov),
    cp: campoVisible(partial.cp),
    superficie: typeof superficie === "number" && Number.isFinite(superficie) ? superficie : null,
    tipo: campoVisible(partial.uso) || campoVisible(partial.tip),
    descripcion: campoVisible(partial.desc),
  };
}
