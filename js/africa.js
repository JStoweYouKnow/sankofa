// ---------------------------------------------------------------
// Bridge to Africa
// Ethnonym glossary, voyage / African Origins link builders, DNA
 // helpers, and confidence vocabulary. Loaded after sources.js;
// used by the person form, Research Plan step 6, and Discovery.
 // Uses esc() from app.js when available; falls back to _aEsc.
// ---------------------------------------------------------------

function _aEsc(str){
  if(typeof esc === 'function') return esc(str);
  if(str===undefined||str===null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const CONFIDENCE_LEVELS = {
  'documentary': {
    label: 'Documentary',
    short: 'Doc',
    note: 'Named in a primary source (register, estate paper, baptism, voyage list).'
  },
  'dna-supported': {
    label: 'DNA-supported',
    short: 'DNA',
    note: 'Ethnicity estimate and/or African matches support this region; not a village-level proof.'
  },
  'oral': {
    label: 'Oral history',
    short: 'Oral',
    note: 'Family tradition. Treat as a hypothesis to test against DNA and documents.'
  },
  'speculative': {
    label: 'Speculative',
    short: 'Spec',
    note: 'Working guess from trade routes, ports, or ethnonyms — keep testing.'
  }
};

// Common ethnonyms in American / Caribbean records → modern regions.
// Names include historical spellings researchers will see in documents.
const ETHNONYMS = [
  {
    id: 'igbo',
    label: 'Igbo (Ibo / Eboe)',
    aliases: ['Igbo','Ibo','Eboe','Ebo'],
    region: 'Southeastern Nigeria (Bight of Biafra)',
    modern: 'Nigeria',
    note: 'Very common in British Caribbean and some U.S. records. Pair with Bight of Biafra embarkations in Slave Voyages.'
  },
  {
    id: 'akan',
    label: 'Akan (Coromantee / Fante / Asante)',
    aliases: ['Akan','Coromantee','Coromanti','Koromanti','Fante','Fanti','Asante','Ashanti'],
    region: 'Ghana — Gold Coast',
    modern: 'Ghana',
    note: '"Coromantee" in Jamaican and other British records usually points to Akan-speaking Gold Coast peoples.'
  },
  {
    id: 'yoruba',
    label: 'Yoruba (Nago / Lucumí)',
    aliases: ['Yoruba','Nago','Nagô','Lucumi','Lucumí'],
    region: 'Southwestern Nigeria / Benin (Bight of Benin)',
    modern: 'Nigeria / Benin',
    note: 'Nago/Nagô in Brazil and Lucumí in Cuba are Yoruba-linked ethnonyms.'
  },
  {
    id: 'fon',
    label: 'Fon / Dahomey (Arada)',
    aliases: ['Fon','Dahomey','Arada','Allada'],
    region: 'Benin — Bight of Benin',
    modern: 'Benin',
    note: 'Frequent in Haitian and Brazilian records tied to the Dahomey kingdom.'
  },
  {
    id: 'mandinka',
    label: 'Mandinka (Mandingo / Malinke)',
    aliases: ['Mandinka','Mandingo','Malinke','Mande'],
    region: 'Senegambia / Upper Guinea',
    modern: 'Senegal / Gambia / Guinea / Mali',
    note: 'Often tied to Senegambia embarkation in the 18th century.'
  },
  {
    id: 'wolof',
    label: 'Wolof (Jolof)',
    aliases: ['Wolof','Jolof','Joloff'],
    region: 'Senegal',
    modern: 'Senegal',
    note: 'Senegambia coast; appears in some colonial inventories and runaway ads.'
  },
  {
    id: 'kongo',
    label: 'Kongo / Congo',
    aliases: ['Kongo','Congo','Congoese','Angola'],
    region: 'West Central Africa (Congo / Angola)',
    modern: 'DRC / Congo / Angola',
    note: '"Congo" and "Angola" in American records often mean the West Central African trade, not a precise modern border.'
  },
  {
    id: 'mina',
    label: 'Mina',
    aliases: ['Mina','Elmina'],
    region: 'Gold Coast (often via Elmina) — sometimes broader Bight of Benin',
    modern: 'Ghana / Benin',
    note: 'In Brazilian and Spanish records, "Mina" is a trade label more than a single ethnicity — still a useful coast clue.'
  },
  {
    id: 'fulani',
    label: 'Fulani (Fula / Peul)',
    aliases: ['Fulani','Fula','Peul','Fulbe'],
    region: 'West African Sahel (Senegambia to Nigeria)',
    modern: 'Senegal / Guinea / Nigeria / Mali',
    note: 'Less common as a U.S. ethnonym; more often inferred via DNA or Islamic naming patterns.'
  },
  {
    id: 'grebo',
    label: 'Grebo / Kru',
    aliases: ['Grebo','Kru','Kroo'],
    region: 'Liberia / Côte d\'Ivoire coast',
    modern: 'Liberia / Côte d\'Ivoire',
    note: 'Sometimes named in ship and colonial records along the Windward Coast.'
  }
];

const EMBARKATION_COASTS = [
  'Senegambia',
  'Sierra Leone',
  'Windward Coast',
  'Gold Coast',
  'Bight of Benin',
  'Bight of Biafra',
  'West Central Africa',
  'Southeast Africa',
  'Other / unknown'
];

const DISEMBARK_PORTS = [
  // U.S.
  'Charleston', 'Savannah', 'New Orleans', 'Chesapeake (VA/MD)', 'New York', 'Other U.S.',
  // Caribbean
  'Kingston (Jamaica)', 'Bridgetown (Barbados)', 'Cap-Français / Cap-Haïtien', 'Havana',
  'Port of Spain', 'Antigua', 'Other Caribbean',
  // South America
  'Bahia (Brazil)', 'Rio de Janeiro', 'Recife', 'Other Brazil', 'Other South America',
  'Unknown'
];

function emptyDna(){
  return {
    company: '',
    ethnicityNotes: '',
    hypothesizedRegion: '',
    keyMatches: '',
    sharedSegments: '',
    testedYear: ''
  };
}
function emptyAfrica(){
  return {
    africanBornMention: false,
    africanGivenName: '',
    ethnonymId: '',
    embarkationCoast: '',
    embarkationDecade: '',
    disembarkationPort: '',
    shipName: '',
    oralTradition: '',
    regionClaim: '',
    regionConfidence: 'speculative'
  };
}
function ensurePersonAfrica(person){
  if(!person.dna) person.dna = emptyDna();
  if(!person.africa) person.africa = emptyAfrica();
  // fill any missing keys from older saves
  const d = emptyDna();
  Object.keys(d).forEach(k=>{ if(person.dna[k] === undefined) person.dna[k] = d[k]; });
  const a = emptyAfrica();
  Object.keys(a).forEach(k=>{ if(person.africa[k] === undefined) person.africa[k] = a[k]; });
  return person;
}

function ethnonymById(id){
  return ETHNONYMS.find(e => e.id === id) || null;
}
function ethnonymOptionsHtml(selected){
  return '<option value="">— Select if a record names one —</option>' +
    ETHNONYMS.map(e =>
      `<option value="${_aEsc(e.id)}" ${e.id===selected?'selected':''}>${_aEsc(e.label)}</option>`
    ).join('');
}
function ethnonymGlossaryHtml(){
  return `<div class="ethnonym-list">${ETHNONYMS.map(e => `
    <div class="ethnonym-card">
      <div class="ethnonym-name">${_aEsc(e.label)}</div>
      <div class="ethnonym-region">${_aEsc(e.region)} → ${_aEsc(e.modern)}</div>
      <div class="ethnonym-note">${_aEsc(e.note)}</div>
    </div>
  `).join('')}</div>`;
}

function confidenceOptionsHtml(selected){
  return Object.keys(CONFIDENCE_LEVELS).map(k =>
    `<option value="${k}" ${k===(selected||'speculative')?'selected':''}>${_aEsc(CONFIDENCE_LEVELS[k].label)}</option>`
  ).join('');
}
function confidenceChip(level){
  const c = CONFIDENCE_LEVELS[level] || CONFIDENCE_LEVELS.speculative;
  return `<span class="confidence-chip conf-${_aEsc(level||'speculative')}" title="${_aEsc(c.note)}">${_aEsc(c.short)}</span>`;
}

// Slave Voyages doesn't expose a stable public query-string API for every
 // filter, so we deep-link the databases and put the researcher's known
// facts in the URL hash / notes for copy-paste into their UI.
function slaveVoyagesDatabaseUrl(opts){
  opts = opts || {};
  const bits = [];
  if(opts.embarkationCoast) bits.push('embark:' + opts.embarkationCoast);
  if(opts.disembarkationPort) bits.push('land:' + opts.disembarkationPort);
  if(opts.embarkationDecade) bits.push('decade:' + opts.embarkationDecade);
  if(opts.shipName) bits.push('ship:' + opts.shipName);
  const base = 'https://www.slavevoyages.org/voyage/database';
  return bits.length ? base + '#' + encodeURIComponent(bits.join('|')) : base;
}
function africanOriginsUrl(africanGivenName){
  const base = 'https://www.slavevoyages.org/resources/african-origins';
  if(africanGivenName && String(africanGivenName).trim()){
    return base + '#q=' + encodeURIComponent(String(africanGivenName).trim());
  }
  return base;
}
function africaRegionSearchCtx(person){
  ensurePersonAfrica(person);
  const eth = ethnonymById(person.africa.ethnonymId);
  const region = person.africa.regionClaim || person.dna.hypothesizedRegion || (eth && eth.modern) || '';
  return {
    givenName: person.africa.africanGivenName || '',
    surname: '',
    state: region.includes('Nigeria') ? 'Nigeria'
      : region.includes('Ghana') ? 'Ghana'
      : region.includes('Senegal') ? 'Senegal'
      : region.includes('Angola') || region.includes('Congo') ? 'Angola'
      : region.includes('Benin') ? 'Benin'
      : 'West Africa (general)',
    county: '',
    city: '',
    enslaver: '',
    variants: []
  };
}

function africaSummaryLine(person){
  if(!person || !person.africa) return '';
  ensurePersonAfrica(person);
  const eth = ethnonymById(person.africa.ethnonymId);
  const region = person.africa.regionClaim || person.dna.hypothesizedRegion || (eth && eth.region) || '';
  if(!region && !person.africa.africanGivenName && !person.dna.company) return '';
  return region || (person.africa.africanGivenName ? 'African name: ' + person.africa.africanGivenName : 'DNA on file');
}

// ---------- DNA match CSV import (Phase H) ----------
// Minimal columns: name, company, ethnicity notes (optional shared cM / note).
// Never auto-sets regionConfidence to confirmed/documentary.

function dnaCsvSplitLine(line){
  const out = [];
  let cur = '';
  let inQ = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i + 1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if(ch === ',' && !inQ){ out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => String(s || '').trim());
}

function dnaCsvHeaderKey(h){
  const s = String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if(s === 'name' || s === 'match' || s === 'matchname' || s === 'tester') return 'name';
  if(s === 'company' || s === 'testingcompany' || s === 'site') return 'company';
  if(s === 'ethnicity' || s === 'ethnicitynotes' || s === 'notes' || s === 'ethnicitynote') return 'ethnicityNotes';
  if(s === 'sharedcm' || s === 'cm' || s === 'centimorgans' || s === 'shared') return 'sharedCm';
  if(s === 'note' || s === 'connection' || s === 'hint') return 'note';
  return '';
}

/**
 * @returns {{ rows: Array<{name:string,company:string,ethnicityNotes:string,sharedCm:string,note:string}>, warnings: number }}
 */
function parseDnaMatchCsv(text){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let warnings = 0;
  if(!lines.length) return { rows: [], warnings: 0 };

  let headers = dnaCsvSplitLine(lines[0]).map(dnaCsvHeaderKey);
  let start = 1;
  const hasHeader = headers.some(Boolean) && headers.indexOf('name') >= 0;
  if(!hasHeader){
    // Assume name, company, ethnicity notes
    headers = ['name', 'company', 'ethnicityNotes'];
    start = 0;
  }

  const rows = [];
  for(let i = start; i < lines.length; i++){
    const cols = dnaCsvSplitLine(lines[i]);
    if(!cols.some(c => c)) continue;
    const row = { name: '', company: '', ethnicityNotes: '', sharedCm: '', note: '' };
    headers.forEach((key, idx) => {
      if(!key) return;
      row[key] = cols[idx] || '';
    });
    // Positional fallback if no name mapped
    if(!row.name && cols[0]) row.name = cols[0];
    if(!row.name){ warnings++; continue; }
    rows.push(row);
  }
  return { rows, warnings };
}

function formatDnaMatchRows(rows){
  return (rows || []).map(r => {
    const bits = [r.name];
    if(r.sharedCm) bits.push(String(r.sharedCm).replace(/\s*cM$/i, '') + ' cM');
    if(r.company) bits.push(r.company);
    if(r.ethnicityNotes) bits.push(r.ethnicityNotes);
    if(r.note) bits.push(r.note);
    return bits.filter(Boolean).join(' — ');
  }).join('\n');
}

/**
 * Import CSV into person.dna.keyMatches. Never upgrades regionConfidence.
 * @returns {{ count: number, warnings: number, keyMatches: string }}
 */
function importDnaMatchesCsv(personId, text, opts){
  opts = opts || {};
  const person = STATE.people.find(p => p.id === personId);
  if(!person) throw new Error('Person not found');
  ensurePersonAfrica(person);
  const parsed = parseDnaMatchCsv(text);
  if(!parsed.rows.length) throw new Error('No match rows found — need a name column (or name,company,notes lines)');
  const block = formatDnaMatchRows(parsed.rows);
  if(opts.replace) person.dna.keyMatches = block;
  else {
    person.dna.keyMatches = [person.dna.keyMatches, block].filter(Boolean).join('\n\n');
  }
  const companies = [];
  parsed.rows.forEach(r => { if(r.company && companies.indexOf(r.company) < 0) companies.push(r.company); });
  if(!person.dna.company && companies.length === 1) person.dna.company = companies[0];
  // Ethnicity notes: only fill if empty and a single row carries notes
  if(!person.dna.ethnicityNotes){
    const eth = parsed.rows.map(r => r.ethnicityNotes).filter(Boolean);
    if(eth.length === 1) person.dna.ethnicityNotes = eth[0];
  }
  // Trust rule: CSV import never confirms an Africa region
  if(person.africa && typeof trustClampConfidence === 'function'){
    person.africa.regionConfidence = trustClampConfidence(person.africa.regionConfidence || 'speculative');
  }
  person.updatedAt = Date.now();
  if(typeof saveData === 'function') saveData();
  return { count: parsed.rows.length, warnings: parsed.warnings, keyMatches: person.dna.keyMatches };
}

function openDnaWorkspace(personId){
  if(!personId) return;
  if(typeof openPersonForm === 'function') openPersonForm(personId);
  setTimeout(function(){
    if(typeof setFormSection === 'function') setFormSection('dnaSection', true);
    const ta = document.getElementById('pDnaMatches');
    if(ta && ta.focus) ta.focus();
  }, 40);
}

function applyDnaCsvFile(personId, file){
  if(!file) return;
  const reader = file.text ? file.text() : Promise.reject(new Error('Cannot read file'));
  reader.then(function(text){
    if(!String(text || '').trim()){
      if(typeof showToast === 'function') showToast('CSV is empty');
      return;
    }
    try{
      const result = importDnaMatchesCsv(personId, text, { replace: false });
      const matchesEl = document.getElementById('pDnaMatches');
      if(matchesEl) matchesEl.value = result.keyMatches;
      const companyEl = document.getElementById('pDnaCompany');
      const person = STATE.people.find(p => p.id === personId);
      if(companyEl && person && person.dna.company && !companyEl.value) companyEl.value = person.dna.company;
      if(typeof showToast === 'function'){
        showToast('Imported ' + result.count + ' DNA match'
          + (result.count === 1 ? '' : 'es')
          + (result.warnings ? (' (' + result.warnings + ' skipped)') : ''));
      }
      if(typeof renderPlanView === 'function' && typeof activePlanPersonId !== 'undefined' && activePlanPersonId === personId){
        renderPlanView();
      }
    }catch(err){
      if(typeof showToast === 'function') showToast(err.message || 'DNA CSV import failed');
      else alert(err.message || 'DNA CSV import failed');
    }
  }).catch(function(err){
    if(typeof showToast === 'function') showToast(err.message || 'Could not read CSV');
  });
}

function initDnaCsvImport(){
  const input = document.getElementById('dnaMatchFile');
  if(!input || input._dnaBound) return;
  input._dnaBound = true;
  input.addEventListener('change', function(e){
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!file) return;
    const personId = (document.getElementById('pId') && document.getElementById('pId').value)
      || (typeof activePlanPersonId !== 'undefined' ? activePlanPersonId : '');
    if(!personId){
      if(typeof showToast === 'function') showToast('Open a person first');
      return;
    }
    applyDnaCsvFile(personId, file);
  });
}

if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initDnaCsvImport);
  } else {
    setTimeout(initDnaCsvImport, 0);
  }
}
