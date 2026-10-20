"use client";

import { useState } from "react";
import { PALETTE, uid, type Participant } from "@/lib/types";

export type CaptureMode = "live" | "record" | "upload" | "paste";

export const MODES: { id: CaptureMode; icon: string; label: string; hint: string }[] = [
  {
    id: "live",
    icon: "🎙️",
    label: "Live transcript",
    hint: "On-device speech-to-text. Tap the speaker who is talking to tag lines as you go.",
  },
  {
    id: "record",
    icon: "👥",
    label: "Record · auto-detect speakers",
    hint: "Records audio, then transcribes and separates speakers automatically. Best for real meetings.",
  },
  {
    id: "upload",
    icon: "📁",
    label: "Upload audio",
    hint: "Voice memo or call recording. Speakers are detected automatically.",
  },
  {
    id: "paste",
    icon: "📋",
    label: "Paste transcript",
    hint: "From Zoom, Teams or Meet. Lines like “Name: text” keep their speakers.",
  },
];

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModePicker({
  mode,
  available,
  onPick,
}: {
  mode: CaptureMode;
  available: Record<CaptureMode, string | null>;
  onPick: (m: CaptureMode) => void;
}) {
  return (
    <div className="modes">
      {MODES.map((m) => {
        const blocked = available[m.id];
        return (
          <button
            key={m.id}
            className="mode"
            aria-pressed={mode === m.id}
            disabled={Boolean(blocked)}
            onClick={() => onPick(m.id)}
          >
            <span className="ico">{m.icon}</span>
            <span>
              <strong>{m.label}</strong>
              <span className="muted small">{blocked ?? m.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ModeSheet(props: {
  mode: CaptureMode;
  available: Record<CaptureMode, string | null>;
  onPick: (m: CaptureMode) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={props.onClose}>
      <h2>How do you want to capture?</h2>
      <ModePicker
        mode={props.mode}
        available={props.available}
        onPick={(m) => {
          props.onPick(m);
          props.onClose();
        }}
      />
    </Sheet>
  );
}

export function SpeakersSheet({
  participants,
  usedIds,
  onSave,
  onClose,
}: {
  participants: Participant[];
  usedIds: Set<string>;
  onSave: (p: Participant[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(participants);
  const set = (id: string, name: string) =>
    setList((l) => l.map((p) => (p.id === id ? { ...p, name } : p)));

  return (
    <Sheet onClose={onClose}>
      <h2>Speakers</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Rename speakers to real names — every transcript line and action item follows.
      </p>
      <div className="stack">
        {list.map((p) => (
          <div key={p.id} className="row" style={{ flexWrap: "nowrap" }}>
            <span className="avatar" style={{ "--c": p.color } as React.CSSProperties}>
              {initials(p.name)}
            </span>
            <input
              className="field"
              value={p.name}
              onChange={(e) => set(p.id, e.target.value)}
              aria-label="Speaker name"
            />
            <button
              className="icon-btn"
              aria-label="Remove speaker"
              disabled={usedIds.has(p.id) || list.length <= 1}
              title={usedIds.has(p.id) ? "Has transcript lines — reassign them first" : "Remove"}
              onClick={() => setList((l) => l.filter((x) => x.id !== p.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="btn"
          onClick={() =>
            setList((l) => [
              ...l,
              { id: uid(), name: `Speaker ${l.length + 1}`, color: PALETTE[l.length % PALETTE.length] },
            ])
          }
        >
          ＋ Add speaker
        </button>
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            onSave(list.map((p) => ({ ...p, name: p.name.trim() || "Unnamed" })));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

export function PasteSheet({
  onImport,
  onClose,
}: {
  onImport: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <Sheet onClose={onClose}>
      <h2>Paste transcript</h2>
      <textarea
        className="field"
        placeholder={"Priya: Let's lock the launch date.\nAlex: I can have the deck ready by Thursday."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!text.trim()}
          onClick={() => {
            onImport(text);
            onClose();
          }}
        >
          Import
        </button>
      </div>
    </Sheet>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (/^speaker$/i.test(parts[0]) && parts[1]) return parts[1].slice(0, 2);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
