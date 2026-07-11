# Sankofa

*"Se wo were fi na wosankofa a yenkyi" — it is not wrong to go back for that which you have forgotten.*

Sankofa is an ancestry discovery companion built for the specific challenges of Black American genealogy: the "1870 brick wall," Freedmen's Bureau records, and the fact that there's no single database that covers this research. It's a static, single-page web app — no build step, no backend required to run it.

## What it does

- **Family Tree** — add ancestors, link parents/children, and see the tree laid out by generation with an optional "associated enslaver surname" field for pre-1870 research.
- **Research Log** — track every source you check (citation, findings, status, next steps), linked to the person it's about.
- **Discovery** — search runs in the app itself. Connect a free Smithsonian Open Access key and a free National Archives Catalog key and it queries both directly; sources without a public API (FamilySearch, Mapping the Freedmen's Bureau) get a pre-filled link instead.
- **Field Guide** — a short orientation to Freedmen's Bureau records, Freedman's Bank registers, cohabitation records, WPA slave narratives, and tracing through an enslaver's surname.

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
├── css/styles.css     # all styling (design tokens as CSS custom properties)
└── js/app.js          # app logic, rendering, and the two API integrations
```

## Storage

This started as a Claude.ai artifact, which provides a `window.storage` API for persistence. Outside that environment there's no such API, so `js/app.js` includes a small shim (`storage`) that implements the same `get`/`set`/`delete`/`list` interface on top of `localStorage`. That means:

- Data is **per-browser**, not synced across devices.
- If you want cross-device sync, swap the shim for a real backend — a small Vercel serverless function backed by Vercel KV or Postgres, or something like Supabase — and keep the same call signatures (`storage.get(key)`, `storage.set(key, value)`) so the rest of the app doesn't need to change.

## Connecting live search

The Discovery tab can query two real APIs directly from the browser:

| Source | Key | How to get one |
|---|---|---|
| Smithsonian Open Access | free, instant | [api.data.gov/signup](https://api.data.gov/signup/) |
| National Archives Catalog v2 | free, by request | email [Catalog_API@nara.gov](mailto:Catalog_API@nara.gov) |

Keys are entered in-app (Discovery → "Connect data sources") and stored via the same `storage` shim, so they live in `localStorage` alongside everything else. They are never sent anywhere except directly to Smithsonian's/NARA's own APIs.

**Note on reliability:** both integrations were built against public API documentation, not tested against a live browser session. If a search returns an error card instead of results, it's most likely a CORS restriction from the API provider or a key formatting issue — the quick-link fallback cards below the live results always work regardless. Issues/PRs welcome if you track down a fix.

## Deploying

It's a static site, so any static host works:

- **Vercel** — `vercel` from this directory, or connect the GitHub repo in the Vercel dashboard for auto-deploys.
- **GitHub Pages** — enable Pages on this repo, pointing at the root of `main`.
- **Netlify / Cloudflare Pages** — drag-and-drop the folder or connect the repo.

## Roadmap ideas

- Swap the localStorage shim for a real backend so data syncs across devices.
- Add GEDCOM export for the family tree, so it's portable to other genealogy tools.
- Add a shared/collaborative mode (multiple people editing one tree) — the original ask behind this project was to make it usable by anyone doing this kind of research, not just one person.
- Expand the Field Guide with state-specific record guides beyond the North Carolina example currently included.

## License

MIT — see [LICENSE](LICENSE).
