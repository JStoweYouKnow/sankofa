// ---------------------------------------------------------------
// Local storage shim
// This project was originally built as a Claude.ai artifact, which
// provides a `window.storage` API for persistence. Outside that
// environment there's no such API, so this shim backs the same
// get/set/delete/list interface with the browser's localStorage.
// Data is per-browser by default. Optional family sync (js/sync.js +
// api/sync.js) pushes the same payload to a shared endpoint — keep
// these get/set call signatures so the rest of the app doesn't care.
// ---------------------------------------------------------------
const storage = {
  async get(key, shared){
    const val = localStorage.getItem(key);
    if(val === null){ throw new Error('Key not found: ' + key); }
    return { key, value: val, shared: !!shared };
  },
  async set(key, value, shared){
    localStorage.setItem(key, value);
    return { key, value, shared: !!shared };
  },
  async delete(key, shared){
    localStorage.removeItem(key);
    return { key, deleted: true, shared: !!shared };
  },
  async list(prefix, shared){
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys, prefix, shared: !!shared };
  }
};

const STORAGE_KEY = 'forebear-genealogy-data-v1';
const KEYS_STORAGE_KEY = 'forebear-api-keys-v1';
const META_KEY = 'forebear-meta-v1';
const SCHEMA_VERSION = 4;
let STATE = { people: [], logs: [], plans: {}, tombstones: [] };
let META = { lastExportAt: 0, lastChangedAt: 0 };
let API_KEYS = { smithsonian: '' };
let editingPersonId = null;
let editingLogId = null;
let pendingImport = null;

const FACT_LABELS = {
  name:'Name', birth:'Birth', death:'Death', parentage:'Parentage',
  relationship:'Relationship', location:'Location', origin:'African origin'
};

// PLACE_GROUPS / US_STATES live in js/sources.js (loaded first).

// ---------- utilities ----------
function uid(){ return 'p' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function esc(str){
  if(str===undefined||str===null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function personName(id){
  const p = STATE.people.find(x=>x.id===id);
  return p ? p.name : 'Unknown';
}
function countSources(personId){
  return STATE.logs.filter(l=>l.personId===personId).length;
}
function showToast(msg){
  const el = document.getElementById('saveStatus');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>el.classList.remove('show'), 1600);
}

// ---------- storage ----------
// v1 payloads were a bare {people, logs}; v2 adds schemaVersion plus
// nameVariants/spouses on people and supports on logs; v3 adds
// per-record updatedAt, deletion tombstones, and research plans;
// v4 adds DNA workspace + Africa bridge fields on people, and
// confidence on log entries.
function migrate(parsed){
  const people = parsed.people || [];
  const logs = parsed.logs || [];
  const plans = parsed.plans || {};
  const tombstones = parsed.tombstones || [];
  const v = parsed.schemaVersion || 1;
  if(v < 2){
    people.forEach(p=>{
      if(!Array.isArray(p.nameVariants)) p.nameVariants = [];
      if(!Array.isArray(p.spouses)) p.spouses = [];
    });
    logs.forEach(l=>{
      if(!Array.isArray(l.supports)) l.supports = [];
    });
  }
  if(v < 3){
    const now = Date.now();
    people.forEach(p=>{ if(!p.updatedAt) p.updatedAt = now; });
    logs.forEach(l=>{ if(!l.updatedAt) l.updatedAt = now; });
  }
  if(v < 4){
    people.forEach(p=>{
      if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(p);
      else{
        if(!p.dna) p.dna = {};
        if(!p.africa) p.africa = {};
      }
    });
    logs.forEach(l=>{
      if(!l.confidence) l.confidence = l.status === 'confirmed' ? 'documentary' : 'speculative';
    });
  }else{
    people.forEach(p=>{ if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(p); });
  }
  return { schemaVersion: SCHEMA_VERSION, people, logs, plans, tombstones };
}

function currentPayload(){
  return {
    schemaVersion: SCHEMA_VERSION,
    people: STATE.people,
    logs: STATE.logs,
    plans: STATE.plans,
    tombstones: STATE.tombstones
  };
}
function setState(payload){
  STATE.people = payload.people;
  STATE.logs = payload.logs;
  STATE.plans = payload.plans || {};
  STATE.tombstones = payload.tombstones || [];
}

// Merge two payloads: per-record newest-updatedAt wins, deletions win
// via tombstones unless the record was edited after the deletion, and
// plans follow their person. Idempotent, order-insensitive on ties.
function mergeStates(a, b){
  const tomb = new Map();
  [...(a.tombstones||[]), ...(b.tombstones||[])].forEach(t=>{
    const prev = tomb.get(t.id);
    if(!prev || t.deletedAt > prev.deletedAt) tomb.set(t.id, t);
  });
  function mergeRecords(x, y){
    const m = new Map();
    [...(x||[]), ...(y||[])].forEach(r=>{
      const prev = m.get(r.id);
      if(!prev || (r.updatedAt||0) > (prev.updatedAt||0)) m.set(r.id, r);
    });
    return Array.from(m.values()).filter(r=>{
      const t = tomb.get(r.id);
      return !t || (r.updatedAt||0) > t.deletedAt;
    });
  }
  const people = mergeRecords(a.people, b.people);
  const logs = mergeRecords(a.logs, b.logs);
  const peopleIds = new Set(people.map(p=>p.id));
  const plans = {};
  new Set([...Object.keys(a.plans||{}), ...Object.keys(b.plans||{})]).forEach(id=>{
    if(!peopleIds.has(id)) return;
    const pa = (a.plans||{})[id], pb = (b.plans||{})[id];
    plans[id] = !pa ? pb : (!pb ? pa : ((pb.updatedAt||0) > (pa.updatedAt||0) ? pb : pa));
  });
  return { schemaVersion: SCHEMA_VERSION, people, logs, plans, tombstones: Array.from(tomb.values()) };
}

async function loadData(){
  let needsResave = false;
  try{
    const res = await storage.get(STORAGE_KEY, false);
    if(res && res.value){
      const parsed = JSON.parse(res.value);
      setState(migrate(parsed));
      needsResave = (parsed.schemaVersion || 1) < SCHEMA_VERSION;
    }
  }catch(e){
    // no saved data yet - start fresh
  }
  renderAll();
  renderBackupStatus();
  if(needsResave) await saveData();
}
async function saveData(triggerSync){
  try{
    await storage.set(STORAGE_KEY, JSON.stringify(currentPayload()), false);
    showToast('Saved');
    META.lastChangedAt = Date.now();
    saveMeta();
    renderBackupStatus();
  }catch(e){
    const isQuota = e && (e.name==='QuotaExceededError' || /quota/i.test(e.message||''));
    if(isQuota){
      // Browser storage is full: warn clearly and trigger an emergency export
      showToast('Browser storage is full — downloading an emergency backup now.');
      console.warn('localStorage quota exceeded — triggering emergency export', e);
      setTimeout(exportJSON, 400);
    }else{
      console.error('save failed', e);
      showToast('Could not save — check that browser storage is enabled.');
    }
  }
  if(triggerSync !== false && typeof scheduleSync === 'function') scheduleSync();
}

async function loadMeta(){
  try{
    const res = await storage.get(META_KEY, false);
    if(res && res.value) META = Object.assign(META, JSON.parse(res.value));
  }catch(e){
    // no meta saved yet
  }
  renderBackupStatus();
}
async function saveMeta(){
  try{
    await storage.set(META_KEY, JSON.stringify(META), false);
  }catch(e){
    console.error('meta save failed', e);
  }
}

function renderBackupStatus(){
  const el = document.getElementById('backupStatus');
  if(!el) return;
  if(STATE.people.length === 0 && STATE.logs.length === 0){
    el.textContent = '';
    el.classList.remove('warn');
    return;
  }
  const THIRTY_DAYS = 30*24*60*60*1000;
  if(!META.lastExportAt){
    el.textContent = 'No backup yet — export one below.';
    el.classList.add('warn');
  }else if(META.lastChangedAt > META.lastExportAt && Date.now() - META.lastExportAt > THIRTY_DAYS){
    el.textContent = 'Last backup was over 30 days ago.';
    el.classList.add('warn');
  }else{
    el.textContent = 'Last backup: ' + new Date(META.lastExportAt).toLocaleDateString();
    el.classList.remove('warn');
  }
}

// ---------- backup: export / import ----------
function todayStr(){ return new Date().toISOString().slice(0,10); }
function downloadFile(name, content, mime){
  const blob = new Blob([content], {type: mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function exportJSON(){
  if(STATE.people.length === 0 && STATE.logs.length === 0){
    showToast('Nothing to export yet');
    return;
  }
  const payload = Object.assign({ exportedAt: new Date().toISOString() }, currentPayload());
  downloadFile('forebear-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json');
  META.lastExportAt = Date.now();
  saveMeta();
  renderBackupStatus();
  showToast('Backup exported');
}

document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed.people) || !Array.isArray(parsed.logs)){
      throw new Error('this is not a Forebear backup (missing people/logs)');
    }
    const migrated = migrate(parsed);
    migrated.people = migrated.people.filter(p=>p && p.id && p.name);
    migrated.logs = migrated.logs.filter(l=>l && l.id);
    pendingImport = migrated;
    document.getElementById('importSummary').textContent =
      '"' + file.name + '" contains ' + migrated.people.length + ' people and ' + migrated.logs.length +
      ' log entries. Merge combines it with what you have (the newest edit of each entry wins); Replace discards your current data first.';
    document.getElementById('importOverlay').classList.add('open');
  }catch(err){
    alert('Could not import this file: ' + (err && err.message));
  }
});

function applyImport(mode){
  if(!pendingImport) return;
  if(mode === 'replace' && (STATE.people.length || STATE.logs.length)){
    if(!confirm('Replace ALL current data with the imported file? This cannot be undone — export a backup first if unsure.')) return;
  }
  if(mode === 'replace'){
    setState(pendingImport);
  }else{
    setState(mergeStates(currentPayload(), pendingImport));
  }
  pendingImport = null;
  closeOverlay('importOverlay');
  renderAll();
  saveData();
  showToast('Imported');
}

// ---------- GEDCOM 5.5.1 export ----------
function gedName(n){
  const parts = String(n||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return 'Unknown //';
  if(parts.length === 1) return parts[0] + ' //';
  const surname = parts.pop();
  return parts.join(' ') + ' /' + surname + '/';
}
function gedDate(s){
  const str = String(s||'').trim();
  const m = str.match(/\d{3,4}/);
  if(!m) return '';
  return (/c\.?\s*\d|abt|about|~|\?/i.test(str) ? 'ABT ' : '') + m[0];
}
// Emit a NOTE at `level`, with newlines as CONT and long lines split by CONC.
function gedNote(lines, level, text){
  const rows = [];
  String(text).split(/\r?\n/).forEach((chunk, i)=>{
    let first = true;
    do{
      rows.push([first ? (i===0 ? 'NOTE' : 'CONT') : 'CONC', chunk.slice(0,200)]);
      chunk = chunk.slice(200);
      first = false;
    }while(chunk.length);
  });
  rows.forEach(([tag, val], idx)=>{
    lines.push((idx===0 ? level : level+1) + ' ' + tag + (val ? ' ' + val : ''));
  });
}
function famKey(ids){ return ids.filter(Boolean).slice().sort().join('|'); }

function exportGEDCOM(){
  if(STATE.people.length === 0){
    showToast('Nothing to export yet');
    return;
  }
  const idFor = new Map();
  STATE.people.forEach((p,i)=>idFor.set(p.id, '@I' + (i+1) + '@'));

  // Family units: one per unique parent pair (GEDCOM caps at two) and per spouse pair.
  const fams = new Map();
  function getFam(ids){
    const key = famKey(ids);
    if(!fams.has(key)) fams.set(key, { partners: ids.filter(Boolean), children: [], notes: [] });
    return fams.get(key);
  }
  STATE.people.forEach(p=>{
    const par = (p.parentIds||[]).filter(id=>idFor.has(id)).slice(0,2);
    if(par.length) getFam(par).children.push(p.id);
    (p.spouses||[]).forEach(s=>{
      if(!idFor.has(s.personId)) return;
      const fam = getFam([p.id, s.personId]);
      if(s.note && !fam.notes.includes(s.note)) fam.notes.push(s.note);
    });
  });
  const famIds = new Map();
  let f = 1;
  fams.forEach((fam, key)=>famIds.set(key, '@F' + (f++) + '@'));

  const lines = [
    '0 HEAD',
    '1 SOUR SANKOFA',
    '2 NAME Forebear',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8'
  ];
  gedNote(lines, 1, 'Exported from Forebear. Sex is not tracked, so partners in family records are assigned to HUSB/WIFE arbitrarily.');

  STATE.people.forEach(p=>{
    lines.push('0 ' + idFor.get(p.id) + ' INDI');
    lines.push('1 NAME ' + gedName(p.name));
    (p.nameVariants||[]).forEach(v=>lines.push('1 NAME ' + gedName(v)));
    lines.push('1 SEX U');
    const b = gedDate(p.birthYear);
    if(b || p.birthplace){
      lines.push('1 BIRT');
      if(b) lines.push('2 DATE ' + b);
      if(p.birthplace) lines.push('2 PLAC ' + p.birthplace);
    }
    const d = gedDate(p.deathYear);
    if(d){
      lines.push('1 DEAT');
      lines.push('2 DATE ' + d);
    }
    const par = (p.parentIds||[]).filter(id=>idFor.has(id)).slice(0,2);
    if(par.length) lines.push('1 FAMC ' + famIds.get(famKey(par)));
    fams.forEach((fam, key)=>{
      if(fam.partners.includes(p.id)) lines.push('1 FAMS ' + famIds.get(key));
    });
    const noteParts = [];
    if(p.enslaverSurname) noteParts.push('Associated enslaver surname: ' + p.enslaverSurname);
    if(p.notes) noteParts.push(p.notes);
    if(noteParts.length) gedNote(lines, 1, noteParts.join('\n'));
  });

  fams.forEach((fam, key)=>{
    lines.push('0 ' + famIds.get(key) + ' FAM');
    if(fam.partners[0]) lines.push('1 HUSB ' + idFor.get(fam.partners[0]));
    if(fam.partners[1]) lines.push('1 WIFE ' + idFor.get(fam.partners[1]));
    fam.children.forEach(c=>lines.push('1 CHIL ' + idFor.get(c)));
    if(fam.notes.length){
      lines.push('1 MARR');
      gedNote(lines, 2, fam.notes.join('\n'));
    }
  });

  lines.push('0 TRLR');
  downloadFile('forebear-' + todayStr() + '.ged', lines.join('\n') + '\n', 'text/plain');
  showToast('GEDCOM exported');
}

// ---------- nav ----------
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    switchView(item.dataset.view);
    // On mobile, close the rail drawer after selecting a view
    closeRail();
  });
});
function switchView(view){
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active', i.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  if(view==='tree') requestAnimationFrame(drawConnectors);
}

// ---------- mobile rail drawer ----------
(function initMobileNav(){
  const toggle = document.getElementById('railToggle');
  const rail   = document.getElementById('appRail');
  const backdrop = document.getElementById('railBackdrop');
  if(!toggle || !rail || !backdrop) return;
  toggle.addEventListener('click', ()=>{
    const open = rail.classList.toggle('open');
    backdrop.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  backdrop.addEventListener('click', closeRail);
})();
function closeRail(){
  const rail = document.getElementById('appRail');
  const backdrop = document.getElementById('railBackdrop');
  const toggle = document.getElementById('railToggle');
  if(rail) rail.classList.remove('open');
  if(backdrop) backdrop.classList.remove('open');
  if(toggle) toggle.setAttribute('aria-expanded', 'false');
}

// ---------- render all ----------
function renderAll(){
  renderTree();
  renderLog();
  renderPersonFilterOptions();
  if(typeof renderPlanView === 'function') renderPlanView();
}

// ================= FAMILY TREE =================
function computeGenerations(){
  const byId = {};
  STATE.people.forEach(p=>byId[p.id]=p);
  const memo = {};
  function gen(id, stack){
    if(memo[id]!==undefined) return memo[id];
    if(stack.has(id)) return 0; // cycle guard
    const p = byId[id];
    if(!p || !p.parentIds || p.parentIds.length===0){ memo[id]=0; return 0; }
    stack.add(id);
    const parentGens = p.parentIds.filter(pid=>byId[pid]).map(pid=>gen(pid, stack));
    stack.delete(id);
    const g = parentGens.length ? Math.max(...parentGens)+1 : 0;
    memo[id]=g;
    return g;
  }
  STATE.people.forEach(p=>gen(p.id, new Set()));
  return memo;
}

function renderTree(){
  const container = document.getElementById('treeContent');
  if(STATE.people.length===0){
    container.innerHTML = `<div class="empty">
      <div class="empty-title">Where do you want to start?</div>
      <p>Most researchers begin with the most recent ancestor they can document, then work backward. Pick the path that matches what you already know.</p>
      <div class="onboarding-paths">
        <div class="onboard-path">
          <div class="onboard-path-label">I know a name &amp; approximate place</div>
          <p class="onboard-path-desc">You have a full name, a state or county, and a rough birth year — or you found a person in a census. Start here.</p>
          <button class="btn btn-small" onclick="openPersonForm()">+ Add that person</button>
        </div>
        <div class="onboard-path">
          <div class="onboard-path-label">I only have family stories</div>
          <p class="onboard-path-desc">You don't know the first name or exact place, only a surname and oral tradition. Add your oldest known relative — even just a surname and a decade — and the Research Plan will walk you through finding earlier records.</p>
          <button class="btn btn-small" onclick="openPersonForm()">+ Start with what you know</button>
        </div>
        <div class="onboard-path">
          <div class="onboard-path-label">Caribbean or non-U.S. family</div>
          <p class="onboard-path-desc">For Jamaican, Barbadian, Trinidadian, or other island families, the path is different — slave registers and parish baptisms are your anchors, not the U.S. census. Read the Field Guide first.</p>
          <button class="btn btn-small btn-ghost" onclick="document.querySelector('[data-view=guide]').click()">Open the Field Guide</button>
        </div>
      </div>
      <div class="onboard-footnote">Each person you add connects to the Research Log and Plan — every search you run, hit or miss, builds the record.</div>
    </div>`;
    return;
  }
  // Someone with no family links at all shouldn't masquerade as "Earliest known" —
  // they go in a separate "Not yet linked" row instead.
  const hasChildOf = new Set();
  STATE.people.forEach(p=>(p.parentIds||[]).forEach(id=>hasChildOf.add(id)));
  const isLinked = p => (p.parentIds && p.parentIds.length>0) || hasChildOf.has(p.id) || (p.spouses && p.spouses.length>0);
  const placed = STATE.people.filter(isLinked);
  const unplaced = STATE.people.filter(p=>!isLinked(p));

  const gens = computeGenerations();
  const rows = [];
  if(placed.length){
    const maxGen = Math.max(...placed.map(p=>gens[p.id]));
    for(let g=0; g<=maxGen; g++){
      const rowPeople = placed.filter(p=>gens[p.id]===g);
      if(rowPeople.length) rows.push({label: g===0 ? 'Earliest known' : 'Generation '+(g+1), people: rowPeople});
    }
  }
  if(unplaced.length){
    rows.push({label: 'Not yet linked' + (placed.length ? '' : ' — add parents or spouses to build generations'), people: unplaced});
  }

  let html = `<div class="tree-canvas"><svg id="treeSvg"></svg><div class="tree-rows">`;
  rows.forEach(row=>{
    html += `<div class="tree-row-wrap"><div class="gen-label">${esc(row.label)}</div>
      <div class="tree-row">`;
    row.people.forEach(p=>{
      const src = countSources(p.id);
      const facts = evidencedFacts(p.id);
      const next = typeof planNextStep === 'function' ? planNextStep(p.id) : null;
      const nextLine = next
        ? `<button type="button" class="plan-next-chip ${next.key==='done'?'done':''}" onclick="openPlanForPerson('${esc(p.id)}', event)" title="${esc(next.title)}">${esc(next.short)}</button>`
        : '';
      const discoverLine = `<button type="button" class="discover-chip" onclick="discoverPerson('${esc(p.id)}', event)" title="Search Discovery for ${esc(p.name)}">&#x2315; Search Discovery</button>`;
      html += `<div class="person-card" data-person-id="${esc(p.id)}" onclick="openPersonForm('${esc(p.id)}')">
        ${src>0?`<div class="source-badge" title="${src} linked source(s)">${src}</div>`:''}
        <div class="record-no">No. ${esc(p.id.slice(-4).toUpperCase())}</div>
        <div class="person-name">${esc(p.name)}</div>
        <div class="person-years">${esc(p.birthYear||'?')} – ${esc(p.deathYear||'?')}</div>
        ${p.birthplace?`<div class="person-place">${esc(p.birthplace)}</div>`:''}
        ${(p.nameVariants&&p.nameVariants.length)?`<div class="variant-line">Also: ${esc(p.nameVariants.join(', '))}</div>`:''}
        ${p.enslaverSurname?`<div class="enslaver-tag">Enslaver surname: ${esc(p.enslaverSurname)}</div>`:''}
        ${(() => {
          ensurePersonAfrica(p);
          const line = typeof africaSummaryLine === 'function' ? africaSummaryLine(p) : '';
          if(!line) return '';
          const conf = p.africa.regionConfidence || 'speculative';
          return `<div class="africa-tag">${typeof confidenceChip==='function'?confidenceChip(conf):''} <span>${esc(line)}</span></div>`;
        })()}
        ${facts.length?`<div class="evidence-row" title="Facts supported by confirmed sources">${facts.map(f=>`<span class="fact-chip">${esc(FACT_LABELS[f]||f)}</span>`).join('')}</div>`:''}
        ${nextLine}
        ${discoverLine}
      </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div></div>`;
  container.innerHTML = html;
  requestAnimationFrame(drawConnectors);
}

function evidencedFacts(personId){
  const set = new Set();
  STATE.logs.forEach(l=>{
    if(l.personId===personId && l.status==='confirmed') (l.supports||[]).forEach(f=>set.add(f));
  });
  return Object.keys(FACT_LABELS).filter(f=>set.has(f));
}

function drawConnectors(){
  const canvas = document.querySelector('.tree-canvas');
  const svg = document.getElementById('treeSvg');
  if(!canvas || !svg) return;
  const canvasRect = canvas.getBoundingClientRect();
  const width = canvas.scrollWidth;
  const height = canvas.scrollHeight;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = '';
  STATE.people.forEach(p=>{
    if(!p.parentIds || p.parentIds.length===0) return;
    const childEl = document.querySelector(`[data-person-id="${CSS.escape(p.id)}"]`);
    if(!childEl) return;
    const childRect = childEl.getBoundingClientRect();
    const cx = childRect.left - canvasRect.left + childRect.width/2 + canvas.scrollLeft;
    const cy = childRect.top - canvasRect.top;
    p.parentIds.forEach(pid=>{
      const parentEl = document.querySelector(`[data-person-id="${CSS.escape(pid)}"]`);
      if(!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();
      const px = parentRect.left - canvasRect.left + parentRect.width/2 + canvas.scrollLeft;
      const py = parentRect.top - canvasRect.top + parentRect.height;
      const midY = (py + cy)/2;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', `M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`);
      path.setAttribute('stroke', '#96692B');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.55');
      svg.appendChild(path);
    });
  });
  // spouse links: dashed indigo lines between card sides
  const drawnPairs = new Set();
  STATE.people.forEach(p=>{
    (p.spouses||[]).forEach(s=>{
      const key = [p.id, s.personId].sort().join('|');
      if(drawnPairs.has(key)) return;
      drawnPairs.add(key);
      const elA = document.querySelector(`[data-person-id="${CSS.escape(p.id)}"]`);
      const elB = document.querySelector(`[data-person-id="${CSS.escape(s.personId)}"]`);
      if(!elA || !elB) return;
      const ra = elA.getBoundingClientRect(), rb = elB.getBoundingClientRect();
      const [left, right] = ra.left <= rb.left ? [ra, rb] : [rb, ra];
      const x1 = left.right - canvasRect.left + canvas.scrollLeft;
      const y1 = left.top - canvasRect.top + left.height/2;
      const x2 = right.left - canvasRect.left + canvas.scrollLeft;
      const y2 = right.top - canvasRect.top + right.height/2;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`);
      path.setAttribute('stroke', '#2C3A55');
      path.setAttribute('stroke-width', '1.4');
      path.setAttribute('stroke-dasharray', '4 3');
      path.setAttribute('fill', 'none');
      path.setAttribute('opacity', '0.5');
      svg.appendChild(path);
    });
  });
}
window.addEventListener('resize', ()=>{
  clearTimeout(window._rt);
  window._rt = setTimeout(drawConnectors, 150);
});

// ---------- person form ----------
function populateAfricaFormControls(){
  const eth = document.getElementById('pEthnonym');
  const coast = document.getElementById('pEmbarkCoast');
  const port = document.getElementById('pDisembark');
  const conf = document.getElementById('pAfricaConfidence');
  const lConf = document.getElementById('lConfidence');
  if(eth && typeof ethnonymOptionsHtml === 'function') eth.innerHTML = ethnonymOptionsHtml('');
  if(coast && typeof EMBARKATION_COASTS !== 'undefined'){
    coast.innerHTML = '<option value="">— Unknown —</option>' + EMBARKATION_COASTS.map(c=>
      `<option value="${esc(c)}">${esc(c)}</option>`
    ).join('');
  }
  if(port && typeof DISEMBARK_PORTS !== 'undefined'){
    port.innerHTML = '<option value="">— Unknown —</option>' + DISEMBARK_PORTS.map(c=>
      `<option value="${esc(c)}">${esc(c)}</option>`
    ).join('');
  }
  if(conf && typeof confidenceOptionsHtml === 'function') conf.innerHTML = confidenceOptionsHtml('speculative');
  if(lConf && typeof confidenceOptionsHtml === 'function') lConf.innerHTML = confidenceOptionsHtml('documentary');
}

function openPersonForm(id){
  editingPersonId = id || null;
  document.getElementById('personForm').reset();
  document.getElementById('personModalTitle').textContent = id ? 'Edit person' : 'Add a person';
  document.getElementById('pDeleteBtn').style.display = id ? 'inline-block' : 'none';
  populateAfricaFormControls();

  // build parent picker (exclude self and descendants would be nice but keep simple: exclude self)
  const picker = document.getElementById('parentPicker');
  const spicker = document.getElementById('spousePicker');
  const others = STATE.people.filter(p=>p.id!==id);
  if(others.length===0){
    picker.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">No one else in the tree yet to select as a parent.</div>`;
    spicker.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">No one else in the tree yet to select as a spouse.</div>`;
  }else{
    picker.innerHTML = others.map(p=>
      `<label><input type="checkbox" value="${esc(p.id)}" class="parent-check"> ${esc(p.name)}</label>`
    ).join('');
    spicker.innerHTML = others.map(p=>
      `<div class="spouse-row">
        <label><input type="checkbox" value="${esc(p.id)}" class="spouse-check"> ${esc(p.name)}</label>
        <input type="text" class="spouse-note" data-spouse="${esc(p.id)}" placeholder="record note (optional)">
      </div>`
    ).join('');
  }

  if(id){
    const p = STATE.people.find(x=>x.id===id);
    if(p){
      ensurePersonAfrica(p);
      document.getElementById('pId').value = p.id;
      document.getElementById('pName').value = p.name||'';
      document.getElementById('pVariants').value = (p.nameVariants||[]).join(', ');
      document.getElementById('pBirth').value = p.birthYear||'';
      document.getElementById('pDeath').value = p.deathYear||'';
      document.getElementById('pPlace').value = p.birthplace||'';
      document.getElementById('pEnslaver').value = p.enslaverSurname||'';
      document.getElementById('pNotes').value = p.notes||'';
      document.getElementById('pDnaCompany').value = p.dna.company||'';
      document.getElementById('pDnaYear').value = p.dna.testedYear||'';
      document.getElementById('pDnaEthnicity').value = p.dna.ethnicityNotes||'';
      document.getElementById('pDnaRegion').value = p.dna.hypothesizedRegion||'';
      document.getElementById('pDnaMatches').value = p.dna.keyMatches||'';
      document.getElementById('pDnaSegments').value = p.dna.sharedSegments||'';
      document.getElementById('pAfricaBorn').checked = !!p.africa.africanBornMention;
      document.getElementById('pAfricaName').value = p.africa.africanGivenName||'';
      document.getElementById('pEthnonym').value = p.africa.ethnonymId||'';
      document.getElementById('pEmbarkCoast').value = p.africa.embarkationCoast||'';
      document.getElementById('pEmbarkDecade').value = p.africa.embarkationDecade||'';
      document.getElementById('pDisembark').value = p.africa.disembarkationPort||'';
      document.getElementById('pShip').value = p.africa.shipName||'';
      document.getElementById('pAfricaOral').value = p.africa.oralTradition||'';
      document.getElementById('pAfricaRegion').value = p.africa.regionClaim||'';
      document.getElementById('pAfricaConfidence').value = p.africa.regionConfidence||'speculative';
      (p.parentIds||[]).forEach(pid=>{
        const cb = picker.querySelector(`input[value="${CSS.escape(pid)}"]`);
        if(cb) cb.checked = true;
      });
      (p.spouses||[]).forEach(s=>{
        const cb = spicker.querySelector(`input.spouse-check[value="${CSS.escape(s.personId)}"]`);
        if(cb) cb.checked = true;
        const note = spicker.querySelector(`input.spouse-note[data-spouse="${CSS.escape(s.personId)}"]`);
        if(note) note.value = s.note||'';
      });
    }
  }else{
    document.getElementById('pId').value = '';
  }
  document.getElementById('personOverlay').classList.add('open');
}
function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }

function savePerson(e){
  e.preventDefault();
  const nameInput = document.getElementById('pName');
  if(!nameInput.value.trim()){
    nameInput.setCustomValidity('Please enter at least a name or identifier for this person.');
    nameInput.reportValidity();
    nameInput.setCustomValidity('');
    return false;
  }
  const isNewPerson = !document.getElementById('pId').value;
  const id = document.getElementById('pId').value || uid();
  const parentIds = Array.from(document.querySelectorAll('.parent-check:checked')).map(cb=>cb.value);
  const spouses = Array.from(document.querySelectorAll('.spouse-check:checked')).map(cb=>{
    const note = document.querySelector(`#spousePicker input.spouse-note[data-spouse="${CSS.escape(cb.value)}"]`);
    return { personId: cb.value, note: note ? note.value.trim() : '' };
  });
  const data = {
    id,
    name: document.getElementById('pName').value.trim(),
    nameVariants: document.getElementById('pVariants').value.split(',').map(s=>s.trim()).filter(Boolean),
    birthYear: document.getElementById('pBirth').value.trim(),
    deathYear: document.getElementById('pDeath').value.trim(),
    birthplace: document.getElementById('pPlace').value.trim(),
    enslaverSurname: document.getElementById('pEnslaver').value.trim(),
    notes: document.getElementById('pNotes').value.trim(),
    parentIds,
    spouses,
    dna: {
      company: document.getElementById('pDnaCompany').value,
      testedYear: document.getElementById('pDnaYear').value.trim(),
      ethnicityNotes: document.getElementById('pDnaEthnicity').value.trim(),
      hypothesizedRegion: document.getElementById('pDnaRegion').value.trim(),
      keyMatches: document.getElementById('pDnaMatches').value.trim(),
      sharedSegments: document.getElementById('pDnaSegments').value.trim()
    },
    africa: {
      africanBornMention: document.getElementById('pAfricaBorn').checked,
      africanGivenName: document.getElementById('pAfricaName').value.trim(),
      ethnonymId: document.getElementById('pEthnonym').value,
      embarkationCoast: document.getElementById('pEmbarkCoast').value,
      embarkationDecade: document.getElementById('pEmbarkDecade').value.trim(),
      disembarkationPort: document.getElementById('pDisembark').value,
      shipName: document.getElementById('pShip').value.trim(),
      oralTradition: document.getElementById('pAfricaOral').value.trim(),
      regionClaim: document.getElementById('pAfricaRegion').value.trim(),
      regionConfidence: document.getElementById('pAfricaConfidence').value || 'speculative'
    },
    updatedAt: Date.now()
  };
  // If ethnonym chosen and region blank, seed from glossary
  if(data.africa.ethnonymId && !data.africa.regionClaim && typeof ethnonymById === 'function'){
    const eth = ethnonymById(data.africa.ethnonymId);
    if(eth) data.africa.regionClaim = eth.region;
  }
  const idx = STATE.people.findIndex(p=>p.id===id);
  if(idx>=0) STATE.people[idx] = data; else STATE.people.push(data);
  syncSpouses(data);
  closeOverlay('personOverlay');
  renderAll();
  saveData();
  // Nudge first-time users to export once they've added their first person
  if(isNewPerson && STATE.people.length === 1 && !META.lastExportAt){
    setTimeout(()=>showToast('First ancestor added — export a backup when you\'re done with your session.'), 900);
  }
  return false;
}
// spouse links are symmetric: mirror this person's spouse list onto everyone else
function syncSpouses(person){
  const now = Date.now();
  STATE.people.forEach(o=>{
    if(o.id===person.id) return;
    const before = JSON.stringify((o.spouses||[]).filter(s=>s.personId===person.id));
    o.spouses = (o.spouses||[]).filter(s=>s.personId!==person.id);
    const mine = (person.spouses||[]).find(s=>s.personId===o.id);
    if(mine) o.spouses.push({ personId: person.id, note: mine.note||'' });
    const after = JSON.stringify((o.spouses||[]).filter(s=>s.personId===person.id));
    if(before !== after) o.updatedAt = now;
  });
}
function deletePersonFromModal(){
  const id = document.getElementById('pId').value;
  if(!id) return;
  if(!confirm('Delete this person? Linked research log entries will be kept but unlinked.')) return;
  const now = Date.now();
  STATE.people = STATE.people.filter(p=>p.id!==id);
  STATE.people.forEach(p=>{
    const linked = (p.parentIds||[]).includes(id) || (p.spouses||[]).some(s=>s.personId===id);
    p.parentIds = (p.parentIds||[]).filter(pid=>pid!==id);
    p.spouses = (p.spouses||[]).filter(s=>s.personId!==id);
    if(linked) p.updatedAt = now;
  });
  STATE.logs.forEach(l=>{ if(l.personId===id){ l.personId=''; l.updatedAt = now; } });
  delete STATE.plans[id];
  STATE.tombstones.push({ id, deletedAt: now });
  closeOverlay('personOverlay');
  renderAll();
  saveData();
}

// ================= RESEARCH LOG =================
function renderPersonFilterOptions(){
  const filterSel = document.getElementById('filterPerson');
  const logSel = document.getElementById('lPerson');
  const opts = STATE.people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  filterSel.innerHTML = `<option value="">All people</option>` + opts;
  logSel.innerHTML = `<option value="">Unassigned / general</option>` + opts;
}

function renderLog(){
  const container = document.getElementById('logContent');
  const personFilter = document.getElementById('filterPerson').value;
  const statusFilter = document.getElementById('filterStatus').value;
  let logs = STATE.logs.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  if(personFilter) logs = logs.filter(l=>l.personId===personFilter);
  if(statusFilter) logs = logs.filter(l=>l.status===statusFilter);

  if(logs.length===0){
    container.innerHTML = `<div class="empty">
      <div class="empty-title">${STATE.logs.length===0 ? 'No research logged yet' : 'Nothing matches these filters'}</div>
      <p>${STATE.logs.length===0 ? 'Every source you check — a hit, a miss, or a maybe — belongs here. It keeps you from re-searching the same dead end twice.' : 'Try clearing a filter above.'}</p>
      ${STATE.logs.length===0 ? '<button class="btn" onclick="openLogForm()">+ Log your first source</button>' : ''}
    </div>`;
    return;
  }

  const statusLabels = {'to-research':'To research','promising':'Promising lead','confirmed':'Confirmed','dead-end':'Dead end'};
  container.innerHTML = `<div class="log-list">` + logs.map(l=>`
    <div class="log-card status-${esc(l.status||'to-research')}">
      <div class="log-top">
        <div>
          <div class="log-title">${esc(l.sourceName || l.type || 'Untitled source')}</div>
          <div class="log-meta">${l.date?esc(l.date)+' · ':''}${esc(l.type||'')}${l.personId?' · Linked to '+esc(personName(l.personId)):' · Unassigned'}</div>
        </div>
        <div class="status-pill">${esc(statusLabels[l.status]||'To research')}</div>
      </div>
      ${l.citation?`<div class="citation">${esc(l.citation)}</div>`:''}
      ${(l.supports&&l.supports.length)?`<div class="log-supports">Evidence for: ${l.supports.map(f=>`<span class="fact-chip">${esc(FACT_LABELS[f]||f)}</span>`).join('')}</div>`:''}
      ${l.findings?`<div class="log-field-label">Findings</div><div class="log-text">${esc(l.findings)}</div>`:''}
      ${l.nextSteps?`<div class="log-field-label">Next steps</div><div class="log-text">${esc(l.nextSteps)}</div>`:''}
      ${l.confidence?`<div class="log-field-label">Confidence</div><div class="log-text">${typeof confidenceChip==='function'?confidenceChip(l.confidence):esc(l.confidence)} ${esc((CONFIDENCE_LEVELS[l.confidence]||{}).label||l.confidence)}</div>`:''}
      <div class="log-actions">
        <button class="btn btn-ghost btn-small" onclick="openLogForm('${esc(l.id)}')">Edit</button>
      </div>
    </div>
  `).join('') + `</div>`;
}

function openLogForm(id, prefill){
  editingLogId = id || null;
  document.getElementById('logForm').reset();
  document.getElementById('logModalTitle').textContent = id ? 'Edit log entry' : 'Log a source';
  document.getElementById('lDeleteBtn').style.display = id ? 'inline-block' : 'none';
  renderPersonFilterOptions();
  if(typeof confidenceOptionsHtml === 'function'){
    document.getElementById('lConfidence').innerHTML = confidenceOptionsHtml('documentary');
  }

  if(id){
    const l = STATE.logs.find(x=>x.id===id);
    if(l){
      document.getElementById('lId').value = l.id;
      document.getElementById('lDate').value = l.date||'';
      document.getElementById('lPerson').value = l.personId||'';
      document.getElementById('lType').value = l.type||"Freedmen's Bureau Record";
      document.getElementById('lStatus').value = l.status||'to-research';
      document.getElementById('lSourceName').value = l.sourceName||'';
      document.getElementById('lCitation').value = l.citation||'';
      document.getElementById('lFindings').value = l.findings||'';
      document.getElementById('lNext').value = l.nextSteps||'';
      document.getElementById('lConfidence').value = l.confidence || (l.status==='confirmed'?'documentary':'speculative');
      document.querySelectorAll('.support-check').forEach(cb=>{
        cb.checked = (l.supports||[]).includes(cb.value);
      });
    }
  }else{
    document.getElementById('lId').value = '';
    document.getElementById('lDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('lStatus').value = 'to-research';
    document.getElementById('lConfidence').value = (prefill && prefill.confidence) || 'documentary';
    if(prefill){
      if(prefill.sourceName) document.getElementById('lSourceName').value = prefill.sourceName;
      if(prefill.citation) document.getElementById('lCitation').value = prefill.citation;
      if(prefill.type) document.getElementById('lType').value = prefill.type;
      if(prefill.findings) document.getElementById('lFindings').value = prefill.findings;
      if(prefill.personId) document.getElementById('lPerson').value = prefill.personId;
    }
  }
  document.getElementById('logOverlay').classList.add('open');
}

function saveLog(e){
  e.preventDefault();
  const id = document.getElementById('lId').value || uid();
  const data = {
    id,
    date: document.getElementById('lDate').value,
    personId: document.getElementById('lPerson').value,
    type: document.getElementById('lType').value,
    status: document.getElementById('lStatus').value,
    sourceName: document.getElementById('lSourceName').value.trim(),
    citation: document.getElementById('lCitation').value.trim(),
    findings: document.getElementById('lFindings').value.trim(),
    nextSteps: document.getElementById('lNext').value.trim(),
    supports: Array.from(document.querySelectorAll('.support-check:checked')).map(cb=>cb.value),
    confidence: document.getElementById('lConfidence').value || 'speculative',
    updatedAt: Date.now()
  };
  const idx = STATE.logs.findIndex(l=>l.id===id);
  if(idx>=0) STATE.logs[idx]=data; else STATE.logs.push(data);
  closeOverlay('logOverlay');
  renderAll();
  saveData();
  return false;
}
function deleteLogFromModal(){
  const id = document.getElementById('lId').value;
  if(!id) return;
  if(!confirm('Delete this log entry?')) return;
  STATE.logs = STATE.logs.filter(l=>l.id!==id);
  STATE.tombstones.push({ id, deletedAt: Date.now() });
  closeOverlay('logOverlay');
  renderAll();
  saveData();
}

// ================= DISCOVERY =================
function placeSelectOptions(selected){
  return '<option value="">— Select a place —</option>' + PLACE_GROUPS.map(g =>
    `<optgroup label="${esc(g.label)}">${g.places.map(p =>
      `<option value="${esc(p)}" ${p===selected?'selected':''}>${esc(p)}</option>`
    ).join('')}</optgroup>`
  ).join('');
}
(function populatePlaces(){
  const sel = document.getElementById('tkState');
  if(sel) sel.innerHTML = placeSelectOptions('');
})();

function discoveryContextFromForm(){
  return {
    givenName: document.getElementById('tkGiven').value.trim(),
    surname: document.getElementById('tkSurname').value.trim(),
    variants: document.getElementById('tkVariants').value.trim(),
    state: document.getElementById('tkState').value,
    county: document.getElementById('tkCounty').value.trim(),
    city: document.getElementById('tkCity').value.trim(),
    enslaver: document.getElementById('tkEnslaver').value.trim()
  };
}
function fillDiscoveryForm(ctx){
  if(!ctx) return;
  if(ctx.givenName !== undefined) document.getElementById('tkGiven').value = ctx.givenName || '';
  if(ctx.surname !== undefined) document.getElementById('tkSurname').value = ctx.surname || '';
  if(ctx.variants !== undefined){
    document.getElementById('tkVariants').value = Array.isArray(ctx.variants) ? ctx.variants.join(', ') : (ctx.variants || '');
  }
  if(ctx.state !== undefined) document.getElementById('tkState').value = ctx.state || '';
  if(ctx.county !== undefined) document.getElementById('tkCounty').value = ctx.county || '';
  if(ctx.city !== undefined) document.getElementById('tkCity').value = ctx.city || '';
  if(ctx.enslaver !== undefined) document.getElementById('tkEnslaver').value = ctx.enslaver || '';
}

// ---------- API key management ----------
async function loadKeys(){
  try{
    const res = await storage.get(KEYS_STORAGE_KEY, false);
    if(res && res.value){
      const parsed = JSON.parse(res.value);
      API_KEYS.smithsonian = parsed.smithsonian || '';
    }
  }catch(e){
    // no keys saved yet
  }
  document.getElementById('keySmithsonian').value = API_KEYS.smithsonian;
  updateKeyStatus();
}
async function saveKeys(){
  API_KEYS.smithsonian = document.getElementById('keySmithsonian').value.trim();
  try{
    await storage.set(KEYS_STORAGE_KEY, JSON.stringify(API_KEYS), false);
    showToast('Keys saved');
  }catch(e){
    showToast('Could not save keys');
  }
  updateKeyStatus();
}
function updateKeyStatus(){
  const sEl = document.getElementById('statusSmithsonian');
  sEl.innerHTML = `<span class="key-dot ${API_KEYS.smithsonian?'on':''}"></span> ${API_KEYS.smithsonian?'Connected':'Not connected'}`;
}
function toggleKeysPanel(){
  const panel = document.getElementById('keysPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ---------- result card builders ----------
function loadingCard(msg){
  return `<div class="result-card loading-card"><div class="result-left"><div class="result-note">${esc(msg)}</div></div></div>`;
}
function notConnectedCard(name, link, note, isEmail){
  return `<div class="result-card connect-card">
    <div class="result-left">
      <div class="result-label">${esc(name)} isn't connected</div>
      <div class="result-note">${esc(note)}</div>
    </div>
    <div class="result-actions">
      <a class="btn btn-small" href="${esc(link)}" target="_blank" rel="noopener">${isEmail?'Request a key':'Get a free key'}</a>
    </div>
  </div>`;
}
function emptyResultCard(msg){
  return `<div class="result-card"><div class="result-left"><div class="result-note">${esc(msg)}</div></div></div>`;
}
function errorCard(name, message){
  return `<div class="result-card error-card">
    <div class="result-left">
      <div class="result-label">Couldn't reach ${esc(name)}</div>
      <div class="result-note">${esc(message||'Unknown error')}. The quick links below work as a fallback either way.</div>
    </div>
  </div>`;
}
function apiErrorMessage(e){
  const msg = (e && e.message) || '';
  if(e && e.name === 'AbortError') return 'The request timed out after 12 seconds — try again in a moment';
  if(msg === 'HTTP 401' || msg === 'HTTP 403') return 'The API rejected the key (' + msg + ') — re-check it under "Connect data sources"';
  if(msg === 'HTTP 429') return 'Rate limit reached (HTTP 429) — wait a minute and try again';
  if(msg.startsWith('HTTP ')) return 'The API returned an error (' + msg + ')';
  return 'Network error (' + (msg || 'unknown') + ') — your connection dropped or the API is blocking browser requests';
}
// Result objects are kept here and cards reference them by index —
// never serialize result data into HTML attributes (untrusted API text).
let RESULT_CACHE = [];
function cacheResult(c){ return RESULT_CACHE.push(c) - 1; }
function resultCard(c){
  const idx = cacheResult(c);
  return `<div class="result-card">
    <div class="result-left">
      ${c.source?`<div class="source-tag">${esc(c.source)}</div>`:''}
      <div class="result-label">${esc(c.label)}</div>
      <div class="result-note">${esc(c.note||'')}</div>
      <div class="result-url">${esc(c.url)}</div>
    </div>
    <div class="result-actions">
      <a class="btn btn-small" href="${esc(c.url)}" target="_blank" rel="noopener">Open</a>
      <button class="btn btn-ghost btn-small" data-log-idx="${idx}">+ Log</button>
    </div>
  </div>`;
}
document.getElementById('toolkitResults').addEventListener('click', e=>{
  const btn = e.target.closest('[data-log-idx]');
  if(!btn) return;
  const c = RESULT_CACHE[Number(btn.dataset.logIdx)];
  if(c) queueLogFromResult(c);
});
function strategyCard(enslaver, county, state){
  return `<div class="strategy-card" style="margin-top:14px;">
    <div class="result-label">Strategy: search the 1860 slave schedule under "${esc(enslaver)}"</div>
    <div class="result-note">Enslaved people aren't named individually before 1870, so look up ${esc(enslaver)} as head-of-household in the 1860 (and 1850) U.S. Federal Slave Schedule for ${esc(county||'the county')}${state?', '+esc(state):''} on FamilySearch or Ancestry. Match the ages and sex listed against what you know or suspect about your ancestor and their family, then look for ${esc(enslaver)} in probate, estate, and tax records from the same county for individual names.</div>
  </div>`;
}

// ---------- live search: Smithsonian Open Access ----------
function extractFreetext(row){
  try{
    const ft = row.content && row.content.freetext;
    if(!ft) return '';
    const preferredKeys = ['notes','description','summary','physicalDescription','date','place'];
    for(const k of preferredKeys){
      if(ft[k] && ft[k][0] && ft[k][0].content) return ft[k][0].content;
    }
    const firstKey = Object.keys(ft)[0];
    if(firstKey && ft[firstKey][0] && ft[firstKey][0].content) return ft[firstKey][0].content;
  }catch(e){}
  return '';
}
async function searchSmithsonian(container, ctx){
  if(!API_KEYS.smithsonian){
    container.innerHTML = notConnectedCard('Smithsonian Open Access', 'https://api.data.gov/signup/', "Free, instant key — searches the NMAAHC's collections, including Freedmen's Bureau material, directly from here.", false);
    return;
  }
  container.innerHTML = loadingCard('Searching the Smithsonian Open Access API…');
  const name = [ctx.givenName, ctx.surname].filter(Boolean).join(' ') || ctx.surname;
  const q = [name, "Freedmen's Bureau", ctx.state && isUs(ctx) ? ctx.state : ''].filter(Boolean).join(' ');
  const url = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(q)}&rows=8&api_key=${encodeURIComponent(API_KEYS.smithsonian)}`;
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 12000);
    const res = await fetch(url, {signal: ctrl.signal});
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const rows = (data && data.response && data.response.rows) || [];
    if(rows.length===0){
      container.innerHTML = emptyResultCard("No Smithsonian results. Try dropping the place, or search just the surname.");
      return;
    }
    container.innerHTML = rows.slice(0,8).map(r=>{
      const dnr = (r.content && r.content.descriptiveNonRepeating) || {};
      const title = r.title || (dnr.title && dnr.title.content) || 'Untitled record';
      const unit = r.unitCode || '';
      const link = dnr.record_link || (dnr.guid ? `https://www.si.edu/object/${dnr.guid}` : '#');
      const note = [unit ? ('Unit: '+unit) : '', extractFreetext(r)].filter(Boolean).join(' — ');
      return resultCard({label: title, note, url: link, type: "Freedmen's Bureau Record", source: 'Smithsonian'});
    }).join('');
  }catch(e){
    container.innerHTML = errorCard('Smithsonian Open Access', apiErrorMessage(e));
  }
}

// ---------- quick links (always available, no key required) ----------
function renderQuickLinks(container, ctx){
  const groups = buildQuickLinksGrouped(ctx);
  const variants = buildVariantLinks(ctx);
  let html = '';
  groups.forEach(g=>{
    html += `<div class="result-section" style="margin-top:18px;">
      <div class="result-section-title">${esc(g.title)} <span class="result-count">${g.links.length}</span></div>
      <div class="result-grid">${g.links.map(resultCard).join('')}</div>
    </div>`;
  });
  if(variants.length){
    html += `<div class="result-section" style="margin-top:18px;">
      <div class="result-section-title">Also try these spellings <span class="result-count">${variants.length}</span></div>
      <div class="result-grid">${variants.map(resultCard).join('')}</div>
    </div>`;
  }
  container.innerHTML = html || `<div class="empty"><p>No collections matched this place — try clearing the place filter or pick a nearby region.</p></div>`;
}

// ---------- run everything ----------
function runDiscovery(){
  const ctx = discoveryContextFromForm();
  const results = document.getElementById('toolkitResults');

  if(!ctx.surname){
    results.innerHTML = `<div class="empty"><p>Enter at least a surname to search.</p></div>`;
    return;
  }

  RESULT_CACHE = [];
  const placeLabel = ctx.state || 'any place';
  const nameLabel = [ctx.givenName, ctx.surname].filter(Boolean).join(' ');
  results.innerHTML = `
    <div class="discovery-summary">Searching <strong>${esc(nameLabel)}</strong> in <strong>${esc(placeLabel)}</strong>${ctx.variants ? ' · variants: ' + esc(normalizeVariants(ctx.variants).join(', ')) : ''}</div>
    <div class="result-section">
      <div class="result-section-title">Live search (U.S. Freedmen's Bureau / Smithsonian)</div>
      <div class="result-grid" id="liveSmithsonian"></div>
    </div>
    <div id="quickLinks"></div>
    <div id="strategyArea"></div>
  `;

  renderQuickLinks(document.getElementById('quickLinks'), ctx);
  if(ctx.enslaver){
    document.getElementById('strategyArea').innerHTML = strategyCard(ctx.enslaver, ctx.county, ctx.state);
  }
  searchSmithsonian(document.getElementById('liveSmithsonian'), ctx);
}

function syncLogConfidence(status){
  const conf = document.getElementById('lConfidence');
  if(!conf) return;
  const map = { confirmed:'documentary', found:'documentary', 'not-found':'speculative', 'to-research':'speculative', 'dead-end':'speculative', promising:'oral' };
  if(map[status]) conf.value = map[status];
}

function queueLogFromResult(c){
  openLogForm(null, {
    sourceName: c.label,
    citation: c.url,
    type: c.type || "Freedmen's Bureau Record",
    findings: '',
    personId: (typeof activePlanPersonId !== 'undefined' && activePlanPersonId) || ''
  });
}

// ---------- init ----------
// Deferred to DOMContentLoaded so js/plan.js and js/sync.js (loaded
// after this file) are in place before the first render/sync.
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadMeta();
  await loadData();
  await loadKeys();
  if(typeof initSync === 'function') await initSync();
});
