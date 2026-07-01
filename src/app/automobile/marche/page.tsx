import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { getMarketIndex } from "@/lib/market/apmClient";
import { MarketSearchForm } from "@/components/automobile/MarketSearchForm";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { Chevron, Card, CardBody, PageHeader } from "@/components/ui";
import { fmtPrice } from "@/lib/utils/format";

const TITLE_LOGO_SIZE = 48;

export const metadata = { title: "Cote marché — Automobile" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ make?: string; model?: string; fuel?: string }>;
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
      <Link
        href="/automobile"
        className="mb-4 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content"
      >
        <Chevron direction="left" />Automobile
      </Link>

      <div className="mb-8">
        <PageHeader
          title="Cote marché"
          subtitle="Prix médian, fourchette et liquidité d'un modèle — données marché live."
        />
      </div>

      <Card className="mb-8">
        <CardBody>
          <MarketSearchForm defaultMake={make} defaultModel={model} defaultFuel={fuel} />
        </CardBody>
      </Card>

      {hasQuery && !market && (
        <Card>
          <CardBody>
            <h3 className="mb-2 text-sm font-semibold text-content-strong">Pas de données</h3>
            <p className="text-sm text-content-muted">
              Aucune cote marché exploitable pour {make} {model}
              {fuel ? ` (${fuel})` : ""}. Le modèle est peut-être trop rare, ou
              orthographié différemment dans la base marché.
            </p>
          </CardBody>
        </Card>
      )}

      {market && (
        <div className="flex w-full flex-col gap-6">
          {/* Cote principale */}
          <Card className="ring-accent/60">
            <CardBody>
              <div className="mb-4 flex items-center gap-4">
                <BrandLogo brand={market.make} size={TITLE_LOGO_SIZE} />
                <h3 className="text-sm font-semibold text-content-strong">
                  Cote médiane — {market.make} {market.model}
                  {market.fuel ? ` · ${market.fuel}` : ""}
                </h3>
              </div>
              <div className="text-3xl font-extrabold leading-tight text-accent-strong">
                {fmtPrice(market.medianPrice)}
              </div>
              <div className="mt-2 text-sm text-content-muted">
                Fourchette {fmtPrice(market.p15Price)} – {fmtPrice(market.p85Price)} (P15–P85)
              </div>
              {fuelMismatch && (
                <div className="mt-4 text-xs text-danger">
                  ⚠️ Carburant demandé «&nbsp;{fuel}&nbsp;» indisponible — cote affichée pour «&nbsp;{market.fuel}&nbsp;».
                </div>
              )}
            </CardBody>
          </Card>

          {/* Signaux marché */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-6">
            <Metric label="Liquidité" value={market.liquidityScore != null ? market.liquidityScore.toFixed(1) : "—"} />
            <Metric
              label="Vélocité (jours)"
              value={market.marketVelocity != null && market.marketVelocity > 0 ? Math.round(market.marketVelocity).toString() : "—"}
            />
            <Metric label="Heat" value={market.heatScore != null ? Math.round(market.heatScore).toString() : "—"} />
            <Metric label="Confiance" value={`${Math.round(market.confidence * 100)}%`} />
            <Metric label="Échantillon" value={Math.round(market.nEffective).toString()} />
          </div>

          <p className="text-xs text-content-faint">
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
    <Card>
      <CardBody>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-content-muted">
          {label}
        </div>
        <div className="text-2xl font-extrabold leading-none text-content-strong">
          {value}
        </div>
      </CardBody>
    </Card>
  );
}
