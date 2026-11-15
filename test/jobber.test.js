// Den felles planleggeren (server/jobs/): startforsinkelse (firstRunAfterMs), engangsjobber og at ingenting starter i test/sandkasse.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const jobs = await import('../server/jobs/index.js');
const flush = () => new Promise((r) => setImmediate(r));

test('firstRunAfterMs: første kjøring etter forsinkelsen, så hvert everyMs', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let n = 0;
    jobs.registerJob('test.forsinket', 60_000, () => { n++; }, { firstRunAfterMs: 5_000 });
    assert.ok(jobs.startJobs({ NODE_ENV: 'production' }) > 0);
    assert.ok(jobs.listJobs().find((j) => j.name === 'test.forsinket').active);
    mock.timers.tick(4_999); await flush(); assert.equal(n, 0);
    mock.timers.tick(1); await flush(); assert.equal(n, 1, 'første kjøring etter 5 s');
    mock.timers.tick(59_999); await flush(); assert.equal(n, 1);
    mock.timers.tick(1); await flush(); assert.equal(n, 2, 'så hvert minutt');
  } finally { jobs.stopJobs(); mock.timers.reset(); }
});

test('uten firstRunAfterMs: første kjøring etter everyMs (som setInterval)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let n = 0;
    jobs.registerJob('test.vanlig', 10_000, () => { n++; });
    jobs.startJobs({ NODE_ENV: 'production' });
    mock.timers.tick(9_999); await flush(); assert.equal(n, 0);
    mock.timers.tick(1); await flush(); assert.equal(n, 1);
  } finally { jobs.stopJobs(); mock.timers.reset(); }
});

test('everyMs: null gir én kjøring etter firstRunAfterMs, som ikke gjentas', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let n = 0;
    jobs.registerJob('test.en-gang', null, () => { n++; }, { firstRunAfterMs: 15_000 });
    jobs.startJobs({ NODE_ENV: 'production' });
    mock.timers.tick(15_000); await flush(); assert.equal(n, 1);
    mock.timers.tick(3_600_000); await flush(); assert.equal(n, 1);
    assert.equal(jobs.listJobs().find((j) => j.name === 'test.en-gang').active, false);
  } finally { jobs.stopJobs(); mock.timers.reset(); }
});

test('ugyldig: everyMs null uten firstRunAfterMs, negativ forsinkelse', () => {
  assert.throws(() => jobs.registerJob('test.ugyldig', null, () => {}), TypeError);
  assert.throws(() => jobs.registerJob('test.ugyldig', 1000, () => {}, { firstRunAfterMs: -1 }), TypeError);
  assert.throws(() => jobs.registerJob('test.ugyldig', 0, () => {}), TypeError);
});

test('i test og sandkasse starter ingen jobber, heller ikke de med startforsinkelse', () => {
  jobs.registerJob('test.sandkasse', 60_000, () => {}, { firstRunAfterMs: 0 });
  assert.equal(jobs.startJobs({ NODE_ENV: 'test' }), 0);
  assert.equal(jobs.startJobs({ NODE_ENV: 'production', OPS51_SANDBOX: '1' }), 0);
  assert.ok(jobs.listJobs().every((j) => !j.active));
});
