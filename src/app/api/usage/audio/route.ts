import { NextResponse } from "next/server";
import { recordUsage } from "@/server/accounts";
import { isResponse, requireAccount } from "@/server/http";

export const runtime = "nodejs";

/**
 * The mobile app reports how much audio it streamed or uploaded straight to
 * Deepgram (those bytes never pass through this server). Capped per report;
 * reconcile against Deepgram's usage API (requests are tagged with the user
 * id) before relying on it for billing.
 */
export async function POST(req: Request) {
  const a = await requireAccount(req);
  if (isResponse(a)) return a;
  const body = (await req.json().catch(() => null)) as { seconds?: unknown } | null;
  const seconds = typeof body?.seconds === "number" && Number.isFinite(body.seconds) ? body.seconds : NaN;
  if (!(seconds > 0)) return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
  await recordUsage(a.user.id, { audioSeconds: Math.min(seconds, 6 * 3600) });
  return NextResponse.json({ ok: true });
}
