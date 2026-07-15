// ---------------------------------------------------------------
 // Research Coach (Phase 1, rule-based)
 // Turns Plan step + place + session coverage into one concrete next
 // action — headline, why, and a primary CTA. No LLM; same interface
 // can later wrap a model. Loaded after plan.js.
 // ---------------------------------------------------------------

// Preferred order when suggesting the next place-checklist collection.
const COACH_CHECKLIST_PRIORITY = [
  'freedmans-bank',
  'nmaahc-fb-portal',
  'mapping-fb',
  'nara-catalog',
  'nc-cohabitation',
  'usct-soldiers',
  'nara-pensions',
  'southern-claims',
  'chronicling-america',
  'freedom-on-the-move',
  'last-seen'
];

function coachPerson(personId){
  return STATE.people.find(p => p.id === personId) || null;
}

function coachSessionFor(person, plan){
  if(typeof personSearchCtx !== 'function' || typeof sessionKey !== 'function') return null;
  const ctx = personSearchCtx(person, plan);
  if(!ctx.surname) return null;
  return STATE.sessions[sessionKey(ctx)] || null;
}

function coachOpenedUnresolved(sess){
  if(!sess || !sess.checks) return null;
  for(const id of Object.keys(sess.checks)){
    if(sess.checks[id].status === 'opened'){
      const card = (typeof QUICKLINK_CACHE !== 'undefined' && QUICKLINK_CACHE[id])
        || (typeof SOURCE_REGISTRY !== 'undefined' && SOURCE_REGISTRY.find(s => s.id === id))
        || null;
      return { id, label: (card && card.label) || id };
    }
  }
  return null;
}

function coachNextChecklistItem(person, plan){
  if(typeof planChecklistLinks !== 'function') return null;
  const ctx = personSearchCtx(person, plan);
  const sources = planChecklistLinks(ctx).slice();
  sources.sort((a, b) => {
    const ia = COACH_CHECKLIST_PRIORITY.indexOf(a.id);
    const ib = COACH_CHECKLIST_PRIORITY.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const sess = coachSessionFor(person, plan);
  const checked = (plan.steps.records && plan.steps.records.checked) || {};
  for(const src of sources){
    const check = sess && sess.checks[src.id];
    if(check && (check.status === 'found' || check.status === 'nothing')) continue;
    if(checked[src.id]) continue;
    return src;
  }
  return null;
}

function coachSourceUrl(sourceId, person, plan){
  const ctx = personSearchCtx(person, plan);
  const src = SOURCE_REGISTRY.find(s => s.id === sourceId);
  if(!src) return '';
  return typeof src.url === 'function' ? src.url(ctx) : (src.url || '');
}

function coachForPerson(personId){
  return coachAttachTrust(coachForPersonCore(personId));
}

/**
 * @returns {{
 *   key: string,
 *   chip: string,
 *   headline: string,
 *   why: string,
 *   primary: { label: string, kind: string, sourceId?: string, url?: string, candidateName?: string },
 *   secondary?: { label: string, kind: string }
 * }}
 */
function coachForPersonCore(personId){
  if(!personId){
    return {
      key: 'add',
      chip: 'Add a person',
      headline: 'Add the earliest ancestor you can name',
      why: 'The coach works one person at a time — start with a name, rough year, and any place you know. Or paste a family story and review the drafts.',
      primary: { label: '+ Add a person', kind: 'add-person' },
      secondary: { label: 'Start from a story', kind: 'story' }
    };
  }

  const person = coachPerson(personId);
  if(!person){
    return {
      key: 'add',
      chip: 'Add a person',
      headline: 'Add the earliest ancestor you can name',
      why: 'That person isn’t in the tree anymore. Add someone to continue.',
      primary: { label: '+ Add a person', kind: 'add-person' },
      secondary: { label: 'Start from a story', kind: 'story' }
    };
  }

  const first = (person.name || '').trim();
  if(!first || first.toLowerCase() === 'unknown'){
    return {
      key: 'name',
      chip: 'Add a name',
      headline: 'Give this person a name (even a surname)',
      why: 'Discovery and the plan need a surname to build archive links.',
      primary: { label: 'Edit person', kind: 'edit-person' },
      secondary: { label: 'Open plan', kind: 'open-plan' }
    };
  }

  if(!STATE.plans[personId]){
    return {
      key: 'start',
      chip: 'Start plan',
      headline: 'Start a research plan for ' + person.name,
      why: 'The plan is the Field Guide method as six steps — the coach will pick the next concrete action from there.',
      primary: { label: 'Start their plan', kind: 'open-plan' }
    };
  }

  const plan = ensurePlan(personId);
  const step = PLAN_STEPS.find(s => !(plan.steps[s.key] && plan.steps[s.key].done));

  if(!step){
    return {
      key: 'done',
      chip: 'Plan complete',
      headline: 'Plan complete — keep confirming sources',
      why: 'Every new hit still belongs in the Research Log. Confirm facts on the person card as you lock them down.',
      primary: { label: 'Open research log', kind: 'open-log' },
      secondary: { label: 'Review plan', kind: 'open-plan' }
    };
  }

  // Opened-but-unresolved collections beat starting a new search.
  const sess = coachSessionFor(person, plan);
  const opened = coachOpenedUnresolved(sess);
  if(opened && (step.key === 'anchor' || step.key === 'records' || step.key === 'enslaver' || step.key === 'confirm')){
    return {
      key: step.key,
      chip: 'Resolve: ' + opened.label,
      headline: 'Finish the collection you already opened',
      why: 'You opened “' + opened.label + '” but haven’t marked Found something or Nothing there. Closing it keeps the checklist honest.',
      primary: { label: 'Return to Discovery', kind: 'discover' },
      secondary: { label: 'Open plan', kind: 'open-plan' }
    };
  }

  // Case-file hypotheses (leads) beat generic checklist copy when we’re
  // in the emancipation bridge steps — still never invents citations.
  if(typeof ensureCase === 'function' && (step.key === 'records' || step.key === 'enslaver' || step.key === 'confirm')){
    const openHyp = typeof caseOpenHypothesis === 'function'
      ? caseOpenHypothesis(personId)
      : null;
    if(openHyp){
      const candName = (openHyp.enslaverName || '').trim();
      const hasCand = candName && plan.candidates.some(c =>
        (c.name || '').toLowerCase() === candName.toLowerCase()
      );
      if(candName && !hasCand){
        return {
          key: step.key,
          chip: 'Case: add candidate',
          headline: 'File “' + candName + '” as an enslaver candidate to test',
          why: openHyp.text + ' Status on the case: ' + (CASE_STATUSES[openHyp.status] || openHyp.status) + '.',
          primary: { label: 'Add candidate & open plan', kind: 'add-hint-candidate', candidateName: candName },
          secondary: { label: 'Find earliest mentions', kind: 'earliest' }
        };
      }
      if(candName){
        const untested = plan.candidates.find(c =>
          (c.name || '').toLowerCase() === candName.toLowerCase() &&
          (!c.status || c.status === 'untested')
        );
        if(untested || openHyp.status === 'lead' || openHyp.status === 'hypothesis'){
          const schedUrl = typeof familySearchCollectionUrl === 'function'
            ? familySearchCollectionUrl({
                surname: candName.split(/\s+/).pop() || '',
                county: plan.county,
                state: plan.state
              }, '3161105')
            : '';
          return {
            key: step.key,
            chip: 'Case: test lead',
            headline: 'Test case lead “' + candName + '”',
            why: openHyp.text,
            primary: schedUrl
              ? { label: 'Open 1860 slave schedule', kind: 'open-url', url: schedUrl }
              : { label: 'Find earliest mentions', kind: 'earliest' },
            secondary: { label: 'Open case on plan', kind: 'open-plan' }
          };
        }
      } else {
        return {
          key: step.key,
          chip: 'Case: test hypothesis',
          headline: 'Work an open case hypothesis',
          why: openHyp.text,
          primary: { label: 'Find earliest mentions', kind: 'earliest' },
          secondary: { label: 'Open case on plan', kind: 'open-plan' }
        };
      }
    }
  }

  if(step.key === 'anchor'){
    const carib = typeof isCaribbean === 'function' && isCaribbean(personSearchCtx(person, plan));
    if(carib){
      return {
        key: 'anchor',
        chip: 'Next: Caribbean anchor',
        headline: 'Anchor with Caribbean registers, not the 1870 U.S. census',
        why: 'British Caribbean families are named in slave registers and parish baptisms. Open Discovery for island collections, then log what you find.',
        primary: { label: 'Search Discovery', kind: 'discover' },
        secondary: { label: 'Open plan step', kind: 'open-plan' }
      };
    }
    if(!plan.state && !(person.birthplace || '').trim()){
      return {
        key: 'anchor',
        chip: 'Next: Set a place',
        headline: 'Add a state or county before the 1870 search',
        why: 'Census links are much sharper with a place. Set it on the plan (or birthplace on the person), then search.',
        primary: { label: 'Set place on plan', kind: 'open-plan' }
      };
    }
    const url = coachSourceUrl('census-1870', person, plan);
    return {
      key: 'anchor',
      chip: 'Next: 1870 census',
      headline: 'Find ' + person.name + ' in the 1870 census',
      why: '1870 is the first federal census naming formerly enslaved people. Fix the household, county, and surname before chasing earlier records.',
      primary: { label: 'Search Discovery', kind: 'discover' },
      secondary: url ? { label: 'Open 1870 census', kind: 'open-url', url } : { label: 'Open plan', kind: 'open-plan' }
    };
  }

  if(step.key === 'county'){
    if(!plan.state){
      return {
        key: 'county',
        chip: 'Next: Set state',
        headline: 'Set the state (and county if you know it)',
        why: 'Bureau records are filed by field office covering a county — place comes before name searches.',
        primary: { label: 'Set place on plan', kind: 'open-plan' }
      };
    }
    if(!plan.fieldOffice){
      return {
        key: 'county',
        chip: 'Next: Field office',
        headline: 'Find the Freedmen\'s Bureau field office for ' + (plan.county || plan.state),
        why: 'Use the map, then type the office name on the plan so later searches stay oriented.',
        primary: { label: 'Open field-office map', kind: 'open-url', url: 'https://www.mappingthefreedmensbureau.com/' },
        secondary: { label: 'Note it on the plan', kind: 'open-plan' }
      };
    }
    return {
      key: 'county',
      chip: 'Next: Mark county done',
      headline: 'Place and field office are set — mark this step done',
      why: 'You’ve pinned ' + [plan.county, plan.state].filter(Boolean).join(', ') + ' and noted ' + plan.fieldOffice + '.',
      primary: { label: 'Open plan & check off', kind: 'open-plan' }
    };
  }

  if(step.key === 'records'){
    if(!plan.state){
      return {
        key: 'records',
        chip: 'Next: Set place',
        headline: 'Set a place to unlock the record checklist',
        why: 'State- and county-specific Bureau, Bank, and court collections only appear once place is set.',
        primary: { label: 'Set place on plan', kind: 'open-plan' }
      };
    }
    const nextSrc = coachNextChecklistItem(person, plan);
    if(!nextSrc){
      return {
        key: 'records',
        chip: 'Next: Mark checklist done',
        headline: 'Checklist searched — mark this step done',
        why: 'You’ve covered the place collections (or marked them). Move on to enslaver candidates.',
        primary: { label: 'Open plan & check off', kind: 'open-plan' }
      };
    }
    return {
      key: 'records',
      chip: 'Next: ' + nextSrc.label,
      headline: 'Search “' + nextSrc.label + '” for ' + planSurname(person),
      why: nextSrc.note || ('Work the place checklist for ' + [plan.county, plan.state].filter(Boolean).join(', ') + '.'),
      primary: { label: 'Open ' + nextSrc.label, kind: 'open-source', sourceId: nextSrc.id, url: nextSrc.url },
      secondary: { label: 'Run full Discovery', kind: 'discover' }
    };
  }

  if(step.key === 'enslaver'){
    const hint = (person.enslaverSurname || '').trim();
    const hasHintCandidate = hint && plan.candidates.some(c =>
      (c.name || '').toLowerCase().includes(hint.toLowerCase())
    );
    if(hint && !hasHintCandidate){
      return {
        key: 'enslaver',
        chip: 'Next: Add enslaver hint',
        headline: 'Add “' + hint + '” as an enslaver candidate',
        why: 'It’s already on the person card — test it against the 1860 slave schedule before treating the surname as proof.',
        primary: { label: 'Add candidate & open plan', kind: 'add-hint-candidate', candidateName: hint },
        secondary: { label: 'Find earliest mentions', kind: 'earliest' }
      };
    }
    if(!plan.candidates.length){
      return {
        key: 'enslaver',
        chip: 'Next: Enslaver candidates',
        headline: 'List enslaver candidates to test',
        why: 'Same-surname landowners, oral history, Bureau, or Bank clues. Or run earliest-mentions search for pre-1870 surname hits.',
        primary: { label: 'Find earliest mentions', kind: 'earliest' },
        secondary: { label: 'Add candidates on plan', kind: 'open-plan' }
      };
    }
    const untested = plan.candidates.find(c => !c.status || c.status === 'untested');
    if(untested){
      const schedUrl = typeof familySearchCollectionUrl === 'function'
        ? familySearchCollectionUrl({
            surname: (untested.name || '').trim().split(/\s+/).pop() || '',
            county: plan.county,
            state: plan.state
          }, '3161105')
        : '';
      return {
        key: 'enslaver',
        chip: 'Next: Test ' + untested.name,
        headline: 'Test candidate “' + untested.name + '” on the 1860 slave schedule',
        why: 'Match age/sex tallies to your family, then chase that estate’s probate if it fits.',
        primary: schedUrl
          ? { label: 'Open 1860 slave schedule', kind: 'open-url', url: schedUrl }
          : { label: 'Open plan', kind: 'open-plan' },
        secondary: { label: 'Full search for candidate', kind: 'discover-candidate', candidateName: untested.name }
      };
    }
    const promising = plan.candidates.find(c => c.status === 'promising');
    if(promising){
      return {
        key: 'enslaver',
        chip: 'Next: Probate for ' + promising.name,
        headline: 'Chase probate / estate papers for “' + promising.name + '”',
        why: 'Inventories and wills often name enslaved people. Search under the enslaver’s surname at the county courthouse / FamilySearch.',
        primary: { label: 'Open plan (probate links)', kind: 'open-plan' },
        secondary: { label: 'Search Discovery', kind: 'discover-candidate', candidateName: promising.name }
      };
    }
    return {
      key: 'enslaver',
      chip: 'Next: Confirm a name',
      headline: 'Candidates reviewed — look for a record that names your ancestor',
      why: 'Mark this step done when you’ve tested the list, then confirm with a named pre-1870 source.',
      primary: { label: 'Open plan', kind: 'open-plan' }
    };
  }

  if(step.key === 'confirm'){
    const confirmed = STATE.logs.some(l => l.personId === personId && l.status === 'confirmed');
    if(confirmed){
      return {
        key: 'confirm',
        chip: 'Next: Mark confirm done',
        headline: 'You have a confirmed source — check this step off',
        why: 'Facts tagged on confirmed log entries already show on the person card.',
        primary: { label: 'Open plan & check off', kind: 'open-plan' }
      };
    }
    const promisingLog = STATE.logs.find(l =>
      l.personId === personId && (l.status === 'promising' || l.status === 'found')
    );
    if(promisingLog){
      return {
        key: 'confirm',
        chip: 'Next: Confirm a log entry',
        headline: 'Promote a promising hit to Confirmed',
        why: 'Open “' + (promisingLog.sourceName || 'your promising entry') + '”, set status to Confirmed, and tag the facts it proves.',
        primary: { label: 'Open research log', kind: 'open-log' },
        secondary: { label: 'Open plan', kind: 'open-plan' }
      };
    }
    const bankUrl = coachSourceUrl('freedmans-bank', person, plan);
    return {
      key: 'confirm',
      chip: 'Next: Named source',
      headline: 'Find one record that names ' + person.name + ' before 1870',
      why: 'Freedman’s Bank, cohabitation bonds, labor contracts, or an enslaver’s estate papers. Log it Confirmed when it fits.',
      primary: bankUrl
        ? { label: 'Open Freedman’s Bank', kind: 'open-url', url: bankUrl }
        : { label: 'Search Discovery', kind: 'discover' },
      secondary: { label: 'Search Discovery', kind: 'discover' }
    };
  }

  if(step.key === 'africa'){
    const synth = typeof synthesizeBridge === 'function' ? synthesizeBridge(personId) : null;
    if(synth && synth.ready && synth.africaAgentReady){
      return {
        key: 'africa',
        chip: 'Next: Bridge synthesis',
        headline: 'Review the Bridge synthesis for ' + person.name,
        why: synth.narrative,
        primary: { label: 'Open Bridge synthesis', kind: 'open-plan' },
        secondary: { label: 'Edit DNA / Africa', kind: 'edit-person-dna' }
      };
    }
    if(synth && synth.ready && !synth.africaAgentReady){
      return {
        key: 'africa',
        chip: 'Next: Case foothold',
        headline: 'Case file needs a foothold before Africa ethnonyms',
        why: (synth.readinessNote || '') + ' Import DNA matches anytime; ethnonym apply stays gated.',
        primary: { label: 'Open plan (add enslaver lead)', kind: 'open-plan' },
        secondary: { label: 'Open DNA workspace', kind: 'edit-person-dna' }
      };
    }
    return {
      key: 'africa',
      chip: 'Next: Bridge to Africa',
      headline: synth && !synth.ready
        ? 'Confirm a named source before leaning on Africa claims'
        : 'Capture DNA, ethnonyms, and voyage clues',
      why: synth && !synth.ready
        ? synth.readinessNote + ' Import DNA matches and work DNA questions now — Africa ethnonyms stay gated.'
        : 'You rarely surname-search Africa. Use region estimates, African-born mentions, and Slave Voyages — tag every claim with honest confidence.',
      primary: { label: 'Open DNA workspace', kind: 'edit-person-dna' },
      secondary: { label: 'Open plan (Africa step)', kind: 'open-plan' }
    };
  }

  return {
    key: step.key,
    chip: 'Next: ' + step.title,
    headline: step.title,
    why: step.desc,
    primary: { label: 'Open plan', kind: 'open-plan' }
  };
}

function coachBannerHtml(personId){
  const c = coachForPerson(personId);
  const person = coachPerson(personId);
  const label = person ? ('Coach · ' + person.name) : 'Coach';
  const secondary = c.secondary
    ? `<button type="button" class="btn btn-ghost btn-small" data-coach-act="secondary" data-coach-person="${esc(personId || '')}">${esc(c.secondary.label)}</button>`
    : '';
  const aiBtn = typeof llmEnhanceBtnHtml === 'function'
    ? llmEnhanceBtnHtml('coach', personId || '')
    : '';
  const trust = typeof trustBadge === 'function'
    ? trustBadge(c.trust || 'lead')
    : '';
  return `<div class="coach-banner" data-coach-person="${esc(personId || '')}" data-coach-key="${esc(c.key || '')}" data-coach-kind="${esc((c.primary && c.primary.kind) || '')}" data-coach-trust="${esc(c.trust || 'lead')}">
    <div class="coach-top">
      <div class="coach-label">${esc(label)}</div>
      ${trust}
      <span class="coach-source-pill" title="Actions stay rule-based; AI only polishes wording">Guided</span>
    </div>
    <div class="coach-headline">${esc(c.headline)}</div>
    <p class="coach-why">${esc(c.why)}</p>
    <div class="coach-actions">
      <button type="button" class="btn btn-small" data-coach-act="primary" data-coach-person="${esc(personId || '')}">${esc(c.primary.label)}</button>
      ${secondary}
      ${personId ? `<button type="button" class="btn btn-ghost btn-small" onclick="agentRunNext('${esc(personId)}',3)">Run next 3</button>` : ''}
      ${aiBtn}
    </div>
  </div>`;
}

function runCoachKind(personId, action){
  if(!action || !action.kind) return;
  const person = personId ? coachPerson(personId) : null;

  if(action.kind === 'add-person'){
    openPersonForm();
    return;
  }
  if(action.kind === 'story'){
    if(typeof openStoryIntake === 'function') openStoryIntake();
    else openPersonForm();
    return;
  }
  if(action.kind === 'edit-person' || action.kind === 'edit-person-dna'){
    if(action.kind === 'edit-person-dna' && typeof openDnaWorkspace === 'function'){
      openDnaWorkspace(personId);
    } else if(personId) openPersonForm(personId);
    else openPersonForm();
    return;
  }
  if(action.kind === 'open-plan'){
    if(personId) openPlanForPerson(personId);
    else switchView('plan');
    return;
  }
  if(action.kind === 'open-log'){
    switchView('log');
    if(personId){
      const sel = document.getElementById('filterPerson');
      if(sel){ sel.value = personId; renderLog(); }
    }
    return;
  }
  if(action.kind === 'discover'){
    if(personId) discoverPerson(personId);
    else switchView('toolkit');
    return;
  }
  if(action.kind === 'earliest'){
    if(personId){
      activePlanPersonId = personId;
      fillDiscoveryForm(personSearchCtx(person, STATE.plans[personId]));
      switchView('toolkit');
      runEarliestDiscovery();
    }
    return;
  }
  if(action.kind === 'discover-candidate'){
    if(personId) activePlanPersonId = personId;
    if(typeof runPlanDiscovery === 'function') runPlanDiscovery(action.candidateName || '');
    return;
  }
  if(action.kind === 'add-hint-candidate'){
    if(!personId) return;
    activePlanPersonId = personId;
    const plan = ensurePlan(personId);
    const name = (action.candidateName || '').trim();
    if(name && typeof linkPlanCandidate === 'function'){
      linkPlanCandidate(personId, name, { note: '' });
      touchPlan();
      saveData();
    } else if(name && !plan.candidates.some(c => (c.name || '').toLowerCase() === name.toLowerCase())){
      plan.candidates.push({ name, status: 'untested', note: '' });
      touchPlan();
      saveData();
    }
    openPlanForPerson(personId);
    return;
  }
  if(action.kind === 'open-url' && action.url){
    if(action.sourceId && personId){
      // Mirror Discovery: remember this collection was opened
      const plan = STATE.plans[personId];
      if(plan && typeof getOrCreateSession === 'function'){
        getOrCreateSession(personSearchCtx(person, plan), personId);
        if(typeof markSourceOpened === 'function') markSourceOpened(action.sourceId);
      }
    }
    window.open(action.url, '_blank', 'noopener');
    return;
  }
  if(action.kind === 'open-source'){
    const plan = personId ? ensurePlan(personId) : null;
    let url = action.url;
    if(!url && action.sourceId && person){
      url = coachSourceUrl(action.sourceId, person, plan);
    }
    if(personId && action.sourceId && typeof getOrCreateSession === 'function'){
      getOrCreateSession(personSearchCtx(person, plan), personId);
      markSourceOpened(action.sourceId);
    }
    if(url) window.open(url, '_blank', 'noopener');
    // Land in Discovery so Found something / Nothing there is one click away
    if(personId) discoverPerson(personId);
    return;
  }
}

function runCoachAction(personId, which, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const c = coachForPerson(personId || '');
  const action = which === 'secondary' ? c.secondary : c.primary;
  runCoachKind(personId || '', action);
}

// ---------- Log drafts from Discovery ----------

function coachNextStepsLine(personId){
  if(!personId) return '';
  const c = coachForPerson(personId);
  if(!c || c.key === 'done') return 'Review the Research Plan and confirm any facts this source proves.';
  return 'Next up: ' + c.headline;
}

function draftLogPrefill(opts){
  const status = opts.status || 'promising';
  const personId = opts.personId || '';
  const surname = opts.surname || '';
  const variants = (opts.variants || []).filter(Boolean);
  const place = opts.place || '';
  const label = opts.sourceName || 'Source';
  const where = place ? (' in ' + place) : '';
  const who = surname ? ('"' + surname + '"') : 'this name';
  const also = variants.length ? (' (and variants: ' + variants.join(', ') + ')') : '';

  let findings = opts.findings || '';
  if(!findings){
    if(status === 'dead-end' || status === 'nothing'){
      findings = 'Searched ' + who + also + where + ' in ' + label + ' — nothing found.';
    } else if(opts.fromLive){
      findings = 'Live hit from ' + (opts.liveSource || 'archive search') + ': ' + label
        + (opts.note ? (' — ' + opts.note) : '')
        + '. Describe how it connects to your ancestor (names, dates, page/image).';
    } else {
      findings = 'Searched ' + who + also + where + ' via ' + label
        + '. Describe what you found — names, dates, relationships, page or image numbers.';
    }
  }

  const nextSteps = opts.nextSteps != null ? opts.nextSteps : coachNextStepsLine(personId);
  const confidence = opts.confidence
    || (status === 'dead-end' || status === 'nothing' ? 'speculative' : 'documentary');
  const logStatus = opts.logStatus
    || (status === 'dead-end' || status === 'nothing' ? 'dead-end'
      : status === 'found' ? 'promising' : status);

  return {
    sourceName: opts.sourceName || '',
    citation: opts.citation || '',
    type: opts.type || 'Other',
    personId,
    findings,
    nextSteps,
    confidence,
    status: logStatus
  };
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-coach-act]');
  if(!btn) return;
  runCoachAction(btn.dataset.coachPerson || '', btn.dataset.coachAct, e);
});
