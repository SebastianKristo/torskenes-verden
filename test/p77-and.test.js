// Prompt 77 (SKJAIAND): smarte forslag i Skjold Lab på Android – kildesjekker og de rene reglene oversatt til JS.
// Kotlin typesjekkes utenfor npm test (stubber, $S/kt/b77.sh): 0 nye feil mot grunnlinjen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
/** Kode uten kommentarer. */
const code = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Speiler conf01_77 / confText77 / mergeSpecs77 / mergeTags77 / tidyDefault77 / ownThumb77 / imgQuery77 / progress77 / tidyFinished77.
const conf01 = (c) => (c == null || Number.isNaN(c)) ? null : Math.min(1, Math.max(0, c > 1 ? c / 100 : c));
const confText = (c) => { const v = conf01(c); return v == null ? null : `${Math.round(v * 100)} %`; };
const mergeSpecs = (cur, add) => {
  const out = cur.filter(([k, v]) => k.trim() || v.trim()).map((x) => [...x]);
  for (const [k, v] of add) {
    if (!k.trim() || !v.trim()) continue;
    const i = out.findIndex(([ok]) => ok.trim().toLowerCase() === k.trim().toLowerCase());
    if (i >= 0) out[i] = [out[i][0], v]; else out.push([k, v]);
  }
  const f = out.filter(([k, v]) => v.trim() || !k.trim());
  return f.length ? f : [['verdi', '']];
};
const mergeTags = (cur, add) => {
  const l = cur.split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of add.map((s) => s.trim()).filter(Boolean)) if (!l.some((x) => x.toLowerCase() === t.toLowerCase())) l.push(t);
  return l.join(', ');
};
const tidyDefault = (t) => t.error == null && (conf01(t.confidence) ?? 1) >= 0.5 &&
  ((t.after.name != null && t.after.name !== t.beforeName) || (t.after.category != null && t.after.category !== t.beforeCat) || t.after.specs.length > 0 || t.after.tags.length > 0);
const ownThumb = (u) => { const s = u?.trim(); return s && s.startsWith('/') && !s.startsWith('//') ? s : null; };
const imgQuery = (sug, name) => ((sug && sug.trim()) ? sug : name).trim();
const progress = (d, t) => t <= 0 ? 'Starter …' : `${d} av ${t}`;
const finished = (s) => ['done', 'ferdig', 'finished', 'completed', 'error', 'failed', 'feil', 'cancelled', 'avbrutt'].includes(s);

test('filene finnes og er koblet inn i Skjold Lab (skjema, liste, tilbake, innstillinger)', () => {
  assert.ok(existsSync(join(SRC, 'Skjold77.kt')));
  assert.ok(existsSync(join(SRC, 'ui/Skjold77Ui.kt')));
  const ui = code('ui/Skjold76Ui.kt');
  assert.match(ui, /"tidy" -> TidyScreen77\(vm\)/);
  assert.match(ui, /Menu77\(vm\)/);
  assert.match(ui, /Settings77\(vm\)/);
  assert.match(ui, /SuggestBar77\(vm, d\)/, '✦ Foreslå ved navnet');
  assert.match(ui, /FindImage77\(vm, d/, 'Finn bilde ved bildene');
  assert.match(ui, /ImagePicker77\(vm, d\)/);
  assert.match(ui, /Pill76\("⋯"/);
  assert.match(ui, /Pill76\("⚙"/);
  const m = code('Skjold76.kt');
  assert.match(m, /photoAdded77\(d, uri, null\)/, 'auto-forslag for ny del');
  assert.match(m, /photoAdded77\(d, null, p\)/, 'auto-forslag etter opplasting');
  assert.match(m, /savePending77\(id\)/, 'bilder fra søket lagres etter ny del');
  assert.match(m, /s\.screen == "tidy" -> closeTidy77\(\)/);
  assert.match(m, /loadAiSettings77\(\)/);
  assert.match(m, /Skjold77\.reset\(\)/);
  assert.match(code('ui/Set67Ui.kt'), /Menu67Row\("skjold", "Skjold Lab",[^\n]*vm\.openSkjoldSettings77\(\)/, 'Innstillinger → Moduler → Skjold Lab');
});

test('API-kallene følger CONTRACT77', () => {
  const k = code('Skjold77.kt');
  assert.match(k, /AI77 = "\$API76\/ai"/);
  assert.match(k, /"\$AI77\/suggest"/, 'multipart file for ny del');
  assert.match(k, /post77\("\/suggest", fields/);
  assert.match(k, /fields\.put\("partId"/);
  assert.match(k, /fields\.put\("photo"/);
  assert.match(k, /post77\("\/images", JSONObject\(\)\.put\("q", query\)/);
  assert.match(k, /\/photos\/from-search", JSONObject\(\)\.put\("id", img\.id\)/);
  assert.match(k, /post77\("\/tidy", body\)/);
  assert.match(k, /put\("all", true\)/);
  assert.match(k, /get77\("\/tidy\/"/);
  assert.match(k, /"\/apply", JSONObject\(\)\.put\("partIds"/);
  assert.match(k, /get77\("\/settings"\)/);
  assert.match(k, /hlPut\("\$AI77\/settings", JSONObject\(\)\.put\("webImages", s\.webImages\)\.put\("autoSuggestOnPhoto", s\.autoSuggest\)\)/);
  assert.match(k, /read = 75_000/, 'tidsavbrudd for bilde (serveren: 60 s)');
  assert.match(k, /delay\(1_500\)/, 'polling av jobben');
  assert.match(k, /\/history\/" \+ java\.net\.URLEncoder\.encode\(h, "UTF-8"\) \+ "\/undo"/, 'angre via historikken');
  assert.doesNotMatch(k, /searx|wikimedia|commons\.wiki/i, 'klienten henter aldri fra tredjepart');
});

test('UI-tekstene: Glimt tenker, ny-merke, Bruk alle, Godta valgte, Hopp over, innstillingene', () => {
  const u = readFileSync(join(SRC, 'ui/Skjold77Ui.kt'), 'utf8');
  const k = readFileSync(join(SRC, 'Skjold77.kt'), 'utf8');
  assert.match(k, /THINK77 = "Glimt tenker …"/);
  for (const t of ['✦ Foreslå', 'Bruk alle', '"ny"', 'Finn bilde', 'Bruk bildet', 'Godta valgte', 'Hopp over', '✦ Rydd opp med Glimt',
    'Finn bilder på nett', 'Foreslå automatisk når jeg tar bilde']) assert.ok(u.includes(t), t);
  assert.match(k, /«Finn bilder på nett» er slått av/);
});

test('sikkerhet og kilde', () => {
  assert.equal(confText(0.82), '82 %');
  assert.equal(confText(82), '82 %');
  assert.equal(confText(1.4e-9), '0 %');
  assert.equal(confText(null), null);
  assert.equal(conf01(150), 1);
});

test('specs fra forslaget flettes inn i skjemaet', () => {
  assert.deepEqual(mergeSpecs([['verdi', '']], [['verdi', '10 kΩ'], ['toleranse', '5 %']]), [['verdi', '10 kΩ'], ['toleranse', '5 %']]);
  assert.deepEqual(mergeSpecs([['Verdi', '10k'], ['pakke', '0805']], [['verdi', '10 kΩ']]), [['Verdi', '10 kΩ'], ['pakke', '0805']]);
  assert.deepEqual(mergeSpecs([['verdi', '']], []), [['verdi', '']]);
  assert.deepEqual(mergeSpecs([], [['', 'x'], ['gjenger', '']]), [['verdi', '']]);
});

test('tags uten dubletter', () => {
  assert.equal(mergeTags('rustfritt, DIN 912', ['din 912', 'M3', ' ']), 'rustfritt, DIN 912, M3');
  assert.equal(mergeTags('', ['smd', 'SMD']), 'smd');
});

test('rydd opp: standardvalg og fremdrift', () => {
  const a = (o) => ({ name: null, category: null, specs: [], tags: [], ...o });
  assert.equal(tidyDefault({ beforeName: 'motstand 10k', beforeCat: null, after: a({ name: 'Motstand 10 kΩ ¼ W' }), confidence: 0.9 }), true);
  assert.equal(tidyDefault({ beforeName: 'x', beforeCat: 'A', after: a({ name: 'x', category: 'A' }), confidence: 0.9 }), false, 'ingen endring');
  assert.equal(tidyDefault({ beforeName: 'x', beforeCat: null, after: a({ name: 'y' }), confidence: 0.3 }), false, 'lav sikkerhet');
  assert.equal(tidyDefault({ beforeName: 'x', beforeCat: null, after: a({ name: 'y' }), confidence: 70 }), true, '0–100');
  assert.equal(tidyDefault({ beforeName: 'x', beforeCat: null, after: a({ name: 'y' }), confidence: null, error: 'feil' }), false);
  assert.equal(progress(3, 12), '3 av 12');
  assert.equal(progress(0, 0), 'Starter …');
  assert.ok(finished('done') && finished('completed') && finished('error'));
  assert.ok(!finished('running') && !finished('queued'));
});

test('bildesøk: bare miniatyrer via egen server, søketekst fra forslaget', () => {
  assert.equal(ownThumb('/api/skjold/ai/thumb/abc?sig=1'), '/api/skjold/ai/thumb/abc?sig=1');
  assert.equal(ownThumb('https://upload.wikimedia.org/x.jpg'), null);
  assert.equal(ownThumb('//evil.example/x.jpg'), null);
  assert.equal(ownThumb(null), null);
  assert.equal(imgQuery('Motstand 10 kΩ ¼ W', 'res 10k'), 'Motstand 10 kΩ ¼ W');
  assert.equal(imgQuery(' ', ' ESP32 '), 'ESP32');
});

test('Kotlin-funksjonene som speiles her finnes', () => {
  const k = code('Skjold77.kt');
  for (const f of ['conf01_77', 'confText77', 'mergeSpecs77', 'mergeTags77', 'tidyDefault77', 'ownThumb77', 'imgQuery77', 'progress77', 'tidyFinished77', 'sugDiffers77'])
    assert.match(k, new RegExp(`internal fun ${f}\\(`), f);
});
