"use client";

// Google Calendar via Google Identity Services token flow: browser-only,
// read-only scope, no server secret. Tokens live in sessionStorage (~1h).
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const TOKEN_KEY = "notestaker.gcal.token";

export type Invitee = { name: string; email: string; self?: boolean };
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  link?: string;
  invitees: Invitee[];
};

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GIS = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
};

export const calendarConfigured = () => Boolean(CLIENT_ID);

/** Loads Google Identity Services once (shared by Calendar and Sign in with Google). */
export function loadGis(): Promise<GIS> {
  const w = window as unknown as { google?: GIS };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google sign-in failed to load.")));
    s.onerror = () => reject(new Error("Google sign-in failed to load."));
    document.head.appendChild(s);
  });
}

function cachedToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw) as { token: string; exp: number };
    return Date.now() < exp ? token : null;
  } catch {
    return null;
  }
}

export const isConnected = () => Boolean(cachedToken());

/** Must be called from a user gesture: it may open Google's consent popup. */
export async function connect(): Promise<string> {
  const hit = cachedToken();
  if (hit) return hit;
  if (!CLIENT_ID) throw new Error("Google Calendar isn't configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error || "Google sign-in was cancelled."));
        try {
          sessionStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({ token: r.access_token, exp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 }),
          );
        } catch {}
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(new Error(e.type === "popup_closed" ? "Google sign-in was cancelled." : "Google sign-in failed.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function disconnect() {
  const token = cachedToken();
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  if (token) (await loadGis().catch(() => null))?.accounts.oauth2.revoke(token);
}

/** "priya.sharma@acme.com" → "Priya Sharma" when Google has no display name. */
export function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

type ApiAttendee = {
  email?: string;
  displayName?: string;
  self?: boolean;
  resource?: boolean;
  responseStatus?: string;
};
type ApiEvent = {
  id: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: ApiAttendee[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
};

/** Timed events on the given local day (all-day events can't be meetings worth minuting). */
export async function listEvents(day: Date): Promise<CalendarEvent[]> {
  const token = await connect();
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
    throw new Error("Google session expired. Tap Connect again.");
  }
  if (!res.ok) throw new Error("Couldn't load your calendar.");
  const data = (await res.json()) as { items?: ApiEvent[] };

  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime)
    .map((e) => {
      const people = e.attendees?.length
        ? e.attendees
        : e.organizer
          ? [{ ...e.organizer, responseStatus: "accepted" }]
          : [];
      const invitees = people
        .filter((a) => a.email && !a.resource && a.responseStatus !== "declined")
        .map((a) => ({
          name: a.displayName?.trim() || nameFromEmail(a.email!),
          email: a.email!,
          self: a.self,
        }));
      return {
        id: e.id,
        title: e.summary?.trim() || "(No title)",
        start: e.start!.dateTime!,
        end: e.end?.dateTime ?? e.start!.dateTime!,
        link: e.htmlLink,
        invitees,
      };
    });
}
