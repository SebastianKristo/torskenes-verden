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
// Nøkler, modeller og serverstandarden kan bare endres av admin; alle ser status, jobber og forbruk og kan velge egne
// modeller for Chat, AI-søk, Glimt og brief.

const THEMES = {
  papir: { bg: '#f3efe6', card: '#fffdf8', fld: '#ece6da', line: '#ddd5c5', ink: '#1b1a17', mut: '#6b665c', acc: '#b23a2a', ok: '#2f7a4f', warn: '#a8661a', bad: '#b23a2a', hf: 'Newsreader,Georgia,serif' },
  mork: { bg: '#161513', card: '#211f1b', fld: '#2b2824', line: '#3b3731', ink: '#efe9de', mut: '#a49d91', acc: '#ec7a64', ok: '#6fc28f', warn: '#e0a85a', bad: '#ec7a64', hf: 'Newsreader,Georgia,serif' },
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
const IC = { ov: 'M3 12h4l3-8 4 16 3-8h4', mod: 'M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3', job: 'M4 6h16M4 12h10M4 18h7M18 15v6M15 18h6',
  use: 'M4 20V10M10 20V4M16 20v-7M22 20H2', api: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z', rt: 'M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 9' };
const KEEP = [['5m', '5 min'], ['30m', '30 min'], [-1, 'Alltid'], [0, 'Aldri']], CTX = [[8192, '8k'], [32768, '32k'], [131072, '128k']], TEMP = [[0.2, '0,2'], [0.7, '0,7'], [1, '1,0']], PAR = [[1, '1'], [2, '2'], [3, '3'], [4, '4']];
const CONF = [[70, '70 %'], [80, '80 %'], [85, '85 %'], [90, '90 %'], [95, '95 %']];

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
const svg = (d, n = 17) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

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
  pulls: {}, selftest: null, toast: '', eye: {}, test: {}, q: '', cat: 'alle', per: '30', paused: false, fresh: null, admin: false, libQ: null,
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
const FIN4 = [['rc', 'Kvitteringer (bilde)', 'Leser butikk, beløp og varelinjer', 'qwen2.5vl:7b', 'gemini-2.5-flash'], ['kat', 'Kategorisering', 'Foreslår kategori for transaksjoner', 'llama3.2:3b', 'llama-3.3-70b-versatile'],
  ['fsok', 'Finans · spør', '«Har jeg et musikkabonnement?»', 'gemma4:latest', 'gemini-2.5-flash'], ['bar', 'Strekkoder og pakkelapper', 'Bildefelt fra kamera', 'roboflow/kvittering/1', 'qwen2.5vl:7b']];
const FIN_ALIAS = { kvittering: 'rc', kvitteringer: 'rc', receipts: 'rc', categorize: 'kat', kategorisering: 'kat', finans_sok: 'fsok', ask: 'fsok', barcode: 'bar', strekkode: 'bar' };
function finRows() {
  const F = G.finRouting?.taskList ?? (G.routing?.taskList ?? []), byId = new Map(F.map((t) => [FIN_ALIAS[t.id] ?? t.id, t]));
  const R = { ...(G.routing?.tasks ?? {}), ...(G.finRouting?.tasks ?? {}) };
  return FIN4.map(([id, n, d, m0, f0]) => { const t = byId.get(id) ?? {}, r = R[t.id ?? id] ?? R[id] ?? {}; return { id: t.id ?? id, n: t.name ?? n, d: t.desc ?? d, model: r.model ?? t.model ?? '', fallback: r.fallback ?? t.fallback ?? '', def: m0, defF: f0, options: Array.isArray(t.options) ? t.options : null, warning: t.warning ?? '' }; });
}
const loadKeys = () => get('keys', '/keys', (d) => d.providers ?? d);
const loadJobs = () => get('jobs', '/jobs?limit=60', (d) => { if (typeof d?.paused === 'boolean') G.paused = d.paused; return Array.isArray(d) ? d : d.running || d.queued || d.recent ? [...(d.running ?? []), ...(d.queued ?? []), ...(d.recent ?? [])] : d.jobs ?? d.items ?? []; });
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
const stColor = (s) => (s === 'ok' ? 'var(--ok)' : s === 'degraded' ? 'var(--warn)' : 'var(--line)');
// Prompt 38: av GPU-budsjettet (10,7 GB på Mac mini M4 16 GB): PASSER ≤ 8 GB, TRANGT ≤ 10,5 GB (én om gangen), FOR STOR > 10,5 GB.
const fitOf = (gb) => { const g = gpu(), v = g.vram || 10.7, k = v / 10.7; if (gb == null) return ''; if (!g.hw && g.vram) return gb <= v * 0.94 ? 'PASSER' : gb <= v * 2.6 ? 'DELVIS CPU' : 'FOR STOR'; return gb <= 8 * k ? 'PASSER' : gb <= 10.5 * k ? 'TRANGT' : 'FOR STOR'; };
const jobsF = (fin) => (G.jobs ?? []).filter((j) => !fin || ['rc', 'kat', 'fsok', 'bar'].includes(j.task));

/* ---------------- Handlinger ---------------- */

async function saveRouting(patch, okMsg = '') {
  const prev = G.routing;
  const r = routingOf(), merge = { ...r, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'object' && v && !Array.isArray(v) ? { ...(r[k] ?? {}), ...v } : v])) };
  if (patch.tasks) merge.tasks = { ...(r.tasks ?? {}), ...Object.fromEntries(Object.entries(patch.tasks).map(([k, v]) => [k, { ...(r.tasks?.[k] ?? {}), ...v }])) };
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

async function jobAct(id, act) {
  try { await call(`/jobs/${encodeURIComponent(id)}/${act}`, { method: 'POST' }); vibe(); } catch (e) { toast(e.message); }
  loadJobs();
}

/* ---------------- Visning ---------------- */

function tabsFor(o) { return o.scope === 'finans' ? [['rt', 'AI-valg'], ['api', 'Tilkoblinger'], ['job', 'Jobber'], ['use', 'Forbruk']] : [['ov', 'Oversikt'], ['mod', 'Modeller'], ['rt', 'Valg'], ['job', 'Jobber'], ['use', 'Forbruk'], ['api', 'API og nøkler']]; }
const lab = (t) => `<span class="ac-lab">${t}</span>`;
const card = (inner, cls = '') => `<div class="ac-card${cls ? ` ${cls}` : ''}">${inner}</div>`;
const btn = (label, attrs, cls = 'line') => `<button type="button" class="ac-b ${cls}" ${attrs}>${label}</button>`;
const missingNote = (what) => `<div class="ac-note">${esc(what)} er ikke tilgjengelig på serveren ennå. Oppdater serveren (Innstillinger → System), så dukker det opp her.</div>`;

function selftestCard(o) {
  const S = G.selftest, fin = o.scope === 'finans', T = tasksOf().filter((t) => !fin || t[3]);
  const bad = S ? Object.values(S.res).filter((x) => !x.ok).length : 0;
  const h = S?.done ? (S.err ? 'Selvtest' : bad ? `${bad} av ${Object.keys(S.res).length} AI-funksjoner virker ikke` : `Alt virker · ${Object.keys(S.res).length} av ${Object.keys(S.res).length} svarte`) : S ? 'Tester AI-funksjoner …' : 'Selvtest';
  const fixL = { model: 'Bytt modell', api: 'Legg inn', valg: 'Åpne Valg', nett: 'Sjekk adresse' }, fixT = { model: 'rt', api: 'api', valg: 'rt', nett: 'api' };
  const rows = S ? T.map(([id, n]) => {
    const r = S.res[id], busy = !r && !S.done;
    if (!r && S.done) return '';
    const s = r ? (r.ok ? `${r.model ?? ''} svarte «ok» på ${ms2(r.ms)}${r.warning ? ` · ${r.warning}` : ''}` : `${r.model ? `${r.model}: ` : ''}${r.error ?? 'feilet'}`) : `Sender testprompt …`;
    const fx = r && !r.ok ? (r.fix ?? 'model') : r?.warning ? 'model' : null;
    return `<div class="ac-st"><span class="ac-dot2 ${r ? (r.ok ? 'ok' : 'bad') : busy ? 'busy' : ''}">${r ? (r.ok ? '✓' : '!') : ''}</span><span class="ac-col"><b>${esc(r?.name && r.name !== id ? r.name : n)}</b><span class="${r && !r.ok ? 'bad' : ''}">${esc(s)}</span></span>${fx ? btn(fixL[fx] ?? 'Åpne', `data-ac-tab="${fixT[fx] ?? 'rt'}"`) : ''}</div>`;
  }).join('') : '';
  return `<div class="ac-card ac-self${bad ? ' isbad' : ''}"><div class="ac-row"><span class="ac-col ac-grow"><b class="ac-h3">${esc(h)}</b><span class="ac-mut">${S?.err ? esc(S.err) : 'Sender en liten prompt gjennom hver funksjon (chat, AI-søk, Glimt, kvitteringer …) og sjekker at modellen faktisk svarer, ikke bare at serveren kan nås.'}</span></span>${btn(S && !S.done ? 'Tester …' : 'Kjør selvtest', 'data-ac-self', 'ink')}</div>${rows ? `<div class="ac-strows">${rows}</div>` : ''}</div>`;
}

function recCard() {
  const S = G.status ?? {}, L = Array.isArray(S.recommend) ? S.recommend : Array.isArray(S.server?.recommend) ? S.server.recommend : REC0;
  if (!L.length) return '';
  return `<div class="ac-sec">${lab('ANBEFALT FOR DENNE MASKINEN')}<div class="ac-card ac-list">${L.map((r) => `<div class="ac-li ac-rec"><span class="ac-col ac-grow"><b>${esc(r.text ?? r.key)}</b>${r.env ? `<code class="ac-mono ac-env">${esc(r.env)}</code>` : ''}</span></div>`).join('')}
    <details class="ac-li ac-adv"><summary><b>Avansert: mer minne til GPU-en</b></summary><span class="ac-mut">Kan økes med <code class="ac-mono">sudo sysctl iogpu.wired_limit_mb=12288</code>. Gir mindre minne til macOS og serveren, og kan gjøre maskinen ustabil. Nullstilles ved omstart.</span></details></div></div>`;
}
function ovTab(o) {
  if (G.missing.status) return missingNote('AI-kontroll') + selftestCard(o);
  const I = installed(), J = G.jobs ?? [], run = J.filter((j) => j.status === 'run').length, q = J.filter((j) => j.status === 'queue').length, fail = J.filter((j) => j.status === 'fail').length;
  const U = G.usage?.totals, B = G.usage?.budget ?? G.status?.budget, g = gpu(), loaded = I.filter((m) => m.loaded);
  const kpi = [['KJØRER NÅ', String(run), `${q} i kø${fail ? ` · ${fail} feilet` : ''}`, 'job', fail], ['LASTET I VRAM', String(loaded.length), loaded.map((m) => m.id.split(':')[0]).join(', ') || 'ingen', 'mod'],
    ['TOKENS 30 D', U ? tk(U.tokIn + U.tokOut) : '–', U?.localShare != null ? `${U.localShare} % lokalt, gratis` : 'ingen data ennå', 'use'], ['SKY-KOSTNAD', U ? krs(U.costKr) : '–', B?.monthlyKr ? `av ${nb(B.monthlyKr)} kr budsjett` : 'ingen grense', 'use']];
  const bars = [[g.hw ? 'Minne til modeller (GPU)' : 'VRAM i bruk', g.vram ? `${nb(g.used, 1)} / ${nb(g.vram, g.hw ? 1 : 0)} GB` : `${nb(g.used, 1)} GB`, g.vram ? Math.min(100, (g.used / g.vram) * 100) : 0, g.vram && g.used > (g.hw ? 9.5 * (g.vram / 10.7) : g.vram * 0.9) ? 'var(--warn)' : 'var(--ok)'],
    [g.hw && g.external ? 'Modeller på ekstern disk' : 'Modeller på disk', g.diskTot ? `${nb(g.diskUsed, 1)} / ${nb(g.diskTot)} GB` : `${nb(g.diskUsed, 1)} GB`, g.diskTot ? (g.diskUsed / g.diskTot) * 100 : 0, 'var(--ink)'],
    ['Sky-budsjett denne måneden', B?.monthlyKr ? `${krs(B.monthCostKr)} / ${nb(B.monthlyKr)} kr` : `${krs(B?.monthCostKr ?? 0)} · ingen grense`, B?.monthlyKr ? Math.min(100, (B.monthCostKr / B.monthlyKr) * 100) : 0, 'var(--acc)']];
  const P = provs();
  return `${selftestCard(o)}
    <div class="ac-kpis">${kpi.map(([l, v, s, t, bad]) => `<button type="button" class="ac-kpi" data-ac-tab="${t}"><span class="ac-lab">${l}</span><b>${esc(v)}</b><span class="${bad ? 'bad' : ''}">${esc(s)}</span></button>`).join('')}</div>
    ${card(`<span class="ac-row ac-sb"><b class="ac-h3">${g.hw ? 'AI-maskin' : 'Hjemmeserver'}</b><span class="ac-mono">${esc(g.name || (G.status ? '' : 'Laster …'))}</span></span>${g.hw && !g.mounted ? '<span class="ac-warn">Ekstern disk mangler · Ollama finner ikke modellene</span>' : ''}${bars.map(([l, v, w, c]) => `<div class="ac-bar"><span class="ac-row ac-sb"><span class="ac-mut">${l}</span><b class="ac-mono">${esc(v)}</b></span><span class="ac-track"><i style="width:${w}%;background:${c}"></i></span></div>`).join('')}
      ${g.hw ? `<span class="ac-mut ac-hwn">Apple Silicon gir GPU-en ca. ⅔ av samlet minne (${nb(g.vram, 1)} av ${nb(g.mem)} GB); resten trengs til macOS og serveren.${g.source === 'standard' ? ' Standardverdier – serveren har ikke meldt maskinen ennå.' : ''}</span>` : ''}`, 'ac-gap')}
    ${g.hw ? recCard() : ''}
    <div class="ac-card ac-list">${P.length ? P.map((p) => `<button type="button" class="ac-li" data-ac-tab="api"><span class="ac-dot" style="background:${stColor(p.state)}"></span><span class="ac-col ac-grow"><b>${esc(p.name)}${p.label ? ` · <span style="color:${p.state === 'off' ? 'var(--mut)' : stColor(p.state)}">${esc(p.label)}</span>` : ''}</b><span>${esc([p.url?.replace(/^https?:\/\//, ''), p.keyTail ? `Nøkkel ••••${p.keyTail}` : '', p.model, p.state !== 'ok' ? p.error : ''].filter(Boolean).join(' · '))}</span></span><span class="ac-mono">${p.ms != null ? ms2(p.ms) : '–'}</span></button>`).join('') : `<div class="ac-li"><span class="ac-mut">${G.status ? 'Ingen leverandører.' : G.err.status ? esc(G.err.status) : 'Sjekker leverandørene (ekte mini-generering) …'}</span></div>`}</div>`;
}

function modTab(o) {
  if (G.missing.models && !G.legacy) return missingNote('Modelloversikten');
  const I = installed(), R = routingOf(), def = R.tasks?.chat?.model || '', q = G.q.trim().toLowerCase(), admin = G.admin;
  const okName = /^[a-z0-9._/-]+(:[a-z0-9._-]+)?$/i.test(q);
  const keepL = (KEEP.find((k) => String(k[0]) === String(R.params?.keepAlive)) ?? [0, '30 min'])[1];
  const instH = I.map((m) => {
    const isDef = m.id === def, emb = m.k === 'embedding';
    const tags = [m.params || m.d, m.gb != null ? gbs(m.gb) : '', m.q, m.ctx ? `${tk(m.ctx)} kontekst` : '', m.k].filter(Boolean);
    return `<div class="ac-mrow"><div class="ac-row"><span class="ac-dot" style="background:${m.loaded ? 'var(--ok)' : 'var(--line)'}"></span><b class="ac-mono ac-grow ac-ell">${esc(m.id)}</b>${isDef ? '<span class="ac-std">STANDARD</span>' : ''}</div>
      <div class="ac-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <span class="ac-mut">${m.loaded ? `Lastet i VRAM · holdes ${keepL === 'Alltid' ? 'alltid' : keepL === 'Aldri' ? 'til den ikke brukes' : `i ${keepL}`} etter bruk` : `Ikke lastet · sist brukt ${ago(m.last)}`}</span>
      <div class="ac-acts">${btn(m.loaded ? 'Last ut' : 'Last inn', `data-ac-mload="${esc(m.id)}"`)}${!isDef && !emb && m.k !== 'bilde' ? btn('Bruk som standard', `data-ac-mdef="${esc(m.id)}"`) : ''}${admin ? btn('Slett', `data-ac-mdel="${esc(m.id)}"`, 'red') : ''}</div></div>`;
  }).join('') || `<div class="ac-mrow"><span class="ac-mut">${G.models ? 'Ingen lokale modeller. Last ned en under.' : G.err.models ? esc(G.err.models) : 'Laster …'}</span></div>`;
  const pulls = Object.entries(G.pulls).map(([id, p]) => `<div class="ac-card ac-pull"><span class="ac-row ac-sb"><b class="ac-mono">${esc(id)}</b><span class="ac-mono ac-mut">${Math.floor(p.p)} %</span></span><span class="ac-track"><i class="ac-stripe" style="width:${Math.max(2, p.p)}%"></i></span><span class="ac-row ac-sb ac-mut"><span>${p.err ? esc(p.err) : p.tot ? `${nb(p.got / 1e9, 1)} av ${nb(p.tot / 1e9, 1)} GB · ${nb(p.mbs)} MB/s` : esc(p.st)}</span><button type="button" class="ac-tx red" data-ac-pstop="${esc(id)}">Avbryt</button></span></div>`).join('');
  const lib = (G.lib ?? LIB0).filter((l) => (G.cat === 'alle' || l.k === G.cat) && (!q || `${l.id} ${l.d}`.toLowerCase().includes(q)));
  const libH = lib.map((l) => {
    const has = l.inst || I.some((m) => m.id === l.id || m.id === `${l.id}:latest`), pl = !!G.pulls[l.id], fit = l.fit ?? fitOf(l.gb), fc = fit === 'PASSER' ? 'ok' : fit === 'FOR STOR' ? 'bad' : 'warn', fitT = fit === 'TRANGT' ? 'Bare én om gangen' : fit === 'FOR STOR' ? 'Bruk sky' : '';
    return `<div class="ac-lrow"><span class="ac-col"><span class="ac-row"><b class="ac-mono ac-ell">${esc(l.id)}</b>${fit ? `<span class="ac-fit ${fc}"${fitT ? ` title="${fitT}"` : ''}>${fit}</span>` : ''}</span><span class="ac-mut ac-ell">${esc([l.d, l.gb != null ? gbs(l.gb) : ''].filter(Boolean).join(' · '))}</span></span>${btn(has ? 'Installert' : pl ? 'Laster …' : 'Last ned', `data-ac-pull="${esc(l.id)}"${has || pl || !admin ? ' disabled' : ''}`)}</div>`;
  }).join('') || '<div class="ac-lrow"><span class="ac-mut">Ingen treff. Skriv hele modellnavnet og trykk Enter for å laste ned.</span></div>';
  const cl = cloud();
  return `${G.legacy ? missingNote('Full modellstyring (laste inn/ut, slette, standard)') : ''}<div class="ac-sec"><span class="ac-row ac-sb">${lab(`INSTALLERT LOKALT · ${I.length}`)}<span class="ac-mono ac-mut">${gbs(I.reduce((a, m) => a + (m.gb ?? 0), 0))} på disk</span></span><div class="ac-card ac-list">${instH}</div></div>
    ${pulls ? `<div class="ac-sec">${lab('LASTER NED')}${pulls}</div>` : ''}
    ${recModCard()}
    <div class="ac-sec">${lab('LAST NED FRA OLLAMA')}
      <div class="ac-search">${svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5', 16)}<input data-ac-q value="${esc(G.q)}" placeholder="Søk eller skriv modellnavn, f.eks. qwen3:14b" autocomplete="off" spellcheck="false" aria-label="Søk i Ollama-biblioteket"${admin ? '' : ' disabled'}>${q && okName && admin && !lib.some((l) => l.id === q) && !I.some((m) => m.id === q) ? btn('Last ned', `data-ac-pull="${esc(q)}"`, 'ink') : ''}</div>
      <div class="ac-chips">${[['alle', 'Alle'], ['tekst', 'Tekst'], ['bilde', 'Bilde'], ['resonnering', 'Resonnering'], ['embedding', 'Embeddings']].map(([k, n]) => `<button type="button" class="${G.cat === k ? 'on' : ''}" data-ac-cat="${k}">${n}</button>`).join('')}</div>
      <div class="ac-card ac-list">${libH}</div>${admin ? '' : '<div class="ac-note">Bare administrator kan laste ned og slette modeller.</div>'}${G.missing.lib === true ? '<div class="ac-note">Viser et utvalg. Serveren har ikke biblioteksøk ennå.</div>' : ''}</div>
    <div class="ac-sec">${lab('SKY-MODELLER')}<div class="ac-card ac-list">${cl.map((m) => `<button type="button" class="ac-li" data-ac-cloud="${esc(m.id)}"${admin ? '' : ' disabled'} role="switch" aria-checked="${m.on}">${logo(PROV_LOGO[m.provider] ?? '', String(m.provider ?? '?').slice(0, 1).toUpperCase(), 'var(--mut)').replace('ac-logo', 'ac-logo sm')}<span class="ac-col ac-grow"><b class="ac-mono ac-ell">${esc(m.id)}</b><span>${esc(m.desc || m.provider)}${m.key === false ? ' · mangler nøkkel' : ''}</span></span>${sw(m.on)}</button>`).join('')}</div></div>`;
}

function allModelOpts() {
  const L = [...installed().map((m) => ({ v: m.id, n: `${m.id} · lokal`, loc: true })), ...cloud().filter((c) => c.on).map((c) => ({ v: c.id, n: `${c.id} · ${c.provider}`, loc: false }))];
  return L;
}

/* ---------------- Prompt 39: Glimt anbefaler modeller (claude-code-ai-glimt-anbefaler-modeller.md, fasit AI Kontroll.dc.html → REC/RKW) ---------------- */
// Kuratert tabell (start fra REC i fasiten): [modell, GB, hvorfor]. Rangert per oppgave. Serverens GET /api/ai/recommend vinner når den finnes.
const REC = {
  chat: [['gemma4:latest', 9.6, 'Best på norsk av det som får plass, og svarer raskt.'], ['gemma3:12b', 8.1, 'Sterk norsk og leser bilder.'], ['qwen3:8b', 5.2, 'Rask og god til verktøy.'], ['llama3.2:3b', 2.0, 'Liten og rask når minnet er knapt.']],
  sok: [['gemma4:latest', 9.6, 'Forstår norske spørsmål godt og deler modell med Chat.'], ['qwen3:8b', 5.2, 'Rask med verktøy og søk.'], ['llama3.2:3b', 2.0, 'Raskest, men svakere norsk.']],
  glimt: [['gemma4:latest', 9.6, 'Forstår datoer og steder på norsk, samme modell som Chat.'], ['qwen3:8b', 5.2, 'Rask og presis på strukturerte svar.'], ['gemma3:12b', 8.1, 'God norsk.']],
  brief: [['gemma4:latest', 9.6, 'Skriver naturlig norsk og gjenbruker modellen som allerede er lastet.'], ['qwen3:8b', 5.2, 'Rask.'], ['llama3.2:3b', 2.0, 'Liten.']],
  rc: [['qwen2.5vl:7b', 6.0, 'Best til å lese tekst i bilder, bare 6 GB.'], ['gemma3:12b', 8.1, 'Leser bilder og forstår norske varenavn.'], ['minicpm-v', 5.5, 'Bilde på lite minne.']],
  kat: [['llama3.2:3b', 2.0, 'Kategorisering er en enkel oppgave – den minste modellen er rask nok.'], ['qwen3:8b', 5.2, 'Mer presis på vanskelige butikknavn.'], ['gemma4:latest', 9.6, 'Deler modell med Chat.']],
  fsok: [['qwen3:8b', 5.2, 'Rask med verktøy og tall.'], ['gemma4:latest', 9.6, 'God norsk.'], ['llama3.2:3b', 2.0, 'Liten.']],
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
function glCard() {
  const { n, missing } = glPlan(), done = !n;
  const sub = done ? `Alle oppgaver bruker allerede Glimts anbefaling${missing ? ` · ${missing} ${missing === 1 ? 'modell bør' : 'modeller bør'} lastes ned (se Modeller)` : ''}.` : `Fyller ut ${n} ${n === 1 ? 'oppgave' : 'oppgaver'} med beste installerte modell${missing ? ` · ${missing} mangler (se Modeller)` : ''}.`;
  return `<div class="ac-card ac-gl39"><span class="ac-glm" aria-hidden="true"><i></i><b>✦</b></span><span class="ac-col ac-grow"><b class="ac-h3">La Glimt velge modeller</b><span class="ac-mut">${esc(sub)}</span></span>
    ${G.glUndo ? btn('Angre', 'data-ac-glundo') : ''}${done ? '<span class="ac-glok" aria-disabled="true">✓ Følger anbefaling</span>' : btn('✦ Fyll ut', 'data-ac-glgo', 'ink')}</div>`;
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
function recModCard() {
  const rows = recRows(), miss = rows.filter((r) => !r.installed && !G.pulls[r.model]), uniq = [...new Map(miss.map((r) => [r.model, r])).values()];
  const useable = rows.filter((r) => r.installed && !r.inUse), g = gpu(), admin = G.admin;
  const nm = String(g.name || 'hjemmeserveren').split(' · ')[0], head = `✦ GLIMT ANBEFALER · ${esc(nm)}${g.mem ? ` · ${nb(g.mem)} GB` : ''}`;
  const A = G.recAsk;
  const ask = `<form class="ac-ask" data-ac-askf><input data-ac-ask value="${esc(A?.q ?? '')}" placeholder="Spør Glimt: hva vil du bruke AI til?" autocomplete="off" aria-label="Spør Glimt hva du vil bruke AI til">${btn(A?.busy ? 'Tenker …' : 'Spør', 'type="submit"', 'ink')}</form>
    ${A?.text ? `<div class="ac-askr"><span>${esc(A.text)}</span>${A.model && !instHas(A.model) && admin ? btn(`Last ned ${esc(A.model)}`, `data-ac-pull="${esc(A.model)}"`, 'ink') : ''}</div>` : ''}`;
  return `<div class="ac-sec">${lab(head)}<div class="ac-card ac-list ac-recm">${rows.map((r) => {
    const fc = r.fit === 'PASSER' ? 'ok' : r.fit === 'FOR STOR' ? 'bad' : 'warn', pl = G.pulls[r.model];
    const b = r.inUse ? btn('I bruk', 'disabled') : r.installed ? btn('Bruk', `data-ac-recuse="${esc(r.task)}" data-m="${esc(r.model)}"${admin || ['chat', 'sok', 'glimt', 'brief'].includes(r.task) ? '' : ' disabled'}`) : pl ? btn('Laster …', 'disabled') : btn(`Last ned · ${esc(gbs(r.gb))}`, `data-ac-pull="${esc(r.model)}"${admin ? '' : ' disabled'}`);
    return `<div class="ac-li ac-recr"><span class="ac-col ac-grow"><span class="ac-row"><b>${esc(r.name)}</b><code class="ac-mono">${esc(r.model)}</code>${r.fit ? `<span class="ac-fit ${fc}">${esc(r.fit)}</span>` : ''}</span><span class="ac-mut">${esc(r.why)}${r.alt ? ` Alternativ: ${esc(r.alt)}.` : ''}</span></span>${b}</div>`;
  }).join('')}
    <div class="ac-li ac-recb">${uniq.length ? btn(`Last ned det som mangler · ${esc(gbs(uniq.reduce((a, r) => a + (r.gb ?? 0), 0)))}`, `data-ac-recpull${admin ? '' : ' disabled'}`, 'ink') : ''}${useable.length ? btn(`Bruk alle anbefalinger (${useable.length})`, 'data-ac-recall') : ''}${!uniq.length && !useable.length ? '<span class="ac-mut">Alt følger Glimts anbefaling.</span>' : ''}</div></div>${ask}</div>`;
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
// Logoene til AI-tjenestene (40 px hvit brikke med tynn kant). Innebygde SVG-er – ingen nett trengs.
const LOGO = {
  ollama: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1b1a17" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5c-.9 0-1.4 1.6-1.4 3.6v2.1A5.5 5.5 0 0 0 5 13v6.5h14V13a5.5 5.5 0 0 0-1.6-3.8V7.1c0-2-.5-3.6-1.4-3.6s-1.4 1.6-1.4 3.6v1A6 6 0 0 0 12 7.8a6 6 0 0 0-2.6.3v-1c0-2-.5-3.6-1.4-3.6z"/><circle cx="9.3" cy="12.4" r=".7" fill="#1b1a17"/><circle cx="14.7" cy="12.4" r=".7" fill="#1b1a17"/><path d="M10.6 15.2c.8.6 2 .6 2.8 0"/></svg>',
  gemini: '<svg viewBox="0 0 24 24" width="24" height="24"><defs><linearGradient id="acgem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8df5"/><stop offset=".55" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10C7.3 11.4 11.4 7.3 12 2z" fill="url(#acgem)"/></svg>',
  groq: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#f55036"/><path d="M12 6.6a5.2 5.2 0 1 0 0 10.4h.1a5.2 5.2 0 0 0 5.1-5.2v-.1A5.2 5.2 0 0 0 12 6.6zm0 2.4a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" fill="#fff"/></svg>',
  openrouter: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6467f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12h4.2c2.2 0 3.3-1 4.6-3.3l.6-1c1.2-2.1 2.4-3.2 4.7-3.2H21"/><path d="M2.5 12h4.2c2.2 0 3.3 1 4.6 3.3l.6 1c1.2 2.1 2.4 3.2 4.7 3.2H21"/><path d="M18 1.6l3 2.9-3 2.9M18 16.6l3 2.9-3 2.9"/></svg>',
  roboflow: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 4h9.5a5.5 5.5 0 0 1 1.7 10.7L20 20h-4.4l-4.2-4.8H8V20H4z" fill="#8315f9"/><path d="M8 7.6v4.2h5.3a2.1 2.1 0 0 0 0-4.2z" fill="#fff"/></svg>',
  openai: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#111" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5l7.4 4.2M12 12l-7.4 4.2"/></svg>',
  anthropic: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M14.2 4h-3l5.6 16h3zM7.6 4L2 20h3.1l1.2-3.4h5.9l1.2 3.4h3.1L10.9 4zm-.3 9.9l2-5.7 2 5.7z" fill="#191919"/></svg>',
};
const logo = (k, fb, c) => `<span class="ac-logo" aria-hidden="true">${LOGO[k] ?? `<b style="color:${c}">${esc(fb)}</b>`}</span>`;
const PROV_LOGO = { gemini: 'gemini', groq: 'groq', openrouter: 'openrouter', ollama: 'ollama', openai: 'openai', anthropic: 'anthropic' };

function rtTab(o) {
  if (G.missing.routing) return missingNote('Ruting per oppgave');
  const fin = o.scope === 'finans', R = routingOf(), all = allModelOpts(), web = o.variant !== 'mobile', admin = G.admin;
  const warns = Object.fromEntries([...(G.status?.routes ?? []).filter((x) => x.warning || x.state === 'degraded').map((x) => [x.task, x.warning || x.error]), ...(G.routing?.taskList ?? []).filter((t) => t.warning).map((t) => [t.id, t.warning])]);
  // Prompt 38: finans-radene kommer fra FIN4 + /api/ai/routing?scope=finans (filteret på t[3] ga et tomt kort når serveren sendte en liste uten fin).
  if (fin) return finRt(o) + rtRest(o, R, admin);
  const rows = tasksOf().map(([k, n, s, isFin, personal], i) => {
    const r = R.tasks?.[k] ?? {}, v = r.model ?? '', fb = r.fallback ?? '', can = admin || personal;
    const mv = all.find((m) => m.v === v), fbm = all.find((m) => m.v === fb), isCloudSel = (mv && !mv.loc) || (fbm && !fbm.loc);
    const opt = (L, cur) => [{ v: '', n: 'Automatisk' }, ...(cur && !L.some((m) => m.v === cur) ? [{ v: cur, n: `${cur} · finnes ikke` }] : []), ...L].map((m) => `<option value="${esc(m.v)}"${m.v === cur ? ' selected' : ''}>${esc(m.n)}</option>`).join('');
    const warn = isFin && R.rules?.finLocal && isCloudSel ? 'Finansdata skal holdes lokalt, men denne bruker en sky-modell. Bytt til en lokal modell.'
      : v && G.models && !mv ? `Modellen «${v}» finnes ikke · bytt` : warns[k] ?? '';
    return `<div class="ac-rt${web ? ' web' : ''}"${i ? '' : ' style="border-top:0"'}><span class="ac-col"><b>${esc(n)}</b><span>${esc(s)}</span></span>
      <label class="ac-sel"><span>MODELL</span><select data-ac-rt="${k}" data-f="model"${can ? '' : ' disabled'}>${opt(all, v)}</select></label>
      <label class="ac-sel"><span>RESERVE</span><select data-ac-rt="${k}" data-f="fallback"${can ? '' : ' disabled'}>${opt(all, fb).replace('>Automatisk<', '>Ingen<')}</select></label>
      ${warn ? `<span class="ac-warn">${esc(warn)}</span>` : ''}</div>`;
  }).join('');
  const rules = (fin ? [['finLocal', 'Finansdata forlater aldri huset', 'Kvitteringer og transaksjoner bare til lokale modeller'], ['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen']]
    : [['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen, bytt bare ved feil eller timeout'], ['finLocal', 'Finansdata forlater aldri huset', 'Gjelder kvitteringer, transaksjoner og Finans · spør'], ['think', 'Vis tenking', 'Vis stegene mens modellen jobber']])
    .map(([k, n, s]) => `<button type="button" class="ac-li" data-ac-rule="${k}" role="switch" aria-checked="${!!R.rules?.[k]}"${admin || k === 'think' ? '' : ' disabled'}><span class="ac-col ac-grow"><b>${n}</b><span>${s}</span></span>${sw(!!R.rules?.[k])}</button>`).join('');
  const P = R.params ?? {};
  const par = (fin ? [['minConf', 'Minste sikkerhet før «Sjekk»', 'Lavere enn dette havner i Til godkjenning', CONF], ['parallel', 'Samtidige kvitteringer', 'Flere samtidig krever mer VRAM', PAR]]
    : [['keepAlive', 'Hold modell lastet', 'Hvor lenge modellen blir i VRAM etter bruk (keep_alive)', KEEP], ['numCtx', 'Kontekst', 'Standard kontekstlengde (num_ctx)', CTX], ['temperature', 'Temperatur', 'Lav = presis, høy = kreativ', TEMP], ['parallel', 'Samtidige jobber', 'Maks jobber som kjører på serveren samtidig', PAR]])
    .map(([k, n, s, opts]) => { const cur = opts.find((x) => String(x[0]) === String(P[k])); return `<div class="ac-par"><span class="ac-row ac-sb"><span class="ac-col"><b>${n}</b><span>${s}</span></span><b class="ac-mono">${esc(cur?.[1] ?? P[k] ?? '–')}</b></span><div class="ac-seg">${opts.map(([v, l]) => `<button type="button" class="${String(P[k]) === String(v) ? 'on' : ''}" data-ac-par="${k}" data-v="${esc(JSON.stringify(v))}"${admin || k === 'temperature' ? '' : ' disabled'}>${l}</button>`).join('')}</div></div>`; }).join('');
  return `${fin ? '' : glCard()}<div class="ac-sec">${lab(fin ? 'HVILKEN MODELL GJØR HVA I FINANS' : 'HVILKEN MODELL GJØR HVA')}<div class="ac-card ac-list">${rows}</div>${admin ? '' : '<div class="ac-note">Du kan velge egne modeller for Chat, AI-søk, Glimt og brief. Resten bestemmer administrator.</div>'}</div>
    <div class="ac-sec">${lab('REGLER')}<div class="ac-card ac-list">${rules}</div></div>
    <div class="ac-sec">${lab('PARAMETRE')}<div class="ac-card ac-list">${par}</div></div>`;
}
/** Finans: fire rader (Kvitteringer, Kategorisering, Finans · spør, Strekkoder og pakkelapper), MODELL og RESERVE med LOKAL/SKY,
 *  rød advarsel når «Finansdata forlater aldri huset» er på og en sky-modell er valgt, og tom tilstand uten modeller. */
function finRt(o) {
  const R = routingOf(), web = o.variant !== 'mobile', admin = G.admin, all = allModelOpts(), finLocal = !!(G.finRouting?.rules?.finLocal ?? R.rules?.finLocal);
  const rows = finRows();
  const anyOpts = all.length || rows.some((r) => r.options?.length);
  if (!anyOpts && (G.models || G.missing.models)) {
    return `<div class="ac-sec">${lab('HVILKEN MODELL GJØR HVA I FINANS')}<div class="ac-card ac-empty"><b class="ac-h3">Ingen modeller ennå</b><span class="ac-mut">Installer en lokal modell (for eksempel qwen2.5vl:7b for kvitteringer) eller koble til en sky-modell.</span>${btn('Installer modell ›', 'data-ac-instmod', 'ink')}</div></div>`;
  }
  const html = rows.map((r, i) => {
    const L = r.options?.length ? r.options.map((x) => ({ v: x.id ?? x.value ?? x.model, n: x.label ?? x.id, loc: x.local !== false })) : all;
    const tag = (m) => `${m.n.replace(/ · (lokal|ollama|gemini|groq|openai|anthropic|sky)$/i, '')} · ${m.loc ? 'LOKAL' : 'SKY'}`;
    const opt = (cur, none) => [{ v: '', n: none, raw: true }, ...(cur && !L.some((m) => m.v === cur) ? [{ v: cur, n: `${cur} · finnes ikke`, raw: true }] : []), ...L].map((m) => `<option value="${esc(m.v)}"${m.v === cur ? ' selected' : ''}>${esc(m.raw ? m.n : tag(m))}</option>`).join('');
    const mv = L.find((m) => m.v === r.model), fv = L.find((m) => m.v === r.fallback);
    const cloudSel = (mv && !mv.loc) || (!r.model && false);
    const warn = finLocal && cloudSel ? 'Finansdata forlater aldri huset er på, men modellen er i skyen. Bytt til en lokal modell.'
      : finLocal && fv && !fv.loc ? 'Reserven er i skyen og brukes ikke mens «Finansdata forlater aldri huset» er på.'
        : r.model && (G.models || r.options) && !mv ? `Modellen «${r.model}» finnes ikke · bytt` : r.warning;
    return `<div class="ac-rt${web ? ' web' : ''} ac-rt38"${i ? '' : ' style="border-top:0"'}><span class="ac-col"><b>${esc(r.n)}</b><span>${esc(r.d)}</span>${!r.model ? `<span class="ac-mono ac-mut ac-def">Standard: ${esc(r.def)} · reserve ${esc(r.defF)}</span>` : ''}</span>
      <div class="ac-sels"><label class="ac-sel"><span>MODELL</span><select data-ac-rt="${esc(r.id)}" data-f="model"${admin ? '' : ' disabled'}>${opt(r.model, `Standard (${r.def})`)}</select></label>
      <label class="ac-sel"><span>RESERVE</span><select data-ac-rt="${esc(r.id)}" data-f="fallback"${admin ? '' : ' disabled'}>${opt(r.fallback, `Standard (${r.defF})`)}</select></label></div>
      ${warn ? `<span class="ac-warn">${esc(warn)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="ac-sec">${lab('HVILKEN MODELL GJØR HVA I FINANS')}<div class="ac-card ac-list">${html}</div>${admin ? '' : '<div class="ac-note">Modellene i Finans bestemmes av administrator.</div>'}</div>`;
}
function rtRest(o, R, admin) {
  const rules = [['finLocal', 'Finansdata forlater aldri huset', 'Kvitteringer og transaksjoner bare til lokale modeller'], ['localFirst', 'Lokalt først', 'Prøv hjemmeserveren før skyen']]
    .map(([k, n, s]) => `<button type="button" class="ac-li" data-ac-rule="${k}" role="switch" aria-checked="${!!R.rules?.[k]}"${admin ? '' : ' disabled'}><span class="ac-col ac-grow"><b>${n}</b><span>${s}</span></span>${sw(!!R.rules?.[k])}</button>`).join('');
  const P = R.params ?? {};
  const par = [['minConf', 'Minste sikkerhet før «Sjekk»', 'Lavere enn dette havner i Til godkjenning', CONF], ['parallel', 'Samtidige kvitteringer', 'Standard 1 på Mac mini (maks 2 med 7B)', PAR]]
    .map(([k, n, s, opts]) => { const cur = opts.find((x) => String(x[0]) === String(P[k])); return `<div class="ac-par"><span class="ac-row ac-sb"><span class="ac-col"><b>${n}</b><span>${s}</span></span><b class="ac-mono">${esc(cur?.[1] ?? P[k] ?? '–')}</b></span><div class="ac-seg">${opts.map(([v, l]) => `<button type="button" class="${String(P[k]) === String(v) ? 'on' : ''}" data-ac-par="${k}" data-v="${esc(JSON.stringify(v))}"${admin ? '' : ' disabled'}>${l}</button>`).join('')}</div></div>`; }).join('');
  return `<div class="ac-sec">${lab('REGLER')}<div class="ac-card ac-list">${rules}</div></div><div class="ac-sec">${lab('PARAMETRE')}<div class="ac-card ac-list">${par}</div></div>`;
}

function jobTab(o) {
  if (G.missing.jobs) return missingNote('Jobbloggen');
  const J = jobsF(o.scope === 'finans'), run = J.filter((j) => j.status === 'run'), q = J.filter((j) => j.status === 'queue'), done = J.filter((j) => j.status === 'ok' || j.status === 'fail' || j.status === 'cancel' || j.status === 'cancelled');
  const par = routingOf().params?.parallel ?? 2;
  const row = (j) => {
    const r = j.status === 'run', qq = j.status === 'queue', ok = j.status === 'ok', bad = j.status === 'fail' || j.status === 'cancel' || j.status === 'cancelled';
    const tokn = (j.tokens?.in ?? 0) + (j.tokens?.out ?? 0);
    const s = [j.model, r ? `${Math.floor(j.progress ?? 0)} %${j.step ? ` · ${j.step}` : ''}` : '', qq ? (j.when ? j.when : 'venter') : '', j.ms != null && !r ? ms2(j.ms) : '', tokn ? `${nb(tokn)} tok` : '', j.costKr ? krs(j.costKr) : '', j.fallbackFrom ? `reserve for ${j.fallbackFrom}` : '', j.error ?? ''].filter(Boolean).join(' · ');
    const act = r || qq ? btn('Avbryt', `data-ac-jcancel="${esc(j.id)}"`, 'red') : bad && j.retryable !== false ? btn('Prøv igjen', `data-ac-jretry="${esc(j.id)}"`) : '';
    return `<div class="ac-job"><div class="ac-row"><span class="ac-ring ${r ? 'run' : qq ? 'queue' : ok ? 'ok' : 'bad'}">${ok ? '✓' : bad ? '!' : ''}</span><span class="ac-col ac-grow"><b class="ac-ell">${esc(j.title || j.taskName || j.task)}</b><span class="ac-ell${bad ? ' bad' : ''}">${esc(s)}</span></span>${act}</div>${r ? `<span class="ac-track sm"><i style="width:${j.progress ?? 0}%;background:var(--acc)"></i></span>` : ''}</div>`;
  };
  const G2 = [['KJØRER', run], ['I KØ', q], ['SISTE', done.slice(0, 40)]].filter((g) => g[1].length);
  return `<div class="ac-row ac-sb ac-wrap"><span class="ac-mut">${run.length} kjører · ${q.length} i kø · maks ${par} samtidig${G.paused ? ' · køen er pauset' : ''}</span><span class="ac-row">${btn(G.paused ? 'Fortsett kø' : 'Pause kø', 'data-ac-pause')}${btn('Tøm historikk', 'data-ac-jclear')}</span></div>
    ${G2.map(([h, L]) => `<div class="ac-sec">${lab(h)}<div class="ac-card ac-list">${L.map(row).join('')}</div></div>`).join('') || `<div class="ac-card"><span class="ac-mut">${G.jobs ? 'Ingen AI-jobber ennå. Chat, kvitteringer, kategorisering, AI-søk og Glimt logges her.' : G.err.jobs ? esc(G.err.jobs) : 'Laster …'}</span></div>`}`;
}

function useTab(o) {
  if (G.missing.usage) return missingNote('Forbruk');
  const U = G.usage, fin = o.scope === 'finans', T = U?.totals ?? {}, B = U?.budget ?? {};
  const per = `<div class="ac-seg auto">${[['1', 'I dag'], ['7', '7 dager'], ['30', '30 dager']].map(([k, n]) => `<button type="button" class="${G.per === k ? 'on' : ''}" data-ac-per="${k}">${n}</button>`).join('')}</div>`;
  if (!U) return `${per}<div class="ac-card"><span class="ac-mut">${G.err.usage ? esc(G.err.usage) : 'Laster …'}</span></div>`;
  const byP = Object.fromEntries((U.byProvider ?? []).map((p) => [p.provider, p]));
  const kpi = [['TOKENS', tk((T.tokIn ?? 0) + (T.tokOut ?? 0)), `inn ${tk(T.tokIn ?? 0)} · ut ${tk(T.tokOut ?? 0)}`], ['SKY-KOSTNAD', krs(T.costKr), `Gemini ${krs(byP.gemini?.costKr)} · Groq ${krs(byP.groq?.costKr)}`],
    ['LOKALT', T.localShare != null ? `${T.localShare} %` : '–', 'av alle tokens, gratis'], ['SNITT SVARTID', T.avgMs != null ? ms2(T.avgMs) : '–', `${nb(T.count ?? 0)} kall${T.failed ? ` · ${T.failed} feilet` : ''}`]];
  const D = U.byDay ?? [], mx = Math.max(1, ...D.map((d) => (d.localTok ?? 0) + (d.cloudTok ?? 0)));
  const bars = D.map((d) => `<div title="${esc(`${d.date}: ${tk((d.localTok ?? 0) + (d.cloudTok ?? 0))} tokens${d.costKr ? ` · ${krs(d.costKr)}` : ''}`)}"><span style="height:${((d.cloudTok ?? 0) / mx) * 100}%;background:var(--acc)"></span><span style="height:${((d.localTok ?? 0) / mx) * 100}%;background:var(--ok)"></span></div>`).join('');
  const F = (U.byTask ?? []).filter((f) => !fin || ['rc', 'kat', 'fsok', 'bar'].includes(f.task)), fm = Math.max(1, ...F.map((f) => f.tokens ?? 0));
  const R = routingOf(), bud = Number(R.budget?.monthlyKr ?? B.monthlyKr ?? 0) || 0, used = B.monthCostKr ?? 0, admin = G.admin;
  return `${per}<div class="ac-kpis sm">${kpi.map(([l, v, s]) => `<div class="ac-kpi"><span class="ac-lab">${l}</span><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('')}</div>
    ${card(`<span class="ac-row ac-sb ac-wrap"><b class="ac-h3">Tokens per dag</b><span class="ac-row ac-mut ac-legend"><span><i style="background:var(--ok)"></i>Lokalt</span><span><i style="background:var(--acc)"></i>Sky</span></span></span><div class="ac-chart">${bars || '<span class="ac-mut">Ingen kall i perioden.</span>'}</div><span class="ac-row ac-sb ac-mono ac-mut"><span>${G.per === '1' ? '00:00' : `${G.per} dager siden`}</span><span>i dag</span></span>`, 'ac-gap')}
    <div class="ac-sec">${lab('PER FUNKSJON')}<div class="ac-card ac-list">${F.map((f) => `<div class="ac-feat"><b>${esc(f.name)}</b><b class="ac-mono">${f.costKr ? krs(f.costKr) : 'Gratis'}</b><span class="ac-track xs"><i style="width:${((f.tokens ?? 0) / fm) * 100}%;background:var(--ink)"></i></span><span class="ac-mut">${esc([(f.models ?? []).slice(0, 2).join(' · '), `${nb(f.count)} kall`].filter(Boolean).join(' · '))}</span><span class="ac-mono ac-mut">${tk(f.tokens ?? 0)} tok</span></div>`).join('') || '<div class="ac-feat"><span class="ac-mut">Ingen kall i perioden.</span></div>'}</div></div>
    ${card(`<span class="ac-row ac-sb"><b class="ac-h3">Budsjett for sky-AI</b><b class="ac-mono">${bud ? `${nb(bud)} kr / mnd` : 'Ingen grense'}</b></span>
      <input type="range" min="0" max="500" step="10" value="${bud}" data-ac-bud aria-label="Budsjett for sky-AI i kroner per måned"${admin ? '' : ' disabled'}>
      <span class="ac-track"><i style="width:${bud ? Math.min(100, (used / bud) * 100) : 0}%;background:${bud && used / bud > 0.8 ? 'var(--warn)' : 'var(--ok)'}"></i></span>
      <span class="ac-mut">${krs(used)} brukt denne måneden.${B.forecastKr != null ? ` Prognose: ${krs(B.forecastKr)} ved månedsslutt.` : ''}${bud ? '' : ' 0 kr = ingen grense.'}</span>
      ${[['hardStop', 'Stopp sky-AI ved grensen', 'Bytter til lokale modeller resten av måneden'], ['warn80', 'Varsle ved 80 %', 'Push til mobilen']].map(([k, n, s]) => `<button type="button" class="ac-li tight" data-ac-budt="${k}" role="switch" aria-checked="${!!R.budget?.[k]}"${admin ? '' : ' disabled'}><span class="ac-col ac-grow"><b>${n}</b><span>${s}</span></span>${sw(!!R.budget?.[k])}</button>`).join('')}`, 'ac-gap')}`;
}

function apiTab(o) {
  const fin = o.scope === 'finans', admin = G.admin;
  const P = [['ollama', 'Ollama · hjemmeserver', 'O', '#2f7a4f', [['url', 'Adresse', 'http://192.168.1.40:11434', false]], ''],
    ['gemini', 'Google Gemini', 'G', '#2b5d8a', [['key', 'API-nøkkel', 'AIza…', true, 'aistudio.google.com', 'https://aistudio.google.com/apikey']], 'Gratisnivå: 15 forespørsler/min · 1 500/dag'],
    ['groq', 'Groq', 'q', '#a8661a', [['key', 'API-nøkkel', 'gsk_…', true, 'console.groq.com', 'https://console.groq.com/keys']], '30 forespørsler/min · 14 400/dag'],
    ['openrouter', 'OpenRouter', 'R', '#7a3b6b', [['key', 'API-nøkkel (valgfri)', 'sk-or-…', true, 'openrouter.ai', 'https://openrouter.ai/keys']], 'Gir tilgang til Claude, GPT og flere via én nøkkel'],
    ['roboflow', 'Roboflow', 'rf', '#3d7f8a', [['key', 'API-nøkkel', 'Private API Key', true, 'app.roboflow.com', 'https://app.roboflow.com/settings/api'], ['model', 'Arbeidsområde / modell', 'workspace/modell/1', false]], 'Brukes til strekkoder og pakkelapper'],
  ].filter((x) => !fin || x[0] !== 'openrouter');
  const cards = P.map(([k, n, ic, c, fields, meta]) => {
    const kk = (Array.isArray(G.keys) ? G.keys : []).find((x) => x.id === k) ?? {}, p = { ...kk, keyTail: kk.tail ?? undefined, ...(prov(k) ?? {}), ...(kk.url ? { url: kk.url } : {}), ...(kk.model ? { model: kk.model } : {}), ...(kk.tail ? { keyTail: kk.tail } : {}) }, t = G.test[k];
    const st = t?.busy ? 'Tester …' : t?.ok ? t.ok : t?.err ? t.err : p.label ? `${p.label}${p.ms != null && p.state === 'ok' ? ` · ${ms2(p.ms)}` : ''}${p.state !== 'ok' && p.error ? ` · ${p.error}` : ''}` : G.status ? 'Ikke koblet til' : G.missing.status ? 'Status er ikke tilgjengelig på serveren ennå' : G.err.status ? G.err.status : 'Sjekker …';
    const stc = t?.busy ? 'var(--mut)' : t?.ok ? 'var(--ok)' : t?.err ? 'var(--bad)' : p.state ? (p.state === 'off' ? 'var(--mut)' : stColor(p.state)) : 'var(--mut)';
    const F = fields.map(([f, l, ph, isKey, link, href]) => {
      const cur = f === 'url' ? p.url ?? '' : f === 'model' ? p.model ?? '' : '';
      const phx = isKey && p.keyTail ? `•••• ${p.keyTail} · satt` : ph;
      return `<label class="ac-fld"><span class="ac-row ac-sb"><span>${l}</span>${link ? `<a href="${href}" target="_blank" rel="noopener">${link} ↗</a>` : ''}</span><span class="ac-in"><input type="${isKey && !G.eye[`${k}.${f}`] ? 'password' : 'text'}" data-ac-key="${k}" data-f="${f}" value="${esc(cur)}" placeholder="${esc(phx)}" autocomplete="off" spellcheck="false"${admin ? '' : ' disabled'}>${isKey && admin ? `<button type="button" data-ac-eye="${k}.${f}">${G.eye[`${k}.${f}`] ? 'Skjul' : 'Vis'}</button>` : ''}</span></label>`;
    }).join('');
    return `<div class="ac-card ac-gap"><div class="ac-row">${logo(k, ic, c)}<span class="ac-col ac-grow"><b class="ac-h3">${n}</b><span class="ac-stl" style="color:${stc}"><i style="background:${stc}"></i>${esc(st)}</span></span>${btn(t?.busy ? 'Tester …' : 'Test', `data-ac-test="${k}"`)}</div>${F}${meta ? `<span class="ac-mono ac-mut">${esc(meta)}</span>` : ''}</div>`;
  }).join('');
  const toks = fin ? '' : `<div class="ac-card ac-gap"><span class="ac-row ac-sb"><span class="ac-col"><b class="ac-h3">Glimt-API for egne skript</b><span class="ac-mono ac-mut">POST ${esc(location.origin)}/api/glimt</span></span>${btn('+ Ny nøkkel', 'data-ac-newtok', 'ink')}</span>
    ${G.fresh ? `<div class="ac-fresh"><span>Kopier nå. Nøkkelen vises bare én gang.</span><b class="ac-mono">${esc(G.fresh)}</b></div>` : ''}
    ${G.missing.tokens ? '<span class="ac-mut">Serveren har ikke personlige Glimt-nøkler ennå.</span>' : (G.tokens ?? []).map((t) => `<div class="ac-tok"><span class="ac-col ac-grow"><b>${esc(t.name ?? 'Nøkkel')}</b><span class="ac-mono ac-mut">hl_••••${esc(t.tail ?? t.last4 ?? '')} · opprettet ${esc(t.createdAt ?? t.created ? new Date(t.createdAt ?? t.created).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '–')} · ${t.lastUsed ? `brukt ${ago(t.lastUsed)}` : 'aldri brukt'}</span></span><button type="button" class="ac-tx red" data-ac-deltok="${esc(t.id)}">Trekk tilbake</button></div>`).join('') || '<span class="ac-mut">Ingen nøkler ennå.</span>'}</div>`;
  return `${admin ? '' : '<div class="ac-note">Bare administrator kan endre adresser og nøkler. Du ser status og kan teste.</div>'}${cards}${toks}
    <span class="ac-mut ac-small">Nøklene lagres kryptert på serveren og sendes aldri tilbake til nettleseren eller appen. Feltene viser bare de siste fire tegnene.</span>`;
}

function html(p) {
  const o = p.o, fin = o.scope === 'finans', T = THEMES[o.theme] ?? THEMES.papir, tabs = tabsFor(o), web = o.variant !== 'mobile';
  if (!tabs.some(([k]) => k === p.tab)) p.tab = tabs[0][0];
  const J = jobsF(fin), runN = J.filter((j) => j.status === 'run').length, failN = J.filter((j) => j.status === 'fail').length, I = installed();
  const status = `${fin ? 'Kvitteringer, kategorier og spørsmål' : `${I.length} lokale modeller · ${cloud().filter((c) => c.on).length} i skyen`} · ${runN ? `${runN} jobb${runN > 1 ? 'er' : ''} kjører` : 'ingen jobber kjører'}`;
  const body = { ov: ovTab, mod: modTab, rt: rtTab, job: jobTab, use: useTab, api: apiTab }[p.tab](o);
  p.status = status; // prompt 39: innebygd på web vises statuslinjen i Innstillinger-toppen (o.onStatus)
  const style = Object.entries(T).map(([k, v]) => `--${k}:${v}`).join(';');
  return `<div class="ac ${web ? 'web' : 'mob'} th-${esc(o.theme ?? 'papir')}${o.embedded ? ' emb' : ''}" style="${style}" data-ac-root>
    ${o.embedded && web ? '' : `<div class="ac-hd"><div class="ac-col ac-grow"><span class="ac-kick">${fin ? 'FINANSHUB · KUNSTIG INTELLIGENS' : 'GLIMT · AI-KONTROLL'}</span>${o.hideTitle ? '' : `<b class="ac-title">${fin ? 'AI i Finans' : 'AI'}</b>`}<span class="ac-mut">${esc(status)}</span></div>${o.onClose ? '<button type="button" class="ac-done" data-ac-close>Ferdig</button>' : ''}</div>`}
    <div class="ac-body"><nav class="ac-nav" aria-label="AI-kontroll">${tabs.map(([k, n]) => { const b = k === 'job' ? runN + failN : 0; return `<button type="button" class="${p.tab === k ? 'on' : ''}" data-ac-tab="${k}" aria-current="${p.tab === k ? 'page' : 'false'}">${web ? svg(IC[k]) : ''}<span>${n}</span>${b ? `<i class="ac-badge">${b}</i>` : ''}</button>`; }).join('')}</nav>
      <div class="ac-main" data-ac-main>${body}</div></div>
    ${G.toast ? `<div class="ac-toast" role="status">${esc(G.toast)}</div>` : ''}</div>`;
}

/** Tegner ett panel på nytt, men beholder fokus/markør og scroll (søkefelt og nøkkelfelt). */
function paint(p) {
  if (!p.el.isConnected) { inst.delete(p); return; }
  const out = html(p);
  if (out === p.last) return; // ingenting endret: ingen ny tegning, ingen flimring
  p.last = out;
  const ae = document.activeElement, inside = p.el.contains(ae), sel = inside && ae.matches?.('input') ? [ae.dataset.acKey ?? '', ae.dataset.f ?? '', ae.hasAttribute('data-ac-q'), ae.selectionStart, ae.value] : null;
  const sc = p.el.querySelector('[data-ac-main]')?.scrollTop ?? 0;
  p.el.innerHTML = out;
  const m = p.el.querySelector('[data-ac-main]'); if (m) m.scrollTop = sc;
  // Mobil: valgt fanepille synlig i raden (uten å rulle siden).
  const nav = p.el.querySelector('.ac-nav'), on = nav?.querySelector('.on');
  if (nav && on && nav.scrollWidth > nav.clientWidth) { const l = on.offsetLeft - nav.offsetLeft; if (l < nav.scrollLeft || l + on.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = l - 16; }
  p.o.onPaint?.(p.el);
  if (p.o.embedded) p.o.onStatus?.(p.status);
  if (sel) {
    const el = sel[2] ? p.el.querySelector('[data-ac-q]') : p.el.querySelector(`[data-ac-key="${sel[0]}"][data-f="${sel[1]}"]`);
    if (el) { if (!sel[2]) el.value = sel[4]; el.focus({ preventScroll: true }); try { el.setSelectionRange(sel[3], sel[3]); } catch { /* */ } }
  }
}

function enterTab(p) {
  const t = p.tab;
  if (t === 'ov') { loadStatus(); loadJobs(); loadUsage(); loadModels(); }
  if (t === 'mod') { loadModels(); loadRouting(); loadStatus(); loadRec(); if (G.libQ == null) loadLib(''); }
  if (t === 'rt') { loadRouting(); loadModels(); loadStatus(); loadRec(); }
  if (t === 'job') { loadJobs(); loadRouting(); }
  if (t === 'use') { loadUsage(); loadRouting(); }
  if (t === 'api') { loadStatus(); loadKeys(); if (p.o.scope !== 'finans') loadTokens(); }
}

let libT = 0;
function bind(el) {
  el.addEventListener('click', async (e) => {
    const p = el._acP;
    const b = e.target.closest('button,[data-ac-tab]');
    if (!b || !el.contains(b) || b.disabled) return;
    const d = b.dataset;
    if ('acClose' in d) { vibe(); p.o.onClose?.(); return; }
    if (d.acTab) { vibe(); p.tab = d.acTab; p.o.onTab?.(p.tab); enterTab(p); paint(p); const m = el.querySelector('[data-ac-main]'); if (m) m.scrollTop = 0; return; }
    if ('acInstmod' in d) { vibe(); if (tabsFor(p.o).some(([k]) => k === 'mod')) { p.tab = 'mod'; p.o.onTab?.(p.tab); enterTab(p); paint(p); } else openAiControl({ ...p.o, scope: 'alle', tab: 'mod' }); return; }
    if ('acSelf' in d) return selftest(false);
    // Prompt 39: La Glimt velge / Glimt anbefaler
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
    if (d.acCloud) {
      const c = cloud().find((x) => x.id === d.acCloud), on = !c?.on; vibe();
      try { await call('/cloud', { method: 'PUT', json: { id: d.acCloud, on } }); } catch (err) { if (err.status !== 404) { toast(err.message); return; } return saveRouting({ cloudOn: { [d.acCloud]: on } }); }
      loadModels(); loadRouting(); return;
    }
    if (d.acRule) { vibe(); return saveRouting({ rules: { [d.acRule]: !routingOf().rules?.[d.acRule] } }); }
    if (d.acPar) { vibe(); let v; try { v = JSON.parse(d.v); } catch { v = d.v; } return saveRouting({ params: { [d.acPar]: v } }); }
    if (d.acBudt) { vibe(); return saveRouting({ budget: { [d.acBudt]: !routingOf().budget?.[d.acBudt] } }); }
    if (d.acPer) { G.per = d.acPer; vibe(); G.usage = null; loadUsage(); redraw(); return; }
    if ('acPause' in d) { try { const r = await call('/queue/pause', { method: 'POST', json: { paused: !G.paused } }); G.paused = r.paused ?? !G.paused; vibe(); } catch (err) { toast(err.message); } redraw(); return; }
    if ('acJclear' in d) { try { await call('/jobs', { method: 'DELETE' }); vibe(); } catch (err) { toast(err.message); } loadJobs(); return; }
    if (d.acJcancel) return jobAct(d.acJcancel, 'cancel');
    if (d.acJretry) return jobAct(d.acJretry, 'retry');
    if (d.acTest) return testKey(d.acTest);
    if (d.acEye) { G.eye[d.acEye] = !G.eye[d.acEye]; redraw(); return; }
    if ('acNewtok' in d) { try { const r = await call('/tokens', { method: 'POST', json: { name: 'Ny nøkkel' } }); G.fresh = r.token ?? r.key ?? null; vibe(); } catch (err) { toast(err.message); } loadTokens(); return; }
    if (d.acDeltok) { if (!confirm('Trekke tilbake nøkkelen? Skript som bruker den slutter å virke.')) return; try { await call(`/tokens/${encodeURIComponent(d.acDeltok)}`, { method: 'DELETE' }); vibe(); } catch (err) { toast(err.message); } loadTokens(); }
  });
  el.addEventListener('submit', (e) => { const f = e.target.closest?.('[data-ac-askf]'); if (!f) return; e.preventDefault(); recAsk(f.querySelector('[data-ac-ask]')?.value); });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ac-rt]')) { vibe(); return saveRouting({ tasks: { [t.dataset.acRt]: { [t.dataset.f]: t.value } } }).then(() => { G.at.finRouting = 0; get('finRouting', '/routing?scope=finans', normRouting); }); }
    if (t.matches('[data-ac-bud]')) return saveRouting({ budget: { monthlyKr: +t.value } });
    if (t.matches('[data-ac-key]')) return saveKey(t.dataset.acKey, t.dataset.f, t.value);
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-ac-q]')) { G.q = t.value; redraw(); clearTimeout(libT); if (!G.missing.lib) libT = setTimeout(() => loadLib(G.q.trim()), 350); }
    if (t.matches('[data-ac-bud]')) { const v = +t.value, R = routingOf(); G.routing = G.routing?.routing ? { ...G.routing, routing: { ...R, budget: { ...(R.budget ?? {}), monthlyKr: v } } } : { ...R, budget: { ...(R.budget ?? {}), monthlyKr: v } }; const lb = t.closest('.ac-card')?.querySelector('.ac-sb .ac-mono'); if (lb) lb.textContent = v ? `${nb(v)} kr / mnd` : 'Ingen grense'; }
  });
  el.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.matches?.('[data-ac-q]') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); e.stopPropagation();
      const q = t.value.trim().toLowerCase(), L = (G.lib ?? LIB0).filter((l) => l.id.includes(q));
      if (L.length === 1) pull(L[0].id); else if (/^[a-z0-9._/-]+(:[a-z0-9._-]+)?$/i.test(q)) pull(q);
    }
    if (t.matches?.('[data-ac-key]') && e.key === 'Enter') { e.preventDefault(); t.blur(); }
  });
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
 * Monterer AI-kontroll i el. o: {variant:'web'|'mobile', scope:'alle'|'chat'|'finans', theme:'papir'|'mork'|'finans', tab, admin, onClose, onTab, embedded, hideTitle}.
 * Returnerer {setTab, destroy}.
 */
export function mountAiControl(el, o = {}) {
  injectCss();
  let p = el._acP;
  if (p) { inst.delete(p); p.o = o; if (o.tab) p.tab = o.tab; p.last = ''; }
  else { p = { el, o, tab: o.tab ?? (o.scope === 'finans' ? 'rt' : o.scope === 'chat' ? 'mod' : 'ov'), last: '' }; el._acP = p; bind(el); }
  G.admin = !!o.admin;
  inst.add(p);
  paint(p); enterTab(p); poll();
  return api0(p);
}
const api0 = (p) => ({ setTab: (t) => { p.tab = t; enterTab(p); paint(p); }, destroy: () => { inst.delete(p); p.el.innerHTML = ''; } });

/** Fullskjerm/ark med AI-kontroll over siden (Chat, Glimt-feil). Lukkes med Ferdig, Esc eller klikk utenfor. */
export function openAiControl(o = {}) {
  injectCss();
  document.querySelector('.ac-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'ac-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'AI-kontroll');
  const box = document.createElement('div'); box.className = 'ac-ovbox'; ov.appendChild(box);
  document.body.appendChild(ov);
  const mob = matchMedia('(max-width: 767px)').matches;
  const close = () => { inst.forEach((p) => { if (p.el === box) inst.delete(p); }); ov.remove(); document.removeEventListener('keydown', key, true); o.onClose2?.(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  mountAiControl(box, { variant: mob ? 'mobile' : 'web', scope: 'alle', theme: 'papir', ...o, onClose: close });
  return { close };
}

/** Kjør selvtesten fra andre steder (f.eks. etter at nøkler er endret). */
export const runSelftest = () => selftest(true);

function injectCss() {
  if (document.querySelector('link[data-ac-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/ai-control.css'; l.dataset.acCss = ''; document.head.appendChild(l);
  if (!document.querySelector('link[data-ac-fonts],link[data-hl-fonts]')) { const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.acFonts = ''; f.href = 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap'; document.head.appendChild(f); }
}
