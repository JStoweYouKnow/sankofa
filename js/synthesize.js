// ---------------------------------------------------------------
 // Bridge synthesis (Phase 4, rule-based)
 // After named U.S./Caribbean sources exist: draft what's known vs
 // gaps, ethnonym/voyage hypotheses, and DNA questions. No LLM.
 // Loaded after africa.js + plan.js.
 // ---------------------------------------------------------------

function synthEsc(str){
  if(typeof esc === 'function') return esc(str);
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function synthPersonLogs(personId){
  return (STATE.logs || []).filter(l => l.personId === personId);
}

function synthDetectEthnonyms(text){
  const t = String(text || '');
  if(!t.trim() || typeof ETHNONYMS === 'undefined') return [];
  const found = [];
  ETHNONYMS.forEach(e=>{
    const hit = (e.aliases || []).some(a=>{
      const re = new RegExp('\\b' + String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      return re.test(t);
    });
    if(hit) found.push(e);
  });
  return found;
}

function synthReadiness(personId){
  const person = STATE.people.find(p => p.id === personId);
  if(!person) return { ready: false, reason: 'Person not found.' };
  const plan = STATE.plans[personId];
  const logs = synthPersonLogs(personId);
  const confirmed = logs.filter(l => l.status === 'confirmed');
  const namedSupport = confirmed.filter(l =>
    (l.supports || []).includes('name') || (l.supports || []).includes('location')
  );
  const confirmDone = !!(plan && plan.steps && plan.steps.confirm && plan.steps.confirm.done);
  const promising = logs.filter(l => l.status === 'promising' || l.status === 'found');

  if(confirmDone || namedSupport.length > 0 || confirmed.length > 0){
    return {
      ready: true,
      reason: confirmDone
        ? 'Confirm step is marked done.'
        : (namedSupport.length
          ? 'You have confirmed source(s) tagging name or place.'
          : 'You have at least one confirmed log entry.')
    };
  }
  if(promising.length >= 2 && plan && plan.steps && plan.steps.anchor && plan.steps.anchor.done){
    return {
      ready: true,
      reason: '1870 anchor done and multiple promising hits — Bridge can start as a hypothesis, not a conclusion.'
    };
  }
  return {
    ready: false,
    reason: 'Confirm at least one named source (or finish the Confirm plan step) before treating Africa claims as more than speculation.'
  };
}

/**
 * Africa ethnonym / voyage “agent” proposals require paper-trail readiness
 * plus a case-file foothold (lead, coverage, or candidate). DNA questions
 * remain available earlier.
 */
function synthAfricaAgentReady(personId){
  const paper = synthReadiness(personId);
  if(!paper.ready){
    return { ready: false, reason: paper.reason, paperReady: false };
  }
  const plan = STATE.plans[personId];
  const kase = plan && plan.case;
  const hasHyp = !!(kase && (kase.hypotheses || []).some(h =>
    h.status === 'lead' || h.status === 'hypothesis' || h.status === 'confirmed' || h.status === 'ruled_out'
  ));
  const hasCand = !!(plan && (plan.candidates || []).length);
  const cov = typeof caseCoverageSummary === 'function' ? caseCoverageSummary(personId) : { total: 0 };
  const hasCoverage = !!(cov && cov.total >= 1);
  if(hasHyp || hasCand || hasCoverage){
    return { ready: true, reason: paper.reason, paperReady: true };
  }
  return {
    ready: false,
    paperReady: true,
    reason: 'Add an enslaver lead or Discovery coverage to the case file before treating Africa ethnonyms as more than speculation.'
  };
}

/**
 * @returns {{
 *   ready: boolean,
 *   readinessNote: string,
 *   narrative: string,
 *   known: string[],
 *   gaps: string[],
 *   hypotheses: Array<{ label: string, detail: string, confidence: string, ethnonymId?: string }>,
 *   dnaQuestions: string[],
 *   nextActions: Array<{ label: string, kind: string }>
 * }}
 */
function synthesizeBridge(personId){
  const person = STATE.people.find(p => p.id === personId);
  const empty = {
    ready: false,
    readinessNote: '',
    narrative: '',
    known: [],
    gaps: [],
    hypotheses: [],
    dnaQuestions: [],
    nextActions: [{ label: 'Open plan', kind: 'open-plan' }]
  };
  if(!person) return empty;

  ensurePersonAfrica(person);
  const a = person.africa;
  const d = person.dna;
  const plan = STATE.plans[personId] || null;
  const logs = synthPersonLogs(personId);
  const readiness = synthReadiness(personId);
  const africaReady = typeof synthAfricaAgentReady === 'function'
    ? synthAfricaAgentReady(personId)
    : readiness;
  const facts = typeof evidencedFacts === 'function' ? evidencedFacts(personId) : [];
  const confirmed = logs.filter(l => l.status === 'confirmed');
  const eth = typeof ethnonymById === 'function' ? ethnonymById(a.ethnonymId) : null;

  const known = [];
  known.push(person.name + (person.birthYear ? ', born ' + person.birthYear : '')
    + (person.birthplace ? ', ' + person.birthplace : '') + '.');
  if(plan && plan.state){
    known.push('Research place pinned as '
      + [plan.county, plan.state].filter(Boolean).join(', ')
      + (plan.fieldOffice ? ' (Bureau office: ' + plan.fieldOffice + ')' : '') + '.');
  }
  if(person.enslaverSurname){
    known.push('Associated enslaver surname on the card: ' + person.enslaverSurname + ' (lead, not proof).');
  }
  if(plan && plan.candidates && plan.candidates.length){
    const top = plan.candidates.filter(c => c.status === 'confirmed' || c.status === 'promising');
    const list = (top.length ? top : plan.candidates).slice(0, 3).map(c => c.name + (c.status ? ' [' + c.status + ']' : ''));
    known.push('Enslaver candidates on the plan: ' + list.join('; ') + '.');
  }
  if(facts.length && typeof FACT_LABELS !== 'undefined'){
    known.push('Confirmed evidence tags: ' + facts.map(f => FACT_LABELS[f] || f).join(', ') + '.');
  }
  if(confirmed.length){
    known.push(confirmed.length + ' confirmed log entr'
      + (confirmed.length === 1 ? 'y' : 'ies')
      + ' — e.g. “' + (confirmed[0].sourceName || 'source') + '”.');
  }
  if(a.africanBornMention) known.push('A record is marked as calling them African-born.');
  if(a.africanGivenName) known.push('African given name on file: ' + a.africanGivenName + '.');
  if(eth) known.push('Ethnonym selected: ' + eth.label + ' → ' + eth.region + '.');
  if(a.regionClaim) known.push('Region claim: ' + a.regionClaim
    + ' (' + ((typeof CONFIDENCE_LEVELS !== 'undefined' && CONFIDENCE_LEVELS[a.regionConfidence])
      ? CONFIDENCE_LEVELS[a.regionConfidence].label : a.regionConfidence) + ').');
  if(a.embarkationCoast || a.disembarkationPort || a.embarkationDecade || a.shipName){
    known.push('Voyage clues: '
      + [a.embarkationCoast && ('coast ' + a.embarkationCoast),
         a.embarkationDecade && ('decade ' + a.embarkationDecade),
         a.disembarkationPort && ('landed ' + a.disembarkationPort),
         a.shipName && ('ship ' + a.shipName)].filter(Boolean).join('; ') + '.');
  }
  if(d.company){
    known.push('DNA: ' + d.company + (d.testedYear ? ' (' + d.testedYear + ')' : '')
      + (d.hypothesizedRegion ? ' · hypothesized region ' + d.hypothesizedRegion : '') + '.');
  }
  if(d.ethnicityNotes) known.push('Ethnicity notes on file (see DNA workspace).');
  if(a.oralTradition) known.push('Oral tradition about Africa is recorded on the person.');

  const gaps = [];
  if(!confirmed.length) gaps.push('No confirmed log entry yet that names this person.');
  if(!(plan && plan.steps && plan.steps.anchor && plan.steps.anchor.done)){
    gaps.push('1870 / anchor census step is not marked done.');
  }
  if(!person.enslaverSurname && !(plan && plan.candidates && plan.candidates.length)){
    gaps.push('No enslaver candidate to chase into estate papers (a common path to African-born mentions).');
  }
  if(!d.company) gaps.push('No autosomal DNA company / ethnicity estimate entered.');
  if(!d.keyMatches) gaps.push('No African or diaspora DNA matches noted yet.');
  if(!a.ethnonymId && !a.regionClaim && !d.hypothesizedRegion){
    gaps.push('No region or ethnonym hypothesis yet — keep this speculative.');
  }
  if(!a.africanGivenName) gaps.push('No African given name from a register (African Origins / Liberated Africans need a name).');
  if(!a.embarkationCoast && !a.disembarkationPort){
    gaps.push('No embarkation coast or landing port to filter Slave Voyages.');
  }
  if(!a.oralTradition) gaps.push('No Africa-related oral tradition captured yet.');

  // Hypotheses from structured fields + text mining
  const hypotheses = [];
  const seenEth = new Set();
  if(eth){
    seenEth.add(eth.id);
    hypotheses.push({
      label: eth.label,
      detail: eth.note,
      confidence: a.regionConfidence || 'oral',
      ethnonymId: eth.id
    });
  }
  if(d.hypothesizedRegion){
    hypotheses.push({
      label: 'DNA region: ' + d.hypothesizedRegion,
      detail: 'Ethnicity estimates are continental/regional, not a village. Use them to prioritize coasts in Slave Voyages, then look for documents.',
      confidence: 'dna-supported'
    });
  }
  if(a.regionClaim && (!eth || a.regionClaim !== eth.region)){
    hypotheses.push({
      label: 'Claimed region: ' + a.regionClaim,
      detail: 'Tagged ' + (a.regionConfidence || 'speculative') + ' — keep testing against DNA and voyage patterns.',
      confidence: a.regionConfidence || 'speculative'
    });
  }

  const corpus = [
    a.oralTradition,
    d.ethnicityNotes,
    d.keyMatches,
    person.notes,
    ...logs.map(l => [l.findings, l.nextSteps, l.sourceName].filter(Boolean).join(' '))
  ].join('\n');
  // Ethnonym mining from notes is agentic — only when case + paper trail pass
  if(africaReady.ready){
    synthDetectEthnonyms(corpus).forEach(e=>{
      if(seenEth.has(e.id)) return;
      seenEth.add(e.id);
      hypotheses.push({
        label: 'Possible ethnonym in your notes: ' + e.label,
        detail: e.note + ' Region: ' + e.region + '.',
        confidence: 'speculative',
        ethnonymId: e.id
      });
    });
  }

  // DNA questions (always available — not gated)
  const dnaQuestions = [];
  if(!d.company){
    dnaQuestions.push('Take an autosomal test (AncestryDNA, 23andMe, MyHeritage, or FTDNA) and enter the company + ethnicity breakdown on the person card.');
  } else {
    if(!d.ethnicityNotes){
      dnaQuestions.push('Paste the ethnicity percentages that matter (especially West / Central African countries) into Ethnicity estimate notes.');
    }
    if(!d.hypothesizedRegion){
      dnaQuestions.push('From the breakdown, write one hypothesized African region (e.g. Bight of Biafra / SE Nigeria) — mark confidence DNA-supported, not documentary.');
    }
    if(!d.keyMatches){
      dnaQuestions.push('Import or list African / diaspora DNA matches (CSV: name, company, ethnicity notes) — shared matches often beat raw percentages.');
    }
    if(!d.sharedSegments){
      dnaQuestions.push('Optional: note clusters or DNAPainter segments that seem to ride with this ancestral line.');
    }
  }
  dnaQuestions.push('Ask relatives: any story of an African-born ancestor, an ethnonym, a ship, or a port? Capture it under Oral tradition — confidence Oral.');
  if(a.africanGivenName){
    dnaQuestions.push('Search African Origins and Liberated Africans for “' + a.africanGivenName + '”, then log hits or dead ends.');
  } else {
    dnaQuestions.push('Watch estate papers, Bank registers, and baptism records for an African given name — that unlocks African Origins.');
  }

  // Narrative
  let narrative;
  if(!readiness.ready){
    narrative = 'Bridge to Africa is still early for ' + person.name
      + '. Push the American or Caribbean paper trail until you have a named confirming source; use DNA and oral tradition as hypotheses only. '
      + readiness.reason;
  } else if(!africaReady.ready){
    narrative = 'Paper trail is ready for ' + person.name
      + ', but the emancipation case file still needs a foothold (enslaver lead or Discovery coverage) before ethnonym proposals. '
      + africaReady.reason
      + ' DNA questions below remain fair game.';
  } else {
    const regionBit = a.regionClaim || d.hypothesizedRegion || (eth && eth.region)
      || 'no region claim yet';
    narrative = 'Working synthesis for ' + person.name + ': the U.S./Caribbean trail '
      + (confirmed.length ? 'has confirming evidence' : 'has promising leads')
      + '. Best current Africa hypothesis: ' + regionBit
      + ' (confidence: '
      + (a.regionConfidence || (d.hypothesizedRegion ? 'dna-supported' : 'speculative'))
      + '). Surname search will not usually reach a village — aim for a testable region, then Slave Voyages / African Origins, and keep logging honesty tags.';
  }

  const nextActions = [];
  if(!readiness.ready){
    nextActions.push({ label: 'Finish Confirm step / log a named source', kind: 'open-plan' });
    nextActions.push({ label: 'Open DNA workspace', kind: 'edit-person-dna' });
    nextActions.push({ label: 'Search Discovery', kind: 'discover' });
  } else if(!africaReady.ready){
    nextActions.push({ label: 'Add enslaver lead on plan', kind: 'open-plan' });
    nextActions.push({ label: 'Open DNA workspace', kind: 'edit-person-dna' });
  } else {
    if(!d.company || !d.keyMatches) nextActions.push({ label: 'Open DNA workspace', kind: 'edit-person-dna' });
    nextActions.push({ label: 'Open Slave Voyages', kind: 'voyages' });
    if(a.africanGivenName || hypotheses.some(h => h.ethnonymId)){
      nextActions.push({ label: 'Search African Origins', kind: 'origins' });
    }
    nextActions.push({ label: 'Edit Africa fields', kind: 'edit-person' });
  }

  return {
    ready: readiness.ready,
    africaAgentReady: !!africaReady.ready,
    readinessNote: !readiness.ready ? readiness.reason : (!africaReady.ready ? africaReady.reason : readiness.reason),
    narrative,
    known,
    gaps: gaps.slice(0, 8),
    hypotheses: hypotheses.slice(0, 6),
    dnaQuestions: dnaQuestions.slice(0, 6),
    nextActions
  };
}

function synthesizeBridgeHtml(personId){
  let s = synthesizeBridge(personId);
  const person = STATE.people.find(p => p.id === personId);
  if(!person) return '';
  // Session AI polish cache (narrative + questions only)
  if(person._synthCache && person._synthCache.narrative){
    s = Object.assign({}, s, {
      narrative: person._synthCache.narrative,
      dnaQuestions: person._synthCache.dnaQuestions || s.dnaQuestions,
      _llm: !!person._synthCache._llm
    });
  }

  const known = s.known.map(x => `<li>${synthEsc(x)}</li>`).join('');
  const gaps = s.gaps.map(x => `<li>${synthEsc(x)}</li>`).join('');
  const hyps = s.hypotheses.length
    ? s.hypotheses.map(h=>{
        const canApply = s.africaAgentReady !== false && h.ethnonymId
          && (!person.africa || person.africa.ethnonymId !== h.ethnonymId);
        const apply = canApply
          ? `<button type="button" class="btn btn-ghost btn-small" data-synth-eth="${synthEsc(h.ethnonymId)}" data-synth-person="${synthEsc(personId)}">Use on card</button>`
          : (h.ethnonymId && s.africaAgentReady === false
            ? `<span class="field-hint">Ethnonym apply gated until case is ready</span>`
            : '');
        const conf = (typeof confidenceChip === 'function')
          ? confidenceChip(h.confidence)
          : `<span class="confidence-chip">${synthEsc(h.confidence)}</span>`;
        const trust = typeof trustBadge === 'function'
          ? trustBadge(typeof trustFromConfidence === 'function' ? trustFromConfidence(h.confidence) : 'lead')
          : '';
        return `<div class="synth-hyp">
          <div class="synth-hyp-head">${trust}${conf} <strong>${synthEsc(h.label)}</strong> ${apply}</div>
          <div class="synth-hyp-detail">${synthEsc(h.detail)}</div>
        </div>`;
      }).join('')
    : `<div class="field-hint">No ethnonym or region hypothesis yet — DNA notes and oral tradition will surface here when present.</div>`;

  const dnaQ = s.dnaQuestions.map(x => `<li>${synthEsc(x)}</li>`).join('');
  const actions = s.nextActions.map(a=>
    `<button type="button" class="btn btn-small${a.kind === 'edit-person' || a.kind === 'edit-person-dna' || a.kind === 'discover' ? ' btn-ghost' : ''}" data-synth-act="${synthEsc(a.kind)}" data-synth-person="${synthEsc(personId)}">${synthEsc(a.label)}</button>`
  ).join('');
  const aiBtn = typeof llmEnhanceBtnHtml === 'function'
    ? llmEnhanceBtnHtml('synth', personId)
    : '';

  return `<div class="synth-panel ${s.ready ? 'synth-ready' : 'synth-early'}${s.africaAgentReady ? ' synth-africa-ready' : ''}${s._llm ? ' synth-ai' : ''}">
    <div class="synth-top">
      <div class="synth-label">Bridge synthesis · ${synthEsc(person.name)}</div>
      ${typeof trustBadge === 'function' ? trustBadge(s.africaAgentReady ? 'hypothesis' : 'lead', {
        label: s.africaAgentReady ? 'Africa agent ready' : 'DNA only · case gate'
      }) : ''}
      ${s._llm ? '<span class="ai-pill">AI polished</span>' : ''}
      ${aiBtn}
    </div>
    <p class="synth-narrative">${synthEsc(s.narrative)}</p>
    <div class="synth-note">${synthEsc(s.readinessNote)}</div>
    <div class="synth-columns">
      <div>
        <div class="synth-col-title">Known</div>
        <ul class="synth-list">${known || '<li>Only the name on the tree so far.</li>'}</ul>
      </div>
      <div>
        <div class="synth-col-title">Gaps</div>
        <ul class="synth-list">${gaps || '<li>No major gaps flagged.</li>'}</ul>
      </div>
    </div>
    <div class="synth-col-title">Hypotheses</div>
    <div class="synth-hyps">${hyps}</div>
    <div class="synth-col-title">DNA &amp; oral questions</div>
    <ul class="synth-list">${dnaQ}</ul>
    <div class="synth-actions">${actions}
      <button type="button" class="btn btn-ghost btn-small" data-synth-act="save-notes" data-synth-person="${synthEsc(personId)}">Save synthesis into notes</button>
    </div>
  </div>`;
}

function runSynthAction(personId, kind){
  const person = STATE.people.find(p => p.id === personId);
  if(!person) return;
  ensurePersonAfrica(person);

  if(kind === 'open-plan'){
    if(typeof openPlanForPerson === 'function') openPlanForPerson(personId);
    return;
  }
  if(kind === 'discover'){
    if(typeof discoverPerson === 'function') discoverPerson(personId);
    return;
  }
  if(kind === 'edit-person' || kind === 'edit-person-dna'){
    if(kind === 'edit-person-dna' && typeof openDnaWorkspace === 'function'){
      openDnaWorkspace(personId);
      return;
    }
    openPersonForm(personId);
    setTimeout(()=>{
      if(typeof setFormSection === 'function'){
        setFormSection('dnaSection', true);
        setFormSection('africaSection', true);
      }
    }, 50);
    return;
  }
  if(kind === 'voyages'){
    const url = typeof slaveVoyagesDatabaseUrl === 'function'
      ? slaveVoyagesDatabaseUrl({
          embarkationCoast: person.africa.embarkationCoast,
          disembarkationPort: person.africa.disembarkationPort,
          embarkationDecade: person.africa.embarkationDecade,
          shipName: person.africa.shipName
        })
      : 'https://www.slavevoyages.org/voyage/database';
    window.open(url, '_blank', 'noopener');
    return;
  }
  if(kind === 'origins'){
    const url = typeof africanOriginsUrl === 'function'
      ? africanOriginsUrl(person.africa.africanGivenName)
      : 'https://www.slavevoyages.org/resources/african-origins';
    window.open(url, '_blank', 'noopener');
    return;
  }
  if(kind === 'save-notes'){
    const s = synthesizeBridge(personId);
    const block = [
      '— Bridge synthesis (' + new Date().toISOString().slice(0, 10) + ') —',
      s.narrative,
      '',
      'Known:',
      ...s.known.map(x => '• ' + x),
      '',
      'Gaps:',
      ...s.gaps.map(x => '• ' + x),
      '',
      'Hypotheses:',
      ...s.hypotheses.map(h => '• [' + h.confidence + '] ' + h.label + ' — ' + h.detail),
      '',
      'DNA questions:',
      ...s.dnaQuestions.map(x => '• ' + x)
    ].join('\n');
    const prev = (person.notes || '').trim();
    const marker = '— Bridge synthesis (';
    let next;
    if(prev.includes(marker)){
      const start = prev.lastIndexOf(marker);
      next = (prev.slice(0, start).trim() + '\n\n' + block).trim();
    } else {
      next = (prev ? prev + '\n\n' : '') + block;
    }
    person.notes = next;
    person.updatedAt = Date.now();
    saveData();
    if(typeof renderAll === 'function') renderAll();
    showToast('Synthesis saved to ' + person.name + '\'s notes');
  }
}

function applySynthEthnonym(personId, ethnonymId){
  const person = STATE.people.find(p => p.id === personId);
  if(!person || !ethnonymId) return;
  const gate = typeof synthAfricaAgentReady === 'function' ? synthAfricaAgentReady(personId) : { ready: true };
  if(!gate.ready){
    if(typeof showToast === 'function') showToast(gate.reason || 'Case not ready for ethnonym apply');
    return;
  }
  ensurePersonAfrica(person);
  person.africa.ethnonymId = ethnonymId;
  const eth = ethnonymById(ethnonymId);
  if(eth && !person.africa.regionClaim) person.africa.regionClaim = eth.region;
  if(!person.africa.regionConfidence || person.africa.regionConfidence === 'speculative'){
    person.africa.regionConfidence = 'oral';
  }
  // AI / one-click apply can never promote to documentary/confirmed
  if(typeof trustClampConfidence === 'function'){
    person.africa.regionConfidence = trustClampConfidence(person.africa.regionConfidence);
  }
  person.updatedAt = Date.now();
  saveData();
  if(typeof renderPlanView === 'function') renderPlanView();
  if(typeof renderTree === 'function') renderTree();
  showToast('Applied ' + (eth ? eth.label : ethnonymId) + ' — still a hypothesis');
}

document.addEventListener('click', function(e){
  const act = e.target.closest('[data-synth-act]');
  if(act){
    e.preventDefault();
    runSynthAction(act.dataset.synthPerson || '', act.dataset.synthAct);
    return;
  }
  const eth = e.target.closest('[data-synth-eth]');
  if(eth){
    e.preventDefault();
    applySynthEthnonym(eth.dataset.synthPerson || '', eth.dataset.synthEth);
  }
});
