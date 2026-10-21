// Prompt 43 (SERVER43): oppdatering av Kalender-appen fra appen selv (claude-code-kalender-oppdater-i-appen.md, Kalender Oppdatering.dc.html).
// Ikke Sparkle: serveren leser GitHub-releasene (UPDATE_REPO, standard SebastianKristo/torskenes-verden) med Kalender-X.Y.Z.dmg /
// Kalender-X.Y.Z.apk og SHA256SUMS.txt (release.yml), og appene laster ned, sjekker SHA-256 (+ signeringssertifikatet på Android) og installerer.
// Uinnlogget OK (ingen hemmeligheter i svaret). Cache 10 min (feil prøves igjen etter 1 min).
//
//   GET /api/apps/kalender/latest?platform=mac|android&channel=stabil|beta[&current=1.0]
//       → {app:'kalender', platform, channel, version, build, size, sizeText, file, url, sha256, signature:null, notes[], publishedAt, tag, prerelease,
//          releaseUrl, updateAvailable?}  · 404 {error} når releasen mangler fila for plattformen
//       iOS: {platform:'ios', selfUpdate:false, via:'TestFlight', text:'Oppdateres via TestFlight/IPA', testflightUrl:'itms-beta://'}
//   GET /api/apps/kalender/:version/:file → fila strømmet gjennom serveren (Content-Length, X-Checksum-Sha256)
import { Hono } from 'hono';
import { ghFetch, parseSums, notesFromBody, VERSION_RE } from './app-update.js';
import { parseChangelog, compareVersions } from './system-update.js';

const REPO = /^[\w.-]+\/[\w.-]+$/.test(process.env.UPDATE_REPO ?? '') ? process.env.UPDATE_REPO : 'SebastianKristo/torskenes-verden';
const TTL = 10 * 60_000, ERR_TTL = 60_000;
const FILE_RE = { mac: /^Kalender-(\d{1,4}\.\d{1,4}\.\d{1,4})\.dmg$/, android: /^Kalender-(\d{1,4}\.\d{1,4}\.\d{1,4})\.apk$/ };
const MIME = { dmg: 'application/x-apple-diskimage', apk: 'application/vnd.android.package-archive' };
const nb1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const sizeText = (b) => (b ? (b >= 1024 ** 3 ? `${nb1(b / 1024 ** 3)} GB` : `${nb1(b / 1024 ** 2)} MB`) : null);

const cache = new Map();
export const _clearKalUpdate43 = () => cache.clear();
const assetUrl = (a) => (a?.url && /^https:\/\/api\.github\.com\//.test(a.url) ? a.url : a?.browser_download_url);
async function releases() {
  const hit = cache.get('list');
  if (hit && Date.now() - hit.at < hit.ttl) { if (hit.error) throw new Error(hit.error); return hit.value; }
  try {
    const list = await (await ghFetch(`https://api.github.com/repos/${REPO}/releases?per_page=15`, 'application/vnd.github+json')).json();
    const value = (Array.isArray(list) ? list : []).filter((r) => !r.draft);
    cache.set('list', { at: Date.now(), ttl: TTL, value });
    return value;
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'GitHub svarte ikke' : e.message;
    if (hit?.value) { cache.set('list', { at: Date.now(), ttl: ERR_TTL, value: hit.value }); return hit.value; }
    cache.set('list', { at: Date.now(), ttl: ERR_TTL, error: msg });
    throw new Error(msg);
  }
}
async function sumsOf(rel) {
  const k = `sums:${rel.id ?? rel.tag_name}`;
  if (cache.has(k)) return cache.get(k).value;
  const a = (rel.assets ?? []).find((x) => x?.name === 'SHA256SUMS.txt');
  let value = {};
  if (a) { try { value = parseSums(await (await ghFetch(assetUrl(a), 'application/octet-stream')).text()); } catch { value = {}; } }
  cache.set(k, { value });
  return value;
}
async function notesOf(rel, version) {
  const k = `notes:${rel.tag_name}`;
  if (cache.has(k)) return cache.get(k).value;
  let notes = [];
  try { notes = parseChangelog(await (await ghFetch(`https://raw.githubusercontent.com/${REPO}/${encodeURIComponent(rel.tag_name)}/CHANGELOG.md`, 'text/plain')).text()).find((s) => s.version === version)?.items ?? []; } catch { /* */ }
  if (!notes.length) notes = notesFromBody(rel.body);
  cache.set(k, { value: notes });
  return notes;
}
/** Nyeste release med fila for plattformen. Stabil: ikke prerelease. Beta: også prerelease. */
export async function kalLatest43(platform, channel = 'stabil') {
  const re = FILE_RE[platform];
  const list = await releases();
  const rel = list.find((r) => (channel === 'beta' || !r.prerelease) && (r.assets ?? []).some((a) => re.test(String(a?.name ?? ''))));
  if (!rel) return null;
  const asset = rel.assets.find((a) => re.test(String(a.name)));
  const version = asset.name.match(re)[1];
  const sums = await sumsOf(rel);
  const bm = String(rel.body ?? '').match(new RegExp(`${platform === 'mac' ? '(?:Kalender[^\\n]*?)?(?:build|CFBundleVersion)' : '(?:Kalender[^\\n]*?)?(?:versionCode|build)'}[:= ]+(\\d{1,9})`, 'i'));
  return {
    app: 'kalender', platform, channel, version, build: bm ? Number(bm[1]) : null, size: Number(asset.size) > 0 ? Number(asset.size) : null, sizeText: sizeText(Number(asset.size)), file: asset.name,
    url: `/api/apps/kalender/${version}/${asset.name}`, sha256: sums[asset.name] ?? null, signature: null, notes: await notesOf(rel, version), publishedAt: rel.published_at ?? rel.created_at ?? null,
    tag: rel.tag_name ?? `v${version}`, prerelease: !!rel.prerelease, releaseUrl: typeof rel.html_url === 'string' && rel.html_url.startsWith('https://github.com/') ? rel.html_url : `https://github.com/${REPO}/releases`,
    ...(platform === 'mac' ? { gatekeeper: 'Appen er ad hoc-signert (ikke notarisert). macOS kan spørre første gang den åpnes etter oppdateringen.' } : { needsUnknownSources: true }),
    _asset: assetUrl(asset),
  };
}
const pub = (v) => { const { _asset, ...rest } = v; return rest; };

export const kalUpdate43Api = new Hono();
kalUpdate43Api.get('/latest', async (c) => {
  const platform = String(c.req.query('platform') ?? '').toLowerCase(), channel = String(c.req.query('channel') ?? 'stabil').toLowerCase();
  if (platform === 'ios' || platform === 'ipados') return c.json({ app: 'kalender', platform: 'ios', selfUpdate: false, via: 'TestFlight', text: 'Oppdateres via TestFlight/IPA', testflightUrl: 'itms-beta://' });
  if (!FILE_RE[platform]) return c.json({ error: 'platform må være mac, android eller ios' }, 400);
  if (!['stabil', 'beta', 'stable'].includes(channel)) return c.json({ error: 'channel må være stabil eller beta' }, 400);
  let v;
  try { v = await kalLatest43(platform, channel === 'beta' ? 'beta' : 'stabil'); } catch (e) { return c.json({ error: `Fant ikke oppdateringer: ${e.message}` }, 502); }
  if (!v) return c.json({ error: `Fant ingen Kalender-${platform === 'mac' ? 'DMG' : 'APK'} i releasene` }, 404);
  const out = pub(v);
  const cur = c.req.query('current');
  if (cur && VERSION_RE.test(cur)) out.updateAvailable = compareVersions(out.version, cur) > 0;
  return c.json(out, 200, { 'Cache-Control': 'public, max-age=300' });
});
kalUpdate43Api.get('/:version/:file', async (c) => {
  const v = c.req.param('version'), f = c.req.param('file');
  if (!VERSION_RE.test(v)) return c.json({ error: 'Ugyldig versjon' }, 400);
  const platform = /\.dmg$/i.test(f) ? 'mac' : /\.apk$/i.test(f) ? 'android' : null;
  if (!platform || f !== `Kalender-${v}.${platform === 'mac' ? 'dmg' : 'apk'}`) return c.json({ error: 'Ukjent fil' }, 404);
  let rel = null;
  try { const list = await releases(); const r = list.find((x) => (x.assets ?? []).some((a) => a.name === f)); if (r) rel = { r, a: r.assets.find((a) => a.name === f) }; } catch (e) { return c.json({ error: e.message }, 502); }
  if (!rel) return c.json({ error: `Fant ikke ${f}` }, 404);
  let up;
  try { up = await ghFetch(assetUrl(rel.a), 'application/octet-stream', 300_000); } catch (e) { return c.json({ error: `Nedlastingen feilet: ${e.name === 'TimeoutError' ? 'GitHub svarte ikke' : e.message}` }, 502); }
  const sha = (await sumsOf(rel.r))[f];
  const h = { 'Content-Type': MIME[platform === 'mac' ? 'dmg' : 'apk'], 'Content-Disposition': `attachment; filename="${f}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const len = up.headers.get('content-length') ?? (rel.a.size ? String(rel.a.size) : null);
  if (len && /^\d+$/.test(len)) h['Content-Length'] = len;
  if (sha) h['X-Checksum-Sha256'] = sha;
  return new Response(up.body, { status: 200, headers: h });
});
