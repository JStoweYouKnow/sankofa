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

function interpretExtractYear(c){
  if(c && c.year){
    const y = parseInt(String(c.year).replace(/\D/g, '').slice(0, 4), 10);
    if(y >= 1600 && y <= 2100) return y;
  }
  const blob = [c && c.note, c && c.label].filter(Boolean).join(' ');
  const m = String(blob).match(/\b((?:1[7-9]|20)\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

function interpretTextBlob(c){
  return [c && c.label, c && c.note, c && c.source, c && c.type].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Rule-based reading of one Discovery hit in search context.
 * @returns {{ lens: string, badge: string, cls: string, why: string, year: number, suggestCandidate: boolean, candidateName: string }}
 */
function interpretHit(c, ctx){
  const text = interpretTextBlob(c);
  const year = interpretExtractYear(c);
  const surname = String((ctx && ctx.surname) || '').trim();
  const given = String((ctx && ctx.givenName) || '').trim();
  const preEmancipation = year > 0 && year < 1865;
  const reconstruction = year >= 1865 && year <= 1877;
  const eraMode = !!(ctx && ctx.era);

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

  const meta = INTERPRET_LENSES[lens] || INTERPRET_LENSES.general;
  return {
    lens,
    badge: meta.badge,
    cls: meta.cls,
    why,
    year,
    suggestCandidate,
    candidateName: candidateName || (suggestCandidate ? surname : '')
  };
}

function interpretHitHtml(c, ctx){
  if(typeof interpretHit !== 'function') return '';
  const i = interpretHit(c, ctx);
  const addBtn = (i.suggestCandidate && i.candidateName && typeof sessionPersonId === 'function' && sessionPersonId())
    ? `<button type="button" class="btn btn-ghost btn-small" data-add-cand="${esc(i.candidateName)}">+ Candidate “${esc(i.candidateName)}”</button>`
    : '';
  return `<div class="hit-interpret ${esc(i.cls)}">
    <span class="hit-lens">${esc(i.badge)}${i.year ? ' · ' + i.year : ''}</span>
    <span class="hit-why">${esc(i.why)}</span>
    ${addBtn}
  </div>`;
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

  const list = Array.isArray(hits) ? hits : [];
  let preCount = 0;
  list.forEach(h=>{
    const year = interpretExtractYear(h);
    const interp = interpretHit(h, ctx || {});
    if(interp.lens === 'enslaver-lead' || (year > 0 && year < 1865)){
      preCount++;
      if(surname) interpretBump(map, surname, 12, 'Pre-emancipation surname hit (' + (year || 'undated') + ')');
    }
    interpretExtractTitleSurnames(h.label, surname).forEach(n=>{
      interpretBump(map, n, 18, 'Named in a hit title: “' + String(h.label).slice(0, 60) + (h.label && h.label.length > 60 ? '…' : '') + '”');
    });
    if(interp.suggestCandidate && interp.candidateName){
      interpretBump(map, interp.candidateName, 10, 'Flagged by hit interpretation');
    }
  });

  if(ctx && ctx.era && surname && preCount === 0 && list.length){
    interpretBump(map, surname, 8, 'Earliest-mentions search — Field Guide §6 surname-as-enslaver hypothesis');
  } else if(ctx && ctx.era && surname && !map.has(surname.toLowerCase())){
    interpretBump(map, surname, 15, 'Earliest-mentions search — test this surname on the 1860 slave schedule');
  }

  return [...map.values()]
    .map(row => ({
      name: row.name,
      score: row.score,
      reasons: row.reasons.slice(0, 3),
      already: existing.has(row.name.toLowerCase()),
      status: existing.get(row.name.toLowerCase()) || ''
    }))
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
  const plan = ensurePlan(personId);
  const clean = String(name || '').trim();
  if(!clean) return false;
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
  // Jump plan focus to enslaver step without marking others done
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

  const ranked = rankEnslaverCandidates(personId, ctx, hits);
  const lensCounts = {};
  hits.forEach(h=>{
    const i = interpretHit(h, ctx);
    lensCounts[i.lens] = (lensCounts[i.lens] || 0) + 1;
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
    <div class="insight-summary">${hits.length ? esc(lensLine) : 'Live hits will be classified here as they arrive.'}</div>`;

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

// Click handler for + Candidate buttons (delegation)
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-add-cand]');
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  addEnslaverCandidate(btn.dataset.addCand, 'From Discovery hit interpretation');
});
