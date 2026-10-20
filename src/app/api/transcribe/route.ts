import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type DeepgramUtterance = {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
};

/** Lets the client know whether server-side diarization is configured. */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.DEEPGRAM_API_KEY) });
}

/**
 * Accepts raw audio (body) and returns speaker-separated utterances.
 * Query: ?lang=en-US
 */
export async function POST(req: Request) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Speaker detection is not configured on this server." },
      { status: 501 },
    );
  }

  const lang = new URL(req.url).searchParams.get("lang") || "en";
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }

  const params = new URLSearchParams({
    model: "nova-3",
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    punctuate: "true",
    language: lang.split("-")[0],
  });

  const dg = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": req.headers.get("content-type") || "audio/webm",
    },
    body: audio,
  });

  if (!dg.ok) {
    console.error("Deepgram error", dg.status, await dg.text());
    return NextResponse.json({ error: "Transcription failed." }, { status: 502 });
  }

  const data = (await dg.json()) as { results?: { utterances?: DeepgramUtterance[] } };
  const utterances = (data.results?.utterances ?? [])
    .filter((u) => u.transcript.trim())
    .map((u) => ({ speaker: u.speaker ?? 0, text: u.transcript.trim(), t: u.start }));

  return NextResponse.json({ utterances });
}
