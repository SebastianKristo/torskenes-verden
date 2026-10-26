// Prompt 34: AI-kontroll – ett felles panel for modeller, nedlasting, ruting (Valg), jobber, forbruk og API-nøkler.
// Fasit: design/AI Kontroll.dc.html (variant web|mobile, scope alle|chat|finans, theme papir|mork|finans, tab).
// Brukes i Innstillinger → AI (web), i Chat (Modeller og Samtaleinnstillinger → «Full AI-kontroll ›») og i FinansHub → Innstillinger → AI.
// Selvstendig modul (ingen import), så FinansHub kan laste den fra /assets/js/ai-control.js.
//
// Data (SERVER34, claude-code-ai-kontroll.md). Svarer et endepunkt 404 (eldre server), vises det tydelig, og resten virker:
//   GET  /api/ai/status            → {providers:[{id,name,state:'ok'|'degraded'|'off',label,ms,model,error,keyTail,url}], routes:[…], gpu?, server?, disk?}
//   GET  /api/ai/models            → installerte (Ollama /api/tags + /api/ps) og sky-modeller
//   GET  /api/ai/library?q=        → biblioteket på ollama.com (med størrelser)
//   POST /api/ai/models/pull {model} (SSE: status/completed/total), POST /api/ai/models/:id/load|unload, DELETE /api/ai/models/:id
//   GET/PUT /api/ai/routing        → {tasks:{id:{model,fallback}}, rules, params, budget, cloudOn}
//   GET  /api/ai/jobs, POST /api/ai/jobs/:id/cancel|retry, POST /api/ai/queue/pause, DELETE /api/ai/jobs (tøm historikk)
//   GET  /api/ai/usage?days=       → {totals, byDay, byProvider, byTask, budget}
//   PUT  /api/ai/keys/:provider, POST /api/ai/keys/:provider/test, GET/POST/DELETE /api/ai/tokens
//   POST /api/ai/selftest          → SSE per rute {task, model, ok, ms, error, fix}
//   Prompt 44: GET/PUT /api/ai/backend (Open WebUI / Ollama, adresser, nettsøkkilder; nøkler bare som satt/ikke satt),
//              POST /api/ai/backend/test {which}, DELETE /api/ai/backend/think-leak, POST /api/ai/websearch/test {q}
// Nøkler, modeller og serverstandarden kan bare endres av admin; alle ser status, jobber og forbruk og kan velge egne
// modeller for Chat, AI-søk, Glimt og brief.

const THEMES = {
  papir: { bg: '#f3efe6', card: '#fffdf8', fld: '#ece6da', line: '#ddd5c5', ink: '#1b1a17', mut: '#6b665c', acc: '#b23a2a', ok: '#2f7a4f', warn: '#a8661a', bad: '#b23a2a', hf: 'Newsreader,Georgia,serif' },
  mork: { bg: '#161513', card: '#211f1b', fld: '#2b2824', line: '#3b3731', ink: '#efe9de', mut: '#a49d91', acc: '#ec7a64', ok: '#6fc28f', warn: '#e0a85a', bad: '#ec7a64', hf: 'Newsreader,Georgia,serif' },
  // Prompt 66: «Nåværende» (mørkt glass) – samme farger som Innstillinger i det temaet (web30 --w30-*).
  cur: { bg: '#0c1119', card: '#111723', fld: '#1a2231', line: '#1f2736', ink: '#eef0f4', mut: '#8a93a6', acc: '#a8d4fb', ok: '#34c759', warn: '#e0a85a', bad: '#f59a8f', hf: 'Manrope,system-ui,sans-serif' },
  finans: { bg: '#0A0A0C', card: '#141418', fld: '#1B1B20', line: '#2A2A31', ink: '#F2F2F4', mut: '#8C8C96', acc: '#FF7A3D', ok: '#9FE3C6', warn: '#FFC86B', bad: '#FF7A7A', hf: 'Manrope,system-ui,sans-serif' },
};
// Brukes når serveren ikke har /api/ai/library ennå.
const LIB0 = [['qwen3:8b', 'Alibaba Qwen 3 · rask, tenker ved behov', 5.2, 'tekst'], ['qwen3:14b', 'Alibaba Qwen 3 · resonnering og verktøy', 9.3, 'tekst'], ['qwen2.5vl:7b', 'Qwen 2.5 VL · leser kvitteringer og bilder', 6.0, 'bilde'],
  ['gemma3:12b', 'Google Gemma 3 · sterk norsk, leser bilder', 8.1, 'bilde'], ['gemma3:27b', 'Google Gemma 3 · sterk norsk', 17, 'tekst'], ['llama3.2:3b', 'Meta Llama 3.2 · liten og rask', 2.0, 'tekst'],
  ['mistral-small3.2', 'Mistral Small 3.2 · rask med verktøy', 15, 'tekst'], ['phi4:14b', 'Microsoft Phi-4 · liten og skarp', 9.1, 'tekst'], ['minicpm-v', 'MiniCPM-V · bilde på lite minne', 5.5, 'bilde'],
  ['deepseek-r1:14b', 'DeepSeek R1 · tenker før den svarer', 9.0, 'resonnering'], ['bge-m3', 'BGE-M3 · flerspråklige embeddings', 1.2, 'embedding'], ['nomic-embed-text', 'Nomic · embeddings for kunnskapsbasen', 0.27, 'embedding']]
  .map(([id, d, gb, k]) => ({ id, d, gb, k }));
const CLOUD0 = [['gemini-2.5-flash', 'gemini', 'Gemini · rask, leser bilder'], ['gemini-2.5-pro', 'gemini', 'Gemini · best på lange dokumenter'], ['llama-3.3-70b-versatile', 'groq', 'Groq · svært rask tekst'],
  ['qwen/qwen3-32b', 'groq', 'Groq · resonnering'], ['meta-llama/llama-4-scout-17b-16e-instruct', 'groq', 'Groq · bilde']].map(([id, provider, desc]) => ({ id, provider, desc }));
// [id, navn, beskrivelse, finans, personlig] – samme som AI_TASKS i server/ai-run.js.
const TASKS0 = [['chat', 'Chat', 'Standardmodell i nye samtaler', 0, 1], ['sok', 'AI-søk', 'Søkefeltet og spørsmål i hele appen', 0, 1], ['glimt', 'Glimt · kalender', 'Forstå hendelser og svare om kalenderen', 0, 1],
  ['brief', 'Glimt · brief', 'Morgen-, dags- og kveldsbrief', 0, 1], ['rc', 'Kvitteringer (bilde)', 'Leser butikk, beløp og varelinjer', 1, 0], ['kat', 'Kategorisering', 'Foreslår kategori for transaksjoner', 1, 0],
  ['fsok', 'Finans · spør', '«Har jeg et musikkabonnement?»', 1, 0], ['bar', 'Strekkoder og pakkelapper', 'Bildefelt fra kamera', 1, 0], ['dom', 'Domener · oppsummering', 'Daglig sammendrag', 0, 0], ['kb', 'Kunnskapsbase', 'Embeddings for dokumenter', 0, 0]];
const KEEP = [['5m', '5 min'], ['30m', '30 min'], [-1, 'Alltid'], [0, 'Aldri']], CTX = [[8192, '8k'], [32768, '32k'], [131072, '128k']], TEMP = [[0.2, '0,2'], [0.7, '0,7'], [1, '1,0']], PAR = [[1, '1'], [2, '2'], [3, '3'], [4, '4']];
const CONF = [[70, '70 %'], [80, '80 %'], [85, '85 %'], [90, '90 %'], [95, '95 %']];
// Prompt 43: Ollama-gaten – keep_alive per modell, samtidige forespørsler og de to tidsgrensene (sekunder).
const MKEEP = [[null, 'Standard'], [0, '0'], ['5m', '5 min'], ['15m', '15 min'], ['30m', '30 min'], ['1h', '1 t'], [-1, 'Alltid']];
const LOADT = [[30, '30 s'], [60, '60 s'], [90, '90 s'], [180, '180 s']], FIRSTT = [[15, '15 s'], [30, '30 s'], [60, '60 s']];
const IDLET = [[15, '15 s'], [30, '30 s'], [60, '60 s'], [120, '120 s']], IDLEI = [[30, '30 s'], [60, '60 s'], [120, '120 s']];

// Prompt 58 (OMLX58): oMLX på Mac mini-en – «Motor per oppgave» (Valg) og admin-kortet (Modeller) fylles av omlx58.js.
if (typeof document !== 'undefined') import('./omlx58.js').catch(() => {});
// Prompt 59 (prompt 49 del 4): «Raskere svar» (Svar-cache, Varm modell, Strømming, Parallelle verktøy) i fanen Valg fylles av fast59.js.
if (typeof document !== 'undefined') import('./fast59.js').catch(() => {});
// Prompt 60 (prompt 49 del 3): «Forstår samtaler» (Samtaletilstand, Entitetsregister, Valgknapper) under «Raskere svar» fylles av understand60.js.
if (typeof document !== 'undefined') import('./understand60.js').catch(() => {});
// Prompt 61 (prompt 49 del 1): «Glimt lærer» (Lagre oppskrifter, Bruk som eksempler, Hurtigvei, Lær av rettelser) under «Forstår samtaler» fylles av recipes61.js.
if (typeof document !== 'undefined') import('./recipes61.js').catch(() => {});
// Prompt 62 (prompt 49 del 2): «Faste oppgaver» (Planlagte oppgaver, Betingede varsler, Stille timer, prisområde) under «Glimt lærer» fylles av sched62.js.
if (typeof document !== 'undefined') import('./sched62.js').catch(() => {});
// Prompt 63 (prompt 49 del 5): «Minnet holder seg ryddig» (Nattlig oppsummering, Motstrid-sjekk, Marker ubrukte fakta) under «Faste oppgaver» fylles av memory63.js.
if (typeof document !== 'undefined') import('./memory63.js').catch(() => {});
// Prompt 64 (prompt 49 del 7): «Kvalitet over tid» (Ukerapport, Nattlig eval og admin-grensene) under «Minnet holder seg ryddig» fylles av quality64.js.
if (typeof document !== 'undefined') import('./quality64.js').catch(() => {});
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const nb = (n, d = 0) => Number(n || 0).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
const krs = (n) => `${Number(n || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
const tk = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(Math.round(n || 0)));
const gbs = (n) => (n == null ? '' : `${Number(n).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} GB`);
const ms2 = (ms) => (ms == null ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} s`);
const vibe = () => { try { navigator.vibrate?.(8); } catch { /* */ } };
const ago = (t) => {
  if (!t) return 'aldri'; const d = new Date(t), s = (Date.now() - d) / 1000;
  if (s < 90) return 'nå'; if (s < 3600) return `for ${Math.round(s / 60)} min siden`; if (s < 86400 && d.getDate() === new Date().getDate()) return `i dag ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
  if (s < 2 * 86400) return 'i går'; return `for ${Math.round(s / 86400)} dager siden`;
};
const sw = (on) => `<span class="ac-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;

/* ---------------- Nett ---------------- */

async function call(path, o = {}) {
  const r = await fetch('/api/ai' + path, { method: o.method ?? 'GET', credentials: 'same-origin', headers: o.json !== undefined ? { 'Content-Type': 'application/json' } : {}, body: o.json !== undefined ? JSON.stringify(o.json) : undefined, signal: o.signal });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || (r.status === 404 ? 'Serveren har ikke dette ennå' : r.status === 403 ? 'Bare administrator kan endre dette' : `Feil ${r.status}`)), { status: r.status, data: d });
  return d;
}
/** Leser et SSE-svar (text/event-stream) eller et vanlig JSON-svar. onEvent(data, event). */
async function stream(path, json, onEvent, signal) {
  const r = await fetch('/api/ai' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(json ?? {}), signal });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || (r.status === 404 ? 'Serveren har ikke dette ennå' : r.status === 403 ? 'Bare administrator kan gjøre dette' : `Feil ${r.status}`)), { status: r.status }); }
  if (!r.headers.get('content-type')?.includes('event-stream')) { const d = await r.json().catch(() => ({})); onEvent(d, 'done'); return; }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message', data = '';
      for (const ln of chunk.split('\n')) { if (ln.startsWith('event:')) ev = ln.slice(6).trim(); else if (ln.startsWith('data:')) data += ln.slice(5).trim(); }
      if (!data) continue;
      try { onEvent(JSON.parse(data), ev); } catch { /* ugyldig linje */ }
    }
  }
}

/* ---------------- Tilstand (delt mellom alle panelene) ---------------- */

const G = {
  status: null, models: null, lib: null, routing: null, jobs: null, usage: null, tokens: null, missing: {}, err: {}, loading: {}, at: {},
  pulls: {}, selftest: null, toast: '', eye: {}, test: {}, q: '', cat: 'alle', per: '30', paused: false, fresh: null, admin: false, libQ: null, open: {}, msub: 'inst',
};
const inst = new Set(); // monterte paneler {el, o, tab}
function redraw() { for (const p of inst) paint(p); }
let toastT = 0;
function toast(t) { G.toast = t; clearTimeout(toastT); redraw(); toastT = setTimeout(() => { G.toast = ''; redraw(); }, 2800); }

async function get(key, path, map = (x) => x) {
  if (G.loading[key]) return G.loading[key];
  G.loading[key] = call(path).then((d) => { G[key] = map(d); G.missing[key] = false; G.err[key] = ''; G.at[key] = Date.now(); })
    .catch((e) => { G.missing[key] = e.status === 404; G.err[key] = e.message; if (G[key] == null) G[key] = e.status === 404 ? null : G[key]; })
    .finally(() => { G.loading[key] = null; redraw(); });
  return G.loading[key];
}
const loadStatus = (force) => get('status', `/status${force ? '?fresh=1' : ''}`);
// Eldre server (uten /api/ai/models): installerte modeller fra Chat (/api/chat/models), bare til visning.
const loadModels = () => get('models', '/models').then(async () => {
  if (!G.missing.models || G.legacy) return;
  try {
    const r = await fetch('/api/chat/models', { credentials: 'same-origin' }); if (!r.ok) return;
    const d = await r.json(), L = d.models ?? [];
    G.models = { installed: L.filter((m) => m.kind !== 'sky' && m.installed).map((m) => ({ name: m.id, desc: m.name, sizeGb: parseFloat(String(m.size ?? '').replace(',', '.')) || null, kind: m.vision ? 'bilde' : 'tekst' })),
      cloud: L.filter((m) => m.kind === 'sky').map((m) => ({ id: m.id, provider: m.provider, desc: m.name })) };
    G.legacy = true; redraw();
  } catch { /* ingen Chat heller */ }
});
/** GET /api/ai/routing: tasks kan være en liste [{id, name, desc, fin, personal, model, fallback, warning}] → kart + liste. */
function normRouting(d) {
  if (!d || typeof d !== 'object') return d;
  const r = d.routing ?? d;
  if (Array.isArray(r.tasks)) return { ...r, taskList: r.tasks, tasks: Object.fromEntries(r.tasks.map((t) => [t.id, { model: t.model ?? '', fallback: t.fallback ?? '' }])) };
  return r;
}
const loadRouting = () => { get('finRouting', '/routing?scope=finans', normRouting); return get('routing', '/routing', (d) => { const r = normRouting(d); if (typeof r?.admin === 'boolean') G.admin = r.admin; return r; }); };
/* Prompt 38 (claude-code-ai-kontroll-modellvalg-fiks.md): Finans har alltid fire rader, med standard og reserve fra spec. */
const FIN4 = [['rc', 'Kvitteringer (bilde)', 'Leser butikk, beløp og varelinjer', 'qwen2.5vl:7b', 'gemini-2.5-flash'], ['kat', 'Kategorisering', 'Foreslår kategori for transaksjoner', 'qwen3:8b', 'llama-3.3-70b-versatile'],
  ['fsok', 'Finans · spør', '«Har jeg et musikkabonnement?»', 'gemma4:latest', 'gemini-2.5-flash'], ['bar', 'Strekkoder og pakkelapper', 'Bildefelt fra kamera', 'roboflow/kvittering/1', 'qwen2.5vl:7b']];
const FIN_ALIAS = { kvittering: 'rc', kvitteringer: 'rc', receipts: 'rc', categorize: 'kat', kategorisering: 'kat', finans_sok: 'fsok', ask: 'fsok', barcode: 'bar', strekkode: 'bar' };
function finRows() {
  const F = G.finRouting?.taskList ?? (G.routing?.taskList ?? []), byId = new Map(F.map((t) => [FIN_ALIAS[t.id] ?? t.id, t]));
  const R = { ...(G.routing?.tasks ?? {}), ...(G.finRouting?.tasks ?? {}) };
  return FIN4.map(([id, n, d, m0, f0]) => { const t = byId.get(id) ?? {}, r = R[t.id ?? id] ?? R[id] ?? {}; return { id: t.id ?? id, n: t.name ?? n, d: t.desc ?? d, model: r.model ?? t.model ?? '', fallback: r.fallback ?? t.fallback ?? '', def: m0, defF: f0, options: Array.isArray(t.options) ? t.options : null, warning: t.warning ?? '', small: !!(t.smallModel ?? (G.routing?.taskList ?? []).find((x) => x.id === (t.id ?? id))?.smallModel) }; });
}
const loadKeys = () => get('keys', '/keys', (d) => d.providers ?? d);
const loadJobs = () => get('jobs', '/jobs?limit=60', (d) => { if (typeof d?.paused === 'boolean') G.paused = d.paused; G.jobGroups = Array.isArray(d?.groups) ? d.groups : null; G.unseenFailed = Number.isFinite(d?.unseenFailed) ? d.unseenFailed : null; return Array.isArray(d) ? d : d.running || d.queued || d.recent ? [...(d.running ?? []), ...(d.queued ?? []), ...(d.recent ?? [])] : d.jobs ?? d.items ?? []; });
const loadUsage = () => get('usage', `/usage?days=${G.per}`);
const loadTokens = () => get('tokens', '/tokens', (d) => (Array.isArray(d) ? d : d.tokens ?? d.items ?? []));
function loadLib(q = '') {
  G.libQ = q;
  return call(`/library?q=${encodeURIComponent(q)}`).then((d) => { G.lib = (Array.isArray(d) ? d : d.items ?? d.models ?? []).map((m) => ({ id: m.id ?? m.name, d: m.desc ?? m.description ?? '', gb: m.sizeGb ?? m.gb ?? m.size ?? null, k: m.cat ?? m.kind ?? m.k ?? 'tekst', fit: m.fit ?? null, inst: !!m.installed })); G.missing.lib = false; })
    .catch((e) => { G.missing.lib = e.status === 404; G.lib = null; }).finally(redraw);
}

/* ---------------- Normalisering ---------------- */

const routingOf = () => G.routing ?? {};
const tasksOf = () => {
  const L = G.routing?.taskList;
  if (Array.isArray(L) && L.length) return L.map((t) => [t.id, t.name, t.desc ?? '', t.fin ? 1 : 0, t.personal ? 1 : 0]);
  return TASKS0;
};
function installed() {
  const M = G.models, L = M?.installed ?? M?.local ?? M?.ollama?.models ?? (Array.isArray(M?.models) ? M.models.filter((m) => (m.provider ?? 'ollama') === 'ollama') : []) ?? [];
  const loaded = new Set((M?.loaded ?? M?.running ?? M?.ps ?? []).map((x) => (typeof x === 'string' ? x : x.name ?? x.model)));
  return L.map((m) => ({ id: m.id ?? m.name ?? m.model, d: m.desc ?? m.family ?? '', params: m.params ?? m.parameterSize ?? m.details?.parameter_size ?? '', gb: m.sizeGb ?? (m.size > 1e6 ? m.size / 1e9 : m.size) ?? null,
    q: m.quant ?? m.quantization ?? m.details?.quantization_level ?? '', ctx: m.ctx ?? m.contextLength ?? null, k: m.kind ?? 'tekst', loaded: !!(m.loaded ?? loaded.has(m.name ?? m.id)), vramGb: m.vramGb ?? null,
    last: m.lastUsed ?? m.last_used ?? null, until: m.expiresAt ?? m.expires_at ?? null, fit: m.fit ?? null })).filter((m) => m.id);
}
function cloud() {
  const M = G.models, L = M?.cloud ?? (Array.isArray(M?.models) ? M.models.filter((m) => m.provider && m.provider !== 'ollama') : null);
  const on = routingOf().cloudOn ?? {};
  return (L?.length ? L : CLOUD0).map((m) => ({ id: m.id ?? m.name, provider: m.provider, desc: m.desc ?? m.description ?? '', vision: !!m.vision, on: m.on != null ? !!m.on : on[m.id ?? m.name] != null ? !!on[m.id ?? m.name] : true, key: m.available ?? m.hasKey ?? null }));
}
/* Prompt 38 (claude-code-ai-maskin-mac-mini.md): AI-maskinen er en Mac mini M4 med 16 GB samlet minne og 2 TB ekstern disk.
   server.hw:{model, chip, memGb, gpuBudgetGb, disk:{name, totalGb, freeGb, external, mounted}, source} kommer fra Ollama-verten.
   Eldre server uten hw: standardmaskinen (samme standard som serveren), aldri RTX 2080. */
const HW0 = { model: 'Mac mini M4', chip: 'Apple M4', memGb: 16, gpuBudgetGb: 10.7, disk: { name: 'Ekstern disk', totalGb: 2000, external: true, mounted: true } };
function gpu() {
  const S = G.status ?? {}, M = G.models ?? {}, hw = S.server?.hw ?? S.hw ?? M.hw ?? null, g = S.server?.gpu ?? S.gpu ?? M.gpu ?? {};
  const H = hw ?? (g.name && !/rtx|geforce|nvidia/i.test(g.name) ? null : HW0);
  const used = S.server?.vramUsedGb ?? g.usedGb ?? installed().filter((m) => m.loaded).reduce((a, m) => a + (m.vramGb ?? m.gb ?? 0), 0);
  const diskUsedM = installed().reduce((a, m) => a + (m.gb ?? 0), 0);
  if (H) {
    const mem = +H.memGb || 16, bud = +H.gpuBudgetGb || Math.round(mem * 2 / 3 * 10) / 10, D = H.disk ?? {}, tb = +D.totalGb || 0;
    const dn = tb ? `${tb >= 1000 ? `${nb(tb / 1000, tb % 1000 ? 1 : 0)} TB` : `${nb(tb)} GB`} ${D.external ? 'ekstern disk' : 'disk'}` : '';
    return { hw: true, name: [H.model || 'Mac', mem ? `${nb(mem)} GB samlet minne` : '', dn].filter(Boolean).join(' · '), chip: H.chip ?? '', vram: bud, used, mem,
      diskUsed: D.totalGb != null && D.freeGb != null ? Math.max(diskUsedM, D.totalGb - D.freeGb) : diskUsedM, diskTot: D.totalGb ?? null, diskName: D.name ?? '', external: !!D.external, mounted: D.mounted !== false, source: H.source ?? (hw ? '' : 'standard') };
  }
  const vram = g.vramGb ?? g.totalGb ?? null, disk = S.disk ?? S.server?.disk ?? {};
  return { name: g.name ? `${g.name}${vram ? ` · ${nb(vram)} GB` : ''}` : '', vram, used, diskUsed: S.server?.diskGb ?? disk.usedGb ?? diskUsedM, diskTot: disk.totalGb ?? null, mounted: true };
}
/* Anbefalte innstillinger for maskinen (status.recommend:[{key, text, env?}]); standardlisten når serveren ikke sender dem. */
const REC0 = [['loaded', 'Én stor modell lastet om gangen', 'OLLAMA_MAX_LOADED_MODELS=1'], ['parallel', 'Én forespørsel om gangen per modell', 'OLLAMA_NUM_PARALLEL=1'],
  ['kv', 'KV-cache i q8_0 sparer minne', 'OLLAMA_KV_CACHE_TYPE=q8_0'], ['flash', 'Flash attention', 'OLLAMA_FLASH_ATTENTION=1'],
  ['keep', 'Hold de mest brukte modellene lastet i 30 min (trege lastetider fra HDD)', 'OLLAMA_KEEP_ALIVE=30m'], ['models', 'Modellene på den eksterne disken', 'OLLAMA_MODELS=/Volumes/<disk>/ollama'],
  ['pmset', 'Mac-en skal ikke sove (ellers spinner HDD-en ned)', 'sudo pmset -a sleep 0 disksleep 0']].map(([key, text, env]) => ({ key, text, env }));
const provs = () => G.status?.providers ?? [];
const prov = (id) => provs().find((p) => p.id === id);
// Prompt 38: av GPU-budsjettet (10,7 GB på Mac mini M4 16 GB): PASSER ≤ 8 GB, TRANGT ≤ 10,5 GB (én om gangen), FOR STOR > 10,5 GB.
const fitOf = (gb) => { const g = gpu(), v = g.vram || 10.7, k = v / 10.7; if (gb == null) return ''; if (!g.hw && g.vram) return gb <= v * 0.94 ? 'PASSER' : gb <= v * 2.6 ? 'DELVIS CPU' : 'FOR STOR'; return gb <= 8 * k ? 'PASSER' : gb <= 10.5 * k ? 'TRANGT' : 'FOR STOR'; };
const jobsF = (fin) => (G.jobs ?? []).filter((j) => !fin || ['rc', 'kat', 'fsok', 'bar'].includes(j.task));

/* ---------------- Handlinger ---------------- */

async function saveRouting(patch, okMsg = '') {
  const prev = G.routing;
  const r = routingOf(), merge = { ...r, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'object' && v && !Array.isArray(v) ? { ...(r[k] ?? {}), ...v } : v])) };
  if (patch.tasks) merge.tasks = { ...(r.tasks ?? {}), ...Object.fromEntries(Object.entries(patch.tasks).map(([k, v]) => [k, { ...(r.tasks?.[k] ?? {}), ...v }])) };
  if (patch.params?.modelKeepAlive) merge.params = { ...merge.params, modelKeepAlive: { ...(r.params?.modelKeepAlive ?? {}), ...patch.params.modelKeepAlive } }; // prompt 43
  G.routing = merge;
  redraw();
  try {
    const d = await call('/routing', { method: 'PUT', json: patch });
    if (d && (d.tasks || d.routing)) G.routing = normRouting(d);
    if (okMsg) toast(okMsg);
    // Ruter endret: kjør selvtesten i bakgrunnen og si fra hvis noe feiler.
    if (patch.tasks) selftest(true);
  } catch (e) { G.routing = prev; toast(`Kunne ikke lagre: ${e.message}`); }
}

function selftest(quiet = false) {
  if (G.selftest && !G.selftest.done) return;
  const fin = [...inst].some((p) => p.o.scope === 'finans') && ![...inst].some((p) => p.o.scope !== 'finans');
  G.selftest = { res: {}, order: [], done: false, quiet, err: '' };
  if (!quiet) vibe();
  redraw();
  stream('/selftest', fin ? { scope: 'finans' } : {}, (d, ev) => {
    const S = G.selftest;
    if (!S) return;
    const rows = d.results ?? (d.task ? [d] : []);
    for (const x of rows) { if (!S.res[x.task]) S.order.push(x.task); S.res[x.task] = x; }
    if (ev === 'done' || d.done || d.results) S.done = true;
    redraw();
  }).then(() => {
    const S = G.selftest; if (!S) return; S.done = true;
    const bad = Object.values(S.res).filter((x) => !x.ok).length;
    if (!S.quiet || bad) toast(bad ? `${bad} AI-funksjoner virker ikke · se Oversikt` : 'Alle AI-funksjoner svarer');
    loadStatus(); redraw();
  }).catch((e) => { const S = G.selftest; if (S) { S.done = true; S.err = e.status === 404 ? 'Serveren har ikke selvtest ennå. Oppdater serveren.' : e.message; } redraw(); });
}

function pull(id) {
  id = String(id ?? '').trim();
  if (!id || G.pulls[id] || installed().some((m) => m.id === id)) return;
  vibe();
  const ctl = new AbortController(), t0 = Date.now();
  G.pulls[id] = { p: 0, got: 0, tot: null, mbs: 0, st: 'Starter …', ctl }; G.q = ''; redraw();
  stream('/models/pull', { model: id, name: id }, (d) => {
    const P = G.pulls[id]; if (!P) return;
    if (d.error) { P.err = d.error; redraw(); return; }
    if (d.total) { P.tot = d.total; P.got = d.completed ?? 0; P.p = Math.min(100, (P.got / P.tot) * 100); P.mbs = P.got / 1e6 / Math.max(1, (Date.now() - t0) / 1000); }
    if (d.pct != null) P.p = d.pct;
    if (d.mbps != null) P.mbs = d.mbps;
    P.st = d.status ?? P.st;
    redraw();
  }, ctl.signal).then(() => {
    const P = G.pulls[id]; delete G.pulls[id];
    if (P?.err) toast(`Kunne ikke laste ned ${id}: ${P.err}`); else { toast(`${id} er lastet ned`); vibe(); }
    loadModels(); loadStatus();
    const nx = G.pullQ?.shift(); if (nx) pull(nx); // prompt 39: «Last ned det som mangler» – én om gangen
  }).catch((e) => { delete G.pulls[id]; if (e.name !== 'AbortError') toast(`Kunne ikke laste ned ${id}: ${e.message}`); redraw(); });
}

async function modelAct(id, act) {
  const m = installed().find((x) => x.id === id);
  try {
    if (act === 'del') {
      if (!confirm(`Slette ${id}${m?.gb ? ` (${gbs(m.gb)})` : ''}?`)) return;
      await call(`/models/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast(`${id} slettet`);
    } else if (act === 'load') { toast(m?.loaded ? `Laster ut ${id} …` : `Laster inn ${id} …`); await call(`/models/${encodeURIComponent(id)}/${m?.loaded ? 'unload' : 'load'}`, { method: 'POST' }); toast(m?.loaded ? `${id} lastet ut av VRAM` : `${id} er lastet inn`); }
    vibe();
  } catch (e) { toast(e.message); }
  loadModels(); if (act === 'del') { loadRouting(); loadStatus(); }
}

/* ---------------- Prompt 44: backend (Open WebUI / Ollama) og nettsøk ---------------- */

const loadBackend = () => get('backend', '/backend');
async function saveBackend(patch, msg = 'Lagret') {
  try { const d = await call('/backend', { method: 'PUT', json: patch }); G.backend = d; toast(msg); vibe(); loadStatus(true); }
  catch (e) { toast(`Kunne ikke lagre: ${e.message}`); }
  redraw();
}
async function testBackend(which) {
  G.btest = { ...(G.btest ?? {}), [which]: { busy: true } }; vibe(); redraw();
  try {
    const d = await call('/backend/test', { method: 'POST', json: { which } });
    G.btest[which] = d.ok ? { ok: `Svarer · ${ms2(d.ms ?? 0)}${d.version ? ` · versjon ${d.version}` : ''} · ${(d.models ?? []).length} modeller` } : { err: d.error || 'Svarte ikke' };
  } catch (e) { G.btest[which] = { err: e.message }; }
  redraw();
}
async function testWeb(q) {
  q = String(q ?? '').trim();
  if (!q) return;
  G.wtest = { busy: true, q }; vibe(); redraw();
  try { G.wtest = { q, r: await call('/websearch/test', { method: 'POST', json: { q } }) }; } catch (e) { G.wtest = { q, err: e.message }; }
  redraw();
}
const BE_SEG = [['auto', 'Automatisk'], ['openwebui', 'Open WebUI'], ['ollama', 'Ollama']];
const beName = (k) => (k === 'openwebui' ? 'Open WebUI' : 'Ollama direkte');
async function testKey(p) {
  G.test[p] = { busy: true }; vibe(); redraw();
  try { const d = await call(`/keys/${p}/test`, { method: 'POST' }); G.test[p] = d.ok === false ? { err: d.error || 'Svarte ikke' } : { ok: `Svarte på ${ms2(d.ms ?? 0)}${d.model ? ` · ${d.model}` : ''}` }; }
  catch (e) { G.test[p] = { err: e.message }; }
  redraw();
}
async function saveKey(p, field, value) {
  const v = String(value ?? '').trim();
  if (!v && field !== 'url') return;
  try { const d = await call(`/keys/${p}`, { method: 'PUT', json: { [field]: v } }); if (d?.providers) G.keys = d.providers; toast('Lagret'); vibe(); G.test[p] = null; loadKeys(); loadStatus(true); selftest(true); }
  catch (e) { toast(`Kunne ikke lagre: ${e.message}`); }
}

/* Prompt 40 (claude-code-ai-jobber-og-smb-mappe.md): feil med samme årsak grupperes («8 selvtester feilet · tidsavbrudd 15 s»
   med pil og «Prøv alle igjen»), kort feiltekst på én linje (hele meldingen i detaljer), faser på kjører-raden
   (phase:{kind:'load'|'think'|'answer', loadedGb, totalGb, chars}), og tallet på fanen teller bare nye feil siden sist. */
const SEEN_KEY = 'ai_jobs_seen40';
const seenAt = () => { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch { return 0; } };
const jobTime = (j) => Date.parse(j.finishedAt ?? j.endedAt ?? j.at ?? j.updatedAt ?? j.createdAt ?? '') || 0;
const isFail = (j) => j.status === 'fail';
function unseenFails(J) {
  if (G.unseenFailed != null && !G.seenLocal) return G.unseenFailed;
  const t = seenAt();
  return J.filter((j) => isFail(j) && jobTime(j) > t).length;
}
let seenPost = 0;
function markJobsSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* privat modus */ }
  G.seenLocal = true;
  if (Date.now() - seenPost < 5000) return;
  seenPost = Date.now();
  call('/jobs/seen', { method: 'POST', json: {} }).then(() => { G.unseenFailed = 0; G.seenLocal = false; }).catch(() => { /* eldre server: bare lokalt */ });
}
/** Kort årsak på én linje (serverens short/reason, ellers tolket fra feilmeldingen). */
function shortReason(j) {
  if (j.short) return j.short;
  const e = String(j.error ?? j.reason ?? ''), n = e.match(/(\d+)\s*s\b/)?.[1];
  if (/hoppet over|for lite minne|not enough memory|insufficient memory|out of memory/i.test(e)) return /hoppet/i.test(e) ? e.replace(/^.*?(Hoppet over)/i, '$1') : 'For lite minne';
  if (/ingen kontakt|får ikke kontakt|econnrefused|fetch failed|connect|unreachable|enotfound/i.test(e)) return 'Ingen kontakt med Ollama';
  if (/ble ikke lastet|lastet ikke|load(ing)? (timeout|timed out)|laster modellen/i.test(e)) return `Tidsavbrudd · lastet ikke inn${n ? ` på ${n} s` : ''}`;
  if (/ingen nye tokens/i.test(e)) return `Tidsavbrudd · ingen nye tokens${n ? ` på ${n} s` : ''}`; // prompt 43
  if (/lastet ut underveis/i.test(e)) return 'Modellen ble lastet ut underveis';
  if (/svarte ikke|timeout|timed out|tidsavbrudd/i.test(e)) return `Tidsavbrudd · svarte ikke${n ? ` på ${n} s` : ''}`;
  if (j.status === 'cancel' || j.status === 'cancelled') return 'Avbrutt av bruker';
  return e.split(/[.:\n]/)[0].slice(0, 80) || 'Feilet';
}
const groupKey = (j) => shortReason(j);
function failGroups(fails) {
  if (G.jobGroups?.length) {
    const byId = new Map(fails.map((j) => [String(j.id), j]));
    return G.jobGroups.map((g) => ({ reason: g.reason ?? g.short, short: g.short ?? g.reason, count: g.count ?? (g.ids ?? []).length, ids: (g.ids ?? []).map(String), jobs: (g.ids ?? []).map((id) => byId.get(String(id))).filter(Boolean) }))
      .filter((g) => g.count > 0);
  }
  const m = new Map();
  for (const j of fails) { const k = groupKey(j); if (!m.has(k)) m.set(k, { reason: k, short: k, ids: [], jobs: [] }); const g = m.get(k); g.ids.push(String(j.id)); g.jobs.push(j); }
  return [...m.values()].map((g) => ({ ...g, count: g.ids.length }));
}
const nounFor = (jobs) => (jobs.length && jobs.every((j) => /selvtest|selftest/i.test(`${j.task ?? ''} ${j.title ?? ''} ${j.kind ?? ''}`)) ? ['selvtest', 'selvtester'] : ['jobb', 'jobber']);
const gb = (v) => (v == null ? '?' : String(Math.round(v * 10) / 10).replace('.', ','));
function phaseText(j) {
  const ph = j.phase;
  if (!ph?.kind) return '';
  if (ph.kind === 'load') return `Laster modellen fra disk${ph.totalGb ? ` · ${gb(ph.loadedGb ?? 0)} av ${gb(ph.totalGb)} GB` : ' …'}`;
  if (ph.kind === 'think') return 'Tenker …';
  if (ph.kind === 'answer') return `Svarer${ph.chars != null ? ` · ${nb(ph.chars)} tegn` : ' …'}`;
  return '';
}
async function retryJobs(ids, group) {
  try { await call('/jobs/retry', { method: 'POST', json: group ? { group, ids } : { ids } }); vibe(); toast(`Prøver ${ids.length} på nytt`); }
  catch (e) {
    if (e.status !== 404) { toast(e.message); }
    else { for (const id of ids) await call(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }).catch(() => {}); toast(`Prøver ${ids.length} på nytt`); }
  }
  loadJobs();
}

async function jobAct(id, act) {
  try { await call(`/jobs/${encodeURIComponent(id)}/${act}`, { method: 'POST' }); vibe(); } catch (e) { toast(e.message); }
  loadJobs();
}

function allModelOpts() {
  const L = [...installed().map((m) => ({ v: m.id, n: `${m.id} · lokal`, loc: true })), ...cloud().filter((c) => c.on).map((c) => ({ v: c.id, n: `${c.id} · ${c.provider}`, loc: false }))];
  return L;
}

/* ---------------- Prompt 39: Glimt anbefaler modeller (claude-code-ai-glimt-anbefaler-modeller.md, fasit AI Kontroll.dc.html → REC/RKW) ---------------- */
// Kuratert tabell (start fra REC i fasiten): [modell, GB, hvorfor]. Rangert per oppgave. Serverens GET /api/ai/recommend vinner når den finnes.
const REC = {
  chat: [['gemma4:latest', 9.6, 'Best på norsk av det som får plass, og svarer raskt.'], ['gemma3:12b', 8.1, 'Sterk norsk og leser bilder.'], ['qwen3:8b', 5.2, 'Rask og god til verktøy.'], ['llama3.2:3b', 2.0, 'Liten og rask når minnet er knapt.']],
  sok: [['qwen3:8b', 5.2, 'Rask med verktøy og søk, og samme modell som Glimt (ingen modellbytte).'], ['gemma4:latest', 9.6, 'Forstår norske spørsmål godt og deler modell med Chat.']], // prompt 55: ikke llama3.2:3b
  glimt: [['gemma4:latest', 9.6, 'Forstår datoer og steder på norsk, samme modell som Chat.'], ['qwen3:8b', 5.2, 'Rask og presis på strukturerte svar.'], ['gemma3:12b', 8.1, 'God norsk.']],
  brief: [['gemma4:latest', 9.6, 'Skriver naturlig norsk og gjenbruker modellen som allerede er lastet.'], ['qwen3:8b', 5.2, 'Rask.'], ['llama3.2:3b', 2.0, 'Liten.']],
  rc: [['qwen2.5vl:7b', 6.0, 'Best til å lese tekst i bilder, bare 6 GB.'], ['gemma3:12b', 8.1, 'Leser bilder og forstår norske varenavn.'], ['minicpm-v', 5.5, 'Bilde på lite minne.']],
  kat: [['qwen3:8b', 5.2, 'Presis på norske butikknavn, og samme modell som Glimt (ingen modellbytte).'], ['gemma4:latest', 9.6, 'Deler modell med Chat.']], // prompt 55
  fsok: [['qwen3:8b', 5.2, 'Rask med verktøy og tall.'], ['gemma4:latest', 9.6, 'God norsk.']],
  bar: [['qwen2.5vl:7b', 6.0, 'Leser pakkelapper og strekkoder fra bilder.'], ['minicpm-v', 5.5, 'Bilde på lite minne.'], ['gemma3:12b', 8.1, 'Leser bilder.']],
  dom: [['qwen3:8b', 5.2, 'Korte sammendrag – rask og presis.'], ['gemma4:latest', 9.6, 'God norsk.'], ['llama3.2:3b', 2.0, 'Liten.']],
  kb: [['bge-m3', 1.2, 'Flerspråklige embeddings, god på norsk.'], ['nomic-embed-text', 0.27, 'Liten og rask.']],
};
// Nøkkelord for «Spør Glimt» (RKW): tekst → oppgave.
const RKW = [[/kvitt|bong|kassalapp|bilde|lese tekst/i, 'rc'], [/kategori|transaksj|bank/i, 'kat'], [/strekkode|pakke|lapp|qr/i, 'bar'], [/kalender|avtale|time|dato/i, 'glimt'],
  [/søk|spørsmål|finne/i, 'sok'], [/brief|morgen|oppsummer/i, 'brief'], [/domene|nettside/i, 'dom'], [/dokument|kunnskap|pdf|embedd/i, 'kb'], [/økonomi|finans|penger|abonnement/i, 'fsok'], [/chat|prat|skriv|kode|norsk/i, 'chat']];
const loadRec = () => get('rec', '/recommend', (d) => (Array.isArray(d) ? d : d?.items ?? d?.tasks ?? null));
const instHas = (id) => installed().some((m) => m.id === id || m.id === `${id}:latest` || `${m.id}:latest` === id || m.id.split(':')[0] === id.replace(/:latest$/, ''));
const instId = (id) => installed().find((m) => m.id === id || m.id === `${id}:latest` || `${m.id}:latest` === id || m.id.split(':')[0] === id.replace(/:latest$/, ''))?.id ?? id;
/** Én anbefaling per oppgave: {task, name, model, gb, why, alt, fit, installed, inUse}. */
function recRows() {
  const R = routingOf(), srv = Array.isArray(G.rec) ? G.rec : null, finLocal = !!R.rules?.finLocal;
  return tasksOf().map(([k, n, , isFin]) => {
    const s = srv?.find((x) => x.task === k);
    const cands = REC[k] ?? REC.chat, best = s ? [s.model, s.sizeGb, s.why] : cands.find((c) => (c[1] ?? 0) <= (gpu().vram || 10.7)) ?? cands[0];
    const alt = s?.alt ?? cands.find((c) => c[0] !== best[0])?.[0] ?? '';
    const cur = R.tasks?.[k]?.model ?? '', id = instHas(best[0]) ? instId(best[0]) : best[0];
    return { task: k, name: n, model: id, gb: best[1], why: s?.why ?? best[2], alt, fit: s?.fit ?? fitOf(best[1]), installed: s?.installed ?? instHas(best[0]), inUse: s?.inUse ?? (!!cur && (cur === id || cur === best[0])), fin: !!isFin && finLocal, pullCmd: s?.pullCmd };
  });
}
/** «La Glimt velge»: førstevalg blant installerte modeller per oppgave (R.rt.glPlan). Reserven røres ikke. */
function glPlan() {
  const R = routingOf(), cloudIds = new Set(cloud().map((c) => c.id)), plan = {}; let missing = 0;
  for (const [k, , , isFin, personal] of tasksOf()) {
    if (!G.admin && !personal) continue;
    const cands = REC[k] ?? REC.chat, srv = Array.isArray(G.rec) ? G.rec.find((x) => x.task === k) : null;
    const order = srv ? [srv.model, srv.alt, ...cands.map((c) => c[0])] : cands.map((c) => c[0]);
    const pick = order.filter(Boolean).find((m) => instHas(m) && !(isFin && R.rules?.finLocal && cloudIds.has(m)));
    if (!pick) { missing++; continue; }
    const id = instId(pick), cur = R.tasks?.[k]?.model ?? '';
    if (cur !== id) plan[k] = { model: id };
  }
  return { plan, n: Object.keys(plan).length, missing };
}
async function glGo() {
  const { plan, n } = glPlan();
  if (!n) return;
  const R = routingOf(), prev = Object.fromEntries(Object.keys(plan).map((k) => [k, { model: R.tasks?.[k]?.model ?? '' }]));
  vibe();
  await saveRouting({ tasks: plan }, `✦ Glimt fylte ut ${n} ${n === 1 ? 'valg' : 'valg'}`);
  G.glUndo = prev; redraw();
  clearTimeout(glGo.t); glGo.t = setTimeout(() => { G.glUndo = null; redraw(); }, 5000);
}
/** Laster ned én om gangen (kø). */
function pullQueue(ids) {
  G.pullQ = [...new Set([...(G.pullQ ?? []), ...ids])].filter((id) => !instHas(id));
  if (!Object.keys(G.pulls).length) { const n = G.pullQ.shift(); if (n) pull(n); }
}
async function recAsk(q) {
  q = String(q ?? '').trim();
  if (!q) return;
  G.recAsk = { q, busy: true }; redraw();
  try {
    const d = await call('/recommend/ask', { method: 'POST', json: { q } });
    G.recAsk = { q, text: d.text ?? d.answer ?? '', model: d.model ?? d.recommend?.model ?? '' };
  } catch {
    const k = RKW.find(([re]) => re.test(q))?.[1], r = k ? recRows().find((x) => x.task === k) : null;
    G.recAsk = r ? { q, text: `Til ${r.name.toLowerCase()} anbefaler jeg ${r.model} (${gbs(r.gb)}, ${String(r.fit || 'passer').toLowerCase()}). ${r.why}${r.alt ? ` Alternativ: ${r.alt}.` : ''}`, model: r.model }
      : { q, text: 'Jeg er ikke sikker på hva du vil bruke den til. En god allrounder er gemma4:latest (chat, søk og Glimt). Prøv f.eks. «lese kvitteringer», «kalender» eller «dokumenter».', model: 'gemma4:latest' };
  }
  redraw();
}

/* ---------------- Prompt 45: Glimt-personlighet (claude-code-glimt-intelligent-agent.md → Personlighet) ----------------
   GET/PUT /api/glimt/agent/settings {personality:'off'|'little'|'full'} per bruker, standard «Litt». */
const PERS45 = [['off', 'Av', 'Bare saklige svar.'], ['little', 'Litt', 'Varm og kvikk, en sjelden liten spøk etter bekreftelsen.'], ['full', 'Full rakker', 'God nordmann, monarkist og moroknarkist. Fortsatt aldri ved feil, sletting eller økonomi.']];
function loadPers45() {
  if (G.pers45 !== undefined) return;
  G.pers45 = null;
  fetch('/api/glimt/agent/settings', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : r.status === 404 ? { missing: true } : null)).then((j) => { G.pers45 = j ?? { personality: 'little' }; redraw(); }).catch(() => { G.pers45 = { personality: 'little' }; redraw(); });
}
async function setPers45(v) {
  const prev = G.pers45; G.pers45 = { ...(prev ?? {}), personality: v }; vibe(); redraw();
  try { const r = await fetch('/api/glimt/agent/settings', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personality: v }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Feil ${r.status}`); G.pers45 = await r.json(); toast(`Personlighet: ${PERS45.find((x) => x[0] === v)?.[1]}`); }
  catch (e) { G.pers45 = prev; toast(e.message); }
  redraw();
}
/* Prompt 41 (claude-code-ai-jobber-klokkeslett.md): tidskolonne per jobb. Serverens createdAt/startedAt/endedAt (eller
   created_at/started_at/finished_at), i nettleserens tidssone. «… siden» oppdateres hvert minutt (jobbfanen tegnes på nytt). */
const tms41 = (j, ...k) => { for (const x of k) { const v = Date.parse(j[x] ?? ''); if (v) return v; } return 0; };
const hm41 = (t) => new Date(t).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
function day41(t) {
  const d = new Date(t), n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return hm41(t);
  if (d.toDateString() === y.toDateString()) return `i går ${hm41(t)}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm41(t)}`;
}
function ago41(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? 'nå nettopp' : m < 60 ? `${m} min siden` : m < 24 * 60 ? `${Math.floor(m / 60)} t siden` : '';
}
const endOf41 = (j) => tms41(j, 'endedAt', 'finishedAt', 'ended_at', 'finished_at', 'at', 'updatedAt');
function jobTime41(j) {
  const r = j.status === 'run', qq = j.status === 'queue';
  if (r) { const t = tms41(j, 'startedAt', 'started_at', 'createdAt', 'created_at'); return t ? `<span class="ac-jt41"><b>startet ${hm41(t)}</b></span>` : ''; }
  if (qq) { if (j.when) return ''; const t = tms41(j, 'createdAt', 'created_at', 'queuedAt'); return t ? `<span class="ac-jt41"><b>lagt i kø ${hm41(t)}</b></span>` : ''; }
  const t = endOf41(j);
  if (!t) return j.timeLabel ? `<span class="ac-jt41"><b>${esc(j.timeLabel)}</b></span>` : '';
  const a = ago41(t);
  return `<span class="ac-jt41" title="${esc(new Date(t).toLocaleString('nb-NO'))}"><b>${esc(day41(t))}</b>${a ? `<i>${esc(a)}</i>` : ''}</span>`;
}
function groupTime41(jobs) {
  const ts = jobs.map(endOf41).filter(Boolean).sort((a, b) => a - b);
  if (!ts.length) return '';
  const a = ts[0], b = ts.at(-1), same = new Date(a).toDateString() === new Date(b).toDateString();
  const span = a === b ? day41(b) : same ? `${day41(a)}–${hm41(b)}` : `${day41(a)}–${day41(b)}`, ag = ago41(b);
  return `<span class="ac-jt41" title="Siste feilet ${esc(new Date(b).toLocaleString('nb-NO'))}"><b>${esc(span)}</b>${ag ? `<i>siste ${esc(ag)}</i>` : ''}</span>`;
}
let jt41 = 0;

/* ======================================================================================================================
   Prompt 65 (prompt 50b: claude-code-ai-innstillinger-kompakt.md + claude-code-innstillinger-samlet.md): kompakt, uniform AI-side.
   - Horisontal sticky fanerad: Oversikt · Modeller · Oppgaver · Kvitteringer · Tjenester · Jobber · Forbruk (15 px strek-ikon,
     teller: Jobber = feilede, Tjenester = tjenester som feiler). Ingen vertikal undermeny. «Glimt og chat» er fjernet:
     Glimt-delen vises under Innstillinger → Glimt (only:'glimt'), Chat-brytere og AI-logg ligger i Oppgaver → Regler.
   - Én rad-komponent (row): 28 px ikonflis med 9 px statusmerke, tittel 13,5/600 (mono for id-er) + liten mono-tag,
     undertekst 12 px på én linje med ellipsis, kontroller til høyre (wrapper under på mobil), utvidbar med chevron.
   - Kontroller: knapp 30 px pill (primær blekk, sekundær kant, fare rød tekst), segment 30 px, select 30 px, bryter 36×22, felt 34 px.
   - Kort (radius 14, ingen skygge), grå mono seksjonsetikett med valgfri høyretekst, banner for status, KPI-stripe i ett kort.
   - embedded: ingen egen tittel/Ferdig/100vh (bare fanelinjen). only: 'glimt' (eller en fanenøkkel) skjuler fanelinjen.
   Gamle fanenøkler mappes: rt/valg → task (Oppgaver), api/imp → svc (Tjenester).
   ==================================================================================================================== */

const I65 = {
  pulse: 'M3 12h4l3-8 4 16 3-8h4', chip: 'M6 6h12v12H6zM9.5 9.5h5v5h-5zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 9', spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3', server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  bars: 'M4 20V10M10 20V4M16 20v-7M22 20H2', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z', shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chat: 'M4 5h16v11H9l-5 4z', doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6', down: 'M12 3v12M7 10l5 5 5-5M4 21h16', cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5', flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  disk: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0', book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 5v16',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4', bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01', home: 'M3 11l9-7 9 7M5 10v10h14V10', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z', sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4', copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  mem: 'M5 8h14v8H5zM8 8V5M12 8V5M16 8V5M8 19v-3M12 19v-3M16 19v-3', queue: 'M4 6h16M4 12h10M4 18h7M18 15v6M15 18h6', warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5 9-10', money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', x: 'M6 6l12 12M18 6L6 18', chev: 'M9 6l6 6-6 6',
  up: 'M12 19V5M6 11l6-6 6 6', people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3', dot: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};
const ico = (n, s = 15) => `<svg class="ac-i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I65[n] ?? I65.dot}"/></svg>`;
// Ikon etter innhold for rader modulene tegner (fast59, understand60, recipes61, sched62, memory63, quality64 …).
const KW65 = [[/cache|lagrede svar/i, 'disk'], [/varm|hovedmodell/i, 'thermo'], [/strømming|strøm/i, 'bolt'], [/parallell/i, 'branch'], [/samtale|valgknapp|chat/i, 'chat'],
  [/entitet|register/i, 'people'], [/oppskrift|lær|eksempel|hurtigvei|rettelse/i, 'book'], [/planlagt|fast|faste|påminn|stille timer/i, 'cal'], [/varsel|betinget/i, 'bell'],
  [/prisområde|pris/i, 'money'], [/minne|oppsummering|motstrid|fakta|husk/i, 'brain'], [/eval|rapport|kvalitet|uke/i, 'flask'], [/tid|grense|minutt|sekund|dager/i, 'clock'],
  [/temperatur/i, 'thermo'], [/omlx|ollama|modell|motor/i, 'chip'], [/personvern|sky|lokal/i, 'shield'], [/nøkkel/i, 'key'], [/bilde/i, 'image'], [/tale|stemme/i, 'mic']];
const icoFor = (t) => KW65.find(([re]) => re.test(t))?.[1] ?? 'sliders';

const ui65 = {
  ico,
  sw: (on) => sw(on),
  /** Seksjon: grå mono-etikett (+ høyretekst) og ett kort. o: {right, note, hl, bare} */
  sec: (label, inner, o = {}) => `<section class="ac-sec"${o.hl ? ` data-hl="${esc(o.hl)}"` : ''}>${label ? `<div class="ac-lab"><span>${label}</span>${o.right ? `<span class="ac-labr">${o.right}</span>` : ''}</div>` : ''}${o.bare ? inner : `<div class="ac-card">${inner}</div>`}${o.note ? `<p class="ac-note">${esc(o.note)}</p>` : ''}</section>`,
  /** Én rad. o: {ic, tile, dot, t|th, mono, tag, s|sh, sc, right, x, panel, attrs, hl, cls, btn} */
  row(o) {
    const open = !!(o.x && G.open[o.x]);
    const tile = o.noic ? '' : `<span class="ac-ic${o.tile ? ' txt' : ''}" aria-hidden="true">${o.tile ? `<b>${esc(o.tile)}</b>` : ico(o.ic ?? 'dot')}${o.dot ? `<i class="ac-icd ${o.dot}"></i>` : ''}</span>`;
    const title = `<span class="ac-rt1"><b class="ac-ell${o.mono ? ' ac-mono' : ''}">${o.th ?? esc(o.t)}</b>${o.tag ? `<i class="ac-tg${o.tagc ? ` ${o.tagc}` : ''}">${esc(o.tag)}</i>` : ''}</span>`;
    const subTxt = o.s ?? '';
    const sub = o.sh != null || subTxt ? `<span class="ac-rs ac-ell${o.sc ? ` ${o.sc}` : ''}"${subTxt ? ` title="${esc(subTxt)}"` : ''}>${o.sh ?? esc(subTxt)}</span>` : '';
    const chev = o.x ? `<button type="button" class="ac-chev${open ? ' on' : ''}" data-ac-x="${esc(o.x)}" aria-expanded="${open}" aria-label="${open ? 'Skjul' : 'Vis mer'}: ${esc(o.t ?? '')}">${ico('chev', 14)}</button>` : '';
    const right = (o.right ?? '') + chev, ctl = /<(button|select|input|form|label)/.test(o.right ?? '');
    const tag = o.btn ? 'button' : 'div';
    return `<${tag}${o.btn ? ' type="button"' : ''} class="ac-r${o.x ? ' ac-rx' : ''}${open ? ' open' : ''}${ctl ? ' ctl' : ''}${o.cls ? ` ${o.cls}` : ''}"${o.x ? ` data-ac-xrow="${esc(o.x)}"` : ''}${o.hl ? ` data-hl="${esc(o.hl)}"` : ''} ${o.attrs ?? ''}>${tile}<span class="ac-rm">${title}${sub}</span>${right ? `<span class="ac-rr">${right}</span>` : ''}</${tag}>${open && o.panel != null ? `<div class="ac-xp">${typeof o.panel === 'function' ? o.panel() : o.panel}</div>` : ''}`;
  },
  btn: (label, attrs = '', kind = 'line') => `<button type="button" class="ac-b ${kind}" ${attrs}>${label}</button>`,
  /** Segmentert kontroll. items [[v, l]], cur, attrs(v) → attributter. */
  seg: (items, cur, attrs, label = '', dis = false) => `<span class="ac-seg" role="group"${label ? ` aria-label="${esc(label)}"` : ''}>${items.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}" ${attrs(v)}${dis ? ' disabled' : ''}>${esc(l)}</button>`).join('')}</span>`,
  sel: (items, cur, attrs, dis = false) => `<select class="ac-selp" ${attrs}${dis ? ' disabled' : ''}>${items.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
  swb: (on, attrs, label, dis = false) => `<button type="button" class="ac-swb" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}${dis ? ' disabled' : ''}>${sw(!!on)}</button>`,
  fld: (label, input) => `<label class="ac-f"><span>${label}</span>${input}</label>`,
  /** Banner: tone ok|warn|bad|info, tittel, undertekst, én knapp. */
  banner: (tone, t, s, b = '') => `<div class="ac-ban t-${tone}" role="${tone === 'bad' ? 'alert' : 'note'}"><i class="ac-band"></i><span class="ac-rm"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</span>${b}</div>`,
  kpis: (cells) => `<div class="ac-kpis">${cells.map(([l, v, s, tab, bad]) => `<${tab ? `button type="button" data-ac-tab="${tab}"` : 'div'} class="ac-kpi"><span class="ac-lab">${esc(l)}</span><b>${esc(v)}</b><span class="${bad ? 'bad' : ''}">${esc(s)}</span></${tab ? 'button' : 'div'}>`).join('')}</div>`,
};
export { ui65 };
const { row, sec, seg, sel, swb, fld, banner, kpis } = ui65;
const btn = ui65.btn;
const vtxt = (t, c = '') => `<span class="ac-v${c ? ` ${c}` : ''}">${esc(t)}</span>`;
const missingNote = (what) => `<p class="ac-note">${esc(what)} er ikke tilgjengelig på serveren ennå. Oppdater serveren (Innstillinger → System), så dukker det opp her.</p>`;

/* ---------------- Faner og nøkler ---------------- */

export const AI_TABS65 = [['ov', 'Oversikt', 'pulse'], ['mod', 'Modeller', 'chip'], ['task', 'Oppgaver', 'branch'], ['rcpt', 'Kvitteringer', 'receipt'], ['svc', 'Tjenester', 'server'], ['job', 'Jobber', 'list'], ['use', 'Forbruk', 'bars']];
const FIN_TABS65 = [['task', 'AI-valg', 'branch'], ['svc', 'Tilkoblinger', 'server'], ['job', 'Jobber', 'list'], ['use', 'Forbruk', 'bars']];
const TAB_ALIAS65 = { rt: 'task', valg: 'task', oppgaver: 'task', tasks: 'task', regler: 'task', api: 'svc', imp: 'svc:import', importer: 'svc:import', keys: 'svc', nokler: 'svc', nøkler: 'svc', tjenester: 'svc',
  r48: 'rcpt', kvitteringer: 'rcpt', receipts: 'rcpt', oversikt: 'ov', modeller: 'mod', models: 'mod', jobber: 'job', jobs: 'job', forbruk: 'use', usage: 'use' };
/** Ny fanenøkkel fra en gammel (rt → task, api/imp → svc …). «svc:gemini» = Tjenester med Gemini-raden åpen. 'glimt' = Innstillinger → Glimt. */
export function aiTabKey65(k) {
  const s = String(k ?? '').trim().toLowerCase();
  if (!s) return '';
  const [a, b] = s.split(':');
  if (a === 'glimt' || a === 'gc') return 'glimt';
  const t = TAB_ALIAS65[a] ?? a;
  return b ? `${t.split(':')[0]}:${b}` : t;
}
function tabsFor(o) { return o.scope === 'finans' ? FIN_TABS65 : AI_TABS65; }
function applyTab(p, k) {
  const key = aiTabKey65(k);
  if (!key || key === 'glimt') return;
  const [t, sub] = key.split(':');
  p.tab = t;
  if (sub && t === 'svc') G.open[`svc.${sub}`] = true;
}

// Prompt 43: «Importer» (minne og samtaler fra Claude) er nå raden «Importer» under Tjenester → Andre.
let CI43 = null;
function mountImp43(p) {
  const host = p.el.querySelector('[data-ac-imp43]');
  if (!host || host.dataset.done) return;
  host.dataset.done = '1';
  const o = { variant: p.o.variant === 'mobile' ? 'mobile' : 'web', onOpenChat: p.o.onOpenChat ?? (() => { p.o.onClose?.(); location.hash = '#/chat'; }) };
  if (CI43) { CI43.mountClaudeImport(host, o); return; }
  import('/assets/js/claude-import43.js').then((m) => { CI43 = m; if (host.isConnected) m.mountClaudeImport(host, o); }).catch((e) => { host.textContent = `Fikk ikke lastet importen: ${e.message}`; });
}

/* ---------------- Moduler som tegnes inni AI-siden (lastes ved behov) ---------------- */

const MOD = {};
const MOD_SRC = { g65: './ai-glimt65.js', r48: './receipts48-set.js', o58: './omlx58.js', v54: './voice54.js', v57: './voices57.js' };
function need(k) {
  if (MOD[k] !== undefined) return MOD[k];
  MOD[k] = null;
  import(MOD_SRC[k]).then((m) => {
    MOD[k] = m;
    if (k === 'r48') { m.onReceipts48(() => redraw()); m.loadReceipts48(false); }
    if (k === 'g65') m.load65();
    if (k === 'o58') m.load58();
    if (k === 'v54') m.loadVoice54();
    if (k === 'v57') m.loadVox57();
    redraw();
  }).catch(() => { MOD[k] = false; });
  return null;
}
if (typeof document !== 'undefined') {
  document.addEventListener('ac:redraw', () => redraw());
  document.addEventListener('ac:close', (e) => { if (e.detail) { delete G.open[e.detail]; redraw(); } });
}

/* ---------------- Oversikt ---------------- */

const today = (j) => { const t = jobTime(j); return t && new Date(t).toDateString() === new Date().toDateString(); };
function selfRows(o) {
  const S = G.selftest, fin = o.scope === 'finans', T = tasksOf().filter((t) => !fin || t[3]);
  const bad = S ? Object.values(S.res).filter((x) => !x.ok).length : 0, n = S ? Object.keys(S.res).length : 0;
  const h = S?.done ? (S.err ? 'Selvtest' : bad ? `${bad} av ${n} AI-funksjoner virker ikke` : `Alt virker · ${n} av ${n} svarte`) : S ? 'Tester AI-funksjoner …' : 'Selvtest';
  const fixL = { model: 'Bytt modell', api: 'Legg inn', valg: 'Åpne Oppgaver', nett: 'Sjekk adresse' }, fixT = { model: 'task', api: 'svc', valg: 'task', nett: 'svc' };
  const head = row({ ic: 'flask', dot: S ? (!S.done ? 'busy' : bad || S.err ? 'bad' : 'ok') : '', t: h, s: S?.err || 'Sender en liten prompt gjennom hver funksjon og sjekker at modellen faktisk svarer', right: btn(S && !S.done ? 'Tester …' : 'Kjør selvtest', 'data-ac-self', 'ink') });
  const rows = S ? T.map(([id, nm]) => {
    const r = S.res[id], busy = !r && !S.done;
    if (!r && S.done) return '';
    const s = r ? (r.ok ? `${r.model ?? ''} svarte «ok» på ${ms2(r.ms)}${r.warning ? ` · ${r.warning}` : ''}` : `${r.model ? `${r.model}: ` : ''}${r.error ?? 'feilet'}`) : 'Sender testprompt …';
    const fx = r && !r.ok ? (r.fix ?? 'model') : r?.warning ? 'model' : null;
    return row({ ic: r ? (r.ok ? 'check' : 'warn') : 'clock', dot: r ? (r.ok ? 'ok' : 'bad') : busy ? 'busy' : '', t: r?.name && r.name !== id ? r.name : nm, s, sc: r && !r.ok ? 'bad' : '', right: fx ? btn(fixL[fx] ?? 'Åpne', `data-ac-tab="${fixT[fx] ?? 'task'}"`) : '' });
  }).join('') : '';
  return head + rows;
}
function ovTab(o) {
  if (G.missing.status) return missingNote('AI-kontroll') + sec('SELVTEST', selfRows(o));
  const I = installed(), J = G.jobs ?? [], run = J.filter((j) => j.status === 'run').length, q = J.filter((j) => j.status === 'queue').length;
  const failT = J.filter((j) => isFail(j) && today(j));
  const U = G.usage?.totals, B = G.usage?.budget ?? G.status?.budget, g = gpu(), loaded = I.filter((m) => m.loaded);
  const K = kpis([['KJØRER', String(run), `${q} i kø`, 'job'], ['I MINNET', String(loaded.length), loaded.map((m) => m.id.split(':')[0]).join(', ') || 'ingen', 'mod'],
    ['TOKENS 30 D', U ? tk(U.tokIn + U.tokOut) : '–', U?.localShare != null ? `${U.localShare} % lokalt` : 'ingen data ennå', 'use'], ['SKY-KOSTNAD', U ? krs(U.costKr) : '–', B?.monthlyKr ? `av ${nb(B.monthlyKr)} kr` : 'ingen grense', 'use']]);
  const groups = failGroups(failT);
  const ban = failT.length ? banner('bad', `${failT.length} ${failT.length === 1 ? 'jobb' : 'jobber'} feilet i dag`, groups.map((x) => `${x.count} · ${x.short}`).slice(0, 2).join(' · '), btn('Se jobber', 'data-ac-tab="job"')) : '';
  const bar = (w, c) => `<span class="ac-b4"><i style="width:${Math.max(0, Math.min(100, w))}%;background:${c}"></i></span>`;
  const mach = [[g.hw ? 'Minne til modeller (GPU)' : 'VRAM i bruk', 'mem', g.vram ? `${nb(g.used, 1)} / ${nb(g.vram, g.hw ? 1 : 0)} GB` : `${nb(g.used, 1)} GB`, g.vram ? (g.used / g.vram) * 100 : 0, g.vram && g.used > (g.hw ? 9.5 * (g.vram / 10.7) : g.vram * 0.9) ? 'var(--warn)' : 'var(--ok)'],
    [g.hw && g.external ? 'Modeller på ekstern disk' : 'Modeller på disk', 'disk', g.diskTot ? `${nb(g.diskUsed, 1)} / ${nb(g.diskTot)} GB` : `${nb(g.diskUsed, 1)} GB`, g.diskTot ? (g.diskUsed / g.diskTot) * 100 : 0, 'var(--ink)'],
    ['Sky-budsjett denne måneden', 'money', B?.monthlyKr ? `${krs(B.monthCostKr)} / ${nb(B.monthlyKr)} kr` : `${krs(B?.monthCostKr ?? 0)} · ingen grense`, B?.monthlyKr ? (B.monthCostKr / B.monthlyKr) * 100 : 0, 'var(--acc)']]
    .map(([l, ic, v, w, c]) => row({ ic, t: l, sh: bar(w, c), right: vtxt(v) })).join('');
  const machNote = g.hw ? `Apple Silicon gir GPU-en ca. ⅔ av samlet minne (${nb(g.vram, 1)} av ${nb(g.mem)} GB); resten trengs til macOS og serveren.${g.source === 'standard' ? ' Standardverdier – serveren har ikke meldt maskinen ennå.' : ''}` : '';
  const P = provs();
  const svcH = P.length ? P.map((p) => row({ ic: SVC_IC[p.id] ?? 'server', dot: p.state === 'ok' ? 'ok' : p.state === 'degraded' ? 'warn' : 'off', t: p.name, s: [p.label, p.url?.replace(/^https?:\/\//, ''), p.model, p.state !== 'ok' ? p.error : ''].filter(Boolean).join(' · '), right: vtxt(p.ms != null ? ms2(p.ms) : '–'), attrs: `data-ac-svc="${esc(SVC_FROM_PROV[p.id] ?? p.id)}" role="button" tabindex="0"`, cls: 'ac-click' })).join('')
    : row({ ic: 'server', t: G.status ? 'Ingen leverandører' : G.err.status ? G.err.status : 'Sjekker leverandørene …' });
  return `${K}${ban}${sec('SELVTEST', selfRows(o))}
    ${sec('MASKIN', mach + (g.hw && !g.mounted ? row({ ic: 'warn', dot: 'bad', t: 'Ekstern disk mangler', s: 'Ollama finner ikke modellene', sc: 'bad' }) : ''), { right: esc(g.name || (G.status ? '' : 'Laster …')), note: machNote })}
    ${g.hw ? recSec() : ''}
    ${sec('TJENESTER', svcH, { right: `<button type="button" class="ac-lnk" data-ac-tab="svc">Alle tjenester ›</button>` })}`;
}
function recSec() {
  const S = G.status ?? {}, L = Array.isArray(S.recommend) ? S.recommend : Array.isArray(S.server?.recommend) ? S.server.recommend : REC0;
  if (!L.length) return '';
  const rows = L.map((r) => row({ ic: r.env?.startsWith('sudo') ? 'lock' : 'sliders', t: r.env ?? r.text ?? r.key, mono: !!r.env, s: r.env ? r.text ?? r.key : '', right: r.env ? btn('Kopier', `data-ac-copy="${esc(r.env)}"`) : '' })).join('');
  const adv = row({ ic: 'warn', t: 'Avansert: mer minne til GPU-en', s: 'sudo sysctl iogpu.wired_limit_mb=12288', x: 'ov.adv',
    panel: `<p class="ac-note">Kan økes med <code class="ac-mono">sudo sysctl iogpu.wired_limit_mb=12288</code>. Gir mindre minne til macOS og serveren, og kan gjøre maskinen ustabil. Nullstilles ved omstart.</p>${btn('Kopier', 'data-ac-copy="sudo sysctl iogpu.wired_limit_mb=12288"')}` });
  return sec('ANBEFALT OPPSETT', rows + adv, { right: `<button type="button" class="ac-lnk" data-ac-copyall>Kopier alle</button>` });
}

/* ---------------- Modeller ---------------- */

const KIND_IC = { tekst: 'chip', bilde: 'image', embedding: 'layers', resonnering: 'brain' };
function modTab(o) {
  if (G.missing.models && !G.legacy) return missingNote('Modelloversikten');
  const sub = G.msub ?? 'inst';
  const top = `<div class="ac-subbar">${seg([['inst', 'Installert'], ['dl', 'Last ned'], ['sky', 'Sky']], sub, (v) => `data-ac-msub="${v}"`, 'Modeller')}</div>`;
  return top + (sub === 'dl' ? modDl() : sub === 'sky' ? modSky() : modInst());
}
function modInst() {
  const I = installed(), R = routingOf(), def = R.tasks?.chat?.model || '', admin = G.admin, P = R.params ?? {}, mk = P.modelKeepAlive ?? {};
  const keepL = (v) => (MKEEP.find((x) => String(x[0]) === String(v))?.[1] ?? String(v));
  const defKeep = (KEEP.find((k) => String(k[0]) === String(P.keepAlive)) ?? [0, '30 min'])[1];
  const usedBy = (id) => tasksOf().filter(([k]) => R.tasks?.[k]?.model === id || R.tasks?.[k]?.fallback === id).map(([, n]) => n);
  const rows = I.map((m) => {
    const isDef = m.id === def, emb = m.k === 'embedding', has = Object.prototype.hasOwnProperty.call(mk, m.id) && mk[m.id] !== null;
    const meta = [m.params || m.d, m.gb != null ? gbs(m.gb) : '', m.q, m.ctx ? `${tk(m.ctx)} kontekst` : '', m.k, m.loaded ? '' : `sist brukt ${ago(m.last)}`].filter(Boolean).join(' · ');
    const keepSel = sel(MKEEP.map(([v, l]) => [v == null ? '' : JSON.stringify(v), v == null ? `Hold: standard (${defKeep})` : `Hold: ${l}`]), has ? JSON.stringify(mk[m.id]) : '', `data-ac-mkas="${esc(m.id)}" aria-label="Hold ${esc(m.id)} lastet"`, !admin);
    const ub = usedBy(m.id);
    return row({ ic: KIND_IC[m.k] ?? 'chip', dot: m.loaded ? 'ok' : 'off', t: m.id, mono: true, tag: isDef ? 'STANDARD' : m.loaded ? 'I MINNET' : '', s: meta, x: `m.${m.id}`,
      right: keepSel + btn(m.loaded ? 'Last ut' : 'Last inn', `data-ac-mload="${esc(m.id)}"`),
      panel: () => `<div class="ac-btns">${!isDef && !emb && m.k !== 'bilde' ? btn('Bruk som standard', `data-ac-mdef="${esc(m.id)}"`) : ''}${admin ? btn(`Slett · frigjør ${gbs(m.gb ?? 0)}`, `data-ac-mdel="${esc(m.id)}"`, 'red') : ''}</div><p class="ac-note">${m.loaded ? `Lastet i minnet · holdes ${has ? keepL(mk[m.id]) : defKeep} etter bruk (0 = lastes ut når køen for modellen er tom, aldri midt i et svar).` : 'Ikke lastet.'} Brukes av: ${ub.length ? esc(ub.join(', ')) : 'ingen oppgaver'}.</p>` });
  }).join('') || row({ ic: 'chip', t: G.models ? 'Ingen lokale modeller' : G.err.models ? G.err.models : 'Laster …', s: G.models ? 'Last ned en under «Last ned»' : '' });
  const pulls = pullRows();
  return `${G.legacy ? missingNote('Full modellstyring (laste inn/ut, slette, standard)') : ''}${pulls ? sec('LASTER NED', pulls) : ''}
    ${sec(`INSTALLERT · ${I.length}`, rows, { right: `${gbs(I.reduce((a, m) => a + (m.gb ?? 0), 0)) || '0 GB'} på disk`, hl: 'ai-mod' })}${extH53()}${dalSec()}`;
}
function pullRows() {
  return Object.entries(G.pulls).map(([id, p]) => row({ ic: 'down', dot: p.err ? 'bad' : 'busy', t: id, mono: true, tag: `${Math.floor(p.p)} %`,
    sh: `<span class="ac-b4"><i class="ac-stripe" style="width:${Math.max(2, p.p)}%"></i></span>`, right: `${vtxt(p.err ? p.err : p.tot ? `${nb(p.got / 1e9, 1)} av ${nb(p.tot / 1e9, 1)} GB · ${nb(p.mbs)} MB/s` : p.st)}${btn('Avbryt', `data-ac-pstop="${esc(id)}"`, 'red')}` })).join('');
}
function modDl() {
  const I = installed(), q = G.q.trim().toLowerCase(), admin = G.admin, okName = /^[a-z0-9._/-]+(:[a-z0-9._-]+)?$/i.test(q);
  const lib = (G.lib ?? LIB0).filter((l) => (G.cat === 'alle' || l.k === G.cat) && (!q || `${l.id} ${l.d}`.toLowerCase().includes(q)));
  const libH = lib.map((l) => {
    const has = l.inst || I.some((m) => m.id === l.id || m.id === `${l.id}:latest`), pl = !!G.pulls[l.id], fit = l.fit ?? fitOf(l.gb);
    return row({ ic: KIND_IC[l.k] ?? 'chip', t: l.id, mono: true, tag: fit, tagc: fit === 'PASSER' ? 'ok' : fit === 'FOR STOR' ? 'bad' : fit ? 'warn' : '', s: [l.d, l.gb != null ? gbs(l.gb) : '', fit === 'TRANGT' ? 'bare én om gangen' : fit === 'FOR STOR' ? 'bruk sky' : ''].filter(Boolean).join(' · '),
      right: btn(has ? 'Installert' : pl ? 'Laster …' : 'Last ned', `data-ac-pull="${esc(l.id)}"${has || pl || !admin ? ' disabled' : ''}`) });
  }).join('') || '<p class="ac-note">Ingen treff. Skriv hele modellnavnet og trykk Enter for å laste ned.</p>';
  const pulls = pullRows();
  const search = `<div class="ac-search">${ico('search', 15)}<input data-ac-q value="${esc(G.q)}" placeholder="Søk eller skriv modellnavn, f.eks. qwen3:14b" autocomplete="off" spellcheck="false" aria-label="Søk i Ollama-biblioteket"${admin ? '' : ' disabled'}>${q && okName && admin && !lib.some((l) => l.id === q) && !I.some((m) => m.id === q) ? btn('Last ned', `data-ac-pull="${esc(q)}"`, 'ink') : ''}</div>
    <div class="ac-chips">${[['alle', 'Alle'], ['tekst', 'Tekst'], ['bilde', 'Bilde'], ['resonnering', 'Resonnering'], ['embedding', 'Embeddings']].map(([k, n]) => `<button type="button" class="${G.cat === k ? 'on' : ''}" aria-pressed="${G.cat === k}" data-ac-cat="${k}">${n}</button>`).join('')}</div>`;
  return `${pulls ? sec('LASTER NED', pulls) : ''}${recModSec()}<section class="ac-sec"><div class="ac-lab"><span>LAST NED FRA OLLAMA</span></div>${search}<div class="ac-card">${libH}</div>
    ${admin ? '' : '<p class="ac-note">Bare administrator kan laste ned og slette modeller.</p>'}${G.missing.lib === true ? '<p class="ac-note">Viser et utvalg. Serveren har ikke biblioteksøk ennå.</p>' : ''}</section>`;
}
function modSky() {
  const cl = cloud(), admin = G.admin;
  return sec('SKY-MODELLER', cl.map((m) => row({ tile: m.provider === 'groq' ? 'GQ' : String(m.provider ?? '?').slice(0, 1).toUpperCase(), t: m.id, mono: true, s: `${m.desc || m.provider}${m.key === false ? ' · mangler nøkkel' : ''}`,
    right: swb(m.on, `data-ac-cloud="${esc(m.id)}"`, `${m.id} på/av`, !admin) })).join(''), { note: 'Sky-modeller merkes SKY i Chat. Nøklene settes under Tjenester.' });
}
/* Glimt anbefaler (prompt 39) – under Modeller → Last ned. */
function recModSec() {
  const rows = recRows(), miss = rows.filter((r) => !r.installed && !G.pulls[r.model]), uniq = [...new Map(miss.map((r) => [r.model, r])).values()];
  const useable = rows.filter((r) => r.installed && !r.inUse), g = gpu(), admin = G.admin;
  const nm = String(g.name || 'hjemmeserveren').split(' · ')[0];
  const R = rows.map((r) => {
    const pl = G.pulls[r.model];
    const b = r.inUse ? btn('I bruk', 'disabled') : r.installed ? btn('Bruk', `data-ac-recuse="${esc(r.task)}" data-m="${esc(r.model)}"${admin || ['chat', 'sok', 'glimt', 'brief'].includes(r.task) ? '' : ' disabled'}`) : pl ? btn('Laster …', 'disabled') : btn(`Last ned · ${esc(gbs(r.gb))}`, `data-ac-pull="${esc(r.model)}"${admin ? '' : ' disabled'}`);
    return row({ ic: 'spark', dot: r.inUse ? 'ok' : '', t: `${r.name} · ${r.model}`, tag: r.fit, tagc: r.fit === 'PASSER' ? 'ok' : r.fit === 'FOR STOR' ? 'bad' : 'warn', s: `${r.why}${r.alt ? ` Alternativ: ${r.alt}.` : ''}`, right: b, cls: 'ac-recr' });
  }).join('');
  const foot = uniq.length || useable.length ? `<div class="ac-btns ac-pad">${uniq.length ? btn(`Last ned det som mangler · ${esc(gbs(uniq.reduce((a, r) => a + (r.gb ?? 0), 0)))}`, `data-ac-recpull${admin ? '' : ' disabled'}`, 'ink') : ''}${useable.length ? btn(`Bruk alle anbefalinger (${useable.length})`, 'data-ac-recall') : ''}</div>` : '';
  return sec(`✦ GLIMT ANBEFALER · ${esc(nm)}${g.mem ? ` · ${nb(g.mem)} GB` : ''}`, R + foot);
}
/* Prompt 53 (FERMION53): Fermion Research på Mac mini-en – bare visning (oppsett under Tjenester → Neutrino). */
function extH53() {
  const X = Array.isArray(G.models?.external) ? G.models.external : [];
  if (!X.length) return '';
  const st = { ok: 'Svarer', starting: 'Starter', down: 'Svarer ikke', auth: 'Nøkkel eller IP avvist', off: 'Av' };
  return sec('MAC MINI · FERMION', X.map((m) => row({ ic: 'chip', dot: m.ok ? 'ok' : 'off', t: m.id, mono: true, s: m.desc ?? '', right: vtxt(m.flag === false ? 'Flagg av' : st[m.status] ?? m.status ?? '') })).join(''),
    { note: 'Modeller fra Fermion Research (Neutrino: Apache-2.0, Phonon: CC-BY-4.0). Kjører på Mac mini-en i huset.' });
}
/* Prompt 65: Desert Ant Labs-modellene (flyttet fra System → Mer). GET/POST /api/admin/dal53/* (bare admin). */
function loadDal() {
  if (G.dal !== undefined || !G.admin) return;
  G.dal = null;
  fetch('/api/admin/dal53/health', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => { G.dal = d ?? false; redraw(); if (d?.models?.some((m) => m.status === 'loading')) setTimeout(() => { G.dal = undefined; loadDal(); }, 3000); }).catch(() => { G.dal = false; });
}
function dalSec() {
  if (!G.admin) return '';
  loadDal();
  const H = G.dal;
  if (H === false) return '';
  const STATUS = { ready: ['Klar', 'ok'], loading: ['Lastes …', 'busy'], idle: ['Ikke lastet', 'off'], error: ['Feil', 'bad'], missing: ['Mangler pakken', 'bad'] };
  const rows = !H ? row({ ic: 'box', t: 'Henter …' }) : H.models.map((m) => { const [t, d] = STATUS[m.status] ?? [m.status, 'off']; return row({ ic: 'box', dot: d, t: m.name, tag: m.flag_on ? '' : 'FLAGG AV', s: `${m.purpose} · ${t}${m.error ? ` · ${m.error}` : ''}`, sc: m.error ? 'bad' : '',
    right: m.status !== 'ready' && m.status !== 'missing' ? btn('Last', `data-ac-dal="${esc(m.id)}"${m.status === 'loading' ? ' disabled' : ''}`) : '' }); }).join('');
  return sec('LOKALE MODELLER · DESERT ANT LABS', rows + (H ? `<div class="ac-btns ac-pad">${btn('Forhåndslast alle', 'data-ac-dal=""', 'ink')}${btn('Detaljer og lisenser', 'data-ac-dalmore')}</div>` : ''),
    { hl: 'ai-dal53', note: H ? `Kjører på serveren. Vektene lastes ned første gang. Til en modell er klar, brukes dagens oppførsel. Flaggene slås av under System → Mer → Kvalitet.${G.dalMsg ? ` ${G.dalMsg}` : ''}` : '' });
}

/* ---------------- Oppgaver ---------------- */

const RULE_IC = { localFirst: 'home', finLocal: 'shield', think: 'brain' };
const PAR_IC = { keepAlive: 'clock', numCtx: 'doc', temperature: 'thermo', ollamaConcurrency: 'queue', loadTimeout: 'clock', firstTokenTimeout: 'clock', idleTimeout: 'clock', idleTimeoutImage: 'image', minConf: 'gauge', parallel: 'queue' };
function taskRows(L, all, o) {
  const R = routingOf(), admin = G.admin, warns = Object.fromEntries([...(G.status?.routes ?? []).filter((x) => x.warning || x.state === 'degraded').map((x) => [x.task, x.warning || x.error]), ...(G.routing?.taskList ?? []).filter((t) => t.warning).map((t) => [t.id, t.warning])]);
  const recs = Object.fromEntries(recRows().map((r) => [r.task, r]));
  const o58 = MOD.o58, finLocal = !!(G.finRouting?.rules?.finLocal ?? R.rules?.finLocal);
  return L.map((t) => {
    const can = admin || t.personal, mv = all.find((m) => m.v === t.model), fbm = all.find((m) => m.v === t.fallback);
    const opt = (cur, none, LL = all) => [['', none], ...(cur && !LL.some((m) => m.v === cur) ? [[cur, `${cur} · finnes ikke`]] : []), ...LL.map((m) => [m.v, m.n])];
    const isCloud = (mv && !mv.loc) || (fbm && !fbm.loc);
    const rec = recs[t.id];
    const warn = t.fin && finLocal && mv && !mv.loc ? 'Finansdata forlater aldri huset er på, men modellen er i skyen. Bytt til en lokal modell.'
      : t.fin && finLocal && fbm && !fbm.loc ? 'Reserven er i skyen og brukes ikke mens «Finansdata forlater aldri huset» er på.'
        : !t.fin && t.isFinTask && R.rules?.finLocal && isCloud ? 'Finansdata skal holdes lokalt, men denne bruker en sky-modell.'
          : t.model && (G.models || t.options) && !mv ? `Modellen «${t.model}» finnes ikke · bytt` : warns[t.id] ?? t.warning ?? '';
    const hint = warn || (rec && t.model && rec.model !== t.model && rec.installed ? `Glimt anbefaler ${rec.model}` : '');
    const e = o58?.engine58?.(t.id);
    const eng = e ? seg([['ollama', 'Ollama'], ['omlx', 'oMLX']], e.engine, (v) => `data-o58-engine="${esc(t.id)}" data-v="${v}"${e.busy || (v === 'omlx' && !e.ready && e.engine !== 'omlx') ? ' disabled' : ''}`, `Motor for ${t.name}`) : '<span class="ac-dash" aria-hidden="true">–</span>';
    const LL = t.options?.length ? t.options.map((x) => ({ v: x.id ?? x.value ?? x.model, n: x.label ?? x.id, loc: x.local !== false })) : all;
    return `<div class="ac-tr">${row({ ic: TASK_IC[t.id] ?? 'branch', t: t.name, tag: t.small ? 'FOR LITEN' : '', tagc: 'warn', s: hint || t.desc || (t.def ? `Standard: ${t.def} · reserve ${t.defF}` : ''), sc: hint ? (warn ? 'warn' : 'warn') : '', noic: false })}
      <span class="ac-tc">${sel(opt(t.model, t.def ? `Standard (${t.def})` : 'Automatisk', LL), t.model, `data-ac-rt="${esc(t.id)}" data-f="model" aria-label="Modell for ${esc(t.name)}"`, !can)}</span>
      <span class="ac-tc">${sel(opt(t.fallback, t.defF ? `Standard (${t.defF})` : 'Ingen', LL), t.fallback, `data-ac-rt="${esc(t.id)}" data-f="fallback" aria-label="Reserve for ${esc(t.name)}"`, !can)}</span>
      ${o.scope === 'finans' ? '' : `<span class="ac-tc ac-te">${eng}</span>`}</div>`;
  }).join('');
}
const TASK_IC = { chat: 'chat', sok: 'search', glimt: 'cal', brief: 'doc', rc: 'receipt', kat: 'tag', fsok: 'money', bar: 'image', dom: 'globe', kb: 'book' };
function taskTab(o) {
  if (G.missing.routing) return missingNote('Ruting per oppgave');
  const fin = o.scope === 'finans', R = routingOf(), all = allModelOpts(), admin = G.admin;
  if (!fin) { need('o58'); need('g65'); }
  const rw = (G.routing?.warnings ?? []).filter(Boolean);
  const rwBox = rw.length ? banner('warn', 'Sjekk modellvalget', rw.join(' · ')) : '';
  let L;
  if (fin) {
    const fr = finRows();
    if (!all.length && !fr.some((r) => r.options?.length) && (G.models || G.missing.models)) return `${rwBox}${sec('HVILKEN MODELL GJØR HVA I FINANS', row({ ic: 'chip', t: 'Ingen modeller ennå', s: 'Installer en lokal modell (f.eks. qwen2.5vl:7b for kvitteringer) eller koble til en sky-modell', right: btn('Installer modell ›', 'data-ac-instmod', 'ink') }))}${finRules(R, admin)}`;
    L = fr.map((r) => ({ id: r.id, name: r.n, desc: r.d, model: r.model, fallback: r.fallback, def: r.def, defF: r.defF, options: r.options, warning: r.warning, small: r.small, fin: true, personal: false }));
  } else {
    L = tasksOf().map(([k, n, s, isFin, personal]) => { const r = R.tasks?.[k] ?? {}; return { id: k, name: n, desc: s, model: r.model ?? '', fallback: r.fallback ?? '', isFinTask: !!isFin, personal: !!personal, small: !!(G.routing?.taskList ?? []).find((t) => t.id === k)?.smallModel }; });
  }
  const head = `<div class="ac-tr ac-th" aria-hidden="true"><span>OPPGAVE</span><span>MODELL</span><span>RESERVE</span>${fin ? '' : '<span>MOTOR</span>'}</div>`;
  const table = sec(fin ? 'HVILKEN MODELL GJØR HVA I FINANS' : 'HVILKEN MODELL GJØR HVA', `<div class="ac-tbl${fin ? ' fin' : ''}">${head}${taskRows(L, all, o)}</div>`,
    { note: admin ? (fin ? '' : 'Motor: Ollama er standard. Bytt en oppgave til oMLX når eval har vist at den er bedre (docs/omlx-58.md).') : fin ? 'Modellene i Finans bestemmes av administrator.' : 'Du kan velge egne modeller for Chat, AI-søk, Glimt og brief. Resten bestemmer administrator.' });
  if (fin) return rwBox + table + finRules(R, admin);
  const { n, missing } = glPlan(), done = !n;
  const glSub = done ? `Alle oppgaver bruker allerede Glimts anbefaling${missing ? ` · ${missing} ${missing === 1 ? 'modell bør' : 'modeller bør'} lastes ned` : ''}` : `Fyller ut ${n} ${n === 1 ? 'oppgave' : 'oppgaver'} med beste installerte modell${missing ? ` · ${missing} mangler` : ''}`;
  const gl = row({ ic: 'spark', t: 'La Glimt velge modeller', s: glSub, right: `${G.glUndo ? btn('Angre', 'data-ac-glundo') : ''}${done ? '<span class="ac-v ok">✓ Følger anbefaling</span>' : btn('✦ Fyll ut', 'data-ac-glgo', 'ink')}` });
  const A = G.recAsk;
  const ask = row({ ic: 'spark', t: 'Spør Glimt', s: A?.text || 'Hva vil du bruke AI til? Glimt foreslår en modell som passer maskinen.', sh: A?.text ? esc(A.text) : undefined, x: 'task.ask',
    panel: () => `<form class="ac-form ac-askf" data-ac-askf><span class="ac-in ac-grow"><input data-ac-ask value="${esc(A?.q ?? '')}" placeholder="F.eks. lese kvitteringer, kalender, dokumenter" autocomplete="off" aria-label="Spør Glimt hva du vil bruke AI til"></span>${btn(A?.busy ? 'Tenker …' : 'Spør', 'type="submit"', 'ink')}</form>${A?.text ? `<p class="ac-note">${esc(A.text)}</p>${A.model && !instHas(A.model) && admin ? btn(`Last ned ${esc(A.model)}`, `data-ac-pull="${esc(A.model)}"`, 'ink') : ''}` : ''}` });
  const rules = [['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen, bytt bare ved feil eller timeout'], ['finLocal', 'Finansdata forlater aldri huset', 'Gjelder kvitteringer, transaksjoner og Finans · spør'], ['think', 'Vis tenking', 'Vis stegene mens modellen jobber']]
    .map(([k, nm, s]) => row({ ic: RULE_IC[k], t: nm, s, right: swb(!!R.rules?.[k], `data-ac-rule="${k}"`, nm, !(admin || k === 'think')) })).join('');
  const fb = MOD.o58?.fallback58?.();
  const fbRow = fb ? row({ ic: 'refresh', t: 'Bruk Ollama hvis oMLX ikke svarer', s: 'Ingen kontakt eller 5xx → samme spørsmål til Ollama, merket «via Ollama». Gjelder også Open WebUI.', right: swb(fb.on, 'data-o58-fb', 'Bruk Ollama hvis oMLX ikke svarer', fb.busy) }) : '';
  const chat = MOD.g65 ? MOD.g65.chatRows65(ui65).join('') : row({ ic: 'chat', t: 'Chat', s: 'Laster …' });
  return `${rwBox}${sec('', gl + ask)}${table}${fb?.msg ? `<p class="ac-note" role="status">${esc(fb.msg)}</p>` : ''}
    <div class="ac-slots"><div data-fast59></div><div data-understand60></div><div data-recipes61></div><div data-sched62></div><div data-mem63set></div><div data-q64set></div></div>
    ${sec('REGLER', rules + fbRow + chat, { hl: 'ai-rules65' })}
    ${sec('PARAMETRE', params([['keepAlive', 'Hold modell lastet (standard)', 'For modeller uten eget valg i Modeller (keep_alive)', KEEP], ['numCtx', 'Kontekst', 'Standard kontekstlengde (num_ctx)', CTX], ['temperature', 'Temperatur', 'Lav = presis, høy = kreativ', TEMP],
      ['ollamaConcurrency', 'Samtidige forespørsler til Ollama', 'Én om gangen passer OLLAMA_NUM_PARALLEL=1', PAR], ['loadTimeout', 'Første token · kald modell', 'Når modellen må lastes fra disk (2–40 s)', LOADT], ['firstTokenTimeout', 'Første token · lastet modell', 'Når modellen allerede er i minnet', FIRSTT],
      ['idleTimeout', 'Uten nye tokens · tekst', 'Stopper bare når svaret står stille', IDLET], ['idleTimeoutImage', 'Uten nye tokens · bilde', 'Kvitteringer og strekkoder trenger mer tid', IDLEI]], R, admin, ['temperature']))}`;
}
function params(L, R, admin, free = []) {
  const P = R.params ?? {};
  return L.map(([k, nm, s, opts]) => row({ ic: PAR_IC[k] ?? 'sliders', t: nm, s, right: seg(opts.map(([v, l]) => [JSON.stringify(v), l]), JSON.stringify(P[k] ?? null), (v) => `data-ac-par="${k}" data-v="${esc(v)}"`, nm, !(admin || free.includes(k))) })).join('');
}
function finRules(R, admin) {
  const rules = [['finLocal', 'Finansdata forlater aldri huset', 'Kvitteringer og transaksjoner bare til lokale modeller'], ['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen']]
    .map(([k, nm, s]) => row({ ic: RULE_IC[k], t: nm, s, right: swb(!!R.rules?.[k], `data-ac-rule="${k}"`, nm, !admin) })).join('');
  return sec('REGLER', rules) + sec('PARAMETRE', params([['minConf', 'Minste sikkerhet før «Sjekk»', 'Lavere enn dette havner i Til godkjenning', CONF], ['parallel', 'Samtidige kvitteringer', 'Standard 1 på Mac mini (maks 2 med 7B)', PAR]], R, admin));
}

/* ---------------- Kvitteringer ---------------- */

function rcptTab() {
  const M = need('r48'), g = need('g65');
  if (!M) return sec('', row({ ic: 'receipt', t: 'Laster kvitteringskjeden …' }));
  const X = M._r48State, H = X.health, can = M.r48Admin();
  const L = g ? g.logoRows65(ui65) : { tolk: [], logo: [] };
  if (!H) return `${banner('warn', 'Kvitteringer', X.err || 'Laster status …')}${L.tolk.length ? sec('TOLKING', L.tolk.join('')) : ''}${L.logo.length ? sec('LOGOER', L.logo.join('')) : ''}`;
  const blk = H.external?.blocked, m = H.macOcr ?? {}, mo = H.model ?? {}, t = H.tesseract ?? {};
  const ban = blk ? banner('warn', H.external.text ?? 'Eksterne tjenester er sperret', 'Ingen kvitteringsdata sendes ut av huset – verken til Gemini, Groq, Roboflow eller Brønnøysund.')
    : banner('ok', 'Kvitteringer leses lokalt', 'Telefonen → Mac mini → Tesseract → kø. Kvitteringsbilder sendes aldri ut av huset.');
  const st = { ...(H.steps ?? {}), compareMac: H.compareMac };
  const status = { macOcr: [m.enabled === false ? 'off' : m.ok ? 'ok' : 'bad', m.enabled === false ? 'Slått av' : m.ok ? ['Svarer', m.ms != null ? ms2(m.ms) : '', m.version ? `v${m.version}` : ''].filter(Boolean).join(' · ') : !m.configured ? 'Ikke satt opp – se Tjenester → Mac-OCR' : m.error ?? 'Svarer ikke'],
    tesseract: [t.enabled === false ? 'off' : t.installed ? 'ok' : 'warn', t.enabled === false ? 'Slått av' : t.installed ? (t.version || 'Installert') : 'Ikke installert på serveren'] };
  const SIC = { deviceParse: 'receipt', deviceOcr: 'eye', macOcr: 'eye', tesseract: 'doc', compareMac: 'check' };
  const steps = M.R48_STEPS.map(([k, nm, s]) => { const S2 = status[k]; return row({ ic: SIC[k] ?? 'receipt', dot: S2?.[0] ?? '', t: nm, s: S2 ? `${S2[1]} · ${s}` : s, sc: S2?.[0] === 'bad' ? 'bad' : '', right: swb(!!st[k], `data-ac-r48tog="${k}"`, nm, !can || X.busy === k) }); }).join('');
  const model = row({ ic: 'chip', dot: mo.ok && mo.installed !== false ? 'ok' : 'bad', t: `Lokal modell · ${mo.name ?? 'qwen3:8b'}`, mono: false, s: mo.ok ? (mo.installed === false ? `Ollama svarer, men modellen mangler – kjør: ollama pull ${mo.name ?? 'qwen3:8b'}` : 'Klar') : mo.error ?? 'Svarer ikke', right: btn('Modell for kvitteringer ›', 'data-ac-tab="task"') });
  const cats = (H.categories ?? []).length ? `Kategoriforslag velges fra ${H.categories.length} kategorier: ${H.categories.slice(0, 6).join(', ')}${H.categories.length > 6 ? ' …' : ''}.` : '';
  return `${ban}${sec('STEG I KJEDEN', steps, { note: `Rekkefølgen er A → B → C → Tesseract, ellers legges kvitteringen i kø og prøves igjen; første steg som består kontrollen, vinner. Selve lesingen på telefonen slås på i FinansHub-appen.${can ? '' : ' Bare administrator kan endre stegene.'}`, hl: 'ai-r48' })}
    ${sec('TOLKING', model + L.tolk.join(''), { note: cats })}${L.logo.length ? sec('LOGOER', L.logo.join(''), { note: 'Logoer finnes uten at AI gjetter: Brønnøysundregistrene, nettstedet selv og (valgfritt) Gemini med bare butikknavnet.' }) : ''}
    ${X.msg ? `<p class="ac-note ${X.ok ? '' : 'bad'}" role="status">${esc(X.msg)}</p>` : ''}`;
}

/* ---------------- Tjenester ---------------- */

const SVC_IC = { ollama: 'chip', omlx: 'bolt', owui: 'globe', openwebui: 'globe', macocr: 'eye', nbwhisper: 'mic', phonon: 'mic', voz: 'mic', voxcpm: 'speaker', searxng: 'search', brave: 'search', gemini: 'spark', groq: 'bolt', openrouter: 'link', roboflow: 'image', neutrino: 'chip', glimtapi: 'key', import: 'down' };
const SVC_FROM_PROV = { openwebui: 'owui' };
const keysOf = (k) => (Array.isArray(G.keys) ? G.keys : []).find((x) => x.id === k) ?? {};
function stLine(dot, text) { return `<span class="ac-st65 ${dot || 'off'}"><i></i>${esc(text)}</span>`; }
function testLine(t) { return !t ? '' : t.busy ? '<p class="ac-note">Tester …</p>' : t.ok ? `<p class="ac-note ok" role="status">${esc(t.ok)}</p>` : `<p class="ac-note bad" role="status">${esc(t.err)}</p>`; }
function keyInput(attr, label, isSet, ph, admin, extra = '') { return fld(`${label}${isSet ? ' <i class="ac-tg">SATT</i>' : ''}`, `<input type="password" ${attr} value="" placeholder="${esc(isSet ? 'Lagret – skriv en ny for å bytte' : ph)}" autocomplete="new-password" spellcheck="false"${admin ? '' : ' disabled'}${extra}>`); }
const urlInput = (attr, val, ph, admin) => `<input type="url" ${attr} value="${esc(val ?? '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"${admin ? '' : ' disabled'}>`;
/** Alle tjenester: [{id, group, name, s, dot, text, panel()}]. */
function svcList(o) {
  const fin = o.scope === 'finans', admin = G.admin, B = G.backend, W = B?.web;
  const pv = (id) => prov(id) ?? {};
  const pdot = (p) => (p.state === 'ok' ? 'ok' : p.state === 'degraded' ? 'bad' : 'off');
  const L = [];
  const keySvc = (k, name, ph, link, href, meta, extra = []) => {
    const kk = keysOf(k), p = { ...pv(k) }, t = G.test[k], set = !!(kk.set ?? p.keyTail ?? kk.tail);
    const dot = t?.ok ? 'ok' : t?.err ? 'bad' : p.state ? pdot(p) : set ? 'off' : 'off';
    const text = t?.busy ? 'Tester …' : t?.ok ? 'Svarer' : t?.err ? 'Feiler' : p.label ? `${p.label}${p.ms != null && p.state === 'ok' ? ` · ${ms2(p.ms)}` : ''}` : set ? 'Nøkkel satt' : 'Ingen nøkkel';
    return { id: k, name, s: [set && kk.tail ? `Nøkkel ••••${kk.tail}` : set ? 'Nøkkel satt' : 'Ingen nøkkel', p.model ?? kk.model, meta].filter(Boolean).join(' · '), dot, text,
      panel: () => `<div class="ac-form">${keyInput(`data-ac-key="${k}" data-f="key"`, 'Nøkkel', set, ph, admin)}${extra.map(([f, l, ph2]) => fld(l, `<input type="text" data-ac-key="${k}" data-f="${f}" value="${esc(kk[f] ?? p[f] ?? '')}" placeholder="${esc(ph2)}" autocomplete="off" spellcheck="false"${admin ? '' : ' disabled'}>`)).join('')}
        <div class="ac-btns">${admin ? btn('Lagre', `data-ac-keysave="${k}"`, 'ink') : ''}${btn(t?.busy ? 'Tester …' : 'Test', `data-ac-test="${k}"`)}${admin && set ? btn('Fjern nøkkel', `data-ac-keydel="${k}"`, 'red') : ''}</div></div>
        ${testLine(t)}<p class="ac-note">${link ? `Hent nøkkel: <a href="${href}" target="_blank" rel="noopener">${link} ↗</a>. ` : ''}${esc(meta ?? '')}${meta ? '. ' : ''}Nøklene lagres kryptert på serveren og vises aldri.</p>` };
  };
  // KJØRING
  const ol = pv('ollama'), bt = G.btest ?? {};
  const btD = (k, fb) => (bt[k]?.busy ? ['busy', 'Tester …'] : bt[k]?.ok ? ['ok', 'Svarer'] : bt[k]?.err ? ['bad', 'Feiler'] : fb);
  const [olD, olT] = btD('ollama', [ol.state ? pdot(ol) : 'off', ol.label ? `${ol.label}${ol.ms != null && ol.state === 'ok' ? ` · ${ms2(ol.ms)}` : ''}` : 'Sjekker …']);
  L.push({ id: 'ollama', group: 'KJØRING', name: 'Ollama', s: [(B?.ollama?.url ?? ol.url ?? '').replace(/^https?:\/\//, ''), 'hjemmeserveren', B?.effective === 'ollama' ? 'i bruk' : ''].filter(Boolean).join(' · '), dot: olD, text: olT,
    panel: () => `<div class="ac-form">${fld('Adresse', urlInput('data-ac-be="ollamaUrl"', B?.ollama?.url ?? ol.url, 'http://192.168.1.30:11434', admin && !!B))}<div class="ac-btns">${admin && B ? btn('Lagre', 'data-ac-besave="ollamaUrl"', 'ink') : ''}${admin ? btn('Test', 'data-ac-betest="ollama"') : btn('Test', 'data-ac-test="ollama"')}</div></div>${testLine(bt.ollama ? { busy: bt.ollama.busy, ok: bt.ollama.ok, err: bt.ollama.err } : G.test.ollama)}<p class="ac-note">Test: /api/version og /api/tags. Embeddings og innlasting går alltid direkte til Ollama.</p>` });
  if (!fin && B && !G.missing.backend) {
    const ow = pv('openwebui'), [owD, owT] = btD('openwebui', [B.openwebui?.configured ? (ow.state ? pdot(ow) : 'ok') : 'off', B.openwebui?.configured ? (ow.label ?? 'Satt opp') : 'Ikke satt opp']);
    L.push({ id: 'owui', group: 'KJØRING', name: 'Open WebUI', s: [(B.openwebui?.url ?? '').replace(/^https?:\/\//, ''), B.effective === 'openwebui' ? 'i bruk' : 'kunnskapsbase, nettsøk og tale'].filter(Boolean).join(' · '), dot: owD, text: owT,
      panel: () => `<div class="ac-form">${fld('Adresse', urlInput('data-ac-be="openwebuiUrl"', B.openwebui?.url, 'http://192.168.1.30:8080', admin))}${keyInput('data-ac-be="openwebuiKey"', 'Nøkkel', !!B.openwebui?.configured, 'sk-…', admin)}
        <div class="ac-btns">${admin ? btn('Lagre', 'data-ac-besave="openwebuiUrl,openwebuiKey"', 'ink') : ''}${admin ? btn('Test', 'data-ac-betest="openwebui"') : ''}${admin && B.openwebui?.configured ? btn('Fjern nøkkel', 'data-ac-bedel="openwebuiKey"', 'red') : ''}</div></div>${testLine(bt.openwebui)}
        ${(B.thinkLeaks ?? []).length ? `<p class="ac-note">Open WebUI slo ikke av tenking for ${B.thinkLeaks.map((x) => esc(x.model)).join(', ')}, så de jobbene går direkte til Ollama. ${admin ? btn('Prøv Open WebUI igjen', 'data-ac-beleak') : ''}</p>` : ''}
        <p class="ac-note">Valgfritt. Med Open WebUI får Chat kunnskapsbase, nettsøk og tale (Whisper). Uten den brukes Ollama, Gemini og Groq direkte. Test: /api/models med nøkkelen.</p>` });
  }
  if (!fin) {
    // MAC MINI
    const o58 = MOD.o58?.status58?.() ?? { dot: 'off', text: 'Laster …' };
    if (o58.admin !== false) L.push({ id: 'omlx', group: 'MAC MINI', name: 'oMLX', s: [o58.url?.replace(/^https?:\/\//, ''), 'MLX-motor for tekst og bilder'].filter(Boolean).join(' · '), dot: o58.dot, text: o58.text?.split(' · ')[0] ?? '', panel: () => '<div data-omlx58-ai="row"></div>' });
  }
  const r48 = MOD.r48, RX = r48?._r48State, mH = RX?.health?.macOcr ?? {};
  if (r48) {
    const can = r48.r48Admin(), keySet = RX.set?.server?.macOcrKeySet ?? mH.keySet ?? false, url = RX.url ?? RX.set?.server?.macOcrUrl ?? mH.url ?? '';
    L.push({ id: 'macocr', group: 'MAC MINI', name: 'Mac-OCR', s: [String(url).replace(/^https?:\/\//, ''), 'Apple Vision leser kvitteringer'].filter(Boolean).join(' · '), dot: !RX.health ? 'off' : mH.enabled === false ? 'off' : mH.ok ? 'ok' : mH.configured ? 'bad' : 'off', text: !RX.health ? 'Laster …' : mH.enabled === false ? 'Slått av' : mH.ok ? `Svarer${mH.ms != null ? ` · ${ms2(mH.ms)}` : ''}` : !mH.configured ? 'Ikke satt opp' : 'Svarer ikke',
      panel: () => (!can ? '<p class="ac-note">Adressen og nøkkelen til OCR-tjenesten på Mac mini-en settes av administrator.</p>' : `<form class="ac-form" data-ac-r48form autocomplete="off">${fld('Adresse', `<input type="url" data-ac-r48in="url" value="${esc(url)}" placeholder="http://10.69.1.173:8765" spellcheck="false" aria-label="Adresse til Mac-OCR">`)}
        ${keyInput('data-ac-r48in="key"', 'Nøkkel', keySet, '64 tegn fra install.sh', true)}
        <div class="ac-btns"><button type="submit" class="ac-b ink"${RX.busy ? ' disabled' : ''}>${RX.busy === 'save' ? 'Lagrer …' : 'Lagre'}</button>${btn(RX.busy === 'test' ? 'Tester …' : 'Test', `data-ac-r48="test"${RX.busy ? ' disabled' : ''}`)}${keySet ? btn('Fjern nøkkel', `data-ac-r48="clearkey"${RX.busy ? ' disabled' : ''}`, 'red') : ''}</div></form>
        ${RX.test ? `<p class="ac-note ${RX.test.ok ? 'ok' : 'bad'}" role="status">${esc(RX.test.ok ? ['Tilkoblet', ms2(RX.test.ms), RX.test.version ? `v${RX.test.version}` : '', (RX.test.languages ?? []).join(', ')].filter(Boolean).join(' · ') : RX.test.error ?? 'Svarer ikke')}</p>` : ''}${RX.msg ? `<p class="ac-note ${RX.ok ? '' : 'bad'}" role="status">${esc(RX.msg)}</p>` : ''}
        <p class="ac-note">Tjenesten kjører på Mac mini-en (tools/vision-ocr/install.sh) og svarer bare Glimt-serveren. Nøkkelen lagres kryptert og vises aldri igjen. Stegene i kjeden slås av og på under Kvitteringer.</p>`) });
  }
  if (!fin) {
    const V = MOD.v54?.voiceStatus54?.(), vx = MOD.v57?.voxStatus57?.();
    const vs = (x, fb = 'Laster …') => (x ? [x.dot, x.text] : ['off', fb]);
    if (V?.nbwhisper || V?.admin) { const [d, t] = vs(V.nbwhisper, 'Ikke satt opp'); L.push({ id: 'nbwhisper', group: 'MAC MINI', name: 'NB-Whisper', s: [V.nbwhisper?.url?.replace(/^https?:\/\//, ''), 'norsk tale til tekst'].filter(Boolean).join(' · '), dot: d, text: t, panel: () => '<div data-v54-ai="nb"></div>' }); }
    if (vx && vx.admin !== false) L.push({ id: 'voxcpm', group: 'MAC MINI', name: 'VoxCPM2', s: [vx.url?.replace(/^https?:\/\//, ''), 'tekst til tale og egne stemmer'].filter(Boolean).join(' · '), dot: vx.dot, text: String(vx.text ?? '').split(' · ')[0], panel: () => '<div data-v57-ai="row"></div>' });
    if (V?.neutrino || V?.admin) { const [d, t] = vs(V.neutrino, 'Ikke satt opp'); L.push({ id: 'neutrino', group: 'MAC MINI', name: 'Neutrino', s: [V.fermionUrls?.neutrino?.replace(/^https?:\/\//, ''), 'Fermion · Neutrino-1 8B i Chat'].filter(Boolean).join(' · '), dot: d, text: t, panel: () => '<div data-v54-ai="fermion"></div>' }); }
    if (V?.phonon) { const [d, t] = vs(V.phonon); L.push({ id: 'phonon', group: 'MAC MINI', name: 'Phonon', s: [V.fermionUrls?.phonon?.replace(/^https?:\/\//, ''), 'Fermion · engelsk tale til tekst'].filter(Boolean).join(' · '), dot: d, text: t, panel: () => `<p class="ac-note">Engelsk (og europeiske språk, ikke norsk) tale til tekst. Adressen og nøkkelen settes sammen med Neutrino (samme nøkkel).</p>${btn('Åpne Neutrino-oppsettet', 'data-ac-svc="neutrino"')}` }); }
    // SERVER
    if (V?.voz) L.push({ id: 'voz', group: 'SERVER', name: 'Voz', s: 'Engelsk og 24 europeiske språk (ikke norsk) · på serveren', dot: V.voz.dot, text: V.voz.text, panel: () => '<p class="ac-note">Kjører på serveren (Desert Ant Labs). Ingen adresse eller nøkkel. Språket oppdages automatisk; engelsk går til Voz, så Phonon, så NB-Whisper. Lyden forlater aldri huset.</p>' });
    if (W) {
      L.push({ id: 'searxng', group: 'SERVER', name: 'SearXNG', s: W.searxng.url ? W.searxng.url.replace(/^https?:\/\//, '') : 'Ingen adresse', dot: W.searxng.url ? 'ok' : 'off', text: W.searxng.url ? 'Satt opp' : 'Ikke satt opp',
        panel: () => `<div class="ac-form">${fld('Adresse', urlInput('data-ac-wset="searxngUrl"', W.searxng.url, 'http://192.168.1.30:8888', admin))}<div class="ac-btns">${admin ? btn('Lagre', 'data-ac-wsave="searxngUrl"', 'ink') : ''}</div></div><p class="ac-note">Nettsøk i Glimt. Rekkefølgen på kildene og «Test nettsøk» står under Innstillinger → Glimt.</p>` });
    }
  }
  // SKY
  L.push({ ...keySvc('gemini', 'Gemini', 'AIza…', 'aistudio.google.com', 'https://aistudio.google.com/apikey', 'Gratisnivå: 15 forespørsler/min · 1 500/dag'), group: 'SKY' });
  L.push({ ...keySvc('groq', 'Groq', 'gsk_…', 'console.groq.com', 'https://console.groq.com/keys', '30 forespørsler/min · 14 400/dag'), group: 'SKY' });
  if (!fin) L.push({ ...keySvc('openrouter', 'OpenRouter', 'sk-or-…', 'openrouter.ai', 'https://openrouter.ai/keys', 'Valgfri · Claude, GPT og flere via én nøkkel'), group: 'SKY' });
  L.push({ ...keySvc('roboflow', 'Roboflow', 'Private API Key', 'app.roboflow.com', 'https://app.roboflow.com/settings/api', 'Strekkoder og pakkelapper', [['model', 'Modell', 'workspace/modell/1']]), group: 'SKY' });
  if (!fin && W) L.push({ id: 'brave', group: 'SKY', name: 'Brave Search', s: 'Nettsøk i Glimt', dot: W.brave.configured ? 'ok' : 'off', text: W.brave.configured ? 'Nøkkel satt' : 'Ingen nøkkel',
    panel: () => `<div class="ac-form">${keyInput('data-ac-wset="braveKey"', 'Nøkkel', W.brave.configured, 'BSA…', admin)}<div class="ac-btns">${admin ? btn('Lagre', 'data-ac-wsave="braveKey"', 'ink') : ''}${admin && W.brave.configured ? btn('Fjern nøkkel', 'data-ac-wdel="braveKey"', 'red') : ''}</div></div><p class="ac-note">Brukes når den står i rekkefølgen under Innstillinger → Glimt → Nettsøk.</p>` });
  // ANDRE
  if (!fin) {
    L.push({ id: 'glimtapi', group: 'ANDRE', name: 'Glimt-API', s: `POST ${location.origin}/api/glimt · personlige nøkler for egne skript`, dot: (G.tokens ?? []).length ? 'ok' : 'off', text: `${(G.tokens ?? []).length} ${(G.tokens ?? []).length === 1 ? 'nøkkel' : 'nøkler'}`,
      panel: () => `${G.fresh ? `<div class="ac-fresh"><span>Kopier nå. Nøkkelen vises bare én gang.</span><b class="ac-mono">${esc(G.fresh)}</b></div>` : ''}
        ${G.missing.tokens ? '<p class="ac-note">Serveren har ikke personlige Glimt-nøkler ennå.</p>' : (G.tokens ?? []).map((t) => row({ ic: 'key', t: t.name ?? 'Nøkkel', s: `hl_••••${t.tail ?? t.last4 ?? ''} · opprettet ${t.createdAt ?? t.created ? new Date(t.createdAt ?? t.created).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '–'} · ${t.lastUsed ? `brukt ${ago(t.lastUsed)}` : 'aldri brukt'}`, right: btn('Trekk tilbake', `data-ac-deltok="${esc(t.id)}"`, 'red') })).join('') || '<p class="ac-note">Ingen nøkler ennå.</p>'}
        <div class="ac-btns">${btn('+ Ny nøkkel', 'data-ac-newtok', 'ink')}</div>` });
    L.push({ id: 'import', group: 'ANDRE', name: 'Importer fra Claude', s: 'Minne og samtaler fra en Claude-eksport', dot: '', text: '', panel: () => '<div class="ac-imp43" data-ac-imp43></div>' });
  }
  return L;
}
function svcTab(o) {
  const fin = o.scope === 'finans', admin = G.admin, B = G.backend;
  if (!fin) { need('r48'); need('o58'); need('v54'); need('v57'); } else need('r48');
  const L = svcList(o);
  const be = !fin && B && !G.missing.backend ? sec('BACKEND', row({ ic: 'branch', t: 'Hvor AI-kallene går', s: B.note || 'Automatisk = Open WebUI når adresse og nøkkel er satt, ellers Ollama direkte. Køen er felles.', sc: B.note ? 'warn' : '',
    right: seg(BE_SEG, B.mode ?? 'auto', (v) => `data-ac-bemode="${v}"`, 'Backend', !admin) + vtxt(beName(B.effective)) })) : '';
  const groups = [...new Set(L.map((x) => x.group))];
  return `${admin ? '' : '<p class="ac-note">Bare administrator kan endre adresser og nøkler. Du ser status og kan teste.</p>'}${be}
    ${groups.map((gname) => sec(gname, L.filter((x) => x.group === gname).map((x) => row({ ic: SVC_IC[x.id] ?? 'server', dot: x.dot, t: x.name, s: x.s, x: `svc.${x.id}`, hl: `ai-svc-${x.id}`, right: x.text ? stLine(x.dot, x.text) : '', panel: x.panel, attrs: `id="ac-svc-${x.id}"` })).join(''))).join('')}
    <p class="ac-note">Nøklene lagres kryptert på serveren og sendes aldri tilbake til nettleseren eller appen.</p>`;
}

/* ---------------- Jobber ---------------- */

function jobTab(o) {
  if (!jt41) jt41 = setInterval(() => { if (document.querySelector('.ac-jt41')) redraw(); }, 60000);
  if (G.missing.jobs) return missingNote('Jobbloggen');
  const J = jobsF(o.scope === 'finans'), run = J.filter((j) => j.status === 'run'), q = J.filter((j) => j.status === 'queue'), done = J.filter((j) => ['ok', 'fail', 'cancel', 'cancelled'].includes(j.status));
  const par = routingOf().params?.ollamaConcurrency ?? 1;
  const jrow = (j) => {
    const r = j.status === 'run', qq = j.status === 'queue', ok = j.status === 'ok', bad = j.status === 'fail' || j.status === 'cancel' || j.status === 'cancelled', skip = j.status === 'skip' || j.skipped;
    const tokn = (j.tokens?.in ?? 0) + (j.tokens?.out ?? 0), ph = r ? phaseText(j) : '';
    const T = j.timing ?? {}, tim = !r && !qq ? [T.queueMs > 500 ? `kø ${ms2(T.queueMs)}` : '', T.loadMs > 200 ? `lastet ${ms2(T.loadMs)}` : '', T.genMs ? `generert ${ms2(T.genMs)}` : '', j.attempts > 1 ? `${j.attempts} forsøk` : ''] : [];
    const be = j.backend ? (j.backendNote ? `${j.backendNote}` : j.backend === 'openwebui' ? 'via Open WebUI' : j.backend === 'ollama' ? 'Ollama direkte' : j.backend) : '';
    const tl = (j.tools ?? []).filter((x) => x !== 'none'), wq = j.web ? `søk «${j.web.query}» · ${j.web.hits ? `${j.web.hits} treff` : 'ingen treff'}` : '';
    const s = [bad || skip ? shortReason(j) : '', j.model, be, tl.length ? `verktøy: ${tl.join(', ')}` : '', wq, r ? (ph || `${Math.floor(j.progress ?? 0)} %${j.step ? ` · ${j.step}` : ''}`) : '', qq ? (j.when ? j.when : j.step || 'venter') : '', j.ms != null && !r ? ms2(j.ms) : '', ...tim, tokn ? `${nb(tokn)} tok` : '', j.costKr ? krs(j.costKr) : '', j.fallbackFrom ? `reserve for ${j.fallbackFrom}` : ''].filter(Boolean).join(' · ');
    const act = r || qq ? btn('Avbryt', `data-ac-jcancel="${esc(j.id)}"`, 'red') : bad && j.retryable !== false ? btn('Prøv igjen', `data-ac-jretry="${esc(j.id)}"`) : '';
    const pct = r && j.phase?.kind === 'load' && j.phase.totalGb ? Math.round(((j.phase.loadedGb ?? 0) / j.phase.totalGb) * 100) : j.progress ?? 0;
    const full = (bad || skip) && j.error && j.error !== shortReason(j);
    return row({ ic: r ? 'play' : qq ? 'clock' : ok ? 'check' : 'warn', dot: r ? 'busy' : qq ? 'off' : ok ? 'ok' : skip ? 'warn' : 'bad', t: j.title || j.taskName || j.task, s, sc: bad ? 'bad' : '',
      sh: r ? `${esc(s)}<span class="ac-b4"><i style="width:${pct}%;background:var(--acc)"></i></span>` : undefined, right: jobTime41(j) + act, x: full ? `j.${j.id}` : undefined,
      panel: full ? () => `<p class="ac-note ac-pre">${esc(j.error)}</p>` : undefined });
  };
  const fails = done.filter(isFail), rest = done.filter((j) => !isFail(j));
  const groups = failGroups(fails);
  G.gList = groups;
  const gRow = (g, i) => {
    const [one, many] = nounFor(g.jobs), open = !!G.gOpen?.[g.reason];
    const head = `<div class="ac-r ac-rx${open ? ' open' : ''}${g.jobs.some((j) => j.retryable !== false) || !g.jobs.length ? ' ctl' : ''}"><span class="ac-ic" aria-hidden="true">${ico('warn')}<i class="ac-icd bad"></i></span><span class="ac-rm"><span class="ac-rt1"><b class="ac-ell">${g.count} ${g.count === 1 ? one : many} feilet · ${esc(String(g.short ?? '').replace(/^Tidsavbrudd · /, 'tidsavbrudd · ').toLowerCase().replace(/^ingen kontakt med ollama/, 'ingen kontakt med Ollama'))}</b></span><span class="ac-rs ac-ell">${esc(g.jobs.slice(0, 4).map((j) => j.title || j.taskName || j.task).join(' · '))}${g.jobs.length > 4 ? ' …' : ''}</span></span>
      <span class="ac-rr">${groupTime41(g.jobs)}${g.jobs.some((j) => j.retryable !== false) || !g.jobs.length ? btn(g.count > 1 ? 'Prøv alle igjen' : 'Prøv igjen', `data-ac-gretry="${i}"`) : ''}<button type="button" class="ac-chev${open ? ' on' : ''}" data-ac-gopen="${i}" aria-expanded="${open}" aria-label="Vis jobbene">${ico('chev', 14)}</button></span></div>`;
    return head + (open ? `<div class="ac-xp">${g.jobs.map(jrow).join('')}</div>` : '');
  };
  const ollamaDown = groups.find((g) => /ingen kontakt/i.test(g.short ?? ''));
  const status = sec('', row({ ic: 'queue', dot: G.paused ? 'warn' : run.length ? 'busy' : 'ok', t: `${run.length} kjører · ${q.length} i kø${G.paused ? ' · køen er pauset' : ''}`, s: `${par > 1 ? `maks ${par} samtidig mot Ollama (samme modell)` : 'én om gangen mot Ollama'} · gruppert per modell`,
    right: btn(G.paused ? 'Fortsett kø' : 'Pause kø', 'data-ac-pause') + btn('Tøm historikk', 'data-ac-jclear') }));
  const G2 = [['KJØRER', run.map(jrow)], ['I KØ', q.map(jrow)], ['FEILET', groups.map(gRow)], ['SISTE', rest.slice(0, 40).map(jrow)]].filter((g) => g[1].length);
  return `${status}${ollamaDown ? banner('bad', 'Får ikke kontakt med Ollama', ollamaDown.jobs[0]?.error ?? 'Sjekk adressen under Tjenester.', btn('Test tilkobling', 'data-ac-svc="ollama"')) : ''}
    ${G2.map(([h, L]) => sec(h, L.join(''))).join('') || sec('', row({ ic: 'list', t: G.jobs ? 'Ingen AI-jobber ennå' : G.err.jobs ? G.err.jobs : 'Laster …', s: G.jobs ? 'Chat, kvitteringer, kategorisering, AI-søk og Glimt logges her' : '' }))}`;
}

/* ---------------- Forbruk ---------------- */

const BUD = [[0, 'Ingen'], [50, '50 kr'], [100, '100 kr'], [200, '200 kr'], [500, '500 kr']];
function useTab(o) {
  if (G.missing.usage) return missingNote('Forbruk');
  const U = G.usage, fin = o.scope === 'finans', T = U?.totals ?? {}, B = U?.budget ?? {};
  const per = `<div class="ac-subbar">${seg([['1', 'I dag'], ['7', '7 dager'], ['30', '30 dager']], G.per, (v) => `data-ac-per="${v}"`, 'Periode')}</div>`;
  if (!U) return `${per}${sec('', row({ ic: 'bars', t: G.err.usage ? G.err.usage : 'Laster …' }))}`;
  const byP = Object.fromEntries((U.byProvider ?? []).map((p) => [p.provider, p]));
  const K = kpis([['TOKENS', tk((T.tokIn ?? 0) + (T.tokOut ?? 0)), `inn ${tk(T.tokIn ?? 0)} · ut ${tk(T.tokOut ?? 0)}`], ['SKY-KOSTNAD', krs(T.costKr), `Gemini ${krs(byP.gemini?.costKr)} · Groq ${krs(byP.groq?.costKr)}`],
    ['LOKALT', T.localShare != null ? `${T.localShare} %` : '–', 'av alle tokens, gratis'], ['SNITT SVARTID', T.avgMs != null ? ms2(T.avgMs) : '–', `${nb(T.count ?? 0)} kall${T.failed ? ` · ${T.failed} feilet` : ''}`]]);
  const D = U.byDay ?? [], mx = Math.max(1, ...D.map((d) => (d.localTok ?? 0) + (d.cloudTok ?? 0)));
  const bars = D.map((d) => `<div title="${esc(`${d.date}: ${tk((d.localTok ?? 0) + (d.cloudTok ?? 0))} tokens${d.costKr ? ` · ${krs(d.costKr)}` : ''}`)}"><span style="height:${((d.cloudTok ?? 0) / mx) * 100}%;background:var(--acc)"></span><span style="height:${((d.localTok ?? 0) / mx) * 100}%;background:var(--ok)"></span></div>`).join('');
  const F = (U.byTask ?? []).filter((f) => !fin || ['rc', 'kat', 'fsok', 'bar'].includes(f.task)), fm = Math.max(1, ...F.map((f) => f.tokens ?? 0));
  const R = routingOf(), bud = Number(R.budget?.monthlyKr ?? B.monthlyKr ?? 0) || 0, used = B.monthCostKr ?? 0, admin = G.admin;
  const budItems = BUD.some(([v]) => v === bud) ? BUD : [...BUD, [bud, `${nb(bud)} kr`]].sort((a, b) => a[0] - b[0]);
  const chart = `<div class="ac-chartw"><div class="ac-row ac-sb"><span class="ac-legend"><span><i style="background:var(--ok)"></i>Lokalt</span><span><i style="background:var(--acc)"></i>Sky</span></span><span class="ac-v">${G.per === '1' ? 'i dag' : `${G.per} dager`}</span></div><div class="ac-chart">${bars || '<span class="ac-mut">Ingen kall i perioden.</span>'}</div></div>`;
  return `${per}${K}${sec('TOKENS PER DAG', chart)}
    ${sec('PER FUNKSJON', F.map((f) => row({ ic: TASK_IC[f.task] ?? 'branch', t: f.name, s: [(f.models ?? []).slice(0, 2).join(' · '), `${nb(f.count)} kall`, `${tk(f.tokens ?? 0)} tok`].filter(Boolean).join(' · '), sh: `<span class="ac-b4"><i style="width:${((f.tokens ?? 0) / fm) * 100}%;background:var(--ink)"></i></span>`, right: vtxt(f.costKr ? krs(f.costKr) : 'Gratis') })).join('') || row({ ic: 'bars', t: 'Ingen kall i perioden' }))}
    ${sec('BUDSJETT FOR SKY-AI', row({ ic: 'money', t: 'Grense per måned', s: `${krs(used)} brukt denne måneden${B.forecastKr != null ? ` · prognose ${krs(B.forecastKr)}` : ''}`, sh: `${esc(`${krs(used)} brukt denne måneden${B.forecastKr != null ? ` · prognose ${krs(B.forecastKr)}` : ''}`)}<span class="ac-b4"><i style="width:${bud ? Math.min(100, (used / bud) * 100) : 0}%;background:${bud && used / bud > 0.8 ? 'var(--warn)' : 'var(--ok)'}"></i></span>`,
      right: seg(budItems.map(([v, l]) => [v, l]), bud, (v) => `data-ac-budv="${v}"`, 'Budsjett for sky-AI', !admin) })
      + [['hardStop', 'Stopp sky-AI ved grensen', 'Bytter til lokale modeller resten av måneden', 'lock'], ['warn80', 'Varsle ved 80 %', 'Push til mobilen', 'bell']].map(([k, nm, s, ic]) => row({ ic, t: nm, s, right: swb(!!R.budget?.[k], `data-ac-budt="${k}"`, nm, !admin) })).join(''))}`;
}

/* ---------------- Glimt (Innstillinger → Glimt, only:'glimt') ---------------- */

function glimtTab() {
  const g = need('g65');
  loadPers45();
  const P = G.pers45, cur = P?.personality ?? 'little', d = PERS45.find((x) => x[0] === cur) ?? PERS45[1];
  const pers = P?.missing ? '' : sec('PERSONLIGHET', row({ ic: 'spark', t: 'Personlighet', s: d[2], hl: 'glimt-pers65', right: seg(PERS45.map(([k, n]) => [k, n]), cur, (v) => `data-ac-pers45="${v}"`, 'Personlighet', !P) }),
    { note: 'Bekreftelsen av hva som faktisk skjedde kommer alltid først. Gjelder Glimt i hele appen (Hjem, Kalender, Gjøremål, Finans, Chat).' });
  const hs = g ? sec('GLIMT I SØKEFELTET', g.hsRow65(ui65)) : '';
  const web = webSec();
  const mem = g ? g.memorySec65(ui65) : sec('GLIMT HUSKER', row({ ic: 'brain', t: 'Laster …' }));
  const ent = `<section class="ac-sec" data-hl="ai-ent60"><div class="ac-lab"><span>ENTITETSREGISTER</span></div><div class="ac-slotc set-e60" data-ent60></div><p class="ac-note">Det Glimt vet om personer, steder («hytta», «jobben», «hjemme»), butikker, abonnementer og faste hendelser. Brukes i minne, kalendersøk, vær og finans. Lagres bare for deg og sendes aldri til sky.</p></section>`;
  const learn = `<section class="ac-sec" data-hl="ai-learn61"><div class="ac-lab"><span>GLIMT LÆRER</span></div><div class="ac-slotc set-r61" data-learn61></div><p class="ac-note">Når Glimt løser noe riktig, lagres hvordan – neste gang går det raskere. Tommel opp gjør oppskriften aktiv, tommel ned eller «nei, jeg mente …» lærer Glimt av. Lagres bare for deg på hjemmeserveren.</p></section>`;
  return pers + hs + web + mem + ent + learn;
}
/** Nettsøk-rekkefølge, DuckDuckGo og «Test nettsøk» (prompt 44). Adresse/nøkler står under AI → Tjenester. */
function webSec() {
  const B = G.backend;
  if (!B?.web) return '';
  const W = B.web, admin = G.admin, names = Object.fromEntries((B.webProviders ?? []).map((x) => [x.id, x.name]));
  const status = { openwebui: W.openwebui.configured ? 'Open WebUIs eget søk · satt opp' : 'ikke satt opp', searxng: W.searxng.url ? W.searxng.url.replace(/^https?:\/\//, '') : 'ingen adresse (AI → Tjenester)', brave: W.brave.configured ? 'nøkkel satt' : 'ingen nøkkel (AI → Tjenester)', ddg: W.ddg.on ? 'uten nøkkel, maks ett søk per 2 s' : 'av' };
  const order = W.order.map((id, i) => row({ tile: String(i + 1), t: names[id] ?? id, s: status[id] ?? '', right: `${id === 'ddg' ? swb(W.ddg.on, 'data-ac-wddg', 'DuckDuckGo på/av', !admin) : ''}${admin ? `<button type="button" class="ac-b line ac-sq" data-ac-word="${id}" data-d="-1"${i ? '' : ' disabled'} aria-label="Flytt ${esc(names[id] ?? id)} opp">↑</button><button type="button" class="ac-b line ac-sq" data-ac-word="${id}" data-d="1"${i === W.order.length - 1 ? ' disabled' : ''} aria-label="Flytt ${esc(names[id] ?? id)} ned">↓</button>` : ''}` })).join('');
  const T = G.wtest;
  const tried = (r) => (r.tried ?? []).map((t) => `${names[t.provider] ?? t.provider}: ${t.skip ?? t.error ?? (t.ok ? `${t.n} treff` : '0 treff')}`).join(' · ');
  const res = !T ? '' : T.busy ? '<p class="ac-note">Søker …</p>' : T.err ? `<p class="ac-note bad">${esc(T.err)}</p>`
    : T.r.hits.length ? `<p class="ac-note">${T.r.hits.length} treff fra <b>${esc(T.r.providerName ?? T.r.provider)}</b> · ${ms2(T.r.ms ?? 0)}${T.r.cached ? ' · fra mellomlageret' : ''}</p>` + T.r.hits.map((h, i) => row({ tile: String(i + 1), t: h.title, s: [h.source, h.published, h.snippet].filter(Boolean).join(' · '), right: h.url ? `<a class="ac-lnk" href="${esc(h.url)}" target="_blank" rel="noopener">Åpne ↗</a>` : '' })).join('')
      : `<p class="ac-note warn">Ingen treff · ${esc(tried(T.r))}</p>`;
  const test = row({ ic: 'search', t: 'Test nettsøk', s: 'Søker gjennom kildene i rekkefølge', x: 'glimt.wtest', panel: () => `<form class="ac-form ac-askf" data-ac-wtestf><span class="ac-in ac-grow"><input type="search" data-ac-wtq value="${esc(T?.q ?? '')}" placeholder="F.eks. hvem er statsminister i England" autocomplete="off" aria-label="Test nettsøk"></span>${btn(T?.busy ? 'Søker …' : 'Søk', 'data-ac-wtest type="submit"', 'ink')}</form>${res}` });
  return sec('NETTSØK I GLIMT', order + test, { hl: 'glimt-web65', note: 'Kildene prøves i rekkefølge; feiler eller er en tom, prøves neste. 3–5 treff, mellomlagret i 10 min. Adresse og nøkler settes under AI → Tjenester.' });
}

/* ---------------- Ramme, tegning og hendelser ---------------- */

const TABS_FN = { ov: ovTab, mod: modTab, task: taskTab, rcpt: rcptTab, svc: svcTab, job: jobTab, use: useTab };
function svcBad(o) { try { return svcList(o).filter((x) => x.dot === 'bad').length; } catch { return 0; } }
function parts(p) {
  const o = p.o, fin = o.scope === 'finans', thk = themeKey66(o.theme), T = THEMES[thk] ?? THEMES.papir, tabs = tabsFor(o), web = o.variant !== 'mobile';
  const only = o.only ? (o.only === 'glimt' ? 'glimt' : aiTabKey65(o.only).split(':')[0]) : '';
  if (only && only !== 'glimt') p.tab = only;
  if (!only && !tabs.some(([k]) => k === p.tab)) p.tab = tabs[0][0];
  const J = jobsF(fin), runN = J.filter((j) => j.status === 'run').length, I = installed();
  if (p.tab === 'job' && G.jobs && !only) markJobsSeen();
  const failN = p.tab === 'job' ? 0 : unseenFails(J);
  const status = `${fin ? 'Kvitteringer, kategorier og spørsmål' : `${I.length} lokale modeller · ${cloud().filter((c) => c.on).length} i skyen`} · ${runN ? `${runN} jobb${runN > 1 ? 'er' : ''} kjører` : 'ingen jobber kjører'}`;
  p.status = status;
  const main = only === 'glimt' ? glimtTab() : TABS_FN[p.tab](o);
  const svcN = only ? 0 : svcBad(o);
  const hd = o.embedded ? '' : `<div class="ac-hd"><span class="ac-hic" aria-hidden="true">${ico(fin ? 'receipt' : 'spark', 19)}</span><span class="ac-rm"><b class="ac-title">${fin ? 'AI i Finans' : 'AI'}</b><span class="ac-hs ac-ell">${esc(status)}</span></span>${o.onClose ? '<button type="button" class="ac-b ink ac-done" data-ac-close>Ferdig</button>' : ''}</div>`;
  const nav = only ? '' : `<nav class="ac-tabs" role="tablist" aria-label="AI">${tabs.map(([k, n, ic]) => { const b = k === 'job' ? failN : k === 'svc' ? svcN : 0; return `<button type="button" role="tab" class="${p.tab === k ? 'on' : ''}" data-ac-tab="${k}" aria-selected="${p.tab === k}">${ico(ic)}<span>${n}</span>${b ? `<i class="ac-badge ${k === 'job' ? 'b-bad' : 'b-warn'}">${b}</i>` : ''}</button>`; }).join('')}</nav>`;
  const top = hd || nav ? `${hd}${nav}` : '';
  const root = `ac ${web ? 'web' : 'mob'} th-${esc(thk)}${o.embedded ? ' emb' : ''}${only ? ' only' : ''}|${Object.entries(T).map(([k, v]) => `--${k}:${v}`).join(';')}`;
  return { root, top, main, toast: G.toast ? `<div class="ac-toast" role="status">${esc(G.toast)}</div>` : '' };
}

/** Prompt 66: theme 'auto' følger siden – Vindu og papir (lys → papir, mørk modus → mork) eller Nåværende (cur). */
export function themeKey66(t) {
  if (t && t !== 'auto') return t;
  if (typeof document === 'undefined') return 'papir';
  const h = document.documentElement;
  return h.dataset.hl === '2c' ? (h.getAttribute('data-mode') === 'dark' ? 'mork' : 'papir') : 'cur';
}
/** Bytter bare fargene (klasse + variabler på roten) når tema eller lys/mørk endres – innholdet og monterte moduler beholdes. */
function retheme66() {
  for (const p of inst) {
    if (p.o.theme && p.o.theme !== 'auto') continue;
    const r = p.el.querySelector('[data-ac-root]');
    if (!r || !p.el.isConnected) continue;
    const P = parts(p);
    if (P.root === p.rootKey) continue;
    const [cls, style] = P.root.split('|');
    r.className = cls; r.setAttribute('style', style); p.rootKey = P.root;
  }
}
if (typeof window !== 'undefined') { window.addEventListener('papir-web-mode', () => setTimeout(retheme66)); document.addEventListener('hl:theme', () => setTimeout(retheme66)); }

/** Tegner ett panel på nytt (bare delene som er endret), og beholder fokus/markør og scroll. */
function paint(p) {
  if (!p.el.isConnected) { inst.delete(p); return; }
  const P = parts(p);
  if (p.rootKey !== P.root) {
    const [cls, style] = P.root.split('|');
    p.el.innerHTML = `<div class="${cls}" style="${style}" data-ac-root><div class="ac-top" data-ac-top></div><div class="ac-main" data-ac-main></div><div data-ac-toast></div></div>`;
    p.rootKey = P.root; p.last = {};
  }
  const ae = document.activeElement, inside = p.el.contains(ae);
  let focusSel = null, pos = null, val = null;
  if (inside && ae.matches?.('input,textarea,select')) {
    const a = [...ae.attributes].find((x) => x.name.startsWith('data-') || x.name === 'name');
    if (a) { focusSel = `${ae.tagName.toLowerCase()}[${a.name}="${CSS.escape(a.value)}"]${ae.dataset.f ? `[data-f="${CSS.escape(ae.dataset.f)}"]` : ''}`; pos = ae.selectionStart; val = ae.value; }
  }
  const T = p.el.querySelector('[data-ac-top]'), M = p.el.querySelector('[data-ac-main]'), X = p.el.querySelector('[data-ac-toast]');
  let changed = false;
  if (p.last.top !== P.top) { T.innerHTML = P.top; T.hidden = !P.top; p.last.top = P.top; changed = true; }
  if (p.last.main !== P.main) {
    // Ikke tegn over et felt brukeren skriver i inni en utvidet rad (modulskjemaer): vent til feltet mister fokus.
    if (inside && M.contains(ae) && ae.matches?.('input:not([type=checkbox]):not([type=radio]),textarea') && !focusSel?.includes('data-ac-q') && ae.closest('[data-omlx58-ai],[data-v54-ai],[data-v57-ai],[data-ent60],[data-learn61],[data-mem63],form')) {
      p.pending = true;
    } else {
      M.innerHTML = P.main; p.last.main = P.main; changed = true; p.pending = false;
      if (p.tab === 'svc' && G.open['svc.import']) mountImp43(p);
    }
  }
  if (p.last.toast !== P.toast) { X.innerHTML = P.toast; p.last.toast = P.toast; }
  if (!changed) return;
  const nav = T.querySelector('.ac-tabs'), on = nav?.querySelector('.on');
  if (nav && on && nav.scrollWidth > nav.clientWidth) { const l = on.offsetLeft - nav.offsetLeft; if (l < nav.scrollLeft || l + on.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = l - 16; }
  decorate65(M);
  p.o.onPaint?.(p.el);
  if (p.o.embedded) p.o.onStatus?.(p.status);
  if (focusSel) {
    const el = p.el.querySelector(focusSel);
    if (el && el !== document.activeElement) { if (!el.matches('[data-ac-q]') && val != null && el.type !== 'file') el.value = val; el.focus({ preventScroll: true }); try { if (pos != null) el.setSelectionRange(pos, pos); } catch { /* */ } }
  }
}
/** Ikonflis på rader modulene tegner selv (samme komponent som resten), og hele teksten som verktøytips. */
function decorate65(root) {
  for (const li of root.querySelectorAll('.ac-li:not([data-ic65]),.ac-par:not([data-ic65])')) {
    li.dataset.ic65 = '1';
    const t = li.querySelector('b')?.textContent ?? '';
    li.insertAdjacentHTML('afterbegin', `<span class="ac-ic" aria-hidden="true">${ico(icoFor(t))}</span>`);
    const s = li.querySelector('.ac-col>span');
    if (s && !s.title) s.title = s.textContent;
  }
}
let decoRaf = 0;
function watch(p) {
  if (p.mo) return;
  p.mo = new MutationObserver(() => { if (!decoRaf) decoRaf = requestAnimationFrame(() => { decoRaf = 0; const m = p.el.querySelector('[data-ac-main]'); if (m) decorate65(m); }); });
  p.mo.observe(p.el, { childList: true, subtree: true });
}

function enterTab(p) {
  const t = p.o.only === 'glimt' ? 'glimt' : p.tab;
  if (t === 'ov') { loadStatus(); loadJobs(); loadUsage(); loadModels(); }
  if (t === 'mod') { loadModels(); loadRouting(); loadStatus(); loadRec(); if (G.libQ == null) loadLib(''); }
  if (t === 'task') { loadRouting(); loadModels(); loadStatus(); loadRec(); if (p.o.scope !== 'finans') { loadBackend(); need('o58'); need('g65'); } }
  if (t === 'rcpt') { need('r48'); need('g65'); }
  if (t === 'job') { loadJobs(); loadRouting(); }
  if (t === 'use') { loadUsage(); loadRouting(); }
  if (t === 'svc') { loadStatus(); loadKeys(); need('r48'); if (p.o.scope !== 'finans') { loadTokens(); loadBackend(); need('o58'); need('v54'); need('v57'); } }
  if (t === 'glimt') { need('g65'); loadPers45(); loadBackend(); }
  if (!p.o.only && t !== 'job') { loadJobs(); if (!G.status) loadStatus(); }
}
function goTab(p, k) {
  applyTab(p, k); vibe(); p.o.onTab?.(p.tab); enterTab(p); paint(p);
  const m = p.el.querySelector('[data-ac-main]');
  if (p.o.embedded) { const top = p.el.querySelector('[data-ac-root]'); const r = top?.getBoundingClientRect(); if (r && r.top < 0) top.scrollIntoView({ block: 'start' }); } else if (m) (p.el.querySelector('.ac-ovbox') ?? p.el.closest('.ac-ovbox'))?.scrollTo?.({ top: 0 });
}
function openSvc(p, id) {
  G.open[`svc.${id}`] = true;
  if (p.o.only) return;
  goTab(p, 'svc');
  requestAnimationFrame(() => p.el.querySelector(`#ac-svc-${CSS.escape(id)}`)?.scrollIntoView({ block: 'center' }));
}
const copy = (t) => { try { navigator.clipboard?.writeText(t).then(() => toast('Kopiert'), () => toast('Kunne ikke kopiere')); } catch { toast('Kunne ikke kopiere'); } };

let libT = 0;
function bind(el) {
  el.addEventListener('click', async (e) => {
    const p = el._acP;
    const b = e.target.closest('button,[data-ac-tab],[data-ac-svc],a');
    // Klikk på selve raden (ikke en kontroll): utvidbar rad åpnes/lukkes; rad med én bryter slås av/på.
    if (!b || !el.contains(b)) {
      const r = e.target.closest('.ac-r');
      if (r && el.contains(r) && !e.target.closest('select,input,textarea,label,a')) {
        if (r.dataset.acXrow) { G.open[r.dataset.acXrow] = !G.open[r.dataset.acXrow]; vibe(); paint(p); afterOpen(p, r.dataset.acXrow); return; }
        const s = r.querySelectorAll('.ac-swb');
        if (s.length === 1 && !s[0].disabled) s[0].click();
      }
      return;
    }
    if (b.disabled) return;
    const d = b.dataset;
    if ('acClose' in d) { vibe(); p.o.onClose?.(); return; }
    if (d.acX) { G.open[d.acX] = !G.open[d.acX]; vibe(); paint(p); afterOpen(p, d.acX); return; }
    if (d.acSvc) { vibe(); return openSvc(p, d.acSvc); }
    if (d.acPers45) return setPers45(d.acPers45); // prompt 45
    if (d.acTab) return goTab(p, d.acTab);
    if (d.acMsub) { G.msub = d.acMsub; vibe(); if (d.acMsub === 'dl' && G.libQ == null) loadLib(''); paint(p); return; }
    if (d.acCopy) return copy(d.acCopy);
    if ('acCopyall' in d) { const S = G.status ?? {}, L = Array.isArray(S.recommend) ? S.recommend : Array.isArray(S.server?.recommend) ? S.server.recommend : REC0; return copy(L.map((r) => r.env).filter(Boolean).join('\n')); }
    if ('acInstmod' in d) { vibe(); if (tabsFor(p.o).some(([k]) => k === 'mod')) { G.msub = 'dl'; goTab(p, 'mod'); } else openAiControl({ ...p.o, scope: 'alle', tab: 'mod' }); return; }
    if ('acSelf' in d) return selftest(false);
    if ('acGlgo' in d) return glGo();
    if ('acGlundo' in d) { const u = G.glUndo; G.glUndo = null; if (u) await saveRouting({ tasks: u }, 'Angret'); return; }
    if (d.acRecuse) { vibe(); return saveRouting({ tasks: { [d.acRecuse]: { model: d.m } } }, `${d.m} brukes nå`); }
    if ('acRecall' in d) { const L = recRows().filter((r) => r.installed && !r.inUse); vibe(); return saveRouting({ tasks: Object.fromEntries(L.map((r) => [r.task, { model: r.model }])) }, `Bruker ${L.length} anbefalinger`); }
    if ('acRecpull' in d) { vibe(); return pullQueue([...new Set(recRows().filter((r) => !r.installed).map((r) => r.model))]); }
    if (d.acPull) return pull(d.acPull);
    if (d.acPstop) { const id = d.acPstop; G.pulls[id]?.ctl.abort(); delete G.pulls[id]; vibe(); redraw(); call(`/models/pulls/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}); return; }
    if (d.acCat) { G.cat = d.acCat; vibe(); redraw(); return; }
    if (d.acMload) return modelAct(d.acMload, 'load');
    if (d.acMdel) return modelAct(d.acMdel, 'del');
    if (d.acMdef) { try { const r = await call('/models/default', { method: 'PUT', json: { model: d.acMdef } }); if (r?.tasks) G.routing = normRouting(r); toast(`${d.acMdef} er standard i Chat`); vibe(); } catch (err) { if (err.status === 404) return saveRouting({ tasks: { chat: { model: d.acMdef } } }, `${d.acMdef} er standard i Chat`); toast(err.message); } loadRouting(); loadModels(); return; }
    if (d.acDal != null) { try { const r = await fetch('/api/admin/dal53/preload', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d.acDal ? { models: [d.acDal] } : {}) }).then((x) => x.json()); G.dalMsg = r.started?.length ? `Laster ${r.started.join(', ')} i bakgrunnen …` : 'Ingenting å laste.'; } catch (err) { G.dalMsg = err.message; } G.dal = undefined; loadDal(); return; }
    if ('acDalmore' in d) { import('./dal53.js').then((m) => m.openModels53()).catch((err) => toast(err.message)); return; }
    if (d.acCloud) {
      const c = cloud().find((x) => x.id === d.acCloud), on = !c?.on; vibe();
      try { await call('/cloud', { method: 'PUT', json: { id: d.acCloud, on } }); } catch (err) { if (err.status !== 404) { toast(err.message); return; } return saveRouting({ cloudOn: { [d.acCloud]: on } }); }
      loadModels(); loadRouting(); return;
    }
    if (d.acRule) { vibe(); return saveRouting({ rules: { [d.acRule]: !routingOf().rules?.[d.acRule] } }); }
    if (d.acPar) { vibe(); let v; try { v = JSON.parse(d.v); } catch { v = d.v; } return saveRouting({ params: { [d.acPar]: v } }); }
    if (d.acBudt) { vibe(); return saveRouting({ budget: { [d.acBudt]: !routingOf().budget?.[d.acBudt] } }); }
    if (d.acBudv != null) { vibe(); return saveRouting({ budget: { monthlyKr: +d.acBudv } }, `Budsjett: ${+d.acBudv ? `${nb(+d.acBudv)} kr / mnd` : 'ingen grense'}`); }
    if (d.acPer) { G.per = d.acPer; vibe(); G.usage = null; loadUsage(); redraw(); return; }
    if ('acPause' in d) { try { const r = await call('/queue/pause', { method: 'POST', json: { paused: !G.paused } }); G.paused = r.paused ?? !G.paused; vibe(); } catch (err) { toast(err.message); } redraw(); return; }
    if ('acJclear' in d) { try { await call('/jobs', { method: 'DELETE' }); vibe(); } catch (err) { toast(err.message); } loadJobs(); return; }
    if (d.acJcancel) return jobAct(d.acJcancel, 'cancel');
    if (d.acJretry) return jobAct(d.acJretry, 'retry');
    if (d.acGopen != null) { const g = G.gList?.[+d.acGopen]; if (g) { G.gOpen = { ...(G.gOpen ?? {}), [g.reason]: !G.gOpen?.[g.reason] }; vibe(); redraw(); } return; }
    if (d.acGretry != null) { const g = G.gList?.[+d.acGretry]; if (g) return retryJobs(g.ids, G.jobGroups?.length ? g.reason : undefined); return; }
    if (d.acTest) return testKey(d.acTest);
    if (d.acKeysave) { const k = d.acKeysave, box = b.closest('.ac-xp') ?? el; for (const inp of box.querySelectorAll(`[data-ac-key="${k}"]`)) if (inp.value.trim() || inp.dataset.f !== 'key') await saveKey(k, inp.dataset.f, inp.value); return; }
    if (d.acKeydel) { if (!confirm('Fjerne nøkkelen?')) return; return removeKey(d.acKeydel); }
    // Prompt 44: backend og nettsøk
    if (d.acBemode) return saveBackend({ mode: d.acBemode }, `Backend: ${BE_SEG.find((x) => x[0] === d.acBemode)?.[1] ?? d.acBemode}`);
    if (d.acBetest) return testBackend(d.acBetest);
    if (d.acBesave) { const box = b.closest('.ac-xp') ?? el, patch = {}; for (const k of d.acBesave.split(',')) { const v = box.querySelector(`[data-ac-be="${k}"]`)?.value.trim(); if (k.endsWith('Key') && !v) continue; if (v !== undefined) patch[k] = v; } if (Object.keys(patch).length) return saveBackend(patch); return; }
    if (d.acBedel) { if (!confirm('Fjerne nøkkelen?')) return; return saveBackend({ [d.acBedel]: '' }, 'Nøkkelen er fjernet'); }
    if ('acBeleak' in d) { try { G.backend = await call('/backend/think-leak', { method: 'DELETE' }); toast('Prøver Open WebUI igjen'); vibe(); } catch (err) { toast(err.message); } redraw(); return; }
    if (d.acWsave) { const v = (b.closest('.ac-xp') ?? el).querySelector(`[data-ac-wset="${d.acWsave}"]`)?.value.trim() ?? ''; if (d.acWsave === 'braveKey' && !v) return; return saveBackend({ web: { [d.acWsave]: v } }); }
    if (d.acWdel) { if (!confirm('Fjerne nøkkelen?')) return; return saveBackend({ web: { [d.acWdel]: '' } }, 'Nøkkelen er fjernet'); }
    if (d.acWord) { const o2 = [...(G.backend?.web?.order ?? [])], i = o2.indexOf(d.acWord), k = i + +d.d; if (i < 0 || k < 0 || k >= o2.length) return; [o2[i], o2[k]] = [o2[k], o2[i]]; return saveBackend({ web: { order: o2 } }, 'Rekkefølgen er lagret'); }
    if ('acWddg' in d) return saveBackend({ web: { ddg: !G.backend?.web?.ddg?.on } });
    // Prompt 65: Kvitteringer (stegene) og Mac-OCR (Tjenester) bruker receipts48-set.js sin tilstand og handlinger
    if (d.acR48tog) return MOD.r48?.r48Act.toggle(d.acR48tog);
    if (d.acR48) { const box = b.closest('.ac-xp'); MOD.r48?.r48Act.setUrl(box?.querySelector('[data-ac-r48in="url"]')?.value ?? null); if (d.acR48 === 'test') return MOD.r48?.r48Act.test(); if (d.acR48 === 'clearkey') { if (!confirm('Fjerne nøkkelen til Mac-OCR?')) return; return MOD.r48?.r48Act.save(true); } return; }
    if ('acNewtok' in d) { try { const r = await call('/tokens', { method: 'POST', json: { name: 'Ny nøkkel' } }); G.fresh = r.token ?? r.key ?? null; vibe(); } catch (err) { toast(err.message); } loadTokens(); return; }
    if (d.acDeltok) { if (!confirm('Trekke tilbake nøkkelen? Skript som bruker den slutter å virke.')) return; try { await call(`/tokens/${encodeURIComponent(d.acDeltok)}`, { method: 'DELETE' }); vibe(); } catch (err) { toast(err.message); } loadTokens(); }
  });
  el.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('[data-ac-svc][role=button]')) { e.preventDefault(); openSvc(el._acP, t.dataset.acSvc); return; }
    if (t.matches?.('[data-ac-q]') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); e.stopPropagation();
      const q = t.value.trim().toLowerCase(), L = (G.lib ?? LIB0).filter((l) => l.id.includes(q));
      if (L.length === 1) pull(L[0].id); else if (/^[a-z0-9._/-]+(:[a-z0-9._-]+)?$/i.test(q)) pull(q);
    }
    if (t.matches?.('[data-ac-key],[data-ac-be],[data-ac-wset]') && e.key === 'Enter') { e.preventDefault(); t.blur(); }
    // Tastatur: piltaster i fanelinjen
    if (t.matches?.('.ac-tabs [data-ac-tab]') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const B2 = [...el.querySelectorAll('.ac-tabs [data-ac-tab]')], i = B2.indexOf(t), n = B2[(i + (e.key === 'ArrowRight' ? 1 : -1) + B2.length) % B2.length];
      e.preventDefault(); goTab(el._acP, n.dataset.acTab); el.querySelector(`.ac-tabs [data-ac-tab="${n.dataset.acTab}"]`)?.focus();
    }
  });
  el.addEventListener('submit', (e) => {
    const w = e.target.closest?.('[data-ac-wtestf]');
    if (w) { e.preventDefault(); testWeb(w.querySelector('[data-ac-wtq]')?.value); return; }
    const r = e.target.closest?.('[data-ac-r48form]');
    if (r) { e.preventDefault(); MOD.r48?.r48Act.setUrl(r.querySelector('[data-ac-r48in="url"]')?.value ?? null); MOD.r48?.r48Act.setKey(r.querySelector('[data-ac-r48in="key"]')?.value ?? ''); MOD.r48?.r48Act.save(false); return; }
    const f = e.target.closest?.('[data-ac-askf]'); if (!f) return; e.preventDefault(); recAsk(f.querySelector('[data-ac-ask]')?.value);
  });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ac-rt]')) { vibe(); return saveRouting({ tasks: { [t.dataset.acRt]: { [t.dataset.f]: t.value } } }).then(() => { G.at.finRouting = 0; get('finRouting', '/routing?scope=finans', normRouting); }); }
    if (t.matches('[data-ac-mkas]')) { vibe(); let v = null; try { v = t.value === '' ? null : JSON.parse(t.value); } catch { v = t.value; } return saveRouting({ params: { modelKeepAlive: { [t.dataset.acMkas]: v } } }, `${t.dataset.acMkas}: ${t.selectedOptions[0]?.textContent ?? ''}`); } // prompt 43, nå i raden
    if (t.matches('[data-ac-key]')) { if (t.dataset.f === 'key' && !t.value.trim()) return; return saveKey(t.dataset.acKey, t.dataset.f, t.value); }
    if (t.matches('[data-ac-be]')) { const k = t.dataset.acBe, v = t.value.trim(); if (k === 'openwebuiKey' && !v) return; return saveBackend({ [k]: v }); }
    if (t.matches('[data-ac-wset]')) { const k = t.dataset.acWset, v = t.value.trim(); if (k === 'braveKey' && !v) return; return saveBackend({ web: { [k]: v } }); }
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-ac-q]')) { G.q = t.value; redraw(); clearTimeout(libT); if (!G.missing.lib) libT = setTimeout(() => loadLib(G.q.trim()), 350); }
    if (t.matches('[data-ac-r48in]')) { if (t.dataset.acR48in === 'url') MOD.r48?.r48Act.setUrl(t.value); else MOD.r48?.r48Act.setKey(t.value); }
  });
  el.addEventListener('focusout', () => { const p = el._acP; if (p?.pending) setTimeout(() => { if (!el.contains(document.activeElement) || !document.activeElement?.matches?.('input,textarea')) paint(p); }, 0); });
}
function afterOpen(p, key) {
  if (key === 'svc.import' && G.open[key]) mountImp43(p);
  if (key === 'svc.glimtapi' && G.open[key]) loadTokens();
}
async function removeKey(p) {
  try { const d = await call(`/keys/${p}`, { method: 'PUT', json: { key: '' } }); if (d?.providers) G.keys = d.providers; toast('Nøkkelen er fjernet'); vibe(); G.test[p] = null; loadKeys(); loadStatus(true); }
  catch (e) { toast(`Kunne ikke fjerne: ${e.message}`); }
}

let pollT = 0;
function poll() {
  clearTimeout(pollT);
  pollT = setTimeout(() => {
    if (!inst.size) return;
    if (!document.hidden) {
      const tabs = new Set([...inst].map((p) => p.tab)), busy = (G.jobs ?? []).some((j) => j.status === 'run' || j.status === 'queue');
      if (tabs.has('job') || tabs.has('ov') || busy) loadJobs();
      if (tabs.has('mod') && Object.keys(G.pulls).length === 0 && Date.now() - (G.at.models ?? 0) > 30_000) loadModels();
    }
    poll();
  }, (G.jobs ?? []).some((j) => j.status === 'run' || j.status === 'queue') ? 2500 : 10_000);
}

/**
 * Monterer AI-kontroll i el. o: {variant:'web'|'mobile', scope:'alle'|'chat'|'finans', theme:'papir'|'mork'|'cur'|'finans'|'auto', tab, admin, onClose, onTab,
 * embedded (ingen egen tittel/Ferdig), only ('glimt' = Glimt-delen uten faner, eller en fanenøkkel), onStatus, onPaint}.
 * Returnerer {setTab, destroy, open}.
 */
export function mountAiControl(el, o = {}) {
  injectCss();
  let p = el._acP;
  if (p) { inst.delete(p); p.o = o; if (o.tab) applyTab(p, o.tab); p.rootKey = ''; }
  else { p = { el, o, tab: 'ov', rootKey: '', last: {} }; applyTab(p, o.tab ?? (o.scope === 'finans' ? 'task' : o.scope === 'chat' ? 'mod' : 'ov')); el._acP = p; bind(el); }
  G.admin = !!o.admin;
  inst.add(p);
  watch(p);
  paint(p); enterTab(p); poll();
  return api0(p);
}
const api0 = (p) => ({ setTab: (t) => { applyTab(p, t); enterTab(p); paint(p); }, destroy: () => { inst.delete(p); p.mo?.disconnect(); p.el.innerHTML = ''; }, open: (key) => { G.open[key] = true; paint(p); } });
/** Innstillinger → Glimt: Glimt-delen av AI-siden (Personlighet, Send til Chat etter, Nettsøk, Glimt husker, Entitetsregister, Glimt lærer). */
export const mountAiGlimt = (el, o = {}) => mountAiControl(el, { variant: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'web', scope: 'alle', theme: 'papir', ...o, only: 'glimt', embedded: true });

/** Overlegg over siden (Chat, Glimt-feil, dashboardet). Containeren scroller; lukkes med Ferdig, Esc eller klikk utenfor. */
export function openAiControl(o = {}) {
  injectCss();
  document.querySelector('.ac-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'ac-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'AI-kontroll');
  const box = document.createElement('div'); box.className = 'ac-ovbox'; ov.appendChild(box);
  document.body.appendChild(ov);
  const mob = matchMedia('(max-width: 767px)').matches;
  const close = () => { inst.forEach((p) => { if (p.el === box) { inst.delete(p); p.mo?.disconnect(); } }); ov.remove(); document.removeEventListener('keydown', key, true); o.onClose2?.(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const t = aiTabKey65(o.tab);
  if (t === 'glimt') { location.hash = '#/innstillinger/glimt'; close(); return { close }; }
  mountAiControl(box, { variant: mob ? 'mobile' : 'web', scope: 'alle', theme: 'papir', ...o, embedded: false, onClose: close });
  return { close };
}

/** Kjør selvtesten fra andre steder (f.eks. etter at nøkler er endret). */
export const runSelftest = () => selftest(true);

function injectCss() {
  if (document.querySelector('link[data-ac-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/ai-control.css?v=65'; l.dataset.acCss = ''; document.head.appendChild(l);
  if (!document.querySelector('link[data-ac-fonts],link[data-hl-fonts]')) { const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.acFonts = ''; f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'; document.head.appendChild(f); }
}
