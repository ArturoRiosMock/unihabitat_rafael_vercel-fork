"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { VendorPermission, SectionId } from "@/lib/permissions";
import { defaultVendorPermissions } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth-server";

export async function fetchVendorPermissions(
  vendedorId: string,
): Promise<VendorPermission[]> {
  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("vendedor_permissions")
    .select("*")
    .eq("vendedor_id", vendedorId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return defaultVendorPermissions();

  const defaults = defaultVendorPermissions();
  const map = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.map((r: any) => [r.section as SectionId, { section: r.section as SectionId, canView: r.can_view ?? false, canEdit: r.can_edit ?? false }]),
  );
  return defaults.map((d) => {
    const row = map.get(d.section) ?? d;
    if (row.section === "compradores") return { ...row, canView: true, canEdit: true };
    return row;
  });
}

export async function upsertVendorPermissions(
  vendedorId: string,
  permissions: VendorPermission[],
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const rows = permissions.map((p) => ({
    vendedor_id: vendedorId,
    section: p.section,
    can_view: p.canView,
    can_edit: p.canEdit,
  }));

  const { error } = await sb
    .from("vendedor_permissions")
    .upsert(rows, { onConflict: "vendedor_id,section" });
  if (error) throw new Error(error.message);
}

export async function fetchVendorAssignedAssetIds(
  vendedorId: string,
): Promise<string[]> {
  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("vendedor_assets")
    .select("asset_id")
    .eq("vendedor_id", vendedorId);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.asset_id);
}

export async function fetchVendorAssignedCompradorIds(
  vendedorId: string,
): Promise<string[]> {
  const sb = await createServiceClient();
  const { data, error } = await sb
    .from("vendedor_compradores")
    .select("comprador_id")
    .eq("vendedor_id", vendedorId);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.comprador_id);
}

export async function assignAssetToVendor(
  vendedorId: string,
  assetId: string,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const { error } = await sb
    .from("vendedor_assets")
    .upsert({ vendedor_id: vendedorId, asset_id: assetId }, { onConflict: "vendedor_id,asset_id" });
  if (error) throw new Error(error.message);
}

export async function unassignAssetFromVendor(
  vendedorId: string,
  assetId: string,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const { error } = await sb
    .from("vendedor_assets")
    .delete()
    .eq("vendedor_id", vendedorId)
    .eq("asset_id", assetId);
  if (error) throw new Error(error.message);
}

export async function assignCompradorToVendor(
  vendedorId: string,
  compradorId: string,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const { error } = await sb
    .from("vendedor_compradores")
    .upsert({ vendedor_id: vendedorId, comprador_id: compradorId }, { onConflict: "vendedor_id,comprador_id" });
  if (error) throw new Error(error.message);
}

export async function unassignCompradorFromVendor(
  vendedorId: string,
  compradorId: string,
): Promise<void> {
  await requireAdmin();
  const sb = await createServiceClient();
  const { error } = await sb
    .from("vendedor_compradores")
    .delete()
    .eq("vendedor_id", vendedorId)
    .eq("comprador_id", compradorId);
  if (error) throw new Error(error.message);
}
