// Prompt 25 (PWA): fanelinje-stil (Tekst / Bare ikoner / Ikoner + navn på valgt), rød Hjem-knapp i Fold-sidelinja,
// Mer med ikoner, «Ta meg dit →» med fremheving i Innstillinger, AI-søk i Finans som bakgrunnsjobb med fremdrift og
// Avbryt, og værkartet rett på værsiden på Fold. Fasit: design/Mobil Papir App.dc.html og design/Vaer.dc.html.
import { api, esc, hlApi } from './core.js';
import { m, draw, flash, startScr } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const LS = 'fh_p25';
const L = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } })();
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch {} };

/* =====================================================================
   1. Fanelinje-stil (layout.navStyle)
   ===================================================================== */

export const NAV_STYLES = [['text', 'Tekst', 'Navn på alle · ikon på valgt fane'], ['icons', 'Bare ikoner', 'Ikoner uten navn'], ['icons_active_label', 'Ikoner + navn på valgt', 'Ikoner · valgt fane viser også navn']];
export const navStyle = () => (NAV_STYLES.some(([k]) => k === L.navStyle) ? L.navStyle : 'text');
export const navStyleName = () => NAV_STYLES.find(([k]) => k === navStyle())[1];
/** Fra GET /api/me/layout. */
export function take25(r) { if (r && NAV_STYLES.some(([k]) => k === r.navStyle) && r.navStyle !== L.navStyle) { L.navStyle = r.navStyle; keep(); } }
export function setNavStyle(v) {
  if (!NAV_STYLES.some(([k]) => k === v) || v === navStyle()) return;
  L.navStyle = v; keep(); haptic('tab'); draw();
  hlApi('/me/layout', { method: 'PUT', json: { navStyle: v } }).catch(() => {});
}
const cycleNavStyle = () => setNavStyle(NAV_STYLES[(NAV_STYLES.findIndex(([k]) => k === navStyle()) + 1) % NAV_STYLES.length][0]);
const NS_CLS = { text: 'ns-text', icons: 'ns-icons', icons_active_label: 'ns-ial' };

const HOUSE = 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6';
/**
 * Etterbehandler HTML-en fra paperNav (alle fanelinjer: Hjem, Finans, Domener, Familie, Subscription OS):
 * stilklasse på <nav>, aria-label på fanene (navnet kan være skjult) og den røde Hjem-knappen øverst i
 * sidelinja. Knappen vises bare i bred modus (CSS ≥ 600 px) og bare når du ikke er på Hjem.
 */
export function nav25(html, scr) {
  if (!html) return html;
  const home = startScr(), atHome = scr === home && !m.sub;
  const btn = atHome ? '' : `<a class="p25-home" href="#/${home}" data-p25="home" aria-label="Til Hjem" title="Hjem"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${HOUSE}"/></svg></a>`;
  return html
    .replace(/<nav class="pp-nav([^"]*)"([^>]*)>/, (_, c, rest) => `<nav class="pp-nav ${NS_CLS[navStyle()]}${c}"${rest}>${btn}`)
    .replace(/<(a|button)\b((?:(?!aria-label)[^>])*)>(<i\b[^>]*>[\s\S]*?<\/i>)<span>([^<]*)<\/span>/g, (all, tag, attrs, ic, name) => `<${tag}${attrs} aria-label="${name}">${ic.replace(/^<i\b/, '<i aria-hidden="true"')}<span>${name}</span>`);
}

/** Forhåndsvisning av fanelinja (dine egne faner + Mer og +), som «Rediger fanelinjen» → STIL i designet. */
function preview(tabs, k, big) {
  return tabs.map(([g, nm], j) => {
    const on = j === 0, ic = k === 'text' ? on : true, lb = k === 'text' ? true : k === 'icons_active_label' ? on : false;
    const px = on ? (big ? 16 : 7) : (big ? 6 : 3), fx = on && k !== 'icons' ? 'none' : '1 1 0';
    return `<span class="p25-pv${on ? ' on' : ''}" style="${big ? `flex:${fx};` : ''}padding:0 ${px}px">${ic ? `<i aria-hidden="true">${g}</i>` : ''}${lb ? `<span>${esc(nm)}</span>` : ''}</span>`;
  }).join('');
}
/** STIL · FORHÅNDSVISNING og de tre stil-kortene. tabs = [[rute, navn, ikon], …] fra hovedlinja. */
export function styleSection(tabs) {
  const base = tabs.filter(([k]) => k !== 'mer').slice(0, 4).map(([, n, ic]) => [/[<]/.test(String(ic)) ? '•' : ic, n]);
  const PV = [...(base.length ? base : [['⌂', 'Hjem'], ['kr', 'Finans'], ['◐', 'Mat']]), ['⋯', 'Mer']], cur = navStyle();
  return `<span class="pp-lab p25-sl">STIL · FORHÅNDSVISNING</span>
    <div class="p25-pvbg"><div class="p25-pvbar big ${NS_CLS[cur]}">${preview(PV, cur, true)}<span class="p25-pvplus" aria-hidden="true">+</span></div></div>
    <div class="p25-styles" role="radiogroup" aria-label="Fanelinje-stil">${NAV_STYLES.map(([k, n]) => `<button class="p25-style" data-p25="ns" data-k="${k}" role="radio" aria-checked="${cur === k}"><span class="p25-pvbar sm" aria-hidden="true">${preview(PV.slice(0, 3), k, false)}</span><b>${esc(n)}</b></button>`).join('')}</div>`;
}

/* =====================================================================
   2. Mer med ikoner (40-boks, strekikon i palettfargene)
   ===================================================================== */

const ICP = { light: ['#b23a2a', '#2b5d8a', '#2f7a4f', '#a8661a', '#7a3b6b', '#2e6f75'], dark: ['#f08a76', '#8cb8e6', '#8fd3a5', '#f0b56a', '#e3a1cf', '#86cfd6'] };
const MER_IC = {
  hl: HOUSE, dom: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', spor: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  bd: 'M4 11h16v9H4zM2 7h20v4H2zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z', huske: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  fam: 'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', media: 'M5 4l14 8-14 8z', hjem: 'M3 6h18v12H3zM3 10h18M7 15h4',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  nyheter: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8M6 18h.01', kal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 14h2M12 14h2M8 17h2',
  set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};
/** Én Mer-rad: ikonboks, Newsreader-tittel, undertekst og ›. i = plass i lista (fargen går rundt i paletten). */
export function merRow([k, nm, sd], i, dark) {
  const pal = ICP[dark ? 'dark' : 'light'];
  return `<a href="#/${k}"><span class="p25-mic" style="color:${pal[i % pal.length]}" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${MER_IC[k] ?? 'M12 12h.01'}"/></svg></span><span class="m-grow"><b class="pp-serif">${esc(nm)}</b><span class="pp-mut">${esc(sd)}</span></span><span class="pp-mut" aria-hidden="true">›</span></a>`;
}

/* =====================================================================
   3. «Ta meg dit →» og fremheving i Innstillinger (~3 s)
   ===================================================================== */

let HI = null; // { sel, until, done }
const HI_MS = 3200;
/** x = { id, title, href } fra innstillingsindeksen. Åpner riktig side, scroller til raden og fremhever den. */
export function goSet(x) {
  if (!x) return;
  haptic('tap');
  const id = String(x.id), href = String(x.href ?? '#/set');
  // Hvor raden ligger: integrasjoner har egen gruppe på undersiden, resten er rader på hovedsiden (eller en lenke dit).
  const steps = id.startsWith('integ:') ? [[href, [`#ig-${CSS.escape(id.slice(6))}`, '.p26 .p26-r.top']]]
    : !href.startsWith('#/') ? [['#/set', [`[data-set="${CSS.escape(id)}"]`]]]
      : [['#/set', [`[data-set="${CSS.escape(id)}"]`, `a[href="${href}"]`]], ...(href.split('/').length > 3 ? [[href.split('/').slice(0, -1).join('/'), [`a[href="${href}"]`]]] : []), [href, href.startsWith('#/set/') ? [`[data-set="${CSS.escape(id)}"]`, '.p17-list', '.list'] : []]];
  HI = { steps, i: 0, sel: null, until: 0, t0: Date.now() };
  step();
}
function step() {
  if (!HI) return;
  const [page] = HI.steps[HI.i];
  HI.t0 = Date.now();
  if (location.hash !== page) location.hash = page; else draw();
  setTimeout(seek, 140);
}
function seek() {
  if (!HI || HI.sel) return;
  const [page, sels] = HI.steps[HI.i];
  const el = location.hash === page ? sels.map((s) => document.querySelector(`#app .m-scroll ${s}`)).find(Boolean) : null;
  if (el) { HI.sel = sels.find((s) => document.querySelector(`#app .m-scroll ${s}`) === el); HI.until = Date.now() + HI_MS; mark(true); return; }
  if (Date.now() - HI.t0 < 1200) { setTimeout(seek, 150); return; } // venter på at siden er hentet
  if (HI.i < HI.steps.length - 1) { HI.i++; step(); } else HI = null;
}
function mark(scroll) {
  if (!HI?.sel) return;
  const el = document.querySelector(`#app .m-scroll ${HI.sel}`);
  if (!el) return;
  const left = HI.until - Date.now();
  if (left <= 0) { HI = null; return; }
  // Rett på (uten overgang), også når siden tegnes på nytt; bare uttoningen til slutt animeres.
  el.style.transition = 'none'; el.classList.add('p25-hi'); void el.offsetWidth; el.style.transition = '';
  if (scroll) {
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    clearTimeout(mark.t); mark.t = setTimeout(() => { document.querySelector(`#app .m-scroll ${HI?.sel}`)?.classList.remove('p25-hi'); HI = null; }, left);
  }
}

/* =====================================================================
   4. AI-søk som bakgrunnsjobb (POST /search/ai med Prefer: respond-async → 202 {jobId}; GET/DELETE /jobs/:id)
   ===================================================================== */

export const LIM = { clientTimeoutS: 180, max: 60, t: 0 };
export async function limitsLoad() {
  if (LIM.t > Date.now() - 300e3) return LIM;
  LIM.t = Date.now();
  try {
    const r = await api('/ai/limits');
    const vals = Object.values(r?.engines ?? {}).map((v) => Number(typeof v === 'object' ? v?.limitS ?? v?.timeoutS ?? v?.s : v)).filter((v) => v > 0);
    if (vals.length) LIM.max = Math.max(...vals);
    if (Number(r?.clientTimeoutS) > 0) LIM.clientTimeoutS = Number(r.clientTimeoutS);
  } catch { /* eldre server: standard 180 s */ }
  return LIM;
}
const sleep = (ms, sig) => new Promise((res, rej) => { const t = setTimeout(res, ms); sig?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('Avbrutt'), { name: 'AbortError' })); }, { once: true }); });
export const JOB = { cur: null };
const isJob = (r) => r && typeof r === 'object' && r.jobId && ['running', 'queued', 'pending'].includes(r.status) && !('hits' in r);
function take(J, v) {
  if (!v) return;
  J.status = v.status ?? J.status; J.engine = v.engineName ?? v.engine ?? J.engine;
  if (v.elapsedS != null) J.elapsedS = v.elapsedS;
  if (v.limitS) J.limitS = v.limitS;
  J.text = v.text || J.text;
}
/**
 * Kjører AI-søket. Svarer serveren straks (raske søk og eldre servere), returneres svaret. Ellers følges jobben
 * hvert sekund til den er ferdig. Ingen fast tidsgrense i klienten: grensen er motorens (serveren gir opp og går
 * videre til neste motor). Avbryt med cancelAi(). onTick(J) kalles ved hver endring.
 */
export async function aiJob(body, onTick) {
  limitsLoad().catch(() => {});
  const ctl = new AbortController(), J = { id: null, ctl, t0: Date.now(), status: 'running', engine: null, elapsedS: 0, limitS: null, text: '✦ Søker …' };
  JOB.cur = J; onTick?.(J);
  const local = setInterval(() => { if (J.id) return; J.elapsedS = Math.round((Date.now() - J.t0) / 1000); J.text = `✦ Søker … ${J.elapsedS} s`; onTick?.(J); }, 1000);
  // Grensen for hele kallet: clientTimeoutS fra /ai/limits (standard 180 s). Brukes bare som nødbrems for et synkront svar som aldri kommer.
  const brake = setTimeout(() => { if (!J.id) ctl.abort(); }, (LIM.clientTimeoutS || 180) * 1000);
  try {
    const r = await api('/search/ai?async=1', { method: 'POST', headers: { Prefer: 'respond-async' }, json: { ...body, async: true }, signal: ctl.signal });
    if (!isJob(r)) return r;
    J.id = r.jobId; take(J, r); onTick?.(J);
    let miss = 0;
    for (;;) {
      await sleep(1000, ctl.signal);
      let v;
      try { v = await api(`/jobs/${encodeURIComponent(J.id)}`, { signal: ctl.signal }); miss = 0; }
      catch (e) {
        if (e.name === 'AbortError') throw e;
        // 404: serveren kjenner ikke jobben (eldre server eller omstart): fall tilbake til et vanlig, synkront kall.
        if (e.status === 404) { J.id = null; return await api('/search/ai', { method: 'POST', json: body, signal: ctl.signal }); }
        if (++miss > 5) throw e;
        continue;
      }
      take(J, v); onTick?.(J);
      if (v.status === 'done') return v.result ?? v;
      if (v.status === 'error') throw new Error(v.error || v.text || 'AI-søket feilet');
      if (v.status === 'cancelled') throw Object.assign(new Error('Avbrutt'), { name: 'AbortError' });
    }
  } finally { clearInterval(local); clearTimeout(brake); if (JOB.cur === J) JOB.cur = null; }
}
export function cancelAi() {
  const J = JOB.cur;
  if (!J) return;
  J.cancelled = true; J.text = 'Avbryter …';
  if (J.id) api(`/jobs/${encodeURIComponent(J.id)}`, { method: 'DELETE' }).catch(() => {});
  J.ctl.abort();
}
/** Fremdriftskortet: «✦ Ollama tenker … 34 s av 60 s», linje og Avbryt. */
export function jobCard(J = JOB.cur) {
  if (!J) return '<div class="m-spin"></div>';
  const pct = J.limitS ? Math.min(100, (J.elapsedS / J.limitS) * 100) : null;
  return `<div class="pp-card p25-job" role="status" aria-live="polite"><span class="pp-lab">✦ AI-SØK</span><span class="p25-jt" data-p25t>${esc(J.text)}</span>
    <span class="p25-bar${pct == null ? ' ind' : ''}" aria-hidden="true"><i data-p25b style="${pct == null ? '' : `width:${pct.toFixed(1)}%`}"></i></span>
    <button class="pp-btn sm p25-cancel" data-p25="aicancel" ${J.cancelled ? 'disabled' : ''}>Avbryt</button></div>`;
}
/** Oppdaterer kortet uten å tegne hele siden på nytt (hvert sekund). */
export function jobTick(J) {
  const t = document.querySelector('[data-p25t]'), b = document.querySelector('[data-p25b]');
  if (!t) return false;
  t.textContent = J.text;
  if (b && J.limitS) { b.parentElement.classList.remove('ind'); b.style.width = `${Math.min(100, (J.elapsedS / J.limitS) * 100).toFixed(1)}%`; }
  return true;
}

/* =====================================================================
   5. Værsiden på Fold (≥ 700 px): værkartet rett på siden
   ===================================================================== */

export const wxFold = () => innerWidth >= 700;
const LAYERS = [['rain', 'Nedbør'], ['temp', 'Temperatur'], ['wind', 'Vind'], ['clouds', 'Skyer']];
export function wxMapCard(P, layer) {
  const la = (+P?.lat || 59.91).toFixed(3), lo = (+P?.lon || 10.75).toFixed(3);
  const src = `https://embed.windy.com/embed2.html?lat=${la}&lon=${lo}&detailLat=${la}&detailLon=${lo}&zoom=7&level=surface&overlay=${layer}&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C`;
  return `<div class="p25-wmap"><iframe src="${esc(src)}" title="Værkart" loading="lazy"></iframe>
    <div class="p25-wmt"><span class="p25-wml">${LAYERS.map(([k, n]) => `<button data-wx2="layer" data-k="${k}" aria-pressed="${layer === k}">${n}</button>`).join('')}</span><button class="p25-wfs" data-wx2="map">⤢ Fullskjerm</button></div></div>`;
}

/* =====================================================================
   Oppstart, tegning og klikk
   ===================================================================== */

let bp = null;
export function boot() {
  limitsLoad().catch(() => {});
  // Bytt layout uten å laste på nytt når Fold åpnes og lukkes (600: sidelinje, 700: værsiden i to kolonner).
  const cls = () => (innerWidth >= 700 ? 2 : innerWidth >= 600 ? 1 : 0);
  bp = cls();
  addEventListener('resize', () => { const c = cls(); if (c !== bp) { bp = c; if (document.documentElement.dataset.ui === 'mobile') draw(); } });
}
export function afterDraw() { if (HI?.sel) mark(false); }

/** Klikk med data-p25. Returnerer true når klikket er håndtert. */
export function bind25(e, t) {
  const x = t?.closest?.('[data-p25]');
  if (!x || e.type !== 'click') return false;
  switch (x.dataset.p25) {
    case 'ns': e.preventDefault(); setNavStyle(x.dataset.k); return true;
    case 'nscycle': e.preventDefault(); cycleNavStyle(); flash(`Fanelinje-stil: ${navStyleName()}`); return true;
    case 'aicancel': e.preventDefault(); cancelAi(); jobTick(JOB.cur ?? { text: 'Avbryter …' }); return true;
    case 'home': haptic('tab'); return false; // lenken går til Hjem
    default: return false;
  }
}
