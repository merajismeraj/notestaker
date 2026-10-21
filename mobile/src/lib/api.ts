import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import type { Account, QuotaError } from "@core/plans";
import type { Minutes } from "@core/schema";
import type { Meeting } from "@core/types";
import { getToken, setToken } from "./session";

/** Base URL of the Next.js backend (e.g. https://notestaker.vercel.app). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** API failure; `quota` is set when a plan limit blocked the request (HTTP 402). */
export class ApiError extends Error {
  quota: QuotaError | null;
  constructor(message: string, quota: QuotaError | null = null) {
    super(message);
    this.quota = quota;
  }
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (res.status === 401 && data.code === "auth") await setToken(null); // back to sign-in
  if (!res.ok) {
    throw new ApiError(
      data.error || `Request failed (${res.status}).`,
      data.code === "quota" ? (data as unknown as QuotaError) : null,
    );
  }
  return data;
}

/** fetch against our backend with the session token attached. */
async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  requireApi();
  const token = await getToken();
  return fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

// ---- Account -------------------------------------------------------------

export async function fetchAccount(): Promise<Account | null> {
  if (!(await getToken())) return null;
  const res = await api("/api/auth/session");
  if (res.status === 401) {
    await setToken(null);
    return null;
  }
  return (await json<{ account: Account }>(res)).account;
}

async function signIn(path: string, body: unknown): Promise<Account> {
  const { token, account } = await json<{ token: string; account: Account }>(await api(path, { body }));
  await setToken(token);
  return account;
}

export const startEmailSignIn = async (email: string) => {
  await json(await api("/api/auth/email/start", { body: { email } }));
};
export const verifyEmailSignIn = (email: string, code: string) => signIn("/api/auth/email/verify", { email, code });
export const appleSignIn = (identityToken: string, nonce: string, fullName: string | null) =>
  signIn("/api/auth/apple", { identityToken, nonce, fullName });

/** Audio sent straight to Deepgram never passes our server, so the app reports it. */
export async function reportAudio(seconds: number) {
  if (seconds < 1) return;
  await json(await api("/api/usage/audio", { body: { seconds } })).catch(() => {});
}

function requireApi() {
  if (!API_URL) throw new Error("Set EXPO_PUBLIC_API_URL to your Notestaker server.");
}

export async function generateMinutes(meeting: Meeting): Promise<Minutes> {
  const names = new Map(meeting.participants.map((p) => [p.id, p.name]));
  const res = await api("/api/minutes", {
    body: {
      title: meeting.title,
      date: new Date(meeting.createdAt).toISOString(),
      lang: meeting.lang,
      participants: meeting.participants
        .filter((p) => meeting.segments.some((s) => s.speakerId === p.id))
        .map((p) => p.name),
      invitees: meeting.calendar?.invitees.map((i) => i.name) ?? [],
      segments: meeting.segments.map((s) => ({
        speaker: names.get(s.speakerId) ?? "Unknown",
        text: s.text,
        t: Math.round(s.t),
      })),
    },
  });
  return (await json<{ minutes: Minutes }>(res)).minutes;
}

export async function diarizationEnabled(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await api("/api/transcribe");
    return (await json<{ enabled: boolean }>(res)).enabled;
  } catch {
    return false;
  }
}

export type Utterance = { speaker: number; text: string; t: number };

type DeepgramUtterance = { start: number; transcript: string; speaker?: number };

/**
 * Uploads a local recording straight to Deepgram with a short-lived token from
 * our server, so long meetings aren't limited by the backend's body size.
 */
export type DeepgramGrant = {
  /** Short-lived token; the API key never ships in the app. */
  token: string;
  /** User id to tag Deepgram requests with, for per-user usage reconciliation. */
  tag: string;
  /** Cloud audio seconds left this month on the user's plan. */
  secondsLeft: number;
};

export async function getDeepgramToken(): Promise<DeepgramGrant> {
  return json<DeepgramGrant>(await api("/api/deepgram-token", { method: "POST" }));
}

export async function transcribeFile(uri: string, mimeType: string, lang: string): Promise<Utterance[]> {
  const { token, tag } = await getDeepgramToken();
  const params = new URLSearchParams({
    model: "nova-3",
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    punctuate: "true",
    language: lang.split("-")[0],
    tag,
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
    body: new File(uri),
  });
  if (!res.ok) throw new Error("Transcription failed. Check your connection and try again.");
  const data = (await res.json()) as {
    metadata?: { duration?: number };
    results?: { utterances?: DeepgramUtterance[] };
  };
  await reportAudio(data.metadata?.duration ?? 0);
  return (data.results?.utterances ?? [])
    .filter((u) => u.transcript.trim())
    .map((u) => ({ speaker: u.speaker ?? 0, text: u.transcript.trim(), t: u.start }));
}
