import Link from "next/link";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { makeTableStyles } from "@/lib/ui/tableStyles";

const BADGE_FONT_SIZE = FONT.xs;

interface SwarmListProps {
  swarms: SwarmListItem[];
  error?: string | null;
}

/**
 * Tableau de swarms. Conserve les vars cockpit (--ct-*).
 */
export function SwarmList({ swarms, error }: SwarmListProps) {
  if (error) {
    return (
      <div
        className="ct-card"
        style={{ borderColor: "var(--ct-border-accent)" }}
      >
        <div className="ct-card-title">Erreur</div>
        <p className="ct-card-body">{error}</p>
      </div>
    );
  }

  if (swarms.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">Aucun swarm</div>
        <p className="ct-card-body">
          Crée ton premier swarm pour démarrer.{" "}
          <Link href="/swarms/new" style={{ color: "var(--ct-accent-strong)" }}>
            Nouveau swarm →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div
      className="ct-card"
      style={{ padding: 0, overflowX: "auto" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--ct-border)",
              textAlign: "left",
            }}
          >
            <th style={thStyle}>Nom</th>
            <th style={thStyle}>Agents</th>
            <th style={thStyle}>Dernière run</th>
            <th style={thStyle}>Statut</th>
            <th style={thStyle}>MAJ</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {swarms.map((s) => (
            <tr
              key={s.id}
              style={{ borderBottom: "1px solid var(--ct-border-soft)" }}
            >
              <td style={tdStyle}>
                <Link
                  href={`/swarms/${s.id}`}
                  className="ct-link"
                  style={{ fontWeight: FONT_WEIGHT.semibold }}
                >
                  {s.name}
                </Link>
                {s.is_template ? (
                  <span
                    style={{
                      marginLeft: SPACING.sm,
                      fontSize: BADGE_FONT_SIZE,
                      padding: `${SPACING.hair}px ${SPACING.xxs}px`,
                      borderRadius: RADIUS.sm,
                      background: "var(--ct-surface-3)",
                      color: "var(--ct-text-muted)",
                    }}
                  >
                    TEMPLATE
                  </span>
                ) : null}
              </td>
              <td style={tdStyle}>{s.agents_count}</td>
              <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                {s.last_run_at ? formatDate(s.last_run_at) : "—"}
              </td>
              <td style={tdStyle}>
                {s.last_run_status ? (
                  <StatusBadge status={s.last_run_status} />
                ) : (
                  <span style={{ color: "var(--ct-text-faint)" }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                {formatDate(s.updated_at)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <Link
                  href={`/swarms/${s.id}/edit`}
                  style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}
                >
                  Éditer
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// thPadY: SPACING.md(12), tdPadY: SPACING.s(10), padX: SPACING.lx(20), thFontSize: FONT.xs, no border
const { th: thStyle, td: tdStyle } = makeTableStyles({
  thPadY: SPACING.md,
  tdPadY: SPACING.s,
  padX: SPACING.lx,
  thFontSize: BADGE_FONT_SIZE,
  border: false,
});
