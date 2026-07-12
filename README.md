# Sankofa

*"Se wo were fi na wosankofa a yenkyi" — it is not wrong to go back for that which you have forgotten.*

Sankofa is an ancestry discovery companion built for the specific challenges of Black American genealogy: the "1870 brick wall," Freedmen's Bureau records, and the fact that there's no single database that covers this research. It's a static, single-page web app — no build step, no backend required to run it. Optional family sync is available if you deploy the small endpoint in this repo.

## What it does

- **Family Tree** — add ancestors, link parents/children and spouses (with a note for the record that ties the couple, e.g. a cohabitation bond), and see the tree laid out by generation. Each person can carry an optional "associated enslaver surname" for pre-1870 research and a list of name variants — surnames were often chosen, changed, or respelled at emancipation, so every spelling seen in a record is worth keeping. Cards also surface the next Research Plan step for that person.
- **Research Log** — track every source you check (citation, findings, status, next steps), linked to the person it's about. Each entry can be tagged with the facts it's evidence for (name, birth, parentage, …); confirmed sources surface those facts as chips on the person's tree card.
- **Backups & portability** — one-click JSON backup export/import (merge or replace) and GEDCOM 5.5.1 export, so the tree is portable to Ancestry, FamilySearch, Gramps, and other genealogy tools. The app nudges you when a backup is more than 30 days stale. Export/import also doubles as a manual sync stopgap between browsers.
- **Discovery** — search runs in the app itself. Connect a free Smithsonian Open Access key and it queries their catalog live. Every search also builds prefilled deep links — grouped by topic — into U.S. census and slave schedules, Freedmen's Bureau and Bank, USCT/pensions, Freedom on the Move, Last Seen ads, WPA narratives, state archives across the South, plus Caribbean, Canadian, UK, African/Atlantic (Slave Voyages), and Latin American collections. Given names and name variants are searched too: variants spawn extra prefilled links for key collections. The registry lives in `js/sources.js` — adding a collection is a data entry, not new code.
- **Research Plan** — the Field Guide's method as steps attached to a chosen ancestor: anchor in the 1870 census, pin county and Freedmen's Bureau field office, work that place's record checklist, test enslaver candidates, confirm with a named source, then **Bridge toward Africa** (DNA workspace, ethnonyms, voyage matcher, African Origins, confidence levels). Progress persists per person so the app can answer "what's my next step?"
- **Field Guide** — a short orientation to Freedmen's Bureau records, Freedman's Bank registers, cohabitation records, WPA slave narratives, and tracing through an enslaver's surname.
- **Family sync (optional)** — share one tree across devices or relatives via a family code + passphrase. Off by default; the app stays fully usable without it.

## Running it locally

No build step — it's plain HTML/CSS/JS.

```bash
# any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL in your browser.

## Project structure

```
sankofa/
├── index.html        # markup
├── css/styles.css    # all styling (design tokens as CSS custom properties)
├── js/sources.js     # source registry: the record collections Discovery links into
├── js/app.js         # app logic, rendering, and the Smithsonian API integration
├── js/plan.js        # Research Plan ("get past 1870" + Bridge to Africa)
├── js/africa.js      # Ethnonym glossary, voyage links, DNA/confidence helpers
├── js/sync.js        # optional family sync client
└── api/sync.js       # optional Vercel serverless sync endpoint
```

## Storage

This started as a Claude.ai artifact, which provides a `window.storage` API for persistence. Outside that environment there's no such API, so `js/app.js` includes a small shim (`storage`) that implements the same `get`/`set`/`delete`/`list` interface on top of `localStorage`. That means:

- Data is **per-browser** by default. Use "Export backup" / "Import backup" in the sidebar to move data between browsers (JSON backups also protect against a cleared browser profile).
- Stored payloads carry a `schemaVersion`; old payloads are migrated in place on load (`migrate()` in `js/app.js`).
- Optional **Family sync** uses the same payload shape — see below.

## Family sync (optional)

Cross-device and shared-tree sync is opt-in. The app stays local-first; sync only runs when you configure an endpoint, family code, and passphrase under **Family sync** in the rail.

1. Deploy this repo to [Vercel](https://vercel.com) and attach an [Upstash Redis](https://vercel.com/marketplace/upstash) (or Vercel KV) integration so `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` equivalents) are set.
2. Open the deployed site → **Family sync** → set the endpoint to `https://your-app.vercel.app/api/sync`, pick a family code (e.g. `stowe-family`), and a passphrase. The first sync claims the code; later devices must use the same passphrase.
3. Edits debounce and push automatically. Merges are per-record newest-`updatedAt` wins, with deletion tombstones so removals carry across devices.

The client (`js/sync.js`) and endpoint (`api/sync.js`) speak a simple GET/PUT contract with Bearer auth. Anything that implements the same contract can replace the Vercel function. Share the code and passphrase only with people you trust — there is no per-user auth beyond the shared passphrase.

## Connecting live search

The Discovery tab queries the Smithsonian Open Access API directly from the browser:

| Source | Key | How to get one |
|---|---|---|
| Smithsonian Open Access | free, instant | [api.data.gov/signup](https://api.data.gov/signup/) |

The key is entered in-app (Discovery → "Connect data sources") and stored via the same `storage` shim, so it lives in `localStorage` alongside everything else. It is never sent anywhere except directly to the Smithsonian's own API.

**Verified July 2026:** the Smithsonian endpoint returns results with `Access-Control-Allow-Origin: *`, so it works from the browser. A **National Archives Catalog v2** live integration used to exist, but as of July 2026 `catalog.archives.gov/api/v2/*` serves the catalog website's HTML shell to every request (even the documented curl examples), so it was removed rather than shipped dead — the Discovery tab links into NARA's catalog search UI instead. If the API comes back, the old integration is in git history (`searchNARA` in `js/app.js`).

## Deploying

It's a static site, so any static host works:

- **Vercel** — `vercel` from this directory, or connect the GitHub repo in the Vercel dashboard for auto-deploys. Needed if you want the optional `/api/sync` endpoint.
- **GitHub Pages** — enable Pages on this repo, pointing at the root of `main`. Sync endpoint won't be available here unless you host it elsewhere.
- **Netlify / Cloudflare Pages** — drag-and-drop the folder or connect the repo.

## Roadmap ideas

- Add GEDCOM **import** (export already exists), so trees started elsewhere can be brought in.
- Keep expanding `SOURCE_REGISTRY` (more Caribbean island archives, Brazilian notarial indexes, 1867 voter rolls by state) — each is one data entry.
- Stronger sync auth (per-user accounts) if shared trees grow beyond a trusted family code.
- Structured oral-history prompts and a deeper DNA match workflow.

## License

MIT — see [LICENSE](LICENSE).
