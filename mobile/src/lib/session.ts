import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// The session token lives in the Keychain / Keystore. Web (dev preview only)
// falls back to localStorage because SecureStore is native-only.
const KEY = "notestaker.session";
let cached: string | null | undefined;
const listeners = new Set<() => void>();

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  cached = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
  return cached;
}

export async function setToken(token: string | null) {
  cached = token;
  if (Platform.OS === "web") {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
  } else if (token) {
    await SecureStore.setItemAsync(KEY, token);
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
  listeners.forEach((l) => l());
}

/** Called when the token changes (sign-in, sign-out, or the server rejected it). */
export function onSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
