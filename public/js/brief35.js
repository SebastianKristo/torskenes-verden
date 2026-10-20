// Prompt 35 (WEB35): Glimt-brief på web (fasit Homelab Papir Web.dc.html + Glimt Brief.dc.html, claude-code-glimt-brief.md → Web).
// - Kortet (mode="card") rett under søkefeltet på Dashboard: blått, «KVELDSBRIEF · GLIMT», oppsummering, chips og vertsfiguren.
// - Panelet glir inn fra høyre (min(520px, 100%), 0,34 s) med dempet bakteppe. Esc og bakteppet lukker.
//   Innhold: vær (nedbør 12 t), kalender, prøveperioder (Gris), nyheter med bilder (toppsak + 6), guide-runde med Glimt og venner,
//   opplesning via /api/tts (bare etter et trykk), ⚙ innstillinger og Ferdig.
// Data: GET /api/brief?kind=morning|day|evening|night (news[].image/lead, trials[], guide[{k,char,target,text,textEn,action}], host).
//   Mangler nyheter i briefen, brukes /api/rss. POST /api/brief/trials/:id/done markerer en prøve som avsluttet.
import { api, esc, p2 } from './util.js';
import { fig, hostFor, WHO, NAME_COLOR } from './glimt-figs.js';
import { gs, loadGlimt, saveGlimt, say, stopSpeak, onSpeak, tts, replayAfterTap, voiceName, glimtSettingsHtml, glimtClick, glimtChange, glimtSubmit } from './glimt35.js';
import { outfit } from './glimt-outfits36.js'; // prompt 38: Glimt i prestedrakt ved bibelvers
import { briefCards38, cardOrder38, giftAdd38 } from './brief38.js'; // prompt 38: Pakker, Familie, Skole og jobb, Bursdager, Nordlys

const FONTS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
/** Papir-fontene (Newsreader, Manrope, IBM Plex Mono) lastes også i det mørke temaet, for kortet og panelet. */
export function ensureFonts() {
  if (document.querySelector('link[data-hl-fonts]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; l.dataset.hlFonts = ''; document.head.appendChild(l);
}
const KINDS = { morning: 'Morgenbrief', day: 'Dagsbrief', evening: 'Kveldsbrief', night: 'Nattbrief' };
const B = { data: null, kind: null, at: 0, loading: null, err: '', rss: null, doneTr: new Set() };

/** Hvilken brief som gjelder nå: den siste valgte som har vært (ellers etter tiden på døgnet). */
export function briefKind(d = new Date()) {
  const s = gs(), nm = d.getHours() * 60 + d.getMinutes();
  const on = Object.entries(s.briefs).filter(([, b]) => b.on).map(([k, b]) => [k, +b.at.slice(0, 2) * 60 + +b.at.slice(3, 5)]).sort((a, b) => a[1] - b[1]);
  if (on.length) { const past = on.filter(([, m]) => m <= nm); return (past.length ? past[past.length - 1] : on[on.length - 1])[0]; }
  const h = d.getHours();
  return h < 11 ? 'morning' : h < 17 ? 'day' : 'evening';
}

function loadBrief(force = false) {
  const kind = briefKind();
  if (B.loading) return B.loading;
  if (!force && B.data && B.kind === kind && Date.now() - B.at < 10 * 60_000) return Promise.resolve(B.data);
  B.loading = api(`/brief?kind=${kind}`).catch((e) => (kind === 'night' && e.status === 400 ? api('/brief?kind=evening') : Promise.reject(e)))
    .then((d) => { B.data = d; B.kind = kind; B.at = Date.now(); B.err = ''; return d; })
    .catch((e) => { B.err = e.message; return B.data; })
    .finally(() => { B.loading = null; paintCards(); if (P.open) paintPanel(); });
  // Nyheter med bilder: /api/rss når briefen ikke har egne.
  if (!B.rss) api('/rss?limit=12').then((r) => { B.rss = (r.items ?? []).slice(0, 12); if (P.open) paintPanel(); }).catch(() => { B.rss = []; });
  return B.loading;
}

/* ---------- Data → visning ---------- */

const WXP = { sol: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', delvis: 'M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M5.4 10.4A3 3 0 1 1 10.8 7.2M9 20h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13.4A3.3 3.3 0 0 0 9 20z', sky: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1A3.5 3.5 0 0 0 7 18z', regn: 'M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3', sno: 'M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01' };
const ICK = { clear: 'sol', partly: 'delvis', cloudy: 'sky', fog: 'sky', drizzle: 'regn', rain: 'regn', thunder: 'regn', sleet: 'sno', snow: 'sno' };
const lc = (s) => String(s ?? '').toLowerCase();
const capF = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());

function view() {
  const d = B.data ?? {}, s = gs(), now = new Date();
  const kind = d.kind ?? B.kind ?? briefKind(), title = d.title ?? KINDS[kind] ?? 'Brief';
  const W = d.weather, wk = ICK[W?.now?.icon] ?? 'delvis';
  const rain = (W?.rain12h ?? []).slice(0, 12), mx = Math.max(0.6, ...rain.map((r) => +r.mm || 0));
  const wet = !!W && (/regn|snø|sludd|yr/i.test(W?.now?.cond ?? '') || ['rain', 'drizzle', 'sleet', 'snow', 'thunder'].includes(W?.now?.icon) || (!!W.rainFrom && !!W.umbrella));
  const rainSoon = !W ? '' : W.rainFrom ? (rain[0] && (+rain[0].mm || 0) >= 0.2 ? 'regn nå' : `regn fra ca. ${String(W.rainFrom).slice(0, 2).replace(/^0(?=\d)/, '')}`) : 'oppholdsvær de neste 12 timene';
  const wx = W ? {
    t: `${Math.round(W.now?.temp ?? 0)}°`, txt: lc(W.now?.cond ?? W.cond), hi: W.hi != null ? `${Math.round(W.hi)}°` : '–', lo: W.lo != null ? `${Math.round(W.lo)}°` : '–', place: W.place || 'Oslo',
    ic: WXP[wk], col: wk === 'sol' ? '#ffd27a' : wk === 'regn' ? '#9cc8ff' : '#e6eef7',
    rain: rain.map((r) => { const v = +r.mm || 0; return { h: Math.max(6, (v / mx) * 100), o: v >= 0.2 ? 0.9 : 0.3, tt: `${r.h ?? ''}: ${v.toFixed(1)} mm${r.prob != null ? ` · ${r.prob} %` : ''}` }; }),
    notes: [W.vsYesterday?.text ? ['Sammenlignet med i går', capF(W.vsYesterday.text)] : null, W.sunset ? ['Solnedgang', `Sola går ned ${W.sunset}`] : null].filter(Boolean),
  } : null;
  const ev = (d.events ?? []).slice(0, 3), nx = d.next ?? null;
  const tr = (d.trials ?? []).filter((t) => !B.doneTr.has(String(t.id))).slice(0, 3);
  let news = (d.news ?? []).map((n) => ({ s: n.source ?? n.src ?? '', t: n.title, u: n.url, img: n.image ?? null, d: n.lead ?? n.excerpt ?? '', tm: n.timeLabel ?? tmOf(n.published) }));
  if (news.length < 3 && B.rss?.length) news = B.rss.map((n) => ({ s: n.feed ?? '', t: n.title, u: n.url, img: n.image ?? null, d: n.excerpt ?? '', tm: tmOf(n.published) }));
  news = news.slice(0, 7);
  const host = hostFor(s.char, now); // samme regel som serveren (Glimt → Natt 21–06), men følger valget med en gang
  return { d, kind, title, wx, wet, rainSoon, ev, nx, tr, news, host, summary: d.summary ?? '', chips: d.chips ?? [] };
}
const tmOf = (t) => { if (!t) return ''; const x = new Date(t); return isNaN(x) ? '' : `${p2(x.getHours())}:${p2(x.getMinutes())}`; };

/* ---------- Guide-runden (Glimt og venner) ---------- */

const TGT = { weather: 'vaer', vaer: 'vaer', calendar: 'kal', kal: 'kal', kalender: 'kal', news: 'nyh', nyh: 'nyh', trials: 'abo', trial: 'abo', abo: 'abo', subscriptions: 'abo' };
function guide(v) {
  const s = gs(), en = s.tts.lang === 'en', host = v.host, srv = v.d.guide ?? v.d.figure?.guide;
  let G;
  if (Array.isArray(srv) && srv.length && srv.every((x) => x.char)) {
    const sh = v.d.host ?? 'glimt';
    G = srv.map((x, i) => [TGT[x.target] ?? null, (en && x.textEn) || x.text, (en && x.actionEn) || x.action || (i === srv.length - 1 ? (en ? 'Thanks, Glimt' : 'Takk, Glimt') : (en ? 'Next' : 'Neste')), x.char === sh || x.char === 'glimt' || x.char === 'natt' ? host : x.char]);
  } else G = localGuide(v, en);
  if (!s.friends) G = G.map((x) => [x[0], en ? x[1] : x[1].replace(/^Hei, det er (Sky|Dråpe)! /, 'Været: ').replace(/^(Og Sky her|Sky her igjen): /, '').replace(/ Nå (gir vi ordet tilbake til Glimt|tar Glimt over)!/, '').replace(/^Uhu, Ugle her med kalenderen\. /, 'I kalenderen: ').replace(/^Nøff! Gris her\. /, '').replace(/^Glimt igjen! /, ''), x[2].replace(/^Takk, (Sky|Dråpe|Gris)$/, 'Neste'), host]);
  return G;
}
function localGuide(v, en) {
  const { wx, wet, nx, tr, host, rainSoon } = v, T1 = tr[0], wch = wet ? 'drape' : 'sky', wn = wet ? 'Dråpe' : 'Sky';
  const nxt = nx ? `${nx.title} ${/^I MORGEN/i.test(nx.label ?? '') ? 'i morgen' : 'i dag'} kl. ${nx.time ?? ''}` : '';
  if (en) {
    const wEn = { klart: 'clear', lettskyet: 'partly cloudy', 'delvis skyet': 'partly cloudy', skyet: 'cloudy', regn: 'rain', snø: 'snow' }[wx?.txt] ?? wx?.txt ?? '';
    const rEn = /oppholdsvær/.test(rainSoon) ? 'dry for the next 12 hours' : rainSoon === 'regn nå' ? 'raining now' : `rain from about ${rainSoon.replace(/\D+/g, '')}:00`;
    return [[null, "Hi! I'm Glimt. Shall I show you your day? My friends will help.", 'Show me', host],
      ...(wx ? [['vaer', `Hi, it's ${wet ? 'Drop' : 'Sky'}! ${capF(wEn)}, ${wx.t} right now, and ${rEn}.${wet ? " I'm dripping a bit, so bring an umbrella!" : ' The bars show rain hour by hour.'}`, `Thanks, ${wet ? 'Drop' : 'Sky'}`, wch]] : []),
      ...(wx && !wet && wx.notes[1] ? [['vaer', `Sky again: ${wx.notes[1][1].replace(/^Sola går ned/, 'the sun sets at')}. Back to Glimt!`, 'Next', 'sky']] : []),
      ['kal', `Hoo, Owl here with your calendar. ${nx ? `${nx.title} ${/^I MORGEN/i.test(nx.label ?? '') ? 'tomorrow' : 'today'} at ${nx.time ?? ''}. Tap an event to open Calendar.` : 'Your calendar is completely free.'}`, 'Next', 'ugle'],
      ...(T1 && T1.daysLeft <= 7 ? [['abo', `Oink! Piggy here. Your ${T1.service} trial ends ${T1.daysLeft === 0 ? 'today' : T1.daysLeft === 1 ? 'tomorrow' : `in ${T1.daysLeft} days`}. Remember to cancel it${T1.priceLabel ? `, or it will cost ${T1.priceLabel}` : ''}.`, 'Thanks, Piggy', 'gris']] : []),
      ...(v.news.length ? [['nyh', 'Glimt again! Here are the top stories. Tap to read more.', 'Next', host]] : []),
      [null, "That's all for now. Tap me whenever you want another round.", 'Thanks, Glimt', host]];
  }
  return [[null, 'Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din? Vennene mine hjelper til.', 'Vis meg', host],
    ...(wx ? [['vaer', `Hei, det er ${wn}! ${capF(wx.txt)}, ${wx.t} nå og ${rainSoon}.${wet ? ' Jeg drypper litt, så ta med paraply!' : ' Søylene viser nedbøren time for time.'}`, `Takk, ${wn}`, wch]] : []),
    ...(wx && !wet && wx.notes.find((n) => n[0] === 'Solnedgang') ? [['vaer', `Sky her igjen: ${lc(wx.notes.find((n) => n[0] === 'Solnedgang')[1])}. Nå tar Glimt over!`, 'Neste', 'sky']] : []),
    ['kal', `Uhu, Ugle her med kalenderen. ${nx ? `${nxt}. Trykk på en avtale for å åpne Kalender.` : 'Kalenderen din er helt fri.'}`, 'Neste', 'ugle'],
    ...(T1 && T1.daysLeft <= 7 ? [['abo', `Nøff! Gris her. Prøveperioden på ${T1.service} slutter ${T1.daysLeft === 0 ? 'i dag' : T1.daysLeft === 1 ? 'i morgen' : `om ${T1.daysLeft} dager`}. Husk å avslutte den før ${T1.endsLabel ?? 'den slutter'}${T1.priceLabel ? `, ellers koster den ${T1.priceLabel.replace('kr/mnd', 'kroner i måneden')}` : ''}.`, 'Takk, Gris', 'gris']] : []),
    ...(v.news.length ? [['nyh', 'Glimt igjen! Her er de viktigste nyhetene. Trykk for å lese hele.', 'Neste', host]] : []),
    [null, 'Det var alt for nå. Trykk på meg når du vil ha en ny runde.', 'Takk, Glimt', host]];
}

/* ---------- Kortet på Dashboard ---------- */

/** Plassholderen som Dashboard legger under søkefeltet. Fylles når briefen er hentet. */
export function briefCardSlot() {
  loadGlimt();
  if (!gs().brief) return '';
  ensureFonts();
  queueMicrotask(() => { loadBrief(); paintCards(); });
  return `<div class="gb-slot" data-gb-card>${cardHtml()}</div>`;
}
/** Prompt 39 (claude-code-brief-glimt-av.md): «Glimt i briefen» av = ingen figur, bobler eller automatisk guide-runde. */
const figOn = () => gs().briefGlimt !== false && (gs().briefGlimt === true || (() => { try { return localStorage.getItem('glimt_brief_fig') !== '0'; } catch { return true; } })());
document.addEventListener('glimt-cfg', () => { paintCards(); if (P.open) paintPanel(); });
window.addEventListener('storage', (e) => { if (e.key === 'glimt_brief_fig') { paintCards(); if (P.open) paintPanel(); } });
function cardHtml() {
  if (!B.data) return B.err ? '' : `<div class="gb-card gb-skel" aria-hidden="true"><span></span><span></span><span></span></div>`;
  const v = view(), kick = v.title.toUpperCase();
  const chips = v.chips.length ? v.chips : [v.wx ? `${v.wx.t} ${v.wx.txt}` : null, v.nx ? `${v.nx.title} ${v.nx.time ?? ''}` : 'Fri', v.news.length ? `${Math.min(3, v.news.length)} nyheter` : null].filter(Boolean);
  if (v.tr.length && !chips.some((c) => /prøve/i.test(c))) chips.push(`${v.tr[0].service} · ${v.tr[0].daysLeft} d igjen`);
  return `<button type="button" class="gb-card" data-gb-open aria-label="Åpne ${esc(v.title)}"><span class="gb-cl"><span class="gb-ck">${esc(kick)} · GLIMT</span><span class="gb-cs">${esc(v.summary)}</span><span class="gb-cc">${chips.slice(0, 4).map((c) => `<span>${esc(c)}</span>`).join('')}</span></span>${figOn() ? `<span class="gb-cf">${fig(v.host, 56, 'idle')}</span>` : ''}</button>`;
}
/* Prompt 38 (Hjem web 1c, claude-code-hjem-web-topp-1c.md): briefen som glasspanel i helten under hilsenen.
   Glimt-figur 44 px, «KVELDSBRIEF · GLIMT» + «Åpne ›», oppsummering (Newsreader 18/1.42, maks 3 linjer) og chips. */
export function briefGlassSlot() {
  loadGlimt();
  if (!gs().brief) return '';
  ensureFonts();
  queueMicrotask(() => { loadBrief(); paintCards(); });
  return `<div class="gb38-gslot" data-gb-card="glass">${glassHtml()}</div>`;
}
function glassHtml() {
  if (!B.data) return B.err ? '' : '<div class="gb38-glass gb38-skel" aria-hidden="true"><span></span><span></span></div>';
  const v = view(), kick = v.title.toUpperCase();
  const chips = v.chips.length ? v.chips : [v.wx ? `${v.wx.t} ${v.wx.txt}` : null, v.nx ? `${v.nx.title} ${v.nx.time ?? ''}` : 'Fri', v.news.length ? `${Math.min(7, v.news.length)} nyheter` : null].filter(Boolean);
  if (v.tr.length && !chips.some((c) => /prøve/i.test(c))) chips.push(`${v.tr[0].service}-prøve ${v.tr[0].daysLeft} dager igjen`);
  return `<button type="button" class="gb38-glass" data-gb-open aria-label="Åpne ${esc(v.title)}">${figOn() ? `<span class="gb38-gf">${fig(v.host, 44, 'idle')}</span>` : ''}<span class="gb38-gm"><span class="gb38-gk"><span>${esc(kick)} · GLIMT</span><span class="gb38-go">Åpne ›</span></span><span class="gb38-gs">${esc(v.summary)}</span><span class="gb38-gc">${chips.slice(0, 4).map((c) => `<span>${esc(c)}</span>`).join('')}</span></span></button>`;
}
function paintCards() {
  document.querySelectorAll('[data-gb-card]').forEach((el) => { el.hidden = !gs().brief || (!B.data && !!B.err); el.innerHTML = el.dataset.gbCard === 'glass' ? glassHtml() : cardHtml(); });
}

/* ---------- Panelet ---------- */

const P = { open: false, el: null, step: 0, cfg: false, lastT: null, said: null, lastCh: null, tour0: null, tapped: false, scrollTop: 0 };

export function openBrief({ tapped = true } = {}) {
  if (P.open) return;
  ensureFonts();
  P.open = true; P.step = 0; P.cfg = false; P.lastT = null; P.said = null; P.lastCh = null; P.tapped = tapped;
  const el = document.createElement('div');
  el.className = 'gb-layer';
  el.innerHTML = `<div class="gb-back" data-gb-close></div><aside class="gb-panel" role="dialog" aria-modal="true" aria-label="Glimt-brief"><div class="gb-in"></div></aside>`;
  document.body.appendChild(el);
  document.body.classList.add('gb-open');
  P.el = el;
  bindPanel(el);
  paintPanel();
  loadBrief().then(() => {
    // Guide-runden starter automatisk første gang denne briefen åpnes i dag (kan slås av).
    const key = `gb_tour_${new Date().toLocaleDateString('sv-SE')}_${B.kind}`;
    let seen = false; try { seen = !!localStorage.getItem(key); } catch { /* */ }
    if (gs().guide && figOn() && !seen) P.tour0 = setTimeout(() => { if (P.open && P.step === 0) { try { localStorage.setItem(key, '1'); } catch { /* */ } P.step = 1; paintPanel(); } }, 900);
  });
  el.querySelector('.gb-panel').focus?.();
}
export function closeBrief() {
  if (!P.open) return;
  P.open = false; clearTimeout(P.tour0); stopSpeak();
  const el = P.el; P.el = null;
  document.body.classList.remove('gb-open');
  el.classList.add('out');
  setTimeout(() => el.remove(), 260);
}

function paintPanel() {
  if (!P.el) return;
  const box = P.el.querySelector('.gb-in'), sc = box.querySelector('.gb-sc');
  if (sc) P.scrollTop = sc.scrollTop;
  box.innerHTML = panelHtml();
  const nsc = box.querySelector('.gb-sc');
  if (nsc) nsc.scrollTop = P.scrollTop;
  const sheet = box.querySelector('.gb-sheet .gs');
  if (sheet && P.sheetTop) sheet.parentElement.scrollTop = P.sheetTop;
  scrollToTarget();
}

function panelHtml() {
  const s = gs();
  if (!B.data) {
    return `${headHtml('Brief')}<div class="gb-sc"><div class="gb-pad">${B.err ? `<div class="gb-err">Fikk ikke hentet briefen: ${esc(B.err)} <button type="button" class="gs-pill" data-gb-retry>Prøv igjen</button></div>` : '<div class="gb-skelp"><span></span><span></span><span></span></div>'}</div></div>`;
  }
  const v = view(), G = guide(v), bubble = P.step > 0 && P.step < 99, st = bubble ? Math.min(P.step, G.length) - 1 : 0, cur = G[st], tgt = bubble ? cur[0] : null;
  const ch = bubble ? (s.friends ? cur[3] : null) || v.host : v.host;
  if (bubble && P.said !== P.step) { P.said = P.step; const t = cur[1]; setTimeout(() => { if (P.open && P.tapped) say(t, ch); }, 80); }
  P.target = tgt;
  const ring = (k) => (tgt === k ? ' gb-ring' : '');
  const h = new Date().getHours(), mood = bubble ? 'talk' : h >= 23 || h < 6 ? 'sov' : 'idle';
  const pop = P.lastCh !== ch; P.lastCh = ch;
  const wx = v.wx;
  // Prompt 37: hele Vær-kortet er trykkbart og åpner Vær i fullskjerm; ✕ der går tilbake til briefen på samme sted.
  const vaer = wx ? `<section data-gb="vaer" class="gb-wx gb37-tap${ring('vaer')}" role="button" tabindex="0" aria-label="Åpne Vær">
      <div class="gb-wx1"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${wx.col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${wx.ic}"/></svg><span class="gb-wxt"><b>${esc(wx.t)}</b><span>${esc(wx.place)} · ${esc(wx.txt)}</span></span><span class="gb-hl">↑${esc(wx.hi)} ↓${esc(wx.lo)}</span></div>
      ${wx.rain.length ? `<div class="gb-rain">${wx.rain.map((r) => `<span title="${esc(r.tt)}" style="height:${r.h.toFixed(0)}%;background:rgba(255,255,255,${r.o})"></span>`).join('')}</div><div class="gb-rl"><span>nå</span><span>nedbør neste 12 t</span><span>+12 t</span></div>` : ''}
      ${wx.notes.length ? `<div class="gb-notes">${wx.notes.map(([k, val]) => `<span><span>${esc(k)}</span><b>${esc(val)}</b></span>`).join('')}</div>` : ''}</section>` : '';
  const kal = `<section data-gb="kal" class="gb-box${ring('kal')}"><span class="gb-bh"><b>Kalender</b><span class="gb-mono red">${esc(v.nx?.label ?? (v.ev.length ? '' : 'FRI'))}</span></span>
      ${v.ev.length ? v.ev.map((e) => `<button type="button" class="gb-ev" data-gb-ev="${esc(e.date ?? '')}"><span class="gb-evt"><span>${esc(e.time ?? '')}</span><span>${esc(lc(e.day ?? ''))}</span></span><span class="gb-evc" style="background:${esc(e.color || '#3d7f8a')}"></span><span class="gb-evn"><b>${esc(e.title)}</b><span>${esc(e.place ?? '')}</span></span></button>`).join('') : '<span class="gb-mute">Ingen avtaler i dag eller i morgen.</span>'}</section>`;
  const T1 = v.tr[0];
  const abo = v.tr.length ? `<section data-gb="abo" class="gb-abo${ring('abo')}"><span class="gb-bh"><b>Abonnementer</b><span class="gb-mono red">${T1.daysLeft <= 2 ? 'AVSLUTT SNART' : 'PRØVEPERIODER'}</span></span>
      ${v.tr.map((t) => { const c = t.daysLeft <= 2 ? '#b23a2a' : t.daysLeft <= 7 ? '#a8661a' : '#1b1a17', pc = Math.min(100, Math.max(6, Math.round((t.progress ?? 0.5) * (t.progress > 1 ? 1 : 100)))); return `<div class="gb-tr"><span class="gb-trl">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" data-gb-img>` : ''}<i>${esc(String(t.service ?? '?').slice(0, 1))}</i></span><span class="gb-trm"><b>${esc(t.service)}</b><span>Prøve · avslutt før ${esc(t.endsLabel ?? '')}${t.priceLabel ? ` · deretter ${esc(t.priceLabel)}` : ''}</span><span class="gb-bar"><span style="width:${pc}%;background:${c}"></span></span></span><span class="gb-trd"><b style="color:${c}">${t.daysLeft}</b><span>${t.daysLeft === 1 ? 'dag igjen' : 'dager igjen'}</span></span></div>`; }).join('')}
      <div class="gb-trb"><button type="button" class="gs-pill dark" data-gb-trdone="${esc(T1.id)}">✓ Jeg har avsluttet ${esc(T1.service)}</button>${T1.cancelUrl ? `<a class="gs-pill" href="${esc(T1.cancelUrl)}" target="_blank" rel="noopener">Avslutt nå ↗</a>` : ''}<a class="gs-pill" href="/finans/#/sub">Åpne Abonnement ›</a></div></section>` : '';
  const top = v.news[0];
  const nyh = v.news.length ? `<section data-gb="nyh" class="gb-box${ring('nyh')}"><span class="gb40-nh"><b class="gb-bt">Nyheter</b><button type="button" class="gb40-gl" data-gb40-glimt>✦ Glimt-sammendrag ›</button></span>
      <a class="gb-top" href="${esc(top.u)}" target="_blank" rel="noopener"><span class="gb-img16">${imgTag(top.img)}</span><span class="gb-src"><span class="red">${esc(top.s)}</span><span>${esc(top.tm)}</span></span><b>${esc(top.t)}</b>${top.d ? `<span class="gb-lead">${esc(top.d)}</span>` : ''}</a>
      ${v.news.slice(1).map((n) => `<a class="gb-nw" href="${esc(n.u)}" target="_blank" rel="noopener"><span class="gb-th">${imgTag(n.img)}</span><span class="gb-nwm"><span class="gb-src"><span class="red">${esc(n.s)}</span><span>${esc(n.tm)}</span></span><span class="gb-nwt">${esc(n.t)}</span></span></a>`).join('')}</section>` : '';
  const mins = new Date(v.d.generatedAt ?? Date.now());
  const foot = v.d.footer ?? `Laget av Glimt ${p2(mins.getHours())}:${p2(mins.getMinutes())}`;
  const bub = bubble ? `<div class="gb-bub" role="status"><span class="gb-who" style="color:${NAME_COLOR[ch] ?? '#ffc7b8'}">${esc(WHO[ch] ?? 'GLIMT')}</span><span class="gb-bt2">${esc(cur[1])}</span><span class="gb-bbtn">${st > 0 && st < G.length - 1 ? '<button type="button" class="skip" data-gb-skip>Hopp over</button>' : ''}<button type="button" class="next" data-gb-next>${esc(cur[2])}</button></span></div>` : '';
  return `${headHtml(v.title)}
    <div class="gb-sc"><div class="gb-pad">
      <div class="gb-spkw">${spkHtml()}</div>
      <div class="gb-title gb38-sum"><span>${esc(v.summary)}</span></div>
      ${cardOrder38({ cards: gs().cards ?? B.data?.cards }, { vaer, bibel: bibleHtml('top'), huske: todosHtml(v), kal, abo, ...briefCards38(B.data), nyh })}${bibleHtml('bottom')}
      <span class="gb-foot">${esc(foot)}</span>
    </div></div>
    ${figOn() ? `<div class="gb-guide">${bub}<button type="button" class="gb-figbtn" data-gb-fig aria-label="${bubble ? 'Avslutt guide-runden' : 'Start guide-runden med Glimt'}">${pop ? `<span class="gf-pop">${fig(ch, 82, mood)}</span>` : fig(ch, 82, mood)}</button></div>` : ''}
    ${P.cfg ? `<div class="gb-sback" data-gb-cfgclose></div><div class="gb-sheet" role="dialog" aria-label="Brief-innstillinger"><span class="gb-grab"></span><div class="gb-sh"><b>Glimt-brief</b><button type="button" class="gs-pill dark" data-gb-cfgclose>Ferdig</button></div>${glimtSettingsHtml()}</div>` : ''}`;
}
function spkHtml() {
  const s = gs();
  if (tts.speaking) return `<div class="gb-spk"><span class="gb-bars">${[0.42, 0.3, 0.5, 0.36].map((d) => `<i style="animation-duration:${d}s"></i>`).join('')}</span>${esc(capF(lc(WHO[tts.who] ?? 'GLIMT')))} snakker · ${esc(voiceName(s.tts.voice))}<button type="button" data-gb-stop>Stopp</button></div>`;
  if (tts.needTap || (s.readAloud && !P.tapped)) return '<button type="button" class="gb-spk tap" data-gb-tap>🔊 Trykk for å høre Glimt</button>';
  return '';
}
function headHtml(title) {
  // Prompt 38: 🔇 og ⚙ er fjernet (opplesning og brief-valg ligger i Innstillinger → Glimt). Tittelen og Ferdig på samme linje.
  return `<div class="gb-head gb38-head" aria-label="${esc(title)}"><b class="gb38-ht">${esc(title)}</b><button type="button" class="gb-done" data-gb-close>Ferdig</button></div>`;
}
const imgTag = (u) => (u && /^(https?:\/\/|\/)/.test(u) ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-gb-img>` : '');

function scrollToTarget() {
  const t = P.target;
  if (!t || P.lastT === t) { if (!t) P.lastT = null; return; }
  P.lastT = t;
  setTimeout(() => {
    const M = P.el?.querySelector('.gb-sc'), el = M?.querySelector(`[data-gb="${t}"]`);
    if (M && el) { const a = el.getBoundingClientRect(), b = M.getBoundingClientRect(); M.scrollTo({ top: M.scrollTop + a.top - b.top - 90, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    try { navigator.vibrate?.(6); } catch { /* */ }
  }, 60);
}

function bindPanel(el) {
  el.addEventListener('pointerdown', () => { if (!P.tapped) { P.tapped = true; } }, true);
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (P.cfg && t.closest('.gb-sheet') && glimtClick(e, () => { P.sheetTop = el.querySelector('.gb-sheet')?.scrollTop ?? 0; paintPanel(); paintCards(); })) return;
    if (t.closest('[data-gb-close]')) { try { navigator.vibrate?.(8); } catch { /* */ } closeBrief(); return; }
    // Prompt 40: «✦ Glimt-sammendrag ›» lukker briefen og åpner Nyhetsleseren rett på Glimt-siden.
    if (t.closest('[data-gb40-glimt]')) { e.preventDefault?.(); closeBrief(); import('./news.js').then((m) => m.openNews({ glimt: true })).catch(() => {}); return; }
    if (t.closest('[data-gb-cfgclose]')) { P.cfg = false; P.sheetTop = 0; paintPanel(); return; }
    if (t.closest('[data-gb-cfg]')) { P.cfg = true; P.sheetTop = 0; paintPanel(); loadGlimt(() => { if (P.cfg) paintPanel(); }, true); return; }
    if (t.closest('[data-gb-retry]')) { loadBrief(true); paintPanel(); return; }
    if (t.closest('[data-gb-voice]')) {
      const on = !gs().readAloud; saveGlimt({ readAloud: on });
      if (!on) stopSpeak(); else say(gs().tts.lang === 'en' ? 'Sound is on. I will read the brief for you.' : 'Lyden er på. Jeg leser briefen for deg.', view().host, { force: true });
      paintPanel(); return;
    }
    if (t.closest('[data-gb-stop]')) { stopSpeak(); paintPanel(); return; }
    if (t.closest('[data-gb-tap]')) { P.tapped = true; if (tts.needTap) replayAfterTap(); else if (P.step > 0 && P.step < 99) { P.said = null; } paintPanel(); return; }
    if (t.closest('[data-gb-fig]')) { try { navigator.vibrate?.(8); } catch { /* */ } stopSpeak(); P.lastT = null; P.said = null; P.step = P.step > 0 && P.step < 99 ? 99 : 1; paintPanel(); return; }
    if (t.closest('[data-gb-next]')) { const n = guide(view()).length; stopSpeak(); P.step = P.step >= n ? 99 : P.step + 1; paintPanel(); return; }
    if (t.closest('[data-gb-skip]')) { stopSpeak(); P.lastT = null; P.step = 99; paintPanel(); return; }
    if (t.closest('[data-gb37-copy]')) { copyVerse(); return; }
    if (t.closest('[data-gb37-next]')) { nextVerse(); return; }
    const tk = t.closest('[data-gb37-tick]');
    if (tk) { tickTodo(tk.dataset.gb37Tick); return; }
    if (t.closest('[data-gb37-todos]')) { closeBrief(); location.hash = '#/huskeliste'; return; }
    // Prompt 38: nye kort.
    const g38 = t.closest('[data-gb38-go]');
    if (g38) { closeBrief(); location.hash = g38.dataset.gb38Go; return; }
    const gift = t.closest('[data-gb38-gift]');
    if (gift) { giftAdd38(gift.dataset.gb38Gift, gift.dataset.gb38Date, gift); return; }
    if (t.closest('[data-gb="vaer"]') && !t.closest('a,button')) { openVaer(); return; }
    const ev = t.closest('[data-gb-ev]');
    if (ev) { const d = ev.dataset.gbEv; closeBrief(); location.hash = d ? `#/kalender/dag/${d}` : '#/kalender'; return; }
    const td = t.closest('[data-gb-trdone]');
    if (td) {
      const id = td.dataset.gbTrdone; B.doneTr.add(String(id));
      try { navigator.vibrate?.([8, 40, 8]); } catch { /* */ }
      api(`/brief/trials/${encodeURIComponent(id)}/done`, { method: 'POST' }).catch(() => {});
      paintPanel(); paintCards(); return;
    }
  });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-gb="vaer"]')) { e.preventDefault(); openVaer(); } });
  el.addEventListener('change', (e) => { if (glimtChange(e)) paintCards(); });
  el.addEventListener('submit', (e) => glimtSubmit(e, () => paintPanel()));
  // Bilder som ikke lar seg laste skjules (kortet viser da en jevn flate).
  el.addEventListener('error', (e) => { if (e.target.matches?.('img[data-gb-img]')) e.target.remove(); }, true);
}

/* ---------- Prompt 37: Vær fra briefen, bibelvers og gjøremål ---------- */

// Vær åpnes som fullskjerm-fanen; web37.js viser ✕ som går tilbake hit på samme scroll-posisjon.
function openVaer() {
  try { navigator.vibrate?.(6); } catch { /* */ }
  stopSpeak();
  const sc = P.el?.querySelector('.gb-sc')?.scrollTop ?? 0;
  try { sessionStorage.setItem('gb37_back', JSON.stringify({ sc, at: Date.now() })); } catch { /* */ }
  closeBrief();
  location.hash = '#/vaer';
}
/** Tilbake fra Vær: åpner briefen igjen på samme sted (uten ny guide-runde). */
export function reopenBrief(sc = 0) {
  P.scrollTop = sc;
  const k = `gb_tour_${new Date().toLocaleDateString('sv-SE')}_${B.kind ?? briefKind()}`;
  try { localStorage.setItem(k, '1'); } catch { /* */ }
  openBrief({ tapped: true });
  requestAnimationFrame(() => { const m = P.el?.querySelector('.gb-sc'); if (m) m.scrollTop = sc; });
}

// Bibelvers (bare for brukere med modulen): morgenbrief 05–11 og kveldsbrief 17–05. Data fra briefen (bible) eller /api/bible/today.
const BV = { d: undefined, off: 0, alt: null, copied: 0, loading: false };
const bPeriod = (d = new Date()) => { const h = d.getHours(); return h >= 5 && h < 11 ? 'morning' : h >= 17 || h < 5 ? 'evening' : null; };
function loadBible(force = false) {
  const per = bPeriod();
  if (!per || BV.loading || (BV.d !== undefined && !force && BV.d?.period === per)) return;
  if (B.data?.bible?.text) { BV.d = { ...B.data.bible, period: B.data.bible.period ?? per }; return; }
  BV.loading = true;
  api(`/bible/today?period=${per}`).then((r) => { BV.d = r?.enabled === false || !r?.text ? null : r; }).catch(() => { BV.d = null; })
    .finally(() => { BV.loading = false; if (P.open) paintPanel(); });
}
// Serverens brief har bible {…, placement:'top'|'bottom'} (bottom når verset er lest i dag) eller null (modulen av).
function bibleHtml(pos) {
  const srv = B.data && 'bible' in B.data;
  if (srv && !B.data.bible?.text) return '';
  const per = srv ? B.data.bible.period ?? bPeriod() ?? 'morning' : bPeriod();
  if (!per) return '';
  if ((srv ? B.data.bible.placement ?? 'top' : 'top') !== pos) return '';
  if (!srv) loadBible();
  const v = BV.alt ?? (srv ? B.data.bible : BV.d);
  if (!v?.text) return '';
  const m = (v.period ?? per) === 'morning';
  const date = new Date(v.date ? `${v.date}T12:00` : Date.now()).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const txt = String(v.text).replace(/^[«"]|[»"]$/g, '');
  return `<section data-gb="bibel" class="gb37-bv gb38-hasfig ${m ? 'm' : 'k'}"><span class="gb37-glow" aria-hidden="true"></span><span class="gb38-pfig">${outfit('prest', 46, { mood: tts.speaking ? 'talk' : 'idle' })}</span>
    <span class="gb37-bh"><span>${esc(v.kicker ?? `${m ? 'MORGENVERS' : 'KVELDSVERS'} · GLIMT`)}</span><span>${esc(date.replace(/^./, (c) => c.toUpperCase()))}</span></span>
    <p class="gb37-vt">«${esc(txt)}»</p><b class="gb37-ref">${esc(v.ref ?? '')}</b>
    <span class="gb37-bb"><button type="button" data-gb37-copy>${Date.now() - BV.copied < 1600 ? 'Kopiert' : 'Kopier'}</button><button type="button" data-gb37-next aria-label="Nytt vers" title="Nytt vers">↻</button></span></section>`;
}
async function copyVerse() {
  const v = BV.alt ?? (B.data?.bible?.text ? B.data.bible : BV.d);
  if (!v) return;
  try { await navigator.clipboard.writeText(`«${String(v.text).replace(/^[«"]|[»"]$/g, '')}» ${v.ref ?? ''}`.trim()); } catch { /* */ }
  BV.copied = Date.now(); paintPanel(); setTimeout(() => { if (P.open) paintPanel(); }, 1650);
}
async function nextVerse() {
  BV.off += 1;
  try { const r = await api(`/bible/next?offset=${BV.off}&period=${bPeriod() ?? 'morning'}`); if (r?.text) { BV.alt = r; paintPanel(); } } catch { BV.off -= 1; }
}

// Gjøremål-kortet: de tre første (forfalt + i dag) med avkrysning rett i briefen. Data: brief.todos, /api/tasks/brief eller /api/tasks/next.
const TD = { d: undefined, loading: false, done: new Set() };
function todosHtml() {
  const src = B.data?.todos ?? TD.d;
  if (src === undefined && !TD.loading) { TD.loading = true; api('/tasks/brief').catch((e) => (e.status === 404 ? api('/tasks/next?n=3').then((r) => ({ items: (r?.items ?? []).filter((x) => x.overdue || x.today), count: (r?.items ?? []).filter((x) => x.overdue || x.today).length })) : Promise.reject(e))).then((r) => { TD.d = r ?? null; }).catch(() => { TD.d = null; }).finally(() => { TD.loading = false; if (P.open) paintPanel(); }); }
  const items = (src?.items ?? []).filter((x) => !TD.done.has(String(x.id))).slice(0, 3);
  if (!items.length) return '';
  const n = src.count ?? items.length, today = new Date().toLocaleDateString('sv-SE');
  const late = items.filter((x) => x.due && x.due < today).length;
  const head = `${n} gjøremål i dag${late ? ` · ${late} forfalt` : ''}`.toUpperCase();
  return `<section data-gb="huske" class="gb-box gb37-td"><span class="gb-bh"><b>Gjøremål</b><span class="gb-mono red">${esc(head)}</span></span>
    ${items.map((x) => `<div class="gb37-tr"><button type="button" class="gb37-ck" data-gb37-tick="${esc(x.id)}" style="--c:${esc(x.color ?? x.listColor ?? '#b23a2a')}" aria-label="Fullfør ${esc(x.title ?? x.n)}"></button><span>${esc(x.title ?? x.n)}</span><small>${esc(x.due && x.due < today ? 'Forfalt' : x.time ? `I dag ${x.time}` : x.listName ?? x.list ?? '')}</small></div>`).join('')}
    <button type="button" class="gs-pill" data-gb37-todos>Åpne Gjøremål ›</button></section>`;
}
async function tickTodo(id) {
  TD.done.add(String(id));
  try { navigator.vibrate?.(8); } catch { /* */ }
  paintPanel();
  try { await api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { done: true } }); } catch { TD.done.delete(String(id)); paintPanel(); }
}

/* ---------- Globale bindinger ---------- */

onSpeak(() => { const w = P.el?.querySelector('.gb-spkw'); if (w) w.innerHTML = spkHtml(); });
document.addEventListener('keydown', (e) => {
  if (!P.open || e.key !== 'Escape') return;
  e.preventDefault(); e.stopPropagation();
  if (P.cfg) { P.cfg = false; paintPanel(); } else closeBrief();
}, true);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-gb-open]')) { e.preventDefault(); try { navigator.vibrate?.(8); } catch { /* */ } openBrief({ tapped: true }); }
});
window.addEventListener('glimt-char', () => { paintCards(); if (P.open) { P.lastCh = null; paintPanel(); } });
// Prompt 40: julemodus slått av/på → figurene tegnes på nytt med en gang.
window.addEventListener('glimt-jul', () => { paintCards(); if (P.open) { P.lastCh = null; paintPanel(); } });
document.addEventListener('hl:glimt', (e) => {
  const d = e.detail ?? {};
  if ('brief' in d) paintCards();
  if (d.briefs && briefKind() !== B.kind) loadBrief(true);
  if (d.friends != null || d.tts?.lang) { if (P.open) paintPanel(); paintCards(); }
});
// #/brief (lenke fra varsel eller appene) åpner panelet over Dashboard.
function fromHash() { if (/^#\/brief\/?$/.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search + '#/dash'); setTimeout(() => openBrief({ tapped: false }), 50); } }
window.addEventListener('hashchange', fromHash);
setTimeout(fromHash, 0);
