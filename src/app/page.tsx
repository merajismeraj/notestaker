"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { listMeetings, saveMeeting } from "@/lib/store";
import { fmtClock, PALETTE, uid, type Meeting } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => setMeetings(listMeetings()), []);

  const create = () => {
    const now = new Date();
    const m: Meeting = {
      id: uid(),
      title: `Meeting ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
      createdAt: now.getTime(),
      durationSec: 0,
      lang: typeof navigator !== "undefined" ? (navigator.language || "en-US").split("@")[0] : "en-US",
      participants: [
        { id: uid(), name: "Speaker 1", color: PALETTE[0] },
        { id: uid(), name: "Speaker 2", color: PALETTE[1] },
      ],
      segments: [],
    };
    saveMeeting(m);
    router.push(`/m/${m.id}`);
  };

  return (
    <>
      <header className="topbar">
        <h1>Notestaker</h1>
      </header>
      <main>
        {meetings && meetings.length === 0 && (
          <div className="empty">
            <div className="big">🎙️</div>
            <h2>Record your first meeting</h2>
            <p className="muted">
              Live speech-to-text, speaker-tagged transcript, and AI minutes with action items per
              person — in one tap.
            </p>
          </div>
        )}

        {meetings && meetings.length > 0 && (
          <div className="stack">
            {meetings.map((m) => {
              const items = m.minutes?.action_items.length ?? 0;
              const open = items - (m.done?.length ?? 0);
              return (
                <Link key={m.id} href={`/m/${m.id}`} className="card meeting-link">
                  <h3>{m.minutes?.title || m.title}</h3>
                  <div className="muted small">
                    {new Date(m.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {" · "}
                    {fmtClock(m.durationSec)}
                    {" · "}
                    {m.participants.length} speakers
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    {m.minutes ? (
                      <span>
                        ✅ Minutes ready · {open > 0 ? `${open} open action items` : "all actions done"}
                      </span>
                    ) : (
                      <span className="muted">{m.segments.length} transcript lines · no minutes yet</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <button className="btn primary fab" onClick={create}>
        ＋ New meeting
      </button>
    </>
  );
}
