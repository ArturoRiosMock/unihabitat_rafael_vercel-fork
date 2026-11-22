import { Suspense } from "react";
import { getServerSession } from "@/lib/auth-server";
import { loadPortalListing } from "@/lib/portal-listing-server";
import { parsePortalSearchParams } from "@/lib/portal-listing";
import { PortalListing, PortalListingSkeleton } from "@/components/PortalListing";

export const dynamic = "force-dynamic";

async function PortalResults({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parsePortalSearchParams(searchParams);
  const session = await getServerSession();
  const staff = session?.role === "admin" || session?.role === "vendedor";
  const listing = await loadPortalListing({
    query,
    staff,
    role: session?.role ?? null,
  });
  return <PortalListing query={query} listing={listing} />;
}

export default function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PortalListingSkeleton />}>
      <PortalResultsLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function PortalResultsLoader({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  return <PortalResults searchParams={resolved} />;
}
