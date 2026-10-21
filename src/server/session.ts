import { jwtVerify, SignJWT } from "jose";

// Our own session token, issued after Apple/Google/email verification.
// Web: httpOnly cookie. Mobile: secure storage + Authorization: Bearer.
export const COOKIE = "nt_session";
const TTL_DAYS = 30;

let devSecret: Uint8Array | null = null;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET (32+ chars) is required in production.");
  }
  // Dev only: sessions reset whenever the server restarts.
  devSecret ??= crypto.getRandomValues(new Uint8Array(32));
  return devSecret;
}

export async function issueSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(secret());
  return { token, maxAge: TTL_DAYS * 24 * 3600 };
}

export async function readSession(req: Request): Promise<string | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const cookie = req.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const token = bearer ?? cookie;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
