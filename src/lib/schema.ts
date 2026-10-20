import { z } from "zod";

// Shape Claude must return. Kept free of min/max constraints so it maps
// cleanly onto structured-output JSON schema.
export const MinutesSchema = z.object({
  title: z.string().describe("Short, specific meeting title"),
  summary: z
    .string()
    .describe("Executive summary in 3-5 sentences: purpose, outcome, what happens next"),
  attendees: z.array(
    z.object({
      label: z.string().describe("Speaker label exactly as it appears in the transcript"),
      name: z
        .string()
        .describe("Best real name for this speaker; same as label unless the transcript clearly reveals it"),
      contribution: z.string().describe("One line on this person's role or main contribution"),
    }),
  ),
  discussion_points: z.array(
    z.object({
      topic: z.string(),
      summary: z.string().describe("2-3 sentences on what was discussed and where it landed"),
      raised_by: z.array(z.string()).describe("Attendee names who drove this topic"),
      key_notes: z.array(z.string()).describe("Concrete facts, numbers, concerns or options mentioned"),
    }),
  ),
  decisions: z.array(
    z.object({
      decision: z.string(),
      made_by: z.string().nullable(),
    }),
  ),
  action_items: z.array(
    z.object({
      owner: z.string().describe("Attendee name, or 'Unassigned' if nobody took it"),
      task: z.string().describe("Starts with a verb; specific enough to act on without the transcript"),
      due: z.string().nullable().describe("Deadline as stated (e.g. 'Friday', '2026-11-03'), else null"),
      priority: z.enum(["high", "medium", "low"]),
      evidence: z.string().describe("Short quote or paraphrase from the transcript that creates this item"),
    }),
  ),
  open_questions: z.array(z.string()),
  next_meeting: z.string().nullable(),
});

export type Minutes = z.infer<typeof MinutesSchema>;

export const MinutesRequestSchema = z.object({
  title: z.string().max(200),
  date: z.string().max(64),
  lang: z.string().max(16),
  participants: z.array(z.string().max(80)).max(50),
  invitees: z.array(z.string().max(120)).max(200).default([]),
  segments: z
    .array(
      z.object({
        speaker: z.string().max(80),
        text: z.string().max(20000),
        t: z.number(),
      }),
    )
    .min(1)
    .max(20000),
});

export type MinutesRequest = z.infer<typeof MinutesRequestSchema>;
