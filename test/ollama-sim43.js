// Prompt 43: falsk Ollama som oppfører seg som brukerens (Ollama 0.34, Mac mini M4 16 GB, ~11,8 GB GPU), brukt av
// test/p43-ollama-gate.test.js og selvtest-skriptet. Injiseres som fetch (ingen nettverk).
//   - OLLAMA_NUM_PARALLEL=1: én forespørsel om gangen; de andre venter i Ollamas egen kø.
//   - Bare plass til én av qwen3:8b / qwen2.5vl:7b i minnet (med KV-cache), llama3.2:3b får plass ved siden av.
//   - Innlasting 2–40 s fra ekstern disk (skalert ned: scale = 1/100 gir 20–400 ms).
//   - Strømmende svar (NDJSON) med load_duration / prompt_eval_duration / eval_duration i siste bit.
//   - En forespørsel mot en modell som lastes ut (keep_alive:0) mens den svarer, brytes – som i virkeligheten.
//   - qwen3 tenker (message.thinking) hvis think ikke er false, og tenkingen bruker av num_predict.
const enc = new TextEncoder();
export const SIM_MODELS = {
  'llama3.2:3b': { size: 2.0e9, vram: 2.6e9, loadS: 2, family: 'llama', caps: ['completion', 'tools'] },
  'qwen3:8b': { size: 5.2e9, vram: 6.6e9, loadS: 12, family: 'qwen3', caps: ['completion', 'tools', 'thinking'], thinks: true },
  'qwen2.5vl:7b': { size: 6.0e9, vram: 7.4e9, loadS: 40, family: 'qwen25vl', caps: ['completion', 'vision'] },
};

export function createOllamaSim({ base = 'http://ollama.sim:11434', models = SIM_MODELS, scale = 0.01, gpuGb = 11.8, tokenMs = 4, thinkTokens = 40 } = {}) {
  const sim = {
    base, models, scale, tokenMs, thinkTokens, answer: null,
    loaded: new Map(), // modell → {expiresAt}
    active: new Map(), // modell → antall strømmer som pågår
    log: [], // {path, model, body, at, end, aborted, error}
    maxInflight: 0, inflight: 0, maxActiveModels: 0, aborted: 0, unloads: [],
    failures: [], // [{model?, path?, kind:'terminated'|'500'|'400'|'400think'|'reset'|'stall', ms?, text?}] brukes én gang hver
    queue: Promise.resolve(), // NUM_PARALLEL=1
    streams: new Map(), // modell → Set(controller-avbryt)
  };
  const wait = (ms, signal) => new Promise((res, rej) => {
    if (signal?.aborted) { rej(abortErr()); return; }
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortErr()); }, { once: true });
  });
  const abortErr = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
  const usedGb = (except) => [...sim.loaded.keys()].filter((m) => m !== except).reduce((a, m) => a + (models[m]?.vram ?? 0) / 1e9, 0);
  const keepMs = (v) => (v === -1 ? Infinity : v === 0 ? 0 : (() => { const m = String(v ?? '5m').match(/^(\d+)(s|m|h)$/); return m ? +m[1] * ({ s: 1000, m: 60_000, h: 3600_000 }[m[2]]) : 300_000; })());
  const takeFailure = (path, model) => { const i = sim.failures.findIndex((f) => (!f.model || f.model === model) && (!f.path || f.path === path)); return i >= 0 ? sim.failures.splice(i, 1)[0] : null; };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const ns = (ms) => Math.round(ms * 1e6);
  async function load(model, signal) {
    if (sim.loaded.has(model)) return 0;
    const m = models[model];
    // Gi plass: last ut modeller som ikke er i bruk (Ollama venter på dem som er i bruk).
    while (usedGb(model) + m.vram / 1e9 > gpuGb) {
      const idle = [...sim.loaded.keys()].find((x) => x !== model && !(sim.active.get(x) > 0));
      if (!idle) { await wait(5, signal); continue; }
      sim.loaded.delete(idle);
    }
    const ms = m.loadS * 1000 * scale;
    await wait(ms, signal);
    sim.loaded.set(model, { expiresAt: Infinity });
    return ms;
  }
  function unload(model) {
    sim.unloads.push({ model, at: Date.now(), activeAt: sim.active.get(model) ?? 0 });
    sim.loaded.delete(model);
    // Den ekte feilen: en forespørsel som pågår mot modellen, brytes.
    for (const kill of sim.streams.get(model) ?? []) kill();
  }
  async function infer(path, body, signal, entry) {
    // NUM_PARALLEL=1: vent på tur
    let release;
    const turn = new Promise((r) => { release = r; });
    const prev = sim.queue;
    sim.queue = prev.then(() => turn);
    await prev;
    const model = body.model, m = models[model];
    let ctrlRef = null, killed = false;
    const kills = sim.streams.get(model) ?? new Set();
    sim.streams.set(model, kills);
    const kill = () => { killed = true; sim.aborted++; entry.aborted = true; try { ctrlRef?.error(new TypeError('terminated')); } catch { /* */ } };
    try {
      if (!m) { release(); return json({ error: `model "${model}" not found, try pulling it first` }, 404); }
      const f = takeFailure(path, model);
      if (f?.kind === '500') { release(); return json({ error: f.text ?? 'llama runner process has terminated: exit status 2' }, 500); }
      if (f?.kind === '400') { release(); return json({ error: f.text ?? 'invalid request' }, 400); }
      if (f?.kind === '400think' && 'think' in body) { release(); return json({ error: `"${model}" does not support thinking` }, 400); }
      if (f?.kind === 'reset') { release(); throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); }
      const t0 = Date.now();
      let loadMs;
      try { loadMs = await load(model, signal); } catch (e) { release(); throw e; }
      sim.active.set(model, (sim.active.get(model) ?? 0) + 1);
      sim.maxActiveModels = Math.max(sim.maxActiveModels, [...sim.active.values()].filter((n) => n > 0).length);
      kills.add(kill);
      const keep = keepMs(body.keep_alive);
      const done = () => {
        sim.active.set(model, Math.max(0, (sim.active.get(model) ?? 1) - 1));
        kills.delete(kill);
        if (keep === 0) sim.loaded.delete(model); else if (sim.loaded.has(model)) sim.loaded.set(model, { expiresAt: Date.now() + keep });
        entry.end = Date.now();
        release();
      };
      if (path === '/api/embed') { done(); return json({ model, embeddings: [].concat(body.input).map(() => [0.1, 0.2, 0.3]), load_duration: ns(loadMs), prompt_eval_count: 3 }); }
      const promptTok = JSON.stringify(body.messages ?? body.prompt ?? '').length >> 2;
      const loadOnly = path === '/api/generate' && !body.prompt && !body.images?.length;
      const budget = body.options?.num_predict ?? 64;
      const thinks = m.thinks && body.think !== false;
      const think = thinks ? sim.thinkTokens : 0;
      // Prompt 44: sim.answer(body, path) kan gi et eget svar (f.eks. ut fra søkeresultatene i systemprompten).
      const custom = typeof sim.answer === 'function' ? sim.answer(body, path) : null;
      const text = custom ?? (body.format ? '{"ok":true}' : /Svar bare: ok/.test(JSON.stringify(body.messages ?? body.prompt ?? '')) ? 'ok' : `Svar fra ${model} med noen ord.`);
      const parts = loadOnly ? [] : (text.match(/.{1,3}/g) ?? ['ok']);
      entry.think = thinks;
      const stream = new ReadableStream({
        async start(c) {
          ctrlRef = c;
          let n = 0;
          const tGen = Date.now();
          try {
            await wait(2, signal); // prompt
            const promptMs = Date.now() - tGen;
            const stall = takeFailure('stall', model);
            for (let i = 0; i < think && n < budget; i++, n++) {
              if (killed) return;
              c.enqueue(enc.encode(JSON.stringify(path === '/api/chat' ? { model, message: { role: 'assistant', content: '', thinking: 'hmm ' } } : { model, response: '', thinking: 'hmm ' }) + '\n'));
              await wait(sim.tokenMs, signal);
            }
            for (let i = 0; i < parts.length && n < budget; i++, n++) {
              if (killed) return;
              c.enqueue(enc.encode(JSON.stringify(path === '/api/chat' ? { model, message: { role: 'assistant', content: parts[i] } } : { model, response: parts[i] }) + '\n'));
              if (stall && i === 0) await wait(stall.ms ?? 500, signal); // står stille midt i svaret
              await wait(sim.tokenMs, signal);
            }
            if (killed) return;
            const evalMs = Date.now() - tGen - promptMs;
            c.enqueue(enc.encode(JSON.stringify({ model, ...(path === '/api/chat' ? { message: { role: 'assistant', content: '' } } : { response: '' }), done: true, done_reason: loadOnly ? 'load' : 'stop',
              total_duration: ns(Date.now() - t0), load_duration: ns(loadMs), prompt_eval_count: promptTok, prompt_eval_duration: ns(promptMs), eval_count: n, eval_duration: ns(evalMs) }) + '\n'));
            c.close();
          } catch (e) { if (!killed) { try { c.error(e); } catch { /* */ } } }
          finally { done(); }
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    } catch (e) { throw e; }
  }
  sim.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (`${u.protocol}//${u.host}` !== new URL(base).origin) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const path = u.pathname;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (path === '/api/version') return json({ version: '0.34.0' });
    if (path === '/api/tags') return json({ models: Object.entries(models).map(([name, m]) => ({ name, model: name, size: m.size, details: { family: m.family, families: [m.family], parameter_size: '7B', quantization_level: 'Q4_K_M' } })) });
    if (path === '/api/ps') return json({ models: [...sim.loaded.keys()].map((name) => ({ name, model: name, size: models[name].vram, size_vram: models[name].vram, expires_at: new Date(Math.min(Date.now() + 86400_000, sim.loaded.get(name).expiresAt)).toISOString() })) });
    if (path === '/api/show') return json({ capabilities: models[body?.model ?? body?.name]?.caps ?? [] });
    const entry = { path, model: body?.model, body, at: Date.now(), end: null, aborted: false };
    sim.log.push(entry);
    // Utlasting: /api/generate {model, keep_alive:0} uten prompt – går utenom køen (Ollama-planleggeren).
    if (path === '/api/generate' && body?.keep_alive === 0 && !body.prompt) { unload(body.model); entry.end = Date.now(); entry.unload = true; return json({ model: body.model, done: true, done_reason: 'unload' }); }
    sim.inflight++; sim.maxInflight = Math.max(sim.maxInflight, sim.inflight);
    let res;
    try { res = await infer(path, body, init.signal, entry); } catch (e) { sim.inflight--; entry.error = e.message; throw e; }
    if (!res.body || res.headers.get('content-type')?.includes('json')) { sim.inflight--; return res; }
    // inflight teller til strømmen er ferdig
    const rd = res.body.getReader();
    const wrapped = new ReadableStream({
      async pull(c) {
        try { const { value, done } = await rd.read(); if (done) { sim.inflight--; c.close(); return; } c.enqueue(value); }
        catch (e) { sim.inflight--; c.error(e); }
      },
      cancel() { sim.inflight--; rd.cancel().catch(() => {}); },
    });
    return new Response(wrapped, { status: res.status, headers: res.headers });
  };
  sim.reset = () => { sim.loaded.clear(); sim.active.clear(); sim.log.length = 0; sim.maxInflight = 0; sim.inflight = 0; sim.maxActiveModels = 0; sim.aborted = 0; sim.unloads.length = 0; sim.failures.length = 0; sim.queue = Promise.resolve(); };
  /** Modellene i rekkefølgen forespørslene startet (uten utlasting), sammenslått: ['qwen3:8b','qwen2.5vl:7b',…] */
  sim.runs = (filter = () => true) => { const ms = sim.log.filter((x) => !x.unload && filter(x)).map((x) => x.model); return ms.filter((m, i) => m !== ms[i - 1]); };
  return sim;
}
