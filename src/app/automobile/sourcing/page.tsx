import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { searchAutoScout } from "@/lib/apify/autoscout";
import { SourcingSearchForm } from "@/components/automobile/SourcingSearchForm";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { LinkButton } from "@/components/automobile/LinkButton";
import {
  Chevron,
  Card,
  CardBody,
  PageHeader,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { fmtPrice, fmtKm } from "@/lib/utils/format";
import { listingToPrefillHref } from "@/lib/automobile/prefill";
import type { AutoScoutListing } from "@/lib/apify/types";

export const metadata = { title: "Sourcing — Automobile" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dimensions de la vignette d'annonce (réutilisées thumbnail + fallback).
const THUMB_W = 72;
const THUMB_H = 48;
const ROW_LOGO_SIZE = 32;

interface PageProps {
  searchParams: Promise<{
    make?: string;
    model?: string;
    market?: string;
    priceMin?: string;
    priceMax?: string;
  }>;
}

export default async function SourcingPage({ searchParams }: PageProps) {
  try {
    await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login?returnTo=/automobile/sourcing");
    throw e;
  }

  const {
    make = "",
    model = "",
    market = "fr",
    priceMin: priceMinStr = "",
    priceMax: priceMaxStr = "",
  } = await searchParams;

  const hasQuery = make.trim() !== "";
  let listings: AutoScoutListing[] = [];
  let searchError: string | null = null;

  if (hasQuery) {
    const priceMin = priceMinStr ? Number(priceMinStr) : undefined;
    const priceMax = priceMaxStr ? Number(priceMaxStr) : undefined;
    try {
      listings = await searchAutoScout({
        make: make.trim(),
        model: model.trim() || undefined,
        market: market || "fr",
        priceMin: priceMin != null && !isNaN(priceMin) ? priceMin : undefined,
        priceMax: priceMax != null && !isNaN(priceMax) ? priceMax : undefined,
      });
    } catch (err) {
      console.error("[sourcing/page]", err);
      // Message générique — ne jamais exposer les détails internes à l'UI
      searchError = "La recherche AutoScout24 a échoué. Réessayez.";
    }
  }

  return (
    <>
      <Link
        href="/automobile"
        className="mb-4 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content"
      >
        <Chevron direction="left" />Automobile
      </Link>

      <div className="mb-8">
        <PageHeader
          title="Sourcing"
          subtitle="Recherche d'annonces AutoScout24 en temps réel — 8 marchés européens."
        />
      </div>

      {/* Formulaire pleine largeur (full expansive) */}
      <Card className="mb-8">
        <CardBody>
          <SourcingSearchForm
            defaultMake={make}
            defaultModel={model}
            defaultMarket={market}
            defaultPriceMin={priceMinStr}
            defaultPriceMax={priceMaxStr}
          />
        </CardBody>
      </Card>

      {/* État : erreur Apify */}
      {searchError && (
        <Card className="bg-danger/10 ring-danger/25">
          <CardBody>
            <h3 className="mb-2 text-sm font-semibold text-danger">
              Erreur lors de la recherche
            </h3>
            <code className="text-sm text-content-muted">{searchError}</code>
          </CardBody>
        </Card>
      )}

      {/* État : résultats vides (query lancée mais rien trouvé) */}
      {hasQuery && !searchError && listings.length === 0 && (
        <Card>
          <CardBody>
            <h3 className="mb-2 text-sm font-semibold text-content-strong">Aucun résultat</h3>
            <p className="text-sm text-content-muted">
              Aucune annonce trouvée pour{" "}
              <strong className="text-content">
                {make}
                {model ? ` ${model}` : ""}
              </strong>{" "}
              sur le marché <strong className="text-content">{market.toUpperCase()}</strong>
              {priceMinStr || priceMaxStr
                ? ` (${priceMinStr ? fmtPrice(Number(priceMinStr)) : "—"} – ${priceMaxStr ? fmtPrice(Number(priceMaxStr)) : "—"})`
                : ""}
              . Essayez sans filtre de prix ou sur un autre marché.
            </p>
          </CardBody>
        </Card>
      )}

      {/* État : pas encore cherché */}
      {!hasQuery && (
        <Card>
          <CardBody>
            <p className="text-sm text-content-faint">
              Entrez une marque pour lancer la recherche sur AutoScout24.
            </p>
          </CardBody>
        </Card>
      )}

      {/* État : résultats — tableau pleine largeur */}
      {listings.length > 0 && (
        <div className="w-full">
          <div className="mb-6 text-xs font-bold uppercase tracking-wider text-content-muted">
            {listings.length} annonce{listings.length > 1 ? "s" : ""} —{" "}
            {make}
            {model ? ` ${model}` : ""} · {market.toUpperCase()}
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Vignette</TH>
                <TH>Marque</TH>
                <TH>Titre</TH>
                <TH className="text-right">Prix</TH>
                <TH>Année</TH>
                <TH>KM</TH>
                <TH>Carburant</TH>
                <TH>Boîte</TH>
                <TH>Vendeur</TH>
                <TH>Localisation</TH>
                <TH className="text-right" />
              </TR>
            </THead>
            <TBody>
              {listings.map((listing) => (
                <TR key={listing.id}>
                  {/* Vignette */}
                  <TD>
                    {listing.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={listing.imageUrl}
                        alt={listing.title || "Annonce"}
                        loading="lazy"
                        className="block rounded-[var(--radius-sm)] border border-line object-cover"
                        style={{ width: THUMB_W, height: THUMB_H }}
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="rounded-[var(--radius-sm)] border border-line bg-surface-2"
                        style={{ width: THUMB_W, height: THUMB_H }}
                      />
                    )}
                  </TD>

                  {/* Marque */}
                  <TD>
                    <BrandLogo brand={make} size={ROW_LOGO_SIZE} />
                  </TD>

                  {/* Titre */}
                  <TD className="min-w-[220px] font-semibold">
                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-content-strong hover:text-accent"
                    >
                      {listing.title || "Annonce sans titre"}
                    </a>
                  </TD>

                  {/* Prix */}
                  <TD className="whitespace-nowrap text-right text-base font-extrabold text-accent-strong">
                    {listing.price != null ? fmtPrice(listing.price) : "—"}
                  </TD>

                  {/* Année */}
                  <TD className="text-content-muted">
                    {listing.year != null ? listing.year : "—"}
                  </TD>

                  {/* KM */}
                  <TD className="whitespace-nowrap text-content-muted">
                    {listing.mileage != null ? fmtKm(listing.mileage) : "—"}
                  </TD>

                  {/* Carburant */}
                  <TD className="text-content-muted">{listing.fuel || "—"}</TD>

                  {/* Boîte */}
                  <TD className="text-content-muted">{listing.gearbox || "—"}</TD>

                  {/* Vendeur */}
                  <TD className="text-content-muted">{listing.dealer || "—"}</TD>

                  {/* Localisation */}
                  <TD className="text-content-muted">{listing.location || "—"}</TD>

                  {/* Actions : analyser (pousse vers le run) + voir l'annonce */}
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <LinkButton
                        href={listingToPrefillHref(listing, { make, model, market })}
                        variant="primary"
                        className="h-8 px-3 text-xs"
                      >
                        Analyser
                      </LinkButton>
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whitespace-nowrap text-xs font-medium text-accent hover:text-accent-strong"
                      >
                        Voir ↗
                      </a>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}
