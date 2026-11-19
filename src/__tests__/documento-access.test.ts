import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canListAssetDocumentos,
  canReadDocumento,
  canWriteDocumento,
  listAssetDocumentosDecision,
  readDocumentoDecision,
  type DocumentoAccessFacts,
} from "@/lib/documento-access";

const admin: DocumentoAccessFacts = { role: "admin" };
const agente: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: ["TEST-DOC-001"],
  acceptedNdaAssetIds: ["TEST-DOC-001"],
};
const agenteSinNda: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: ["TEST-DOC-001", "ACTIVO-B"],
  acceptedNdaAssetIds: [],
};
const agenteSoloA: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: ["TEST-DOC-001", "ACTIVO-B"],
  acceptedNdaAssetIds: ["TEST-DOC-001"],
};
const otroAgente: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-2",
  assignedAssetIds: ["OTRO"],
  acceptedNdaAssetIds: ["OTRO"],
};
const sinAsignar: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: [],
  acceptedNdaAssetIds: ["TEST-DOC-001"],
};
const comprador: DocumentoAccessFacts = {
  role: "cliente",
  compradorId: "comp-1",
  acceptedNdaAssetIds: ["TEST-DOC-001"],
  invitedAssetIds: ["TEST-DOC-001", "ACTIVO-B"],
};
const compradorSinNda: DocumentoAccessFacts = {
  role: "cliente",
  compradorId: "comp-1",
  acceptedNdaAssetIds: [],
  invitedAssetIds: ["TEST-DOC-001"],
};
const compradorSinInvitar: DocumentoAccessFacts = {
  role: "cliente",
  compradorId: "comp-1",
  acceptedNdaAssetIds: [],
  invitedAssetIds: [],
};

const notaSimple = { asset_id: "TEST-DOC-001", comprador_id: null };
const activoB = { asset_id: "ACTIVO-B", comprador_id: null };
const ajeno = { asset_id: "OTRO", comprador_id: null };
const delComprador = { asset_id: "TEST-DOC-001", comprador_id: "comp-1" };
const delCompradorB = { asset_id: "ACTIVO-B", comprador_id: "comp-1" };
const deOtroComprador = { asset_id: "TEST-DOC-001", comprador_id: "comp-2" };
const personal = { asset_id: null, comprador_id: "comp-1" };

describe("acceso a documentos", () => {
  it("el admin lee y escribe cualquier documento", () => {
    expect(canListAssetDocumentos(admin, "TEST-DOC-001")).toBe(true);
    expect(canListAssetDocumentos(admin, "OTRO")).toBe(true);
    expect(canReadDocumento(admin, notaSimple)).toBe(true);
    expect(canReadDocumento(admin, ajeno)).toBe(true);
    expect(canWriteDocumento(admin, "TEST-DOC-001")).toBe(true);
    expect(canWriteDocumento(admin, null)).toBe(true);
  });

  it("el agente asignado lee y escribe solo su activo", () => {
    expect(canListAssetDocumentos(agente, "TEST-DOC-001")).toBe(true);
    expect(canReadDocumento(agente, notaSimple)).toBe(true);
    expect(canWriteDocumento(agente, "TEST-DOC-001")).toBe(true);
  });

  it("el agente no abre documentos de un activo que no tiene asignado", () => {
    expect(canListAssetDocumentos(agente, "OTRO")).toBe(false);
    expect(canReadDocumento(agente, ajeno)).toBe(false);
    expect(canWriteDocumento(agente, "OTRO")).toBe(false);
    expect(canWriteDocumento(sinAsignar, "TEST-DOC-001")).toBe(false);
    expect(canReadDocumento(otroAgente, notaSimple)).toBe(false);
    expect(canListAssetDocumentos(sinAsignar, "TEST-DOC-001")).toBe(false);
  });

  it("el comprador solo lee las filas con su comprador_id", () => {
    expect(canReadDocumento(comprador, delComprador)).toBe(true);
    expect(canReadDocumento(comprador, personal)).toBe(true);
    expect(canReadDocumento(comprador, notaSimple)).toBe(false);
    expect(canReadDocumento(comprador, deOtroComprador)).toBe(false);
    expect(canListAssetDocumentos(comprador, "TEST-DOC-001")).toBe(false);
    expect(canWriteDocumento(comprador, "TEST-DOC-001")).toBe(false);
  });

  it("sin NDA no hay acceso al activo, aunque esté asignado", () => {
    expect(listAssetDocumentosDecision(agenteSinNda, "TEST-DOC-001")).toBe("nda");
    expect(readDocumentoDecision(agenteSinNda, notaSimple)).toBe("nda");
    expect(canListAssetDocumentos(agenteSinNda, "TEST-DOC-001")).toBe(false);
    expect(canReadDocumento(agenteSinNda, notaSimple)).toBe(false);
    expect(listAssetDocumentosDecision(compradorSinNda, "TEST-DOC-001")).toBe("nda");
    expect(readDocumentoDecision(compradorSinNda, delComprador)).toBe("nda");
  });

  it("un comprador sin invitación no firma el NDA ni abre documentos", () => {
    expect(listAssetDocumentosDecision(compradorSinInvitar, "TEST-DOC-001")).toBe("denied");
    expect(readDocumentoDecision(compradorSinInvitar, delComprador)).toBe("denied");
    expect(canReadDocumento(compradorSinInvitar, delComprador)).toBe(false);
    expect(canReadDocumento(compradorSinInvitar, personal)).toBe(true);
    expect(listAssetDocumentosDecision(agenteSinNda, "TEST-DOC-001")).toBe("nda");
    expect(listAssetDocumentosDecision(sinAsignar, "TEST-DOC-001")).toBe("denied");
  });

  it("el NDA del activo A abre A y no B", () => {
    expect(listAssetDocumentosDecision(agenteSoloA, "TEST-DOC-001")).toBe("ok");
    expect(readDocumentoDecision(agenteSoloA, notaSimple)).toBe("ok");
    expect(listAssetDocumentosDecision(agenteSoloA, "ACTIVO-B")).toBe("nda");
    expect(readDocumentoDecision(agenteSoloA, activoB)).toBe("nda");
    expect(canReadDocumento(agenteSoloA, activoB)).toBe(false);
    expect(readDocumentoDecision(comprador, delCompradorB)).toBe("nda");
    expect(canReadDocumento(comprador, delComprador)).toBe(true);
  });

  it("el admin accede sin NDA", () => {
    expect(listAssetDocumentosDecision(admin, "TEST-DOC-001")).toBe("ok");
    expect(listAssetDocumentosDecision(admin, "ACTIVO-B")).toBe("ok");
    expect(readDocumentoDecision(admin, notaSimple)).toBe("ok");
    expect(readDocumentoDecision(admin, activoB)).toBe("ok");
  });
});

describe("la migración no relaja notas ni el bucket público", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261109_informacion_adicional_y_documentos_agente.sql"),
    "utf8",
  );

  it("no toca las políticas de notas", () => {
    expect(migration).not.toMatch(/notas_/);
    expect(migration).not.toContain("scope");
  });

  it("el agente solo tiene SELECT de documentos asignados y no hay política anon del cuadro nuevo", () => {
    expect(migration).toContain("documentos_agente_select");
    expect(migration).toContain("vendedor_assets");
    expect(migration).not.toContain('for insert');
    expect(migration).not.toContain("informacion_adicional_anon_select\"\n  on");
    expect(migration).toContain('for select\n  using (public.is_vendedor())');
  });
});

describe("migración del NDA por activo", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261119b_nda_aceptaciones_activo.sql"),
    "utf8",
  );

  it("crea la tabla idempotente, el unique y la RLS sin leer vendedores", () => {
    expect(migration).toContain("create table if not exists public.asset_nda_aceptaciones");
    expect(migration).toContain("unique (asset_id, user_id, version)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("asset_nda_aceptaciones_admin");
    expect(migration).toContain("asset_nda_aceptaciones_agente_select");
    expect(migration).toContain("asset_nda_aceptaciones_agente_insert");
    expect(migration).toContain("user_id = auth.uid()");
    expect(migration).toContain("public.is_admin()");
    expect(migration).not.toMatch(/from\s+public\.vendedores/i);
    expect(migration).not.toContain("vendedor_assets");
  });
});
