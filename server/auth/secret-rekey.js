// Prompt 91 (TFA91): serverhemmeligheten og lagrede data i en systembackup.
//
// Serverhemmeligheten (secret86.js: SESSION_SECRET → DATA_DIR/session-secret → ny tilfeldig → «legacy» reservenøkler) brukes til å
// kryptere eller HMAC-e lagrede data. Backupen tar med databasen, men aldri hemmeligheten, så etter en gjenoppretting på en server
// med en annen hemmelighet kan disse ikke leses:
//
//   Kryptert (AES-256-GCM) – kan krypteres på nytt når den gamle nøkkelen er kjent:
//     totp      users.totp_secret_enc, kv totp_pending.enc  («v1:…»)   totp.js: TOTP_ENC_KEY eller HKDF(hemmelighet('dev'))
//     seal      «enc:…» i kv og tabeller (FinansHub-hemmeligheter, integrasjonsnøkler, backup51, Whisper/Fermion/oMLX/VoxCPM,
//               sporing, bursdager)                                    finans/db.js: sha256('fh-secret:' + (SECRET_KEY || hemmelighet('dev')))
//     settings  «enc1:…» i kv (integrasjonsinnstillinger, sporing37)  settings.js: scrypt(hemmelighet('homelab-os', live), 'hl-settings-v1')
//     domains   hl_domains.token_enc (base64)                         domains.js: scrypt(hemmelighet('homelab-os', live), 'hl-domains-v1')
//     gsc       «gsc1:…» i kv (Search Console-token per bruker)        domains-glimt.js: HKDF(SECRET_KEY || hemmelighet('dev'), 'gsc:'+bruker)
//   Ikke med her: study44 (studiedokumenter, filer + text_enc) – må lastes opp på nytt hvis hemmeligheten er byttet.
//   HMAC (enveis) – kan ikke regnes om, må lages på nytt:
//     gjenopprettingskoder for 2FA (users.recovery_hashes), app-tokens (fh_tokens.id), økter (sessions, aldri i backupen),
//     enhetsnøkler/fingeravtrykk i sec51 og invitasjonskoder i webx51.
//   Bare kortlivede signaturer (bilde-URL-er i media50, api-auth46, glimt35, skjold76/77): ingen lagrede data.
//
// Fingeravtrykk: HMAC-SHA256 med hver avledede nøkkel over en fast tekst, avkortet. Det avslører verken hemmeligheten eller nøklene,
// men gjør det mulig å se om en backup er laget med samme nøkler, og om den gamle nøkkelen er en serveren kjenner
// (reservenøklene i koden, fila session-secret eller SESSION_SECRET). Hemmeligheten og nøklene logges aldri og sendes aldri ut.
import { createDecipheriv, createCipheriv, createHash, createHmac, hkdfSync, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { sessionSecret86, secretStatus86, SECRET_FILE86 } from './server-secret.js';
import { encryptSecretWith, decryptSecretWith } from './totp.js';

export const KINDS91 = ['totp', 'seal', 'settings', 'domains', 'hmac'];
const sha = (s) => createHash('sha256').update(s).digest();

/** Nøklene en hemmelighet gir. base(legacy, live) → strengen modulene bruker; overrides = TOTP_ENC_KEY/SECRET_KEY gjelder. */
export function ring91(base, { env = process.env, overrides = true } = {}) {
  const tk = overrides ? env.TOTP_ENC_KEY : '', sk = overrides ? env.SECRET_KEY : '';
  const dev = base('dev', false), hos = base('homelab-os', true);
  return {
    totp: tk ? (/^[0-9a-f]{64}$/i.test(tk) ? Buffer.from(tk, 'hex') : sha(tk)) : Buffer.from(hkdfSync('sha256', dev, 'homelab-totp', 'totp-secret-v1', 32)),
    seal: sha('fh-secret:' + (sk || dev)),
    settings: scryptSync(hos, 'hl-settings-v1', 32),
    domains: scryptSync(hos, 'hl-domains-v1', 32),
    gscBase: sk || dev,
    hmac: Buffer.from(dev),
  };
}
const fpOf = (key) => createHmac('sha256', key).update('homelab-backup91-fingerprint-v1').digest('hex').slice(0, 32);
/** {totp, seal, settings, domains, hmac} – fingeravtrykk (32 hex-tegn) av hver nøkkel. */
export const fingerprints91 = (ring) => Object.fromEntries(KINDS91.map((k) => [k, fpOf(ring[k])]));

let curCache = null;
/** Nøklene serveren bruker nå. */
export function currentRing91() {
  const sig = `${process.env.SESSION_SECRET ?? ''}|${config.sessionSecret ?? ''}|${process.env.TOTP_ENC_KEY ?? ''}|${process.env.SECRET_KEY ?? ''}`;
  const h = sha(sig).toString('hex');
  if (curCache?.h !== h) { const ring = ring91((l, live) => sessionSecret86(l, live)); curCache = { h, ring, fp: fingerprints91(ring) }; }
  return curCache;
}

/** Til manifest.json: kilde og fingeravtrykk – aldri hemmeligheten. */
export const manifestSecret91 = () => ({ source: source91(), fp: currentRing91().fp });
/** Hvor hemmeligheten kommer fra nå: 'env' | 'file' | 'legacy' (ingen hemmelighet: reservenøklene i koden). */
export function source91() {
  if (!sessionSecret86('')) return 'legacy';
  return config.sessionSecret ? 'env' : secretStatus86().source === 'legacy' ? 'legacy' : 'file';
}

/**
 * Eldre nøkler serveren kjenner: reservenøklene i koden («legacy»), fila DATA_DIR/session-secret og SESSION_SECRET (når de er
 * forskjellige fra den som brukes nå), og eventuelt en ekstra hemmelighet (scripts/rekey-secrets.js --old-secret-file).
 * Hver med og uten TOTP_ENC_KEY/SECRET_KEY. → [{source, ring, fp}]
 */
let candCache = null;
export function candidates91({ extra = [] } = {}) {
  const cur = currentRing91();
  if (!extra.length && candCache?.h === cur.h) return candCache.list;
  const bases = [{ source: 'legacy', base: (l) => l }];
  try {
    const f = join(config.dataDir, SECRET_FILE86);
    if (existsSync(f)) { const s = readFileSync(f, 'utf8').trim(); if (s.length >= 32) bases.push({ source: 'file', base: () => s }); }
  } catch { /* uleselig fil */ }
  if (process.env.SESSION_SECRET) { const s = process.env.SESSION_SECRET; bases.push({ source: 'env', base: () => s }); }
  for (const s of extra) if (s) bases.push({ source: 'old', base: () => s });
  const seen = new Set([JSON.stringify(cur.fp)]), list = [];
  for (const b of bases) for (const overrides of [true, false]) {
    const ring = ring91(b.base, { overrides }), fp = fingerprints91(ring), k = JSON.stringify(fp);
    if (seen.has(k)) continue;
    seen.add(k); list.push({ source: b.source, ring, fp });
  }
  if (!extra.length) candCache = { h: cur.h, list };
  return list;
}

const FP_RE = /^[0-9a-f]{32}$/;
/** Godtar bare {source, fp:{kind: hex}} fra et manifest (alt annet ignoreres). */
export function cleanSecret91(s) {
  if (!s || typeof s !== 'object' || !s.fp || typeof s.fp !== 'object') return null;
  const fp = {};
  for (const k of KINDS91) if (typeof s.fp[k] === 'string' && FP_RE.test(s.fp[k])) fp[k] = s.fp[k];
  if (!Object.keys(fp).length) return null;
  return { source: ['env', 'file', 'legacy'].includes(s.source) ? s.source : null, fp };
}

/**
 * Sammenligner backupens fingeravtrykk med serverens. → null (ukjent: eldre backup) |
 * {same, secretMismatch (ulik og den gamle nøkkelen er ukjent), secretRekey (ulik, men kjent – krypteres på nytt), hmacChanged, source}
 */
export function compareSecret91(manSecret) {
  const s = cleanSecret91(manSecret);
  if (!s) return null;
  const cur = currentRing91().fp, cands = candidates91();
  const enc = ['totp', 'seal', 'settings', 'domains'].filter((k) => s.fp[k]);
  const diff = enc.filter((k) => s.fp[k] !== cur[k]);
  const unknown = diff.filter((k) => !cands.some((c) => c.fp[k] === s.fp[k]));
  const hmacChanged = !!s.fp.hmac && s.fp.hmac !== cur.hmac;
  return { same: !diff.length && !hmacChanged, secretMismatch: unknown.length > 0, secretRekey: diff.length > 0 && !unknown.length, hmacChanged, source: s.source, unknown };
}

/* ---------------- Dekryptering/kryptering med en gitt nøkkel (samme formater som modulene) ---------------- */

function gcmOpen(b, key) {
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
function gcmSeal(text, key) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
const gscKey = (base, user) => Buffer.from(hkdfSync('sha256', base, `gsc:${user}`, 'nordlys-gsc-token-v1', 32));
/** Formatene: {test(v), open(v, ring, user), seal(plain, ring, user)} */
const FORMATS = {
  seal: { test: (v) => v.startsWith('enc:'), open: (v, r) => gcmOpen(Buffer.from(v.slice(4), 'base64'), r.seal), seal: (p, r) => 'enc:' + gcmSeal(p, r.seal).toString('base64') },
  settings: { test: (v) => v.startsWith('enc1:'), open: (v, r) => gcmOpen(Buffer.from(v.slice(5), 'base64'), r.settings), seal: (p, r) => 'enc1:' + gcmSeal(p, r.settings).toString('base64') },
  gsc: { test: (v) => v.startsWith('gsc1:'), open: (v, r, u) => gcmOpen(Buffer.from(v.slice(5), 'base64'), gscKey(r.gscBase, u)), seal: (p, r, u) => 'gsc1:' + gcmSeal(p, gscKey(r.gscBase, u)).toString('base64') },
  totp: { test: (v) => /^v1:[\w-]+:[\w-]+:[\w-]+$/.test(v), open: (v, r) => decryptSecretWith(v, r.totp).toString('base64'), seal: (p, r) => encryptSecretWith(Buffer.from(p, 'base64'), r.totp) },
  domains: { test: () => true, open: (v, r) => gcmOpen(Buffer.from(v, 'base64'), r.domains), seal: (p, r) => gcmSeal(p, r.domains).toString('base64') },
};
const tryOpen = (fmt, v, ring, user) => { try { return { ok: true, plain: FORMATS[fmt].open(v, ring, user) }; } catch { return { ok: false }; } };

/**
 * Én verdi: leses den med dagens nøkkel → uendret. Ellers prøves de gamle nøklene; treff → kryptert på nytt med dagens.
 * → {v, state: 'ok' | 'rekeyed' | 'unreadable'}
 */
export function rekeyValue91(fmt, v, { cur, olds, user = null }) {
  if (tryOpen(fmt, v, cur, user).ok) return { v, state: 'ok' };
  for (const o of olds) {
    const r = tryOpen(fmt, v, o.ring, user);
    if (r.ok) return { v: FORMATS[fmt].seal(r.plain, cur, user), state: 'rekeyed' };
  }
  return { v, state: 'unreadable' };
}
const stringFmt = (v) => (FORMATS.settings.test(v) ? 'settings' : FORMATS.seal.test(v) ? 'seal' : FORMATS.gsc.test(v) ? 'gsc' : null);

/** Går gjennom en JSON-verdi og krypterer forseglede strenger på nytt. → {value, changed} (tellingene legges i stats) */
function walk(value, ctx, stats, path = '') {
  if (typeof value === 'string') {
    let fmt = stringFmt(value);
    if (!fmt && ctx.totpKey && /(^|\.)enc$/.test(path) && FORMATS.totp.test(value)) fmt = 'totp';
    if (!fmt) return { value, changed: false };
    const r = rekeyValue91(fmt, value, ctx);
    const bucket = fmt === 'totp' ? stats.pending : stats.values;
    if (r.state !== 'ok') bucket[r.state]++;
    return { value: r.v, changed: r.v !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((x, i) => { const r = walk(x, ctx, stats, `${path}[${i}]`); changed ||= r.changed; return r.value; });
    return { value: changed ? out : value, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out = {};
    for (const [k, x] of Object.entries(value)) { const r = walk(x, ctx, stats, path ? `${path}.${k}` : k); changed ||= r.changed; out[k] = r.value; }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

const qi = (n) => `"${String(n).replace(/"/g, '""')}"`;

/**
 * Krypterer lagrede verdier på nytt med dagens nøkler der de bare kan leses med en eldre, kjent nøkkel.
 * Kjøres i transaksjonen til gjenopprettingen (system-backup.js) eller fra scripts/rekey-secrets.js.
 *   conn       better-sqlite3-tilkoblingen (main)
 *   tables     Set med tabeller som skal gås gjennom (null = alle)
 *   kvFilter   (key) → bool: hvilke kv-rader (null = alle)
 *   disable2fa slå av 2FA for brukere med uleselig TOTP-hemmelighet
 *   extra      ekstra gamle hemmeligheter (strenger) å prøve
 * → {totp:{rekeyed, unreadable:[brukernavn], disabled:[brukernavn]}, pending:{…}, values:{rekeyed, unreadable}, domains:{…},
 *    recoveryUsers:[brukernavn med gjenopprettingskoder som ikke kan sjekkes], tokens: antall app-tokens}
 */
export function rekeyDb91(conn, { tables = null, kvFilter = null, disable2fa = false, extra = [] } = {}) {
  const cur = currentRing91().ring, olds = candidates91({ extra });
  const has = (t) => (!tables || tables.has(t)) && !!conn.prepare("SELECT 1 FROM main.sqlite_master WHERE type='table' AND name=?").get(t);
  const stats = { totp: { rekeyed: 0, unreadable: [], disabled: [] }, pending: { rekeyed: 0, unreadable: 0 }, values: { rekeyed: 0, unreadable: 0 }, domains: { rekeyed: 0, unreadable: 0 }, recoveryUsers: [], tokens: 0 };
  // 2FA-hemmelighetene.
  if (has('users')) {
    const upd = conn.prepare('UPDATE main.users SET totp_secret_enc=? WHERE id=?');
    const off = conn.prepare("UPDATE main.users SET totp_enabled=0, totp_secret_enc=NULL, recovery_hashes='[]', totp_last_step=-1 WHERE id=?");
    for (const u of conn.prepare('SELECT id, username, totp_enabled, totp_secret_enc, recovery_hashes FROM main.users WHERE totp_secret_enc IS NOT NULL').all()) {
      const r = rekeyValue91('totp', u.totp_secret_enc, { cur, olds });
      if (r.state === 'rekeyed') { upd.run(r.v, u.id); stats.totp.rekeyed++; }
      if (r.state === 'unreadable') {
        if (u.totp_enabled) stats.totp.unreadable.push(u.username);
        if (disable2fa || !u.totp_enabled) { off.run(u.id); if (u.totp_enabled) stats.totp.disabled.push(u.username); continue; }
      }
      let n = 0; try { n = JSON.parse(u.recovery_hashes || '[]').length; } catch { n = 0; }
      if (u.totp_enabled && n) stats.recoveryUsers.push(u.username);
    }
  }
  // kv: JSON-verdier med «enc:», «enc1:», «gsc1:» og ventende 2FA-oppsett.
  if (has('kv')) {
    const upd = conn.prepare('UPDATE main.kv SET value=? WHERE user=? AND key=?');
    for (const row of conn.prepare("SELECT user, key, value FROM main.kv WHERE value LIKE '%enc:%' OR value LIKE '%enc1:%' OR value LIKE '%gsc1:%' OR key='totp_pending'").all()) {
      if (kvFilter && !kvFilter(row.key)) continue;
      let v; try { v = JSON.parse(row.value); } catch { continue; }
      const r = walk(v, { cur, olds, user: row.user, totpKey: row.key === 'totp_pending' }, stats);
      if (r.changed) upd.run(JSON.stringify(r.value), row.user, row.key);
    }
  }
  // Domener: API-token per domene (base64 uten prefiks).
  if (has('hl_domains') && conn.prepare("SELECT 1 FROM pragma_table_info('hl_domains') WHERE name='token_enc'").get()) {
    const upd = conn.prepare('UPDATE main.hl_domains SET token_enc=? WHERE id=?');
    for (const d of conn.prepare("SELECT id, token_enc FROM main.hl_domains WHERE token_enc IS NOT NULL AND token_enc<>''").all()) {
      const r = rekeyValue91('domains', d.token_enc, { cur, olds });
      if (r.state === 'rekeyed') { upd.run(r.v, d.id); stats.domains.rekeyed++; }
      if (r.state === 'unreadable') stats.domains.unreadable++;
    }
  }
  // Andre tabeller: tekstkolonner som starter med «enc:»/«enc1:» (forseglet med seal()/sealSecret()).
  for (const t of conn.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL%' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").pluck().all()) {
    if (['kv', 'users', 'hl_domains', 'sessions', 'backup_jobs'].includes(t) || !has(t)) continue;
    const cols = conn.prepare(`PRAGMA main.table_info(${qi(t)})`).all().filter((c) => !c.type || /TEXT|CHAR|CLOB/i.test(c.type));
    for (const c of cols) {
      let rows;
      try { rows = conn.prepare(`SELECT rowid AS rid, ${qi(c.name)} AS v FROM main.${qi(t)} WHERE ${qi(c.name)} LIKE 'enc:%' OR ${qi(c.name)} LIKE 'enc1:%'`).all(); } catch { continue; } // f.eks. WITHOUT ROWID
      if (!rows.length) continue;
      const upd = conn.prepare(`UPDATE main.${qi(t)} SET ${qi(c.name)}=? WHERE rowid=?`);
      for (const row of rows) {
        if (typeof row.v !== 'string') continue;
        const r = rekeyValue91(stringFmt(row.v), row.v, { cur, olds });
        if (r.state === 'rekeyed') { upd.run(r.v, row.rid); stats.values.rekeyed++; }
        if (r.state === 'unreadable') stats.values.unreadable++;
      }
    }
  }
  if (has('fh_tokens')) stats.tokens = conn.prepare('SELECT count(*) FROM main.fh_tokens').pluck().get();
  return stats;
}

const list = (a) => a.join(', ');
const n = (x, en, fl) => `${x} ${x === 1 ? en : fl}`;
/** Norske meldinger til svaret etter gjenoppretting/skriptet. cmp = compareSecret91(manifest.secret) eller null. */
export function rekeyMessages91(st, cmp, { disable2fa = false } = {}) {
  const m = [];
  const src = { legacy: 'reservenøkkelen i koden', file: 'fila session-secret', env: 'SESSION_SECRET' };
  if (cmp && !cmp.same) m.push(`Backupen er laget med en annen serverhemmelighet${cmp.source ? ` (${src[cmp.source] ?? cmp.source})` : ''} enn serveren bruker nå (${src[source91()]}).${cmp.secretMismatch ? ' Den gamle nøkkelen er ukjent for serveren.' : ' Den gamle nøkkelen er kjent, så krypterte verdier er kryptert på nytt.'}`);
  if (st.totp.rekeyed) m.push(`Tofaktor: ${n(st.totp.rekeyed, 'hemmelighet', 'hemmeligheter')} er kryptert på nytt med dagens nøkkel og virker som før.`);
  if (st.values.rekeyed + st.domains.rekeyed + st.pending.rekeyed) m.push(`Lagrede nøkler og innstillinger: ${n(st.values.rekeyed + st.domains.rekeyed + st.pending.rekeyed, 'verdi', 'verdier')} er kryptert på nytt.`);
  if (st.totp.disabled.length) m.push(`Tofaktor-nøkkelen kunne ikke leses for ${list(st.totp.disabled)}. Tofaktor er slått av for ${st.totp.disabled.length === 1 ? 'denne brukeren' : 'disse brukerne'}, så de kan logge inn med passord og sette det opp på nytt.`);
  const left = st.totp.unreadable.filter((u) => !st.totp.disabled.includes(u));
  if (left.length) m.push(`Tofaktor-nøkkelen kan ikke leses for ${list(left)}${disable2fa ? '' : ' (2FA ble ikke slått av)'}. De kan ikke logge inn med kode fra appen: slå av tofaktor med passordet, la en administrator nullstille det, eller kjør npm run reset-2fa -- <brukernavn> på serveren.`);
  if (st.values.unreadable + st.domains.unreadable) m.push(`${n(st.values.unreadable + st.domains.unreadable, 'lagret nøkkel', 'lagrede nøkler')} (integrasjoner, innstillinger) kan ikke leses og må legges inn på nytt.`);
  // Uten fingeravtrykk (eldre backup): hemmeligheten er trolig byttet når en 2FA-nøkkel måtte krypteres på nytt eller ikke kunne leses.
  const changed = cmp ? cmp.hmacChanged : !!(st.totp.rekeyed || st.totp.unreadable.length);
  if (st.recoveryUsers.length && changed) m.push(`Gjenopprettingskodene for tofaktor (${list(st.recoveryUsers)}) er laget med den gamle hemmeligheten og virker trolig ikke lenger. Lag nye under Innstillinger → Innlogging → Tofaktor.`);
  if (st.tokens && changed) m.push(`App-innlogginger (${n(st.tokens, 'token', 'tokens')}) er laget med den gamle hemmeligheten og virker ikke lenger. Logg inn på nytt i appene.`);
  return m;
}
