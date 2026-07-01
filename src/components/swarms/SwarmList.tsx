import Link from "next/link";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  EmptyState,
} from "@/components/ui";

interface SwarmListProps {
  swarms: SwarmListItem[];
  error?: string | null;
}

/** Tableau de swarms sur le DS MySwarms. */
export function SwarmList({ swarms, error }: SwarmListProps) {
  if (error) {
    return (
      <Card className="ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]">
        <CardHeader>
          <CardTitle className="text-danger">Erreur</CardTitle>
        </CardHeader>
        <CardBody className="text-sm text-content-muted">{error}</CardBody>
      </Card>
    );
  }

  if (swarms.length === 0) {
    return (
      <EmptyState
        title="Aucun swarm"
        description="Crée ton premier swarm pour démarrer."
        action={
          <Link
            href="/swarms/new"
            className="text-sm font-medium text-accent hover:text-accent-strong"
          >
            Nouveau swarm →
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Nom</TH>
          <TH>Agents</TH>
          <TH>Dernière run</TH>
          <TH>Statut</TH>
          <TH>MAJ</TH>
          <TH>
            <span className="sr-only">Actions</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {swarms.map((s) => (
          <TR key={s.id}>
            <TD>
              <span className="inline-flex items-center gap-2">
                <Link
                  href={`/swarms/${s.id}`}
                  className="font-semibold text-content-strong hover:text-accent"
                >
                  {s.name}
                </Link>
                {s.is_template ? <Badge tone="neutral">TEMPLATE</Badge> : null}
              </span>
            </TD>
            <TD>{s.agents_count}</TD>
            <TD className="text-content-muted">
              {s.last_run_at ? formatDate(s.last_run_at) : "—"}
            </TD>
            <TD>
              {s.last_run_status ? (
                <StatusBadge status={s.last_run_status} />
              ) : (
                <span className="text-content-faint">—</span>
              )}
            </TD>
            <TD className="text-content-muted">{formatDate(s.updated_at)}</TD>
            <TD className="text-right">
              <Link
                href={`/swarms/${s.id}/edit`}
                className="text-sm text-accent hover:text-accent-strong"
              >
                Éditer
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
