// ---------------------------------------------------------------
// GEDCOM 5.5.x import (Phase F)
// Parses INDI/FAM subset into Forebear people.
// On apply: unique name + birth-year matches merge (fill empty fields);
// otherwise new ids. Never invents citations; skips malformed lines.
// Loaded after plan.js (ensurePlan / ensureCase).
// ---------------------------------------------------------------

var PENDING_GEDCOM = null;

function gedParseDisplayName(value){
  let s = String(value || '').trim();
  if(!s) return '';
  // GEDCOM: Given /Surname/ Suffix  →  Given Surname Suffix
  s = s.replace(/\/([^/]*)\//g, function(_, sur){
    return sur ? (' ' + sur.trim() + ' ') : ' ';
  });
  return s.replace(/\s+/g, ' ').trim();
}

function gedImportDate(value){
  const str = String(value || '').trim();
  if(!str) return '';
  const m = str.match(/\d{3,4}/);
  if(!m) return str.slice(0, 40);
  const approx = /^(ABT|EST|CAL|CIR|ABOUT|C\.?)\b/i.test(str) || /\bABT\b|\bEST\b/i.test(str);
  return (approx ? 'c. ' : '') + m[0];
}

function gedExtractEnslaverFromNote(note){
  const m = String(note || '').match(/Associated enslaver surname:\s*([^\n.]+)/i);
  return m ? m[1].trim() : '';
}

/**
 * Parse GEDCOM text into flat line records; merges CONT/CONC into prior value.
 * @returns {{ lines: Array<{level:number,xref:string|null,tag:string,value:string}>, warnings: number }}
 */
function parseGedcom(text){
  const rawLines = String(text || '').split(/\r?\n/);
  const lines = [];
  let warnings = 0;
  rawLines.forEach((raw, i) => {
    if(!String(raw).trim()) return;
    // Strip UTF-8 BOM on first line
    if(i === 0) raw = raw.replace(/^\uFEFF/, '');
    const m = String(raw).match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/);
    if(!m){
      warnings++;
      return;
    }
    lines.push({
      level: Number(m[1]),
      xref: m[2] || null,
      tag: String(m[3]).toUpperCase(),
      value: m[4] != null ? m[4] : ''
    });
  });
  // Merge CONT / CONC into previous payload value
  const merged = [];
  lines.forEach(row => {
    if(row.tag === 'CONT' || row.tag === 'CONC'){
      if(!merged.length){ warnings++; return; }
      const prev = merged[merged.length - 1];
      prev.value += (row.tag === 'CONT' ? '\n' : '') + (row.value || '');
      return;
    }
    merged.push(row);
  });
  return { lines: merged, warnings };
}

function gedBuildTree(lines){
  const records = [];
  let cur = null;
  let stack = [];
  lines.forEach(row => {
    if(row.level === 0){
      cur = { xref: row.xref, tag: row.tag, value: row.value, children: [] };
      records.push(cur);
      stack = [cur];
      return;
    }
    if(!cur) return;
    while(stack.length > row.level) stack.pop();
    const parent = stack[stack.length - 1];
    if(!parent) return;
    const node = { xref: row.xref, tag: row.tag, value: row.value, children: [] };
    parent.children.push(node);
    stack.push(node);
  });
  return records;
}

function gedChild(node, tag){
  return (node.children || []).find(c => c.tag === tag) || null;
}

function gedChildren(node, tag){
  return (node.children || []).filter(c => c.tag === tag);
}

function gedNoteText(node){
  const notes = gedChildren(node, 'NOTE').map(n => n.value || '');
  return notes.filter(Boolean).join('\n');
}

/**
 * Convert parsed GEDCOM into Forebear people (temporary ids). Does not mutate STATE.
 * @returns {{ people: Array, warnings: number, skipped: number, indiCount: number, famCount: number }}
 */
function gedcomToPeople(text){
  const { lines, warnings: parseWarnings } = parseGedcom(text);
  const records = gedBuildTree(lines);
  let warnings = parseWarnings;
  let skipped = 0;

  const indis = records.filter(r => r.tag === 'INDI' && r.xref);
  const fams = records.filter(r => r.tag === 'FAM');

  const idMap = new Map(); // xref → new person id
  const drafts = new Map(); // xref → person draft

  indis.forEach(rec => {
    const names = gedChildren(rec, 'NAME').map(n => gedParseDisplayName(n.value)).filter(Boolean);
    if(!names.length){
      skipped++;
      warnings++;
      return;
    }
    const newId = typeof uid === 'function' ? uid() : ('p' + Math.random().toString(36).slice(2, 10));
    idMap.set(rec.xref, newId);

    const birt = gedChild(rec, 'BIRT');
    const deat = gedChild(rec, 'DEAT');
    const note = gedNoteText(rec);
    const enslaver = gedExtractEnslaverFromNote(note);
    let notes = note;
    if(enslaver){
      notes = notes.replace(/Associated enslaver surname:\s*[^\n]+/i, '').trim();
    }

    const person = {
      id: newId,
      name: names[0],
      nameVariants: names.slice(1).filter((n, i, a) => a.indexOf(n) === i && n !== names[0]),
      birthYear: birt && gedChild(birt, 'DATE') ? gedImportDate(gedChild(birt, 'DATE').value) : '',
      deathYear: deat && gedChild(deat, 'DATE') ? gedImportDate(gedChild(deat, 'DATE').value) : '',
      birthplace: birt && gedChild(birt, 'PLAC') ? String(gedChild(birt, 'PLAC').value || '').trim() : '',
      enslaverSurname: enslaver,
      notes: notes,
      parentIds: [],
      spouses: [],
      dna: typeof emptyDna === 'function' ? emptyDna() : {},
      africa: typeof emptyAfrica === 'function' ? emptyAfrica() : {},
      updatedAt: Date.now(),
      _gedXref: rec.xref
    };
    drafts.set(rec.xref, person);
  });

  fams.forEach(fam => {
    const husb = gedChild(fam, 'HUSB');
    const wife = gedChild(fam, 'WIFE');
    const husbX = husb ? String(husb.value || '').trim() : '';
    const wifeX = wife ? String(wife.value || '').trim() : '';
    const parentXrefs = [husbX, wifeX].filter(x => x && idMap.has(x));
    const parentIds = parentXrefs.map(x => idMap.get(x));

    // Spouses
    if(husbX && wifeX && idMap.has(husbX) && idMap.has(wifeX)){
      const a = drafts.get(husbX);
      const b = drafts.get(wifeX);
      const marr = gedChild(fam, 'MARR');
      const note = marr ? gedNoteText(marr) : '';
      if(a && !(a.spouses || []).some(s => s.personId === b.id)){
        a.spouses.push({ personId: b.id, note: note || '' });
      }
      if(b && !(b.spouses || []).some(s => s.personId === a.id)){
        b.spouses.push({ personId: a.id, note: note || '' });
      }
    }

    gedChildren(fam, 'CHIL').forEach(ch => {
      const cx = String(ch.value || '').trim();
      const child = drafts.get(cx);
      if(!child){
        warnings++;
        return;
      }
      parentIds.forEach(pid => {
        if(pid && child.parentIds.indexOf(pid) < 0) child.parentIds.push(pid);
      });
    });
  });

  const people = [...drafts.values()].map(p => {
    const out = Object.assign({}, p);
    delete out._gedXref;
    return out;
  });

  return {
    people,
    warnings,
    skipped,
    indiCount: indis.length,
    famCount: fams.length
  };
}

/** Normalize a display name for match comparison. */
function gedNameKey(name){
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function gedYearNum(year){
  const m = String(year || '').match(/\d{3,4}/);
  return m ? Number(m[0]) : null;
}

/** True when names are equal or one contains all tokens of the other (e.g. Hattie Freeman ⊆ Hattie Freeman Leeper). */
function gedNamesCompatible(a, b){
  const ka = gedNameKey(a);
  const kb = gedNameKey(b);
  if(!ka || !kb) return false;
  if(ka === kb) return true;
  const ta = ka.split(' ').filter(Boolean);
  const tb = kb.split(' ').filter(Boolean);
  if(!ta.length || !tb.length) return false;
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = ta.length <= tb.length ? tb : ta;
  return shorter.every(t => longer.indexOf(t) >= 0);
}

function gedYearsCompatible(ya, yb){
  const na = gedYearNum(ya);
  const nb = gedYearNum(yb);
  if(na == null || nb == null) return true;
  return Math.abs(na - nb) <= 1;
}

/**
 * Find a unique existing person matching name + year (and variants).
 * Ambiguous matches return null so we add rather than merge wrongly.
 */
function gedFindExistingMatch(incoming, existingPeople){
  const pool = existingPeople || (typeof STATE !== 'undefined' ? STATE.people : []) || [];
  const hits = pool.filter(ex => {
    if(!ex || !ex.id) return false;
    const names = [ex.name].concat(ex.nameVariants || []);
    const inNames = [incoming.name].concat(incoming.nameVariants || []);
    const nameOk = names.some(n => inNames.some(m => gedNamesCompatible(n, m)));
    if(!nameOk) return false;
    return gedYearsCompatible(ex.birthYear, incoming.birthYear);
  });
  if(hits.length === 1) return hits[0];
  return null;
}

function gedMergeFill(existing, incoming){
  if(!existing || !incoming) return;
  if(!existing.birthYear && incoming.birthYear) existing.birthYear = incoming.birthYear;
  if(!existing.deathYear && incoming.deathYear) existing.deathYear = incoming.deathYear;
  if(!existing.birthplace && incoming.birthplace) existing.birthplace = incoming.birthplace;
  if(!existing.enslaverSurname && incoming.enslaverSurname) existing.enslaverSurname = incoming.enslaverSurname;
  if(incoming.notes){
    const note = String(incoming.notes).trim();
    if(note && String(existing.notes || '').indexOf(note) < 0){
      existing.notes = existing.notes ? (String(existing.notes).trim() + '\n' + note) : note;
    }
  }
  const variants = existing.nameVariants || (existing.nameVariants = []);
  const addVar = function(v){
    if(!v || v === existing.name) return;
    if(variants.indexOf(v) < 0) variants.push(v);
  };
  addVar(incoming.name);
  (incoming.nameVariants || []).forEach(addVar);
  existing.updatedAt = Date.now();
}

function gedRemapId(id, idMap){
  if(!id) return id;
  return idMap.has(id) ? idMap.get(id) : id;
}

/**
 * Plan how a GEDCOM batch merges into existing people (name + year).
 * Does not mutate STATE.
 * @returns {{ toAdd: Array, merged: Array<{existingId, incoming}>, idMap: Map, ambiguous: number }}
 */
function planGedcomMerge(incomingPeople, existingPeople){
  const pool = existingPeople || [];
  const idMap = new Map();
  const toAdd = [];
  const merged = [];
  let ambiguous = 0;

  (incomingPeople || []).forEach(p => {
    const match = gedFindExistingMatch(p, pool);
    // Also avoid matching the same existing person twice in one batch
    const already = match && merged.some(m => m.existingId === match.id);
    if(match && !already){
      idMap.set(p.id, match.id);
      merged.push({ existingId: match.id, incoming: p });
    } else {
      if(!match && pool.filter(ex => {
        const names = [ex.name].concat(ex.nameVariants || []);
        const inNames = [p.name].concat(p.nameVariants || []);
        return names.some(n => inNames.some(m => gedNamesCompatible(n, m)))
          && gedYearsCompatible(ex.birthYear, p.birthYear);
      }).length > 1){
        ambiguous++;
      }
      idMap.set(p.id, p.id);
      toAdd.push(p);
    }
  });

  // Remap parent/spouse links on toAdd copies
  const remappedAdd = toAdd.map(p => {
    const copy = Object.assign({}, p, {
      parentIds: (p.parentIds || []).map(id => gedRemapId(id, idMap)).filter(Boolean),
      spouses: (p.spouses || []).map(s => Object.assign({}, s, {
        personId: gedRemapId(s.personId, idMap)
      })).filter(s => s.personId)
    });
    // Dedupe parents
    copy.parentIds = copy.parentIds.filter((id, i, a) => a.indexOf(id) === i);
    return copy;
  });

  return { toAdd: remappedAdd, merged, idMap, ambiguous };
}

/**
 * Append / merge imported people into STATE; create empty plans/cases for new ids.
 * Conflict policy: unique name+year match → fill empty fields; else add with new id.
 */
function applyGedcomImport(){
  if(!PENDING_GEDCOM || !PENDING_GEDCOM.people || !PENDING_GEDCOM.people.length){
    if(typeof showToast === 'function') showToast('Nothing to import');
    return { added: 0, merged: 0 };
  }
  const batch = PENDING_GEDCOM.people;
  const planned = planGedcomMerge(batch, STATE.people);

  planned.merged.forEach(function(m){
    const existing = STATE.people.find(p => p.id === m.existingId);
    if(!existing) return;
    gedMergeFill(existing, m.incoming);
    // Union remapped parents / spouses from the incoming graph
    const mappedParents = (m.incoming.parentIds || []).map(id => gedRemapId(id, planned.idMap)).filter(Boolean);
    existing.parentIds = existing.parentIds || [];
    mappedParents.forEach(pid => {
      if(existing.parentIds.indexOf(pid) < 0) existing.parentIds.push(pid);
    });
    existing.spouses = existing.spouses || [];
    (m.incoming.spouses || []).forEach(s => {
      const pid = gedRemapId(s.personId, planned.idMap);
      if(!pid) return;
      if(!existing.spouses.some(x => x.personId === pid)){
        existing.spouses.push({ personId: pid, note: s.note || '' });
      }
    });
    if(typeof syncSpouses === 'function') syncSpouses(existing);
  });

  planned.toAdd.forEach(p => {
    STATE.people.push(p);
    if(typeof ensurePlan === 'function') ensurePlan(p.id);
    if(typeof ensureCase === 'function') ensureCase(p.id);
    if(typeof syncSpouses === 'function') syncSpouses(p);
  });

  const added = planned.toAdd.length;
  const mergedN = planned.merged.length;
  const warn = (PENDING_GEDCOM.warnings || 0) + (planned.ambiguous || 0);
  PENDING_GEDCOM = null;
  const overlay = document.getElementById('gedcomOverlay');
  if(overlay) overlay.classList.remove('open');
  if(typeof renderAll === 'function') renderAll();
  if(typeof saveData === 'function') saveData();
  if(typeof showToast === 'function'){
    const parts = [];
    if(added) parts.push('added ' + added);
    if(mergedN) parts.push('merged ' + mergedN);
    showToast('GEDCOM import: ' + (parts.join(', ') || 'no changes')
      + (warn ? (' (' + warn + ' warning' + (warn === 1 ? '' : 's') + ')') : ''));
  }
  return { added: added, merged: mergedN, warnings: warn, ambiguous: planned.ambiguous };
}

function cancelGedcomImport(){
  PENDING_GEDCOM = null;
  const overlay = document.getElementById('gedcomOverlay');
  if(overlay) overlay.classList.remove('open');
}

function previewGedcomImport(text, fileName){
  const result = gedcomToPeople(text);
  if(!result.people.length){
    throw new Error('No individuals with names found in this GEDCOM');
  }
  const planned = planGedcomMerge(result.people, STATE.people);
  result.mergePreview = {
    add: planned.toAdd.length,
    merge: planned.merged.length,
    ambiguous: planned.ambiguous
  };
  PENDING_GEDCOM = result;
  const summary = document.getElementById('gedcomSummary');
  if(summary){
    summary.textContent = '"' + (fileName || 'file') + '" has '
      + result.indiCount + ' individual' + (result.indiCount === 1 ? '' : 's')
      + ' and ' + result.famCount + ' famil' + (result.famCount === 1 ? 'y' : 'ies')
      + '. Forebear will add ' + planned.toAdd.length
      + ' new ' + (planned.toAdd.length === 1 ? 'person' : 'people')
      + (planned.merged.length
        ? (' and merge ' + planned.merged.length + ' by matching name + birth year')
        : '')
      + '. Empty fields on matches are filled; existing facts are kept.'
      + (planned.ambiguous
        ? (' ' + planned.ambiguous + ' ambiguous name match'
          + (planned.ambiguous === 1 ? '' : 'es') + ' will be added as new.')
        : '')
      + (result.warnings
        ? (' ' + result.warnings + ' line' + (result.warnings === 1 ? '' : 's') + ' skipped or incomplete.')
        : '');
  }
  const overlay = document.getElementById('gedcomOverlay');
  if(overlay) overlay.classList.add('open');
  return result;
}

function initGedcomImport(){
  const input = document.getElementById('gedcomFile');
  if(!input || input._gedBound) return;
  input._gedBound = true;
  input.addEventListener('change', async function(e){
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!file) return;
    try{
      const text = await file.text();
      if(!/\bINDI\b/i.test(text) && !/\bHEAD\b/i.test(text)){
        throw new Error('this does not look like a GEDCOM file');
      }
      previewGedcomImport(text, file.name);
    }catch(err){
      alert('Could not import GEDCOM: ' + (err && err.message));
    }
  });
}

if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initGedcomImport);
  } else {
    setTimeout(initGedcomImport, 0);
  }
}
