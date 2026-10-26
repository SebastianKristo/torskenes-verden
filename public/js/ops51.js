// Prompt 51 (OPS51): Backup og oppdateringer i Innstillinger → System (bare admin).
//   Grønt/gult/rødt kort for restic-backupen (3-2-1 og testet gjenoppretting), databasen (WAL, integritet, VACUUM) og
//   oppdateringer (staging-kanal og tilbakerulling med ett trykk). Oppsett av mål (lokal disk, NAS, offsite) og repo-passordet.
//   API: /api/ops51/* (server/ops51.js, $S/SERVER51-API.md → OPS51). Nøkler sendes bare inn, aldri ut.
import { esc } from './util.js';
import { store } from './store.js';
import { row66, sec, btn, swb, banner, fld, xrow66, tone66, lnk66, root66, setR66 } from './sys66.js'; // prompt 66: samme komponenter som AI-siden

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
  if (live) O.poll = setTimeout(() => { if (document.querySelector('[data-sys66]')) load(true); }, 3000);
}

// Prompt 66 (prompt 50b «fullfør utseendet»): samme komponenter som AI-siden (sys66.js → ui65). Backup-siden: banner med
// 3-2-1-status + Oppsett, Kopier, Gjenoppretting (5 steg som prikk-rader, «Test nå») og Database (Integritet, VACUUM).
// Oppdateringer: Staging som utvidbar rad med røyktest-sjekkene. De store kortene med fargekant er fjernet.
const when = (t) => { if (!t) return 'aldri'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'nå nettopp' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : `${Math.round(s / 86400)} d siden`; };
const busyLbl = (act, label) => (O.busy === act ? 'Starter …' : label);
const b66 = (act, label, { kind = 'line', dis = false } = {}) => btn(esc(busyLbl(act, label)), `data-p51o="${act}"${dis || O.busy ? ' disabled' : ''}`, kind);
const toneBan = (st) => ({ green: 'ok', yellow: 'warn', red: 'bad' }[st] ?? 'info');
const n2 = (v) => String(v ?? '–').replace('.', ',');
const msg66 = () => `${O.msg ? `<p class="ac-note">${esc(O.msg)}</p>` : ''}${O.err ? `<p class="ac-note bad" role="alert">${esc(O.err)}</p>` : ''}`;

/** Backup-cellen i KPI-stripen på System → Oversikt: [verdi, undertekst, tone]. */
export function backupKpi66(onChange) {
  if (!admin()) return { v: '–', s: '', tone: '' };
  if (onChange && !O.s) R = onChange;
  load();
  const b = O.s?.backup;
  if (!b) return { v: '–', s: O.err ? 'ikke tilgjengelig' : 'henter …', tone: '' };
  return { v: b.lastOkAt ? when(b.lastOkAt).replace(' siden', '') : 'Aldri', s: b.status === 'green' ? '3-2-1 i orden' : b.title, tone: b.status === 'red' ? 'bad' : b.status === 'yellow' ? 'warn' : '' };
}

const TARGET_IC = { local: 'hdd', nas: 'server', offsite: 'cloud' };
function backupHtml(b) {
  const run = b.running, r = b.rule321;
  const ban = banner(toneBan(b.status), b.title, `3-2-1: ${r.copies} kopier · ${r.media} medier · ${r.offsite ? 'én utenfor huset' : 'ingen utenfor huset'}`, b66('settings', O.setOpen ? 'Lukk oppsett' : 'Oppsett'));
  const issues = b.issues.length ? `<ul class="sys66-is">${b.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const tg = b.targets.map((t, i) => row66({ ic: TARGET_IC[t.id] ?? 'hdd', dot: t.lastState === 'failed' ? 'bad' : t.lastOkAt ? 'ok' : 'off', t: t.label, s: `${t.repo} · ${t.lastOkAt ? `siste backup ${when(t.lastOkAt)}` : 'ingen backup ennå'}${t.lastError ? ` · ${t.lastError}` : ''}`, sc: t.lastError ? 'warn' : '',
    right: i === 0 ? b66('run', 'Ta backup nå', { kind: 'ink', dis: !!run }) : '' }));
  if (!b.targets.length) tg.push(row66({ ic: 'hdd', dot: 'off', t: 'Lokal disk', s: 'Ingen backupmål er slått på', right: b66('run', 'Ta backup nå', { kind: 'ink', dis: true }) }));
  if (run) tg.push(row66({ ic: 'refresh', dot: 'busy', t: run.kind === 'backup' ? 'Backup pågår …' : 'Tester gjenoppretting …', s: 'Du kan bruke Homelab mens den går.' }));
  tg.push(row66({ ic: 'clock', dot: b.enabled ? 'ok' : 'off', t: 'Automatisk restic-backup hver natt', s: `restic${b.restic?.version ? ` ${b.restic.version}` : ''}${b.restic?.available === false ? ` · ${b.restic.error ?? 'restic mangler'}` : ''}`, sc: b.restic?.available === false ? 'warn' : '',
    right: swb(b.enabled, `data-p51o="autotog"${O.busy ? ' disabled' : ''}`, 'Automatisk restic-backup hver natt') }));
  if (!b.targets.some((t) => t.id === 'offsite')) tg.push(row66({ ic: 'cloud', dot: 'off', t: 'Utenfor huset', s: 'Ikke satt opp · Backblaze B2 eller S3, kryptert før det forlater serveren', right: b66('settings', 'Sett opp') }));
  // Gjenoppretting: de fem stegene som prikk-rader (siste test, eller stegene som kjøres neste gang).
  const t = b.restoreTest;
  const tst = !t ? 'warn' : t.state === 'ok' ? (Date.now() - t.at > 8 * 86400_000 ? 'warn' : 'ok') : t.state === 'running' ? 'busy' : 'bad';
  const STEPS = [['snapshot', 'Finner siste snapshot', 'box'], ['restore', 'Gjenoppretter til en temp-mappe', 'down'], ['integrity', 'Åpner databasene og sjekker integriteten', 'db'], ['start', 'Starter serveren mot kopien', 'play'], ['smoke', 'Røyktest mot kopien', 'flask']];
  const icOf = (k) => STEPS.find((x) => x[0] === k)?.[2] ?? (k === 'check' ? 'search' : 'dot');
  const steps = (t?.steps?.length ? t.steps.map((s) => [s.key, s.label, s.state, s.error || s.detail || '']) : STEPS.map(([k, l]) => [k, l, 'pending', 'Ikke kjørt ennå']))
    .map(([k, l, st, d]) => row66({ ic: icOf(k), dot: tone66(st), t: l, s: d, sc: st === 'failed' ? 'warn' : '' })).join('');
  const head = row66({ ic: 'flask', dot: tst, t: !t ? 'Gjenoppretting ikke testet' : t.state === 'ok' ? `Testet ${when(t.at)}` : t.state === 'running' ? 'Tester gjenoppretting …' : 'Gjenopprettingstesten feilet',
    s: t?.error || 'Hver søndag 04:10: siste snapshot gjenopprettes til en temp-mappe og røyktestes på egen port.', sc: t?.error ? 'warn' : '', right: b66('restore', 'Test nå', { dis: !!run || !b.targets.length }) });
  return `${ban}${issues}${sec('KOPIER', tg.join(''), { right: `${b.copies} ${b.copies === 1 ? 'fersk kopi' : 'ferske kopier'}` })}${sec('GJENOPPRETTING', head + steps)}`;
}
function dbHtml(d) {
  const li = d.lastIntegrity;
  return sec('DATABASE', [
    row66({ ic: 'db', dot: tone66(d.status), t: d.title, s: `${n2(d.sizeMb)} MB · WAL ${n2(d.walMb)} MB · ${n2(d.freePct)} % ledig plass i fila${d.walWarn ? ` · ${d.walWarn}` : ''}`, sc: d.walWarn ? 'warn' : '' }),
    row66({ ic: 'check', dot: li ? (li.ok ? 'ok' : 'bad') : 'off', t: 'Integritet', s: li ? `${li.ok ? 'OK' : 'FEIL'} · sjekket ${when(li.at)}` : 'Ikke sjekket ennå', right: b66('integrity', 'Sjekk integritet') }),
    row66({ ic: 'refresh', dot: d.lastVacuum ? 'ok' : 'off', t: 'VACUUM og vedlikehold', s: `Sist: ${d.lastVacuum ? when(d.lastVacuum.at) : 'aldri'} · hver søndag 04:40`, right: b66('vacuum', 'Vedlikehold nå') }),
  ].join(''));
}
function updatesHtml(u) {
  const s = u.staging, job = u.job, run = s?.state === 'running' || ['downloading', 'building'].includes(job?.state);
  const ch = u.channel ? (u.channel.staging ? 'Staging er på: nye versjoner røyktestes i en kopi før byttet' : 'Av for vanlige oppdateringer (UPDATE_STAGING=0) – du kan fortsatt prøve en versjon') : 'Updateren har ikke staging ennå – kommer med neste oppdatering';
  const ver = s?.version ?? '';
  const stTag = { running: 'KJØRER', ready: 'KLAR', failed: 'FEILET', promoted: 'BYTTET', discarded: 'FORKASTET' }[s?.state] ?? '';
  const smoke = (s?.smoke ?? []).map((x) => row66({ ic: 'flask', dot: x.ok ? 'ok' : 'bad', t: x.name, s: x.detail ?? '' })).join('');
  const actions = [
    !s || ['promoted', 'discarded', 'failed'].includes(s.state) ? b66('stage', 'Prøv ny versjon i staging', { dis: run || !u.updaterAvailable || u.updating }) : '',
    s?.canPromote ? b66('promote', `Bytt til ${ver || 'versjonen i staging'}`, { kind: 'ink', dis: u.updating }) : '',
    s && ['ready', 'failed', 'running'].includes(s.state) && !run ? b66('discard', 'Forkast', { kind: 'red' }) : '',
  ].join('');
  const prev = row66({ ic: 'undo', dot: u.previous ? 'ok' : 'off', t: 'Tilbakerulling', s: u.previous ? `Forrige versjon ${u.previous.version ?? u.previous.sha.slice(0, 7)} er beholdt · ett trykk, ingen nedlasting eller bygging` : 'Ingen forrige versjon lagret ennå (lagres ved neste oppdatering)',
    right: u.previous ? b66('rollback-image', `Gå tilbake til ${u.previous.version ?? 'forrige'}`, { dis: run || u.updating || !u.updaterAvailable }) : '' });
  const notes = [
    job?.state && job.state !== 'done' ? `${job.step ?? ''}${job.error ? ` · ${job.error.split('\n')[0]}` : ''}` : '',
    s?.port && s.state === 'ready' ? `Staging kan åpnes på port ${s.port} på serveren.` : '',
    !u.updaterAvailable ? 'Updateren svarer ikke.' : '',
  ].filter(Boolean).map((x) => `<p class="ac-note">${esc(x)}</p>`).join('');
  const panel = `${smoke ? `<div class="ac-list">${smoke}</div>` : '<p class="ac-note">Røyktest-sjekkene vises her når en versjon er prøvd i staging.</p>'}${s?.error ? `<p class="ac-note bad">${esc(s.error)}</p>` : ''}${notes}${actions ? `<span class="ac-btns">${actions}</span>` : ''}<div class="ac-list">${prev}</div>`;
  const stg = xrow66('upd.staging', { ic: 'flask', dot: tone66(s?.state === 'ready' ? 'ok' : s?.state === 'failed' ? 'failed' : s?.state === 'running' ? 'running' : u.status), t: 'Staging', tag: stTag, s: ver ? `${ver} · ${ch}` : ch }, panel, !!s && ['running', 'ready', 'failed'].includes(s.state));
  return sec('STAGING OG TILBAKERULLING', stg, { right: u.title });
}

function pwHtml() {
  if (!O.pwFor) return '';
  const what = { key: 'vise repo-passordet', stage: 'prøve i staging', promote: 'bytte versjon', 'rollback-image': 'gå tilbake', save: 'bytte repo-passord' }[O.pwFor] ?? 'fortsette';
  return sec('BEKREFT', `<form class="ac-form sys66-form" data-p51o-form="pw"><p class="ac-note">Bekreft med passordet ditt for å ${esc(what)}.</p>${fld('Passord', '<input type="password" name="pw" autocomplete="current-password" required>')}
    <span class="ac-btns"><button type="submit" class="ac-b ink">Bekreft</button>${btn('Avbryt', 'data-p51o="pwcancel"')}</span></form>`);
}
function keyHtml() {
  if (!O.key) return '';
  return sec('REPO-PASSORDET', `${row66({ ic: 'key', t: 'Ta vare på det et trygt sted', s: 'Uten det kan ingen backup gjenopprettes på en ny server.', right: `${btn('Kopier', 'data-p51o="keycopy"')}${btn('Skjul', 'data-p51o="keyhide"')}` })}
    <div class="ac-pad"><code class="sys66-key" data-no-i18n>${esc(O.key)}</code></div>`);
}
function settingsHtml() {
  if (!O.setOpen) return '';
  const s = O.set;
  if (!s) return sec('OPPSETT AV BACKUP', row66({ ic: 'sliders', dot: O.setErr ? 'bad' : 'busy', t: O.setErr ? 'Fikk ikke hentet oppsettet' : 'Henter oppsettet …', s: O.setErr }));
  const t = s.targets;
  const ck = (name, on, label) => `<label class="sys66-ck"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const inp = (name, v, ph, type = 'text') => `<input name="${name}"${type !== 'text' ? ` type="${type}"` : ''} value="${esc(v ?? '')}" placeholder="${esc(ph ?? '')}" autocomplete="${type === 'password' ? 'new-password' : 'off'}">`;
  const grp = (n) => `<span class="ac-lab sys66-fh">${esc(n)}</span>`;
  return sec('OPPSETT AV BACKUP', `<form class="ac-form sys66-form" data-p51o-form="settings">
    ${ck('enabled', s.enabled, 'Automatisk backup hver natt')}
    ${fld('Klokkeslett', `<input name="time" value="${esc(s.time)}" pattern="[0-2][0-9]:[0-5][0-9]" inputmode="numeric">`)}
    ${ck('restoreTest', s.restoreTest, 'Test gjenoppretting hver søndag')}
    ${grp('1 · Lokal disk')}${ck('local.enabled', t.local.enabled, 'På')}
    ${fld('Mappe', inp('local.repo', t.local.repo, s.defaults?.localRepo ?? '/srv/backup/restic51'))}
    ${grp('2 · NAS')}${ck('nas.enabled', t.nas.enabled, 'På')}
    ${fld('Mappe/adresse', inp('nas.repo', t.nas.repo, '/mnt/nas/nordlys eller rest:https://nas.lan:8000/nordlys'))}
    <p class="ac-note">Monter NAS-sharen (SMB/NFS) på serveren og velg stien, eller bruk restic rest-server på NAS-en.</p>
    ${fld('Bruker', inp('nas.user', '', t.nas.userSet ? '•••• (lagret)' : 'rest-server, valgfritt'))}
    ${fld('Passord', inp('nas.pass', '', t.nas.passSet ? '•••• (lagret – fyll inn for å bytte)' : 'rest-server, valgfritt', 'password'))}
    ${grp('3 · Utenfor huset (valgfritt)')}${ck('offsite.enabled', t.offsite.enabled, 'På')}
    ${fld('Adresse', inp('offsite.repo', t.offsite.repo, 'b2:bøtte:nordlys eller s3:https://…/bøtte'))}
    ${fld('Nøkkel-ID', inp('offsite.accountId', '', t.offsite.accountIdSet ? '•••• (lagret)' : 'Backblaze keyID / S3 access key'))}
    ${fld('Nøkkel', inp('offsite.accountKey', '', t.offsite.accountKeySet ? '•••• (lagret – fyll inn for å bytte)' : 'applicationKey / secret', 'password'))}
    <p class="ac-note">Alt krypteres av restic med repo-passordet før det forlater serveren. Nøklene lagres kryptert og vises aldri igjen.</p>
    ${O.setErr ? `<p class="ac-note bad" role="alert">${esc(O.setErr)}</p>` : ''}
    <span class="ac-btns"><button type="submit" class="ac-b ink">Lagre</button>${s.keySet ? btn('Vis repo-passord', 'data-p51o="key"') : ''}</span>
    <p class="ac-note">${s.restic?.available ? `restic ${esc(s.restic.version ?? '')} er installert.` : esc(s.restic?.error ?? 'restic mangler')}</p></form>`);
}

/** Prompt 65/66: Backup er egen side og oppdateringene egen fane i System. part = 'backup' (banner, kopier, gjenoppretting,
 *  database, oppsett og repo-passord – med egen .sys66-rot) eller 'updates' (staging og tilbakerulling, inni System-roten).
 *  Passordskjemaet vises der handlingen hører hjemme. */
const PW_UPD65 = new Set(['stage', 'promote', 'rollback-image']);
export function ops51PartHtml(part, onChange) {
  if (!admin()) return '';
  if (onChange) { R = onChange; setR66(onChange); }
  load();
  const s = O.s, upd = part === 'updates';
  const wrap = (h) => (upd ? h : root66(h, 'sys66-bak'));
  if (!s) return wrap(O.err ? banner('bad', upd ? 'Staging og tilbakerulling' : 'Backup', O.err, b66('refresh', 'Prøv igjen')) : sec('', row66({ ic: 'refresh', dot: 'busy', t: 'Henter …' })));
  const pw = O.pwFor && PW_UPD65.has(O.pwFor) === upd ? pwHtml() : '';
  return upd ? `${updatesHtml(s.updates)}${pw}${msg66()}`
    : wrap(`${backupHtml(s.backup)}${settingsHtml()}${pw}${keyHtml()}${dbHtml(s.db)}${msg66()}<p class="ac-note sys66-foot">${lnk66(O.loading ? 'Henter …' : 'Oppdater status', `data-p51o="refresh"${O.loading ? ' disabled' : ''}`)}</p>`);
}

async function act(a, extra = {}) {
  O.busy = a; O.msg = ''; O.err = ''; R();
  try {
    if (a === 'run') { await post('/backup/run'); O.msg = 'Backupen er startet.'; }
    else if (a === 'restore') { await post('/backup/restore-test'); O.msg = 'Gjenopprettingstesten er startet. Den tar et par minutter.'; }
    else if (a === 'integrity' || a === 'vacuum') { const r = await post('/db/maintenance', { kind: a === 'vacuum' ? 'weekly' : 'integrity' }); O.msg = r.result.ok ? (a === 'vacuum' ? 'Vedlikeholdet er ferdig.' : 'Integriteten er ok.') : r.result.error; }
    else if (a === 'autotog') { const ns = await j('/backup/settings', { method: 'PUT', body: JSON.stringify({ enabled: !O.s?.backup?.enabled }) }); if (O.set && ns) O.set = ns; O.msg = O.s?.backup?.enabled ? 'Automatisk backup er slått av.' : 'Automatisk backup er slått på.'; } // prompt 66: restic-bryteren
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
