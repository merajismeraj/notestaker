# Notestaker — iOS & Android

Expo (React Native) app for the same meeting notes product. The Next.js app in the repo root is the backend: it holds the Anthropic and Deepgram keys, so neither ships inside the app.

## What's native here

| | |
|---|---|
| **Record · auto-detect speakers** | `expo-audio` with background recording. Recording continues with the screen locked or while you switch apps. Speech-tuned AAC (mono 16 kHz, 32 kbps) comes to about 14 MB per hour. On stop, the file uploads straight to Deepgram with a short-lived token from `/api/deepgram-token`, so there is no backend size limit. |
| **Live transcript** | `expo-speech-recognition` runs on-device when supported. You tap the person speaking to tag lines. The screen stays awake while it runs. |
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
src/lib/calendar.ts          device calendar → invitees
src/lib/useLiveSpeech.ts     continuous on-device STT with auto-restart
src/lib/useMeetingRecorder.ts background-capable recorder
src/lib/store.ts             AsyncStorage persistence
src/lib/export.ts            share / PDF / markdown
```

## Known gaps

- **Live mode stops when the app is backgrounded.** That's an OS rule for speech recognition. For long meetings, use Record.
- **No live speaker labels yet.** The next step is streaming audio to Deepgram's live endpoint with diarization so speakers appear as people talk.
- **The backend endpoints are unauthenticated.** Before a public release, add user auth (e.g. Sign in with Apple/Google) and rate limits so nobody else can spend your Anthropic or Deepgram credit.
- Meetings live only on the device. Sync needs a database plus auth.
