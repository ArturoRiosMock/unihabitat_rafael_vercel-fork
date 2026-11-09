import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canListAssetDocumentos,
  canReadDocumento,
  canWriteDocumento,
  type DocumentoAccessFacts,
} from "@/lib/documento-access";

const admin: DocumentoAccessFacts = { role: "admin" };
const agente: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: ["TEST-DOC-001"],
};
const otroAgente: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-2",
  assignedAssetIds: ["OTRO"],
};
const sinAsignar: DocumentoAccessFacts = {
  role: "vendedor",
  vendedorId: "vend-1",
  assignedAssetIds: [],
};
const comprador: DocumentoAccessFacts = { role: "cliente", compradorId: "comp-1" };

const notaSimple = { asset_id: "TEST-DOC-001", comprador_id: null };
const ajeno = { asset_id: "OTRO", comprador_id: null };
const delComprador = { asset_id: "TEST-DOC-001", comprador_id: "comp-1" };
const deOtroComprador = { asset_id: "TEST-DOC-001", comprador_id: "comp-2" };

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
    expect(canReadDocumento(comprador, notaSimple)).toBe(false);
    expect(canReadDocumento(comprador, deOtroComprador)).toBe(false);
    expect(canListAssetDocumentos(comprador, "TEST-DOC-001")).toBe(false);
    expect(canWriteDocumento(comprador, "TEST-DOC-001")).toBe(false);
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
