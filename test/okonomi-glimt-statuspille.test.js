// Prompt 57 (claude-code-glimt-statuspille.md) på web: Glimt-statusen for kvitteringer skal stå øverst, med Glimt-logoen, og aldri
// dele plass med Skann-knappen eller fanelinja. I Økonomi på mobil-web viser flash() tekster som begynner med «✦ » som Glimt-pillen
// øverst (hintToast i mobile-glimt.js: logoen, prikker mens teksten slutter med «…»). Andre tekster blir den vanlige toasten nederst,
// rett over fanelinja og ved Skann-knappen. Her sjekkes at kvitteringsstatusen går til pillen øverst, og at pillen står øverst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../public/finans/js/', import.meta.url);
const js = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));

test('kvitteringer som leses av Glimt: flash-teksten går til Glimt-pillen øverst («✦ » først, «…» sist)', () => {
  // Argumentet til flash(…) med balanserte parenteser (malstrengene kan ha `${…}` inni seg). Bare mobil-web (mobile*.js).
  const args = (s) => { const out = []; let i = 0; while ((i = s.indexOf('flash(', i)) >= 0) { let d = 0, j = i + 5; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) break; } out.push(s.slice(i + 6, j).trim()); i = j; } return out; };
  const hits = [];
  for (const [f, s] of Object.entries(js)) {
    if (!f.startsWith('mobile')) continue;
    for (const t of args(s)) if (/kvittering/i.test(t) && /✦/.test(t)) hits.push([f, t]);
  }
  assert.ok(hits.length >= 4, `fant kvitteringsstatusene (${hits.length})`);
  for (const [f, t] of hits) {
    assert.ok(t.slice(1).startsWith('✦ '), `${f}: ${t} begynner med «✦ »`);
    assert.ok(!/\bAI\b/.test(t), `${f}: ${t} sier Glimt, ikke AI (ordlisten)`);
  }
  const busy = hits.filter(([, t]) => /leser|leses/i.test(t));
  for (const [f, t] of busy) assert.ok(/…\s*[`']\s*(,[^,]*)?$/.test(t), `${f}: ${t} slutter med «…» (Glimt jobber)`);
});

test('Glimt-pillen står øverst og er aldri bredere enn skjermen − 32 px', () => {
  const css = readFileSync(new URL('../public/finans/css/mobile.css', import.meta.url), 'utf8');
  const r = css.match(/\.m \.p31-toast\{([^}]*)\}/)?.[1] ?? '';
  assert.match(r, /position:fixed/);
  assert.match(r, /top:calc\(env\(safe-area-inset-top,0px\) \+ \d+px\)/);
  assert.doesNotMatch(r, /bottom:/);
  assert.match(r, /max-width:calc\(100vw - 32px\)/);
  assert.match(js['mobile-glimt.js'], /export function hintToast[\s\S]{0,400}glimt\(24/, 'Glimt-logoen i pillen');
});
