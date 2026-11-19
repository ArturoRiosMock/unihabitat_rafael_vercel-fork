import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canReadCompradorComentarios,
  planCompradorComentarioInsert,
} from "@/lib/comprador-comentarios";

const getServerSession = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  getServerSession: () => getServerSession(),
}));

const admin = { role: "admin" as const, nombre: "Modesto Manzano", email: "admin@propcrm.com", userId: "user-admin" };
const agent = {
  role: "vendedor" as const,
  nombre: "Agente Uno",
  email: "agente1@propcrm.com",
  userId: "user-agente",
  vendedorId: "V1",
};
const other = { ...agent, nombre: "Otro", userId: "user-otro", vendedorId: "V2" };

describe("acceso a comentarios del comprador", () => {
  it("el admin ve y escribe cualquier comprador, guardando su rol", () => {
    expect(canReadCompradorComentarios({
      role: "admin",
      vendedorId: null,
      assignedVendedorId: "V1",
    })).toBe(true);

    const plan = planCompradorComentarioInsert({
      role: "admin",
      userId: "user-admin",
      nombre: "Modesto Manzano",
      vendedorId: null,
      assignedVendedorId: null,
      compradorId: "C1",
      text: "  Llamada: pide visita  ",
    });
    expect(plan).toEqual({
      ok: true,
      row: {
        comprador_id: "C1",
        author: "Modesto Manzano",
        author_id: "user-admin",
        author_role: "admin",
        text: "Llamada: pide visita",
      },
    });
  });

  it("el agente asignado escribe con su nombre y otro agente no entra", () => {
    expect(canReadCompradorComentarios({
      role: "vendedor",
      vendedorId: "V1",
      assignedVendedorId: "V1",
    })).toBe(true);
    expect(canReadCompradorComentarios({
      role: "vendedor",
      vendedorId: "V2",
      assignedVendedorId: "V1",
    })).toBe(false);

    const plan = planCompradorComentarioInsert({
      role: "vendedor",
      userId: "user-agente",
      nombre: "Agente Uno",
      vendedorId: "V1",
      assignedVendedorId: "V1",
      compradorId: "C1",
      text: "Envié la documentación",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.row.author_role).toBe("vendedor");

    const denied = planCompradorComentarioInsert({
      role: "vendedor",
      userId: "user-otro",
      nombre: "Otro",
      vendedorId: "V2",
      assignedVendedorId: "V1",
      compradorId: "C1",
      text: "no debería",
    });
    expect(denied.ok).toBe(false);
  });

  it("el comprador no lee ni escribe este historial", () => {
    expect(canReadCompradorComentarios({
      role: "cliente",
      vendedorId: null,
      assignedVendedorId: "V1",
    })).toBe(false);
    expect(planCompradorComentarioInsert({
      role: "cliente",
      userId: "user-cli",
      nombre: "Cliente",
      vendedorId: null,
      assignedVendedorId: "V1",
      compradorId: "C1",
      text: "hola",
    }).ok).toBe(false);
  });
});

describe("fetch y alta aplican la regla en el servidor", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerSession.mockReset();
  });

  function client(opts: {
    assigned?: string | null;
    rows?: Array<Record<string, unknown>>;
  }) {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "vendedor_compradores") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: opts.assigned ? { vendedor_id: opts.assigned } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "comprador_comentarios") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: opts.rows ?? [], error: null }),
            }),
          }),
          insert,
        };
      }
      throw new Error(`tabla inesperada ${table}`);
    });
    return { client: { from }, insert };
  }

  it("el admin recibe el comentario como Gestor, el más reciente ya ordenado", async () => {
    getServerSession.mockResolvedValue(admin);
    const sb = client({
      assigned: "V1",
      rows: [
        {
          id: "1",
          comprador_id: "C1",
          author: "Modesto Manzano",
          author_role: "admin",
          text: "Llamada",
          created_at: "2026-11-19T18:00:00.000Z",
        },
      ],
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchCompradorComentarios } = await import("@/app/actions/comprador-comentarios");

    const rows = await fetchCompradorComentarios("C1");

    expect(rows[0]?.author).toBe("Gestor");
    expect(rows[0]?.text).toBe("Llamada");
    expect(JSON.stringify(rows)).not.toContain("Modesto");
  });

  it("un agente que no gestiona el comprador no lee ni escribe", async () => {
    getServerSession.mockResolvedValue(other);
    const sb = client({ assigned: "V1", rows: [] });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { fetchCompradorComentarios, createCompradorComentario } = await import(
      "@/app/actions/comprador-comentarios"
    );

    await expect(fetchCompradorComentarios("C1")).rejects.toThrow(/agente asignado/);
    await expect(createCompradorComentario("C1", "intento")).rejects.toThrow(/agente asignado/);
    expect(sb.insert).not.toHaveBeenCalled();
  });

  it("el agente asignado guarda su nombre y su rol", async () => {
    getServerSession.mockResolvedValue(agent);
    const sb = client({ assigned: "V1" });
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: vi.fn(async () => sb.client),
    }));
    const { createCompradorComentario } = await import("@/app/actions/comprador-comentarios");

    await createCompradorComentario("C1", "Segunda llamada");

    expect(sb.insert).toHaveBeenCalledWith({
      comprador_id: "C1",
      author: "Agente Uno",
      author_id: "user-agente",
      author_role: "vendedor",
      text: "Segunda llamada",
    });
  });
});

describe("migración de comentarios", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261119_comentarios_autor_y_actividad.sql"),
    "utf8",
  );

  it("es idempotente, guarda el rol y limita al agente asignado", () => {
    expect(migration).toContain("add column if not exists author_role");
    expect(migration).toContain("add column if not exists updated_by_name");
    expect(migration).toContain("add column if not exists comentarios_author");
    expect(migration).toContain("create table if not exists public.comprador_comentarios");
    expect(migration).toContain('drop policy if exists "comprador_comentarios_agente_select"');
    expect(migration).toContain("public.is_vendedor()");
    expect(migration).toContain("public.is_admin()");
    expect(migration).toContain("vendedor_compradores");
    expect(migration).not.toMatch(/for select\s+using\s*\(\s*true\s*\)/i);
  });
});
