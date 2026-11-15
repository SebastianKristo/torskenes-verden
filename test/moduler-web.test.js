// Web bruker modullisten (Fase 6): menyene i app.html, aliasene, titlene og fanene i modulene stemmer med shared/schemas/moduler.json,
// og de gamle listene (TITLES, ROUTES-navn, TABS med navn) er borte fra web-koden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const M = JSON.parse(read('shared/schemas/moduler.json'));
const html = read('public/app.html');
const web = M.moduler.filter((m) => m.plattformer.includes('web') && m.rute);

// moduler.js bruker localStorage og ingen DOM; lastes med en liten stub.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const mod = await import('../public/js/moduler.js');
await mod.loadModuler(async () => ({ ...M, moduler: M.moduler }));

test('toppmenyen i app.html har modulene i listens rekkefølge, med navn og adresse derfra', () => {
  const nav = html.match(/<nav class="pillnav"[^>]*>\s*([^\n]*)/)[1];
  const tabs = [...nav.matchAll(/<a href="([^"]+)" data-r="([^"]+)">([^<]+)<\/a>/g)].map(([, href, r, t]) => [r, href, t.replace('&amp;', '&')]);
  assert.deepEqual(tabs, web.map((m) => [m.id, m.rute, m.navn]));
});

test('bunnmenyen i app.html er bunnmeny + Mer fra lista', () => {
  const nav = html.match(/<nav class="bottomnav"[^>]*>\s*([^\n]*)/)[1];
  const tabs = [...nav.matchAll(/data-r="([^"]+)">([^<]+)</g)].map(([, r, t]) => [r, t]);
  assert.deepEqual(tabs, [...M.bunnmeny.map((id) => [id, M.moduler.find((m) => m.id === id).navn]), ['mer', 'Mer']]);
});

test('gamle adresser videresendes, med resten av stien og ?-parametrene', () => {
  assert.equal(mod.aliasTil('#/dash'), '#/oversikt');
  assert.equal(mod.aliasTil('#/huskeliste'), '#/gjoremal');
  assert.equal(mod.aliasTil('#/bursdager'), '#/kalender/bursdager');
  assert.equal(mod.aliasTil('#/familiekalender'), '#/kalender/familie');
  assert.equal(mod.aliasTil('#/kart?sone=Hjem&live=1'), '#/reise/kart?sone=Hjem&live=1');
  assert.equal(mod.aliasTil('#/media/kalender'), '#/media/kommer');
  assert.equal(mod.aliasTil('#/okonomi'), '/finans/');
  assert.equal(mod.aliasTil('#/nyhetsleser'), '#/nyheter');
  assert.equal(mod.aliasTil('#/kalender/dag/2026-11-15'), null, 'nye adresser røres ikke');
  assert.equal(mod.aliasTil('#/familie/kart'), null);
});

test('adressen gir riktig visning, modul (markert fane) og tittel', () => {
  const cases = [
    ['#/oversikt', 'dash', 'oversikt', 'Oversikt'], ['#/hjem', 'hjem', 'smarthjem', 'Smarthjem'], ['#/matplan', 'matplan', 'mat', 'Mat'],
    ['#/gjoremal', 'gjoremal', 'gjoremal', 'Gjøremål'], ['#/kalender/bursdager', 'bursdager', 'kalender', 'Bursdager'],
    ['#/kalender/familie', 'familiekalender', 'kalender', 'Familie'], ['#/kalender/dag/2026-11-15', 'kalender', 'kalender', 'Kalender'],
    ['#/reise', 'reise', 'reise', 'Reise'], ['#/reise/kart', 'kart', 'reise', 'Kart'], ['#/familie/kart', 'familie', 'familie', 'Kart'],
    ['#/mediakveld', 'mediakveld', 'media', 'I kveld'], ['#/skjold', 'skjold', 'skjold', 'Skjold Lab'],
  ];
  for (const [hash, view, id, title] of cases) {
    assert.equal(mod.viewOf(hash), view, hash);
    assert.equal(mod.navKeyOf(view), id, hash);
    assert.equal(mod.tittel(hash), title, hash);
  }
});

test('«Alle sider» og Mer: alle web-modulene, gruppert i fast rekkefølge', () => {
  const g = mod.gruppert();
  assert.deepEqual(g.map((x) => x.id), M.grupper.map((x) => x.id).filter((id) => web.some((m) => m.gruppe === id)));
  assert.deepEqual(g.flatMap((x) => x.moduler.map((m) => m.id)).sort(), web.map((m) => m.id).sort());
});

test('undersidene i modulene på web har navn og rekkefølge fra lista', () => {
  const sub = (id, type) => M.moduler.find((m) => m.id === id).undersider.filter((u) => u.type === type).map((u) => [u.id, u.navn]);
  const fam = read('public/js/family.js').match(/const TABS = (\[\[.*?\]\]);/)[1];
  assert.deepEqual(JSON.parse(fam.replace(/'/g, '"')), sub('familie', 'fane'), 'Familie-fanene');
  const kal = read('public/js/kalender.js').match(/const VIEWS = (\[\[.*?\]\]);/)[1];
  assert.deepEqual(JSON.parse(kal.replace(/'/g, '"').replace(/null/g, '""')).map((v) => [v[0], v[1]]), sub('kalender', 'visning'), 'Kalender-visningene (kalender.js)');
  assert.match(read('public/js/kalender-oppsett.js'), /modul\('kalender'\)/, 'verktøylinja i Kalender leser visningene fra lista');
  const media = read('public/js/media-visninger.js').match(/const TABS70 = (\[\[.*?\]\]);/)[1];
  assert.deepEqual(JSON.parse(media.replace(/'/g, '"')).map((x) => x[1]), sub('media', 'fane').map((x) => x[1]), 'Media-fanene');
  assert.equal(mod.subtabs('kalender', 'bursdager', 'filter').match(/data-sub="/g).length, 3, 'Alle · Familie · Bursdager');
  assert.match(mod.subtabs('reise', 'kart'), /aria-current="page">Kart</);
});

test('de separate listene er borte fra web (TITLES, faste fanenavn, hardkodet Mer-liste)', () => {
  const app = read('public/js/app.js'), profile = read('public/js/profile.js'), net = read('public/js/net.js');
  assert.doesNotMatch(app, /const TITLES = /);
  assert.doesNotMatch(profile, /export const TABS = \[\['dash'/);
  assert.doesNotMatch(net, /\['chat', 'rom', 'nettverk'/);
  assert.doesNotMatch(read('public/js/nav-boot.js'), /\['chat', 'rom', 'nettverk'/);
});

test('Innstillinger: samme sider og rekkefølge som lista, og Tilkoblinger grupperes som tilkoblinger.json', () => {
  const meny = read('public/js/settings-meny.js');
  const block = meny.slice(meny.indexOf('export const MENU65 = ['), meny.indexOf('];', meny.indexOf('export const MENU65 = [')));
  const ids = [...block.matchAll(/\['[^']*', \[([^\]]*)\]\]/g)].flatMap((m) => m[1].match(/'[^']+'/g).map((x) => x.slice(1, -1)));
  // Web-nøklene for sidene i lista (konto, look, varsel, users, glimt/ai, int/kal, modulene, app, system/backup/logger).
  const WEB = { konto: ['konto'], utseende: ['look'], varsler: ['varsel'], husstand: ['users'], glimt: ['glimt', 'ai'], tilkoblinger: ['int', 'kal'], moduler: ['dom'], enheter: ['app'], server: ['system', 'backup', 'logger'] };
  const order = M.innstillinger.map((s) => WEB[s.id][0]);
  assert.deepEqual(ids.filter((k) => order.includes(k)), order);
  const view = read('public/js/settings-view.js');
  for (const [k, n] of [['konto', 'Konto og sikkerhet'], ['app', 'Enheter og widgets'], ['users', 'Husstand']]) assert.match(view, new RegExp(`\\['${k}', '${n}'`));
  const T = JSON.parse(read('shared/schemas/tilkoblinger.json'));
  assert.match(view, new RegExp(`const CAT_ORDER = ${JSON.stringify(T.grupper.map((g) => g.navn)).replace(/"/g, "'").replace(/,/g, ', ').replace(/[[\]]/g, '\\$&')}`));
  assert.match(read('public/js/profile-menu.js'), /'Tilpass Oversikt'/, 'O4: «Rediger widgets» heter «Tilpass Oversikt»');
});

test('rutene Økonomi sender gamle /finans/-lenker til, virker i skallet (direkte eller via alias)', () => {
  const known = new Set(['dash', 'studie', 'rom', 'hjem', 'matplan', 'sporing', 'familie', 'gjoremal', 'vaer', 'bursdager', 'kalender', 'chat', 'media', 'reise', 'kart', 'familiekalender', 'mediakveld', 'skjold', 'domener', 'nettverk', 'mer']);
  for (const h of ['#/sporing', '#/matplan', '#/domener', '#/gjoremal', '#/bursdager', '#/kalender', '#/kart', '#/familie']) {
    const to = mod.aliasTil(h) ?? h;
    assert.ok(known.has(mod.viewOf(to)), `${h} → ${to}`);
  }
  // Brief og Bibel har en vei inn fra Homelab (Alle sider og Mer); Avganger ligger i Reise.
  const ids = mod.gruppert().flatMap((g) => g.moduler.map((m) => m.id));
  for (const id of ['brief', 'bibel', 'reise']) assert.ok(ids.includes(id), id);
  assert.equal(mod.aliasTil('#/bibel'), '/finans/#/bibel');
});
