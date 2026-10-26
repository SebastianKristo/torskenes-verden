// Prompt 64 (prompt 49 del 7, D7SRV): sammenligning av en eval-kjøring mot grunnlaget (forrige fullførte resultat per case).
// Regel (SERVER64-API.md §5):
//   - bare kjøringer som ikke er miljøfeil teller (eff = runs − envRuns); en case med bare miljøfeil endrer ingenting
//   - regresjon = bestått-andelen er lavere enn i grunnlaget (grunnlaget var grønt 3/3, eller holdt seg på ≥ forrige); nye caser varsler aldri
//   - grunnlaget for casen oppdateres med det nye resultatet (så en case som forblir rød ikke varsles hver natt)

const eff = (c) => Math.max(0, (c.runs ?? 0) - (c.envRuns ?? 0));
export const frac64 = (c) => `${c.passes ?? 0}/${eff(c)}`;
/** Første feilgrunn i casen (ikke miljøfeil først), kort. */
export function firstReason64(c) {
  const r = (c.results ?? []).find((x) => !x.ok && x.status !== 'env') ?? (c.results ?? []).find((x) => !x.ok);
  return r ? String(r.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null : null;
}
/** green | red | partial | env */
export function caseStatus64(c) {
  const e = eff(c);
  if (!e) return 'env';
  return c.passes >= e ? 'green' : c.passes <= 0 ? 'red' : 'partial';
}

/**
 * cases = eval-resultatets cases ([{id, title, passes, runs, envRuns, results}]), baseline = {cases:{id:{passes, runs, envRuns, at, runId}}}.
 * → {regressions, improved, newCases, next (nytt grunnlag), perCase:{id:{baseline, regression}}}
 */
export function compare64(cases, baseline, { runId = null, at = null } = {}) {
  const prev = baseline?.cases ?? {};
  const next = { cases: { ...prev }, runId, at };
  const regressions = [], improved = [], perCase = {};
  let newCases = 0;
  for (const c of cases ?? []) {
    const b = prev[c.id] ?? null;
    perCase[c.id] = { baseline: b ? { passes: b.passes, runs: eff(b), at: b.at ?? null, runId: b.runId ?? null } : null, regression: false };
    const e = eff(c);
    if (!e) continue; // bare miljøfeil: ikke en modellfeil, grunnlaget står
    if (!b || !eff(b)) newCases++;
    else {
      const now = c.passes / e, before = b.passes / eff(b);
      if (now < before) {
        regressions.push({ caseId: c.id, title: c.title ?? c.id, before: frac64(b), now: frac64(c), beforeAt: b.at ?? null, reason: firstReason64(c) });
        perCase[c.id].regression = true;
      } else if (now > before) improved.push({ caseId: c.id, title: c.title ?? c.id, before: frac64(b), now: frac64(c) });
    }
    next.cases[c.id] = { passes: c.passes, runs: c.runs, envRuns: c.envRuns ?? 0, at, runId, title: c.title ?? null };
  }
  return { regressions, improved, newCases, next, perCase };
}
