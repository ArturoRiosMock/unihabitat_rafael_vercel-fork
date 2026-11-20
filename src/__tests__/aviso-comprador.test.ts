import { describe, expect, it } from "vitest";
import {
  lunesSemanaUtc,
  planAvisoComprador,
  puedeEnviarAviso,
  resumenOportunidadesWhatsapp,
} from "@/lib/aviso-comprador";

describe("cupo semanal de avisos", () => {
  it("toma el lunes UTC como inicio de semana", () => {
    expect(lunesSemanaUtc(new Date("2026-11-20T12:00:00.000Z"))).toBe("2026-11-16");
    expect(lunesSemanaUtc(new Date("2026-11-16T00:30:00.000Z"))).toBe("2026-11-16");
    expect(lunesSemanaUtc(new Date("2026-11-22T23:00:00.000Z"))).toBe("2026-11-16");
  });

  it("permite dos avisos y bloquea el tercero", () => {
    expect(puedeEnviarAviso(0)).toBe(true);
    expect(puedeEnviarAviso(1)).toBe(true);
    expect(puedeEnviarAviso(2)).toBe(false);
    const bloqueado = planAvisoComprador({
      avisosEnSemana: 2,
      emailEnabled: true,
      whatsappEnabled: true,
      aceptaWhatsapp: true,
      tieneTelefono: true,
      tieneEmail: true,
    });
    expect(bloqueado).toEqual({ email: false, whatsapp: false, bloqueadoPorCupo: true });
  });

  it("solo manda WhatsApp con consentimiento y teléfono", () => {
    expect(planAvisoComprador({
      avisosEnSemana: 0,
      emailEnabled: false,
      whatsappEnabled: true,
      aceptaWhatsapp: false,
      tieneTelefono: true,
      tieneEmail: true,
    }).whatsapp).toBe(false);
    expect(planAvisoComprador({
      avisosEnSemana: 0,
      emailEnabled: true,
      whatsappEnabled: true,
      aceptaWhatsapp: true,
      tieneTelefono: true,
      tieneEmail: true,
    })).toEqual({ email: true, whatsapp: true, bloqueadoPorCupo: false });
  });

  it("resume las oportunidades para la plantilla", () => {
    const texto = resumenOportunidadesWhatsapp([
      { titulo: "Piso", lugar: "Getafe, Madrid", precioLabel: "120.000 €" },
    ]);
    expect(texto).toContain("Piso");
    expect(texto).toContain("Getafe, Madrid");
  });
});
