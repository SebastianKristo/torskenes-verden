// Homelab som forside i mobilappen: hilsen, klokke og vær, Google-søk (forslag og historikk), snarveier,
// «Andre OS» og valgfrie widgets (Serverstatus, Ruter). «Rediger forsiden» fungerer som hjemskjermen på iPhone/Android:
// widgetene vugger, «−» skjuler, ▲▼ eller dra flytter, «+» åpner galleriet. Oppsettet lagres per bruker (/api/me/layout).
import { S, esc, n0, ini, icon, hlApi, matApi, domApi, loadSummary } from './core.js';
import { m, draw, flash, avInner, avatarUrl, meName, HLTABS, FINTABS, FIXED_HL, FIXED_FIN } from './mobile.js';
import { c3 } from './mobile-theme.js';

/* ---------- Oppsett ---------- */

const DEF = { sec: ['clock', 'search', 'links', 'os', 'srv', 'ruter'], hlTabs: ['hl', 'home', 'dom', 'mat'], finTabs: ['home', 'list', 'finn', 'bud', 'ai', 'mer'], hide: { srv: true, ruter: true, bud: true } };
const WD = {
  clock: ['Klokke og vær', 'Tid, temperatur og vind', 'clock'], search: ['Google-søk', 'Søk med forslag og historikk', 'search'],
  links: ['Snarveier', 'Favorittsider og tjenester på hjemmenettet', 'mer'], os: ['Andre OS', 'Finans, Domener og Matplan', 'konto2'],
  srv: ['Serverstatus', 'CPU, minne, lagring og oppetid', 'srv'], ruter: ['Ruter-avganger', 'Neste avganger i sanntid', 'bus'],
};
const fix = (a, d) => { a = (Array.isArray(a) ? a : []).filter((x) => d.includes(x)); return [...new Set([...a, ...d.filter((x) => !a.includes(x))])]; };
function norm(v = {}) {
  const hide = { ...(v.hide && typeof v.hide === 'object' ? v.hide : DEF.hide) };
  // Nye widgets som ikke finnes i et lagret oppsett får standard synlighet.
  DEF.sec.forEach((id) => { if (Array.isArray(v.sec) && !v.sec.includes(id) && DEF.hide[id]) hide[id] = true; });
  // Prompt 10: Finn tar Budsjetts plass i fanelinja. Et lagret oppsett uten Finn får Finn der Budsjett sto, og Budsjett
  // skjules én gang (den ligger øverst i Mer og kan slås på igjen i navigasjonsredigeringen).
  let finTabs = v.finTabs;
  if (!Array.isArray(finTabs) || !finTabs.includes('finn')) {
    if (Array.isArray(finTabs) && finTabs.length) { finTabs = [...finTabs]; const i = finTabs.indexOf('bud'); finTabs.splice(i < 0 ? Math.max(0, finTabs.indexOf('ai')) : i, 0, 'finn'); }
    hide.bud = true; delete hide.finn;
  }
  const names = {};
  if (v.names && typeof v.names === 'object') for (const [k, n] of Object.entries(v.names)) if (typeof n === 'string' && n.trim()) names[k] = n.trim().slice(0, 30);
  return { sec: fix(v.sec, DEF.sec), hlTabs: fix(v.hlTabs, DEF.hlTabs), finTabs: fix(finTabs, DEF.finTabs), hide, names,
    start: START_KEYS.includes(v.start) ? v.start : undefined, backStyle: v.backStyle === 'bar' ? 'bar' : 'arrow', matTheme: ['light', 'dark', 'system'].includes(v.matTheme) ? v.matTheme : 'light' };
}
export const START_KEYS = ['homelab', 'fin-hjem', 'fin-liste', 'fin-budsjett'];
let lay = norm((() => { try { return JSON.parse(localStorage.getItem('fh_mlayout') || '{}'); } catch { return {}; } })());
export const LAY = () => lay;

export async function loadLayout() {
  try { const r = await hlApi('/me/layout'); if (r?.finNav?.labels) S.navLabels = r.finNav.labels;
    if (r?.mobile) { lay = { ...norm(r.mobile), fromServer: true }; try { localStorage.setItem('fh_mlayout', JSON.stringify(lay)); } catch {} } } catch { /* eldre server: bare lokalt */ }
}
let saveT;
// Lagres per bruker (/api/me/layout.mobile). Eldre servere som avviser de nye feltene får dem uten.
export function saveLayout(patch, redraw = true) {
  lay = { ...norm({ ...lay, ...patch }), fromServer: true };
  try { localStorage.setItem('fh_mlayout', JSON.stringify(lay)); } catch {}
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const full = norm(lay); if (!full.start) delete full.start;
    hlApi('/me/layout', { method: 'PUT', json: { mobile: full } }).catch(() => {
      const { sec, hlTabs, finTabs, hide } = full;
      return hlApi('/me/layout', { method: 'PUT', json: { mobile: { sec, hlTabs, finTabs, hide } } }).catch(() => {});
    });
  }, 400);
  if (redraw) draw();
}
function move(key, i, j) {
  const a = [...lay[key]];
  if (j < 0 || j >= a.length || i === j) return;
  const [x] = a.splice(i, 1); a.splice(j, 0, x);
  saveLayout({ [key]: a });
}

/* ---------- Data ---------- */

const H = { set: { suggest: true, save: true }, data: null, err: '', q: '', open: false, sug: [], hist: null, sel: -1, edit: false, gal: false, dom: null, mat: null, drag: null };
const WXT = { 0: 'Klart', 1: 'Lettskyet', 2: 'Delvis skyet', 3: 'Overskyet', 45: 'Tåke', 48: 'Tåke', 51: 'Yr', 53: 'Yr', 55: 'Yr', 61: 'Lett regn', 63: 'Regn', 65: 'Kraftig regn', 71: 'Lett snø', 73: 'Snø', 75: 'Kraftig snø', 80: 'Regnbyger', 81: 'Regnbyger', 82: 'Kraftige byger', 95: 'Torden' };
const histLocal = () => { try { return JSON.parse(localStorage.getItem('hl_search_hist') || '[]'); } catch { return []; } };
const histNorm = (r) => (Array.isArray(r) ? r : r?.items ?? r?.history ?? []).map((x) => (typeof x === 'string' ? x : x?.q ?? x?.query ?? '')).filter(Boolean);

// /api/mobile/home samler alt; eldre server: bygg det samme fra Homelabs egne endepunkter.
async function homeData() {
  try { return await hlApi('/mobile/home'); } catch (e) { if (e.status === 401) throw e; }
  const [w, r, h, me] = await Promise.all(['/weather', '/ruter', '/health', '/me'].map((p) => hlApi(p).catch(() => null)));
  const now = Date.now();
  return {
    name: me?.name, serverName: null, avatarUrl: me?.avatarUrl ?? null,
    weather: w ? { place: w.place, temp: w.temp, text: w.text, wind: w.wind, max: w.days?.[0]?.max, min: w.days?.[0]?.min } : null,
    shortcuts: (h?.services ?? []).map((s) => ({ name: s.name, url: s.url, local: /\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost)/.test(s.url) })),
    ruter: (r?.trips ?? []).map((t) => ({ from: t.from, to: t.to, departures: (t.deps ?? []).map((x) => ({ line: x.line, color: x.mode === 'tram' ? '#0B91EF' : x.mode === 'bus' ? '#E60000' : '#EC700C', min: Math.max(0, Math.round((new Date(x.time) - now) / 60000)), time: x.time })) })),
    serverStatus: null, fallback: true,
  };
}

export async function hlLoad() {
  const jobs = [
    homeData().then((d) => { H.data = d; H.err = ''; if (d?.search) H.set = d.search; if (d?.layout && Object.keys(d.layout).length && !lay.fromServer) { lay = norm(d.layout); lay.fromServer = true; }  if (d?.avatarUrl && m.me) m.me.avatarUrl = d.avatarUrl; if (d?.name && m.me && !m.me.name) m.me.name = d.name; }).catch((e) => { H.err = e.message; }),
    hlApi('/search/history').then((r) => { H.hist = histNorm(r); if (r && typeof r.save === 'boolean') H.set = { suggest: r.suggest !== false, save: r.save }; }).catch(() => { H.hist = histLocal(); }),
  ];
  if (!S.boot?.restricted) jobs.push(loadSummary().catch(() => {}));
  jobs.push(domApi('/domains').then(async (l) => {
    const list = Array.isArray(l) ? l : l?.items ?? [];
    if (!list.length) { H.dom = { n: 0 }; return; }
    let sel = list[0].name; try { const s = localStorage.getItem('hl_dom_sel'); if (list.some((d) => d.name === s)) sel = s; } catch {}
    const a = await domApi(`/${encodeURIComponent(sel)}/analytics?range=today`).catch(() => null);
    H.dom = { n: list.length, name: sel, visitors: a?.visitors ?? null, up: a ? a.status === 'active' : null };
  }).catch(() => { H.dom = null; }));
  jobs.push(matApi('/week').then((w) => { const td = new Date().toLocaleDateString('sv-SE'); const d = (w?.days ?? []).find((x) => x.date === td); H.mat = { name: d?.name || null, week: w?.week ?? null }; }).catch(() => { H.mat = null; }));
  await Promise.all(jobs);
}

/* ---------- Visning ---------- */

const isI = (th) => th === 'ios';
const greetTxt = (h) => (h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 17 ? 'God dag' : 'God kveld');
const timeTxt = () => new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
const card = (th, inner, cls = '') => `<div class="hcard ${isI(th) ? 'glass2' : ''} ${cls}">${inner}</div>`;
const isoWeek = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };

function wClock(th) {
  const w = H.data?.weather;
  const wx = w ? `${w.text ?? WXT[w.code] ?? 'Skiftende'}${w.wind != null ? ` · ${Math.round(w.wind)} m/s` : ''}` : H.data ? 'Ingen værdata' : 'Henter vær …';
  return card(th, `<b class="hclock" data-clock>${timeTxt()}</b><span class="hwx"><b>${w?.temp != null ? Math.round(w.temp) + '°' : '–'}</b><span>${esc(wx)}</span><span class="dim">${esc(w?.place ?? 'Oslo')}${w?.max != null ? ` · ${Math.round(w.max)}° / ${Math.round(w.min)}°` : ''}</span></span>`, 'row');
}

function dropItems() {
  const lq = H.q.toLowerCase().trim(), hist = H.hist ?? [];
  const hm = lq ? hist.filter((x) => x.toLowerCase().includes(lq)).slice(0, 3) : hist.slice(0, 8);
  const sg = lq ? H.sug.filter((x) => !hm.some((y) => y.toLowerCase() === x.toLowerCase())).slice(0, 5) : [];
  return [...hm.map((t) => ({ t, hist: true })), ...sg.map((t) => ({ t, hist: false }))];
}
function dropHtml() {
  const items = dropItems();
  if (!H.open || !items.length) return '';
  return `${!H.q.trim() && (H.hist ?? []).length ? '<div class="hdrop-h"><span>Nylige søk</span><button type="button" data-hls="clear">Tøm historikk</button></div>' : ''}
    ${items.map((x, i) => `<div class="hdrop-i${i === H.sel ? ' on' : ''}" role="option" data-hls="go" data-q="${esc(x.t)}">${icon(x.hist ? 'hist' : 'search', 18)}<span class="m-ell m-grow">${esc(x.t)}</span>${x.hist ? `<button type="button" data-hls="del" data-q="${esc(x.t)}" aria-label="Fjern ${esc(x.t)} fra historikken">×</button>` : ''}</div>`).join('')}`;
}
const GLOGO = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" style="flex:none"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';
const wSearch = (th) => `<form class="hsearch ${isI(th) ? 'glass2' : ''}" data-hlform role="search"><div class="hsearch-in">${GLOGO}<input id="m-hlq" type="search" enterkeyhint="search" value="${esc(H.q)}" placeholder="Søk på Google eller skriv en adresse" autocomplete="off" autocapitalize="off" aria-label="Søk på Google" aria-autocomplete="list"></div><div id="m-hldrop" class="hdrop" role="listbox">${dropHtml()}</div></form>`;

function wLinks(th) {
  const l = H.data?.shortcuts ?? [];
  return `<div class="sec">Snarveier</div>${l.length ? `<div class="hlinks">${l.map((x) => {
    const host = String(x.url ?? '').replace(/^https?:\/\//, '').split('/')[0];
    const local = x.local ?? /^(192\.168|10\.|localhost|172\.)/.test(host);
    return `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span class="hlic">${local || !host ? `<b>${esc(ini(x.name))}</b>` : `<img src="https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}" alt="" loading="lazy"><b class="fb">${esc(ini(x.name))}</b>`}</span><span class="m-ell">${esc(x.name)}</span></a>`;
  }).join('')}</div>` : `<div class="m-empty" style="padding:12px">${H.data ? 'Ingen snarveier ennå. Legg dem til i Homelab på PC.' : 'Henter snarveier …'}</div>`}`;
}

function wOs(th) {
  const s = S.summary, rv = (s?.review ?? []).filter((r) => r.status === 'needs_review').length;
  const fin = S.boot?.restricted ? ['Finans · boliger', 'Utgifter, prosjekter og regninger', ''] : [`Finans · igjen å bruke${s ? ` i ${new Date(s.month + '-15').toLocaleDateString('nb-NO', { month: 'long' })}` : ''}`, s ? `${n0(s.left)} kr` : '–', rv ? `${rv} kvittering${rv > 1 ? 'er' : ''} til gjennomgang` : 'Alt er gjennomgått'];
  const dm = H.dom, mt = H.mat;
  return `<div class="sec">Andre OS</div><div class="hos">
    <a class="hos-fin ${isI(th) ? 'glass2' : ''}" href="#/${S.boot?.restricted ? 'dir' : 'hjem'}"><span class="m-grow"><span class="dim">${esc(fin[0])}</span><b>${esc(fin[1])}</b>${fin[2] ? `<span class="acc">${esc(fin[2])}</span>` : ''}</span><span style="font-size:24px;opacity:.6">›</span></a>
    ${dm !== null ? `<a class="${isI(th) ? 'glass2' : ''}" href="#/dom"><span class="dim">Domener</span><b>${dm?.visitors != null ? n0(dm.visitors) : dm ? dm.n : '…'}</b><span class="dim sm">${dm?.visitors != null ? `besøk i dag · ${dm.up === false ? 'sjekk status' : 'alle oppe'}` : dm?.n === 0 ? 'Ingen domener ennå' : 'domener'}</span></a>` : ''}
    ${mt !== null ? `<a class="${isI(th) ? 'glass2' : ''}" href="#/mat"><span class="dim">Matplan</span><b class="m-ell">${esc(mt?.name ?? (mt ? 'Ingen plan' : '…'))}</b><span class="dim sm">i dag · uke ${mt?.week ?? isoWeek()}</span></a>` : ''}
  </div>`;
}

function statRow(label, v) {
  if (v == null) return '';
  let pct = null, txt = '';
  if (typeof v === 'number') { pct = v; txt = `${Math.round(v)} %`; }
  else if (typeof v === 'string') txt = v;
  else { pct = v.pct ?? (v.used != null && v.total ? (v.used / v.total) * 100 : null); txt = v.text ?? (v.used != null && v.total != null ? `${v.used} / ${v.total}${v.unit ? ' ' + v.unit : ''}` : pct != null ? `${Math.round(pct)} %` : ''); }
  const c = pct > 80 ? '#FF8A80' : pct > 60 ? '#F2B56B' : 'var(--m-acc)';
  return `<div class="hstat"><div><span class="dim">${label}</span><span class="m-mono">${esc(txt)}</span></div>${pct != null ? `<span class="hbar"><i style="width:${Math.min(100, pct)}%;background:${c}"></i></span>` : ''}</div>`;
}
const upTxt = (u) => { if (u == null) return ''; if (typeof u === 'string') return u; const d = Math.floor(u / 86400); return d >= 1 ? `${d} d` : `${Math.floor(u / 3600)} t`; };
function wSrv(th) {
  const s = H.data?.serverStatus;
  if (!s) return card(th, `<div class="hhead"><b>Serverstatus</b><span class="dim">${H.data?.fallback ? 'Krever nyere server' : 'Henter …'}</span></div>`);
  const temp = s.temp == null ? null : typeof s.temp === 'number' ? { pct: Math.min(100, s.temp), text: `${Math.round(s.temp)} °C` } : s.temp;
  return card(th, `<div class="hhead"><b>Serverstatus</b><span style="color:#7BE3A0;font-size:12.5px">● Oppe${s.uptimeText ? ` i ${esc(s.uptimeText)}` : s.uptime != null ? ` i ${esc(upTxt(s.uptime))}` : ''}</span></div>
    ${statRow('CPU', s.cpu)}${statRow('Minne', s.mem)}${statRow('Lagring', s.disk)}${statRow('Temperatur', temp)}`);
}
function wRuter(th) {
  const r = H.data?.ruter ?? [];
  const rows = r.flatMap((x) => (x.departures ?? []).slice(0, 2).map((d) => ({ ...d, to: d.to ?? x.to }))).sort((a, b) => (a.min ?? 99) - (b.min ?? 99)).slice(0, 5);
  return card(th, `<div class="hhead"><b>Ruter${r[0]?.from ? ` · ${esc(r[0].from)}` : ''}</b><span class="dim">Sanntid</span></div>
    ${rows.length ? rows.map((d) => `<div class="hdep"><span class="hline" style="background:${esc(d.color ?? '#0B91EF')}">${esc(d.line)}</span><span class="m-ell m-grow">${esc(d.to)}</span><b>${d.min != null ? (d.min <= 0 ? 'nå' : `${d.min} min`) : esc(d.time ?? '')}</b></div>`).join('') : `<div class="dim" style="padding:6px 0">${H.data ? 'Ingen avganger. Sett opp strekninger i Homelab → Innstillinger.' : 'Henter avganger …'}</div>`}`);
}
const RENDER = { clock: wClock, search: wSearch, links: wLinks, os: wOs, srv: wSrv, ruter: wRuter };

function gallery(th) {
  if (!H.gal) return '';
  const tr = (on) => `<span class="sw" aria-checked="${on}"></span>`;
  const rows = (key, def, fixed) => lay[key].map((id, i, a) => {
    const hid = !!lay.hide[id], fx = fixed.includes(id);
    return `<div class="opt-row"><span class="m-grow" style="opacity:${hid ? 0.5 : 1}">${def[id][1]}</span>
      <button class="mini" data-hle="mv" data-k="${key}" data-i="${i}" data-j="${i - 1}" aria-label="Flytt opp" ${i ? '' : 'disabled style="opacity:.3"'}>▲</button><button class="mini" data-hle="mv" data-k="${key}" data-i="${i}" data-j="${i + 1}" aria-label="Flytt ned" ${i < a.length - 1 ? '' : 'disabled style="opacity:.3"'}>▼</button>
      ${fx ? '<span class="sval" style="width:51px;text-align:center">Alltid</span>' : `<button class="swb" data-hle="tog" data-id="${id}" role="switch" aria-checked="${!hid}" aria-label="Vis ${def[id][1]}">${tr(!hid)}</button>`}</div>`;
  }).join('');
  return `<div class="hgal"><div class="sec">Legg til widget</div>
    <div class="hgrid">${lay.sec.map((id) => { const vis = !lay.hide[id]; return `<div class="hgw ${isI(th) ? 'glass2' : ''}"><span class="hgic">${icon(WD[id][2], 20)}</span><b>${WD[id][0]}</b><span class="dim m-grow">${WD[id][1]}</span><button class="${vis ? 'added' : 'add'}" data-hle="add" data-id="${id}" ${vis ? 'disabled' : ''}>${vis ? 'Lagt til' : 'Legg til'}</button></div>`; }).join('')}</div>
    <div class="sec">Navigasjon · Homelab</div><div class="list ${isI(th) ? 'glass2' : ''}">${rows('hlTabs', HLTABS, FIXED_HL)}</div>
    <div class="sec">Navigasjon · Finans</div><div class="list ${isI(th) ? 'glass2' : ''}">${rows('finTabs', FINTABS, FIXED_FIN)}</div>
    <button class="linkb" data-hle="reset">Tilbakestill</button></div>`;
}

export function hlView(th) {
  const now = new Date(), name = H.data?.name || meName();
  const vis = lay.sec.filter((id) => !lay.hide[id]);
  const head = `<div class="hlhead"><div class="m-grow"><span class="dim" style="text-transform:capitalize">${now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</span><div class="title hlgreet">${greetTxt(now.getHours())}, ${esc(name)}</div></div>
    ${H.edit ? `<span class="m-row" style="gap:8px"><button class="gbtn sm" data-hle="gal" aria-label="Legg til widget" aria-expanded="${H.gal}">${icon('plus', 20, 'currentColor', 2.4)}</button><button class="donebtn" data-hle="done">Ferdig</button></span>`
      : `<button class="m-av hlav${avatarUrl() ? ' img' : ''}" data-mact="menu" aria-label="Profil og meny" aria-haspopup="dialog">${avInner()}</button>`}</div>`;
  const body = vis.map((id, i) => `<div class="wg${H.edit ? ` jig${i % 2 ? ' alt' : ''}` : ''}" data-wg="${id}">${H.edit ? `<div class="wg-ov" data-wgdrag="${id}" aria-hidden="true"></div><button class="wg-rm" data-hle="rm" data-id="${id}" aria-label="Fjern ${WD[id][0]}">−</button><span class="wg-mv"><button data-hle="mvsec" data-id="${id}" data-d="-1" aria-label="Flytt ${WD[id][0]} opp">▲</button><button data-hle="mvsec" data-id="${id}" data-d="1" aria-label="Flytt ${WD[id][0]} ned">▼</button></span>` : ''}${RENDER[id](th)}</div>`).join('');
  return `${head}${H.edit ? '<div class="snote" style="text-align:center">Trykk − for å fjerne, dra eller bruk ▲▼ for å flytte, og + for å legge til widgets.</div>' : ''}${gallery(th)}
    ${H.err ? `<div class="m-empty">${esc(H.err)}</div>` : ''}${body || '<div class="m-empty">Alle widgets er skjult. Trykk + for å legge dem til igjen.</div>'}`;
}

// Klokka oppdateres i stedet for å tegne hele siden (så søkefeltet beholder fokus og tastatur).
let clockT;
export function hlAfterDraw() {
  clearInterval(clockT);
  if (m.screen !== 'hl') return;
  clockT = setInterval(() => { const el = document.querySelector('[data-clock]'); if (el) el.textContent = timeTxt(); else clearInterval(clockT); }, 15000);
}

/* ---------- Søk ---------- */

const updDrop = () => { const el = document.getElementById('m-hldrop'); if (el) el.innerHTML = dropHtml(); };
let sugT, sugN = 0;
function fetchSug() {
  clearTimeout(sugT);
  const q = H.q.trim();
  if (!q || !H.set.suggest) { H.sug = []; updDrop(); return; }
  sugT = setTimeout(async () => {
    const n = ++sugN;
    try { const r = await hlApi('/search/suggest?q=' + encodeURIComponent(q)); if (n !== sugN) return; H.sug = (Array.isArray(r) && Array.isArray(r[1]) ? r[1] : Array.isArray(r) ? r : r?.items ?? r?.suggestions ?? []).map((x) => (typeof x === 'string' ? x : x?.q ?? '')).filter(Boolean); }
    catch { H.sug = []; }
    updDrop();
  }, 150);
}
function saveHist(list) { H.hist = list; try { localStorage.setItem('hl_search_hist', JSON.stringify(list.slice(0, 100))); } catch {} }
function run(text) {
  const q = (text ?? '').trim();
  if (!q) return;
  if (H.set.save) {
    saveHist([q, ...(H.hist ?? []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 100));
    hlApi('/search/history', { method: 'POST', json: { q } }).catch(() => {});
  }
  H.q = ''; H.open = false; H.sug = []; H.sel = -1;
  const url = !/\s/.test(q) && /^(https?:\/\/|[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/|$))/i.test(q) ? (/^https?:/i.test(q) ? q : 'https://' + q) : 'https://www.google.com/search?q=' + encodeURIComponent(q);
  window.open(url, '_blank', 'noopener');
  draw();
}

/* ---------- Hendelser (synkron: returnerer true når hendelsen er håndtert) ---------- */

export function hlBind(e, t) {
  const d = (s) => t.closest?.(s);
  let x;
  if (e.type === 'click' && d('[data-mact="edithome"]')) {
    e.preventDefault(); m.menu = false; H.edit = true; H.gal = false;
    if (location.hash !== '#/hl') location.hash = '#/hl'; else draw();
    return true;
  }
  if (m.screen !== 'hl') return false;
  // Søkefeltet
  if (t.id === 'm-hlq') {
    if (e.type === 'input') { H.q = t.value; H.open = true; H.sel = -1; updDrop(); fetchSug(); return true; }
    if (e.type === 'focusin') { H.open = true; updDrop(); return true; }
    if (e.type === 'focusout') { setTimeout(() => { if (document.activeElement?.id !== 'm-hlq') { H.open = false; updDrop(); } }, 180); return true; }
    if (e.type === 'keydown') {
      const items = dropItems();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); H.open = true;
        if (e.key === 'ArrowDown') H.sel = H.sel + 1 >= items.length ? -1 : H.sel + 1;
        else H.sel = H.sel - 1 < -1 ? items.length - 1 : H.sel - 1;
        updDrop(); return true;
      }
      if (e.key === 'Escape') { H.open = false; updDrop(); t.blur(); return true; }
      if (e.key === 'Enter' && H.sel >= 0 && items[H.sel]) { e.preventDefault(); run(items[H.sel].t); return true; }
    }
  }
  if (e.type === 'submit' && d('[data-hlform]')) { e.preventDefault(); run(document.getElementById('m-hlq')?.value ?? H.q); return true; }
  // Treff i nedtrekkslisten: pointerdown hindrer at feltet mister fokus før klikket registreres.
  if (e.type === 'pointerdown' && d('#m-hldrop')) { e.preventDefault(); return true; }
  if (e.type === 'click' && (x = d('[data-hls]'))) {
    e.preventDefault();
    const k = x.dataset.hls;
    if (k === 'del') { e.stopPropagation(); const q = x.dataset.q; saveHist((H.hist ?? []).filter((y) => y !== q)); hlApi('/search/history/' + encodeURIComponent(q), { method: 'DELETE' }).catch(() => {}); updDrop(); return true; }
    if (k === 'clear') { saveHist([]); hlApi('/search/history', { method: 'DELETE' }).catch(() => {}); updDrop(); return true; }
    if (k === 'go') { run(x.dataset.q); return true; }
  }
  // Redigering av forsiden: dra en widget (peker), ellers knappene.
  if (H.edit && e.type === 'pointerdown' && (x = d('[data-wgdrag]'))) {
    const el = x.closest('[data-wg]');
    H.drag = { id: x.dataset.wgdrag, y0: e.clientY, el, on: false, pid: e.pointerId };
    try { x.setPointerCapture(e.pointerId); } catch {}
    return true;
  }
  if (H.drag && e.type === 'pointermove') {
    const dy = e.clientY - H.drag.y0;
    if (!H.drag.on && Math.abs(dy) > 6) { H.drag.on = true; H.drag.el.classList.add('dragging'); }
    if (H.drag.on) H.drag.el.style.transform = `translateY(${dy}px) scale(1.02)`;
    return true;
  }
  if (H.drag && e.type === 'pointerup') {
    const g = H.drag; H.drag = null;
    if (!g.on) return true;
    g.el.classList.remove('dragging'); g.el.style.transform = '';
    const vis = [...document.querySelectorAll('[data-wg]')].filter((w) => w !== g.el);
    const y = e.clientY;
    let target = vis.findIndex((w) => { const r = w.getBoundingClientRect(); return y < r.top + r.height / 2; });
    const order = vis.map((w) => w.dataset.wg);
    if (target < 0) target = order.length;
    order.splice(target, 0, g.id);
    // Skjulte widgets beholder plassen sin bakerst i rekkefølgen.
    saveLayout({ sec: [...order, ...lay.sec.filter((id) => !order.includes(id))] });
    return true;
  }
  if (e.type !== 'click' || !(x = d('[data-hle]'))) return false;
  e.preventDefault();
  const k = x.dataset.hle, id = x.dataset.id;
  if (k === 'done') { H.edit = false; H.gal = false; draw(); flash('Forsiden er lagret'); }
  else if (k === 'gal') { H.gal = !H.gal; draw(); }
  else if (k === 'rm') saveLayout({ hide: { ...lay.hide, [id]: true } });
  else if (k === 'add') { saveLayout({ hide: { ...lay.hide, [id]: false } }); flash(`${WD[id][0]} lagt til`); }
  else if (k === 'mvsec') {
    // Flytt blant de synlige widgetene, og behold skjulte der de er.
    const vis = lay.sec.filter((s) => !lay.hide[s]), i = vis.indexOf(id), j = i + +x.dataset.d;
    if (j < 0 || j >= vis.length) return true;
    move('sec', lay.sec.indexOf(id), lay.sec.indexOf(vis[j]));
  } else if (k === 'mv') move(x.dataset.k, +x.dataset.i, +x.dataset.j);
  else if (k === 'tog') saveLayout({ hide: { ...lay.hide, [id]: !lay.hide[id] } });
  else if (k === 'reset') { lay = norm({ start: lay.start, backStyle: lay.backStyle, matTheme: lay.matTheme }); saveLayout({}); flash('Forsiden er tilbakestilt'); }
  return true;
}
export { c3 };
