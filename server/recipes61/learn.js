// Prompt 61 (prompt 49 del 1, D1SRV): lære av rettelser («nei, jeg mente …»).
//   correctionKind61(text)              → 'retting' | 'angring' | null (tekstmønster på selve meldingen)
//   rephrased61(prev, text, slotsPrev, slotsNow, ageMs) → true når meldingen ser ut som en omformulering av forrige
//   learnCorrection61(user, {...})      → negativt eksempel (feil plan) + ny kandidat (riktig plan) + testtilfelle i eval/learned/
// Testtilfellene er JSON (data, aldri kode – teksten kommer fra brukeren) og leses av eval (eval/lib/learned61.mjs).
// De ligger lokalt (eval/learned/ i repoet, eller $DATA_DIR/eval-learned når repoet ikke er skrivbart) og er i .gitignore.
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { sim61, templatePlan61, templateOf61, fillPlan61 } from './template.js';
import { insertNegative61, insertRecipe61, parse61, log61 } from './store.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const RETTING = [
  /^\s*(?:nei|næ|neida|nope|feil)\b[\s,.!:–-]*(?:jeg\s+)?(?:mente|mener|tenkte\s+på|ville\s+ha|spurte\s+om|var\s+ute\s+etter)\b/i,
  /^\s*(?:jeg\s+)?mente\s+(?!det\s+ikke)\S/i,
  /^\s*(?:nei[,.!]?\s+)?(?:det\s+var\s+(?:ikke\s+det|feil|ikke\s+den|ikke\s+riktig)|det\s+er\s+(?:feil|ikke\s+riktig)|feil\s+(?:svar|avtale|ting|sted|dag))\b/i,
  /^\s*nei[,.!]?\s+(?:ikke\s+[\p{L}\d-]+[,]?\s+)?(?:men|jeg\s+mener|jeg\s+mente)\b/iu,
  /^\s*nei[,.!]?\s+(?:den|det)\s+(?:andre|nye|riktige)\b/i,
];
const ANGRING = /^\s*(?:angre(?:\s+det)?|angr[eo]r?\s+(?:det|på\s+det)|gjør\s+om\s+(?:det|på\s+det)|ombestemte?\s+meg|fjern\s+det\s+du\s+(?:la\s+inn|gjorde)|ikke\s+gjør\s+det)\b/i;

/** → 'retting' | 'angring' | null */
export function correctionKind61(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 300) return null;
  if (ANGRING.test(t)) return 'angring';
  if (RETTING.some((re) => re.test(t))) return 'retting';
  return null;
}
/** Hva rettelsen sier («nei, jeg mente middagen» → «middagen»). */
export const correctionBody61 = (text) => String(text ?? '').replace(/^\s*(?:nei|næ|neida|nope|feil)?[\s,.!:–-]*(?:jeg\s+)?(?:mente|mener|tenkte\s+på|ville\s+ha|spurte\s+om)?\s*/i, '').trim() || String(text ?? '').trim();

/**
 * Omformulering: lignende ordlyd (likhet 0,5–0,95), innen 3 min, og samme verdier (ingen ny person/sted/tid – da er det et nytt spørsmål).
 */
export function rephrased61(prevText, text, slotsPrev = {}, slotsNow = {}, ageMs = 0) {
  if (ageMs > 3 * 60_000) return false;
  const s = sim61(prevText, text);
  if (s < 0.5 || s >= 0.95) return false;
  for (const k of ['person', 'place', 'when']) {
    const a = slotsPrev?.[k]?.value ?? null, b = slotsNow?.[k]?.value ?? null;
    if ((a || b) && String(a ?? '').toLowerCase() !== String(b ?? '').toLowerCase()) return false;
  }
  return true;
}

/* ---------------- eval/learned/ ---------------- */

let dirOverride = null;
/** Bare for tester/eval: hvor testtilfellene skrives. null = standard. */
export const _setLearnedDir61 = (d) => { dirOverride = d ?? null; };
export function learnedDir61() {
  if (dirOverride) return dirOverride;
  if (process.env.GLIMT_LEARNED_DIR) return process.env.GLIMT_LEARNED_DIR;
  // Testene skriver aldri i repoet.
  if (process.env.NODE_ENV === 'test') return join(config.dataDir, 'eval-learned');
  return join(REPO, 'eval', 'learned');
}
/** Skriv ett testtilfelle. → filstien | null */
export function writeLearned61(doc) {
  const name = `${doc.created.slice(0, 10)}-${doc.id}.json`;
  for (const d of [learnedDir61(), join(config.dataDir, 'eval-learned')]) {
    try { mkdirSync(d, { recursive: true }); const p = join(d, name); writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`); return p; } catch { /* prøv neste */ }
  }
  return null;
}
export function learnedCount61() {
  let n = 0;
  for (const d of [...new Set([learnedDir61(), join(config.dataDir, 'eval-learned')])]) { try { if (existsSync(d)) n += readdirSync(d).filter((f) => f.endsWith('.json')).length; } catch { /* */ } }
  return n;
}

/**
 * Rettelsen er gjort og den nye planen lyktes. orig = kjøringen som ble rettet (recipe_runs-raden), right = {intent, module, calls} (den
 * vellykkede planen etter rettelsen), facts = minnefaktaene for meldingen. → {recipe, negativeId, learnedPath}
 */
export function learnCorrection61(user, { orig, right, correctionText, facts = [], kind = 'retting', embedding = null, embedModel = null }) {
  const slots = parse61(orig.slots, {});
  const wrong = parse61(orig.plan, { calls: [] });
  const tp = templatePlan61(right.calls, slots);
  const tmpl = orig.template || templateOf61(orig.text, slots, tp.vars);
  const negativeId = insertNegative61(user, { recipeId: orig.recipe_id ?? null, query: orig.text, template: templateOf61(orig.text, slots), wrongCalls: wrong.calls, rightCalls: tp.calls, reason: kind, embedding, embedModel });
  const planKey = createHash('sha256').update(`${right.intent}|${JSON.stringify(tp.calls)}`).digest('hex').slice(0, 24);
  const recipe = insertRecipe61(user, { exampleQuery: orig.text, queryTemplate: templateOf61(orig.text, slots, tp.vars) || tmpl, intent: right.intent, module: right.module, calls: tp.calls, slots, planKey, source: 'correction', embedding, embedModel });
  log61(user, { kind: 'rettelse', recipeId: recipe.id, reason: `«${String(correctionText).slice(0, 60)}»` });
  const person = slots.person ? facts.find((f) => String(f.subject).toLowerCase() === String(slots.person.value).toLowerCase()) ?? (slots.person.type ? { kind: 'alias', subject: slots.person.value, object: slots.person.type } : null) : null;
  const doc = {
    id: `L${recipe.id.slice(1, 11)}`, kind: 'glimt-learned/1', created: new Date().toISOString(), source: 'rettelse i Glimt',
    title: `Rettelse: «${String(orig.text).slice(0, 80)}»`, module: right.requestModule ?? right.module ?? 'home', query: orig.text, correction: String(correctionText).slice(0, 300),
    expect: { intent: right.intent, tools: right.calls.map((c) => c.tool), calls: fillPlan61(tp, slots).calls, notCalls: wrong.calls },
    memory: person && person.kind === 'alias' && person.object ? [{ match: person.subject, type: person.object }] : [],
    recipe: { exampleQuery: orig.text, queryTemplate: recipe.query_template, intent: right.intent, module: right.module ?? null, plan: { calls: tp.calls }, slots, status: 'candidate', source: 'correction' },
    negative: { query: orig.text, template: templateOf61(orig.text, slots), wrongPlan: wrong, rightPlan: { calls: tp.calls } },
  };
  const learnedPath = writeLearned61(doc);
  return { recipe, negativeId, learnedPath };
}
