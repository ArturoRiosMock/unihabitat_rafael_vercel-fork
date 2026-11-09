import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canReadNota, planNotaInsert } from "@/lib/nota-visibility";

const getServerSession = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSession(),
  requireAdmin: vi.fn(),
}));

const agent = { role: "vendedor" as const, nombre: "Lucía Agent", userId: "user-lucia", compradorId: null };
const other = { role: "vendedor" as const, nombre: "Otro", userId: "user-otro", compradorId: null };
const admin = { role: "admin" as const, nombre: "Ana Admin", userId: "user-admin", compradorId: null };
const buyer = { role: "cliente" as const, nombre: "Cliente", userId: "user-cli", compradorId: "comp-1" };

describe("canReadNota", () => {
  it("el admin ve las notas de activo de cualquier agente, con autor", () => {
    const row = { author: "Lucía Agent", author_id: "user-lucia", scope: "activo", comprador_id: null };
    expect(canReadNota(admin, row, { scope: "activo" })).toBe(true);
  });

  it("el admin ve las notas privadas y el agente no, ni aunque sea el autor", () => {
    const row = { author: "Ana Admin", author_id: "user-admin", scope: "privada", comprador_id: null };
    expect(canReadNota(admin, row, { scope: "privada" })).toBe(true);
    expect(canReadNota(admin, row, { scope: "activo" })).toBe(false);
    expect(canReadNota(agent, row, { scope: "privada" })).toBe(false);
    expect(canReadNota({ ...agent, userId: "user-admin", nombre: "Ana Admin" }, row, { scope: "activo" })).toBe(false);
  });

  it("el agente solo ve las notas de activo que creó", () => {
    const own = { author: "Lucía Agent", author_id: "user-lucia", scope: "activo", comprador_id: null };
    const legacy = { author: "Lucía Agent", author_id: null, scope: "activo", comprador_id: null };
    const ajena = { author: "Otro", author_id: "user-otro", scope: "activo", comprador_id: null };
    const spoof = { author: "Lucía Agent", author_id: "user-otro", scope: "activo", comprador_id: null };
    const buyerNote = { author: "Cliente", author_id: null, scope: "activo", comprador_id: "comp-1" };

    expect(canReadNota(agent, own, { scope: "activo" })).toBe(true);
    expect(canReadNota(agent, legacy, { scope: "activo" })).toBe(true);
    expect(canReadNota(agent, ajena, { scope: "activo" })).toBe(false);
    expect(canReadNota(agent, spoof, { scope: "activo" })).toBe(false);
    expect(canReadNota(agent, buyerNote, { scope: "activo" })).toBe(false);
    expect(canReadNota(other, own, { scope: "activo" })).toBe(false);
  });

  it("el comprador solo ve sus notas del portal", () => {
    const own = { author: "Cliente", author_id: "user-cli", scope: "activo", comprador_id: "comp-1" };
    const otherBuyer = { author: "Otro", author_id: null, scope: "activo", comprador_id: "comp-2" };
    const assetNote = { author: "Lucía Agent", author_id: "user-lucia", scope: "activo", comprador_id: null };

    expect(canReadNota(buyer, own, { scope: "activo", compradorId: "comp-1" })).toBe(true);
    expect(canReadNota(buyer, otherBuyer, { scope: "activo", compradorId: "comp-2" })).toBe(false);
    expect(canReadNota(buyer, assetNote, { scope: "activo" })).toBe(false);
  });
});

describe("planNotaInsert", () => {
  it("un agente no escribe notas privadas ni suplanta el autor", () => {
    const denied = planNotaInsert({
      role: "vendedor",
      userId: "user-lucia",
      nombre: "Lucía Agent",
      compradorId: null,
      assetId: "A1",
      scope: "privada",
      text: "secreto",
    });
    expect(denied.ok).toBe(false);

    const created = planNotaInsert({
      role: "vendedor",
      userId: "user-lucia",
      nombre: "Lucía Agent",
      compradorId: null,
      assetId: "A1",
      scope: "activo",
      text: "  la mía  ",
    });
    expect(created).toEqual({
      ok: true,
      row: {
        asset_id: "A1",
        comprador_id: null,
        author: "Lucía Agent",
        author_id: "user-lucia",
        scope: "activo",
        text: "la mía",
      },
    });
  });

  it("la nota privada queda marcada y sin comprador", () => {
    const created = planNotaInsert({
      role: "admin",
      userId: "user-admin",
      nombre: "Ana Admin",
      compradorId: null,
      assetId: "A1",
      requestedCompradorId: "comp-1",
      scope: "privada",
      text: "solo admin",
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.row.scope).toBe("privada");
      expect(created.row.comprador_id).toBeNull();
      expect(created.row.author).toBe("Ana Admin");
    }
  });
});

describe("fetchNotas y createNota aplican la regla en el servidor", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  function notesClient(rows: Array<Record<string, unknown>>) {
    const eq = vi.fn();
    const is = vi.fn();
    const builder = {
      eq: (...args: unknown[]) => {
        eq(...args);
        return builder;
      },
      is: (...args: unknown[]) => {
        is(...args);
        return builder;
      },
      order: vi.fn(async () => ({ data: rows, error: null })),
    };
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table !== "notas") throw new Error(`tabla inesperada ${table}`);
      return { select: () => builder, insert };
    });
    return { client: { from }, spies: { from, eq, is, insert } };
  }

  it("un agente no recibe las notas de otro agente", async () => {
    getServerSession.mockResolvedValue(agent);
    const sb = notesClient([
      { id: "1", author: "Lucía Agent", author_id: "user-lucia", scope: "activo", comprador_id: null, text: "mía", asset_id: "A1", created_at: "2026-01-01" },
      { id: "2", author: "Otro", author_id: "user-otro", scope: "activo", comprador_id: null, text: "ajena", asset_id: "A1", created_at: "2026-01-02" },
    ]);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchNotas } = await import("@/app/actions/notas");

    const rows = await fetchNotas({ assetId: "A1", scope: "activo" });

    expect(rows.map((row) => row.id)).toEqual(["1"]);
    expect(sb.spies.eq).toHaveBeenCalledWith("scope", "activo");
    expect(sb.spies.is).toHaveBeenCalledWith("comprador_id", null);
  });

  it("un agente no lee las notas privadas", async () => {
    getServerSession.mockResolvedValue(agent);
    const sb = notesClient([]);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchNotas } = await import("@/app/actions/notas");

    await expect(fetchNotas({ assetId: "A1", scope: "privada" })).resolves.toEqual([]);
    expect(sb.spies.from).not.toHaveBeenCalled();
  });

  it("el admin recibe todas las notas de activo del inmueble", async () => {
    getServerSession.mockResolvedValue(admin);
    const sb = notesClient([
      { id: "1", author: "Lucía Agent", author_id: "user-lucia", scope: "activo", comprador_id: null, text: "a", asset_id: "A1", created_at: "2026-01-01" },
      { id: "2", author: "Otro", author_id: "user-otro", scope: "activo", comprador_id: null, text: "b", asset_id: "A1", created_at: "2026-01-02" },
    ]);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchNotas } = await import("@/app/actions/notas");

    const rows = await fetchNotas({ assetId: "A1" });
    expect(rows.map((row) => row.author)).toEqual(["Lucía Agent", "Otro"]);
  });

  it("createNota guarda el autor de la sesión y el alcance privado", async () => {
    getServerSession.mockResolvedValue(admin);
    const sb = notesClient([]);
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createNota } = await import("@/app/actions/notas");

    await createNota({
      assetId: "A1",
      author: "Suplantado",
      text: "nota interna",
      scope: "privada",
    });

    expect(sb.spies.insert).toHaveBeenCalledWith({
      asset_id: "A1",
      comprador_id: null,
      author: "Ana Admin",
      author_id: "user-admin",
      scope: "privada",
      text: "nota interna",
    });
  });
});

describe("política SQL de lectura de notas", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261109_notas_select_visibilidad.sql"),
    "utf8",
  );

  it("restringe el SELECT y no toca el DELETE de admin", () => {
    expect(migration).toContain('drop policy if exists "notas_agente_select" on public.notas');
    expect(migration).toContain('drop policy if exists "notas_anon_select" on public.notas');
    expect(migration).toContain('create policy "notas_agente_select"');
    expect(migration).toContain('create policy "notas_comprador_select"');
    expect(migration).toContain("for select");
    expect(migration).toContain("public.is_vendedor()");
    expect(migration).toContain("public.nota_visible_para_agente(author_id, author)");
    expect(migration).toContain("scope = 'activo'");
    expect(migration).toContain("comprador_id is null");
    expect(migration).toContain("auth.uid()");
    expect(migration).not.toContain('drop policy if exists "notas_admin_delete"');
    expect(migration).not.toMatch(/create policy "[^"]+"\s+on public\.notas\s+for delete/i);
    expect(migration).not.toMatch(/for select\s+using\s*\(\s*true\s*\)/i);
  });
});
