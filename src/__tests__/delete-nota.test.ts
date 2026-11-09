import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn(async () => ({
  role: "admin" as const,
  nombre: "Admin",
  email: "admin@test",
}));

vi.mock("@/lib/auth-server", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

function makeDeleteClient(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const maybeSingle = vi.fn(async () => result);
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ select }));
  const del = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table !== "notas") throw new Error(`tabla inesperada ${table}`);
    return { delete: del };
  });
  return { client: { from }, spies: { from, del, eq, select } };
}

describe("deleteNota", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({
      role: "admin",
      nombre: "Admin",
      email: "admin@test",
    });
  });

  it("el admin borra la nota indicada en public.notas", async () => {
    const sb = makeDeleteClient({ data: { id: "nota-1" }, error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { deleteNota } = await import("@/app/actions/notas");

    await expect(deleteNota(" nota-1 ")).resolves.toBeUndefined();
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(sb.spies.from).toHaveBeenCalledWith("notas");
    expect(sb.spies.del).toHaveBeenCalledTimes(1);
    expect(sb.spies.eq).toHaveBeenCalledWith("id", "nota-1");
    expect(sb.spies.select).toHaveBeenCalledWith("id");
  });

  it("rechaza un id vacío sin tocar la base", async () => {
    const sb = makeDeleteClient({ data: null, error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { deleteNota } = await import("@/app/actions/notas");

    await expect(deleteNota("   ")).rejects.toThrow("Nota no válida");
    expect(sb.spies.from).not.toHaveBeenCalled();
  });

  it("falla si la nota ya no existe", async () => {
    const sb = makeDeleteClient({ data: null, error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { deleteNota } = await import("@/app/actions/notas");

    await expect(deleteNota("ausente")).rejects.toThrow("Nota no encontrada");
  });

  it("propaga el error de Supabase", async () => {
    const sb = makeDeleteClient({ data: null, error: { message: "permission denied" } });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { deleteNota } = await import("@/app/actions/notas");

    await expect(deleteNota("nota-1")).rejects.toThrow("permission denied");
  });

  it("un agente no borra notas, ni propias ni ajenas", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Acceso denegado: se requiere rol admin"));
    const sb = makeDeleteClient({ data: { id: "nota-ajena" }, error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => sb.client),
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { deleteNota } = await import("@/app/actions/notas");

    await expect(deleteNota("nota-ajena")).rejects.toThrow("Acceso denegado: se requiere rol admin");
    expect(sb.spies.from).not.toHaveBeenCalled();
  });
});

describe("política SQL de borrado de notas", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261109_notas_admin_delete.sql"),
    "utf8",
  );
  const devPolicies = readFileSync(resolve(__dirname, "../../supabase-dev-policies.sql"), "utf8");

  it("solo el admin puede borrar por RLS y la migración es idempotente", () => {
    expect(migration).toContain('drop policy if exists "notas_admin_delete" on public.notas');
    expect(migration).toContain('drop policy if exists "notas_anon_delete" on public.notas');
    expect(migration).toContain('create policy "notas_admin_delete"');
    expect(migration).toContain("for delete");
    expect(migration).toContain("using (public.is_admin())");
    expect(migration).not.toMatch(/for delete\s+using\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/notas_vendedor_delete"\s+on public\.notas\s+for delete/i);
  });

  it("las políticas de desarrollo no abren el DELETE de notas", () => {
    expect(devPolicies).not.toContain("notas_anon_delete");
    expect(devPolicies).toContain("notas_anon_select");
    expect(devPolicies).toContain("notas_anon_insert");
  });
});
