// Prompt 53 (FERMION53): Phonon (Fermion Research, CC-BY-4.0) som tale→tekst på Mac mini-en, for POST /api/voice53/transcribe (DAL53).
// `fermion serve phonon-2.5` (OpenAI-kompatibel /v1/audio/transcriptions) bak vakten i tools/fermion/guard.py (LAN, IP-filter, nøkkel).
// Formen er beskrevet i SERVER53-API.md (seksjon FERMION53). Lyden går bare til Mac mini-en i huset og logges aldri.
//
// Språk: Phonon-2 og Phonon-2.5 English er bare engelsk. Phonon-2.5 er 25 språk (samme liste som NVIDIAs parakeet-tdt-0.6b-v3,
// som modellen er avledet av). NORSK ER IKKE MED (dansk og svensk er med). Phonon ignorerer `language` og gjenkjenner språket selv,
// så språket sjekkes her: nb/nn/no gir 'unsupported_language'.
import { phononConf53 } from './config.js';
import { fermionFetch53, markDown53, phononReady53, flagOnPhonon53, state53, probe53 } from './health.js';

export const PHONON25_LANGS53 = ['bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk'];
export const MAX_AUDIO_BYTES53 = 200 * 1024 * 1024; // samme grense som vakten
const LABEL = { 'phonon-2.5': 'Phonon-2.5 (Mac mini)', 'phonon-2': 'Phonon-2 (Mac mini)', 'phonon-2.5-en': 'Phonon-2.5 English (Mac mini)' };

/** Modellen som faktisk kjører: fra /health (profile), ellers innstillingen. */
export function phononModel53() {
  const p = String(state53('phonon').info?.profile ?? '');
  if (p === 'five-value-25') return 'phonon-2.5';
  if (p === 'five-value-25-en') return 'phonon-2.5-en';
  if (p === 'five-value') return 'phonon-2';
  return phononConf53()?.model ?? 'phonon-2.5';
}
export const phononLanguages53 = (model = phononModel53()) => (model === 'phonon-2.5' ? [...PHONON25_LANGS53] : ['en']);
/** 'nb-NO' → 'nb'. Norsk (no/nb/nn) er aldri støttet. Tomt språk = modellen gjenkjenner selv (true). */
export function phononSupports53(lang, model = phononModel53()) {
  const l = String(lang ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!l || l === 'auto') return true;
  return phononLanguages53(model).includes(l);
}

const asrErr = (code, message, status) => Object.assign(new Error(message), { code, status });
const sec = (v) => (Number.isFinite(+v) ? Math.round(+v * 1000) / 1000 : null);

/**
 * Lyd → tekst med ordtider. Se SERVER53-API.md.
 * → {text, words:[{word,start,end}], segments:[{start,end,text}], duration, language, engine:'phonon', model, ms}
 */
export async function transcribePhonon53(audio, { mime = 'audio/wav', filename = 'lyd.wav', language = null, hotwords = [], signal = null, timeoutMs = 120_000 } = {}) {
  const c = phononConf53();
  if (!c) throw asrErr('not_configured', 'Phonon er ikke satt opp (AI-kontroll › Mac mini · Fermion)', 503);
  if (!flagOnPhonon53()) throw asrErr('disabled', 'Phonon er slått av (flagget fermion_phonon53)', 503);
  const model = phononModel53();
  if (!phononSupports53(language, model)) {
    const l = String(language).toLowerCase();
    throw asrErr('unsupported_language', /^(no|nb|nn)\b/.test(l) ? 'Phonon støtter ikke norsk' : `Phonon (${model}) støtter ikke språket «${language}»`, 422);
  }
  const buf = Buffer.isBuffer(audio) ? audio : audio instanceof Uint8Array ? Buffer.from(audio) : null;
  if (!buf?.length) throw asrErr('bad_audio', 'Ingen lyd', 400);
  if (buf.length > MAX_AUDIO_BYTES53) throw asrErr('bad_audio', 'Lydfilen er for stor (maks 200 MB)', 413);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: String(mime || 'application/octet-stream') }), String(filename || 'lyd.wav').replace(/[^\w.-]/g, '_').slice(0, 80) || 'lyd.wav');
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  fd.append('timestamp_granularities[]', 'segment');
  const hw = (Array.isArray(hotwords) ? hotwords : []).map((w) => String(w).replace(/[\r\n,]/g, ' ').trim()).filter(Boolean).slice(0, 50);
  if (hw.length) fd.append('hotwords', JSON.stringify(hw));
  const t0 = Date.now();
  const sig = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  let r;
  try {
    r = await fermionFetch53(`${c.url}/v1/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${c.key}` }, body: fd, signal: sig });
  } catch (e) {
    if (signal?.aborted) throw asrErr('cancelled', 'Avbrutt', 499);
    if (e?.name === 'TimeoutError' || sig.aborted) throw asrErr('timeout', `Phonon svarte ikke på ${Math.round(timeoutMs / 1000)} s`, 504);
    markDown53('phonon', 'Kan ikke nås');
    throw asrErr('unavailable', `Phonon på Mac mini-en kan ikke nås (${e?.cause?.code || e?.name || 'nettverksfeil'})`, 503);
  }
  const text = await r.text().catch(() => '');
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  if (r.status === 401 || r.status === 403) { markDown53('phonon', 'Nøkkel/IP avvist'); throw asrErr('auth', 'Phonon på Mac mini-en godtok ikke nøkkelen', 503); }
  if (r.status === 503) { markDown53('phonon', 'Starter'); throw asrErr('unavailable', 'Phonon starter fortsatt (laster modellen)', 503); }
  if (r.status === 400 || r.status === 413) throw asrErr('bad_audio', `Phonon kunne ikke lese lyden${j?.error?.message ? `: ${String(j.error.message).slice(0, 160)}` : ''}`, r.status === 413 ? 413 : 400);
  if (!r.ok || !j || typeof j.text !== 'string') throw asrErr('http', `Phonon svarte ${r.status}`, 502);
  const words = (Array.isArray(j.words) ? j.words : []).map((w) => ({ word: String(w.word ?? w.text ?? ''), start: sec(w.start), end: sec(w.end) })).filter((w) => w.word && w.start != null && w.end != null);
  const segments = (Array.isArray(j.segments) ? j.segments : []).map((s) => ({ start: sec(s.start), end: sec(s.end), text: String(s.text ?? '').trim() })).filter((s) => s.start != null);
  return { text: j.text.trim(), words, segments, duration: sec(j.duration), language: language ? String(language) : null, engine: 'phonon', model, ms: Date.now() - t0 };
}

/** Grensesnittet DAL53 bruker (lat import). */
export const phononAsr53 = {
  name: 'phonon',
  get label() { return LABEL[phononModel53()] ?? 'Phonon (Mac mini)'; },
  configured: () => !!phononConf53(),
  ready: () => phononReady53(),
  model: () => phononModel53(),
  languages: () => phononLanguages53(),
  supports: (lang) => phononSupports53(lang),
  transcribe: (audio, opts) => transcribePhonon53(audio, opts),
};

/** 1 s stillhet som WAV (16 kHz mono, 16 bit) – til admin-testen. */
export function silenceWav53(seconds = 1, rate = 16000) {
  const n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
export async function testPhonon53() {
  const t0 = Date.now();
  await probe53('phonon');
  try { const r = await transcribePhonon53(silenceWav53(), { timeoutMs: 60_000 }); return { ok: true, text: r.text, ms: Date.now() - t0, model: r.model }; }
  catch (e) { return { ok: false, error: e.message, code: e.code, ms: Date.now() - t0, model: phononModel53() }; }
}
