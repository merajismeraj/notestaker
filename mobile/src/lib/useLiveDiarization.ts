import { requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "@core/types";
import { getDeepgramToken } from "./api";
import { interimOf, liveUrl, PendingAudio, splitBySpeaker, type LiveResults } from "./deepgramLive";
import { useMicStream, type PcmChunk } from "./useMicStream";

export type LiveStatus = "idle" | "connecting" | "live" | "reconnecting";

/**
 * A finalised phrase. `key` identifies the speaker within one connection
 * ("dg:<session>:<connection>:<speaker>"); times are seconds of captured audio
 * since start().
 */
export type LivePhrase = { key: string; text: string; start: number; end: number };

const BUFFER_SECONDS = 60;
const MAX_BACKOFF_MS = 10_000;

/**
 * Streams microphone PCM to Deepgram's live API with diarization, so lines
 * arrive already labelled by speaker. Audio captured while the socket is down
 * is buffered (up to 60 s) and replayed on reconnect. Speaker numbers restart
 * on each connection, so keys include the connection number and the caller
 * shows new voices after a reconnect as new labels instead of guessing.
 */
export function useLiveDiarization(lang: string, onPhrases: (phrases: LivePhrase[]) => void) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [interim, setInterim] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnects, setReconnects] = useState(0);

  const onPhrasesRef = useRef(onPhrases);
  useEffect(() => {
    onPhrasesRef.current = onPhrases;
  }, [onPhrases]);

  const want = useRef(false);
  const ws = useRef<WebSocket | null>(null);
  const session = useRef("");
  const conn = useRef(0);
  const format = useRef({ sampleRate: 16000, channels: 1 });
  const captured = useRef(0); // seconds of audio captured so far
  const pending = useRef(new PendingAudio(16000 * 2 * BUFFER_SECONDS));
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnect = useRef<() => void>(() => {});

  const mic = useMicStream((chunk: PcmChunk) => {
    const at = captured.current;
    captured.current += chunk.data.byteLength / (2 * chunk.sampleRate * chunk.channels);
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN && pending.current.firstAt === undefined) {
      socket.send(chunk.data);
    } else if (want.current) {
      pending.current.push(chunk.data, at);
    }
  });

  const connect = useCallback(async () => {
    const n = ++conn.current;
    setStatus(n === 1 ? "connecting" : "reconnecting");

    const retry = () => {
      if (!want.current) return;
      const delay = Math.min(1000 * 2 ** retries.current++, MAX_BACKOFF_MS);
      retryTimer.current = setTimeout(() => reconnect.current(), delay);
    };

    let token: string;
    try {
      token = await getDeepgramToken();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("reconnecting");
      retry();
      return;
    }
    if (!want.current) return;

    const socket = new WebSocket(
      liveUrl({ ...format.current, lang }),
      // Deepgram accepts short-lived tokens via the WebSocket subprotocol.
      ["bearer", token],
    );
    socket.binaryType = "arraybuffer";
    ws.current = socket;
    let origin = captured.current; // audio time at which this connection's stream begins

    socket.onopen = () => {
      origin = pending.current.firstAt ?? captured.current;
      for (const chunk of pending.current.drain()) socket.send(chunk);
      retries.current = 0;
      setError(null);
      setStatus("live");
    };

    socket.onmessage = (e) => {
      let msg: LiveResults | { type: string };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type !== "Results") return;
      const result = msg as LiveResults;
      const key = (speaker: number) => `dg:${session.current}:${n}:${speaker}`;
      if (result.is_final) {
        const phrases = splitBySpeaker(result).map((r) => ({
          key: key(r.speaker),
          text: r.text,
          start: origin + r.start,
          end: origin + r.end,
        }));
        setInterim(null);
        if (phrases.length) onPhrasesRef.current(phrases);
      } else {
        const i = interimOf(result);
        setInterim(i && { key: key(i.speaker), text: i.text });
      }
    };

    socket.onclose = () => {
      if (ws.current !== socket) return;
      ws.current = null;
      setInterim(null);
      if (want.current) {
        setReconnects((r) => r + 1);
        setStatus("reconnecting");
        retry();
      } else {
        setStatus("idle");
      }
    };
  }, [lang]);

  useEffect(() => {
    reconnect.current = () => void connect();
  }, [connect]);

  const start = useCallback(async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError("Microphone permission was denied.");
      return false;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: true,
      interruptionMode: "doNotMix",
    });
    session.current = uid();
    conn.current = 0;
    captured.current = 0;
    retries.current = 0;
    setReconnects(0);
    want.current = true;
    try {
      format.current = await mic.start();
    } catch (e) {
      want.current = false;
      setError(e instanceof Error ? e.message : "Couldn't start the microphone.");
      return false;
    }
    pending.current = new PendingAudio(format.current.sampleRate * 2 * format.current.channels * BUFFER_SECONDS);
    void connect();
    return true;
  }, [connect, mic]);

  /** Stops capture, lets Deepgram flush its last results, and returns seconds captured. */
  const stop = useCallback(async () => {
    want.current = false;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    mic.stop();
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise<void>((resolve) => {
        const done = setTimeout(resolve, 4000);
        socket.addEventListener("close", () => {
          clearTimeout(done);
          resolve();
        });
      });
    }
    ws.current?.close();
    ws.current = null;
    pending.current.drain();
    setInterim(null);
    setStatus("idle");
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false }).catch(() => {});
    return captured.current;
  }, [mic]);

  useEffect(
    () => () => {
      want.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      ws.current?.close();
    },
    [],
  );

  return { status, interim, error, reconnects, start, stop };
}
