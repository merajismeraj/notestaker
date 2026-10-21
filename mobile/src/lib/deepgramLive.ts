// Pure helpers for Deepgram's live (streaming) API — no React Native imports,
// so they can be unit-tested directly with Node.

export type LiveWord = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
};

export type LiveResults = {
  type: "Results";
  is_final?: boolean;
  speech_final?: boolean;
  start: number;
  duration: number;
  channel: { alternatives: { transcript: string; words?: LiveWord[] }[] };
};

/** One speaker's run of words, timed relative to the connection's audio start. */
export type LiveUtterance = { speaker: number; text: string; start: number; end: number };

export function liveUrl(opts: { sampleRate: number; channels: number; lang: string; tag?: string }) {
  const params = new URLSearchParams({
    model: "nova-3",
    diarize: "true",
    encoding: "linear16",
    sample_rate: String(opts.sampleRate),
    channels: String(opts.channels),
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    endpointing: "300",
    language: opts.lang.split("-")[0],
  });
  if (opts.tag) params.set("tag", opts.tag);
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

/**
 * Splits a result into runs of consecutive words by the same speaker. A single
 * final result can span a hand-off ("…by Thursday. Great, thanks."), and each
 * side belongs on its own line.
 */
export function splitBySpeaker(result: LiveResults): LiveUtterance[] {
  const alt = result.channel.alternatives[0];
  const words = alt?.words ?? [];
  if (!words.length) {
    const text = alt?.transcript?.trim();
    return text
      ? [{ speaker: 0, text, start: result.start, end: result.start + result.duration }]
      : [];
  }
  const runs: LiveUtterance[] = [];
  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const token = w.punctuated_word ?? w.word;
    const last = runs.at(-1);
    if (last && last.speaker === speaker) {
      last.text += ` ${token}`;
      last.end = w.end;
    } else {
      runs.push({ speaker, text: token, start: w.start, end: w.end });
    }
  }
  return runs;
}

/** Interim (still-changing) text plus the speaker of its latest word. */
export function interimOf(result: LiveResults): { speaker: number; text: string } | null {
  const alt = result.channel.alternatives[0];
  const text = alt?.transcript?.trim();
  if (!text) return null;
  return { speaker: alt.words?.at(-1)?.speaker ?? 0, text };
}

/**
 * Bounded FIFO of PCM chunks captured while the socket is down, so a brief
 * network drop doesn't lose words. Oldest audio is dropped past `maxBytes`.
 */
export class PendingAudio {
  private chunks: { data: ArrayBuffer; at: number }[] = [];
  private bytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  push(data: ArrayBuffer, at: number) {
    this.chunks.push({ data, at });
    this.bytes += data.byteLength;
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      this.bytes -= this.chunks.shift()!.data.byteLength;
    }
  }

  /** Capture time (s) of the oldest buffered audio, if any. */
  get firstAt(): number | undefined {
    return this.chunks[0]?.at;
  }

  drain(): ArrayBuffer[] {
    const out = this.chunks.map((c) => c.data);
    this.chunks = [];
    this.bytes = 0;
    return out;
  }
}
