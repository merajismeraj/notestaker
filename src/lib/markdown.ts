import type { Minutes } from "./schema";
import type { Meeting } from "./types";

export function groupByOwner(items: Minutes["action_items"]) {
  const map = new Map<string, Minutes["action_items"]>();
  for (const a of items) {
    const list = map.get(a.owner) ?? [];
    list.push(a);
    map.set(a.owner, list);
  }
  // Unassigned last so owners lead.
  return [...map.entries()].sort(([a], [b]) =>
    a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b),
  );
}

export const itemKey = (a: { owner: string; task: string }) => `${a.owner}|${a.task}`;

export function minutesToMarkdown(meeting: Meeting, m: Minutes): string {
  const date = new Date(meeting.createdAt).toLocaleString();
  const done = new Set(meeting.done ?? []);
  const out: string[] = [];
  out.push(`# ${m.title}`, "", `**Date:** ${date}  `);
  out.push(`**Attendees:** ${m.attendees.map((a) => a.name).join(", ")}`, "");
  out.push("## Summary", "", m.summary, "");

  if (m.attendees.length) {
    out.push("## Attendees", "");
    for (const a of m.attendees) out.push(`- **${a.name}** — ${a.contribution}`);
    out.push("");
  }

  if (m.action_items.length) {
    out.push("## Action items by owner", "");
    for (const [owner, items] of groupByOwner(m.action_items)) {
      out.push(`### ${owner}`);
      for (const a of items) {
        const due = a.due ? ` — due ${a.due}` : "";
        out.push(`- [${done.has(itemKey(a)) ? "x" : " "}] ${a.task}${due} _(${a.priority})_`);
      }
      out.push("");
    }
  }

  if (m.decisions.length) {
    out.push("## Decisions", "");
    for (const d of m.decisions) out.push(`- ${d.decision}${d.made_by ? ` _(${d.made_by})_` : ""}`);
    out.push("");
  }

  if (m.discussion_points.length) {
    out.push("## Discussion points", "");
    for (const p of m.discussion_points) {
      const by = p.raised_by.length ? ` _(raised by ${p.raised_by.join(", ")})_` : "";
      out.push(`### ${p.topic}${by}`, "", p.summary);
      for (const n of p.key_notes) out.push(`- ${n}`);
      out.push("");
    }
  }

  if (m.open_questions.length) {
    out.push("## Open questions", "");
    for (const q of m.open_questions) out.push(`- ${q}`);
    out.push("");
  }

  if (m.next_meeting) out.push("## Next meeting", "", m.next_meeting, "");
  return out.join("\n");
}
