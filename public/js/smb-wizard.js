// Prompt 30: SMB-veiviser «Sett opp nettverksdisk» – felles for web (Innstillinger → Backup), FinansHub desktop
// (Backup og data → SMB-share) og PWA (Innstillinger → Backup). Papir-stil, store trykkflater, fungerer fra 320 px.
// Fem steg: Finn server → Logg inn → Velg delt mappe → Velg mappe → Test og lagre. API: server/smb-browse.js (/api/smb/*).
// Passordet holdes bare i minnet her og sendes med hvert kall; det lagres (kryptert) på serveren først ved «Lagre»,
// og nullstilles når veiviseren lukkes.
//
//   import { openSmbWizard } from '/assets/js/smb-wizard.js';
//   openSmbWizard({ use: ['system'], encrypted: false, onDone: (r) => … });   r = svaret fra /api/smb/save

const BASE = '/api/smb';
const STEPS = ['Finn server', 'Logg inn', 'Velg delt mappe', 'Velg mappe', 'Test og lagre'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Prompt 40 (claude-code-ai-jobber-og-smb-mappe.md del 2): SMB-reglene. Bare \ / : * ? " < > | og kontrolltegn er forbudt,
// og et navn kan ikke slutte på mellomrom eller punktum. Alt annet er lov, også [ ] { } & ' æ ø å.
const BAD_CH = /[\\/:*?"<>|\u0000-\u001f\u007f]/;
const FORBID = '\\ / : * ? " < > |';
/** null = gyldig, ellers feilmeldingen (med tegnet som er feil). */
export function smbNameError(n) {
  const v = String(n ?? '');
  if (!v.trim()) return 'Skriv et navn på mappen.';
  if (v.length > 255) return 'Mappenavnet er for langt (maks 255 tegn).';
  const m = v.match(BAD_CH);
  if (m) return /[\u0000-\u001f\u007f]/.test(m[0]) ? 'Mappenavnet kan ikke inneholde kontrolltegn.' : `Mappenavnet kan ikke inneholde ${m[0]}`;
  if (/[ .]$/.test(v)) return `Mappenavnet kan ikke slutte på ${v.endsWith(' ') ? 'mellomrom' : 'punktum'}.`;
  if (v === '.' || v === '..') return 'Mappenavnet kan ikke være . eller ..';
  return null;
}
const HINTS = {
  host: ['Sjekk at IP-adressen eller navnet er riktig, og at NAS-en er på.', 'Slå på SMB på NAS-en – Synology: Kontrollpanel → Filtjenester → SMB. QNAP: Nettverks- og filtjenester → Win/Mac/NFS. Windows: Innstillinger → Nettverk → Deling.', 'NAS-en og Homelab-serveren må være på samme hjemmenett.'],
  auth: ['Bruk en bruker som finnes på NAS-en (ikke nødvendigvis den på PC-en).', 'Prøv «Gjest» hvis den delte mappen er åpen for alle.', 'Domene trengs sjelden. På Windows kan det være navnet på PC-en.'],
  access: ['Gi brukeren lese- og skrivetilgang til den delte mappen på NAS-en.', 'Eller gå tilbake og logg inn med en annen bruker.'],
  proto: ['Slå på SMB3 (eller minst SMB2) på NAS-en. Det gamle SMB1 er usikkert og støttes ikke.'],
  share: ['Gå tilbake og velg en annen delt mappe.'],
  notfound: ['Gå et nivå opp og velg mappen på nytt.'],
  exists: ['Velg et annet navn, eller åpne mappen som finnes.'],
  full: ['Frigjør plass på NAS-en, eller velg en annen disk.'],
  missing: ['Installer smbclient på serveren: apt install smbclient (Docker-imaget har det fra før).'],
};

let W = null;
let root = null;
let lastFocus = null;

function css() {
  if (document.getElementById('smbw-css')) return;
  const l = document.createElement('link');
  l.id = 'smbw-css'; l.rel = 'stylesheet'; l.href = '/assets/css/smb-wizard.css';
  document.head.appendChild(l);
}

async function req(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) {
    const msg = r.status === 404 ? 'Serveren har ikke veiviseren ennå. Oppdater Homelab under Innstillinger → Oppdatering.'
      : r.status === 403 ? 'Bare administrator kan sette opp nettverksdisk.' : r.status === 401 ? 'Du er logget ut. Logg inn på nytt.' : d?.error || `Serveren svarte ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status, kind: d?.kind ?? (r.status >= 500 ? 'host' : null), char: d?.char ?? null, name: d?.name ?? null });
  }
  return d;
}
const cred = () => ({ host: W.host, user: W.guest ? '' : W.user, password: W.guest ? '' : W.password, pass: W.guest ? '' : W.password, domain: W.guest ? '' : W.domain });
const target = (path = W.path) => ({ ...cred(), share: W.share, path: path.join('/'), protocol: W.protocol });
// Prompt 36: lagret mål = {host, share, path}, vist som smb://host/share/path.
const label = () => `smb://${W.host}/${W.share}${W.path.length ? '/' + W.path.join('/') : ''}`;

/** Åpner veiviseren. use: forhåndsvalgt bruk ('finans' | 'system'). encrypted: om systembackupen krypteres (advarsel ellers). */
export function openSmbWizard({ use = ['system'], encrypted = null, onDone = null, at = null } = {}) {
  css();
  lastFocus = document.activeElement;
  W = { step: 0, servers: null, scanning: false, manual: '', host: '', ip: '', name: '', user: '', password: '', domain: '', guest: false, showPw: false,
    shares: null, protocol: 'SMB3', share: '', path: [], dirs: null, newDir: null, at: at?.host ? at : null, hidden: false, manualPath: null, openIx: -1, test: null, use: [...use], encrypted, onDone, busy: false, err: null, done: null, probeFail: null };
  root?.remove();
  root = document.createElement('div');
  root.className = 'smbw';
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  document.documentElement.classList.add('smbw-open');
  if (W.at) { W.host = W.at.host; W.ip = ''; W.name = ''; W.step = 1; draw(); return; }
  draw();
  scan();
}
export function closeSmbWizard() {
  if (!root) return;
  root.remove(); root = null;
  document.documentElement.classList.remove('smbw-open');
  if (W) { W.password = ''; W = null; }
  try { lastFocus?.focus?.(); } catch { /* */ }
}
export const smbWizardOpen = () => !!root;

/* ---------------- Handlinger ---------------- */

async function scan() {
  W.scanning = true; W.err = null; draw();
  try { W.servers = await req('/discover'); } catch (e) { W.servers = W.servers ?? []; W.err = { message: e.message, kind: e.status >= 500 ? null : e.kind }; }
  if (!W) return;
  W.scanning = false; draw();
}
function pickServer(s) {
  W.host = s.host; W.ip = s.ip ?? ''; W.name = s.name ?? ''; W.err = null; W.probeFail = null; W.shares = null;
  go(1);
}
async function manual(force = false) {
  const v = W.manual.trim().replace(/^(smb:)?[\\/]+/i, '').replace(/[\\/].*$/, '');
  if (!v) { W.err = { message: 'Skriv IP-adressen (for eksempel 192.168.1.20) eller navnet på serveren.' }; return draw(); }
  if (force) return pickServer({ host: v.toLowerCase() });
  W.busy = true; W.err = null; W.probeFail = null; draw();
  try {
    const r = await req('/probe', { host: v });
    if (r.ok) return pickServer({ host: r.host, ip: r.ip });
    W.probeFail = r.host; W.err = { message: r.message, kind: 'host' };
  } catch (e) { W.err = { message: e.message, kind: e.kind }; }
  finally { if (W) { W.busy = false; draw(); } }
}
async function login(guest) {
  W.guest = !!guest;
  if (!W.guest && !W.user.trim()) { W.err = { message: 'Skriv brukernavnet, eller trykk «Gjest».' }; return draw(); }
  W.busy = true; W.err = null; draw();
  try {
    const r = await req('/shares', cred()); W.shares = r.shares ?? []; W.protocol = r.protocol === 'SMB2' ? 'SMB2' : 'SMB3'; W.busy = false;
    // Prompt 36: «Åpne mappe ›» fra backup-kvitteringen går rett til den lagrede mappen.
    if (W.at?.share) { const a = W.at; W.at = null; W.share = a.share; W.step = 3; await openDir(String(a.path ?? '').split('/').filter(Boolean)); return; }
    go(2);
  }
  catch (e) { W.busy = false; W.err = e.kind === 'connect' ? { message: e.message, kind: 'host' } : { message: e.message, kind: e.kind }; draw(); }
}
async function openDir(path) {
  // Prompt 40: valider hvert ledd for seg (share og sti hver for seg), aldri send ugyldige navn til serveren.
  for (const seg of path) { const bad = smbNameError(seg); if (bad) { W.err = { message: bad, kind: 'name' }; W.manualPath = W.manualPath ?? `/${path.join('/')}`; return draw(); } }
  W.busy = true; W.err = null; W.newDir = null; W.mkOk = null; W.missingDir = null; draw();
  try { W.dirs = await listDir(path); W.path = path; W.openIx = -1; }
  catch (e) { W.err = errOf(e, path); if (e.kind === 'notfound' && path.length) { W.missingDir = path.at(-1); W.path = path; W.dirs = W.dirs ?? []; } }
  if (!W) return;
  W.busy = false; draw();
}
// Prompt 36: POST /api/smb/list {host, share, path, …} (navigerer i undermapper); eldre server: /api/smb/browse.
// Hver mappe kan ha locked/access:false (🔒 «Ingen tilgang for {bruker}»). Skjulte (punktum foran) vises bare med «Vis skjulte».
async function listDir(path) {
  let r;
  try { r = await req('/list', { ...target(path), hidden: W.hidden }); }
  catch (e) { if (e.status !== 404 || e.kind) throw e; r = await req('/browse', target(path)); }
  const L = Array.isArray(r) ? r : r?.dirs ?? r?.items ?? r?.folders ?? [];
  return L.filter((d) => d && (d.dir !== false && d.type !== 'file')).map((d) => (typeof d === 'string' ? { name: d } : d));
}
async function mkdir() {
  const n = (W.newDir ?? '').replace(/^\s+/, '');
  const bad = smbNameError(n);
  if (bad) { W.err = { message: bad, kind: 'name' }; return draw(); }
  W.busy = true; W.err = null; draw();
  try { const r = await req('/mkdir', { ...target(), name: n }); W.busy = false; const ok = r?.writable === false ? `Mappen «${n}» er laget, men brukeren kan ikke skrive i den.` : `Mappen «${n}» er laget ✓`; await openDir([...W.path, n]); if (W) { W.mkOk = ok; draw(); } }
  catch (e) { W.busy = false; W.err = errOf(e, [...W.path, n]); draw(); }
}
async function runTest() {
  W.test = { busy: true }; W.err = null; W.force = false; draw();
  try { W.test = await req('/test', target()); } catch (e) { const er = errOf(e, W.path); W.test = { ok: false, writable: false, message: er.message, kind: er.kind }; }
  if (W) draw();
}
async function save() {
  if (!W.use.length) { W.err = { message: 'Velg hva nettverksdisken skal brukes til.' }; return draw(); }
  W.busy = true; W.err = null; draw();
  try {
    const r = await req('/save', { ...target(), use: W.use, ...(W.force ? { force: true } : {}) });
    W.done = r; W.password = ''; W.busy = false; draw();
    try { W.onDone?.(r); } catch { /* */ }
  } catch (e) { W.busy = false; W.err = errOf(e); draw(); }
}
function go(step) {
  W.step = step; W.err = null;
  if (step === 3 && !W.dirs) { openDir(W.path); return; }
  if (step === 4) { runTest(); return; }
  draw();
  setTimeout(() => root?.querySelector('[data-autofocus]')?.focus(), 20);
}
function back() {
  if (W.done) return closeSmbWizard();
  if (W.step === 3 && W.path.length) return openDir(W.path.slice(0, -1));
  if (W.step === 0) return closeSmbWizard();
  if (W.step === 3) W.dirs = null;
  go(W.step - 1);
}

function onClick(e) {
  const b = e.target.closest('[data-w]');
  if (!b || !W) return;
  const a = b.dataset.w;
  if (b.disabled) return;
  e.preventDefault();
  if (a === 'close' || a === 'bg') return closeSmbWizard();
  if (a === 'back') return back();
  if (a === 'scan') return scan();
  if (a === 'server') return pickServer(W.servers[+b.dataset.i]);
  if (a === 'manual') return manual(false);
  if (a === 'force') return manual(true);
  if (a === 'guest') return login(true);
  if (a === 'login') return login(false);
  if (a === 'showpw') { W.showPw = !W.showPw; draw(); return root.querySelector('[data-f=password]')?.focus(); }
  if (a === 'share') { W.share = W.shares[+b.dataset.i].name; W.path = []; W.dirs = null; return go(3); }
  if (a === 'dir') { const d = W.dirs[+b.dataset.i]; if (d.locked || d.access === false) { W.err = { message: `Ingen tilgang til «${d.name}» for ${W.guest ? 'gjest' : W.user || 'brukeren'}.`, kind: 'access' }; return draw(); } W.openIx = +b.dataset.i; draw(); return openDir([...W.path, d.name]); }
  if (a === 'pick') { const d = W.dirs[+b.dataset.i]; W.path = [...W.path, d.name]; W.dirs = []; return go(4); }
  if (a === 'hidden') { W.hidden = !W.hidden; return openDir(W.path); }
  if (a === 'manpath') { W.manualPath = W.manualPath === null ? `/${W.path.join('/')}` : null; W.err = null; draw(); return root.querySelector('[data-f=manualPath]')?.focus(); }
  if (a === 'crumb') return openDir(W.path.slice(0, +b.dataset.i));
  if (a === 'up') return openDir(W.path.slice(0, -1));
  if (a === 'newdir') { W.newDir = W.newDir === null ? '' : null; W.err = null; draw(); return root.querySelector('[data-f=newDir]')?.focus(); }
  if (a === 'mkdir') return mkdir();
  if (a === 'choose') return go(4);
  if (a === 'retest') return runTest();
  if (a === 'mkmissing') { const n = W.missingDir; if (!n) return; W.newDir = n; W.path = W.path.slice(0, -1); return mkdir(); }
  if (a === 'saveany') { if (!confirm('Lagre uten at skrivetesten er OK? Backup kan feile til nettverksdisken svarer.')) return; W.force = true; return save(); }
  if (a === 'use') { const k = b.dataset.k; W.use = W.use.includes(k) ? W.use.filter((x) => x !== k) : [...W.use, k]; return draw(); }
  if (a === 'save') return save();
  if (a === 'done') return closeSmbWizard();
}
function onInput(e) {
  const f = e.target.dataset.f;
  if (!f || !W) return;
  W[f] = e.target.value;
}
function onSubmit(e) {
  e.preventDefault();
  if (!W) return;
  const f = e.target.dataset.form;
  if (f === 'manual') manual(false);
  else if (f === 'login') login(false);
  else if (f === 'mkdir') mkdir();
  else if (f === 'manpath') { const p = String(W.manualPath ?? '').split(/[\\/]+/).filter(Boolean); W.manualPath = null; openDir(p); }
}
function onKey(e) {
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (W?.newDir !== null && W?.step === 3) { W.newDir = null; draw(); } else closeSmbWizard(); }
  if (e.key === 'Tab') {
    // Fokus blir i dialogen.
    const f = [...root.querySelectorAll('button:not([disabled]),input,a[href]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
}

/* ---------------- Visning ---------------- */

// Prompt 40: NAS-/mappeikon i 36 × 36-rute (ikke tegnet «▤»), og adressen som brødsmuler i vanlig skrift.
const NAS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/></svg>';
const FOLDER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const crumbText = () => [W.share, ...W.path].filter(Boolean).map(esc).join('<span class="smbw-sep" aria-hidden="true">›</span>');
const spin = (t) => `<div class="smbw-wait" role="status"><span class="smbw-spin" aria-hidden="true"></span>${esc(t)}</div>`;
/* Prompt 40: riktig feilmelding per type ({error, kind:'name'|'notfound'|'access'|'connect', char?}).
   Ugyldig navn → bare regelen (ingen nettverkstips). Finnes ikke → «Fant ikke mappen …» + «Opprett mappen».
   Ingen tilgang → hvilken bruker. Får ikke kontakt → nettverkstipsene. */
function errOf(e, path = W?.path ?? []) {
  const last = path.at?.(-1) ?? '', who = W?.guest ? 'gjest' : W?.user || 'brukeren';
  if (e.kind === 'name') return { message: e.char ? `Mappenavnet kan ikke inneholde ${e.char}` : `Mappenavnet kan ikke inneholde ${FORBID}`, kind: 'name' };
  if (e.kind === 'notfound') return { message: last ? `Fant ikke mappen «${last}» i ${W.share}` : `Fant ikke den delte mappen «${W.share}»`, kind: 'notfound' };
  if (e.kind === 'access') return { message: `Brukeren ${who} har ikke skrivetilgang til mappen${last ? ` «${last}»` : ''}`, kind: 'access' };
  if (e.kind === 'connect') return { message: e.message || `Får ikke kontakt med ${W.host}`, kind: 'host' };
  return { message: e.message, kind: e.kind };
}
function errBox(err) {
  if (!err) return '';
  const tips = err.kind === 'name' ? [`Disse tegnene er ikke lov i mappenavn: ${FORBID}. Navnet kan heller ikke slutte på mellomrom eller punktum.`] : err.kind === 'notfound' ? [] : HINTS[err.kind] ?? [];
  return `<div class="smbw-err" role="alert"><b>${esc(err.message)}</b>${tips.length ? `<ul>${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div>`;
}
const row = (attrs, title, sub, right = '›') => `<button type="button" class="smbw-row" ${attrs}><span class="smbw-rt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="smbw-chev" aria-hidden="true">${right}</span></button>`;
const field = (f, lab, type, ph, extra = '') => `<label class="smbw-f"><span>${esc(lab)}</span><input data-f="${f}" type="${type}" value="${esc(W[f])}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${extra}></label>`;

function step0() {
  const list = W.servers ?? [];
  return `<p class="smbw-lead">Homelab leter etter NAS-er og PC-er med fildeling (SMB) på hjemmenettet.</p>
    <div class="smbw-bar"><span class="smbw-lab">Funnet på nettverket</span><button type="button" class="smbw-mini" data-w="scan" ${W.scanning ? 'disabled' : ''} aria-label="Søk igjen">↻ ${W.scanning ? 'Søker …' : 'Søk igjen'}</button></div>
    <div class="smbw-list">${W.scanning && !list.length ? spin('Leter etter servere … (opptil 6 sekunder)')
      : list.length ? list.map((s, i) => row(`data-w="server" data-i="${i}"`, s.name && s.name !== s.host ? s.name : s.host, [s.host !== s.ip && s.name !== s.host ? s.host : '', s.ip].filter(Boolean).join(' · '))).join('')
      : '<div class="smbw-empty">Fant ingen servere automatisk. Skriv inn adressen under.</div>'}</div>
    <form class="smbw-man" data-form="manual"><label class="smbw-f"><span>Eller skriv IP-adresse eller navn</span><input data-f="manual" value="${esc(W.manual)}" placeholder="192.168.1.20 eller nas.local" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-autofocus></label>
      <button class="smbw-btn" ${W.busy ? 'disabled' : ''}>${W.busy ? 'Sjekker …' : 'Neste'}</button></form>
    ${errBox(W.err)}${W.probeFail ? `<button type="button" class="smbw-link" data-w="force">Prøv å logge inn på ${esc(W.probeFail)} likevel</button>` : ''}`;
}
function step1() {
  return `<div class="smbw-who"><span class="smbw-ico" aria-hidden="true">${NAS}</span><span class="smbw-rt"><b>${esc(W.name || W.host)}</b><small>${esc([W.name && W.name !== W.host ? W.host : '', W.ip && W.ip !== W.host ? W.ip : ''].filter(Boolean).join(' · ') || 'SMB-server')}</small></span></div>
    <form data-form="login" class="smbw-form">
      ${field('user', 'Brukernavn', 'text', 'Brukeren på NAS-en', 'data-autofocus autocomplete="username"')}
      <label class="smbw-f"><span>Passord</span><span class="smbw-pw"><input data-f="password" type="${W.showPw ? 'text' : 'password'}" value="${esc(W.password)}" placeholder="Passordet på NAS-en" autocomplete="current-password"><button type="button" class="smbw-mini" data-w="showpw" aria-label="${W.showPw ? 'Skjul passord' : 'Vis passord'}">${W.showPw ? 'Skjul' : 'Vis'}</button></span></label>
      ${field('domain', 'Domene (valgfritt)', 'text', 'WORKGROUP')}
      <p class="smbw-note">Passordet brukes bare mens du setter opp, og lagres kryptert på serveren når du trykker Lagre.</p>
      ${errBox(W.err)}
      <div class="smbw-two"><button type="button" class="smbw-btn ghost" data-w="guest" ${W.busy ? 'disabled' : ''}>Gjest</button><button class="smbw-btn" ${W.busy ? 'disabled' : ''}>${W.busy ? 'Logger inn …' : 'Logg inn'}</button></div>
    </form>`;
}
function step2() {
  const s = W.shares ?? [];
  return `<p class="smbw-lead">Delte mapper på <b>${esc(W.name || W.host)}</b>${W.guest ? ' (gjest)' : W.user ? ` som ${esc(W.user)}` : ''} · ${esc(W.protocol)}</p>
    <div class="smbw-list">${s.length ? s.map((x, i) => row(`data-w="share" data-i="${i}"`, x.name, x.comment)).join('') : '<div class="smbw-empty">Fant ingen delte mapper brukeren har tilgang til. Lag en delt mappe på NAS-en, eller logg inn med en annen bruker.</div>'}</div>
    ${errBox(W.err)}`;
}
function step3() {
  // Prompt 36: smb://host › share › … (trykk hopper opp), trykk på en mappe åpner den, «Velg» per rad, «Bruk denne mappen» øverst.
  const crumbs = [`<span class="smbw-crumb host">smb://${esc(W.host)}</span>`, `<button type="button" class="smbw-crumb" data-w="crumb" data-i="0"${W.path.length ? '' : ' aria-current="true"'}>${esc(W.share)}</button>`, ...W.path.map((p, i) => `<button type="button" class="smbw-crumb" data-w="crumb" data-i="${i + 1}"${i === W.path.length - 1 ? ' aria-current="true"' : ''}>${esc(p)}</button>`)];
  const dirs = W.dirs ?? [], who = W.guest ? 'gjest' : W.user || 'brukeren';
  const drow = (d, i) => {
    const lock = d.locked || d.access === false;
    return `<div class="smbw-drow${lock ? ' lock' : ''}"><button type="button" class="smbw-row" data-w="dir" data-i="${i}"><span class="smbw-ico sm" aria-hidden="true">${lock ? '🔒' : FOLDER}</span><span class="smbw-rt"><b>${esc(d.name)}</b>${lock ? `<small>Ingen tilgang for ${esc(who)}</small>` : d.link ? '<small>Lenke / montert volum</small>' : ''}</span><span class="smbw-chev" aria-hidden="true">${W.busy && W.openIx === i ? '<span class="smbw-spin"></span>' : '›'}</span></button>${lock ? '' : `<button type="button" class="smbw-mini smbw-pick" data-w="pick" data-i="${i}" aria-label="Velg ${esc(d.name)}">Velg</button>`}</div>`;
  };
  return `<nav class="smbw-crumbs" aria-label="Mappesti">${crumbs.join('<span aria-hidden="true">›</span>')}</nav>
    <button type="button" class="smbw-btn wide smbw-usehere" data-w="choose" ${W.busy || !W.dirs || W.missingDir ? 'disabled' : ''}>Bruk denne mappen<small>${crumbText()}</small></button>
    <div class="smbw-tools"><button type="button" class="smbw-mini" data-w="up" ${W.path.length && !W.busy ? '' : 'disabled'}>‹ Opp</button><button type="button" class="smbw-mini" data-w="newdir" ${W.busy ? 'disabled' : ''}>+ Ny mappe</button><button type="button" class="smbw-mini" data-w="manpath">Skriv stien selv</button><button type="button" class="smbw-mini${W.hidden ? ' on' : ''}" data-w="hidden" aria-pressed="${W.hidden}">Vis skjulte</button></div>
    ${W.newDir !== null ? `<form class="smbw-man" data-form="mkdir"><label class="smbw-f"><span>Navn på ny mappe</span><input data-f="newDir" value="${esc(W.newDir)}" placeholder="homelab" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="smbw-btn" ${W.busy ? 'disabled' : ''}>Lag</button></form>` : ''}
    ${W.manualPath !== null ? `<form class="smbw-man" data-form="manpath"><label class="smbw-f"><span>Sti i ${esc(W.share)}</span><input data-f="manualPath" value="${esc(W.manualPath)}" placeholder="/backup/homelab" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button class="smbw-btn" ${W.busy ? 'disabled' : ''}>Åpne</button></form>` : ''}
    ${W.mkOk ? `<div class="smbw-res ok" role="status"><b>${esc(W.mkOk)}</b></div>` : ''}
    ${W.missingDir ? `${errBox(W.err)}<button type="button" class="smbw-btn ghost" data-w="mkmissing" ${W.busy ? 'disabled' : ''}>Opprett mappen «${esc(W.missingDir)}»</button>` : `<div class="smbw-list">${W.busy && !W.dirs ? spin('Henter mapper …') : dirs.length ? dirs.map(drow).join('') : '<div class="smbw-empty">Tom mappe. Bruk denne mappen, eller lag en ny.</div>'}</div>
    ${errBox(W.err)}`}`;
}
function step4() {
  const T = W.test;
  const res = !T || T.busy ? spin('Skriver en liten testfil …')
    : `<div class="smbw-res ${T.ok && T.writable ? 'ok' : 'bad'}" role="status"><b>${T.ok && T.writable ? '✓ Kan skrive' : T.ok ? '✗ Kan ikke skrive' : '✗ Testen feilet'}</b><span>${esc(T.message ?? '')}</span>${!(T.ok && T.writable) && T.kind !== 'name' && T.kind !== 'notfound' ? `<ul>${(HINTS[T.kind ?? (T.ok ? 'access' : 'host')] ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${T.ok && T.writable ? '<span class="smbw-note">Testfilen .homelab-test ble skrevet og slettet igjen.</span>' : ''}<button type="button" class="smbw-mini" data-w="retest">Test på nytt</button></div>`;
  const use = (k, t, s) => `<button type="button" class="smbw-row smbw-chk${W.use.includes(k) ? ' on' : ''}" role="checkbox" aria-checked="${W.use.includes(k)}" data-w="use" data-k="${k}"><span class="smbw-cb" aria-hidden="true">✓</span><span class="smbw-rt"><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`;
  const warn = W.use.includes('system') && W.encrypted === false
    ? '<div class="smbw-warn"><b>Systembackupen er ikke kryptert.</b> På eget hjemmenett er det greit, men vi anbefaler å slå på «Krypter backup» under Backup → Hvor, så filene på NAS-en ikke kan leses av andre.</div>' : '';
  return `<div class="smbw-who"><span class="smbw-ico" aria-hidden="true">${FOLDER}</span><span class="smbw-rt"><b class="smbw-crumbtxt">${crumbText()}</b><small>${esc(W.name || W.host)} · ${esc(W.guest ? 'Gjest' : W.user)} · ${esc(W.protocol)}</small><details class="smbw-det"><summary>Detaljer</summary><span class="smbw-mono">${esc(label())}</span></details></span></div>
    ${res}
    <div class="smbw-lab">Bruk nettverksdisken til</div>
    <div class="smbw-list">${use('finans', 'FinansHub-backup', 'Hele databasen, kvitteringer og innstillinger')}${use('system', 'Systembackup', 'Kopi av hver backup fra Innstillinger → Backup')}</div>
    ${warn}${errBox(W.err)}`;
}
function doneView() {
  return `<div class="smbw-done" role="status"><div class="smbw-big" aria-hidden="true">✓</div><p>Koblet til</p><b class="smbw-mono">${esc(W.done.label)} ✓</b>
    <span class="smbw-note">${esc([W.done.use?.includes('finans') ? 'FinansHub-backup' : '', W.done.use?.includes('system') ? 'Systembackup' : ''].filter(Boolean).join(' og '))} bruker nettverksdisken fra nå av.</span></div>`;
}

function draw() {
  if (!root || !W) return;
  const active = document.activeElement, af = active?.dataset?.f, sel = af ? [active.selectionStart, active.selectionEnd] : null;
  const body = W.done ? doneView() : [step0, step1, step2, step3, step4][W.step]();
  const foot = W.done ? '<button type="button" class="smbw-btn wide" data-w="done" data-autofocus>Ferdig</button>'
    : `<button type="button" class="smbw-btn ghost" data-w="back">${W.step === 0 ? 'Avbryt' : '‹ Tilbake'}</button>${W.step === 3 ? `<button type="button" class="smbw-btn" data-w="choose" ${W.busy || !W.dirs ? 'disabled' : ''}>Bruk denne mappen</button>` : W.step === 4 ? `<span class="smbw-fr">${!W.busy && W.test && !W.test.busy && !W.test.writable && W.use.length ? '<button type="button" class="smbw-link" data-w="saveany">Lagre likevel</button>' : ''}<button type="button" class="smbw-btn" data-w="save" ${W.busy || !W.test?.writable || !W.use.length ? 'disabled' : ''}>${W.busy ? 'Lagrer …' : 'Lagre'}</button></span>` : ''}`;
  root.innerHTML = `<div class="smbw-bg" data-w="bg"></div>
  <section class="smbw-sheet" role="dialog" aria-modal="true" aria-labelledby="smbw-t">
    <header class="smbw-head"><div><span class="smbw-kick">Nettverksdisk · ${W.done ? 'Ferdig' : `steg ${W.step + 1} av 5`}</span><h2 id="smbw-t">${W.done ? 'Klar' : esc(STEPS[W.step])}</h2></div><button type="button" class="smbw-x" data-w="close" aria-label="Lukk">✕</button></header>
    <ol class="smbw-steps" aria-hidden="true">${STEPS.map((_, i) => `<li class="${W.done || i < W.step ? 'past' : i === W.step ? 'now' : ''}"></li>`).join('')}</ol>
    <div class="smbw-body">${body}</div>
    <footer class="smbw-foot">${foot}</footer>
  </section>`;
  const again = af ? root.querySelector(`[data-f="${af}"]`) : null;
  if (again) { again.focus(); try { again.setSelectionRange(...sel); } catch { /* */ } }
  else if (!root.contains(active) || active === document.body) (root.querySelector('[data-autofocus]') ?? root.querySelector('.smbw-x'))?.focus();
}
