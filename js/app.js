// ---------------------------------------------------------------
// Local storage shim
// This project was originally built as a Claude.ai artifact, which
// provides a `window.storage` API for persistence. Outside that
// environment there's no such API, so this shim backs the same
// get/set/delete/list interface with the browser's localStorage.
// Data is per-browser only (not synced across devices). If you want
// cross-device sync, swap this out for a real backend (a small
// Vercel serverless function + KV/Postgres, Supabase, etc.) and keep
// the same get/set call signatures used throughout app.js.
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

const STORAGE_KEY = 'sankofa-genealogy-data-v1';
const KEYS_STORAGE_KEY = 'sankofa-api-keys-v1';
let STATE = { people: [], logs: [] };
let API_KEYS = { smithsonian: '', nara: '' };
let editingPersonId = null;
let editingLogId = null;

const US_STATES = ["Alabama","Arkansas","Delaware","District of Columbia","Florida","Georgia","Kentucky","Louisiana","Maryland","Mississippi","Missouri","North Carolina","South Carolina","Tennessee","Texas","Virginia","Other / not listed"];

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
async function loadData(){
  try{
    const res = await storage.get(STORAGE_KEY, false);
    if(res && res.value){
      const parsed = JSON.parse(res.value);
      STATE.people = parsed.people || [];
      STATE.logs = parsed.logs || [];
    }
  }catch(e){
    // no saved data yet - start fresh
  }
  renderAll();
}
async function saveData(){
  try{
    await storage.set(STORAGE_KEY, JSON.stringify(STATE), false);
    showToast('Saved');
  }catch(e){
    console.error('save failed', e);
    showToast('Could not save');
  }
}

// ---------- nav ----------
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=>switchView(item.dataset.view));
});
function switchView(view){
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active', i.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  if(view==='tree') requestAnimationFrame(drawConnectors);
}

// ---------- render all ----------
function renderAll(){
  renderTree();
  renderLog();
  renderPersonFilterOptions();
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
      <div class="empty-title">No one in your tree yet</div>
      <p>Start with the earliest ancestor you can name with confidence, or start with yourself and work backward. Each person you add can be linked to the research log entries that support them.</p>
      <button class="btn" onclick="openPersonForm()">+ Add the first person</button>
    </div>`;
    return;
  }
  const gens = computeGenerations();
  const maxGen = Math.max(...Object.values(gens));
  const rows = [];
  for(let g=0; g<=maxGen; g++){
    rows.push(STATE.people.filter(p=>gens[p.id]===g));
  }
  let html = `<div class="tree-canvas"><svg id="treeSvg"></svg><div class="tree-rows">`;
  rows.forEach((rowPeople, idx)=>{
    html += `<div class="tree-row-wrap"><div class="gen-label">${idx===0?'Earliest known':'Generation '+(idx+1)}</div>
      <div class="tree-row">`;
    rowPeople.forEach(p=>{
      const src = countSources(p.id);
      html += `<div class="person-card" data-person-id="${esc(p.id)}" onclick="openPersonForm('${esc(p.id)}')">
        ${src>0?`<div class="source-badge" title="${src} linked source(s)">${src}</div>`:''}
        <div class="record-no">No. ${esc(p.id.slice(-4).toUpperCase())}</div>
        <div class="person-name">${esc(p.name)}</div>
        <div class="person-years">${esc(p.birthYear||'?')} – ${esc(p.deathYear||'?')}</div>
        ${p.birthplace?`<div class="person-place">${esc(p.birthplace)}</div>`:''}
        ${p.enslaverSurname?`<div class="enslaver-tag">Enslaver surname: ${esc(p.enslaverSurname)}</div>`:''}
      </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div></div>`;
  container.innerHTML = html;
  requestAnimationFrame(drawConnectors);
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
}
window.addEventListener('resize', ()=>{
  clearTimeout(window._rt);
  window._rt = setTimeout(drawConnectors, 150);
});

// ---------- person form ----------
function openPersonForm(id){
  editingPersonId = id || null;
  document.getElementById('personForm').reset();
  document.getElementById('personModalTitle').textContent = id ? 'Edit person' : 'Add a person';
  document.getElementById('pDeleteBtn').style.display = id ? 'inline-block' : 'none';

  // build parent picker (exclude self and descendants would be nice but keep simple: exclude self)
  const picker = document.getElementById('parentPicker');
  if(STATE.people.filter(p=>p.id!==id).length===0){
    picker.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">No one else in the tree yet to select as a parent.</div>`;
  }else{
    picker.innerHTML = STATE.people.filter(p=>p.id!==id).map(p=>
      `<label><input type="checkbox" value="${esc(p.id)}" class="parent-check"> ${esc(p.name)}</label>`
    ).join('');
  }

  if(id){
    const p = STATE.people.find(x=>x.id===id);
    if(p){
      document.getElementById('pId').value = p.id;
      document.getElementById('pName').value = p.name||'';
      document.getElementById('pBirth').value = p.birthYear||'';
      document.getElementById('pDeath').value = p.deathYear||'';
      document.getElementById('pPlace').value = p.birthplace||'';
      document.getElementById('pEnslaver').value = p.enslaverSurname||'';
      document.getElementById('pNotes').value = p.notes||'';
      (p.parentIds||[]).forEach(pid=>{
        const cb = picker.querySelector(`input[value="${CSS.escape(pid)}"]`);
        if(cb) cb.checked = true;
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
  const id = document.getElementById('pId').value || uid();
  const parentIds = Array.from(document.querySelectorAll('.parent-check:checked')).map(cb=>cb.value);
  const data = {
    id,
    name: document.getElementById('pName').value.trim(),
    birthYear: document.getElementById('pBirth').value.trim(),
    deathYear: document.getElementById('pDeath').value.trim(),
    birthplace: document.getElementById('pPlace').value.trim(),
    enslaverSurname: document.getElementById('pEnslaver').value.trim(),
    notes: document.getElementById('pNotes').value.trim(),
    parentIds
  };
  const idx = STATE.people.findIndex(p=>p.id===id);
  if(idx>=0) STATE.people[idx] = data; else STATE.people.push(data);
  closeOverlay('personOverlay');
  renderAll();
  saveData();
  return false;
}
function deletePersonFromModal(){
  const id = document.getElementById('pId').value;
  if(!id) return;
  if(!confirm('Delete this person? Linked research log entries will be kept but unlinked.')) return;
  STATE.people = STATE.people.filter(p=>p.id!==id);
  STATE.people.forEach(p=>{ p.parentIds = (p.parentIds||[]).filter(pid=>pid!==id); });
  STATE.logs.forEach(l=>{ if(l.personId===id) l.personId=''; });
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
      ${l.findings?`<div class="log-field-label">Findings</div><div class="log-text">${esc(l.findings)}</div>`:''}
      ${l.nextSteps?`<div class="log-field-label">Next steps</div><div class="log-text">${esc(l.nextSteps)}</div>`:''}
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
    }
  }else{
    document.getElementById('lId').value = '';
    document.getElementById('lDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('lStatus').value = 'to-research';
    if(prefill){
      if(prefill.sourceName) document.getElementById('lSourceName').value = prefill.sourceName;
      if(prefill.citation) document.getElementById('lCitation').value = prefill.citation;
      if(prefill.type) document.getElementById('lType').value = prefill.type;
      if(prefill.findings) document.getElementById('lFindings').value = prefill.findings;
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
    nextSteps: document.getElementById('lNext').value.trim()
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
  closeOverlay('logOverlay');
  renderAll();
  saveData();
}

// ================= DISCOVERY =================
(function populateStates(){
  const sel = document.getElementById('tkState');
  sel.innerHTML = '<option value="">— Select a state —</option>' + US_STATES.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
})();

// ---------- API key management ----------
async function loadKeys(){
  try{
    const res = await storage.get(KEYS_STORAGE_KEY, false);
    if(res && res.value){
      const parsed = JSON.parse(res.value);
      API_KEYS.smithsonian = parsed.smithsonian || '';
      API_KEYS.nara = parsed.nara || '';
    }
  }catch(e){
    // no keys saved yet
  }
  document.getElementById('keySmithsonian').value = API_KEYS.smithsonian;
  document.getElementById('keyNara').value = API_KEYS.nara;
  updateKeyStatus();
}
async function saveKeys(){
  API_KEYS.smithsonian = document.getElementById('keySmithsonian').value.trim();
  API_KEYS.nara = document.getElementById('keyNara').value.trim();
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
  const nEl = document.getElementById('statusNara');
  sEl.innerHTML = `<span class="key-dot ${API_KEYS.smithsonian?'on':''}"></span> ${API_KEYS.smithsonian?'Connected':'Not connected'}`;
  nEl.innerHTML = `<span class="key-dot ${API_KEYS.nara?'on':''}"></span> ${API_KEYS.nara?'Connected':'Not connected'}`;
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
      <div class="result-note">${esc(message||'Unknown error')}. This can happen if the key is wrong, the request timed out, or the source blocks direct browser requests. The quick links below work as a fallback either way.</div>
    </div>
  </div>`;
}
function liveResultCard(c){
  return `<div class="result-card">
    <div class="result-left">
      <div class="source-tag">${esc(c.source)}</div>
      <div class="result-label">${esc(c.label)}</div>
      <div class="result-note">${esc(c.note||'')}</div>
      <div class="result-url">${esc(c.url)}</div>
    </div>
    <div class="result-actions">
      <a class="btn btn-small" href="${esc(c.url)}" target="_blank" rel="noopener">Open</a>
      <button class="btn btn-ghost btn-small" onclick='queueLogFromResult(${JSON.stringify(c).replace(/'/g,"&#39;")})'>+ Log</button>
    </div>
  </div>`;
}
function quickLinkCard(c){
  return `<div class="result-card">
    <div class="result-left">
      <div class="result-label">${esc(c.label)}</div>
      <div class="result-note">${esc(c.note)}</div>
      <div class="result-url">${esc(c.url)}</div>
    </div>
    <div class="result-actions">
      <a class="btn btn-small" href="${esc(c.url)}" target="_blank" rel="noopener">Open</a>
      <button class="btn btn-ghost btn-small" onclick='queueLogFromResult(${JSON.stringify(c).replace(/'/g,"&#39;")})'>+ Log</button>
    </div>
  </div>`;
}
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
async function searchSmithsonian(container, surname, state, county){
  if(!API_KEYS.smithsonian){
    container.innerHTML = notConnectedCard('Smithsonian Open Access', 'https://api.data.gov/signup/', "Free, instant key — searches the NMAAHC's collections, including Freedmen's Bureau material, directly from here.", false);
    return;
  }
  container.innerHTML = loadingCard('Searching the Smithsonian Open Access API…');
  const q = [surname, "Freedmen's Bureau", state].filter(Boolean).join(' ');
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
      container.innerHTML = emptyResultCard("No Smithsonian results. Try dropping the county, or search just the surname and state.");
      return;
    }
    container.innerHTML = rows.slice(0,8).map(r=>{
      const dnr = (r.content && r.content.descriptiveNonRepeating) || {};
      const title = r.title || (dnr.title && dnr.title.content) || 'Untitled record';
      const unit = r.unitCode || '';
      const link = dnr.record_link || (dnr.guid ? `https://www.si.edu/object/${dnr.guid}` : '#');
      const note = [unit ? ('Unit: '+unit) : '', extractFreetext(r)].filter(Boolean).join(' — ');
      return liveResultCard({label: title, note, url: link, type: "Freedmen's Bureau Record", source: 'Smithsonian'});
    }).join('');
  }catch(e){
    container.innerHTML = errorCard('Smithsonian Open Access', e && e.message);
  }
}

// ---------- live search: National Archives Catalog ----------
async function searchNARA(container, surname, state, county){
  if(!API_KEYS.nara){
    container.innerHTML = notConnectedCard('National Archives Catalog', 'mailto:Catalog_API@nara.gov?subject=API%20key%20request', "Free key by email request — searches NARA's Record Group 105 (Freedmen's Bureau) descriptions directly from here.", true);
    return;
  }
  container.innerHTML = loadingCard('Searching the National Archives Catalog…');
  const q = [surname, 'Freedmen', state, county].filter(Boolean).join(' ');
  const url = `https://catalog.archives.gov/api/v2/records/search?q=${encodeURIComponent(q)}`;
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 12000);
    const res = await fetch(url, {signal: ctrl.signal, headers:{'x-api-key': API_KEYS.nara}});
    clearTimeout(timer);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    const hits = (data && data.body && data.body.hits && data.body.hits.hits)
      || (data && data.hits && data.hits.hits)
      || [];
    if(hits.length===0){
      container.innerHTML = emptyResultCard("No NARA catalog results. Try dropping the county, or search the nearest field office city instead.");
      return;
    }
    container.innerHTML = hits.slice(0,8).map(h=>{
      const src = h._source || h;
      const record = src.record || src;
      const title = record.title || src.title || 'Untitled record';
      const naId = record.naId || src.naId || '';
      const link = naId ? `https://catalog.archives.gov/id/${naId}` : '#';
      const desc = record.scopeAndContentNote || record.description || '';
      const note = desc || (naId ? ('NAID '+naId) : '');
      return liveResultCard({label: title, note, url: link, type: "Freedmen's Bureau Record", source: 'National Archives'});
    }).join('');
  }catch(e){
    container.innerHTML = errorCard('National Archives Catalog', e && e.message);
  }
}

// ---------- quick links (always available, no key required) ----------
function renderQuickLinks(container, surname, state, county, city){
  const cards = [];

  let nmaahcUrl = `https://www.nmaahc.si.edu/explore/freedmens-bureau/search?edan_q=${encodeURIComponent(surname)}`;
  if(state) nmaahcUrl += `&edan_fq[]=${encodeURIComponent('p.nmaahc_fb.index.event_state:'+state)}`;
  if(county) nmaahcUrl += `&edan_fq[]=${encodeURIComponent('p.nmaahc_fb.index.event_county:'+county)}`;
  cards.push({
    label: "Smithsonian Freedmen's Bureau Search Portal (full site)",
    note: "The full portal with all its facets — worth a look even with live search connected, since it indexes more than the general Open Access API returns.",
    url: nmaahcUrl
  });

  let fsPlace = [county, state].filter(Boolean).join(', ');
  let fsUrl = `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(surname)}`;
  if(fsPlace) fsUrl += `&q.residencePlace=${encodeURIComponent(fsPlace)}`;
  cards.push({
    label: "FamilySearch record search",
    note: "Free account required — no public API for this one, so it stays a link. Searches all of FamilySearch's collections, not just Freedmen's Bureau records.",
    url: fsUrl
  });

  cards.push({
    label: "Mapping the Freedmen's Bureau",
    note: "An interactive map to find the field office nearest your county of interest, with links to that office's specific microfilm rolls.",
    url: "https://www.mappingthefreedmensbureau.com/"
  });

  if(state === 'North Carolina'){
    cards.push({
      label: "NC Digital Collections — Cohabitation Records",
      note: "State Archives of North Carolina's digitized 1866–1868 cohabitation bonds, which legalized formerly enslaved couples' marriages. Ongoing digitization by county.",
      url: "https://digital.ncdcr.gov/collections/cohabitation-records"
    });
  }

  container.innerHTML = cards.map(quickLinkCard).join('');
}

// ---------- run everything ----------
function runDiscovery(){
  const surname = document.getElementById('tkSurname').value.trim();
  const state = document.getElementById('tkState').value;
  const county = document.getElementById('tkCounty').value.trim();
  const city = document.getElementById('tkCity').value.trim();
  const enslaver = document.getElementById('tkEnslaver').value.trim();
  const results = document.getElementById('toolkitResults');

  if(!surname){
    results.innerHTML = `<div class="empty"><p>Enter at least a surname to search.</p></div>`;
    return;
  }

  results.innerHTML = `
    <div class="result-section">
      <div class="result-section-title">Live search</div>
      <div class="result-grid" id="liveSmithsonian"></div>
      <div class="result-grid" id="liveNara" style="margin-top:10px;"></div>
    </div>
    <div class="result-section" style="margin-top:26px;">
      <div class="result-section-title">Quick links</div>
      <div class="result-grid" id="quickLinks"></div>
      <div id="strategyArea"></div>
    </div>
  `;

  renderQuickLinks(document.getElementById('quickLinks'), surname, state, county, city);
  if(enslaver){
    document.getElementById('strategyArea').innerHTML = strategyCard(enslaver, county, state);
  }
  searchSmithsonian(document.getElementById('liveSmithsonian'), surname, state, county);
  searchNARA(document.getElementById('liveNara'), surname, state, county);
}

function queueLogFromResult(c){
  openLogForm(null, { sourceName: c.label, citation: c.url, type: c.type || "Freedmen's Bureau Record", findings: '' });
}

// ---------- init ----------
loadData();
loadKeys();
