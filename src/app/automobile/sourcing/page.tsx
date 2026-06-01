import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { searchAutoScout } from "@/lib/apify/autoscout";
import { SourcingSearchForm } from "@/components/automobile/SourcingSearchForm";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { Chevron } from "@/components/ui/Chevron";
import { FONT, FONT_WEIGHT, SPACING, RADIUS, LETTER_SPACING } from "@/lib/ui/tokens";
import { thStyle, tdStyle } from "@/lib/ui/tableStyles";
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
      <div className="ct-eyebrow">
        <Link href="/automobile" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Automobile
        </Link>
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h1 className="ct-title">Sourcing</h1>
        <p className="ct-sub">
          Recherche d&apos;annonces AutoScout24 en temps réel — 8 marchés européens.
        </p>
      </div>

      {/* Formulaire pleine largeur (full expansive) */}
      <div className="ct-card" style={{ padding: `${SPACING.lx}px`, marginBottom: SPACING.xl }}>
        <SourcingSearchForm
          defaultMake={make}
          defaultModel={model}
          defaultMarket={market}
          defaultPriceMin={priceMinStr}
          defaultPriceMax={priceMaxStr}
        />
      </div>

      {/* État : erreur Apify */}
      {searchError && (
        <div
          className="ct-card"
          style={{
            background: "var(--ct-alert-error-bg)",
            borderColor: "var(--ct-alert-error-border)",
          }}
        >
          <div className="ct-card-title" style={{ color: "var(--ct-alert-error-text)" }}>
            Erreur lors de la recherche
          </div>
          <div className="ct-card-body">
            <code>{searchError}</code>
          </div>
        </div>
      )}

      {/* État : résultats vides (query lancée mais rien trouvé) */}
      {hasQuery && !searchError && listings.length === 0 && (
        <div className="ct-card">
          <div className="ct-card-title">Aucun résultat</div>
          <p className="ct-card-body">
            Aucune annonce trouvée pour{" "}
            <strong>
              {make}
              {model ? ` ${model}` : ""}
            </strong>{" "}
            sur le marché{" "}
            <strong>{market.toUpperCase()}</strong>
            {priceMinStr || priceMaxStr
              ? ` (${priceMinStr ? Number(priceMinStr).toLocaleString("fr-FR") + " €" : "—"} – ${priceMaxStr ? Number(priceMaxStr).toLocaleString("fr-FR") + " €" : "—"})`
              : ""}
            . Essayez sans filtre de prix ou sur un autre marché.
          </p>
        </div>
      )}

      {/* État : pas encore cherché */}
      {!hasQuery && (
        <div className="ct-card">
          <div className="ct-placeholder">
            Entrez une marque pour lancer la recherche sur AutoScout24.
          </div>
        </div>
      )}

      {/* État : résultats — tableau pleine largeur */}
      {listings.length > 0 && (
        <div style={{ width: "100%" }}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.lg,
            }}
          >
            {listings.length} annonce{listings.length > 1 ? "s" : ""} —{" "}
            {make}
            {model ? ` ${model}` : ""} · {market.toUpperCase()}
          </div>

          <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
              <thead>
                <tr>
                  <th style={thStyle}>Vignette</th>
                  <th style={thStyle}>Marque</th>
                  <th style={thStyle}>Titre</th>
                  <th style={{ ...thStyle, textAlign: "right" as const }}>Prix</th>
                  <th style={thStyle}>Année</th>
                  <th style={thStyle}>KM</th>
                  <th style={thStyle}>Carburant</th>
                  <th style={thStyle}>Boîte</th>
                  <th style={thStyle}>Vendeur</th>
                  <th style={thStyle}>Localisation</th>
                  <th style={{ ...thStyle, textAlign: "right" as const }}></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="ct-tr">
                    {/* Vignette */}
                    <td className="ct-td" style={tdStyle}>
                      {listing.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={listing.imageUrl}
                          alt={listing.title || "Annonce"}
                          loading="lazy"
                          style={{
                            width: THUMB_W,
                            height: THUMB_H,
                            objectFit: "cover",
                            display: "block",
                            borderRadius: RADIUS.sm,
                            border: "1px solid var(--ct-border)",
                          }}
                        />
                      ) : (
                        <div
                          aria-hidden
                          style={{
                            width: THUMB_W,
                            height: THUMB_H,
                            borderRadius: RADIUS.sm,
                            background: "var(--ct-surface-2)",
                            border: "1px solid var(--ct-border)",
                          }}
                        />
                      )}
                    </td>

                    {/* Marque */}
                    <td className="ct-td" style={tdStyle}>
                      <BrandLogo brand={make} size={ROW_LOGO_SIZE} />
                    </td>

                    {/* Titre */}
                    <td className="ct-td" style={{ ...tdStyle, fontWeight: FONT_WEIGHT.semibold, minWidth: 220 }}>
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ct-link"
                        style={{ color: "var(--ct-text-strong)", textDecoration: "none" }}
                      >
                        {listing.title || "Annonce sans titre"}
                      </a>
                    </td>

                    {/* Prix */}
                    <td
                      className="ct-td"
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: FONT_WEIGHT.extrabold,
                        fontSize: FONT.md,
                        color: "var(--ct-accent-strong)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {listing.price != null
                        ? listing.price.toLocaleString("fr-FR") + " €"
                        : "—"}
                    </td>

                    {/* Année */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {listing.year != null ? listing.year : "—"}
                    </td>

                    {/* KM */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                      {listing.mileage != null
                        ? listing.mileage.toLocaleString("fr-FR") + " km"
                        : "—"}
                    </td>

                    {/* Carburant */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {listing.fuel || "—"}
                    </td>

                    {/* Boîte */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {listing.gearbox || "—"}
                    </td>

                    {/* Vendeur */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {listing.dealer || "—"}
                    </td>

                    {/* Localisation */}
                    <td className="ct-td" style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {listing.location || "—"}
                    </td>

                    {/* Lien */}
                    <td className="ct-td" style={{ ...tdStyle, textAlign: "right" }}>
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ct-link"
                        style={{ fontSize: FONT.xs, whiteSpace: "nowrap" }}
                      >
                        Voir ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
