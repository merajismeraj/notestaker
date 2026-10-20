# Notestaker

Mobile-first meeting notes PWA: speech-to-text transcript with speakers → AI minutes with a summary, discussion points, decisions, and **action items grouped by person**.

## Features

| | |
|---|---|
| **Capture** | Live on-device STT (Web Speech API) with tap-to-tag speaker chips · Record & auto-detect speakers (Deepgram diarization) · Upload audio · Paste Zoom/Teams/Meet transcripts (`Name: text`, `[00:12] Name: text`, VTT-style) |
| **Speakers** | Rename once and every line and action item follows. Reassign any line from its speaker dropdown, and tap a line to edit or delete it. Claude detects real names from the conversation ("Thanks, Priya") and applies them to the speakers in one tap. |
| **Minutes** | Title, executive summary, attendees with their contributions, discussion points (who raised them, key notes), decisions, action items per owner (priority, due date, supporting quote), open questions, next meeting |
| **Follow-through** | Tick action items off (saved per meeting) · Share (native share sheet) · Download `.md` · Print to PDF |
| **Mobile** | Installable PWA, safe-area aware, keeps the screen awake while recording, works in dark mode, opens offline (data stays on the device) |

## Setup

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY (required), DEEPGRAM_API_KEY (optional)
npm install
npm run dev                  # http://localhost:3000
```

On a phone, the mic needs HTTPS. Deploy (e.g. `vercel`) or tunnel your dev server.

## Architecture

```
src/app/page.tsx              meeting list
src/app/m/[id]/page.tsx       capture + transcript + minutes screen
src/app/api/minutes           Claude (claude-opus-5-5) → structured minutes (Zod schema)
src/app/api/transcribe        Deepgram nova-3 diarization proxy (keeps the key server-side)
src/lib/useSpeech.ts          Web Speech wrapper, auto-restarts on mobile silence timeouts
src/lib/importers.ts          pasted-transcript parser, diarization → participants mapping
src/lib/schema.ts             minutes schema shared by server and UI
src/lib/store.ts              localStorage (meetings) + IndexedDB (audio)
```

Minutes use Claude structured outputs, so the response always matches `MinutesSchema`. No JSON repair is needed. Refusals are handled with server-side fallbacks (`fallbacks: "default"`).

## Trade-offs

- **Live mode has no automatic diarization.** Browsers can't tell voices apart, so you tap the active speaker. For real multi-person meetings, use **Record**.
- **Vercel's request body limit is 4.5 MB.** At 24 kbps that's about 25 minutes of audio through `/api/transcribe`. For longer meetings, self-host, or move uploads to direct-to-Deepgram with short-lived keys or to blob storage.
- Firefox has no Web Speech API. Use Record, Upload or Paste there.
- Meetings are stored only in the browser. Add a database plus auth if you need team sharing or sync.
