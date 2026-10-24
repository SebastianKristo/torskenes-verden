// Prompt 48 (SERVER48): klient for Mac-OCR-tjenesten på Mac mini (tools/vision-ocr, Apple Vision).
//   POST {macOcrUrl}/ocr  multipart «image», Authorization: Bearer <macOcrKey> → felles OCR-format (source «mac_vision»)
//   GET  {macOcrUrl}/health (samme nøkkel) → {ok, languages, …}
// Adressen og nøkkelen er admin-innstillinger (settings.macOcrUrl, secret('macOcrKey')). Nøkkelen logges aldri og tas
// aldri med i feilmeldinger. Tjenesten godtar bare Glimt-serverens IP i tillegg til nøkkelen (se tools/vision-ocr).
import { checkOcr48 } from '../schema.js';
import { normalizeOcr48 } from '../normalize.js';

let F = (u, i) => fetch(u, i);
/** Tester: falsk fetch. */
export const _setMacFetch48 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };
const mask = (s, key) => (key ? String(s).split(key).join('***') : String(s));

const err = (message, extra = {}) => Object.assign(new Error(message), extra);

/** Bildet → felles OCR-format. Kaster med {unavailable:true} når tjenesten ikke svarer, er avslått eller avviser oss. */
export async function macOcr48(image, mime, { url, key, timeoutS = 30, signal = null } = {}) {
  if (!url) throw err('Mac-OCR-adressen er ikke satt', { unavailable: true });
  if (!key) throw err('Mac-OCR-nøkkelen er ikke satt (Innstillinger → AI → Mac-OCR)', { unavailable: true });
  const t0 = Date.now();
  // Tjenesten krever Content-Length (ikke chunked), så multipart-kroppen bygges som én buffer.
  const boundary = `----r48${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const fname = `kvittering.${/png/.test(mime) ? 'png' : /heic|heif/.test(mime) ? 'heic' : /webp/.test(mime) ? 'webp' : 'jpg'}`;
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fname}"\r\nContent-Type: ${mime || 'image/jpeg'}\r\n\r\n`), Buffer.from(image), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const headers = { authorization: `Bearer ${key}`, 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
  const to = AbortSignal.timeout(timeoutS * 1000);
  let res;
  try { res = await F(`${url}/ocr`, { method: 'POST', headers, body, signal: signal ? AbortSignal.any([to, signal]) : to }); }
  catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw err(`Mac-OCR svarte ikke innen ${timeoutS} s`, { unavailable: true, timeout: true });
    throw err(`Mac-OCR kan ikke nås på ${url} (${mask(e?.cause?.code || e?.message || e, key)})`, { unavailable: true, net: true });
  }
  if (res.status === 503 || res.status === 504) throw err(`Mac-OCR er opptatt eller brukte for lang tid (${res.status})`, { unavailable: true, status: res.status });
  if (res.status === 401 || res.status === 403) throw err(`Mac-OCR avviste forespørselen (${res.status}: ${res.status === 401 ? 'feil nøkkel' : 'serverens IP-adresse er ikke på tillatelseslista'})`, { unavailable: true, status: res.status });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw err(`Mac-OCR svarte ${res.status}${t ? `: ${mask(t, key).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`, { unavailable: res.status >= 500 || res.status === 429, status: res.status }); }
  let j;
  try { j = await res.json(); } catch { throw err('Mac-OCR svarte ikke med gyldig JSON'); }
  const ocr = normalizeOcr48({ ...j, source: j?.source ?? 'mac_vision' });
  const errors = checkOcr48(ocr);
  if (errors.length) throw err(`Mac-OCR-svaret følger ikke OCR-formatet (${errors.slice(0, 3).join('; ')})`);
  if (ocr.source !== 'mac_vision') throw err(`Mac-OCR svarte med feil kilde «${ocr.source}»`);
  if (ocr.ms == null) ocr.ms = Date.now() - t0;
  // Med beskjæring (standard) gjelder bbox/image_size det rettede bildet, ikke originalen som lagres (X-OCR-Cropped: 1).
  ocr.cropped = res.headers?.get?.('x-ocr-cropped') === '1';
  return ocr;
}

/** Helse: {configured, ok, ms, languages?, version?, error?}. Kort tidsgrense (2,5 s). */
export async function macHealth48({ url, key, timeoutMs = 2500 } = {}) {
  if (!url || !key) return { configured: !!url && !!key, ok: false, error: !key ? 'Nøkkelen er ikke satt' : 'Adressen er ikke satt' };
  const t0 = Date.now();
  try {
    const r = await F(`${url}/health`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
    const ms = Date.now() - t0;
    if (r.status === 401 || r.status === 403) return { configured: true, ok: false, ms, status: r.status, error: r.status === 401 ? 'Feil nøkkel' : 'Serverens IP-adresse er ikke på tillatelseslista' };
    if (!r.ok) return { configured: true, ok: false, ms, status: r.status, error: `Svarte ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { configured: true, ok: j?.ok !== false, ms, ...(j?.languages ? { languages: j.languages } : {}), ...(j?.version ? { version: String(j.version).slice(0, 40) } : {}), ...(typeof j?.norwegian === 'boolean' ? { norwegian: j.norwegian } : {}), ...(j?.language_note ? { languageNote: String(j.language_note).slice(0, 200) } : {}), ...(Number.isFinite(j?.queued) ? { busy: !!j.busy, queued: j.queued } : {}) };
  } catch (e) {
    return { configured: true, ok: false, ms: Date.now() - t0, error: e?.name === 'TimeoutError' ? `Svarte ikke innen ${timeoutMs / 1000} s` : `Kan ikke nås (${mask(e?.cause?.code || e?.message || e, key)})` };
  }
}
