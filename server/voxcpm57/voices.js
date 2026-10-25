// Prompt 57 (VOX57): VoxCPM-stemmer per bruker – ferdige («builtin»), egne fra beskrivelse («design») og klonede («clone»).
// Lagret i DATA_DIR/voices57/<bruker>/: <id>.json (metadata) og <id>.wav (referanse, 16 kHz mono) + cache/ (ferdig lyd).
// Private: bare eieren ser og bruker sine stemmer; admin ser bare antall. Mac-en får bare innholds-hashen og lyden (aldri navn/bruker).
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import * as ai from '../ai-run.js';
import { speech57, putRef57, deleteRef57 } from './client.js';
import { vxReady57, vxConfigured57 } from './health.js';

export const VX_LABEL57 = 'VoxCPM2 (Mac mini, lokal)';
export const CONSENT_TEXT57 = 'Dette er min egen stemme, eller jeg har samtykke fra personen';
export const SAMPLE_TEXT57 = 'Hei! Nå leser jeg en kort tekst, slik at Glimt kan lære stemmen min. Været i dag er fint, med litt sol og lett bris fra sør. '
  + 'I morgen blir det kanskje regn, så husk paraplyen. Jeg liker å gå tur langs sjøen, og om kvelden drikker jeg gjerne en kopp te. Takk for at du lytter!';
export const LIMITS57 = { minSeconds: 5, maxSeconds: 60, maxBytes: 20 * 1024 * 1024, maxVoices: 20, nameMax: 40, promptMax: 300 };
const CACHE_MS = 30 * 86400_000;

/** Ferdige stemmer (Voice Design på norsk). Felles for alle; `classic` = sky-stemmen som brukes som reserve. */
export const BUILTIN57 = [
  { id: 'vx-nora', name: 'Nora', desc: 'Rolig, varm kvinnestemme', classic: 'nora', prompt: 'En rolig og varm kvinnestemme, norsk bokmål med østnorsk uttale, middels tempo' },
  { id: 'vx-henrik', name: 'Henrik', desc: 'Tydelig mannsstemme', classic: 'henrik', prompt: 'En tydelig og trygg mannsstemme, norsk bokmål med østnorsk uttale, middels tempo' },
  { id: 'vx-lys', name: 'Lys', desc: 'Glad og lett', classic: 'lys', prompt: 'En glad og lett ung kvinnestemme, norsk bokmål, litt raskt tempo, smil i stemmen' },
  { id: 'vx-nyhet', name: 'Nyhetsoppleser', desc: 'Nøytral, profesjonell', classic: 'nora', prompt: 'En nøytral og profesjonell nyhetsoppleser, norsk bokmål, rolig og tydelig, som på radio' },
];
const BUILTIN_IDS = new Set(BUILTIN57.map((b) => b.id));
const USER_ID_RE = /^vxu-[0-9a-f]{12}$/;
export const isVxId57 = (id) => typeof id === 'string' && (BUILTIN_IDS.has(id) || USER_ID_RE.test(id));
/** Sky-stemmen (nora|henrik|lys) som brukes når VoxCPM ikke svarer. */
export const classicOf57 = (id) => BUILTIN57.find((b) => b.id === id)?.classic ?? 'nora';

const err = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

/* ─────────────── lagring ─────────────── */

const ROOT = () => join(config.dataDir, 'voices57');
/** Mappenavnet for brukeren: brukernavnet når det er trygt, ellers en hash. */
export function userDir57(u) {
  const s = String(u ?? '');
  const safe = /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(s) && !s.includes('..');
  return join(ROOT(), safe ? s : `u-${createHash('sha256').update(s).digest('hex').slice(0, 16)}`);
}
const metaPath = (u, id) => join(userDir57(u), `${id}.json`);
const wavPath = (u, id) => join(userDir57(u), `${id}.wav`);
const cacheDir = (u) => join(userDir57(u), 'cache');
function readMeta(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }
function writeAtomic(file, data, mode = 0o600) { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, data, { mode }); renameSync(tmp, file); }

/** Brukerens egne stemmer (med interne felt). */
function ownVoices(u) {
  let files = [];
  try { files = readdirSync(userDir57(u)).filter((f) => /^vxu-[0-9a-f]{12}\.json$/.test(f)); } catch { return []; }
  return files.map((f) => readMeta(join(userDir57(u), f))).filter((m) => m && USER_ID_RE.test(m.id)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
/** Til klienten: aldri hash, sti eller lyd. */
function publicOf(m) {
  if (m.kind === 'builtin') return { id: m.id, name: m.name, kind: 'builtin', desc: m.desc, createdAt: null, lang: 'no', prompt: m.prompt };
  const base = { id: m.id, name: m.name, kind: m.kind, desc: m.desc ?? null, createdAt: m.createdAt, lang: m.lang ?? 'no' };
  return m.kind === 'design' ? { ...base, prompt: m.prompt } : { ...base, seconds: m.seconds ?? null, hasTranscript: !!m.transcript, consentAt: m.consentAt ?? null };
}
export function listVoices57(u) { return [...BUILTIN57.map((b) => publicOf({ ...b, kind: 'builtin' })), ...ownVoices(u).map(publicOf)]; }

/** Stemmen slik motoren trenger den, eller null (ukjent / ikke brukerens). */
export function vxVoiceOf57(u, id) {
  const b = BUILTIN57.find((x) => x.id === id);
  if (b) return { id: b.id, kind: 'design', prompt: b.prompt, builtin: true };
  if (!USER_ID_RE.test(String(id ?? ''))) return null;
  const m = readMeta(metaPath(u, id));
  if (!m || m.id !== id) return null;
  if (m.kind === 'design') return { id, kind: 'design', prompt: m.prompt };
  const wp = wavPath(u, id);
  if (!existsSync(wp)) return null;
  return { id, kind: 'clone', sha: m.sha, transcript: m.transcript || null, wav: () => readFileSync(wp) };
}

const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS57.nameMax);
const cleanPrompt = (p) => String(p ?? '').replace(/[()[\]\r\n\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS57.promptMax);
const newId = () => `vxu-${randomBytes(6).toString('hex')}`;
function checkCount(u) { if (ownVoices(u).length >= LIMITS57.maxVoices) throw err('too_many', `Du kan ha maks ${LIMITS57.maxVoices} egne stemmer – slett en først`); }

/** Ny stemme fra beskrivelse. → offentlig form */
export function createDesign57(u, { name, prompt, lang } = {}) {
  const n = cleanName(name), p = cleanPrompt(prompt);
  if (!n) throw err('name_required', 'Gi stemmen et navn');
  if (p.length < 3) throw err('prompt_required', 'Beskriv stemmen (f.eks. «En rolig mannsstemme, middels tempo»)');
  checkCount(u);
  const m = { id: newId(), name: n, kind: 'design', prompt: p, lang: lang === 'en' ? 'en' : 'no', createdAt: new Date().toISOString() };
  mkdirSync(userDir57(u), { recursive: true, mode: 0o700 });
  writeAtomic(metaPath(u, m.id), JSON.stringify(m));
  return publicOf(m);
}

/* ─────────────── lyd (ffmpeg på serveren) ─────────────── */

let convertImpl = null;
/** Bare for tester: (buf) → Buffer s16le 16 kHz mono (eller kast). */
export const _setRefConverter57 = (fn) => { convertImpl = fn ?? null; };
function toPcm16k(buf) {
  if (convertImpl) return Promise.resolve(convertImpl(buf));
  return new Promise((res, rej) => {
    const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 16000 * 2 * 200, timeout: 60_000 }, (e, out) => {
        if (e) return rej(err('bad_audio', e.code === 'ENOENT' ? 'ffmpeg mangler på serveren' : 'Kunne ikke lese lydfilen'));
        res(out);
      });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}
export function wavOf57(pcm, rate = 16000) {
  const n = pcm.length - (pcm.length % 2), b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  pcm.copy(b, 44, 0, n);
  return b;
}

/** Klonet stemme fra et opptak. Krever samtykke. → offentlig form */
export async function createClone57(u, { name, file, transcript, consent } = {}) {
  const yes = consent === true || ['true', '1', 'on', 'ja', 'yes'].includes(String(consent ?? '').toLowerCase());
  if (!yes) throw err('consent_required', `Bekreft: «${CONSENT_TEXT57}»`);
  const n = cleanName(name);
  if (!n) throw err('name_required', 'Gi stemmen et navn');
  if (!file || !file.length) throw err('file_required', 'Mangler lydopptak (feltet «file»)');
  if (file.length > LIMITS57.maxBytes) throw err('too_large', `Opptaket er for stort (maks ${LIMITS57.maxBytes / 1048576} MB)`, 413);
  checkCount(u);
  const pcm = await toPcm16k(file);
  const seconds = Math.round((pcm.length / 32000) * 10) / 10;
  if (seconds < LIMITS57.minSeconds) throw err('too_short', `Opptaket er for kort (${seconds} s) – les i minst ${LIMITS57.minSeconds} sekunder`);
  if (seconds > LIMITS57.maxSeconds) throw err('too_long', `Opptaket er for langt (${seconds} s) – maks ${LIMITS57.maxSeconds} sekunder`);
  const wav = wavOf57(pcm);
  const sha = createHash('sha256').update(wav).digest('hex');
  const t = String(transcript ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const now = new Date().toISOString();
  const m = { id: newId(), name: n, kind: 'clone', lang: 'no', createdAt: now, consentAt: now, consentText: CONSENT_TEXT57, sha, seconds, transcript: t || null };
  mkdirSync(userDir57(u), { recursive: true, mode: 0o700 });
  writeAtomic(wavPath(u, m.id), wav);
  writeAtomic(metaPath(u, m.id), JSON.stringify(m));
  if (vxReady57()) putRef57(sha, wav).catch(() => {}); // forhåndslast på Mac-en (ellers lastes den opp ved første bruk)
  return publicOf(m);
}

/** Finnes samme opptak hos noen (annen stemme)? Da beholdes Mac-cachen. */
function shaInUse(sha, except) {
  let dirs = [];
  try { dirs = readdirSync(ROOT()); } catch { return false; }
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(join(ROOT(), d)).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) { const m = readMeta(join(ROOT(), d, f)); if (m?.sha === sha && !(join(ROOT(), d) === except.dir && m.id === except.id)) return true; }
  }
  return false;
}

/** Sletter stemmen (metadata, opptak, cachet lyd) og referansen på Mac-en. → {ok, macDeleted} */
export async function deleteVoice57(u, id) {
  if (BUILTIN_IDS.has(id)) throw err('builtin', 'De ferdige stemmene kan ikke slettes');
  if (!USER_ID_RE.test(String(id ?? ''))) throw err('not_found', 'Fant ikke stemmen', 404);
  const m = readMeta(metaPath(u, id));
  if (!m) throw err('not_found', 'Fant ikke stemmen', 404);
  for (const p of [wavPath(u, id), metaPath(u, id)]) { try { unlinkSync(p); } catch { /* borte */ } }
  clearCache57(u, id);
  let macDeleted = false;
  if (m.sha && vxConfigured57() && !shaInUse(m.sha, { dir: userDir57(u), id })) {
    try { macDeleted = await deleteRef57(m.sha); } catch { macDeleted = false; }
  }
  return { ok: true, macDeleted };
}

/** Antall (til admin – aldri innhold). */
export function voiceCounts57() {
  let users = 0, clones = 0, designs = 0, dirs = [];
  try { dirs = readdirSync(ROOT()); } catch { return { users, clones, designs }; }
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(join(ROOT(), d)).filter((f) => /^vxu-[0-9a-f]{12}\.json$/.test(f)); } catch { continue; }
    let any = false;
    for (const f of files) { const m = readMeta(join(ROOT(), d, f)); if (m?.kind === 'clone') { clones++; any = true; } else if (m?.kind === 'design') { designs++; any = true; } }
    if (any) users++;
  }
  return { users, clones, designs };
}

/* ─────────────── tale (med cache per bruker) ─────────────── */

export function clearCache57(u, id = null) {
  try {
    for (const f of readdirSync(cacheDir(u))) if (!id || f.startsWith(`${id}.`)) unlinkSync(join(cacheDir(u), f));
  } catch { /* ingen cache */ }
}
export function pruneVxCache57() {
  let dirs = [];
  try { dirs = readdirSync(ROOT()); } catch { return; }
  for (const d of dirs) {
    const cd = join(ROOT(), d, 'cache');
    try { for (const f of readdirSync(cd)) { const p = join(cd, f); if (Date.now() - statSync(p).mtimeMs > CACHE_MS) unlinkSync(p); } } catch { /* ingen */ }
  }
}
const EXT = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'opus' };
const TYPE = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg' };

/**
 * Leser opp med en VoxCPM-stemme. Ukjent/slettet stemme → vx-nora. text er allerede normalisert for uttale.
 * → {audio, contentType, cache:'hit'|'miss', voice, chars, text}
 */
export async function vxSpeakFor57(u, { voiceId, text, lang = 'no', speed = 1, cache = true, title = 'Glimt · stemme (VoxCPM)' } = {}) {
  const v = vxVoiceOf57(u, voiceId) ?? vxVoiceOf57(u, 'vx-nora');
  const h = createHash('sha256').update(JSON.stringify(['voxcpm', 'VoxCPM2', v.id, v.kind === 'clone' ? v.sha : v.prompt, v.transcript ?? null, speed, lang, text])).digest('hex').slice(0, 40);
  if (cache) {
    for (const ext of ['mp3', 'wav', 'opus']) {
      const f = join(cacheDir(u), `${v.id}.${h}.${ext}`);
      if (existsSync(f) && Date.now() - statSync(f).mtimeMs < CACHE_MS) return { audio: readFileSync(f), contentType: TYPE[ext], cache: 'hit', voice: v.id, chars: text.length, text };
    }
  }
  const t0 = Date.now();
  let job = null;
  try { job = ai.jobStart({ user: u, task: 'tts', kind: 'tts', title, model: 'VoxCPM2', provider: 'voxcpm' }); } catch { /* jobbloggen er best effort */ }
  let r;
  try { r = await speech57(text, { voice: v, language: lang, speed, format: 'mp3' }); }
  catch (e) { if (job) try { ai.jobUpdate(job, { status: 'fail', error: e.message, ms: Date.now() - t0 }); } catch { /* */ } throw e; }
  if (job) try { ai.jobEnd(job, { ms: Date.now() - t0, tokIn: text.length, tokOut: 0, costKr: 0 }); } catch { /* */ }
  if (cache) {
    try { mkdirSync(cacheDir(u), { recursive: true, mode: 0o700 }); writeAtomic(join(cacheDir(u), `${v.id}.${h}.${EXT[r.contentType] ?? 'mp3'}`), r.audio); } catch (e) { console.warn('[voxcpm57] cache:', e.message); }
  }
  return { audio: r.audio, contentType: r.contentType, cache: 'miss', voice: v.id, chars: text.length, text };
}

/** Når en bruker slettes: hele stemmemappa, og referansene på Mac-en (best effort, i bakgrunnen). */
export function purgeUser57(u) {
  const shas = ownVoices(u).map((m) => m.sha).filter(Boolean);
  try { rmSync(userDir57(u), { recursive: true, force: true }); } catch { /* */ }
  if (vxConfigured57()) for (const sha of shas) if (!shaInUse(sha, { dir: null, id: null })) deleteRef57(sha).catch(() => {});
}
