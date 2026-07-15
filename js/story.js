// ---------------------------------------------------------------
 // Story intake (Phase 2, rule-based)
 // Free-text oral history → draft people (name, years, place,
 // variants, enslaver hint). User reviews before anything is saved.
 // No LLM — same interface can wrap a model later.
 // ---------------------------------------------------------------

let STORY_DRAFTS = [];
let STORY_RAW = '';
let STORY_PLACE = { state: '', county: '', city: '', raw: '' };

const STORY_NAME_STOP = new Set([
  'my','our','the','a','an','and','or','of','in','on','at','to','from','near','about','around',
  'born','died','lived','came','went','was','were','had','have','has','said','says','called',
  'known','also','aka','family','place','plantation','county','parish','state','south','north',
  'east','west','river','creek','after','before','during','when','where','who','whom','which',
  'enslaved','slave','slavery','freedom','freedman','bureau','census','record','records',
  'mother','father','grandmother','grandfather','grandma','grandpa','aunt','uncle','cousin',
  'sister','brother','son','daughter','wife','husband','parents','children','child','baby',
  'african','africa','america','american','carolina','virginia','georgia','alabama','texas',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'january','february','march','april','may','july','august','september',
  'october','november','december'
  // note: "june" intentionally omitted — common given name
]);

const STORY_KINSHIP = [
  'great-great-grandmother','great-great-grandfather',
  'great grandmother','great grandfather','great-grandmother','great-grandfather',
  'grandmother','grandfather','grandma','grandpa','nana','papa',
  'mother','father','mom','dad','mama',
  'aunt','uncle','cousin','sister','brother'
];

function storyTitleCaseWord(w){
  if(!w) return '';
  if(w.length <= 2 && w === w.toUpperCase()) return w; // Jr, II kept as typed later
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function storyCleanName(raw){
  if(!raw) return '';
  let s = String(raw).replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;:!?]+$/g, '').trim();
  s = s.replace(/\b(who|that|and|from|in|near|on|of)\b.*$/i, '').trim();
  const parts = s.split(/\s+/).filter(Boolean);
  const kept = [];
  for(const p of parts){
    // Require real capitalization so case-insensitive regex matches
    // ("was born") never become part of a name.
    if(!/^[A-Z]/.test(p) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(p)) break;
    const low = p.toLowerCase().replace(/[^a-z]/g, '');
    if(STORY_NAME_STOP.has(low)) break;
    if(/^(jr|sr|ii|iii|iv)\.?$/i.test(p)){ kept.push(p.replace(/\./g, '')); continue; }
    if(!/^[A-Za-z][A-Za-z'\-]*$/.test(p)) break;
    kept.push(storyTitleCaseWord(p));
    if(kept.length >= 4) break;
  }
  const name = kept.join(' ').trim();
  if(name.length < 2) return '';
  if(STORY_NAME_STOP.has(name.toLowerCase())) return '';
  return name;
}

function storyNameKey(name){
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function storyFindStateInText(text){
  const t = String(text || '');
  // Abbreviation after comma or as standalone token
  const abbr = t.match(/,\s*([A-Z]{2})\b/);
  if(abbr && US_STATE_ABBR[abbr[1]]) return US_STATE_ABBR[abbr[1]];
  for(const st of US_STATES){
    const re = new RegExp('\\b' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if(re.test(t)) return st;
  }
  return '';
}

function storyExtractPlace(text){
  const out = { state: '', county: '', city: '', raw: '' };
  const t = String(text || '');

  const countyM = t.match(/\b([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s+(County|Parish)\b/);
  if(countyM) out.county = countyM[1];

  out.state = storyFindStateInText(t);

  // "in/from/near X" — prefer phrases that parsePlace understands
  const placeHints = [];
  const hintRe = /\b(?:in|from|near|around|at)\s+([A-Z][^.;\n]{2,60})/g;
  let hm;
  while((hm = hintRe.exec(t))){
    placeHints.push(hm[1].replace(/\s+(who|where|when|and|after|before)\b.*$/i, '').trim());
  }
  for(const hint of placeHints){
    const parsed = parsePlace(hint);
    if(parsed.state && !out.state) out.state = parsed.state;
    if(parsed.county && !out.county) out.county = parsed.county;
    if(parsed.city && !out.city) out.city = parsed.city;
    if(!out.raw && (parsed.state || parsed.county || parsed.city)) out.raw = hint.split(/[.]/)[0].trim();
  }

  if(!out.raw){
    const bits = [out.city, out.county ? out.county + ' County' : '', out.state].filter(Boolean);
    out.raw = bits.join(', ');
  }
  return out;
}

function storyExtractYears(segment){
  const birth = { year: '', approx: false };
  const death = { year: '', approx: false };
  const s = String(segment || '');

  const birthRe = /\b(?:born|b\.?)\s*(?:in|around|about|circa|c\.?)?\s*(c\.?\s*)?((?:1[7-9]|20)\d{2})s?\b/i;
  const deathRe = /\b(?:died|d\.?|passed)\s*(?:in|around|about|circa|c\.?)?\s*(c\.?\s*)?((?:1[7-9]|20)\d{2})s?\b/i;
  const bm = s.match(birthRe);
  if(bm){
    birth.year = bm[2];
    birth.approx = !!(bm[1] || /around|about|circa|c\./i.test(bm[0]) || /s\b/.test(bm[0]));
  }
  const dm = s.match(deathRe);
  if(dm){
    death.year = dm[2];
    death.approx = !!(dm[1] || /around|about|circa|c\./i.test(dm[0]) || /s\b/.test(dm[0]));
  }

  // "b. c. 1832" style
  if(!birth.year){
    const c = s.match(/\b(?:b\.?\s*)?c\.?\s*((?:1[7-9]|20)\d{2})\b/i);
    if(c && /born|b\.|birth/i.test(s.slice(Math.max(0, (c.index||0) - 20), (c.index||0) + 20))){
      birth.year = c[1];
      birth.approx = true;
    }
  }
  return { birth, death };
}

function storyFormatYear(y){
  if(!y || !y.year) return '';
  return y.approx ? ('c. ' + y.year) : y.year;
}

function storyExtractEnslaver(text){
  const t = String(text || '');
  const patterns = [
    /\b(?:enslaved|owned|held)\s+by\s+(?:the\s+)?([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})(?:\s+family)?/i,
    /\bbelonged\s+to\s+(?:the\s+)?([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})(?:\s+family)?/i,
    /\b(?:worked|lived)\s+on\s+the\s+([A-Z][a-zA-Z'\-]+)(?:\s+place|\s+plantation)?/i,
    /\b(?:master|mistress|enslaver)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)/i,
    /\bon\s+the\s+([A-Z][a-zA-Z'\-]+)\s+(?:place|plantation)\b/i
  ];
  for(const re of patterns){
    const m = t.match(re);
    if(!m) continue;
    const name = storyCleanName(m[1]);
    if(!name) continue;
    // Prefer surname alone for the person field
    const parts = name.split(/\s+/);
    return parts[parts.length - 1];
  }
  return '';
}

function storyExtractVariants(segment, primaryName){
  const vars = [];
  const s = String(segment || '');
  const patterns = [
    /\balso\s+(?:known\s+as|called|spelled)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/gi,
    /\baka\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/gi,
    /\bspelled\s+(?:as\s+)?([A-Z][a-zA-Z'\-]+)/gi
  ];
  patterns.forEach(re=>{
    let m;
    while((m = re.exec(s))){
      const v = storyCleanName(m[1]);
      if(v && storyNameKey(v) !== storyNameKey(primaryName)) vars.push(v);
    }
  });
  return [...new Set(vars)];
}

function storyUpsertPerson(map, draft){
  const key = storyNameKey(draft.name);
  if(!key) return;
  const existing = map.get(key);
  if(!existing){
    map.set(key, draft);
    return;
  }
  if(!existing.birthYear && draft.birthYear) existing.birthYear = draft.birthYear;
  if(!existing.deathYear && draft.deathYear) existing.deathYear = draft.deathYear;
  if(!existing.birthplace && draft.birthplace) existing.birthplace = draft.birthplace;
  if(!existing.enslaverSurname && draft.enslaverSurname) existing.enslaverSurname = draft.enslaverSurname;
  if(draft.kinship && !existing.kinship) existing.kinship = draft.kinship;
  (draft.nameVariants || []).forEach(v=>{
    if(!existing.nameVariants.includes(v)) existing.nameVariants.push(v);
  });
  if(draft.note && !(existing.note || '').includes(draft.note)){
    existing.note = [existing.note, draft.note].filter(Boolean).join(' ');
  }
}

/**
 * Parse free-text oral history into draft people + shared place.
 * @returns {{ people: Array, place: object, warnings: string[] }}
 */
function parseStory(text){
  const raw = String(text || '').trim();
  const warnings = [];
  const place = storyExtractPlace(raw);
  const globalEnslaver = storyExtractEnslaver(raw);
  const map = new Map();

  if(!raw){
    return { people: [], place, warnings: ['Paste or type a family story first.'] };
  }

  // 1) Kinship + name: "my great-grandmother Hattie Freeman"
  const kinAlt = STORY_KINSHIP.slice().sort((a,b)=>b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+'))
    .join('|');
  const kinRe = new RegExp(
    '(?:my|our)\\s+(' + kinAlt + ')\\s+([A-Z][a-zA-Z\\\'\\-]+(?:\\s+[A-Z][a-zA-Z\\\'\\-]+){0,3})',
    'gi'
  );
  let m;
  while((m = kinRe.exec(raw))){
    const kinship = m[1].toLowerCase().replace(/\s+/g, '-');
    const name = storyCleanName(m[2]);
    if(!name) continue;
    // Stay inside this sentence so later "also called" clauses don't leak.
    const stopAt = raw.indexOf('.', m.index);
    const window = raw.slice(m.index, stopAt === -1 ? Math.min(raw.length, m.index + 160) : stopAt + 1);
    const years = storyExtractYears(window);
    const localPlace = storyExtractPlace(window);
    const birthplace = localPlace.raw || place.raw || '';
    storyUpsertPerson(map, {
      name,
      kinship,
      birthYear: storyFormatYear(years.birth),
      deathYear: storyFormatYear(years.death),
      birthplace,
      enslaverSurname: storyExtractEnslaver(window) || globalEnslaver || '',
      nameVariants: [],
      note: 'From oral history (' + kinship.replace(/-/g, ' ') + ').',
      include: true
    });
  }

  // 2) "named X" / "name was X"
  const namedRe = /\b(?:named|name was)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,3})/gi;
  while((m = namedRe.exec(raw))){
    const name = storyCleanName(m[1]);
    if(!name) continue;
    const window = raw.slice(Math.max(0, m.index - 60), Math.min(raw.length, m.index + m[0].length + 100));
    const years = storyExtractYears(window);
    const localPlace = storyExtractPlace(window);
    storyUpsertPerson(map, {
      name,
      kinship: '',
      birthYear: storyFormatYear(years.birth),
      deathYear: storyFormatYear(years.death),
      birthplace: localPlace.raw || place.raw || '',
      enslaverSurname: storyExtractEnslaver(window) || globalEnslaver || '',
      nameVariants: storyExtractVariants(window, name),
      note: 'From oral history.',
      include: true
    });
  }

  // 2b) "Silas was also called Silas Rhyne" → variant on Silas, not a new person
  // No `i` flag: [A-Z] must be a real capital so "said Silas" is not captured.
  const alsoCalledRe = /\b([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s+was\s+also\s+(?:called|known as)\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+){0,2})/g;
  while((m = alsoCalledRe.exec(raw))){
    const primary = storyCleanName(m[1]);
    const variant = storyCleanName(m[2]);
    if(!primary || !variant || storyNameKey(primary) === storyNameKey(variant)) continue;
    storyUpsertPerson(map, {
      name: primary,
      kinship: '',
      birthYear: '',
      deathYear: '',
      birthplace: place.raw || '',
      enslaverSurname: globalEnslaver || '',
      nameVariants: [variant],
      note: 'From oral history.',
      include: true
    });
  }

  // 3) "X was my grandmother"
  const wasKinRe = new RegExp(
    '([A-Z][a-zA-Z\\\'\\-]+(?:\\s+[A-Z][a-zA-Z\\\'\\-]+){0,3})\\s+was\\s+(?:my|our)\\s+(' + kinAlt + ')',
    'gi'
  );
  while((m = wasKinRe.exec(raw))){
    const name = storyCleanName(m[1]);
    if(!name) continue;
    storyUpsertPerson(map, {
      name,
      kinship: m[2].toLowerCase().replace(/\s+/g, '-'),
      birthYear: '',
      deathYear: '',
      birthplace: place.raw || '',
      enslaverSurname: globalEnslaver || '',
      nameVariants: [],
      note: 'From oral history (' + m[2].toLowerCase() + ').',
      include: true
    });
  }

  // 4) "parents Silas and Chaney" / "mother Chaney and father Silas"
  const parentsRe = /\bparents?\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s+and\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)/gi;
  while((m = parentsRe.exec(raw))){
    [m[1], m[2]].forEach(chunk=>{
      const name = storyCleanName(chunk);
      if(!name) return;
      storyUpsertPerson(map, {
        name,
        kinship: 'parent',
        birthYear: '',
        deathYear: '',
        birthplace: place.raw || '',
        enslaverSurname: globalEnslaver || '',
        nameVariants: [],
        note: 'From oral history (named as a parent).',
        include: true
      });
    });
  }

  // 5) Fallback: first plausible Full Name near a birth year if still empty
  if(map.size === 0){
    const yearNear = raw.match(/\b(?:born|b\.?|c\.?)\s*(?:in|around|about)?\s*c?\.?\s*((?:1[7-9]|20)\d{2})/i);
    const nameNear = raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/);
    if(nameNear){
      const name = storyCleanName(nameNear[1]);
      if(name){
        storyUpsertPerson(map, {
          name,
          kinship: '',
          birthYear: yearNear ? ('c. ' + yearNear[1]) : '',
          deathYear: '',
          birthplace: place.raw || '',
          enslaverSurname: globalEnslaver || '',
          nameVariants: storyExtractVariants(raw, name),
          note: 'From oral history (best guess — please edit).',
          include: true
        });
        warnings.push('Could only guess one name — edit the draft before saving.');
      }
    }
  }

  if(map.size === 0){
    warnings.push('No names found. Try phrasing like “my grandmother Hattie Freeman was born around 1867 in Gaston County, NC.”');
  }

  // Apply shared place defaults; enslaver only on likely pre-1870 people
  const people = [...map.values()].map(p=>{
    if(!p.enslaverSurname && globalEnslaver){
      const y = parseInt(String(p.birthYear || '').replace(/\D/g, ''), 10);
      const earlyKin = /great|grand|parent|nana|papa/.test(p.kinship || '');
      if(earlyKin || (y && y < 1866)) p.enslaverSurname = globalEnslaver;
    }
    if(!p.birthplace && place.raw) p.birthplace = place.raw;
    p.id = 'draft-' + Math.random().toString(36).slice(2, 9);
    return p;
  });

  // Prefer earlier generations first (great-* before parent)
  const kinRank = k => {
    if(!k) return 50;
    if(/great.*great/.test(k)) return 0;
    if(/great/.test(k)) return 1;
    if(/grand|nana|papa/.test(k)) return 2;
    if(/mother|father|mom|dad|mama/.test(k)) return 3;
    return 40;
  };
  people.sort((a, b) => kinRank(a.kinship) - kinRank(b.kinship) || a.name.localeCompare(b.name));

  return { people, place, warnings };
}

const STORY_EXAMPLES = [
  'My great-grandmother Hattie Freeman was born around 1867 in Gaston County, NC. Her parents Silas and Chaney lived on the Rhyne place near the South Fork. Family said Silas was also called Silas Rhyne.',
  'My grandmother\'s people came from Jamaica — St. Catherine parish. Oral history says her grandfather Samuel Clarke was born enslaved on a sugar estate around 1820, and the planter\'s name may have been Hibbert.',
  'We only know the surname Stowe and that the family was in South Carolina after the war. Someone said "old man Stowe" owned land in the next county. No first names before my grandfather James Stowe, born about 1888.'
];

document.addEventListener('click', function(e){
  const ex = e.target.closest('[data-story-ex]');
  if(!ex) return;
  const i = Number(ex.dataset.storyEx);
  const ta = document.getElementById('storyText');
  if(ta && STORY_EXAMPLES[i]){
    ta.value = STORY_EXAMPLES[i];
    ta.focus();
  }
});

// ---------- UI ----------

function openStoryIntake(){
  if(typeof refreshStoryLlmBtn === 'function') refreshStoryLlmBtn();
  STORY_DRAFTS = [];
  STORY_RAW = '';
  STORY_PLACE = { state: '', county: '', city: '', raw: '' };
  const ta = document.getElementById('storyText');
  if(ta) ta.value = '';
  document.getElementById('storyReview').innerHTML = '';
  document.getElementById('storyWarnings').innerHTML = '';
  document.getElementById('storyApplyBtn').disabled = true;
  document.getElementById('storyOverlay').classList.add('open');
  if(ta) setTimeout(()=>ta.focus(), 50);
}

function runStoryParse(){
  const text = (document.getElementById('storyText').value || '').trim();
  STORY_RAW = text;
  const result = parseStory(text);
  STORY_DRAFTS = result.people;
  STORY_PLACE = result.place;
  const warnEl = document.getElementById('storyWarnings');
  warnEl.innerHTML = result.warnings.map(w => `<div class="story-warn">${esc(w)}</div>`).join('');
  renderStoryReview();
  document.getElementById('storyApplyBtn').disabled = STORY_DRAFTS.filter(d=>d.include).length === 0;
}

function renderStoryReview(){
  const el = document.getElementById('storyReview');
  if(!el) return;
  if(!STORY_DRAFTS.length){
    el.innerHTML = `<div class="field-hint">Nothing to review yet — paste a story and click “Read my story.”</div>`;
    return;
  }
  const placeLine = STORY_PLACE.raw
    ? `<div class="story-place">Shared place hint: <strong>${esc(STORY_PLACE.raw)}</strong>${STORY_PLACE.state ? ' → plan state <strong>' + esc(STORY_PLACE.state) + '</strong>' : ''}${STORY_PLACE.county ? ', county <strong>' + esc(STORY_PLACE.county) + '</strong>' : ''}</div>`
    : '';
  const cards = STORY_DRAFTS.map((d, i)=>`
    <div class="story-draft ${d.include?'':'skipped'}">
      <label class="story-draft-include">
        <input type="checkbox" ${d.include?'checked':''} onchange="storyToggleDraft(${i}, this.checked)">
        Add to tree
      </label>
      <div class="story-draft-grid">
        <div class="field">
          <label>Name</label>
          <input type="text" value="${esc(d.name)}" onchange="storyEditDraft(${i}, 'name', this.value)">
        </div>
        <div class="field">
          <label>Kinship (from story)</label>
          <input type="text" value="${esc((d.kinship||'').replace(/-/g,' '))}" onchange="storyEditDraft(${i}, 'kinship', this.value)" placeholder="optional">
        </div>
        <div class="field">
          <label>Birth year</label>
          <input type="text" value="${esc(d.birthYear||'')}" onchange="storyEditDraft(${i}, 'birthYear', this.value)" placeholder="e.g. c. 1832">
        </div>
        <div class="field">
          <label>Death year</label>
          <input type="text" value="${esc(d.deathYear||'')}" onchange="storyEditDraft(${i}, 'deathYear', this.value)">
        </div>
        <div class="field full">
          <label>Birthplace</label>
          <input type="text" value="${esc(d.birthplace||'')}" onchange="storyEditDraft(${i}, 'birthplace', this.value)" placeholder="County, State">
        </div>
        <div class="field">
          <label>Name variants</label>
          <input type="text" value="${esc((d.nameVariants||[]).join(', '))}" onchange="storyEditDraft(${i}, 'nameVariants', this.value)" placeholder="comma-separated">
        </div>
        <div class="field">
          <label>Enslaver surname</label>
          <input type="text" value="${esc(d.enslaverSurname||'')}" onchange="storyEditDraft(${i}, 'enslaverSurname', this.value)">
        </div>
        <div class="field full">
          <label>Notes</label>
          <textarea rows="2" onchange="storyEditDraft(${i}, 'note', this.value)">${esc(d.note||'')}</textarea>
        </div>
      </div>
    </div>
  `).join('');
  el.innerHTML = placeLine + `<div class="story-drafts">${cards}</div>
    <div class="field-hint">Nothing is saved until you confirm. The coach will pick up from the earliest person you add.</div>`;
}

function storyToggleDraft(i, on){
  if(!STORY_DRAFTS[i]) return;
  STORY_DRAFTS[i].include = !!on;
  document.getElementById('storyApplyBtn').disabled = STORY_DRAFTS.filter(d=>d.include).length === 0;
  const card = document.querySelectorAll('.story-draft')[i];
  if(card) card.classList.toggle('skipped', !on);
}

function storyEditDraft(i, field, value){
  const d = STORY_DRAFTS[i];
  if(!d) return;
  if(field === 'nameVariants'){
    d.nameVariants = String(value).split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  } else if(field === 'kinship'){
    d.kinship = String(value).trim().toLowerCase().replace(/\s+/g, '-');
  } else {
    d[field] = String(value).trim();
  }
  if(field === 'name'){
    document.getElementById('storyApplyBtn').disabled = STORY_DRAFTS.filter(x=>x.include && x.name).length === 0;
  }
}

function storyBlankPerson(overrides){
  const p = {
    id: uid(),
    name: '',
    nameVariants: [],
    birthYear: '',
    deathYear: '',
    birthplace: '',
    enslaverSurname: '',
    notes: '',
    parentIds: [],
    spouses: [],
    dna: {
      company: '', testedYear: '', ethnicityNotes: '',
      hypothesizedRegion: '', keyMatches: '', sharedSegments: ''
    },
    africa: {
      africanBornMention: false, africanGivenName: '', ethnonymId: '',
      embarkationCoast: '', embarkationDecade: '', disembarkationPort: '',
      shipName: '', oralTradition: '', regionClaim: '', regionConfidence: 'speculative'
    },
    updatedAt: Date.now()
  };
  Object.assign(p, overrides);
  if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(p);
  return p;
}

function applyStoryDrafts(){
  const selected = STORY_DRAFTS.filter(d => d.include && (d.name || '').trim());
  if(!selected.length){
    showToast('Select at least one person to add');
    return;
  }

  const created = [];
  selected.forEach(d=>{
    const oralBit = STORY_RAW
      ? ('Oral history:\n' + STORY_RAW.slice(0, 1200) + (STORY_RAW.length > 1200 ? '…' : ''))
      : '';
    const notes = [d.note, oralBit].filter(Boolean).join('\n\n');
    const person = storyBlankPerson({
      name: d.name.trim(),
      nameVariants: d.nameVariants || [],
      birthYear: d.birthYear || '',
      deathYear: d.deathYear || '',
      birthplace: d.birthplace || STORY_PLACE.raw || '',
      enslaverSurname: d.enslaverSurname || '',
      notes,
      africa: {
        africanBornMention: false, africanGivenName: '', ethnonymId: '',
        embarkationCoast: '', embarkationDecade: '', disembarkationPort: '',
        shipName: '', oralTradition: STORY_RAW.slice(0, 800),
        regionClaim: '', regionConfidence: 'speculative'
      }
    });
    STATE.people.push(person);
    created.push(person);

    // Start a research plan with place from the story
    if(typeof ensurePlan === 'function'){
      const plan = ensurePlan(person.id);
      const parsed = parsePlace(person.birthplace);
      if(!plan.state) plan.state = STORY_PLACE.state || parsed.state || '';
      if(!plan.county) plan.county = STORY_PLACE.county || parsed.county || '';
      if(person.enslaverSurname && typeof linkPlanCandidate === 'function'){
        linkPlanCandidate(person.id, person.enslaverSurname, { note: 'From oral history', status: 'untested' });
      } else if(person.enslaverSurname && !plan.candidates.some(c =>
        String(c.name).toLowerCase() === person.enslaverSurname.toLowerCase()
      )){
        plan.candidates.push({ name: person.enslaverSurname, status: 'untested', note: 'From oral history' });
      }
      plan.updatedAt = Date.now();
    }
  });

  // Soft parent links: if we have grandparent + parent kinship, leave unlinked
  // (too error-prone). User links on the tree. Spouse pairs with shared surname
  // are also left for the user.

  saveData();
  closeOverlay('storyOverlay');
  renderAll();

  const focus = created[0];
  showToast('Added ' + created.length + ' person' + (created.length === 1 ? '' : 's') + ' from your story');
  if(focus && typeof openPlanForPerson === 'function'){
    setTimeout(()=>openPlanForPerson(focus.id), 200);
  }
}
