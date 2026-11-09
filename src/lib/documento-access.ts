/**
 * Quién puede leer o escribir un documento.
 *
 * Admin: todos los de la ficha.
 * Agente: solo los del activo que tiene asignado en `vendedor_assets`.
 * Comprador: solo las filas con su `comprador_id` (la política SELECT ya existente).
 * No abre documentos de otro activo ni de otro comprador.
 */
export type DocumentoAccessFacts =
  | { role: "admin" }
  | { role: "vendedor"; vendedorId: string | null; assignedAssetIds: readonly string[] }
  | { role: "cliente"; compradorId: string | null };

export interface DocumentoRecord {
  asset_id: string | null;
  comprador_id: string | null;
}

function isAssigned(actor: Extract<DocumentoAccessFacts, { role: "vendedor" }>, assetId: string | null): boolean {
  return !!assetId && !!actor.vendedorId && actor.assignedAssetIds.includes(assetId);
}

export function canListAssetDocumentos(actor: DocumentoAccessFacts, assetId: string): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "vendedor":
      return isAssigned(actor, assetId);
    case "cliente":
      return false;
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function canReadDocumento(actor: DocumentoAccessFacts, doc: DocumentoRecord): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "vendedor":
      return isAssigned(actor, doc.asset_id);
    case "cliente":
      return !!actor.compradorId && doc.comprador_id === actor.compradorId;
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function canWriteDocumento(actor: DocumentoAccessFacts, assetId: string | null): boolean {
  switch (actor.role) {
    case "admin":
      return true;
    case "vendedor":
      return isAssigned(actor, assetId);
    case "cliente":
      return false;
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}
