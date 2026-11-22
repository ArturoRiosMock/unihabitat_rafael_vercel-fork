import { isPlaceholderMapUrl } from "@/lib/map-default";

/** Hosts permitidos en `images.remotePatterns` de next.config. */
export const PORTAL_IMAGE_HOSTS = [
  "images.unsplash.com",
  "maps.geoapify.com",
  "staticmap.openstreetmap.de",
] as const;

const CARD_WIDTH = 640;
const CARD_HEIGHT = 360;

export interface CardMediaInput {
  map?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** URL de miniatura con tamaño reservado. No usa Leaflet. */
export function cardImageSrc(input: CardMediaInput): string {
  const map = input.map?.trim() ?? "";
  if (map && /^https?:\/\//i.test(map) && !isPlaceholderMapUrl(map)) return map;

  if (typeof input.lat !== "number" || typeof input.lng !== "number") return "";
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return "";
  const lat = input.lat;
  const lng = input.lng;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=${CARD_WIDTH}x${CARD_HEIGHT}&maptype=mapnik`;
}

export function cardImageSize(): { width: number; height: number } {
  return { width: CARD_WIDTH, height: CARD_HEIGHT };
}

export function isOptimizableImageSrc(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return (PORTAL_IMAGE_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}
