// --backend mock: en falsk Ollama som svarer som en «flink» modell ville gjort for eval-meldingene (samme idé som
// GLIMT47-proben). Den viser bare at riggen virker uten nett og uten modell; den måler IKKE modellkvalitet.
// Bildeforespørsler (visjon) får et tomt svar, så dokument-casene viser hva koden gjør uten en modell som leser.
const enc = new TextEncoder();
const nd = (chunks) => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(`${JSON.stringify(x)}\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
export const MOCK_MODELS = ['qwen3:8b', 'llama3.2:3b', 'qwen2.5vl:7b', 'nomic-embed-text:latest'];

/** Hvilke verktøy en flink planlegger ville valgt. */
export function oracle(msg) {
  const m = String(msg ?? '').toLowerCase();
  if (/er frisøren min/.test(m)) return [{ name: 'app.answer', arguments: { topic: 'memory' } }];
  if (/nina/.test(m)) return [{ name: 'calendar.search', arguments: { query: 'Nina' } }];
  if (/dune/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Dune', date: '17.12', time: '17.30', location: 'Colosseum kino' } }];
  if (/middag hos mamma/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Middag hos mamma', date: 'fredag', time: '18' } }];
  if (/tannlege/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Tannlege', date: '3/2', time: '08:15' } }];
  if (/været|vær/.test(m)) return [{ name: 'weather.get', arguments: { place: 'Oslo', when: 'neste time' } }, { name: 'weather.get', arguments: { place: 'New York', when: 'i morgen' } }];
  if (/abonnement/.test(m)) return [{ name: 'finance.subscriptions', arguments: { mode: 'top' } }];
  if (/brukt på mat|mat denne/.test(m)) return [{ name: 'finance.summary', arguments: { period: 'denne måneden', category: 'Mat og dagligvarer', group_by: 'total' } }];
  return [{ name: 'chat.answer', arguments: {} }];
}
export function chatText(all) {
  if (/Whitcombe/.test(all)) return 'Statsministeren i Storbritannia er **Eleanor Whitcombe**, ifølge søkeresultatene (NRK).';
  if (/frankrike/i.test(all)) return 'Hovedstaden i Frankrike er **Paris**.';
  return 'Jeg vet dessverre ikke det.';
}

export function makeFakeModel() {
  return async function fakeOllama(url, init = {}) {
    const u = new URL(url);
    const p = u.pathname;
    if (p === '/api/tags') return J({ models: MOCK_MODELS.map((name) => ({ name, model: name, size: /3b/.test(name) ? 2e9 : /embed/.test(name) ? 3e8 : 5.2e9, details: { family: name.split(':')[0].replace(/[.\d]+$/, ''), parameter_size: /3b/.test(name) ? '3.2B' : '8B', quantization_level: 'Q4_K_M' } })) });
    if (p === '/api/ps') return J({ models: [] });
    if (p === '/api/version') return J({ version: '0.12.6' });
    if (p === '/api/show') { let b = {}; try { b = JSON.parse(init.body); } catch { /* */ } return J({ capabilities: /vl/.test(b.model ?? b.name ?? '') ? ['completion', 'vision'] : /embed/.test(b.model ?? '') ? ['embedding'] : ['completion', 'tools', 'thinking'], details: { family: 'qwen3' }, model_info: {} }); }
    if (p === '/api/embed' || p === '/api/embeddings') { let b = {}; try { b = JSON.parse(init.body); } catch { /* */ } const n = [].concat(b.input ?? b.prompt ?? '').length; return J({ embeddings: Array.from({ length: n }, () => [0.1, 0.2, 0.3]), embedding: [0.1, 0.2, 0.3] }); }
    if (p === '/api/chat' || p === '/api/generate') {
      const b = JSON.parse(init.body);
      const msgs = b.messages ?? [];
      const lastUser = String(msgs.filter((x) => x.role === 'user').at(-1)?.content ?? b.prompt ?? '');
      const all = msgs.map((x) => (typeof x.content === 'string' ? x.content : JSON.stringify(x.content))).join('\n');
      const ptok = Math.round((all.length + (b.tools ? JSON.stringify(b.tools).length : 0) + (b.format ? JSON.stringify(b.format).length : 0)) / 3.5) + 256 * msgs.reduce((a, x) => a + (x.images?.length ?? 0), 0);
      const done = { model: b.model, done: true, done_reason: 'stop', prompt_eval_count: ptok, eval_count: 30, message: { role: 'assistant', content: '' } };
      const say = (content) => nd([{ model: b.model, message: { role: 'assistant', content }, done: false }, done]);
      if (msgs.some((x) => x.images?.length)) return say('{}');
      const plan = oracle(lastUser.replace(/^Melding:\s*/, '').split('\n')[0]);
      if (b.tools) return nd([{ model: b.model, message: { role: 'assistant', content: '', tool_calls: plan.map((x) => ({ function: x })) }, done: false }, done]);
      if (b.format) {
        const fj = JSON.stringify(b.format);
        if (/"calls"/.test(fj)) return say(JSON.stringify({ intent: 'ask', module: 'home', calls: plan.map((x) => ({ tool: x.name, args: x.arguments })), ask: null }));
        if (/"tools"/.test(fj)) return say(JSON.stringify({ tools: /statsminister/i.test(lastUser) ? ['web'] : ['none'], query: lastUser.slice(0, 80) }));
        if (/"type"/.test(fj)) return say(JSON.stringify({ type: 'question' }));
        return say('{}');
      }
      return say(chatText(all));
    }
    return J({});
  };
}
