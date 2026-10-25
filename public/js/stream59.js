// Prompt 59 (prompt 49 del 4, D4WEB): Glimt strømmer svaret på web. Formene står i $S/SERVER59-API.md.
//   POST /api/glimt/agent/stream  (samme body som POST /api/glimt/agent) → text/event-stream:
//     start {requestId, stream}  ·  status {stage, text, tool?}  ·  token {t, source:'model'|'mal'}
//     done  (hele svaret, samme JSON som POST /api/glimt/agent, + cached, cache?)  ·  error {error, status}
//   Kommentarlinjer («: ping») ignoreres. done.reply er fasit: den strømmede teksten byttes ut med den.
// Stopp: AbortController.abort() på fetch-en (serveren avbryter modellkallet og lagrer ingenting i svar-cachen).
// Reserve: 404/405 (eldre server) → null, så kalleren bruker POST /api/glimt/agent eller /api/assist som før.
// stream:false (Strømming av i innstillingene) → bare status og done; svaret i done brukes som før.
import { agent, normAgent } from './glimt-agent45.js';
import { convBody60 } from './convo60.js'; // prompt 60: conversationId / conversationKind / choice (SERVER60-API.md §1)

const OFF_MS = 10 * 60_000;
let offUntil = 0;
/** Har serveren strømmingen? (false i 10 min etter 404/405). */
export const streamOn59 = () => Date.now() >= offUntil && typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';

export const rid59 = () => {
  try { if (crypto?.randomUUID) return `w59-${crypto.randomUUID()}`; } catch { /* */ }
  return `w59-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/** Tekst så langt uten halv markdown: en uavsluttet «**» (fet delt over flere biter) tas bort til den lukkes. */
export function tidy59(t) {
  const s = String(t ?? ''), n = (s.match(/\*\*/g) ?? []).length;
  if (n % 2 === 0) return s.replace(/(^|[^*])\*$/, '$1'); // en enkelt «*» på slutten kan bli starten på «**»
  const i = s.lastIndexOf('**');
  return s.slice(0, i) + s.slice(i + 2);
}

/** Leser SSE-hendelser fra en fetch-respons. onEvent(event, data) for hver hendelse med gyldig JSON. */
export async function readEvents59(res, onEvent) {
  const rd = res.body.getReader(), dec = new TextDecoder();
  let buf = '', ev = 'message', data = [];
  const fire = () => {
    if (!data.length) { ev = 'message'; return; }
    let d = null; try { d = JSON.parse(data.join('\n')); } catch { d = null; }
    const e = ev; ev = 'message'; data = [];
    if (d != null) onEvent(e, d);
  };
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      if (!line) { fire(); continue; }
      if (line.startsWith(':')) continue; // «: ping»
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  buf += dec.decode();
  if (buf.trim().startsWith('data:')) data.push(buf.trim().slice(5).replace(/^ /, ''));
  fire();
}

/**
 * Spør Glimt med strømming. o = { signal, requestId, webSearch?, conversationId?, conversationKind?, choice?, onStart?({requestId, stream}), onStatus?({stage, text, tool}),
 *   onToken?(textSoFar, bit) }.
 * → normAgent(done) med .raw (hele done), .cached, .cache, .streamed (true når token-hendelser kom).
 * null = serveren har ikke /stream (bruk agent()). Kaster AbortError ved Stopp, ellers Error med .status.
 */
export async function agentStream59(text, module = 'home', context = {}, o = {}) {
  text = String(text ?? '').trim();
  if (!text || !streamOn59()) return null;
  const ctx = Object.fromEntries(Object.entries(context ?? {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
  const body = { text: text.slice(0, 1000), module, ...(Object.keys(ctx).length ? { context: ctx } : {}), requestId: o.requestId ?? rid59(), ...(typeof o.webSearch === 'boolean' ? { webSearch: o.webSearch } : {}), ...convBody60(o) };
  let r;
  try { r = await fetch('/api/glimt/agent/stream', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: o.signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error(`Fikk ikke kontakt med Glimt: ${e.message}`); }
  if (r.status === 401) { location.href = '/login'; throw new Error('Ikke innlogget'); }
  if (r.status === 404 || r.status === 405) { offUntil = Date.now() + OFF_MS; return null; }
  const ct = r.headers.get('content-type') ?? '';
  if (!r.ok) {
    const d = ct.includes('json') ? await r.json().catch(() => ({})) : {};
    throw Object.assign(new Error(d.error || (r.status === 429 ? 'Glimt jobber med mye nå. Prøv igjen om litt.' : `Glimt svarte ikke (feil ${r.status}).`)), { status: r.status });
  }
  if (!ct.includes('text/event-stream') || !r.body) {
    // Uventet: serveren svarte med vanlig JSON (f.eks. en proxy). Bruk den som svaret.
    const d = ct.includes('json') ? await r.json().catch(() => null) : null;
    if (!d) return null;
    return finish(d, false);
  }
  let txt = '', done = null, err = null, streamed = false;
  await readEvents59(r, (ev, d) => {
    if (ev === 'start') o.onStart?.(d);
    else if (ev === 'status') o.onStatus?.({ stage: d.stage ?? '', text: String(d.text ?? ''), tool: d.tool ?? null });
    else if (ev === 'token') { const t = String(d.t ?? ''); if (!t) return; txt += t; streamed = true; o.onToken?.(tidy59(txt), t, d.source ?? ''); }
    else if (ev === 'done') done = d;
    else if (ev === 'error') err = d;
  });
  if (err && !done) {
    if (err.status === 499) throw Object.assign(new Error(err.error || 'Stoppet'), { name: 'AbortError', partial: tidy59(txt) });
    throw Object.assign(new Error(err.error || 'Glimt fikk ikke gjort det akkurat nå. Prøv igjen.'), { status: err.status ?? 502, partial: tidy59(txt) });
  }
  if (!done) throw Object.assign(new Error('Glimt ble avbrutt før svaret var ferdig. Prøv igjen.'), { status: 0, partial: tidy59(txt) });
  return finish(done, streamed);
}
function finish(d, streamed) {
  const a = normAgent(d);
  a.raw = d; a.cached = !!d.cached; a.cache = d.cache ?? null; a.streamed = streamed; a.traceId = d.traceId ?? null;
  try { if (a.done.length) document.dispatchEvent(new CustomEvent('hl:agent45', { detail: { modules: [...new Set(a.done.map((x) => String(x.tool ?? '').split('.')[0]).filter(Boolean))], actions: a.done } })); } catch { /* */ }
  return a;
}

/** Strømming når serveren har den, ellers den vanlige agenten (POST /api/glimt/agent). null = ingen agent (eldre server). */
export async function agentLive59(text, module = 'home', context = {}, o = {}) {
  const a = await agentStream59(text, module, context, o);
  if (a) return a;
  return agent(text, module, context, { signal: o.signal, requestId: o.requestId, conversationId: o.conversationId, conversationKind: o.conversationKind, choice: o.choice });
}

/** «Fant et ferskt svar» – kort merknad når svaret kom fra svar-cachen. */
export function cacheNote59(a) {
  if (!a?.cached) return '';
  const m = Math.round((a.cache?.ageMs ?? 0) / 60000);
  return m < 1 ? 'Ferskt svar fra cachen (under ett minutt gammelt)' : `Ferskt svar fra cachen (${m} min gammelt)`;
}

/* Statuslinja og Stopp-knappen (Glimt-søket på Hjem og Glimt i Chat). */
const CSS59 = `
.gl-st59{display:flex;align-items:center;gap:8px;min-height:26px;margin-top:6px;font:500 13.5px/1.35 Manrope,Outfit,system-ui,sans-serif;color:rgba(246,242,234,.72);min-width:0}
.gl-st59 .gl-st59t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gl-busy .gl-stop59{margin-left:auto}
.gl-stop59{flex:none}
.gl-live59{display:block}
.ch-st59{display:flex;align-items:center;gap:8px;margin:2px 0 6px;font-size:13px;color:var(--mut,#8a93a6);min-width:0}
.ch-st59>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-st59-dot{flex:none;width:7px;height:7px;border-radius:50%;background:currentColor;animation:st59 1.1s ease-in-out infinite}
@keyframes st59{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ch-st59-dot{animation:none;opacity:.7}}
`;
if (typeof document !== 'undefined' && !document.getElementById('st59-css')) {
  const st = document.createElement('style'); st.id = 'st59-css'; st.textContent = CSS59;
  (document.head ?? document.documentElement).appendChild(st);
}
