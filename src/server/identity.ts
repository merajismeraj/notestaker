import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Verifies ID tokens from Sign in with Apple / Google. The JWKS is injectable
// so tests can sign tokens with a local key.

export type Identity = { sub: string; email: string | null; emailVerified: boolean; name: string | null };

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function verifyGoogle(idToken: string, jwks: JWTVerifyGetKey = googleJwks): Promise<Identity> {
  // Web, iOS and Android OAuth clients each have their own client ID.
  const audience = list(process.env.GOOGLE_CLIENT_IDS ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  if (!audience.length) throw new Error("Google sign-in isn't configured.");
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
  });
  return {
    sub: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `rawNonce` is the value the app generated; Apple embeds its SHA-256, which
 * binds the token to this sign-in attempt (replay protection).
 */
export async function verifyApple(
  idToken: string,
  rawNonce: string,
  jwks: JWTVerifyGetKey = appleJwks,
): Promise<Identity> {
  const audience = list(process.env.APPLE_BUNDLE_IDS ?? "com.notestaker.app");
  const { payload } = await jwtVerify(idToken, jwks, { issuer: "https://appleid.apple.com", audience });
  if (payload.nonce !== (await sha256Hex(rawNonce))) throw new Error("Apple sign-in nonce mismatch.");
  return {
    sub: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    // Apple sends this as a boolean or the string "true".
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: null,
  };
}
