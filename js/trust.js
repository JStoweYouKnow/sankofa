// ---------------------------------------------------------------
 // Trust / provenance labels (Phase G)
 // Shared chips for lead | hypothesis | confirmed | ruled_out.
 // Rule-based surfaces stay authoritative; LLM polish cannot upgrade
 // a claim to "confirmed." Loaded after africa.js / app.js (needs esc).
 // ---------------------------------------------------------------

const TRUST_CLASSES = {
  lead: {
    label: 'Lead',
    note: 'A working lead to test — a shared surname is never proof of enslavement.'
  },
  hypothesis: {
    label: 'Hypothesis',
    note: 'Plausible claim under test. Needs named sources before confirmation.'
  },
  confirmed: {
    label: 'Confirmed',
    note: 'Supported by a documentary source you logged and verified.'
  },
  ruled_out: {
    label: 'Ruled out',
    note: 'Tested and set aside for this case.'
  }
};

function trustEsc(str){
  if(typeof esc === 'function') return esc(str);
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/**
 * Normalize plan / case / confidence / candidate statuses into a trust class.
 */
function trustNormalize(status){
  const raw = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  const s = raw.replace(/-/g, '_');
  if(s === 'ruled_out' || s === 'dead_end' || s === 'nothing') return 'ruled_out';
  if(s === 'confirmed' || s === 'documentary' || s === 'found') return 'confirmed';
  if(s === 'hypothesis' || s === 'promising' || s === 'oral' || s === 'dna_supported') return 'hypothesis';
  if(s === 'lead' || s === 'untested' || s === 'to_research' || s === 'speculative' || s === 'opened') return 'lead';
  if(TRUST_CLASSES[s]) return s;
  return 'lead';
}

/**
 * HTML chip for a trust class. Never invents citations — label only.
 */
function trustBadge(status, opts){
  opts = opts || {};
  const cls = trustNormalize(status);
  const meta = TRUST_CLASSES[cls] || TRUST_CLASSES.lead;
  const label = opts.label || meta.label;
  const title = opts.title || meta.note;
  const extra = opts.className ? (' ' + opts.className) : '';
  return `<span class="trust-badge trust-${trustEsc(cls)}${trustEsc(extra)}" title="${trustEsc(title)}" data-trust="${trustEsc(cls)}">${trustEsc(label)}</span>`;
}

/** Map Discovery interpret lenses → trust (hits are never auto-confirmed). */
function trustFromLens(lens){
  const l = String(lens || '');
  if(l === 'enslaver-lead' || l === 'runaway' || l === 'general' || l === 'place-history') return 'lead';
  if(l === 'freedperson' || l === 'bureau' || l === 'military' || l === 'family-ad') return 'hypothesis';
  return 'lead';
}

/** Map documentary confidence vocabulary → trust (for Bridge synthesis). */
function trustFromConfidence(level){
  const s = String(level || '').toLowerCase();
  if(s === 'documentary') return 'confirmed';
  if(s === 'dna-supported' || s === 'oral') return 'hypothesis';
  return 'lead';
}

/**
 * LLM / agent may never upgrade a claim to confirmed.
 * Returns the safe status to keep.
 */
function trustClampUpgrade(proposed, previous){
  const next = trustNormalize(proposed);
  const prev = previous != null && previous !== '' ? trustNormalize(previous) : 'lead';
  if(next === 'confirmed' && prev !== 'confirmed') return prev;
  return next;
}

/** Confidence levels AI may set — never documentary/confirmed. */
function trustClampConfidence(level){
  const s = String(level || 'speculative').toLowerCase();
  if(s === 'documentary' || s === 'confirmed') return 'speculative';
  if(CONFIDENCE_LEVELS && CONFIDENCE_LEVELS[s]) return s;
  return 'speculative';
}

function coachDeriveTrust(c){
  const chip = String((c && c.chip) || '').toLowerCase();
  const key = String((c && c.key) || '');
  if(/hypothesis/.test(chip)) return 'hypothesis';
  if(key === 'confirm') return 'hypothesis';
  if(/test lead|case:/.test(chip)) return 'lead';
  return 'lead';
}

function coachAttachTrust(c){
  if(!c || typeof c !== 'object') return c;
  if(!c.trust) c.trust = coachDeriveTrust(c);
  else c.trust = trustNormalize(c.trust);
  // Coach CTAs are never "confirmed" proof claims
  if(c.trust === 'confirmed') c.trust = 'hypothesis';
  return c;
}

/**
 * Merge AI coach polish — wording only; freeze key, kinds, trust.
 */
function llmMergeCoachEnhance(base, out){
  const next = Object.assign({}, base);
  if(out && out.headline) next.headline = String(out.headline).slice(0, 180);
  if(out && out.why) next.why = String(out.why).slice(0, 400);
  next._llm = true;
  next.key = base.key;
  next.chip = base.chip;
  next.primary = base.primary;
  next.secondary = base.secondary;
  next.trust = base.trust || coachDeriveTrust(base);
  if(out && out.trust){
    next.trust = trustClampUpgrade(out.trust, next.trust);
  }
  if(out && out.primary && out.primary.kind && base.primary && out.primary.kind !== base.primary.kind){
    // ignore kind changes from model
    next.primary = base.primary;
  }
  return coachAttachTrust(next);
}
