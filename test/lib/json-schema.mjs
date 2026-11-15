// Liten JSON Schema-validator (draft 2020-12, delmengde) for kontrakttesten, uten avhengigheter.
// Støtter: $ref (lokal #/$defs/… og relative filer i shared/schemas), type (også liste), const, enum, properties, required,
// additionalProperties (bool/skjema), items, prefixItems, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum,
// exclusiveMinimum, multipleOf, anyOf, oneOf, allOf, not, if/then/else, format (date, date-time, uri-reference) og propertyNames.
// Andre nøkkelord ignoreres (som draft 2020-12 sier for ukjente nøkkelord). Skal skjemaene bruke noe mer, utvid her.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'schemas');

const cache = new Map();
export function loadSchema(file) {
  const abs = resolve(SCHEMA_DIR, file);
  if (!cache.has(abs)) cache.set(abs, JSON.parse(readFileSync(abs, 'utf8')));
  return { schema: cache.get(abs), file: abs };
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v);
const typeOk = (want, v) => { const t = typeOf(v); return [want].flat().some((w) => w === t || (w === 'number' && t === 'integer')); };
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const FORMATS = {
  date: (s) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)),
  'date-time': (s) => DATE_TIME.test(s) && !Number.isNaN(Date.parse(s)),
  'uri-reference': (s) => !/\s/.test(s),
};

function resolveRef(ref, ctx) {
  const [path, frag = ''] = ref.split('#');
  let base = ctx;
  if (path) { const l = loadSchema(join(dirname(ctx.file), path).slice(SCHEMA_DIR.length + 1)); base = { root: l.schema, file: l.file }; }
  let node = base.root;
  for (const part of frag.split('/').filter(Boolean)) node = node?.[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
  if (node === undefined) throw new Error(`Fant ikke $ref ${ref} (fra ${ctx.file})`);
  return { schema: node, ctx: base };
}

function check(schema, v, at, ctx, out) {
  if (out.length >= 50) return;
  if (schema === true || schema === undefined) return;
  if (schema === false) { out.push(`${at}: ikke tillatt`); return; }
  if (schema.$ref) { const r = resolveRef(schema.$ref, ctx); check(r.schema, v, at, r.ctx, out); }
  if (schema.type && !typeOk(schema.type, v)) { out.push(`${at}: må være ${[schema.type].flat().join('|')}, er ${typeOf(v)}`); return; }
  if (Object.hasOwn(schema, 'const') && JSON.stringify(schema.const) !== JSON.stringify(v)) out.push(`${at}: må være ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) out.push(`${at}: ${JSON.stringify(v)} er ikke en av ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (typeof v === 'string') {
    if (schema.minLength != null && v.length < schema.minLength) out.push(`${at}: for kort`);
    if (schema.maxLength != null && v.length > schema.maxLength) out.push(`${at}: for lang`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) out.push(`${at}: «${v.slice(0, 40)}» passer ikke ${schema.pattern}`);
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](v)) out.push(`${at}: «${v.slice(0, 40)}» er ikke ${schema.format}`);
  }
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum) out.push(`${at}: under ${schema.minimum}`);
    if (schema.maximum != null && v > schema.maximum) out.push(`${at}: over ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && v <= schema.exclusiveMinimum) out.push(`${at}: må være over ${schema.exclusiveMinimum}`);
    if (schema.multipleOf && Math.abs(v / schema.multipleOf - Math.round(v / schema.multipleOf)) > 1e-9) out.push(`${at}: ikke et multiplum av ${schema.multipleOf}`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems != null && v.length < schema.minItems) out.push(`${at}: minst ${schema.minItems} elementer`);
    if (schema.maxItems != null && v.length > schema.maxItems) out.push(`${at}: høyst ${schema.maxItems} elementer`);
    const pre = schema.prefixItems ?? [];
    v.forEach((x, i) => { const s = i < pre.length ? pre[i] : schema.items; if (s !== undefined) check(s, x, `${at}[${i}]`, ctx, out); });
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of schema.required ?? []) if (!Object.hasOwn(v, k)) out.push(`${at}.${k}: mangler`);
    const props = schema.properties ?? {};
    for (const [k, x] of Object.entries(v)) {
      if (schema.propertyNames) check(schema.propertyNames, k, `${at}{${k}}`, ctx, out);
      if (Object.hasOwn(props, k)) check(props[k], x, `${at}.${k}`, ctx, out);
      else if (schema.additionalProperties !== undefined) check(schema.additionalProperties, x, `${at}.${k}`, ctx, out);
    }
  }
  if (schema.allOf) for (const s of schema.allOf) check(s, v, at, ctx, out);
  if (schema.anyOf && !schema.anyOf.some((s) => errorsAt(s, v, at, ctx).length === 0)) out.push(`${at}: passer ingen av anyOf (${errorsAt(schema.anyOf[0], v, at, ctx)[0] ?? ''})`);
  if (schema.oneOf) { const n = schema.oneOf.filter((s) => errorsAt(s, v, at, ctx).length === 0).length; if (n !== 1) out.push(`${at}: passer ${n} av oneOf (skal være 1)`); }
  if (schema.if !== undefined) {
    const ok = errorsAt(schema.if, v, at, ctx).length === 0;
    if (ok && schema.then !== undefined) check(schema.then, v, at, ctx, out);
    if (!ok && schema.else !== undefined) check(schema.else, v, at, ctx, out);
  }
  if (schema.not && errorsAt(schema.not, v, at, ctx).length === 0) out.push(`${at}: skal ikke passe «not»`);
}
const errorsAt = (s, v, at, ctx) => { const o = []; check(s, v, at, ctx, o); return o; };

/**
 * Validerer value mot skjemafila (relativ til shared/schemas), eller mot en del av den (pointer, f.eks. '#/$defs/date').
 * → liste med feil, tom når gyldig.
 */
export function validate(file, value, pointer = '') {
  const { schema, file: abs } = loadSchema(file);
  const ctx = { root: schema, file: abs };
  const node = pointer ? resolveRef(pointer, ctx).schema : schema;
  const out = [];
  check(node, value, '$', ctx, out);
  return out;
}
