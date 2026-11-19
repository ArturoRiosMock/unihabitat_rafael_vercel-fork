import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compradorToRow, rowToComprador } from "@/lib/supabase/db";
import { planCompradorUpdate } from "@/lib/comprador-gestion";
import {
  datosFirmaFromRow,
  datosFirmaVacios,
  etiquetaDatosFirma,
  mergeDatosFirma,
  nombreCompleto,
  patchDatosFirma,
  splitNombreCompleto,
  validarDatosFirma,
  type DatosFirma,
} from "@/lib/comprador-oferta";
import type { Comprador } from "@/lib/types";

const admin = { role: "admin" as const, vendedorId: null };

function firmaCompleta(partial: Partial<DatosFirma> = {}): DatosFirma {
  return {
    ...datosFirmaVacios(),
    nombre: "Ana",
    apellidos: "García López",
    documento: "12345678Z",
    direccion: "Calle Mayor 1",
    cp: "28001",
    poblacion: "Madrid",
    provincia: "Madrid",
    pais: "España",
    tel: "600 111 222",
    email: "ana@example.com",
    ...partial,
  };
}

describe("partición de nombre y apellidos", () => {
  it("parte por el primer espacio y deja el resto en apellidos", () => {
    expect(splitNombreCompleto("María del Carmen García")).toEqual({
      nombre: "María",
      apellidos: "del Carmen García",
    });
    expect(splitNombreCompleto("  Ana   López  ")).toEqual({
      nombre: "Ana",
      apellidos: "López",
    });
  });

  it("deja el nombre entero si no hay espacio", () => {
    expect(splitNombreCompleto("Madonna")).toEqual({ nombre: "Madonna", apellidos: "" });
    expect(splitNombreCompleto("   ")).toEqual({ nombre: "", apellidos: "" });
  });

  it("reconstruye el nombre completo para listados y correos", () => {
    expect(nombreCompleto("Ana", "García López")).toBe("Ana García López");
    expect(nombreCompleto("Ana", "")).toBe("Ana");
    expect(nombreCompleto("", "García")).toBe("García");
  });
});

describe("validación de datos obligatorios para firmar", () => {
  it("marca la ficha completa cuando persona física tiene identidad y domicilio", () => {
    const result = validarDatosFirma(firmaCompleta());
    expect(result.ok).toBe(true);
    expect(etiquetaDatosFirma(firmaCompleta())).toBe("Datos completos");
  });

  it("lista los campos que faltan, con nombre y apellidos por separado", () => {
    const result = validarDatosFirma(datosFirmaVacios());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.faltan).toEqual([
        "Nombre",
        "Apellidos",
        "DNI/NIE/CIF",
        "Dirección",
        "Código postal",
        "Población",
        "Provincia",
        "Teléfono",
        "Email",
      ]);
      expect(result.error).toContain("Faltan datos para firmar la oferta");
    }
    expect(etiquetaDatosFirma(datosFirmaVacios())).toBe(
      "Faltan: Nombre, Apellidos, DNI/NIE/CIF, Dirección, Código postal, Población, Provincia, Teléfono, Email",
    );
  });

  it("exige razón social solo a la persona jurídica y acepta NIE o CIF", () => {
    const sociedad = validarDatosFirma(firmaCompleta({
      tipoPersona: "juridica",
      documento: "B12345674",
    }));
    expect(sociedad.ok).toBe(false);
    if (!sociedad.ok) expect(sociedad.faltan).toContain("Razón social");

    const completa = validarDatosFirma(firmaCompleta({
      tipoPersona: "juridica",
      razonSocial: "Unihabitat SL",
      documento: "B12345674",
    }));
    expect(completa.ok).toBe(true);

    const nie = validarDatosFirma(firmaCompleta({ documento: "X1234567L" }));
    expect(nie.ok).toBe(true);
  });

  it("rechaza documento, código postal español, teléfono y email inválidos", () => {
    const result = validarDatosFirma(firmaCompleta({
      documento: "123",
      cp: "2800",
      tel: "123",
      email: "ana",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.faltan).toEqual(["DNI/NIE/CIF", "Código postal", "Teléfono", "Email"]);
    }
  });

  it("acepta un código postal no español si el país no es España", () => {
    const result = validarDatosFirma(firmaCompleta({ pais: "Portugal", cp: "1100-148" }));
    expect(result.ok).toBe(true);
  });

  it("guarda en la ficha solo lo que la oferta completa y normaliza el documento", () => {
    const stored = datosFirmaFromRow({
      nombre: "Ana",
      apellidos: "",
      email: "ana@example.com",
      tel: "600111222",
    });
    const merged = mergeDatosFirma(stored, firmaCompleta({ documento: "12345678z" }));
    const patch = patchDatosFirma(stored, merged);
    expect(patch).toMatchObject({
      apellidos: "García López",
      documento: "12345678Z",
      direccion: "Calle Mayor 1",
      cp: "28001",
      ini: "AG",
    });
    expect(patch.nombre).toBeUndefined();
    expect(patch.email).toBeUndefined();
  });
});

describe("mapeo de la ficha", () => {
  it("persiste apellidos y el resto de columnas de firma", () => {
    const base = rowToComprador({
      id: "c1",
      nombre: "Ana",
      apellidos: "García",
      tipo_persona: "juridica",
      razon_social: "Unihabitat SL",
      documento: "B12345674",
      direccion: "Calle Mayor 1",
      cp: "28001",
      poblacion: "Madrid",
      provincia: "Madrid",
      pais: "España",
      email: "ana@example.com",
      ini: "AG",
      col: "#000",
      tipo: "Privado",
      agente: "Admin",
      tel: "600111222",
      nda: "Pendiente",
      acceso: "sin_acceso",
    });
    const row = compradorToRow(base);
    expect(row.apellidos).toBe("García");
    expect(row.tipo_persona).toBe("juridica");
    expect(row.razon_social).toBe("Unihabitat SL");
    expect(row.documento).toBe("B12345674");
    expect(row.nombre).toBe("Ana");
  });

  it("deja apellidos vacío en filas anteriores a la migración", () => {
    const row = rowToComprador({ id: "1", nombre: "Ana García", email: "a@b.com" });
    expect(row.apellidos).toBe("");
    expect(row.tipoPersona).toBe("fisica");
    expect(row.pais).toBe("España");
  });

  it("el admin puede guardar nombre y apellidos por separado", () => {
    const plan = planCompradorUpdate(admin, null, {
      nombre: "Ana",
      apellidos: "García",
      tipoPersona: "juridica",
      razonSocial: "Unihabitat SL",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.patch).toMatchObject({
        nombre: "Ana",
        apellidos: "García",
        tipo_persona: "juridica",
        razon_social: "Unihabitat SL",
        ini: "AG",
      });
    }
  });
});

describe("migración 20261119d", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261119d_compradores_datos_firma.sql"),
    "utf8",
  );

  it("es idempotente, parte por el primer espacio y no toca las políticas RLS", () => {
    expect(sql).toContain("add column if not exists apellidos");
    expect(sql).toContain("add column if not exists nombre_completo");
    expect(sql).toContain("position(' ' in btrim(nombre))");
    expect(sql).toContain("coalesce(apellidos, '') = ''");
    expect(sql).toContain("compradores_tipo_persona_chk");
    expect(sql.toLowerCase()).not.toContain("create policy");
    expect(sql.toLowerCase()).not.toContain("drop policy");
  });
});

describe("tipo Comprador de apoyo", () => {
  it("acepta la ficha extendida sin perder el acceso", () => {
    const c: Comprador = {
      ...rowToComprador({ id: "1", nombre: "Ana", email: "a@b.com", acceso: "sin_acceso" }),
      apellidos: "García",
    };
    expect(compradorToRow(c).acceso).toBe("sin_acceso");
    expect(compradorToRow(c).apellidos).toBe("García");
  });
});
