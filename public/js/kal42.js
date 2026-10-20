// Prompt 42 (WEB42, claude-code-abonnement-kalender.md, fasit Kalender App.dc.html → kalenderen {k:'ab', n:'Abonnementer', c:'#3d7f8a', src:'Finans'}):
// trekkdatoene fra Finans → Abonnementer som egen innebygd kalender i Kalender på web.
// - Kalenderen kommer fra GET /api/kalender/calendars (SERVER42: source:'builtin', badge:'INNEBYGD', kan skjules). Finnes den ikke ennå, vises den likevel.
// - Hendelsene: heldags, kind:'trekk' | 'trial' | 'renewal', subId, amount, currency, account, logo. Kommer de ikke med /api/kalender,
//   hentes GET /api/calendars/events?cal=ab&start&end, og til slutt lages de her fra /finans/api/subscriptions (12 måneder fram).
// - Måned: chip med logo (12 px) + navn; mange trekk samme dag → «3 trekk · 627 kr». Liste: logo, navn, beløp (Plex Mono), merke TREKK/PRØVE/ÅRLIG.
// - Detaljarket: logo, beløp, konto, intervall, neste trekk, «Åpne i Finans ›», «Si opp …». Ikke redigerbart («Endres i Finans → Abonnementer»).
import { esc } from './util.js';

export const AB_CAL = { id: 'abonnementer', key: 'ab', name: 'Abonnementer', color: '#3d7f8a', source: 'builtin', badge: 'INNEBYGD', sourceLabel: 'Finans', readOnly: true };
const KINDS = ['trekk', 'trial', 'renewal'];
const MON = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const krTxt = (v) => (v == null || Number.isNaN(+v) ? '' : `${(Math.round(+v * 100) / 100).toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`);

/** Er dette en abonnementshendelse (fra serveren)? */
export const isSubEvent = (x) => !!x && (KINDS.includes(x.kind) && (x.subId != null || /^(ab|abonnementer)$/i.test(String(x.calendar ?? x.cal ?? ''))) || /^(ab|abonnementer)$/i.test(String(x.calendar ?? '')));

/** Felt til kalender.js-hendelsen (e.ab). */
export function subFields(x) {
  const t = String(x.title ?? '');
  return { kind: KINDS.includes(x.kind) ? x.kind : 'trekk', subId: x.subId ?? null, name: x.name ?? t.split(' · ')[0].replace(/ fornyes$/, '').replace(/: prøveperioden slutter$/, ''),
    amount: x.amount ?? null, currency: x.currency ?? 'NOK', account: x.account ?? '', logo: x.logo ?? x.logoUrl ?? '', domain: x.domain ?? '', interval: x.interval ?? x.intervalLabel ?? '',
    next: x.next ?? x.nextDate ?? '', cancelUrl: x.cancelUrl ?? '', cancelled: x.cancelled ?? x.cancelledAt ?? '', varies: !!x.varies };
}

/* ---------------- Reserve: lag trekkene selv fra Finans ---------------- */

let cache = null, noVirt = false;
const addMonths = (iso, n, day) => { const [y, m] = iso.split('-').map(Number), d = new Date(y, m - 1 + n, 1, 12); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return key(d); };
function genFromSubs(j, from, to) {
  const out = [], today = key(new Date()), limit = addMonths(today, 12, new Date().getDate());
  for (const s of j?.items ?? []) {
    if (!s || !s.active || !s.nextDate || !/^\d{4}-\d{2}-\d{2}/.test(s.nextDate)) continue;
    const step = s.cycle === 'yearly' ? 12 : s.cycle === 'biennial' ? 24 : 1, day = +s.nextDate.slice(8, 10), next = s.nextDate.slice(0, 10);
    const yearly = step > 1, amount = s.myShare ?? s.price;
    const dates = [];
    for (let i = 0, d = next; d >= from && i < 400; i++, d = addMonths(next, -step * i, day)) if (d <= to) dates.push(d);
    for (let i = 1, d = addMonths(next, step, day); d <= to && d <= limit && i < 60; i++, d = addMonths(next, step * i, day)) dates.push(d);
    const per = s.cycleName ? `${s.cycleName}${s.chargeDay ? ` · den ${s.chargeDay}.` : ''}` : '';
    for (const d of [...new Set(dates)]) {
      out.push({ id: `ab|${s.id}|${d}`, title: yearly ? `${s.name} fornyes · ${krTxt(amount)}` : `${s.name} · ${krTxt(amount)}`, start: d, end: d, allDay: true, calendar: 'abonnementer', kind: yearly ? 'renewal' : 'trekk',
        subId: s.id, name: s.name, amount, currency: 'NOK', account: s.account ?? '', logo: s.logoUrl ?? '', domain: s.domain ?? '', interval: step === 1 ? `Hver måned den ${day}.` : per, next, editable: false, source: 'finans' });
    }
  }
  return out;
}

/** Legger abonnementstrekkene inn i svaret fra /api/kalender hvis serveren ikke sendte dem. Tåler 404 på alle kall. */
export async function addSubs(r, from, to) {
  if (!r || !Array.isArray(r.events) || r.events.some(isSubEvent)) return r;
  const ck = `${from}|${to}`;
  if (cache?.k === ck && Date.now() - cache.at < 5 * 60_000) { r.events.push(...cache.ev); return r; }
  let ev = null;
  if (!noVirt) {
    try {
      const x = await fetch(`/api/calendars/events?cal=ab&start=${from}&end=${to}`, { credentials: 'same-origin', cache: 'no-store' });
      if (x.ok && /json/.test(x.headers.get('content-type') ?? '')) { const j = await x.json(); ev = (Array.isArray(j) ? j : j.events ?? []).map((e) => ({ calendar: 'abonnementer', allDay: true, ...e })); }
      else if (x.status === 404) noVirt = true; // serveren har ikke den virtuelle kalenderen: spør ikke igjen i denne økta
    } catch { /* neste reserve */ }
  }
  if (!ev) {
    try { const x = await fetch('/finans/api/subscriptions', { credentials: 'same-origin', cache: 'no-store' }); ev = x.ok ? genFromSubs(await x.json(), from, to) : []; } catch { ev = []; }
  }
  cache = { k: ck, at: Date.now(), ev };
  r.events.push(...ev);
  return r;
}

/* ---------------- Visning ---------------- */

const LOGO_ERR = 'data-k42-logo';
/** Logo 12–28 px: logo-URL → /finans/api/logo/<domene> → forbokstaven. */
export function logo(e, sz = 12) {
  const a = e.ab ?? {}, src = a.logo || (a.domain ? `/finans/api/logo/${encodeURIComponent(a.domain)}` : '');
  const ini = esc(String(a.name || e.t || '?').trim().charAt(0).toUpperCase());
  return `<span class="k42-lg" style="--s:${sz}px" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" ${LOGO_ERR} loading="lazy">` : ''}<i>${ini}</i></span>`;
}
let errBound = false;
export function bindLogos() {
  if (errBound) return;
  errBound = true;
  document.addEventListener('error', (ev) => { const t = ev.target; if (t?.tagName === 'IMG' && t.hasAttribute(LOGO_ERR)) t.remove(); }, true);
}
export const badge = (e) => (e.ab?.kind === 'trial' ? 'PRØVE' : e.ab?.kind === 'renewal' ? 'ÅRLIG' : 'TREKK');

/** Måned/heldag: mange trekk samme dag slås sammen til én chip («3 trekk · 627 kr»). */
export function groupSubs(L, min = 3) {
  const subs = L.filter((e) => e.kind === 'ab');
  if (subs.length < min) return L;
  const sum = subs.reduce((a, e) => a + (+e.ab?.amount || 0), 0), at = L.indexOf(subs[0]);
  const g = { id: `abg|${subs[0].k}`, kind: 'abg', ac: subs[0].ac, t: `${subs.length} trekk${sum ? ` · ${krTxt(sum)}` : ''}`, items: subs, k: subs[0].k, all: true, s: '', e: '' };
  const rest = L.filter((e) => e.kind !== 'ab');
  rest.splice(Math.min(at, rest.length), 0, g);
  return rest;
}
export const chipInner = (e) => (e.kind === 'abg' ? `${logo(e.items[0])}<span class="k39-chip-n">${esc(e.t)}</span>` : `${logo(e)}<span class="k39-chip-n" data-no-i18n>${esc(e.ab?.name || e.t)}</span>`);

/** Rad i Liste-visningen. */
export function listRow(e, tStyle) {
  const a = e.ab ?? {}, b = badge(e);
  return `<button type="button" class="k39-lr k42-lr" data-k-sel="${esc(e.id)}" style="${tStyle}">${logo(e, 22)}<span class="k39-lrm"><b data-no-i18n>${esc(a.name || e.t)}</b><span>${esc(a.kind === 'trial' ? 'Prøveperioden slutter' : a.account || 'Abonnementer · Finans')}</span></span><span class="k42-amt">${esc(a.amount != null ? krTxt(a.amount) : a.varies ? 'varierer' : '')}</span><span class="k39-tag${b === 'PRØVE' ? ' red' : ''}">${b}</span></button>`;
}

/** Detaljarket for et trekk. dLong(d) og fromKey(k) fra kalender.js. */
export function subSheet(e, { longDate, fromKey }) {
  const a = e.ab ?? {}, b = badge(e);
  const rows = [a.amount == null && ['Beløp', 'Varierer'], a.varies && ['Beløp', 'Snitt for de 3 siste'], a.account && ['Konto', /^trekkes/i.test(a.account) ? a.account.replace(/^trekkes fra /i, '') : a.account], a.interval && ['Intervall', a.interval],
    a.next && ['Neste trekk', (() => { const d = fromKey(String(a.next).slice(0, 10)); return `${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; })()], a.cancelled && ['Status', `Sagt opp ${a.cancelled}`]].filter(Boolean);
  const fin = `/finans/#/abonnementer${a.subId != null ? `?id=${encodeURIComponent(a.subId)}` : ''}`;
  return `<div class="k2-sheet-bg" data-k-close><div class="k2-sheet k42-sheet" role="dialog" aria-modal="true" aria-label="${esc(e.t)}" style="--c:#3d7f8a">
    <span class="k2-grip k38-grip" aria-hidden="true"></span>
    <div class="k2-det-h">${logo(e, 40)}<div class="k2-grow"><span class="k2-lab">ABONNEMENTER · ${b}</span><b data-no-i18n>${esc(a.name || e.t)}</b><span>${esc(longDate(fromKey(e.k)))} · Hele dagen</span></div><button type="button" class="k2-x" data-k-close aria-label="Lukk">✕</button></div>
    ${a.amount != null ? `<b class="k42-big">${esc(krTxt(a.amount))}</b>` : ''}
    <div class="k2-rows">${rows.map(([x, y]) => `<div><span>${esc(x)}</span><b>${esc(y)}</b></div>`).join('')}</div>
    <span class="k2-src">Endres i Finans → Abonnementer.</span>
    <div class="k2-btns"><a class="k2-b ink" href="${esc(fin)}">Åpne i Finans ›</a>${/^https:\/\//.test(a.cancelUrl) ? `<a class="k2-b line" href="${esc(a.cancelUrl)}" target="_blank" rel="noopener">Si opp …</a>` : ''}</div>
  </div></div>`;
}

/* ---------------- Varsler for abonnementer (Innstillinger → Kalendere) ---------------- */
const NKEY = 'kal42_ab_notify';
// Samme verdier som SERVER42 (PATCH /api/kalender/calendars/abonnementer {notify}).
export const NOTIFY = [['off', 'Av'], ['day_before', 'Dagen før'], ['trials_yearly', 'Prøveperioder og årlige']];
export const abNotify = (cal) => { const v = cal?.notify ?? (() => { try { return localStorage.getItem(NKEY); } catch { return null; } })(); return NOTIFY.some(([k]) => k === v) ? v : 'trials_yearly'; };
export function setAbNotify(v, srvId = 'abonnementer') {
  try { localStorage.setItem(NKEY, v); } catch { /* privat modus */ }
  fetch(`/api/kalender/calendars/${encodeURIComponent(srvId)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: v }) }).catch(() => {});
}
