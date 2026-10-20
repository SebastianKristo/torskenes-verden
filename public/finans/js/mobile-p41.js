// Prompt 41 (PWA41): mobilpunktene i design_handoff_homelab/prompts/prompt-41-pakke/ som trenger ny kode.
//   · Bakgrunn «Oslo» fra lufta gjennom døgnet (Wikimedia Commons, rotasjon hver hele time med krysstoning) og
//     kreditering i Innstillinger → Tilpass → Bakgrunn (claude-code-bakgrunn-oslo-dognet.md, -hjem-fjern-bildekreditering.md)
//   · Skanneknapp på Hjem (papir_scan_home) i Tilpass og i «Rediger fanelinjen» (claude-code-hjem-skanneknapp-av.md)
//   · Fold 1c: stort Glimt-kort til venstre, fanene Nå · I dag · Hjemme · Økonomi til høyre (claude-code-hjem-fold-ipad-oppsett.md)
//   · Søkepillen: dra ned → animasjon inn i Chat (claude-code-sok-pille-dra-til-chat.md; gesten ligger i mobile-p38.js)
//   · Huskeliste: Glimt deler opp med AI i bakgrunnen, «Laget med Glimt», og fra søket på Hjem (claude-code-huskeliste-glimt-ai-bakgrunn.md)
//   · Innstillinger → Konto → SERVER (lokal/ekstern adresse, bytt automatisk) (claude-code-innlogging-uten-server.md)
//   · 17. mai: rød topp, program, «Hipp hipp hurra!», bryter for vanlig Hjem, HØYTIDER i Tilpass (claude-code-17-mai.md)
//   · Vær: rediger kort (wiggle + ark) og Glimt skiføre (claude-code-vaer-rediger-ski-julfigur.md)
//   · Værspørsmål om uka går til modellen (wxComplex, claude-code-glimt-vaer-uke-ai.md)
//   · AI-jobber: «… siden» oppdateres hvert minutt (claude-code-ai-jobber-klokkeslett.md)
// Min reise, Hjemlys i Familie og Bursdager ligger i mobile-p41b.js.
// Lastes med dynamisk import fra mobile.js (statiske importer herfra er trygge fordi resten allerede er evaluert).
// Alle API-er (kontrakt 41, SERVER41) tåler 404: da brukes lokal reserve eller kortet skjules.
import { esc, hlApi } from './core.js';
import { m, draw, flash, pref } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import * as PAPER from './mobile-paper.js';
import { edBlocks, edOn } from './mobile-paper3.js';
import { hlData } from './mobile-hl.js';
import * as P31 from './mobile-p31.js';
import { grp } from './mobile-p17.js';
import * as B from './mobile-p41b.js';

const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const svg = (d, s = 16, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const sw = (on) => `<span class="p24-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const firstName = () => String(m.me?.name ?? m.me?.username ?? 'Sebastian').trim().split(/\s+/)[0] || 'Sebastian';

/* =====================================================================
   1. Bakgrunn «Oslo» fra lufta (Commons-filer verifisert i spesifikasjonen; Getty krever lisens)
   ===================================================================== */
const OSLO = {
  morgen: ['Oslo_sett_fra_Nesoddtangen,_2020.jpg', 'Oslo_from_east_IMG_7642_aerial.JPG', 'Oslo_S_aerial.jpg'],
  dag: ['Oslo_Skyline,_drone.jpg', 'Rodeløkka_(7._september_2018).jpg', 'Holmenkollen_aerial.jpg', '2010-10-25_Oslo.jpg', 'Operahuset.jpg', 'Oslo_S_aerial.jpg'],
  kveld: ['Bjørvika_-_Oslo,_Norway_2020-12-23.jpg', 'Oslo_sunset_-_33885192918.jpg', 'Oslo_view.jpg'],
  natt: ['Oslo_at_night.jpg', 'Oslo_night_skyline_2011.jpg', 'Oslo_-_Bjørvika_-_2026.jpg'],
};
const FP = (f, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=${w}`;
const fileOf = (u) => { const x = /Special:FilePath\/([^?]+)/.exec(String(u ?? '')); return x ? decodeURIComponent(x[1]) : null; };
/** Soloppgang/-nedgang fra værdataene når de finnes (Open-Meteo/MET), ellers faste klokkeslett. */
function sunOf() {
  const w = hlData()?.weather ?? {}, d = w.today ?? w.days?.[0] ?? w;
  const sr = new Date(d.sunrise ?? w.sunrise ?? NaN), ss = new Date(d.sunset ?? w.sunset ?? NaN);
  return Number.isNaN(+sr) || Number.isNaN(+ss) ? null : { sr: sr.getHours() + sr.getMinutes() / 60, ss: ss.getHours() + ss.getMinutes() / 60 };
}
export function osloSlot(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60, S = sunOf();
  if (S) { if (h >= S.sr - 1 && h < S.sr + 3) return 'morgen'; if (h >= S.ss - 2 && h < S.ss + 1) return 'kveld'; if (h >= S.ss + 1 || h < S.sr - 1) return 'natt'; return 'dag'; }
  return h >= 5 && h < 10 ? 'morgen' : h >= 10 && h < 16 ? 'dag' : h >= 16 && h < 20 ? 'kveld' : 'natt';
}
/** Listen for nå: innenfor tidsrommet byttes bildet hver hele time (time % antall). Dag-settet er reserve. */
export function osloList(d = new Date()) {
  const L = OSLO[osloSlot(d)], start = d.getHours() % L.length, w = Math.min(2000, Math.max(1280, Math.round((innerWidth || 400) * Math.min(2, devicePixelRatio || 1) * 1.4)));
  const order = L.map((_, i) => L[(start + i) % L.length]);
  const reserve = OSLO.dag.filter((f) => !order.includes(f));
  return [...order.map((f) => FP(f, w)), ...order.slice(0, 1).map((f) => FP(f, 1280)), ...reserve.map((f) => FP(f, 1280))];
}
/** Kalles fra photoLoad/photoRotate: Commons-settet går foran serverens bilder (egne lisensierte bilder fra serveren først). */
export function osloPatch(r) {
  if (r?.licensed || r?.source === 'local') return r; // serveren har egne (kjøpte) bilder i assets/bakgrunn/oslo/
  const L = osloList(), srv = [r?.url, ...(r?.fallbacks ?? [])].filter(Boolean);
  return { ...(r ?? {}), url: L[0], fallbacks: [...L.slice(1), ...srv], hint: 'dark', credit: r?.credit ?? '', commons: true };
}
const CRED = lsGet('p41_credits', {}) || {};
/** «Foto: forfatter · lisens · Wikimedia Commons» under valgt bilde (Innstillinger → Tilpass → Bakgrunn). */
export function creditLine(kind, img, photo) {
  if (!img || kind === 'cur' || kind === 'custom') return '';
  const f = fileOf(img);
  if (f) {
    const c = CRED[f] ?? photo?.credits?.[f] ?? null, page = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}`;
    return `<div class="snote p41-cred">Foto: <a href="${esc(page)}" target="_blank" rel="noopener">${esc([c?.author ?? f.replace(/\.[a-z]+$/i, '').replace(/_/g, ' '), c?.license ?? 'CC BY-SA', 'Wikimedia Commons'].join(' · '))}</a></div>`;
  }
  if (!photo?.credit) return '';
  return `<div class="snote p41-cred">Foto: ${photo.creditUrl ? `<a href="${esc(photo.creditUrl)}" target="_blank" rel="noopener">${esc(photo.credit)}</a>` : esc(photo.credit)}</div>`;
}
let bgKey = '';
function bgTick() {
  if (pref('photo') !== 'oslo') return;
  const d = new Date(), k = `${osloSlot(d)}:${d.getHours()}`;
  if (!bgKey) { bgKey = k; return; }
  if (k !== bgKey) { bgKey = k; PAPER.photoRotate('oslo').catch(() => {}); return; }
  // Forhåndslast neste times bilde 5 min før bytte.
  if (d.getMinutes() === 55) { const n = new Date(d.getTime() + 6 * 60e3), im = new Image(); im.src = osloList(n)[0]; }
}

/* =====================================================================
   2. Skanneknapp på Hjem
   ===================================================================== */
export const scanHome = () => lsGet('papir_scan_home', true) !== false;
export function scanRow(sheet = false) {
  const on = scanHome();
  return `<button type="button" class="p24-tog p41-scanr${sheet ? ' sh' : ''}" data-p41="scanhome" role="switch" aria-checked="${on}"><span class="p41-scanic" aria-hidden="true">${svg('M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8', 17, 2.2)}</span><span class="m-grow"><b>Skanneknapp på Hjem</b><small>${on ? 'Vises på Hjem' : 'Skjult på Hjem · vises i de andre fanene'}</small></span>${sw(on)}</button>`;
}

/* =====================================================================
   3. Fold 1c: stort Glimt-kort + faner (≥ 600 px, Papir)
   ===================================================================== */
const FTABS = [['na', 'Nå'], ['idag', 'I dag'], ['hjemme', 'Hjemme'], ['okonomi', 'Økonomi']];
const FMAP = { na: ['h15', 'h3', 'h8', 'h6', 'h14', 'h5'], idag: ['h10', 'h9', 'h11', 'h8', 'h13'], hjemme: ['h7', 'h2', 'h4', 'h6'], okonomi: ['h4', 'h11', 'h2'] };
export const foldOn = () => innerWidth >= 600 && !globalThis.P41?.maiActive?.();
const foldTab = () => (FTABS.some(([k]) => k === lsGet('papir_fold_tab')) ? lsGet('papir_fold_tab') : 'na');
export function foldHome() {
  const tab = foldTab(), A = PAPER.homeBlocks(), keep = FMAP[tab];
  const blocks = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, keep.includes(k) ? v : '']));
  if (blocks.h15 && tripInstead()) blocks.h3 = '';
  const w = hlData()?.weather, kick = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const av = m.me?.avatarUrl ? `<img src="${esc(m.me.avatarUrl)}" alt="">` : esc(firstName().slice(0, 1).toUpperCase());
  const main = `<aside class="p41-fmain" aria-label="Glimt">${PAPER.heroLayers()}<span class="p41-fov" aria-hidden="true"></span>
    <div class="p41-fin"><div class="p41-ftop"><span class="p41-fapp">${esc(PAPER.appNameOf?.() ?? 'Homelab')}</span><a class="p41-fav" href="#/set" aria-label="Innstillinger">${av}</a></div>
      <span class="p41-fk">${esc(kick.charAt(0).toUpperCase() + kick.slice(1))}</span><b class="p41-ft">${esc(greetOf())},<br>${esc(firstName())}</b>
      ${w ? `<a class="p41-fw" href="#/vaer" data-p41="fwx"><b>${w.temp != null ? Math.round(w.temp) + '°' : '–'}</b><span>${esc(w.text ?? '')}${w.updated ? ` · ${esc(hm(w.updated))}` : ''} ›</span></a>` : ''}
      <div class="p41-fbot">${A.h12 ? `<div class="p41-fbr">${A.h12}</div>` : ''}<div class="p41-fsr">${A.h1}</div></div></div></aside>`;
  const tabs = `<div class="p41-ftabs" role="tablist" aria-label="Hjem">${FTABS.map(([k, n]) => `<button type="button" role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-p41="ftab" data-k="${k}">${n}</button>`).join('')}</div>`;
  return `${main}<div class="pp-home p41-fr">${tabs}${edBlocks('hl', blocks, { full: Object.keys(blocks) })}</div>`;
}
const greetOf = () => { const h = new Date().getHours(); return h < 5 ? 'God natt' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' : h < 18 ? 'God ettermiddag' : 'God kveld'; };

/* =====================================================================
   4. Søkepillen → Chat (FLIP: pillens ramme vokser til fullskjerm på 0,4 s)
   ===================================================================== */
export async function pillToChat(el, A) {
  const q = A?.q ?? '', ready = A && !A.busy && A.text && !A.err;
  const CHAT = await import('./mobile-chat.js');
  const open = () => { P31.G.ans = null; P31.G.aid++; if (ready) CHAT.openChatWith(q, A.text, 'glimt'); else CHAT.openChat(q); };
  const host = document.querySelector('#app .m');
  if (!el || !host || reduce()) {
    const ov = host ? Object.assign(document.createElement('div'), { className: 'p41-flip fade' }) : null;
    if (ov) { host.appendChild(ov); setTimeout(() => ov.remove(), 260); }
    open(); return;
  }
  const r = el.getBoundingClientRect();
  const ov = document.createElement('div');
  ov.className = 'p41-flip';
  ov.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
  ov.innerHTML = `<div class="p41-flc"><span class="p41-flo">Åpner i Chat …</span><div class="p41-fli"><b class="p41-flh">✦ Glimt</b><span class="p41-flu">${esc(q)}</span><span class="p41-fld"><i></i><i></i><i></i></span></div></div>`;
  host.appendChild(ov); el.style.visibility = 'hidden'; haptic('tap');
  requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('go'); ov.style.cssText = 'top:0;left:0;width:100%;height:100%'; }));
  setTimeout(() => { open(); setTimeout(() => { ov.classList.add('out'); setTimeout(() => ov.remove(), 220); }, 120); }, 400);
}

/* =====================================================================
   5. Huskeliste: Glimt i bakgrunnen + «Laget med Glimt» + fra søket på Hjem
   ===================================================================== */
const words = (q) => String(q ?? '').trim().split(/\s+/).filter(Boolean).length;
/** Når AI skal dele opp (ellers lokal tolking, som er raskest). */
export function needsAI(q) {
  const s = String(q ?? ''), n = words(s);
  if (n >= 12 && /\b(må|skal|huske?)\b/i.test(s)) return true;
  if (/\b(før vi skal|hvor vi må|og så|siden|fordi)\b/i.test(s) && n >= 6) return true;
  return s.split(/[.!]\s+/).filter((x) => x.trim().split(/\s+/).length >= 3).length > 1 && n >= 8;
}
const QW = /^\s*(hva|hvem|hvor|når|hvilke?n?|hvordan|hvorfor|kan du|vet du|er det|blir det|trenger jeg)\b/i;
/** Søkefeltet kjenner igjen huskebeskjeder (ikke spørsmål, ikke timer – timer går til Kalender før dette sjekkes). */
export function isHuske(t) {
  const s = String(t ?? '').trim();
  if (!s || /\?\s*$/.test(s) || QW.test(s)) return false;
  if (/^(husk|påminn meg|legg til i huskeliste(n)?|ny oppgave)\b/i.test(s)) return true;
  return words(s) >= 6 && /\b(må|skal|huske)\b/i.test(s) && /\b(vi|jeg|meg|oss)\b/i.test(s);
}
export function huskeRow(q) {
  if (!isHuske(q)) return '';
  const t = String(q).trim();
  return `<button type="button" class="p29-ap p41-hap" data-p29="addq"><span class="p29-apic">${svg('M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2', 16)}</span><span class="m-grow"><b>${esc(t.length > 60 ? `${t.slice(0, 58)}…` : t)}</b><span>Glimt deler opp i punkter</span></span><span class="p29-apb">Legg i Huskeliste</span></button>`;
}
export const HJ41 = { jobs: [], done: null, doneT: null, srcs: null, srcT: 0, srcMiss: false, poll: null };
const STEPS_H = ['Leser beskjeden', 'Deler opp i punkter', 'Finner rekkefølge og steder', 'Lagrer i Huskeliste'];
async function reloadTasks() { try { const P17 = await import('./mobile-p17.js'); P17.HK.t = 0; await P17.tasksLoad(true); } catch {} }
/**
 * POST /api/tasks/glimt {q, async:true, list?, origin} → 202 {jobId, placeholder}. Returnerer false når serveren ikke har
 * bakgrunnsjobben (da tar den vanlige tolkingen over).
 */
export async function huskeAsync(q, list, origin = 'huske', onDone = null) {
  let r;
  try { r = await hlApi('/tasks/glimt', { method: 'POST', json: { q, async: true, list, origin } }); }
  catch (e) { if (e.status === 404 || e.status === 405) return false; flash(e.message, 'err'); return true; }
  const id = r?.jobId ?? r?.job_id;
  if (!id) { // eldre server svarte med en gang (prompt 37/40)
    await reloadTasks(); const n = (r?.items ?? []).length; doneRow(n, null); onDone?.(n); draw(); return true;
  }
  HJ41.jobs.push({ id: String(id), q, t0: Date.now(), ph: r.placeholder ?? null, onDone });
  haptic('tap'); pollJobs(); draw();
  return true;
}
function doneRow(n, srcId) {
  HJ41.done = { n, srcId, at: Date.now() }; vib(12); haptic('ok');
  clearTimeout(HJ41.doneT); HJ41.doneT = setTimeout(() => { HJ41.done = null; if (m.screen === 'huske') draw(); }, 10_000);
}
async function jobFinished(J, d) {
  HJ41.jobs = HJ41.jobs.filter((x) => x.id !== J.id);
  await reloadTasks(); HJ41.srcT = 0;
  const n = d?.count ?? d?.items?.length ?? 0;
  if (d?.state === 'failed') { flash(`Glimt fikk ikke delt opp beskjeden${d?.error ? `: ${d.error}` : ''}`, 'err'); J.onDone?.(-1); draw(); return; }
  doneRow(n, d?.srcId ?? null); J.onDone?.(n); draw();
}
function pollJobs() {
  if (HJ41.poll) return;
  const tick = async () => {
    if (!HJ41.jobs.length) { HJ41.poll = null; return; }
    for (const J of [...HJ41.jobs]) {
      try { const d = await hlApi(`/tasks/glimt/jobs/${encodeURIComponent(J.id)}`); const st = d?.state ?? d?.job?.state; if (st === 'done' || st === 'failed') await jobFinished(J, d?.job ?? d); }
      catch (e) { if (e.status === 404 && Date.now() - J.t0 > 90_000) { HJ41.jobs = HJ41.jobs.filter((x) => x.id !== J.id); draw(); } }
    }
    HJ41.poll = setTimeout(tick, 2500);
  };
  HJ41.poll = setTimeout(tick, 2000);
}
/** Stiplet rad per jobb øverst i lista + «Glimt lagde 3 punkter … · Se / ✕» i 10 s. */
export function huskeJobRows() {
  const run = HJ41.jobs.map((J) => `<div class="p41-hjob" role="status"><span class="p41-spk" aria-hidden="true">✦</span><span class="m-grow"><b>Glimt deler opp beskjeden …</b><small>«${esc(J.q.length > 90 ? `${J.q.slice(0, 88)}…` : J.q)}»</small></span></div>`).join('');
  const D = HJ41.done;
  const dn = D ? `<div class="p41-hdone" role="status"><span class="p41-ok" aria-hidden="true">✓</span><span class="m-grow"><b>${D.n > 1 ? `Glimt lagde ${D.n} punkter i riktig rekkefølge` : D.n === 1 ? 'Glimt lagde 1 punkt' : 'Glimt er ferdig'}</b></span><button type="button" data-p41="hsee">Se</button><button type="button" class="x" data-p41="hdx" aria-label="Lukk">✕</button></div>` : '';
  return run + dn;
}
/** Beskjedene punktene ble laget av: GET /api/tasks/glimt/sources, ellers gruppert fra origin på punktene. */
export function glimtSrc(items) {
  if (!HJ41.srcMiss && Date.now() - HJ41.srcT > 30_000) {
    HJ41.srcT = Date.now();
    hlApi('/tasks/glimt/sources').then((r) => { HJ41.srcs = r?.sources ?? []; if (m.screen === 'huske') draw(); }).catch((e) => { if (e.status === 404) HJ41.srcMiss = true; });
  }
  if (HJ41.srcs) return HJ41.srcs.filter((s) => !s.forgotten);
  const G = new Map();
  for (const x of items ?? []) {
    const o = x.origin; if (!o?.text) continue;
    const k = String(o.id ?? `${o.text}|${o.at}`);
    if (!G.has(k)) G.set(k, { id: o.id ?? null, text: o.text, createdAt: o.at, engineLabel: o.engine ? `Glimt AI · ${o.engine}` : 'Glimt AI', items: [] });
    G.get(k).items.push(x);
  }
  return [...G.values()];
}
export function glimtView(GL, rowOf) {
  const when = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : d.toDateString() === new Date().toDateString() ? `i dag ${hm(d)}` : `${d.getDate()}.${d.getMonth() + 1} ${hm(d)}`; };
  return GL.map((s) => {
    const its = (s.items ?? []), del = s.deleted ?? 0;
    const meta = [`${its.length || s.count || 0} punkter · ${s.engineLabel ?? 'Glimt AI'}`, del ? `${del} slettet` : '', s.by?.name && String(s.by.id) !== String(m.me?.id) ? `av ${s.by.name}` : ''].filter(Boolean).join(' · ');
    return `<div class="p41-gsrc"><div class="p41-gsh"><span class="p41-lab">ORIGINAL BESKJED</span><span class="p41-mut">${esc(when(s.createdAt))}</span></div>
      <p class="p41-gsq">«${esc(s.text)}»</p><span class="p41-mut">${esc(meta)}</span>
      <div class="p37-card p37-rows">${its.map((x, i) => `<div class="p41-gsi"><span class="p41-gsn">${i + 1}</span>${rowOf(x)}</div>`).join('') || '<span class="p41-mut" style="padding:10px 0">Punktene er slettet.</span>'}</div>
      ${s.id ? `<div class="p41-gsb"><button type="button" class="ink" data-p41="gredo" data-id="${esc(s.id)}">✦ Del opp på nytt</button><button type="button" data-p41="gforget" data-id="${esc(s.id)}">Glem beskjeden</button></div>` : ''}</div>`;
  }).join('');
}
/** Fra søket på Hjem: samme Glimt-toast som for frisørtimer (steg og felt), så ✓ når punktene er lagret. */
export async function huskeFromHome(t) {
  const tmp = `p41h${Date.now()}`, short = t.length > 48 ? `${t.slice(0, 46)}…` : t;
  P31.jobPut(tmp, { kind: 'assist', title: 'Legger til i Huskeliste', model: 'Glimt', input: t, dur: 4200, steps: STEPS_H, fields: [['Beskjed', short], ['Liste', 'Glimt velger'], ['Original', 'I «Laget med Glimt»']] });
  draw();
  let finished = false, late = false;
  const lateT = setTimeout(() => { if (finished) return; late = true; P31.jobDrop(tmp); P31.aiDone('✦ Glimt deler opp i bakgrunnen …', { ms: 3800 }); }, 4600);
  const ok = await huskeAsync(t, undefined, 'home_search', (n) => {
    finished = true; clearTimeout(lateT); P31.jobDrop(tmp);
    if (n < 0) { P31.aiDone('Glimt fikk ikke delt opp beskjeden', { ms: 4000 }); return; }
    P31.aiDone(`✓ Glimt lagde ${n} punkt${n === 1 ? '' : 'er'} i Huskeliste`, { show: () => { location.hash = '#/huske'; }, ms: 5000 });
  });
  if (!ok) {
    // Eldre server: ett punkt med hele beskjeden (Huskeliste deler det opp lokalt når du åpner Glimt der).
    clearTimeout(lateT); P31.jobDrop(tmp);
    try { await hlApi('/tasks', { method: 'POST', json: { title: t.replace(/^(husk( å)?|påminn meg( om)?( å)?)\s+/i, '') } }); await reloadTasks(); P31.aiDone('✓ Lagt i Huskeliste', { ms: 3500 }); }
    catch (e) { P31.aiDone(`Fikk ikke til: ${String(e.message ?? '').slice(0, 60)}`, { ms: 4000 }); }
  } else if (late) { /* ✓ kommer når jobben er ferdig */ }
  draw();
}

/* =====================================================================
   6. Innstillinger → Konto → SERVER (lokal og ekstern adresse)
   ===================================================================== */
const SV = { d: null, t: 0, miss: false, sheet: null, f: { local: '', external: '' }, test: '', busy: false, now: '' };
async function srvLoad(force = false) {
  if (SV.miss || (!force && Date.now() - SV.t < 30_000)) return;
  SV.t = Date.now();
  try { SV.d = await hlApi('/me/server'); } catch (e) { if (e.status === 404) { SV.miss = true; SV.d = lsGet('p41_server', null); } }
  probeNow();
}
async function ping(url, ms = 1500) {
  const t0 = performance.now(), c = new AbortController(), to = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(`${String(url).replace(/\/$/, '')}/api/discovery`, { signal: c.signal, mode: 'cors', credentials: 'omit' }); clearTimeout(to); return { ok: r.ok || r.status === 401, ms: Math.round(performance.now() - t0) }; }
  catch { clearTimeout(to); return { ok: false, ms: null }; }
}
async function probeNow() {
  const D = SV.d ?? {}, loc = D.local;
  // Nettleseren bruker adressen siden ble åpnet med; den lokale «svarer» hvis den er samme opphav eller svarer < 300 ms.
  if (loc && location.origin.startsWith(String(loc).replace(/\/$/, ''))) SV.now = 'Lokal';
  else if (loc && D.auto !== false) { const p = await ping(loc, 600); SV.now = p.ok && p.ms < 300 ? 'Lokal' : 'Ekstern'; }
  else SV.now = 'Ekstern';
  if (m.screen === 'set') draw();
}
export function serverGroup() {
  srvLoad();
  const D = SV.d ?? {}, rowS = (k, n, v, sub) => `<button type="button" class="opt-row p17-row" data-p41="srvedit" data-k="${k}"><span class="m-grow p17-rt"><b>${n}</b><small>${esc(sub)}</small></span><span class="sval p41-mono">${esc(v || 'Ikke satt')}</span><span class="p17-chev" aria-hidden="true">›</span></button>`;
  return `<span class="pp-lab p17-gl" data-hl="server">SERVER</span><div class="list p17-list p41-srv">
    ${rowS('local', 'Lokal adresse', D.local, 'Brukes når du er hjemme på Wi-Fi')}
    ${rowS('external', 'Ekstern adresse', D.external || location.origin, 'Utenfor hjemmet')}
    <button type="button" class="opt-row p17-row" data-p41="srvauto" role="switch" aria-checked="${D.auto !== false}"><span class="m-grow p17-rt"><b>Bytt automatisk</b><small>Lokal når den svarer på under 300 ms, ellers ekstern${SV.now ? ` · nå: ${SV.now}` : ''}</small></span>${sw(D.auto !== false)}</button></div>
    <div class="snote">Adressene lagres på kontoen din og brukes av Homelab og Kalender på alle enheter. Du trenger ikke skrive dem når du logger inn.</div>`;
}
function srvSheet() {
  if (!SV.sheet) return '';
  const k = SV.sheet, n = k === 'local' ? 'Lokal adresse' : 'Ekstern adresse';
  return `<div class="sheet-bg" data-p41="srvx"></div><form class="pp-sheet p41-srvsh" data-p41f="srv" role="dialog" aria-modal="true" aria-label="${n}"><span class="pp-grab"></span>
    <div class="pp-row"><div class="pp-sh">${n}</div><button type="button" class="w32-x" data-p41="srvx" aria-label="Lukk">✕</button></div>
    <input id="p41-srvin" class="p24-in mono" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(SV.f[k])}" placeholder="${k === 'local' ? 'http://192.168.1.40:8080' : 'https://home.kristo.no'}" data-p41in="srv">
    ${SV.test ? `<span class="p41-srvt${/^✓/.test(SV.test) ? ' ok' : ''}">${esc(SV.test)}</span>` : ''}
    <div class="p24-two"><button type="button" class="p24-b" data-p41="srvtest">${SV.busy ? 'Tester …' : 'Test'}</button><button type="submit" class="p24-b ink">Lagre</button></div></form>`;
}
async function srvSave() {
  const k = SV.sheet, v = String(SV.f[k] ?? '').trim();
  if (v && !/^https?:\/\/[^\s/]+/i.test(v)) { SV.test = 'Adressen må starte med http:// eller https://'; draw(); return; }
  const patch = { [k]: v || null };
  try { SV.d = await hlApi('/me/server', { method: 'PUT', json: { ...(SV.d ?? {}), ...patch } }); }
  catch (e) { if (e.status !== 404) { SV.test = e.message; draw(); return; } SV.d = { ...(SV.d ?? {}), ...patch }; lsSet('p41_server', SV.d); }
  SV.sheet = null; SV.test = ''; flash('Adressen er lagret'); probeNow(); draw();
}

/* =====================================================================
   7. 17. mai
   ===================================================================== */
const MAI = { s: lsGet('p41_mai17', 'auto'), cnt: lsGet('p41_hurra', null), confT: 0 };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isMai17 = (d = new Date()) => d.getMonth() === 4 && d.getDate() === 17;
/** Festdesignet: Automatisk = selve dagen, «Vis nå» = forhåndsvisning, Av. Bryteren øverst gjelder bare i dag. */
export const maiDay = () => MAI.s === 'pa' || (MAI.s === 'auto' && isMai17());
export const maiActive = () => m.screen === 'hl' && maiDay() && lsGet('p41_mai_off', '') !== today();
const FLAG = '<svg class="p41-flag" viewBox="0 0 22 16" aria-hidden="true"><rect width="22" height="16" fill="#BA0C2F"/><rect x="6" width="4" height="16" fill="#fff"/><rect y="6" width="22" height="4" fill="#fff"/><rect x="7" width="2" height="16" fill="#00205B"/><rect y="7" width="22" height="2" fill="#00205B"/></svg>';
const bunting = () => `<span class="p41-bunt" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--c:${['#BA0C2F', '#fff', '#00205B'][i % 3]};animation-delay:-${(i * 0.13).toFixed(2)}s"></i>`).join('')}</span>`;
function maiPill() {
  const on = maiActive();
  return `<button type="button" class="p41-maip" data-p41="maitog" role="switch" aria-checked="${on}">${on ? '17. mai-design' : '17. mai'}<span class="p41-msw${on ? ' on' : ''}"><i></i></span></button>`;
}
export function heroMai() {
  if (!maiActive()) return null;
  const d = new Date(), wd = d.toLocaleDateString('nb-NO', { weekday: 'long' });
  return { kicker: `${wd.charAt(0).toUpperCase() + wd.slice(1)} 17. mai · Grunnlovsdagen`, title: `<span class="pp-gl">Gratulerer med dagen,</span><span class="pp-gl">${esc(firstName())}!</span>`, top: `${bunting()}<div class="p41-maitop">${maiPill()}</div>` };
}
const PROG = [['07:00', 'Salutt fra Akershus festning'], ['10:00', 'Barnetoget går fra Akershus festning'], ['13:00', 'Folketoget går fra Youngstorget']];
export function maiHome() {
  if (!maiDay()) return '';
  if (!maiActive()) return `<div class="p41-maioff">${maiPill()}</div>`;
  const now = hm(new Date()), nxt = PROG.findIndex(([t]) => t > now);
  const rows = PROG.map(([t, n], i) => `<div class="p41-prr${i < nxt || nxt < 0 ? ' past' : i === nxt ? ' next' : ''}"><b>${t}</b><span>${esc(n)}</span></div>`).join('');
  return `<div class="pp-card p41-prog"><span class="pp-lab">PROGRAM I DAG · OSLO</span>${rows}</div>
    <button type="button" class="p41-hurra" data-p41="hurra">${FLAG}<span class="m-grow"><b>Hipp hipp hurra!</b><small>${MAI.cnt?.d === today() ? `Hurra nr. ${MAI.cnt.n}` : 'Send til familien'}</small></span>${FLAG}</button>`;
}
function confetti() {
  if (reduce()) return;
  const host = document.querySelector('#app .m'); if (!host) return;
  const C = ['#BA0C2F', '#ffffff', '#00205B'], el = document.createElement('div');
  el.className = 'p41-conf'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${C[i % 3]};animation-duration:${(1.8 + Math.random() * 1.6).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s;${Math.random() > 0.5 ? 'border-radius:50%;' : ''}"></i>`).join('');
  host.appendChild(el); setTimeout(() => el.remove(), 4200);
}
async function hurra() {
  confetti(); vib([20, 40, 20, 40, 60]); haptic('ok');
  const n = MAI.cnt?.d === today() ? MAI.cnt.n + 1 : 1; MAI.cnt = { d: today(), n }; lsSet('p41_hurra', MAI.cnt);
  const text = `Hipp hipp hurra fra ${firstName()}!`;
  try { await hlApi('/family/cheer', { method: 'POST', json: { text } }); flash(`${text} er sendt til familien`); }
  catch { flash(`Hurra nr. ${n}!`); }
  draw();
}
export function holidayGroup() {
  const opt = (k, n, s2) => `<button type="button" class="opt-row p17-row" data-p41="mai" data-v="${k}"><span class="m-grow p17-rt"><b>${n}</b><small>${s2}</small></span><span class="sval" style="${MAI.s === k ? 'color:var(--pp-pos);opacity:1;font-weight:700' : ''}">${MAI.s === k ? '✓ Valgt' : ''}</span></button>`;
  return `<span class="pp-lab p17-gl" data-hl="mai17">HØYTIDER · 17. MAI-DESIGN</span><div class="list p17-list">${opt('auto', 'Automatisk 17. mai', 'Rød topp, program og «Hipp hipp hurra!» på selve dagen')}${opt('pa', 'Vis nå', 'Forhåndsvisning på Hjem')}${opt('av', 'Av', 'Vanlig Hjem også 17. mai')}</div>
    <div class="snote">Figurene får flagg 14.–17. mai (styres av Høytider i Innstillinger → Glimt, samme som julemodus).</div>`;
}
async function maiSet(v) {
  MAI.s = v; lsSet('p41_mai17', v); haptic('tab'); draw();
  hlApi('/glimt/settings', { method: 'PUT', json: { mai17: v } }).catch(() => {});
}
async function maiLoad() {
  try { const r = await hlApi('/glimt/settings'); const v = r?.mai17 ?? r?.settings?.mai17; if (['auto', 'av', 'pa'].includes(v) && v !== MAI.s) { MAI.s = v; lsSet('p41_mai17', v); draw(); } } catch {}
}

/* =====================================================================
   8. Vær: rediger kort (wiggle + ark) og Glimt skiføre
   ===================================================================== */
const WXK = [['na', 'Nå'], ['ski', 'Skiføre'], ['timer', 'Time for time'], ['dager', '10 dager'], ['cmp', 'Yr mot Storm'], ['vind', 'Vind'], ['mane', 'Måne'], ['detaljer', 'Detaljer'], ['uke', 'Glimt · uka']];
const WXL = { d: lsGet('vaer_layout', null), ed: false, lp: null };
const wxLay = () => { const d = WXL.d ?? {}; const o = (d.order ?? []).filter((k) => WXK.some(([x]) => x === k)); WXK.forEach(([k]) => { if (!o.includes(k)) o.splice(WXK.findIndex(([x]) => x === k), 0, k); }); return { order: o, hidden: (d.hidden ?? []).filter((k) => WXK.some(([x]) => x === k)), ski: d.ski !== false }; };
function wxSave(p) {
  WXL.d = { ...wxLay(), ...p }; lsSet('vaer_layout', WXL.d); draw();
  clearTimeout(wxSave.t); wxSave.t = setTimeout(() => hlApi('/me/layout', { method: 'PUT', json: { vaer_layout: WXL.d } }).catch(() => {}), 400);
}
export const wxEditing = () => WXL.ed;
export function wxStyle() {
  const L = wxLay();
  const css = L.order.map((k, i) => `.vx-in [data-wxk="${k}"]{order:${i + 1}}`).join('') + L.hidden.map((k) => `.vx-in [data-wxk="${k}"]{display:none!important}`).join('') + '.vx-in>.vx-yr,.vx-in>.p41-wxeb{order:99}';
  return `<style>${css}</style>`;
}
export const wxEditBtn = () => `<button type="button" class="p41-wxeb" data-p41="wxed">Rediger kort</button>`;
/** Skiføre: vises bare når serveren melder skimuligheter (snødybde ≥ 15 cm) og bryteren ikke er av. */
export function skiCard(D) {
  const L = wxLay(), S = D?.ski ?? hlData()?.weather?.ski ?? null;
  if (!L.ski || !S) return '';
  const p = S.places?.[0] ?? S, depth = p.depth ?? p.snowDepth ?? p.snow_depth, nw = p.newSnow ?? p.snowfall3d ?? p.new_snow, t = p.temp ?? p.temperature, hu = p.humidity;
  const wax = p.wax ?? S.wax ?? waxOf(t, nw, p.crust), glide = p.glide ?? S.glide ?? glideOf(t);
  return `<div class="vx-card p41-ski" data-wxk="ski"><div class="p41-skih"><span class="vx-t">SKIFØRE · ${esc(String(p.name ?? 'Nordmarka').toUpperCase())}</span>${globalThis.P35?.fig ? '' : ''}<span class="p41-skif" aria-hidden="true">${figHtml('spire', 46)}</span></div>
    <span class="p41-skil">✦ GLIMT ANBEFALER</span><b class="p41-skiw">${esc(wax)}</b><span class="p41-skit">${esc(S.text ?? p.text ?? 'Fint skiføre i marka i dag.')}</span>
    <div class="p41-skin">${[['Snødybde', depth != null ? `${Math.round(depth)} cm` : '–'], ['Ny snø', nw != null ? `${Math.round(nw)} cm` : '–'], ['Temp', t != null ? `${Math.round(t)}°` : '–'], ['Fukt', hu != null ? `${Math.round(hu)} %` : '–']].map(([a, b]) => `<span><small>${a}</small><b>${b}</b></span>`).join('')}</div>
    <div class="p41-skic"><span>${esc(`Feste: ${wax}`)}</span><span>${esc(`Glid: ${glide}`)}</span><a href="https://skisporet.no" target="_blank" rel="noopener">Løyper ↗</a></div></div>`;
}
function waxOf(t, nw, crust) {
  if (crust) return 'Blå klister'; if (t == null) return 'Blå (V30)';
  if (t <= -10) return 'Grønn (V20)'; if (t <= -3) return nw > 0 ? 'Blå (V30) · nysnø' : 'Blå ekstra (V40)'; if (t <= 0) return 'Fiolett (V45)'; return 'Rød (V55) · klister';
}
const glideOf = (t) => (t == null ? 'Universal' : t <= -8 ? 'Kald' : t <= -2 ? 'Universal' : 'Varm');
let FIG = null;
import('/assets/js/glimt-figs.js').then((x) => { FIG = x; }).catch(() => {});
const figHtml = (id, S, mood = 'glad', o) => { try { return FIG?.fig ? FIG.fig(id, S, mood, o) : `<span class="p41-figfb" style="width:${S}px;height:${S}px"></span>`; } catch { return ''; } };
export { figHtml };
function wxSheet() {
  if (!WXL.ed || m.screen !== 'vaer') return '';
  const L = wxLay();
  return `<div class="p41-wxs" role="dialog" aria-label="Rediger Vær"><span class="pp-grab"></span><div class="pp-row"><b class="pp-serif" style="font-size:20px">Rediger Vær</b><button type="button" class="p24-b ink sm" data-p41="wxdone">Ferdig</button></div>
    <div class="p41-wxl">${L.order.map((k, i) => { const n = WXK.find(([x]) => x === k)[1], on = k === 'ski' ? L.ski && !L.hidden.includes(k) : !L.hidden.includes(k);
      return `<div class="p41-wxr"><span class="m-grow">${esc(n)}</span><button type="button" data-p41="wxmv" data-k="${k}" data-d="-1" aria-label="Flytt ${esc(n)} opp" ${i ? '' : 'disabled'}>↑</button><button type="button" data-p41="wxmv" data-k="${k}" data-d="1" aria-label="Flytt ${esc(n)} ned" ${i < L.order.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="p41-wxt" data-p41="wxtog" data-k="${k}" role="switch" aria-checked="${on}" aria-label="Vis ${esc(n)}">${sw(on)}</button></div>`; }).join('')}</div>
    <div class="p24-two"><button type="button" class="p24-b" data-p41="wxg" data-v="top">Glimt-kortet øverst</button><button type="button" class="p24-b" data-p41="wxg" data-v="bot">Glimt-kortet nederst</button></div>
    <button type="button" class="p24-b ghost" data-p41="wxreset">Nullstill</button></div>`;
}
function wxDown(e) {
  if (m.screen !== 'vaer' || WXL.ed) return;
  const c = e.target.closest?.('.vx-in [data-wxk]'); if (!c || e.target.closest('button,a,input')) return;
  WXL.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { WXL.lp = null; WXL.ed = true; WXL.sup = Date.now(); vib(15); haptic('ok'); draw(); }, 600) };
}
const wxCancel = () => { if (WXL.lp) { clearTimeout(WXL.lp.t); WXL.lp = null; } };

/* =====================================================================
   9. Små ting: bilde i fullskjerm, «… siden» i AI-jobber, værspørsmål
   ===================================================================== */
const Z = { u: null };
export function zoomImg(u) { Z.u = u; haptic('tap'); draw(); }
const zoomLayer = () => (Z.u ? `<div class="p41-zoom" role="dialog" aria-modal="true" aria-label="Kvitteringen"><button type="button" class="p41-zx" data-p41="zoomx" aria-label="Lukk">✕</button><div class="p41-zs"><img src="${esc(Z.u)}" alt="Kvitteringen"></div></div>` : '');
const WXQ = /\b(uke|uka|uken|helg(en)?|dager|neste|når|hvilken dag|beste|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|ukedager|sammenlign|tur|trening|fremover|denne uka)\b/i;
const WXW = /v(æ|ae)r(et)?\b|regn|paraply|grader|temperatur|snø|vind|kaldt|varmt|sol(fylt|rik)?\b|tørt|tørr/i;
/** Værspørsmål som skal tenkes gjennom med AI og ukesdata (ellers hurtigsvar for nå/i dag/i morgen). */
export function wxComplex(q) { const s = String(q ?? ''); return WXW.test(s) && (WXQ.test(s) || words(s) > 9); }
function agoTick() {
  document.querySelectorAll('#app [data-p41ago]').forEach((el) => {
    const t = +el.dataset.p41ago, sm = el.querySelector('small'); if (!t || !sm) return;
    const s = (Date.now() - t) / 1000; sm.textContent = s < 60 ? 'nå nettopp' : s < 3600 ? `${Math.floor(s / 60)} min siden` : s < 86400 ? `${Math.floor(s / 3600)} t siden` : `${Math.floor(s / 86400)} d siden`;
  });
}

/* =====================================================================
   Kobling til mobile.js
   ===================================================================== */
export const tripHome = (ed) => B.tripHome(ed);
export const tripInstead = () => B.tripInstead();
export const tripRuter = () => B.tripRuter();
export const famHjemlys = () => B.famHjemlys();
export const bdParty = (n) => B.bdParty(n);
export const bdPhotoBar = (p, u) => B.bdPhotoBar(p, u);

export function layer41() { return srvSheet() + wxSheet() + zoomLayer() + B.layer41b(); }
export async function bind41(e, t) {
  const x = t.closest?.('[data-p41]');
  if (!x) {
    if (WXL.sup && Date.now() - WXL.sup < 450 && t.closest?.('.vx')) { e.preventDefault(); e.stopPropagation(); return true; }
    return B.bind41b(e, t);
  }
  const a = x.dataset.p41, k = x.dataset.k;
  switch (a) {
    case 'scanhome': e.preventDefault(); lsSet('papir_scan_home', !scanHome()); haptic('tab'); draw(); return true;
    case 'ftab': e.preventDefault(); lsSet('papir_fold_tab', k); haptic('tab'); draw(); document.querySelector('#app .m-scroll')?.scrollTo?.({ top: 0 }); return true;
    case 'fwx': return false; // vanlig lenke til Vær
    case 'hsee': e.preventDefault(); { const id = HJ41.done?.srcId; HJ41.done = null; const P17 = await import('./mobile-p17.js'); P17.HK.cur = 'glimt'; void id; if (location.hash !== '#/huske') location.hash = '#/huske'; draw(); } return true;
    case 'hdx': e.preventDefault(); HJ41.done = null; draw(); return true;
    case 'gredo': e.preventDefault(); try { const r = await hlApi(`/tasks/glimt/sources/${encodeURIComponent(x.dataset.id)}/redo`, { method: 'POST', json: {} }); const id = r?.jobId ?? r?.job_id; if (id) { const s = (HJ41.srcs ?? []).find((y) => String(y.id) === String(x.dataset.id)); HJ41.jobs.push({ id: String(id), q: s?.text ?? '', t0: Date.now() }); pollJobs(); } haptic('tap'); } catch (err) { flash(err.message, 'err'); } draw(); return true;
    case 'gforget': e.preventDefault(); try { await hlApi(`/tasks/glimt/sources/${encodeURIComponent(x.dataset.id)}`, { method: 'DELETE' }); HJ41.srcs = (HJ41.srcs ?? []).filter((y) => String(y.id) !== String(x.dataset.id)); flash('Beskjeden er glemt · punktene blir'); } catch (err) { flash(err.message, 'err'); } draw(); return true;
    case 'srvedit': e.preventDefault(); SV.sheet = k; SV.f[k] = (SV.d ?? {})[k] ?? (k === 'external' ? location.origin : ''); SV.test = ''; haptic('tap'); draw(); setTimeout(() => document.getElementById('p41-srvin')?.focus(), 80); return true;
    case 'srvx': e.preventDefault(); SV.sheet = null; draw(); return true;
    case 'srvauto': e.preventDefault(); { const auto = (SV.d ?? {}).auto === false; SV.d = { ...(SV.d ?? {}), auto }; haptic('tab'); hlApi('/me/server', { method: 'PUT', json: SV.d }).catch(() => lsSet('p41_server', SV.d)); probeNow(); draw(); } return true;
    case 'srvtest': e.preventDefault(); { const v = String(SV.f[SV.sheet] ?? '').trim(); if (!/^https?:\/\//i.test(v)) { SV.test = 'Adressen må starte med http:// eller https://'; draw(); return true; } SV.busy = true; draw(); const p = await ping(v, 4000); SV.busy = false; SV.test = p.ok ? `✓ Homelab svarer på ${v.replace(/^https?:\/\//, '')} · ${p.ms} ms` : 'Får ikke kontakt med Homelab på den adressen'; draw(); } return true;
    case 'mai': e.preventDefault(); maiSet(x.dataset.v); return true;
    case 'maitog': e.preventDefault(); lsSet('p41_mai_off', maiActive() ? today() : null); haptic('tab'); draw(); return true;
    case 'hurra': e.preventDefault(); hurra(); return true;
    case 'wxed': e.preventDefault(); WXL.ed = true; haptic('ok'); draw(); return true;
    case 'wxdone': e.preventDefault(); WXL.ed = false; haptic('ok'); draw(); return true;
    case 'wxmv': e.preventDefault(); { const L = wxLay(), o = [...L.order], i = o.indexOf(k), j = i + +x.dataset.d; if (i < 0 || j < 0 || j >= o.length) return true; [o[i], o[j]] = [o[j], o[i]]; haptic('tab'); wxSave({ order: o }); } return true;
    case 'wxtog': e.preventDefault(); { const L = wxLay(); if (k === 'ski') { wxSave({ ski: !(L.ski && !L.hidden.includes('ski')), hidden: L.hidden.filter((y) => y !== 'ski') }); } else wxSave({ hidden: L.hidden.includes(k) ? L.hidden.filter((y) => y !== k) : [...L.hidden, k] }); haptic('tab'); } return true;
    case 'wxg': e.preventDefault(); { const o = wxLay().order.filter((y) => y !== 'uke'); wxSave({ order: x.dataset.v === 'top' ? ['na', 'uke', ...o.filter((y) => y !== 'na')] : [...o, 'uke'] }); } return true;
    case 'wxreset': e.preventDefault(); WXL.d = null; lsSet('vaer_layout', null); hlApi('/me/layout', { method: 'PUT', json: { vaer_layout: null } }).catch(() => {}); draw(); return true;
    case 'zoomx': e.preventDefault(); Z.u = null; draw(); return true;
    default: return B.bind41b(e, t);
  }
}
export function input41(e, t) {
  if (t.dataset?.p41in === 'srv') { SV.f[SV.sheet] = t.value; return true; }
  return B.input41b(e, t);
}
export async function change41(e, t) { return B.change41b(e, t); }
export async function submit41(e, f) {
  if (f.matches?.('[data-p41f="srv"]')) { e.preventDefault(); await srvSave(); return true; }
  return B.submit41b(e, f);
}
export function onRt41(d) {
  const ty = String(d?.type ?? '');
  if (ty === 'glimt-job') {
    const J = HJ41.jobs.find((x) => x.id === String(d.jobId ?? d.id)); const st = d.state ?? d.job?.state;
    if (J && (st === 'done' || st === 'failed')) jobFinished(J, d.job ?? d);
    return true;
  }
  if (ty === 'todo:changed') { reloadTasks().then(() => { if (m.screen === 'huske' || m.screen === 'hl') draw(); }); return false; }
  return B.onRt41b(d);
}
export function afterDraw41() {
  // Kvittering uten originalbilde: si det, med opplasting (ikke et tomt felt).
  document.querySelectorAll('#app .p41-rimg:not([data-chk])').forEach((el) => {
    el.dataset.chk = '1'; const u = /url\(["']?([^"')]+)/.exec(el.style.backgroundImage)?.[1]; if (!u) return;
    const im = new Image(); im.onerror = () => { el.removeAttribute('data-p23'); el.classList.add('miss'); el.style.backgroundImage = 'none'; el.innerHTML = '<span>Fant ikke originalbildet. Last det opp på nytt for å lese det.</span><label class="p24-ob">Last opp<input class="m-file" type="file" accept="image/*,application/pdf" data-mupload data-stay></label>'; }; im.src = u;
  });
  document.documentElement.classList.toggle('p41-wxedit', WXL.ed && m.screen === 'vaer');
  if (m.screen !== 'vaer' && WXL.ed) WXL.ed = false;
  B.afterDraw41b();
}
let booted = false;
export function boot41() {
  if (booted) return; booted = true;
  globalThis.P41 = { ...globalThis.P41, osloPatch, creditLine, scanHome, scanRow, foldOn, foldHome, pillToChat, needsAI, isHuske, huskeRow, huskeAsync, huskeFromHome, huskeJobRows, glimtSrc, glimtView,
    serverGroup, holidayGroup, heroMai, maiHome, maiActive, wxEditing, wxStyle, wxEditBtn, skiCard, zoomImg, wxComplex, tripHome, tripInstead, tripRuter, famHjemlys, bdParty, bdPhotoBar };
  // Oslo: første gang med modulen lastet går Commons-settet foran (photoLoad kjørte kanskje før modulen).
  if (pref('photo') === 'oslo') PAPER.photoRotate('oslo').catch(() => {});
  bgKey = ''; bgTick(); setInterval(() => { bgTick(); agoTick(); }, 60_000);
  maiLoad();
  hlApi('/me/layout').then((r) => { if (r?.vaer_layout && typeof r.vaer_layout === 'object') { WXL.d = r.vaer_layout; lsSet('vaer_layout', r.vaer_layout); } }).catch(() => {});
  document.addEventListener('pointerdown', wxDown, true);
  document.addEventListener('pointermove', (e) => { if (WXL.lp && (Math.abs(e.clientX - WXL.lp.x) > 8 || Math.abs(e.clientY - WXL.lp.y) > 8)) wxCancel(); }, true);
  document.addEventListener('pointerup', wxCancel, true); document.addEventListener('pointercancel', wxCancel, true);
  document.addEventListener('scroll', wxCancel, { capture: true, passive: true });
  addEventListener('resize', () => { const f = innerWidth >= 600; if (f !== boot41.f) { boot41.f = f; if (m.screen === 'hl') draw(); } });
  boot41.f = innerWidth >= 600;
  B.boot41b();
}
