"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-server";
import { createNotificacion } from "@/app/actions/notificaciones";
import { sendEmail } from "@/lib/email/send";
import { assetSharedTemplate } from "@/lib/email/templates";
import { getPublicAppOrigin } from "@/lib/app-public-url";
import { getDeudaTotal, fmt } from "@/lib/utils";
import { assetPortalHref } from "@/lib/public-slug";
import { rowToAsset } from "@/lib/supabase/db";
import { nombreCompleto } from "@/lib/comprador-oferta";

export interface CompradorAssetRow {
  comprador_id: string;
  asset_id: string;
  invited_at: string;
  invited_by: string;
}

export async function inviteCompradorToAsset(
  compradorId: string,
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("comprador_assets")
    .upsert(
      { comprador_id: compradorId, asset_id: assetId, invited_by: "Admin" },
      { onConflict: "comprador_id,asset_id" },
    );
  if (error) return { success: false, error: error.message };

  try {
    const { data: comp } = await supabase
      .from("compradores")
      .select("nombre, apellidos, email, user_id")
      .eq("id", compradorId)
      .maybeSingle();

    const { data: assetRow } = await supabase
      .from("assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();

    const nombre = nombreCompleto(comp?.nombre as string | undefined, comp?.apellidos as string | undefined) || compradorId;
    const asset = assetRow ? rowToAsset(assetRow) : null;
    const lugar = asset ? [asset.pob, asset.prov].filter(Boolean).join(", ") : assetId;
    const tipologia = asset?.tip || undefined;
    const precioLabel = asset?.precio != null && asset.precio > 0 ? fmt(asset.precio) : undefined;
    const deuda = asset ? getDeudaTotal(asset) : null;
    const deudaLabel = deuda != null && deuda > 0 ? fmt(deuda) : undefined;

    let userId: string | null = (comp?.user_id as string | null) ?? null;
    const compEmail = ((comp?.email as string | undefined) ?? "").trim().toLowerCase();
    if (!userId && compEmail) {
      try {
        const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        const u = data?.users?.find((x) => (x.email || "").toLowerCase() === compEmail);
        userId = u?.id ?? null;
        if (userId) {
          await supabase
            .from("compradores")
            .update({ user_id: userId })
            .eq("id", compradorId);
        }
      } catch {
        /* admin API caída */
      }
    }

    const origin = getPublicAppOrigin();
    const path = asset ? assetPortalHref(asset) : `/portal/${encodeURIComponent(assetId)}`;
    const actionUrl = `${origin}${path}`;

    // Email dedicado con ficha del activo (no mirror genérico de bienvenida).
    if (compEmail) {
      const tpl = assetSharedTemplate({
        recipientName: nombre,
        assetId,
        lugar,
        tipologia,
        precioLabel,
        deudaLabel,
        actionUrl,
      });
      await sendEmail({ to: compEmail, ...tpl });
    }

    await createNotificacion({
      userId: userId ?? undefined,
      tipo: "invitacion",
      mensaje: `${nombre}, se te ha compartido un activo en ${lugar}`,
      referenciaId: assetId,
      email: undefined,
      recipientName: nombre,
    });
  } catch (err) {
    console.warn("[inviteCompradorToAsset] email/notif best-effort failed:", err);
  }

  return { success: true };
}

export async function revokeCompradorFromAsset(
  compradorId: string,
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from("comprador_assets")
    .delete()
    .eq("comprador_id", compradorId)
    .eq("asset_id", assetId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function fetchInvitedCompradores(
  assetId: string,
): Promise<{ compradorId: string; invitedAt: string }[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("comprador_assets")
    .select("comprador_id, invited_at")
    .eq("asset_id", assetId)
    .order("invited_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => ({
    compradorId: r.comprador_id,
    invitedAt: r.invited_at,
  }));
}

export async function fetchInvitedAssetIds(
  compradorId: string,
): Promise<string[]> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("comprador_assets")
    .select("asset_id")
    .eq("comprador_id", compradorId);
  if (error) return [];
  return (data ?? []).map((r) => r.asset_id);
}
