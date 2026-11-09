import { beforeEach, describe, expect, it, vi } from "vitest";
import { INFORMACION_ADICIONAL_MAX, planInformacionAdicionalWrite } from "@/lib/informacion-adicional";

const getServerSession = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSession(),
}));

describe("planInformacionAdicionalWrite", () => {
  it("el admin puede guardar y el agente no", () => {
    expect(planInformacionAdicionalWrite("admin", "  visible para agentes  ")).toEqual({
      ok: true,
      texto: "visible para agentes",
    });
    expect(planInformacionAdicionalWrite("vendedor", "intento").ok).toBe(false);
    expect(planInformacionAdicionalWrite("cliente", "intento").ok).toBe(false);
  });

  it("rechaza un texto por encima del máximo", () => {
    const plan = planInformacionAdicionalWrite("admin", "a".repeat(INFORMACION_ADICIONAL_MAX + 1));
    expect(plan.ok).toBe(false);
  });
});

describe("fetch y save de información adicional", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  function infoClient(row: { texto: string } | null, upsertError: { message: string } | null = null) {
    const upsert = vi.fn(async () => ({ error: upsertError }));
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn((table: string) => {
      if (table !== "asset_informacion_adicional") throw new Error(`tabla inesperada ${table}`);
      return { select: () => ({ eq }), upsert };
    });
    return { client: { from }, upsert, from };
  }

  it("el admin escribe la fila del activo y no toca notas", async () => {
    getServerSession.mockResolvedValue({
      role: "admin",
      nombre: "Ana",
      email: "admin@test",
      userId: "user-admin",
    });
    const sb = infoClient(null);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { saveInformacionAdicional } = await import("@/app/actions/informacion-adicional");

    await saveInformacionAdicional("TEST-DOC-001", "  Dato interno  ");

    expect(sb.from).toHaveBeenCalledWith("asset_informacion_adicional");
    expect(sb.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_id: "TEST-DOC-001",
        texto: "Dato interno",
        updated_by: "user-admin",
      }),
      { onConflict: "asset_id" },
    );
  });

  it("el agente lee el texto pero el backend rechaza la escritura", async () => {
    getServerSession.mockResolvedValue({
      role: "vendedor",
      nombre: "Agente 1",
      email: "agente1@test",
      vendedorId: "vend-1",
    });
    const sb = infoClient({ texto: "Solo lectura" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchInformacionAdicional, saveInformacionAdicional } = await import("@/app/actions/informacion-adicional");

    await expect(fetchInformacionAdicional("TEST-DOC-001")).resolves.toBe("Solo lectura");
    await expect(saveInformacionAdicional("TEST-DOC-001", "cambio")).rejects.toThrow(
      "Solo el administrador puede modificar la información adicional",
    );
    expect(sb.upsert).not.toHaveBeenCalled();
  });

  it("un comprador no lee el cuadro", async () => {
    getServerSession.mockResolvedValue({ role: "cliente", nombre: "Cliente", email: "c@test", compradorId: "comp-1" });
    const sb = infoClient({ texto: "secreto" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchInformacionAdicional } = await import("@/app/actions/informacion-adicional");

    await expect(fetchInformacionAdicional("TEST-DOC-001")).rejects.toThrow("Acceso denegado");
    expect(sb.from).not.toHaveBeenCalled();
  });
});
