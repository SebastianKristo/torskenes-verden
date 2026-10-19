// Innstillinger → System: «Nordlys OS» (prompt 31, claude-code-system-oppdatering-nordlys.md, fasit «Innstillinger Web.dc.html»
// → System). Bare admin. Erstatter de gamle radene «Se etter oppdatering →» / «Oppdater nå →».
// 1. Hero med nordlys-gradient og stort versjonstall («4.22»), status, NordlysOS, «Homelab · <vert>» og glass-pillen
//    «Se etter oppdatering». Under oppdatering: hvit fremdriftslinje, steget og prosent.
// 2. Stor blå knapp rett under hero (ikke sticky), forklaringen til høyre: Oppdater nå · Oppdaterer … % · Ferdig ·
//    Du har siste versjon.
// 3. Programvareversjon («4.22.0 · 5ea8cb0 · 48 MB» + «Du har 4.21.0» / «Installert») og bryteren «Krev passord for å
//    oppdatere» (av). Av: admin oppdaterer med ett trykk. På: «Bekreft med passord» før start.
// 4. «Dette er Nordlys 4.22. Lys i mørket, kjørt hjemme.» + «NYTT I 4.22.0 · dato» + punktene (tomme punkter hoppes over).
// Data: GET /api/system/update (sysupdate.js), GET /api/system/version (name, tagline, sizeBytes, notes) og
// GET/PUT /api/system/update/settings (require_password, auto_update, notify_updates).
import { esc } from './util.js';
import { store } from './store.js';
import { U, UPD_CMD, onUpdate, loadUpdate, checkUpdate, openSheet, startUpdate, toggleLog, copyCmd, running, state, verTxt, ms, shortSha } from './sysupdate.js';
import { progress, ackDone, doneRecent } from './upd-banner.js';

let rerender = () => {}, subscribed = false;
const admin = () => store.me?.me?.role === 'admin';
const pad = (n) => String(n).padStart(2, '0');
const dmy = (t) => { const d = new Date(ms(t) ?? t); return Number.isNaN(+d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const majMin = (v) => (v ? String(v).split('.').slice(0, 2).join('.') : '');
const mb = (b) => (b > 0 ? `${Math.max(1, Math.round(b / 1048576))} MB` : '');
const host = () => { try { return location.host || 'hjemmeserveren'; } catch { return 'hjemmeserveren'; } };

/* Versjonssvaret (navn, slagord, størrelse, punkter). */
const V = { d: null, loading: false };
function loadVersion(force = false) {
  if (V.loading || (V.d && !force)) return;
  V.loading = true;
  fetch(`/api/system/version${force ? '?force=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) V.d = j; }).catch(() => {}).finally(() => { V.loading = false; rerender(); });
}

export function loadSystem(onChange) {
  if (onChange) rerender = onChange;
  if (!subscribed) { subscribed = true; onUpdate(() => rerender()); }
  if (admin()) { loadUpdate(); loadVersion(); settings30(); }
}

/** Kreves passord? Serveren sier det i settings.require_password (eldre server: aldri spurt, 403 gir passordarket). */
export const requirePw = () => SET.require_password === true || U.d?.settings?.require_password === true;

/** Tilstanden siden viser. */
function phase() {
  const d = U.d;
  if (U.st === 'idle' || U.st === 'loading') return 'loading';
  if (U.st !== 'ok' || !d) return 'error';
  if (running() || U.reloading) return 'run';
  if (U.checking) return 'checking';
  const st = state();
  if (st === 'failed') return 'fail';
  if (doneRecent()) return 'done';
  if (d.updateAvailable) return d.available === false ? 'setup' : 'avail';
  return 'fresh';
}
const STEP_TXT = { backup: 'Tar backup av databasen …', download: 'Laster ned {v} …', install: 'Bygger …', restart: 'Starter serveren på nytt …' };

function heroHtml(ph, d) {
  const inst = d?.installed ?? {}, lat = d?.latest ?? {};
  const shown = ph === 'avail' || ph === 'setup' || ph === 'run' || ph === 'checking' && d?.updateAvailable ? lat.version || inst.version : inst.version || lat.version;
  const big = majMin(shown) || '–';
  const stTxt = { loading: 'Henter versjon …', error: 'Fikk ikke kontakt med oppdateringen', run: U.reloading ? 'Ny versjon svarer …' : 'Oppdaterer …', checking: 'Ser etter oppdatering …', fail: 'Oppdateringen feilet', done: 'Oppdatert', avail: 'Oppdatering tilgjengelig', setup: 'Oppdatering tilgjengelig', fresh: 'Du har siste versjon' }[ph];
  let prog = '';
  if (ph === 'run') {
    const p = progress();
    prog = `<div class="ny-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><span class="ny-bar"><span style="width:${p.pct}%"></span></span><span class="ny-ps"><span>${esc((STEP_TXT[p.key] ?? STEP_TXT.download).replace('{v}', lat.version || ''))}</span><span class="ny-pct">${p.pct} %</span></span></div>`;
  }
  return `<section class="ny-hero" data-ph="${ph}"><span class="ny-arc a" aria-hidden="true"></span><span class="ny-arc b" aria-hidden="true"></span>
    <div class="ny-top"><span class="ny-big" data-no-i18n>${esc(big)}</span><button type="button" class="ny-chk" data-hl="chk" data-upd="check" ${ph === 'run' || U.checking ? 'disabled' : ''}>${U.checking ? 'Ser etter …' : '<span class="ny-chk-l">Se etter oppdatering</span><span class="ny-chk-s">Se etter</span>'}</button></div>
    <div class="ny-bot"><span class="ny-st" role="status">${esc(stTxt)}</span><span class="ny-name">Nordlys<span>OS</span></span><span class="ny-host">${esc(store.me?.serverName || 'Homelab')} · <span data-no-i18n>${esc(host())}</span></span>${prog}</div></section>`;
}

function btnHtml(ph, d) {
  const p = ph === 'run' ? progress() : null;
  const B = {
    avail: ['Oppdater nå', 'blue', 'Tar backup først · ca. 2 minutter · serveren starter på nytt', 'go'],
    setup: ['Ikke satt opp', 'grey', 'Oppdatering fra appen er ikke slått på. Se under.', ''],
    run: [`Oppdaterer … ${p?.pct ?? 0} %`, 'blue busy', 'Du kan bruke Homelab mens den oppdateres.', ''],
    done: ['Ferdig', 'green', 'Endringene er aktive på web og i appen.', 'ack'],
    fresh: ['Du har siste versjon', 'grey', d?.checkedAt ? `Sist sjekket ${ago(d.checkedAt)}` : 'Sist sjekket nå', ''],
    checking: ['Ser etter …', 'grey', 'Henter siste versjon fra GitHub.', ''],
    fail: ['Prøv igjen', 'blue', String(d?.status?.error || 'Oppdateringen stoppet. Se loggen under.'), 'go'],
    loading: ['Laster …', 'grey', '', ''],
    error: ['Prøv igjen', 'grey', U.err || 'Fikk ikke kontakt med serveren.', 'reload'],
  }[ph];
  const dis = !B[3] || (B[3] === 'go' && d?.canStart === false && !running());
  const sub = B[3] === 'go' && d?.canStart === false && d?.reason ? d.reason : B[2];
  return `<div class="ny-act"><button type="button" class="ny-btn ${B[1]}" data-hl="upd" ${B[3] ? `data-ny="${B[3]}"` : ''} ${dis ? 'disabled' : ''}>${esc(B[0])}</button><span class="ny-sub"${ph === 'fail' ? ' data-no-i18n' : ''}>${esc(sub)}</span></div>`;
}
function ago(t) {
  const m = Math.round((Date.now() - (ms(t) ?? Date.now())) / 60000);
  return m < 1 ? 'nå' : m < 60 ? `for ${m} min siden` : m < 1440 ? `for ${Math.round(m / 60)} t siden` : dmy(t);
}

function verHtml(ph, d, h) {
  const inst = d?.installed ?? {}, lat = d?.latest ?? {}, up = ph === 'avail' || ph === 'setup' || ph === 'run' || ph === 'fail';
  const v = up ? lat : inst.version ? inst : lat;
  const line = [v.version, shortSha(v.sha), up ? mb(V.d?.sizeBytes) : ''].filter(Boolean).join(' · ') || '–';
  const right = up ? `Du har ${inst.version || verTxt(inst)}` : 'Installert';
  const pw = requirePw();
  return `<section class="ny-sec"><div class="ny-row"><span class="ny-rt"><b>Programvareversjon</b><span class="ny-mono" data-no-i18n>${esc(line)}</span></span><span class="ny-inst${up ? '' : ' ok'}">${esc(right)}</span></div>
    ${h.row({ t: 'Krev passord for å oppdatere', k: 'passord oppdatering sikkerhet', s: pw ? 'Passord kreves før oppdateringen starter' : 'Av · admin kan oppdatere med ett trykk', tog: pw, act: 'data-upd-set="require_password"', disabled: !SET.loaded }).html}
    <span class="ny-note">Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.</span>${SET.err ? `<span class="ny-note red">${esc(SET.err)}</span>` : ''}</section>`;
}

function notesHtml(ph, d) {
  const up = ph === 'avail' || ph === 'setup' || ph === 'run' || ph === 'fail';
  const v = (up ? d?.latest?.version : d?.installed?.version) || d?.latest?.version || '';
  const sec = (d?.changes ?? []).find((c) => c.version === v) ?? (up ? d?.changes?.[0] : null);
  let items = (up && V.d?.notes?.length ? V.d.notes : sec?.items ?? []).map((x) => String(x ?? '').trim()).filter((x) => x && !/^[^.!?]{1,60}:$/.test(x) && !/^[-–:.\s]*$/.test(x));
  const date = sec?.date || (up ? V.d?.publishedAt && dmy(V.d.publishedAt) : '') || '';
  const tag = V.d?.tagline || 'Lys i mørket, kjørt hjemme.';
  items = items.slice(0, 16);
  return `<section class="ny-notes"><b class="ny-h">Dette er Nordlys ${esc(majMin(v) || '')}. ${esc(tag)}</b>
    ${v ? `<span class="ny-cap">NYTT I <span data-no-i18n>${esc(v)}</span>${date ? ` · <span data-no-i18n>${esc(date)}</span>` : ''}</span>` : ''}
    ${items.length ? `<ul data-no-i18n>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="ny-note">Ingen endringsnotater for denne versjonen ennå.</span>'}${buildLine(d)}</section>`;
}
// Prompt 32 (claude-code-fjern-oppdatering-rad.md): «Installert 4.24.0 · build 8512626» med Kopier, flyttet hit fra den
// gamle Oppdatering-raden. Nordlys OS er det eneste stedet å oppdatere.
let copiedBuild = false;
function buildTxt(d) { const i = d?.installed ?? {}; return [i.version ? `Installert ${i.version}` : '', i.sha ? `build ${shortSha(i.sha)}` : ''].filter(Boolean).join(' · '); }
function buildLine(d) {
  const t = buildTxt(d);
  return t ? `<span class="ny-build"><span data-no-i18n>${esc(t)}</span><button type="button" class="ny-copy" data-upd="copybuild">${copiedBuild ? 'Kopiert ✓' : 'Kopier'}</button></span>` : '';
}

const setupHtml = (lead) => `<section class="ny-sec ny-setup"><b>${esc(lead)}</b>
    <span>Kjør update.sh én gang fra Proxmox for å slå dette på. Da startes også den lille updater-containeren som gjør selve oppdateringen.</span>
    <div class="upd-cmd"><code data-no-i18n>${esc(UPD_CMD)}</code><button type="button" class="sg-btn" data-upd="copy">${U.copied ? 'Kopiert ✓' : 'Kopier'}</button></div></section>`;

function logHtml(ph) {
  if (ph !== 'run' && ph !== 'fail') return '';
  const logTxt = U.log ?? (Array.isArray(U.d?.log) ? U.d.log.join('\n') : U.d?.log ?? '');
  return `<section class="ny-sec"><button type="button" class="sg-link" data-upd="log" aria-expanded="${U.logOpen}">${U.logOpen ? 'Skjul logg' : 'Vis logg'}</button>
    ${U.logOpen ? `<pre class="upd-log" data-mount-host data-no-i18n>${esc(logTxt || 'Loggen er tom.')}</pre>` : ''}</section>`;
}

/** «Bekreft med passord» (når bryteren er på, eller serveren krever det). */
function sheetHtml() {
  if (!U.sheet) return '';
  return `<div class="ny-dlg-bg" data-upd="close"></div>
  <form class="ny-dlg" role="dialog" aria-modal="true" aria-labelledby="ny-dlg-t" data-upd-form>
    <b id="ny-dlg-t">Bekreft med passord</b>
    <span>${requirePw() ? 'Du har slått på passord for oppdateringer i System.' : 'Serveren krever passordet ditt før oppdateringen starter.'}</span>
    <input type="password" name="upw" value="${esc(U.pw)}" autocomplete="current-password" placeholder="Passord" data-upd-pw required>
    ${U.startErr ? `<span class="ny-err" role="alert">${esc(U.startErr)}</span>` : ''}
    <div class="ny-dlg-b"><button type="button" class="ny-dlg-c" data-upd="close">Avbryt</button><button type="submit" class="ny-dlg-ok" ${U.starting ? 'disabled' : ''}>${U.starting ? 'Starter …' : 'Oppdater'}</button></div>
  </form>`;
}

/** h = { group, row, note } fra settings.js. */
export function systemView(h) {
  if (!admin()) return { groups: [h.group('Oppdatering', [h.row({ t: 'Bare for administrator', s: 'Oppdatering av serveren gjøres av en administrator.' })])] };
  const d = U.d, ph = phase(), st = settings30();
  if (U.st === 'missing') return { html: heroHtml('error', null) + setupHtml('Serveren har ikke oppdatering fra appen ennå.') };
  if (U.st === 'forbidden') return { groups: [h.group('Oppdatering', [h.row({ t: 'Oppdatering fra appen', v: 'Ikke tilgjengelig', s: 'Bare administrator kan se og starte oppdateringer.' })])] };
  const soft = h.group('Programvare', [
    h.row({ t: 'Automatiske oppdateringer', k: 'auto automatisk natt', s: 'Kl. 03:30, etter nattlig backup.', tog: !!st.auto_update, act: 'data-upd-set="auto_update"', disabled: !st.loaded }),
    h.row({ t: 'Varsle om nye versjoner', k: 'varsel push banner', s: 'Banner på Dashboard og push til administratorer.', tog: st.notify_updates !== false, act: 'data-upd-set="notify_updates"', disabled: !st.loaded }),
  ]);
  const html = `<div class="ny">${heroHtml(ph, d)}${btnHtml(ph, d)}${d ? verHtml(ph, d, h) : ''}${d && d.available === false ? setupHtml('Oppdatering fra appen er ikke satt opp.') : ''}${logHtml(ph)}${d ? notesHtml(ph, d) : ''}</div>`;
  return { html: html + `<section class="sg"><h3 class="sg-t">Programvare</h3><div class="sg-box">${soft.rows.map((r) => r.html).join('')}</div></section>`, extra: sheetHtml(), mount: (el) => { el.scrollTop = el.scrollHeight; } };
}

/* Brukervalg for oppdatering (GET/PUT /api/system/update/settings). Eldre server: fra U.d.settings, ellers standard. */
const SET = { auto_update: false, notify_updates: true, require_password: false, loaded: false, loading: false, err: '' };
function settings30() {
  if (!SET.loaded && !SET.loading) {
    if (U.d?.settings) { Object.assign(SET, U.d.settings); SET.loaded = true; }
    else {
      SET.loading = true;
      fetch('/api/system/update/settings', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j) Object.assign(SET, j); SET.loaded = !!j; if (!j) SET.err = 'Serveren har ikke disse valgene ennå.'; })
        .catch(() => { SET.err = 'Fikk ikke hentet valgene.'; }).finally(() => { SET.loading = false; rerender(); });
    }
  }
  return SET;
}
async function saveSetting(k) {
  const v = !(k === 'notify_updates' ? SET[k] !== false : !!SET[k]);
  SET[k] = v; SET.err = ''; rerender();
  try {
    const r = await fetch('/api/system/update/settings', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: v }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Serveren svarte ${r.status}`);
    Object.assign(SET, j ?? {});
    if (k === 'require_password' && !(j && 'require_password' in j)) { SET[k] = !v; throw new Error('Serveren kjenner ikke dette valget ennå. Oppdater Nordlys først.'); }
    if (U.d) U.d.settings = { ...(U.d.settings ?? {}), ...SET };
  } catch (err) { SET[k] = !v; SET.err = err.message; }
  rerender();
}

/** Start: uten passord når bryteren er av (serveren kan likevel kreve det → passordarket). */
export async function startNow() {
  if (requirePw()) { openSheet(true); setTimeout(() => document.querySelector('[data-upd-pw]')?.focus(), 30); return; }
  const r = await startUpdate('', { allowEmpty: true });
  if (r === 'needpw') { openSheet(true); U.startErr = ''; setTimeout(() => document.querySelector('[data-upd-pw]')?.focus(), 30); }
}

export async function systemClick(e) {
  const ss = e.target.closest('[data-upd-set]');
  if (ss) { e.preventDefault(); await saveSetting(ss.dataset.updSet); return true; }
  const n = e.target.closest('[data-ny]');
  if (n && !n.disabled) {
    e.preventDefault();
    if (n.dataset.ny === 'go') await startNow();
    else if (n.dataset.ny === 'ack') { ackDone(); rerender(); }
    else if (n.dataset.ny === 'reload') { U.st = 'loading'; rerender(); await loadUpdate(); }
    return true;
  }
  const b = e.target.closest('[data-upd]');
  if (!b) return false;
  if (b.classList.contains('ny-dlg-bg') && e.target !== b) return false;
  e.preventDefault();
  const a = b.dataset.upd;
  if (a === 'check') { await checkUpdate(); loadVersion(true); }
  else if (a === 'reload') { U.st = 'loading'; rerender(); await loadUpdate(); }
  else if (a === 'open') await startNow();
  else if (a === 'close') openSheet(false);
  else if (a === 'log') toggleLog();
  else if (a === 'copy') await copyCmd();
  else if (a === 'copybuild') { try { await navigator.clipboard.writeText(buildTxt(U.d)); } catch { /* */ } copiedBuild = true; rerender(); setTimeout(() => { copiedBuild = false; rerender(); }, 1800); }
  return true;
}

export function systemInput(e) {
  if (!e.target.matches?.('[data-upd-pw]')) return false;
  U.pw = e.target.value;
  return true;
}

export async function systemSubmit(e) {
  if (!e.target.closest('[data-upd-form]')) return false;
  e.preventDefault();
  const pw = e.target.querySelector('[data-upd-pw]')?.value ?? U.pw;
  await startUpdate(pw);
  return true;
}

/** Esc lukker passordarket før innstillingene. */
export function systemEsc() { if (!U.sheet) return false; openSheet(false); return true; }
