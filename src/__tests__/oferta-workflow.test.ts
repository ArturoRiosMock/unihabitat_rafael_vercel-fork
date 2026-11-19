import { describe, expect, it } from "vitest";
import {
  OFERTA_ESTADO_EMAIL_COMPRADOR,
  agruparIntereses,
  agruparOfertasPorFirma,
  authorHistorial,
  esTransicionValida,
  eventosNdaCompradores,
  filtrarInteresesParaActor,
  mensajeErrorOferta,
  migrarEstadoLegacy,
  puedeVerOferta,
  transicionesDesde,
  validarCambioOferta,
} from "@/lib/oferta-workflow";

describe("transiciones de oferta", () => {
  it("realizada puede ir a contraoferta, rechazo o aceptación", () => {
    expect(transicionesDesde("realizada")).toEqual(["contraofertada", "rechazada", "aceptada"]);
  });

  it("la contraoferta sigue en el mismo circuito", () => {
    expect(esTransicionValida("contraofertada", "contraofertada")).toBe(true);
    expect(esTransicionValida("contraofertada", "rechazada")).toBe(true);
    expect(esTransicionValida("contraofertada", "aceptada")).toBe(true);
    expect(esTransicionValida("contraofertada", "firmada")).toBe(false);
  });

  it("la oferta aceptada pide documentación y luego la fecha de firma", () => {
    expect(transicionesDesde("aceptada")).toEqual(["pbc_solicitada"]);
    expect(transicionesDesde("pbc_solicitada")).toEqual(["firmada"]);
    expect(transicionesDesde("firmada")).toEqual([]);
    expect(transicionesDesde("rechazada")).toEqual([]);
  });

  it("no salta de realizada a firmada", () => {
    const result = validarCambioOferta({ estado: "realizada" }, { estado: "firmada", fechaFirma: "2026-11-19" });
    expect(result.ok).toBe(false);
  });

  it("la contraoferta exige importe y nota", () => {
    expect(validarCambioOferta({ estado: "realizada" }, { estado: "contraofertada", importe: 0, nota: "sube" }).ok).toBe(false);
    expect(validarCambioOferta({ estado: "realizada" }, { estado: "contraofertada", importe: 1000, nota: "  " }).ok).toBe(false);
    const ok = validarCambioOferta(
      { estado: "contraofertada" },
      { estado: "contraofertada", importe: 1500, nota: "Nueva cifra" },
    );
    expect(ok).toEqual({ ok: true, estado: "contraofertada", importe: 1500, nota: "Nueva cifra", fechaFirma: null });
  });

  it("firmada exige una fecha real", () => {
    expect(validarCambioOferta({ estado: "pbc_solicitada" }, { estado: "firmada" }).ok).toBe(false);
    expect(validarCambioOferta({ estado: "pbc_solicitada" }, { estado: "firmada", fechaFirma: "2026-02-31" }).ok).toBe(false);
    const ok = validarCambioOferta(
      { estado: "pbc_solicitada" },
      { estado: "firmada", fechaFirma: "2026-11-19" },
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.fechaFirma).toBe("2026-11-19T12:00:00.000Z");
  });

  it("agrupa no firmada y firmada", () => {
    const grupos = agruparOfertasPorFirma([
      { id: "a", estado: "realizada" },
      { id: "b", estado: "rechazada" },
      { id: "c", estado: "aceptada" },
      { id: "d", estado: "firmada" },
    ]);
    expect(grupos.noFirmada.map((item) => item.id)).toEqual(["a", "b"]);
    expect(grupos.firmada.map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("migra los estados viejos sin inventar otro valor para rechazada", () => {
    expect(migrarEstadoLegacy("pendiente")).toBe("realizada");
    expect(migrarEstadoLegacy("validada")).toBe("aceptada");
    expect(migrarEstadoLegacy("nda_enviado")).toBe("aceptada");
    expect(migrarEstadoLegacy("nda_firmado")).toBe("firmada");
    expect(migrarEstadoLegacy("rechazada")).toBe("rechazada");
    expect(migrarEstadoLegacy("realizada")).toBe("realizada");
  });
});

describe("permisos y duplicados de oferta", () => {
  it("el admin ve cualquier oferta y el agente solo la suya o la de su comprador", () => {
    expect(puedeVerOferta({
      role: "admin",
      vendedorId: null,
      compradorAsignadoA: "V2",
      ofertaVendedorId: "V2",
      ofertaCompradorId: "C2",
    })).toBe(true);

    expect(puedeVerOferta({
      role: "vendedor",
      vendedorId: "V1",
      compradorAsignadoA: "V1",
      ofertaVendedorId: null,
      ofertaCompradorId: "C1",
    })).toBe(true);

    expect(puedeVerOferta({
      role: "vendedor",
      vendedorId: "V1",
      compradorAsignadoA: "V2",
      ofertaVendedorId: "V2",
      ofertaCompradorId: "C2",
    })).toBe(false);

    expect(puedeVerOferta({
      role: "vendedor",
      vendedorId: "V1",
      compradorAsignadoA: null,
      ofertaVendedorId: "V1",
      ofertaCompradorId: null,
    })).toBe(true);
  });

  it("traduce el índice único al mensaje del comprador", () => {
    expect(mensajeErrorOferta({
      code: "23505",
      message: 'duplicate key value violates unique constraint "ofertas_comprador_asset_uidx"',
    })).toBe("Este comprador ya tiene una oferta en este activo");
    expect(mensajeErrorOferta({
      code: "23505",
      message: 'duplicate key value violates unique constraint "ofertas_vendedor_asset_uidx"',
    })).toBe("Este agente ya tiene una oferta en este activo");
  });

  it("el historial del admin se firma como Gestor", () => {
    expect(authorHistorial({ role: "admin", nombre: "Modesto" })).toEqual({
      author: "Gestor",
      author_role: "admin",
    });
    expect(authorHistorial({ role: "vendedor", nombre: "Laura Pérez" })).toEqual({
      author: "Laura Pérez",
      author_role: "vendedor",
    });
  });

  it("cambiar el estado no envía email al comprador", () => {
    expect(OFERTA_ESTADO_EMAIL_COMPRADOR).toBe(false);
  });
});

describe("clientes interesados sin duplicar", () => {
  it("junta asignación, favorito y NDA del mismo comprador", () => {
    const grupos = agruparIntereses([
      { compradorId: "C1", origen: "favorito", fecha: "2026-03-02T00:00:00.000Z" },
      { compradorId: "C1", origen: "asignado", fecha: "2026-03-01T00:00:00.000Z" },
      { compradorId: "C1", origen: "favorito", fecha: "2026-02-01T00:00:00.000Z" },
      { compradorId: "C2", origen: "nda", fecha: "2026-04-01T00:00:00.000Z" },
    ]);
    expect(grupos).toHaveLength(2);
    const primero = grupos.find((item) => item.compradorId === "C1");
    expect(primero?.fecha).toBe("2026-02-01T00:00:00.000Z");
    expect(primero?.origenes.map((item) => item.origen).sort()).toEqual(["asignado", "favorito"]);
    expect(primero?.origenes.find((item) => item.origen === "favorito")?.fecha).toBe("2026-02-01T00:00:00.000Z");
  });

  it("el NDA de un usuario que no es comprador no entra", () => {
    const eventos = eventosNdaCompradores(
      [
        { userId: "user-comprador", acceptedAt: "2026-05-01T00:00:00.000Z" },
        { userId: "user-agente", acceptedAt: "2026-05-02T00:00:00.000Z" },
      ],
      new Map([["user-comprador", "C1"]]),
    );
    expect(eventos).toEqual([
      { compradorId: "C1", origen: "nda", fecha: "2026-05-01T00:00:00.000Z" },
    ]);
  });

  it("el agente no ve el interés de un comprador de otro agente", () => {
    const eventos = [
      { compradorId: "C1", origen: "favorito" as const, fecha: "2026-01-01" },
      { compradorId: "C2", origen: "asignado" as const, fecha: "2026-01-02" },
    ];
    const asignacion = new Map<string, string | null>([["C1", "V1"], ["C2", "V2"]]);
    expect(filtrarInteresesParaActor(eventos, { role: "vendedor", vendedorId: "V1" }, asignacion))
      .toEqual([eventos[0]]);
    expect(filtrarInteresesParaActor(eventos, { role: "admin", vendedorId: null }, asignacion)).toHaveLength(2);
    expect(filtrarInteresesParaActor(eventos, { role: "vendedor", vendedorId: null }, asignacion)).toEqual([]);
  });
});
