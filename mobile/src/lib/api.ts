import { fetch } from "expo/fetch";
import { File } from "expo-file-system";
import type { Minutes } from "@core/schema";
import type { Meeting } from "@core/types";

/** Base URL of the Next.js backend (e.g. https://notestaker.vercel.app). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

function requireApi() {
  if (!API_URL) throw new Error("Set EXPO_PUBLIC_API_URL to your Notestaker server.");
}

export async function generateMinutes(meeting: Meeting): Promise<Minutes> {
  requireApi();
  const names = new Map(meeting.participants.map((p) => [p.id, p.name]));
  const res = await fetch(`${API_URL}/api/minutes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  return (await json<{ minutes: Minutes }>(res)).minutes;
}

export async function diarizationEnabled(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await fetch(`${API_URL}/api/transcribe`);
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
/** Short-lived Deepgram token minted by our server (the API key never ships in the app). */
export async function getDeepgramToken(): Promise<string> {
  requireApi();
  const res = await fetch(`${API_URL}/api/deepgram-token`, { method: "POST" });
  return (await json<{ token: string }>(res)).token;
}

export async function transcribeFile(uri: string, mimeType: string, lang: string): Promise<Utterance[]> {
  const token = await getDeepgramToken();
  const params = new URLSearchParams({
    model: "nova-3",
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    punctuate: "true",
    language: lang.split("-")[0],
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
    body: new File(uri),
  });
  if (!res.ok) throw new Error("Transcription failed. Check your connection and try again.");
  const data = (await res.json()) as { results?: { utterances?: DeepgramUtterance[] } };
  return (data.results?.utterances ?? [])
    .filter((u) => u.transcript.trim())
    .map((u) => ({ speaker: u.speaker ?? 0, text: u.transcript.trim(), t: u.start }));
}
