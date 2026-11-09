import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined): string {
  return n ? n.toLocaleString("es-ES") + " €" : "—";
}

/* ------------------------------------------------------------------ */
/*  Accessors al modelo Asset (inmueble) ↔ Propiedad                  */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssetLike = { propiedades?: any[] };

/** Categoría representativa del inmueble (primera propiedad). */
export function getCategoria(a: AssetLike): string {
  return a.propiedades?.[0]?.categoria ?? "—";
}
/** Fase interna representativa (primera propiedad). */
export function getFaseInterna(a: AssetLike): string {
  return a.propiedades?.[0]?.faseInterna ?? "—";
}

/**
 * Situación visible en la ficha. Es la fase interna de la primera propiedad
 * (`propiedades.fase_interna`): columna Excel «Fase Interna» (alias «Situación»)
 * y columna «Situación» del export. Vacío, espacios o guion → "—".
 */
export function displaySituacion(a: AssetLike): string {
  const raw = getFaseInterna(a).trim();
  if (!raw || raw === "—" || raw === "-" || raw === "–") return "—";
  return raw;
}
/** Código de fase (para badges). */
export function getFaseC(a: AssetLike): string {
  return a.propiedades?.[0]?.faseC ?? "fp-nd";
}
/** Propietario del préstamo (primera propiedad). */
export function getPropietario(a: AssetLike): string {
  return a.propiedades?.[0]?.propietario ?? "—";
}
/** Teléfono del propietario. */
export function getOwnerTel(a: AssetLike): string {
  return a.propiedades?.[0]?.telefono ?? "—";
}
/** Email del propietario. */
export function getOwnerMail(a: AssetLike): string {
  return a.propiedades?.[0]?.mail ?? "—";
}
/** Deuda total (suma de todas las propiedades). */
export function getDeudaTotal(a: AssetLike): number | null {
  if (!a.propiedades || a.propiedades.length === 0) return null;
  let total = 0;
  let any = false;
  for (const p of a.propiedades) {
    if (p.deuda != null) { total += Number(p.deuda); any = true; }
  }
  return any ? total : null;
}

/** Proceso representativo del inmueble (primera propiedad con valor). */
export function getProceso(a: AssetLike): string {
  const p = a.propiedades?.find((x) => x.proceso && x.proceso !== "—");
  return p?.proceso ?? a.propiedades?.[0]?.proceso ?? "—";
}

/** Precio/Deuda para portal: NPL → Deuda; CDR → Precio o “Haz tu Oferta”. */
export function getPortalPriceDisplay(a: AssetLike & { precio?: number | null }): {
  label: string;
  value: string;
  kind: "deuda" | "precio" | "oferta";
} {
  const cat = getCategoria(a).toUpperCase();
  if (cat === "NPL") {
    const deuda = getDeudaTotal(a);
    return {
      label: "Deuda",
      value: deuda != null && deuda > 0 ? fmt(deuda) : "—",
      kind: "deuda",
    };
  }
  if (a.precio != null && a.precio > 0) {
    return { label: "Precio", value: fmt(a.precio), kind: "precio" };
  }
  return { label: "Precio", value: "Haz tu Oferta", kind: "oferta" };
}
/** ID del activo (préstamo) — todas las propiedades comparten activoId. */
export function getActivoId(a: AssetLike): string {
  return a.propiedades?.[0]?.activoId ?? "";
}

/** Parsea texto de importe (es-ES: miles con punto, decimales con coma). */
export function parseLocaleMoneyInput(s: string): number | null {
  const t = s
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const parts = t.split(".");
  if (parts.length > 2) {
    const n = parseFloat(t.replace(/\./g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (parts.length === 2 && parts[1].length === 3) {
    if (parts[0] === "0") {
      const n0 = parseFloat(t);
      return Number.isFinite(n0) ? n0 : null;
    }
    const n = parseFloat(parts[0] + parts[1]);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function fmtM(n: number | null): string {
  return n ? n + " m²" : "—";
}

export function shortAddr(a: { nvia?: string; pob?: string; prov?: string }): string {
  const via = a.nvia && a.nvia !== "—" ? a.nvia : "";
  return [via, a.pob, a.prov].filter(Boolean).join(", ") || a.pob || a.prov || "";
}

/**
 * Reconstruye la dirección completa a partir de los campos estructurados
 * (tvia/nvia/num/cp/pob/prov). Sirve para evitar el `fullAddr` crudo del Excel,
 * que viene inconsistente entre proveedores. Cae a `fullAddr` solo si no hay
 * datos estructurados utilizables.
 */
export function formatFullAddress(a: {
  tvia?: string; nvia?: string; num?: string;
  cp?: string; pob?: string; prov?: string;
  fullAddr?: string;
}): string {
  const clean = (v?: string) => (v && v !== "—" ? v.trim() : "");
  const via = [clean(a.tvia), clean(a.nvia), clean(a.num)].filter(Boolean).join(" ").trim();
  const local = [clean(a.cp), clean(a.pob)].filter(Boolean).join(" ").trim();
  const composed = [via, local, clean(a.prov)].filter(Boolean).join(", ");
  return composed || clean(a.fullAddr) || "";
}

/** Dirección para listados: compuesta (Catastro) o, en su defecto, addr del Excel. */
export function displayAssetAddress(a: {
  addr?: string;
  fullAddr?: string;
  tvia?: string;
  nvia?: string;
  num?: string;
  cp?: string;
  pob?: string;
  prov?: string;
}): string {
  const formatted = formatFullAddress(a);
  if (formatted) return formatted;
  const addr = (a.addr ?? "").trim();
  if (addr && addr !== "—") return addr;
  const full = (a.fullAddr ?? "").trim();
  if (full && full !== "—") return full;
  return "—";
}

/**
 * Devuelve la descripción del activo. Si `desc` está vacío o es una copia
 * del endereço (problema histórico de la importación Excel, donde algunos
 * paths hacían `desc: fullAddr`), genera un texto descriptivo a partir de
 * tipo/lugar/superficie/categoría.
 */
export function getDescriptionText(a: {
  desc?: string; addr?: string; fullAddr?: string;
  bien?: string; tip?: string;
  pob?: string; prov?: string;
  supC?: string; sqm?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  propiedades?: any[];
}): string {
  const desc = (a.desc || "").trim();
  const isEmpty = !desc || desc === "—";
  const isAddrCopy = Boolean(desc) && (desc === a.fullAddr || desc === a.addr);
  if (isEmpty || isAddrCopy) {
    const tipo = a.bien && a.bien !== "—" ? a.bien : (a.tip || "Inmueble");
    const lugar = [a.pob, a.prov].filter(v => v && v !== "—").join(", ");
    const sup = a.supC && a.supC !== "—" ? a.supC : (a.sqm ? `${a.sqm} m²` : "");
    return [
      `${tipo}${lugar ? ` ubicado en ${lugar}` : ""}.`,
      sup ? `Superficie de ${sup}.` : "",
      a.propiedades?.[0]?.categoria ? `Categoría ${a.propiedades[0].categoria}.` : "",
    ].filter(Boolean).join(" ");
  }
  return desc;
}
