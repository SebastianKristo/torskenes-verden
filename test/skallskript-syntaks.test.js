// Prompt 30: alle skallskript i repoet må passere `bash -n` (syntakssjekk), særlig deploy/updater/updater.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SCRIPTS = ['deploy/updater/updater.sh', 'deploy/proxmox/update.sh', 'deploy/proxmox/install.sh', 'docker-entrypoint.sh'];
const skip = spawnSync('bash', ['-c', 'true']).status !== 0 && 'trenger bash';
for (const f of SCRIPTS) {
  test(`bash -n ${f}`, { skip }, () => {
    const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}
