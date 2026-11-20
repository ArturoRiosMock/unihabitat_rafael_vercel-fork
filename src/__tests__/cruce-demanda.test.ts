import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LIMITE_OPORTUNIDADES_DEFECTO,
  categoriasCoinciden,
  cruzarDemanda,
  cruceDemandaEmailEnabled,
  ejecutarCruce,
  nivelEncajeActivo,
  normalizarDemanda,
  normalizarLugar,
  planEnvioResumen,
  puedeBuscarOportunidades,
  puedeLanzarCruce,
  puedeLeerDemanda,
  puedeMarcarEstado,
  type ActivoCruce,
  type CruceStore,
  type DemandaComprador,
  type EnvioResumen,
  type OportunidadInsert,
} from "@/lib/cruce-demanda";
import { oportunidadesDemandaTemplate } from "@/lib/email/templates";

const agente1 = { role: "vendedor" as const, vendedorId: "agente-1", compradorId: null };
const agente2 = { role: "vendedor" as const, vendedorId: "agente-2", compradorId: null };
const admin = { role: "admin" as const, vendedorId: null, compradorId: null };
const cliente = { role: "cliente" as const, vendedorId: null, compradorId: "c1" };

function activo(partial: Partial<ActivoCruce> & Pick<ActivoCruce, "id">): ActivoCruce {
  return {
    publicado: true,
    provincia: "Madrid",
    poblacion: "Getafe",
    precio: 120000,
    categorias: ["PISO"],
    tip: "PISO",
    ...partial,
  };
}

function demanda(partial: Partial<DemandaComprador> = {}): DemandaComprador {
  return {
    compradorId: "c1",
    categorias: ["Vivienda"],
    provincias: ["Madrid"],
    poblaciones: ["Getafe"],
    precioMin: null,
    precioMax: null,
    ...partial,
  };
}

describe("normalización de lugares y categorías", () => {
  it("iguala mayúsculas, tildes y espacios", () => {
    expect(normalizarLugar("  málaga ")).toBe("MALAGA");
    expect(normalizarLugar("MÁLAGA")).toBe(normalizarLugar("malaga"));
    expect(normalizarLugar("A  Coruña")).toBe("A CORUNA");
  });

  it("trata vivienda y piso como la misma categoría y conserva CDR/NPL", () => {
    expect(categoriasCoinciden(["vivienda"], ["PISO"])).toBe(true);
    expect(categoriasCoinciden(["Local"], ["LOCAL COMERCIAL"])).toBe(true);
    expect(categoriasCoinciden(["Nave"], ["VIVIENDA"])).toBe(false);
    expect(categoriasCoinciden(["NPL"], ["NPL"])).toBe(true);
    expect(categoriasCoinciden(["OCUPADO"], ["ocupado"])).toBe(true);
  });

  it("deduplica provincias al guardar la demanda", () => {
    const result = normalizarDemanda("c1", {
      provincias: ["MÁLAGA", " malaga ", "Madrid"],
      poblaciones: ["  Marbella"],
      precioMin: 10000,
      precioMax: 200000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.demanda.provincias).toEqual(["MÁLAGA", "Madrid"]);
    expect(result.demanda.poblaciones).toEqual(["Marbella"]);
  });

  it("rechaza un rango de precio invertido", () => {
    expect(normalizarDemanda("c1", { precioMin: 80, precioMax: 10 })).toEqual({
      ok: false,
      error: "El precio mínimo no puede superar al máximo",
    });
  });
});

describe("cascada población → provincia → sin categoría", () => {
  const getafe = activo({ id: "getafe-piso", poblacion: "Getafe", provincia: "Madrid", categorias: ["PISO"] });
  const alcala = activo({ id: "alcala-piso", poblacion: "Alcalá de Henares", provincia: "Madrid", categorias: ["PISO"] });
  const localGetafe = activo({ id: "getafe-local", poblacion: "Getafe", provincia: "Madrid", categorias: ["LOCAL"], tip: "LOCAL" });
  const toledo = activo({ id: "toledo-nave", poblacion: "Toledo", provincia: "Toledo", categorias: ["NAVE"], tip: "NAVE" });
  const catalogo = [alcala, localGetafe, toledo, getafe];

  it("se queda en categoría y población cuando hay resultados", () => {
    const cruce = cruzarDemanda({ demanda: demanda(), activos: catalogo, yaOfrecidos: [] });
    expect(cruce.nivel).toBe("poblacion");
    expect(cruce.hits.map((hit) => hit.assetId)).toEqual(["getafe-piso"]);
  });

  it("baja a categoría y provincia si la población ya no tiene activos nuevos", () => {
    const cruce = cruzarDemanda({
      demanda: demanda(),
      activos: catalogo,
      yaOfrecidos: ["getafe-piso"],
    });
    expect(cruce.nivel).toBe("provincia");
    expect(cruce.hits.map((hit) => hit.assetId)).toEqual(["alcala-piso"]);
  });

  it("si tampoco hay provincia con categoría, ofrece la ubicación sin filtrar categoría", () => {
    const cruce = cruzarDemanda({
      demanda: demanda(),
      activos: catalogo,
      yaOfrecidos: ["getafe-piso", "alcala-piso"],
    });
    expect(cruce.nivel).toBe("sin_categoria");
    expect(cruce.hits.map((hit) => hit.assetId)).toEqual(["getafe-local"]);
  });

  it("sin ubicación en la demanda cruza solo por categoría", () => {
    const cruce = cruzarDemanda({
      demanda: demanda({ provincias: [], poblaciones: [] }),
      activos: catalogo,
      yaOfrecidos: [],
    });
    expect(cruce.nivel).toBe("solo_categoria");
    expect(cruce.hits.map((hit) => hit.assetId).sort()).toEqual(["alcala-piso", "getafe-piso"]);
  });

  it("no repite un activo ya ofrecido y respeta el límite", () => {
    const muchos = Array.from({ length: 8 }, (_, index) => activo({
      id: `g-${index}`,
      poblacion: "Getafe",
      provincia: "Madrid",
    }));
    const cruce = cruzarDemanda({
      demanda: demanda(),
      activos: muchos,
      yaOfrecidos: ["g-1"],
      limite: LIMITE_OPORTUNIDADES_DEFECTO,
    });
    expect(cruce.hits).toHaveLength(5);
    expect(cruce.hits.map((hit) => hit.assetId)).not.toContain("g-1");
  });

  it("respeta el rango de precio y descarta activos sin precio", () => {
    const barato = activo({ id: "barato", precio: 50000 });
    const caro = activo({ id: "caro", precio: 400000 });
    const sinPrecio = activo({ id: "sin-precio", precio: null });
    const cruce = cruzarDemanda({
      demanda: demanda({ precioMin: 40000, precioMax: 150000 }),
      activos: [barato, caro, sinPrecio],
      yaOfrecidos: [],
    });
    expect(cruce.hits.map((hit) => hit.assetId)).toEqual(["barato"]);
  });

  it("no ofrece activos sin publicar", () => {
    const cruce = cruzarDemanda({
      demanda: demanda(),
      activos: [activo({ id: "oculto", publicado: false })],
      yaOfrecidos: [],
    });
    expect(cruce.hits).toEqual([]);
  });
});

describe("encaje de un activo con la demanda", () => {
  it("marca el mejor nivel de ese activo", () => {
    const piso = activo({ id: "a", categorias: ["PISO"], poblacion: "Getafe", provincia: "Madrid" });
    expect(nivelEncajeActivo(demanda(), piso)).toBe("poblacion");
    expect(nivelEncajeActivo(demanda(), activo({
      id: "b",
      categorias: ["LOCAL"],
      poblacion: "Toledo",
      provincia: "Toledo",
      tip: "LOCAL",
    }))).toBeNull();
    expect(nivelEncajeActivo(demanda(), activo({ id: "c", publicado: false }))).toBeNull();
  });
});

describe("permisos del agente, del gestor y del comprador", () => {
  it("el agente solo lee y busca en sus compradores", () => {
    expect(puedeLeerDemanda(agente1, "c1", "agente-1")).toBe(true);
    expect(puedeBuscarOportunidades(agente1, "agente-1")).toBe(true);
    expect(puedeLeerDemanda(agente2, "c1", "agente-1")).toBe(false);
    expect(puedeBuscarOportunidades(agente2, "agente-1")).toBe(false);
    expect(puedeLanzarCruce(agente1)).toBe(false);
    expect(puedeMarcarEstado(agente2, "c1", "agente-1", "descartada")).toEqual({
      ok: false,
      error: "No tienes acceso a este comprador",
    });
  });

  it("el gestor lanza el cruce de todos y el comprador solo marca la suya", () => {
    expect(puedeLeerDemanda(admin, "c1", null)).toBe(true);
    expect(puedeLanzarCruce(admin)).toBe(true);
    expect(puedeBuscarOportunidades(admin, null)).toBe(true);
    expect(puedeLeerDemanda(cliente, "c1", null)).toBe(true);
    expect(puedeLeerDemanda(cliente, "otro", null)).toBe(false);
    expect(puedeBuscarOportunidades(cliente, null)).toBe(false);
    expect(puedeLanzarCruce(cliente)).toBe(false);
    expect(puedeMarcarEstado(cliente, "c1", null, "interesado").ok).toBe(true);
    expect(puedeMarcarEstado(cliente, "c1", null, "descartada").ok).toBe(true);
    expect(puedeMarcarEstado(cliente, "c1", null, "ofrecida")).toEqual({
      ok: false,
      error: "Solo puedes marcar interesado o descartada",
    });
  });
});

describe("registro sin repetir y email detrás del flag", () => {
  function memoria(): { store: CruceStore; inserts: OportunidadInsert[][] } {
    const ofrecidos: Array<{ compradorId: string; assetId: string }> = [];
    const inserts: OportunidadInsert[][] = [];
    const store: CruceStore = {
      async listCompradores() {
        return [{ id: "c1", email: "ana@cliente.test", nombre: "Ana", agenteEmail: "agente@unihabitat.test" }];
      },
      async listDemandas() {
        return [demanda()];
      },
      async listActivosPublicados() {
        return [activo({ id: "getafe-piso", publicSlug: "piso-getafe-k7m4qx" })];
      },
      async listOfrecidos() {
        return ofrecidos;
      },
      async insertOportunidades(rows) {
        inserts.push(rows);
        for (const row of rows) ofrecidos.push({ compradorId: row.compradorId, assetId: row.assetId });
      },
      async insertEjecucion() {
        return undefined;
      },
    };
    return { store, inserts };
  }

  it("la segunda ejecución no vuelve a ofrecer el mismo activo", async () => {
    const { store, inserts } = memoria();
    const primera = await ejecutarCruce(store, {
      origen: "cron",
      registrar: true,
      emailEnabled: false,
    });
    const segunda = await ejecutarCruce(store, {
      origen: "cron",
      registrar: true,
      emailEnabled: false,
    });
    expect(primera.oportunidades).toBe(1);
    expect(primera.porNivel.poblacion).toBe(1);
    expect(segunda.oportunidades).toBe(0);
    expect(inserts).toHaveLength(1);
  });

  it("con el flag apagado no llama al envío", async () => {
    const { store } = memoria();
    const enviarEmail = vi.fn(async () => "enviado" as const);
    const resultado = await ejecutarCruce(store, {
      origen: "manual",
      registrar: true,
      emailEnabled: false,
      enviarEmail,
    });
    expect(enviarEmail).not.toHaveBeenCalled();
    expect(resultado.emailsEnviados).toBe(0);
    expect(resultado.emailsOmitidos).toBe(1);
  });

  it("con el flag activo copia al agente y el texto no lleva la referencia interna", async () => {
    expect(cruceDemandaEmailEnabled(undefined)).toBe(false);
    expect(cruceDemandaEmailEnabled("true")).toBe(true);
    expect(planEnvioResumen({
      emailEnabled: false,
      compradorEmail: "ana@cliente.test",
      agenteEmail: "agente@unihabitat.test",
    })).toEqual({ enviar: false, motivo: "flag" });
    expect(planEnvioResumen({
      emailEnabled: true,
      compradorEmail: "ana@cliente.test",
      agenteEmail: "agente@unihabitat.test",
    })).toEqual({
      enviar: true,
      to: "ana@cliente.test",
      cc: "agente@unihabitat.test",
    });

    const { store } = memoria();
    const enviarEmail = vi.fn(async (_envio: EnvioResumen) => "enviado" as const);
    await ejecutarCruce(store, {
      origen: "cron",
      registrar: true,
      emailEnabled: true,
      origenPublico: "https://www.unihabitat.net",
      enviarEmail,
    });
    expect(enviarEmail).toHaveBeenCalledOnce();
    const envio = enviarEmail.mock.calls[0]?.[0];
    expect(envio).toBeDefined();
    if (!envio) return;
    expect(envio.cc).toBe("agente@unihabitat.test");
    expect(envio.oportunidades[0].url).toContain("https://www.unihabitat.net/portal/");
    const template = oportunidadesDemandaTemplate({
      nombre: envio.nombre,
      oportunidades: envio.oportunidades.map((ficha) => ({ ...ficha, nivel: "población" })),
    });
    expect(template.text).not.toContain("getafe-piso");
    expect(template.html).not.toContain("deuda");
    expect(template.text).toContain("Getafe");
  });
});

describe("migración de demanda", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261119g_comprador_demanda_cruce.sql"),
    "utf8",
  );

  it("crea las tablas, el índice único y el RLS de admin, agente y comprador", () => {
    expect(sql).toContain("create table if not exists public.comprador_demanda");
    expect(sql).toContain("create table if not exists public.comprador_oportunidades");
    expect(sql).toContain("comprador_oportunidades_comprador_asset_uidx");
    expect(sql).toContain("public.is_admin()");
    expect(sql).toContain("public.is_vendedor()");
    expect(sql).toContain("vendedor_compradores");
    expect(sql).toContain("v.user_id = auth.uid()");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("estado in ('interesado', 'descartada')");
    expect(sql).toContain("grant update (estado)");
    expect(sql).toContain("enable row level security");
  });
});
