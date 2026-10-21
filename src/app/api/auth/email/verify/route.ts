import { consumeEmailCode, upsertEmailUser } from "@/server/accounts";
import { normEmail } from "@/server/http";
import { authError, signedIn } from "@/server/signin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = normEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return authError("Enter the 6-digit code from your email.", 400);
  if (!(await consumeEmailCode(email, code))) {
    return authError("That code is wrong or has expired. Request a new one.");
  }
  return signedIn(await upsertEmailUser(email));
}
