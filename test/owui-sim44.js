// Prompt 44: falsk Open WebUI som oppfører seg som brukerens (0.12.3 på :8080), brukt av test/p44-ai-backends.test.js og
// selvtest-skriptet. Injiseres som fetch (ingen nettverk).
//   - Bearer-nøkkel kreves (401 ellers – og som noen ekte servere gjentar den nøkkelen som ble sendt i feilteksten).
//   - GET /api/models (OpenAI-format, owned_by:'ollama').
//   - POST /api/chat/completions: OpenAI SSE (data: {choices:[{delta:{content}}]} … data: [DONE]) med usage til slutt. Sender alt
//     videre til den falske Ollama-en (test/ollama-sim43.js) med samme begrensninger: én om gangen, utlasting bryter strømmen.
//     Bilder (image_url med data-URL) → images, params.num_ctx/num_predict/temperature → options, keep_alive (params eller topp),
//     response_format json_object / format → format.
//   - think: forwardThink:true (standard) sender think (toppfelt eller params.think) videre; forwardThink:false sender det IKKE
//     videre, så qwen3 tenker (varianten der Glimt må gå direkte til Ollama). Tenkingen kommer som delta.reasoning_content, eller
//     som <think>…</think> i content med thinkTags:true.
//   - POST /api/v1/retrieval/process/web/search {queries:[q]} (eller {query:q} med webShape:'old'): mock-treff (webHits).
const enc = new TextEncoder();
export const BURNHAM_HITS = [
  { link: 'https://www.bbc.co.uk/news/uk-politics-burnham-pm', title: 'Andy Burnham becomes Prime Minister', snippet: 'Andy Burnham ble statsminister i Storbritannia i oktober 2026, etter at han vant ledervalget i Labour. Han tok over i Downing Street samme uke.' },
  { link: 'https://www.nrk.no/urix/burnham-ny-statsminister-1.17000000', title: 'Burnham er ny britisk statsminister', snippet: 'Den tidligere borgermesteren i Manchester, Andy Burnham, er Storbritannias nye statsminister (oktober 2026).' },
  { link: 'https://www.gov.uk/government/people/andy-burnham', title: 'The Rt Hon Andy Burnham MP – Prime Minister', snippet: 'Andy Burnham became Prime Minister and First Lord of the Treasury in October 2026.' },
];

export function createOwuiSim({ base = 'http://owui.sim:8080', key = 'sk-owui-sim', ollama, forwardThink = true, thinkTags = false, webHits = BURNHAM_HITS, webShape = '0.12' } = {}) {
  const sim = { base, key, ollama, forwardThink, thinkTags, webHits, webShape, log: [], searches: [], unauthorized: 0 };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const auth = (init) => {
    const h = init.headers ?? {};
    const v = h.Authorization ?? h.authorization ?? (typeof h.get === 'function' ? h.get('authorization') : null) ?? '';
    const tok = String(v).replace(/^Bearer\s+/i, '');
    return { ok: tok === sim.key, tok };
  };
  const toOllamaMessages = (msgs = []) => msgs.map((m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: String(m.content ?? '') };
    const text = m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    const images = m.content.filter((p) => p.type === 'image_url').map((p) => String(p.image_url?.url ?? '').replace(/^data:[^,]*,/, ''));
    return { role: m.role, content: text, ...(images.length ? { images } : {}) };
  });
  async function completions(body, init) {
    const params = body.params ?? {};
    const options = {};
    for (const k of ['num_ctx', 'num_predict', 'temperature', 'top_p', 'top_k', 'seed']) {
      const v = params[k] ?? (k === 'num_predict' ? body.max_tokens : k === 'num_ctx' ? undefined : body[k]);
      if (v !== undefined) options[k] = v;
    }
    const think = sim.forwardThink ? (body.think ?? params.think) : undefined;
    const ob = { model: body.model, stream: true, messages: toOllamaMessages(body.messages), options,
      ...(params.keep_alive !== undefined || body.keep_alive !== undefined ? { keep_alive: params.keep_alive ?? body.keep_alive } : {}),
      ...(body.format ? { format: body.format } : body.response_format?.type === 'json_object' ? { format: 'json' } : {}),
      ...(think !== undefined ? { think } : {}) };
    const entry = { path: '/api/chat/completions', body, forwarded: ob, at: Date.now() };
    sim.log.push(entry);
    const res = await sim.ollama.fetch(`${sim.ollama.base}/api/chat`, { method: 'POST', body: JSON.stringify(ob), signal: init.signal });
    if (!res.ok) { const t = await res.text(); let d = t; try { d = JSON.parse(t).error ?? t; } catch { /* */ } return json({ detail: d }, res.status); }
    const rd = res.body.getReader(), dec = new TextDecoder();
    let buf = '', inThink = false;
    const ev = (o) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
    const id = `chatcmpl-${Math.random().toString(36).slice(2, 10)}`;
    return new Response(new ReadableStream({
      async pull(c) {
        try {
          for (;;) {
            const i = buf.indexOf('\n');
            if (i >= 0) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
              if (!line) continue;
              const j = JSON.parse(line);
              if (j.done) {
                if (inThink) c.enqueue(ev({ id, choices: [{ index: 0, delta: { content: '</think>' } }] }));
                const evalS = (j.eval_duration ?? 0) / 1e9;
                c.enqueue(ev({ id, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: j.prompt_eval_count ?? 0, completion_tokens: j.eval_count ?? 0, total_tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0),
                  'response_token/s': evalS ? Math.round((j.eval_count / evalS) * 100) / 100 : null, load_duration: j.load_duration, prompt_eval_duration: j.prompt_eval_duration, eval_duration: j.eval_duration, total_duration: j.total_duration,
                  eval_count: j.eval_count, prompt_eval_count: j.prompt_eval_count } }));
                c.enqueue(enc.encode('data: [DONE]\n\n'));
                c.close();
                return;
              }
              const th = j.message?.thinking ?? '', ct = j.message?.content ?? '';
              if (th) {
                if (sim.thinkTags) { c.enqueue(ev({ id, choices: [{ index: 0, delta: { content: `${inThink ? '' : '<think>'}${th}` } }] })); inThink = true; }
                else c.enqueue(ev({ id, choices: [{ index: 0, delta: { reasoning_content: th } }] }));
                return;
              }
              if (ct) {
                c.enqueue(ev({ id, choices: [{ index: 0, delta: { content: `${inThink ? '</think>' : ''}${ct}` } }] }));
                inThink = false;
                return;
              }
              continue;
            }
            const { value, done } = await rd.read();
            if (done) { c.close(); return; }
            buf += dec.decode(value, { stream: true });
          }
        } catch (e) { c.error(e); }
      },
      cancel() { rd.cancel().catch(() => {}); },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  function webSearch(body) {
    const q = Array.isArray(body?.queries) ? body.queries[0] : body?.query;
    if (sim.webShape === 'old' && Array.isArray(body?.queries)) return json({ detail: [{ loc: ['body', 'query'], msg: 'field required' }] }, 422);
    if (!q) return json({ detail: 'queries mangler' }, 400);
    sim.searches.push({ q, body });
    const hits = sim.webHits ?? [];
    return json({ status: true, collection_name: `web-search-${Math.abs([...q].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)).toString(16)}`,
      filenames: hits.map((h) => h.link), items: hits.map((h) => ({ link: h.link, title: h.title, snippet: h.snippet })),
      docs: hits.map((h) => ({ content: h.snippet, metadata: { source: h.link, title: h.title } })), loaded_count: hits.length });
  }
  sim.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (`${u.protocol}//${u.host}` !== new URL(base).origin) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const path = u.pathname;
    if (path === '/api/version') return json({ version: '0.12.3' });
    const a = auth(init);
    if (!a.ok) { sim.unauthorized++; return json({ detail: `401 Unauthorized: invalid API key ${a.tok}` }, 401); }
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (path === '/api/models') return json({ data: Object.entries(sim.ollama.models).map(([id, m]) => ({ id, name: id, object: 'model', owned_by: 'ollama', ollama: { name: id, model: id, size: m.size, details: { family: m.family } } })) });
    if (path === '/api/chat/completions') return completions(body ?? {}, init);
    if (path === '/api/v1/retrieval/process/web/search') return webSearch(body);
    return json({ detail: 'Not Found' }, 404);
  };
  sim.reset = () => { sim.log.length = 0; sim.searches.length = 0; sim.unauthorized = 0; };
  return sim;
}
