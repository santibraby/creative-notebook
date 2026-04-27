# Creative Notebook

A single-file notes app for Santi at Forma Rosa Creative.

Open the app, tap the play button, type or dictate a thought, and it commits to a private companion repo as a JSON entry with an ISO-8601 UTC timestamp. No backend, no third-party services — just GitHub Pages + the GitHub Contents API.

## Architecture

- `index.html` — the entire app
- Data lives in [`creative-notebook-data`](https://github.com/santibraby/creative-notebook-data) (private repo), partitioned per year as `data-YYYY.json`
- On first load the app prompts for a fine-grained GitHub Personal Access Token (PAT) and stores it in `localStorage`

## Deploy

1. Create two repos under your GitHub account:
   - **Public:** `creative-notebook` (this one) — will be served via GitHub Pages
   - **Private:** `creative-notebook-data` — holds the entries
2. Push this repo to `creative-notebook` on `main`
3. Push the `creative-notebook-data` scaffold (in this same project folder) to the private repo on `main`
4. On the public repo: Settings → Pages → Source: `main` / `/ (root)` → Save
5. Generate a fine-grained PAT (see below) and paste it into the app on first visit

## PAT setup

Generate a fine-grained PAT at https://github.com/settings/personal-access-tokens/new

- **Resource owner:** your account
- **Repository access:** Only `creative-notebook-data`
- **Permissions:**
  - **Contents:** Read and write
  - **Metadata:** Read (required default)

Paste it into the app when prompted. It's stored in `localStorage` only on this device.

## How an entry is saved

Each entry is a flat JSON object:

```json
{
  "id": "9e81f5b6-2c1f-4d0a-9c7d-8a3b6e5f2c11",
  "timestamp": "2026-04-27T14:32:18.521Z",
  "text": "Follow up with Lex tomorrow about the showroom contract.",
  "source": "typed"
}
```

- `id` — UUIDv4 (or a fallback equivalent)
- `timestamp` — `new Date().toISOString()`, used to bucket the entry into `data-<year>.json`
- `text` — body of the note
- `source` — `"typed"` or `"voice"` (auto-set based on whether the microphone was used during composition)

On submit, the app:

1. `GET`s the relevant `data-YYYY.json` (with cache-busting) to get its current SHA + content
2. Appends the new entry, sorts by timestamp, JSON-stringifies with 2-space indent
3. UTF-8-safe base64 encodes
4. `PUT`s back via the GitHub Contents API with the prior SHA (or omitted SHA if creating)
5. On 409/422 SHA conflict: reload the year, reapply, retry once

## Keyboard

- **Enter** in the PAT field → connect
- **Cmd/Ctrl + Enter** in the entry textarea → save
- **Esc** in the entry textarea → cancel

## Microphone

Tap the mic icon to start dictating; tap again to stop. The app runs two browser APIs in parallel on the same microphone, so you always know what's happening:

- **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) — does the actual transcription. Locale is `en-US`. Final phrases are appended to whatever's already typed.
- **Web Audio API** (`AnalyserNode`) — drives a live waveform of vertical bars and a silence detector. Even if the speech engine has a hiccup, the waveform proves your mic is being captured.

Status indicator (in the recording panel below the textarea) cycles through:

- **listening** — mic is open, no speech yet
- **speech detected** — the analyser sees audio peaks above the noise floor
- **transcribed** — a final transcript just arrived
- **no audio detected** — silent for 3+ seconds (likely a mic problem)
- **could not understand** / **recognition error - retrying** — the engine reported a problem; will keep trying

Both APIs need microphone permission. The browser should only prompt once per session. The waveform requires `AnalyserNode` (universal in modern browsers); the transcription requires `SpeechRecognition` (Chrome and Safari work best). If transcription is unsupported, the mic button disables itself.

No audio is recorded or stored — speech is transcribed live and only the resulting text is saved.

## Home screen dashboard

The home screen displays a synthesized review fetched from `creative-notebook-data/summary.json`. Sections are rendered in array order with bulleted items and optional italic notes. If the file is missing or empty, an empty-state message appears.

The summary is regenerated manually during a chat session with Cowork (Claude desktop) - it is never auto-refreshed. The flow:

1. Run `pull.bat` to sync the latest entries from GitHub into your local data folder
2. Open Cowork and ask for a review of recent entries
3. Cowork writes a new `summary.json` into `creative-notebook-data/`
4. Run `push.bat` to ship the new summary to GitHub
5. Reload the app - the new dashboard appears

See `creative-notebook-data/README.md` for the full summary schema.

## What's next

Future ideas: search, edit, delete, export, archived view of past summaries.

## Reset

Tap the small "reset connection" link in the bottom-right of the app to wipe the saved token from this device. Your data on GitHub is untouched.
