// Transportører for Sporing: gjenkjenning av sporingsnummer, offentlige sporingslenker og API-klienter.
// Alle API-kall går fra serveren med nøklene fra Innstillinger → Integrasjoner → Sporing (sendes aldri til nettleseren).
//
// NB: endepunktene, headerne og lenkemønstrene under er satt opp etter transportørenes offentlige dokumentasjon,
// men er ikke testet mot ekte kontoer herfra. Sjekk dem med «Test tilkobling» før du stoler på dem.
import { cfg } from './settings.js';

// [id, navn, initialer, farge, tekstfarge, formater, sporingslenke (nummeret legges til på slutten)]
// Formatene er et utgangspunkt og må verifiseres. Rekkefølgen betyr noe: mest spesifikke først.
export const CARRIERS = [
  ['posten', 'Posten', 'P', '#E32D22', '#fff', [/^[A-Z]{2}\d{9}NO$/, /^(LP|LZ)\d{12,}$/], 'https://sporing.posten.no/sporing/'],
  ['bring', 'Bring', 'B', '#7BC144', '#0f2a05', [/^70\d{15}$/, /^3707\d{14}$/], 'https://tracking.bring.com/tracking/'],
  ['postnord', 'PostNord', 'PN', '#00A0D6', '#fff', [/^00370\d{15}$/, /^[A-Z]{2}\d{9}(SE|DK|FI)$/], 'https://www.postnord.no/sporing?shipmentId='],
  ['dhl', 'DHL', 'DHL', '#FFCC00', '#D40511', [/^JJD\d{10,}$/, /^(JVGL|GM)\w{8,}$/, /^\d{10}$/], 'https://www.dhl.com/no-no/home/sporing.html?tracking-id='],
  ['ups', 'UPS', 'UPS', '#351C15', '#FFB500', [/^1Z[0-9A-Z]{16}$/], 'https://www.ups.com/track?tracknum='],
  ['fedex', 'FedEx', 'FX', '#4D148C', '#fff', [/^\d{12}$/, /^\d{15}$/], 'https://www.fedex.com/fedextrack/?trknbr='],
  ['gls', 'GLS', 'GLS', '#172154', '#FFD100', [/^\d{11}$/], 'https://gls-group.com/NO/no/sporing-av-pakker?match='],
  ['schenker', 'DB Schenker', 'DB', '#EC0016', '#fff', [], 'https://www.dbschenker.com/app/tracking-public/?refNumber='],
  ['helthjem', 'Helthjem', 'HH', '#2E2A6B', '#fff', [/^HH\d{8,}$/], 'https://helthjem.no/sporing/'],
  ['budbee', 'Budbee', 'BB', '#2BCE96', '#05271b', [/^BB[A-Z0-9]{8,}$/], 'https://tracking.budbee.com/'],
  ['instabox', 'Instabox', 'IB', '#FF4E00', '#fff', [/^IB[A-Z0-9]{8,}$/], 'https://track.instabox.io/'],
  ['other', 'Annen (17TRACK)', '17', '#3A4252', '#eef0f4', [], 'https://t.17track.net/no#nums='],
].map(([id, name, ini, color, fg, re, url]) => ({ id, name, ini, color, fg, re, url }));
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
  out_for_delivery: 'Ute for levering', delivered: 'Levert', delayed: 'Forsinket', unknown: 'Ukjent status',
};
export const STEPS_IN = ['Registrert', 'Hentet', 'I transport', 'Klar for henting', 'Levert'];
export const STEPS_OUT = ['Registrert', 'Levert inn', 'I transport', 'Ute for levering', 'Levert'];
const STEP = { registered: 0, picked_up: 1, in_transit: 2, delayed: 2, unknown: 0, ready_for_pickup: 3, out_for_delivery: 3, delivered: 4 };
export const stepOf = (status) => STEP[status] ?? 0;

// Fritekst eller transportørkode → felles status. Brukes for alle transportører, så små forskjeller i ordlyd ikke betyr noe.
export function normStatus(s) {
  const t = String(s ?? '').toLowerCase();
  if (/deliver(ed)?_?$|^delivered|levert til mottaker|er levert|utlevert|hentet av mottaker|picked up by (the )?(recipient|customer)|delivered/.test(t) && !/out for delivery|ute for levering|not delivered|ikke levert/.test(t)) return 'delivered';
  if (/ready.?for.?pickup|klar for henting|kan hentes|available for pickup|ligger klar|awaiting.?collection|ankommet hentested/.test(t)) return 'ready_for_pickup';
  if (/out.?for.?delivery|ute for levering|on.?vehicle|med sjåfør|utkjøring/.test(t)) return 'out_for_delivery';
  if (/delay|forsink|exception|avvik/.test(t)) return 'delayed';
  if (/in.?transit|transit|underveis|på vei|ankommet terminal|sortert|departed|arrived|processed|i transport/.test(t)) return 'in_transit';
  if (/picked.?up|hentet hos avsender|mottatt av|received by|levert inn|innlevert|accepted|pre.?transit/.test(t)) return 'picked_up';
  if (/registrert|registered|label created|information received|created|pre-advice|forhåndsvarslet|notified/.test(t)) return 'registered';
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
async function bring(no) {
  const uid = cfg('trk_bring_uid'), key = cfg('trk_bring_key');
  if (!uid || !key) throw new CarrierError('Mangler Mybring-bruker og API-nøkkel');
  const d = await getJson(`https://api.bring.com/tracking/api/v2/tracking.json?q=${encodeURIComponent(no)}&lang=no`, {
    headers: { 'X-Mybring-API-Uid': uid, 'X-Mybring-API-Key': key, 'X-Bring-Client-URL': 'https://github.com/SebastianKristo/torskenes-verden', Accept: 'application/json' } });
  const set = d.consignmentSet?.[0], pkg = set?.consignment?.[0]?.packageSet?.[0];
  if (set?.error || !pkg) throw new CarrierError(set?.error?.message ?? 'Fant ikke sendingen', 404);
  const events = (pkg.eventSet ?? []).map((e) => ev(e.dateIso, e.description ?? e.status, [e.city, e.country].filter(Boolean).join(', ')));
  const pickup = (pkg.eventSet ?? []).find((e) => /READY_FOR_PICKUP/.test(e.status ?? ''));
  return { status: normStatus(pkg.eventSet?.[0]?.status ?? events[0]?.status), eta: pkg.dateOfEstimatedDelivery ?? null, pickupPoint: pickup?.unitInformation?.name ?? null, events };
}

// PostNord Track & Trace (developer.postnord.com). API-nøkkel som query-parameter.
async function postnord(no) {
  const key = cfg('trk_postnord_key');
  if (!key) throw new CarrierError('Mangler API-nøkkel fra PostNord');
  const d = await getJson(`https://api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json?apikey=${encodeURIComponent(key)}&id=${encodeURIComponent(no)}&locale=no`);
  const sh = d.TrackingInformationResponse?.shipments?.[0];
  if (!sh) throw new CarrierError('Fant ikke sendingen', 404);
  const items = sh.items?.[0];
  const events = (items?.events ?? []).map((e) => ev(e.eventTime, e.eventDescription, e.location?.displayName ?? e.location?.city)).reverse();
  return { status: normStatus(sh.status ?? items?.status ?? events[0]?.status), eta: sh.estimatedTimeOfArrival ?? sh.deliveryDate ?? null,
    pickupPoint: sh.deliveryPoint?.displayName ?? sh.deliveryPoint?.name ?? null, events };
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
  if (upsToken && upsToken.exp > Date.now() + 60_000 && upsToken.id === id) return upsToken.token;
  const res = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!res.ok) throw new CarrierError(`UPS avviste klienten (${res.status})`, res.status);
  const d = await res.json();
  upsToken = { id, token: d.access_token, exp: Date.now() + (+d.expires_in || 3600) * 1000 };
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

const CLIENT = { posten: bring, bring, postnord, dhl, ups };
export const configured = {
  posten: () => !!(cfg('trk_bring_uid') && cfg('trk_bring_key')), bring: () => !!(cfg('trk_bring_uid') && cfg('trk_bring_key')),
  postnord: () => !!cfg('trk_postnord_key'), dhl: () => !!cfg('trk_dhl_key'), ups: () => !!(cfg('trk_ups_id') && cfg('trk_ups_secret')), other: () => !!cfg('trk_17_key'),
};
export const isConfigured = (carrier) => (configured[carrier] ?? configured.other)();

// Henter status fra transportøren. Mangler egen klient eller nøkkel, prøves 17TRACK.
export async function fetchStatus(carrier, no) {
  const n = normNo(no);
  const own = CLIENT[carrier];
  if (own && isConfigured(carrier)) return own(n);
  if (isConfigured('other')) return track17(n);
  throw new CarrierError(own ? `Mangler nøkkel for ${CARRIER[carrier]?.name ?? carrier}` : 'Ingen nøkkel for 17TRACK (reserve)');
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
  if (!res.some((r) => /OK/.test(r))) throw new Error(res.join(' · ') + '. Legg inn minst én nøkkel.');
  return res.join(' · ');
}
