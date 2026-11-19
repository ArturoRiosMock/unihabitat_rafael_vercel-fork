"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createNotificacion } from "@/app/actions/notificaciones";
import { nombreCompleto } from "@/lib/comprador-oferta";

export async function fetchFavoritosByComprador(compradorId: string): Promise<string[]> {
  if (!compradorId) return [];
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("comprador_favoritos")
    .select("asset_id")
    .eq("comprador_id", compradorId);
  if (error) {
    console.error("[fetchFavoritosByComprador]", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.asset_id);
}

export async function addFavorito(
  compradorId: string,
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!compradorId || !assetId) {
    return { success: false, error: "compradorId y assetId son obligatorios" };
  }
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("comprador_favoritos")
    .upsert(
      { comprador_id: compradorId, asset_id: assetId },
      { onConflict: "comprador_id,asset_id" },
    );
  if (error) return { success: false, error: error.message };

  // Notificar admin / agente asignado (best-effort).
  try {
    const [{ data: comp }, { data: agentLink }] = await Promise.all([
      supabase.from("compradores").select("nombre, apellidos, email, agente").eq("id", compradorId).maybeSingle(),
      supabase.from("vendedor_compradores").select("vendedor_id").eq("comprador_id", compradorId).maybeSingle(),
    ]);
    const nombre = nombreCompleto(comp?.nombre as string | undefined, comp?.apellidos as string | undefined) || compradorId;
    const mensaje = `${nombre} marcó como favorito el activo ${assetId}`;

    if (agentLink?.vendedor_id) {
      const { data: vend } = await supabase
        .from("vendedores")
        .select("user_id, email, nombre")
        .eq("id", agentLink.vendedor_id)
        .maybeSingle();
      if (vend?.user_id || vend?.email) {
        await createNotificacion({
          userId: vend.user_id ?? undefined,
          tipo: "favorito",
          mensaje,
          referenciaId: assetId,
          email: vend.email ?? undefined,
          recipientName: vend.nombre ?? undefined,
        });
      }
    } else {
      // Fallback: notificar a admins vía EMAIL_SUPPORT mirror (sin userId).
      await createNotificacion({
        tipo: "favorito",
        mensaje,
        referenciaId: assetId,
      });
    }
  } catch (err) {
    console.warn("[addFavorito] notificación falló:", err);
  }

  return { success: true };
}

export async function removeFavorito(
  compradorId: string,
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!compradorId || !assetId) {
    return { success: false, error: "compradorId y assetId son obligatorios" };
  }
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("comprador_favoritos")
    .delete()
    .eq("comprador_id", compradorId)
    .eq("asset_id", assetId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
