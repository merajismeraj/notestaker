import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBySpeaker, interimOf, PendingAudio, liveUrl } from "../mobile/src/lib/deepgramLive";
import { resolveLiveSpeaker, mergeByName } from "../src/lib/importers";

// Deepgram-shaped fixtures
const w = (word: string, speaker: number, start: number) => ({ word: word.toLowerCase(), punctuated_word: word, start, end: start + 0.3, speaker });
const res = (words: ReturnType<typeof w>[], is_final = true) => ({ type: "Results" as const, is_final, start: 0, duration: 3, channel: { alternatives: [{ transcript: words.map((x) => x.punctuated_word).join(" "), words }] } });

test("splits a hand-off into per-speaker runs", () => {
  const r = splitBySpeaker(res([w("Thursday.", 1, 1.0), w("Great,", 0, 1.6), w("thanks.", 0, 1.9)]));
  assert.deepEqual(r.map((x) => [x.speaker, x.text, x.start]), [[1, "Thursday.", 1.0], [0, "Great, thanks.", 1.6]]);
});
test("empty results produce nothing; interim reports latest speaker", () => {
  assert.deepEqual(splitBySpeaker(res([])), []);
  assert.deepEqual(interimOf(res([w("Hi", 0, 0), w("there", 2, 0.4)], false)), { speaker: 2, text: "Hi there" });
});
test("pending audio is bounded and keeps the newest", () => {
  const p = new PendingAudio(10);
  p.push(new ArrayBuffer(4), 1); p.push(new ArrayBuffer(4), 2); p.push(new ArrayBuffer(4), 3);
  assert.equal(p.firstAt, 2);
  assert.equal(p.drain().length, 2);
  assert.equal(p.firstAt, undefined);
});
test("url carries rate, diarize and base language", () => {
  const u = new URL(liveUrl({ sampleRate: 48000, channels: 1, lang: "en-US" }));
  assert.equal(u.searchParams.get("sample_rate"), "48000");
  assert.equal(u.searchParams.get("diarize"), "true");
  assert.equal(u.searchParams.get("language"), "en");
});
test("live speakers claim placeholders, survive rename-merge, and get fresh labels on reconnect", () => {
  let participants = [
    { id: "p1", name: "Speaker 1", color: "#1" },
    { id: "p2", name: "Speaker 2", color: "#2" },
    { id: "inv", name: "Priya Sharma", color: "#3" },
  ];
  let segments: { id: string; speakerId: string; text: string; t: number }[] = [];
  const aliases = new Map<string, string>();
  const say = (key: string) => {
    const r = resolveLiveSpeaker(participants, segments, aliases, key);
    participants = r.participants;
    segments = [...segments, { id: String(segments.length), speakerId: r.id, text: "x", t: 0 }];
    return r.id;
  };
  assert.equal(say("dg:s:1:0"), "p1");
  assert.equal(say("dg:s:1:1"), "p2");
  assert.equal(say("dg:s:1:0"), "p1"); // stable
  // idempotent (React may run updaters twice)
  assert.equal(resolveLiveSpeaker(participants, segments, aliases, "dg:s:1:0").id, "p1");
  // user renames Speaker 1 → Priya Sharma, which merges into the invitee
  const renamed = participants.map((p) => (p.id === "p1" ? { ...p, name: "Priya Sharma" } : p));
  const m = mergeByName(renamed, segments);
  for (const [from, to] of m.remap) aliases.set(from, to);
  participants = m.participants; segments = m.segments;
  // merge keeps the first "Priya Sharma" in list order (p1), so the invitee folds in
  assert.equal(say("dg:s:1:0"), m.remap.get("inv") ? "p1" : "inv");
  assert.equal(participants.filter((p) => p.name === "Priya Sharma").length, 1);
  // reconnect: a new connection's speaker 0 is a new label, not silently Priya
  const id = say("dg:s:2:0");
  assert.equal(participants.find((p) => p.id === id)?.name, "Speaker 3");
});
