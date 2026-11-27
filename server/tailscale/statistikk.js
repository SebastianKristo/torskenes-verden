// Tailscale: statistikk over tid (prompt 57, claude-code-tailscale.md §2).
//
// tailscale_samples(ts, device_id, online, latency_ms, tunnel, rx, tx): én rad per enhet hvert 5. minutt (jobben i index.js),
// slettes etter 90 dager (nattlig). tailscale_devices(device_id, name, first_seen, last_online) husker når en enhet dukket opp
// første gang (nye enheter siste 7 d, varselet «ny enhet»).
// Alt regnes her på serveren; klientene viser tallene. «I dag» og dagene i oppetidsstripen er Oslo-datoer.
import { db } from '../db.js';
import { osloDate, osloToUtc, addDays } from '../dates/oslo.js';

const H = 3_600_000, DAY = 86_400_000;
export const BEHOLD_DAGER = 90;
export const RANGES = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };

db.exec(`CREATE TABLE IF NOT EXISTS tailscale_samples(ts INTEGER NOT NULL, device_id TEXT NOT NULL, online INTEGER NOT NULL, latency_ms REAL, tunnel TEXT, rx INTEGER, tx INTEGER);
CREATE INDEX IF NOT EXISTS tailscale_samples_dev_ts ON tailscale_samples(device_id, ts);
CREATE INDEX IF NOT EXISTS tailscale_samples_ts ON tailscale_samples(ts);
CREATE TABLE IF NOT EXISTS tailscale_devices(device_id TEXT PRIMARY KEY, name TEXT, first_seen INTEGER NOT NULL, last_online INTEGER);`);

const insSample = db.prepare('INSERT INTO tailscale_samples(ts, device_id, online, latency_ms, tunnel, rx, tx) VALUES(?,?,?,?,?,?,?)');
const upDevice = db.prepare(`INSERT INTO tailscale_devices(device_id, name, first_seen, last_online) VALUES(@id, @name, @now, @on)
  ON CONFLICT(device_id) DO UPDATE SET name=excluded.name, last_online=COALESCE(excluded.last_online, tailscale_devices.last_online)`);

/** Er dette første gang vi ser noen enheter i det hele tatt? (Da varsles det ikke om «ny enhet» for alle.) */
export const forsteRunde = () => !db.prepare('SELECT 1 FROM tailscale_devices LIMIT 1').get();

/** Lagrer én prøve per enhet. → {nye: [id …]} enheter som ikke er sett før. */
export function lagreProver(devices, now = Date.now()) {
  const known = new Set(db.prepare('SELECT device_id FROM tailscale_devices').pluck().all());
  const nye = [];
  db.transaction(() => {
    for (const d of devices) {
      if (!d?.id) continue;
      if (!known.has(d.id)) nye.push(d.id);
      insSample.run(now, d.id, d.online ? 1 : 0, Number.isFinite(d.latencyMs) ? d.latencyMs : null, d.tunnel ?? null, Number(d.rx) || 0, Number(d.tx) || 0);
      upDevice.run({ id: d.id, name: d.name ?? null, now, on: d.online ? now : null });
    }
  })();
  return { nye };
}

/** Sletter prøver eldre enn 90 dager. → antall slettet */
export const slettGamle = (now = Date.now(), dager = BEHOLD_DAGER) => db.prepare('DELETE FROM tailscale_samples WHERE ts < ?').run(now - dager * DAY).changes;

const rows = (id, since, until = Infinity) => db.prepare('SELECT ts, online, latency_ms AS lat, tunnel, rx, tx FROM tailscale_samples WHERE device_id=? AND ts>=? AND ts<=? ORDER BY ts').all(id, since, Number.isFinite(until) ? until : Number.MAX_SAFE_INTEGER);

/* ---------------- Rene hjelpere (testes direkte) ---------------- */

/** Persentil med lineær interpolasjon (p 0–100). Tom liste → null. */
export function persentil(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (Math.min(100, Math.max(0, p)) / 100) * (v.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((v[lo] + (v[hi] - v[lo]) * (i - lo)) * 10) / 10;
}

/** Sum av økningene i en teller (rx/tx) mellom prøvene. Går telleren ned (omstart av tailscaled), telles den nye verdien. */
export function deltaSum(values) {
  let sum = 0;
  for (let i = 1; i < values.length; i++) { const a = Number(values[i - 1]) || 0, b = Number(values[i]) || 0; sum += b >= a ? b - a : b; }
  return sum;
}

const andel = (list) => (list.length ? Math.round((list.filter((r) => r.online).length / list.length) * 1000) / 1000 : null);

/* ---------------- Per enhet ---------------- */

/** Andel prøver online siste 24 t, 7 d og 30 d (0–1, null uten prøver). */
export function oppetid(id, now = Date.now()) {
  const all = rows(id, now - RANGES['30d'], now);
  return Object.fromEntries(Object.entries(RANGES).map(([k, ms]) => [k, andel(all.filter((r) => r.ts >= now - ms))]));
}

/** Latens siste 24 t: median, p95 og en sparkline med 24 timesverdier (median per time, null der det ikke finnes målinger). */
export function latens(id, now = Date.now()) {
  const list = rows(id, now - DAY, now).filter((r) => r.lat != null);
  const spark = Array.from({ length: 24 }, (_, i) => {
    const from = now - DAY + i * H, to = from + H;
    return persentil(list.filter((r) => r.ts >= from && r.ts < to).map((r) => r.lat), 50);
  });
  const all = list.map((r) => r.lat);
  return { median: persentil(all, 50), p95: persentil(all, 95), spark };
}

/** Direkte mot DERP i perioden: andel av online-prøvene med kjent tunnel, og hvilken relay som brukes mest. */
export function tunnelAndel(id, now = Date.now(), ms = DAY) {
  const list = rows(id, now - ms, now).filter((r) => r.online && r.tunnel);
  if (!list.length) return { direkte: null, derp: null, relay: null };
  const derp = list.filter((r) => r.tunnel.startsWith('derp:'));
  const counts = {};
  for (const r of derp) counts[r.tunnel.slice(5)] = (counts[r.tunnel.slice(5)] ?? 0) + 1;
  const relay = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const d = Math.round((1 - derp.length / list.length) * 1000) / 1000;
  return { direkte: d, derp: Math.round((1 - d) * 1000) / 1000, relay };
}

/** Trafikk (byte) for én enhet i perioden: summen av økningene i rx/tx. */
export function trafikk(id, since, now = Date.now()) {
  const list = rows(id, since, now);
  return { rx: deltaSum(list.map((r) => r.rx)), tx: deltaSum(list.map((r) => r.tx)) };
}

/** Oppetidsstripe for de siste 30 Oslo-dagene (eldst først): 'oppe' (≥ 99 % online), 'delvis', 'nede' eller null (ingen prøver). */
export function stripe30(id, now = Date.now()) {
  const today = osloDate(now), first = addDays(today, -29);
  const list = rows(id, osloToUtc(first).getTime(), now);
  const byDay = new Map();
  for (const r of list) { const k = osloDate(r.ts); (byDay.get(k) ?? byDay.set(k, []).get(k)).push(r); }
  return Array.from({ length: 30 }, (_, i) => {
    const date = addDays(first, i), l = byDay.get(date);
    const a = l ? andel(l) : null;
    return { date, state: a == null ? null : a >= 0.99 ? 'oppe' : a > 0 ? 'delvis' : 'nede', uptime: a };
  });
}

/* ---------------- Hele tailnetet ---------------- */

/** Trafikk per enhet siden midnatt (Oslo): [{id, rx, tx}] sortert etter total, og summen. */
export function trafikkIDag(now = Date.now()) {
  const since = osloToUtc(osloDate(now)).getTime();
  const list = db.prepare('SELECT device_id AS id, rx, tx FROM tailscale_samples WHERE ts>=? AND ts<=? ORDER BY device_id, ts').all(since, now);
  const by = new Map();
  for (const r of list) (by.get(r.id) ?? by.set(r.id, []).get(r.id)).push(r);
  const per = [...by].map(([id, l]) => ({ id, rx: deltaSum(l.map((r) => r.rx)), tx: deltaSum(l.map((r) => r.tx)) })).sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx));
  return { per, rx: per.reduce((s, x) => s + x.rx, 0), tx: per.reduce((s, x) => s + x.tx, 0) };
}

/** Total trafikk per Oslo-dag de siste n dagene (eldst først). */
export function perDag(now = Date.now(), n = 7) {
  const today = osloDate(now), first = addDays(today, -(n - 1));
  const list = db.prepare('SELECT ts, device_id AS id, rx, tx FROM tailscale_samples WHERE ts>=? AND ts<=? ORDER BY device_id, ts').all(osloToUtc(first).getTime(), now);
  const sum = new Map(Array.from({ length: n }, (_, i) => [addDays(first, i), { rx: 0, tx: 0 }]));
  let prev = null;
  for (const r of list) {
    if (prev && prev.id === r.id && osloDate(prev.ts) === osloDate(r.ts)) {
      const s = sum.get(osloDate(r.ts));
      if (s) { s.rx += r.rx >= prev.rx ? r.rx - prev.rx : r.rx; s.tx += r.tx >= prev.tx ? r.tx - prev.tx : r.tx; }
    }
    prev = r;
  }
  return [...sum].map(([date, v]) => ({ date, ...v }));
}

/** Median latens og andel direkte for alle enheter siste 24 t. */
export function tailnetLatens(now = Date.now()) {
  const list = db.prepare('SELECT latency_ms AS lat, tunnel, online FROM tailscale_samples WHERE ts>=? AND ts<=?').all(now - DAY, now);
  const t = list.filter((r) => r.online && r.tunnel);
  return { median: persentil(list.map((r) => r.lat).filter((x) => x != null), 50), direkte: t.length ? Math.round((t.filter((r) => r.tunnel === 'direkte').length / t.length) * 1000) / 1000 : null };
}

/** Enheter sett første gang de siste 7 dagene. → [{id, name, firstSeen}] */
export const nyeSiste7d = (now = Date.now()) => db.prepare('SELECT device_id AS id, name, first_seen AS firstSeen FROM tailscale_devices WHERE first_seen>=? ORDER BY first_seen DESC').all(now - 7 * DAY)
  .map((r) => ({ ...r, firstSeen: new Date(r.firstSeen).toISOString() }));

/** Når enheten ble sett første gang (ISO), eller null. */
export const forstSett = (id) => { const t = db.prepare('SELECT first_seen FROM tailscale_devices WHERE device_id=?').pluck().get(id); return t ? new Date(t).toISOString() : null; };

/**
 * Vedlikeholdslistene: nøkler som utløper innen 14 dager, klienter med oppdatering, avvikende klientversjon (mot self, eller den
 * vanligste versjonen når self ikke er kjent – API-kilden), exit-node i bruk og enheter frakoblet over 30 dager.
 */
export function vedlikehold(devices, selfVersion = null, now = Date.now()) {
  const brief = (d, extra = {}) => ({ id: d.id, name: d.name, ...extra });
  const versions = devices.map((d) => d.clientVersion).filter(Boolean);
  const common = Object.entries(versions.reduce((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const ref = selfVersion ?? common;
  const expiring = devices.filter((d) => d.expiresInDays != null && d.expiresInDays <= 14).sort((a, b) => a.expiresInDays - b.expiresInDays).map((d) => brief(d, { expiresInDays: d.expiresInDays, keyExpiry: d.keyExpiry }));
  const updates = devices.filter((d) => d.updateAvailable === true).map((d) => brief(d, { clientVersion: d.clientVersion }));
  const versionMismatch = ref ? devices.filter((d) => d.clientVersion && d.clientVersion !== ref).map((d) => brief(d, { clientVersion: d.clientVersion, expected: ref })) : [];
  const exitNode = devices.filter((d) => d.exitNode).map((d) => brief(d));
  const offline30 = devices.filter((d) => !d.online && d.lastSeen && now - Date.parse(d.lastSeen) > 30 * DAY).map((d) => brief(d, { lastSeen: d.lastSeen }));
  return { expiring, updates, versionMismatch, exitNode, offline30, referenceVersion: ref, count: expiring.length + updates.length + versionMismatch.length + exitNode.length + offline30.length };
}
