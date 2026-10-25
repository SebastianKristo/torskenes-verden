// Prompt 53 (FERMION53): Neutrino-1 8B (Fermion Research, Qwen3-8B ternær, Apache-2.0) som valgfri tekstmotor på Mac mini-en.
// `fermion serve neutrino-8b` (OpenAI-kompatibel) bak vakten i tools/fermion/guard.py (LAN-adresse, IP-filter, nøkkel).
//
// Backenden «neutrino53» registreres i AI-gaten med den eksisterende registerBackend (ai-gate.js er ikke endret). Kallene går i
// SAMME kø som Ollama (samme instans/adresse), fordi begge kjører på Mac mini-en og deler 16 GB minne: aldri to modeller samtidig.
// Gaten sender Ollama-formen ({messages, options}); her blir den til /v1/chat/completions (SSE) og tilbake til Ollama-biter.
//
// Modellnavnet i Homelab er «neutrino:8b». Det står i modellvalget (Chat) og AI-kontroll bare når tjenesten svarer og flagget
// fermion_neutrino53 er på. Den er aldri standard (eval avgjør).
import { registerBackend, gateChat, GateError, maskSecrets } from '../ai-gate.js';
import { settings as fhSettings } from '../finans/db.js';
import { OWNER } from '../db.js';
import { neutrinoConf53 } from './config.js';
import { fermionFetch53, markDown53, neutrinoReady53, flagOnNeutrino53, state53, probe53 } from './health.js';

export const NEUTRINO_BACKEND53 = 'neutrino53';
export const NEUTRINO_ID53 = 'neutrino:8b';
export const NEUTRINO_NAME53 = 'Neutrino-1 8B · Mac mini';
const BE_NAME = 'Neutrino (Mac mini)';
const MAX_TOKENS = 4096; // vaktens/fermions tak (--max-new-ceiling)

const ollamaBase = () => { try { return String(fhSettings(OWNER).ollamaUrl || '').replace(/\/+$/, ''); } catch { return ''; } };
export const isNeutrino53 = (id) => /^neutrino(?::8b|-8b)?$/i.test(String(id ?? '').replace(/^fermion[:/]/, ''));

/** Ollama-kroppen fra gaten → OpenAI chat completions. Kaster GateError ved bilder (Neutrino leser ikke bilder). */
export function toOpenAI53(body = {}, kind = 'chat') {
  const o = body.options ?? {};
  let messages;
  if (kind === 'generate') messages = [...(body.system ? [{ role: 'system', content: String(body.system) }] : []), { role: 'user', content: String(body.prompt ?? '') }];
  else messages = (body.messages ?? []).map((m) => ({ role: ['system', 'user', 'assistant', 'tool'].includes(m.role) ? m.role : 'user', content: String(m.content ?? '') }));
  if ((body.messages ?? []).some((m) => m.images?.length) || body.images?.length) throw new GateError('http', 'Neutrino leser ikke bilder', { status: 400, transient: false, backendName: BE_NAME });
  if (kind !== 'chat' && kind !== 'generate') throw new GateError('http', `Neutrino kan ikke brukes til ${kind}`, { status: 400, transient: false, backendName: BE_NAME });
  const out = { model: 'neutrino-8b', messages, stream: true, stream_options: { include_usage: true } };
  if (Number.isFinite(+o.temperature)) out.temperature = +o.temperature;
  if (Number.isFinite(+o.top_p)) out.top_p = +o.top_p;
  const n = +o.num_predict;
  out.max_tokens = Number.isFinite(n) && n > 0 ? Math.min(MAX_TOKENS, Math.round(n)) : 2048;
  if (body.format === 'json' || (body.format && typeof body.format === 'object')) out.response_format = { type: 'json_object' };
  return out;
}

registerBackend(NEUTRINO_BACKEND53, {
  async chatStream(req, { onToken, signal, onRequest }) {
    const c = neutrinoConf53();
    if (!c) throw new GateError('http', 'Neutrino er ikke satt opp (AI-kontroll › Mac mini · Fermion)', { status: 501, transient: false, backendName: BE_NAME });
    const body = toOpenAI53(req.body, req.kind);
    let r;
    const t0 = Date.now();
    try {
      onRequest?.();
      r = await fermionFetch53(`${c.url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` }, body: JSON.stringify(body), signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      markDown53('neutrino', 'Kan ikke nås');
      throw new GateError('nocontact', `${BE_NAME} kan ikke nås (${e?.cause?.code || e?.name || 'nettverksfeil'})`, { net: true, transient: false, code: e?.cause?.code, backendName: BE_NAME });
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let msg = ''; try { msg = JSON.parse(t)?.error?.message ?? ''; } catch { msg = t; }
      if (r.status === 401 || r.status === 403) { markDown53('neutrino', 'Nøkkel/IP avvist'); throw new GateError('http', `${BE_NAME} godtok ikke nøkkelen (HTTP ${r.status})`, { status: r.status, transient: false, backendName: BE_NAME }); }
      if (r.status === 503) { markDown53('neutrino', 'Starter'); throw new GateError('http', `${BE_NAME} starter fortsatt (laster modellen)`, { status: 503, transient: false, backendName: BE_NAME }); }
      throw new GateError('http', maskSecrets(`${BE_NAME} svarte ${r.status}${msg ? `: ${String(msg).slice(0, 200)}` : ''}`), { status: r.status, ollamaError: String(msg).slice(0, 200), transient: false, backendName: BE_NAME });
    }
    let content = '', tokIn = 0, tokOut = 0, firstAt = null, buf = '';
    const dec = new TextDecoder();
    const handle = async (line) => {
      const l = line.trim();
      if (!l.startsWith('data:')) return;
      const data = l.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let j; try { j = JSON.parse(data); } catch { return; }
      if (j.error) throw new GateError('http', `${BE_NAME}: ${String(j.error.message ?? j.error).slice(0, 200)}`, { status: 502, transient: false, backendName: BE_NAME });
      if (j.usage) { tokIn = j.usage.prompt_tokens ?? tokIn; tokOut = j.usage.completion_tokens ?? tokOut; }
      const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
      if (d) {
        firstAt ??= Date.now();
        content += d;
        if (req.partial) req.partial.content = content;
        await onToken({ message: { role: 'assistant', content: d }, done: false });
      }
    };
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); await handle(line); }
    }
    if (buf) await handle(buf);
    const genMs = firstAt ? Date.now() - firstAt : 0;
    const final = { done: true, model: NEUTRINO_ID53, eval_count: tokOut || null, eval_duration: genMs ? genMs * 1e6 : null, prompt_eval_count: tokIn || null };
    await onToken({ message: { role: 'assistant', content: '' }, ...final });
    return { text: content, content, thinking: '', message: { role: 'assistant' }, final, usage: { tokIn, tokOut }, timing: { loadMs: 0, promptMs: firstAt ? firstAt - t0 : 0, genMs } };
  },
});

/** <think>…</think> i starten av svaret går til tankegangen, aldri i svaret (Neutrino rendres uten tenking, men for sikkerhets skyld). */
function thinkSplit() {
  let mode = 'start', pre = '';
  return {
    push(d) {
      if (mode === 'text') return { text: d };
      if (mode === 'start') {
        pre += d;
        const t = pre.trimStart();
        if (!t) return {};
        if ('<think>'.startsWith(t.slice(0, 7)) && t.length < 7) return {};
        if (!t.startsWith('<think>')) { mode = 'text'; const x = pre; pre = ''; return { text: x }; }
        mode = 'think'; d = t.slice(7); pre = '';
      }
      const end = d.indexOf('</think>');
      if (end < 0) return { think: d };
      mode = 'text';
      return { think: d.slice(0, end), text: d.slice(end + 8).replace(/^\s+/, '') };
    },
    end() { const x = mode === 'start' ? pre : ''; pre = ''; return { text: x }; },
  };
}

/**
 * Chat-strømmen for chat.js (runEngine): samme form som gateStream der. → {tokens, telemetry, usedWeb:false}
 * Feil kommer ut som vanlige Error med norsk tekst (aldri rå svar fra motoren).
 */
export async function neutrinoChatStream53(model, sys, msgs, s = {}, { onDelta, onThink = async () => {}, signal } = {}) {
  if (!neutrinoConf53() || !flagOnNeutrino53()) throw Object.assign(new Error('Neutrino på Mac mini-en er ikke tilgjengelig. Velg en annen modell.'), { status: 503 });
  if (msgs.some((m) => m.images?.length)) throw Object.assign(new Error('Neutrino leser ikke bilder. Velg en bildemodell, eller send bildet uten Neutrino.'), { status: 400 });
  const tf = thinkSplit();
  let tokens = null;
  const body = { messages: [{ role: 'system', content: sys }, ...msgs.map((m) => ({ role: m.role, content: m.content }))], options: { temperature: s.temperature, top_p: s.topP, num_predict: 2048 } };
  try {
    const out = await gateChat({ model: NEUTRINO_ID53, body, backend: NEUTRINO_BACKEND53, base: ollamaBase() || neutrinoConf53()?.url || '', signal, priority: 'interactive', short: false, label: 'Chat · Neutrino', retries: 0,
      onChunk: async (j) => {
        if (j.message?.content) { const x = tf.push(j.message.content); if (x.think) await onThink(x.think); if (x.text) await onDelta(x.text); }
        if (j.done && j.eval_count) tokens = { count: j.eval_count, perSec: j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null };
      } });
    const rest = tf.end();
    if (rest.text) await onDelta(rest.text);
    return { tokens, telemetry: out.telemetry, usedWeb: false };
  } catch (e) {
    if (e instanceof GateError) {
      if (e.kind === 'cancelled' || signal?.aborted) throw Object.assign(new Error('Avbrutt'), { cancelled: true });
      if (e.kind === 'load_timeout' || e.kind === 'idle_timeout') throw Object.assign(new Error(`${BE_NAME} svarte ikke innen tidsfristen`), { timeout: true, net: true, telemetry: e.telemetry });
      throw Object.assign(new Error(maskSecrets(e.message)), { status: e.status, net: e.kind === 'nocontact', telemetry: e.telemetry });
    }
    throw e;
  }
}

/** Oppføringen i modellvalget (GET /api/chat/models) – bare når Neutrino svarer og flagget er på. */
export function chatModels53() {
  if (!neutrinoReady53()) return [];
  const info = state53('neutrino').info ?? {};
  return [{ id: NEUTRINO_ID53, name: NEUTRINO_NAME53, kind: 'lokal', provider: 'fermion', size: '3.9 GB', vision: false, installed: true, via: 'fermion', host: 'Mac mini', ...(info.context ? { ctx: info.context } : {}) }];
}

/** Kort test for admin: én ekte generering. → {ok, text, ms, model, error?} */
export async function testNeutrino53() {
  const t0 = Date.now();
  if (!neutrinoConf53()) return { ok: false, error: 'Neutrino er ikke satt opp', ms: 0, model: NEUTRINO_ID53 };
  await probe53('neutrino');
  try {
    const out = await gateChat({ model: NEUTRINO_ID53, backend: NEUTRINO_BACKEND53, base: ollamaBase() || neutrinoConf53()?.url || '', priority: 'interactive', label: 'Test · Neutrino', retries: 0, deadlineMs: 120_000,
      body: { messages: [{ role: 'user', content: 'Svar med ett ord: OK' }], options: { temperature: 0, num_predict: 8 } } });
    return { ok: !!String(out.text ?? '').trim(), text: String(out.text ?? '').trim().slice(0, 200), ms: Date.now() - t0, model: NEUTRINO_ID53 };
  } catch (e) { return { ok: false, error: maskSecrets(e.message), ms: Date.now() - t0, model: NEUTRINO_ID53 }; }
}
