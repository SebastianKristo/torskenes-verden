// A §5: bibelvers er på som standard for eieren (hovedadmin), ikke for et bestemt brukernavn. Andre brukere får modulen når
// admin slår den på. Valg som allerede er lagret, endres ikke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-bibel-standard-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-bibel';
process.env.USER_NAME = 'Eier';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('eierpassord1');
const { db, OWNER } = await import('../server/db.js');
const session = await import('../server/auth/session.js');
const bible = await import('../server/bibel/bible.js');

test('eieren har bibelvers på som standard, uansett brukernavn', () => {
  assert.equal(session.userInfo(OWNER).username, 'eier');
  assert.deepEqual([bible.featureOf(OWNER).allowed, bible.featureOf(OWNER).enabled], [true, true]);
});

test('en vanlig bruker som heter «sebastian», får det ikke automatisk', () => {
  const u = session.createUser({ username: 'sebastian', password: 'sebastianPassord1', role: 'bruker', name: 'Sebastian' });
  assert.deepEqual([bible.featureOf(u.id).allowed, bible.featureOf(u.id).enabled], [false, false]);
  const admin = session.createUser({ username: 'admin2', password: 'adminPassord123', role: 'admin', name: 'Admin 2' });
  assert.equal(bible.featureOf(admin.id).enabled, false, 'bare hovedadmin, ikke alle administratorer');
});

test('lagrede valg røres ikke', () => {
  db.prepare("UPDATE user_features SET allowed=0, enabled=0 WHERE user_id=? AND feature='bible_verse'").run(OWNER);
  assert.equal(bible.featureOf(OWNER).enabled, false);
});

test('ingen brukernavn er hardkodet i bibelmodulen', () => {
  const src = readFileSync(new URL('../server/bibel/bible.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /sebastian/i);
});
