// Kalender på web følger Homelab-stilen og -modusen (BESLUTNINGER Q14): ikke noe eget kalendertema (html[data-kal-theme]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('kalender: CSS og JS bruker html[data-mode], ikke et eget data-kal-theme', () => {
  const css = ['public/css/pages/kalender.css', ...readdirSync(join(ROOT, 'public/css/components')).map((f) => `public/css/components/${f}`)];
  for (const f of css) assert.doesNotMatch(read(f), /data-kal-theme/, f);
  assert.match(read('public/css/pages/kalender.css'), /html\[data-mode="dark"\] #kal\.k39\{/);
  assert.doesNotMatch(read('public/js/hl-boot.js'), /kal_theme|data-kal-theme/);
});

test('kalender: lys/mørk-knappen bytter Homelab-modusen (samme valg som Innstillinger → Utseende)', () => {
  const js = read('public/js/kalender-tema.js');
  assert.match(js, /import \{ webMode, setMode \} from '\.\/mode44\.js'/);
  assert.match(js, /setMode\(ORDER\[/);
  assert.doesNotMatch(js, /localStorage\.setItem\('kal_theme'/);
  assert.match(read('public/js/kalender-oppsett.js'), /themeBtn\(\)/);
});
