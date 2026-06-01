import { type RawListing } from "./types";

/**
 * Mappe les chaînes de caractères de carburant vers un format unifié.
 */
export function mapFuel(fuel?: string): string | undefined {
  if (!fuel) return undefined;
  const f = fuel.toLowerCase();
  if (f.includes("hybr") || f.includes("hibr") || f.includes("ibrid") || f.includes("plug") || f === "2")
    return "hybrid";
  if (
    f.includes("ess") || f.includes("petrol") || f.includes("gasolin") ||
    f.includes("benzin") || f.includes("bensin") || f === "b"
  )
    return "essence";
  if (f.includes("dies") || f === "d") return "diesel";
  if (f.includes("elec") || f.includes("élec") || f.includes("elett") || f === "e") return "electric";
  if (f.includes("lpg") || f === "l") return "lpg";
  if (f.includes("cng") || f === "c") return "cng";
  if (f.includes("hydr") || f === "h") return "hydrogen";
  return f;
}

/**
 * Normalise un véhicule avant insertion ou affichage.
 */
export function normalizeListing(listing: RawListing): RawListing {
  return {
    ...listing,
    make: listing.make?.toLowerCase().trim(),
    model: listing.model?.toLowerCase().trim(),
    fuel: mapFuel(listing.fuel),
    country: listing.country?.toUpperCase().trim(),
  };
}
