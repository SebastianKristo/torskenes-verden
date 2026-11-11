// Prompt 85 (README85): GitHub-forsiden og wiki-kildene.
// Sjekker at relative lenker, bilder og ankere i README.md og docs/wiki/*.md peker på noe som finnes,
// og at README nevner modulene som kom etter forrige oppdatering (Skjold Lab og Media).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = join(ROOT, 'docs', 'wiki');
const REPO_RAW = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/([^?#]+)/;
const REPO_BLOB = /^https:\/\/github\.com\/[^/]+\/torskenes-verden\/blob\/main\/([^?#]+)/;
const REPO_WIKI = /^https:\/\/github\.com\/[^/]+\/torskenes-verden\/wiki\/([^?#]+)/;

const read = (f) => readFileSync(f, 'utf8');
/** Teksten uten kodeblokker og inline-kode (lenker i eksempler skal ikke sjekkes). */
const prose = (md) => md.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '').replace(/`[^`\n]*`/g, '');
/** Alle mål for lenker og bilder: [tekst](mål), ![alt](mål), href="mål" og src="mål". */
function targets(md) {
  const out = [], p = prose(md);
  for (const m of p.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push(m[1]);
  for (const m of p.matchAll(/\b(?:href|src)\s*=\s*"([^"]+)"/g)) out.push(m[1]);
  return out;
}
/** Ankeret GitHub lager av en overskrift: små bokstaver, tegnsetting og emoji bort, mellomrom → bindestrek. */
const slug = (h) => h.trim().toLowerCase()
  .replace(/<[^>]+>/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*~]/g, '')
  .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '').replace(/ /g, '-');
function anchors(md) {
  const set = new Set(), seen = new Map();
  const body = md.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '');
  for (const m of body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const s = slug(m[1]), n = seen.get(s) ?? 0;
    set.add(n ? `${s}-${n}` : s); seen.set(s, n + 1);
  }
  for (const m of body.matchAll(/\b(?:id|name)\s*=\s*"([^"]+)"/g)) set.add(m[1].toLowerCase());
  return set;
}
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

const wikiFiles = readdirSync(WIKI).filter((f) => f.endsWith('.md')).sort();
const wikiPages = new Map(wikiFiles.map((f) => [f.slice(0, -3), join(WIKI, f)]));
const FILES = [join(ROOT, 'README.md'), ...wikiFiles.map((f) => join(WIKI, f))];

/** Feilene i én fil: [{target, why}]. */
function check(file) {
  const md = read(file), isWiki = file.startsWith(WIKI), own = anchors(md), bad = [];
  for (const raw of targets(md)) {
    const t = raw.trim();
    let m;
    // Lenker til filer i dette repoet (rå bilder til wikien og blob-lenker) skal også finnes.
    if ((m = REPO_RAW.exec(t)) || (m = REPO_BLOB.exec(t))) {
      if (!existsSync(join(ROOT, dec(m[1])))) bad.push({ target: t, why: `filen ${dec(m[1])} finnes ikke` });
      continue;
    }
    if ((m = REPO_WIKI.exec(t))) {
      if (!wikiPages.has(dec(m[1]))) bad.push({ target: t, why: `wikisiden ${dec(m[1])} finnes ikke i docs/wiki` });
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) continue; // http(s), mailto, webcal …
    const [pathPart, hash = ''] = t.split('#');
    const path = dec(pathPart), frag = dec(hash).toLowerCase();
    if (!path) { // #anker i samme fil
      if (frag && !own.has(frag)) bad.push({ target: t, why: 'ankeret finnes ikke i filen' });
      continue;
    }
    // I wikien er [Side](Side) en lenke til en annen wikiside (docs/wiki/Side.md).
    const page = isWiki && !path.includes('/') && !/\.[a-z0-9]+$/i.test(path) ? wikiPages.get(path) : null;
    const abs = page ?? resolve(dirname(file), path);
    if (!existsSync(abs)) { bad.push({ target: t, why: isWiki && !path.includes('/') ? 'wikisiden finnes ikke' : 'filen finnes ikke' }); continue; }
    if (frag && abs.endsWith('.md') && !anchors(read(abs)).has(frag)) bad.push({ target: t, why: 'ankeret finnes ikke i målfilen' });
  }
  return bad;
}

for (const file of FILES) {
  const rel = file.slice(ROOT.length + 1);
  test(`${rel}: relative lenker, bilder og ankere finnes`, () => {
    const bad = check(file);
    assert.deepEqual(bad, [], `Døde lenker i ${rel}:\n${bad.map((b) => `  ${b.target} – ${b.why}`).join('\n')}`);
  });
}

test('README nevner Skjold Lab og Media', () => {
  const md = read(join(ROOT, 'README.md'));
  assert.match(md, /Skjold Lab/);
  assert.match(md, /^#{2,4} .*\bMedia\b/m, 'Media skal ha en egen overskrift under Funksjoner');
  for (const w of ['Sonarr', 'Radarr', 'Prowlarr', 'qBittorrent', 'WLED']) assert.ok(md.includes(w), `README mangler ${w}`);
});

test('README peker på Releases generelt, ikke et hardkodet versjonsnummer', () => {
  const md = read(join(ROOT, 'README.md'));
  assert.match(md, /github\.com\/[^/]+\/torskenes-verden\/releases(?!\/tag\/)/);
  assert.doesNotMatch(md, /releases\/(tag|download)\/v?\d/);
  assert.doesNotMatch(md, /(?:FinansHub|Kalender|HomelabWear)-\d+\.\d+\.\d+/, 'filnavn skal skrives med <versjon>');
});

test('README og wiki har ingen private adresser utenom eksempelnettet, og ingen nøkler', () => {
  for (const file of FILES) {
    const md = read(file), rel = file.slice(ROOT.length + 1);
    // 192.168.1.x brukes som eksempel i veiledningene. Andre private nett (10.x, 172.16–31.x) skal ikke stå her.
    assert.doesNotMatch(md, /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?!\/)/, `${rel}: privat 10.x-adresse`);
    assert.doesNotMatch(md, /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b(?!\/)/, `${rel}: privat 172.x-adresse`);
    // Plassholdere som fh_pat_XXXX… (samme tegn hele veien) er lov; ekte nøkler er ikke det.
    const keys = (md.match(/fh_pat_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{30,}|GOCSPX-[A-Za-z0-9_-]{20,}/g) ?? [])
      .filter((k) => new Set(k.replace(/^(fh_pat_|AIza|gsk_|GOCSPX-)/, '')).size > 2);
    assert.equal(keys.length, 0, `${rel}: noe som ligner en nøkkel`);
  }
});
