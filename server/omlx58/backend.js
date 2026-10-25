// Prompt 58 (OMLX58): oMLX som tredje backend i AI-gaten (registerBackend('omlx')), ved siden av «ollama» og «openwebui».
// oMLX (github.com/jundot/omlx, Apache-2.0) er en OpenAI-kompatibel MLX-server på Mac mini-en: POST {url}/v1/chat/completions med SSE,
// Authorization: Bearer <nøkkel>. Køen, tidsgrensene, nye forsøk og telemetrien er gatens; her er bare oversettelsen.
//
// Ollama-body → OpenAI-body (omlxBody58):
//   options.num_predict → max_tokens · temperature/top_p/seed/stop direkte · num_ctx sendes IKKE (konteksten settes i oMLX; varsel i loggen
//   når prompten ser ut til å overstige modellens max_context fra /v1/models) · keep_alive sendes ikke (oMLX har LRU/TTL selv)
//   format (JSON-skjema) → response_format {type:'json_schema', json_schema:{name:'plan', schema, strict:true}} · format 'json' → json_object
//   think:false → chat_template_kwargs {enable_thinking:false} (+ «/no_think» som gaten legger på for Qwen3) · think:true → enable_thinking:true
//   tools (Ollama-/OpenAI-form) → tools med navn uten punktum: «calendar.create» → «calendar_create» (OpenAI-kompatible servere krever
//   ^[a-zA-Z0-9_-]+$). tool_calls i svaret mappes tilbake til de ekte navnene, og argumentene (JSON-tekst) parses til objekt.
//   bilder (images:[base64]) → content [{type:'text'}, {type:'image_url', image_url:{url:'data:…'}}] (toOpenAiMessage)
//   Meldinger med tool_calls/role 'tool' (flere runder) får id-er (call_1 …) så OpenAI-formen henger sammen.
// Svaret: delta.content (tekst), delta.reasoning_content/reasoning (tenking, telles men vises ikke), delta.tool_calls (samles per index),
// usage (prompt_tokens/completion_tokens). <think>…</think> fjernes (stripThink). Embeddings: POST /v1/embeddings.
// Nøkkelen logges aldri og maskeres i feilmeldinger.
import { registerBackend, GateError, httpGateError, toOpenAiMessage } from '../ai-gate.js';
import { stripThink } from '../ollama-opts.js';
import { omlxConf58 } from './config.js';
import { maxContext58, omlxModels58, resolveModel58, omlxState58 } from './health.js';

export const OMLX_BACKEND58 = 'omlx';
const NAME = 'oMLX';

/** «calendar.create» → «calendar_create» (bare [a-zA-Z0-9_-], maks 64 tegn). */
export const toolName58 = (n) => String(n ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

const parseArgs = (a) => {
  if (a && typeof a === 'object') return a;
  const s = String(a ?? '').trim();
  if (!s) return {};
  try { return JSON.parse(s); } catch { return { _raw: s }; }
};

/**
 * Ollama-body (/api/chat eller /api/generate) → {payload, names}. names: Map(«calendar_create» → «calendar.create»).
 * kind: 'chat' | 'generate'. thinking: modellen er en tenkemodell (bare da sendes enable_thinking).
 */
export function omlxBody58(kind, body = {}, { thinking = true } = {}) {
  const opt = body.options ?? {};
  const msgs0 = kind === 'generate'
    ? [...(body.system ? [{ role: 'system', content: body.system }] : []), { role: 'user', content: body.prompt ?? '', ...(body.images?.length ? { images: body.images } : {}) }]
    : body.messages ?? [];
  const names = new Map();
  const enc = (n) => { const e = toolName58(n); if (!names.has(e)) names.set(e, String(n)); return e; };
  let n = 0;
  const pending = [];
  const messages = msgs0.map((m) => {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const calls = m.tool_calls.map((c) => {
        const id = c.id ?? `call_${++n}`;
        pending.push(id);
        const fn = c.function ?? c;
        return { id, type: 'function', function: { name: enc(fn.name), arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}) } };
      });
      return { role: 'assistant', content: typeof m.content === 'string' ? m.content : '', tool_calls: calls };
    }
    if (m?.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id ?? pending.shift() ?? `call_${++n}`, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') };
    return toOpenAiMessage(m);
  });
  const out = { model: body.model, stream: true, stream_options: { include_usage: true }, messages };
  if (opt.num_predict) out.max_tokens = opt.num_predict;
  for (const k of ['temperature', 'top_p', 'seed', 'stop']) if (opt[k] !== undefined) out[k] = opt[k];
  if (body.format && typeof body.format === 'object') out.response_format = { type: 'json_schema', json_schema: { name: 'plan', schema: body.format, strict: true } };
  else if (body.format === 'json') out.response_format = { type: 'json_object' };
  if (typeof body.think === 'boolean' && thinking) out.chat_template_kwargs = { enable_thinking: body.think };
  if (Array.isArray(body.tools) && body.tools.length) {
    out.tools = body.tools.map((t) => {
      const fn = t.function ?? t;
      return { type: 'function', function: { name: enc(fn.name), ...(fn.description ? { description: fn.description } : {}), parameters: fn.parameters ?? { type: 'object', properties: {} } } };
    });
  }
  return { payload: out, names };
}

/** tool_calls fra OpenAI-svaret → Ollama-form [{function:{name, arguments:{}}}] med de ekte navnene. */
export function toolCallsBack58(calls, names = new Map()) {
  return (calls ?? []).filter((c) => c?.function?.name || c?.name).map((c) => {
    const fn = c.function ?? c;
    const nm = String(fn.name);
    return { function: { name: names.get(nm) ?? nm, arguments: parseArgs(fn.arguments) } };
  });
}

const estTokens = (payload) => Math.round(JSON.stringify(payload.messages ?? []).replace(/data:[^"]{200,}/g, '').length / 3.5 + (payload.tools ? JSON.stringify(payload.tools).length / 3.5 : 0));
const warned = new Set();

registerBackend(OMLX_BACKEND58, {
  label: NAME,
  /** Gaten leser adressen og nøkkelen her (egen kø-instans per adresse). */
  conf: () => { const c = omlxConf58(); return c.url ? { url: c.url, key: c.key, label: NAME } : null; },
  async chatStream(req, { onToken, signal, onRequest }) {
    const { base, body, fetch: f, model, kind } = req;
    const key = req.conf?.key ?? '';
    const headers = { 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
    if (kind === 'load') throw new GateError('http', 'oMLX laster modeller selv ved første kall (ingen egen innlasting)', { status: 501, transient: false, backendName: NAME });
    if (kind === 'embed') {
      const res = await f(`${base}/v1/embeddings`, { method: 'POST', headers, body: JSON.stringify({ model, input: body.input }), signal });
      onRequest?.();
      if (!res.ok) throw httpGateError(res.status, await res.text().catch(() => ''), NAME);
      const j = await res.json().catch(() => ({}));
      await onToken(null);
      const embeddings = (j.data ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
      const fin = { model, embeddings, prompt_eval_count: j.usage?.prompt_tokens ?? 0, via: 'omlx' };
      return { text: '', content: '', thinking: '', message: null, final: fin, embeddings, usage: { tokIn: fin.prompt_eval_count, tokOut: 0 }, timing: {} };
    }
    const part = req.partial ?? { content: '', thinking: '' };
    const { payload, names } = omlxBody58(kind, body, { thinking: req.thinking });
    // num_ctx styres i oMLX: varsle (én gang per modell og størrelse) når prompten ser ut til å være lengre enn modellens max_context.
    try {
      if (!omlxState58().models.length) omlxModels58().catch(() => {});
      const mc = maxContext58(model), est = estTokens(payload) + (payload.max_tokens ?? 0);
      if (mc && est > mc * 0.95 && !warned.has(`${model}:${Math.round(est / 512)}`)) { warned.add(`${model}:${Math.round(est / 512)}`); console.warn(`[ai-gate] oMLX ${model}: prompten (~${est} tokens med svar) er nær eller over max_context ${mc} – oMLX kan kutte`); }
      const real = resolveModel58(model);
      if (real && real !== model) payload.model = real; // samme modell, ID-en oMLX selv oppgir (med/uten organisasjonsmappe)
    } catch { /* bare varsel */ }
    const t0 = Date.now();
    const res = await f(`${base}/v1/chat/completions`, { method: 'POST', headers: { ...headers, accept: 'text/event-stream' }, body: JSON.stringify(payload), signal });
    onRequest?.();
    if (!res.ok) throw httpGateError(res.status, await res.text().catch(() => ''), NAME);
    let usage = null, streamErr = null, done = false, firstAt = null;
    const calls = new Map(); // index → {id, name, arguments}
    const chunk = (content) => (kind === 'chat' ? { model, message: { role: 'assistant', content } } : { model, response: content });
    const take = async (d) => {
      const reasoning = d.reasoning_content ?? d.reasoning ?? d.thinking ?? '';
      const content = typeof d.content === 'string' ? d.content : '';
      if (reasoning || content || d.tool_calls) firstAt = firstAt ?? Date.now();
      if (reasoning) { part.thinking += reasoning; await onToken(null); }
      if (content) { part.content += content; await onToken(chunk(content)); }
      for (const [i, tc] of (d.tool_calls ?? []).entries()) {
        const idx = tc.index ?? i;
        const cur = calls.get(idx) ?? { id: null, name: '', arguments: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += cur.name && cur.name === tc.function.name ? '' : tc.function.name;
        const a = tc.function?.arguments;
        if (a !== undefined && a !== null) cur.arguments = typeof a === 'string' ? cur.arguments + a : JSON.stringify(a);
        calls.set(idx, cur);
        await onToken(null);
      }
    };
    const onData = async (data) => {
      if (!data) return;
      if (data === '[DONE]') { done = true; return; }
      let j; try { j = JSON.parse(data); } catch { return; }
      if (j.error) { streamErr = httpGateError(500, JSON.stringify({ error: j.error?.message ?? j.error }), NAME); return; }
      const c0 = j.choices?.[0];
      if (c0) await take(c0.delta ?? c0.message ?? {});
      if (j.usage) usage = j.usage;
    };
    const ctype = res.headers?.get?.('content-type') ?? '';
    if (/json/.test(ctype) && !/event-stream/.test(ctype)) {
      const j = await res.json().catch(() => ({}));
      if (j.error) streamErr = httpGateError(500, JSON.stringify({ error: j.error?.message ?? j.error }), NAME);
      else { await take(j.choices?.[0]?.message ?? {}); usage = j.usage ?? null; done = true; }
    } else if (res.body?.getReader) {
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done: end } = await rd.read();
        if (end) break;
        if (value?.length) await onToken(null); // SSE keep-alive under lang prefill holder tidsgrensene i live
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, '').trim(); buf = buf.slice(i + 1);
          if (line.startsWith('data:')) await onData(line.slice(5).trim());
          if (streamErr) break;
        }
        if (streamErr) { try { rd.cancel(); } catch { /* */ } break; }
      }
      buf += dec.decode();
      if (!streamErr && buf.trim().startsWith('data:')) await onData(buf.trim().slice(5).trim());
    } else {
      for (const line of String(await res.text()).split('\n')) { if (line.trim().startsWith('data:')) await onData(line.trim().slice(5).trim()); if (streamErr) break; }
    }
    if (streamErr) throw streamErr;
    const toolCalls = toolCallsBack58([...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => ({ function: { name: c.name, arguments: c.arguments } })), names);
    if (!done && !usage && !part.content && !part.thinking && !toolCalls.length) throw new GateError('unloaded', 'oMLX avbrøt svaret (modellen ble lastet ut underveis?)', { transient: true, backendName: NAME });
    const u = usage ?? {};
    const tokIn = u.prompt_tokens ?? 0, tokOut = u.completion_tokens ?? 0;
    const end = Date.now();
    const promptMs = firstAt ? firstAt - t0 : end - t0, genMs = firstAt ? end - firstAt : 0;
    const final = { model, done: true, done_reason: 'stop', prompt_eval_count: tokIn, eval_count: tokOut, prompt_eval_duration: promptMs * 1e6, eval_duration: genMs * 1e6,
      ...(kind === 'chat' ? { message: { role: 'assistant', content: '' } } : { response: '' }), via: 'omlx' };
    await onToken(final);
    const message = { role: 'assistant', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
    return { text: stripThink(part.content), content: part.content, thinking: part.thinking, message, final,
      // Prompt 59: prefiks-cachen (OpenAI-formen usage.prompt_tokens_details.cached_tokens, når oMLX oppgir den) – cache-effekten i tracen.
      usage: { tokIn, tokOut, cachedTokens: u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens ?? null }, timing: { loadMs: 0, promptMs, genMs } };
  },
});
