# Meet the CEO

## Overview

Meet the CEO gives every new hire their own welcome from the CEO, then lets them ask questions. The company adds its story: why it started, the mission, the values, this year's goal and what each team does. HR fills in a new hire's name, role, team and start date, or picks them from a list. A live Spatius avatar, Amara, a made-up CEO, greets that person by name and links their own team's work to the mission, in about a minute.

After the welcome, the new hire can ask Amara anything, out loud or typed: "why did you start the company?", "what is our goal this year?". She answers only from the company story, in her own voice, and the panel shows the section and the exact words. If the story does not say, she says she will not make it up.

Its standout feature is the **personal welcome**, with **one link per new hire**. "Copy their welcome link" makes a link that opens that person's own welcome. HR sends it with the welcome email. Nothing is stored: the name, role, team and start date travel in the link.

This repository is a small, complete template. It runs on your computer in a few minutes with only your Spatius API key and App ID. It is for HR and people teams, founders, HR tech and intranet products, and for developers who want an avatar to speak a personalised message built from a template and data.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/spatius-ai/meet-the-ceo)

## Why this matters

In a growing company, most new hires never hear from the CEO directly, and a generic welcome video does not say how their own job matters. A welcome by name, that links their team to the mission and that they can answer with questions, makes day one feel personal, at any size.

## User flow

1. HR keeps the sample story (Tallyfield, a made-up company) or pastes the company's own.
2. HR fills in a new hire (name, role, team, start date), or pastes a list and picks a name.
3. "Play the welcome": Amara greets the person by name, mentions their start date, says why the company exists and what the mission is, links their team's work to the mission in one sentence, names one value, and invites questions. The panel shows that linking sentence and the part of the story it comes from.
4. The new hire asks questions, by voice, typing or a suggested question. Each answer shows the section and the exact words, or "Not in the company story".
5. "Copy their welcome link" copies a link that opens this person's welcome, ready to send.

## Architecture

```text
meet-the-ceo/
  README.md
  LICENSE
  package.json
  vite.config.mjs           builds the web page and copies the avatar engine files
  wrangler.jsonc            Cloudflare Workers settings
  .env.example              settings for running on your computer
  .dev.vars.example         secrets for Cloudflare
  server/
    brain.mjs               the CEO itself: sections, the personal welcome and its checks, answers with checked quotes
    voices.mjs              optional ElevenLabs voices, one per person (used when ELEVENLABS_API_KEY is set)
    app.mjs                 the API: session token, hearing, welcome, answers, voice (uses brain.mjs)
    node.mjs                runs the app on your computer
    worker.mjs              runs the app on Cloudflare Workers
  web/
    index.html              the page: the story, the new hire, the CEO and the panel
    src/main.ts             the welcome spoken sentence by sentence, the questions, the welcome link, the microphone
    src/ceo.css             the look of the office, the panel and the cards
    src/seat.ts             the Spatius avatar: load, connect, speak
    public/embed.js         puts the CEO on any page with one line
    public/assets/          fonts, the CEO's portrait and the office picture
```

The code has three parts, so you can keep the part you need. `server/brain.mjs` is what makes it a personal welcome; `server/app.mjs` connects it to OpenAI and the browser; `web/src/seat.ts` connects the avatar. The same `server/app.mjs` runs in both places.

**How the welcome stays true.** `sectionsOf()` cuts the story into sections in code, and each team's section ("### Sales") becomes its own section. `teamSection()` finds the new hire's team in code, so the CEO is given exactly what that team does; if the story has no section for the team, she links their role to the mission in general terms and does not invent what the team does. `startText()` writes the start date out in the language, in code. `readWelcome()` then checks the welcome: any sentence with a number that is not in the story or the start date is dropped, the person's name must be in it, and the linking sentence is shown only if it is really part of what she says. In our tests, the welcome for each of the five sample teams linked that team's own work to the mission, and a team missing from the story got a general link.

**How answers stay inside the story.** `answerMessages()` asks for the answer and the exact words it comes from; `readAnswer()` checks in code that the words are really in the story. If they are not, Amara does not pass the answer on.

**Gender.** The welcome never assumes a person's gender from their name; in Spanish, French and Arabic it asks for wording that does not mark gender.

## Runtime modes

| Mode | Command |
| --- | --- |
| On your computer | `npm start` |
| Cloudflare Workers, local | `cp .dev.vars.example .dev.vars`, then `npm run dev:cf` |
| Cloudflare Workers, online | `npm run deploy` or the Deploy button |

**Starter minutes or your own OpenAI key.** Hearing, the welcome, the answers and the voice use OpenAI. Without `OPENAI_API_KEY`, the CEO uses free Spatius starter minutes (30 minutes per Spatius key), sent through `starter.spatius.app` with your Spatius key. When the minutes are used up, the page says so, and you add your own key. With `OPENAI_API_KEY` set, it calls OpenAI directly and the starter service is not used.

## Protocols and contracts

The browser talks to the server through six routes. The page keeps the story and the new hire, and sends them each time.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/config` | none | `appId`, `region`, `ceo`, `choices`, `sessionSeconds`, `company`, your `story` and `people` if set, the samples, and `teams` |
| `POST /api/session` | none | `appId`, `region`, `sessionToken` |
| `POST /api/hear` | Recorded audio as the body, header `x-lang` | `{ text }` |
| `POST /api/welcome` | JSON `{ lang, company, story, person: { name, role, team, start } }` | `{ say, link, quote, title, text }` |
| `POST /api/ask` | JSON `{ lang, company, story, person, question, history }` | `{ say, found, section, title, text, quote }` |
| `POST /api/speak` | JSON `{ text, lang }` | The voice as raw PCM16, mono, 24 kHz, streamed |

`start` is a date as `YYYY-MM-DD`. `link` is the sentence of the welcome that links the person's work to the mission; `quote` and `title` are the words of the story it is based on. A welcome link is the page's address with `?name=…&role=…&team=…&start=…&lang=…`. Errors come back as `{ "error": "..." }` with a matching HTTP status. When starter minutes are used up, the status is 402 and `starterUsed` is `true`.

## Make it yours

- **Your company story.** Paste it on the page, or set `CEO_STORY` (and `CEO_COMPANY`). Give every team a short section under its own heading ("### Sales"), so each welcome can say why that team's work matters.
- **Your new hires.** One per line: `name, role, team, start date`. Paste them on the page or set `CEO_PEOPLE`.
- **The CEO.** Her name is `CEO` in `server/brain.mjs`; her face and voice are `FACE` in `server/app.mjs`; what the welcome says, and in what order, is `welcomeMessages()`. For a company's real CEO, use a custom Spatius avatar made with their consent.
- **Session length.** Sessions last 3 minutes (`CEO_SECONDS`, or 0 for no limit).

## Use it in your own app

Pick the row that matches what you have.

| You have | Do this |
| --- | --- |
| Any website, intranet or web app, and you want the CEO inside it | Deploy this template (Cloudflare button or your own server) with your story in the settings, then add one line where it should appear: `<script src="https://YOUR-CEO-ADDRESS/embed.js" data-name="Sam Rivera" data-team="Sales" data-start="2026-12-01" async></script>`. The `data-` choices (`lang`, `name`, `role`, `team`, `start`) are optional. Events arrive on your page as `window` event `spatius:event`. |
| An HR system that knows who starts when | Make each new hire's welcome link from your system: your address with `?name=…&role=…&team=…&start=YYYY-MM-DD`, and send it with the welcome email. |
| Your own backend, in any language | Copy `server/brain.mjs` (or port it: plain functions, no network). Cut the story once with `sectionsOf()`, then call `welcomeMessages()` / `readWelcome()` for each new hire and `answerMessages()` / `readAnswer()` for questions. |
| Your own web page, and you want the avatar | Copy `web/src/seat.ts`. It loads a Spatius avatar into any element and plays 24 kHz PCM16 audio on it with lip sync. |
| A LiveKit or Agora voice agent | Start from Spatius's official example, [livekit-demo](https://github.com/spatius-ai/spatius-integration-demo/tree/main/livekit-demo) or [agora-demo](https://github.com/spatius-ai/spatius-integration-demo/tree/main/agora-demo), have the agent speak `readWelcome().say` when the person joins, and call `answerMessages()` / `readAnswer()` from its LLM step. The brain is plain functions, so the CEO works the same over LiveKit or Agora. |
| Another LLM, or an OpenAI-compatible gateway | Set `OPENAI_BASE_URL` with your own `OPENAI_API_KEY`. The brain works with any chat model that can return JSON. |

Spatius's official examples show how to connect an avatar (Direct, LiveKit, Agora, iOS, Android, Flutter): [spatius-integration-demo](https://github.com/spatius-ai/spatius-integration-demo), [livekit-plugins-spatius](https://github.com/spatius-ai/livekit-plugins-spatius) and [create-spatius-app](https://github.com/spatius-ai/create-spatius-app). This template shows what to build on top: the use case and its standout feature, in a brain you can plug into any of them.

## Technical stack

- Spatius avatar SDK (`@spatius/avatarkit`) in Direct mode, drawn in the browser
- OpenAI: `gpt-4o-mini-transcribe` (speech to text), `gpt-4.1-mini` (the welcome and the answers, JSON replies), `gpt-4o-mini-tts` (voice); all can be changed in settings
- Vite for the web page, plain Node for the local server, Cloudflare Workers for hosting
- No database and no framework

## Setup and local development

You need Node 20.3 or newer and a Spatius account, for an API key and App ID from [app.spatius.ai](https://app.spatius.ai). You also need a browser with WebGPU or WebGL2, and a microphone if you want to speak.

```sh
git clone https://github.com/spatius-ai/meet-the-ceo
cd meet-the-ceo
cp .env.example .env      # paste SPATIUS_API_KEY and SPATIUS_APP_ID
npm install
npm start                 # open http://localhost:3000
```

The page calls `/api/...` and loads `/assets/...` on the same address as the page, so the page, the built files and the API must be served from one origin. `server/node.mjs` and Cloudflare both do this.

## Environment configuration

| Setting | Needed | What it does |
| --- | --- | --- |
| `SPATIUS_API_KEY` | Yes | Your Spatius API key |
| `SPATIUS_APP_ID` | Yes | Your Spatius App ID |
| `SPATIUS_REGION` | No | `us-west` (default) or your region |
| `OPENAI_API_KEY` | No | Your OpenAI key; without it, starter minutes are used |
| `ELEVENLABS_API_KEY` | No | ElevenLabs voices: each person has their own voice, and a native voice for Arabic. Without it, the OpenAI voice is used, and it is also used if ElevenLabs refuses a request. Model: `ELEVENLABS_MODEL` (default `eleven_v4_turbo`) |
| `OPENAI_BASE_URL` | No | Another OpenAI-compatible address for your own key. Your OpenAI key is never sent to the starter service. |
| `SPATIUS_STARTER_URL` | No | Another starter service address (for testing) |
| `CEO_LANG` | No | Starting language: `en`, `es`, `zh`, `ar` or `fr` |
| `CEO_COMPANY` | No | Your company's name |
| `CEO_STORY` | No | Your company story, instead of the sample; write `\n` for a new line |
| `CEO_PEOPLE` | No | Your new hires, one per line, written with `\n` |
| `CEO_SECONDS` | No | Seconds per session, 180 by default; 0 for no limit |
| `OPENAI_CHAT_MODEL`, `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL` | No | Models |
| `PORT` | No | Local port, 3000 by default |

On Cloudflare, put the keys in `.dev.vars` (local) or as secrets (online); the other settings are in `wrangler.jsonc` under `vars`.

## Security and deployment guidance

- Keys stay on the server. The browser only receives a short-lived Spatius session token.
- The `/api` routes are open to anyone who can reach your site, and each welcome and question spends your OpenAI key or starter minutes and your Spatius minutes. The server allows 40 API requests per minute per visitor; for a public site, also turn on your host's rate limiting (for example Cloudflare rate limiting rules) and set a monthly limit in your OpenAI account.
- Nothing is stored on the server. The story, the new hires and the questions live in the browser tab and are sent to the LLM provider only to write the welcome and answer. Recordings are turned into text and not kept.
- A welcome link contains the person's name, role, team and start date. Deploy the CEO where only your staff can reach it (behind your intranet or single sign-on), and send links only to the person they are for.
- Amara is made up. Do not present an avatar as a real person without that person's consent, and tell viewers they are talking with an AI avatar.
- `.env` and `.dev.vars` are ignored by git. Never commit them.
- The avatar SDK sends basic performance data to Spatius so failures can be found. See the [Spatius Terms of Service](https://www.spatius.ai/terms-of-service/).

## License and use constraints

The code in this repository is under the MIT License (see `LICENSE`). The Spatius avatar SDK (`@spatius/avatarkit`) and the Spatius service are not part of this license; they are covered by the [Spatius Terms of Service](https://www.spatius.ai/terms-of-service/). The fonts in `web/public/assets/fonts/` (Inter, Geist Mono, Space Grotesk) are under the SIL Open Font License; their license texts are in `web/public/assets/licenses/`. The office picture, the sample company story and new hires, and the CEO's portrait are examples for this template.
