// Smoke test: load app.js in Node with a minimal DOM/localStorage stub,
// then exercise migration, save/load, spouse sync, GEDCOM, and import merge.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'sources.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/africa.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/plan.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/sync.js'), 'utf8')
  + '\n;' + fs.readFileSync(path.join(ROOT, 'js/sample.js'), 'utf8');
const SI_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'si-search.json'), 'utf8');
const LOC_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'loc-search.json'), 'utf8');
const IA_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'ia-search.json'), 'utf8');

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
};
global.document.documentElement = makeEl();
global.window = { addEventListener(ev, fn){ if(ev==='DOMContentLoaded') global.__initFn = fn; } };
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
  variantUrlsFor,
  get QUICKLINK_CACHE(){ return QUICKLINK_CACHE },
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

  console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nALL SMOKE TESTS PASSED');
}, 50);
