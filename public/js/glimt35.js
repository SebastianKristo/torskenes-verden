// Prompt 35 (WEB35): Glimt-innstillinger (figur, brief, opplesning, stemme og venner) og opplesning med ekte TTS.
// Felles for ⚙ i briefen og Innstillinger → GLIMT → Glimt (fasit Glimt Brief.dc.html mode="settings" / cfg-arket).
// Data: GET/PUT /api/glimt/settings (per bruker, delvis PUT). Eldre server: /api/brief/settings (notify, guide) + lokal kopi.
// Nøkler: PUT /api/ai/keys/openai|elevenlabs|azure (bare admin). Nøkkelen lagres aldri i nettleseren.
// Opplesning: POST /api/tts {text, character, voice, rate, lang} → audio/mpeg. 503/404/feil → nettleserens stemme.
import { api, esc } from './util.js';
import { store } from './store.js';
import { fig, FIGS, hostFor, setJul, julOn, julAuto, JUL_PHASES, julPhaseName, setMai17, mai17Auto } from './glimt-figs.js';
import { CARDS38, cardList38, toSrv38 } from './brief38.js'; // prompt 38: kortene i briefen (av/på og rekkefølge)

export const DEF = {
  char: 'glimt', friends: true, brief: true, briefGlimt: true, // prompt 39: «Glimt i briefen» (figuren av/på)
  readAloud: false, guide: true, notify: true,
  briefs: { morning: { on: true, at: '06:45' }, day: { on: false, at: '12:00' }, evening: { on: true, at: '18:00' }, night: { on: false, at: '22:30' } },
  tts: { engine: 'openai', voice: 'nora', rate: 'normal', lang: 'no' },
  engines: null, chars: null,
  jul: 'auto', julPhase: null, snow: true, julSound: 'av', // prompt 40: julemodus (per bruker, synkes)
};
const LS = 'glimt_settings35';
const G = { s: null, loaded: false, loading: null, err: '', legacy: false, keyMsg: {}, keyBusy: '' };
export const glimtState = G;

const merge = (a, b) => ({
  ...a, ...b,
  briefs: Object.fromEntries(Object.keys(DEF.briefs).map((k) => [k, { ...DEF.briefs[k], ...(a.briefs?.[k] ?? {}), ...(b?.briefs?.[k] ?? {}) }])),
  tts: { ...DEF.tts, ...(a.tts ?? {}), ...(b?.tts ?? {}) },
});
function readLocal() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { /* privat modus */ }
  // Prompt 52: figuren per bruker (glimt_char_<bruker>) før den felles glimt_char. Serverens valg (/api/glimt/settings, /api/me) vinner.
  try { const ch = localStorage.getItem(charKey52()) || localStorage.getItem('glimt_char'); if (ch) c.char = ch; } catch { /* */ }
  return c;
}
function writeLocal(s) {
  try { const { engines, chars, ...rest } = s; localStorage.setItem(LS, JSON.stringify(rest)); localStorage.setItem('glimt_char', s.char); localStorage.setItem(charKey52(), s.char); } catch { /* */ }
}
function charKey52() { let u = ''; try { u = localStorage.getItem('hl_uid') || ''; } catch { /* */ } return `glimt_char_${u || 'meg'}`; }
/** Gjeldende innstillinger (standard + lokal kopi til serveren har svart). */
export const gs = () => G.s ?? (G.s = merge(DEF, readLocal()));

/** Henter innstillingene fra serveren. redraw kalles når de er klare. */
export function loadGlimt(redraw, force = false) {
  if (G.loading) return G.loading.then(() => redraw?.());
  if (G.loaded && !force) return Promise.resolve();
  G.loading = api('/glimt/settings').then((r) => { G.s = merge(DEF, { ...readLocal(), ...(r ?? {}) }); G.legacy = false; G.err = ''; setJul({ jul: G.s.jul, julPhase: G.s.julPhase, julActive: r?.julActive ?? null }); setMai17({ mai17: G.s.mai17 ?? 'auto', mai17Active: r?.mai17Active ?? null }); })
    .catch(async (e) => {
      if (e.status !== 404) G.err = e.message;
      // Eldre server: bare varsel og guide finnes i /api/brief/settings. Resten er en lokal kopi.
      G.legacy = true;
      const b = await api('/brief/settings').catch(() => null);
      G.s = merge(DEF, { ...readLocal(), ...(b ? { notify: b.notify ?? true, guide: b.guide ?? true } : {}) });
    })
    .finally(() => { G.loaded = true; G.loading = null; writeLocal(gs()); redraw?.(); });
  return G.loading;
}

let saveT = null;
const pendingKeys = {};
/** Lagrer en delvis endring (optimistisk). Sender hendelsene glimt-char (window) og hl:glimt (document). */
export function saveGlimt(patch) {
  const before = gs().char;
  G.s = merge(gs(), patch);
  writeLocal(G.s);
  if (patch.char && patch.char !== before) { try { window.dispatchEvent(new Event('glimt-char')); } catch { /* */ } }
  // Prompt 40: julemodus gjelder overalt med en gang (figurbiblioteket sender «glimt-jul»).
  if ('jul' in patch || 'julPhase' in patch) setJul({ jul: G.s.jul, julPhase: G.s.julPhase, julActive: null });
  if ('mai17' in patch) { setMai17({ mai17: G.s.mai17, mai17Active: null }); document.dispatchEvent(new Event('hl:mai17')); } // prompt 41
  document.dispatchEvent(new CustomEvent('hl:glimt', { detail: patch }));
  // Bare feltene som er endret sendes (delvis PUT); briefs og tts sendes hele.
  for (const k of Object.keys(patch)) pendingKeys[k] = 1;
  clearTimeout(saveT);
  saveT = setTimeout(flush, 350);
}
async function flush() {
  const body = Object.fromEntries(Object.keys(pendingKeys).map((k) => [k, gs()[k]]));
  for (const k of Object.keys(pendingKeys)) delete pendingKeys[k];
  if (!Object.keys(body).length) return;
  if (!G.legacy) {
    try { const r = await api('/glimt/settings', { method: 'PUT', json: body }); if (r && typeof r === 'object') { G.s = merge(gs(), { engines: r.engines ?? gs().engines, chars: r.chars ?? gs().chars }); } return; }
    catch (e) { if (e.status !== 404) { G.err = e.message; return; } G.legacy = true; }
  }
  if ('notify' in body || 'guide' in body) api('/brief/settings', { method: 'PUT', json: { notify: gs().notify, guide: gs().guide } }).catch(() => {});
}

/* ---------- Stemmer, motorer og tempo (fasit VOICES / ENG / CHV) ---------- */

export const VOICES = [['nora', 'Nora · rolig og varm', 'Kvinne · voksen, rolig', 1, 1], ['henrik', 'Henrik · lav og trygg', 'Mann · dyp, avslappet', 0.9, 0.92], ['lys', 'Lys · glad og lett', 'Kvinne · ung, smilende', 1.15, 1.05]];
const ENG = [
  ['openai', 'OpenAI · gpt-4o-mini-tts', 'Nesten menneskelig. Følger instruks om tone og følelse.', 'ANBEFALT', '#e3efe6', '#2f7a4f', 'https://platform.openai.com/api-keys', 'sk-…'],
  ['elevenlabs', 'ElevenLabs · Multilingual v2', 'Mest naturlig og uttrykksfull. Kan klone en egen stemme.', 'BEST', '#fbeee8', '#b23a2a', 'https://elevenlabs.io/app/settings/api-keys', 'xi-…'],
  ['azure', 'Azure · nb-NO Neural (Pernille, Finn, Iselin)', 'Ekte norske stemmer med riktig tonelag.', 'NORSK', '#e6eef4', '#2b5d8a', 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices', 'nøkkel'],
  ['browser', 'Nettleserens stemme', 'Robotaktig. Bare for testing uten nøkkel.', '', '', '', '', ''],
];
const RATES = [['calm', 'Rolig', 0.85], ['normal', 'Normal', 1], ['fast', 'Rask', 1.15]];
const CHV = { glimt: [1, 1], natt: [0.92, 0.95], sky: [1.12, 1.02], drape: [1.25, 1.06], ugle: [0.8, 0.94], gris: [1.08, 1.04], stjerne: [1.1, 1.04], spire: [1.06, 1], blekk: [1.06, 1.02] };
export const rateOf = (r) => RATES.find((x) => x[0] === r)?.[2] ?? 1;
export const voiceName = (id) => (VOICES.find((v) => v[0] === id) ?? VOICES[0])[1].split(' · ')[0];
const engineInfo = (id) => { const s = gs(), e = (s.engines ?? []).find((x) => x.id === id || (id === 'elevenlabs' && x.id === 'eleven')); return e ?? null; };

/* ---------- Opplesning ---------- */

const T = { au: null, url: null, speaking: false, who: null, needTap: false, err: '', ctl: null, listeners: new Set(), seq: 0 };
export const tts = T;
export const onSpeak = (fn) => { T.listeners.add(fn); return () => T.listeners.delete(fn); };
const emitS = () => T.listeners.forEach((f) => { try { f(T); } catch { /* */ } });
const cleanTxt = (t) => String(t ?? '').replace(/[«»]/g, '').replace(/\bkl\. /g, 'klokka ').replace(/\s+/g, ' ').trim();

export function stopSpeak() {
  T.seq++;
  T.ctl?.abort(); T.ctl = null;
  try { window.speechSynthesis?.cancel(); } catch { /* */ }
  if (T.au) { try { T.au.pause(); } catch { /* */ } T.au = null; }
  if (T.url) { URL.revokeObjectURL(T.url); T.url = null; }
  if (T.speaking) { T.speaking = false; T.who = null; emitS(); }
}

/** Leser teksten med figurens klang. force: også når «Les opp» er av (▶ Hør, prøv stemmen). */
export async function say(text, ch = 'glimt', { force = false } = {}) {
  const s = gs();
  if (!s.readAloud && !force) return;
  stopSpeak();
  const seq = T.seq, txt = cleanTxt(text);
  if (!txt) return;
  T.last = { text, ch };
  T.err = '';
  // Motoren er ikke klar (ingen nøkkel): rett til nettleserens stemme, uten et kall som gir 503.
  const inf = engineInfo(s.tts.engine);
  if (inf && inf.ready === false && s.tts.engine !== 'browser') T.err = `${inf.name?.split(' · ')[0] ?? 'Stemmemotoren'} mangler nøkkel. Bruker nettleserens stemme.`;
  else if (s.tts.engine !== 'browser') {
    T.speaking = true; T.who = ch; emitS();
    const ctl = new AbortController(); T.ctl = ctl;
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ text: txt, character: ch, voice: s.tts.voice, rate: s.tts.rate, lang: s.tts.lang }) });
      if (seq !== T.seq) return;
      const ct = r.headers.get('content-type') ?? '';
      if (r.ok && /audio|octet/.test(ct)) {
        const b = await r.blob();
        if (seq !== T.seq) return;
        const url = URL.createObjectURL(b), a = new Audio(url);
        T.au = a; T.url = url;
        a.onended = a.onerror = () => { if (T.au === a) { T.au = null; T.speaking = false; T.who = null; emitS(); } };
        try { await a.play(); T.needTap = false; T.speaking = true; T.who = ch; emitS(); }
        catch (e) { if (seq !== T.seq) return; T.speaking = false; T.who = null; T.needTap = e?.name === 'NotAllowedError'; if (!T.needTap) T.err = 'Kunne ikke spille av lyden.'; emitS(); }
        return;
      }
      const j = /json/.test(ct) ? await r.json().catch(() => ({})) : {};
      T.err = r.status === 503 ? (j.error || 'Ingen stemmemotor er satt opp. Bruker nettleserens stemme.') : r.status === 404 ? '' : (j.error || `Stemmen svarte ikke (${r.status}). Bruker nettleserens stemme.`);
    } catch (e) { if (e?.name === 'AbortError' || seq !== T.seq) return; T.err = 'Stemmen svarte ikke. Bruker nettleserens stemme.'; }
  }
  if (seq !== T.seq) return;
  sayBrowser(txt, ch);
}
function sayBrowser(txt, ch) {
  const s = gs();
  try {
    const S = window.speechSynthesis;
    if (!S) { T.speaking = false; T.who = null; emitS(); return; }
    S.cancel();
    const u = new SpeechSynthesisUtterance(txt), en = s.tts.lang === 'en';
    u.lang = en ? 'en-GB' : 'nb-NO';
    const V = VOICES.find((v) => v[0] === s.tts.voice) ?? VOICES[0], cv = CHV[ch] ?? [1, 1];
    u.pitch = V[3] * cv[0]; u.rate = rateOf(s.tts.rate) * V[4] * cv[1];
    const all = S.getVoices(), vs = all.filter((v) => (en ? /^en-(GB|US)/i.test(v.lang) && /(Natural|Neural|Premium|Enhanced|Google|Samantha|Daniel|Serena|Aria|Jenny|Sonia|Libby)/i.test(v.name) : /^(nb|no|nn)/i.test(v.lang))).concat(all.filter((v) => (en ? /^en/i.test(v.lang) : false)));
    if (vs.length) u.voice = vs[s.tts.voice === 'henrik' ? Math.min(1, vs.length - 1) : 0];
    u.onstart = () => { T.speaking = true; T.who = ch; emitS(); };
    u.onend = u.onerror = () => { T.speaking = false; T.who = null; emitS(); };
    T.speaking = true; T.who = ch; emitS();
    S.speak(u);
  } catch { T.speaking = false; T.who = null; emitS(); }
}
/** «🔊 Trykk for å høre Glimt»: nettleseren blokkerte lyd før et trykk. */
export function replayAfterTap() { T.needTap = false; emitS(); if (T.last) say(T.last.text, T.last.ch, { force: true }); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeak(); });

/* ---------- Innstillingene som HTML (felles for ⚙ i briefen og Innstillinger → Glimt) ---------- */

const isAdmin = () => store.me?.me?.role === 'admin';
const sw = (on) => `<span class="gs-sw${on ? ' on' : ''}" aria-hidden="true"><i></i></span>`;
const MAIN = [
  ['brief', 'Glimt-brief', 'Lag briefer gjennom dagen'],
  ['briefGlimt', 'Glimt i briefen', 'Vis Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets'],
  ['readAloud', 'Les opp', 'Glimt og vennene leser briefen høyt'],
  ['guide', 'Vis meg rundt automatisk', 'Starter guide-runden når briefen åpnes'],
  ['friends', 'Venner av Glimt', 'Sky, Dråpe, Ugle og Gris tar over når temaet passer'],
  ['notify', 'Varsel når briefen er klar', 'Push til mobilen og nettleseren på klokkeslettet'],
];
const BR = [['morning', 'Morgenbrief', 'Vær, dagen og første avtale'], ['day', 'Dagsbrief', 'Resten av dagen og nyheter'], ['evening', 'Kveldsbrief', 'I morgen, vær og det du ikke rakk'], ['night', 'Nattbrief', 'Kort oppsummering før du legger deg']];

function engineRows(s) {
  const list = ENG.map(([id, n, d0, tag0, tb, tf, href, ph]) => {
    const info = engineInfo(id), name = info?.name || n, d = info?.desc || d0, tag = info?.badge ?? tag0;
    const st = id === 'browser' ? '' : info ? (info.ready ? ' · klar' : info.keySet ? ' · nøkkel lagt inn' : ' · mangler nøkkel') : '';
    return { id, name, d: d + st, tag, tb, tf, href, ph, info };
  });
  return list.map((o) => `<button type="button" class="gs-opt" data-gs-engine="${o.id}" aria-pressed="${s.tts.engine === o.id}"><span class="gs-ot"><span class="gs-on"><b>${esc(o.name)}</b>${o.tag ? `<span class="gs-tag" style="background:${o.tb};color:${o.tf}">${esc(o.tag)}</span>` : ''}</span><span class="gs-os">${esc(o.d)}</span></span></button>`).join('');
}
function keyBlock(s) {
  const id = s.tts.engine;
  if (id === 'browser') return `<p class="gs-note">Nettleserens innebygde stemme. Bare for testing.</p>`;
  const e = ENG.find((x) => x[0] === id), info = engineInfo(id), msg = G.keyMsg[id], link = info?.link || e[6];
  const status = info?.keySet ? `Nøkkel lagt inn${info.tail ? ` (…${esc(info.tail)})` : ''}` : 'Ingen nøkkel lagt inn';
  if (!isAdmin()) return `<p class="gs-note">${status}. Bare administrator kan legge inn nøkler for stemmemotorene (AI → API og nøkler).</p>`;
  return `<form class="gs-key" data-gs-key="${id}"><span class="gs-kl"><span>${esc(e[1].split(' · ')[0])} API-nøkkel · ${status}</span><a href="${esc(link)}" target="_blank" rel="noopener">Hent nøkkel ↗</a></span>
    <span class="gs-kr"><input type="password" name="key" placeholder="${esc(info?.keySet ? '•••••••• lagret' : e[7])}" autocomplete="off" spellcheck="false" aria-label="API-nøkkel">${id === 'azure' ? `<input name="region" value="${esc(info?.region ?? '')}" placeholder="Region, f.eks. norwayeast" autocomplete="off" spellcheck="false" aria-label="Azure-region" class="gs-reg">` : ''}<button type="submit" class="gs-pill dark"${G.keyBusy === id ? ' disabled' : ''}>${G.keyBusy === id ? 'Lagrer …' : 'Lagre'}</button></span>
    ${msg ? `<span class="gs-msg${msg.ok ? ' ok' : ''}">${esc(msg.text)}</span>` : ''}</form>`;
}

/* Prompt 40 (claude-code-glimt-jul.md → Innstillinger → Glimt): kort med rød lue-ikonrute, «Julemodus», status, segment
   Auto · Av · På, fasevalg når På er valgt, og snø i Vær og brief + julelyd på varsler. */
function julCard(s) {
  const m = s.jul ?? 'auto', on = julOn(), ph = s.julPhase ?? on ?? 'advent';
  const note = m === 'auto' ? (julAuto() ? 'På nå · slås av 13. januar' : 'Slås på 1. desember') : m === 'av' ? 'Av hele året' : `På · ${julPhaseName(ph) || 'Advent'}`;
  const seg = (k, n) => `<button type="button" data-gs-jul="${k}" aria-pressed="${m === k}">${n}</button>`;
  return `<div class="gs40-jul" data-hl="glimt-jul"><div class="gs40-jh"><span class="gs40-ji" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18 Q9 5 18 5 Q20 6 20 8 Q16 8 15 18 Z"/><path d="M3 18h14"/><circle cx="20" cy="8" r="1.6"/></svg></span><span class="gs-ot"><b>Julemodus</b><span class="gs-os">${esc(note)}</span></span></div>
    <div class="gs40-seg" role="group" aria-label="Julemodus">${seg('auto', 'Auto')}${seg('av', 'Av')}${seg('pa', 'På')}</div>
    ${m === 'pa' ? `<div class="gs40-ph" role="group" aria-label="Fase">${JUL_PHASES.map(([k, n]) => `<button type="button" data-gs-julp="${k}" aria-pressed="${ph === k}">${n}</button>`).join('')}</div>` : ''}
    <button type="button" class="gs-row gs40-sub" data-gs-tog="snow" role="switch" aria-checked="${s.snow !== false}"><span class="gs-ot"><b>Snø i Vær og brief</b><span class="gs-os">Når det snør eller er minus</span></span>${sw(s.snow !== false)}</button>
    ${mai17Row41(s)}
    <div class="gs40-snd"><span class="gs-ot"><b>Julelyd på varsler</b><span class="gs-os">${s.julSound === 'bjelle' ? 'Myk bjelle (lav og kort)' : 'Av'}</span></span><div class="gs40-seg sm">${[['av', 'Av'], ['bjelle', 'Myk bjelle']].map(([k, n]) => `<button type="button" data-gs-julsnd="${k}" aria-pressed="${(s.julSound ?? 'av') === k}">${n}</button>`).join('')}</div></div></div>`;
}

/* Prompt 41 (claude-code-17-mai.md): Høytider → «17. mai» Automatisk 17. mai / Vis nå / Av. Av = vanlig Hjem og figurer uten flagg. */
function mai17Row41(s) {
  const m = s.mai17 ?? 'auto';
  const note = m === 'auto' ? (mai17Auto() ? 'På nå · flagg på figurene til og med 17. mai' : 'Flagg på figurene 14.–17. mai, eget Hjem på selve dagen') : m === 'pa' ? 'Vises nå (forhåndsvisning)' : 'Av · vanlig Hjem og figurer uten flagg';
  const seg = (k, n) => `<button type="button" data-gs-mai17="${k}" aria-pressed="${m === k}">${n}</button>`;
  return `<div class="gs40-snd gs41-m17" data-hl="glimt-17mai"><span class="gs-ot"><b>17. mai</b><span class="gs-os">${esc(note)}</span></span><div class="gs40-seg sm" role="group" aria-label="17. mai">${seg('auto', 'Automatisk')}${seg('pa', 'Vis nå')}${seg('av', 'Av')}</div></div>`;
}
/** Hele innstillingssiden. figs: rutenett med figurene (Innstillinger → Glimt). */
export function glimtSettingsHtml({ figs = false } = {}) {
  const s = gs(), sel = s.char;
  const grid = figs ? `<span class="gs-h">GLIMT-FIGUR</span>
    <div class="gs-figs" data-hl="glimt-fig">${FIGS.map((f) => { const on = sel === f.id; return `<button type="button" class="gs-fig${f.id === 'natt' ? ' dark' : ''}" data-gs-char="${f.id}" aria-pressed="${on}" aria-label="${esc(f.name)}"><span class="gs-fi">${fig(f.id, 54, on ? 'glad' : 'idle', { noJul: true })}</span><b>${esc(f.name)}</b></button>`; }).join('')}</div>
    <p class="gs-note">Figuren er verten i briefen, på Hjem-kortet, i widgets og i Glimt-chat. Vennene (Sky, Dråpe, Ugle …) tar over når temaet passer, om det er slått på under.${sel === 'glimt' ? ' Mellom 21 og 06 blir Glimt automatisk Glimt Natt.' : ''}</p>` : '';
  return `<div class="gs" data-gs>${grid}${figs ? adminChars52() : ''}${julCard(s)}
    <div class="gs-list" data-hl="glimt">${MAIN.map(([k, n, d]) => `<button type="button" class="gs-row${k === 'friends' && s.briefGlimt === false ? ' gs-dim' : ''}" data-gs-tog="${k}" role="switch" aria-checked="${!!s[k]}"><span class="gs-ot"><b>${esc(n)}</b><span class="gs-os">${esc(d)}</span></span>${sw(!!s[k])}</button>`).join('')}</div>
    <span class="gs-h">BRIEFER GJENNOM DAGEN</span>
    <div class="gs-list">${BR.map(([k, n, d]) => { const B = s.briefs[k]; return `<div class="gs-row gs-br${s.brief ? '' : ' off'}"><button type="button" class="gs-brt" data-gs-brief="${k}"><span class="gs-ot"><b>${esc(n)}</b><span class="gs-os">${esc(d)}</span></span></button><input type="time" value="${esc(B.at)}" data-gs-at="${k}" aria-label="Klokkeslett for ${esc(n)}"><button type="button" class="gs-swb" data-gs-brief="${k}" role="switch" aria-checked="${!!B.on}" aria-label="${esc(n)}">${sw(!!B.on)}</button></div>`; }).join('')}</div>
    <span class="gs-h">KORT I BRIEFEN</span>
    <div class="gs-list gs38-cards">${cardList38(s).map((c, i, L) => { const n = CARDS38.find((x) => x[0] === c.id)?.[1] ?? c.id; return `<div class="gs-row gs38-card${c.on ? '' : ' off'}"><span class="gs-ot"><b>${esc(n)}</b></span><span class="gs38-mv"><button type="button" data-gs-cmv="${c.id}:-1" aria-label="Flytt ${esc(n)} opp"${i ? '' : ' disabled'}>↑</button><button type="button" data-gs-cmv="${c.id}:1" aria-label="Flytt ${esc(n)} ned"${i < L.length - 1 ? '' : ' disabled'}>↓</button></span><button type="button" class="gs-swb" data-gs-ctog="${c.id}" role="switch" aria-checked="${c.on}" aria-label="${esc(n)}">${sw(c.on)}</button></div>`; }).join('')}</div>
    <p class="gs-note">Glimt leser kortene opp i denne rekkefølgen. Pakker, Familie og Nordlys vises bare når det er noe å vise.</p>
    <span class="gs-h">STEMMEMOTOR</span>
    <div class="gs-opts" data-hl="glimt-voice">${engineRows(s)}</div>
    ${keyBlock(s)}
    <span class="gs-h">STEMME</span>
    <div class="gs-opts">${VOICES.map(([k, n, d]) => `<div class="gs-opt gs-voice" aria-pressed="${s.tts.voice === k}"><button type="button" class="gs-vb" data-gs-voice="${k}"><span class="gs-ot"><b>${esc(n)}</b><span class="gs-os">${esc(d)}</span></span></button><button type="button" class="gs-try" data-gs-try="${k}">▶ Hør</button></div>`).join('')}</div>
    <div class="gs-seg-w"><span class="gs-seg-l"><b>Språk for opplesning</b><span>${s.tts.lang === 'en' ? 'English' : 'Norsk'}</span></span><div class="gs-seg">${[['no', 'Norsk'], ['en', 'English']].map(([k, n]) => `<button type="button" data-gs-lang="${k}" aria-pressed="${s.tts.lang === k}">${n}</button>`).join('')}</div></div>
    <div class="gs-seg-w"><span class="gs-seg-l"><b>Tempo</b><span>×${String(rateOf(s.tts.rate)).replace('.', ',')}</span></span><div class="gs-seg">${RATES.map(([k, n]) => `<button type="button" data-gs-rate="${k}" aria-pressed="${s.tts.rate === k}">${n}</button>`).join('')}</div></div>
    ${T.err ? `<p class="gs-msg">${esc(T.err)}</p>` : ''}
    <p class="gs-note">Lyden lages på serveren (${esc(ENG.find((x) => x[0] === s.tts.engine)?.[1].split(' · ')[0] ?? 'nettleser')}) og caches i 30 dager, så samme brief ikke koster to ganger. Nøklene ligger kryptert på serveren, aldri i nettleseren.</p>
    ${figs ? '<button type="button" class="gs-pill" data-gs-ai>Modeller, nøkler og forbruk ligger under AI ›</button>' : ''}
    ${G.err ? `<p class="gs-msg">Kunne ikke hente innstillingene: ${esc(G.err)}</p>` : ''}</div>`;
}

/* Prompt 52: admin setter standardfigur per bruker (GET/PUT /api/admin/glimt-char52, SRV52). Gjelder til brukeren velger selv. */
const A52 = { users: null, chars: null, err: '', loading: false };
const admin52 = () => store.me?.me?.role === 'admin';
function adminRows52() {
  if (A52.err) return `<p class="gs-msg">${esc(A52.err)}</p>`;
  if (!A52.users) return '<p class="gs-note">Henter brukere …</p>';
  const chars = A52.chars?.length ? A52.chars : FIGS.map((f) => ({ id: f.id, name: f.name }));
  return `<div class="gs-list">${A52.users.map((u) => `<label class="gs-row gs52-def"><span class="gs-ot"><b>${esc(u.name)}</b><span class="gs-os">${esc(u.source === 'user' ? `Har valgt selv: ${chars.find((c) => c.id === u.char)?.name ?? u.char}` : 'Bruker standarden')}</span></span><select data-gs52-def="${esc(u.id)}" aria-label="Standardfigur for ${esc(u.name)}"><option value="">Glimt (standard)</option>${chars.filter((c) => c.id !== 'glimt').map((c) => `<option value="${esc(c.id)}"${u.default === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`).join('')}</div>`;
}
function adminChars52() {
  if (!admin52()) return '';
  if (!A52.users && !A52.loading && !A52.err) {
    A52.loading = true;
    api('/admin/glimt-char52').then((r) => { A52.users = r.users ?? []; A52.chars = r.chars ?? null; }).catch((e) => { A52.err = e.status === 404 ? 'Serveren støtter ikke standardfigur per bruker ennå.' : e.message; })
      .finally(() => { A52.loading = false; document.querySelectorAll('[data-gs52-adm]').forEach((el) => { el.innerHTML = adminRows52(); }); });
  }
  return `<span class="gs-h">STANDARDFIGUR PER BRUKER</span><div data-gs52-adm>${adminRows52()}</div><p class="gs-note">Bare for administrator. Standarden gjelder til brukeren velger figur selv, og følger brukeren på alle enheter.</p>`;
}
function saveDefault52(sel) {
  const id = sel.dataset.gs52Def, v = sel.value || null;
  sel.disabled = true;
  api(`/admin/glimt-char52/${encodeURIComponent(id)}`, { method: 'PUT', json: { default: v } })
    .then(() => { const u = A52.users?.find((x) => x.id === id); if (u) u.default = v; })
    .catch((e) => { A52.err = e.message; document.querySelectorAll('[data-gs52-adm]').forEach((el) => { el.innerHTML = adminRows52(); }); })
    .finally(() => { sel.disabled = false; });
}

/** Klikk i innstillingene. Returnerer true når klikket er håndtert. redraw tegner på nytt. */
export function glimtClick(e, redraw) {
  const t = e.target;
  const c = t.closest('[data-gs-char]');
  if (c) {
    const k = c.dataset.gsChar;
    saveGlimt({ char: k });
    try { navigator.vibrate?.(8); } catch { /* */ }
    redraw();
    say(k === 'gris' ? 'Nøff! Nå er jeg din Glimt.' : k === 'blekk' ? 'Hei! Seks armer klare. Nå er jeg din Glimt.' : 'Hei! Nå er jeg din Glimt.', hostFor(k), { force: gs().readAloud });
    return true;
  }
  const jm = t.closest('[data-gs-jul]');
  if (jm) { const k = jm.dataset.gsJul; saveGlimt(k === 'pa' ? { jul: k, julPhase: gs().julPhase ?? julAuto() ?? 'advent' } : { jul: k }); try { navigator.vibrate?.(8); } catch { /* */ } redraw(); return true; }
  const m17 = t.closest('[data-gs-mai17]');
  if (m17) { saveGlimt({ mai17: m17.dataset.gsMai17 }); try { navigator.vibrate?.(8); } catch { /* */ } redraw(); return true; }
  const jp = t.closest('[data-gs-julp]');
  if (jp) { saveGlimt({ jul: 'pa', julPhase: jp.dataset.gsJulp }); redraw(); return true; }
  const js = t.closest('[data-gs-julsnd]');
  if (js) { saveGlimt({ julSound: js.dataset.gsJulsnd }); if (js.dataset.gsJulsnd === 'bjelle') bell40(); redraw(); return true; }
  const tg = t.closest('[data-gs-tog]');
  if (tg) { const k = tg.dataset.gsTog; saveGlimt({ [k]: !gs()[k] }); if (k === 'briefGlimt') { try { localStorage.setItem('glimt_brief_fig', gs().briefGlimt ? '1' : '0'); } catch { /* */ } document.dispatchEvent(new Event('glimt-cfg')); } if (k === 'readAloud' && !gs().readAloud) stopSpeak(); redraw(); return true; }
  const br = t.closest('[data-gs-brief]');
  if (br) { const k = br.dataset.gsBrief, B = gs().briefs[k]; saveGlimt({ briefs: { [k]: { ...B, on: !B.on } } }); redraw(); return true; }
  // Prompt 38: kortene i briefen.
  const ct = t.closest('[data-gs-ctog]');
  if (ct) { const L = cardList38(gs()).map((c) => (c.id === ct.dataset.gsCtog ? { ...c, on: !c.on } : c)); saveGlimt({ cards: toSrv38(L) }); redraw(); return true; }
  const cm = t.closest('[data-gs-cmv]');
  if (cm) { const [id, d] = cm.dataset.gsCmv.split(':'), L = cardList38(gs()), i = L.findIndex((c) => c.id === id), j = i + +d; if (i >= 0 && j >= 0 && j < L.length) { [L[i], L[j]] = [L[j], L[i]]; saveGlimt({ cards: toSrv38(L) }); redraw(); } return true; }
  const en = t.closest('[data-gs-engine]');
  if (en) { saveGlimt({ tts: { engine: en.dataset.gsEngine } }); redraw(); return true; }
  const tr = t.closest('[data-gs-try]');
  if (tr) { saveGlimt({ tts: { voice: tr.dataset.gsTry } }); redraw(); say(gs().tts.lang === 'en' ? "Hi, I'm Glimt. This is how I sound." : 'Hei, jeg er Glimt. Slik høres jeg ut.', 'glimt', { force: true }); return true; }
  const vo = t.closest('[data-gs-voice]');
  if (vo) { saveGlimt({ tts: { voice: vo.dataset.gsVoice } }); redraw(); return true; }
  const la = t.closest('[data-gs-lang]');
  if (la) { const k = la.dataset.gsLang; saveGlimt({ tts: { lang: k } }); redraw(); say(k === 'en' ? "Hi, I'm Glimt. This is how I sound in English." : 'Hei, jeg er Glimt. Slik høres jeg ut på norsk.', 'glimt', { force: true }); return true; }
  const ra = t.closest('[data-gs-rate]');
  if (ra) { saveGlimt({ tts: { rate: ra.dataset.gsRate } }); redraw(); return true; }
  return false;
}
/** Myk bjelle (lav og kort) – forhåndslytt når den velges. */
function bell40() {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)(), t = C.currentTime;
    for (const [f, d] of [[1318.5, 0], [1760, 0.09]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6); o.connect(g).connect(C.destination); o.start(t + d); o.stop(t + d + 0.65); }
    setTimeout(() => C.close?.(), 900);
  } catch { /* ingen lyd */ }
}
export function glimtChange(e) {
  const d52 = e.target.closest?.('[data-gs52-def]');
  if (d52) { saveDefault52(d52); return true; }
  const at = e.target.closest?.('[data-gs-at]');
  if (!at) return false;
  const k = at.dataset.gsAt, v = at.value;
  if (/^\d\d:\d\d$/.test(v)) saveGlimt({ briefs: { [k]: { ...gs().briefs[k], at: v } } });
  return true;
}
/** Lagre nøkkel (admin). */
export async function glimtSubmit(e, redraw) {
  const f = e.target.closest?.('[data-gs-key]');
  if (!f) return false;
  e.preventDefault();
  const id = f.dataset.gsKey, key = f.key.value.trim(), region = f.region?.value.trim();
  if (!key) { G.keyMsg[id] = { text: 'Skriv inn nøkkelen først.' }; redraw(); return true; }
  G.keyBusy = id; redraw();
  try {
    await api(`/ai/keys/${id}`, { method: 'PUT', json: { key, ...(id === 'azure' ? { region: region || undefined } : {}) } });
    G.keyMsg[id] = { text: 'Nøkkelen er lagret på serveren.', ok: true };
    await loadGlimt(null, true);
  } catch (err) { G.keyMsg[id] = { text: err.status === 404 ? 'Serveren støtter ikke dette ennå. Legg inn nøkkelen under AI → API og nøkler.' : err.message }; }
  G.keyBusy = '';
  redraw();
  return true;
}
