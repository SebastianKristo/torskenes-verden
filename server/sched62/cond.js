// Prompt 62 (prompt 49 del 2, D2SRV): betingede varsler evalueres i KODE – modellen vurderer aldri betingelsen.
// Et lite, trygt uttrykksspråk (ingen eval av fri tekst): egen tokenizer + rekursiv parser + evaluator.
//   expr   := or
//   or     := and ('or' and)*          and := cmp ('and' cmp)*
//   cmp    := value op number | '(' or ')'
//   value  := fn '(' var ')' | var     fn ∈ max|min|avg|first|last|count   var ∈ VARS62
//   op     := > | >= | < | <= | == | !=
// Eksempel: max(price_nok_kwh) > 2.0 · min(temp_c) < -5 and max(precip_mm) > 1
// parseCondition62(text) gjør norsk tekst («strømprisen går over 2 kr», «temperaturen under -5 grader», «det blir regn») om til
// {text, expr, source, day, label}. evalCondition62(expr, data) → {met, value, ...}. Ukjente navn/tegn → feil (aldri en gjetning).
import { placesIn46 } from '../glimt45/weather46.js';

export const VARS62 = { price_nok_kwh: 'power', temp_c: 'weather', precip_mm: 'weather' };
const FNS = new Set(['max', 'min', 'avg', 'first', 'last', 'count']);
const OPS = new Set(['>', '>=', '<', '<=', '==', '!=']);

function tokens(s) {
  const out = [];
  const src = String(s ?? '');
  if (src.length > 300) throw new Error('Uttrykket er for langt');
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    let m;
    if ((m = /^(?:>=|<=|==|!=|>|<)/.exec(src.slice(i)))) { out.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    if ((m = /^-?\d+(?:[.,]\d+)?/.exec(src.slice(i)))) { out.push({ t: 'num', v: Number(m[0].replace(',', '.')) }); i += m[0].length; continue; }
    if ((m = /^[a-z_][a-z0-9_]*/.exec(src.slice(i)))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    throw new Error(`Ugyldig tegn i uttrykket: «${c}»`);
  }
  return out;
}
/** Uttrykk → AST. Kaster Error med norsk tekst ved feil. */
export function parseExpr62(s) {
  const tk = tokens(s);
  let p = 0;
  const peek = () => tk[p], next = () => tk[p++];
  const want = (t) => { const x = next(); if (!x || x.t !== t) throw new Error(`Forventet «${t}» i uttrykket`); return x; };
  function value() {
    const x = next();
    if (!x || x.t !== 'id') throw new Error('Forventet en variabel eller funksjon');
    if (FNS.has(x.v) && peek()?.t === '(') { want('('); const v = next(); if (!v || v.t !== 'id' || !Object.hasOwn(VARS62, v.v)) throw new Error(`Ukjent variabel: ${v?.v ?? '?'}`); want(')'); return { fn: x.v, v: v.v }; }
    if (!Object.hasOwn(VARS62, x.v)) throw new Error(`Ukjent variabel: ${x.v}`);
    return { fn: 'last', v: x.v };
  }
  function cmp() {
    if (peek()?.t === '(') { next(); const e = or(); want(')'); return e; }
    const l = value();
    const o = next();
    if (!o || o.t !== 'op' || !OPS.has(o.v)) throw new Error('Forventet en sammenligning (>, <, >=, <=, ==, !=)');
    const n = next();
    if (!n || n.t !== 'num' || !Number.isFinite(n.v)) throw new Error('Forventet et tall');
    return { cmp: o.v, l, r: n.v };
  }
  function and() { let a = cmp(); while (peek()?.t === 'id' && peek().v === 'and') { next(); a = { and: [a, cmp()] }; } return a; }
  function or() { let a = and(); while (peek()?.t === 'id' && peek().v === 'or') { next(); a = { or: [a, and()] }; } return a; }
  const ast = or();
  if (p !== tk.length) throw new Error('Uventet tekst til slutt i uttrykket');
  return ast;
}
const agg = (fn, arr) => {
  const a = (Array.isArray(arr) ? arr : [arr]).map(Number).filter(Number.isFinite);
  if (fn === 'count') return a.length;
  if (!a.length) return null;
  if (fn === 'max') return Math.max(...a);
  if (fn === 'min') return Math.min(...a);
  if (fn === 'avg') return a.reduce((x, y) => x + y, 0) / a.length;
  if (fn === 'first') return a[0];
  return a[a.length - 1];
};
const CMP = { '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '==': (a, b) => Math.abs(a - b) < 1e-9, '!=': (a, b) => Math.abs(a - b) >= 1e-9 };
/** Variablene uttrykket bruker. */
export function varsOf62(ast) { const s = new Set(); const walk = (n) => { if (n.and || n.or) (n.and ?? n.or).forEach(walk); else if (n.l) s.add(n.l.v); }; walk(ast); return [...s]; }
/**
 * Evaluerer (ren funksjon). data = {price_nok_kwh:[…], temp_c:[…], …}. → {met:bool, value:number|null (første sammenligning), parts:[…]}
 * Mangler data for en variabel → {met:false, missing:[var]}.
 */
export function evalCondition62(expr, data = {}) {
  const ast = typeof expr === 'string' ? parseExpr62(expr) : expr;
  const parts = [], missing = [];
  const ev = (n) => {
    if (n.and) return ev(n.and[0]) && ev(n.and[1]);
    if (n.or) return ev(n.or[0]) || ev(n.or[1]);
    const v = agg(n.l.fn, data[n.l.v]);
    parts.push({ fn: n.l.fn, var: n.l.v, value: v == null ? null : Math.round(v * 1000) / 1000, op: n.cmp, threshold: n.r });
    if (v == null) { missing.push(n.l.v); return false; }
    return CMP[n.cmp](v, n.r);
  };
  const met = ev(ast);
  return { met: !!met && !missing.length, value: parts[0]?.value ?? null, parts, ...(missing.length ? { missing: [...new Set(missing)] } : {}) };
}

/* ---------------- Norsk tekst → betingelse ---------------- */

const nb = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
const NUM = '(minus\\s*|-\\s*)?(\\d+(?:[.,]\\d+)?)';
const dayOf = (t) => (/(?<![a-zæøå])(i\s*morgen|imorgen|morgendagen)(?![a-zæøå])/.test(t) ? 'tomorrow' : /(?<![a-zæøå])(i\s*dag|idag|i\s*kveld|i\s*natt)(?![a-zæøå])/.test(t) ? 'today' : null);
const UP = /^(over|høyere\s+enn|mer\s+enn|dyrere\s+enn|minst|varmere\s+enn)$/, DOWN = /^(under|lavere\s+enn|mindre\s+enn|billigere\s+enn|kaldere\s+enn)$/;
/** Står det en betingelse i teksten («hvis …», «si fra når …»)? */
export const CONDITION_RE62 = /(?<![a-zæøå])(?:hvis|om|dersom|når|si\s+fra|gi\s+beskjed|varsle?\s+meg)(?![a-zæøå])/;

/**
 * Norsk betingelse → {text, expr, source:'power'|'weather', day:'today'|'tomorrow'|null, label, threshold, op, place?, zone?} | null | {error}.
 * Beløp i øre regnes om til kr/kWh. Strømprisene er med mva (som i appen ellers).
 */
export function parseCondition62(text, { zoneOf = null } = {}) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const t = raw.toLowerCase();
  if (!t) return null;
  let m;
  // Strøm: «strømprisen går over 2 kr», «strømmen blir billigere enn 50 øre», «prisen på strøm over 1,5 kr/kWh».
  const POW = '(?:strøm\\s*pris(?:en|ene|er)?|strømmen|prisen\\s+på\\s+strøm(?:men)?|spotpris(?:en)?|kwh-?pris(?:en)?|strøm)';
  if ((m = new RegExp(`${POW}[^.?!]{0,30}?(over|under|høyere\\s+enn|lavere\\s+enn|mer\\s+enn|mindre\\s+enn|dyrere\\s+enn|billigere\\s+enn|minst)\\s+(?:kr\\.?\\s*)?${NUM}\\s*(kr|kroner|øre)?`).exec(t))) {
    const op = UP.test(m[1]) ? '>' : '<';
    let v = Number(m[3].replace(',', '.')) * (m[2] ? -1 : 1);
    if (m[4] === 'øre' || (!m[4] && v >= 10)) v /= 100; // «over 150» uten enhet = øre
    if (!Number.isFinite(v) || Math.abs(v) > 50) return { error: 'Strømprisgrensen ser ikke riktig ut' };
    const expr = `${op === '>' ? 'max' : 'min'}(price_nok_kwh) ${op} ${Math.round(v * 1000) / 1000}`;
    const day = dayOf(t);
    const zone = zoneOf ? zoneOf(raw) : null;
    return { text: raw, expr, source: 'power', day, op, threshold: v, ...(zone ? { zone } : {}),
      label: `${op === '>' ? 'høyeste' : 'laveste'} strømpris ${day === 'today' ? 'i dag' : 'i morgen'} er ${op === '>' ? 'over' : 'under'} ${nb(v)} kr/kWh` };
  }
  // Temperatur: «temperaturen går under -5», «det blir kaldere enn minus 10 grader», «minusgrader», «frost».
  const place = placesIn46(raw).find((p) => !/^(morgen|dag)$/i.test(p)) ?? null;
  if ((m = new RegExp(`(?:temperatur(?:en)?|gradestokken|det)\\s+(?:går|blir|er|faller|synker|stiger|kommer)?\\s*(?:ned\\s+|opp\\s+)?(?:til\\s+)?(over|under|høyere\\s+enn|lavere\\s+enn|varmere\\s+enn|kaldere\\s+enn)\\s+${NUM}\\s*(?:grader|°|c)?`).exec(t))) {
    const op = UP.test(m[1]) ? '>' : '<';
    const v = Number(m[3].replace(',', '.')) * (m[2] ? -1 : 1);
    if (!Number.isFinite(v) || Math.abs(v) > 60) return { error: 'Temperaturgrensen ser ikke riktig ut' };
    const day = dayOf(t);
    return { text: raw, expr: `${op === '>' ? 'max' : 'min'}(temp_c) ${op} ${v}`, source: 'weather', day, op, threshold: v, place,
      label: `${op === '>' ? 'høyeste' : 'laveste'} temperatur ${day === 'today' ? 'i dag' : 'i morgen'}${place ? ` i ${place}` : ''} er ${op === '>' ? 'over' : 'under'} ${v} °C` };
  }
  if (/(?<![a-zæøå])(minusgrader|kuldegrader|frost|under\s+null|minus\s+grader)(?![a-zæøå])/.test(t)) {
    const day = dayOf(t);
    return { text: raw, expr: 'min(temp_c) < 0', source: 'weather', day, op: '<', threshold: 0, place, label: `det blir minusgrader ${day === 'today' ? 'i dag' : 'i morgen'}${place ? ` i ${place}` : ''}` };
  }
  if (/(?<![a-zæøå])(?:det\s+)?(?:blir|kommer|skal\s+bli)\s+(?:det\s+)?(regn|nedbør|snø|regnvær)(?![a-zæøå])|(?<![a-zæøå])(?:regner|snør)(?![a-zæøå])/.test(t) && /hvis|om|dersom|når|si\s+fra|varsle/.test(t)) {
    const day = dayOf(t);
    return { text: raw, expr: 'max(precip_mm) > 0.5', source: 'weather', day, op: '>', threshold: 0.5, place, label: `det er meldt nedbør ${day === 'today' ? 'i dag' : 'i morgen'}${place ? ` i ${place}` : ''}` };
  }
  return null;
}
/** Kort, sann setning om resultatet (ingen modell). */
export function conditionSentence62(cond, res, data = {}) {
  const p = res.parts?.[0];
  if (!p) return null;
  if (cond.source === 'power') {
    const hrs = data.hours ?? [];
    const at = hrs.length ? (cond.op === '>' ? hrs.reduce((a, b) => (b.kr > a.kr ? b : a)) : hrs.reduce((a, b) => (b.kr < a.kr ? b : a))) : null;
    const day = cond.day === 'today' ? 'i dag' : 'i morgen';
    const span = at ? ` kl. ${String(at.hour).padStart(2, '0')}–${String((at.hour + 1) % 24).padStart(2, '0')}` : '';
    return `Strømprisen ${day} (${data.zone ?? 'NO1'}) ${cond.op === '>' ? 'går opp i' : 'går ned i'} ${nb(p.value)} kr/kWh${span} – ${cond.op === '>' ? 'over' : 'under'} grensen på ${nb(cond.threshold)} kr.`
      + `${data.cheapest && data.priciest ? ` Billigste time kl. ${data.cheapest.hour} (${nb(data.cheapest.kr)} kr), dyreste kl. ${data.priciest.hour} (${nb(data.priciest.kr)} kr).` : ''}`;
  }
  if (p.var === 'temp_c') return `Temperaturen ${cond.day === 'today' ? 'i dag' : 'i morgen'}${data.place ? ` i ${data.place}` : ''} blir ${p.fn === 'min' ? 'ned i' : 'opp i'} ${String(p.value).replace('.', ',')} °C – ${cond.op === '>' ? 'over' : 'under'} grensen på ${cond.threshold} °C.`;
  if (p.var === 'precip_mm') return `Det er meldt ${String(p.value).replace('.', ',')} mm nedbør ${cond.day === 'today' ? 'i dag' : 'i morgen'}${data.place ? ` i ${data.place}` : ''}.`;
  return null;
}
