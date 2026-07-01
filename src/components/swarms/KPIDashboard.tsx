import { StatCard, KpiGrid } from "@/components/ui";

interface KPI {
  label: string;
  value: string | number;
  accent?: boolean;
}

interface KPIDashboardProps {
  kpis?: KPI[];
}

/**
 * Grille de KPI cards du DS MySwarms (StatCard + KpiGrid).
 * Si aucune valeur passée → placeholders "—".
 */
export function KPIDashboard({ kpis }: KPIDashboardProps) {
  const items: KPI[] = kpis ?? [
    { label: "Total swarms", value: "—", accent: true },
    { label: "Active runs", value: "—" },
    { label: "Runs 30d", value: "—" },
    { label: "Success rate", value: "—" },
  ];

  return (
    <KpiGrid className="my-6">
      {items.map((kpi, i) => (
        <StatCard
          key={`${kpi.label}-${i}`}
          label={kpi.label}
          value={kpi.value}
          className={kpi.accent ? "ring-accent/30" : undefined}
        />
      ))}
    </KpiGrid>
  );
}
