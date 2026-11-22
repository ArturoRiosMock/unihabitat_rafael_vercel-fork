import { MapPin } from "lucide-react";
import { cardImageSize, cardImageSrc } from "@/lib/portal-card-media";

/** Altura fija de la foto de la tarjeta. El texto de debajo reserva el mismo bloque. */
export const PORTAL_CARD_MEDIA_CLASS = "relative h-[180px] w-full overflow-hidden bg-cream2";
export const PORTAL_CARD_BODY_CLASS = "flex h-[148px] flex-col p-4";

export function PortalCardMedia({
  map,
  lat,
  lng,
  alt,
}: {
  map?: string | null;
  lat?: number | null;
  lng?: number | null;
  alt: string;
}) {
  const src = cardImageSrc({ map, lat, lng });
  const size = cardImageSize();
  return (
    <div className={PORTAL_CARD_MEDIA_CLASS} style={{ aspectRatio: "16 / 10" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={size.width}
          height={size.height}
          className="h-[180px] w-full object-cover"
        />
      ) : (
        <div className="flex h-[180px] w-full flex-col items-center justify-center gap-1.5 text-muted/40">
          <MapPin size={28} strokeWidth={1.5} />
          <span className="text-[10px] font-medium uppercase tracking-wide">Sin ubicación</span>
        </div>
      )}
    </div>
  );
}

export function PortalCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" aria-hidden>
      <div className="h-[180px] w-full animate-pulse bg-cream2" style={{ aspectRatio: "16 / 10" }} />
      <div className="h-[148px] space-y-3 p-4">
        <div className="h-3 w-3/4 max-w-[200px] animate-pulse rounded bg-cream2" />
        <div className="h-4 w-full animate-pulse rounded bg-cream2" />
        <div className="flex gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-cream2" />
          <div className="h-3 w-20 animate-pulse rounded bg-cream2" />
        </div>
        <div className="mt-auto flex items-end justify-between border-t border-border/50 pt-3">
          <div className="h-6 w-24 animate-pulse rounded bg-cream2" />
          <div className="h-3 w-14 animate-pulse rounded bg-cream2" />
        </div>
      </div>
    </div>
  );
}
