// Prompt 35 (PWA35): mobilpunktene i prompt-35-pakken.
//  1. Glimt-familien: 13 figurer (felles modul /assets/js/glimt-figs.js fra WEB35, fasit glimt-figurer.js), vert = brukerens figur,
//     «Glimt» blir Glimt Natt mellom 21 og 06 (claude-code-glimt-figurer.md).
//  2. Glimt-brief med venner (Sky/Dråpe på vær, Ugle på kalender, Gris på prøveperioder), opplesning via POST /api/tts
//     (nettleserstemmen bare som reserve), ⚙-ark, nyheter med bilder (toppsak + 6) og prøveperiode-kortet
//     (claude-code-glimt-brief.md, fasit Glimt Brief.dc.html mode="page").
//  3. Innstillinger → GLIMT → «Glimt» (#/glimt): figurvelger, brytere, briefer gjennom dagen, stemmemotor, stemme, språk og tempo
//     (claude-code-innst-glimt.md, fasit Glimt Brief.dc.html mode="settings"). Samme data som ⚙ i briefen: GET/PUT /api/glimt/settings.
//  4. AI-søk på Hjem: været for et hvilket som helst sted (claude-code-ai-sok-vaer-sted.md). Serveren svarer i /api/assist;
//     uten den tolkes stedet her og /api/weather/place brukes. Trykk på svaret åpner Vær for stedet (midlertidig i bylista).
// Nøkler for stemmemotorene lagres på serveren (PUT /api/ai/keys/…, bare admin), aldri i nettleseren.
import { api, esc, hlApi } from './core.js';
import { m, draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { hlData } from './mobile-hl.js';
import * as KAL from './mobile-kal.js';
import * as P34 from './mobile-p34.js';
import * as P31 from './mobile-p31.js';
import { isAdmin } from './mobile-p29.js';
import * as P37 from './mobile-p37.js'; // prompt 37: Gjøremål-kortet i briefen
import * as P38 from './mobile-p38.js';
import * as P39 from './mobile-p39.js'; // prompt 39: Forslag fra Glimt
import * as P37B from './mobile-p37b.js'; // prompt 37: bibelvers i briefen

const pad = (n) => String(n).padStart(2, '0');
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const WD = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'], WD3 = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

/* =====================================================================
   1. Figurene
   ===================================================================== */
export const FIGS = [['glimt', 'Glimt'], ['halo', 'Halo'], ['boble', 'Boble'], ['antenne', 'Antenne'], ['bane', 'Bane'], ['pastell', 'Pastell'], ['natt', 'Natt'], ['sky', 'Sky'], ['drape', 'Dråpe'], ['ugle', 'Ugle'], ['stjerne', 'Stjerne'], ['spire', 'Spire'], ['gris', 'Gris']];
const IDS = FIGS.map(([k]) => k);
export const WHO = { gris: 'GRIS', glimt: 'GLIMT', natt: 'GLIMT', sky: 'SKY', drape: 'DRÅPE', ugle: 'UGLE', stjerne: 'STJERNE', spire: 'SPIRE', halo: 'GLIMT', boble: 'GLIMT', antenne: 'GLIMT', bane: 'GLIMT', pastell: 'GLIMT' };
const NC = { gris: '#f6b3c1', glimt: '#ffc7b8', natt: '#ffe7a8', sky: '#bcd7ef', drape: '#9fd0f2', ugle: '#e8c49a', stjerne: '#ffb38a', spire: '#9fd8a8', halo: '#ffc7b8', boble: '#c3b4ef', antenne: '#ffc7b8', bane: '#f2c14e', pastell: '#f4a6a0' };
// Felles figurmodul (WEB35). Mangler den (eldre server), brukes Glimt-ringen fra prompt 34 for alle figurene.
let GF = null;
import('/assets/js/glimt-figs.js').then((x) => { GF = typeof x.fig === 'function' ? x : false; if (GF && document.documentElement.dataset.ui === 'mobile') draw(); }).catch(() => { GF = false; });
/** fig(id, størrelse, humør) → HTML. humør: idle | glad | talk | sov. */
export function fig(id, S0 = 56, mood = 'idle', o = null) {
  // Prompt 40 (claude-code-glimt-jul.md): julemodus legges på av figurbiblioteket selv (julOn); mangler det i en eldre
  // glimt-figs.js, kler mobile-p40.js på figuren her. {noJul:true} = figurvelgeren.
  const h = GF ? GF.fig(IDS.includes(id) ? id : 'glimt', S0, mood, o ?? undefined) : P34.figure(S0, mood === 'talk' ? 'talk' : 'idle');
  return o?.noJul || typeof GF?.julOn === 'function' || typeof GF?.fig?.julOn === 'function' ? h : globalThis.P40?.dress?.(h, S0) ?? h;
}
const night = (d = new Date()) => { const h = d.getHours(); return h >= 21 || h < 6; };
const sleepy = (d = new Date()) => { const h = d.getHours(); return h >= 23 || h < 6; };
/** Verten: brukerens figur; «Glimt» blir Glimt Natt mellom 21 og 06. */
export const hostFor = (sel = cfg().char) => { const s = IDS.includes(sel) ? sel : 'glimt'; return s === 'glimt' && night() ? 'natt' : s; };

/* =====================================================================
   2. Innstillingene (felles for ⚙ i briefen og Innstillinger → Glimt)
   ===================================================================== */
const DEF = {
  char: 'glimt', friends: true, brief: true, briefGlimt: true, /* prompt 39: Glimt i briefen */ readAloud: false, guide: true, notify: true,
  briefs: { morning: { on: true, at: '06:45' }, day: { on: false, at: '12:00' }, evening: { on: true, at: '18:00' }, night: { on: false, at: '22:30' } },
  tts: { engine: 'openai', voice: 'nora', rate: 'normal', lang: 'no' }, engines: null, chars: null,
};
const merge = (a, b) => {
  const o = { ...a, ...(b ?? {}) };
  o.briefs = { ...a.briefs };
  for (const k of Object.keys(DEF.briefs)) o.briefs[k] = { ...(a.briefs?.[k] ?? DEF.briefs[k]), ...(b?.briefs?.[k] ?? {}) };
  o.tts = { ...a.tts, ...(b?.tts ?? {}) };
  return o;
};
export const GS = { c: null, miss: false, busy: false, t: 0, keys: {}, keyMsg: '', from: 'set' };
export function cfg() {
  if (!GS.c) { GS.c = merge(DEF, lsGet('glimt35_cfg', {})); const ch = (() => { try { return localStorage.getItem('glimt_char'); } catch { return null; } })(); if (ch && IDS.includes(ch)) GS.c.char = ch; }
  return GS.c;
}
function keep() {
  const { engines, chars, ...c } = cfg();
  lsSet('glimt35_cfg', c);
  try { localStorage.setItem('glimt_char', c.char); window.dispatchEvent(new Event('glimt-char')); } catch {}
}
/** GET /api/glimt/settings (eldre server: /api/brief/settings for varsel og guide). */
export async function cfgLoad(force = false) {
  if (GS.busy || (!force && GS.t && Date.now() - GS.t < 60e3)) return;
  GS.busy = true;
  try { const r = await hlApi('/glimt/settings'); GS.c = merge(cfg(), r); GS.miss = false; keep(); }
  catch (e) {
    if (e.status === 404 || e.status === 405) {
      GS.miss = true;
      try { const r = await hlApi('/brief/settings'); if (r) GS.c = merge(cfg(), { notify: r.notify ?? cfg().notify, guide: r.guide ?? cfg().guide }); } catch {}
    }
  }
  GS.t = Date.now(); GS.busy = false;
}
let putT = null, putBody = {};
/** Delvis oppdatering: lagres lokalt med en gang, og sendes til serveren (samlet etter 300 ms). */
export function cfgPut(patch) {
  GS.c = merge(cfg(), patch); keep(); draw();
  putBody = merge({ briefs: {}, tts: {} }, { ...putBody, ...patch, briefs: { ...(putBody.briefs ?? {}), ...(patch.briefs ?? {}) }, tts: { ...(putBody.tts ?? {}), ...(patch.tts ?? {}) } });
  clearTimeout(putT);
  putT = setTimeout(async () => {
    const body = putBody; putBody = {};
    if (!Object.keys(body.tts ?? {}).length) delete body.tts;
    for (const k of Object.keys(body.briefs ?? {})) if (!patch.briefs?.[k] && !Object.keys(body.briefs[k] ?? {}).length) delete body.briefs[k];
    if (!Object.keys(body.briefs ?? {}).length) delete body.briefs;
    if (!GS.miss) {
      try { const r = await hlApi('/glimt/settings', { method: 'PUT', json: body }); if (r && typeof r === 'object') { GS.c = merge(cfg(), r); keep(); draw(); } return; }
      catch (e) { if (e.status !== 404 && e.status !== 405) { flash(e.message, 'err'); return; } GS.miss = true; }
    }
    // Eldre server: bare varsel og guide finnes i /api/brief/settings. Resten ligger på enheten.
    if ('notify' in body || 'guide' in body) hlApi('/brief/settings', { method: 'PUT', json: { ...('notify' in body ? { notify: body.notify } : {}), ...('guide' in body ? { guide: body.guide } : {}) } }).catch(() => {});
  }, 300);
}

/* =====================================================================
   3. Stemmen (POST /api/tts, nettleserstemmen som reserve)
   ===================================================================== */
const VOICES = [['nora', 'Nora · rolig og varm', 'Kvinne · voksen, rolig', 1, 1], ['henrik', 'Henrik · lav og trygg', 'Mann · dyp, avslappet', 0.9, 0.92], ['lys', 'Lys · glad og lett', 'Kvinne · ung, smilende', 1.15, 1.05]];
const RATES = [['calm', 'Rolig', 0.85], ['normal', 'Normal', 1], ['fast', 'Rask', 1.15]];
// Vennene får egen klang på samme stemme (bare nettleserreserven; serveren bruker instruksjoner per figur).
const CHV = { glimt: [1, 1], natt: [0.92, 0.95], sky: [1.12, 1.02], drape: [1.25, 1.06], ugle: [0.8, 0.94], gris: [1.1, 1.04], stjerne: [1.15, 1.05], spire: [1.08, 1] };
const ENG = [
  ['openai', 'OpenAI · gpt-4o-mini-tts', 'Nesten menneskelig. Følger instruks om tone og følelse.', 'ANBEFALT', 'ok', 'OpenAI API-nøkkel', 'sk-…', 'https://platform.openai.com/api-keys'],
  ['elevenlabs', 'ElevenLabs · Multilingual v2', 'Mest naturlig og uttrykksfull. Kan klone en egen stemme.', 'BEST', 'acc', 'ElevenLabs API-nøkkel', 'xi-…', 'https://elevenlabs.io/app/settings/api-keys'],
  ['azure', 'Azure · nb-NO Neural (Pernille, Finn, Iselin)', 'Ekte norske stemmer med riktig tonelag.', 'NORSK', 'blue', 'Azure Speech-nøkkel', '••••', 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices'],
  ['browser', 'Nettleserens stemme', 'Robotaktig. Bare for testing uten nøkkel.', '', '', '', '', ''],
];
export const TT = { a: null, url: null, who: null, seq: 0, err: '', hint: false, pend: null, noApi: false, eng: '' };
export function stopTalk(redraw = true) {
  TT.seq++;
  try { window.speechSynthesis?.cancel(); } catch {}
  if (TT.a) { try { TT.a.pause(); } catch {} TT.a = null; }
  if (TT.url) { try { URL.revokeObjectURL(TT.url); } catch {} TT.url = null; }
  const was = TT.who; TT.who = null;
  if (was && redraw) draw();
}
const rateOf = (k) => RATES.find(([x]) => x === k)?.[2] ?? 1;
function sayBrowser(txt, ch, id) {
  const c = cfg();
  try {
    const SS = window.speechSynthesis; if (!SS || id !== TT.seq) return;
    SS.cancel();
    const u = new SpeechSynthesisUtterance(txt), V = VOICES.find(([k]) => k === c.tts.voice) ?? VOICES[0], cv = CHV[ch] ?? [1, 1];
    u.lang = c.tts.lang === 'en' ? 'en-GB' : 'nb-NO'; u.pitch = V[3] * cv[0]; u.rate = rateOf(c.tts.rate) * V[4] * cv[1];
    const all = SS.getVoices(), en = c.tts.lang === 'en';
    const vs = all.filter((v) => (en ? /^en-(GB|US)/i.test(v.lang) && /(Natural|Neural|Premium|Enhanced|Google|Samantha|Daniel|Serena|Aria|Jenny|Sonia|Libby)/i.test(v.name) : /^(nb|no|nn)/i.test(v.lang))).concat(en ? all.filter((v) => /^en/i.test(v.lang)) : []);
    if (vs.length) u.voice = vs[c.tts.voice === 'henrik' ? Math.min(1, vs.length - 1) : 0];
    u.onstart = () => { if (id === TT.seq) { TT.who = ch; TT.eng = 'browser'; draw(); } };
    u.onend = u.onerror = () => { if (id === TT.seq) { TT.who = null; draw(); } };
    SS.speak(u);
  } catch {}
}
/** Leser opp teksten med figurens stemme. force = også når «Les opp» er av (▶ Hør, høyttaler-knappen). */
export async function say(text, ch = 'glimt', force = false) {
  const c = cfg();
  if (!force && !c.readAloud) return;
  stopTalk(false);
  const id = TT.seq, clean = String(text ?? '').replace(/[«»*]/g, '').trim();
  if (!clean) return;
  if (c.tts.engine === 'browser' || TT.noApi) { sayBrowser(clean, ch, id); return; }
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean, character: ch, voice: c.tts.voice, rate: c.tts.rate, lang: c.tts.lang }) });
    if (id !== TT.seq) return;
    const ct = res.headers.get('content-type') || '';
    if (res.ok && /audio|mpeg|ogg|octet/.test(ct)) {
      const b = await res.blob(); if (id !== TT.seq) return;
      const url = URL.createObjectURL(b), a = new Audio(url);
      TT.a = a; TT.url = url; TT.eng = res.headers.get('X-TTS-Engine') || c.tts.engine;
      a.onplay = () => { if (id === TT.seq) { TT.who = ch; TT.err = ''; TT.hint = false; draw(); } };
      a.onended = a.onerror = () => { if (id === TT.seq) { TT.who = null; draw(); } };
      try { await a.play(); } catch { if (id === TT.seq) { TT.hint = true; TT.pend = [clean, ch]; draw(); } }
      return;
    }
    if (res.status === 404 || res.status === 405) TT.noApi = true;
    const j = /json/.test(ct) ? await res.json().catch(() => null) : null;
    TT.err = res.status === 503 || j?.fallback ? `${j?.error || 'Ingen stemmemotor er klar'}. Bruker nettleserstemmen.` : TT.noApi ? '' : (j?.error || '');
  } catch { /* uten nett: nettleserstemmen */ }
  if (id === TT.seq) sayBrowser(clean, ch, id);
}
let visBound = false;
function bindVis() { if (visBound) return; visBound = true; document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalk(); }); }

/* =====================================================================
   4. Briefen: data
   ===================================================================== */
export const B5 = { d: null, t: 0, busy: false, err: '', step: 0, from: 'hl', said: -1, popCh: null, lastCh: null, sheet: false, tour: null };
const TGT = { weather: 'vaer', vaer: 'vaer', wx: 'vaer', calendar: 'kal', kal: 'kal', events: 'kal', news: 'nyh', nyh: 'nyh', nyheter: 'nyh', trials: 'abo', trial: 'abo', abo: 'abo', subs: 'abo', subscriptions: 'abo' };
const imgUrl = (u) => { const s = String(u ?? '').trim(); if (!s) return ''; if (/^(\/|data:|blob:)/.test(s)) return s; return /^https?:\/\//.test(s) ? `/api/img?u=${encodeURIComponent(s)}` : ''; };
const kroner = (p) => String(p ?? '').replace(/\s*kr\s*\/\s*mnd\.?/i, ' kroner i måneden').replace(/\s*kr\b/i, ' kroner');
function trialNorm(x) {
  const end = String(x.endsAt ?? x.ends_at ?? x.end ?? '').slice(0, 10);
  const d = end ? new Date(`${end}T00:00`) : null, t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const dl = x.daysLeft ?? (d ? Math.round((d - t0) / 864e5) : 99);
  const st = x.startedAt ?? x.created_at ?? x.createdAt ?? x.start ?? null, total = st && d ? Math.max(1, Math.round((d - new Date(`${String(st).slice(0, 10)}T00:00`)) / 864e5)) : 14;
  const prog = x.progress != null ? (x.progress <= 1 ? x.progress * 100 : x.progress) : ((total - dl) / total) * 100;
  const pr = x.priceLabel ?? (x.price_after ?? x.priceAfter ?? x.price) ?? null;
  return { id: x.id, service: x.service ?? x.name ?? 'Prøve', logo: x.logo ?? null, end, daysLeft: dl, endsLabel: x.endsLabel ?? (d ? `${WD3[d.getDay()]} ${d.getDate()}.` : ''), endsLong: d ? `${WD[d.getDay()]} ${d.getDate()}.` : '',
    priceLabel: pr == null || pr === '' ? '' : typeof pr === 'number' ? `${Math.round(pr)} kr/mnd` : String(pr), progress: Math.min(100, Math.max(6, Math.round(prog))), cancelUrl: x.cancelUrl ?? x.cancel_url ?? null, local: !!x.local };
}
function newsNorm(x) {
  return { source: x.source ?? x.feed ?? '', title: x.title ?? '', url: x.url ?? x.link ?? '#/nyheter', time: x.timeLabel ?? P34.hm(x.time ?? x.published ?? x.publishedAt), image: imgUrl(x.image ?? x.img ?? x.thumb ?? x.thumbnail ?? x.enclosure), lead: x.lead ?? x.summary ?? x.description ?? '' };
}
function localNews() {
  const N = hlData()?.news ?? B5.rss ?? [];
  return (Array.isArray(N) ? N : N.items ?? []).slice(0, 7).map(newsNorm);
}
function wxNorm(W, lw) {
  if (!W) return lw;
  const nowT = typeof W.now === 'object' && W.now ? W.now.temp : (W.now ?? W.temp);
  const cond = W.cond ?? (typeof W.now === 'object' ? W.now.cond : null) ?? W.text;
  const vs = W.vsYesterday;
  const r12 = Array.isArray(W.rain12h) && W.rain12h.length ? W.rain12h.map((v) => +(typeof v === 'object' ? v.mm ?? v.precip ?? 0 : v) || 0) : lw.rain12h;
  const fr = r12.findIndex((v) => v >= 0.2), h = new Date().getHours();
  const rainSoon = W.rainFrom ? `regn fra ca. ${String(W.rainFrom).slice(0, 2)}` : !r12.length ? lw.rainSoon : fr < 0 ? 'oppholdsvær de neste 12 timene' : fr === 0 ? 'regn nå' : `regn fra ca. ${pad((h + fr) % 24)}`;
  const code = W.now?.icon ?? W.icon ?? W.code ?? W.now?.code ?? cond;
  return { ...lw, now: nowT != null && Number.isFinite(+nowT) ? Math.round(+nowT) : lw.now, hi: W.hi != null ? Math.round(W.hi) : lw.hi, lo: W.lo != null ? Math.round(W.lo) : lw.lo,
    cond: cond ? String(cond).toLowerCase() : lw.cond, code: code != null ? P34.wk(String(code).replace(/^partly$/, 'delvis').replace(/^clear$/, 'klar').replace(/^cloudy$/, 'sky')) : lw.code, rain12h: r12, rainSoon,
    vsYesterday: typeof vs === 'string' ? vs : vs && typeof vs === 'object' ? vs.text ?? null : typeof vs === 'number' ? (vs === 0 ? 'Like varmt som i går' : `${Math.abs(Math.round(vs))} grader ${vs < 0 ? 'kaldere' : 'varmere'} enn i går`) : lw.vsYesterday,
    sunset: W.sunset ? P34.hm(W.sunset) || String(W.sunset).slice(0, 5) : lw.sunset, place: W.place?.name ?? W.place ?? lw.place };
}
function norm(r) {
  const kind = r?.kind && P34.KICK[r.kind] ? r.kind : P34.kindNow(), lw = P34.localWx(), wx = wxNorm(r?.weather, lw);
  const ev = Array.isArray(r?.events) && r.events.length ? r.events.slice(0, 3).map((e) => ({ title: e.title ?? e.t, loc: e.loc ?? e.place ?? e.location ?? '', color: e.color ?? '#b23a2a', start: e.allDay || e.time === 'Hele dagen' ? 'Hele dagen' : e.time || P34.evStart(e), day: String(e.day ?? (e.tomorrow ? 'i morgen' : 'i dag')).toLowerCase(), k: e.date ?? e.k ?? '', min: e.inMin ?? e.min ?? null, tomorrow: !!e.tomorrow || /morgen/i.test(e.day ?? '') }))
    : P34.localEvents();
  if (r?.next?.inMin != null && ev[0] && !ev[0].tomorrow) ev[0].min = r.next.inMin;
  const news = (Array.isArray(r?.news) && r.news.length ? r.news.map(newsNorm) : localNews()).slice(0, 7);
  const trials = (Array.isArray(r?.trials) ? r.trials : (P31.G.trials ?? [])).map(trialNorm).filter((t) => t.daysLeft >= 0 && t.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3);
  const guide = Array.isArray(r?.guide) && r.guide.length ? r.guide : null;
  return { kind, title: r?.title ?? P34.KICK[kind], summary: r?.summary || localSummary(kind, wx, ev), wx, ev, news, trials, guide, host: r?.host && IDS.includes(r.host) ? r.host : null,
    at: r?.generatedAt ? P34.hm(r.generatedAt) : P34.hm(new Date().toISOString()), foot: r?.footer ?? null, src: r ? 'glimt' : 'lokal',
    x: r ? { packages: r.packages ?? null, family: r.family ?? null, school: r.school ?? null, birthdays: r.birthdays ?? null, aurora: r.aurora ?? null } : null };
}
function localSummary(kind, wx, ev) {
  const nm = P34.firstName(), hi = kind === 'morning' ? `God morgen${nm ? `, ${nm}` : ''}. ` : kind === 'evening' ? `God kveld${nm ? `, ${nm}` : ''}. ` : '';
  const nx = ev[0], w = wx.now != null ? `${P34.capF(wx.cond || 'været')} og ${wx.now}° i ${wx.place || 'Oslo'}${wx.rainSoon ? `, ${wx.rainSoon}` : ''}. ` : '';
  const e = nx ? (nx.tomorrow ? `I morgen starter du med ${nx.title} kl. ${P34.evStart(nx)}.` : `Neste er ${nx.title} kl. ${P34.evStart(nx)}.`) : 'Kalenderen er fri.';
  return `${hi}${w}${e}${/regn/.test(wx.rainSoon || '') && !/opphold/.test(wx.rainSoon) ? ' Ta med paraply.' : ''}`;
}
export async function briefLoad(force = false) {
  if (B5.busy || (!force && B5.d && Date.now() - B5.t < 5 * 60e3 && B5.d.kind === P34.kindNow())) return;
  B5.busy = true;
  const side = [P34.wxFull().catch(() => {}), cfgLoad().catch(() => {})];
  let r = null;
  try { r = await hlApi(`/brief?kind=${P34.kindNow()}`); B5.err = ''; } catch (e) { B5.err = e.status === 404 ? '' : e.message; }
  await Promise.all(side);
  if (!Array.isArray(r?.trials)) await P31.trialsLoad().catch(() => {});
  if (!(Array.isArray(r?.events) && r.events.length) && !KAL.K.ev && !KAL.K.busy) await KAL.kalLoad().catch(() => {});
  if (!(Array.isArray(r?.news) && r.news.length) && !hlData()?.news && !B5.rss) B5.rss = await hlApi('/rss?limit=7').then((x) => x?.items ?? []).catch(() => []);
  B5.d = norm(r); B5.t = Date.now(); B5.busy = false;
}
const brief = () => B5.d ?? norm(null);
const wetOf = (w) => /regn|snø|sludd|byge|rain|snow/.test(w.cond || '') || (/regn/.test(w.rainSoon || '') && !/opphold/.test(w.rainSoon || ''));

/* ---------- Guide-runden: [mål, tekst, knapp, figur] ---------- */
function guideOf(b) {
  const c = cfg(), host = hostFor(c.char), en = c.tts.lang === 'en';
  if (b.guide) {
    const L = b.guide.map((g, i, a) => [TGT[g.target] ?? (g.target || null), (en ? g.textEn : null) || g.text || '', (en ? g.actionEn : null) || g.action || (i === 0 ? (en ? 'Show me' : 'Vis meg') : i === a.length - 1 ? (en ? 'Thanks, Glimt' : 'Takk, Glimt') : (en ? 'Next' : 'Neste')), c.friends && IDS.includes(g.char) && g.char !== b.host ? g.char : host]);
    return L.filter((x) => x[1]);
  }
  const w = b.wx, nx = b.ev[0], T1 = b.trials[0], wet = wetOf(w), wch = wet ? 'drape' : 'sky', wn = wet ? 'Dråpe' : 'Sky';
  const tm = nx ? P34.evStart(nx) : '', dd = (t) => (t.daysLeft === 0 ? 'i dag' : t.daysLeft === 1 ? 'i morgen' : `om ${t.daysLeft} dager`);
  const EN = { klart: 'clear', lettskyet: 'partly cloudy', skyet: 'cloudy', regn: 'rain', snø: 'snow' }, wEn = EN[w.cond] ?? w.cond ?? 'the weather';
  const rEn = /opphold/.test(w.rainSoon || '') ? 'dry for the next 12 hours' : w.rainSoon === 'regn nå' ? 'raining now' : w.rainSoon ? `rain from about ${String(w.rainSoon).replace(/\D+/g, '')}:00` : '';
  const G0 = [
    [null, 'Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din? Vennene mine hjelper til.', 'Vis meg', host, "Hi! I'm Glimt. Shall I show you your day? My friends will help."],
    ['vaer', `Hei, det er ${wn}! ${P34.capF(w.cond || 'været')}${w.now != null ? `, ${w.now}° nå` : ''}${w.rainSoon ? ` og ${w.rainSoon}` : ''}.${wet ? ' Jeg drypper litt, så ta med paraply!' : ' Søylene viser nedbøren time for time.'}`, `Takk, ${wn}`, wch,
      `Hi, it's ${wet ? 'Drop' : 'Sky'}! ${P34.capF(wEn)}${w.now != null ? `, ${w.now}° right now` : ''}${rEn ? `, and ${rEn}` : ''}.${wet ? " I'm dripping a bit, so bring an umbrella!" : ' The bars show rain hour by hour.'}`],
    ...(!wet && w.sunset ? [['vaer', `Sky her igjen: sola går ned ${w.sunset}. Nå tar Glimt over!`, 'Neste', 'sky', `Sky again: the sun sets at ${w.sunset}. Back to Glimt!`]] : []),
    ['kal', `Uhu, Ugle her med kalenderen. ${nx ? `${nx.title} ${nx.tomorrow ? 'i morgen' : 'i dag'} kl. ${tm}. Trykk på en avtale for å åpne Kalender.` : 'Kalenderen din er helt fri.'}`, 'Neste', 'ugle',
      `Hoo, Owl here with your calendar. ${nx ? `${nx.title} ${nx.tomorrow ? 'tomorrow' : 'today'} at ${tm}. Tap an event to open Calendar.` : 'Your calendar is completely free.'}`],
    ...(T1 ? [['abo', `Nøff! Gris her. Prøveperioden på ${T1.service} slutter ${dd(T1)}. Husk å avslutte den før ${T1.endsLabel}${T1.priceLabel ? `, ellers koster den ${kroner(T1.priceLabel)}` : ''}.`, 'Takk, Gris', 'gris',
      `Oink! Piggy here. Your ${T1.service} trial ends ${T1.daysLeft === 0 ? 'today' : T1.daysLeft === 1 ? 'tomorrow' : `in ${T1.daysLeft} days`}. Remember to cancel it${T1.priceLabel ? `, or it will cost ${kroner(T1.priceLabel).replace('kroner i måneden', 'kroner a month')}` : ''}.`]] : []),
    ['nyh', b.news.length ? 'Glimt igjen! Her er de viktigste nyhetene. Trykk for å lese hele.' : 'Glimt igjen! Ingen nyheter ennå. Legg til kilder i nyhetsleseren.', 'Neste', host, b.news.length ? 'Glimt again! Here are the top stories. Tap to read more.' : 'Glimt again! No news yet.'],
    [null, 'Det var alt for nå. Trykk på meg når du vil ha en ny runde.', 'Takk, Glimt', host, "That's all for now. Tap me whenever you want another round."],
  ];
  // Uten venner: bare verten snakker, og replikkene skrives om uten vennene.
  const G = c.friends ? G0 : G0.map((x) => [x[0], x[1].replace(/^Hei, det er (Sky|Dråpe)! /, 'Været: ').replace(/^Sky her igjen: /, '').replace(/ Nå tar Glimt over!/, '').replace(/^Uhu, Ugle her med kalenderen\. /, 'I kalenderen: ').replace(/^Nøff! Gris her\. /, '').replace(/^Glimt igjen! /, ''),
    x[2].replace(/^Takk, (Sky|Dråpe|Gris)$/, 'Neste'), host, x[4].replace(/^Hi, it's (Sky|Drop)! /, 'The weather: ').replace(/^Sky again: /, '').replace(/ Back to Glimt!/, '').replace(/^Hoo, Owl here with your calendar\. /, '').replace(/^Oink! Piggy here\. /, '').replace(/^Glimt again! /, '')]);
  return G.map((x) => [x[0], en ? x[4] : x[1], en ? ({ 'Vis meg': 'Show me', 'Neste': 'Next', 'Takk, Glimt': 'Thanks, Glimt', 'Takk, Sky': 'Thanks, Sky', 'Takk, Dråpe': 'Thanks, Drop', 'Takk, Gris': 'Thanks, Piggy' }[x[2]] ?? x[2]) : x[2], x[3]]);
}

/* =====================================================================
   5. Briefen: visning
   ===================================================================== */
const sw = (on) => `<span class="p35-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const SPK = 'M4 9h4l5-4v14l-5-4H4z', SPK_ON = 'M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11', SPK_OFF = 'M16 9l5 6M21 9l-5 6';
function speakPill() {
  if (TT.who) {
    const nm = (WHO[TT.who] ?? 'GLIMT').charAt(0) + (WHO[TT.who] ?? 'GLIMT').slice(1).toLowerCase(), V = VOICES.find(([k]) => k === cfg().tts.voice) ?? VOICES[0];
    return `<div class="p35-spk" role="status"><span class="p35-bars" aria-hidden="true">${[0.42, 0.3, 0.5, 0.36].map((d) => `<i style="animation-duration:${d}s"></i>`).join('')}</span>${esc(nm)} snakker · ${esc(V[1].split(' · ')[0])}<button type="button" data-p35="stop">Stopp</button></div>`;
  }
  if (TT.hint) return '<button type="button" class="p35-spk hint" data-p35="hear">🔊 Trykk for å høre Glimt</button>';
  return '';
}
function trialsCard(b) {
  if (!b.trials.length) return '';
  const T1 = b.trials[0], col = (d) => (d <= 2 ? 'var(--pp-lab)' : d <= 7 ? '#a8661a' : 'var(--pp-ink)');
  const logo = (t) => (t.logo ? `<span class="p35-trl" style="background-image:url('${esc(imgUrl(t.logo) || t.logo)}')"></span>` : `<span class="p35-trl txt">${esc(t.service.slice(0, 1).toUpperCase())}</span>`);
  return `<div class="p34-bcard p35-tr${B5.tgt === 'abo' ? ' p34-on' : ''}" data-gb="abo"><span class="p34-bh"><b>Abonnementer</b><span>${T1.daysLeft <= 2 ? 'AVSLUTT SNART' : 'PRØVEPERIODER'}</span></span>
    ${b.trials.map((t) => `<div class="p35-trr">${logo(t)}<span class="p35-trt"><b>${esc(t.service)}</b><span>Prøve · avslutt før ${esc(t.endsLabel)}${t.priceLabel ? ` · deretter ${esc(t.priceLabel)}` : ''}</span><span class="p35-trp"><i style="width:${t.progress}%;background:${col(t.daysLeft)}"></i></span></span>
      <span class="p35-trd"><b style="color:${col(t.daysLeft)}">${t.daysLeft}</b><span>${t.daysLeft === 1 ? 'dag igjen' : 'dager igjen'}</span></span></div>`).join('')}
    <div class="p35-trb"><button type="button" class="ink" data-p35="trdone" data-id="${esc(T1.id ?? '')}">✓ Jeg har avsluttet ${esc(T1.service)}</button>${T1.cancelUrl ? `<a class="p35-trx" href="${esc(T1.cancelUrl)}" target="_blank" rel="noopener">Avslutt nå ↗</a>` : ''}<a class="p35-trx" href="#/sub">Åpne Abonnement ›</a></div></div>`;
}
function newsCard(b) {
  const [top, ...rest] = b.news;
  if (!top) return `<div class="p34-bcard${B5.tgt === 'nyh' ? ' p34-on' : ''}" data-gb="nyh"><span class="p34-bh"><b>Nyheter</b></span><a class="p34-none" href="#/nyheter">Ingen nyheter ennå. Åpne nyhetsleseren ›</a></div>`;
  const bg = (u) => (u ? ` style="background-image:url('${esc(u)}')"` : '');
  return `<div class="p34-bcard p35-nws${B5.tgt === 'nyh' ? ' p34-on' : ''}" data-gb="nyh"><span class="p34-bh"><b>Nyheter</b><button type="button" class="p40-ngl" data-p40="ngl">✦ Glimt-sammendrag ›</button></span>
    <a class="p35-top" href="${esc(top.url)}" target="_blank" rel="noopener"><span class="p35-img${top.image ? '' : ' none'}"${bg(top.image)}></span><span class="p35-meta"><span>${esc(String(top.source).toUpperCase())}</span><span>${esc(top.time)}</span></span><b>${esc(top.title)}</b>${top.lead ? `<span class="p35-lead">${esc(top.lead)}</span>` : ''}</a>
    ${rest.slice(0, 6).map((n) => `<a class="p35-nw" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="p35-th${n.image ? '' : ' none'}"${bg(n.image)}></span><span class="p35-nwx"><span class="p35-meta"><span>${esc(String(n.source).toUpperCase())}</span><span>${esc(n.time)}</span></span><span class="p35-nwt">${esc(n.title)}</span></span></a>`).join('')}</div>`;
}
export function briefView() {
  bindVis();
  const c = cfg(), b = brief(), w = b.wx, G = guideOf(b), st = Math.max(0, Math.min(B5.step - 1, G.length - 1)), cur = G[st], bub = B5.step > 0 && B5.step < 99;
  B5.tgt = bub ? cur[0] : null;
  const host = hostFor(c.char), ch = bub ? cur[3] : host;
  const pop = ch !== B5.lastCh; B5.lastCh = ch;
  const mx = Math.max(0.6, ...w.rain12h), nx = b.ev[0];
  const kalNext = nx ? (nx.min != null && !nx.tomorrow ? (nx.min <= 0 ? 'PÅGÅR NÅ' : `NESTE OM ${nx.min < 60 ? `${nx.min} MIN` : `${Math.round(nx.min / 60)} T`}`) : `NESTE ${nx.tomorrow ? 'I MORGEN ' : ''}${P34.evStart(nx)}`) : 'FRI';
  const ring = (k) => (B5.tgt === k ? ' p34-on' : '');
  const notes = [w.vsYesterday ? ['Sammenlignet med i går', w.vsYesterday] : null, w.sunset ? ['Solnedgang', `Sola går ned ${w.sunset}`] : null].filter(Boolean);
  const srcs = [...new Set(b.news.map((n) => n.source).filter(Boolean))].slice(0, 4).join(', ') || 'Nyhetsleser';
  return `<div class="p34-br p35-br">
    <div class="p34-brt p38-brt"><span class="p38-brl"><b>${esc(b.title)}</b><button type="button" class="p34-done" data-p34="brclose" data-p34back>Ferdig</button></span><span>${esc(b.summary)}</span></div>
    ${speakPill() /* Prompt 38: lyd (🔇) og ⚙ er fjernet fra toppen – de ligger i Innstillinger → Glimt. Tittel og Ferdig på samme linje. */}
    ${P37B.bibleBrief('top')}
    <div class="p34-wx p37-wxb${ring('vaer')}" data-gb="vaer" data-p35="brwx" role="button" tabindex="0" aria-label="Åpne Vær">
      <div class="p34-wxh"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${w.code === 'sol' ? '#ffd27a' : w.code === 'regn' ? '#9cc8ff' : '#e6eef7'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P34.WXP[w.code] ?? P34.WXP.sky}"/></svg>
        <span class="m-grow"><b>${w.now != null ? `${w.now}°` : '–'}</b><span>${esc(w.place || 'Oslo')} · ${esc(w.cond || '')}</span></span><span class="p34-hilo">${w.hi != null ? `↑${w.hi}° ↓${w.lo}°` : ''}</span></div>
      ${w.rain12h.length ? `<div class="p34-rain">${w.rain12h.map((v) => `<span title="${String(v.toFixed(1)).replace('.', ',')} mm" style="height:${Math.max(6, (v / mx) * 100)}%;opacity:${v >= 0.2 ? 0.9 : 0.3}"></span>`).join('')}</div>
      <div class="p34-rl"><span>nå</span><span>nedbør neste 12 t</span><span>+12 t</span></div>` : ''}
      ${notes.length ? `<div class="p34-notes">${notes.map(([k, v]) => `<span><small>${esc(k)}</small><b>${esc(v)}</b></span>`).join('')}</div>` : ''}</div>
    <div class="p34-bcard${ring('kal')}" data-gb="kal"><span class="p34-bh"><b>Kalender</b><span>${esc(kalNext)}</span></span>
      ${b.ev.length ? b.ev.map((e) => `<button type="button" class="p34-ev" data-p34="brcal" data-k="${esc(e.k ?? '')}"><span class="p34-evt"><span>${esc(P34.evStart(e) ?? '')}</span><span>${esc(e.day)}</span></span><i style="background:${esc(e.color)}"></i><span class="p34-evx"><b>${esc(e.title)}</b><span>${esc(e.loc || '')}</span></span></button>`).join('')
        : '<span class="p34-none">Ingen avtaler i dag eller i morgen.</span>'}</div>
    ${P37.briefTodos(B5.d?.todos)}
    ${trialsCard(b)}
    ${P38.briefCards(b.x) /* Prompt 38: Pakker, Familie, Skole og jobb, Bursdager, Nordlys i natt */}
    ${newsCard(b)}
    ${P37B.bibleBrief('bottom')}
    <span class="p34-foot">${esc(b.foot || `Laget av Glimt ${b.at} · Vær: MET / Open-Meteo · Nyheter: ${srcs}`)}</span>
    ${B5.err ? `<span class="p34-foot err">${esc(B5.err)}</span>` : ''}${TT.err ? `<span class="p34-foot err">${esc(TT.err)}</span>` : ''}
  </div>
  ${figOn() ? `<div class="p34-guide p35-guide">${bub ? `<div class="p34-gb" role="status" aria-live="polite"><span class="p35-who" style="color:${NC[ch] ?? '#ffc7b8'}">${esc(WHO[ch] ?? 'GLIMT')}</span><span>${esc(cur[1])}</span><span class="p34-gbb">${st > 0 && st < G.length - 1 ? `<button type="button" data-p35="gskip">${c.tts.lang === 'en' ? 'Skip' : 'Hopp over'}</button>` : ''}<button type="button" class="ink" data-p35="gnext">${esc(cur[2])}</button></span></div>` : ''}
    <button type="button" class="p34-gf p35-gf" data-p35="gtap" aria-label="${esc(FIGS.find(([k]) => k === ch)?.[1] ?? 'Glimt')} – trykk for en runde"><span class="${pop && !reduce() ? 'p35-pop' : ''}">${fig(ch, 82, bub ? 'talk' : sleepy() ? 'sov' : 'idle')}</span></button></div>` : '' /* prompt 39: Glimt i briefen av */}
  ${B5.sheet ? `<div class="p35-shb" data-p35="cfgclose"></div><div class="p35-sh" role="dialog" aria-modal="true" aria-label="Glimt-brief"><span class="p35-grab" aria-hidden="true"></span><div class="p35-shh"><b>Glimt-brief</b><button type="button" class="p34-done" data-p35="cfgclose">Ferdig</button></div>${cfgBody(true)}</div>` : ''}`;
}
/** Hjem-kortet (widget h12): blått kort med oppsummering, chips og vertsfiguren. Skjules når Glimt-brief er av. */
/** Prompt 39 (claude-code-brief-glimt-av.md): «Glimt i briefen» av → ingen figur, bobler eller guide-runde. */
export const figOn = () => cfg().briefGlimt !== false;
export function briefCard() {
  if (cfg().brief === false) return '';
  if (!B5.d && !B5.busy) briefLoad().then(draw).catch(() => {});
  const b = brief(), nx = b.ev[0];
  const chips = [b.wx.now != null ? `${b.wx.now}° ${b.wx.cond || ''}`.trim() : null, nx ? `${nx.title} ${P34.evStart(nx)}` : 'Fri', b.trials[0] ? `${b.trials[0].service} · ${b.trials[0].daysLeft} d` : null, b.news.length ? `${b.news.length} nyheter` : null].filter(Boolean).slice(0, 3);
  return `<a class="p34-bc" href="#/brief" aria-label="Åpne ${esc(b.title)}"><span class="p34-bct"><span class="p34-bck">${esc(b.title.toUpperCase())} · GLIMT</span><span class="p34-bcs">${esc(b.summary)}</span>
    <span class="p34-chips">${chips.map((x) => `<span>${esc(x)}</span>`).join('')}</span></span>${figOn() ? `<span class="p35-bcf">${fig(hostFor(), 56, 'idle')}</span>` : ''}</a>`;
}
export function briefEnter(prev) {
  // Prompt 37: tilbake fra Vær (åpnet fra Vær-kortet) → samme brief, ingen ny guide-runde.
  if (prev === 'vaer' && B5.keep) { B5.keep = false; return; }
  if (prev && prev !== 'brief') B5.from = prev;
  B5.step = 0; B5.said = -1; B5.sheet = false; B5.lastCh = null;
  clearTimeout(B5.tour);
  // «Vis meg rundt automatisk»: guide-runden starter når briefen åpnes.
  if (cfg().guide !== false && figOn()) B5.tour = setTimeout(() => { if (m.screen === 'brief' && B5.step === 0 && !B5.sheet) gStep(1); }, 900);
}
export function briefLeave() { clearTimeout(B5.tour); stopTalk(false); B5.step = 0; B5.sheet = false; }
function scrollToGb(k) {
  const el = document.querySelector(`#app [data-gb="${k}"]`); if (!el) return;
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: Math.max(0, scrollY + r.top - 90), behavior: reduce() ? 'auto' : 'smooth' });
}
function gStep(n) {
  const G = guideOf(brief());
  B5.step = n; haptic('tick');
  const bub = n > 0 && n < 99, cur = bub ? G[Math.min(n - 1, G.length - 1)] : null;
  draw();
  if (cur?.[0]) setTimeout(() => scrollToGb(cur[0]), 60); else if (!bub || n === G.length) setTimeout(() => window.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' }), 60);
  if (bub && B5.said !== n) { B5.said = n; setTimeout(() => { if (m.screen === 'brief' && B5.step === n) say(cur[1], cur[3]); }, 80); }
  if (!bub) stopTalk();
}

/* =====================================================================
   6. Innstillinger → Glimt (og ⚙-arket i briefen)
   ===================================================================== */
const BRIEFS = [['morning', 'Morgenbrief', 'Vær, dagen og første avtale'], ['day', 'Dagsbrief', 'Resten av dagen og nyheter'], ['evening', 'Kveldsbrief', 'I morgen, vær og det du ikke rakk'], ['night', 'Nattbrief', 'Kort oppsummering før du legger deg']];
const MAIN = [['brief', 'Glimt-brief', 'Lag briefer gjennom dagen'], ['briefGlimt', 'Glimt i briefen', 'Vis Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets'], ['readAloud', 'Les opp', 'Glimt og vennene leser briefen høyt'], ['guide', 'Vis meg rundt automatisk', 'Starter guide-runden når briefen åpnes'], ['friends', 'Venner av Glimt', 'Sky, Dråpe, Ugle og Gris tar over når temaet passer'], ['notify', 'Varsel når briefen er klar', 'Push til mobilen på klokkeslettet']];
function engState(id) {
  const E = (cfg().engines ?? []).find((x) => x.id === id || (id === 'elevenlabs' && x.id === 'eleven'));
  return E ?? null;
}
function cfgBody(sheet = false) {
  const c = cfg(), adm = isAdmin(), E = ENG.find(([k]) => k === c.tts.engine) ?? ENG[0], es = engState(E[0]);
  const keyRow = E[5] ? (adm ? `<label class="p35-key"><span><span>${esc(E[5])}${es?.keySet ? ` · lagret${es.tail ? ` (…${esc(es.tail)})` : ''}` : ''}</span><a href="${esc(E[7])}" target="_blank" rel="noopener">Hent nøkkel ↗</a></span>
      <input type="password" data-p35in="key" data-k="${esc(E[0])}" value="${esc(GS.keys[E[0]] ?? '')}" placeholder="${es?.keySet ? 'Skriv for å bytte nøkkel' : esc(E[6])}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(E[5])}"></label>
      ${E[0] === 'azure' ? `<label class="p35-key"><span><span>Region</span></span><input data-p35in="region" value="${esc(GS.keys.region ?? '')}" placeholder="norwayeast" autocomplete="off" autocapitalize="off" aria-label="Azure-region"></label>` : ''}
      <button type="button" class="p35-save" data-p35="keysave" data-k="${esc(E[0])}">Lagre nøkkel på serveren</button>`
    : `<span class="p35-note">${es ? (es.ready ? '✓ Klar · nøkkelen er satt opp på serveren' : 'Mangler nøkkel · settes av administrator') : 'Nøkkelen settes av administrator (AI-kontroll → API og nøkler)'}</span>`) : '';
  const seg = (L, cur, k) => `<div class="p35-seg">${L.map(([v, n]) => `<button type="button" data-p35="${k}" data-v="${v}" aria-pressed="${cur === v}">${esc(n)}</button>`).join('')}</div>`;
  return `<div class="p35-list">${MAIN.map(([k, n, s]) => `<button type="button" class="p35-row${k === 'friends' && c.briefGlimt === false ? ' p39-dim' : ''}" data-p35="tog" data-k="${k}" role="switch" aria-checked="${c[k] !== false}"><span class="p35-rt"><b>${esc(n)}</b><span>${esc(s)}</span></span>${sw(c[k] !== false)}</button>`).join('')}</div>
    <span class="p35-lab" data-hl="gl-brief">BRIEFER GJENNOM DAGEN</span>
    <div class="p35-list${c.brief === false ? ' dim' : ''}">${BRIEFS.map(([k, n, s]) => { const B = c.briefs[k] ?? DEF.briefs[k]; return `<div class="p35-row"><button type="button" class="p35-rt" data-p35="btog" data-k="${k}"><b>${esc(n)}</b><span>${esc(s)}</span></button><input type="time" data-p35in="bt" data-k="${k}" value="${esc(B.at)}" aria-label="Klokkeslett for ${esc(n)}"><button type="button" class="p35-swb" data-p35="btog" data-k="${k}" role="switch" aria-checked="${!!B.on}" aria-label="${esc(n)}">${sw(!!B.on)}</button></div>`; }).join('')}</div>
    <span class="p35-lab">STEMMEMOTOR</span>
    <div class="p35-opts">${ENG.map(([k, n, s, tag, tc]) => { const st = engState(k); return `<button type="button" class="p35-opt" data-p35="eng" data-v="${k}" aria-pressed="${c.tts.engine === k}"><span class="p35-rt"><span class="p35-on"><b>${esc(n)}</b>${tag ? `<span class="p35-tag ${tc}">${tag}</span>` : ''}</span><span>${esc(s)}${st && k !== 'browser' ? ` · ${st.ready ? 'klar' : 'mangler nøkkel'}` : ''}</span></span></button>`; }).join('')}</div>
    ${keyRow}${GS.keyMsg ? `<span class="p35-note">${esc(GS.keyMsg)}</span>` : ''}${TT.err ? `<span class="p35-note err">${esc(TT.err)}</span>` : ''}
    <span class="p35-lab" data-hl="gl-voice">STEMME</span>
    <div class="p35-opts">${VOICES.map(([k, n, s]) => `<button type="button" class="p35-opt" data-p35="vsel" data-v="${k}" aria-pressed="${c.tts.voice === k}"><span class="p35-rt"><b>${esc(n)}</b><span>${esc(s)}</span></span><span class="p35-hear" data-p35="vtry" data-v="${k}" role="button" aria-label="Hør ${esc(n.split(' · ')[0])}">▶ Hør</span></button>`).join('')}</div>
    <div class="p35-sgw"><span class="p35-sgh"><b>Språk for opplesning</b><span>${c.tts.lang === 'en' ? 'English' : 'Norsk'}</span></span>${seg([['no', 'Norsk'], ['en', 'English']], c.tts.lang, 'lang')}</div>
    <div class="p35-sgw"><span class="p35-sgh"><b>Tempo</b><span>×${String(rateOf(c.tts.rate)).replace('.', ',')}</span></span>${seg(RATES.map(([k, n]) => [k, n]), c.tts.rate, 'rate')}</div>
    <span class="p35-note">${c.tts.engine === 'browser' ? 'Nettleserens innebygde stemme. Bare for testing.' : 'Lyden lages på serveren med nøkkelen fra AI-kontroll og caches i 30 dager, så samme brief ikke koster noe ekstra. Uten nøkkel brukes nettleserstemmen.'}</span>
    ${sheet ? '' : '<a class="p35-ai" href="#/aictl/api">Modeller, nøkler og forbruk ligger under AI ›</a>'}`;
}
export function glimtEnter(prev) { if (prev && prev !== 'glimt') GS.from = prev; }
export function glimtView() {
  const c = cfg(), sel = IDS.includes(c.char) ? c.char : 'glimt';
  return `<div class="p35-gl"><div class="p35-glh"><b>Glimt</b><button type="button" class="p34-done" data-p35="glclose" data-p34back>Ferdig</button></div>
    <span class="p35-lab">GLIMT-FIGUR</span>
    <div class="p35-figs" data-hl="gl-fig">${FIGS.map(([k, n]) => `<button type="button" class="p35-fg${k === 'natt' ? ' dark' : ''}" data-p35="char" data-v="${k}" aria-pressed="${sel === k}"><span class="p35-fgi">${fig(k, 54, sel === k ? 'glad' : 'idle', { noJul: true })}</span><b>${esc(n)}</b></button>`).join('')}</div>
    <span class="p35-note">Figuren er verten i briefen, på Hjem-kortet, i widgets og i Glimt-chat. Er «Glimt» valgt, blir verten Glimt Natt mellom 21 og 06. Vennene (Sky, Dråpe, Ugle, Gris …) tar over når temaet passer, om det er slått på under.</span>
    ${globalThis.P40?.julCard?.() ?? '' /* prompt 40: Julemodus (Auto · Av · På) */}
    ${cfgBody(false)}${P38.cardsCfg()}${P37B.bibleSettings()}${P39.tipsCfg() /* prompt 39 */}</div>`;
}

/* =====================================================================
   7. AI-søk: været for et sted
   ===================================================================== */
const WX_RE = /v(æ|ae)r(et|varsel)?\b|\bregn\b|\bsnø\b|temperatur|grader|\bweather\b|forecast|\bvind\b|paraply/i;
const TIME_RE = /\b(i\s+morgen|imorgen|i\s+overmorgen|overmorgen|i\s+dag|idag|i\s+kveld|i\s+natt|i\s+helgen|nå|neste\s+uke|på\s+(?:man|tirs|ons|tors|fre|lør|søn)dag(?:en)?|tomorrow|today|tonight|now|this\s+weekend|next\s+week)\b/gi;
/** Stedet i teksten: etter «i / på / in / for / at / ved / rundt», fram til tidsordet eller slutten. «i morgen» o.l. er ikke et sted. */
export function wxPlace(q) {
  const s = ` ${String(q ?? '').replace(/[?!.,]+/g, ' ').replace(TIME_RE, ' | ')} `;
  const re = /\s(?:i|på|in|for|at|ved|rundt)\s+([^|]+?)(?=\s*\||\s*$)/gi;
  let x;
  while ((x = re.exec(s))) {
    const p = x[1].trim().replace(/^(byen|stedet)\s+/i, '');
    if (p && !/^(morgen|dag|kveld|natt|helgen|uka|uken|været|weather|the)$/i.test(p) && /[a-zæøåA-ZÆØÅ]/.test(p)) return p.split(/\s+/).map((w) => (w.length > 2 || /^(new|san|los|las|le|la|de)$/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  }
  return null;
}
export const isWxQuery = (q) => WX_RE.test(String(q ?? ''));
const WMO = (c) => { c = +c; return c <= 0 ? 'Klart' : c === 1 ? 'Lettskyet' : c === 2 ? 'Delvis skyet' : c === 3 ? 'Skyet' : c <= 48 ? 'Tåke' : c <= 57 ? 'Yr' : c <= 67 ? 'Regn' : c <= 77 ? 'Snø' : c <= 82 ? 'Regnbyger' : c <= 86 ? 'Snøbyger' : 'Torden'; };
/** Svar uten /api/assist: {text, place, open} eller {text, err}. */
export async function wxAnswer(q) {
  const name = wxPlace(q);
  if (!name) return null; // uten sted: serverens/Hjem-været
  try {
    const r = await hlApi(`/weather/place?q=${encodeURIComponent(name)}`);
    const P = r?.place ?? {}, N = r?.now ?? {}, T = r?.today ?? {};
    const lab = P.label ?? P.name ?? name;
    const text = r?.text ?? `${N.cond ?? 'Været'} og **${Math.round(N.temp)}°** i ${lab} nå${N.wind != null ? `, vind ${Math.round(N.wind)} m/s` : ''}.${T.hi != null ? ` I dag ${Math.round(T.lo)}–${Math.round(T.hi)}°.` : ''}`;
    return { text, place: P, open: { route: 'vaer', name: P.name ?? name, lat: P.lat, lon: P.lon, label: lab }, src: 'Vær' };
  } catch (e) {
    if (e.status === 404 && /^Fant ikke/.test(e.message)) return { text: e.message, err: true, src: 'Vær' };
    if (e.status && e.status !== 404 && e.status !== 405) return null;
  }
  // Eldre server uten /api/weather/place: Open-Meteo direkte.
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=nb`).then((x) => x.json());
    const P = g?.results?.[0];
    if (!P) return { text: `Fant ikke stedet «${name}». Prøv en annen stavemåte.`, err: true, src: 'Vær' };
    const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${P.latitude}&longitude=${P.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto&wind_speed_unit=ms`).then((x) => x.json());
    const no = /^(NO|Norge|Norway)$/i.test(P.country_code ?? P.country ?? ''), lab = no ? P.name : `${P.name}, ${P.country_code === 'US' ? 'USA' : P.country}`;
    const text = `${WMO(f.current.weather_code)} og **${Math.round(f.current.temperature_2m)}°** i ${lab} nå, vind ${Math.round(f.current.wind_speed_10m)} m/s. I dag ${Math.round(f.daily.temperature_2m_min[0])}–${Math.round(f.daily.temperature_2m_max[0])}°.`;
    return { text, open: { route: 'vaer', name: P.name, lat: P.latitude, lon: P.longitude, label: lab }, src: 'Vær · Open-Meteo' };
  } catch { return null; }
}
/** Åpner Vær for stedet (legges midlertidig i bylista). */
export async function openWx(o) {
  if (!o || o.lat == null || o.lon == null) { location.hash = '#/vaer'; return; }
  const WXM = await import('./mobile-wx.js');
  WXM.tempPlace?.({ name: o.name ?? o.label ?? 'Sted', lat: +o.lat, lon: +o.lon, label: o.label });
  if (location.hash !== '#/vaer') location.hash = '#/vaer'; else { WXM.wxLoad?.(true).then(draw).catch(() => {}); draw(); }
}

/* =====================================================================
   8. Kroker fra mobile.js
   ===================================================================== */
let booted = false;
export function boot35() {
  if (booted) return; booted = true;
  bindVis();
  // Markering fra innstillingssøket («glimt», «brief», «stemme», «figur»).
  Object.assign(P34.ANCHORS, { 'gl-fig': { href: '#/glimt', sel: '[data-hl="gl-fig"]' }, 'gl-brief': { href: '#/glimt', sel: '[data-hl="gl-brief"]' }, 'gl-voice': { href: '#/glimt', sel: '[data-hl="gl-voice"]' } });
}
export function input35(e, t) {
  const k = t.dataset?.p35in; if (!k) return false;
  if (k === 'bt') { if (e.type === 'change' && /^\d\d:\d\d$/.test(t.value)) { const b = t.dataset.k, B = cfg().briefs[b] ?? DEF.briefs[b]; cfgPut({ briefs: { [b]: { ...B, at: t.value } } }); haptic('tab'); } return true; }
  if (k === 'key') { GS.keys[t.dataset.k] = t.value.trim(); return true; }
  if (k === 'region') { GS.keys.region = t.value.trim(); return true; }
  return true;
}
async function keySave(id) {
  const key = GS.keys[id]; if (!key) { flash('Skriv inn nøkkelen først'); return; }
  try {
    await hlApi(`/ai/keys/${encodeURIComponent(id)}`, { method: 'PUT', json: { key, ...(id === 'azure' && GS.keys.region ? { region: GS.keys.region } : {}) } });
    GS.keys[id] = ''; GS.keyMsg = 'Nøkkelen er lagret på serveren ✓'; TT.noApi = false; haptic('ok');
    await cfgLoad(true);
  } catch (e) { GS.keyMsg = e.status === 404 ? 'Serveren støtter ikke stemmenøkler ennå. Oppdater Homelab.' : e.status === 403 ? 'Bare administrator kan endre nøkler.' : e.message; haptic('err'); }
  draw();
}
async function trialDone(id) {
  const b = brief(), T = b.trials.find((x) => String(x.id) === String(id)) ?? b.trials[0]; if (!T) return;
  haptic('ok');
  let ok = false;
  try { await hlApi(`/brief/trials/${encodeURIComponent(T.id)}/done`, { method: 'POST', json: {} }); ok = true; } catch {}
  if (!ok && !T.local) { try { await api(`/subscriptions/trials/${encodeURIComponent(T.id)}`, { method: 'PATCH', json: { status: 'cancelled' } }); ok = true; } catch {} }
  if (!ok) { const L = lsGet('papir_trials', []).map((x) => (String(x.id) === String(T.id) ? { ...x, status: 'cancelled', done: true } : x)); lsSet('papir_trials', L); }
  if (B5.d) B5.d.trials = B5.d.trials.filter((x) => x !== T);
  P31.G.trials = null;
  flash(`${T.service} er markert som avsluttet ✓`); draw();
  briefLoad(true).then(draw).catch(() => {});
}
export async function bind35(e, t) {
  const x = t.closest?.('[data-p35]'); if (!x) return false;
  const k = x.dataset.p35, c = cfg();
  e.preventDefault(); e.stopPropagation?.();
  switch (k) {
    case 'brwx': { haptic('tap'); stopTalk(false); B5.keep = true; location.hash = '#/vaer'; return true; }
    case 'voice': { const on = !c.readAloud; haptic('tap'); cfgPut({ readAloud: on }); if (on) say(c.tts.lang === 'en' ? "Sound is on. I'll read the brief for you." : 'Lyden er på. Jeg leser briefen for deg.', TT.who ?? hostFor(), true); else stopTalk(); return true; }
    case 'stop': stopTalk(); return true;
    case 'hear': { TT.hint = false; const P = TT.pend; TT.pend = null; if (P) say(P[0], P[1], true); else draw(); return true; }
    case 'cfgopen': haptic('tap'); clearTimeout(B5.tour); B5.sheet = true; cfgLoad().then(draw).catch(() => {}); draw(); return true;
    case 'cfgclose': haptic('tap'); B5.sheet = false; draw(); return true;
    case 'gnext': { const n = guideOf(brief()).length; gStep(B5.step >= n ? 99 : B5.step + 1); return true; }
    case 'gskip': gStep(99); return true;
    case 'gtap': gStep(B5.step > 0 && B5.step < 99 ? 99 : 1); return true;
    case 'trdone': await trialDone(x.dataset.id); return true;
    case 'tog': { const kk = x.dataset.k; haptic('tab'); cfgPut({ [kk]: !(c[kk] !== false) }); if (kk === 'readAloud' && c[kk] !== false) stopTalk(); return true; }
    case 'btog': { const b = x.dataset.k, B = c.briefs[b] ?? DEF.briefs[b]; haptic('tab'); cfgPut({ briefs: { [b]: { ...B, on: !B.on } } }); return true; }
    case 'eng': haptic('tab'); GS.keyMsg = ''; TT.err = ''; TT.noApi = false; cfgPut({ tts: { engine: x.dataset.v } }); return true;
    case 'vsel': if (t.closest('[data-p35="vtry"]')) return true; haptic('tab'); cfgPut({ tts: { voice: x.dataset.v } }); return true;
    case 'vtry': { haptic('tap'); if (c.tts.voice !== x.dataset.v) cfgPut({ tts: { voice: x.dataset.v } }); setTimeout(() => say(cfg().tts.lang === 'en' ? "Hi, I'm Glimt. This is how I sound." : 'Hei, jeg er Glimt. Slik høres jeg ut.', 'glimt', true), 30); return true; }
    case 'lang': { haptic('tab'); const v = x.dataset.v; cfgPut({ tts: { lang: v } }); setTimeout(() => say(v === 'en' ? "Hi, I'm Glimt. This is how I sound in English." : 'Hei, jeg er Glimt. Slik høres jeg ut på norsk.', 'glimt', true), 40); return true; }
    case 'rate': haptic('tab'); cfgPut({ tts: { rate: x.dataset.v } }); return true;
    case 'keysave': await keySave(x.dataset.k); return true;
    case 'char': { const v = x.dataset.v; haptic('ok'); cfgPut({ char: v }); if (B5.d) B5.d.host = null; say(v === 'gris' ? 'Nøff! Nå er jeg din Glimt.' : 'Hei! Nå er jeg din Glimt.', v, true); return true; }
    case 'glclose': { stopTalk(false); const f = GS.from && GS.from !== 'glimt' ? GS.from : 'set'; location.hash = `#/${f}`; return true; }
    case 'wxopen': { haptic('tap'); const A = P31.G.ans; P31.G.ans = null; await openWx(A?.open ?? { name: x.dataset.name, lat: x.dataset.lat, lon: x.dataset.lon }); return true; }
    default: return false;
  }
}
/** Knapp under værsvaret i svarboblen: «Åpne Vær for New York ›». */
export const wxOpenBtn = (o) => (o && o.lat != null ? `<button type="button" class="p35-wxo" data-p35="wxopen" data-name="${esc(o.name ?? '')}" data-lat="${esc(o.lat)}" data-lon="${esc(o.lon)}">Åpne Vær for ${esc(o.label ?? o.name ?? 'stedet')} ›</button>` : '');
export function leave35(prev, next) {
  if (prev === 'brief' && next !== 'brief') briefLeave();
  if (prev === 'glimt' && next !== 'glimt') stopTalk(false);
  if (next === 'brief') briefEnter(prev);
  if (next === 'glimt') glimtEnter(prev);
}
