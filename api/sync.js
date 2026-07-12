// ---------------------------------------------------------------
// Forebear family sync endpoint (optional — see README "Family sync").
//
// Deploy this repo to Vercel and attach an Upstash Redis integration
// from the Vercel Marketplace; this function reads whichever env-var
// pair the integration provides (KV_REST_API_* or UPSTASH_REDIS_REST_*)
// and talks to Redis over its REST API. Zero npm dependencies.
//
// Contract (the app's js/sync.js speaks this):
//   GET  /api/sync?code=<family-code>   Authorization: Bearer <passphrase>
//     -> 200 {payload, updatedAt} | 404 if the code has no data yet
//   PUT  /api/sync?code=<family-code>   Authorization: Bearer <passphrase>
//     body: the Forebear payload {schemaVersion, people, logs, ...}
//     -> 200 {ok:true}
// The first PUT for a code claims it: the passphrase's hash is stored
// and every later request must present the same passphrase.
// ---------------------------------------------------------------
const crypto = require('crypto');

const MAX_BYTES = 2 * 1024 * 1024;

function redisEnv(){
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(env, command){
  const res = await fetch(env.url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if(!res.ok) throw new Error('storage returned ' + res.status);
  const data = await res.json();
  if(data.error) throw new Error('storage error: ' + data.error);
  return data.result;
}
function send(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
async function readBody(req){
  if(req.body !== undefined && req.body !== null){
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}
function hashPass(code, pass){
  return crypto.createHash('sha256').update(code + ':' + pass).digest('hex');
}
function hashesMatch(a, b){
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = async (req, res) => {
  // The app may be served from any origin (or file://), so allow all.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if(req.method === 'OPTIONS'){ res.statusCode = 204; res.end(); return; }

  try{
    const env = redisEnv();
    if(!env) return send(res, 500, { error: 'Storage not configured — attach an Upstash Redis integration (KV_REST_API_URL/TOKEN).' });

    const code = (new URL(req.url, 'http://internal').searchParams.get('code') || '').trim();
    const pass = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if(!/^[A-Za-z0-9_-]{3,40}$/.test(code)) return send(res, 400, { error: 'Family code must be 3-40 letters, numbers, dashes, or underscores.' });
    if(!pass) return send(res, 401, { error: 'Missing passphrase.' });

    const key = 'forebear:' + code;
    const hash = hashPass(code, pass);
    const raw = await redis(env, ['GET', key]);
    const record = raw ? JSON.parse(raw) : null;
    if(record && !hashesMatch(record.passHash, hash)) return send(res, 401, { error: 'Wrong passphrase for this family code.' });

    if(req.method === 'GET'){
      if(!record) return send(res, 404, { error: 'No data for this family code yet.' });
      return send(res, 200, { payload: record.payload, updatedAt: record.updatedAt });
    }
    if(req.method === 'PUT'){
      let payload;
      try{
        payload = await readBody(req);
      }catch(e){
        return send(res, 400, { error: 'Body must be JSON.' });
      }
      if(!payload || !Array.isArray(payload.people) || !Array.isArray(payload.logs)){
        return send(res, 400, { error: 'Payload must be a Forebear backup ({people, logs, ...}).' });
      }
      const updatedAt = Date.now();
      const serialized = JSON.stringify({ passHash: hash, payload, updatedAt });
      if(serialized.length > MAX_BYTES) return send(res, 413, { error: 'Payload too large.' });
      await redis(env, ['SET', key, serialized]);
      return send(res, 200, { ok: true, updatedAt });
    }
    return send(res, 405, { error: 'Use GET or PUT.' });
  }catch(e){
    return send(res, 502, { error: 'Sync storage unavailable: ' + (e && e.message) });
  }
};
