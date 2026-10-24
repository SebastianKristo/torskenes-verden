// Prompt 51 (OBS51): helsedashbord for hele homelaben med trendvarsel.
//
// Kilder (alt er bare for admin):
//   containere – via Docker-proxyen (homelab-docker, bare GET): status, helse, CPU og minne (stats?stream=false, maks 6 samtidig, cache 30 s)
//   disk       – data-mappen (statfs) + AI-verten (Mac minien, AI_HOST_INFO_URL) + Proxmox-lagring når API-et er satt opp
//   Ollama     – køen i AI-gaten (gateState) og lastede modeller (/api/ps via gaten)
//   Mac-OCR    – helsesjekken til Mac Vision-tjenesten (receipts48)
//   Mac mini   – maskinkortet (aihw38) + om Ollama svarer
//   Proxmox    – valgfritt: API-token (PVEAPIToken) satt av admin, kryptert i kv; valgfri CA (PEM) for selvsignert sertifikat
//   ntfy       – /v1/health på NTFY_URL
// Trend: ledig plass samples hvert 15. min (tabellen obs51_samples, 30 dager). Lineær regresjon over 7 dager → «Disken er full om 9 dager».
import { statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, kv, OWNER } from '../db.js';
import { config } from '../config.js';
import { runAsUser, sealSecret, openSecret } from '../settings.js';
import { docker51, dockerAvailable44 } from '../logs44.js';
import { gateState, loadedModels } from '../ai-gate.js';
import { hostHw } from '../aihw38.js';
import { ntfyConf51 } from './ntfy.js';

db.exec('CREATE TABLE IF NOT EXISTS obs51_samples (ts INTEGER NOT NULL, key TEXT NOT NULL, value REAL NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS obs51_samples_key ON obs51_samples(key, ts)');

const MOCK = () => process.env.MOCK_DATA === '1';
const DAY = 86_400_000;
const GB = 1e9;
const q = (s) => db.prepare(s);
let F = (u, i) => fetch(u, i);
export const _setObsFetch51 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); };
const deps = { macHealth: null }; // tester: erstatt Mac-OCR-sjekken
export const _setObsDeps51 = (d) => Object.assign(deps, d);
const gbText = (b) => (b == null ? null : b >= 1e12 ? `${String(Math.round(b / 1e11) / 10).replace('.', ',')} TB` : `${Math.round(b / GB)} GB`);
const pctText = (p) => `${String(Math.round(p * 10) / 10).replace('.', ',')} %`;

/* ---------------- Samples og trend ---------------- */

export function sample51(key, value, ts = Date.now()) {
  if (!Number.isFinite(value)) return;
  q('INSERT INTO obs51_samples(ts, key, value) VALUES(?,?,?)').run(ts, key, value);
}
export const pruneSamples51 = (now = Date.now()) => q('DELETE FROM obs51_samples WHERE ts < ?').run(now - 30 * DAY).changes;

/** Dager til ledig plass er 0, fra samples av ledig plass (bytes). → {perDay (bytes/døgn, negativ = krymper), fullInDays|null, samples, spanH} */
export function trend51(key, now = Date.now(), days = 7) {
  const rows = q('SELECT ts, value FROM obs51_samples WHERE key=? AND ts>=? ORDER BY ts').all(key, now - days * DAY);
  const n = rows.length;
  if (n < 3 || rows[n - 1].ts - rows[0].ts < 6 * 3_600_000) return { perDay: null, fullInDays: null, samples: n, spanH: n ? Math.round((rows[n - 1].ts - rows[0].ts) / 3_600_000) : 0 };
  const x0 = rows[0].ts;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const r of rows) { const x = (r.ts - x0) / DAY; sx += x; sy += r.value; sxx += x * x; sxy += x * r.value; }
  const den = n * sxx - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0; // bytes per døgn
  const last = rows[n - 1].value;
  const fullInDays = slope < 0 && last > 0 ? Math.round((last / -slope) * 10) / 10 : null;
  return { perDay: Math.round(slope), fullInDays, samples: n, spanH: Math.round((rows[n - 1].ts - x0) / 3_600_000) };
}
export function fullText51(days) {
  if (days == null) return null;
  if (days < 1) return 'Disken er full i løpet av et døgn';
  const d = Math.round(days);
  return `Disken er full om ${d} ${d === 1 ? 'dag' : 'dager'}`;
}

/* ---------------- Disk ---------------- */

export function dataDisk51(dir = resolve(config.dataDir)) {
  try {
    const s = statfsSync(dir);
    const total = s.blocks * s.bsize, free = s.bavail * s.bsize, used = total - s.bfree * s.bsize;
    return { path: dir, total, free, used, pct: total ? Math.round((used / total) * 1000) / 10 : null, text: `${gbText(free)} ledig av ${gbText(total)}` };
  } catch (e) { return { path: dir, error: `Fikk ikke lest disken (${e.code ?? e.message})` }; }
}
function diskOut(key, d, now) {
  if (!d || d.free == null) return d;
  const t = trend51(key, now);
  const level = d.pct >= 95 || (t.fullInDays != null && t.fullInDays < 3) ? 'crit' : d.pct >= 90 || (t.fullInDays != null && t.fullInDays < 14) ? 'warn' : 'ok';
  return { ...d, totalText: gbText(d.total), freeText: gbText(d.free), pctText: d.pct != null ? pctText(d.pct) : null, trend: { ...t, perDayText: t.perDay != null ? `${t.perDay < 0 ? '−' : '+'}${gbText(Math.abs(t.perDay)) ?? '0 GB'} per døgn` : null, text: fullText51(t.fullInDays) }, level };
}

/* ---------------- Containere ---------------- */

const healthOf = (status) => { const m = String(status ?? '').match(/\((healthy|unhealthy|health: starting)\)/i); return m ? (m[1].toLowerCase().startsWith('health') ? 'starting' : m[1].toLowerCase()) : null; };
export { healthOf as healthOf51 };
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
function statsOf(s) {
  const cd = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0), sd = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
  const ncpu = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
  const cpu = sd > 0 ? Math.round((cd / sd) * ncpu * 1000) / 10 : 0;
  const used = Math.max(0, (s.memory_stats?.usage ?? 0) - (s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0)), limit = s.memory_stats?.limit ?? 0;
  return { cpu, cpuText: pctText(cpu), mem: used, memLimit: limit || null, memPct: limit ? Math.round((used / limit) * 1000) / 10 : null, memText: `${Math.round(used / 2 ** 20)} MB${limit ? ` av ${Math.round(limit / 2 ** 30)} GB` : ''}` };
}
let ctCache = null;
export async function containers51({ force = false } = {}) {
  if (!dockerAvailable44()) return { available: false, items: [], error: 'Docker-proxyen er ikke satt opp' };
  if (!force && ctCache && Date.now() - ctCache.at < 30_000) return ctCache.v;
  let list;
  try { list = await docker51.list(); } catch (e) { return { available: false, items: [], error: e.message }; }
  const self = docker51.self();
  const items = await pool(list, 6, async (c) => {
    const name = docker51.nameOf(c), health = healthOf(c.Status);
    let st = null;
    if (c.State === 'running') {
      if (c._restarts !== undefined) st = statsOf({ cpu_stats: { cpu_usage: { total_usage: 340 + name.length * 7 }, system_cpu_usage: 10_000, online_cpus: 1 }, precpu_stats: { cpu_usage: { total_usage: 0 }, system_cpu_usage: 0 }, memory_stats: { usage: (120 + name.length * 23) * 2 ** 20, limit: 8 * 2 ** 30 } });
      else { try { st = statsOf(await docker51.get(`/containers/${c.Id}/stats?stream=false&one-shot=true`, { timeout: 8000 })); } catch { st = null; } }
    }
    const color = c.State === 'running' ? (health === 'unhealthy' ? 'red' : health === 'starting' ? 'yellow' : 'green') : c.State === 'restarting' ? 'yellow' : 'red';
    return { id: String(c.Id).slice(0, 12), name, image: c.Image, state: c.State, status: c.Status, health, color, self: !!self && String(c.Id).startsWith(self), ...(st ?? {}) };
  });
  items.sort((a, b) => ({ red: 0, yellow: 1, green: 2 }[a.color] - { red: 0, yellow: 1, green: 2 }[b.color]) || a.name.localeCompare(b.name, 'nb'));
  const v = { available: true, items, up: items.filter((x) => x.state === 'running').length, total: items.length, unhealthy: items.filter((x) => x.health === 'unhealthy').length };
  ctCache = { at: Date.now(), v };
  return v;
}

/* ---------------- Proxmox ---------------- */

const PVE_KEY = 'obs51_proxmox';
const TOKEN_ID = /^[\w.-]{1,64}@[\w.-]{1,32}![\w.-]{1,64}$/;
export function proxmoxConf51() {
  const c = kv.get(OWNER, PVE_KEY, null) ?? {};
  return { url: c.url ?? '', tokenId: c.tokenId ?? '', secret: c.secret ? openSecret(c.secret) : '', ca: c.ca ?? '', configured: !!(c.url && c.tokenId && c.secret) };
}
export const proxmoxOut51 = () => { const c = proxmoxConf51(); return { configured: c.configured, url: c.url || null, tokenId: c.tokenId || null, secretSet: !!c.secret, caSet: !!c.ca }; };
/** PUT-kroppen: {url, tokenId, secret?, ca?} eller {clear:true}. → feiltekst | null */
export function saveProxmox51(b = {}) {
  if (b.clear === true) { kv.set(OWNER, PVE_KEY, {}); return null; }
  const cur = kv.get(OWNER, PVE_KEY, null) ?? {};
  const url = String(b.url ?? cur.url ?? '').trim().replace(/\/+$/, '');
  if (url && !/^https:\/\/[A-Za-z0-9.-]+(:\d{2,5})?$/.test(url)) return 'Adressen må være https://vert:8006 (uten sti)';
  const tokenId = String(b.tokenId ?? cur.tokenId ?? '').trim();
  if (tokenId && !TOKEN_ID.test(tokenId)) return 'Token-ID må se slik ut: bruker@pve!navn';
  const ca = b.ca === undefined ? cur.ca ?? '' : String(b.ca ?? '').trim();
  if (ca && !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(ca)) return 'CA-sertifikatet må være PEM (-----BEGIN CERTIFICATE-----)';
  const next = { url, tokenId, ca: ca.slice(0, 20_000), secret: cur.secret ?? '' };
  if (typeof b.secret === 'string' && b.secret.trim()) {
    if (!/^[0-9a-f-]{20,64}$/i.test(b.secret.trim())) return 'Hemmeligheten må være UUID-en Proxmox viste da tokenet ble laget';
    next.secret = sealSecret(b.secret.trim());
  }
  kv.set(OWNER, PVE_KEY, next);
  pveCache = null;
  return null;
}
let pveCache = null;
let pveFetch = null; // tester
export const _setPveFetch51 = (fn) => { pveFetch = fn; pveCache = null; };
async function pveGet(c, path) {
  const init = { headers: { Authorization: `PVEAPIToken=${c.tokenId}=${c.secret}`, accept: 'application/json' }, signal: AbortSignal.timeout(5000) };
  let r;
  if (pveFetch) r = await pveFetch(`${c.url}/api2/json${path}`, init);
  else if (c.ca) { const { Agent, fetch: uf } = await import('undici'); r = await uf(`${c.url}/api2/json${path}`, { ...init, dispatcher: new Agent({ connect: { ca: c.ca } }) }); }
  else r = await F(`${c.url}/api2/json${path}`, init);
  if (r.status === 401) throw new Error('Proxmox avviste tokenet (401)');
  if (!r.ok) throw new Error(`Proxmox svarte ${r.status}`);
  return (await r.json())?.data;
}
export async function proxmox51({ force = false } = {}) {
  const c = proxmoxConf51();
  if (!c.configured) return { configured: false };
  if (!force && pveCache && Date.now() - pveCache.at < 60_000) return pveCache.v;
  let v;
  try {
    const nodes = await pveGet(c, '/nodes');
    const out = await Promise.all((Array.isArray(nodes) ? nodes : []).slice(0, 8).map(async (n) => {
      let storage = [];
      try { storage = (await pveGet(c, `/nodes/${encodeURIComponent(n.node)}/storage`)) ?? []; } catch { storage = []; }
      return { node: String(n.node).slice(0, 60), status: n.status, cpu: n.cpu != null ? Math.round(n.cpu * 1000) / 10 : null, mem: n.mem ?? null, memTotal: n.maxmem ?? null,
        memPct: n.maxmem ? Math.round((n.mem / n.maxmem) * 1000) / 10 : null, uptime: n.uptime ?? null,
        storage: storage.filter((s) => s.active && s.total).slice(0, 12).map((s) => ({ id: String(s.storage).slice(0, 60), type: s.type, total: s.total, used: s.used, free: s.avail ?? s.total - s.used, pct: Math.round((s.used / s.total) * 1000) / 10 })) };
    }));
    v = { configured: true, ok: true, nodes: out };
  } catch (e) { v = { configured: true, ok: false, error: String(e.message).replace(c.secret, '••••').slice(0, 200) }; }
  pveCache = { at: Date.now(), v };
  return v;
}

/* ---------------- Ollama, Mac-OCR, Mac mini, ntfy ---------------- */

async function ollama51() {
  const g = gateState();
  const ps = await loadedModels().catch(() => null);
  return { ok: ps != null, error: ps == null ? 'Ollama svarer ikke (eller adressen er ikke satt)' : null, paused: g.paused, concurrency: g.concurrency,
    running: g.running.map((j) => ({ model: j.model, label: j.label, priority: j.priority, ms: j.ms })), waiting: g.waiting, queued: g.waiting.reduce((a, w) => a + w.n, 0),
    loaded: (ps ?? []).map((m) => ({ name: m.name ?? m.model, sizeGb: m.size ? Math.round(m.size / 1e8) / 10 : null, vramGb: m.size_vram ? Math.round(m.size_vram / 1e8) / 10 : null, expiresAt: m.expires_at ?? null })) };
}
async function macOcr51() {
  try {
    if (deps.macHealth) return await deps.macHealth();
    const { r48Settings, macOcrKey48 } = await import('../receipts48/settings.js');
    const { macHealth48 } = await import('../receipts48/engines/mac-vision.js');
    return await runAsUser(OWNER, async () => { const s = r48Settings(); if (!s.macOcr) return { enabled: false, ok: false, error: 'Slått av' }; return { enabled: true, ...(await macHealth48({ url: s.macOcrUrl, key: macOcrKey48(), timeoutMs: 2000 })) }; });
  } catch (e) { return { ok: false, error: e.message }; }
}
async function macMini51(ollamaOk) {
  const hw = await hostHw().catch(() => null);
  if (!hw) return { ok: false };
  const d = hw.disk ?? {};
  const disk = d.freeGb != null && d.totalGb ? { total: d.totalGb * GB, free: d.freeGb * GB, used: (d.totalGb - d.freeGb) * GB, pct: Math.round(((d.totalGb - d.freeGb) / d.totalGb) * 1000) / 10, text: `${gbText(d.freeGb * GB)} ledig av ${gbText(d.totalGb * GB)}`, name: d.name } : null;
  return { ok: !!ollamaOk, model: hw.model, chip: hw.chip, memGb: hw.memGb, source: hw.source, disk };
}
async function ntfy51() {
  const c = ntfyConf51();
  if (!c.enabled) return { configured: false };
  try { const r = await F(`${c.url}/v1/health`, { signal: AbortSignal.timeout(2500) }); const j = await r.json().catch(() => ({})); return { configured: true, ok: r.ok && j?.healthy !== false, tokenSet: !!c.token, publicUrl: c.publicUrl }; }
  catch (e) { return { configured: true, ok: false, tokenSet: !!c.token, error: `Svarer ikke (${e?.cause?.code || e?.name})` }; }
}

/* ---------------- Samlet ---------------- */

let lastSample = 0;
/** Tar samples (ledig plass) for diskene. Kalles hvert 15. min og når dashbordet åpnes. */
export async function takeSamples51(now = Date.now(), { mini = null, pve = null } = {}) {
  const d = dataDisk51();
  if (d.free != null) sample51('disk.data.free', d.free, now);
  const m = mini ?? await macMini51(true).catch(() => null);
  if (m?.disk?.free != null) sample51('disk.aihost.free', m.disk.free, now);
  const p = pve ?? await proxmox51().catch(() => null);
  for (const n of p?.nodes ?? []) for (const s of n.storage ?? []) sample51(`disk.pve.${n.node}.${s.id}.free`, s.free, now);
  lastSample = now;
  if (Math.random() < 0.05) pruneSamples51(now);
}

/** Dashbordet. → {at, overall, alerts, containers, disks:[…], ollama, macOcr, macMini, proxmox, ntfy} */
export async function health51({ force = false, now = Date.now() } = {}) {
  const [cts, ol, mac, pve, nt] = await Promise.all([containers51({ force }), ollama51(), macOcr51(), proxmox51({ force }), ntfy51()]);
  const mini = await macMini51(ol.ok);
  if (force || now - lastSample > 15 * 60_000) await takeSamples51(now, { mini, pve }).catch(() => {});
  const disks = [{ id: 'data', name: 'Data-mappen', ...diskOut('disk.data.free', dataDisk51(), now) }];
  if (mini.disk) disks.push({ id: 'aihost', name: `${mini.model ?? 'AI-maskinen'} · ${mini.disk.name ?? 'disk'}`, ...diskOut('disk.aihost.free', mini.disk, now) });
  for (const n of pve.nodes ?? []) for (const s of n.storage ?? []) disks.push({ ...diskOut(`disk.pve.${n.node}.${s.id}.free`, { ...s, text: `${gbText(s.free)} ledig av ${gbText(s.total)}` }, now), id: `pve.${n.node}.${s.id}`, storage: s.id, name: `Proxmox ${n.node} · ${s.id}` });
  const alerts = alerts51({ containers: cts, disks, ollama: ol, macOcr: mac, macMini: mini, proxmox: pve, ntfy: nt });
  const overall = alerts.some((a) => a.level === 'crit') ? 'crit' : alerts.some((a) => a.level === 'warn') ? 'warn' : 'ok';
  return { at: new Date(now).toISOString(), overall, overallText: { ok: 'Alt ser bra ut', warn: 'Noe trenger tilsyn', crit: 'Noe er galt' }[overall], alerts,
    containers: cts, disks, ollama: ol, macOcr: mac, macMini: mini, proxmox: pve, ntfy: nt, mock: MOCK() };
}

/** Varslene på dashbordet (og i bakgrunnen). */
export function alerts51(h) {
  const out = [];
  for (const d of h.disks ?? []) {
    if (d.level === 'crit' || d.level === 'warn') out.push({ key: `disk:${d.id}`, level: d.level, title: d.trend?.text ?? `${d.name}: ${d.pctText} brukt`, text: `${d.name}: ${d.text}${d.trend?.perDayText ? ` · ${d.trend.perDayText}` : ''}` });
  }
  for (const c of h.containers?.items ?? []) {
    if (c.health === 'unhealthy') out.push({ key: `ct:${c.name}:unhealthy`, level: 'crit', title: `${c.name} er unhealthy`, text: c.status });
    else if (['exited', 'dead'].includes(c.state) && !/Exited \(0\)/.test(c.status ?? '')) out.push({ key: `ct:${c.name}:down`, level: 'warn', title: `${c.name} kjører ikke`, text: c.status });
    else if (c.state === 'restarting') out.push({ key: `ct:${c.name}:restarting`, level: 'warn', title: `${c.name} starter på nytt`, text: c.status });
    if (c.memPct != null && c.memPct >= 90) out.push({ key: `ct:${c.name}:mem`, level: 'warn', title: `${c.name} bruker ${pctText(c.memPct)} av minnegrensen`, text: c.memText });
  }
  if (h.containers && h.containers.available === false) out.push({ key: 'docker', level: 'warn', title: 'Får ikke kontakt med Docker-proxyen', text: h.containers.error ?? '' });
  if (h.ollama && !h.ollama.ok) out.push({ key: 'ollama', level: 'warn', title: 'Ollama svarer ikke', text: h.ollama.error ?? '' });
  if (h.ollama?.queued >= 5) out.push({ key: 'ollama:queue', level: 'warn', title: `${h.ollama.queued} AI-jobber i kø`, text: 'Køen i AI-gaten er lang.' });
  if (h.macOcr?.enabled && h.macOcr.configured && !h.macOcr.ok) out.push({ key: 'macocr', level: 'warn', title: 'Mac-OCR svarer ikke', text: h.macOcr.error ?? '' });
  if (h.proxmox?.configured && !h.proxmox.ok) out.push({ key: 'proxmox', level: 'warn', title: 'Proxmox-API-et svarer ikke', text: h.proxmox.error ?? '' });
  for (const n of h.proxmox?.nodes ?? []) if (n.status && n.status !== 'online') out.push({ key: `pve:${n.node}`, level: 'crit', title: `Proxmox-noden ${n.node} er ${n.status}`, text: '' });
  if (h.ntfy?.configured && !h.ntfy.ok) out.push({ key: 'ntfy', level: 'warn', title: 'ntfy svarer ikke', text: h.ntfy.error ?? '' });
  return out.sort((a, b) => (a.level === 'crit' ? 0 : 1) - (b.level === 'crit' ? 0 : 1));
}
export const _resetHealth51 = () => { ctCache = null; pveCache = null; lastSample = 0; };
