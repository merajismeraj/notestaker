import type { Minutes } from "./schema";

export type Participant = {
  id: string;
  name: string;
  color: string;
};

export type Segment = {
  id: string;
  speakerId: string;
  text: string;
  /** Seconds from meeting start. */
  t: number;
};

export type Meeting = {
  id: string;
  title: string;
  createdAt: number;
  durationSec: number;
  lang: string;
  participants: Participant[];
  segments: Segment[];
  minutes?: Minutes;
  minutesAt?: number;
  /** Action item keys (owner|task) the user ticked off. */
  done?: string[];
  hasAudio?: boolean;
  /** Linked Google Calendar event; invitees seed speaker names. */
  calendar?: {
    eventId: string;
    start: string;
    end: string;
    link?: string;
    invitees: { name: string; email: string }[];
  };
};

export const PALETTE = [
  "#4f6bed",
  "#e0703a",
  "#1f9d74",
  "#c2489b",
  "#8a63d2",
  "#c79a12",
  "#2b8fbd",
  "#d1495b",
];

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
