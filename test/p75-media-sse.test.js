// Prompt 75: interaktivt søk i Media (web) – siden blir ikke stående på «søker» når hendelsesstrømmen brytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const web = readFileSync(new URL('../public/js/media43.js', import.meta.url), 'utf8');
const srv = readFileSync(new URL('../server/media44.js', import.meta.url), 'utf8');

test('nettleseren: brutt strøm → GET-polling til jobben er ferdig, også etter at hendelser er mottatt, og vakt på 25 s', () => {
  assert.match(web, /es\.onerror = \(\) => \{ es\.close\(\); if \(M\.job === job && !job\.polling\) \{ job\.polling = true; poll\(\); \} \};/);
  assert.doesNotMatch(web, /if \(!got && M\.job === job\) poll\(\)/, 'gammel regel som ga opp etter første hendelse');
  assert.match(web, /Date\.now\(\) - \(job\.lastEv \?\? job\.t0\) > 25_000/);
  assert.match(web, /addEventListener\('ping'/);
});

test('serveren: skrivingene i SSE går i kø, og strømmen lukkes først når «done» er sendt', () => {
  assert.match(srv, /q = q\.then\(\(\) => s\.writeSSE\(/);
  assert.match(srv, /if \(event === 'end'\) \{ clearInterval\(ping\); j\.subs\.delete\(fn\); q\.then\(resolve, resolve\); return; \}/);
});
