// Prompt 51 (WEBX51): veiviseren for nye familiemedlemmer (/join/<id>.<kode>). Tre steg: navn og brukernavn → passord → deling.
// Koden står i adressen (engangs, aldri et token) og sendes bare til /api/onboard51/preview og /accept. Etter fullføring fjernes den
// fra adressen og historikken.
const $ = (id) => document.getElementById(id);
const form = $('j51');
const m = location.pathname.match(/\/join\/([^/.]+)\.([A-Za-z0-9-]+)$/);
const inv = m ? { id: decodeURIComponent(m[1]), code: decodeURIComponent(m[2]) } : null;
let step = 0, data = null, busy = false;

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return { ok: r.ok, status: r.status, j };
};
function err(t) { const e = $('j-err'); e.textContent = t || ''; e.hidden = !t; }
function bars(n) { form.querySelectorAll('.gate-bars span').forEach((s, i) => s.classList.toggle('on', i < n)); }
function show(n) {
  step = n;
  form.querySelectorAll('[data-step]').forEach((el) => { el.hidden = Number(el.dataset.step) !== n; });
  $('j-back').hidden = !(n === 2 || n === 3);
  $('j-lab').textContent = n <= 3 ? `STEG ${n} AV 3` : 'FERDIG';
  bars(Math.min(n, 3));
  const H = { 1: ['Hei! Hva heter du?', `${data?.invitedBy ? `${data.invitedBy} har invitert deg` : 'Du er invitert'} til ${data?.serverName ?? 'Homelab'}.`],
    2: ['Velg et passord', 'Du logger inn med brukernavnet og passordet. Passkey kan legges til etterpå.'],
    3: ['Hva vil du dele?', 'Forslaget er fra den som inviterte deg. Du kan endre det når som helst i Innstillinger.'],
    4: ['Velkommen!', ''] }[n];
  $('j-h').textContent = H[0]; $('j-sub').textContent = H[1];
  $('j-btn').textContent = n === 3 ? 'Bli med' : n === 4 ? 'Åpne Homelab' : 'Neste';
  const f = form.querySelector(`[data-step="${n}"] input`); if (f) setTimeout(() => f.focus(), 30);
  err('');
}

async function load() {
  if (!inv) { $('j-h').textContent = 'Lenken er ikke gyldig'; $('j-sub').textContent = 'Be om en ny invitasjon.'; return; }
  const r = await post('/api/onboard51/preview', inv).catch(() => null);
  if (!r?.ok) { $('j-h').textContent = r?.j?.code === 'used' ? 'Invitasjonen er allerede brukt' : r?.j?.code === 'expired' ? 'Invitasjonen er utløpt' : 'Fant ikke invitasjonen'; $('j-sub').textContent = r?.j?.error ?? 'Sjekk nettet og prøv igjen.'; return; }
  data = r.j;
  $('j-brand').textContent = data.serverName || 'Homelab';
  $('j-title').textContent = `Bli med, ${String(data.name).split(' ')[0]}`;
  $('j-name').value = data.name ?? '';
  $('j-user').value = data.usernameSuggestion ?? '';
  $('j-loc').checked = !!data.share?.location; $('j-health').checked = !!data.share?.health; $('j-cal').checked = data.share?.calendar !== false;
  syncShare();
  $('j-foot').textContent = data.expiresAt ? `Gyldig til ${new Date(data.expiresAt).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
  $('j-btn').disabled = false;
  show(1);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || !data) return;
  if (step === 1) {
    if (!$('j-name').value.trim()) return err('Skriv navnet ditt.');
    if (!/^[a-z0-9._-]{2,32}$/.test($('j-user').value.trim().toLowerCase())) return err('Brukernavn: 2–32 tegn, små bokstaver, tall, punktum eller bindestrek.');
    return show(2);
  }
  if (step === 2) {
    if ($('j-pw').value.length < 8) return err('Passordet må ha minst 8 tegn.');
    if ($('j-pw').value !== $('j-pw2').value) return err('Passordene er ikke like.');
    return show(3);
  }
  if (step === 3) {
    busy = true; $('j-btn').disabled = true; err('');
    const r = await post('/api/onboard51/accept', { ...inv, name: $('j-name').value.trim(), username: $('j-user').value.trim().toLowerCase(), password: $('j-pw').value,
      share: { location: $('j-loc').checked, health: $('j-health').checked, calendar: $('j-cal').checked }, client: 'web', platform: 'web' }).catch(() => null);
    busy = false; $('j-btn').disabled = false;
    if (!r?.ok) { if (r?.j?.code === 'username_taken' || r?.j?.code === 'username') show(1); else if (r?.j?.code === 'password') show(2); return err(r?.j?.error ?? 'Noe gikk galt. Prøv igjen.'); }
    try { history.replaceState(null, '', '/join/ferdig'); } catch { /* */ }
    $('j-pw').value = ''; $('j-pw2').value = '';
    const shared = [r.j.share?.location && 'posisjon', r.j.share?.health && 'helse', r.j.share?.calendar && 'kalender'].filter(Boolean);
    $('j-done').textContent = `Du er logget inn som ${r.j.user.username}. ${shared.length ? `Du deler ${shared.join(', ').replace(/, ([^,]*)$/, ' og $1')} med familien.` : 'Du deler ingenting ennå.'} Har du appen på mobilen, logger du inn der med samme brukernavn og passord – eller med QR fra denne nettleseren.`;
    $('j-foot').textContent = '';
    data.next = r.j.next || '/#/dash';
    return show(4);
  }
  if (step === 4) location.replace(data.next || '/');
});
// Helse deles sammen med posisjon (Familie har én delingsbryter).
const syncShare = () => { const on = $('j-loc').checked; $('j-health').disabled = !on; if (!on) $('j-health').checked = false; };
$('j-loc').addEventListener('change', syncShare);
$('j-back').addEventListener('click', () => { if (step > 1 && step < 4) show(step - 1); });
load();
