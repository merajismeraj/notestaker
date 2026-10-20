"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarSheet } from "@/components/CalendarSheet";
import { MinutesView } from "@/components/MinutesView";
import {
  initials,
  MODES,
  ModePicker,
  ModeSheet,
  PasteSheet,
  SpeakersSheet,
  type CaptureMode,
} from "@/components/Sheets";
import { Transcript } from "@/components/Transcript";
import { calendarConfigured, type CalendarEvent } from "@/lib/gcal";
import { fromDiarized, mergeByName, parsePasted, pruneUnused, withInvitees } from "@/lib/importers";
import { minutesToMarkdown } from "@/lib/markdown";
import type { Minutes } from "@/lib/schema";
import { deleteMeeting, getMeeting, putAudio, saveMeeting } from "@/lib/store";
import { fmtClock, uid, type Meeting, type Segment } from "@/lib/types";
import { speechSupported, useSpeech } from "@/lib/useSpeech";

type Sheet = null | "speakers" | "mode" | "paste" | "calendar";
type WakeLock = { release: () => Promise<void> };

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [tab, setTab] = useState<"transcript" | "minutes">("transcript");
  const [mode, setMode] = useState<CaptureMode>("live");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [busy, setBusy] = useState<null | "transcribing" | "summarising">(null);
  const [error, setError] = useState<string | null>(null);
  const [diarize, setDiarize] = useState(false);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(Date.now());

  const startRef = useRef(0);
  const baseRef = useRef(0);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wakeRef = useRef<WakeLock | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load + capability detection
  useEffect(() => {
    const m = getMeeting(id);
    if (!m) {
      router.replace("/");
      return;
    }
    setMeeting(m);
    setActiveId(m.participants[0]?.id ?? "");
    if (m.minutes) setTab("minutes");
    fetch("/api/transcribe")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => {
        setDiarize(d.enabled);
        if (d.enabled && m.segments.length === 0 && typeof MediaRecorder !== "undefined") {
          setMode("record");
        }
      })
      .catch(() => {});
  }, [id, router]);

  const update = useCallback((fn: (m: Meeting) => Meeting) => {
    setMeeting((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveMeeting(next);
      return next;
    });
  }, []);

  // Keeps the tap-to-tag selection valid after speakers merge or disappear.
  const setPeople = (m: Meeting, participants: Meeting["participants"], segments = m.segments): Meeting => {
    const merged = mergeByName(participants, segments);
    if (!merged.participants.some((p) => p.id === activeRef.current)) {
      setActiveId(merged.participants[0]?.id ?? "");
    }
    return { ...m, participants: merged.participants, segments: merged.segments };
  };

  const linkEvent = (e: CalendarEvent) =>
    update((m) => {
      const invitees = e.invitees.map(({ name, email }) => ({ name, email }));
      return setPeople(
        {
          ...m,
          title: e.title,
          calendar: { eventId: e.id, start: e.start, end: e.end, link: e.link, invitees },
        },
        withInvitees(m.participants, m.segments, invitees),
      );
    });

  const elapsed = () => baseRef.current + (Date.now() - startRef.current) / 1000;

  const speech = useSpeech(meeting?.lang ?? "en-US", (text) => {
    const seg: Segment = { id: uid(), speakerId: activeRef.current, text, t: elapsed() };
    update((m) => ({ ...m, segments: [...m.segments, seg] }));
  });

  const available = useMemo<Record<CaptureMode, string | null>>(
    () => ({
      live: typeof window !== "undefined" && !speechSupported()
        ? "Not supported in this browser — use Chrome, Edge or Safari."
        : null,
      record: !diarize
        ? "Needs DEEPGRAM_API_KEY on the server."
        : typeof MediaRecorder === "undefined"
          ? "Audio recording not supported in this browser."
          : null,
      upload: diarize ? null : "Needs DEEPGRAM_API_KEY on the server.",
      paste: null,
    }),
    [diarize],
  );

  // Timer tick
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [recording]);

  // Keep the screen on while capturing; mobile browsers kill the mic on sleep.
  const lockScreen = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      wakeRef.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {}
  };
  const unlockScreen = () => {
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  };

  const transcribe = async (blob: Blob, offset: number) => {
    if (!meeting) return;
    setBusy("transcribing");
    setError(null);
    try {
      const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(meeting.lang)}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed.");
      if (!data.utterances.length) throw new Error("No speech detected in the audio.");
      update((m) => {
        const r = fromDiarized(data.utterances, m.participants, offset);
        return { ...m, participants: r.participants, segments: [...m.segments, ...r.segments] };
      });
      setSheet("speakers");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!meeting) return;
    setError(null);
    baseRef.current = meeting.durationSec;
    startRef.current = Date.now();
    setNow(Date.now());

    if (mode === "live") {
      speech.start();
      setRecording(true);
      void lockScreen();
      return;
    }
    if (mode === "record") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        // ~24 kbps Opus keeps an hour of audio around 11 MB.
        const rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 24000 });
        const chunks: Blob[] = [];
        const offset = meeting.durationSec;
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          void putAudio(meeting.id, blob);
          void transcribe(blob, offset);
        };
        rec.start(1000);
        recorderRef.current = rec;
        setRecording(true);
        void lockScreen();
      } catch {
        setError("Microphone permission denied.");
      }
      return;
    }
    if (mode === "upload") fileRef.current?.click();
    if (mode === "paste") setSheet("paste");
  };

  const stop = () => {
    if (!recording) return;
    const dur = elapsed();
    speech.stop();
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    unlockScreen();
    update((m) => ({ ...m, durationSec: dur, hasAudio: m.hasAudio || mode === "record" }));
  };

  const generate = async () => {
    if (!meeting) return;
    if (recording) stop();
    setBusy("summarising");
    setError(null);
    const names = new Map(meeting.participants.map((p) => [p.id, p.name]));
    try {
      const res = await fetch("/api/minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meeting.title,
          date: new Date(meeting.createdAt).toISOString(),
          lang: meeting.lang,
          participants: meeting.participants
            .filter((p) => meeting.segments.some((s) => s.speakerId === p.id))
            .map((p) => p.name),
          invitees: meeting.calendar?.invitees.map((i) => i.name) ?? [],
          segments: meeting.segments.map((s) => ({
            speaker: names.get(s.speakerId) ?? "Unknown",
            text: s.text,
            t: Math.round(s.t),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate minutes.");
      update((m) => ({ ...m, minutes: data.minutes as Minutes, minutesAt: Date.now(), done: [] }));
      setTab("minutes");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Surface speech errors in the shared error banner
  useEffect(() => {
    if (speech.error) {
      setError(speech.error);
      setRecording(false);
      unlockScreen();
    }
  }, [speech.error]);

  if (!meeting) return null;

  const usedIds = new Set(meeting.segments.map((s) => s.speakerId));
  const activeSpeaker = meeting.participants.find((p) => p.id === activeId);
  const shownTime = recording ? baseRef.current + (now - startRef.current) / 1000 : meeting.durationSec;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const renamable =
    meeting.minutes?.attendees.filter(
      (a) => a.name !== a.label && meeting.participants.some((p) => p.name === a.label),
    ) ?? [];

  const markdown = () => (meeting.minutes ? minutesToMarkdown(meeting, meeting.minutes) : "");
  const share = async () => {
    const text = markdown();
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: meeting.minutes?.title, text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text);
      alert("Minutes copied to clipboard.");
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown" }));
    a.download = `${(meeting.minutes?.title || meeting.title).replace(/[^\w\- ]+/g, "").trim() || "minutes"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="topbar">
        <Link href="/" className="icon-btn" aria-label="Back">
          ‹
        </Link>
        <input
          className="title-input"
          value={meeting.title}
          onChange={(e) => update((m) => ({ ...m, title: e.target.value }))}
          aria-label="Meeting title"
        />
        <button
          className="icon-btn"
          aria-label="Delete meeting"
          onClick={() => {
            if (confirm("Delete this meeting and its transcript?")) {
              deleteMeeting(meeting.id);
              router.replace("/");
            }
          }}
        >
          🗑
        </button>
      </header>

      <main>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>
            Transcript
          </button>
          <button role="tab" aria-selected={tab === "minutes"} onClick={() => setTab("minutes")}>
            Minutes{meeting.minutes ? " ✓" : ""}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === "transcript" && (
          <>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="muted small">
                {mode === "live" ? "Tap who's speaking" : "Speakers"}
              </span>
              <span className="spacer" />
              {calendarConfigured() && (
                <button className="btn small ghost" onClick={() => setSheet("calendar")}>
                  📅 Calendar
                </button>
              )}
              <button className="btn small ghost" onClick={() => setSheet("speakers")}>
                Edit names
              </button>
            </div>
            {meeting.calendar && (
              <button
                className="muted small"
                style={{ border: 0, background: "none", padding: "0 0 8px", textAlign: "left", cursor: "pointer" }}
                onClick={() => setSheet("calendar")}
              >
                📅 {new Date(meeting.calendar.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                {" – "}
                {new Date(meeting.calendar.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                {" · "}
                {meeting.calendar.invitees.length} invited · change
              </button>
            )}
            <div className="speakers">
              {meeting.participants.map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  aria-pressed={p.id === activeId}
                  style={{ "--c": p.color } as React.CSSProperties}
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="avatar">{initials(p.name)}</span>
                  {p.name}
                </button>
              ))}
              <button className="chip" onClick={() => setSheet("speakers")} aria-label="Add speaker">
                ＋
              </button>
            </div>

            {meeting.segments.length === 0 && !speech.interim ? (
              busy === "transcribing" ? (
                <div className="card row">
                  <span className="spinner" /> Transcribing and detecting speakers…
                </div>
              ) : recording ? (
                <div className="card muted">
                  {mode === "live"
                    ? "Listening… start talking."
                    : "Recording… the transcript appears with speakers when you stop."}
                </div>
              ) : (
                <>
                  {calendarConfigured() && !meeting.calendar && (
                    <button
                      className="mode"
                      style={{ marginTop: 8 }}
                      onClick={() => setSheet("calendar")}
                    >
                      <span className="ico">📅</span>
                      <span>
                        <strong>Link a Google Calendar event</strong>
                        <span className="muted small">
                          Pull the title and attendee names so speakers and action items get real names.
                        </span>
                      </span>
                    </button>
                  )}
                  <div className="section-title">Choose how to capture</div>
                  <ModePicker mode={mode} available={available} onPick={setMode} />
                </>
              )
            ) : (
              <>
                <Transcript
                  segments={meeting.segments}
                  participants={meeting.participants}
                  interim={speech.interim}
                  interimSpeaker={activeSpeaker}
                  follow={recording}
                  onChange={(sid, patch) =>
                    update((m) => ({
                      ...m,
                      segments: m.segments.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
                    }))
                  }
                  onDelete={(sid) =>
                    update((m) => ({ ...m, segments: m.segments.filter((s) => s.id !== sid) }))
                  }
                />
                {busy === "transcribing" && (
                  <div className="card row" style={{ marginTop: 12 }}>
                    <span className="spinner" /> Transcribing and detecting speakers…
                  </div>
                )}
                {recording && mode === "record" && (
                  <p className="muted small">Recording… new lines appear when you stop.</p>
                )}
              </>
            )}
          </>
        )}

        {tab === "minutes" &&
          (meeting.minutes ? (
            <>
              <div className="row no-print" style={{ marginBottom: 12 }}>
                <button className="btn small" onClick={share}>
                  ↗ Share
                </button>
                <button className="btn small" onClick={download}>
                  ⬇ .md
                </button>
                <button className="btn small" onClick={() => window.print()}>
                  🖨 PDF
                </button>
                <span className="spacer" />
                <button className="btn small ghost" onClick={generate} disabled={busy !== null}>
                  ↻ Regenerate
                </button>
              </div>
              <MinutesView
                minutes={meeting.minutes}
                participants={meeting.participants}
                done={new Set(meeting.done ?? [])}
                createdAt={meeting.createdAt}
                onToggle={(key) =>
                  update((m) => {
                    const d = new Set(m.done ?? []);
                    if (d.has(key)) d.delete(key);
                    else d.add(key);
                    return { ...m, done: [...d] };
                  })
                }
                onApplyNames={
                  renamable.length
                    ? () =>
                        update((m) => {
                          const map = new Map(renamable.map((a) => [a.label, a.name]));
                          return setPeople(
                            {
                              ...m,
                              minutes: m.minutes && {
                                ...m.minutes,
                                attendees: m.minutes.attendees.map((a) => ({ ...a, label: a.name })),
                              },
                            },
                            m.participants.map((p) => ({ ...p, name: map.get(p.name) ?? p.name })),
                          );
                        })
                    : undefined
                }
              />
            </>
          ) : (
            <div className="card empty">
              <div className="big">📝</div>
              <p className="muted">
                {meeting.segments.length
                  ? "Generate minutes: summary, discussion points, decisions and action items per person."
                  : "Capture a conversation first, then generate minutes."}
              </p>
            </div>
          ))}

        {busy === "summarising" && (
          <div className="card row" style={{ marginTop: 12 }}>
            <span className="spinner" /> Writing minutes and assigning action items…
          </div>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/mp4,video/webm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            void putAudio(meeting.id, f);
            update((m) => ({ ...m, hasAudio: true }));
            void transcribe(f, meeting.durationSec);
          }
        }}
      />

      <div className="dock">
        <div className="dock-inner">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="timer">{fmtClock(shownTime)}</div>
            <button
              className="btn small ghost"
              style={{ padding: 0, minHeight: 24 }}
              disabled={recording}
              onClick={() => setSheet("mode")}
            >
              {modeInfo.icon} {modeInfo.label.split(" ·")[0]} ▾
            </button>
          </div>
          <button
            className={`rec${recording ? " on" : ""}`}
            aria-label={recording ? "Stop" : "Start"}
            onClick={recording ? stop : start}
            disabled={busy !== null || Boolean(available[mode])}
          >
            <span />
          </button>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn primary"
              disabled={meeting.segments.length === 0 || busy !== null}
              onClick={generate}
            >
              {busy === "summarising" ? <span className="spinner" /> : "✨"} Minutes
            </button>
          </div>
        </div>
      </div>

      {sheet === "speakers" && (
        <SpeakersSheet
          participants={meeting.participants}
          usedIds={usedIds}
          suggestions={meeting.calendar?.invitees.map((i) => i.name)}
          onSave={(participants) => update((m) => setPeople(m, participants))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "calendar" && (
        <CalendarSheet
          linkedId={meeting.calendar?.eventId}
          onPick={linkEvent}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "mode" && (
        <ModeSheet mode={mode} available={available} onPick={setMode} onClose={() => setSheet(null)} />
      )}
      {sheet === "paste" && (
        <PasteSheet
          onClose={() => setSheet(null)}
          onImport={(text) => {
            update((m) => {
              const r = parsePasted(text, m.participants, m.durationSec);
              const last = r.segments.at(-1)?.t ?? m.durationSec;
              const segments = [...m.segments, ...r.segments];
              return setPeople(
                { ...m, durationSec: Math.max(m.durationSec, last) },
                pruneUnused(r.participants, segments),
                segments,
              );
            });
          }}
        />
      )}
    </>
  );
}
