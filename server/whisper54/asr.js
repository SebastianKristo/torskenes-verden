// Prompt 54 (WHISPER54): NB-Whisper (Nasjonalbiblioteket, Apache-2.0) som tale til tekst-backend for POST /api/voice53/transcribe.
// Klient mot tools/nb-whisper/nbwhisper.py på Mac mini-en (LAN, IP-filter + nøkkel). Lyden går bare til Mac-en i huset og logges aldri.
// Formen er beskrevet i SERVER53-API.md (seksjon WHISPER54).
import { nbConf54 } from './config.js';
import { nbFetch54, nbReady54, nbFlag54, nbState54, markNbDown54, probeNb54 } from './health.js';

// Whisper-språkene (100 koder fra Whisper-tokenizeren). NB-Whisper er finjustert for norsk (no = bokmål, nn = nynorsk) og engelsk;
// de andre språkene er arvet fra Whisper large-v3 og brukes bare når de oppdages eller velges og ingen bedre motor finnes.
export const WHISPER_LANGS54 = ('en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa '
  + 'lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as '
  + 'tt haw ln ha ba jw su yue').split(' ');
export const MAX_AUDIO_BYTES54 = 100 * 1024 * 1024; // samme grense som tjenesten
export const NB_LABEL54 = 'NB-Whisper (Mac mini)';

const err = (code, message, status) => Object.assign(new Error(message), { code, status });
const sec = (v) => (Number.isFinite(+v) ? Math.round(+v * 1000) / 1000 : null);
/** 'nb' | 'no' | 'nb-NO' → 'no' (bokmål), 'nn' → 'nn', ellers ISO-koden. Tomt/auto → null. */
export function nbLang54(l) {
  const s = String(l ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!s || s === 'auto') return null;
  if (['nb', 'no', 'nor', 'nob'].includes(s)) return 'no';
  if (['nn', 'nno'].includes(s)) return 'nn';
  return s;
}
export const nbSupports54 = (l) => { const s = nbLang54(l); return !s || WHISPER_LANGS54.includes(s); };

async function post(path, wav, fields, { signal = null, timeoutMs = 120_000 } = {}) {
  const c = nbConf54();
  if (!c) throw err('not_configured', 'NB-Whisper er ikke satt opp (AI-kontroll › Tale til tekst)', 503);
  if (!nbFlag54()) throw err('disabled', 'NB-Whisper er slått av (flagget whisper_nb54)', 503);
  const buf = Buffer.isBuffer(wav) ? wav : wav instanceof Uint8Array ? Buffer.from(wav) : null;
  if (!buf?.length) throw err('bad_audio', 'Ingen lyd', 400);
  if (buf.length > MAX_AUDIO_BYTES54) throw err('bad_audio', 'Lydfilen er for stor for NB-Whisper (maks 100 MB)', 413);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/wav' }), 'lyd.wav');
  for (const [k, v] of fields) fd.append(k, v);
  const sig = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  let r;
  try {
    r = await nbFetch54(`${c.url}${path}`, { method: 'POST', headers: { authorization: `Bearer ${c.key}` }, body: fd, signal: sig });
  } catch (e) {
    if (signal?.aborted) throw err('cancelled', 'Avbrutt', 499);
    if (e?.name === 'TimeoutError' || sig.aborted) throw err('timeout', `NB-Whisper svarte ikke på ${Math.round(timeoutMs / 1000)} s`, 504);
    markNbDown54('down', 'Kan ikke nås');
    throw err('unavailable', `NB-Whisper på Mac mini-en kan ikke nås (${e?.cause?.code || e?.name || 'nettverksfeil'})`, 503);
  }
  const text = await r.text().catch(() => '');
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  if (r.status === 401 || r.status === 403) { markNbDown54('auth', 'Nøkkel/IP avvist'); throw err('auth', 'NB-Whisper på Mac mini-en godtok ikke nøkkelen', 503); }
  if (r.status === 503) {
    if (j?.error?.code === 'busy') throw err('busy', 'NB-Whisper er opptatt med andre opptak – prøv igjen om litt', 503);
    markNbDown54('starting', 'Starter');
    throw err('unavailable', 'NB-Whisper starter fortsatt (laster modellen)', 503);
  }
  if (r.status === 400 || r.status === 413 || r.status === 415) {
    if (j?.error?.code === 'unsupported_language') throw err('unsupported_language', 'NB-Whisper kjenner ikke språket', 422);
    throw err('bad_audio', `NB-Whisper kunne ikke lese lyden${j?.error?.message ? `: ${String(j.error.message).slice(0, 120)}` : ''}`, r.status === 413 ? 413 : 400);
  }
  if (!r.ok || !j) throw err('http', `NB-Whisper svarte ${r.status}`, 502);
  return j;
}

/**
 * Lyd (WAV) → tekst med ordtider. language: 'no' (bokmål) | 'nn' | 'en' | annen Whisper-kode | null (modellen gjenkjenner selv).
 * → {text, words:[{word,start,end}], segments:[{start,end,text}], duration, language, engine:'nbwhisper', model, ms}
 */
export async function transcribeNb54(wav, { language = null, prompt = null, signal = null, timeoutMs = 180_000 } = {}) {
  const lang = nbLang54(language);
  if (lang && !WHISPER_LANGS54.includes(lang)) throw err('unsupported_language', `NB-Whisper støtter ikke språket «${language}»`, 422);
  const t0 = Date.now();
  const f = [['response_format', 'verbose_json'], ['timestamp_granularities[]', 'word'], ['timestamp_granularities[]', 'segment']];
  if (lang) f.push(['language', lang]);
  if (prompt) f.push(['prompt', String(prompt).slice(0, 400)]);
  const j = await post('/v1/audio/transcriptions', wav, f, { signal, timeoutMs });
  if (typeof j.text !== 'string') throw err('http', 'NB-Whisper ga et ukjent svar', 502);
  const words = (Array.isArray(j.words) ? j.words : []).map((w) => ({ word: String(w.word ?? w.text ?? '').trim(), start: sec(w.start), end: sec(w.end) })).filter((w) => w.word && w.start != null && w.end != null);
  const segments = (Array.isArray(j.segments) ? j.segments : []).map((s) => ({ start: sec(s.start), end: sec(s.end), text: String(s.text ?? '').trim() })).filter((s) => s.start != null);
  return { text: j.text.trim(), words, segments, duration: sec(j.duration), language: nbLang54(j.language) ?? lang, engine: 'nbwhisper', model: String(j.model ?? nbState54().info?.model ?? 'nb-whisper'), ms: Date.now() - t0 };
}

/** Språkdeteksjon på (de første 30 s av) lyden. → {language, probability, languages:[{language, probability}], ms} – språkkodene normalisert (nb → no). */
export async function detectNb54(wav, { signal = null, timeoutMs = 20_000 } = {}) {
  const t0 = Date.now();
  const j = await post('/v1/audio/detect', wav, [], { signal, timeoutMs });
  const languages = (Array.isArray(j.languages) ? j.languages : []).map((x) => ({ language: nbLang54(x.language), probability: Number(x.probability) || 0 })).filter((x) => x.language).slice(0, 10);
  const language = nbLang54(j.language) ?? languages[0]?.language ?? null;
  if (!language) throw err('http', 'NB-Whisper fant ikke språket', 502);
  return { language, probability: Number(j.probability) || languages[0]?.probability || 0, languages, ms: Date.now() - t0 };
}

/** Grensesnittet voice53 (server/dal53/asr.js) bruker – lat import, samme form som phononAsr53. */
export const nbWhisperAsr54 = {
  name: 'nbwhisper',
  label: NB_LABEL54,
  configured: () => !!nbConf54(),
  flag: () => nbFlag54(),
  ready: () => nbReady54(),
  status: () => nbState54().status,
  languages: () => [...WHISPER_LANGS54],
  supports: (lang) => nbSupports54(lang),
  transcribe: (wav, opts) => transcribeNb54(wav, opts),
  detect: (wav, opts) => detectNb54(wav, opts),
};

/** 1 s stillhet som WAV – til admin-testen. */
export function silenceWav54(seconds = 1, rate = 16000) {
  const n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
export async function testNb54() {
  const t0 = Date.now();
  await probeNb54();
  try {
    const d = await detectNb54(silenceWav54());
    const r = await transcribeNb54(silenceWav54(), { language: 'no', timeoutMs: 60_000 });
    return { ok: true, text: r.text, detected: d.language, ms: Date.now() - t0, model: r.model };
  } catch (e) { return { ok: false, error: e.message, code: e.code, ms: Date.now() - t0 }; }
}
