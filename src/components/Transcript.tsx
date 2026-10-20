"use client";

import { useEffect, useRef, useState } from "react";
import { fmtClock, type Participant, type Segment } from "@/lib/types";
import { initials } from "./Sheets";

export function Transcript({
  segments,
  participants,
  interim,
  interimSpeaker,
  follow,
  onChange,
  onDelete,
}: {
  segments: Segment[];
  participants: Participant[];
  interim: string;
  interimSpeaker?: Participant;
  follow: boolean;
  onChange: (id: string, patch: Partial<Segment>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const byId = new Map(participants.map((p) => [p.id, p]));

  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length, interim, follow]);

  return (
    <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
      {segments.map((s) => {
        const p = byId.get(s.speakerId) ?? participants[0];
        const style = { "--c": p?.color } as React.CSSProperties;
        return (
          <div key={s.id} className="seg" style={style}>
            <span className="avatar">{initials(p?.name ?? "?")}</span>
            <div>
              <div className="seg-head">
                <select
                  value={s.speakerId}
                  onChange={(e) => onChange(s.id, { speakerId: e.target.value })}
                  aria-label="Speaker"
                >
                  {participants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <span className="muted">{fmtClock(s.t)}</span>
              </div>
              {editing === s.id ? (
                <>
                  <textarea
                    autoFocus
                    defaultValue={s.text}
                    onBlur={(e) => {
                      const text = e.target.value.trim();
                      if (text) onChange(s.id, { text });
                      setEditing(null);
                    }}
                  />
                  <button
                    className="btn small danger ghost"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onDelete(s.id);
                      setEditing(null);
                    }}
                  >
                    Delete line
                  </button>
                </>
              ) : (
                <div className="seg-text" onClick={() => setEditing(s.id)}>
                  {s.text}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {interim && (
        <div className="seg" style={{ "--c": interimSpeaker?.color } as React.CSSProperties}>
          <span className="avatar">{initials(interimSpeaker?.name ?? "?")}</span>
          <div className="seg-text interim">{interim}…</div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
