# CardConnect

Mobile web app that turns a business card photo into a saved contact, a LinkedIn lookup, and a personalized connect message — in two taps.

Live demo: [card.pplx.app](https://card.pplx.app)

## What it does

1. **Scan** — open the camera, snap a card. Tesseract.js does in-browser OCR; DeepSeek parses name, title, company, email, phone, website with brand-aware disambiguation.
2. **Review** — confirm the parsed details on a mobile-first form. The card photo is stored as a rectangular profile picture.
3. **Save** — auto-pushes a vCard to your phone's address book (iOS / Android), saves to the app, and drafts a context-aware LinkedIn note.
4. **Connect** — one tap to find the person on LinkedIn, copy the prepared message, paste, send.

Installable as a PWA — open in Safari / Chrome and tap "Add to Home Screen" or use the in-app install prompt.

## Stack

- **Frontend** — Vite + React + Tailwind v3 + shadcn/ui + Wouter (hash routing)
- **Backend** — Express, esbuild-bundled to a single `dist/index.cjs`
- **Database** — SQLite via `better-sqlite3` + Drizzle ORM
- **OCR** — Tesseract.js (in-browser, no upload)
- **LLM** — DeepSeek `deepseek-chat` via OpenAI-compatible SDK
- **PWA** — minimal service worker + manifest, sharp-generated icons

## Local development

```bash
npm install
echo "DEEPSEEK_API_KEY=your_key_here" > .env
npm run dev          # http://localhost:5000
```

## Production build

```bash
npm run build        # builds client (Vite) + bundles server (esbuild)
npm start            # runs dist/index.cjs
```

## Deploy on Render

This repo includes `render.yaml`. To deploy:

1. Fork or clone this repo to your GitHub account.
2. In Render, click **New → Blueprint**, point it at the repo, deploy.
3. In the service's **Environment** tab, set `DEEPSEEK_API_KEY` to your key from [platform.deepseek.com](https://platform.deepseek.com/).
4. (Optional) Upgrade the service to the Starter plan and uncomment the disk block in `render.yaml` to make SQLite persistent across deploys.

Custom domain: add it in the Render dashboard under **Settings → Custom Domains** and follow the DNS instructions.

## License

MIT
