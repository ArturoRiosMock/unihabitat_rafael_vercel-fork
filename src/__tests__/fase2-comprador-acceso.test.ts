import { describe, expect, it } from "vitest";
import { compradorToRow, rowToComprador } from "@/lib/supabase/db";
import { assetSharedTemplate } from "@/lib/email/templates";
import type { Comprador } from "@/lib/types";

describe("comprador.acceso mapping", () => {
  it("mapea sin_acceso y default activo para filas legacy", () => {
    expect(rowToComprador({ id: "1", nombre: "A", email: "a@b.com", acceso: "sin_acceso" }).acceso).toBe(
      "sin_acceso",
    );
    expect(rowToComprador({ id: "2", nombre: "B", email: "b@b.com" }).acceso).toBe("activo");
    expect(rowToComprador({ id: "3", nombre: "C", email: "c@b.com", acceso: "activo" }).acceso).toBe(
      "activo",
    );
  });

  it("persiste acceso en compradorToRow", () => {
    const base: Comprador = {
      id: "c1",
      nombre: "Test",
      apellidos: "",
      tipoPersona: "fisica",
      razonSocial: "",
      documento: "",
      direccion: "",
      cp: "",
      poblacion: "",
      provincia: "",
      pais: "España",
      ini: "TE",
      col: "#000,#111",
      tipo: "Privado",
      agente: "Admin",
      email: "t@t.com",
      tel: "",
      intereses: "",
      presupuesto: "",
      activos: "0",
      actividad: "",
      estado: "Nuevo",
      estadoC: "fp-nd",
      nda: "Pendiente",
      acceso: "sin_acceso",
    };
    expect(compradorToRow(base).acceso).toBe("sin_acceso");
    expect(compradorToRow({ ...base, acceso: "activo" }).acceso).toBe("activo");
  });
});

describe("assetSharedTemplate", () => {
  it("incluye ficha y deep link (no plantilla de bienvenida)", () => {
    const tpl = assetSharedTemplate({
      recipientName: "Ana",
      assetId: "REF-001",
      lugar: "Málaga",
      tipologia: "Piso",
      precioLabel: "120.000 €",
      actionUrl: "https://app.example/portal/REF-001",
    });
    expect(tpl.subject).toContain("compartido");
    expect(tpl.subject.toLowerCase()).not.toContain("bienvenida");
    expect(tpl.html).toContain("https://app.example/portal/REF-001");
    expect(tpl.html).toContain("Málaga");
    expect(tpl.text).toContain("Ver activo:");
  });
});
