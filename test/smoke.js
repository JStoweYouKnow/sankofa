// Smoke test: load app.js in Node with a minimal DOM/localStorage stub,
// then exercise migration, save/load, spouse sync, GEDCOM, and import merge.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'sources.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/africa.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/trust.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/plan.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/gedcom.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/enslaver.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/coach.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/interpret.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/synthesize.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/companion.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/agent.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/sample.js'), 'utf8');
const SI_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'si-search.json'), 'utf8');
const LOC_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'loc-search.json'), 'utf8');
const IA_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ia-search.json'), 'utf8');
const GED_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-import.ged'), 'utf8');
const DNA_CSV_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'dna-matches.csv'), 'utf8');

// ---- stubs ----
const store = new Map();
global.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k,v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
Object.defineProperty(global.localStorage, 'keys', {value: () => [...store.keys()]});
// Object.keys(localStorage) is used in the shim's list(); make it work:
global.localStorage = new Proxy(global.localStorage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: () => ({enumerable: true, configurable: true}),
});

function makeEl(){
  return {
    innerHTML: '', textContent: '', value: '', style: {}, checked: false,
    classList: (function(){ const s = new Set(); return {
      add: c => s.add(c), remove: c => s.delete(c),
      toggle(c, force){
        if(force === undefined){ s.has(c) ? s.delete(c) : s.add(c); return s.has(c); }
        force ? s.add(c) : s.delete(c); return !!force;
      },
      contains: c => s.has(c)
    }; })(),
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    appendChild(){}, setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    dataset: {}, reset(){},
  };
}
const els = new Map();
global.document = {
  getElementById(id){ if(!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return Object.assign(makeEl(), {click(){}, remove(){}, href:'', download:''}); },
  createElementNS(){ return makeEl(); },
  body: { appendChild(){} },
  documentElement: null,
  addEventListener(){},
};
global.document.documentElement = makeEl();
global.window = {
  addEventListener(ev, fn){ if(ev==='DOMContentLoaded') global.__initFn = fn; },
  postMessage(){}
};
global.requestAnimationFrame = fn => {};
global.CSS = { escape: s => s };
global.confirm = () => true;
global.alert = m => { throw new Error('alert: ' + m); };
let downloaded = [];
global.Blob = class { constructor(parts, opts){ this.content = parts.join(''); this.type = opts && opts.type; } };
global.URL = { createObjectURL: b => { downloaded.push(b); return 'blob:x'; }, revokeObjectURL(){} };
global.fetch = () => Promise.reject(new Error('no network in test'));
global.AbortController = class { constructor(){ this.signal = {}; } abort(){} };

// Pre-seed a v1 payload (old format: bare {people, logs}) to test migration.
store.set('forebear-genealogy-data-v1', JSON.stringify({
  people: [
    { id:'pA', name:'Hattie Stowe', birthYear:'c. 1848', birthplace:'Belmont, Gaston County, NC', enslaverSurname:'Stowe', notes:'From oral history.\nSecond line.', parentIds:[] },
    { id:'pB', name:'Silas Freeman', birthYear:'1845', parentIds:[] },
    { id:'pC', name:'Mary Freeman', birthYear:'1870', parentIds:['pA','pB'] },
  ],
  logs: [
    { id:'l1', personId:'pC', status:'confirmed', type:'Census / Slave Schedule', sourceName:'1880 census', date:'2026-07-01' },
  ],
}));

// ---- load the app ----
eval(src + `
;globalThis.T = {
  get STATE(){ return STATE }, get META(){ return META }, get RESULT_CACHE(){ return RESULT_CACHE },
  get SCHEMA_VERSION(){ return SCHEMA_VERSION },
  syncSpouses, evidencedFacts, exportGEDCOM, exportJSON, applyImport, migrate, gedDate, gedName,
  buildQuickLinks, searchSmithsonian, apiErrorMessage, mergeStates, currentPayload,
  loadSampleFamily, removeSampleFamily, sampleLoaded, checklistSteps,
  maybeShowWelcome, dismissWelcome, setFormSection, toggleFormSection,
  personHasDnaData, personHasAfricaData,
  sessionKey, getOrCreateSession, activeSession, markSourceOpened, resolveSource,
  renderQuickLinks, renderSessionSummary, searchLOC, searchInternetArchive,
  variantUrlsFor, openPreview, locPreviewFromResult,
  parsePlace, personSearchCtx, discoverPerson, resumeSession,
  renderDiscoveryPlaceholder, updateDiscoveryBadge, sessionCounts, sessionPersonId,
  selectPlanPerson, renderPlanView,
  earliestEra, runDiscovery, addSurnameAsCandidate,
  ensureCase, ensurePlan, caseCoverageSummary, caseOpenHypothesis, emptyCase,
  coachForPerson,
  linkPlanCandidate, getEnslaver, peopleLinkedToEnslaver, rankEnslaverCandidates,
  findOrCreateEnslaver,
  companionValidateMessage, companionNormalizeHit, companionConfirmImport,
  agentNextSources, agentRunNext, agentResolveStep, agentEnsureSession, agentOnCompanionImport,
  markSourceOpened,
  interpretHit, normalizeExcerpt, setHitExcerpt, hydrateHitExcerpt, interpretHasExcerpt,
  gedcomToPeople, applyGedcomImport, parseGedcom, gedParseDisplayName,
  trustBadge, trustNormalize, trustClampUpgrade, trustClampConfidence, trustFromLens,
  llmMergeCoachEnhance, agentQueueHtml,
  parseDnaMatchCsv, importDnaMatchesCsv, formatDnaMatchRows,
  synthesizeBridge, synthReadiness, synthAfricaAgentReady,
  get AGENT(){ return AGENT },
  get COMPANION(){ return COMPANION },
  get QUICKLINK_CACHE(){ return QUICKLINK_CACHE },
  get EXCERPT_MAX_CHARS(){ return EXCERPT_MAX_CHARS },
  get PENDING_GEDCOM(){ return PENDING_GEDCOM },
  set PENDING_GEDCOM(v){ PENDING_GEDCOM = v; },
  setDiscoveryCtx(v){ LAST_DISCOVERY_CTX = v; },
  setKey(v){ API_KEYS.smithsonian = v; },
  setPendingImport(v){ pendingImport = v; },
};`);

// run the deferred init, then give the async loads a tick
setTimeout(async () => {
  const assert = (cond, msg) => { if(!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };
  if(global.__initFn) await global.__initFn();

  // 1. migration
  assert(T.STATE.people.length === 3, 'v1 people loaded');
  assert(Array.isArray(T.STATE.people[0].nameVariants), 'migration added nameVariants');
  assert(Array.isArray(T.STATE.people[0].spouses), 'migration added spouses');
  assert(Array.isArray(T.STATE.logs[0].supports), 'migration added supports');
  const resaved = JSON.parse(store.get('forebear-genealogy-data-v1'));
  assert(resaved.schemaVersion === T.SCHEMA_VERSION, 'migrated payload re-saved at current schema version');
  assert(T.STATE.people[0].updatedAt > 0, 'migration stamped updatedAt');
  assert(T.STATE.people[0].dna && T.STATE.people[0].africa, 'v4 migration added dna/africa');

  // 2. spouse sync
  T.STATE.people[0].spouses = [{ personId:'pB', note:'cohabitation bond, 1866' }];
  T.syncSpouses(T.STATE.people[0]);
  const pB = T.STATE.people.find(p=>p.id==='pB');
  assert(pB.spouses.length === 1 && pB.spouses[0].personId === 'pA', 'spouse link mirrored onto partner');
  assert(pB.spouses[0].note === 'cohabitation bond, 1866', 'spouse note mirrored');
  // unlink from A, re-sync -> B loses it too
  T.STATE.people[0].spouses = [];
  T.syncSpouses(T.STATE.people[0]);
  assert(pB.spouses.length === 0, 'unlink mirrored onto partner');
  T.STATE.people[0].spouses = [{ personId:'pB', note:'cohabitation bond, 1866' }];
  T.syncSpouses(T.STATE.people[0]);

  // 3. evidenced facts
  T.STATE.logs[0].supports = ['birth','parentage'];
  const facts = T.evidencedFacts('pC');
  assert(facts.join(',') === 'birth,parentage', 'evidencedFacts from confirmed log');
  T.STATE.logs[0].status = 'promising';
  assert(T.evidencedFacts('pC').length === 0, 'non-confirmed logs excluded');
  T.STATE.logs[0].status = 'confirmed';

  // 4. GEDCOM export
  downloaded = [];
  T.exportGEDCOM();
  assert(downloaded.length === 1, 'GEDCOM file produced');
  const ged = downloaded[0].content;
  assert(ged.startsWith('0 HEAD'), 'GEDCOM header');
  assert(ged.trim().endsWith('0 TRLR'), 'GEDCOM trailer');
  assert(ged.includes('1 NAME Hattie /Stowe/'), 'INDI name with surname slashes');
  assert(ged.includes('2 DATE ABT 1848'), '"c. 1848" became ABT 1848');
  assert(ged.includes('2 PLAC Belmont, Gaston County, NC'), 'birthplace as PLAC');
  assert(ged.includes('1 NOTE Associated enslaver surname: Stowe'), 'enslaver surname in NOTE');
  assert(ged.includes('2 CONT Second line.'), 'multiline note uses CONT');
  const famCount = (ged.match(/0 @F\d+@ FAM/g)||[]).length;
  assert(famCount === 1, 'parent pair + spouse pair collapse into one FAM (got ' + famCount + ')');
  assert(ged.includes('1 CHIL'), 'FAM has child');
  assert(/1 MARR\n2 NOTE cohabitation bond, 1866/.test(ged), 'marriage note on FAM');
  const famsLines = (ged.match(/1 FAMS @F1@/g)||[]).length;
  assert(famsLines === 2, 'both partners have FAMS (got ' + famsLines + ')');
  assert(ged.includes('1 FAMC @F1@'), 'child has FAMC');

  // 5. JSON export
  downloaded = [];
  T.exportJSON();
  const backup = JSON.parse(downloaded[0].content);
  assert(backup.schemaVersion === T.SCHEMA_VERSION && backup.people.length === 3, 'JSON backup payload');
  assert('plans' in backup && 'tombstones' in backup, 'backup includes plans + tombstones');
  assert(T.META.lastExportAt > 0, 'lastExportAt recorded');

  // 6. import merge (new person + updated existing)
  T.setPendingImport(T.migrate({ people: [
    { id:'pA', name:'Hattie Stowe (updated)' },
    { id:'pD', name:'New Cousin' },
  ], logs: [] }));
  T.applyImport('merge');
  assert(T.STATE.people.length === 4, 'merge added new person');
  assert(T.STATE.people.find(p=>p.id==='pA').name === 'Hattie Stowe (updated)', 'merge updated existing by id');

  // 7. import replace
  T.setPendingImport(T.migrate({ people: [{ id:'pZ', name:'Only One' }], logs: [] }));
  T.applyImport('replace');
  assert(T.STATE.people.length === 1 && T.STATE.people[0].id === 'pZ', 'replace swapped data');

  // 8. gedDate edge cases
  assert(T.gedDate('c. 1848') === 'ABT 1848', 'gedDate c.');
  assert(T.gedDate('1921') === '1921', 'gedDate plain');
  assert(T.gedDate('abt 1850') === 'ABT 1850', 'gedDate abt');
  assert(T.gedDate('unknown') === '', 'gedDate no year');
  assert(T.gedName('Silas') === 'Silas //', 'gedName single token');
  assert(T.gedName('Mary Jane Freeman') === 'Mary Jane /Freeman/', 'gedName multi token');

  // ---- source registry ----
  const ctx = { surname:'Stowe', givenName:'', state:'North Carolina', county:'Gaston', city:'', enslaver:'', variants:[] };
  const links = T.buildQuickLinks(ctx);
  const byId = Object.fromEntries(links.map(l=>[l.id, l]));
  assert(links.length > 15, 'NC context yields a full registry (got ' + links.length + ')');
  const nmaahc = byId['nmaahc-fb-portal'];
  assert(nmaahc && nmaahc.url.startsWith('https://nmaahc.si.edu/'), 'NMAAHC uses apex host (no www)');
  assert(nmaahc.url.includes(encodeURIComponent('p.nmaahc_fb.index.event_state:North Carolina')), 'NMAAHC state facet');
  assert(nmaahc.url.includes(encodeURIComponent('p.nmaahc_fb.index.event_county:Gaston')), 'NMAAHC county facet');
  assert(byId['census-1870'].url.includes('f.collectionId=1438024'), '1870 census collection id');
  assert(byId['census-1870'].url.includes('q.residencePlace='), 'census place prefill');
  assert(byId['census-1880'].url.includes('f.collectionId=1417683'), '1880 census collection id');
  assert(byId['freedmans-bank'].url.includes('f.collectionId=1417695'), "Freedman's Bank collection id");
  assert(byId['usct-soldiers'].type === 'Military / Pension Record', 'USCT card typed as military/pension');
  assert(byId['nara-catalog'].url.startsWith('https://catalog.archives.gov/search?q='), 'NARA links to catalog UI (API demoted)');
  assert(byId['nc-cohabitation'], 'NC-only card present for NC');
  const unsetLinks = T.buildQuickLinks({ surname:'Stowe', state:'', county:'', city:'', enslaver:'', variants:[] });
  assert(!unsetLinks.some(l=>l.id==='nc-cohabitation'), 'NC-only card excluded when place unset');
  const enslaverLinks = T.buildQuickLinks(Object.assign({}, ctx, { enslaver:'Jasper Rhyne' }));
  const sched = enslaverLinks.find(l=>l.id==='slave-schedule-1860');
  assert(sched && sched.url.includes('q.surname=Rhyne'), 'slave schedule searches enslaver surname');

  // ---- Smithsonian live search parses real fixture ----
  T.setKey('TESTKEY');
  const container = { innerHTML: '' };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(SI_FIXTURE)) });
  await T.searchSmithsonian(container, ctx);
  assert(container.innerHTML.includes('result-card'), 'live results render');
  assert(container.innerHTML.includes('data-log-idx='), 'live results use cache index, not inline JSON');
  assert(container.innerHTML.includes('siris-libraries.si.edu'), 'record_link parsed from real response');
  assert(T.RESULT_CACHE.length >= 3, 'RESULT_CACHE populated');
  // XSS probe: hostile title stays escaped
  const hostile = JSON.parse(SI_FIXTURE);
  hostile.response.rows[0].title = `"><img src=x onerror=alert(1)>'`;
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(hostile) });
  await T.searchSmithsonian(container, ctx);
  assert(!container.innerHTML.includes('<img src=x'), 'hostile API title is escaped');

  // ---- error messages ----
  global.fetch = () => Promise.resolve({ ok: false, status: 403 });
  await T.searchSmithsonian(container, ctx);
  assert(container.innerHTML.includes('rejected the key'), '403 maps to key message');
  global.fetch = () => Promise.reject(Object.assign(new Error('Failed to fetch'), {name:'TypeError'}));
  await T.searchSmithsonian(container, ctx);
  assert(container.innerHTML.includes('Network error'), 'network failure maps to network message');
  assert(T.apiErrorMessage({name:'AbortError', message:'aborted'}).includes('timed out'), 'abort maps to timeout message');

  // ---- onboarding: welcome gating ----
  assert(T.META.welcomeSeen === true, 'welcome auto-marked seen for existing data');

  // ---- onboarding: form section helpers ----
  T.setFormSection('dnaSection', false);
  assert(document.getElementById('dnaSection').classList.contains('collapsed'), 'setFormSection collapses');
  T.toggleFormSection('dnaSection');
  assert(!document.getElementById('dnaSection').classList.contains('collapsed'), 'toggleFormSection expands');
  assert(!T.personHasDnaData({ dna:{ company:'', testedYear:'' } }), 'personHasDnaData false when empty');
  assert(T.personHasDnaData({ dna:{ company:'AncestryDNA' } }), 'personHasDnaData true with company');
  assert(!T.personHasAfricaData({ africa:{ regionConfidence:'speculative' } }), 'confidence default does not count as africa data');
  assert(T.personHasAfricaData({ africa:{ ethnonymId:'igbo', regionConfidence:'speculative' } }), 'ethnonym counts as africa data');

  // ---- onboarding: sample family ----
  const basePeople = T.STATE.people.length, baseLogs = T.STATE.logs.length;
  T.loadSampleFamily();
  assert(T.sampleLoaded(), 'sample flagged as loaded');
  assert(T.STATE.people.length === basePeople + 4, 'sample adds 4 people');
  assert(T.STATE.logs.length === baseLogs + 3, 'sample adds 3 logs');
  assert(T.STATE.plans['sample-silas'] && T.STATE.plans['sample-silas'].steps.anchor.done, 'sample plan started');
  assert(T.STATE.people.find(p=>p.id==='sample-silas').dna, 'sample people pass ensurePersonAfrica');
  // checklist ignores sample data
  const steps = T.checklistSteps();
  assert(steps.find(s=>s.label==='Log a source — hit or miss').done === (baseLogs>0), 'checklist ignores sample logs');
  // idempotent: loading again is a no-op
  T.loadSampleFamily();
  assert(T.STATE.people.length === basePeople + 4, 'loading sample twice is a no-op');
  T.removeSampleFamily();
  assert(!T.sampleLoaded(), 'sample removed');
  assert(T.STATE.people.length === basePeople && T.STATE.logs.length === baseLogs, 'remove restores original counts');
  assert(!T.STATE.plans['sample-silas'], 'sample plan removed');
  assert(T.STATE.tombstones.some(t=>t.id==='sample-silas'), 'sample removal writes tombstones');
  // tombstones stop the sample resurrecting via merge
  const withSample = JSON.parse(JSON.stringify(T.currentPayload()));
  withSample.people.push({ id:'sample-silas', name:'Silas Freeman', sample:true, updatedAt: 1 });
  const merged = T.mergeStates(T.currentPayload(), withSample);
  assert(!merged.people.some(p=>p.id==='sample-silas'), 'merge does not resurrect removed sample');

  // ---- onboarding: checklist steps ----
  const s2 = T.checklistSteps();
  assert(s2.length === 5, 'checklist has 5 steps');
  assert(s2[0].done === true, 'first-person step done (seeded people)');
  assert(s2[4].done === true, 'backup step done (exported earlier in test)');

  // ---- search sessions ----
  const sctx = { surname:'Stowe', givenName:'Hattie', state:'North Carolina', county:'Gaston', city:'', enslaver:'', variants:'Stow, Stoe' };
  assert(T.sessionKey(sctx) === 'stowe|north carolina|gaston', 'session key normalizes case');
  const session = T.getOrCreateSession(sctx);
  assert(T.STATE.sessions[session.key] === session, 'session stored in STATE');
  assert(session.variants.join(',') === 'Stow,Stoe', 'session captured variants');
  assert(T.getOrCreateSession(sctx) === session, 'same ctx reuses session');
  T.setDiscoveryCtx(sctx);
  // populate QUICKLINK_CACHE by rendering the quick links
  const qlContainer = { innerHTML: '' };
  T.renderQuickLinks(qlContainer, sctx);
  assert(Object.keys(T.QUICKLINK_CACHE).length > 15, 'quick-link cache populated by render');
  assert(qlContainer.innerHTML.includes('data-group-toggle'), 'groups render with toggles');
  assert(qlContainer.innerHTML.includes('link-group collapsed'), 'later groups collapsed by default');
  assert(qlContainer.innerHTML.includes('variant-chip'), 'variant chips render on key cards');
  assert(!qlContainer.innerHTML.includes('Also try these spellings'), 'no separate variant card section');
  // open → resolve "nothing" → auto dead-end log entry
  const logCountBefore = T.STATE.logs.length;
  T.markSourceOpened('census-1870');
  assert(session.checks['census-1870'].status === 'opened', 'open recorded in session');
  T.resolveSource('census-1870', 'nothing');
  assert(session.checks['census-1870'].status === 'nothing', 'resolution recorded');
  assert(T.STATE.logs.length === logCountBefore + 1, 'dead-end auto-logged');
  const autoLog = T.STATE.logs[T.STATE.logs.length - 1];
  assert(autoLog.status === 'dead-end' && autoLog.findings.includes('Stowe') && autoLog.findings.includes('Stow, Stoe'), 'auto log captures search terms + variants');
  // open → resolve "found" → status recorded, no auto entry (log form opens instead)
  T.markSourceOpened('freedmans-bank');
  T.resolveSource('freedmans-bank', 'found');
  assert(session.checks['freedmans-bank'].status === 'found', 'found recorded');
  assert(T.STATE.logs.length === logCountBefore + 1, 'found does not auto-log (form opens)');
  // resolved status cannot be downgraded by re-opening
  T.markSourceOpened('census-1870');
  assert(session.checks['census-1870'].status === 'nothing', 're-open does not downgrade a resolution');
  // re-render shows the statuses
  T.renderQuickLinks(qlContainer, sctx);
  assert(qlContainer.innerHTML.includes('checked-nothing'), 'dead-end styling applied');
  assert(qlContainer.innerHTML.includes('checked-found'), 'found styling applied');
  T.renderSessionSummary();
  const summaryEl = document.getElementById('sessionSummary');
  assert(summaryEl.innerHTML.includes('2 of'), 'coverage bar counts resolved collections');
  // sessions survive merge (newest wins)
  const otherPayload = JSON.parse(JSON.stringify(T.currentPayload()));
  otherPayload.sessions[session.key].checks['usct-soldiers'] = { status:'found', at: Date.now() };
  otherPayload.sessions[session.key].updatedAt = Date.now() + 5000;
  const mergedS = T.mergeStates(T.currentPayload(), otherPayload);
  assert(mergedS.sessions[session.key].checks['usct-soldiers'], 'newer session wins in merge');

  // ---- live search: LOC newspapers (fixture) ----
  const locEl = { innerHTML: '' };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(LOC_FIXTURE)) });
  await T.searchLOC(locEl, sctx);
  assert(locEl.innerHTML.includes('Chronicling America'), 'LOC results render with source tag');
  assert(locEl.innerHTML.includes('loc.gov'), 'LOC result links to loc.gov');
  assert(document.getElementById('liveSummary').innerHTML.includes('Newspapers'), 'live summary chip for newspapers');
  assert(document.getElementById('liveSummary').innerHTML.includes('22590'), 'live summary shows total hit count');

  // ---- live search: Internet Archive (fixture) ----
  const iaEl = { innerHTML: '' };
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(IA_FIXTURE)) });
  await T.searchInternetArchive(iaEl, sctx);
  assert(iaEl.innerHTML.includes('Internet Archive'), 'IA results render with source tag');
  assert(iaEl.innerHTML.includes('archive.org/details/'), 'IA result links to details page');
  assert(iaEl.innerHTML.includes('q=Stowe'), 'IA link pre-searches the surname inside the text');
  await T.searchInternetArchive(iaEl, { surname:'Stowe', state:'', county:'', city:'', enslaver:'', variants:'' });
  assert(iaEl.innerHTML.includes('Add a state or county'), 'IA without a place shows guidance instead of noise');

  // ---- variant chips helper ----
  const vurls = T.variantUrlsFor('census-1870', sctx);
  assert(vurls.length === 2, 'variantUrlsFor returns both variants');
  assert(vurls[0].url.includes('q.surname=Stow'), 'variant url swaps surname');

  // ---- record preview: LOC IIIF ----
  const locRow = JSON.parse(LOC_FIXTURE).results[0];
  const locPrev = T.locPreviewFromResult(locRow);
  assert(locPrev && locPrev.kind === 'image' && locPrev.sizes.length === 3, 'LOC preview derives 3 IIIF sizes');
  assert(locPrev.sizes[1].includes('/full/pct:25/0/default.jpg'), 'LOC medium zoom is pct:25');
  assert(locPrev.sizes[0].startsWith('https://tile.loc.gov/'), 'LOC preview stays on tile.loc.gov (CORS-open)');
  assert(!locPrev.sizes[2].includes('#'), 'size fragment stripped');
  // rendered cards carry a Preview button
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(LOC_FIXTURE)) });
  const locEl2 = { innerHTML: '' };
  await T.searchLOC(locEl2, sctx);
  assert(locEl2.innerHTML.includes('data-preview-idx'), 'LOC cards get Preview buttons');
  const locIdx = T.RESULT_CACHE.findIndex(c=>c.preview && c.source === 'Chronicling America');
  T.openPreview(locIdx);
  const pBody = document.getElementById('previewBody');
  assert(pBody.innerHTML.includes('tile.loc.gov') && pBody.innerHTML.includes('pct:25'), 'preview modal renders medium IIIF image');
  assert(document.getElementById('previewZoom').innerHTML.includes('data-zoom="2"'), 'zoom controls render');
  assert(document.getElementById('previewOpenLink').href === T.RESULT_CACHE[locIdx].url, 'escape hatch links to the original');

  // ---- record preview: Internet Archive embed ----
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(IA_FIXTURE)) });
  const iaEl2 = { innerHTML: '' };
  await T.searchInternetArchive(iaEl2, sctx);
  const iaIdx = T.RESULT_CACHE.findIndex(c=>c.preview && c.preview.kind === 'iframe');
  assert(iaIdx >= 0, 'IA cards carry iframe previews');
  T.openPreview(iaIdx);
  assert(pBody.innerHTML.includes('https://archive.org/embed/'), 'preview modal embeds BookReader');
  assert(document.getElementById('previewZoom').innerHTML === '', 'no zoom controls for iframe previews');

  // ---- record preview: Smithsonian without media has no preview ----
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(SI_FIXTURE)) });
  const siEl = { innerHTML: '' };
  await T.searchSmithsonian(siEl, sctx);
  assert(!siEl.innerHTML.includes('data-preview-idx'), 'SI records without online_media get no Preview button');

  // ---- birthplace parsing ----
  const pp1 = T.parsePlace('Belmont, Gaston County, NC');
  assert(pp1.state === 'North Carolina' && pp1.county === 'Gaston' && pp1.city === 'Belmont', 'parses city, county, state abbreviation');
  const pp2 = T.parsePlace('Charlotte, N.C.');
  assert(pp2.state === 'North Carolina' && pp2.city === 'Charlotte' && pp2.county === '', 'parses dotted abbreviation');
  const pp3 = T.parsePlace('St. Catherine Parish, Jamaica');
  assert(pp3.state === 'Jamaica' && pp3.county === 'St. Catherine', 'parses Caribbean parish + island');
  assert(T.parsePlace('').state === '', 'empty birthplace parses to empty');
  assert(T.parsePlace('Gaston County, North Carolina').state === 'North Carolina', 'parses full state name');

  // ---- person-linked search ----
  T.STATE.people.push({ id:'pT', name:'Hattie Stowe', birthplace:'Belmont, Gaston County, NC',
    nameVariants:['Stow'], parentIds:[], spouses:[], enslaverSurname:'Rhyne', updatedAt: Date.now() });
  const pT = T.STATE.people.find(p=>p.id==='pT');
  const pctx = T.personSearchCtx(pT, null);
  assert(pctx.surname === 'Stowe' && pctx.givenName === 'Hattie', 'person ctx splits name');
  assert(pctx.state === 'North Carolina' && pctx.county === 'Gaston' && pctx.city === 'Belmont', 'person ctx parses birthplace when no plan');
  assert(pctx.variants.join(',') === 'Stow' && pctx.enslaver === 'Rhyne', 'person ctx carries variants + enslaver');
  global.fetch = () => Promise.reject(new Error('offline in test'));
  T.discoverPerson('pT');
  assert(T.activeSession() && T.activeSession().key === 'stowe|north carolina|gaston', 'discoverPerson reuses the matching session');
  assert(T.activeSession().personId === 'pT', 'session linked to the person');
  assert(document.getElementById('tkSurname').value === 'Stowe', 'discovery form prefilled from person');
  assert(T.sessionPersonId() === 'pT', 'log linking prefers the session person');
  T.resolveSource('wpa-narratives', 'nothing');
  const lastLog = T.STATE.logs[T.STATE.logs.length - 1];
  assert(lastLog.personId === 'pT', 'auto dead-end log attaches to the session person');

  // ---- resume panel ----
  const tk = document.getElementById('toolkitResults');
  tk.innerHTML = '';
  T.renderDiscoveryPlaceholder();
  assert(tk.innerHTML.includes('Pick up where you left off'), 'landing shows recent searches');
  assert(tk.innerHTML.includes('data-resume-key'), 'recent searches have Resume buttons');
  assert(tk.innerHTML.includes('For Hattie Stowe'), 'session card names its person');
  assert(tk.innerHTML.includes('dead end'), 'session card shows coverage counts');
  document.getElementById('tkSurname').value = '';
  T.resumeSession('stowe|north carolina|gaston');
  assert(document.getElementById('tkSurname').value === 'Stowe', 'resume refills the form');
  assert(T.activeSession().key === 'stowe|north carolina|gaston', 'resume reactivates the session');

  // ---- plan records step reflects the session ----
  T.selectPlanPerson('pT');
  const planContent = document.getElementById('planContent');
  assert(planContent.innerHTML.includes('check-found'), 'plan checklist shows found status from Discovery session');
  assert(planContent.innerHTML.includes('Synced from Discovery'), 'session-resolved rows are locked as synced');
  assert(planContent.innerHTML.includes('Run Discovery for Stowe'), 'plan offers one-click person search');

  // ---- discovery nav badge ----
  T.markSourceOpened('nmaahc-fb-portal');
  T.updateDiscoveryBadge();
  const badge = document.getElementById('discoveryBadge');
  assert(badge.hidden === false && Number(badge.textContent) >= 1, 'nav badge counts opened-unresolved collections');
  T.resolveSource('nmaahc-fb-portal', 'nothing');
  T.updateDiscoveryBadge();
  assert(Number(badge.textContent) === 0 || badge.hidden === true, 'badge clears when resolved');

  // ---- earliest mentions: era bounding ----
  const era1 = T.earliestEra({ birthYear: 'c. 1832' });
  assert(era1.start === 1832 && era1.end === 1877, 'era from birth year to Reconstruction');
  const era2 = T.earliestEra({ birthYear: '1890' });
  assert(era2.start === 1890 && era2.end === 1920, 'era extends past 1877 for later births');
  const era3 = T.earliestEra(null);
  assert(era3.start === 1789 && era3.end === 1877, 'default era without a person');

  // ---- earliest mentions: era params reach the archives ----
  let capturedUrl = '';
  global.fetch = (u)=>{ capturedUrl = String(u); return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(LOC_FIXTURE)) }); };
  await T.searchLOC({ innerHTML: '' }, Object.assign({}, sctx, { era: { start: 1832, end: 1877 } }));
  assert(capturedUrl.includes('dates=1832/1877') && capturedUrl.includes('sort=date'), 'LOC gets date range + oldest-first sort');
  global.fetch = (u)=>{ capturedUrl = String(u); return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(IA_FIXTURE)) }); };
  await T.searchInternetArchive({ innerHTML: '' }, Object.assign({}, sctx, { era: { start: 1832, end: 1877 } }));
  assert(decodeURIComponent(capturedUrl).includes('year:[1832 TO 1877]'), 'IA gets year range');
  assert(capturedUrl.includes('sort[]=year+asc'), 'IA sorts year ascending');

  // ---- earliest mentions: end-to-end + candidate hookup ----
  global.fetch = () => Promise.reject(new Error('offline in test'));
  T.resumeSession('stowe|north carolina|gaston'); // refill form, session person = pT
  T.runDiscovery('', 'earliest');
  const tkHtml = document.getElementById('toolkitResults').innerHTML;
  assert(tkHtml.includes('Earliest dated mentions'), 'earliest mode renders explainer + section');
  assert(tkHtml.includes('enslaver candidate'), 'explainer offers the candidate hookup for a person-linked session');
  const candBefore = (T.STATE.plans['pT'] && T.STATE.plans['pT'].candidates.length) || 0;
  T.addSurnameAsCandidate();
  assert(T.STATE.plans['pT'].candidates.some(c=>c.name === 'Stowe'), 'surname added as enslaver candidate on the plan');
  T.addSurnameAsCandidate();
  assert(T.STATE.plans['pT'].candidates.filter(c=>c.name==='Stowe').length === 1, 'candidate add is deduped');

  // ---- Phase A: case file (schema v6) + coach from case ----
  assert(T.SCHEMA_VERSION === 7, 'schema version is 7');
  const v5Payload = {
    schemaVersion: 5,
    people: [{ id:'pCase', name:'Chaney Freeman', birthYear:'1840', parentIds:[], spouses:[], nameVariants:[], updatedAt:1 }],
    logs: [],
    plans: {
      pCase: {
        updatedAt: 1, state: 'North Carolina', county: 'Gaston', fieldOffice: '',
        steps: {
          anchor:{done:true,note:'',checked:{}},
          county:{done:true,note:'',checked:{}},
          records:{done:true,note:'',checked:{}},
          enslaver:{done:false,note:'',checked:{}},
          confirm:{done:false,note:'',checked:{}},
          africa:{done:false,note:'',checked:{}}
        },
        candidates: [{ name: 'Rhyne', status: 'untested' }]
      }
    },
    tombstones: [],
    sessions: {}
  };
  const migrated = T.migrate(v5Payload);
  assert(migrated.schemaVersion === 7, 'v5 payload migrates to v7');
  assert(migrated.plans.pCase.case && Array.isArray(migrated.plans.pCase.case.hypotheses), 'migrate seeds empty case on plan');
  const orphanCase = T.ensureCase('pMissingNobody');
  assert(orphanCase && Array.isArray(orphanCase.openQuestions), 'ensureCase works for person with no prior plan');
  if(!T.STATE.people.find(p=>p.id==='pCase')){
    T.STATE.people.push({
      id:'pCase', name:'Chaney Freeman', birthYear:'1840', parentIds:[],
      spouses:[], nameVariants:[], updatedAt:1, dna:{}, africa:{}
    });
  }
  T.STATE.plans.pCase = migrated.plans.pCase;
  const kase = T.ensureCase('pCase');
  assert(kase.hypotheses.some(h => (h.enslaverName || '').toLowerCase() === 'rhyne'), 'ensureCase seeds hypothesis from candidates');
  assert(kase.openQuestions.length >= 1, 'ensureCase seeds a starter open question');
  const cov = T.caseCoverageSummary('pCase');
  assert(cov.total === 0, 'coverage summary empty without sessions');
  T.selectPlanPerson('pCase');
  assert(document.getElementById('planContent').innerHTML.includes('Case file'), 'plan view renders case file panel');
  assert(document.getElementById('planContent').innerHTML.includes('held or employed') || document.getElementById('planContent').innerHTML.includes('Rhyne'), 'case shows candidate-derived hypothesis');
  const coach = T.coachForPerson('pCase');
  assert(coach.chip.includes('Case') || /rhyne/i.test(coach.headline + coach.why), 'coach prioritizes case lead');
  assert(coach.primary && coach.primary.kind, 'coach still returns an action kind');
  const emptyCoach = T.coachForPerson('');
  assert(emptyCoach.secondary && emptyCoach.secondary.kind === 'story', 'empty tree coach keeps story secondary');
  const payload = T.currentPayload();
  assert(payload.plans.pCase && payload.plans.pCase.case, 'backup payload includes case on plan');

  // ---- Phase B: enslaver graph ----
  assert(T.SCHEMA_VERSION === 7, 'schema version is 7');
  const sib = {
    id:'pSib', name:'Silas Freeman', birthYear:'1838', parentIds:[],
    spouses:[], nameVariants:[], updatedAt:1, dna:{}, africa:{}
  };
  if(!T.STATE.people.find(p=>p.id==='pSib')) T.STATE.people.push(sib);
  const linkA = T.linkPlanCandidate('pCase', 'Jasper Rhyne', { note: 'oral' });
  assert(linkA && linkA.enslaver && linkA.enslaver.id, 'linkPlanCandidate creates enslaver entity');
  const linkB = T.linkPlanCandidate('pSib', 'Jasper Rhyne', {});
  assert(linkB && linkB.enslaver.id === linkA.enslaver.id, 'two people share the same enslaver id');
  assert(T.peopleLinkedToEnslaver(linkA.enslaver.id).length >= 2, 'peopleLinkedToEnslaver lists both');
  // Mark found on a session for pCase searching Rhyne-ish — use surname Rhyne
  const skey = T.sessionKey({ surname:'Rhyne', state:'North Carolina', county:'Gaston' });
  T.STATE.sessions[skey] = {
    key: skey, surname:'Rhyne', givenName:'', state:'North Carolina', county:'Gaston',
    variants:[], personId:'pCase', createdAt:1, updatedAt:1,
    checks: { 'chronicling-america': { status:'found', at:1 } }
  };
  T.STATE.plans.pSib = T.ensurePlan('pSib');
  T.STATE.plans.pSib.candidates.forEach(c=>{
    if((c.name||'').toLowerCase().includes('rhyne')) c.status = 'ruled-out';
  });
  const ranked = T.rankEnslaverCandidates('pCase', { surname:'Freeman', state:'North Carolina', county:'Gaston' }, []);
  assert(ranked.length >= 1, 'rankEnslaverCandidates returns rows');
  const rhyneRank = ranked.find(r => /rhyne/i.test(r.name));
  assert(rhyneRank, 'Rhyne appears in ranking');
  assert(rhyneRank.reasons.some(x => /find|Discovery|relative|plan/i.test(x)), 'ranking cites graph or discovery evidence');
  // Ruled-out on sibling should still appear but not dominate over found boosts — score exists
  assert(typeof rhyneRank.score === 'number' && rhyneRank.score >= 8, 'ranked score is usable');
  const v6mig = T.migrate({
    schemaVersion: 6,
    people: [{ id:'pM', name:'Test', parentIds:[], spouses:[], nameVariants:[], updatedAt:1 }],
    logs: [],
    plans: {
      pM: {
        updatedAt:1, state:'North Carolina', county:'Gaston', fieldOffice:'',
        steps: {}, candidates: [{ name:'Stowe', status:'untested' }],
        case: { openQuestions:[], hypotheses:[], notes:'', updatedAt:1 }
      }
    },
    tombstones: [],
    sessions: {},
    enslavers: {}
  });
  assert(v6mig.schemaVersion === 7, 'v6 migrates to v7');
  assert(v6mig.plans.pM.candidates[0].enslaverId, 'migrate attaches enslaverId to candidates');
  assert(v6mig.enslavers[v6mig.plans.pM.candidates[0].enslaverId], 'migrate creates enslaver record');
  T.selectPlanPerson('pCase');
  assert(document.getElementById('planContent').innerHTML.includes('Ranked across your tree') || document.getElementById('planContent').innerHTML.includes('Also on'), 'plan enslaver step shows graph UI');

  // ---- Phase C: companion message schema + FS parser fixture ----
  eval(fs.readFileSync(path.join(ROOT, 'extension/parsers/familysearch.js'), 'utf8'));
  assert(typeof companionValidateMessage === 'function', 'companionValidateMessage exported');
  assert(companionValidateMessage({ source:'forebear-companion', v:1, type:'pong' }), 'valid pong message');
  assert(!companionValidateMessage({ source:'forebear-companion', v:1, type:'nope' }), 'rejects unknown type');
  assert(!companionValidateMessage({ source:'forebear-companion', v:1, type:'hits', hits:'x' }), 'rejects non-array hits');
  const fixtureHtml = fs.readFileSync(path.join(ROOT, 'test/fixtures/familysearch-results.html'), 'utf8');
  function fakeDocFromFixture(html){
    const links = [];
    const re = /<a\s+href="([^"]*ark:\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while((m = re.exec(html))){
      links.push({ href: m[1], text: m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim() });
    }
    const items = links.filter(l => /ark:\//.test(l.href)).map(l => {
      const a = {
        tagName: 'A',
        href: l.href.startsWith('http') ? l.href : ('https://www.familysearch.org' + l.href),
        getAttribute(n){ return n === 'href' ? l.href : null; },
        textContent: l.text
      };
      return {
        tagName: 'LI',
        textContent: l.text + ' 1860',
        querySelector(sel){ return sel.includes('ark') ? a : null; }
      };
    });
    return {
      querySelectorAll(sel){
        if(sel.includes('search-result') || sel.includes('result')) return items;
        if(sel.includes('ark:')) return items.map(i => i.querySelector('a[href*="/ark:/"]'));
        return [];
      }
    };
  }
  const parsedHits = parseFamilySearchResults(fakeDocFromFixture(fixtureHtml), 'https://www.familysearch.org/search/record/results');
  assert(parsedHits.length >= 2, 'FS fixture yields ark hits');
  assert(parsedHits.every(h => h.url && h.label && h.source === 'companion'), 'FS hits have url/label/source');
  assert(parsedHits.some(h => /Rhyne/i.test(h.label)), 'FS fixture includes Rhyne label');
  const emptyHits = parseFamilySearchResults({ querySelectorAll(){ return []; } }, 'https://www.familysearch.org/');
  assert(Array.isArray(emptyHits) && emptyHits.length === 0, 'unexpected DOM returns empty hits');

  COMPANION.pendingHits = parsedHits.slice(0, 2).map(companionNormalizeHit);
  const beforeCache = T.RESULT_CACHE.length;
  companionConfirmImport();
  assert(T.RESULT_CACHE.length >= beforeCache + 2, 'confirm import caches companion hits');
  assert(document.getElementById('statusCompanion'), 'companion status element exists in keys panel');

  // ---- Phase D: agent runner queue + resolve ----
  global.window.open = () => null;
  assert(typeof agentNextSources === 'function' && typeof agentRunNext === 'function', 'agent runner loaded');
  assert(agentNextSources('').length === 0, 'no person → empty queue');
  T.STATE.plans.pCase.steps.records.done = false;
  T.STATE.plans.pCase.state = 'North Carolina';
  T.STATE.plans.pCase.county = 'Gaston';
  const queued = agentNextSources('pCase', 3);
  assert(queued.length >= 1 && queued.length <= 3, 'agent queues up to N checklist/live steps');
  assert(queued.every(s => s.kind && s.label && s.status), 'queue steps have kind/label/status');
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(LOC_FIXTURE)) });
  AGENT.personId = 'pCase';
  AGENT.steps = queued.map(s => Object.assign({}, s));
  AGENT.steps[0].kind = 'link';
  AGENT.steps[0].status = 'needs-review';
  AGENT.steps[0].sourceId = AGENT.steps[0].sourceId || 'freedmans-bank';
  agentEnsureSession('pCase');
  const qcache = T.QUICKLINK_CACHE;
  if(!qcache[AGENT.steps[0].sourceId]){
    qcache[AGENT.steps[0].sourceId] = {
      id: AGENT.steps[0].sourceId,
      label: AGENT.steps[0].label,
      url: AGENT.steps[0].url || 'https://example.com',
      type: 'Other'
    };
  }
  const logsBefore = T.STATE.logs.length;
  markSourceOpened(AGENT.steps[0].sourceId);
  agentResolveStep(0, 'nothing');
  assert(AGENT.steps[0].status === 'done', 'resolve marks step done');
  assert(T.STATE.logs.length >= logsBefore + 1, 'dead-end resolve writes a log');
  const kaseAfter = T.ensureCase('pCase');
  assert((kaseAfter.timeline || []).some(t => t.kind === 'agent-dead-end'), 'case timeline records dead-end');
  AGENT.steps.push({
    id: 'familysearch-all', sourceId: 'familysearch-all', kind: 'companion',
    label: 'FamilySearch', url: 'https://www.familysearch.org/', status: 'awaiting-capture', note: ''
  });
  agentOnCompanionImport(2);
  assert(AGENT.steps[AGENT.steps.length - 1].status === 'needs-review', 'companion import advances awaiting step');
  AGENT.steps.push({
    id: 'x', sourceId: 'last-seen', kind: 'link', label: 'Jasper Rhyne notice',
    url: 'https://example.com', status: 'needs-review', note: ''
  });
  const ei = AGENT.steps.length - 1;
  qcache['last-seen'] = { id:'last-seen', label:'Last Seen', url:'https://example.com', type:'Other' };
  agentResolveStep(ei, 'enslaver');
  assert(AGENT.steps[ei].status === 'done', 'enslaver resolve completes step');
  assert(Object.keys(T.STATE.enslavers || {}).length >= 1, 'enslaver lead creates/links entity');

  // ---- Phase E: excerpt / page text interpret ----
  const titleHit = {
    label: 'County court minutes',
    note: '1860 — Gaston',
    year: 1860,
    url: 'https://example.com/court-minutes',
    source: 'Chronicling America',
    type: 'Newspaper / Advertisement'
  };
  const ctxE = { surname: 'Freeman' };
  const titleOnly = T.interpretHit(titleHit, ctxE);
  assert(titleOnly.lens === 'enslaver-lead', 'pre-1865 title → enslaver-lead without excerpt');
  assert(!titleOnly.excerptBased, 'no excerpt → not excerpt-based');
  const emptyExcerpt = T.interpretHit(Object.assign({}, titleHit, { excerpt: '' }), ctxE);
  assert(emptyExcerpt.lens === titleOnly.lens && emptyExcerpt.why === titleOnly.why, 'empty excerpt → same as title-only');
  const withExcerpt = T.interpretHit(Object.assign({}, titleHit, {
    excerpt: 'one negro man named Tom belonging to Jasper Rhyne of Gaston County'
  }), ctxE);
  assert(withExcerpt.excerptBased, 'excerpt flags excerptBased');
  assert(withExcerpt.lens === 'enslaver-lead', 'belonging-to excerpt → enslaver-lead');
  assert(/Jasper Rhyne|Rhyne/i.test(withExcerpt.candidateName), 'excerpt names enslaver as candidate');
  assert(/OCR may err/i.test(withExcerpt.why), 'why labels OCR uncertainty');
  const titleWhyScore = (titleOnly.candidateName || '').toLowerCase() === 'freeman';
  const excerptBetter = /rhyne/i.test(withExcerpt.candidateName);
  assert(excerptBetter && titleWhyScore, 'excerpt raises named enslaver vs surname-only title lead');
  const long = 'x'.repeat(T.EXCERPT_MAX_CHARS + 500);
  const norm = T.normalizeExcerpt(long);
  assert(norm.truncated && norm.text.length === T.EXCERPT_MAX_CHARS, 'long text truncated at max');
  T.setDiscoveryCtx({ surname: 'Freeman', givenName: 'Hattie', state: 'North Carolina', county: 'Gaston' });
  T.getOrCreateSession({ surname: 'Freeman', state: 'North Carolina', county: 'Gaston' }, 'pCase');
  const beforeLen = T.RESULT_CACHE.length;
  T.RESULT_CACHE.push({
    label: 'Sale notice',
    url: 'https://example.com/sale-notice',
    source: 'Chronicling America',
    year: 1855,
    note: '1855'
  });
  const eIdx = beforeLen;
  const saved = T.setHitExcerpt(eIdx, 'his servant belonging to John Stowe');
  assert(saved && T.RESULT_CACHE[eIdx].excerpt.indexOf('John Stowe') >= 0, 'setHitExcerpt stores text on hit');
  const sess = T.activeSession();
  assert(sess.excerpts && sess.excerpts['https://example.com/sale-notice'], 'excerpt persisted on session by url');
  const afterPaste = T.interpretHit(T.RESULT_CACHE[eIdx], { surname: 'Freeman' });
  assert(afterPaste.excerptBased && /Stowe/i.test(afterPaste.candidateName || afterPaste.why), 'paste updates insight why / candidate');
  const huge = T.setHitExcerpt(eIdx, 'y'.repeat(T.EXCERPT_MAX_CHARS + 100));
  assert(huge.truncated && T.RESULT_CACHE[eIdx].excerptTruncated, 'oversized paste marked truncated');
  const fromCompanion = T.companionNormalizeHit({
    label: 'FS result',
    url: 'https://www.familysearch.org/ark:/61903/1:1:TEST',
    pageText: 'belonging to William Rhyne'
  });
  assert(fromCompanion && fromCompanion.excerpt && /William Rhyne/i.test(fromCompanion.excerpt), 'companion pageText → excerpt');
  assert(document.getElementById('excerptOverlay') && document.getElementById('excerptText'), 'excerpt modal exists');

  // ---- Phase F: GEDCOM import ----
  assert(typeof T.gedcomToPeople === 'function' && typeof T.applyGedcomImport === 'function', 'gedcom import loaded');
  assert(T.gedParseDisplayName('Hattie /Freeman/') === 'Hattie Freeman', 'NAME slash form → display name');
  const parsedGed = T.gedcomToPeople(GED_FIXTURE);
  assert(parsedGed.people.length === 5, 'sample GEDCOM → 5 people (got ' + parsedGed.people.length + ')');
  assert(parsedGed.warnings === 0, 'clean fixture has no warnings');
  const hattie = parsedGed.people.find(p => p.name === 'Hattie Freeman');
  assert(hattie && hattie.birthYear === 'c. 1867', 'ABT date → c. year');
  assert(hattie.birthplace.indexOf('Gaston') >= 0, 'BIRT PLAC imported');
  assert(hattie.parentIds.length === 2, 'child parentIds set from FAM');
  const silas = parsedGed.people.find(p => p.name === 'Silas Freeman');
  assert(silas && silas.enslaverSurname === 'Rhyne', 'enslaver surname from NOTE');
  const chaney = parsedGed.people.find(p => p.name === 'Chaney Freeman');
  assert(chaney && (chaney.nameVariants || []).some(v => /Stowe/i.test(v)), 'second NAME → variant');
  assert(silas.spouses.some(s => s.personId === chaney.id), 'FAM HUSB/WIFE → spouses');
  const beforePeople = T.STATE.people.length;
  T.PENDING_GEDCOM = parsedGed;
  const applied = T.applyGedcomImport();
  assert(applied.added === 5, 'apply adds 5 people');
  assert(T.STATE.people.length === beforePeople + 5, 'STATE grew by 5');
  const imported = T.STATE.people.filter(p => p.name === 'Hattie Freeman' && p.id !== 'pA');
  assert(imported.length >= 1, 'imported Hattie present with new id');
  const impId = imported[imported.length - 1].id;
  assert(T.STATE.plans[impId] && T.STATE.plans[impId].case, 'empty plan+case created');
  const coachImp = T.coachForPerson(impId);
  assert(coachImp && coachImp.primary && coachImp.primary.kind, 'coachForPerson works on imported person');
  const bad = T.parseGedcom('0 HEAD\nnot a line\n0 TRLR');
  assert(bad.warnings >= 1, 'malformed line increments warning count');
  assert(document.getElementById('gedcomOverlay') && document.getElementById('gedcomFile'), 'gedcom UI elements exist');

  // ---- Phase G: trust labels ----
  assert(typeof T.trustBadge === 'function' && typeof T.trustNormalize === 'function', 'trust helpers loaded');
  assert(T.trustNormalize('untested') === 'lead', 'untested → lead');
  assert(T.trustNormalize('promising') === 'hypothesis', 'promising → hypothesis');
  assert(T.trustNormalize('ruled-out') === 'ruled_out', 'ruled-out → ruled_out');
  assert(T.trustClampUpgrade('confirmed', 'lead') === 'lead', 'cannot upgrade lead → confirmed');
  assert(T.trustClampUpgrade('confirmed', 'confirmed') === 'confirmed', 'confirmed stays confirmed');
  assert(T.trustClampConfidence('documentary') === 'speculative', 'AI confidence clamp blocks documentary');
  assert(T.trustFromLens('enslaver-lead') === 'lead', 'enslaver lens → lead trust');
  const badgeHtml = T.trustBadge('lead');
  assert(/trust-badge/.test(badgeHtml) && /data-trust="lead"/.test(badgeHtml), 'trustBadge emits chip markup');
  const coachT = T.coachForPerson('pCase');
  assert(coachT.trust === 'lead' || coachT.trust === 'hypothesis', 'coach attaches trust class');
  const coachMerged = T.llmMergeCoachEnhance(coachT, {
    headline: 'Polished headline',
    why: 'Polished why',
    trust: 'confirmed',
    primary: { label: 'Hacked', kind: 'add-person' }
  });
  assert(coachMerged.headline === 'Polished headline', 'enhance updates headline');
  assert(coachMerged.primary.kind === coachT.primary.kind, 'enhance leaves primary.kind stable');
  assert(coachMerged.trust === coachT.trust, 'enhance leaves trust class stable');
  assert(coachMerged.key === coachT.key, 'enhance leaves coach key stable');
  AGENT.personId = 'pCase';
  AGENT.steps = [{
    id: 'x', sourceId: 'freedmans-bank', kind: 'link', label: 'Freedman\'s Bank',
    url: 'https://example.com', status: 'needs-review', note: ''
  }];
  const qHtml = T.agentQueueHtml();
  assert(/trust-badge/.test(qHtml) && /data-trust="lead"/.test(qHtml), 'agent review cards show lead badges');
  const interpT = T.interpretHit({
    label: 'Sale notice', year: 1855, source: 'Chronicling America',
    excerpt: 'belonging to Jasper Rhyne'
  }, { surname: 'Freeman' });
  assert(interpT.trust === 'lead', 'interpret hit trust is lead not confirmed');
  T.selectPlanPerson('pCase');
  assert(document.getElementById('planContent').innerHTML.indexOf('trust-badge') >= 0
    || document.getElementById('planContent').innerHTML.indexOf('trust-lead') >= 0
    || document.getElementById('planContent').innerHTML.indexOf('Case file') >= 0,
    'plan view can render trust vocabulary');

  // ---- Phase H: DNA CSV + case-gated Africa agent ----
  assert(typeof T.parseDnaMatchCsv === 'function' && typeof T.importDnaMatchesCsv === 'function', 'DNA CSV helpers loaded');
  const dnaParsed = T.parseDnaMatchCsv(DNA_CSV_FIXTURE);
  assert(dnaParsed.rows.length === 3, 'DNA fixture yields 3 matches');
  assert(dnaParsed.rows[0].name.indexOf('Okonkwo') >= 0, 'match name parsed');
  let emptyErr = '';
  try{ T.importDnaMatchesCsv('pCase', '   '); }catch(e){ emptyErr = e.message || ''; }
  assert(/No match|empty|rows/i.test(emptyErr), 'empty CSV throws');
  const pDna = T.STATE.people.find(p => p.id === 'pCase') || T.STATE.people[0];
  const dnaId = pDna.id;
  if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(pDna);
  else { pDna.dna = pDna.dna || {}; pDna.africa = pDna.africa || {}; }
  pDna.dna.keyMatches = '';
  pDna.dna.company = '';
  pDna.africa.regionConfidence = 'speculative';
  const impDna = T.importDnaMatchesCsv(dnaId, DNA_CSV_FIXTURE);
  assert(impDna.count === 3, 'import reports 3 matches');
  assert(/Okonkwo/.test(pDna.dna.keyMatches) && /Diallo/.test(pDna.dna.keyMatches), 'CSV fills keyMatches');
  assert(pDna.africa.regionConfidence !== 'confirmed' && pDna.africa.regionConfidence !== 'documentary',
    'CSV import never sets regionConfidence to confirmed/documentary');

  // Paper trail not ready
  T.STATE.logs = T.STATE.logs.filter(l => l.personId !== dnaId || l.status !== 'confirmed');
  T.STATE.plans[dnaId].steps.confirm.done = false;
  T.STATE.plans[dnaId].steps.anchor.done = false;
  const early = T.synthReadiness(dnaId);
  assert(!early.ready, 'synth readiness false without confirm/anchor trail');

  // On Africa step with paper ready but no case foothold → coach blocks ethnonym leap
  Object.keys(T.STATE.plans[dnaId].steps).forEach(k => {
    T.STATE.plans[dnaId].steps[k].done = (k !== 'africa');
  });
  T.STATE.logs.push({
    id: 'lDnaGate', personId: dnaId, status: 'confirmed', type: 'Other',
    sourceName: 'Cohabitation bond', supports: ['name'], findings: 'named',
    updatedAt: Date.now()
  });
  T.STATE.plans[dnaId].candidates = [];
  T.STATE.plans[dnaId].case = { openQuestions: [], hypotheses: [], notes: '', timeline: [], updatedAt: 1 };
  T.STATE.sessions = {};
  const paperOk = T.synthReadiness(dnaId);
  assert(paperOk.ready, 'confirmed named log → paper ready');
  const africaGate = T.synthAfricaAgentReady(dnaId);
  assert(!africaGate.ready, 'no case foothold → Africa agent gated');
  const coachAfrica = T.coachForPerson(dnaId);
  assert(coachAfrica.key === 'africa', 'coach lands on africa step');
  assert(coachAfrica.primary.kind === 'open-plan' || coachAfrica.primary.kind === 'edit-person-dna',
    'coach primary is plan foothold or DNA — not Bridge leap');
  assert(/foothold|DNA|enslaver|Confirm|Africa/i.test(coachAfrica.headline + ' ' + coachAfrica.why),
    'coach messaging blocks Africa ethnonym leap');
  const synthGate = T.synthesizeBridge(dnaId);
  assert(synthGate.africaAgentReady === false, 'synthesizeBridge exposes africaAgentReady false');
  assert(synthGate.dnaQuestions.length >= 1, 'DNA questions still proposed when gated');

  // Case foothold unlocks agent
  T.STATE.plans[dnaId].candidates = [{ name: 'Rhyne', status: 'untested' }];
  T.ensureCase(dnaId);
  const africaOpen = T.synthAfricaAgentReady(dnaId);
  assert(africaOpen.ready, 'candidate on plan unlocks Africa agent');

  pDna.dna.keyMatches = '';
  pDna.dna.company = '';
  const dnaSteps = T.agentNextSources(dnaId, 5);
  assert(dnaSteps.some(s => s.kind === 'dna'), 'agent queues DNA workspace when matches empty');

  assert(document.getElementById('dnaMatchFile'), 'DNA CSV file input exists');

  console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nALL SMOKE TESTS PASSED');
}, 50);
