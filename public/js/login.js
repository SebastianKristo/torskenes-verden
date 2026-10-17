const form = document.getElementById('login');
const err = document.getElementById('err');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true; err.hidden = true;
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password.value, remember: form.remember.checked }) });
    if (res.ok) {
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && /^\/[^/\\]/.test(next) ? next : '/';
      return;
    }
    err.textContent = (await res.json().catch(() => ({}))).error || 'Feil passord';
  } catch { err.textContent = 'Fikk ikke kontakt med serveren'; }
  err.hidden = false; btn.disabled = false;
  form.password.select();
});
