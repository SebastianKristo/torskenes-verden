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
import { U, UPD_CMD, onUpdate, loadUpdate, checkUpdate, openSheet, startUpdate, toggleLog, copyCmd, running, state, verTxt, ms, shortSha, stuck46, control46 } from './sysupdate.js';
import { progress, ackDone, doneRecent } from './upd-banner.js';
import { carpOnBar, sherlockFly, setSherlockText } from './glimt-outfits36.js'; // prompt 36: Sherlock- og snekker-Glimt
import { versionsHtml44 } from './settings44.js'; // prompt 44: TIDLIGERE VERSJONER (tilbakerulling)
import { obs51PartHtml } from './obs51.js'; // prompt 65: én del per System-fane
import { ops51PartHtml } from './ops51.js'; // prompt 51 (OPS51): staging/tilbakerulling (Oppdateringer); backup og database er egen side (prompt 65)
import { SYS_TABS65, tabBar65 } from './settings65.js'; // prompt 65: System med faner

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
  const stTxt = { loading: 'Henter versjon …', error: 'Fikk ikke kontakt med oppdateringen', run: U.reloading ? 'Ny versjon svarer …' : U.rollTo || d?.status?.action === 'rollback' ? `Går tilbake til ${U.rollTo ?? d?.status?.version ?? ''}` : 'Oppdaterer …', checking: 'Ser etter oppdatering …', fail: 'Oppdateringen feilet', done: 'Oppdatert', avail: 'Oppdatering tilgjengelig', setup: 'Oppdatering tilgjengelig', fresh: 'Du har siste versjon' }[ph];
  let prog = '';
  if (ph === 'run') {
    const p = progress();
    prog = `<div class="ny-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><span class="ny-bar cp36-host">${carpOnBar(p.pct, 36)}<span style="width:${p.pct}%"></span></span><span class="ny-ps"><span>${esc((STEP_TXT[p.key] ?? STEP_TXT.download).replace('{v}', lat.version || ''))}</span><span class="ny-pct">${p.pct} %</span></span></div>`;
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
    ${items.length ? `<ul data-no-i18n>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="ny-note">Ingen endringsnotater for denne versjonen ennå.</span>'}${buildLine(d)}</section>${histHtml(v, d)}`;
}

// Prompt 36: TIDLIGERE VERSJONER. GET /api/system/changelog?limit=20&before=<v> → {items:[{version, date, notes[], installedAt?, failed?}], more}.
// Eldre server: changes fra /api/system/update. Én åpen om gangen, «Vis flere» henter neste side.
const HI = { items: null, more: false, open: '', busy: false, key: '', err: '' };
const cleanNotes = (a) => (a ?? []).map((x) => String(x ?? '').trim()).filter((x) => x && !/^[^.!?]{1,60}:$/.test(x) && !/^[-–:.\s]*$/.test(x));
function loadHist(before, more = false) {
  if (HI.busy) return;
  HI.busy = true;
  fetch(`/api/system/changelog?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => { const L = (Array.isArray(j) ? j : j?.items ?? []).map((x) => ({ ...x, notes: cleanNotes(x.notes ?? x.items) })); HI.items = more ? [...(HI.items ?? []), ...L] : L; HI.more = !!j?.more; })
    .catch(() => { if (!more) { HI.items = null; HI.fallback = true; } })
    .finally(() => { HI.busy = false; rerender(); });
}
function histHtml(v, d) {
  const key = v || '';
  if (HI.key !== key) { HI.key = key; HI.items = null; HI.fallback = false; HI.open = ''; loadHist(v); }
  let L = HI.items;
  if (!L && HI.fallback) L = (d?.changes ?? []).filter((c) => c.version && c.version !== v).map((c) => ({ version: c.version, date: c.date, notes: cleanNotes(c.items) }));
  if (!L) return `<section class="ny-hist"><span class="ny-cap">TIDLIGERE VERSJONER</span><span class="ny-note">Henter …</span></section>`;
  if (!L.length) return '';
  const when = (t) => { const x = new Date(ms(t) ?? t); return Number.isNaN(+x) ? '' : `${pad(x.getDate())}.${pad(x.getMonth() + 1)} kl. ${pad(x.getHours())}.${pad(x.getMinutes())}`; };
  return `<section class="ny-hist" id="ny-hist"><span class="ny-cap">TIDLIGERE VERSJONER</span><div class="ny-hl">${L.map((x) => {
    const on = HI.open === x.version, n = x.notes?.length ?? 0;
    const meta = [x.date ? (/^\d{4}-/.test(x.date) ? dmy(x.date) : x.date) : '', `${n} ${n === 1 ? 'endring' : 'endringer'}`].filter(Boolean).join(' · ');
    const tag = x.failed ? '<span class="ny-hf">Feilet</span>' : x.installedAt ? `<span class="ny-hi">Installert ${esc(when(x.installedAt))}</span>` : '';
    return `<div class="ny-hr${on ? ' on' : ''}"><button type="button" class="ny-hb" data-upd="hist:${esc(x.version)}" aria-expanded="${on}"><span class="ny-hv"><b data-no-i18n>Nordlys ${esc(x.version)}</b><span>${esc(meta)}</span></span>${tag}<span class="ny-chev" aria-hidden="true">›</span></button>
      ${on ? `<div class="ny-hn">${n ? `<ul data-no-i18n>${x.notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<span class="ny-note">Ingen endringsnotater.</span>'}${x.failed ? `<button type="button" class="sg-link" data-upd="log">Vis logg</button>` : ''}</div>` : ''}</div>`;
  }).join('')}</div>${HI.more ? `<button type="button" class="ny-more" data-upd="histmore"${HI.busy ? ' disabled' : ''}>${HI.busy ? 'Henter …' : 'Vis flere'}</button>` : ''}</section>`;
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

/** Prompt 46: «Står fast» (vakten på serveren), feilet med lite plass, og «Rydd» før start. */
function stuck46Html(ph, d) {
  const sk = ph === 'run' ? stuck46() : null, c = U.ctl ?? {};
  const acts = sk?.actions ?? (ph === 'fail' ? d?.status?.actions ?? [] : []);
  const lowDisk = /lite plass|low_disk|for lite ledig plass/i.test(`${U.startErr} ${d?.status?.cause ?? ''}`);
  if (!sk && !lowDisk && !acts.includes('prune') && !c.msg && !c.err) return '';
  const b = (a, t, cls = '') => `<button type="button" class="ny46-b ${cls}" data-upd46="${a}"${c.busy ? ' disabled' : ''}>${esc(c.busy === a ? '…' : t)}</button>`;
  const btns = [
    ...(sk ? [b('retry', 'Prøv igjen', 'pri'), acts.includes('abort') ? b('abort', sk.abortLabel) : '', b('log', U.logOpen ? 'Skjul logg' : 'Vis logg')] : []),
    ...((lowDisk || acts.includes('prune')) && !running() ? [b('prune', 'Rydd', sk ? '' : 'pri')] : []),
  ].join('');
  return `<section class="ny46${sk ? ' stuck' : ''}" role="${sk ? 'alert' : 'status'}">${sk ? `<b>Står fast</b><span data-no-i18n>${esc(sk.message)}</span>${sk.cause ? `<span class="ny46-c">✦ ${esc(sk.cause)}</span>` : ''}` : lowDisk || acts.includes('prune') ? `<b>Lite plass på serveren</b><span>${esc(U.startErr || d?.status?.glimt || 'Rydd gamle bilder (de 10 siste beholdes, volumer røres ikke) og prøv igjen.')}</span>` : ''}
    ${btns ? `<div class="ny46-bs">${btns}</div>` : ''}${c.msg ? `<span class="ny46-m">${esc(c.msg)}</span>` : ''}${c.err ? `<span class="ny46-m err">${esc(c.err)}</span>` : ''}</section>`;
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
  ]); // prompt 39: «Varsle om nye versjoner» ligger nå under Varsler (updNotifyRow)
  // Prompt 65 (System.dc.html): nordlys-hero, oppdater-knappen og «Krev passord» øverst; resten i faner under.
  const top = `<div class="ny">${heroHtml(ph, d)}${btnHtml(ph, d)}${stuck46Html(ph, d)}${d ? verHtml(ph, d, h) : ''}${d && d.available === false ? setupHtml('Oppdatering fra appen er ikke satt opp.') : ''}${logHtml(ph)}</div>`;
  const t = SYS_TABS65.some(([k]) => k === h.sysTab) ? h.sysTab : 'ov';
  const softHtml = `<section class="sg"><h3 class="sg-t">Programvare</h3><div class="sg-box">${soft.rows.map((r) => r.html).join('')}</div></section>`;
  const body = t === 'upd' ? softHtml + ops51PartHtml('updates', rerender) + versionsHtml44(rerender) + (d ? `<div class="ny">${notesHtml(ph, d)}</div>` : '')
    : t === 'perf' ? obs51PartHtml('trace')
      : t === 'heal' ? obs51PartHtml('heal')
        : t === 'mer' ? merHtml65(h)
          : obs51PartHtml('health');
  return { html: `${top}${tabBar65(SYS_TABS65, t)}<div class="sys65-body" data-sys65-tab="${t}">${body}</div>`, extra: sheetHtml(), mount: (el) => { el.scrollTop = el.scrollHeight; },
    search: [h.group('System', [
      h.row({ t: 'Helse', s: 'Containere, disk, Ollama, Mac-OCR, Mac mini, Proxmox og ntfy', go: 'system|ov', btn: 'Åpne', k: 'helse containere disk ollama mac-ocr mac mini proxmox ntfy oversikt' }),
      h.row({ t: 'Oppdateringer', s: 'Automatiske oppdateringer, staging, tilbakerulling og versjoner', go: 'system|upd', btn: 'Åpne', k: 'oppdatering automatisk staging røyktest tilbakerulling versjoner tidligere' }),
      h.row({ t: 'Trege forespørsler', s: 'Ytelse per rute (p50 og p95)', go: 'system|perf', btn: 'Åpne', k: 'ytelse trege forespørsler rute p50 p95 api health' }),
      h.row({ t: 'Selvreparasjon', s: 'Start containere på nytt automatisk, maks omstarter per time', go: 'system|heal', btn: 'Åpne', k: 'selvreparasjon omstart container unhealthy' }),
      h.row({ t: 'Feature flags og krasjrapporter', s: 'System → Mer → Kvalitet', go: 'system|mer', btn: 'Åpne', k: 'feature flags flagg krasjrapporter krasj glitchtip nytt i denne versjonen kvalitet' }),
    ])] };
}

/** Prompt 65: System → Mer. Bare Kvalitet (Feature flags, Krasjrapporter, Nytt i denne versjonen). Det som er flyttet, står som lenke. */
function merHtml65(h) {
  const r = (t, s, act) => h.row({ t, s, act, btn: 'Åpne' }).html;
  return `<section class="sg"><h3 class="sg-t">Kvalitet</h3><div class="sg-box">
      ${r('Feature flags', 'Slå nye funksjoner på per bruker eller enhet', 'data-p65-qa="flags"')}
      ${r('Krasjrapporter', 'Feil fra web, appene og serveren (GlitchTip eller lokalt)', 'data-p65-qa="crashes"')}
      ${r('Nytt i denne versjonen', 'Vis endringene i installert versjon', 'data-p65-qa="whatsnew"')}</div></section>`
    + `<section class="sg"><h3 class="sg-t">Flyttet herfra</h3><div class="sg-box">
      ${h.row({ t: 'Backup', s: 'Kopier, gjenoppretting og database – egen side under Server', go: 'backup', btn: 'Backup' }).html}
      ${h.row({ t: 'Lokale modeller', s: 'Desert Ant Labs-modellene – AI → Modeller', act: 'data-p65-ai="mod"', btn: 'AI' }).html}
      ${h.row({ t: 'Brief og Glimt-figur', s: 'Per bruker – Brukere og familie', go: 'users', btn: 'Brukere og familie' }).html}</div></section>`;
}

/** Prompt 39 (claude-code-varsler-versjon-app-ikon.md): raden i Innstillinger → Varsler (samme nøkkel notify_updates, bare admin). */
export function updNotifyRow(h) {
  if (!admin()) return '';
  const st = settings30();
  return h.row({ t: 'Varsle om nye versjoner', k: 'varsel push banner nordlys os versjon oppdatering', s: 'Nordlys OS · banner på Hjem og push', tog: st.notify_updates !== false, act: 'data-upd-set="notify_updates"', disabled: !st.loaded });
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
  const b46 = e.target.closest('[data-upd46]');
  if (b46 && !b46.disabled) {
    e.preventDefault();
    const a = b46.dataset.upd46;
    if (a === 'log') toggleLog();
    else if (a === 'abort') { if (confirm('Avbryte oppdateringen? Serveren blir på (eller går tilbake til) versjonen som kjørte før.')) await control46('abort'); }
    else await control46(a);
    if (a === 'prune') U.startErr = '';
    rerender(); return true;
  }
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
  if (a === 'check') {
    // Prompt 36: Glimt i Sherlock Holmes-drakt flyr inn i kortet og leter mens vi spør GitHub.
    const fly = sherlockFly(document.querySelector('#settings .ny-hero'), 'Hmm, la meg se …');
    await checkUpdate(); loadVersion(true);
    const lat = U.d?.latest?.version;
    setSherlockText(U.d?.updateAvailable && lat ? `Aha! Jeg fant Nordlys ${majMin(lat)}.` : U.st === 'ok' ? 'Elementært! Du har siste versjon.' : 'Hmm, fikk ikke svar fra GitHub.');
    await fly;
  }
  else if (a === 'reload') { U.st = 'loading'; rerender(); await loadUpdate(); }
  else if (a === 'open') await startNow();
  else if (a === 'close') openSheet(false);
  else if (a === 'log') toggleLog();
  else if (a.startsWith('hist:')) { const v = a.slice(5); HI.open = HI.open === v ? '' : v; rerender(); }
  else if (a === 'histmore') loadHist(HI.items?.at(-1)?.version, true);
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
