/**
 * Quién puede leer o escribir un documento.
 *
 * Admin: todos los de la ficha, sin NDA.
 * Agente: solo los del activo asignado en `vendedor_assets`, y solo si
 * aceptó el NDA de ese activo. El NDA de A no abre B.
 * Comprador: solo activos invitados en `comprador_assets`. Sin invitación
 * no hay NDA ni documentos. Con invitación, las filas de su `comprador_id`
 * exigen además el NDA de ese activo.
 * No abre documentos de otro activo ni de otro comprador.
 */
export type DocumentoAccessDecision = "ok" | "nda" | "denied";

export type DocumentoAccessFacts =
  | { role: "admin" }
  | {
      role: "vendedor";
      vendedorId: string | null;
      assignedAssetIds: readonly string[];
      acceptedNdaAssetIds: readonly string[];
    }
  | {
      role: "cliente";
      compradorId: string | null;
      acceptedNdaAssetIds: readonly string[];
      invitedAssetIds: readonly string[];
    };

export interface DocumentoRecord {
  asset_id: string | null;
  comprador_id: string | null;
}

function isAssigned(actor: Extract<DocumentoAccessFacts, { role: "vendedor" }>, assetId: string | null): boolean {
  return !!assetId && !!actor.vendedorId && actor.assignedAssetIds.includes(assetId);
}

function hasAssetNda(acceptedNdaAssetIds: readonly string[], assetId: string): boolean {
  return acceptedNdaAssetIds.includes(assetId);
}

function isInvited(actor: Extract<DocumentoAccessFacts, { role: "cliente" }>, assetId: string | null): boolean {
  return !!assetId && !!actor.compradorId && actor.invitedAssetIds.includes(assetId);
}

/** Abrir la lista de documentación de un activo: asignación (si aplica) y NDA. */
export function listAssetDocumentosDecision(actor: DocumentoAccessFacts, assetId: string): DocumentoAccessDecision {
  switch (actor.role) {
    case "admin":
      return "ok";
    case "vendedor":
      if (!isAssigned(actor, assetId)) return "denied";
      if (!hasAssetNda(actor.acceptedNdaAssetIds, assetId)) return "nda";
      return "ok";
    case "cliente":
      if (!isInvited(actor, assetId)) return "denied";
      if (!hasAssetNda(actor.acceptedNdaAssetIds, assetId)) return "nda";
      return "ok";
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function readDocumentoDecision(actor: DocumentoAccessFacts, doc: DocumentoRecord): DocumentoAccessDecision {
  switch (actor.role) {
    case "admin":
      return "ok";
    case "vendedor":
      if (!isAssigned(actor, doc.asset_id)) return "denied";
      if (!doc.asset_id || !hasAssetNda(actor.acceptedNdaAssetIds, doc.asset_id)) return "nda";
      return "ok";
    case "cliente":
      if (!actor.compradorId || doc.comprador_id !== actor.compradorId) return "denied";
      if (!doc.asset_id) return "ok";
      if (!isInvited(actor, doc.asset_id)) return "denied";
      if (!hasAssetNda(actor.acceptedNdaAssetIds, doc.asset_id)) return "nda";
      return "ok";
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function canListAssetDocumentos(actor: DocumentoAccessFacts, assetId: string): boolean {
  switch (actor.role) {
    case "admin":
    case "vendedor":
      return listAssetDocumentosDecision(actor, assetId) === "ok";
    case "cliente":
      return false;
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function canReadDocumento(actor: DocumentoAccessFacts, doc: DocumentoRecord): boolean {
  return readDocumentoDecision(actor, doc) === "ok";
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
