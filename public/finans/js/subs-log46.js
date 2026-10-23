// Prompt 46 (WEB46, claude-code-subscription-logg.md, fasit Subscription OS.dc.html → Historikk · Logg (hist.log)).
// Subscription OS på web: fanen «Historikk» med «Logg»: alle tidligere fakturaer og gratis prøveperioder, gruppert per måned
// (nyeste først) med månedssum. 3 måneder om gangen, «Vis eldre (N måneder)». Filter Alle / Fakturaer / Prøveperioder.
// «Eksporter CSV» (semikolon, UTF-8): Dato;Tjeneste;Type;Beløp for valgt filter.
// Server (SERVER46): GET /finans/api/subscriptions/log → {events:[{id, subscriptionId, service, type: charge|trial_start|trial_end|
//   trial_converted|trial_cancelled|price_change|cancelled, amount, currency, date, account, source, oldPrice?, newPrice?,
//   priceAfter?, days?, logoUrl?, domain?, category?}], summary?:{charges, trials, paid12m}}.
// Eldre server (404): loggen bygges av det som finnes (prøveperioder og prisendringer), med en melding om at fakturaene mangler.
import { S, api, esc, n0, render } from './core.js';
import { subLogo } from './fin42.js';

const L = { d: null, err: null, loading: false, f: 'all', months: 3, at: 0 };
const MON = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const kr = (v) => `${n0(Math.abs(Math.round(+v || 0)))} kr`;
const dS = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00`); return Number.isNaN(+d) ? '' : `${d.getDate()}. ${MON[d.getMonth()].slice(0, 3)}`; };
const TRIAL = new Set(['trial_start', 'trial_end', 'trial_converted', 'trial_cancelled']);
const isTrial = (e) => TRIAL.has(e.type);

export async function loadLog46(rerender, force = false) {
  if (L.loading || (!force && L.d && Date.now() - L.at < 60_000)) return;
  L.loading = true;
  try { const r = await api('/subscriptions/log?months=36'); L.d = { events: (r.events ?? r.items ?? []).filter((e) => e && e.date), summary: r.summary ?? null, server: true }; L.err = null; }
  catch (e) { L.d = { events: fallback(), server: false }; L.err = e.status === 404 ? 'missing' : e.message; }
  L.loading = false; L.at = Date.now();
  rerender?.();
}
/** Det som finnes uten logg på serveren: prøveperioder (aktive og avsluttede) og prisendringer. */
function fallback() {
  const d = S.subs ?? {}, out = [];
  for (const t of d.trials ?? []) {
    const start = t.startedAt ?? t.createdAt ?? t.startsAt ?? null, end = t.endsAt;
    const days = start && end ? Math.max(1, Math.round((new Date(`${end.slice(0, 10)}T12:00`) - new Date(`${String(start).slice(0, 10)}T12:00`)) / 864e5)) : null;
    if (start) out.push({ id: `ts-${t.id}`, service: t.service ?? t.name, type: 'trial_start', amount: 0, date: String(start).slice(0, 10), days, domain: t.domain });
    if (t.status === 'cancelled') out.push({ id: `tc-${t.id}`, service: t.service ?? t.name, type: 'trial_cancelled', amount: 0, priceAfter: t.priceAfter, date: (t.cancelledAt ?? end ?? '').slice(0, 10), domain: t.domain });
    else if (t.status === 'kept' || t.status === 'converted') out.push({ id: `tv-${t.id}`, service: t.service ?? t.name, type: 'trial_converted', amount: -(+t.priceAfter || 0), priceAfter: t.priceAfter, date: (end ?? '').slice(0, 10), domain: t.domain });
  }
  for (const s of d.items ?? []) if (s.prevPrice && s.priceChanged) out.push({ id: `pc-${s.id}`, subscriptionId: s.id, service: s.name, type: 'price_change', oldPrice: s.prevPrice, newPrice: s.price, amount: 0, date: String(s.priceChanged).slice(0, 10), domain: s.domain, category: s.category });
  return out.filter((e) => e.date);
}

function rowOf(e, i) {
  const sub = (S.subs?.items ?? []).find((s) => s.id === e.subscriptionId || s.name === e.service);
  const lg = subLogo({ ...(sub ?? {}), name: e.service ?? sub?.name, domain: e.domain ?? sub?.domain, logoUrl: e.logoUrl ?? sub?.logoUrl }, 36);
  let s = '', v = '', vc = '';
  const price = +(e.priceAfter ?? e.newPrice ?? sub?.price ?? 0);
  switch (e.type) {
    case 'charge': s = `Faktura · ${dS(e.date)}${e.account ? ` · ${e.account}` : ''}${e.oldPrice && +e.oldPrice < +(sub?.price ?? 0) ? ' · gammel pris' : ''}`; v = `−${kr(e.amount)}`; vc = 'neg'; break;
    case 'trial_start': s = `Prøveperiode startet · ${dS(e.date)}${e.days ? ` · gratis i ${e.days} dager` : ''}`; v = '0 kr'; break;
    case 'trial_cancelled': case 'trial_end': s = `Prøveperiode avsluttet · ${dS(e.date)} · sagt opp i tide`; v = price ? `Spart ${kr(price)}` : 'Spart'; vc = 'pos'; break;
    case 'trial_converted': s = `Prøveperiode gikk over til betalt · ${dS(e.date)}${price ? ` · ${kr(price)}/mnd` : ''}`; v = price ? `−${kr(price)}` : '–'; vc = 'neg'; break;
    case 'price_change': s = `Prisendring · ${dS(e.date)} · ${kr(e.oldPrice)} → ${kr(e.newPrice)}`; v = `${+e.newPrice >= +e.oldPrice ? '+' : '−'}${kr(Math.abs(+e.newPrice - +e.oldPrice))}`; vc = +e.newPrice > +e.oldPrice ? 'neg' : 'pos'; break;
    case 'cancelled': s = `Sagt opp · ${dS(e.date)}`; v = '–'; break;
    default: s = `${e.type ?? ''} · ${dS(e.date)}`; v = e.amount ? kr(e.amount) : '';
  }
  return `<div class="sl46-r${i ? ' bt' : ''}">${lg}<span class="grow"><span class="sl46-n"><b>${esc(e.service ?? sub?.name ?? 'Ukjent')}</b>${isTrial(e) ? '<span class="sl46-tag">PRØVE</span>' : ''}</span><small>${esc(s)}</small></span><b class="mono sl46-v ${vc}">${esc(v)}</b></div>`;
}
const sumOf = (list) => list.filter((e) => e.type === 'charge' || e.type === 'trial_converted').reduce((a, e) => a + Math.abs(+e.amount || +e.priceAfter || 0), 0);
const filtered = () => (L.d?.events ?? []).filter((e) => (L.f === 'all' ? true : L.f === 'charge' ? e.type === 'charge' : isTrial(e))).sort((a, b) => String(b.date).localeCompare(String(a.date)));

/** Fanen Historikk: Logg. */
export function logView46() {
  loadLog46(render);
  if (!L.d) { return '<section class="card sl46"><div class="skel" style="min-height:260px"></div></section>'; }
  const all = L.d.events, list = filtered();
  const nCh = all.filter((e) => e.type === 'charge').length, nTr = all.filter((e) => e.type === 'trial_start' || (isTrial(e) && !all.some((x) => x.type === 'trial_start' && x.service === e.service))).length;
  const y0 = new Date(); y0.setFullYear(y0.getFullYear() - 1);
  const paid12 = L.d.summary?.paid12m ?? sumOf(all.filter((e) => new Date(`${e.date}T12:00`) >= y0));
  const byM = new Map();
  for (const e of list) { const k = String(e.date).slice(0, 7); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(e); }
  const months = [...byM.keys()], shown = months.slice(0, L.months), rest = months.length - shown.length;
  const groups = shown.map((k) => { const ev = byM.get(k), [y, m] = k.split('-'); const s = sumOf(ev);
    return `<div class="sl46-g"><div class="sl46-gh"><span>${MON[+m - 1]} ${y}</span><span class="mono">${s ? `−${kr(s)}` : '0 kr'}</span></div><div class="sl46-box">${ev.map(rowOf).join('')}</div></div>`; }).join('');
  const chip = (k, n) => `<button type="button" class="sl46-chip" data-sl46-f="${k}" aria-pressed="${L.f === k}">${n}</button>`;
  return `<section class="card sl46"><div class="card-h"><h2>Logg</h2><button type="button" class="so-link plain" data-sl46="csv"${list.length ? '' : ' disabled'}>Eksporter CSV</button></div>
    <span class="muted">${nCh} ${nCh === 1 ? 'faktura' : 'fakturaer'} · ${nTr} ${nTr === 1 ? 'prøveperiode' : 'prøveperioder'} · ${kr(paid12)} betalt siste 12 mnd</span>
    <div class="sl46-chips">${chip('all', 'Alle')}${chip('charge', 'Fakturaer')}${chip('trial', 'Prøveperioder')}</div>
    ${L.err === 'missing' ? '<div class="note">Fakturaloggen er ikke klar på serveren ennå. Her vises prøveperioder og prisendringer som finnes.</div>' : L.err ? `<div class="note">Fikk ikke hentet loggen: ${esc(L.err)}</div>` : ''}
    ${groups || `<div class="note">${L.f === 'trial' ? 'Ingen prøveperioder i loggen ennå.' : L.f === 'charge' ? 'Ingen fakturaer i loggen ennå.' : 'Loggen er tom. Fakturaer fra bank, e-post og kvitteringer lagres her, også etter at et abonnement er sagt opp.'}</div>`}
    ${rest > 0 ? `<button type="button" class="btn sl46-more" data-sl46="more">Vis eldre (${rest} ${rest === 1 ? 'måned' : 'måneder'})</button>` : ''}</section>`;
}

const TYPE_TXT = { charge: 'Faktura', trial_start: 'Prøveperiode startet', trial_end: 'Prøveperiode avsluttet', trial_cancelled: 'Prøveperiode sagt opp', trial_converted: 'Prøveperiode gikk over til betalt', price_change: 'Prisendring', cancelled: 'Sagt opp' };
function csv() {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['Dato', 'Tjeneste', 'Type', 'Beløp'].join(';'), ...filtered().map((e) => [e.date, e.service ?? '', TYPE_TXT[e.type] ?? e.type, (e.type === 'charge' || e.type === 'trial_converted' ? -Math.abs(+e.amount || +e.priceAfter || 0) : +e.amount || 0).toFixed(2).replace('.', ',')].map(q).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `abonnement-logg-${L.f === 'all' ? 'alle' : L.f === 'charge' ? 'fakturaer' : 'proveperioder'}-${new Date().toLocaleDateString('sv-SE')}.csv` });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/** Klikk i loggen. true når det ble håndtert. */
export function logClick46(e, render) {
  const f = e.target.closest('[data-sl46-f]');
  if (f) { L.f = f.dataset.sl46F; L.months = 3; render(); return true; }
  const a = e.target.closest('[data-sl46]')?.dataset.sl46;
  if (a === 'more') { L.months += 3; render(); return true; }
  if (a === 'csv') { csv(); return true; }
  return false;
}
export const logReset46 = () => { L.at = 0; };

const CSS = `.sl46{display:flex;flex-direction:column;gap:12px}
.sl46-chips{display:flex;gap:6px;flex-wrap:wrap}
.sl46-chip{height:34px;padding:0 14px;border-radius:17px;border:1px solid var(--line2);background:transparent;color:var(--text);cursor:pointer;font:600 13px inherit;font-family:inherit}
.sl46-chip[aria-pressed=true]{background:var(--text);color:var(--bg);border-color:var(--text)}
.sl46-g{display:flex;flex-direction:column;gap:6px}
.sl46-gh{display:flex;justify-content:space-between;align-items:baseline;padding:4px 4px 0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sl46-gh .mono{text-transform:none;letter-spacing:0;font-size:12.5px}
.sl46-box{display:flex;flex-direction:column;border-radius:16px;border:1px solid var(--line2);padding:0 14px}
.sl46-r{display:flex;align-items:center;gap:12px;padding:11px 0}
.sl46-r.bt{border-top:1px solid var(--line2)}
.sl46-r .grow{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.sl46-r small{color:var(--muted);font-size:12.5px}
.sl46-n{display:flex;align-items:center;gap:6px;min-width:0}
.sl46-n b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl46-tag{flex:none;padding:1px 6px;border-radius:6px;background:rgba(95,211,168,.16);color:#3a9f7b;font-size:10px;font-weight:800;letter-spacing:.06em}
.sl46-v{flex:none;font-size:13.5px}
.sl46-v.neg{color:var(--text)}
.sl46-v.pos{color:#2f9e6f}
.sl46-more{align-self:center}`;
export function logCss46() { if (document.getElementById('sl46-css')) return; const st = document.createElement('style'); st.id = 'sl46-css'; st.textContent = CSS; document.head.appendChild(st); }
