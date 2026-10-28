// Prompt 48 (WEB48): Innstillinger › AI › Kvitteringer – Mac-OCR og stegene i kvitteringskjeden på serveren.
// Brukes tre steder: Homelab web (Innstillinger → AI, settings-ai.js), FinansHub på desktop (Innstillinger → AI,
// desktop.js) og PWA-en (Finans → AI og tolkning → fanen «Kvitteringer», mobile-p34ai.js).
//   GET  /finans/api/receipts/health        → status for Mac-OCR, lokal modell, Tesseract og Gemini (+ sperren) og stegene
//   GET  /finans/api/settings               → canEditServer, server.macOcrUrl og server.macOcrKeySet (bare admin)
//   PUT  /finans/api/settings               → {macOcrUrl, macOcrKey} | {receipts48:{deviceOcr|deviceParse|macOcr|tesseract|gemini|compareMac}}
//   POST /finans/api/receipts/mac-ocr/test  → «Test tilkobling» (admin)
// Nøkkelen vises aldri: bare «satt» / «ikke satt». Gemini er grå med forklaring når «Finansdata forlater aldri huset»
// (eller sky-budsjettet) sperrer eksterne tjenester. Bare admin endrer; andre ser status.
//
// Bruk: mountReceipts48(el) tegner i el (og laster ved behov). viewReceipts48() gir HTML til verter som tegner med
// strenger (PWA); alle elementer med [data-r48-host] tegnes på nytt når noe endres. Hendelsene lyttes på document.

const X = { health: null, set: null, err: '', loading: null, t: 0, busy: '', msg: '', ok: true, test: null, url: null, key: '', showKey: false };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const ms = (v) => (v == null ? '' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1).replace('.', ',')} s`);

async function fin(path, opts = {}) {
  const r = await fetch(`/finans/api${path}`, { method: opts.method ?? 'GET', credentials: 'same-origin', headers: opts.json !== undefined ? { 'Content-Type': 'application/json' } : {}, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw Object.assign(new Error(d.error || `Serveren svarte ${r.status}`), { status: r.status });
  return d;
}

function css() {
  if (document.getElementById('r48-css')) return;
  const l = document.createElement('link');
  l.id = 'r48-css'; l.rel = 'stylesheet';
  l.href = `/assets/css/receipts48.css${new URL(import.meta.url).search}`;
  document.head.appendChild(l);
}

export async function loadReceipts48(force = false) {
  if (X.loading) return X.loading;
  if (!force && X.health && Date.now() - X.t < 15000) return X.health;
  X.loading = (async () => {
    const [h, s] = await Promise.allSettled([fin('/receipts/health'), fin('/settings')]);
    if (h.status === 'fulfilled') { X.health = h.value; X.err = ''; } else X.err = h.reason?.status === 404 ? 'Serveren har ikke den nye kvitteringskjeden ennå. Oppdater Homelab.' : h.reason?.message ?? 'Kunne ikke hente status';
    if (s.status === 'fulfilled') X.set = s.value;
    X.t = Date.now();
  })().finally(() => { X.loading = null; });
  await X.loading;
  paint();
  return X.health;
}

const admin = () => !!X.set?.canEditServer;
const dot = (st) => `<i class="r48s-dot ${st}" aria-hidden="true"></i>`;
const sw = (on) => `<span class="r48s-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;

function statusRows(H) {
  const m = H.macOcr ?? {}, mo = H.model ?? {}, t = H.tesseract ?? {}, g = H.gemini ?? {};
  const macTxt = m.enabled === false ? 'Slått av' : m.ok ? ['Svarer', m.ms != null ? ms(m.ms) : '', m.version ? `v${m.version}` : '', (m.languages ?? []).length ? m.languages.join(', ') : ''].filter(Boolean).join(' · ')
    : !m.configured ? 'Ikke satt opp – legg inn nøkkelen under' : m.error ?? 'Svarer ikke';
  const rows = [
    ['Mac-OCR (Apple Vision)', macTxt, m.enabled === false ? 'off' : m.ok ? 'ok' : 'bad'],
    [`Lokal modell · ${mo.name ?? 'qwen3:8b'}`, mo.ok ? (mo.installed === false ? `Ollama svarer, men modellen mangler – kjør: ollama pull ${mo.name ?? 'qwen3:8b'}` : 'Klar') : mo.error ?? 'Svarer ikke', mo.ok && mo.installed !== false ? 'ok' : 'bad'],
    ['Tesseract (reserve)', t.enabled === false ? 'Slått av' : t.installed ? (t.version || 'Installert') : 'Ikke installert på serveren', t.enabled === false ? 'off' : t.installed ? 'ok' : 'warn'],
    // Prompt 52 (WEB52F): Gemini leser aldri kvitteringer (heller ikke som reserve) – raden er fjernet.
  ];
  return rows.map(([n, s, st]) => `<div class="r48s-row"><span class="r48s-col">${dot(st)}<b>${esc(n)}</b></span><span class="r48s-v" data-r48s-st="${esc(n)}">${esc(s)}</span></div>`).join('');
}

function macCard(H) {
  const m = H.macOcr ?? {}, keySet = X.set?.server?.macOcrKeySet ?? m.keySet ?? false;
  const url = X.url ?? X.set?.server?.macOcrUrl ?? m.url ?? 'http://10.69.1.173:8765';
  if (!admin()) return `<div class="r48s-card"><span class="r48s-lab">MAC-OCR</span><div class="r48s-note">Adressen og nøkkelen til OCR-tjenesten på Mac mini-en settes av administrator.</div></div>`;
  const T = X.test;
  const testLine = T ? `<div class="r48s-test ${T.ok ? 'ok' : 'bad'}" role="status">${esc(T.ok ? ['Tilkoblet', ms(T.ms), T.version ? `v${T.version}` : '', (T.languages ?? []).join(', '), T.languageNote ?? ''].filter(Boolean).join(' · ') : T.error ?? 'Svarer ikke')}</div>` : '';
  return `<form class="r48s-card" data-r48s-form autocomplete="off"><span class="r48s-lab">MAC-OCR</span>
    <label class="r48s-f"><span>Adresse</span><input data-r48s-in="url" type="url" inputmode="url" spellcheck="false" value="${esc(url)}" placeholder="http://10.69.1.173:8765" aria-label="Adresse til Mac-OCR"></label>
    <label class="r48s-f"><span>Nøkkel <em class="r48s-pill ${keySet ? 'on' : ''}" data-r48s-keyset>${keySet ? 'satt' : 'ikke satt'}</em></span><input data-r48s-in="key" type="password" value="${esc(X.key)}" placeholder="${keySet ? '•••••••• lagret på serveren – skriv for å bytte' : '64 tegn fra install.sh'}" aria-label="Nøkkel til Mac-OCR" autocomplete="new-password"></label>
    <div class="r48s-acts"><button type="submit" class="r48s-btn pri" data-r48s="save"${X.busy ? ' disabled' : ''}>${X.busy === 'save' ? 'Lagrer …' : 'Lagre'}</button><button type="button" class="r48s-btn" data-r48s="test"${X.busy ? ' disabled' : ''}>${X.busy === 'test' ? 'Tester …' : 'Test tilkobling'}</button>${keySet ? `<button type="button" class="r48s-btn ghost" data-r48s="clearkey"${X.busy ? ' disabled' : ''}>Fjern nøkkelen</button>` : ''}</div>
    ${testLine}
    <div class="r48s-note">Tjenesten kjører på Mac mini-en (tools/vision-ocr/install.sh) og svarer bare Glimt-serveren. Nøkkelen lagres kryptert og vises aldri igjen.</div></form>`;
}

const STEPS = [
  ['deviceParse', 'A · Tolket på telefonen', 'Bruk kvitteringen iPhone har tolket (et forslag – Glimt kontrollerer den)'],
  ['deviceOcr', 'B · Teksten fra telefonen', 'Lokal modell leser teksten iPhone/Android har lest ut'],
  ['macOcr', 'C · Mac-OCR', 'Apple Vision på Mac mini-en leser bildet, så tolker den lokale modellen'],
  ['tesseract', 'Tesseract', 'Reserve på serveren når Mac-OCR ikke svarer'],
  ['compareMac', 'Sammenlign totalen med Mac-OCR', 'Når telefonen leste teksten, sjekkes totalen også mot Mac-OCR'],
];
function stepsCard(H) {
  const st = { ...(H.steps ?? {}), compareMac: H.compareMac }, blk = H.gemini?.blocked ?? H.external?.blocked, can = admin();
  const rows = STEPS.map(([k, n, s]) => {
    const gem = k === 'gemini' && blk, on = !!st[k] && !gem, dis = !can || gem || X.busy === k;
    const sub = gem ? `${H.gemini?.blockedReason ?? H.external?.text ?? 'Eksterne tjenester er sperret'}: Gemini brukes ikke for kvitteringer, og ingenting sendes ut av huset. Slå av sperren i AI → Oppgaver for å bruke Gemini som siste reserve.` : s;
    return `<button type="button" class="r48s-li${gem ? ' blocked' : ''}" role="switch" aria-checked="${on}" data-r48s="tog" data-k="${k}"${dis ? ' disabled' : ''}${gem ? ' aria-describedby="r48s-gem"' : ''}><span class="r48s-col2"><b>${esc(n)}</b><span${gem ? ' id="r48s-gem"' : ''}>${esc(sub)}</span></span>${sw(on)}</button>`;
  }).join('');
  return `<div class="r48s-card"><span class="r48s-lab">STEG I KJEDEN</span>${rows}
    <div class="r48s-note">Rekkefølgen er A → B → C → Tesseract, ellers legges kvitteringen i kø og prøves igjen; første steg som består kontrollen, vinner. Selve lesingen på telefonen slås på i FinansHub-appen (av som standard).${can ? '' : ' Bare administrator kan endre stegene.'}</div></div>`;
}

export function viewReceipts48() {
  css();
  const H = X.health;
  if (!H) return `<section class="r48s" data-r48s-root><div class="r48s-hd"><b>Kvitteringer</b><span>${esc(X.err || 'Laster status …')}</span></div></section>`;
  const blk = H.external?.blocked;
  return `<section class="r48s" data-r48s-root><div class="r48s-hd"><b>Kvitteringer</b><span>Telefonen → Mac mini → Tesseract → kø. Glimt leser lokalt – kvitteringsbilder sendes aldri ut av huset.</span></div>
    ${blk ? `<div class="r48s-lock" role="note"><b>${esc(H.external.text ?? 'Eksterne tjenester er sperret')}</b><span>Ingen kvitteringsdata sendes ut av huset – verken til Gemini, Groq, Roboflow eller Brønnøysund.</span></div>` : ''}
    <div class="r48s-card"><span class="r48s-lab">STATUS</span>${statusRows(H)}${(H.categories ?? []).length ? `<div class="r48s-note">Kategoriforslag velges fra ${H.categories.length} kategorier: ${esc(H.categories.slice(0, 6).join(', '))}${H.categories.length > 6 ? ' …' : ''}</div>` : ''}</div>
    ${macCard(H)}${stepsCard(H)}
    ${X.msg ? `<div class="r48s-msg ${X.ok ? 'ok' : 'bad'}" role="status">${esc(X.msg)}</div>` : ''}</section>`;
}

/** Tegner alle verter på nytt (beholder fokus og markør i et felt som skrives i). */
const listeners = new Set(); // prompt 65: AI-kontroll tegner Kvitteringer og Mac-OCR-raden selv fra samme tilstand
function paint() {
  for (const fn of listeners) { try { fn(X); } catch { /* */ } }
  const hosts = document.querySelectorAll('[data-r48-host]');
  if (!hosts.length) return;
  const a = document.activeElement, k = a?.dataset?.r48sIn, pos = k ? [a.selectionStart, a.selectionEnd] : null;
  const html = viewReceipts48();
  hosts.forEach((h) => { h.innerHTML = html; });
  if (k) { const n = document.querySelector(`[data-r48-host] [data-r48s-in="${k}"]`); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(...pos); } catch { /* type=url */ } } }
}

function flash(msg, ok = true) { X.msg = msg; X.ok = ok; paint(); clearTimeout(flash.t); flash.t = setTimeout(() => { X.msg = ''; paint(); }, 6000); }

async function save(clearKey = false) {
  const body = {};
  const url = String(X.url ?? '').trim();
  if (X.url != null && url !== (X.set?.server?.macOcrUrl ?? '')) body.macOcrUrl = url;
  if (clearKey) body.macOcrKey = '';
  else if (X.key.trim()) {
    if (!/^[A-Za-z0-9._~+/=-]{16,512}$/.test(X.key.trim())) return flash('Nøkkelen ser ikke riktig ut (minst 16 tegn, ingen mellomrom)', false);
    body.macOcrKey = X.key.trim();
  }
  if (!Object.keys(body).length) return flash('Ingen endringer å lagre');
  X.busy = clearKey ? 'clearkey' : 'save'; paint();
  try {
    X.set = await fin('/settings', { method: 'PUT', json: body });
    const bad = body.macOcrUrl !== undefined && body.macOcrUrl && X.set?.server?.macOcrUrl !== body.macOcrUrl.replace(/\/+$/, '');
    X.key = ''; X.url = null; X.test = null; X.busy = '';
    await loadReceipts48(true);
    flash(bad ? 'Adressen ble ikke lagret – bruk formen http://10.69.1.173:8765 (uten sti)' : clearKey ? 'Nøkkelen er fjernet' : 'Lagret', !bad);
  } catch (e) { X.busy = ''; flash(e.status === 403 ? 'Bare administrator kan endre Mac-OCR' : e.message, false); }
}
async function test() {
  X.busy = 'test'; X.test = null; paint();
  try { X.test = await fin('/receipts/mac-ocr/test', { method: 'POST' }); }
  catch (e) { X.test = { ok: false, error: e.status === 403 ? 'Bare administrator kan teste' : e.message }; }
  X.busy = ''; paint();
  loadReceipts48(true);
}
async function toggle(k) {
  const H = X.health; if (!H || !admin()) return;
  const cur = k === 'compareMac' ? !!H.compareMac : !!H.steps?.[k];
  X.busy = k;
  if (k === 'compareMac') H.compareMac = !cur; else H.steps = { ...H.steps, [k]: !cur };
  paint();
  try { X.set = await fin('/settings', { method: 'PUT', json: { receipts48: { [k]: !cur } } }); X.busy = ''; await loadReceipts48(true); }
  catch (e) { if (k === 'compareMac') H.compareMac = cur; else H.steps = { ...H.steps, [k]: cur }; X.busy = ''; flash(e.message, false); }
}

let bound = false;
function bind() {
  if (bound) return; bound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-r48-host] [data-r48s]');
    if (!b || b.disabled) return;
    const a = b.dataset.r48s;
    if (a === 'save') return; // submit-hendelsen tar den
    e.preventDefault(); e.stopPropagation();
    if (a === 'test') test(); else if (a === 'clearkey') save(true); else if (a === 'tog') toggle(b.dataset.k);
  }, true);
  document.addEventListener('submit', (e) => { if (!e.target.closest?.('[data-r48-host] [data-r48s-form]')) return; e.preventDefault(); e.stopPropagation(); save(false); }, true);
  document.addEventListener('input', (e) => { const k = e.target?.dataset?.r48sIn; if (!k || !e.target.closest('[data-r48-host]')) return; e.stopPropagation(); if (k === 'url') X.url = e.target.value; else X.key = e.target.value; }, true);
}

/** Monterer seksjonen i el (kan kalles på nytt etter hver tegning av verten). */
export function mountReceipts48(el) {
  if (!el) return;
  bind();
  el.setAttribute('data-r48-host', '');
  el.innerHTML = viewReceipts48();
  loadReceipts48(false);
}
/** For verter som tegner med strenger: kall etter at [data-r48-host] er i DOM-en. */
export function ensureReceipts48() { bind(); loadReceipts48(false); }
export const _r48State = X;
/* Prompt 65 (AI → Kvitteringer og AI → Tjenester → Mac-OCR): samme tilstand og handlinger, tegnet av ai-control.js. */
export function onReceipts48(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Prompt 72: én verdi i settings.receipts48 (LFM-motorene: visionEngine72, crossCheck72, layoutStep72, lfmBackend72, lfm3Model72, lfm25Model72). Bare admin. */
async function setOpt72(k, v) {
  if (!admin() || !/^(visionEngine72|crossCheck72|layoutStep72|lfmBackend72|lfm3Model72|lfm25Model72)$/.test(k)) return;
  X.busy = k; paint();
  try { X.set = await fin('/settings', { method: 'PUT', json: { receipts48: { [k]: v } } }); X.busy = ''; await loadReceipts48(true); flash('Lagret'); }
  catch (e) { X.busy = ''; flash(e.status === 403 ? 'Bare administrator kan endre kvitteringsmotorene' : e.message, false); }
}
export const r48Act = { save: (clearKey = false) => save(clearKey), test: () => test(), toggle: (k) => toggle(k), setUrl: (v) => { X.url = v; }, setKey: (v) => { X.key = v; }, set72: (k, v) => setOpt72(k, v) };
export const r48Admin = () => admin();
export const R48_STEPS = STEPS;
