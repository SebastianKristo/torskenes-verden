// Subscription OS i mobilappen (prompt 11, design «Subscription OS», variant mobile).
// Faner øverst: Hjem · Innsikt · Historikk. «+» åpner et ark med Skriv inn selv / Fra kvittering / Fra transaksjoner.
// Data fra /finans/api/subscriptions. Feltene categories, byMonth, health, savings og upcoming kommer fra FINANS;
// mangler de (eldre server), regnes et enklere bilde ut her fra abonnementene.
import { api, esc, n0, dd, today, icon, ICONS, logo, parseAmount, navName } from './core.js';
import { m, draw, flash, avatar, backBtn, theme } from './mobile.js';
import { haptic } from './mobile-haptics.js';

Object.assign(ICONS, { sins: 'M4 20V10M10 20V4M16 20v-7M22 20H2', shist: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', shome: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' });

export const SB = { d: null, err: '', tab: 'home', sheet: false, mode: null, f: { name: '', price: '', day: '', cycle: 'monthly' }, cand: null, candErr: '', busy: false, mon: null, done: null };
const TABS = [['home', 'Hjem', 'shome'], ['ins', 'Innsikt', 'sins'], ['hist', 'Historikk', 'shist']];
const TITLE = { home: 'Abonnementer', ins: 'Innsikt', hist: 'Historikk' };
const CAT_C = { Underholdning: '#FF7A3D', Produktivitet: '#7AA7FF', 'Lagring og sky': '#F2C14E', 'Helse og trening': '#5FD3A8', Transport: '#B79CFF', Annet: '#A0A0AA' };
const CAT_RE = [['Underholdning', /netflix|spotify|hbo|max\b|viaplay|disney|youtube|storytel|tv ?2|apple tv|tidal|audible|nrk|discovery|amazon prime|xbox|playstation|nintendo/i],
  ['Produktivitet', /chatgpt|openai|microsoft|office|adobe|notion|github|1password|claude|anthropic|canva|figma|slack|zoom|todoist/i],
  ['Lagring og sky', /icloud|google one|dropbox|proton|onedrive|backblaze|mega\b|pcloud/i],
  ['Helse og trening', /sats|strava|elixia|fresh fitness|evo|garmin|whoop|headspace|calm/i], ['Transport', /ruter|vy\b|bolt|voi|tier|entur|kolumbus|skyss|atb/i]];
const CYC = { monthly: ['Månedlig', '/mnd'], yearly: ['Årlig', '/år'], biennial: ['Hvert 2. år', '/2 år'] };
const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const kr = (v) => `${n0(v)} kr`;
const isI = () => theme() === 'ios';

export async function subsLoad() {
  try { SB.d = await api('/subscriptions'); SB.err = ''; } catch (e) { SB.err = e.message; }
}

/* ---------- Avledede tall (server først, ellers lokalt) ---------- */

const catOf = (x) => x.category || CAT_RE.find(([, re]) => re.test(x.name))?.[0] || 'Annet';
const statusOf = (x) => (!x.active ? 'off' : x.status ?? (x.lowUse ? 'low_use' : 'active'));
const per = (x) => x.monthly ?? (x.cycle === 'yearly' ? x.price / 12 : x.cycle === 'biennial' ? x.price / 24 : x.price);
const dayOf = (x) => x.chargeDay ?? (x.nextDate ? +x.nextDate.slice(8, 10) : null);
const items = () => SB.d?.items ?? [];
const act = () => items().filter((x) => x.active);
const ST = { active: ['Aktiv', 'ok'], low_use: ['⚠ Lite brukt', 'warn'], price_up: ['▲ Pris økt', 'up'], off: ['Sagt opp', 'off'] };
function upcoming(n = 7) {
  if (Array.isArray(SB.d?.upcoming)) return SB.d.upcoming.map((u) => ({ ...u, x: items().find((y) => y.id === u.id) })).filter((u) => u.x);
  const t0 = today(), t1 = new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');
  return act().filter((x) => x.nextDate && x.nextDate >= t0 && x.nextDate <= t1).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map((x) => ({ id: x.id, date: x.nextDate, amount: x.price, x }));
}
function savings() {
  if (SB.d?.savings) return SB.d.savings;
  const low = act().filter((x) => ['low_use', 'price_up'].includes(statusOf(x)));
  return { monthly: low.reduce((a, x) => a + per(x), 0), suggestions: low.map((x) => ({ id: x.id, text: statusOf(x) === 'price_up' ? `${x.name} har økt prisen. Sjekk en billigere plan.` : `Si opp ${x.name}. Den brukes lite.`, amount: per(x) })) };
}
function health() {
  if (SB.d?.health) return SB.d.health;
  const a = act(), low = a.filter((x) => statusOf(x) === 'low_use').length, up = a.filter((x) => statusOf(x) === 'price_up').length;
  const score = Math.max(30, Math.min(100, 100 - low * 12 - up * 8 - Math.max(0, a.length - 10) * 2));
  return { score, notes: [low ? `${low} abonnement${low > 1 ? 'er' : ''} brukes lite` : '', up ? `${up} har økt prisen` : ''].filter(Boolean) };
}
function cats() {
  if (Array.isArray(SB.d?.categories) && SB.d.categories.length && typeof SB.d.categories[0] === 'object') return SB.d.categories.map((c) => ({ name: c.name, total: c.total ?? c.monthly ?? 0, color: c.color ?? CAT_C[c.name] ?? CAT_C.Annet }));
  const by = new Map();
  for (const x of act()) by.set(catOf(x), (by.get(catOf(x)) ?? 0) + per(x));
  return [...by].map(([name, total]) => ({ name, total, color: CAT_C[name] ?? CAT_C.Annet })).sort((a, b) => b.total - a.total);
}
const doneSet = () => { if (!SB.done) { try { SB.done = JSON.parse(localStorage.getItem('fh_sub_done') || '{}') || {}; } catch { SB.done = {}; } } return SB.done; };

/* ---------- Byggeklosser ---------- */

const lg = (x, size = 38) => logo({ ...x, description: x.name }, size, isI() ? size / 2 : 12);
const card = (inner, cls = '') => `<div class="sb-card ${isI() ? 'glass2' : ''} ${cls}">${inner}</div>`;
const row = (x, right, sub) => `<div class="sb-row">${lg(x)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(x.name)}${x.plan ? ` <span class="sb-dim" style="font-weight:400">· ${esc(x.plan)}</span>` : ''}</b><span class="sb-dim m-ell">${esc(sub)}</span></span>${right}</div>`;
const whenTxt = (d) => { if (!d) return ''; const days = Math.round((new Date(d + 'T12:00') - new Date(today() + 'T12:00')) / 864e5); return days === 0 ? 'I dag' : days === 1 ? 'I morgen' : days > 1 && days < 7 ? new Date(d + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()) : `${+d.slice(8, 10)}. ${MND[+d.slice(5, 7) - 1]}`; };

function head() {
  const th = theme();
  return `<div class="m-row" style="justify-content:space-between">${backBtn(th, '#/mer', 'Tilbake til Mer')}${avatar()}</div>
    <div class="sb-tabs" role="tablist">${TABS.map(([k, n, ic]) => `<button role="tab" data-sb="tab" data-v="${k}" aria-selected="${SB.tab === k}">${icon(ic, 17)}${n}</button>`).join('')}</div>
    <div class="m-row" style="justify-content:space-between;padding:2px 4px 0"><div class="title m-ell">${esc(SB.tab === 'home' ? navName('sub', TITLE.home) : TITLE[SB.tab])}</div>
      <button class="sb-plus${SB.sheet ? ' on' : ''}" data-sb="sheet" aria-label="${SB.sheet ? 'Lukk' : 'Legg til abonnement'}" aria-expanded="${SB.sheet}">${SB.sheet ? '×' : '+'}</button></div>`;
}

function sheet() {
  if (!SB.sheet) return '';
  const f = SB.f, opt = (k, ic, t, s, tm) => `<span class="sb-opt${SB.mode === k ? ' on' : ''}"><span class="sb-oic">${ic}</span><b>${tm}</b><small>${t}</small><small class="sb-dim">${s}</small></span>`;
  return card(`<b class="sb-st">Legg til abonnement</b>
    <div class="sb-opts">
      <button type="button" data-sb="mode" data-v="man">${opt('man', '✎', 'Skriv inn selv', 'Tjeneste, beløp og trekkdag', 'Manuelt')}</button>
      <label>${opt('rc', '⎙', 'Fra kvittering', '✦ AI leser bilde, PDF eller e-post', 'Kvittering')}<input class="m-file" type="file" multiple accept="image/*,application/pdf" data-sbfile></label>
      <button type="button" data-sb="mode" data-v="tx">${opt('tx', '⇄', 'Fra transaksjoner', '✦ Finn faste trekk i banken', 'Transaksjon')}</button>
    </div>
    ${SB.mode === 'man' ? `<form class="sb-form" data-sbform>
      <input class="sinp" id="m-sb-name" value="${esc(f.name)}" placeholder="Tjeneste, f.eks. HBO Max" autocomplete="off" required>
      <div class="sb-two"><input class="sinp m-mono" id="m-sb-price" value="${esc(f.price)}" placeholder="Beløp kr" inputmode="decimal" required><input class="sinp" id="m-sb-day" value="${esc(f.day)}" placeholder="Trekkdag (1–31)" inputmode="numeric"></div>
      <div class="schips">${Object.entries(CYC).map(([k, [n]]) => `<button type="button" class="chip" data-sb="cyc" data-v="${k}" aria-pressed="${f.cycle === k}">${n}</button>`).join('')}</div>
      <button class="pri-b" type="submit" ${SB.busy ? 'disabled' : ''}>${SB.busy ? 'Legger til …' : 'Legg til'}</button>
      <div class="snote" style="padding:0">2-årige abonnementer regnes om: 1 200 kr hvert 2. år blir 50 kr/mnd.</div></form>` : ''}
    ${SB.mode === 'tx' ? `<div class="sb-cand">${SB.cand === null ? (SB.candErr ? `<div class="sb-dim" style="padding:8px 0">${esc(SB.candErr)}</div>` : '<div class="m-spin"></div>') : SB.cand.length ? SB.cand.map((c, i) => {
      const have = items().some((x) => x.name.toLowerCase() === String(c.merchant).toLowerCase());
      return `<div class="sb-row">${lg({ name: c.merchant, domain: c.domain })}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(c.merchant)}</b><span class="sb-dim m-ell">${esc(`${CYC[c.cycle]?.[0] ?? 'Fast'} · ${n0(c.amount)} kr · sett ${c.count} ganger${c.lastDate ? ` · sist ${dd(c.lastDate)}` : ''}`)}</span></span><button class="sb-add${have ? ' have' : ''}" data-sb="cand" data-i="${i}" ${have ? 'disabled' : ''}>${have ? '✓ Lagt til' : '+ Legg til'}</button></div>`;
    }).join('') : '<div class="sb-dim" style="padding:8px 0">Fant ingen nye faste trekk i transaksjonene.</div>'}</div>` : ''}`, 'sb-sheet');
}

/* ---------- Faner ---------- */

function home() {
  const sv = savings(), up = upcoming(7), wk = up.reduce((a, u) => a + (u.amount ?? u.x.price), 0);
  const bars = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() + Math.floor(i / 2) * 864e5).toLocaleDateString('sv-SE'); const v = i % 2 ? 0 : up.filter((u) => u.date === d).reduce((a, u) => a + (u.amount ?? 0), 0); return v; });
  const bmx = Math.max(1, ...bars);
  const low = act().filter((x) => ['low_use', 'price_up'].includes(statusOf(x)));
  const all = [...items()].sort((a, b) => (b.active - a.active) || String(a.nextDate ?? '9999').localeCompare(String(b.nextDate ?? '9999')));
  return `${sv.monthly > 0 ? `<div class="sb-hero"><span class="sb-k">✦ AI-SPARING</span><div class="sb-big">Spar ${kr(sv.monthly)}<br>i måneden</div><div class="sb-hs">AI fant ${sv.suggestions?.length ?? low.length} abonnement${(sv.suggestions?.length ?? low.length) === 1 ? '' : 'er'} å se på.</div><button class="sb-pill" data-sb="tab" data-v="hist">Gå gjennom</button></div>` : ''}
    ${card(`<div class="sb-wk"><div><span class="sb-dim">Neste 7 dager</span><b class="sb-wkv">${kr(wk)}</b><span class="sb-dim">${up.length} trekk</span></div><div class="sb-bars" aria-hidden="true">${bars.map((v, i) => `<i style="height:${v ? Math.max(8, (v / bmx) * 56) : 4}px" class="${v ? 'on' : ''}${i % 2 ? ' gap' : ''}"></i>`).join('')}</div></div>`)}
    ${low.length ? card(`<div class="sb-chk"><span class="sb-crown">♛</span><div class="m-grow"><b>Abonnementssjekk</b><span class="sb-dim">Gå gjennom før fornyelse</span></div></div><div class="sb-chk2"><span><b>${low.length} abonnement${low.length > 1 ? 'er' : ''}</b> trenger en titt · spar opptil <span class="sb-acc">${kr(low.reduce((a, x) => a + per(x), 0))}</span></span><span class="sb-avs">${low.slice(0, 4).map((x) => lg(x, 26)).join('')}</span></div>`) : ''}
    ${up.length ? `<div class="sec">Kommende trekk</div>${card(up.slice(0, 4).map((u) => row(u.x, `<b class="m-mono">${kr(u.amount ?? u.x.price)}</b>`, whenTxt(u.date))).join(''))}` : ''}
    <div class="sec">Alle abonnementer · ${kr(SB.d?.monthly ?? 0)}/mnd</div>
    ${card(all.map((x) => { const [n, c] = ST[statusOf(x)] ?? ST.active, [cl, pr] = CYC[x.cycle] ?? CYC.monthly;
      return row(x, `<span class="sb-r"><b class="m-mono">${n0(x.price)} kr<small class="sb-dim">${pr}</small></b><button class="stchip ${c}" data-subtog="${x.id}" aria-label="${x.active ? 'Si opp' : 'Gjenoppta'} ${esc(x.name)}">${x.active ? (c === 'ok' ? 'Aktiv' : 'Si opp') : 'Sagt opp'}</button></span>`, `${cl}${x.nextDate ? ` · neste ${dd(x.nextDate)}` : ''} · ${catOf(x)}${c !== 'ok' && x.active ? ` · ${n.replace(/^\W+ /, '')}` : ''}`);
    }).join('') || '<div class="m-empty">Ingen abonnementer ennå. Trykk + for å legge til.</div>')}
    <div class="snote" style="text-align:center">Trykk på status for å si opp eller gjenoppta.</div>`;
}

function insights() {
  const cm = today().slice(0, 7), bm0 = (Array.isArray(SB.d?.byMonth) ? SB.d.byMonth : []).filter((x) => String(x.month) <= cm), bm = bm0.length ? bm0.slice(-6) : null; // seks måneder til og med denne
  const cur = SB.d?.monthly ?? act().reduce((a, x) => a + per(x), 0);
  const sel = bm ? Math.min(bm.length - 1, SB.mon ?? bm.length - 1) : null;
  const prev = bm && bm.length > 1 ? bm[bm.length - 2].total : null;
  const trend = prev ? ((bm[bm.length - 1].total - prev) / prev) * 100 : null;
  const mx = bm ? Math.max(1, ...bm.map((x) => x.total)) : 1;
  const h = health(), ticks = Array.from({ length: 30 }, (_, i) => { const a = Math.PI * (1 - i / 29), on = i / 29 <= h.score / 100; return `<line x1="${(110 + 78 * Math.cos(a)).toFixed(1)}" y1="${(112 - 78 * Math.sin(a)).toFixed(1)}" x2="${(110 + 100 * Math.cos(a)).toFixed(1)}" y2="${(112 - 100 * Math.sin(a)).toFixed(1)}" class="${on ? (i < 10 ? 't1' : i < 20 ? 't2' : 't3') : 't0'}"/>`; }).join('');
  const cs = cats(), cmx = Math.max(1, ...cs.map((c) => c.total));
  const lbl = h.label ?? (h.score >= 80 ? 'Bra' : h.score >= 60 ? 'Greit' : 'Se over');
  return `${card(`<span class="sb-dim">Abonnementer per måned</span><b class="sb-wkv">${kr(bm ? bm[sel].total : cur)}</b>${trend != null ? `<span class="${trend > 0 ? 'sb-warn' : 'sb-ok'}">${trend > 0 ? '▲' : '▼'} ${Math.abs(trend).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % fra forrige måned</span>` : ''}
      ${bm ? `<div class="sb-months">${bm.map((x, i) => `<button data-sb="mon" data-v="${i}" aria-pressed="${i === sel}"><span style="height:${Math.max(8, (x.total / mx) * 100)}%"></span><small>${esc(MND[+String(x.month).slice(5, 7) - 1] ?? x.month)}</small></button>`).join('')}</div>` : '<span class="sb-dim sm">Månedshistorikk vises når serveren sender byMonth.</span>'}`)}
    ${card(`<div class="m-row" style="justify-content:space-between"><b>Abonnementshelse</b><span class="sb-tag">${lbl}</span></div><div class="sb-gauge"><svg viewBox="0 0 220 124" width="230" height="130" aria-hidden="true">${ticks}</svg><div class="sb-gv">${Math.round(h.score)}<span>/100</span></div></div>${(h.notes ?? []).length ? `<div class="sb-dim" style="text-align:center">${esc(h.notes.join(' · '))}</div>` : ''}`)}
    ${cs.length ? card(`<b>Per kategori</b>${cs.map((c) => `<div class="sb-cat"><div class="m-row" style="justify-content:space-between"><span>${esc(c.name)}</span><span class="m-mono">${kr(c.total)}</span></div><span class="sb-cbar"><i style="width:${(c.total / cmx) * 100}%;background:${c.color}"></i></span></div>`).join('')}`) : ''}`;
}

function history() {
  const sv = savings(), dn = doneSet(), tasks = (sv.suggestions ?? []).slice(0, 5), nd = tasks.filter((t) => dn[t.id]).length;
  const td = +today().slice(8, 10), mon = today().slice(0, 7);
  const paid = act().filter((x) => x.cycle === 'monthly' && dayOf(x) != null && dayOf(x) <= td).sort((a, b) => dayOf(b) - dayOf(a));
  const allM = act().filter((x) => x.cycle === 'monthly');
  const sumP = paid.reduce((a, x) => a + x.price, 0), sumA = allM.reduce((a, x) => a + x.price, 0);
  const seg = (f, c) => `<span class="sb-seg">${Array.from({ length: 22 }, (_, i) => `<i style="background:${i / 22 < f ? c : ''}"></i>`).join('')}</span>`;
  const off = items().filter((x) => !x.active);
  return `${tasks.length ? card(`<div class="sb-chk"><span class="sb-crown ai">✦</span><div class="m-grow"><b>Smart sparing</b><span class="sb-dim">AI-agent</span></div><span class="sb-tag ${nd === tasks.length ? 'ok' : ''}">${nd === tasks.length ? 'Fullført' : 'Pågår'}</span></div>
      <div class="sb-agb"><div><div class="m-row" style="justify-content:space-between"><span>Gjennomgått</span><b>${nd} av ${tasks.length}</b></div>${seg(nd / tasks.length, '#7AA7FF')}</div><div><div class="m-row" style="justify-content:space-between"><span>Mulig sparing</span><b>${kr(tasks.filter((t) => !dn[t.id]).reduce((a, t) => a + (t.amount ?? 0), 0))}/mnd</b></div>${seg(1 - nd / tasks.length, '#FF7A3D')}</div></div>
      ${tasks.map((t) => { const x = items().find((y) => y.id === t.id) ?? { name: t.text }; return `<button class="sb-task${dn[t.id] ? ' done' : ''}" data-sb="task" data-v="${esc(t.id)}" aria-pressed="${!!dn[t.id]}">${lg(x, 28)}<span class="m-grow">${esc(t.text)}</span><span class="sb-mark">${dn[t.id] ? '✓' : '○'}</span></button>`; }).join('')}`) : ''}
    ${card(`<span class="sb-dim">Betalt i ${MND[+mon.slice(5, 7) - 1]}</span><b class="sb-wkv">${kr(sumP)} <span class="sb-dim" style="font-size:15px;font-weight:500">av ${kr(sumA)}</span></b><span class="sb-cbar"><i style="width:${sumA ? (sumP / sumA) * 100 : 0}%;background:var(--sb-acc)"></i></span><span class="sb-dim sm">${paid.length} av ${allM.length} månedlige trekk er betalt</span>`)}
    <div class="sec">Denne måneden</div>
    ${card(paid.map((x) => row(x, `<b class="m-mono">−${kr(x.price)}</b>`, `${dayOf(x)}. ${MND[+mon.slice(5, 7) - 1]} · ${catOf(x)}`)).join('') || '<div class="m-empty">Ingen trekk ennå denne måneden.</div>')}
    ${off.length ? `<div class="sec">Sagt opp</div>${card(off.map((x) => row(x, `<button class="stchip off" data-subtog="${x.id}">Gjenoppta</button>`, `Sparer ${kr(per(x))}/mnd`)).join(''))}` : ''}`;
}

export function subsView() {
  if (SB.err && !SB.d) return `${head()}<div class="m-empty">Subscription OS er ikke tilgjengelig: ${esc(SB.err)}</div>`;
  if (!SB.d) return `<div class="sb">${head()}<div class="m-spin"></div></div>`;
  return `<div class="sb">${head()}${sheet()}${SB.tab === 'ins' ? insights() : SB.tab === 'hist' ? history() : home()}</div>`;
}

/* ---------- Hendelser ---------- */

async function loadCand() {
  SB.cand = null; SB.candErr = ''; draw();
  try { const r = await api('/subscriptions/candidates'); SB.cand = Array.isArray(r) ? r : r?.items ?? []; }
  catch (e) { SB.candErr = /404|Not Found/i.test(e.message) ? 'Serveren finner ikke faste trekk ennå. Oppdater FinansHub, eller legg til manuelt.' : e.message; }
  draw();
}

export async function subsBind(e, t) {
  if (m.screen !== 'sub' || m.sub) return false;
  const d = (s) => t.closest?.(s);
  let x;
  const fk = { 'm-sb-name': 'name', 'm-sb-price': 'price', 'm-sb-day': 'day' }[t.id];
  if (fk && (e.type === 'input' || e.type === 'change')) { SB.f[fk] = t.value; return true; }
  if (e.type === 'input') return false;
  if (e.type === 'change' && t.matches?.('[data-sbfile]')) {
    const files = [...t.files]; t.value = '';
    if (!files.length) return true;
    const fd = new FormData(); for (const f of files) fd.append('file', f);
    flash(`✦ AI leser ${files.length === 1 ? 'kvitteringen' : `${files.length} kvitteringer`} …`);
    await api('/subscriptions/receipts', { method: 'POST', body: fd });
    SB.sheet = false; SB.mode = null;
    // Kvitteringen leses i bakgrunnen og blir et abonnement når den er ferdig.
    setTimeout(async () => { if (m.screen === 'sub') { await subsLoad(); draw(); } }, 6000);
    flash('✦ Kvitteringen leses · abonnementet dukker opp når den er ferdig'); return true;
  }
  if (e.type === 'submit' && d('[data-sbform]')) {
    e.preventDefault();
    const f = SB.f, price = parseAmount(f.price), day = Math.min(31, Math.max(1, parseInt(f.day, 10) || 0));
    if (!f.name.trim() || !price) { haptic('err'); flash('Skriv tjeneste og beløp'); return true; }
    let next = null;
    if (day) { const n = new Date(); let dt = new Date(n.getFullYear(), n.getMonth(), day); if (dt < new Date(n.toDateString())) dt = new Date(n.getFullYear(), n.getMonth() + 1, day); next = dt.toLocaleDateString('sv-SE'); }
    SB.busy = true; draw();
    try {
      await api('/subscriptions', { method: 'POST', json: { name: f.name.trim(), price, cycle: f.cycle, nextDate: next, chargeDay: day || undefined } });
      SB.f = { name: '', price: '', day: '', cycle: 'monthly' }; SB.sheet = false; SB.mode = null;
      await subsLoad(); flash(`${f.name.trim()} er lagt til`);
    } finally { SB.busy = false; draw(); }
    return true;
  }
  if (e.type !== 'click') return false;
  if ((x = d('[data-subtog]'))) {
    const it = items().find((y) => String(y.id) === x.dataset.subtog);
    if (!it) return true;
    if (it.active && !confirm(`Markere ${it.name} som sagt opp?`)) return true;
    await api(`/subscriptions/${it.id}`, { method: 'PATCH', json: { active: !it.active } });
    await subsLoad(); flash(it.active ? `${it.name} er sagt opp` : `${it.name} er aktiv igjen`); return true;
  }
  if (!(x = d('[data-sb]'))) return false;
  e.preventDefault();
  const k = x.dataset.sb, v = x.dataset.v;
  if (k === 'tab') { SB.tab = v; SB.sheet = false; window.scrollTo(0, 0); }
  else if (k === 'sheet') { SB.sheet = !SB.sheet; SB.mode = SB.sheet ? 'man' : null; }
  else if (k === 'mode') { SB.mode = v; if (v === 'tx') { await loadCand(); return true; } }
  else if (k === 'cyc') SB.f.cycle = v;
  else if (k === 'mon') SB.mon = +v;
  else if (k === 'task') { const dn = doneSet(); dn[v] = !dn[v]; try { localStorage.setItem('fh_sub_done', JSON.stringify(dn)); } catch {} if (dn[v]) haptic('ok'); }
  else if (k === 'cand') {
    const c = SB.cand?.[+x.dataset.i];
    if (!c) return true;
    await api('/subscriptions', { method: 'POST', json: { fromCandidate: c } }).catch((err) => {
      // Eldre server uten fromCandidate: lag abonnementet fra feltene.
      if (!/fromCandidate|Tjeneste og pris/i.test(err.message)) throw err;
      return api('/subscriptions', { method: 'POST', json: { name: c.merchant, price: c.amount, cycle: c.cycle ?? 'monthly', domain: c.domain } });
    });
    await subsLoad(); flash(`${c.merchant} er lagt til`); return true;
  }
  draw(); return true;
}
