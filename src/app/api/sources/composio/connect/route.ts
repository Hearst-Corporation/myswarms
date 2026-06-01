import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { authedFetch } from "@/lib/crewai/_internal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  toolkit: z.string().min(1),
  auth_config_id: z.string().optional(),
});

/**
 * POST /api/sources/composio/connect
 * Body: { toolkit: "gmail" | "trello" | ... }
 * Returns: { redirect_url: string, toolkit: string }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const res = await authedFetch(
      `/v1/composio/connect?owner_id=${encodeURIComponent(ownerId)}`,
      {
        method: "POST",
        body: JSON.stringify(parsed.data),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const data = (await res.json()) as { redirect_url: string; toolkit: string };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
