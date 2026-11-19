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

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/email/templates", () => ({
  offerTemplate: vi.fn(() => ({ subject: "oferta", html: "<p>ok</p>", text: "ok" })),
}));

/**
 * Mock Supabase service client for createOfertaAdmin:
 * assets/compradores/vendedores lookup via maybeSingle, insert via select().single().
 */
function makeOfertaSupabaseMock(opts: {
  asset?: { id: string } | null;
  comprador?: { id: string } | null;
  vendedor?: { id: string } | null;
  insertRow?: Record<string, unknown>;
  insertError?: { message: string } | null;
}) {
  const insertSingle = vi.fn(async () => ({
    data: opts.insertError ? null : (opts.insertRow ?? null),
    error: opts.insertError ?? null,
  }));
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

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
              data: opts.comprador === undefined ? { id: "C1" } : opts.comprador,
              error: null,
            })),
          })),
        })),
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
      return { insert };
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

  return { client: { from }, spies: { from, insert, insertSingle } };
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
    ).rejects.toThrow(/No autorizado/);
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
    ).rejects.toThrow(/mayor que 0/);
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
    ).rejects.toThrow(/Selecciona un comprador/);
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
      estado: "pendiente",
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

    const out = await createOfertaAdmin({
      compradorId: "C1",
      assetId: "A1",
      propuestaEuros: 125000,
      comentarios: "nota",
    });

    expect(out.estado).toBe("pendiente");
    expect(out.id).toBe("O1");
    expect(sb.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        comprador_id: "C1",
        vendedor_id: null,
        asset_id: "A1",
        propuesta_euros: 125000,
        estado: "pendiente",
        comentarios: "nota",
        comentarios_author: "Admin",
        comentarios_author_role: "admin",
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
      estado: "pendiente",
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

    const out = await createOfertaAdmin({
      assetId: "A1",
      propuestaEuros: 50000,
    });

    expect(out.vendedor_id).toBe("V1");
    expect(out.comprador_id).toBeNull();
    expect(sb.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        comprador_id: null,
        vendedor_id: "V1",
        asset_id: "A1",
        estado: "pendiente",
      }),
    );
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
    ).rejects.toThrow(/Activo no encontrado/);
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
    ).rejects.toThrow(/no tiene una fila vendedores/i);
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
    ).rejects.toThrow(/fila vendedores.*no existe/i);
  });
});
