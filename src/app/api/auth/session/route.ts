import { NextResponse } from "next/server";
import { isResponse, requireAccount } from "@/server/http";
import { clearCookie } from "@/server/session";

export const runtime = "nodejs";

/** Current account, plan and this month's usage. */
export async function GET(req: Request) {
  const a = await requireAccount(req);
  return isResponse(a) ? a : NextResponse.json({ account: a });
}

/** Sign out (web cookie). Mobile simply discards its token. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookie());
  return res;
}
