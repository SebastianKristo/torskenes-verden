// Prompt 61 (prompt 49 del 1, D1SRV) – krokene motoren (glimt45/engine.js) kaller. All logikk for oppskriftene ligger her:
//   prepare61   før planleggeren: avslutter ventende kjøringer (vinduet 2 meldinger / 5 min), ser om meldingen er en retting/angring/
//               omformulering av forrige svar, slår opp lignende oppskrifter (embedding + ordlikhet på malen, intent-filter når det er
//               tydelig), lager few-shot-teksten (maks 3, ~600 tokens) og ev. hurtigveien (planleggeren hoppes over)
//   finish61    etter svaret: registrerer kjøringen (vellykket først når vinduet er over), lager/teller oppskrifter, lærer av rettelser
//   confirmed61 etter POST /confirm: en endrende plan som ventet på «Ja» starter vinduet
//   vote61      tommel opp/ned (api.js)
// Hver del kan slås av for seg (settings.js): save, fewshot, fast, learn.
import { createHash } from 'node:crypto';
import { recipes61, anyOn61 } from './settings.js';
import { slotsOf61, templateOf61, templatePlan61, fillPlan61, sim61, varsIn61, writes61 } from './template.js';
import { T61, rowsOf61, rowOf61, fastOf61, insertRecipe61, insertRun61, pendingRuns61, finishRun61, runByTrace61, runByConfirm61, runOf61, negativesOf61,
  recipeSuccess61, recipeFail61, toBlob61, fromBlob61, parse61, log61 } from './store.js';
import { correctionKind61, rephrased61, learnCorrection61 } from './learn.js';
import { embed47 } from '../glimt45/memory47.js';
import { intentOfTool47 } from '../glimt45/plan47.js';
import { intentOfCalls45 } from '../glimt45/plan.js';
import { estTokens47 } from '../glimt45/params47.js';
import { TOOL45 } from '../glimt45/tools.js';
import { db } from '../db.js';

const EMB_FEW = 0.8, LEX_FEW = 0.6, NEG_SIM = 0.85;
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? s / Math.sqrt(na * nb) : 0; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const talk = (c) => c.tool === 'app.answer' || c.tool === 'chat.answer';
export const planKey61 = (intent, calls) => createHash('sha256').update(`${intent ?? ''}|${JSON.stringify(calls ?? [])}`).digest('hex').slice(0, 24);
const varsOfRow = (row) => [...new Set([...varsIn61(row.query_template), ...varsIn61(parse61(row.plan, {}))])];
const fewshotOk = (row) => row.status === 'active' || (row.status === 'candidate' && (row.success_count >= 1 || row.source === 'correction' || row.source === 'edited'));

/** Intent når tekstmønstrene er tydelige (alle kall i den lokale planen hører til samme intent), ellers null. */
function intentHint(local) {
  const cs = (local?.calls ?? []).filter((c) => !talk(c));
  if (!cs.length) return null;
  const is = [...new Set(cs.map((c) => intentOfTool47(c.tool)).filter(Boolean))];
  return is.length === 1 ? is[0] : null;
}

/* ---------------- Før planleggeren ---------------- */

/**
 * → r61 (følger forespørselen) | null (alt av / forhåndsvisning)
 * opts: {facts, local, today, module, c60, preview, trace}
 */
export async function prepare61(user, text, { facts = [], local = null, today, module = 'home', c60 = null, preview = false, trace = null } = {}) {
  if (preview) return null;
  const set = recipes61(user);
  if (!anyOn61(set)) return null;
  const r = { set, text, module, convId: c60?.conv?.id ?? null, slots: slotsOf61(text, { facts, today }), facts, correction: null, matches: [], fewshot: [], negatives: [], fast: null,
    fastReasons: [], fewshotText: '', hint: '', use: 'none', recipeId: null, similarity: null, trace };
  // 1. Ventende kjøringer: vinduet (2 meldinger / 5 min) og retting/angring/omformulering av den siste.
  if (set.save || set.learn) {
    const pend = pendingRuns61(user);
    const last = pend[pend.length - 1] ?? null;
    const isChoice = !!c60?.choice;
    for (const p of pend) {
      const age = Date.now() - p.created;
      if (p === last && !isChoice) {
        const kind = correctionKind61(text) ?? (rephrased61(p.text, text, parse61(p.slots, {}), r.slots, age) ? 'omformulering' : null);
        if (kind) {
          const why = { retting: 'Rettet av deg', angring: 'Angret', omformulering: 'Omformulert' }[kind];
          r.correction = { kind, run: finishRun61(user, p, 'fail', why) };
          continue;
        }
      }
      if (age >= T61.windowMinutes * 60_000) { finishRun61(user, p, 'success'); continue; }
      const n = p.msgs_after + 1;
      if (n >= T61.windowMessages) finishRun61(user, { ...p, msgs_after: n }, 'success');
      else db.prepare('UPDATE recipe_runs SET msgs_after=? WHERE id=?').run(n, p.id);
    }
  }
  if (r.correction && set.learn && r.correction.kind === 'retting') {
    const o = r.correction.run;
    r.hint = `The user is correcting Glimt's previous answer. Previous request: «${String(o.text).slice(0, 200)}». Glimt answered: «${String(o.reply ?? '').replace(/\*\*/g, '').slice(0, 200)}». `
      + `Plan the PREVIOUS request again with the correction in this message applied (do not repeat the previous plan: ${JSON.stringify(parse61(o.plan, { calls: [] }).calls).slice(0, 300)}).`;
  }
  // 2. Oppslag: lignende oppskrifter (bare når few-shot eller hurtigvei er på).
  const corr = r.correction && r.correction.kind !== 'omformulering';
  if (!(set.fewshot || set.fast) || corr) { r.fastReasons.push(corr ? 'Meldingen er en rettelse' : 'Av i innstillingene'); traceOf(r); return r; }
  const rows = rowsOf61(user).filter((x) => x.status !== 'disabled');
  const negs = negativesOf61(user);
  if (!rows.length && !negs.length) { traceOf(r); return r; }
  const hintI = intentHint(local);
  // Embedding av meldingen bare når noe lagret har en vektor (ellers ordlikhet på malen). Lokal modell via gaten (kb-ruten).
  let qv = null, qModel = null;
  if ([...rows, ...negs].some((x) => x.embedding)) {
    const e = await embed47(user, [text]).catch(() => null);
    if (e?.vectors?.[0]) { qv = e.vectors[0]; qModel = e.model; }
  }
  for (const row of rows) {
    if (hintI && row.intent && row.intent !== hintI) continue;
    const tmpl = templateOf61(text, r.slots, varsOfRow(row));
    const lex = sim61(tmpl, row.query_template);
    const emb = qv && row.embedding && row.embed_model === qModel ? cos(qv, fromBlob61(row.embedding)) : null;
    const score = lex === 1 ? 1 : emb != null ? Math.max(emb, lex) : lex;
    if ((emb != null ? emb >= EMB_FEW : false) || lex >= LEX_FEW) r.matches.push({ row, tmpl, lex: r3(lex), emb: r3(emb), score: r3(score) });
  }
  r.matches.sort((a, b) => b.score - a.score || b.row.success_count - a.row.success_count);
  // 3. Hurtigvei: beste treff, aktiv, ≥ 5 vellykkede, 0 feil av de siste 10, malen like (≥ 0,92), alle variabler fylles i kode.
  const top = r.matches[0] ?? null;
  if (set.fast && top) {
    const f = fastOf61(top.row);
    const reasons = [...f.reasons];
    if (top.lex < T61.fastSimilarity) reasons.push(`Likheten med malen er ${top.lex} (trenger ${T61.fastSimilarity})`);
    if (top.emb != null && top.emb < EMB_FEW && top.lex < 1) reasons.push(`Embedding-likheten er ${top.emb}`);
    const plan = parse61(top.row.plan, { calls: [] });
    const fill = fillPlan61(plan, r.slots);
    if (fill.missing.length) reasons.push(`Kan ikke fylle inn ${fill.missing.map((x) => `{${x}}`).join(', ')} fra meldingen`);
    if (!fill.calls.length || fill.calls.some((c) => !TOOL45[c.tool])) reasons.push('Planen har ukjente verktøy');
    if (!reasons.length) {
      r.fast = { row: top.row, plan: { intent: fill.calls.length > 1 ? 'multi' : intentOfCalls45(fill.calls), planIntent: top.row.intent, module: TOOL45[fill.calls[0].tool]?.module ?? module, calls: fill.calls, engine: 'oppskrift', model: null, fast: 'oppskrift', attempts: 0, recipeId: top.row.id } };
      r.use = 'fast'; r.recipeId = top.row.id; r.similarity = top.score;
    }
    r.fastReasons = reasons;
  } else if (!set.fast) r.fastReasons.push('Hurtigvei er av');
  // 4. Few-shot (bare når planleggeren faktisk kalles): maks 3, ~600 tokens, eksemplets egne verdier.
  if (set.fewshot && !r.fast) {
    const lines = [];
    let tok = 0;
    for (const m of r.matches.filter((x) => fewshotOk(x.row)).slice(0, T61.fewshotMax)) {
      const plan = parse61(m.row.plan, { calls: [] });
      const ex = fillPlan61(plan, parse61(m.row.slots, {}));
      if (ex.missing.length) continue;
      const line = `User: ${m.row.example_query}\n${JSON.stringify({ intent: m.row.intent, calls: ex.calls, needs_clarification: false, clarification_question: null })}`;
      const t = estTokens47(line);
      if (tok + t > T61.fewshotTokens) break;
      lines.push(line); tok += t;
      r.fewshot.push({ id: m.row.id, similarity: m.score, status: m.row.status });
    }
    // Negative eksempler: bare når meldingen ligner sterkt på den som ble rettet.
    for (const n of negs) {
      const tmpl = templateOf61(text, r.slots);
      const lex = sim61(tmpl, n.template);
      const emb = qv && n.embedding && n.embed_model === qModel ? cos(qv, fromBlob61(n.embedding)) : null;
      if (lex < NEG_SIM && !(emb != null && emb >= 0.92)) continue;
      const w = parse61(n.wrong_plan, { calls: [] }), rt = n.right_plan ? parse61(n.right_plan, { calls: [] }) : null;
      const line = `User: ${n.query}\nWRONG (the user corrected this, never plan it like this): ${JSON.stringify(w.calls)}${rt ? `\nRIGHT: ${JSON.stringify(fillPlan61(rt, slotsOf61(n.query, { facts }))).slice(0, 400)}` : ''}`;
      const t = estTokens47(line);
      if (tok + t > T61.fewshotTokens || r.negatives.length >= 2) break;
      lines.push(line); tok += t;
      r.negatives.push(n.id);
    }
    if (lines.length) {
      r.fewshotText = `Learned examples from this user (worked before; when the message is similar, follow them before the general examples):\n${lines.join('\n')}`;
      if (r.fewshot.length) { r.use = 'fewshot'; r.recipeId = r.fewshot[0].id; r.similarity = r.fewshot[0].similarity; }
    }
  }
  traceOf(r);
  return r;
}
function traceOf(r, extra = {}) {
  r.trace?.set('recipe', { use: r.use, recipeId: r.recipeId, similarity: r.similarity, fewshot: r.fewshot, negatives: r.negatives, fast: { used: !!r.fast, reasons: r.fastReasons },
    slots: Object.fromEntries(Object.entries(r.slots).map(([k, v]) => [k, v.value])), template: templateOf61(r.text, r.slots),
    correction: r.correction ? { of: r.correction.run?.trace_id ?? null, kind: r.correction.kind } : null, settings: r.set, ...extra });
}

/* ---------------- Etter svaret ---------------- */

/** Gikk kjøringen bra nok til å telle (før vinduet)? → {ok, reason} */
function outcome(plan, out) {
  if (out.cached) return { ok: null, reason: 'svar-cache' };
  if (out.ask && !out.actions?.some((a) => a.status === 'failed')) return { ok: null, reason: 'spørsmål' };
  if (plan.failed) return { ok: false, reason: 'Planen var ugyldig' };
  if ((plan.attempts ?? 1) > 2) return { ok: false, reason: 'Planen trengte mer enn én reparasjon' };
  if (plan.gapOpen) return { ok: false, reason: 'Steg G fant noe planen ikke dekket' };
  const acts = out.actions ?? [];
  if (!acts.length) return { ok: null, reason: 'ingen verktøy' };
  if (acts.some((a) => a.status === 'failed')) return { ok: false, reason: 'Verktøyet feilet' };
  if (out.ask) return { ok: false, reason: 'Planen var ugyldig' };
  return { ok: true, reason: null };
}

/** → svaret med `recipe` (SERVER61-API.md §1) */
export function finish61(user, r, { plan, out }) {
  if (!r || !out || out.preview || out.legacy) return out;
  const set = r.set;
  const o = outcome(plan, out);
  const fromModel = plan.engine !== 'lokal';
  const calls = (plan.calls ?? []).filter((c) => TOOL45[c.tool]).map((c) => ({ tool: c.tool, args: Object.fromEntries(Object.entries(c.args ?? {}).filter(([k]) => !k.startsWith('_'))) }));
  const intent = plan.planIntent ?? (calls[0] ? intentOfTool47(calls[0].tool) : null) ?? plan.intent;
  const usedRow = r.recipeId ? rowOf61(user, r.recipeId) : null;
  let recipeId = null, use = r.use, state = null, learned = null;
  const tp = templatePlan61(calls, r.slots);
  const tmpl = templateOf61(r.text, r.slots, tp.vars);
  const key = planKey61(intent, tp.calls);
  const confirmTok = out.confirm?.token ?? null;
  if (o.ok === false && usedRow && (use === 'fast' || use === 'fewshot')) {
    // Oppskriften ble brukt og kjøringen feilet: telles som feil for oppskriften.
    insertRun61(user, { recipeId: usedRow.id, traceId: out.traceId ?? r.trace?.id ?? null, convId: r.convId, text: r.text, template: tmpl, slots: r.slots, intent, calls, use, similarity: r.similarity, state: 'fail', reason: o.reason, reply: out.reply });
    recipeFail61(user, usedRow.id, o.reason);
    recipeId = usedRow.id; state = 'fail';
  } else if (o.ok === true && fromModel && (set.save || set.learn) && calls.length && !calls.every(talk)) {
    // Riktig oppskrift for kjøringen: den brukte (samme plan), ellers en lagret med samme plan og lignende mal, ellers en ny kandidat.
    let row = usedRow && usedRow.plan_key === key ? usedRow : null;
    if (!row) row = rowsOf61(user).find((x) => x.plan_key === key && sim61(x.query_template, tmpl) >= 0.8) ?? null;
    if (r.correction && set.learn && r.correction.kind === 'retting') {
      const orig = r.correction.run;
      learned = learnCorrection61(user, { orig, right: { intent, module: out.module ?? r.module, requestModule: r.module, calls }, correctionText: r.text, facts: r.facts, kind: r.correction.kind });
      row = learned.recipe; use = 'new';
      embedLater(user, row.id, orig.text, learned.negativeId);
    } else if (!row && set.save) {
      row = insertRecipe61(user, { exampleQuery: r.text, queryTemplate: tmpl, intent, module: out.module ?? r.module, calls: tp.calls, slots: r.slots, planKey: key, source: 'learned' });
      use = 'new';
      embedLater(user, row.id, r.text);
    } else if (row && use === 'none') use = 'match';
    if (row && set.save) {
      if (use === 'fewshot' && row.id !== r.recipeId) use = 'match';
      state = confirmTok ? 'confirm' : 'pending';
      insertRun61(user, { recipeId: row.id, traceId: out.traceId ?? r.trace?.id ?? null, convId: r.convId, text: r.text, template: tmpl, slots: r.slots, intent, calls, use, similarity: row.id === r.recipeId ? r.similarity : null, state, reply: out.reply, confirmToken: confirmTok });
      recipeId = row.id;
    }
  }
  const row = recipeId ? rowOf61(user, recipeId) : usedRow;
  const res = { ...out, recipe: { id: row?.id ?? null, status: row?.status ?? null, use: recipeId || usedRow ? use : 'none', similarity: r.similarity ?? null, correction: !!learned, feedback: true } };
  traceOf(r, { recorded: state ? { state, recipeId } : null, outcome: o, learned: learned ? { recipeId: learned.recipe.id, negativeId: learned.negativeId, file: learned.learnedPath ? learned.learnedPath.split(/[\\/]/).pop() : null } : null });
  return res;
}
/** Embedding av eksemplet (og ev. det negative eksemplet) i bakgrunnen – svaret venter ikke. */
function embedLater(user, recipeId, text, negativeId = null) {
  Promise.resolve().then(async () => {
    const e = await embed47(user, [text]).catch(() => null);
    if (!e?.vectors?.[0]) return;
    const b = toBlob61(e.vectors[0]);
    try { db.prepare('UPDATE recipes SET embedding=?, embed_model=? WHERE id=? AND user_id=?').run(b, e.model, recipeId, user); } catch { /* */ }
    if (negativeId) { try { db.prepare('UPDATE recipe_negatives SET embedding=?, embed_model=? WHERE id=? AND user_id=?').run(b, e.model, negativeId, user); } catch { /* */ } }
  }).catch(() => { /* best effort */ });
}

/** Etter POST /confirm: den endrende planen er utført (vinduet starter) eller feilet. */
export function confirmed61(user, token, out) {
  const run = runByConfirm61(user, token);
  if (!run) return out;
  const ok = (out.actions ?? []).length && (out.actions ?? []).every((a) => a.status === 'done');
  if (ok) db.prepare("UPDATE recipe_runs SET state='pending', created=?, msgs_after=0 WHERE id=?").run(Date.now(), run.id);
  else { db.prepare("UPDATE recipe_runs SET state='fail', reason=?, finished=? WHERE id=?").run('Verktøyet feilet', Date.now(), run.id); if (run.recipe_id) recipeFail61(user, run.recipe_id, 'Verktøyet feilet'); }
  const row = run.recipe_id ? rowOf61(user, run.recipe_id) : null;
  return { ...out, recipe: { id: row?.id ?? null, status: row?.status ?? null, use: run.use, similarity: run.similarity ?? null, correction: false, feedback: true } };
}

/* ---------------- Tommel opp/ned ---------------- */

const VOTES = 'recipes61_votes';
/** → {ok, vote, recipe:row|null, run:{state}} | {error, status} */
export async function vote61(user, traceId, vote) {
  const { traceOf47 } = await import('../glimt45/trace47.js');
  const { kv } = await import('../db.js');
  const run = runByTrace61(user, traceId);
  if (!run && !traceOf47(traceId, user)) return { error: 'Fant ikke svaret (eller det er for gammelt)', status: 404 };
  try { const v = kv.get(user, VOTES, {}) ?? {}; v[traceId] = { vote, at: Date.now() }; const keep = Object.entries(v).sort((a, b) => b[1].at - a[1].at).slice(0, 300); kv.set(user, VOTES, Object.fromEntries(keep)); } catch { /* */ }
  if (!run) return { ok: true, vote, recipe: null, run: { state: 'none' } };
  if (Date.now() - run.created > 7 * 86400_000) return { error: 'Fant ikke svaret (eller det er for gammelt)', status: 404 };
  db.prepare('UPDATE recipe_runs SET vote=? WHERE id=?').run(vote, run.id);
  const rid = run.recipe_id;
  if (vote === 'up') {
    if (run.state === 'pending' || run.state === 'confirm') { finishRun61(user, { ...run, state: 'x' }, 'success', 'Tommel opp'); if (rid) recipeSuccess61(user, rid, { vote: true }); }
    else if (run.state === 'fail') {
      db.prepare("UPDATE recipe_runs SET state='success', reason='Tommel opp' WHERE id=?").run(run.id);
      if (rid) { db.prepare('UPDATE recipes SET fail_count=MAX(0, fail_count-1), consecutive_fails=0 WHERE id=?').run(rid); recipeSuccess61(user, rid, { vote: true }); }
    } else if (rid) { const row = rowOf61(user, rid); if (row?.status === 'candidate') { db.prepare("UPDATE recipes SET status='active', updated_at=? WHERE id=?").run(Date.now(), rid); log61(user, { kind: 'aktiv', recipeId: rid, reason: 'tommel opp' }); } }
  } else if (vote === 'down') {
    if (run.state === 'pending' || run.state === 'confirm') { finishRun61(user, { ...run, state: 'x' }, 'fail', 'Tommel ned'); if (rid) recipeFail61(user, rid, 'Tommel ned'); }
    else if (run.state === 'success') {
      db.prepare("UPDATE recipe_runs SET state='fail', reason='Tommel ned' WHERE id=?").run(run.id);
      if (rid) { db.prepare('UPDATE recipes SET success_count=MAX(0, success_count-1) WHERE id=?').run(rid); recipeFail61(user, rid, 'Tommel ned'); }
    }
  }
  const after = runOf61(user, run.id);
  return { ok: true, vote, recipe: rid ? rowOf61(user, rid) : null, run: { state: after?.state ?? run.state } };
}
export { writes61 };
