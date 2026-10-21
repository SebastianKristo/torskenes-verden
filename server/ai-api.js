// Prompt 34 (SERVER34): AI-kontroll-API, montert under /api/ai. Sesjon eller app-token (authOrToken), alt per bruker.
// Alle kan se status, modeller, ruting, jobber og forbruk. Bare admin endrer serveroppsettet (modeller, nøkler, serverstandard
// for ruting, sky-modeller, budsjett, kø). Nøkler sendes aldri ut: klienten får bare {set, tail:'4f2a'}.
//
// GET  /status[?fresh=1]   → {checkedAt, cached, server:{url, version, gpu:{name, vramGb}, vramUsedGb, diskGb, loaded:[id]},
//                             providers:[{id:'ollama'|'gemini'|'groq'|'openrouter'|'roboflow', name, state:'ok'|'degraded'|'off',
//                                         label:'Svarer'|'Nås, men genererer ikke'|'Ikke tilkoblet', ms, model, error, keyTail?, url?}],
//                             routes:[{task, name, model, provider, state, label, ms, error, warning}], budget}
//                             (ekte mini-generering «Svar bare: ok», num_predict 3, 15 s; cache 5 min; fresh=1 tvinger ny sjekk)
// GET  /models             → {ok, error?, url, version, gpu:{name, vramGb}, installed:[{id, name, sizeGb, quant, params, family, kind:'tekst'|'bilde'|'embedding'|'resonnering',
//                             loaded, vramGb, expiresAt, lastUsed, fit:'PASSER'|'DELVIS CPU'|'FOR STOR'}], pulls:[pull], cloud:[{id, provider, desc, vision, on, available}],
//                             defaults:{chat}}
// POST /models/pull {model} → SSE «progress» {model, status, completed, total, pct, mbps, done, error} … til done (admin).
//                             Nedlastingen fortsetter i bakgrunnen om klienten kobler fra. GET /models/pulls → [pull]. DELETE /models/pulls/:model = Avbryt.
// POST /models/:id/load | /models/:id/unload → {ok, model, loaded} (admin; id URL-kodet; unload = keep_alive:0)
// DELETE /models/:id       → {ok} (admin; Ollama /api/delete). Ruter som peker på modellen bytter til reserven automatisk.
// PUT  /models/default {model} → ruting (chat-modellen; egen for brukeren, eller serverstandard når admin sender scope:'server')
// PUT  /cloud {id, on}     → {cloud} (admin; av/på per sky-modell)
// GET  /library?q=&cat=tekst|bilde|resonnering|embedding → {gpu, items:[{id, desc, sizeGb, cat, fit, installed}]}
// GET  /routing            → {tasks:[{id, name, desc, kind, fin, personal, model, fallback, own, resolved, provider, warning}], rules, params, budget, cloudOn,
//                             options:{keepAlive:['5m','30m',-1,0], numCtx:[4096,8192,32768,131072]}, models:[{id, provider, local, kind}], admin, warnings:[]}
// PUT  /routing {tasks?:{id:{model,fallback}}, rules?, params?, budget?, cloudOn?, scope?:'server'|'user'} → samme som GET.
//                             Ikke-admin: bare egne valg for chat/sok/glimt/brief, rules.think og params.temperature (scope user). 400 {error, errors[]} ved ugyldige verdier.
// GET  /jobs?limit=&kind=&task= → {running:[job], queued:[job], recent:[job], paused}; med Accept: text/event-stream eller ?stream=1:
//                             SSE «jobs» (samme liste) og så «job» per endring.
//      job = {id, task, taskName, kind, title, model, provider, status:'run'|'queue'|'ok'|'fail'|'cancelled', progress, step, partial,
//             startedAt, ms, tokens:{in,out}, costKr, error, fallbackFrom, ref, retryable, cancellable}
// POST /jobs/:id/cancel → {ok, status} · POST /jobs/:id/retry → {ok, jobId} · DELETE /jobs → {ok, removed} (Tøm historikk)
// POST /queue/pause {paused} → {paused} (admin; gjelder bakgrunnsjobber, interaktive kall går alltid)
// GET  /usage?days=1|7|30[&all=1] → se usage() i ai-run.js
// GET  /keys               → {providers:[{id, name, set, tail, source?, url?, model?, keys?, link}]}
// PUT  /keys/:provider {key?, url?, model?} → samme (admin). key:'' fjerner. Svaret har aldri nøkkelen.
// POST /keys/:provider/test → {ok, state, ms, model, error}
// GET  /tokens · POST /tokens {name} → {id, name, token (vises én gang), tail, created} · DELETE /tokens/:id
// POST /selftest           → SSE «result» {task, name, model, provider, ok, ms, error, fix} per rute, så «done» {ok, failed, total}.
//                             Med Accept: application/json → {ok, failed, total, results}. Bruker ingen brukerdata.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth.js';
import { db, OWNER } from './db.js';
import { settings as fhSettings, saveSettings, secret, setSecret, secretSource } from './finans/db.js';
import { geminiKeys } from './finans/gemini-keys.js';
import * as ai from './ai-run.js';
import { gateLoad, gateUnload, loadedModels, gateState, keepAliveFor, GateError, backendConfig, thinkLeaks, clearThinkLeak, testOpenWebuiModels, maskSecrets } from './ai-gate.js'; // prompt 43/44: alle AI-kall via gaten
import { updateConfig } from './settings.js';
import { webSearch, webSettings, clearWebCache, PROVIDERS as WEB_PROVIDERS, PROVIDER_NAME as WEB_NAME } from './web-search.js'; // prompt 44
import { getAzureRegion, setAzureRegion } from './glimt35.js'; // prompt 35: Azure-region for TTS
import { hostHw, envHw, hwOut, fit38, recommendFor, SUGGESTED_MODELS, TIMEOUTS, FIT_LABEL } from './aihw38.js'; // prompt 38: Mac mini M4

const api = new Hono();
api.use('*', authOrToken);
const bad = (c, error, code = 400, extra = {}) => c.json({ error, ...extra }, code);
const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan endre AI-oppsettet', 403); await next(); };
const wantsSse = (c) => c.req.query('stream') === '1' || /text\/event-stream/.test(c.req.header('accept') ?? '');

/* ---------------- GPU og Ollama ---------------- */

// Prompt 38: maskinen er Ollama-verten (standard Mac mini M4, 16 GB samlet minne → ca. 10,7 GB til modeller), ikke «RTX 2080».
// AI_GPU_NAME / AI_GPU_VRAM_GB overstyrer fortsatt (eldre oppsett med eget grafikkort).
const gpu = () => { const hw = envHw(); return { name: process.env.AI_GPU_NAME || `${hw.chip ?? hw.model} GPU`, vramGb: Number(process.env.AI_GPU_VRAM_GB) > 0 ? Number(process.env.AI_GPU_VRAM_GB) : hw.gpuBudgetGb, unified: !process.env.AI_GPU_NAME && hw.unified }; };
/** Prompt 38: PASSER ≤ 8 GB, TRANGT ≤ 10,5 GB (bare én om gangen), FOR STOR over (av GPU-budsjettet, se aihw38.js). */
export const fitOf = (sizeGb, vramGb = gpu().vramGb) => fit38(sizeGb, vramGb);
let F = (u, i) => fetch(u, i);
export const _setAiApiFetch = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };
const base = () => String(fhSettings(OWNER).ollamaUrl || '').replace(/\/+$/, '');
async function ollamaJson(path, { method = 'GET', body, timeout = 5000 } = {}) {
  let r;
  try { r = await F(`${base()}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) }); }
  catch (e) { throw Object.assign(new Error(`Ollama kan ikke nås på ${base()} (${e.cause?.code || e.name})`), { status: 502 }); }
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { /* tekst */ }
  if (!r.ok) throw Object.assign(new Error(`Ollama svarte ${r.status}${j?.error ? `: ${j.error}` : ''}`), { status: r.status === 404 ? 404 : 502 });
  return j ?? {};
}
// Prompt 43: /api/ps via gaten (kort cache, samme som køen bruker for å se hva som er lastet).
async function loaded() {
  return (await loadedModels({ base: base(), fetch: F, force: true })) ?? [];
}

/* ---------------- Status ---------------- */

api.get('/status', async (c) => {
  const u = c.get('user');
  const st = await ai.providerStatus({ user: u, force: c.req.query('fresh') === '1' });
  const inv = await ai.ollamaInventory();
  const ps = inv.ok && !inv.mock ? await loaded() : [];
  let version = null;
  if (inv.ok && !inv.mock) { try { version = (await ollamaJson('/api/version', { timeout: 2500 })).version ?? null; } catch { /* valgfritt */ } }
  const vramUsedGb = Math.round(ps.reduce((a, m) => a + (m.size_vram ?? 0), 0) / 1e8) / 10, diskGb = Math.round(inv.models.reduce((a, m) => a + (m.sizeGb ?? 0), 0) * 10) / 10;
  // Prompt 38: maskinkortet (Mac mini M4 · 16 GB · 2 TB ekstern disk), anbefalinger og tidsavbrudd for lasting fra disk.
  const hw = hwOut(await hostHw({ force: c.req.query('fresh') === '1' }), { modelsGb: diskGb, vramUsedGb, ollamaOk: inv.ok, modelCount: inv.models.length, mock: !!inv.mock });
  return c.json({ ...st, server: { url: base() || null, version, gpu: gpu(), vramUsedGb, diskGb, loaded: ps.map((m) => m.name ?? m.model), hw },
    recommend: recommendFor(hw, ai.routing(OWNER)), suggested: SUGGESTED_MODELS, timeouts: TIMEOUTS, warnings: [...(st.warnings ?? []), ...hw.warnings], budget: ai.budgetState() }, 200, { 'Cache-Control': 'no-store' });
});

/* ---------------- Modeller ---------------- */

const lastUsed = () => Object.fromEntries(db.prepare("SELECT model, max(ts) AS ts FROM ai_runs WHERE provider='ollama' GROUP BY model").all().map((r) => [r.model, new Date(r.ts).toISOString()]));
api.get('/models', async (c) => {
  const inv = await ai.ollamaInventory({ force: c.req.query('fresh') === '1' });
  const ps = inv.ok && !inv.mock ? await loaded() : [];
  const lu = lastUsed(), r = ai.routing(c.get('user'));
  const installed = inv.models.map((m) => {
    const p = ps.find((x) => (x.name ?? x.model) === m.name);
    return { id: m.name, name: m.name, sizeGb: m.sizeGb, quant: m.quant, params: m.params, family: m.family, kind: m.kind, loaded: !!p,
      vramGb: p ? Math.round((p.size_vram ?? 0) / 1e8) / 10 : null, expiresAt: p?.expires_at ?? null, lastUsed: lu[m.name] ?? null, fit: fitOf(m.sizeGb), fitLabel: FIT_LABEL[fitOf(m.sizeGb)] ?? null };
  });
  const cloud = ai.CLOUD_MODELS.map((m) => ({ ...m, on: r.cloudOn[m.id] !== false, available: m.provider === 'gemini' ? geminiKeys().length > 0 : !!secret(m.provider === 'groq' ? 'groqKey' : 'openrouterKey') }));
  return c.json({ ok: inv.ok, ...(inv.ok ? {} : { error: inv.err }), url: base() || null, gpu: gpu(), hw: envHw(), installed, pulls: pullsOut(), cloud, defaults: { chat: r.tasks.chat.model || null } }, 200, { 'Cache-Control': 'no-store' });
});

// Nedlastinger: navn → {model, status, completed, total, pct, mbps, done, error, started, ctrl}
const pulls = new Map();
const pullOut = (p) => ({ model: p.model, status: p.status, completed: p.completed, total: p.total, pct: p.total ? Math.round((p.completed / p.total) * 100) : null, mbps: p.mbps, done: p.done, error: p.error, started: p.started });
const pullsOut = () => [...pulls.values()].map(pullOut);
const MODEL_RE = /^[a-z0-9][a-z0-9._\-/]*(?::[a-z0-9._\-]+)?$/i;
function startPull(model) {
  const cur = pulls.get(model);
  if (cur && !cur.done) return cur;
  const p = { model, status: 'starter', completed: 0, total: 0, mbps: null, done: false, error: null, started: Date.now(), ctrl: new AbortController(), subs: new Set() };
  pulls.set(model, p);
  const emit = () => { for (const fn of p.subs) { try { fn(pullOut(p)); } catch { /* */ } } };
  (async () => {
    let lastAt = Date.now(), lastBytes = 0;
    try {
      const res = await F(`${base()}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, name: model, stream: true }), signal: p.ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Ollama svarte ${res.status}${res.ok ? '' : `: ${(await res.text().catch(() => '')).slice(0, 160)}`}`);
      const dec = new TextDecoder(); let buf = '';
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.error) throw new Error(m.error);
          p.status = m.status ?? p.status;
          if (m.total) { p.total = m.total; p.completed = m.completed ?? p.completed; }
          const now = Date.now();
          if (now - lastAt >= 1000) { p.mbps = Math.round(((p.completed - lastBytes) / 1e6 / ((now - lastAt) / 1000)) * 10) / 10; lastAt = now; lastBytes = p.completed; }
          emit();
        }
      }
      p.status = 'ferdig'; p.completed = p.total;
      ai.invalidateInventory(); ai.invalidateStatus();
    } catch (e) {
      p.error = p.ctrl.signal.aborted ? 'Avbrutt' : e.cause?.code ? `Ollama kan ikke nås (${e.cause.code})` : e.message; p.status = p.ctrl.signal.aborted ? 'avbrutt' : 'feil';
    } finally { p.done = true; emit(); p.subs.clear(); }
  })();
  return p;
}
api.post('/models/pull', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const model = String(b?.model ?? b?.name ?? '').trim();
  if (!MODEL_RE.test(model) || model.length > 80) return bad(c, 'Ugyldig modellnavn');
  const p = startPull(model);
  if (!wantsSse(c) && c.req.query('stream') === '0') return c.json(pullOut(p), 202);
  return streamSSE(c, async (s) => {
    await s.writeSSE({ event: 'progress', data: JSON.stringify(pullOut(p)) });
    if (p.done) return;
    await new Promise((resolve) => {
      const fn = (v) => { s.writeSSE({ event: 'progress', data: JSON.stringify(v) }).catch(() => {}); if (v.done) { p.subs.delete(fn); resolve(); } };
      p.subs.add(fn);
      s.onAbort(() => { p.subs.delete(fn); resolve(); }); // nedlastingen fortsetter
    });
  });
});
api.get('/models/pulls', (c) => c.json(pullsOut()));
api.delete('/models/pulls/:model', adminOnly, (c) => {
  const p = pulls.get(decodeURIComponent(c.req.param('model')));
  if (!p) return bad(c, 'Fant ikke nedlastingen', 404);
  if (!p.done) p.ctrl.abort();
  else pulls.delete(p.model);
  return c.json({ ok: true });
});
api.put('/models/default', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const model = String(b?.model ?? '').trim();
  if (!model || model.length > 120) return bad(c, 'Velg en modell');
  const u = c.get('user');
  if (b.scope === 'server') {
    if (!isAdmin(u)) return bad(c, 'Bare administratorer kan endre serverstandarden', 403);
    const r = ai.routing(OWNER); r.tasks.chat.model = model; ai.saveServerRouting(stripOwn(r));
  } else ai.saveUserRouting(u, { tasks: { chat: { model, fallback: ai.routing(u).tasks.chat.fallback } } });
  return c.json(await routingOut(u));
});
for (const act of ['load', 'unload']) {
  api.post(`/models/:id/${act}`, adminOnly, async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    if (!MODEL_RE.test(id)) return bad(c, 'Ugyldig modellnavn');
    // Prompt 43: via Ollama-gaten. Last inn = modellens keep_alive (eller params.keepAlive når den er 0, så knappen virker);
    // Last ut venter til ingen forespørsel mot modellen pågår (aldri midt i et svar).
    const p = ai.routing(OWNER).params;
    const keep = keepAliveFor(id, p);
    try {
      if (act === 'load') await gateLoad(id, { base: base(), fetch: F, priority: 'interactive', keepAlive: keep === 0 ? p.keepAlive || '5m' : keep, loadMs: 120_000, retries: 0, label: 'Last inn' });
      else await gateUnload(id, { base: base(), fetch: F });
      ai.invalidateStatus();
      return c.json({ ok: true, model: id, loaded: act === 'load' });
    } catch (e) { return bad(c, e instanceof GateError ? `Ollama: ${e.message}` : e.message, e.status === 404 ? 404 : 502); }
  });
}
api.delete('/models/:id', adminOnly, async (c) => {
  const id = decodeURIComponent(c.req.param('id'));
  if (!MODEL_RE.test(id)) return bad(c, 'Ugyldig modellnavn');
  try { await ollamaJson('/api/delete', { method: 'DELETE', body: { model: id, name: id }, timeout: 15_000 }); }
  catch (e) { return bad(c, e.message, e.status ?? 502); }
  ai.invalidateInventory(); ai.invalidateStatus();
  pulls.delete(id);
  return c.json({ ok: true });
});
api.put('/cloud', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (typeof b?.id !== 'string' || typeof b?.on !== 'boolean') return bad(c, 'Forventet {id, on}');
  const r = ai.routing(OWNER); r.cloudOn[b.id] = b.on; ai.saveServerRouting(stripOwn(r));
  return c.json({ cloud: ai.routing(OWNER).cloudOn });
});

// Utvalg fra ollama.com/library med omtrentlig størrelse (q4). Alt annet kan skrives inn som navn og lastes ned direkte.
const LIB = [['qwen3:8b', 'Qwen 3 · rask tekst og verktøy', 5.2, 'tekst'], ['qwen3:14b', 'Qwen 3 · resonnering og verktøy', 9.3, 'tekst'], ['gemma3:4b', 'Gemma 3 · liten med bilder', 3.3, 'bilde'],
  ['gemma3:12b', 'Gemma 3 · sterk norsk, leser bilder', 8.1, 'bilde'], ['gemma4:latest', 'Gemma 4 · Glimt og Finans · spør', 9.6, 'bilde'], ['gemma3:27b', 'Gemma 3 · stor', 17, 'bilde'], ['llama3.2:3b', 'Llama 3.2 · liten og rask', 2.0, 'tekst'], ['llama3.1:8b', 'Llama 3.1 · allsidig', 4.9, 'tekst'],
  ['mistral-nemo:12b', 'Mistral Nemo · europeiske språk', 7.1, 'tekst'], ['mistral-small3.2', 'Mistral Small 3.2 · rask med verktøy', 15, 'tekst'], ['phi4:14b', 'Microsoft Phi-4 · liten og skarp', 9.1, 'tekst'],
  ['qwen2.5vl:7b', 'Qwen 2.5 VL · leser kvitteringer og bilder', 6.0, 'bilde'], ['minicpm-v', 'MiniCPM-V · bilde på lite minne', 5.5, 'bilde'], ['llava:13b', 'LLaVA · bildebeskrivelse', 8.0, 'bilde'],
  ['deepseek-r1:8b', 'DeepSeek R1 · tenker før den svarer', 5.2, 'resonnering'], ['deepseek-r1:14b', 'DeepSeek R1 · 14B', 9.0, 'resonnering'], ['llama3.3:70b', 'Meta Llama 3.3 · stor allrounder', 43, 'tekst'],
  ['nomic-embed-text', 'Nomic · embeddings for kunnskapsbasen', 0.27, 'embedding'], ['bge-m3', 'BGE-M3 · flerspråklige embeddings', 1.2, 'embedding'], ['mxbai-embed-large', 'mxbai · større embeddings', 0.67, 'embedding']];
api.get('/library', async (c) => {
  const q = String(c.req.query('q') ?? '').trim().toLowerCase().slice(0, 80), cat = c.req.query('cat');
  const inv = await ai.ollamaInventory();
  const has = (id) => inv.models.some((m) => m.name === id || m.name === `${id}:latest`);
  let items = LIB.filter(([id, d, , k]) => (!q || id.includes(q) || d.toLowerCase().includes(q)) && (!cat || cat === 'alle' || k === cat)).map(([id, desc, sizeGb, k]) => ({ id, desc, sizeGb, cat: k, fit: fitOf(sizeGb), fitLabel: FIT_LABEL[fitOf(sizeGb)] ?? null, installed: has(id) }));
  if (q && MODEL_RE.test(q) && !items.some((x) => x.id === q)) items = [{ id: q, desc: 'Skriv inn modellnavnet fra ollama.com/library', sizeGb: null, cat: null, fit: null, installed: has(q), custom: true }, ...items];
  return c.json({ gpu: gpu(), hw: envHw(), items });
});

/* ---------------- Ruting ---------------- */

const stripOwn = (r) => { const { own, ...rest } = r; return rest; };
async function routingOut(u) {
  const r = ai.routing(u);
  const inv = await ai.ollamaInventory();
  const tasks = [];
  for (const t of ai.AI_TASKS) {
    let res = null;
    try { res = t.id === 'bar' && ai.providerOf(r.tasks.bar.model).provider === 'roboflow' ? null : await ai.resolveTask(t.id, { user: u }); } catch { res = null; }
    const first = res?.list[0];
    tasks.push({ ...t, model: r.tasks[t.id].model, fallback: r.tasks[t.id].fallback, own: !!r.own[t.id], resolved: first?.id ?? (t.id === 'bar' ? r.tasks.bar.model || 'zbar' : null),
      provider: first?.provider ?? null, warning: res?.warnings?.length ? `${res.warnings.join(' · ')}${res.warnings.some((w) => /finnes ikke/.test(w)) ? ' · bytt' : ''}` : null,
      notice: res?.notices?.[0] ?? null, error: res && !first ? res.reason : null,
      finCloud: !!(t.fin && first && ai.isCloud(first.provider)) });
  }
  const models = [...inv.models.map((m) => ({ id: m.name, provider: 'ollama', local: true, kind: m.kind })),
    ...ai.CLOUD_MODELS.filter((m) => r.cloudOn[m.id] !== false).map((m) => ({ id: m.id, provider: m.provider, local: false, kind: m.vision ? 'bilde' : 'tekst' }))];
  return { tasks, rules: r.rules, params: r.params, budget: { ...r.budget, ...ai.budgetState(r) }, cloudOn: r.cloudOn, options: { keepAlive: ai.KEEP_ALIVE, numCtx: ai.NUM_CTX, modelKeepAlive: ai.MODEL_KEEP_ALIVE }, // prompt 43: valgene per modell
    models, admin: isAdmin(u), ollama: { ok: inv.ok, error: inv.err }, warnings: tasks.filter((t) => t.warning).map((t) => `${t.name}: ${t.warning}`) };
}
api.get('/routing', async (c) => {
  const out = await routingOut(c.get('user'));
  if (c.req.query('scope') === 'finans' || c.req.query('scope') === 'finance') return c.json(await finansRouting(c.get('user'), out), 200, { 'Cache-Control': 'no-store' });
  return c.json(out, 200, { 'Cache-Control': 'no-store' });
});
api.put('/routing', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad(c, 'Forventet {tasks?, rules?, params?, budget?, cloudOn?}');
  const errors = [];
  const admin = isAdmin(u), scope = b.scope === 'user' || !admin ? 'user' : 'server';
  if (scope === 'user') {
    const extra = [...Object.keys(b.tasks ?? {}).filter((k) => !ai.AI_TASKS.find((t) => t.id === (ai.TASK_ALIAS[k] ?? k))?.personal),
      ...Object.keys(b.rules ?? {}).filter((k) => k !== 'think'), ...Object.keys(b.params ?? {}).filter((k) => k !== 'temperature'), ...(b.budget ? ['budget'] : []), ...(b.cloudOn ? ['cloudOn'] : [])];
    if (extra.length) return bad(c, `Bare administratorer kan endre ${extra.join(', ')}`, 403);
    const clean = ai.cleanRouting(b, ai.routing(u), errors);
    if (errors.length) return bad(c, errors[0], 400, { errors });
    ai.saveUserRouting(u, { tasks: Object.fromEntries(Object.keys(b.tasks ?? {}).map((k) => [ai.TASK_ALIAS[k] ?? k, clean.tasks[ai.TASK_ALIAS[k] ?? k]])), rules: b.rules, params: b.params?.temperature !== undefined ? { temperature: clean.params.temperature } : {} });
  } else {
    const clean = ai.cleanRouting(b, stripOwn(ai.routing(OWNER)), errors);
    if (errors.length) return bad(c, errors[0], 400, { errors });
    ai.saveServerRouting(clean);
  }
  return c.json(await routingOut(u));
});

/* ---------------- Prompt 38: «Hvilken modell gjør hva i Finans» ---------------- */
// GET /api/ai/routing?scope=finans → samme som /routing, men tasks er alltid de 4 Finans-radene:
//   {id, name, desc, model, fallback, isDefault, default:{model, fallback}, resolved, provider,
//    options:[{id, label, local, provider, tag:'LOKAL'|'SKY', installed, missing?}], warning, cloudBlocked}
//   + scope:'finans', finLocal, empty (ingen modeller installert eller tilkoblet), emptyText, installRoute:'ai/modeller'.
export const FIN_DEFAULTS = { rc: { model: 'qwen2.5vl:7b', fallback: 'gemini-2.5-flash' }, kat: { model: 'llama3.2:3b', fallback: 'llama-3.3-70b-versatile' },
  fsok: { model: 'gemma4:latest', fallback: 'gemini-2.5-flash' }, bar: { model: 'roboflow/kvittering/1', fallback: 'qwen2.5vl:7b' } };
async function finansRouting(u, out) {
  const inv = await ai.ollamaInventory();
  const r = ai.routing(u);
  const finLocal = !!r.rules.finLocal;
  const keyOk = (p) => (p === 'gemini' ? geminiKeys().length > 0 : p === 'groq' ? !!secret('groqKey') : p === 'openrouter' ? !!secret('openrouterKey') : p === 'roboflow' ? !!secret('roboflowKey') : false);
  const local = inv.models.filter((m) => m.kind !== 'embedding').map((m) => ({ id: m.name, label: m.name, local: true, provider: 'ollama', tag: 'LOKAL', installed: true, kind: m.kind }));
  const cloud = ai.CLOUD_MODELS.filter((m) => r.cloudOn[m.id] !== false && keyOk(m.provider)).map((m) => ({ id: m.id, label: m.id, local: false, provider: m.provider, tag: 'SKY', installed: true, kind: m.vision ? 'bilde' : 'tekst' }));
  const base = [...local, ...cloud];
  const rows = ['rc', 'kat', 'fsok', 'bar'].map((id) => {
    const t = ai.AI_TASKS.find((x) => x.id === id), o = out.tasks.find((x) => x.id === id) ?? {};
    const own = r.tasks[id] ?? { model: '', fallback: '' }, d = FIN_DEFAULTS[id];
    const model = own.model || d.model, fallback = own.fallback || d.fallback;
    const opts = base.filter((m) => (t.kind === 'vision' ? m.kind === 'bilde' || !m.local : true)).map(({ kind, ...m }) => m);
    if (id === 'bar' && keyOk('roboflow')) opts.unshift({ id: model.startsWith('roboflow/') ? model : 'roboflow/kvittering/1', label: model.startsWith('roboflow/') ? model : 'roboflow/kvittering/1', local: false, provider: 'roboflow', tag: 'SKY', installed: true });
    for (const v of [model, fallback]) if (v && !opts.some((x) => x.id === v || x.id === `${v}:latest`)) { const p = ai.providerOf(v).provider; opts.push({ id: v, label: v, local: p === 'ollama', provider: p, tag: p === 'ollama' ? 'LOKAL' : 'SKY', installed: false, missing: true }); }
    const cloudM = model && ai.isCloud(ai.providerOf(model).provider), cloudF = fallback && ai.isCloud(ai.providerOf(fallback).provider);
    const warns = [];
    if (finLocal && cloudM) warns.push(`«Finansdata forlater aldri huset» er på, men ${model} er en sky-modell. Velg en lokal modell.`);
    else if (finLocal && cloudF) warns.push(`Reserven ${fallback} er i skyen og brukes ikke mens «Finansdata forlater aldri huset» er på.`);
    if (o.warning) warns.push(o.warning);
    return { id, name: t.name, desc: t.desc, model, fallback, isDefault: !own.model && !own.fallback, default: d, resolved: o.resolved ?? null, provider: o.provider ?? null,
      options: opts, warning: warns.length ? warns.join(' · ') : null, cloudBlocked: !!(finLocal && (cloudM || cloudF)), finCloud: !!o.finCloud };
  });
  const empty = !base.length;
  return { ...out, scope: 'finans', tasks: rows, finLocal, empty, emptyText: empty ? 'Ingen modeller ennå' : null, installRoute: 'ai/modeller', installLabel: 'Installer modell ›' };
}

/* ---------------- Jobber ---------------- */

/** Prompt 40: jobblisten + grupperte feil (groups), «nye feil siden sist» (unseenFailed), tidsgrensene og køen. */
function jobs40(u, o) {
  const l = ai.jobList(u, o);
  const r = ai.routing(OWNER).params;
  return { ...l, groups: ai.jobGroups(l.recent), unseenFailed: ai.unseenFailed(u),
    timeouts: { loadTimeout: r.loadTimeout ?? 90, responseTimeout: r.responseTimeout ?? 60, responseTimeoutImage: r.responseTimeoutImage ?? 120,
      firstTokenTimeout: r.firstTokenTimeout ?? 30, idleTimeout: r.idleTimeout ?? 30, idleTimeoutImage: r.idleTimeoutImage ?? 60 },
    queue: ai.queueState(), gate: gateState() };
}
api.get('/jobs', (c) => {
  const u = c.get('user');
  const o = { limit: c.req.query('limit') ?? 50, kind: c.req.query('kind') || null, task: c.req.query('task') || null };
  if (!wantsSse(c)) return c.json(jobs40(u, o), 200, { 'Cache-Control': 'no-store' });
  return streamSSE(c, async (s) => {
    await s.writeSSE({ event: 'jobs', data: JSON.stringify(jobs40(u, o)) });
    await new Promise((resolve) => {
      const off = ai.subscribeJobs(u, (j) => { if (!o.task || j.task === ai.taskId(o.task)) s.writeSSE({ event: 'job', data: JSON.stringify(j) }).catch(() => {}); }, o.kind);
      const ping = setInterval(() => s.writeSSE({ event: 'ping', data: '{}' }).catch(() => {}), 25_000);
      s.onAbort(() => { off(); clearInterval(ping); resolve(); });
    });
  });
});
// Prompt 40: POST /jobs/seen → {ok, seenAt, unseenFailed:0} (tallet på Jobber-fanen teller bare nye feil siden sist).
api.post('/jobs/seen', (c) => c.json(ai.markJobsSeen(c.get('user'))));
// Prompt 40: POST /jobs/retry {ids:[…]} | {group:'response_timeout:15'} → {ok, started:[{id, task?}], skipped:[{id, reason}]} (én om gangen, nye tidsgrenser).
api.post('/jobs/retry', async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  if (!Array.isArray(b.ids) && typeof b.group !== 'string') return bad(c, 'Send {ids:[…]} eller {group}');
  const { done, ...r } = ai.jobsRetry(c.get('user'), { ids: b.ids, group: b.group ?? null });
  if (b.wait === true) await done;
  return c.json(r);
});
api.post('/jobs/:id/cancel', (c) => { const r = ai.jobCancel(c.req.param('id'), c.get('user')); return r ? c.json(r, r.ok ? 200 : 409) : bad(c, 'Fant ikke jobben', 404); });
api.post('/jobs/:id/retry', async (c) => { const r = await ai.jobRetry(c.req.param('id'), c.get('user')); return r ? c.json(r) : bad(c, 'Jobben kan ikke prøves igjen (for gammel eller laget av en annen modul)', 409); });
api.delete('/jobs', (c) => c.json({ ok: true, removed: ai.jobsClear(c.get('user')) }));
// Prompt 43: GET /gate → {current, running:[], waiting:[{model, n, oldestMs}], loaded:[fra /api/ps], paused, hold, concurrency}
api.get('/gate', async (c) => { await loadedModels({ base: base(), fetch: F }).catch(() => null); return c.json(gateState(), 200, { 'Cache-Control': 'no-store' }); });
api.post('/queue/pause', adminOnly, async (c) => { const b = await c.req.json().catch(() => ({})); return c.json({ paused: ai.setQueuePaused(b?.paused !== false) }); });

/* ---------------- Forbruk ---------------- */

api.get('/usage', (c) => c.json(ai.usage(c.get('user'), { days: c.req.query('days') ?? 30, all: c.req.query('all') === '1' && isAdmin(c.get('user')) })));

/* ---------------- API og nøkler ---------------- */

const KEYS = { gemini: 'geminiKey', groq: 'groqKey', openrouter: 'openrouterKey', roboflow: 'roboflowKey', openai: 'openaiKey', elevenlabs: 'elevenlabsKey', azure: 'azureSpeechKey' }; // prompt 35: TTS-nøkler
const LINKS = { openai: 'https://platform.openai.com/api-keys', elevenlabs: 'https://elevenlabs.io/app/settings/api-keys', azure: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices', ollama: 'https://ollama.com/library', gemini: 'https://aistudio.google.com/apikey', groq: 'https://console.groq.com/keys', openrouter: 'https://openrouter.ai/keys', roboflow: 'https://app.roboflow.com/settings/api' };
const tail = (s) => (s ? String(s).slice(-4) : null);
function keysOut() {
  const st = fhSettings(OWNER);
  return { providers: [
    { id: 'ollama', name: 'Ollama', set: !!base(), url: base() || null, tail: null, link: LINKS.ollama },
    { id: 'gemini', name: 'Gemini', set: geminiKeys().length > 0, tail: tail(secret('geminiKey')), source: secretSource('geminiKey'), keys: geminiKeys().length, link: LINKS.gemini },
    { id: 'groq', name: 'Groq', set: !!secret('groqKey'), tail: tail(secret('groqKey')), source: secretSource('groqKey'), link: LINKS.groq },
    { id: 'openrouter', name: 'OpenRouter', set: !!secret('openrouterKey'), tail: tail(secret('openrouterKey')), source: secretSource('openrouterKey'), optional: true, link: LINKS.openrouter },
    { id: 'roboflow', name: 'Roboflow', set: !!secret('roboflowKey'), tail: tail(secret('roboflowKey')), source: secretSource('roboflowKey'), model: st.roboflowModel || st.roboflowBarcodeModel || null, link: LINKS.roboflow },
    // Prompt 35: stemmemotorer for Glimt (POST /api/tts). Azure trenger også region.
    { id: 'openai', name: 'OpenAI (stemme)', set: !!secret('openaiKey'), tail: tail(secret('openaiKey')), source: secretSource('openaiKey'), kind: 'tts', model: 'gpt-4o-mini-tts', link: LINKS.openai },
    { id: 'elevenlabs', name: 'ElevenLabs (stemme)', set: !!secret('elevenlabsKey'), tail: tail(secret('elevenlabsKey')), source: secretSource('elevenlabsKey'), kind: 'tts', model: 'eleven_multilingual_v2', link: LINKS.elevenlabs },
    { id: 'azure', name: 'Azure Speech (stemme)', set: !!secret('azureSpeechKey'), tail: tail(secret('azureSpeechKey')), source: secretSource('azureSpeechKey'), kind: 'tts', region: getAzureRegion() || null, link: LINKS.azure },
  ] };
}
api.get('/keys', (c) => c.json(keysOut()));
api.put('/keys/:provider', adminOnly, async (c) => {
  const p = c.req.param('provider');
  if (p !== 'ollama' && !KEYS[p]) return bad(c, 'Ukjent leverandør', 404);
  const b = await c.req.json().catch(() => ({}));
  if (p === 'ollama') {
    const url = String(b?.url ?? '').trim();
    if (!/^https?:\/\/[^\s/]+(?::\d+)?\/?$/.test(url)) return bad(c, 'Skriv adressen som http://192.168.1.30:11434');
    saveSettings({ ollamaUrl: url.replace(/\/+$/, '') }, OWNER);
  } else {
    if (b?.key !== undefined) {
      const key = String(b.key ?? '').trim();
      if (key && (key.length < 8 || key.length > 300 || /\s/.test(key))) return bad(c, 'Nøkkelen ser ikke riktig ut');
      setSecret(KEYS[p], key, OWNER);
    }
    if (p === 'roboflow' && b?.model !== undefined) saveSettings({ roboflowModel: String(b.model ?? '').trim().slice(0, 120) }, OWNER);
    if (p === 'azure' && b?.region !== undefined) {
      const region = String(b.region ?? '').trim().toLowerCase();
      if (region && !/^[a-z0-9]{3,30}$/.test(region)) return bad(c, 'Regionen ser ikke riktig ut (f.eks. norwayeast eller westeurope)');
      setAzureRegion(region);
    }
  }
  ai.invalidateInventory(); ai.invalidateStatus();
  return c.json({ ...keysOut(), selftestSuggested: true });
});
api.post('/keys/:provider/test', async (c) => {
  const p = c.req.param('provider');
  if (['openai', 'elevenlabs', 'azure'].includes(p)) { // prompt 35: ekte kort opplesning med motoren
    const { speakWith } = await import('./glimt35.js');
    const t0 = Date.now();
    try { const r = await speakWith(c.get('user'), p, 'Hei! Jeg er Glimt.'); return c.json({ ok: true, state: 'ok', label: 'Svarer', ms: Date.now() - t0, model: r.model, error: null }); }
    catch (e) { return c.json({ ok: false, state: 'off', label: 'Svarer ikke', ms: Date.now() - t0, model: null, error: e.message }); }
  }
  const st = await ai.providerStatus({ user: c.get('user'), force: true });
  const x = st.providers.find((v) => v.id === p);
  if (!x) return bad(c, 'Ukjent leverandør', 404);
  return c.json({ ok: x.state === 'ok', state: x.state, label: x.label, ms: x.ms, model: x.model, error: x.error });
});

/* ---------------- Prompt 44: backend (Open WebUI / Ollama) og nettsøk ---------------- */
// GET  /backend → {mode:'auto'|'openwebui'|'ollama', effective, note, openwebui:{url, configured}, ollama:{url}, thinkLeaks:[{model, at}],
//                  web:{order, openwebui:{configured}, searxng:{url}, brave:{configured}, ddg:{on}}, providers:[{id, name}]}  (aldri nøkler)
// PUT  /backend {mode?, openwebuiUrl?, openwebuiKey?, ollamaUrl?, web?:{order?, searxngUrl?, braveKey?, ddg?}} (admin) → samme som GET
// POST /backend/test {which:'openwebui'|'ollama'} → {ok, ms, models?, version?, error?}  (Open WebUI: /api/models · Ollama: /api/version og /api/tags)
// DELETE /backend/think-leak[?model=] (admin) → glem «Open WebUI slo ikke av tenking»
// POST /websearch/test {q} → {query, hits:[{title, url, snippet, source, published?}], provider, providerName, tried:[…], ms}
function backendOut() {
  const c = backendConfig();
  return { ...c, thinkLeaks: Object.entries(thinkLeaks()).map(([model, v]) => ({ model, at: v?.at ? new Date(v.at).toISOString() : null })), web: webSettings(),
    webProviders: WEB_PROVIDERS.map((id) => ({ id, name: WEB_NAME[id] })) };
}
// Serveroppsettet (adresser, kilder) er bare for admin; andre ser bare hvilken backend som brukes.
api.get('/backend', (c) => {
  const o = backendOut();
  if (isAdmin(c.get('user'))) return c.json(o, 200, { 'Cache-Control': 'no-store' });
  return c.json({ mode: o.mode, effective: o.effective, openwebui: { configured: o.openwebui.configured }, ollama: { configured: !!o.ollama.url }, note: o.note, admin: false }, 200, { 'Cache-Control': 'no-store' });
});
api.put('/backend', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object') return bad(c, 'Forventet {mode?, openwebuiUrl?, openwebuiKey?, ollamaUrl?, web?}');
  const ch = {};
  if (b.mode !== undefined) { const m = String(b.mode ?? '').toLowerCase(); if (!['auto', 'openwebui', 'ollama', ''].includes(m)) return bad(c, 'Backend må være openwebui, ollama eller auto'); ch.ai_backend = m === 'auto' || !m ? null : m; }
  if (b.openwebuiUrl !== undefined) { const u = String(b.openwebuiUrl ?? '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\/[^\s]+$/.test(u)) return bad(c, 'Skriv adressen som http://192.168.1.30:8080'); ch.openwebui_url = u || null; }
  if (b.openwebuiKey !== undefined) { const k = String(b.openwebuiKey ?? '').trim(); if (k && (k.length < 8 || k.length > 400 || /\s/.test(k))) return bad(c, 'Nøkkelen ser ikke riktig ut'); ch.openwebui_key = k || null; }
  const w = b.web && typeof b.web === 'object' ? b.web : {};
  if (w.order !== undefined) { const o = (Array.isArray(w.order) ? w.order : String(w.order).split(',')).map((x) => String(x).trim()).filter(Boolean); if (!o.length || o.some((x) => !WEB_PROVIDERS.includes(x))) return bad(c, `Rekkefølgen kan bare ha ${WEB_PROVIDERS.join(', ')}`); ch.web_order = [...new Set(o)].join(','); }
  if (w.searxngUrl !== undefined) { const u = String(w.searxngUrl ?? '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\/[^\s]+$/.test(u)) return bad(c, 'Skriv SearXNG-adressen som http://192.168.1.30:8888'); ch.searxng_url = u || null; }
  if (w.braveKey !== undefined) { const k = String(w.braveKey ?? '').trim(); if (k && (k.length < 8 || /\s/.test(k))) return bad(c, 'Brave-nøkkelen ser ikke riktig ut'); ch.brave_key = k || null; }
  if (w.ddg !== undefined) ch.web_ddg = w.ddg ? '1' : '0';
  try { if (Object.keys(ch).length) updateConfig(ch, OWNER); } catch (e) { return bad(c, maskSecrets(e.message), e.status ?? 400); }
  if (b.ollamaUrl !== undefined) { const u = String(b.ollamaUrl ?? '').trim(); if (u && !/^https?:\/\/[^\s/]+(?::\d+)?\/?$/.test(u)) return bad(c, 'Skriv adressen som http://192.168.1.30:11434'); saveSettings({ ollamaUrl: u.replace(/\/+$/, '') }, OWNER); }
  clearWebCache(); ai.invalidateInventory(); ai.invalidateStatus();
  return c.json(backendOut());
});
api.post('/backend/test', adminOnly, async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  if (b.which === 'openwebui') { const t = await testOpenWebuiModels({ fetch: F }); return c.json({ which: 'openwebui', ok: t.ok, ms: t.ms, models: t.models, error: t.error ?? null }); }
  if (b.which !== 'ollama') return bad(c, 'which må være openwebui eller ollama');
  if (!base()) return c.json({ which: 'ollama', ok: false, ms: 0, error: 'Ollama-adressen er ikke satt' });
  const t0 = Date.now();
  try {
    const v = await ollamaJson('/api/version');
    const tg = await ollamaJson('/api/tags');
    return c.json({ which: 'ollama', ok: true, ms: Date.now() - t0, version: v.version ?? null, models: (tg.models ?? []).map((m) => m.name ?? m.model) });
  } catch (e) { return c.json({ which: 'ollama', ok: false, ms: Date.now() - t0, error: e.message }); }
});
api.delete('/backend/think-leak', adminOnly, (c) => { clearThinkLeak(c.req.query('model') || null); return c.json(backendOut()); });
api.post('/websearch/test', async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const q = String(b.q ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  if (!q) return bad(c, 'Skriv et søk');
  clearWebCache();
  const r = await webSearch(q);
  return c.json(r);
});

/* ---------------- Glimt-API-nøkler (personlige) ---------------- */

const PREFIX = 'Glimt-API: ';
const fhRoutes = () => import('./finans/routes.js');
api.get('/tokens', (c) => {
  const rows = db.prepare('SELECT * FROM fh_tokens WHERE COALESCE(user_id, ?)=? AND name LIKE ? ORDER BY created DESC').all(OWNER, c.get('user'), `${PREFIX}%`);
  return c.json(rows.map((t) => ({ id: t.id.slice(0, 12), name: t.name.slice(PREFIX.length), tail: null, display: 'fh_pat_••••', created: t.created, lastUsed: t.last_used })));
});
api.post('/tokens', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b?.name ?? '').trim().slice(0, 40) || 'Eget skript';
  const fh = await fhRoutes();
  const a = fh.tokenAccessOf(c);
  const scopes = ['finance:read', 'finance:write'].filter((s) => a?.session || a?.scopes?.has(s));
  if (!scopes.length) return bad(c, 'Krever innlogging', 403);
  const t = fh.issueToken(c.get('user'), { name: PREFIX + name, scopes, expires: null });
  return c.json({ id: t.id, name, token: t.token, tail: t.token.slice(-4), display: `fh_pat_••••${t.token.slice(-4)}`, created: t.created }, 201);
});
api.delete('/tokens/:id', (c) => {
  const n = db.prepare('DELETE FROM fh_tokens WHERE substr(id,1,12)=? AND COALESCE(user_id, ?)=? AND name LIKE ?').run(c.req.param('id'), OWNER, c.get('user'), `${PREFIX}%`).changes;
  return n ? c.json({ ok: true }) : bad(c, 'Fant ikke nøkkelen', 404);
});

/* ---------------- Selvtest ---------------- */

api.post('/selftest', async (c) => {
  const u = c.get('user');
  if (/application\/json/.test(c.req.header('accept') ?? '') && !wantsSse(c)) return c.json(await ai.selftest({ user: u }));
  return streamSSE(c, async (s) => {
    const r = await ai.selftest({ user: u, onResult: (x) => { s.writeSSE({ event: 'result', data: JSON.stringify(x) }).catch(() => {}); } });
    await s.writeSSE({ event: 'done', data: JSON.stringify({ ok: r.ok, failed: r.failed, skipped: r.skipped, total: r.total, health: r.health, groups: r.groups }) });
  });
});

/* ---------------- POST /api/glimt (Kalender web: ✦ Spør) ---------------- */
// POST /api/glimt {prompt, tool?:'calendar'} → {text, kind?, items?, engine, model?, error?, fix?}
//   tool 'calendar': samme svar som GET /api/kalender/search?ai=1 (lokal forståelse først, så ruten «Glimt · kalender»).
//   Ellers: ruten «AI-søk» (ai.run). Feil gir 200 med error og text = «Glimt fikk ikke svar fra {modell}: {feil}».
export const glimtApi = new Hono();
glimtApi.use('*', authOrToken);
glimtApi.post('/', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const prompt = String(b?.prompt ?? b?.q ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!prompt) return bad(c, 'Skriv et spørsmål');
  const u = c.get('user');
  if (b.tool === 'calendar') {
    const { askCalendar } = await import('./calendar-glimt.js');
    const a = await askCalendar(u, prompt);
    return c.json({ text: a.text, kind: a.kind, items: a.items ?? [], free: a.free ?? [], engine: a.engine, ...(a.error ? { error: a.error, fix: a.fix ?? null } : {}) });
  }
  try {
    const out = await ai.run('sok', { user: u, prompt, system: 'Svar på norsk i maks to korte setninger.', numPredict: 160, temperature: 0.3, localOnly: true, title: `Glimt · «${prompt.slice(0, 60)}»` });
    return c.json({ text: out.text, engine: out.provider, model: out.model, ...(out.warnings.length ? { warning: out.warnings.join(' · ') } : {}) });
  } catch (e) { return c.json({ text: e.message, engine: 'none', error: e.message, fix: e.fix ?? null }); }
});

export default api;
