import { NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { EngineError } from "@/lib/crewai/_internal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;

  try {
    const run = await swarmsClient.getRun(runId, ownerId);
    return NextResponse.json({
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      started_at: run.started_at,
      finished_at: run.finished_at ?? null,
      total_tokens_in: run.total_tokens_in,
      total_tokens_out: run.total_tokens_out,
      error_text: run.error_text ?? null,
      steps: (run.steps ?? []).map((s) => ({
        agent_name: s.agent_name ?? null,
        status: s.status,
        tokens_in: s.tokens_in,
        tokens_out: s.tokens_out,
        latency_ms: s.latency_ms ?? null,
        finished_at: s.finished_at ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof EngineError) {
      const status = err.status === 404 ? 404 : 502;
      return NextResponse.json(
        { error: err.message },
        { status },
      );
    }
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 502 });
  }
}
