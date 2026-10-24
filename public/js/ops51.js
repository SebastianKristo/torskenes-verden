// Prompt 51 (OPS51): Backup og oppdateringer i Innstillinger → System (bare admin).
//   Grønt/gult/rødt kort for restic-backupen (3-2-1 og testet gjenoppretting), databasen (WAL, integritet, VACUUM) og
//   oppdateringer (staging-kanal og tilbakerulling med ett trykk). Oppsett av mål (lokal disk, NAS, offsite) og repo-passordet.
//   API: /api/ops51/* (server/ops51.js, $S/SERVER51-API.md → OPS51). Nøkler sendes bare inn, aldri ut.
import { esc } from './util.js';
import { store } from './store.js';

let R = () => {};
const admin = () => store.me?.me?.role === 'admin';
const O = { s: null, at: 0, loading: false, err: '', msg: '', busy: '', set: null, setOpen: false, setErr: '', pwFor: '', key: null, poll: 0 };

async function j(path, opts = {}) {
  const r = await fetch(`/api/ops51${path}`, { credentials: 'same-origin', cache: 'no-store', ...opts, headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  const b = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(b?.error || `Serveren svarte ${r.status}`), { status: r.status, data: b });
  return b;
}
const post = (path, body = {}) => j(path, { method: 'POST', body: JSON.stringify(body) });

function load(force = false) {
  if (O.loading || (!force && O.s && Date.now() - O.at < 30_000)) return;
  O.loading = true;
  j('/summary').then((s) => { O.s = s; O.err = ''; })
    .catch((e) => { O.err = e.status === 404 ? 'Serveren har ikke backup og staging ennå. Oppdater Nordlys.' : e.message; })
    .finally(() => { O.loading = false; O.at = Date.now(); schedulePoll(); R(); });
}
/** Mens noe kjører (backup, gjenopprettingstest, staging): hent status hvert 3. s. */
function schedulePoll() {
  clearTimeout(O.poll);
  const s = O.s, live = s && (s.backup?.running || s.updates?.staging?.state === 'running' || ['downloading', 'building'].includes(s.updates?.job?.state) || s.updates?.updating);
  if (live) O.poll = setTimeout(() => { if (document.querySelector('.p51o')) load(true); }, 3000);
}

const DOT = { green: '#3ecf8e', yellow: '#f2c94c', red: '#f2766b', ok: '#3ecf8e', failed: '#f2766b', running: '#7aa2f7', pending: '#8a93a6', partial: '#f2c94c' };
const dot = (c) => `<i class="p51o-dot" style="background:${DOT[c] ?? '#8a93a6'}"></i>`;
const when = (t) => { if (!t) return 'aldri'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'nå nettopp' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
const btn = (act, label, { pri = false, dis = false } = {}) => `<button type="button" class="p51o-btn${pri ? ' pri' : ''}" data-p51o="${act}" ${dis || O.busy ? 'disabled' : ''}>${O.busy === act ? 'Starter …' : esc(label)}</button>`;
const card = (status, title, body) => `<div class="p51o-card p51o-${status}"><b class="p51o-ct">${dot(status)}${esc(title)}</b>${body}</div>`;

function backupCard(b) {
  const rows = b.targets.map((t) => `<li>${dot(t.lastState === 'failed' ? 'failed' : t.lastOkAt ? 'ok' : 'pending')}<span><b class="p51o-lb">${esc(t.label)}</b> <span class="p51o-mono" data-no-i18n>${esc(t.repo)}</span><span class="p51o-sub">${t.lastOkAt ? `Siste backup ${esc(when(t.lastOkAt))}` : 'Ingen backup ennå'}${t.lastError ? ` · ${esc(t.lastError)}` : ''}</span></span></li>`).join('');
  const run = b.running;
  const issues = b.issues.length ? `<ul class="p51o-is">${b.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  return card(b.status, b.title, `<span class="p51o-sub">3-2-1: ${b.rule321.copies} kopier · ${b.rule321.media} medier · ${b.rule321.offsite ? 'én utenfor huset' : 'ingen utenfor huset'}${b.restic?.version ? ` · restic ${esc(b.restic.version)}` : ''}</span>
    ${rows ? `<ul class="p51o-l">${rows}</ul>` : ''}${issues}
    ${run ? `<span class="p51o-sub">${run.kind === 'backup' ? 'Backup pågår …' : 'Tester gjenoppretting …'}</span>` : ''}
    <span class="p51o-row">${btn('run', 'Ta backup nå', { pri: true, dis: !!run || !b.targets.length })}${btn('restore', 'Test gjenoppretting', { dis: !!run || !b.targets.length })}${btn('settings', O.setOpen ? 'Lukk oppsett' : 'Oppsett')}</span>`);
}
function restoreCard(b) {
  const t = b.restoreTest;
  const st = !t ? 'yellow' : t.state === 'ok' ? (Date.now() - t.at > 8 * 86400_000 ? 'yellow' : 'green') : t.state === 'running' ? 'yellow' : 'red';
  const steps = t?.steps?.length ? `<ul class="p51o-l">${t.steps.map((s) => `<li>${dot(s.state)}<span>${esc(s.label)}<span class="p51o-sub">${esc(s.error || s.detail || '')}</span></span></li>`).join('')}</ul>` : '';
  return card(st, !t ? 'Gjenoppretting ikke testet' : t.state === 'ok' ? `Gjenoppretting testet ${when(t.at)}` : t.state === 'running' ? 'Tester gjenoppretting …' : 'Gjenopprettingstesten feilet',
    `<span class="p51o-sub">Hver søndag 04:10: siste snapshot gjenopprettes til en temp-mappe, databasene sjekkes, og serveren startes mot kopien på egen port og røyktestes.</span>${steps}`);
}
function dbCard(d) {
  return card(d.status, d.title, `<span class="p51o-sub">${String(d.sizeMb).replace('.', ',')} MB · WAL ${String(d.walMb).replace('.', ',')} MB · ${String(d.freePct).replace('.', ',')} % ledig plass i fila</span>
    ${d.walWarn ? `<span class="p51o-sub p51o-err">${esc(d.walWarn)}</span>` : ''}
    <span class="p51o-sub">Integritet: ${d.lastIntegrity ? `${d.lastIntegrity.ok ? 'ok' : 'FEIL'} · ${esc(when(d.lastIntegrity.at))}` : 'ikke sjekket'} · VACUUM: ${d.lastVacuum ? esc(when(d.lastVacuum.at)) : 'aldri'} (søndag 04:40)</span>
    <span class="p51o-row">${btn('integrity', 'Sjekk integritet')}${btn('vacuum', 'Vedlikehold nå')}</span>`);
}
function updatesCard(u) {
  const s = u.staging, job = u.job, run = s?.state === 'running' || ['downloading', 'building'].includes(job?.state);
  const smoke = s?.smoke?.length ? `<ul class="p51o-l">${s.smoke.map((x) => `<li>${dot(x.ok ? 'ok' : 'failed')}<span>${esc(x.name)}<span class="p51o-sub">${esc(x.detail ?? '')}</span></span></li>`).join('')}</ul>` : '';
  const ch = u.channel ? (u.channel.staging ? 'Staging er på: nye versjoner røyktestes i en kopi før byttet.' : 'Staging er av for vanlige oppdateringer (UPDATE_STAGING=0). Du kan fortsatt prøve en versjon i staging.') : 'Updateren har ikke staging ennå – den oppdateres ved neste oppdatering.';
  const prev = u.previous ? `Forrige versjon ${u.previous.version ?? u.previous.sha.slice(0, 7)} er beholdt` : 'Ingen forrige versjon lagret ennå (lagres ved neste oppdatering)';
  const ver = s?.version ?? '';
  const actions = [
    !s || ['promoted', 'discarded', 'failed'].includes(s.state) ? btn('stage', 'Prøv ny versjon i staging', { dis: run || !u.updaterAvailable || u.updating }) : '',
    s?.canPromote ? btn('promote', `Bytt til ${ver || 'versjonen i staging'}`, { pri: true, dis: u.updating }) : '',
    s && ['ready', 'failed', 'running'].includes(s.state) && !run ? btn('discard', 'Forkast') : '',
    u.previous ? btn('rollback-image', `Gå tilbake til ${u.previous.version ?? 'forrige'}`, { dis: run || u.updating || !u.updaterAvailable }) : '',
  ].join('');
  return card(u.status, u.title, `<span class="p51o-sub">${esc(ch)}</span><span class="p51o-sub">${esc(prev)} · tilbakerulling med ett trykk (ingen nedlasting eller bygging).</span>
    ${job?.state && job.state !== 'done' ? `<span class="p51o-sub">${esc(job.step ?? '')}${job.error ? ` · ${esc(job.error.split('\n')[0])}` : ''}</span>` : ''}
    ${s?.error ? `<span class="p51o-sub p51o-err">${esc(s.error)}</span>` : ''}${smoke}
    ${s?.port && s.state === 'ready' ? `<span class="p51o-sub">Staging kan åpnes på port ${s.port} på serveren.</span>` : ''}
    ${!u.updaterAvailable ? '<span class="p51o-sub">Updateren svarer ikke.</span>' : ''}<span class="p51o-row">${actions}</span>`);
}

function pwHtml() {
  if (!O.pwFor) return '';
  const what = { key: 'vise repo-passordet', stage: 'prøve i staging', promote: 'bytte versjon', 'rollback-image': 'gå tilbake', save: 'bytte repo-passord' }[O.pwFor] ?? 'fortsette';
  return `<form class="p51o-form" data-p51o-form="pw"><b>Bekreft med passordet ditt for å ${esc(what)}</b><label>Passord<input type="password" name="pw" autocomplete="current-password" required></label>
    <span class="p51o-row"><button type="submit" class="p51o-btn pri">Bekreft</button><button type="button" class="p51o-btn" data-p51o="pwcancel">Avbryt</button></span></form>`;
}
function keyHtml() {
  if (!O.key) return '';
  return `<div class="p51o-form"><b>Repo-passordet</b><span class="p51o-sub">Ta vare på det et trygt sted (passordbehandler). Uten det kan ingen backup gjenopprettes på en ny server.</span>
    <code class="p51o-mono p51o-key" data-no-i18n>${esc(O.key)}</code><span class="p51o-row"><button type="button" class="p51o-btn" data-p51o="keycopy">Kopier</button><button type="button" class="p51o-btn" data-p51o="keyhide">Skjul</button></span></div>`;
}
function settingsHtml() {
  if (!O.setOpen) return '';
  const s = O.set;
  if (!s) return '<span class="p51o-sub">Henter oppsettet …</span>';
  const t = s.targets;
  const ck = (name, on, label) => `<label class="p51o-ck"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  return `<form class="p51o-form" data-p51o-form="settings"><b>Oppsett av backup</b>
    ${ck('enabled', s.enabled, 'Automatisk backup hver natt')}
    <label>Klokkeslett<input name="time" value="${esc(s.time)}" pattern="[0-2][0-9]:[0-5][0-9]" inputmode="numeric"></label>
    ${ck('restoreTest', s.restoreTest, 'Test gjenoppretting hver søndag')}
    <b class="p51o-ct">1 · Lokal disk</b>${ck('local.enabled', t.local.enabled, 'På')}
    <label>Mappe<input name="local.repo" value="${esc(t.local.repo)}" placeholder="${esc(s.defaults?.localRepo ?? '/srv/backup/restic51')}" autocomplete="off"></label>
    <b class="p51o-ct">2 · NAS</b>${ck('nas.enabled', t.nas.enabled, 'På')}
    <label>Mappe eller adresse<input name="nas.repo" value="${esc(t.nas.repo)}" placeholder="/mnt/nas/nordlys eller rest:https://nas.lan:8000/nordlys" autocomplete="off"></label>
    <span class="p51o-sub">Monter NAS-sharen (SMB/NFS) på serveren og velg stien, eller bruk restic rest-server på NAS-en.</span>
    <label>Bruker (rest-server, valgfritt)<input name="nas.user" placeholder="${t.nas.userSet ? '•••• (lagret)' : ''}" autocomplete="off"></label>
    <label>Passord (rest-server, valgfritt)<input name="nas.pass" type="password" placeholder="${t.nas.passSet ? '•••• (lagret – fyll inn for å bytte)' : ''}" autocomplete="new-password"></label>
    <b class="p51o-ct">3 · Utenfor huset (valgfritt)</b>${ck('offsite.enabled', t.offsite.enabled, 'På')}
    <label>Adresse<input name="offsite.repo" value="${esc(t.offsite.repo)}" placeholder="b2:bøtte:nordlys eller s3:https://…/bøtte" autocomplete="off"></label>
    <label>Nøkkel-ID (Backblaze keyID / S3 access key)<input name="offsite.accountId" placeholder="${t.offsite.accountIdSet ? '•••• (lagret)' : ''}" autocomplete="off"></label>
    <label>Nøkkel (applicationKey / secret)<input name="offsite.accountKey" type="password" placeholder="${t.offsite.accountKeySet ? '•••• (lagret – fyll inn for å bytte)' : ''}" autocomplete="new-password"></label>
    <span class="p51o-sub">Alt krypteres av restic med repo-passordet før det forlater serveren. Nøklene lagres kryptert og vises aldri igjen.</span>
    ${O.setErr ? `<span class="p51o-sub p51o-err" role="alert">${esc(O.setErr)}</span>` : ''}
    <span class="p51o-row"><button type="submit" class="p51o-btn pri">Lagre</button>${s.keySet ? '<button type="button" class="p51o-btn" data-p51o="key">Vis repo-passord</button>' : ''}</span>
    <span class="p51o-sub">${s.restic?.available ? `restic ${esc(s.restic.version ?? '')} er installert.` : esc(s.restic?.error ?? 'restic mangler')}</span></form>`;
}

/** HTML-en i System (bare admin). onChange: rerender for siden. */
export function ops51SystemHtml(onChange) {
  if (!admin()) return '';
  if (onChange) R = onChange;
  css();
  load();
  const s = O.s;
  if (!s) return `<section class="sg p51o"><h3 class="sg-t">Backup og oppdateringer</h3><span class="p51o-sub">${O.err ? esc(O.err) : 'Henter …'}</span></section>`;
  return `<section class="sg p51o"><h3 class="sg-t">Backup og oppdateringer <button type="button" class="p51o-btn" data-p51o="refresh" ${O.loading ? 'disabled' : ''}>${O.loading ? 'Henter …' : 'Oppdater'}</button></h3>
    <div class="p51o-grid">${backupCard(s.backup)}${restoreCard(s.backup)}${updatesCard(s.updates)}${dbCard(s.db)}</div>
    ${pwHtml()}${keyHtml()}${settingsHtml()}${O.msg ? `<span class="p51o-sub">${esc(O.msg)}</span>` : ''}${O.err ? `<span class="p51o-sub p51o-err">${esc(O.err)}</span>` : ''}</section>`;
}

async function act(a, extra = {}) {
  O.busy = a; O.msg = ''; O.err = ''; R();
  try {
    if (a === 'run') { await post('/backup/run'); O.msg = 'Backupen er startet.'; }
    else if (a === 'restore') { await post('/backup/restore-test'); O.msg = 'Gjenopprettingstesten er startet. Den tar et par minutter.'; }
    else if (a === 'integrity' || a === 'vacuum') { const r = await post('/db/maintenance', { kind: a === 'vacuum' ? 'weekly' : 'integrity' }); O.msg = r.result.ok ? (a === 'vacuum' ? 'Vedlikeholdet er ferdig.' : 'Integriteten er ok.') : r.result.error; }
    else if (a === 'key') { const r = await post('/backup/key', extra); O.key = r.repoPassword; O.pwFor = ''; }
    else if (['stage', 'promote', 'discard', 'rollback-image'].includes(a)) {
      if ((a === 'promote' || a === 'rollback-image') && !extra.password && !confirm(a === 'promote' ? 'Bytte til versjonen i staging nå? Serveren starter på nytt.' : 'Gå tilbake til forrige versjon nå? Serveren starter på nytt. Dataene beholdes.')) { O.busy = ''; R(); return; }
      const r = await post(`/updates/${a}`, extra); O.msg = r.message ?? ''; O.pwFor = '';
    }
    load(true);
  } catch (e) {
    if (e.status === 403 && e.data?.needsPassword && !extra.password) O.pwFor = a;
    else O.err = e.message;
  } finally { O.busy = ''; R(); }
}

export async function ops51Click(e) {
  const b = e.target.closest?.('[data-p51o]');
  if (!b || b.disabled) return false;
  e.preventDefault();
  const a = b.dataset.p51o;
  if (a === 'refresh') load(true);
  else if (a === 'settings') { O.setOpen = !O.setOpen; O.setErr = ''; if (O.setOpen) j('/backup/settings').then((s) => { O.set = s; }).catch((x) => { O.setErr = x.message; }).finally(R); }
  else if (a === 'pwcancel') O.pwFor = '';
  else if (a === 'key') O.pwFor = 'key';
  else if (a === 'keyhide') O.key = null;
  else if (a === 'keycopy') { try { await navigator.clipboard.writeText(O.key ?? ''); O.msg = 'Kopiert.'; } catch { O.msg = 'Kunne ikke kopiere – merk og kopier selv.'; } }
  else { await act(a); return true; }
  R();
  return true;
}

export async function ops51Submit(e) {
  const f = e.target.closest?.('[data-p51o-form]');
  if (!f) return false;
  e.preventDefault();
  const fd = new FormData(f);
  if (f.dataset.p51oForm === 'pw') { await act(O.pwFor, { password: String(fd.get('pw') ?? '') }); return true; }
  // Oppsett: tomme hemmelighetsfelt betyr «behold», utfylte sendes inn (og vises aldri igjen).
  const t = (id) => {
    const o = { enabled: fd.get(`${id}.enabled`) === 'on', repo: String(fd.get(`${id}.repo`) ?? '').trim() };
    for (const k of ['user', 'pass', 'accountId', 'accountKey']) { const v = fd.get(`${id}.${k}`); if (v) o[k] = String(v); }
    return o;
  };
  const body = { enabled: fd.get('enabled') === 'on', restoreTest: fd.get('restoreTest') === 'on', time: String(fd.get('time') ?? '02:40'), targets: { local: t('local'), nas: t('nas'), offsite: t('offsite') } };
  if (!body.targets.local.repo) delete body.targets.local.repo;
  O.setErr = ''; R();
  try { O.set = await j('/backup/settings', { method: 'PUT', body: JSON.stringify(body) }); O.msg = 'Oppsettet er lagret.'; load(true); }
  catch (x) { O.setErr = x.message; }
  R();
  return true;
}

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `.p51o{display:flex;flex-direction:column;gap:10px;padding-bottom:18px}.p51o .sg-t{display:flex;align-items:center;gap:10px}
.p51o-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.p51o-card{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:12px;border:1px solid var(--w30-line,#d8d1c2);border-left-width:4px}
.p51o-card.p51o-green{border-left-color:#3ecf8e}.p51o-card.p51o-yellow{border-left-color:#f2c94c}.p51o-card.p51o-red{border-left-color:#f2766b}
.p51o-ct{display:flex;align-items:center;gap:8px;font-size:14px}.p51o-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}
.p51o-sub{font-size:12.5px;opacity:.75;line-height:1.4}.p51o-sub.p51o-err{color:#d9534f;opacity:1}.p51o-mono{font-family:'JetBrains Mono',monospace;font-size:12px;word-break:break-all}
.p51o-l,.p51o-is{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.p51o-l li{display:flex;gap:8px;align-items:flex-start}.p51o-l li>span{display:flex;flex-direction:column;min-width:0}
.p51o-l .p51o-dot{margin-top:5px}.p51o-lb{font-size:13.5px;font-weight:600}.p51o-is li{font-size:12.5px;padding-left:12px;position:relative}.p51o-is li::before{content:'•';position:absolute;left:0}
.p51o-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}.p51o-btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid var(--w30-line,#d8d1c2);background:transparent;color:inherit;cursor:pointer}
.p51o-btn.pri{background:#2f6fde;border-color:#2f6fde;color:#fff}.p51o-btn:disabled{opacity:.5;cursor:default}
.p51o-form{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;border:1px solid var(--w30-line,#d8d1c2)}.p51o-form label{display:flex;flex-direction:column;gap:4px;font-size:12.5px}
.p51o-form input:not([type=checkbox]){font:inherit;font-size:13.5px;padding:7px 9px;border-radius:8px;border:1px solid var(--w30-line,#d8d1c2);background:transparent;color:inherit}
.p51o-form .p51o-ck{flex-direction:row;align-items:center;gap:8px;font-size:13.5px}.p51o-key{padding:8px;border-radius:8px;background:color-mix(in srgb,var(--w30-line,#d8d1c2) 30%,transparent);user-select:all}`;
  document.head.appendChild(st);
}
