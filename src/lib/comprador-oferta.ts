/**
 * Datos del comprador que una oferta necesita para quedar lista para firmar.
 * Vive fuera de los archivos "use server" para poder testearlo y para que
 * Turbopack no reexporte tipos desde una server action.
 *
 * Obligatorios porque identifican al firmante y su domicilio (la oferta del
 * CRM solo guardaba importe y comentario):
 * nombre, apellidos, DNI/NIE/CIF, dirección, CP, población, provincia, país,
 * teléfono y email. Persona jurídica añade la razón social.
 *
 * No entran estado civil ni forma de pago: no se usan en el modelo, en
 * plan.md, en MEJORAS UNIHABITAT.txt ni en el seguimiento del cliente.
 */

export type TipoPersona = "fisica" | "juridica";

export interface DatosFirma {
  nombre: string;
  apellidos: string;
  tipoPersona: TipoPersona;
  razonSocial: string;
  documento: string;
  direccion: string;
  cp: string;
  poblacion: string;
  provincia: string;
  pais: string;
  tel: string;
  email: string;
}

export interface CampoFaltante {
  key: keyof DatosFirma;
  label: string;
}

export const PAIS_DEFECTO = "España";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CP_ES_RE = /^\d{5}$/;
const DNI_RE = /^\d{8}[A-Z]$/;
const NIE_RE = /^[XYZ]\d{7}[A-Z]$/;
const CIF_RE = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/;

export function splitNombreCompleto(full: string): { nombre: string; apellidos: string } {
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (!trimmed) return { nombre: "", apellidos: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { nombre: trimmed, apellidos: "" };
  return {
    nombre: trimmed.slice(0, space),
    apellidos: trimmed.slice(space + 1).trim(),
  };
}

export function nombreCompleto(
  nombre: string | null | undefined,
  apellidos?: string | null,
): string {
  return [nombre, apellidos]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function nombreVisible(input: {
  nombre?: string | null;
  apellidos?: string | null;
}): string {
  return nombreCompleto(input.nombre, input.apellidos);
}

export function inicialesComprador(nombre: string, apellidos: string): string {
  const letters = `${nombre.trim().charAt(0)}${apellidos.trim().charAt(0)}`.toUpperCase();
  return letters || "??";
}

export function normalizarTipoPersona(value: unknown): TipoPersona {
  return value === "juridica" ? "juridica" : "fisica";
}

export function datosFirmaVacios(): DatosFirma {
  return {
    nombre: "",
    apellidos: "",
    tipoPersona: "fisica",
    razonSocial: "",
    documento: "",
    direccion: "",
    cp: "",
    poblacion: "",
    provincia: "",
    pais: PAIS_DEFECTO,
    tel: "",
    email: "",
  };
}

export function normalizarDocumento(value: string): string {
  return value.replace(/[\s.-]/g, "").toUpperCase();
}

export function documentoValido(value: string): boolean {
  const documento = normalizarDocumento(value);
  return DNI_RE.test(documento) || NIE_RE.test(documento) || CIF_RE.test(documento);
}

export function esPaisEspana(pais: string): boolean {
  const value = pais.trim().toLowerCase();
  return value === "españa" || value === "espana" || value === "spain" || value === "es";
}

export function normalizarDatosFirma(datos: DatosFirma): DatosFirma {
  const pais = datos.pais.trim() || PAIS_DEFECTO;
  return {
    nombre: datos.nombre.trim(),
    apellidos: datos.apellidos.trim(),
    tipoPersona: normalizarTipoPersona(datos.tipoPersona),
    razonSocial: datos.razonSocial.trim(),
    documento: normalizarDocumento(datos.documento),
    direccion: datos.direccion.trim(),
    cp: datos.cp.replace(/\s/g, ""),
    poblacion: datos.poblacion.trim(),
    provincia: datos.provincia.trim(),
    pais,
    tel: datos.tel.trim(),
    email: datos.email.trim().toLowerCase(),
  };
}

export function datosFirmaFromComprador(input: {
  nombre?: string | null;
  apellidos?: string | null;
  tipoPersona?: TipoPersona | string | null;
  razonSocial?: string | null;
  documento?: string | null;
  direccion?: string | null;
  cp?: string | null;
  poblacion?: string | null;
  provincia?: string | null;
  pais?: string | null;
  tel?: string | null;
  email?: string | null;
}): DatosFirma {
  return normalizarDatosFirma({
    nombre: input.nombre ?? "",
    apellidos: input.apellidos ?? "",
    tipoPersona: normalizarTipoPersona(input.tipoPersona),
    razonSocial: input.razonSocial ?? "",
    documento: input.documento ?? "",
    direccion: input.direccion ?? "",
    cp: input.cp ?? "",
    poblacion: input.poblacion ?? "",
    provincia: input.provincia ?? "",
    pais: input.pais ?? "",
    tel: input.tel ?? "",
    email: input.email ?? "",
  });
}

function texto(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function datosFirmaFromRow(row: Record<string, unknown>): DatosFirma {
  return datosFirmaFromComprador({
    nombre: texto(row.nombre),
    apellidos: texto(row.apellidos),
    tipoPersona: texto(row.tipo_persona),
    razonSocial: texto(row.razon_social),
    documento: texto(row.documento),
    direccion: texto(row.direccion),
    cp: texto(row.cp),
    poblacion: texto(row.poblacion),
    provincia: texto(row.provincia),
    pais: texto(row.pais),
    tel: texto(row.tel),
    email: texto(row.email),
  });
}

export function mergeDatosFirma(
  stored: DatosFirma,
  incoming?: Partial<DatosFirma> | null,
): DatosFirma {
  if (!incoming) return normalizarDatosFirma(stored);
  const next: DatosFirma = { ...stored };
  const keys = Object.keys(stored) as (keyof DatosFirma)[];
  for (const key of keys) {
    const value = incoming[key];
    if (value == null) continue;
    if (key === "tipoPersona") {
      next.tipoPersona = normalizarTipoPersona(value);
      continue;
    }
    next[key] = String(value);
  }
  return normalizarDatosFirma(next);
}

export function etiquetaCampoFirma(datos: DatosFirma, key: keyof DatosFirma): string {
  switch (key) {
    case "nombre":
      return datos.tipoPersona === "juridica" ? "Nombre del firmante" : "Nombre";
    case "apellidos":
      return datos.tipoPersona === "juridica" ? "Apellidos del firmante" : "Apellidos";
    case "tipoPersona":
      return "Tipo de persona";
    case "razonSocial":
      return "Razón social";
    case "documento":
      return "DNI/NIE/CIF";
    case "direccion":
      return "Dirección";
    case "cp":
      return "Código postal";
    case "poblacion":
      return "Población";
    case "provincia":
      return "Provincia";
    case "pais":
      return "País";
    case "tel":
      return "Teléfono";
    case "email":
      return "Email";
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

function telefonoValido(tel: string): boolean {
  const digits = tel.replace(/\D/g, "");
  const local = digits.startsWith("34") && digits.length > 9 ? digits.slice(2) : digits;
  return local.length >= 9;
}

export function camposFaltantesFirma(input: DatosFirma): CampoFaltante[] {
  const datos = normalizarDatosFirma(input);
  const faltan: CampoFaltante[] = [];
  const push = (key: keyof DatosFirma) => {
    faltan.push({ key, label: etiquetaCampoFirma(datos, key) });
  };

  if (!datos.nombre) push("nombre");
  if (!datos.apellidos) push("apellidos");
  switch (datos.tipoPersona) {
    case "fisica":
      break;
    case "juridica":
      if (!datos.razonSocial) push("razonSocial");
      break;
    default: {
      const unreachable: never = datos.tipoPersona;
      return unreachable;
    }
  }
  if (!documentoValido(datos.documento)) push("documento");
  if (!datos.direccion) push("direccion");
  if (!datos.cp || (esPaisEspana(datos.pais) && !CP_ES_RE.test(datos.cp))) push("cp");
  if (!datos.poblacion) push("poblacion");
  if (!datos.provincia) push("provincia");
  if (!datos.pais) push("pais");
  if (!telefonoValido(datos.tel)) push("tel");
  if (!EMAIL_RE.test(datos.email)) push("email");
  return faltan;
}

export function datosFirmaCompletos(datos: DatosFirma): boolean {
  return camposFaltantesFirma(datos).length === 0;
}

export function etiquetaDatosFirma(datos: DatosFirma): string {
  const faltan = camposFaltantesFirma(datos);
  if (faltan.length === 0) return "Datos completos";
  return `Faltan: ${faltan.map((campo) => campo.label).join(", ")}`;
}

export type FirmaResult =
  | { ok: true; datos: DatosFirma }
  | { ok: false; error: string; faltan: string[] };

export function validarDatosFirma(input: DatosFirma): FirmaResult {
  const datos = normalizarDatosFirma(input);
  const faltan = camposFaltantesFirma(datos).map((campo) => campo.label);
  if (faltan.length === 0) return { ok: true, datos };
  return {
    ok: false,
    faltan,
    error: `Faltan datos para firmar la oferta: ${faltan.join(", ")}`,
  };
}

/** Columnas de identidad que cambiaron. No toca acceso, agente ni NDA. */
export function patchDatosFirma(stored: DatosFirma, nextInput: DatosFirma): Record<string, string> {
  const next = normalizarDatosFirma(nextInput);
  const base = normalizarDatosFirma(stored);
  const patch: Record<string, string> = {};
  if (next.nombre !== base.nombre) patch.nombre = next.nombre;
  if (next.apellidos !== base.apellidos) patch.apellidos = next.apellidos;
  if (next.nombre !== base.nombre || next.apellidos !== base.apellidos) {
    patch.ini = inicialesComprador(next.nombre, next.apellidos);
  }
  if (next.tipoPersona !== base.tipoPersona) patch.tipo_persona = next.tipoPersona;
  if (next.razonSocial !== base.razonSocial) patch.razon_social = next.razonSocial;
  if (next.documento !== base.documento) patch.documento = next.documento;
  if (next.direccion !== base.direccion) patch.direccion = next.direccion;
  if (next.cp !== base.cp) patch.cp = next.cp;
  if (next.poblacion !== base.poblacion) patch.poblacion = next.poblacion;
  if (next.provincia !== base.provincia) patch.provincia = next.provincia;
  if (next.pais !== base.pais) patch.pais = next.pais;
  if (next.tel !== base.tel) patch.tel = next.tel;
  if (next.email !== base.email) patch.email = next.email;
  return patch;
}
