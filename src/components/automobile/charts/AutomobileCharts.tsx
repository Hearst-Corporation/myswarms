import "./charts.css";
import { fmtPrice } from "@/lib/utils/format";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";

// Données sérialisables (calculées côté serveur depuis les runs réels).
interface ChartSlice {
  key: string;
  label: string;
  count: number;
  color: string;
}
interface PriceMarketRow {
  label: string;
  price: number;
  p15: number;
  median: number;
  p85: number;
}
export interface AutomobileChartsData {
  total: number;
  recommendations: ChartSlice[];
  decisions: ChartSlice[];
  priceVsMarket: PriceMarketRow[];
  tokensSeries: number[];
  live: boolean;
}

const DONUT_R = 62;
const DONUT_W = 18;
const DONUT_SIZE = 160;
const C = 2 * Math.PI * DONUT_R;

function LiveTag() {
  return (
    <span className="av-live">
      <span className="av-live-dot" />
      LIVE
    </span>
  );
}

function Donut({ slices, total }: { slices: ChartSlice[]; total: number }) {
  const cx = DONUT_SIZE / 2;
  const active = slices.filter((s) => s.count > 0);
  const lens = active.map((s) => (s.count / total) * C);
  const offsets = active.map((_, i) => -lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        <circle className="av-donut-track" cx={cx} cy={cx} r={DONUT_R} strokeWidth={DONUT_W} />
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {active.map((s, i) => (
            <circle
              key={s.key}
              className="av-donut-seg"
              cx={cx}
              cy={cx}
              r={DONUT_R}
              stroke={s.color}
              strokeWidth={DONUT_W}
              strokeDasharray={`${lens[i]} ${C - lens[i]}`}
              strokeDashoffset={offsets[i]}
            />
          ))}
        </g>
        <text x={cx} y={cx - 4} textAnchor="middle" fontSize={30} fontWeight={800} fill="var(--ct-text-primary)">
          {total}
        </text>
        <text x={cx} y={cx + 16} textAnchor="middle" fontSize={FONT.nano} letterSpacing={LETTER_SPACING.mid} fill="var(--ct-text-muted)">
          ANALYSES
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 100 }}>
        {slices.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: FONT.sm }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--ct-text-muted)", flex: 1 }}>{s.label}</span>
            <strong style={{ color: "var(--ct-text-primary)" }}>{s.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ slices }: { slices: ChartSlice[] }) {
  if (slices.length === 0) {
    return <p className="ct-placeholder">Aucune décision posée pour l&apos;instant.</p>;
  }
  const max = Math.max(1, ...slices.map((s) => s.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {slices.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 78, fontSize: FONT.xxs, color: "var(--ct-text-muted)", flexShrink: 0 }}>{s.label}</span>
          <div style={{ flex: 1, height: 10, background: "var(--ct-surface-3)", borderRadius: 999, overflow: "hidden" }}>
            <div
              className="av-bar-fill"
              style={{
                width: `${(s.count / max) * 100}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${s.color} 55%, transparent), ${s.color})`,
                animationDelay: `${i * 0.05}s`,
                minWidth: s.count > 0 ? 6 : 0,
              }}
            />
          </div>
          <strong style={{ width: 24, textAlign: "right", fontSize: FONT.sm, color: "var(--ct-text-primary)" }}>
            {s.count}
          </strong>
        </div>
      ))}
    </div>
  );
}

function PriceVsMarket({ rows }: { rows: PriceMarketRow[] }) {
  if (rows.length === 0) {
    return <p className="ct-placeholder">Pas encore de cote marché pour les véhicules analysés.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r, idx) => {
        const lo = Math.min(r.p15, r.price) * 0.96;
        const hi = Math.max(r.p85, r.price) * 1.04;
        const span = Math.max(1, hi - lo);
        const pct = (v: number) => ((v - lo) / span) * 100;
        const deal = r.price < r.median;
        const over = r.price > r.p85;
        const dotColor = over ? "var(--ct-alert-error-text)" : deal ? "var(--ct-state-ok)" : "var(--ct-accent-strong)";
        const delta = r.median > 0 ? Math.round(((r.price - r.median) / r.median) * 100) : 0;
        return (
          <div key={`${r.label}-${idx}`}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: FONT.xxs, marginBottom: 5 }}>
              <span style={{ color: "var(--ct-text-primary)", fontWeight: FONT_WEIGHT.semibold }}>{r.label}</span>
              <span style={{ color: dotColor, fontWeight: FONT_WEIGHT.bold }}>
                {fmtPrice(r.price)} · {delta > 0 ? "+" : ""}{delta}% vs marché
              </span>
            </div>
            <div style={{ position: "relative", height: 16 }}>
              {/* axe */}
              <div style={{ position: "absolute", top: 7, left: 0, right: 0, height: 2, background: "var(--ct-surface-3)", borderRadius: 2 }} />
              {/* bande P15–P85 */}
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  left: `${pct(r.p15)}%`,
                  width: `${Math.max(2, pct(r.p85) - pct(r.p15))}%`,
                  height: 8,
                  background: "color-mix(in srgb, var(--ct-accent-strong) 22%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ct-accent-strong) 45%, transparent)",
                  borderRadius: 6,
                }}
              />
              {/* médiane */}
              <div style={{ position: "absolute", top: 1, left: `${pct(r.median)}%`, width: 2, height: 14, background: "var(--ct-text-muted)" }} />
              {/* prix annonce */}
              <div
                className="av-dot"
                style={{
                  position: "absolute",
                  top: 2,
                  left: `calc(${pct(r.price)}% - ${SPACING.xxs}px)`,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: dotColor,
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 25%, transparent)`,
                  animationDelay: `${idx * 0.06}s`,
                }}
              />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 14, fontSize: FONT.nano, color: "var(--ct-text-faint)", flexWrap: "wrap" }}>
        <span>● <span style={{ color: "var(--ct-state-ok)" }}>sous le marché</span></span>
        <span>● <span style={{ color: "var(--ct-accent-strong)" }}>dans la fourchette</span></span>
        <span>● <span style={{ color: "var(--ct-alert-error-text)" }}>au-dessus</span></span>
      </div>
    </div>
  );
}

function TokensArea({ series }: { series: number[] }) {
  if (series.length < 2) {
    return <p className="ct-placeholder">Pas assez de runs pour la tendance tokens.</p>;
  }
  const W = 280;
  const H = 90;
  const max = Math.max(...series, 1);
  const step = W / (series.length - 1);
  const pts = series.map((v, i) => [i * step, H - (v / max) * (H - 10) - 4] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="av-tok" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ct-accent-strong)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--ct-accent-strong)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="av-area-path" d={area} fill="url(#av-tok)" />
      <path
        className="av-line-path"
        d={line}
        fill="none"
        stroke="var(--ct-accent-strong)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.4} fill="var(--ct-accent-strong)" />
      ))}
    </svg>
  );
}

export function AutomobileCharts({ data }: { data: AutomobileChartsData }) {
  return (
    <div className="av-grid">
      <div className="av-card">
        <div className="av-title">
          Recommandations
          {data.live ? <LiveTag /> : null}
        </div>
        <Donut slices={data.recommendations} total={data.total} />
      </div>

      <div className="av-card">
        <div className="av-title">Décisions opérateur</div>
        <Bars slices={data.decisions} />
      </div>

      <div className="av-card" style={{ gridColumn: "span 1" }}>
        <div className="av-title">Prix annonce vs cote marché</div>
        <PriceVsMarket rows={data.priceVsMarket} />
      </div>

      <div className="av-card">
        <div className="av-title">
          Tokens par analyse
          {data.live ? <LiveTag /> : null}
        </div>
        <TokensArea series={data.tokensSeries} />
      </div>
    </div>
  );
}
