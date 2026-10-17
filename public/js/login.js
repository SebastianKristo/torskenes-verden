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
