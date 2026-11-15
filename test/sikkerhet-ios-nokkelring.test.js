// Opprydding fase 0b (H2, AUDIT §10 / C-ios §7 S1–S3):
// - S1: tokenene (w.token, kal.token, kal.hl.token, hl41.device) lå i klartekst i App Group-UserDefaults. Nå i Nøkkelringen
//   (SharedKeychain/Nokkelring.swift) med App Group-en som tilgangsgruppe; gamle verdier flyttes og slettes fra UserDefaults.
// - S3: kSecAttrAccessibleAfterFirstUnlock uten ThisDeviceOnly (KalKeychain41, MacKeychain) → ThisDeviceOnly med migrering.
// - S2: tokenet sendes i Authorization-headeren til /api/ws, ikke i URL-en. Serveren godtar fortsatt ?token= (eldre apper).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const IOS = new URL('../apps/ios/', import.meta.url).pathname;
const raw = (f) => readFileSync(join(IOS, f), 'utf8');

/** Fjerner kommentarer (også nestede blokk-kommentarer) og beholder strenger. */
function strip(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      let depth = 1; i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; } else i++;
      }
      continue;
    }
    if (c === '"') {
      out += c; i++;
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; }
      if (i < src.length) { out += src[i]; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
const code = (f) => strip(raw(f));
/** iOS-koden: uten #if os(macOS)-grenene (Mac-appen har ingen iPhone-sikkerhetskopi av App Group-en). */
const iosCode = (s) => s.replace(/#if os\(macOS\)[\s\S]*?#(?:else|endif)/g, '');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.swift')) out.push(p);
  }
  return out;
}
const ALL = walk(IOS).filter((f) => !relative(IOS, f).startsWith('KalenderUITests'));

const SECRET_KEYS = ['w.token', 'kal.token', 'kal.hl.token', 'hl41.device'];

test('S1: ingen token skrives til (App Group-)UserDefaults', () => {
  const bad = [];
  for (const f of ALL) {
    const s = iosCode(strip(readFileSync(f, 'utf8')));
    for (const k of SECRET_KEYS) {
      const re = new RegExp(`\\.set\\([^\\n]*forKey:\\s*"${k.replace(/\./g, '\\.')}"`);
      if (re.test(s)) bad.push(`${relative(IOS, f)}: ${k}`);
    }
    if (/\.set\([^\n]*forKey:\s*tokenKey\b/.test(s)) bad.push(`${relative(IOS, f)}: tokenKey`);
    // Ingen «defaults.set(token, …)» / «d.set(token, …)» eller «.set(data, forKey: "hl41…»
    if (/\b(?:d|defaults|KalGroup\.defaults|WidgetShared\.defaults)\.set\(\s*token\s*,/.test(s)) bad.push(`${relative(IOS, f)}: set(token)`);
  }
  assert.deepEqual(bad, []);
  // Lesingen går via Nøkkelringen.
  const w = code('Shared/WidgetShared.swift');
  assert.doesNotMatch(w, /defaults\.string\(forKey: "w\.token"\)/);
  assert.match(w, /static var token: String\? \{\s+migrateSecrets\(\)\s+return Nokkelring\.readString\(tokenKey, service: Nokkelring\.groupService, group: group\)/);
  assert.match(w, /Nokkelring\.writeString\(tokenKey, token, service: Nokkelring\.groupService, group: group\)/);
  const g = iosCode(code('SharedKal/Group/KalGroup.swift'));
  assert.doesNotMatch(g, /defaults\.(?:string|data)\(forKey: "(?:kal\.token|kal\.hl\.token|hl41\.device)"\)/);
  assert.match(g, /secretString\("kal\.token"\)/);
  assert.match(g, /secretString\("kal\.hl\.token"\)/);
  const k41 = iosCode(code('SharedKal/Group/KalShared41.swift'));
  assert.doesNotMatch(k41, /KalGroup\.defaults/);
  assert.match(k41, /KalGroup\.secretData\("hl41\.device"\)/);
  assert.match(k41, /KalGroup\.setSecretData\("hl41\.device", data\)/);
});

test('S1: migrering fra UserDefaults – skriv til Nøkkelringen, slett først når skrivingen lyktes', () => {
  const n = code('SharedKeychain/Nokkelring.swift');
  const mig = n.slice(n.indexOf('static func migrate(defaultsKey'), n.indexOf('static func migrateAccessible'));
  const iWrite = mig.indexOf('if !write(defaultsKey, v, service: service, group: group) { return false }');
  const iDel = mig.lastIndexOf('d.removeObject(forKey: defaultsKey)');
  assert.ok(iWrite > 0 && iDel > iWrite, 'slett etter vellykket skriving');
  // Hovedappen og Kalender ved oppstart.
  const app = code('FinansHub/Sources/App.swift');
  const init = app.slice(app.indexOf('init() {'), app.indexOf('var body'));
  assert.ok(init.includes('WidgetShared.migrateSecrets()') && init.includes('KalGroup.migrateSecrets()'), 'Homelab init');
  const kal = code('Kalender/Sources/KalApp.swift');
  const kinit = kal.slice(kal.indexOf('init() {'), kal.indexOf('var body'));
  assert.ok(kinit.includes('KalGroup.migrateSecrets()'), 'Kalender init');
  // Der widgetene leser (lesing migrerer også).
  const g = code('SharedKal/Group/KalGroup.swift');
  assert.match(g, /static let secretKeys: \[String\] = \["kal\.token", "kal\.hl\.token", "hl41\.device"\]/);
  assert.match(g, /for k in secretKeys \{ migrateSecret\(k\) \}/);
  const sd = g.slice(g.indexOf('static func secretData'), g.indexOf('static func setSecretData'));
  assert.match(iosCode(sd), /migrateSecret\(key\)\s+return Nokkelring\.read\(key, service: Nokkelring\.groupService, group: group\)/);
  assert.match(code('Shared/WidgetShared.swift'), /static func migrateSecrets\(\) \{\s+Nokkelring\.migrate\(defaultsKey: tokenKey, from: defaults, service: Nokkelring\.groupService, group: group\)/);
});

test('Nøkkelring: delt tilgangsgruppe med reserve til appens egen Nøkkelring (aldri UserDefaults)', () => {
  const n = code('SharedKeychain/Nokkelring.swift');
  const w = n.slice(n.indexOf('static func write('), n.indexOf('static func delete('));
  assert.match(w, /writeOne\(account, data, service: service, group: group\)/);
  assert.match(w, /return writeOne\(account, data, service: service, group: nil\) == errSecSuccess/);
  assert.doesNotMatch(w, /UserDefaults/);
  // UserDefaults bare for engangsmerket i migrateAccessible og slettingen i migrate.
  for (const m of n.matchAll(/\.set\(([^,]+),/g)) assert.equal(m[1].trim(), 'true', m[0]);
  assert.match(n, /static let missingEntitlement: OSStatus = -34018/);
  // Én hjelper, i en mappe uten nummer, med i alle målene.
  assert.ok(existsSync(join(IOS, 'SharedKeychain/Nokkelring.swift')));
  const yml = raw('project.yml');
  for (const t of ['FinansHub', 'FinansHubWidgets', 'Kalender', 'KalenderWidgets', 'KalenderMac', 'KalenderMacWidgets', 'FinansHubWatch51']) {
    const i = yml.indexOf(`\n  ${t}:\n`);
    assert.ok(i >= 0, t);
    const rest = yml.slice(i + 1);
    const j = rest.slice(3).search(/\n  [A-Za-z]\w*:\n/);
    const block = (j < 0 ? rest : rest.slice(0, j + 3)).replace(/#.*$/gm, '');
    const src = block.slice(block.indexOf('    sources:'), block.search(/\n    (?:dependencies|entitlements|settings|info):/));
    assert.match(src, /\n\s+- SharedKeychain\s*(?:\n|$)/, t);
  }
  // Ingen keychain-access-groups slått på (sideloading uten Team ID avviser uutvidede verdier); App Group-en er gruppen.
  assert.doesNotMatch(yml.replace(/#.*$/gm, ''), /keychain-access-groups/);
  // Wrapperne bruker hjelperen.
  const k41 = code('SharedKal/Group/KalShared41.swift');
  const kc = k41.slice(k41.indexOf('enum KalKeychain41'), k41.indexOf('enum KalShared41'));
  assert.doesNotMatch(kc, /SecItem/);
  assert.match(kc, /Nokkelring\.write\(account, data, service: svc, group: group\)/);
  const mac = code('KalenderMac/Sources/MacAuth.swift');
  const mk = mac.slice(mac.indexOf('enum MacKeychain'), mac.indexOf('enum MacSession'));
  assert.doesNotMatch(mk, /SecItem/);
  assert.match(mk, /Nokkelring\.write\(account, Data\(value\.utf8\), service: service\)/);
});

test('S3: bare ThisDeviceOnly, og eldre elementer skrives på nytt (les → slett → skriv)', () => {
  for (const f of ALL) {
    const s = strip(readFileSync(f, 'utf8'));
    assert.doesNotMatch(s, /kSecAttrAccessibleAfterFirstUnlock(?!ThisDeviceOnly)/, relative(IOS, f));
    assert.doesNotMatch(s, /kSecAttrAccessibleAlways/, relative(IOS, f));
  }
  const n = code('SharedKeychain/Nokkelring.swift');
  assert.match(n, /static let accessible: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  const ma = n.slice(n.indexOf('static func migrateAccessible'));
  const iRead = ma.indexOf('readOne(account, service: service, group: group)');
  const iDel = ma.indexOf('SecItemDelete(base as CFDictionary)');
  const iAdd = ma.indexOf('add[kSecAttrAccessible as String] = accessible');
  assert.ok(iRead > 0 && iRead < iDel && iDel < iAdd, 'les → slett → skriv');
  const rw = n.slice(n.indexOf('static func rewrite'), n.indexOf('static func migrate(defaultsKey'));
  assert.ok(rw.indexOf('readOne(') < rw.indexOf('SecItemDelete(') && rw.indexOf('SecItemDelete(') < rw.indexOf('SecItemAdd('), 'rewrite: les → slett → skriv');
  // Kalenders egne elementer (iOS) og Mac-tokenet.
  assert.match(code('SharedKal/Group/KalGroup.swift'), /Nokkelring\.migrateAccessible\(service: KalKeychain41\.service\)/);
  const mac = code('KalenderMac/Sources/MacAuth.swift');
  assert.match(mac, /if Nokkelring\.rewrite\(account, service: service\) \{ UserDefaults\.standard\.set\(true, forKey: flag\) \}/);
  assert.match(mac, /MacTokenFile44\.write\(k\)\s+MacKeychain\.migrateAccessible\("token"\)/);
});

test('S2: WebSocket med Authorization-header, ikke ?token= i URL-en', () => {
  for (const f of ALL) {
    const s = strip(readFileSync(f, 'utf8'));
    assert.doesNotMatch(s, /\/api\/ws\?token/, relative(IOS, f));
    assert.doesNotMatch(s, /webSocketTask\(with: url\)/, relative(IOS, f));
  }
  for (const f of ['FinansHub/Sources/Paper17.swift', 'KalenderMac/Sources/MacSystem.swift']) {
    const s = code(f);
    assert.match(s, /URL\(string: [a-z]+ \+ "\/api\/ws"\)/, f);
    assert.match(s, /req\.setValue\("Bearer " \+ token, forHTTPHeaderField: "Authorization"\)/, f);
    assert.match(s, /webSocketTask\(with: req\)/, f);
  }
  // Nytt token → ny forbindelse (nøkkelen har med et fingeravtrykk av tokenet, ikke tokenet selv).
  assert.match(code('FinansHub/Sources/Paper17.swift'), /let k = url\.absoluteString \+ "#" \+ KalGroup\.fingerprint\(token\)/);
});

/* ---------- Serveren: /api/ws godtar Authorization-header og (eldre apper) ?token= ---------- */

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-ws-header-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/auth/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app, wsUser } = await import('../server/index.js');
const { attachRealtime } = await import('../server/realtime.js');
const { serve } = await import('@hono/node-server');
const { WebSocket } = await import('ws');

const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
await new Promise((r) => server.once('listening', r));
attachRealtime(server, wsUser);
const port = server.address().port;
after(() => server.close());

async function appToken() {
  const r = await app.request('/finans/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sebastian', password: 'testpassord1', device: 'test' }) });
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()).token;
}
function open(q, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws${q}`, { headers });
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
  const ready = new Promise((res, rej) => {
    ws.once('open', res); ws.once('error', rej);
    ws.once('unexpected-response', (_, r) => rej(new Error(`HTTP ${r.statusCode}`)));
  });
  return { ws, msgs, ready };
}
const waitFor = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } return null; };

test('/api/ws: Authorization: Bearer godtas uten token i URL-en', async () => {
  const tok = await appToken();
  const w = open('', { authorization: `Bearer ${tok}` });
  await w.ready;
  const hello = await waitFor(() => w.msgs.find((m) => m.type === 'hello'));
  assert.ok(hello, JSON.stringify(w.msgs));
  w.ws.close();
});

test('/api/ws: feil eller manglende header avvises; ?token= virker fortsatt for eldre apper', async () => {
  await assert.rejects(open('', { authorization: 'Bearer feil' }).ready, /401/);
  await assert.rejects(open('', {}).ready, /401/);
  const tok = await appToken();
  const old = open(`?token=${encodeURIComponent(tok)}`);
  await old.ready;
  assert.ok(await waitFor(() => old.msgs.find((m) => m.type === 'hello')));
  old.ws.close();
});
