import { upsertUser } from "@/server/accounts";
import { verifyGoogle } from "@/server/identity";
import { authError, signedIn } from "@/server/signin";

export const runtime = "nodejs";

/** Body: { idToken } from Google Identity Services (web) or Google Sign-In (mobile). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { idToken?: unknown } | null;
  if (typeof body?.idToken !== "string") return authError("Missing Google credential.", 400);
  try {
    const identity = await verifyGoogle(body.idToken);
    return signedIn(await upsertUser("google", identity));
  } catch (e) {
    console.warn("Google sign-in rejected:", e instanceof Error ? e.message : e);
    return authError("Google sign-in failed. Try again.");
  }
}
