// Prompt 45 (GLIMT45): Glimt-motoren. Én pipeline for alle innganger (Hjem, Kalender, Gjøremål, Finans, Ruter, Chat):
//   1 forstå (modell → plan, ellers lokal plan) · 2 kontekst (dato, Europe/Oslo, modul, sist viste/valgte) · 3 plan (verktøy + typede argumenter)
//   4 validering (deterministisk dato/tid/beløp, påkrevde felt, mål) · 5 utfør (eksisterende funksjoner, idempotensnøkkel)
//   6 kontroller (les tilbake fra datakilden) · 7 svar (kort og sant, ett spørsmål når noe mangler, personlighet til slutt).
// Destruktive verktøy krever bekreftelse (token). Verktøyvalg logges uten personopplysninger.
import { createHash, randomBytes } from 'node:crypto';
import { db, kv } from '../db.js';
import { TOOL45, setCtx45, ctxOf45, kr45, eventLabel45 } from './tools.js';
import { localPlan45, modelAvailable45, modelInfo45, intentOfCalls45, _glimtModel45 } from './plan.js';
import { modelPlan47, planGap47 } from './plan47.js';
import { buildContext47, rememberTurn47 } from './context.js';
import { recallFacts47 } from './memory47.js';
import { startTrace47 } from './trace47.js';
import { STEP47 } from './params47.js';
import { answer47 } from './answer47.js';
import { SENTENCES47, FAIL_TEXT47 } from './tools47.js';
import { parseEpisodeAsk43 } from './media47.js';
import { parsePeriod45, todayOslo45, nowMinOslo45, longDate45, relDate45, addDays45, WD45, MON45 } from './dates.js';
import { personalityOf, quipFor } from './personality.js';
import { nowLine47 } from './context.js';
import { SENTENCES46, FAIL_TEXT46 } from './tools46.js'; // prompt 46: vær, abonnementer, faste utgifter, avslutningsfrist
import { weatherCompare46 } from './weather46.js';
import { installTaskHooks46 } from './tasks46.js';
import { installPosterDecorator46 } from './calendar46.js';
// Prompt 59 (prompt 49 del 4): svar-cache, strømming (status + tekstbiter), parallelle verktøy – hver for seg av/på (fast59/settings.js).
import { fast59 } from '../fast59/settings.js';
import { cacheKindOf59, legacyKindOf59, planKey59, legacyKey59, cacheGet59, cachePut59 } from '../fast59/cache.js';
import { toolStatus59, legacyStatus59, PLAN_STATUS59, ANSWER_STATUS59, CACHE_STATUS59 } from '../fast59/status.js';
// Prompt 60 (prompt 49 del 3): samtaletilstand, entitetsregister og konkrete valg – krokene ligger i convo60/engine60.js.
import { begin60, ctx60, facts60, afterPlan60, adjust60, finish60, confirmed60, convoTrace60 } from '../convo60/engine60.js';
installTaskHooks46(); installPosterDecorator46(); // Gjøremål: plukk ut, ikke skriv om · plakat på kinoavtaler

db.exec(`CREATE TABLE IF NOT EXISTS glimt45_requests (user_id TEXT NOT NULL, key TEXT NOT NULL, state TEXT NOT NULL, response TEXT, created INTEGER NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS glimt45_confirm (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);`);
const q = (sql) => db.prepare(sql);
const IMPLICIT_MS = 30_000;
const CONFIRM_MS = 10 * 60_000;
const LOG_KEY = 'glimt45_log';
let clock = null;
/** Bare for tester: fast «i dag» og minutt-tall ({today:'YYYY-MM-DD', nowMin}). */
export const _setClock45 = (c) => { clock = c ?? null; };
const todayNow = () => clock?.today ?? todayOslo45();
const minNow = () => clock?.nowMin ?? nowMinOslo45();

/* ---------------- Eksisterende svar (vær, avganger, pakker …) ---------------- */

// var + funksjonsdeklarasjon: assist.js/kalender33.js kan registrere seg før denne modulen er ferdig evaluert (sirkulær import).
var legacy; // eslint-disable-line no-var
/** assist.js og kalender33.js registrerer de eksisterende svarene her (unngår sirkulær import). */
export function registerLegacy45(h) { legacy = { ...(legacy ?? {}), ...h }; }

/* ---------------- Logg uten personopplysninger ---------------- */

function logChoice(user, row) {
  const line = { ts: Date.now(), module: row.module, intent: row.intent, tools: row.tools, statuses: row.statuses, engine: row.engine, ms: row.ms, len: row.len };
  try { kv.set(user, LOG_KEY, [line, ...(kv.get(user, LOG_KEY, []) ?? [])].slice(0, 50)); } catch { /* */ }
  console.log(`[glimt45] modul=${row.module} intent=${row.intent} verktøy=${row.tools.map((t, i) => `${t}:${row.statuses[i] ?? '-'}`).join(',') || '-'} motor=${row.engine} ${row.ms} ms`);
}
export const logOf45 = (user) => kv.get(user, LOG_KEY, []) ?? [];

/* ---------------- Svartekster ---------------- */

const cap = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const when = (date, start, end, today) => `${longDate45(date, today)}${start ? ` kl. ${start}${end ? `–${end}` : ''}` : ''}`;
const periodLabel = (r, today) => (r.from === r.to ? relDate45(r.from, today) : r.label === 'neste uke' || r.label === 'denne uka' || r.label === 'forrige uke' ? `${r.label} (${+r.from.slice(8)}. ${MON45[+r.from.slice(5, 7) - 1].slice(0, 3)}–${+r.to.slice(8)}. ${MON45[+r.to.slice(5, 7) - 1].slice(0, 3)})` : r.label);
const evShort = (c) => `${c.title} ${['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'][new Date(`${c.date}T00:00:00Z`).getUTCDay()]}${c.allDay ? '' : ` ${c.time}`}`;

function sentence(call, r, today) {
  const a = call.args, res = r.result ?? {};
  if (r.status !== 'done') return null;
  if (SENTENCES47[call.tool]) return SENTENCES47[call.tool](a, r, today); // prompt 47: kalendersøk, minne, media, nettsøk
  switch (call.tool) {
    case 'calendar.create': {
      const e = res.event;
      if (res.existing) return `«${e.title}» ${when(e.date, e.time, null, today)} ligger allerede i kalenderen, så jeg la den ikke inn på nytt.`;
      // Prompt 47: «Lagt inn: Dune, Colosseum kino, torsdag 17. desember kl. 17:30.» + antatt varighet når brukeren ikke sa slutt.
      const dur = a.durationAssumed ? ` Slutt kl. ${a.end} er antatt (${a.durationMin % 60 ? `${a.durationMin} min` : `${a.durationMin / 60} t`}${a.durationKind === 'kino' ? ' for kino' : ''}) – si fra hvis den varer lenger.` : '';
      return `Lagt inn: **${e.title}${a.location ? `, ${a.location}` : ''}, ${when(e.date, a.start, null, today)}** i ${a.calendarName ?? 'Personlig'}-kalenderen.${a.place?.address ? ` Adresse: ${a.place.address}.` : ''}${a.allDay ? ' Hele dagen – si fra hvis du vil ha et klokkeslett.' : ''}${a.assumedPm ? ' (Tolket som kveld.)' : ''}${dur}`.replace('i Personlig (Google)-kalenderen', 'i Personlig-kalenderen (Google)');
    }
    case 'calendar.list': {
      const n = res.count, lab = cap(periodLabel(res, today));
      if (!n) return `${lab} har du **ingenting** i kalenderen.`;
      const list = (r.cards ?? []).slice(0, 4).map(evShort);
      return `${lab} har du **${n} ${n === 1 ? 'avtale' : 'avtaler'}**: ${joinNo(list)}${n > 4 ? ` og ${n - 4} til` : ''}.`;
    }
    case 'calendar.search': {
      if (!res.count) return `Fant ingen ${a.past ? 'tidligere' : 'kommende'} avtale med «${a.query}».`;
      const c = r.cards[0];
      return `${a.past ? 'Sist' : 'Neste'} «${a.query}» ${a.past ? 'var' : 'er'} **${c.title} ${when(c.date, c.time, null, today)}**.${res.count > 1 && !a.past ? ` Det er ${res.count} treff i alt.` : ''}`;
    }
    case 'calendar.update': {
      const e = res.event;
      return `Flyttet **«${e.title}»** til **${when(e.date, e.allDay ? null : e.time, e.allDay ? null : e.end, today)}**${a.prev ? ` (var ${when(a.prev.date, a.prev.allDay ? null : a.prev.time, null, today)})` : ''}.`;
    }
    case 'calendar.delete': return `Slettet «${res.deleted.title}» ${when(res.deleted.date, res.deleted.allDay ? null : res.deleted.time, null, today)} fra kalenderen.`;
    case 'tasks.create': {
      const t = res.task;
      if (res.existing) return `«${t.title}» står allerede i Gjøremål${t.date ? ` til ${relDate45(t.date, today)}` : ''}, så jeg la den ikke inn på nytt.`;
      const d = a.due && a.dueLabel ? ` – ${a.dueLabel} (${relDate45(a.due, today)})` : a.due ? ` – ${relDate45(a.due, today)}${a.due !== today && a.due !== addDays45(today, 1) ? '' : ` (${WD45[new Date(`${a.due}T00:00:00Z`).getUTCDay()]} ${+a.due.slice(8)}. ${MON45[+a.due.slice(5, 7) - 1]})`}${a.time ? ` kl. ${a.time}` : ''}` : '';
      return `Lagt i Gjøremål${res.list?.name ? ` (${res.list.name})` : ''}: **${t.title}**${d}${a.note ? `, ${a.note}` : ''}.${a.note && !a.time && /etter|før|når/.test(a.note) ? ' Si fra hvis du vil ha et bestemt klokkeslett for påminnelsen.' : ''}`;
    }
    case 'tasks.list': {
      if (!res.count) return a.filter === 'overdue' ? 'Ingen gjøremål er **forfalt**.' : a.filter === 'today' ? 'Du har **ingen gjøremål** igjen i dag.' : 'Gjøremål-lista er **tom**.';
      return `Du har **${res.count} ${a.filter === 'overdue' ? 'forfalte ' : ''}gjøremål**${a.filter === 'today' ? ' i dag' : a.filter === 'week' ? ' denne uka' : ''}${res.overdue && a.filter !== 'overdue' ? `, ${res.overdue} forfalt` : ''}. Først: ${r.cards[0].title}.`;
    }
    case 'tasks.complete': return `Krysset av **${res.task.title}**.`;
    case 'finance.search': return financeSentence(a, r, today);
    case 'finance.summary': {
      if (res.compare) {
        // Prompt 46: sammenligning (deterministisk): perioden mot den nevnte, og mot samme antall dager i den.
        const what = res.term ?? (res.category ? res.category.toLowerCase() : 'alt');
        const c = res.compare;
        const same = c.sameTo < c.to ? ` (${kr45(c.sameTotal)} til og med ${longDate45(c.sameTo, today)})` : '';
        const ref = c.sameTo < c.to ? c.sameTotal : c.total;
        const diff = Math.round((res.total - ref) * 100) / 100;
        if (!res.count && !c.count) return `Fant **ingen utgifter** til ${what} verken ${res.label} eller ${c.label}.`;
        return `${cap(res.label)} har du brukt **${kr45(res.total)}** på ${what}, mot **${kr45(c.total)}** ${c.label}${same}. ${diff === 0 ? 'Det er det samme.' : `Det er ${kr45(Math.abs(diff))} ${diff > 0 ? 'mer' : 'mindre'}${same ? ' enn i samme del av ' + c.label.replace(/^i\s+/, '') : ''}.`}`;
      }
      if (res.term && res.groupBy === 'total') return res.count ? `Du har brukt **${kr45(res.total)}** på ${res.term} ${res.label}.` : `Fant **ingen utgifter** til ${res.term} ${res.label}.`;
      if (!res.count) return res.category ? `Du har **ikke brukt noe** på ${res.category.toLowerCase()} ${res.label}.` : `Fant **ingen utgifter** ${res.label}.`;
      const [first, ...more] = res.top;
      if (res.groupBy === 'total') return `Du har brukt **${kr45(res.total)}** på ${res.category ? res.category.toLowerCase() : 'alt'} ${res.label}.${res.biggest?.[0] ? ` Mest hos ${res.biggest[0].name} (${kr45(res.biggest[0].amount)}).` : ''}`;
      return `${cap(res.label)} brukte du mest på **${first.name}: ${kr45(first.amount)}** (${first.count} kjøp).${more.length ? ` Deretter ${joinNo(more.slice(0, 2).map((g) => `${g.name} ${kr45(g.amount)}`))}.` : ''} Totalt ${kr45(res.total)}.`;
    }
    case 'nav.open': return `Åpner **${NAV_LABEL[a.target] ?? cap(a.target)}**.`;
    default: return SENTENCES46[call.tool] ? SENTENCES46[call.tool](a, r, today) : null;
  }
}
function financeSentence(a, r, today) {
  const res = r.result, m = res.meta ?? {};
  const where = a.merchant ? ` hos ${a.merchant}` : '';
  const per = a.label ? ` ${a.label}` : '';
  const what = a.item ? ` med «${a.item}»` : '';
  const amt = a.amount != null ? ` på ${kr45(a.amount)}` : a.min != null || a.max != null ? ` ${a.min != null && a.max != null ? `mellom ${kr45(a.min)} og ${kr45(a.max)}` : a.min != null ? `over ${kr45(a.min)}` : `under ${kr45(a.max)}`}` : '';
  if (!res.count) {
    if (a.kind === 'receipt' && !m.receipts) return `Du har **ingen kvitteringer** lagret ennå, så jeg finner ingen${where}${per}.`;
    if (a.item && !m.linesIndexed && !res.semantic) return `Ingen av kvitteringene dine har leste varelinjer ennå, så jeg kan ikke søke etter «${a.item}» i innholdet. Prøv butikk eller beløp.`;
    if (m.merchantUnknown) return `Fant **ingen kjøp${where}**${per}.`;
    if (res.semantic) return `Fant ingen eksakte treff${what}, men ${res.semantic} ${res.semantic === 1 ? 'kvittering ligner' : 'kvitteringer ligner'}.`;
    if (res.withoutReceipt) return `Fant ${res.withoutReceipt} ${res.withoutReceipt === 1 ? 'kjøp' : 'kjøp'}${where}${per}, men **ingen kvittering** er lagret for ${res.withoutReceipt === 1 ? 'det' : 'dem'}.`;
    return `Fant **ingen ${a.kind === 'receipt' ? 'kvitteringer' : 'kjøp'}**${what}${where}${amt}${per}.`;
  }
  const c = r.cards[0];
  // Prompt 46: sortert søk («dyreste kjøp forrige måned», «den dyreste kvitteringen») → det øverste treffet.
  if (a.sort === 'amount_desc' || a.sort === 'amount_asc') {
    const lines = c.lines?.length ? ` Varer: ${c.lines.slice(0, 3).map((l) => l.text).join(', ')}.` : '';
    const rc = a.kind === 'receipt';
    const head = a.sort === 'amount_desc' ? (rc ? 'Den dyreste kvitteringen' : 'Det dyreste kjøpet') : (rc ? 'Den billigste kvitteringen' : 'Det billigste kjøpet');
    return `${head}${a.label ? ` ${a.label}` : ''}${a.merchant ? ` hos ${a.merchant}` : ''} er **${c.title} ${longDate45(c.date, today)}, ${kr45(Math.abs(c.amount ?? 0))}**.${lines}${(res.found ?? 0) > 1 ? ` (av ${res.found} ${rc ? 'kvitteringer' : 'kjøp'})` : ''}`;
  }
  if (res.count === 1) {
    const lines = c.lines?.length ? ` Varer: ${c.lines.slice(0, 3).map((l) => l.text).join(', ')}.` : '';
    return `Fant ${c.receiptId ? 'kvitteringen' : 'kjøpet'}: **${c.title} ${longDate45(c.date, today)}, ${kr45(c.amount ?? 0)}**.${lines}${!c.receiptId ? ' Ingen kvittering er lagret for det.' : ''}`;
  }
  return `Fant **${res.count} ${a.kind === 'receipt' ? 'kvitteringer' : 'kjøp'}**${what}${where}${amt}${per}. Velg den du mener:`;
}
const NAV_LABEL = { kalender: 'Kalender', huskeliste: 'Gjøremål', finans: 'Finans', kvitteringer: 'Kvitteringer', budsjett: 'Budsjett', abonnement: 'Abonnement', vaer: 'Vær', familie: 'Familie', mat: 'Mat', bursdager: 'Bursdager', chat: 'Chat', innstillinger: 'Innstillinger', sporing: 'Sporing', domener: 'Domener', rom: 'Rom', nordlys: 'Nordlys OS' };
const NAV_WEB = { kalender: '/#/kalender', huskeliste: '/#/huskeliste', finans: '/finans/', kvitteringer: '/finans/#/kv', budsjett: '/finans/#/budsjett', abonnement: '/finans/#/abonnement', vaer: '/#/vaer', familie: '/#/familie', mat: '/#/matplan', bursdager: '/#/bursdager', chat: '/#/chat', innstillinger: '/#/innstillinger', sporing: '/#/sporing', domener: '/#/domener', rom: '/#/rom', nordlys: '/#/innstillinger/system' };
const FAIL_TEXT = { 'calendar.create': 'Fikk ikke lagt inn avtalen', 'calendar.update': 'Fikk ikke flyttet avtalen', 'calendar.delete': 'Fikk ikke slettet avtalen', 'tasks.create': 'Fikk ikke lagt inn gjøremålet', 'tasks.complete': 'Fikk ikke krysset av', 'finance.search': 'Fikk ikke søkt i Finans', 'finance.summary': 'Fikk ikke regnet ut forbruket', 'calendar.list': 'Fikk ikke lest kalenderen', 'calendar.search': 'Fikk ikke søkt i kalenderen', 'tasks.list': 'Fikk ikke lest Gjøremål' };
Object.assign(FAIL_TEXT, FAIL_TEXT46, FAIL_TEXT47);
const QUIP_KIND = { 'calendar.create': 'calendar', 'calendar.update': 'calendar', 'tasks.create': 'tasks', 'tasks.complete': 'done', 'calendar.list': 'list', 'tasks.list': 'list', 'calendar.search': 'search' };

/* ---------------- Pipeline ---------------- */

const keyOf = (user, module, text, requestId) => (requestId ? `r:${requestId}` : `i:${createHash('sha256').update(`${user}|${module}|${text.toLowerCase().replace(/\s+/g, ' ').trim()}`).digest('hex').slice(0, 32)}`);
const running = new Map();
const busy = new Map();
export const busyOf45 = (user) => busy.get(user) ?? 0;

/**
 * Hovedinngangen. → svaret (se SERVER45-API.md «Glimt»). opts: {module, context, requestId, today, nowMin, own:Set|null, legacyOk:true}
 * own = verktøy kalleren vil at motoren utfører selv; de andre gir {legacy:true} (bare når legacyOk=false) eller kjører de gamle svarene.
 */
export async function agent45(user, text0, opts = {}) {
  const text = String(text0 ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const module = opts.module ?? 'home';
  // Prompt 60: samtalen og et trykket valg er en del av nøkkelen («den første» i to samtaler er to forskjellige spørsmål).
  const convKey = `${opts.conversationId ? `|c:${opts.conversationId}` : ''}${opts.choice?.setId ? `|v:${opts.choice.setId}:${opts.choice.id}` : ''}`;
  const key = `${opts.preview ? 'p:' : ''}${keyOf(user, `${module}${convKey}`, text, opts.requestId)}`; // prompt 46: forhåndsvisning har egen nøkkel
  const row = q('SELECT * FROM glimt45_requests WHERE user_id=? AND key=?').get(user, key);
  if (row?.state === 'done' && !opts.preview && (opts.requestId || Date.now() - row.created < IMPLICIT_MS)) {
    try { return { ...JSON.parse(row.response), repeated: true }; } catch { /* lag på nytt */ }
  }
  const rk = `${user}|${key}`;
  if (running.has(rk)) { const r = await running.get(rk); return { ...r, repeated: true }; }
  const p = (async () => {
    busy.set(user, busyOf45(user) + 1);
    q('INSERT OR REPLACE INTO glimt45_requests(user_id, key, state, response, created) VALUES(?,?,?,?,?)').run(user, key, 'running', null, Date.now());
    try {
      const c60 = begin60(user, text, { ...opts, module });
      const out = finish60(user, c60, await pipeline(user, c60?.execText ?? text, { ...opts, module, key, c60, ...(c60?.context ? { context: c60.context } : {}) }));
      if (opts.signal?.aborted) throw abortErr59();
      if (opts.preview) q('DELETE FROM glimt45_requests WHERE user_id=? AND key=?').run(user, key); // forhåndsvisning caches ikke
      else if (!out.legacy && !out.retryable) q('UPDATE glimt45_requests SET state=?, response=? WHERE user_id=? AND key=?').run('done', JSON.stringify(out), user, key); // prompt 55: oppfølgingsspørsmålet etter tidsavbrudd caches ikke
      else q('DELETE FROM glimt45_requests WHERE user_id=? AND key=?').run(user, key);
      return out;
    } catch (e) {
      q('DELETE FROM glimt45_requests WHERE user_id=? AND key=?').run(user, key);
      throw e;
    } finally { busy.set(user, Math.max(0, busyOf45(user) - 1)); }
  })();
  running.set(rk, p);
  try { return await p; } finally { running.delete(rk); }
}
/** Prompt 59: Stopp i strømmingen (klienten koblet fra eller /stream/stop). */
export const abortErr59 = () => Object.assign(new Error('Stoppet'), { cancelled: true, kind: 'cancelled' });
const emit59 = (opts, event, data) => { if (typeof opts?.onEvent === 'function') { try { opts.onEvent(event, data); } catch { /* lytteren er borte */ } } };
// Rydd gamle nøkler (beholder 7 dager).
try { q('DELETE FROM glimt45_requests WHERE created < ?').run(Date.now() - 7 * 86400_000); q('DELETE FROM glimt45_confirm WHERE created < ?').run(Date.now() - 86400_000); } catch { /* */ }

// Prompt 47: dato, ukedag, klokkeslett og tidssone er alltid med (context.js). Klokka følger motorens (fryste) klokke.
function nowLineOf(today, nowMin = minNow()) {
  return `${nowLine47(today, nowMin)} (${today}), språk norsk`;
}

async function pipeline(user, text, opts) {
  const t0 = Date.now();
  const today = opts.today ?? todayNow();
  const nowMin = opts.nowMin ?? minNow();
  const context = sanitizeCtx(opts.context);
  const level = personalityOf(user);
  const base = { requestId: opts.requestId ?? null, personality: level };
  if (!text) return { ...base, reply: 'Hva kan jeg hjelpe med?', text: 'Hva kan jeg hjelpe med?', intent: 'ask', module: opts.module, actions: [], results: [], ask: { question: 'Hva kan jeg hjelpe med?' }, engine: 'lokal', ms: 0 };
  // Prompt 47: trace per forespørsel (melding, fakta, plan, normaliserte verdier, verktøy, modellkall, svar, tid per steg).
  const tr = opts.preview ? null : startTrace47(user, text, { module: opts.module });
  // A + B. Kontekst og minne: dato/klokke/tidssone, profil, relevante minnefakta (med hvorfor), siste meldinger.
  const c60 = opts.c60 ?? null;
  // Prompt 60: entitetsregisterets treff («hytta», «Rema») som fakta; samtalens egen historikk og kort tilstand til planleggeren.
  const facts = facts60(user, c60, await recallFacts47(user, text, { embed: !opts.preview }).catch(() => []));
  if (c60) c60.facts = facts;
  const x60 = ctx60(c60);
  const c47 = buildContext47(user, text, { today, nowMin, facts, ...(x60.history ? { history: x60.history } : {}) });
  c47.stateText = x60.stateText;
  tr?.set('facts', facts.map((f) => ({ subject: f.subject, object: f.object, aliases: f.aliases, why: f.why, score: f.score })));
  tr?.set('now', c47.nowLine);
  tr?.step('kontekst og minne');
  // C. Forstå. Tekstmønstrene (legacy.detect, localPlan45) er bare HINT til planleggeren og reserve når modellen er nede.
  // Hurtigvei uten modell bare for helt entydige kommandoer (fastPath47, se under).
  const legacyIntent = legacy?.detect ? (() => { try { return legacy.detect(text, today); } catch { return null; } })() : null;
  const local = localPlan45(text, { module: opts.module, today, legacyIntent, user, nowMin });
  let plan = c60?.choicePlan ?? fastPath47(text, { module: opts.module, legacyIntent }); // prompt 60: svar på et valg = den lagrede planen
  const fast = fast59(user);
  if (opts.signal?.aborted) throw abortErr59();
  // Prompt 59: modellkallene får brukerens Stopp-signal (gaten avbryter kallet).
  const planCall = opts.signal ? (o) => plannerCall47({ ...o, signal: opts.signal }) : plannerCall47;
  if (!plan && !opts.noModel && modelAvailable45()) {
    const info = await modelInfo45(user);
    emit59(opts, 'status', PLAN_STATUS59);
    const mp = modelPlan47(user, text, { ctx: c47, hint: hintOf47(local, legacyIntent), mode: info.mode, call: planCall, trace: tr }).catch((e) => { if (opts.signal?.aborted || e?.cancelled) throw e; console.warn('[glimt47] plan:', String(e?.message ?? e).slice(0, 160)); return null; });
    // Prompt 46: forhåndsvisningen venter maks 3 s på modellen; ellers lokal tolkning (dato/tid er uansett fra teksten).
    let mpl = await (opts.preview ? Promise.race([mp, new Promise((r) => { const t = setTimeout(() => r(null), opts.previewMs ?? 3000); t.unref?.(); })]) : mp);
    // Prompt 55: planleggeren ga opp etter nytt forsøk med thinking (tidsavbrudd/ugyldig plan). Aldri den gamle veien (prat med en
    // modell uten verktøy) og aldri lagring ut fra tekstmønstrene: et kort oppfølgingsspørsmål med konkrete valg. Forhåndsvisningen
    // (Kalender «Skriv en time») bruker fortsatt den lokale tolkningen – den lagrer ingenting.
    if (mpl?.failed) {
      tr?.norm({ plannerFailed: mpl.failed, error: String(mpl.error ?? '').slice(0, 200) });
      if (opts.preview) mpl = null;
      else plan = clarifyPlan55(text, local, legacyIntent, mpl, opts.module);
    }
    // Steg G: dekker planen det tekstmønstrene så (alle steder i værspørsmålet, abonnementsdata, frist)? Ellers ett nytt forsøk med hint.
    const gap = mpl && !mpl.failed && !opts.preview ? planGap47(local, mpl) : null;
    if (gap) {
      tr?.norm({ planGap: gap });
      const p2 = await modelPlan47(user, text, { ctx: c47, hint: `${hintOf47(local, legacyIntent)}. ${gap}`, mode: info.mode, call: planCall, trace: tr }).catch((e) => { if (opts.signal?.aborted || e?.cancelled) throw e; return null; });
      if (p2 && !p2.failed && !planGap47(local, p2)) mpl = { ...p2, attempts: (mpl.attempts ?? 1) + (p2.attempts ?? 1), gapFixed: true };
    }
    if (mpl && !mpl.failed) plan = { ...mpl, module: mpl.calls[0] ? TOOL45[mpl.calls[0].tool]?.module ?? opts.module : opts.module, intent: mpl.calls.length ? (mpl.calls.length > 1 ? 'multi' : intentOfCalls45(mpl.calls)) : 'ask', planIntent: mpl.intent };
  }
  // Modellen nede (eller ikke installert): den lokale planen (samme validering og utførelse). Prompt 55: tidsavbrudd og ugyldige
  // planer gir oppfølgingsspørsmålet over, ikke den lokale planen.
  plan ??= local;
  plan = afterPlan60(c60, plan); // prompt 60: refers_to_previous → manglende argumenter fra samtaletilstanden
  if (c60) tr?.set('convo', convoTrace60(c60));
  if (opts.signal?.aborted) throw abortErr59();
  tr?.set('plan', { engine: plan.engine, model: plan.model ?? null, intent: plan.planIntent ?? plan.intent, calls: plan.calls, ask: plan.ask ?? null, dropped: plan.dropped ?? [], fast: !!plan.fast, attempts: plan.attempts ?? null, hint: plan.engine === 'lokal' ? null : hintOf47(local, legacyIntent), ...(plan.failed ? { failed: plan.failed } : {}) });
  tr?.step('plan');
  const modelPlan = plan.engine !== 'lokal';
  // Én dag fra Hjem («hva skjer i morgen?»): de eksisterende dagsvarene (med vær og første avtale) er riktige og beholdes.
  if (opts.module === 'home' && legacyIntent === 'calendar.day' && plan.calls.length === 1 && plan.calls[0].tool === 'calendar.list') {
    const per = parsePeriod45(text, today, { prefer: 'future' });
    if (!per || per.day) plan = { ...plan, calls: [{ tool: 'app.answer', args: { topic: 'other' } }] };
  }
  const own = opts.own ?? null;
  // Prompt 47: med modellens plan svarer motoren selv på prat og nettsøk (svarsteget, answer47.js). Den lokale planen bruker de
  // eksisterende svarene som før. Kallere med eget verktøyutvalg (own, f.eks. Kalender) får prat tilbake som legacy.
  // (Tester med falsk planlegger uten falskt svarsteg beholder de gamle prat-svarene.)
  const engineTalk = modelPlan && !own && !(_glimtModel45() && !answerImpl47);
  const legacyTools = engineTalk ? ['app.answer'] : ['app.answer', 'chat.answer', 'web.search'];
  const ownedCalls = plan.calls.filter((c) => !legacyTools.includes(c.tool) && (!own || own.has(c.tool)));
  if (!plan.ask && !ownedCalls.length) {
    // Ikke motorens: de eksisterende svarene (vær, avganger, pakker, chat …).
    const lg = { legacy: true, plan, engine: plan.engine, legacyIntent, traceId: tr?.id ?? null };
    if (opts.preview) return { ...base, preview: false, reply: 'Ingen avtale å forhåndsvise.', text: 'Ingen avtale å forhåndsvise.', intent: 'ask', module: opts.module, actions: [], results: [], engine: plan.engine, ms: Date.now() - t0 };
    if (opts.legacyOk === false || !legacy?.answer) { tr?.save({ reply: '(gamle svar)', engine: plan.engine }); return lg; }
    if (opts.module === 'tasks' && plan.calls[0]?.args?.topic === 'tasks37') {
      const { handleGlimt37 } = await import('../tasks-glimt37.js');
      if (handleGlimt37) {
        const r = await handleGlimt37(user, { q: text, ...(context.listId ? { list: context.listId } : {}) });
        const b = r.body ?? {};
        const ok = (r.status ?? 200) < 400;
        const items = (b.items ?? []).map((x) => ({ kind: 'task', id: String(x.id), title: x.title, subtitle: [x.due, x.time].filter(Boolean).join(' · ') || null, date: x.due ?? null, done: !!x.done }));
        const out = { ...base, reply: ok ? b.text : b.error, text: ok ? b.text : b.error, intent: b.kind === 'question' ? 'ask' : 'create', module: 'tasks', actions: [{ tool: 'tasks.glimt', args: {}, status: ok ? 'done' : 'failed', result: { intent: b.intent, count: items.length, undo: b.undo ?? null }, ...(ok ? {} : { error: b.error }) }],
          results: items, joke: null, engine: b.engine === 'glimt' ? 'ollama-json' : 'lokal', model: null, ms: Date.now() - t0, legacyAnswer: b, traceId: tr?.id ?? null };
        logChoice(user, { module: 'tasks', intent: out.intent, tools: ['tasks.glimt'], statuses: [out.actions[0].status], engine: out.engine, ms: out.ms, len: text.length });
        tr?.save(out);
        return out;
      }
    }
    const topic = modelPlan ? plan.calls.find((c) => c.tool === 'app.answer')?.args?.topic ?? null : null;
    // Prompt 59: svar-cache for de gamle svarene som har kjent levetid (strømpris til neste hele time, vær 15 min). Nøkkelen er planen
    // (emne + tekstmønster) + teksten, per bruker. Bare Hjem/Glimt-søket (Kalender har egne svar).
    const lkey = fast.cache && opts.module !== 'calendar' ? legacyKey59(user, { module: opts.module, topic, legacyIntent, text }) : null;
    const lhit = lkey ? cacheGet59(user, lkey) : null;
    if (lhit) {
      emit59(opts, 'status', CACHE_STATUS59);
      const out = { ...lhit.response, ...base, ms: Date.now() - t0, traceId: tr?.id ?? null, cached: true, cache: { ageMs: lhit.ageMs, ttlMs: lhit.ttlMs, kind: lhit.kind } };
      tr?.set('cache', { hit: true, kind: lhit.kind, ageMs: lhit.ageMs, ttlMs: lhit.ttlMs });
      logChoice(user, { module: opts.module, intent: out.intent, tools: ['app.answer'], statuses: ['cache'], engine: out.engine, ms: out.ms, len: text.length });
      tr?.step('svar-cache'); tr?.save(out);
      rememberTurn47(user, text, out.reply);
      return out;
    }
    emit59(opts, 'status', legacyStatus59(legacyIntent));
    const a = opts.module === 'calendar' && legacy?.calendar ? await legacy.calendar(user, text, { today }) : await legacy.answer(user, text, { today, skipAgent: true, module: opts.module, noWeb: opts.webSearch === false, ...(topic ? { topic } : {}) });
    if (opts.signal?.aborted) throw abortErr59();
    const out = { ...base, reply: a.text, text: a.text, intent: plan.calls[0]?.tool === 'chat.answer' ? 'chat' : 'ask', module: opts.module, actions: [{ tool: plan.calls[0]?.tool ?? 'app.answer', args: {}, status: 'done', result: { intent: a.intent, source: a.source } }],
      results: [], legacyAnswer: a, engine: plan.engine, model: plan.model ?? null, ms: Date.now() - t0, ...(a.nav ? { nav: a.nav } : {}), traceId: tr?.id ?? null };
    const lk = lkey ? legacyKindOf59(a, legacyIntent) : null;
    if (lk && cachePut59(user, lkey, lk.kind, lk.ttlMs, out)) tr?.set('cache', { stored: true, kind: lk.kind, ttlMs: lk.ttlMs });
    logChoice(user, { module: opts.module, intent: out.intent, tools: ['app.answer'], statuses: ['done'], engine: plan.engine, ms: out.ms, len: text.length });
    tr?.tool({ tool: out.actions[0].tool, status: 'done', args: { topic }, result: { intent: a.intent, source: a.source } });
    tr?.step('gamle svar'); tr?.save(out);
    rememberTurn47(user, text, out.reply);
    return out;
  }
  const ctxT = { user, text, today, nowMin, context, module: opts.module, preview: !!opts.preview, facts, c47, trace: tr, webSearch: opts.webSearch !== false,
    fast, onEvent: opts.onEvent ?? null, signal: opts.signal ?? null, compare: plan.compare ?? null, c60 }; // prompt 59 · prompt 60
  if (c60) c60.plan = { intent: plan.intent, calls: ownedCalls };
  const out = await executePlan(user, { ...plan, calls: ownedCalls }, ctxT, base, t0);
  if (opts.signal?.aborted) throw abortErr59();
  logChoice(user, { module: opts.module, intent: out.intent, tools: out.actions.map((x) => x.tool), statuses: out.cached ? out.actions.map(() => 'cache') : out.actions.map((x) => x.status), engine: out.engine, ms: out.ms, len: text.length });
  if (tr) { for (const a of out.actions) tr.tool(a); tr.step('verktøy og svar'); tr.save(out); out.traceId = tr.id; }
  if (!opts.preview && !out.ask) rememberTurn47(user, text, out.reply);
  return out;
}

/* ---------------- Prompt 47: hurtigvei, hint og modellkall ---------------- */

// «Entydig» = hele meldingen (ankret ^…$) er én kommando av en kjent form som ikke kan bety noe annet:
//   1. minne-setning: «Nina er frisøren min», «husk at Påhåret er frisøren min», «det var frisør» (parseMemoryIntent: ingen «?»,
//      maks 120 tegn, typeordet må være en kjent type),
//   2. ren navigasjon: «åpne kalender», «gå til budsjett» (verb + sidenavn og ingenting mer),
//   3. Gjøremål-modulens egne kommandoer i Gjøremål («slå sammen like», «pakkeliste», limt inn flere linjer),
//   4. Media: «last ned siste episode fra 9-1-1» (verb først + siste/neste/SxxEyy + episode + av/fra + tittel).
// Alt annet – også spørsmål som ligner («når er neste …», «hva er været …») – går til planleggeren.
const NAV_RE47 = /^(?:kan du\s+)?(?:åpne|gå\s+til|ta\s+meg\s+til|vis\s+meg)\s+(?:siden\s+)?(?:kalender(?:en)?|gjøremål|huskelist(?:a|en)|finans|kvitteringer|budsjett(?:et)?|abonnement(?:er)?|vær(?:et)?|familie|mat(?:plan)?|bursdager|chat|innstillinger|sporing|domener|rom)\s*[.!]?$/i;
const TASKS_CMD47 = /^(?:slå\s+sammen(?:\s+like)?|lag\s+(?:en\s+)?pakkeliste\b.*|lag\s+(?:en\s+)?matplan\b.*|del\s+opp\b.*)$/i;
export function fastPath47(text, { module = 'home', legacyIntent = null } = {}) {
  const t = String(text ?? '').trim();
  const P = (tool, args, why) => ({ intent: 'ask', module, calls: [{ tool, args }], engine: 'lokal', fast: why });
  if (legacyIntent === 'memory.add' && !/\?\s*$/.test(t)) return P('app.answer', { topic: 'memory' }, 'minne');
  if (NAV_RE47.test(t)) return P('app.answer', { topic: 'nav' }, 'navigasjon');
  if (module === 'tasks' && (TASKS_CMD47.test(t) || t.includes('\n'))) return P('app.answer', { topic: 'tasks37' }, 'gjøremål');
  // 4. Media: «last ned/hent siste|neste episode av X», «last ned S09E06 av X» (verbet først, hele setningen er kommandoen).
  const ep = /^(?:kan\s+du\s+)?(?:last\s+ned|hent|søk\s+etter)\s/i.test(t) ? parseEpisodeAsk43(t) : null;
  if (ep) return { ...P('media.episode', { title: ep.title, pick: ep.pick, season: ep.season ?? null, episode: ep.episode ?? null }, 'media'), module: 'media' };
  return null;
}
/**
 * Prompt 55: planleggeren ga opp (tidsavbrudd eller ugyldig plan etter nytt forsøk med thinking). Et kort spørsmål med konkrete valg,
 * ordnet etter det tekstmønstrene tror (bare rekkefølgen – ingenting utføres eller lagres). Hvert valg har `text`: meldingen klienten
 * sender når brukeren trykker på det («Legg i kalenderen: …»).
 */
export function clarifyPlan55(text, local, legacyIntent, failed, module = 'home') {
  const t = String(text ?? '').trim().slice(0, 200);
  const tools = (local?.calls ?? []).map((c) => c.tool);
  const opts = [];
  const add = (id, label, prefix) => { if (!opts.some((o) => o.id === id)) opts.push({ id, label, text: prefix ? `${prefix}: ${t}` : t }); };
  if (tools.includes('calendar.create') || legacyIntent === 'appointment.create' || module === 'calendar') add('calendar', 'Legg det i kalenderen', 'Legg i kalenderen');
  if (tools.includes('tasks.create') || module === 'tasks') add('task', 'Lag et gjøremål', 'Lag et gjøremål');
  if (tools.some((x) => /^calendar\.(search|next|list)$/.test(x))) add('calendar_query', 'Søk i kalenderen', 'Søk i kalenderen etter');
  if (tools.some((x) => /^finance\./.test(x))) add('finance', 'Se i Finans', 'Svar fra Finans');
  if (tools.includes('weather.get')) add('weather', 'Sjekk været', 'Hvordan er været');
  add('calendar', 'Legg det i kalenderen', 'Legg i kalenderen');
  add('task', 'Lag et gjøremål', 'Lag et gjøremål');
  add('answer', 'Bare svar meg', 'Svar kort');
  const why = failed?.failed === 'timeout' ? 'Modellen brukte for lang tid, så jeg har ikke gjort noe ennå.' : 'Jeg klarte ikke å tolke meldingen sikkert, så jeg har ikke gjort noe ennå.';
  return { intent: 'ask', module, calls: [], ask: `${why} Hva vil du at jeg skal gjøre?`, askOptions: opts.slice(0, 4), engine: 'ollama-json', model: failed?.model ?? null, failed: failed?.failed ?? 'invalid', attempts: failed?.attempts ?? 2 };
}
/** Kort hint fra tekstmønstrene til planleggeren (kan være feil – modellen bestemmer). */
export function hintOf47(local, legacyIntent) {
  const parts = [];
  for (const c of (local?.calls ?? []).slice(0, 4)) {
    if (c.tool === 'app.answer' || c.tool === 'chat.answer') continue;
    const r = c.args?._req;
    parts.push(r ? `weather.get(${r.place ?? 'own place'}, ${r.when?.label ?? ''})` : c.tool);
  }
  const L = { departures: 'app.answer(departures)', packages: 'app.answer(packages)', 'sun.daylight': 'app.answer(sun)', 'family.where': 'app.answer(family)', 'trial.create': 'app.answer(trial)', 'calendar.school': 'app.answer(school)', nav: 'nav.open' }[legacyIntent];
  if (L) parts.push(L);
  return [...new Set(parts)].join(', ');
}
/** Planleggerens modellkall: ruten «glimt» (hovedmodellen), steg planner/plannerRetry fra params47, JSON-skjema i format. */
async function plannerCall47(o) {
  const impl = _glimtModel45();
  if (impl) return impl(o);
  const ai = await import('../ai-run.js');
  const sp = STEP47[o.step] ?? STEP47.planner;
  // Prompt 55: tidsgrensen gjelder selve svaret – en kald modell (modellbytte) får lastetiden i tillegg (deadlineAfterLoad i gaten).
  const out = await ai.run('glimt', { user: o.user, system: o.system, prompt: o.prompt, ...(o.mode === 'tools' && o.tools ? { ollamaTools: o.tools } : { schema: o.schema }), step: o.step,
    localOnly: true, background: false, title: 'Glimt · forstår', timeoutMs: sp.timeoutMs, deadlineAfterLoad: true, noRetry: true, retries: 0, ...(o.signal ? { signal: o.signal } : {}) });
  return { toolCalls: out.toolCalls ?? null, text: out.text, data: out.data, model: out.model, tokens: out.tokens, params: out.params, timing: out.timing ?? null };
}
/** Svarstegets modellkall (fritekst og nettsøk): ruten «glimt», steg answer. */
let answerImpl47 = null;
/** Bare for tester: falskt svarsteg ({system, prompt, step, user}) → {text, model}. */
export const _setAnswerModel47 = (fn) => { answerImpl47 = fn ?? null; };
async function answerCall47(o) {
  if (answerImpl47) { const r = await answerImpl47(o); return { text: r?.text ?? '', model: r?.model ?? 'test' }; }
  const ai = await import('../ai-run.js');
  const out = await ai.run('glimt', { user: o.user, system: o.system, prompt: o.prompt, step: 'answer', localOnly: true, background: false, title: 'Glimt · svarer', timeoutMs: STEP47.answer.timeoutMs, noRetry: true, retries: 0,
    ...(o.onToken ? { onToken: o.onToken } : {}), ...(o.signal ? { signal: o.signal } : {}) }); // prompt 59: strømming og Stopp
  return { text: out.text, model: out.model, tokens: out.tokens, params: out.params, timing: out.timing ?? null };
}
// Prompt 46: etterkontroll av modellens plan mot den deterministiske oppdelingen av teksten. Delspørsmål modellen glemte
// («… og temperaturen i New York i morgen»), abonnementsdata den ville svart på fra egen kunnskap, og frist i Subscription OS når
// brukeren vil avslutte et abonnement, legges til. Vær kommer alltid fra oppdelingen (teksten er fasit for sted og tid).
const FAMILY46 = (t) => (t === 'weather.get' ? 'weather' : t === 'finance.subscriptions' || t === 'finance.fixed' ? 'subs' : t === 'subscriptions.trial' ? 'trial' : null);
export function reconcile46(local, model) {
  const lc = local?.calls ?? [];
  const fam = new Set(lc.map((c) => FAMILY46(c.tool)).filter(Boolean));
  if (!fam.size || !model) return model;
  const talk = (c) => c.tool === 'app.answer' || c.tool === 'chat.answer';
  let calls = [...(model.calls ?? [])];
  if (fam.has('weather')) calls = [...calls.filter((c) => c.tool !== 'weather.get' && !talk(c)), ...lc.filter((c) => c.tool === 'weather.get')];
  if (fam.has('subs') && !calls.some((c) => FAMILY46(c.tool) === 'subs')) calls = [...calls.filter((c) => !talk(c) && c.tool !== 'finance.summary'), ...lc.filter((c) => FAMILY46(c.tool) === 'subs')];
  if (fam.has('trial')) {
    calls = calls.filter((c) => !talk(c) && c.tool !== 'calendar.create');
    if (lc.some((c) => c.tool === 'tasks.create') && !calls.some((c) => c.tool === 'tasks.create')) calls.unshift({ tool: 'tasks.create', args: {} });
    if (!calls.some((c) => c.tool === 'subscriptions.trial')) calls.push(lc.find((c) => c.tool === 'subscriptions.trial'));
  }
  if (!calls.length) return local;
  return { ...model, calls, intent: intentOfCalls45(calls), module: model.module, compare: local.compare ?? null, reconciled: true };
}
function sanitizeCtx(c) {
  if (!c || typeof c !== 'object') return {};
  const id = (v) => (typeof v === 'string' || typeof v === 'number') && String(v).length <= 120 ? String(v) : null;
  return { ...(id(c.selectedId) ? { selectedId: id(c.selectedId) } : {}), ...(Array.isArray(c.visibleIds) ? { visibleIds: c.visibleIds.map(id).filter(Boolean).slice(0, 50) } : {}), ...(id(c.listId) ? { listId: id(c.listId) } : {}),
    ...(id(c.calendarId) ? { calendarId: id(c.calendarId) } : {}), ...(id(c.defaultCalendarId) ? { defaultCalendarId: id(c.defaultCalendarId) } : {}) }; // prompt 46: valgt kalender (svar på «Hvilken kalender?»)
}

async function executePlan(user, plan, ctxT, base, t0) {
  const today = ctxT.today;
  const res0 = { ...base, intent: plan.intent, module: plan.calls[0] ? TOOL45[plan.calls[0].tool].module : plan.module, engine: plan.engine, model: plan.model ?? null };
  if (plan.ask && !plan.calls.length) {
    const opt = plan.askOptions ?? null; // prompt 55: konkrete valg når planleggeren ga opp
    return { ...res0, reply: plan.ask, text: plan.ask, intent: 'ask', actions: [], results: (opt ?? []).map((o) => ({ kind: 'option', id: o.id, title: o.label, text: o.text })), ask: { question: plan.ask, ...(opt ? { options: opt } : {}) },
      ...(plan.failed ? { plannerFailed: plan.failed, retryable: true } : {}), ms: Date.now() - t0 };
  }
  // 4. Valider alle kallene før noe utføres.
  const checked = [];
  for (const c of plan.calls) {
    const tool = TOOL45[c.tool];
    let v;
    try { v = await tool.validate(c.args ?? {}, ctxT); } catch (e) { v = { error: String(e?.message ?? e).slice(0, 200) }; }
    if (v.ask) return { ...res0, reply: v.ask.question, text: v.ask.question, intent: 'ask', actions: [{ tool: c.tool, args: c.args ?? {}, status: 'proposed' }], results: (v.ask.options ?? []).map((o) => ({ kind: 'option', id: o.id, title: o.label })), ask: v.ask, ms: Date.now() - t0 };
    if (v.error) return { ...res0, reply: v.error, text: v.error, actions: [{ tool: c.tool, args: c.args ?? {}, status: 'failed', error: v.error }], results: [], ms: Date.now() - t0 };
    if (ctxT.c60) adjust60(user, ctxT.c60, c, v, ctxT.trace); // prompt 60: tid/sted fra forrige tur, entiteter
    checked.push({ tool: c.tool, args: v.args, summary: v.summary ?? null });
    ctxT.trace?.norm({ tool: c.tool, args: publicArgs(v.args) }); // prompt 47: normaliserte verdier (tolkede datoer, steder, beløp, søketermer)
  }
  // Prompt 46: påminnelsen i Gjøremål får samme frist som i Subscription OS når brukeren ikke sa en egen dag.
  const trialC = checked.find((c) => c.tool === 'subscriptions.trial'), taskC = checked.find((c) => c.tool === 'tasks.create');
  if (trialC && taskC && !taskC.args.due) taskC.args.due = trialC.args.date;
  // Prompt 46: forhåndsvisning (Kalender «Skriv en time» → GLIMT FORSTÅR): validert plan, ingenting lagres.
  if (ctxT.preview) {
    const cc = checked.find((c) => c.tool === 'calendar.create');
    const pv = cc ? previewOf46(cc.args, today) : null;
    const text0 = pv ? `${pv.title} · ${pv.line2}${pv.place ? ` · ${pv.place.name}` : ''}` : checked.map((c) => c.summary).filter(Boolean).join(' ') || 'Klar.';
    return { ...res0, preview: pv ?? true, reply: text0, text: text0, actions: checked.map((c) => ({ tool: c.tool, args: publicArgs(c.args), status: 'proposed' })), results: [], ms: Date.now() - t0 };
  }
  // Destruktivt: lagre planen og be om bekreftelse. Ingenting er gjort.
  const destr = checked.filter((c) => TOOL45[c.tool].destructive);
  if (destr.length && !ctxT.confirmed) {
    const token = `c${randomBytes(12).toString('hex')}`;
    q('INSERT INTO glimt45_confirm(token, user_id, payload, created) VALUES(?,?,?,?)').run(token, user, JSON.stringify({ calls: checked, plan: { intent: plan.intent, engine: plan.engine, model: plan.model ?? null }, ctx: { text: ctxT.text, today, module: ctxT.module, context: ctxT.context, conv: ctxT.c60 ? { id: ctxT.c60.conv.id, kind: ctxT.c60.conv.kind } : null } }), Date.now());
    const summary = destr.map((c) => c.summary).filter(Boolean).join(' ') || 'Vil du utføre dette?';
    return { ...res0, reply: summary, text: summary, actions: checked.map((c) => ({ tool: c.tool, args: publicArgs(c.args), status: TOOL45[c.tool].destructive ? 'needs_confirm' : 'proposed' })), results: [],
      confirm: { token, summary, expiresAt: new Date(Date.now() + CONFIRM_MS).toISOString() }, ms: Date.now() - t0 };
  }
  // Prompt 59: svar-cache. Nøkkel = normalisert plan (de validerte kallene med tolkede argumenter) + bruker; bare planer der alle kall
  // er cachebare lesekall (vær 15 min, nettsøk 30 min). Kalender, finans, gjøremål og alt som endrer data caches aldri.
  const ck = ctxT.fast?.cache ? cacheKindOf59(checked) : null;
  const ckey = ck ? planKey59(user, { module: ctxT.module, calls: checked.map((c) => ({ tool: c.tool, args: publicArgs(c.args) })), text: ck.needsText ? ctxT.text : null, compare: plan.compare ?? null }) : null;
  if (ckey) {
    const hit = cacheGet59(user, ckey);
    if (hit) {
      emit59(ctxT, 'status', CACHE_STATUS59);
      ctxT.trace?.set('cache', { hit: true, kind: hit.kind, ageMs: hit.ageMs, ttlMs: hit.ttlMs });
      return { ...hit.response, ...base, ms: Date.now() - t0, cached: true, cache: { ageMs: hit.ageMs, ttlMs: hit.ttlMs, kind: hit.kind } };
    }
  }
  // 5–6. Utfør og kontroller.
  const actions = [], results = [], lines = [], events = [];
  let anyFail = false, quipOutcome = null;
  // Prompt 46: uavhengige lesekall (vær for flere steder) kjøres parallelt; resten i rekkefølge. Resultatene behandles i planens rekkefølge.
  // Prompt 59: med «Parallelle verktøy» på kjøres alle uavhengige lesekall som står etter hverandre samtidig (kalender, finans, vær,
  // nettsøk …). Skrivekall (opprette, flytte, slette, krysse av, lagre minne) kjøres alltid ett og ett. Modellkall går uansett gjennom køen.
  const isPar = (c) => !!TOOL45[c.tool].parallel || (!!ctxT.fast?.parallel && READ_TOOLS59.has(c.tool));
  const runOne = async (c) => {
    const tool = TOOL45[c.tool];
    if (ctxT.signal?.aborted) return { status: 'failed', error: 'Stoppet' };
    emit59(ctxT, 'status', toolStatus59(c));
    let r;
    try { r = await tool.run(c.args, ctxT); } catch (e) { r = { status: 'failed', error: String(e?.message ?? e).slice(0, 300), reconnect: !!e?.reconnect }; }
    if (r.status === 'done' && tool.verify) {
      let ok = false; try { ok = await tool.verify(r, ctxT); } catch { ok = false; }
      if (!ok) r = { status: 'failed', error: 'Datakilden bekreftet ikke endringen', result: r.result };
    }
    return r;
  };
  const outs = new Array(checked.length);
  const groups = [];
  for (let i = 0; i < checked.length;) {
    let j = i;
    while (j < checked.length && isPar(checked[j])) j++;
    if (j > i) { if (j - i > 1) groups.push(checked.slice(i, j).map((c) => c.tool)); const rs = await Promise.all(checked.slice(i, j).map(runOne)); rs.forEach((r, k) => { outs[i + k] = r; }); i = j; continue; }
    outs[i] = await runOne(checked[i]); i++;
  }
  if (groups.length) ctxT.trace?.set('parallel', groups);
  if (ctxT.signal?.aborted) throw abortErr59();
  for (const [ci, c] of checked.entries()) {
    const r = outs[ci];
    actions.push({ tool: c.tool, args: publicArgs(c.args), status: r.status, ...(r.result ? { result: r.result } : {}), ...(r.error ? { error: r.error } : {}) });
    if (r.status === 'done') {
      results.push(...(r.cards ?? []));
      if (Array.isArray(r.events)) events.push(...r.events.slice(0, 20));
      const s = sentence(c, r, today); if (s) lines.push(s);
      rememberCtx(user, c, r, ctxT.module);
      if (!quipOutcome && QUIP_KIND[c.tool] && !r.result?.existing && r.result?.count !== 0) quipOutcome = { kind: QUIP_KIND[c.tool], ok: true, title: c.args.title ?? r.result?.event?.title ?? r.result?.task?.title ?? '' };
    } else { anyFail = true; lines.push(c.tool === 'weather.get' ? `${r.error}${/[.?!]$/.test(r.error ?? '') ? '' : '.'}` : `${FAIL_TEXT[c.tool] ?? 'Det gikk ikke'}: ${r.error}.${r.reconnect ? ' Koble til Google på nytt under Innstillinger → Kalendere.' : ''}`); }
  }
  // Prompt 47 Steg F: prat og nettsøk formuleres av svarsteget (bare verktøydata + kontekst; nettsøk-regelen først).
  // Tekstmønsteret for aktuelle fakta («hvem er statsminister …», nyheter) er et hint: planla modellen bare prat, søkes det likevel.
  const talk = checked.filter((c) => c.tool === 'chat.answer' || c.tool === 'web.search');
  let answerModel = null;
  if (talk.length && ctxT.c47) {
    let webAct = actions.find((x) => x.tool === 'web.search' && x.status === 'done');
    if (!webAct && ctxT.webSearch !== false && checked.some((c) => c.tool === 'chat.answer')) {
      const { routeLocal, webQueryOf } = await import('../tool-router44.js');
      const rl = routeLocal(ctxT.text);
      if (rl.tools.includes('web') && /aktuelle fakta/.test(rl.reason)) {
        emit59(ctxT, 'status', toolStatus59({ tool: 'web.search' }));
        const wr = await TOOL45['web.search'].run({ query: rl.query || webQueryOf(ctxT.text) }, ctxT).catch((e) => ({ status: 'failed', error: String(e?.message ?? e).slice(0, 200) }));
        webAct = { tool: 'web.search', args: { query: rl.query, via: 'hint' }, status: wr.status, ...(wr.result ? { result: wr.result } : {}), ...(wr.error ? { error: wr.error } : {}) };
        actions.push(webAct);
      }
    }
    const web = webAct?.result ? { query: webAct.result.query, hits: webAct.result.hits ?? [] } : null;
    emit59(ctxT, 'status', ANSWER_STATUS59);
    // Prompt 59: svarformuleringen strømmes (token for token) når kalleren lytter; Stopp avbryter modellkallet.
    const onToken = ctxT.onEvent ? (t) => emit59(ctxT, 'token', { t, source: 'model' }) : null;
    const call = onToken || ctxT.signal ? (o) => answerCall47({ ...o, ...(onToken ? { onToken } : {}), ...(ctxT.signal ? { signal: ctxT.signal } : {}) }) : answerCall47;
    const a = await answer47(user, ctxT.text, { ctx: ctxT.c47, web, call, trace: ctxT.trace });
    answerModel = a.model;
    if (a.error) anyFail = true;
    lines.push(a.text);
    if (web?.hits?.length) results.push(...web.hits.slice(0, 3).map((h, i) => ({ kind: 'web', id: `web${i}`, title: h.title, subtitle: h.source, url: h.url })));
  }
  // Prompt 46: sammenligning på tvers av værresultatene («er det varmere i Oslo eller New York i morgen?»).
  const cmpMode = plan.compare ?? checked.find((c) => c.tool === 'weather.get' && c.args.compare)?.args.compare ?? null;
  if (cmpMode) { const cl = weatherCompare46(actions.filter((x) => x.tool === 'weather.get').map((x) => x.result).filter(Boolean), cmpMode); if (cl) lines.push(cl); }
  let reply = lines.filter(Boolean).join(' ');
  const finance = checked.some((c) => c.tool.startsWith('finance.'));
  const joke = anyFail ? null : quipFor(base.personality, { ...(quipOutcome ?? {}), finance, ok: !!quipOutcome }, { seed: base.requestId ?? ctxT.text, today });
  const nav = checked.find((c) => c.tool === 'nav.open');
  const multiChoice = actions.some((a) => (a.tool === 'finance.search' && a.result?.count > 1 && !a.args?.sort) || (a.tool === 'calendar.search' && a.result?.count > 1));
  if (answerModel && !res0.model) res0.model = answerModel;
  const out = { ...res0, reply: joke ? `${reply} ${joke}` : reply, text: joke ? `${reply} ${joke}` : reply, joke, actions, results, events,
    ...(multiChoice ? { choose: true } : {}),
    ...(nav ? { nav: { target: nav.args.target, label: NAV_LABEL[nav.args.target] ?? nav.args.target, web: NAV_WEB[nav.args.target] ?? '/', deepLink: `finanshub://${nav.args.target}`, delayMs: 450 } } : {}),
    ms: Date.now() - t0 };
  // Prompt 59: lagre i svar-cachen bare vellykkede svar (ingen feil, ingen tomme søk, ingen modellfeil).
  const webEmpty = actions.some((x) => x.tool === 'web.search' && !(x.result?.count > 0));
  if (ckey && !anyFail && !webEmpty && cachePut59(user, ckey, ck.kind, ck.ttlMs, out)) ctxT.trace?.set('cache', { stored: true, kind: ck.kind, ttlMs: ck.ttlMs });
  return out;
}
/** Prompt 59: lesekall uten bivirkninger (kan kjøres samtidig med «Parallelle verktøy»). */
const READ_TOOLS59 = new Set(['calendar.list', 'calendar.search', 'calendar.next', 'tasks.list', 'finance.search', 'finance.summary', 'finance.subscriptions', 'finance.fixed', 'weather.get', 'web.search']);
/** Prompt 46: forhåndsvisningen i Kalender (GLIMT FORSTÅR). Linje 1 tittel + kalender, linje 2 dag · tid · varsel, linje 3 sted. */
const REM_LABEL46 = { none: 'uten varsel', '15m': '15 min før', '1h': '1 t før', day: 'dagen før' };
function previewOf46(a, today) {
  const x = new Date(`${a.date}T00:00:00Z`);
  const day = `${cap(WD45[x.getUTCDay()])} ${x.getUTCDate()}. ${MON45[x.getUTCMonth()]}${a.date.slice(0, 4) !== today.slice(0, 4) ? ` ${a.date.slice(0, 4)}` : ''}`;
  const time = a.allDay ? 'hele dagen' : `${a.start}${a.end ? `–${a.end}` : ''}`;
  return { title: a.title, calendarId: a.calendarId, calendarName: a.calendarName, date: a.date, start: a.start, end: a.end, allDay: a.allDay, reminder: a.reminder, location: a.location,
    place: a.place ?? (a.location ? { name: a.location, address: null } : null), movie: a.movie ?? null, line1: a.title, line2: `${day} · ${time}${a.allDay ? '' : ` · ${REM_LABEL46[a.reminder] ?? '1 t før'}`}`,
    line3: a.location ? `📍 ${a.location}${a.place?.address ? ` · ${String(a.place.address).split(',')[0]}` : ''}` : null, locationCorrected: !!a.locationCorrected };
}
const publicArgs = (a) => { const { corrections, prev, event, ...rest } = a ?? {}; return rest; };
function rememberCtx(user, c, r, module) {
  const items = (r.cards ?? []).filter((x) => x.kind === 'event' || x.kind === 'task' || x.kind === 'receipt' || x.kind === 'transaction').slice(0, 10).map((x) => ({ kind: x.kind, id: x.id, title: x.title, date: x.date ?? null }));
  if (items.length) setCtx45(user, { module, tool: c.tool, items });
}

/** POST /confirm: utfører den lagrede planen. → svaret | {error, status} */
export async function confirm45(user, token) {
  const row = typeof token === 'string' ? q('SELECT * FROM glimt45_confirm WHERE token=?').get(token) : null;
  if (!row || row.user_id !== user || Date.now() - row.created > CONFIRM_MS) return { error: 'Bekreftelsen er ukjent eller utløpt. Spør Glimt på nytt.', status: 404 };
  if (row.used) return { error: 'Allerede utført', status: 409 };
  if (q('UPDATE glimt45_confirm SET used=1 WHERE token=? AND used=0').run(token).changes !== 1) return { error: 'Allerede utført', status: 409 };
  const p = JSON.parse(row.payload);
  const ctxT = { user, text: p.ctx.text, today: todayNow(), nowMin: minNow(), context: p.ctx.context ?? {}, module: p.ctx.module, confirmed: true };
  // Planen er allerede validert; kallene kjøres direkte (validate kjøres ikke på nytt, målet er det brukeren bekreftet).
  const fakePlan = { intent: p.plan.intent, engine: p.plan.engine, model: p.plan.model, calls: [] };
  const out = await executeChecked(user, fakePlan, p.calls, ctxT);
  confirmed60(user, p.ctx.conv, out); // prompt 60: tilstanden i samtalen bekreftelsen hørte til
  logChoice(user, { module: p.ctx.module, intent: out.intent, tools: out.actions.map((x) => x.tool), statuses: out.actions.map((x) => x.status), engine: out.engine, ms: out.ms, len: p.ctx.text.length });
  return out;
}
async function executeChecked(user, plan, checked, ctxT) {
  const t0 = Date.now();
  const base = { requestId: null, personality: personalityOf(user) };
  const actions = [], lines = [];
  for (const c of checked) {
    const tool = TOOL45[c.tool];
    let r;
    try { r = await tool.run(c.args, ctxT); } catch (e) { r = { status: e?.status === 404 ? 'done' : 'failed', error: String(e?.message ?? e).slice(0, 300), result: e?.status === 404 ? { deleted: c.args.event, already: true } : undefined }; }
    if (r.status === 'done' && tool.verify && !r.result?.already) { let ok = false; try { ok = await tool.verify(r, ctxT); } catch { ok = false; } if (!ok) r = { status: 'failed', error: 'Datakilden bekreftet ikke endringen' }; }
    actions.push({ tool: c.tool, args: publicArgs(c.args), status: r.status, ...(r.result ? { result: r.result } : {}), ...(r.error && r.status !== 'done' ? { error: r.error } : {}) });
    lines.push(r.status === 'done' ? sentence(c, r, ctxT.today) : `${FAIL_TEXT[c.tool] ?? 'Det gikk ikke'}: ${r.error}.`);
  }
  const reply = lines.filter(Boolean).join(' ');
  return { ...base, reply, text: reply, joke: null, intent: plan.intent, module: TOOL45[checked[0]?.tool]?.module ?? ctxT.module, engine: plan.engine, model: plan.model ?? null, actions, results: [], ms: Date.now() - t0 };
}

export { eventLabel45 };

/** Ser den lokale planen at dette er en handling eller et data-søk motoren tar (brukes før Chat strømmer selv)? */
export function wantsAgent45(text, module = 'home') {
  const p = localPlan45(String(text ?? ''), { module });
  return !!p.ask || p.calls.some((c) => !['app.answer', 'chat.answer'].includes(c.tool));
}

/* ---------------- Bakoverkompatibelt svar for /api/assist ---------------- */

const SRC = { calendar: 'Kalender', tasks: 'Gjøremål', finance: 'Finans', home: 'Glimt', chat: 'Glimt' };
const WD3 = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'];
/** Motorens svar → formen /api/assist alltid har hatt (text, intent, card, events …) + agent:{…}. */
export function toAssist45(g, text, today = todayOslo45(), { caller = 'home' } = {}) {
  const a0 = g.actions?.[0] ?? null;
  const tool = a0?.tool ?? null;
  // Bakoverkompatible navn der det fantes et tilsvarende svar før (appene viser pille/kort ut fra intent).
  const COMPAT = { 'calendar.create': caller === 'calendar' ? 'calendar.create' : 'appointment.create', 'finance.summary': 'finance.spent', 'tasks.list': 'tasks', 'calendar.list': 'calendar.summary' };
  const intent = g.ask ? 'agent.ask' : g.confirm ? 'agent.confirm' : COMPAT[tool] ?? tool ?? 'agent';
  const isAction = !!g.confirm || ['calendar.create', 'calendar.update', 'calendar.delete', 'tasks.create', 'tasks.complete'].includes(tool);
  let card;
  const evs = (g.results ?? []).filter((x) => x.kind === 'event');
  if (evs.length || tool?.startsWith('calendar.')) {
    const d = (typeof a0?.result?.from === 'string' ? a0.result.from : null) ?? evs[0]?.date ?? today;
    const x = new Date(`${d}T00:00:00Z`);
    card = { k: 'calendar', date: d, wd: WD3[x.getUTCDay()], n: x.getUTCDate(), t: relDate45(d, today).replace(/^./, (c) => c.toUpperCase()), sub: `${evs.length} ${evs.length === 1 ? 'hendelse' : 'hendelser'}`,
      items: evs.slice(0, 8).map((e) => ({ id: e.id, time: e.allDay ? 'Hele' : e.time, title: e.title, color: e.color ?? null, place: e.place ?? null, date: e.date })) };
  } else if (tool?.startsWith('tasks.')) {
    const ts = (g.results ?? []).filter((x) => x.kind === 'task');
    card = { k: 'tasks', count: ts.length, items: ts.map((x) => ({ id: x.id, title: x.title, due: x.date, done: !!x.done, overdue: !!(x.date && x.date < today) })) };
  } else if (tool === 'finance.summary') {
    const r = a0.result;
    card = { k: 'finance', total: r.total, currency: 'NOK', category: r.category ?? (r.groupBy === 'category' ? r.top?.[0]?.name ?? null : null), period: { from: r.from, to: r.to, label: r.label }, count: r.count,
      items: r.groupBy === 'total' ? (r.biggest ?? []) : (r.top ?? []).slice(0, 3).map((x) => ({ name: x.name, amount: x.amount, date: null })), ...(r.groupBy !== 'total' ? { groups: r.top } : {}) };
  } else if (tool === 'finance.search') card = { k: 'receipts', count: a0.result?.count ?? 0, items: (g.results ?? []).slice(0, 10) };
  const out = { text: g.reply, bold: [...String(g.reply).matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]), source: SRC[g.module] ?? 'Glimt', intent, kind: isAction ? 'action' : 'question', surface: isAction ? 'pill' : 'inline',
    tool: SRC[g.module] ?? 'Glimt', ...(card ? { card } : {}), ms: g.ms, model: g.engine === 'lokal' ? 'Glimt · verktøy' : 'Glimt · lokal', engine: g.engine === 'lokal' ? 'tool' : 'ollama',
    ...(g.events?.length ? { events: g.events } : {}), ...(g.nav ? { nav: g.nav, target: g.nav.target } : {}),
    agent: { intent: g.intent, module: g.module, actions: g.actions, results: g.results, ...(g.ask ? { ask: g.ask } : {}), ...(g.confirm ? { confirm: g.confirm } : {}), personality: g.personality, joke: g.joke ?? null, engine: g.engine, requestId: g.requestId } };
  if (tool === 'calendar.create' && a0.status === 'done' && a0.result?.eventId) out.created = { event: g.events?.[0] ?? a0.result.event, undo: a0.result.undo };
  out.chatContext = { q: text, intent, messages: [{ role: 'user', content: text }, { role: 'assistant', content: g.reply, ...(card ? { card } : {}) }] };
  return out;
}
