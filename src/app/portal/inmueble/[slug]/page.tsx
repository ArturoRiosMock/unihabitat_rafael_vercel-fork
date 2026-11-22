import { getCachedPublicFichaBySlug } from "@/lib/portal-public-asset";
import Link from "next/link";
import { Lock } from "lucide-react";
import PortalDetailClient from "../../[id]/PortalDetailClient";

export const revalidate = 300;

export default async function PortalInmuebleSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ficha = await getCachedPublicFichaBySlug(decodeURIComponent(slug));

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

  return <PortalDetailClient asset={ficha.asset} siblings={ficha.siblings} />;
}
