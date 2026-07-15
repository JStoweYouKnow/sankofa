// ---------------------------------------------------------------
// Forebear LLM proxy (optional)
 // Browser clients cannot call OpenAI directly (CORS + key exposure),
// so the app posts here with the researcher's own key. The key is
// forwarded in Authorization and never logged or stored server-side.
//
 // POST /api/llm
 //   Authorization: Bearer <openai-api-key>
 //   body: { model?, messages: [{role,content}], temperature?, response_format? }
 //   -> OpenAI-compatible chat completion JSON
//
 // Optional env:
 //   OPENAI_BASE_URL  (default https://api.openai.com/v1)
 //   LLM_MAX_TOKENS   (default 1200)
 // ---------------------------------------------------------------

const MAX_BODY = 120_000;
const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MAX_TOKENS = 1200;

function send(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

async function readBody(req){
  if(req.body !== undefined && req.body !== null){
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req){
    raw += chunk;
    if(raw.length > MAX_BODY) throw new Error('body_too_large');
  }
  return raw ? JSON.parse(raw) : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if(req.method === 'OPTIONS'){ res.statusCode = 204; res.end(); return; }
  if(req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  try{
    const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if(!key) return send(res, 401, { error: 'Missing API key. Paste your OpenAI key under Connect data sources.' });

    let body;
    try{ body = await readBody(req); }
    catch(e){
      if(String(e.message) === 'body_too_large') return send(res, 413, { error: 'Request too large.' });
      return send(res, 400, { error: 'Invalid JSON body.' });
    }
    if(!body || !Array.isArray(body.messages) || !body.messages.length){
      return send(res, 400, { error: 'messages[] required' });
    }

    const model = String(body.model || 'gpt-4o-mini').slice(0, 80);
    const temperature = typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.3;
    const max_tokens = Math.min(
      Number(process.env.LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS,
      typeof body.max_tokens === 'number' ? body.max_tokens : DEFAULT_MAX_TOKENS
    );
    const base = (process.env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');

    const upstream = {
      model,
      messages: body.messages.slice(0, 20).map(m => ({
        role: String(m.role || 'user').slice(0, 20),
        content: String(m.content || '').slice(0, 40_000)
      })),
      temperature,
      max_tokens
    };
    if(body.response_format) upstream.response_format = body.response_format;

    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(upstream)
    });
    const text = await r.text();
    let data;
    try{ data = JSON.parse(text); }
    catch(_){ data = { error: { message: text.slice(0, 500) } }; }

    if(!r.ok){
      const msg = (data && data.error && data.error.message) || ('Upstream HTTP ' + r.status);
      return send(res, r.status === 401 ? 401 : 502, { error: msg });
    }
    return send(res, 200, data);
  }catch(e){
    console.error('llm proxy', e && e.message);
    return send(res, 500, { error: 'LLM proxy failed.' });
  }
};
