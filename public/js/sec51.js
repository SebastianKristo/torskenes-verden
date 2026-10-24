// Prompt 51 (SEC51): Innstillinger → Sikkerhet (web/PWA).
// Alle: passkeys (legg til / gi nytt navn / fjern), nye enheter som venter på godkjenning (Godkjenn / Avvis), kjente enheter,
// egen innloggingslogg og egne nøkler (alder + «Roter»). Admin i tillegg: sperrer (innlogging, QR, app-token – «Lås opp»),
// revisjonslogg for alle, serverens nøkler og hemmeligheter med alder og påminnelse, logg-skanner og regler.
// Data: /api/security51/* (SERVER51-API.md, SEC51). Monteres i settings.js som egen side (data-mount-host).
import { esc } from './util.js';
import { decodeOptions51, encodeCredential51, passkeySupported51 } from './sec51-login.js';

export const P51 = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4';
/** [id, navn, undertekst, seksjon, ikon] – settes inn i TABS i settings.js. */
export const TABS51 = [['sikkerhet', 'Sikkerhet', 'Passkeys, nye enheter, innloggingslogg, sperrer og nøkler.', 'Sikkerhet', P51]];
export const ALIAS51 = { security: 'sikkerhet', passkey: 'sikkerhet', passkeys: 'sikkerhet', revisjonslogg: 'sikkerhet', revisjon: 'sikkerhet', sperrer: 'sikkerhet', enheter51: 'sikkerhet', nokler: 'sikkerhet', hemmeligheter: 'sikkerhet' };

const S = { d: null, err: '', msg: '', auditAll: false, audit: null, secrets: null, pw: null, rot: null, busy: false, scan: null, host: null };
const when = (t) => (t ? new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const ago = (d) => (d == null ? '' : d === 0 ? 'i dag' : d === 1 ? '1 dag' : `${d} dager`);
const json = async (path, opts = {}) => {
  const r = await fetch(`/api/security51${path}`, { credentials: 'same-origin', cache: 'no-store', ...opts, headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Feil ${r.status}`), { status: r.status, data: j });
  return j;
};
const post = (path, body, method = 'POST') => json(path, { method, body: JSON.stringify(body ?? {}) });

if (!document.getElementById('sec51-css')) {
  const st = document.createElement('style');
  st.id = 'sec51-css';
  st.textContent = `.s51 .sg-row{min-height:64px;flex-wrap:wrap}
.s51-mono{font-family:var(--mono,'IBM Plex Mono',monospace);font-size:13px;opacity:.85}
.s51-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(127,127,127,.18);margin-left:6px;vertical-align:1px}
.s51-tag.red{background:rgba(220,60,50,.18);color:#e0604f}.s51-tag.green{background:rgba(52,199,89,.18);color:#2f9e55}.s51-tag.yel{background:rgba(240,180,40,.2);color:#b7861a}
.s51-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.s51-in{height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;min-width:0;flex:1 1 180px;font:inherit}
.s51-msg{padding:10px 14px;border-radius:12px;background:rgba(52,199,89,.14);margin-bottom:10px}.s51-msg.err{background:rgba(220,60,50,.14)}
.s51-ev{display:grid;grid-template-columns:minmax(110px,auto) 1fr;gap:2px 14px;font-size:14px;width:100%}
.s51-ev span{opacity:.75}`;
  document.head.append(st);
}

const rerender = () => { if (S.host?.isConnected) S.host.innerHTML = html(); };
async function load() {
  try { S.d = await json('/overview'); S.err = ''; } catch (e) { S.err = e.message; }
  try { S.secrets = (await json('/secrets')).secrets; } catch { S.secrets = null; }
  try { S.audit = (await json(`/audit?limit=60${S.auditAll ? '&all=1' : ''}`)).items; } catch { S.audit = null; }
  rerender();
}
const sec = (title, inner, note = '') => `<section class="sg s51"><h3 class="sg-t">${esc(title)}</h3><div class="sg-box">${inner}</div>${note ? `<div class="sg-note">${note}</div>` : ''}</section>`;
const row = (t, s, right = '') => `<div class="sg-row"><span class="sg-txt"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${right ? `<span class="s51-act">${right}</span>` : ''}</div>`;
const btn = (label, attrs, pri = false) => `<button type="button" class="sbtn${pri ? ' pri' : ''}" ${attrs}${S.busy ? ' disabled' : ''}>${esc(label)}</button>`;

function html() {
  if (!S.d) return S.err ? `<div class="s51-msg err">${esc(S.err)}</div>` : '<div class="sg-note">Laster …</div>';
  const d = S.d, out = [];
  if (S.msg) out.push(`<div class="s51-msg${S.msg.startsWith('!') ? ' err' : ''}">${esc(S.msg.replace(/^!/, ''))}</div>`);
  // Venter på godkjenning.
  if (d.pending?.length) {
    out.push(sec('Nye enheter som venter', d.pending.map((p) => row(`${esc(p.device)}${d.admin && p.user ? ` <span class="s51-tag">${esc(p.userName ?? '')}</span>` : ''}`,
      `${esc(p.methodLabel ?? '')} · ${esc(p.ip ?? '')}${p.countryName ? ` · ${esc(p.countryName)}` : ''} · ${when(p.createdAt)}`,
      btn('Godkjenn', `data-s51-approve="${esc(p.id)}"`, true) + btn('Avvis', `data-s51-deny="${esc(p.id)}"`))).join(''),
      'Godkjenn bare hvis det er deg (eller noen du kjenner) som logger inn akkurat nå. Avvis ellers – og bytt passord.'));
  }
  // Passkeys.
  const pk = d.me.passkeys ?? [];
  const pkRows = pk.map((p) => row(`${esc(p.name)}${p.synced ? '<span class="s51-tag">synkronisert</span>' : ''}`, `Lagt til ${when(p.createdAt)} · sist brukt ${p.lastUsedAt ? when(p.lastUsedAt) : 'aldri'}`,
    btn('Gi nytt navn', `data-s51-pkname="${esc(p.id)}"`) + btn('Fjern', `data-s51-pkdel="${esc(p.id)}"`))).join('');
  const canAdd = d.passkeys.available && passkeySupported51();
  const addRow = S.pw === 'passkey'
    ? `<form class="sg-row" data-s51-pwform="passkey"><span class="sg-txt"><b>Bekreft passordet</b><span>For å legge til en passkey.</span></span><span class="s51-act"><input class="s51-in" type="password" name="pw" autocomplete="current-password" aria-label="Passord">${btn('Fortsett', 'type="submit"', true)}</span></form>`
    : row('Legg til passkey', canAdd ? 'Logg inn med Face ID, Touch ID, Windows Hello eller sikkerhetsnøkkel i stedet for passord. Passordet virker fortsatt som reserve.' : esc(d.passkeys.reason ?? 'Nettleseren støtter ikke passkeys.'), canAdd ? btn('Legg til', 'data-s51-pkadd', true) : '');
  out.push(sec('Passkeys', pkRows + addRow, d.passkeys.rpId ? `Passkeys gjelder for <span class="s51-mono">${esc(d.passkeys.rpId)}</span>.` : ''));
  // Kjente enheter.
  const dev = d.me.devices ?? [];
  out.push(sec('Kjente enheter', dev.length ? dev.map((x) => row(`${esc(x.name)}${x.current ? '<span class="s51-tag green">denne</span>' : ''}`,
    `Sist ${when(x.lastSeen)} · ${esc(x.lastIp ?? '')}${x.lastCountry ? ` · ${esc(x.lastCountry)}` : ''} · ${esc({ lan: 'godkjent hjemme', first: 'første enhet', session: 'innlogget fra før', policy: 'uten godkjenning' }[x.approvedBy] ?? (x.approvedByName ? `godkjent av ${x.approvedByName}` : 'godkjent'))}`,
    x.current ? '' : btn('Fjern', `data-s51-devdel="${esc(x.id)}"`))).join('') : row('Ingen ennå', 'Enheter blir kjente når du logger inn hjemme, eller når du godkjenner dem.'),
  'Nye enheter fra internett må godkjennes fra en kjent enhet eller av en administrator. Fjerner du en enhet her, må den godkjennes på nytt neste gang.'));
  // Innloggingslogg.
  const ev = S.audit ?? d.me.audit ?? [];
  const evRows = ev.length ? ev.slice(0, 60).map((e) => `<div class="sg-row"><div class="s51-ev"><b>${esc(e.kindLabel)}${e.ok ? '' : ' <span class="s51-tag red">feil</span>'}</b><span>${when(e.at)}</span>
    <span>${esc([S.auditAll ? e.userName : null, e.methodLabel, e.device].filter(Boolean).join(' · '))}</span><span class="s51-mono">${esc([e.ip, e.country].filter(Boolean).join(' · '))}</span></div></div>`).join('') : row('Ingen hendelser ennå', '');
  out.push(sec(S.auditAll ? 'Revisjonslogg (alle brukere)' : 'Innloggingslogg', (d.admin ? row('Vis', S.auditAll ? 'Alle brukere' : 'Bare meg', btn(S.auditAll ? 'Bare meg' : 'Alle brukere', 'data-s51-auditall')) : '') + evRows,
    'Tid, IP, land (fra Cloudflare) og enhet for innlogginger, feil passord, sperrer, nye enheter og passkeys. Passord og nøkler lagres aldri.'));
  // Nøkler.
  if (S.secrets?.length) {
    const rotForm = (s) => `<form class="sg-row" data-s51-rotform="${esc(s.id)}"><span class="sg-txt"><b>Ny verdi for ${esc(s.label)}</b><span>Lag en ny nøkkel hos tjenesten først. Den gamle virker til du sletter den der.</span></span>
      <span class="s51-act"><input class="s51-in" type="password" name="value" autocomplete="off" placeholder="Ny nøkkel" aria-label="Ny nøkkel" data-glimt="off"><input class="s51-in" type="password" name="pw" autocomplete="current-password" placeholder="Passordet ditt" aria-label="Passordet ditt">${btn('Lagre', 'type="submit"', true)}${btn('Avbryt', 'data-s51-rotcancel')}</span></form>`;
    out.push(sec(d.admin ? 'Nøkler og hemmeligheter' : 'Mine nøkler', S.secrets.map((s) => (S.rot === s.id ? rotForm(s) : row(`${esc(s.label)}${s.overdue ? '<span class="s51-tag red">bør roteres</span>' : s.dueInDays < 30 ? '<span class="s51-tag yel">snart</span>' : ''}`,
      `${esc(s.group)} · ${s.estimated ? 'sett første gang' : 'rotert'} ${s.ageDays === 0 ? 'i dag' : `for ${ago(s.ageDays)} siden`} · grense ${s.maxAgeDays} dager${s.warning ? ` · ⚠ ${esc(s.warning)}` : ''}${s.rotate === 'manual' && s.howTo ? `<br><span class="s51-mono">${esc(s.howTo)}</span>` : ''}`,
      s.rotate === 'paste' ? btn('Roter', `data-s51-rot="${esc(s.id)}"`) : ''))).join(''),
    'Verdiene vises aldri. Alderen regnes fra første gang serveren så nøkkelen, eller fra siste rotering. Administratorer får en påminnelse når en nøkkel er eldre enn grensen.'));
  }
  if (d.admin) {
    const L = d.limits ?? [];
    out.push(sec('Sperrer', L.length ? L.map((x) => row(`${esc(x.scopeLabel)} · ${esc(x.kind === 'acct' ? 'konto' : 'IP')}${x.locked ? '<span class="s51-tag red">sperret</span>' : ''}`,
      `<span class="s51-mono">${esc(x.kind === 'acct' ? x.subject : x.subject)}</span> · ${x.fails} feil${x.locked ? ` · ${Math.ceil(x.secondsLeft / 60)} min igjen` : ''} · sist ${when(x.lastFail)}`,
      btn('Lås opp', `data-s51-unlock="${esc(x.key)}"`))).join('') : row('Ingen sperrer', 'Ingen feil innlogginger det siste døgnet.'),
    'Innlogging: sperre etter 5 feil fra samme IP (1 min, så 2, 4, 8 … maks 6 t) og 10 feil på samme konto (maks 1 t, gjelder ikke fra hjemmenettet). Det samme for QR-koder og app-token-utveksling.'));
    const sc = S.scan ?? d.lastScan;
    out.push(sec('Logg-skanner', (sc?.at ? row(sc.findings?.length ? `<span class="s51-tag red">${sc.findings.length} funn</span>` : '<span class="s51-tag green">Ingen nøkler i loggene</span>', `Sist ${when(sc.at)} · ${sc.sources?.length ?? 0} kilder · Docker: ${esc({ ok: 'skannet', unavailable: 'ikke satt opp', error: 'feil', skipped: 'hoppet over' }[sc.docker] ?? sc.docker ?? '–')}`)
      + (sc.findings ?? []).slice(0, 20).map((f) => row(esc(f.rule), `${esc(f.source)} · ${f.count} treff<br><span class="s51-mono">${esc(f.example ?? '')}</span>`)).join('') : row('Ikke skannet ennå', 'Skanner serverens egen logg, logg-tabeller i databasene, loggfiler og Docker-loggene.'))
      + row('Skann nå', 'Ser etter kjente nøkler og token-mønstre. Funn vises uten selve verdien.', btn(S.busy ? 'Skanner …' : 'Skann nå', 'data-s51-scan', true)),
    'Skanningen kjører også automatisk én gang i døgnet. Nøkler som skrives med console.log maskeres før de havner i loggen.'));
    const p = d.policy;
    const sw = (k, t, s) => `<button type="button" class="sg-row" role="switch" aria-checked="${!!p[k]}" data-s51-pol="${k}"><span class="sg-txt"><b>${esc(t)}</b><span>${esc(s)}</span></span><span class="sg-sw"></span></button>`;
    out.push(sec('Regler', sw('deviceApproval', 'Nye enheter må godkjennes', 'Innlogging fra internett på en ukjent enhet venter til en kjent enhet eller en administrator godkjenner.')
      + sw('newCountryAlert', 'Varsel ved innlogging fra nytt land', 'Bruker landet fra Cloudflare (CF-IPCountry).') + sw('logScanDaily', 'Skann loggene hver dag', 'Varsler administratorene ved funn.')));
  }
  return out.join('');
}

async function act(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; S.msg = ''; rerender();
  try { const r = await fn(); if (okMsg) S.msg = typeof okMsg === 'function' ? okMsg(r) : okMsg; } catch (e) { S.msg = `!${e.message}`; }
  S.busy = false;
  await load();
}
async function addPasskey(password) {
  let o;
  try { o = await post('/passkeys/register/options', password ? { password } : {}); } catch (e) {
    if (e.data?.needsPassword && !password) { S.pw = 'passkey'; S.msg = ''; rerender(); S.host?.querySelector('[data-s51-pwform] input')?.focus(); return null; }
    throw e;
  }
  S.pw = null;
  let cred;
  try { cred = await navigator.credentials.create({ publicKey: decodeOptions51(o.publicKey) }); } catch (e) { throw new Error(e?.name === 'NotAllowedError' ? 'Avbrutt.' : e?.name === 'InvalidStateError' ? 'Denne enheten har allerede en passkey for kontoen.' : 'Enheten kunne ikke lage en passkey.'); }
  const name = (navigator.userAgentData?.platform || (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Android/.test(navigator.userAgent) ? 'Android' : /Windows/.test(navigator.userAgent) ? 'Windows' : 'Enhet'));
  return post('/passkeys/register/verify', { challengeId: o.challengeId, credential: encodeCredential51(cred), name: `Passkey · ${name}` });
}

function bind(host) {
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-s51-approve],[data-s51-deny],[data-s51-pkadd],[data-s51-pkdel],[data-s51-pkname],[data-s51-devdel],[data-s51-auditall],[data-s51-rot],[data-s51-rotcancel],[data-s51-unlock],[data-s51-scan],[data-s51-pol]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.s51Approve) return act(() => post(`/approvals/${encodeURIComponent(ds.s51Approve)}`, { approve: true }), 'Godkjent. Enheten kan fullføre innloggingen nå.');
    if (ds.s51Deny) return act(() => post(`/approvals/${encodeURIComponent(ds.s51Deny)}`, { approve: false }), 'Avvist.');
    if (t.hasAttribute('data-s51-pkadd')) return act(() => addPasskey(), (r) => (r ? 'Passkey lagt til ✓' : ''));
    if (ds.s51Pkdel) { if (!confirm('Fjerne passkeyen? Du kan fortsatt logge inn med passord.')) return; return act(() => json(`/passkeys/${encodeURIComponent(ds.s51Pkdel)}`, { method: 'DELETE' }), 'Passkey fjernet.'); }
    if (ds.s51Pkname) { const n = prompt('Nytt navn på passkeyen'); if (!n?.trim()) return; return act(() => post(`/passkeys/${encodeURIComponent(ds.s51Pkname)}`, { name: n.trim() }, 'PATCH'), 'Lagret.'); }
    if (ds.s51Devdel) return act(() => json(`/devices/${encodeURIComponent(ds.s51Devdel)}`, { method: 'DELETE' }), 'Enheten er fjernet.');
    if (t.hasAttribute('data-s51-auditall')) { S.auditAll = !S.auditAll; return load(); }
    if (ds.s51Rot) { S.rot = ds.s51Rot; S.msg = ''; rerender(); host.querySelector('[data-s51-rotform] input')?.focus(); return; }
    if (t.hasAttribute('data-s51-rotcancel')) { S.rot = null; rerender(); return; }
    if (ds.s51Unlock) return act(() => json(`/limits?key=${encodeURIComponent(ds.s51Unlock)}`, { method: 'DELETE' }), 'Låst opp.');
    if (t.hasAttribute('data-s51-scan')) return act(async () => { S.scan = await post('/logscan', {}); return S.scan; }, (r) => (r.findings?.length ? `!Fant ${r.findings.length} mulige nøkler i loggene.` : 'Ingen nøkler funnet ✓'));
    if (ds.s51Pol) return act(() => json('/policy', { method: 'PUT', body: JSON.stringify({ [ds.s51Pol]: !(S.d?.policy?.[ds.s51Pol]) }) }), 'Lagret.');
  });
  host.addEventListener('submit', (e) => {
    const f = e.target.closest('form');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.s51Pwform === 'passkey') { const pw = f.elements.pw.value; return act(() => addPasskey(pw), (r) => (r ? 'Passkey lagt til ✓' : '')); }
    if (f.dataset.s51Rotform) {
      const id = f.dataset.s51Rotform, value = f.elements.value.value.trim(), pw = f.elements.pw.value;
      if (!value || !pw) { S.msg = '!Skriv inn ny nøkkel og passordet ditt.'; rerender(); return; }
      return act(async () => { const r = await post('/secrets/rotate', { id, value, password: pw }); S.rot = null; return r; }, 'Nøkkelen er rotert ✓ Husk å slette den gamle hos tjenesten.');
    }
  });
}

/** Innstillinger → Sikkerhet. */
export function sikkerhetView51(H) {
  const { group, row: srow } = H;
  return {
    html: '<div class="s51-host" data-mount-host></div>',
    mount: (slot) => {
      S.host = slot;
      if (!slot.dataset.s51) { slot.dataset.s51 = '1'; bind(slot); slot.innerHTML = html(); load(); } else rerender();
    },
    search: [group('Sikkerhet', [
      srow({ t: 'Passkeys', s: 'Logg inn med Face ID, Touch ID eller Windows Hello', go: 'sikkerhet', btn: 'Åpne', k: 'passkey webauthn face id touch id windows hello sikkerhetsnøkkel innlogging' }),
      srow({ t: 'Nye enheter og godkjenning', s: 'Godkjenn innlogging fra en ny enhet', go: 'sikkerhet', btn: 'Åpne', k: 'enhet godkjenn ny enhet innlogging land' }),
      srow({ t: 'Innloggingslogg', s: 'Tid, IP, land og enhet', go: 'sikkerhet', btn: 'Åpne', k: 'revisjonslogg logg innlogging ip land audit' }),
      srow({ t: 'Nøkler og hemmeligheter', s: 'Alder, påminnelse og rotering', go: 'sikkerhet', btn: 'Åpne', k: 'nøkkel api-nøkkel hemmelighet roter rotering secret' }),
      srow({ t: 'Sperrer', s: 'Midlertidig sperre etter feil passord, QR og app-token', go: 'sikkerhet', btn: 'Åpne', k: 'sperre rate limit blokkert lås opp' }),
    ])],
  };
}
