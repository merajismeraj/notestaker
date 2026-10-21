# Notestaker — iOS & Android

Expo (React Native) app for the same meeting notes product. The Next.js app in the repo root is the backend: it holds the Anthropic and Deepgram keys, so neither ships inside the app.

## What's native here

| | |
|---|---|
| **Live · auto-detect speakers** (default) | The microphone (`expo-audio` `useAudioStream`, 16 kHz PCM) streams to Deepgram's live API with diarization, so lines appear already labelled "Speaker 1 / Speaker 2" as people talk. Rename a speaker mid-meeting and their later lines follow, including when the rename merges them into a calendar invitee. If the connection drops, up to 60 s of audio is buffered and replayed on reconnect. Deepgram restarts speaker numbering on each connection, so voices after a drop get new labels rather than guessed ones; one rename merges them. |
| **Record · speakers after** | `expo-audio` with background recording. Recording continues with the screen locked or while you switch apps. Speech-tuned AAC (mono 16 kHz, 32 kbps) comes to about 14 MB per hour. On stop, the file uploads straight to Deepgram with a short-lived token from `/api/deepgram-token`, so there is no backend size limit. |
| **Live · tap to tag speakers** | `expo-speech-recognition` runs on-device when supported. You tap the person speaking to tag lines. The screen stays awake while it runs. |
| **Import audio** | Voice memos and call recordings via the document picker. Speakers are detected automatically. |
| **Calendar** | `expo-calendar` reads every calendar on the phone (Google, Outlook/Exchange, iCloud) with a single permission prompt and no Google OAuth or verification. Invitees become named speakers, minus declined guests and rooms. |
| **Export** | Share sheet (text), PDF via `expo-print`, and a `.md` file. |

Shared with the web app through `@core/*` → `../src/lib/*`: types, the minutes schema, transcript importers (paste parsing, diarization mapping, merging speakers by name) and Markdown export. Only types cross from the schema, so zod isn't bundled.

## Run it on your phone

Speech recognition, background audio and calendar access are native modules, so **Expo Go won't work**. You need a development build.

```bash
cd mobile
npm install
cp .env.example .env              # point EXPO_PUBLIC_API_URL at your deployed Notestaker server
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios   # or android
npx expo start --dev-client
```

Install the build from the link EAS gives you, then open it and scan the QR code from `expo start`. With Xcode or Android Studio installed locally, `npx expo run:ios` or `npx expo run:android` works instead.

The backend needs `ANTHROPIC_API_KEY`. Record and Import also need `DEEPGRAM_API_KEY` (see the root README).

## Layout

```
src/app/_layout.tsx          stack navigator, theme
src/app/index.tsx            meeting list
src/app/m/[id].tsx           capture, transcript, minutes
src/components/              ui primitives, sheets (speakers, calendar, paste, line edit), minutes view
src/lib/api.ts               backend calls + direct Deepgram upload
src/lib/useLiveDiarization.ts streaming to Deepgram live: auth, buffering, reconnect, phrases by speaker
src/lib/deepgramLive.ts      pure parsing (speaker runs, interim, audio buffer) — unit-tested in ../tests
src/lib/useMicStream(.web).ts 16-bit PCM capture (expo-audio natively, Web Audio on web)
src/lib/calendar.ts          device calendar → invitees
src/lib/useLiveSpeech.ts     continuous on-device STT with auto-restart
src/lib/useMeetingRecorder.ts background-capable recorder
src/lib/store.ts             AsyncStorage persistence
src/lib/session.ts           session token in SecureStore (Keychain/Keystore)
src/lib/account.tsx          account context; Stack.Protected gates sign-in
src/app/sign-in.tsx          Sign in with Apple (iOS) + email code
src/lib/export.ts            share / PDF / markdown
```

## Known gaps

- **"Live · tap to tag" stops when the app is backgrounded.** That's an OS rule for on-device speech recognition. For long meetings, use either auto-detect mode.
- **Live speaker labels need a connection** for the whole meeting. If coverage is poor, use Record: it's fully offline until you stop, and Deepgram's pre-recorded model separates speakers more accurately.
- **Live auto-detect on a locked screen isn't verified yet.** Background audio is enabled, and the socket should stay open while the audio session is active, but confirm it on a real device before relying on it.
- **Google sign-in on mobile isn't added yet.** iOS offers Apple + email code, and Android offers email code. Adding Google needs native OAuth client IDs. The server already accepts any client ID listed in `GOOGLE_CLIENT_IDS`.
- **Subscriptions:** digital subscriptions sold inside the app generally have to go through App Store / Play billing (RevenueCat makes that one SDK). `EXPO_PUBLIC_UPGRADE_URL` links out instead. Check the current store rules for your regions before shipping that.
- Meetings live only on the device. Sync needs a database plus auth.
