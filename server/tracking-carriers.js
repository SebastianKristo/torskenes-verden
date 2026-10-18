// Transportører for Sporing: gjenkjenning av sporingsnummer, offentlige sporingslenker og API-klienter.
// Alle API-kall går fra serveren med nøklene fra Innstillinger → Integrasjoner → Sporing (sendes aldri til nettleseren).
//
// NB: endepunktene, headerne og lenkemønstrene under er satt opp etter transportørenes offentlige dokumentasjon,
// men er ikke testet mot ekte kontoer herfra. Sjekk dem med «Test tilkobling» før du stoler på dem.
import { cfg, activeUser } from './settings.js';
import { kv, OWNER } from './db.js';

// [id, navn, initialer, farge, tekstfarge, formater, sporingslenke (nummeret legges til på slutten)]
// Formatene er et utgangspunkt og må verifiseres. Rekkefølgen betyr noe: mest spesifikke først.
export const CARRIERS = [
  ['posten', 'Posten', 'P', '#E32D22', '#fff', [/^[A-Z]{2}\d{9}NO$/, /^(LP|LZ)\d{12,}$/], 'https://sporing.posten.no/sporing/'],
  ['bring', 'Bring', 'B', '#7BC144', '#0f2a05', [/^70\d{15}$/, /^3707\d{14}$/], 'https://tracking.bring.com/tracking/'],
  ['postnord', 'PostNord', 'PN', '#00A0D6', '#fff', [/^00370\d{15}$/, /^[A-Z]{2}\d{9}(SE|DK|FI)$/], 'https://www.postnord.no/pakkesporing/?shipmentId='],
  ['dhl', 'DHL', 'DHL', '#FFCC00', '#D40511', [/^JJD\d{10,}$/, /^(JVGL|GM)\w{8,}$/, /^\d{10}$/], 'https://www.dhl.com/no-no/home/sporing.html?tracking-id='],
  ['ups', 'UPS', 'UPS', '#351C15', '#FFB500', [/^1Z[0-9A-Z]{16}$/], 'https://www.ups.com/track?tracknum='],
  ['fedex', 'FedEx', 'FX', '#4D148C', '#fff', [/^\d{12}$/, /^\d{15}$/], 'https://www.fedex.com/fedextrack/?trknbr='],
  ['gls', 'GLS', 'GLS', '#172154', '#FFD100', [/^\d{11}$/], 'https://gls-group.com/NO/no/sporing-av-pakker?match='],
  ['schenker', 'DB Schenker', 'DB', '#EC0016', '#fff', [], 'https://www.dbschenker.com/app/tracking-public/?refNumber='],
  ['helthjem', 'Helthjem', 'HH', '#2E2A6B', '#fff', [/^HH\d{8,}$/], 'https://helthjem.no/sporing/'],
  ['budbee', 'Budbee', 'BB', '#2BCE96', '#05271b', [/^BB[A-Z0-9]{8,}$/], 'https://tracking.budbee.com/'],
  ['instabox', 'Instabox', 'IB', '#FF4E00', '#fff', [/^IB[A-Z0-9]{8,}$/], 'https://track.instabox.io/'],
  ['porterbuddy', 'Porterbuddy', 'PB', '#5B2D90', '#fff', [], 'https://www.porterbuddy.com/track/'],
  ['other', 'Annen (17TRACK)', '17', '#3A4252', '#eef0f4', [], 'https://t.17track.net/no#nums='],
].map(([id, name, ini, color, fg, re, url]) => ({ id, name, ini, color, fg, re, url }));
// Domenet brukes til logoen (logobiblioteket, ellers favicon via /finans/api/logo/<domene>). Listen er fra claude-code-pakke-logo.md.
export const DOMAIN = { posten: 'posten.no', bring: 'bring.no', postnord: 'postnord.no', dhl: 'dhl.com', ups: 'ups.com', fedex: 'fedex.com', gls: 'gls-group.com',
  schenker: 'dbschenker.com', helthjem: 'helthjem.no', budbee: 'budbee.com', instabox: 'instabox.io', porterbuddy: 'porterbuddy.com', other: '17track.net' };
// Logoene ligger lokalt i public/carriers (prompt 14): enkle merke-SVG-er i transportørens farger, offentlige under /assets/carriers/.
// Klientene viser initialer på merkefargen hvis bildet ikke laster.
// Prompt 22: disse har manuelt kontrollerte logoer i logobiblioteket (registry.json, kilde «manuell»). De bruker aldri
// en tegnet SVG eller et tilfeldig favicon: mangler den kontrollerte filen, viser klientene fargefyll med selskapsnavnet.
export const MANUAL_LOGOS = ['posten', 'bring', 'postnord', 'dhl', 'helthjem', 'instabox', 'budbee', 'ups', 'fedex'];
for (const c of CARRIERS) {
  c.domain = DOMAIN[c.id]; c.manual = MANUAL_LOGOS.includes(c.id);
  c.logo = c.manual ? null : `/assets/carriers/${c.id}.svg`; c.favicon = c.manual ? null : `/finans/api/logo/${DOMAIN[c.id]}`;
}
export const CARRIER = Object.fromEntries(CARRIERS.map((c) => [c.id, c]));

export const normNo = (no) => String(no ?? '').replace(/[\s-]+/g, '').toUpperCase();
export function detect(no) {
  const n = normNo(no);
  return CARRIERS.find((c) => c.id !== 'other' && c.re.some((r) => r.test(n)))?.id ?? 'other';
}
export const trackUrl = (carrier, no) => (CARRIER[carrier] ?? CARRIER.other).url + encodeURIComponent(normNo(no));

// Sporingsnumre i fritekst (e-post). Krever at teksten ligner en frakt-/ordrebekreftelse, og at nummeret
// matcher et kjent format – ellers blir ordrenumre, telefonnumre og kontonumre plukket opp som sendinger.
const SHIP_WORDS = /sporing|spor pakken|sendingsnummer|kollinummer|tracking|track(ing)? (number|id)|shipment|sendt|levering|pakke|parcel|forsendelse|hentested|delivery/i;
const CANDIDATE = /\b(?:[A-Z]{2}\d{9}[A-Z]{2}|(?:LP|LZ)\d{12,}|70\d{15}|3707\d{14}|00370\d{15}|JJD\d{10,}|JVGL\w{8,}|1Z[0-9A-Z]{16}|HH\d{8,}|BB[A-Z0-9]{8,}|IB[A-Z0-9]{8,})\b/g;
const LABELLED = /(?:sporingsnummer|sendingsnummer|kollinummer|tracking (?:number|id|no\.?)|sporings-?id)\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{7,30}[A-Z0-9])/gi;
export function findTrackingNumbers(text) {
  const t = String(text ?? '');
  if (!SHIP_WORDS.test(t)) return [];
  const out = new Set();
  for (const m of t.toUpperCase().matchAll(CANDIDATE)) out.add(m[0]);
  for (const m of t.matchAll(LABELLED)) { const n = normNo(m[1]); if (n.length >= 8 && n.length <= 30 && /\d{6,}/.test(n)) out.add(n); }
  return [...out].slice(0, 5);
}

/* ---------------- Statuser ---------------- */

// Felles statuser (kontrakten): registered → picked_up → in_transit → ready_for_pickup / out_for_delivery → delivered.
export const STATUS_TEXT = {
  registered: 'Registrert', picked_up: 'Hentet', in_transit: 'I transport', ready_for_pickup: 'Klar for henting',
  out_for_delivery: 'Ute for levering', delivered: 'Levert', delayed: 'Forsinket', returned: 'Returnert', unknown: 'Ukjent status',
};
// Sluttstatuser: statusen sjekkes ikke mer (prompt 22).
export const FINAL = ['delivered', 'returned'];
export const STEPS_IN = ['Registrert', 'Hentet', 'I transport', 'Hentested', 'Levert']; // prompt 22: «Hentested» i tidslinjen
export const STEPS_OUT = ['Registrert', 'Levert inn', 'I transport', 'Ute for levering', 'Levert'];
const STEP = { registered: 0, picked_up: 1, in_transit: 2, delayed: 2, unknown: 0, ready_for_pickup: 3, out_for_delivery: 3, delivered: 4, returned: 4 };
export const stepOf = (status) => STEP[status] ?? 0;

// Fritekst eller transportørkode → felles status. Brukes for alle transportører, så små forskjeller i ordlyd ikke betyr noe.
export function normStatus(s) {
  // Koder som DELIVERED, AvailableForPickup og EN_ROUTE gjøres om til ord («available for pickup») før mønstrene under.
  const t = String(s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
  if (/^return(ed)?$|^returned|returnert|return(ed)? to sender|retur til avsender|sendt i retur/.test(t)) return 'returned';
  if (/not delivered|ikke levert|delivery failure|attempted delivery|failed attempt|returned|retur/.test(t)) return 'delayed';
  if (/^deliver(ed)?$|^delivered|levert til mottaker|er levert|utlevert|ble levert|hentet av mottaker|er hentet|collected|picked up by (the )?(recipient|customer)|delivered/.test(t) && !/out for delivery|ute for levering|for delivery/.test(t)) return 'delivered';
  if (/ready.?for.?pickup|klar for henting|kan hentes|klar til henting|available for (pick ?up|collection)|ligger klar|awaiting.?collection|ankommet hentested|notification sent|arrived at pick ?up/.test(t)) return 'ready_for_pickup';
  if (/out.?for.?delivery|ute for levering|on.?vehicle|med sjåfør|utkjøring|transport to recipient|available for delivery/.test(t)) return 'out_for_delivery';
  if (/delay|forsink|exception|avvik/.test(t)) return 'delayed';
  if (/pre ?transit/.test(t)) return 'registered';
  if (/in.?transit|transit|underveis|på vei|en route|ankommet terminal|sortert|departed|arrived|processed|i transport/.test(t)) return 'in_transit';
  if (/picked.?up|hentet hos avsender|mottatt av|received by|levert inn|innlevert|handed in|accepted|\bsendt\b|shipped|dispatched/.test(t)) return 'picked_up';
  if (/registrert|registered|label created|info(rmation)? received|created|pre ?advice|pre ?notified|informed|forhåndsvarslet|notified/.test(t)) return 'registered';
  return 'unknown';
}

/* ---------------- API-klienter ---------------- */

const TIMEOUT = 12_000;
class CarrierError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.status === 401 || res.status === 403) throw new CarrierError(`Nøkkelen ble avvist (${res.status})`, res.status);
  if (res.status === 404) throw new CarrierError('Fant ikke sendingen (404)', 404);
  if (res.status === 429) throw new CarrierError('For mange kall (429) – prøv igjen litt senere', 429);
  if (!res.ok) throw new CarrierError(`Svarte ${res.status}`, res.status);
  return res.json();
}
const ev = (ts, status, location) => ({ ts: ts ? new Date(ts).getTime() || Date.now() : Date.now(), status: String(status ?? '').slice(0, 200), location: String(location ?? '').slice(0, 120) });

// Posten og Bring: samme Tracking API (developer.bring.com, «Tracking API»). Krever Mybring-bruker (e-post) og API-nøkkel.
// Mybring Tracking API v2: eventSet[].status → felles status (claude-code-sporing-status.md).
export const MYBRING_STATUS = {
  PRE_NOTIFIED: 'registered', IN_TRANSIT: 'in_transit', TRANSPORT_TO_RECIPIENT: 'in_transit', HANDED_IN: 'picked_up', READY_FOR_PICKUP: 'ready_for_pickup',
  DELIVERED: 'delivered', DELIVERED_SENDER: 'delivered', RETURN: 'returned', NOTIFICATION_SENT: 'ready_for_pickup', ATTEMPTED_DELIVERY: 'delayed', DEVIATION: 'delayed',
  CUSTOMS: 'in_transit', COLLECTED: 'delivered',
};
export const mybringStatus = (code, text) => MYBRING_STATUS[String(code ?? '').toUpperCase()] ?? normStatus(code ?? text);
async function bring(no) {
  const uid = cfg('mybringUid'), key = cfg('mybringKey');
  if (!uid || !key) throw new CarrierError('Mangler Mybring-bruker og API-nøkkel');
  const d = await getJson(`https://api.bring.com/tracking/api/v2/tracking.json?q=${encodeURIComponent(no)}&lang=no`, {
    headers: { 'X-Mybring-API-Uid': uid, 'X-Mybring-API-Key': key, 'X-Bring-Client-URL': 'https://github.com/SebastianKristo/torskenes-verden', Accept: 'application/json' } });
  const set = d.consignmentSet?.[0], pkg = set?.consignment?.[0]?.packageSet?.[0];
  if (set?.error || !pkg) throw new CarrierError(set?.error?.message ?? 'Fant ikke sendingen', 404);
  const events = (pkg.eventSet ?? []).map((e) => ev(e.dateIso, e.description ?? e.status, [e.city, e.country].filter(Boolean).join(', ')));
  const pickup = (pkg.eventSet ?? []).find((e) => /READY_FOR_PICKUP|NOTIFICATION_SENT/.test(e.status ?? ''));
  const top = pkg.eventSet?.[0];
  const status = mybringStatus(top?.status, top?.description);
  const unit = pickup?.unitInformation ?? {};
  const deadline = pkg.dateOfReturn ?? pkg.lastRetrievalDate ?? pickup?.lastRetrievalDate ?? null;
  return { status, eta: pkg.dateOfEstimatedDelivery ?? null, pickupPoint: unit.name ?? null,
    pickup: status === 'ready_for_pickup' && (unit.name || deadline) ? { name: unit.name ?? null, deadline: deadline ? String(deadline).slice(0, 10) : null } : null, events };
}

// PostNord Track & Trace (developer.postnord.com). API-nøkkel som query-parameter.
async function postnord(no) {
  const key = cfg('postnordKey');
  if (!key) throw new CarrierError('Mangler API-nøkkel fra PostNord');
  const d = await getJson(`https://api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json?apikey=${encodeURIComponent(key)}&id=${encodeURIComponent(no)}&locale=no`);
  const sh = d.TrackingInformationResponse?.shipments?.[0];
  if (!sh) throw new CarrierError('Fant ikke sendingen', 404);
  const items = sh.items?.[0];
  const events = (items?.events ?? []).map((e) => ev(e.eventTime, e.eventDescription, e.location?.displayName ?? e.location?.city)).reverse();
  const status = normStatus(sh.status ?? items?.status ?? events[0]?.status);
  const pp = sh.deliveryPoint?.displayName ?? sh.deliveryPoint?.name ?? null;
  return { status, eta: sh.estimatedTimeOfArrival ?? sh.deliveryDate ?? null, pickupPoint: pp,
    pickup: status === 'ready_for_pickup' && pp ? { name: pp, deadline: sh.returnDate ? String(sh.returnDate).slice(0, 10) : null } : null, events };
}

// PostNord uten nøkkel (uoffisielt): samme JSON som postnord.no/se bruker på den offentlige sporingssiden, med den
// offentlige web-nøkkelen «web-ncp». Formatet er ikke dokumentert, så svaret leses forsiktig. Feil (403/404/HTML) gir
// CarrierError, og fetchStatus går stille videre til reservene. Høyst ett oppslag per sending hver 30. minutt.
export const POSTNORD_WEB_STATUS = {
  INFORMED: 'registered', CREATED: 'registered', PRE_ADVICE: 'registered', EXPECTED: 'registered',
  EN_ROUTE: 'in_transit', IN_TRANSIT: 'in_transit', OTHER: 'in_transit',
  AVAILABLE_FOR_DELIVERY: 'ready_for_pickup', READY_FOR_PICKUP: 'ready_for_pickup', AVAILABLE_FOR_PICKUP: 'ready_for_pickup', AVAILABLE_FOR_DELIVERY_PAR_LOC: 'ready_for_pickup', NOTIFICATION_SENT: 'ready_for_pickup',
  DELIVERED: 'delivered', DELIVERED_TO_PICKUP_POINT: 'ready_for_pickup',
  RETURNED: 'returned', RETURN: 'returned', DELIVERY_IMPOSSIBLE: 'delayed', DELIVERY_REFUSED: 'delayed', STOPPED: 'delayed',
};
export const postnordWebStatus = (code, text) => POSTNORD_WEB_STATUS[String(code ?? '').toUpperCase().replace(/[\s-]+/g, '_')] ?? normStatus(code || text);
const PN_WEB_MS = 30 * 60_000;
const pnWebCache = new Map(); // nummer → { at, value }
export const _clearPostnordWebCache = () => pnWebCache.clear();
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? String(v.displayName ?? v.name ?? v.header ?? v.text ?? v.city ?? '') : String(v));
export async function postnordWeb(no) {
  const hit = pnWebCache.get(no);
  if (hit && Date.now() - hit.at < PN_WEB_MS) return hit.value;
  const res = await fetch(`https://api2.postnord.com/rest/shipment/v1/trackingweb/shipmentInformation?shipmentId=${encodeURIComponent(no)}&locale=no`, {
    headers: { 'x-bap-key': 'web-ncp', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (homelab-os)' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new CarrierError(`PostNord (nettside) svarte ${res.status}`, res.status === 404 ? 404 : res.status);
  if (!/json/i.test(res.headers.get('content-type') ?? '')) throw new CarrierError('PostNord (nettside) svarte ikke med JSON');
  let d;
  try { d = await res.json(); } catch { throw new CarrierError('PostNord (nettside): ugyldig JSON'); }
  // Kjente former: {items:[…]} eller {shipments:[{items:[…]}]} eller TrackingInformationResponse.shipments.
  const sh = d?.TrackingInformationResponse?.shipments?.[0] ?? d?.shipments?.[0] ?? d;
  const items = Array.isArray(sh?.items) ? sh.items : [];
  const rawEvents = items.flatMap((it) => (Array.isArray(it?.events) ? it.events : []));
  if (!items.length && !rawEvents.length) throw new CarrierError('PostNord (nettside) fant ikke sendingen', 404);
  const events = rawEvents.map((e) => ev(e.eventTime ?? e.timestamp, txt(e.eventDescription ?? e.description ?? e.status), txt(e.location)))
    .sort((a, b) => b.ts - a.ts);
  const code = sh.status ?? items[0]?.status ?? sh.statusText?.status ?? null;
  const head = txt(sh.statusText?.header ?? items[0]?.statusText?.header ?? sh.statusText);
  let status = postnordWebStatus(typeof code === 'string' ? code : '', head || events[0]?.status);
  if (status === 'unknown' && events[0]) status = normStatus(events[0].status);
  const pp = txt(sh.deliveryPoint ?? items[0]?.deliveryPoint) || null;
  const etaRaw = sh.estimatedTimeOfArrival ?? items[0]?.estimatedTimeOfArrival ?? sh.deliveryDate ?? null;
  const eta = etaRaw && /^\d{4}-\d{2}-\d{2}/.test(String(etaRaw)) ? String(etaRaw).slice(0, 10) : null;
  const value = { status, eta, pickupPoint: pp, pickup: status === 'ready_for_pickup' && pp ? { name: pp, deadline: null } : null, events, via: 'postnord-web', source: 'postnord-web', unofficial: true };
  pnWebCache.set(no, { at: Date.now(), value });
  return value;
}

// DHL Shipment Tracking – Unified (developer.dhl.com). Header DHL-API-Key.
async function dhl(no) {
  const key = cfg('trk_dhl_key');
  if (!key) throw new CarrierError('Mangler API-nøkkel fra DHL');
  const d = await getJson(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(no)}&language=no`, { headers: { 'DHL-API-Key': key, Accept: 'application/json' } });
  const sh = d.shipments?.[0];
  if (!sh) throw new CarrierError('Fant ikke sendingen', 404);
  const events = (sh.events ?? []).map((e) => ev(e.timestamp, e.description ?? e.status, e.location?.address?.addressLocality));
  return { status: normStatus(sh.status?.statusCode ?? sh.status?.status ?? events[0]?.status), eta: sh.estimatedTimeOfDelivery ?? null, pickupPoint: null, events };
}

// UPS Tracking API med OAuth 2 (client credentials, developer.ups.com). Tokenet caches til det utløper.
let upsToken = null;
async function upsAuth() {
  const id = cfg('trk_ups_id'), sec = cfg('trk_ups_secret');
  if (!id || !sec) throw new CarrierError('Mangler OAuth-klient (Client ID og secret) fra UPS');
  if (upsToken && upsToken.exp > Date.now() + 60_000 && upsToken.id === `${id}:${sec}`) return upsToken.token;
  const res = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!res.ok) throw new CarrierError(`UPS avviste klienten (${res.status})`, res.status);
  const d = await res.json();
  upsToken = { id: `${id}:${sec}`, token: d.access_token, exp: Date.now() + (+d.expires_in || 3600) * 1000 };
  return upsToken.token;
}
async function ups(no) {
  const token = await upsAuth();
  const d = await getJson(`https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(no)}?locale=no_NO`, {
    headers: { Authorization: `Bearer ${token}`, transId: String(Date.now()), transactionSrc: 'homelab-os', Accept: 'application/json' } });
  const pkg = d.trackResponse?.shipment?.[0]?.package?.[0];
  if (!pkg) throw new CarrierError('Fant ikke sendingen', 404);
  const events = (pkg.activity ?? []).map((a) => ev(a.date && a.time ? `${a.date.slice(0, 4)}-${a.date.slice(4, 6)}-${a.date.slice(6, 8)}T${a.time.slice(0, 2)}:${a.time.slice(2, 4)}:00` : null,
    a.status?.description, [a.location?.address?.city, a.location?.address?.country].filter(Boolean).join(', ')));
  const eta = pkg.deliveryDate?.[0]?.date; return { status: normStatus(pkg.currentStatus?.description ?? events[0]?.status), eta: eta ? `${eta.slice(0, 4)}-${eta.slice(4, 6)}-${eta.slice(6, 8)}` : null, pickupPoint: null, events };
}

// 17TRACK (api.17track.net v2.2) som reserve for FedEx, GLS, DB Schenker, Helthjem, Budbee, Instabox og ukjente.
// Nummeret må registreres før sporingsdata kan hentes; det gjør vi automatisk.
async function track17(no) {
  const key = cfg('trk_17_key');
  if (!key) throw new CarrierError('Mangler API-nøkkel fra 17TRACK (reserve for andre transportører)');
  const h = { '17token': key, 'Content-Type': 'application/json' };
  await fetch('https://api.17track.net/track/v2.2/register', { method: 'POST', headers: h, body: JSON.stringify([{ number: no }]), signal: AbortSignal.timeout(TIMEOUT) }).catch(() => {});
  const d = await getJson('https://api.17track.net/track/v2.2/gettrackinfo', { method: 'POST', headers: h, body: JSON.stringify([{ number: no }]) });
  const info = d.data?.accepted?.[0]?.track_info;
  if (!info) throw new CarrierError('17TRACK har ikke data for nummeret ennå', 404);
  const events = (info.tracking?.providers?.[0]?.events ?? []).map((e) => ev(e.time_iso ?? e.time_utc, e.description, e.location));
  return { status: normStatus(info.latest_status?.status ?? events[0]?.status), eta: info.time_metrics?.estimated_delivery_date?.to ?? null, pickupPoint: null, events };
}

// ParcelsApp (parcelsapp.com/api/v3) som siste reserve for ukjente transportører. Gratisplanen har 3 oppslag
// i måneden, så serveren teller selv og stopper før kvoten er brukt opp. Brukes bare når noen ber om status
// (ny sending eller «Oppdater»), aldri av den automatiske jobben, så kvoten ikke spises opp i bakgrunnen.
export const PARCELSAPP_LIMIT = 3;
const monthKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 7);
export function parcelsappUsage() {
  const u = kv.get(activeUser() ?? OWNER, 'parcelsapp_usage', null); // per bruker (ISO2): hver bruker har sin egen nøkkel og kvote
  return { used: u?.month === monthKey() ? u.used : 0, limit: PARCELSAPP_LIMIT, month: monthKey(), configured: !!cfg('trk_parcelsapp_key') };
}
const countParcelsapp = () => { const u = parcelsappUsage(); kv.set(activeUser() ?? OWNER, 'parcelsapp_usage', { month: u.month, used: u.used + 1 }); };
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function parcelsapp(no) {
  const key = cfg('trk_parcelsapp_key');
  if (!key) throw new CarrierError('Mangler API-nøkkel for ParcelsApp');
  if (parcelsappUsage().used >= PARCELSAPP_LIMIT) throw new CarrierError(`ParcelsApp: månedskvoten (${PARCELSAPP_LIMIT} oppslag) er brukt opp`, 429);
  const base = 'https://parcelsapp.com/api/v3/shipments/tracking';
  countParcelsapp(); // telles før kallet, så et kall som henger ikke gir gratis forsøk
  let d = await getJson(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments: [{ trackingId: no, language: 'en', country: 'Norway' }], apiKey: key }) });
  if (d.error) throw new CarrierError(`ParcelsApp: ${d.error}`);
  // Svaret kan komme med en gang (fra hurtigbuffer) eller som en uuid som må hentes til «done» er sant.
  for (let i = 0; i < 6 && !(d.done || d.shipments?.[0]?.states?.length) && d.uuid; i++) {
    await sleepMs(2000);
    d = await getJson(`${base}?uuid=${encodeURIComponent(d.uuid)}&apiKey=${encodeURIComponent(key)}`);
  }
  const sh = d.shipments?.[0];
  if (!sh) throw new CarrierError('ParcelsApp har ikke data for nummeret ennå', 404);
  const events = (sh.states ?? []).map((e) => ev(e.date, e.status, e.location));
  const eta = sh.attributes?.find?.((a) => /delivery|eta/i.test(a.l ?? ''))?.val ?? null;
  // Butikken (prompt 21): ParcelsApp kan ha «shop» direkte eller som attributt (navn eller domene).
  const shopRaw = String((typeof sh.shop === 'string' ? sh.shop : sh.shop?.name) ?? sh.attributes?.find?.((a) => /^(shop|store|seller|merchant)$/i.test(a.n ?? a.l ?? ''))?.val ?? '').trim();
  const isDom = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(shopRaw);
  return { status: normStatus(sh.status ?? events[0]?.status), eta: eta && /^\d{4}-\d{2}-\d{2}/.test(eta) ? eta.slice(0, 10) : null, pickupPoint: null, events, via: 'parcelsapp',
    ...(shopRaw ? { shop: isDom ? '' : shopRaw.slice(0, 60), shopDomain: isDom ? shopRaw.toLowerCase().replace(/^www\./, '') : (String(sh.shop?.domain ?? '').toLowerCase() || '') } : {}) };
}

const CLIENT = { posten: bring, bring, postnord, dhl, ups };
export const configured = {
  posten: () => !!(cfg('mybringUid') && cfg('mybringKey')), bring: () => !!(cfg('mybringUid') && cfg('mybringKey')),
  postnord: () => !!cfg('postnordKey'), dhl: () => !!cfg('trk_dhl_key'), ups: () => !!(cfg('trk_ups_id') && cfg('trk_ups_secret')), other: () => !!cfg('trk_17_key'),
};
export const isConfigured = (carrier) => (configured[carrier] ?? configured.other)();
// Tydelig melding når selskapets egen nøkkel mangler (vises i Sporing og under Integrasjoner → Sporing).
export function missingKeyText(carrier) {
  if (carrier === 'posten' || carrier === 'bring') return configured.posten() ? null : 'Mangler Mybring-nøkkel (mybringUid og mybringKey) under Integrasjoner → Sporing. ParcelsApp brukes som reserve.';
  if (carrier === 'postnord') return configured.postnord() ? null : 'Uten PostNord-nøkkel hentes status fra PostNords offentlige sporingsside (uoffisielt), med ParcelsApp som reserve.';
  return null;
}

// Henter status fra transportøren. Mangler egen klient eller nøkkel, prøves 17TRACK, og til slutt ParcelsApp
// (bare når allowParcelsapp er satt, dvs. når brukeren selv ber om status).
export async function fetchStatus(carrier, no, { allowParcelsapp = false } = {}) {
  const n = normNo(no);
  const own = CLIENT[carrier];
  let err = null;
  // Selskapets eget API først. Feiler det (ikke «fant ikke»), prøves reservene (prompt 22).
  if (own && isConfigured(carrier)) {
    try { return await own(n); } catch (e) { if (e.status === 404 || !(isConfigured('other') || (allowParcelsapp && cfg('trk_parcelsapp_key')))) throw e; err = e; }
  }
  // PostNord uten nøkkel: den offentlige sporingssiden (uoffisielt). Feil logges stille, og reservene prøves.
  if (carrier === 'postnord' && !isConfigured('postnord')) {
    try { return await postnordWeb(n); } catch (e) { console.debug?.(`[sporing] postnord-web: ${e.message}`); err ??= e.status === 404 ? null : e; }
  }
  if (isConfigured('other')) { try { return await track17(n); } catch (e) { err ??= e; } }
  if (allowParcelsapp && cfg('trk_parcelsapp_key') && parcelsappUsage().used < PARCELSAPP_LIMIT) return parcelsapp(n);
  if (err) throw err;
  throw new CarrierError(own ? `Mangler nøkkel for ${CARRIER[carrier]?.name ?? carrier}` : 'Ingen nøkkel for 17TRACK eller ParcelsApp (reserve)');
}

// «Test tilkobling» for Sporing-gruppen: sjekker hver transportør som har nøkkel. Et ukjent nummer gir 404,
// som betyr at nøkkelen ble godtatt.
export async function testCarriers() {
  const probes = [['posten', 'Posten/Bring', 'TESTPACKAGEATPICKUPPOINT', bring], ['postnord', 'PostNord', '00370000000000000000', postnord], ['dhl', 'DHL', '00340434292135100186', dhl],
    ['ups', 'UPS', '1Z12345E0205271688', ups], ['other', '17TRACK', 'RR123456789CN', track17]];
  const res = [];
  for (const [id, name, no, fn] of probes) {
    if (!isConfigured(id)) { res.push(`${name}: ingen nøkkel`); continue; }
    try { await fn(no); res.push(`${name}: OK`); }
    catch (e) { res.push(`${name}: ${e.status === 404 ? 'OK (nøkkelen godtatt)' : e.message}`); if (e.status && e.status !== 404) throw new Error(res.join(' · ')); }
  }
  if (cfg('trk_parcelsapp_key')) { const u = parcelsappUsage(); res.push(`ParcelsApp: nøkkel lagret (${u.used} av ${u.limit} oppslag brukt denne måneden, testes ikke for å spare kvoten)`); }
  if (!res.some((r) => /OK|ParcelsApp: nøkkel/.test(r))) throw new Error(res.join(' · ') + '. Legg inn minst én nøkkel.');
  return res.join(' · ');
}
