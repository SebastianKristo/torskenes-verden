// Prompt 57 (VOX57): klient mot VoxCPM-tjenesten på Mac mini-en (tools/voxcpm/voxcpm_service.py). LAN, IP-filter + nøkkel.
// Tekst og referanseopptak går bare til Mac-en i huset og logges aldri. Referanser identifiseres bare med sha256 av innholdet.
import { vxConf57 } from './config.js';
import { vxFetch57, markVxDown57 } from './health.js';

const err = (code, message, status) => Object.assign(new Error(message), { code, status });
export const SHA_RE57 = /^[0-9a-f]{64}$/;

async function call(path, init, timeoutMs) {
  const c = vxConf57();
  if (!c) throw err('not_configured', 'VoxCPM er ikke satt opp (AI-kontroll › VoxCPM)', 503);
  const sig = AbortSignal.timeout(timeoutMs);
  try {
    return await vxFetch57(`${c.url}${path}`, { ...init, headers: { authorization: `Bearer ${c.key}`, ...(init.headers ?? {}) }, signal: sig });
  } catch (e) {
    if (e?.name === 'TimeoutError' || sig.aborted) throw err('timeout', `VoxCPM svarte ikke på ${Math.round(timeoutMs / 1000)} s`, 504);
    markVxDown57('down', 'Kan ikke nås');
    throw err('unavailable', `VoxCPM på Mac mini-en kan ikke nås (${e?.cause?.code || e?.name || 'nettverksfeil'})`, 503);
  }
}
async function fail(r) {
  let j = null; try { j = JSON.parse(await r.text()); } catch { /* */ }
  const code = j?.error?.code;
  if (r.status === 401 || r.status === 403) { markVxDown57('auth', 'Nøkkel/IP avvist'); return err('auth', 'VoxCPM på Mac mini-en godtok ikke nøkkelen', 503); }
  if (r.status === 503) return err(code === 'busy' ? 'busy' : 'unavailable', code === 'busy' ? 'VoxCPM er opptatt – prøv igjen om litt' : 'VoxCPM er ikke klar på Mac mini-en', 503);
  if (r.status === 404 && code === 'ref_missing') return err('ref_missing', 'Referansen mangler på Mac mini-en', 404);
  if (r.status >= 400 && r.status < 500) return err('bad_request', `VoxCPM avviste forespørselen${j?.error?.message ? `: ${String(j.error.message).slice(0, 120)}` : ''}`, 400);
  return err('http', `VoxCPM svarte ${r.status}`, 502);
}

/** Laster opp et referanseopptak (16 kHz mono WAV). → true */
export async function putRef57(sha, wav) {
  if (!SHA_RE57.test(sha)) throw err('bad_request', 'Ugyldig hash', 400);
  const r = await call(`/v1/refs/${sha}`, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: wav }, 30_000);
  if (!r.ok) throw await fail(r);
  await r.arrayBuffer().catch(() => null);
  return true;
}
/** Sletter referansen på Mac-en. → true (slettet) | false (fantes ikke) */
export async function deleteRef57(sha) {
  if (!SHA_RE57.test(sha)) return false;
  const r = await call(`/v1/refs/${sha}`, { method: 'DELETE' }, 10_000);
  await r.arrayBuffer().catch(() => null);
  if (r.status === 204 || r.status === 200) return true;
  if (r.status === 404) return false;
  throw await fail(r);
}

/**
 * Tekst → lyd. voice: {kind:'design', prompt} | {kind:'clone', sha, transcript?, wav:() => Buffer} | null.
 * Mangler referansen på Mac-en (ny eller ryddet), lastes den opp og forespørselen prøves én gang til.
 * → {audio:Buffer, contentType}
 */
export async function speech57(text, { voice = null, language = 'no', speed = 1, format = 'mp3', timeoutMs = 240_000 } = {}) {
  const v = !voice ? null : voice.kind === 'clone' ? { kind: 'clone', ref_sha: voice.sha, ...(voice.transcript ? { ref_text: voice.transcript } : {}) } : { kind: 'design', prompt: voice.prompt };
  const body = JSON.stringify({ input: text, voice: v, language, response_format: format, speed });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await call('/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, timeoutMs);
    if (r.ok) {
      const audio = Buffer.from(await r.arrayBuffer());
      if (!audio.length) throw err('http', 'VoxCPM ga tom lyd', 502);
      return { audio, contentType: String(r.headers.get('content-type') || 'audio/mpeg').split(';')[0] };
    }
    const e = await fail(r);
    if (e.code === 'ref_missing' && attempt === 0 && voice?.kind === 'clone' && typeof voice.wav === 'function') { await putRef57(voice.sha, voice.wav()); continue; }
    throw e;
  }
  throw err('http', 'VoxCPM svarte ikke', 502);
}
