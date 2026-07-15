const statusEl = document.getElementById('status');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || '';
}

document.getElementById('captureBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus('No active tab.', 'warn');
    return;
  }
  if (!/familysearch\.org/i.test(tab.url || '')) {
    setStatus('Open a FamilySearch results page first.', 'warn');
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      source: 'forebear-companion',
      type: 'capture'
    });
    if (!res || !res.ok) {
      setStatus((res && res.error) || 'Capture failed — reload the FamilySearch tab.', 'warn');
      return;
    }
    const n = (res.hits && res.hits.length) || 0;
    setStatus(n ? ('Saved ' + n + ' hits. Open Forebear → Connect → Review capture.') : 'No ark:/ result links found on this page.', n ? 'ok' : 'warn');
  } catch (e) {
    setStatus('Could not reach the page. Reload FamilySearch and try again.', 'warn');
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.storage.local.remove(['forebearCapture'], () => {
    chrome.runtime.sendMessage({ source: 'forebear-companion', type: 'clear-badge' });
    setStatus('Cleared saved capture.', 'ok');
  });
});

chrome.storage.local.get(['forebearCapture'], (data) => {
  const cap = data && data.forebearCapture;
  const n = cap && Array.isArray(cap.hits) ? cap.hits.length : 0;
  if (n) setStatus(n + ' hit(s) waiting in Forebear.', 'ok');
});
