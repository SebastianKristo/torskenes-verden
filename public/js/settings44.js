// Prompt 44 (WEB44): nye ting i Innstillinger på web.
// - Utseende → LYS OG MØRK (Lys standard / Mørk / Følg systemet) rett under TEMA.            claude-code-web-lys-mork-modus.md
// - Server → Logger (Docker-logger, feil og feilsøking), bare admin.                         claude-code-innst-logger-docker.md
// - Gjøremål (Synk med Home Assistant), samme kort som i Gjøremål (tasks-ha.js).             claude-code-gjoremal-synk-i-innstillinger.md
// - System → TIDLIGERE VERSJONER under «Krev passord …», med Installer → dialog.             claude-code-rull-tilbake-versjon.md
// - Brukere → SERVER · EIER (Overfør eierskap) og FAMILIE · LOGG INN SOM (web).              claude-code-overfor-servereier.md, claude-code-rediger-andres-oppsett.md
// Alle kall tåler 404 (eldre server): da står det hva som mangler, i stedet for feil.
import { esc, initials } from './util.js';
import { store } from './store.js';
import { MODE_CARDS, webMode, setMode } from './mode44.js';
import { mountLogger } from './logger44.js';
import { mountHa } from './tasks-ha.js';
import { U, watch, loadUpdate } from './sysupdate.js';
import { startAs, asState } from './as44.js';

const admin = () => store.me?.me?.role === 'admin';
const meId = () => store.me?.me?.id;
let rr = () => {};
async function j(path, opt = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opt, headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } });
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Serveren svarte ${r.status}`), { status: r.status, data: d });
  return d;
}
const SVG = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export const P44 = { logger: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5', huske: 'M5 6h2M5 12h2M5 18h2M10 6h9M10 12h9M10 18h9' };
/** Fanene (settes inn i TABS i settings.js): [id, navn, undertekst, seksjon, ikon, bare admin]. */
export const TABS44 = [
  ['huske', 'Gjøremål', 'Synk med Home Assistant og listene dine.', 'Tilkoblinger', P44.huske],
  ['logger', 'Logger', 'Docker-logger, feil og feilsøking.', 'Server', P44.logger, true],
];

/* ---------------- Utseende → LYS OG MØRK ---------------- */
export function modeGroup44(h) {
  const cur = webMode();
  const prev = (k) => `<span class="md44-prev ${k}"><i></i><i></i><i></i></span>`;
  const html = `<div class="md44" role="radiogroup" aria-label="Lys og mørk">${MODE_CARDS.map(([k, n, s]) => `<button type="button" class="md44-opt" role="radio" aria-checked="${cur === k}" data-md44="${k}">${prev(k)}<b>${esc(n)}</b><span>${esc(s)}</span></button>`).join('')}</div>`;
  return { ...h.group('Lys og mørk', [{ html, q: 'lys mørk mørkt tema dark mode light mode system følg systemet web' }], 'Gjelder web-versjonen. Lagres på brukeren og i denne nettleseren.'), cls: 'sg-theme sg-md44' };
}

/* ---------------- Server → Logger ---------------- */
let lgHost = null;
export function loggerView44(h) {
  if (!admin()) return { groups: [h.group('Logger', [h.row({ t: 'Bare for administrator', s: 'Docker-loggene er serverinfrastruktur og vises bare for admin.' })])] };
  return { html: '<div class="lg44-host" data-mount-host></div>', mount: (el) => { if (!lgHost?.isConnected || lgHost.parentElement !== el) { if (!lgHost) { lgHost = document.createElement('div'); mountLogger(lgHost); } el.replaceChildren(lgHost); } },
    search: [h.group('Logger', [h.row({ t: 'Docker-logger', s: 'Containere, feil og feilsøking med Glimt', k: 'logg logger docker feil feilsøking container cloudflared', go: 'logger', btn: 'Åpne' })])] };
}

/* ---------------- Gjøremål (synk med Home Assistant) ---------------- */
let haHost = null;
export function huskeView44(h) {
  return { html: `<div class="tk tk-set hk44" data-mount-host></div>${h.note('Synken følger listene dine. Nye lister kobles når du velger en <span class="mono">todo.*</span>-liste for dem. Home Assistant har ikke underpunkter, så deloppgaver sendes som beskrivelse («☐ sovepose»).')}`,
    mount: (el) => { if (!haHost) { haHost = document.createElement('div'); mountHa(haHost); } if (haHost.parentElement !== el) el.replaceChildren(haHost); },
    search: [h.group('Gjøremål', [h.row({ t: 'Synk med Home Assistant', s: 'Lister, todo-entiteter og Synk nå', k: 'gjøremål huskeliste synk home assistant todo ha', go: 'huske', btn: 'Åpne' })])] };
}

/* ---------------- System → TIDLIGERE VERSJONER ---------------- */
const RB = { list: null, err: '', loading: false, at: 0, dlg: null, busy: false, msg: '' };
function loadVersions(force) {
  if (RB.loading || (!force && RB.list && Date.now() - RB.at < 60_000)) return;
  RB.loading = true;
  j('/api/update/versions').then((d) => { const L = Array.isArray(d) ? d : d?.versions ?? d?.items ?? []; RB.list = L.slice(0, 10).map((x) => ({ v: String(x.version ?? x.v ?? ''), date: x.date ?? x.at ?? '', notes: Array.isArray(x.notes) ? x.notes[0] ?? '' : x.notes ?? x.note ?? '', hasBackup: !!(x.hasBackup ?? x.backup), backupAt: x.backupAt ?? x.backup?.at ?? null, compatible: x.compatible !== false, current: !!x.current, previous: !!x.previous, changes: x.changesSince ?? x.lost ?? null })).filter((x) => x.v); RB.err = ''; })
    .catch((e) => { RB.list = []; RB.err = e.status === 404 ? 'missing' : e.message; })
    .finally(() => { RB.loading = false; RB.at = Date.now(); rr(); });
}
const dd = (t) => { const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t); return Number.isNaN(+d) ? String(t ?? '') : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).replace('.', ''); };
const hm = (t) => { const d = new Date(typeof t === 'number' && t < 1e12 ? t * 1000 : t); return Number.isNaN(+d) ? '' : d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }); };
/** Settes inn på System-siden under «Krev passord for å oppdatere» (settings-system.js). */
export function versionsHtml44(onChange) {
  if (onChange) rr = onChange;
  if (!admin()) return '';
  loadVersions();
  let body;
  if (!RB.list) body = '<span class="ny-note">Henter versjoner …</span>';
  else if (RB.err === 'missing') body = '<span class="ny-note">Serveren har ikke tilbakerulling ennå. Oppdater Nordlys først.</span>';
  else if (RB.err) body = `<span class="ny-note red">${esc(RB.err)}</span>`;
  else if (!RB.list.length) body = '<span class="ny-note">Updateren har ikke tatt vare på noen tidligere versjoner ennå.</span>';
  else body = `<div class="rb44-list">${RB.list.map((x) => {
    const tags = [x.previous ? '<span class="rb44-tag">Forrige</span>' : '', x.hasBackup ? '<span class="rb44-tag ok">Har backup</span>' : '', !x.compatible ? '<span class="rb44-tag warn">Ny database</span>' : ''].join('');
    return `<div class="rb44-r${x.current ? ' cur' : ''}"><b class="mono" data-no-i18n>${esc(x.v)}</b><div class="rb44-m"><div class="rb44-t"><span>${esc(dd(x.date))}</span>${tags}</div><span class="rb44-n" data-no-i18n>${esc(x.notes || '')}</span></div>${x.current ? '<span class="rb44-run">Kjører nå</span>' : `<button type="button" class="rb44-b" data-rb44="${esc(x.v)}" ${RB.busy || (U.d?.running) ? 'disabled' : ''}>Installer</button>`}</div>`;
  }).join('')}</div>`;
  return `<section class="rb44" id="rb44"><span class="rb44-cap">TIDLIGERE VERSJONER</span>${body}<span class="ny-note">Backup tas rett før hver oppdatering. Ved tilbakerulling velger du om dataene beholdes eller backupen gjenopprettes. «Krev passord for å oppdatere» gjelder også her.</span></section>`;
}
function rbDialog() {
  const d = RB.dlg; if (!d) return '';
  const x = d.x, pw = U.d?.settings?.require_password === true;
  const cur = RB.list?.find((v) => v.current)?.v ?? U.d?.installed?.version ?? '';
  const opt = (k, t, s, ok) => `<button type="button" class="rb44-o${d.opt === k ? ' on' : ''}" data-rb44-opt="${k}" ${ok ? '' : 'disabled aria-disabled="true"'} role="radio" aria-checked="${d.opt === k}"><span class="rb44-rad"><i></i></span><span><b>${esc(t)}</b><span class="${ok ? '' : 'warn'}">${esc(s)}</span></span></button>`;
  const bAt = x.backupAt ? `${dd(x.backupAt)} ${hm(x.backupAt)}` : dd(x.date);
  return `<div class="s44-scrim" data-s44-close></div><form class="s44-dlg rb44-dlg" role="dialog" aria-modal="true" aria-labelledby="rb44-t" data-rb44-form>
    <b id="rb44-t" class="s44-h">Gå tilbake til ${esc(x.v)}?</b>
    <div class="rb44-os" role="radiogroup">${opt('keep', 'Behold dataene mine', x.compatible ? 'Bare programmet byttes. Gjøremål, hendelser og innstillinger blir som nå.' : `${cur} endret databasen. Du må gjenopprette backupen.`, x.compatible)}
    ${opt('restore', `Gjenopprett backup fra ${bAt}`, x.hasBackup ? `Data tilbake til slik de var før oppdateringen. Endringer etter det forsvinner${x.changes ? `: ${x.changes}` : ''}.` : 'Ingen backup for denne versjonen.', x.hasBackup)}</div>
    <label class="rb44-ck"><input type="checkbox" name="pause" ${d.pause ? 'checked' : ''} data-rb44-pause><span>Slå av automatiske oppdateringer i 7 dager</span></label>
    ${pw ? '<label class="s44-f"><span>Passord</span><input type="password" name="rbpw" autocomplete="current-password" required placeholder="Ditt passord"></label>' : ''}
    ${d.err ? `<span class="s44-err" role="alert">${esc(d.err)}</span>` : ''}
    <div class="s44-btns"><button type="button" class="s44-b" data-s44-close>Avbryt</button><button type="submit" class="s44-b red" ${RB.busy || !(d.opt === 'keep' ? x.compatible : x.hasBackup) ? 'disabled' : ''}>${RB.busy ? 'Starter …' : `Installer ${esc(x.v)}`}</button></div>
    <span class="s44-fine">Krever passord når «Krev passord for å oppdatere» er på · bare admin og eier</span></form>`;
}
async function rollback(form) {
  const d = RB.dlg; if (!d) return;
  const pw = form.querySelector('[name="rbpw"]')?.value ?? '';
  RB.busy = true; d.err = ''; dlg();
  try {
    const r = await j('/api/update/rollback', { method: 'POST', body: JSON.stringify({ version: d.x.v, restoreBackup: d.opt === 'restore', pauseAutoDays: d.pause ? 7 : 0, ...(pw ? { password: pw } : {}) }) });
    const cur = RB.list?.find((v) => v.current)?.v ?? U.d?.installed?.version ?? null;
    try { sessionStorage.setItem('hl_rb44', JSON.stringify({ to: d.x.v, from: cur, pause: d.pause, until: d.pause ? Date.now() + 7 * 864e5 : null, at: Date.now() })); sessionStorage.setItem('hl_updating', JSON.stringify({ at: Date.now(), version: d.x.v })); } catch { /* */ }
    U.rollTo = d.x.v; U.jobId = r?.id ?? r?.jobId ?? null;
    U.prev = { sha: U.d?.installed?.sha ?? null, version: U.d?.installed?.version ?? null };
    U.d = { ...(U.d ?? {}), status: { ...(U.d?.status ?? {}), id: U.jobId, state: 'downloading', step: 'downloading', action: 'rollback', version: d.x.v, error: null, startedAt: new Date().toISOString(), finishedAt: null } };
    RB.dlg = null; watch(); loadUpdate();
  } catch (e) { d.err = e.status === 404 ? 'Serveren har ikke tilbakerulling ennå. Oppdater Nordlys først.' : (e.status === 401 || e.status === 403) && /passord|password/i.test(e.message) ? 'Feil passord.' : e.message; }
  RB.busy = false; dlg(); rr();
}

/* ---------------- Brukere → SERVER · EIER og LOGG INN SOM ---------------- */
const OW = { d: null, loading: false, err: '', at: 0, dlg: null, users: null };
function loadOwner(force) {
  if (OW.loading || (!force && OW.d && Date.now() - OW.at < 60_000)) return;
  OW.loading = true;
  j('/api/server/owner').then((d) => { OW.d = d ?? {}; OW.err = ''; }).catch((e) => { OW.d = null; OW.err = e.status === 404 ? 'missing' : e.message; }).finally(() => { OW.loading = false; OW.at = Date.now(); rr(); });
}
const ownerOf = () => { const d = OW.d; if (!d) return null; const o = d.owner ?? d; return { id: o.id ?? o.userId ?? d.ownerId, name: o.name ?? o.username ?? '', since: o.since ?? o.createdAt ?? d.since ?? null }; };
/** Låst oppsett per bruker (GET /api/users/:id/layout → locked). Hentes én gang. */
const LK = new Map();
function loadLocks(users) {
  if (!admin()) return;
  for (const u of users ?? []) {
    if (u.id === meId() || u.role === 'admin' || LK.has(u.id)) continue;
    LK.set(u.id, null);
    j(`/api/users/${encodeURIComponent(u.id)}/layout`).then((d) => { LK.set(u.id, !!d?.locked); rr(); }).catch(() => {});
  }
}
/** users: lista fra settings-login (GET /api/users). */
export function usersGroups44(h, users = [], rerender) {
  if (rerender) rr = rerender;
  OW.users = users;
  loadLocks(users);
  const out = [];
  if (admin() || OW.d) loadOwner();
  const o = ownerOf(), me = meId();
  const isOwner = OW.d?.me?.isOwner ?? (o && o.id === me), canT = OW.d?.me?.canTransfer ?? (isOwner || admin());
  if (OW.err === 'missing') out.push(h.group('Server · eier', [h.row({ t: 'Eier av serveren', s: 'Serveren har ikke eierskap ennå. Oppdater Nordlys først.', k: 'eier overfør eierskap' })]));
  else if (o) {
    const pend = Array.isArray(OW.d?.pending) ? OW.d.pending[0] : OW.d?.pending;
    const pendTxt = pend ? `Venter på godkjenning: overføring til ${pend.toName ?? pend.to?.name ?? pend.toUser?.name ?? 'ny eier'}${pend.expiresAt ? ` · gyldig til ${dd(pend.expiresAt)} ${hm(pend.expiresAt)}` : ''}` : '';
    out.push(h.group('Server · eier', [
      h.row({ t: 'Eier av serveren', ini: initials(o.name), ic: '#7a3b6b', s: `${o.name}${isOwner ? ' (deg)' : ''}${o.since ? ` · startet serveren ${dd(o.since)}` : ''}`, k: 'eier server owner' }),
      pend && isOwner ? `<div class="sg-row ow44-pend"><span class="sg-txt"><b>${esc(pendTxt)}</b><span>${esc(pend.byName ?? pend.by?.name ?? 'En admin')} vil overføre serveren.</span></span><span class="ow44-pb"><button type="button" class="sg-btn2" data-ow44-ok="${esc(pend.id)}">Godkjenn</button><button type="button" class="sg-btn2 danger" data-ow44-no="${esc(pend.id)}">Avslå</button></span></div>` : pend ? h.row({ t: pendTxt, s: 'Eieren må godkjenne innen 48 timer.' }) : null,
      canT && !pend ? h.row({ t: 'Overfør eierskap', tc: '#d0503e', s: isOwner ? 'Gi serveren til en annen bruker. Du blir admin.' : OW.d?.me?.needsApproval === false ? 'Gi serveren til en annen bruker.' : 'Eieren må godkjenne (gyldig i 48 t).', btn: 'Overfør', act: 'data-ow44-start', k: 'overfør eierskap eier transfer owner' }) : null,
    ].filter(Boolean), 'Ny eier må ha totrinnsbekreftelse på. Kan ikke angres her, men ny eier kan overføre tilbake.'));
  } else if (OW.loading) out.push(h.group('Server · eier', [h.row({ t: 'Eier av serveren', s: 'Henter …' })]));
  if (admin()) {
    const fam = (users ?? []).filter((u) => u.id !== me && u.role !== 'admin' && !(o && u.id === o.id));
    if (fam.length) out.push(h.group('Familie · logg inn som', fam.map((u) => h.row({ t: u.name || u.username, ini: initials(u.name || u.username), ic: u.color ?? '#2f6b4a', s: `@${u.username}${LK.get(u.id) ? ' · låst oppsett' : ' · kan endre selv'}`, btn: 'Logg inn som', act: `data-as44="${esc(u.id)}"`, k: 'logg inn som impersonering rediger oppsett familie' }))
      .concat([`<div class="as44-more">${fam.map((u) => `<span class="as44-u"><b>${esc(u.name || u.username)}</b><button type="button" class="sg-link" data-as44-copy="${esc(u.id)}">Kopier mitt oppsett hit</button><button type="button" class="sg-link" data-as44-reset="${esc(u.id)}">Tilbakestill til standard</button><button type="button" class="sg-link" data-as44-lock="${esc(u.id)}" data-locked="${LK.get(u.id) ? 1 : 0}">${LK.get(u.id) ? `La ${esc(u.name || u.username)} endre selv` : 'Lås oppsettet'}</button></span>`).join('')}</div>`]),
    'Uten passord, fordi du er admin. Du ser appen som personen og redigerer oppsettet som vanlig. Endringer lagres med en gang. Passord, 2FA og rolle kan ikke endres mens du er logget inn som noen andre.'));
  }
  return out;
}
function owDialog() {
  const d = OW.dlg; if (!d) return '';
  const o = ownerOf(), me = meId(), list = Array.isArray(OW.d?.candidates) ? OW.d.candidates.map((c) => ({ ...(OW.users ?? []).find((u) => u.id === c.id), ...c })) : (OW.users ?? []).filter((u) => u.id !== (o?.id ?? me));
  if (d.step === 1) return `<div class="s44-scrim" data-s44-close></div><div class="s44-dlg" role="dialog" aria-modal="true" aria-labelledby="ow44-t"><b id="ow44-t" class="s44-h">Overfør eierskap</b>
    <span class="s44-p">Eieren har siste ord om serveren: backup-nøkkelen, domener og varsler om serverfeil. Du blir admin.${o?.id !== me ? ' Eieren må godkjenne overføringen.' : ''}</span>
    <div class="ow44-list" role="radiogroup">${list.map((u) => `<button type="button" class="ow44-u${d.to === u.id ? ' on' : ''}" role="radio" aria-checked="${d.to === u.id}" data-ow44-pick="${esc(u.id)}"${u.eligible === false ? ' aria-disabled="true"' : ''}><span class="ow44-av">${esc(initials(u.name || u.username))}</span><span><b>${esc(u.name || u.username)}</b><span>${esc(u.role === 'admin' ? 'Admin' : 'Bruker')}${u.totp ? ' · 2FA på' : ' · 2FA av'}${u.eligible === false && u.reason ? ` · ${u.reason}` : ''}</span></span></button>`).join('') || '<span class="s44-p">Ingen andre brukere ennå.</span>'}</div>
    ${d.err ? `<span class="s44-err" role="alert">${esc(d.err)}</span>` : ''}
    <div class="s44-btns"><button type="button" class="s44-b" data-s44-close>Avbryt</button><button type="button" class="s44-b dark" data-ow44-next ${d.to ? '' : 'disabled'}>Fortsett</button></div></div>`;
  const u = list.find((x) => x.id === d.to) ?? {}, nm = u.name || u.username || '';
  const ok = d.typed.trim().toLowerCase() === nm.toLowerCase() && d.pw;
  return `<div class="s44-scrim" data-s44-close></div><form class="s44-dlg" role="dialog" aria-modal="true" aria-labelledby="ow44-t2" data-ow44-form><b id="ow44-t2" class="s44-h">Overfør til ${esc(nm)}?</b>
    <span class="s44-p">${esc(nm)} blir eier av serveren. Du blir admin. Skriv navnet for å bekrefte, og passordet ditt.</span>
    <label class="s44-f"><span>Skriv «${esc(nm)}»</span><input name="owname" value="${esc(d.typed)}" autocomplete="off" spellcheck="false" data-ow44-typed data-glimt="off"></label>
    <label class="s44-f"><span>Passord</span><input type="password" name="owpw" value="${esc(d.pw)}" autocomplete="current-password" data-ow44-pw></label>
    ${d.err ? `<span class="s44-err" role="alert">${esc(d.err)}</span>` : ''}
    <div class="s44-btns"><button type="button" class="s44-b" data-ow44-back>Tilbake</button><button type="submit" class="s44-b red" ${ok && !d.busy ? '' : 'disabled'}>${d.busy ? 'Overfører …' : `Overfør til ${esc(nm)}`}</button></div></form>`;
}
async function owSubmit() {
  const d = OW.dlg; if (!d) return;
  d.busy = true; d.err = ''; dlg();
  try {
    try { await j('/api/auth/reauth', { method: 'POST', body: JSON.stringify({ password: d.pw }) }); } catch (e) { if (e.status !== 404) throw Object.assign(e, { reauth: true }); }
    const r = await j('/api/server/owner/transfer', { method: 'POST', body: JSON.stringify({ toUserId: d.to, password: d.pw }) });
    const nm = (OW.users ?? []).find((x) => x.id === d.to); const n = nm?.name || nm?.username || 'Ny eier';
    OW.dlg = null; dlg(); loadOwner(true);
    flash(r?.pending || r?.status === 'pending' ? `Venter på at eieren godkjenner overføringen til ${n} (48 t).` : `${n} eier nå serveren. Du er fortsatt admin. ${n} har fått e-post og varsel.`);
  } catch (e) {
    d.busy = false;
    d.err = e.status === 404 ? 'Serveren har ikke overføring av eierskap ennå.' : e.reauth || /passord|password/i.test(e.message) ? 'Feil passord.' : /2fa|totp/i.test(e.message) ? e.message : e.message;
    dlg();
  }
}

/* ---------------- Dialoger og toast (over innstillingene) ---------------- */
function dlg() {
  let host = document.getElementById('s44-dlg');
  const html = rbDialog() || owDialog();
  if (!html) { host?.remove(); return; }
  if (!host) { host = document.createElement('div'); host.id = 's44-dlg'; host.className = 's44-host'; document.body.appendChild(host); bindDlg(host); }
  const act = document.activeElement, nm = host.contains(act) ? act.name : null, pos = nm ? act.selectionStart : null;
  host.innerHTML = html;
  const f = nm ? host.querySelector(`[name="${nm}"]`) : host.querySelector('input:not([type=checkbox]),button.on,button[data-ow44-pick],button.rb44-o.on');
  if (f) { f.focus(); if (pos != null) try { f.setSelectionRange(pos, pos); } catch { /* */ } }
}
function bindDlg(host) {
  host.addEventListener('click', (e) => {
    const t = e.target, x = (s) => t.closest(s);
    let b;
    if (x('[data-s44-close]')) { RB.dlg = null; OW.dlg = null; return dlg(); }
    if ((b = x('[data-rb44-opt]')) && !b.disabled) { RB.dlg.opt = b.dataset.rb44Opt; return dlg(); }
    if ((b = x('[data-ow44-pick]'))) { OW.dlg.to = b.dataset.ow44Pick; OW.dlg.err = ''; return dlg(); }
    if (x('[data-ow44-next]')) { const u = (OW.d?.candidates ?? OW.users ?? []).find((y) => y.id === OW.dlg.to); if (u && u.eligible === false) { OW.dlg.err = u.reason || `${u.name || 'Brukeren'} kan ikke bli eier ennå.`; return dlg(); } if (u && u.totp === false) { OW.dlg.err = `${u.name || u.username} må slå på 2FA først.`; return dlg(); } OW.dlg.step = 2; OW.dlg.err = ''; return dlg(); }
    if (x('[data-ow44-back]')) { OW.dlg.step = 1; return dlg(); }
  });
  host.addEventListener('change', (e) => { if (e.target.matches('[data-rb44-pause]')) RB.dlg.pause = e.target.checked; });
  host.addEventListener('input', (e) => { if (e.target.matches('[data-ow44-typed]')) { OW.dlg.typed = e.target.value; dlg(); } if (e.target.matches('[data-ow44-pw]')) { OW.dlg.pw = e.target.value; dlg(); } });
  host.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.matches('[data-rb44-form]')) rollback(e.target); if (e.target.matches('[data-ow44-form]')) owSubmit(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (RB.dlg || OW.dlg)) { e.preventDefault(); e.stopPropagation(); RB.dlg = null; OW.dlg = null; dlg(); } }, true);
}
export function flash(text) {
  let t = document.getElementById('s44-toast');
  if (!t) { t = document.createElement('div'); t.id = 's44-toast'; t.className = 's44-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on');
  clearTimeout(flash.t); flash.t = setTimeout(() => t.classList.remove('on'), 3200);
}

/** Klikk i innstillingene. Returnerer true når den er håndtert. */
export async function click44(e, render) {
  if (render) rr = render;
  const t = e.target, x = (s) => t.closest(s);
  let b;
  if ((b = x('[data-md44]'))) { e.preventDefault(); await setMode(b.dataset.md44); render?.(); return true; }
  if ((b = x('[data-rb44]'))) { e.preventDefault(); const v = RB.list?.find((y) => y.v === b.dataset.rb44); if (v) { RB.dlg = { x: v, opt: v.compatible ? 'keep' : 'restore', pause: true, err: '' }; dlg(); } return true; }
  if (x('[data-ow44-start]')) { e.preventDefault(); OW.dlg = { step: 1, to: null, typed: '', pw: '', err: '' }; dlg(); return true; }
  if ((b = x('[data-ow44-ok],[data-ow44-no]'))) { e.preventDefault(); const ok = !!b.dataset.ow44Ok, id = b.dataset.ow44Ok ?? b.dataset.ow44No; const pw = ok ? prompt('Bekreft med passordet ditt for å godkjenne overføringen.') : ''; if (ok && !pw) return true; try { await j(`/api/server/owner/transfer/${encodeURIComponent(id)}/${ok ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify(ok ? { password: pw } : {}) }); flash(ok ? 'Overføringen er godkjent.' : 'Overføringen er avslått.'); } catch (er) { flash(er.message); } loadOwner(true); return true; }
  if ((b = x('[data-as44]'))) { e.preventDefault(); const u = (OW.users ?? []).find((y) => y.id === b.dataset.as44); if (u) await startAs(u); return true; }
  if ((b = x('[data-as44-copy]'))) { e.preventDefault(); const u = (OW.users ?? []).find((y) => y.id === b.dataset.as44Copy); if (!confirm(`Kopiere oppsettet ditt (Hjem, fanelinje og Mer) til ${u?.name || 'personen'}? Det som er der nå, erstattes.`)) return true; try { await j(`/api/users/${encodeURIComponent(b.dataset.as44Copy)}/layout/copy-from-me`, { method: 'POST', body: '{}' }); flash(`Oppsettet ditt er kopiert til ${u?.name || 'personen'}.`); } catch (er) { flash(er.status === 404 ? 'Serveren har ikke dette ennå.' : er.message); } return true; }
  if ((b = x('[data-as44-reset]'))) { e.preventDefault(); const u = (OW.users ?? []).find((y) => y.id === b.dataset.as44Reset); if (!confirm(`Tilbakestille oppsettet til ${u?.name || 'personen'} til standard?`)) return true; try { await j(`/api/users/${encodeURIComponent(b.dataset.as44Reset)}/layout/reset`, { method: 'POST', body: '{}' }); flash('Tilbakestilt til standard.'); } catch (er) { flash(er.status === 404 ? 'Serveren har ikke dette ennå.' : er.message); } return true; }
  if ((b = x('[data-as44-lock]'))) { e.preventDefault(); const lock = b.dataset.locked !== '1'; try { await j(`/api/users/${encodeURIComponent(b.dataset.as44Lock)}/layout/lock`, { method: 'PUT', body: JSON.stringify({ locked: lock }) }); LK.set(b.dataset.as44Lock, lock); flash(lock ? 'Oppsettet er låst. Bare du kan endre det.' : 'Personen kan endre oppsettet selv igjen.'); render?.(); } catch (er) { flash(er.status === 404 ? 'Serveren har ikke dette ennå.' : er.message); } return true; }
  return false;
}
export { asState };
