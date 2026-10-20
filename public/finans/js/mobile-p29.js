// Prompt 29 (PWA): Hjem-søkefelt med valgfri søkemotor (Glimt / Google / DuckDuckGo) og menyen i eget lag over
// kortene, timer som gjenkjennes og legges i kalenderen i bakgrunnen (pille «✦ Legger til i kalenderen …» og banner med
// Angre / Vis), og Innstillinger → KONTO → Backup (hele systemet, bare admin).
// Fasit: design/Mobil Papir App.dc.html (Hjem-søket, Innstillinger → Backup) og Kalender.dc.html (rask time).
// Tolkeren er felles med server og web: /assets/js/quick-time.js. API (kontrakt 29): /api/kalender/quick*, /api/backup/*.
// Mangler endepunktene (404), tolkes timen lokalt og lagres via /api/kalender/events (eller på enheten).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { grp } from './mobile-p17.js';
import * as CHAT from './mobile-chat.js';
import * as KAL from './mobile-kal.js';
import { parseQuick, quickLabel } from '/assets/js/quick-time.js';
import * as P31 from './mobile-p31.js';
import * as P32 from './mobile-p32.js';
import * as P36 from './mobile-p36.js'; // prompt 36: spørsmål med dato er ikke avtaler, én Glimt-visning, backup-kvittering

const svg = (d, s = 16, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* =====================================================================
   1. Hjem: søkefelt med søkemotor
   ===================================================================== */
const ENG = { ai: ['Glimt', 'Spør om været, eller skriv «time hos …»', 'Svarer her og legger til timer'], google: ['Google', 'Søk på Google', 'Åpner google.com'], ddg: ['DuckDuckGo', 'Søk med DuckDuckGo', 'Åpner duckduckgo.com'] };
const GLOGO = (s) => P31.GLOGO(s); // prompt 39: lat (importrekkefølgen kan gi TDZ) // Prompt 31: logoene ligger i mobile-p31.js (ekte Google-G og DuckDuckGo-and)
// Prompt 31: Glimt-merket (Klar; Tenker mens svaret hentes) i stedet for ✦, ekte logoer for Google og DuckDuckGo.
const engIcon = (k, big) => (k === 'google' ? GLOGO(big ? 22 : 20) : k === 'ddg' ? P31.DLOGO(big ? 22 : 20) : P31.glimt(big ? 24 : 24, !big && P31.G.ans?.busy ? 'think' : 'ready', 'p31-eng'));

export const SE = { eng: ENG[lsGet('papir_search')] ? lsGet('papir_search') : 'ai', q: '', open: false, pos: null };
/** Fra GET /api/me/layout (search_engine er personlig). */
export function take29(r) { const v = r?.search_engine ?? r?.searchEngine; if (ENG[v]) { SE.eng = v; lsSet('papir_search', v); } }
function setEng(k) {
  if (!ENG[k]) return; SE.eng = k; SE.open = false; lsSet('papir_search', k); haptic('tab'); draw();
  hlApi('/me/layout', { method: 'PUT', json: { search_engine: k } }).catch(() => {});
}
/** Tolker teksten: en time hvis den har dato og intensjon/type (samme regler som Kalender → rask time). */
function apptOf(q) {
  const t = String(q ?? '').trim();
  if (t.length <= 4) return null;
  // Prompt 36: spørsmålsvakt før avtaletolkning («hvor mange timer med dagslys er det 29.06.2027?» er et spørsmål).
  if (P36.isQ(t)) return null;
  const r = parseQuick(t, todayKey());
  if (!(r.ok && r.isAppointment)) return null;
  // Intensjonsordet må være et helt ord: «timer», «timeplan» og «sommertid» teller ikke som «time».
  if (/time/i.test(t) && !P36.hasApptWord(t) && !/(frisør|lege|tannlege|møte|trening|kl\.?\s*\d|\d{1,2}[.:]\d{2})/i.test(t)) return null;
  return r;
}
const apptHtml = (r) => (r ? `<button type="button" class="p29-ap" data-p29="addq"><span class="p29-apic">${svg('M4 5h16v15H4zM4 10h16M9 3v4M15 3v4', 16)}</span><span class="m-grow"><b>${esc(r.title)}</b><span>${esc(quickLabel(r))}</span></span><span class="p29-apb">Legg i kalender</span></button>` : '');

/** Kortet h1 på Hjem. Menyen tegnes i et eget lag (searchLayer) over alle kortene. */
export function searchCard() {
  const e = SE.eng, r = apptOf(SE.q);
  return `<div class="p29-sw"><form class="p29-sf" data-p29f="search" role="search">
    <button type="button" class="p29-eng" data-p29="eng" aria-label="Velg søkemotor" aria-haspopup="menu" aria-expanded="${SE.open}">${engIcon(e)}${svg('M6 9l6 6 6-6', 10, 3)}</button>
    <input id="p29-q" name="q" type="text" enterkeyhint="go" value="${esc(SE.q)}" placeholder="${esc(ENG[e][1])}" aria-label="${esc(ENG[e][1])}" autocomplete="off" autocapitalize="sentences">
    <button type="button" class="p29-clr${SE.q ? '' : ' off'}" data-p29="clr" aria-label="Tøm">${svg('M6 6l12 12M18 6L6 18', 11, 3.2)}</button>
    <button type="button" class="p29-ai" data-p29="chat" aria-label="Åpne Chat">✦ AI</button></form>
    <div id="p29-apw">${apptHtml(r) || (globalThis.P41?.huskeRow?.(SE.q) ?? '')}</div>${P31.ansBubble()}</div>`;
}
/** Eget overlay-lag (fast posisjon) så menyen alltid ligger over kortene på Hjem. */
export function searchLayer() {
  if (!SE.open || m.screen !== 'hl') return '';
  const p = SE.pos ?? { top: 120, left: 16 };
  return `<div class="p29-scrim" data-p29="engx"></div><div class="p29-menu" role="menu" aria-label="Søk med" style="top:${p.top}px;left:${p.left}px"><span class="p29-ml">SØK MED</span>
    ${Object.keys(ENG).map((k) => `<button type="button" role="menuitemradio" aria-checked="${SE.eng === k}" data-p29="seteng" data-k="${k}">${engIcon(k, true)}<span class="m-grow"><b>${ENG[k][0]}</b><span>${ENG[k][2]}</span></span><span class="p29-ck"${SE.eng === k ? '' : ' style="opacity:0"'}>${svg('M5 12.5l4.5 4.5L19 7', 16, 2.6)}</span></button>`).join('')}</div>`;
}
function syncSearch() {
  const r = apptOf(SE.q), w = document.getElementById('p29-apw');
  if (w) w.innerHTML = apptHtml(r) || (globalThis.P41?.huskeRow?.(SE.q) ?? ''); // prompt 41: «Legg i Huskeliste»
  document.querySelector('.p29-clr')?.classList.toggle('off', !SE.q);
}
function searchGo() {
  const t = SE.q.trim(); if (!t) return;
  document.activeElement?.blur?.();
  // Prompt 32: alt som sendes fra søkefeltet logges for brukeren (vises bare på web under «Nylige søk»).
  P32.hsLog(t, SE.eng === 'ai' ? 'glimt' : SE.eng);
  const r = apptOf(t);
  if (r) { SE.q = ''; draw(); quickRun(t, r); return; }
  // Prompt 41: huskebeskjeder («vi må huske å …») går til Huskeliste som Glimt-jobb i bakgrunnen, med samme animasjon som timer.
  if (SE.eng === 'ai' && globalThis.P41?.isHuske?.(t)) { SE.q = ''; draw(); globalThis.P41.huskeFromHome(t); return; }
  if (SE.eng === 'google' || SE.eng === 'ddg') {
    const url = SE.eng === 'google' ? `https://www.google.com/search?q=${encodeURIComponent(t)}` : `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
    SE.q = ''; draw(); window.open(url, '_blank', 'noopener'); return;
  }
  // Prompt 31: Glimt svarer i en boble under søkefeltet (ikke hopp til Chat). «Fortsett i Chat ›» åpner samtalen.
  // Prompt 32: snarveier først (lokalt, umiddelbart), så lokale verktøy og Glimt med grense før Chat tar over.
  SE.q = ''; const sc = P32.shortcut(t);
  if (sc) { P31.navAns(t, sc.href, sc.label, 'Snarvei'); return; }
  // Prompt 36: handlinger («påminn meg …», «legg til melk») vises bare i pillen øverst; spørsmål bare under søket.
  if (P36.isAction(t)) { draw(); P31.ask(t, { surface: 'pill' }); return; }
  draw(); P31.ask(t);
}

/* =====================================================================
   2. Rask time i bakgrunnen: jobber, pille og banner
   ===================================================================== */
// QJ.jobs: [{id, text, local?}] som ikke er ferdige. QJ.toast: {t, l, w?, jobId?, eventId?, date, local?}.
export const QJ = { jobs: [], toast: null, poll: null, tt: null, seen: new Set(), missing: false };
const EV_BODY = (r, text) => ({ title: r.title, allDay: !r.start, date: r.date, start: r.start || '', end: r.end || '', location: r.place || '', calendar: 'privat', repeat: 'none', reminder: '1h', note: text.length > 60 ? text : '', source: 'AI · rask time' });
const shortTxt = (t) => (t.length > 40 ? `${t.slice(0, 38)}…` : t);

/** Legger teksten i køen på serveren; uten endepunktet tolkes den lokalt. Arket/feltet er allerede lukket. */
export async function quickRun(text, parsed) {
  const t = String(text ?? '').trim(); if (!t) return;
  const tmp = { id: `tmp${Date.now()}`, text: t };
  QJ.jobs.push(tmp); haptic('tap');
  // Prompt 31: jobben vises i Glimt-toasten (trykk → glassboble med steg og det AI har funnet).
  const pr = parsed?.ok ? parsed : (() => { try { return parseQuick(t, todayKey()); } catch { return null; } })();
  P31.jobPut(tmp.id, { kind: 'quick', title: 'Legger til i kalenderen', model: 'Glimt · lokal', input: t, dur: 2600,
    fields: pr?.ok ? [['Hva', pr.title], ['Når', quickLabel(pr)], ['Kalender', 'Privat'], ['Varsel', pr.start ? '1 time før' : 'Ingen']] : [] });
  draw();
  if (!QJ.missing) {
    try {
      const r = await hlApi('/kalender/quick', { method: 'POST', json: { text: t } });
      const nid = String(r?.jobId ?? r?.id ?? tmp.id); P31.jobRename(tmp.id, nid); tmp.id = nid;
      if (tmp.cancelled) { cancelQuick({ id: nid }); return; }
      startPoll(); return;
    } catch (e) { if (e.status !== 404 && e.status !== 405) { dropJob(tmp.id); fail(t, null, e.message); return; } QJ.missing = true; }
  }
  // Reserve: lokal tolkning (samme regler) og vanlig lagring.
  await new Promise((ok) => setTimeout(ok, 600));
  if (tmp.cancelled) { dropJob(tmp.id); return; }
  const r = parsed?.ok ? parsed : parseQuick(t, todayKey());
  if (!r.ok) { dropJob(tmp.id); fail(t, r, r.why); return; }
  const body = EV_BODY(r, t);
  let eventId = null, local = false;
  try { const x = await hlApi('/kalender/events', { method: 'POST', json: body }); eventId = x?.id ?? x?.event?.id ?? null; }
  catch (e) {
    if (e.status === 404 || e.status === 405) { eventId = KAL.kalAddLocal(body); local = true; }
    else { dropJob(tmp.id); fail(t, r, e.status === 409 ? 'Google må kobles til på nytt med skrivetilgang.' : e.message); return; }
  }
  dropJob(tmp.id);
  done({ t: r.title, l: quickLabel(r), w: r.start ? '' : 'Fant ikke klokkeslett, lagt inn som hele dagen.', eventId, date: r.date, local });
}
function dropJob(id) { QJ.jobs = QJ.jobs.filter((j) => j.id !== id); P31.jobDrop(id); }
function done(toast) {
  // Prompt 31: toasten bytter til «✓ Nina frisør · fre 25. sep · 14:30 lagt i kalenderen» (Angre / Vis) og forsvinner etter 3 s.
  QJ.toast = null;
  P31.aiDone(`${toast.t} · ${toast.l} lagt i kalenderen`, { undo: () => { QJ.toast = toast; return undo(); }, show: () => { if (toast.date) KAL.kalShowDay(toast.date); }, ms: toast.w ? 5000 : 3200 });
  if (toast.w) flash(toast.w);
  KAL.kalLoad(true).then(draw).catch(() => draw()); draw();
}
/** Avbryt fra glassboblen: POST /api/kalender/quick/:id/cancel (reserven lagrer da ingenting). */
async function cancelQuick(j) {
  const id = String(j?.id ?? ''); const q = QJ.jobs.find((x) => x.id === id);
  if (q) q.cancelled = true;
  QJ.seen.add(id); dropJob(id);
  if (id && !id.startsWith('tmp')) await hlApi(`/kalender/quick/${encodeURIComponent(id)}/cancel`, { method: 'POST', json: {} }).catch(() => {});
  else if (q) QJ.jobs.push(q); // venter på svar fra POST; quickRun ser cancelled og rydder selv
  P31.jobDrop(id); draw();
}
P31.hooks31({ quickCancel: cancelQuick });
function fail(text, found, why) {
  haptic('err');
  const f = found ?? {};
  KAL.kalFormPrefill({ title: f.title || f.tittel || '', ...(f.date || f.dato ? { date: f.date || f.dato } : {}), ...(f.start ? { start: f.start, end: f.end || f.slutt || f.start } : {}), location: f.place || f.sted || '', reminder: '1h', note: text, err: `${why || 'Fant ikke timen.'} Velg dato og lagre.` });
}
function startPoll() {
  if (QJ.poll) return;
  const tick = async () => {
    if (!QJ.jobs.length) { clearInterval(QJ.poll); QJ.poll = null; return; }
    let list;
    try { list = await hlApi('/kalender/quick/jobs'); } catch { return; }
    const arr = Array.isArray(list) ? list : list?.jobs ?? [];
    for (const j of QJ.jobs.slice()) {
      const x = arr.find((y) => String(y.id) === j.id);
      if (!x || (x.state !== 'done' && x.state !== 'failed') || QJ.seen.has(j.id)) continue;
      QJ.seen.add(j.id); dropJob(j.id);
      if (x.state === 'done') { const R = x.result ?? {}; done({ t: R.title ?? 'Timen', l: R.label ?? quickLabel(R), eventId: R.eventId, date: R.date, jobId: j.id }); }
      else fail(j.text, x.found, x.error);
    }
    draw();
  };
  QJ.poll = setInterval(tick, 2000);
}
/** Sanntid (calendar-quick over /api/ws): sjekk køen med en gang. */
export function onQuickRealtime(d) { if (d) P31.onQuickRealtime31(d); if (QJ.jobs.length) { clearInterval(QJ.poll); QJ.poll = null; startPoll(); hlApi('/kalender/quick/jobs').then(() => {}).catch(() => {}); } else KAL.kalLoad(true).then(() => { if (m.screen === 'kal' || m.screen === 'hl') draw(); }).catch(() => {}); }
async function undo() {
  const T = QJ.toast; if (!T) return;
  QJ.toast = null; draw();
  try {
    if (T.local) KAL.kalDelLocal(T.eventId);
    else if (T.jobId) await hlApi(`/kalender/quick/${encodeURIComponent(T.jobId)}/undo`, { method: 'POST', json: {} });
    else if (T.eventId) await hlApi(`/kalender/events/${encodeURIComponent(T.eventId)}`, { method: 'DELETE' });
    flash('Timen er fjernet');
  } catch (e) { flash(e.message); }
  KAL.kalLoad(true).then(draw).catch(() => {});
}
/** Pille og banner øverst (alle sider). */
export function quickLayer() {
  const n = QJ.jobs.length, T = QJ.toast;
  const pill = ''; // Prompt 31: pillen er erstattet av Glimt-toasten (mobile-p31.js aiLayer)
  const ban = T && !n ? `<div class="p29-ban" role="status"><span class="m-grow"><b>✓ ${esc(T.t)}</b><span>${esc(T.l)}${m.screen === 'hl' ? ' · lagt i kalenderen' : ''}</span>${T.w ? `<span>${esc(T.w)}</span>` : ''}</span><button data-p29="undo">Angre</button><button class="pri" data-p29="show">Vis</button></div>` : '';
  return pill + ban;
}

/* =====================================================================
   3. Innstillinger → KONTO → Backup (hele systemet, bare admin)
   ===================================================================== */
const SCHED = [['nightly', 'Hver natt 03:00'], ['6h', 'Hver 6. time'], ['weekly', 'Hver uke · søndag'], ['monthly', 'Hver måned']];
const KEEP = [['7', '7 siste'], ['30', '30 siste'], ['90d', '90 dager'], ['1y', '1 år']];
const SCOPE = [['all', 'Hele systemet'], ['finans', 'Bare Finans'], ['custom', 'Egendefinert']];
const MODS = [['finans', 'Finans', 'Transaksjoner, kvitteringer, budsjett, abonnementer'], ['kalender', 'Kalender', ''], ['familie', 'Familie', ''], ['mat', 'Mat', ''], ['sporing', 'Sporing', ''], ['huske', 'Gjøremål', ''], ['bursdager', 'Bursdager', ''], ['chat', 'Chat', 'Samtaler og kunnskapsbase'], ['domener', 'Domener', ''], ['innstillinger', 'Innstillinger og brukere', ''], ['filer', 'Bilder og filer', '']];
const cloudIn = (c = {}, extra = {}) => { const o = { enabled: !!c.enabled, provider: c.provider ?? 'b2' }; for (const k of ['bucket', 'endpoint', 'region', 'prefix']) if (c[k] != null) o[k] = c[k]; return { ...o, ...extra }; };
const nm = (L, k) => L.find(([a]) => a === k)?.[1] ?? k;
export const isAdmin = () => m.me?.role === 'admin';
export const BK = { st: 'idle', s: null, list: null, status: null, err: '', run: null, poll: null, key: null, rs: null, f: {} };
const pad = (n) => String(n).padStart(2, '0');
function when(v) {
  if (!v) return '';
  const d = new Date(v); if (Number.isNaN(+d)) return String(v);
  const t = new Date(), y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === t.toDateString()) return d.getHours() < 6 ? `I natt ${hm}` : `I dag ${hm}`;
  if (d.toDateString() === y.toDateString()) return `I går ${hm}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm}`;
}
function size(b) {
  if (b == null || Number.isNaN(+b)) return '';
  const u = [['GB', 1e9], ['MB', 1e6], ['kB', 1e3]].find(([, f]) => +b >= f);
  return u ? `${(+b / u[1]).toLocaleString('nb-NO', { maximumFractionDigits: +b / u[1] < 10 ? 1 : 0 })} ${u[0]}` : `${b} B`;
}
const scopeOf = (x) => (x?.scope === 'custom' && Array.isArray(x.modules) ? (x.modules.length === 1 ? nm(MODS, x.modules[0]) : `${x.modules.length} moduler`) : nm(SCOPE, x?.scope ?? 'all'));
/** Undertekst på raden i Innstillinger. */
export function bkSummary() {
  if (BK.st === 'idle' && isAdmin()) setTimeout(() => bkLoad().then(() => { if (m.screen === 'set' && !m.sub) draw(); }), 0);
  const s = BK.s; if (!s) return BK.st === 'missing' ? 'Krever nyere server' : '';
  return s.auto === false ? 'Automatisk av' : `${nm(SCHED, s.schedule)} · ${nm(SCOPE, s.scope)}`;
}
export async function bkLoad() {
  if (!isAdmin()) return;
  if (BK.st === 'loading') return; BK.st = 'loading';
  try {
    const [s, l, st] = await Promise.all([hlApi('/backup/settings'), hlApi('/backup/list').catch(() => []), hlApi('/backup/status').catch(() => null)]);
    BK.s = s; BK.list = Array.isArray(l) ? l : l?.items ?? []; BK.status = st; BK.st = 'ok'; BK.err = '';
    const run = st?.running ?? st?.current ?? null;
    if (run && !BK.poll) bkPoll();
  } catch (e) { BK.st = e.status === 404 ? 'missing' : 'err'; BK.err = e.status === 403 ? 'Bare administrator kan se backup.' : e.message; }
}
async function bkSave(patch) {
  BK.s = { ...(BK.s ?? {}), ...patch }; draw();
  try { BK.s = (await hlApi('/backup/settings', { method: 'PUT', json: patch })) ?? BK.s; } catch (e) { flash(e.message); await bkLoad(); }
  draw();
}
function bkPoll() {
  clearInterval(BK.poll);
  BK.poll = setInterval(async () => {
    let st; try { st = await hlApi('/backup/status'); } catch { return; }
    BK.status = st;
    const run = st?.running ?? st?.current ?? null;
    if (!run) {
      clearInterval(BK.poll); BK.poll = null; BK.run = null;
      const last = st?.last ?? st?.latest;
      flash(last && last.ok === false ? `Backup feilet: ${last.error ?? ''}` : '✓ Backup ferdig');
      BK.list = await hlApi('/backup/list').catch(() => BK.list);
    } else BK.run = { pct: Math.round(run.pct ?? run.progress ?? 0) };
    if (m.screen === 'set' && String(m.sub ?? '').startsWith('sysbk')) draw();
  }, 1500);
}
/** Prompt 30: felles SMB-veiviser (/assets/js/smb-wizard.js). Lagrer til systembackupen og/eller FinansHub-backupen. */
export async function openSmb(use, onDone = null) {
  haptic('tap');
  const { openSmbWizard } = await import('/assets/js/smb-wizard.js');
  openSmbWizard({ use, encrypted: !!BK.s?.encrypt, onDone: async () => { if (BK.s) { BK.st = 'idle'; await bkLoad(); } if (onDone) await onDone(); draw(); } });
}
async function bkRun() {
  if (BK.run) return;
  BK.run = { pct: 0 }; haptic('tap'); draw();
  try { await hlApi('/backup/run', { method: 'POST', json: {} }); bkPoll(); }
  catch (e) { BK.run = null; flash(e.message); }
}
async function bkEncrypt(on) {
  if (!on) { if (BK.s?.cloud?.enabled) { flash('Kopi til sky krever kryptering'); return; } return bkSave({ encrypt: false }); }
  if (!BK.s?.keySet) {
    try { const r = await hlApi('/backup/key', { method: 'POST', json: {} }); if (r?.key) BK.key = r.key; } catch (e) { flash(e.message); return; }
  }
  await bkSave({ encrypt: true });
}
const tg = (k, label, sub, on, ic) => `<button class="opt-row p17-row p29-tg" data-p29="bktog" data-k="${k}" role="switch" aria-checked="${!!on}">${ic ? `<span class="set-ic fill p29-bic">${svg(ic, 16)}</span>` : ''}<span class="m-grow p17-rt"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="sw" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
const rw = (label, sub, val, act, ic, cls = '', extra = '') => `<${act ? `button class="opt-row p17-row ${cls}" data-p29="${act}" ${extra}` : `div class="opt-row p17-row ${cls}"`}>${ic ? `<span class="set-ic fill p29-bic">${svg(ic, 16)}</span>` : ''}<span class="m-grow p17-rt"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${val ? `<span class="sval p29-bv ${cls}">${val}</span>` : ''}</${act ? 'button' : 'div'}>`;
const IC = { bk: 'M12 3a9 9 0 1 1-8.5 6M3 4v5h5M12 8v4l3 2', lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', cloud: 'M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18z', disk: 'M4 6h16v5H4zM4 13h16v5H4zM8 8.5h.01M8 15.5h.01', bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0', nas: 'M5 4h14v16H5zM8 8h8M8 12h8M9 16.5h.01M12 16.5h.01' };

export function backupPage() {
  if (!isAdmin()) return '<div class="pp-card p29-note"><span class="pp-mut">Backup av hele systemet settes opp av administrator.</span></div>';
  if (BK.st === 'idle') { bkLoad().then(draw); return '<div class="m-spin"></div>'; }
  if (BK.st === 'loading' && !BK.s) return '<div class="m-spin"></div>';
  if (BK.st === 'missing') return '<div class="pp-card p29-note"><b>Krever nyere server</b><span class="pp-mut">Backup av hele systemet krever nyere server. Oppdater Homelab under Innstillinger → Oppdatering.</span></div>';
  if (BK.st === 'err' && !BK.s) return `<div class="pp-card p29-note"><span class="pp-mut">${esc(BK.err || 'Fikk ikke hentet backup-oppsettet.')}</span></div><button class="pp-btn" data-p29="bkreload">Prøv igjen</button>`;
  const s = BK.s ?? {}, st = BK.status ?? {}, last = st.last ?? st.latest ?? BK.list?.[0] ?? null, run = BK.run ?? ((st.running ?? st.current) ? { pct: Math.round((st.running ?? st.current).pct ?? 0) } : null);
  const auto = s.auto !== false, custom = s.scope === 'custom', mods = new Set(s.modules ?? []), cloud = s.cloud ?? {};
  const lastTxt = last ? [when(last.at ?? last.finishedAt ?? last.started), size(last.size), scopeOf(last)].filter(Boolean).join(' · ') : 'Ingen backup ennå';
  const okV = last ? (last.ok === false ? '<span class="p29-bad">Feilet</span>' : '<span class="p29-ok">✓ OK</span>') : '';
  const status = [rw('Siste backup', lastTxt + (last?.ok === false && last.error ? ` · ${last.error}` : ''), okV, null, IC.bk), P36.bkReceipt(last), // prompt 36: verifisert fil på nettverksdisken
    run ? `<div class="opt-row p17-row p29-run"><span class="set-ic fill p29-bic">${svg(IC.bk, 16)}</span><span class="m-grow p17-rt"><b>Tar backup … ${run.pct} %</b><small>Du kan lukke appen, den fortsetter i bakgrunnen.</small><span class="p29-bar"><i style="width:${run.pct}%"></i></span></span></div>`
      : rw('Ta backup nå', nm(SCOPE, s.scope ?? 'all'), '<span class="p29-lab">Start ›</span>', 'bkrun', IC.bk)];
  const autoRows = [tg('auto', 'Automatisk backup', 'Kjører i bakgrunnen på hjemmeserveren', auto, IC.bk),
    ...(auto ? [rw('Hvor ofte', nm(SCHED, s.schedule ?? 'nightly'), 'Endre ›', 'bkcyc', '', '', 'data-k="schedule"'), rw('Behold', `${nm(KEEP, s.keep ?? '30')} · eldre slettes automatisk`, 'Endre ›', 'bkcyc', '', '', 'data-k="keep"'), tg('notifyFail', 'Varsle meg når backup feiler', 'Push og e-post til administrator', s.notifyFail !== false, IC.bell)] : [])];
  const what = `<div class="p29-seg" role="radiogroup" aria-label="Omfang">${SCOPE.map(([k, n]) => `<button data-p29="bkscope" data-k="${k}" role="radio" aria-checked="${(s.scope ?? 'all') === k}">${n}</button>`).join('')}</div>`;
  const modRows = MODS.map(([k, n, sub]) => { const on = s.scope === 'finans' ? k === 'finans' : custom ? mods.has(k) : true; return `<button class="opt-row p17-row p29-mod" data-p29="bkmod" data-k="${k}" role="checkbox" aria-checked="${on}"${custom ? '' : ' aria-disabled="true"'}><span class="p29-cb${on ? ' on' : ''}">${on ? '✓' : ''}</span><span class="m-grow p17-rt"><b>${esc(n)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`; });
  const gdNo = cloud.provider === 'gdrive' && (cloud.providers?.find((p) => p.id === 'gdrive')?.supported === false || cloud.supported === false);
  const sm = s.target?.smb;
  const smbRows = !sm ? [] : !sm.share ? [rw('SMB / nettverksdisk', 'Kopier hver backup til en NAS på hjemmenettet', '<span class="p29-lab">Sett opp ›</span>', 'bksmb', IC.nas)]
    : [tg('smb', 'Kopi til nettverksdisk', `${sm.host ? P36.smbUrl(sm) : sm.label}${sm.lastError ? ` · feilet: ${sm.lastError}` : sm.lastUpload ? ` · sist ${when(sm.lastUpload)}` : ''}`, !!sm.enabled, IC.nas),
      rw('Sett opp nettverksdisk', 'Bytt server, bruker eller mappe', '<span class="p29-lab">Veiviser ›</span>', 'bksmb'),
      ...(sm.enabled && !s.encrypt ? ['<div class="opt-row p17-row p29-smbw"><span class="m-grow pp-mut">Kopieres ukryptert. Greit på eget hjemmenett, men «Krypter backup» anbefales.</span></div>'] : [])];
  const where = [rw('Lagres på', `Homelab-disk · ${s.target?.path ?? '/srv/backup'}`, '<span class="pp-mut">Lokal</span>', null, IC.disk),
    ...smbRows,
    tg('cloud', 'Kopi til sky', `${cloud.provider === 'gdrive' ? 'Google Drive' : 'Backblaze B2'} · kryptert før opplasting${cloud.lastError ? ` · feilet: ${cloud.lastError}` : cloud.lastUpload ? ` · sist ${when(cloud.lastUpload)}` : ''}`, !!cloud.enabled, IC.cloud),
    ...(cloud.enabled || BK.cloudOpen ? [`<div class="opt-row p17-row col p29-cl"><div class="p29-seg sm">${[['b2', 'Backblaze B2'], ['gdrive', 'Google Drive']].map(([k, n]) => `<button data-p29="bkprov" data-k="${k}" aria-checked="${(cloud.provider ?? 'b2') === k}" role="radio">${n}</button>`).join('')}</div>${gdNo ? '<span class="pp-mut">Google Drive: Kommer. Koble Google på nytt med Drive-tilgang når det støttes.</span>' : (cloud.provider ?? 'b2') === 'b2' ? `${[['bucket', 'Bucket', 'mitt-homelab'], ['endpoint', 'Endepunkt', 's3.eu-central-003.backblazeb2.com'], ['keyId', 'Key ID', cloud.keySet ? '•••• lagret' : ''], ['appKey', 'Application key', cloud.keySet ? '•••• lagret' : '']].map(([k, n, ph]) => `<label class="p29-in"><span>${n}</span><input data-p29in="${k}" type="${k === 'appKey' ? 'password' : 'text'}" value="${esc(BK.f[k] ?? (k === 'bucket' || k === 'endpoint' ? cloud[k] ?? '' : ''))}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></label>`).join('')}<button class="pp-btn sm" data-p29="bkcloud">Lagre sky-oppsett</button>` : ''}</div>`] : []),
    tg('encrypt', 'Krypter backup', s.keySet ? 'AES-256 · nøkkel lagres hos deg' : 'AES-256 · gjenopprettingsnøkkel vises én gang', !!s.encrypt, IC.lock),
    ...(s.encrypt && s.keySet ? [rw('Ny gjenopprettingsnøkkel', 'Gamle backuper trenger den gamle nøkkelen', 'Lag ny ›', 'bknewkey')] : [])];
  const L = (BK.list ?? []).slice(0, 8);
  const restore = [...L.map((x) => rw(when(x.at), [size(x.size), scopeOf(x), x.encrypted ? 'kryptert' : '', x.cloud ? 'i sky' : '', x.ok === false ? 'feilet' : ''].filter(Boolean).join(' · '), x.ok === false ? '' : '<span class="p29-lab">Gjenopprett ›</span>', x.ok === false ? null : 'bkrs', '', '', `data-id="${esc(x.id)}"`)),
    L.length ? `<a class="opt-row p17-row" href="/api/backup/${encodeURIComponent(L.find((x) => x.ok !== false)?.id ?? L[0].id)}/download" download><span class="m-grow p17-rt"><b>Last ned siste backup</b><small>${esc(`${L[0].format ? `.${L[0].format}` : '.tar.gz'}${L[0].encrypted ? '.enc' : ''} · ${size(L[0].size)}`)}</small></span><span class="sval p29-lab">Last ned ›</span></a>` : '<div class="opt-row p17-row"><span class="m-grow pp-mut">Ingen backuper ennå</span></div>'];
  return `${grp('STATUS', status)}${grp('AUTOMATISK', autoRows)}<span class="pp-lab p17-gl">HVA SKAL TAS MED</span>${what}<div class="list p17-list${custom ? '' : ' p29-dim'}">${modRows.join('')}</div>${custom ? '' : '<div class="snote">Velg «Egendefinert» for å velge moduler selv.</div>'}
    ${grp('HVOR', where)}${grp('GJENOPPRETT', restore)}<div class="snote">Gjenoppretting tar en sikkerhetskopi av dagens data først. Bare administrator kan se og endre backup.</div>`;
}
/** Arkene (nøkkel, ny nøkkel, gjenopprett) tegnes i rot-laget over fanelinja. */
export const sheets29 = () => (m.screen === 'set' && String(m.sub ?? '').startsWith('sysbk') && isAdmin() ? bkSheets() : '');
function bkSheets() {
  if (BK.key) return `<div class="sheet-bg" data-p29="keyx"></div><div class="pp-sheet p29-sh" role="dialog" aria-label="Gjenopprettingsnøkkel"><span class="pp-grab"></span><div class="pp-sh">Gjenopprettingsnøkkel</div>
    <span class="pp-mut">Lagre nøkkelen et trygt sted (f.eks. passordbehandleren). Den vises bare denne ene gangen, og uten den kan krypterte backuper ikke åpnes.</span>
    <code class="p29-key">${esc(BK.key)}</code><button class="pp-btn" data-p29="keycopy">Kopier nøkkel</button><button class="pp-btn ink" data-p29="keyx">Jeg har lagret den</button></div>`;
  if (BK.rot) return `<div class="sheet-bg" data-p29="rotx"></div><div class="pp-sheet p29-sh" role="dialog" aria-label="Ny gjenopprettingsnøkkel"><span class="pp-grab"></span><div class="pp-sh">Ny gjenopprettingsnøkkel</div>
    <span class="pp-mut">Nye backuper krypteres med den nye nøkkelen. Den gamle beholdes på serveren så eldre backuper kan gjenopprettes.</span>
    <label class="p29-in"><span>Passord</span><input id="p29-rotpw" data-p29in="rspw" type="password" autocomplete="current-password"></label>${BK.rot.err ? `<span class="p29-bad">${esc(BK.rot.err)}</span>` : ''}
    <button class="pp-btn ink" data-p29="rotgo" ${BK.rot.busy ? 'disabled' : ''}>${BK.rot.busy ? 'Lager …' : 'Lag ny nøkkel'}</button><button class="pp-btn" data-p29="rotx">Avbryt</button></div>`;
  const R = BK.rs; if (!R) return '';
  const x = (BK.list ?? []).find((y) => String(y.id) === R.id) ?? {}, avail = Array.isArray(x.modules) && x.modules.length ? MODS.filter(([k]) => x.modules.includes(k)) : MODS;
  return `<div class="sheet-bg" data-p29="rsx"></div><div class="pp-sheet tall p29-sh" role="dialog" aria-label="Gjenopprett"><span class="pp-grab"></span><div class="pp-sh">Gjenopprett ${esc(when(x.at).replace(/^I /, "i "))}</div>
    <div class="p29-seg"><button data-p29="rsall" data-k="1" aria-checked="${R.all}" role="radio">Hele backupen</button><button data-p29="rsall" data-k="0" aria-checked="${!R.all}" role="radio">Velg moduler</button></div>
    ${R.all ? '' : `<div class="list p17-list">${avail.map(([k, n]) => `<button class="opt-row p17-row p29-mod" data-p29="rsmod" data-k="${k}" role="checkbox" aria-checked="${R.mods.includes(k)}"><span class="p29-cb${R.mods.includes(k) ? ' on' : ''}">${R.mods.includes(k) ? '✓' : ''}</span><span class="m-grow p17-rt"><b>${esc(n)}</b></span></button>`).join('')}</div>`}
    <div class="p29-warn">Nåværende data i ${R.all ? 'alle modulene' : 'valgte moduler'} overskrives. Det tas automatisk en sikkerhetskopi først.</div>
    <label class="p29-in"><span>Passord (bekreft at det er deg)</span><input id="p29-rspw" data-p29in="rspw" type="password" autocomplete="current-password" value=""></label>
    ${x.encrypted && R.needKey ? '<label class="p29-in"><span>Gjenopprettingsnøkkel</span><input id="p29-rskey" data-p29in="rskey" type="text" autocomplete="off" autocapitalize="off"></label>' : ''}
    ${R.err ? `<span class="p29-bad">${esc(R.err)}</span>` : ''}
    <button class="pp-btn ink p29-red" data-p29="rsgo" ${R.busy ? 'disabled' : ''}>${R.busy ? 'Gjenoppretter …' : 'Gjenopprett'}</button><button class="pp-btn" data-p29="rsx">Avbryt</button></div>`;
}
async function restoreGo() {
  const R = BK.rs; if (!R || R.busy) return;
  const pw = document.getElementById('p29-rspw')?.value ?? '';
  if (!pw) { R.err = 'Skriv passordet ditt.'; draw(); return; }
  const x = (BK.list ?? []).find((y) => String(y.id) === R.id) ?? {};
  const modules = R.all ? (Array.isArray(x.modules) && x.modules.length ? x.modules : MODS.map(([k]) => k)) : R.mods;
  if (!modules.length) { R.err = 'Velg minst én modul.'; draw(); return; }
  R.busy = true; R.err = ''; draw();
  try {
    const key = document.getElementById('p29-rskey')?.value?.trim(); const r = await hlApi('/backup/restore', { method: 'POST', json: { id: R.id, modules, password: pw, ...(key ? { key } : {}) } });
    BK.rs = null; flash('✓ Gjenopprettet. Laster appen på nytt …');
    setTimeout(() => location.reload(), r?.reload === false ? 2500 : 1200);
  } catch (e) { R.busy = false; R.err = e.message === 'Feil passord' ? 'Feil passord.' : e.message; if (/nøkkel/i.test(e.message)) R.needKey = true; draw(); }
}

/* =====================================================================
   4. Hendelser
   ===================================================================== */
export function input29(e, t) {
  if (t.id === 'p29-q') { SE.q = t.value; syncSearch(); return true; }
  const k = t.dataset?.p29in; if (k) { if (k !== 'rspw' && k !== 'rskey') BK.f[k] = t.value; return true; }
  return false;
}
export async function submit29(e, t) {
  if (!t.matches?.('[data-p29f="search"]')) return false;
  e.preventDefault(); searchGo(); return true;
}
export async function bind29(e, t) {
  const x = t.closest?.('[data-p29]'); if (!x) return false;
  const a = x.dataset.p29; e.preventDefault();
  switch (a) {
    case 'eng': {
      if (SE.open) { SE.open = false; draw(); return true; }
      const r = x.getBoundingClientRect(), w = Math.min(270, innerWidth - 32);
      SE.pos = { top: Math.round(r.bottom + 10), left: Math.round(Math.max(16, Math.min(r.left - 6, innerWidth - w - 16))) };
      SE.open = true; SE.at = Date.now(); document.activeElement?.blur?.(); haptic('tap'); draw(); return true;
    }
    case 'engx': SE.open = false; draw(); return true;
    case 'seteng': setEng(x.dataset.k); return true;
    case 'clr': SE.q = ''; { const i = document.getElementById('p29-q'); if (i) { i.value = ''; i.focus(); } } syncSearch(); return true;
    case 'chat': SE.q = ''; CHAT.openChat(''); return true;
    case 'addq': searchGo(); return true;
    case 'undo': await undo(); return true;
    case 'show': { const T = QJ.toast; QJ.toast = null; if (T?.date) KAL.kalShowDay(T.date); else draw(); return true; }
    case 'bkreload': BK.st = 'idle'; draw(); return true;
    case 'bkrun': await bkRun(); return true;
    case 'bksmb': openSmb(['system']); return true;
    case 'bktog': {
      const k = x.dataset.k, s = BK.s ?? {};
      if (k === 'auto') return bkSave({ auto: s.auto === false }), true;
      if (k === 'notifyFail') return bkSave({ notifyFail: s.notifyFail === false }), true;
      if (k === 'encrypt') { await bkEncrypt(!s.encrypt); return true; }
      if (k === 'smb') { haptic('tap'); try { BK.s = (await hlApi('/backup/settings', { method: 'PUT', json: { target: { smb: { enabled: !s.target?.smb?.enabled } } } })) ?? BK.s; } catch (err) { flash(err.message); } draw(); return true; }
      if (k === 'cloud') {
        const on = !s.cloud?.enabled;
        if (on && !s.encrypt) { flash('Slå på «Krypter backup» først – ingenting sendes ukryptert til sky.'); return true; }
        if (on && !(s.cloud?.bucket && s.cloud?.endpoint)) { BK.cloudOpen = !BK.cloudOpen; draw(); return true; } // fyll inn B2 først
        if (!on) BK.cloudOpen = false;
        await bkSave({ cloud: cloudIn(s.cloud, { enabled: on }) }); return true;
      }
      return true;
    }
    case 'bkcyc': { const k = x.dataset.k, Lst = k === 'schedule' ? SCHED : KEEP, cur = BK.s?.[k] ?? (k === 'schedule' ? 'nightly' : '30'), i = Lst.findIndex(([v]) => v === cur); haptic('tab'); await bkSave({ [k]: Lst[(i + 1) % Lst.length][0] }); return true; }
    case 'bkscope': { const k = x.dataset.k; haptic('tab'); await bkSave({ scope: k, ...(k === 'custom' && !(BK.s?.modules ?? []).length ? { modules: MODS.map(([v]) => v) } : {}) }); return true; }
    case 'bkmod': { if (BK.s?.scope !== 'custom') return true; const k = x.dataset.k, cur = new Set(BK.s.modules ?? []); if (cur.has(k)) cur.delete(k); else cur.add(k); await bkSave({ modules: MODS.map(([v]) => v).filter((v) => cur.has(v)) }); return true; }
    case 'bkprov': await bkSave({ cloud: cloudIn(BK.s?.cloud, { provider: x.dataset.k }) }); return true;
    case 'bkcloud': {
      const f = BK.f, c = cloudIn(BK.s?.cloud, { enabled: true }); for (const k of ['bucket', 'endpoint', 'keyId', 'appKey']) if (f[k]) c[k] = f[k].trim();
      try { BK.s = await hlApi('/backup/settings', { method: 'PUT', json: { cloud: c } }); BK.f = {}; BK.cloudOpen = false; flash('Sky-oppsettet er lagret'); } catch (err) { flash(err.message); }
      draw(); return true;
    }
    case 'bknewkey': BK.rot = { err: '', busy: false }; draw(); setTimeout(() => document.getElementById('p29-rotpw')?.focus(), 60); return true;
    case 'rotx': BK.rot = null; draw(); return true;
    case 'rotgo': {
      const pw = document.getElementById('p29-rotpw')?.value ?? ''; if (!pw) { BK.rot.err = 'Skriv passordet ditt.'; draw(); return true; }
      BK.rot.busy = true; draw();
      try { const r = await hlApi('/backup/key', { method: 'POST', json: { rotate: true, password: pw } }); BK.rot = null; if (r?.key) BK.key = r.key; } catch (err) { BK.rot = { busy: false, err: err.message }; }
      draw(); return true;
    }
    case 'keycopy': try { await navigator.clipboard.writeText(BK.key ?? ''); flash('Nøkkelen er kopiert'); } catch { flash('Kunne ikke kopiere – merk og kopier teksten'); } return true;
    case 'keyx': BK.key = null; BK.s = { ...(BK.s ?? {}), keySet: true }; draw(); return true;
    case 'bkrs': BK.rs = { id: x.dataset.id, all: true, mods: [], busy: false, err: '' }; draw(); setTimeout(() => document.getElementById('p29-rspw')?.focus(), 60); return true;
    case 'rsx': BK.rs = null; draw(); return true;
    case 'rsall': if (BK.rs) { BK.rs.all = x.dataset.k === '1'; draw(); } return true;
    case 'rsmod': if (BK.rs) { const k = x.dataset.k, s = BK.rs.mods; BK.rs.mods = s.includes(k) ? s.filter((v) => v !== k) : [...s, k]; draw(); } return true;
    case 'rsgo': await restoreGo(); return true;
    default: return true;
  }
}
/** Lukk menyer når man går til en annen side. */
export function leave29() { SE.open = false; BK.rs = null; }
addEventListener('scroll', () => { if (SE.open && Date.now() - (SE.at ?? 0) > 500) { SE.open = false; draw(); } }, { capture: true, passive: true });
addEventListener('resize', () => { if (SE.open) { SE.open = false; draw(); } });
