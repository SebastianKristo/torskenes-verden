// Fase 6 bølge 2 (iOS): appen følger modullisten (shared/schemas/moduler.json, GET /api/moduler) og navnene fra Q1–Q12.
// Kildetester uten Xcode: CI-jobben «Mobilapper» bygger appen og kjører HomelabTests (ModulerTests.swift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'apps', 'ios');
const SRC = join(IOS, 'FinansHub', 'Sources');
const read = (...p) => readFileSync(join(...p), 'utf8');
const MODULER = JSON.parse(read(ROOT, 'shared', 'schemas', 'moduler.json'));
/** Kildekoden uten kommentarer (linjer og blokker), så testene sjekker koden og ikke forklaringene. */
const code = (...p) => read(...p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:"])\/\/.*$/, '$1')).join('\n');

function swiftFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p));
    else if (f.endsWith('.swift')) out.push(p);
  }
  return out;
}

test('modullisten er innebygd i appen fra shared/schemas, og HomelabTests sjekker den', () => {
  const y = read(IOS, 'project.yml');
  const fin = y.slice(y.indexOf('  FinansHub:'), y.indexOf('  FinansHubWidgets:'));
  assert.match(fin, /- path: \.\.\/\.\.\/shared\/schemas\/moduler\.json\n\s+buildPhase: resources/, 'samme fil som serveren leser, ikke en kopi');
  const tests = y.slice(y.indexOf('  HomelabTests:'), y.indexOf('  KalenderWidgets:'));
  assert.match(tests, /- path: FinansHub\/Sources\/ModulSider\.swift/);
  const t = read(IOS, 'HomelabTests', 'ModulerTests.swift');
  assert.match(t, /shared\/schemas\/moduler\.json/);
  assert.match(t, /testHverIosModulHarEnSide/);
});

test('appen henter GET /api/moduler?plattform=ios, bufrer svaret og har den innebygde lista som reserve', () => {
  const m = code(SRC, 'ModulListe.swift');
  assert.match(m, /"\/moduler\?plattform=ios"/);
  assert.match(m, /UserDefaults\.standard\.set\(d, forKey: ModulListe\.bufferKey\)/);
  assert.match(m, /ModulListeDTO\.innebygd\(\)\?\.filtrert\(plattform: "ios"/);
  assert.match(code(IOS, 'SharedNet', 'Moduler.swift'), /forResource: "moduler", withExtension: "json"/);
  assert.match(code(SRC, 'Store.swift'), /await ModulListe\.shared\.hent\(self\)/);
});

test('hver iOS-modul i modullisten har en side i appen (ModulSider.swift), og ingen ukjente', () => {
  const s = code(SRC, 'ModulSider.swift');
  const block = s.slice(s.indexOf('static let side'), s.indexOf('static let alias'));
  const ids = [...block.matchAll(/"([a-z0-9-]+)": "[a-z0-9]+"/g)].map((x) => x[1]);
  const ios = MODULER.moduler.filter((m) => m.plattformer.includes('ios')).map((m) => m.id);
  for (const id of ios) assert.ok(ids.includes(id), `${id} mangler i ModulSider.side`);
  for (const id of ids) assert.ok(MODULER.moduler.some((m) => m.id === id), `${id} står ikke i modullisten`);
});

test('fanelinja har ingen egen håndskrevet liste over moduler', () => {
  const s = code(SRC, 'ShellTabs.swift');
  assert.match(s, /static var all: \[PaperTabItem\] \{ ModulListe\.shared\.faner \}/);
  assert.doesNotMatch(s, /PaperTabItem\(id: "/, 'navn og ikon kommer fra modullisten');
  // Lagrede faner flyttes én gang til de nye navnene, egne navn beholdes.
  assert.match(s, /ModulListe\.shared\.flyttFaner\(items\)/);
  const m = code(SRC, 'ModulListe.swift');
  assert.match(m, /moduler_faner_flyttet/);
  assert.match(m, /ModulSider\.gamleNavn\.contains\(it\.label\)/);
});

test('Økonomi-fanene: Oversikt, Transaksjoner, Budsjett og Faste betalinger, med de eldre nøklene som alias', () => {
  const l = code(SRC, 'PaperLayout.swift');
  assert.match(l, /finNavStandard: \[String\] = \["oversikt", "transaksjoner", "budsjett", "faste"\]/);
  assert.match(l, /FinNavItem\(id: "transaksjoner", name: "Transaksjoner"/);
  assert.match(l, /FinNavItem\(id: "faste", name: "Faste betalinger"/);
  assert.match(l, /FinNavItem\(id: "sok", name: "Glimt"/);
  assert.match(l, /case "liste": return "transaksjoner"/);
  assert.match(l, /case "abonnementer": return "faste"/);
  // Serveren har samme standard (server/mobile.js).
  assert.match(read(ROOT, 'server', 'mobile.js'), /standard: \{[^}]*finNav: \['oversikt', 'transaksjoner', 'budsjett', 'faste'\]/);
  // Homelab-fanene inne i Økonomi (HlTab) finnes ikke lenger; modulene nås fra skallet.
  for (const f of swiftFiles(SRC)) assert.doesNotMatch(code(f), /\bHlTab\b/, f);
  // Mer i Økonomi: Glimt i stedet for Søk, Import under Innstillinger.
  const mer = code(SRC, 'OkonomiMer.swift');
  assert.match(mer, /name: "Glimt"/);
  assert.doesNotMatch(mer, /id: "import"/);
  assert.match(mer, /Import, fanelinje, kategorier og regler", icon: "gearshape"\) \{ store\.paperGo\("innst-finans67"\) \}/);
  assert.match(code(SRC, 'PaperAppSettings.swift'), /PaperLinkRow\(name: "Import"/);
});

test('Faste betalinger bruker GET /finans/api/faste-betalinger og viser serverens tekst', () => {
  const f = code(SRC, 'FasteBetalinger.swift');
  assert.match(f, /fetch\(FasteBetalingerDTO\.self, "\/finans\/api\/faste-betalinger"\)/);
  for (const k of ['abonnementer', 'faste', 'planlagte']) assert.match(f, new RegExp(`"${k}"`));
  assert.match(f, /b\.label/);
  assert.match(f, /b\.daysLeft/);
  assert.doesNotMatch(f, /Calendar\.current|DateFormatter|\.date\(byAdding/, 'appen regner ikke neste trekk selv');
  assert.match(code(SRC, 'Paper.swift'), /case "abo": FasteBetalingerSide\(\)/);
  assert.match(code(IOS, 'SharedNet', 'APIModels.swift'), /struct FasteBetalingerDTO/);
  assert.match(read(IOS, 'HomelabTests', 'ContractDecodingTests.swift'), /finans-faste-betalinger\.json/);
});

test('de gamle navnene står ikke i teksten brukeren ser (Q1–Q12, ordlisten)', () => {
  const bad = /"[^"\n]*(Subscription OS|Now Brief|Nyhetsleser|Huskeliste|Familiekalender|Familie og kart|FinansHub på|Åpne FinansHub|i FinansHub)[^"\n]*"/;
  const allow = new Set(['ModulSider.swift']); // listen over de gamle navnene som flyttes
  const dirs = ['FinansHub/Sources', 'Kalender/Sources', 'KalenderMac/Sources', 'Watch/Sources', 'FinansHubWidgets/Sources', 'Shared'];
  for (const d of dirs) {
    for (const f of swiftFiles(join(IOS, d))) {
      if (allow.has(f.split('/').pop())) continue;
      const m = code(f).match(bad);
      assert.equal(m, null, `${f}: ${m?.[0]}`);
    }
  }
  // Klokka viser Homelab, ikke FinansHub.
  assert.doesNotMatch(code(IOS, 'Watch', 'Sources', 'WatchApp.swift'), /"FinansHub"/);
});

test('Innstillinger: samme sider og rekkefølge som innstillinger[] i modullisten', () => {
  const s = code(SRC, 'PaperAppSettings.swift');
  const fallback = s.match(/let ids: \[String\] = \[([^\]]+)\]/)[1].match(/"([a-z]+)"/g).map((x) => x.slice(1, -1));
  assert.deepEqual(fallback, MODULER.innstillinger.map((x) => x.id));
  assert.match(s, /ModulListe\.shared\.innstillinger/);
  for (const id of fallback) assert.match(s, new RegExp(`case "${id}":`), id);
  // Q12: Konto og sikkerhet er én side.
  assert.match(s, /case "kontosik":/);
  assert.match(s, /"kontosik": \("Konto og sikkerhet"/);
});

test('Skjold Lab: standardkategoriene kommer fra serveren, ikke fra en egen liste', () => {
  assert.doesNotMatch(code(SRC, 'SkjoldAI.swift'), /defaultCategories/);
  assert.match(code(SRC, 'SkjoldModel.swift'), /JS\.strings\(JS\.obj\(d\), "standard"\)/);
  assert.match(code(SRC, 'SkjoldEdit.swift'), /m\.standardCategories/);
});

test('dyplenker: finanshub:// og homelab:// og hash-rutene går via aliasene i modullisten, og forbi velkomststegene', () => {
  const w = code(SRC, 'AppWidgets.swift');
  assert.match(w, /url\.scheme == "finanshub" \|\| url\.scheme == "homelab"/);
  assert.match(w, /openRute\("#" \+ f\)/);
  assert.match(w, /noteDeepLink\(\)/);
  const d = code(SRC, 'Dyplenker.swift');
  assert.match(d, /ModulListe\.shared\.liste\?\.treff\(rute: rute\)/);
  // Q35: velkomststegene legger seg ikke over en dyplenke.
  assert.match(code(SRC, 'PaperStore.swift'), /onboarding == nil, !deepLinkRecent \{ onboarding = 0 \}/);
  // Alle aliasene i modullisten er gyldige ruter som treff() kan slå opp.
  for (const m of MODULER.moduler) {
    for (const a of [...m.aliaser, ...m.undersider.flatMap((u) => u.aliaser ?? [])]) assert.match(a, /^(#\/|\/)/, `${m.id}: ${a}`);
  }
});

test('kalendervisningene har navn og rekkefølge fra modullisten', () => {
  const vis = MODULER.moduler.find((m) => m.id === 'kalender').undersider.filter((u) => u.type === 'visning');
  // Kalender-appen (iOS): kortnavnene.
  const k = code(IOS, 'Kalender', 'Sources', 'KalHeader.swift');
  const kal = [...k.slice(k.indexOf('static let views')).matchAll(/KalViewOpt\(id: "([^"]+)", name: "([^"]+)"\)/g)].slice(0, vis.length);
  assert.deepEqual(kal.map((x) => [x[1], x[2]]), vis.map((u) => [u.id, u.kort ?? u.navn]));
  // Kalender for Mac: de fulle navnene.
  const mac = code(IOS, 'KalenderMac', 'Sources', 'MacRoot.swift');
  const mv = [...mac.slice(mac.indexOf('static let views')).matchAll(/MacViewTab\(id: "([^"]+)", name: "([^"]+)"/g)].slice(0, vis.length);
  assert.deepEqual(mv.map((x) => [x[1], x[2]]), vis.map((u) => [u.id, u.navn]));
  // Kalenderen i Homelab-appen (uten År): samme rekkefølge og navn.
  const h = code(SRC, 'HomelabKalenderModell.swift');
  const hv = [...h.slice(h.indexOf('static let views')).matchAll(/\("([^"]+)", "([^"]+)", "[^"]+"\)/g)].map((x) => x[2]).slice(0, 5);
  assert.deepEqual(hv, vis.filter((u) => u.id !== 'ar').map((u) => u.navn));
});

test('Media-widgeten: «Pause alt» og «Fortsett» kaller stien serveren har, uten en 404-rundtur først (A §6 B5)', () => {
  const f = read(IOS, 'Shared', 'MediaShared.swift');
  assert.doesNotMatch(f, /request\("\/api\/media\/qbit\//);
  for (const a of ['pauseAll', 'resumeAll']) assert.ok(f.includes(`request("/api/media/torrents/${a}"`), a);
});
