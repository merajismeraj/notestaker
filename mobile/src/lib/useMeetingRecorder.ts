import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { useCallback, useState } from "react";

// Speech-tuned AAC: mono 16 kHz at 32 kbps is ~14 MB per hour.
const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
};

/** Background-capable meeting recorder (keeps going with the screen locked). */
export function useMeetingRecorder() {
  const recorder = useAudioRecorder(SPEECH);
  const [recording, setRecording] = useState(false);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error("Microphone permission was denied.");
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: true,
      interruptionMode: "doNotMix",
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }, [recorder]);

  /** Stops and returns the local file URI of the recording. */
  const stop = useCallback(async () => {
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false });
    if (!recorder.uri) throw new Error("The recording could not be saved.");
    return recorder.uri;
  }, [recorder]);

  return { recording, start, stop };
}
