// Prompt 71: kalendersøket bruker motorens klokke (today + nowMin i Europe/Oslo), ikke Date.now().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osloMs47 } from '../server/glimt45/tools47.js';

test('osloMs47: Oslo-tid til ms med sommer- og vintertid, null uten klokke', () => {
  assert.equal(new Date(osloMs47('2026-10-24', 600)).toISOString(), '2026-10-24T08:00:00.000Z'); // sommertid (+2)
  assert.equal(new Date(osloMs47('2026-12-17', 1050)).toISOString(), '2026-12-17T16:30:00.000Z'); // vintertid (+1)
  assert.equal(osloMs47(null, 600), null);
  assert.equal(osloMs47('2026-10-24', undefined), null);
});
