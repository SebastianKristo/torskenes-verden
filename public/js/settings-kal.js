// Innstillinger → Kalendere (prompt 26): skolens iCal og Canvas-iCal, Google Kalender og Home Assistant (flyttet hit fra
// Bursdager) og fagfarger for Kalender. Skole og Canvas lagres i integrasjonen «calendars» (/api/integrations/calendars)
// når serveren har den, ellers i gruppen «Kalender / timeplan» i /api/config. Google og HA tegnes av birthdays.js.
import { esc } from './util.js';
import { store } from './store.js';
import { integById } from './settings-integ.js';
import { mountBdCalendars, bdCalSummary } from './birthdays.js';
import { ensureKal, subjectColors, setSubjectColor, webLayout, setWebLayout } from './kalender.js';
import { cals as kalCals, st39, loadCals } from './kal39.js';

const CFG_GROUP = 'Kalender / timeplan';

function fieldHtml(f, ro, i24) {
  const secret = i24 ? f.type === 'secret' : f.secret, saved = i24 ? f.saved : f.set;
  const type = secret ? 'password' : 'url';
  const val = secret && i24 ? '' : f.value ?? '';
  const ph = secret ? (saved ? '•••••••• lagret' : 'ikke satt') : f.placeholder ?? '';
  const clear = saved && secret && !ro ? (i24 ? `<button type="button" class="sg-link red" data-i24-clear="${esc(f.key)}">Fjern</button>` : `<button type="button" class="sg-link red" data-clear-secret="${esc(f.key)}">Fjern</button>`) : '';
  return `<label class="sg-field"><span>${esc(f.label)}</span><input name="${esc(f.key)}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"${ro ? ' readonly' : ''}>${clear}</label>${f.help ? `<div class="sg-fhelp">${esc(f.help)}</div>` : ''}`;
}

/** Skole og Canvas: integrasjonen «calendars» hvis serveren har den, ellers config-gruppen. */
function schoolForm(cfg, note) {
  const it = integById('calendars');
  if (it?.fields?.length) {
    return `<form class="sg" data-i24="calendars"><h3 class="sg-t">Skole og Canvas</h3><div class="sg-box">${it.fields.map((f) => fieldHtml(f, false, true)).join('')}</div>
      ${note('Lim inn iCal-adressen fra skolens timeplan (Visma InSchool, Outlook → Publiser kalender) og eventuelt Canvas (Kalender → Kalenderfeed). Timeplanen hentes på nytt hver time.')}</form>`;
  }
  const g = (cfg ?? []).find((x) => x.name === CFG_GROUP);
  if (!g) return `<section class="sg"><h3 class="sg-t">Skole og Canvas</h3><div class="sg-box"><div class="sg-row"><span class="sg-txt"><b>Laster …</b></span></div></div></section>`;
  return `<form class="sg" data-group="${esc(g.name)}"><h3 class="sg-t">Skole og Canvas</h3><div class="sg-box">${g.fields.map((f) => fieldHtml(f, false, false)).join('')}</div>
    ${note('iCal-adressen finner du i Canvas (Kalender → Kalenderfeed) eller Outlook (Publiser kalender). Timeplanen hentes på nytt hver time.')}</form>`;
}

function colorsBox() {
  const data = store.data.kalender, own = subjectColors();
  if (!data) { ensureKal(); return ''; }
  const subj = new Map();
  for (const L of data.byDay.values()) for (const e of L) if (e.kind === 'time' && e.subj && !subj.has(e.subj)) subj.set(e.subj, own[e.subj] || data.subjects?.[e.subj] || e.c || '#5c5850');
  if (!subj.size) return '';
  const rows = [...subj].sort((a, b) => a[0].localeCompare(b[0], 'nb')).map(([n, c]) => `<label class="sg-row kal-sc"><span class="kal-sc-dot" style="background:${esc(c)}"></span><span class="sg-txt"><b>${esc(n)}</b>${own[n] ? '<span>Egen farge</span>' : ''}</span>
    <input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c) ? c : '#5c5850')}" data-kal-subj="${esc(n)}" aria-label="Farge for ${esc(n)}">${own[n] ? `<button type="button" class="sg-link" data-kal-subj-reset="${esc(n)}">Standard</button>` : ''}</label>`).join('');
  return `<section class="sg"><h3 class="sg-t">Fagfarger</h3><div class="sg-box">${rows}</div><div class="sg-note">Fargene brukes i uke, måned, agenda og widgetene. Prøver vises alltid i rødt.</div></section>`;
}

/** Prompt 29: Kalender på web med toppmeny eller i fullskjerm (calendar_web_layout). */
function layoutBox() {
  const v = webLayout(), seg = (k, n) => `<button type="button" class="kal-seg-b" data-kal-layout="${k}" aria-pressed="${v === k}">${n}</button>`;
  return `<section class="sg"><h3 class="sg-t">Kalender på web</h3><div class="sg-box"><div class="sg-row"><span class="sg-txt"><b>Visning</b><span>${v === 'full' ? 'Kalenderen dekker hele vinduet uten Homelab-menyen. ✕ eller Esc lukker.' : 'Homelab-menyen øverst, kalenderen fyller resten.'}</span></span>
    <span class="kal-seg" role="group" aria-label="Visning">${seg('menu', 'Med toppmeny')}${seg('full', 'Fullskjerm')}</span></div></div>
    <div class="sg-note">Valget huskes for deg og brukes neste gang Kalender åpnes. I fullskjerm lukker ✕ eller Esc kalenderen.</div></section>`;
}

/** Prompt 39: de fire kalenderne (Personlig · Bursdager · Skole · Helligdager) og «Hvilken kalender er hva?» (1d). */
function fourBox() {
  if (!st39.cals) loadCals().then(() => document.dispatchEvent(new Event('hl:kal39')));
  const rows = kalCals().map((c) => `<div class="sg-row kal-sc"><span class="kal-sc-dot" style="background:${esc(c.color)}"></span><span class="sg-txt"><b>${esc(c.name)}</b><span>${esc([c.badge === 'GOOGLE' || c.source === 'google' ? 'Google' : c.badge === 'URL' || c.source === 'url' ? 'URL (iCal)' : c.own ? 'Egen' : 'Innebygd', c.sourceLabel && c.sourceLabel !== 'Google' ? c.sourceLabel : ''].filter(Boolean).join(' · '))}</span></span>${c.count ? `<span class="sg-v">${c.count}</span>` : ''}</div>`).join('');
  return `<section class="sg"><h3 class="sg-t">Kalendere i appen</h3><div class="sg-box">${rows}
    <div class="sg-row"><span class="sg-txt"><b>Hvilken kalender er hva?</b><span>Velg hvilke Google-kalendere som er Personlig og Bursdager</span></span><button type="button" class="sg-btn2" data-kal-gpick>Velg ›</button></div></div>
    <div class="sg-note">Personlig og Bursdager kommer fra Google, Skole fra en iCal-adresse, Helligdager er innebygd. Egne kalendere lages fra Kalender → + Legg til kalender.</div></section>`;
}

/** Siden. search er radene innstillingssøket leter i. */
export function kalView({ row, note, cfg }) {
  const s = bdCalSummary();
  return {
    html: `${fourBox()}${layoutBox()}${schoolForm(cfg, note)}
      <section class="sg"><h3 class="sg-t">Google Kalender og Home Assistant</h3><div data-mount-host></div>
        <div class="sg-note">Bursdager og hendelser fra Google Kalender vises i Kalender og Bursdager. Home Assistant kan importere og synke bursdager to veier.</div></section>
      ${colorsBox()}`,
    mount: mountBdCalendars,
    search: [{ t: 'Kalendere', note: '', rows: [
      row({ t: 'Hvilken kalender er hva?', s: 'Google-kalendere → Personlig og Bursdager', k: 'google kalender personlig bursdager velg kobling fire kalendere', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Skolens iCal', s: 'Timeplan og prøver fra skolen', k: 'skole ical timeplan', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Canvas-iCal', s: 'Innleveringer og frister', k: 'canvas', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Google Kalender', s: s.g, k: 'google kalender logg inn synk kontakter', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Home Assistant', s: s.ha, k: 'home assistant calendar import', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Fagfarger', s: 'Farge per fag i Kalender', k: 'farge fag', go: 'kal', btn: 'Åpne' }),
      row({ t: 'Kalender på web', s: 'Med toppmeny eller fullskjerm', v: webLayout() === 'full' ? 'Fullskjerm' : 'Med toppmeny', k: 'fullskjerm toppmeny visning oppsett layout', go: 'kal', btn: 'Åpne' }),
    ] }],
  };
}

export function kalClick(e, rerender) {
  if (e.target.closest('[data-kal-gpick]')) { e.preventDefault(); import('./kal-google39.js').then((m) => m.openGooglePicker({ onSaved: () => { ensureKal(true); loadCals().then(rerender); } })); return true; }
  const lb = e.target.closest('[data-kal-layout]');
  if (lb) { e.preventDefault(); setWebLayout(lb.dataset.kalLayout).then(rerender); return true; }
  const r = e.target.closest('[data-kal-subj-reset]');
  if (!r) return false;
  e.preventDefault();
  setSubjectColor(r.dataset.kalSubjReset, null).then(rerender);
  return true;
}
export function kalChange(e, rerender) {
  const t = e.target;
  // Skole/Canvas lagres av settings-integ.js; kalenderen hentes på nytt etterpå.
  if (t.closest?.('[data-i24="calendars"]')) { setTimeout(() => ensureKal(true), 1500); return false; }
  if (!t.matches?.('[data-kal-subj]')) return false;
  setSubjectColor(t.dataset.kalSubj, t.value).then(rerender);
  return true;
}
