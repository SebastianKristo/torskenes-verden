// Prompt 42 (claude-code-finanshub-filter.md): Filter er en egen side i sidemenyen under Glimt. Panelet står alltid åpent:
// Glimt-felt + butikksøk på samme rad, Butikk, Kategori, Bolig, Beløp og Periode (måneder / uker / datoer), aktive
// brikker med Nullstill, og lista med hver transaksjon (rad → panel med kvitteringen). Filteret ligger i adressen
// (#/filter?shop=…&wk=34-50&min=500), så det kan deles. Serveren filtrerer når den kan (/transactions?merchant[]=…),
// ellers filtreres lista her. Glimt fyller ut filteret: POST /filter/glimt {q}, ellers lokal tolkning (parseQuery).
import { S, api, esc, n0, n2, dd, render, toast, logo } from './core.js';
import { orb, secs } from './fin42.js';
import { rcPanel52 } from './rcpanel52.js'; // prompt 52 (WEB52F)

const u = S.ui;
const F = () => (u.f42 ??= fromHash());
const MN = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const year = () => new Date().getFullYear();
const norm = (s) => String(s ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^(vipps\*|vipps |klarna\*|iz \*|sumup ?\*|paypal \*|varekjop |kortkjop |visa )+/, '').replace(/\*+/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim();
// Butikknavn som gruppe: «ICA KVANTUM 1234» og «ICA Nær Bislett» → to butikker, men «ica» finner begge.
const shopOf = (t) => String(t.merchant || t.description || '').replace(/\s+\d{3,}\s*$/, '').replace(/\s{2,}/g, ' ').trim();

/* ---------- Tilstand ⇄ adresse ---------- */
function fromHash() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const f = { shops: (q.get('shop') ?? '').split(',').filter(Boolean), cats: (q.get('cat') ?? '').split(',').filter(Boolean), home: q.get('home') ?? '', min: q.get('min') ?? '', max: q.get('max') ?? '', mode: null, y: +(q.get('y') ?? year()) };
  if (q.get('wk')) { const [a, b] = q.get('wk').split('-').map(Number); Object.assign(f, { mode: 'w', w1: a, w2: b ?? a }); }
  else if (q.get('from') || q.get('to')) { Object.assign(f, { mode: 'm', m1: q.get('from') ?? q.get('to'), m2: q.get('to') ?? q.get('from') }); }
  else if (q.get('d1') || q.get('d2')) Object.assign(f, { mode: 'd', d1: q.get('d1') ?? '', d2: q.get('d2') ?? '' });
  return f;
}
function toHash(f = F()) {
  const q = new URLSearchParams();
  if (f.shops.length) q.set('shop', f.shops.join(','));
  if (f.cats.length) q.set('cat', f.cats.join(','));
  if (f.home) q.set('home', f.home);
  if (f.min !== '') q.set('min', f.min);
  if (f.max !== '') q.set('max', f.max);
  if (f.mode === 'w') q.set('wk', `${f.w1}-${f.w2}`);
  if (f.mode === 'm') { q.set('from', f.m1); q.set('to', f.m2); }
  if (f.mode === 'd') { if (f.d1) q.set('d1', f.d1); if (f.d2) q.set('d2', f.d2); }
  if ((f.mode === 'w' || f.mode === 'm') && f.y !== year()) q.set('y', f.y);
  const s = q.toString();
  window.history.replaceState(null, '', `#/filter${s ? `?${s}` : ''}`);
}
// ISO-uke → mandag. Uke 50 → uke 6 går over nyttår.
function isoMonday(y, w) { const j4 = new Date(Date.UTC(y, 0, 4)), d = (j4.getUTCDay() + 6) % 7; const m = new Date(j4); m.setUTCDate(j4.getUTCDate() - d + (w - 1) * 7); return m; }
const iso = (d) => d.toISOString().slice(0, 10);
export function range(f = F()) {
  if (f.mode === 'w' && f.w1) { const y2 = f.w2 < f.w1 ? f.y + 1 : f.y, a = isoMonday(f.y, f.w1), b = isoMonday(y2, f.w2 ?? f.w1); b.setUTCDate(b.getUTCDate() + 6); return [iso(a), iso(b)]; }
  if (f.mode === 'm' && f.m1) { const [y1, a] = String(f.m1).includes('-') ? f.m1.split('-').map(Number) : [f.y, +f.m1], [y2, b] = String(f.m2).includes('-') ? f.m2.split('-').map(Number) : [f.y, +f.m2]; const end = new Date(Date.UTC(y2, b, 0)); return [`${y1}-${String(a).padStart(2, '0')}-01`, iso(end)]; }
  if (f.mode === 'd') return [f.d1 || null, f.d2 || null];
  return [null, null];
}
const mLabel = (m) => { const [y, mo] = String(m).includes('-') ? m.split('-').map(Number) : [null, +m]; return `${MN[mo - 1]}${y && y !== year() ? ` ${y}` : ''}`; };
function chipsOf(f = F()) {
  const L = [];
  if (f.shops.length) L.push(['shops', `Butikk: ${f.shops.join(', ')}`]);
  if (f.cats.length) L.push(['cats', `Kategori: ${f.cats.join(', ')}`]);
  if (f.home) L.push(['home', `Bolig: ${f.home === 'all' ? 'Alle boliger' : (S.f42homes ?? []).find((h) => String(h.id) === String(f.home))?.name ?? f.home}`]);
  if (f.min !== '' || f.max !== '') L.push(['amt', f.min !== '' && f.max !== '' ? `${n0(+f.min)}–${n0(+f.max)} kr` : f.min !== '' ? `Over ${n0(+f.min)} kr` : `Under ${n0(+f.max)} kr`]);
  if (f.mode === 'w') L.push(['per', `Uke ${f.w1}–${f.w2}`]);
  if (f.mode === 'm') { const a = mLabel(f.m1), b = mLabel(f.m2); L.push(['per', a === b ? a[0].toUpperCase() + a.slice(1) : `${a[0].toUpperCase() + a.slice(1)}–${b}`]); }
  if (f.mode === 'd' && (f.d1 || f.d2)) L.push(['per', `${f.d1 ? dd(f.d1) : '…'}–${f.d2 ? dd(f.d2) : '…'}`]);
  return L;
}

/* ---------- Data ---------- */
export async function loadFilter() {
  const f = F(), [from, to] = range(f), p = new URLSearchParams({ limit: '5000' });
  f.shops.forEach((x) => p.append('merchant[]', x)); f.cats.forEach((x) => p.append('category[]', x));
  if (f.home) p.set('home', f.home); if (f.min !== '') p.set('min', f.min); if (f.max !== '') p.set('max', f.max);
  if (from) p.set('from', from); if (to) p.set('to', to); if (f.mode === 'w') p.set('week', `${f.w1}-${f.w2}`);
  const [tx, facets, homes] = await Promise.all([api(`/transactions?${p}`).catch(() => api('/transactions?limit=5000')), api('/filter/facets').catch(() => null), S.f42homes ? null : api('/folders').catch(() => [])]);
  S.f42 = tx.items ?? [];
  S.f42all ??= S.f42;
  if (!f.shops.length && !f.cats.length && !f.home && f.min === '' && f.max === '' && !f.mode) S.f42all = S.f42;
  S.f42facets = facets; if (homes) S.f42homes = homes;
}
const facetList = (key) => {
  const srv = S.f42facets?.[key];
  if (Array.isArray(srv) && srv.length) return srv.map((x) => (typeof x === 'string' ? { name: x, n: 0 } : { name: x.name ?? x.merchant ?? x.category, n: x.count ?? x.n ?? 0, color: x.color }));
  const cnt = new Map();
  for (const t of S.f42all ?? S.f42 ?? []) { const k = key === 'shops' ? shopOf(t) : t.category; if (!k) continue; const c = cnt.get(k) ?? { name: k, n: 0, color: t.color }; c.n++; cnt.set(k, c); }
  return [...cnt.values()].sort((a, b) => b.n - a.n);
};
// Treff i lista: serveren har filtrert når den kan; filtrer likevel her, så resultatet blir likt med eldre servere.
function rows() {
  const f = F(), [from, to] = range(f), sh = f.shops.map(norm);
  return (S.f42 ?? []).filter((t) => {
    if (sh.length && !sh.some((s) => norm(shopOf(t)).startsWith(s) || norm(t.merchant || t.description).includes(s))) return false;
    if (f.cats.length && !f.cats.includes(t.category)) return false;
    if (f.home === 'all' && !t.folderId && !t.homeId) return false;
    if (f.home && f.home !== 'all' && String(t.folderId ?? t.homeId ?? '') !== String(f.home)) return false;
    const a = Math.abs(t.amount);
    if (f.min !== '' && a < +f.min) return false;
    if (f.max !== '' && a > +f.max) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------- Glimt fyller ut filteret ---------- */
const MONTH_RE = new RegExp(`\\b(${MN.join('|')})\\b`, 'g');
export function parseQuery(q, shops = facetList('shops').map((x) => x.name), cats = facetList('cats').map((x) => x.name), homes = S.f42homes ?? []) {
  const s = ` ${String(q).toLowerCase()} `, out = {}, n = norm(q);
  const num = (x) => +String(x).replace(/\s/g, '').replace(',', '.');
  let m;
  if ((m = s.match(/mellom\s+([\d\s.,]+)\s*(?:kr)?\s*og\s+([\d\s.,]+)/))) { out.min = num(m[1]); out.max = num(m[2]); }
  else { if ((m = s.match(/(?:over|mer enn|minst)\s+([\d\s.,]+)/))) out.min = num(m[1]); if ((m = s.match(/(?:under|mindre enn|maks)\s+([\d\s.,]+)/))) out.max = num(m[1]); }
  if ((m = s.match(/uke\s*(\d{1,2})\s*(?:til|-|–)\s*(?:uke\s*)?(\d{1,2})/))) Object.assign(out, { mode: 'w', w1: +m[1], w2: +m[2] });
  else if ((m = s.match(/uke\s*(\d{1,2})/))) Object.assign(out, { mode: 'w', w1: +m[1], w2: +m[1] });
  const ms = [...s.matchAll(MONTH_RE)].map((x) => MN.indexOf(x[1]) + 1);
  if (!out.mode && ms.length) Object.assign(out, { mode: 'm', m1: `${year()}-${String(ms[0]).padStart(2, '0')}`, m2: `${year()}-${String(ms.at(-1)).padStart(2, '0')}` });
  if (!out.mode && /\bi år\b/.test(s)) Object.assign(out, { mode: 'd', d1: `${year()}-01-01`, d2: '' });
  if (!out.mode && /\bi fjor\b/.test(s)) Object.assign(out, { mode: 'd', d1: `${year() - 1}-01-01`, d2: `${year() - 1}-12-31` });
  const words = new Set(n.split(' '));
  const sh = [...new Set(shops.filter((x) => { const k = norm(x).split(' ')[0]; return k.length > 1 && words.has(k); }))];
  if (sh.length) out.shops = sh;
  const cs = cats.filter((c) => n.includes(norm(c).split(' ')[0]) && norm(c).split(' ')[0].length > 2);
  if (cs.length) out.cats = cs;
  if (/\bhytta\b|\bboliger?\b/.test(s)) out.home = 'all';
  const hh = homes.find((h) => n.includes(norm(h.name)));
  if (hh) out.home = String(hh.id);
  return out;
}
async function glimtFill(q) {
  const f = F(), t0 = performance.now();
  u.f42g = { q, busy: true, t0: Date.now() }; render();
  let r = null, eng = 'lokalt';
  try { r = await api('/filter/glimt', { method: 'POST', json: { q } }); eng = r?.engine ?? 'lokalt'; r = r?.filter ?? r; } catch { r = null; }
  if (!r || !Object.keys(r).length) r = parseQuery(q);
  // Serverformat (merchant[], category[], from/to, week) eller lokalt format.
  const shops = r.shops ?? r.merchant ?? r.merchants, cats = r.cats ?? r.category ?? r.categories;
  if (shops?.length) f.shops = [...new Set([...(Array.isArray(shops) ? shops : [shops])])];
  if (cats?.length) f.cats = Array.isArray(cats) ? cats : [cats];
  if (r.home != null) f.home = String(r.home);
  if (r.min != null) f.min = String(r.min); if (r.max != null) f.max = String(r.max);
  if (r.mode) Object.assign(f, { mode: r.mode, w1: r.w1, w2: r.w2, m1: r.m1, m2: r.m2, d1: r.d1 ?? '', d2: r.d2 ?? '' });
  else if (r.week) { const [a, b] = String(r.week).split('-').map(Number); Object.assign(f, { mode: 'w', w1: a, w2: b ?? a }); }
  else if (r.from || r.to) Object.assign(f, { mode: 'd', d1: r.from ?? '', d2: r.to ?? '' });
  const ms = performance.now() - t0;
  u.f42g = { q, busy: false, msg: `✦ Glimt satte filteret: ${chipsOf(f).map((c) => c[1].replace(/^\w+: /, '')).join(' · ') || 'fant ingen filter i teksten'} · ${secs(ms)}${eng === 'ollama' ? ' · Ollama' : ''}` };
  toHash(f); await loadFilter(); render();
}

/* ---------- Tegning ---------- */
const chip = (on, label, attr, dot) => `<button type="button" class="f42-chip${on ? ' on' : ''}" ${attr}>${dot ? `<i style="background:${esc(dot)}"></i>` : ''}${esc(label)}</button>`;
export function filterPage() {
  if (!S.f42) return '<div class="skel" style="min-height:420px"></div>';
  const f = F(), sq = u.f42sq ?? '', nq = norm(sq);
  const shopsAll = facetList('shops'), catsAll = facetList('cats');
  const showShops = sq ? shopsAll.filter((x) => norm(x.name).includes(nq) || norm(x.name).split(' ').some((w) => w.startsWith(nq))) : [...shopsAll.filter((x) => f.shops.includes(x.name)), ...shopsAll.filter((x) => !f.shops.includes(x.name)).slice(0, u.f42moreS ? 999 : Math.max(0, 6 - f.shops.length))];
  const restS = sq ? 0 : shopsAll.length - showShops.length;
  const showCats = [...catsAll.filter((x) => f.cats.includes(x.name)), ...catsAll.filter((x) => !f.cats.includes(x.name)).slice(0, u.f42moreC ? 999 : Math.max(0, 6 - f.cats.length))];
  const restC = catsAll.length - showCats.length;
  const homes = S.f42homes ?? [];
  const R = rows(), sum = R.reduce((a, t) => a + Math.abs(t.amount), 0), act = chipsOf(f);
  const y = f.y, opts = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  const mSel = (name, v) => `<select data-f42="${name}" aria-label="${name === 'm1' ? 'Fra måned' : 'Til måned'}">${opts.map((o, i) => `<option value="${o}"${o === v ? ' selected' : ''}>${MN[i][0].toUpperCase() + MN[i].slice(1)}</option>`).join('')}</select>`;
  const per = f.mode === 'm' ? `<div class="f42-row">Fra ${mSel('m1', f.m1)} til ${mSel('m2', f.m2)} <span class="f42-lab" style="margin-left:6px">ÅR</span><input class="wk" type="number" data-f42="y" value="${y}" aria-label="År"></div>`
    : f.mode === 'w' ? `<div class="f42-row">Uke <input class="wk" type="number" min="1" max="53" data-f42="w1" value="${f.w1 ?? ''}" aria-label="Fra uke"> til uke <input class="wk" type="number" min="1" max="53" data-f42="w2" value="${f.w2 ?? ''}" aria-label="Til uke"> <span class="f42-lab" style="margin-left:6px">ÅR</span><input class="wk" type="number" data-f42="y" value="${y}" aria-label="År"></div>`
      : f.mode === 'd' ? `<div class="f42-row">Fra <input type="date" data-f42="d1" value="${esc(f.d1 ?? '')}" aria-label="Fra dato"> til <input type="date" data-f42="d2" value="${esc(f.d2 ?? '')}" aria-label="Til dato"></div>` : '';
  const pre = [['', 100, 'Under 100'], [100, 500, '100–500'], [500, 5000, '500–5 000'], [5000, '', 'Over 5 000']];
  const G = u.f42g;
  return `<div class="f42">
    <div class="f42-panel">
      <div class="f42-top"><form class="f42-g" data-f42-form="glimt">${orb(30, !!G?.busy)}<input name="q" value="${esc(G?.q ?? '')}" placeholder="Spør Glimt, f.eks. «ICA mellom 500 og 5000 kr i uke 34 til 50»" aria-label="Spør Glimt om filteret" autocomplete="off"><button>Spør Glimt</button></form>
        <div class="f42-s">${'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="color:var(--muted)"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'}<input value="${esc(sq)}" placeholder="Søk etter butikk …" aria-label="Søk etter butikk" data-f42-sq autocomplete="off">${sq ? '<button type="button" data-f42-act="sq-clear" aria-label="Tøm">×</button>' : ''}</div></div>
      ${G?.busy ? `<span class="f42-gmsg">Glimt tenker … ${secs(Date.now() - G.t0)}</span>` : G?.msg ? `<span class="f42-gmsg">${esc(G.msg)}</span>` : ''}
      <div class="f42-sec"><span class="f42-lab">BUTIKK</span><div class="f42-chips" data-f42-shops>${showShops.map((x) => chip(f.shops.includes(x.name), x.name, `data-f42-shop="${esc(x.name)}"`)).join('')}${restS > 0 ? `<button type="button" class="f42-chip more" data-f42-act="more-s">+ ${restS} flere</button>` : u.f42moreS && !sq ? '<button type="button" class="f42-chip more" data-f42-act="more-s">Vis færre</button>' : ''}${sq && !showShops.length ? `<span class="note" style="font-size:13.5px">Ingen butikker heter «${esc(sq)}».</span>` : ''}</div></div>
      <div class="f42-sec"><span class="f42-lab">KATEGORI</span><div class="f42-chips">${showCats.map((x) => chip(f.cats.includes(x.name), x.name, `data-f42-cat="${esc(x.name)}"`, x.color ?? '#8a8478')).join('')}${restC > 0 ? `<button type="button" class="f42-chip more" data-f42-act="more-c">+ ${restC} flere</button>` : u.f42moreC ? '<button type="button" class="f42-chip more" data-f42-act="more-c">Vis færre</button>' : ''}</div></div>
      ${homes.length ? `<div class="f42-sec"><span class="f42-lab">BOLIG</span><div class="f42-chips">${chip(!f.home, 'Alle transaksjoner', 'data-f42-home=""')}${chip(f.home === 'all', 'Alle boliger', 'data-f42-home="all"')}${homes.map((h) => chip(String(f.home) === String(h.id), h.name, `data-f42-home="${h.id}"`)).join('')}</div></div>` : ''}
      <div class="f42-sec"><span class="f42-lab">BELØP</span><div class="f42-row">Mellom <input class="amt" inputmode="numeric" data-f42="min" value="${esc(f.min)}" placeholder="0" aria-label="Fra beløp"> og <input class="amt" inputmode="numeric" data-f42="max" value="${esc(f.max)}" placeholder="ingen grense" aria-label="Til beløp"> kr ${pre.map(([a, b, n]) => chip(String(f.min) === String(a) && String(f.max) === String(b), n, `data-f42-pre="${a}:${b}"`)).join('')}</div></div>
      <div class="f42-sec"><span class="f42-lab">PERIODE</span><div class="f42-chips">${[['', 'Alt'], ['m', 'Måneder'], ['w', 'Uker'], ['d', 'Datoer']].map(([k, n]) => chip((f.mode ?? '') === k, n, `data-f42-mode="${k}"`)).join('')}</div>${per}</div>
    </div>
    <div class="f42-acts">${act.map(([k, t]) => `<button type="button" class="f42-chip act" data-f42-clr="${k}" title="Fjern filter">${esc(t)} <em>×</em></button>`).join('')}${act.length ? `<button type="button" class="f42-reset" data-f42-act="reset">Nullstill</button>` : ''}<span class="note" style="font-size:13px">${R.length === 1 ? '1 treff' : `${R.length} treff`}</span><span class="grow" style="flex:1"></span>${act.length ? `<button type="button" class="btn sm" data-f42-act="ask">${orb(18)} Spør Glimt om dette</button><button type="button" class="btn sm" data-f42-act="report">Lag rapport</button>` : ''}</div>
    <div class="f42-list"><div><div class="f42-lh"><span>${R.length === 1 ? '1 transaksjon' : `${R.length} transaksjoner`}</span><span>Sum <b>${n2(sum)} kr</b></span></div>
      <div class="f42-tr h"><span>DATO</span><span>BESKRIVELSE</span><span>KATEGORI</span><span style="text-align:right">BELØP</span></div>
      ${R.slice(0, u.f42n ?? 300).map((t) => `<button type="button" class="f42-tr" data-f42-open="${t.id}"><span class="d">${dd(t.date)}</span><span class="n52">${logo(t, 36, 10) /* prompt 52: butikklogo foran navnet */}<span class="n"><b>${esc(t.merchant || t.description)}</b><small>${esc([t.aiShort, t.account, t.folder?.name].filter(Boolean).join(' · '))}</small></span></span><span class="c"><i style="background:${esc(t.color ?? '#8a8478')}"></i>${esc(t.category ?? 'Ukategorisert')}</span><span class="a"><span>${t.amount < 0 ? '−' : '+'}${n2(Math.abs(t.amount))}</span><small class="${t.receiptId ? 'ok' : ''}">${t.receiptId ? 'Kvittering ›' : 'Ingen kvittering'}</small></span></button>`).join('')}
      ${R.length > (u.f42n ?? 300) ? '<div class="f42-empty"><button class="btn sm" data-f42-act="more-rows">Vis flere</button></div>' : ''}
      ${R.length ? '' : '<div class="f42-empty">Ingen transaksjoner passer filteret.</div>'}</div></div>
    ${pane()}</div>`;
}
// Prompt 52 (WEB52F): samme kvitteringspanel som Transaksjoner og Boliger (rcpanel52.js).
function pane() {
  const t = (S.f42 ?? []).find((x) => x.id === u.f42open);
  if (!t) return '';
  const rc = t.receiptId ? `/finans/api/receipts/${encodeURIComponent(t.receiptId)}/file` : null;
  const lines = (t.lines ?? []).map((l) => ({ text: l.description ?? l.text ?? '', amount: l.amount ?? 0 }));
  const name = t.merchant || t.description;
  return `<div class="f42-ov" data-f42-ov>${rcPanel52({
    key: `f42:${t.id}`, cls: 'drawer f42-pane52', role: 'dialog', attrs: 'aria-modal="true"', label: name, close: 'data-f42-act="close"',
    logo: logo(t, 52, 14), title: name, meta: [dd(t.date), t.account, t.folder?.name, t.category].filter(Boolean).join(' · '), amount: t.amount,
    glimt: t.aiLong || t.aiShort || lines.length ? { text: t.aiLong || t.aiShort || '', lines } : null,
    receipt: rc ? { url: rc, mime: t.receiptMime ?? 'image/' } : null,
    body: rc ? '' : `<div class="f42-none"><b style="font-size:15px">Ingen kvittering lagt ved</b><span class="note" style="font-size:13.5px">Last opp et bilde eller en PDF, så leser Glimt varelinjene.</span><label class="btn ink">Last opp kvittering<input type="file" accept="image/*,application/pdf" data-f42-attach="${t.id}" hidden></label></div>`,
    download: rc, actions: '<button type="button" class="btn" data-f42-act="close">Lukk</button>',
  })}</div>`;
}

/* ---------- Hendelser ---------- */
let sqT = null, amtT = null;
export function bindFilter(el, { askAi, report } = {}) {
  const apply = async () => { toHash(); await loadFilter(); render(); };
  el.addEventListener('click', async (e) => {
    if (u.page !== 'filter') return;
    const t = e.target, d = (q) => t.closest(q), f = F();
    let x;
    try {
      if ((x = d('[data-f42-ov]')) && t === x) { u.f42open = null; return render(); }
      if ((x = d('[data-f42-shop]'))) { const n = x.dataset.f42Shop; f.shops = f.shops.includes(n) ? f.shops.filter((y) => y !== n) : [...f.shops, n]; return apply(); }
      if ((x = d('[data-f42-cat]'))) { const n = x.dataset.f42Cat; f.cats = f.cats.includes(n) ? f.cats.filter((y) => y !== n) : [...f.cats, n]; return apply(); }
      if ((x = d('[data-f42-home]'))) { f.home = x.dataset.f42Home; return apply(); }
      if ((x = d('[data-f42-pre]'))) { const [a, b] = x.dataset.f42Pre.split(':'); f.min = a; f.max = b; return apply(); }
      if ((x = d('[data-f42-mode]'))) {
        const m = x.dataset.f42Mode || null, now = new Date(); f.mode = m;
        if (m === 'm' && !f.m1) { const c = `${f.y}-${String(now.getMonth() + 1).padStart(2, '0')}`; f.m1 = `${f.y}-${String(Math.max(1, now.getMonth() - 1)).padStart(2, '0')}`; f.m2 = c; }
        if (m === 'w' && !f.w1) { const wk = Math.ceil((((now - isoMonday(now.getFullYear(), 1)) / 864e5) + 1) / 7); f.w1 = Math.max(1, wk - 4); f.w2 = wk; }
        if (m === 'd' && f.d1 == null) { f.d1 = ''; f.d2 = ''; }
        return apply();
      }
      if ((x = d('[data-f42-clr]'))) { const k = x.dataset.f42Clr; if (k === 'shops') f.shops = []; if (k === 'cats') f.cats = []; if (k === 'home') f.home = ''; if (k === 'amt') { f.min = ''; f.max = ''; } if (k === 'per') f.mode = null; return apply(); }
      if ((x = d('[data-f42-open]'))) { u.f42open = +x.dataset.f42Open; return render(); }
      const a = d('[data-f42-act]')?.dataset.f42Act;
      if (!a) return;
      if (a === 'close') { u.f42open = null; return render(); }
      if (a === 'reset') { u.f42 = { shops: [], cats: [], home: '', min: '', max: '', mode: null, y: year() }; u.f42g = null; return apply(); }
      if (a === 'sq-clear') { u.f42sq = ''; render(); return el.querySelector('[data-f42-sq]')?.focus(); }
      if (a === 'more-s') { u.f42moreS = !u.f42moreS; return render(); }
      if (a === 'more-c') { u.f42moreC = !u.f42moreC; return render(); }
      if (a === 'more-rows') { u.f42n = (u.f42n ?? 300) + 300; return render(); }
      if (a === 'ask') { const txt = chipsOf().map((c) => c[1]).join(', '); return askAi?.(`Hvor mye brukte jeg med filteret ${txt}?`, { filter: { ...F(), range: range() } }); }
      if (a === 'report') return report?.({ filter: { ...F(), range: range() }, title: chipsOf().map((c) => c[1]).join(' · ') });
    } catch (err) { toast(err.message); }
  });
  el.addEventListener('input', (e) => {
    const t = e.target;
    if (u.page !== 'filter') return;
    if (t.matches('[data-f42-sq]')) {
      u.f42sq = t.value; clearTimeout(sqT);
      sqT = setTimeout(() => { const v = t.value, pos = t.selectionStart; render(); const i = el.querySelector('[data-f42-sq]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } u.f42sq = v; }, 120);
    }
    if (t.dataset.f42 === 'min' || t.dataset.f42 === 'max') { F()[t.dataset.f42] = t.value.replace(/[^\d]/g, ''); clearTimeout(amtT); amtT = setTimeout(() => { toHash(); loadFilter().then(() => { const k = t.dataset.f42, pos = t.selectionStart; render(); const i = el.querySelector(`[data-f42="${k}"]`); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* number */ } } }); }, 450); }
  });
  el.addEventListener('change', async (e) => {
    const t = e.target, f = F();
    if (u.page !== 'filter') return;
    if (['m1', 'm2', 'w1', 'w2', 'd1', 'd2', 'y'].includes(t.dataset.f42)) {
      const k = t.dataset.f42; f[k] = ['w1', 'w2', 'y'].includes(k) ? Math.max(1, Math.min(k === 'y' ? 2100 : 53, +t.value || 1)) : t.value;
      if (k === 'y' && f.mode === 'm') { f.m1 = `${f.y}${String(f.m1).slice(4)}`; f.m2 = `${f.y}${String(f.m2).slice(4)}`; }
      toHash(); await loadFilter(); return render();
    }
    if (t.matches('[data-f42-attach]')) {
      const id = +t.dataset.f42Attach, file = t.files[0]; t.value = ''; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try { await api(`/transactions/${id}/receipt`, { method: 'POST', body: fd }); toast('Kvitteringen er lagt ved og leses av Glimt'); await loadFilter(); render(); } catch (err) { toast(err.message); }
    }
  });
  el.addEventListener('keydown', (e) => {
    if (u.page !== 'filter' || e.key !== 'Enter' || !e.target.matches('[data-f42-sq]')) return;
    e.preventDefault();
    const first = el.querySelector('[data-f42-shops] [data-f42-shop]:not(.on)') ?? el.querySelector('[data-f42-shops] [data-f42-shop]');
    if (first) { const f = F(), n = first.dataset.f42Shop; if (!f.shops.includes(n)) f.shops = [...f.shops, n]; u.f42sq = ''; apply().then(() => el.querySelector('[data-f42-sq]')?.focus()); }
  });
  el.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-f42-form]'); if (!f) return;
    e.preventDefault();
    const q = String(new FormData(f).get('q') ?? '').trim(); if (q) glimtFill(q).catch((err) => toast(err.message));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && u.page === 'filter' && u.f42open) { u.f42open = null; render(); } });
}
/** Når man kommer til siden via en ny adresse (delt lenke), leses filteret på nytt. */
export function enterFilter() { u.f42 = fromHash(); }
