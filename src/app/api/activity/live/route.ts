import { NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // List all active non-template swarms
  let swarms: Awaited<ReturnType<typeof swarmsClient.list>> = [];
  try {
    const all = await swarmsClient.list(ownerId);
    swarms = all.filter((s) => !s.is_template && s.is_active !== false);
  } catch {
    // If engine is down, return empty runs with unreachable engine
    return NextResponse.json({ runs: [], engine: "unreachable" });
  }

  // Fan-out: fetch last 5 runs per swarm
  type RunRow = {
    id: string;
    swarm_id: string;
    swarm_name: string;
    trigger: string;
    status: string;
    started_at: string;
    total_tokens_in: number;
    total_tokens_out: number;
  };

  const settled = await Promise.allSettled(
    swarms.map(async (s) => {
      const runs = await swarmsClient.listRuns(s.id, 5, ownerId);
      return runs.map((r) => ({
        id: r.id,
        swarm_id: r.swarm_id,
        swarm_name: s.name,
        trigger: r.trigger,
        status: r.status,
        started_at: r.started_at,
        total_tokens_in: r.total_tokens_in,
        total_tokens_out: r.total_tokens_out,
      }));
    }),
  );

  const runs: RunRow[] = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((r) => r.status === "running" || r.status === "pending")
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );

  // Engine health check
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3333";
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

  return NextResponse.json({ runs, engine });
}
