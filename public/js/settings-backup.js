// Innstillinger → Backup (prompt 29, claude-code-backup.md, fasit «Mobil Papir App.dc.html» → Innstillinger → Backup).
// Systembackup er serveroppsett: bare admin ser og endrer. Fem seksjoner: STATUS, AUTOMATISK, HVA SKAL TAS MED, HVOR,
// GJENOPPRETT. API (server/system-backup.js): GET/PUT /api/backup/settings, POST /api/backup/run, GET /api/backup/status,
// GET /api/backup/list, POST /api/backup/key, POST /api/backup/restore {id, modules, password}, GET /api/backup/:id/download.
// 404 (eldre server) → «ikke tilgjengelig». Under en kjøring hentes status hvert 1,5 s.
import { esc } from './util.js';
import { store } from './store.js';
import { fmtDate, fmtTime } from './i18n.js';

const BASE = '/api/backup';
export const MODULES = [
  ['finans', 'Finans', 'Transaksjoner, kvitteringer, budsjett, abonnementer'], ['kalender', 'Kalender', 'Egne hendelser og påminnelser'],
  ['familie', 'Familie', 'Posisjoner, soner og helse'], ['mat', 'Mat', 'Oppskrifter og ukeplan'], ['sporing', 'Sporing', 'Pakker og historikk'],
  ['huske', 'Huskeliste', 'Lister og oppgaver'], ['bursdager', 'Bursdager', ''], ['chat', 'Chat', 'Samtaler og kunnskapsbase'],
  ['domener', 'Domener', 'Oppsett og statistikk'], ['innstillinger', 'Innstillinger og brukere', 'Kontoer, tokens og regler'], ['filer', 'Bilder og filer', 'Kvitteringsbilder og vedlegg'],
];
const MOD_IDS = MODULES.map((m) => m[0]);
const FREQ = [['nightly', 'Hver natt 03:00'], ['6h', 'Hver 6. time'], ['weekly', 'Hver uke (søndag)'], ['monthly', 'Hver måned']];
const KEEP = [['7', '7 siste'], ['30', '30 siste'], ['90d', '90 dager'], ['1y', '1 år']];
const SCOPES = [['all', 'Hele systemet'], ['finans', 'Bare Finans'], ['custom', 'Egendefinert']];
const DEF = { auto: true, schedule: 'nightly', keep: '30', notifyFail: true, scope: 'all', modules: MOD_IDS, target: { local: true, path: '/srv/backup' }, cloud: { enabled: false, provider: 'b2' }, encrypt: true, keySet: false };

/** st: idle | loading | ok | missing | forbidden | error */
const B = { st: 'idle', s: null, list: [], status: null, err: '', msg: '', saving: false, key: null, copied: false, restore: null, keySheet: null, poll: 0, wasRunning: false };
let rerender = () => {};
const admin = () => store.me?.me?.role === 'admin';

async function req(path, opts = {}) {
  const init = { cache: 'no-store', credentials: 'same-origin', method: opts.method ?? 'GET', headers: {} };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASE + path, init);
  const d = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null;
  if (!r.ok) throw Object.assign(new Error(d?.error || `Serveren svarte ${r.status}`), { status: r.status, data: d });
  return d;
}

const norm = (s) => {
  const x = { ...DEF, ...(s ?? {}) };
  x.target = { ...DEF.target, ...(s?.target ?? {}) };
  x.cloud = { ...DEF.cloud, ...(s?.cloud ?? {}) };
  x.modules = Array.isArray(x.modules) ? x.modules.filter((m) => MOD_IDS.includes(m)) : [...MOD_IDS];
  return x;
};
const listOf = (d) => (Array.isArray(d) ? d : d?.items ?? d?.backups ?? []);
/** Pågående jobb fra /status, uansett form ({running:{pct}} | {current} | {job}). */
const runningJob = () => { const s = B.status; const j = s?.running ?? s?.current ?? s?.job ?? null; return j && (j.state == null || j.state === 'running' || j.state === 'queued') && !j.finishedAt ? j : null; };
const lastJob = () => B.status?.last ?? B.status?.latest ?? B.list[0] ?? null;

export function loadBackup(onChange) {
  if (onChange) rerender = onChange;
  if (!admin()) return;
  if (B.st === 'loading') return;
  if (B.st === 'idle') B.st = 'loading';
  Promise.all([req('/settings'), req('/list').catch(() => []), req('/status').catch(() => null)]).then(([s, l, st]) => {
    B.s = norm(s); B.list = listOf(l); B.status = st; B.st = 'ok'; B.err = '';
    if (runningJob()) watch();
    rerender();
  }).catch((e) => {
    B.st = e.status === 404 || e.status === 405 ? 'missing' : e.status === 401 || e.status === 403 ? 'forbidden' : B.s ? 'ok' : 'error';
    B.err = e.message; rerender();
  });
}

function watch() {
  B.wasRunning = true;
  if (B.poll) return;
  B.poll = setInterval(async () => {
    try { B.status = await req('/status'); } catch { /* prøver igjen */ }
    if (!runningJob()) {
      clearInterval(B.poll); B.poll = 0;
      B.list = listOf(await req('/list').catch(() => B.list));
      const L = lastJob();
      if (B.wasRunning) flash(L && L.ok === false ? `Backup feilet${L.error ? `: ${L.error}` : ''}` : '✓ Backup ferdig');
      B.wasRunning = false;
    }
    if (!document.getElementById('settings')?.hidden) rerender();
  }, 1500);
}
let msgT = 0;
function flash(t) { B.msg = t; clearTimeout(msgT); msgT = setTimeout(() => { B.msg = ''; rerender(); }, 4000); }

async function save(patch, errAt = 'status') {
  B.s = norm({ ...B.s, ...patch });
  B.saving = true; rerender();
  try { B.s = norm(await req('/settings', { method: 'PUT', json: patch })); B.err = ''; B.errAt = ''; }
  catch (e) { B.err = e.message; B.errAt = errAt; B.s = norm(await req('/settings').catch(() => B.s)); }
  B.saving = false; rerender();
}

/* ---------------- Tekster ---------------- */

const size = (n) => { n = Number(n); if (!Number.isFinite(n) || n <= 0) return ''; const u = ['B', 'kB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return `${(n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10).toString().replace('.', ',')} ${u[i]}`; };
const when = (t) => {
  const d = new Date(typeof t === 'number' && t < 1e11 ? t * 1000 : t);
  if (Number.isNaN(+d)) return '';
  const now = new Date(), days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5), tm = fmtTime(d);
  if (now - d < 5 * 60_000) return 'Nå nettopp';
  if (days === 0) return d.getHours() < 6 && now.getHours() >= 6 ? `I natt ${tm}` : `I dag ${tm}`;
  if (days === 1) return `I går ${tm}`;
  return `${fmtDate(d, { day: '2-digit', month: '2-digit' })} ${tm}`;
};
const nextTxt = (t) => { const d = new Date(t); if (Number.isNaN(+d)) return ''; const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5); return `${days === 0 ? 'i dag' : days === 1 ? 'i morgen' : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(d)}`; };
const scopeName = (x) => { const sc = x?.scope ?? 'all'; if (sc === 'custom' && Array.isArray(x?.modules)) return x.modules.length === MOD_IDS.length ? 'Hele systemet' : x.modules.map((m) => MODULES.find((y) => y[0] === m)?.[1] ?? m).slice(0, 3).join(', ') + (x.modules.length > 3 ? ` +${x.modules.length - 3}` : ''); return SCOPES.find((s) => s[0] === sc)?.[1] ?? 'Hele systemet'; };
const atOf = (x) => x?.at ?? x?.finishedAt ?? x?.finished ?? x?.startedAt ?? x?.started;
export const backupSummary = () => (!B.s ? '' : B.s.auto ? `${FREQ.find((f) => f[0] === B.s.schedule)?.[1] ?? ''} · ${scopeName(B.s)}` : 'Automatisk av');

/* ---------------- Siden ---------------- */

const opts = (list, v) => list.map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(n)}</option>`).join('');
const sel = (name, list, v, dis = false) => `<select class="bk-sel" data-bk-sel="${name}"${dis ? ' disabled' : ''}>${opts(list, v)}</select>`;
const seg = (name, list, v) => `<span class="kal-seg bk-seg" role="group">${list.map(([k, n]) => `<button type="button" class="kal-seg-b" data-bk-seg="${name}:${k}" aria-pressed="${k === v}">${esc(n)}</button>`).join('')}</span>`;
const tog = (h, o) => h.row({ ...o, act: `data-bk-tog="${o.key}"`, tog: !!o.on });

export function backupView(h) {
  const k = 'backup sikkerhetskopi gjenopprett restore automatisk kryptering sky b2';
  if (!admin()) return { groups: [h.group('Backup', [h.row({ t: 'Bare for administrator', k, s: 'Backup av hele systemet styres av en administrator.' })])] };
  if (B.st === 'idle' || B.st === 'loading') return { groups: [h.group('Status', [h.row({ t: 'Backup', k, v: 'Laster …' })])] };
  if (B.st === 'missing') return { groups: [h.group('Status', [h.row({ t: 'Backup av hele systemet', k, v: 'Ikke tilgjengelig', s: 'Serveren har ikke systembackup ennå. Oppdater serveren under System.' })])] };
  if (B.st === 'forbidden') return { groups: [h.group('Status', [h.row({ t: 'Backup', k, v: 'Ikke tilgjengelig', s: 'Bare administrator kan se og kjøre backup.' })])] };
  if (B.st === 'error' || !B.s) return { groups: [h.group('Status', [h.row({ t: 'Backup', k, v: 'Ikke tilgjengelig', s: B.err || 'Fikk ikke kontakt med serveren.', btn: 'Prøv igjen', act: 'data-bk="reload"' })])] };

  const S = B.s, run = runningJob(), L = lastJob(), custom = S.scope === 'custom';
  const inc = (m) => (S.scope === 'all' ? true : S.scope === 'finans' ? m === 'finans' : S.modules.includes(m));
  const pct = Math.max(0, Math.min(100, Math.round(Number(run?.pct ?? run?.progress ?? 0))));
  const lastTxt = L ? [when(atOf(L)), size(L.size), scopeName(L)].filter(Boolean).join(' · ') : 'Ingen backup ennå';

  const status = [
    h.row({ t: 'Siste backup', k, s: lastTxt, v: !L ? '' : L.ok === false ? 'Feilet' : '✓ OK', vc: L?.ok === false ? 'var(--bk-neg)' : 'var(--bk-pos)' }),
    L?.ok === false && L.error ? `<div class="sg-row bk-err" data-no-i18n>${esc(L.error)}</div>` : '',
    run ? `<div class="sg-row bk-run" role="status" aria-live="polite"><span class="sg-txt"><b>Tar backup … ${pct} %</b><span>Du kan lukke appen, den fortsetter i bakgrunnen.</span><span class="bk-bar"><i style="width:${pct}%"></i></span></span></div>`
      : h.row({ t: 'Ta backup nå', s: scopeName(S), btn: 'Start', act: 'data-bk="run"' }),
    B.msg ? `<div class="sg-row bk-msg" role="status">${esc(B.msg)}</div>` : '',
  ];
  const auto = [
    tog(h, { t: 'Automatisk backup', k: 'automatisk', s: 'Kjører i bakgrunnen på hjemmeserveren.', key: 'auto', on: S.auto }),
    S.auto ? `<div class="sg-row"><span class="sg-txt"><b>Hvor ofte</b><span>${B.status?.next ? `Neste: ${esc(nextTxt(B.status.next))}` : 'Tidspunkt i Europe/Oslo.'}</span></span>${sel('schedule', FREQ, S.schedule)}</div>` : '',
    S.auto ? `<div class="sg-row"><span class="sg-txt"><b>Behold</b><span>Eldre backuper slettes automatisk.</span></span>${sel('keep', KEEP, S.keep)}</div>` : '',
    S.auto ? tog(h, { t: 'Varsle meg når backup feiler', s: 'Push og e-post til administrator.', key: 'notifyFail', on: S.notifyFail }) : '',
  ];
  const what = [
    `<div class="sg-row bk-wrap"><span class="sg-txt"><b>Omfang</b><span>${S.scope === 'all' ? 'Alle moduler, filer og innstillinger.' : S.scope === 'finans' ? 'Bare Finans-data og kvitteringer.' : 'Velg moduler under.'}</span></span>${seg('scope', SCOPES, S.scope)}</div>`,
    ...MODULES.map(([id, n, sd]) => `<button type="button" class="sg-row bk-mod${inc(id) ? ' on' : ''}" data-bk-mod="${id}" role="checkbox" aria-checked="${inc(id)}"${custom ? '' : ' disabled'}><span class="bk-cb" aria-hidden="true">✓</span><span class="sg-txt"><b>${esc(n)}</b>${sd ? `<span>${esc(sd)}</span>` : ''}</span><span class="sg-v">${inc(id) ? 'Med' : 'Ikke med'}</span></button>`),
  ];
  const cloud = S.cloud ?? {}, gUnsupported = (cloud.providers ?? []).find((x) => x.id === 'gdrive')?.supported === false || cloud.supported === false;
  const b2 = (cloud.enabled || B.cloudOpen) && cloud.provider !== 'gdrive';
  const fld = (name, label, v, ph, secret = false) => `<label class="sg-field"><span>${esc(label)}</span><input name="${name}" data-bk-cl="${name}" type="${secret ? 'password' : 'text'}" value="${secret ? '' : esc(v ?? '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"></label>`;
  const where = [
    h.row({ t: 'Lagres på', s: `Homelab-disk · ${S.target?.path || '/srv/backup'}`, v: 'Lokal' }),
    tog(h, { t: 'Krypter backup', k: 'kryptering aes nøkkel', s: 'AES-256 · gjenopprettingsnøkkelen vises én gang.', key: 'encrypt', on: S.encrypt }),
    S.encrypt || S.keySet ? h.row({ t: 'Gjenopprettingsnøkkel', s: S.keySet ? 'Lagret. Lag en ny hvis du har mistet den (eldre backuper trenger den gamle).' : 'Ikke laget ennå. Kreves for kryptering.', btn: S.keySet ? 'Ny nøkkel' : 'Lag nøkkel', act: 'data-bk="key"' }) : '',
    B.key ? `<div class="sg-row bk-key"><span class="sg-txt"><b>Skriv ned nøkkelen nå</b><span>Den vises bare denne ene gangen. Uten den kan krypterte backuper ikke gjenopprettes andre steder.</span><code data-no-i18n>${esc(B.key)}</code></span><button type="button" class="sg-btn" data-bk="copy">${B.copied ? 'Kopiert ✓' : 'Kopier'}</button></div>` : '',
    tog(h, { t: 'Kopi til sky', k: 'sky b2 backblaze google drive', s: S.encrypt ? (cloud.enabled ? 'Krypteres før opplasting.' : B.cloudOpen ? 'Fyll inn bøtte og endepunkt, så slås kopien på.' : 'Krypteres før opplasting.') : 'Slå på kryptering først. Ukryptert sendes aldri til sky.', key: 'cloud', on: !!cloud.enabled || !!B.cloudOpen }),
    cloud.enabled || B.cloudOpen ? `<div class="sg-row bk-wrap"><span class="sg-txt"><b>Tjeneste</b><span>${cloud.provider === 'gdrive' && gUnsupported ? 'Google Drive kommer.' : cloud.lastError ? `Siste opplasting feilet: ${esc(cloud.lastError)}` : cloud.lastUpload ? `Sist lastet opp ${esc(when(cloud.lastUpload))}.` : cloud.provider === 'gdrive' ? 'Via Google-koblingen fra Bursdager.' : cloud.keySet ? 'Nøklene er lagret på serveren.' : 'Legg inn bøtte og nøkler fra Backblaze.'}</span></span>
      <span class="kal-seg bk-seg" role="group"><button type="button" class="kal-seg-b" data-bk-seg="provider:b2" aria-pressed="${cloud.provider !== 'gdrive'}">Backblaze B2</button><button type="button" class="kal-seg-b" data-bk-seg="provider:gdrive" aria-pressed="${cloud.provider === 'gdrive'}"${gUnsupported ? ' disabled' : ''}>Google Drive${gUnsupported ? ' · Kommer' : ''}</button></span></div>` : '',
    b2 ? fld('bucket', 'Bøtte', cloud.bucket, 'homelab-backup') : '',
    b2 ? fld('endpoint', 'Endepunkt', cloud.endpoint, 's3.eu-central-003.backblazeb2.com') : '',
    b2 ? fld('keyId', 'Nøkkel-ID', '', cloud.keySet ? '•••••••• lagret' : 'keyID fra Backblaze', true) : '',
    b2 ? fld('appKey', 'Applikasjonsnøkkel', '', cloud.keySet ? '•••••••• lagret' : 'applicationKey', true) : '',
  ];
  const ok = B.list.filter((x) => x.ok !== false);
  const restore = [
    ...(B.list.length ? B.list.filter((x) => x.kind !== 'safety' || B.list.length < 4).slice(0, 8).map((x) => h.row({ t: when(atOf(x)) || String(x.id), s: [size(x.size), scopeName(x), x.encrypted ? 'kryptert' : '', x.cloud ? 'i sky' : '', x.ok === false ? 'feilet' : ''].filter(Boolean).join(' · '), btn: 'Gjenopprett', act: `data-bk-restore="${esc(x.id)}"`, disabled: x.ok === false || !!run }))
      : [h.row({ t: 'Ingen backuper ennå', s: 'Ta en backup nå, eller vent på den automatiske.' })]),
    ok[0] ? `<a class="sg-row bk-dl" href="${BASE}/${encodeURIComponent(ok[0].id)}/download" download><span class="sg-txt"><b>Last ned siste backup</b><span>${esc([`.${ok[0].format || 'tar.gz'}`, ok[0].encrypted ? 'kryptert' : '', size(ok[0].size)].filter(Boolean).join(' · '))}</span></span><span class="sg-btn2">Last ned</span></a>` : '',
  ];
  const groups = [
    h.group('Status', status.filter(Boolean)),
    h.group('Automatisk', auto.filter(Boolean)),
    h.group('Hva skal tas med', what, S.scope !== 'custom' ? 'Modulene kan bare endres under Egendefinert.' : ''),
    h.group('Hvor', where.filter(Boolean), 'I Docker/Proxmox: monter /srv/backup som bind-mount (BACKUP_DIR).'),
    h.group('Gjenopprett', restore.filter(Boolean), 'Det tas automatisk en sikkerhetskopi før noe gjenopprettes.'),
  ];
  if (B.err) { const gi = { auto: 1, what: 2, where: 3 }[B.errAt] ?? 0; groups[gi].rows.unshift({ html: `<div class="sg-row bk-err" role="alert">${esc(B.err)}</div>`, q: '' }); }
  return { groups, extra: restoreSheet() + keySheet() };
}

/** Ny gjenopprettingsnøkkel når en finnes fra før: krever passordet. */
function keySheet() {
  const K = B.keySheet;
  if (!K) return '';
  return `<div class="upd-sheet-bg" data-bk="kclose"></div>
  <form class="upd-sheet bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-k-t" data-bk-kform>
    <h3 id="bk-k-t">Ny gjenopprettingsnøkkel</h3>
    <p>Nye backuper krypteres med den nye nøkkelen. Eldre krypterte backuper trenger fortsatt den gamle.</p>
    <label class="sg-field"><span>Passord</span><input type="password" name="bkkpw" autocomplete="current-password" placeholder="Ditt passord" data-bk-kpw required></label>
    ${K.err ? `<div class="upd-err" role="alert">${esc(K.err)}</div>` : ''}
    <div class="upd-btns"><button type="button" class="sg-btn" data-bk="kclose">Avbryt</button><button type="submit" class="sg-btn pri"${K.busy ? ' disabled' : ''}>${K.busy ? 'Lager …' : 'Lag ny nøkkel'}</button></div>
  </form>`;
}
async function makeKey(password) {
  try {
    const r = await req('/key', { method: 'POST', json: password ? { rotate: true, password } : {} });
    B.key = r?.key ?? null; B.copied = false; B.s = norm({ ...B.s, keySet: true }); B.keySheet = null; B.err = r?.key ? '' : 'Serveren viste ikke nøkkelen.';
  } catch (err) {
    if (B.keySheet) { B.keySheet.err = err.message; B.keySheet.busy = false; }
    else if (err.status === 409) B.keySheet = { err: '' };
    else B.err = err.message;
  }
  rerender();
}

function restoreSheet() {
  const R = B.restore;
  if (!R) return '';
  const x = B.list.find((y) => String(y.id) === String(R.id)) ?? {}, mods = Array.isArray(x.modules) && x.modules.length ? x.modules.filter((m) => MOD_IDS.includes(m)) : MOD_IDS;
  return `<div class="upd-sheet-bg" data-bk="rclose"></div>
  <form class="upd-sheet bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bk-sh-t" data-bk-form>
    <h3 id="bk-sh-t">Gjenopprett backup</h3>
    <p>${esc([when(atOf(x)), size(x.size), scopeName(x)].filter(Boolean).join(' · '))}</p>
    <div class="kal-seg bk-seg" role="group"><button type="button" class="kal-seg-b" data-bk-rall="1" aria-pressed="${R.all}">Hele backupen</button><button type="button" class="kal-seg-b" data-bk-rall="0" aria-pressed="${!R.all}">Velg moduler</button></div>
    ${R.all ? '' : `<div class="bk-chips">${mods.map((m) => `<button type="button" class="bk-chip${R.mods.includes(m) ? ' on' : ''}" data-bk-rmod="${m}" aria-pressed="${R.mods.includes(m)}">${esc(MODULES.find((y) => y[0] === m)?.[1] ?? m)}</button>`).join('')}</div>`}
    <div class="bk-warn"><b>Nåværende data overskrives.</b> Det tas automatisk en sikkerhetskopi først, så du kan angre ved å gjenopprette den.</div>
    <label class="sg-field"><span>Passord</span><input type="password" name="bkpw" value="${esc(R.pw)}" autocomplete="current-password" placeholder="Ditt passord" data-bk-pw required></label>
    ${R.needKey || x.encrypted ? `<label class="sg-field"><span>Nøkkel</span><input type="password" name="bkkey" value="${esc(R.key ?? '')}" autocomplete="off" placeholder="${R.needKey ? 'Gjenopprettingsnøkkelen' : 'Bare hvis nøkkelen er byttet'}" data-bk-key${R.needKey ? ' required' : ''}></label>` : ''}
    ${R.err ? `<div class="upd-err" role="alert">${esc(R.err)}</div>` : ''}
    ${R.done ? `<div class="bk-msg2" role="status">${esc(R.done)}</div>` : ''}
    <div class="upd-btns"><button type="button" class="sg-btn" data-bk="rclose">${R.done ? 'Lukk' : 'Avbryt'}</button>${R.done ? (R.reload ? '<button type="button" class="sg-btn pri" data-bk="reloadpage">Last siden på nytt</button>' : '') : `<button type="submit" class="sg-btn pri red"${R.busy ? ' disabled' : ''}>${R.busy ? 'Gjenoppretter …' : 'Gjenopprett'}</button>`}</div>
  </form>`;
}

export async function backupClick(e) {
  const t = e.target;
  const b = t.closest('[data-bk],[data-bk-tog],[data-bk-seg],[data-bk-mod],[data-bk-restore],[data-bk-rall],[data-bk-rmod]');
  if (!b || !t.closest('#settings')) return false;
  e.preventDefault();
  const d = b.dataset;
  if (d.bkTog) {
    const k = d.bkTog, S = B.s;
    const grp = k === 'auto' || k === 'notifyFail' ? 'auto' : 'where';
    if (k === 'cloud') {
      if (S.cloud.enabled) { B.cloudOpen = false; await save({ cloud: { enabled: false } }, grp); }
      else if (B.cloudOpen) { B.cloudOpen = false; rerender(); }
      else if (!S.encrypt) { B.err = 'Slå på kryptering før kopi til sky.'; B.errAt = grp; rerender(); }
      else if (S.cloud.provider !== 'gdrive' && S.cloud.bucket && S.cloud.endpoint) await save({ cloud: { enabled: true } }, grp);
      else { B.cloudOpen = true; B.err = ''; rerender(); }
    } else if (k === 'encrypt' && S.encrypt && S.cloud.enabled) await save({ encrypt: false, cloud: { enabled: false } }, grp);
    else if (k === 'encrypt' && !S.encrypt && !S.keySet) { await makeKey(''); if (B.s.keySet) await save({ encrypt: true }, grp); }
    else await save({ [k]: !S[k] }, grp);
    return true;
  }
  if (d.bkSeg) {
    const [k, v] = d.bkSeg.split(':');
    if (k === 'provider') { if (B.s.cloud.enabled || v !== 'gdrive') await save({ cloud: { provider: v } }, 'where'); }
    else await save({ [k]: v, ...(k === 'scope' && v === 'custom' && !B.s.modules.length ? { modules: [...MOD_IDS] } : {}) }, 'what');
    return true;
  }
  if (d.bkMod) { if (B.s.scope !== 'custom') return true; const m = new Set(B.s.modules); m.has(d.bkMod) ? m.delete(d.bkMod) : m.add(d.bkMod); if (!m.size) { B.err = 'Velg minst én modul.'; B.errAt = 'what'; rerender(); return true; } await save({ modules: MOD_IDS.filter((x) => m.has(x)) }, 'what'); return true; }
  if (d.bkRestore) { B.restore = { id: d.bkRestore, all: true, mods: [], pw: '', err: '', busy: false }; rerender(); setTimeout(() => document.querySelector('[data-bk-pw]')?.focus(), 30); return true; }
  if (d.bkRall && B.restore) { B.restore.all = d.bkRall === '1'; rerender(); return true; }
  if (d.bkRmod && B.restore) { const m = new Set(B.restore.mods); m.has(d.bkRmod) ? m.delete(d.bkRmod) : m.add(d.bkRmod); B.restore.mods = [...m]; rerender(); return true; }
  const a = d.bk;
  if (a === 'reload') { B.st = 'loading'; rerender(); loadBackup(); }
  else if (a === 'run') {
    B.err = '';
    try { await req('/run', { method: 'POST', json: { scope: B.s.scope, modules: B.s.scope === 'custom' ? B.s.modules : undefined } }); B.status = { ...(B.status ?? {}), running: { pct: 0, state: 'running' } }; watch(); }
    catch (err) { B.err = err.status === 409 ? 'En backup kjører allerede.' : err.message; }
    rerender();
  } else if (a === 'key') {
    if (B.s.keySet) { B.keySheet = { err: '' }; rerender(); setTimeout(() => document.querySelector('[data-bk-kpw]')?.focus(), 30); }
    else await makeKey('');
  } else if (a === 'kclose') { B.keySheet = null; rerender(); } else if (a === 'copy') { try { await navigator.clipboard.writeText(B.key ?? ''); B.copied = true; } catch { B.copied = false; } rerender(); }
  else if (a === 'rclose') { B.restore = null; rerender(); }
  else if (a === 'reloadpage') location.reload();
  return true;
}

export function backupChange(e) {
  const t = e.target;
  if (t.matches?.('[data-bk-cl]')) {
    const k = t.dataset.bkCl, v = t.value.trim();
    if ((k === 'keyId' || k === 'appKey') && !v) return true;
    // Når bøtte og endepunkt er fylt ut (og kryptering er på), slås kopien til sky på.
    const S = B.s, next = { ...S.cloud, [k]: v }, on = !!B.cloudOpen && !S.cloud.enabled && S.encrypt && next.bucket && next.endpoint;
    save({ cloud: { [k]: v, ...(on ? { enabled: true } : {}) } }, 'where').then(() => { if (B.s.cloud.enabled) B.cloudOpen = false; });
    return true;
  }
  if (!t.matches?.('[data-bk-sel]')) return false;
  save({ [t.dataset.bkSel]: t.value }, 'auto');
  return true;
}
export function backupInput(e) {
  if (e.target.matches?.('[data-bk-key]') && B.restore) { B.restore.key = e.target.value; return true; }
  if (!e.target.matches?.('[data-bk-pw]') || !B.restore) return false;
  B.restore.pw = e.target.value;
  return true;
}
export async function backupSubmit(e) {
  if (e.target.closest('[data-bk-kform]')) {
    e.preventDefault();
    const pw = e.target.querySelector('[data-bk-kpw]')?.value ?? '';
    if (!pw) { B.keySheet.err = 'Skriv inn passordet ditt.'; rerender(); return true; }
    B.keySheet.busy = true; rerender();
    await makeKey(pw);
    return true;
  }
  if (!e.target.closest('[data-bk-form]')) return false;
  e.preventDefault();
  const R = B.restore;
  if (!R) return true;
  R.pw = e.target.querySelector('[data-bk-pw]')?.value ?? R.pw;
  if (!R.pw) { R.err = 'Skriv inn passordet ditt.'; rerender(); return true; }
  if (!R.all && !R.mods.length) { R.err = 'Velg minst én modul.'; rerender(); return true; }
  const x = B.list.find((y) => String(y.id) === String(R.id)) ?? {};
  const modules = R.all ? (Array.isArray(x.modules) && x.modules.length ? x.modules : MOD_IDS) : R.mods;
  R.busy = true; R.err = ''; rerender();
  try {
    const r = await req('/restore', { method: 'POST', json: { id: R.id, modules, password: R.pw, ...(R.key ? { key: R.key } : {}) } });
    R.done = `✓ Gjenopprettet${r?.safetyId ? ' · sikkerhetskopi tatt først' : ''}.`; R.reload = true; R.pw = '';
    B.list = listOf(await req('/list').catch(() => B.list));
  } catch (err) { R.needKey = !!err.data?.needKey || R.needKey; R.err = err.status === 403 && /passord/i.test(err.message) ? 'Feil passord.' : err.message; }
  R.busy = false; rerender();
  return true;
}
/** Esc lukker arket før innstillingene. */
export function backupEsc() { if (!B.restore && !B.keySheet) return false; B.restore = null; B.keySheet = null; rerender(); return true; }
