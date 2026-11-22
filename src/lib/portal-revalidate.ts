import { revalidatePath, revalidateTag } from "next/cache";

/** Tag compartido por el listado y las fichas públicas. */
export const PUBLIC_PORTAL_TAG = "public-assets";

/**
 * Invalida listado y fichas tras guardar un activo en admin.
 * `revalidateTag` usa el perfil `max` de Next.js 16.
 */
export function revalidatePublicPortal(target?: { slug?: string | null; id?: string | null }): void {
  try {
    revalidateTag(PUBLIC_PORTAL_TAG, "max");
    revalidatePath("/portal");
    revalidatePath("/");
    revalidatePath("/portal/inmueble/[slug]", "page");
    if (target?.slug) revalidatePath(`/portal/inmueble/${target.slug}`);
    if (target?.id) revalidatePath(`/portal/${target.id}`);
  } catch (err) {
    console.warn("[revalidatePublicPortal]", err instanceof Error ? err.message : err);
  }
}
