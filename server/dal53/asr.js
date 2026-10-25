// Prompt 53 (DAL53): tale til tekst – POST /api/voice53/transcribe. Lyd → (ffmpeg) 16 kHz mono → Clear (rens) → ASR-backend → tekst
// med ordtider. Alt skjer i huset: Voz kjører på serveren, Phonon (FERMION53) på Mac mini-en i LAN.
//
// Backends velges etter prioritet blant dem som er klare OG støtter språket brukeren valgte:
//   phonon (FERMION53, prioritet 10) · voz (lokal, prioritet 5) · andre registrert med registerAsrBackend53 (f.eks. Whisper senere).
// Norsk: verken Voz eller Phonon støtter norsk (begge oppgir 25 europeiske språk uten norsk). Prompt 54 (WHISPER54): NB-Whisper på
// Mac mini-en (server/whisper54, lat import) tar norsk (bokmål/nynorsk), språkdeteksjon (language mangler/auto) og er reserve for
// engelsk. Rekkefølgen per språk står i ../whisper54/route.js. 422 language_unsupported bare når ingen motor for språket er satt opp.
import { execFile } from 'node:child_process';
import { use53, ready53 } from './models.js';
import { on53 } from './flags.js';
import { detectLang53 } from './text.js';
import { splitLang54, nbWire54, decide54, order54, langLabel54, ENGINE_LABELS54 } from '../whisper54/route.js';

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

let nbw = undefined; // lat import av WHISPER54 (NB-Whisper på Mac mini-en)
async function nbWhisper() {
  if (nbw === undefined) nbw = (await import('../whisper54/asr.js').catch(() => null))?.nbWhisperAsr54 ?? null;
  return nbw;
}
/** Bare for tester. */
export const _setNbWhisper54 = (p) => { nbw = p; };
function nbBackend(p) {
  return {
    id: 'nbwhisper', label: p.label ?? 'NB-Whisper (Mac mini)', priority: 8,
    get languages() { try { return p.languages?.() ?? null; } catch { return null; } },
    // «Finnes» = satt opp og flagget på. Er den bare nede, er svaret 503 (ikke 422).
    get configured() { try { return !!p.configured?.() && (p.flag ? !!p.flag() : true); } catch { return false; } },
    supports: (l) => { try { return p.supports ? !!p.supports(l) : true; } catch { return false; } },
    available: async () => { try { return !!p.ready?.(); } catch { return false; } },
    detect: (wav, o) => p.detect(wav, o),
    async transcribe({ wav, language, variant, signal }) {
      const r = await p.transcribe(wav, { language: nbWire54(language, variant), signal, timeoutMs: 180_000 });
      return { text: String(r?.text ?? '').trim(), words: (r?.words ?? []).map((w) => ({ text: w.text ?? w.word, start: w.start, end: w.end })), duration: r?.duration };
    },
  };
}

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
    get configured() { try { return p.configured ? !!p.configured() : true; } catch { return false; } }, // prompt 54: 422 vs 503
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
  const n = await nbWhisper();
  if (n) list.push(nbBackend(n));
  const out = [];
  for (const b of list) {
    // eslint-disable-next-line no-await-in-loop
    const available = await Promise.race([Promise.resolve().then(() => b.available()).catch(() => false), new Promise((r) => { setTimeout(() => r(false), 1500).unref?.(); })]);
    out.push({ id: b.id, label: b.label, engine_label: ENGINE_LABELS54[b.id] ?? b.label, languages: b.languages ?? null, available: !!available, configured: b.configured ?? true, priority: b.priority ?? 0, b });
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

const asrErr53 = (code, message, status, extra = {}) => Object.assign(new Error(message), { code, status, ...extra });
const r3 = (v) => (Number.isFinite(+v) ? Math.round(+v * 1000) / 1000 : null);

/**
 * Transkriber. → {text, words:[{text,start,end}], language, variant?, language_label, detected?, engine, engine_label, backend, enhanced, duration, ms}
 * language: 'no'|'nb'|'nn'|'en'|… eller null/'auto' (språkdeteksjon via NB-Whisper; hint = brukerens foretrukne språk, bare et hint).
 * kaster Error med .code 'language_unsupported' (status 422, .supported) | 'asr_unavailable' (503) | 'bad_audio' (400).
 */
export async function transcribe53(buf, { language = null, backend = 'auto', enhance = true, signal = null, hint = null } = {}) {
  const t0 = Date.now();
  const auto = !String(language ?? '').trim() || /^auto$/i.test(String(language).trim());
  let { lang, variant } = auto ? { lang: null, variant: null } : splitLang54(language);
  const all = await asrBackends53();
  const want = backend && backend !== 'auto' ? all.filter((x) => x.id === backend) : all;
  if (backend && backend !== 'auto' && !want.length) throw asrErr53('bad_backend', `Ukjent backend «${backend}»`, 400);
  const usable = want.filter((x) => x.configured !== false); // satt opp og flagget på (kan være nede akkurat nå)
  const unsupported = (l, found = false) => asrErr53('language_unsupported', l === 'no'
    ? 'Tale til tekst på norsk krever NB-Whisper på Mac mini-en, og den er ikke satt opp eller er slått av (AI-kontroll › Tale til tekst). Voz og Phonon støtter ikke norsk. Velg engelsk, eller bruk talegjenkjenningen på enheten.'
    : found ? `Oppdaget språk «${l}» støttes ikke av tale til tekst-motorene som finnes. Velg språk selv.` : `Språket «${l}» støttes ikke av tale til tekst-motorene som finnes.`,
  422, { supported: [...new Set(usable.flatMap((x) => x.languages ?? []))].sort(), ...(found ? { detected: l } : {}) });
  const unavailable = () => asrErr53('asr_unavailable', 'Tale til tekst er ikke klar ennå (modellen lastes eller Mac mini-en svarer ikke). Prøv igjen om litt.', 503);
  const pick = (l, isAuto = false) => order54(usable.filter((x) => x.available && supports(x, l)), l, { auto: isAuto });
  if (!auto) {
    if (!usable.some((x) => supports(x, lang))) throw unsupported(lang);
    if (!pick(lang).length) throw unavailable();
  } else if (!usable.some((x) => x.available)) throw unavailable();
  const raw = await decodeAudio53(buf);
  if (!raw.length) throw asrErr53('bad_audio', 'Lydfilen er tom', 400);
  // Clear (støyfjerning) før alle motorene, også før språkdeteksjonen.
  const { samples, enhanced } = enhance ? await enhance53(raw) : { samples: raw, enhanced: false };
  let wav = null, detected = null;
  if (auto) {
    const h = splitLang54(hint);
    const det = usable.find((x) => x.available && typeof x.b.detect === 'function');
    let d = null;
    if (det) {
      try { d = await det.b.detect(wav16k53(samples.subarray(0, 30 * 16000)), { signal, timeoutMs: 20_000 }); }
      catch (e) { console.warn(`[dal53] språkdeteksjon (${det.id}) feilet: ${String(e?.code ?? '')} ${String(e?.message ?? e).slice(0, 120)}`); }
    }
    const dec = d ? decide54(d, h.lang) : null;
    if (dec) {
      lang = dec.lang;
      variant = lang === 'no' ? (dec.variant === 'nn' || h.variant === 'nn' ? 'nn' : 'nb') : null;
      detected = { language: dec.lang, probability: r3(dec.probability), source: dec.source, engine: det.id };
    } else {
      // Ingen deteksjon (NB-Whisper mangler/nede): brukerens foretrukne språk, norsk som standard.
      lang = h.lang ?? 'no';
      variant = lang === 'no' ? h.variant ?? 'nb' : null;
      detected = { language: lang, probability: null, source: 'hint', engine: null };
    }
    if (!usable.some((x) => supports(x, lang))) throw unsupported(lang, !!dec);
  }
  const ready = pick(lang, auto && detected?.source === 'detected');
  if (!ready.length) throw unavailable();
  let lastErr = null;
  const run = async (list, l, v, det) => {
    for (const [i, x] of list.entries()) {
      try {
        if (x.id !== 'voz') wav ??= wav16k53(samples);
        // eslint-disable-next-line no-await-in-loop
        const r = await x.b.transcribe({ wav, samples16k: samples, sampleRate: 16000, language: l, variant: v, signal });
        const words = (r.words ?? []).map((w) => ({ text: String(w.text ?? w.word ?? '').trim(), start: r3(w.start), end: r3(w.end) })).filter((w) => w.text && w.start != null && w.end != null);
        return { text: r.text, words, language: l, ...(l === 'no' ? { variant: v } : {}), language_label: langLabel54(l, v), ...(det ? { detected: det } : {}),
          engine: x.id, engine_label: ENGINE_LABELS54[x.id] ?? x.label, backend: x.id, ...(i > 0 ? { fallback: true } : {}),
          enhanced, duration: r.duration ?? Math.round((samples.length / 16000) * 100) / 100, ms: Date.now() - t0 };
      } catch (e) {
        lastErr = e;
        if (e?.code === 'cancelled' || signal?.aborted) throw asrErr53('cancelled', 'Avbrutt', 499);
        console.warn(`[dal53] ASR ${x.id} feilet: ${String(e?.code ?? '')} ${String(e?.message ?? e).slice(0, 160)}`);
      }
    }
    return null;
  };
  // NB-Whisper er finjustert på norsk: deteksjonen heller mot «no» også for engelsk tale, og med language=no skrives engelsk tale ofte
  // om til norsk. Når språket ble oppdaget (ikke valgt) som norsk og Voz er klar, kjøres Voz parallelt, og Tongue avgjør på teksten:
  // er Voz-teksten sikkert engelsk (eller et annet ikke-nordisk Voz-språk), brukes den. Ellers står NB-Whisper. Det samme for NB-teksten.
  const second = auto && lang === 'no' && detected?.source !== 'hint' ? usable.find((x) => x.id === 'voz' && x.available) : null;
  const tongueOk = (t) => t?.sure && t.language !== 'no' && !['da', 'sv', 'nn', 'nb'].includes(t.language);
  if (second) {
    ready53('tongue');
    const [res, vz] = await Promise.all([run(ready, lang, variant, detected), second.b.transcribe({ samples16k: samples, sampleRate: 16000, language: null, signal }).catch(() => null)]);
    const tv = vz?.text ? detectLang53(vz.text) : null;
    if (tongueOk(tv) && supports(second, tv.language)) {
      const words = (vz.words ?? []).map((w) => ({ text: String(w.text ?? '').trim(), start: r3(w.start), end: r3(w.end) })).filter((w) => w.text && w.start != null && w.end != null);
      return { text: vz.text, words, language: tv.language, language_label: langLabel54(tv.language, null), detected: { language: tv.language, probability: null, source: 'text', engine: 'tongue', first: detected },
        engine: 'voz', engine_label: ENGINE_LABELS54.voz ?? second.label, backend: 'voz', enhanced, duration: vz.duration ?? Math.round((samples.length / 16000) * 100) / 100, ms: Date.now() - t0 };
    }
    if (res) return res;
  } else {
    const res = await run(ready, lang, variant, detected);
    if (res && auto && lang === 'no' && res.engine === 'nbwhisper') {
      const t = detectLang53(res.text);
      const alt = tongueOk(t) ? pick(t.language).filter((x) => x.id !== 'nbwhisper') : [];
      if (alt.length) {
        const again = await run(alt, t.language, null, { language: t.language, probability: null, source: 'text', engine: 'tongue', first: detected });
        if (again) return again;
      }
    }
    if (res) return res;
  }
  throw asrErr53('asr_unavailable', `Tale til tekst feilet${lastErr?.message ? `: ${String(lastErr.message).slice(0, 160)}` : ''}`, 503);
}
