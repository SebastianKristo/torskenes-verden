// Innstillinger → Innlogging: pålitelig enhet, brukere (admin), tofaktor og bytt passord.
import { esc, api } from './util.js';
import { store } from './store.js';
import { uploadAvatar, removeAvatar, applyProfile, initial } from './profile.js';

let data = null;          // { devices, users, me }
let tfa = null;           // ventende 2FA-oppsett: { otpauthUrl, secret, qrSvg, err }
let recovery = null;      // gjenopprettingskoder vises én gang etter aktivering
let off = null;           // skjema for å slå av 2FA: { err }
let addMsg = null;        // { text, ok }
let nameEd = null;        // { id, value, err } – «Endre navn» åpent for én bruker
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

function userRow(u) {
  const me = data.me, admin = me?.role === 'admin', self = u.id === me?.id;
  const admins = data.users.filter((x) => x.role === 'admin').length;
  const main = u.isMainAdmin || u.id === 'owner';
  const canDel = admin && !self && !(u.role === 'admin' && admins < 2) && !main;
  let tfaBtn = '';
  if (self) tfaBtn = `<button class="pill-btn" data-tfa="${u.totp ? 'off' : 'on'}">${u.totp ? 'Slå av 2FA' : 'Slå på 2FA'}</button>`;
  else if (admin && u.totp) tfaBtn = `<button class="pill-btn" data-tfa-reset="${esc(u.id)}" title="Nullstill 2FA hvis brukeren har mistet telefonen">Nullstill 2FA</button>`;
  const roleSel = admin && !self && !main
    ? `<select class="pill-field sm" data-role="${esc(u.id)}" aria-label="Rolle for ${esc(u.username)}">${['bruker', 'admin'].map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${roleTxt(r)}</option>`).join('')}</select>` : '';
  const canName = admin || self, editing = nameEd?.id === u.id;
  const row = `<div class="user-row"><div class="user-ini">${ini(u)}</div>
    <div style="flex:1 1 120px;min-width:0"><div style="font-weight:600;font-size:14px">${esc(u.name || u.username)} <span class="muted2" style="font-weight:400">· @${esc(u.username)}</span>${self ? ' <span class="badge" style="background:var(--blue)">deg</span>' : ''}</div>
      <div class="muted2" style="font-size:12px">${roleTxt(u.role)}${main ? ' · hovedadmin' : ''} · 2FA ${u.totp ? 'på' : 'av'}</div></div>
    ${canName && !editing ? `<button class="pill-btn" data-name-edit="${esc(u.id)}">Endre navn</button>` : ''}${roleSel}${tfaBtn}${canDel ? `<button class="pill-btn danger" data-user-del="${esc(u.id)}" data-name="${esc(u.username)}">Fjern</button>` : ''}</div>`;
  if (!editing) return row;
  return row + `<form class="name-form" data-name-form="${esc(u.id)}"><input class="pill-field" name="name" value="${esc(nameEd.value)}" placeholder="Navn" maxlength="60" required aria-label="Nytt navn for ${esc(u.username)}">
    <button class="pill-btn primary" type="submit">Lagre</button><button class="pill-btn" type="button" data-name-cancel>Avbryt</button>
    ${nameEd.err ? `<div class="red" style="font-size:13px;flex-basis:100%">${esc(nameEd.err)}</div>` : ''}</form>`;
}

function avatarBox() {
  const me = store.me.me ?? data.me;
  return `<div class="av-box"><span class="av-big">${me?.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : initial(me?.name)}</span>
    <span style="flex:1;min-width:160px"><b style="display:block;font-weight:600;font-size:15px">Profilbilde</b><span class="muted" style="font-size:12.5px">Vises i topplinjen og i FinansHub-appen. JPG, PNG eller HEIC – beskjæres til et kvadrat.</span>
      ${avMsg ? `<span class="red" style="display:block;font-size:12.5px">${esc(avMsg)}</span>` : ''}</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap"><label class="pill-btn primary" style="cursor:pointer">${me?.avatarUrl ? 'Bytt' : 'Last opp'}<input type="file" accept="image/*" data-avatar hidden></label>
      ${me?.avatarUrl ? '<button class="pill-btn" data-avatar-del>Fjern</button>' : ''}</span></div>`;
}

function serverBox() {
  if (data.me?.role !== 'admin') return '';
  return `<form class="name-form" data-server-form style="margin:0;align-items:center"><span style="font-size:14px;flex:0 0 auto">Navn på serveren</span>
    <input class="pill-field" name="name" value="${esc(store.me.serverName ?? '')}" maxlength="40" required aria-label="Navn på serveren">
    <button class="pill-btn" type="submit">Lagre</button>${srvMsg ? `<span class="${srvMsg.ok ? 'green' : 'red'}" style="font-size:13px">${esc(srvMsg.text)}</span>` : ''}</form>`;
}

export function loginTab() {
  if (!data) return '<div class="skeleton" style="min-height:120px"></div>';
  const d = data.devices, me = data.me, admin = me?.role === 'admin';
  return `<button class="toggle" data-trust role="switch" aria-checked="${d.trusted}"><i></i><span><b style="font-weight:600">Pålitelig enhet</b><br>
      <span class="sub">${d.trusted ? 'Denne enheten slipper passord når den er på lokalt nett' : 'Denne enheten må alltid skrive passord'}</span></span></button>
    <div class="muted" style="font-size:13px;line-height:1.5">Passordet hoppes bare over når enheten har en gyldig enhetscookie <b>og</b> kobler til fra lokalt nett (192.168.x.x, 10.x.x.x, 172.16–31.x.x).
      Fra internett, også via Cloudflare Tunnel, kreves alltid passord – og kode hvis 2FA er på. «Lås» i menyen pauser enheten til neste innlogging med passord.
      ${d.lan ? '<br><span class="green">Du er på lokalt nett nå.</span>' : '<br>Du er ikke på lokalt nett nå.'}</div>
    <div class="set-label">Pålitelige enheter</div>
    ${d.devices.map((x) => `<div class="row"><div><div>${esc(x.name)}${x.current ? ' <span class="badge" style="background:var(--blue)">denne</span>' : ''}</div>
      <div class="mono muted" style="font-size:12px">Sist brukt ${when(x.lastSeen)}${x.lastIp ? ` · ${esc(x.lastIp)}` : ''}</div></div>
      <button class="btn" data-dev-del="${x.id}" style="color:var(--red)">Fjern</button></div>`).join('') || '<div class="empty">Ingen pålitelige enheter.</div>'}

    <div class="set-sep"></div>
    ${avatarBox()}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><b style="font-weight:600;font-size:15px">Brukere</b>
      ${me ? `<span class="muted" style="font-size:12px">Innlogget som ${esc(me.name || me.username)} · ${roleTxt(me.role)}${me.isMainAdmin ? ' · hovedadmin' : ''}</span>` : ''}</div>
    ${data.users.map(userRow).join('')}
    ${tfaBox()}${offBox()}${serverBox()}
    ${admin ? `<form class="user-add" data-user-add><b style="font-weight:600;font-size:14px">Legg til bruker</b>
      <div class="user-add-grid">
        <input class="pill-field" name="username" placeholder="Brukernavn" autocomplete="off" autocapitalize="off" spellcheck="false" required>
        <input class="pill-field" name="password" type="password" placeholder="Passord" autocomplete="new-password" minlength="8" required>
        <select class="pill-field" name="role"><option value="bruker">Bruker</option><option value="admin">Admin</option></select>
      </div>
      <button class="pill-btn primary" type="submit" style="align-self:flex-start">Legg til</button>
      ${addMsg ? `<div style="font-size:13px" class="${addMsg.ok ? 'green' : 'red'}">${esc(addMsg.text)}</div>` : ''}
      <div class="muted" style="font-size:12px">Admin kan legge til og fjerne brukere. Bruker ser dashbordet og kan styre egen 2FA.</div></form>`
    : '<div class="muted" style="font-size:12px">Bare administratorer kan legge til brukere.</div>'}

    <div class="set-sep"></div>
    <div class="set-label">Bytt passord</div>
    <form data-pw class="settings-section" style="max-width:420px">
      <input class="field" type="password" name="current" placeholder="Nåværende passord" autocomplete="current-password">
      <input class="field" type="password" name="next" placeholder="Nytt passord (minst 8 tegn)" autocomplete="new-password" minlength="8" required>
      <input class="field" type="password" name="again" placeholder="Gjenta nytt passord" autocomplete="new-password" required>
      <div style="display:flex;gap:12px;align-items:center"><button class="btn" type="submit" style="color:var(--blue)">Lagre passord</button><span class="muted" data-pw-msg style="font-size:13px"></span></div>
      <div class="muted" style="font-size:12px">Gjelder både nettsiden og mobilappene. Andre innlogginger for ${esc(me?.username ?? 'deg')} logges ut.</div>
    </form>`;
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
  const ne = t.closest('[data-name-edit]');
  if (ne) {
    const u = data.users.find((x) => x.id === ne.dataset.nameEdit);
    nameEd = { id: u.id, value: u.name || '' }; rerender();
    setTimeout(() => { const i = document.querySelector('[data-name-form] [name=name]'); i?.focus(); i?.select(); }, 0);
    return true;
  }
  if (t.closest('[data-name-cancel]')) { nameEd = null; rerender(); return true; }
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
      try { await api(`/users/${del.dataset.userDel}`, { method: 'DELETE' }); } catch (err) { alert(err.message); }
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
    const id = f.dataset.nameForm, name = f.name.value.trim();
    if (!name) { nameEd = { ...nameEd, err: 'Skriv inn et navn' }; rerender(); return true; }
    try {
      const u = await api(`/users/${id}`, { method: 'PATCH', json: { displayName: name } });
      nameEd = null;
      // Eget navn slår inn med en gang i hilsen og meny.
      if (id === data.me?.id) { store.me.me = { ...store.me.me, name: u.name, displayName: u.name }; store.me.user = u.name; applyProfile(); document.dispatchEvent(new CustomEvent('hl:name')); }
      await loadLogin();
    } catch (err) { nameEd = { ...nameEd, value: name, err: err.message }; rerender(); }
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
