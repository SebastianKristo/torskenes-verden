// Prompt 48 (SERVER48): felles schema for OCR-formatet og kvitteringsformatet (shared/schemas/*.json) og en liten
// JSON-schema-validator uten avhengigheter. Støtter det schemaene bruker: type (også liste, «null»), enum, properties,
// required, additionalProperties:false, items, minItems/maxItems, minLength/maxLength, pattern, minimum/maximum.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'schemas');
const load = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
export const OCR_SCHEMA48 = load('receipt-ocr.schema.json');
export const RECEIPT_SCHEMA48 = load('receipt.schema.json');

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (!Number.isFinite(v) ? 'nan' : Number.isInteger(v) ? 'integer' : 'number') : typeof v);
const typeOk = (want, v) => { const t = typeOf(v); return [want].flat().some((w) => w === t || (w === 'number' && t === 'integer')); };
const MAX_ERRORS = 25;

/** Validerer v mot schema. → liste med feil («items[2].amount: må være number»), tom når alt er gyldig. */
export function schemaErrors48(schema, v, path = '', out = []) {
  if (out.length >= MAX_ERRORS || !schema || typeof schema !== 'object') return out;
  const at = path || '(rot)';
  if (schema.type && !typeOk(schema.type, v)) { out.push(`${at}: må være ${[schema.type].flat().join(' eller ')}`); return out; }
  if (schema.enum && !schema.enum.includes(v)) { out.push(`${at}: må være en av ${schema.enum.join(', ')}`); return out; }
  if (typeof v === 'string') {
    if (schema.minLength != null && v.length < schema.minLength) out.push(`${at}: for kort`);
    if (schema.maxLength != null && v.length > schema.maxLength) out.push(`${at}: for lang (maks ${schema.maxLength} tegn)`);
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) out.push(`${at}: har feil format`);
  }
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum) out.push(`${at}: må være minst ${schema.minimum}`);
    if (schema.maximum != null && v > schema.maximum) out.push(`${at}: kan ikke være over ${schema.maximum}`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems != null && v.length < schema.minItems) out.push(`${at}: må ha minst ${schema.minItems} elementer`);
    if (schema.maxItems != null && v.length > schema.maxItems) { out.push(`${at}: for mange elementer (maks ${schema.maxItems})`); return out; }
    if (schema.items) v.forEach((x, i) => schemaErrors48(schema.items, x, `${path}[${i}]`, out));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of schema.required ?? []) if (v[k] === undefined) out.push(`${path ? `${path}.` : ''}${k}: mangler`);
    for (const [k, s] of Object.entries(schema.properties ?? {})) if (v[k] !== undefined) schemaErrors48(s, v[k], path ? `${path}.${k}` : k, out);
    if (schema.additionalProperties === false) for (const k of Object.keys(v)) if (!schema.properties?.[k]) out.push(`${path ? `${path}.` : ''}${k}: ukjent felt`);
  }
  return out.slice(0, MAX_ERRORS);
}
export const checkOcr48 = (v) => schemaErrors48(OCR_SCHEMA48, v);
export const checkReceipt48 = (v) => schemaErrors48(RECEIPT_SCHEMA48, v);

/**
 * Schemaet som Ollama får i `format`: bare type/properties/required/items/enum (pattern, grenser og tekst fjernes),
 * alle felt påkrevd (modellen skal fylle ut alt, null når ukjent), og merchant/date kan være null.
 */
export function modelFormat48() {
  const strip = (s) => {
    if (Array.isArray(s)) return s.map(strip);
    if (!s || typeof s !== 'object') return s;
    const o = {};
    for (const k of ['type', 'enum', 'properties', 'required', 'items']) if (s[k] !== undefined) o[k] = k === 'properties' ? Object.fromEntries(Object.entries(s[k]).map(([p, v]) => [p, strip(v)])) : k === 'items' ? strip(s[k]) : s[k];
    return o;
  };
  const f = strip(RECEIPT_SCHEMA48);
  f.required = Object.keys(f.properties);
  for (const k of ['merchant', 'date', 'total']) f.properties[k] = { type: [f.properties[k].type, 'null'].flat() };
  for (const k of ['items', 'discounts', 'vat']) f.properties[k].items.required = Object.keys(f.properties[k].items.properties);
  return f;
}
