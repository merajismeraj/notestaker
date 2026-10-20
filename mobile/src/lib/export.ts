import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";
import { groupByOwner, itemKey, minutesToMarkdown } from "@core/markdown";
import type { Meeting } from "@core/types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fileBase = (m: Meeting) =>
  (m.minutes?.title || m.title).replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "minutes";

export async function shareText(meeting: Meeting) {
  if (!meeting.minutes) return;
  await Share.share({ title: meeting.minutes.title, message: minutesToMarkdown(meeting, meeting.minutes) });
}

export async function shareMarkdownFile(meeting: Meeting) {
  if (!meeting.minutes) return;
  const file = new File(Paths.cache, `${fileBase(meeting)}.md`);
  if (file.exists) file.delete();
  file.create();
  file.write(minutesToMarkdown(meeting, meeting.minutes));
  await Sharing.shareAsync(file.uri, { mimeType: "text/markdown", dialogTitle: "Share minutes" });
}

export async function sharePdf(meeting: Meeting) {
  const m = meeting.minutes;
  if (!m) return;
  const done = new Set(meeting.done ?? []);
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:14px/1.5 -apple-system,Roboto,sans-serif;color:#151826;padding:24px}
    h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#646a80;margin:24px 0 8px}
    h3{font-size:15px;margin:12px 0 4px} .muted{color:#646a80} .done{text-decoration:line-through;color:#8a8fa3}
    .tag{font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:#eef0f6;margin-left:6px}
  </style></head><body>
    <h1>${esc(m.title)}</h1>
    <div class="muted">${esc(new Date(meeting.createdAt).toLocaleString())} · ${esc(m.attendees.map((a) => a.name).join(", "))}</div>
    <h2>Summary</h2><p>${esc(m.summary)}</p>
    <h2>Action items</h2>
    ${groupByOwner(m.action_items)
      .map(
        ([owner, items]) =>
          `<h3>${esc(owner)}</h3><ul>${items
            .map(
              (a) =>
                `<li class="${done.has(itemKey(a)) ? "done" : ""}">${esc(a.task)}<span class="tag">${a.priority}</span>${
                  a.due ? `<span class="tag">due ${esc(a.due)}</span>` : ""
                }</li>`,
            )
            .join("")}</ul>`,
      )
      .join("") || "<p class='muted'>None</p>"}
    ${m.decisions.length ? `<h2>Decisions</h2>${list(m.decisions.map((d) => d.decision + (d.made_by ? ` (${d.made_by})` : "")))}` : ""}
    ${m.discussion_points.length ? "<h2>Discussion points</h2>" : ""}
    ${m.discussion_points
      .map(
        (p) =>
          `<h3>${esc(p.topic)}</h3>${p.raised_by.length ? `<div class="muted">Raised by ${esc(p.raised_by.join(", "))}</div>` : ""}<p>${esc(p.summary)}</p>${list(p.key_notes)}`,
      )
      .join("")}
    ${m.open_questions.length ? `<h2>Open questions</h2>${list(m.open_questions)}` : ""}
    ${m.next_meeting ? `<h2>Next meeting</h2><p>${esc(m.next_meeting)}</p>` : ""}
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Share minutes" });
}
