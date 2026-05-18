import { NextRequest, NextResponse } from "next/server";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/crews/chief-of-staff/decisions
 * Liste les decisions scopées par owner_id.
 *
 * POST /api/crews/chief-of-staff/decisions
 * Enregistre une décision (record), scopée par owner_id.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ownerId = await requireOwnerId();
    const decisions = await crewaiClient.listDecisions("chief-of-staff", { ownerId });
    return NextResponse.json(decisions);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const ownerId = await requireOwnerId();
    const result = await crewaiClient.recordDecision("chief-of-staff", body, { ownerId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof CrewaiEngineError) {
      if (err.status >= 400 && err.status < 500) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
