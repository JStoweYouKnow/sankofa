// Content script — Forebear app origins (localhost / Vercel)
(function () {
  const SOURCE_PAGE = 'forebear';
  const SOURCE_EXT = 'forebear-companion';

  function reply(data) {
    window.postMessage(Object.assign({ source: SOURCE_EXT, v: 1 }, data), '*');
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.source !== SOURCE_PAGE || msg.v !== 1) return;

    if (msg.type === 'ping') {
      reply({ type: 'pong' });
      return;
    }

    if (msg.type === 'request-hits') {
      chrome.storage.local.get(['forebearCapture'], function (data) {
        const cap = data && data.forebearCapture;
        reply({
          type: 'hits',
          hits: (cap && Array.isArray(cap.hits) ? cap.hits : []),
          pageUrl: (cap && cap.pageUrl) || '',
          capturedAt: (cap && cap.capturedAt) || 0
        });
      });
      return;
    }

    if (msg.type === 'clear-hits') {
      chrome.storage.local.remove(['forebearCapture'], function () {
        chrome.runtime.sendMessage({ source: SOURCE_EXT, type: 'clear-badge' });
        reply({ type: 'hits-cleared' });
      });
    }
  });

  // Announce presence once on load
  reply({ type: 'pong' });
})();
