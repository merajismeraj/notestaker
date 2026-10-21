import { NextResponse } from "next/server";
import type { Account } from "@/lib/plans";
import { account } from "./accounts";
import { readSession } from "./session";

/** Resolves the signed-in account, or a 401 response to return as-is. */
export async function requireAccount(req: Request): Promise<Account | NextResponse> {
  const userId = await readSession(req);
  const a = userId ? await account(userId) : null;
  return a ?? NextResponse.json({ error: "Sign in to continue.", code: "auth" }, { status: 401 });
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;

export const normEmail = (e: unknown) =>
  typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && e.length <= 254
    ? e.trim().toLowerCase()
    : null;
