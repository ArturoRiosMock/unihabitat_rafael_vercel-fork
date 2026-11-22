/** Punto mínimo para agrupar marcadores del mapa del portal. */
export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface MapCluster<T extends MapPoint = MapPoint> {
  id: string;
  lat: number;
  lng: number;
  count: number;
  items: T[];
}

/** Tamaño de celda en grados. Zoom alto → celdas pequeñas → menos agrupación. */
export function clusterCellDegrees(zoom: number): number {
  const clamped = Math.min(18, Math.max(2, Math.round(zoom)));
  return 360 / 2 ** clamped;
}

/**
 * Agrupa por cuadrícula. A partir de zoom 13 cada punto va suelto:
 * en ciudad los marcadores dejan de solaparse y el clic abre la ficha.
 */
export function clusterMapPoints<T extends MapPoint>(points: readonly T[], zoom: number): MapCluster<T>[] {
  if (points.length === 0) return [];
  if (zoom >= 13) {
    return points.map((point) => ({
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      count: 1,
      items: [point],
    }));
  }

  const cell = clusterCellDegrees(zoom);
  const groups = new Map<string, T[]>();
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const key = `${Math.floor(point.lng / cell)}:${Math.floor(point.lat / cell)}`;
    const list = groups.get(key);
    if (list) list.push(point);
    else groups.set(key, [point]);
  }

  const clusters: MapCluster<T>[] = [];
  for (const [key, items] of groups) {
    let lat = 0;
    let lng = 0;
    for (const item of items) {
      lat += item.lat;
      lng += item.lng;
    }
    clusters.push({
      id: key,
      lat: lat / items.length,
      lng: lng / items.length,
      count: items.length,
      items,
    });
  }
  return clusters;
}
