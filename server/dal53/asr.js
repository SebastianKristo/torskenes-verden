// Prompt 53 (DAL53): tale til tekst – POST /api/voice53/transcribe. Lyd → (ffmpeg) 16 kHz mono → Clear (rens) → ASR-backend → tekst
// med ordtider. Alt skjer i huset: Voz kjører på serveren, Phonon (FERMION53) på Mac mini-en i LAN.
//
// Backends velges etter prioritet blant dem som er klare OG støtter språket brukeren valgte:
//   phonon (FERMION53, prioritet 10) · voz (lokal, prioritet 5) · andre registrert med registerAsrBackend53 (f.eks. Whisper senere).
// Norsk: verken Voz eller Phonon støtter norsk (begge oppgir 25 europeiske språk uten norsk). Ber brukeren om norsk og ingen
// backend støtter det, svarer vi 422 language_unsupported i stedet for en dårlig transkripsjon.
import { execFile } from 'node:child_process';
import { use53, ready53 } from './models.js';
import { on53 } from './flags.js';

// Språkene Voz oppgir (25, europeiske). Pakken har ingen språkliste; tallet og lista stemmer med modellfamilien Voz og Phonon-2.5
// bygger på (parakeet-tdt-0.6b-v3). Modellkortet på Hugging Face kunne ikke leses herfra (blokkert) – se docs/dal-53.md.
export const VOZ_LANGS53 = ['bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'ru', 'uk'];
export const normLang53 = (l) => { const s = String(l ?? '').toLowerCase().trim().slice(0, 8).split(/[-_]/)[0]; return ['nb', 'nn', 'no', 'nor', 'nob', 'nno'].includes(s) ? 'no' : s || null; };

const extra = new Map(); // id → backend
/** Andre backends (Whisper o.l.): {id, label, languages:[…]|null, priority, available:async()=>bool, transcribe:async({wav, samples16k, sampleRate, language, signal})=>{text, words?, language?}} */
export function registerAsrBackend53(b) {
  if (!b || !/^[a-z0-9_-]{2,24}$/.test(String(b.id)) || typeof b.transcribe !== 'function') throw new Error('Ugyldig ASR-backend');
  extra.set(b.id, b);
}
export const _clearAsr53 = () => extra.clear();

let fermion = undefined; // lat import av FERMION53 (finnes kanskje ikke)
async function phonon() {
  if (fermion === undefined) fermion = (await import('../fermion53/asr.js').catch(() => null))?.phononAsr53 ?? null;
  return fermion;
}
/** Bare for tester. */
export const _setPhonon53 = (p) => { fermion = p; };

const vozBackend = {
  id: 'voz', label: 'Voz (lokal, Desert Ant Labs)', priority: 5, languages: VOZ_LANGS53,
  available: async () => on53('dal_voice53') && !!ready53('voz'),
  async transcribe({ samples16k }) {
    const r = await use53('voz', (v) => v.transcribe({ samples: samples16k, sampleRate: 16000 }), { timeoutMs: 10 * 60_000 });
    if (!r) throw new Error('Voz er ikke klar');
    return { text: String(r.text ?? '').trim(), words: (r.words ?? []).map((w) => ({ text: w.text, start: w.start, end: w.end })), duration: r.duration };
  },
};
function phononBackend(p) {
  return {
    id: 'phonon', label: p.label ?? 'Phonon (Mac mini)', priority: 10,
    get languages() { try { return p.languages?.() ?? null; } catch { return null; } },
    supports: (l) => { try { return p.supports ? !!p.supports(l) : true; } catch { return false; } },
    available: async () => { try { return !!p.ready?.(); } catch { return false; } },
    async transcribe({ wav, language, signal }) {
      const r = await p.transcribe(wav, { mime: 'audio/wav', filename: 'lyd.wav', language, signal, timeoutMs: 120_000 });
      return { text: String(r?.text ?? '').trim(), words: (r?.words ?? []).map((w) => ({ text: w.text ?? w.word, start: w.start, end: w.end })), duration: r?.duration, language: r?.language ?? language };
    },
  };
}

/** Alle backends med status. → [{id, label, languages|null, available, priority, b}] */
export async function asrBackends53() {
  const list = [vozBackend, ...extra.values()];
  const p = await phonon();
  if (p) list.push(phononBackend(p));
  const out = [];
  for (const b of list) {
    // eslint-disable-next-line no-await-in-loop
    const available = await Promise.race([Promise.resolve().then(() => b.available()).catch(() => false), new Promise((r) => { setTimeout(() => r(false), 1500).unref?.(); })]);
    out.push({ id: b.id, label: b.label, languages: b.languages ?? null, available: !!available, priority: b.priority ?? 0, b });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
const supports = (x, lang) => (x.b.supports ? x.b.supports(lang) : !lang || !x.languages || x.languages.includes(lang));

/* ---------------- Lyd ---------------- */

let decodeImpl = null;
/** Bare for tester: (buf, mime) → Float32Array (16 kHz mono). */
export const _setAudioDecoder53 = (fn) => { decodeImpl = fn ?? null; };

/** Lydfil → Float32Array 16 kHz mono (ffmpeg). */
export function decodeAudio53(buf) {
  if (decodeImpl) return Promise.resolve(decodeImpl(buf));
  return new Promise((res, rej) => {
    const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 16000 * 2 * 60 * 120, timeout: 120_000 }, (e, out) => {
        if (e) return rej(Object.assign(new Error(e.code === 'ENOENT' ? 'ffmpeg mangler på serveren' : 'Kunne ikke lese lydfilen'), { code: 'bad_audio' }));
        const n = Math.floor(out.length / 2), f = new Float32Array(n);
        for (let i = 0; i < n; i++) f[i] = out.readInt16LE(i * 2) / 32768;
        res(f);
      });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}
/** Float32Array 16 kHz mono → WAV (16-bit PCM). */
export function wav16k53(samples) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

/** Clear på lyden (16 kHz inn og ut). → {samples, enhanced} – urørt når Clear ikke er klar. */
export async function enhance53(samples) {
  if (!on53('dal_voice53') || !ready53('clear')) { ready53('clear'); return { samples, enhanced: false }; }
  const r = await use53('clear', (c) => c.enhance(samples, 16000, { targetLUFS: null, outputSampleRate: 16000 }), { timeoutMs: 120_000 });
  return r?.samples?.length ? { samples: r.samples instanceof Float32Array ? r.samples : Float32Array.from(r.samples), enhanced: true } : { samples, enhanced: false };
}

/**
 * Transkriber. → {text, words, language, backend, enhanced, duration, ms}
 * kaster Error med .code 'language_unsupported' (status 422, .supported) | 'asr_unavailable' (503) | 'bad_audio' (400).
 */
export async function transcribe53(buf, { language = null, backend = 'auto', enhance = true, signal = null } = {}) {
  const t0 = Date.now();
  const lang = normLang53(language);
  const all = await asrBackends53();
  const want = backend && backend !== 'auto' ? all.filter((x) => x.id === backend) : all;
  if (backend && backend !== 'auto' && !want.length) throw Object.assign(new Error(`Ukjent backend «${backend}»`), { code: 'bad_backend', status: 400 });
  const capable = want.filter((x) => supports(x, lang));
  if (!capable.length) {
    const supported = [...new Set(want.flatMap((x) => x.languages ?? []))].sort();
    throw Object.assign(new Error(lang === 'no'
      ? 'Tale til tekst på norsk er ikke tilgjengelig ennå: Voz og Phonon støtter ikke norsk. Velg et annet språk, eller bruk talegjenkjenningen på enheten.'
      : `Språket «${lang}» støttes ikke av tale til tekst-motorene som finnes.`), { code: 'language_unsupported', status: 422, supported });
  }
  const ready = capable.filter((x) => x.available);
  if (!ready.length) throw Object.assign(new Error('Tale til tekst er ikke klar ennå (modellen lastes eller Mac mini-en svarer ikke). Prøv igjen om litt.'), { code: 'asr_unavailable', status: 503 });
  const raw = await decodeAudio53(buf);
  if (!raw.length) throw Object.assign(new Error('Lydfilen er tom'), { code: 'bad_audio', status: 400 });
  const { samples, enhanced } = enhance ? await enhance53(raw) : { samples: raw, enhanced: false };
  let wav = null, lastErr = null;
  for (const x of ready) {
    try {
      if (x.id !== 'voz') wav ??= wav16k53(samples);
      // eslint-disable-next-line no-await-in-loop
      const r = await x.b.transcribe({ wav, samples16k: samples, sampleRate: 16000, language: lang, signal });
      return { text: r.text, words: r.words ?? [], language: r.language ?? lang, backend: x.id, enhanced, duration: r.duration ?? Math.round((samples.length / 16000) * 100) / 100, ms: Date.now() - t0 };
    } catch (e) { lastErr = e; console.warn(`[dal53] ASR ${x.id} feilet: ${String(e?.code ?? '')} ${String(e?.message ?? e).slice(0, 160)}`); }
  }
  throw Object.assign(new Error(`Tale til tekst feilet${lastErr?.message ? `: ${String(lastErr.message).slice(0, 160)}` : ''}`), { code: 'asr_unavailable', status: 503 });
}
