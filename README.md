# Forebear

*"Se wo were fi na wosankofa a yenkyi" — it is not wrong to go back for that which you have forgotten.*

Forebear is an ancestry discovery companion built for the specific challenges of Black American genealogy: the "1870 brick wall," Freedmen's Bureau records, and the fact that there's no single database that covers this research. It's a static, single-page web app — no build step, no backend required to run it. Optional family sync is available if you deploy the small endpoint in this repo.

## What it does

- **Family Tree** — add ancestors, link parents/children and spouses (with a note for the record that ties the couple, e.g. a cohabitation bond), and see the tree laid out by generation. Each person can carry an optional "associated enslaver surname" for pre-1870 research and a list of name variants — surnames were often chosen, changed, or respelled at emancipation, so every spelling seen in a record is worth keeping. Cards also surface the next Research Plan step for that person.
- **Research Log** — track every source you check (citation, findings, status, next steps), linked to the person it's about. Each entry can be tagged with the facts it's evidence for (name, birth, parentage, …); confirmed sources surface those facts as chips on the person's tree card.
- **Backups & portability** — one-click JSON backup export/import (merge or replace) and GEDCOM 5.5.1 export, so the tree is portable to Ancestry, FamilySearch, Gramps, and other genealogy tools. The app nudges you when a backup is more than 30 days stale. Export/import also doubles as a manual sync stopgap between browsers.
- **Discovery** — search runs in the app itself, against **three live sources**: historical newspapers (Library of Congress Chronicling America — keyless), local histories and city directories (Internet Archive — keyless, each result opens with your surname pre-searched inside the book), and the Smithsonian's collections (free key). A summary bar shows per-source hit counts as results stream in. Every search also builds prefilled deep links — grouped by topic, distant groups collapsed — into U.S. census and slave schedules, Freedmen's Bureau and Bank, USCT/pensions, Freedom on the Move, Last Seen ads, WPA narratives, state archives across the South, plus Caribbean, Canadian, UK, African/Atlantic (Slave Voyages), and Latin American collections. Name variants appear as "also try" chips on key collection cards. The registry lives in `js/sources.js` — adding a collection is a data entry, not new code.
- **Record previews** — live results open *inside* the app where the archive permits it: LOC newspaper pages render as zoomable IIIF images (S/M/L), Internet Archive books open in their official embeddable BookReader, and Smithsonian records show their media when digitized. Each preview has "+ Log this record" (exact page citation) and an "Open original" escape hatch. Collection links behind login walls (FamilySearch, state archives) necessarily stay external — that's what search sessions track.
- **Search sessions** — Forebear remembers every search (per surname + place). Opening a collection marks it; two buttons resolve it — "Found something" (opens a prefilled log entry) or "Nothing there" (writes a dated dead-end entry automatically, including the variants searched). A coverage bar shows *"7 of 31 collections resolved — 2 found · 4 dead ends · 1 opened, unresolved"*, so nobody ever re-searches a dead end. Sessions save, back up, and sync like everything else.
- **Earliest mentions** — a second search mode that runs the same session-tracked search date-bounded and sorted oldest-first: newspapers back to 1789 and pre-1878 local texts, windowed to the person's plausible record trail when the search is theirs (born c. 1832 → 1832–1877). An explainer states the honest genealogy: pre-emancipation hits usually name the white family that held the surname — a lead, not a dead end — with one click to file the surname as an enslaver candidate on the person's Research Plan.
- **Person-centric search** — "Search Discovery" on any tree card builds the whole query from the person: name split into given + surname, their recorded variants, enslaver surname, and the place parsed from free-text birthplaces ("Belmont, Gaston County, NC" → state/county/city). The session links to that person, so auto-logged finds and dead ends attach to them; the Research Plan's record checklist reads those same session statuses (one checklist, not two). The Discovery tab opens to *"Pick up where you left off"* — recent searches with coverage counts and one-click Resume — and the nav badge counts collections opened but not yet resolved.
- **Research Plan** — the Field Guide's method as steps attached to a chosen ancestor: anchor in the 1870 census, pin county and Freedmen's Bureau field office, work that place's record checklist, test enslaver candidates, confirm with a named source, then **Bridge toward Africa** (DNA workspace, ethnonyms, voyage matcher, African Origins, confidence levels). Progress persists per person so the app can answer "what's my next step?"
- **Field Guide** — a short orientation to Freedmen's Bureau records, Freedman's Bank registers, cohabitation records, WPA slave narratives, and tracing through an enslaver's surname.
- **Family sync (optional)** — share one tree across devices or relatives via a family code + passphrase. Off by default; the app stays fully usable without it.
- **Onboarding** — a one-time welcome explains the suggested path (reopen it any time via "How this works" in the sidebar); a fictional **sample family** (the Freemans of Gaston County, NC) can be loaded to explore a populated tree, log, and half-finished research plan, then removed in one click; a dismissible getting-started checklist tracks the first five actions; and the person form keeps the DNA and Bridge-to-Africa sections collapsed until you need them.
- **Guided next steps (rule-based)** — coach, story intake, hit interpretation, and bridge synthesis always work offline with no API key. Optional **Enhance with AI** (OpenAI key under Connect data sources) only polishes wording; actions and structure stay rule-based.

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
forebear/
├── index.html        # markup
├── css/styles.css    # all styling (design tokens as CSS custom properties)
├── js/sources.js     # source registry: the record collections Discovery links into
├── js/app.js         # app logic, rendering, and the Smithsonian API integration
├── js/plan.js        # Research Plan ("get past 1870" + Bridge to Africa)
├── js/africa.js      # Ethnonym glossary, voyage links, DNA/confidence helpers
├── js/coach.js       # next-step coach (rule-based)
├── js/story.js       # family-story → people intake
├── js/interpret.js   # Discovery hit reading / enslaver ranking
├── js/synthesize.js  # Bridge / DNA synthesis
├── js/llm.js         # optional OpenAI polish wrappers
├── js/sync.js        # optional family sync client
├── api/sync.js       # optional Vercel serverless sync endpoint
└── api/llm.js        # optional Vercel OpenAI proxy (client-supplied key)
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

The Discovery tab queries three APIs directly from the browser:

| Source | Key | Notes |
|---|---|---|
| LOC Chronicling America (newspapers) | none needed | keyless + CORS-open, verified July 2026 |
| Internet Archive (local histories) | none needed | keyless + CORS-open, verified July 2026 |
| Smithsonian Open Access | free, instant | [api.data.gov/signup](https://api.data.gov/signup/) |

The key is entered in-app (Discovery → "Connect data sources") and stored via the same `storage` shim, so it lives in `localStorage` alongside everything else. It is never sent anywhere except directly to the Smithsonian's own API.

### Optional AI polish

Coach, story intake, hit interpretation, and bridge synthesis are **rule-based by default** — no key required. If you paste an OpenAI key under the same Connect panel and click **Enhance with AI**, the browser posts to this app’s `/api/llm` proxy (your key in `Authorization` only for that request). That needs a deploy with the serverless function, or `vercel dev` locally — a plain static server alone won’t expose `/api/llm`.

**Verified July 2026:** the Smithsonian endpoint returns results with `Access-Control-Allow-Origin: *`, so it works from the browser. A **National Archives Catalog v2** live integration used to exist, but as of July 2026 `catalog.archives.gov/api/v2/*` serves the catalog website's HTML shell to every request (even the documented curl examples), so it was removed rather than shipped dead — the Discovery tab links into NARA's catalog search UI instead. If the API comes back, the old integration is in git history (`searchNARA` in `js/app.js`).

## Testing

`npm test` runs `test/smoke.js` — a Node harness that loads the real app modules against a stubbed DOM/localStorage and exercises schema migration, spouse mirroring, GEDCOM structure, import merge/replace, the source registry's URL building, live-search parsing for all three sources (against captured fixtures in `test/fixtures/`), XSS escaping, sync merge semantics, search sessions (open/resolve/auto-logging/merge), and the onboarding flows (sample family, checklist, collapsible form sections). Keep it green: when labels, schema versions, or registry entries change, update the expectations in the same commit.

## Deploying

It's a static site, so any static host works:

- **Vercel** — `vercel` from this directory, or connect the GitHub repo in the Vercel dashboard for auto-deploys. Needed if you want the optional `/api/sync` or `/api/llm` endpoints.
- **GitHub Pages** — enable Pages on this repo, pointing at the root of `main`. Sync endpoint won't be available here unless you host it elsewhere.
- **Netlify / Cloudflare Pages** — drag-and-drop the folder or connect the repo.

## Roadmap ideas

- Add GEDCOM **import** (export already exists), so trees started elsewhere can be brought in.
- Keep expanding `SOURCE_REGISTRY` (more Caribbean island archives, Brazilian notarial indexes, 1867 voter rolls by state) — each is one data entry.
- Stronger sync auth (per-user accounts) if shared trees grow beyond a trusted family code.
- Structured oral-history prompts and a deeper DNA match workflow.

## License

MIT — see [LICENSE](LICENSE).
