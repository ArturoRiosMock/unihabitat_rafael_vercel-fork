"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdminOrVendor, requireAssetAccess } from "@/lib/auth-server";
import { nombreCompleto } from "@/lib/comprador-oferta";
import {
  agruparIntereses,
  eventosNdaCompradores,
  filtrarInteresesParaActor,
  type ClienteInteresado,
  type EventoInteres,
} from "@/lib/oferta-workflow";

/**
 * Compradores vinculados al activo: asignación, NDA del activo o favorito.
 * Una fila por comprador. El agente solo recibe los que tiene asignados.
 * La solicitud de información del portal no se guarda en base de datos.
 */
export async function fetchClientesInteresados(assetId: string): Promise<ClienteInteresado[]> {
  const session = await requireAdminOrVendor();
  const id = assetId.trim();
  if (!id) return [];
  await requireAssetAccess(session, id);

  const sb = await createServiceClient();
  const [asignadosRes, favoritosRes, ndaRes] = await Promise.all([
    sb.from("comprador_assets").select("comprador_id, invited_at").eq("asset_id", id),
    sb.from("comprador_favoritos").select("comprador_id, created_at").eq("asset_id", id),
    sb.from("asset_nda_aceptaciones").select("user_id, accepted_at").eq("asset_id", id),
  ]);
  if (asignadosRes.error) throw new Error(asignadosRes.error.message);
  if (favoritosRes.error) throw new Error(favoritosRes.error.message);
  if (ndaRes.error) throw new Error(ndaRes.error.message);

  const userIds = [...new Set(
    (ndaRes.data ?? []).map((row) => row.user_id as string).filter(Boolean),
  )];
  const compradorPorUsuario = new Map<string, string>();
  if (userIds.length > 0) {
    const { data, error } = await sb.from("compradores").select("id, user_id").in("user_id", userIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const userId = row.user_id as string | null;
      if (userId) compradorPorUsuario.set(userId, row.id as string);
    }
  }

  const eventos: EventoInteres[] = [];
  for (const row of asignadosRes.data ?? []) {
    eventos.push({
      compradorId: row.comprador_id as string,
      origen: "asignado",
      fecha: (row.invited_at as string) || "",
    });
  }
  for (const row of favoritosRes.data ?? []) {
    eventos.push({
      compradorId: row.comprador_id as string,
      origen: "favorito",
      fecha: (row.created_at as string) || "",
    });
  }
  eventos.push(...eventosNdaCompradores(
    (ndaRes.data ?? []).map((row) => ({
      userId: row.user_id as string,
      acceptedAt: (row.accepted_at as string) || "",
    })),
    compradorPorUsuario,
  ));

  const compradorIds = [...new Set(eventos.map((evento) => evento.compradorId).filter(Boolean))];
  const asignacion = new Map<string, string | null>();
  for (const compradorId of compradorIds) asignacion.set(compradorId, null);

  const agenteNombre = new Map<string, string>();
  if (compradorIds.length > 0) {
    const { data, error } = await sb
      .from("vendedor_compradores")
      .select("comprador_id, vendedor_id, assigned_at")
      .in("comprador_id", compradorIds)
      .order("assigned_at", { ascending: false });
    if (error) throw new Error(error.message);
    const vendedorIds = new Set<string>();
    for (const row of data ?? []) {
      const compradorId = row.comprador_id as string;
      if (asignacion.get(compradorId)) continue;
      const vendedorId = row.vendedor_id as string;
      asignacion.set(compradorId, vendedorId);
      vendedorIds.add(vendedorId);
    }
    if (vendedorIds.size > 0) {
      const { data: vendedores, error: vendErr } = await sb
        .from("vendedores")
        .select("id, nombre")
        .in("id", [...vendedorIds]);
      if (vendErr) throw new Error(vendErr.message);
      const nombrePorVendedor = new Map(
        (vendedores ?? []).map((row) => [row.id as string, ((row.nombre as string | null) ?? "").trim()]),
      );
      for (const [compradorId, vendedorId] of asignacion) {
        if (!vendedorId) continue;
        const nombre = nombrePorVendedor.get(vendedorId);
        if (nombre) agenteNombre.set(compradorId, nombre);
      }
    }
  }

  const visibles = filtrarInteresesParaActor(
    eventos,
    { role: session.role, vendedorId: session.vendedorId ?? null },
    asignacion,
  );
  const agrupados = agruparIntereses(visibles);
  if (agrupados.length === 0) return [];

  const { data: compradores, error: compErr } = await sb
    .from("compradores")
    .select("id, nombre, apellidos, agente")
    .in("id", agrupados.map((item) => item.compradorId));
  if (compErr) throw new Error(compErr.message);
  const ficha = new Map((compradores ?? []).map((row) => [row.id as string, row]));

  return agrupados.map((item) => {
    const row = ficha.get(item.compradorId);
    const nombre = nombreCompleto(
      row?.nombre as string | undefined,
      row?.apellidos as string | undefined,
    ) || item.compradorId;
    const agenteTexto = ((row?.agente as string | undefined) ?? "").trim();
    return {
      compradorId: item.compradorId,
      nombre,
      agente: agenteNombre.get(item.compradorId) || agenteTexto || "Gestor",
      fecha: item.fecha,
      origenes: item.origenes,
    };
  });
}
