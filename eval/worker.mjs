// Én kjøring av én case i en egen prosess: fersk DATA_DIR, fryst klokke, mocket nett (bortsett fra modellen), seedet testdata.
// Startes av run.mjs: node eval/worker.mjs <case-fil> <resultat.json>   (oppsettet kommer i env EVAL47_CONFIG)
// Skriver {ok, checks, reason, ms, trace} til resultatfila.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freezeClock, TODAY, NOW_MIN } from './lib/clock.mjs';
import { installNet } from './lib/net.mjs';
import { makeFakeModel } from './lib/fake-model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const [caseFile, outFile] = process.argv.slice(2);
const cfg = JSON.parse(process.env.EVAL47_CONFIG ?? '{}');
const t0 = Date.now();

/* ---------------- Miljø (før appen importeres) ---------------- */

const dataDir = mkdtempSync(join(cfg.tmpRoot || tmpdir(), 'glimt-eval-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'eval47-secret-eval47-secret-eval47-secret';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test'; // ingen HTTP-lytter og ingen bakgrunnsjobber (samme som testene)
process.env.TZ = 'Europe/Oslo';
process.env.AI_FALLBACK = 'none'; // aldri sky-reserve (Gemini/Groq) i eval
delete process.env.MOCK_DATA; // MOCK_DATA ville slått av modellen (ai-run/plan/assist) og lagt inn demodata – eksterne data mockes i stedet i lib/net.mjs
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER', 'OLLAMA_MODEL', 'OLLAMA_TEXT_MODEL', 'OPENWEBUI_URL', 'OPENWEBUI_KEY', 'AI_BACKEND', 'AI_GPU_VRAM_GB',
  'BRAVE_KEY', 'SEARXNG_URL', 'RADARR_API_KEY', 'QBIT_PASS', 'PROWLARR_API_KEY', 'JF_KEY', 'PLEX_TOKEN', 'HA_TOKEN', 'HA_URL',
  'OMLX_URL', 'OMLX_API_KEY', 'OMLX_TASKS', 'OMLX_FALLBACK', 'OMLX_MODEL_TEXT', 'OMLX_MODEL_VISION']) delete process.env[k];
process.env.OLLAMA_URL = cfg.ollamaUrl || 'http://ollama.eval-unset:11434';
if (cfg.backend === 'openwebui') { process.env.OPENWEBUI_URL = cfg.url; process.env.OPENWEBUI_KEY = cfg.key ?? ''; process.env.AI_BACKEND = 'openwebui'; }
else process.env.AI_BACKEND = 'ollama';
// Prompt 58: oMLX-motoren for oppgavene i cfg.omlx.tasks (adresse og nøkkel bare i miljøet, aldri lagret i basen).
if (cfg.backend === 'omlx') { process.env.OMLX_URL = cfg.url; process.env.OMLX_API_KEY = cfg.key ?? ''; }
process.env.SONARR_URL = 'http://sonarr.eval:8989';
process.env.SONARR_API_KEY = 'eval-sonarr-key';
process.env.OCR_FALLBACK = process.env.OCR_FALLBACK ?? 'on';
// Prompt 59 (del 4): eval måler med produksjonens standard for «raskere svar» (svar-cache, varm modell, strømming, parallelle verktøy
// – alt på; NODE_ENV=test ville ellers slått av svar-cachen). EVAL_FAST59=off måler uten (alle fire av), for før/etter på samme commit.
process.env.FAST59_DEFAULTS = 'prod';
process.env.FAST59_WARM = process.env.EVAL_FAST59 === 'off' ? '0' : '1';

freezeClock();
const modelHosts = new Set([process.env.OLLAMA_URL, cfg.backend === 'openwebui' || cfg.backend === 'omlx' ? cfg.url : null].filter(Boolean).map((x) => new URL(x).host));
// Prompt 55: Mac-OCR kan kobles på eval med EVAL_MAC_OCR_URL + EVAL_MAC_OCR_KEY (ellers finnes den ikke i eval – fersk DATA_DIR uten nøkkel).
const macUrl = String(process.env.EVAL_MAC_OCR_URL ?? '').replace(/\/+$/, ''), macKey = process.env.EVAL_MAC_OCR_KEY ?? '';
const passHosts = new Set(macUrl ? [(() => { try { return new URL(macUrl).host; } catch { return null; } })()].filter(Boolean) : []);
const net = installNet({ modelHosts, passHosts, fakeModel: cfg.backend === 'mock' ? makeFakeModel() : null });

const { hashPassword } = await import(pathToFileURL(join(REPO, 'server/password.js')).href);
process.env.APP_PASSWORD_HASH = hashPassword('evalpassord47');
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { default: app } = await imp('server/index.js');
const ai = await imp('server/ai-run.js');
const E = await imp('server/glimt45/engine.js');
const W = await imp('server/web-search.js');
const { db, kv } = await imp('server/db.js');
ai._setAiFetch((u, i) => globalThis.fetch(u, i));
W._setWebFetch((u, i) => globalThis.fetch(u, i)); // ellers hopper web-search over SearXNG/Brave/DDG når NODE_ENV=test
E._setClock45({ today: TODAY, nowMin: NOW_MIN });

// Rutingen: samme oppgaver/modeller som i produksjon (se run.mjs: --routing).
ai.migrateOnce();
const r0 = JSON.parse(JSON.stringify(ai.routing('owner')));
if (cfg.routingFull) { for (const k of ['tasks', 'rules', 'params']) if (cfg.routingFull[k]) r0[k] = { ...r0[k], ...cfg.routingFull[k] }; if (cfg.routingFull.chosen55) r0.chosen55 = cfg.routingFull.chosen55; } // prompt 55: eksplisitte valg av llama3.2:3b følger med
for (const [k, v] of Object.entries(cfg.tasks ?? {})) if (r0.tasks[k]) r0.tasks[k] = { model: v.model ?? '', fallback: v.fallback ?? '' };
delete r0.own;
ai.saveServerRouting(r0);
// Prompt 59: --fast59 off = alle fire del 4-valgene av (før/etter på samme commit).
if (process.env.EVAL_FAST59 === 'off') kv.set('owner', 'fast59', { cache: false, warm: false, stream: false, parallel: false });
// Prompt 60: --convo60 off = samtaletilstand, entitetsregister og valg av (før/etter på samme commit).
if (process.env.EVAL_CONVO60 === 'off') kv.set('owner', 'convo60', { state: false, entities: false, choices: false });
ai.invalidateInventory();
if (cfg.omlx) {
  const O = await imp('server/omlx58/config.js');
  const r = O.saveConf58({ engines: Object.fromEntries(cfg.omlx.tasks.map((t) => [t, 'omlx'])), models: { text: cfg.omlx.models.glimt, vision: cfg.omlx.models.rc, ...cfg.omlx.models }, fallbackOllama: !!cfg.omlx.fallback });
  if (!r.ok) throw new Error(`oMLX-oppsett: ${r.error}`);
}


/* ---------------- Innlogging og hjelpere ---------------- */

const login = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'evalpassord47' }) });
const cookie = login.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
if (!cookie) throw new Error(`Innlogging feilet (${login.status})`);
const USER = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
// Prompt 55: miljøet (OCR) – står i resultatet, og run.mjs merker feil som skyldes det som «env» (ikke modellfeil).
const env = { tesseract: false, macOcr: false, notes: [] };
try { env.tesseract = await (await imp('server/study45.js')).tool45('tesseract'); } catch { env.tesseract = false; }
if (macUrl && macKey) {
  try {
    const F = await imp('server/finans/db.js');
    for (const u of [...new Set([USER, F.me(), 'owner'])].filter(Boolean)) { try { F.saveSettings({ macOcrUrl: macUrl }, u); F.setSecret('macOcrKey', macKey, u); } catch { /* */ } }
    env.macOcr = true;
  } catch (e) { env.notes.push(`Mac-OCR kunne ikke settes opp: ${e.message}`); }
}
if (!env.macOcr) env.notes.push('Mac-OCR-nøkkel mangler (sett EVAL_MAC_OCR_URL og EVAL_MAC_OCR_KEY)');
if (!env.tesseract) env.notes.push('Tesseract ikke installert');
if (cfg.userRouting) { kv.set(USER, 'ai_routing_user', cfg.userRouting); ai.invalidateInventory(); } // personlige valg (glimt/sok/chat …) fra produksjonsbrukeren
const effRouting = Object.fromEntries(Object.entries(ai.routing(USER).tasks).map(([k, v]) => [k, cfg.omlx?.tasks?.includes(k) ? `oMLX:${cfg.omlx.models[k]}` : v.model || '(auto)']));
const A = async (path, method = 'GET', body, headers = {}) => {
  const isForm = body instanceof FormData;
  const r = await app.request(path, { method, headers: { cookie, ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const clip = (s, n = 600) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? `${t.slice(0, n)} …` : t; };
const clipObj = (o, n = 1500) => { if (o === undefined) return undefined; const t = JSON.stringify(o ?? null); return t.length <= n ? o : { _avkortet: `${t.slice(0, n)} …` }; };
const FIX = join(HERE, 'fixtures');
const fixture = (n) => JSON.parse(readFileSync(join(FIX, n), 'utf8'));
const steps = [];
let reqN = 0;
const slimAgent = (b) => ({
  reply: b?.reply ?? b?.text ?? null, intent: b?.intent ?? null, module: b?.module ?? null, engine: b?.engine ?? null, model: b?.model ?? null,
  legacyIntent: b?.legacyAnswer?.intent ?? null, legacySource: b?.legacyAnswer?.source ?? null, ask: b?.ask?.question ?? null,
  actions: (b?.actions ?? []).map((x) => ({ tool: x.tool, status: x.status, args: x.args, error: x.error, result: clipObj(x.result) })),
  results: (b?.results ?? []).slice(0, 8).map((x) => ({ kind: x.kind, title: x.title, subtitle: x.subtitle, date: x.date })), ms: b?.ms ?? null,
  traceId: b?.traceId ?? null, cached: !!b?.cached, cache: b?.cache ?? null, // prompt 59
});
/** Prompt 60: feltene for samtaler (conversationId, followUp, choices, confirm) i steget. */
const convoOf60 = (b) => ({ conversationId: b?.conversationId ?? null, followUp: b?.followUp ?? null, choices: b?.choices ?? null, confirm: b?.confirm ? { token: b.confirm.token, summary: b.confirm.summary ?? null } : null });
/** Prompt 59: Glimt-tracen (trace47) for en forespørsel, kort: plan-intent, cache, parallelle grupper og modellkall med tider. */
const glimtTrace = (id) => {
  if (!id) return null;
  const r = db.prepare('SELECT data FROM glimt47_trace WHERE id=?').pluck().get(id);
  if (!r) return null;
  const t = JSON.parse(r);
  return { id: t.id, intent: t.plan?.intent ?? null, engine: t.engine ?? t.plan?.engine ?? null, cache: t.cache ?? null, parallel: t.parallel ?? null, totalMs: t.totalMs ?? null, steps: t.steps,
    convo: t.convo ?? null, entities: t.entities ?? null, // prompt 60
    models: (t.models ?? []).map((m) => ({ step: m.step, model: m.model, ms: m.ms, ok: m.ok, timing: m.timing ?? null, prompt: m.prompt ?? null, think: m.think })) };
};
/** Prompt 59: leser en SSE-strøm (POST /api/glimt/agent/stream) og noterer når hver hendelse kom. → {status, events:[{event, data, at}], firstTokenMs, firstStatusMs} */
async function readSse(res, t0) {
  const events = [];
  const dec = new TextDecoder();
  let buf = '';
  const take = (block) => {
    let event = 'message', data = '';
    for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
    if (!data && event === 'message') return;
    let d = data; try { d = JSON.parse(data); } catch { /* tekst */ }
    events.push({ event, data: d, at: Date.now() - t0 });
  };
  if (res.body?.getReader) {
    const rd = res.body.getReader();
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 2); } }
  } else buf = await res.text();
  buf += dec.decode();
  for (const b of buf.split('\n\n')) if (b.trim()) take(b);
  return { events, firstTokenMs: events.find((e) => e.event === 'token')?.at ?? null, firstStatusMs: events.find((e) => e.event === 'status')?.at ?? null };
}

/** Venter til ingen modellkall er i gang og det har vært stille i 1,5 s (maks EVAL_SETTLE_MS, standard 5 min). */
async function settle(quietMs = 1500, maxMs = +(process.env.EVAL_SETTLE_MS ?? 300_000)) {
  const t = Date.now();
  await new Promise((res) => setTimeout(res, 200));
  while (Date.now() - t < maxMs) {
    if (net.trace.inflight <= 0 && Date.now() - net.trace.lastActivity >= quietMs) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  return Date.now() - t;
}
const h = {
  user: USER, db, kv, A, fixture, today: TODAY, steps,
  /** Spør Glimt slik Hjem gjør (POST /api/glimt/agent). Bekrefter automatisk hvis motoren ber om det (som når brukeren trykker Ja). */
  // Prompt 60 (del 3): tredje argument {conversationId, conversationKind, choice, noConfirm} – flerstegssamtaler i samme samtale.
  // noConfirm: ikke trykk «Ja» automatisk (casen sjekker at ingenting er gjort før bekreftelsen, og bekrefter selv med h.confirm).
  async ask(text, module = 'home', o = {}) {
    const ts = Date.now();
    const m0 = net.trace.model.length, e0 = net.trace.ext.length;
    const extra = { ...(o.conversationId ? { conversationId: o.conversationId } : {}), ...(o.conversationKind ? { conversationKind: o.conversationKind } : {}), ...(o.choice ? { choice: o.choice } : {}) };
    const r = await A('/api/glimt/agent', 'POST', { text, module, requestId: `eval47-${process.pid}-${++reqN}`, ...extra });
    let body = r.body, confirmed = null;
    if (r.status === 200 && body?.confirm?.token && !o.noConfirm) {
      const c = await A('/api/glimt/agent/confirm', 'POST', { token: body.confirm.token });
      confirmed = { status: c.status, summary: body.confirm.summary ?? null };
      if (c.status === 200) body = { ...c.body, actions: c.body.actions ?? body.actions };
    }
    const s = { kind: 'agent', text, module, status: r.status, error: r.status >= 400 ? clip(r.body, 300) : undefined, confirmed, ...slimAgent(body), ...convoOf60(body), msTotal: Date.now() - ts,
      modelCalls: [m0, null], extCalls: [e0, null] };
    s._finish = () => { s.modelCalls[1] = net.trace.model.length; s.extCalls[1] = net.trace.ext.length; };
    steps.push(s);
    s.settledMs = await settle(); // bakgrunnsjobber (rask time, Huskeliste …) lagrer etter svaret
    s._finish(); delete s._finish;
    return s;
  },
  /** Prompt 59: Glimt med strømming (SSE), slik web-chatten gjør. → steg med events, done (hele svaret), firstTokenMs */
  async askStream(text, module = 'home') {
    const ts = Date.now();
    const m0 = net.trace.model.length, e0 = net.trace.ext.length;
    const r = await app.request('/api/glimt/agent/stream', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ text, module, requestId: `eval59-${process.pid}-${++reqN}` }) });
    const sse = r.status === 200 ? await readSse(r, ts) : { events: [], firstTokenMs: null, firstStatusMs: null };
    const done = sse.events.find((e) => e.event === 'done')?.data ?? null;
    const s = { kind: 'stream', text, module, status: r.status, error: r.status >= 400 ? clip(await r.text().catch(() => ''), 300) : sse.events.find((e) => e.event === 'error')?.data?.error, ...slimAgent(done ?? {}),
      events: sse.events.map((e) => ({ event: e.event, at: e.at, ...(e.event === 'token' ? { t: e.data?.t, source: e.data?.source } : e.event === 'status' ? { stage: e.data?.stage, text: e.data?.text, tool: e.data?.tool } : e.event === 'start' ? { stream: e.data?.stream } : e.event === 'error' ? { error: e.data?.error } : {}) })),
      firstTokenMs: sse.firstTokenMs, firstStatusMs: sse.firstStatusMs, msTotal: Date.now() - ts, modelCalls: [m0, null], extCalls: [e0, null] };
    steps.push(s);
    s.settledMs = await settle();
    s.modelCalls[1] = net.trace.model.length; s.extCalls[1] = net.trace.ext.length;
    return s;
  },
  /** Prompt 60: bekreft en lagret plan (som når brukeren trykker Ja). → {status, reply, actions} */
  async confirm(token) {
    const c = await A('/api/glimt/agent/confirm', 'POST', { token });
    const s = { kind: 'confirm', status: c.status, reply: c.body?.reply ?? c.body?.error ?? null, actions: (c.body?.actions ?? []).map((x) => ({ tool: x.tool, status: x.status, args: x.args, error: x.error })) };
    steps.push(s);
    s.settledMs = await settle();
    return s;
  },
  /** Prompt 60: abonnementene i Subscription OS (fh_subscriptions). */
  subscriptions: () => db.prepare('SELECT id, name, plan, active FROM fh_subscriptions WHERE user_id=? ORDER BY id').all(USER),
  /** Prompt 59: Glimt-tracen for et svar (s.traceId). */
  glimtTrace: (s) => glimtTrace(s?.traceId),
  /** Media-feltet: agenten (module media) først, så Media-Glimt hvis svaret er ren prat (som public/js/media43.js). */
  async askMedia(text) {
    const a = await h.ask(text, 'media');
    const plain = !a.actions?.length && !a.results?.length && !a.ask;
    if (!plain) return { agent: a, media: null };
    const ts = Date.now();
    const r = await A('/api/media/glimt', 'POST', { q: text });
    const s = { kind: 'media-glimt', text, status: r.status, reply: r.body?.text ?? r.body?.error ?? null, mediaKind: r.body?.kind ?? null, steps: r.body?.steps, actions: r.body?.actions, results: (r.body?.results ?? []).slice(0, 5).map((x) => ({ type: x.type ?? x.kind, title: x.title, episodeId: x.episodeId, id: x.id })), msTotal: Date.now() - ts };
    steps.push(s);
    return { agent: a, media: s };
  },
  async upload(path, file, { field = 'file', mime = 'image/png' } = {}) {
    const fd = new FormData();
    fd.append(field, new File([readFileSync(join(FIX, file))], file, { type: mime }));
    return A(path, 'POST', fd);
  },
  calendar: () => (kv.get(USER, 'kal_local_events', []) ?? []).map((e) => ({ id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, endDate: e.endDate, allDay: e.allDay, location: e.location, note: e.note, calendar: e.calendar, origin: e.origin })),
  tasks: () => db.prepare('SELECT id, title, list, due, done FROM hl_tasks ORDER BY id').all(),
  memory: () => db.prepare('SELECT id, kind, match, type, title, note FROM glimt_memory WHERE user_id=? ORDER BY id').all(USER),
  ext: (kind) => net.trace.ext.filter((x) => !kind || x.kind === kind),
  modelCalls: () => net.trace.model,
};

/* ---------------- Seed ---------------- */

async function seed(spec = {}) {
  const out = { calendar: [], memory: [], subscriptions: 0, transactions: 0 };
  const cal = fixture('calendar.json');
  for (const k of spec.calendar ?? []) {
    const r = await A('/api/kalender/events', 'POST', cal[k]);
    if (r.status !== 201) throw new Error(`Seed kalender ${k}: ${r.status} ${clip(r.body, 200)}`);
    out.calendar.push(k);
  }
  const mem = fixture('memory.json');
  for (const k of spec.memory ?? []) {
    const r = await A('/api/glimt/memory', 'POST', mem[k]);
    if (r.status !== 201 && r.status !== 200) throw new Error(`Seed minne ${k}: ${r.status} ${clip(r.body, 200)}`);
    out.memory.push(k);
  }
  if (spec.subscriptions) {
    const ins = db.prepare('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,created,user_id,active) VALUES(?,?,?,?,?,?,?,1)');
    for (const s of fixture('subscriptions.json').items) { ins.run(s.name, s.plan, Math.round(s.price * 100), s.cycle, s.next_date, Date.now(), USER); out.subscriptions++; }
  }
  if (spec.transactions) {
    await A('/finans/api/categories'); // oppretter standardkategoriene (ensureLedger)
    const { ensureLedger } = await imp('server/finans/db.js');
    ensureLedger(USER);
    const cats = db.prepare('SELECT id, name FROM fh_categories WHERE user_id=?').all(USER);
    for (const t of fixture('transactions.json').items) {
      const catId = t.category ? cats.find((c) => c.name === t.category)?.id : null;
      if (t.category && !catId) throw new Error(`Seed transaksjoner: fant ikke kategorien ${t.category} (har: ${cats.map((c) => c.name).join(', ')})`);
      const r = await A('/finans/api/transactions', 'POST', { date: t.date, amount: t.amount, description: t.description, ...(catId ? { categoryId: catId } : {}) });
      if (r.status !== 200) throw new Error(`Seed transaksjon ${t.description}: ${r.status} ${clip(r.body, 200)}`);
      // Kategorien settes eksplisitt (autoCat/regler skal ikke endre fasit).
      db.prepare('UPDATE fh_transactions SET category_id=? WHERE id=?').run(catId ?? null, r.body.id);
      out.transactions++;
    }
  }
  return out;
}

/* ---------------- Kjør ---------------- */

const result = { case: null, ok: false, checks: [], reason: null, ms: 0, error: null, trace: {} };
let mod;
try {
  mod = (await import(pathToFileURL(resolve(caseFile)).href)).default;
  result.case = mod.id;
  const seeded = await seed(mod.seed);
  const s0 = { calendar: h.calendar(), memory: h.memory(), tasks: h.tasks() };
  const tc = Date.now();
  const checks = [];
  const ck = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail: detail ? clip(detail, 500) : '' }); return !!ok; };
  ck.info = (name, detail) => checks.push({ name, ok: true, info: true, detail: clip(detail, 500) });
  await mod.run(h, ck, { before: s0 });
  result.ms = Math.max(0, Date.now() - tc - steps.reduce((a, x) => a + Math.min(x.settledMs ?? 0, 1700), 0)); // uten den faste stille-ventetiden
  result.checks = checks;
  const failed = checks.filter((c) => !c.ok);
  result.ok = checks.length > 0 && !failed.length;
  result.reason = failed.length ? failed.map((c) => `${c.name}: ${c.detail}`).join(' | ') : null;
  result.trace = { seeded, before: s0, after: { calendar: h.calendar(), memory: h.memory(), tasks: h.tasks() } };
} catch (e) {
  result.error = String(e?.stack ?? e).slice(0, 2000);
  result.reason = `Riggfeil: ${String(e?.message ?? e).slice(0, 300)}`;
}
await new Promise((res) => setTimeout(res, 100));
result.trace.steps = steps;
// Prompt 59: svartid = det brukeren venter (forespørsel → svar), uten bakgrunnsjobber som går etter svaret (f.eks. AI-sammendrag av
// nye transaksjoner i Finans). result.ms (totalt, med bakgrunnsjobbene) beholdes som før, så gamle resultatfiler kan sammenlignes.
result.replyMs = steps.reduce((a, x) => a + (x.msTotal ?? 0), 0);
try { result.trace.glimt = steps.map((x) => glimtTrace(x.traceId)).filter(Boolean); } catch { result.trace.glimt = []; }
result.intent = result.trace.glimt?.[0]?.intent ?? null;
result.trace.model = net.trace.model;
result.trace.ext = net.trace.ext;
const chat = net.trace.model.filter((m) => m.kind !== 'embed');
result.models = [...new Set(chat.map((m) => m.model).filter(Boolean))];
result.tokens = { maxPrompt: Math.max(0, ...chat.map((m) => m.promptTokens ?? 0)), sumPrompt: chat.reduce((a, m) => a + (m.promptTokens ?? 0), 0), sumOut: chat.reduce((a, m) => a + (m.outTokens ?? 0), 0), calls: chat.length,
  nearCtx: chat.filter((m) => m.promptTokens && m.options?.num_ctx && m.promptTokens + (m.options.num_predict ?? 0) >= m.options.num_ctx).length };
result.routing = effRouting;
result.env = env;
result.wall = Date.now() - t0;
result.dataDir = dataDir;
writeFileSync(outFile, JSON.stringify(result, null, 2));
if (!cfg.keepData) { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* */ } }
process.exit(0);
