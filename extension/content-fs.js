// Content script — FamilySearch tabs
(function () {
  function isResultsPage() {
    const path = location.pathname || '';
    return /\/search\/record\/results/i.test(path) || /\/search\/linker/i.test(path) || /\/ark:\//i.test(path);
  }

  function captureNow() {
    const parse = typeof parseFamilySearchResults === 'function' ? parseFamilySearchResults : null;
    if (!parse) {
      return { ok: false, error: 'Parser missing', hits: [] };
    }
    let hits = [];
    try {
      hits = parse(document, location.href) || [];
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Parse failed', hits: [] };
    }
    return { ok: true, hits: hits, pageUrl: location.href };
  }

  function saveHits(hits) {
    const payload = {
      v: 1,
      capturedAt: Date.now(),
      pageUrl: location.href,
      hits: hits
    };
    chrome.storage.local.set({ forebearCapture: payload }, function () {
      chrome.runtime.sendMessage({
        source: 'forebear-companion',
        type: 'capture-saved',
        count: hits.length
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.source !== 'forebear-companion') return;
    if (msg.type === 'capture') {
      const res = captureNow();
      if (res.ok) saveHits(res.hits);
      sendResponse(res);
      return true;
    }
    if (msg.type === 'ping-tab') {
      sendResponse({ ok: true, resultsPage: isResultsPage(), href: location.href });
      return true;
    }
  });

  // Lightweight Capture control on results pages (user gesture only).
  function ensureFab() {
    if (!isResultsPage()) return;
    if (document.getElementById('forebear-capture-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'forebear-capture-fab';
    btn.type = 'button';
    btn.textContent = 'Capture for Forebear';
    btn.setAttribute('style', [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483646',
      'padding:10px 14px',
      'font:600 13px/1.2 system-ui,sans-serif',
      'color:#f4efe6',
      'background:#2c3a55',
      'border:1px solid #1a2233',
      'border-radius:2px',
      'cursor:pointer',
      'box-shadow:0 2px 10px rgba(0,0,0,0.25)'
    ].join(';'));
    btn.addEventListener('click', function () {
      const res = captureNow();
      if (!res.ok) {
        btn.textContent = 'Nothing to capture';
        setTimeout(function () { btn.textContent = 'Capture for Forebear'; }, 1800);
        return;
      }
      saveHits(res.hits);
      btn.textContent = res.hits.length ? ('Saved ' + res.hits.length + ' hits') : 'No ark links found';
      setTimeout(function () { btn.textContent = 'Capture for Forebear'; }, 2200);
    });
    document.documentElement.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureFab);
  } else {
    ensureFab();
  }
  setTimeout(ensureFab, 1500);
})();
