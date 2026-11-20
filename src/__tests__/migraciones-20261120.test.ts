import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sql(nombre: string): string {
  return readFileSync(resolve(process.cwd(), "supabase/migrations", nombre), "utf8");
}

describe("migraciones del 20 nov 2026", () => {
  it("guarda los envíos con canal y el RLS de admin, agente y comprador", () => {
    const texto = sql("20261120a_comprador_envios.sql");
    expect(texto).toContain("create table if not exists public.comprador_envios");
    expect(texto).toContain("canal in ('email', 'whatsapp', 'manual', 'cruce')");
    expect(texto).toContain("public.is_admin()");
    expect(texto).toContain("public.is_vendedor()");
    expect(texto).toContain("v.user_id = auth.uid()");
    expect(texto).toContain("user_id = auth.uid()");
  });

  it("conserva la demanda existente y cambia la clave a id", () => {
    const texto = sql("20261120b_comprador_demandas_historial.sql");
    expect(texto).toContain("set estado = 'activa'");
    expect(texto).toContain("set created_at = coalesce(updated_at, now())");
    expect(texto).toContain("set autor = 'Gestor'");
    expect(texto).toContain("drop constraint");
    expect(texto).toContain("primary key (id)");
    expect(texto).toContain("estado in ('activa', 'archivada')");
    expect(texto).not.toContain("delete from public.comprador_demanda");
  });

  it("añade el seguimiento sin tocar los estados de la oferta", () => {
    const texto = sql("20261120c_oferta_seguimiento.sql");
    expect(texto).toContain("add column if not exists seguimiento text");
    expect(texto).toContain("'pendiente', 'en_seguimiento', 'enviado', 'sin_respuesta'");
    expect(texto).toContain("seguimiento_desde");
    expect(texto).toContain("seguimiento_hasta");
    expect(texto).not.toContain("estado in ('pendiente'");
  });

  it("limita los avisos a dos por semana y guarda los mensajes de WhatsApp", () => {
    const texto = sql("20261120d_whatsapp_avisos.sql");
    expect(texto).toContain("acepta_whatsapp");
    expect(texto).toContain("create table if not exists public.comprador_avisos");
    expect(texto).toContain("if total >= 2 then");
    expect(texto.toLowerCase()).not.toContain("security definer");
    expect(texto).toContain("create table if not exists public.whatsapp_mensajes");
    expect(texto).toContain("whatsapp_mensajes_wamid_uidx");
    expect(texto).toContain("enable row level security");
  });
});
