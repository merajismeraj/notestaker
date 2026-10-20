import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Mints a short-lived Deepgram token so the mobile app can upload audio
 * straight to Deepgram (no request-size limit, no proxying), while the API
 * key stays on the server.
 */
export async function POST() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Speaker detection is not configured on this server." },
      { status: 501 },
    );
  }

  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    // Long enough to cover a slow upload of an hour-long recording.
    body: JSON.stringify({ ttl_seconds: 600 }),
  });
  if (!res.ok) {
    console.error("Deepgram grant error", res.status, await res.text());
    return NextResponse.json({ error: "Could not authorise transcription." }, { status: 502 });
  }
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return NextResponse.json({ token: access_token, expiresIn: expires_in });
}
