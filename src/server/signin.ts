import { NextResponse } from "next/server";
import { account } from "./accounts";
import { issueSession, sessionCookie } from "./session";

/**
 * Successful sign-in response: the account, plus the session as an httpOnly
 * cookie (web) and in the body (mobile keeps it in secure storage).
 */
export async function signedIn(userId: string) {
  const { token, maxAge } = await issueSession(userId);
  const res = NextResponse.json({ token, account: await account(userId) });
  res.headers.set("Set-Cookie", sessionCookie(token, maxAge));
  return res;
}

export const authError = (message: string, status = 401) =>
  NextResponse.json({ error: message, code: "auth" }, { status });
