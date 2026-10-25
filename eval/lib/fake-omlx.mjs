// Prompt 58: en falsk oMLX (OpenAI-kompatibel /v1) som en ekte HTTP-server på 127.0.0.1 – for test/p58-omlx.test.js og for å sjekke
// riggen `npm run eval -- --backend omlx --url http://127.0.0.1:<port> --key …` uten Mac. Svarer som fake-model.mjs (samme «flinke»
// planlegger), men i OpenAI-form: SSE med choices[].delta, tool_calls med navn uten punktum, usage. Måler IKKE modellkvalitet.
import { createServer } from 'node:http';
import { oracle, chatText } from './fake-model.mjs';

export const FAKE_OMLX_MODELS = ['mlx-community/Qwen3-8B-4bit', 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit', 'mlx-community/nomic-embed-text-v1.5'];

/** Svaret på én chat/completions-body. → {content?, toolCalls?:[{name, arguments}]} */
export function fakeAnswer58(b) {
  const msgs = b.messages ?? [];
  const text = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'));
  const lastUser = String(text(msgs.filter((x) => x.role === 'user').at(-1) ?? {}) ?? '').replace(/\s*\/no_think\s*$/, '');
  const all = msgs.map(text).join('\n');
  if (msgs.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'))) return { content: '{}' };
  const plan = oracle(lastUser.replace(/^Melding:\s*/, '').split('\n')[0]);
  if (b.tools?.length) return { toolCalls: plan.map((x) => ({ name: x.name.replace(/\./g, '_'), arguments: JSON.stringify(x.arguments) })) };
  const schema = b.response_format?.json_schema?.schema;
  if (schema || b.response_format?.type === 'json_object') {
    const fj = JSON.stringify(schema ?? {});
    if (/"calls"/.test(fj)) return { content: JSON.stringify({ intent: 'ask', module: 'home', calls: plan.map((x) => ({ tool: x.name, args: x.arguments })), ask: null }) };
    if (/"tools"/.test(fj)) return { content: JSON.stringify({ tools: /statsminister/i.test(lastUser) ? ['web'] : ['none'], query: lastUser.slice(0, 80) }) };
    if (/"type"/.test(fj)) return { content: JSON.stringify({ type: 'question' }) };
    return { content: '{}' };
  }
  if (/^Svar bare med ordet: ok/.test(lastUser)) return { content: 'ok' };
  return { content: chatText(all) };
}

/**
 * Starter den falske oMLX-en. key: påkrevd Bearer-nøkkel (tom = ingen). → {url, port, calls, close(), setDown(v), setStatus(code)}
 * calls: [{method, path, auth, body}] (body parset). setStatus(503) gir 503 på chat (for reserve-testene).
 */
export async function startFakeOmlx58({ key = '', models = FAKE_OMLX_MODELS, port = 0 } = {}) {
  const calls = [];
  let status = 200;
  const srv = createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      calls.push({ method: rq.method, path: rq.url, auth: rq.headers.authorization ?? null, body });
      const J = (code, o) => rs.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(o));
      if (key && rq.headers.authorization !== `Bearer ${key}`) return J(401, { error: { message: 'Invalid API key', type: 'invalid_api_key' } });
      if (rq.method === 'GET' && rq.url === '/v1/models') return J(200, { object: 'list', data: models.map((id) => ({ id, object: 'model', owned_by: 'omlx', max_context: 40960 })) });
      if (rq.method === 'POST' && rq.url === '/v1/embeddings') return J(200, { data: [].concat(body?.input ?? []).map((_, index) => ({ index, embedding: [0.1, 0.2, 0.3] })), usage: { prompt_tokens: 3 } });
      if (rq.method === 'POST' && rq.url === '/v1/chat/completions') {
        if (status !== 200) return J(status, { error: { message: 'Service Unavailable' } });
        if (!models.some((m) => m === body?.model)) return J(404, { error: { message: `Model '${body?.model}' not found` } });
        const a = fakeAnswer58(body ?? {});
        const ptok = Math.round(raw.length / 3.5);
        const id = 'chatcmpl-fake58', created = Math.floor(Date.now() / 1000);
        rs.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        const send = (o) => rs.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, ...o })}\n\n`);
        if (a.toolCalls) {
          a.toolCalls.forEach((t, index) => {
            send({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: `call_${index}`, type: 'function', function: { name: t.name, arguments: '' } }] } }] });
            const half = Math.ceil(t.arguments.length / 2);
            send({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: t.arguments.slice(0, half) } }] } }] });
            send({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: t.arguments.slice(half) } }] } }] });
          });
          send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
        } else {
          const c = String(a.content);
          const parts = [c.slice(0, Math.ceil(c.length / 2)), c.slice(Math.ceil(c.length / 2))].filter(Boolean);
          for (const p of parts) send({ choices: [{ index: 0, delta: { content: p } }] });
          send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        }
        send({ choices: [], usage: { prompt_tokens: ptok, completion_tokens: 12, total_tokens: ptok + 12 } });
        rs.end('data: [DONE]\n\n');
        return undefined;
      }
      return J(404, { error: { message: 'Not found' } });
    });
  });
  await new Promise((res) => srv.listen(port, '127.0.0.1', res));
  const p = srv.address().port;
  return { url: `http://127.0.0.1:${p}`, port: p, calls, setStatus: (v) => { status = v; }, close: () => new Promise((res) => { srv.closeAllConnections?.(); srv.close(() => res()); }) };
}

// Kjøres direkte: node eval/lib/fake-omlx.mjs [port] [nøkkel] – en falsk oMLX for å prøve riggen for hånd.
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startFakeOmlx58({ port: +(process.argv[2] ?? 18040) || 0, key: process.argv[3] ?? '' });
  console.log(`Falsk oMLX på ${s.url}${process.argv[3] ? ' (med nøkkel)' : ''} · Ctrl-C for å stoppe`);
}
