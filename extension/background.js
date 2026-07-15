// Forebear Companion — background service worker (MV3)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(!msg || msg.source !== 'forebear-companion') return;
  if(msg.type === 'capture-saved'){
    chrome.action.setBadgeText({ text: String(msg.count || '') });
    chrome.action.setBadgeBackgroundColor({ color: '#2c3a55' });
    sendResponse({ ok: true });
    return true;
  }
  if(msg.type === 'clear-badge'){
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
    return true;
  }
});
