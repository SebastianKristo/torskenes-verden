// Prompt 39 (SERVER39): Glimt følger opp og forklarer fag (claude-code-glimt-oppfolging-fag.md).
// Brukes av Kalender-Glimt (kalender33.js calendarAnswer, POST /api/assist source:'calendar'), ✦ Spør i kalendersøket
// (calendar-glimt.js askCalendar) og Homelab-Glimt (assist.js answer).
//
// Samtalehukommelse: hendelsene fra forrige svar huskes per bruker i 10 min (ctx). Oppfølging som «hva slags fag er det»,
// «hva er det», «forklar», «fortell mer» bruker ctx (Studie/Skole-hendelser); mangler ctx, brukes dagens skoletimer.
// Svarformer (fagAnswer → null eller):
//   {text, kind:'fag'|'lessons'|'followup', engine:'lokal'|'ollama', events:[…], subjects:[{name, code, about}], followUp:true?}
//   «hva slags timer har jeg i dag» → «I dag har du fysikk kl. 08.15 og matematikk kl. 10.00.»
//   «hva slags fag er det»          → «Det er fysikk kl. 08.15. Fysikk er naturvitenskapen om …»
//   «hva er fysikk»                 → forklaring + «Neste gang du har det er tirsdag 21. oktober kl. 08.15.»
//   ukjent tittel («test»)          → «Jeg vet ikke hvilket fag «test» er. Gi hendelsen et fagnavn, så kan jeg forklare.»
// Lokal fagordbok er alltid tilgjengelig. Server-LLM (ruten «Glimt · kalender», 45 s) brukes bare for emnekoder ordboka ikke kjenner;
// tidsavbrudd gir lokalt svar uten feilmelding.
import { eventsFor } from './calendar.js';
import { runAsUser } from './settings.js';
import { run as aiRun } from './ai-run.js';
import { parseDay } from './parse-day35.js';
import { osloTodayISO } from '../public/js/quick-time.js';

const MOCK = process.env.MOCK_DATA === '1';
export const FAG_TTL_MS = 10 * 60_000;
export const FAG_LLM_MS = 45_000;
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const ymd = (s) => s.split('-').map(Number);
const addDays = (s, n) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const wdOf = (s) => { const [y, m, d] = ymd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dLong = (s) => { const [, m, d] = ymd(s); return `${WD[wdOf(s)]} ${d}. ${MON[m - 1]}`; };
const HMF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hmDot = (e) => (e.allDay || !e.start ? null : HMF.format(new Date(e.start)).replace(':', '.'));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------------- Fagordbok ---------------- */
// [regex (mot tittel/fag/emnekode), navn (liten forbokstav), 1–2 setninger]
export const FAG = [
  [/\bin2010\b/i, 'algoritmer og datastrukturer', 'IN2010 handler om algoritmer og datastrukturer: hvordan man lagrer data (lister, trær, grafer, hashtabeller) og løser problemer effektivt, som sortering, søk og korteste vei.'],
  [/\bin1000\b/i, 'introduksjon til objektorientert programmering', 'IN1000 er en innføring i programmering med Python: variabler, løkker, funksjoner, klasser og objekter.'],
  [/\bin1010\b/i, 'objektorientert programmering', 'IN1010 handler om objektorientert programmering i Java: klasser, arv, grensesnitt, lenkede lister og rekursjon.'],
  [/\bfysikk|\bfys\s?\d{3,4}\b|\bfy[12]\b|\bfysikk ?[12]\b/i, 'fysikk', 'Fysikk er naturvitenskapen om materie, energi, bevegelse og krefter – alt fra hvorfor ting faller til hvordan lys, elektrisitet og atomer oppfører seg.'],
  [/\bmekanikk|\bmek\s?\d{3,4}\b/i, 'mekanikk', 'Mekanikk er den delen av fysikken som handler om krefter og bevegelse: Newtons lover, energi, bevegelsesmengde og svingninger.'],
  [/\bmatematikk|\bmatte\b|\bmat\s?\d{3,4}\b|\b(r1|r2|s1|s2|1t|1p|2p)\b|\bkalkulus|\blineær algebra|\bstatistikk|\bstk\s?\d{3,4}\b/i, 'matematikk', 'Matematikk handler om tall, mønstre og strukturer – algebra, funksjoner, geometri, sannsynlighet og derivasjon – og om å resonnere seg fram til sikre svar.'],
  [/\bkjemi|\bkjm\s?\d{3,4}\b|\bkj[12]\b/i, 'kjemi', 'Kjemi er læren om stoffene: hva de er bygd opp av, hvordan atomer bindes sammen og hvordan stoffer reagerer med hverandre.'],
  [/\bbiologi|\bbio\s?\d{3,4}\b|\bbi[12]\b/i, 'biologi', 'Biologi er læren om livet – celler, gener, evolusjon, økologi og hvordan kroppen og andre organismer fungerer.'],
  [/\binformatikk|\bin\s?\d{4}\b|\bprogrammering|\bit[12]\b/i, 'informatikk', 'Informatikk handler om datamaskiner og programmering: hvordan man beskriver problemer som algoritmer, skriver kode og bygger systemer.'],
  [/\bnorsk|\bnor\s?\d{3,4}\b/i, 'norsk', 'Norsk handler om språk, litteratur og kommunikasjon: lese og tolke tekster, skrive godt og forstå språkhistorie og sjangre.'],
  [/\bengelsk|\beng(elsk)?\s?\d{3,4}\b|\benglish\b/i, 'engelsk', 'Engelsk handler om å forstå, snakke og skrive engelsk, og om litteratur og kultur i engelsktalende land.'],
  [/\bhistorie|\bhis\s?\d{3,4}\b/i, 'historie', 'Historie handler om fortiden – hendelser, samfunn og mennesker – og om hvordan vi bruker kilder for å forstå hvordan verden ble som den er.'],
  [/\bsamfunnsfag|\bsamfunnskunnskap|\bsamf\b|\bsosiologi|\bstatsvitenskap|\bstv\s?\d{3,4}\b/i, 'samfunnsfag', 'Samfunnsfag handler om hvordan samfunnet er organisert: politikk, demokrati, økonomi, kultur og hvordan mennesker lever sammen.'],
  [/\bgeografi|\bgeo\s?\d{3,4}\b/i, 'geografi', 'Geografi handler om jorda og hvordan mennesker bruker den: landskap, klima, naturressurser, befolkning og byer.'],
  [/\bkrle\b|\breligion|\betikk\b|\bfilosofi|\bexphil\b/i, 'religion og etikk', 'Religion og etikk handler om verdens religioner og livssyn, om etiske spørsmål og om hvordan vi tenker om rett og galt.'],
  [/\bkroppsøving|\bgym\b|\bkrø\b/i, 'kroppsøving', 'Kroppsøving handler om bevegelse, idrett, helse og samarbeid – å lære ulike aktiviteter og ta vare på kroppen.'],
  [/\bspansk|\btysk|\bfransk|\bfremmedspråk|\bitaliensk|\bjapansk|\bkinesisk/i, 'fremmedspråk', 'Fremmedspråk handler om å lære et nytt språk – ord, grammatikk og uttale – og om kulturen i landene der det snakkes.'],
  [/økonomi|\bsamfunnsøkonomi|\bbedriftsøkonomi|\becon\s?\d{3,4}\b|\bsøk\s?\d{3,4}\b|\bmarkedsføring|\bregnskap/i, 'økonomi', 'Økonomi handler om hvordan mennesker, bedrifter og stater bruker begrensede ressurser – pris, marked, produksjon, penger og budsjett.'],
  [/\bpsykologi|\bpsyk\s?\d{3,4}\b/i, 'psykologi', 'Psykologi er læren om hvordan mennesker tenker, føler og handler – hukommelse, læring, utvikling og psykisk helse.'],
  [/\bmusikk/i, 'musikk', 'Musikk handler om å lytte til, lage og fremføre musikk, og om musikkteori og musikkhistorie.'],
  [/\bkunst og håndverk|\bkunst\b|\bdesign\b/i, 'kunst og håndverk', 'Kunst og håndverk handler om å skape med form, farge og materialer, og om design og kunsthistorie.'],
];
const CODE = /\b([A-ZÆØÅ]{2,6})\s?(\d{3,4})\b/;
/** Faget for en hendelse (tittel, fag, emnekode). → {name, code, about, known} */
export function fagOf(e) {
  const hay = `${e?.subject ?? ''} ${e?.subjectKey ?? ''} ${e?.title ?? ''}`;
  const code = String(e?.title ?? '').match(CODE) ?? String(e?.subjectKey ?? '').match(CODE);
  const codeStr = code ? `${code[1]}${code[2]}` : null;
  for (const [re, name, about] of FAG) if (re.test(hay)) return { name, code: codeStr, about, known: true };
  return { name: codeStr ?? String(e?.title ?? '').trim(), code: codeStr, about: null, known: false };
}
/** Faget i en fritekst («fysikk», «kjemi», «IN2010»). */
export function fagInText(t) {
  for (const [re, name, about] of FAG) if (re.test(t)) return { name, about, code: String(t).match(CODE)?.[0]?.replace(/\s/, '') ?? null, known: true };
  return null;
}
const isStudy = (e) => ['time', 'prove', 'innl'].includes(e.type) || ['timeplan', 'prover', 'skole'].includes(e.calendar) || ['skole', 'studie'].includes(e.appCalendar);
const sortEv = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (hmDot(a) ?? '') < (hmDot(b) ?? '') ? -1 : 1);

/* ---------------- Samtalehukommelse ---------------- */

const mem = new Map(); // user → {at, q, events}
const slim = (e) => ({ id: e.id, title: e.title, subject: e.subject ?? null, subjectKey: e.subjectKey ?? null, date: e.date, start: e.start, end: e.end, allDay: !!e.allDay, type: e.type,
  calendar: e.calendar, appCalendar: e.appCalendar ?? null, room: e.room ?? '', note: e.note ?? null });
/** Husk hendelsene fra svaret (tomme lister glemmes ikke: da beholdes forrige ctx). */
export function rememberCtx(user, q, events) {
  if (!user || !Array.isArray(events) || !events.length) return;
  mem.set(user, { at: Date.now(), q: String(q ?? '').slice(0, 200), events: events.slice(0, 8).map(slim) });
  if (mem.size > 500) mem.delete(mem.keys().next().value);
}
export function recallCtx(user, now = Date.now()) {
  const m = mem.get(user);
  if (!m || now - m.at > FAG_TTL_MS) return null;
  return m;
}
export const _forgetCtx = (user) => (user ? mem.delete(user) : mem.clear());

/* ---------------- Tolking ---------------- */

const FOLLOW = /^(og\s+)?(hva\s+(slags|for\s+(et|en|noe|noen)?)\s+(fag|time|timer|emne|emner|ting)\b.*\b(er|var|blir)\s+(det|de|den|dette)\b|hvilke[nt]?\s+(fag|timer|emne)\s+(er|var)\s+(det|de|den)|hva\s+(er|var)\s+(det|de|den|dette)\s*$|hva\s+betyr\s+det|forklar(\s+(det|den|faget|meg))?\s*$|fortell(\s+meg)?\s+(mer|om\s+(det|den|faget|timen))|hva\s+(handler|går)\s+(det|den|faget|de|timen)\s+(ut\s+)?på|hva\s+lærer\s+(man|jeg|vi|du)\s+(der|da|i\s+det|i\s+den))/i;
const LESSONS = /\b(hva\s+(slags|for)\s+(timer|fag|forelesning\w*|undervisning|emner)|hvilke\s+(timer|fag|forelesning\w*|emner)|hva\s+har\s+jeg\s+på\s+skolen|hvilke\s+timer)\b/i;
const DIRECT = /^(?:hva\s+er|hva\s+betyr|hva\s+lærer\s+(?:man|du|jeg|vi)\s+i|hva\s+handler|forklar|fortell\s+(?:meg\s+)?om|hva\s+går)\s+(.+?)\s*(?:ut\s+på|om)?\s*\??$/i;
export const isFollowUp = (t) => FOLLOW.test(norm(t).replace(/[?!.]+$/, ''));

function sentenceFor(list, today) {
  const parts = list.map((e) => { const f = fagOf(e); const t = hmDot(e); return `${f.known ? f.name : `«${e.title}»`}${t ? ` kl. ${t}` : ''}`; });
  return parts;
}
async function nextOf(load, today, fag) {
  const L = (await load(today, addDays(today, 60))).filter((e) => isStudy(e) && fagOf(e).name === fag.name && (e.date > today || (e.date === today && (!e.end || Date.parse(e.end) > Date.now())))).sort(sortEv);
  return L[0] ?? null;
}
let llmImpl = null;
/** Bare for tester: (prompt, user) → tekst | kaster. */
export const _setFagLlm = (fn) => { llmImpl = fn; };
async function llmAbout(user, name, events) {
  if (llmImpl) return llmImpl(name, user);
  if (MOCK && !process.env.OLLAMA_URL) return null;
  const ctx = events.slice(0, 6).map((e) => `${e.date} ${hmDot(e) ?? 'hele dagen'} ${e.title}${e.room ? ` (${e.room})` : ''}`).join('\n');
  const out = await aiRun('glimt', { user, temperature: 0.2, numPredict: 140, timeoutMs: FAG_LLM_MS, title: 'Glimt · forklar fag',
    system: 'Du er Glimt, kalender-assistent. Svar kort på norsk. Du kan forklare fag og begreper generelt, ikke bare kalenderdata. Oppfølgingsspørsmål viser til forrige svar.',
    prompt: `Hendelser:\n${ctx}\n\nForklar i én eller to setninger hva faget/emnet «${name}» handler om. Kjenner du ikke emnekoden, si det kort.` });
  return String(out.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || null;
}
function aboutSentence(f) { return f.about ?? null; }

/**
 * Svarer på fag-spørsmål og oppfølginger. load(from, to) → hendelser (standard eventsFor). → svar eller null (ikke et fag-spørsmål).
 */
export async function fagAnswer(user, text, { today = osloTodayISO(), load = null, followNeedsCtx = false } = {}) {
  const raw = String(text ?? '').trim();
  const t = norm(raw).replace(/[?!.]+$/, '');
  if (!t) return null;
  const L = load ?? (async (a, b) => (await runAsUser(user, () => eventsFor(user, a, b))).events);
  const out = (txt, kind, events = [], subjects = [], extra = {}) => ({ text: txt, kind, engine: extra.engine ?? 'lokal', events: events.slice(0, 6), subjects, ...extra });

  // 4. «hva slags timer har jeg [dag]»
  if (LESSONS.test(t) && !FOLLOW.test(t)) {
    const pd = parseDay(raw, today);
    const d = pd?.date ?? today, lbl = pd?.label ?? (d === today ? 'i dag' : dLong(d));
    const day = (await L(d, d)).filter((e) => (e.allDay ? e.date <= d && e.end > d : e.date === d)).sort(sortEv);
    const study = day.filter(isStudy);
    const list = study.length ? study : [];
    if (!list.length) return out(`${cap(lbl)} har du ingen timer på timeplanen.${day.length ? ` Du har ${day.length} andre ${day.length === 1 ? 'ting' : 'ting'} i kalenderen.` : ''}`, 'lessons', day);
    const parts = sentenceFor(list, today);
    const subjects = [...new Map(list.map((e) => fagOf(e)).filter((f) => f.known).map((f) => [f.name, f])).values()];
    return out(`${cap(lbl)} har du ${joinNo(parts)}.`, 'lessons', list, subjects);
  }
  // 1–2. Oppfølging med ctx (eller dagens skoletimer)
  if (FOLLOW.test(t) && (!followNeedsCtx || recallCtx(user))) {
    const ctx = recallCtx(user);
    let events = ctx?.events ?? [];
    let study = events.filter(isStudy);
    if (!study.length && !events.length) {
      const d = (await L(today, today)).filter((e) => e.date === today).sort(sortEv);
      study = d.filter(isStudy);
      events = d;
    }
    if (!study.length && events.length) {
      // Ikke skole: fortell om hendelsen fra forrige svar.
      const e = events[0];
      const when = `${e.date === today ? 'i dag' : dLong(e.date)}${hmDot(e) ? ` kl. ${hmDot(e)}` : ''}`;
      return out(`Det er **${e.title}** ${when}${e.room ? `, ${e.room}` : ''}.${e.note ? ` ${String(e.note).slice(0, 200)}` : ''}`, 'followup', [e], [], { followUp: true });
    }
    if (!study.length) return out('Du har ingen skoletimer i dag. Spør gjerne om et fag, f.eks. «hva er fysikk».', 'followup', [], [], { followUp: true });
    const fs = study.map((e) => ({ e, f: fagOf(e) }));
    const known = fs.filter((x) => x.f.known);
    if (!known.length) {
      // Emnekode ordboka ikke kjenner: spør modellen (45 s), ellers vennlig beskjed.
      const x = fs[0];
      if (x.f.code) {
        try { const a = await llmAbout(user, x.f.code, study); if (a) return out(`Det er **${x.f.code}**${hmDot(x.e) ? ` kl. ${hmDot(x.e)}` : ''}. ${a}`, 'fag', study, [{ name: x.f.code, code: x.f.code, about: a }], { engine: 'ollama', followUp: true }); } catch { /* lokalt svar under */ }
      }
      return out(`Jeg vet ikke hvilket fag «${x.e.title}» er. Gi hendelsen et fagnavn, så kan jeg forklare.`, 'fag', study, [], { followUp: true, unknown: true });
    }
    const first = known[0];
    const subjects = [...new Map(known.map((x) => [x.f.name, x.f])).values()];
    const head = fs.length === 1 ? `Det er **${first.f.name}**${hmDot(first.e) ? ` kl. ${hmDot(first.e)}` : ''}.`
      : `${study[0].date === today ? 'I dag' : cap(dLong(study[0].date))} har du ${joinNo(sentenceFor(study, today))}.`;
    return out(`${head} ${cap(aboutSentence(first.f))}`, 'fag', study, subjects, { followUp: true });
  }
  // 3. «hva er fysikk», «hva lærer man i kjemi»
  const m = t.match(DIRECT);
  if (m) {
    const f = fagInText(m[1]);
    if (!f) return null;
    const nx = await nextOf(L, today, f).catch(() => null);
    const when = nx ? ` Neste gang du har det er ${nx.date === today ? 'i dag' : nx.date === addDays(today, 1) ? 'i morgen' : dLong(nx.date)}${hmDot(nx) ? ` kl. ${hmDot(nx)}` : ''}.` : '';
    return out(`${cap(f.about)}${when}`, 'fag', nx ? [nx] : [], [f]);
  }
  return null;
}
