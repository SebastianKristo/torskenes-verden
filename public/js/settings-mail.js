// Proton Mail (via Bridge) → kvitteringer i FinansHub. Brukes i Homelab → Innstillinger → Integrasjoner → Proton Mail
// og i FinansHub → Innstillinger → Import. Snakker bare med /finans/api/mail/*; Bridge-passordet sendes aldri tilbake.
const API = '/finans/api/mail';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => (t ? new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'aldri');

async function call(path, opts = {}) {
  const init = { method: opts.method ?? 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(API + path, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Feil ${r.status}`);
  return d;
}

const GUIDE = [
  ['Sjekk abonnementet', 'Proton Mail har ingen vanlig IMAP-server. Tilgang går gjennom Proton Mail Bridge, som bare finnes på betalte planer (Mail Plus, Unlimited, Duo, Family og Business).'],
  ['Start Bridge på homelaben', 'Bridge ligger allerede i docker-compose.yml som profilen «mail», på samme nettverk som FinansHub. Portene publiseres ikke mot internett.', 'docker compose --profile mail up -d protonmail-bridge'],
  ['Logg inn første gang', 'Kjør oppsettet i terminalen. Skriv login og logg inn med Proton-adresse, passord og 2FA-kode. Vent til synkroniseringen er ferdig.', 'docker compose --profile mail run --rm protonmail-bridge init\n>>> login'],
  ['Hent brukernavn og passord', 'Skriv info i samme terminal. Brukernavnet er Proton-adressen. Passordet er et eget Bridge-passord som Bridge lager – ikke Proton-passordet ditt. Skriv exit, og start Bridge på nytt.', '>>> info\nIMAP port: 1143\nUsername:  navn@proton.me\nPassword:  (kopier denne)\nSecurity:  STARTTLS\n>>> exit\ndocker compose --profile mail up -d'],
  ['Finn vert og port', 'Fra FinansHub-containeren er verten navnet på tjenesten, protonmail-bridge, og porten 143 (imaget videresender 143 til Bridge sin 1143). Kjører Bridge-appen på samme maskin uten Docker: 127.0.0.1 og 1143.'],
  ['Lag en mappe og et filter i Proton', 'På mail.proton.me: Innstillinger → Filtre → Legg til filter. For eksempel: emne inneholder «kvittering», «ordre» eller «receipt», eller avsender er butikken. Handling: flytt til mappen Kvitteringer. Lag også undermappen Lest. I Bridge heter egne mapper Folders/Navn og etiketter Labels/Navn.'],
  ['Fyll ut feltene og test', 'Trykk Test tilkobling. Første gang lagres (pinnes) Bridge sitt selvsignerte sertifikat. Ferdige e-poster flyttes til «Flytt ferdige til», så de ikke leses to ganger.'],
];

const CSS = `
.mailp{display:flex;flex-direction:column;gap:18px;color:inherit;font:inherit}
.mailp h4{margin:0;font-size:15px;font-weight:600}
.mailp .mp-card{background:var(--mp-card,rgba(255,255,255,.035));border:1px solid var(--mp-line,rgba(255,255,255,.09));border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.mailp .mp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.mailp label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;opacity:.85}
.mailp input,.mailp select{background:var(--mp-field,rgba(0,0,0,.25));border:1px solid var(--mp-line,rgba(255,255,255,.12));border-radius:10px;padding:10px 12px;color:inherit;font:inherit;font-size:14px;min-width:0}
.mailp input:focus,.mailp select:focus{outline:2px solid var(--mp-acc,#a8d4fb);outline-offset:1px}
.mailp .mp-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.mailp button{border:1px solid var(--mp-line,rgba(255,255,255,.14));background:var(--mp-btn,rgba(255,255,255,.06));color:inherit;border-radius:10px;padding:9px 14px;font:inherit;font-size:14px;cursor:pointer}
.mailp button.pri{background:var(--mp-acc,#a8d4fb);color:var(--mp-acc-ink,#0b1220);border-color:transparent;font-weight:600}
.mailp button:disabled{opacity:.5;cursor:default}
.mailp .mp-res{border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5}
.mailp .mp-res.ok{background:rgba(95,211,168,.1);border:1px solid rgba(95,211,168,.35)}
.mailp .mp-res.bad{background:rgba(255,138,122,.1);border:1px solid rgba(255,138,122,.35)}
.mailp .mp-note{font-size:13px;opacity:.75;line-height:1.5}
.mailp .mp-steps{display:flex;flex-direction:column;border:1px solid var(--mp-line,rgba(255,255,255,.09));border-radius:16px;overflow:hidden}
.mailp .mp-step{display:flex;gap:14px;padding:14px 18px}
.mailp .mp-step+.mp-step{border-top:1px solid var(--mp-line,rgba(255,255,255,.09))}
.mailp .mp-no{flex:none;width:26px;height:26px;border-radius:50%;background:var(--mp-chip,rgba(168,212,251,.14));color:var(--mp-acc,#a8d4fb);display:grid;place-items:center;font-size:13px;font-weight:600}
.mailp pre{margin:6px 0 0;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.3);border:1px solid var(--mp-line,rgba(255,255,255,.09));font:12.5px/1.55 ui-monospace,'JetBrains Mono',monospace;white-space:pre-wrap;word-break:break-word}
.mailp .mp-switch{display:flex;align-items:center;gap:10px;font-size:14px;opacity:1;flex-direction:row}
.mailp .mp-switch input{width:18px;height:18px;padding:0}
.mailp table{width:100%;border-collapse:collapse;font-size:13px}
.mailp td{padding:6px 4px;border-top:1px solid var(--mp-line,rgba(255,255,255,.07));vertical-align:top}
.mailp .mp-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.mailp .mp-kv div{display:flex;flex-direction:column;gap:2px}.mailp .mp-kv b{font-size:15px;font-weight:600}.mailp .mp-kv span{font-size:12px;opacity:.7}
`;
function ensureCss() {
  if (document.getElementById('mailp-css')) return;
  const s = document.createElement('style'); s.id = 'mailp-css'; s.textContent = CSS; document.head.append(s);
}

// Klientsjekk av vanlige feil før vi i det hele tatt kobler til (samme regler som i designet).
export function precheck(v) {
  const port = +v.port;
  if (!v.host) return 'Fyll inn vert, f.eks. protonmail-bridge.';
  if (/imap\.proton|mail\.proton|(^|\.)proton\.me$/i.test(v.host)) return 'Proton har ingen offentlig IMAP-server. Verten skal være Bridge, for eksempel protonmail-bridge eller 127.0.0.1.';
  if (!(port > 0 && port < 65536)) return 'Porten må være et tall, vanligvis 143 i Docker eller 1143 for Bridge-appen.';
  if (v.security === 'starttls' && [993, 465, 587].includes(port)) return `Bridge bruker ikke port ${port}. Bruk 143 (Docker) eller 1143 (Bridge-appen) med STARTTLS.`;
  if (v.user && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.user)) return 'Brukernavnet skal være hele Proton-adressen, slik den står under «info» i Bridge.';
  if (v.pass && v.pass.length < 12) return 'Bridge-passordet er vanligvis 16 tegn. Har du brukt Proton-passordet? Kopier passordet fra «info» i Bridge.';
  if (v.folder && !/^(INBOX|Folders\/|Labels\/)/.test(v.folder)) return `Egne mapper heter Folders/${v.folder} i Bridge, og etiketter Labels/${v.folder}.`;
  return null;
}

export async function mailPane(el, { guide = true } = {}) {
  ensureCss();
  // Samme element kan monteres på nytt (f.eks. når innstillingene tegnes om): bare tegn på nytt.
  if (el._mailp) return el._mailp();
  el._mailp = () => draw();
  let data, res = null, busy = false;
  const load = async () => { data = await call('/config'); };
  const form = () => Object.fromEntries(new FormData(el.querySelector('form.mp-form')));
  const draw = () => {
    if (!data) { el.innerHTML = '<div class="mailp"><div class="mp-note">Laster …</div></div>'; return; }
    const c = data.config, s = data.status;
    el.innerHTML = `<div class="mailp">
      <form class="mp-form mp-card" autocomplete="off">
        <div class="mp-row" style="justify-content:space-between"><h4>Proton Mail via Bridge</h4>
          <label class="mp-switch"><input type="checkbox" name="mailOn" ${c.on ? 'checked' : ''}> Hent automatisk</label></div>
        <div class="mp-grid">
          <label>Vert<input name="host" value="${esc(c.host)}" placeholder="protonmail-bridge" spellcheck="false" autocapitalize="off"></label>
          <label>Port<input name="port" inputmode="numeric" value="${esc(c.port)}" placeholder="143"></label>
          <label>Sikkerhet<select name="security">${[['starttls', 'STARTTLS (Bridge)'], ['tls', 'TLS (port 993)'], ['none', 'Ingen (bare lukket nett)']].map(([v, l]) => `<option value="${v}" ${c.security === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Brukernavn (fra Bridge)<input name="user" value="${esc(c.user)}" placeholder="navn@proton.me" spellcheck="false" autocapitalize="off" data-1p-ignore data-lpignore="true"></label>
          <label>Bridge-passord<input name="pass" type="password" value="" placeholder="${c.passSet ? '•••••••• lagret på serveren' : 'Fra «info» i Bridge'}" autocomplete="new-password" data-1p-ignore data-lpignore="true"></label>
          <label>Mappe å lese fra<input name="folder" value="${esc(c.folder)}" placeholder="Folders/Kvitteringer"></label>
          <label>Flytt ferdige til<input name="doneFolder" value="${esc(c.doneFolder)}" placeholder="Folders/Kvitteringer/Lest"></label>
          <label>Sjekk hvert (minutter)<input name="poll" inputmode="numeric" value="${esc(c.poll)}"></label>
          <label>Finn-mappe (valgfritt)<input name="finnFolder" value="${esc(c.finnFolder)}" placeholder="Folders/Finn"></label>
        </div>
        ${c.pin ? `<div class="mp-note">Pinnet sertifikat${c.pin.subject ? ` (${esc(c.pin.subject)})` : ''}: <span style="font-family:ui-monospace,monospace;font-size:12px;word-break:break-all">${esc(c.pin.fingerprint)}</span> · <button type="button" data-mp="forget" style="padding:4px 10px;font-size:12.5px">Glem sertifikat</button></div>` : ''}
        ${res ? `<div class="mp-res ${res.ok ? 'ok' : 'bad'}" role="status"><b>${res.ok ? '✓' : '✕'}</b> ${esc(res.message ?? '')}</div>` : ''}
        <div class="mp-row"><button class="pri" ${busy ? 'disabled' : ''}>Lagre</button><button type="button" data-mp="test" ${busy ? 'disabled' : ''}>Test tilkobling</button><button type="button" data-mp="run" ${busy || !c.passSet ? 'disabled' : ''}>Kjør nå</button>${c.passSet ? '<button type="button" data-mp="clear" style="margin-left:auto">Fjern passord</button>' : ''}</div>
      </form>
      <div class="mp-card"><h4>Status</h4>
        <div class="mp-kv"><div><span>Sist sjekket</span><b>${esc(when(s.lastCheck))}</b></div><div><span>Importert totalt</span><b>${s.imported ?? 0}</b></div><div><span>Forrige runde</span><b>${s.lastImported ?? 0}</b></div><div><span>Uleste nå</span><b>${s.unseen ?? '–'}</b></div></div>
        ${s.lastError ? `<div class="mp-res bad">Siste feil: ${esc(s.lastError)}</div>` : ''}
        ${data.recent?.length ? `<table><tbody>${data.recent.slice(0, 8).map((r) => `<tr><td>${esc(when(r.created))}</td><td>${esc(r.subject || r.sender || r.messageId)}</td><td style="text-align:right">${r.status === 'imported' ? '✓ importert' : esc(r.error ?? r.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="mp-note">Ingen e-poster importert ennå. Vedlegg (PDF, JPG, PNG, HEIC) og e-poster uten vedlegg sendes til AI-lesingen og havner i opplastingskøen i FinansHub.</div>'}
      </div>
      ${guide ? `<div style="display:flex;flex-direction:column;gap:10px"><h4>Slik setter du det opp</h4><div class="mp-steps">${GUIDE.map(([t, d, code], i) => `<div class="mp-step"><span class="mp-no">${i + 1}</span><div style="min-width:0;display:flex;flex-direction:column;gap:4px"><b style="font-weight:600">${esc(t)}</b><div class="mp-note" style="opacity:.85">${esc(d)}</div>${code ? `<pre>${esc(code)}</pre>` : ''}</div></div>`).join('')}</div>
        <div class="mp-note">Variablene kan også settes i <code>.env</code>: IMAP_HOST, IMAP_PORT, IMAP_SECURITY, IMAP_USER, IMAP_PASSWORD, IMAP_FOLDER, IMAP_DONE_FOLDER og IMAP_POLL_MINUTES. Verdier lagret her går foran.</div></div>` : ''}
    </div>`;
  };
  const body = (v) => ({ mailOn: !!v.mailOn, imapHost: v.host, imapPort: v.port, imapSecurity: v.security, imapUser: v.user, imapFolder: v.folder, imapDoneFolder: v.doneFolder, imapPollMinutes: v.poll, imapFinnFolder: v.finnFolder, pass: v.pass || undefined });
  const act = async (fn) => { busy = true; draw(); try { await fn(); } catch (e) { res = { ok: false, message: e.message }; } busy = false; draw(); };
  el.addEventListener('submit', (e) => {
    if (!e.target.closest('form.mp-form')) return;
    e.preventDefault();
    const v = form(), pre = precheck(v);
    if (pre) { res = { ok: false, message: pre }; return draw(); }
    act(async () => { data = await call('/config', { method: 'PUT', json: body(v) }); res = { ok: true, message: 'Lagret' }; });
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mp]'); if (!b || !el.contains(b)) return;
    const v = form();
    if (b.dataset.mp === 'test') {
      const pre = precheck(v);
      if (pre) { res = { ok: false, message: pre }; return draw(); }
      return act(async () => {
        res = await call('/test', { method: 'POST', json: { host: v.host, port: v.port, security: v.security, user: v.user, pass: v.pass, folder: v.folder, doneFolder: v.doneFolder } });
        await load();
      });
    }
    if (b.dataset.mp === 'run') return act(async () => { res = await call('/run', { method: 'POST', json: {} }); await load(); });
    if (b.dataset.mp === 'forget') return act(async () => { data = await call('/config', { method: 'PUT', json: { forgetPin: true } }); res = { ok: true, message: 'Sertifikatet er glemt. Test på nytt for å pinne det igjen.' }; });
    if (b.dataset.mp === 'clear' && confirm('Fjerne Bridge-passordet fra serveren?')) return act(async () => { data = await call('/config', { method: 'PUT', json: { clearPass: true } }); res = null; });
  });
  draw();
  try { await load(); } catch (e) { el.innerHTML = `<div class="mailp"><div class="mp-res bad">${esc(e.message)}</div></div>`; return; }
  draw();
}
