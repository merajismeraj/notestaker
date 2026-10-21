import { upsertUser } from "@/server/accounts";
import { verifyApple } from "@/server/identity";
import { authError, signedIn } from "@/server/signin";

export const runtime = "nodejs";

/**
 * Body: { identityToken, nonce, fullName? } from expo-apple-authentication.
 * Apple only sends the user's name on the very first sign-in, so the app
 * forwards it and we store it then.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    identityToken?: unknown;
    nonce?: unknown;
    fullName?: unknown;
  } | null;
  if (typeof body?.identityToken !== "string" || typeof body.nonce !== "string") {
    return authError("Missing Apple credential.", 400);
  }
  try {
    const identity = await verifyApple(body.identityToken, body.nonce);
    const name = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 120) || null : null;
    return signedIn(await upsertUser("apple", { ...identity, name }));
  } catch (e) {
    console.warn("Apple sign-in rejected:", e instanceof Error ? e.message : e);
    return authError("Apple sign-in failed. Try again.");
  }
}
