#!/usr/bin/env node
// Prompt 59 (prompt 49 del 4): «hvorfor var casen treg?» fra en eksisterende resultatfil (også eldre, f.eks. den fra prompt 55/58).
//   node eval/why59.mjs eval/results/2026-10-25-ollama-qwen3_8b-4.json [--min 10] [--case 07,08]
// Viser per kjøring over --min sekunder: svartid, totalt og rotårsakene fra modellkallene i sporet (bakgrunnsjobb etter svaret,
// lasting/modellbytte, tenking, nye planleggerforsøk, kø i Ollama fra en annen klient, lang generering, prompt-evaluering).
import { readFileSync } from 'node:fs';
import { whySlow59, replyMsOf59, sec59 } from './lib/fast59.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Bruk: node eval/why59.mjs <resultat.json> [--min 10] [--case 07,08]'); process.exit(2); }
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const minMs = (+(opt('min') ?? 10) || 10) * 1000;
const want = opt('case')?.split(',').map((x) => x.trim()).filter(Boolean) ?? null;
const j = JSON.parse(readFileSync(file, 'utf8'));
console.log(`${file} · ${j.meta?.engine ?? j.meta?.backend ?? '?'} · commit ${j.meta?.commit ?? '?'} · ${j.meta?.date ?? ''}`);
for (const c of j.cases ?? []) {
  if (want && !want.some((w) => c.id.startsWith(w) || c.id.includes(w))) continue;
  for (const r of c.results ?? []) {
    if ((r.ms ?? 0) < minMs && !want) continue;
    const calls = (r.trace?.model ?? []).filter((m) => m.kind !== 'embed');
    console.log(`\n${c.id} #${r.run}: totalt ${sec59(r.ms)} · svar ${sec59(replyMsOf59(r))} · ${calls.length} modellkall`);
    for (const m of calls) console.log(`   ${m.model} ${sec59(m.ms)} [last ${sec59(m.loadMs)} · prompt ${m.promptTokens ?? '–'} tok/${sec59(m.promptMs)} · gen ${m.outTokens ?? '–'} tok/${sec59(m.genMs)}${m.thinkingChars ? ` · tenkte ${m.thinkingChars} tegn` : ''}${m.totalMs != null && m.ms - m.totalMs > 1000 ? ` · ventet ${sec59(m.ms - m.totalMs)} i Ollama` : ''}] ${String(m.systemHead || m.lastUser || '').slice(0, 60).replace(/\s+/g, ' ')}`);
    const w = whySlow59(r);
    console.log(w.length ? w.map((x) => `   → ${x.why}`).join('\n') : '   → ingen tydelig årsak i sporet');
  }
}
