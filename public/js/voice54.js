// Prompt 54 (WHISPER54): tale til tekst på web/PWA – norsk og engelsk (NB-Whisper på Mac mini-en, Voz på serveren, Phonon på Mac mini-en).
//  - Glimt-chatten: mikrofonknappen [data-ch-mic] (chat.js) tas over når serveren har en motor: MediaRecorder → POST /api/voice53/transcribe
//    (language=auto + hint = språket i appen). Uten motor faller chat.js tilbake til sin egen vei (Web Speech / Open WebUI).
//  - Glimt-søket: mikrofonknapp i hvert søkefelt form[data-search] (extras.js), rett før «Søk».
//  - Hold inne for å snakke (slipp = send), eller trykk for start og trykk igjen for stopp. Esc avbryter. Maks 60 s.
//  - Viser motor og språk etterpå («NB-Whisper (Mac mini) · norsk (bokmål)»). Tydelig tekst før nettleseren spør om mikrofonen.
//  - Mikrofonen virker bare i en sikker kontekst (https eller localhost). Over http på hjemmenettet sier vi det i stedet for å feile.
//  - AI-kontroll: kortet «Tale til tekst» (status for motorene; admin: adresse/nøkkel og test av NB-Whisper) i [data-v54-ai].
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const MAX_MS = 60_000, HOLD_MS = 350, MIN_MS = 400;
const LS_OK = 'voice54_ok';

const CSS = `
.v54-mic{flex:none;width:36px;height:36px;margin:0 2px;border:0;border-radius:18px;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:none}
.v54-mic:hover{background:rgba(127,127,127,.16)}.v54-mic:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
.v54-mic.v54-on,.ch-mic.v54-on{background:#b23a2a!important;color:#fff!important;animation:v54p 1.2s ease-in-out infinite}
.v54-mic.v54-busy,.ch-mic.v54-busy{opacity:.6;cursor:progress}
.v54-mic,[data-ch-mic]{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
@keyframes v54p{0%,100%{box-shadow:0 0 0 0 rgba(178,58,42,.45)}50%{box-shadow:0 0 0 7px rgba(178,58,42,0)}}
@media (prefers-reduced-motion:reduce){.v54-mic.v54-on,.ch-mic.v54-on{animation:none}}
/* Prompt 50b (claude-code-web-mikrofonknapp.md): mikrofonen i søkefeltet på Dashboard, mellom «✦ AI» og «Søk». «.sbar button»
   (app.css) ga før fylt blå sirkel og padding 0 20px som skjøv ikonet mot høyre – derfor høyere spesifisitet her. */
form[data-search].sbar button.v54-mic{flex:none;box-sizing:border-box;width:40px;height:40px;min-width:40px;margin:0;padding:0;border-radius:50%;
  border:1px solid #e4ddcf;background:transparent;color:#1b1a17;display:grid;place-items:center;line-height:0;font-size:0;cursor:pointer;
  box-shadow:none;transition:background-color .18s,color .18s,border-color .18s}
form[data-search].sbar button.v54-mic svg{display:block;width:18px;height:18px}
form[data-search].sbar button.v54-mic:hover{background:#f3efe6}
form[data-search].sbar button.v54-mic.v54-on{background:#b23a2a!important;border-color:#b23a2a;color:#fff!important}
html[data-mode="dark"] form[data-search].sbar button.v54-mic:not(.v54-on),html:not([data-hl="2c"]) form[data-search].sbar:is(.dark,.wide) button.v54-mic:not(.v54-on){border-color:rgba(255,255,255,.18);color:inherit}
html[data-mode="dark"] form[data-search].sbar button.v54-mic:not(.v54-on):hover,html:not([data-hl="2c"]) form[data-search].sbar:is(.dark,.wide) button.v54-mic:not(.v54-on):hover{background:rgba(255,255,255,.08)}
@media (max-width:767px){form[data-search].sbar button.v54-mic{display:none}} /* som før: knappene i søkefeltet er skjult på smal skjerm (app.css) */
.v54-pill{position:fixed;z-index:2147481500;max-width:min(420px,calc(100vw - 32px));padding:8px 14px;border-radius:999px;background:#11141b;color:#eef0f4;font:500 13px/1.35 Outfit,Geist,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3);pointer-events:none}
.v54-pill b{font-weight:600}.v54-pill .v54-dot{display:inline-block;width:8px;height:8px;border-radius:4px;background:#f05a46;margin-right:8px;vertical-align:1px}
.v54-ov{position:fixed;inset:0;z-index:2147481600;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.v54-dlg{width:min(440px,100%);box-sizing:border-box;border-radius:20px;background:var(--page,#1a1d25);color:var(--text,#eef0f4);border:1px solid var(--line,#232938);padding:20px;font:400 14px/1.5 Outfit,Geist,system-ui,sans-serif}
.v54-dlg h2{margin:0 0 8px;font:600 18px/1.3 Outfit,Geist,system-ui,sans-serif}.v54-dlg p{margin:6px 0}.v54-dlg .v54-mut{color:var(--muted,#8a93a6);font-size:13px}
.v54-dlg .v54-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.v54-b{border:0;border-radius:999px;padding:8px 16px;font:600 13px Outfit,Geist,system-ui,sans-serif;cursor:pointer;background:var(--row,#1d2738);color:inherit}
.v54-b.pri{background:var(--blue,#a8d4fb);color:#0b1220}.v54-b:focus-visible{outline:2px solid var(--blue,#a8d4fb);outline-offset:2px}
html[data-theme="lys"] .v54-dlg,html[data-hl="cur"] .v54-dlg{background:#fff;color:#11141b;border-color:#e3e5ea}
.v54-ai input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--line,#2a3142);background:transparent;color:inherit;font:500 13px var(--mono,'JetBrains Mono',monospace)}
.v54-ai .v54-form{display:grid;gap:8px;margin-top:8px}.v54-ai .v54-btns{display:flex;gap:8px;flex-wrap:wrap}
`;
function css() { if (!document.getElementById('v54-css')) { const s = document.createElement('style'); s.id = 'v54-css'; s.textContent = CSS; document.head.appendChild(s); } }

/* ---------------- Status fra serveren ---------------- */

const S = { info: null, at: 0, loading: null };
async function backends(force = false) {
  if (!force && S.info && Date.now() - S.at < 60_000) return S.info;
  if (S.loading) return S.loading;
  S.loading = fetch('/api/voice53/backends', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((j) => { S.info = j; S.at = Date.now(); S.loading = null; return j; });
  return S.loading;
}
const anyEngine = () => !!S.info?.backends?.some((b) => b.available);
const canRecord = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const appLang = () => (/^en/i.test(document.documentElement.lang || '') ? 'en' : 'nb');

/* ---------------- Små beskjeder ---------------- */

let pill = null, pillTimer = 0;
function say(html, anchor, ms = 0) {
  css();
  clearTimeout(pillTimer);
  if (!pill) { pill = document.createElement('div'); pill.className = 'v54-pill'; pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite'); document.body.appendChild(pill); }
  pill.innerHTML = html;
  const r = anchor?.getBoundingClientRect?.();
  const w = Math.min(420, innerWidth - 32);
  pill.style.left = `${Math.max(16, Math.min((r ? r.left + r.width / 2 : innerWidth / 2) - w / 2, innerWidth - w - 16))}px`;
  pill.style.width = 'auto';
  pill.style.top = r && r.top > 70 ? `${r.top - 48}px` : `${(r?.bottom ?? 60) + 10}px`;
  if (ms) pillTimer = setTimeout(hide, ms);
}
function hide() { pill?.remove(); pill = null; }

function confirmMic() {
  try { if (localStorage.getItem(LS_OK) === '1') return Promise.resolve(true); } catch { /* privat modus */ }
  css();
  return new Promise((done) => {
    const ov = document.createElement('div');
    ov.className = 'v54-ov';
    ov.innerHTML = `<div class="v54-dlg" role="dialog" aria-modal="true" aria-labelledby="v54-h"><h2 id="v54-h">Bruke mikrofonen?</h2>
      <p>Homelab gjør tale om til tekst når du holder inne eller trykker på mikrofonen. Nettleseren spør deg om lov etterpå.</p>
      <p class="v54-mut">Opptaket sendes bare til serveren i huset og Mac mini-en (NB-Whisper fra Nasjonalbiblioteket for norsk, Voz eller Phonon for engelsk). Det sendes aldri ut av huset, og det lagres ikke.</p>
      <div class="v54-row"><button type="button" class="v54-b" data-v54-no>Avbryt</button><button type="button" class="v54-b pri" data-v54-yes>Tillat mikrofon</button></div></div>`;
    const end = (v) => { ov.remove(); document.removeEventListener('keydown', key, true); if (v) { try { localStorage.setItem(LS_OK, '1'); } catch { /* */ } } done(v); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-v54-no]')) end(false); else if (e.target.closest('[data-v54-yes]')) end(true); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(ov);
    ov.querySelector('[data-v54-yes]').focus();
  });
}

/* ---------------- Opptak ---------------- */

const R = { state: 'idle', btn: null, target: null, mr: null, stream: null, chunks: [], t0: 0, timer: 0, tick: 0, hold: false, cancel: false };
const setBtn = (cls) => { if (!R.btn) return; R.btn.classList.toggle('v54-on', cls === 'on'); R.btn.classList.toggle('v54-busy', cls === 'busy'); R.btn.setAttribute('aria-pressed', String(cls === 'on')); };

async function start(btn, target, hold) {
  if (R.state !== 'idle') return;
  if (!canRecord()) {
    say(window.isSecureContext ? 'Nettleseren kan ikke ta opp lyd her.' : '<b>Mikrofonen virker bare over https.</b> Åpne Homelab via https-adressen (eller appen) for å snakke.', btn, 6000);
    return;
  }
  R.state = 'asking';
  if (!(await confirmMic())) { R.state = 'idle'; return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (e) {
    R.state = 'idle';
    say(e?.name === 'NotAllowedError' ? 'Mikrofonen er blokkert. Gi Homelab lov i nettleserens innstillinger for nettstedet (hengelåsen ved adressen).' : e?.name === 'NotFoundError' ? 'Fant ingen mikrofon.' : 'Fikk ikke tilgang til mikrofonen.', btn, 7000);
    return;
  }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  Object.assign(R, { state: 'rec', btn, target, mr, stream, chunks: [], t0: Date.now(), hold: hold && !released, cancel: false });
  mr.ondataavailable = (e) => { if (e.data?.size) R.chunks.push(e.data); };
  mr.onstop = () => finish();
  mr.start(250);
  setBtn('on');
  const show = () => say(`<span class="v54-dot"></span><b>Lytter</b> ${Math.floor((Date.now() - R.t0) / 1000)} s · ${R.hold ? 'slipp for å sende' : 'trykk igjen for å stoppe'} · Esc avbryter`, R.btn);
  show();
  R.tick = setInterval(show, 1000);
  R.timer = setTimeout(() => stop(), MAX_MS);
}
function stop(cancel = false) {
  if (R.state !== 'rec') return;
  R.cancel = cancel;
  clearTimeout(R.timer); clearInterval(R.tick);
  R.state = 'stopping';
  try { R.mr.stop(); } catch { finish(); }
}
async function finish() {
  R.stream?.getTracks().forEach((t) => t.stop());
  const ms = Date.now() - R.t0, btn = R.btn, target = R.target, mime = R.mr?.mimeType || 'audio/webm';
  const blob = new Blob(R.chunks, { type: mime });
  Object.assign(R, { mr: null, stream: null, chunks: [] });
  if (R.cancel) { setBtn(''); R.state = 'idle'; R.btn = null; hide(); return; }
  if (ms < MIN_MS || blob.size < 600) { setBtn(''); R.state = 'idle'; R.btn = null; say('For kort opptak – hold inne mens du snakker, eller trykk én gang for å starte.', btn, 4000); return; }
  R.state = 'busy'; setBtn('busy');
  say('<b>Tolker</b> talen …', btn);
  try {
    const fd = new FormData();
    fd.append('file', blob, `tale.${/mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'}`);
    fd.append('language', 'auto');
    fd.append('hint', appLang());
    const r = await fetch('/api/voice53/transcribe', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `Feil ${r.status}`), { status: r.status });
    const text = String(j.text ?? '').trim();
    if (!text) say(`Hørte ingen ord · ${esc(j.engine_label ?? '')}`, btn, 4000);
    else {
      insert(target, text);
      say(`<b>${esc(j.engine_label ?? j.engine ?? 'Tale til tekst')}</b> · ${esc(j.language_label ?? j.language ?? '')}${j.detected?.source === 'detected' ? ' (oppdaget)' : ''}`, btn, 5000);
    }
  } catch (e) {
    say(`Tale til tekst: ${esc(e.message)}`, btn, 8000);
    if (e.status === 503 || e.status === 422) backends(true);
  } finally { setBtn(''); R.state = 'idle'; R.btn = null; }
}
function insert(target, text) {
  const el = typeof target === 'function' ? target() : target;
  if (!el) return;
  const cur = el.value ?? '';
  el.value = `${cur}${cur && !/\s$/.test(cur) ? ' ' : ''}${text}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus({ preventScroll: true });
  try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* */ }
}

/* ---------------- Knappene (Glimt-chatten og Glimt-søket) ---------------- */

const chatInput = () => document.querySelector('[data-ch-in]');
const targetOf = (btn) => (btn.matches('[data-ch-mic]') ? chatInput : () => btn.closest('form[data-search]')?.querySelector('input[name="q"]'));
// Chat-knappen tas over bare når serveren har en motor (eller konteksten er usikker – da forklarer vi). Ellers: chat.js sin egen vei.
const ours = (btn) => btn.matches('[data-v54-mic]') || (btn.matches('[data-ch-mic]') && (anyEngine() || !window.isSecureContext));
let down = null; // {btn, t, started}
let released = true; // sluppet før opptaket rakk å starte (f.eks. mens tillatelsen ble vist) → trykk-modus

document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest?.('[data-ch-mic],[data-v54-mic]');
  if (!btn || e.button > 0 || !ours(btn)) return;
  e.preventDefault(); e.stopPropagation();
  if (R.state === 'rec') { down = { btn, t: Date.now(), stopper: true }; return; }
  down = { btn, t: Date.now(), stopper: false };
  released = false;
  // Hold inne: start etter en kort stund (et vanlig trykk starter i pointerup).
  down.holdTimer = setTimeout(() => { if (down?.btn === btn) { down.started = true; start(btn, targetOf(btn), true); } }, HOLD_MS);
}, true);
document.addEventListener('pointerup', (e) => {
  if (!down) return;
  const d = down; down = null;
  released = true;
  clearTimeout(d.holdTimer);
  e.preventDefault(); e.stopPropagation();
  if (d.stopper) { stop(); return; }
  if (d.started) { if (R.state === 'rec' && R.hold) stop(); return; }
  start(d.btn, targetOf(d.btn), false); // trykk = start, trykk igjen = stopp
}, true);
document.addEventListener('pointercancel', () => { if (down) { clearTimeout(down.holdTimer); if (down.started) stop(true); down = null; } }, true);
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-ch-mic],[data-v54-mic]');
  if (!btn || !ours(btn)) return;
  e.preventDefault(); e.stopPropagation(); // chat.js sin mic() skal ikke også starte
  if (e.detail === 0) { if (R.state === 'rec') stop(); else start(btn, targetOf(btn), false); } // tastatur (Enter/mellomrom)
}, true);
document.addEventListener('contextmenu', (e) => { if (e.target.closest?.('[data-ch-mic],[data-v54-mic]')) e.preventDefault(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && R.state === 'rec') { e.stopPropagation(); stop(true); } }, true);

function decorate() {
  const show = anyEngine() || (!window.isSecureContext && !!S.info);
  for (const f of document.querySelectorAll('form[data-search]')) {
    const has = f.querySelector('[data-v54-mic]');
    if (!show) { has?.remove(); continue; }
    if (has) continue;
    css();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'v54-mic'; b.dataset.v54Mic = '';
    b.setAttribute('aria-label', 'Snakk inn søket (hold inne, eller trykk for start og stopp)');
    b.title = window.isSecureContext ? 'Snakk (norsk eller engelsk)' : 'Mikrofonen krever https';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = MIC;
    f.insertBefore(b, f.querySelector('button[type="submit"]'));
  }
  for (const m of document.querySelectorAll('[data-ch-mic]')) if (ours(m)) { m.title = 'Snakk (hold inne, eller trykk for start og stopp)'; if (R.state === 'rec' && R.btn !== m && R.btn && !document.contains(R.btn)) { R.btn = m; setBtn('on'); } }
  for (const el of document.querySelectorAll('[data-v54-ai]:not([data-v54-done])')) aiCard(el);
}

/* ---------------- AI-kontroll › Tale til tekst ---------------- */

const A = { health: null, admin: null, cfg: null, msg: '', busy: false, at: 0 };
const ST = { ok: 'Svarer', starting: 'Laster modellen', down: 'Svarer ikke', auth: 'Nøkkel eller IP avvist', error: 'Modellen kunne ikke lastes', off: 'Av' };
// Fermion (Neutrino i Chat, Phonon til tale→tekst) på Mac mini-en: adresse og nøkkel (PUT /api/admin/fermion53/config, bare admin).
const F = { at: 0, cfg: null, health: null, busy: false, msg: '' };
async function loadFermion(force = false) {
  if (!force && F.at && Date.now() - F.at < 30_000) return;
  F.at = Date.now();
  const [h, c] = await Promise.all([fetch(`/api/admin/fermion53/health${force ? '?fresh=1' : ''}`, { credentials: 'same-origin' }), fetch('/api/admin/fermion53/config', { credentials: 'same-origin' })].map((p) => p.then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  F.health = h; F.cfg = c;
}
function fermionHtml(row = false) {
  if (!F.cfg) return '';
  if (row) { // prompt 65: innholdet i raden «Neutrino» i AI → Tjenester
    const keySet = F.cfg.neutrinoKeySet || F.cfg.phononKeySet;
    return `<form class="ac-form" data-f53-form>
        <label class="ac-f"><span>Neutrino</span><input name="neutrinoUrl" value="${esc(F.cfg.neutrinoUrl ?? '')}" placeholder="http://10.69.1.173:8000" autocomplete="off" spellcheck="false" aria-label="Adressen til Neutrino (i huset)"></label>
        <label class="ac-f"><span>Phonon</span><input name="phononUrl" value="${esc(F.cfg.phononUrl ?? '')}" placeholder="http://10.69.1.173:8010" autocomplete="off" spellcheck="false" aria-label="Adressen til Phonon (i huset)"></label>
        <label class="ac-f"><span>Nøkkel${keySet ? ' <i class="ac-tg">SATT</i>' : ''}</span><input name="key" type="password" value="" placeholder="${keySet ? 'Lagret – skriv en ny for å bytte' : 'Nøkkelen tools/fermion/install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel (samme for begge)"></label>
        <div class="ac-btns"><button type="submit" class="ac-b ink"${F.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-f53-test="neutrino"${F.busy || !F.cfg.neutrinoUrl ? ' disabled' : ''}>Test Neutrino</button><button type="button" class="ac-b line" data-f53-test="phonon"${F.busy || !F.cfg.phononUrl ? ' disabled' : ''}>Test Phonon</button></div>
        ${F.msg ? `<span class="ac-mut" role="status">${esc(F.msg)}</span>` : ''}
      </form><p class="ac-note">Samme nøkkel brukes for Neutrino og Phonon. Tom adresse slår tjenesten av. Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri.</p>`;
  }
  const st = (x) => (!x ? 'Laster …' : x.ok ? 'Svarer' : ({ auth: 'Nøkkel eller IP avvist', down: 'Svarer ikke', starting: 'Starter', off: 'Ikke satt opp' }[x.status] ?? x.status ?? 'Ikke satt opp'));
  const keySet = F.cfg.neutrinoKeySet || F.cfg.phononKeySet;
  return `<div class="ac-card v54-ai" style="margin-top:10px;padding:12px 14px">
      <b>Fermion på Mac mini-en</b>
      <div class="ac-mut">Neutrino-1 8B (Chat): ${esc(st(F.health?.neutrino))} · Phonon (engelsk tale): ${esc(st(F.health?.phonon))}</div>
      <form class="v54-form" data-f53-form>
        <input name="neutrinoUrl" value="${esc(F.cfg.neutrinoUrl ?? '')}" placeholder="Neutrino: http://10.69.1.173:8000" autocomplete="off" spellcheck="false" aria-label="Adressen til Neutrino (i huset)">
        <input name="phononUrl" value="${esc(F.cfg.phononUrl ?? '')}" placeholder="Phonon: http://10.69.1.173:8010" autocomplete="off" spellcheck="false" aria-label="Adressen til Phonon (i huset)">
        <input name="key" type="password" value="" placeholder="${keySet ? 'Nøkkel er lagret – skriv en ny for å bytte' : 'Nøkkelen tools/fermion/install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel (samme for begge)">
        <div class="v54-btns"><button type="submit" class="ac-b ink"${F.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-f53-test="neutrino"${F.busy || !F.cfg.neutrinoUrl ? ' disabled' : ''}>Test Neutrino</button><button type="button" class="ac-b line" data-f53-test="phonon"${F.busy || !F.cfg.phononUrl ? ' disabled' : ''}>Test Phonon</button></div>
        ${F.msg ? `<span class="ac-mut" role="status">${esc(F.msg)}</span>` : ''}
      </form>
      <div class="ac-note">Samme nøkkel brukes for begge tjenestene. Tom adresse slår tjenesten av. Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri.</div></div>`;
}
async function loadAdmin(force = false) {
  if (!force && A.at && Date.now() - A.at < 30_000) return;
  A.at = Date.now();
  const [h, c] = await Promise.all([fetch(`/api/admin/whisper54/health${force ? '?fresh=1' : ''}`, { credentials: 'same-origin' }), fetch('/api/admin/whisper54/config', { credentials: 'same-origin' })].map((p) => p.then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  A.admin = !!h; A.health = h; A.cfg = c;
}
// Prompt 65: [data-v54-ai="nb"] / [data-v54-ai="fermion"] = innholdet i de utvidede radene i AI → Tjenester (uten eget kort).
function nbRowHtml() {
  if (!A.admin) return '<p class="ac-note">Adressen og nøkkelen settes av administrator.</p>';
  const n = A.health?.nbwhisper;
  return `<form class="ac-form" data-v54-form>
        <label class="ac-f"><span>Adresse</span><input name="url" value="${esc(A.cfg?.url ?? '')}" placeholder="http://10.69.1.173:8020" autocomplete="off" spellcheck="false" aria-label="Adressen til NB-Whisper (i huset)"></label>
        <label class="ac-f"><span>Nøkkel${A.cfg?.keySet ? ' <i class="ac-tg">SATT</i>' : ''}</span><input name="key" type="password" value="" placeholder="${A.cfg?.keySet ? 'Lagret – skriv en ny for å bytte' : 'Nøkkelen install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel"></label>
        <div class="ac-btns"><button type="submit" class="ac-b ink"${A.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-v54-test${A.busy || !n?.configured ? ' disabled' : ''}>Test</button><button type="button" class="ac-b line" data-v54-fresh>Sjekk nå</button></div>
        ${A.msg ? `<span class="ac-mut" role="status">${esc(A.msg)}</span>` : ''}
      </form><p class="ac-note">Norsk (bokmål og nynorsk), engelsk og språkdeteksjon · Nasjonalbiblioteket, Apache-2.0. Installer på Mac mini-en: <span class="ac-mono">tools/nb-whisper/install.sh</span> (docs/nb-whisper-54.md). Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri. Lyden forlater aldri huset.</p>`;
}
const partHtml = (part) => (part === 'nb' ? nbRowHtml() : part === 'fermion' ? (A.admin ? fermionHtml(true) || '<span class="ac-mut">Laster …</span>' : '<p class="ac-note">Adressene og nøkkelen settes av administrator.</p>') : aiHtml());
/** Prompt 65: status for radene NB-Whisper, Voz, Phonon og Neutrino i AI → Tjenester. */
export function voiceStatus54() {
  const B = S.info?.backends ?? [], by = (id) => B.find((b) => b.id === id);
  const one = (id) => { const b = by(id); return b ? { dot: b.configured === false ? 'off' : b.available ? 'ok' : 'bad', text: b.configured === false ? 'Ikke satt opp' : b.available ? 'Klar' : 'Ikke klar', label: b.engine_label ?? b.label } : null; };
  const n = A.health?.nbwhisper, fs = (x) => (!x ? null : { dot: x.ok ? 'ok' : x.status === 'off' ? 'off' : x.status === 'starting' ? 'warn' : 'bad', text: x.ok ? 'Svarer' : ({ auth: 'Nøkkel eller IP avvist', down: 'Svarer ikke', starting: 'Starter', off: 'Ikke satt opp' }[x.status] ?? x.status ?? 'Ikke satt opp') });
  return { admin: !!A.admin, norwegian: S.info?.norwegian ?? null,
    nbwhisper: n ? { dot: n.ok ? 'ok' : n.configured === false || n.status === 'off' ? 'off' : n.status === 'starting' ? 'warn' : 'bad', text: `${ST[n.status] ?? n.status}${n.model ? ` · ${n.model}` : ''}`, url: A.cfg?.url ?? '' } : one('nbwhisper'),
    voz: one('voz'), phonon: fs(F.health?.phonon) ?? one('phonon'), neutrino: fs(F.health?.neutrino), fermionUrls: F.cfg ? { neutrino: F.cfg.neutrinoUrl ?? '', phonon: F.cfg.phononUrl ?? '' } : null };
}
export const loadVoice54 = () => Promise.all([backends(), loadAdmin(), loadFermion()]).then(() => document.dispatchEvent(new Event('ac:redraw')));
function aiHtml() {
  const B = S.info?.backends ?? [];
  const rows = B.map((b) => {
    const nor = b.languages?.includes('no');
    const desc = b.id === 'nbwhisper' ? 'Norsk (bokmål og nynorsk), engelsk og språkdeteksjon · Nasjonalbiblioteket, Apache-2.0'
      : b.id === 'voz' ? 'Engelsk og 24 andre europeiske språk (ikke norsk) · på serveren' : b.id === 'phonon' ? 'Engelsk (+ europeiske språk, ikke norsk) · Fermion Research' : `${b.languages?.length ?? '?'} språk`;
    const st = b.configured === false ? 'Ikke satt opp' : b.available ? 'Klar' : 'Ikke klar';
    return `<div class="ac-mrow"><div class="ac-row"><span class="ac-dot" style="background:${b.available ? 'var(--ok)' : 'var(--line)'}"></span><b class="ac-grow ac-ell">${esc(b.engine_label ?? b.label)}</b><span class="ac-mut">${esc(st)}${nor ? ' · norsk' : ''}</span></div><span class="ac-mut">${esc(desc)}</span></div>`;
  }).join('') || '<div class="ac-mrow"><span class="ac-mut">Laster …</span></div>';
  const n = A.health?.nbwhisper;
  const adm = A.admin ? `<div class="ac-card v54-ai" style="margin-top:10px;padding:12px 14px">
      <b>NB-Whisper på Mac mini-en</b>
      <div class="ac-mut">${n ? esc(`${ST[n.status] ?? n.status}${n.model ? ` · ${n.model}` : ''}${n.engine ? ` · ${{ mlx: 'MLX (Metal)', cpp: 'whisper.cpp (Metal)' }[n.engine] ?? n.engine}` : ''}${n.error && !n.ok ? ` · ${n.error}` : ''}${n.flag === false ? ' · flagget whisper_nb54 er av' : ''}`) : 'Laster …'}</div>
      <form class="v54-form" data-v54-form>
        <input name="url" value="${esc(A.cfg?.url ?? '')}" placeholder="http://10.69.1.173:8020" autocomplete="off" spellcheck="false" aria-label="Adressen til NB-Whisper (i huset)">
        <input name="key" type="password" value="" placeholder="${A.cfg?.keySet ? 'Nøkkel er lagret – skriv en ny for å bytte' : 'Nøkkelen install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel">
        <div class="v54-btns"><button type="submit" class="ac-b ink"${A.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-v54-test${A.busy || !n?.configured ? ' disabled' : ''}>Test</button><button type="button" class="ac-b line" data-v54-fresh>Sjekk nå</button></div>
        ${A.msg ? `<span class="ac-mut" role="status">${esc(A.msg)}</span>` : ''}
      </form>
      <div class="ac-note">Installer på Mac mini-en: <span class="ac-mono">tools/nb-whisper/install.sh</span> (se docs/nb-whisper-54.md). Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri.</div></div>${fermionHtml()}` : '';
  return `<div class="ac-sec"><span class="ac-lab">TALE TIL TEKST</span><div class="ac-card ac-list">${rows}</div>
    <div class="ac-note">${S.info?.norwegian ? `Norsk: ${esc(S.info.norwegian_engine ?? 'klar')}.` : 'Norsk tale til tekst krever NB-Whisper på Mac mini-en.'} Språket oppdages automatisk; engelsk går til Voz, så Phonon, så NB-Whisper. Lyden forlater aldri huset.</div>${adm}</div>`;
}
async function aiCard(el) {
  el.dataset.v54Done = '1';
  el.innerHTML = partHtml(el.dataset.v54Ai);
  await Promise.all([backends(), loadAdmin(), loadFermion()]);
  if (document.contains(el)) el.innerHTML = partHtml(el.dataset.v54Ai);
  document.dispatchEvent(new Event('ac:redraw'));
}
const repaintAi = () => { for (const el of document.querySelectorAll('[data-v54-ai]')) el.innerHTML = partHtml(el.dataset.v54Ai); document.dispatchEvent(new Event('ac:redraw')); };
document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-v54-form]');
  if (!f) return;
  e.preventDefault();
  const body = { url: f.url.value.trim() };
  if (f.key.value.trim()) body.key = f.key.value.trim();
  A.busy = true; A.msg = 'Lagrer …'; repaintAi();
  try {
    const r = await fetch('/api/admin/whisper54/config', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    A.msg = r.ok ? 'Lagret. Sjekker Mac mini-en …' : j.error || `Feil ${r.status}`;
    if (r.ok) { A.cfg = j; setTimeout(async () => { await Promise.all([loadAdmin(true), backends(true)]); A.msg = ''; repaintAi(); }, 1800); }
  } catch (err) { A.msg = err.message; }
  A.busy = false; repaintAi();
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-f53-form]');
  if (!f) return;
  e.preventDefault();
  const body = { neutrinoUrl: f.neutrinoUrl.value.trim(), phononUrl: f.phononUrl.value.trim() };
  const k = f.key.value.trim();
  if (k) { body.neutrinoKey = k; body.phononKey = k; }
  F.busy = true; F.msg = 'Lagrer …'; repaintAi();
  try {
    const r = await fetch('/api/admin/fermion53/config', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    F.msg = r.ok ? 'Lagret. Sjekker Mac mini-en …' : j.error || `Feil ${r.status}`;
    if (r.ok) { setTimeout(async () => { await Promise.all([loadFermion(true), backends(true)]); F.msg = ''; repaintAi(); }, 2500); }
  } catch (err) { F.msg = err.message; }
  F.busy = false; repaintAi();
});
document.addEventListener('click', async (e) => {
  const t = e.target.closest?.('[data-f53-test]');
  if (!t) return;
  F.busy = true; F.msg = `Tester ${t.dataset.f53Test === 'neutrino' ? 'Neutrino (første svar kan ta litt tid)' : 'Phonon'} …`; repaintAi();
  try {
    const j = await fetch('/api/admin/fermion53/test', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: t.dataset.f53Test }) }).then((r) => r.json());
    F.msg = j.ok ? `OK på ${j.ms} ms${j.model ? ` · ${j.model}` : ''}${j.text ? ` · «${String(j.text).slice(0, 60)}»` : ''}` : `Feilet: ${j.error ?? 'ukjent feil'}`;
    await loadFermion(true);
  } catch (err) { F.msg = err.message; }
  F.busy = false; repaintAi();
});
document.addEventListener('click', async (e) => {
  if (e.target.closest?.('[data-v54-fresh]')) { await Promise.all([loadAdmin(true), backends(true)]); repaintAi(); return; }
  if (!e.target.closest?.('[data-v54-test]')) return;
  A.busy = true; A.msg = 'Tester (1 s stillhet) …'; repaintAi();
  try {
    const j = await fetch('/api/admin/whisper54/test', { method: 'POST', credentials: 'same-origin' }).then((r) => r.json());
    A.msg = j.ok ? `OK på ${j.ms} ms · ${j.model ?? ''} · oppdaget «${j.detected ?? '?'}»` : `Feilet: ${j.error ?? 'ukjent feil'}`;
  } catch (err) { A.msg = err.message; }
  A.busy = false; repaintAi();
});

/* ---------------- Oppstart ---------------- */

let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorate(); }); };
function boot() {
  backends().then(schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (document.visibilityState === 'visible') backends(true).then(schedule); }, 5 * 60_000);
  schedule();
}
if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
window.hlVoice54 = { backends, start: (btn, input) => start(btn, () => input, false), stop };
