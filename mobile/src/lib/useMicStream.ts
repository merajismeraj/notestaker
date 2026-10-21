import { useAudioStream } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

export type PcmChunk = { data: ArrayBuffer; sampleRate: number; channels: number };

/** Raw 16-bit PCM from the microphone, for streaming to a speech service. */
export function useMicStream(onChunk: (chunk: PcmChunk) => void) {
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (b) => onChunkRef.current({ data: b.data, sampleRate: b.sampleRate, channels: b.channels }),
  });

  /** Starts capture and resolves with the format the hardware actually delivers. */
  const start = useCallback(async () => {
    await stream.start();
    return { sampleRate: stream.sampleRate || 16000, channels: stream.channels || 1 };
  }, [stream]);

  const stop = useCallback(() => stream.stop(), [stream]);

  return { start, stop };
}
