// Prompt 85 (TESTFIX85): ingen test skal nå internett eller hjemmenettet. Lastes av `npm test` (node --import ./test/lib/no-net.mjs).
// Alle tilkoblinger og navneoppslag til annet enn loopback feiler straks med ENOTFOUND – det samme en maskin uten nett gir, så
// testene oppfører seg likt overalt (ingen ekte kall til met.no, Entur, Finn, AI-tjenester eller Ollama på 192.168.x.x fra
// bakgrunnsjobber som ingen test har byttet ut fetch for). Underprosesser (node server/index.js) arver vernet via NODE_OPTIONS.
// TEST_ALLOW_NET=1 slår det av. TEST_NET_LOG=<fil> logger forsøkene (JSON-linjer) for feilsøking.
import net from 'node:net';
import dns from 'node:dns';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (process.env.TEST_ALLOW_NET !== '1' && !globalThis.__noNet85) {
  globalThis.__noNet85 = true;
  const self = fileURLToPath(import.meta.url);
  if (!String(process.env.NODE_OPTIONS ?? '').includes(self)) process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --import ${JSON.stringify(self)}`.trim();
  const local = (h) => h == null || h === '' || /^(localhost|127(\.\d+){3}|::1|\[::1\]|0\.0\.0\.0|::|::ffff:127(\.\d+){3})$/i.test(String(h));
  const err = (host) => Object.assign(new Error(`getaddrinfo ENOTFOUND ${host} (nett er sperret i test, se test/lib/no-net.mjs)`), { code: 'ENOTFOUND', errno: -3008, syscall: 'getaddrinfo', hostname: String(host) });
  const note = (kind, host, port) => { if (process.env.TEST_NET_LOG) { try { appendFileSync(process.env.TEST_NET_LOG, `${JSON.stringify({ kind, host, port: port ?? null, file: process.argv[1] ?? null })}\n`); } catch { /* bare logg */ } } };

  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let o = args[0];
    if (Array.isArray(o)) o = o[0]; // net.connect() normaliserer til [options, cb]
    const host = o && typeof o === 'object' ? (o.path ? null : o.host) : typeof o === 'number' && typeof args[1] === 'string' ? args[1] : null;
    if (!local(host)) {
      note('connect', host, o?.port ?? (typeof o === 'number' ? o : null));
      process.nextTick(() => this.destroy(err(host)));
      return this;
    }
    return connect.apply(this, args);
  };
  const lookup = dns.lookup;
  dns.lookup = function (host, opts, cb) {
    if (local(host)) return lookup.call(this, host, opts, cb);
    note('dns', host);
    const done = typeof opts === 'function' ? opts : cb;
    process.nextTick(() => done(err(host)));
    return {};
  };
  const pLookup = dns.promises.lookup;
  dns.promises.lookup = function (host, ...rest) { if (local(host)) return pLookup.call(this, host, ...rest); note('dns', host); return Promise.reject(err(host)); };
  for (const fn of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveTxt', 'resolveSrv', 'resolveCaa', 'reverse']) {
    const orig = dns.promises[fn];
    if (typeof orig === 'function') dns.promises[fn] = function (host, ...rest) { if (local(host)) return orig.call(this, host, ...rest); note(`dns.${fn}`, host); return Promise.reject(err(host)); };
    const cbOrig = dns[fn];
    if (typeof cbOrig === 'function') dns[fn] = function (host, ...rest) { if (local(host)) return cbOrig.call(this, host, ...rest); note(`dns.${fn}`, host); const done = rest.at(-1); process.nextTick(() => typeof done === 'function' && done(err(host))); return {}; };
  }
}
