// Prompt 50 (SRVCHAT50): «Les på nytt» som jobb + forståelige feilmeldinger (claude-code-kvittering-les-pa-nytt-502.md).
// POST /finans/api/receipts/:id/reanalyze {engine, apply:false, async:true, small?} → 202 {jobId}; så GET /finans/api/jobs/:jobId hvert 1,5 s.
// Ingen forespørsel holdes åpen mens Glimt leser, så proxyens tidsgrense (502) kan ikke treffe.
import { api } from './core.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Feil → {text, small} der small = vis «Les mindre versjon». Full respons logges til konsollen. */
export function rereadError50(err) {
  try { console.warn('[les på nytt]', err?.status ?? '', err?.kode ?? '', err?.data ?? err?.message ?? err); } catch { /* */ }
  const st = Number(err?.status) || 0, kode = err?.kode ?? null;
  if (kode === 'tidsavbrudd' || kode === 'ulesbar' || st === 502 || st === 504 || st === 524 || st === 408 || err?.name === 'TimeoutError' || /timeout|tidsfrist/i.test(err?.message ?? '')) {
    return { text: kode === 'ulesbar' ? 'Glimt fikk ikke lest kvitteringen. Prøv igjen, eller les en mindre versjon.' : 'Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.', small: true };
  }
  if (kode === 'modell_utilgjengelig' || st === 503) return { text: 'Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.', small: false };
  if (kode === 'bilde_mangler' || (st === 404 && /bilde|original/i.test(err?.message ?? ''))) return { text: 'Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.', small: false, missing: true };
  if (kode === 'gemini_mangler') return { text: err.message, small: false };
  if (st === 409 || kode === 'opptatt') return { text: 'Kvitteringen leses allerede. Vent litt og prøv igjen.', small: false };
  if (!st && err?.message && !/^Feil \d+/.test(err.message)) return { text: err.message, small: false };
  return { text: `Noe gikk galt (kode ${kode ?? st ?? '?'}).`, small: false };
}

/**
 * Leser kvitteringen på nytt som jobb. onTick({secs, msg, pct}) hvert sekund. → reanalyze-resultatet {previous, result, candidateId, …}
 * Kaster Error med status/kode (se rereadError50). signal: AbortSignal (Avbryt → DELETE jobben).
 */
export async function reanalyzeJob50(id, { engine = 'ollama', small = false, apply = false, onTick = () => {}, signal = null, path = null } = {}) {
  const t0 = Date.now();
  let msg = small ? 'Leser en mindre versjon …' : 'Leser …', pct = 0;
  const tick = setInterval(() => onTick({ secs: Math.round((Date.now() - t0) / 1000), msg, pct }), 1000);
  onTick({ secs: 0, msg, pct });
  try {
    const start = await api(path ?? `/receipts/${encodeURIComponent(id)}/reanalyze`, { method: 'POST', json: { engine, apply, async: true, ...(small ? { small: true } : {}) } });
    if (!start?.jobId || (start.result && !start.pending)) return start; // eldre server svarte med en gang
    for (;;) {
      if (signal?.aborted) { api(`/jobs/${encodeURIComponent(start.jobId)}`, { method: 'DELETE' }).catch(() => {}); throw Object.assign(new Error('Avbrutt'), { name: 'AbortError' }); }
      await sleep(1500);
      let j;
      try { j = await api(`/jobs/${encodeURIComponent(start.jobId)}`); } catch (e) { if (e.status === 404) throw Object.assign(new Error('Jobben forsvant (serveren ble kanskje startet på nytt). Prøv igjen.'), { status: 410 }); throw e; }
      if (j.msg || j.text) msg = j.msg || j.text;
      if (Number.isFinite(j.pct)) pct = j.pct;
      if (j.status === 'done') return { ...(j.result ?? {}), jobId: j.id };
      if (j.status === 'cancelled') throw Object.assign(new Error('Avbrutt'), { name: 'AbortError' });
      if (j.status === 'error') throw Object.assign(new Error(j.error || 'Lesingen feilet'), { status: j.httpStatus ?? 500, kode: j.kode ?? null, data: j });
    }
  } finally { clearInterval(tick); }
}
