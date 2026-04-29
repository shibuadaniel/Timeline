# Bible Events Timeline

Pilot **horizontal timeline** for Bible study scenes: **Sequence #** 100–150 from the **sandbox** Notion database. **Year** → X position; **Location** → color; **On stage** → tooltip + filters; **Needs year** queue for empty or unparseable years.

See **[Project Brief](https://www.notion.so/350cb257e13c8186b4bfeb980aa6748e)** in Notion for full scope.

## Prerequisites

- Node 20+ recommended
- A [Notion internal integration](https://www.notion.so/my-integrations) and the integration **invited** to the sandbox database (⋯ on the DB → **Connections**)

## Setup

```bash
cp .env.example .env
# Set NOTION_API_KEY and NOTION_DATABASE_ID in .env
npm install
```

## Ingest data from Notion

Generate a normalized snapshot that the SPA reads:

```bash
npm run ingest:notion
```

This writes:
- `public/data/latest.json` (stable pointer for the app)
- `public/data/manifest.json` (metadata + immutable filename pointer)
- `public/data/snapshot.<hash>.json` (immutable artifact)
- `public/data/chunks/snapshot.<hash>.part.<nnn>.json` (chunked records for progressive client loading)

## Run

Starts the **API** (port 3001) and **Vite** (port 5173) together for local development. Public hosting only needs the built SPA + `public/data/latest.json`.

```bash
npm run dev
```

Open `http://localhost:5173` (or the port Vite prints if 5173 is busy). The UI prefers `/data/manifest.json` + chunk files for progressive loading, and falls back to `/data/latest.json` for compatibility.

### Port already in use (`EADDRINUSE`)

- **`3001`:** Another process (often a previous `npm run dev`) is using the API port. Either quit that terminal / stop the process, or add to `.env`: `PORT=3002` (or any free port). The Vite dev proxy reads **`PORT`** from `.env` and will forward `/api` to the same port.
- **`5173`:** Vite will usually pick the next port (e.g. `5174`) automatically; use the URL it prints.

## Notion schema note

The sandbox DB uses **`Scene Descriptioni`** as the **title** property name (typo in Notion). It is mapped in `server/notionProperties.ts` if you rename the column later.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run ingest:notion` | Pull from Notion and write normalized snapshot artifacts |
| `npm run dev` | API + Vite dev servers |
| `npm run build:public` | Ingest snapshot then build static SPA |
| `npm run build` | Production build of the UI to `dist/` |
| `npm run preview` | Preview production build |

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/ci.yml`

- **Validate job** runs on PRs and `main` pushes (`npm ci`, `npm run lint`, `npm run build`).
- **Publish job** runs on `main` push, schedule (hourly), or manual dispatch.
- Publish job runs `npm run build:public` (fresh Notion ingest + static build) and deploys `dist/` to GitHub Pages.

Required repository secrets:
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

Optional repository variables:
- `PILOT_SEQUENCE_MIN`
- `PILOT_SEQUENCE_MAX`
- `VITE_BASE_PATH` (for project pages, set to `/<repo>/`, e.g. `/Timeline/`)

If the Notion secrets are not set, validate still runs and publish is skipped.

## Repo layout

- `server/` — Express API + Notion ingestion pipeline
- `public/data/` — generated snapshot artifacts served as static JSON
- `src/` — React UI (reads `/data/latest.json`)
