// ---------------------------------------------------------------
// Optional family sync.
// The app stays local-first: everything works without this. When a
// sync endpoint is configured (rail footer → "Family sync"), the app
// pulls the family's shared payload, merges it with local data via
// mergeStates() (per-record newest-wins with deletion tombstones),
// and pushes the merged result back. api/sync.js in this repo is a
// ready-to-deploy endpoint; anything that speaks the same GET/PUT
// contract works too.
//
// The passphrase is stored locally (like the API keys) and sent only
// to the configured endpoint as a bearer token — use HTTPS.
// ---------------------------------------------------------------

const SYNC_KEY = 'forebear-sync-v1';
let SYNC = { endpoint: '', code: '', passphrase: '', lastSyncAt: 0 };
let syncing = false;
let syncTimer = null;

function syncConfigured(){
  return !!(SYNC.endpoint && SYNC.code && SYNC.passphrase);
}

async function initSync(){
  try{
    const res = await storage.get(SYNC_KEY, false);
    if(res && res.value) SYNC = Object.assign(SYNC, JSON.parse(res.value));
  }catch(e){
    // not configured yet
  }
  renderSyncRail();
  if(syncConfigured()) await syncNow();
}
async function persistSyncConfig(){
  try{
    await storage.set(SYNC_KEY, JSON.stringify(SYNC), false);
  }catch(e){
    console.error('sync config save failed', e);
  }
}

function openSyncModal(){
  document.getElementById('syncEndpoint').value = SYNC.endpoint;
  document.getElementById('syncCode').value = SYNC.code;
  document.getElementById('syncPass').value = SYNC.passphrase;
  if(!syncConfigured()) setSyncStatus('Not configured — your data stays in this browser only.');
  document.getElementById('syncOverlay').classList.add('open');
}
async function saveSyncConfig(){
  SYNC.endpoint = document.getElementById('syncEndpoint').value.trim();
  SYNC.code = document.getElementById('syncCode').value.trim();
  SYNC.passphrase = document.getElementById('syncPass').value;
  await persistSyncConfig();
  if(syncConfigured()){
    syncNow(true);
  }else{
    setSyncStatus('Fill in all three fields to enable sync.', true);
  }
}
async function disableSync(){
  SYNC = { endpoint: '', code: '', passphrase: '', lastSyncAt: 0 };
  await persistSyncConfig();
  document.getElementById('syncEndpoint').value = '';
  document.getElementById('syncCode').value = '';
  document.getElementById('syncPass').value = '';
  setSyncStatus('Sync is off — nothing was deleted; your data stays in this browser.');
}
function setSyncStatus(msg, isError){
  const el = document.getElementById('syncStatus');
  if(el){
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
  }
  renderSyncRail();
}
function renderSyncRail(){
  const el = document.getElementById('syncRailStatus');
  const privacy = document.getElementById('privacyNote');
  if(el){
    if(syncConfigured()){
      const when = SYNC.lastSyncAt ? new Date(SYNC.lastSyncAt).toLocaleString() : 'not yet';
      el.textContent = 'Syncing as "' + SYNC.code + '" · last: ' + when;
      el.hidden = false;
    }else{
      el.textContent = '';
      el.hidden = true;
    }
  }
  if(privacy){
    privacy.textContent = syncConfigured()
      ? 'Local copy plus optional family sync — share the code and passphrase only with people you trust.'
      : 'Data stays in this browser unless you export a backup or turn on Family sync.';
  }
}

// Called by saveData() after every local change; debounced so a burst
// of edits becomes one sync.
function scheduleSync(){
  if(!syncConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>syncNow(), 2500);
}

function syncUrl(){
  return SYNC.endpoint.replace(/\/+$/, '') + '?code=' + encodeURIComponent(SYNC.code);
}

async function syncNow(){
  if(!syncConfigured() || syncing) return;
  syncing = true;
  setSyncStatus('Syncing…');
  try{
    const headers = { 'Authorization': 'Bearer ' + SYNC.passphrase, 'Content-Type': 'application/json' };
    let remote = null;
    const res = await fetch(syncUrl(), { headers });
    if(res.status !== 404){
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if(data && data.payload) remote = data.payload;
    }
    if(remote){
      setState(mergeStates(currentPayload(), migrate(remote)));
      renderAll();
      await saveData(false);
    }
    const put = await fetch(syncUrl(), { method: 'PUT', headers, body: JSON.stringify(currentPayload()) });
    if(!put.ok) throw new Error('HTTP ' + put.status);
    SYNC.lastSyncAt = Date.now();
    await persistSyncConfig();
    setSyncStatus('Synced ' + new Date(SYNC.lastSyncAt).toLocaleTimeString() + ' — sharing as "' + SYNC.code + '".');
  }catch(e){
    setSyncStatus(syncErrorMessage(e), true);
  }finally{
    syncing = false;
  }
}

function syncErrorMessage(e){
  const msg = (e && e.message) || '';
  if(msg === 'HTTP 401') return 'Wrong passphrase for this family code.';
  if(msg === 'HTTP 400') return 'The endpoint rejected the request — family codes are 3–40 letters, numbers, dashes, or underscores.';
  if(msg === 'HTTP 413') return 'The payload is too large for the sync server.';
  if(msg.startsWith('HTTP 5')) return 'The sync server errored (' + msg + ') — is its storage configured?';
  if(msg.startsWith('HTTP')) return 'Sync failed (' + msg + ').';
  return 'Could not reach the sync endpoint — check the URL and your connection.';
}
