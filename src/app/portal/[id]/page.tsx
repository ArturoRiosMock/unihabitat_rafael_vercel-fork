import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { publicAssetPath } from "@/lib/public-slug";
import { getCachedPublicFichaById } from "@/lib/portal-public-asset";
import PortalDetailClient from "./PortalDetailClient";

export const revalidate = 300;

/**
 * Ruta legacy `/portal/{id}` → redirige a `/portal/inmueble/{slug}` canónico.
 * Si aún no hay slug (migración pendiente), renderiza la ficha como fallback.
 */
export default async function PortalDetailLegacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const ficha = await getCachedPublicFichaById(id);

  if (!ficha) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-20 text-center">
        <Lock size={40} strokeWidth={1} className="mx-auto text-border" />
        <p className="mt-3 text-sm text-muted">Esta propiedad no está disponible públicamente</p>
        <Link href="/portal" className="mt-3 inline-block text-sm text-gold hover:underline">
          Volver al listado
        </Link>
      </div>
    );
  }

  if (ficha.asset.publicSlug) {
    redirect(publicAssetPath(ficha.asset.publicSlug));
  }

  return <PortalDetailClient asset={ficha.asset} siblings={ficha.siblings} />;
}
