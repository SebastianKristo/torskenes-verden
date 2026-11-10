// Prompt 80 (MEDIA80): interaktivt søk hang på «Søker i 3 indeksere …» etter at alle indekserne var ferdige.
// Rotårsak: jobben sendte done først når Sonarr/Radarr (GET /api/v3/release, grense 180 s) svarte, og nettleseren viste
// resultatlisten bare på done. Nå: listen sendes når siste indekser er ferdig (indexers.done), Sonarr-steget er en egen rad,
// og jobben avsluttes med Prowlarr-treffene etter 20 s (done {partial:true, warn:'sonarr_timeout'}); «Last ned» går via Prowlarr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p80-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-80m';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;

const { kv, OWNER } = await import('../server/db.js');
const m43 = await import('../server/media43.js');
const m44 = await import('../server/media44.js');

const web = readFileSync(new URL('../public/js/media43.js', import.meta.url), 'utf8');
const srv = readFileSync(new URL('../server/media44.js', import.meta.url), 'utf8');

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IDX = [{ id: 1, name: 'TorrentDownload', enable: true }, { id: 2, name: 'The Pirate Bay', enable: true }, { id: 3, name: '1337x', enable: true }];
const HITS = { 1: 14, 2: 10, 3: 4 };

/** Falsk Sonarr + Prowlarr + qBittorrent. sonarrRelease: 'hang' | 'fail' | 'ok'. */
function fake({ sonarrRelease = 'hang', prowlarrGrab = 'ok' } = {}) {
  const calls = [];
  m43._setMediaFetch43(async (url, init = {}) => {
    const u = new URL(url), P = u.pathname, method = init.method ?? 'GET';
    calls.push(`${method} ${u.hostname}${P}`);
    if (u.hostname === 'sonarr.p80') {
      if (P === '/api/v3/episode/7') return json({ id: 7, seriesId: 3, seasonNumber: 2, episodeNumber: 5, title: 'Fem' });
      if (P === '/api/v3/series/3') return json({ id: 3, title: 'Severance', qualityProfileId: 4, images: [] });
      if (P === '/api/v3/qualityprofile') return json([{ id: 4, name: 'HD-1080p' }]);
      if (P === '/api/v3/release') {
        if (sonarrRelease === 'fail') return new Response('boom', { status: 500 });
        if (sonarrRelease === 'ok') return json([{ guid: 'g-1-0', indexerId: 1, indexer: 'TorrentDownload', title: 'Severance.S02E05.1080p.WEB', quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } }, size: 2e9, seeders: 40, leechers: 2, rejected: true, rejections: ['Ikke ønsket'] }]);
        return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))); // henger
      }
      return json([]);
    }
    if (u.hostname === 'prowlarr.p80') {
      if (P === '/api/v1/indexer') return json(IDX);
      if (P === '/api/v1/search' && method === 'GET') {
        const id = +u.searchParams.get('indexerIds');
        await sleep(id * 15);
        return json(Array.from({ length: HITS[id] }, (_, i) => ({ guid: `g-${id}-${i}`, indexerId: id, title: `Severance.S02E05.${i}.${id}.1080p.WEB`, size: 1e9 + i, seeders: 10 + i, leechers: 1, protocol: 'torrent',
          magnetUrl: `magnet:?xt=urn:btih:${String(id).repeat(40)}`, quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } } })));
      }
      if (P === '/api/v1/search' && method === 'POST') return prowlarrGrab === 'ok' ? json({}) : new Response('nei', { status: 500 });
      return json([]);
    }
    if (u.hostname === 'qbit.p80') {
      if (P === '/api/v2/auth/login') return new Response('Ok.', { status: 200, headers: { 'set-cookie': 'SID=abc; path=/' } });
      if (P === '/api/v2/torrents/add') { calls.push(`form category=${init.body.get('category')} tags=${init.body.get('tags')}`); return new Response('Ok.'); }
      return json([]);
    }
    return json({}, 404);
  });
  return calls;
}
kv.set(OWNER, 'media44_sites', [{ id: 'p80', name: 'P80', color: '#2b5d8a', sonarr: { url: 'http://sonarr.p80', key: 'sk' }, prowlarr: { url: 'http://prowlarr.p80', key: 'pk' }, qbit: { url: 'http://qbit.p80', key: 'qp', user: 'admin' } }]);
test.after(() => { m43._setMediaFetch43(null); m44._setSonarrStageMs80(null); });

async function run(opts, stageMs = 150) {
  const calls = fake(opts);
  m44._setSonarrStageMs80(stageMs);
  const events = [];
  const { job } = m44.startSearch44(OWNER, { episodeId: 7, force: true }, 'p80');
  job.subs.add((event, data) => events.push([event, data, Date.now()]));
  for (let i = 0; i < 300 && job.state === 'running'; i++) await sleep(10);
  return { job, events, calls };
}

test('Sonarr henger: listen kommer når siste indekser er ferdig, og jobben avsluttes med Prowlarr-treff etter vakten', async () => {
  const log = []; const orig = console.log; console.log = (...a) => { log.push(a.join(' ')); };
  let r;
  try { r = await run({ sonarrRelease: 'hang' }); } finally { console.log = orig; }
  const { job, events } = r;
  const names = events.map((e) => e[0]);
  // Treff kommer fortløpende med hver indexer.done.
  const idxDone = events.filter((e) => e[0] === 'indexer.done');
  assert.equal(idxDone.length, 3);
  assert.ok(idxDone.every((e) => Array.isArray(e[1].items) && e[1].items.length === e[1].count), 'treffene sendes med indexer.done');
  // indexers.done (listen) før done, med tekst «28 treff fra 3 indeksere · …» og Sonarr-raden.
  const all = events.find((e) => e[0] === 'indexers.done');
  assert.ok(all, names.join(','));
  assert.ok(names.indexOf('indexers.done') < names.indexOf('done'));
  assert.match(all[1].text, /^28 treff fra 3 indeksere · \d/);
  assert.equal(all[1].items.length, 28);
  assert.equal(all[1].stage.state, 'run');
  assert.equal(all[1].stage.text, '⟳ Sjekker kvalitet og avvisninger i Sonarr …');
  // Mens Sonarr-steget pågår: GET-jobben gir også listen (polling-fallback), aldri bare «Søker …».
  // Done med partial + warn.
  const done = events.find((e) => e[0] === 'done');
  assert.ok(done, 'done sendes også når Sonarr ikke svarer');
  assert.equal(done[1].partial, true);
  assert.equal(done[1].warn, 'sonarr_timeout');
  assert.equal(done[1].releases.length, 28);
  assert.ok(done[1].releases.every((x) => x.viaProwlarr && x.canGrab));
  assert.equal(job.result.warning, 'Sonarr svarte ikke, viser treff fra Prowlarr');
  assert.equal(job.state, 'done');
  assert.ok(job.finishedAt, 'telleren stopper');
  assert.equal(events.at(-1)[0], 'end');
  assert.ok(log.some((l) => /^media\.search jobId=\S+ stage=sonarr ms=\d+ result=timeout$/.test(l)), log.join('\n'));
  // Cache: samme søk innen 10 min gir jobben med en gang.
  fake({ sonarrRelease: 'hang' });
  const again = m44.startSearch44(OWNER, { episodeId: 7 }, 'p80');
  assert.equal(again.cached, true);
  assert.equal(again.job.id, job.id);
});

test('jobOut mens Sonarr-steget pågår: indexersAllDone, partialText og treff (polling-fallback)', async () => {
  fake({ sonarrRelease: 'hang' });
  m44._setSonarrStageMs80(5000);
  const { job } = m44.startSearch44(OWNER, { episodeId: 7, force: true }, 'p80');
  for (let i = 0; i < 200 && !job.idxDoneAt; i++) await sleep(10);
  assert.ok(job.idxDoneAt, 'alle indekserne ferdige');
  assert.equal(job.state, 'running');
  assert.equal(job.stage.state, 'run');
  job.ctrl.abort(); job.state = 'cancelled'; job.finishedAt = Date.now();
});

test('Sonarr feiler: done med Prowlarr-treff og varsel; Sonarr ok: stille oppdatering via Sonarr-resultatet', async () => {
  const orig = console.log; console.log = () => {};
  try {
    const f = await run({ sonarrRelease: 'fail' }, 5000);
    const d = f.events.find((e) => e[0] === 'done');
    assert.equal(d[1].warn, 'sonarr_error');
    assert.equal(d[1].releases.length, 28);
    assert.equal(f.job.result.stage.text, 'Sonarr svarte ikke, viser treff fra Prowlarr');
    const ok = await run({ sonarrRelease: 'ok' }, 5000);
    const d2 = ok.events.find((e) => e[0] === 'done');
    assert.equal(d2[1].partial, undefined);
    assert.equal(d2[1].result.stage.state, 'ok');
    assert.equal(d2[1].releases[0].rejected, true, 'score/avvisninger fra Sonarr');
    assert.ok(!m44._prowlarrGrab80.has('g-1-0'), 'Sonarr kjenner treffet → «Last ned» via Sonarr som før');
    assert.ok(m44._prowlarrGrab80.has('g-2-0'));
  } finally { console.log = orig; }
});

test('«Last ned» uten Sonarr: grab via Prowlarr, ellers rett i qBittorrent med riktig kategori og tag', async () => {
  const p = m44._prowlarrGrab80.get('g-3-1');
  assert.ok(p && p.indexerId === 3 && p.svc === 'sonarr' && p.site === 'p80');
  const orig = console.log; const log = []; console.log = (...a) => log.push(a.join(' '));
  try {
    let calls = fake({ prowlarrGrab: 'ok' });
    const r = await m44.grabViaProwlarr80(p);
    assert.equal(r.via, 'prowlarr');
    assert.ok(calls.includes('POST prowlarr.p80/api/v1/search'));
    calls = fake({ prowlarrGrab: 'fail' });
    const q = await m44.grabViaProwlarr80(p);
    assert.deepEqual([q.via, q.category], ['qbit', 'tv-sonarr']);
    assert.ok(calls.includes('form category=tv-sonarr tags=homelab'));
    assert.equal(m44.QBIT_CATEGORY80.radarr, 'radarr');
    assert.ok(!log.join('\n').includes('magnet:') && !log.join('\n').includes('pk'), 'lenke/nøkkel logges ikke');
  } finally { console.log = orig; }
  assert.match(srv, /media44Api\.post\('\/release', \.\.\.G, async \(c, next\) =>/);
});

test('SSE: ingen bufring, hjerteslag «: ping» hvert 10. s', () => {
  assert.match(srv, /c\.header\('X-Accel-Buffering', 'no'\)/);
  assert.match(srv, /s\.write\(': ping\\n\\n'\)/);
  assert.match(srv, /\}, 10_000\);/);
});

test('nettleseren: listen vises når alle indekserne er ferdige, Sonarr-rad, vakt 15 s, teller og cache', () => {
  assert.match(web, /if \(t === 'indexers\.done'\) return showPartial\(j\);/);
  assert.match(web, /if \(allIdx80\(\) && job\.items\.length\) return showPartial\(\);/, 'også uten indexers.done når alle har ✓');
  assert.match(web, /if \(j\.state === 'running' && j\.indexersAllDone\) return showPartial\(/, 'polling-fallback');
  assert.match(web, /'indexers\.done', 'done'\]\.forEach/);
  assert.match(web, /Sjekker kvalitet og avvisninger i \$\{s\.k === 'm' \? 'Radarr' : 'Sonarr'\}/);
  assert.match(web, /data-m80-stage=/);
  assert.match(web, /Math\.max\(job\.lastReal \?\? 0, job\.allDoneAt\) > 15_000/);
  assert.match(web, /<span data-m80-sec>\$\{sec\}<\/span> s/);
  assert.match(web, /cachedAt: Date\.parse\(j0\.cachedAt\) \|\| Date\.now\(\)/);
  assert.match(web, /relCache\.set\(key, \{ at: d\.cachedAt \?\? Date\.now\(\), data: d \}\)/);
});
