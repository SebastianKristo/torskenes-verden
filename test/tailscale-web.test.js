// Tailscale (prompt 57) på web og i appene, kildetester uten nettleser: Tailnet øverst på Nettverk bare for admin, Hjem-flisen i
// begge stilene og i PWA-en, bare designtokens i stilarket, ingen polling (sanntid), og Mer → Tailnet i iOS og Android mot de
// samme endepunktene. CI-jobben «Mobilapper» bygger appene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Nettverk: Tailnet-seksjonen står først, og bare for administratorer', () => {
  const net = read('public/js/net.js');
  assert.match(net, /\$\{admin\(\) \? card\('n_tail'\) : ''\}\s*<div class="grid" data-dnd="net">/);
  assert.match(net, /const admin = \(\) => store\.me\?\.me\?\.role === 'admin'/);
});

test('tailnet.js: data fra /api/tailscale, sanntid i stedet for polling, visningen lagres på serveren', () => {
  const t = read('public/js/tailnet.js');
  assert.match(t, /api\('\/tailscale\/devices'\)/);
  assert.match(t, /onLive\('tailscale\.node'/);
  assert.doesNotMatch(t, /setInterval|poll\(/, 'ingen polling i klienten');
  assert.match(t, /\/tailscale\/visning/);
  assert.match(t, /const MAX = 12/);
  for (const s of ['Ping nå', 'Kopier IP', 'Kopier SSH-kommando', 'Åpne ↗', 'Vedlikehold', 'Trafikk i dag', 'Grupper:']) assert.ok(t.includes(s), s);
});

test('nettverk.css: bare tokens, grønn bare i statusprikkene, ingen !important', () => {
  const css = read('public/css/pages/nettverk.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'ingen hex');
  assert.doesNotMatch(css, /rgba?\(/, 'ingen egne farger');
  assert.doesNotMatch(css, /!important/);
  const green = css.split('}').filter((r) => r.includes('--ds-success')).map((r) => r.split('{')[0].trim());
  assert.deepEqual(green, ['.tn-dot.on']);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\)/);
  assert.match(css, /\.tn-chip\{[^}]*height:52px[^}]*border-radius:var\(--ds-radius-full\)/);
});

test('Hjem-flisen: widget i Papir og Glass (bare admin) og flis i PWA-en', () => {
  const e = read('public/js/dash-edit.js');
  assert.match(e, /\['p_tail', 'Tailnet', 4, 8\]/);
  assert.match(e, /\['d_tail', 'Tailnet', 4, 8\]/);
  assert.match(e, /ADMIN_ONLY = new Set\(\['p_tail', 'd_tail'\]\)/);
  const m = read('public/js/oversikt-mobil.js');
  assert.match(m, /w52ts: \['Tailnet', 'h'\]/);
  assert.match(m, /if \(id === 'w52ts'\) return isAdminUser\(\);/);
});

test('iOS og Android: Mer → Tailnet mot /api/tailscale, Ping nå, Kopier IP og Kopier SSH', () => {
  const ios = read('apps/ios/FinansHub/Sources/TailnetSide.swift');
  for (const s of ['"/tailscale/devices"', '"/tailscale/stats"', '"/ping"', 'Ping nå', 'Kopier IP', 'Kopier SSH', 'Vis alle']) assert.ok(ios.includes(s), `iOS: ${s}`);
  assert.match(read('apps/ios/FinansHub/Sources/MoreRows.swift'), /if ml\.har\("tailnet"\)/);
  assert.match(read('apps/ios/FinansHub/Sources/KontoBrukere.swift'), /\.tailnetHost\(p\)/);
  const and = read('apps/android/app/src/main/java/no/kristo/finanshub/Tailnet.kt') + read('apps/android/app/src/main/java/no/kristo/finanshub/ui/TailnetSide.kt');
  for (const s of ['"/tailscale/devices"', '"/tailscale/stats"', '/ping', 'Ping nå', 'Kopier IP', 'Kopier SSH', 'Vis alle']) assert.ok(and.includes(s), `Android: ${s}`);
  assert.match(read('apps/android/app/src/main/java/no/kristo/finanshub/ui/Mer.kt'), /"tailnet" -> row\("tailnet"/);
  const mod = JSON.parse(read('shared/schemas/moduler.json')).moduler.find((x) => x.id === 'tailnet');
  assert.equal(mod.adminOnly, true);
  assert.deepEqual(mod.plattformer, ['ios', 'android']);
});
