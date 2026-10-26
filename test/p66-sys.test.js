// Prompt 66 (prompt 50b «fullfør utseendet», UTSYS): Innstillinger → System og Backup med samme komponenter som AI-siden
// (rad, kort, banner, KPI-stripe, kontroller) i alle temaer, og søketreff med nye titler.
// Tegner System-/Backup-delene i Node med en liten DOM-stubb og falske API-svar (ingen server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Minimal nettleser: nok til at modulene kan importeres og tegne HTML.
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= globalThis.localStorage;
globalThis.location ??= { hash: '', pathname: '/', search: '', host: 'test' };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, documentElement: { dataset: { hl: '2c' }, getAttribute: () => 'light' },
  querySelector: () => ({}), querySelectorAll: () => [], createElement: () => ({ dataset: {}, style: {}, setAttribute() {} }), head: { appendChild() {} }, body: { appendChild() {} } };

const now = Date.now();
const SUMMARY = {
  backup: { status: 'yellow', title: 'Backup trenger tilsyn', issues: ['3-2-1: legg til NAS'], enabled: false, restic: { available: true, version: '0.17.3' }, running: null, copies: 1, lastOkAt: now - 3600e3,
    targets: [{ id: 'local', label: 'Lokal disk', repo: '/srv/backup/restic51', lastOkAt: now - 3600e3, lastState: 'ok' }], rule321: { copies: 2, media: 1, offsite: false }, restoreTest: null },
  db: { status: 'green', title: 'Databasen er i orden', sizeMb: 12.5, walMb: 1.2, freePct: 3, lastIntegrity: { ok: true, at: now - 864e5 }, lastVacuum: null },
  updates: { status: 'green', title: 'Staging klar', updaterAvailable: true, channel: { staging: true }, previous: { version: '4.54.0', sha: 'abcdef1' },
    staging: { state: 'ready', version: '4.56.0', canPromote: true, smoke: [{ name: '/healthz', ok: true, detail: '200' }, { name: 'innlogging', ok: false, detail: 'tidsavbrudd' }] } },
};
const HEALTH = { overall: 'yellow', overallText: 'Noe trenger tilsyn', at: new Date().toISOString(), mock: true, alerts: [{ level: 'warn', title: 'postgres kjører ikke', text: 'Exited' }],
  containers: { available: true, up: 1, total: 2, items: [{ name: 'postgres', state: 'exited', color: 'red' }, { name: 'homelab-os', state: 'running', color: 'green', cpuText: '4 %', memText: '350 MB' }] },
  disks: [{ name: 'Data-mappen', pct: 11, pctText: '11 %', level: 'ok', text: '12 GB ledig' }], ollama: { ok: false, error: 'Ollama svarer ikke', loaded: [], running: [], queued: 0 },
  macOcr: { enabled: true, ok: false, error: 'Nøkkelen er ikke satt' }, macMini: { ok: false, model: 'Mac mini M4', memGb: 16 }, proxmox: { configured: false }, ntfy: { configured: false } };
const HEAL = { settings: { on: true, maxPerHour: 3 }, drafts: [], events: [{ container: 'sonarr', action: 'restart', ok: true, reason: 'unhealthy', at: new Date().toISOString() }] };
const TRACES = { slowMs: 800, items: [{ at: new Date().toISOString(), method: 'POST', route: '/api/chat/ask', status: 200, ms: 14200, main: 'ai', mainText: 'Mest tid hos AI-modellen',
  spans: { db: { ms: 10 }, ai: { ms: 14000, top: [{ label: 'ollama', ms: 14000 }] }, ext: { ms: 0 }, app: { ms: 190 } } }],
routes: [{ method: 'POST', route: '/api/chat/ask', n: 4, slow: 2, errors: 0, p50: 5000, p95: 72000 }, { method: 'GET', route: '/api/health', n: 9, slow: 0, errors: 0, p50: 3, p95: 9 }] };
globalThis.fetch = async (url) => {
  const u = String(url), body = u.includes('/api/ops51/summary') ? SUMMARY : u.includes('obs51/health') ? HEALTH : u.includes('obs51/heal') ? HEAL : u.includes('obs51/traces') ? TRACES : u.includes('obs51/proxmox') ? { configured: false } : null;
  return { ok: !!body, status: body ? 200 : 404, json: async () => body };
};

const { store } = await import('../public/js/store.js');
store.me = { me: { role: 'admin', username: 'sebastian' } };
const S66 = await import('../public/js/sys66.js');
const ops = await import('../public/js/ops51.js');
const obs = await import('../public/js/obs51.js');
const tick = () => new Promise((r) => setTimeout(r, 30));

test('felles komponenter: System/Backup bruker ui65 fra AI-siden (ingen nye komponenter)', () => {
  const src = rd('public/js/sys66.js');
  assert.match(src, /import \{ ui65 \} from '\.\/ai-control\.js'/);
  for (const f of ['settings-system.js', 'ops51.js', 'obs51.js']) assert.match(rd(`public/js/${f}`), /from '\.\/sys66\.js'/, f);
  const r = S66.row66({ ic: 'db', dot: 'ok', t: 'Integritet', s: 'OK', right: S66.btn('Sjekk', 'data-x') });
  assert.match(r, /class="ac-r[^"]*ctl/); assert.match(r, /class="ac-ic"/); assert.match(r, /ac-icd ok/);
  assert.equal((r.match(/class="ac-ic"/g) ?? []).length, 1, 'én ikonflis per rad');
  const x = S66.xrow66('t.x', { ic: 'flask', t: 'Staging' }, '<p>panel</p>', true);
  assert.match(x, /data-sys66-x="t\.x" aria-expanded="true"/); assert.match(x, /<div class="ac-xp"><p>panel<\/p>/);
  assert.match(S66.root66('x'), /class="ac emb sys66 th-papir"/);
  assert.equal(S66.tone66('yellow'), 'warn'); assert.equal(S66.tone66('crit'), 'bad'); assert.equal(S66.tone66('running'), 'busy');
});

test('Backup-siden: banner (3-2-1 + Oppsett), Kopier, Gjenoppretting (5 prikk-rader + Test nå), Database – ingen kort med fargekant', async () => {
  let n = 0;
  ops.ops51PartHtml('backup', () => { n++; });
  await tick();
  assert.ok(n > 0, 'tegnes på nytt når oppsummeringen er hentet');
  const h = ops.ops51PartHtml('backup', () => {});
  assert.match(h, /^<div class="ac emb sys66 th-papir sys66-bak" data-sys66>/);
  assert.match(h, /class="ac-ban t-warn"[\s\S]*Backup trenger tilsyn[\s\S]*3-2-1: 2 kopier · 1 medier · ingen utenfor huset[\s\S]*data-p51o="settings"/);
  assert.match(h, /<span>KOPIER<\/span>/); assert.match(h, /<span>GJENOPPRETTING<\/span>/); assert.match(h, /<span>DATABASE<\/span>/);
  assert.match(h, /data-p51o="run"[^>]*>Ta backup nå/);
  assert.match(h, /role="switch" aria-checked="false"[^>]*data-p51o="autotog"/, 'restic-bryteren');
  assert.match(h, /data-p51o="restore"[^>]*>Test nå/);
  const gj = h.slice(h.indexOf('<span>GJENOPPRETTING</span>'), h.indexOf('<span>DATABASE</span>'));
  assert.equal((gj.match(/class="ac-r[ "]/g) ?? []).length, 6, 'testraden + 5 steg');
  assert.match(h, /data-p51o="integrity"/); assert.match(h, /data-p51o="vacuum"/);
  assert.doesNotMatch(h, /p51o-card|p51o-grid|border-left/);
});

test('System → Oppdateringer: Staging som utvidbar rad med røyktest-sjekkene og tilbakerulling', () => {
  const h = ops.ops51PartHtml('updates', () => {});
  assert.match(h, /STAGING OG TILBAKERULLING/);
  assert.match(h, /data-sys66-x="upd\.staging" aria-expanded="true"/, 'åpen når en versjon er klar i staging');
  assert.match(h, /\/healthz[\s\S]*innlogging/);
  assert.match(h, /data-p51o="promote"[^>]*>Bytt til 4\.56\.0/);
  assert.match(h, /data-p51o="rollback-image"[^>]*>Gå tilbake til 4\.54\.0/);
  assert.doesNotMatch(h, /p51o-card/);
});

test('System → Oversikt, Selvreparasjon og Ytelse: banner, KPI-stripe, rader og 4 px stolper', async () => {
  obs.setObs51Render(() => {});
  obs.obs51PartHtml('health');
  await tick();
  const ov = obs.obs51PartHtml('health');
  assert.match(ov, /class="ac-ban t-warn"[\s\S]*Noe trenger tilsyn[\s\S]*data-o51="refresh"/);
  assert.match(ov, /class="ac-kpis"/);
  for (const k of ['Containere', 'Disk', 'Ollama', 'Backup']) assert.match(ov, new RegExp(`<span class="ac-lab">${k}</span>`));
  assert.match(ov, /data-go="backup" class="ac-kpi"/);
  assert.match(ov, /<span>CONTAINERE<\/span>[\s\S]*ac-mono">postgres/);
  assert.match(ov, /CPU 4 % · 350 MB/);
  assert.match(ov, /MASKINER OG TJENESTER[\s\S]*Data-mappen[\s\S]*ac-b4[\s\S]*Mac mini[\s\S]*Ollama[\s\S]*Mac-OCR[\s\S]*Proxmox[\s\S]*data-o51="pve"[\s\S]*ntfy/);
  assert.doesNotMatch(ov, /o51-grid|o51-card/);
  const he = obs.obs51PartHtml('heal');
  assert.match(he, /role="switch" aria-checked="true"[^>]*data-o51="healtog"/);
  for (const v of [1, 3, 5, 10]) assert.match(he, new RegExp(`data-o51="max:${v}"`));
  assert.match(he, /class="on" aria-pressed="true" data-o51="max:3"/);
  assert.match(he, /HISTORIKK[\s\S]*sonarr/);
  const tr = obs.obs51PartHtml('trace');
  assert.match(tr, /TREGE FORESPØRSLER[\s\S]*POST \/api\/chat\/ask[\s\S]*Mest tid hos AI-modellen · tregest: ollama/);
  assert.match(tr, /class="ac-b4 sys66-b4"><i style="width:100%;background:#9a6fd0"/, '4 px stolpe i kategorifarge (AI)');
  assert.match(tr, /PER RUTE[\s\S]*4 kall · 2 trege[\s\S]*class="ac-v bad">5000 · 72000 ms/, 'rød over 60 s');
  assert.match(tr, /class="ac-v">3 · 9 ms/);
  assert.doesNotMatch(tr, /<table/);
});

test('settings-system.js: Programvare, Versjoner (mono-rader, Vis flere i etiketten) og Mer som rader med chevron', () => {
  const SY = rd('public/js/settings-system.js');
  assert.match(SY, /root66\(body\)/);
  assert.match(SY, /sec\('PROGRAMVARE'/);
  assert.match(SY, /swb\(!!st\.auto_update, 'data-upd-set="auto_update"'/);
  assert.match(SY, /sec\('VERSJONER', rows, \{ right:/);
  assert.match(SY, /val66\(`Installert \$\{when\(x\.installedAt\)\}`, 'ok'\)/);
  assert.match(SY, /r\('flag', 'Feature flags'/); assert.match(SY, /r\('bug', 'Krasjrapporter'/);
  assert.doesNotMatch(SY, /btn: 'Åpne'\s*\}\)\.html/);
  assert.match(SY, /if \(sys66Click\(e\)\) return true;/);
});

test('stil: egen CSS-fil lenket etter web65.css, farger for Papir, Papir mørk og Nåværende', () => {
  const html = rd('public/app.html');
  assert.ok(html.indexOf('/assets/css/web66-sys.css') > html.indexOf('/assets/css/web65.css'));
  const css = rd('public/css/web66-sys.css');
  assert.match(css, /#settings \.sys66\{--bg:#f3efe6;--card:#fffdf8/);
  assert.match(css, /html\[data-mode="dark"\] #settings \.sys66\{--bg:/);
  assert.match(css, /html:not\(\[data-hl="2c"\]\) #settings \.sys66\{--bg:/);
  assert.match(css, /@media \(max-width:600px\)/);
});

test('søket: gamle titler fra serverens indeks skrives om (Startside → Forside og nyhetsbar), også i AI-svaret', () => {
  const SS = rd('public/js/settings-search.js');
  assert.match(SS, /\.map\(\(x\) => \(\{ \.\.\.x, title: title66\(x\) \}\)\)/);
  assert.match(SS, /answer: answer66\(r\.answer\)/);
  // Funksjonene uten resten av modulen (den trenger nettleseren).
  const code = SS.slice(SS.indexOf('const PATH65'), SS.indexOf('/** Sidenøkkel for ikonet')).replace(/export /g, '');
  const T = new Function(`${code}; return { title66, answer66, path65 };`)();
  assert.equal(T.title66({ id: 'startside', title: 'Startside' }), 'Forside og nyhetsbar');
  assert.equal(T.title66({ id: 'kalendere', title: 'Kalendere' }), 'Kalender og gjøremål');
  assert.equal(T.title66({ id: 'brukere', title: 'Brukere' }), 'Brukere og familie');
  assert.equal(T.title66({ id: 'gjoremal', title: 'Gjøremål' }), 'Gjøremål og lister');
  assert.equal(T.title66({ id: 'ai.motor', title: 'AI-motor' }), 'Modell per oppgave');
  assert.equal(T.title66({ id: 'x', title: 'Startside' }), 'Forside og nyhetsbar');
  assert.equal(T.title66({ id: 'utseende.bakgrunn', title: 'Bakgrunn på forsiden' }), 'Bakgrunn på forsiden', 'nye titler røres ikke');
  assert.equal(T.answer66('Det finner du under Startside → Forside. Snarveier.'), 'Det finner du under Utseende → Forside. Snarveier.');
  assert.equal(T.answer66('Gjøremål og lister er fine.'), 'Gjøremål og lister er fine.', 'bare stier etter «under»');
});
