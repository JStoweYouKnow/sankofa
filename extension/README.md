# Forebear Companion (Chrome MV3)

Optional browser extension that captures **FamilySearch search-result links you already have open** and hands them to Forebear for review. It does **not** log in for you, store passwords, or write to your tree without confirmation.

Part of the Discovery agent ladder (Phase C). Core research in Forebear never requires this extension.

## Install (sideload)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `extension/` folder
4. Serve Forebear over `http://localhost:…` or a `*.vercel.app` deploy (content scripts do not inject into `file://`). Open **`app.html`**, not only the landing page.

## Handshake

1. Open Forebear (`app.html`) → Discovery → **Connect data sources**
2. Status should show **Companion connected** within a second
3. If not: confirm the extension is enabled and reload the Forebear tab

## Capture (FamilySearch)

1. Sign in to FamilySearch yourself and run a search
2. On a results page, either:
   - Click **Capture for Forebear** (bottom-right), or
   - Open the extension popup → **Capture results**
3. Return to Forebear → Connect panel → **Review capture**
4. Confirm hits into Discovery (insight / RESULT_CACHE). Nothing is logged until you use the normal Found / Log flows — or resolve an agent queue step after **Run next 3**.

## With the agent runner

If a queue step is **awaiting-capture** (FamilySearch-class source):

1. Capture on the FS tab
2. Review + Confirm import in Forebear
3. The agent step advances to **needs-review** for Found / Nothing / Skip

## Permissions

| Host | Why |
|------|-----|
| `familysearch.org` | Read result DOM after you click Capture |
| `localhost` / `127.0.0.1` / `*.vercel.app` | Ping Forebear + deliver saved hits |

No FamilySearch credentials are ever read or stored.

## Manual checklist

- [ ] Extension loads without errors in `chrome://extensions`
- [ ] Forebear shows Companion connected
- [ ] Capture on FS results saves a non-zero count (or honest “no ark links”)
- [ ] Review capture in Forebear lists labels/URLs
- [ ] Confirm import refreshes Hit reading
- [ ] Clear capture empties pending hits
- [ ] App works fully with extension disabled
- [ ] (Optional) Agent “Run next 3” companion step advances after Confirm import

## Parser fixtures

Node smoke tests load `extension/parsers/familysearch.js` against `test/fixtures/familysearch-results.html`.

See also the main [README](../README.md) Discovery agent ladder section.
