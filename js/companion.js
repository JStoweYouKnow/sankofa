// ---------------------------------------------------------------
 // Forebear ↔ browser companion (Phase C)
 // Optional Chrome MV3 extension. Page talks via window.postMessage;
 // extension content script bridges chrome.storage captures.
 // Core research never requires the companion.
 // ---------------------------------------------------------------

const COMPANION_MSG_V = 1;
const COMPANION_PAGE = 'forebear';
const COMPANION_EXT = 'forebear-companion';

var COMPANION = {
  connected: false,
  pendingHits: [],
  pageUrl: '',
  capturedAt: 0,
  lastPongAt: 0
};

function companionValidateMessage(msg){
  if(!msg || typeof msg !== 'object') return false;
  if(msg.v !== COMPANION_MSG_V) return false;
  if(msg.source !== COMPANION_EXT && msg.source !== COMPANION_PAGE) return false;
  const types = ['ping', 'pong', 'hits', 'request-hits', 'clear-hits', 'hits-cleared', 'capture-saved'];
  if(types.indexOf(msg.type) < 0) return false;
  if(msg.type === 'hits' && msg.hits != null && !Array.isArray(msg.hits)) return false;
  return true;
}

function companionPost(payload){
  window.postMessage(Object.assign({
    source: COMPANION_PAGE,
    v: COMPANION_MSG_V
  }, payload), '*');
}

function companionPing(){
  companionPost({ type: 'ping' });
}

function companionRequestHits(){
  companionPost({ type: 'request-hits' });
}

function companionClearRemote(){
  companionPost({ type: 'clear-hits' });
}

function updateCompanionStatus(){
  const el = document.getElementById('statusCompanion');
  if(!el) return;
  if(COMPANION.connected){
    const n = COMPANION.pendingHits.length;
    const extra = n ? (' · ' + n + ' hit' + (n === 1 ? '' : 's') + ' ready') : '';
    el.innerHTML = `<span class="key-dot on"></span> Companion connected${esc(extra)}`;
  } else {
    el.innerHTML = `<span class="key-dot"></span> Not installed — see extension/README.md`;
  }
  const reviewBtn = document.getElementById('companionReviewBtn');
  if(reviewBtn){
    reviewBtn.style.display = COMPANION.pendingHits.length ? '' : 'none';
    reviewBtn.textContent = COMPANION.pendingHits.length
      ? ('Review capture (' + COMPANION.pendingHits.length + ')')
      : 'Review capture';
  }
}

function companionNormalizeHit(h){
  if(!h || typeof h !== 'object') return null;
  const label = String(h.label || '').trim();
  const url = String(h.url || '').trim();
  if(!label || !url) return null;
  const pageText = h.excerpt || h.pageText || '';
  const norm = typeof normalizeExcerpt === 'function'
    ? normalizeExcerpt(pageText)
    : { text: String(pageText || '').trim(), truncated: false };
  const out = {
    label: label.slice(0, 220),
    url,
    year: typeof h.year === 'number' && h.year > 0 ? h.year : null,
    note: String(h.note || 'Captured via Forebear Companion — review before logging.'),
    source: 'companion',
    type: h.type || 'Other',
    preview: null
  };
  if(norm.text){
    out.excerpt = norm.text;
    out.excerptTruncated = !!norm.truncated;
  }
  return out;
}

function companionReceiveHits(hits, meta){
  meta = meta || {};
  const list = Array.isArray(hits) ? hits.map(companionNormalizeHit).filter(Boolean) : [];
  COMPANION.pendingHits = list;
  COMPANION.pageUrl = meta.pageUrl || '';
  COMPANION.capturedAt = meta.capturedAt || Date.now();
  updateCompanionStatus();
  if(list.length) showToast(list.length + ' companion hit' + (list.length === 1 ? '' : 's') + ' ready to review');
  else showToast('No companion hits waiting');
}

function companionConfirmImport(){
  const hits = COMPANION.pendingHits.slice();
  if(!hits.length){
    showToast('Nothing to import — capture on FamilySearch first');
    return;
  }
  hits.forEach(h => {
    if(typeof cacheResult === 'function') cacheResult(h);
  });
  companionRenderLiveSection(hits);
  if(typeof applyDiscoveryFilters === 'function') applyDiscoveryFilters();
  if(typeof refreshHitInsightPanel === 'function') refreshHitInsightPanel();
  if(typeof agentOnCompanionImport === 'function') agentOnCompanionImport(hits.length);
  COMPANION.pendingHits = [];
  companionClearRemote();
  updateCompanionStatus();
  const panel = document.getElementById('companionReview');
  if(panel) panel.innerHTML = '';
  showToast('Imported ' + hits.length + ' companion hit' + (hits.length === 1 ? '' : 's') + ' for review');
}

function companionDismissPending(){
  COMPANION.pendingHits = [];
  companionClearRemote();
  updateCompanionStatus();
  const panel = document.getElementById('companionReview');
  if(panel) panel.innerHTML = '';
  showToast('Cleared companion capture');
}

function companionRenderLiveSection(hits){
  const grid = document.getElementById('liveResults');
  if(!grid || !hits.length) return;
  let host = document.getElementById('liveCompanion');
  if(!host){
    host = document.createElement('div');
    host.className = 'live-source';
    host.id = 'liveCompanion';
    if(grid.appendChild) grid.appendChild(host);
    else return;
  }
  const cards = hits.map(h => {
    const idx = (typeof RESULT_CACHE !== 'undefined') ? RESULT_CACHE.lastIndexOf(h) : -1;
    const year = h.year ? `<div class="result-meta">${esc(String(h.year))}</div>` : '';
    const ctx = (typeof LAST_DISCOVERY_CTX !== 'undefined' && LAST_DISCOVERY_CTX) || {};
    const interp = typeof interpretHitHtml === 'function' ? interpretHitHtml(h, ctx, { idx }) : '';
    return `<div class="result-card">
      <div class="result-left">
        <div class="source-tag">Companion · FamilySearch</div>
        <div class="result-label"><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.label)}</a></div>
        ${year}
        <div class="result-note">${esc(h.note || '')}</div>
        ${interp}
      </div>
      <div class="result-actions">
        ${idx >= 0 ? `<button type="button" class="btn btn-ghost btn-small" data-excerpt-idx="${idx}">${h.excerpt ? 'Edit page text' : 'Add page text'}</button>` : ''}
        <a class="btn btn-small" href="${esc(h.url)}" target="_blank" rel="noopener">Open</a>
      </div>
    </div>`;
  }).join('');
  host.innerHTML = `<div class="live-source-head">Companion capture</div>${cards}`;
}

function companionShowReview(){
  companionRequestHits();
  const panel = document.getElementById('companionReview');
  if(!panel) return;
  // Allow message round-trip then paint from COMPANION.pendingHits
  setTimeout(function(){
    const hits = COMPANION.pendingHits;
    if(!hits.length){
      panel.innerHTML = `<div class="field-hint">No capture waiting. On FamilySearch, open search results and click Capture for Forebear.</div>`;
      return;
    }
    panel.innerHTML = `<div class="companion-review">
      <div class="case-section-label">Review companion capture</div>
      <p class="field-hint">These links came from a page you opened while logged in. Confirm to show them in Discovery Hit reading — nothing is written to the Research Log yet.</p>
      <ul class="companion-hit-list">${hits.map(h =>
        `<li><a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.label)}</a>${h.year ? ' · ' + esc(String(h.year)) : ''}</li>`
      ).join('')}</ul>
      <div class="plan-actions">
        <button type="button" class="btn btn-small" onclick="companionConfirmImport()">Confirm import</button>
        <button type="button" class="btn btn-ghost btn-small" onclick="companionDismissPending()">Discard</button>
      </div>
    </div>`;
  }, 120);
}

function initCompanion(){
  window.addEventListener('message', function(ev){
    if(ev.source !== window) return;
    const msg = ev.data;
    if(!companionValidateMessage(msg)) return;
    if(msg.source !== COMPANION_EXT) return;
    if(msg.type === 'pong'){
      COMPANION.connected = true;
      COMPANION.lastPongAt = Date.now();
      updateCompanionStatus();
      companionRequestHits();
      return;
    }
    if(msg.type === 'hits'){
      companionReceiveHits(msg.hits, { pageUrl: msg.pageUrl, capturedAt: msg.capturedAt });
      return;
    }
    if(msg.type === 'hits-cleared'){
      COMPANION.pendingHits = [];
      updateCompanionStatus();
    }
  });
  companionPing();
  // Skip keep-alive ping loop under Node (smoke tests).
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if(!isNode){
    setInterval(function(){
      companionPing();
      if(COMPANION.lastPongAt && Date.now() - COMPANION.lastPongAt > 8000){
        COMPANION.connected = false;
        updateCompanionStatus();
      }
    }, 4000);
  }
  updateCompanionStatus();
}

if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initCompanion);
  } else {
    setTimeout(initCompanion, 0);
  }
}
