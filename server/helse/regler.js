// Helse: reglene for brukerens egen Helse-side (søvn, trening, vekt, skritt og trender). Rene funksjoner uten database, så
// testene kan gi dem tall og «nå». Serveren eier reglene; appene og web viser feltene herfra (label, text …) og regner ikke selv.
//
// «I natt» (Q20): natten som sluttet i dag, i Oslo-tid. En søvnmåling hører til natten den slutter i, regnet fra kl. 18 dagen før
// til kl. 18 samme dag (en lur kl. 15 hører til natten før, en som slutter kl. 19 til neste natt).
// Flere kilder (klokke og telefon) gir overlappende målinger. Minuttene regnes som unionen av intervallene, så ingenting telles to ganger.
import { osloDate, osloParts, addDays, daysBetween } from '../dates/oslo.js';
import { dtf } from '../intl-format.js';

export const DAY_MS = 86_400_000;
export const PERIODER = { uke: 7, maned: 30 };

/* ---------------- Tall og tekst ---------------- */

const NBSP = ' ';
/** 12 345 (heltall med mellomrom som tusenskille). */
export const heltall = (n) => (n == null || !Number.isFinite(+n) ? null : new Intl.NumberFormat('nb-NO').format(Math.round(+n)).replace(/\s/g, NBSP));
/** 82,4 (én desimal, komma). Minus er «−». */
export const desimal = (n, d = 1) => (n == null || !Number.isFinite(+n) ? null : (+n).toFixed(d).replace('.', ',').replace('-', '−'));
/** 7 t 05 m (under én time: 18 m) */
export const timerMin = (min) => { if (min == null) return null; const m = Math.round(min); return m < 60 ? `${m} m` : `${Math.floor(m / 60)} t ${String(m % 60).padStart(2, '0')} m`; };
/** 45 min / 1 t 10 min */
export const varighet = (min) => { if (min == null) return null; const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t${m % 60 ? ` ${m % 60} min` : ''}`; };
/** 4,2 km / 850 m */
export const distanse = (m) => (m == null ? null : m >= 1000 ? `${desimal(m / 1000)} km` : `${Math.round(m)} m`);
const hm = (ms) => (ms == null ? null : dtf('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
const UKEDAG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
/** «i dag», «i går», «tirsdag», ellers «3. nov» (relativt til i dag i Oslo). */
export function dagTekst(date, today) {
  const n = daysBetween(date, today);
  if (n === 0) return 'i dag';
  if (n === 1) return 'i går';
  const d = new Date(`${date}T12:00:00Z`);
  if (n > 1 && n < 7) return UKEDAG[d.getUTCDay()];
  return `${d.getUTCDate()}. ${MND[d.getUTCMonth()]}`;
}
/** dd.mm.åååå */
export const datoNo = (date) => (date ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}` : null);

/* ---------------- Søvn ---------------- */

export const STADIER = ['inBed', 'asleep', 'awake', 'core', 'deep', 'rem'];
const SOVER = new Set(['asleep', 'core', 'deep', 'rem']);
export const STADIE_NAVN = { deep: 'Dyp', core: 'Kjerne', rem: 'REM', awake: 'Våken' };

/** Natten (YYYY-MM-DD, dagen man våknet) en måling som slutter ved `endMs` hører til: kl. 18 dagen før til kl. 18. */
export const nattFor = (endMs) => osloDate(endMs + 6 * 3_600_000);

/** Lengden av unionen av intervallene [s, e] i minutter. */
export function unionMin(list) {
  const iv = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let tot = 0, cs = null, ce = null;
  for (const [s, e] of iv) {
    if (cs == null || s > ce) { if (cs != null) tot += ce - cs; cs = s; ce = e; } else if (e > ce) ce = e;
  }
  if (cs != null) tot += ce - cs;
  return tot / 60_000;
}

/** Renser søvnmålinger fra appen: [{start, end, stage}] med ISO-tid eller ms. Ugyldige og for lange (over 16 t) tas ikke med. */
export function rensSovn(list, now = Date.now()) {
  const ms = (v) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v ?? '')));
  return (Array.isArray(list) ? list : []).slice(0, 5000).map((x) => ({ s: ms(x?.start), e: ms(x?.end), stage: STADIER.includes(x?.stage) ? x.stage : null }))
    .filter((x) => x.stage && Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.e - x.s <= 16 * 3_600_000 && x.e <= now + 5 * 60_000 && x.e > now - 400 * DAY_MS);
}

/**
 * Nettene fra søvnmålingene. → [{night, bedMs, asleepMs, wakeMs, inBedMin, asleepMin, stages:{deep, core, rem, awake}|null}]
 * bedMs = første måling (i seng eller sovende), asleepMs = første søvn, wakeMs = siste søvn slutter. Stadier bare når klokka har målt dem.
 */
export function netter(samples) {
  const by = new Map();
  for (const x of samples) { const n = nattFor(x.e); if (!by.has(n)) by.set(n, []); by.get(n).push(x); }
  const out = [];
  for (const [night, L] of by) {
    const sl = L.filter((x) => SOVER.has(x.stage));
    if (!sl.length) continue; // bare «i seng» uten søvn: ingen natt
    const of = (st) => unionMin(L.filter((x) => x.stage === st).map((x) => [x.s, x.e]));
    const has = L.some((x) => x.stage === 'core' || x.stage === 'deep' || x.stage === 'rem');
    out.push({
      night,
      bedMs: Math.min(...L.map((x) => x.s)), asleepMs: Math.min(...sl.map((x) => x.s)), wakeMs: Math.max(...sl.map((x) => x.e)),
      inBedMin: Math.round(unionMin(L.map((x) => [x.s, x.e]))), asleepMin: Math.round(unionMin(sl.map((x) => [x.s, x.e]))),
      stages: has ? { deep: Math.round(of('deep')), core: Math.round(of('core')), rem: Math.round(of('rem')), awake: Math.round(of('awake')) } : null,
    });
  }
  return out.sort((a, b) => (a.night < b.night ? -1 : 1));
}

/** Én natt slik klientene viser den. */
export function nattUt(n, today) {
  if (!n) return null;
  const stages = n.stages ? ['deep', 'core', 'rem', 'awake'].map((k) => ({ key: k, label: STADIE_NAVN[k], min: n.stages[k] ?? 0, text: timerMin(n.stages[k] ?? 0) })) : [];
  return {
    night: n.night, dayText: n.night === today ? 'i natt' : `natt til ${dagTekst(n.night, today)}`,
    bedtime: hm(n.bedMs), asleepAt: hm(n.asleepMs), wakeAt: hm(n.wakeMs), range: n.asleepMs && n.wakeMs ? `${hm(n.asleepMs)}–${hm(n.wakeMs)}` : null,
    asleepMin: n.asleepMin, asleepText: timerMin(n.asleepMin), inBedMin: n.inBedMin, inBedText: timerMin(n.inBedMin), stages,
  };
}

/* ---------------- Trening ---------------- */

export const OKT_TYPER = {
  running: 'Løping', walking: 'Gåtur', hiking: 'Fjelltur', cycling: 'Sykling', swimming: 'Svømming', strength: 'Styrketrening',
  functional: 'Funksjonell trening', hiit: 'Intervalltrening', yoga: 'Yoga', pilates: 'Pilates', crossCountrySkiing: 'Langrenn',
  downhillSkiing: 'Alpint', rowing: 'Roing', elliptical: 'Ellipsemaskin', dance: 'Dans', soccer: 'Fotball', core: 'Kjernetrening',
  stairs: 'Trapper', other: 'Trening',
};
export const oktNavn = (type) => OKT_TYPER[type] ?? OKT_TYPER.other;
/** Gjeldende økt for klientene. */
export function oktUt(w, today) {
  const date = osloDate(w.start_ms);
  const min = w.duration_s != null ? w.duration_s / 60 : (w.end_ms - w.start_ms) / 60_000;
  return {
    id: w.id, type: w.type, label: oktNavn(w.type), date, dayText: dagTekst(date, today), start: hm(w.start_ms), startAt: new Date(w.start_ms).toISOString(),
    durationMin: Math.round(min), durationText: varighet(min), kcal: w.kcal != null ? Math.round(w.kcal) : null, kcalText: w.kcal != null ? `${heltall(w.kcal)} kcal` : null,
    distanceM: w.distance_m != null ? Math.round(w.distance_m) : null, distanceText: distanse(w.distance_m),
  };
}

/* ---------------- Trender ---------------- */

const snitt = (L) => (L.length ? L.reduce((s, v) => s + v, 0) / L.length : null);
/** Retning ut fra prosentvis endring: under ±3 % er «flat». */
export const retning = (pct) => (pct == null ? null : pct > 3 ? 'opp' : pct < -3 ? 'ned' : 'flat');
const pil = { opp: '↑', ned: '↓', flat: '→' };

/**
 * Trend for én måling over en periode: snittet av dagene med verdi i perioden mot perioden før.
 * serie: [{date, value}] for hver dag i perioden (value null når den mangler).
 */
export function trend(byDate, { today, days, fmt }) {
  const from = addDays(today, -(days - 1)), prevFrom = addDays(from, -days);
  const serie = Array.from({ length: days }, (_, i) => { const d = addDays(from, i); return { date: d, value: byDate.get(d) ?? null }; });
  const cur = serie.map((x) => x.value).filter((v) => v != null);
  const prev = Array.from({ length: days }, (_, i) => byDate.get(addDays(prevFrom, i))).filter((v) => v != null);
  const a = snitt(cur), b = snitt(prev);
  const pct = a != null && b ? Math.round(((a - b) / b) * 100) : null;
  const r = retning(pct);
  return {
    serie, days: cur.length, avg: a != null ? Math.round(a * 10) / 10 : null, avgText: a != null ? fmt(a) : null, prevAvg: b != null ? Math.round(b * 10) / 10 : null,
    changePct: pct, direction: r, changeText: pct == null ? null : `${pil[r]} ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} % mot perioden før`,
  };
}

/** Vekt: siste måling og endring over perioden (siste mot første måling i perioden). */
export function vektUt(rows, { today, days }) {
  if (!rows.length) return null;
  const s = rows.slice().sort((a, b) => a.at_ms - b.at_ms);
  const last = s[s.length - 1];
  const from = addDays(today, -(days - 1));
  const inP = s.filter((r) => osloDate(r.at_ms) >= from);
  const first = inP[0] ?? null;
  const diff = first && first !== last ? Math.round((last.kg - first.kg) * 10) / 10 : null;
  const dir = diff == null ? null : diff > 0.2 ? 'opp' : diff < -0.2 ? 'ned' : 'flat';
  // Én verdi per dag (siste måling den dagen) til grafen.
  const per = new Map(); for (const r of inP) per.set(osloDate(r.at_ms), r.kg);
  const date = osloDate(last.at_ms);
  return {
    kg: Math.round(last.kg * 10) / 10, kgText: `${desimal(last.kg)} kg`, date, dayText: dagTekst(date, today), dateText: datoNo(date),
    change: diff, direction: dir, changeText: diff == null ? null : `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${desimal(Math.abs(diff))} kg siste ${days} dager`,
    serie: [...per].map(([d, kg]) => ({ date: d, value: Math.round(kg * 10) / 10 })),
  };
}

/* ---------------- Hele siden ---------------- */

/**
 * GET /api/helse: alt brukeren selv ser på Helse-siden.
 * data = {days:[{date, steps, distance_m, active_kcal, exercise_min, resting_hr}], nights:[netter()], workouts:[rad], weights:[{at_ms, kg}], updated}
 */
export function helseSide(data, { now = Date.now(), periode = 'uke' } = {}) {
  const today = osloDate(now), days = PERIODER[periode] ?? 7;
  const D = new Map(data.days.map((d) => [d.date, d]));
  const col = (k) => new Map(data.days.filter((d) => d[k] != null).map((d) => [d.date, d[k]]));
  const t = D.get(today) ?? {};
  const N = data.nights.slice().sort((a, b) => (a.night < b.night ? -1 : 1));
  const inatt = N.find((n) => n.night === today) ?? null;
  const siste = N.filter((n) => n.night <= today).at(-1) ?? null;
  const last7 = N.filter((n) => n.night > addDays(today, -7) && n.night <= today);
  const sleepAvg = snitt(last7.map((n) => n.asleepMin));
  const W = data.workouts.slice().sort((a, b) => b.start_ms - a.start_ms);
  const from = addDays(today, -(days - 1));
  const inP = W.filter((w) => osloDate(w.start_ms) >= from);
  const sleepBy = new Map(N.map((n) => [n.night, n.asleepMin]));
  const kmFmt = (v) => distanse(v);
  const trender = [
    { key: 'steps', label: 'Skritt', unit: 'skritt', ...trend(col('steps'), { today, days, fmt: (v) => heltall(v) }) },
    { key: 'sleep', label: 'Søvn', unit: 'min', ...trend(sleepBy, { today, days, fmt: timerMin }) },
    { key: 'distance', label: 'Distanse gått og løpt', unit: 'm', ...trend(col('distance_m'), { today, days, fmt: kmFmt }) },
    { key: 'activeKcal', label: 'Aktiv energi', unit: 'kcal', ...trend(col('active_kcal'), { today, days, fmt: (v) => `${heltall(v)} kcal` }) },
    { key: 'exercise', label: 'Treningstid', unit: 'min', ...trend(col('exercise_min'), { today, days, fmt: varighet }) },
    { key: 'restingHr', label: 'Hvilepuls', unit: 'bpm', ...trend(col('resting_hr'), { today, days, fmt: (v) => `${Math.round(v)} bpm` }) },
  ];
  const vekt = vektUt(data.weights, { today, days });
  const has = data.days.length || N.length || W.length || data.weights.length;
  return {
    date: today, periode, days, from, to: today, empty: !has,
    updatedAt: data.updated ? new Date(data.updated).toISOString() : null,
    today: {
      steps: t.steps ?? null, stepsText: heltall(t.steps), distanceM: t.distance_m != null ? Math.round(t.distance_m) : null, distanceText: distanse(t.distance_m),
      activeKcal: t.active_kcal ?? null, activeKcalText: t.active_kcal != null ? `${heltall(t.active_kcal)} kcal` : null,
      exerciseMin: t.exercise_min ?? null, exerciseText: varighet(t.exercise_min), restingHr: t.resting_hr ?? null,
    },
    sleep: {
      tonight: nattUt(inatt, today), last: nattUt(siste, today),
      avg7Min: sleepAvg != null ? Math.round(sleepAvg) : null, avg7Text: sleepAvg != null ? timerMin(sleepAvg) : null, avg7Nights: last7.length,
    },
    workouts: {
      last: W[0] ? oktUt(W[0], today) : null, items: inP.slice(0, 50).map((w) => oktUt(w, today)), count: inP.length,
      totalMin: Math.round(inP.reduce((s, w) => s + (w.duration_s ?? (w.end_ms - w.start_ms) / 1000) / 60, 0)),
      totalText: inP.length ? `${inP.length} ${inP.length === 1 ? 'økt' : 'økter'} · ${varighet(inP.reduce((s, w) => s + (w.duration_s ?? (w.end_ms - w.start_ms) / 1000) / 60, 0))}` : 'Ingen økter i perioden',
    },
    weight: vekt,
    trends: trender,
    summary: kortTekst({ today: t, sleep: inatt ?? siste, sleepToday: inatt, workout: W[0], weight: vekt }, today),
  };
}

/** Én kort setning til toppen av siden og Brief: «Du sov 7 t 12 m i natt og har gått 4 210 skritt i dag.» Bare tallene. */
export function kortTekst({ today: t, sleep, sleepToday }, today) {
  const p = [];
  if (sleepToday) p.push(`Du sov ${timerMin(sleepToday.asleepMin)} i natt`);
  else if (sleep) p.push(`Du sov ${timerMin(sleep.asleepMin)} ${sleep.night === addDays(today, -1) ? 'natt til i går' : `natt til ${dagTekst(sleep.night, today)}`}`);
  if (t?.steps != null) p.push(`${p.length ? 'har' : 'Du har'} gått ${heltall(t.steps)} skritt i dag`);
  return p.length ? `${p.join(' og ')}.` : null;
}

export { osloParts };
