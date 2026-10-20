import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { MinutesRequestSchema, MinutesSchema } from "@/lib/schema";
import { fmtClock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const client = new Anthropic();

const SYSTEM = `You are an experienced executive assistant who writes meeting minutes.

You receive a time-stamped transcript produced by speech-to-text. Expect recognition errors, missing punctuation and filler words; infer intended meaning but never invent facts, owners or deadlines that the transcript does not support.

Write minutes that someone who missed the meeting can act on:
- Attribute every action item to the attendee who committed to it or was asked to do it. If ownership is genuinely unclear, use "Unassigned".
- Only list a decision when the group actually agreed on something.
- Speaker labels may be generic (e.g. "Speaker 2"). If the transcript clearly reveals a speaker's real name (they introduce themselves, or others address them by name in a way that identifies them), use that name in "name" and everywhere else; otherwise keep the label.
- Use attendee "name" values consistently in raised_by, made_by and owner.
- Write in the same language as the transcript.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  const body = MinutesRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { title, date, lang, participants, segments } = body.data;

  const transcript = segments
    .map((s) => `[${fmtClock(s.t)}] ${s.speaker}: ${s.text.trim()}`)
    .join("\n");

  const prompt = `Meeting: ${title || "Untitled"}
Date: ${date}
Language hint: ${lang}
Speakers: ${participants.join(", ") || "unknown"}

<transcript>
${transcript}
</transcript>

Produce the minutes.`;

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(MinutesSchema),
      },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to summarise this transcript." },
        { status: 422 },
      );
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json(
        { error: "Minutes came back incomplete. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ minutes: response.parsed_output });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited. Retry in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid Anthropic API key." }, { status: 500 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
      return NextResponse.json({ error: "Summarisation service error." }, { status: 502 });
    }
    throw error;
  }
}
