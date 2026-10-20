"use client";

import { groupByOwner, itemKey } from "@/lib/markdown";
import type { Minutes } from "@/lib/schema";
import { PALETTE, type Participant } from "@/lib/types";
import { initials } from "./Sheets";

export function MinutesView({
  minutes,
  participants,
  done,
  createdAt,
  onToggle,
  onApplyNames,
}: {
  minutes: Minutes;
  participants: Participant[];
  done: Set<string>;
  createdAt: number;
  onToggle: (key: string) => void;
  onApplyNames?: () => void;
}) {
  const colorFor = (name: string, i: number) =>
    participants.find((p) => p.name === name)?.color ??
    (name === "Unassigned" ? "#8a8fa3" : PALETTE[i % PALETTE.length]);
  const owners = groupByOwner(minutes.action_items);
  const open = minutes.action_items.filter((a) => !done.has(itemKey(a))).length;

  return (
    <div className="stack">
      <div className="card">
        <div className="muted small">
          {new Date(createdAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </div>
        <h2 style={{ margin: "4px 0 12px", fontSize: 22 }}>{minutes.title}</h2>
        <p className="summary">{minutes.summary}</p>
        <div className="stat-row" style={{ marginTop: 16 }}>
          <div className="stat">
            <b>{minutes.attendees.length}</b>
            <span className="muted small">attendees</span>
          </div>
          <div className="stat">
            <b>{open}</b>
            <span className="muted small">open actions</span>
          </div>
          <div className="stat">
            <b>{minutes.decisions.length}</b>
            <span className="muted small">decisions</span>
          </div>
        </div>
      </div>

      {onApplyNames && (
        <div className="card row no-print">
          <span className="small" style={{ flex: 1 }}>
            Real names were detected in the conversation.
          </span>
          <button className="btn small primary" onClick={onApplyNames}>
            Apply to speakers
          </button>
        </div>
      )}

      <div className="section-title">Action items by person</div>
      {owners.length === 0 && <div className="card muted">No action items were assigned.</div>}
      {owners.map(([owner, items], i) => (
        <div key={owner} className="card owner" style={{ "--c": colorFor(owner, i) } as React.CSSProperties}>
          <h3>
            <span className="avatar">{initials(owner)}</span>
            {owner}
            <span className="muted small" style={{ fontWeight: 500 }}>
              · {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </h3>
          {items.map((a) => {
            const key = itemKey(a);
            const isDone = done.has(key);
            return (
              <label key={key} className={`task${isDone ? " done" : ""}`}>
                <input type="checkbox" checked={isDone} onChange={() => onToggle(key)} />
                <span>
                  <span className="task-text">{a.task}</span>
                  <div className="small" style={{ marginTop: 4 }}>
                    <span className={`badge ${a.priority}`}>{a.priority}</span>
                    {a.due && <span className="badge">due {a.due}</span>}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    “{a.evidence}”
                  </div>
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {minutes.decisions.length > 0 && (
        <>
          <div className="section-title">Decisions</div>
          <div className="card">
            <ul className="plain-list" style={{ marginTop: 0 }}>
              {minutes.decisions.map((d, i) => (
                <li key={i}>
                  {d.decision}
                  {d.made_by && <span className="muted"> — {d.made_by}</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="section-title">Discussion points</div>
      {minutes.discussion_points.map((p, i) => (
        <div key={i} className="card point">
          <h4>{p.topic}</h4>
          {p.raised_by.length > 0 && (
            <div className="muted small">Raised by {p.raised_by.join(", ")}</div>
          )}
          <p style={{ margin: "8px 0 0" }}>{p.summary}</p>
          {p.key_notes.length > 0 && (
            <ul>
              {p.key_notes.map((n, j) => (
                <li key={j}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="section-title">Attendees</div>
      <div className="card stack">
        {minutes.attendees.map((a, i) => (
          <div key={a.label} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
            <span className="avatar" style={{ "--c": colorFor(a.name, i) } as React.CSSProperties}>
              {initials(a.name)}
            </span>
            <div>
              <strong>{a.name}</strong>
              {a.name !== a.label && <span className="muted small"> ({a.label})</span>}
              <div className="muted small">{a.contribution}</div>
            </div>
          </div>
        ))}
      </div>

      {minutes.open_questions.length > 0 && (
        <>
          <div className="section-title">Open questions</div>
          <div className="card">
            <ul className="plain-list" style={{ marginTop: 0 }}>
              {minutes.open_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {minutes.next_meeting && (
        <>
          <div className="section-title">Next meeting</div>
          <div className="card">{minutes.next_meeting}</div>
        </>
      )}
    </div>
  );
}
