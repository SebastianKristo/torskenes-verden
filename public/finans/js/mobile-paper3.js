// Papir (prompt 15): tilpassbare sider (hold inne → vugging, ▲ ▼ og −), fanelinja (fjerde fane, flytende skann og Søk),
// Finans-fanelinja og Mer-rutenettet, Finans → Søk med ✦ AI, transaksjonsdetaljer med original kvittering,
// kvitteringsbanneret, Finn «På vei» og arket «Ny sending» i Sporing. Valgene lagres per bruker i /api/me/layout.
import { S, api, esc, n0, ini, hlApi, dd, cats, uploadReceipt } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { TR, trkLoad, carOf, normNo, detectLocal } from './mobile-track.js';
import { hlData } from './mobile-hl.js';
import { FCOL, FO, fmSort, fmBar, ppTi } from './mobile-p20.js';

/* ---------- Valg (lokal kopi + /api/me/layout) ---------- */

const LS = 'fh_p15';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };
/** Leser feltene fra /api/me/layout (pages, finTabs, fourthTab, fab). */
export function take15(r) {
  if (!r) return;
  if (r.pages && typeof r.pages === 'object') L.pages = { ...(L.pages ?? {}), ...r.pages };
  if (Array.isArray(r.finTabs) && r.finTabs.length) L.finTabs = r.finTabs;
  if (['auto', 'domener', 'sporing'].includes(r.fourthTab)) L.fourthTab = r.fourthTab;
  if (['float', 'inline'].includes(r.fab)) L.fab = r.fab;
  keep();
}
export function save15(patch) {
  Object.assign(L, patch); keep();
  hlApi('/me/layout', { method: 'PUT', json: patch }).catch(() => {});
}

/* ---------- Fanelinja ---------- */

// Finans-fanene brukeren kan velge (opptil 4); Mer er alltid siste fane.
export const FT = {
  oversikt: ['hjem', 'Oversikt', '◎'], liste: ['liste', 'Liste', '≡'], finn: ['finn', 'Finn', '⇄'], sok: ['sok', 'Søk', '⌕'], budsjett: ['budsjett', 'Budsjett', '◔'],
  kvitteringer: ['kv', 'Kvitteringer', '▢'], aksjer: ['aks', 'Aksjer', '↗'], abonnementer: ['sub', 'Abonnementer', '↻'], kontoer: ['konto', 'Kontoer', '▤'], boliger: ['dir', 'Boliger', '⌂'],
};
export const FT_DEF = ['oversikt', 'liste', 'finn', 'sok'];
export const finKeys = () => { const v = (L.finTabs ?? FT_DEF).filter((k) => FT[k]); return [...new Set(v.length ? v : FT_DEF)].slice(0, 4); };
export const finScreens = () => finKeys().map((k) => FT[k][0]);
export const fabStyle = () => (L.fab === 'inline' ? 'inline' : 'float');
export const fourthPref = () => L.fourthTab ?? 'auto';
// Pakker på vei: hentet, i transport, ute for levering eller klar for henting.
const WAY = ['picked_up', 'in_transit', 'out_for_delivery', 'ready_for_pickup'];
export function onWay() {
  const items = TR.data?.items;
  if (items) return items.filter((p) => !p.archived && WAY.includes(p.status)).length;
  const pk = hlData()?.packages;
  const list = Array.isArray(pk) ? pk : pk?.items ?? [];
  return list.filter((p) => WAY.includes(p.status)).length;
}
/** Fjerde fane: «Automatisk» er Domener, men Sporing når minst én pakke er på vei. */
export const fourth = () => { const f = fourthPref(); return f === 'sporing' ? 'spor' : f === 'domener' ? 'dom' : onWay() > 0 ? 'spor' : 'dom'; };

/* ---------- Tilpass hver side: hold inne → vugging, ▲ ▼ og − ---------- */

const PG = {
  hl: [['h1', 'Søk'], ['h2', 'Pakker'], ['h3', 'Avganger'], ['h4', 'Snarveier'], ['h5', 'Siste nytt'], ['h6', 'Posisjon'], ['h7', 'Bolig'], ['h8', 'Huskeliste']],
  hjem: [['f1', 'Saldo'], ['f2', 'Kvitteringer'], ['f3', 'Siste transaksjoner'], ['f4', 'Budsjett']],
  mat: [['m1', 'Dagens middag'], ['m2', 'Ukeplan'], ['m3', 'Mapper'], ['m4', 'Skann og import']],
  spor: [['t1', 'Faner'], ['t2', 'Pakkelisten'], ['t3', 'Legg til']],
};
const ED = { page: null, vis: {} };
export const editing = (page) => ED.page === page;
export const edReset = () => { ED.page = null; };
function pageCfg(page) {
  const keys = PG[page].map(([k]) => k), cur = L.pages?.[page] ?? {};
  const saved = (cur.order ?? []).filter((k) => keys.includes(k));
  return { order: [...saved, ...keys.filter((k) => !saved.includes(k))], hidden: (cur.hidden ?? []).filter((k) => keys.includes(k)) };
}
function savePage(page, order, hidden) {
  L.pages = { ...(L.pages ?? {}), [page]: { order, hidden } }; keep();
  hlApi('/me/layout', { method: 'PUT', json: { pages: { [page]: { order, hidden } } } }).catch(() => {});
}
/** Setter sammen kortene på en side i lagret rekkefølge, uten skjulte kort. full = kort som går over hele bredden på Fold. */
export function edBlocks(page, blocks, { full = [] } = {}) {
  const { order, hidden } = pageCfg(page), on = ED.page === page, lab = Object.fromEntries(PG[page]);
  const vis = order.filter((k) => !hidden.includes(k) && blocks[k]);
  ED.vis[page] = vis;
  const bar = on ? `<div class="pp-edbar" role="toolbar" aria-label="Tilpass siden"><div class="pp-row" style="align-items:center"><span>Flytt med ▲ ▼, skjul med −</span><button class="pp-btn sm" data-ped="done">Ferdig</button></div>
      ${hidden.length ? `<div class="pp-edhid"><span>Skjult:</span>${hidden.map((k) => `<button data-ped="show" data-k="${k}">+ ${esc(lab[k])}</button>`).join('')}</div>` : ''}</div>` : '';
  const html = vis.map((k, i) => `<div class="pp-ed${on ? ' on' : ''}${full.includes(k) ? ' full' : ''}" data-edk="${k}" data-edp="${page}">${on ? `<div class="pp-edc">
      <button data-ped="mv" data-k="${k}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Flytt ${esc(lab[k])} opp">▲</button><button data-ped="mv" data-k="${k}" data-d="1" ${i === vis.length - 1 ? 'disabled' : ''} aria-label="Flytt ${esc(lab[k])} ned">▼</button><button class="hide" data-ped="hide" data-k="${k}" aria-label="Skjul ${esc(lab[k])}">−</button></div>` : ''}${blocks[k]}</div>`).join('');
  return bar + html + (on ? '' : '<span class="pp-edhint">Hold inne et kort for å flytte eller skjule det</span>');
}
let lp = null, lpFired = false;
export function edDown(e) {
  lpFired = false;
  if ((e.button ?? 0) > 0 || ED.page) return;
  const b = e.target.closest?.('[data-edk]');
  // En pakke i Sporing har sitt eget lange trykk (velg flere); hold inne et annet kort for å flytte det.
  if (!b || e.target.closest('input,textarea,select,label,[data-ped],[data-ppplus],[data-pk],.p17-chk')) return;
  const page = b.dataset.edp;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; lpFired = true; ED.page = page; haptic('ok'); navigator.vibrate?.(15); draw(); }, 500) };
}
export function edMove(e) { if (lp && (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10)) { clearTimeout(lp.t); lp = null; } }
export function edUp() { if (lp) clearTimeout(lp.t); lp = null; }
/** Klikk: «Ferdig», ▲ ▼ − og «+ skjult kort». Mens siden redigeres, åpner ikke kortene noe. */
export function edClick(e, t) {
  if (lpFired) { lpFired = false; e.preventDefault(); return true; }
  const x = t.closest?.('[data-ped]');
  if (x) {
    e.preventDefault();
    const page = ED.page, k = x.dataset.k;
    if (!page) return true;
    const { order, hidden } = pageCfg(page);
    if (x.dataset.ped === 'done') { ED.page = null; haptic('ok'); }
    else if (x.dataset.ped === 'hide') { savePage(page, order, [...new Set([...hidden, k])]); haptic('tap'); }
    else if (x.dataset.ped === 'show') { savePage(page, order, hidden.filter((y) => y !== k)); haptic('tap'); }
    else if (x.dataset.ped === 'mv') {
      const vis = ED.vis[page] ?? order, v = vis.indexOf(k), w = vis[v + +x.dataset.d];
      if (v < 0 || !w) return true;
      const o = [...order], a = o.indexOf(k), b = o.indexOf(w);
      [o[a], o[b]] = [o[b], o[a]]; savePage(page, o, hidden); haptic('tab'); navigator.vibrate?.(8);
    }
    draw(); return true;
  }
  if (ED.page && t.closest?.('[data-edk]')) { e.preventDefault(); return true; }
  return false;
}

/* ---------- Kvitteringer til gjennomgang (banneret) ---------- */

export const RC = { n: null, t: 0 };
export async function rcCount(force = false) {
  if (!force && Date.now() - RC.t < 20000) return;
  RC.t = Date.now();
  try { const r = await api('/receipts?status=needs_review&count=1'); RC.n = Number.isFinite(+r?.count) ? +r.count : Array.isArray(r) ? r.filter((x) => x.status === 'needs_review').length : null; }
  catch { RC.n = null; }
}
export const rcNum = () => RC.n ?? S.boot?.reviewCount ?? (S.summary?.review ?? []).filter((r) => r.status === 'needs_review').length;
export function rcBanner() {
  const n = rcNum();
  if (!n) return '';
  return `<div class="pp-cta"><a href="#/kv" class="m-grow">${n} kvittering${n === 1 ? '' : 'er'} til gjennomgang</a><button data-pp="scan">Skann ›</button></div>`;
}

/* ---------- Finans: siste 15 transaksjoner ---------- */

export const FX = { recent: null, t: 0 };
export async function recentLoad(force = false) {
  if (!force && FX.recent && Date.now() - FX.t < 30000) return;
  try { const r = await api('/transactions?limit=15'); FX.recent = (r?.items ?? r ?? []).slice(0, 15); FX.t = Date.now(); } catch { FX.recent ??= null; }
}

/* ---------- Finans → Mer: rutenett med live-tall ---------- */

const IC = {
  sok: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', liste: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', finn: 'M7 7h10l-3-3M17 17H7l3 3',
  budsjett: 'M12 3v9l6.4 6.4A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z', kv: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M9 8h4l2 2v6H9z',
  fast: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', konto: 'M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  aks: 'M3 20h18M5 16l5-5 3 3 6-7M15 7h4v4', rap: 'M5 20V10M10 20V4M15 20v-7M20 20v-11', sub: 'M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1M18 3v4h-4M6 21v-4h4',
  dir: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6', imp: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};
export const FM = { d: null };
export async function fmerLoad() {
  const ok = (p) => p.catch(() => null);
  const [rec, sub, dirs, stocks] = await Promise.all([ok(api('/recurring')), ok(api('/subscriptions')), ok(api('/folders')), ok(api('/stocks'))]);
  FM.d = { rec, sub, dirs, stocks };
  await rcCount();
}
const monthly = (r) => (r.interval === 'yearly' ? r.amount / 12 : r.interval === 'weekly' ? (r.amount * 52) / 12 : r.amount);
export function finMerGrid() {
  const s = S.summary, D = FM.d ?? {}, inTabs = finScreens(), rv = rcNum();
  const rec = (Array.isArray(D.rec) ? D.rec : D.rec?.items ?? []).filter((r) => r.active !== false);
  const recNext = rec.reduce((a, r) => a + monthly(Math.abs(r.amount ?? 0) ? r : { ...r, amount: 0 }), 0);
  const bal = (S.boot?.accounts ?? []).reduce((a, x) => a + (x.balance ?? 0), 0);
  const st = D.stocks?.summary, chg = st?.changePct ?? st?.dayPct ?? null;
  const dirs = Array.isArray(D.dirs) ? D.dirs : D.dirs?.items ?? null;
  const T = [
    ['sok', 'Søk', '✦ Med AI'], ['liste', 'Liste', 'Alle transaksjoner'], ['finn', 'Finn', 'Kjøp og salg'],
    ['budsjett', 'Budsjett', s?.budgetTotal ? `${n0(s.left ?? 0)} kr ${(s.left ?? 0) < 0 ? 'over' : 'igjen'}` : 'Ikke satt opp'],
    ['kv', 'Kvitteringer', rv ? `${rv} til gjennomgang` : 'Ingen til gjennomgang', rv],
    ['fast', 'Faste utgifter', D.rec ? `${n0(recNext)} kr/mnd` : 'Neste 30 dager'],
    ['konto', 'Kontoer', `${bal < 0 ? '−' : ''}${n0(bal)} kr`],
    ['aks', 'Aksjer', st ? `${n0(st.value ?? st.total ?? 0)} kr${chg != null ? ` · ${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} %` : ''}` : D.stocks?.configured === false ? 'Ikke koblet til' : 'Trading 212'],
    ['rap', 'Rapporter', 'Måned og år'],
    ['sub', 'Subscription OS', D.sub ? `${n0(D.sub.monthly ?? 0)} kr/mnd` : 'Abonnementer'],
    ['dir', 'Boliger', dirs ? `${dirs.length} ${dirs.length === 1 ? 'bolig' : 'boliger'}` : 'Utgifter og prosjekter'],
    ['imp', 'Import', 'Bank, Excel og Finn'], ['set', 'Innstillinger', 'Kategorier og regler'],
  ].filter(([k]) => !inTabs.includes(k));
  // Prompt 20: egen ikonfarge per flis, og rekkefølgen brukeren har valgt (hold inne for å flytte). Linja med
  // Ferdig/Tilbakestill ligger under flisene, så de ikke flytter seg under fingeren når redigeringen starter.
  return `<div class="pp-fmgrid${FO.edit ? ' edit' : ''}">${fmSort(T).map(([k, n, v, badge]) => `<a class="pp-fmt" href="#/${k === 'set' ? 'set' : k}" data-fmk="${k}" style="--fc:${FCOL[k] ?? 'var(--pp-lab)'}"><span class="pp-fmi"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k]}"/></svg></span>
    ${badge ? `<span class="pp-fmb">${badge}</span>` : ''}<span class="pp-fmn"><b class="pp-serif">${esc(n)}</b><span class="${/▲/.test(v) ? 'pp-pos' : ''}">${esc(v)}</span></span></a>`).join('')}</div>${FO.edit ? fmBar() : '<span class="pp-edhint">Hold inne en flis for å endre rekkefølgen</span>'}`;
}

/* ---------- Finans → Søk med ✦ AI ---------- */

export const FS = { q: '', ai: false, busy: false, r: null, err: '' };
const simple = (q) => q && !/\s/.test(q) && q.length < 20;
// force: trykk på ✦ AI eller Enter med AI på kjører AI-søket med en gang, også for enkle ord.
async function fsRun(force = false) {
  const q = FS.q.trim();
  if (!q) { FS.r = null; draw(); return; }
  FS.busy = true; FS.err = ''; draw();
  try {
    let r;
    if (FS.ai && (force || !simple(q))) {
      try {
        const sig = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
        r = await api('/search/ai', { method: 'POST', json: { q, force: true }, signal: sig });
        r = { ...r, ai: !r?.plainFirst && r?.mode !== 'plain', aiDown: r?.aiErrorKind ? r.aiErrorText || r.aiError || 'ukjent feil' : r?.aiError || '' };
      } catch (e) { r = { ...(await plainSearch(q)), aiDown: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'brukte mer enn 20 sekunder' : e.message }; }
    } else r = await plainSearch(q);
    FS.r = { ...r, q };
  } catch (e) { FS.err = e.message; FS.r = null; }
  FS.busy = false; draw();
}
async function plainSearch(q) {
  try { return { ...(await api('/search?q=' + encodeURIComponent(q))), mode: 'plain' }; }
  catch (e) {
    if (!/404|Not Found/i.test(e.message)) throw e;
    const t = await api('/transactions?q=' + encodeURIComponent(q));
    return { mode: 'plain', hits: (t?.items ?? []).slice(0, 40).map((x) => ({ type: 'tx', txId: x.id, description: x.merchant || x.description, date: x.date, amount: x.amount, category: x.category, reason: 'navn' })) };
  }
}
const hitsOf = (r) => (r?.hits ?? r?.items ?? []).filter((h) => h && (h.txId ?? h.id ?? h.description));
export function paperSearch() {
  const r = FS.r, hits = hitsOf(r), q = FS.q.trim(), sum = hits.reduce((a, h) => a + (Number(h.amount) || 0), 0);
  const big = [...hits].sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))[0];
  const aiTxt = r?.aiDown && FS.ai ? `AI svarte ikke: ${r.aiDown}` : r?.ai && (r.answer || r.summary) ? r.answer || r.summary
    : FS.ai && r && hits.length ? `Du har ${hits.length} treff på «${r.q}», til sammen ${n0(sum)} kr ${sum < 0 ? 'brukt' : 'inn'}. Største post er ${big?.description ?? big?.merchant ?? ''}.`
      : FS.ai && r && !hits.length ? `Jeg fant ingen kjøp som passer «${r.q}» i transaksjonene, kvitteringene eller varelinjene.` : '';
  const src = r?.aiDown ? 'Viser treffene fra vanlig søk. Sjekk nøkkel og motor under Innstillinger → AI og tolkning.' : r?.ai ? `✦ ${r.engine || r.provider || 'AI'} leste transaksjoner, kvitteringer og varelinjer.` : 'Fant vanlige treff først, AI oppsummerte.';
  const sugg = ['rema', 'spotify', 'kyllingfilet', 'hvor mye brukte jeg på mat?', 'strøm i oktober'];
  return `<form class="pp-search pp-fsq" data-ppfs role="search"><span aria-hidden="true">⌕</span><input class="m-input" id="pp-fsq" name="q" type="search" value="${esc(FS.q)}" enterkeyhint="search" placeholder="${FS.ai ? 'Spør, f.eks. «hva brukte jeg på kaffe?»' : 'Søk i transaksjoner og kvitteringer'}" aria-label="Søk i Finans" autocomplete="off">
      <button type="button" class="pp-aitog${FS.ai ? ' on' : ''}" data-ppfsk="ai" aria-pressed="${FS.ai}">✦ AI</button></form>
    ${!q && !r ? `<div class="pp-col" style="gap:8px"><span class="pp-lab" style="padding:4px 2px 0">PRØV</span><div class="pp-chips pp-wrap">${sugg.map((n) => `<button class="pp-fchip" data-ppfsk="sugg" data-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <span class="pp-mut" style="line-height:1.45;padding:2px">Enkle ord som «rema» eller «spotify» søkes vanlig først. Med ✦ AI kan du spørre fritt, og AI leser også varelinjene i kvitteringene.</span></div>` : ''}
    ${FS.busy ? '<div class="m-spin"></div>' : ''}${FS.err ? `<div class="pp-card pp-mut">${esc(FS.err)}</div>` : ''}
    ${!FS.busy && aiTxt ? `<div class="pp-card pp-aians"><span class="pp-lab">✦ AI-SVAR</span><span class="pp-serif">${esc(aiTxt)}</span><span class="pp-mut">${esc(src)}</span></div>` : ''}
    ${!FS.busy && hits.length ? `<div class="pp-sec"><span>TREFF · ${hits.length}</span><span>Netto ${sum < 0 ? '−' : '+'}${n0(sum)} kr</span></div>
      <div class="pp-rows">${hits.slice(0, 60).map((h) => { const id = h.txId ?? (h.type === 'tx' ? h.id : null), name = h.description ?? h.merchant ?? h.title ?? 'Treff';
        return `<button class="pp-tx" ${id != null ? `data-tx="${esc(id)}"` : ''}>${ppTi({ ...h, merchant: name }, ini(name), h.color)}<span class="m-grow" style="min-width:0"><b class="m-ell">${esc(name)}</b><span class="pp-mut m-ell">${esc([h.date ? dd(h.date) : '', h.reason || h.why || h.category || ''].filter(Boolean).join(' · '))}</span></span><span class="pp-serif ${h.amount > 0 ? 'pp-pos' : ''}">${h.amount != null ? `${h.amount < 0 ? '−' : '+'}${n0(h.amount)}` : ''}</span></button>`; }).join('')}</div>` : ''}
    ${!FS.busy && r && !hits.length && !FS.ai ? '<div class="pp-mut" style="padding:16px 4px;font-size:14px">Ingen treff. Slå på ✦ AI for å søke i innholdet i kvitteringene.</div>' : ''}`;
}

/* ---------- Transaksjonsdetaljer med original kvittering ---------- */

export const TX = { d: {}, err: {}, full: null, cat: false, bank: false, rule: true, busy: false };
export async function txLoad(id, force = false) {
  if (id == null || (!force && TX.d[id])) return;
  try { TX.d[id] = await api(`/transactions/${id}`); delete TX.err[id]; }
  catch (e) {
    // Eldre server: bruk raden vi har og /original for kvittering og bankrad.
    const base = [...(S.tx?.items ?? []), ...(FX.recent ?? []), ...(S.summary?.recent ?? [])].find((t) => t.id === id) ?? null;
    const o = await api(`/transactions/${id}/original`).catch(() => null);
    if (base || o) TX.d[id] = { ...(base ?? {}), receipt: o?.receiptUrl ? { status: 'attached', fileUrl: o.receiptUrl, lines: [], total: base ? Math.abs(base.amount) : null } : null, bank: o?.bankRow ?? null };
    else TX.err[id] = e.message;
  }
}
const kr2 = (v) => (Number(v) || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function paperTx(id) {
  const t = TX.d[id];
  if (!t) return TX.err[id] ? `<div class="pp-card pp-mut">${esc(TX.err[id])}</div>` : '<div class="m-spin"></div>';
  const name = t.merchant || t.description || 'Transaksjon', r = t.receipt, amt = Number(t.amount) || 0;
  const st = !r ? 'Mangler' : r.status === 'needs_review' ? 'Til gjennomgang' : 'Vedlagt';
  const dtxt = t.date ? new Date(t.date + 'T12:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '';
  const lines = (r?.lines ?? []).filter((l) => l && l.name);
  const pdf = /pdf/i.test(r?.mime ?? '') || /\.pdf($|\?)/i.test(r?.fileUrl ?? '');
  const slip = r ? `<button class="pp-slip" data-pptx="full" ${r.fileUrl ? '' : 'disabled'} aria-label="Åpne original kvittering"><span class="pp-slipn">${esc(name.toUpperCase())}</span><span class="pp-slipd">${esc(t.date ? `${dd(t.date)}.${t.date.slice(0, 4)}` : '')} · KVITTERING</span><i></i>
      ${lines.length ? lines.map((l) => `<span class="pp-slipl"><span>${esc(l.name)}</span><span>${l.price != null ? kr2(Math.abs(l.price)) : ''}</span></span>`).join('') : `<span class="pp-slipl"><span>${r.fileUrl ? 'Trykk for å se originalen' : 'Varelinjene er ikke lest ennå'}</span><span></span></span>`}<i></i>
      <span class="pp-slipl tot"><span>TOTAL</span><span>${kr2(r.total ?? Math.abs(amt))}</span></span>${r.fileUrl ? `<span class="pp-slipo">${pdf ? 'Åpne PDF ↗' : 'Trykk for originalbildet'}</span>` : ''}</button>`
    : `<div class="pp-card pp-col" style="gap:8px"><span class="pp-mut">Ingen kvittering er lagt ved denne transaksjonen.</span><div class="pp-two"><label class="pp-btn ink">Kamera<input class="m-file" type="file" accept="image/*" capture="environment" data-pptxfile></label><label class="pp-btn">Filer<input class="m-file" type="file" accept="application/pdf,image/*,.heic,.heif" data-pptxfile></label></div></div>`;
  const catList = cats(amt > 0 ? 'income' : 'expense');
  const cat = TX.cat ? `<div class="sheet-bg" data-pptx="catx"></div><div class="pp-sheet tall" role="dialog" aria-label="Endre kategori"><span class="pp-grab"></span>
      <div class="pp-row"><div class="pp-sh">Endre kategori</div><button class="pp-x" data-pptx="catx" aria-label="Lukk">×</button></div>
      <div class="pp-chips pp-wrap">${catList.map((c) => `<button class="pp-fchip" data-pptx="setcat" data-id="${c.id}" aria-pressed="${c.id === t.categoryId || c.name === t.category}"><i class="pp-cdot" style="background:${esc(c.color ?? '#8a8478')}"></i>${esc(c.name)}</button>`).join('')}</div>
      <button class="pp-tog" data-pptx="rule" role="switch" aria-checked="${TX.rule}"><span class="m-grow"><b>Lag regel for fremtidige</b><span class="pp-mut">Neste gang «${esc(name)}» kommer, får den samme kategori</span></span><span class="pp-sw${TX.rule ? ' on' : ''}"><i></i></span></button></div>` : '';
  const b = t.bank, bank = TX.bank ? `<div class="sheet-bg" data-pptx="bankx"></div><div class="pp-sheet tall" role="dialog" aria-label="Bankutskrift"><span class="pp-grab"></span>
      <div class="pp-row"><div class="pp-sh">Bankutskrift</div><button class="pp-x" data-pptx="bankx" aria-label="Lukk">×</button></div>
      ${b ? `<div class="pp-card pp-tight">${[['Tekst', b.description], ['KID / melding', b.message], ['Beløp', b.amount != null ? `${kr2(b.amount)} kr` : null], ['Bokført', b.bookingDate ? dd(b.bookingDate) + '.' + String(b.bookingDate).slice(0, 4) : null], ['Rentedato', b.valueDate ? dd(b.valueDate) + '.' + String(b.valueDate).slice(0, 4) : null], ['Konto', b.account], ['Arkivreferanse', b.archiveReference]].filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div class="pp-kv"><span class="pp-mut">${k}</span><span class="pp-mono" style="color:var(--pp-ink);font-size:13px">${esc(v)}</span></div>`).join('')}</div>`
        : '<div class="pp-mut">Ingen bankrad er lagret. Transaksjonen er lagt inn manuelt eller fra en kvittering.</div>'}</div>` : '';
  const full = TX.full ? `<div class="pp-full" role="dialog" aria-label="Original kvittering"><button class="pp-pill pp-fullx" data-pptx="fullx">Lukk</button><div class="pp-fullsc">${pdf ? `<iframe src="${esc(TX.full)}" title="Kvittering"></iframe>` : `<img src="${esc(TX.full)}" alt="Original kvittering">`}</div></div>` : '';
  return `<div class="pp-card pp-txd"><div class="pp-row" style="align-items:center;justify-content:flex-start;gap:12px"><span class="pp-ti big" style="background:${esc(t.color ?? '#6b665c')}">${esc(ini(name))}</span><div style="min-width:0"><b class="pp-serif m-ell" style="display:block;font-size:22px">${esc(name)}</b><span class="pp-mut">${esc([t.category, dtxt, t.account].filter(Boolean).join(' · '))}</span></div></div>
      <span class="pp-serif pp-txamt ${amt > 0 ? 'pp-pos' : ''}">${amt < 0 ? '−' : '+'}${kr2(Math.abs(amt))} kr</span>${t.aiSummary || r?.aiSummary ? `<span class="pp-lab-c" style="font-size:13px">✦ ${esc(t.aiSummary || r.aiSummary)}</span>` : ''}</div>
    <div class="pp-sec"><span>ORIGINAL KVITTERING</span><span class="${st === 'Vedlagt' ? '' : 'pp-lab-c'}">${st}</span></div>
    ${slip}
    <div class="pp-two"><button class="pp-btn" data-pptx="cat">Endre kategori</button><button class="pp-btn" data-pptx="bank">Bankutskrift</button></div>
    ${cat}${bank}${full}`;
}
export async function txBind15(e, t) {
  if (!m.detail || m.sel == null) return false;
  const id = m.sel, T = TX.d[id];
  if (e.type === 'change' && t.matches?.('[data-pptxfile]')) {
    const f = t.files?.[0]; t.value = ''; if (!f) return true;
    TX.busy = true; flash('Laster opp kvitteringen …');
    try { const r = await uploadReceipt(f, T?.accountId ?? null); if (r?.id) await api(`/transactions/${id}`, { method: 'PATCH', json: { receiptId: r.id } }).catch(() => {}); await txLoad(id, true); flash('Kvitteringen er lagt ved · ✦ AI leser varelinjene'); }
    catch (err) { flash(err.message); }
    TX.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-pptx]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.pptx;
  if (k === 'full') { const u = T?.receipt?.fileUrl; if (!u) return true; if (/pdf/i.test(T.receipt.mime ?? '')) { open(u, '_blank', 'noopener'); return true; } TX.full = u; }
  else if (k === 'fullx') TX.full = null;
  else if (k === 'cat') TX.cat = true;
  else if (k === 'catx') TX.cat = false;
  else if (k === 'bank') TX.bank = true;
  else if (k === 'bankx') TX.bank = false;
  else if (k === 'rule') TX.rule = !TX.rule;
  else if (k === 'setcat') {
    const cid = +x.dataset.id, c = cats().find((y) => y.id === cid);
    try {
      await api(`/transactions/${id}`, { method: 'PATCH', json: { categoryId: cid } });
      if (TX.rule && T) { const pat = String(T.merchant || T.description || '').toUpperCase().slice(0, 40); if (pat) await api('/rules', { method: 'POST', json: { pattern: pat, categoryId: cid } }).catch(() => {}); }
      await txLoad(id, true); TX.cat = false; FX.t = 0; flash(`Kategorien er endret til ${c?.name ?? 'ny kategori'}${TX.rule ? ' · regel lagret' : ''}`);
    } catch (err) { flash(err.message); }
  }
  draw(); return true;
}

/* ---------- Finn: «På vei» ---------- */

const TINT = ['#3A2F4A', '#1E2A3F', '#3B2E22', '#22362C', '#2C2C33', '#2A3540'];
export function finnWay(items) {
  const way = (items ?? []).filter((x) => !x.done && (x.stage ?? 1) >= 2);
  if (!way.length) return '';
  return `<div class="pp-sec"><span>PÅ VEI · ${way.length}</span><button class="pp-link" data-ppfn="seg" data-k="På vei">Vis alle ›</button></div>
    <div class="pp-way">${way.map((x) => { const st = Math.max(0, Math.min(3, (x.stage ?? 1) - 1)), sold = x.role === 'sold';
      return `<button class="pp-wayc" data-ppfn="edit" data-id="${x.id}"><span class="pp-wayi" style="background-color:${TINT[x.id % TINT.length]};${x.image ? `background-image:url('${esc(x.image)}')` : ''}">${x.image ? '' : esc(String(x.item).split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase())}</span>
        <span class="pp-wayb"><b class="m-ell">${esc(x.item)}</b><span class="pp-fbars static">${[0, 1, 2, 3].map((j) => `<i style="background:${j < st ? 'var(--pp-ink)' : j === st ? 'var(--pp-lab)' : 'var(--pp-line)'}"></i>`).join('')}</span>
        <span class="m-ell ${x.needsAction ? 'pp-lab-c' : 'pp-mut'}" style="font-size:11.5px">${sold ? 'Solgt' : 'Kjøpt'} · ${esc(x.next || (sold ? 'Venter på levering' : 'Pakken er på vei'))}</span></span></button>`; }).join('')}</div>`;
}

/* ---------- Sporing: «Ny sending» (den flytende knappen er + på Sporing) ---------- */

export const NS = { open: false, nv: '', busy: false };
export function newShipSheet() {
  if (!NS.open || m.screen !== 'spor') return '';
  const no = normNo(NS.nv), car = no.length >= 6 ? carOf(detectLocal(no)).name : '';
  return `<div class="sheet-bg" data-ppns="x"></div><div class="pp-sheet" role="dialog" aria-label="Ny sending"><span class="pp-grab"></span>
    <div class="pp-row"><b class="pp-sh" style="font-size:24px">Ny sending</b><span class="pp-mut">✦ Transportør gjenkjennes</span></div>
    <form class="pp-col" data-ppnsform style="gap:8px"><input class="pp-in pp-nsno" id="pp-ns-no" value="${esc(NS.nv)}" placeholder="Sporingsnummer" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Sporingsnummer" enterkeyhint="go">
      ${car ? `<span class="pp-pos" style="font-size:13px;font-weight:600;padding:0 4px">✓ ${esc(car)} gjenkjent</span>` : ''}<button class="pp-btn ink" type="submit" ${NS.busy ? 'disabled' : ''}>${NS.busy ? 'Legger til …' : 'Spor sending'}</button></form>
    <div class="pp-two"><label class="pp-btn">Skann strekkode<input class="m-file" type="file" accept="image/*" capture="environment" data-ppnsscan></label><button class="pp-btn" data-ppns="paste">Lim inn</button></div>
    <span class="pp-mut" style="line-height:1.45">Sendinger fra e-post og Finn legges til automatisk.</span></div>`;
}
export function openNewShip() { NS.open = true; draw(); setTimeout(() => document.getElementById('pp-ns-no')?.focus(), 30); }
// Strekkoder: serveren først (Roboflow, POST /scan/barcode → {codes, engine}). Ved 501 (ikke satt opp) eller en eldre
// server leser nettleseren selv med BarcodeDetector der den finnes.
async function readBarcode(file) {
  try {
    const fd = new FormData(); fd.append('file', file, file.name || 'strekkode.jpg');
    const r = await fetch('/finans/api/scan/barcode', { method: 'POST', body: fd });
    if (r.ok) { const j = await r.json().catch(() => null); const v = (j?.codes ?? []).map((c) => c.value ?? c.rawValue ?? c).find((s) => normNo(String(s)).length >= 6); if (v) return String(v); }
    else if (r.status !== 501 && r.status !== 404) { const j = await r.json().catch(() => null); if (!('BarcodeDetector' in window)) throw new Error(j?.error ?? `Feil ${r.status}`); }
  } catch (e) { if (!('BarcodeDetector' in window)) throw e; }
  if (!('BarcodeDetector' in window)) throw new Error('Telefonen kan ikke lese strekkoder her. Skriv inn eller lim inn nummeret.');
  const bmp = await createImageBitmap(file);
  const det = new window.BarcodeDetector();
  const codes = await det.detect(bmp);
  const v = codes.map((c) => c.rawValue).find((s) => normNo(s).length >= 6);
  if (!v) throw new Error('Fant ingen strekkode i bildet');
  return v;
}
export async function nsBind(e, t) {
  if (m.screen !== 'spor' || !NS.open) return false;
  if (e.type === 'input' && t.id === 'pp-ns-no') { const had = normNo(NS.nv).length >= 6; NS.nv = t.value; if (had !== (normNo(t.value).length >= 6)) draw(); return true; }
  if (e.type === 'change' && t.matches?.('[data-ppnsscan]')) {
    const f = t.files?.[0]; t.value = ''; if (!f) return true;
    try { NS.nv = await readBarcode(f); haptic('ok'); } catch (err) { flash(err.message); }
    draw(); return true;
  }
  if (e.type === 'submit' && t.matches?.('[data-ppnsform]')) {
    e.preventDefault();
    const no = normNo(NS.nv);
    if (no.length < 6) { haptic('err'); flash('Skriv inn et sporingsnummer'); return true; }
    if ((TR.data?.items ?? []).some((p) => normNo(p.trackingNo) === no)) { haptic('err'); flash('Sendingen spores allerede'); return true; }
    NS.busy = true; draw();
    try { const r = await hlApi('/tracking', { method: 'POST', json: { trackingNo: no, carrier: detectLocal(no) } }); NS.nv = ''; NS.open = false; await trkLoad(); haptic('ok'); flash(`Lagt til · ${carOf((r?.item ?? r)?.carrier ?? detectLocal(no)).name}`); }
    catch (err) { haptic('err'); flash(err.message); }
    NS.busy = false; draw(); return true;
  }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppns]');
  if (!x) return false;
  e.preventDefault();
  if (x.dataset.ppns === 'x') NS.open = false;
  else if (x.dataset.ppns === 'paste') { try { NS.nv = (await navigator.clipboard.readText()).trim(); } catch { flash('Fikk ikke lese utklippstavlen'); } }
  draw(); return true;
}

/* ---------- Innstillinger: Fanelinje og Finans-fanelinje ---------- */

export function navSettings() {
  const f4 = fourthPref(), cur = fourth(), n = onWay(), fk = finKeys();
  const row = (attr, t, s, v, cls = '') => `<button class="pp-srow" ${attr}><span class="m-grow"><b>${esc(t)}</b><span class="pp-mut">${esc(s)}</span></span><span class="pp-sv ${cls}">${esc(v)}</span></button>`;
  const fin = Object.entries(FT).map(([k, [, nm]]) => { const i = fk.indexOf(k), on = i >= 0;
    return row(`data-ppset="fin" data-k="${k}"`, nm, on ? `I fanelinjen, plass ${i + 1}${i > 0 ? ' · trykk for å flytte til venstre' : ''}` : 'Ligger i Mer', on ? (i > 0 ? `◂ Fane ${i + 1}` : 'Fane 1') : '+ Legg til', on ? 'pos' : 'lab'); }).join('');
  const last = fk[fk.length - 1];
  return `<span class="pp-lab">FANELINJE</span><div class="pp-card pp-tight">
      ${row('data-ppset="fab"', 'Skanneknapp', fabStyle() === 'float' ? 'Flyter over linjen, søk ligger i linjen' : 'Ligger i linjen som +', fabStyle() === 'float' ? 'Flytende ›' : 'I linjen ›')}
      ${row('data-ppset="t4"', 'Fjerde fane', f4 === 'auto' ? `Domener, eller Sporing når pakker er på vei (nå: ${cur === 'spor' ? `Sporing, ${n} på vei` : 'Domener'})` : `Alltid ${f4 === 'sporing' ? 'Sporing' : 'Domener'}`, `${f4 === 'auto' ? 'Automatisk' : f4 === 'sporing' ? 'Sporing' : 'Domener'} ›`)}</div>
    <span class="pp-lab">FINANS · FANELINJE OG MER</span><div class="pp-card pp-tight">${fin}
      ${row('data-ppset="finrm"', 'Fjern fra fanelinjen', 'Trykk for å flytte siste fane til Mer', fk.length > 1 ? `Fjern ${FT[last][1]}` : '–', 'lab')}
      ${row('data-ppset="finreset"', 'Tilbakestill', 'Oversikt, Liste, Finn, Søk', 'Nullstill')}</div>`;
}
export function navSetBind(e, t) {
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppset]');
  if (!x) return false;
  e.preventDefault();
  const k = x.dataset.ppset, fk = finKeys();
  if (k === 'fab') save15({ fab: fabStyle() === 'float' ? 'inline' : 'float' });
  else if (k === 't4') { const Lp = ['auto', 'domener', 'sporing']; save15({ fourthTab: Lp[(Lp.indexOf(fourthPref()) + 1) % 3] }); }
  else if (k === 'fin') {
    const id = x.dataset.k, i = fk.indexOf(id);
    if (i < 0) { if (fk.length >= 4) { flash('Maks 4 faner. Fjern en først.'); return true; } save15({ finTabs: [...fk, id] }); }
    else if (i > 0) { const v = [...fk]; [v[i - 1], v[i]] = [v[i], v[i - 1]]; save15({ finTabs: v }); }
  } else if (k === 'finrm') { if (fk.length > 1) save15({ finTabs: fk.slice(0, -1) }); }
  else if (k === 'finreset') save15({ finTabs: [...FT_DEF] });
  haptic('tab'); draw(); return true;
}

/* ---------- Søk i Finans: hendelser ---------- */

export async function fsBind(e, t) {
  if (m.screen !== 'sok') return false;
  if (e.type === 'input' && t.id === 'pp-fsq') { FS.q = t.value; if (!t.value) { FS.r = null; draw(); } return true; }
  if (e.type === 'submit' && t.matches?.('[data-ppfs]')) { e.preventDefault(); FS.q = t.q.value; t.q.blur(); await fsRun(FS.ai); return true; }
  if (e.type !== 'click') return false;
  const x = t.closest?.('[data-ppfsk]');
  if (!x) return false;
  e.preventDefault();
  if (x.dataset.ppfsk === 'ai') { FS.ai = !FS.ai; haptic('tab'); const v = document.getElementById('pp-fsq')?.value; if (v != null) FS.q = v; if (FS.q.trim()) await fsRun(FS.ai); else draw(); }
  else if (x.dataset.ppfsk === 'sugg') { FS.q = x.dataset.q; FS.ai = /\s/.test(FS.q); await fsRun(); }
  return true;
}
