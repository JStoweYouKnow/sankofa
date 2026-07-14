// ---------------------------------------------------------------
// Research Plan: the Field Guide's "get past 1870" method as a
// step-by-step, per-ancestor workflow. Plans live in STATE.plans
// keyed by person id, so they save, back up, and sync with
// everything else. Loaded after app.js; renderAll() calls
// renderPlanView().
// ---------------------------------------------------------------

let activePlanPersonId = '';
// Prefill objects for "+ Log" buttons are kept here and referenced by
// index — same pattern as RESULT_CACHE, never serialized into HTML.
let PLAN_LOG_ITEMS = [];

const CANDIDATE_STATUSES = {
  'untested': 'Untested',
  'promising': 'Promising',
  'ruled-out': 'Ruled out',
  'confirmed': 'Confirmed'
};

const PLAN_STEPS = [
  {
    key: 'anchor',
    title: 'Anchor them in the 1870 census',
    desc: "The 1870 census is the first federal record naming formerly enslaved people. Find your ancestor (or their household) there before anything else — it fixes the county, the approximate birth year, and the surname the family chose."
  },
  {
    key: 'county',
    title: "Pin down the county and nearest Freedmen's Bureau field office",
    desc: "Bureau records are filed by state and field office, not by name. Set the state and county above, then use the map to find the office that covered that county — note it here."
  },
  {
    key: 'records',
    title: 'Work the record checklist for that place',
    desc: "Search each collection below for the family's surname — and every variant spelling you've recorded. Log every attempt, misses included: a logged dead end is one you never re-search."
  },
  {
    key: 'enslaver',
    title: 'Identify and test enslaver candidates',
    desc: "A shared surname is a lead, not proof. List candidates — same-surname landowners in the county, names from oral history, Bureau, or Bank records — then test each against the 1860 slave schedule: does a household's age/sex tally match your family? Then chase that candidate's probate, estate, and tax records for names."
  },
  {
    key: 'confirm',
    title: 'Confirm with a record that names your ancestor',
    desc: "The goal: at least one confirmed source naming your ancestor directly before 1870 — a Freedman's Bank register, cohabitation bond, labor contract, or the enslaver's estate papers. Mark that log entry Confirmed and tag the facts it proves; they'll appear on the person's card."
  },
  {
    key: 'africa',
    title: 'Bridge toward Africa',
    desc: "You usually cannot surname-search Africa the way you search the U.S. census. Instead: capture DNA estimates and African matches, note any African-born mention or ethnonym, then use coast/port/decade clues to search Slave Voyages and African Origins. Tag every claim with honest confidence — a region estimate is not a village."
  }
];

// Sources that belong on the plan's place checklist (step 3). Census
// and slave-schedule links live on steps 1 and 4 instead — driven by
// `planChecklist` flags in js/sources.js.

function emptyPlan(){
  const steps = {};
  PLAN_STEPS.forEach(s=>{ steps[s.key] = { done:false, note:'', checked:{} }; });
  return { updatedAt: Date.now(), state:'', county:'', fieldOffice:'', steps, candidates: [] };
}
function ensurePlan(personId){
  if(!STATE.plans[personId]) STATE.plans[personId] = emptyPlan();
  const plan = STATE.plans[personId];
  PLAN_STEPS.forEach(s=>{ if(!plan.steps[s.key]) plan.steps[s.key] = { done:false, note:'', checked:{} }; });
  if(!Array.isArray(plan.candidates)) plan.candidates = [];
  if(plan.fieldOffice === undefined) plan.fieldOffice = '';
  return plan;
}
function activePlan(){
  return activePlanPersonId ? ensurePlan(activePlanPersonId) : null;
}
function touchPlan(){
  const plan = activePlan();
  if(plan) plan.updatedAt = Date.now();
}
function planSurname(person){
  const parts = (person.name||'').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length-1] : '';
}
function planGiven(person){
  const parts = (person.name||'').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
}
function planCtx(person, plan){
  return {
    givenName: planGiven(person),
    surname: planSurname(person),
    variants: person.nameVariants || [],
    state: plan.state,
    county: plan.county,
    city: '',
    enslaver: ''
  };
}

// Answer "what's my next step for Grandma Hattie?" — used by the
// plan banner and the tree cards.
function planNextStep(personId){
  if(!personId) return null;
  const plan = STATE.plans[personId];
  if(!plan){
    return { key: 'start', title: 'Start a research plan', short: 'Start plan' };
  }
  const open = PLAN_STEPS.find(s => !(plan.steps[s.key] && plan.steps[s.key].done));
  if(!open){
    return { key: 'done', title: 'Plan complete — keep confirming sources', short: 'Plan complete' };
  }
  return { key: open.key, title: open.title, short: 'Next: ' + open.title };
}
function openPlanForPerson(personId, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  activePlanPersonId = personId;
  switchView('plan');
  renderPlanView();
}

// ---------- rendering ----------
function renderPlanView(){
  const container = document.getElementById('planContent');
  if(!container) return;
  PLAN_LOG_ITEMS = [];

  if(STATE.people.length===0){
    container.innerHTML = `<div class="empty">
      <div class="empty-title">Add a person first</div>
      <p>The research plan works one ancestor at a time. Add the earliest ancestor you can name to the Family Tree, then come back here.</p>
      <button class="btn" onclick="switchView('tree')">Go to the Family Tree</button>
    </div>`;
    return;
  }
  if(activePlanPersonId && !STATE.people.find(p=>p.id===activePlanPersonId)) activePlanPersonId = '';

  const options = STATE.people.map(p=>
    `<option value="${esc(p.id)}" ${p.id===activePlanPersonId?'selected':''}>${esc(p.name)}${STATE.plans[p.id]?' · plan started':''}</option>`
  ).join('');
  let html = `<div class="plan-picker">
    <div class="field">
      <label for="planPerson">Whose line are you tracing?</label>
      <select id="planPerson" onchange="selectPlanPerson(this.value)">
        <option value="">— Choose an ancestor —</option>${options}
      </select>
    </div>
  </div>`;

  if(!activePlanPersonId){
    html += `<div class="empty"><p>Choose the ancestor you're trying to trace past 1870 — usually the earliest person in your tree.</p></div>`;
    container.innerHTML = html;
    return;
  }

  const person = STATE.people.find(p=>p.id===activePlanPersonId);
  const plan = ensurePlan(activePlanPersonId);
  const doneCount = PLAN_STEPS.filter(s=>plan.steps[s.key].done).length;
  const firstOpen = PLAN_STEPS.findIndex(s=>!plan.steps[s.key].done);
  const next = planNextStep(activePlanPersonId);

  const stateOptions = placeSelectOptions(plan.state);
  html += `<div class="plan-next">
    <div class="plan-next-label">Next step for ${esc(person.name)}</div>
    <div class="plan-next-title">${esc(next.title)}</div>
  </div>`;

  html += `<div class="plan-context">
    <div class="field">
      <label>Place they lived around emancipation / 1870</label>
      <select onchange="setPlanField('state', this.value)">${stateOptions}</select>
    </div>
    <div class="field">
      <label>County / parish</label>
      <input type="text" value="${esc(plan.county)}" placeholder="e.g. Gaston or St. Catherine" onchange="setPlanField('county', this.value)">
    </div>
    <div class="plan-progress">${doneCount} of ${PLAN_STEPS.length} steps done</div>
  </div>`;

  PLAN_STEPS.forEach((s, i)=>{
    const st = plan.steps[s.key];
    const current = !st.done && i === firstOpen;
    html += `<div class="plan-step ${st.done?'done':''} ${current?'current':''}" id="plan-step-${s.key}">
      <div class="plan-step-head">
        <label class="plan-check">
          <input type="checkbox" ${st.done?'checked':''} onchange="setStepDone('${s.key}', this.checked)">
          <span class="plan-num">Step ${i+1}</span>
        </label>
        <div class="plan-step-title">${esc(s.title)}</div>
        ${current?'<span class="plan-current-tag">You are here</span>':''}
      </div>
      <div class="plan-step-body">
        <p>${esc(s.desc)}</p>
        ${planStepActions(s.key, person, plan)}
        <textarea class="plan-note" rows="2" placeholder="Notes for this step — what you found, what to try next…" onchange="setStepNote('${s.key}', this.value)">${esc(st.note)}</textarea>
      </div>
    </div>`;
  });

  container.innerHTML = html;
  // Scroll the first open ("You are here") step into view without jarring the user
  requestAnimationFrame(()=>{
    const current = container.querySelector('.plan-step.current');
    if(current) current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function planLogBtn(prefill, label){
  const idx = PLAN_LOG_ITEMS.push(prefill) - 1;
  return `<button class="btn btn-ghost btn-small" onclick="planLog(${idx})">${esc(label||'+ Log this search')}</button>`;
}
function planLog(idx){
  const pf = PLAN_LOG_ITEMS[idx];
  if(pf) openLogForm(null, pf);
}

function planStepActions(key, person, plan){
  const ctx = planCtx(person, plan);
  if(key === 'anchor'){
    const src = SOURCE_REGISTRY.find(s=>s.id==='census-1870');
    const url = src.url(ctx);
    const isCarib = typeof isCaribbean === 'function' && isCaribbean(ctx);
    const caribNote = isCarib ? `<div class="callout" style="margin-bottom:10px;">
      <div class="callout-title">Caribbean research path</div>
      For Jamaica, Barbados, Trinidad, or other British Caribbean islands, the 1870 U.S. census doesn't apply. Your anchor records are:
      <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7;">
        <li><strong>1813–1834 Slave Registers</strong> — British colonial government-mandated registers naming enslaved people on each plantation.</li>
        <li><strong>Parish baptism registers</strong> — Anglican and nonconformist churches often recorded enslaved and freed people by name.</li>
        <li><strong>Emancipation / Apprenticeship records (1834–1838)</strong> — compensation claims named enslaved people by plantation.</li>
      </ul>
      Use the <a href="https://www.familysearch.org/en/wiki/Caribbean" target="_blank" rel="noopener">FamilySearch Caribbean wiki</a> and the British Caribbean Slave Registers source in the checklist (Step 3) as your starting points.
    </div>` : '';
    return `${caribNote}<div class="plan-actions">
      <button class="btn btn-small" onclick="runPlanDiscovery()">Search in Discovery</button>
      <a class="btn btn-small btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Open 1870 census for "${esc(ctx.surname||'…')}"</a>
      ${planLogBtn({ personId: person.id, type: 'Census / Slave Schedule', sourceName: '1870 U.S. Census (FamilySearch)', citation: url })}
    </div>`;
  }
  if(key === 'county'){
    return `<div class="plan-actions">
      <a class="btn btn-small" href="https://www.mappingthefreedmensbureau.com/" target="_blank" rel="noopener">Open the field office map</a>
      ${planLogBtn({ personId: person.id, type: "Freedmen's Bureau Record", sourceName: "Mapping the Freedmen's Bureau — field office lookup", citation: 'https://www.mappingthefreedmensbureau.com/' })}
    </div>
    <div class="field" style="margin-bottom:12px;max-width:420px;">
      <label>Nearest field office</label>
      <input type="text" value="${esc(plan.fieldOffice||'')}" placeholder="e.g. Charlotte, N.C. (Office of the Superintendent)" onchange="setPlanField('fieldOffice', this.value)">
    </div>`;
  }
  if(key === 'records'){
    const st = plan.steps.records;
    const sources = typeof planChecklistLinks === 'function' ? planChecklistLinks(ctx) : buildQuickLinks(ctx).filter(s=>s.planChecklist);
    // Reflect this ancestor's Discovery session: anything opened or
    // resolved there shows here too — one checklist, not two.
    const sess = STATE.sessions[sessionKey(personSearchCtx(person, plan))] || null;
    const hint = !plan.state
      ? `<div class="field-hint" style="margin-bottom:10px;">Set a place above to unlock state-, island-, and country-specific collections. National and Atlantic sources stay listed either way.</div>`
      : `<div class="field-hint" style="margin-bottom:10px;">Checklist for ${esc(plan.state)}${plan.county ? ', ' + esc(plan.county) : ''} — statuses sync automatically from Discovery searches run for this ancestor.</div>`;
    const runBtn = `<div class="plan-actions">
      <button type="button" class="btn btn-small" onclick="discoverPerson('${esc(person.id)}')">Run Discovery for ${esc(planSurname(person) || 'this ancestor')}</button>
    </div>`;
    const rows = sources.map(src=>{
      const check = sess && sess.checks[src.id];
      const resolved = !!(check && check.status !== 'opened');
      const manual = !!st.checked[src.id];
      const searched = manual || resolved;
      const statusChip = check ? ' ' + checkChipHtml(check) : '';
      return `<div class="plan-src-row ${searched?'searched':''}">
        <label><input type="checkbox" ${searched?'checked':''} ${resolved?'disabled title="Synced from Discovery"':''} onchange="setPlanChecked('${esc(src.id)}', this.checked)"> <span>${esc(src.label)}</span>${statusChip}</label>
        <div class="plan-src-actions">
          <a class="btn btn-small" href="${esc(src.url)}" target="_blank" rel="noopener">Open</a>
          ${planLogBtn({ personId: person.id, type: src.type, sourceName: src.label, citation: src.url }, '+ Log')}
        </div>
      </div>`;
    }).join('');
    return `${hint}${runBtn}<div class="plan-src-list">${rows || '<div class="field-hint">No checklist items for this place yet — try FamilySearch all-collections from Discovery.</div>'}</div>`;
  }
  if(key === 'enslaver'){
    const hasEnslaverHint = person.enslaverSurname
      ? `<div class="field-hint" style="margin-bottom:8px;">From the tree: this person's associated enslaver surname is "${esc(person.enslaverSurname)}" — add it below if you haven't.</div>` : '';
    const rows = plan.candidates.map((c, i)=>{
      const schedUrl = familySearchCollectionUrl({ surname: planSurname({name:c.name}), county: plan.county, state: plan.state }, '3161105');
      const statusOpts = Object.keys(CANDIDATE_STATUSES).map(k=>
        `<option value="${k}" ${c.status===k?'selected':''}>${CANDIDATE_STATUSES[k]}</option>`
      ).join('');
      return `<div class="candidate-block status-${esc(c.status||'untested')}">
        <div class="candidate-row">
          <div class="candidate-name">${esc(c.name)}</div>
          <select onchange="setCandidateStatus(${i}, this.value)">${statusOpts}</select>
          <div class="plan-src-actions">
            <a class="btn btn-small" href="${esc(schedUrl)}" target="_blank" rel="noopener">1860 slave schedule</a>
            <button class="btn btn-ghost btn-small" onclick="runCandidateDiscovery(${i})">Full search</button>
            ${planLogBtn({ personId: person.id, type: 'Census / Slave Schedule', sourceName: '1860 Slave Schedule — candidate ' + c.name, citation: schedUrl }, '+ Log')}
            <button class="btn btn-ghost btn-small" onclick="removeCandidate(${i})">✕</button>
          </div>
        </div>
        ${strategyCard(c.name, plan.county, plan.state)}
      </div>`;
    }).join('');
    const probateSurname = encodeURIComponent(plan.candidates.length ? plan.candidates[0].name.trim().split(/\s+/).pop() || '' : ctx.surname || '');
    const probateFsUrl = plan.state
      ? `https://www.familysearch.org/search/record/results?q.surname=${probateSurname}&q.residencePlace=${encodeURIComponent(plan.state)}&f.collectionId=`
      : `https://www.familysearch.org/en/wiki/United_States_Probate_Records`;
    return `${hasEnslaverHint}
    <div class="candidate-list">${rows || '<div class="field-hint">No candidates yet.</div>'}</div>
    <div class="candidate-add">
      <input type="text" id="candName" placeholder="Candidate enslaver name, e.g. Jasper Stowe" onkeydown="if(event.key==='Enter'){event.preventDefault();addCandidate();}">
      <button class="btn btn-small" onclick="addCandidate()">Add candidate</button>
    </div>
    <div class="callout" style="margin-top:14px;">
      <div class="callout-title">Probate &amp; estate records</div>
      Estate inventories, wills, and administrator bonds often name enslaved people. Once you have a candidate, search these:
      <div class="plan-actions" style="margin-top:8px;">
        <a class="btn btn-small" href="https://www.familysearch.org/en/wiki/United_States_Probate_Records" target="_blank" rel="noopener">FamilySearch probate guide by state</a>
        <a class="btn btn-small btn-ghost" href="https://www.heritagequestonline.com/" target="_blank" rel="noopener">HeritageQuest (free with library card)</a>
        ${planLogBtn({ personId: person.id, type: 'Property / Tax Record', sourceName: 'Probate / estate inventory', citation: '' }, '+ Log probate search')}
      </div>
      <div class="field-hint" style="margin-top:6px;">Tip: search the county courthouse index under the enslaver's surname, not the enslaved person's. Look for inventory lists in the estate file — some explicitly name individuals with ages and monetary values.</div>
    </div>`;
  }
  if(key === 'confirm'){
    const facts = evidencedFacts(person.id);
    const chips = facts.length
      ? `<div class="evidence-row" style="margin:0 0 10px;">${facts.map(f=>`<span class="fact-chip">${esc(FACT_LABELS[f]||f)}</span>`).join('')}</div>`
      : `<div class="field-hint" style="margin-bottom:10px;">No facts confirmed yet — when a log entry is marked Confirmed with evidence tags, they'll show here.</div>`;
    return `${chips}<div class="plan-actions">
      ${planLogBtn({ personId: person.id, type: "Freedman's Bank Record", sourceName: '', citation: '' }, '+ Log a confirming source')}
    </div>`;
  }
  if(key === 'africa'){
    ensurePersonAfrica(person);
    const a = person.africa;
    const d = person.dna;
    const eth = ethnonymById(a.ethnonymId);
    const voyageUrl = slaveVoyagesDatabaseUrl({
      embarkationCoast: a.embarkationCoast,
      disembarkationPort: a.disembarkationPort,
      embarkationDecade: a.embarkationDecade,
      shipName: a.shipName
    });
    const originsUrl = africanOriginsUrl(a.africanGivenName);
    const coastOpts = '<option value="">— Unknown —</option>' + EMBARKATION_COASTS.map(c=>
      `<option value="${esc(c)}" ${c===a.embarkationCoast?'selected':''}>${esc(c)}</option>`
    ).join('');
    const portOpts = '<option value="">— Unknown —</option>' + DISEMBARK_PORTS.map(c=>
      `<option value="${esc(c)}" ${c===a.disembarkationPort?'selected':''}>${esc(c)}</option>`
    ).join('');
    const dnaSummary = d.company
      ? `<div class="africa-dna-summary">
          <strong>DNA on file:</strong> ${esc(d.company)}${d.testedYear?' ('+esc(d.testedYear)+')':''}
          ${d.hypothesizedRegion?` · region: ${esc(d.hypothesizedRegion)}`:''}
          ${d.ethnicityNotes?`<div class="field-hint">${esc(d.ethnicityNotes)}</div>`:''}
          <button type="button" class="btn btn-ghost btn-small" onclick="openPersonForm('${esc(person.id)}')">Edit DNA workspace</button>
        </div>`
      : `<div class="field-hint" style="margin-bottom:10px;">No DNA entered yet —
          <button type="button" class="btn btn-ghost btn-small" onclick="openPersonForm('${esc(person.id)}')">Open DNA workspace on their card</button>
        </div>`;

    return `
      <div class="callout" style="margin-top:0;">
        <div class="callout-title">Honest limit</div>
        Surname search rarely reaches a village in Africa. Aim for a <em>region</em> supported by DNA and/or documents, then keep testing.
      </div>
      ${dnaSummary}
      <div class="plan-africa-grid">
        <div class="field">
          <label>African given name</label>
          <input type="text" value="${esc(a.africanGivenName)}" placeholder="If a register preserved one" onchange="setPersonAfricaField('africanGivenName', this.value)">
        </div>
        <div class="field">
          <label>Ethnonym</label>
          <select onchange="setPersonAfricaField('ethnonymId', this.value)">${ethnonymOptionsHtml(a.ethnonymId)}</select>
        </div>
        <div class="field">
          <label>Embarkation coast</label>
          <select onchange="setPersonAfricaField('embarkationCoast', this.value)">${coastOpts}</select>
        </div>
        <div class="field">
          <label>Decade</label>
          <input type="text" value="${esc(a.embarkationDecade)}" placeholder="e.g. 1800" onchange="setPersonAfricaField('embarkationDecade', this.value)">
        </div>
        <div class="field">
          <label>Disembarkation port</label>
          <select onchange="setPersonAfricaField('disembarkationPort', this.value)">${portOpts}</select>
        </div>
        <div class="field">
          <label>Ship name</label>
          <input type="text" value="${esc(a.shipName)}" onchange="setPersonAfricaField('shipName', this.value)">
        </div>
        <div class="field full">
          <label>Region claim</label>
          <input type="text" value="${esc(a.regionClaim)}" placeholder="${esc(eth ? eth.region : 'e.g. Igbo / SE Nigeria')}" onchange="setPersonAfricaField('regionClaim', this.value)">
        </div>
        <div class="field">
          <label>Confidence</label>
          <select onchange="setPersonAfricaField('regionConfidence', this.value)">${confidenceOptionsHtml(a.regionConfidence)}</select>
        </div>
        <div class="field full">
          <label class="inline-check"><input type="checkbox" ${a.africanBornMention?'checked':''} onchange="setPersonAfricaField('africanBornMention', this.checked)"> Record says African-born</label>
        </div>
      </div>
      <div class="plan-actions">
        <a class="btn btn-small" href="${esc(voyageUrl)}" target="_blank" rel="noopener">Open Slave Voyages (voyage matcher)</a>
        <a class="btn btn-small" href="${esc(originsUrl)}" target="_blank" rel="noopener">Search African Origins${a.africanGivenName?' for “'+esc(a.africanGivenName)+'”':''}</a>
        <a class="btn btn-small btn-ghost" href="https://liberatedafricans.org/public/search.php${a.africanGivenName?'?q='+encodeURIComponent(a.africanGivenName):''}" target="_blank" rel="noopener">Liberated Africans${a.africanGivenName?' (search by name)':''}</a>
        <button type="button" class="btn btn-ghost btn-small" onclick="runAfricaDiscovery()">Africa / Atlantic Discovery links</button>
        ${planLogBtn({
          personId: person.id,
          type: 'Ship / Voyage Record',
          sourceName: 'Slave Voyages search',
          citation: voyageUrl,
          confidence: a.regionConfidence || 'speculative'
        }, '+ Log voyage search')}
        ${planLogBtn({
          personId: person.id,
          type: 'DNA Match',
          sourceName: d.company ? (d.company + ' ethnicity / matches') : 'DNA evidence',
          citation: '',
          confidence: 'dna-supported'
        }, '+ Log DNA note')}
      </div>
      <div class="callout" style="margin-top:12px;">
        <div class="callout-title">DNA analysis tools</div>
        After uploading raw DNA data, these free tools help find African matches and map segments:
        <ul style="margin:6px 0 0;padding-left:18px;line-height:1.7;">
          <li><a href="https://www.gedmatch.com/" target="_blank" rel="noopener">GEDmatch</a> — chromosome-level comparison with testers from Africa, the Caribbean, and diaspora. Useful admixture tools: MDLP World, Eurogenes K36.</li>
          <li><a href="https://dnapainter.com/" target="_blank" rel="noopener">DNAPainter</a> — map shared segments to specific ancestral lines once you have a working hypothesis.</li>
          <li><a href="https://www.africanancestry.com/" target="_blank" rel="noopener">African Ancestry</a> — mtDNA and Y-DNA tests matched against 30,000+ African samples to identify a present-day ethnic group.</li>
        </ul>
      </div>
      <div class="field-hint" style="margin:8px 0 6px;">Ethnonym glossary — historical spellings you may see in records:</div>
      ${ethnonymGlossaryHtml()}
    `;
  }
  return '';
}

function setPersonAfricaField(field, value){
  const person = STATE.people.find(p=>p.id===activePlanPersonId);
  if(!person) return;
  ensurePersonAfrica(person);
  if(field === 'africanBornMention') person.africa[field] = !!value;
  else person.africa[field] = typeof value === 'string' ? value.trim() : value;
  if(field === 'ethnonymId' && person.africa.ethnonymId && !person.africa.regionClaim){
    const eth = ethnonymById(person.africa.ethnonymId);
    if(eth) person.africa.regionClaim = eth.region;
  }
  person.updatedAt = Date.now();
  touchPlan();
  saveData();
  renderPlanView();
  renderTree();
}
function runAfricaDiscovery(){
  const person = STATE.people.find(p=>p.id===activePlanPersonId);
  if(!person) return;
  ensurePersonAfrica(person);
  const ctx = africaRegionSearchCtx(person);
  fillDiscoveryForm({
    givenName: person.africa.africanGivenName || planGiven(person),
    surname: planSurname(person),
    variants: person.nameVariants || [],
    state: ctx.state,
    county: '',
    city: '',
    enslaver: ''
  });
  switchView('toolkit');
  runDiscovery();
}

// ---------- interactions ----------
// Parse a free-text birthplace like "Gaston County, NC" or "Barbados" into
// { state, county } using the known place list plus common abbreviations.
function parseBirthplace(str){
  if(!str) return {};
  const STATE_ABBREV = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
    CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',
    FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
    IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
    ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
    MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',
    NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
    NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
    OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
    SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
    VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
  };
  const allPlaces = [];
  if(typeof PLACE_GROUPS !== 'undefined'){
    PLACE_GROUPS.forEach(g=>g.places.forEach(p=>allPlaces.push(p)));
  }
  const parts = str.split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  let state = '';
  let county = '';
  for(let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    const found = allPlaces.find(pl=>pl.toLowerCase()===p.toLowerCase());
    if(found){ state=found; parts.splice(i,1); break; }
    const abbr = p.replace(/\.$/, '').toUpperCase();
    if(STATE_ABBREV[abbr]){ state=STATE_ABBREV[abbr]; parts.splice(i,1); break; }
  }
  if(state && parts.length > 0){
    county = parts[parts.length-1].replace(/\s+county$/i,'').replace(/\s+parish$/i,'').trim();
  }
  return { state, county };
}

function selectPlanPerson(id){
  activePlanPersonId = id;
  if(id){
    ensurePlan(id);
    // Auto-seed state/county from birthplace when the plan is fresh
    const plan = STATE.plans[id];
    if(!plan.state){
      const person = STATE.people.find(p=>p.id===id);
      if(person && person.birthplace){
        const parsed = parseBirthplace(person.birthplace);
        if(parsed.state) plan.state = parsed.state;
        if(parsed.county && !plan.county) plan.county = parsed.county;
      }
    }
  }
  saveData();
  renderPlanView();
}
function setPlanField(field, value){
  const plan = activePlan();
  if(!plan) return;
  plan[field] = (field==='county' || field==='fieldOffice') ? value.trim() : value;
  touchPlan();
  saveData();
  renderPlanView();
}
function setStepDone(key, done){
  const plan = activePlan();
  if(!plan) return;
  plan.steps[key].done = !!done;
  touchPlan();
  saveData();
  renderPlanView();
  renderTree();
}
function setStepNote(key, note){
  const plan = activePlan();
  if(!plan) return;
  plan.steps[key].note = note;
  touchPlan();
  saveData();
}
function setPlanChecked(sourceId, checked){
  const plan = activePlan();
  if(!plan) return;
  plan.steps.records.checked[sourceId] = !!checked;
  touchPlan();
  saveData();
  renderPlanView();
  // Nudge "mark step done" when all listed sources are now checked
  if(checked && !plan.steps.records.done){
    const person = STATE.people.find(p=>p.id===activePlanPersonId);
    if(person){
      const ctx = planCtx(person, plan);
      const sources = typeof planChecklistLinks==='function'
        ? planChecklistLinks(ctx)
        : (typeof buildQuickLinks==='function' ? buildQuickLinks(ctx).filter(s=>s.planChecklist) : []);
      const allChecked = sources.length>0 && sources.every(s=>!!plan.steps.records.checked[s.id]);
      if(allChecked){
        const doneLabel = document.querySelector('#plan-step-records .plan-check');
        if(doneLabel){ doneLabel.classList.add('nudge-done'); setTimeout(()=>doneLabel.classList.remove('nudge-done'), 3500); }
      }
    }
  }
}
function addCandidate(){
  const plan = activePlan();
  const input = document.getElementById('candName');
  if(!plan || !input) return;
  const name = input.value.trim();
  if(!name) return;
  plan.candidates.push({ name, status: 'untested' });
  touchPlan();
  saveData();
  renderPlanView();
}
function setCandidateStatus(i, status){
  const plan = activePlan();
  if(!plan || !plan.candidates[i]) return;
  plan.candidates[i].status = status;
  touchPlan();
  saveData();
  renderPlanView();
}
function removeCandidate(i){
  const plan = activePlan();
  if(!plan || !plan.candidates[i]) return;
  plan.candidates.splice(i, 1);
  touchPlan();
  saveData();
  renderPlanView();
}

// Prefill Discovery from the plan context and run the search.
function runPlanDiscovery(candidateName){
  const plan = activePlan();
  const person = STATE.people.find(p=>p.id===activePlanPersonId);
  if(!plan || !person) return;
  fillDiscoveryForm({
    givenName: planGiven(person),
    surname: planSurname(person),
    variants: person.nameVariants || [],
    state: plan.state || '',
    county: plan.county || '',
    city: '',
    enslaver: candidateName || person.enslaverSurname || ''
  });
  switchView('toolkit');
  runDiscovery();
}
// Called from a tree-card "Discover" button — pre-fills Discovery from
// whatever we know about this person and runs the search.
// The one place a person becomes a search context: name split, tree
// variants, and place from the plan if set — else parsed out of the
// birthplace text ("Belmont, Gaston County, NC" → NC / Gaston / Belmont).
// Used by discoverPerson AND the plan's records checklist, so both
// resolve to the same session key.
function personSearchCtx(person, plan){
  const parsed = typeof parsePlace === 'function' ? parsePlace(person.birthplace) : { state:'', county:'', city:'' };
  return {
    givenName: planGiven(person),
    surname: planSurname(person),
    variants: person.nameVariants || [],
    state: (plan && plan.state) || parsed.state || '',
    county: (plan && plan.county) || parsed.county || '',
    city: parsed.city || '',
    enslaver: person.enslaverSurname || ''
  };
}

function discoverPerson(personId, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const person = STATE.people.find(p=>p.id===personId);
  if(!person) return;
  activePlanPersonId = personId; // ensures +Log from Discovery pre-fills this person
  fillDiscoveryForm(personSearchCtx(person, STATE.plans[personId]));
  switchView('toolkit');
  runDiscovery(personId);
}

// Jump to Discovery with the family surname + this candidate as the
// possible enslaver, and run the search.
function runCandidateDiscovery(i){
  const plan = activePlan();
  if(!plan || !plan.candidates[i]) return;
  runPlanDiscovery(plan.candidates[i].name);
}
