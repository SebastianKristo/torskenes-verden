// Prompt 59 (prompt 49 del 4): eval-rapportens fartstall.
//   - svartid per kjøring (det brukeren venter: forespørsel → svar) og «totalt» (med bakgrunnsjobber etter svaret)
//   - median og p90 per intent
//   - cache-effekten for den faste prompt-prefiksen (andel prompt-tokens gjenbrukt fra KV-/prefiks-cachen)
//   - før/etter mot en tidligere resultatfil (--compare fil.json). Eldre filer uten svartid får den regnet ut fra trace.steps.
import { pct58 } from './omlx58.mjs';

// Fast intent per eksisterende case (planleggerens intent kan variere mellom kjøringer; sammenligningen skal være stabil).
export const CASE_INTENT59 = {
  '01-nina-frisor': 'calendar_query', '02-nina-klipp': 'calendar_query', '03-nina-ingen': 'calendar_query', '04-dune-kino': 'calendar_create', '05-middag-fredag': 'calendar_create',
  '06-tannlege': 'calendar_create', '07-vaer-to-steder': 'weather', '08-dyreste-abonnement': 'finance_query', '09-mat-denne-maaneden': 'finance_query', '10-vitnemal': 'dokument (bilde)',
  '11-kvittering': 'kvittering (bilde)', '12-statsminister-nettsok': 'web_search', '13-minne-laering': 'memory_save', '14-hovedstad': 'chat', '15-media-911': 'media',
  '16-vaer-ikke-kalender': 'weather', '17-chat-kvittering-tabell': 'chat-bilde', '18-chat-foto-visjon': 'chat-bilde', '19-chat-bilde-qwen3-ingen-400': 'chat-bilde',
};
/** Svartid for en kjøring: replyMs, ellers summen av stegenes msTotal (eldre filer), ellers ms. */
export const replyMsOf59 = (r) => r.replyMs ?? ((r.trace?.steps ?? []).reduce((a, s) => a + (s.msTotal ?? 0), 0) || (r.ms ?? 0));
export const intentOf59 = (c, r = null) => c.intent ?? CASE_INTENT59[c.id] ?? r?.intent ?? c.area ?? 'annet';
const sec = (v) => (v == null ? '–' : `${(v / 1000).toFixed(1)} s`);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/** Per case: svartid median/p90 og «bakgrunn etter svaret» (median). Muterer c. */
export function addReplyStats59(cases) {
  for (const c of cases) {
    const rs = c.results.map(replyMsOf59).sort((a, b) => a - b);
    c.replyMedianMs = med(rs); c.replyP90Ms = pct58(rs, 0.9);
    c.bgMedianMs = med(c.results.map((r) => Math.max(0, (r.ms ?? 0) - replyMsOf59(r))));
    c.intent59 = intentOf59(c, c.results[0]);
  }
  return cases;
}
/** Median og p90 per intent (svartid og totalt). → [{intent, runs, cases, replyP50, replyP90, totalP50, totalP90}] */
export function perIntent59(cases) {
  const g = new Map();
  for (const c of cases) for (const r of c.results) {
    const k = intentOf59(c, r);
    const x = g.get(k) ?? { intent: k, reply: [], total: [], cases: new Set() };
    x.reply.push(replyMsOf59(r)); x.total.push(r.ms ?? 0); x.cases.add(c.id);
    g.set(k, x);
  }
  return [...g.values()].map((x) => { const a = [...x.reply].sort((p, q) => p - q), b = [...x.total].sort((p, q) => p - q);
    return { intent: x.intent, runs: a.length, cases: [...x.cases], replyP50: pct58(a, 0.5), replyP90: pct58(a, 0.9), totalP50: pct58(b, 0.5), totalP90: pct58(b, 0.9) }; })
    .sort((p, q) => p.intent.localeCompare(q.intent));
}
const stepOfCall = (m) => { const h = String(m.systemHead ?? ''); return /^You are the planner/.test(h) ? 'planner' : /^(You are Glimt|The search results below)/.test(h) ? 'answer' : m.images ? 'bilde' : 'annet'; };
/**
 * Cache-effekten (den faste prompt-prefiksen). Ollama teller i prompt_eval_count bare tokens som faktisk ble regnet ut (prefiksen i
 * KV-cachen er ikke med); oMLX oppgir cached_tokens. Anslaget for hele prompten er tegn / 3,5. Var prompt_eval_count likevel hele
 * prompten (andre Ollama-versjoner), brukes farten: et kall som går mye raskere enn de kalde kallene for samme modell, gjenbrukte cache.
 * → {byStep:{planner:{calls, est, evaluated, reusedPct, promptMs}, …}, total:{…}, method}
 */
export function cacheEffect59(cases) {
  const calls = cases.flatMap((c) => c.results.flatMap((r) => (r.trace?.model ?? []).filter((m) => m.kind !== 'embed' && !m.error && m.promptTokens != null)));
  const rates = new Map(); // modell → [tokens per ms] for kall med målbar prompttid
  for (const m of calls) if (m.promptMs > 150 && m.promptTokens > 200) { const l = rates.get(m.model) ?? []; l.push(m.promptTokens / m.promptMs); rates.set(m.model, l); }
  const cold = (model) => { const l = [...(rates.get(model) ?? [])].sort((a, b) => a - b); return l.length >= 2 ? l[Math.floor(l.length * 0.2)] : null; };
  const acc = {};
  let method = 'tokens';
  for (const m of calls) {
    const step = stepOfCall(m);
    const est = Math.max(m.estTokens ?? 0, 1), n = m.promptTokens;
    let reused;
    if (m.cachedTokens != null) { reused = m.cachedTokens; method = 'oMLX cached_tokens'; }
    else if (n / est < 0.85) reused = Math.max(0, est - n);
    else { const cr = cold(m.model); reused = cr && m.promptMs != null ? Math.max(0, Math.min(n, n - m.promptMs * cr)) : 0; if (cr && reused > 0) method = 'tokens + fart'; }
    const full = m.cachedTokens != null ? Math.max(n, m.cachedTokens) : Math.max(est, n);
    for (const k of [step, '_total']) { const a = acc[k] ?? { calls: 0, est: 0, evaluated: 0, reused: 0, promptMs: 0 }; a.calls++; a.est += full; a.evaluated += n; a.reused += reused; a.promptMs += m.promptMs ?? 0; acc[k] = a; }
  }
  const fmt = (a) => ({ ...a, reusedPct: a.est ? Math.round((100 * a.reused) / a.est) : null });
  const byStep = Object.fromEntries(Object.entries(acc).filter(([k]) => k !== '_total').map(([k, a]) => [k, fmt(a)]));
  return { byStep, total: acc._total ? fmt(acc._total) : null, method };
}
/** Tid per modellkall (glimt-tracen): kø, lasting, prompt, generering, tenketegn. → tekst */
export function timingLine59(r) {
  const ms = (r.trace?.glimt ?? []).flatMap((g) => g.models ?? []);
  if (!ms.length) return '';
  return ms.map((m) => `${m.step ?? '?'} ${sec(m.ms)}${m.timing ? ` (kø ${sec(m.timing.queueMs)} · lasting ${sec(m.timing.loadMs)}${m.timing.cold ? ' kald' : ''} · prompt ${m.prompt?.evalCount ?? '–'} tok/${sec(m.timing.promptMs)}${m.prompt?.reusedPct != null ? ` ${m.prompt.reusedPct} % gjenbrukt` : ''} · gen ${sec(m.timing.genMs)}${m.timing.thinkChars ? ` · tenkte ${m.timing.thinkChars} tegn` : ''})` : ''}`).join(' → ');
}

/** Før/etter mot en tidligere resultatfil. → {rows:[{id, beforeMs, afterMs, deltaPct, beforeTotalMs, afterTotalMs}], intents:[…], total:{…}, file} */
export function compare59(prev, cases, file) {
  const pc = new Map((prev.cases ?? []).map((c) => [c.id, c]));
  const rows = [];
  for (const c of cases) {
    const p = pc.get(c.id);
    if (!p) { rows.push({ id: c.id, beforeMs: null, afterMs: c.replyMedianMs, beforeTotalMs: null, afterTotalMs: c.medianMs, beforePass: null, afterPass: `${c.passes}/${c.runs}` }); continue; }
    const pr = p.results.map(replyMsOf59).sort((a, b) => a - b);
    const b = med(pr);
    rows.push({ id: c.id, beforeMs: b, afterMs: c.replyMedianMs, beforeP90: pct58(pr, 0.9), afterP90: c.replyP90Ms, deltaPct: b ? Math.round((100 * (c.replyMedianMs - b)) / b) : null,
      beforeTotalMs: p.medianMs ?? null, afterTotalMs: c.medianMs, beforePass: `${p.passes}/${p.runs}`, afterPass: `${c.passes}/${c.runs}` });
  }
  const pi = new Map(perIntent59(prev.cases ?? []).map((x) => [x.intent, x]));
  const intents = perIntent59(cases).map((x) => ({ ...x, before: pi.get(x.intent) ?? null }));
  const all = (cs) => cs.flatMap((c) => c.results.map(replyMsOf59)).sort((a, b) => a - b);
  const common = new Set(cases.map((c) => c.id).filter((id) => pc.has(id)));
  const a0 = all((prev.cases ?? []).filter((c) => common.has(c.id))), a1 = all(cases.filter((c) => common.has(c.id)));
  return { file, rows, intents, total: { beforeP50: pct58(a0, 0.5), beforeP90: pct58(a0, 0.9), afterP50: pct58(a1, 0.5), afterP90: pct58(a1, 0.9), cases: common.size },
    before: { engine: prev.meta?.engine ?? prev.meta?.backend ?? null, commit: prev.meta?.commit ?? null, date: prev.meta?.date ?? null } };
}
export const sec59 = sec;

/* ---------------- Hvorfor tok kjøringen tid? (rotårsak fra sporet) ---------------- */

const kindOfCall59 = (m) => {
  const h = String(m.systemHead ?? ''), u = String(m.lastUser ?? '');
  if (/^You are the planner/.test(h)) return 'planlegger';
  if (/^(You are Glimt|The search results below)/.test(h)) return 'svarsteg';
  if (/korte norske beskrivelser av banktransaksjoner/.test(u)) return 'Finans AI-sammendrag (bakgrunn)';
  if (/leser en norsk kvittering/i.test(u)) return 'kvittering (bilde)';
  if (m.images) return 'bilde';
  return 'annet';
};
/**
 * Rotårsaker for én kjøring, fra modellkallene i sporet (virker også på eldre resultatfiler, f.eks. prompt 55/58).
 * → [{why, ms}] sortert etter tid (største først)
 */
export function whySlow59(r) {
  const calls = (r.trace?.model ?? []).filter((m) => m.kind !== 'embed');
  const out = [];
  const reply = replyMsOf59(r), bg = Math.max(0, (r.ms ?? 0) - reply);
  if (bg > 3000) { const ks = [...new Set(calls.map(kindOfCall59).filter((k) => /bakgrunn/.test(k)))]; out.push({ ms: bg, why: `bakgrunnsjobb etter svaret ${sec(bg)}${ks.length ? ` (${ks.join(', ')})` : ''} – telles i «totalt», ikke i svartiden` }); }
  const load = calls.reduce((a, m) => a + (m.loadMs ?? 0), 0);
  if (load > 2000) out.push({ ms: load, why: `lasting av modell ${sec(load)} (${calls.filter((m) => (m.loadMs ?? 0) > 500).map((m) => `${m.model} ${sec(m.loadMs)}`).join(', ')}) – kald modell/modellbytte` });
  const swaps = calls.filter((m, i) => i && calls[i - 1].model !== m.model).length;
  if (swaps) out.push({ ms: 0, why: `${swaps} modellbytte(r) (${calls.map((m) => m.model).filter((m, i, a) => !i || a[i - 1] !== m).join(' → ')})` });
  const think = calls.filter((m) => m.thinkingChars > 0);
  if (think.length) out.push({ ms: think.reduce((a, m) => a + (m.genMs ?? m.ms ?? 0), 0), why: `modellen tenkte (${think.map((m) => `${kindOfCall59(m)} ${m.thinkingChars} tegn`).join(', ')})` });
  const pl = calls.filter((m) => kindOfCall59(m) === 'planlegger');
  if (pl.length > 1) out.push({ ms: pl.slice(1).reduce((a, m) => a + (m.ms ?? 0), 0), why: `planleggeren kalt ${pl.length} ganger (nytt forsøk${pl.some((m) => m.think) ? ' med tenking' : ''} / hint)` });
  const wait = calls.reduce((a, m) => a + (m.totalMs != null && m.ms != null ? Math.max(0, m.ms - m.totalMs) : 0), 0);
  if (wait > 2000) out.push({ ms: wait, why: `ventet ${sec(wait)} før Ollama begynte (kø i Ollama: en annen klient – f.eks. Homelab-serveren – brukte samme modell)` });
  const gen = calls.filter((m) => (m.genMs ?? 0) > 8000);
  if (gen.length) out.push({ ms: gen.reduce((a, m) => a + m.genMs, 0), why: `lang generering (${gen.map((m) => `${kindOfCall59(m)} ${m.outTokens ?? '?'} tok på ${sec(m.genMs)}`).join(', ')})` });
  const prompt = calls.reduce((a, m) => a + (m.promptMs ?? 0), 0);
  if (prompt > 3000) out.push({ ms: prompt, why: `prompt-evaluering ${sec(prompt)} (${calls.reduce((a, m) => a + (m.promptTokens ?? 0), 0)} tokens regnet ut – lite gjenbruk fra KV-cachen)` });
  return out.sort((a, b) => b.ms - a.ms);
}
