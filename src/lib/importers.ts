import { PALETTE, uid, type Participant, type Segment } from "./types";

const GENERIC = /^Speaker \d+$/;

type Result = { participants: Participant[]; segments: Segment[] };

function ensure(participants: Participant[], name: string): [Participant[], string] {
  const hit = participants.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (hit) return [participants, hit.id];
  const p = { id: uid(), name, color: PALETTE[participants.length % PALETTE.length] };
  return [[...participants, p], p.id];
}

const toSec = (stamp: string) =>
  stamp.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);

/**
 * Parses pasted transcripts. Handles "Name: text", "[00:12] Name: text",
 * and Zoom/Teams style blocks where a "Name" or "00:12 Name" line precedes text.
 */
export function parsePasted(text: string, current: Participant[], offset: number): Result {
  let participants = current;
  const segments: Segment[] = [];
  let speakerId = current[0]?.id;
  let t = offset;

  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const stampRe = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)(?:[.,]\d+)?\]?\s*(?:-->.*)?/;

  for (const raw of lines) {
    if (/^WEBVTT/i.test(raw) || /^\d+$/.test(raw)) continue;
    let line = raw;
    const stamp = line.match(stampRe);
    if (stamp) {
      t = offset + toSec(stamp[1]);
      line = line.slice(stamp[0].length).trim();
      if (!line) continue;
    }
    const named = line.match(/^([\p{L}][\p{L}\p{M}\p{N}.'\- ]{0,40}?)\s*:\s+(.+)$/u);
    if (named) {
      [participants, speakerId] = ensure(participants, named[1].trim());
      line = named[2];
    } else if (stamp && line.split(/\s+/).length <= 4 && !/[.?!,]$/.test(line)) {
      // "00:12 Priya Sharma" header line (Teams/Meet export)
      [participants, speakerId] = ensure(participants, line);
      continue;
    }
    if (!speakerId) [participants, speakerId] = ensure(participants, "Speaker 1");
    segments.push({ id: uid(), speakerId, text: line, t });
  }
  return { participants, segments };
}

/** Drops untouched "Speaker N" placeholders once named speakers exist. */
export function pruneUnused(participants: Participant[], segments: Segment[]) {
  const used = new Set(segments.map((s) => s.speakerId));
  const kept = participants.filter((p) => used.has(p.id) || !GENERIC.test(p.name));
  return kept.length ? kept : participants;
}

/**
 * Maps diarized speaker indices onto generic "Speaker N" participants (creating
 * as needed). Named participants (e.g. calendar invitees) are never claimed:
 * diarization says who spoke when, not who they are.
 */
export function fromDiarized(
  utterances: { speaker: number; text: string; t: number }[],
  current: Participant[],
  offset: number,
): Result {
  const participants = [...current];
  const generic = participants.filter((p) => GENERIC.test(p.name));
  for (const u of utterances) {
    while (generic.length <= u.speaker) {
      const n = participants.length;
      const p = { id: uid(), name: nextGenericName(participants), color: PALETTE[n % PALETTE.length] };
      participants.push(p);
      generic.push(p);
    }
  }
  const segments = utterances.map((u) => ({
    id: uid(),
    speakerId: generic[u.speaker].id,
    text: u.text,
    t: offset + u.t,
  }));
  return { participants, segments };
}


function nextGenericName(participants: Participant[]) {
  let n = 1;
  while (participants.some((p) => p.name === `Speaker ${n}`)) n++;
  return `Speaker ${n}`;
}

/**
 * Collapses participants that share a name (case-insensitive), e.g. after
 * renaming "Speaker 2" to an invitee who is already a chip. Lines move to the
 * first participant with that name.
 */
export function mergeByName(participants: Participant[], segments: Segment[]) {
  const keep = new Map<string, Participant>();
  const remap = new Map<string, string>();
  for (const p of participants) {
    const key = p.name.trim().toLowerCase();
    const first = keep.get(key);
    if (first) remap.set(p.id, first.id);
    else keep.set(key, p);
  }
  if (!remap.size) return { participants, segments };
  return {
    participants: [...keep.values()],
    segments: segments.map((s) =>
      remap.has(s.speakerId) ? { ...s, speakerId: remap.get(s.speakerId)! } : s,
    ),
  };
}

/** Adds invitees as speakers, dropping unused "Speaker N" placeholders. */
export function withInvitees(
  participants: Participant[],
  segments: Segment[],
  invitees: { name: string }[],
): Participant[] {
  let next = participants;
  for (const inv of invitees) [next] = ensure(next, inv.name);
  return pruneUnused(next, segments);
}
