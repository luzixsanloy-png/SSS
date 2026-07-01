# ClipFlow Studio

A self-hosted web app that turns product photos into short AI-generated
video clips and (optionally) auto-posts them to TikTok on a schedule.

- **Products** — upload product photos.
- **Generate Clip** — pick a product, an image model ("Nano Banana" / Imagen 4)
  and a video model (Veo 3 / Veo 2), write a prompt, and queue an 8s clip.
  A background worker enhances the photo, animates it into a video, and
  optionally posts it to a connected TikTok account.
- **TikTok Accounts** — connect TikTok Business accounts via TikTok's
  official Login Kit (OAuth2) and Content Posting API — no browser
  automation or unofficial endpoints.
- **Job Log** — track every generation/posting job with live status and
  progress.
- **Settings** — auto-post toggle, posting interval, default models, and
  default TikTok privacy level.

## Setup

```bash
npm install
cp .env.example .env
# fill in GEMINI_API_KEY and TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required credentials

| Variable | Where to get it |
| --- | --- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) — used for Imagen/Gemini image generation and Veo image-to-video |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | [TikTok Developer Portal](https://developers.tiktok.com/apps) — create an app with `user.info.basic` and `video.publish` scopes |
| `TIKTOK_REDIRECT_URI` | Must match a redirect URI registered on the TikTok app, e.g. `http://localhost:3000/api/tiktok/oauth/callback` |

**Note on TikTok posting:** newly-approved TikTok apps can only publish as
private (`SELF_ONLY`). Public posting requires TikTok to audit your app —
see the [Content Posting API docs](https://developers.tiktok.com/doc/content-posting-api-get-started).
This app only uses TikTok's official API; it does not automate a browser
or otherwise bypass TikTok's terms of service.

## How it works

- Data is stored locally in a SQLite database (`data/app.db`) via Node's
  built-in `node:sqlite` — no external database needed.
- Uploaded product photos and generated clips are stored under
  `public/uploads/`.
- A background job processor starts automatically with the server
  (`src/instrumentation.ts` → `src/lib/scheduler.ts`), polling every 15s to:
  1. generate the next queued clip (image enhance → image-to-video), and
  2. post the next ready clip to TikTok, respecting the configured
     posting interval and the auto-post toggle in Settings.
