// Prompt 73 (BRIEF73): Now Brief på web – «Innhold i briefen» (claude-code-brief-velg-kort.md) og kort som vises med en gang
// (claude-code-brief-kort-lastes-straks.md). Fasit: Glimt Brief.dc.html (mode settings, BK0) og ⚙-arket i briefen.
// - Lista (GET/PUT /api/brief-cards, POST /reset) bestemmer hvilke kort som finnes og rekkefølgen. Den caches lokalt, så briefen
//   tegnes fra lista med en gang – ikke fra data.
// - Kortene fra /api/brief52 hentes hvert for seg (?only=id), alle samtidig, med 6 s tidsavbrudd per kort. Siste svar per kort
//   caches (localStorage, per bruker) og vises straks; nytt innhold byttes inn stille. Uten cache: skjelett i full høyde.
// - Forhåndshenting når fanen kommer i forgrunnen og når Hjem vises (maks hvert 5. min).
import { api, esc } from './util.js';
import { brief52State } from './brief52.js';

/** [key, tittel, kilde, på som standard] – reserve når serveren ikke svarer (samme som server/brief73.js CATALOG73). */
export const CAT73 = [
  ['vaer', 'Vær', 'Nå, i dag og varsel', 1], ['kal', 'Kalender', 'Første avtale og resten av dagen', 1], ['fokus', 'Dagens fokus', 'Det viktigste i dag, valgt av Glimt', 1],
  ['gjore', 'Huskeliste · 3 viktigste', 'Fra Gjøremål', 1], ['reise', 'Min reise', 'Ruter: neste avgang og når du må gå', 1], ['regn', 'Regninger denne uka', 'Fra Finans', 1],
  ['kveld', 'Nytt i kveld', 'Nye episoder og filmer fra Media', 1], ['nyheter', 'Nyheter', 'Sammendrag fra Nyheter', 1], ['pakker', 'Pakker', 'Sporing på vei', 0],
  ['homelab', 'Homelab-status', 'Varsler fra serveren', 0], ['domener', 'Domener og SSL', 'Utløper snart', 0],
  ['klaer', 'Klær i dag', 'Hva du bør ha på deg, fra Vær', 1], ['abo', 'Prøveperioder', 'Fra Abonnementer', 1], ['bibel', 'Bibelvers', 'Dagens vers', 1],
  ['familie', 'Familie', 'De som deler posisjon', 1], ['skole', 'Skole og jobb', 'Prøver og frister neste 7 dager', 1], ['bursdager', 'Bursdager', 'Neste bursdager', 1],
  ['nordlys', 'Nordlys i natt', 'Når Kp er høy nok', 1], ['aksjer', 'Aksjer', 'Porteføljen fra Finans', 0],
];
/** Nøkkel → id i /api/brief52. */
export const B52_73 = { fokus: 'focus', gjore: 'todo', reise: 'trip', regn: 'bills', kveld: 'tonight', homelab: 'homelab', domener: 'domains', klaer: 'clothes', aksjer: 'stocks' };
const KEY_OF = Object.fromEntries(Object.entries(B52_73).map(([k, v]) => [v, k]));
/** Kortets høyde i ferdig form (skjelettet tar samme plass). */
const H73 = { vaer: 280, kal: 150, fokus: 190, gjore: 230, reise: 180, regn: 250, kveld: 146, nyheter: 760, pakker: 150, homelab: 200, domener: 200, klaer: 150, abo: 160, bibel: 260, familie: 120, skole: 160, bursdager: 140, nordlys: 100, aksjer: 130 };
const TIMEOUT = 6000, PREFETCH = 5 * 60_000;
// Stilarket lastes herfra (ingen endring i app.html).
if (typeof document !== 'undefined' && !document.querySelector('link[data-b73-css]')) {
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/css/web73-brief.css'; l.dataset.b73Css = ''; document.head.appendChild(l);
}

const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };
const lsGet = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && v.uid === uid() ? v : null; } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ ...v, uid: uid() })); } catch { /* privat modus / fullt */ } };

const S = { list: null, busy: false, err: '', at: 0, loading: null, cards: {}, state: {}, last: 0, listeners: new Set() };
// state[id] = 'loading' | 'ok' | 'stale' (tidsavbrudd/feil, cache vises) | 'fail' (ingen cache)

/** Lista slik den sist var kjent (cache → standard). [{key, title, sub, on}] */
export function cards73() {
  if (!S.list) { const c = lsGet('brief73_cards'); if (Array.isArray(c?.cards)) S.list = c.cards; }
  return S.list ?? CAT73.map(([key, title, sub, on]) => ({ key, title, sub, on: !!on }));
}
/** Nøklene som er på, i rekkefølge. */
export const onKeys73 = () => cards73().filter((c) => c.on).map((c) => c.key);
export const title73 = (key) => cards73().find((c) => c.key === key)?.title ?? CAT73.find((x) => x[0] === key)?.[1] ?? key;
const notify = () => { for (const f of S.listeners) { try { f(); } catch { /* */ } } };
/** Tegn på nytt når lista eller kortdata endres (briefen, innstillingene). */
export function onBrief73(f) { S.listeners.add(f); return () => S.listeners.delete(f); }

function setList(cards) { S.list = cards; lsSet('brief73_cards', { cards }); notify(); }
/** Henter lista fra serveren (bufret 60 s). */
export function loadCards73(force = false) {
  if (S.loading) return S.loading;
  if (!force && S.list && Date.now() - S.at < 60_000) return Promise.resolve(S.list);
  S.loading = api('/brief-cards').then((r) => { if (Array.isArray(r?.cards)) { setList(r.cards); fetchCards73({ force: true, missing: true }); } S.err = ''; })
    .catch((e) => { if (e.status !== 404) S.err = e.message; }).finally(() => { S.at = Date.now(); S.loading = null; });
  return S.loading;
}
/** Lagrer (straks lokalt, så på serveren). Gjelder briefen med en gang, uten omstart. */
export function saveCards73(cards) {
  setList(cards);
  try { navigator.vibrate?.(6); } catch { /* */ }
  api('/brief-cards', { method: 'PUT', json: { cards: cards.map(({ key, on }) => ({ key, on })) } })
    .then((r) => { if (Array.isArray(r?.cards)) setList(r.cards); S.err = ''; document.dispatchEvent(new CustomEvent('hl:brief73')); })
    .catch((e) => { S.err = e.message; notify(); });
  fetchCards73({ force: true, missing: true });
}
export function resetCards73() {
  try { navigator.vibrate?.(6); } catch { /* */ }
  api('/brief-cards/reset', { method: 'POST' }).then((r) => { if (Array.isArray(r?.cards)) setList(r.cards); document.dispatchEvent(new CustomEvent('hl:brief73')); fetchCards73({ force: true }); })
    .catch((e) => { S.err = e.message; notify(); });
}

/* ---------- Innstillinger: INNHOLD I BRIEFEN ---------- */

const sw = (on) => `<span class="gs-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const UP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const DN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
/** Seksjonen under «Briefer gjennom dagen» (Innstillinger → Glimt og ⚙-arket i briefen). */
export function settings73Html() {
  queueMicrotask(() => loadCards73());
  const L = cards73(), on = L.filter((c) => c.on).length;
  return `<div class="b73-set" data-b73-set>${set73Inner(L, on)}</div>`;
}
function set73Inner(L, on) {
  return `<div class="b73-sh" data-hl="glimt-innhold"><span class="gs-h">INNHOLD I BRIEFEN</span><span class="b73-cnt">${on} av ${L.length} på</span></div>
    <p class="gs-note b73-note">Velg hvilke kort som er med og rekkefølgen de vises i. Gjelder Now Brief på mobil, web og widgets.</p>
    <div class="b73-list" role="list">${L.map((c, i) => `<div class="b73-row${c.on ? '' : ' off'}" role="listitem" data-b73-key="${esc(c.key)}">
      <span class="b73-mv"><button type="button" data-b73-mv="${esc(c.key)}:-1" aria-label="Flytt ${esc(c.title)} opp"${i ? '' : ' disabled'}>${UP}</button><button type="button" data-b73-mv="${esc(c.key)}:1" aria-label="Flytt ${esc(c.title)} ned"${i < L.length - 1 ? '' : ' disabled'}>${DN}</button></span>
      <button type="button" class="b73-t" data-b73-tog="${esc(c.key)}"><b>${esc(c.title)}</b><span>${esc(c.sub ?? '')}</span></button>
      <button type="button" class="gs-swb" data-b73-tog="${esc(c.key)}" role="switch" aria-checked="${c.on}" aria-label="Vis eller skjul ${esc(c.title)}">${sw(c.on)}</button></div>`).join('')}</div>
    <button type="button" class="b73-reset" data-b73-reset>Tilbakestill</button>${S.err ? `<p class="gs-msg">${esc(S.err)}</p>` : ''}`;
}
// Lista kom fra serveren eller ble endret et annet sted → seksjonen tegnes på nytt der den står (Innstillinger og ⚙-arket).
onBrief73(() => { const L = cards73(), on = L.filter((c) => c.on).length; document.querySelectorAll('[data-b73-set]').forEach((el) => { el.innerHTML = set73Inner(L, on); }); });
/** Klikk i innstillingene. → true når det var vårt. */
export function settings73Click(e, redraw) {
  const t = e.target;
  const tg = t.closest('[data-b73-tog]');
  if (tg) { const k = tg.dataset.b73Tog; saveCards73(cards73().map((c) => (c.key === k ? { ...c, on: !c.on } : c))); redraw?.(); return true; }
  const mv = t.closest('[data-b73-mv]');
  if (mv) {
    const [k, d] = mv.dataset.b73Mv.split(':'), L = [...cards73()], i = L.findIndex((c) => c.key === k), j = i + +d;
    if (i >= 0 && j >= 0 && j < L.length) { [L[i], L[j]] = [L[j], L[i]]; saveCards73(L); redraw?.(); }
    return true;
  }
  if (t.closest('[data-b73-reset]')) { resetCards73(); redraw?.(); return true; }
  return false;
}

/* ---------- Kortdata: cache + parallell henting ---------- */

function hydrate() {
  if (brief52State.data) return;
  const c = lsGet('brief73_c52');
  if (c?.cards) { S.cards = c.cards; brief52State.data = { cards: Object.values(c.cards).map((x) => x.card) }; brief52State.at = 0; }
}
function publish() {
  // brief52.js tegner fra brief52State.data.cards; rekkefølgen kommer fra lista.
  brief52State.data = { ...(brief52State.data ?? {}), cards: Object.values(S.cards).map((x) => x.card) };
  lsSet('brief73_c52', { cards: S.cards });
  notify();
}
async function fetchOne(id) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(`/api/brief52?only=${encodeURIComponent(id)}`, { credentials: 'same-origin', signal: ctl.signal });
    if (r.status === 404) return { gone: true };
    if (!r.ok) throw new Error(`Feil ${r.status}`);
    const j = await r.json();
    return { card: (j.cards ?? []).find((c) => c.id === id) ?? null, at: Date.now() };
  } finally { clearTimeout(tm); }
}
/** Henter alle kortene som er på, samtidig. Ett tregt kort holder ikke igjen de andre. */
export function fetchCards73({ force = true, missing = false } = {}) {
  hydrate();
  if (!force && Date.now() - S.last < PREFETCH) return Promise.resolve();
  if (!missing) S.last = Date.now();
  // missing: bare kort som ikke er hentet ennå (f.eks. slått på et annet sted).
  const ids = onKeys73().map((k) => B52_73[k]).filter(Boolean).filter((id) => !missing || !S.state[id]);
  return Promise.all(ids.map(async (id) => {
    if (S.state[id] === 'loading') return;
    S.state[id] = 'loading';
    try {
      const r = await fetchOne(id);
      if (r.gone) { S.state[id] = 'ok'; return; }
      // Serveren ga opp (6 s) eller feilet: behold cachet innhold («Oppdatert kl. …»), ellers «Klarte ikke hente».
      const bad = !!r.card && !r.card.data && !!r.card.error && !r.card.empty;
      if (bad) S.state[id] = S.cards[id]?.card?.data ? 'stale' : 'fail';
      else if (r.card) { S.cards[id] = { card: r.card, at: r.at }; S.state[id] = 'ok'; } else { delete S.cards[id]; S.state[id] = 'ok'; }
    } catch { S.state[id] = S.cards[id] ? 'stale' : 'fail'; }
    publish();
  }));
}
/** Forhåndshenting (fanen i forgrunnen, Hjem vises): maks hvert 5. min. */
export function prefetch73() { loadCards73(); fetchCards73({ force: false }); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') prefetch73(); });
// Endret i en annen fane (Innstillinger) → briefen her følger med en gang.
window.addEventListener('storage', (e) => { if (e.key === 'brief73_cards') { S.list = null; cards73(); notify(); } });

const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** Skjelett i full høyde: tittel og grå linjer i papirstil (#e6dfd1 på #fffdf8). Ingen spinner. */
export function skeleton73(key) {
  return `<section class="b73-sk" data-gb73="${esc(key)}" style="min-height:${H73[key] ?? 150}px" aria-busy="true" aria-label="${esc(title73(key))} lastes"><b>${esc(title73(key))}</b><span style="width:72%"></span><span style="width:54%"></span><span style="width:63%"></span></section>`;
}
/** Kort uten innhold: kort tomtekst, kortet blir stående. */
export function empty73(key, text) {
  return `<section class="b73-em" data-gb73="${esc(key)}"><b>${esc(title73(key))}</b><span>${esc(text)}</span></section>`;
}
/** Et /api/brief52-kort med cache/skjelett/status. render(id) gir html fra brief52.js. */
export function card52Html73(key, render) {
  const id = B52_73[key];
  hydrate();
  const st = S.state[id], have = S.cards[id];
  if (!have) {
    if (st === 'fail') return `<section class="b73-em" data-gb73="${esc(key)}" style="min-height:${H73[key] ?? 150}px"><b>${esc(title73(key))}</b><span>Klarte ikke hente</span><button type="button" class="gs-pill" data-b73-retry="${esc(id)}">Prøv igjen</button></section>`;
    return skeleton73(key);
  }
  const html = render(id);
  const note = st === 'stale' ? `<span class="b73-up">Oppdatert kl. ${esc(hm(have.at))} · <button type="button" data-b73-retry="${esc(id)}">Prøv igjen</button></span>` : '';
  return html ? `<div class="b73-w" data-gb73="${esc(key)}">${html}${note}</div>` : empty73(key, have.card?.error || 'Ingen data akkurat nå');
}
/** «Prøv igjen» i et kort. → true når det var vårt. */
export function brief73Click(e) {
  const r = e.target.closest('[data-b73-retry]');
  if (!r) return false;
  e.preventDefault();
  const id = r.dataset.b73Retry;
  delete S.state[id];
  S.last = 0;
  fetchCards73({ force: true });
  return true;
}
export const keyOf52 = (id) => KEY_OF[id] ?? id;
