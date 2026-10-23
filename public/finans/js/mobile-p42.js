// Prompt 42 (PWA42): mobilpunktene i design_handoff_homelab/prompts/prompt-42-pakke/ som trenger ny kode.
//   · Fanelinja: valgfri Hjem-knapp (Standard / 1a / 1b / 1c / 1d) med forhåndsvisning i Tilpass → Fanelinje og i
//     «Rediger fanelinjen». «‹ Hjem» øverst følger valget (claude-code-navbar-hjem-knapp.md, fasit Mobil Papir App
//     navHome()/nhVals()/nhHide(), nøkkel papir_navhome; synk: /api/me/layout.homeButton)
//   · Innstillinger → HELSE (FAMILIE): Apple Health, Health Connect, Home Assistant og hva som deles (claude-code-familie-helsekilder-innstillinger.md)
//   · Vel fremme: statuslinja på Kart (via mobile-p40h.js) (claude-code-familie-fjern-hjemlys-kort.md)
//   · Gjøremål-Glimt: lokal forhåndsdeling når serveren ikke deler opp (claude-code-huskeliste-glimt-del-opp.md, punkt 4)
//   · «Vis mer» i bibelvers-arket (claude-code-bibel-ark-knapp-alltid.md)
// Soner uten kart og ikonsøk ligger i mobile-p22.js, PostNord-logoen i mobile-track.js, bibelvers-arket i mobile-p37b.js.
// Lastes med dynamisk import fra mobile.js (statiske importer herfra er trygge fordi resten allerede er evaluert).
import { esc, hlApi } from './core.js';
import { m, draw, flash, startScr, two, FIN } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { BB } from './mobile-p37b.js';
import { FM, famLoad } from './mobile-p16.js';
import * as HM from './mobile-p40h.js';

const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
const HOUSE = 'M3 11l9-7 9 7M5 10v10h14V10';
const svg = (d, s = 24, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/* =====================================================================
   1. Hjem-knapp i fanelinja
   ===================================================================== */
export const NH_OPTS = [
  ['standard', 'Standard', '«‹ Hjem» øverst, som i dag'],
  ['1a', 'Egen Hjem-knapp', 'Rund knapp til venstre for fanelinja'],
  ['1b', 'Hjem først i linjen', 'Hjem-ikon som første plass, skilt med en strek'],
  ['1c', 'Hjem i midten', 'Hevet rød knapp midt i fanelinja'],
  ['1d', 'Modulvelger', '«kr Finans ▴» åpner Hjem og alle moduler'],
];
const NH_OK = new Set(NH_OPTS.map(([k]) => k));
const normNh = (v) => (v === 'std' ? 'standard' : NH_OK.has(v) ? v : null);
export const NH = { pick: false, mods: false, applied: false };
export const navHome = () => normNh(lsGet('papir_navhome')) ?? 'standard';
export const nhLabel = () => NH_OPTS.find(([k]) => k === navHome())[1];
export function setNavHome(v, push = true) {
  const k = normNh(v); if (!k) return;
  const same = k === navHome();
  lsSet('papir_navhome', k);
  if (same) return;
  try { navigator.vibrate?.(8); } catch {}
  haptic('tab'); draw();
  if (push) hlApi('/me/layout', { method: 'PUT', json: { homeButton: k } }).catch(() => {}); // eldre server: 400 → bare på enheten
}
/** Fra GET /api/me/layout (homeButton er per bruker og synkes mellom enheter). */
export function take42(r) { const k = normNh(r?.homeButton ?? r?.home_button); if (k && k !== navHome()) { lsSet('papir_navhome', k); return true; } return false; }

// Modulvelgeren (1d): Hjem (rød) og alle modulene i et rutenett med tre kolonner.
const MODN = [['hl', 'Hjem', '⌂'], ['hjem', 'Finans', 'kr'], ['mat', 'Mat', '◐'], ['spor', 'Sporing', '▣'], ['dom', 'Domener', '◎'], ['fam', 'Familie', '◉'], ['dir', 'Boliger', '⌂'], ['sub', 'Abonnement', '↻'], ['kal', 'Kalender', '▦'], ['huske', 'Huskeliste', '☐'], ['chat', 'Chat', '✉'], ['mer', 'Alle', '⋯']];
const domOk = () => (m.me?.role ? m.me.role === 'admin' : true);
function curMod(scr) {
  if (scr === 'hl') return 'hl';
  if (scr === 'dir' || scr === 'sub') return scr;
  if (FIN.includes(scr) || ['fmer', 'kv', 'aks', 'konto'].includes(scr)) return 'hjem';
  return MODN.some(([k]) => k === scr) ? scr : 'mer';
}
const homeHref = () => `#/${startScr() === 'hl' ? 'hl' : startScr()}`;
const atHome = (scr) => scr === startScr() && !m.sub && !m.detail;

/** Tar fanelinja fra nav25() og legger inn valgt Hjem-knapp. Bred visning (≥ 600 px) bruker sidemenyen som før. */
export function nav42(html, scr) {
  NH.applied = false;
  const v = navHome();
  if (!html || v === 'standard' || two() || !/<nav class="pp-nav/.test(html)) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const nav = tpl.content.querySelector('nav.pp-nav');
  if (!nav) return html;
  const home = atHome(scr) || scr === 'hl';
  // 1a/1b/1c: Hjem-fanen fjernes – Hjem-knappen tar plassen og er markert på Hjem.
  if (['1a', '1b', '1c'].includes(v)) nav.querySelectorAll('a[data-tab="hl"]').forEach((a) => a.remove());
  nav.classList.add('p42-n', `p42-n${v}`);
  const tabs = [...nav.children].filter((x) => !x.matches('.pp-scan, .p25-home, .p42-nhb, .p42-nhc, .p42-nhd'));
  if (v === '1a') {
    nav.insertAdjacentHTML('beforebegin', `<a class="p42-nha${home ? ' on' : ''}" href="${homeHref()}" data-p42="home" aria-label="Hjem"${home ? ' aria-current="page"' : ''}>${svg(HOUSE, 24, 2)}</a>`);
  } else if (v === '1b') {
    nav.insertAdjacentHTML('afterbegin', `<a class="p42-nhb${home ? ' on' : ''}" href="${homeHref()}" data-p42="home" aria-label="Hjem"${home ? ' aria-current="page"' : ''}>${svg(HOUSE, 22, 2)}</a>`);
  } else if (v === '1c') {
    const mid = Math.floor(tabs.length / 2), ref = tabs[mid] ?? nav.querySelector('.pp-scan');
    const b = `<a class="p42-nhc${home ? ' on' : ''}" href="${homeHref()}" data-p42="home" aria-label="Hjem"${home ? ' aria-current="page"' : ''}>${svg(HOUSE, 24, 2.2)}</a>`;
    if (ref) ref.insertAdjacentHTML('beforebegin', b); else nav.insertAdjacentHTML('beforeend', b);
  } else if (v === '1d') {
    const [, n, i] = MODN.find(([k]) => k === curMod(scr)) ?? ['mer', 'Moduler', '⋯'];
    nav.insertAdjacentHTML('afterbegin', `<button type="button" class="p42-nhd" data-p42="mods" aria-haspopup="dialog" aria-expanded="${NH.mods}" aria-label="Modulvelger: ${esc(n)}"><span class="p42-nhdi" aria-hidden="true">${esc(i)}</span>${esc(n)}<span class="p42-nhda" aria-hidden="true">▴</span></button>`);
  }
  NH.applied = true;
  return tpl.innerHTML;
}

/** Den lille forhåndsvisningen av fanelinja (samme som kortene i fasiten). */
function pv(k) {
  const tab = (on, g) => (on ? `<span class="p42-pvon">${g}</span>` : `<span class="p42-pvt">${g}</span>`);
  const bar = (inner, cls = '') => `<span class="p42-pvbar${cls}">${inner}</span>`;
  const base = tab(true, '◎') + tab(false, '≡') + tab(false, '⌕');
  if (k === 'standard') return `<span class="p42-pvcol"><span class="p42-pvback">‹ Hjem</span>${bar(base + tab(false, '⋯'))}</span>`;
  if (k === '1a') return `<span class="p42-pvrow"><span class="p42-pvha">⌂</span>${bar(base + tab(false, '⋯'), ' grow')}</span>`;
  if (k === '1b') return bar(`<span class="p42-pvhb">⌂</span>${base}${tab(false, '⋯')}`);
  if (k === '1c') return bar(`${tab(true, '◎')}${tab(false, '≡')}<span class="p42-pvhc">⌂</span>${tab(false, '⌕')}${tab(false, '⋯')}`, ' vis');
  return bar(`<span class="p42-pvhd"><span>kr</span>▴</span>${base}`);
}
function optCard([k, n, d], compact) {
  const on = navHome() === k;
  return `<button type="button" class="p42-nhopt${on ? ' on' : ''}${compact ? ' sm' : ''}" data-p42="nh" data-k="${k}" role="radio" aria-checked="${on}">
    ${compact ? '' : `<span class="p42-nhot"><span class="m-grow"><b>${esc(n)}</b><small>${esc(d)}</small></span><span class="p42-ck" aria-hidden="true">${on ? '✓' : ''}</span></span>`}
    <span class="p42-pvbg" aria-hidden="true">${pv(k)}</span>
    ${compact ? `<span class="p42-nhot"><span class="m-grow"><b>${esc(n)}</b><small>${esc(d)}</small></span><span class="p42-ck" aria-hidden="true">${on ? '✓' : ''}</span></span>` : ''}</button>`;
}
/** Innstillinger → Tilpass → FANELINJE: «Hjem-knapp · Standard · velg og se forhåndsvisning  Velg ›». */
export const nhRow = (row) => row('', 'Hjem-knapp', `${nhLabel()} · velg og se forhåndsvisning`, 'Velg', 'home', 'hjemknapp', 'data-p42="nhpick"');
/** «Rediger fanelinjen»: HJEM-KNAPP · FORHÅNDSVISNING (kort i to kolonner). */
export const nhSection = () => `<span class="pp-lab p42-sl">HJEM-KNAPP · FORHÅNDSVISNING</span><div class="p42-nhgrid" role="radiogroup" aria-label="Hjem-knapp">${NH_OPTS.map((o) => optCard(o, true)).join('')}</div>`;
function pickSheet() {
  if (!NH.pick) return '';
  return `<div class="p37-scrim${NH.seen ? ' p42-still' : ''}" data-p42="nhx"></div><div class="p37-sheet p42-nhsheet${NH.seen ? ' p42-still' : ''}" role="dialog" aria-modal="true" aria-label="Hjem-knapp"><span class="p37-grab"></span>
    <div class="p42-shh"><b class="pp-serif">Hjem-knapp</b><button type="button" class="p42-done" data-p42="nhx">Ferdig</button></div>
    <span class="p42-mut">Velg hvordan du kommer tilbake til Hjem. Med en Hjem-knapp i fanelinja forsvinner «‹ Hjem» øverst.</span>
    <div class="p42-nhlist" role="radiogroup" aria-label="Hjem-knapp">${NH_OPTS.map((o) => optCard(o, false)).join('')}</div></div>`;
}
// Arket glir bare inn første gang; et valg tegner siden på nytt uten at animasjonen starter igjen.
const markSeen = () => { if (NH.pick) requestAnimationFrame(() => { NH.seen = true; }); else NH.seen = false; };
function modSheet() {
  if (!NH.mods || navHome() !== '1d' || two()) return '';
  const cur = curMod(m.screen);
  const L = MODN.filter(([k]) => k !== 'dom' || domOk());
  return `<div class="p42-mscrim" data-p42="modsx"></div><div class="p42-mods" role="dialog" aria-label="Moduler">${L.map(([k, n, i]) => `<a href="${k === 'hl' ? homeHref() : `#/${k}`}" class="p42-mod${k === 'hl' ? ' home' : k === cur ? ' on' : ''}" data-p42="mod" ${k === cur ? 'aria-current="page"' : ''}><span aria-hidden="true">${esc(i)}</span>${esc(n)}</a>`).join('')}</div>`;
}

/* =====================================================================
   2. Innstillinger → HELSE (FAMILIE)
   ===================================================================== */
export function healthGroup(grp, row) {
  if (!FM.d && !FM.busy && !NH.famT) { NH.famT = Date.now(); famLoad().then(() => draw()).catch(() => {}); }
  const me = FM.d?.me ?? {}, mem = FM.d?.members ?? FM.d?.people ?? [];
  const conn = (k) => !!((me.healthSources ?? {})[k] || mem.some((p) => String(p.health?.source ?? '').toLowerCase().includes(k === 'apple' ? 'apple' : 'connect')));
  const st = (k) => (conn(k) ? '✓ Koblet' : 'Koble til');
  return grp('HELSE (FAMILIE)', [
    row('', 'Apple Health', conn('apple') ? 'Koblet til via appen · iPhone' : 'Ikke koblet · iPhone', st('apple'), 'users', 'hs-apple', 'data-p42="hs" data-k="apple"'),
    row('', 'Health Connect', conn('hc') ? 'Koblet til via appen · Android' : 'Ikke koblet · Android', st('hc'), 'users', 'hs-hc', 'data-p42="hs" data-k="hc"'),
    row('#/set/helseha', 'Home Assistant · Mobilapp', 'Skritt, puls og søvn fra telefonene i HA', '', 'home', 'hs-ha'), // prompt 45: egen side (Helse Home Assistant.dc.html)
    row('', 'Hva deles med familien', 'Skritt, søvn, puls og aktivitet · velg per person', 'Velg', 'users', 'hs-share', 'data-p42="hs" data-k="share"'),
  ]);
}
const HS_HINT = {
  apple: 'Apple Health: endre tilgang i Helse-appen → Deling → Apper → Homelab',
  hc: 'Health Connect: endre tilgang i Innstillinger → Health Connect → Apper → Homelab',
  ha: 'Home Assistant: velg person → enhet → sensorer (skritt, puls, søvn …) i Homelab-appen',
};

/* =====================================================================
   3. Gjøremål-Glimt: lokal forhåndsdeling (før AI-en svarer, og hvis den feiler)
   ===================================================================== */
const VERB = ['ta med', 'hent', 'send', 'kjøp', 'ring', 'bestill', 'betal', 'vask', 'lever', 'pakk', 'sjekk', 'fiks', 'kjør', 'book', 'svar', 'skriv', 'les', 'rydd', 'bytt', 'handle', 'avbestill', 'møt'];
const FILL = /^(?:husk(?:e)?\s+(?:å\s+)?|(?:jeg|vi|de|du)\s+må\s+(?:huske\s+(?:å\s+)?)?|må\s+huske\s+(?:å\s+)?|må\s+|husk\s+)/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dedupe = (s) => s.replace(/(?<!\p{L})(\p{L}+)(\s+\1(?!\p{L}))+/giu, '$1');
/**
 * Deler en beskjed uten tegnsetting i separate gjøremål: på punktum/linjeskift, «og så», «og husk», «og <verb>» og på
 * gjentatt stedsnavn («… Strømstad Strømstad må …» = grense). Fyllord fjernes, begrunnelser («siden …») blir notat,
 * tidsuttrykk blir dueText. Returnerer [{title, note, dueText, due, place}] (maks 60 tegn i tittel).
 */
export function splitLocal(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  // Gjentatt ord med stor forbokstav (stedsnavn) = grense; andre gjentakelser («ha ha») slås sammen.
  s = s.replace(/(?<!\p{L})(\p{Lu}\p{L}+)\s+\1(?!\p{L})/gu, '$1 ¦ $1');
  s = dedupe(s);
  const vre = VERB.map((v) => v.replace(' ', '\\s+')).join('|');
  const parts = s.split(new RegExp(`\\s*(?:[.!?;\\n]+|¦|\\bog\\s+så(?!\\p{L})|\\bog\\s+husk(?:e)?(?:\\s+å)?(?!\\p{L})|,?\\s+og\\s+(?=(?:${vre})(?!\\p{L})))\\s*`, 'iu')).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2 || new RegExp(`^(${vre})`, 'i').test(x));
  const out = [];
  for (let p0 of parts) {
    let place = null, note = '', dueText = null, due = null;
    // «Strømstad må huske å …» → sted foran fyllordet
    const pm = p0.match(/^(\p{Lu}\p{L}+)\s+(?=(?:må|skal|husk))/u);
    if (pm) { place = pm[1]; p0 = p0.slice(pm[0].length); }
    let p = p0;
    for (let i = 0; i < 3; i++) p = p.replace(FILL, '');
    p = p.replace(/(?<!\p{L})(\p{L}+)\s+de\s+må\s+\1\s+må(?!\p{L})/giu, '$1 som må').replace(/(?<!\p{L})(\p{L}+)\s+de\s+må\s+\1(?!\p{L})/giu, '$1');
    const why = p.match(/\s+(siden|fordi|for at)\s+(.*)$/i);
    if (why) { note = cap(`${why[1]} ${why[2]}`.replace(/\bog da\b.*$/i, '').trim()); p = p.slice(0, why.index); }
    const tm = p.match(/\s+(før\s+(?:vi|jeg|du|de)\s+.*|i\s+morgen(?:\s+tidlig)?|i\s+dag|i\s+kveld|på\s+(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag))$/i);
    if (tm) { dueText = tm[1].trim(); p = p.slice(0, tm.index); if (/^i\s+morgen/i.test(dueText)) { const d = new Date(Date.now() + 864e5); due = d.toISOString().slice(0, 10); } else if (/^i\s+(dag|kveld)/i.test(dueText)) due = new Date().toISOString().slice(0, 10); }
    p = p.trim().replace(/\s+(må|skal)$/i, '');
    if (!p) continue;
    // «kjøp melk egg og brød» → «Kjøp melk, egg og brød»
    const km = p.match(/^(kjøp|handle)\s+(.+)$/i);
    if (km) { const w = km[2].split(/\s+og\s+/); const head = w[0].split(/\s+/); if (head.length > 1 && w.length > 1 && head.every((x) => x.length > 1)) p = `${km[1]} ${[...head, ...w.slice(1)].slice(0, -1).join(', ')} og ${w.at(-1)}`; }
    if (place && /^(ta\s+med|hent)\b/i.test(p) && !new RegExp(place, 'i').test(p)) p = `${p} fra ${place}`;
    p = p.replace(/\bpå\s+(\p{Ll}{3,})$/u, (_, w) => `på ${cap(w)}`); // «på kiwi» → «på Kiwi»
    let title = cap(p.trim());
    if (title.length > 60) title = `${title.slice(0, 58).replace(/\s+\S*$/, '')}…`;
    out.push({ title, note, dueText, due, place });
  }
  return out;
}

/* =====================================================================
   Krokene fra mobile.js
   ===================================================================== */
export function layer42() { const h = pickSheet() + modSheet(); markSeen(); return h; }
export function afterDraw42() {
  const r = document.querySelector('#app > .m');
  if (!r) return;
  const v = navHome(), on = NH.applied && !two();
  r.classList.toggle('p42-nh', on); // «‹ Hjem» øverst skjules på modulens toppsider (undersider beholder «‹ Oversikt»)
  for (const k of ['1a', '1b', '1c', '1d']) r.classList.toggle(`p42-nh${k}`, on && v === k);
}
export async function bind42(e, t) {
  const x = t.closest?.('[data-p42]');
  if (!x) return false;
  const k = x.dataset.p42;
  switch (k) {
    case 'home': try { navigator.vibrate?.(6); } catch {} haptic('tap'); NH.mods = false; return false; // lenken går til Hjem
    case 'mods': e.preventDefault(); NH.mods = !NH.mods; haptic('tap'); draw(); return true;
    case 'modsx': e.preventDefault(); NH.mods = false; draw(); return true;
    case 'mod': NH.mods = false; haptic('tap'); return false;
    case 'nhpick': e.preventDefault(); NH.pick = true; haptic('tap'); draw(); return true;
    case 'nhx': e.preventDefault(); NH.pick = false; haptic('tap'); draw(); return true;
    case 'nh': e.preventDefault(); setNavHome(x.dataset.k); return true;
    case 'bvmore': e.preventDefault(); BB.ctxAll = true; haptic('tap'); draw(); return true;
    case 'hs': {
      e.preventDefault(); haptic('tap');
      if (x.dataset.k === 'share') { location.hash = '#/fam'; const P17 = await import('./mobile-p17.js'); P17.FT.tab = 'helse'; draw(); return true; }
      flash(HS_HINT[x.dataset.k] ?? ''); return true;
    }
    default: return false;
  }
}
export function input42() { return false; }
export function boot42() {
  globalThis.P42 = { ...globalThis.P42, nav42, nhRow, nhSection, navHome, setNavHome, healthGroup, splitLocal, velStatus: () => HM.velStatus?.() ?? '' };
  hlApi('/me/layout').then((r) => { if (take42(r)) draw(); }).catch(() => {});
  addEventListener('hashchange', () => { if (NH.mods) NH.mods = false; if (NH.pick) NH.pick = false; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && (NH.mods || NH.pick)) { NH.mods = false; NH.pick = false; draw(); } });
}
