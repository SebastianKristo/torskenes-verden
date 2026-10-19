// Prompt 32 (SERVER32): cache-fiks uten byggesteg – ny versjon slår inn uten Cmd+Shift+R.
//
//   GET /version.json → {build, version, time}   (Cache-Control: no-cache, must-revalidate)
//     build   = APP_BUILD (env) || sha fra data/update/installed.json (når versjonen stemmer) || hash av mtime/størrelse i public/
//               (endres filene i public/ etter oppstart, får build et «-<hash>»-tillegg, så åpne faner ser endringen)
//     version = øverste «## [x.y.z]» i CHANGELOG.md, time = ISO-tid da denne builden ble sett første gang
//   HTML (alle sider): no-cache, must-revalidate; lokale src=/href= til .js/.css får «?v=<build>», og
//     <meta name="nordlys-build" content="<build>"> legges inn i <head> (klienten kan sammenligne med /version.json).
//   /assets/**.js: import/export/import() med relative stier eller /assets/… skrives om til «…js?v=<build>» (cache i minnet,
//     ETag/304). ?v=<build> → public, max-age=31536000, immutable. Uten ?v (eller gammel v) → no-cache.
//   /assets/**.css uten/feil v → no-cache; med riktig v → immutable. sw.js og manifest → no-cache, must-revalidate.
//   /api/*, /finans/api/*, /home/api, /mat/api, /domains/api: no-store, med mindre ruten selv har satt Cache-Control (tiles, logoer, bilder).
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { config } from './config.js';

const PUBLIC = resolve('public');
const TTL = 10_000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache, must-revalidate';
const API_RE = /^\/(api|finans\/api|home\/api|mat\/api|domains\/api)(\/|$)/;

function fingerprint() {
  const h = createHash('sha1');
  const walk = (dir) => {
    let ents = [];
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of ents) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|css|html|webmanifest|json)$/.test(e.name)) {
        try { const s = statSync(p); h.update(`${p}:${s.size}:${s.mtimeMs}\n`); } catch { /* borte */ }
      }
    }
  };
  walk(PUBLIC);
  return h.digest('hex').slice(0, 10);
}

function changelogVersion() {
  try { return readFileSync(resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md'), 'utf8').match(/^##\s*\[([^\]]+)\]/m)?.[1] ?? null; } catch { return null; }
}
function installedSha(version) {
  try {
    const i = JSON.parse(readFileSync(join(resolve(config.dataDir), 'update', 'installed.json'), 'utf8'));
    if (typeof i.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(i.sha) && (!version || !i.version || i.version === version)) return i.sha.slice(0, 12);
  } catch { /* ingen */ }
  return null;
}

let state = null;
function compute() {
  const version = changelogVersion();
  const env = String(process.env.APP_BUILD ?? '').trim().replace(/[^\w.-]/g, '').slice(0, 40);
  const base = env || installedSha(version);
  const fp = fingerprint();
  return { base, fp, version };
}
/** {build, version, time} – revurderes høyst hvert 10. sekund. */
export function buildInfo() {
  const now = Date.now();
  if (state && now - state.checked < TTL) return state.info;
  const cur = compute();
  if (!state) {
    state = { startFp: cur.fp, checked: now, info: { build: cur.base || cur.fp, version: cur.version, time: new Date(now).toISOString() } };
    return state.info;
  }
  state.checked = now;
  const build = cur.base ? (cur.fp === state.startFp ? cur.base : `${cur.base}-${cur.fp.slice(0, 6)}`) : cur.fp;
  if (build !== state.info.build || cur.version !== state.info.version) state.info = { build, version: cur.version, time: new Date(now).toISOString() };
  return state.info;
}
export const _resetBuild = () => { state = null; jsCache.clear(); };

const withV = (u, build) => (u.includes('?') ? u : `${u}?v=${encodeURIComponent(build)}`);
const LOCAL = /^(\.\.?\/|\/(?!\/))/;

/** HTML: lokale .js/.css-lenker får ?v=<build>, og build-meta legges inn i <head>. */
export function versionHtml(html, build = buildInfo().build) {
  let out = String(html).replace(/\b(src|href)=(["'])([^"'?#]+\.(?:js|css))\2/g, (m, a, q, u) => (LOCAL.test(u) ? `${a}=${q}${withV(u, build)}${q}` : m));
  if (!/name=["']nordlys-build["']/.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>\n<meta name="nordlys-build" content="${build}">`);
  return out;
}

/** JS: statiske og dynamiske importer med lokale stier får ?v=<build>. */
export function versionJs(src, build = buildInfo().build) {
  const fix = (pre, q, u) => (LOCAL.test(u) && /\.js$/.test(u) ? `${pre}${q}${withV(u, build)}${q}` : `${pre}${q}${u}${q}`);
  return String(src)
    .replace(/(\bfrom\s*)(["'])([^"'\n]+)\2/g, (m, pre, q, u) => fix(pre, q, u))
    .replace(/(\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g, (m, pre, q, u) => fix(pre, q, u))
    .replace(/(^|[;\n]\s*)(import\s*)(["'])([^"'\n]+)\3/g, (m, lead, pre, q, u) => lead + fix(pre, q, u));
}

const jsCache = new Map(); // fil → {key, body, etag}
function assetFile(pathname) {
  // /assets/brands/* ligger i public/assets/brands, resten av /assets/* i public/*
  const rel = pathname.startsWith('/assets/brands/') ? pathname.slice(1) : pathname.replace(/^\/assets\//, '');
  let dec;
  try { dec = decodeURIComponent(rel); } catch { return null; }
  const f = resolve(PUBLIC, dec);
  return f.startsWith(PUBLIC + sep) ? f : null;
}

/** Monteres tidlig i index.js (før /assets-serveStatic). */
export function installCacheBust(app) {
  app.get('/version.json', (c) => c.json(buildInfo(), 200, { 'Cache-Control': REVALIDATE }));

  // JS under /assets: omskrevet og cachet i minnet.
  app.get('/assets/*', async (c, next) => {
    const p = c.req.path;
    if (!p.endsWith('.js')) return next();
    const f = assetFile(p);
    if (!f) return next();
    let st;
    try { st = statSync(f); } catch { return next(); }
    if (!st.isFile()) return next();
    const { build } = buildInfo();
    const key = `${st.mtimeMs}:${st.size}:${build}`;
    let hit = jsCache.get(f);
    if (!hit || hit.key !== key) {
      const body = versionJs(readFileSync(f, 'utf8'), build);
      hit = { key, body, etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"` };
      jsCache.set(f, hit);
    }
    const cc = c.req.query('v') === build ? IMMUTABLE : 'no-cache';
    const h = { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': cc, ETag: hit.etag };
    if (c.req.header('if-none-match') === hit.etag) return c.body(null, 304, h);
    return c.body(hit.body, 200, h);
  });

  // Headere (og HTML-omskriving) etter at ruten har svart.
  const setCc = (c, v) => {
    try { c.res.headers.set('Cache-Control', v); } catch { // uforanderlige headere (svar rett fra fetch)
      const r = new Response(c.res.body, c.res); c.res = undefined; c.res = r; c.res.headers.set('Cache-Control', v);
    }
  };
  app.use('*', async (c, next) => {
    await next();
    const p = c.req.path;
    const res = c.res;
    if (!res) return;
    if (API_RE.test(p)) {
      if (!res.headers.get('Cache-Control')) setCc(c, 'no-store');
      return;
    }
    if (p === '/sw.js' || p === '/finans/sw.js' || p.endsWith('.webmanifest') || p === '/version.json') { setCc(c, REVALIDATE); return; }
    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('text/html')) {
      if (res.status === 200 && res.body) {
        const body = versionHtml(await res.text());
        const headers = new Headers(res.headers);
        headers.delete('Content-Length');
        headers.set('Cache-Control', REVALIDATE);
        c.res = undefined;
        c.res = new Response(body, { status: 200, headers });
      } else setCc(c, REVALIDATE);
      return;
    }
    if (p.startsWith('/assets/') && /\.(css|js)$/.test(p) && res.ok) setCc(c, c.req.query('v') === buildInfo().build ? IMMUTABLE : 'no-cache');
  });
}
