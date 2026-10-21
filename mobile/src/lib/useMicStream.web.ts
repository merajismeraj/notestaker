import { useCallback, useEffect, useRef } from "react";

export type PcmChunk = { data: ArrayBuffer; sampleRate: number; channels: number };

/** Web build: getUserMedia → 16 kHz mono int16 PCM (expo-audio's stream is native-only). */
export function useMicStream(onChunk: (chunk: PcmChunk) => void) {
  const onChunkRef = useRef(onChunk);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);
  const stopRef = useRef<() => void>(() => {});

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(media);
    // ScriptProcessor is deprecated but universally available and fine for this rate.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      onChunkRef.current({ data: pcm.buffer, sampleRate: ctx.sampleRate, channels: 1 });
    };
    source.connect(node);
    node.connect(ctx.destination);
    stopRef.current = () => {
      node.disconnect();
      source.disconnect();
      media.getTracks().forEach((t) => t.stop());
      void ctx.close();
    };
    return { sampleRate: ctx.sampleRate, channels: 1 };
  }, []);

  const stop = useCallback(() => stopRef.current(), []);

  return { start, stop };
}
