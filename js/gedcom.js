// ---------------------------------------------------------------
// GEDCOM 5.5.x import (Phase F)
// Parses INDI/FAM subset into Forebear people with new ids.
// Never invents citations; skips malformed lines with a warning count.
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
 * Convert parsed GEDCOM into Forebear people (new ids). Does not mutate STATE.
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

/**
 * Append imported people to STATE; create empty plans/cases.
 * Conflict policy: always new ids (no merge-by-name).
 */
function applyGedcomImport(){
  if(!PENDING_GEDCOM || !PENDING_GEDCOM.people || !PENDING_GEDCOM.people.length){
    if(typeof showToast === 'function') showToast('Nothing to import');
    return { added: 0 };
  }
  const batch = PENDING_GEDCOM.people;
  batch.forEach(p => {
    STATE.people.push(p);
    if(typeof ensurePlan === 'function') ensurePlan(p.id);
    if(typeof ensureCase === 'function') ensureCase(p.id);
    if(typeof syncSpouses === 'function') syncSpouses(p);
  });
  const n = batch.length;
  const warn = PENDING_GEDCOM.warnings || 0;
  PENDING_GEDCOM = null;
  const overlay = document.getElementById('gedcomOverlay');
  if(overlay) overlay.classList.remove('open');
  if(typeof renderAll === 'function') renderAll();
  if(typeof saveData === 'function') saveData();
  if(typeof showToast === 'function'){
    showToast('Imported ' + n + ' people from GEDCOM'
      + (warn ? (' (' + warn + ' warning' + (warn === 1 ? '' : 's') + ')') : ''));
  }
  return { added: n, warnings: warn };
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
  PENDING_GEDCOM = result;
  const summary = document.getElementById('gedcomSummary');
  if(summary){
    summary.textContent = '"' + (fileName || 'file') + '" has '
      + result.indiCount + ' individual' + (result.indiCount === 1 ? '' : 's')
      + ' and ' + result.famCount + ' famil' + (result.famCount === 1 ? 'y' : 'ies')
      + '. Forebear will add ' + result.people.length + ' people with new ids'
      + ' (parents/spouses linked) and empty research plans.'
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
