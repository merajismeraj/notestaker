"use client";

import type { Meeting } from "./types";

// Meetings live in localStorage (small JSON); audio blobs in IndexedDB.
const KEY = "notestaker.meetings.v1";

export function listMeetings(): Meeting[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Meeting[]) : [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function getMeeting(id: string): Meeting | undefined {
  return listMeetings().find((m) => m.id === id);
}

export function saveMeeting(meeting: Meeting) {
  const rest = listMeetings().filter((m) => m.id !== meeting.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([meeting, ...rest]));
  } catch (e) {
    console.error("Could not save meeting", e);
  }
}

export function deleteMeeting(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listMeetings().filter((m) => m.id !== id)));
  } catch {}
  void deleteAudio(id);
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("notestaker", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("audio");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const r = run(d.transaction("audio", mode).objectStore("audio"));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const putAudio = (id: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, id));
export const getAudio = (id: string) =>
  tx<Blob | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
export const deleteAudio = (id: string) => tx("readwrite", (s) => s.delete(id)).catch(() => {});
