// Tailscale: tekstene klientene viser (norsk, regnet på serveren): latens eller «sist sett 3 d», tunnel, nøkkelutløp, byte,
// faktarutenettet i enhetsdetaljen, filterpillene med antall og grupperingen etter tags eller eier.
import { KIND_LABEL, KIND_ICON } from './kilde.js';

const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
const nb = (n, d = 0) => Number(n).toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\s/g, ' ');

/** «4 min», «3 t», «3 d» siden et tidspunkt. */
export function siden(iso, now = Date.now()) {
  if (!iso) return null;
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < H) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / H)} t`;
  return `${Math.round(ms / DAY)} d`;
}
/** «2 ms», «0,8 ms», «ukjent». */
export const latensTekst = (ms) => (Number.isFinite(ms) ? `${ms < 10 && ms % 1 ? nb(ms, 1) : nb(Math.round(ms))} ms` : 'ukjent');
/** «Direkte», «DERP · osl», «ukjent». */
export const tunnelTekst = (t) => (t === 'direkte' ? 'Direkte' : t?.startsWith('derp:') ? `DERP · ${t.slice(5)}` : 'ukjent');
/** «1,2 MB». */
export function byteTekst(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${nb(v)} B`;
  const u = ['kB', 'MB', 'GB', 'TB'];
  let x = v / 1024, i = 0;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${nb(x, x < 10 ? 1 : 0)} ${u[i]}`;
}
/** «om 4 dager», «i dag», «utløpt for 2 dager siden», «av». */
export function utloperTekst(days) {
  if (days == null) return 'av';
  if (days < 0) return `utløpt for ${-days} ${-days === 1 ? 'dag' : 'dager'} siden`;
  if (days === 0) return 'i dag';
  return `om ${days} ${days === 1 ? 'dag' : 'dager'}`;
}
export const prosent = (f) => (f == null ? null : `${nb(Math.round(f * 100))} %`);
export const sshKommando = (d) => `ssh root@${d.dns || d.ip || d.name}`;

/** Enheten slik klientene får den: modellen + ferdige tekster. */
export function medTekster(d, now = Date.now()) {
  const seen = siden(d.lastSeen, now);
  return {
    ...d, icon: KIND_ICON[d.kind] ?? 'monitor', kindLabel: KIND_LABEL[d.kind] ?? 'Enhet',
    latencyLabel: d.online ? latensTekst(d.latencyMs) : seen ? `sist sett ${seen}` : 'offline',
    statusLabel: d.self ? 'Denne serveren' : d.online ? 'Online' : 'Offline',
    tunnelLabel: d.online ? tunnelTekst(d.tunnel) : null, expiresLabel: utloperTekst(d.expiresInDays), ssh: sshKommando(d),
  };
}

/** Faktarutenettet i enhetsdetaljen (to kolonner på web, liste i appene). */
export function fakta(d, { traffic = null, firstSeen = null, rangeLabel = '24 t' } = {}) {
  const rows = [
    ['IPv4', d.ip], ['IPv6', d.ipv6], ['MagicDNS', d.dns], ['OS', d.os], ['Klientversjon', d.clientVersion],
    ['Tunnel', d.online ? tunnelTekst(d.tunnel) : null], ['Eier', d.user], ['Tags', d.tags?.length ? d.tags.join(', ') : null],
    ['Nøkkel utløper', utloperTekst(d.expiresInDays)], ['Exit-node', d.exitNode ? 'I bruk' : null],
    ['Trafikk', traffic ? `↓ ${byteTekst(traffic.rx)} · ↑ ${byteTekst(traffic.tx)} (${rangeLabel})` : null],
    ['Første gang sett', firstSeen ? firstSeen.slice(0, 10).split('-').reverse().join('.') : null],
  ];
  return rows.filter(([, v]) => v != null && v !== '').map(([label, value]) => ({ label, value: String(value), mono: ['IPv4', 'IPv6', 'MagicDNS', 'Klientversjon'].includes(label) }));
}

// Filterpillene: «Alle» viser ikke mobil og nettbrett (de ligger bak «Mobil»), «Offline» viser alle som er offline.
export const FILTRE = [
  { id: 'alle', navn: 'Alle', kinds: ['server', 'desktop', 'laptop', 'iot'] },
  { id: 'servere', navn: 'Servere', kinds: ['server', 'iot'] },
  { id: 'datamaskiner', navn: 'Datamaskiner', kinds: ['desktop', 'laptop'] },
  { id: 'mobil', navn: 'Mobil', kinds: ['mobile', 'tablet'] },
  { id: 'offline', navn: 'Offline', offline: true },
];
export const passerFilter = (f, d) => (f.offline ? !d.online : f.kinds.includes(d.kind));
export const filtre = (devices) => FILTRE.map((f) => ({ ...f, count: devices.filter((d) => passerFilter(f, d)).length }));

/** Grupper etter tag (første tag) eller eier: [{id, navn, ids}]; uten tag/eier havner i egen gruppe sist. */
export function grupper(devices) {
  const by = (keyOf, none) => {
    const m = new Map();
    for (const d of devices) { const k = keyOf(d) || none; (m.get(k) ?? m.set(k, []).get(k)).push(d.id); }
    return [...m].sort((a, b) => (a[0] === none) - (b[0] === none) || a[0].localeCompare(b[0], 'nb')).map(([k, ids]) => ({ id: k, navn: k, ids }));
  };
  return { tags: by((d) => d.tags?.[0], 'uten tag'), eier: by((d) => d.user, 'ukjent eier') };
}

/** Antall: total, online, offline og per type {total, online}. */
export function antall(devices) {
  const kinds = {};
  for (const k of Object.keys(KIND_ICON)) kinds[k] = { total: 0, online: 0 };
  for (const d of devices) { const k = kinds[d.kind] ?? (kinds[d.kind] = { total: 0, online: 0 }); k.total++; if (d.online) k.online++; }
  const online = devices.filter((d) => d.online).length;
  return { total: devices.length, online, offline: devices.length - online, kinds };
}
