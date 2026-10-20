"use client";

import { useCallback, useEffect, useState } from "react";
import {
  calendarConfigured,
  connect,
  disconnect,
  isConnected,
  listEvents,
  type CalendarEvent,
} from "@/lib/gcal";
import { Sheet } from "./Sheets";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function CalendarSheet({
  linkedId,
  onPick,
  onClose,
}: {
  linkedId?: string;
  onPick: (e: CalendarEvent) => void;
  onClose: () => void;
}) {
  const [connected, setConnected] = useState(isConnected());
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const day = new Date();
  day.setDate(day.getDate() + offset);

  const load = useCallback(async (dayOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      setEvents(await listEvents(d));
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(isConnected());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected) void load(offset);
    // Only auto-load when a token already exists; first connect needs a tap
    // because Google's consent popup must come from a user gesture.
  }, [offset]);

  const nowMs = Date.now();
  const dayLabel =
    offset === 0
      ? "Today"
      : offset === -1
        ? "Yesterday"
        : offset === 1
          ? "Tomorrow"
          : day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <Sheet onClose={onClose}>
      <h2>Link a calendar event</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Invitees become named speakers, and Claude uses the guest list to work out who said what.
      </p>

      {!calendarConfigured() ? (
        <div className="error">
          Google Calendar isn&apos;t configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID on the server.
        </div>
      ) : !connected ? (
        <>
          {error && <div className="error">{error}</div>}
          <button className="btn primary" style={{ width: "100%" }} disabled={loading} onClick={() => load(offset)}>
            {loading ? <span className="spinner" /> : "📅"} Connect Google Calendar
          </button>
          <p className="muted small">Read-only access. Only the linked event's title and guest names are used, and they're sent with the transcript when you generate minutes.</p>
        </>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: "nowrap" }}>
            <button className="icon-btn" aria-label="Previous day" onClick={() => setOffset((o) => o - 1)}>
              ‹
            </button>
            <strong style={{ flex: 1, textAlign: "center" }}>{dayLabel}</strong>
            <button className="icon-btn" aria-label="Next day" onClick={() => setOffset((o) => o + 1)}>
              ›
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          {loading && (
            <div className="row muted">
              <span className="spinner" /> Loading events…
            </div>
          )}
          {!loading && events?.length === 0 && <p className="muted">No meetings on this day.</p>}
          <div className="stack">
            {!loading &&
              events?.map((e) => {
                const live = Date.parse(e.start) <= nowMs && nowMs < Date.parse(e.end);
                return (
                  <button
                    key={e.id}
                    className="mode"
                    style={{ gridTemplateColumns: "64px 1fr" }}
                    aria-pressed={e.id === linkedId}
                    onClick={() => {
                      onPick(e);
                      onClose();
                    }}
                  >
                    <span className="small" style={{ fontWeight: 700 }}>
                      {time(e.start)}
                      {live && <span className="badge high" style={{ display: "block", marginTop: 4, width: "fit-content" }}>now</span>}
                    </span>
                    <span>
                      <strong>{e.title}</strong>
                      <span className="muted small">
                        {e.invitees.length
                          ? e.invitees.map((i) => i.name).join(", ")
                          : "No guests"}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn small ghost"
              onClick={async () => {
                await disconnect();
                setConnected(false);
                setEvents(null);
              }}
            >
              Disconnect Google
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
