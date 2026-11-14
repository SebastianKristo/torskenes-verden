// Prompt 89 (WEB89): Media uten varsler-pillen (Glimt får plassen), animert bakgrunn på innloggingssiden
// (fasit «Logg inn Animert.dc.html») og standarddomenet os.smarthjemeksperten.no med migrering av lagret gammel standard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p89w-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-89w';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.PUBLIC_URL;
delete process.env.LOCAL_URL;

const ROOT = resolve(import.meta.dirname, '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const OLD = 'smarthjem' + 'experten'; // gammel stavemåte (bygget opp så denne fila ikke selv inneholder den)
const NEW_URL = 'https://os.smarthjemeksperten.no';
const OLD_URL = `https://os.${OLD}.no`;

function walk(dir, out = []) {
  for (const n of readdirSync(join(ROOT, dir))) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = `${dir}/${n}`, s = statSync(join(ROOT, p));
    if (s.isDirectory()) walk(p, out); else if (/\.(js|mjs|cjs|html|css|json|md|txt|webmanifest)$/.test(n) && s.size < 3e6) out.push(p);
  }
  return out;
}

/* ---------------- Domenet ---------------- */

test('domenet: ingen «…experten» igjen i server/, public/ eller test/ (bare migreringskonstanten)', () => {
  const hits = [...walk('server'), ...walk('public'), ...walk('test')].filter((p) => rd(p).includes(OLD));
  assert.deepEqual(hits, []);
  assert.match(rd('server/server47.js'), /DEFAULT_PUBLIC_URL47 = 'https:\/\/os\.smarthjemeksperten\.no'/);
  assert.match(rd('public/js/settings-srv47.js'), /external: 'https:\/\/os\.smarthjemeksperten\.no'/);
  assert.match(rd('public/js/settings-server41.js'), /os\.smarthjemeksperten\.no/);
});

test('domenet: lagret adresse som er nøyaktig den gamle standarden migreres (per bruker og admin), andre røres ikke', async () => {
  const { kv, OWNER } = await import('../server/db.js');
  const { migrateUrl89, OLD_PUBLIC_URL89, NEW_PUBLIC_URL89 } = await import('../server/domain89.js');
  const { meServer41, serverAddresses41 } = await import('../server/auth41.js');
  const { publicUrl46 } = await import('../server/public-url46.js');
  const { serverUrls47 } = await import('../server/server47.js');
  assert.equal(OLD_PUBLIC_URL89, OLD_URL);
  assert.equal(NEW_PUBLIC_URL89, NEW_URL);
  for (const v of [OLD_URL, `${OLD_URL}/`, OLD_URL.toUpperCase()]) assert.equal(migrateUrl89(v), NEW_URL, v);
  for (const v of [`${OLD_URL}/sti`, `http://os.${OLD}.no`, 'https://annen.example.no', null, undefined]) assert.equal(migrateUrl89(v), v);
  assert.equal(serverUrls47().publicUrl, NEW_URL);

  kv.set('u89a', 'server41_me', { local: 'http://10.69.1.50:3000', external: OLD_URL, updatedBy: 'iPhone' });
  kv.set('u89b', 'server41_me', { external: 'https://annen.example.no' });
  const a = meServer41('u89a');
  assert.equal(a.external, NEW_URL);
  assert.equal(a.local, 'http://10.69.1.50:3000');
  assert.equal(kv.get('u89a', 'server41_me').external, NEW_URL, 'skrevet tilbake');
  assert.equal(kv.get('u89a', 'server41_me').updatedBy, 'iPhone', 'resten beholdes');
  assert.equal(meServer41('u89b').external, 'https://annen.example.no');

  kv.set(OWNER, 'server41', { external: `${OLD_URL}/` });
  assert.equal(publicUrl46(), NEW_URL);
  assert.equal(serverAddresses41().external, NEW_URL);
  assert.equal(kv.get(OWNER, 'server41').external, NEW_URL);
});

/* ---------------- Media: varsler-pillen er borte ---------------- */

test('Media-headeren: ingen varsler-pill, rekkefølge Tilbake · Media · faner · Glimt · Hjemme · ✕', () => {
  const js = rd('public/js/media70.js');
  for (const s of ['m70-alw', 'm70-alb', 'm70-alm', 'Ingen varsler', "'varsel', 'varsler'", 'alerts70', 'S.alerts', "data-m70=\"alerts\""]) assert.ok(!js.includes(s), s);
  const top = js.slice(js.indexOf('export function top70'), js.indexOf('/* ---------------- Oversikt'));
  const order = ['m70-back', 'class="m70-h"', 'm70-tabs', 'm70-gl', '${srvHtml}', 'm70-x'].map((s) => top.indexOf(s));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  const css = rd('public/css/media70.css');
  assert.ok(!/\.m70-al[wbmix]/.test(css), 'CSS for pillen er fjernet');
  assert.match(css, /\n\.m70-gl\{flex:1 1 auto;min-width:220px;max-width:520px;/);
  assert.match(css, /@media \(min-width:1181px\)\{\.m70-tl\{gap:12px\}\.m70-tab\{padding:10px 15px\}\}/);
  const m = css.slice(css.indexOf('@media (max-width:900px)'));
  assert.match(m, /\.m70-gl\{order:6;grid-column:1\/-1;min-width:0;max-width:none;/);
});

/* ---------------- Innloggingssiden: animert bakgrunn ---------------- */

test('innlogging: Oslo-scenen erstatter bildet, QR/passord urørt, bare transform/opacity i løkkene, stille ved redusert bevegelse', () => {
  const login = rd('public/js/login.js');
  assert.match(login, /import \{ scene89 \} from '\.\/login-scene89\.js'/);
  assert.match(login, /scene89\(\$\('g-hero'\), st\.bg === 'oslo'\) \? 'none' : bgCss\(st\.bg, true\)/);
  const html = rd('public/login.html');
  assert.ok(html.includes('id="g-qr"') && html.includes('id="f-pw"'));
  const sc = rd('public/js/login-scene89.js');
  for (const s of ['visibilitychange', 'IntersectionObserver', 'prefers-reduced-motion', "aria-hidden', 'true'", 'xMidYMax slice']) assert.ok(sc.includes(s), s);
  assert.ok(!/requestAnimationFrame|setInterval/.test(sc), 'ingen JS-løkke');
  const css = rd('public/css/login.css'), part = css.slice(css.indexOf('/* Prompt 89'));
  for (const k of part.matchAll(/@keyframes (sc89-[\w-]+)\{(.*)\}\n?/g)) {
    const props = [...k[2].matchAll(/([a-z-]+):/g)].map((x) => x[1]).filter((p) => !['from', 'to'].includes(p));
    for (const p of props) assert.ok(['transform', 'opacity'].includes(p), `${k[1]}: ${p}`);
  }
  assert.match(part, /\.sc89-paused,\.sc89-paused \*\{animation-play-state:paused!important\}/);
  assert.match(part, /@media \(prefers-reduced-motion:reduce\)\{\.sc89,\.sc89 \*,\.sc89-on \.gate-hero-t\{animation:none!important\}\.sc89-curtain\{display:none\}\}/);
  assert.match(part, /\.gate-hero\.sc89-on>:not\(\.sc89\)\{position:relative;z-index:1\}/);
});
