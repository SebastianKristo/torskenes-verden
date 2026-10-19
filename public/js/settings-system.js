// Innstillinger → System → Oppdatering (bare admin). Viser installert og nyeste versjon, endringer fra CHANGELOG,
// «Se etter oppdatering» og «Oppdater nå» (ark med passord). Under kjøring: steg, logg og «Venter på at serveren
// kommer tilbake …»; siden lastes på nytt når ny versjon svarer. Logikken ligger i sysupdate.js (deles med PWA-en).
import { esc } from './util.js';
import { store } from './store.js';
import { fmtDate } from './i18n.js';
import { U, STEPS, UPD_CMD, onUpdate, loadUpdate, checkUpdate, openSheet, startUpdate, toggleLog, copyCmd, running, state, stepIndex, verTxt, waitMin, ms } from './sysupdate.js';

let rerender = () => {}, subscribed = false;
const admin = () => store.me?.me?.role === 'admin';
const day = (d) => { try { const t = ms(d); return t ? fmtDate(new Date(t), { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };

export function loadSystem(onChange) {
  if (onChange) rerender = onChange;
  if (!subscribed) { subscribed = true; onUpdate(() => rerender()); }
  if (admin()) loadUpdate();
}

/** Forklaring og kommandoen når oppdatering fra appen ikke er slått på. */
const setupHtml = (lead) => `<div class="sg-row upd-setup"><div class="upd-col">
    <b>${esc(lead)}</b>
    <span>Kjør update.sh én gang fra Proxmox for å slå dette på. Da startes også den lille updater-containeren som gjør selve oppdateringen.</span>
    <div class="upd-cmd"><code data-no-i18n>${esc(UPD_CMD)}</code><button type="button" class="sg-btn" data-upd="copy">${U.copied ? 'Kopiert ✓' : 'Kopier'}</button></div>
  </div></div>`;

function progressHtml() {
  const s = U.d?.status ?? {}, i = stepIndex(), failed = state() === 'failed' && !U.waiting;
  if ((i < 0 && !failed) || (state() === 'done' && !U.reloading)) return ''; // en gammel, vellykket kjøring vises ikke
  const steps = STEPS.map(([k, n], j) => {
    const cls = failed && j === i ? 'err' : j < i || (j === i && k === 'done') ? 'ok' : j === i ? 'on' : '';
    return `<li class="upd-step ${cls}"${j === i ? ' aria-current="step"' : ''}><span class="upd-dot" aria-hidden="true"></span>${esc(n)}</li>`;
  }).join('');
  const msg = U.reloading ? '<div class="upd-wait"><span class="upd-spin" aria-hidden="true"></span>Ny versjon svarer. Laster siden på nytt …</div>'
    : U.waiting ? `<div class="upd-wait"><span class="upd-spin" aria-hidden="true"></span><span>Venter på at serveren kommer tilbake …</span></div>${waitMin() >= 6 ? '<div class="upd-hint">Det tar lengre tid enn vanlig. Sjekk loggen i Proxmox med «docker compose logs updater».</div>' : ''}`
      : failed ? `<div class="upd-err"><b>Oppdateringen feilet.</b> <span data-no-i18n>${esc(s.error || 'Ukjent feil.')}</span></div>`
        : running() ? `<div class="upd-wait"><span class="upd-spin" aria-hidden="true"></span><span>${esc(s.step && !STEPS.some(([k]) => k === s.step) ? s.step : 'Serveren starter på nytt når den nye versjonen er bygget.')}</span></div>` : '';
  const logTxt = U.log ?? (Array.isArray(U.d?.log) ? U.d.log.join('\n') : U.d?.log ?? '');
  return `<div class="sg-row upd-prog" role="status" aria-live="polite"><div class="upd-col">
    <ol class="upd-steps">${steps}</ol>${msg}
    <button type="button" class="sg-link" data-upd="log" aria-expanded="${U.logOpen}">${U.logOpen ? 'Skjul logg' : 'Vis logg'}</button>
    ${U.logOpen ? `<pre class="upd-log" data-mount-host data-no-i18n>${esc(logTxt || 'Loggen er tom.')}</pre>` : ''}
  </div></div>`;
}

function changesHtml(list) {
  return list.map((c) => `<div class="sg-row upd-chg"><div class="upd-col"><b><span data-no-i18n>${esc(c.version)}</span>${c.date ? ` <span class="upd-date" data-no-i18n>${esc(c.date)}</span>` : ''}</b>
    <ul data-no-i18n>${(c.items ?? []).slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}${(c.items ?? []).length > 12 ? `<li>… ${(c.items.length - 12)} til</li>` : ''}</ul></div></div>`).join('');
}

function sheetHtml() {
  if (!U.sheet) return '';
  const d = U.d ?? {};
  return `<div class="upd-sheet-bg" data-upd="close"></div>
  <form class="upd-sheet" role="dialog" aria-modal="true" aria-labelledby="upd-sh-t" data-upd-form>
    <h3 id="upd-sh-t">${d.latest ? `Oppdater til ${esc(verTxt(d.latest))}` : 'Oppdater serveren'}</h3>
    <p>Serveren starter på nytt. Det tar vanligvis 2–5 minutter. Det tas backup av databasen først.</p>
    <label class="sg-field"><span>Passord</span><input type="password" name="upw" value="${esc(U.pw)}" autocomplete="current-password" placeholder="Ditt passord" data-upd-pw required></label>
    ${U.startErr ? `<div class="upd-err" role="alert">${esc(U.startErr)}</div>` : ''}
    <div class="upd-btns"><button type="button" class="sg-btn" data-upd="close">Avbryt</button><button type="submit" class="sg-btn pri" ${U.starting ? 'disabled' : ''}>${U.starting ? 'Starter …' : 'Oppdater nå'}</button></div>
  </form>`;
}

/** h = { group, row, note } fra settings.js. extra = arket (tegnes utenfor gruppene). */
export function systemView(h) {
  if (!admin()) return { groups: [h.group('Oppdatering', [h.row({ t: 'Bare for administrator', s: 'Oppdatering av serveren gjøres av en administrator.' })])] };
  const d = U.d, k = 'oppdatering update versjon version CHANGELOG proxmox';
  if (U.st === 'idle' || U.st === 'loading') return { groups: [h.group('Oppdatering', [h.row({ t: 'Oppdatering', k, v: 'Laster …' })])] };
  if (U.st === 'missing') return { groups: [h.group('Oppdatering', [h.row({ t: 'Oppdatering fra appen', k, v: 'Ikke tilgjengelig' }), setupHtml('Serveren har ikke oppdatering fra appen ennå.')])] };
  if (U.st === 'forbidden') return { groups: [h.group('Oppdatering', [h.row({ t: 'Oppdatering fra appen', k, v: 'Ikke tilgjengelig', s: 'Bare administrator kan se og starte oppdateringer.' })])] };
  if (U.st === 'error' || !d) return { groups: [h.group('Oppdatering', [h.row({ t: 'Oppdatering fra appen', k, v: 'Ikke tilgjengelig', s: U.err || 'Fikk ikke kontakt med serveren.', btn: 'Prøv igjen', act: 'data-upd="reload"' })])] };

  const busy = running(), latest = d.latest;
  const rows = [
    h.row({ t: 'Installert versjon', k, v: verTxt(d.installed), s: d.installed?.at ? `Installert ${day(d.installed.at)}` : '' }),
    h.row({ t: 'Nyeste versjon', k, v: latest ? verTxt(latest) : 'Ukjent', vc: d.updateAvailable ? 'var(--upd-pos)' : '',
      s: d.latestError ? `Kunne ikke hente fra GitHub: ${d.latestError}` : !latest ? 'Ikke hentet fra GitHub ennå.' : d.updateAvailable ? `Ny versjon er tilgjengelig${latest.date ? ` · ${day(latest.date)}` : ''}.` : 'Du har nyeste versjon.' }),
    h.row({ t: 'Se etter oppdatering', s: U.err ? U.err : 'Henter siste versjon fra GitHub.', btn: U.checking ? 'Ser etter …' : 'Se etter', act: 'data-upd="check"', disabled: U.checking || busy }),
  ];
  if (!d.available) rows.push(setupHtml('Oppdatering fra appen er ikke satt opp.'));
  else {
    rows.push(progressHtml());
    if (!busy) rows.push(h.row({ t: 'Oppdater nå', s: d.canStart === false ? d.reason || 'Kan ikke starte nå.' : d.updateAvailable ? 'Laster ned, bygger og starter serveren på nytt. Backup av databasen tas først.' : 'Du har nyeste versjon, men kan installere den på nytt.',
      btn: 'Oppdater nå', act: 'data-upd="open"', disabled: d.canStart === false }));
  }
  const groups = [h.group('Oppdatering', rows.filter(Boolean), d.available ? 'Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.' : '')];
  if (d.changes?.length && !busy) groups.push(h.group('Endringer', [changesHtml(d.changes)], d.updateAvailable ? 'Fra CHANGELOG, nyere enn installert versjon.' : ''));
  return { groups, extra: sheetHtml(), mount: (el) => { el.scrollTop = el.scrollHeight; } };
}

export async function systemClick(e) {
  const b = e.target.closest('[data-upd]');
  if (!b) return false;
  e.preventDefault();
  const a = b.dataset.upd;
  if (a === 'check') await checkUpdate();
  else if (a === 'reload') { U.st = 'loading'; rerender(); await loadUpdate(); }
  else if (a === 'open') { openSheet(true); setTimeout(() => document.querySelector('[data-upd-pw]')?.focus(), 30); }
  else if (a === 'close') openSheet(false);
  else if (a === 'log') toggleLog();
  else if (a === 'copy') await copyCmd();
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

/** Esc lukker arket før innstillingene. */
export function systemEsc() { if (!U.sheet) return false; openSheet(false); return true; }
