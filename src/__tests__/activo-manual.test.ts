import { describe, expect, it } from "vitest";
import {
  mensajeReferenciaDuplicada,
  normalizarReferenciaActivo,
  precargaDesdeCatastro,
  referenciaDuplicada,
  validarAltaActivo,
} from "@/lib/activo-manual";

describe("alta manual de un activo", () => {
  it("exige referencia, tipo, dirección, municipio y provincia", () => {
    expect(validarAltaActivo({
      referencia: "",
      tipo: "Vivienda",
      direccion: "Calle 1",
      municipio: "Getafe",
      provincia: "Madrid",
    })).toEqual({ ok: false, error: "La referencia catastral es obligatoria" });
    expect(validarAltaActivo({
      referencia: "REF-1",
      tipo: "",
      direccion: "Calle 1",
      municipio: "Getafe",
      provincia: "Madrid",
    }).ok).toBe(false);
    expect(validarAltaActivo({
      referencia: "REF-1",
      tipo: "Vivienda",
      direccion: "",
      municipio: "Getafe",
      provincia: "Madrid",
    }).ok).toBe(false);
  });

  it("deja el activo en borrador salvo que se active y normaliza la referencia", () => {
    const borrador = validarAltaActivo({
      referencia: " 1234567 ab1234 s0001 dx ",
      tipo: "Vivienda",
      direccion: "Calle Mayor 1",
      municipio: "Getafe",
      provincia: "Madrid",
      cp: "28901",
      superficie: 80,
      precio: 100000,
    });
    expect(borrador.ok).toBe(true);
    if (!borrador.ok) return;
    expect(borrador.activo.publicado).toBe(false);
    expect(borrador.activo.id).toBe(normalizarReferenciaActivo("1234567AB1234S0001DX"));
    expect(borrador.activo.superficie).toBe(80);

    const publicado = validarAltaActivo({
      referencia: "MANUAL-1",
      tipo: "Local",
      direccion: "Plaza 2",
      municipio: "Málaga",
      provincia: "Málaga",
      activar: true,
    });
    expect(publicado.ok).toBe(true);
    if (!publicado.ok) return;
    expect(publicado.activo.publicado).toBe(true);
    expect(publicado.activo.id).toBe("MANUAL-1");
  });

  it("rechaza un código postal o una situación que no existen", () => {
    expect(validarAltaActivo({
      referencia: "MANUAL-2",
      tipo: "Vivienda",
      direccion: "Calle 1",
      municipio: "Getafe",
      provincia: "Madrid",
      cp: "280",
    })).toEqual({ ok: false, error: "El código postal no es válido" });
    expect(validarAltaActivo({
      referencia: "MANUAL-2",
      tipo: "Vivienda",
      direccion: "Calle 1",
      municipio: "Getafe",
      provincia: "Madrid",
      situacion: "Inventada",
    }).ok).toBe(false);
  });

  it("detecta la referencia duplicada por id o por referencia", () => {
    expect(referenciaDuplicada(
      [{ id: "OTRO", referencia: "manual-1" }],
      "MANUAL-1",
    )).toBe(true);
    expect(referenciaDuplicada(
      [{ id: "LIBRE", referencia: "OTRA" }],
      "MANUAL-1",
    )).toBe(false);
    expect(mensajeReferenciaDuplicada()).toMatch(/referencia/i);
  });

  it("omite los guiones del catastro al precargar el formulario", () => {
    expect(precargaDesdeCatastro({
      fullAddr: "Calle Mayor 1",
      pob: "—",
      prov: "Madrid",
      cp: "28001",
      sqm: 90,
      uso: "Vivienda",
      desc: "—",
    })).toEqual({
      direccion: "Calle Mayor 1",
      municipio: "",
      provincia: "Madrid",
      cp: "28001",
      superficie: 90,
      tipo: "Vivienda",
      descripcion: "",
    });
  });
});
