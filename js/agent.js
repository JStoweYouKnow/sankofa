// ---------------------------------------------------------------
 // Agent runner (Phase D) — closed-loop Discovery queue
 // Builds the next N checklist / live / companion steps for a person,
 // runs what it can, and pauses for human review before logging.
 // Rule-based; never invents citations.
 // Loaded after companion.js / interpret.js.
 // ---------------------------------------------------------------

var AGENT = {
  personId: '',
  n: 3,
  steps: [],
  running: false
};

const AGENT_LIVE_IDS = {
  'chronicling-america': 'loc'
};

function agentIsFamilySearchUrl(url){
  return /familysearch\.org/i.test(String(url || ''));
}

function agentStepKindForSource(src){
  if(!src) return 'link';
  if(AGENT_LIVE_IDS[src.id]) return 'live';
  if(agentIsFamilySearchUrl(typeof src.url === 'function' ? '' : src.url) ||
     (src.id && String(src.id).indexOf('familysearch') === 0) ||
     src.id === 'familysearch-all'){
    return (typeof COMPANION !== 'undefined' && COMPANION.connected) ? 'companion' : 'link';
  }
  // url may be a function — evaluate later; peek registry note
  if(src.id && /^(fs-|census-|slave-schedule)/.test(src.id)){
    return (typeof COMPANION !== 'undefined' && COMPANION.connected) ? 'companion' : 'link';
  }
  return 'link';
}

function agentEnsureSession(personId){
  const person = STATE.people.find(p => p.id === personId);
  if(!person) return null;
  const plan = typeof ensurePlan === 'function' ? ensurePlan(personId) : STATE.plans[personId];
  const ctx = typeof personSearchCtx === 'function'
    ? personSearchCtx(person, plan)
    : { surname: '', givenName: '', state: '', county: '', variants: [] };
  if(!ctx.surname){
    showToast('Add a surname before running the agent');
    return null;
  }
  if(typeof fillDiscoveryForm === 'function') fillDiscoveryForm(ctx);
  if(typeof getOrCreateSession === 'function') getOrCreateSession(ctx, personId);
  if(typeof buildQuickLinks === 'function' && typeof renderQuickLinks === 'function'){
    // Populate QUICKLINK_CACHE without requiring the Discovery view to be visible
    const fake = { innerHTML: '' };
    renderQuickLinks(fake, ctx);
  }
  return { person, plan, ctx, session: typeof activeSession === 'function' ? activeSession() : null };
}

function agentNextSources(personId, n){
  n = n || AGENT.n || 3;
  const packed = agentEnsureSession(personId);
  if(!packed) return [];
  const { person, plan, ctx, session } = packed;
  const out = [];
  const seen = new Set();

  // 1) Opened-unresolved first
  if(session && session.checks){
    Object.keys(session.checks).forEach(id => {
      if(session.checks[id].status !== 'opened') return;
      const card = (typeof QUICKLINK_CACHE !== 'undefined' && QUICKLINK_CACHE[id])
        || (typeof SOURCE_REGISTRY !== 'undefined' && SOURCE_REGISTRY.find(s => s.id === id))
        || null;
      if(!card) return;
      seen.add(id);
      out.push({
        id: id,
        sourceId: id,
        kind: 'review',
        label: card.label || id,
        url: card.url || '',
        status: 'needs-review',
        note: 'Opened earlier — resolve Found or Nothing there'
      });
    });
  }

  // 1b) DNA workspace review when empty (Phase H) — high priority
  if(out.length < n && person){
    if(typeof ensurePersonAfrica === 'function') ensurePersonAfrica(person);
    const needsDna = !person.dna || !person.dna.keyMatches || !person.dna.company;
    if(needsDna && !seen.has('dna-workspace')){
      seen.add('dna-workspace');
      out.push({
        id: 'dna-workspace',
        sourceId: 'dna-workspace',
        kind: 'dna',
        label: 'Review DNA workspace',
        url: '',
        status: 'queued',
        note: 'Import match CSV (name, company, ethnicity notes) or enter African/diaspora matches — never auto-confirms a region.'
      });
    }
  }

  // 2) Checklist gaps in coach priority order
  let sources = [];
  if(typeof planChecklistLinks === 'function'){
    sources = planChecklistLinks(ctx).slice();
  } else if(typeof buildQuickLinks === 'function'){
    sources = buildQuickLinks(ctx).filter(s => s.planChecklist);
  }
  if(typeof COACH_CHECKLIST_PRIORITY !== 'undefined'){
    sources.sort((a, b) => {
      const ia = COACH_CHECKLIST_PRIORITY.indexOf(a.id);
      const ib = COACH_CHECKLIST_PRIORITY.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }
  const checked = (plan && plan.steps && plan.steps.records && plan.steps.records.checked) || {};
  for(const src of sources){
    if(out.length >= n) break;
    if(seen.has(src.id)) continue;
    const check = session && session.checks && session.checks[src.id];
    if(check && (check.status === 'found' || check.status === 'nothing')) continue;
    if(checked[src.id] && !(check && check.status === 'opened')) continue;
    seen.add(src.id);
    const url = typeof src.url === 'function' ? src.url(ctx) : (src.url || '');
    let kind = agentStepKindForSource(src);
    if(kind !== 'live' && agentIsFamilySearchUrl(url) && typeof COMPANION !== 'undefined' && COMPANION.connected){
      kind = 'companion';
    } else if(kind === 'companion' && !(typeof COMPANION !== 'undefined' && COMPANION.connected)){
      kind = 'link';
    }
    if(AGENT_LIVE_IDS[src.id]) kind = 'live';
    out.push({
      id: src.id,
      sourceId: src.id,
      kind: kind,
      label: src.label || src.id,
      url: url,
      status: 'queued',
      note: src.note || '',
      liveKey: AGENT_LIVE_IDS[src.id] || ''
    });
  }

  // 3) If still short, offer live LOC/IA/SI once
  if(out.length < n){
    ['loc', 'ia', 'si'].forEach(liveKey => {
      if(out.length >= n) return;
      const id = 'live:' + liveKey;
      if(seen.has(id)) return;
      seen.add(id);
      const labels = { loc: 'Chronicling America (live)', ia: 'Internet Archive (live)', si: 'Smithsonian (live)' };
      out.push({
        id: id,
        sourceId: liveKey === 'loc' ? 'chronicling-america' : id,
        kind: 'live',
        label: labels[liveKey],
        url: '',
        status: 'queued',
        note: 'In-app live search',
        liveKey: liveKey
      });
    });
  }

  return out.slice(0, n);
}

function agentQueueHtml(){
  if(!AGENT.steps.length) return '';
  const rows = AGENT.steps.map((s, i) => {
    const st = s.status || 'queued';
    const hint = st === 'awaiting-capture'
      ? `<div class="field-hint">Capture on FamilySearch, then Review capture under Connect — or mark Nothing / Skip.</div>`
      : '';
    const actions = (st === 'needs-review' || st === 'awaiting-capture')
      ? `${hint}<div class="agent-step-actions">
          <button type="button" class="btn btn-small" onclick="agentResolveStep(${i},'found')">Found something</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="agentResolveStep(${i},'nothing')">Nothing there</button>
          <button type="button" class="btn btn-ghost btn-small" onclick="agentResolveStep(${i},'skip')">Skip</button>
          ${s.kind === 'dna'
            ? `<button type="button" class="btn btn-ghost btn-small" onclick="openDnaWorkspace('${esc(AGENT.personId || '')}')">Open DNA workspace</button>`
            : `<button type="button" class="btn btn-ghost btn-small" onclick="agentResolveStep(${i},'enslaver')">Add as enslaver lead</button>`}
        </div>`
      : '';
    const open = s.kind === 'dna'
      ? `<button type="button" class="btn btn-ghost btn-small" onclick="agentMarkOpened(${i});openDnaWorkspace('${esc(AGENT.personId || '')}')">Open DNA</button>`
      : (s.url
        ? `<a class="btn btn-ghost btn-small" href="${esc(s.url)}" target="_blank" rel="noopener" onclick="agentMarkOpened(${i})">Open</a>`
        : '');
    // Review cards are always leads until a human confirms a log
    const trustCls = (st === 'needs-review' || st === 'awaiting-capture')
      ? 'lead'
      : (st === 'done' && s.resolveAction === 'enslaver')
        ? 'lead'
        : (st === 'done' && s.resolveAction === 'found')
          ? 'hypothesis'
          : 'lead';
    const trust = typeof trustBadge === 'function' ? trustBadge(trustCls) : '';
    return `<div class="agent-step status-${esc(st)}" data-agent-i="${i}" data-trust="${esc(trustCls)}">
      <div class="agent-step-top">
        <span class="agent-kind">${esc(s.kind)}</span>
        <strong>${esc(s.label)}</strong>
        ${trust}
        <span class="agent-status">${esc(st)}</span>
      </div>
      ${s.note ? `<div class="field-hint">${esc(s.note)}</div>` : ''}
      ${s.error ? `<div class="field-hint" style="color:var(--danger,#9a3412);">${esc(s.error)}</div>` : ''}
      <div class="agent-step-actions">${open}</div>
      ${actions}
    </div>`;
  }).join('');
  return `<div class="agent-queue" id="agentQueue">
    <div class="case-section-label">Agent queue</div>
    <p class="field-hint">Rule-based next steps. Confirm each result — the agent never auto-confirms proof. ${typeof trustBadge === 'function' ? trustBadge('lead', { label: 'Always a lead until you confirm' }) : ''}</p>
    ${rows}
  </div>`;
}

function agentRenderQueue(){
  const host = document.getElementById('agentQueueHost');
  if(host) host.innerHTML = agentQueueHtml();
  const inline = document.getElementById('agentQueue');
  if(!host && inline){
    // already rendered inside host
  }
  // Refresh coach/plan if visible
  if(typeof renderPlanView === 'function' && document.getElementById('planContent')){
    // Avoid full plan re-render loops: only update host
  }
}

function agentMarkOpened(i){
  const step = AGENT.steps[i];
  if(!step || !step.sourceId) return;
  if(typeof markSourceOpened === 'function') markSourceOpened(step.sourceId);
  if(step.status === 'queued' || step.status === 'running'){
    step.status = 'needs-review';
    agentRenderIntoHosts();
  }
}

async function agentRunStep(step, packed){
  const { ctx } = packed;
  if(step.kind === 'review'){
    step.status = 'needs-review';
    return;
  }
  if(step.kind === 'dna'){
    step.status = 'running';
    if(typeof openDnaWorkspace === 'function' && AGENT.personId){
      openDnaWorkspace(AGENT.personId);
    }
    step.status = 'needs-review';
    return;
  }
  if(step.kind === 'link'){
    step.status = 'running';
    if(step.sourceId && typeof markSourceOpened === 'function') markSourceOpened(step.sourceId);
    if(step.url && typeof window !== 'undefined' && window.open){
      try{ window.open(step.url, '_blank', 'noopener'); }catch(_){}
    }
    step.status = 'needs-review';
    return;
  }
  if(step.kind === 'companion'){
    step.status = 'awaiting-capture';
    if(step.sourceId && typeof markSourceOpened === 'function') markSourceOpened(step.sourceId);
    if(step.url && typeof window !== 'undefined' && window.open){
      try{ window.open(step.url, '_blank', 'noopener'); }catch(_){}
    }
    showToast('Capture results in the companion, then resolve this step');
    return;
  }
  if(step.kind === 'live'){
    step.status = 'running';
    const fake = { innerHTML: '' };
    try{
      if(step.liveKey === 'loc' && typeof searchLOC === 'function'){
        await searchLOC(fake, ctx);
      } else if(step.liveKey === 'ia' && typeof searchInternetArchive === 'function'){
        await searchInternetArchive(fake, ctx);
      } else if(step.liveKey === 'si' && typeof searchSmithsonian === 'function'){
        await searchSmithsonian(fake, ctx);
      } else if(step.sourceId === 'chronicling-america' && typeof searchLOC === 'function'){
        await searchLOC(fake, ctx);
      } else {
        step.status = 'error';
        step.error = 'No live search handler for this step';
        return;
      }
      if(step.sourceId && step.sourceId.indexOf('live:') !== 0 && typeof markSourceOpened === 'function'){
        markSourceOpened(step.sourceId);
      }
      step.status = 'needs-review';
      step.note = (step.note ? step.note + ' · ' : '') + 'Live search finished — review Hit reading, then resolve';
    }catch(e){
      step.status = 'error';
      step.error = (e && e.message) || 'Live search failed';
    }
  }
}

function agentRenderIntoHosts(){
  const html = agentQueueHtml();
  const host = document.getElementById('agentQueueHost');
  if(host) host.innerHTML = html;
  const disc = document.getElementById('agentQueueDiscovery');
  if(disc) disc.innerHTML = html;
}

async function agentRunNext(personId, n){
  personId = personId || (typeof activePlanPersonId !== 'undefined' ? activePlanPersonId : '') || '';
  if(!personId){
    showToast('Choose a person on the Research Plan first');
    return;
  }
  if(AGENT.running){
    showToast('Agent already running');
    return;
  }
  n = n || 3;
  AGENT.n = n;
  AGENT.personId = personId;
  const packed = agentEnsureSession(personId);
  if(!packed) return;

  AGENT.steps = agentNextSources(personId, n);
  if(!AGENT.steps.length){
    showToast('Nothing left in the checklist for this person');
    agentRenderIntoHosts();
    return;
  }

  AGENT.running = true;
  agentRenderIntoHosts();
  if(typeof switchView === 'function') switchView('toolkit');
  // Ensure discovery shell exists for hit insight
  if(typeof runDiscovery === 'function' && !document.getElementById('liveResults')){
    runDiscovery(personId);
  } else if(typeof discoverPerson === 'function' && !document.getElementById('hitInsight')){
    // soft: fill only
  }

  for(let i = 0; i < AGENT.steps.length; i++){
    const step = AGENT.steps[i];
    if(step.status === 'needs-review') continue;
    await agentRunStep(step, packed);
    agentRenderIntoHosts();
  }
  AGENT.running = false;
  if(typeof caseAppendTimeline === 'function'){
    caseAppendTimeline(personId, {
      kind: 'agent-run',
      text: 'Queued ' + AGENT.steps.length + ' research steps'
    });
    if(typeof saveData === 'function') saveData();
  }
  showToast('Agent paused for your review');
  agentRenderIntoHosts();
  if(typeof updateDiscoveryBadge === 'function') updateDiscoveryBadge();
}

function agentResolveStep(i, action){
  const step = AGENT.steps[i];
  if(!step) return;
  const personId = AGENT.personId;
  const sourceId = step.sourceId;

  if(action === 'skip'){
    step.status = 'skipped';
    step.resolveAction = 'skip';
    if(typeof caseAppendTimeline === 'function' && personId){
      caseAppendTimeline(personId, { kind: 'agent-skip', text: 'Skipped ' + step.label, sourceId: sourceId });
      saveData();
    }
    agentRenderIntoHosts();
    return;
  }

  if(action === 'enslaver'){
    if(step.kind === 'dna'){
      showToast('DNA step has no enslaver lead — use Open DNA workspace');
      return;
    }
    const surname = (step.label || '').split(/[,—-]/)[0].trim().split(/\s+/).pop();
    const name = surname || (typeof activeSession === 'function' && activeSession() && activeSession().surname) || '';
    if(name && typeof linkPlanCandidate === 'function' && personId){
      linkPlanCandidate(personId, name, {
        note: 'From agent review of ' + step.label,
        status: 'untested'
      });
      caseAppendTimeline(personId, {
        kind: 'enslaver-lead',
        text: 'Added enslaver lead “' + name + '” from ' + step.label + ' (lead, not proof)',
        sourceId: sourceId
      });
      saveData();
      showToast('Enslaver lead added — still untested');
    } else if(typeof addEnslaverCandidate === 'function'){
      addEnslaverCandidate(name || step.label, 'From agent review');
    } else {
      showToast('Could not add enslaver lead');
    }
    step.status = 'done';
    step.resolveAction = 'enslaver';
    agentRenderIntoHosts();
    if(typeof renderPlanView === 'function') renderPlanView();
    return;
  }

  if(action === 'found' || action === 'nothing'){
    // Ensure QUICKLINK_CACHE has this source for resolveSource
    if(sourceId && typeof QUICKLINK_CACHE !== 'undefined' && !QUICKLINK_CACHE[sourceId]){
      const src = typeof SOURCE_REGISTRY !== 'undefined' && SOURCE_REGISTRY.find(s => s.id === sourceId);
      if(src){
        const packed = agentEnsureSession(personId);
        const url = step.url || (src && typeof src.url === 'function' && packed ? src.url(packed.ctx) : (src.url || ''));
        QUICKLINK_CACHE[sourceId] = {
          id: sourceId,
          label: step.label || src.label,
          url: url,
          type: src.type || 'Other',
          note: src.note || ''
        };
      } else if(sourceId.indexOf('live:') === 0){
        QUICKLINK_CACHE[sourceId] = {
          id: sourceId,
          label: step.label,
          url: step.url || '',
          type: 'Other',
          note: 'Live search'
        };
      }
    }
    if(sourceId && typeof resolveSource === 'function' && QUICKLINK_CACHE[sourceId]){
      resolveSource(sourceId, action === 'found' ? 'found' : 'nothing');
    } else if(action === 'nothing' && personId){
      // Fallback dead-end log without cache
      const draft = typeof draftLogPrefill === 'function'
        ? draftLogPrefill({
            sourceName: step.label,
            citation: step.url || '',
            personId: personId,
            status: 'nothing'
          })
        : null;
      if(draft){
        STATE.logs.push({
          id: uid(),
          date: todayStr(),
          personId: personId,
          type: 'Other',
          status: 'dead-end',
          sourceName: step.label,
          citation: step.url || '',
          findings: draft.findings,
          nextSteps: draft.nextSteps || '',
          supports: [],
          confidence: 'speculative',
          updatedAt: Date.now()
        });
        saveData();
      }
    }
    if(typeof caseAppendTimeline === 'function' && personId){
      caseAppendTimeline(personId, {
        kind: action === 'found' ? 'agent-found' : 'agent-dead-end',
        text: (action === 'found' ? 'Found signal in ' : 'Dead end: ') + step.label,
        sourceId: sourceId
      });
      saveData();
    }
    step.status = 'done';
    step.resolveAction = action;
    agentRenderIntoHosts();
    if(typeof updateDiscoveryBadge === 'function') updateDiscoveryBadge();
    if(typeof renderPlanView === 'function' && document.getElementById('planContent')){
      // keep plan case coverage fresh when user returns
    }
    return;
  }
}

// Hook companion import → advance awaiting-capture steps
function agentOnCompanionImport(count){
  let changed = false;
  AGENT.steps.forEach(s => {
    if(s.status === 'awaiting-capture'){
      s.status = 'needs-review';
      s.note = (s.note ? s.note + ' · ' : '') + 'Companion imported ' + (count || 0) + ' hits — resolve this step';
      changed = true;
    }
  });
  if(changed) agentRenderIntoHosts();
}
