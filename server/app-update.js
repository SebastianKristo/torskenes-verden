// Oppdatering av Android-appen fra appen selv (prompt 32, APKUPD). Montert under /api/app/android.
//
//   GET /api/app/android/latest        → {version, versionCode, tag, publishedAt, notes[], apkUrl, size, sha256, releaseUrl, ipaUrl}
//   GET /api/app/android/apk/:version  → selve APK-en, strømmet gjennom serveren (telefonen trenger ikke nå github.com,
//                                         og private repoer virker med GITHUB_TOKEN)
//
// Kilden er siste GitHub-release (UPDATE_REPO, samme standard som system-update.js) med `FinansHub-X.Y.Z.apk` og
// `SHA256SUMS.txt` (se .github/workflows/release.yml). Svaret caches i 30 min (feil prøves igjen etter 1 min).
// Endringslisten tas fra CHANGELOG-seksjonen for versjonen (ved taggen), ellers punktene under «## Endringer» i
// release-teksten. Tilgang: sesjon eller app-token (finance:read), alle brukere.
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { parseChangelog, compareVersions } from './system-update.js';

const REPO = /^[\w.-]+\/[\w.-]+$/.test(process.env.UPDATE_REPO ?? '') ? process.env.UPDATE_REPO : 'SebastianKristo/torskenes-verden';
const TTL = 30 * 60_000, ERR_TTL = 60_000, MAX_REDIRECTS = 5;
export const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const APK_RE = /^FinansHub-(\d{1,4}\.\d{1,4}\.\d{1,4})\.apk$/;

let fetcher = (...a) => fetch(...a);
/** Bare for tester: bytt ut fetch (GitHub) og tøm cachen. */
export const _setFetch = (fn) => { fetcher = fn; cache.clear(); };

const token = () => (process.env.GITHUB_TOKEN ?? '').trim();
const ghHeaders = (accept) => {
  const h = { 'User-Agent': 'homelab-os', Accept: accept };
  if (token()) h.Authorization = `Bearer ${token()}`;
  return h;
};

/**
 * Henter med manuell redirect-håndtering: Authorization sendes bare til api.github.com / raw.githubusercontent.com,
 * aldri videre til lagringsverten (S3/objects.githubusercontent.com) som GitHub sender oss til.
 */
export async function ghFetch(url, accept, timeoutMs = 15_000) {
  let u = new URL(url);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (u.protocol !== 'https:') throw new Error('Bare https er tillatt');
    const gh = u.hostname === 'api.github.com' || u.hostname === 'raw.githubusercontent.com';
    const headers = gh ? ghHeaders(accept) : { 'User-Agent': 'homelab-os', Accept: accept };
    const r = await fetcher(u.toString(), { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (!loc) throw new Error('GitHub sendte en tom videresending');
      u = new URL(loc, u);
      continue;
    }
    if (!r.ok) throw new Error(`GitHub svarte ${r.status}`);
    return r;
  }
  throw new Error('For mange videresendinger');
}

/** «abc…  FinansHub-4.24.0.apk» → {"FinansHub-4.24.0.apk": "abc…"} */
export function parseSums(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m) out[m[2].trim()] = m[1].toLowerCase();
  }
  return out;
}

/** Punktene under «## Endringer» i release-teksten (ellers alle punkter), uten markdown. */
export function notesFromBody(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*Endringer/i.test(l));
  const part = at >= 0 ? lines.slice(at + 1) : lines;
  const out = [];
  for (const l of part) {
    if (at >= 0 && /^##\s/.test(l)) break;
    const m = l.match(/^[-*]\s+(.+)$/);
    if (!m) continue;
    const t = m[1].replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    if (t && out.length < 40) out.push(t.slice(0, 400));
  }
  return out;
}

const assetUrl = (a) => (a?.url && /^https:\/\/api\.github\.com\//.test(a.url) ? a.url : a?.browser_download_url);

async function describe(rel) {
  const assets = Array.isArray(rel?.assets) ? rel.assets : [];
  const apk = assets.find((a) => APK_RE.test(String(a?.name ?? '')));
  if (!apk) return null;
  const version = String(apk.name).match(APK_RE)[1];
  let sha256 = null;
  const sums = assets.find((a) => String(a?.name ?? '') === 'SHA256SUMS.txt');
  if (sums) {
    try { sha256 = parseSums(await (await ghFetch(assetUrl(sums), 'application/octet-stream')).text())[apk.name] ?? null; } catch { sha256 = null; }
  }
  let notes = [];
  const tag = typeof rel.tag_name === 'string' ? rel.tag_name.slice(0, 40) : `v${version}`;
  try {
    const sec = parseChangelog(await (await ghFetch(`https://raw.githubusercontent.com/${REPO}/${encodeURIComponent(tag)}/CHANGELOG.md`, 'text/plain')).text())
      .find((s) => s.version === version);
    notes = sec?.items ?? [];
  } catch { /* uten CHANGELOG */ }
  if (!notes.length) notes = notesFromBody(rel.body);
  const ipa = assets.find((a) => /^FinansHub-[\d.]+(-unsigned)?\.ipa$/.test(String(a?.name ?? '')));
  const vc = String(rel.body ?? '').match(/versionCode[:= ]+(\d{1,9})/i);
  return {
    version, versionCode: vc ? Number(vc[1]) : null, tag,
    publishedAt: rel.published_at ?? rel.created_at ?? null,
    notes,
    apkUrl: `/api/app/android/apk/${version}`,
    size: Number(apk.size) > 0 ? Number(apk.size) : null,
    sha256,
    releaseUrl: typeof rel.html_url === 'string' && rel.html_url.startsWith('https://github.com/') ? rel.html_url : `https://github.com/${REPO}/releases/latest`,
    ipaUrl: ipa?.browser_download_url ?? null,
    _asset: assetUrl(apk), _name: apk.name,
  };
}

// key 'latest' eller 'v1.2.3' → {at, ttl, value, error}
const cache = new Map();
async function load(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;
  let entry;
  try {
    const path = key === 'latest' ? 'releases/latest' : `releases/tags/${encodeURIComponent(key)}`;
    const rel = await (await ghFetch(`https://api.github.com/repos/${REPO}/${path}`, 'application/vnd.github+json')).json();
    const value = await describe(rel);
    entry = { at: Date.now(), ttl: value ? TTL : ERR_TTL, value, error: value ? null : 'Fant ingen APK i siste release' };
  } catch (e) {
    entry = { at: Date.now(), ttl: ERR_TTL, value: hit?.value ?? null, error: e.name === 'TimeoutError' ? 'GitHub svarte ikke' : e.message };
  }
  cache.set(key, entry);
  return entry;
}
export const latestRelease = () => load('latest');

const pub = (v) => { const { _asset, _name, ...rest } = v; return rest; };

const api = new Hono();
api.use('*', authOrToken);

api.get('/latest', async (c) => {
  const l = await latestRelease();
  if (!l.value) return c.json({ error: l.error ?? 'Ingen versjon funnet' }, l.error === 'Fant ingen APK i siste release' ? 404 : 502);
  const current = c.req.query('current');
  const out = pub(l.value);
  if (current && VERSION_RE.test(current)) out.updateAvailable = compareVersions(out.version, current) > 0;
  return c.json(out, 200, { 'Cache-Control': 'private, max-age=300' });
});

api.get('/apk/:version', async (c) => {
  const v = c.req.param('version');
  if (!VERSION_RE.test(v)) return c.json({ error: 'Ugyldig versjon' }, 400);
  let rel = (await latestRelease()).value;
  if (rel?.version !== v) rel = (await load(`v${v}`)).value;
  if (rel?.version !== v || !rel._asset) return c.json({ error: `Fant ikke FinansHub ${v}` }, 404);
  let up;
  try { up = await ghFetch(rel._asset, 'application/octet-stream', 120_000); } catch (e) {
    return c.json({ error: `Nedlastingen feilet: ${e.name === 'TimeoutError' ? 'GitHub svarte ikke' : e.message}` }, 502);
  }
  const h = {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${rel._name}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const len = up.headers.get('content-length') ?? (rel.size ? String(rel.size) : null);
  if (len && /^\d+$/.test(len)) h['Content-Length'] = len;
  if (rel.sha256) h['X-Checksum-Sha256'] = rel.sha256;
  return new Response(up.body, { status: 200, headers: h });
});

export default api;
