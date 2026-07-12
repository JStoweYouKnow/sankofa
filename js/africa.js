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
