// Prompt 41 (PWA41) del 2: Min reise (Ruter + Hjem), Vel fremme i Familie («Si fra» og tur), Bursdager (jenka-tog og bilder).
//   · claude-code-ruter-forhandsruter-sebastian.md: MIN REISE · SEBASTIAN over transportfilteret, forsinket trikk fra Frydenlund,
//     SKOLESONER (chips + «+ Sone»), «PÅ HJEM NÅR DU FORLATER SKOLEN» (Over · I stedet · Av), og kortet på Hjem som bare vises
//     når «forlot skolen» er aktiv – sveipes bort som briefen (mobile-p39.js swAdd), med Angre i 4,5 s.
//   · claude-code-hjemlys.md: Familie → Vel fremme (Start med fire valg + aktive i familien · Hvem får beskjed? · Klar · Sendt/Aktiv).
//     Bare beskjeden og stedet du velger sendes. Du selv er aldri i mottakerlista.
//   · claude-code-bursdag-jenka-glimt.md + -bilder.md: konfetti og jenka-tog i det røde toppkortet, last opp / bytt / fjern bilde.
// API (SERVER41): /api/ruter/my-trip, /school-zones, /journey(/hide|/home), /settings · /api/hjemlys/notice, /recipients, /start ·
// /api/birthdays/:id/photos. Alt tåler 404 (kortet skjules, eller handlingen sier «krever en nyere server»).
import { esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { BD, bdLoad } from './mobile-p24.js';
import { swAdd } from './mobile-p39.js';
import * as HM from './mobile-p40h.js';
import { AV } from './mobile-p16.js'; // prompt 46: Ruter-redigering (wiggle)

const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const sw = (on) => `<span class="p24-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const ini = (n) => String(n ?? '?').trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
const AVC = ['#2b5d8a', '#b23a2a', '#2f6b45', '#a8661a', '#7a5ad6', '#c2477a', '#3d7f8a'];
const colOf = (s) => AVC[[...String(s ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVC.length];
let FIG = null;
import('/assets/js/glimt-figs.js').then((x) => { FIG = x; if (m.screen === 'bd') draw(); }).catch(() => {});
const fig = (id, S, mood = 'glad', o) => { try { return FIG?.fig ? FIG.fig(id, S, mood, o) : `<span class="p41-figfb" style="width:${S}px;height:${S}px"></span>`; } catch { return ''; } };

// Henting som tegner på nytt bare når noe faktisk ble hentet (aldri draw → last → draw i løkke).
const INF = {};
const once = (k, fn) => { if (INF[k]) return; INF[k] = Promise.resolve().then(fn).catch(() => {}).finally(() => { INF[k] = null; draw(); }); };
/* =====================================================================
   1. Min reise
   ===================================================================== */
export const RT = { trip: null, tripT: 0, miss: false, dir: 'auto', open: null, zones: null, zonesT: 0, set: null, jr: null, jrT: 0, jrMiss: false, undo: null, undoT: null, addZ: null, busy: false };
const LINE = { tram: ['#0b91ef', '#fff'], bus: ['#e60000', '#fff'], metro: ['#ec700c', '#fff'], foot: ['var(--pp-bg)', 'var(--pp-ink)'] };
const lineCol = (g) => { if (g.mode === 'bus' && /^4[56]$/.test(String(g.line))) return ['#f4a6a6', '#1b1a17']; return LINE[g.mode] ?? LINE.bus; };
async function tripLoad(force = false) {
  if (RT.miss || RT.busy || (!force && RT.trip && Date.now() - RT.tripT < 30_000)) return;
  RT.busy = true;
  try { RT.trip = await hlApi(`/ruter/my-trip?dir=${RT.dir}`); RT.tripT = Date.now(); }
  catch (e) { if (e.status === 404 || e.status === 403) RT.miss = true; }
  RT.busy = false;
}
async function zonesLoad(force = false) {
  if (!force && RT.zones && Date.now() - RT.zonesT < 60_000) return;
  RT.zonesT = Date.now(); if (RT.miss) { RT.zones ??= []; return; }
  try { const [z, s] = await Promise.all([hlApi('/ruter/school-zones'), hlApi('/ruter/settings').catch(() => null)]); RT.zones = z?.zones ?? []; if (s) RT.set = s; } catch { RT.zones ??= []; }
}
async function jrLoad(force = false) {
  if (RT.jrMiss || (!force && Date.now() - RT.jrT < 30_000)) return;
  RT.jrT = Date.now();
  try { const r = await hlApi('/ruter/journey'); RT.jr = r?.journey ?? r ?? null; if (RT.jr?.active && !RT.jr.trip) await tripLoad(); }
  catch (e) { if (e.status === 404) RT.jrMiss = true; }
}
const legsHtml = (legs) => (legs ?? []).map((g, i) => {
  const [bg, fg] = lineCol(g), walk = g.mode === 'foot', l = g.label ?? (walk ? `Gå ${g.walkMin ?? Math.round(((new Date(g.arr) - new Date(g.dep)) / 60e3) || 0)}` : g.mode === 'tram' && legs.length > 3 ? `Trikk ${Math.round((new Date(g.arr) - new Date(g.dep)) / 60e3)} min` : String(g.line ?? ''));
  return `${i ? '<span class="p41-arw" aria-hidden="true">›</span>' : ''}<span class="p41-leg${walk ? ' walk' : ''}" style="background:${bg};color:${fg}">${esc(l)}</span>`;
}).join('');
function steps(o) {
  const out = [];
  (o.legs ?? []).forEach((g, i) => {
    const walk = g.mode === 'foot', late = (g.delayMin ?? 0) >= 1;
    out.push(`<div class="p41-st"><span class="p41-stt">${esc(hm(g.expected ?? g.dep))}</span><span class="p41-std"><i class="${walk ? 'w' : ''}"></i><em class="${walk ? 'w' : ''}"></em></span><span class="m-grow"><b>${esc(g.from ?? '')}</b><small${late ? ' class="lab"' : ''}>${esc(walk ? `Gå ${g.walkMin ?? ''} min${g.meters ? ` · ${g.meters} m` : ''}` : `${g.mode === 'tram' ? 'Trikk' : g.mode === 'bus' ? 'Buss' : 'Linje'} ${g.line ?? ''} mot ${g.to ?? ''}${late ? ` · ${g.delayMin} min forsinket` : ''}`)}</small></span></div>`);
    if (i === o.legs.length - 1) out.push(`<div class="p41-st end"><span class="p41-stt">${esc(hm(g.arr))}</span><span class="p41-std"><i></i></span><span class="m-grow"><b>${esc(g.to ?? '')}</b></span></div>`);
  });
  return out.join('');
}
function optRow(o, i, prefix) {
  const k = `${prefix}${o.id ?? i}`, open = RT.open === k, late = (o.badges ?? []).find((b) => /\+\d+ ?min/.test(b));
  return `<div class="p41-ro${i ? '' : ' first'}"><button type="button" class="p41-rob" data-p41b="ropen" data-k="${esc(k)}" aria-expanded="${open}">
      <span class="p41-rot"><b class="p41-dep">${esc(o.depLabel ?? hm(o.dep))}</b><span class="p41-mut">${esc(o.arrLabel ?? `→ ${hm(o.arr)} · ${o.minutes} min`)}</span><span class="m-grow"></span>${late ? `<span class="p41-bdg lab">${esc(late)}</span>` : ''}${o.preferred || (o.badges ?? []).includes('Foretrukket') ? '<span class="p41-bdg">Foretrukket</span>' : ''}</span>
      <span class="p41-legs">${legsHtml(o.legs)}</span>${o.via ? `<span class="p41-mut">${esc(o.via)}</span>` : ''}${o.note ? `<span class="p41-mut lab">${esc(o.note)}</span>` : ''}</button>
    <div class="p28-col${open ? ' on' : ''}"><div><div class="p41-steps">${steps(o)}</div></div></div></div>`;
}
function alertHtml(A, short = false) {
  if (!A) return '';
  return `<div class="p41-ral"><div class="p41-ralh"><span class="p41-ex" aria-hidden="true">!</span><span class="m-grow"><b>${esc(A.text ?? '')}</b><span>${esc(short ? A.short ?? A.body ?? '' : A.body ?? A.short ?? '')}</span></span></div>
    ${A.strip || A.walk ? `<div class="p41-ralr"><span class="p41-leg walk">${esc(A.walk ? `Gå ${A.walk.minutes} min` : String(A.strip).split('›')[0].trim())}</span><span class="p41-arw">›</span><span class="p41-leg" style="background:#f4a6a6;color:#1b1a17">45</span><span class="m-grow"></span>${A.homeAt ? `<span class="p41-home"><b>${esc(hm(A.homeAt) || A.homeAt)}</b><small>hjemme</small></span>` : ''}</div>` : ''}</div>`;
}
/** Ruter-siden: kortet over transportfilteret (bare når brukeren har forhåndsruter). */
export function tripRuter() {
  if (RT.miss) return '';
  if (!RT.trip) { if (!RT.tripErr) once('trip', async () => { await tripLoad(true); if (!RT.trip) RT.tripErr = true; }); if (!RT.zones && !RT.zonesT) once('zones', () => zonesLoad(true)); return ''; }
  if (!RT.zones && !RT.zonesT) once('zones', () => zonesLoad(true));
  // Prompt 45 (claude-code-ruter-anbefalt-antall.md): nøyaktig N anbefalte reiser (1 · 2 · 3, standard 2), ingen plassholdere.
  const T = RT.trip, N = globalThis.P45?.recoN?.() ?? T.recoCount ?? 2, O = (T.recommended?.length >= N ? T.recommended : T.options ?? []).slice(0, N); if (!O.length) return '';
  const name = String(m.me?.name ?? 'Sebastian').split(/\s+/)[0].toUpperCase();
  const Z = RT.zones ?? [], hc = RT.set?.homeCard ?? T.homeCard ?? 'over';
  // Prompt 46 (claude-code-ruter-innstillinger-i-wiggle.md): innstillingene (skolesoner, antall, Hjem-kortet) vises bare i
  // redigering (hold inne i Ruter → AV.edit), inne i kortet under avgangene. Høyden animeres (p28-col: 0fr → 1fr).
  const ed = !!AV.edit, geoOff = RT.geo46 === 'denied' || RT.geo46 === 'prompt';
  if (!RT.geo46) { RT.geo46 = 'asking'; try { navigator.permissions?.query?.({ name: 'geolocation' }).then((p) => { RT.geo46 = p.state; p.onchange = () => { RT.geo46 = p.state; draw(); }; if (p.state !== 'granted') draw(); }).catch(() => { RT.geo46 = 'unknown'; }); } catch { RT.geo46 = 'unknown'; } }
  const seg = globalThis.P45?.recoSeg?.() ?? '';
  return `<div class="p41-trip${ed ? ' p28-wig p46-tred' : ''}" data-p24lp="stops"><div class="p41-trh"><span class="m-grow"><span class="p41-lab">MIN REISE · ${esc(name)}</span><b class="pp-serif">${esc(T.label ?? `${T.from?.name ?? T.from ?? ''} → ${T.to?.name ?? T.to ?? ''}`)}</b></span><button type="button" class="p41-flipb" data-p41b="rtflip">⇄ Snu</button></div>
    ${alertHtml(T.alert)}<div class="p41-ros">${O.map((o, i) => optRow(o, i, 'r')).join('')}</div>
    ${!ed && geoOff ? `<button type="button" class="p46-trgeo" data-p46="trgeo"><span class="m-grow">Skolesonene trenger posisjon «Alltid»</span><b>Slå på ›</b></button>` : ''}
    ${ed ? `<div class="p46-trcol"><div class="p46-trset"><span class="p46-trsl">INNSTILLINGER FOR KORTET</span>
    ${seg ? `<span class="p41-lab mut">ANTALL ANBEFALTE REISER</span>${seg}` : ''}
    <span class="p41-lab mut">SKOLESONER · ALLE TELLER SOM SKOLE</span><div class="p41-zones">${Z.map((z) => `<span class="p41-zone">${esc(z.name)}<small>${esc(z.label?.replace(z.name, '').trim() || `${z.radius_m} m`)}</small>${Z.length > 1 ? `<button type="button" data-p41b="zrm" data-id="${esc(z.id)}" aria-label="Fjern ${esc(z.name)}">✕</button>` : ''}</span>`).join('')}<button type="button" class="p41-zadd" data-p41b="zadd">+ Sone</button></div>
    ${RT.addZ ? `<form class="p41-zform" data-p41bf="zone"><input class="p24-in" id="p41-zn" data-p41bin="zn" value="${esc(RT.addZ.n)}" placeholder="Navn, f.eks. Idrettshallen" autocomplete="off"><div class="p41-zr"><span class="p41-mut">Radius ${RT.addZ.r} m</span><input type="range" min="50" max="300" step="10" value="${RT.addZ.r}" data-p41bin="zr" aria-label="Radius"></div><span class="p41-mut">Sonen legges der du står nå (posisjonen brukes bare til dette).</span><div class="p24-two"><button type="button" class="p24-b" data-p41b="zx">Avbryt</button><button type="submit" class="p24-b ink">Legg til sone</button></div></form>` : ''}
    <span class="p41-lab mut">PÅ HJEM NÅR DU FORLATER SKOLEN</span><span class="p41-mut">${hc === 'instead' ? 'Vises i stedet for Avganger mens reisen er aktiv.' : hc === 'off' ? 'Vises ikke på Hjem.' : 'Vises over Avganger mens reisen er aktiv.'}</span>
    <div class="p41-seg">${[['over', 'Over Ruter-kortet'], ['instead', 'I stedet'], ['off', 'Av']].map(([k, n]) => `<button type="button" data-p41b="rthc" data-v="${k}" aria-pressed="${hc === k}">${n}</button>`).join('')}</div>
    <span class="p41-mut">${geoOff ? 'Skolesonene trenger posisjon «Alltid» for å virke.' : 'Endringer lagres med en gang. Samme valg i Innstillinger → Ruter.'}</span></div></div>` : ''}</div>`;
}
export const tripInstead = () => !!(RT.jr?.active && !RT.jr.hidden && (RT.set?.homeCard ?? RT.jr.homeCard) === 'instead');
/** Hjem: bare når «forlot skolen» er aktiv (ikke ut fra klokkeslett), skjules per tur. */
export function tripHome(editing = false) {
  if (!RT.jrMiss && Date.now() - RT.jrT > 30_000) jrLoad().then(() => { if (m.screen === 'hl') draw(); });
  const J = RT.jr; if (!J?.active || J.hidden || (RT.set?.homeCard ?? J.homeCard) === 'off') return '';
  if (lsGet('papir_rt_hide') === J.leftSchoolAt) return '';
  const T = J.trip ?? RT.trip, N = globalThis.P45?.recoN?.() ?? 2, OO = (T?.options ?? []).slice(0, N), o = OO[0]; if (!o) return '';
  const card = `<a class="pp-card p41-trc" href="#/avg" data-p41tc><span class="p41-lab">${esc(J.title ?? `MIN REISE · FORLOT SKOLEN ${hm(J.leftSchoolAt)}`)}</span>
    ${OO.map((x, i) => `<span class="p41-rot${i ? ' p45-rot2' : ''}"><b class="p41-dep">${esc(x.depLabel ?? hm(x.dep))}</b><span class="p41-mut">${esc(`→ hjemme ${hm(x.arr)}`)}</span></span><span class="p41-legs">${legsHtml(x.legs)}</span>`).join('')}
    ${T.alert ? `<span class="p41-trw"><span class="p41-ex" aria-hidden="true">!</span>${esc(T.alert.short ?? T.alert.text)}</span>` : ''}</a>`;
  if (editing) return card;
  return `<div class="p37-bsw p41-trw0" data-p41tw><div class="p37-bsr" data-sw-rev aria-hidden="true"><span class="p39-swl"><b data-sw-idle>Sveip for å skjule</b><b data-sw-armed>Slipp for å skjule</b><b data-sw-done>Min reise skjult</b></span><small>Kommer tilbake neste gang du forlater skolen</small></div>${card}</div>`;
}
function tripHide() {
  const J = RT.jr; if (!J) return;
  lsSet('papir_rt_hide', J.leftSchoolAt ?? 'x');
  hlApi('/ruter/journey/hide', { method: 'POST', json: {} }).catch(() => {});
  RT.undo = J.leftSchoolAt; clearTimeout(RT.undoT); RT.undoT = setTimeout(() => { RT.undo = null; draw(); }, 4500);
  draw();
}

/* =====================================================================
   2. Familie → Vel fremme
   ===================================================================== */
const HF = { view: 'start', kind: null, sel: null, q: '', filt: 'hus', rem: true, dest: 'home', destName: '', place: '', soon: 30, eta: 30, wait: 15, sh: { pos: true, bat: true, with: true }, rec: null, recT: 0, sent: null, busy: false, contacts: [], cName: '', cPhone: '', addC: false };
const KINDS = [
  ['home', 'På vei hjem', 'Tur med ETA · familien får beskjed hvis du er sen', '⌂'],
  ['checkin', 'Sjekket inn', 'Jeg er fremme · sted er valgfritt', '✓'],
  ['soon', 'Drar snart', '15 min · 30 min · 1 t', '◷'],
  ['now', 'Drar nå', 'Til hjem, et annet sted, eller bare beskjed', '→'],
];
const meId = () => String(m.me?.id ?? '');
async function recLoad() {
  if (Date.now() - HF.recT < 60_000) return;
  HF.recT = Date.now();
  try { HF.rec = await hlApi('/hjemlys/recipients'); }
  catch { HF.rec = { household: (HM.HJ.d?.household ?? []).map((p) => ({ userId: p.userId, name: p.name })) }; }
}
const people = () => {
  const R = HF.rec ?? {}, hh = (R.household ?? []).filter((p) => String(p.userId) !== meId()).map((p) => ({ ...p, g: 'hus' }));
  const fr = (R.friends ?? []).filter((p) => String(p.userId) !== meId()).map((p) => ({ ...p, g: 'venn' }));
  return [...hh, ...fr];
};
function defaultSel(kind) {
  const last = HF.rec?.last?.[kind === 'soon' ? 'leaving_soon' : kind === 'now' ? 'leaving_now' : kind === 'home' ? 'start' : 'checkin'];
  const P = people();
  return new Set((last?.length ? last : P.filter((p) => p.g === 'hus').map((p) => p.userId)).map(String).filter((id) => id !== meId()));
}
const KNAME = { home: 'På vei hjem', checkin: 'Sjekket inn', soon: 'Drar snart', now: 'Drar nå' };
const namesOf = (ids) => { const P = people(), n = [...ids].map((id) => P.find((p) => String(p.userId) === String(id))?.name?.split(' ')[0]).filter(Boolean); const c = HF.contacts.map((x) => x.name.split(' ')[0]); const all = [...n, ...c]; return all.length > 2 ? `${all.slice(0, 2).join(', ')} og ${all.length - 2} til` : all.join(' og '); };
function startView() {
  // Prompt 42 (claude-code-vel-fremme.md): tittel, «Hva vil du si fra om?», AKTIVE I FAMILIEN og Glimt-forslaget (som Familie.dc.html).
  const mineP = HM.velMine?.() ?? '';
  const others = (HM.HJ.d?.household ?? []).filter((p) => String(p.userId) !== meId() && p.state && p.state !== 'ended');
  const rec = (HM.HJ.d?.notices?.received ?? []).slice(0, 4);
  const tiles = KINDS.map(([k, n, s, i], j) => `<button type="button" class="p41-hk${j === 0 ? ' dark' : ''}" data-p41b="hk" data-k="${k}"><span class="p41-hki" aria-hidden="true">${i}</span><b>${n}</b><small>${s}</small></button>`).join('');
  const fn = (n) => String(n ?? '').trim().split(/\s+/)[0] || 'Noen';
  // Rekkefølge: forsinket først, så på vei, så sjekket inn. Prikk: rød = forsinket, grønn = i rute, gul = sjekket inn.
  const late = others.filter((p) => p.state === 'late'), way = others.filter((p) => p.state !== 'late');
  const row = (p, t, s, dot, tap) => `<${tap ? `button type="button" data-p40="hjwho" data-u="${esc(p.userId)}"` : 'div'} class="p41-hor"><span class="p41-av" style="background:${colOf(p.name)}">${esc(ini(p.name))}</span><span class="m-grow"><b>${esc(t)}</b><small>${esc(s)}</small></span><i class="p41-dot ${dot}"></i></${tap ? 'button' : 'div'}>`;
  const rows = [...late.map((p) => row(p, `${fn(p.name)} er ${p.lateMinutes ? `${p.lateMinutes} min ` : ''}forsinket`, 'Trykk for siste posisjon og ring', 'late', true)),
    ...way.map((p) => row(p, `${fn(p.name)} er på vei ${p.destination?.kind === 'place' && p.destination?.name ? `til ${p.destination.name}` : 'hjem'}`, `${p.destination?.kind === 'place' ? 'Fremme' : 'Hjemme'} ca. ${hm(p.eta)} · i rute`, 'ok', true)),
    ...rec.map((x) => row(x, x.kind === 'checkin' ? `${fn(x.name)} sjekket inn` : x.text ?? `${fn(x.name)} · ${KNAME[x.kind] ?? ''}`, [x.place, hm(x.createdAt)].filter(Boolean).join(' · '), x.kind === 'checkin' ? 'chk' : 'ok', false))].join('');
  return `<div class="p41-hjh"><span class="p41-glow" aria-hidden="true"></span><b class="pp-serif">Vel fremme</b></div>${mineP}
    <span class="p41-mut" style="padding:0 4px">Hva vil du si fra om?</span><div class="p41-hks">${tiles}</div>
    <span class="p41-lab mut">AKTIVE I FAMILIEN</span><div class="p41-hos">${rows || '<span class="p41-mut" style="padding:12px 14px">Ingen har Vel fremme på akkurat nå.</span>'}</div>
    ${HM.velSug?.() ?? ''}`;
}
function whoView() {
  const P = people(), q = HF.q.trim().toLowerCase(), sel = HF.sel;
  const F = P.filter((p) => (!q || String(p.name).toLowerCase().includes(q)) && (HF.filt === 'alle' || (HF.filt === 'hus' ? p.g === 'hus' : (HF.rec?.last && Object.values(HF.rec.last).flat().map(String).includes(String(p.userId))))));
  const grpH = (t, L) => (L.length ? `<span class="p41-lab mut">${t}</span><div class="p41-hos">${L.map((p) => { const on = sel.has(String(p.userId)); return `<button type="button" class="p41-hor pk" data-p41b="hsel" data-id="${esc(p.userId)}" role="checkbox" aria-checked="${on}"><span class="p41-av" style="background:${colOf(p.name)}">${esc(ini(p.name))}</span><span class="m-grow"><b>${esc(p.name)}</b><small>${p.g === 'hus' ? 'Husstanden · varsel i appen' : 'Venn med Papir · varsel i appen'}</small></span><span class="p41-ck${on ? ' on' : ''}">${on ? '✓' : ''}</span></button>`; }).join('')}</div>` : '');
  const n = sel.size + HF.contacts.length;
  return `<div class="p41-hnav"><button type="button" data-p41b="hback">‹ Tilbake</button><b>Hvem får beskjed?</b><button type="button" class="lab" data-p41b="hnext" ${n ? '' : 'disabled'}>Neste</button></div>
    <input class="p24-in" id="p41-hq" data-p41bin="hq" value="${esc(HF.q)}" placeholder="Søk i familie og kontakter" autocomplete="off">
    <div class="p24-chips">${[['hus', 'Husstanden'], ['siste', 'Siste brukt'], ['alle', 'Alle']].map(([k, nm]) => `<button type="button" class="p24-chip${HF.filt === k ? ' on' : ''}" data-p41b="hfilt" data-v="${k}">${nm}</button>`).join('')}</div>
    ${grpH('HUSSTANDEN', F.filter((p) => p.g === 'hus'))}${grpH('VENNER MED PAPIR', F.filter((p) => p.g === 'venn'))}
    <span class="p41-lab mut">ANDRE KONTAKTER · FÅR SMS MED LENKE</span><div class="p41-hos">${HF.contacts.map((c, i) => `<div class="p41-hor"><span class="p41-av" style="background:${colOf(c.name)}">${esc(ini(c.name))}</span><span class="m-grow"><b>${esc(c.name)}</b><small>${esc(c.phone)} · lenken utløper etter 24 t</small></span><button type="button" class="p41-x" data-p41b="crm" data-i="${i}" aria-label="Fjern">✕</button></div>`).join('')}
      ${HF.addC ? `<form class="p41-cform" data-p41bf="contact"><input class="p24-in" data-p41bin="cn" value="${esc(HF.cName)}" placeholder="Navn" autocomplete="name"><input class="p24-in" data-p41bin="cp" value="${esc(HF.cPhone)}" placeholder="Telefon" inputmode="tel" autocomplete="tel"><button type="submit" class="p24-b ink sm">Legg til</button></form>` : `<button type="button" class="p41-hor add" data-p41b="cadd">+ Venn eller kontakt</button>`}</div>
    <div class="p41-hrem"><b class="m-grow">${n} valgt</b><span class="p41-mut">Husk valget</span><button type="button" data-p41b="hrem" role="switch" aria-checked="${HF.rem}" aria-label="Husk valget">${sw(HF.rem)}</button></div>
    <button type="button" class="p41-big" data-p41b="hnext" ${n ? '' : 'disabled'}>Neste</button>`;
}
const chips = (act, cur, L) => `<div class="p41-seg">${L.map(([v, n]) => `<button type="button" data-p41b="${act}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${n}</button>`).join('')}</div>`;
function readyView() {
  const k = HF.kind, trip = k === 'home' || (k === 'now' && HF.dest !== 'none');
  const etaD = new Date(Date.now() + HF.eta * 60e3);
  const label = k === 'checkin' ? 'Si fra · Sjekket inn' : k === 'soon' ? `Si fra · Drar om ${HF.soon ? `ca. ${HF.soon >= 60 ? '1 t' : `${HF.soon} min`}` : 'litt'}` : trip ? `Start · ${HF.dest === 'place' ? HF.destName || 'fremme' : 'hjemme'} ca. ${hm(etaD)}` : 'Si fra · Drar nå';
  const evSug = HF.evPlace ? `Forslag fra kalenderen: «${HF.evPlace}»` : 'Valgfritt. Ingen posisjon deles.';
  return `<div class="p41-hnav"><button type="button" data-p41b="hback">‹ Personer</button><b>${KNAME[k]}</b><span style="width:70px"></span></div>
    ${k === 'now' ? `<span class="p41-lab mut">MÅL</span>${chips('hdest', HF.dest, [['home', 'Hjem'], ['place', 'Annet sted'], ['none', 'Ikke oppgi']])}${HF.dest === 'place' ? `<input class="p24-in" data-p41bin="hdn" value="${esc(HF.destName)}" placeholder="Hvor skal du?" autocomplete="off">` : ''}` : ''}
    ${trip ? `<div class="p41-hto"><span class="p41-lab mut">TIL</span><b class="pp-serif">${esc(HF.dest === 'place' ? HF.destName || 'Annet sted' : 'Hjem')}</b><span class="p41-mut">Avsluttes når du er fremme (60 m) eller trykker «Jeg er fremme»</span></div>
      <span class="p41-lab mut">FREMME OM CA.</span>${chips('heta', HF.eta, [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 t']])}
      <span class="p41-lab mut">VARSLE HVIS JEG IKKE SVARER PÅ «ALT OK?»</span>${chips('hwait', HF.wait, [[5, '5 min'], [15, '15 min'], [30, '30 min']])}
      <span class="p41-lab mut">DELES BARE HVIS DU ER SEN</span><div class="p41-hos">${[['pos', 'Posisjon og rute'], ['bat', 'Batteri og dekning'], ['with', 'Hvem jeg var med']].map(([x, n]) => `<div class="p41-hor"><span class="m-grow">${n}</span><button type="button" data-p41b="hsh" data-k="${x}" role="switch" aria-checked="${HF.sh[x]}" aria-label="${n}">${sw(HF.sh[x])}</button></div>`).join('')}</div>` : ''}
    ${k === 'checkin' || k === 'soon' || (k === 'now' && !trip) ? `<span class="p41-lab mut">DER DU ER · VALGFRITT</span><input class="p24-in" data-p41bin="hpl" value="${esc(HF.place)}" placeholder="F.eks. Bursdag hos Mari" autocomplete="off"><span class="p41-mut" style="padding:0 4px">${esc(evSug)}</span>` : ''}
    ${k === 'soon' ? `<span class="p41-lab mut">DRAR OM CA.</span>${chips('hsoon', HF.soon, [[15, '15 min'], [30, '30 min'], [60, '1 t'], [0, 'Ukjent']])}` : ''}
    <span class="p41-mut" style="text-align:center">${esc(`${namesOf(HF.sel)} får beskjed`)}</span>
    <button type="button" class="p41-big" data-p41b="hgo" ${HF.busy ? 'disabled' : ''}><span class="p41-glow sm" aria-hidden="true"></span>${HF.busy ? 'Sender …' : esc(label)}</button>`;
}
function sentView() {
  const S = HF.sent, N = S?.notice ?? {};
  return `<div class="p41-hjh"><span class="p41-glow" aria-hidden="true"></span><b class="pp-serif">Sendt</b></div>
    <div class="pp-card p41-sent"><span class="p41-lab">${esc(KNAME[HF.kind] ?? 'Vel fremme')} · ${esc(hm(N.createdAt ?? Date.now()))}</span><b>«${esc(N.text ?? S?.text ?? '')}»</b><span class="p41-mut">Til ${esc((N.recipients ?? []).map((r) => r.name).join(', ') || namesOf(HF.sel))}</span>
      ${(S?.links ?? []).map((l) => `<a class="p24-b sm" href="${esc(l.sms ?? `sms:${l.phone}?&body=${encodeURIComponent(`${N.text ?? ''} ${l.url}`)}`)}">SMS til ${esc(l.name)}</a>`).join('')}
      ${HF.kind === 'soon' && N.id ? `<div class="p24-two"><button type="button" class="p24-b" data-p41b="hplus">+ 15 min</button><button type="button" class="p24-b ink" data-p41b="hnow">Drar nå</button></div>` : ''}</div>
    <button type="button" class="p24-b ghost" data-p41b="hdone">Ferdig</button>`;
}
export function famHjemlys() {
  if (!HF.rec && !HF.recT) once('rec', recLoad);
  if (!HM.HJ.d && !HM.HJ.busy && !HF.hjT) { HF.hjT = Date.now(); once('hj', () => HM.hjLoad?.(true)); }
  const v = HF.view === 'who' ? whoView() : HF.view === 'ready' ? readyView() : HF.view === 'sent' ? sentView() : startView();
  return `<div class="p41-hjl">${v}</div>`;
}
async function hjGo() {
  const k = HF.kind, to = [...HF.sel], trip = k === 'home' || (k === 'now' && HF.dest !== 'none');
  const destination = trip ? { name: HF.dest === 'place' ? HF.destName || 'Annet sted' : 'Hjem', kind: HF.dest === 'place' ? 'place' : 'home' } : undefined;
  HF.busy = true; draw();
  try {
    let r;
    if (k === 'home') r = await hlApi('/hjemlys/start', { method: 'POST', json: { eta: new Date(Date.now() + HF.eta * 60e3).toISOString(), mode: 'manual', waitMin: HF.wait, recipients: to, destination, share: HF.sh } });
    else r = await hlApi('/hjemlys/notice', { method: 'POST', json: { kind: k === 'checkin' ? 'checkin' : k === 'soon' ? 'leaving_soon' : 'leaving_now', place: HF.place || undefined, leaveInMin: k === 'soon' ? HF.soon || null : undefined, eta: trip ? HF.eta : undefined, to, contacts: HF.contacts, destination, waitMin: trip ? HF.wait : undefined, remember: HF.rem } });
    haptic('ok'); vib([8, 30, 12]);
    HM.HJ.t = 0; await HM.hjLoad?.(true);
    if (r?.session || k === 'home') { HF.view = 'start'; HF.kind = null; HM.bind?.('hjopen', { dataset: {} }, null); }
    else { HF.sent = r; HF.view = 'sent'; }
  } catch (e) { flash(e.status === 404 ? 'Si fra krever en nyere server' : e.message, 'err'); }
  HF.busy = false; draw();
}

/* =====================================================================
   3. Bursdager: jenka-tog i toppkortet og bilder
   ===================================================================== */
const BDP = { busy: null, seen: lsGet('p41_bd_fanfare', '') };
export function bdParty(name) {
  const C = ['#f2c14e', '#ffffff', '#3fbf9a', '#a8d4fb', '#ffd2c2', '#c3b4ef'], rnd = (i) => (((Math.sin(i * 99.13) * 43758.5) % 1) + 1) % 1;
  const still = reduce();
  const conf = still ? '' : Array.from({ length: 30 }, (_, i) => `<i style="left:${(rnd(i) * 100).toFixed(1)}%;width:${(5 + rnd(i + 7) * 4).toFixed(1)}px;height:${(8 + rnd(i + 3) * 6).toFixed(1)}px;border-radius:${rnd(i + 1) > 0.6 ? '50%' : '2px'};background:${C[i % C.length]};animation-duration:${(2.4 + rnd(i + 2) * 2.2).toFixed(2)}s;animation-delay:${(rnd(i + 5) * 3).toFixed(2)}s"></i>`).join('');
  const hat = (S) => `<svg class="p41-hat" width="${S * 0.5}" height="${S * 0.55}" viewBox="0 0 60 62" style="top:${-S * 0.42}px;margin-left:${-S * 0.2}px" aria-hidden="true"><path d="M8 56 L30 4 L52 56 Z" fill="#1b1a17"/><path d="M14 42 L46 42 M19 30 L41 30 M24 18 L36 18" stroke="#f2c14e" stroke-width="3"/><circle cx="30" cy="4" r="5" fill="#f2c14e"/></svg>`;
  const trumpet = (S) => `<span class="p41-trum" style="left:${S * 0.62}px;top:${S * 0.42}px;width:${S * 0.9}px;height:${S * 0.4}px" aria-hidden="true"><svg viewBox="0 0 90 40" width="100%" height="100%"><rect x="0" y="16" width="56" height="8" rx="3" fill="#e0a92e"/><rect x="18" y="9" width="5" height="9" rx="2" fill="#c8901c"/><rect x="27" y="9" width="5" height="9" rx="2" fill="#c8901c"/><rect x="36" y="9" width="5" height="9" rx="2" fill="#c8901c"/><path d="M54 14 L86 2 L86 38 L54 26 Z" fill="#f2c14e"/><ellipse cx="86" cy="20" rx="4" ry="18" fill="#c8901c"/></svg>${still ? '' : ['♪', '♫', '♪'].map((n, i) => `<b style="color:${C[i]};animation-delay:${i * 0.5}s">${n}</b>`).join('')}</span>`;
  const S = 46, crew = ['stjerne', 'gris', 'ugle', 'boble', 'spire'];
  const mem = crew.map((id, i) => `<span class="p41-mem" style="animation-delay:${(i * 0.09).toFixed(2)}s">${fig(id, Math.round(S * 0.86), 'glad', { noJul: true })}${hat(S * 0.86)}</span>`).join('');
  const lead = `<span class="p41-mem lead" style="animation-delay:.5s;margin-right:${S * 0.9}px">${fig('glimt', Math.round(S * 1.1), 'glad', { noJul: true })}${hat(S * 1.1)}${trumpet(S * 1.1)}</span>`;
  // Kort fanfare første gang kortet vises i dag, bare med lyd på (ingen lyd i stille modus – nettleseren krever et trykk først).
  const d = new Date().toDateString(); if (BDP.seen !== d) { BDP.seen = d; lsSet('p41_bd_fanfare', d); setTimeout(fanfare, 400); }
  return `<span class="p41-party${still ? ' still' : ''}" role="img" aria-label="Glimt og gjengen feirer ${esc(name)}"><span class="p41-conf2">${conf}</span><span class="p41-pgrad"></span><span class="p41-conga">${mem}${lead}</span></span>`;
}
function fanfare() {
  try {
    if (globalThis.P34?.soundOn?.() === false) return;
    const A = new (window.AudioContext || window.webkitAudioContext)(); if (A.state === 'suspended') { A.close(); return; }
    [[523, 0], [659, 0.18], [784, 0.36], [1047, 0.6]].forEach(([f, t]) => { const o = A.createOscillator(), g = A.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, A.currentTime + t); g.gain.exponentialRampToValueAtTime(0.08, A.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + t + (t > 0.5 ? 0.6 : 0.16)); o.connect(g).connect(A.destination); o.start(A.currentTime + t); o.stop(A.currentTime + t + 0.7); });
    setTimeout(() => A.close(), 1500);
  } catch {}
}
export function bdPhotoBar(p, url) {
  const busy = BDP.busy === String(p.id);
  return `<div class="p41-bdph">${url ? `<label class="p24-ob">${busy ? 'Laster opp …' : '📷 Bytt bilde'}<input class="m-file" type="file" accept="image/*" data-p41bd="${esc(p.id)}"></label><button type="button" class="p24-ob lab" data-p41b="bdrm" data-id="${esc(p.id)}">Fjern bilde</button>`
    : `<label class="p24-ob ink">${busy ? 'Laster opp …' : '📷 Last opp bilde'}<input class="m-file" type="file" accept="image/*" data-p41bd="${esc(p.id)}"></label>`}</div>`;
}
async function squareJpeg(file, max = 1024) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(bmp.width, bmp.height), o = Math.min(max, s), c = document.createElement('canvas');
  c.width = o; c.height = o; c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, o, o);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.86));
}
async function bdUpload(id, file) {
  const P = (BD.d?.items ?? []).find((x) => String(x.id) === String(id)), name = P?.name?.split(' ')[0] ?? 'personen';
  BDP.busy = String(id); draw();
  try {
    const blob = await squareJpeg(file), fd = new FormData(); fd.append('file', blob, 'bilde.jpg');
    await hlApi(`/birthdays/${encodeURIComponent(id)}/photos`, { method: 'POST', body: fd });
    await bdLoad(true); flash(`Bilde lagt til for ${name}`);
  } catch (e) { flash(e.status === 404 ? 'Bilder i Bursdager krever en nyere server' : e.status === 409 ? 'Maks 8 bilder per person' : e.message, 'err'); }
  BDP.busy = null; draw();
}
async function bdRemove(id) {
  const P = (BD.d?.items ?? []).find((x) => String(x.id) === String(id));
  const pid = P?.photos?.[0]?.id;
  try {
    if (pid) await hlApi(`/birthdays/${encodeURIComponent(id)}/photos/${encodeURIComponent(pid)}`, { method: 'DELETE' });
    else { const r = await hlApi(`/birthdays/${encodeURIComponent(id)}/photos`); const x = (r?.photos ?? r?.items ?? [])[0]; if (x) await hlApi(`/birthdays/${encodeURIComponent(id)}/photos/${encodeURIComponent(x.id)}`, { method: 'DELETE' }); }
    await bdLoad(true); flash('Bildet er fjernet');
  } catch (e) { flash(e.status === 404 ? 'Krever en nyere server' : e.message, 'err'); }
  draw();
}

/* =====================================================================
   Kobling
   ===================================================================== */
export function layer41b() {
  return RT.undo && m.screen === 'hl' ? `<div class="m-toast p41-undo" role="status">Min reise skjult til neste gang du forlater skolen<button type="button" data-p41b="rtundo">Angre</button></div>` : '';
}
export async function bind41b(e, t) {
  const x = t.closest?.('[data-p41b]'); if (!x) return false;
  const a = x.dataset.p41b; e.preventDefault();
  switch (a) {
    case 'ropen': { const k = x.dataset.k; RT.open = RT.open === k ? null : k; haptic('tap'); const col = x.parentElement?.querySelector('.p28-col'); if (col) { document.querySelectorAll('#app .p41-ro .p28-col.on').forEach((c) => { if (c !== col) c.classList.remove('on'); }); col.classList.toggle('on', RT.open === k); x.setAttribute('aria-expanded', String(RT.open === k)); } else draw(); return true; }
    case 'rtflip': RT.dir = RT.trip?.dir === 'toHome' ? 'toSchool' : 'toHome'; haptic('tab'); RT.trip = null; await tripLoad(true); draw(); return true;
    case 'rthc': RT.set = { ...(RT.set ?? {}), homeCard: x.dataset.v }; haptic('tab'); draw(); hlApi('/ruter/settings', { method: 'PUT', json: { homeCard: x.dataset.v } }).catch(() => {}); return true;
    case 'zadd': RT.addZ = { n: '', r: 150 }; draw(); setTimeout(() => document.getElementById('p41-zn')?.focus(), 60); return true;
    case 'zx': RT.addZ = null; draw(); return true;
    case 'zrm': try { const r = await hlApi(`/ruter/school-zones/${encodeURIComponent(x.dataset.id)}`, { method: 'DELETE' }); RT.zones = r?.zones ?? (RT.zones ?? []).filter((z) => String(z.id) !== x.dataset.id); haptic('tap'); } catch (err) { flash(err.status === 409 ? 'Den siste skolesonen kan ikke slettes' : err.message, 'err'); } draw(); return true;
    case 'rtundo': { lsSet('papir_rt_hide', null); RT.undo = null; hlApi('/ruter/journey/hide', { method: 'DELETE' }).catch(() => {}); if (RT.jr) RT.jr.hidden = false; haptic('tap'); draw(); return true; }
    case 'hk': HF.kind = x.dataset.k; HF.sel = defaultSel(HF.kind); HF.view = 'who'; HF.q = ''; HF.contacts = []; HF.place = ''; HF.dest = 'home'; haptic('tap'); await recLoad(); if (!HF.sel.size) HF.sel = defaultSel(HF.kind); draw(); return true;
    case 'hback': HF.view = HF.view === 'ready' ? 'who' : 'start'; haptic('tap'); draw(); return true;
    case 'hnext': if (!(HF.sel.size + HF.contacts.length)) return true; HF.view = 'ready'; haptic('tap'); draw(); return true;
    case 'hsel': { const id = String(x.dataset.id); if (HF.sel.has(id)) HF.sel.delete(id); else HF.sel.add(id); haptic('tab'); draw(); return true; }
    case 'hfilt': HF.filt = x.dataset.v; haptic('tab'); draw(); return true;
    case 'hrem': HF.rem = !HF.rem; haptic('tab'); draw(); return true;
    case 'cadd': HF.addC = true; draw(); return true;
    case 'crm': HF.contacts.splice(+x.dataset.i, 1); draw(); return true;
    case 'hdest': HF.dest = x.dataset.v; haptic('tab'); draw(); return true;
    case 'heta': HF.eta = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'hwait': HF.wait = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'hsoon': HF.soon = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'hsh': HF.sh[x.dataset.k] = !HF.sh[x.dataset.k]; haptic('tab'); draw(); return true;
    case 'hgo': await hjGo(); return true;
    case 'hplus': try { const r = await hlApi(`/hjemlys/notice/${encodeURIComponent(HF.sent.notice.id)}`, { method: 'PATCH', json: { plus: 15 } }); HF.sent = { ...HF.sent, ...r }; haptic('ok'); } catch (err) { flash(err.message, 'err'); } draw(); return true;
    case 'hnow': try { const r = await hlApi(`/hjemlys/notice/${encodeURIComponent(HF.sent.notice.id)}/now`, { method: 'POST', json: {} }); HF.kind = 'now'; HF.sent = { ...HF.sent, ...r }; haptic('ok'); } catch (err) { flash(err.message, 'err'); } draw(); return true;
    case 'hdone': HF.view = 'start'; HF.sent = null; HF.kind = null; draw(); return true;
    case 'bdrm': await bdRemove(x.dataset.id); return true;
    default: return false;
  }
}
export function input41b(e, t) {
  const k = t.dataset?.p41bin; if (!k) return false;
  if (k === 'zn') RT.addZ.n = t.value; else if (k === 'zr') { RT.addZ.r = +t.value; const s = t.parentElement?.querySelector('.p41-mut'); if (s) s.textContent = `Radius ${t.value} m`; }
  else if (k === 'hq') { HF.q = t.value; clearTimeout(input41b.t); input41b.t = setTimeout(draw, 150); }
  else if (k === 'hpl') HF.place = t.value; else if (k === 'hdn') HF.destName = t.value; else if (k === 'cn') HF.cName = t.value; else if (k === 'cp') HF.cPhone = t.value;
  return true;
}
export async function change41b(e, t) {
  if (t.matches?.('[data-p41bd]')) { const f = t.files?.[0]; const id = t.dataset.p41bd; t.value = ''; if (f) await bdUpload(id, f); return true; }
  if (t.dataset?.p41bin) return input41b(e, t);
  return false;
}
export async function submit41b(e, f) {
  if (f.matches?.('[data-p41bf="zone"]')) {
    e.preventDefault(); const Z = RT.addZ; if (!Z?.n.trim()) { flash('Gi sonen et navn'); return true; }
    const pos = await new Promise((ok) => { try { navigator.geolocation.getCurrentPosition((p) => ok(p.coords), () => ok(null), { timeout: 8000, maximumAge: 60_000 }); } catch { ok(null); } });
    if (!pos) { flash('Fikk ikke posisjonen. Tillat posisjon for å legge til en sone.', 'err'); return true; }
    try { const r = await hlApi('/ruter/school-zones', { method: 'POST', json: { name: Z.n.trim(), lat: pos.latitude, lon: pos.longitude, radius_m: Z.r } }); RT.zones = r?.zones ?? [...(RT.zones ?? []), r?.zone].filter(Boolean); RT.addZ = null; flash(`${Z.n.trim()} er lagt til som skolesone`); } catch (err) { flash(err.message, 'err'); }
    draw(); return true;
  }
  if (f.matches?.('[data-p41bf="contact"]')) {
    e.preventDefault(); const n = HF.cName.trim(), p = HF.cPhone.trim();
    if (!n || !/^\+?[\d\s]{8,}$/.test(p)) { flash('Skriv navn og telefonnummer'); return true; }
    HF.contacts.push({ name: n, phone: p.replace(/\s/g, '') }); HF.cName = ''; HF.cPhone = ''; HF.addC = false; draw(); return true;
  }
  return false;
}
export function onRt41b(d) {
  const ty = String(d?.type ?? '');
  if (ty.startsWith('ruter') || ty === 'journey') { RT.jrT = 0; jrLoad(true).then(() => { if (m.screen === 'hl') draw(); }); return true; }
  if (ty === 'hjemlys:notice') { HM.HJ.t = 0; HM.hjLoad?.(true).then?.(() => { if (m.screen === 'fam' || m.screen === 'hl') draw(); }); return false; }
  return false;
}
export function afterDraw41b() {
  if (m.screen === 'avg' && !RT.iv) RT.iv = setInterval(() => { if (m.screen !== 'avg') { clearInterval(RT.iv); RT.iv = null; return; } tripLoad(true).then(draw); }, 30_000);
}
export function boot41b() {
  swAdd({ card: '[data-p41tc]', wrap: '[data-p41tw]', ok: () => true, commit: tripHide });
  jrLoad().then(() => { if (m.screen === 'hl' && RT.jr?.active) draw(); });
  zonesLoad().catch(() => {});
}
