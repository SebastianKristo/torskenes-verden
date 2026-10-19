// Innstillinger → Oppdatering i mobilappen (PWA, bare admin). Samme flyt som på web (/assets/js/sysupdate.js):
// installert og nyeste versjon, endringer, «Se etter oppdatering», «Oppdater nå» med passord i et ark, steg og logg
// under kjøring, og «Venter på at serveren kommer tilbake …» til ny versjon svarer (da lastes appen på nytt).
// PWA-en bruker økt i nettleseren, så den kan starte oppdateringen. Mangler API-et eller updateren, vises forklaring.
import { esc } from './core.js';
import { m, draw, flash } from './mobile.js';
import { U, STEPS, UPD_CMD, onUpdate, loadUpdate, checkUpdate, openSheet, startUpdate, toggleLog, copyCmd, running, state, stepIndex, verTxt, waitMin, ms } from '/assets/js/sysupdate.js';

export const updAdmin = () => m.me?.role === 'admin';
let subscribed = false, lastSum = '';
const onPage = () => m.screen === 'set' && String(m.sub ?? '').split('/')[0] === 'oppd';

export function updLoad() {
  if (!subscribed) {
    subscribed = true;
    onUpdate(() => {
      // Hovedsiden i Innstillinger tegnes bare på nytt når kortstatusen på raden endres.
      if (m.screen === 'set' && !m.sub) { const v = updSummary(); if (v !== lastSum) { lastSum = v; draw(); } return; }
      if (!onPage() && !U.sheet) return;
      draw();
      const l = document.querySelector('.upd-mlog'); if (l) l.scrollTop = l.scrollHeight; // loggen viser siste linjer
    });
    // Enter i passordfeltet starter (arket er ikke et <form>, så ingen skjema-POST); Esc lukker arket.
    document.addEventListener('keydown', (e) => {
      if (!U.sheet) return;
      if (e.key === 'Escape') { openSheet(false); return; }
      if (e.key === 'Enter' && e.target.matches?.('[data-updpw]')) { e.preventDefault(); startUpdate(e.target.value); }
    });
  }
  return updAdmin() ? loadUpdate() : Promise.resolve();
}

// Ved direkte åpning kan brukeren (rollen) komme etter settingsLoad; da hentes status ved første tegning.
const lazy = () => { if (U.st === 'idle' && updAdmin()) setTimeout(updLoad, 0); };

/** Kort status til raden i Innstillinger. */
export function updSummary() {
  lazy();
  if (U.st === 'missing') return 'Ikke tilgjengelig';
  if (U.st !== 'ok' || !U.d) return '';
  if (running()) return 'Pågår …';
  if (!U.d.available) return 'Ikke satt opp';
  return U.d.updateAvailable ? `Ny: ${U.d.latest?.version ?? 'versjon'}` : U.d.installed?.version ?? '';
}

const day = (t) => { const v = ms(t); return v ? new Date(v).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const line = (label, v, color = '', sub = '') => `<div class="opt-row"><span class="m-grow">${esc(label)}${sub ? `<br><span style="font-size:13px;opacity:.65">${esc(sub)}</span>` : ''}</span><span class="sval" style="${color ? `color:${color};opacity:1` : ''}">${esc(v)}</span></div>`;
const act = (label, a, dis = false, color = 'var(--m-acc)') => `<button class="opt-row" data-sact="${a}" ${dis ? 'disabled' : ''}><span class="m-grow" style="color:${color};font-weight:600${dis ? ';opacity:.45' : ''}">${esc(label)}</span></button>`;
const setup = (lead) => `<div class="opt-row col upd-m"><b>${esc(lead)}</b><span class="upd-mt">Kjør update.sh én gang fra Proxmox for å slå dette på. Da startes også den lille updater-containeren som gjør selve oppdateringen.</span>
  <code class="upd-mcode">${esc(UPD_CMD)}</code><button class="pp-btn upd-mcopy" data-sact="updcopy">${U.copied ? 'Kopiert ✓' : 'Kopier kommandoen'}</button></div>`;

function progress(G) {
  const s = U.d?.status ?? {}, i = stepIndex(), failed = state() === 'failed' && !U.waiting;
  if ((i < 0 && !failed) || (state() === 'done' && !U.reloading)) return '';
  const steps = STEPS.map(([k, n], j) => `<li class="${failed && j === i ? 'err' : j < i || (j === i && k === 'done') ? 'ok' : j === i ? 'on' : ''}"${j === i ? ' aria-current="step"' : ''}><i aria-hidden="true"></i>${esc(n)}</li>`).join('');
  const msg = U.reloading ? 'Ny versjon svarer. Laster appen på nytt …' : U.waiting ? 'Venter på at serveren kommer tilbake …' : failed ? '' : 'Serveren starter på nytt når den nye versjonen er bygget.';
  const log = U.log ?? U.d?.log ?? '';
  return G('', [`<div class="opt-row col upd-m" role="status" aria-live="polite"><ol class="upd-msteps">${steps}</ol>
    ${msg ? `<div class="upd-mwait"><span class="upd-mspin" aria-hidden="true"></span>${esc(msg)}</div>` : ''}
    ${U.waiting && waitMin() >= 6 ? '<span class="upd-mt">Det tar lengre tid enn vanlig. Sjekk loggen i Proxmox med «docker compose logs updater».</span>' : ''}
    ${failed ? `<div class="upd-merr"><b>Oppdateringen feilet.</b> ${esc(s.error || 'Ukjent feil.')}</div>` : ''}
    <button class="upd-mlink" data-sact="updlog" aria-expanded="${U.logOpen}">${U.logOpen ? 'Skjul logg' : 'Vis logg'}</button>
    ${U.logOpen ? `<pre class="upd-mlog">${esc(log || 'Loggen er tom.')}</pre>` : ''}</div>`]);
}

/** Siden Innstillinger → Oppdatering. G = gruppe-byggeren i mobile-set.js. */
export function updPage(G) {
  lazy();
  if (!updAdmin()) return G('', [line('Oppdatering', 'Bare admin')], 'Oppdatering av serveren gjøres av en administrator.');
  if (U.st === 'idle' || U.st === 'loading') return G('', [line('Oppdatering', 'Laster …')]);
  if (U.st === 'missing') return G('Oppdatering', [line('Oppdatering fra appen', 'Ikke tilgjengelig'), setup('Serveren har ikke oppdatering fra appen ennå.')]);
  if (U.st === 'forbidden') return G('', [line('Oppdatering fra appen', 'Ikke tilgjengelig')], 'Bare administrator kan se og starte oppdateringer.');
  if (U.st === 'error' || !U.d) return G('', [line('Oppdatering fra appen', 'Ikke tilgjengelig', '', U.err || 'Fikk ikke kontakt med serveren.'), act('Prøv igjen', 'updreload')]);
  const d = U.d, busy = running(), lt = d.latest;
  const ver = G('Versjon', [
    line('Installert', verTxt(d.installed), '', d.installed?.at ? `Installert ${day(d.installed.at)}` : ''),
    line('Nyeste', lt ? verTxt(lt) : 'Ukjent', d.updateAvailable ? 'var(--pp-pos,#7BE3A0)' : '', d.latestError ? `Kunne ikke hente fra GitHub: ${d.latestError}` : !lt ? 'Ikke hentet fra GitHub ennå.' : d.updateAvailable ? 'Ny versjon er tilgjengelig.' : 'Du har nyeste versjon.'),
    act(U.checking ? 'Ser etter …' : 'Se etter oppdatering', 'updcheck', U.checking || busy),
  ]);
  if (!d.available) return ver + G('', [setup('Oppdatering fra appen er ikke satt opp.')]);
  const start = busy ? '' : G('', [act('Oppdater nå', 'updopen', d.canStart === false)],
    d.canStart === false ? esc(d.reason || 'Kan ikke starte nå.') : 'Laster ned, bygger og starter serveren på nytt. Backup av databasen tas først. .env, data/ og proton/ røres ikke.');
  const chg = d.changes?.length && !busy ? G('Endringer', d.changes.map((c) => `<div class="opt-row col upd-m"><b>${esc(c.version)}${c.date ? ` <span class="upd-mt">${esc(c.date)}</span>` : ''}</b><ul class="upd-mul">${(c.items ?? []).slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`)) : '';
  return ver + progress(G) + start + chg;
}

/** Arket med passord. Legges i draw() sammen med de andre arkene. */
export function updSheet() {
  if (!U.sheet || m.screen !== 'set') return '';
  const lt = U.d?.latest;
  return `<div class="sheet-bg" data-sact="updclose"></div><div class="pp-sheet upd-msheet" role="dialog" aria-modal="true" aria-label="Oppdater systemet"><span class="pp-grab"></span>
    <div class="pp-sh">${lt ? `Oppdater til ${esc(verTxt(lt))}` : 'Oppdater serveren'}</div>
    <span class="upd-mt">Serveren starter på nytt. Det tar vanligvis 2–5 minutter. Det tas backup av databasen først.</span>
    <input class="sinp" type="password" data-updpw value="${esc(U.pw)}" placeholder="Passord" autocomplete="current-password" aria-label="Passord">
    ${U.startErr ? `<div class="upd-merr" role="alert">${esc(U.startErr)}</div>` : ''}
    <div class="p17-two"><button type="button" class="pp-btn" data-sact="updclose">Avbryt</button><button type="button" class="pp-btn ink" data-sact="updgo" ${U.starting ? 'disabled' : ''}>${U.starting ? 'Starter …' : 'Oppdater nå'}</button></div></div>`;
}

/** Hendelser fra settingsBind. Returnerer true når den er håndtert. */
export async function updBind(e, t) {
  if (e.type === 'input' && t.matches?.('[data-updpw]')) { U.pw = t.value; return true; }
  if (e.type === 'change' && t.matches?.('[data-updpw]')) return true;
  if (e.type !== 'click') return false;
  const a = t.closest?.('[data-sact]')?.dataset.sact;
  if (!a?.startsWith('upd')) return false;
  e.preventDefault?.();
  if (a === 'updcheck') await checkUpdate();
  else if (a === 'updreload') { U.st = 'loading'; draw(); await loadUpdate(); }
  else if (a === 'updopen') { openSheet(true); setTimeout(() => document.querySelector('[data-updpw]')?.focus(), 60); }
  else if (a === 'updclose') openSheet(false);
  else if (a === 'updgo') await startUpdate(document.querySelector('[data-updpw]')?.value ?? U.pw);
  else if (a === 'updlog') toggleLog();
  else if (a === 'updcopy') { if (!(await copyCmd())) flash('Marker og kopier kommandoen manuelt'); }
  return true;
}
