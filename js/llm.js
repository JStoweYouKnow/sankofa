// ---------------------------------------------------------------
 // LLM wrappers (optional)
 // Rule-based coach / story / interpret / synthesize stay the source
 // of truth for actions and structure. When an OpenAI key is saved,
 // these helpers polish copy and enrich drafts via /api/llm.
 // Key stays in the browser and is forwarded only for the request.
 // ---------------------------------------------------------------

const LLM_SYSTEM = `You are a careful research assistant for Black American and diaspora genealogy past the 1870 brick wall.
Never invent specific archival citations, page numbers, or claimed facts not present in the input.
Prefer honest uncertainty. A shared surname is a lead, not proof of enslavement.
Keep language plain, warm, and concise. US English.`;

function llmConfigured(){
  return !!(typeof API_KEYS !== 'undefined' && API_KEYS.llm && API_KEYS.llmUse !== false);
}

function llmModel(){
  return (API_KEYS && API_KEYS.llmModel) || 'gpt-4o-mini';
}

function llmEndpoint(){
  // Relative proxy when deployed; optional absolute OpenAI-compatible base
  // can be set for advanced users (must allow browser CORS).
  return (API_KEYS && API_KEYS.llmEndpoint) || '/api/llm';
}

async function llmChat(messages, opts){
  opts = opts || {};
  if(!llmConfigured()) throw new Error('Add an OpenAI API key under Connect data sources.');
  const body = {
    model: llmModel(),
    messages,
    temperature: opts.temperature != null ? opts.temperature : 0.3,
    max_tokens: opts.max_tokens || 900
  };
  if(opts.json) body.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), opts.timeoutMs || 45000);
  let res;
  try{
    res = await fetch(llmEndpoint(), {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': 'Bearer ' + API_KEYS.llm,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }catch(e){
    clearTimeout(timer);
    if(e && e.name === 'AbortError') throw new Error('AI request timed out.');
    throw new Error('Could not reach the AI proxy. Deploy this app (or run vercel dev) so /api/llm is available.');
  }
  clearTimeout(timer);
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    throw new Error((data && data.error) || ('AI request failed (HTTP ' + res.status + ')'));
  }
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if(!content) throw new Error('Empty AI response.');
  return content;
}

function llmParseJson(text){
  const raw = String(text || '').trim();
  try{ return JSON.parse(raw); }catch(_){}
  const m = raw.match(/\{[\s\S]*\}/);
  if(m){
    try{ return JSON.parse(m[0]); }catch(_){}
  }
  throw new Error('AI returned non-JSON.');
}

function llmBusy(btn, on){
  if(!btn) return;
  if(on){
    btn.dataset.prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    btn.classList.add('llm-busy');
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevLabel || btn.textContent;
    btn.classList.remove('llm-busy');
  }
}

function llmEnhanceBtnHtml(kind, personId){
  if(!llmConfigured()){
    return `<button type="button" class="btn btn-ghost btn-small" onclick="toggleKeysPanel();showToast('Paste an OpenAI key, then Save keys')" title="Optional — paste an OpenAI key under Connect data sources">Enable AI</button>`;
  }
  return `<button type="button" class="btn btn-ghost btn-small" data-llm-enhance="${esc(kind)}" data-llm-person="${esc(personId || '')}">Enhance with AI</button>`;
}

// ---------- Coach: polish headline + why only (keep action kinds) ----------
async function llmEnhanceCoach(personId){
  const base = coachForPerson(personId || '');
  const person = personId && STATE.people.find(p => p.id === personId);
  const plan = personId && STATE.plans[personId];
  const payload = {
    person: person ? {
      name: person.name, birthYear: person.birthYear, birthplace: person.birthplace,
      enslaverSurname: person.enslaverSurname, variants: person.nameVariants
    } : null,
    plan: plan ? {
      state: plan.state, county: plan.county, fieldOffice: plan.fieldOffice,
      candidates: (plan.candidates || []).slice(0, 6),
      steps: Object.fromEntries(Object.keys(plan.steps || {}).map(k => [k, { done: !!plan.steps[k].done }]))
    } : null,
    coach: {
      key: base.key, headline: base.headline, why: base.why,
      primary: base.primary && base.primary.label,
      secondary: base.secondary && base.secondary.label
    }
  };
  const content = await llmChat([
    { role: 'system', content: LLM_SYSTEM + '\nReturn JSON: {"headline":"...","why":"..."} — one concrete next action, max 2 sentences in why. Do not change what the action is; only clarify the wording.' },
    { role: 'user', content: JSON.stringify(payload) }
  ], { json: true, max_tokens: 350 });
  const out = llmParseJson(content);
  if(out.headline) base.headline = String(out.headline).slice(0, 180);
  if(out.why) base.why = String(out.why).slice(0, 400);
  base._llm = true;
  return base;
}

async function llmApplyCoachEnhance(personId, btn){
  llmBusy(btn, true);
  try{
    const enhanced = await llmEnhanceCoach(personId);
    const banner = btn && btn.closest('.coach-banner');
    if(banner){
      const h = banner.querySelector('.coach-headline');
      const w = banner.querySelector('.coach-why');
      const label = banner.querySelector('.coach-label');
      if(h) h.textContent = enhanced.headline;
      if(w) w.textContent = enhanced.why;
      if(label && !label.textContent.includes('AI')){
        label.textContent = label.textContent.replace('Coach', 'Coach · AI');
      }
      banner.classList.add('coach-ai');
    }
    showToast('Coach wording updated');
  }catch(e){
    showToast(e.message || 'AI enhance failed');
  }finally{
    llmBusy(btn, false);
  }
}

// ---------- Story: enrich drafts after rule parse ----------
async function llmEnhanceStory(text, base){
  const content = await llmChat([
    { role: 'system', content: LLM_SYSTEM + `\nExtract genealogy drafts from oral history. Return JSON:
{"place":{"state":"","county":"","city":"","raw":""},"people":[{"name":"","kinship":"","birthYear":"","deathYear":"","birthplace":"","enslaverSurname":"","nameVariants":[],"note":"","include":true}],"warnings":[]}
Rules: only people clearly implied; birthYear like "c. 1867" when approximate; enslaverSurname is a lead; do not invent census citations.` },
    { role: 'user', content: JSON.stringify({ story: text, ruleBased: base }) }
  ], { json: true, max_tokens: 1200 });
  const out = llmParseJson(content);
  return mergeStoryParse(base, out);
}

function mergeStoryParse(base, llm){
  const place = Object.assign({}, base.place || {}, llm.place || {});
  const map = new Map();
  (base.people || []).forEach(p=>{
    map.set(String(p.name || '').toLowerCase(), Object.assign({}, p));
  });
  (llm.people || []).forEach(raw=>{
    const name = String(raw.name || '').trim();
    if(!name) return;
    const key = name.toLowerCase();
    const prev = map.get(key) || {
      name, kinship: '', birthYear: '', deathYear: '', birthplace: '',
      enslaverSurname: '', nameVariants: [], note: '', include: true,
      id: 'draft-' + Math.random().toString(36).slice(2, 9)
    };
    if(raw.kinship) prev.kinship = String(raw.kinship).toLowerCase().replace(/\s+/g, '-');
    if(raw.birthYear && !prev.birthYear) prev.birthYear = String(raw.birthYear);
    if(raw.deathYear && !prev.deathYear) prev.deathYear = String(raw.deathYear);
    if(raw.birthplace) prev.birthplace = String(raw.birthplace);
    if(raw.enslaverSurname) prev.enslaverSurname = String(raw.enslaverSurname);
    if(Array.isArray(raw.nameVariants)){
      raw.nameVariants.forEach(v=>{
        v = String(v || '').trim();
        if(v && !(prev.nameVariants || []).includes(v)){
          prev.nameVariants = (prev.nameVariants || []).concat([v]);
        }
      });
    }
    if(raw.note) prev.note = String(raw.note).slice(0, 500);
    if(raw.include === false) prev.include = false;
    map.set(key, prev);
  });
  const warnings = [].concat(base.warnings || [], llm.warnings || []);
  if(!(base.people || []).length && map.size){
    warnings.push('AI filled gaps the rule parser missed — review every draft before saving.');
  } else if(map.size > (base.people || []).length){
    warnings.push('AI suggested additional people — uncheck any that look wrong.');
  }
  return { people: [...map.values()], place, warnings: [...new Set(warnings)], _llm: true };
}

function refreshStoryLlmBtn(){
  const btn = document.getElementById('storyLlmBtn');
  if(!btn) return;
  if(typeof llmConfigured === 'function' && llmConfigured()){
    btn.textContent = 'Enhance with AI';
    btn.onclick = function(){ llmApplyStoryEnhance(this); };
    btn.title = '';
  } else {
    btn.textContent = 'Enable AI';
    btn.onclick = function(){ toggleKeysPanel(); showToast('Paste an OpenAI key, then Save keys'); };
    btn.title = 'Optional — paste an OpenAI key under Connect data sources';
  }
}

async function llmApplyStoryEnhance(btn){
  if(!llmConfigured()){
    toggleKeysPanel();
    showToast('Paste an OpenAI key, then Save keys');
    return;
  }
  const text = (document.getElementById('storyText').value || '').trim();
  if(!text){ showToast('Paste a story first'); return; }
  llmBusy(btn, true);
  try{
    const base = {
      people: STORY_DRAFTS.slice(),
      place: STORY_PLACE,
      warnings: []
    };
    // If user hasn't run rules yet, run them first
    if(!base.people.length){
      const parsed = parseStory(text);
      base.people = parsed.people;
      base.place = parsed.place;
      base.warnings = parsed.warnings;
    }
    const merged = await llmEnhanceStory(text, base);
    STORY_RAW = text;
    STORY_DRAFTS = merged.people;
    STORY_PLACE = merged.place;
    document.getElementById('storyWarnings').innerHTML = merged.warnings.map(w =>
      `<div class="story-warn">${esc(w)}</div>`
    ).join('');
    renderStoryReview();
    document.getElementById('storyApplyBtn').disabled = STORY_DRAFTS.filter(d=>d.include).length === 0;
    showToast('Story drafts enhanced');
  }catch(e){
    showToast(e.message || 'AI enhance failed');
  }finally{
    llmBusy(btn, false);
  }
}

// ---------- Hits: polish why blurb on insight + cards ----------
async function llmEnhanceHitBatch(ctx, hits){
  const slim = hits.slice(0, 10).map((h, i) => ({
    i,
    label: h.label,
    note: h.note,
    source: h.source,
    year: h.year || null,
    ruleWhy: (typeof interpretHit === 'function' ? interpretHit(h, ctx).why : '')
  }));
  const content = await llmChat([
    { role: 'system', content: LLM_SYSTEM + '\nReturn JSON: {"items":[{"i":0,"why":"...","lensHint":"enslaver-lead|freedperson|bureau|military|family-ad|runaway|place-history|general"}]} — one sentence why each; do not invent what the document contains beyond the title/note.' },
    { role: 'user', content: JSON.stringify({ search: ctx, hits: slim }) }
  ], { json: true, max_tokens: 1000 });
  const out = llmParseJson(content);
  const byI = new Map();
  (out.items || []).forEach(it=>{ if(typeof it.i === 'number') byI.set(it.i, it); });
  return byI;
}

async function llmApplyHitEnhance(btn){
  const ctx = LAST_DISCOVERY_CTX || {};
  const hits = (RESULT_CACHE || []).filter(c => c && c.label && c.url);
  if(!hits.length){ showToast('Run a search first'); return; }
  llmBusy(btn, true);
  try{
    const byI = await llmEnhanceHitBatch(ctx, hits);
    hits.forEach((h, i)=>{
      const it = byI.get(i);
      if(it && it.why) h._llmWhy = String(it.why).slice(0, 320);
    });
    // Re-render live result cards in place if containers exist
    ['liveLoc','liveIa','liveSmithsonian'].forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      // Cards already in DOM — patch .hit-why text where cache idx matches
    });
    document.querySelectorAll('.result-card').forEach(card=>{
      const logBtn = card.querySelector('[data-log-idx]');
      if(!logBtn) return;
      const idx = Number(logBtn.dataset.logIdx);
      const c = RESULT_CACHE[idx];
      if(!c || !c._llmWhy) return;
      let why = card.querySelector('.hit-why');
      if(!why){
        const box = card.querySelector('.hit-interpret') || card.querySelector('.result-left');
        if(box){
          const div = document.createElement('div');
          div.className = 'hit-why';
          box.appendChild(div);
          why = div;
        }
      }
      if(why) why.textContent = c._llmWhy;
      const interpret = card.querySelector('.hit-interpret');
      if(interpret) interpret.classList.add('hit-ai');
    });
    if(typeof refreshHitInsightPanel === 'function') refreshHitInsightPanel();
    const panel = document.getElementById('hitInsight');
    if(panel){
      const note = panel.querySelector('.insight-summary');
      if(note) note.innerHTML = esc(note.textContent) + ' <span class="ai-pill">AI polished</span>';
    }
    showToast('Hit readings polished');
  }catch(e){
    showToast(e.message || 'AI enhance failed');
  }finally{
    llmBusy(btn, false);
  }
}

// Prefer LLM why in interpretHitHtml when present
function interpretHitHtmlWithLlm(c, ctx){
  const html = typeof interpretHitHtml === 'function' ? interpretHitHtml(c, ctx) : '';
  if(!c || !c._llmWhy || !html) return html;
  return html.replace(
    /(<span class="hit-why">)([\s\S]*?)(<\/span>)/,
    '$1' + esc(c._llmWhy) + '$3'
  ).replace('hit-interpret', 'hit-interpret hit-ai');
}

// ---------- Synthesis: polish narrative + questions ----------
async function llmEnhanceSynth(personId){
  const base = synthesizeBridge(personId);
  const content = await llmChat([
    { role: 'system', content: LLM_SYSTEM + '\nReturn JSON: {"narrative":"...","dnaQuestions":["..."]} — tighten the narrative (3-5 sentences max); keep dnaQuestions practical and honest. Do not add fake sources.' },
    { role: 'user', content: JSON.stringify({
      ready: base.ready,
      narrative: base.narrative,
      known: base.known,
      gaps: base.gaps,
      hypotheses: base.hypotheses,
      dnaQuestions: base.dnaQuestions
    }) }
  ], { json: true, max_tokens: 700 });
  const out = llmParseJson(content);
  if(out.narrative) base.narrative = String(out.narrative).slice(0, 900);
  if(Array.isArray(out.dnaQuestions) && out.dnaQuestions.length){
    base.dnaQuestions = out.dnaQuestions.map(q => String(q).slice(0, 280)).slice(0, 6);
  }
  base._llm = true;
  return base;
}

async function llmApplySynthEnhance(personId, btn){
  llmBusy(btn, true);
  try{
    const enhanced = await llmEnhanceSynth(personId);
    // Re-render plan africa step
    if(typeof renderPlanView === 'function'){
      // Stash enhanced narrative onto person for this session
      const person = STATE.people.find(p => p.id === personId);
      if(person){
        person._synthCache = enhanced;
      }
      renderPlanView();
      showToast('Bridge synthesis polished');
    }
  }catch(e){
    showToast(e.message || 'AI enhance failed');
  }finally{
    llmBusy(btn, false);
  }
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-llm-enhance]');
  if(!btn) return;
  e.preventDefault();
  const kind = btn.dataset.llmEnhance;
  const personId = btn.dataset.llmPerson || '';
  if(kind === 'coach') llmApplyCoachEnhance(personId, btn);
  else if(kind === 'story') llmApplyStoryEnhance(btn);
  else if(kind === 'hits') llmApplyHitEnhance(btn);
  else if(kind === 'synth') llmApplySynthEnhance(personId, btn);
});
