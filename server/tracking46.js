// Prompt 46 (DATA46): Sporing – Posten/Bring og PostNord som virker, bygget på de åpne Home Assistant-integrasjonene.
//
// Portert fra (MIT-lisens, les LICENSE i hvert prosjekt):
//   - ha-parcel-integrations/ha-postnord      Copyright (c) 2026 ha-postnord contributors
//   - ha-parcel-integrations/ha-posten-bring  Copyright (c) 2026 ha-posten-bring contributors
//   «Permission is hereby granted, free of charge, to any person obtaining a copy of this software … THE SOFTWARE IS PROVIDED "AS IS",
//    WITHOUT WARRANTY OF ANY KIND.» (MIT, full tekst i prosjektene over.)
// Det som er portert: felles datamodell (contract), statuskart (status.py / parcels.py), kode 113 = ute for levering, 45/z2F = forlenget
// liggetid, retur som ender DELIVERED = levert, Posten «archived» → siste delivered/return-hendelse (ignorer added_by_user), innboks-paginering
// (remainingCount, maks 25 sider, dedup på parcelNumber), OAuth (PostNord PKCE offentlig klient; Posten-ID Basic-autentisert app-klient,
// roterende refresh-token som lagres straks), refresh én gang ved 401/403 og skillet «logg inn på nytt» / «app-nøkkelen er byttet».
//
// Sikkerhet (kontrakten): tokens lagres kryptert (AES-256-GCM, seal i finans/db.js) per bruker i kv – aldri til frontend eller logg.
// App-klient-ID-ene/secret er transportørenes egne app-verdier slik integrasjonene bruker dem; de sendes aldri til klientene.
// Ingen brukeroppgitte URL-er hentes: alle verter her er faste (account.postnord.com, api2.postnord.com, id.posten.no, login.bring.com,
// api.posten.no). Innlimt redirect-URL leses bare for code/state.
import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { db, kv } from './db.js';
import { seal, unseal } from './finans/db.js';
import { runAsUser, activeUser } from './settings.js';
import { userGuard, readJson, bad, MOCK } from './homeos-common.js';
import { upsertShipment, trk46, stagger41 } from './tracking.js';
import { detect, normNo, configured, setAccountLookup46, canonical41 } from './tracking-carriers.js';

/* ---------------- Konstanter (fra const.py i integrasjonene) ---------------- */

export const PN46 = {
  authorize: 'https://account.postnord.com/auth',
  token: 'https://account.postnord.com/oauth2/token',
  tracking: 'https://api2.postnord.com/rest/customer/v2/receiverapp/tracking',
  clientId: 'receiverappprod3gvTgY5ATtYWZZy',
  redirect: 'com.postnord.app://redirect',
  scopes: ['openid', 'offline_access', 'https://api.postnord.com/scopes/shipment/eventsorterservice/recipient', 'https://api.postnord.com/scopes/receiverapp-bff/track',
    'https://api.postnord.com/scopes/trackedshipments/track', 'https://api.postnord.com/scopes/recipientinstructions/read', 'https://api.postnord.com/scopes/eta/livetracking',
    'https://api.postnord.com/scopes/preferences/recipient'],
  // Mottakerappens gateway-nøkkel: delt app-materiale, ikke en brukerhemmelighet. Avvist etter vellykket refresh = kompatibilitetsfeil.
  apiKey: '1ecf161be47543b19fce03f953a6e8d2',
  context: 'mobileapp',
};
const BRANDS46 = {
  posten: { name: 'Posten', host: 'https://id.posten.no', clientId: 'f0ad2360e9f64a0986faafe66a9731e5', secret: 'b814595805d5859ebe1d69abd2e65b0d8f4b786478bb31b5bfeefb5dc5dc1b1be8dae22d83d4195f', redirect: 'posten://login' },
  bring: { name: 'Bring', host: 'https://login.bring.com', clientId: 'ffb3cd07a5a043a5977b7e272a06bb8f', secret: '0b00ac6b4c474c0ea087552341f10a1446592b94dada40cbbdba97aa84cfe5bb41cba49339582', redirect: 'bring://login' },
};
export const POSTEN_INBOX46 = 'https://api.posten.no/parcel-api/v1/parcel';
const INBOX_DAYS = 30, INBOX_PAGES = 25, MAX_UNAUTH_POLLS = 3, LOGIN_TTL = 15 * 60_000;
const SOURCES = ['posten', 'postnord'];
const TIMEOUT = 20_000;

let F = (u, i) => fetch(u, i);
let injected = false;
/** Bare for tester: (url, init) → Response. null = vanlig fetch. */
export const _setFetch46 = (fn) => { F = fn ?? ((u, i) => fetch(u, i)); injected = !!fn; };
const mockMode = () => MOCK && !injected;

/* ---------------- Felles datamodell (contract) ---------------- */

export const TEXT46 = { registered: 'Registrert', in_transit: 'Underveis', out_for_delivery: 'Ute for levering', at_pickup_point: 'Klar for henting', delivered: 'Levert', returning: 'Returneres', problem: 'Problem', unknown: 'Ukjent' };
// Vår interne status (tracking.js) fra contract-statusen.
const INTERNAL = { registered: 'registered', in_transit: 'in_transit', out_for_delivery: 'out_for_delivery', at_pickup_point: 'ready_for_pickup', delivered: 'delivered', returning: 'returned', problem: 'delayed', unknown: 'unknown' };
const warned = new Set();
function warnOnce(carrier, raw) {
  const k = `${carrier}:${raw}`;
  if (!raw || warned.has(k)) return;
  warned.add(k);
  console.warn(`[sporing46] ukjent status fra ${carrier}: «${String(raw).slice(0, 60)}» → Ukjent (meld fra så den kan kartlegges)`);
}
const parseIso = (v) => { if (v == null) return null; if (typeof v === 'number') return v; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
const iso = (v) => { if (v == null) return null; if (typeof v === 'number') return new Date(v).toISOString(); return String(v); };
const dims = (l, w, h) => (l == null || w == null || h == null ? null : { length: l, width: w, height: h, text: `${Math.trunc(l)} x ${Math.trunc(w)} x ${Math.trunc(h)} cm` });

// PostNord (status.py)
export const PN_STATUS46 = { CREATED: 'registered', INFORMED: 'registered', EN_ROUTE: 'in_transit', AVAILABLE_FOR_DELIVERY: 'at_pickup_point', DELIVERY: 'out_for_delivery', DELIVERED: 'delivered',
  DELIVERY_IMPOSSIBLE: 'problem', EXPECTED_DELAY: 'problem', RETURNED: 'returning', STOPPED: 'problem', DELAYED: 'problem', DELIVERY_REFUSED: 'returning' };
const PN_OUT = '113', PN_RETENTION = ['45', 'z2F'];
const pnMap = (code) => { if (!code) return 'unknown'; const m = PN_STATUS46[code]; if (m) return m; warnOnce('PostNord', code); return 'unknown'; };
const pnEvents = (raw) => (Array.isArray(raw.items) ? raw.items : []).flatMap((it) => (it && Array.isArray(it.events) ? it.events.filter((e) => e && typeof e === 'object') : []));
const newest = (events, key) => events.map((e) => ({ e, t: parseIso(e[key]) })).filter((x) => x.t != null).sort((a, b) => b.t - a.t)[0]?.e ?? null;
function pnEventStatus(e) {
  if (String(e.eventCode) === PN_OUT) return 'out_for_delivery';
  if (PN_RETENTION.includes(String(e.eventCode))) return 'at_pickup_point';
  return e.status && e.status !== 'OTHER' ? PN_STATUS46[e.status] ?? null : null;
}
function pnHistory(events) {
  const sorted = events.map((e) => ({ e, t: parseIso(e.eventTime) })).filter((x) => x.t != null).sort((a, b) => a.t - b.t);
  let prev = null;
  return sorted.map(({ e }) => { const st = pnEventStatus(e) ?? (e.status === 'OTHER' ? prev : null); prev = st ?? prev;
    return { timestamp: iso(e.eventTime), status: st, raw_status: e.eventDescription || e.eventCode || null, location: typeof e.location === 'object' ? e.location?.locationName ?? e.location?.displayName ?? null : null }; }).slice(-20);
}
const qty = (q, f) => { if (!q || typeof q !== 'object' || q.value == null) return null; const k = f[String(q.unit).toLowerCase()]; const v = parseFloat(q.value); return k != null && Number.isFinite(v) ? v * k : null; };
const firstItem = (raw) => (Array.isArray(raw.items) && raw.items[0] && typeof raw.items[0] === 'object' ? raw.items[0] : {});
function pnWeight(raw) {
  const f = { kg: 1, g: 0.001 }, it = firstItem(raw);
  for (const w of [raw.totalWeight, raw.assessedWeight, it.statedMeasurement?.weight, it.assessedMeasurement?.weight, it.weight]) { const v = qty(w, f); if (v != null) return v; }
  return null;
}
function pnDims(raw) {
  const f = { m: 100, cm: 1, mm: 0.1 }, it = firstItem(raw);
  for (const m of [it.statedMeasurement, it.dimensions]) {
    if (!m) continue;
    const [l, w, h] = ['length', 'width', 'height'].map((a) => qty(m[a], f));
    if (l != null && w != null && h != null) return dims(Math.round(l * 10) / 10, Math.round(w * 10) / 10, Math.round(h * 10) / 10);
  }
  return null;
}
function pnPickupPoint(raw, events) {
  for (const k of ['destinationDeliveryPoint', 'deliveryPoint']) if (raw[k] && typeof raw[k] === 'object' && raw[k].name) return raw[k].name;
  const w = newest(events.filter((e) => e.status === 'AVAILABLE_FOR_DELIVERY'), 'eventTime');
  return w && typeof w.location === 'object' ? w.location.locationName || null : null;
}
/** PostNord-sending (recipientview eller kontoens innboks) → contract-modellen. */
export function normalizePostnord46(raw, { account = false } = {}) {
  const barcode = String(raw.shipmentId || firstItem(raw).itemId || '') || null;
  const code = raw.status || firstItem(raw).status || null;
  let status = pnMap(code);
  const events = pnEvents(raw);
  const top = newest(events, 'eventTime');
  if (status === 'in_transit' && top && String(top.eventCode) === PN_OUT) status = 'out_for_delivery';
  if (top && PN_RETENTION.includes(String(top.eventCode)) && status !== 'delivered') status = 'at_pickup_point';
  if (status === 'returning' && top?.status === 'DELIVERED') status = 'delivered'; // returen er framme hos avsender
  const delivered = status === 'delivered';
  const st = (account ? firstItem(raw).statusText || raw.statusText : raw.statusText || firstItem(raw).statusText);
  const header = st && typeof st === 'object' ? st.header : null;
  const deliveredAt = delivered ? (events.filter((e) => e.status === 'DELIVERED').map((e) => iso(e.eventTime)).sort().pop() ?? iso(raw.deliveryDate)) : null;
  return {
    carrier: 'PostNord', barcode, sender: raw.consignor?.name || null, receiver: raw.consignee?.name || null, status, raw_status: header || code,
    delivered, delivered_at: deliveredAt, planned_from: delivered ? null : iso(raw.estimatedTimeOfArrival || (account ? raw.publicTimeOfArrival : null)) ?? null, planned_to: null,
    pickup: status === 'at_pickup_point', pickup_point: pnPickupPoint(raw, events), url: barcode ? `https://tracking.postnord.com/no/tracking?id=${encodeURIComponent(barcode)}` : null,
    weight: pnWeight(raw), dimensions: pnDims(raw), history: pnHistory(events),
    direction: raw.userData?.direction === 'OUTGOING' ? 'send' : 'receive', return_date: firstItem(raw).returnDate ?? raw.returnDate ?? null,
  };
}

// Posten/Bring-innboksen (parcels.py). Statusene er små bokstaver på ledningen.
export const POSTEN_STATUS46 = { notified: 'registered', underway: 'in_transit', collectable: 'at_pickup_point', return_underway: 'returning', return_collectable: 'returning', unknown: 'unknown' };
const DELIVERED_EV = ['delivered', 'delivered_bag_on_door'], RETURN_EV = ['return', 'delivered_sender'];
const latestOfTypes = (events, types) => newest(events.filter((e) => types.includes(String(e.type ?? '').toLowerCase())), 'date');
export function postenStatus46(rawStatus, events = []) {
  if (!rawStatus) return 'unknown';
  const s = String(rawStatus).trim().toLowerCase();
  if (s === 'archived' || s === 'archived_by_user') {
    // Ingen egen «levert»: siste avgjørende hendelse (delivered/return). added_by_user etter levering ignoreres.
    const t = String(latestOfTypes(events, [...DELIVERED_EV, ...RETURN_EV])?.type ?? '').toLowerCase();
    if (DELIVERED_EV.includes(t)) return 'delivered';
    if (RETURN_EV.includes(t)) return 'returning';
    warnOnce('Posten', 'archived uten levert/retur-hendelse');
    return 'unknown';
  }
  if (POSTEN_STATUS46[s]) return POSTEN_STATUS46[s];
  warnOnce('Posten', rawStatus);
  return 'unknown';
}
export function normalizePosten46(raw) {
  const barcode = raw.parcelNumber ? String(raw.parcelNumber) : null;
  const events = Array.isArray(raw.events) ? raw.events.filter((e) => e && typeof e === 'object') : [];
  const status = postenStatus46(raw.status, events);
  const delivered = status === 'delivered';
  const dt = raw.delivery?.deliveryTime ?? {}, win = dt.deliveryWindow ?? {};
  const [pf, pt] = delivered ? [null, null] : win.start || win.end ? [iso(win.start), iso(win.end)] : [iso(dt.date), null];
  const d = raw.dimensions ?? {};
  const pickup = status === 'at_pickup_point';
  const hist = events.map((e) => ({ e, t: parseIso(e.date) })).filter((x) => x.t != null).sort((a, b) => a.t - b.t)
    .map(({ e }) => ({ timestamp: iso(e.date), status: null, raw_status: e.description || e.type || null, type: e.type ?? null, location: e.location?.name ?? e.city ?? null })).slice(-20);
  return {
    carrier: 'Posten Bring', barcode, sender: raw.sender?.name ?? null, receiver: raw.recipient?.name ?? null, status, raw_status: raw.status ?? null, delivered,
    delivered_at: delivered ? iso(latestOfTypes(events, DELIVERED_EV)?.date) : null, planned_from: pf ?? null, planned_to: pt ?? null,
    pickup, pickup_point: pickup ? raw.pickupPoint?.name ?? null : null, url: barcode ? `https://sporing.posten.no/sporing/${encodeURIComponent(barcode)}` : null,
    weight: raw.weightInKg ?? null, dimensions: dims(d.lengthInCm, d.widthInCm, d.heightInCm), history: hist,
    direction: String(raw.direction ?? '').toLowerCase() === 'send' ? 'send' : 'receive',
  };
}

/** Contract-modellen → resultatet tracking.js lagrer (status, hendelser nyeste først, ETA, hentested). */
export function toResult46(p, via) {
  const status = INTERNAL[p.status] ?? 'unknown';
  const events = [...(p.history ?? [])].reverse().filter((h) => h.raw_status && h.type !== 'added_by_user')
    .map((h) => ({ ts: parseIso(h.timestamp) ?? Date.now(), status: String(h.raw_status).slice(0, 200), location: String(h.location ?? '').slice(0, 120) }));
  return {
    status, canonical: p.status, rawStatus: p.raw_status ?? null, statusText46: TEXT46[p.status] ?? TEXT46.unknown,
    eta: p.planned_from ?? null, etaWindow: p.planned_from ? { from: p.planned_from, to: p.planned_to ?? null } : null,
    pickupPoint: p.pickup_point ?? null, pickup: status === 'ready_for_pickup' && p.pickup_point ? { name: p.pickup_point, deadline: p.return_date ? String(p.return_date).slice(0, 10) : null } : null,
    events, sender: p.sender ?? null, weight: p.weight ?? null, dimensions: p.dimensions ?? null, via, source: via, parcel46: p,
  };
}

/* ---------------- Tokens (kryptert per bruker) ---------------- */

const ACC = 'trk46_acc', LOGIN = 'trk46_login';
const accAll = (u) => kv.get(u, ACC, {}) ?? {};
const accOf = (u, src) => accAll(u)[src] ?? null;
function setAcc(u, src, patch) {
  const all = accAll(u);
  if (patch === null) delete all[src];
  else all[src] = { ...(all[src] ?? {}), ...patch };
  kv.set(u, ACC, all);
  return all[src] ?? null;
}
const tok = (a, k) => (a?.[k] ? unseal(a[k]) || null : null);
/** Tokenene lagres med en gang de finnes (roterende refresh-token). */
function saveTokens(u, src, { access, refresh, expiresIn } = {}) {
  const patch = {};
  if (access) { patch.access = seal(access); patch.exp = Date.now() + (Number.isFinite(+expiresIn) && +expiresIn > 0 ? +expiresIn : 3600) * 1000; }
  if (refresh) patch.refresh = seal(refresh);
  setAcc(u, src, patch);
}
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ---------------- Innlogging ---------------- */

/** Leser code/state fra en innlimt redirect-URL. Tåler «Location:», anførselstegn og mellomrom. Krever riktig skjema. */
export function parseRedirect46(value, expected) {
  let t = String(value ?? '').trim().replace(/^["']|["']$/g, '');
  if (/^location:/i.test(t)) t = t.slice(9).trim().replace(/^["']|["']$/g, '');
  const qi = t.indexOf('?');
  const base = (qi < 0 ? t : t.slice(0, qi)).replace(/\/+$/, '');
  if (base.toLowerCase() !== expected.toLowerCase()) return { code: null, state: null, wrongScheme: true };
  const p = new URLSearchParams(qi < 0 ? '' : t.slice(qi + 1).split('#')[0]);
  return { code: p.get('code') || null, state: p.get('state') || null, error: p.get('error') || null };
}

const loginRate = new Map();
function rateOk(u) {
  const now = Date.now(), l = (loginRate.get(u) ?? []).filter((t) => now - t < 10 * 60_000);
  if (l.length >= 10) return false;
  l.push(now); loginRate.set(u, l); return true;
}

/** Start: lenken brukeren åpner (nettleser eller innebygd WebView). Verifier/state lagres kryptert på serveren i 15 min. */
export function startLogin46(u, src, brand = 'posten') {
  const logins = kv.get(u, LOGIN, {}) ?? {};
  if (src === 'postnord') {
    const verifier = b64u(randomBytes(64)), state = b64u(randomBytes(16));
    const challenge = b64u(createHash('sha256').update(verifier).digest());
    logins.postnord = { state, verifier: seal(verifier), at: Date.now() };
    kv.set(u, LOGIN, logins);
    const qs = new URLSearchParams({ client_id: PN46.clientId, redirect_uri: PN46.redirect, response_type: 'code', scope: PN46.scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state });
    return { source: 'postnord', authorizeUrl: `${PN46.authorize}?${qs.toString().replace(/\+/g, '%20')}`, callbackScheme: 'com.postnord.app', redirectPrefix: PN46.redirect, expiresAt: new Date(Date.now() + LOGIN_TTL).toISOString(), guide: GUIDE46('PostNord', PN46.redirect) };
  }
  const b = BRANDS46[brand] ? brand : 'posten', cfg = BRANDS46[b];
  const state = b64u(randomBytes(24));
  logins.posten = { state, brand: b, at: Date.now() };
  kv.set(u, LOGIN, logins);
  const qs = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirect, state, lang: 'no', is_app: 'true', brand: b });
  return { source: 'posten', brand: b, authorizeUrl: `${cfg.host}/api/oauth/authorizations/new?${qs}`, callbackScheme: b, redirectPrefix: cfg.redirect, expiresAt: new Date(Date.now() + LOGIN_TTL).toISOString(), guide: GUIDE46(cfg.name, cfg.redirect) };
}
const GUIDE46 = (name, redirect) => [
  `Åpne lenken og logg inn hos ${name} som vanlig.`,
  `Til slutt prøver siden å åpne ${name}-appen (${redirect}?code=…). Den adressen kan ikke åpne Homelab – det er forventet.`,
  'På datamaskin: åpne utviklerverktøyet (Network) med «Preserve log» før du åpner lenken, filtrer på «code=» og kopier adressen.',
  'Lim inn hele adressen her innen noen minutter. Koden virker bare én gang.',
  'I iPhone-/Android-appen fanges adressen automatisk i innloggingsvinduet.',
];

class AccError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind; this.status = status; } }
async function postForm(url, form, headers = {}) {
  let res, text = '';
  try {
    res = await F(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(TIMEOUT) });
    text = await res.text();
  } catch (e) { throw new AccError('Fikk ikke kontakt med innloggingen', 'network'); }
  let body = null; try { body = text ? JSON.parse(text) : {}; } catch { body = null; }
  return { status: res.status, body };
}
const basic = (b) => 'Basic ' + Buffer.from(`${BRANDS46[b].clientId}:${BRANDS46[b].secret}`).toString('base64');

/** Fullfør: innlimt eller fanget redirect-URL → tokens (kryptert) → første synk. */
export async function finishLogin46(u, src, redirectUrl) {
  const logins = kv.get(u, LOGIN, {}) ?? {};
  const pend = logins[src];
  if (!pend || Date.now() - pend.at > LOGIN_TTL) throw new AccError('Innloggingen er utløpt. Trykk «Logg inn» på nytt.', 'expired', 400);
  const expected = src === 'postnord' ? PN46.redirect : BRANDS46[pend.brand].redirect;
  const { code, state, wrongScheme, error } = parseRedirect46(redirectUrl, expected);
  if (wrongScheme) throw new AccError(`Det er ikke adressen fra denne innloggingen. Den skal starte med ${expected}?code=`, 'invalid', 400);
  if (error) throw new AccError(`Innloggingen ble avbrutt (${String(error).slice(0, 40)})`, 'invalid', 400);
  if (!code || state !== pend.state) throw new AccError('Det er ikke adressen fra denne innloggingen. Bruk lenken du fikk sist, og lim inn hele adressen med ?code=…&state=…', 'invalid', 400);
  if (mockMode()) {
    saveTokens(u, src, { access: `mock-access-${src}`, refresh: `mock-refresh-${src}`, expiresIn: 3600 });
  } else if (src === 'postnord') {
    const r = await postForm(PN46.token, { grant_type: 'authorization_code', code, redirect_uri: PN46.redirect, client_id: PN46.clientId, code_verifier: unseal(pend.verifier) });
    if (r.status >= 500) throw new AccError('PostNord-innloggingen svarer ikke akkurat nå', 'network', 502);
    if (!r.body?.access_token || !r.body?.refresh_token) throw new AccError('Koden ble avvist (utløpt eller brukt). Logg inn på nytt og lim inn den nye adressen.', 'invalid', 400);
    saveTokens(u, src, { access: r.body.access_token, refresh: r.body.refresh_token, expiresIn: r.body.expires_in });
  } else {
    const b = pend.brand, cfg = BRANDS46[b];
    const r = await postForm(`${cfg.host}/api/oauth/accesstoken`, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirect, response_type: 'code' }, { Authorization: basic(b) });
    if (r.status >= 500) throw new AccError(`${cfg.name}-innloggingen svarer ikke akkurat nå`, 'network', 502);
    if (!r.body?.access_token || !r.body?.refresh_token) throw new AccError('Koden ble avvist (utløpt eller brukt). Logg inn på nytt og lim inn den nye adressen.', 'invalid', 400);
    saveTokens(u, src, { access: r.body.access_token, refresh: r.body.refresh_token, expiresIn: r.body.expires_in });
  }
  delete logins[src];
  kv.set(u, LOGIN, logins);
  setAcc(u, src, { state: 'ok', brand: src === 'posten' ? pend.brand : undefined, connectedAt: Date.now(), error: null, unauthPolls: 0 });
  return syncAccount46(u, src).catch((e) => ({ ok: false, message: e.message }));
}

/* ---------------- Kontoklienter ---------------- */

async function getJson(url, headers) {
  let res;
  try { res = await F(url, { headers, signal: AbortSignal.timeout(TIMEOUT) }); } catch { throw new AccError('Fikk ikke kontakt', 'network'); }
  if (res.status !== 200) return { status: res.status, body: null };
  try { return { status: 200, body: JSON.parse(await res.text()) }; } catch { throw new AccError('Uventet svar (ikke JSON)', 'shape'); }
}

/** PostNord-konto: refresh én gang ved 401/403; avvist etter refresh = app-nøkkelen er byttet (ikke «logg inn på nytt»). */
async function pnRefresh(u) {
  const a = accOf(u, 'postnord'), rt = tok(a, 'refresh');
  if (!rt) throw new AccError('Må logge inn på nytt', 'reauth');
  const r = await postForm(PN46.token, { grant_type: 'refresh_token', refresh_token: rt, client_id: PN46.clientId });
  if (r.status >= 500) throw new AccError('PostNord svarer ikke akkurat nå', 'network');
  if (!r.body?.access_token) throw new AccError('Må logge inn på nytt', 'reauth');
  saveTokens(u, 'postnord', { access: r.body.access_token, refresh: r.body.refresh_token || null, expiresIn: r.body.expires_in });
  return r.body.access_token;
}
export async function postnordAccountFetch46(u) {
  const url = `${PN46.tracking}?summary=false&apikey=${PN46.apiKey}`;
  const h = (t) => ({ Authorization: `Bearer ${t}`, Accept: 'application/json', 'Accept-Language': 'en', context: PN46.context });
  let at = tok(accOf(u, 'postnord'), 'access');
  let r = at ? await getJson(url, h(at)) : { status: 401 };
  if (r.status === 401 || r.status === 403) {
    at = await pnRefresh(u);
    r = await getJson(url, h(at));
    if (r.status === 401 || r.status === 403) throw new AccError('PostNord har endret app-nøkkelen, oppdatering kreves', 'compat', r.status);
  }
  if (r.status !== 200) throw new AccError(`PostNord svarte ${r.status}`, r.status === 429 ? 'rate' : 'network', r.status);
  const b = r.body;
  if (!b || !Array.isArray(b.activeShipments) || !Array.isArray(b.archivedShipments)) throw new AccError('Uventet svar fra PostNord (mangler activeShipments/archivedShipments)', 'shape');
  return [...b.activeShipments, ...b.archivedShipments].filter((x) => x && typeof x === 'object');
}

/** Posten-ID: access-token fornyes 5 min før utløp. Nytt refresh-token lagres straks (gammelt brennes). */
async function postenToken(u, force = false) {
  const a = accOf(u, 'posten');
  const at = tok(a, 'access');
  if (!force && at && a.exp && Date.now() < a.exp - 300_000) return at;
  const rt = tok(a, 'refresh');
  if (!rt) throw new AccError('Må logge inn på nytt', 'reauth');
  const b = BRANDS46[a.brand] ? a.brand : 'posten';
  const r = await postForm(`${BRANDS46[b].host}/api/oauth/accesstoken`, { grant_type: 'refresh_token', refresh_token: rt }, { Authorization: basic(b) });
  if (r.status === 200 && r.body?.access_token) { saveTokens(u, 'posten', { access: r.body.access_token, refresh: r.body.refresh_token && r.body.refresh_token !== rt ? r.body.refresh_token : null, expiresIn: r.body.expires_in }); return r.body.access_token; }
  if ([400, 401, 403].includes(r.status) && ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(r.body?.error)) throw new AccError('Må logge inn på nytt', 'reauth', r.status);
  throw new AccError(`Posten-innloggingen svarte ${r.status}`, 'network', r.status);
}
async function postenPage(u, body, at) {
  let res;
  const send = (t) => F(POSTEN_INBOX46, { method: 'POST', headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  try { res = await send(at); } catch { throw new AccError('Fikk ikke kontakt med Posten', 'network'); }
  if (res.status === 401 || res.status === 403) {
    at = await postenToken(u, true);
    try { res = await send(at); } catch { throw new AccError('Fikk ikke kontakt med Posten', 'network'); }
    if (res.status === 401 || res.status === 403) throw new AccError(`Posten avviste innboksen (${res.status}) etter fornyet innlogging`, 'unauth', res.status);
  }
  if (res.status !== 200) throw new AccError(`Posten svarte ${res.status}`, res.status === 429 ? 'rate' : 'network', res.status);
  let d; try { d = JSON.parse(await res.text()); } catch { throw new AccError('Uventet svar fra Posten', 'shape'); }
  if (!d || typeof d !== 'object') throw new AccError('Uventet svar fra Posten', 'shape');
  return { d, at };
}
/** Innboksen: bla mens remainingCount > 0 (maks 25 sider), dedup på parcelNumber, stopp hvis siden ikke gir nye. */
export async function postenAccountFetch46(u) {
  let at = await postenToken(u);
  const since = new Date(Date.now() - INBOX_DAYS * 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const got = new Map(), exclude = [];
  for (let i = 0; i < INBOX_PAGES; i++) {
    const r = await postenPage(u, { lastUpdated: since, exclude: [...exclude] }, at);
    at = r.at;
    const page = Array.isArray(r.d.parcels) ? r.d.parcels.filter((p) => p && typeof p === 'object') : [];
    const fresh = [];
    for (const p of page) { if (typeof p.parcelNumber !== 'string') continue; if (!got.has(p.parcelNumber)) fresh.push(p.parcelNumber); got.set(p.parcelNumber, p); }
    const rem = r.d.remainingCount;
    if (!Number.isInteger(rem) || rem <= 0) break;
    if (!fresh.length) { console.warn('[sporing46] Posten-innboksen ga ingen nye pakker mens remainingCount > 0 – stopper'); break; }
    exclude.push(...fresh);
  }
  return [...got.values()];
}

/* ---------------- Synk til Sporing ---------------- */

const cache46 = new Map(); // bruker → { postnord: Map(nr → result), posten: Map }
const cacheFor = (u, src) => { if (!cache46.has(u)) cache46.set(u, {}); const c = cache46.get(u); c[src] ??= { at: 0, map: new Map() }; return c[src]; };
const SRC_NAME = { posten: 'Posten', postnord: 'PostNord' };
const hhmm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const q = (sql) => db.prepare(sql);

const MOCK_POSTEN = () => [{ parcelNumber: 'CV900000001NO', status: 'underway', direction: 'receive', sender: { name: 'Demo-butikk' }, events: [{ type: 'pre_notified', date: new Date(Date.now() - 86400_000).toISOString(), description: 'Sendingen er registrert' }] }];
const MOCK_PN = () => [{ shipmentId: '00370000000000000046', status: 'EN_ROUTE', consignor: { name: 'Demo-butikk' }, statusText: { header: 'Underveis' }, items: [{ events: [{ status: 'EN_ROUTE', eventCode: '20', eventTime: new Date(Date.now() - 3600_000).toISOString(), eventDescription: 'Ankommet terminal' }] }] }];

/** Én synk for én kilde: hent innboksen, normaliser, lagre i hl_shipments (samme hendelser/varsler som nummersporingen). */
export async function syncAccount46(u, src) {
  const a = accOf(u, src);
  if (!a || !a.refresh) return { ok: false, message: `${SRC_NAME[src]} er ikke tilkoblet` };
  try {
    const raw = mockMode() ? (src === 'posten' ? MOCK_POSTEN() : MOCK_PN()) : src === 'posten' ? await postenAccountFetch46(u) : await postnordAccountFetch46(u);
    const parcels = raw.map((p) => (src === 'posten' ? normalizePosten46(p) : normalizePostnord46(p, { account: true }))).filter((p) => p.barcode);
    const c = cacheFor(u, src);
    c.map.clear(); c.at = Date.now();
    let added = 0, active = 0;
    await runAsUser(u, async () => {
      for (const p of parcels) {
        const no = normNo(p.barcode);
        const via = `${src}-konto`;
        const res = toResult46(p, via);
        c.map.set(no, res);
        if (!p.delivered) active++;
        const exists = q('SELECT id FROM hl_shipments WHERE user_id=? AND tracking_no=?').get(u, no);
        // Gamle leverte pakker importeres ikke (som ha-…: levert vises i 7 dager).
        if (!exists && p.delivered && p.delivered_at && Date.now() - (parseIso(p.delivered_at) ?? 0) > 7 * 86400_000) continue;
        const det = detect(no);
        const carrier = src === 'postnord' ? 'postnord' : ['posten', 'bring'].includes(det) ? det : 'posten';
        let row;
        try {
          ({ shipment: row } = upsertShipment({ user: u, trackingNo: no, carrier, shop: p.sender ?? '', source: 'account', sourceNote: `Funnet i ${SRC_NAME[src]}-kontoen`, direction: p.direction === 'send' ? 'out' : 'in' }));
        } catch { continue; }
        if (!exists) added++;
        trk46.applyResult(trk46.byId(row.id), res, { api: true });
      }
    });
    setAcc(u, src, { state: 'ok', lastSync: Date.now(), count: parcels.length, active, error: null, unauthPolls: 0 });
    if (added) trk46.changed(u, 'checked', { found: added });
    return { ok: true, count: parcels.length, active, added, message: `${SRC_NAME[src]}: ${parcels.length} ${parcels.length === 1 ? 'pakke' : 'pakker'}` };
  } catch (e) {
    const kind = e.kind ?? 'network';
    const patch = { lastTry: Date.now(), error: e.message };
    if (kind === 'reauth') patch.state = 'reauth';
    else if (kind === 'compat') patch.state = 'compat';
    else if (kind === 'unauth') { patch.unauthPolls = (a.unauthPolls ?? 0) + 1; patch.state = patch.unauthPolls >= MAX_UNAUTH_POLLS ? 'reauth' : 'error'; }
    else patch.state = 'error';
    setAcc(u, src, patch);
    console.warn(`[sporing46] ${SRC_NAME[src]}-konto: ${e.message}`); // aldri token eller svarinnhold
    return { ok: false, state: patch.state, message: e.message };
  }
}

// Nummersporingen spør kontoene først (tracking-carriers.js): et nummer som finnes i en innlogget innboks bruker den statusen.
setAccountLookup46(async (carrier, no) => {
  const u = activeUser();
  if (!u) return null;
  const srcs = carrier === 'postnord' ? ['postnord'] : ['posten'];
  for (const s of srcs) { const c = cache46.get(u)?.[s]; if (c && Date.now() - c.at < 60 * 60_000 && c.map.has(no)) return c.map.get(no); }
  return null;
});

/* ---------------- Status per kilde (Innstillinger → Integrasjoner → Sporing) ---------------- */

export function sourcesOut46(u) {
  const acc = (src) => {
    const a = accOf(u, src);
    const connected = !!a?.refresh;
    const state = !connected ? 'off' : a.state ?? 'ok';
    const text = !connected ? 'Ikke tilkoblet'
      : state === 'reauth' ? 'Må logge inn på nytt'
        : state === 'compat' ? 'PostNord har endret app-nøkkelen, oppdatering kreves'
          : state === 'error' ? `Fikk ikke oppdatert${a.lastTry ? ` ${hhmm(a.lastTry)}` : ''} · prøver igjen`
            : `Tilkoblet · ${a.count ?? 0} ${(a.count ?? 0) === 1 ? 'pakke' : 'pakker'}${a.lastSync ? ` · oppdatert ${hhmm(a.lastSync)}` : ''}`;
    return { connected, state, text, count: a?.count ?? 0, active: a?.active ?? 0, lastSync: a?.lastSync ? new Date(a.lastSync).toISOString() : null, connectedAt: a?.connectedAt ? new Date(a.connectedAt).toISOString() : null,
      error: state === 'error' ? a.error ?? null : null, ...(src === 'posten' ? { brand: a?.brand ?? null } : {}) };
  };
  return {
    sources: [
      { id: 'posten', name: 'Posten / Bring', kind: 'account', login: [{ brand: 'posten', label: 'Logg inn med Posten' }, { brand: 'bring', label: 'Logg inn med Bring' }],
        ...acc('posten'), mybring: { configured: configured.posten(), optional: true, text: configured.posten() ? 'Mybring-nøkkel lagt inn (reserve)' : 'Valgfritt: Mybring-nøkkel' } },
      { id: 'postnord-number', name: 'PostNord · spor med nummer', kind: 'number', alwaysOn: true, connected: true, state: 'ok', text: 'Alltid på · ingen nøkkel' },
      { id: 'postnord', name: 'PostNord', kind: 'account', login: [{ brand: 'postnord', label: 'Logg inn med PostNord' }], ...acc('postnord') },
    ],
    statusText: TEXT46,
    webview: { postnord: { callbackScheme: 'com.postnord.app' }, posten: { callbackScheme: 'posten' }, bring: { callbackScheme: 'bring' } },
  };
}

/* ---------------- Polling (som integrasjonene) ---------------- */

const osloHour = (t = Date.now()) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
/** Hvert 15. min når en kontopakke er ute for levering eller har leveringsvindu innen 1 t, ellers hvert 45. min. Stille 00–06. */
export function accountInterval46(u, src, t = Date.now()) {
  const rows = q("SELECT status, eta FROM hl_shipments WHERE user_id=? AND via=? AND archived=0 AND status NOT IN ('delivered','returned')").all(u, `${src}-konto`);
  const hot = rows.some((r) => r.status === 'out_for_delivery' || (r.eta && /T/.test(r.eta) && Math.abs(Date.parse(r.eta) - t) <= 3600_000));
  return (hot ? 15 : 45) * 60_000;
}
export function accountDue46(u, src, t = Date.now()) {
  const a = accOf(u, src);
  if (!a?.refresh || a.state === 'reauth' || a.state === 'compat') return false;
  if (osloHour(t) < 6) return false;
  const last = Math.max(a.lastSync ?? 0, a.lastTry ?? 0);
  return !last || t >= last + accountInterval46(u, src, t) + stagger41();
}
let timer46 = null;
export function startAccounts46() {
  if (timer46 || process.env.NODE_ENV === 'test') return;
  timer46 = setInterval(async () => {
    for (const row of q(`SELECT user FROM kv WHERE key=?`).all(ACC)) {
      for (const src of SOURCES) if (accountDue46(row.user, src)) await syncAccount46(row.user, src).catch(() => {});
    }
  }, 5 * 60_000);
  timer46.unref?.();
}

/* ---------------- API (/api/tracking/…) ---------------- */

export const tracking46Api = new Hono();
tracking46Api.use('/sources46', userGuard);
tracking46Api.use('/accounts/*', userGuard);
tracking46Api.get('/sources46', (c) => c.json(sourcesOut46(c.get('user'))));
const srcOk = (s) => SOURCES.includes(s);
tracking46Api.post('/accounts/:src/start', async (c) => {
  const u = c.get('user'), src = c.req.param('src');
  if (!srcOk(src)) return bad(c, 'Ukjent kilde (posten eller postnord)', 404);
  if (!rateOk(u)) return bad(c, 'For mange forsøk. Vent litt.', 429);
  const b = await readJson(c);
  return c.json(startLogin46(u, src, b.brand));
});
tracking46Api.post('/accounts/:src/finish', async (c) => {
  const u = c.get('user'), src = c.req.param('src');
  if (!srcOk(src)) return bad(c, 'Ukjent kilde (posten eller postnord)', 404);
  if (!rateOk(u)) return bad(c, 'For mange forsøk. Vent litt.', 429);
  const b = await readJson(c);
  if (typeof b.redirectUrl !== 'string' || b.redirectUrl.length > 4000) return bad(c, 'Lim inn adressen som starter med ' + (src === 'postnord' ? PN46.redirect : 'posten://login eller bring://login'));
  try {
    const sync = await finishLogin46(u, src, b.redirectUrl);
    return c.json({ ok: true, synced: sync, ...sourcesOut46(u), message: sync?.ok ? `Tilkoblet · ${sync.count} ${sync.count === 1 ? 'pakke' : 'pakker'}` : `Tilkoblet. ${sync?.message ?? ''}`.trim() });
  } catch (e) { return c.json({ ok: false, error: e.message, code: e.kind ?? 'error' }, e.status ?? 400); }
});
tracking46Api.post('/accounts/:src/sync', async (c) => {
  const u = c.get('user'), src = c.req.param('src');
  if (!srcOk(src)) return bad(c, 'Ukjent kilde (posten eller postnord)', 404);
  const r = await syncAccount46(u, src);
  return c.json({ ...r, ...sourcesOut46(u) }, r.ok || r.state ? 200 : 400);
});
tracking46Api.delete('/accounts/:src', (c) => {
  const u = c.get('user'), src = c.req.param('src');
  if (!srcOk(src)) return bad(c, 'Ukjent kilde (posten eller postnord)', 404);
  setAcc(u, src, null);
  cache46.get(u) && delete cache46.get(u)[src];
  return c.json({ ok: true, ...sourcesOut46(u) });
});

/** Bare for tester. */
export const _t46 = { accOf, cache46, clearWarned: () => warned.clear(), canonical41 };
