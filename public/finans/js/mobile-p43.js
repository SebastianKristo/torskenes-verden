// Prompt 43 (PWA43): mobilpunktene i design_handoff_homelab/prompts/prompt-43-pakke/ som trenger ny kode.
//   · Media (mobile-p43m.js, lastes herfra) + Hjem-widget «Media» (h16) og Widgets-siden (Innstillinger → Widgets)
//   · Gjøremål: hold inne på en pille → «Rekkefølge på lister» (dra ≡ eller ▲▼, Tilbakestill), «+ Ny liste» alltid sist
//   · Chat → AI-kontroll → Importer: minne og samtaler fra Claude (POST /api/chat/import/claude …)
//   · Stor skjerm (iPad/Fold, ≥ 600 og bredde ≥ 0,9 × høyde): klasse p43-big på roten (sentrerte ark, kolonner)
// Saldokortet (mobile-paper.js), månedstopp og Glimt-pillen (mobile-paper2.js/-paper3.js), Domener-raden (mobile-p38.js),
// send-knappen (mobile-chat.js), svarboblen (mobile-p31.js/-p41.js) og Integrasjoner MEDIA (mobile-p26.js) ligger der koden fra før bor.
// Lastes med dynamisk import fra mobile.js (statiske importer herfra er trygge fordi resten allerede er evaluert).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { HK } from './mobile-p17.js';
import * as P37 from './mobile-p37.js';
import { glimtOrb } from './mobile-orb43.js';

let MED = null; // mobile-p43m.js
export const media = () => MED;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const svg = (d, s = 18, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/* =====================================================================
   1. Hjem-widget «Media» (h16 – h12 er Glimt-brief i appene)
   ===================================================================== */
/** «MEDIA · LASTES NED» med tre nedlastinger og «KOMMER» med to neste. Skjules når ingenting skjer (utenfor redigering). */
export function mediaHome(edit) {
  if (!MED) return '';
  const W = MED.MW;
  if (!W.d && !W.busy) { W.busy = true; MED.widgetLoad().finally(() => { W.busy = false; if (m.screen === 'hl') draw(); }); }
  const tor = (W.d?.tor ?? []).filter((t) => t.st !== 'seed'), nx = (W.d?.upc ?? []).filter((x) => x.air && Date.parse(x.air) >= Date.now() - 6 * 3600e3).sort((a, b) => String(a.air).localeCompare(String(b.air))).slice(0, 2);
  if (!tor.length && !nx.length) return edit ? `<div class="pp-card p43-mw"><span class="p43-mwh"><span class="pp-lab">MEDIA</span></span><span class="pp-mut">Ingenting lastes ned, og ingenting kommer de neste 7 dagene. Kortet skjules da av seg selv.</span></div>` : '';
  const rows = MED.torRows(tor.slice(0, 3)).map((r) => `<span class="p43-mwr"><span class="p43-mwt"><span class="m-ell"><b>${esc(r.nm)}</b> <span class="pp-mut">${esc(['Film', 'Egen'].includes(r.ep) ? '' : r.ep)}</span></span><b class="mono" style="color:${r.st === 'stall' ? 'var(--pp-warn,#a0671a)' : 'var(--pp-ink)'}">${r.st === 'stall' ? 'står fast' : `${Math.floor(r.p)} %`}</b></span><i class="p43-bar"><i style="width:${r.p}%;background:${r.st === 'stall' ? '#c48a1a' : 'var(--pp-ink)'}"></i></i></span>`).join('');
  const nxt = nx.map((x) => `<span class="p43-mwn">${MED.poster(x, 22, 32)}<span class="m-grow"><b class="m-ell">${esc(x.t)}</b><span class="pp-mut">${esc(x.e)} · ${esc(new Date(x.air).toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', ''))}${x.tm ? ` ${esc(x.tm)}` : ''}</span></span></span>`).join('');
  return `<a class="pp-card p43-mw" href="#/media" data-p43="mw" data-k="${tor.length ? 'qb' : 'kom'}"><span class="p43-mwh"><span class="pp-lab">MEDIA · ${tor.length ? 'LASTES NED' : 'KOMMER'}</span><span class="pp-mut">alle ›</span></span>${rows}${rows && nxt ? '<span class="p43-mwl"></span><span class="pp-lab mut">KOMMER</span>' : ''}${nxt}</a>`;
}

/* =====================================================================
   2. Widgets-siden (Innstillinger → Widgets), fasit Widget Galleri.dc.html
   ===================================================================== */
const plat = () => { const ua = navigator.userAgent || ''; if (/android/i.test(ua)) return /SM-|samsung/i.test(ua) ? 'sam' : 'and'; return 'ios'; };
const SZ = { s: ['Liten', '2 × 2', 110, 110, '20px'], m: ['Medium', '4 × 2', 230, 110, '20px'], l: ['Stor', '4 × 4', 230, 140, '20px'], lk: ['Låseskjerm', 'rektangel', 160, 70, '14px'] };
const WG = { f: 'all', how: null, cat: null, t: 0 };
function wDefs() {
  const W = MED?.MW?.d, tor = (W?.tor ?? []).filter((t) => t.st !== 'seed'), top = tor[0], sp = tor.reduce((a, t) => a + (t.pz ? 0 : t.spd), 0);
  const spT = `↓ ${String(Math.round(sp * 10) / 10).replace('.', ',')} MB/s`, nx = (W?.upc ?? []).slice(0, 3).map((x) => x.t);
  const media = [['s', 'MEDIA', spT, [`${tor.length} aktive`, top ? `${top.nm} ${Math.floor(top.p)} %` : 'Ingenting lastes ned']], ['m', 'LASTES NED', `${tor.length} nedlastinger`, [...tor.slice(0, 2).map((t) => `${t.nm} · ${Math.floor(t.p)} %`), nx[0] ? `Neste: ${nx[0]}` : '']], ['l', 'MEDIA', spT, [`Pause alt · ${tor.length} nedlastinger`, nx.length ? `Kommer: ${nx.join(', ')}` : 'Ingenting kommer']], ['lk', 'MEDIA', spT, [top ? `${top.nm} ${Math.floor(top.p)} %` : 'Ingen nedlastinger']]];
  const D0 = [['media', 'MEDIA', 'Media', media], ['avg', 'AVGANGER', 'Avganger', [['s', 'AVGANGER', 'Neste avgang', ['Fra holdeplassen din']], ['m', 'AVGANGER', 'To neste', ['Linje og minutter', 'Sanntid fra Entur']], ['l', 'AVGANGER', 'Tre stopp', ['Favorittstoppene dine']], ['lk', 'AVGANGER', 'Neste avgang', ['Linje · minutter']]]],
    ['kal', 'KALENDER', 'Kalender', [['s', 'I DAG', 'Neste avtale', ['Tid og sted']], ['m', 'I DAG', 'Dagens avtaler', ['Tre neste', 'I morgen']], ['l', 'UKEN', 'Uka', ['Hele uka med frister']], ['lk', 'NESTE', 'Neste avtale', ['Tid og sted']]]],
    ['trial', 'PRØVEPERIODER', 'Prøveperioder', [['s', 'PRØVE', 'Går ut snart', ['Sies opp i tide']], ['m', 'PRØVEPERIODER', 'Går ut', ['Tjeneste · dager igjen']]]],
    ['pk', 'PAKKER', 'Pakker', [['s', 'PAKKER', 'På vei', ['Neste levering']], ['m', 'PAKKER', 'På vei', ['Pakke · når', 'Pakke · når']]]],
    ['gl', 'GLIMT', 'Glimt-brief', [['m', 'BRIEF', 'Dagens brief', ['Vær · neste avtale']], ['lk', 'GLIMT', 'Brief', ['Neste avtale']]]]];
  // Katalogen fra serveren (GET /api/widgets/catalog) bestemmer hvilke som finnes; mangler den, brukes lista over.
  const cat = WG.cat;
  const CM = { media: 'media', avganger: 'avg', kalender: 'kal', prove: 'trial', pakker: 'pk', brief: 'gl' };
  return cat?.length ? D0.filter(([id]) => cat.some((c) => (CM[c.id] ?? c.id) === id)) : D0;
}
export function widgetGallery() {
  if (MED && !MED.MW.d && Date.now() - MED.MW.t > 60000) MED.widgetLoad().then(draw).catch(() => {});
  if (!WG.t) { WG.t = Date.now(); hlApi(`/widgets/catalog?platform=${plat() === 'ios' ? 'ios' : 'android'}${plat() === 'sam' ? '&samsung=1' : ''}`).then((r) => { WG.cat = Array.isArray(r) ? r : r?.groups ?? r?.items ?? null; draw(); }).catch(() => {}); }
  const p = plat(), and = p !== 'ios', sam = p === 'sam';
  const look = and ? (sam ? { bg: 'rgba(255,255,255,.96)', fg: '#111', ac: '#1f6fe5', wall: 'linear-gradient(180deg,#5b7fa8,#1d2d45)' } : { bg: '#fbe9e1', fg: '#3a1d12', ac: '#8a4a32', wall: 'linear-gradient(170deg,#c9805f,#7a3d2c)' }) : { bg: '#fffdf8', fg: '#1b1a17', ac: '#b23a2a', wall: 'linear-gradient(160deg,#5f7d97,#2c3d52)' };
  const G = wDefs().map(([id, t, n, L]) => ({ id, t, n, L: L.filter((x) => (and ? x[0] !== 'lk' : true)) }));
  const F = [['all', 'Alle'], ...G.map((g) => [g.id, g.n])];
  const card = (g, [sz, k, big, lines]) => { const S = SZ[sz], lock = sz === 'lk', ph = sz === 'l' ? 140 : S[3];
    return `<div class="p43-wc${sz === 's' || lock ? ' sm' : ''}"><div class="p43-wwall" style="background:${look.wall}"><div class="p43-wp${lock ? ' lk' : ''}" style="width:${S[2]}px;height:${ph}px;border-radius:${S[4]};${lock ? '' : `background:${look.bg};color:${look.fg}`}"><span class="p43-wk" style="color:${lock ? '#fff' : look.ac}">${esc(k)}</span><b class="${sz === 's' || lock ? 'sm' : ''}">${esc(big)}</b>${lines.filter(Boolean).map((l) => `<span>${esc(l)}</span>`).join('')}</div></div>
      <div class="p43-wn"><b>${esc(`${g.n} · ${S[0].toLowerCase()}`)}</b><span class="pp-mut">${esc(and && !lock ? S[1] : S[0])}</span></div><button type="button" class="p43-btn ink" data-p43="whow" data-g="${esc(g.n)}" data-sz="${sz}">${and ? 'Slik legger du til' : 'Slik legger du til'}</button></div>`; };
  return `<div class="p43-wg"><span class="pp-mut p43-wi">${and ? 'Alle widgetene fra Homelab. I Homelab-appen for Android legger «Legg til på startskjermen» den rett inn. Her i nettappen viser vi hvordan du gjør det selv.' : 'Alle widgetene fra Homelab. Hold inne på Hjem-skjermen og trykk + for å legge til. Låseskjerm-widgets legges til fra låseskjermen.'}</span>
    <span class="pp-mut p43-wi">Widgets finnes bare i Homelab-appen (App Store / APK), ikke i nettappen lagt på Hjem-skjermen.</span>
    <div class="p43-chips">${F.map(([k, n]) => `<button type="button" class="p43-chip${WG.f === k ? ' on' : ''}" data-p43="wf" data-k="${k}" aria-pressed="${WG.f === k}">${esc(n)}</button>`).join('')}</div>
    ${G.filter((g) => WG.f === 'all' || WG.f === g.id).map((g) => `<section class="p43-wgs"><div class="p43-wgh"><span class="pp-lab">${esc(g.t)}</span><span class="pp-mut">${g.L.length} størrelser</span></div><div class="p43-wrow">${g.L.map((x) => card(g, x)).join('')}</div></section>`).join('')}</div>`;
}
function howSheet() {
  const h = WG.how; if (!h) return '';
  const and = plat() !== 'ios', lock = h.sz === 'lk';
  const steps = and ? ['Installer Homelab-appen (APK) og åpne den én gang.', 'Gå til Innstillinger → Widgets i appen og trykk «Legg til på startskjermen», eller hold inne på et tomt sted på startskjermen → Widgets.', `Finn Homelab, velg «${h.n}» og dra den dit du vil ha den.`]
    : lock ? ['Hold inne på låseskjermen og trykk Tilpass → Låseskjerm.', 'Trykk på feltet under klokka.', `Velg Homelab og «${h.n}».`] : ['Hold inne på et tomt sted på Hjem-skjermen til ikonene vugger.', 'Trykk + oppe til venstre og søk etter «Homelab».', `Velg «${h.n}», sveip til riktig størrelse og trykk «Legg til widget».`];
  return `<div class="p43-scrim" data-p43="whx"></div><div class="p43-sheet" role="dialog" aria-modal="true" aria-label="Legg til widget"><span class="p43-grab" aria-hidden="true"></span><b class="p43-serif24">Legg til «${esc(h.n)}»</b>
    ${steps.map((t, i) => `<div class="p43-step"><span>${i + 1}</span><span>${esc(t)}</span></div>`).join('')}<span class="pp-mut p43-sm">${and ? 'Nettappen kan ikke legge til widgets selv. I Homelab-appen gjør Android det med ett trykk.' : `Apple lar ikke apper legge til widgets selv. Widgeten heter «${esc(h.n.split(' · ')[0])}» under Homelab i galleriet.`}</span><button type="button" class="p43-btn ink lg" data-p43="whx">Ferdig</button></div>`;
}

/* =====================================================================
   3. Gjøremål: «Rekkefølge på lister» (hold inne 0,45 s på en pille)
   ===================================================================== */
const ORD = { open: false, lp: null, sup: 0, drag: null };
function ordSheet() {
  if (!ORD.open || m.screen !== 'huske') return '';
  const E = P37.tabEntries();
  return `<div class="p43-scrim${ORD.seen ? ' still' : ''}" data-p43="ordx"></div><div class="p43-sheet p43-ord${ORD.seen ? ' still' : ''}" role="dialog" aria-modal="true" aria-label="Rekkefølge på lister"><span class="p43-grab" aria-hidden="true"></span>
    <div class="p43-shh"><b>Rekkefølge på lister</b><button type="button" class="p43-btn ink sm" data-p43="ordx">Ferdig</button></div>
    <span class="pp-mut p43-sm">Dra i ≡ eller bruk pilene. «+ Ny liste» ligger alltid sist.</span>
    <div class="p43-ol" data-p43ol>${E.map((e, i) => `<div class="p43-or${ORD.drag?.k === e.k ? ' drag' : ''}" data-k="${esc(e.k)}"><i style="background:${e.glimt ? 'linear-gradient(135deg,#b23a2a,#7a5ad6)' : esc(e.c || 'var(--pp-ink)')}"></i><b class="m-grow m-ell">${esc(e.n)}</b><span class="pp-mut">${e.cnt}</span>
      <button type="button" class="p43-oa" data-p43="ordup" data-i="${i}" aria-label="Flytt ${esc(e.n)} opp" ${i ? '' : 'disabled'}>▲</button><button type="button" class="p43-oa" data-p43="orddn" data-i="${i}" aria-label="Flytt ${esc(e.n)} ned" ${i < E.length - 1 ? '' : 'disabled'}>▼</button><span class="p43-og" data-p43og="${esc(e.k)}" role="button" tabindex="0" aria-label="Dra ${esc(e.n)}">≡</span></div>`).join('')}</div>
    <div class="p43-or new" aria-hidden="true"><b class="m-grow">+ Ny liste</b><span class="pp-mut">alltid sist</span></div>
    <button type="button" class="p43-btn ghost" data-p43="ordreset">Tilbakestill</button></div>`;
}
function ordMove(i, j, push = true) {
  const keys = P37.tabEntries().map((e) => e.k); if (j < 0 || j >= keys.length) return;
  const [k] = keys.splice(i, 1); keys.splice(j, 0, k); P37.setTabOrder(keys, push); haptic('tab'); draw();
}
function lpDown(e) {
  if (m.screen !== 'huske' || (e.button ?? 0) > 0) return;
  const og = e.target.closest?.('[data-p43og]');
  if (og && ORD.open) { e.preventDefault(); const keys = P37.tabEntries().map((x) => x.k); ORD.drag = { k: og.dataset.p43og, y: e.clientY, i: keys.indexOf(og.dataset.p43og), h: og.closest('.p43-or')?.offsetHeight || 56, moved: false }; try { og.setPointerCapture?.(e.pointerId); } catch {} draw(); return; }
  const c = e.target.closest?.('.p37-lc[data-p37="list"]'); if (!c || ORD.open) return;
  clearTimeout(ORD.lp?.t);
  ORD.lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { ORD.lp = null; ORD.sup = Date.now(); ORD.open = true; vib(12); haptic('tap'); draw(); }, 450) };
}
function lpMove(e) {
  if (ORD.lp && (Math.abs(e.clientX - ORD.lp.x) > 8 || Math.abs(e.clientY - ORD.lp.y) > 8)) { clearTimeout(ORD.lp.t); ORD.lp = null; }
  const d = ORD.drag; if (!d) return;
  e.preventDefault();
  const dy = e.clientY - d.y;
  if (Math.abs(dy) > d.h / 2) { const dir = dy > 0 ? 1 : -1, n = P37.tabEntries().length, j = d.i + dir; if (j >= 0 && j < n) { ordMove(d.i, j, false); d.i = j; d.y += dir * d.h; d.moved = true; } }
  const row = document.querySelector(`.p43-or[data-k="${CSS.escape(d.k)}"]`); if (row) row.style.transform = `translateY(${e.clientY - d.y}px)`;
}
function lpUp() {
  if (ORD.lp) { clearTimeout(ORD.lp.t); ORD.lp = null; }
  const d = ORD.drag; if (!d) return; ORD.drag = null;
  if (d.moved) P37.setTabOrder(P37.tabEntries().map((e) => e.k), true);
  draw();
}

/* =====================================================================
   4. Claude-import (AI-kontroll → Importer), fasit Claude Import.dc.html
   ===================================================================== */
export const CI = { src: 'claude', srcs: null, api45: true, st: 'start', err: '', mem: '', q: '', d: null, sel: {}, msel: {}, oChats: true, oMem: true, oSkip: true, steps: [], file: '', p: 0, res: null, busy: false };
const fmtD = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }); };
const HOW = [['claude.ai → Innstillinger → Personvern → Eksporter data', 'På mobil: profil → Innstillinger → Personvern.'], ['Du får en e-post med lenke', 'Lenken er gyldig i 24 timer. Last ned ZIP-fila.'], ['Velg fila her', 'Homelab leser conversations.json, projects.json og minnet hvis det ligger med. Alt lagres på hjemmeserveren.'], ['Minnet', 'Claude → Innstillinger → Minne → Vis og rediger → kopier teksten og lim den inn under hvis den ikke er i ZIP-fila.']];
// Prompt 45 (claude-code-ai-import-claude-chatgpt-gemini.md): tre kilder – Claude (fikset), ChatGPT og Gemini (Google Takeout).
// POST /api/ai/import (multipart, source) → forhåndsvisning; store filer bitvis via /api/ai/import/upload; commit og angre per import.
// Eldre server (404): Claude via /api/chat/import/claude som før.
const SRC45 = {
  claude: { n: 'Claude', c: '#d97757', logo: 'claude.ai', folder: 'Claude', files: 'ZIP-fila fra e-posten, eller conversations.json', how: HOW },
  chatgpt: { n: 'ChatGPT', c: '#10a37f', logo: 'chatgpt.com', folder: 'ChatGPT', files: 'ZIP-fila fra e-posten, eller conversations.json', how: [['chatgpt.com → Innstillinger → Datakontroller → Eksporter data', 'Trykk «Eksporter». På mobil: profil → Datakontroller.'], ['Du får en e-post med lenke', 'Lenken er gyldig i 24 timer. Last ned ZIP-fila.'], ['Velg fila her', 'Homelab leser conversations.json (samtaletreet flates ut i rekkefølge) og minnet hvis det ligger med.']] },
  gemini: { n: 'Gemini', c: '#4285f4', logo: 'gemini.google.com', folder: 'Gemini', files: 'ZIP fra Google Takeout (My Activity → Gemini Apps), HTML eller JSON', how: [['takeout.google.com', 'Fjern alle avkrysninger, velg bare «Min aktivitet» → «Gemini Apps».'], ['Velg format', 'HTML eller JSON går fint. Eksporter én gang.'], ['Last ned ZIP-fila', 'Google sender lenke på e-post når eksporten er klar.'], ['Velg fila her', 'Homelab leser spørsmål og svar med tidspunkt. Ingenting kjøres, HTML blir ren tekst.']] },
};
const srcOf = () => SRC45[CI.src] ?? SRC45.claude;
const srcLogo = (k, sz = 26) => { const S0 = SRC45[k]; return `<span class="p43-cil p45-cil" style="--c:${S0.c}"><img src="/finans/api/logo/${S0.logo}" alt="" width="${sz}" height="${sz}" data-p45fb="${S0.n[0]}"></span>`; };
const convOf = (d) => (Array.isArray(d?.items) ? d.items : Array.isArray(d?.conversations) ? d.conversations : []).map((c) => ({ id: String(c.id ?? c.uuid), t: c.title ?? c.name ?? 'Uten tittel', d: c.updated_at ?? c.updatedAt ?? c.date ?? c.created_at, n: c.messages ?? c.messageCount ?? c.count ?? (c.chat_messages ?? []).length ?? 0, old: !!(c.imported ?? c.importedBefore ?? c.exists) }));
const memOf = (d) => (Array.isArray(d?.memory) ? d.memory : []).map((x, i) => ({ id: String(x.id ?? i), t: typeof x === 'string' ? x : x.text ?? x.t ?? '', old: !!x.exists }));
export function claudeImport() {
  if (!CI.srcsT) { CI.srcsT = 1; hlApi('/ai/import/sources').then((r) => { CI.srcs = r?.sources ?? []; if (m.screen === 'aictl') draw(); }).catch(() => {}); } // prompt 45
  const S0 = srcOf();
  const pick = CI.st === 'start' ? `<div class="p45-cisrc" role="radiogroup" aria-label="Velg kilde">${Object.entries(SRC45).map(([k, o]) => `<button type="button" role="radio" aria-checked="${CI.src === k}" class="${CI.src === k ? 'on' : ''}" data-p43="cisrc" data-k="${k}" style="--c:${o.c}">${srcLogo(k, 20)}<b>${o.n}</b></button>`).join('')}</div>` : '';
  const head = `${pick}<div class="p43-card p43-cih">${srcLogo(CI.src)}<div class="m-grow"><b class="p43-serif22">Importer fra ${S0.n}</b><span class="pp-mut">Samtaler havner i Chat i mappen «${S0.folder}». Minnet brukes av Chat og Glimt. Alt lagres på hjemmeserveren.</span></div></div>`;
  if (CI.st === 'reading' || CI.st === 'importing') return `<div class="p43-ci">${head}<div class="p43-card p43-col">${CI.steps.map(([n, ms]) => `<div class="p43-gs"><span>✓ ${esc(n)}</span><span>${esc(ms)}</span></div>`).join('')}<b>${CI.st === 'reading' ? (CI.p && CI.p < 100 ? `Laster opp ${esc(CI.file)} … ${CI.p} %` : `Leser ${esc(CI.file)} …`) : 'Importerer …'}</b>${CI.st === 'importing' ? '<i class="p43-bar t"><i class="p43-ind"></i></i>' : CI.p && CI.p < 100 ? `<i class="p43-bar t"><i style="width:${CI.p}%"></i></i>` : '<div class="m-spin"></div>'}</div></div>`;
  if (CI.st === 'done') { const R = CI.res ?? {};
    return `<div class="p43-ci">${head}<div class="p43-card p43-cidone"><b class="p43-serif24">✓ ${esc(`${R.conversations ?? 0} samtaler og ${R.memory ?? 0} minnepunkter importert`)}</b><span class="pp-mut">Samtalene ligger i mappen «${esc(R.folder ?? srcOf().folder)}» i Chat.${R.indexed ? ` ${R.indexed} er indeksert som Glimt-minne.` : ''} Minnet ligger under Chat → ⚙ → Minne.${R.skipped ? ` ${R.skipped} var importert før og ble hoppet over.` : ''}</span>
      <div class="p43-row wr"><button type="button" class="p43-btn ink" data-p43="ciopen">Åpne Chat</button><button type="button" class="p43-btn ghost" data-p43="cireset">Importer mer</button><button type="button" class="p43-btn plain lab" data-p43="ciundo" ${CI.busy ? 'disabled' : ''}>${CI.busy ? 'Angrer …' : 'Angre importen'}</button></div></div></div>`; }
  if (CI.st === 'preview') {
    const C = convOf(CI.d), Mm = memOf(CI.d), qq = CI.q.trim().toLowerCase(), vis = C.filter((c) => !qq || c.t.toLowerCase().includes(qq));
    const selN = C.filter((c) => CI.sel[c.id]).length, memN = Mm.filter((x) => CI.msel[x.id]).length;
    const msgs = CI.d?.messages ?? C.reduce((a, c) => a + (+c.n || 0), 0), proj = CI.d?.projects ?? [];
    const rg = CI.d?.range, range = typeof rg === 'string' ? rg : rg?.from ? `Fra ${fmtD(rg.from)} til ${fmtD(rg.to)}` : '';
    const projT = Array.isArray(proj) ? proj.map((p) => p.name ?? p).join(', ') : '';
    const stats = [[C.length || CI.d?.conversations || 0, 'samtaler'], [msgs, 'meldinger'], [Array.isArray(proj) ? proj.length : proj, 'prosjekter'], [Mm.length, 'minnepunkter']];
    const ck = (on) => `<span class="p43-ck${on ? ' on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>`;
    const go = (CI.oChats ? selN : 0), gm = (CI.oMem ? memN : 0);
    return `<div class="p43-ci">${head}<div class="p43-cist">${stats.map(([v, l]) => `<div class="p43-card"><b class="p43-serif28">${Number(v).toLocaleString('nb-NO')}</b><span class="pp-mut">${l}</span></div>`).join('')}</div>
      ${range || projT ? `<span class="pp-mut p43-sm">${esc([range, projT ? `prosjekter: ${projT}` : ''].filter(Boolean).join(' · '))}</span>` : ''}
      ${C.length ? `<div class="p43-sec"><span class="p43-kh"><span class="p43-k mut">SAMTALER · ${selN} VALGT</span><span class="p43-row"><button type="button" class="p43-btn ghost sm" data-p43="ciall">Alle</button><button type="button" class="p43-btn ghost sm" data-p43="cinone">Ingen</button></span></span>
        <input class="p43-in" data-p43i="ciq" value="${esc(CI.q)}" placeholder="Søk i titler" autocomplete="off">
        <div class="p43-card p43-cil2">${vis.slice(0, CI.more ?? 60).map((c) => `<button type="button" class="p43-cr" data-p43="cisel" data-id="${esc(c.id)}" aria-pressed="${!!CI.sel[c.id]}">${ck(CI.sel[c.id])}<span class="m-grow"><b class="m-ell">${esc(c.t)}</b><span class="pp-mut">${esc([fmtD(c.d), `${c.n} meldinger`, c.old ? 'Importert før' : ''].filter(Boolean).join(' · '))}</span></span></button>`).join('')}</div>
        ${vis.length > (CI.more ?? 60) ? `<button type="button" class="p43-btn plain" data-p43="cimore">Vis flere (${vis.length - (CI.more ?? 60)} til)</button>` : ''}</div>` : ''}
      ${Mm.length ? `<div class="p43-sec"><span class="p43-k mut">MINNE · ${memN} AV ${Mm.length} PUNKTER</span><div class="p43-card p43-cil2">${Mm.map((x) => `<button type="button" class="p43-cr" data-p43="cimsel" data-id="${esc(x.id)}" aria-pressed="${!!CI.msel[x.id]}">${ck(CI.msel[x.id])}<span class="m-grow">${esc(x.t)}</span></button>`).join('')}</div></div>` : ''}
      <div class="p43-card p43-togs">${[['oChats', 'Importer samtaler', `Til mappen «${srcOf().folder}» i Chat`], ['oMem', 'Importer minne', 'Brukes av Chat og Glimt'], ['oSkip', 'Hopp over det som er importert før', `Samme samtale-ID fra ${srcOf().n}`]].map(([k, n, s]) => `<button type="button" class="p43-tr2" data-p43="ciopt" data-k="${k}" aria-pressed="${CI[k]}"><span class="m-grow"><b>${n}</b><span class="pp-mut">${s}</span></span><span class="p43-tg${CI[k] ? ' on' : ''}" aria-hidden="true"><i></i></span></button>`).join('')}</div>
      ${CI.err ? `<span class="p43-err">${esc(CI.err)}</span>` : ''}
      <div class="p43-row two"><button type="button" class="p43-btn ghost lg" data-p43="cireset">Avbryt</button><button type="button" class="p43-btn ink lg" data-p43="cigo" ${go + gm ? '' : 'disabled'}>Importer ${go} samtaler${gm ? ` og ${gm} minnepunkter` : ''}</button></div></div>`;
  }
  const HW = (CI.srcs?.find?.((x) => x.id === CI.src)?.steps ?? []).length ? CI.srcs.find((x) => x.id === CI.src).steps.map((t) => (Array.isArray(t) ? t : [String(t), ''])) : S0.how;
  return `<div class="p43-ci">${head}<div class="p43-card p43-col"><span class="pp-lab">SLIK EKSPORTERER DU FRA ${S0.n.toUpperCase()}</span>${HW.map(([t, d], i) => `<div class="p43-step"><span>${i + 1}</span><span class="m-grow"><b>${esc(t)}</b><span class="pp-mut">${esc(d)}</span></span></div>`).join('')}</div>
    <label class="p43-drop" data-p43drop>${svg('M12 16V4M7 9l5-5 5 5M4 20h16', 28)}<b>Velg ${S0.n}-eksporten</b><span class="pp-mut">${esc(S0.files)} · maks 1 GB</span><input type="file" accept=".zip,.json,.html,.htm,application/zip,application/json,text/html" data-p43file="claude" hidden></label>
    ${CI.err ? `<span class="p43-err">${esc(CI.err)}</span>` : ''}
    <div class="p43-sec"><span class="p43-k mut">MINNE (VALGFRITT)</span><textarea class="p43-in ta" rows="4" data-p43i="cimem" placeholder="${CI.src === 'chatgpt' ? 'Lim inn fra ChatGPT → Innstillinger → Tilpasning → Minne' : CI.src === 'gemini' ? 'Lim inn fra Gemini → Lagret info' : 'Lim inn teksten fra Claude → Innstillinger → Minne'}, ett punkt per linje">${esc(CI.mem)}</textarea><span class="pp-mut p43-sm">Ligger minnet i ZIP-fila, hentes det automatisk.</span></div>
    <div class="p43-row wr"><button type="button" class="p43-btn ghost" data-p43="cimemonly" ${CI.mem.trim() ? '' : 'disabled'}>Importer bare minnet</button></div></div>`;
}
const REASON = { not_zip: 'Fila er ikke en gyldig ZIP.', no_conversations: 'Fant ingen samtaler i fila. Sjekk at du valgte riktig eksport.', too_big: 'Fila er for stor.', zip_bomb: 'ZIP-fila pakker ut til mer enn grensen (2 GB) og ble stoppet.', bad_json: 'JSON-fila kunne ikke leses (ødelagt eller ufullstendig).', unknown_format: 'Kjenner ikke igjen formatet.', expired: 'Forhåndsvisningen har gått ut. Velg fila på nytt.' };
const ciErr = (d, status) => { const r = REASON[d?.reason]; return [r ?? d?.error ?? `Homelab svarte ${status}`, d?.detail].filter(Boolean).join(' · '); };
/** Bitvis opplasting (16 MB per bit) for store filer – kreves bak Cloudflare over 100 MB. Returnerer uploadId. */
async function ciChunks(file) {
  const CH = 8 * 1024 * 1024, total = Math.ceil(file.size / CH); let id = null;
  for (let i = 0; i < total; i++) {
    const h = { 'Content-Type': 'application/octet-stream', 'X-Chunk-Index': String(i), 'X-Chunk-Total': String(total), 'X-File-Name': encodeURIComponent(file.name) };
    if (id) h['X-Upload-Id'] = id;
    const res = await fetch('/api/ai/import/upload', { method: 'POST', headers: h, body: file.slice(i * CH, (i + 1) * CH) });
    const d = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(ciErr(d, res.status)), { status: res.status });
    id = d?.uploadId ?? id; CI.p = Math.round(((i + 1) / total) * 100); draw();
  }
  return id;
}
async function ciUpload(file) {
  if (!file) return;
  if (file.size > 1024 * 1024 * 1024) { CI.err = 'Fila er større enn 1 GB.'; draw(); return; }
  if (!/\.(zip|json|html?)$/i.test(file.name) && !/zip|json|html/.test(file.type)) { CI.err = `Velg ZIP-fila fra ${srcOf().n}, en JSON- eller HTML-fil.`; draw(); return; }
  CI.st = 'reading'; CI.file = file.name; CI.err = ''; CI.steps = []; CI.p = 0; draw();
  const t0 = performance.now();
  try {
    let res, d;
    if (CI.api45) {
      if (file.size > 50 * 1024 * 1024) {
        const uploadId = await ciChunks(file);
        res = await fetch('/api/ai/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId, source: CI.src, memory: CI.mem.trim() || undefined }) });
      } else { const fd = new FormData(); fd.append('file', file, file.name); fd.append('source', CI.src); if (CI.mem.trim()) fd.append('memory', CI.mem.trim()); res = await fetch('/api/ai/import', { method: 'POST', body: fd }); }
      if (res.status === 404 && CI.src === 'claude') CI.api45 = false;
      else if (res.status === 404) throw Object.assign(new Error(`Import fra ${srcOf().n} krever en nyere Homelab-server.`), { status: 404, own: true });
    }
    if (!CI.api45) { const fd = new FormData(); fd.append('file', file, file.name); if (CI.mem.trim()) fd.append('memory', CI.mem.trim()); res = await fetch('/api/chat/import/claude', { method: 'POST', body: fd }); }
    d = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) throw Object.assign(new Error(ciErr(d, res.status)), { status: res.status });
    if (d?.source && SRC45[d.source] && d.source !== CI.src) CI.src = d.source; // serveren kjente igjen kilden
    CI.steps = (d?.steps ?? []).map((s) => [s.n ?? s.t ?? s.text ?? String(s), s.ms != null ? `${s.ms} ms` : '']);
    if (!CI.steps.length) CI.steps = [['Lastet opp og leste fila', `${Math.round(performance.now() - t0)} ms`]];
    CI.d = d; CI.st = 'preview'; CI.q = ''; CI.more = 60; CI.p = 0;
    CI.sel = Object.fromEntries(convOf(d).map((c) => [c.id, c.selected ?? !c.old])); CI.msel = Object.fromEntries(memOf(d).map((x) => [x.id, !x.old]));
    if ((d?.warnings ?? []).length) CI.err = d.warnings.join(' · ');
    haptic('ok');
  } catch (e) { CI.st = 'start'; CI.p = 0; CI.err = e.own ? e.message : e.status === 404 ? 'Import krever en nyere Homelab-server.' : e.status === 413 ? 'Fila er for stor for serveren.' : e.message; haptic('err'); }
  draw();
}
async function ciCommit(memOnly) {
  if (CI.busy) return;
  const C = convOf(CI.d), Mm = memOf(CI.d);
  const conversationIds = memOnly || !CI.oChats ? [] : C.filter((c) => CI.sel[c.id] && !(CI.oSkip && c.old)).map((c) => c.id);
  const memory = memOnly ? CI.mem.split(/\n+/).map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter((l) => l.length > 3) : !CI.oMem ? [] : Mm.filter((x) => CI.msel[x.id]).map((x) => x.t);
  CI.busy = true; CI.st = 'importing'; CI.steps = []; draw();
  try {
    let id = CI.d?.importId;
    const base = CI.api45 ? '/ai/import' : '/chat/import/claude';
    if (memOnly && !id) { const fd = new FormData(); fd.append('memory', CI.mem.trim()); if (CI.api45) fd.append('source', CI.src); let r0 = await fetch(`/api${base}`, { method: 'POST', body: fd }); if (r0.status === 404 && CI.api45 && CI.src === 'claude') { CI.api45 = false; r0 = await fetch('/api/chat/import/claude', { method: 'POST', body: fd }); } const d0 = await r0.json().catch(() => null); if (!r0.ok) throw Object.assign(new Error(d0?.error || `Homelab svarte ${r0.status}`), { status: r0.status }); id = d0?.importId; CI.d = d0; }
    const r = await hlApi(`${CI.api45 ? '/ai/import' : '/chat/import/claude'}/${encodeURIComponent(id)}/commit`, { method: 'POST', json: { conversationIds, memory, skipExisting: CI.oSkip, importConversations: !memOnly && CI.oChats, importMemory: memOnly || CI.oMem } });
    CI.res = { conversations: r?.conversations ?? r?.imported ?? conversationIds.length, memory: r?.memory ?? r?.memoryAdded ?? memory.length, skipped: r?.skipped ?? C.filter((c) => CI.sel[c.id] && c.old).length, id, folder: r?.folder, indexed: r?.indexed, text: r?.text };
    CI.st = 'done'; haptic('ok'); vib(10);
  } catch (e) { CI.st = memOnly ? 'start' : 'preview'; CI.err = e.status === 404 ? 'Import fra Claude krever en nyere Homelab-server.' : e.message; haptic('err'); }
  CI.busy = false; draw();
}

/* =====================================================================
   5. Stor skjerm (iPad og Fold)
   ===================================================================== */
// iPad (≥ 768) liggende og stående; Fold og smalere nettbrett (600–767) bare når bredden er ≥ 0,9 × høyden (stående Fold = mobil, bredere spalte).
export const bigOn = () => innerWidth >= 768 || (innerWidth >= 600 && innerWidth >= innerHeight * 0.9);

/* =====================================================================
   Krokene fra mobile.js
   ===================================================================== */
export function layer43() { const o = ORD.open; requestAnimationFrame(() => { ORD.seen = o; }); return (m.screen === 'set' && WG.how ? howSheet() : '') + ordSheet(); }
export function afterDraw43() {
  const r = document.querySelector('#app > .m'); if (!r) return;
  const big = bigOn();
  r.classList.toggle('p43-big', big);
  r.classList.toggle('p43-fold', big && innerWidth < 1000);
  r.classList.toggle('p43-huske', m.screen === 'huske');
  MED?.afterDraw43m?.();
}
export async function bind43(e, t) {
  if (Date.now() - ORD.sup < 650 && t.closest?.('.p37-lc')) { e.preventDefault(); e.stopPropagation(); return true; } // langt trykk velger ikke lista
  if (MED && await MED.bind43m(e, t)) return true;
  const cp = t.closest?.('[data-p43copy]');
  if (cp) { e.preventDefault(); const v = cp.textContent ?? ''; try { await navigator.clipboard.writeText(v); flash('Kopiert ✓'); } catch { const r = document.createRange(); r.selectNodeContents(cp); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); flash('Merket · kopier med Kopier'); } haptic('tap'); return true; }
  const x = t.closest?.('[data-p43]'); if (!x) return false;
  const a = x.dataset.p43;
  switch (a) {
    case 'mw': if (MED) { e.preventDefault(); haptic('tap'); MED.openFrom(x.dataset.k); } return true;
    case 'lglimt': { e.preventDefault(); haptic('tap'); const v = document.getElementById('m-txq')?.value ?? ''; const P3 = await import('./mobile-paper3.js'); await P3.fsGlimt(v); return true; }
    case 'wf': e.preventDefault(); WG.f = x.dataset.k; haptic('tab'); draw(); return true;
    case 'whow': e.preventDefault(); WG.how = { n: `${x.dataset.g} · ${{ s: 'liten', m: 'medium', l: 'stor', lk: 'låseskjerm' }[x.dataset.sz]}`, sz: x.dataset.sz }; haptic('tap'); draw(); return true;
    case 'whx': e.preventDefault(); WG.how = null; draw(); return true;
    case 'ordx': e.preventDefault(); ORD.open = false; ORD.drag = null; draw(); return true;
    case 'ordup': e.preventDefault(); ordMove(+x.dataset.i, +x.dataset.i - 1); return true;
    case 'orddn': e.preventDefault(); ordMove(+x.dataset.i, +x.dataset.i + 1); return true;
    case 'ordreset': e.preventDefault(); P37.setTabOrder(null); haptic('tap'); flash('Standard rekkefølge'); draw(); return true;
    case 'cisrc': e.preventDefault(); CI.src = SRC45[x.dataset.k] ? x.dataset.k : 'claude'; CI.err = ''; haptic('tab'); draw(); return true;
    case 'ciall': e.preventDefault(); for (const c of convOf(CI.d)) CI.sel[c.id] = true; draw(); return true;
    case 'cinone': e.preventDefault(); CI.sel = {}; draw(); return true;
    case 'cisel': e.preventDefault(); CI.sel[x.dataset.id] = !CI.sel[x.dataset.id]; draw(); return true;
    case 'cimsel': e.preventDefault(); CI.msel[x.dataset.id] = !CI.msel[x.dataset.id]; draw(); return true;
    case 'cimore': e.preventDefault(); CI.more = (CI.more ?? 60) + 60; draw(); return true;
    case 'ciopt': e.preventDefault(); CI[x.dataset.k] = !CI[x.dataset.k]; draw(); return true;
    case 'cigo': e.preventDefault(); await ciCommit(false); return true;
    case 'cimemonly': e.preventDefault(); await ciCommit(true); return true;
    case 'cireset': e.preventDefault(); Object.assign(CI, { st: 'start', err: '', d: null, sel: {}, msel: {}, q: '', res: null }); draw(); return true;
    case 'ciopen': { e.preventDefault(); const CH = await import('./mobile-chat.js'); CH.openChatFolder?.(CI.res?.folder ?? srcOf().folder) ?? (location.hash = '#/chat'); return true; }
    case 'ciundo': {
      e.preventDefault(); CI.busy = true; draw();
      try { await hlApi(`${CI.api45 ? '/ai/import' : '/chat/import/claude'}/${encodeURIComponent(CI.res?.id ?? CI.d?.importId)}/undo`, { method: 'POST', json: {} }); flash('Importen er angret'); Object.assign(CI, { st: 'start', d: null, res: null }); }
      catch (err) { flash(err.status === 404 ? 'Angre krever en nyere Homelab-server' : err.message); }
      CI.busy = false; draw(); return true;
    }
    default: return false;
  }
}
export function input43(e, t) {
  if (MED?.input43m?.(e, t)) return true;
  const k = t.dataset?.p43i; if (!k) return false;
  if (k === 'cimem') { CI.mem = t.value; const b = document.querySelector('[data-p43="cimemonly"]'); if (b) b.disabled = !t.value.trim(); return true; }
  if (k === 'ciq') { CI.q = t.value; draw(); return true; }
  return false;
}
export async function change43(e, t) {
  if (t.matches?.('[data-p43file="claude"]')) { await ciUpload(t.files?.[0]); t.value = ''; return true; }
  return false;
}
export async function submit43(e, t) { return MED ? MED.submit43m(e, t) : false; }

export function boot43() {
  globalThis.P43 = { ...globalThis.P43, mediaHome, widgetGallery, claudeImport, bigOn, glimtOrb, mediaFrom: null };
  import('./mobile-p43m.js').then((x) => { MED = x; x.boot43m(); globalThis.P43.media = x; if (document.documentElement.dataset.ui === 'mobile' && ['media', 'hl', 'set'].includes(m.screen)) draw(); }).catch((err) => console.warn('mobile-p43m', err));
  // «‹ Tilbake» i Media går dit man kom fra (Mer, Hjem-widgeten …).
  let prev = m.screen;
  addEventListener('hashchange', () => { setTimeout(() => { if (m.screen === 'media' && prev !== 'media') globalThis.P43.mediaFrom = prev === 'hl' ? 'hl' : prev === 'set' ? 'set/widgets' : 'mer'; if (m.screen !== 'huske') ORD.open = false; if (m.screen !== 'set') WG.how = null; prev = m.screen; }, 0); });
  // Rekkefølgen på Gjøremål-listene følger kontoen (GET /api/tasks/lists/order; serveren kaller Arkivert «arkivert»).
  hlApi('/tasks/lists/order').then((r) => { if (Array.isArray(r?.ids) && r.ids.length) { P37.setTabOrder(r.ids.map((k) => (k === 'arkivert' ? 'arkiv' : k)), false); if (m.screen === 'huske') draw(); } }).catch(() => {});
  document.addEventListener('pointerdown', lpDown, true);
  document.addEventListener('pointermove', lpMove, { capture: true, passive: false });
  document.addEventListener('pointerup', lpUp, true); document.addEventListener('pointercancel', lpUp, true);
  document.addEventListener('contextmenu', (e) => { if (m.screen === 'huske' && e.target.closest?.('.p37-lc, [data-p43og]')) e.preventDefault(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && (ORD.open || WG.how)) { ORD.open = false; WG.how = null; draw(); } });
  let wasBig = bigOn();
  addEventListener('resize', () => { const b = bigOn(); if (b !== wasBig) { wasBig = b; draw(); } });
}
