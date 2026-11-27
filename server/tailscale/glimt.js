// Tailscale i Glimt og i felles søk (prompt 57). Bare administratorer, bare lesing.
//   tailscale.status {sporsmal, enhet} – «hvilke maskiner er nede?», «hva er IP-en til unraid?», «hvor lenge har hytta vært
//   offline?». Svaret er en setning, strukturerte kort (enhetsbrikker, IP med Kopier, oppetidsstripe) og «Kilde: Tailscale · lest 14:52».
//   Felles søk (⌘K, /api/search51): typen «Tailnet» med enhetene fra siste henting (ingen nye kall mot Tailscale fra søket).
import { TOOLS45, TOOL45 } from '../glimt/tools.js';
import { SENTENCES46, FAIL_TEXT46 } from '../glimt/tools-weather-subs.js';
import { registerLocalPlan } from '../glimt/plan.js';
import { isAdmin } from '../auth/session.js';
import { peek } from '../cache.js';
import { dtf } from '../intl-format.js';
import { hent } from './tilstand.js';
import { medTekster, siden } from './etiketter.js';
import { stripe30, oppetid } from './statistikk.js';

const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').trim();
const hm = (t) => dtf('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
export const SPORSMAL = ['nede', 'ip', 'offline_siden', 'oversikt'];

/* ---------------- Spørsmålet ---------------- */

const TS_WORD = /(?<![\p{L}])(tailnet\w*|tailscale|maskin\w*|server\w*|enhet\w*|noder?|unraid|proxmox|hytt\w*|pi-?hole)(?![\p{L}])/iu;
const DOWN = /(?<![\p{L}])(nede|offline|frakoblet|ikke\s+online|svarer\s+ikke)(?![\p{L}])/iu;
const IP_Q = /(?<![\p{L}])ip(?:-?en|-?adressen|\s+adressen)?\s+(?:til|på|for|hos)\s+([\p{L}\p{N}._-]+)/iu;
const SINCE_Q = /hvor\s+lenge\s+har\s+([\p{L}\p{N}._-]+)\s+(?:vært\s+)?(?:offline|nede|frakoblet|borte)/iu;

/** Teksten → {sporsmal, enhet} eller null. */
export function tolk(text) {
  const t = String(text ?? '').replace(/[«»"“”?!]/g, ' ').trim();
  let m = SINCE_Q.exec(t);
  if (m) return { sporsmal: 'offline_siden', enhet: m[1] };
  m = IP_Q.exec(t);
  if (m && (TS_WORD.test(t) || /ip/i.test(t))) return { sporsmal: 'ip', enhet: m[1] };
  if (DOWN.test(t) && TS_WORD.test(t)) return { sporsmal: 'nede', enhet: '' };
  if (/(?<![\p{L}])(tailnet\w*|tailscale)(?![\p{L}])/iu.test(t)) return { sporsmal: 'oversikt', enhet: '' };
  return null;
}

/** Finner enheten fra et navn («unraid», «hytta», «100.64.0.2»): eksakt navn, vertsnavn eller IP først, så begynnelsen av navnet. */
export function finnEnhet(devices, q) {
  const f = fold(q);
  if (!f) return null;
  const exact = devices.find((d) => [d.name, d.host, d.ip, d.dns].some((x) => fold(x) === f));
  if (exact) return exact;
  const stem = f.replace(/(en|a|et|ene)$/, '');
  return devices.find((d) => [d.name, d.host].some((x) => fold(x).startsWith(f) || (stem.length >= 3 && fold(x).startsWith(stem)))) ?? null;
}

/* ---------------- Verktøyet ---------------- */

const card = (d) => ({ kind: 'tailnet.device', id: d.id, title: d.name, subtitle: `${d.ip ?? ''} · ${d.latencyLabel}`.replace(/^ · /, ''), online: d.online, ip: d.ip, icon: d.icon,
  open: { web: '/#/nettverk', deepLink: 'finanshub://tailnet' } });

export const statusTool = {
  name: 'tailscale.status', module: 'home', destructive: false, parallel: true,
  description: 'Les tailnetet (Tailscale): hvilke maskiner som er nede, IP-en til en maskin, eller hvor lenge en maskin har vært offline. Bare lesing.',
  parameters: S({ sporsmal: { type: 'string', enum: SPORSMAL, description: 'nede | ip | offline_siden | oversikt' }, enhet: { type: 'string', description: 'Maskinen brukeren spør om («unraid», «hytta»), tom for alle' } }),
  async validate(args, ctx) {
    if (!isAdmin(ctx.user)) return { error: 'Bare administratorer kan se tailnetet' };
    const fromText = tolk(ctx.text) ?? {};
    const sporsmal = SPORSMAL.includes(args?.sporsmal) ? args.sporsmal : fromText.sporsmal ?? 'oversikt';
    const enhet = String(args?.enhet ?? fromText.enhet ?? '').trim().slice(0, 80);
    if ((sporsmal === 'ip' || sporsmal === 'offline_siden') && !enhet) return { ask: { question: 'Hvilken maskin mener du?', field: 'enhet' } };
    return { args: { sporsmal, enhet } };
  },
  async run(a, ctx) {
    const now = ctx?.now ?? Date.now();
    const t = await hent(now);
    const devices = t.devices.map((d) => medTekster(d, now));
    const source = `Kilde: Tailscale · lest ${hm(Date.parse(t.updatedAt))}`;
    const base = { sporsmal: a.sporsmal, source, open: { web: '/#/nettverk', deepLink: 'finanshub://tailnet' } };
    if (a.sporsmal === 'nede') {
      const down = devices.filter((d) => !d.online && d.kind !== 'mobile' && d.kind !== 'tablet');
      return { status: 'done', result: { ...base, down: down.map((d) => ({ id: d.id, name: d.name, lastSeen: d.lastSeen, label: d.latencyLabel })), total: devices.length }, cards: down.map(card) };
    }
    if (a.sporsmal === 'oversikt') {
      const on = devices.filter((d) => d.online).length;
      return { status: 'done', result: { ...base, online: on, total: devices.length }, cards: [] };
    }
    const d = finnEnhet(devices, a.enhet);
    if (!d) return { status: 'done', result: { ...base, enhet: a.enhet, found: false } };
    if (a.sporsmal === 'ip') return { status: 'done', result: { ...base, found: true, device: { id: d.id, name: d.name, ip: d.ip, ipv6: d.ipv6, dns: d.dns } },
      cards: [{ ...card(d), kind: 'tailnet.ip', rows: [['IPv4', d.ip], ['IPv6', d.ipv6], ['MagicDNS', d.dns]].filter(([, v]) => v).map(([label, value]) => ({ label, value, copy: true })) }] };
    return { status: 'done', result: { ...base, found: true, device: { id: d.id, name: d.name, online: d.online, lastSeen: d.lastSeen, since: siden(d.lastSeen, now) }, uptime: oppetid(d.id, now) },
      cards: [{ ...card(d), kind: 'tailnet.uptime', stripe: stripe30(d.id, now).map((x) => x.state) }] };
  },
};

SENTENCES46['tailscale.status'] = (a, r) => {
  const x = r.result, src = ` ${x.source}.`;
  if (x.sporsmal === 'nede') {
    if (!x.down.length) return `Alle maskinene i tailnetet er oppe.${src}`;
    const l = x.down.slice(0, 5).map((d) => `${d.name} (${d.label})`);
    return `${x.down.length === 1 ? 'Én maskin er nede' : `${x.down.length} maskiner er nede`}: ${l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} og ${l.at(-1)}`}.${src}`;
  }
  if (x.sporsmal === 'oversikt') return `${x.online} av ${x.total} enheter er online i tailnetet.${src}`;
  if (!x.found) return `Fant ingen maskin som heter «${x.enhet}» i tailnetet.${src}`;
  if (x.sporsmal === 'ip') return x.device.ip ? `IP-en til ${x.device.name} er ${x.device.ip}${x.device.dns ? ` (${x.device.dns})` : ''}.${src}` : `${x.device.name} har ingen IPv4-adresse i tailnetet.${src}`;
  if (x.device.online) return `${x.device.name} er online nå.${src}`;
  return x.device.since ? `${x.device.name} har vært offline i ${x.device.since.replace(/ t$/, ' timer').replace(/ d$/, ' dager')}.${src}` : `${x.device.name} er offline, men jeg vet ikke hvor lenge.${src}`;
};
FAIL_TEXT46['tailscale.status'] = 'Fikk ikke lest tailnetet';

if (!TOOL45['tailscale.status']) {
  const i = TOOLS45.findIndex((x) => x.name === 'app.answer');
  TOOLS45.splice(i < 0 ? TOOLS45.length : i, 0, statusTool);
  TOOL45['tailscale.status'] = statusTool;
}

/** Lokal plan (modellen nede, og hint til planleggeren): bare for administratorer. */
export function lokalPlan(text, { user = null } = {}) {
  if (!user || !isAdmin(user)) return null;
  const q = tolk(text);
  if (!q) return null;
  return { intent: 'search', module: 'home', calls: [{ tool: 'tailscale.status', args: q }], engine: 'lokal' };
}
registerLocalPlan(lokalPlan);

/* ---------------- Felles søk (⌘K) ---------------- */

/** Enhetene som søkedokumenter (bare admin, fra siste henting i cachen). */
export function tailnetDocs(u) {
  if (!isAdmin(u)) return [];
  const t = peek('tailscale');
  return (t?.devices ?? []).map((d) => ({ type: 'tailnet', ref: d.id, title: d.name,
    body: [d.host, d.ip, d.ipv6, d.dns, d.os, d.user, ...(d.tags ?? [])].filter(Boolean).join(' '), meta: { ip: d.ip, online: d.online, kind: d.kind } }));
}
export function tailnetSig(u) {
  if (!isAdmin(u)) return '';
  const t = peek('tailscale');
  return t ? t.devices.map((d) => `${d.id}${d.online ? '+' : '-'}${d.ip ?? ''}`).join(',') : '';
}
export function tailnetResult(base, h) {
  const m = h.meta ?? {};
  return { ...base, subtitle: [m.ip, m.online ? 'online' : 'offline'].filter(Boolean).join(' · '),
    link: { web: '/#/nettverk', app: `papir://open?type=tailnet&id=${encodeURIComponent(h.ref)}`, route: 'tailnet', ref: h.ref },
    actions: [{ id: 'open', label: 'Åpne', kind: 'open' }, ...(m.ip ? [{ id: 'copy', label: 'Kopier IP', kind: 'copy', value: m.ip }] : [])] };
}
