// Innstillinger → Innlogging: pålitelig enhet, brukere (admin), tofaktor og bytt passord.
import { esc, api } from './util.js';
import { store } from './store.js';
import { uploadAvatar, removeAvatar, applyProfile, initial } from './profile.js';

let data = null;          // { devices, users, me }
let tfa = null;           // ventende 2FA-oppsett: { otpauthUrl, secret, qrSvg, err }
let recovery = null;      // gjenopprettingskoder vises én gang etter aktivering
let off = null;           // skjema for å slå av 2FA: { err }
let addMsg = null;        // { text, ok }
let nameEd = null;        // { id, value?, err?, ok? } – status for «Lagre navn»
let avMsg = null;         // feilmelding ved opplasting av profilbilde
let srvMsg = null;
let rerender = () => {};

// Stilene ligger her så modulen er selvstendig (CSP tillater inline-stiler).
if (!document.getElementById('settings-login-css')) {
  const st = document.createElement('style');
  st.id = 'settings-login-css';
  st.textContent = `
.set-sep{height:1px;background:var(--line);margin:6px 0 2px}
.user-row{display:flex;align-items:center;gap:12px;background:var(--row);border:1px solid var(--line);border-radius:16px;padding:12px 14px;flex-wrap:wrap}
.user-ini{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#2a3346;display:grid;place-items:center;font-weight:600;font-size:13px}
.muted2{color:var(--text-2)}
.pill-btn{padding:8px 12px;border-radius:999px;border:1px solid #3a4560;background:transparent;color:var(--text);font-size:13px;cursor:pointer}
.pill-btn.primary{border:0;background:var(--blue);color:#07080b;font-weight:600;padding:10px 16px}
.pill-btn.danger{border-color:#4a2c2c;color:var(--red)}
.pill-field{flex:1 1 140px;min-width:0;padding:10px 14px;background:var(--field);border:1px solid var(--line);border-radius:999px;color:var(--text);font-size:14px;outline:none}
.pill-field:focus{border-color:var(--blue)}
.pill-field.sm{flex:0 0 auto;padding:7px 12px;font-size:13px}
.pill-field.code{font-size:16px;letter-spacing:4px}
.tfa-box{display:flex;flex-direction:column;gap:12px;background:#121722;border:1px solid #3a4560;border-radius:16px;padding:16px}
.tfa-qr{flex:0 0 auto;width:132px;height:132px;border-radius:12px;background:#eef0f4;padding:4px;display:grid;place-items:center}
.tfa-qr svg{width:124px;height:124px;display:block}
.tfa-codes{columns:2;font-size:14px;line-height:1.8;background:var(--field);border-radius:12px;padding:10px 14px;user-select:all}
.user-add{display:flex;flex-direction:column;gap:10px;background:var(--row);border:1px dashed #3a4560;border-radius:16px;padding:14px}
.user-add-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px}`;
  document.head.append(st);
}

const when = (t) => new Date(t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const roleTxt = (r) => (r === 'admin' ? 'Admin' : 'Bruker');
const ini = (u) => (u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : esc((u.name || u.username).slice(0, 2).toUpperCase()));

/** Data for Konto- og Brukere-sidene i settings.js: { devices, users, me } eller null før første lasting. */
export const loginData = () => data;
export const roleName = roleTxt;

export async function loadLogin(onChange) {
  if (onChange) rerender = onChange;
  const [devices, users] = await Promise.all([
    api('/devices').catch(() => ({ lan: false, trusted: false, devices: [] })),
    api('/users').catch(() => ({ me: null, users: [] })),
  ]);
  data = { devices, users: users.users, me: users.me };
  rerender();
}

function tfaBox() {
  if (recovery) return `<div class="tfa-box"><b>2FA er på ✓</b>
    <div class="muted" style="font-size:13px">Gjenopprettingskoder – lagre dem et trygt sted. Hver kode kan brukes én gang hvis du mister telefonen. De vises ikke igjen.</div>
    <div class="tfa-codes mono">${recovery.map(esc).join('<br>')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pill-btn" data-tfa-copy>Kopier</button><button class="pill-btn primary" data-tfa-done>Ferdig</button></div></div>`;
  if (!tfa) return '';
  return `<form class="tfa-box" data-tfa-verify><b>Slå på 2FA for ${esc(data.me.username)}</b>
    <div class="muted" style="font-size:13px">1. Skann koden i Google Authenticator, Aegis, 1Password e.l.</div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div class="tfa-qr">${tfa.qrSvg}</div>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span class="muted" style="font-size:12px">Eller skriv inn nøkkelen manuelt</span>
        <span class="mono" style="font-size:14px;letter-spacing:1px;word-break:break-all">${esc(tfa.secret)}</span></div>
    </div>
    <div class="muted" style="font-size:13px">2. Skriv inn koden appen viser for å bekrefte</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input class="pill-field mono code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000000" required>
      <button class="pill-btn primary" type="submit">Bekreft</button><button class="pill-btn" type="button" data-tfa-cancel>Avbryt</button>
    </div>
    ${tfa.err ? `<div class="red" style="font-size:13px">${esc(tfa.err)}</div>` : ''}</form>`;
}

function offBox() {
  if (!off) return '';
  return `<form class="tfa-box" data-tfa-off><b>Slå av 2FA for ${esc(data.me.username)}</b>
    <div class="muted" style="font-size:13px">Bekreft med passordet ditt eller en kode fra appen.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input class="pill-field" type="password" name="secret" placeholder="Passord eller kode" autocomplete="current-password" required>
      <button class="pill-btn danger" type="submit">Slå av</button><button class="pill-btn" type="button" data-tfa-cancel>Avbryt</button>
    </div>
    ${off.err ? `<div class="red" style="font-size:13px">${esc(off.err)}</div>` : ''}</form>`;
}

const isMain = (u) => u.isMainAdmin || u.id === 'owner';
const avatar = (u, cls = 'sg-ic') => `<span class="${cls}" style="background:${u.avatarUrl ? '#1d2738' : '#3b6fd6'}">${ini(u)}</span>`;
const userLine = (u) => `@${u.username} · ${roleTxt(u.role)}${isMain(u) ? ' · hovedadmin' : ''}`;

// Rader i samme stil som resten av innstillingene (se row() i settings.js).
const navRow = (go, icon, t, s, v = '', vc = '') => `<button type="button" class="sg-row" data-go="${esc(go)}">${icon}<span class="sg-txt"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</span>${v ? `<span class="sg-v"${vc ? ` style="color:${vc}"` : ''}>${esc(v)}</span>` : ''}<span class="sg-chev" aria-hidden="true">›</span></button>`;
const icn = (color, d) => `<span class="sg-ic" style="background:${color}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></span>`;
const box = (t, inner, note = '') => `<section class="sg">${t ? `<div class="sg-t">${esc(t)}</div>` : ''}<div class="sg-box">${inner}</div>${note ? `<div class="sg-note">${note}</div>` : ''}</section>`;
const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', KEY = 'M14 10a4 4 0 1 0-3.5 4L9 16v2H7v2H4v-3l5.5-5.5A4 4 0 0 1 14 10zM16 8h.01',
  DEV = 'M4 5h16v11H4zM8 20h8M12 16v4', PLUS = 'M12 5v14M5 12h14', SRV = 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01', LOCK = 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3';
const meUser = () => data.users.find((u) => u.id === data.me?.id) ?? data.me ?? {};

function listView() {
  const d = data.devices, me = data.me, admin = me?.role === 'admin', meU = meUser();
  return [
    box('Profil', navRow('me', avatar({ ...meU, avatarUrl: store.me.me?.avatarUrl ?? meU.avatarUrl }), meU.name || meU.username || '', userLine(meU))),
    box('Sikkerhet', `<button type="button" class="sg-row" data-trust role="switch" aria-checked="${d.trusted}">${icn('#2a9d8f', SHIELD)}<span class="sg-txt"><b>Pålitelig enhet</b><span>${d.trusted ? 'Slipper passord på lokalt nett' : 'Passord kreves alltid'}</span></span><span class="sg-sw"></span></button>
      ${navRow('devices', icn('#536079', DEV), 'Pålitelige enheter', d.lan ? 'Du er på lokalt nett nå' : 'Du er ikke på lokalt nett nå', String(d.devices.length))}
      ${navRow('tfa', icn('#7a5af0', LOCK), 'Tofaktor (2FA)', 'Kode fra autentiseringsappen ved innlogging', meU.totp ? 'På' : 'Av', meU.totp ? '#8fe0b0' : '')}
      ${navRow('pw', icn('#e0a325', KEY), 'Bytt passord', 'Gjelder nettsiden og mobilappene')}`,
    'Passordet hoppes bare over når enheten har en gyldig enhetscookie <b>og</b> kobler til fra lokalt nett (192.168.x.x, 10.x.x.x, 172.16–31.x.x). Fra internett kreves alltid passord, og kode hvis 2FA er på.'),
    box('Brukere', data.users.map((u) => navRow(`user:${u.id}`, avatar(u), u.name || u.username, userLine(u), u.totp ? '2FA på' : '2FA av', u.totp ? '#8fe0b0' : '#8a93a6')).join('')
      + (admin ? `<button type="button" class="sg-row" data-go="add">${icn('#1d2738', PLUS)}<span class="sg-txt"><b style="color:var(--blue)">Legg til bruker</b></span></button>` : ''),
    `${me ? `Innlogget som ${esc(me.name || me.username)} · ${roleTxt(me.role)}${me.isMainAdmin ? ' · hovedadmin' : ''}. ` : ''}${admin ? 'Admin kan legge til og fjerne brukere. Bruker ser dashbordet og styrer egen 2FA.' : 'Brukere legges til av administrator. Du styrer egen totrinnsbekreftelse.'}`),
    admin ? box('Server', navRow('server', icn('#3b6fd6', SRV), 'Navn på serveren', 'Vises i menyen og i mobilappen', store.me.serverName ?? '')) : '',
  ].join('');
}

function nameForm(u) {
  const ed = nameEd?.id === u.id ? nameEd : null;
  return `<form class="sg" data-name-form="${esc(u.id)}"><div class="sg-t">Navn</div><div class="sg-box">
      <label class="sg-field"><span>Visningsnavn</span><input name="name" value="${esc(ed?.value ?? u.name ?? '')}" placeholder="Navn" maxlength="60" required></label>
      <label class="sg-field"><span>Brukernavn</span><input name="username" class="mono" value="${esc(ed?.username ?? u.username ?? '')}" placeholder="brukernavn" maxlength="32" autocapitalize="none" autocomplete="off" spellcheck="false" required></label></div>
    <div class="sg-note" style="font-size:12.5px;padding:0 4px">Brukernavnet brukes når du logger inn. Bokstaver, tall, punktum, bindestrek eller understrek.</div>
    <div class="sg-acts"><button class="sg-btn pri" type="submit">Lagre</button>${ed?.err ? `<span class="red" style="font-size:13px">${esc(ed.err)}</span>` : ed?.ok ? '<span class="green" style="font-size:13px">Lagret ✓</span>' : ''}</div></form>`;
}

function meView() {
  const me = store.me.me ?? data.me;
  return `<div class="me-head"><span class="av-big">${me?.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : initial(me?.name)}</span>
      <div class="sg-acts" style="justify-content:center"><label class="sg-btn pri" style="cursor:pointer">${me?.avatarUrl ? 'Bytt bilde' : 'Last opp bilde'}<input type="file" accept="image/*" data-avatar hidden></label>${me?.avatarUrl ? '<button class="sg-btn" data-avatar-del>Fjern</button>' : ''}</div>
      ${avMsg ? `<span class="red" style="font-size:13px">${esc(avMsg)}</span>` : '<span class="muted" style="font-size:12.5px">Vises i topplinjen og i mobilappen. Beskjæres til et kvadrat.</span>'}</div>
    ${nameForm(meUser())}`;
}

function tfaView() {
  const u = meUser();
  if (recovery || tfa || off) return tfaBox() + offBox();
  return box('Tofaktor', `<div class="sg-row"><span class="sg-txt"><b>2FA er ${u.totp ? 'på' : 'av'}</b><span>${u.totp ? 'Kode fra appen kreves ved innlogging fra internett' : 'Bare passord ved innlogging'}</span></span>
      <button class="sg-pill${u.totp ? ' danger' : ''}" data-tfa="${u.totp ? 'off' : 'on'}">${u.totp ? 'Slå av' : 'Slå på'}</button></div>`,
  'Bruk Google Authenticator, Aegis, 1Password eller en annen app som støtter TOTP. Du får 10 gjenopprettingskoder når 2FA slås på.');
}

function devicesView() {
  const d = data.devices;
  return box('Pålitelige enheter', d.devices.map((x) => `<div class="sg-row">${icn(x.current ? '#3b6fd6' : '#2a3346', DEV)}<span class="sg-txt"><b>${esc(x.name)}${x.current ? ' · denne' : ''}</b><span class="mono">Sist brukt ${when(x.lastSeen)}${x.lastIp ? ` · ${esc(x.lastIp)}` : ''}</span></span>
      <button class="sg-pill danger" data-dev-del="${x.id}">Fjern</button></div>`).join('') || '<div class="sg-row"><span class="sg-txt"><span>Ingen pålitelige enheter.</span></span></div>',
  d.lan ? '<span class="green">Du er på lokalt nett nå.</span> «Lås» i menyen pauser enheten til neste innlogging med passord.' : 'Du er ikke på lokalt nett nå, så denne enheten må alltid skrive passord.');
}

function userView(id) {
  const u = data.users.find((x) => x.id === id);
  if (!u) return null;
  const me = data.me, admin = me?.role === 'admin', self = u.id === me?.id, main = isMain(u);
  const admins = data.users.filter((x) => x.role === 'admin').length;
  const canDel = admin && !self && !(u.role === 'admin' && admins < 2) && !main;
  const roleRow = admin && !self && !main
    ? `<label class="sg-field"><span>Rolle</span><select data-role="${esc(u.id)}" aria-label="Rolle for ${esc(u.username)}">${['bruker', 'admin'].map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${roleTxt(r)}</option>`).join('')}</select></label>`
    : `<div class="sg-field"><span>Rolle</span><span style="flex:1;text-align:right">${roleTxt(u.role)}${main ? ' · hovedadmin' : ''}</span></div>`;
  const tfaRow = `<div class="sg-field"><span>Tofaktor</span><span style="flex:1;text-align:right;color:${u.totp ? '#8fe0b0' : 'var(--muted)'}">${u.totp ? 'På' : 'Av'}</span>${self ? '<button type="button" class="sg-link" data-go="tfa">Endre</button>' : admin && u.totp ? `<button type="button" class="sg-link" data-tfa-reset="${esc(u.id)}">Nullstill</button>` : ''}</div>`;
  return `<div class="me-head"><span class="av-big">${ini(u)}</span><b style="font-size:20px">${esc(u.name || u.username)}</b><span class="muted">${esc(userLine(u))}</span></div>
    ${admin || self ? nameForm(u) : ''}
    ${box('Tilgang', roleRow + tfaRow, main ? 'Hovedadministratoren kan ikke fjernes eller gjøres om til vanlig bruker.' : '')}
    ${canDel ? `<div class="sg-acts"><button class="sg-btn danger" data-user-del="${esc(u.id)}" data-name="${esc(u.username)}">Fjern ${esc(u.username)}</button></div>` : ''}`;
}

function addView() {
  return `<form class="sg" data-user-add><div class="sg-t">Ny bruker</div><div class="sg-box">
      <label class="sg-field"><span>Brukernavn</span><input name="username" placeholder="f.eks. ingrid" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
      <label class="sg-field"><span>Passord</span><input name="password" type="password" placeholder="Minst 8 tegn" autocomplete="new-password" minlength="8" required></label>
      <label class="sg-field"><span>Rolle</span><select name="role"><option value="bruker">Bruker</option><option value="admin">Admin</option></select></label></div>
    <div class="sg-note">Brukeren kan endre passordet sitt og slå på 2FA etter første innlogging.</div>
    <div class="sg-acts"><button class="sg-btn pri" type="submit">Legg til bruker</button>${addMsg ? `<span class="${addMsg.ok ? 'green' : 'red'}" style="font-size:13px">${esc(addMsg.text)}</span>` : ''}</div></form>`;
}

function serverView() {
  return `<form class="sg" data-server-form><div class="sg-t">Server</div><div class="sg-box">
      <label class="sg-field"><span>Navn på serveren</span><input name="name" value="${esc(store.me.serverName ?? '')}" maxlength="40" required></label></div>
    <div class="sg-acts"><button class="sg-btn pri" type="submit">Lagre</button>${srvMsg ? `<span class="${srvMsg.ok ? 'green' : 'red'}" style="font-size:13px">${esc(srvMsg.text)}</span>` : ''}</div></form>`;
}

function pwView() {
  return `<form data-pw class="sg"><div class="sg-t">Bytt passord</div><div class="sg-box">
      <label class="sg-field"><span>Nåværende</span><input type="password" name="current" autocomplete="current-password"></label>
      <label class="sg-field"><span>Nytt passord</span><input type="password" name="next" placeholder="Minst 8 tegn" autocomplete="new-password" minlength="8" required></label>
      <label class="sg-field"><span>Gjenta</span><input type="password" name="again" autocomplete="new-password" required></label></div>
    <div class="sg-note">Gjelder både nettsiden og mobilappene. Andre innlogginger for ${esc(data.me?.username ?? 'deg')} logges ut.</div>
    <div class="sg-acts"><button class="sg-btn pri" type="submit">Lagre passord</button><span class="muted" data-pw-msg style="font-size:13px"></span></div></form>`;
}

let goTo = () => {};
/** Innlogging-fanen: liste eller underside. Svarer { title, sub, html } som de andre fanene. */
export function loginView(sub, go) {
  if (go) goTo = go;
  if (!data) return { html: '<div class="skeleton" style="min-height:200px;border-radius:20px"></div>' };
  if (sub === 'me') return { title: 'Profil', sub: 'Navn og profilbilde.', html: meView() };
  if (sub === 'tfa') return { title: 'Totrinnsbekreftelse', sub: 'Krev en kode fra autentiseringsappen når du logger inn.', html: tfaView() };
  if (sub === 'pw') return { title: 'Bytt passord', sub: 'Gjelder nettsiden og mobilappene.', html: pwView() };
  if (sub === 'devices') return { title: 'Pålitelige enheter', sub: 'Enheter som slipper passord på lokalt nett.', html: devicesView() };
  if (sub === 'add' && data.me?.role === 'admin') return { title: 'Legg til bruker', sub: 'Brukernavn, passord og rolle.', html: addView() };
  if (sub === 'server' && data.me?.role === 'admin') return { title: 'Server', sub: 'Navnet vises i menyen og i mobilappen.', html: serverView() };
  if (sub?.startsWith('user:')) { const u = data.users.find((x) => x.id === sub.slice(5)), h = userView(sub.slice(5)); if (h) return { title: u?.name || u?.username || 'Bruker', sub: 'Brukere', html: h }; }
  return { html: listView() };
}

/** Klikk i Innlogging-fanen. Returnerer true hvis klikket ble håndtert. */
export async function loginClick(e) {
  const t = e.target;
  if (t.closest('[data-trust]')) {
    const d = data?.devices, cur = d?.devices.find((x) => x.current);
    if (d?.trusted && cur) await api(`/devices/${cur.id}`, { method: 'DELETE' });
    else await api('/devices/current', { method: 'POST' });
    await loadLogin(); return true;
  }
  const dd = t.closest('[data-dev-del]');
  if (dd) {
    if (confirm('Fjerne enheten? Den må da logge inn med passord igjen.')) { await api(`/devices/${dd.dataset.devDel}`, { method: 'DELETE' }); await loadLogin(); }
    return true;
  }
  if (t.closest('[data-avatar-del]')) {
    try { await removeAvatar(); avMsg = null; } catch (err) { avMsg = err.message; }
    await loadLogin(); return true;
  }
  const tb = t.closest('[data-tfa]');
  if (tb) {
    recovery = null;
    if (tb.dataset.tfa === 'off') { tfa = null; off = {}; rerender(); return true; }
    off = null;
    try { tfa = await api('/auth/totp/setup', { method: 'POST' }); } catch (err) { alert(err.message); }
    rerender(); setTimeout(() => document.querySelector('[data-tfa-verify] [name=code]')?.focus(), 0);
    return true;
  }
  if (t.closest('[data-tfa-cancel]')) { tfa = null; off = null; rerender(); return true; }
  if (t.closest('[data-tfa-done]')) { recovery = null; rerender(); return true; }
  if (t.closest('[data-tfa-copy]')) { navigator.clipboard?.writeText(recovery.join('\n')); t.closest('[data-tfa-copy]').textContent = 'Kopiert ✓'; return true; }
  const rs = t.closest('[data-tfa-reset]');
  if (rs) {
    if (confirm('Nullstille 2FA for brukeren? De kan da logge inn med bare passord til de slår det på igjen.')) {
      try { await api(`/users/${rs.dataset.tfaReset}`, { method: 'PATCH', json: { resetTotp: true } }); } catch (err) { alert(err.message); }
      await loadLogin();
    }
    return true;
  }
  const del = t.closest('[data-user-del]');
  if (del) {
    if (confirm(`Fjerne brukeren ${del.dataset.name}? Innlogginger, enheter og innstillinger for brukeren slettes.`)) {
      try { await api(`/users/${del.dataset.userDel}`, { method: 'DELETE' }); goTo(''); } catch (err) { alert(err.message); }
      await loadLogin();
    }
    return true;
  }
  return false;
}

export async function loginChange(e) {
  if (e.target.matches('[data-avatar]')) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return true;
    try { await uploadAvatar(f); avMsg = null; } catch (err) { avMsg = err.message || 'Kunne ikke laste opp bildet'; }
    await loadLogin(); return true;
  }
  const sel = e.target.closest('[data-role]');
  if (!sel) return false;
  try { await api(`/users/${sel.dataset.role}`, { method: 'PATCH', json: { role: sel.value } }); } catch (err) { alert(err.message); }
  await loadLogin();
  return true;
}

/** Skjemaer i Innlogging-fanen. Returnerer true hvis innsendingen ble håndtert. */
export async function loginSubmit(e) {
  const f = e.target;
  if (f.matches('[data-pw]')) {
    e.preventDefault();
    const msg = f.querySelector('[data-pw-msg]'), v = Object.fromEntries(new FormData(f));
    if (v.next !== v.again) { msg.textContent = 'Passordene er ikke like'; return true; }
    try { await api('/password', { method: 'PUT', json: { current: v.current, next: v.next } }); f.reset(); msg.textContent = 'Passordet er endret ✓'; }
    catch (err) { msg.textContent = err.message || 'Kunne ikke endre passordet'; }
    return true;
  }
  if (f.matches('[data-name-form]')) {
    e.preventDefault();
    const id = f.dataset.nameForm, name = f.name.value.trim(), username = f.username?.value.trim().toLowerCase().replace(/^@/, '');
    if (!name) { nameEd = { id, value: '', username, err: 'Skriv inn et navn' }; rerender(); return true; }
    try {
      const u = await api(`/users/${id}`, { method: 'PATCH', json: { displayName: name, ...(username ? { username } : {}) } });
      if (id === data.me?.id && u.username) store.me.me = { ...store.me.me, username: u.username };
      nameEd = { id, ok: true };
      // Eget navn slår inn med en gang i hilsen og meny.
      if (id === data.me?.id) { store.me.me = { ...store.me.me, name: u.name, displayName: u.name }; store.me.user = u.name; applyProfile(); document.dispatchEvent(new CustomEvent('hl:name')); }
      await loadLogin();
    } catch (err) { nameEd = { id, value: name, username, err: err.message }; rerender(); }
    return true;
  }
  if (f.matches('[data-server-form]')) {
    e.preventDefault();
    try { store.me.serverName = (await api('/server', { method: 'PUT', json: { name: f.name.value } })).serverName; srvMsg = { text: 'Lagret ✓', ok: true }; applyProfile(); }
    catch (err) { srvMsg = { text: err.message, ok: false }; }
    rerender(); return true;
  }
  if (f.matches('[data-tfa-verify]')) {
    e.preventDefault();
    try {
      const r = await api('/auth/totp/verify', { method: 'POST', json: { code: f.code.value.trim() } });
      tfa = null; recovery = r.recoveryCodes; await loadLogin();
    } catch (err) { tfa.err = err.message; rerender(); }
    return true;
  }
  if (f.matches('[data-tfa-off]')) {
    e.preventDefault();
    const s = f.secret.value.trim();
    try {
      await api('/auth/totp/disable', { method: 'POST', json: /^\d{6}$/.test(s) ? { code: s } : { password: s } });
      off = null; await loadLogin();
    } catch (err) { off.err = err.message; rerender(); }
    return true;
  }
  if (f.matches('[data-user-add]')) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    try {
      const u = await api('/users', { method: 'POST', json: v });
      addMsg = { text: `${u.username} er lagt til som ${roleTxt(u.role).toLowerCase()}`, ok: true };
      await loadLogin();
    } catch (err) {
      addMsg = { text: err.message, ok: false }; rerender();
      const nf = document.querySelector('[data-user-add]');
      if (nf) { nf.username.value = v.username; nf.role.value = v.role; nf.password.focus(); }
    }
    return true;
  }
  return false;
}
