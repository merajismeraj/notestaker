# Notestaker

Meeting notes with speech-to-text: transcript with speakers → AI minutes with a summary, discussion points, decisions, and **action items grouped by person**.

- **Web app (PWA) + backend:** this directory (Next.js)
- **iOS & Android app:** [`mobile/`](mobile/README.md) (Expo). It uses this server as its backend and shares its core logic from `src/lib`.

## Features

| | |
|---|---|
| **Capture** | Live on-device STT (Web Speech API) with tap-to-tag speaker chips · Record & auto-detect speakers (Deepgram diarization) · Upload audio · Paste Zoom/Teams/Meet transcripts (`Name: text`, `[00:12] Name: text`, VTT-style) |
| **Speakers** | Rename once and every line and action item follows. Reassign any line from its speaker dropdown, and tap a line to edit or delete it. Claude detects real names from the conversation ("Thanks, Priya") and applies them to the speakers in one tap. |
| **Google Calendar** | Link an event: its title and guest list (minus declined guests and rooms) become named speakers. Speakers that auto-detection labels "Speaker N" can be renamed to a guest, which merges their lines. The guest list is sent to Claude so it can match people mentioned by first name to their full names. |
| **Minutes** | Title, executive summary, attendees with their contributions, discussion points (who raised them, key notes), decisions, action items per owner (priority, due date, supporting quote), open questions, next meeting |
| **Follow-through** | Tick action items off (saved per meeting) · Share (native share sheet) · Download `.md` · Print to PDF |
| **Mobile** | Installable PWA, safe-area aware, keeps the screen awake while recording, works in dark mode, opens offline (data stays on the device) |

## Setup

```bash
cp .env.example .env.local   # ANTHROPIC_API_KEY (required); DEEPGRAM_API_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID (optional)
npm install
npm run dev                  # http://localhost:3000
```

On a phone, the mic needs HTTPS. Deploy (e.g. `vercel`) or tunnel your dev server.

### Google Calendar setup

1. In Google Cloud Console, enable the **Google Calendar API**.
2. Under **OAuth consent screen**, add the scope `calendar.events.readonly`. While in Testing mode, list yourself and any testers as test users.
3. Create an **OAuth client ID** of type *Web application*. Under **Authorized JavaScript origins**, add `http://localhost:3000` and your deployed origin.
4. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the client ID, then rebuild (`NEXT_PUBLIC_` variables are baked in at build time).

The browser gets a short-lived read-only token through Google Identity Services, so there is no client secret and no server-side token storage. Only guest names (not emails) are sent to the server.

## Architecture

```
src/app/page.tsx              meeting list
src/app/m/[id]/page.tsx       capture + transcript + minutes screen
src/app/api/minutes           Claude (claude-opus-5-5) → structured minutes (Zod schema)
src/app/api/transcribe        Deepgram nova-3 diarization proxy (keeps the key server-side)
src/app/api/deepgram-token    short-lived Deepgram token so the mobile app uploads audio directly
src/lib/useSpeech.ts          Web Speech wrapper, auto-restarts on mobile silence timeouts
src/lib/importers.ts          pasted-transcript parser, diarization → participants mapping
src/lib/schema.ts             minutes schema shared by server and UI
src/lib/gcal.ts               Google Identity Services token flow + Calendar events → invitees
src/lib/store.ts              localStorage (meetings) + IndexedDB (audio)
```

Minutes use Claude structured outputs, so the response always matches `MinutesSchema`. No JSON repair is needed. Refusals are handled with server-side fallbacks (`fallbacks: "default"`).

## Trade-offs

- **Live mode has no automatic diarization.** Browsers can't tell voices apart, so you tap the active speaker. For real multi-person meetings, use **Record**.
- **Vercel's request body limit is 4.5 MB.** At 24 kbps that's about 25 minutes of audio through `/api/transcribe`. For longer meetings, self-host, or move uploads to direct-to-Deepgram with short-lived keys or to blob storage.
- Firefox has no Web Speech API. Use Record, Upload or Paste there.
- `calendar.events.readonly` is a sensitive scope. Going public for more than 100 users requires Google's app verification, which takes days to weeks, so plan for it before launch.
- Meetings are stored only in the browser. Add a database plus auth if you need team sharing or sync.
