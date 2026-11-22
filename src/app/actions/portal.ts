"use server";

import { getServerSession } from "@/lib/auth-server";
import { actionError, type ActionResult } from "@/lib/action-result";
import { loadPortalListing, loadPortalMapPoints } from "@/lib/portal-listing-server";
import {
  parsePortalSearchParams,
  type PortalFilterOptions,
  type PortalListingPage,
  type PortalMapPoint,
} from "@/lib/portal-listing";

async function viewer() {
  const session = await getServerSession();
  const staff = session?.role === "admin" || session?.role === "vendedor";
  return { staff, role: session?.role ?? null };
}

/** Listado del portal para cambios de filtro sin recargar el documento. */
export async function fetchPortalListing(
  raw: Record<string, string | undefined>,
): Promise<ActionResult<{ listing: PortalListingPage }>> {
  try {
    const viewerState = await viewer();
    const listing = await loadPortalListing({
      query: parsePortalSearchParams(raw),
      staff: viewerState.staff,
      role: viewerState.role,
    });
    if (listing.error) return { ok: false, error: listing.error };
    return { ok: true, listing };
  } catch (err) {
    return actionError(err, "No se pudieron cargar las propiedades");
  }
}

export async function fetchPortalFilterOptions(
  raw: Record<string, string | undefined>,
): Promise<ActionResult<{ options: PortalFilterOptions }>> {
  try {
    const viewerState = await viewer();
    const listing = await loadPortalListing({
      query: parsePortalSearchParams(raw),
      staff: viewerState.staff,
      role: viewerState.role,
    });
    if (listing.error) return { ok: false, error: listing.error };
    return { ok: true, options: listing.options };
  } catch (err) {
    return actionError(err, "No se pudieron cargar los filtros");
  }
}

/** Marcadores ligeros del mapa. No viaja con el HTML del listado. */
export async function fetchPortalMapPoints(
  raw: Record<string, string | undefined>,
): Promise<ActionResult<{ points: PortalMapPoint[] }>> {
  try {
    const viewerState = await viewer();
    const points = await loadPortalMapPoints({
      query: parsePortalSearchParams(raw),
      staff: viewerState.staff,
      role: viewerState.role,
    });
    return { ok: true, points };
  } catch (err) {
    return actionError(err, "No se pudo cargar el mapa");
  }
}
