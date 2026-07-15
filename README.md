# Forebear

*"Se wo were fi na wosankofa a yenkyi" — it is not wrong to go back for that which you have forgotten.*

Forebear is an ancestry discovery companion built for the specific challenges of Black American genealogy: the "1870 brick wall," Freedmen's Bureau records, and the fact that there's no single database that covers this research. It's a static, single-page web app — no build step, no backend required to run it. Optional family sync, AI polish, and a browser companion are available if you deploy or sideload them.

The research method stays **rule-based and citation-honest**: a shared surname is a **lead**, never proof of enslavement. Optional AI only polishes wording.

## What it does

- **Family Tree** — add ancestors, link parents/children and spouses (with a note for the record that ties the couple, e.g. a cohabitation bond), and see the tree laid out by generation. Each person can carry an optional "associated enslaver surname" for pre-1870 research and a list of name variants — surnames were often chosen, changed, or respelled at emancipation, so every spelling seen in a record is worth keeping. Cards also surface the next Research Plan step for that person.
- **Research Log** — track every source you check (citation, findings, status, next steps), linked to the person it's about. Each entry can be tagged with the facts it's evidence for (name, birth, parentage, …); confirmed sources surface those facts as chips on the person's tree card.
- **Backups & portability** — one-click JSON backup export/import (merge or replace), GEDCOM 5.5.1 export, and **GEDCOM import** (INDI/FAM → people; unique **name + birth year** matches fill empty fields, otherwise new ids with parents/spouses and empty plans + case files). The app nudges you when a backup is more than 30 days stale.
- **Case file** — every brick-wall person gets open questions, hypotheses (lead / hypothesis / confirmed / ruled out), notes, and a short agent timeline on the Research Plan.
- **Enslaver graph** — candidates are first-class entities reusable across relatives; Plan step 4 ranks them from the tree, sessions, and Discovery hits.
- **Discovery** — search runs in the app itself, against **three live sources**: historical newspapers (Library of Congress Chronicling America — keyless), local histories and city directories (Internet Archive — keyless, each result opens with your surname pre-searched inside the book), and the Smithsonian's collections (free key). A summary bar shows per-source hit counts as results stream in. Every search also builds prefilled deep links — grouped by topic, distant groups collapsed — into U.S. census and slave schedules, Freedmen's Bureau and Bank, USCT/pensions, Freedom on the Move, Last Seen ads, WPA narratives, state archives across the South, plus Caribbean, Canadian, UK, African/Atlantic (Slave Voyages), and Latin American collections. Name variants appear as "also try" chips on key collection cards. The registry lives in `js/sources.js` — adding a collection is a data entry, not new code.
- **Hit reading & page text** — live hits get a rule-based lens (enslaver lead, Bureau, runaway ad, …). **Add page text** (paste OCR/transcript) or Smithsonian freetext sharpens belonging-to / servant clues; readings are labeled **excerpt-based · OCR may err**.
- **Agent runner** — on the coach banner, **Run next 3** queues **live LOC / Internet Archive / Smithsonian** searches first (when not already resolved), then checklist / companion steps; pauses for review (Found / Nothing / Skip / Add enslaver lead); updates sessions, the case timeline, and enslaver leads. Never auto-confirms proof.
- **Browser companion (optional)** — sideload the Chrome MV3 extension in `extension/` to capture FamilySearch search-result links from tabs you already opened while signed in. Review before import. See [extension/README.md](extension/README.md).
- **Trust labels** — shared lead / hypothesis / confirmed / ruled-out chips on coach, hits, agent review, case hypotheses, candidates, and Bridge synthesis. AI enhance cannot upgrade a claim to confirmed.
- **DNA & Bridge to Africa** — import a simple match CSV (`name`, `company`, `ethnicity notes`) into the DNA workspace; Bridge synthesis proposes DNA questions early, but ethnonym “agent” apply stays gated until a confirming paper trail **and** a case foothold (enslaver lead or Discovery coverage) exist. Never auto-sets region confidence to documentary.
- **Record previews** — live results open *inside* the app where the archive permits it: LOC newspaper pages as zoomable IIIF images, Internet Archive BookReader embeds, Smithsonian media when digitized.
- **Search sessions** — Forebear remembers every search (per surname + place). Opening a collection marks it; resolve with "Found something" or "Nothing there" (auto dead-end log). Coverage bars keep you from re-searching dead ends.
- **Earliest mentions** — date-bounded, oldest-first mode for pre-emancipation surname leads (Field Guide §6) — a lead to test on the slave schedule, not a conclusion.
- **Research Plan** — Field Guide method as steps per ancestor: 1870 anchor → county / Bureau office → checklist → enslaver candidates → confirm → Bridge to Africa.
- **Field Guide** — short orientation to Bureau, Bank, cohabitation, WPA narratives, and enslaver-surname research.
- **Family sync (optional)** — share one tree across devices via family code + passphrase. Off by default.
- **Guided next steps** — coach, story intake, hit interpretation, and bridge synthesis always work offline. Optional **Enhance with AI** (OpenAI key) only polishes wording.

## Running it locally

No build step — it's plain HTML/CSS/JS.

```bash
# any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. `index.html` is the marketing landing page; **`app.html`** is the research app.

For optional `/api/sync` or `/api/llm`, use `vercel dev` (or a Vercel deploy) instead of a plain static server.

## Project structure

```
forebear/
├── index.html              # landing page
├── app.html                # research app (script load order matters)
├── css/styles.css
├── js/sources.js           # Discovery source registry
├── js/africa.js            # Ethnonyms, voyage links, DNA CSV import
├── js/app.js               # Core app, Discovery live search, sessions
├── js/trust.js             # Shared trust / provenance badges
├── js/plan.js              # Research Plan + case file UI
├── js/gedcom.js            # GEDCOM import
├── js/enslaver.js          # Enslaver graph entities
├── js/coach.js             # Next-step coach
├── js/story.js             # Family-story → people intake
├── js/interpret.js         # Hit reading, excerpts, enslaver ranking
├── js/synthesize.js        # Bridge / DNA synthesis (case-gated Africa)
├── js/llm.js               # Optional OpenAI polish
├── js/companion.js         # Forebear ↔ extension messaging
├── js/agent.js             # “Run next N” agent queue
├── js/sync.js              # Optional family sync client
├── js/sample.js            # Sample family
├── extension/              # Chrome MV3 companion (sideload)
├── api/sync.js             # Optional Vercel sync endpoint
├── api/llm.js              # Optional Vercel OpenAI proxy
├── docs/plans/             # Capability ladder plan
└── test/smoke.js           # Node smoke harness + fixtures
```

## Storage

This started as a Claude.ai artifact, which provides a `window.storage` API for persistence. Outside that environment there's no such API, so `js/app.js` includes a small shim (`storage`) that implements the same `get`/`set`/`delete`/`list` interface on top of `localStorage`. That means:

- Data is **per-browser** by default. Use "Export backup" / "Import backup" in the sidebar to move data between browsers (JSON backups also protect against a cleared browser profile).
- Stored payloads carry a `schemaVersion`; old payloads are migrated in place on load (`migrate()` in `js/app.js`). Current schema includes plans with nested **case** files and top-level **enslavers**.
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

### Optional browser companion

Sideload `extension/` (Chrome → Load unpacked) to capture FamilySearch search-result links from tabs you already opened while signed in. Forebear shows connection status under Discovery → Connect data sources; you must **Review capture** before hits enter Discovery. Full install steps and a manual checklist: [extension/README.md](extension/README.md).

Core research never requires the extension. The companion does not read or store FamilySearch passwords.

### Optional AI polish

Coach, story intake, hit interpretation, and bridge synthesis are **rule-based by default** — no key required. If you paste an OpenAI key under the same Connect panel and click **Enhance with AI**, the browser posts to this app’s `/api/llm` proxy (your key in `Authorization` only for that request). That needs a deploy with the serverless function, or `vercel dev` locally — a plain static server alone won’t expose `/api/llm`.

Enhance never changes coach action kinds or trust class (lead stays lead).

**Verified July 2026:** the Smithsonian endpoint returns results with `Access-Control-Allow-Origin: *`, so it works from the browser. A **National Archives Catalog v2** live integration used to exist, but as of July 2026 `catalog.archives.gov/api/v2/*` serves the catalog website's HTML shell to every request (even the documented curl examples), so it was removed rather than shipped dead — the Discovery tab links into NARA's catalog search UI instead. If the API comes back, the old integration is in git history (`searchNARA` in `js/app.js`).

## Discovery agent ladder (shipped)

| Phase | Capability |
|-------|------------|
| A | Per-person case file on the Research Plan |
| B | Enslaver graph + cross-tree ranking |
| C | Browser companion (FamilySearch capture) |
| D | Agent runner (“Run next 3” + live LOC/IA/SI + review queue) |
| E | Page-text / excerpt interpret hooks |
| F | GEDCOM import (name+year merge) |
| G | Shared trust badges |
| H | DNA match CSV + case-gated Africa ethnonym agent |

Plan notes: `docs/plans/2026-07-14-001-feat-discovery-agent-ladder-plan.md`.

### Quick manual checks

1. Pick a person with a surname → Plan → **Run next 3** → resolve a step
2. Sideload companion → Connect shows connected → Capture FS results → Review → Confirm
3. Rail → **Import GEDCOM** → coach still runs on an imported person
4. DNA workspace → **Import matches CSV** → Bridge panel still gates ethnonym apply without a case foothold
5. Optional: Enhance coach with AI → primary action kind unchanged

## Testing

```bash
npm test
```

`test/smoke.js` loads the same module order as `app.html` against a stubbed DOM/`localStorage` and covers schema migration (incl. case + enslavers), spouse mirroring, GEDCOM export/import, live-search fixtures (LOC/IA/SI), sessions, companion message schema + FamilySearch parser fixture, agent queue/resolve, excerpt interpret, trust badges, and DNA CSV / Africa readiness gates. Keep it green: when labels, schema versions, or registry entries change, update the expectations in the same commit.

## Deploying

It's a static site, so any static host works:

- **Vercel** — `vercel` from this directory, or connect the GitHub repo in the Vercel dashboard for auto-deploys. Needed if you want the optional `/api/sync` or `/api/llm` endpoints.
- **GitHub Pages** — enable Pages on this repo, pointing at the root of `main`. Sync endpoint won't be available here unless you host it elsewhere.
- **Netlify / Cloudflare Pages** — drag-and-drop the folder or connect the repo.

## Roadmap ideas

- Keep expanding `SOURCE_REGISTRY` (more Caribbean island archives, Brazilian notarial indexes, 1867 voter rolls by state) — each is one data entry.
- **Next companion parser: NARA Catalog web UI** (`catalog.archives.gov`) — chosen over Ancestry after FamilySearch learnings: already deep-linked in Discovery, Catalog API is dead (July 2026), and Bureau / USCT / schedule records sit there behind intermittent login. Do not expand extension host permissions until a fixture parser exists.
- Stronger sync auth (per-user accounts) if shared trees grow beyond a trusted family code.

## License

MIT — see [LICENSE](LICENSE).
