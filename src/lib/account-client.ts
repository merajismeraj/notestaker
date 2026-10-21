"use client";

import type { Account, QuotaError } from "./plans";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}

export async function fetchAccount(): Promise<Account | null> {
  const res = await fetch("/api/auth/session");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Couldn't reach the server.");
  return ((await res.json()) as { account: Account }).account;
}

export const startEmail = (email: string) =>
  call("/api/auth/email/start", { method: "POST", body: JSON.stringify({ email }) });

export const verifyEmail = (email: string, code: string) =>
  call<{ account: Account }>("/api/auth/email/verify", { method: "POST", body: JSON.stringify({ email, code }) });

export const signInWithGoogle = (idToken: string) =>
  call<{ account: Account }>("/api/auth/google", { method: "POST", body: JSON.stringify({ idToken }) });

export const signOut = () => fetch("/api/auth/session", { method: "DELETE" });

export const isQuotaError = (d: unknown): d is QuotaError =>
  typeof d === "object" && d !== null && (d as QuotaError).code === "quota";

/** Fired after metered calls so the account sheet and gate can refresh usage. */
export const ACCOUNT_CHANGED = "notestaker:account-changed";
export const notifyAccountChanged = () => window.dispatchEvent(new Event(ACCOUNT_CHANGED));
