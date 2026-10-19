// Prompt 27 (PWA): ✕ til venstre i alle søkefelt, søkeforslag i Finans → Søk (Google-stil), ✦ AI i Google-feltet
// på Hjem (åpner Chat), Innstillinger → AI og tolkning (PERSONVERN OG LOGOER + CHAT), Nyheter med bilde og
// artikkelvisning i appen, Ruter-kortet på Hjem med «Velg stopp», og nytt abonnement fra skjermbilde.
// Fasit: design/Mobil Papir App.dc.html, Nyhetsleser.dc.html, Subscription OS.dc.html, Boliger/Bursdager/Vaer/Matplan.
// Endepunktene kommer fra serveren i samme prompt; mangler de (404), faller sidene tilbake til det som fantes før.
import { S, api, hlApi, esc, n0, ini, loadTx } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { FS, fsBind } from './mobile-paper3.js';
import { lineBg, lineFg } from './mobile-paper.js';
import { AV } from './mobile-p16.js';
import { IG, integLoad24 } from './mobile-p24.js';
import * as P25 from './mobile-p25.js';
import * as CHAT from './mobile-chat.js';
import * as KAL from './mobile-kal.js';
import { SB, subsLoad, openEditor } from './mobile-subs.js';

const X_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/* =====================================================================
   1. Felles SearchField: ✕ til venstre når det står tekst i feltet
   ===================================================================== */
// Alle søkefelt i appen tegnes som HTML-strenger i mange moduler. Etter hver tegning får hvert søkefelt en
// ✕-knapp (26 px sirkel, 36 px trykkflate) foran feltet; forstørrelsesglasset/G-logoen skjules mens det står tekst.
const SEL = 'input[type=search], #p16-avq, #vx-q, #w22-q, #p23-icq';
function enhance(root) {
  for (const inp of root.querySelectorAll(SEL)) {
    if (inp.dataset.p27x || inp.closest('.p27-sf.own, .ch27-sf, .k27-sf')) continue;
    inp.dataset.p27x = '1';
    const par = inp.parentElement; if (!par) continue;
    par.classList.add('p27-sf');
    // Ledende ikon: elementet rett før feltet (svg, ⌕-span eller G-logo), men aldri en knapp.
    const prev = inp.previousElementSibling;
    if (prev && !/^(BUTTON|INPUT|A)$/.test(prev.tagName) && (prev.matches('svg, [aria-hidden="true"], .pp-g') || prev.querySelector('svg') || prev.textContent.trim().length <= 2)) prev.classList.add('p27-ic');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'p27-x'; b.setAttribute('aria-label', 'Tøm søket'); b.dataset.p27clr = '1';
    b.innerHTML = `<span>${X_SVG}</span>`;
    par.insertBefore(b, inp);
    par.classList.toggle('has', !!inp.value);
  }
}
function syncHas(t) { const p = t?.closest?.('.p27-sf'); if (p && t.matches?.('input')) p.classList.toggle('has', !!t.value); }
async function clearField(btn) {
  const par = btn.closest('.p27-sf'), inp = par?.querySelector('input');
  if (!inp) return;
  par.classList.remove('has');
  inp.focus({ preventScroll: true });
  // Innstillinger: den gamle tøm-handlingen nullstiller også AI-svaret (knappen til høyre er skjult).
  if (inp.id === 'p24-sq') { par.querySelector('[data-p24="sqx"]')?.click(); return; }
  inp.value = '';
  if (inp.id === 'pp-fsq') { SG.list = null; SG.ctrl?.abort(); clearTimeout(SG.t); P25.cancelAi(); FS.q = ''; FS.r = null; }
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  const f = inp.form;
  if (f?.matches('[data-msearch]') && S.ui?.q) { S.ui.q = ''; await loadTx().catch(() => {}); }
  if (inp.id === 'pp-fsq' || f?.matches('[data-msearch]')) draw();
  document.getElementById(inp.id)?.focus({ preventScroll: true });
}
// Fokus og tastatur beholdes: knappen tar aldri fokus (pointerdown/mousedown preventDefault).
const keepFocus = (e) => { if (e.target.closest?.('.p27-x, [data-p27sug] [data-p27fill], .ch27-sf .p27-x, .k27-sf .p27-x')) e.preventDefault(); };
addEventListener('pointerdown', keepFocus, true);
addEventListener('mousedown', keepFocus, true);

/* =====================================================================
   2. Finans → Søk: forslag mens du skriver (Google-stil)
   ===================================================================== */
const SG = { list: null, q: '', t: null, ctrl: null, off: false };
const nrm = (s) => String(s ?? '').toLowerCase().replace(/å/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'å');
const TYPE = { butikk: 'Butikk', kategori: 'Kategori', vare: 'Vare' };
function sugFetch(q) {
  clearTimeout(SG.t); SG.ctrl?.abort();
  if (!q.trim() || FS.ai || SG.off) { if (SG.list) { SG.list = null; draw(); } return; }
  SG.t = setTimeout(async () => {
    const c = new AbortController(); SG.ctrl = c;
    try {
      const r = await fetch(`/finans/api/forslag?q=${encodeURIComponent(q.trim())}&limit=6`, { signal: c.signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (c.signal.aborted || FS.ai || SG.off) return;
      SG.q = q.trim(); SG.list = (Array.isArray(j) ? j : j?.items ?? []).slice(0, 6);
    } catch (e) { if (e.name === 'AbortError') return; SG.list = null; }
    if (m.screen === 'sok') draw();
  }, 120);
}
function hiName(name, q) {
  // Den skrevne delen står i vanlig vekt, resten i fet (som Google).
  const n = nrm(name), i = n.indexOf(nrm(q));
  if (i < 0 || !q) return `<b>${esc(name)}</b>`;
  return `<b>${esc(name.slice(0, i))}</b>${esc(name.slice(i, i + q.length))}<b>${esc(name.slice(i + q.length))}</b>`;
}
export function sugBox(fs) {
  const L0 = SG.list;
  if (!L0?.length || fs.ai || SG.off || !fs.q.trim()) return '';
  return `<div class="p27-sug" data-p27sug role="listbox" aria-label="Forslag">${L0.map((x, i) => {
    const sum = Number(x.sum) || 0, kr = Math.round(Math.abs(sum) / 100);
    const sub = [TYPE[x.type] ?? 'Treff', x.antall != null ? `${x.antall} kjøp` : '', sum ? `${sum < 0 ? '−' : '+'}${n0(kr)} kr` : ''].filter(Boolean).join(' · ');
    return `<div class="p27-sr" data-p27sg="${i}" role="option" tabindex="-1"><span class="p27-si${x.logoUrl ? ' logo' : ''}" style="background-color:${esc(x.farge || '#7a7468')}${x.logoUrl ? `;background-image:url('${esc(x.logoUrl)}')` : ''}">${x.logoUrl ? '' : esc(x.ikon || ini(x.navn))}</span><span class="m-grow"><span class="p27-sn">${hiName(String(x.navn ?? ''), SG.q)}</span><span class="p27-ss">${esc(sub)}</span></span><button type="button" class="p27-fill" data-p27fill="${i}" aria-label="Fyll inn i søket">↖</button></div>`;
  }).join('')}</div>`;
}

/* =====================================================================
   3. Innstillinger → AI og tolkning: PERSONVERN OG LOGOER og CHAT
   ===================================================================== */
const AUD = { open: false, list: null, err: '' };
const sw = (on) => `<span class="sw" aria-hidden="true" aria-checked="${!!on}"></span>`;
const tgRow = (grp, k, n, s, def) => { const on = CHAT.pers(k, def); return `<button class="opt-row p17-row" data-p27tog="${k}" data-g="${grp}" role="switch" aria-checked="${on}"><span class="m-grow p17-rt"><b>${esc(n)}</b><small>${esc(s)}</small></span>${sw(on)}</button>`; };
export function aiSections() {
  if (!IG.list && !IG.miss && !AUD.ig) { AUD.ig = true; integLoad24(true).then(draw).catch(() => {}); }
  const aud = AUD.open ? `<div class="p27-aud">${AUD.list === null ? '<div class="m-spin"></div>' : AUD.err ? `<span class="pp-mut">${esc(AUD.err)}</span>` : AUD.list.length ? AUD.list.slice(0, 30).map((r) => `<div class="p27-ar"><span class="m-grow"><b>${esc(`${r.engine ?? ''} · ${r.purpose ?? ''}`)}</b><small>${esc(Array.isArray(r.fields_sent ?? r.fieldsSent) ? (r.fields_sent ?? r.fieldsSent).join(', ') : String(r.fields_sent ?? r.fieldsSent ?? ''))}</small></span><span class="pp-mut">${esc(r.ts ? new Date(r.ts).toLocaleString('nb-NO', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')}</span></div>`).join('') : '<span class="pp-mut">Ingenting er sendt til AI ennå.</span>'}</div>` : '';
  return `<span class="pp-lab p17-gl">PERSONVERN OG LOGOER</span><div class="list p17-list p27-set">
      ${tgRow('privacy', 'logo_local_receipts', 'Les kvitteringer lokalt', 'Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut', true)}
      ${tgRow('privacy', 'logo_gemini', 'Finn logo med Gemini', 'Gemini får bare butikknavnet, f.eks. «Blomsterlandet»', true)}
      ${tgRow('privacy', 'logo_verify', 'Sjekk logoen før den lagres', 'Domenet må svare, og bildet må være et ekte bilde', true)}
      <button class="opt-row p17-row" data-p27="audit" aria-expanded="${AUD.open}"><span class="m-grow p17-rt"><b>AI-logg</b><small>Hva som er sendt til hvilken motor</small></span><span class="p17-chev" aria-hidden="true">${AUD.open ? '⌄' : '›'}</span></button>${aud}</div>
    <div class="snote">Av «Finn logo med Gemini» = logoen finnes fra Brønnøysundregistrene og nettstedet, uten AI.</div>
    <span class="pp-lab p17-gl">CHAT</span><div class="list p17-list p27-set">
      ${tgRow('chat', 'chat_my_data', 'Chat kan lese mine data', 'Finans, Kalender og Huskeliste når «Mine data» er på', false)}
      ${tgRow('chat', 'chat_ask_cloud', 'Spør før sky-modeller får data', 'Gemini og Groq må godkjennes per samtale', true)}
      <a class="opt-row p17-row" href="#/chat" data-p27="openchat"><span class="m-grow p17-rt"><b>Åpne chat</b><small>Historikk, modeller og kunnskapsbase</small></span><span class="p17-chev" aria-hidden="true">›</span></a></div>`;
}

/* =====================================================================
   4. Nyheter: bilde ved hver sak og artikkelvisning i appen
   ===================================================================== */
const NCOL = ['#c8102e', '#1a5a8a', '#2a3440', '#e05a2a', '#2f7a4f', '#5b4a8a', '#a8661a'];
const srcCol = (s) => { let h = 0; for (const c of String(s ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return NCOL[h % NCOL.length]; };
const srcIni = (s) => { const t = String(s ?? '').trim(); return /^[A-ZÆØÅ0-9]{2,4}$/.test(t) ? t : t.slice(0, 3).toUpperCase(); };
export function newsThumb(x, i, size = 76) {
  const img = x.image || x.img || x.thumbnail;
  return `<span class="p27-th" style="width:${size}px;height:${size}px;background-color:${srcCol(x.feed)}${img ? `;background-image:url('${esc(img)}')` : ''}" aria-hidden="true">${img ? '' : esc(srcIni(x.feed))}</span>`;
}
const ART = { x: null, d: null, busy: false, err: '', sh: false, list: [] };
const timeTxt = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(+d)) return ''; const t = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? `I dag ${t}` : `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${t}`; };
async function openArticle(x, list) {
  ART.x = x; ART.d = null; ART.busy = true; ART.err = ''; ART.sh = false; ART.list = list ?? ART.list;
  draw(); document.querySelector('.p27-art .p27-asc')?.scrollTo(0, 0);
  try { ART.d = await hlApi(`/rss/article?url=${encodeURIComponent(x.url)}`); }
  catch (e) { ART.err = e.status === 404 ? '' : e.message; }
  if (ART.x === x) { ART.busy = false; draw(); }
}
export function articleView(items, catName = (c) => c) {
  ART.items = items;
  const x = ART.x; if (!x) return '';
  const d = ART.d ?? {}, src = d.source ?? x.feed ?? '', cat = String(catName(d.category ?? x.category) || '').toUpperCase(), img = d.image ?? x.image;
  const words = d.readMin ?? x.readMin, meta = [timeTxt(d.published ?? x.published), words ? `ca. ${words} min å lese` : ''].filter(Boolean).join(' · ');
  const rel = (d.related?.length ? d.related : items.filter((y) => y !== x && y.category && y.category === x.category)).slice(0, 4);
  const pts = d.points ?? [];
  const sum = d.summary ?? (ART.busy ? '' : x.summary ?? x.description ?? '');
  return `<div class="p27-art" role="dialog" aria-label="${esc(x.title)}"><div class="p27-ah"><button class="p27-pill" data-p27="artx">‹ Siste nytt</button><span class="m-grow"></span><button class="p27-pill" data-p27="artshare">${ART.sh ? 'Lenke kopiert' : 'Del'}</button></div>
    <div class="p27-asc"><div class="p27-ab">
      <div class="p27-hero" style="background-color:${srcCol(x.feed)}${img ? `;background-image:url('${esc(img)}')` : ''}">${img ? '' : esc(srcIni(x.feed))}</div>
      <span class="pp-lab">${esc([cat, src.toUpperCase()].filter(Boolean).join(' · '))}</span>
      <h1 class="p27-at">${esc(d.title ?? x.title)}</h1>${meta ? `<span class="pp-mut">${esc(meta)}</span>` : ''}
      <div class="p27-sum"><span class="pp-lab">✦ AI-SAMMENDRAG</span>${ART.busy ? '<span class="pp-mut">Leser saken …</span>' : `${sum ? `<span class="p27-st">${esc(sum)}</span>` : `<span class="pp-mut">${esc(ART.err || 'Sammendrag er ikke tilgjengelig for denne saken ennå.')}</span>`}${pts.length ? `<div class="p27-pts">${pts.map((p, i) => `<div><b>${i + 1}</b><span>${esc(p)}</span></div>`).join('')}</div>` : ''}`}
        ${!ART.busy && ART.d ? `<span class="pp-mut sm">${esc(d.aiNote ?? 'Laget av AI fra saken. Kan inneholde feil.')}</span>` : ''}</div>
      <a class="p27-read" href="${esc(x.url)}" target="_blank" rel="noopener">Les hele saken hos ${esc(src || 'kilden')} ↗</a>
      ${rel.length ? `<div class="p27-relh">MER OM ${esc(cat || 'SAMME TEMA')}</div>${rel.map((y, i) => `<button class="p27-rel" data-p27rel="${i}"><span class="m-grow"><span>${esc(y.title)}</span><span class="pp-mut">${esc(`${y.feed ?? y.source ?? ''} · ${timeTxt(y.published)}`)}</span></span>${newsThumb(y, i, 64)}</button>`).join('')}` : ''}
    </div></div></div>`;
}

/* =====================================================================
   5. Ruter-kortet på Hjem: velg opptil 3 stopp og 1–4 avganger
   ===================================================================== */
const HD_LS = 'papir_av_home';
const HD = { sel: (() => { try { return JSON.parse(localStorage.getItem(HD_LS) || 'null'); } catch { return null; } })(), stops: null, deps: {}, t: 0, open: false, busy: false, loaded: false, miss: false };
const homeSel = () => ({ stops: (HD.sel?.stops ?? []).slice(0, 3), n: Math.min(4, Math.max(1, +HD.sel?.n || 3)) });
export function take27(r) { const h = r?.home_departures ?? r?.homeDepartures; if (h && Array.isArray(h.stops)) { HD.sel = { stops: h.stops, n: h.n }; try { localStorage.setItem(HD_LS, JSON.stringify(HD.sel)); } catch {} } }
async function hdLoad(force = false) {
  if (HD.busy || (!force && Date.now() - HD.t < 25000)) return;
  HD.busy = true; HD.t = Date.now();
  try {
    if (!HD.loaded) {
      HD.loaded = true;
      const r = await hlApi('/me/home-departures').catch(() => null);
      if (r && Array.isArray(r.stops)) take27({ home_departures: r });
    }
    HD.stops = await hlApi('/me/stops'); HD.miss = false;
  } catch { HD.miss = true; HD.busy = false; return; }
  const ids = shownStops().map((s) => s.id), n = homeSel().n;
  await Promise.all(ids.map(async (id) => { try { HD.deps[id] = await hlApi(`/ruter/departures?stop=${encodeURIComponent(id)}&n=${n}`); } catch (e) { HD.deps[id] = { error: e.message, departures: [] }; } }));
  HD.busy = false;
}
const shownStops = () => {
  const all = HD.stops ?? [], sel = homeSel().stops.map((id) => all.find((s) => s.id === id)).filter(Boolean);
  return sel.length ? sel : all.slice(0, 1);
};
async function hdSave(sel) {
  HD.sel = sel; try { localStorage.setItem(HD_LS, JSON.stringify(sel)); } catch {}
  try { await hlApi('/me/home-departures', { method: 'PUT', json: sel }); }
  catch { hlApi('/me/layout', { method: 'PUT', json: { home_departures: sel } }).catch(() => {}); }
}
const minOf = (d) => d.minutes ?? d.min ?? (d.expected ? Math.round((new Date(d.expected) - Date.now()) / 60000) : null);
export function ruterCard(old) {
  if (!HD.stops && !HD.miss) { if (!HD.busy && !HD.t) hdLoad().then(draw).catch(() => {}); return old; }
  if (HD.miss) return old;
  const st = shownStops(), n = homeSel().n;
  // Prompt 28 (claude-code-ruter-hjem.md): ingen «Velg stopp» på kortet (stopp velges med «✎ Rediger widget» i wiggle-modus),
  // tittel AVGANGER · STOPP1 · STOPP2, én flat liste: flere stopp = neste avgang fra hvert stopp, ett stopp = de N neste.
  if (!st.length) return `<a class="pp-card pp-ruter p27-ruter" href="#/avg"><div class="pp-row"><span class="pp-lab">AVGANGER</span><span class="pp-mut">sanntid ›</span></div><span class="pp-mut">Ingen stopp ennå. Legg til stopp i Ruter ›</span></a>`;
  const title = `AVGANGER · ${st.map((s) => s.name.toUpperCase()).join(' · ')}`;
  const depRow = (d) => { const mi = minOf(d); return `<div class="pp-dep p28-dep"><span class="pp-line" style="background:${esc(lineBg(d))};color:${esc(lineFg(d))}">${esc(d.line)}</span><span class="m-grow m-ell">${esc(d.to ?? d.dest ?? d.destination ?? '')}</span><b class="pp-serif">${mi != null ? (mi <= 0 ? 'nå' : mi) : ''}</b>${mi > 0 ? '<span class="pp-mut pp-min">min</span>' : ''}</div>`; };
  const rows = st.length > 1
    ? st.map((s) => { const D = HD.deps[s.id], d = D?.departures?.[0]; return d ? depRow(d) : ''; }).join('')
    : (HD.deps[st[0].id]?.departures ?? []).slice(0, n).map(depRow).join('');
  const D0 = st.map((s) => HD.deps[s.id]), wait = D0.some((D) => !D), err = D0.find((D) => D?.error)?.error;
  const body = rows || (wait ? '<span class="pp-mut sm">Henter avganger …</span>' : err ? `<span class="pp-mut sm">${esc(err)}</span>` : '<span class="pp-mut sm">Ingen avganger nå</span>');
  return `<a class="pp-card pp-ruter p27-ruter" href="#/avg"><div class="pp-row"><span class="pp-lab m-ell">${esc(title)}</span><span class="pp-mut p28-rt">sanntid ›</span></div>${body}</a>`;
}
/** Prompt 28: «✎ Rediger widget» på Ruter-kortet i wiggle-modus åpner arket «Hjem · Ruter-kortet». */
export async function hdEdit() { HD.open = true; if (!HD.stops) await hdLoad(true); draw(); }
function hdSheet() {
  if (!HD.open) return '';
  const all = HD.stops ?? [], sel = homeSel();
  return `<div class="sheet-bg" data-p27="hdclose"></div><div class="pp-sheet p27-hds" role="dialog" aria-label="Velg stopp">
    <div class="pp-row"><div><div class="pp-lab">HJEM · RUTER-KORTET</div><div class="pp-sh">Rediger widget</div></div><button type="button" class="p30-sb p30-pri" data-p27="hdclose">Ferdig</button></div>
    <span class="pp-mut">Velg opptil 3 stopp. Rekkefølgen følger Mine stopp.</span>
    <div class="pp-card pp-tight p27-hdl">${all.map((s) => { const on = sel.stops.includes(s.id); return `<button data-p27="hdtog" data-id="${esc(s.id)}" role="checkbox" aria-checked="${on}"><span class="p27-cb${on ? ' on' : ''}">✓</span><span class="m-grow"><b>${esc(s.name)}</b><span class="pp-mut">${esc([s.locality, s.lines?.length ? `${s.lines.length} linjer` : ''].filter(Boolean).join(' · ') || 'Sanntid fra Entur')}</span></span></button>`; }).join('') || '<span class="pp-mut" style="padding:12px">Ingen stopp ennå.</span>'}</div>
    <div class="pp-lab">AVGANGER PER STOPP</div><div class="p27-ns">${[1, 2, 3, 4].map((k) => `<button data-p27="hdn" data-n="${k}" aria-pressed="${sel.n === k}">${k}</button>`).join('')}</div>
    <button class="p27-mng" data-p27="hdmanage">Legg til eller fjern stopp ›</button></div>`;
}
let hdTimer = null;
function hdTick() {
  clearInterval(hdTimer);
  hdTimer = setInterval(() => { if (m.screen === 'hl' && !document.hidden && HD.stops && !HD.open) hdLoad(true).then(() => { const ae = document.activeElement; if (!(ae && /INPUT|TEXTAREA/.test(ae.tagName))) draw(); }).catch(() => {}); }, 30000);
}

/* =====================================================================
   6. Nytt abonnement fra skjermbilde
   ===================================================================== */
export const SH = { busy: false, r: null, name: '', thumb: null, err: '' }; // prompt 28: delt med arket i mobile-subs.js
const ROWS = [['tjeneste', 'Tjeneste'], ['plan', 'Plan'], ['pris', 'Pris'], ['syklus', 'Syklus'], ['neste_trekk', 'Neste trekk'], ['kategori', 'Kategori']];
export function shotView() {
  if (!SH.busy && !SH.r && !SH.err) return '';
  const r = SH.r ?? {}, chk = new Set(r.check ?? []), conf = r.sikkerhet ?? {};
  const val = (k) => k === 'pris' ? (r.pris != null ? `${r.prisOriginal && r.valuta && r.valuta !== 'NOK' ? '≈ ' : ''}${n0(Math.round(r.pris / 100))} kr${r.prisOriginal ? ` (${r.prisOriginal})` : ''}` : '–') : k === 'syklus' ? (r.syklus === 'år' ? 'Årlig' : 'Månedlig') : k === 'neste_trekk' ? (r.neste_trekk ? new Date(`${r.neste_trekk}T12:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '–') : r[k] || '–';
  const bad = (k) => chk.has(k) || (conf[k] != null && conf[k] < 0.8);
  const ex = r.existingId != null ? (SB.d?.items ?? SB.d?.subscriptions ?? []).find((x) => String(x.id) === String(r.existingId)) : null;
  return `<div class="p27-shot"><div class="p27-shh"><b>✦ Ollama leser skjermbildet</b><button type="button" class="p30-sb" data-p27="shotx">Lukk</button></div>
    <div class="p27-shb">${SH.thumb ? `<span class="p27-shi" style="background-image:url('${SH.thumb}')"></span>` : ''}<div class="m-grow">
      ${SH.busy ? `<span class="pp-mut">Finner tjeneste, plan, pris og trekkdato …</span><span class="p27-prog"><i></i></span><span class="pp-mut sm">${esc(SH.name)}</span>` : SH.err ? `<span class="p27-err">${esc(SH.err)}</span>`
        : ROWS.map(([k, n]) => `<div class="p27-shr"><span>${n}</span><b>${esc(val(k))}</b>${bad(k) ? '<em class="chk">Sjekk</em>' : '<em>✓</em>'}</div>`).join('')}</div></div>
    ${SH.r ? `<div class="p27-shbt">${ex ? `<button type="button" class="ink" data-p27="shotupd">Oppdater ${esc(ex.name)}</button>` : `<button type="button" class="ink" data-p27="shotadd">+ Legg til ${esc(r.tjeneste || 'abonnement')}</button>`}<button type="button" data-p27="shoted">Rediger først</button></div>` : ''}
    <span class="pp-mut sm">Leses lokalt av qwen2.5vl på hjemmeserveren. Bildet slettes etter lesing. Felt merket «Sjekk» var utydelige.</span></div>`;
}
async function shotRead(f) {
  SH.busy = true; SH.r = null; SH.err = ''; SH.name = f.name || 'skjermbilde';
  try { SH.thumb = await new Promise((ok) => { const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.onerror = () => ok(null); rd.readAsDataURL(f); }); } catch { SH.thumb = null; }
  draw();
  try { const fd = new FormData(); fd.append('image', f, f.name || 'skjermbilde.png'); SH.r = await api('/subscriptions/from-screenshot', { method: 'POST', body: fd }); }
  catch (e) { SH.err = e.status === 404 ? 'Serveren kan ikke lese skjermbilder ennå. Oppdater FinansHub, eller legg til manuelt.' : e.message; }
  SH.busy = false; draw();
}
const subBody = (r) => ({ name: r.tjeneste, plan: r.plan || undefined, price: r.pris != null ? r.pris / 100 : undefined, cycle: r.syklus === 'år' ? 'yearly' : 'monthly', nextDate: r.neste_trekk || undefined, category: r.kategori || undefined, domain: r.domain || undefined, logoUrl: r.logoUrl || undefined });

/* =====================================================================
   Kroker fra mobile.js
   ===================================================================== */
export function boot27() { hdTick(); }
export function afterDraw27() {
  const root = document.getElementById('app');
  if (root) enhance(root);
  CHAT.chatAfterDraw(); KAL.kalAfterDraw();
}
export const sheets27 = () => hdSheet();
export function leave27(next) { HD.open = false; if (next !== 'nyheter') ART.x = null; SG.list = null; SG.off = false; if (next !== 'sub') { SH.r = null; SH.err = ''; SH.busy = false; } }
export function key27(e) {
  CHAT.chatKey(e);
  if (e.key === 'Escape' && e.target?.matches?.(SEL) && e.target.value) { const b = e.target.parentElement?.querySelector('.p27-x'); if (b) { e.preventDefault(); clearField(b); } }
  if (e.key === 'Escape' && ART.x) { ART.x = null; draw(); }
}
export function input27(e, t) {
  syncHas(t);
  if (CHAT.chatInput(e, t)) return true;
  if (KAL.kalInput(e, t)) return true;
  if (t.id === 'pp-fsq') { SG.off = false; sugFetch(t.value); }
  return false;
}
export async function change27(e, t) {
  if (await CHAT.chatChange(e, t)) return true;
  if (t.matches?.('[data-p27shot]')) { const f = t.files?.[0]; t.value = ''; if (f) await shotRead(f); return true; }
  return false;
}
export async function submit27(e, t) {
  if (await CHAT.chatSubmit(e, t)) return true;
  if (await KAL.kalBind(e, t)) return true;
  if (t.matches?.('[data-ppfs]')) { SG.off = true; SG.list = null; SG.ctrl?.abort(); clearTimeout(SG.t); }
  return false;
}
export async function bind27(e, t) {
  if (await CHAT.chatBind(e, t)) return true;
  let x;
  if ((x = t.closest?.('.p27-x[data-p27clr]'))) { e.preventDefault(); await clearField(x); return true; }
  if ((x = t.closest?.('[data-p27fill]'))) {
    e.preventDefault(); const s = SG.list?.[+x.dataset.p27fill]; if (!s) return true;
    const inp = document.getElementById('pp-fsq'); FS.q = s.navn; if (inp) { inp.value = s.navn; inp.focus(); inp.parentElement?.classList.add('has'); }
    sugFetch(s.navn); return true;
  }
  if ((x = t.closest?.('[data-p27sg]'))) {
    e.preventDefault(); const s = SG.list?.[+x.dataset.p27sg]; if (!s) return true;
    SG.off = true; SG.list = null; FS.q = s.navn; haptic('tap');
    const inp = document.getElementById('pp-fsq'); if (inp) { inp.value = s.navn; inp.blur(); }
    const f = document.querySelector('[data-ppfs]');
    if (f) await fsBind({ type: 'submit', preventDefault() {} }, f); // direkte, ikke requestSubmit (async-lytterne rekker ikke preventDefault)
    return true;
  }
  if ((x = t.closest?.('[data-p27art]')) && m.screen === 'nyheter') {
    e.preventDefault(); const it = ART.items?.[+x.dataset.p27art]; if (it) openArticle(it, ART.items); return true;
  }
  if ((x = t.closest?.('[data-p27rel]'))) {
    e.preventDefault(); const cur = ART.x, list = ART.d?.related?.length ? ART.d.related : (ART.items ?? []).filter((y) => y !== cur && y.category && y.category === cur?.category);
    const it = list.slice(0, 4)[+x.dataset.p27rel]; if (it) openArticle(it); return true;
  }
  if ((x = t.closest?.('[data-p27tog]'))) {
    e.preventDefault(); const k = x.dataset.p27tog, def = !['chat_my_data'].includes(k), v = !CHAT.pers(k, def);
    haptic('tab'); const p = CHAT.setPers(x.dataset.g, k, v); draw();
    if (!(await p)) flash('Lagret på enheten · serveren støtter ikke valget ennå');
    return true;
  }
  if (!(x = t.closest?.('[data-p27]'))) return false;
  const a = x.dataset.p27;
  if (a === 'openchat') { e.preventDefault(); CHAT.openChat(''); return true; }
  e.preventDefault(); e.stopPropagation();
  switch (a) {
    case 'gai': { const inp = x.closest('form')?.querySelector('input'); const q = inp?.value?.trim() ?? ''; haptic('tap'); CHAT.openChat(q); return true; }
    case 'audit': AUD.open = !AUD.open; if (AUD.open && AUD.list === null) api('/ai-audit').then((r) => { AUD.list = Array.isArray(r) ? r : r?.items ?? []; }).catch((err) => { AUD.list = []; AUD.err = err.status === 404 ? 'AI-loggen krever nyere server.' : err.message; }).then(draw); break;
    case 'artx': ART.x = null; break;
    case 'artshare': { const u = ART.x?.url; if (!u) return true; if (navigator.share) { navigator.share({ title: ART.x.title, url: u }).catch(() => {}); return true; } try { await navigator.clipboard.writeText(u); } catch {} ART.sh = true; setTimeout(() => { ART.sh = false; draw(); }, 1600); break; }
    case 'hdopen': HD.open = true; if (!HD.stops) await hdLoad(true); break;
    case 'hdclose': HD.open = false; hdLoad(true).then(draw).catch(() => {}); break;
    case 'hdtog': { const s = homeSel(), id = x.dataset.id; let L0 = s.stops.includes(id) ? s.stops.filter((y) => y !== id) : [...s.stops, id]; if (L0.length > 3) { flash('Velg opptil 3 stopp'); return true; } L0 = (HD.stops ?? []).map((y) => y.id).filter((y) => L0.includes(y)); haptic('tab'); hdSave({ stops: L0, n: s.n }); break; }
    case 'hdn': { haptic('tab'); hdSave({ stops: homeSel().stops, n: +x.dataset.n }); break; }
    case 'hdmanage': HD.open = false; AV.edit = true; AV.q = ''; AV.res = null; location.hash = '#/avg'; return true;
    case 'shotx': SH.r = null; SH.err = ''; SH.busy = false; break;
    case 'shotadd': case 'shotupd': {
      const r = SH.r; if (!r) return true;
      try {
        if (a === 'shotupd') await api(`/subscriptions/${r.existingId}`, { method: 'PATCH', json: { plan: r.plan, price: r.pris / 100, cycle: r.syklus === 'år' ? 'yearly' : 'monthly', nextDate: r.neste_trekk } });
        else await api('/subscriptions', { method: 'POST', json: subBody(r) });
        SH.r = null; SB.sheet = false; SB.mode = null; await subsLoad(); flash(`${r.tjeneste} er ${a === 'shotupd' ? 'oppdatert' : 'lagt til'}`);
      } catch (err) { flash(err.message, 'err'); }
      break;
    }
    case 'shoted': { const r = SH.r; if (!r) return true; SH.r = null; SB.sheet = false; SB.mode = null; openEditor({ name: r.tjeneste ?? '', plan: r.plan ?? '', price: r.pris != null ? r.pris / 100 : '', cycle: r.syklus === 'år' ? 'yearly' : 'monthly', nextDate: r.neste_trekk, category: r.kategori, logoUrl: r.logoUrl ?? null, domain: r.domain ?? null }); if (SB.ed) SB.ed.id = null; break; }
    default: return true;
  }
  draw(); return true;
}
