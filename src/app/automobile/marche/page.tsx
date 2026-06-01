import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { getMarketIndex } from "@/lib/market/apmClient";
import { MarketSearchForm } from "@/components/automobile/MarketSearchForm";
import { Chevron } from "@/components/ui/Chevron";
import { FONT, FONT_WEIGHT, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

export const metadata = { title: "Cote marché — Automobile" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ make?: string; model?: string; fuel?: string }>;
}

function fmtPrice(v: number | null): string {
  return v != null ? `${Math.round(v).toLocaleString("fr-FR")} €` : "—";
}

export default async function CoteMarchePage({ searchParams }: PageProps) {
  try {
    await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login?returnTo=/automobile/marche");
    throw e;
  }

  const { make = "", model = "", fuel = "" } = await searchParams;
  const hasQuery = make.trim() !== "" && model.trim() !== "";
  const market = hasQuery ? await getMarketIndex(make, model, fuel || null) : null;
  const fuelMismatch =
    market && fuel.trim() && market.fuel && market.fuel.toLowerCase() !== fuel.trim().toLowerCase();

  return (
    <>
      <div className="ct-eyebrow">
        <Link href="/automobile" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Automobile
        </Link>
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h1 className="ct-title">Cote marché</h1>
        <p className="ct-sub">
          Prix médian, fourchette et liquidité d&apos;un modèle — données marché live.
        </p>
      </div>

      <div className="ct-card" style={{ padding: `${SPACING.lx}px`, maxWidth: 640, marginBottom: SPACING.xl }}>
        <MarketSearchForm defaultMake={make} defaultModel={model} defaultFuel={fuel} />
      </div>

      {hasQuery && !market && (
        <div className="ct-card" style={{ maxWidth: 640 }}>
          <div className="ct-card-title">Pas de données</div>
          <p className="ct-card-body">
            Aucune cote marché exploitable pour {make} {model}
            {fuel ? ` (${fuel})` : ""}. Le modèle est peut-être trop rare, ou
            orthographié différemment dans la base marché.
          </p>
        </div>
      )}

      {market && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg, maxWidth: 720 }}>
          {/* Cote principale */}
          <div className="ct-card" style={{ borderColor: "var(--ct-accent-strong)" }}>
            <div className="ct-card-title">
              Cote médiane — {market.make} {market.model}
              {market.fuel ? ` · ${market.fuel}` : ""}
            </div>
            <div
              style={{
                fontSize: FONT.xxl,
                fontWeight: FONT_WEIGHT.extrabold,
                color: "var(--ct-accent-strong)",
                lineHeight: 1.1,
              }}
            >
              {fmtPrice(market.medianPrice)}
            </div>
            <div style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", marginTop: SPACING.sm }}>
              Fourchette {fmtPrice(market.p15Price)} – {fmtPrice(market.p85Price)} (P15–P85)
            </div>
            {fuelMismatch && (
              <div
                style={{
                  marginTop: SPACING.md,
                  fontSize: FONT.xs,
                  color: "var(--ct-alert-error-text)",
                }}
              >
                ⚠️ Carburant demandé «&nbsp;{fuel}&nbsp;» indisponible — cote affichée pour «&nbsp;{market.fuel}&nbsp;».
              </div>
            )}
          </div>

          {/* Signaux marché */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: SPACING.lg,
            }}
          >
            <Metric label="Liquidité" value={market.liquidityScore != null ? market.liquidityScore.toFixed(1) : "—"} />
            <Metric
              label="Vélocité (jours)"
              value={market.marketVelocity != null && market.marketVelocity > 0 ? Math.round(market.marketVelocity).toString() : "—"}
            />
            <Metric label="Heat" value={market.heatScore != null ? Math.round(market.heatScore).toString() : "—"} />
            <Metric label="Confiance" value={`${Math.round(market.confidence * 100)}%`} />
            <Metric label="Échantillon" value={Math.round(market.nEffective).toString()} />
          </div>

          <p style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
            Données marché APM · cluster mis à jour{" "}
            {market.asOf ? new Date(market.asOf).toLocaleString("fr-FR") : "—"}
          </p>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="ct-card" style={{ padding: `${SPACING.lg}px` }}>
      <div
        style={{
          fontSize: FONT.xs,
          fontWeight: FONT_WEIGHT.bold,
          letterSpacing: LETTER_SPACING.wide,
          textTransform: "uppercase",
          color: "var(--ct-text-muted)",
          marginBottom: SPACING.sm,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: FONT.xl, fontWeight: FONT_WEIGHT.extrabold, color: "var(--ct-text-primary)", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}
