// Prompt 57 (WEB57): VoxCPM2-stemmer (lokal på Mac mini-en) – velge, lytte, lage fra beskrivelse, klone og slette.
//  - Innstillinger → Glimt (og ⚙ i briefen): seksjonen «Stemmer» (voicesHtml57) under STEMMEMOTOR i glimt35.js.
//    Stemme for Glimt (tts.voice) og egen stemme for nyhetsleseren (tts.newsVoice, tom = samme som Glimt).
//  - Stemmer per bruker: GET/POST /api/voices57, POST /api/voices57/:id/preview, DELETE /api/voices57/:id (SERVER57-API.md).
//    Kloning: MediaRecorder 10–30 s med en foreslått norsk lesetekst, eller en lydfil (5–60 s). Samtykke må krysses av.
//  - speak57(): opplesning for nyhetsleseren og «Les høyt» i chat via POST /api/tts (med voice). Lang tekst deles i biter
//    (serveren tar maks 1500 tegn). 503/404/feil → nettleserens speechSynthesis som før. Avspilt serverlyd merkes «KI-stemme».
//  - AI-kontroll: kortet «VoxCPM2 på Mac mini-en» (adresse/nøkkel/test, bare admin) legges rett etter [data-v54-ai].
import { api, esc } from './util.js';
import { store } from './store.js';
import { gs, saveGlimt, stopSpeak, VOICES } from './glimt35.js';

export const READ_TEXT57 = 'Det er en klar morgen her hjemme. Sola står lavt over fjorden, og båtene ligger stille ved kaia. Jeg tar en kopp kaffe, ser på været og planlegger dagen. Klokka åtte går bussen, og i kveld blir det fiskesuppe til middag. Etterpå leser jeg litt, før jeg legger meg tidlig.';
const readText = () => V.sample || READ_TEXT57; // serverens sampleText når den finnes
const DESIGN_EX = ['En rolig, varm kvinnestemme, middels tempo', 'En tydelig mannsstemme, litt dyp, nøytral', 'En glad og lett ung stemme, litt raskt tempo'];
const REC_MIN = 10, REC_MAX = 30;

const CSS = `
.v57{display:flex;flex-direction:column;gap:10px}
.v57-tag{display:inline-block;padding:1px 7px;border-radius:999px;font:700 10px var(--gb-mono,ui-monospace,monospace);background:var(--gs-chip,#efe9dc);color:var(--gs-mute,#6b665c);vertical-align:1px}
.v57-ai{font:600 10.5px var(--gb-mono,ui-monospace,monospace);letter-spacing:.06em;opacity:.75;margin-left:6px}
.v57-acts{display:flex;gap:6px;flex:none;align-items:center}
.v57-del{flex:none;height:30px;padding:0 10px;border-radius:15px;border:0;background:transparent;color:var(--gs-acc,#b23a2a);font:700 12px var(--gb-sans,system-ui);cursor:pointer}
.v57-box{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1.5px dashed var(--gs-line,#e6dfd1)}
.v57-box label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--gs-mute,#6b665c)}
.v57-box input[type=text],.v57-box textarea,.v57-sel{width:100%;box-sizing:border-box;min-height:40px;padding:8px 10px;border-radius:12px;border:1px solid var(--gs-line,#e6dfd1);background:var(--gs-chip,#efe9dc);color:var(--gs-ink,#1b1a17);font:500 13.5px var(--gb-sans,system-ui);outline:0}
.v57-box textarea{min-height:72px;resize:vertical;line-height:1.45}
.v57-box input:focus,.v57-box textarea:focus,.v57-sel:focus{border-color:var(--gs-sel,#1b1a17)}
.v57-box .v57-chk{flex-direction:row;align-items:flex-start;gap:8px;color:var(--gs-ink,#1b1a17);font-size:13px;line-height:1.4}
.v57-box .v57-chk input{margin-top:2px;flex:none;width:18px;height:18px}
.v57-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.v57-read{margin:0;padding:10px 12px;border-radius:12px;background:var(--gs-chip,#efe9dc);font:500 14px/1.55 var(--gb-serif,Georgia,serif)}
.v57-rec{display:inline-flex;align-items:center;gap:8px;font:600 13px var(--gb-mono,ui-monospace,monospace)}
.v57-rec i{width:10px;height:10px;border-radius:5px;background:#d2402c;animation:v57p 1s ease-in-out infinite}
@keyframes v57p{50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.v57-rec i{animation:none}}
.v57-chip{height:30px;padding:0 10px;border-radius:15px;border:1px solid var(--gs-line,#e6dfd1);background:transparent;color:inherit;font:600 12px var(--gb-sans,system-ui);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v57-adm input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid var(--line,#2a3142);background:transparent;color:inherit;font:500 13px var(--mono,'JetBrains Mono',monospace)}
.v57-adm .v57-form{display:grid;gap:8px;margin-top:8px}.v57-adm .v57-btns{display:flex;gap:8px;flex-wrap:wrap}
`;
function css() { if (!document.getElementById('v57-css')) { const s = document.createElement('style'); s.id = 'v57-css'; s.textContent = CSS; document.head.appendChild(s); } }

/* ---------------- Avspilling ----------------
   Sidens CSP har ingen media-src (faller tilbake til default-src 'self'), så <audio src="blob:…"> blokkeres. Lyden spilles
   derfor med Web Audio (decodeAudioData), som ikke er bundet av media-src. Uten Web Audio: vanlig Audio som reserve. */
let AC = null;
function actx() { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; AC = C ? new C() : null; } return AC; }
/** Spiller av en lydblob. → {done: Promise<'end'|'stop'|'err'>, stop()}. Kaster NotAllowedError når nettleseren krever et trykk. */
export async function playBlob57(blob) {
  const C = actx();
  if (!C) {
    const url = URL.createObjectURL(blob), a = new Audio(url);
    let fin; const done = new Promise((r) => { fin = (x) => { URL.revokeObjectURL(url); r(x); }; });
    a.onended = () => fin('end'); a.onerror = () => fin('err');
    await a.play();
    return { done, stop: () => { try { a.pause(); } catch { /* */ } fin('stop'); } };
  }
  if (C.state === 'suspended') await C.resume().catch(() => {});
  const buf = await C.decodeAudioData(await blob.arrayBuffer());
  if (C.state === 'suspended') throw Object.assign(new Error('Nettleseren venter på et trykk før lyd'), { name: 'NotAllowedError' });
  const src = C.createBufferSource(); src.buffer = buf; src.connect(C.destination);
  let fin; const done = new Promise((r) => { fin = r; });
  src.onended = () => fin('end');
  src.start();
  return { done, stop: () => { src.onended = null; try { src.stop(); } catch { /* */ } fin('stop'); } };
}
/** Lås opp lyd i et trykk (kalles synkront fra klikk før noe await). */
export function unlockAudio57() { try { const C = actx(); if (C?.state === 'suspended') C.resume().catch(() => {}); } catch { /* */ } }

/* ---------------- Stemmelista (per bruker) ---------------- */

const V = { list: null, engineReady: null, loading: null, err: '', unsupported: false, msg: null, busy: '', open: '', preview: null, clone: null, design: null };
export const voices57 = V;
const isVox = (s = gs()) => s.tts.engine === 'voxcpm';
const repaint = () => { for (const el of document.querySelectorAll('[data-v57]')) { el.innerHTML = inner(); } };

export function loadVoices57(force = false) {
  if (V.loading) return V.loading;
  if (V.list && !force) return Promise.resolve(V.list);
  V.loading = api('/voices57').then((r) => { V.list = Array.isArray(r?.voices) ? r.voices : []; V.engineReady = r?.engineReady ?? null; V.configured = r?.configured ?? null; V.sample = r?.sampleText || ''; V.consent = r?.consentText || ''; V.limits = r?.limits ?? null; V.err = ''; V.unsupported = false; })
    .catch((e) => { V.list = V.list ?? []; if (e.status === 404) V.unsupported = true; else V.err = e.message; })
    .finally(() => { V.loading = null; repaint(); });
  return V.loading;
}
export const voiceById57 = (id) => (V.list ?? []).find((v) => v.id === id) ?? null;
/** Visningsnavn for en VoxCPM-stemme (eller null). */
export const voiceName57 = (id) => voiceById57(id)?.name ?? null;

const KIND = { builtin: 'FERDIG', design: 'BESKRIVELSE', clone: 'KLONET' };
function voiceRow(v, sel) {
  const own = v.kind !== 'builtin';
  const sub = v.desc || (v.kind === 'clone' ? `Klonet stemme${v.createdAt ? ` · ${new Date(v.createdAt).toLocaleDateString('nb-NO')}` : ''}` : '');
  const playing = V.preview?.id === v.id;
  return `<div class="gs-opt gs-voice" aria-pressed="${sel === v.id}"><button type="button" class="gs-vb" data-v57-pick="${esc(v.id)}"><span class="gs-ot"><span class="gs-on"><b>${esc(v.name)}</b><span class="v57-tag">${KIND[v.kind] ?? esc(v.kind)}</span></span>${sub ? `<span class="gs-os">${esc(sub)}</span>` : ''}</span></button>
    <span class="v57-acts"><button type="button" class="gs-try" data-v57-try="${esc(v.id)}"${V.preview && !playing && V.preview.busy ? ' disabled' : ''}>${playing ? (V.preview.busy ? 'Lager …' : '■ Stopp') : '▶ Hør'}</button>${own ? `<button type="button" class="v57-del" data-v57-del="${esc(v.id)}" aria-label="Slett ${esc(v.name)}">Slett</button>` : ''}</span></div>`;
}
function newsSelect(s) {
  const cur = s.tts.newsVoice || '';
  const opts = isVox(s) ? (V.list ?? []).map((v) => [v.id, v.name]) : GLIMT_VOICES().map(([k, n]) => [k, n.split(' · ')[0]]);
  const known = !cur || opts.some(([k]) => k === cur);
  return `<label class="gs-seg-w"><span class="gs-seg-l"><b>Stemme for nyhetsleseren</b><span>${cur ? '' : 'Samme som Glimt'}</span></span>
    <select class="v57-sel" data-v57-news aria-label="Stemme for nyhetsleseren"><option value="">Samme som Glimt</option>${opts.map(([k, n]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}${known ? '' : `<option value="${esc(cur)}" selected>${esc(cur)} (finnes ikke lenger)</option>`}</select></label>`;
}
const GLIMT_VOICES = () => VOICES; // nora/henrik/lys (brukes bare ved kall, så den sirkulære importen er trygg)

function designBox() {
  const d = V.design;
  if (!d) return '';
  return `<form class="v57-box" data-v57-design><b>Lag stemme fra beskrivelse</b>
    <label>Navn<input type="text" name="name" maxlength="40" value="${esc(d.name)}" placeholder="F.eks. Morgenstemme" autocomplete="off" required></label>
    <label>Beskrivelse (alder, kjønn, klang, tempo, stemning)<textarea name="prompt" maxlength="300" placeholder="${esc(DESIGN_EX[0])}" required>${esc(d.prompt)}</textarea></label>
    <div class="v57-row">${DESIGN_EX.map((x, i) => `<button type="button" class="v57-chip" data-v57-ex="${i}">${esc(x)}</button>`).join('')}</div>
    <div class="v57-row"><button type="submit" class="gs-pill dark"${V.busy === 'design' ? ' disabled' : ''}>${V.busy === 'design' ? 'Lager …' : 'Lag stemmen'}</button><button type="button" class="gs-pill" data-v57-close>Avbryt</button></div>
    <p class="gs-note">VoxCPM2 lager en ny stemme ut fra beskrivelsen. Ikke beskriv en bestemt, kjent person.</p></form>`;
}
const canRec = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function cloneBox() {
  const c = V.clone;
  if (!c) return '';
  const recState = c.rec ? `<span class="v57-rec" role="status"><i></i>Tar opp · ${c.secs} s${c.secs < REC_MIN ? ` (minst ${REC_MIN} s)` : ` av maks ${REC_MAX} s`}</span><button type="button" class="gs-pill dark" data-v57-recstop>■ Stopp</button>`
    : `<button type="button" class="gs-pill dark" data-v57-rec${canRec() ? '' : ' disabled'}>● ${c.blob && c.src === 'rec' ? 'Ta opp på nytt' : 'Start opptak'}</button>${canRec() ? '' : `<span class="gs-note">${window.isSecureContext ? 'Nettleseren kan ikke ta opp lyd her.' : 'Opptak krever https. Last opp en fil i stedet.'}</span>`}`;
  const have = c.blob ? `<div class="v57-row"><span class="gs-note">${c.src === 'rec' ? `Opptak · ${c.dur} s` : `Fil · ${esc(c.fileName ?? '')}`}</span><button type="button" class="gs-try" data-v57-play>${c.playing ? '■ Stopp' : '▶ Lytt'}</button></div>` : '';
  return `<form class="v57-box" data-v57-clone><b>Klon en stemme</b>
    <div class="gs-seg" role="group" aria-label="Kilde"><button type="button" data-v57-src="rec" aria-pressed="${c.mode === 'rec'}">Ta opp</button><button type="button" data-v57-src="file" aria-pressed="${c.mode === 'file'}">Last opp fil</button></div>
    ${c.mode === 'rec' ? `<p class="gs-note">Les teksten under høyt i et stille rom, ${REC_MIN}–${REC_MAX} sekunder, med vanlig stemme.</p><p class="v57-read">${esc(readText())}</p><div class="v57-row">${recState}</div>`
      : `<label>Lydfil (5–60 sekunder, én person som snakker)<input type="file" name="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" data-v57-file></label>`}
    ${have}
    <label>Navn<input type="text" name="name" maxlength="40" value="${esc(c.name)}" placeholder="F.eks. Min stemme" autocomplete="off" required></label>
    <label>Transkripsjon (nøyaktig det som sies – gir bedre kloning)<textarea name="transcript" maxlength="1200" data-v57-tr placeholder="Valgfritt">${esc(c.transcript)}</textarea></label>
    <label class="v57-chk"><input type="checkbox" name="consent" data-v57-consent${c.consent ? ' checked' : ''}><span>${esc((V.consent || 'Dette er min egen stemme, eller jeg har samtykke fra personen').replace(/\.?$/, '.'))}</span></label>
    <div class="v57-row"><button type="submit" class="gs-pill dark"${V.busy === 'clone' || !c.blob || !c.consent || c.rec ? ' disabled' : ''}>${V.busy === 'clone' ? 'Lagrer …' : 'Lagre stemmen'}</button><button type="button" class="gs-pill" data-v57-close>Avbryt</button></div>
    <p class="gs-note">Ikke klon offentlige personer eller noen som ikke har sagt ja. Opptaket lagres bare på serveren i huset og sendes til Mac mini-en ved bruk – aldri ut av huset. Bare du ser og bruker stemmen, og du kan slette den når som helst.</p></form>`;
}
function inner() {
  const s = gs();
  if (!isVox(s)) return `${newsSelect(s)}<p class="gs-note">Velg <b>VoxCPM2 (Mac mini, lokal)</b> som stemmemotor for å lage egne stemmer fra en beskrivelse eller klone en stemme.</p>`;
  if (V.list === null && !V.unsupported) { loadVoices57(); return '<p class="gs-note">Henter stemmer …</p>'; }
  if (V.unsupported) return '<p class="gs-note">Serveren støtter ikke VoxCPM-stemmer ennå.</p>';
  const L = V.list ?? [], sel = s.tts.voice;
  const st = V.configured === false ? '<p class="gs-msg">VoxCPM2 på Mac mini-en er ikke satt opp ennå (administrator: AI → Tale til tekst). Du kan lage stemmer nå; de brukes når den er klar.</p>'
    : V.engineReady === false ? '<p class="gs-msg">VoxCPM2 på Mac mini-en svarer ikke nå. Opplesningen bruker neste motor eller nettleserens stemme til den er tilbake.</p>' : '';
  const groups = [['builtin', 'Ferdige stemmer'], ['own', 'Mine stemmer']].map(([k, n]) => {
    const g = L.filter((v) => (k === 'builtin' ? v.kind === 'builtin' : v.kind !== 'builtin'));
    if (!g.length && k === 'builtin') return '';
    return `<span class="gs-os">${n}</span>${g.length ? `<div class="gs-opts">${g.map((v) => voiceRow(v, sel)).join('')}</div>` : '<p class="gs-note">Ingen ennå.</p>'}`;
  }).join('');
  const msg = V.msg ? `<p class="gs-msg${V.msg.ok ? ' ok' : ''}" role="status">${esc(V.msg.text)}</p>` : V.err ? `<p class="gs-msg">${esc(V.err)}</p>` : '';
  const btns = V.design || V.clone ? '' : '<div class="v57-row"><button type="button" class="gs-pill" data-v57-open="design">✦ Lag stemme fra beskrivelse</button><button type="button" class="gs-pill" data-v57-open="clone">● Klon en stemme</button></div>';
  return `${st}${groups}${msg}${btns}${designBox()}${cloneBox()}${newsSelect(s)}
    <p class="gs-note">VoxCPM2 (OpenBMB, Apache-2.0) kjører på Mac mini-en i huset. Lyden er KI-generert og merkes «KI-stemme» der den spilles av.</p>`;
}
/** Seksjonen «Stemmer» (glimt35.js setter den inn i innstillingene). */
export function voicesHtml57() { css(); return `<div class="v57" data-v57>${inner()}</div>`; }

/* ---------------- Lytt (preview) ---------------- */

function stopPreview() {
  const p = V.preview;
  if (!p) return;
  p.ctl?.abort();
  p.h?.stop();
  V.preview = null;
}
async function preview(id) {
  unlockAudio57();
  if (V.preview?.id === id) { stopPreview(); repaint(); return; }
  stopPreview(); stop57(); stopSpeak();
  const ctl = new AbortController(), p = { id, busy: true, ctl };
  V.preview = p; V.msg = null; repaint();
  try {
    const lang = gs().tts.lang === 'en' ? 'en' : 'no';
    const r = await fetch(`/api/voices57/${encodeURIComponent(id)}/preview`, { method: 'POST', credentials: 'same-origin', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lang === 'en' ? "Hi, I'm Glimt. This is how I sound." : 'Hei, jeg er Glimt. Slik høres jeg ut.' }) });
    const ct = r.headers.get('content-type') ?? '';
    if (!r.ok || !/audio|octet/.test(ct)) { const j = /json/.test(ct) ? await r.json().catch(() => ({})) : {}; throw new Error(j.error || (r.status === 503 ? 'VoxCPM2 på Mac mini-en svarer ikke.' : `Feil ${r.status}`)); }
    const b = await r.blob();
    if (V.preview !== p) return;
    const h = await playBlob57(b);
    if (V.preview !== p) { h.stop(); return; }
    p.h = h; p.busy = false; repaint();
    h.done.then(() => { if (V.preview === p) { V.preview = null; repaint(); } });
  } catch (e) {
    if (e?.name === 'AbortError' || V.preview !== p) return;
    stopPreview(); V.msg = { text: e?.name === 'NotAllowedError' ? 'Nettleseren blokkerte lyden. Trykk ▶ Hør igjen.' : `Kunne ikke spille av: ${e.message}` }; repaint();
  }
}

/* ---------------- Opptak (MediaRecorder) ---------------- */

const REC = { mr: null, stream: null, chunks: [], t0: 0, tick: 0 };
async function recStart() {
  const c = V.clone;
  if (!c || c.rec) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { V.msg = { text: e?.name === 'NotAllowedError' ? 'Mikrofonen er blokkert. Gi Homelab lov i nettleserens innstillinger for nettstedet.' : 'Fikk ikke tilgang til mikrofonen.' }; repaint(); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  Object.assign(REC, { mr, stream, chunks: [], t0: Date.now() });
  mr.ondataavailable = (e) => { if (e.data?.size) REC.chunks.push(e.data); };
  mr.onstop = recDone;
  mr.start(250);
  c.ph?.stop();
  Object.assign(c, { rec: true, secs: 0, blob: null, src: 'rec' });
  V.msg = null;
  REC.tick = setInterval(() => { c.secs = Math.floor((Date.now() - REC.t0) / 1000); if (c.secs >= REC_MAX) recStop(); else repaint(); }, 500);
  repaint();
}
function recStop() { clearInterval(REC.tick); try { REC.mr?.stop(); } catch { recDone(); } }
function recDone() {
  clearInterval(REC.tick);
  REC.stream?.getTracks().forEach((t) => t.stop());
  const c = V.clone, mime = REC.mr?.mimeType || 'audio/webm', dur = Math.round((Date.now() - REC.t0) / 1000);
  const blob = new Blob(REC.chunks, { type: mime });
  Object.assign(REC, { mr: null, stream: null, chunks: [] });
  if (!c) return;
  c.rec = false;
  if (dur < REC_MIN || blob.size < 2000) { c.blob = null; V.msg = { text: `For kort opptak (${dur} s). Les hele teksten – minst ${REC_MIN} sekunder.` }; repaint(); return; }
  c.blob = blob; c.dur = dur; c.fileName = `opptak.${/mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'}`;
  if (!c.transcript) c.transcript = readText();
  repaint();
}
async function playClone() {
  const c = V.clone;
  if (!c?.blob) return;
  unlockAudio57();
  if (c.ph) { c.ph.stop(); return; }
  stopPreview(); stop57();
  try {
    const h = await playBlob57(c.blob);
    c.ph = h; c.playing = true; repaint();
    await h.done;
  } catch (e) { V.msg = { text: e?.name === 'NotAllowedError' ? 'Nettleseren blokkerte lyden. Trykk ▶ Lytt igjen.' : 'Kunne ikke spille av opptaket her (formatet kan likevel fungere på serveren).' }; }
  if (V.clone === c) { c.ph = null; c.playing = false; repaint(); }
}
function closeBoxes() {
  if (V.clone?.rec) { V.clone = null; recStop(); }
  V.clone?.ph?.stop();
  V.clone = null; V.design = null;
}

/* ---------------- Hendelser (delegert; fungerer både i Innstillinger og i ⚙-arket i briefen) ---------------- */

function readForm(f) {
  if (V.design && f.matches('[data-v57-design]')) { V.design.name = f.name.value; V.design.prompt = f.prompt.value; }
  if (V.clone && f.matches('[data-v57-clone]')) { V.clone.name = f.name.value; V.clone.transcript = f.transcript.value; V.clone.consent = !!f.consent.checked; }
}
function pick(id, field = 'voice') { saveGlimt({ tts: { [field]: id } }); repaint(); }

document.addEventListener('click', (e) => {
  const t = e.target, root = t.closest?.('[data-v57]');
  if (!root) return;
  const f = t.closest('form'); if (f) readForm(f);
  // Våre knapper skal ikke også nå innstillingene/briefen (de tegner ellers på nytt midt i et opptak).
  if (t.closest('button[data-v57-pick],button[data-v57-try],button[data-v57-del],button[data-v57-open],button[data-v57-close],button[data-v57-ex],button[data-v57-src],button[data-v57-rec],button[data-v57-recstop]')) e.stopPropagation();
  let el;
  if ((el = t.closest('[data-v57-pick]'))) { e.stopPropagation(); pick(el.dataset.v57Pick); return; }
  if ((el = t.closest('[data-v57-try]'))) { e.stopPropagation(); preview(el.dataset.v57Try); return; }
  if ((el = t.closest('[data-v57-del]'))) { e.stopPropagation(); del(el.dataset.v57Del); return; }
  if ((el = t.closest('[data-v57-open]'))) {
    closeBoxes(); V.msg = null;
    if (el.dataset.v57Open === 'design') V.design = { name: '', prompt: '' };
    else V.clone = { mode: canRec() ? 'rec' : 'file', name: '', transcript: '', consent: false, blob: null, rec: false, secs: 0 };
    repaint(); return;
  }
  if (t.closest('[data-v57-close]')) { closeBoxes(); V.msg = null; repaint(); return; }
  if ((el = t.closest('[data-v57-ex]'))) { if (V.design) { V.design.prompt = DESIGN_EX[+el.dataset.v57Ex] ?? ''; repaint(); } return; }
  if ((el = t.closest('[data-v57-src]'))) {
    const c = V.clone; if (!c || c.rec) return;
    c.mode = el.dataset.v57Src;
    c.ph?.stop();
    Object.assign(c, { blob: null, fileName: '' });
    if (c.mode === 'file' && c.transcript === readText()) c.transcript = '';
    repaint(); return;
  }
  if (t.closest('[data-v57-play]')) { playClone(); return; }
  if (t.closest('[data-v57-rec]')) { recStart(); return; }
  if (t.closest('[data-v57-recstop]')) { recStop(); return; }
}, true);
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.closest?.('[data-v57]')) return;
  e.stopPropagation();
  if (t.matches('[data-v57-news]')) { saveGlimt({ tts: { newsVoice: t.value || null } }); repaint(); return; }
  if (t.matches('[data-v57-consent]') && V.clone) { readForm(t.form); repaint(); return; }
  if (t.matches('[data-v57-file]') && V.clone) {
    readForm(t.form);
    const file = t.files?.[0], c = V.clone;
    c.ph?.stop();
    if (!file) { c.blob = null; repaint(); return; }
    const maxB = V.limits?.maxBytes ?? 20 * 1024 * 1024;
    if (file.size > maxB) { V.msg = { text: `Fila er for stor (maks ${Math.round(maxB / 1048576)} MB).` }; repaint(); return; }
    Object.assign(c, { blob: file, src: 'file', fileName: file.name });
    V.msg = null; repaint();
  }
}, true);
document.addEventListener('input', (e) => { const f = e.target.closest?.('[data-v57] form'); if (f) readForm(f); }, true);
document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-v57] form');
  if (!f) return;
  e.preventDefault(); e.stopPropagation();
  readForm(f);
  if (f.matches('[data-v57-design]')) return createDesign();
  if (f.matches('[data-v57-clone]')) return createClone();
}, true);

async function createDesign() {
  const d = V.design;
  if (!d?.name.trim() || !d.prompt.trim()) { V.msg = { text: 'Skriv både navn og beskrivelse.' }; repaint(); return; }
  V.busy = 'design'; V.msg = null; repaint();
  try {
    const r = await api('/voices57', { method: 'POST', json: { name: d.name.trim(), kind: 'design', prompt: d.prompt.trim() } });
    V.design = null; V.msg = { text: `«${d.name.trim()}» er laget. Trykk ▶ Hør for å lytte.`, ok: true };
    await loadVoices57(true);
    const id = r?.voice?.id ?? r?.id; if (id) pick(id);
  } catch (err) { V.msg = { text: err.message }; }
  V.busy = ''; repaint();
}
async function createClone() {
  const c = V.clone;
  if (!c?.blob) { V.msg = { text: 'Ta opp eller velg en lydfil først.' }; repaint(); return; }
  if (!c.consent) { V.msg = { text: 'Kryss av for samtykke før stemmen kan lagres.' }; repaint(); return; }
  if (!c.name.trim()) { V.msg = { text: 'Gi stemmen et navn.' }; repaint(); return; }
  V.busy = 'clone'; V.msg = null; repaint();
  try {
    const fd = new FormData();
    fd.append('name', c.name.trim()); fd.append('kind', 'clone'); fd.append('consent', 'true');
    if (c.transcript.trim()) fd.append('transcript', c.transcript.trim());
    fd.append('file', c.blob, c.fileName || 'stemme.webm');
    const r = await fetch('/api/voices57', { method: 'POST', body: fd, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Feil ${r.status}`);
    const name = c.name.trim();
    closeBoxes(); V.msg = { text: `«${name}» er lagret. Trykk ▶ Hør for å lytte.`, ok: true };
    await loadVoices57(true);
    const id = j?.voice?.id ?? j?.id; if (id) pick(id);
  } catch (err) { V.msg = { text: err.message }; }
  V.busy = ''; repaint();
}
async function del(id) {
  const v = voiceById57(id);
  if (!v || !confirm(`Slette stemmen «${v.name}»? ${v.kind === 'clone' ? 'Opptaket slettes fra serveren og Mac mini-en.' : ''}`.trim())) return;
  if (V.preview?.id === id) stopPreview();
  try {
    await api(`/voices57/${encodeURIComponent(id)}`, { method: 'DELETE' });
    V.list = (V.list ?? []).filter((x) => x.id !== id);
    const s = gs(), first = V.list.find((x) => x.kind === 'builtin')?.id ?? null, patch = {};
    if (s.tts.voice === id && first) patch.voice = first;
    if (s.tts.newsVoice === id) patch.newsVoice = null;
    if (Object.keys(patch).length) saveGlimt({ tts: patch });
    V.msg = { text: `«${v.name}» er slettet.`, ok: true };
    loadVoices57(true);
  } catch (err) { V.msg = { text: err.message }; }
  repaint();
}

/** Når motoren byttes: velg en stemme som passer motoren (VoxCPM-id ↔ nora/henrik/lys). */
export async function engineSwitched57(engine) {
  const builtin = (ids) => GLIMT_VOICES().some(([k]) => k === ids);
  if (engine === 'voxcpm') await loadVoices57();
  const s = gs(); // etter lastingen: brukeren kan ha valgt noe i mellomtiden
  if (s.tts.engine !== engine) return;
  if (engine === 'voxcpm') {
    const L = V.list ?? [], has = (id) => L.some((v) => v.id === id), first = L.find((v) => v.kind === 'builtin')?.id ?? L[0]?.id;
    const patch = {};
    if (first && !has(s.tts.voice)) patch.voice = first;
    if (s.tts.newsVoice && !has(s.tts.newsVoice)) patch.newsVoice = null;
    if (Object.keys(patch).length) saveGlimt({ tts: patch });
  } else {
    const patch = {};
    if (!builtin(s.tts.voice)) patch.voice = 'nora';
    if (s.tts.newsVoice && !builtin(s.tts.newsVoice)) patch.newsVoice = null;
    if (Object.keys(patch).length) saveGlimt({ tts: patch });
  }
  repaint();
}

/* ---------------- Opplesning for nyhetsleseren og chat ---------------- */

const P = { seq: 0, h: null, ctl: null, state: 'idle', onState: null };
export const speak57State = P;
// VoxCPM på Mac mini-en lager lyd tregere enn sanntid: første bit er én kort setning (lyden starter etter noen sekunder), resten
// små biter som lages mens forrige spilles. Sky-stemmene tåler store biter, men små biter skader ikke.
const MAXC = 420, FIRSTC = 160;
/** Deler teksten i biter på maks MAXC tegn (første maks FIRSTC), helst ved setningsslutt. */
export function chunks57(text, max = MAXC, first = Math.min(FIRSTC, max)) {
  const all = chunksOf57(text, max);
  if (!all.length || all[0].length <= first) return all;
  const head = chunksOf57(all[0], first);
  return [head[0], ...chunksOf57(head.slice(1).join(' ') + ' ' + all.slice(1).join(' '), max)].filter(Boolean);
}
function chunksOf57(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const sents = t.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [t], out = [];
  let cur = '';
  for (let s of sents) {
    while (s.length > max) { const cut = s.lastIndexOf(' ', max) > max / 2 ? s.lastIndexOf(' ', max) : max; if (cur) { out.push(cur.trim()); cur = ''; } out.push(s.slice(0, cut).trim()); s = s.slice(cut); }
    if ((cur + s).length > max) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function setState(st, extra = {}) { P.state = st; try { P.onState?.(st, extra); } catch { /* */ } }
export function stop57() {
  P.seq++;
  P.ctl?.abort(); P.ctl = null;
  if (P.h) { P.h.stop(); P.h = null; }
  try { window.speechSynthesis?.cancel(); } catch { /* */ }
  if (P.state !== 'idle') { const cb = P.onState; setState('idle'); if (P.onState === cb) P.onState = null; }
}
async function fetchChunk(text, voice, lang, rate, seq, purpose) {
  const ctl = new AbortController(); P.ctl = ctl;
  const r = await fetch('/api/tts', { method: 'POST', credentials: 'same-origin', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, character: 'glimt', voice, rate, lang, purpose }) });
  if (seq !== P.seq) return null;
  const ct = r.headers.get('content-type') ?? '';
  if (r.ok && /audio|octet/.test(ct)) return { blob: await r.blob(), engine: r.headers.get('x-tts-engine') ?? '' };
  return { fail: r.status };
}
function browserSay(text, lang, seq) {
  const S = window.speechSynthesis;
  if (!S) { setState('idle'); return; }
  try {
    S.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-GB' : 'nb-NO'; u.rate = 1;
    const v = S.getVoices().find((x) => (lang === 'en' ? /^en-(GB|US)/i : /^(nb|no|nn)/i).test(x.lang)); if (v) u.voice = v;
    u.onend = u.onerror = () => { if (seq === P.seq) setState('idle'); };
    setState('browser');
    S.speak(u);
  } catch { setState('idle'); }
}
/**
 * Leser opp tekst med valgt stemme. purpose 'news' bruker tts.newsVoice (eller Glimt-stemmen), ellers tts.voice.
 * onState(state): 'loading' | 'ai' (serverlyd, KI-stemme) | 'browser' (nettleserens stemme) | 'idle' (ferdig/stoppet).
 */
export async function speak57(text, { purpose = 'chat', lang, onState } = {}) {
  unlockAudio57();
  stop57(); stopSpeak(); stopPreview();
  const s = gs(), seq = P.seq, L = lang === 'en' || lang === 'no' ? lang : s.tts.lang === 'en' ? 'en' : 'no';
  const voice = (purpose === 'news' && s.tts.newsVoice) || s.tts.voice, rate = s.tts.rate, apiPurpose = purpose === 'news' ? 'news' : 'glimt';
  P.onState = onState ?? null;
  const parts = chunks57(text);
  if (!parts.length) return;
  if (s.tts.engine === 'browser') return browserSay(parts.join(' '), L, seq);
  setState('loading');
  let next = fetchChunk(parts[0], voice, L, rate, seq, apiPurpose).catch((e) => (e?.name === 'AbortError' ? null : { fail: 0 }));
  for (let i = 0; i < parts.length; i++) {
    const got = await next;
    if (seq !== P.seq || !got) return;
    if (got.fail !== undefined) { browserSay(parts.slice(i).join(' '), L, seq); return; } // 503/404/feil: resten i nettleseren
    next = i + 1 < parts.length ? fetchChunk(parts[i + 1], voice, L, rate, seq, apiPurpose).catch((e) => (e?.name === 'AbortError' ? null : { fail: 0 })) : null;
    let h;
    try { h = await playBlob57(got.blob); } catch (e) { if (seq !== P.seq) return; if (e?.name === 'NotAllowedError') { setState('idle', { needTap: true }); return; } browserSay(parts.slice(i).join(' '), L, seq); return; }
    if (seq !== P.seq) { h.stop(); return; }
    P.h = h;
    setState('ai', { engine: got.engine });
    const how = await h.done;
    if (seq !== P.seq) return;
    P.h = null;
    if (how === 'err') { if (i + 1 < parts.length) browserSay(parts.slice(i + 1).join(' '), L, seq); else setState('idle'); return; }
  }
  if (seq === P.seq) setState('idle');
}
/** Liten merkelapp for avspilt serverlyd. */
export const aiTag57 = () => '<span class="v57-ai" title="Lyden er laget av en KI-stemme">KI-stemme</span>';
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop57(); stopPreview(); } });

/* ---------------- AI-kontroll › VoxCPM2 på Mac mini-en (bare admin) ---------------- */

const A = { cfg: null, health: null, at: 0, busy: false, msg: '' };
const isAdmin = () => store.me?.me?.role === 'admin';
const HST = { ok: 'Svarer', loaded: 'Svarer · modellen er lastet', idle: 'Svarer · modellen er lastet ut (lastes ved bruk)', starting: 'Laster modellen', down: 'Svarer ikke', auth: 'Nøkkel eller IP avvist', error: 'Feil', off: 'Ikke satt opp' };
async function loadAdmin(force = false) {
  if (!force && A.at && Date.now() - A.at < 30_000) return;
  A.at = Date.now();
  const [h, c] = await Promise.all([fetch(`/api/admin/voxcpm57/health${force ? '?fresh=1' : ''}`, { credentials: 'same-origin' }), fetch('/api/admin/voxcpm57/config', { credentials: 'same-origin' })].map((p) => p.then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  A.health = h; A.cfg = c;
}
function healthText(H) {
  const h = H?.voxcpm ?? H;
  if (!h) return 'Laster …';
  const st = h.ok && h.status === 'ok' && h.loaded != null ? (h.loaded ? 'loaded' : 'idle') : h.status ?? (h.ok ? 'ok' : 'down');
  const bits = [HST[st] ?? st];
  if (h.model) bits.push(`${h.model}${h.engine ? ` (${[({ gguf: 'GGUF · llama.cpp', torch: 'PyTorch' })[h.engine] ?? h.engine, h.quant].filter(Boolean).join(' ')})` : ''}`);
  if (h.device) bits.push({ mps: 'MPS (Apple)', cpu: 'CPU', cuda: 'CUDA', metal: 'Metal (llama.cpp)' }[h.device] ?? h.device);
  if (h.memoryMb) bits.push(`${Math.round(h.memoryMb)} MB minne`);
  if (h.idleUnloadMin) bits.push(`lastes ut etter ${h.idleUnloadMin} min uten bruk`);
  if (h.ok && h.ms != null) bits.push(`${h.ms} ms`);
  if (h.error && !h.ok) bits.push(h.error);
  return bits.join(' · ');
}
function adminHtml(row = false) {
  if (!A.cfg) return row ? '<span class="ac-mut">Laster …</span>' : '';
  const c = A.cfg, n = A.health?.voices ?? null;
  if (row) { // prompt 65: innholdet i raden «VoxCPM2» i AI → Tjenester
    return `${n ? `<p class="ac-note">${esc(`Egne stemmer: ${n.clones ?? 0} klonet og ${n.designs ?? 0} fra beskrivelse, hos ${n.users ?? 0} ${n.users === 1 ? 'bruker' : 'brukere'}`)}</p>` : ''}
      ${c.urlError ? `<p class="ac-note bad" role="alert">${esc(c.urlError)}</p>` : ''}
      <form class="ac-form" data-v57-adm>
        <label class="ac-f"><span>Adresse</span><input name="url" value="${esc(c.url ?? '')}" placeholder="http://10.69.1.173:8030" autocomplete="off" spellcheck="false" aria-label="Adressen til VoxCPM (i huset)"></label>
        <label class="ac-f"><span>Nøkkel${c.keySet ? ' <i class="ac-tg">SATT</i>' : ''}</span><input name="key" type="password" value="" placeholder="${c.keySet ? 'Lagret – skriv en ny for å bytte' : 'Nøkkelen tools/voxcpm/install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel"></label>
        <div class="ac-btns"><button type="submit" class="ac-b ink"${A.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-v57-atest${A.busy || !c.url ? ' disabled' : ''}>Test</button><button type="button" class="ac-b line" data-v57-afresh>Sjekk nå</button></div>
        ${A.msg ? `<span class="ac-mut" role="status">${esc(A.msg)}</span>` : ''}
      </form><p class="ac-note">Tekst til tale. Installer på Mac mini-en: <span class="ac-mono">tools/voxcpm/install.sh</span> (docs/voxcpm-57.md). Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri. Administrator ser bare antall stemmer, aldri andres opptak.</p>`;
  }
  return `<div class="ac-card v57-adm" style="margin-top:10px;padding:12px 14px">
      <b>VoxCPM2 på Mac mini-en (tekst til tale)</b>
      <div class="ac-mut">${esc(healthText(A.health))}</div>
      ${n ? `<div class="ac-mut">${esc(`Egne stemmer: ${n.clones ?? 0} klonet og ${n.designs ?? 0} fra beskrivelse, hos ${n.users ?? 0} ${n.users === 1 ? 'bruker' : 'brukere'}`)}</div>` : ''}
      ${c.urlError ? `<div class="ac-mut" role="alert">${esc(c.urlError)}</div>` : ''}
      <form class="v57-form" data-v57-adm>
        <input name="url" value="${esc(c.url ?? '')}" placeholder="http://10.69.1.173:8030" autocomplete="off" spellcheck="false" aria-label="Adressen til VoxCPM (i huset)">
        <input name="key" type="password" value="" placeholder="${c.keySet ? 'Nøkkel er lagret – skriv en ny for å bytte' : 'Nøkkelen tools/voxcpm/install.sh skrev ut'}" autocomplete="new-password" aria-label="Nøkkel">
        <div class="v57-btns"><button type="submit" class="ac-b ink"${A.busy ? ' disabled' : ''}>Lagre</button><button type="button" class="ac-b line" data-v57-atest${A.busy || !c.url ? ' disabled' : ''}>Test</button><button type="button" class="ac-b line" data-v57-afresh>Sjekk nå</button></div>
        ${A.msg ? `<span class="ac-mut" role="status">${esc(A.msg)}</span>` : ''}
      </form>
      <div class="ac-note">Installer på Mac mini-en: <span class="ac-mono">tools/voxcpm/install.sh</span> (se docs/voxcpm-57.md). Bare adresser i huset godtas; nøkkelen lagres kryptert og vises aldri. Administrator ser bare antall stemmer, aldri andres opptak.</div></div>`;
}
const repaintAdm = () => { for (const el of document.querySelectorAll('[data-v57-ai]')) el.innerHTML = adminHtml(el.dataset.v57Ai === 'row'); document.dispatchEvent(new Event('ac:redraw')); };
/** Prompt 65: status for raden «VoxCPM2» i AI → Tjenester. */
export function voxStatus57() {
  if (!isAdmin()) return { dot: 'off', text: 'Bare administrator', admin: false };
  if (!A.cfg && !A.health) return { dot: 'off', text: 'Laster …', admin: true };
  const h = A.health?.voxcpm ?? A.health;
  return { dot: !A.cfg?.url ? 'off' : h?.ok ? 'ok' : h?.status === 'starting' ? 'warn' : 'bad', text: A.cfg?.url ? healthText(A.health) : 'Ikke satt opp', admin: true, url: A.cfg?.url ?? '' };
}
export const loadVox57 = () => (isAdmin() ? loadAdmin().then(() => document.dispatchEvent(new Event('ac:redraw'))) : Promise.resolve());
async function decorateAdm() {
  if (!isAdmin()) return;
  let added = false;
  for (const el of document.querySelectorAll('[data-v57-ai="row"]:not([data-v57-done])')) { el.dataset.v57Done = '1'; added = true; }
  for (const el of document.querySelectorAll('[data-v54-ai=""]')) { // prompt 65: bare det gamle «Tale til tekst»-kortet får VoxCPM-kortet etter seg
    if (el.nextElementSibling?.matches?.('[data-v57-ai]')) continue;
    const d = document.createElement('div'); d.dataset.v57Ai = ''; el.after(d); added = true;
  }
  if (!added) return;
  css(); repaintAdm();
  await loadAdmin(); repaintAdm();
}
document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('[data-v57-adm]');
  if (!f) return;
  e.preventDefault();
  const body = { url: f.url.value.trim() };
  if (f.key.value.trim()) body.key = f.key.value.trim();
  A.busy = true; A.msg = 'Lagrer …'; repaintAdm();
  try {
    const r = await fetch('/api/admin/voxcpm57/config', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    A.msg = r.ok ? 'Lagret. Sjekker Mac mini-en …' : j.error || `Feil ${r.status}`;
    if (r.ok) { A.cfg = { ...A.cfg, ...j }; setTimeout(async () => { await loadAdmin(true); A.msg = ''; repaintAdm(); V.list = null; }, 1800); }
  } catch (err) { A.msg = err.message; }
  A.busy = false; repaintAdm();
});
document.addEventListener('click', async (e) => {
  if (e.target.closest?.('[data-v57-afresh]')) { await loadAdmin(true); repaintAdm(); return; }
  if (!e.target.closest?.('[data-v57-atest]')) return;
  A.busy = true; A.msg = 'Tester (kort setning – første gang lastes modellen, det kan ta litt tid) …'; repaintAdm();
  try {
    const j = await fetch('/api/admin/voxcpm57/test', { method: 'POST', credentials: 'same-origin' }).then((r) => r.json());
    A.msg = j.ok ? `OK på ${j.ms} ms${j.bytes ? ` · ${Math.round(j.bytes / 1024)} kB lyd` : ''}${j.contentType ? ` (${j.contentType})` : ''}` : `Feilet: ${j.error ?? 'ukjent feil'}`;
  } catch (err) { A.msg = err.message; }
  A.busy = false; repaintAdm();
});
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorateAdm(); }); };
function boot() { css(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); schedule(); }
if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
