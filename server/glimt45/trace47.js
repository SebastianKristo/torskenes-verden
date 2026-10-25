// Prompt 47 (GLIMT47): trace per Glimt-forespørsel, så man ser om en feil skyldes minnet, planleggeren, verktøyet eller svaret.
// Lagres per bruker i glimt47_trace med kort levetid (3 dager, maks 100 per bruker). Innhold:
//   melding, minnefakta + hvorfor de matchet, planleggerens JSON, normaliserte verdier (tolkede datoer/steder/beløp),
//   verktøykall med argumenter og avkortet resultat, hvert modellkall (modell, steg, num_ctx, num_predict, temperatur, think,
//   anslått prompt-lengde, prompt_eval_count/eval_count fra Ollama, trimmet?), svar, tid per steg.
// Konsollen får fortsatt bare verktøyvalg uten tekst (engine.logChoice). Tracen er bare synlig for brukeren selv og admin.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS glimt47_trace (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS glimt47_trace_user ON glimt47_trace(user_id, created);`);
const q = (sql) => db.prepare(sql);
export const TRACE_TTL47 = 3 * 86400_000;
export const TRACE_MAX47 = 100;
const clip = (v, n = 600) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null); return s && s.length > n ? `${s.slice(0, n)} …` : s; };

/** Ny trace for én forespørsel. → objekt med step(name, ms), model(call), set(k, v), save(reply) */
export function startTrace47(user, text, { module = 'home' } = {}) {
  const t0 = Date.now();
  const id = `t${randomBytes(9).toString('hex')}`;
  const tr = { id, user, module, at: t0, message: String(text ?? '').slice(0, 1000), facts: [], plan: null, normalized: [], tools: [], models: [], steps: [], reply: null, engine: null, model: null };
  let last = t0;
  return {
    id, data: tr,
    /** Tid for et steg (fra forrige merke). */
    step(name) { const now = Date.now(); tr.steps.push({ name, ms: now - last }); last = now; },
    set(k, v) { tr[k] = v; },
    /** Et modellkall (fra ai-run-svaret: model, params, tokens). */
    model(c) {
      tr.models.push({ step: c.step ?? null, model: c.model ?? null, numCtx: c.params?.numCtx ?? c.numCtx ?? null, numPredict: c.params?.numPredict ?? c.numPredict ?? null,
        temperature: c.params?.temperature ?? c.temperature ?? null, think: c.params?.think ?? c.think ?? null, promptEst: c.params?.promptEst ?? c.promptEst ?? null,
        promptEvalCount: c.tokens?.in ?? null, evalCount: c.tokens?.out ?? null, trimmed: c.trimmed ?? [], ms: c.ms ?? null, ok: c.ok !== false, error: c.error ? clip(c.error, 200) : null,
        // Prompt 55: hvor tiden gikk (kø i gaten, kald lasting/modellbytte, prompt, generering) – så «87 s» kan forklares fra tracen.
        ...(c.errKind ? { errKind: c.errKind } : {}),
        ...(c.timing ? { timing: { queueMs: c.timing.queueMs ?? null, loadMs: c.timing.loadMs ?? null, promptMs: c.timing.promptMs ?? null, genMs: c.timing.genMs ?? null, cold: c.timing.cold ?? null, attempts: c.timing.attempts ?? null, thinkChars: c.timing.thinkChars ?? null, firstTokenMs: c.timing.firstTokenMs ?? null } } : {}),
        // Prompt 59 (del 4): cache-effekten for den faste prefiksen – prompt_eval_count/prompt_eval_duration og andel gjenbrukt.
        prompt: promptStats59(c) });
    },
    tool(a) { tr.tools.push({ tool: a.tool, status: a.status, args: a.args ?? {}, result: clip(a.result ?? a.error ?? null, 700) }); },
    norm(x) { tr.normalized.push(x); },
    save(out = {}) {
      tr.reply = clip(out.reply ?? out.text ?? '', 1200);
      tr.engine = out.engine ?? tr.engine; tr.model = out.model ?? tr.model;
      tr.totalMs = Date.now() - t0;
      try {
        q('INSERT OR REPLACE INTO glimt47_trace(id, user_id, created, data) VALUES(?,?,?,?)').run(id, user, t0, JSON.stringify(tr));
        q('DELETE FROM glimt47_trace WHERE user_id=? AND id NOT IN (SELECT id FROM glimt47_trace WHERE user_id=? ORDER BY created DESC LIMIT ?)').run(user, user, TRACE_MAX47);
      } catch (e) { console.warn('[glimt47] trace:', e.message); }
      return id;
    },
  };
}
/**
 * Prompt 59: prompt-tall for ett modellkall. evalCount = prompt_eval_count (Ollama teller bare tokens som faktisk ble regnet ut;
 * prefiksen som lå i KV-cachen er ikke med), evalMs = prompt_eval_duration, est = anslått hele prompten (tegn / 3,5).
 * reusedPct: eksakt fra oMLX (cached_tokens) når den finnes, ellers anslått 1 − evalCount/est (null når det ikke kan sies).
 */
export function promptStats59(c) {
  const evalCount = c.tokens?.in ?? null, est = c.params?.promptEst ?? c.promptEst ?? null, evalMs = c.timing?.promptMs ?? null;
  const cached = c.timing?.cachedTokens ?? null;
  let reusedPct = null, exact = false;
  if (cached != null && evalCount) { reusedPct = Math.round((100 * cached) / Math.max(evalCount, cached)); exact = true; }
  else if (evalCount != null && est) { const r = evalCount / est; reusedPct = r >= 0.85 ? 0 : Math.max(0, Math.min(100, Math.round(100 * (1 - r)))); } // anslaget bommer ±15 %
  return { evalCount, evalMs, est, reusedPct, ...(exact ? { exact: true, cachedTokens: cached } : {}) };
}
/** En trace (bare eierens egen, eller alle for admin). → data | null */
export function traceOf47(id, user, { admin = false } = {}) {
  const r = q('SELECT * FROM glimt47_trace WHERE id=?').get(String(id ?? ''));
  if (!r || (r.user_id !== user && !admin) || Date.now() - r.created > TRACE_TTL47) return null;
  try { return JSON.parse(r.data); } catch { return null; }
}
/** Siste traces for brukeren (uten innhold, for lista). */
export const tracesOf47 = (user, n = 20) => q('SELECT id, created, data FROM glimt47_trace WHERE user_id=? AND created>? ORDER BY created DESC LIMIT ?').all(user, Date.now() - TRACE_TTL47, n)
  .map((r) => { let d = {}; try { d = JSON.parse(r.data); } catch { /* */ } return { id: r.id, at: r.created, module: d.module ?? null, intent: d.plan?.intent ?? null, tools: (d.tools ?? []).map((x) => x.tool), ms: d.totalMs ?? null }; });
try { q('DELETE FROM glimt47_trace WHERE created < ?').run(Date.now() - TRACE_TTL47); } catch { /* */ }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Enkel HTML-visning (GET /api/glimt/agent/trace/view?id=). */
export function traceHtml47(t) {
  const row = (k, v) => `<tr><th>${esc(k)}</th><td><pre>${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</pre></td></tr>`;
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glimt trace</title>
<style>:root{color-scheme:light dark}body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:Canvas;color:CanvasText}table{border-collapse:collapse;width:100%}th{text-align:left;vertical-align:top;padding:6px 10px 6px 0;white-space:nowrap}td{padding:6px 0;border-top:1px solid #8884}pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,monospace}</style></head>
<body><h1>Glimt trace ${esc(t.id)}</h1><table>${row('Tid', new Date(t.at).toISOString())}${row('Modul', t.module)}${row('Melding', t.message)}${row('Minnefakta', t.facts)}${row('Plan', t.plan)}${row('Normalisert', t.normalized)}${row('Verktøy', t.tools)}${row('Modellkall', t.models)}${row('Svar', t.reply)}${row('Tid per steg', t.steps)}${row('Totalt', `${t.totalMs} ms · ${t.engine ?? ''} · ${t.model ?? ''}`)}</table></body></html>`;
}
