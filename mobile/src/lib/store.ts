import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Meeting } from "@core/types";

const KEY = "notestaker.meetings.v1";
const audioKey = (id: string) => `notestaker.audio.${id}`;

export async function listMeetings(): Promise<Meeting[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Meeting[]) : [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getMeeting(id: string) {
  return (await listMeetings()).find((m) => m.id === id);
}

// Serialise writes so rapid transcript updates can't interleave and drop data.
let queue = Promise.resolve();
const enqueue = (job: () => Promise<void>) => (queue = queue.then(job, job));

export function saveMeeting(meeting: Meeting) {
  return enqueue(async () => {
    const rest = (await listMeetings()).filter((m) => m.id !== meeting.id);
    await AsyncStorage.setItem(KEY, JSON.stringify([meeting, ...rest]));
  });
}

export function deleteMeeting(id: string) {
  return enqueue(async () => {
    const rest = (await listMeetings()).filter((m) => m.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(rest));
    await AsyncStorage.removeItem(audioKey(id));
  });
}

/** Local file URI of the meeting's recording, if one was kept. */
export const getAudioUri = (id: string) => AsyncStorage.getItem(audioKey(id));
export const setAudioUri = (id: string, uri: string) => AsyncStorage.setItem(audioKey(id), uri);
