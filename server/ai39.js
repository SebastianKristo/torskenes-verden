// Prompt 39 (SERVER39): «✦ Glimt anbefaler» – hvilke modeller du skal laste ned og hva de brukes til, for AI-maskinen
// (Mac mini M4 · 16 GB, se aihw38.js). Montert under /api/ai før ai-api.js. Sesjon eller app-token; «Fyll ut» krever admin.
//
// GET  /api/ai/recommend → [{task, taskName, model, why, alt, fit:'PASSER'|'TRANGT', installed, inUse, sizeGb, pullCmd, current, score, usedFor:[taskName]}]
//      ?full=1 → {machine:{label, model, memGb, gpuBudgetGb}, title:'✦ GLIMT ANBEFALER · Mac mini M4 · 16 GB', items:[…], missing:[{model, sizeGb}], missingGb,
//                 plan:{fill, missing, done, text}, byModel:{<modell>:{usedFor:[…], firstFor:[…]}}, engine:'glimt'|'regler', cachedAt}
//      Slik bestemmer Glimt: kuratert tabell (REC) med norsk (1–5), fart (tok/s), minneGB, evner (bilde/verktøy/embedding/resonnering)
//      og nøyaktighet. Filter: evner oppgaven krever + minneGB ≤ GPU-budsjettet (≈ ⅔ av samlet minne, aldri FOR STOR).
//      Score = vekter per oppgave (kvittering: nøyaktighet 0,6 · fart 0,2 · minne 0,2; chat: norsk 0,5 · fart 0,3 · minne 0,2;
//      kategorisering: fart 0,6 · minne 0,4 …) + 0,1 når installert + 0,1 når den er i bruk. Minnebudsjett: maks én stor modell
//      (> 6 GB) delt mellom oppgavene. Begrunnelsen skrives av Glimt (lokal modell, cache 7 dager, ny ved endrede modeller/maskin),
//      ellers en fast setning.
// POST /api/ai/recommend/ask {q} → {q, tasks:[id], text:'Til kvitteringer anbefaler jeg qwen2.5vl:7b (6 GB, passer). … Alternativ: minicpm-v.',
//      items:[anbefaling], action:{label:'Last ned qwen2.5vl:7b', kind:'pull'|'use', model, tasks}, engine:'regler'|'glimt'}
// GET  /api/ai/recommend/plan → {fill, missing, done, text:'Fyller ut 4 oppgaver med beste installerte modell · 1 mangler (se Modeller)', changes:[{task, from, to}]}
// POST /api/ai/recommend/apply {tasks?:[id]} (admin) → {ok, changed:[{task, taskName, from, to}], skipped:[{task, model, reason}], text:'✦ Glimt fylte ut 4 valg',
//      undo:{token, expiresAt}, done}   Setter hovedmodellen til beste INSTALLERTE kandidat; reservemodellen røres ikke.
//      «Finansdata forlater aldri huset» respekteres (bare lokale modeller, alle kandidatene her er lokale).
// POST /api/ai/recommend/apply/undo {token} → {ok, restored}  (innen 30 s)
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { authOrToken } from './mobile.js';
import { isAdmin } from './auth.js';
import { kv, OWNER } from './db.js';
import * as ai from './ai-run.js';
import { envHw, hostHw, fit38 } from './aihw38.js';

const MOCK = () => process.env.MOCK_DATA === '1' && !process.env.OLLAMA_URL;

// Kandidatene (fasitens REC). fart = tok/s målt på Mac mini M4 (omtrent), acc = nøyaktighet 0–1 for oppgaver med fasit.
export const REC = [
  { id: 'gemma4:latest', norsk: 5, fart: 22, mem: 9.6, evner: ['bilde', 'verktøy'], acc: 0.86, desc: 'sterk på norsk og leser bilder' },
  { id: 'gemma3:12b', norsk: 5, fart: 20, mem: 8.1, evner: ['bilde'], acc: 0.82, desc: 'god norsk og leser bilder' },
  { id: 'qwen3:8b', norsk: 4, fart: 35, mem: 5.2, evner: ['verktøy', 'resonnering'], acc: 0.8, desc: 'rask og god med verktøy' },
  { id: 'qwen2.5vl:7b', norsk: 3, fart: 28, mem: 6.0, evner: ['bilde'], acc: 0.9, desc: 'best til å lese tekst i bilder' },
  { id: 'minicpm-v', norsk: 2, fart: 30, mem: 5.5, evner: ['bilde'], acc: 0.76, desc: 'leser bilder på lite minne' },
  { id: 'llama3.2:3b', norsk: 3, fart: 70, mem: 2.0, evner: ['verktøy'], acc: 0.66, desc: 'liten og veldig rask' },
  { id: 'llama3.1:8b', norsk: 3, fart: 35, mem: 4.9, evner: ['verktøy'], acc: 0.7, desc: 'allsidig' },
  { id: 'mistral-nemo:12b', norsk: 4, fart: 22, mem: 7.1, evner: ['verktøy'], acc: 0.75, desc: 'god på europeiske språk' },
  { id: 'phi4:14b', norsk: 3, fart: 15, mem: 9.1, evner: ['resonnering'], acc: 0.8, desc: 'skarp resonnering' },
  { id: 'deepseek-r1:8b', norsk: 2, fart: 25, mem: 5.2, evner: ['resonnering'], acc: 0.78, desc: 'tenker før den svarer' },
  { id: 'gemma3:27b', norsk: 5, fart: 9, mem: 17, evner: ['bilde'], acc: 0.88, desc: 'stor og grundig' },
  { id: 'nomic-embed-text', norsk: 3, fart: 500, mem: 0.27, evner: ['embedding'], acc: 0.8, desc: 'embeddings for kunnskapsbasen' },
  { id: 'bge-m3', norsk: 4, fart: 300, mem: 1.2, evner: ['embedding'], acc: 0.84, desc: 'flerspråklige embeddings' },
];
// Vekter per oppgave (n = norsk, f = fart, m = minne, a = nøyaktighet) og evner som kreves.
export const WEIGHTS = {
  chat: { n: 0.5, f: 0.3, m: 0.2, need: [] }, sok: { n: 0.4, f: 0.4, m: 0.2, need: [] }, glimt: { n: 0.4, f: 0.4, m: 0.2, need: [] },
  brief: { n: 0.6, f: 0.2, m: 0.2, need: [] }, rc: { a: 0.6, f: 0.2, m: 0.2, need: ['bilde'] }, kat: { f: 0.6, m: 0.4, need: [] },
  fsok: { n: 0.4, a: 0.3, f: 0.3, need: [] }, bar: { f: 0.5, a: 0.3, m: 0.2, need: ['bilde'] }, dom: { n: 0.5, f: 0.3, m: 0.2, need: [] },
  kb: { f: 0.5, m: 0.5, need: ['embedding'] },
};
const NO_TEXT = new Set(['embedding']);
const LARGE_GB = 6.05;

const base = (id) => String(id ?? '').replace(/:latest$/, '');
const sameModel = (a, b) => !!a && !!b && (a === b || base(a) === base(b));
const gb = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Prompt 59: målt på Mac mini-en med `npm run eval` (19/19 caser 3/3, 25.10.2026): qwen3:8b til all tekst og qwen2.5vl:7b til bilder.
// Én tekstmodell til alle tekstoppgavene gir ingen modellbytter med OLLAMA_MAX_LOADED_MODELS=1. Store modeller (> 6 GB, f.eks. gemma4)
// dytter qwen3:8b ut av minnet på 16 GB og ga 50–170 s svartid i eval – de trekkes ned når GPU-budsjettet er ≤ 12 GB.
export const EVAL_BEST59 = Object.freeze({ text: 'qwen3:8b', vision: 'qwen2.5vl:7b', embed: null });
const evalBonus59 = (c, w) => (w.need.includes('bilde') ? (sameModel(c.id, EVAL_BEST59.vision) ? 0.35 : 0) : w.need.includes('embedding') ? 0 : sameModel(c.id, EVAL_BEST59.text) ? 0.35 : 0);
function scoreOf(c, w, budget, { installed, inUse }) {
  const norsk = c.norsk / 5, fart = Math.min(1, c.fart / 40), minne = Math.max(0, 1 - c.mem / budget), acc = c.acc;
  const swap = budget <= 12 && c.mem > LARGE_GB ? 0.3 : 0;
  return (w.n ?? 0) * norsk + (w.f ?? 0) * fart + (w.m ?? 0) * minne + (w.a ?? 0) * acc + (installed ? 0.1 : 0) + (inUse ? 0.1 : 0) + evalBonus59(c, w) - swap;
}
const EVAL_WHY59 = (t, c) => (sameModel(c.id, EVAL_BEST59.text) || sameModel(c.id, EVAL_BEST59.vision) ? ' Testet i eval på Mac mini-en: alle casene besto 3 av 3 ganger.' : '');
const WHY_RULE = {
  chat: (c) => `${cap(c.desc)}, og passer i minnet (${gb(c.mem)} GB).`,
  sok: (c) => `Svarer raskt på korte spørsmål og er ${c.desc}.`,
  glimt: (c) => `Rask nok til kalenderen og ${c.desc}.`,
  brief: (c) => `Skriver god norsk til briefen, ${c.desc}.`,
  rc: (c) => `${cap(c.desc)}, bare ${gb(c.mem)} GB.`,
  kat: (c) => `Kategorisering trenger fart, ikke størrelse: ${c.desc}, ${gb(c.mem)} GB.`,
  fsok: (c) => `Forstår spørsmål om økonomi på norsk og er ${c.desc}.`,
  bar: (c) => `Leser strekkoder og pakkelapper i bilder, ${gb(c.mem)} GB.`,
  dom: (c) => `Lager korte daglige sammendrag, ${c.desc}.`,
  kb: (c) => `${cap(c.desc)}, nesten ingen minnebruk (${gb(c.mem)} GB).`,
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

let llmImpl = null;
/** Bare for tester: (items) → {task: setning}. */
export const _setRecLlm = (fn) => { llmImpl = fn; };
async function glimtWhy(items, hw, installedIds) {
  const key = createHash('sha1').update(JSON.stringify([items.map((x) => [x.task, x.model, x.alt]), installedIds, hw.model, hw.memGb])).digest('hex').slice(0, 16);
  const cache = kv.get(OWNER, 'ai39_why', null);
  if (cache?.key === key && Date.now() - cache.at < 7 * 86400_000) return { why: cache.why, at: cache.at };
  let why = null;
  try {
    if (llmImpl) why = await llmImpl(items);
    else if (!MOCK()) {
      const out = await ai.run('glimt', { json: true, temperature: 0.2, numPredict: 500, phased: true, title: 'Glimt · anbefaler modeller', background: true,
        prompt: `Skriv én kort norsk setning per oppgave om hvorfor modellen er best på ${hw.model} (${hw.memGb} GB). Svar KUN med JSON {"<task>":"setning"}.\n${items.map((x) => `${x.task} (${x.taskName}): ${x.model} (${gb(x.sizeGb)} GB, ${x.fit}) – alternativ ${x.alt ?? 'ingen'}`).join('\n')}` });
      why = out.data && typeof out.data === 'object' ? out.data : JSON.parse(String(out.text).match(/\{[\s\S]*\}/)?.[0] ?? 'null');
    }
  } catch { why = null; }
  if (why && typeof why === 'object') { kv.set(OWNER, 'ai39_why', { key, at: Date.now(), why }); return { why, at: Date.now() }; }
  return { why: null, at: null };
}

/** Anbefalingene for maskinen og rutingen til u. */
export async function recommend(u, { hw = null, withWhy = true } = {}) {
  hw = hw ?? await hostHw().catch(() => envHw());
  const budget = hw.gpuBudgetGb ?? envHw().gpuBudgetGb;
  const inv = await ai.ollamaInventory().catch(() => ({ models: [] }));
  const installedIds = (inv.models ?? []).map((m) => m.name);
  const isInst = (id) => installedIds.some((x) => sameModel(x, id));
  const r = ai.routing(u);
  const finLocal = !!r.rules?.finLocal;
  const pick = (t) => {
    const w = WEIGHTS[t.id];
    const cands = REC.filter((c) => w.need.every((e) => c.evner.includes(e)) && (w.need.includes('embedding') || !c.evner.every((e) => NO_TEXT.has(e))) && c.mem <= budget - 0.2
      && !ai.retiredModel55(c.id)); // prompt 55/59: llama3.2:3b anbefales aldri (heller ikke som alternativ)
    const cur = r.tasks?.[t.id]?.model ?? '';
    return cands.map((c) => ({ c, s: scoreOf(c, w, budget, { installed: isInst(c.id), inUse: sameModel(cur, c.id) }) })).sort((a, b) => b.s - a.s);
  };
  const ranked = Object.fromEntries(ai.AI_TASKS.filter((t) => WEIGHTS[t.id]).map((t) => [t.id, pick(t)]));
  // Minnebudsjett: én stor modell delt mellom oppgavene (den som vinner flest oppgaver).
  const largeVotes = {};
  for (const L of Object.values(ranked)) { const top = L[0]?.c; if (top && top.mem > LARGE_GB) largeVotes[top.id] = (largeVotes[top.id] ?? 0) + 1; }
  const shared = Object.entries(largeVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const items = [];
  for (const t of ai.AI_TASKS) {
    const L = ranked[t.id];
    if (!L?.length) continue;
    let top = L[0], alt = L.find((x) => x.c.id !== top.c.id) ?? null;
    if (shared && top.c.mem > LARGE_GB && top.c.id !== shared) {
      const sh = L.find((x) => x.c.id === shared);
      const small = L.find((x) => x.c.mem <= LARGE_GB);
      const repl = sh && top.s - sh.s <= 0.15 ? sh : small;
      if (repl) { alt = top; top = repl; }
    }
    const cur = r.tasks?.[t.id]?.model ?? '';
    // Embeddings: bytte modell betyr at hele kunnskapsbasen må indekseres på nytt – behold den som er i bruk når den er en embedding-modell.
    if (t.id === 'kb' && cur) { const keep = L.find((x) => sameModel(x.c.id, cur)); if (keep && keep !== top) { alt = top; top = keep; } }
    const fit = fit38(top.c.mem, budget) ?? 'PASSER';
    items.push({ task: t.id, taskName: t.name, model: top.c.id, why: (WHY_RULE[t.id]?.(top.c) ?? cap(top.c.desc)) + EVAL_WHY59(t.id, top.c), alt: alt?.c.id ?? null, fit, installed: isInst(top.c.id), inUse: sameModel(cur, top.c.id),
      sizeGb: top.c.mem, pullCmd: `ollama pull ${top.c.id}`, current: cur || null, score: Math.round(top.s * 100) / 100, fin: !!t.fin, localOnly: !!(t.fin && finLocal) });
  }
  let engine = 'regler', cachedAt = null;
  if (withWhy) {
    const g = await glimtWhy(items, hw, installedIds);
    if (g.why) { engine = 'glimt'; cachedAt = g.at ? new Date(g.at).toISOString() : null; for (const x of items) if (typeof g.why[x.task] === 'string' && g.why[x.task].trim()) x.why = g.why[x.task].trim().slice(0, 200); }
  }
  const byModel = {};
  for (const x of items) {
    byModel[x.model] ??= { usedFor: [], firstFor: [] };
    byModel[x.model].firstFor.push(x.taskName);
  }
  for (const t of ai.AI_TASKS) { const m = r.tasks?.[t.id]?.model; if (m) { byModel[m] ??= { usedFor: [], firstFor: [] }; byModel[m].usedFor.push(t.name); } }
  for (const x of items) x.usedFor = byModel[x.model]?.usedFor ?? [];
  const missing = [...new Map(items.filter((x) => !x.installed).map((x) => [x.model, { model: x.model, sizeGb: x.sizeGb, pullCmd: x.pullCmd }])).values()];
  return { hw, items, missing, missingGb: Math.round(missing.reduce((a, x) => a + x.sizeGb, 0) * 10) / 10, byModel, engine, cachedAt, installedIds };
}
/** «La Glimt velge»: hva Fyll ut ville gjort (beste INSTALLERTE kandidat per oppgave). */
export async function planFor(u, tasks = null) {
  const rec = await recommend(u, { withWhy: false });
  const budget = rec.hw.gpuBudgetGb ?? envHw().gpuBudgetGb;
  const r = ai.routing(u);
  const isInst = (id) => rec.installedIds.some((x) => sameModel(x, id));
  const changes = [], skipped = [];
  let follows = 0;
  for (const x of rec.items) {
    if (tasks && !tasks.includes(x.task)) continue;
    const w = WEIGHTS[x.task];
    const best = REC.filter((c) => w.need.every((e) => c.evner.includes(e)) && (w.need.includes('embedding') || !c.evner.every((e) => NO_TEXT.has(e))) && c.mem <= budget - 0.2 && isInst(c.id))
      .map((c) => ({ c, s: scoreOf(c, w, budget, { installed: true, inUse: sameModel(r.tasks?.[x.task]?.model, c.id) }) })).sort((a, b) => b.s - a.s)[0];
    if (!best) { skipped.push({ task: x.task, taskName: x.taskName, model: x.model, reason: 'mangler' }); continue; }
    const target = isInst(x.model) ? x.model : best.c.id;
    const inst = rec.installedIds.find((m) => sameModel(m, target)) ?? target;
    if (sameModel(r.tasks?.[x.task]?.model, target)) { follows++; continue; }
    changes.push({ task: x.task, taskName: x.taskName, from: r.tasks?.[x.task]?.model || null, to: inst });
    if (!isInst(x.model)) skipped.push({ task: x.task, taskName: x.taskName, model: x.model, reason: 'mangler' });
  }
  const miss = new Set(skipped.map((s) => s.model)).size;
  const done = !changes.length;
  return { fill: changes.length, missing: miss, done, follows, changes, skipped,
    text: done ? (miss ? `✓ Ferdig · ${miss} anbefalt modell mangler (se Modeller)` : '✓ Ferdig') : `Fyller ut ${changes.length} ${changes.length === 1 ? 'oppgave' : 'oppgaver'} med beste installerte modell${miss ? ` · ${miss} mangler (se Modeller)` : ''}` };
}

/* ---------------- Prompt 59: de beste modellene settes én gang ved oppgraderingen ---------------- */
// Etter eval på Mac mini-en (qwen3:8b til tekst, qwen2.5vl:7b til bilder) fyller serveren ut serverrutingen med anbefalingen ÉN gang,
// når Ollama svarer og modellene er installert. Brukernes egne valg (routing.own) og reservemodellene røres ikke. Kan angres ved å velge
// på nytt i AI-kontroll › Valg. Resultatet lagres i kv(OWNER,'rec59_applied') og logges.
export async function applyBest59({ force = false } = {}) {
  const done = kv.get(OWNER, 'rec59_applied', null);
  if (done && !force) return { skipped: 'allerede gjort', ...done };
  const inv = await ai.ollamaInventory({ force: true }).catch(() => null);
  if (!inv?.ok || !(inv.models ?? []).length) return { skipped: 'Ollama svarer ikke' };
  // Kunnskapsbasen (kb) røres aldri: en annen embedding-modell betyr at alt må indekseres på nytt («auto» peker gjerne på bge-m3).
  const plan = await planFor(OWNER, ai.AI_TASKS.map((t) => t.id).filter((t) => t !== 'kb'));
  const r = ai.routing(OWNER);
  for (const ch of plan.changes) r.tasks[ch.task] = { model: ch.to, fallback: r.tasks[ch.task]?.fallback ?? '' };
  if (plan.changes.length) { const { own, ...rest } = r; void own; ai.saveServerRouting(rest); }
  const out = { at: Date.now(), changes: plan.changes.map((c) => ({ task: c.task, from: c.from, to: c.to })), missing: plan.skipped.map((x) => x.model) };
  kv.set(OWNER, 'rec59_applied', out);
  console.info(`[ai39] beste modeller satt (prompt 59): ${out.changes.map((c) => `${c.task} ${c.from ?? '–'} → ${c.to}`).join(', ') || 'ingen endring'}${out.missing.length ? ` · mangler ${[...new Set(out.missing)].join(', ')}` : ''}`);
  return out;
}
/** Ved oppstart: prøv etter 1 min, så hvert 10. min i opptil 2 t til Ollama svarer. */
export function startBest59() {
  let n = 0;
  const tick = async () => { n++; try { const r = await applyBest59(); if (r.skipped === 'Ollama svarer ikke' && n < 12) setTimeout(tick, 10 * 60_000).unref?.(); } catch (e) { console.warn('[ai39] beste modeller:', e.message); } };
  setTimeout(tick, 60_000).unref?.();
}

// Spør Glimt: nøkkelord (fasitens RKW) → oppgaver.
export const RKW = [
  ['rc', /kvittering|bilde|skann|ocr|foto|lese tekst/], ['kat', /kategori|sorter|klassifiser/], ['glimt', /kalender|avtale|glimt|timeplan/],
  ['fsok', /finans|økonomi|penger|abonnement|forbruk|budsjett/], ['bar', /strekkode|pakkelapp|barcode|qr/], ['dom', /domene|nettside|trafikk|search console/],
  ['kb', /dokument|kunnskap|embedding|pdf|notater|søk i filer/], ['brief', /brief|morgen|oppsummer/], ['sok', /søk|spørsmål|svar raskt/],
  ['chat', /chat|samtale|prat|skriv|tekst|kode|program|oversett|e-post|epost/],
];
const TASK_PHRASE = { chat: 'chat', sok: 'AI-søk', glimt: 'Glimt i kalenderen', brief: 'briefen', rc: 'kvitteringer', kat: 'kategorisering', fsok: 'Finans · spør', bar: 'strekkoder', dom: 'domener', kb: 'kunnskapsbasen' };
export async function ask(u, q) {
  const t = String(q ?? '').toLowerCase();
  const tasks = [...new Set(RKW.filter(([, re]) => re.test(t)).map(([k]) => k))];
  const rec = await recommend(u, { withWhy: true });
  if (!tasks.length) {
    const chat = rec.items.find((x) => x.task === 'chat');
    return { q, tasks: [], items: chat ? [chat] : [], engine: 'regler',
      text: `Jeg er ikke sikker på hva du vil bruke AI til. Som allrounder anbefaler jeg ${chat?.model ?? 'qwen3:8b'}${chat ? ` (${gb(chat.sizeGb)} GB, ${chat.fit === 'PASSER' ? 'passer' : 'trangt'})` : ''}. Prøv f.eks. «lese kvitteringer», «chat på norsk» eller «søke i dokumenter».`,
      examples: ['lese kvitteringer', 'chat på norsk', 'kategorisere transaksjoner', 'søke i dokumenter'], action: chat ? actionOf(chat, ['chat']) : null };
  }
  const items = tasks.map((k) => rec.items.find((x) => x.task === k)).filter(Boolean);
  const first = items[0];
  const text = items.map((x, i) => `${i ? 'Til' : 'Til'} ${TASK_PHRASE[x.task] ?? x.taskName.toLowerCase()} anbefaler jeg ${x.model} (${gb(x.sizeGb)} GB, ${x.fit === 'PASSER' ? 'passer' : 'trangt'}). ${x.why}${x.alt ? ` Alternativ: ${x.alt}.` : ''}`).join(' ');
  return { q, tasks, items, engine: rec.engine, text, action: first ? actionOf(first, items.filter((x) => x.model === first.model).map((x) => x.task)) : null };
}
const actionOf = (x, tasks) => (x.installed ? (x.inUse ? { kind: 'none', label: 'I bruk', model: x.model, tasks } : { kind: 'use', label: `Bruk ${x.model}`, model: x.model, tasks })
  : { kind: 'pull', label: `Last ned ${x.model}`, model: x.model, sizeGb: x.sizeGb, pullCmd: x.pullCmd, tasks });

/* ---------------- Ruter ---------------- */

const undoTokens = new Map(); // token → {at, tasks:{id:{model, fallback}}}
export const rec39Api = new Hono();
rec39Api.use('*', authOrToken);
const bad = (c, error, status = 400) => c.json({ error }, status);
rec39Api.get('/recommend', async (c) => {
  const u = c.get('user');
  const rec = await recommend(u);
  if (c.req.query('full') !== '1') return c.json(rec.items, 200, { 'Cache-Control': 'no-store' });
  const plan = await planFor(u);
  const hw = rec.hw;
  return c.json({ machine: { label: `${hw.model} · ${hw.memGb} GB`, model: hw.model, memGb: hw.memGb, gpuBudgetGb: hw.gpuBudgetGb }, title: `✦ GLIMT ANBEFALER · ${hw.model} · ${hw.memGb} GB`,
    items: rec.items, missing: rec.missing, missingGb: rec.missingGb, plan: { fill: plan.fill, missing: plan.missing, done: plan.done, text: plan.text }, byModel: rec.byModel, engine: rec.engine, cachedAt: rec.cachedAt }, 200, { 'Cache-Control': 'no-store' });
});
rec39Api.post('/recommend/ask', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const q = String(b?.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return bad(c, 'Skriv hva du vil bruke AI til');
  return c.json(await ask(c.get('user'), q));
});
rec39Api.get('/recommend/plan', async (c) => c.json(await planFor(c.get('user'))));
rec39Api.post('/recommend/apply/undo', async (c) => {
  if (!isAdmin(c.get('user'))) return bad(c, 'Bare administratorer kan endre AI-oppsettet', 403);
  const b = await c.req.json().catch(() => ({}));
  const t = undoTokens.get(String(b?.token ?? ''));
  if (!t || Date.now() - t.at > 30_000) return bad(c, 'Angre-fristen har gått ut', 409);
  undoTokens.delete(String(b.token));
  const r = ai.routing(OWNER);
  for (const [k, v] of Object.entries(t.tasks)) r.tasks[k] = v;
  const { own, ...rest } = r;
  ai.saveServerRouting(rest);
  return c.json({ ok: true, restored: Object.keys(t.tasks).length });
});
rec39Api.post('/recommend/apply', async (c) => {
  const u = c.get('user');
  if (!isAdmin(u)) return bad(c, 'Bare administratorer kan endre AI-oppsettet', 403);
  const b = await c.req.json().catch(() => ({}));
  const known = new Set(ai.AI_TASKS.map((t) => t.id));
  const tasks = Array.isArray(b?.tasks) ? b.tasks.map((x) => ai.TASK_ALIAS[x] ?? x) : null;
  if (tasks && tasks.some((x) => !known.has(x))) return bad(c, `Ukjent oppgave: ${tasks.find((x) => !known.has(x))}`);
  const plan = await planFor(u, tasks);
  if (b?.dryRun === true) return c.json(plan);
  const r = ai.routing(OWNER), before = {};
  for (const ch of plan.changes) { before[ch.task] = { ...r.tasks[ch.task] }; r.tasks[ch.task] = { model: ch.to, fallback: r.tasks[ch.task]?.fallback ?? '' }; }
  if (plan.changes.length) { const { own, ...rest } = r; ai.saveServerRouting(rest); }
  const token = randomBytes(9).toString('base64url');
  if (plan.changes.length) undoTokens.set(token, { at: Date.now(), tasks: before });
  for (const [k, v] of undoTokens) if (Date.now() - v.at > 60_000) undoTokens.delete(k);
  return c.json({ ok: true, changed: plan.changes, skipped: plan.skipped, done: !plan.changes.length,
    text: plan.changes.length ? `✦ Glimt fylte ut ${plan.changes.length} ${plan.changes.length === 1 ? 'valg' : 'valg'}` : '✓ Ferdig · alt følger allerede anbefalingen',
    ...(plan.changes.length ? { undo: { token, expiresAt: new Date(Date.now() + 30_000).toISOString() } } : {}) });
});
