// Admin-skjermen «Brukere: brief og figur» (public/js/people55.js): lastes i appen og bruker bare admin-API-ene fra prompt 52.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('people55: lastes i app.html, bruker brief52/access og glimt-char52, bare for admin', () => {
  const js = readFileSync('public/js/people55.js', 'utf8');
  assert.match(readFileSync('public/app.html', 'utf8'), /\/assets\/js\/people55\.js/);
  assert.match(js, /\/api\/admin\/brief52\/access/);
  assert.match(js, /\/api\/admin\/glimt-char52/);
  assert.match(js, /role !== 'admin'\) return/);
  for (const k of ['children', 'homelab', 'domains', 'stocks']) assert.ok(js.includes(`'${k}'`), k);
  const dal = readFileSync('public/js/dal53.js', 'utf8');
  for (const f of ['export const esc', 'export async function api', 'export function overlay']) assert.ok(dal.includes(f), f);
});
