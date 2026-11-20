import { describe, expect, it } from "vitest";
import {
  etiquetaSeguimiento,
  notificarCambioSeguimiento,
  puedeEditarSeguimiento,
  registrarAutomatizacionSeguimiento,
  validarSeguimiento,
} from "@/lib/oferta-workflow";

describe("seguimiento de una oferta", () => {
  it("acepta los cuatro valores y no exige una transición", () => {
    expect(validarSeguimiento("pendiente", "en_seguimiento")).toEqual({
      ok: true,
      desde: "pendiente",
      hasta: "en_seguimiento",
    });
    expect(validarSeguimiento("enviado", "sin_respuesta").ok).toBe(true);
    expect(validarSeguimiento("pendiente", "pendiente")).toEqual({
      ok: false,
      error: "El seguimiento ya está en ese estado",
    });
    expect(validarSeguimiento("pendiente", "firmada").ok).toBe(false);
    expect(etiquetaSeguimiento("en_seguimiento")).toBe("En seguimiento");
    expect(etiquetaSeguimiento("enviado")).toBe("Enviado");
    expect(etiquetaSeguimiento("sin_respuesta")).toBe("Sin respuesta");
  });

  it("deja editar al admin y al agente con la sección Ofertas", () => {
    expect(puedeEditarSeguimiento({ role: "admin", puedeVerOfertas: false })).toBe(true);
    expect(puedeEditarSeguimiento({ role: "vendedor", puedeVerOfertas: true })).toBe(true);
    expect(puedeEditarSeguimiento({ role: "vendedor", puedeVerOfertas: false })).toBe(false);
    expect(puedeEditarSeguimiento({ role: "cliente", puedeVerOfertas: true })).toBe(false);
  });

  it("dispara el punto de extensión al cambiar el seguimiento", async () => {
    const eventos: string[] = [];
    const quitar = registrarAutomatizacionSeguimiento((evento) => {
      eventos.push(`${evento.desde}->${evento.hasta}`);
    });
    await notificarCambioSeguimiento({
      ofertaId: "o1",
      desde: "pendiente",
      hasta: "enviado",
      author: "Gestor",
      authorRole: "admin",
      at: "2026-11-20T12:00:00.000Z",
    });
    quitar();
    await notificarCambioSeguimiento({
      ofertaId: "o1",
      desde: "enviado",
      hasta: "sin_respuesta",
      author: "Gestor",
      authorRole: "admin",
      at: "2026-11-20T12:00:00.000Z",
    });
    expect(eventos).toEqual(["pendiente->enviado"]);
  });
});
