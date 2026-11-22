"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { clusterMapPoints } from "@/lib/map-cluster";
import type { PortalMapPoint } from "@/lib/portal-listing";

type PortalAssetsMapProps = {
  points: PortalMapPoint[];
  className?: string;
};

/**
 * Mapa del listado. Leaflet entra solo cuando el contenedor es visible
 * (el listado lo monta al pulsar «Mapa»). Los marcadores se agrupan por zoom.
 */
export function PortalAssetsMap({ points, className = "" }: PortalAssetsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(6);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !containerRef.current || points.length === 0) return;
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
        const markers = L.layerGroup().addTo(map);

        const draw = () => {
          markers.clearLayers();
          const currentZoom = map.getZoom();
          setZoom(currentZoom);
          const clusters = clusterMapPoints(points, currentZoom);
          for (const cluster of clusters) {
            const single = cluster.count === 1 ? cluster.items[0] : null;
            const icon = L.divIcon({
              className: "",
              html: single
                ? `<div style="width:14px;height:14px;border-radius:50%;background:#0d2a4a;border:2px solid #c9a84c;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`
                : `<div style="min-width:28px;height:28px;padding:0 6px;border-radius:14px;background:#0d2a4a;color:#fff;border:2px solid #c9a84c;display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui,sans-serif">${cluster.count}</div>`,
              iconSize: single ? [14, 14] : [28, 28],
              iconAnchor: single ? [7, 7] : [14, 14],
            });
            const marker = L.marker([cluster.lat, cluster.lng], { icon }).addTo(markers);
            if (single) {
              marker.bindPopup(
                `<div style="font:12px/1.4 system-ui,sans-serif;min-width:140px">
                  <strong>${escapeHtml(single.title)}</strong><br/>
                  <span style="color:#666">${escapeHtml(single.priceLabel)}: ${escapeHtml(single.priceValue)}</span><br/>
                  <a href="${escapeHtml(single.href)}" target="_blank" rel="noopener noreferrer" style="color:#0d2a4a;font-weight:600">Ver ficha →</a>
                </div>`,
              );
            } else {
              marker.on("click", () => {
                map.setView([cluster.lat, cluster.lng], Math.min(currentZoom + 2, 16));
              });
            }
          }
        };

        const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
        if (points.length === 1) map.setView([points[0].lat, points[0].lng], 12);
        else map.fitBounds(bounds.pad(0.15));
        draw();
        map.on("zoomend", draw);
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
  }, [visible, points]);

  if (points.length === 0) {
    return (
      <div className={`flex h-[480px] flex-col items-center justify-center rounded-xl border border-border bg-white text-center ${className}`}>
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
        {zoom < 13 ? " · agrupados" : ""}
        {" · "}
        <Link href="/portal" className="text-gold hover:underline">
          Ver lista
        </Link>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
