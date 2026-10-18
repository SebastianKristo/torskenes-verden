import { loadAppIdentity } from './appicon.js';

const form = document.getElementById('login');
const err = document.getElementById('err');
let ticket = null;

const show = (step) => {
  for (const el of form.querySelectorAll('[data-step]')) el.hidden = el.dataset.step !== step;
  (step === 'code' ? form.code : form.username.value ? form.password : form.username).focus();
};
const fail = (msg) => { err.textContent = msg; err.hidden = false; };

function done() {
  const next = new URLSearchParams(location.search).get('next');
  location.href = next && /^\/[^/\\]/.test(next) ? next : '/';
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('.lock-btn');
  btn.disabled = true; err.hidden = true;
  try {
    if (!ticket) {
      if (!form.username.value.trim() || !form.password.value) { fail('Skriv inn brukernavn og passord'); return; }
      const { ok, data } = await post('/api/auth/login', { username: form.username.value.trim(), password: form.password.value, remember: form.remember.checked });
      if (data.needsTotp) {
        ticket = data.ticket;
        document.getElementById('tfa-user').textContent = data.username || form.username.value.trim();
        form.code.value = ''; show('code');
        return;
      }
      if (ok) return done();
      fail(data.error || 'Feil brukernavn eller passord');
      form.password.select();
    } else {
      const { ok, data } = await post('/api/auth/totp', { ticket, code: form.code.value.trim(), remember: form.remember.checked });
      if (ok) return done();
      fail(data.error || 'Feil kode. Prøv igjen.');
      if (data.expired) { ticket = null; form.password.value = ''; show('cred'); } else form.code.select();
    }
  } catch { fail('Fikk ikke kontakt med serveren'); }
  finally { btn.disabled = false; }
});

document.getElementById('back').addEventListener('click', () => { ticket = null; err.hidden = true; form.password.value = ''; show('cred'); });
// Sender automatisk når seks sifre er skrevet inn.
form.code.addEventListener('input', () => { if (/^\d{6}$/.test(form.code.value.replace(/\s/g, ''))) form.requestSubmit(); });

/* ---------- Førstegangsoppsett (tom server) ---------- */

const setup = document.getElementById('setup');
const obErr = document.getElementById('ob-err');
let obStep = 1, userEdited = false;

// Brukernavn foreslås fra navnet: små bokstaver, æ→ae, ø→o, å→a, bare a–z og 0–9.
export const slug = (s) => String(s).toLowerCase().replace(/æ/g, 'ae').replace(/[øö]/g, 'o').replace(/[åä]/g, 'a')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 32);

function obShow(step) {
  obStep = step;
  for (const el of setup.querySelectorAll('[data-ob]')) el.hidden = +el.dataset.ob !== step;
  document.getElementById('ob-step').textContent = `Steg ${step} av 2`;
  document.getElementById('ob-bar2').classList.toggle('on', step === 2);
  document.getElementById('ob-btn').textContent = step === 1 ? 'Neste' : 'Opprett og logg inn';
  document.getElementById('ob-back').hidden = step === 1;
  obErr.hidden = true;
  if (step === 2) {
    document.getElementById('ob-hello').textContent = setup.adminName.value.trim();
    if (!userEdited || !setup.username.value) setup.username.value = slug(setup.adminName.value);
    (setup.username.value ? setup.password : setup.username).focus();
  } else setup.adminName.focus();
}
const obFail = (msg) => { obErr.textContent = msg; obErr.hidden = false; };

setup.username.addEventListener('input', () => { userEdited = true; });
document.getElementById('ob-back').addEventListener('click', () => obShow(1));
setup.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (obStep === 1) {
    if (!setup.adminName.value.trim()) return obFail('Skriv inn navnet til hovedadmin');
    return obShow(2);
  }
  const u = setup.username.value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,}$/.test(u)) return obFail('Brukernavnet må ha minst 2 tegn og bare inneholde a–z, 0–9, punktum, bindestrek eller understrek');
  if (setup.password.value.length < 8) return obFail('Passordet må ha minst 8 tegn');
  if (setup.password.value !== setup.password2.value) return obFail('Passordene er ikke like');
  const btn = document.getElementById('ob-btn');
  btn.disabled = true; obErr.hidden = true;
  try {
    const { ok, data } = await post('/api/setup', { adminName: setup.adminName.value.trim(), serverName: setup.serverName.value.trim() || 'Homelab', username: u, password: setup.password.value });
    if (ok) return done();
    if (data.error === 'Serveren er allerede satt opp') { location.reload(); return; }
    obFail(data.error || 'Kunne ikke opprette brukeren');
  } catch { obFail('Fikk ikke kontakt med serveren'); }
  finally { btn.disabled = false; }
});

fetch('/api/setup/status').then((r) => r.json()).then((s) => {
  if (!s.needsSetup) return;
  form.hidden = true; setup.hidden = false; obShow(1);
}).catch(() => {});

// Appnavnet (Innstillinger → App) i innloggingsbildet og fanetittelen, og ikonet som favicon.
loadAppIdentity().then(({ name }) => {
  for (const el of document.querySelectorAll('.lock-pw-k')) el.textContent = name;
  document.title = `Lås opp · ${name}`;
});
