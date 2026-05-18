import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const START_TIME = Date.now();

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    version: "0.1.0",
    uptime_ms: Date.now() - START_TIME,
  });
}
