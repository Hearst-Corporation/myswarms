import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { ActivityFeed, type RunRow } from "@/components/activity/ActivityFeed";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Activité — MySwarms" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      redirect("/login");
    }
    redirect("/login");
  }

  // List active, non-template swarms
  let swarmMap: Record<string, string> = {};
  let allRuns: RunRow[] = [];

  try {
    const swarms = (await swarmsClient.list(ownerId)).filter(
      (s) => !s.is_template && s.is_active !== false,
    );

    swarmMap = Object.fromEntries(swarms.map((s) => [s.id, s.name]));

    // Fan-out: 8 runs per swarm
    const settled = await Promise.allSettled(
      swarms.map(async (s) => {
        const runs = await swarmsClient.listRuns(s.id, 8, ownerId);
        return runs.map((r): RunRow => ({
          id: r.id,
          swarm_id: r.swarm_id,
          swarm_name: s.name,
          trigger: r.trigger,
          status: r.status,
          started_at: r.started_at,
          finished_at: r.finished_at ?? null,
          total_tokens_in: r.total_tokens_in,
          total_tokens_out: r.total_tokens_out,
        }));
      }),
    );

    allRuns = settled
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      );
  } catch {
    // Engine unreachable at page load — render with empty data
  }

  const liveRuns = allRuns.filter(
    (r) => r.status === "running" || r.status === "pending",
  );
  const recentRuns = allRuns
    .filter((r) => r.status !== "running" && r.status !== "pending")
    .slice(0, 30);

  // Engine health
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3333";
  let engine: "ok" | "unreachable" = "unreachable";
  try {
    const res = await fetch(`${appUrl}/api/system/status`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = (await res.json()) as { engine?: string };
      engine = data.engine === "ok" ? "ok" : "unreachable";
    }
  } catch {
    engine = "unreachable";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Cockpit · MySwarms" title="Activité" />

      <ActivityFeed
        initialRuns={recentRuns}
        initialLive={liveRuns}
        swarmMap={swarmMap}
        initialEngine={engine}
      />
    </div>
  );
}
