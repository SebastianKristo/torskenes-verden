// Prompt 31: gratis prøveperioder – felles tolker for «Viaplay gratis i 14 dager, påminn meg om å avslutte»
// og «Storytel prøve til 25.11, 179 kr». Ren ES-modul uten DOM (som quick-time.js): brukes av serveren
// (import '../public/js/trial-parse.js'), web, PWA og som fasit for iOS/Android.
//
// parseTrial(text, todayISO?) → {
//   ok,                     true når tjeneste og sluttdato er funnet
//   isTrial,                teksten ser ut som en prøveperiode (prøve, gratis, avslutt, si opp, oppsigelse, trial)
//   service,                «Viaplay» (kjent liste, ellers første ord med stor forbokstav) eller ''
//   endsAt,                 'YYYY-MM-DD' eller null
//   priceAfter,             tall i kr (179) eller null
//   priceLabel,             '179 kr/mnd' eller ''
//   remindOffsetsDays,      [1] (standard: 1 dag før kl. 09:00)
//   cancelUrl,              kjent oppsigelsesside for tjenesten, ellers null
//   missing,                ['service'|'endsAt'] – det som mangler
//   question                kort spørsmål når noe mangler (vises i boblen / Chat), ellers null
// }
// Alle datoer er kalenderdatoer (UTC-midnatt internt); uten todayISO brukes dagens dato i Europe/Oslo.

import { osloTodayISO } from './quick-time.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const mk = (y, m, d) => { const x = new Date(Date.UTC(y, m, d)); return x.getUTCMonth() === m && x.getUTCDate() === d ? x : null; };
const addDaysD = (d, n) => new Date(d.getTime() + n * 864e5);
function todayOf(t) {
  const s = typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t instanceof Date ? osloTodayISO(t) : osloTodayISO();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addMonths(d, n) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

export const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MN3 = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

/** Kjente tjenester (lengste navn først der de overlapper) og oppsigelsessider. Lenkene kan endre seg; de er en snarvei, ikke en garanti. */
export const TRIAL_SERVICES = [
  ['Viaplay', /viaplay/, 'https://viaplay.no/account/subscription'],
  ['Netflix', /netflix/, 'https://www.netflix.com/cancelplan'],
  ['HBO Max', /hbo\s*max|\bhbo\b/, 'https://auth.max.com/subscription'],
  ['Disney+', /disney\s*\+|disney\s*plus|disney/, 'https://www.disneyplus.com/account/subscription'],
  ['Spotify', /spotify/, 'https://www.spotify.com/no/account/subscription/cancel/'],
  ['TV 2 Play', /tv\s*2\s*play|tv2\s*play|tv\s*2/, 'https://play.tv2.no/konto'],
  ['Storytel', /storytel/, 'https://www.storytel.com/no/account'],
  ['BookBeat', /book\s*beat/, 'https://www.bookbeat.com/no/account'],
  ['Apple TV+', /apple\s*tv/, 'https://support.apple.com/no-no/118428'],
  ['Apple Music', /apple\s*music/, 'https://support.apple.com/no-no/118428'],
  ['iCloud+', /icloud/, 'https://support.apple.com/no-no/118428'],
  ['YouTube Premium', /youtube/, 'https://www.youtube.com/paid_memberships'],
  ['Amazon Prime', /amazon|prime\s*video/, 'https://www.amazon.com/mc/pipelines/cancellation'],
  ['Audible', /audible/, 'https://www.audible.com/account/overview'],
  ['Strava', /strava/, 'https://www.strava.com/account'],
  ['Tidal', /tidal/, 'https://account.tidal.com/subscription'],
  ['ChatGPT', /chat\s*gpt|openai/, 'https://chatgpt.com/#settings/Subscription'],
  ['Duolingo', /duolingo/, 'https://www.duolingo.com/settings/subscription'],
  ['Adobe', /adobe|photoshop|lightroom/, 'https://account.adobe.com/plans'],
  ['Canva', /canva/, 'https://www.canva.com/settings/billing-and-teams'],
  ['Discovery+', /discovery/, 'https://www.discoveryplus.com/no/account'],
  ['SkyShowtime', /sky\s*showtime/, 'https://www.skyshowtime.com/no/account'],
  ['Nextory', /nextory/, 'https://www.nextory.com/no/account'],
  ['Max', /(^|[^a-zæøå])max([^a-zæøå]|$)/, 'https://auth.max.com/subscription'],
];
/** Tabell for klientene: [{name, cancelUrl}] */
export const CANCEL_LINKS = TRIAL_SERVICES.map(([name, , cancelUrl]) => ({ name, cancelUrl }));
export function cancelUrlFor(service) {
  const s = String(service ?? '').toLowerCase();
  if (!s) return null;
  const hit = TRIAL_SERVICES.find(([n, re]) => n.toLowerCase() === s || re.test(s));
  return hit ? hit[2] : null;
}

export const TRIAL_INTENT = /pr(ø|o)ve|gratis|avslutt|si opp|oppsig|trial/i;
export const isTrialText = (text) => TRIAL_INTENT.test(String(text ?? ''));

/** VARSLE MEG-valgene i skjemaet. */
export const REMIND_OPTIONS = [{ days: 0, label: 'Samme dag' }, { days: 1, label: '1 dag før' }, { days: 3, label: '3 dager før' }, { days: 7, label: '1 uke før' }];
export const DEFAULT_OFFSETS = [1];

const NUM = { en: 1, ett: 1, ei: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12, fjorten: 14, femten: 15, tjue: 20, tjuefem: 25, tretti: 30, førti: 40, seksti: 60, nitti: 90 };
const MONTH_RE = /(\d{1,2})\.?\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\.?(?:\s+(\d{4}))?/;
const SKIP_WORD = /^(gratis|påminn|påmind|prøve|prøven|prøveperiode|prøveperioden|minn|husk|jeg|si|avslutt|avslutte|start|startet|har|ny|nytt|en|et|kr|i|til|meg|om|the|trial|free|når|hva|hvor|hvem|hvordan|hvilken|hvilke|kan|er|skal|lag|legg|sett|neste|min|mitt|mine|det|den)$/i;

/** Sluttdato fra varighet («14 dager», «1 uke», «en måned») eller dato («25.11», «til 3. desember»). */
export function endDateOf(text, todayISO) {
  const t = String(text ?? '').toLowerCase();
  const today = todayOf(todayISO);
  const numWord = Object.keys(NUM).sort((a, b) => b.length - a.length).join('|');
  const dur = t.match(new RegExp(`(\\d+|${numWord})\\s*(dager|dagers|dag|døgn|uker|ukers|uke|måneder|måneders|måned|mnd|år)(?![a-zæøå])`));
  if (dur) {
    const n = /^\d+$/.test(dur[1]) ? +dur[1] : NUM[dur[1]];
    const u = dur[2];
    if (n > 0 && n <= 400) {
      if (/uke/.test(u)) return iso(addDaysD(today, 7 * n));
      if (/m(å|a)ned|mnd/.test(u)) return iso(addMonths(today, n));
      if (u === 'år') return iso(addMonths(today, 12 * n));
      return iso(addDaysD(today, n));
    }
  }
  if (/\b(en|1)\s*måneds?\b|månedlig prøve/.test(t)) return iso(addMonths(today, 1));
  const y0 = today.getUTCFullYear();
  const future = (y, m, d, explicitYear) => {
    let x = mk(y, m, d);
    if (!x) return null;
    if (!explicitYear && x < today) x = mk(y + 1, m, d);
    return x ? iso(x) : null;
  };
  const dm = t.match(/(?:^|[^\d])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d])/);
  if (dm) {
    const y = dm[3] ? (dm[3].length <= 2 ? 2000 + +dm[3] : +dm[3]) : y0;
    const r = future(y, +dm[2] - 1, +dm[1], !!dm[3]);
    if (r) return r;
  }
  const mn = t.match(MONTH_RE);
  if (mn) {
    const r = future(mn[3] ? +mn[3] : y0, MN3.indexOf(mn[2]), +mn[1], !!mn[3]);
    if (r) return r;
  }
  if (/\bi morgen\b/.test(t)) return iso(addDaysD(today, 1));
  return null;
}

/** Pris etter prøven: «179 kr», «kr 179», «149,-», «99 kroner», «149 kr/mnd». → tall i kr eller null. */
export function priceOf(text) {
  const t = String(text ?? '');
  const m = t.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:kr\b|kroner|nok\b|,-)/i) || t.match(/(?:kr|nok)\.?\s*(\d{1,5}(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v < 100000 ? v : null;
}
const priceText = (v) => (v == null ? '' : `${Number.isInteger(v) ? v : String(v.toFixed(2)).replace('.', ',')} kr/mnd`);

export function serviceOf(text) {
  const raw = String(text ?? '').trim();
  const t = raw.toLowerCase();
  const hit = TRIAL_SERVICES.find(([, re]) => re.test(t));
  if (hit) return hit[0];
  const w = raw.split(/\s+/).map((x) => x.replace(/[,.:;!?«»"()]/g, '')).find((x) => /^[A-ZÆØÅ][\wæøåÆØÅ+&-]*$/.test(x) && !SKIP_WORD.test(x));
  return w ? w.slice(0, 60) : '';
}

export function parseTrial(text, todayISO) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const service = serviceOf(raw);
  const endsAt = endDateOf(raw, todayISO);
  const priceAfter = priceOf(raw);
  const missing = [...(service ? [] : ['service']), ...(endsAt ? [] : ['endsAt'])];
  const question = !missing.length ? null
    : missing.length === 2 ? 'Hvilken tjeneste, og når slutter prøven? Skriv f.eks. «Viaplay gratis i 14 dager».'
      : missing[0] === 'service' ? 'Hvilken tjeneste gjelder prøven?'
        : `Når slutter prøven${service ? ` på ${service}` : ''}? Skriv f.eks. «14 dager» eller «25.11».`;
  return { ok: !missing.length, isTrial: isTrialText(raw), service, endsAt, priceAfter, priceLabel: priceText(priceAfter), remindOffsetsDays: [...DEFAULT_OFFSETS],
    cancelUrl: cancelUrlFor(service), missing, question };
}

/* ---------------- Varseltider og tekster (felles for server og klienter) ---------------- */

const dateD = (s) => new Date(s + 'T00:00:00Z');
export const daysBetween = (a, b) => Math.round((dateD(b) - dateD(a)) / 864e5);
/** «fredag 31. oktober» */
export const longDay = (s) => { const d = dateD(s); return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`; };
/** «fre 31. okt» */
export const shortDay = (s) => { const d = dateD(s); return `${WD3[d.getUTCDay()]} ${d.getUTCDate()}. ${MN3[d.getUTCMonth()]}`; };
export const addDaysISO = (s, n) => iso(addDaysD(dateD(s), n));

/**
 * Varseltidene for en prøve (Europe/Oslo veggklokke): hvert offset kl. 09:00 (ends_at − offset dager) og siste varsel
 * kl. 18:00 på sluttdagen. snoozeUntil ('YYYY-MM-DD') legger til et varsel den dagen kl. 09:00. → [{key, date, time, kind, offset}]
 */
export function trialSchedule({ endsAt, remindOffsetsDays = DEFAULT_OFFSETS, snoozeUntil = null }) {
  if (!endsAt) return [];
  const out = [];
  for (const o of [...new Set((remindOffsetsDays ?? []).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 60))].sort((a, b) => b - a)) {
    out.push({ key: `d${o}`, date: addDaysISO(endsAt, -o), time: '09:00', kind: 'reminder', offset: o });
  }
  if (snoozeUntil && snoozeUntil <= endsAt) out.push({ key: `s${snoozeUntil}`, date: snoozeUntil, time: '09:00', kind: 'snooze', offset: daysBetween(snoozeUntil, endsAt) });
  out.push({ key: 'final', date: endsAt, time: '18:00', kind: 'final', offset: 0 });
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** «Viaplay-prøven slutter i morgen» / «… slutter i dag» / «… slutter om 3 dager» */
export function trialTitle(service, daysLeft) {
  return `${service || 'Prøven'}${service ? '-prøven' : ''} ${daysLeft <= 0 ? 'slutter i dag' : daysLeft === 1 ? 'slutter i morgen' : `slutter om ${daysLeft} dager`}`;
}
/** «Avslutt før lør 1. nov for å slippe 149 kr/mnd. Trykk for å åpne oppsigelsessiden.» */
export function trialBody({ endsAt, priceAfter }, final = false) {
  const price = priceAfter != null ? priceText(priceAfter) : 'å betale';
  return final ? `Prøven slutter i dag. Avslutt nå for å slippe ${price}. Trykk for å åpne oppsigelsessiden.`
    : `Avslutt før ${shortDay(endsAt)} for å slippe ${price}. Trykk for å åpne oppsigelsessiden.`;
}
/** Forhåndsvisning i skjemaet (som et iOS-banner) for første varsel: {when:'fre 31. okt 09:00', title, body} */
export function trialPreview(t) {
  const s = trialSchedule(t)[0];
  if (!s) return null;
  return { when: `${shortDay(s.date)} ${s.time}`, title: trialTitle(t.service, daysBetween(s.date, t.endsAt)), body: trialBody(t, s.kind === 'final') };
}
/** «Prøve · 12 dager igjen» / «Prøve · slutter i dag» / «Prøve · utløpt» */
export function trialBadge(endsAt, todayISO) {
  const n = daysBetween(iso(todayOf(todayISO)), endsAt);
  return n < 0 ? 'Prøve · utløpt' : n === 0 ? 'Prøve · slutter i dag' : n === 1 ? 'Prøve · 1 dag igjen' : `Prøve · ${n} dager igjen`;
}
/** Svaret i søkeboblen/Chat: «Jeg minner deg på å avslutte Viaplay **fredag 31. oktober kl. 09**, dagen før prøven slutter lørdag 1. november.» */
export function trialSentence(t) {
  const s = trialSchedule(t)[0];
  if (!s) return '';
  const rel = s.kind === 'final' ? 'samme dag som' : s.offset === 1 ? 'dagen før' : `${s.offset} dager før`;
  return `Jeg minner deg på å avslutte ${t.service} **${longDay(s.date)} kl. ${s.time.slice(0, 2)}**, ${rel} prøven slutter ${longDay(t.endsAt)}.`;
}

export default parseTrial;
