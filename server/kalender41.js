// Prompt 41 (SERVER41): Kalender – søk med Glimt (Ollama på hjemmeserveren) og testvarsel (claude-code-kalender-glimt-sok-testvarsel.md).
// Sesjon eller app-token (Kalender-tokenet), alt per bruker. Aldri sky-modeller med kalenderdata (localOnly).
//
// POST /api/kalender/glimt/search {q} (alias POST /api/calendar/ask) →
//   {text:'Neste tannlege er tirsdag 4. november kl. 17:30.', events:[{id, title, date, start, end, allDay, time, weekday, place, calendar, color}] (≤ 6),
//    engine:'ollama'|'local', label:'GLIMT · OLLAMA'|'UTEN AI', model, ms}
//   Hendelser 60 dager bak og 180 frem (id, dato, ukedag, tid, tittel, sted, kalender) sendes til Ollama med systemprompt «svar kort, ikke finn på,
//   returner {"answer","ids"}». 20 s grense → lokal reserve (nøkkelord + tidsord) merket «UTEN AI».
// POST /api/kalender/notify/test {delaySec?:0–30} → {ok, at, pushed, queued, skipped?, ms}  (varsel «Kalender · test» via samme kanal som påminnelser)
// POST /api/push/test {app:'kalender'|'homelab'} → samme (lang-trykk på «Send testvarsel»: «Push sendt · kom fram på 1,2 s»)
import { Hono } from 'hono';
import { authOrToken as authOrToken0 } from './mobile.js';
import { notifyUser } from './notify.js';
import { runAsUser } from './settings.js';

const authOrToken = (c, next) => authOrToken0(c, next); // sen binding
export const SEARCH_MS41 = 20_000;
let llm = null, evImpl = null;
/** Bare for tester: ({prompt, system}) → {answer, ids} | kast. */
export const _setKal41Llm = (fn) => { llm = fn ?? null; };
/** Bare for tester: (user, from, to) → [hendelse]. */
export const _setKal41Events = (fn) => { evImpl = fn ?? null; };
const TZ = 'Europe/Oslo';
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const today = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wdOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const hm = (s) => (s ? new Date(Date.parse(s)).toLocaleTimeString('nb-NO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : null);
const longDate = (iso) => `${WD[wdOf(iso)]} ${+iso.slice(8, 10)}. ${MON[+iso.slice(5, 7) - 1]}`;

async function eventsOf(u, from, to) {
  if (evImpl) return evImpl(u, from, to);
  const { eventsFor } = await import('./calendar.js');
  const r = await runAsUser(u, () => eventsFor(u, from, to));
  return r.events ?? [];
}
const evOut = (e) => ({ id: e.id, title: e.title, date: e.date, start: e.start ?? null, end: e.end ?? null, allDay: !!e.allDay, time: e.allDay ? null : hm(e.start), weekday: e.date ? WD[wdOf(e.date)] : null,
  place: e.room || e.location || null, calendar: e.calendar ?? e.appCalendar ?? e.source ?? null, color: e.color ?? null });
/** Kompakt liste til modellen. */
export const compact41 = (evs) => evs.map((e) => `${e.id} | ${e.date} | ${WD[wdOf(e.date)]} | ${e.allDay ? 'hele dagen' : hm(e.start)} | ${e.title}${e.room || e.location ? ` | ${e.room || e.location}` : ''} | ${e.calendar ?? e.source ?? ''}`).join('\n');

const STOP = new Set(['når', 'er', 'neste', 'hva', 'skjer', 'i', 'på', 'har', 'jeg', 'min', 'mitt', 'mine', 'sist', 'var', 'hos', 'til', 'en', 'et', 'den', 'det', 'de', 'og', 'eller', 'hvilke', 'hvilken', 'noen', 'om', 'med', 'for', 'fri', 'uke', 'uka', 'helgen', 'helga', 'dag', 'dager', 'frister', 'frist', 'avtaler', 'avtale', 'kalender', 'kalenderen', 'meg', 'vi', 'oss', 'går', 'skal']);
/** Lokal reserve: tidsord (helgen, neste uke, måned, sist/neste) + nøkkelord i tittel/sted. → {text, events} */
export function localSearch41(q, evs, now = Date.now()) {
  const t = String(q ?? '').toLowerCase(), t0 = today(now);
  let from = t0, to = addDays(t0, 180), past = false;
  if (/\bsist\b|\bforrige\b|\bvar jeg\b/.test(t)) { past = true; from = addDays(t0, -60); to = t0; }
  if (/\bhelg(en|a)?\b/.test(t)) { const wd = wdOf(t0); const sat = addDays(t0, (6 - wd + 7) % 7); from = wd === 0 ? t0 : sat; to = wd === 0 ? t0 : addDays(sat, 1); }
  if (/\bneste uke\b/.test(t)) { const mon = addDays(t0, ((8 - wdOf(t0)) % 7) || 7); from = mon; to = addDays(mon, 6); }
  if (/\b(i dag|idag)\b/.test(t)) { from = t0; to = t0; }
  if (/\bi morgen\b/.test(t)) { from = addDays(t0, 1); to = from; }
  const mi = MON.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
  if (mi >= 0) { const y = +t0.slice(0, 4) + (mi + 1 < +t0.slice(5, 7) ? 1 : 0); from = `${y}-${String(mi + 1).padStart(2, '0')}-01`; to = new Date(Date.UTC(y, mi + 1, 0)).toISOString().slice(0, 10); }
  const words = t.replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const frist = /\bfrist(er)?\b|\binnlever/.test(t);
  let hits = evs.filter((e) => e.date >= from && e.date <= to);
  const kw = words.filter((w) => !MON.includes(w));
  if (kw.length || frist) hits = hits.filter((e) => { const h = `${e.title ?? ''} ${e.room ?? ''} ${e.location ?? ''} ${e.type ?? ''}`.toLowerCase(); return (frist && /frist|innlever|innl|levering|deadline/.test(h)) || kw.some((w) => h.includes(w.replace(/(en|et|a|ene|er)$/, ''))); });
  hits.sort((a, b) => (past ? -1 : 1) * (`${a.date}${a.start ?? ''}`).localeCompare(`${b.date}${b.start ?? ''}`));
  if (/\bfri\b/.test(t) && !kw.length) {
    const busy = new Set(evs.filter((e) => e.date >= from && e.date <= to && !e.allDay).map((e) => e.date));
    const free = []; for (let d = from; d <= to && free.length < 7; d = addDays(d, 1)) if (!busy.has(d) && wdOf(d) % 6) free.push(longDate(d));
    return { text: free.length ? `Du har ingen avtaler ${free.slice(0, 3).join(', ')}.` : 'Fant ingen helt ledige hverdager.', events: [] };
  }
  const top = hits.slice(0, 6);
  if (!top.length) return { text: 'Fant ingen hendelser som passer.', events: [] };
  const e = top[0];
  return { text: `${past ? 'Sist' : top.length > 1 ? 'Først' : 'Neste'}: ${e.title} ${longDate(e.date)}${e.allDay ? '' : ` kl. ${hm(e.start)}`}.${top.length > 1 ? ` ${top.length - 1} til under.` : ''}`, events: top };
}
const SYSTEM = 'Du er Glimt i kalenderappen. Svar kort på norsk bokmål (1–2 setninger) med dag og klokkeslett. Bruk bare hendelsene i listen, ikke finn på hendelser. '
  + 'Svar KUN med JSON {"answer":"…","ids":["id", …]} der ids er hendelsene svaret handler om (maks 6).';
export async function glimtSearch41(u, q, now = Date.now()) {
  const t0 = Date.now(), d = today(now);
  const evs = (await eventsOf(u, addDays(d, -60), addDays(d, 180))).filter((e) => e?.id && e.date);
  const byId = new Map(evs.map((e) => [String(e.id), e]));
  const prompt = `I dag er ${longDate(d)} ${d}.\nHendelser (id | dato | ukedag | tid | tittel | sted | kalender):\n${compact41(evs.slice(0, 600))}\n\nSpørsmål: ${q}`;
  try {
    const ask = llm ? Promise.resolve(llm({ prompt, system: SYSTEM })) : (async () => {
      const { run } = await import('./ai-run.js');
      const r = await run('glimt', { user: u, prompt, system: SYSTEM, json: true, localOnly: true, numPredict: 260, temperature: 0.1, timeoutMs: SEARCH_MS41, title: 'Kalender · søk med Glimt' });
      return { ...(r.data ?? JSON.parse(String(r.text).match(/\{[\s\S]*\}/)?.[0] ?? '{}')), _model: r.model };
    })();
    const j = await Promise.race([ask, new Promise((_, rej) => { const tm = setTimeout(() => rej(new Error('Tidsavbrudd')), SEARCH_MS41 + 500); tm.unref?.(); })]);
    const answer = String(j?.answer ?? '').trim();
    if (answer) {
      const events = (Array.isArray(j.ids) ? j.ids : []).map((id) => byId.get(String(id))).filter(Boolean).slice(0, 6).map(evOut);
      return { text: answer.slice(0, 400), events, engine: 'ollama', label: 'GLIMT · OLLAMA', model: j._model ?? 'Ollama', ms: Date.now() - t0 };
    }
  } catch { /* lokal reserve */ }
  const l = localSearch41(q, evs, now);
  return { text: l.text, events: l.events.map(evOut), engine: 'local', label: 'UTEN AI', model: null, ms: Date.now() - t0 };
}

async function testNotify(u, { app = 'kalender', delaySec = 0 } = {}) {
  const t0 = Date.now();
  if (delaySec > 0) await new Promise((r) => setTimeout(r, Math.min(30, delaySec) * 1000));
  const r = await notifyUser(u, { title: app === 'kalender' ? 'Kalender · test' : 'Homelab · test', body: app === 'kalender' ? 'Tannlege kl. 17:30 · om 15 min. Varsler virker.' : 'Varsler virker.',
    category: 'system', tag: `push-test-${app}`, url: app === 'kalender' ? null : '/', data: { kind: 'push.test', app, deepLink: app === 'kalender' ? 'kalender://' : 'finanshub://', sentAt: new Date().toISOString() } });
  return { ok: !r.skipped || r.skipped === 'i forgrunnen' || r.skipped === 'ingen abonnement', at: new Date().toISOString(), pushed: r.pushed, queued: r.id, realtime: r.realtime, ...(r.skipped ? { skipped: r.skipped } : {}), ms: Date.now() - t0,
    text: r.pushed ? `Push sendt · kom fram på ${String(Math.round((Date.now() - t0) / 100) / 10).replace('.', ',')} s` : r.skipped === 'ingen abonnement' ? 'Varselet ligger i køen (appen henter det). Ingen push-abonnement på serveren.' : r.skipped ? `Ikke sendt: ${r.skipped}` : 'Varsel sendt' };
}

export const kalender41Api = new Hono();
// NB: montert under /api – derfor auth per rute (ikke use('*'), som ville gjelde alle /api-ruter).
const searchHandler = async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const q = String(b.q ?? b.question ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
  if (!q) return c.json({ error: 'Skriv et spørsmål' }, 400);
  return c.json(await glimtSearch41(c.get('user'), q));
};
kalender41Api.post('/kalender/glimt/search', authOrToken, searchHandler);
kalender41Api.post('/calendar/ask', authOrToken, searchHandler);
kalender41Api.post('/kalender/notify/test', authOrToken, async (c) => { const b = await c.req.json().catch(() => ({})) ?? {}; return c.json(await testNotify(c.get('user'), { app: 'kalender', delaySec: Math.max(0, Math.min(30, +b.delaySec || 0)) })); });
kalender41Api.post('/push/test', authOrToken, async (c) => {
  const b = await c.req.json().catch(() => ({})) ?? {};
  const app = ['kalender', 'homelab'].includes(b.app) ? b.app : 'homelab';
  return c.json(await testNotify(c.get('user'), { app }));
});
