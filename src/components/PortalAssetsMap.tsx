"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Asset } from "@/lib/types";
import { getPortalPriceDisplay, shortAddr } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";

type PortalAssetsMapProps = {
  assets: Asset[];
  className?: string;
};

/**
 * Mapa del listado portal: un marker por activo con coordenadas.
 * Usa Leaflet existente (sin plugin cluster).
 */
export function PortalAssetsMap({ assets, className = "" }: PortalAssetsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const points = assets
    .map((a) => {
      const lat = typeof a.lat === "number" ? a.lat : Number(a.lat);
      const lng = typeof a.lng === "number" ? a.lng : Number(a.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { asset: a, lat, lng };
    })
    .filter((p): p is { asset: Asset; lat: number; lng: number } => p != null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) {
      setReady(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !containerRef.current) return;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const map = L.map(containerRef.current, { scrollWheelZoom: true });
        mapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#0d2a4a;border:2px solid #c9a84c;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const bounds = L.latLngBounds([]);
        for (const p of points) {
          const price = getPortalPriceDisplay(p.asset);
          const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
          marker.bindPopup(
            `<div style="font:12px/1.4 system-ui,sans-serif;min-width:140px">
              <strong>${escapeHtml(shortAddr(p.asset) || p.asset.pob || p.asset.id)}</strong><br/>
              <span style="color:#666">${escapeHtml(price.label)}: ${escapeHtml(price.value)}</span><br/>
              <a href="${assetPortalHref(p.asset)}" target="_blank" rel="noopener noreferrer" title="Se abre en una pestaña nueva" style="color:#0d2a4a;font-weight:600">Ver ficha →</a>
            </div>`,
          );
          bounds.extend([p.lat, p.lng]);
        }

        if (points.length === 1) {
          map.setView([points[0].lat, points[0].lng], 12);
        } else {
          map.fitBounds(bounds.pad(0.15));
        }

        setReady(true);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // points identity via ids+coords
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.map((p) => `${p.asset.id}:${p.lat},${p.lng}`).join("|")]);

  if (points.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border border-border bg-white py-16 text-center ${className}`}>
        <MapPin size={32} className="text-border" />
        <p className="mt-3 text-sm font-medium text-navy">Sin coordenadas en estos resultados</p>
        <p className="mt-1 text-xs text-muted">Prueba la vista lista o ajusta los filtros</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-white ${className}`}>
      <div ref={containerRef} className="h-[480px] w-full" />
      {(!ready || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream2/80 text-xs text-muted">
          {error ? "No se pudo cargar el mapa" : "Cargando mapa…"}
        </div>
      )}
      <div className="border-t border-border px-3 py-2 text-[11px] text-muted">
        {points.length} activo{points.length === 1 ? "" : "s"} en mapa
        {" · "}
        <Link href="/portal" className="text-gold hover:underline">
          Ver lista
        </Link>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
