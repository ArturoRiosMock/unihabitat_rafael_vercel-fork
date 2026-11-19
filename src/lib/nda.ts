/**
 * NDA por activo para ver y descargar su documentación.
 * El texto es provisional: cambia `ASSET_NDA_VERSION` y `buildAssetNdaText`
 * cuando UniHabitat entregue el clausulado legal. Una aceptación antigua
 * no cubre una versión nueva.
 */

export const ASSET_NDA_VERSION = "2026-11-19-provisional";

export const NDA_NOT_ACCEPTED = "NDA no aceptado";

export const ASSET_NDA_PROVISIONAL_NOTICE =
  "Texto provisional. No es el clausulado legal definitivo de UniHabitat. Se sustituye cambiando la versión en el código; la aceptación queda ligada a la versión mostrada.";

export interface AssetNdaLabelInput {
  id: string;
  referencia?: string | null;
  pob?: string | null;
  addr?: string | null;
}

export type AssetDocumentosGate =
  | { state: "open" }
  | { state: "denied" }
  | { state: "nda"; version: string; text: string; assetLabel: string };

export interface AssetNdaSignerRow {
  nombreFirma: string;
  acceptedAt: string;
  version: string;
}

function present(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text || text === "—") return "";
  return text;
}

/** Nombre y referencia que se intercalan en el texto del NDA. */
export function assetNdaLabel(asset: AssetNdaLabelInput): string {
  const ref = present(asset.referencia) || asset.id;
  const place = [present(asset.pob), present(asset.addr)].filter(Boolean).join(", ");
  return place ? `${place} (ref. ${ref})` : ref;
}

/**
 * Texto de confidencialidad en español (España), marcado como provisional.
 * Incluye el activo concreto: aceptar este texto no cubre otro activo.
 */
export function buildAssetNdaText(assetLabel: string): string {
  return [
    "ACUERDO DE CONFIDENCIALIDAD (NDA) — TEXTO PROVISIONAL",
    "",
    ASSET_NDA_PROVISIONAL_NOTICE,
    "",
    `Activo: ${assetLabel}`,
    "",
    "1. Objeto. Quien firma se compromete a guardar secreto y a no revelar a terceros la documentación y los datos económicos, jurídicos, catastrales o de cualquier otra índole de este activo, a los que acceda a través de la plataforma.",
    "",
    "2. Uso permitido. La información se usará solo para valorar una posible operación sobre este activo. No autoriza a usarla sobre otros activos, ni a copiarla, cederla o publicarla.",
    "",
    "3. Alcance. La aceptación vale únicamente para el activo identificado arriba. No da acceso a la documentación de ningún otro activo.",
    "",
    "4. Duración. El deber de confidencialidad se mantiene mientras la información no sea pública por una causa ajena a quien firma.",
    "",
    "5. Legislación. El incumplimiento puede reclamarse conforme a la legislación española.",
    "",
    `Versión del texto: ${ASSET_NDA_VERSION}.`,
  ].join("\n");
}

/** Nombre completo escrito a mano como firma. Exige la casilla de aceptación. */
export function assertNdaSignature(nombre: string, accepted: boolean): string {
  if (!accepted) throw new Error("Marca que has leído y aceptas el NDA");
  const name = nombre.trim().replace(/\s+/g, " ");
  const parts = name.split(" ").filter(Boolean);
  if (parts.length < 2 || name.length < 5) {
    throw new Error("Escribe tu nombre completo");
  }
  return name;
}
