// Papir-innlogging og onboarding på mobil (prompt 14, Mobil Papir App → «gate»).
// Innlogging: fotoheader, deretter Server, Brukernavn og Passord som understrekede felter, og 2FA med sekssifret kode
// og «Husk denne enheten i 30 dager». Samme API som /login (/api/auth/login og /api/auth/totp).
// Onboarding (første gang etter innlogging, layout.onboarded === false): design, bakgrunn, og varsler og tilgang.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const G = { step: 'login', ticket: null, user: '', err: '', busy: false, ob: 0, pick: null, photo: null, perm: { push: false, cam: false, hap: true, bio: false }, layout: null };
let el = null;

const dark = () => { let v = 'auto'; try { v = JSON.parse(localStorage.getItem('fh_mprefs') || '{}').paperMode || 'auto'; } catch {} return v === 'mork' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
const OV = 'linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0) 35%,rgba(0,0,0,.45))';
const BG = 'linear-gradient(170deg,#4a5a6a,#2a3440 60%,#1d242c)';

function mount() {
  if (!el) { el = document.createElement('div'); el.className = 'pp-gate'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); bindGate(); }
  el.classList.toggle('pd', G.pick ? G.pick === 'mork' : dark());
  el.innerHTML = view();
  const f = el.querySelector('[autofocus]'); if (f && !G.busy) setTimeout(() => f.focus(), 30);
}
function hero(kick, title) {
  return `<div class="pp-ghero" style="background-image:${OV},${G.bg ? `url('${esc(G.bg)}'),` : ''}${BG}"><div class="pp-gk"><div>${esc(kick)}</div><h1>${esc(title).replace(/\n/g, '<br>')}</h1></div></div>`;
}
function view() {
  const host = location.host;
  if (G.step === 'login') return `${hero(`Homelab · ${host}`, 'Hei,\nvelkommen hjem')}
    <form class="pp-gform" data-g="login" novalidate>
      <label>SERVER<input value="${esc(host)}" readonly aria-readonly="true" tabindex="-1"></label>
      <label>BRUKERNAVN<input name="username" value="${esc(G.user)}" autocomplete="username" autocapitalize="off" spellcheck="false" ${G.user ? '' : 'autofocus'}></label>
      <label>PASSORD<input name="password" type="password" autocomplete="current-password" ${G.user ? 'autofocus' : ''}></label>
      ${G.err ? `<span class="pp-gerr" role="alert">${esc(G.err)}</span>` : ''}
      <label class="pp-gchk"><input type="checkbox" name="remember" checked>Husk denne enheten på lokalt nett</label>
      <button type="submit" class="pp-gbtn" ${G.busy ? 'disabled' : ''}>${G.busy ? 'Logger inn …' : 'Logg inn'}</button>
      <a class="pp-glink" href="/login?next=/finans/">Åpne den vanlige innloggingen</a></form>`;
  if (G.step === '2fa') return `${hero(`Homelab · ${G.user}`, 'Totrinns-\nbekreftelse')}
    <form class="pp-gform" data-g="totp" novalidate><span style="font-size:15px;line-height:1.45">Skriv inn den sekssifrede koden fra autentiseringsappen.</span>
      <input name="code" class="pp-gcode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••" aria-label="Kode" autofocus>
      ${G.err ? `<span class="pp-gerr" role="alert">${esc(G.err)}</span>` : ''}
      <button type="submit" class="pp-gbtn" ${G.busy ? 'disabled' : ''}>${G.busy ? 'Sjekker …' : 'Bekreft'}</button>
      <label class="pp-gchk"><input type="checkbox" name="remember" checked>Husk denne enheten i 30 dager</label>
      <button type="button" class="pp-gback" data-g="back">‹ Tilbake</button></form>`;
  // Onboarding
  const ob = G.ob, name = (G.layout?.name || '').split(' ')[0];
  const dots = [0, 1, 2].map((i) => `<span class="${i <= ob ? 'on' : ''}"></span>`).join('');
  const THEMES = [['lys', 'Papir · lys', 'Lyst papir, avisspalter og svart fanelinje.', 'linear-gradient(#5d7690 0 40%,#f3efe6 40%)'], ['mork', 'Papir · mørk', 'Kveldspapir med lys fanelinje.', 'linear-gradient(#2a3440 0 40%,#14130f 40%)'], ['klassisk', 'Klassisk', 'Liquid Glass på iPhone, Material You på Android.', 'linear-gradient(160deg,#3b6fd6,#6b3fb5)']];
  const BGS = [['cur', 'Nåværende'], ['oslo', 'Oslo'], ['weather', 'Vær nå'], ['planets', 'Planeter']];
  const PERMS = [['push', 'Varsler', 'Pakker, frister og kvitteringer'], ['cam', 'Kamera', 'For å skanne kvitteringer og oppskrifter'], ['bio', 'Lås med Face ID / fingeravtrykk', 'Låser appen når den har vært i bakgrunnen'], ['hap', 'Haptisk tilbakemelding', 'Små vibrasjoner ved trykk']];
  const pick = G.pick ?? 'lys', ph = G.photo ?? 'oslo';
  const body = ob === 0 ? `<span class="pp-glab">VELG DESIGN</span>${THEMES.map(([k, n, s, sw]) => `<button class="pp-gopt${pick === k ? ' on' : ''}" data-g="theme" data-k="${k}"><span class="pp-gsw" style="background:${sw}"></span><span class="pp-gmi"><b>${n}</b><span>${s}</span></span><span class="pp-gck">${pick === k ? '✓' : ''}</span></button>`).join('')}`
    : ob === 1 ? `<span class="pp-glab">BAKGRUNN PÅ HJEM</span><div class="pp-ggrid">${BGS.map(([k, n]) => `<button class="pp-gbg${ph === k ? ' on' : ''}" data-g="photo" data-k="${k}"><span style="background-image:${G.thumbs?.[k] ? `url('${esc(G.thumbs[k])}'),` : ''}${BG}"></span><b>${n}</b></button>`).join('')}</div>`
    : `<span class="pp-glab">VARSLER OG TILGANG</span><div class="pp-gcard">${PERMS.map(([k, n, s]) => `<button class="pp-gperm" data-g="perm" data-k="${k}" role="switch" aria-checked="${!!G.perm[k]}"><span class="pp-gmi"><b>${n}</b><span>${s}</span></span><span class="pp-sw${G.perm[k] ? ' on' : ''}"><i></i></span></button>`).join('')}</div>`;
  return `${hero(`Steg ${ob + 1} av 3`, [`Velkommen${name ? `,\n${name}` : ''}`, 'Velg bakgrunn', 'Nesten ferdig'][ob])}
    <div class="pp-gform"><div class="pp-gdots">${dots}</div>${body}
      <div class="pp-grow">${ob > 0 ? '<button class="pp-gbtn line" data-g="prev">Tilbake</button>' : ''}<button class="pp-gbtn" data-g="next" ${G.busy ? 'disabled' : ''}>${ob < 2 ? 'Neste' : 'Ferdig'}</button></div>
      <span class="pp-gmut">Alt kan endres senere i Innstillinger.</span></div>`;
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}
const done = () => { location.reload(); };

function bindGate() {
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, k = f.dataset.g;
    if (G.busy) return;
    G.err = '';
    if (k === 'login') {
      const u = f.username.value.trim(), p = f.password.value; G.user = u;
      if (!u || !p) { G.err = 'Skriv inn brukernavn og passord.'; return mount(); }
      G.busy = true; mount();
      try {
        const { ok, data } = await post('/api/auth/login', { username: u, password: p, remember: f.remember.checked });
        G.busy = false;
        if (data.needsTotp) { G.ticket = data.ticket; G.user = data.username || u; G.step = '2fa'; return mount(); }
        if (ok) return done();
        G.err = data.error || 'Feil brukernavn eller passord.';
      } catch { G.busy = false; G.err = 'Fikk ikke kontakt med serveren.'; }
      return mount();
    }
    if (k === 'totp') {
      const code = f.code.value.replace(/\s/g, '');
      G.busy = true; mount();
      try {
        const { ok, data } = await post('/api/auth/totp', { ticket: G.ticket, code, remember: f.remember.checked });
        G.busy = false;
        if (ok) return done();
        G.err = data.error || 'Feil kode. Prøv igjen.';
        if (data.expired) { G.ticket = null; G.step = 'login'; }
      } catch { G.busy = false; G.err = 'Fikk ikke kontakt med serveren.'; }
      return mount();
    }
  });
  el.addEventListener('input', (e) => { if (e.target.name === 'code' && /^\d{6}$/.test(e.target.value.replace(/\s/g, ''))) e.target.form.requestSubmit(); });
  el.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-g]');
    if (!x || x.tagName === 'FORM') return;
    const k = x.dataset.g;
    if (k === 'back') { G.step = 'login'; G.ticket = null; G.err = ''; return mount(); }
    if (k === 'theme') { G.pick = x.dataset.k; navigator.vibrate?.(8); return mount(); }
    if (k === 'photo') { G.photo = x.dataset.k; navigator.vibrate?.(8); return mount(); }
    if (k === 'perm') {
      const p = x.dataset.k, on = !G.perm[p];
      G.perm[p] = on; mount();
      // Systemets spørsmål kommer når bryteren slås på (krever et trykk fra brukeren).
      if (on && p === 'push' && 'Notification' in window && Notification.permission === 'default') { try { const r = await Notification.requestPermission(); if (r !== 'granted') { G.perm.push = false; mount(); } } catch {} }
      if (on && p === 'cam' && navigator.mediaDevices?.getUserMedia && window.isSecureContext) { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); } catch { G.perm.cam = false; mount(); } }
      if (on && p === 'hap') navigator.vibrate?.(12);
      return;
    }
    if (k === 'prev') { G.ob = Math.max(0, G.ob - 1); return mount(); }
    if (k === 'next') {
      if (G.ob < 2) { G.ob++; if (G.ob === 1) loadThumbs(); return mount(); }
      return finish();
    }
  });
}

async function loadThumbs() {
  G.thumbs ??= {};
  // Prompt 19: forhåndsvisningene fra bakgrunnstjenesten; eldre servere: photo-window per type.
  try { const r = await fetch(`/api/background/previews?w=${Math.round(Math.min(800, innerWidth * 2))}`); if (r.ok) { const d = await r.json(); for (const k of ['oslo', 'weather', 'planets']) if (d?.[k]?.image_url) G.thumbs[k] = d[k].image_url; } } catch {}
  await Promise.all(['oslo', 'weather', 'planets'].filter((k) => !G.thumbs[k]).map(async (k) => { try { const r = await (await fetch(`/api/photo-window?kind=${k}`)).json(); if (r?.url) G.thumbs[k] = r.url; } catch {} }));
  if (G.step === 'onb') mount();
}

async function finish() {
  const pick = G.pick ?? 'lys', photo = G.photo ?? 'oslo';
  const patch = { onboarded: true, mobileDesign: pick === 'klassisk' ? 'klassisk' : 'papir', photo, bgType: photo, ...(pick !== 'klassisk' ? { paperMode: pick } : {}) };
  G.busy = true; mount();
  await fetch('/api/me/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
  // mobile.js tar valgene (design, bakgrunn, lås og haptikk) inn i sine lokale innstillinger og tegner på nytt.
  dispatchEvent(new CustomEvent('fh-design', { detail: { ...patch, lock: !!G.perm.bio, hap: !!G.perm.hap } }));
  el?.remove(); el = null;
}

/** Viser Papir-innloggingen (kalles fra core.js når serveren svarer 401 og økten er borte). */
export function showLogin() { if (el && G.step !== 'onb') return; G.step = 'login'; G.err = ''; G.busy = false; loadBgGuest(); mount(); }
// Bakgrunnen i headeren: fra forrige økt, ellers gradienten (photo-window krever innlogging).
function loadBgGuest() { try { G.bg = localStorage.getItem('fh_gate_bg') || null; } catch {} }
/** Onboarding i tre steg første gang etter innlogging. */
export function showOnboarding(layout) {
  if (el) return;
  G.step = 'onb'; G.ob = 0; G.layout = layout; G.pick = layout?.mobileDesign === 'klassisk' ? 'klassisk' : layout?.paperMode === 'mork' ? 'mork' : 'lys'; G.photo = layout?.photo && layout.photo !== 'custom' ? layout.photo : 'oslo';
  G.perm = { push: 'Notification' in window && Notification.permission === 'granted', cam: false, hap: true, bio: false };
  fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((me) => { if (me && G.step === 'onb') { G.layout = { ...(G.layout ?? {}), name: me.displayName || me.name || '' }; mount(); } }).catch(() => {});
  fetch(`/api/background?type=oslo&w=${Math.round(Math.min(1600, innerWidth * 2))}&dpr=1`).then((r) => (r.ok ? r.json().then((d) => ({ url: d?.image_url })) : fetch('/api/photo-window?kind=oslo').then((x) => x.json()))).then((r) => { if (r?.url) { G.bg = r.url; try { localStorage.setItem('fh_gate_bg', r.url); } catch {} mount(); } }).catch(() => {});
  mount();
}
