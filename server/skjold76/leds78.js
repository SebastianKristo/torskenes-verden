// Prompt 78 (LEDSRV): Skjold Lab med LED over hver skuff («vis meg hvor delen ligger»).
// Adresserbar stripe per skuffrad, styrt av en ESP32 med WLED (JSON-API: GET/POST /json/state, GET /json/info). Ingen egen fastvare.
//
// Oppsettet lagres på skapet (kolonnen skj_cabinets.leds, JSON):
//   {host, enabled, color:'#2F6BFF', durationS:30, blink:false, brightness:128, segment:0, startIndex:0, layout:'serpentine'|'same',
//    ledPitchMm:16.667, drawerPitchMm:60, firstDrawerXmm:30, rows:[{row,start,count,reverse,pitchMm,offsetMm}], overrides:{"r-c": index}}
// Indeksen: skuffens midtpunkt x = firstDrawerXmm + (col−1)·drawerPitchMm (mm fra skapets venstre kant). LED k i raden (k = 0 lengst til venstre)
// sitter på offsetMm + k·pitchMm. Nærmeste k velges (klemt til 0…count−1). reverse = stripa går fra høyre mot venstre i raden:
// indeks = start + (count−1−k), ellers start + k. Overstyring per skuff («r-c») går foran. Indeksene er relative til WLED-segmentet `segment`.
// Uten egne rader lages radene av layout: hver rad har sin egen del av stripa (ledsPerRow = round(cols·drawerPitchMm/ledPitchMm)),
// i serpentine (annenhver rad baklengs) eller samme retning.
//
// Sikkerhet: serveren snakker bare med verter i hjemmenettet (private IPv4, .local/.lan som løses til private adresser, eller et lokalt navn uten punktum).
// Tilkoblingen går til den kontrollerte IP-adressen (ingen ny DNS-oppslag), ingen redirects, 3 s tidsavbrudd, maks 64 kB svar. Maks 5 kall i sekundet per bruker.
//
// Ruter (under /api/skjold):
//   GET|PUT /cabinets/:id/leds · POST /cabinets/:id/leds/test {mode:'all'|'row'|'index', row?, index?} (5 s)
//   POST /cabinets/:id/leds/calibrate {index} · PUT /cabinets/:id/leds/override {row,col,index|null}
//   POST /locate {partId}|{partIds:[…]}|{cabinetId,row,col}|{drawers:[{cabinetId,row,col}]} → {ok, lit:[{cabinetId,row,col,index}], untilMs, durationMs, skipped?}
//   POST /locate/off · GET /leds/status[?cabinet=<id>|?host=] · GET|PUT /leds/settings {autoLocateGlimt, autoLocateOpen}
import http from 'node:http';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { db, kv } from '../db.js';
import { cabinetRow76, cabinetRows76, partRow76 } from './store.js';
import { findTool76 } from './glimt.js';
import { SENTENCES46 } from '../glimt45/tools46.js';

const q = (sql) => db.prepare(sql);
if (!q('PRAGMA table_info(skj_cabinets)').all().some((c) => c.name === 'leds')) db.exec('ALTER TABLE skj_cabinets ADD COLUMN leds TEXT');

const NS = { 'Cache-Control': 'no-store' };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const J = (s, d) => { if (s == null) return d; try { return JSON.parse(s) ?? d; } catch { return d; } };
const body = async (c) => { const b = await c.req.json().catch(() => null); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; };
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
const intIn = (v, lo, hi) => { const n = num(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const numIn = (v, lo, hi) => { const n = num(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 1000) / 1000 : null; };

export const MAX_LIT78 = 10;
export const TIMEOUT78 = 3000;
export const MAX_BYTES78 = 64 * 1024;
export const RATE78 = 5; // kall per sekund per bruker
const DEF78 = { host: null, enabled: false, color: '#2F6BFF', durationS: 30, blink: false, brightness: 128, segment: 0, startIndex: 0, layout: 'serpentine',
  ledPitchMm: 16.667, drawerPitchMm: 60, firstDrawerXmm: 30, rows: [], overrides: {} };

/* ---------------- Testkroker ---------------- */

let allowLoopback = false;
let resolver = async (name) => (await dnsLookup(name, { all: true, family: 4 })).map((a) => a.address);
let testMs = 5000;
/** Bare for tester: tillat 127.0.0.0/8 (mocket WLED på localhost). */
export const _allowLoopback78 = (on) => { allowLoopback = !!on; };
/** Bare for tester: DNS-oppslag (navn → [IPv4]). null = vanlig. */
export const _setResolver78 = (fn) => { resolver = fn ?? (async (name) => (await dnsLookup(name, { all: true, family: 4 })).map((a) => a.address)); };
/** Bare for tester: hvor lenge «test» lyser (ms). */
export const _setTestMs78 = (ms) => { testMs = ms ?? 5000; };

/* ---------------- Vertssjekken (hjemmenettet) ---------------- */

/** Privat IPv4: 10/8, 172.16/12, 192.168/16 (+ 127/8 bare i tester). */
export function privateIPv4_78(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127 && allowLoopback) return true;
  return false;
}
/** «http://192.168.1.50:80/» | «wled-skap.local» | «wled» → {host, port} eller {error}. Bare syntaks og IP-literaler; navn løses i resolveHost78. */
export function parseHost78(input) {
  let s = String(input ?? '').trim();
  if (!s) return { error: 'Vert mangler' };
  if (s.length > 120) return { error: 'Verten er for lang' };
  s = s.replace(/^http:\/\//i, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return { error: 'Bare http:// til en vert i hjemmenettet' };
  s = s.replace(/\/+$/, '');
  if (/[/?#@\s\\]/.test(s)) return { error: 'Oppgi bare vertsnavn eller IP-adresse (uten sti)' };
  if (s.startsWith('[') || (s.match(/:/g) ?? []).length > 1) return { error: 'IPv6 støttes ikke – bruk IPv4-adressen i hjemmenettet' };
  let host = s, port = 80;
  const m = /^(.*):(\d{1,5})$/.exec(s);
  if (m) { host = m[1]; port = Number(m[2]); if (port < 1 || port > 65535) return { error: 'Ugyldig port' }; }
  host = host.toLowerCase();
  if (!host) return { error: 'Vert mangler' };
  if (net.isIPv4(host)) {
    if (!privateIPv4_78(host)) return { error: 'Bare adresser i hjemmenettet (10.x, 172.16–31.x, 192.168.x)' };
    return { host, port, ip: host };
  }
  if (/^\d+(\.\d+)*$/.test(host)) return { error: 'Ugyldig IP-adresse' };
  if (!/^[a-z0-9]([a-z0-9-]{0,62})(\.[a-z0-9]([a-z0-9-]{0,62}))*$/.test(host)) return { error: 'Ugyldig vertsnavn' };
  const local = !host.includes('.') || /\.(local|lan)$/.test(host);
  if (!local) return { error: 'Bare verter i hjemmenettet: IP-adresse, navn.local, navn.lan eller et navn uten punktum' };
  return { host, port, ip: null };
}
/** Løser navnet og krever at ALLE adressene er private. → {host, port, ip} eller {error}. */
export async function resolveHost78(input) {
  const p = parseHost78(input);
  if (p.error || p.ip) return p;
  let addrs = [];
  try { addrs = await resolver(p.host); } catch { return { error: `Fant ikke ${p.host} i hjemmenettet`, code: 'dns' }; }
  if (!addrs?.length) return { error: `Fant ikke ${p.host} i hjemmenettet`, code: 'dns' };
  if (!addrs.every(privateIPv4_78)) return { error: `${p.host} peker ut av hjemmenettet – avvist`, code: 'public' };
  return { ...p, ip: addrs[0] };
}

/* ---------------- WLED over HTTP ---------------- */

/** Ett kall til WLED på en kontrollert adresse. Ingen redirects, 3 s, maks 64 kB. → parsed JSON eller kaster Error med .code. */
export async function wled78(hostInput, method, path, payload = undefined) {
  const t = await resolveHost78(hostInput);
  if (t.error) { const e = new Error(t.error); e.code = t.code === 'dns' ? 'unreachable' : 'host'; throw e; }
  const data = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
  return await new Promise((resolve, reject) => {
    const fail = (msg, code) => { const e = new Error(msg); e.code = code; reject(e); };
    const req = http.request({ host: t.ip, port: t.port, method, path, agent: false,
      headers: { Host: t.port === 80 ? t.host : `${t.host}:${t.port}`, Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); req.destroy(); return fail('WLED svarte med en omdirigering – avvist', 'redirect'); }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return fail(`WLED svarte ${res.statusCode}`, 'status'); }
      const chunks = []; let n = 0;
      res.on('data', (ch) => { n += ch.length; if (n > MAX_BYTES78) { req.destroy(); return fail('Svaret fra WLED er for stort', 'size'); } chunks.push(ch); });
      res.on('end', () => { if (n > MAX_BYTES78) return; const txt = Buffer.concat(chunks).toString('utf8'); try { resolve(txt ? JSON.parse(txt) : {}); } catch { fail('WLED ga et ugyldig svar', 'invalid'); } });
      res.on('error', () => fail('Fikk ikke kontakt med WLED', 'unreachable'));
    });
    const timer = setTimeout(() => { req.destroy(); fail(`WLED svarte ikke innen ${TIMEOUT78 / 1000} s`, 'timeout'); }, TIMEOUT78);
    req.on('error', () => fail('Fikk ikke kontakt med WLED', 'unreachable'));
    req.on('close', () => clearTimeout(timer));
    if (data) req.write(data);
    req.end();
  });
}

/* ---------------- Oppsettet og utregningen ---------------- */

export const ledsOf78 = (cab) => ({ ...DEF78, ...J(cab?.leds, {}) });
export function autoRows78(cfg, rows, cols) {
  const per = Math.max(1, Math.round((cols * cfg.drawerPitchMm) / cfg.ledPitchMm));
  return Array.from({ length: rows }, (_, i) => ({ row: i + 1, start: cfg.startIndex + i * per, count: per, reverse: cfg.layout === 'serpentine' && i % 2 === 1,
    pitchMm: cfg.ledPitchMm, offsetMm: Math.round((cfg.ledPitchMm / 2) * 1000) / 1000 }));
}
export const effRows78 = (cfg, cab) => (cfg.rows?.length ? cfg.rows : autoRows78(cfg, cab.rows, cab.cols));
/** Indeksen uten overstyring (null hvis raden ikke har LED-er). */
export function autoIndex78(cfg, cab, row, col) {
  const r = effRows78(cfg, cab).find((x) => x.row === row);
  if (!r || !(r.count > 0)) return null;
  const pitch = r.pitchMm || cfg.ledPitchMm;
  const x = cfg.firstDrawerXmm + (col - 1) * cfg.drawerPitchMm;
  const k = Math.min(r.count - 1, Math.max(0, Math.round((x - (r.offsetMm ?? 0)) / pitch + 1e-9)));
  return r.reverse ? r.start + (r.count - 1 - k) : r.start + k;
}
export function indexFor78(cfg, cab, row, col) {
  const o = cfg.overrides?.[`${row}-${col}`];
  if (Number.isInteger(o)) return { index: o, source: 'override' };
  const i = autoIndex78(cfg, cab, row, col);
  return i == null ? null : { index: i, source: 'auto' };
}
export const ledCount78 = (cfg, cab) => Math.max(0, ...effRows78(cfg, cab).map((r) => r.start + r.count), ...Object.values(cfg.overrides ?? {}).map((i) => i + 1));
const configured = (cfg) => !!cfg.host;

function ledsOut(cab) {
  const cfg = ledsOf78(cab);
  const rows = effRows78(cfg, cab);
  const map = [];
  for (let r = 1; r <= cab.rows; r++) for (let col = 1; col <= cab.cols; col++) {
    const auto = autoIndex78(cfg, cab, r, col), o = cfg.overrides[`${r}-${col}`];
    map.push({ row: r, col, short: `${r}-${col}`, index: Number.isInteger(o) ? o : auto, auto, override: Number.isInteger(o) ? o : null });
  }
  return { cabinetId: cab.id, cabinet: cab.name, cabRows: cab.rows, cabCols: cab.cols, ...cfg, rows, rowsAuto: !cfg.rows?.length, configured: configured(cfg), ledCount: ledCount78(cfg, cab), map };
}

/** Body → nytt oppsett (flettes med det lagrede). → {cfg} | {error}. */
function ledsFields(cab, b) {
  const cur = ledsOf78(cab), f = { ...cur };
  if (has(b, 'host')) {
    if (b.host == null || String(b.host).trim() === '') f.host = null;
    else { const p = parseHost78(b.host); if (p.error) return { error: p.error }; f.host = p.port === 80 ? p.host : `${p.host}:${p.port}`; }
  }
  for (const k of ['enabled', 'blink']) if (has(b, k)) { if (typeof b[k] !== 'boolean') return { error: `${k} må være true/false` }; f[k] = b[k]; }
  if (has(b, 'color')) { const s = String(b.color ?? '').trim(); if (!/^#?[0-9a-f]{6}$/i.test(s)) return { error: 'color må være #rrggbb' }; f.color = `#${s.replace('#', '').toUpperCase()}`; }
  const ints = { durationS: [1, 600], brightness: [1, 255], segment: [0, 31], startIndex: [0, 4095] };
  for (const [k, [lo, hi]] of Object.entries(ints)) if (has(b, k)) { const v = intIn(b[k], lo, hi); if (v == null) return { error: `${k} må være ${lo}–${hi}` }; f[k] = v; }
  const nums = { ledPitchMm: [1, 200], drawerPitchMm: [1, 1000], firstDrawerXmm: [0, 5000] };
  for (const [k, [lo, hi]] of Object.entries(nums)) if (has(b, k)) { const v = numIn(b[k], lo, hi); if (v == null) return { error: `${k} må være ${lo}–${hi}` }; f[k] = v; }
  if (has(b, 'layout')) { if (!['serpentine', 'same'].includes(b.layout)) return { error: "layout må være 'serpentine' eller 'same'" }; f.layout = b.layout; }
  if (has(b, 'rows')) {
    if (b.rows == null) f.rows = [];
    else {
      if (!Array.isArray(b.rows) || b.rows.length > 40) return { error: 'rows må være en liste (maks 40)' };
      const seen = new Set(), rows = [];
      for (const r of b.rows) {
        if (!r || typeof r !== 'object') return { error: 'Hver rad må være {row, start, count, reverse, pitchMm, offsetMm}' };
        const row = intIn(r.row, 1, cab.rows);
        if (row == null) return { error: `row må være 1–${cab.rows}` };
        if (seen.has(row)) return { error: `Rad ${row} står to ganger` };
        seen.add(row);
        const start = intIn(r.start, 0, 4095), count = intIn(r.count, 0, 1000);
        if (start == null) return { error: `Rad ${row}: start må være 0–4095` };
        if (count == null) return { error: `Rad ${row}: count må være 0–1000` };
        const pitchMm = r.pitchMm == null || r.pitchMm === '' ? f.ledPitchMm : numIn(r.pitchMm, 1, 200);
        if (pitchMm == null) return { error: `Rad ${row}: pitchMm må være 1–200` };
        const offsetMm = r.offsetMm == null || r.offsetMm === '' ? 0 : numIn(r.offsetMm, -1000, 5000);
        if (offsetMm == null) return { error: `Rad ${row}: offsetMm må være −1000–5000` };
        rows.push({ row, start, count, reverse: r.reverse === true, pitchMm, offsetMm });
      }
      f.rows = rows.sort((a, b2) => a.row - b2.row);
    }
  }
  if (has(b, 'overrides')) {
    const o = b.overrides ?? {};
    if (typeof o !== 'object' || Array.isArray(o)) return { error: 'overrides må være {"rad-skuff": indeks}' };
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const m = /^(\d+)-(\d+)$/.exec(k);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > cab.rows || Number(m[2]) < 1 || Number(m[2]) > cab.cols) return { error: `Ukjent skuff «${k}»` };
      if (v == null) continue;
      const i = intIn(v, 0, 4095);
      if (i == null) return { error: `Indeksen for ${k} må være 0–4095` };
      out[k] = i;
    }
    f.overrides = out;
  }
  if (f.enabled && !f.host) return { error: 'Sett verten (WLED-kontrolleren) før LED-ene slås på' };
  return { cfg: f };
}
const saveLeds = (cab, cfg) => { q('UPDATE skj_cabinets SET leds=? WHERE id=?').run(JSON.stringify(cfg), cab.id); return cabinetRow76(cab.user_id, cab.id); };

/* ---------------- Økter: tenn, blink, gjenopprett ---------------- */

// Én økt per WLED-vert: forrige tilstand (tatt én gang) + hva hver bruker har tent. Når siste bruker er ferdig, skrives tilstanden tilbake.
const hostsActive = new Map(); // host → {snapshot, segLen, segment, byUser: Map(user → {leds:[{index,color}], until, timer, bri, blink}), blinkTimer, phase}
const hex = (c) => String(c || '#2F6BFF').replace('#', '').toUpperCase();

function frame(h, on = true) {
  const lit = [];
  let bri = 1;
  for (const e of h.byUser.values()) { bri = Math.max(bri, e.bri); for (const l of e.leds) lit.push({ ...l, off: !on && e.blink }); }
  const seen = new Set(), arr = [0, h.segLen, '000000'];
  for (const l of lit) { if (seen.has(l.index) || l.index >= h.segLen) continue; seen.add(l.index); arr.push(l.index, l.off ? '000000' : l.color); }
  return { on: true, bri, seg: [{ id: h.segment, frz: false, i: arr }] };
}
function restorePayload(snap) {
  const out = { on: !!snap?.on, bri: snap?.bri ?? 128 };
  if (Number.isInteger(snap?.ps) && snap.ps > 0) out.ps = snap.ps;
  if (Array.isArray(snap?.seg)) out.seg = snap.seg.map((s) => ({ ...s, frz: false }));
  if (snap?.transition != null) out.transition = snap.transition;
  return out;
}
async function restoreHost(host) {
  const h = hostsActive.get(host);
  if (!h) return;
  hostsActive.delete(host);
  clearInterval(h.blinkTimer);
  for (const e of h.byUser.values()) clearTimeout(e.timer);
  try { await wled78(host, 'POST', '/json/state', restorePayload(h.snapshot)); } catch (e) { console.warn(`[leds78] gjenoppretting feilet (${host}):`, e.code || e.message); }
}
function setBlink(host, h) {
  const any = [...h.byUser.values()].some((e) => e.blink);
  if (!any) { clearInterval(h.blinkTimer); h.blinkTimer = null; return; }
  if (h.blinkTimer) return;
  h.phase = true;
  h.blinkTimer = setInterval(() => {
    if (hostsActive.get(host) !== h) return clearInterval(h.blinkTimer);
    h.phase = !h.phase;
    wled78(host, 'POST', '/json/state', frame(h, h.phase)).catch(() => {});
  }, 700);
  h.blinkTimer.unref?.();
}
async function endUser(host, user) {
  const h = hostsActive.get(host);
  if (!h) return;
  const e = h.byUser.get(user);
  if (e) clearTimeout(e.timer);
  h.byUser.delete(user);
  if (!h.byUser.size) return restoreHost(host);
  setBlink(host, h);
  await wled78(host, 'POST', '/json/state', frame(h)).catch(() => {});
}
/** Tenner LED-er på én vert for brukeren i durationMs og gjenoppretter etterpå. Kaster ved feil (før noe er endret på verten). */
async function lightHost(user, host, { leds, segment, segLen, bri, blink, durationMs }) {
  let h = hostsActive.get(host);
  if (!h) {
    const snapshot = await wled78(host, 'GET', '/json/state');
    if (hostsActive.get(host)) h = hostsActive.get(host); // en annen økt rakk å starte mens vi ventet
    else {
      const seg = Array.isArray(snapshot?.seg) ? snapshot.seg.find((s) => s.id === segment) ?? snapshot.seg[0] : null;
      const len = Number.isInteger(seg?.len) ? seg.len : Number.isInteger(seg?.stop) ? seg.stop - (seg.start ?? 0) : segLen;
      h = { snapshot, segment, segLen: Math.max(1, len || segLen), byUser: new Map(), blinkTimer: null, phase: true };
      hostsActive.set(host, h);
    }
  }
  const old = h.byUser.get(user);
  if (old) clearTimeout(old.timer);
  const until = Date.now() + durationMs;
  const timer = setTimeout(() => { endUser(host, user).catch(() => {}); }, durationMs);
  timer.unref?.();
  h.byUser.set(user, { leds, until, timer, bri, blink });
  try { await wled78(host, 'POST', '/json/state', frame(h)); } catch (e) { await endUser(host, user).catch(() => {}); throw e; }
  setBlink(host, h);
  return until;
}
/** Slukker alt brukeren har tent (alle verter). → antall verter. */
export async function locateOff78(user) {
  const hosts = [...hostsActive.entries()].filter(([, h]) => h.byUser.has(user)).map(([k]) => k);
  for (const host of hosts) await endUser(host, user);
  return hosts.length;
}
/** Bare for tester: slukk alt uten å vente på tidtakerne. */
export async function _resetLeds78() { for (const host of [...hostsActive.keys()]) await restoreHost(host); }
export const _activeHosts78 = () => [...hostsActive.keys()];

/**
 * Tenner skuffer: targets = [{cabinetId,row,col}] (maks 10). Grupperes per vert (flere skap kan dele én kontroller).
 * → {ok, lit, skipped, untilMs, durationMs} | {error, code, status}
 */
export async function locate78(user, targets, { durationS = null, requireEnabled = true } = {}) {
  const groups = new Map(), lit = [], skipped = [];
  for (const t of targets.slice(0, MAX_LIT78)) {
    const cab = cabinetRow76(user, t.cabinetId);
    if (!cab) { skipped.push({ ...t, reason: 'Fant ikke skapet', code: 'not_found' }); continue; }
    const cfg = ledsOf78(cab);
    if (!cfg.host || (requireEnabled && !cfg.enabled)) { skipped.push({ cabinetId: cab.id, row: t.row, col: t.col, reason: 'LED er ikke satt opp for dette skapet', code: 'not_configured' }); continue; }
    if (!(t.row >= 1 && t.row <= cab.rows && t.col >= 1 && t.col <= cab.cols)) { skipped.push({ cabinetId: cab.id, row: t.row, col: t.col, reason: 'Skuffen finnes ikke' }); continue; }
    const ix = indexFor78(cfg, cab, t.row, t.col);
    if (!ix) { skipped.push({ cabinetId: cab.id, row: t.row, col: t.col, reason: 'Raden har ingen LED-er', code: 'no_led' }); continue; }
    const key = `${cfg.host}#${cfg.segment}`;
    if (!groups.has(key)) groups.set(key, { host: cfg.host, segment: cfg.segment, segLen: 0, bri: 1, blink: false, dur: 0, leds: [], items: [] });
    const g = groups.get(key);
    g.segLen = Math.max(g.segLen, ledCount78(cfg, cab));
    g.bri = Math.max(g.bri, cfg.brightness); g.blink ||= cfg.blink; g.dur = Math.max(g.dur, durationS ?? cfg.durationS);
    g.leds.push({ index: ix.index, color: hex(cfg.color) });
    g.items.push({ cabinetId: cab.id, row: t.row, col: t.col, index: ix.index, source: ix.source });
  }
  if (!groups.size) {
    const nc = skipped.find((s) => s.code === 'not_configured');
    if (nc) return { error: 'LED er ikke satt opp for skapet. Sett opp WLED under skapet → LED.', code: 'not_configured', status: 409, skipped };
    if (skipped.every((s) => s.code === 'not_found')) return { error: 'Fant ikke skapet', code: 'not_found', status: 404, skipped };
    return { error: skipped[0]?.reason ?? 'Ingenting å tenne', code: skipped[0]?.code ?? 'nothing', status: 409, skipped };
  }
  // Én bruker kan tenne på flere verter; hver vert får sin egen økt (og sitt eget gjenopprettingspunkt).
  let until = 0, durationMs = 0, firstErr = null;
  for (const g of groups.values()) {
    const ms = g.dur * 1000;
    try { until = Math.max(until, await lightHost(user, g.host, { leds: g.leds, segment: g.segment, segLen: g.segLen, bri: g.bri, blink: g.blink, durationMs: ms })); durationMs = Math.max(durationMs, ms); lit.push(...g.items); }
    catch (e) { firstErr ??= e; for (const it of g.items) skipped.push({ ...it, reason: e.message, code: e.code }); }
  }
  if (!lit.length) return { error: firstErr?.message ?? 'Fikk ikke kontakt med WLED', code: firstErr?.code === 'host' ? 'host' : 'unreachable', status: firstErr?.code === 'host' ? 400 : 502, skipped };
  return { ok: true, lit, untilMs: until, durationMs, ...(skipped.length ? { skipped } : {}) };
}

/* ---------------- Rate limit (5 kall i sekundet per bruker) ---------------- */

const hits = new Map();
export function rateOk78(user, t = Date.now()) {
  const arr = (hits.get(user) ?? []).filter((x) => t - x < 1000);
  if (arr.length >= RATE78) { hits.set(user, arr); return false; }
  arr.push(t); hits.set(user, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 1000)) hits.delete(k);
  return true;
}
export const _resetRate78 = () => hits.clear();
const limited = (c) => c.json({ error: 'For mange LED-kall – vent et øyeblikk (maks 5 i sekundet)', code: 'rate' }, 429, { 'Retry-After': '1' });

/* ---------------- Innstillinger per bruker ---------------- */

const SET_DEF = { autoLocateGlimt: false, autoLocateOpen: false };
export const ledSettings78 = (user) => ({ ...SET_DEF, ...(kv.get(user, 'skjold78_leds', null) ?? {}) });

/* ---------------- Glimt: «hvor er M3-skruene?» tenner skuffen ---------------- */

if (!findTool76.__leds78) {
  const run0 = findTool76.run;
  findTool76.run = async function run78(a, ctx) {
    const r = await run0.call(this, a, ctx);
    try {
      if (!ctx?.user || !ledSettings78(ctx.user).autoLocateGlimt) return r;
      const p = r?.result?.items?.find((x) => x.location?.cabinetId);
      if (!p) return r;
      const out = await locate78(ctx.user, [{ cabinetId: p.location.cabinetId, row: p.location.row, col: p.location.col }]);
      if (out.ok) r.result.leds = { lit: out.lit, untilMs: out.untilMs };
    } catch (e) { console.warn('[leds78] Glimt-tenning:', e.message); }
    return r;
  };
  findTool76.__leds78 = true;
  const s0 = SENTENCES46['skjold.find'];
  if (s0) SENTENCES46['skjold.find'] = (a, r) => { const t = s0(a, r); return r?.result?.leds?.lit?.length ? `${t} Skuffen lyser nå.` : t; };
}

/* ---------------- Rutene ---------------- */

const drawerOf = (b) => ({ cabinetId: Number(b?.cabinetId ?? b?.cabinet_id), row: Number(b?.row), col: Number(b?.col) });
export function mountLeds78(app) {
  const cabOr404 = (c) => cabinetRow76(c.get('user'), c.req.param('id'));
  const NOCAB = { error: 'Fant ikke skapet' };

  app.get('/cabinets/:id{[0-9]+}/leds', (c) => { const cab = cabOr404(c); return cab ? c.json(ledsOut(cab), 200, NS) : c.json(NOCAB, 404); });
  app.put('/cabinets/:id{[0-9]+}/leds', async (c) => {
    const cab = cabOr404(c), b = await body(c);
    if (!cab) return c.json(NOCAB, 404);
    if (!b) return c.json({ error: 'Forventet {host, enabled, color, durationS, blink, brightness, rows, overrides, …}' }, 400);
    const r = ledsFields(cab, b);
    if (r.error) return c.json({ error: r.error }, 400);
    return c.json(ledsOut(saveLeds(cab, r.cfg)));
  });
  app.put('/cabinets/:id{[0-9]+}/leds/override', async (c) => {
    const cab = cabOr404(c), b = await body(c);
    if (!cab) return c.json(NOCAB, 404);
    const row = intIn(b?.row, 1, cab.rows), col = intIn(b?.col, 1, cab.cols);
    if (row == null || col == null) return c.json({ error: `Skuffen finnes ikke (rad 1–${cab.rows}, skuff 1–${cab.cols})` }, 400);
    const cfg = ledsOf78(cab), overrides = { ...cfg.overrides };
    if (b.index == null || b.index === '') delete overrides[`${row}-${col}`];
    else { const i = intIn(b.index, 0, 4095); if (i == null) return c.json({ error: 'index må være 0–4095 (eller null for å fjerne)' }, 400); overrides[`${row}-${col}`] = i; }
    const out = ledsOut(saveLeds(cab, { ...cfg, overrides }));
    return c.json({ ok: true, row, col, index: indexFor78(ledsOf78(cabinetRow76(cab.user_id, cab.id)), cab, row, col)?.index ?? null, leds: out });
  });
  app.post('/cabinets/:id{[0-9]+}/leds/test', async (c) => {
    const u = c.get('user'), cab = cabOr404(c), b = (await body(c)) ?? {};
    if (!cab) return c.json(NOCAB, 404);
    const cfg = ledsOf78(cab);
    if (!cfg.host) return c.json({ error: 'Sett verten (WLED-kontrolleren) først', code: 'not_configured' }, 409);
    const mode = b.mode ?? 'all', total = ledCount78(cfg, cab);
    let idx = [];
    if (mode === 'all') idx = Array.from({ length: total }, (_, i) => i);
    else if (mode === 'row') {
      const r = effRows78(cfg, cab).find((x) => x.row === intIn(b.row, 1, cab.rows));
      if (!r) return c.json({ error: `row må være en rad med LED-er (1–${cab.rows})` }, 400);
      idx = Array.from({ length: r.count }, (_, i) => r.start + i);
    } else if (mode === 'index') {
      const i = intIn(b.index, 0, 4095);
      if (i == null) return c.json({ error: 'index må være 0–4095' }, 400);
      idx = [i];
    } else return c.json({ error: "mode må være 'all', 'row' eller 'index'" }, 400);
    if (!rateOk78(u)) return limited(c);
    try {
      const until = await lightHost(u, cfg.host, { leds: idx.map((index) => ({ index, color: hex(cfg.color) })), segment: cfg.segment, segLen: Math.max(total, ...idx.map((i) => i + 1)), bri: cfg.brightness, blink: false, durationMs: testMs });
      return c.json({ ok: true, mode, count: idx.length, from: idx[0] ?? null, to: idx.at(-1) ?? null, untilMs: until, durationMs: testMs });
    } catch (e) { return c.json({ error: e.message, code: e.code === 'host' ? 'host' : 'unreachable' }, e.code === 'host' ? 400 : 502); }
  });
  app.post('/cabinets/:id{[0-9]+}/leds/calibrate', async (c) => {
    const u = c.get('user'), cab = cabOr404(c), b = await body(c);
    if (!cab) return c.json(NOCAB, 404);
    const cfg = ledsOf78(cab);
    if (!cfg.host) return c.json({ error: 'Sett verten (WLED-kontrolleren) først', code: 'not_configured' }, 409);
    const i = intIn(b?.index, 0, 4095);
    if (i == null) return c.json({ error: 'index må være 0–4095' }, 400);
    if (!rateOk78(u)) return limited(c);
    // Hvilke skuffer peker hit nå (hjelp i veiviseren: «trykk på skuffen som lyser»).
    const out = ledsOut(cab);
    const drawers = out.map.filter((d) => d.index === i).map((d) => ({ row: d.row, col: d.col, short: d.short }));
    try {
      const ms = Math.max(cfg.durationS, 20) * 1000;
      const until = await lightHost(u, cfg.host, { leds: [{ index: i, color: hex(cfg.color) }], segment: cfg.segment, segLen: Math.max(out.ledCount, i + 1), bri: cfg.brightness, blink: false, durationMs: ms });
      return c.json({ ok: true, index: i, ledCount: out.ledCount, drawers, untilMs: until, durationMs: ms });
    } catch (e) { return c.json({ error: e.message, code: e.code === 'host' ? 'host' : 'unreachable' }, e.code === 'host' ? 400 : 502); }
  });

  app.post('/locate', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!b) return c.json({ error: 'Forventet {partId} eller {cabinetId, row, col}' }, 400);
    const targets = [];
    const pids = Array.isArray(b.partIds) ? b.partIds : b.partId != null ? [b.partId] : [];
    if (pids.length > MAX_LIT78 * 5) return c.json({ error: `Maks ${MAX_LIT78} skuffer om gangen` }, 400);
    const noLoc = [];
    for (const id of pids) {
      const p = partRow76(u, id);
      if (!p) { if (pids.length === 1) return c.json({ error: 'Fant ikke delen', code: 'not_found' }, 404); continue; }
      if (!p.cabinet_id || !p.row || !p.col) { noLoc.push({ partId: p.id, reason: 'Delen har ingen plass' }); continue; }
      targets.push({ cabinetId: p.cabinet_id, row: p.row, col: p.col, partId: p.id });
    }
    if (Array.isArray(b.drawers)) for (const d of b.drawers.slice(0, MAX_LIT78 * 5)) targets.push(drawerOf(d));
    if (b.cabinetId != null || b.cabinet_id != null) targets.push(drawerOf(b));
    // Samme skuff bare én gang; maks 10.
    const seen = new Set(), uniq = [];
    for (const t of targets) { const k = `${t.cabinetId}:${t.row}:${t.col}`; if (!seen.has(k)) { seen.add(k); uniq.push(t); } }
    if (!uniq.length) return c.json({ error: noLoc.length ? 'Delen har ingen plass i et skap' : 'Forventet {partId} eller {cabinetId, row, col}', code: noLoc.length ? 'no_location' : 'bad_request', skipped: noLoc }, noLoc.length ? 409 : 400);
    if (!rateOk78(u)) return limited(c);
    const r = await locate78(u, uniq.slice(0, MAX_LIT78));
    const extra = [...noLoc, ...(uniq.length > MAX_LIT78 ? uniq.slice(MAX_LIT78).map((t) => ({ ...t, reason: `Maks ${MAX_LIT78} skuffer om gangen` })) : [])];
    if (r.error) return c.json({ error: r.error, code: r.code, skipped: [...(r.skipped ?? []), ...extra] }, r.status);
    const skipped = [...(r.skipped ?? []), ...extra];
    return c.json({ ok: true, lit: r.lit, untilMs: r.untilMs, durationMs: r.durationMs, ...(skipped.length ? { skipped } : {}) });
  });
  app.post('/locate/off', async (c) => {
    const u = c.get('user');
    if (!rateOk78(u)) return limited(c);
    return c.json({ ok: true, off: await locateOff78(u) });
  });

  app.get('/leds/status', async (c) => {
    const u = c.get('user');
    let hosts = [];
    const qh = c.req.query('host'), qc = c.req.query('cabinet') ?? c.req.query('cabinetId');
    if (qh) { const p = parseHost78(qh); if (p.error) return c.json({ ok: false, error: p.error, code: 'host' }, 400); hosts = [{ host: p.port === 80 ? p.host : `${p.host}:${p.port}`, cabinets: [] }]; }
    else {
      const cabs = cabinetRows76(u).filter((x) => !qc || x.id === Number(qc));
      if (qc && !cabs.length) return c.json(NOCAB, 404);
      const by = new Map();
      for (const cab of cabs) { const cfg = ledsOf78(cab); if (!cfg.host) continue; if (!by.has(cfg.host)) by.set(cfg.host, { host: cfg.host, cabinets: [] }); by.get(cfg.host).cabinets.push(cab.id); }
      hosts = [...by.values()];
    }
    if (!hosts.length) return c.json({ ok: false, configured: false, error: 'Ingen WLED-vert er satt opp', code: 'not_configured', items: [] }, 200, NS);
    if (!rateOk78(u)) return limited(c);
    const items = [];
    for (const h of hosts.slice(0, 5)) {
      try {
        const info = await wled78(h.host, 'GET', '/json/info');
        items.push({ ok: true, host: h.host, cabinets: h.cabinets, name: typeof info?.name === 'string' ? info.name.slice(0, 60) : null, ledCount: Number.isInteger(info?.leds?.count) ? info.leds.count : null,
          version: typeof info?.ver === 'string' ? info.ver.slice(0, 30) : null });
      } catch (e) { items.push({ ok: false, host: h.host, cabinets: h.cabinets, error: e.message, code: e.code === 'host' ? 'host' : 'unreachable' }); }
    }
    const first = items[0];
    return c.json({ ...first, configured: true, items }, 200, NS);
  });
  app.get('/leds/settings', (c) => c.json(ledSettings78(c.get('user')), 200, NS));
  app.put('/leds/settings', async (c) => {
    const u = c.get('user'), b = await body(c);
    if (!b) return c.json({ error: 'Forventet {autoLocateGlimt, autoLocateOpen}' }, 400);
    const cur = ledSettings78(u);
    for (const k of Object.keys(SET_DEF)) if (has(b, k)) { if (typeof b[k] !== 'boolean') return c.json({ error: `${k} må være true/false` }, 400); cur[k] = b[k]; }
    kv.set(u, 'skjold78_leds', cur);
    return c.json(cur);
  });
}
/** Kort sammendrag til skaplisten (cabinetOut). */
export const ledsBrief78 = (cab) => { const cfg = ledsOf78(cab); return { enabled: !!(cfg.enabled && cfg.host), configured: !!cfg.host }; };
