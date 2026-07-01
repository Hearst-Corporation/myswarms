import Link from "next/link";
import { swarmsClient } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import type { SwarmListItem } from "@/lib/forms/swarmSchemas";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { SwarmList } from "@/components/swarms/SwarmList";
import { PageHeader, SectionLabel } from "@/components/ui";
import { PlusIcon } from "@heroicons/react/24/outline";

const PRIMARY_LINK =
  "inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 " +
  "text-sm font-semibold text-white transition-colors hover:bg-accent-strong";

export const metadata = { title: "Swarms — MySwarms" };
export const dynamic = "force-dynamic";

export default async function SwarmsPage() {
  let swarms: SwarmListItem[] = [];
  let listError: string | null = null;
  try {
    const ownerId = await getOwnerId();
    swarms = await swarmsClient.list(ownerId);
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load swarms";
  }

  const totalSwarms = swarms.length;
  const activeRuns = swarms.filter((s) => s.last_run_status === "running").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cockpit · MySwarms"
        title="Swarms"
        subtitle="Configure tes crews multi-agents, lance-les à la demande ou sur déclencheurs."
        actions={
          <Link href="/swarms/new" className={PRIMARY_LINK}>
            <PlusIcon className="size-4" />
            Nouveau swarm
          </Link>
        }
      />

      <KPIDashboard
        kpis={[
          { label: "Total swarms", value: totalSwarms, accent: true },
          { label: "Active runs", value: activeRuns },
        ]}
      />

      <div>
        <SectionLabel text="Tous les swarms" />
        <SwarmList swarms={swarms} error={listError} />
      </div>
    </div>
  );
}
