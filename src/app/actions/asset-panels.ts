"use server";

import { fetchAssetsByActivoIdForAdmin } from "@/app/actions/assets";
import { fetchDocumentos, getAssetDocumentosGate } from "@/app/actions/documentos";
import { fetchNotas } from "@/app/actions/notas";
import { actionError, type ActionResult } from "@/lib/action-result";

/** Notas y colaterales de Características en un solo viaje. */
export async function fetchAssetCaracteristicasPanel(
  assetId: string,
  activoId: string | null,
): Promise<ActionResult<{
  notes: Awaited<ReturnType<typeof fetchNotas>>;
  siblings: Awaited<ReturnType<typeof fetchAssetsByActivoIdForAdmin>>;
}>> {
  try {
    const activo = activoId?.trim();
    const [notes, siblings] = await Promise.all([
      fetchNotas({ assetId, scope: "activo" }),
      activo && activo !== "—"
        ? fetchAssetsByActivoIdForAdmin(activo, assetId)
        : Promise.resolve([]),
    ]);
    return { ok: true, notes, siblings };
  } catch (err) {
    return actionError(err, "No se pudo cargar la ficha");
  }
}

/** Puerta de documentación y, si está abierta, los documentos. Una sola llamada. */
export async function fetchAssetDocumentacionPanel(
  assetId: string,
): Promise<ActionResult<{
  gate: Awaited<ReturnType<typeof getAssetDocumentosGate>>;
  docs: Awaited<ReturnType<typeof fetchDocumentos>>;
}>> {
  try {
    const gate = await getAssetDocumentosGate(assetId);
    if (gate.state !== "open") return { ok: true, gate, docs: [] };
    const docs = await fetchDocumentos({ assetId });
    return { ok: true, gate, docs };
  } catch (err) {
    return actionError(err, "No se pudieron cargar los documentos");
  }
}
