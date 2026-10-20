// Innlogging og førstegangsoppsett på web i Papir-stil (prompt 25, fasit «Homelab Papir Web.dc.html», tweak gate).
// Innlogging: server, brukernavn og passord (POST /api/auth/login), deretter tofaktorkode med 6 siffer
// (POST /api/auth/totp med billetten fra steg 1). Gjenopprettingskoder godtas i samme felt.
// Onboarding (tom server, GET /api/setup/status): 1) navn og server, 2) brukernavn og passord to ganger,
// 3) bakgrunn, 4) oppsummering og «Start Homelab» (POST /api/setup). Etterpå lagres Papir · lys og bakgrunnen
// i /api/me/layout.
import { loadAppIdentity } from './appicon.js';
import { initI18n, setLang, lang } from './i18n.js';
import { noteUser } from './usercache.js';
import { initQr, showQr } from './login-qr38.js'; // prompt 38: QR-innlogging fra mobilen

const $ = (id) => document.getElementById(id);
const form = $('gate');
const OV = 'linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 35%,rgba(0,0,0,.4))';
const GRAD = 'linear-gradient(170deg,#7d93aa,#4a5f76)';
// Bakgrunnene i steg 3 og hvilken bgType de lagres som (samme valg som Innstillinger → Bakgrunn).
const BGO = [
  ['oslo', 'Oslo', 'Bilde av Oslo', '/assets/bg/oslo.jpg'],
  ['weather', 'Vær nå', 'Følger været', '/assets/bg/weather-cloudy.jpg'],
  ['planets', 'Planeter', 'Ny planet hver dag', '/assets/bg/planets-1.jpg'],
  ['none', 'Ingen bilde', 'Dempet blå', null],
];
const BG_KEY = 'hl_gate_bg'; // enhetsvalg: bildet på innloggingssiden (beholdes ved utlogging)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privat modus */ } };

const st = {
  mode: 'login', // login | 2fa | onboarding
  step: 0,
  ticket: null,
  recovery: false,
  bg: BGO.some((b) => b[0] === lsGet(BG_KEY)) ? lsGet(BG_KEY) : 'oslo',
  userEdited: false,
  app: 'Homelab',
  qr: false, // prompt 38: serveren har QR-innlogging
};

// Brukernavn foreslås fra navnet: små bokstaver, æ→ae, ø→o, å→a, bare a–z og 0–9.
export const slug = (s) => String(s).toLowerCase().replace(/æ/g, 'ae').replace(/[øö]/g, 'o').replace(/[åä]/g, 'a')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 32);

const greet = () => { const h = new Date().getHours(); return h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' : h < 18 ? 'God ettermiddag' : h < 23 ? 'God kveld' : 'God natt'; };
const host = (u) => String(u).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const bgOf = (k) => BGO.find((b) => b[0] === k) ?? BGO[0];
const bgCss = (k, shade) => { const u = bgOf(k)[3]; return u ? `${shade ? OV + ',' : ''}url('${u}')` : GRAD; };

const TEXT = {
  onb: [
    ['STEG 1 AV 4', 'Velkommen til din nye server', 'Gi deg selv og serveren et navn. Det kan endres senere.', 'Neste'],
    ['STEG 2 AV 4', 'Innlogging', 'Velg brukernavn og passord. Tofaktor kan slås på etterpå.', 'Neste'],
    ['STEG 3 AV 4', 'Velg bakgrunn', 'Bildet øverst på alle sider. Kan endres når som helst.', 'Neste'],
    ['STEG 4 AV 4', 'Nesten ferdig', 'Sjekk at alt stemmer.', 'Start Homelab'],
  ],
  '2fa': ['TOTRINNSBEKREFTELSE', 'Skriv inn koden', 'Åpne autentiseringsappen og skriv inn den sekssifrede koden.', 'Bekreft'],
  login: ['LOGG INN', 'Logg inn på Homelab', 'Bruk brukernavnet og passordet for serveren din.', 'Logg inn'],
};

function render(focus = true) {
  const onb = st.mode === 'onboarding', S = st.step;
  const [lab, h, sub, btn] = onb ? TEXT.onb[S] : TEXT[st.mode];
  const show = { onb, login: st.mode === 'login', '2fa': st.mode === '2fa', s1: onb && S === 0, s2: onb && S === 1, s3: onb && S === 2, s4: onb && S === 3 };
  for (const el of form.querySelectorAll('[data-show]')) el.hidden = !show[el.dataset.show];
  form.querySelectorAll('.gate-bars span').forEach((b, i) => b.classList.toggle('on', i <= S));
  $('g-lab').textContent = lab;
  $('g-h').textContent = st.mode === 'login' ? `Logg inn på ${st.app}` : h;
  $('g-sub').textContent = sub;
  $('g-btn').textContent = btn;
  $('g-back').hidden = !(onb && S > 0) && st.mode !== '2fa';
  $('g-foot').textContent = onb ? 'Alt kan endres senere i Innstillinger.' : location.host;
  $('g-toqr').hidden = !(st.qr && st.mode === 'login');

  // Toppbildet: kicker og tittel som i fasiten.
  const name = form.adminName.value.trim();
  $('g-kick').textContent = onb ? `Oppsett · ${S + 1} av 4` : host(form.srv.value || location.origin);
  $('g-title').textContent = onb ? (S === 0 ? 'Hei' + (name ? ',\n' + name : '') : S === 1 ? 'Trygg\ninnlogging' : S === 2 ? 'Gjør det\ntil ditt' : 'Velkommen\nhjem')
    : st.mode === '2fa' ? 'Ett steg\ntil' : `${greet()},\nvelkommen hjem`;
  $('g-hero').style.backgroundImage = bgCss(st.bg, true);

  if (show.s1) $('g-langs').querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === lang())));
  if (show.s3) $('g-bgs').innerHTML = BGO.map(([k, n, s]) => `<button type="button" class="gate-bg" data-bg="${k}" aria-pressed="${st.bg === k}"><i style="background-image:${bgCss(k)}"></i><b>${n}</b><span>${s}</span></button>`).join('');
  if (show.s4) {
    const rows = [['Admin', name || '–'], ['Server', form.serverName.value.trim() || 'Homelab'], ['Brukernavn', form.newUsername.value.trim().toLowerCase() || '–'], ['Bakgrunn', bgOf(st.bg)[1]], ['Tema', 'Papir · lys']];
    const box = $('g-sum'); box.replaceChildren();
    for (const [a, b] of rows) { const d = document.createElement('div'), x = document.createElement('span'), y = document.createElement('b'); x.textContent = a; y.textContent = b; d.append(x, y); box.append(d); }
  }
  if (show['2fa']) {
    const c = form.code;
    c.classList.toggle('rc', st.recovery);
    c.inputMode = st.recovery ? 'text' : 'numeric';
    c.placeholder = st.recovery ? 'xxxx-xxxx' : '123 456';
    $('f-code-l').textContent = st.recovery ? 'Gjenopprettingskode' : 'Kode fra autentiseringsappen';
    $('g-recovery').textContent = st.recovery ? 'Bruk koden fra autentiseringsappen' : 'Mistet telefonen? Bruk en gjenopprettingskode';
    $('g-otp').hidden = st.recovery;
    paintOtp();
  }
  if (!focus) return;
  const f = show.login ? (form.username.value ? form.password : form.username) : show['2fa'] ? form.code
    : show.s1 ? form.adminName : show.s2 ? (form.newUsername.value ? form.newPassword : form.newUsername) : show.s3 ? form.querySelector('.gate-bg[aria-pressed="true"]') : $('g-btn');
  f?.focus({ preventScroll: true });
}

const err = $('g-err');
const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
const clearErr = () => { err.hidden = true; };
const go = (patch) => { Object.assign(st, patch); clearErr(); render(); };

function done(user) {
  noteUser(user?.id);
  const next = new URLSearchParams(location.search).get('next');
  // Lenker som «/#/innstillinger/system» (fra mobilappene) beholder #-delen gjennom innloggingen.
  const hash = /^#\/innstillinger(\/[\w:-]+){0,2}\/?$/.test(location.hash) ? location.hash : '';
  location.href = next && /^\/[^/\\]/.test(next) ? next : '/' + hash;
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/* ---------- Innlogging ---------- */

async function login() {
  // En annen server: innloggingen må skje der (informasjonskapselen hører til den adressen).
  let origin = location.origin;
  const raw = form.srv.value.trim();
  if (raw) {
    try { origin = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin; } catch { return fail('Skriv inn en gyldig serveradresse.'); }
  }
  if (origin !== location.origin) { location.href = `${origin}/login`; return; }
  const u = form.username.value.trim();
  if (!u || !form.password.value) return fail('Skriv inn brukernavn og passord.');
  const { ok, data } = await post('/api/auth/login', { username: u, password: form.password.value, remember: true });
  if (data.needsTotp) { form.code.value = ''; return go({ mode: '2fa', ticket: data.ticket, recovery: false }); }
  if (ok) return done(data.user);
  fail(data.error || 'Feil brukernavn eller passord.');
  form.password.select();
}

async function verify() {
  const code = form.code.value.trim();
  if (!st.recovery && code.length !== 6) return fail('Koden har seks sifre.');
  if (st.recovery && code.length < 6) return fail('Skriv inn en gjenopprettingskode.');
  const { ok, data } = await post('/api/auth/totp', { ticket: st.ticket, code, remember: true });
  if (ok) return done(data.user);
  if (data.expired) { form.password.value = ''; go({ mode: 'login', ticket: null }); return fail(data.error || 'Innloggingen tok for lang tid. Prøv igjen.'); }
  fail(data.error || 'Feil kode. Prøv igjen.');
  const ob = $('g-otp'); ob.classList.remove('shake'); void ob.offsetWidth; ob.classList.add('shake');
  form.code.value = ''; paintOtp(true);
  form.code.focus();
}

/* ---------- Onboarding ---------- */

async function onboard() {
  const S = st.step;
  if (S === 0) {
    if (!form.adminName.value.trim()) return fail('Skriv inn navnet ditt.');
    if (!st.userEdited || !form.newUsername.value) form.newUsername.value = slug(form.adminName.value);
  }
  if (S === 1) {
    const u = form.newUsername.value.trim().toLowerCase();
    if (u.length < 3) return fail('Brukernavnet må ha minst 3 tegn.');
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) return fail('Brukernavnet kan bare ha a–z, 0–9, punktum, bindestrek og understrek.');
    if (form.newPassword.value.length < 8) return fail('Passordet må ha minst 8 tegn.');
    if (form.newPassword.value !== form.newPassword2.value) return fail('Passordene er ikke like.');
  }
  if (S < 3) return go({ step: S + 1 });
  const { ok, status, data } = await post('/api/setup', {
    adminName: form.adminName.value.trim(), serverName: form.serverName.value.trim() || 'Homelab',
    username: form.newUsername.value.trim().toLowerCase(), password: form.newPassword.value,
  });
  if (!ok) {
    if (status === 409) { location.reload(); return; }
    return fail(data.error || 'Kunne ikke opprette brukeren.');
  }
  // Standard etter oppsett: Papir · lys, med bakgrunnen fra steg 3. Eldre servere uten bgType får bare photo.
  lsSet('hl_theme', '2c'); lsSet('fh_design', 'lys'); lsSet(BG_KEY, st.bg);
  const photo = st.bg === 'none' ? 'cur' : st.bg;
  const put = (json) => fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }).then((r) => r.ok).catch(() => false);
  if (!(await put({ hlTheme: '2c', design: 'lys', mobileDesign: 'papir', bgType: st.bg, photo }))) await put({ hlTheme: '2c', design: 'lys', photo });
  // Språket fra steg 1 lagres hos brukeren (prompt 27).
  await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: lang() }) }).catch(() => {});
  done(data.user);
}

/* ---------- Hendelser ---------- */

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('g-btn');
  if (btn.disabled) return;
  btn.disabled = true; clearErr();
  try { await (st.mode === 'login' ? login() : st.mode === '2fa' ? verify() : onboard()); }
  catch { fail('Fikk ikke kontakt med serveren.'); }
  finally { btn.disabled = false; }
});

$('g-back').addEventListener('click', () => {
  if (st.mode === '2fa') { form.password.value = ''; return go({ mode: 'login', ticket: null }); }
  go({ step: Math.max(0, st.step - 1) });
});
$('g-langs').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  await setLang(b.dataset.lang, { save: false });
  render(false);
});
$('g-recovery').addEventListener('click', () => { form.code.value = ''; go({ recovery: !st.recovery }); });
$('g-bgs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bg]');
  if (!b) return;
  st.bg = b.dataset.bg; clearErr(); render(false);
  $('g-bgs').querySelector(`[data-bg="${st.bg}"]`)?.focus({ preventScroll: true });
});
// Prompt 38: seks sifferbokser over feltet (samme som QR-innloggingen).
function paintOtp(bad = false) {
  const v = form.code.value;
  $('g-otp').querySelectorAll('span').forEach((s, i) => { s.textContent = v[i] ?? ''; s.className = bad ? 'bad' : v.length === i ? 'on' : ''; });
}
form.code.addEventListener('input', () => {
  if (st.recovery) return;
  const v = form.code.value.replace(/[^0-9]/g, '').slice(0, 6);
  if (v !== form.code.value) form.code.value = v;
  paintOtp();
  if (v.length === 6) form.requestSubmit(); // sender automatisk ved seks sifre
});
form.adminName.addEventListener('input', () => { clearErr(); if (st.mode === 'onboarding') render(false); });
form.srv.addEventListener('input', () => { $('g-kick').textContent = host(form.srv.value || location.origin); });
form.newUsername.addEventListener('input', () => { st.userEdited = true; });
for (const el of form.querySelectorAll('input')) if (el !== form.adminName) el.addEventListener('input', clearErr);

/* ---------- Oppstart ---------- */

form.srv.value = location.origin;
render();
initI18n();
// Prompt 38: QR-koden vises først (passord er et valg). Skjemaet skjules til vi vet om serveren kan QR-innlogging,
// så det ikke blinker; senest etter 2,5 s vises det uansett.
const showForm = (show) => { form.hidden = !show; if (show) render(); };
form.hidden = true;
const formT = setTimeout(() => { if (form.hidden && !$('g-qr').innerHTML) showForm(true); }, 2500);
$('g-toqr').addEventListener('click', () => showQr());
fetch('/api/setup/status').then((r) => r.json()).then(async (s) => {
  if (s.needsSetup) { clearTimeout(formT); showForm(true); go({ mode: 'onboarding', step: 0 }); return; }
  st.qr = await initQr({ done, form: showForm, app: () => st.app, noQr: () => { st.qr = false; render(false); } });
  clearTimeout(formT);
  if (!st.qr) showForm(true); else render(false);
}).catch(() => { clearTimeout(formT); showForm(true); });

// Appnavnet (Innstillinger → App) i merket og fanetittelen, og ikonet som favicon.
loadAppIdentity().then(({ name }) => {
  st.app = name || 'Homelab';
  $('g-brand').textContent = st.app;
  document.title = `Logg inn · ${st.app}`;
  render(false);
}).catch(() => {});
