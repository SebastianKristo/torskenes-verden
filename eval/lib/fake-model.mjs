// --backend mock: en falsk Ollama som svarer som en «flink» modell ville gjort for eval-meldingene (samme idé som
// GLIMT47-proben). Den viser bare at riggen virker uten nett og uten modell; den måler IKKE modellkvalitet.
// Bildeforespørsler (visjon) får et tomt svar, så dokument-casene viser hva koden gjør uten en modell som leser.
const enc = new TextEncoder();
const nd = (chunks) => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(`${JSON.stringify(x)}\n`)); c.close(); } }), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
export const MOCK_MODELS = ['qwen3:8b', 'llama3.2:3b', 'qwen2.5vl:7b', 'nomic-embed-text:latest'];

/** Hvilke verktøy en flink planlegger ville valgt. */
export function oracle(msg) {
  const m = String(msg ?? '').toLowerCase().replace(/\s*\/no_think\s*$/, ''); // prompt 60: de forankrede reglene under
  if (/er frisøren min/.test(m)) return [{ name: 'app.answer', arguments: { topic: 'memory' } }];
  // Prompt 60 (del 3): flerstegssamtalene (oppfølging av forrige tur). Før de generelle reglene, så de gamle meldingene gir det samme.
  if (/^og i ([a-zæøå ]+)\?*$/.test(m)) return [{ name: 'weather.get', arguments: { place: m.replace(/^og i\s+/, '').replace(/\?+$/, '').trim().replace(/^./, (c) => c.toUpperCase()) } }];
  if (/^flytt den til (\d{1,2})$/.test(m)) return [{ name: 'calendar.update', arguments: { target: 'den', time: m.match(/(\d{1,2})$/)[1] } }];
  if (/^si opp det$/.test(m)) return [{ name: 'subscriptions.cancel', arguments: { service: 'det' } }];
  if (/^legg inn tannlege fredag kl 10$/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Tannlege', date: 'fredag', time: 'kl 10' } }];
  if (/^flytt nina til lørdag$/.test(m)) return [{ name: 'calendar.update', arguments: { target: 'Nina', date: 'lørdag' } }];
  // Prompt 61 (del 1): rettelsen «nei, jeg mente middagen» → søk etter det brukeren mente.
  if (/^nei,? jeg mente middagen$/.test(m)) return [{ name: 'calendar.search', arguments: { terms: ['middag'], direction: 'next', limit: 1 } }];
  // Prompt 62 (del 2): planlagte oppgaver – hva + når (råtekst) og betingelsen (råtekst); koden tolker og sjekker.
  if (/strømprisene hver morgen/.test(m)) return [{ name: 'schedule.create', arguments: { what: 'strømprisene for i dag', when: 'hver morgen kl. 7' } }];
  if (/husleia.*hver måned/.test(m)) return [{ name: 'schedule.create', arguments: { what: 'betale husleia', when: 'den 1. hver måned' } }];
  if (/^si fra hvis strømprisen går over (\d+) kr i morgen/.test(m)) return [{ name: 'schedule.create', arguments: { what: 'strømprisen i morgen', when: 'i morgen', condition: `strømprisen går over ${m.match(/over (\d+) kr/)[1]} kr` } }];
  if (/faste oppgaver/.test(m)) return [{ name: 'schedule.list', arguments: {} }];
  if (/^stopp strømprisvarselet/.test(m)) return [{ name: 'schedule.delete', arguments: { target: 'strømprisvarselet' } }];
  if (/^flytt morgenbriefen til/.test(m)) return [{ name: 'schedule.update', arguments: { target: 'morgenbriefen', when: m.replace(/^flytt morgenbriefen til\s*/, ''), action: 'move' } }];
  if (/nina/.test(m)) return [{ name: 'calendar.search', arguments: { query: 'Nina' } }];
  if (/dune/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Dune', date: '17.12', time: '17.30', location: 'Colosseum kino' } }];
  if (/middag hos mamma/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Middag hos mamma', date: 'fredag', time: '18' } }];
  if (/tannlege/.test(m)) return [{ name: 'calendar.create', arguments: { title: 'Tannlege', date: '3/2', time: '08:15' } }];
  if (/været|vær/.test(m)) {
    // Prompt 59: bare stedene som står i meldingen (cache-casen spør om Oslo alene).
    const w = [];
    if (/oslo/.test(m)) w.push({ name: 'weather.get', arguments: { place: 'Oslo', when: /oslo neste time/.test(m) ? 'neste time' : /i morgen/.test(m) && !/new york/.test(m) ? 'i morgen' : 'neste time' } });
    if (/new york/.test(m)) w.push({ name: 'weather.get', arguments: { place: 'New York', when: 'i morgen' } });
    return w.length ? w : [{ name: 'weather.get', arguments: { place: '', when: 'i dag' } }];
  }
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
  // Prompt 59: som Ollama med én KV-cache-plass per modell: tokens i en felles prefiks med forrige forespørsel regnes ikke på nytt,
  // og prompt_eval_count teller bare de nye (det er slik cache-effekten ser ut i tracen med ekte Ollama).
  const lastPrompt = new Map();
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
      const full = `${b.tools ? JSON.stringify(b.tools) : ''}${all}`;
      const prev = lastPrompt.get(b.model) ?? '';
      let common = 0; while (common < prev.length && common < full.length && prev[common] === full[common]) common++;
      lastPrompt.set(b.model, full);
      const ptok = Math.max(1, Math.round((full.length - common) / 3.5)) + 256 * msgs.reduce((a, x) => a + (x.images?.length ?? 0), 0);
      const done = { model: b.model, done: true, done_reason: 'stop', prompt_eval_count: ptok, prompt_eval_duration: ptok * 2.5e6, eval_count: 30, eval_duration: 30 * 4e7, load_duration: 1e6, message: { role: 'assistant', content: '' } };
      const say = (content) => nd([{ model: b.model, message: { role: 'assistant', content }, done: false }, done]);
      if (msgs.some((x) => x.images?.length)) return say('{}');
      const plan = oracle(lastUser.replace(/^Melding:\s*/, '').split('\n')[0]);
      if (b.tools) return nd([{ model: b.model, message: { role: 'assistant', content: '', tool_calls: plan.map((x) => ({ function: x })) }, done: false }, done]);
      if (b.format) {
        const fj = JSON.stringify(b.format);
        if (/"calls"/.test(fj)) return say(JSON.stringify({ intent: 'ask', module: 'home', calls: plan.map((x) => ({ tool: x.name, args: x.arguments })), ask: null, ...(/"refers_to_previous"/.test(fj) && /Conversation state:/.test(all) && /^(og i |flytt den |si opp det)/i.test(lastUser.replace(/^Melding:\s*/, '')) ? { refers_to_previous: true } : {}) }));
        if (/"tools"/.test(fj)) return say(JSON.stringify({ tools: /statsminister/i.test(lastUser) ? ['web'] : ['none'], query: lastUser.slice(0, 80) }));
        if (/"type"/.test(fj)) return say(JSON.stringify({ type: 'question' }));
        return say('{}');
      }
      return say(chatText(all));
    }
    return J({});
  };
}
