// ---------------------------------------------------------------
// Enslaver graph (Phase B)
// First-class enslaver entities shared across people. Plan candidates
// keep a denormalized name for search/UI and link via enslaverId.
 // Dedupe key: normalized name + plan state (same name in different
 // states stay separate entities).
 // Loaded after plan.js.
 // ---------------------------------------------------------------

function enslaverSurnameOf(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function enslaverNormKey(name, state){
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const s = String(state || '').trim().toLowerCase();
  return n + '|' + s;
}

function ensureEnslavers(){
  if(!STATE.enslavers || typeof STATE.enslavers !== 'object' || Array.isArray(STATE.enslavers)){
    STATE.enslavers = {};
  }
  return STATE.enslavers;
}

function emptyEnslaver(opts){
  opts = opts || {};
  const name = String(opts.name || '').trim();
  return {
    id: opts.id || ('e' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)),
    name,
    surname: enslaverSurnameOf(name),
    state: opts.state || '',
    county: opts.county || '',
    notes: opts.notes || '',
    updatedAt: Date.now()
  };
}

function getEnslaver(id){
  if(!id) return null;
  return ensureEnslavers()[id] || null;
}

function findEnslaverByNamePlace(name, state){
  const store = ensureEnslavers();
  const key = enslaverNormKey(name, state);
  for(const id of Object.keys(store)){
    const e = store[id];
    if(enslaverNormKey(e.name, e.state) === key) return e;
  }
  const nameOnly = String(name || '').trim().toLowerCase();
  if(!nameOnly) return null;
  for(const id of Object.keys(store)){
    const e = store[id];
    if(String(e.name || '').trim().toLowerCase() !== nameOnly) continue;
    const eState = String(e.state || '').trim().toLowerCase();
    const want = String(state || '').trim().toLowerCase();
    if(!want || !eState || eState === want) return e;
  }
  return null;
}

function findOrCreateEnslaver(opts){
  opts = opts || {};
  const name = String(opts.name || '').trim();
  if(!name) return null;
  const existing = findEnslaverByNamePlace(name, opts.state || '');
  if(existing){
    if(opts.county && !existing.county) existing.county = String(opts.county).trim();
    if(opts.notes && !existing.notes) existing.notes = String(opts.notes).trim();
    if(opts.state && !existing.state) existing.state = String(opts.state).trim();
    existing.updatedAt = Date.now();
    return existing;
  }
  const e = emptyEnslaver(opts);
  ensureEnslavers()[e.id] = e;
  return e;
}

/**
 * Link a person plan to an enslaver entity (create entity if needed).
 * @returns {{ enslaver: object, candidate: object, created: boolean }|null}
 */
function linkPlanCandidate(personId, name, opts){
  opts = opts || {};
  if(!personId || typeof ensurePlan !== 'function') return null;
  const plan = ensurePlan(personId);
  const clean = String(name || '').trim();
  if(!clean) return null;

  const ent = findOrCreateEnslaver({
    name: clean,
    state: opts.state != null ? opts.state : (plan.state || ''),
    county: opts.county != null ? opts.county : (plan.county || ''),
    notes: opts.entityNotes || ''
  });
  if(!ent) return null;

  const already = plan.candidates.find(c =>
    (c.enslaverId && c.enslaverId === ent.id) ||
    String(c.name || '').toLowerCase() === clean.toLowerCase()
  );
  if(already){
    if(!already.enslaverId) already.enslaverId = ent.id;
    if(opts.note && !already.note) already.note = opts.note;
    if(opts.status && already.status === 'untested') already.status = opts.status;
    plan.updatedAt = Date.now();
    return { enslaver: ent, candidate: already, created: false };
  }

  const cand = {
    enslaverId: ent.id,
    name: ent.name,
    status: opts.status || 'untested',
    note: opts.note || ''
  };
  plan.candidates.push(cand);
  plan.updatedAt = Date.now();
  if(typeof ensureCase === 'function') ensureCase(personId);
  return { enslaver: ent, candidate: cand, created: true };
}

function peopleLinkedToEnslaver(enslaverId){
  const ent = getEnslaver(enslaverId);
  const out = [];
  Object.keys(STATE.plans || {}).forEach(pid => {
    const plan = STATE.plans[pid];
    if(!plan || !Array.isArray(plan.candidates)) return;
    const link = plan.candidates.find(c => {
      if(c.enslaverId && c.enslaverId === enslaverId) return true;
      if(ent && String(c.name || '').toLowerCase() === String(ent.name || '').toLowerCase()) return true;
      return false;
    });
    if(!link) return;
    const person = STATE.people.find(p => p.id === pid);
    if(person) out.push({ person, candidate: link, plan });
  });
  return out;
}

function setEnslaverNotes(enslaverId, notes){
  const e = getEnslaver(enslaverId);
  if(!e) return;
  e.notes = String(notes || '');
  e.updatedAt = Date.now();
  saveData();
}

function setEnslaverPlace(enslaverId, field, value){
  const e = getEnslaver(enslaverId);
  if(!e || (field !== 'state' && field !== 'county')) return;
  e[field] = String(value || '').trim();
  e.updatedAt = Date.now();
  saveData();
}

/** Migrate string-only candidates onto STATE.enslavers (name|state merge). */
function migratePlanCandidatesToEnslavers(plans, enslavers){
  const store = enslavers && typeof enslavers === 'object' ? enslavers : {};
  const keyToId = {};
  Object.keys(store).forEach(id => {
    const e = store[id];
    if(!e || !e.name) return;
    keyToId[enslaverNormKey(e.name, e.state)] = id;
  });
  Object.keys(plans || {}).forEach(pid => {
    const plan = plans[pid];
    if(!plan || !Array.isArray(plan.candidates)) return;
    plan.candidates.forEach(c => {
      const name = String(c.name || '').trim();
      if(!name) return;
      if(c.enslaverId && store[c.enslaverId]){
        keyToId[enslaverNormKey(store[c.enslaverId].name, store[c.enslaverId].state)] = c.enslaverId;
        return;
      }
      const key = enslaverNormKey(name, plan.state || '');
      let id = keyToId[key];
      if(!id){
        id = 'e' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        store[id] = {
          id,
          name,
          surname: enslaverSurnameOf(name),
          state: plan.state || '',
          county: plan.county || '',
          notes: c.note || '',
          updatedAt: plan.updatedAt || Date.now()
        };
        keyToId[key] = id;
      }
      c.enslaverId = id;
      c.name = store[id].name;
    });
  });
  return store;
}

function candidateEnslaverId(c){
  if(c && c.enslaverId) return c.enslaverId;
  return '';
}

function enslaverSharedLabel(enslaverId, excludePersonId){
  const links = peopleLinkedToEnslaver(enslaverId).filter(l => l.person.id !== excludePersonId);
  if(!links.length) return '';
  const names = links.slice(0, 3).map(l => l.person.name);
  const more = links.length > 3 ? ' +' + (links.length - 3) : '';
  return 'Also on: ' + names.join(', ') + more;
}
