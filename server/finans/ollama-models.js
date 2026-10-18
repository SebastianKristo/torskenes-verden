// Ollama-modeller: hva som er installert (/api/tags), anbefalte modeller for maskinen, og installering (/api/pull)
// med fremdrift i bakgrunnen. Anbefalingene er laget for en Mac mini M4 med 16 GB delt minne: modellen må få plass
// i minnet sammen med macOS (ca. 10–11 GB er trygt), ellers blir den treg eller feiler.
import { settings } from './db.js';

// size = omtrentlig nedlasting i GB (q4). vision = kan lese bilder (kvitteringer). use = hva den passer til.
export const CATALOG = [
  { name: 'qwen2.5vl:7b', size: 6.0, vision: true, use: ['receipts'], note: 'Best til kvitteringer på 16 GB. Leser norsk tekst og tall godt.', rec: true },
  { name: 'gemma3:12b', size: 8.1, vision: true, use: ['receipts', 'text'], note: 'Leser bilder og skriver godt norsk. Litt tregere.', rec: true },
  { name: 'gemma3:4b', size: 3.3, vision: true, use: ['receipts', 'text'], note: 'Rask og liten, med bilder. Mindre nøyaktig på kvitteringer.' },
  { name: 'llama3.2-vision:11b', size: 7.8, vision: true, use: ['receipts'], note: 'Bilder, men svakere på norsk enn Qwen og Gemma.' },
  { name: 'minicpm-v:8b', size: 5.5, vision: true, use: ['receipts'], note: 'Liten bildemodell med god tekstlesing.' },
  { name: 'qwen3:8b', size: 5.2, vision: false, use: ['text'], note: 'God til AI-søk, sammendrag og kategorisering.', rec: true },
  { name: 'qwen2.5:7b', size: 4.7, vision: false, use: ['text'], note: 'Stabil tekstmodell med god JSON.' },
  { name: 'llama3.1:8b', size: 4.9, vision: false, use: ['text'], note: 'Allsidig tekstmodell.' },
  { name: 'mistral-nemo:12b', size: 7.1, vision: false, use: ['text'], note: 'Sterk på europeiske språk, også norsk.' },
  { name: 'nomic-embed-text', size: 0.3, vision: false, use: ['embed'], note: 'Til AI-søk med vektorer (embeddings).', rec: true },
  { name: 'mxbai-embed-large', size: 0.7, vision: false, use: ['embed'], note: 'Større embedding-modell, litt bedre treff.' },
  { name: 'qwen2.5vl:32b', size: 21, vision: true, use: ['receipts'], note: 'For stor for 16 GB. Krever minst 32 GB minne.', tooBig: true },
  { name: 'gemma3:27b', size: 17, vision: true, use: ['receipts', 'text'], note: 'For stor for 16 GB.', tooBig: true },
];

const base = () => settings().ollamaUrl.replace(/\/$/, '');
const same = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;

/** Installerte modeller og katalogen med «installert»-merke. Kaster med norsk melding når Ollama ikke svarer. */
export async function ollamaModels() {
  let r;
  try { r = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(5000) }); }
  catch (e) { throw Object.assign(new Error(`Ollama kan ikke nås på ${base()} (${e.cause?.code || e.name})`), { status: 502 }); }
  if (!r.ok) throw Object.assign(new Error(`Ollama svarte ${r.status}`), { status: 502 });
  const installed = ((await r.json()).models ?? []).map((m) => ({
    name: m.name, size: m.size ? Math.round(m.size / 1e8) / 10 : null, modified: m.modified_at ?? null,
    family: m.details?.family ?? null, params: m.details?.parameter_size ?? null, quant: m.details?.quantization_level ?? null,
    vision: /vl|vision|llava|minicpm-v|gemma3|moondream|bakllava/i.test(m.name) || (m.details?.families ?? []).includes('clip'),
  }));
  let version = null;
  try { const v = await fetch(`${base()}/api/version`, { signal: AbortSignal.timeout(3000) }); if (v.ok) version = (await v.json()).version ?? null; } catch { /* valgfritt */ }
  const st = settings();
  return {
    ok: true, url: base(), version, installed,
    catalog: CATALOG.map((c) => ({ ...c, installed: installed.some((i) => same(i.name, c.name)) })),
    selected: { receipts: st.ollamaModel, text: st.ollamaTextModel || '', embed: st.embedModel || '' },
    pulls: pullsOut(),
  };
}

/* ---------------- Installering i bakgrunnen ---------------- */

const pulls = new Map(); // navn → { status, completed, total, error, started, done }
const pullsOut = () => [...pulls.entries()].map(([name, p]) => ({ name, ...p, pct: p.total ? Math.round((p.completed / p.total) * 100) : null }));
export const pullStatus = () => pullsOut();

/** Starter `ollama pull` for modellen. Fremdriften leses fra Ollamas strøm og kan hentes med pullStatus(). */
export function startPull(name) {
  const model = String(name ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._\-/]*(?::[a-z0-9._\-]+)?$/i.test(model) || model.length > 80) throw Object.assign(new Error('Ugyldig modellnavn'), { status: 400 });
  const cur = pulls.get(model);
  if (cur && !cur.done) return pullsOut();
  const p = { status: 'starter', completed: 0, total: 0, error: null, started: Date.now(), done: false };
  pulls.set(model, p);
  (async () => {
    try {
      const res = await fetch(`${base()}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, name: model, stream: true }) });
      if (!res.ok || !res.body) throw new Error(`Ollama svarte ${res.status}${res.ok ? '' : `: ${(await res.text().catch(() => '')).slice(0, 160)}`}`);
      const dec = new TextDecoder(); let buf = '';
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.error) throw new Error(m.error);
          p.status = m.status ?? p.status;
          if (m.total) { p.total = m.total; p.completed = m.completed ?? p.completed; }
        }
      }
      p.status = 'ferdig'; p.completed = p.total;
    } catch (e) {
      p.error = e.cause?.code ? `Ollama kan ikke nås (${e.cause.code})` : e.message; p.status = 'feil';
    } finally {
      p.done = true; p.finished = Date.now();
    }
  })();
  return pullsOut();
}

/** Sletter en installert modell (frigjør plass). */
export async function deleteModel(name) {
  const res = await fetch(`${base()}/api/delete`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name, name }), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(`Ollama svarte ${res.status}`), { status: res.status === 404 ? 404 : 502 });
  pulls.delete(name);
}
