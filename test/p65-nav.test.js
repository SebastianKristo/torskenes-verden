// Prompt 65 (prompt 50b, claude-code-innstillinger-samlet.md) – SETNAV: ny sidemeny i Innstillinger (web/PWA), samlede sider,
// «FLYTTET FRA …», System med faner og egen Backup-side, og at gamle lenker/push-lenker/søk peker til de nye stedene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from '../public/js/settings65.js';

const read = (p) => readFileSync(p, 'utf8');
const ST = read('public/js/settings.js');
const SS = read('public/js/settings-search.js');
const SY = read('public/js/settings-system.js');
const SI = read('public/js/settings-integ.js');
const CSS = read('public/css/web65.css');

test('sidemenyen: gruppene og sidene fra samlet-md, i riktig rekkefølge', () => {
  assert.deepEqual(N.MENU65.map(([g]) => g), ['Generelt', 'Husstand', 'Glimt og AI', 'Tilkoblinger', 'Moduler', 'Server']);
  const ids = Object.fromEntries(N.MENU65);
  assert.deepEqual(ids.Generelt, ['konto', 'look', 'varsel', 'app']);
  assert.deepEqual(ids.Husstand, ['users']);
  assert.deepEqual(ids['Glimt og AI'], ['glimt', 'ai']);
  assert.deepEqual(ids.Tilkoblinger, ['int', 'kal']);
  assert.deepEqual(ids.Moduler, ['dom', 'finans', 'media', 'nyheter', 'ruter', 'sporing', 'studie', 'vaer']); // Domener flyttet hit fra Generelt; prompt 70: Sporing mellom Ruter og Studie
  assert.deepEqual(ids.Server, ['system', 'backup', 'logger']);
  // Fjernet som egne menypunkter: Startside, Familie, Gjøremål, Sikkerhet/Innlogging.
  const all = N.MENU65.flatMap(([, l]) => l);
  for (const gone of ['top', 'familie', 'huske', 'sikkerhet']) assert.ok(!all.includes(gone), gone);
  // Faste oppgaver og Kvalitet står under Glimt (ikke egne menypunkter, men sidene og push-lenkene finnes).
  assert.deepEqual(N.PARENT65, { 'faste-oppgaver': 'glimt', kvalitet: 'glimt' });
  // TABS i settings.js: de sammenslåtte sidene er borte, de nye navnene er på plass.
  assert.doesNotMatch(ST, /\['top', 'Startside'/);
  assert.doesNotMatch(ST, /\['familie', 'Familie'/);
  assert.doesNotMatch(ST, /^\s*TABS44\[0\],/m);
  assert.doesNotMatch(ST, /^\s*\.\.\.TABS51,/m);
  assert.match(ST, /\['users', 'Brukere og familie', /);
  assert.match(ST, /\['kal', 'Kalender og gjøremål', /);
  assert.match(ST, /menu65\(\)\.map\(\(\[sec, list\]\)/);
  assert.match(ST, /icBox\(k, 26, 14\)/); // 26 px flis, 14 px ikon
});

test('gamle lenker, push-lenker og aliaser peker til de nye sidene', () => {
  const A = N.ALIAS65;
  assert.equal(A.startside, 'look'); assert.equal(A.top, 'look'); assert.equal(A.layout, 'look');
  assert.equal(A['2fa'], 'konto'); assert.equal(A.sikkerhet, 'konto'); assert.equal(A.passkeys, 'konto'); assert.equal(A.innlogging, 'konto');
  assert.equal(A.familie, 'users'); assert.equal(A.helse, 'users');
  assert.equal(A['gjøremål'], 'kal'); assert.equal(A.gjoremal, 'kal'); assert.equal(A.huske, 'kal'); assert.equal(A.kalendere, 'kal');
  assert.equal(A['glimt-husker'], 'glimt'); assert.equal(A.minne, 'glimt'); // pushen «Glimt har 3 forslag til minnet»
  assert.equal(A.sikkerhetskopi, 'backup');
  assert.equal(A.widgets, undefined, '«widgets» er App → Widgets (underside), ikke en side');
  // Undersider som byttet side: Startside → Faner/Avstand = App, Nyhetsbar/Widgets/Snarveier = Utseende, HA-helse = Brukere og familie.
  assert.deepEqual(N.SUB65, { tabs: 'app', head: 'app', speed: 'look', dash: 'look', mob: 'look', sc: 'look', hahealth: 'users' });
  assert.match(ST, /Object\.assign\(ALIAS, ALIAS65\);/);
  assert.match(ST, /for \(const k of Object\.keys\(ALIAS51\)\) ALIAS\[k\] = 'konto';/);
  assert.match(ST, /Object\.assign\(SUB_TAB, SUB65\);/);
  assert.match(ST, /if \(sub && SUB65\[sub\]\) tab = SUB65\[sub\];/);
  // Push-lenkene til Faste oppgaver og Kvalitet virker fortsatt (egne sider under Glimt).
  assert.match(ST, /'faste-oppgaver': \(\) => fasteView62\(H\)/);
  assert.match(ST, /kvalitet: \(\) => kvalitetView64\(H\)/);
  // «ai/glimt-husker» → Glimt; System-fanen fra lenken.
  assert.match(ST, /if \(sub && ALIAS\[sub\] === 'glimt' && tab !== 'glimt'\) \{ tab = 'glimt'; sub = null; \}/);
});

test('System: faner (Oversikt · Oppdateringer · Ytelse · Selvreparasjon · Mer), Backup er egen side', () => {
  assert.deepEqual(N.SYS_TABS65.map(([k, n]) => [k, n]), [['ov', 'Oversikt'], ['upd', 'Oppdateringer'], ['perf', 'Ytelse'], ['heal', 'Selvreparasjon'], ['mer', 'Mer']]);
  assert.equal(N.sysTabOf65('upd'), 'upd');
  assert.equal(N.sysTabOf65('oppdatering'), 'upd');
  assert.equal(N.sysTabOf65('oppdateringer'), 'upd');
  assert.equal(N.sysTabOf65('helse'), 'ov');
  assert.equal(N.sysTabOf65('bak'), null, 'Backup-fanen finnes ikke lenger');
  assert.match(SY, /tabBar65\(SYS_TABS65, t\)/);
  assert.match(SY, /ops51PartHtml\('updates', rerender\)/);
  assert.doesNotMatch(SY, /ops51SystemHtml|obs51SystemHtml/);
  assert.match(SY, /data-p65-qa="flags"/); assert.match(SY, /data-p65-qa="crashes"/); assert.match(SY, /data-p65-qa="whatsnew"/);
  assert.match(ST, /ops51PartHtml\('backup'/);
  const bar = N.tabBar65(N.SYS_TABS65, 'upd');
  assert.equal((bar.match(/role="tab"/g) ?? []).length, 5);
  assert.match(bar, /data-sys65="upd" aria-selected="true"/);
  assert.equal((bar.match(/<svg width="15" height="15"/g) ?? []).length, 5, '15 px strek-ikon på hver fane');
  // Kvalitet/Brief og figur/Lokale modeller hekter seg ikke lenger på System-siden.
  assert.doesNotMatch(read('public/js/qa51.js'), /set-body\[data-key\^="system/);
  assert.doesNotMatch(read('public/js/people55.js'), /set-body\[data-key\^="system/);
  assert.doesNotMatch(read('public/js/dal53.js'), /set-body\[data-key\^="system/);
  assert.match(read('public/js/people55.js'), /window\.hlPeople55 = openPeople55;/);
});

test('samlede sider: én side av flere visninger med hver sin monterte modul og «FLYTTET FRA …»', () => {
  const gh = (g) => `<section class="sg"><h3 class="sg-t">${g.t}${N.movedTitle65(g)}</h3></section>`;
  const f1 = () => 1, f2 = () => 2;
  const c = N.combine65([
    { v: { groups: [{ t: 'Profil', rows: [] }] } },
    { v: { html: '<div class="s51-host" data-mount-host></div>', mount: f1, search: [{ t: 'Sikkerhet', rows: [] }] }, moved: 'Sikkerhet' },
    { v: { pre: '<div data-ai-glimt65 data-mount-host="aiglimt"></div>', groups: [], mount: f2 }, moved: 'AI → Glimt og chat', sel: '[data-ai-glimt65]' },
    { v: { groups: [{ t: 'Forside', rows: [] }] }, moved: 'Startside' },
  ], gh);
  assert.deepEqual(c.mounts.map(([s]) => s), ['[data-mh65="1"]', '[data-ai-glimt65]']);
  assert.equal(c.mounts[0][1], f1); assert.equal(c.mounts[1][1], f2);
  assert.match(c.html, /data-mount-host data-mh65="1"/);
  assert.match(c.html, /data-mount-host="aiglimt"/);
  assert.match(c.html, /FLYTTET FRA SIKKERHET/);
  assert.match(c.html, /FLYTTET FRA AI → GLIMT OG CHAT/);
  assert.match(c.html, /<h3 class="sg-t">Forside<span class="set-moved" data-moved65>FLYTTET FRA STARTSIDE<\/span><\/h3>/);
  assert.deepEqual(c.search.map((g) => g.t), ['Profil', 'Sikkerhet', 'Forside']);
  assert.equal(N.moved65('<section><h3 class="sg-t">Gjøremål</h3></section>', 'Gjøremål'), '<section><h3 class="sg-t">Gjøremål<span class="set-moved" data-moved65>FLYTTET FRA GJØREMÅL</span></h3></section>');
  // render() i settings.js monterer alle plassene og beholder dem mellom tegningene.
  assert.match(ST, /for \(const \[sel, fn\] of v\.mounts \?\? \[\]\)/);
  assert.match(ST, /const oldMounts = same \?/);
  assert.match(ST, /<h3 class="sg-t">\$\{esc\(g\.t\)\}\$\{movedTitle65\(g\)\}<\/h3>/);
});

test('hver innstilling ett sted: de gamle plassene viser bare status + lenke', () => {
  // Konto ← Sikkerhet, Utseende/App ← Startside, Brukere og familie ← Familie + Brief og Glimt-figur, Kalender og gjøremål ← Gjøremål + HA to-do.
  assert.match(ST, /join65\(v, \[\{ v: sikkerhetView51\(H\), moved: 'Sikkerhet' \}\]\)/);
  assert.match(ST, /movedGroup65\(forside, 'Startside'\), movedGroup65\(nyhet, 'Startside'\)/);
  assert.match(ST, /movedGroup65\(topp, 'Startside'\)/);
  assert.match(ST, /\{ v: fam, moved: 'Familie' \}/);
  assert.match(ST, /act: 'data-p65-people'/);
  assert.match(ST, /join65\(k, \[\{ v: todo, moved: 'Gjøremål' \}\]\)/);
  // Glimt-siden bygger inn AI-sidens Glimt-del (only='glimt').
  assert.match(ST, /SAI65\.glimtAiView\(H\)/);
  assert.match(ST, /sel: '\[data-ai-glimt65\]'/);
  // HA to-do monteres bare på Kalender og gjøremål (ikke lenger under Integrasjoner → Home Assistant).
  assert.doesNotMatch(ST, /mountHa\(|mountHaTodo/);
  assert.equal((ST.match(/huskeView44\(H\)/g) ?? []).length, 1);
  // Sonevarsler: hele settet under Varsler, lenke fra Brukere og familie.
  assert.match(ST, /varsel: \(\) => withZones45\(notifyView\(H\), 'familie'\)/);
  assert.equal((ST.match(/withZones45\(/g) ?? []).length, 2, 'definisjon + Varsler');
  assert.match(ST, /go: 'varsel', btn: 'Varsler'/);
  // Integrasjoner: «Kalendere»-kortet og AI-tjenestene er status + lenke.
  assert.match(ST, /if \(g\.name === 'Kalender \/ timeplan'\) return row\(\{[^\n]*btn: 'Kalender og gjøremål', go: 'kal' \}\)/);
  assert.match(ST, /if \(isAi65\(g\)\) return row\(/);
  assert.match(SI, /export const moved65 = /);
  assert.match(SI, /btn: 'AI', act: `data-p65-ai=/);
  assert.match(SI, /btn: 'Kalender og gjøremål', go: 'kal'/);
  assert.match(SI, /it\.status !== 'ok' && !moved65\(it\)/); // badge bare der noe krever handling her
});

test('søket: indeksen og stiene peker til de nye sidene', () => {
  const local = SS.slice(SS.indexOf('const LOCAL = ['), SS.indexOf('].map(([id, title, path, web, kw, anchor])'));
  assert.doesNotMatch(local, /'top\//, 'ingen ruter til Startside');
  assert.doesNotMatch(local, /, 'huske',/, 'ingen ruter til Gjøremål');
  assert.doesNotMatch(local, /'Startside →/);
  assert.match(local, /'look\/dash'/); assert.match(local, /'app\/tabs'/); assert.match(local, /'system\/upd'/);
  assert.match(local, /'Kalender og gjøremål → Gjøremål', 'kal'/);
  assert.match(local, /'AI → Tjenester → Gemini'/);
  assert.match(SS, /\.map\(\(x\) => \(\{ \.\.\.x, path: path65\(x\.path\) \}\)\)/);
  assert.match(SS, /\[\/\^Startside\/, 'Utseende'\]/);
  assert.match(SS, /'ai-key-gemini': \{[^}]*acTab: 'svc:gemini' \}/);
  assert.match(SS, /'ai-rules65': \{ sel: '\[data-hl="ai-rules65"\]', acTab: 'task' \}/);
});

test('stil: meny 38 px / flis 26 px, grå mono-etiketter, oransje «FLYTTET FRA», 28 px radflis, sticky System-faner', () => {
  assert.match(read('public/app.html'), /<link rel="stylesheet" href="\/assets\/css\/web65\.css">/);
  assert.match(CSS, /\.set-nav65 \.set-tab\{height:38px/);
  assert.match(CSS, /\.set-ic\{width:26px!important;height:26px!important;border-radius:8px!important\}/);
  assert.match(CSS, /\.set-sec-t\{font:500 10\.5px[^}]*color:#8f897c/);
  assert.match(CSS, /\.set-moved\{[^}]*color:#c0562a/);
  assert.match(CSS, /\.si36\{width:28px;height:28px;border-radius:8px/);
  assert.match(CSS, /#ece6da;color:#4a463f/);
  assert.match(CSS, /\.set-tabs65\{position:sticky/);
  assert.match(CSS, /\.set-tab65\{[^}]*height:38px[^}]*font:600 13\.5px/);
  assert.match(CSS, /\.set-tab65\[aria-selected="true"\]\{[^}]*border-bottom-color/);
});
