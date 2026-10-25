// Prompt 40 (PWA40): mobilpunktene i design_handoff_homelab/prompts/prompt-40-pakke/ som trenger ny kode.
//   1. Gjøremål: Glimt deler setninger i flere punkter (rekkefølge, dato/tid, sted, person) · baren over tastaturet ·
//      tilbake går alltid til Hjem (claude-code-huskeliste-glimt-forstar.md, claude-code-gjoremal-tastatur-tilbake.md)
//   2. Julemodus: kortet i Innstillinger → Glimt (Auto · Av · På + fase, snø, julelyd) og antrekk overalt
//      (claude-code-glimt-jul.md, fasit glimt-figurer.js julOn/dress)
//   3. Totrinnsbekreftelse satt opp i appen (claude-code-2fa-i-appen.md, fasit tfVals)
//   4. Finans: «Lagt til …»-linja, «✦ La Glimt lese kvitteringen på nytt», «Rediger alt», søk med Glimt-kort
//      (claude-code-finans-lagt-til.md, -les-pa-nytt-rediger.md, -sok-glimt-kort.md)
//   5. Brief → Bibel (trykk på verset) og Nyheter → Glimt-siden (claude-code-brief-bibel-trykk.md, -nyheter-glimt-side.md)
//   6. Vel fremme: Familie-kortet og Hjem-kortet; hele flyten (1a + 1b + 1c) i mobile-p40h.js (claude-code-hjemlys.md)
// Lastes med dynamisk import fra mobile.js (ingen statisk import herfra endrer evalueringsrekkefølgen). Andre moduler når
// funksjonene via globalThis.P40. Alle API-er (kontrakt 40, SERVER40) tåler 404: da brukes lokal reserve.
import { S, esc, api, hlApi, n0, n2 } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';

const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const lsRaw = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsRawSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const hm = (t) => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const kr = (v) => { const a = Math.abs(+v || 0); return `${Number.isInteger(Math.round(a * 100) / 100) ? n0(a) : n2(a)} kr`; };
const X = (attr, cls = '') => `<button type="button" class="w32-x${cls}" ${attr} aria-label="Lukk"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
const cleanMd = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').replace(/\s*\[\d+\]/g, '').replace(/^#+\s*/gm, '').trim();

/* =====================================================================
   1. Gjøremål: Glimt forstår setninger (lokal tolker gLocal + gCtx, fasit Huskeliste.dc.html)
   ===================================================================== */
const SEQ = /\b(aller først|først|før det|deretter|etterpå|etter det|til slutt|og så)\b/i;
/** Flere handlinger i én tekst? (signalord for rekkefølge, eller flere setninger med må/skal/husk/trenger). */
export function isMulti(q) {
  const s = String(q ?? '');
  const sn = s.split(/[.!]\s+/).filter((x) => /\b(må|skal|husk|trenger)\b/i.test(x)).length;
  return SEQ.test(s) || sn > 1;
}
const IMP = { hente: 'Hent', kjøpe: 'Kjøp', ringe: 'Ring', sende: 'Send', bestille: 'Bestill', betale: 'Betal', vaske: 'Vask', rydde: 'Rydd', pakke: 'Pakk', bytte: 'Bytt', fikse: 'Fiks', kjøre: 'Kjør', flytte: 'Flytt', skrive: 'Skriv', svare: 'Svar', sjekke: 'Sjekk', booke: 'Book', avbestille: 'Avbestill', møte: 'Møt', besøke: 'Besøk', lage: 'Lag', kontakte: 'Kontakt', melde: 'Meld', fornye: 'Forny', gi: 'Gi', ta: 'Ta', huske: 'Husk', levere: 'Lever', handle: 'Handle', hjelpe: 'Hjelp', spørre: 'Spør', kjøre_: 'Kjør' };
const NOTPL = /^(Mandag|Tirsdag|Onsdag|Torsdag|Fredag|Lørdag|Søndag|Jeg|Vi|Meg|Oss|Morgen|Dag|Kveld|Natt|Helgen)$/;
/** Sted og person i en tekst (gCtx). people: [{id, name}]. */
export function gCtx(t, people = []) {
  const first = (n) => String(n ?? '').trim().split(/\s+/)[0];
  const P = people.map((p) => ({ ...p, f: first(p.name) })).filter((p) => p.f);
  let pl = '';
  const re = /\b(?:til|i|på|hos|ved|fra)\s+([A-ZÆØÅ][\wæøåÆØÅ-]+(?:\s+[A-ZÆØÅ][\wæøåÆØÅ-]+)?)/g;
  let x;
  while ((x = re.exec(t))) { const w = x[1]; if (!NOTPL.test(w.split(' ')[0]) && !P.some((p) => p.f.toLowerCase() === w.split(' ')[0].toLowerCase())) { pl = w; break; } }
  const who = P.find((p) => new RegExp(`(^|[^\\wæøå])${p.f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\wæøå]|$)`, 'i').test(t)) ?? null;
  return { pl, who };
}
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
/** Dato, tid og «viktig» for hele teksten (gjelder alle punktene fra samme setning). */
function whenOf(s) {
  let due = null, time = null, x;
  const urgent = /\b(viktig|haster)\b/i.test(s);
  if ((x = /(?:kl\.?|klokka|klokken)\s*(\d{1,2})(?:[.:](\d{2}))?(?!\d)/i.exec(s))) time = `${pad(+x[1])}:${x[2] || '00'}`;
  if ((x = /(?<![\d.])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d])/.exec(s))) { const y = x[3] ? (+x[3] < 100 ? 2000 + +x[3] : +x[3]) : new Date().getFullYear(); let d = new Date(y, +x[2] - 1, +x[1], 12); if (!x[3] && isoDay(d) < dayIso(0)) d = new Date(y + 1, +x[2] - 1, +x[1], 12); due = isoDay(d); }
  else if (/\bi\s*overmorgen\b/i.test(s)) due = dayIso(2);
  else if (/\bi\s*morgen\b/i.test(s)) due = dayIso(1);
  else if (/\bi\s*(dag|kveld)\b/i.test(s)) due = dayIso(0);
  else if ((x = /\b(?:på\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)\b/i.exec(s))) { const w = WD.indexOf(x[1].toLowerCase()); due = dayIso(((w - new Date().getDay() + 7) % 7) || 7); }
  else if (/\bneste uke\b/i.test(s)) due = dayIso(7);
  if (time && !due) due = dayIso(0);
  return { due, time, urgent };
}
function cleanTitle(t) {
  let x = ` ${t} `;
  x = x.replace(/^\s*(?:og|men)\s+/i, ' ')
    .replace(/^\s*(?:(?:jeg|vi)\s+)?(?:må|skal|burde|bør|trenger å)\s+(?:(?:jeg|vi)\s+)?/i, ' ')
    .replace(/^\s*(?:huske\s+(?:å|på)\s+|husk\s+(?:å\s+)?|påminn\s+meg\s+(?:om\s+)?(?:å\s+)?|minn\s+meg\s+på\s+(?:å\s+)?)/i, ' ')
    .replace(/^\s*å\s+/i, ' ')
    .replace(/\b(?:i morgen|i overmorgen|i dag|i kveld|neste uke|(?:på\s+)?(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)|(?:kl\.?|klokka|klokken)\s*\d{1,2}(?:[.:]\d{2})?|\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/gi, ' ')
    .replace(/\b(viktig|haster)\b/gi, ' ').replace(/[,.;:!?]+\s*$/, '').replace(/\s+/g, ' ').trim();
  const w = x.split(' '), f = (w[0] || '').toLowerCase();
  if (f) w[0] = IMP[f] || (/[^e]ere$/.test(f) ? f.slice(0, -1) : f);
  x = w.join(' ').replace(/\bmøbeler\b/gi, 'møbler');
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
}
/** Lokal tolker: [{title, place, tags, who, due, time, urgent, step:'first'|'then'|''}] i riktig rekkefølge. */
export function gLocal(q, people = [], me = '') {
  const parts = [];
  String(q).split(/[.!]\s+/).forEach((sn, si) => {
    const re = /\s*,?\s*(?:men\s+|og\s+)?\b(aller først|først|før det|deretter|etterpå|etter det|til slutt|og så)\b\s*/ig;
    let last = 0, f = '', x;
    while ((x = re.exec(sn))) { const seg = sn.slice(last, x.index); if (seg.trim()) parts.push({ t: seg, f, sn }); f = /først|før det/i.test(x[1]) ? 'first' : 'then'; last = re.lastIndex; }
    const seg = sn.slice(last); if (seg.trim()) parts.push({ t: seg, f, sn });
  });
  const ord = [...parts.filter((p) => p.f === 'first'), ...parts.filter((p) => p.f !== 'first')], seq = parts.some((p) => p.f) || parts.length > 1;
  const all = gCtx(q, people);
  return ord.map((p) => {
    const n = cleanTitle(p.t); if (!n) return null;
    const W = whenOf(p.sn ?? q), c = gCtx(p.t, people), who = c.who && String(c.who.id) !== String(me) ? c.who : null;
    const tags = [...new Set([...(/\bpakken?\b/i.test(p.t) ? ['pakke'] : []), ...(seq && all.pl ? [all.pl.toLowerCase()] : [])])];
    return { title: n, place: c.pl || '', tags, who: who ? String(who.id) : null, whoName: who?.name ?? '', due: W.due, time: W.time, urgent: W.urgent, step: p.f };
  }).filter(Boolean);
}
/** Kjør flere punkter lokalt (eldre server uten oppdeling). ctx kommer fra mobile-p37.js. */
export async function gMulti(q, ctx) {
  const { lists, people, addTask, answer, resOf, cur, meId } = ctx;
  const P = people(), L = lists(), me = meId();
  const items = gLocal(q, P, me);
  if (!items.length) { answer('Fikk ikke lagt til oppgaven.'); return; }
  const guessL = (t) => {
    const s = ` ${t.toLowerCase()} `;
    const k = / (melk|egg|brød|kaffe|kjøp|handle) /.test(s) ? 'handel' : / (hytta|hytte) /.test(s) ? 'hytta' : / (jobb|møte|kunde|rapport) /.test(s) ? 'jobb' : null;
    return k ? L.find((l) => l.name.toLowerCase() === k)?.id ?? null : null;
  };
  const def = cur && cur !== 'alle' && cur !== 'arkiv' ? String(cur) : (L.find((l) => l.name.toLowerCase() === 'mine') ?? L.find((l) => !l.shared && l.mine) ?? L[0])?.id ?? null;
  const out = []; let prev = null;
  for (const it of items) {
    let list = guessL(it.title) || def;
    // Nevnt person: punktet havner i en liste dere begge er med i, om den valgte ikke er delt med personen.
    if (it.who) { const ok = L.find((l) => l.id === list)?.members?.some?.((x) => String(x.id ?? x.userId ?? x) === it.who); if (!ok) list = L.find((l) => (l.members ?? []).some((x) => String(x.id ?? x.userId ?? x) === it.who))?.id ?? list; }
    const base = { title: it.title, list, due: it.due, time: it.time ?? undefined, urgent: it.urgent || undefined, who: it.who, tags: it.tags };
    try {
      let r;
      // Fritt sted lagres som placeName (place er påminnelse-stedet: store/home/…). Eldre server avviser ukjente felt → uten.
      try { r = await addTask({ ...base, placeName: it.place || undefined, after: prev ? String(prev.id) : undefined, mentions: it.who ? [it.who] : undefined }); }
      catch (e) { if (e.status !== 400 && e.status !== 422) throw e; r = await addTask(base); }
      if (r) { out.push(r); prev = r; }
    } catch (e) { flash(e.message, 'err'); break; }
  }
  const pl = items.find((x) => x.place)?.place;
  haptic('ok');
  answer(out.length > 1 ? `Lagde ${out.length} punkter${pl ? ` for ${pl}` : ''}, i riktig rekkefølge.` : `La til «${items[0].title}».`,
    resOf(out).map((x, i) => ({ ...x, m: [i === 0 ? '1 · først' : `${i + 1} · etter «${items[i - 1].title}»`, x.m, items[i]?.place, items[i]?.whoName ? `@${items[i].whoName}` : ''].filter(Boolean).join(' · ') })),
    { ids: out.map((x) => x.id) });
}
/** Metalinja: «etter «Lever pakken»» til det forrige punktet er huket av. */
export function afterLbl(x, itemsFn) {
  if (!x.after || x.done) return '';
  const A = (typeof itemsFn === 'function' ? itemsFn() : []).find((y) => String(y.id) === String(x.after));
  return A && !A.done ? `etter «${A.title}»` : '';
}

/* ---------- Baren over tastaturet + tilbake til Hjem ---------- */
const KB = { y: null, base: 0 };
function kbTrack() {
  const vv = window.visualViewport; if (!vv) return;
  const f = () => {
    const r = document.documentElement, ae = document.activeElement, on = m.screen === 'huske' && ae?.id === 'p37-tk';
    if (!on) { if (r.classList.contains('p40-kb')) { r.classList.remove('p40-kb'); r.style.removeProperty('--p40-kbb'); } KB.y = null; if (vv.height > KB.base - 40) KB.base = Math.max(vv.height, innerHeight); return; }
    // Avstand fra bunnen av layout-viewporten til bunnen av det synlige området (tastaturet), uansett om iOS panorerer.
    const k = Math.max(0, Math.round(innerHeight - (vv.offsetTop + vv.height)));
    r.classList.toggle('p40-kb', k > 40); r.style.setProperty('--p40-kbb', `${k > 40 ? k + 8 : 0}px`);
    // Siden skal ikke hoppe: iOS skyver dokumentet når feltet får fokus – tilbake dit lista sto.
    if (KB.y != null && Math.abs(scrollY - KB.y) > 2) { try { window.scrollTo(0, KB.y); } catch {} }
  };
  vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
  addEventListener('focusin', (e) => { if (e.target?.id === 'p37-tk') { KB.y = scrollY; f(); setTimeout(f, 80); setTimeout(f, 320); setTimeout(f, 650); } });
  addEventListener('focusout', () => setTimeout(f, 120));
  KB.base = Math.max(innerHeight, vv.height);
}

/* =====================================================================
   2. Julemodus (Innstillinger → Glimt) + antrekk overalt
   ===================================================================== */
const PH = [['Advent', 'advent'], ['Jul', 'jul'], ['Nyttår', 'nyttar'], ['Vinter', 'vinter']];
const J = { snow: lsGet('glimt_snow', true) !== false, sound: lsRaw('glimt_jul_sound', 'av') };
const julMode = () => { const v = lsRaw('glimt_jul', 'auto'); return v === 'av' || v === 'pa' ? v : 'auto'; };
const julPh = () => { const v = lsRaw('glimt_jul_p', 'Advent'); return PH.some(([n]) => n === v) ? v : 'Advent'; };
/** Fasen som gjelder nå (fasit julOn): null utenfor perioden eller når Av. */
export function julOn(d = new Date()) {
  const mo = julMode();
  if (mo === 'av') return null;
  if (mo === 'pa') return julPh();
  const M = d.getMonth(), D = d.getDate();
  if (M === 11) return D <= 23 ? 'Advent' : D <= 30 ? 'Jul' : 'Nyttår';
  if (M === 0) return D === 1 ? 'Nyttår' : D <= 13 ? 'Vinter' : null;
  return null;
}
function julNote() {
  const mo = julMode(), ph = julOn();
  if (mo === 'av') return 'Av hele året';
  if (mo === 'pa') return `På · ${julPh()}`;
  return ph ? 'På nå · slås av 13. januar' : 'Slås på 1. desember';
}
function julSet(mode, phase) {
  if (mode) lsRawSet('glimt_jul', mode);
  if (phase) lsRawSet('glimt_jul_p', phase);
  try { window.dispatchEvent(new Event('glimt-jul')); } catch {}
  const P = PH.find(([n]) => n === julPh())?.[1] ?? 'advent';
  hlApi('/glimt/settings', { method: 'PUT', json: { jul: julMode(), julPhase: julMode() === 'pa' ? P : null } }).catch(() => {});
  haptic('tab'); draw();
}
function julTake(r) {
  if (!r || typeof r !== 'object') return;
  let ch = false;
  if (['auto', 'av', 'pa'].includes(r.jul) && r.jul !== julMode()) { lsRawSet('glimt_jul', r.jul); ch = true; }
  const p = PH.find(([, k]) => k === r.julPhase)?.[0]; if (p && p !== julPh()) { lsRawSet('glimt_jul_p', p); ch = true; }
  if (typeof r.snow === 'boolean' && r.snow !== J.snow) { J.snow = r.snow; lsSet('glimt_snow', r.snow); ch = true; }
  if ((r.julSound === 'av' || r.julSound === 'bjelle') && r.julSound !== J.sound) { J.sound = r.julSound; lsRawSet('glimt_jul_sound', r.julSound); ch = true; }
  if (ch) { try { window.dispatchEvent(new Event('glimt-jul')); } catch {} }
}
const HAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 18 Q9 5 18 5 Q20 6 20 8 Q16 8 15 18 Z"/><path d="M3 18h14"/><circle cx="20" cy="8" r="1.6"/></svg>';
/** Kortet rett under figurvalget (fasit Glimt Brief.dc.html, mode settings). */
export function julCard() {
  const mo = julMode(), sw = (on) => `<span class="p35-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
  return `<span class="p35-lab">JULEMODUS</span><div class="p40-jul">
    <div class="p40-julh"><span class="p40-juli">${HAT}</span><span class="p40-jult"><b>Julemodus</b><span>${esc(julNote())}</span></span></div>
    <div class="p40-seg" role="radiogroup" aria-label="Julemodus">${[['auto', 'Auto'], ['av', 'Av'], ['pa', 'På']].map(([k, n]) => `<button type="button" data-p40="jul" data-v="${k}" role="radio" aria-checked="${mo === k}">${n}</button>`).join('')}</div>
    ${mo === 'pa' ? `<div class="p40-jph">${PH.map(([n]) => `<button type="button" data-p40="julp" data-v="${n}" aria-pressed="${julPh() === n}">${n}</button>`).join('')}</div>` : ''}
    <span class="p40-julx">Auto: 1. desember til 13. januar (advent, jul, nyttår og vinter). Glimt får lue og skjerf overalt, og en varmere tone.</span></div>
  <div class="p35-list"><button type="button" class="p35-row" data-p40="julsnow" role="switch" aria-checked="${J.snow}"><span class="p35-rt"><b>Snø i Vær og brief</b><span>Når det snør eller er minus</span></span>${sw(J.snow)}</button>
    <div class="p35-row"><span class="p35-rt"><b>Julelyd på varsler</b><span>${J.sound === 'bjelle' ? 'Myk bjelle (lav og kort)' : 'Av'}</span></span><div class="p40-seg sm">${[['av', 'Av'], ['bjelle', 'Bjelle']].map(([k, n]) => `<button type="button" data-p40="julsnd" data-v="${k}" aria-pressed="${J.sound === k}">${n}</button>`).join('')}</div></div></div>`;
}
const ab = (st) => `position:absolute;pointer-events:none;${st}`;
/** Antrekket (fasit dress) som HTML rundt figuren. Brukes bare når figurbiblioteket ikke gjør det selv. */
export function dress(html, S = 56) {
  const ph = julOn(); if (!ph || !html) return html;
  const P = { Advent: { hat: 1, scarf: 1 }, Jul: { hat: 1, scarf: 1, gift: 1 }, Nyttår: { party: 1 }, Vinter: { beanie: 1, scarf: 1, sc: '#b23a2a' } }[ph] ?? {};
  const k = [];
  if (P.scarf) k.push(`<svg width="${S * 1.05}" height="${S * 0.5}" viewBox="0 0 105 50" style="${ab(`left:50%;bottom:${-S * 0.2}px;margin-left:${-S * 0.525}px;overflow:visible`)}"><path d="M8 10 Q52 26 97 10 L95 24 Q52 40 10 24 Z" fill="${P.sc || '#2f7a4f'}"/><path d="M22 16 l4 12 M40 20 l3 13 M58 20 l-1 13 M76 17 l-3 12" stroke="#f6f1e7" stroke-width="3"/><path d="M70 22 L80 48 L68 50 L62 26 Z" fill="${P.sc || '#2f7a4f'}"/></svg>`);
  if (P.hat) k.push(`<svg width="${S * 0.95}" height="${S * 0.7}" viewBox="0 0 95 70" style="${ab(`left:50%;top:${-S * 0.44}px;margin-left:${-S * 0.42}px;transform:rotate(-14deg);overflow:visible`)}"><path d="M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z" fill="#c8302a"/><circle cx="89" cy="22" r="8" fill="#fbf7ee"/><rect x="6" y="50" width="70" height="15" rx="7.5" fill="#fbf7ee"/></svg>`);
  if (P.beanie) k.push(`<svg width="${S * 0.9}" height="${S * 0.6}" viewBox="0 0 90 60" style="${ab(`left:50%;top:${-S * 0.36}px;margin-left:${-S * 0.45}px;overflow:visible`)}"><path d="M10 50 Q10 10 45 10 Q80 10 80 50 Z" fill="#3b6fb0"/><rect x="6" y="42" width="78" height="14" rx="6" fill="#2b5d8a"/><circle cx="45" cy="8" r="8" fill="#fbf7ee"/></svg>`);
  if (P.party) k.push(`<svg width="${S * 0.6}" height="${S * 0.62}" viewBox="0 0 60 62" style="${ab(`left:50%;top:${-S * 0.48}px;margin-left:${-S * 0.22}px;transform:rotate(12deg);overflow:visible`)}"><path d="M8 56 L30 4 L52 56 Z" fill="#1b1a17"/><path d="M14 42 L46 42 M19 30 L41 30 M24 18 L36 18" stroke="#f2c14e" stroke-width="3"/><circle cx="30" cy="4" r="5" fill="#f2c14e"/></svg>`);
  if (P.gift) k.push(`<span style="${ab(`right:${-S * 0.2}px;bottom:${-S * 0.16}px;width:${S * 0.34}px;height:${S * 0.3}px;border-radius:4px;background:#b23a2a;box-shadow:inset 0 0 0 2px #8a2a1d;transform:rotate(8deg)`)}"><span style="position:absolute;left:44%;top:0;bottom:0;width:12%;background:#f2c14e"></span><span style="position:absolute;top:40%;left:0;right:0;height:14%;background:#f2c14e"></span></span>`);
  return `<span class="p40-dress" style="position:relative;display:inline-block;line-height:0">${html}${k.join('')}</span>`;
}

/* =====================================================================
   3. Totrinnsbekreftelse i appen (GET /api/auth/2fa/status, POST setup/enable/disable/backup/regenerate)
   ===================================================================== */
const TF = { st: null, open: false, step: 0, d: null, code: '', err: '', busy: false, codes: [], saved: false, qr: false, cp: false, cc: false, pw: '', needPw: false, off: false, miss: false };
async function tfLoad() {
  try { TF.st = await hlApi('/auth/2fa/status'); TF.miss = false; }
  catch (e) { if (e.status === 404) TF.miss = true; TF.st = { enabled: !!m.me?.totp, backupLeft: null }; }
}
const tfOn = () => (TF.st ? !!TF.st.enabled : !!m.me?.totp);
/** Gruppen «Tofaktor» i Innstillinger → Sikkerhet (erstatter lenken til web). G = gruppebyggeren i mobile-set.js. */
export function tfaGroup(G) {
  if (!TF.st) tfLoad().then(() => { if (m.screen === 'set') draw(); });
  const on = tfOn(), left = TF.st?.backupLeft;
  const sub = on ? `På · autentiseringsapp${left != null ? ` · ${left} reservekoder igjen` : ''}` : 'Av · sett opp i appen på 1 minutt';
  return G('Tofaktor', [`<button type="button" class="opt-row p40-tfr" data-p40="tfa"><span class="m-grow"><b style="font-weight:500">Totrinnsbekreftelse</b><br><span style="font-size:13px;opacity:.65">${esc(sub)}</span></span><span class="sval" style="opacity:1;color:var(--pp-lab,#f08a76);font-weight:700">${on ? 'Endre ›' : 'Sett opp ›'}</span></button>`],
    'Alt skjer her i appen. Bruk Passord (iOS), Google Authenticator, 1Password eller Aegis.');
}
async function tfSetup() {
  TF.busy = true; TF.err = ''; draw();
  try {
    TF.d = await hlApi('/auth/2fa/setup', { method: 'POST', json: TF.pw ? { password: TF.pw } : {} });
    TF.needPw = false; TF.step = 1;
  } catch (e) {
    if (e.status === 401 || e.status === 403 || /passord|password/i.test(e.message)) { TF.needPw = true; TF.err = TF.pw ? 'Feil passord.' : ''; TF.step = 1; }
    else TF.err = e.status === 404 ? 'Serveren støtter ikke oppsett fra appen ennå. Oppdater Nordlys OS.' : e.message;
  }
  TF.busy = false; draw();
}
async function tfVerify() {
  if (TF.code.length !== 6) { TF.err = 'Skriv alle 6 sifrene.'; draw(); return; }
  TF.busy = true; TF.err = ''; draw();
  try {
    const r = await hlApi('/auth/2fa/enable', { method: 'POST', json: { code: TF.code } });
    TF.codes = Array.isArray(r?.backupCodes) ? r.backupCodes : []; TF.step = 3; TF.saved = false; haptic('ok');
  } catch (e) { haptic('err'); TF.err = e.status === 400 || e.status === 401 || e.status === 422 ? 'Koden stemmer ikke. Prøv den neste som vises.' : e.message; }
  TF.busy = false; draw();
}
async function tfRegen() {
  TF.busy = true; draw();
  try { const r = await hlApi('/auth/2fa/backup/regenerate', { method: 'POST' }); TF.codes = r?.backupCodes ?? r?.codes ?? []; TF.step = 3; TF.saved = false; }
  catch (e) { flash(e.message, 'err'); }
  TF.busy = false; draw();
}
async function tfDisable() {
  if (!TF.pw) { TF.err = 'Skriv passordet ditt for å slå av.'; draw(); return; }
  TF.busy = true; draw();
  try { await hlApi('/auth/2fa/disable', { method: 'POST', json: { password: TF.pw } }); TF.open = false; TF.st = { ...(TF.st ?? {}), enabled: false }; if (m.me) m.me.totp = false; flash('Totrinnsbekreftelse er slått av'); }
  catch (e) { TF.err = e.status === 401 || e.status === 403 ? 'Feil passord.' : e.message; }
  TF.busy = false; draw();
}
function tfOpen() { Object.assign(TF, { open: true, step: tfOn() ? 9 : 0, d: null, code: '', err: '', codes: [], saved: false, qr: false, cp: false, cc: false, pw: '', needPw: false, off: false }); haptic('tap'); draw(); }
const TT = ['Velg metode', 'Koble til autentiseringsappen', 'Skriv inn koden', 'Lagre reservekodene', 'Totrinnsbekreftelse er på'];
const TS = ['Du setter det opp her i appen. Det tar et minutt.', 'Trykk knappen, så legger autentiseringsappen på denne telefonen inn Homelab av seg selv.', 'Skriv de 6 sifrene som vises i autentiseringsappen nå.', 'Bruk en av disse hvis du mister telefonen. Hver kode virker én gang.', 'Kontoen din er nå beskyttet med passord og kode.'];
function tfLayer() {
  if (!TF.open) return '';
  const st = TF.step, sec = String(TF.d?.secret ?? '').replace(/\s/g, ''), grp = sec.replace(/(.{4})/g, '$1 ').trim();
  const back = st === 0 || st >= 4 ? 'Sikkerhet' : 'Tilbake';
  const title = st === 9 ? 'Totrinnsbekreftelse er på' : TT[st];
  const sub = st === 9 ? `Autentiseringsapp${TF.st?.enabledAt ? ` · lagt til ${new Date(TF.st.enabledAt).toLocaleDateString('nb-NO')}` : ''}${TF.st?.backupLeft != null ? ` · ${TF.st.backupLeft} reservekoder igjen` : ''}` : TS[st];
  const bars = st < 4 ? `<div class="p40-tfb">${[0, 1, 2, 3].map((i) => `<i class="${i <= st ? 'on' : ''}"></i>`).join('')}</div>` : '';
  let body = '';
  if (st === 0) body = `<div class="p40-tfm">${[['app', 'Autentiseringsapp', 'Passord, Google Authenticator, 1Password', 'A', '#2b5d8a', 'Anbefalt'], ['pk', 'Passnøkkel med Face ID', 'Ingen kode å skrive. Lagres i iCloud-nøkkelring / Google', 'F', '#2f7a4f', 'Raskest']].map(([k, n, s, i, c, tag], j) => `<button type="button" data-p40="tfm" data-k="${k}"><span class="p40-tfi" style="background:${c}">${i}</span><span class="m-grow"><b>${n}</b><span>${s}</span></span><span class="p40-tag${j ? ' g' : ''}">${tag}</span></button>`).join('')}</div>`;
  else if (st === 1 && TF.needPw) body = `<form class="p40-tff" data-p40form="tfpw"><label><span>Bekreft med passordet ditt</span><input type="password" id="p40-tfpw" autocomplete="current-password" data-p40in="pw" value="${esc(TF.pw)}"></label><button type="submit" class="p40-pri"${TF.busy ? ' disabled' : ''}>${TF.busy ? 'Kobler til …' : 'Fortsett'}</button></form>`;
  else if (st === 1) body = `<a class="p40-pri p40-big" href="${esc(TF.d?.otpauth ?? TF.d?.otpauth_uri ?? '#')}" data-p40="tfotp">Åpne i autentiseringsappen</a>
    <div class="p40-tfs"><span class="p40-lab">HEMMELIG NØKKEL</span><code>${esc(grp || '…')}</code><button type="button" data-p40="tfcp">${TF.cp ? '✓ Kopiert' : 'Kopier'}</button></div>
    <button type="button" class="p40-lnk" data-p40="tfqr">${TF.qr ? 'Skjul QR-kode' : 'Vis QR-kode for en annen enhet'}</button>
    ${TF.qr ? `<div class="p40-tfq">${TF.d?.qrSvg ? TF.d.qrSvg : TF.d?.qrPng ? `<img src="${esc(TF.d.qrPng)}" alt="QR-kode for autentiseringsappen" width="200" height="200">` : '<span>Serveren sendte ingen QR-kode. Bruk nøkkelen over.</span>'}</div>` : ''}
    <button type="button" class="p40-sec" data-p40="tfnext">Jeg har lagt den inn ›</button>`;
  else if (st === 2) body = `<form class="p40-tff" data-p40form="tfcode"><input id="p40-tfc" class="p40-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="••••••" value="${esc(TF.code)}" data-p40in="code" aria-label="Sekssifret kode">
    <button type="submit" class="p40-pri" style="opacity:${TF.code.length === 6 ? 1 : 0.45}"${TF.busy ? ' disabled' : ''}>${TF.busy ? 'Sjekker …' : 'Bekreft'}</button></form>`;
  else if (st === 3) body = `<div class="p40-tfk">${(TF.codes.length ? TF.codes : ['–']).map((c) => `<code>${esc(c)}</code>`).join('')}</div>
    <div class="p40-two"><button type="button" class="p40-sec" data-p40="tfcc">${TF.cc ? '✓ Kopiert' : 'Kopier alle'}</button><button type="button" class="p40-sec" data-p40="tfshare">Lagre i Passord / Del</button></div>
    <button type="button" class="p40-ck" data-p40="tfsaved" role="checkbox" aria-checked="${TF.saved}"><i>${TF.saved ? '✓' : ''}</i>Jeg har lagret reservekodene</button>
    <button type="button" class="p40-pri" data-p40="tffin" style="opacity:${TF.saved ? 1 : 0.45}">${TF.off ? 'Ferdig' : 'Slå på totrinnsbekreftelse'}</button>`;
  else if (st === 4) body = `<div class="p40-tfok"><span>✓</span><b>Totrinnsbekreftelse er på</b><span>Denne telefonen er merket som pålitelig enhet.</span></div><button type="button" class="p40-pri" data-p40="tfx">Ferdig</button>`;
  else if (st === 9) body = `<div class="p40-tfman">${[['tfregen', 'Nye reservekoder', TF.st?.backupLeft != null ? `${TF.st.backupLeft} igjen` : ''], ['tfswap', 'Bytt autentiseringsapp', ''], ['tfpk', 'Legg til passnøkkel (Face ID)', ''], ['tfoff', 'Slå av totrinnsbekreftelse', '']].map(([k, n, v]) => `<button type="button" data-p40="${k}" class="${k === 'tfoff' ? 'red' : ''}"><span class="m-grow">${n}</span>${v ? `<span>${esc(v)}</span>` : ''}<span>›</span></button>`).join('')}</div>
    ${TF.off ? `<form class="p40-tff" data-p40form="tfoff"><label><span>Skriv passordet ditt for å slå av</span><input type="password" id="p40-tfpw2" autocomplete="current-password" data-p40in="pw" value="${esc(TF.pw)}"></label><button type="submit" class="p40-pri red"${TF.busy ? ' disabled' : ''}>Slå av</button></form>` : ''}`;
  return `<div class="p40-tf" role="dialog" aria-modal="true" aria-label="Totrinnsbekreftelse"><div class="p40-tfin">
    <div class="p40-tfh"><button type="button" class="p40-back" data-p40="tfback">‹ ${back}</button>${st < 4 ? `<span class="p40-lab">STEG ${st + 1} AV 4</span>` : '<span></span>'}</div>
    ${bars}<b class="p40-tft">${esc(title)}</b><span class="p40-tfsub">${esc(sub)}</span>
    ${TF.err ? `<span class="p40-err" role="alert">${esc(TF.err)}</span>` : ''}${body}</div></div>`;
}
async function tfPasskey() {
  try {
    const o = await hlApi('/auth/passkey/register/options', { method: 'POST' });
    if (!window.PublicKeyCredential || !o) throw Object.assign(new Error('Passnøkkel støttes ikke her'), { status: 501 });
    const b64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const pk = { ...(o.publicKey ?? o), challenge: b64((o.publicKey ?? o).challenge), user: { ...(o.publicKey ?? o).user, id: b64((o.publicKey ?? o).user.id) } };
    const cred = await navigator.credentials.create({ publicKey: pk });
    const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await hlApi('/auth/passkey/register/verify', { method: 'POST', json: { id: cred.id, rawId: enc(cred.rawId), type: cred.type, response: { clientDataJSON: enc(cred.response.clientDataJSON), attestationObject: enc(cred.response.attestationObject) } } });
    flash('Passnøkkelen er lagt til', 'ok');
    if (!tfOn()) { TF.step = 3; await tfRegen(); }
  } catch (e) { flash(e.status === 404 || e.status === 501 ? 'Passnøkkel krever en nyere server. Bruk autentiseringsapp.' : e.name === 'NotAllowedError' ? 'Avbrutt' : e.message); }
}

/* =====================================================================
   4. Finans: lagt til, Les på nytt, Rediger alt, søk med Glimt-kort
   ===================================================================== */
const SRC = { scan: 'skannet kvittering', bank: 'bankimport', bank_import: 'bankimport', manual: 'lagt inn manuelt', email: 'fra e-post', import: 'importert fra fil', glimt: 'lagt til av Glimt fra chat', shortcut: 'via iOS Snarvei', api: 'via API-nøkkel', csv: 'importert fra fil (CSV)', ofx: 'importert fra fil', pdf: 'importert fra PDF', receipt: 'fra kvittering', ai: 'lagt til av Glimt' };
const fmtAt = (t) => { const d = new Date(t); if (Number.isNaN(+d)) return ''; const p = (o) => d.toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', ...o }); return `${p({ day: '2-digit' })}.${p({ month: '2-digit' })}.${p({ year: 'numeric' })} kl. ${p({ hour: '2-digit', hour12: false })}.${p({ minute: '2-digit' })}`; };
/** «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian» (+ «Sist endret …»). x = transaksjon eller kvittering. */
export function addedLine(x, kind = 'tx') {
  if (!x) return '';
  const a = x.added ?? {}, at = a.at ?? x.createdAt ?? x.created_at ?? x.uploadedAt ?? x.importedAt ?? null;
  const src0 = a.source ?? x.createdVia ?? x.created_via ?? x.source ?? (kind === 'rc' ? 'scan' : x.bank || x.importId ? 'bank' : null);
  const src = a.sourceLabel ?? (src0 === 'bank' || src0 === 'bank_import' ? `bankimport${x.bank?.name || x.bankName ? ` fra ${x.bank?.name || x.bankName}` : ''}` : SRC[src0] ?? '');
  const by = a.byName ?? x.createdByName ?? x.addedBy ?? '';
  const H = Array.isArray(x.history) ? x.history : [], last = H[H.length - 1];
  const upAt = last?.at ?? x.updatedAt ?? x.updated_at ?? null, upBy = last?.byName ?? last?.by ?? x.updatedByName ?? '';
  const edited = upAt && (!at || Math.abs(new Date(upAt) - new Date(at)) > 60e3) && (last || upBy);
  if (!at && !src) return '';
  return `<span class="p40-added">Lagt til${at ? ` ${esc(fmtAt(at))}` : ''}${src ? ` · ${esc(src)}` : ''}${by ? ` · ${esc(by)}` : ''}</span>${edited ? `<span class="p40-added">Sist endret ${esc(fmtAt(upAt))}${upBy ? ` av ${esc(upBy)}` : ''}</span>` : ''}`;
}
const TXE = { id: null, f: null, orig: null, busy: false, rr: null };
/** Verktøyene under transaksjonen (mobile-paper3.js paperTx). */
export function txTools(id, t) {
  const r = t?.receipt, rr = TXE.rr?.id === id ? TXE.rr : null, P39 = MOD.p39;
  const rid = r?.id ?? t?.receiptId;
  let read = '';
  if (rid) {
    if (P39?.RE?.[rid]) read = P39.rePanel(rid);
    else if (rr?.busy) read = `<div class="p40-rr"><span class="p40-glb">✦</span><span class="m-grow"><b>Glimt leser kvitteringen på nytt …</b><span>Sjekker butikk, dato, hver linje og at summen stemmer</span></span></div>`;
    else if (rr?.res) {
      const ch = rr.res.changes ?? [];
      read = ch.length ? `<div class="p40-rr col"><b>Glimt fant ${ch.length} endring${ch.length === 1 ? '' : 'er'}</b>${ch.map((c) => `<div class="p40-rrd"><span>${esc(c.label ?? c.field)}</span><s>${esc(c.old ?? '–')}</s><span>→</span><b>${esc(c.new ?? '–')}</b></div>`).join('')}
        ${rr.res.total_ok === false ? '<span class="p40-err">Summen av linjene stemmer ikke med beløpet. Sjekk med «Rediger alt».</span>' : ''}<div class="p40-two"><button type="button" class="p40-pri" data-p40="rrapply" data-id="${esc(id)}">Bruk endringene</button><button type="button" class="p40-sec" data-p40="rrkeep" data-id="${esc(id)}">Behold som før</button></div></div>`
        : `<div class="p40-rr col"><b>Ingen endringer</b><span>Butikk, dato og ${(r?.lines ?? []).length ? `alle ${(r.lines ?? []).length} linjer` : 'linjene'} stemmer${r?.total != null ? `, og summen er ${kr(r.total)}` : ''}.</span>${rr.res.total_ok === false ? '<span class="p40-err">Summen stemmer ikke. Rett den med «Rediger alt».</span>' : ''}<button type="button" class="p40-sec" data-p40="rrkeep" data-id="${esc(id)}">OK</button></div>`;
    }
    if (!read) read = `<button type="button" class="p40-dark" data-p40="reread" data-id="${esc(id)}" data-r="${esc(rid)}">✦ Les på nytt med Glimt</button>`;
  } else if (t) {
    // Prompt 41: transaksjoner uten kvittering kan også leses på nytt (POST /transactions/:id/reread), uansett status.
    if (rr?.busy) read = `<div class="p40-rr"><span class="p40-glb">✦</span><span class="m-grow"><b>Glimt leser transaksjonen på nytt …</b><span>Sjekker butikk, dato, beløp og kategori</span></span></div>`;
    else if (rr?.res) read = (rr.res.changes ?? []).length ? `<div class="p40-rr col"><b>Glimt fant ${rr.res.changes.length} endring${rr.res.changes.length === 1 ? '' : 'er'}</b>${rr.res.changes.map((c) => `<div class="p40-rrd"><span>${esc(c.label ?? c.field)}</span><s>${esc(c.old ?? '–')}</s><span>→</span><b>${esc(c.new ?? '–')}</b></div>`).join('')}<div class="p40-two"><button type="button" class="p40-pri" data-p40="rrapply" data-id="${esc(id)}">Bruk endringene</button><button type="button" class="p40-sec" data-p40="rrkeep" data-id="${esc(id)}">Behold som det er</button></div></div>`
      : `<div class="p40-rr col"><b>Ingen endringer</b><span>Butikk, dato og beløp stemmer.</span><button type="button" class="p40-sec" data-p40="rrkeep" data-id="${esc(id)}">OK</button></div>`;
    else read = `<button type="button" class="p40-dark" data-p40="reread" data-id="${esc(id)}" data-r="">✦ Les på nytt med Glimt</button>`;
  }
  return `${read}<button type="button" class="pp-btn p40-edall" data-p40="edall" data-id="${esc(id)}">Rediger alt</button>${addedLine(t, 'tx')}${r ? addedLine({ ...r, added: r.added }, 'rc').replace(/Lagt til/, 'Kvittering lagt til') : ''}`;
}
async function reread(id, rid) {
  const T0 = MOD.p3?.TX?.d?.[id];
  TXE.rr = { id, busy: true }; draw();
  try {
    // Prompt 50: som jobb (202 + polling), så proxyen ikke gir 502 på lange lesinger. small = «Les mindre versjon».
    const { reanalyzeJob50 } = await import('./reread50.js');
    const small = TXE.rrSmall === id; TXE.rrSmall = null;
    const tick = ({ secs }) => { const b = document.querySelector('#app .p40-rr b'); if (b && TXE.rr?.busy) b.textContent = `Glimt leser kvitteringen på nytt … ${secs} s`; };
    const r = await reanalyzeJob50(rid, { engine: 'ollama', small, onTick: tick, ...(rid ? {} : { path: `/transactions/${id}/reread` }) }); // prompt 41
    const N = r?.result ?? r?.candidate ?? r ?? {}, O = rid ? T0?.receipt ?? {} : { merchant: T0?.merchant ?? T0?.description, date: T0?.date, total: T0?.amount != null ? Math.abs(T0.amount) : null };
    const ch = Array.isArray(r?.changes) ? r.changes : [['merchant', 'Butikk'], ['date', 'Dato'], ['total', 'Beløp'], ['vat', 'MVA']].map(([f, label]) => ({ field: f, label, old: O[f], new: N[f] })).filter((c) => c.new != null && String(c.new) !== String(c.old ?? ''));
    const ln = (L) => (L ?? []).map((l) => `${l.name} ${l.price}`).join('|');
    if (!r?.changes && N.lines && ln(N.lines) !== ln(O.lines)) ch.push({ field: 'lines', label: 'Linjer', old: `${(O.lines ?? []).length} linjer`, new: `${N.lines.length} linjer` });
    const tot = (N.lines ?? []).reduce((a, l) => a + (+l.price || 0), 0);
    TXE.rr = { id, rid, cand: r?.candidateId ?? null, res: { changes: ch.map((c) => ({ ...c, old: c.field === 'total' && c.old != null ? kr(c.old) : c.old, new: c.field === 'total' && c.new != null ? kr(c.new) : c.new })), total_ok: r?.total_ok ?? (N.lines?.length && N.total != null ? Math.abs(Math.abs(tot) - Math.abs(N.total)) < 0.6 : null) } };
    haptic('ok');
  } catch (e) {
    // Prompt 50: forklaring brukeren kan handle på + «Les mindre versjon» ved tidsavbrudd.
    const { rereadError50 } = await import('./reread50.js');
    const E = e.status === 404 && !e.kode ? { text: 'Ny lesing er ikke tilgjengelig på denne serveren ennå.' } : rereadError50(e);
    TXE.rr = null; flash(E.text, 'err');
    if (E.small && rid) { TXE.rrSmall = id; flash(`${E.text} Trykk «Les på nytt» igjen for å lese en mindre versjon.`, 'err'); }
  }
  draw();
}
async function rrApply(id, keep) {
  const R = TXE.rr; TXE.rr = null;
  if (R?.cand && !R.rid) { try { await api(`/transactions/${id}/reread/apply`, { method: 'POST', json: { candidateId: R.cand, keep: keep ? 'old' : 'new' } }); } catch (e) { flash(e.message, 'err'); } }
  else if (R?.cand) { try { await api(`/receipts/${R.rid}/reanalyze/apply`, { method: 'POST', json: { candidateId: R.cand, keep: keep ? 'old' : 'new' } }); } catch (e) { flash(e.message, 'err'); } }
  if (!keep) { flash('✦ Endringene er tatt i bruk', 'ok'); await MOD.p3?.txLoad?.(id, true).catch(() => {}); }
  draw();
}
/* Rediger alt: alle felt + varelinjer, sumkontroll live, tilbakestill til Glimts lesing. */
function edOpen(id) {
  const t = MOD.p3?.TX?.d?.[id]; if (!t) return;
  const amt = Number(t.amount) || 0, r = t.receipt;
  const f = { desc: t.merchant || t.description || '', date: String(t.date ?? '').slice(0, 10), amt: n2(Math.abs(amt)).replace(/\s/g, ''), sign: amt > 0 ? 1 : -1, cat: t.categoryId ?? null, acc: t.accountId ?? null, note: t.note ?? t.notes ?? '', lines: ((r?.lines?.length ? r.lines : t.lines) ?? []).filter((l) => l && l.name).map((l) => ({ n: l.name, p: l.price != null ? n2(Math.abs(l.price)).replace(/\s/g, '') : '' })) };
  TXE.id = id; TXE.f = f; TXE.orig = JSON.parse(JSON.stringify(f)); TXE.read = r?.extraction ?? r?.original ?? null; haptic('tap'); draw();
  setTimeout(() => document.getElementById('p40-ed-desc')?.focus({ preventScroll: true }), 60);
}
const num = (s) => { const v = parseFloat(String(s ?? '').replace(/\s| /g, '').replace('−', '-').replace(',', '.')); return Number.isFinite(v) ? v : null; };
function edSheet() {
  if (TXE.id == null || !TXE.f) return '';
  const f = TXE.f, cs = (S.boot?.categories ?? []).filter((c) => (f.sign > 0 ? c.kind === 'income' : c.kind !== 'income')), as = S.boot?.accounts ?? [];
  const sum = f.lines.reduce((a, l) => a + (num(l.p) ?? 0), 0), amt = num(f.amt) ?? 0, ok = Math.abs(sum - amt) < 0.01;
  return `<div class="sheet-bg" data-p40="edx"></div><div class="pp-sheet tall p40-eds" role="dialog" aria-modal="true" aria-label="Rediger alt"><span class="pp-grab"></span>
    <div class="pp-row"><div class="pp-sh">Rediger alt</div>${X('data-p40="edx"', ' p40-xs')}</div>
    <label class="p40-fld"><span>Butikk / beskrivelse</span><input id="p40-ed-desc" data-p40ed="desc" value="${esc(f.desc)}" autocomplete="off"></label>
    <div class="p40-two"><label class="p40-fld"><span>Dato</span><input type="date" id="p40-ed-date" data-p40ed="date" value="${esc(f.date)}"></label>
      <label class="p40-fld"><span>Beløp (${f.sign > 0 ? 'inntekt' : 'utgift'})</span><input id="p40-ed-amt" data-p40ed="amt" inputmode="decimal" value="${esc(f.amt)}"></label></div>
    <span class="p40-lab">KATEGORI</span><div class="pp-chips pp-wrap">${cs.map((c) => `<button type="button" class="pp-fchip" data-p40="edcat" data-v="${c.id}" aria-pressed="${+f.cat === c.id}"><i class="pp-cdot" style="background:${esc(c.color ?? '#8a8478')}"></i>${esc(c.name)}</button>`).join('')}</div>
    ${as.length ? `<span class="p40-lab">KONTO</span><div class="pp-chips pp-wrap">${as.map((a) => `<button type="button" class="pp-fchip" data-p40="edacc" data-v="${a.id}" aria-pressed="${+f.acc === a.id}">${esc(a.name)}</button>`).join('')}</div>` : ''}
    <label class="p40-fld"><span>Notat</span><textarea id="p40-ed-note" data-p40ed="note" rows="2">${esc(f.note)}</textarea></label>
    <span class="p40-lab">VARELINJER</span><div class="p40-lines">${f.lines.map((l, i) => `<div class="p40-ln"><input id="p40-ln-n${i}" data-p40ln="n" data-i="${i}" value="${esc(l.n)}" aria-label="Vare ${i + 1}"><input id="p40-ln-p${i}" data-p40ln="p" data-i="${i}" value="${esc(l.p)}" inputmode="decimal" aria-label="Pris ${i + 1}"><button type="button" data-p40="lnrm" data-i="${i}" aria-label="Fjern linje">×</button></div>`).join('')}
      <button type="button" class="p40-lnk" data-p40="lnadd">+ Legg til linje</button></div>
    ${f.lines.length ? `<span class="p40-sum ${ok ? 'ok' : 'bad'}">Sum linjer ${kr(sum)} · ${ok ? 'stemmer' : 'stemmer ikke med beløpet'}</span>` : ''}
    <button type="button" class="p40-lnk" data-p40="edreset">Tilbakestill til slik Glimt leste den</button>
    <div class="p40-two"><button type="button" class="p40-sec" data-p40="edx">Avbryt</button><button type="button" class="p40-pri" data-p40="edsave"${TXE.busy ? ' disabled' : ''}>${TXE.busy ? 'Lagrer …' : 'Lagre'}</button></div></div>`;
}
async function edSave() {
  const id = TXE.id, f = TXE.f, o = TXE.orig; if (id == null || !f) return;
  const a = num(f.amt); if (a == null) { flash('Beløpet mangler', 'err'); return; }
  const body = {};
  if (f.desc !== o.desc) { body.description = f.desc; body.merchant = f.desc; }
  if (f.date !== o.date) body.date = f.date;
  if (f.amt !== o.amt) body.amount = f.sign * Math.abs(a);
  if (f.cat !== o.cat) body.categoryId = f.cat;
  if (f.acc !== o.acc) body.accountId = f.acc;
  if (f.note !== o.note) body.note = f.note;
  if (JSON.stringify(f.lines) !== JSON.stringify(o.lines)) body.lines = f.lines.filter((l) => l.n.trim()).map((l) => ({ name: l.n.trim(), price: num(l.p) }));
  if (!Object.keys(body).length) { TXE.id = null; draw(); return; }
  TXE.busy = true; draw();
  try {
    await api(`/transactions/${id}`, { method: 'PATCH', json: body });
    TXE.id = null; TXE.busy = false; haptic('ok'); flash('Transaksjonen er oppdatert', 'ok');
    await MOD.p3?.txLoad?.(id, true).catch(() => {});
    if (MOD.p3?.FX) MOD.p3.FX.t = 0;
  } catch (e) { TXE.busy = false; haptic('err'); flash(e.message, 'err'); }
  draw();
}

/* ---------- Finans → Søk: Glimt-svar med nøkkeltall og kort ---------- */
const STD = [
  ['sub', /\b(abonnement\w*|abo|faste trekk|hva betaler jeg for|strømmetjenest\w*)\b/i],
  ['fast', /\b(faste utgifter|faste kostnader|regninger)\b/i],
  ['konto', /\b(kontoer|saldo|hvor mye har jeg)\b/i],
  ['budsjett', /\b(budsjett\w*)\b/i],
  ['spend', /\b(hvor mye (?:har jeg )?brukt|hvor mye brukte|forbruk)\b/i],
];
export const stdQ = (q) => STD.some(([, re]) => re.test(String(q ?? '')));
const stdKind = (q) => STD.find(([, re]) => re.test(String(q ?? '')))?.[0] ?? null;
const daysTo = (d) => { if (!d) return null; const x = new Date(`${String(d).slice(0, 10)}T12:00`); return Math.round((x - new Date(`${dayIso(0)}T12:00`)) / 864e5); };
const dShort = (d) => new Date(`${String(d).slice(0, 10)}T12:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }).replace('.', '');
const perMonth = (a, cyc) => (/year|år|annual/i.test(cyc ?? '') ? a / 12 : /week|uke/i.test(cyc ?? '') ? (a * 52) / 12 : /quarter|kvartal/i.test(cyc ?? '') ? a / 3 : a);
/** POST /finans/api/search/ask {q}; reserve lokalt for abonnementer og forbruk. → {text, source, kpis, cards, open} */
export async function searchAsk(q) {
  try {
    const r = await api('/search/ask', { method: 'POST', json: { q } });
    if (r && (r.text || r.cards?.length)) return normAsk(r);
  } catch (e) { if (e.status && e.status !== 404 && e.status !== 405 && e.status !== 501) throw e; }
  const k = stdKind(q);
  if (k === 'sub') {
    let L = await api('/subscriptions').catch(() => null); L = Array.isArray(L) ? L : L?.items ?? [];
    L = L.filter((s) => s && s.active !== false && s.status !== 'cancelled');
    if (!L.length) return { text: 'Fant ingen aktive abonnementer.', source: 'fra Subscription OS', kpis: [], cards: [], open: { label: 'Åpne Subscription OS ›', href: '#/sub' } };
    const items = L.map((s) => ({ kind: 'sub', id: s.id, name: s.name ?? s.service ?? 'Abonnement', amount: Math.abs(+s.amount || +s.price || 0), cycle: s.interval ?? s.cycle ?? 'monthly', next: s.nextDate ?? s.next_date ?? s.nextCharge ?? null, logo: s.logo ?? s.logoUrl ?? null, color: s.color ?? null }))
      .sort((a, b) => String(a.next ?? '9').localeCompare(String(b.next ?? '9')));
    const pm = items.reduce((a, x) => a + perMonth(x.amount, x.cycle), 0), nx = items.find((x) => x.next);
    const dn = nx ? daysTo(nx.next) : null;
    return { text: `Du har ${items.length} abonnement${items.length === 1 ? '' : 'er'}. Til sammen ${kr(pm)} i måneden.${nx ? ` Neste trekk er ${nx.name} ${dn === 0 ? 'i dag' : dn === 1 ? 'i morgen' : `om ${dn} dager`}.` : ''}`,
      source: 'fra Subscription OS', kpis: [{ label: 'PER MÅNED', value: kr(pm) }, { label: 'PER ÅR', value: kr(pm * 12) }, ...(nx ? [{ label: 'NESTE TREKK', value: dShort(nx.next), sub: `${nx.name} · ${kr(nx.amount)}` }] : [])], cards: items, open: { label: 'Åpne Subscription OS ›', href: '#/sub' } };
  }
  return null; // resten: vanlig AI-søk
}
function normAsk(r) {
  const cards = (r.cards ?? r.items ?? []).map((c) => ({ ...c, kind: c.kind ?? c.type ?? 'tx', name: c.name ?? c.title ?? c.merchant ?? c.description ?? '', amount: c.amount != null ? Math.abs(+c.amount) : null, next: c.next ?? c.next_date ?? c.nextDate ?? null, cycle: c.cycle ?? c.interval ?? null }));
  const kpis = (r.kpis ?? cards.filter((c) => c.kind === 'stat').map((c) => ({ label: c.label, value: c.value, sub: c.sub }))).map((k) => ({ label: String(k.label ?? '').toUpperCase(), value: typeof k.value === 'number' ? kr(k.value) : String(k.value ?? ''), sub: k.sub ?? '' }));
  const src = r.source ? (/^(fra|leste)\b/i.test(r.source) ? r.source : `fra ${r.source}`) : 'leste transaksjoner og kvitteringer';
  const op = r.open ?? r.action; const open = op ? { label: op.label ?? 'Åpne ›', href: op.href ?? (op.target ? `#/${String(op.target).replace(/^#?\/?/, '')}` : '#/sub') } : null;
  return { text: cleanMd(r.text ?? r.summary ?? ''), source: src, kpis, cards: cards.filter((c) => c.kind !== 'stat'), open, model: r.model ?? null };
}
const logoOf = (c) => (c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy">` : `<i style="background:${esc(c.color ?? '#2b5d8a')}">${esc(String(c.name || '?').slice(0, 1).toUpperCase())}</i>`);
export function glimtCard(G) {
  const row = (c) => {
    const dn = daysTo(c.next), soon = dn != null && dn <= 7;
    const href = c.kind === 'sub' ? `#/sub${c.id != null ? `` : ''}` : c.kind === 'tx' && c.id != null ? null : c.href ?? null;
    const right = c.amount != null ? `<span class="p40-gcr"><b>${kr(c.amount)}</b><span>${c.kind === 'sub' ? (/year|år/i.test(c.cycle ?? '') ? `per år · ${n0(c.amount / 12)}/mnd` : 'per mnd') : esc(c.sub ?? '')}</span></span>` : '';
    const sub = c.kind === 'sub' && c.next ? `<span class="${soon ? 'red' : ''}">Neste trekk ${dShort(c.next)} · ${dn === 0 ? 'i dag' : dn === 1 ? 'i morgen' : dn < 0 ? `for ${-dn} dager siden` : `om ${dn} dager`}</span>` : `<span>${esc(c.sub ?? c.date ?? '')}</span>`;
    const inner = `<span class="p40-gcl">${logoOf(c)}</span><span class="m-grow"><b>${esc(c.name)}</b>${sub}</span>${right}`;
    return c.kind === 'tx' && c.id != null ? `<button type="button" class="p40-gci" data-tx="${esc(c.id)}">${inner}</button>` : href ? `<a class="p40-gci" href="${esc(href)}">${inner}</a>` : `<div class="p40-gci">${inner}</div>`;
  };
  return `<div class="pp-card p40-gc"><div class="p40-gch"><span class="pp-lab">✦ GLIMT</span><span class="p40-gcs" title="${esc(G.model ?? '')}">${esc(G.source ?? '')}</span></div>
    ${G.text ? `<p class="p40-gct">${esc(G.text)}</p>` : ''}
    ${G.kpis?.length ? `<div class="p40-kpi">${G.kpis.slice(0, 3).map((k) => `<div><small>${esc(k.label)}</small><b>${esc(k.value)}</b>${k.sub ? `<span>${esc(k.sub)}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${G.cards?.length ? `<div class="p40-gcl0">${G.cards.slice(0, 30).map(row).join('')}</div>` : ''}
    ${G.open ? `<a class="p40-sec p40-gco" href="${esc(G.open.href)}">${esc(G.open.label)}</a>` : ''}</div>`;
}

/* =====================================================================
   5. Nyheter: Glimt-siden (POST /api/news/glimt) med kilder, temaer, periode og lengde
   ===================================================================== */
const TOP = [['norge', 'Norge'], ['verden', 'Verden'], ['okonomi', 'Økonomi'], ['sport', 'Sport'], ['teknologi', 'Teknologi'], ['kultur', 'Kultur']];
const NG = { open: false, d: null, busy: false, err: '', pick: false, src: null, talk: false, ...(lsGet('hl_rss_glimt', {}) || {}) };
NG.len ??= 'kort'; NG.per ??= '24t'; NG.sel ??= null; NG.top ??= TOP.map(([k]) => k);
const ngPrefs = () => { const v = { len: NG.len, per: NG.per, sel: NG.sel, top: NG.top }; lsSet('hl_rss_glimt', v); hlApi('/me/layout', { method: 'PUT', json: { news_glimt: v } }).catch(() => {}); };
async function ngSources() {
  if (NG.src) return;
  try { const r = await hlApi('/news/glimt/sources'); NG.src = (r?.sources ?? r ?? []).map((s) => ({ id: String(s.id), name: s.name, count: s.count ?? null })); }
  catch { NG.src = []; }
}
export function ngOpen() {
  NG.open = true; NG.pick = false; haptic('tap');
  if (m.screen !== 'nyheter') location.hash = '#/nyheter';
  ngLoad(); ngSources().then(draw);
  draw();
}
async function ngLoad(force = false) {
  if (NG.busy || (!force && NG.d && Date.now() - NG.d.t < 30 * 60e3)) return;
  NG.busy = true; NG.err = ''; draw();
  try {
    const r = await hlApi('/news/glimt', { method: 'POST', json: { sources: NG.sel ?? undefined, topics: NG.top, period: NG.per, length: NG.len } });
    if (!r || !Array.isArray(r.sections)) throw Object.assign(new Error('tomt svar'), { status: 404 });
    NG.d = { ...r, t: Date.now() };
    if (Array.isArray(r.sources) && r.sources.length) NG.src = r.sources.map((s) => ({ id: String(s.id), name: s.name, count: s.count ?? null }));
  } catch (e) {
    if (e.status && e.status !== 404 && e.status !== 405 && e.status !== 501) NG.err = e.message;
    NG.d = await ngLocal();
  }
  NG.busy = false; draw();
}
/** Reserve: lokalt sammendrag av titlene, gruppert per tema (som i designet). */
async function ngLocal() {
  let R = null; try { R = await hlApi('/rss?cat=siste&limit=40'); } catch {}
  const all = (R?.items ?? []).filter((x) => x && x.title);
  if (!NG.src?.length && R?.feeds?.length) NG.src = R.feeds.map((f) => ({ id: String(f.id ?? f.name), name: f.name ?? f.title }));
  const cut = NG.per === 'uke' ? 7 * 864e5 : NG.per === 'idag' ? (Date.now() - new Date(`${dayIso(0)}T00:00`)) : 864e5;
  const it = all.filter((x) => (!NG.sel || NG.sel.includes(String(x.feedId ?? x.feed))) && (!x.published || Date.now() - new Date(x.published) <= cut + 3600e3) && (!x.category || x.category === 'siste' || NG.top.includes(x.category))).slice(0, 30);
  const refs = it.map((x, i) => ({ n: i + 1, title: x.title, source: x.feed ?? x.source ?? '', url: x.url, image: x.image ?? null, time: x.published ? hm(x.published) : '', cat: x.category ?? 'norge', lead: x.summary ?? x.lead ?? x.ai ?? '' }));
  const sec = TOP.map(([k, h]) => ({ h, refs: refs.filter((r) => (k === 'norge' ? !TOP.some(([t]) => t === r.cat) || r.cat === 'norge' : r.cat === k)) })).filter((s) => s.refs.length);
  const max = NG.len === 'lang' ? 6 : 3;
  const sections = sec.map((s) => ({ h: s.h, text: s.refs.slice(0, max).map((r) => `${r.source ? `${r.source} melder: ` : ''}${cleanMd(r.title).replace(/[.!?]?$/, '.')} [${r.n}]`).join(' '), refs: s.refs.slice(0, max).map((r) => r.n), img: s.refs.find((r) => r.image)?.n ?? null }));
  const srcN = [...new Set(refs.map((r) => r.source).filter(Boolean))];
  return { title: NG.per === 'uke' ? 'Uka i nyheter' : NG.per === 'idag' ? 'Dette skjer i dag' : 'Siste døgn', lead: refs.length ? `${refs.length} saker fra ${srcN.slice(0, 3).join(', ')}${srcN.length > 3 ? ' og flere' : ''}. Glimt har samlet det viktigste per tema.` : 'Ingen saker passer valgene dine akkurat nå.', sections, refs, local: true, updatedAt: new Date().toISOString(), t: Date.now() };
}
const refChip = (n, R) => { const r = R.find((x) => +x.n === +n); return r ? `<a class="p40-ref" href="${esc(r.url ?? '#')}" target="_blank" rel="noopener" aria-label="Kilde ${n}: ${esc(r.title)}">${n}</a>` : ''; };
// Prompt 41 (claude-code-nyhet-oppsummering-bredde.md): kildene som små tall (aldri halve hakeparenteser) og egennavn med stor forbokstav.
const PROPER = ['Norge', 'Oslo', 'Bergen', 'Trondheim', 'Stavanger', 'Tromsø', 'Sverige', 'Danmark', 'Europa', 'USA', 'Ukraina', 'Russland', 'Kina', 'Israel', 'Gaza'];
const tidy = (t) => { let x = String(t ?? ''); for (const w of PROPER) x = x.replace(new RegExp(`\\b${w}\\b`, 'gi'), w); return x.replace(/\bom ([^.,]+?) og ([^.,]+?) og ([^.,]+?)\./g, 'om $1, $2 og $3.'); };
function ngText(t, R) { return esc(tidy(cleanMd(t))).replace(/\s*\[(\d+)\]/g, (a, n) => refChip(n, R)).replace(/\s*\[\d*|\d*\](\s*·)?/g, ''); }
function ngLayer() {
  if (!NG.open || m.screen !== 'nyheter') return '';
  const D = NG.d, R = D?.refs ?? [], used = new Set(), imgs = D?.images ?? [];
  const secs = (D?.sections ?? []).map((s, i) => {
    (s.refs ?? []).forEach((n) => used.add(+n)); String(s.text ?? '').replace(/\[(\d+)\]/g, (a, n) => { used.add(+n); return a; });
    const showImg = NG.len === 'lang' || i < 3, imN = s.img ?? s.image ?? imgs.find((x) => (s.refs ?? []).includes(x.ref))?.ref ?? (s.refs ?? []).find((n) => R.find((r) => +r.n === +n)?.image);
    const im = imN != null ? (imgs.find((x) => +x.ref === +imN)?.url ?? R.find((r) => +r.n === +imN)?.image) : null, rs = R.find((r) => +r.n === +imN);
    return `<section class="p40-ngs"><h3>${esc(s.h ?? s.title ?? '')}</h3>${showImg && im ? `<figure class="${i ? 'r32' : 'r169'}"><img src="${esc(im)}" alt="${esc(rs?.title ?? '')}" loading="lazy"><figcaption>Bilde fra saken [${esc(imN)}]${rs?.source ? ` · ${esc(rs.source)}` : ''}</figcaption></figure>` : ''}<p>${ngText(s.text ?? (s.avsnitt ?? []).map((a) => `${a.tekst} ${(a.ref ?? []).map((n) => `[${n}]`).join(' ')}`).join(' '), R)}</p></section>`;
  }).join('');
  const srcList = R.filter((r) => used.has(+r.n));
  const nS = new Set(srcList.map((r) => r.source)).size;
  const meta = D ? `${new Date(D.updatedAt ?? Date.now()).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} · ${R.length} saker · ${nS || new Set(R.map((r) => r.source)).size} kilder · ${NG.len === 'lang' ? 'langt' : 'kort'}` : '';
  const pick = NG.pick ? ngPick() : '';
  return `<div class="p40-ng" role="dialog" aria-modal="true" aria-label="Glimt · nyhetsoppsummering"><div class="p40-ngin">
    <div class="p40-ngh"><button type="button" class="p40-back" data-p40="ngx">‹ Nyheter</button><span class="m-grow"></span><button type="button" class="p40-chip" data-p40="ngtalk">${NG.talk ? '■ Stopp' : '▶ Les opp'}</button><button type="button" class="p40-chip" data-p40="ngpick">Innhold</button></div>
    <span class="p40-ngk">✦ GLIMT · NYHETSOPPSUMMERING</span>
    <h2 class="p40-ngt">${esc(D?.title ?? 'Siste døgn')}</h2>${meta ? `<span class="p40-ngm">${esc(meta)}</span>` : ''}
    ${NG.err ? `<span class="p40-err">${esc(NG.err)}</span>` : ''}
    ${NG.busy && !D ? '<div class="m-spin"></div>' : ''}${NG.busy && D ? '<span class="p40-ngm">✦ Glimt lager nytt sammendrag …</span>' : ''}
    ${D ? `<p class="p40-ngl">${ngText(D.lead ?? '', R)}</p>${secs}
    ${srcList.length ? `<span class="p40-lab">KILDER</span><div class="p40-ngr">${srcList.map((r) => `<a href="${esc(r.url ?? '#')}" target="_blank" rel="noopener"><span class="p40-ngn">${r.n}</span>${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : '<i></i>'}<span class="m-grow"><b>${esc(r.title)}</b><span>${esc([r.source, r.time].filter(Boolean).join(' · '))}</span></span></a>`).join('')}</div>` : ''}
    <span class="p40-ngf">Laget av Glimt kl. ${esc(hm(D.updatedAt ?? Date.now()))} fra kildene du har valgt. Trykk på et tall for å lese saken.</span>` : ''}
    </div>${pick}</div>`;
}
function ngPick() {
  const S0 = NG.src ?? [], sel = NG.sel ?? S0.map((s) => s.id);
  const n = (NG.d?.refs ?? []).length;
  return `<div class="sheet-bg" data-p40="ngpickx"></div><div class="pp-sheet tall p40-ngp" role="dialog" aria-label="Innhold"><span class="pp-grab"></span>
    <div class="pp-row"><div class="pp-sh">Innhold</div>${X('data-p40="ngpickx"', ' p40-xs')}</div>
    <span class="p40-lab">KILDER</span><div class="pp-chips pp-wrap">${S0.length ? S0.map((s) => `<button type="button" class="pp-fchip" data-p40="ngsrc" data-v="${esc(s.id)}" aria-pressed="${sel.includes(s.id)}">${esc(s.name)}</button>`).join('') : '<span class="pp-mut">Alle kildene dine brukes.</span>'}</div>
    <span class="p40-lab">TEMAER</span><div class="pp-chips pp-wrap">${TOP.map(([k, h]) => `<button type="button" class="pp-fchip" data-p40="ngtop" data-v="${k}" aria-pressed="${NG.top.includes(k)}">${h}</button>`).join('')}</div>
    <span class="p40-lab">PERIODE</span><div class="p40-seg">${[['idag', 'I dag'], ['24t', '24 t'], ['uke', 'Uke']].map(([k, h]) => `<button type="button" data-p40="ngper" data-v="${k}" aria-pressed="${NG.per === k}">${h}</button>`).join('')}</div>
    <span class="p40-lab">LENGDE</span><div class="p40-seg">${[['kort', 'Kort'], ['lang', 'Lang']].map(([k, h]) => `<button type="button" data-p40="nglen" data-v="${k}" aria-pressed="${NG.len === k}">${h}</button>`).join('')}</div>
    <button type="button" class="p40-pri" data-p40="ngrun">✦ Lag sammendrag${n ? ` (${n} saker)` : ''}</button></div>`;
}
function ngTalk() {
  const ss = window.speechSynthesis; if (!ss) { flash('Opplesning støttes ikke her'); return; }
  if (NG.talk) { ss.cancel(); NG.talk = false; draw(); return; }
  const D = NG.d; if (!D) return;
  const txt = [D.title, cleanMd(D.lead), ...(D.sections ?? []).map((s) => `${s.h ?? ''}. ${cleanMd(s.text ?? '')}`)].join('. ');
  const u = new SpeechSynthesisUtterance(txt); u.lang = 'nb-NO'; u.rate = 1;
  u.onend = u.onerror = () => { NG.talk = false; draw(); };
  ss.cancel(); ss.speak(u); NG.talk = true; draw();
}

/* =====================================================================
   6. Vel fremme: hele flyten (1a + 1b + 1c) ligger i mobile-p40h.js (lastes lat ved oppstart)
   ===================================================================== */
let HM = null;
export const hjemlysFam = () => HM?.famCard?.() ?? '';
export const hjemlysHome = (editing = false) => HM?.homeCard?.(editing) ?? '';

/* =====================================================================
   Hendelser, lag og oppstart
   ===================================================================== */
const MOD = {};
export function layer40() { return tfLayer() + edSheet() + ngLayer() + (HM?.layer?.() ?? ''); }
export async function bind40(e, t) {
  // Gjøremål: «‹ Hjem» nullstiller historikken (location.replace), uansett om siden ble åpnet fra Hjem eller Mer.
  if (m.screen === 'huske' && t.closest?.('.pp-hero .pp-back')) { e.preventDefault(); haptic('tap'); location.replace('#/hl'); return true; }
  const x = t.closest?.('[data-p40]'); if (!x) return false;
  const k = x.dataset.p40, id = x.dataset.id;
  switch (k) {
    case 'bibel': {
      if (t.closest('button, a') && t.closest('button, a') !== x) return false; // Kopier / Nytt vers gjør sin egen handling
      if (MOD.p39?.swMoved?.()) { e.preventDefault(); return true; }
      e.preventDefault(); vib(8); haptic('tap'); location.hash = '#/bibel'; return true;
    }
    case 'ngl': e.preventDefault(); ngOpen(); return true;
    case 'ngx': NG.open = false; try { speechSynthesis?.cancel(); } catch {} NG.talk = false; haptic('tap'); draw(); return true;
    case 'ngpick': NG.pick = true; ngSources().then(draw); draw(); return true;
    case 'ngpickx': NG.pick = false; draw(); return true;
    case 'ngsrc': { const all = (NG.src ?? []).map((s) => s.id), cur = NG.sel ?? all, v = x.dataset.v; NG.sel = cur.includes(v) ? cur.filter((y) => y !== v) : [...cur, v]; if (NG.sel.length === all.length) NG.sel = null; haptic('tab'); draw(); return true; }
    case 'ngtop': { const v = x.dataset.v; NG.top = NG.top.includes(v) ? NG.top.filter((y) => y !== v) : [...NG.top, v]; if (!NG.top.length) NG.top = [v]; haptic('tab'); draw(); return true; }
    case 'ngper': NG.per = x.dataset.v; haptic('tab'); draw(); return true;
    case 'nglen': NG.len = x.dataset.v; haptic('tab'); draw(); return true;
    case 'ngrun': NG.pick = false; ngPrefs(); NG.d = null; ngLoad(true); return true;
    case 'ngtalk': ngTalk(); return true;
    case 'jul': julSet(x.dataset.v); return true;
    case 'julp': julSet('pa', x.dataset.v); return true;
    case 'julsnow': J.snow = !J.snow; lsSet('glimt_snow', J.snow); hlApi('/glimt/settings', { method: 'PUT', json: { snow: J.snow } }).catch(() => {}); haptic('tab'); draw(); return true;
    case 'julsnd': J.sound = x.dataset.v; lsRawSet('glimt_jul_sound', J.sound); hlApi('/glimt/settings', { method: 'PUT', json: { julSound: J.sound } }).catch(() => {}); haptic('tab'); draw(); return true;
    case 'tfa': e.preventDefault(); tfOpen(); return true;
    case 'tfback': if (TF.step === 0 || TF.step >= 4) { TF.open = false; tfLoad().then(draw); } else { TF.step = TF.step === 1 && TF.needPw ? 0 : TF.step - 1; TF.err = ''; } haptic('tap'); draw(); return true;
    case 'tfx': TF.open = false; tfLoad().then(draw); draw(); return true;
    case 'tfm': if (x.dataset.k === 'pk') { await tfPasskey(); return true; } await tfSetup(); return true;
    case 'tfotp': setTimeout(() => { if (TF.open && TF.step === 1) { TF.step = 2; draw(); setTimeout(() => document.getElementById('p40-tfc')?.focus(), 60); } }, 600); return false; // lenken åpner appen
    case 'tfcp': try { await navigator.clipboard?.writeText(String(TF.d?.secret ?? '').replace(/\s/g, '')); } catch {} TF.cp = true; haptic('ok'); draw(); return true;
    case 'tfqr': TF.qr = !TF.qr; draw(); return true;
    case 'tfnext': TF.step = 2; TF.err = ''; draw(); setTimeout(() => document.getElementById('p40-tfc')?.focus(), 60); return true;
    case 'tfcc': try { await navigator.clipboard?.writeText(TF.codes.join('\n')); } catch {} TF.cc = true; haptic('ok'); draw(); return true;
    case 'tfshare': try { await navigator.share?.({ title: 'Homelab reservekoder', text: TF.codes.join('\n') }); } catch {} return true;
    case 'tfsaved': TF.saved = !TF.saved; haptic('tab'); draw(); return true;
    case 'tffin': if (!TF.saved) return true; TF.step = 4; TF.st = { ...(TF.st ?? {}), enabled: true, backupLeft: TF.codes.length || TF.st?.backupLeft }; if (m.me) m.me.totp = true; haptic('ok'); draw(); return true;
    case 'tfregen': await tfRegen(); return true;
    case 'tfswap': TF.pw = ''; await tfSetup(); return true;
    case 'tfpk': await tfPasskey(); return true;
    case 'tfoff': TF.off = !TF.off; TF.err = ''; draw(); setTimeout(() => document.getElementById('p40-tfpw2')?.focus(), 60); return true;
    case 'reread': e.preventDefault(); reread(id, x.dataset.r); return true;
    case 'rrapply': rrApply(id, false); return true;
    case 'rrkeep': rrApply(id, true); return true;
    case 'edall': e.preventDefault(); edOpen(id); return true;
    case 'edx': TXE.id = null; draw(); return true;
    case 'edcat': TXE.f.cat = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'edacc': TXE.f.acc = +x.dataset.v; haptic('tab'); draw(); return true;
    case 'lnrm': TXE.f.lines.splice(+x.dataset.i, 1); haptic('tap'); draw(); return true;
    case 'lnadd': TXE.f.lines.push({ n: '', p: '' }); draw(); setTimeout(() => document.getElementById(`p40-ln-n${TXE.f.lines.length - 1}`)?.focus(), 40); return true;
    case 'edreset': { const R = TXE.read; TXE.f = JSON.parse(JSON.stringify(TXE.orig)); if (R?.lines) TXE.f.lines = R.lines.map((l) => ({ n: l.name, p: l.price != null ? n2(Math.abs(l.price)).replace(/\s/g, '') : '' })); haptic('tap'); draw(); return true; }
    case 'edsave': edSave(); return true;
    default: return k.startsWith('hj') && HM ? HM.bind(k, x, e) : false;
  }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset?.p40in === 'code') { TF.code = t.value.replace(/\D/g, '').slice(0, 6); if (t.value !== TF.code) t.value = TF.code; const b = t.form?.querySelector('.p40-pri'); if (b) b.style.opacity = TF.code.length === 6 ? '1' : '.45'; if (TF.code.length === 6 && e.inputType !== 'deleteContentBackward') tfVerify(); return; }
  if (t.dataset?.p40in === 'pw') { TF.pw = t.value; return; }
  if (HM?.input?.(t)) return;
  if (t.dataset?.p40ed && TXE.f) { TXE.f[t.dataset.p40ed] = t.value; if (t.dataset.p40ed === 'amt') sumPaint(); return; }
  if (t.dataset?.p40ln && TXE.f) { const L = TXE.f.lines[+t.dataset.i]; if (L) { L[t.dataset.p40ln] = t.value; sumPaint(); } }
}
function sumPaint() {
  const el = document.querySelector('#app .p40-sum'); if (!el || !TXE.f) return;
  const sum = TXE.f.lines.reduce((a, l) => a + (num(l.p) ?? 0), 0), ok = Math.abs(sum - (num(TXE.f.amt) ?? 0)) < 0.01;
  el.className = `p40-sum ${ok ? 'ok' : 'bad'}`; el.textContent = `Sum linjer ${kr(sum)} · ${ok ? 'stemmer' : 'stemmer ikke med beløpet'}`;
}
function onSubmit(e) {
  const f = e.target?.dataset?.p40form; if (!f) return;
  e.preventDefault(); e.stopPropagation();
  if (HM?.submit?.(f)) return;
  if (f === 'tfcode') tfVerify(); else if (f === 'tfpw') tfSetup(); else if (f === 'tfoff') tfDisable();
}
/** Sanntid: hjemlys, glimt:settings. */
export function onRt40(d) {
  const ty = String(d?.type ?? '');
  if (ty === 'hjemlys' || ty.startsWith('hjemlys:')) { HM?.onRt?.(d); return true; }
  if (ty === 'glimt:settings') { julTake(d.settings ?? d.data ?? d); draw(); return false; }
  return false;
}
export function afterDraw40() {
  const r = document.documentElement;
  // Bilder som ikke laster (Glimt-siden, kilder): skjules i stedet for et brukket bilde.
  for (const im of document.querySelectorAll('#app .p40-ng img:not([data-e])')) { im.dataset.e = '1'; const bad = () => { const f = im.closest('figure'); if (f) f.remove(); else im.replaceWith(document.createElement('i')); }; if (im.complete && !im.naturalWidth) bad(); else im.addEventListener('error', bad, { once: true }); }
  r.classList.toggle('p40-ov', !!(TF.open || (NG.open && m.screen === 'nyheter')));
  if (m.screen !== 'nyheter' && NG.open) { NG.open = false; NG.pick = false; }
  HM?.afterDraw?.();
  if (TF.open && TF.step === 2) { const c = document.getElementById('p40-tfc'); if (c && document.activeElement !== c && !c.dataset.f) { c.dataset.f = '1'; c.focus({ preventScroll: true }); } }
}
let booted = false;
export function boot40() {
  if (booted) return; booted = true;
  globalThis.P40 = { isMulti, gMulti, gLocal, afterLbl, julCard, dress, julOn, tfaGroup, addedLine, txTools, stdQ, searchAsk, glimtCard, hjemlysFam, hjemlysHome, onRt40, ngOpen, bibleOn: () => !!MOD.p37b?.bibleOn?.() };
  Promise.all([import('./mobile-p39.js'), import('./mobile-paper3.js'), import('./mobile-p37b.js')]).then(([a, b, c]) => { MOD.p39 = a; MOD.p3 = b; MOD.p37b = c; }).catch(() => {});
  document.addEventListener('input', onInput, true);
  document.addEventListener('submit', onSubmit, true);
  addEventListener('glimt-jul', () => { if (document.documentElement.dataset.ui === 'mobile') draw(); });
  addEventListener('storage', (ev) => { if (ev.key === 'glimt_jul' || ev.key === 'glimt_jul_p') { try { window.dispatchEvent(new Event('glimt-jul')); } catch {} } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.closest?.('[data-p40="bibel"]') && e.target === e.target.closest('[data-p40="bibel"]')) { e.preventDefault(); location.hash = '#/bibel'; }
    if (e.key === 'Escape') { if (TXE.id != null) { TXE.id = null; draw(); } else if (NG.pick) { NG.pick = false; draw(); } else if (HM?.HJ?.open) { HM.HJ.open = false; draw(); } }
  });
  kbTrack();
  hlApi('/glimt/settings').then(julTake).then(() => draw()).catch(() => {});
  // Bakgrunn → tilbake: oppdater Vel fremme.
  import('./mobile-p40h.js').then((x) => { HM = x; if (['fam', 'hl'].includes(m.screen)) draw(); }).catch((err) => console.warn('mobile-p40h', err));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) HM?.visible?.(); });
}
