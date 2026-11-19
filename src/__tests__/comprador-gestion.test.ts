import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  GESTION_WARNING_DAYS,
  GESTION_WINDOW_MS,
  REASIGNACION_COMENTARIO,
  asignacionReiniciaPlazo,
  canDeleteComprador,
  canReadComprador,
  canReassignComprador,
  canWriteComprador,
  cronRequestAuthorized,
  debeReasignar,
  diasRestantesGestion,
  esAvisoGestion,
  eventoRenuevaGestion,
  planCompradorCreate,
  planCompradorUpdate,
  planReasignacion,
  plazoGestion,
} from "@/lib/comprador-gestion";

const agente1 = { role: "vendedor" as const, vendedorId: "agente-1" };
const agente2 = { role: "vendedor" as const, vendedorId: "agente-2" };
const admin = { role: "admin" as const, vendedorId: null };
const cliente = { role: "cliente" as const, vendedorId: null };

const alta = new Date("2026-01-01T00:00:00.000Z");

function despues(ms: number): Date {
  return new Date(alta.getTime() + ms);
}

describe("permisos de compradores: agente, otro agente y admin", () => {
  it("el agente lee y edita solo el comprador que tiene asignado", () => {
    expect(canReadComprador(agente1, "agente-1")).toBe(true);
    expect(canWriteComprador(agente1, "agente-1")).toBe(true);
    expect(canReassignComprador(agente1)).toBe(false);
    expect(canDeleteComprador(agente1)).toBe(false);

    const edit = planCompradorUpdate(agente1, "agente-1", { tel: "600111222" });
    expect(edit.ok).toBe(true);
    if (edit.ok) {
      expect(edit.patch.tel).toBe("600111222");
      expect(edit.renewsGestion).toBe(true);
    }

    const acceso = planCompradorUpdate(agente1, "agente-1", { acceso: "activo" });
    expect(acceso).toEqual({
      ok: false,
      error: "Solo el gestor puede reasignar o cambiar el acceso al portal",
    });
  });

  it("otro agente no lee ni escribe ese comprador", () => {
    expect(canReadComprador(agente2, "agente-1")).toBe(false);
    expect(canWriteComprador(agente2, "agente-1")).toBe(false);
    expect(planCompradorUpdate(agente2, "agente-1", { nombre: "Otro" })).toEqual({
      ok: false,
      error: "Solo el agente asignado puede editar este comprador",
    });
    expect(eventoRenuevaGestion({
      evento: "comentario",
      actor: agente2,
      assignedVendedorId: "agente-1",
    })).toBe(false);
    expect(eventoRenuevaGestion({
      evento: "oferta",
      actor: agente2,
      assignedVendedorId: "agente-1",
      compradorId: "TEST-COMP-001",
    })).toBe(false);
  });

  it("el admin lee, edita y reasigna cualquiera, y su edición no reinicia el plazo", () => {
    expect(canReadComprador(admin, "agente-1")).toBe(true);
    expect(canReadComprador(admin, null)).toBe(true);
    expect(canWriteComprador(admin, null)).toBe(true);
    expect(canReassignComprador(admin)).toBe(true);
    expect(canDeleteComprador(admin)).toBe(true);

    const edit = planCompradorUpdate(admin, "agente-1", { nombre: "Ana", acceso: "activo" });
    expect(edit.ok).toBe(true);
    if (edit.ok) {
      expect(edit.patch).toEqual({ nombre: "Ana", acceso: "activo" });
      expect(edit.renewsGestion).toBe(false);
    }
    expect(eventoRenuevaGestion({
      evento: "comentario",
      actor: admin,
      assignedVendedorId: "agente-1",
    })).toBe(false);
  });

  it("el cliente no entra en la ficha interna", () => {
    expect(canReadComprador(cliente, "agente-1")).toBe(false);
    expect(canWriteComprador(cliente, null)).toBe(false);
    expect(canReassignComprador(cliente)).toBe(false);
  });

  it("el alta del agente queda asignada a él y sin acceso al portal", () => {
    const plan = planCompradorCreate(agente1, {
      nombre: "  Nuevo Lead ",
      email: "Lead@Example.com",
      acceso: "activo",
      agente: "Admin",
    }, "Agente Uno");
    expect(plan).toEqual({
      ok: true,
      nombre: "Nuevo Lead",
      apellidos: "",
      email: "lead@example.com",
      acceso: "sin_acceso",
      assignVendedorId: "agente-1",
      agenteNombre: "Agente Uno",
      renewsGestion: true,
    });
    expect(eventoRenuevaGestion({
      evento: "alta",
      actor: agente1,
      assignedVendedorId: null,
    })).toBe(true);
  });

  it("el admin puede crear con acceso y sin asignar agente", () => {
    const plan = planCompradorCreate(admin, {
      nombre: "Portal",
      email: "portal@example.com",
      acceso: "activo",
    }, "Administrador");
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.acceso).toBe("activo");
      expect(plan.assignVendedorId).toBeNull();
      expect(plan.agenteNombre).toBe("Admin");
      expect(plan.renewsGestion).toBe(false);
    }
  });

  it("el cron solo corre con el secreto exacto", () => {
    expect(cronRequestAuthorized(null, undefined)).toBe(false);
    expect(cronRequestAuthorized("Bearer secreto", undefined)).toBe(false);
    expect(cronRequestAuthorized("Bearer otro", "secreto")).toBe(false);
    expect(cronRequestAuthorized("secreto", "secreto")).toBe(false);
    expect(cronRequestAuthorized("Bearer secreto", "secreto")).toBe(true);
  });
});

describe("cálculo de 90 días y reasignación al gestor", () => {
  it("a los 89 días no reasigna y avisa cuando faltan menos de 15", () => {
    const ahora = despues(89 * DAY_MS);
    expect(diasRestantesGestion(alta, ahora)).toBe(1);
    expect(debeReasignar(alta, ahora, true)).toBe(false);
    expect(esAvisoGestion(alta, ahora, true)).toBe(true);
    expect(planReasignacion([{
      id: "TEST-COMP-001",
      assignedVendedorId: "agente-1",
      ultimaGestionAgenteAt: alta.toISOString(),
    }], ahora)).toEqual([]);
  });

  it("con 15 días exactos no hay aviso; con menos de 15 sí", () => {
    const justo = despues(GESTION_WINDOW_MS - GESTION_WARNING_DAYS * DAY_MS);
    expect(diasRestantesGestion(alta, justo)).toBe(15);
    expect(esAvisoGestion(alta, justo, true)).toBe(false);

    const dentro = despues(GESTION_WINDOW_MS - GESTION_WARNING_DAYS * DAY_MS + 1);
    expect(esAvisoGestion(alta, dentro, true)).toBe(true);
    expect(plazoGestion(alta.toISOString(), true, dentro).warning).toBe(true);
  });

  it("a los 90 días el comprador pasa al gestor con comentario de auditoría", () => {
    const ahora = despues(GESTION_WINDOW_MS);
    expect(diasRestantesGestion(alta, ahora)).toBe(0);
    expect(debeReasignar(alta, ahora, true)).toBe(true);
    expect(planReasignacion([
      {
        id: "TEST-COMP-001",
        assignedVendedorId: "agente-1",
        ultimaGestionAgenteAt: alta.toISOString(),
      },
      {
        id: "RECIENTE",
        assignedVendedorId: "agente-1",
        ultimaGestionAgenteAt: despues(DAY_MS).toISOString(),
      },
      {
        id: "YA-GESTOR",
        assignedVendedorId: null,
        ultimaGestionAgenteAt: alta.toISOString(),
      },
      {
        id: "SIN-FECHA",
        assignedVendedorId: "agente-2",
        ultimaGestionAgenteAt: null,
      },
    ], ahora)).toEqual([{
      compradorId: "TEST-COMP-001",
      comentario: REASIGNACION_COMENTARIO,
      agente: "Admin",
      desasignar: true,
    }]);
  });

  it("sin agente asignado no reasigna aunque la fecha sea antigua", () => {
    expect(debeReasignar(alta, despues(GESTION_WINDOW_MS + DAY_MS), false)).toBe(false);
    expect(plazoGestion(alta.toISOString(), false, despues(GESTION_WINDOW_MS)).days).toBeNull();
  });

  it("una gestión del agente asignado reinicia el plazo; la del admin no", () => {
    expect(eventoRenuevaGestion({
      evento: "edicion",
      actor: agente1,
      assignedVendedorId: "agente-1",
    })).toBe(true);
    expect(eventoRenuevaGestion({
      evento: "comentario",
      actor: agente1,
      assignedVendedorId: "agente-1",
    })).toBe(true);
    expect(eventoRenuevaGestion({
      evento: "oferta",
      actor: agente1,
      assignedVendedorId: "agente-1",
      compradorId: "TEST-COMP-001",
    })).toBe(true);
    expect(eventoRenuevaGestion({
      evento: "oferta",
      actor: agente1,
      assignedVendedorId: "agente-1",
      compradorId: null,
    })).toBe(false);
    expect(eventoRenuevaGestion({
      evento: "edicion",
      actor: admin,
      assignedVendedorId: "agente-1",
    })).toBe(false);

    const gestion = despues(10 * DAY_MS);
    expect(diasRestantesGestion(gestion, despues(20 * DAY_MS))).toBe(80);
    expect(debeReasignar(gestion, despues(20 * DAY_MS), true)).toBe(false);
  });

  it("reasignar a otro agente abre un plazo nuevo; quitarlo lo deja en el gestor", () => {
    expect(asignacionReiniciaPlazo("agente-1", "agente-2")).toBe(true);
    expect(asignacionReiniciaPlazo("agente-1", "agente-1")).toBe(false);
    expect(asignacionReiniciaPlazo("agente-1", null)).toBe(false);
    expect(asignacionReiniciaPlazo(null, "agente-1")).toBe(true);
  });
});

describe("migración de la última gestión", () => {
  const migration = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261119c_compradores_gestion_agente.sql"),
    "utf8",
  );

  it("es idempotente, no reasigna filas existentes y deja la función de 90 días", () => {
    expect(migration).toContain("add column if not exists ultima_gestion_agente_at");
    expect(migration).toContain("add column if not exists reasignado_inactividad_at");
    expect(migration).toContain("set ultima_gestion_agente_at = now()");
    expect(migration).toContain("where ultima_gestion_agente_at is null");
    expect(migration).toContain("create or replace function public.reasignar_compradores_inactivos");
    expect(migration).toContain("interval '90 days'");
    expect(migration).toContain(REASIGNACION_COMENTARIO);
    expect(migration).toContain("agente = 'Admin'");
    expect(migration).toContain("delete from public.vendedor_compradores");
    expect(migration).toContain("service_role");
    expect(migration).not.toMatch(/truncate\s+(table\s+)?public\.compradores/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.compradores/i);
  });
});
