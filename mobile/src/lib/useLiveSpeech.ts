import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Continuous on-device speech-to-text. Recognisers end sessions after silence
 * or OS limits, so we restart transparently while the user is still recording.
 */
export function useLiveSpeech(lang: string, onFinal: (text: string) => void) {
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const begin = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      iosTaskHint: "dictation",
    });
  }, [lang]);

  useSpeechRecognitionEvent("result", (e) => {
    const text = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      setInterim("");
      if (text.trim()) onFinalRef.current(text.trim());
    } else {
      setInterim(text);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    if (e.error === "no-speech" || e.error === "aborted" || e.error === "speech-timeout") return;
    if (e.error === "not-allowed") {
      wantRef.current = false;
      setError("Microphone or speech recognition permission was denied.");
    } else if (e.error === "language-not-supported" || e.error === "service-not-allowed") {
      wantRef.current = false;
      setError("Speech recognition isn't available for this language on this device.");
    } else if (e.error !== "interrupted") {
      setError(e.message || `Speech recognition error: ${e.error}`);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setInterim("");
    if (wantRef.current) begin();
    else setListening(false);
  });

  const start = useCallback(async () => {
    setError(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError("Microphone or speech recognition permission was denied.");
      return false;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError("Speech recognition isn't available on this device.");
      return false;
    }
    wantRef.current = true;
    setListening(true);
    begin();
    return true;
  }, [begin]);

  const stop = useCallback(() => {
    wantRef.current = false;
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
    setInterim("");
  }, []);

  return { interim, listening, error, start, stop };
}
