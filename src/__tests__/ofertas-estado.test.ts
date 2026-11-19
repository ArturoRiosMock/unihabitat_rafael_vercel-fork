import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdminOrVendor = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: vi.fn(async () => requireAdminOrVendor()),
  requireAdminOrVendor: (...args: unknown[]) => requireAdminOrVendor(...args),
  requireAssetAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/email/templates", () => ({
  offerTemplate: vi.fn(() => ({ subject: "oferta", html: "<p>ok</p>", text: "ok" })),
}));

const OFERTA = {
  id: "O1",
  comprador_id: "C1",
  vendedor_id: null as string | null,
  asset_id: "A1",
  propuesta_euros: 100000,
  comentarios: null,
  comentarios_author: null,
  comentarios_author_role: null,
  estado: "realizada",
  nda_enviado_at: null,
  nda_firmado_at: null,
  fecha_firma: null,
  contraoferta_nota: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function mockCambio(opts: {
  oferta?: Record<string, unknown> | null;
  asignadoA?: string | null;
}) {
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const historialInsert = vi.fn(async () => ({ error: null }));
  const oferta = opts.oferta === undefined ? OFERTA : opts.oferta;

  const from = vi.fn((table: string) => {
    if (table === "ofertas") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: oferta, error: null })),
          })),
        })),
        update,
      };
    }
    if (table === "vendedor_compradores") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.asignadoA ? { vendedor_id: opts.asignadoA } : null,
                  error: null,
                })),
              })),
            })),
          })),
        })),
      };
    }
    if (table === "oferta_historial") {
      return { insert: historialInsert };
    }
    return {};
  });

  return { client: { from }, spies: { update, updateEq, historialInsert } };
}

describe("updateOfertaEstado", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminOrVendor.mockReset();
    requireAdminOrVendor.mockResolvedValue({
      role: "admin",
      nombre: "Modesto",
      email: "admin@test",
      vendedorId: null,
    });
  });

  it("rechaza una transición que no está en el circuito", async () => {
    const sb = mockCambio({});
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { updateOfertaEstado } = await import("@/app/actions/ofertas");

    await expect(
      updateOfertaEstado({ ofertaId: "O1", estado: "firmada", fechaFirma: "2026-11-19" }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/No se puede pasar/) });
    expect(sb.spies.update).not.toHaveBeenCalled();
  });

  it("exige la fecha al pasar a firmada", async () => {
    const sb = mockCambio({
      oferta: { ...OFERTA, estado: "pbc_solicitada" },
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { updateOfertaEstado } = await import("@/app/actions/ofertas");

    await expect(
      updateOfertaEstado({ ofertaId: "O1", estado: "firmada" }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/fecha de firma es obligatoria/) });
    expect(sb.spies.update).not.toHaveBeenCalled();
  });

  it("la contraoferta actualiza la misma oferta y el historial lo firma Gestor", async () => {
    const sb = mockCambio({});
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { updateOfertaEstado } = await import("@/app/actions/ofertas");

    await updateOfertaEstado({
      ofertaId: "O1",
      estado: "contraofertada",
      importe: 120000,
      nota: "Subimos la cifra",
    });

    expect(sb.spies.update).toHaveBeenCalledWith(expect.objectContaining({
      estado: "contraofertada",
      propuesta_euros: 120000,
      contraoferta_nota: "Subimos la cifra",
    }));
    expect(sb.spies.updateEq).toHaveBeenCalledWith("id", "O1");
    expect(sb.spies.historialInsert).toHaveBeenCalledWith(expect.objectContaining({
      oferta_id: "O1",
      estado_desde: "realizada",
      estado_hasta: "contraofertada",
      importe_anterior: 100000,
      importe_nuevo: 120000,
      nota: "Subimos la cifra",
      author: "Gestor",
      author_role: "admin",
    }));
  });

  it("un agente no cambia la oferta de un comprador de otro agente", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "vendedor",
      nombre: "Laura",
      email: "laura@test",
      vendedorId: "V1",
    });
    const sb = mockCambio({
      oferta: { ...OFERTA, comprador_id: "C2", vendedor_id: "V2" },
      asignadoA: "V2",
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { updateOfertaEstado } = await import("@/app/actions/ofertas");

    await expect(
      updateOfertaEstado({ ofertaId: "O1", estado: "rechazada" }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/tus compradores/) });
    expect(sb.spies.update).not.toHaveBeenCalled();
  });

  it("un cliente no lee las ofertas de otro comprador", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "cliente",
      nombre: "Ana",
      email: "ana@test",
      vendedorId: null,
      compradorId: "C1",
    });
    const from = vi.fn((table: string) => {
      if (table === "compradores") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "C2", email: "otro@test" },
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`no debería consultar ${table}`);
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({ from })),
      createServiceClient: vi.fn(async () => ({ from })),
    }));
    const { fetchOfertasByComprador } = await import("@/app/actions/ofertas");

    await expect(fetchOfertasByComprador("C2")).rejects.toThrow(/Acceso denegado/);
  });

  it("un agente sí acepta la oferta de su comprador", async () => {
    requireAdminOrVendor.mockResolvedValue({
      role: "vendedor",
      nombre: "Laura",
      email: "laura@test",
      vendedorId: "V1",
    });
    const sb = mockCambio({
      oferta: { ...OFERTA, comprador_id: "C1", vendedor_id: null },
      asignadoA: "V1",
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { updateOfertaEstado } = await import("@/app/actions/ofertas");

    await updateOfertaEstado({ ofertaId: "O1", estado: "aceptada" });
    expect(sb.spies.update).toHaveBeenCalledWith(expect.objectContaining({ estado: "aceptada" }));
    expect(sb.spies.historialInsert).toHaveBeenCalledWith(expect.objectContaining({
      author: "Laura",
      author_role: "vendedor",
      estado_hasta: "aceptada",
    }));
  });
});
