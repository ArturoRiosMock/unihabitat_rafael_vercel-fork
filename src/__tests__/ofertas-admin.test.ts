import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminOrVendor = vi.fn(async () => ({
  role: "admin" as const,
  nombre: "Admin",
  email: "admin@test",
  vendedorId: null as string | null,
}));

vi.mock("@/lib/auth-server", () => ({
  getServerSession: vi.fn(async () => ({
    role: "admin",
    nombre: "Admin",
    email: "admin@test",
    vendedorId: null,
  })),
  requireAdminOrVendor: (...args: unknown[]) => requireAdminOrVendor(...args),
}));

function ofertaCreada<T extends { id: string }>(
  result: { ok: true; oferta: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(result.error);
  return result.oferta;
}

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/email/templates", () => ({
  offerTemplate: vi.fn(() => ({ subject: "oferta", html: "<p>ok</p>", text: "ok" })),
}));

const COMPRADOR_FIRMA = {
  id: "C1",
  nombre: "Ana",
  apellidos: "García",
  tipo_persona: "fisica",
  razon_social: "",
  documento: "12345678Z",
  direccion: "Calle Mayor 1",
  cp: "28001",
  poblacion: "Madrid",
  provincia: "Madrid",
  pais: "España",
  tel: "600111222",
  email: "ana@example.com",
};

/**
 * Mock Supabase service client for createOfertaAdmin:
 * assets/compradores/vendedores lookup via maybeSingle, insert via select().single().
 * El comprador por defecto tiene la ficha de firma completa.
 */
function makeOfertaSupabaseMock(opts: {
  asset?: { id: string } | null;
  comprador?: Record<string, unknown> | null;
  vendedor?: { id: string } | null;
  insertRow?: Record<string, unknown>;
  insertError?: { message: string; code?: string } | null;
  existingOferta?: { id: string } | null;
}) {
  const compradorRow = opts.comprador === null
    ? null
    : { ...COMPRADOR_FIRMA, ...(opts.comprador ?? {}) };
  const insertSingle = vi.fn(async () => ({
    data: opts.insertError ? null : (opts.insertRow ?? null),
    error: opts.insertError ?? null,
  }));
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const historialInsert = vi.fn(async () => ({ error: null }));
  const ofertaExistente = vi.fn(async () => ({
    data: opts.existingOferta ?? null,
    error: null,
  }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const from = vi.fn((table: string) => {
    if (table === "assets") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: opts.asset === undefined ? { id: "A1" } : opts.asset,
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === "compradores") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: compradorRow,
              error: null,
            })),
          })),
        })),
        update,
      };
    }
    if (table === "vendedores") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: opts.vendedor === undefined ? { id: "V1" } : opts.vendedor,
              error: null,
            })),
          })),
          in: vi.fn(async () => ({ data: [], error: null })),
        })),
      };
    }
    if (table === "ofertas") {
      return {
        insert,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({ maybeSingle: ofertaExistente })),
              maybeSingle: ofertaExistente,
            })),
            maybeSingle: ofertaExistente,
          })),
        })),
      };
    }
    if (table === "oferta_historial") {
      return { insert: historialInsert };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          in: vi.fn(async () => ({ data: [], error: null })),
        })),
        in: vi.fn(async () => ({ data: [], error: null })),
      })),
    };
  });

  return { client: { from }, spies: { from, insert, insertSingle, update, historialInsert } };
}

describe("createOfertaAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminOrVendor.mockReset();
    requireAdminOrVendor.mockResolvedValue({
      role: "admin",
      nombre: "Admin",
      email: "admin@test",
      vendedorId: null,
    });
  });

  it("exige rol admin o vendedor", async () => {
    requireAdminOrVendor.mockRejectedValueOnce(new Error("No autorizado"));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({ from: vi.fn() })),
      createServiceClient: vi.fn(async () => ({ from: vi.fn() })),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        compradorId: "C1",
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/No autorizado/) });
  });

  it("rechaza importe inválido sin insertar", async () => {
    const sb = makeOfertaSupabaseMock({});
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        compradorId: "C1",
        assetId: "A1",
        propuestaEuros: 0,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/mayor que 0/) });
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it("admin sin comprador falla", async () => {
    const sb = makeOfertaSupabaseMock({ asset: { id: "A1" } });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Selecciona un comprador/) });
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it("inserta oferta pendiente con asset y comprador válidos (admin)", async () => {
    const row = {
      id: "O1",
      comprador_id: "C1",
      vendedor_id: null,
      asset_id: "A1",
      propuesta_euros: 125000,
      comentarios: "nota",
      estado: "realizada",
      nda_enviado_at: null,
      nda_firmado_at: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const sb = makeOfertaSupabaseMock({
      asset: { id: "A1" },
      comprador: { id: "C1" },
      insertRow: row,
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    const out = ofertaCreada(await createOfertaAdmin({
      compradorId: "C1",
      assetId: "A1",
      propuestaEuros: 125000,
      comentarios: "nota",
    }));

    expect(out.estado).toBe("realizada");
    expect(out.id).toBe("O1");
    expect(sb.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        comprador_id: "C1",
        vendedor_id: null,
        asset_id: "A1",
        propuesta_euros: 125000,
        estado: "realizada",
        comentarios: "nota",
        comentarios_author: "Admin",
        comentarios_author_role: "admin",
      }),
    );
    expect(sb.spies.historialInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        oferta_id: "O1",
        estado_desde: null,
        estado_hasta: "realizada",
        importe_nuevo: 125000,
        author: "Gestor",
        author_role: "admin",
      }),
    );
  });

  it("agente sin comprador inserta vendedor_id de sesión", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "vendedor",
      nombre: "Agente Demo",
      email: "agente@test",
      vendedorId: "V1",
    });
    const row = {
      id: "O2",
      comprador_id: null,
      vendedor_id: "V1",
      asset_id: "A1",
      propuesta_euros: 50000,
      comentarios: null,
      estado: "realizada",
      nda_enviado_at: null,
      nda_firmado_at: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const sb = makeOfertaSupabaseMock({
      asset: { id: "A1" },
      vendedor: { id: "V1" },
      insertRow: row,
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    const out = ofertaCreada(await createOfertaAdmin({
      assetId: "A1",
      propuestaEuros: 50000,
    }));

    expect(out.vendedor_id).toBe("V1");
    expect(out.comprador_id).toBeNull();
    expect(sb.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        comprador_id: null,
        vendedor_id: "V1",
        asset_id: "A1",
        estado: "realizada",
      }),
    );
  });

  it("rechaza la oferta si faltan datos de firma y no inserta", async () => {
    const sb = makeOfertaSupabaseMock({
      asset: { id: "A1" },
      comprador: { id: "C1", apellidos: "", documento: "" },
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        compradorId: "C1",
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Faltan datos para firmar la oferta/) });
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });

  it("guarda en la ficha los datos que completa la oferta y luego inserta", async () => {
    const row = {
      id: "O3",
      comprador_id: "C1",
      vendedor_id: null,
      asset_id: "A1",
      propuesta_euros: 80000,
      comentarios: null,
      estado: "realizada",
      nda_enviado_at: null,
      nda_firmado_at: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const sb = makeOfertaSupabaseMock({
      asset: { id: "A1" },
      comprador: { id: "C1", apellidos: "", documento: "" },
      insertRow: row,
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    const out = ofertaCreada(await createOfertaAdmin({
      compradorId: "C1",
      assetId: "A1",
      propuestaEuros: 80000,
      datos: {
        nombre: "Ana",
        apellidos: "García López",
        tipoPersona: "fisica",
        razonSocial: "",
        documento: "12345678z",
        direccion: "Calle Mayor 1",
        cp: "28001",
        poblacion: "Madrid",
        provincia: "Madrid",
        pais: "España",
        tel: "600111222",
        email: "ana@example.com",
      },
    }));

    expect(out.id).toBe("O3");
    expect(sb.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        apellidos: "García López",
        documento: "12345678Z",
        ini: "AG",
      }),
    );
    expect(sb.spies.insert).toHaveBeenCalled();
  });

  it("lanza error si el activo no existe", async () => {
    const sb = makeOfertaSupabaseMock({ asset: null, comprador: { id: "C1" } });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        compradorId: "C1",
        assetId: "MISSING",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Activo no encontrado/) });
  });

  it("agente sin fila vendedores devuelve error explícito", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "vendedor",
      nombre: "Agente Sin Fila",
      email: "agente@test",
      vendedorId: undefined,
    });
    const sb = makeOfertaSupabaseMock({ asset: { id: "A1" } });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/no tiene una fila vendedores/i) });
  });

  it("agente cuya fila vendedores no existe en DB devuelve error explícito", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "vendedor",
      nombre: "Agente Borrado",
      email: "agente@test",
      vendedorId: "V_NONEXISTENT",
    });
    const sb = makeOfertaSupabaseMock({ asset: { id: "A1" }, vendedor: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/fila vendedores.*no existe/i) });
  });

  it("si el comprador ya tiene oferta en el activo, el mensaje es explícito y no inserta", async () => {
    const sb = makeOfertaSupabaseMock({
      asset: { id: "A1" },
      comprador: { id: "C1" },
      existingOferta: { id: "YA" },
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createOfertaAdmin } = await import("@/app/actions/ofertas");

    await expect(
      createOfertaAdmin({
        compradorId: "C1",
        assetId: "A1",
        propuestaEuros: 1000,
      }),
    ).resolves.toEqual({ ok: false, error: "Este comprador ya tiene una oferta en este activo" });
    expect(sb.spies.insert).not.toHaveBeenCalled();
  });
});
