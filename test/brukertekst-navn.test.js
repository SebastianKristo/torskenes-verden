// Fase 7: tekst brukeren ser (feilmeldinger, hint, hjelpetekst, Glimt-svar, varsler) bruker navnene fra modullisten
// (shared/schemas/moduler.json) og ordlisten (docs/ordliste.md), ikke de gamle sidenavnene.
// - Stiene i Innstillinger følger innstillinger[] i modullisten: Konto og sikkerhet · Utseende · Varsler · Husstand · Glimt og AI ·
//   Tilkoblinger · Moduler · Enheter og widgets · Server. «Innstillinger → Sikkerhet», «→ Integrasjoner», «→ Kalendere» osv. er stoppet.
// - Gamle modul- og produktnavn i UI: Subscription OS, Now Brief, Papir Finans, Brukere og familie, Nyhetsleser, FinansHub (i tekst),
//   Finans om modulen, Hjem om startsiden og Dashboard.
// Kommentarer sjekkes ikke. Interne nøkler, ruter, logg-tagger og filnavn står ikke i mønstrene. Unntakene under er bevisste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['server', 'public', 'apps/ios', 'apps/android'];
const EXT = /\.(js|mjs|swift|kt|xml)$/;
const SKIP_DIR = /(^|\/)(node_modules|build|\.gradle|vendor)(\/|$)/;

function* files(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (SKIP_DIR.test(relative(ROOT, p))) continue;
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(n) && !n.endsWith('.min.js')) yield p;
  }
}

/** Linjene uten kommentarer (blokk-, linje- og XML-kommentarer). Godt nok for tekstsjekk: i URL-er står // rett etter kolon. */
function codeLines(src, xml) {
  const blanked = xml
    ? src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    : src.replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//g, (m, a) => a + m.slice(a.length).replace(/[^\n]/g, ' '));
  return blanked.split('\n').map((l) => (xml ? l : l.replace(/(^|\s)\/\/.*$/, '$1')));
}

// [mønster, hva som skal brukes i stedet]
const FORBUDT = [
  [/Innstillinger [→›] (?:Sikkerhet|SIKKERHET|Innlogging|Konto(?! og)|KONTO|Kontoer og brukere)(?![\wæøå-])/, 'Innstillinger → Konto og sikkerhet'],
  [/Innstillinger → Integrasjoner(?![\wæøå-])|(?<!Tilkoblinger → )Integrasjoner → /, 'Innstillinger → Tilkoblinger'],
  [/Innstillinger → (?:Kalendere|Gjøremål)(?![\wæøå-])/, 'Innstillinger → Tilkoblinger → Kalender og gjøremål'],
  [/Innstillinger [→›] (?:AI-motor|AI-kontroll|AI|GLIMT|Glimt(?! og)|Faste oppgaver|Kvalitet)(?![\wæøå-])(?! og tolkning)/, 'Innstillinger → Glimt og AI'],
  [/Innstillinger → (?:App|APP|Enheter(?! og)|Widgets|API-tokens|Logg inn på (?:en )?annen enhet)(?![\wæøå-])/, 'Innstillinger → Enheter og widgets'],
  [/Innstillinger → (?:Brukere(?! og tillatelser)|Familie|Helse)(?![\wæøå-])|Brukere og familie/, 'Innstillinger → Husstand'],
  [/Innstillinger → (?:System|Oppdatering|Backup(?! og data))(?![\wæøå-])/, 'Innstillinger → Server → System / Backup'],
  [/Innstillinger → (?:Ruter|Reise|Nyheter|Media|Studie|Domener)(?![\wæøå-])/, 'Innstillinger → Moduler → …'],
  [/Innstillinger → Startside/, 'Innstillinger → Utseende'],
  [/Subscription OS/, 'Faste betalinger'],
  [/Now Brief/, 'Brief'],
  [/Papir Finans/, 'Homelab'],
  [/Nyhetsleser(?:en)?(?![\wæøå-])/, 'Nyheter'],
  [/(?:\b(?:i|på|til|fra|under|Om)|Åpne) FinansHub(?![\wæøå])|FinansHub(?: →|-appen|-backup|-containeren|-hemmelighetene)/, 'Økonomi (modulen) eller Homelab (appen)'],
  [/(?:\b(?:i|fra|til)|Legg i|Lagt i|Legger i|Søk i|Ser i|Åpne i) Finans(?![\wæøå-])|Finans → (?:Abonnementer|Innstillinger)/, 'Økonomi'],
  [/(?:\b(?:i|til|har)) Huskeliste(?:n)?(?![\wæøå-])/, 'Gjøremål'],
  [/(?:\bpå|\bBak|\bvises på) Dashboard(?![\wæøå-])|(?<![Dd]rifts)dashbordet/, 'Oversikt'],
  [/(?:\b(?:på|til)|Bakgrunn på|Fanelinje i|Rediger|‹) Hjem(?![\wæøå-])/, 'Oversikt (startsiden)'],
];

// Bevisste unntak: [filprefiks, tekst i linjen, hvorfor].
const UNNTAK = [
  // Andre produkters egne innstillinger (Claude, ChatGPT, qBittorrent, Search Console, Home Assistant, iOS og Android).
  ['', /claude\.ai|Claude →|ChatGPT|chatgpt|Gemini →|qBittorrent|Search Console|Open WebUI|Health Connect|One UI|iOS-innstillingene/, 'annet produkt'],
  // Kalender-appen har sin egen Innstillinger-side med SIKKERHET, SERVER og GENERELT.
  ['apps/ios/SharedKal/', /Kalender → Innstillinger → Sikkerhet/, 'Kalender-appens egne innstillinger'],
  ['apps/android/kalender/', /Kalender → Innstillinger → Sikkerhet|Kalender \(Innstillinger → Sikkerhet\)/, 'Kalender-appens egne innstillinger'],
  ['apps/ios/Kalender/', /Kalender \(Innstillinger → Sikkerhet\)/, 'Kalender-appens egne innstillinger'],
  ['apps/ios/KalenderMac/', /Kalender \(Innstillinger → Sikkerhet\)/, 'Kalender-appens egne innstillinger'],
  // Tabeller over gamle navn som oversettes til nye (fanelinja, søk og gamle lenker). De må kjenne de gamle navnene.
  ['apps/android/app/src/main/java/no/kristo/finanshub/Moduler.kt', /setOf\(/, 'GAMLE_NAVN: gamle fanenavn → modul'],
  ['apps/ios/FinansHub/Sources/ModulSider.swift', /"Subscription OS"|"Now Brief"|"Nyhetsleser"/, 'gamleNavn: gamle fanenavn → modul'],
  ['public/js/settings-search.js', /\[\/\^Nyhetsleser\$\/|'Nyhetsleser'/, 'TITLE66: gamle titler i søkeindeksen → nye'],
  // Mobil-web (/finans/ på telefon) kaller fortsatt startskjermen «Hjem» i fanelinja (mobile-fanelinje.js, mobile-oversikt-knapp.js). Rettes sammen med fanenavnet.
  ['public/finans/js/mobile', /Hjem/, 'mobil-web: fanen heter fortsatt Hjem'],
  // Hjem som sted (sone i Familie) og som liste i Gjøremål, ikke startsiden.
  ['', /Legg til Hjem, Skole|til Hjem som sone|«Hjem» får navnet/, 'Hjem som sted eller kategori'],
];

function funn() {
  const out = [];
  for (const d of DIRS) for (const p of files(join(ROOT, d))) {
    const rel = relative(ROOT, p);
    const lines = codeLines(readFileSync(p, 'utf8'), p.endsWith('.xml'));
    lines.forEach((line, i) => {
      for (const [rx, bruk] of FORBUDT) {
        const m = line.match(rx);
        if (!m) continue;
        if (UNNTAK.some(([pre, t]) => rel.startsWith(pre) && t.test(line))) continue;
        out.push(`${rel}:${i + 1}: «${m[0]}» → bruk ${bruk}\n    ${line.trim().slice(0, 160)}`);
      }
    });
  }
  return out;
}

test('brukertekst: ingen gamle sidenavn eller modulnavn (Fase 7)', () => {
  const f = funn();
  assert.deepEqual(f, [], `\n${f.join('\n')}`);
});

test('brukertekst: sjekken fanger de gamle stiene (fasit)', () => {
  const bad = ['Se Innstillinger → Sikkerhet.', 'under Innstillinger → Integrasjoner → Media', '(Innstillinger → Kalendere)', 'Innstillinger → AI-motor',
    'Innstillinger → Brukere', 'Åpne Subscription OS ›', 'Lagt i Finans ✓', 'Skann med Papir Finans', 'Bakgrunn på Hjem', 'Vises bare på Dashboard'];
  for (const t of bad) assert.ok(FORBUDT.some(([rx]) => rx.test(t)), t);
  const good = ['Innstillinger → Konto og sikkerhet', 'Innstillinger → Tilkoblinger → Media', 'Innstillinger → Glimt og AI → AI', 'Innstillinger → Enheter og widgets',
    'Innstillinger → Husstand', 'Innstillinger → Server → Backup', 'Innstillinger → Backup og data', 'Åpne Faste betalinger ›', 'Lagt i Økonomi ✓', 'Bakgrunn på Oversikt',
    'Innstillinger → AI og tolkning', 'Hjem og interiør', 'Driftsdashbordet', 'Hjem-skjermen'];
  for (const t of good) assert.ok(!FORBUDT.some(([rx]) => rx.test(t)), t);
});
