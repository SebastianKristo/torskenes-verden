// Lenker i dokumentasjonen til filer i repoet skal peke på noe som finnes.
// Gjelder Markdown-lenker ([tekst](sti)) og kodespenn med en sti som
// begynner på en kjent toppmappe (`server/ai/gate.js`), i hoveddokumentene.
// Eksterne adresser, ankere alene og plassholdere (<…>, *, {a,b}) sjekkes ikke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Dokumentene som beskriver repoet slik det er nå. docs/opprydding/ og
// kartleggingene med promptnummer (f.eks. glimt-kartlegging-47.md) er arkiv
// over hvordan det var, og står utenfor.
const FILER = [
  'README.md', 'CLAUDE.md', 'DECISIONS.md',
  'docs/utvikling.md', 'docs/designsystem.md', 'docs/api.md',
  'docs/sikkerhet.md', 'docs/ordliste.md', 'docs/installasjon.md',
  'docs/konfigurasjon.md', 'docs/backup.md', 'docs/android-signering.md',
  'docs/glimt-dataflyt.md', 'docs/navigasjon-uten-reload.md',
  'docs/live-activities.md', 'docs/homelab.md', 'docs/finanshub.md',
];

// Stier som nevnes fordi de er fjernet (med vilje).
const FJERNET = new Set(['apps/android/signing/sideload.jks']);

// Toppmapper som gjør et kodespenn til en sti som skal finnes.
const TOPP = ['server', 'public', 'shared', 'apps', 'docs', 'test', 'scripts', 'deploy', '.github'];

const erPlassholder = (s) => /[<>*{}$…]|\.\.\.|\s/.test(s);

function lenker(tekst) {
  const ut = [];
  // Kodeblokker (```) teller ikke; de viser ofte eksempler.
  const uten = tekst.replace(/```[\s\S]*?```/g, '');
  for (const m of uten.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) ut.push({ sti: m[1], md: true });
  for (const m of uten.matchAll(/`([^`\n]+)`/g)) {
    const s = m[1].trim();
    if (TOPP.some((t) => s.startsWith(t + '/'))) ut.push({ sti: s, md: false });
  }
  return ut;
}

function sjekk(fil) {
  const abs = path.join(ROOT, fil);
  if (!fs.existsSync(abs)) return [];
  const døde = [];
  for (const { sti, md } of lenker(fs.readFileSync(abs, 'utf8'))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(sti) || sti.startsWith('#') || sti.startsWith('//')) continue;
    let ren = sti.split('#')[0].split('?')[0];
    if (!ren || erPlassholder(ren)) continue;
    // Kodespenn som «server/ai/gate.js:12» eller «fil.js (linje)» – ta bare stien.
    ren = ren.replace(/:\d+([-–/]\d+)?$/, '');
    if (FJERNET.has(ren)) continue;
    const mål = md && !ren.startsWith('/') ? path.resolve(path.dirname(abs), ren) : path.join(ROOT, ren.replace(/^\//, ''));
    if (!fs.existsSync(mål)) døde.push(sti);
  }
  return døde;
}

test('lenkene i dokumentasjonen peker på filer som finnes', () => {
  const funn = {};
  for (const f of FILER) {
    const d = sjekk(f);
    if (d.length) funn[f] = d;
  }
  assert.deepEqual(funn, {}, 'Døde lenker til lokale filer:\n' + JSON.stringify(funn, null, 2));
});
