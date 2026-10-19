// Egen iCal-leser og RRULE-utvidelse for Kalender (prompt 27). Erstatter node-ical i calendar.js fordi node-ical
// legger hendelsene i et objekt med UID som nøkkel: skolesystemer som gjenbruker samme UID på mange VEVENT-er
// (én UID per fag/gruppe, uten RECURRENCE-ID) mistet alle timene unntatt den siste – ofte eksamen om flere måneder.
// node-ical ignorerte også RDATE, flere RRULE-linjer, STATUS:CANCELLED på overstyringer, EXDATE;VALUE=DATE for timer
// før 01:00/02:00 (UTC-dato) og tolket flytende tider (uten TZID) i serverens tidssone (UTC i Docker).
//
//   parseIcs(text) → {name, tz, events:[komponent]}              (alle VEVENT-er, også med samme UID)
//   expandIcs(cal, fromMs, toMs) → [{uid, allDay, date?, endDate?, startMs, endMs, summary, location, description,
//                                    categories, organizer:{cn, mail}, url, status, recurring, override}]
// Støtter: VTIMEZONE/TZID (IANA, Windows-navn som «W. Europe Standard Time», Outlook «(UTC+01:00) …», egne prefiks),
// flytende tid (X-WR-TIMEZONE eller Europe/Oslo), DTEND/DURATION, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY/HOURLY/MINUTELY med
// INTERVAL, COUNT, UNTIL, BYDAY med ordinal, BYMONTHDAY, BYMONTH, BYYEARDAY, BYHOUR, BYMINUTE, BYSETPOS, WKST),
// EXDATE (lister, TZID, UTC, VALUE=DATE), RDATE (også PERIOD), RECURRENCE-ID (flyttet eller avlyst). Gjentakelser regnes
// i lokal veggklokketid i hendelsens tidssone, så 08:15 forblir 08:15 over sommer-/vintertid.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const DAY_S = 86_400;
const DEFAULT_TZ = 'Europe/Oslo';
const MAX_PERIODS = 200_000;
const MAX_OUT = 3000; // per hendelse i vinduet

/* ---------------- Tidssoner ---------------- */

const validTz = new Map();
function isTz(tz) {
  if (!tz) return false;
  if (!validTz.has(tz)) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); validTz.set(tz, true); } catch { validTz.set(tz, false); } }
  return validTz.get(tz);
}
const WINDOWS = {
  'W. Europe Standard Time': 'Europe/Oslo', 'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Helsinki', 'GTB Standard Time': 'Europe/Bucharest',
  'Russian Standard Time': 'Europe/Moscow', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC', 'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
};
let winZones = null;
function windowsZone(name) {
  if (WINDOWS[name]) return WINDOWS[name];
  if (winZones === null) {
    try { winZones = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('node-ical/windowsZones.json'), 'utf8')); }
    catch { try { winZones = JSON.parse(readFileSync(new URL('../node_modules/node-ical/windowsZones.json', import.meta.url), 'utf8')); } catch { winZones = {}; } }
  }
  const hit = winZones[name]?.iana?.[0];
  return hit && isTz(hit) ? hit : null;
}
const offsetZone = (sign, h, m) => {
  const mins = (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m || 0));
  if (mins === 60) return 'Europe/Oslo'; // CET/CEST – samme regler som Oslo
  if (mins === 0) return 'Europe/London';
  return mins % 60 === 0 && Math.abs(mins) <= 14 * 60 ? (mins === 0 ? 'UTC' : `Etc/GMT${mins > 0 ? '-' : '+'}${Math.abs(mins / 60)}`) : null;
};
/** TZID → IANA-sone. vtz = {TZID: {std, dst}} fra VTIMEZONE, fallback = kalenderens standard. */
export function resolveTz(tzid, vtz = {}, fallback = DEFAULT_TZ) {
  let t = String(tzid ?? '').trim().replace(/^"|"$/g, '');
  if (!t) return fallback;
  if (isTz(t)) return t;
  const iana = t.match(/([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)\s*$/)?.[1];
  if (iana && isTz(iana)) return iana;
  const w = windowsZone(t);
  if (w) return w;
  const off = t.match(/(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (off) { const z = offsetZone(off[1], off[2], off[3]); if (z) return z; }
  if (/^(utc|gmt|z|etc\/utc)$/i.test(t)) return 'UTC';
  const def = vtz[t];
  if (def) {
    const parse = (s) => { const m = String(s ?? '').match(/^([+-])(\d{2})(\d{2})/); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null; };
    const std = parse(def.std), dst = parse(def.dst);
    if (std === 60) return 'Europe/Oslo';
    if (std === 0 && dst === 60) return 'Europe/London';
    if (std != null && dst == null) { const z = offsetZone(std < 0 ? '-' : '+', Math.floor(Math.abs(std) / 60), Math.abs(std) % 60); if (z) return z; }
  }
  return fallback;
}

const fmts = new Map();
function fmt(tz) {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return fmts.get(tz);
}
/** Lokale deler {y, m, d, h, mi, s} av tidspunktet t (ms) i tz. */
export function localParts(t, tz) {
  const p = {};
  for (const x of fmt(tz).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
const offsetAt = (t, tz) => { const p = localParts(t, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000; };
/** Veggklokketid i tz → ms (UTC). Ved sommertidshopp (tid som ikke finnes) brukes tiden etter hoppet. */
export function zonedToUtc(y, m, d, h = 0, mi = 0, s = 0, tz = DEFAULT_TZ) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  if (tz === 'UTC') return guess;
  const o1 = offsetAt(guess, tz);
  let t = guess - o1;
  const o2 = offsetAt(t, tz);
  if (o2 !== o1) { const t2 = guess - o2; if (offsetAt(t2, tz) === o2) t = t2; }
  return t;
}

/* ---------------- Datoer som dagnummer ---------------- */

const dnOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
const ymdOf = (dn) => { const x = new Date(dn * 86_400_000); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const wdOf = (dn) => ((dn % 7) + 11) % 7; // 0 = søndag (1970-01-01 var torsdag)
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const isoDate = (dn) => new Date(dn * 86_400_000).toISOString().slice(0, 10);
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/* ---------------- Lesing ---------------- */

function unescapeText(v) { return String(v ?? '').replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c)); }
function parseLine(line) {
  let i = 0;
  while (i < line.length && line[i] !== ';' && line[i] !== ':') i++;
  const name = line.slice(0, i).toUpperCase();
  const params = {};
  while (line[i] === ';') {
    i++;
    let k = '';
    while (i < line.length && line[i] !== '=' && line[i] !== ':' && line[i] !== ';') k += line[i++];
    let v = '';
    if (line[i] === '=') {
      i++;
      let q = false;
      while (i < line.length && (q || (line[i] !== ';' && line[i] !== ':'))) { if (line[i] === '"') q = !q; else v += line[i]; i++; }
    }
    params[k.toUpperCase()] = v;
  }
  return { name, params, value: line[i] === ':' ? line.slice(i + 1) : '' };
}

/** iCal-tekst → {name, tz, events:[{props: Map(navn → [{params, value}])}], vtz}. */
export function parseIcs(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [], vtz = {};
  const stack = [];
  let cur = null, calName = '', calTz = '', tzCur = null, tzSub = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const l = parseLine(raw);
    if (l.name === 'BEGIN') {
      const kind = l.value.trim().toUpperCase();
      stack.push(kind);
      if (kind === 'VEVENT') cur = { props: new Map() };
      else if (kind === 'VTIMEZONE') tzCur = { id: '', std: null, dst: null };
      else if (tzCur && (kind === 'STANDARD' || kind === 'DAYLIGHT')) tzSub = kind;
      continue;
    }
    if (l.name === 'END') {
      const kind = stack.pop();
      if (kind === 'VEVENT' && cur) { events.push(cur); cur = null; }
      else if (kind === 'VTIMEZONE' && tzCur) { if (tzCur.id) vtz[tzCur.id] = tzCur; tzCur = null; }
      else if (kind === 'STANDARD' || kind === 'DAYLIGHT') tzSub = null;
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VEVENT' && cur) { if (!cur.props.has(l.name)) cur.props.set(l.name, []); cur.props.get(l.name).push({ params: l.params, value: l.value }); }
    else if (top === 'VTIMEZONE' && tzCur && l.name === 'TZID') tzCur.id = l.value.trim();
    else if (tzSub && tzCur && l.name === 'TZOFFSETTO') { if (tzSub === 'STANDARD') tzCur.std ??= l.value.trim(); else tzCur.dst ??= l.value.trim(); }
    else if (top === 'VCALENDAR') { if (l.name === 'X-WR-CALNAME') calName = unescapeText(l.value); if (l.name === 'X-WR-TIMEZONE') calTz = l.value.trim(); }
  }
  if (!/BEGIN:VCALENDAR/i.test(String(text ?? ''))) throw new Error('Adressen svarte, men det er ikke en iCal-kalender.');
  const tz = calTz ? resolveTz(calTz, vtz, DEFAULT_TZ) : DEFAULT_TZ;
  return { name: calName, tz, wrTz: !!calTz, vtz, events };
}

const first = (ev, k) => ev.props.get(k)?.[0];
const text = (ev, k) => unescapeText(first(ev, k)?.value ?? '').trim();

/** Én dato/tid-verdi → {dn, sec, date, utc, tz}. */
function parseDt(value, params, cal, tzFallback) {
  const v = String(value ?? '').trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i);
  if (!m) { const t = Date.parse(v); if (!Number.isFinite(t)) return null; const p = localParts(t, tzFallback); return { dn: dnOf(p.y, p.m, p.d), sec: p.h * 3600 + p.mi * 60 + p.s, date: false, utc: false, tz: tzFallback, ms: t }; }
  const dn = dnOf(+m[1], +m[2], +m[3]);
  if (!m[4] || params?.VALUE === 'DATE') return { dn, sec: 0, date: true };
  const sec = +m[4] * 3600 + +m[5] * 60 + +(m[6] ?? 0);
  if (m[7]) { const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)); return { dn, sec, date: false, utc: true, ms }; }
  const tz = params?.TZID ? resolveTz(params.TZID, cal.vtz, tzFallback) : tzFallback;
  return { dn, sec, date: false, utc: false, tz };
}
const msOf = (x, tz) => {
  if (x.ms != null) return x.ms;
  const { y, m, d } = ymdOf(x.dn);
  return zonedToUtc(y, m, d, Math.floor(x.sec / 3600), Math.floor(x.sec / 60) % 60, x.sec % 60, x.tz ?? tz);
};
/** Lokal nøkkel (sekunder fra epoke i veggklokketid) i tz. */
const keyIn = (x, tz) => {
  if (x.date) return x.dn * DAY_S;
  if (!x.utc && (x.tz ?? tz) === tz && x.ms == null) return x.dn * DAY_S + x.sec;
  const p = localParts(msOf(x, tz), tz);
  return dnOf(p.y, p.m, p.d) * DAY_S + p.h * 3600 + p.mi * 60 + p.s;
};
function parseDuration(s) {
  const m = String(s ?? '').trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const sec = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY_S) + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0);
  return m[1] === '-' ? -sec : sec;
}
const listValues = (ev, k) => (ev.props.get(k) ?? []).flatMap((p) => p.value.split(',').map((v) => ({ value: v.trim(), params: p.params })).filter((x) => x.value));

/* ---------------- RRULE ---------------- */

export function parseRule(s) {
  const r = { freq: null, interval: 1, count: null, until: null, byday: null, bymonthday: null, bymonth: null, byyearday: null, byhour: null, byminute: null, bysecond: null, bysetpos: null, wkst: 1 };
  for (const part of String(s ?? '').replace(/^RRULE:/i, '').split(';')) {
    const [k0, v = ''] = part.split('=');
    const k = k0.trim().toUpperCase(), val = v.trim().toUpperCase();
    const nums = () => val.split(',').map(Number).filter((n) => Number.isInteger(n));
    if (k === 'FREQ') r.freq = val;
    else if (k === 'INTERVAL') r.interval = Math.max(1, parseInt(val, 10) || 1);
    else if (k === 'COUNT') r.count = Math.max(0, parseInt(val, 10) || 0);
    else if (k === 'UNTIL') r.until = v.trim();
    else if (k === 'BYDAY') r.byday = val.split(',').map((x) => x.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/)).filter(Boolean).map((x) => ({ n: x[1] ? Number(x[1]) : 0, wd: WD[x[2]] }));
    else if (k === 'BYMONTHDAY') r.bymonthday = nums().filter((n) => n !== 0);
    else if (k === 'BYMONTH') r.bymonth = nums().filter((n) => n >= 1 && n <= 12);
    else if (k === 'BYYEARDAY') r.byyearday = nums().filter((n) => n !== 0);
    else if (k === 'BYHOUR') r.byhour = nums().filter((n) => n >= 0 && n <= 23);
    else if (k === 'BYMINUTE') r.byminute = nums().filter((n) => n >= 0 && n <= 59);
    else if (k === 'BYSECOND') r.bysecond = nums().filter((n) => n >= 0 && n <= 60);
    else if (k === 'BYSETPOS') r.bysetpos = nums().filter((n) => n !== 0);
    else if (k === 'WKST' && WD[val] != null) r.wkst = WD[val];
  }
  for (const k of ['byday', 'bymonthday', 'bymonth', 'byyearday', 'byhour', 'byminute', 'bysecond', 'bysetpos']) if (r[k] && !r[k].length) r[k] = null;
  if (!['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) return null;
  return r;
}

const nthInRange = (days, n) => (n > 0 ? days[n - 1] : days[days.length + n]);
function monthDays(y, m, r, startD) {
  const n = dim(y, m), base = dnOf(y, m, 1);
  let out = null;
  if (r.bymonthday) out = r.bymonthday.map((d) => (d > 0 ? d : n + 1 + d)).filter((d) => d >= 1 && d <= n).map((d) => base + d - 1);
  if (r.byday) {
    const set = [];
    for (const { n: k, wd } of r.byday) {
      const all = [];
      for (let d = 0; d < n; d++) if (wdOf(base + d) === wd) all.push(base + d);
      if (k) { const x = nthInRange(all, k); if (x != null) set.push(x); } else set.push(...all);
    }
    out = out ? out.filter((x) => set.includes(x)) : set;
  }
  if (!out) out = startD <= n ? [base + startD - 1] : [];
  return out;
}
function yearDays(y, r, start) {
  if (r.byyearday) {
    const len = dnOf(y + 1, 1, 1) - dnOf(y, 1, 1);
    let out = r.byyearday.map((d) => (d > 0 ? d : len + 1 + d)).filter((d) => d >= 1 && d <= len).map((d) => dnOf(y, 1, 1) + d - 1);
    if (r.bymonth) out = out.filter((dn) => r.bymonth.includes(ymdOf(dn).m));
    if (r.byday) out = out.filter((dn) => r.byday.some((b) => b.wd === wdOf(dn)));
    return out;
  }
  if (r.bymonth || r.bymonthday) return (r.bymonth ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).flatMap((m) => monthDays(y, m, r, start.d));
  if (r.byday) {
    const s = dnOf(y, 1, 1), e = dnOf(y + 1, 1, 1), set = [];
    for (const { n, wd } of r.byday) {
      const all = [];
      for (let dn = s; dn < e; dn++) if (wdOf(dn) === wd) all.push(dn);
      if (n) { const x = nthInRange(all, n); if (x != null) set.push(x); } else set.push(...all);
    }
    return set;
  }
  return start.m === 2 && start.d === 29 && dim(y, 2) < 29 ? [] : [dnOf(y, start.m, start.d)];
}

/**
 * Lokale forekomster (nøkler i sekunder veggklokketid) for regelen fra startKey til og med endKey (vinduets slutt).
 * minKey: forekomster før dette trengs ikke (bare når COUNT ikke er satt, så vi kan hoppe frem).
 */
export function ruleKeys(r, startKey, endKey, untilKey = null, minKey = null) {
  const out = [];
  const startDn = Math.floor(startKey / DAY_S), startSec = startKey - startDn * DAY_S, start = ymdOf(startDn);
  const sh = Math.floor(startSec / 3600), smi = Math.floor(startSec / 60) % 60, ss = startSec % 60;
  const times = (r.byhour || r.byminute || r.bysecond) && !['HOURLY', 'MINUTELY', 'SECONDLY'].includes(r.freq)
    ? (r.byhour ?? [sh]).flatMap((h) => (r.byminute ?? [smi]).flatMap((mi) => (r.bysecond ?? [ss]).map((s) => h * 3600 + mi * 60 + s))).sort((a, b) => a - b)
    : [startSec];
  let count = 0;
  const limit = r.count ?? Infinity;
  const stopKey = Math.min(endKey, untilKey ?? Infinity);
  const filt = (dn) => (!r.bymonth || r.bymonth.includes(ymdOf(dn).m)) && (!r.byday || r.freq === 'MONTHLY' || r.freq === 'YEARLY' || r.byday.some((b) => b.wd === wdOf(dn)))
    && (!r.bymonthday || r.freq === 'MONTHLY' || r.freq === 'YEARLY' || r.bymonthday.some((d) => { const { y, m, d: dd } = ymdOf(dn); return (d > 0 ? d : dim(y, m) + 1 + d) === dd; }));
  // Hopp frem til like før vinduet når antallet ikke betyr noe.
  let k0 = 0;
  const periodDays = r.freq === 'DAILY' ? r.interval : r.freq === 'WEEKLY' ? 7 * r.interval : 0;
  if (r.count == null && minKey != null && periodDays) k0 = Math.max(0, Math.floor((Math.floor(minKey / DAY_S) - startDn) / periodDays) - 2);
  const wsStart = startDn - ((wdOf(startDn) - r.wkst + 7) % 7);
  for (let k = k0; k < k0 + MAX_PERIODS; k++) {
    let keys;
    if (r.freq === 'DAILY') { const dn = startDn + k * r.interval; if (dn * DAY_S > stopKey) break; keys = filt(dn) ? times.map((t) => dn * DAY_S + t) : []; }
    else if (r.freq === 'WEEKLY') {
      const ws = wsStart + k * 7 * r.interval;
      if (ws * DAY_S > stopKey) break;
      const days = r.byday ? [...new Set(r.byday.map((b) => ws + ((b.wd - r.wkst + 7) % 7)))].sort((a, b) => a - b) : [ws + ((wdOf(startDn) - r.wkst + 7) % 7)];
      keys = days.filter((dn) => (!r.bymonth || r.bymonth.includes(ymdOf(dn).m))).flatMap((dn) => times.map((t) => dn * DAY_S + t));
    } else if (r.freq === 'MONTHLY') {
      const mm = start.m - 1 + k * r.interval, y = start.y + Math.floor(mm / 12), m = (mm % 12) + 1;
      if (dnOf(y, m, 1) * DAY_S > stopKey) break;
      keys = (!r.bymonth || r.bymonth.includes(m)) ? monthDays(y, m, r, start.d).sort((a, b) => a - b).flatMap((dn) => times.map((t) => dn * DAY_S + t)) : [];
    } else if (r.freq === 'YEARLY') {
      const y = start.y + k * r.interval;
      if (dnOf(y, 1, 1) * DAY_S > stopKey) break;
      keys = [...new Set(yearDays(y, r, start))].sort((a, b) => a - b).flatMap((dn) => times.map((t) => dn * DAY_S + t));
    } else {
      const step = r.freq === 'HOURLY' ? 3600 : r.freq === 'MINUTELY' ? 60 : 1;
      const key = startKey + k * step * r.interval;
      if (key > stopKey) break;
      const dn = Math.floor(key / DAY_S), sec = key - dn * DAY_S;
      keys = filt(dn) && (!r.byhour || r.byhour.includes(Math.floor(sec / 3600))) && (!r.byminute || r.byminute.includes(Math.floor(sec / 60) % 60)) ? [key] : [];
    }
    if (r.bysetpos && keys.length) keys = [...new Set(r.bysetpos.map((p) => nthInRange(keys, p)).filter((x) => x != null))].sort((a, b) => a - b);
    for (const key of keys) {
      if (key < startKey) continue;
      if (untilKey != null && key > untilKey) return out;
      if (++count > limit) return out;
      if (key > endKey) return out;
      out.push(key);
      if (out.length > MAX_OUT * 4) return out;
    }
  }
  return out;
}

/* ---------------- Utvidelse ---------------- */

function eventInfo(ev, cal) {
  const ds = first(ev, 'DTSTART');
  if (!ds) return null;
  const start = parseDt(ds.value, ds.params, cal, cal.tz);
  if (!start) return null;
  const allDay = start.date;
  // UTC-start (…Z) gjentas i UTC etter RFC 5545, men med X-WR-TIMEZONE (Google/Apple-eksport) i den sonen, så timen står fast i lokal tid.
  const tz = allDay ? DEFAULT_TZ : start.utc ? (cal.wrTz ? cal.tz : 'UTC') : (start.tz ?? cal.tz);
  const de = first(ev, 'DTEND'), du = first(ev, 'DURATION');
  let dur; // sekunder (tid) eller dager (heldag)
  if (allDay) {
    const end = de ? parseDt(de.value, de.params, cal, tz) : null;
    dur = end ? Math.max(1, end.dn - start.dn) : du ? Math.max(1, Math.round((parseDuration(du.value) ?? DAY_S) / DAY_S)) : 1;
  } else {
    const end = de ? parseDt(de.value, de.params, cal, tz) : null;
    dur = end ? Math.max(0, Math.round((msOf(end, tz) - msOf(start, tz)) / 1000)) : du ? Math.max(0, parseDuration(du.value) ?? 0) : 0;
  }
  const org = first(ev, 'ORGANIZER');
  const rid = first(ev, 'RECURRENCE-ID');
  return {
    uid: text(ev, 'UID'), summary: text(ev, 'SUMMARY'), location: text(ev, 'LOCATION'), description: text(ev, 'DESCRIPTION'),
    categories: listValues(ev, 'CATEGORIES').map((x) => unescapeText(x.value)), url: text(ev, 'URL') || null,
    organizer: org ? { cn: String(org.params.CN ?? '').replace(/^"|"$/g, '').trim() || null, mail: org.value.replace(/^mailto:/i, '').trim() || null } : null,
    status: text(ev, 'STATUS').toUpperCase(), sequence: parseInt(text(ev, 'SEQUENCE'), 10) || 0, allDay, tz, start, dur,
    rrules: (ev.props.get('RRULE') ?? []).map((p) => parseRule(p.value)).filter(Boolean),
    rdates: listValues(ev, 'RDATE'), exdates: listValues(ev, 'EXDATE'),
    rid: rid ? parseDt(rid.value, rid.params, cal, tz) : null,
    hasEnd: !!(de || du), ruleText: (ev.props.get('RRULE') ?? []).map((p) => p.value).join('&'),
  };
}

function instanceOut(info, key, durOverride, recurring, override) {
  const dn = Math.floor(key / DAY_S);
  if (info.allDay) {
    const days = durOverride ?? info.dur;
    return { allDay: true, date: isoDate(dn), endDate: isoDate(dn + days), startMs: zonedToUtc(...Object.values(ymdOf(dn)), 0, 0, 0, DEFAULT_TZ), endMs: zonedToUtc(...Object.values(ymdOf(dn + days)), 0, 0, 0, DEFAULT_TZ), recurring, override };
  }
  const sec = key - dn * DAY_S, { y, m, d } = ymdOf(dn);
  const startMs = zonedToUtc(y, m, d, Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60, info.tz);
  return { allDay: false, startMs, endMs: startMs + (durOverride ?? info.dur) * 1000, recurring, override };
}
const pub = (info) => ({ uid: info.uid, summary: info.summary, location: info.location, description: info.description, categories: info.categories, organizer: info.organizer, url: info.url, status: info.status });

/** Alle forekomster som overlapper [fromMs, toMs]. Hendelser med samme UID beholdes hver for seg. */
export function expandIcs(cal, fromMs, toMs) {
  const infos = cal.events.map((e) => eventInfo(e, cal)).filter(Boolean);
  const masters = [], overrides = new Map(); // uid → [info]
  const seen = new Map();
  for (const i of infos) {
    if (i.rid) { if (!overrides.has(i.uid)) overrides.set(i.uid, []); overrides.get(i.uid).push(i); continue; }
    // Samme hendelse to ganger (samme UID, start og regel): bare høyeste SEQUENCE.
    const k = `${i.uid}|${i.start.dn}|${i.start.sec}|${i.summary}|${i.ruleText}`;
    const prev = seen.get(k);
    if (prev) { if (i.sequence > prev.sequence) { masters[masters.indexOf(prev)] = i; seen.set(k, i); } continue; }
    seen.set(k, i);
    masters.push(i);
  }
  const out = [];
  const inWin = (x) => (x.allDay ? x.endMs > fromMs && x.startMs <= toMs : x.endMs >= fromMs && x.startMs <= toMs);
  for (const info of masters) {
    if (info.status === 'CANCELLED') continue;
    const tz = info.tz;
    const startKey = keyIn(info.start, tz);
    const isRec = info.rrules.length > 0 || info.rdates.length > 0;
    // Vinduet i lokal tid (med én dags margin), og hvor langt tilbake en forekomst kan starte og fortsatt overlappe.
    const durS = info.allDay ? info.dur * DAY_S : info.dur;
    const endKey = (() => { const p = localParts(toMs, tz); return (dnOf(p.y, p.m, p.d) + 1) * DAY_S + 86_399; })();
    const minKey = (() => { const p = localParts(fromMs, tz); return (dnOf(p.y, p.m, p.d) - 1) * DAY_S - durS; })();
    let keys = [];
    const durOf = new Map();
    for (const r of info.rrules) {
      let untilKey = null;
      if (r.until) { const u = parseDt(r.until, {}, cal, tz); if (u) untilKey = u.date ? u.dn * DAY_S + 86_399 : keyIn(u, tz); }
      keys.push(...ruleKeys(r, startKey, endKey, untilKey, r.count == null ? minKey : null));
    }
    if (!info.rrules.length) keys.push(startKey);
    for (const rd of info.rdates) {
      const [a, b] = rd.value.split('/');
      const x = parseDt(a, rd.params, cal, tz);
      if (!x) continue;
      const k = info.allDay ? x.dn * DAY_S : keyIn(x, tz);
      keys.push(k);
      if (b) { const dd = parseDuration(b); if (dd != null) durOf.set(k, dd); else { const e = parseDt(b, rd.params, cal, tz); if (e) durOf.set(k, Math.round((msOf(e, tz) - msOf(x, tz)) / 1000)); } }
    }
    keys = [...new Set(keys)].sort((a, b) => a - b);
    const perDay = new Map();
    for (const k of keys) { const dn = Math.floor(k / DAY_S); perDay.set(dn, (perDay.get(dn) ?? 0) + 1); }
    const single = (dn) => (perDay.get(dn) ?? 0) <= 1;
    // EXDATE og RECURRENCE-ID: likt tidspunkt, lik lokal tid, eller samme dag når regelen har én forekomst den dagen
    // (eksportører som skriver EXDATE i UTC med feil klokkeslett, eller som dato).
    const keySet = new Set(keys);
    const matcher = (vals) => {
      const lk = new Set(), fuzzy = new Set(), dateOnly = new Set();
      for (const x of vals) {
        if (!x) continue;
        if (x.date) { dateOnly.add(x.dn); continue; }
        const k = keyIn(x, tz);
        lk.add(k);
        if (!keySet.has(k)) fuzzy.add(Math.floor(k / DAY_S)); // ingen forekomst på akkurat det klokkeslettet
      }
      return (key) => { const dn = Math.floor(key / DAY_S); return dateOnly.has(dn) || lk.has(key) || (fuzzy.has(dn) && single(dn)); };
    };
    const ex = matcher(info.exdates.map((x) => parseDt(x.value, x.params, cal, tz)));
    const ovs = (overrides.get(info.uid) ?? []).filter((o) => o.rid);
    const ov = matcher(ovs.map((o) => o.rid));
    let n = 0;
    for (const k of keys) {
      const inst = instanceOut(info, k, durOf.get(k), isRec, false);
      if (!inWin(inst)) continue;
      if (isRec && (ex(k) || ov(k))) continue;
      out.push({ ...pub(info), ...inst });
      if (++n >= MAX_OUT) break;
    }
  }
  // Overstyringer (flyttede timer) vises med egne tider; avlyste fjernes bare.
  for (const [uid, list] of overrides) for (const o of list) {
    if (o.status === 'CANCELLED') continue;
    const master = masters.find((m) => m.uid === uid);
    const info = { ...(master ?? {}), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))) };
    info.allDay = o.allDay; info.tz = o.tz; info.dur = o.hasEnd ? o.dur : master?.dur ?? o.dur;
    const inst = instanceOut(info, keyIn(o.start, o.tz), null, true, true);
    if (!inWin(inst)) continue;
    out.push({ ...pub(info), ...inst });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
