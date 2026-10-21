import { NextResponse } from "next/server";
import { createEmailCode } from "@/server/accounts";
import { sendSignInCode } from "@/server/email";
import { normEmail } from "@/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = normEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const code = await createEmailCode(email);
  // Same response whether or not a code was just sent, so the endpoint can't
  // be used to probe throttling state; the client just waits before resending.
  if (code) {
    try {
      await sendSignInCode(email, code);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Email failed." }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true });
}
