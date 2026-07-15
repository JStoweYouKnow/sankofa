// ---------------------------------------------------------------
 // Hit interpretation + enslaver ranking (Phase 3, rule-based)
 // Turns live Discovery hits into plain-language "why this matters"
 // and ranks enslaver candidates from person/plan/search signals.
 // No LLM — same interface can wrap a model later.
 // ---------------------------------------------------------------

const INTERPRET_LENSES = {
  'enslaver-lead': { badge: 'Enslaver lead', cls: 'lens-enslaver' },
  'freedperson': { badge: 'Likely freedperson', cls: 'lens-freed' },
  'bureau': { badge: "Bureau / Bank", cls: 'lens-bureau' },
  'military': { badge: 'Military / pension', cls: 'lens-military' },
  'family-ad': { badge: 'Family-search ad', cls: 'lens-family' },
  'runaway': { badge: 'Runaway / sale ad', cls: 'lens-runaway' },
  'place-history': { badge: 'Place history', cls: 'lens-place' },
  'general': { badge: 'Possible match', cls: 'lens-general' }
};

const EXCERPT_MAX_CHARS = 8000;
let EXCERPT_EDIT_IDX = -1;

function normalizeExcerpt(raw){
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if(!s) return { text: '', truncated: false };
  if(s.length <= EXCERPT_MAX_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, EXCERPT_MAX_CHARS), truncated: true };
}

function interpretExtractYear(c){
  if(c && c.year){
    const y = parseInt(String(c.year).replace(/\D/g, '').slice(0, 4), 10);
    if(y >= 1600 && y <= 2100) return y;
  }
  const blob = [c && c.note, c && c.label, c && c.excerpt].filter(Boolean).join(' ');
  const m = String(blob).match(/\b((?:1[7-9]|20)\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

function interpretTextBlob(c){
  return [c && c.label, c && c.note, c && c.source, c && c.type, c && c.excerpt]
    .filter(Boolean).join(' ').toLowerCase();
}

function interpretHasExcerpt(c){
  return !!(c && String(c.excerpt || '').trim());
}

/** Signals from page/OCR/transcript excerpt (not title alone). */
function interpretExcerptSignals(excerpt, surname){
  const raw = String(excerpt || '');
  const low = raw.toLowerCase();
  const sur = String(surname || '').trim().toLowerCase();
  const belonging = /\bbelonging to\b|\bowned by\b|\bproperty of\b|\bin the possession of\b/i.test(raw);
  const servant = /\bservant(?:s)? of\b|\bhis servant\b|\bher servant\b|\bas a servant\b/i.test(raw);
  const slaveryLang = /\bslave|enslaved|negro|mulatto|plantation|bondspeople|chattel\b/i.test(raw);
  const surnameInExcerpt = !!(sur && sur.length >= 2 && low.indexOf(sur) >= 0);
  const namedOwners = interpretExtractTitleSurnames(raw, surname);
  return { belonging, servant, slaveryLang, surnameInExcerpt, namedOwners };
}

/**
 * Rule-based reading of one Discovery hit in search context.
 * Optional c.excerpt (IA/LOC/SI text, paste, or companion page text) sharpens lenses.
 * @returns {{ lens: string, badge: string, cls: string, why: string, year: number, suggestCandidate: boolean, candidateName: string, excerptBased: boolean, excerptTruncated: boolean }}
 */
function interpretHit(c, ctx){
  const text = interpretTextBlob(c);
  const year = interpretExtractYear(c);
  const surname = String((ctx && ctx.surname) || '').trim();
  const given = String((ctx && ctx.givenName) || '').trim();
  const preEmancipation = year > 0 && year < 1865;
  const reconstruction = year >= 1865 && year <= 1877;
  const eraMode = !!(ctx && ctx.era);
  const excerpt = String((c && c.excerpt) || '').trim();
  const excerptBased = !!excerpt;
  const excerptTruncated = !!(c && c.excerptTruncated);
  const signals = excerptBased ? interpretExcerptSignals(excerpt, surname) : null;

  let lens = 'general';
  let why = 'Compare names, place, and dates to your ancestor before treating this as proof.';
  let suggestCandidate = false;
  let candidateName = '';

  if(/information wanted|last seen|seeking.*(wife|husband|mother|father|child|children|sister|brother)/i.test(text)){
    lens = 'family-ad';
    why = 'Post-emancipation “information wanted” ads were often placed by formerly enslaved people searching for family — a strong named lead if the place fits.';
  } else if(/runaway|ran away|abscond|reward.*slave|negro.*(man|woman|boy|girl)|mulatto/i.test(text) || (preEmancipation && /slave|enslaved/i.test(text))){
    lens = 'runaway';
    why = preEmancipation
      ? 'Pre-1865 ads usually describe enslaved people and often name the enslaver who placed the ad — pull every surname and plantation clue.'
      : 'Sale or runaway language can still name enslavers and places; read carefully and log what you can verify.';
    if(surname){ suggestCandidate = true; candidateName = surname; }
  } else if(/freedmen'?s?\s*bureau|bureau of refugees|nmaahc|smithsonian/i.test(text) || (c && c.type && /bureau/i.test(c.type))){
    lens = 'bureau';
    why = "Freedmen's Bureau and related holdings can name labor contracts, rations, marriages, and complaints — often with former enslaver or plantation notes.";
  } else if(/freedman'?s?\s*bank|savings.?and.?trust/i.test(text) || (c && c.type && /bank/i.test(c.type))){
    lens = 'bureau';
    why = "Freedman's Bank registers often list spouse, children, birthplace, and former enslaver in the depositor's own words — prioritize viewing the image.";
  } else if(/usct|u\.s\. colored|colored troops|pension|civil war.*soldier|soldiers and sailors/i.test(text) || (c && c.type && /military|pension/i.test(c.type))){
    lens = 'military';
    why = 'USCT service and especially pension files can name parents, spouses, enslavers, and plantations — follow any soldier match into NARA.';
  } else if((c && c.source === 'Internet Archive') || /county history|history of .{0,40}county|directory|gazetteer|biography/i.test(text)){
    lens = 'place-history';
    why = 'Local histories and directories rarely prove identity alone, but they name landowning families — open the text and search for "'
      + (surname || 'your surname') + '" and nearby planters.';
  } else if(preEmancipation || (eraMode && year > 0 && year < 1865)){
    lens = 'enslaver-lead';
    why = 'Mentions of this surname before emancipation usually name the white family that held it — a candidate to test on the 1860 slave schedule, not proof of your ancestor.';
    if(surname){ suggestCandidate = true; candidateName = surname; }
  } else if(reconstruction || year >= 1865){
    lens = 'freedperson';
    why = given
      ? 'Post-1865 hits are more likely to name formerly enslaved people directly — check whether ' + given + ' ' + surname + ' (or a variant) appears with the right place.'
      : 'Post-1865 hits are more likely to name formerly enslaved people directly — match given name, age, and county before confirming.';
  }

  // Smithsonian without other signals
  if(lens === 'general' && c && c.source === 'Smithsonian'){
    lens = 'bureau';
    why = "Smithsonian / NMAAHC material may include Freedmen's Bureau pages — open the record and note any names, places, or former enslavers.";
  }

  if(eraMode && lens === 'general' && surname){
    lens = 'enslaver-lead';
    why = 'In earliest-mentions mode, treat pre-emancipation surname hits as enslaver-family leads until a named source says otherwise.';
    suggestCandidate = true;
    candidateName = surname;
  }

  // Excerpt / OCR / transcript hooks (Phase E) — never claim OCR accuracy
  if(signals && (signals.belonging || signals.servant || (signals.slaveryLang && signals.surnameInExcerpt))){
    lens = 'enslaver-lead';
    if(signals.namedOwners.length){
      candidateName = signals.namedOwners[0];
      suggestCandidate = true;
      why = 'Page excerpt names someone “belonging to” / under an enslaver (“'
        + candidateName + '”) — treat as a lead to test on the slave schedule, not proof. OCR may err; verify on the image.';
    } else if(signals.surnameInExcerpt && surname){
      suggestCandidate = true;
      candidateName = surname;
      why = 'Page excerpt uses enslavement language with the searched surname — a candidate lead, not a confirmed link. OCR may err; verify on the image.';
    } else {
      why = 'Page excerpt uses belonging-to / servant language — pull every named enslaver and place, then test on the 1860 slave schedule. OCR may err.';
      if(surname){ suggestCandidate = true; candidateName = surname; }
    }
  } else if(excerptBased && signals && signals.namedOwners.length && (preEmancipation || eraMode || signals.slaveryLang)){
    lens = 'enslaver-lead';
    candidateName = signals.namedOwners[0];
    suggestCandidate = true;
    why = 'Excerpt names “' + candidateName + '” in a context worth testing as an enslaver lead. OCR may err; confirm against the page image.';
  } else if(excerptBased){
    why = why + ' Reading uses page excerpt (OCR/transcript may err) — verify names on the original.';
  }

  const meta = INTERPRET_LENSES[lens] || INTERPRET_LENSES.general;
  const trust = typeof trustFromLens === 'function' ? trustFromLens(lens) : 'lead';
  return {
    lens,
    badge: meta.badge,
    cls: meta.cls,
    why,
    year,
    suggestCandidate,
    candidateName: candidateName || (suggestCandidate ? surname : ''),
    excerptBased,
    excerptTruncated,
    trust
  };
}

function interpretHitHtml(c, ctx, opts){
  if(typeof interpretHit !== 'function') return '';
  const i = interpretHit(c, ctx);
  const idx = opts && typeof opts.idx === 'number' ? opts.idx : -1;
  const addBtn = (i.suggestCandidate && i.candidateName && typeof sessionPersonId === 'function' && sessionPersonId())
    ? `<button type="button" class="btn btn-ghost btn-small" data-add-cand="${esc(i.candidateName)}">+ Candidate “${esc(i.candidateName)}”</button>`
    : '';
  const excerptChip = i.excerptBased
    ? `<span class="hit-excerpt-chip">Excerpt-based · OCR may err${i.excerptTruncated ? ' · truncated' : ''}</span>`
    : '';
  const textBtn = idx >= 0
    ? `<button type="button" class="btn btn-ghost btn-small" data-excerpt-idx="${idx}">${interpretHasExcerpt(c) ? 'Edit page text' : 'Add page text'}</button>`
    : '';
  const trust = typeof trustBadge === 'function'
    ? trustBadge(i.trust || 'lead')
    : '';
  return `<div class="hit-interpret ${esc(i.cls)}">
    <span class="hit-lens">${esc(i.badge)}${i.year ? ' · ' + i.year : ''}</span>
    ${trust}
    ${excerptChip}
    <span class="hit-why">${esc(i.why)}</span>
    <div class="hit-interpret-actions">${addBtn}${textBtn}</div>
  </div>`;
}

function persistHitExcerpt(c, sourceId){
  const s = typeof activeSession === 'function' ? activeSession() : null;
  if(!s || !c) return;
  if(!s.excerpts) s.excerpts = {};
  if(c.url){
    s.excerpts[c.url] = {
      text: c.excerpt || '',
      truncated: !!c.excerptTruncated,
      at: Date.now()
    };
  }
  if(sourceId && s.checks){
    const prev = s.checks[sourceId] || {};
    s.checks[sourceId] = Object.assign({}, prev, {
      excerpt: c.excerpt || '',
      excerptTruncated: !!c.excerptTruncated
    });
  }
  s.updatedAt = Date.now();
  if(typeof saveData === 'function') saveData();
}

function hydrateHitExcerpt(c){
  if(!c || interpretHasExcerpt(c)) return c;
  const s = typeof activeSession === 'function' ? activeSession() : null;
  if(!s || !s.excerpts || !c.url) return c;
  const row = s.excerpts[c.url];
  if(row && row.text){
    c.excerpt = row.text;
    c.excerptTruncated = !!row.truncated;
  }
  return c;
}

function setHitExcerpt(idx, text, sourceId){
  if(typeof RESULT_CACHE === 'undefined' || !RESULT_CACHE[idx]) return false;
  const c = RESULT_CACHE[idx];
  const norm = normalizeExcerpt(text);
  c.excerpt = norm.text;
  c.excerptTruncated = norm.truncated;
  persistHitExcerpt(c, sourceId);
  return { truncated: norm.truncated, length: norm.text.length };
}

function openHitExcerptForm(idx){
  if(typeof RESULT_CACHE === 'undefined' || !RESULT_CACHE[idx]){
    if(typeof showToast === 'function') showToast('No hit selected');
    return;
  }
  hydrateHitExcerpt(RESULT_CACHE[idx]);
  EXCERPT_EDIT_IDX = idx;
  const c = RESULT_CACHE[idx];
  const ta = document.getElementById('excerptText');
  const title = document.getElementById('excerptModalTitle');
  const notice = document.getElementById('excerptTruncNotice');
  if(title) title.textContent = 'Page text — ' + String(c.label || 'hit').slice(0, 80);
  if(ta) ta.value = c.excerpt || '';
  if(notice) notice.textContent = '';
  const el = document.getElementById('excerptOverlay');
  if(el) el.classList.add('open');
}

function saveHitExcerpt(){
  if(EXCERPT_EDIT_IDX < 0) return;
  const ta = document.getElementById('excerptText');
  const raw = ta ? ta.value : '';
  const result = setHitExcerpt(EXCERPT_EDIT_IDX, raw);
  const notice = document.getElementById('excerptTruncNotice');
  if(result && result.truncated){
    if(notice) notice.textContent = 'Saved first ' + EXCERPT_MAX_CHARS + ' characters (text was truncated).';
    if(typeof showToast === 'function') showToast('Page text saved (truncated)');
  } else {
    if(notice) notice.textContent = '';
    if(typeof showToast === 'function') showToast(result && result.length ? 'Page text saved — re-reading hit' : 'Page text cleared');
  }
  if(typeof closeOverlay === 'function') closeOverlay('excerptOverlay');
  else {
    const el = document.getElementById('excerptOverlay');
    if(el) el.classList.remove('open');
  }
  // Re-paint live result cards that use RESULT_CACHE indices
  if(typeof refreshLiveResultInterpret === 'function') refreshLiveResultInterpret();
  else if(typeof refreshHitInsightPanel === 'function') refreshHitInsightPanel();
  EXCERPT_EDIT_IDX = -1;
}

function refreshLiveResultInterpret(){
  if(typeof refreshHitInsightPanel === 'function') refreshHitInsightPanel();
  // Re-render interpret blocks on visible cards when we can find them by data-excerpt-idx parent
  document.querySelectorAll('.result-card').forEach(card => {
    const btn = card.querySelector('[data-excerpt-idx]');
    if(!btn) return;
    const idx = Number(btn.dataset.excerptIdx);
    if(typeof RESULT_CACHE === 'undefined' || !RESULT_CACHE[idx]) return;
    hydrateHitExcerpt(RESULT_CACHE[idx]);
    const ctx = (typeof LAST_DISCOVERY_CTX !== 'undefined' && LAST_DISCOVERY_CTX) || {};
    const host = card.querySelector('.hit-interpret');
    const html = interpretHitHtml(RESULT_CACHE[idx], ctx, { idx });
    if(host) host.outerHTML = html;
    else {
      const left = card.querySelector('.result-left');
      if(left){
        const note = left.querySelector('.result-note');
        if(note) note.insertAdjacentHTML('afterend', html);
      }
    }
  });
}

// ---------- Enslaver candidate ranking ----------

function interpretSurnameToken(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function interpretBump(map, name, score, reason){
  const clean = String(name || '').trim();
  if(!clean || clean.length < 2) return;
  const key = clean.toLowerCase();
  if(!map.has(key)){
    map.set(key, { name: clean, score: 0, reasons: [] });
  }
  const row = map.get(key);
  row.score += score;
  if(reason && !row.reasons.includes(reason)) row.reasons.push(reason);
  // Prefer longer / more complete display name
  if(clean.length > row.name.length) row.name = clean;
}

function interpretExtractTitleSurnames(label, skipSurname){
  const skip = new Set([
    'the','and','for','from','county','parish','state','history','volume','vol',
    'newspaper','chronicle','herald','times','gazette','advertiser','weekly',
    'january','february','march','april','may','june','july','august',
    'september','october','november','december','monday','tuesday','wednesday',
    'thursday','friday','saturday','sunday','mr','mrs','miss','dr','rev',
    'estate','will','probate','slave','slaves','negro','colored','freedmen',
    'bureau','bank','united','states','america','north','south','east','west'
  ]);
  if(skipSurname) skip.add(String(skipSurname).toLowerCase());
  const out = [];
  // "Estate of Jasper Rhyne" / "Mr. Rhyne" / "belonging to John Stowe"
  const patterns = [
    /\b[Ee]state of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    /\b(?:Mr|Mrs|Miss|Dr|Rev)\.?\s+([A-Z][a-z]+)/g,
    /\b(?:belonging to|owned by|property of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi
  ];
  patterns.forEach(re=>{
    let m;
    const s = String(label || '');
    re.lastIndex = 0;
    while((m = re.exec(s))){
      const display = m[1].trim();
      const sur = interpretSurnameToken(display);
      if(sur && !skip.has(sur.toLowerCase())) out.push(display);
    }
  });
  return out;
}

/**
 * Rank enslaver candidates for a person from tree/plan/search/hits.
 * @returns {Array<{ name: string, score: number, reasons: string[], already: boolean, status: string }>}
 */
function rankEnslaverCandidates(personId, ctx, hits){
  const map = new Map();
  const person = personId && STATE.people.find(p => p.id === personId);
  const plan = personId && STATE.plans[personId];
  const surname = (ctx && ctx.surname) || (person ? String(person.name || '').trim().split(/\s+/).pop() : '') || '';
  const existing = new Map();
  if(plan && Array.isArray(plan.candidates)){
    plan.candidates.forEach(c=>{
      existing.set(String(c.name || '').toLowerCase(), c.status || 'untested');
    });
  }

  if(person && person.enslaverSurname){
    interpretBump(map, person.enslaverSurname, 45, 'On the person card from oral history or prior research');
  }
  if(ctx && ctx.enslaver){
    interpretBump(map, ctx.enslaver, 35, 'Entered on this Discovery search');
  }
  if(plan && Array.isArray(plan.candidates)){
    plan.candidates.forEach(c=>{
      let boost = 25;
      if(c.status === 'promising') boost = 40;
      if(c.status === 'confirmed') boost = 55;
      if(c.status === 'ruled-out') boost = 5;
      interpretBump(map, c.name, boost, 'Already on the Research Plan (' + (c.status || 'untested') + ')');
    });
  }

  // Sibling / tree reuse: same enslaver entity or name on another plan
  Object.keys(STATE.plans || {}).forEach(otherId => {
    if(otherId === personId) return;
    const otherPlan = STATE.plans[otherId];
    if(!otherPlan || !Array.isArray(otherPlan.candidates)) return;
    const otherPerson = STATE.people.find(p => p.id === otherId);
    const otherLabel = otherPerson ? otherPerson.name : 'a relative';
    otherPlan.candidates.forEach(c => {
      let boost = 16;
      if(c.status === 'promising') boost = 28;
      if(c.status === 'confirmed') boost = 36;
      if(c.status === 'ruled-out') boost = 2;
      interpretBump(
        map,
        c.name,
        boost,
        'Also on ' + otherLabel + '’s plan (' + (c.status || 'untested') + ')'
      );
    });
  });

  // Discovery “found” coverage for this person boosts matching surnames
  if(personId){
    Object.values(STATE.sessions || {}).forEach(s => {
      if(s.personId !== personId) return;
      const hasFound = Object.values(s.checks || {}).some(ch => ch.status === 'found');
      if(hasFound && s.surname){
        interpretBump(map, s.surname, 22, 'Discovery marked a find while searching this surname');
      }
    });
  }

  const list = Array.isArray(hits) ? hits : [];
  let preCount = 0;
  list.forEach(h=>{
    hydrateHitExcerpt(h);
    const year = interpretExtractYear(h);
    const interp = interpretHit(h, ctx || {});
    if(interp.lens === 'enslaver-lead' || (year > 0 && year < 1865)){
      preCount++;
      if(surname) interpretBump(map, surname, 12, 'Pre-emancipation surname hit (' + (year || 'undated') + ')');
    }
    interpretExtractTitleSurnames(h.label, surname).forEach(n=>{
      interpretBump(map, n, 18, 'Named in a hit title: “' + String(h.label).slice(0, 60) + (h.label && h.label.length > 60 ? '…' : '') + '”');
    });
    if(interpretHasExcerpt(h)){
      interpretExtractTitleSurnames(h.excerpt, surname).forEach(n=>{
        interpretBump(map, n, 22, 'Named in page excerpt: “' + String(n).slice(0, 40) + '”');
      });
    }
    if(interp.suggestCandidate && interp.candidateName){
      interpretBump(map, interp.candidateName, interp.excerptBased ? 14 : 10,
        interp.excerptBased ? 'Flagged from page excerpt' : 'Flagged by hit interpretation');
    }
  });

  if(ctx && ctx.era && surname && preCount === 0 && list.length){
    interpretBump(map, surname, 8, 'Earliest-mentions search — Field Guide §6 surname-as-enslaver hypothesis');
  } else if(ctx && ctx.era && surname && !map.has(surname.toLowerCase())){
    interpretBump(map, surname, 15, 'Earliest-mentions search — test this surname on the 1860 slave schedule');
  }

  return [...map.values()]
    .map(row => {
      const ent = typeof findEnslaverByNamePlace === 'function'
        ? findEnslaverByNamePlace(row.name, (plan && plan.state) || '')
        : null;
      return {
        name: row.name,
        score: row.score,
        reasons: row.reasons.slice(0, 3),
        already: existing.has(row.name.toLowerCase()),
        status: existing.get(row.name.toLowerCase()) || '',
        enslaverId: ent ? ent.id : ''
      };
    })
    .filter(r => r.score >= 8)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function addEnslaverCandidate(name, note){
  const personId = (typeof sessionPersonId === 'function' && sessionPersonId())
    || (typeof activePlanPersonId !== 'undefined' && activePlanPersonId)
    || '';
  if(!personId || typeof ensurePlan !== 'function'){
    showToast('Link a person to this search first (Search Discovery from their tree card)');
    return false;
  }
  const person = STATE.people.find(p => p.id === personId);
  const clean = String(name || '').trim();
  if(!clean) return false;
  const res = typeof linkPlanCandidate === 'function'
    ? linkPlanCandidate(personId, clean, { note: note || 'From Discovery interpretation' })
    : null;
  if(res && !res.created){
    showToast('Already a candidate');
    return false;
  }
  if(!res){
    const plan = ensurePlan(personId);
    if(plan.candidates.some(c => String(c.name).toLowerCase() === clean.toLowerCase())){
      showToast('Already a candidate');
      return false;
    }
    plan.candidates.push({
      name: clean,
      status: 'untested',
      note: note || 'From Discovery interpretation'
    });
    plan.updatedAt = Date.now();
  }
  activePlanPersonId = personId;
  saveData();
  if(typeof renderPlanView === 'function') renderPlanView();
  if(typeof refreshHitInsightPanel === 'function') refreshHitInsightPanel();
  showToast('Added “' + clean + '” to ' + (person ? person.name : 'plan') + '’s candidates');
  return true;
}

function refreshHitInsightPanel(){
  const el = document.getElementById('hitInsight');
  if(!el) return;
  const ctx = (typeof LAST_DISCOVERY_CTX !== 'undefined' && LAST_DISCOVERY_CTX) || {};
  const personId = (typeof sessionPersonId === 'function' && sessionPersonId()) || '';
  // Skip loading/error placeholder cards
  const hits = (typeof RESULT_CACHE !== 'undefined' ? RESULT_CACHE : []).filter(c =>
    c && c.label && c.url && !c._placeholder
  );
  if(!hits.length && !personId){
    el.innerHTML = '';
    return;
  }

  hits.forEach(hydrateHitExcerpt);
  const ranked = rankEnslaverCandidates(personId, ctx, hits);
  const lensCounts = {};
  let excerptCount = 0;
  hits.forEach(h=>{
    const i = interpretHit(h, ctx);
    lensCounts[i.lens] = (lensCounts[i.lens] || 0) + 1;
    if(i.excerptBased) excerptCount++;
  });
  const lensLine = Object.keys(lensCounts).map(k=>{
    const meta = INTERPRET_LENSES[k] || INTERPRET_LENSES.general;
    return meta.badge + ' ×' + lensCounts[k];
  }).join(' · ');

  let html = `<div class="insight-panel">
    <div class="insight-head">
      <div class="insight-label">Hit reading</div>
      ${typeof llmEnhanceBtnHtml === 'function' ? llmEnhanceBtnHtml('hits', personId || '') : ''}
    </div>
    <div class="insight-summary">${hits.length ? esc(lensLine) : 'Live hits will be classified here as they arrive.'}</div>
    ${excerptCount
      ? `<div class="insight-sub">${excerptCount} hit${excerptCount === 1 ? '' : 's'} read from page excerpt (OCR may err).</div>`
      : (hits.length ? `<div class="insight-sub">Add page text on a hit to interpret belonging-to / servant language beyond the title.</div>` : '')}`;

  if(personId && ranked.length){
    html += `<div class="insight-label" style="margin-top:14px;">Ranked enslaver candidates</div>
      <div class="insight-sub">Scored from the person card, plan, and these hits. A shared surname is a lead — test on the 1860 slave schedule.</div>
      <div class="cand-rank-list">`;
    ranked.forEach((r, idx)=>{
      const reasons = r.reasons.map(x => `<li>${esc(x)}</li>`).join('');
      const action = r.already
        ? `<span class="check-chip check-opened">On plan${r.status ? ' · ' + esc(r.status) : ''}</span>`
        : `<button type="button" class="btn btn-small" data-add-cand="${esc(r.name)}">+ Add to plan</button>`;
      html += `<div class="cand-rank-row">
        <div class="cand-rank-main">
          <div class="cand-rank-name"><span class="cand-rank-num">${idx + 1}</span> ${esc(r.name)}</div>
          <ul class="cand-rank-reasons">${reasons}</ul>
        </div>
        <div class="cand-rank-actions">${action}</div>
      </div>`;
    });
    html += `</div>`;
  } else if(personId && hits.length){
    html += `<div class="field-hint" style="margin-top:10px;">No strong enslaver candidates yet — try earliest-mentions mode or add an oral-history surname on the person.</div>`;
  } else if(!personId && hits.length){
    html += `<div class="field-hint" style="margin-top:10px;">Run Discovery from a person’s tree card to rank enslaver candidates onto their plan.</div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

// Click handler for + Candidate / Add page text (delegation)
document.addEventListener('click', function(e){
  const excerptBtn = e.target.closest('[data-excerpt-idx]');
  if(excerptBtn){
    e.preventDefault();
    e.stopPropagation();
    openHitExcerptForm(Number(excerptBtn.dataset.excerptIdx));
    return;
  }
  const btn = e.target.closest('[data-add-cand]');
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  addEnslaverCandidate(btn.dataset.addCand, 'From Discovery hit interpretation');
});
