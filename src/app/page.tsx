import { HomeClient } from "@/components/HomeClient";
import { loadPortalListing } from "@/lib/portal-listing-server";
import { parsePortalSearchParams, type PortalFilterOptions } from "@/lib/portal-listing";

export const revalidate = 300;

const EMPTY_OPTIONS: PortalFilterOptions = { cat: [], prov: [], pob: [], tip: [] };

export default async function HomePage() {
  let options = EMPTY_OPTIONS;
  try {
    const listing = await loadPortalListing({
      query: parsePortalSearchParams({}),
      staff: false,
      role: null,
    });
    if (!listing.error) options = listing.options;
  } catch {
    options = EMPTY_OPTIONS;
  }
  return <HomeClient initialOptions={options} />;
}
