// Prompt 34 (PWA): mobilpunktene i prompt-34-pakken.
//  1. Haptikk på alle tilbake-knapper, sveip tilbake og systemets tilbake (claude-code-haptikk-tilbake.md).
//  2. Kvitteringer: ✦ ANALYSERES AV AI · N med skannelinje, steg, modell, «Følg i Chat ›» og Avbryt
//     (claude-code-chat-skanninger-mappe.md, fasit Mobil Papir App → kv.ai / rcAiL / rcAiTick).
//  3. Glimt-brief: Hjem-kort (h12) og brief-siden med den interaktive Glimt-figuren og guide-runden
//     (claude-code-glimt-brief.md, fasit Glimt Brief.dc.html). Data: GET /api/brief, ellers bygget av Vær/Kalender/Nyheter.
//  4. Innstillinger: AI-søk tar deg til siden og markerer elementet med pulserende rød ring (og boble for «Oppdater nå»)
//     (claude-code-innst-ai-sok-highlight.md, fasit Innstillinger Web → IDX/match/goK/hl).
//  5. Tydelige AI-feil i Glimt-boblen: «Glimt fikk ikke svar fra {modell}: {feil}» med Prøv igjen og Åpne AI-kontroll.
// AI-kontroll (Innstillinger → APP → AI og modeller, og fra Chat) ligger i mobile-p34ai.js.
import { S, api, esc, hlApi, n2 } from './core.js';
import { m, draw, flash, startScr, loadJobs } from './mobile.js';
import { haptic, hapBack } from './mobile-haptics.js';
import { hlData } from './mobile-hl.js';
import * as KAL from './mobile-kal.js';

const pad = (n) => String(n).padStart(2, '0');
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };

/* =====================================================================
   1. Haptikk på tilbake-knapper
   ===================================================================== */
// «‹ Hjem / ‹ Finans»-pillene, Innstillinger ‹, Chat ‹, Kalender ‹ Homelab, Vær ✕, Finn-annonse ‹, innlogging ‹ Tilbake,
// Hjem-knappen i fanelinja, AI-kontroll og brief Ferdig. Hjem-fanen fra en annen side regnes også som tilbake.
const BACK_SEL = '.pp-back, .gback, .back, .gtop, .atop, .n31-back, [data-swipeback], [data-mact="txback"], [data-mact="pdback"], [data-p25="home"], [data-c27="exit"], [data-k27="back"], [data-wx="back"], [data-g="back"], [data-p34back]';
let lastPtr = 0, booted = false;
function isBack(t) {
  const el = t?.closest?.(BACK_SEL);
  if (el) return true;
  const tab = t?.closest?.('a[data-tab], .pp-nav a[href]');
  if (!tab) return false;
  const to = (tab.getAttribute('href') || '').replace(/^#\/?/, '');
  return to === startScr() && m.screen !== startScr();
}
export function boot34() {
  if (booted) return;
  booted = true;
  // Capture-fasen: impulsen kommer før siden byttes, og bare én gang per trykk (hapBack har 120 ms sperre).
  addEventListener('click', (e) => { if (isBack(e.target)) hapBack(); }, true);
  addEventListener('pointerdown', () => { lastPtr = Date.now(); }, true);
  addEventListener('pointerup', () => { lastPtr = Date.now(); }, true);
  // Systemets tilbake (Android-knappen/-gesten, iOS-sveip i nettleseren): popstate uten trykk rett før.
  addEventListener('popstate', () => { if (Date.now() - lastPtr > 700) hapBack(); });
  // Fjern markeringen ved første trykk.
  addEventListener('pointerdown', (e) => { if (RING.el && !e.target.closest?.('.p34-tip')) ringOff(); }, true);
}

/* =====================================================================
   2. Kvitteringer som analyseres av AI
   ===================================================================== */
const STEPS = ['Lastet opp', 'Leser bildet', 'Finner butikk, dato og sum', 'Leser varelinjer', 'Foreslår kategori'];
const RUN = ['pending', 'processing'];
const SPARK = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z" fill="currentColor"/></svg>';
const kr2 = (v) => `−${n2(v)}`;
// GET /finans/api/receipts/analyzing → {count, items:[{id, file, thumb, status:'queued'|'analyzing', model, progress, step, partial, chatId, jobId}]}.
// Eldre server: pending/processing fra /receipts/jobs.
export const RA = { items: null, miss: false, t: 0, busy: false };
export async function rcAiLoad() {
  if (RA.miss || RA.busy) return;
  RA.busy = true;
  try { const r = await api('/receipts/analyzing'); RA.items = Array.isArray(r) ? r : r?.items ?? []; RA.t = Date.now(); }
  catch (e) { if (e.status === 404) RA.miss = true; }
  RA.busy = false;
}
let raT = null;
function rcAiPoll() {
  clearTimeout(raT);
  if (m.screen !== 'kv' || RA.miss || !(RA.items?.length)) return;
  raT = setTimeout(async () => { if (m.screen !== 'kv') return; const before = RA.items?.length ?? 0; await rcAiLoad(); if ((RA.items?.length ?? 0) < before) await loadJobs().catch(() => {}); draw(); }, 1500);
}
/** Kvitteringene som leses av AI nå. */
export const aiJobs = () => (RA.items && !RA.miss ? RA.items.map((x) => ({ ...x, status: x.status === 'queued' ? 'pending' : 'processing', name: x.file })) : (m.jobs ?? []).filter((j) => RUN.includes(j.status)));
function stepOf(j) {
  if (typeof j.step === 'number') return Math.max(0, Math.min(4, j.step));
  const s = String(j.step ?? j.stage ?? '').toLowerCase();
  if (s) { const i = [/opplast|upload/, /bilde|image|read|les/, /fields|butikk|store|sum|dato|merchant/, /linje|line|item/, /kategori|categor/].findIndex((re) => re.test(s)); if (i >= 0) return Math.max(1, i); }
  const p = j.progress ?? 0;
  return Math.max(j.status === 'pending' ? 1 : 1, Math.min(4, Math.floor(p / 20)));
}
const part = (j) => j.partial ?? j.fields ?? {};
function aiRow(j) {
  const si = stepOf(j), P = part(j), p = Math.max(3, Math.min(99, j.progress ?? (si * 20)));
  const store = P.store ?? P.merchant ?? j.merchant, sum = P.sum ?? P.total ?? j.total, lines = P.lines ?? P.lineCount, cat = P.category ?? P.cat, conf = P.confidence ?? P.conf;
  const confP = conf == null ? null : conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
  const t = store && si >= 2 ? store : j.status === 'pending' ? 'Venter på AI …' : 'Leser kvittering …';
  const sub = si >= 4 && cat ? `${cat}${confP != null ? ` · ${confP} % sikker` : ''}` : si >= 3 && lines ? `${lines} varelinjer` : (j.file ?? j.name ?? 'Kvittering');
  const model = j.model ?? null;
  const steps = STEPS.map((n, i) => { const dn = i < si, ac = i === si; return `<span class="p34-st${dn ? ' ok' : ac ? ' on' : ''}"><i aria-hidden="true">${dn ? '✓' : ''}</i>${esc(n)}</span>`; }).join('');
  return `<div class="p34-ai" data-id="${esc(j.id)}">
    <div class="p34-aih"><span class="p34-th"${j.thumb ? ` style="background-image:url('${esc(j.thumb)}')"` : ''}><span class="p34-scan" aria-hidden="true"></span></span>
      <span class="p34-ait"><b>${esc(t)}</b><span>${esc(sub)}</span>${model ? `<em>${esc(model)}</em>` : j.statusText ? `<small>${esc(j.statusText)}</small>` : ''}</span><b class="p34-aiv">${sum != null && si >= 2 ? esc(kr2(sum)) : ''}</b></div>
    <span class="p34-bar"><i style="width:${p}%"></i></span>
    <div class="p34-steps">${steps}</div>
    <div class="p34-aib"><button type="button" class="p34-ghost" data-p34="kvchat" data-id="${esc(j.id)}">Følg i Chat ›</button><button type="button" class="p34-txt" data-p34="kvstop" data-id="${esc(j.id)}">Avbryt</button></div></div>`;
}
/** Seksjonen øverst i Kvitteringer, under Ta bilde / Bilder / Filer og over KØ og TIL GJENNOMGANG. */
export function kvAi() {
  const L = aiJobs();
  if (!L.length) return '';
  return `<span class="p34-lab">${SPARK}<span>ANALYSERES AV GLIMT · ${L.length}</span></span><div class="p34-ais">${L.map(aiRow).join('')}</div>`;
}
// Ferdig lest: toast «✦ Kvittering lest · KIWI Majorstuen» med dobbel haptikk (ok-mønsteret har to impulser).
const SEEN = new Map();
function watchDone() {
  const now = new Map((m.jobs ?? []).map((j) => [String(j.id), j]));
  const act = new Set(aiJobs().map((j) => String(j.id)));
  for (const [id] of SEEN) {
    if (act.has(id)) continue;
    const j = now.get(id);
    if (j && !RUN.includes(j.status) && j.status !== 'error') { flash(`✦ Kvittering lest · ${j.merchant || j.name || 'kvittering'}`, 'ok'); SEEN.delete(id); }
    else if (!j || j.status === 'error') SEEN.delete(id);
  }
  for (const j of aiJobs()) SEEN.set(String(j.id), j.status);
}
async function kvStop(id) {
  const j = (m.jobs ?? []).find((x) => String(x.id) === String(id));
  haptic('tap');
  try { await api(`/receipts/${encodeURIComponent(id)}/cancel-ai`, { method: 'POST' }); }
  catch (e1) {
    try { if (j?.jobId) await hlApi(`/ai/jobs/${encodeURIComponent(j.jobId)}/cancel`, { method: 'POST' }); else throw e1; }
    catch { try { await api(`/receipts/${encodeURIComponent(id)}/reject`, { method: 'POST' }); } catch (e) { flash(e.message, 'err'); return; } }
  }
  SEEN.delete(String(id));
  await Promise.all([loadJobs().catch(() => {}), rcAiLoad()]);
  flash('Analysen er avbrutt');
}

/* =====================================================================
   3. Glimt-brief
   ===================================================================== */
export const BR = { d: null, t: 0, busy: false, err: '', step: 0, tgt: null, from: 'hl', wx: null };
export const kindNow = () => { const h = new Date().getHours(); return h < 11 ? 'morning' : h < 17 ? 'day' : 'evening'; };
export const KICK = { morning: 'Morgenbrief', day: 'Dagsbrief', evening: 'Kveldsbrief' };
export const WXP = { sol: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', delvis: 'M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M5.4 10.4A3 3 0 1 1 10.8 7.2M9 20h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13.4A3.3 3.3 0 0 0 9 20z', sky: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1A3.5 3.5 0 0 0 7 18z', regn: 'M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3', sno: 'M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01' };
export const WT = { sol: 'klart', delvis: 'lettskyet', sky: 'skyet', regn: 'regn', sno: 'snø' };
export const wk = (c) => { if (typeof c === 'string' && !/^\d+$/.test(c)) { const s = c.toLowerCase(); return /snø|snow/.test(s) ? 'sno' : /regn|rain|byge|shower/.test(s) ? 'regn' : /klar|clear|sol|fair/.test(s) ? 'sol' : /lett|partly|delvis/.test(s) ? 'delvis' : 'sky'; } c = +c; return c <= 1 ? 'sol' : c === 2 ? 'delvis' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95 ? 'regn' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'sno' : 'sky'; };
export const hm = (iso) => { const s = String(iso ?? ''); const x = /T(\d\d:\d\d)/.exec(s) || /^(\d\d:\d\d)/.exec(s); if (x) return x[1]; const d = new Date(s); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const firstName = () => String(m.me?.name ?? S.boot?.settings?.name ?? '').split(/\s+/)[0] || '';
export const capF = (x) => String(x ?? '').charAt(0).toUpperCase() + String(x ?? '').slice(1);

/** Været fra /api/weather/full (samme kilde som Vær-siden), ellers Hjem-dataene. */
export async function wxFull() {
  if (BR.wx && Date.now() - BR.wx._t < 10 * 60e3) return BR.wx;
  try { const r = await hlApi('/weather/full?place=oslo'); BR.wx = { ...r, _t: Date.now() }; } catch { BR.wx = { _t: Date.now(), miss: true }; }
  return BR.wx;
}
export function localWx() {
  const F = BR.wx && !BR.wx.miss ? BR.wx : null, w = hlData()?.weather ?? {};
  const cur = F?.current ?? {}, td = F?.today ?? {}, yd = F?.yesterday ?? {};
  const code = cur.code ?? w.code ?? w.symbol ?? w.icon, k = wk(code ?? 3), t = cur.temp ?? w.temp ?? w.temperature ?? w.now;
  const hrs = (F?.hours ?? []).filter((x) => new Date(x.t) >= new Date(Date.now() - 36e5)).slice(0, 12), rain = hrs.map((x) => +x.precip || 0);
  const fr = rain.findIndex((v) => v >= 0.2), h = new Date().getHours();
  const hi = td.hi ?? w.hi ?? w.max, lo = td.lo ?? w.lo ?? w.min;
  const vs = hi != null && yd.hi != null ? (Math.round(hi) === Math.round(yd.hi) ? 'Like varmt som i går' : `${Math.abs(Math.round(hi - yd.hi))} grader ${hi < yd.hi ? 'kaldere' : 'varmere'} enn i går`) : null;
  return { now: t != null ? Math.round(t) : null, hi: hi != null ? Math.round(hi) : null, lo: lo != null ? Math.round(lo) : null, cond: cur.text ? cur.text.toLowerCase() : WT[k], code: k, rain12h: rain, vsYesterday: vs, sunset: hm(td.sunset ?? w.sunset),
    rainSoon: !rain.length ? '' : fr < 0 ? 'oppholdsvær de neste 12 timene' : fr === 0 ? 'regn nå' : `regn fra ca. ${pad((h + fr) % 24)}`, place: F?.place?.name ?? w.place ?? 'Oslo' };
}
export function localEvents() {
  try { return KAL.upcoming(3).map((e) => ({ title: e.t, loc: e.loc, color: e.c, start: e.s, day: e.i ? 'i morgen' : 'i dag', k: e.k, min: e.min, tomorrow: !!e.i })); } catch { return []; }
}
export function localNews() {
  const N = hlData()?.news ?? BR.rss ?? [];
  return (Array.isArray(N) ? N : N.items ?? []).slice(0, 3).map((x) => ({ source: x.feed ?? x.source ?? '', title: x.title, url: x.url, time: hm(x.published) }));
}
export const evStart = (e) => e.start ?? hm(e.s ?? e.startsAt ?? e.time);
function summaryOf(kind, wx, ev) {
  const nm = firstName(), hi = kind === 'morning' ? `God morgen${nm ? `, ${nm}` : ''}. ` : kind === 'evening' ? `God kveld${nm ? `, ${nm}` : ''}. ` : '';
  const nx = ev[0], w = wx.now != null ? `${capF(wx.cond || 'været')} og ${wx.now}° i ${wx.place || 'Oslo'}${wx.rainSoon ? `, ${wx.rainSoon}` : ''}. ` : '';
  const e = nx ? (nx.tomorrow ? `I morgen starter du med ${nx.title} kl. ${evStart(nx)}.` : `Neste er ${nx.title} kl. ${evStart(nx)}.`) : 'Kalenderen er fri.';
  return `${hi}${w}${e}${/regn/.test(wx.rainSoon || '') && !/opphold/.test(wx.rainSoon) ? ' Ta med paraply.' : ''}`;
}
/** Normaliserer svaret fra /api/brief (eller lager et lokalt) til én form. */
function norm(r) {
  const kind = r?.kind ?? kindNow(), lw = localWx(), W = r?.weather ?? {};
  const now = W.now ?? W.temp ?? lw.now;
  const wx = { ...lw, now: now != null ? Math.round(now) : null, hi: W.hi != null ? Math.round(W.hi) : lw.hi, lo: W.lo != null ? Math.round(W.lo) : lw.lo, cond: W.cond ?? W.text ?? lw.cond, code: W.code != null || W.cond ? wk(W.code ?? W.cond) : lw.code,
    rain12h: Array.isArray(W.rain12h) && W.rain12h.length ? W.rain12h.map((v) => +(typeof v === 'object' ? v.mm ?? v.precip ?? 0 : v) || 0) : lw.rain12h,
    vsYesterday: typeof W.vsYesterday === 'string' ? W.vsYesterday : typeof W.vsYesterday === 'number' ? (W.vsYesterday === 0 ? 'Like varmt som i går' : `${Math.abs(Math.round(W.vsYesterday))} grader ${W.vsYesterday < 0 ? 'kaldere' : 'varmere'} enn i går`) : lw.vsYesterday,
    sunset: W.sunset ? hm(W.sunset) : lw.sunset, place: W.place ?? lw.place };
  const ev = Array.isArray(r?.events) && r.events.length ? r.events.slice(0, 3).map((e) => ({ title: e.title ?? e.t, loc: e.loc ?? e.location ?? '', color: e.color ?? '#b23a2a', start: evStart(e), day: e.day ?? (e.tomorrow ? 'i morgen' : 'i dag'), k: e.date ?? e.k ?? '', min: e.inMin ?? e.min ?? null, tomorrow: !!e.tomorrow || e.day === 'i morgen' })) : localEvents();
  const news = Array.isArray(r?.news) && r.news.length ? r.news.slice(0, 3).map((x) => ({ source: x.source ?? x.feed ?? '', title: x.title, url: x.url, time: hm(x.time ?? x.published) })) : localNews();
  return { kind, title: r?.title ?? KICK[kind], summary: r?.summary || summaryOf(kind, wx, ev), wx, ev, news, at: r?.generatedAt ? hm(r.generatedAt) : hm(new Date().toISOString()), src: r ? 'glimt' : 'lokal', mood: r?.mood ?? r?.state ?? null };
}
export async function briefLoad(force = false) {
  if (BR.busy || (!force && BR.d && Date.now() - BR.t < 5 * 60e3 && BR.d.kind === kindNow())) return;
  BR.busy = true;
  const wxP = wxFull().catch(() => {});
  let r = null;
  try { r = await hlApi(`/brief?kind=${kindNow()}`); BR.err = ''; } catch (e) { BR.err = e.status === 404 ? '' : e.message; }
  await wxP;
  if (!KAL.K.ev && !KAL.K.busy) await KAL.kalLoad().catch(() => {});
  if (!hlData()?.news && !(Array.isArray(r?.news) && r.news.length) && !BR.rss) BR.rss = await hlApi('/rss?limit=3').then((x) => x?.items ?? []).catch(() => []);
  BR.d = norm(r); BR.t = Date.now(); BR.busy = false;
}
const brief = () => BR.d ?? norm(null);

/** Glimt-figuren: krem fjes i regnbuering, to øyne som blunker, kinn, rød munn, stjerne og vinkende arm. mood: idle|talk|point|wave */
export function figure(S0, mood = 'idle', lean = 0) {
  const ring = Math.max(2.5, S0 * 0.07);
  return `<span class="p34-fig ${mood}" style="--s:${S0}px;--gr:${lean}deg;--rw:${ring}px" aria-hidden="true">
    <span class="p34-star"><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5-.6-4.9-4.6-8.9-9.5-9.5v-2C7.4 10.4 11.4 6.4 12 1.5z" fill="#ff7a52"/></svg></span>
    <span class="p34-arm l"></span><span class="p34-arm r"></span><span class="p34-ring"></span>
    <span class="p34-face"><span class="p34-eye l"></span><span class="p34-eye r"></span><span class="p34-chk l"></span><span class="p34-chk r"></span><span class="p34-mouth"></span></span></span>`;
}
/** Hjem-kortet (widget h12): blått kort med «KVELDSBRIEF · GLIMT», oppsummering, chips og figuren. */
export function briefCard() {
  if (!BR.d && !BR.busy) briefLoad().then(draw).catch(() => {});
  const b = brief(), nx = b.ev[0];
  const chips = [b.wx.now != null ? `${b.wx.now}° ${b.wx.cond || ''}`.trim() : null, nx ? `${nx.title} ${evStart(nx)}` : 'Fri', b.news.length ? `${b.news.length} nyheter` : null].filter(Boolean);
  return `<a class="p34-bc" href="#/brief" aria-label="Åpne ${esc(b.title)}"><span class="p34-bct"><span class="p34-bck">${esc(b.title.toUpperCase())} · GLIMT</span><span class="p34-bcs">${esc(b.summary)}</span>
    <span class="p34-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</span></span>${figure(56)}</a>`;
}
// Guide-runden: [mål, tekst, knapp]
function guide(b) {
  const nx = b.ev[0], w = b.wx;
  return [[null, 'Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?', 'Vis meg'],
    ['vaer', `Først været. ${capF(w.cond || 'Været')}, ${w.now != null ? `${w.now}°` : ''} nå${w.rainSoon ? ` og ${w.rainSoon}` : ''}. Søylene viser nedbøren time for time.`, 'Neste'],
    ['kal', nx ? `I kalenderen: ${nx.title} ${nx.tomorrow ? 'i morgen' : 'i dag'} kl. ${evStart(nx)}. Trykk på en avtale for å åpne Kalender.` : 'Kalenderen din er fri.', 'Neste'],
    ['nyh', b.news.length ? 'Og saker fra nyhetene. Trykk for å lese hele.' : 'Ingen nyheter ennå. Legg til kilder i nyhetsleseren.', 'Neste'],
    [null, 'Det var alt for nå. Trykk på meg når du vil ha en ny runde.', 'Takk, Glimt']];
}
export function briefEnter(prev) {
  if (prev && prev !== 'brief') BR.from = prev;
  BR.step = 0; BR.tgt = null;
  // Første gang briefen åpnes starter guide-runden av seg selv (kan slås av med «Hopp over»).
  if (LS('fh_p34_tour') !== 'av' && LS('fh_p34_tour') !== 'sett') setTimeout(() => { if (m.screen === 'brief' && BR.step === 0) { BR.step = 1; LS('fh_p34_tour', 'sett'); draw(); } }, 900);
}
export function briefView() {
  const b = brief(), w = b.wx, G0 = guide(b), st = Math.max(0, Math.min(BR.step - 1, G0.length - 1)), cur = G0[st], tgt = BR.step > 0 && BR.step < 99 ? cur[0] : null, bub = BR.step > 0 && BR.step < 99;
  const mx = Math.max(0.6, ...w.rain12h), nx = b.ev[0];
  const kalNext = nx ? (nx.min != null && !nx.tomorrow ? (nx.min <= 0 ? 'PÅGÅR NÅ' : `NESTE OM ${nx.min < 60 ? `${nx.min} MIN` : `${Math.round(nx.min / 60)} T`}`) : `NESTE ${nx.tomorrow ? 'I MORGEN ' : ''}${evStart(nx)}`) : 'FRI';
  const ring = (k) => (tgt === k ? ' p34-on' : '');
  const notes = [w.vsYesterday ? ['Sammenlignet med i går', w.vsYesterday] : null, w.sunset ? ['Solnedgang', `Sola går ned ${w.sunset}`] : null].filter(Boolean);
  return `<div class="p34-br">
    <div class="p34-brh"><span class="p34-k">GLIMT · ${esc(b.title.toUpperCase())}</span><button type="button" class="p34-done" data-p34="brclose" data-p34back>Ferdig</button></div>
    <div class="p34-brt"><b>${esc(b.title)}</b><span>${esc(b.summary)}</span></div>
    <div class="p34-wx${ring('vaer')}" data-gb="vaer">
      <div class="p34-wxh"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${w.code === 'sol' ? '#ffd27a' : w.code === 'regn' ? '#9cc8ff' : '#e6eef7'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${WXP[w.code] ?? WXP.sky}"/></svg>
        <span class="m-grow"><b>${w.now != null ? `${w.now}°` : '–'}</b><span>${esc(w.place || 'Oslo')} · ${esc(w.cond || '')}</span></span><span class="p34-hilo">${w.hi != null ? `↑${w.hi}° ↓${w.lo}°` : ''}</span></div>
      ${w.rain12h.length ? `<div class="p34-rain">${w.rain12h.map((v) => `<span title="${String(v.toFixed(1)).replace('.', ',')} mm" style="height:${Math.max(6, (v / mx) * 100)}%;opacity:${v >= 0.2 ? 0.9 : 0.3}"></span>`).join('')}</div>
      <div class="p34-rl"><span>nå</span><span>nedbør neste 12 t</span><span>+12 t</span></div>` : ''}
      ${notes.length ? `<div class="p34-notes">${notes.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>` : ''}</div>
    <div class="p34-bcard${ring('kal')}" data-gb="kal"><span class="p34-bh"><b>Kalender</b><span>${esc(kalNext)}</span></span>
      ${b.ev.length ? b.ev.map((e) => `<button type="button" class="p34-ev" data-p34="brcal" data-k="${esc(e.k ?? '')}"><span class="p34-evt"><span>${esc(evStart(e) ?? '')}</span><span>${esc(e.day)}</span></span><i style="background:${esc(e.color)}"></i><span class="p34-evx"><b>${esc(e.title)}</b><span>${esc(e.loc || '')}</span></span></button>`).join('')
        : '<span class="p34-none">Ingen avtaler i dag eller i morgen.</span>'}</div>
    <div class="p34-bcard${ring('nyh')}" data-gb="nyh"><span class="p34-bh"><b>Nyheter</b></span>
      ${b.news.length ? b.news.map((n) => `<a class="p34-nw" href="${esc(n.url || '#/nyheter')}" target="_blank" rel="noopener"><span>${esc(String(n.source).slice(0, 4).toUpperCase())}</span><span class="p34-nwt">${esc(n.title)}</span><span>${esc(n.time)}</span></a>`).join('')
        : '<a class="p34-none" href="#/nyheter">Ingen nyheter ennå. Åpne nyhetsleseren ›</a>'}</div>
    <span class="p34-foot">Laget av Glimt ${esc(b.at)} · Vær: MET / Open-Meteo · Nyheter: ${esc([...new Set(b.news.map((n) => n.source).filter(Boolean))].join(', ') || 'Nyhetsleser')}</span>
    ${BR.err ? `<span class="p34-foot err">${esc(BR.err)}</span>` : ''}
  </div>
  <div class="p34-guide">${bub ? `<div class="p34-gb" role="status" aria-live="polite"><span>${esc(cur[1])}</span><span class="p34-gbb">${st < G0.length - 1 ? '<button type="button" data-p34="gskip">Hopp over</button>' : ''}<button type="button" class="ink" data-p34="gnext">${esc(cur[2])}</button></span></div>` : ''}
    <button type="button" class="p34-gf" data-p34="gtap" aria-label="Glimt – trykk for en runde">${figure(76, bub ? 'talk' : 'idle', tgt ? -8 : 0)}</button></div>`;
}
function scrollToGb(k) {
  const el = document.querySelector(`#app [data-gb="${k}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: Math.max(0, scrollY + r.top - 90), behavior: reduce() ? 'auto' : 'smooth' });
}
function gStep(n) {
  BR.step = n; haptic('tick');
  const G0 = guide(brief()), tgt = n > 0 && n < 99 ? G0[Math.min(n - 1, G0.length - 1)][0] : null;
  draw();
  if (tgt) setTimeout(() => scrollToGb(tgt), 60); else if (n >= 99 || n === G0.length) setTimeout(() => window.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' }), 60);
}

/* =====================================================================
   4. Innstillinger: mål-id, pulserende ring og boble
   ===================================================================== */
// Mål-id → hvor elementet står (side) og hvordan det finnes i DOM-en. data-hl settes etter hver tegning.
export const ANCHORS = {
  upd: { href: '#/nordlys', sel: '.n31-go, [data-p30="upopen"], [data-p30="upbig"]', tip: '✦ Trykk her for å oppdatere' },
  chk: { href: '#/nordlys', sel: '.n31-chk, [data-p30="upchk"]' },
  pw: { href: '#/nordlys', sel: '[data-p30="uptog"][data-k="require_password"]' },
  theme: { href: '#/set/tilpass', sel: '[data-sact="ppmode"]' }, // prompt 39: Tilpass
  bg: { href: '#/set/bakgrunn', sel: '.m-scroll .opt-row, .m-scroll .pp-card' },
  push: { href: '#/set/varsler', sel: '[data-p31="push"], [data-p31="pushon"], [data-p17="non"]' },
  quiet: { href: '#/set/varsler', sel: '[data-p17="nquiet"]' },
  haptic: { href: '#/set/hap', sel: '[data-stog="hap"]' },
  '2fa': { href: '#/set/sik', text: /Tofaktor|2FA for/ },
  'bk-auto': { href: '#/set/sysbk', text: /Automatisk backup/ },
  'bk-now': { href: '#/set/sysbk', text: /Ta backup nå/ },
  'cf-token': { href: '#/set/integ/cloudflare', sel: '#ig-cloudflare' },
  'ai-mod': { href: '#/aictl/mod', sel: '[data-hl="ai-mod"]' },
  'ai-key-gemini': { href: '#/aictl/api', sel: '[data-hl="ai-key-gemini"]' },
  'ai-sel': { href: '#/aictl/rt', sel: '[data-hl="ai-sel"]' },
  selftest: { href: '#/aictl/ov', sel: '[data-hl="selftest"]' },
};
function tagAnchors() {
  const app = document.getElementById('app'); if (!app) return;
  for (const [id, a] of Object.entries(ANCHORS)) {
    if (app.querySelector(`[data-hl="${id}"]`)) continue;
    let el = a.sel ? app.querySelector(a.sel) : null;
    if (!el && a.text) el = [...app.querySelectorAll('.m-scroll .opt-row, .m-scroll button, .m-scroll .p29-row, .m-scroll label')].find((x) => a.text.test(x.textContent));
    if (el) el.setAttribute('data-hl', id);
  }
}
const RING = { el: null, tip: null, t: null, sel: null, until: 0 };
function ringOff() {
  clearTimeout(RING.t);
  RING.el?.classList.remove('p34-hl'); RING.tip?.remove();
  RING.el = null; RING.tip = null; RING.sel = null; RING.until = 0;
}
/** Markerer et element: scroller det midt i innholdet (scrollTo, ikke scrollIntoView), rød pulserende ring i 6 s. */
export function ring(el, tip, sel = null) {
  if (!el) return false;
  ringOff();
  RING.sel = sel; RING.until = Date.now() + 6000;
  const fixed = getComputedStyle(el).position === 'fixed' || !!el.closest('.n31-bot, .pp-nav');
  if (!fixed) { const r = el.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, scrollY + r.top - innerHeight / 2 + r.height / 2), behavior: reduce() ? 'auto' : 'smooth' }); }
  el.classList.add('p34-hl'); RING.el = el; haptic('tick');
  if (tip) {
    const t = document.createElement('div'); t.className = 'p34-tip'; t.setAttribute('role', 'status'); t.textContent = tip;
    document.body.appendChild(t); RING.tip = t;
    const place = () => { if (!RING.el || !t.isConnected) return; const r = RING.el.getBoundingClientRect(); t.style.left = `${Math.max(12, Math.min(innerWidth - t.offsetWidth - 12, r.left + r.width / 2 - t.offsetWidth / 2))}px`; t.style.top = `${Math.max(8, r.top - t.offsetHeight - 12)}px`; };
    place(); setTimeout(place, 420); setTimeout(place, 900);
  }
  RING.t = setTimeout(ringOff, 6000);
  return true;
}
/** Finner målet (mål-id eller selektor) på siden og markerer det. Brukes av goSet i mobile-p25.js. */
export function ringSel(sel) {
  tagAnchors();
  const id = /^\[data-hl="([^"]+)"\]$/.exec(sel)?.[1];
  const el = document.querySelector(`#app .m-scroll ${sel}`) ?? (id ? document.querySelector(`#app ${sel}`) : null);
  return el ? ring(el, id ? ANCHORS[id]?.tip : null, sel) : false;
}
export const findSel = (sel) => { tagAnchors(); const id = /^\[data-hl="/.test(sel); return document.querySelector(`#app .m-scroll ${sel}`) ?? (id ? document.querySelector(`#app ${sel}`) : null); };

/* =====================================================================
   5. Tydelige AI-feil (Glimt-boblen)
   ===================================================================== */
/** «Glimt fikk ikke svar fra {modell}: {feil}». Serveren kan sende {error, model}; ellers brukes feilteksten. */
export function aiErrText(e, model) {
  const msg = String(e?.message ?? e ?? 'ukjent feil').replace(/^Homelab svarte /, 'serveren svarte ');
  if (/^Glimt fikk ikke svar/.test(msg)) return msg;
  return `Glimt fikk ikke svar fra ${model || e?.model || 'modellen'}: ${msg}`;
}
export const errButtons = (q) => `<span class="p34-eb"><button type="button" data-p34="airetry" data-q="${esc(q ?? '')}">Prøv igjen</button><a href="#/aictl/ov" data-p34="aiopen">Åpne AI-kontroll</a></span>`;

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
export function afterDraw34() {
  watchDone();
  rcAiPoll();
  tagAnchors();
  // Siden tegnes på nytt når data kommer inn: markeringen flyttes til det nye elementet.
  if (RING.sel && RING.until > Date.now() && (!RING.el || !RING.el.isConnected)) { const el = findSel(RING.sel); if (el) { el.classList.add('p34-hl'); RING.el = el; } }
}
export async function bind34(e, t) {
  const x = t.closest?.('[data-p34]');
  if (!x) return false;
  const k = x.dataset.p34;
  switch (k) {
    case 'kvchat': { e.preventDefault(); haptic('tap'); const CHAT = await import('./mobile-chat.js'), j = aiJobs().find((y) => String(y.id) === x.dataset.id); if (j?.chatId) CHAT.openChatId(j.chatId); else CHAT.openScanChat({ receiptId: x.dataset.id }); return true; }
    case 'kvstop': e.preventDefault(); await kvStop(x.dataset.id); return true;
    case 'brclose': e.preventDefault(); location.hash = `#/${BR.from && BR.from !== 'brief' ? BR.from : startScr()}`; return true;
    case 'brcal': { e.preventDefault(); haptic('tap'); const kd = x.dataset.k; if (kd) KAL.kalShowDay(kd); else location.hash = '#/kal'; return true; }
    case 'gnext': { e.preventDefault(); const n = guide(brief()).length; gStep(BR.step >= n ? 99 : BR.step + 1); return true; }
    case 'gskip': e.preventDefault(); LS('fh_p34_tour', 'av'); gStep(99); return true;
    case 'gtap': e.preventDefault(); gStep(BR.step > 0 && BR.step < 99 ? 99 : 1); return true;
    case 'airetry': { e.preventDefault(); haptic('tap'); const P31 = await import('./mobile-p31.js'); P31.ask(x.dataset.q || ''); return true; }
    case 'aiopen': return false; // vanlig lenke til #/aictl/ov
    default: return false;
  }
}
