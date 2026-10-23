// Transportører for Sporing: gjenkjenning av sporingsnummer, offentlige sporingslenker og API-klienter.
// Alle API-kall går fra serveren med nøklene fra Innstillinger → Integrasjoner → Sporing (sendes aldri til nettleseren).
//
// NB: endepunktene, headerne og lenkemønstrene under er satt opp etter transportørenes offentlige dokumentasjon,
// men er ikke testet mot ekte kontoer herfra. Sjekk dem med «Test tilkobling» før du stoler på dem.
import { cfg, activeUser } from './settings.js';
import { householdValue, quotaBlock37, _setParcelsLimit } from './tracking37.js'; // prompt 37: nøklene deles i husstanden
// Husstandens nøkkel først (prompt 37), ellers brukerens egen (eldre oppsett).
const trkCfg = (k) => householdValue(k) || cfg(k);
import { kv, OWNER } from './db.js';

// [id, navn, initialer, farge, tekstfarge, formater, sporingslenke (nummeret legges til på slutten)]
// Formatene er et utgangspunkt og må verifiseres. Rekkefølgen betyr noe: mest spesifikke først.
export const CARRIERS = [
  // Prompt 42: AliExpress/Cainiao først – LP… er AliExpress (ikke Posten), og AE…/CN…/kinesiske S10-numre (…CN).
  ['aliexpress', 'AliExpress · Cainiao', 'AE', '#E62E04', '#fff', [/^LP\d{12,}$/, /^AEG?\d{10,}$/, /^CN[A-Z0-9]{10,}$/, /^[A-Z]{2}\d{9}CN$/], 'https://global.cainiao.com/detail.htm?mailNoList='],
  ['posten', 'Posten', 'P', '#E32D22', '#fff', [/^[A-Z]{2}\d{9}NO$/, /^LZ\d{12,}$/], 'https://sporing.posten.no/sporing/'],
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
export const DOMAIN = { aliexpress: 'aliexpress.com', posten: 'posten.no', bring: 'bring.no', postnord: 'postnord.no', dhl: 'dhl.com', ups: 'ups.com', fedex: 'fedex.com', gls: 'gls-group.com',
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

/** Prompt 42: fraktselskap fra ParcelsApp/e-post → id: «POSTNORD», «PostNord AB», «postnord_no» → postnord. null = ukjent. */
export function carrierId42(name) {
  const k = String(name ?? '').toLowerCase().replace(/[_-](no|se|dk|fi)$/, '').replace(/\b(ab|as|asa|norge|norway|sverige|sweden|danmark|group|logistics)\b/g, '').replace(/[^a-z0-9]/g, '');
  const alias = { postnord: 'postnord', posten: 'posten', postennorge: 'posten', bring: 'bring', dhl: 'dhl', dhlexpress: 'dhl', helthjem: 'helthjem', instabox: 'instabox', budbee: 'budbee', ups: 'ups', fedex: 'fedex',
    gls: 'gls', dbschenker: 'schenker', schenker: 'schenker', porterbuddy: 'porterbuddy', aliexpress: 'aliexpress', cainiao: 'aliexpress', aliexpressstandardshipping: 'aliexpress' };
  return alias[k] ?? (CARRIER[k] ? k : null);
}
export const normNo = (no) => String(no ?? '').replace(/[\s-]+/g, '').toUpperCase();
export function detect(no) {
  const n = normNo(no);
  return CARRIERS.find((c) => c.id !== 'other' && c.re.some((r) => r.test(n)))?.id ?? 'other';
}
export const trackUrl = (carrier, no) => (CARRIER[carrier] ?? CARRIER.other).url + encodeURIComponent(normNo(no));

// Sporingsnumre i fritekst (e-post). Krever at teksten ligner en frakt-/ordrebekreftelse, og at nummeret
// matcher et kjent format – ellers blir ordrenumre, telefonnumre og kontonumre plukket opp som sendinger.
const SHIP_WORDS = /sporing|spor pakken|sendingsnummer|kollinummer|tracking|track(ing)? (number|id)|shipment|sendt|levering|pakke|parcel|forsendelse|hentested|delivery/i;
const CANDIDATE = /\b(?:[A-Z]{2}\d{9}[A-Z]{2}|(?:LP|LZ)\d{12,}|AEG?\d{10,}|CN[A-Z0-9]{10,}|70\d{15}|3707\d{14}|00370\d{15}|JJD\d{10,}|JVGL\w{8,}|1Z[0-9A-Z]{16}|HH\d{8,}|BB[A-Z0-9]{8,}|IB[A-Z0-9]{8,})\b/g;
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
// Prompt 46 (DATA46): ukjent råstatus logges én gang (så den kan kartlegges), aldri med sporingsnummer eller token.
const warned46 = new Set();
export function warnUnknownStatus46(carrier, raw) {
  const k = `${carrier}:${String(raw ?? '').slice(0, 60)}`;
  if (!raw || warned46.has(k)) return;
  warned46.add(k);
  console.warn(`[sporing] ukjent status fra ${carrier}: «${String(raw).slice(0, 60)}» → vises som Ukjent`);
}
/**
 * Prompt 46: Bring Tracking API v2 (og Postens offentlige sporingsside, samme format) → vårt resultat.
 * ROTÅRSAK (Bring): det ekte svaret er consignmentSet[].packageSet[] (se nordic-parcel / developer.bring.com). Den gamle koden leste
 * consignmentSet[0].consignment[0].packageSet[0], som ikke finnes – derfor ble ALLE Posten/Bring-sendinger «Fant ikke sendingen» (404)
 * selv med gyldig Mybring-nøkkel, og etter 30 dager arkivert som «levert». Begge former godtas (den gamle brukes av eldre tester).
 */
export function parseBringV2(d, via = 'mybring') {
  const set = Array.isArray(d?.consignmentSet) ? d.consignmentSet[0] : null;
  if (!set) return null; // ikke Bring-format
  if (set.error) throw new CarrierError(set.error.message ?? 'Fant ikke sendingen', 404);
  const pkgs = Array.isArray(set.packageSet) ? set.packageSet : Array.isArray(set.consignment?.[0]?.packageSet) ? set.consignment[0].packageSet : [];
  const pkg = pkgs[0];
  if (!pkg) throw new CarrierError('Fant ikke sendingen', 404);
  const evs = Array.isArray(pkg.eventSet) ? pkg.eventSet : [];
  const events = evs.map((e) => ev(e.dateIso ?? e.displayDate, e.description ?? e.status, [e.city, e.country].filter(Boolean).join(', ')));
  const pickup = evs.find((e) => /READY_FOR_PICKUP|NOTIFICATION_SENT/.test(e.status ?? ''));
  const top = evs[0];
  const status = mybringStatus(top?.status, top?.description);
  if (top?.status && !MYBRING_STATUS[String(top.status).toUpperCase()] && status === 'unknown') warnUnknownStatus46('bring', top.status);
  const unit = pickup?.unitInformation ?? {};
  const deadline = pkg.dateOfReturn ?? pkg.lastRetrievalDate ?? pickup?.lastRetrievalDate ?? null;
  const etaRaw = pkg.dateOfEstimatedDelivery ?? set.dateOfEstimatedDelivery ?? null;
  const dims = [pkg.lengthInCm, pkg.widthInCm, pkg.heightInCm].map((x) => (x == null || x === '' ? null : +x));
  return { status, canonical: canonical41(status), rawStatus: top?.status ?? null, eta: etaRaw && status !== 'delivered' ? String(etaRaw).slice(0, 10) : null, pickupPoint: unit.name ?? null,
    pickup: status === 'ready_for_pickup' && (unit.name || deadline) ? { name: unit.name ?? null, deadline: deadline ? String(deadline).slice(0, 10) : null } : null, events,
    sender: set.senderName ?? pkg.senderName ?? null, weight: pkg.weightInKgs != null ? +pkg.weightInKgs : set.totalWeightInKgs != null ? +set.totalWeightInKgs : null,
    dimensions: dims.every((x) => Number.isFinite(x)) ? { length: dims[0], width: dims[1], height: dims[2], text: `${dims.map((x) => Math.round(x)).join(' x ')} cm` } : null,
    packages: pkgs.length, via, source: via };
}
async function bring(no) {
  const uid = trkCfg('mybringUid'), key = trkCfg('mybringKey');
  if (!uid || !key) throw new CarrierError('Mangler Mybring-bruker og API-nøkkel');
  const d = await getJson(`https://api.bring.com/tracking/api/v2/tracking.json?q=${encodeURIComponent(no)}&lang=no`, {
    headers: { 'X-Mybring-API-Uid': uid, 'X-Mybring-API-Key': key, 'X-Bring-Client-URL': 'https://github.com/SebastianKristo/torskenes-verden', Accept: 'application/json' } });
  const r = parseBringV2(d, 'mybring');
  if (!r) throw new CarrierError('Bring: uventet svar', 502);
  return r;
}
// Prompt 46: Posten/Bring uten Mybring-nøkkel – Postens offentlige sporingsside (sporing.posten.no) bruker samme JSON-format som
// Tracking API v2. UOFFISIELT: kan endres uten varsel. 404/403/HTML regnes IKKE som «fant ikke» (da ville pakken blitt arkivert
// etter 30 dager), bare et eksplisitt consignmentSet[].error. Maks ett oppslag per nummer hvert 15. minutt.
export const POSTEN_WEB_URL = 'https://sporing.posten.no/tracking/api/fetch';
const postenWebCache = new Map();
export const _clearPostenWebCache = () => postenWebCache.clear();
export async function postenWeb(no) {
  const hit = postenWebCache.get(no);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.value;
  let res, body = '';
  const url = `${POSTEN_WEB_URL}?query=${encodeURIComponent(no)}&lang=no`;
  try { res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) }); body = await res.text(); }
  catch (e) { throw new CarrierError(`Posten svarer ikke akkurat nå (${e.message})`, 503); }
  pnLog42(no, { layer: 'Posten', url, status: res.status, body: body.slice(0, 300), variant: 'offentlig' });
  if (!res.ok) throw new CarrierError(`Posten (offentlig) svarte ${res.status}`, 503);
  let d; try { d = JSON.parse(body); } catch { throw new CarrierError('Posten (offentlig) svarte ikke med JSON', 503); }
  const value = parseBringV2(d, 'posten-web');
  if (!value) throw new CarrierError('Posten (offentlig): uventet svar', 503);
  value.unofficial = true;
  postenWebCache.set(no, { at: Date.now(), value });
  return value;
}

// PostNord Track & Trace (developer.postnord.com). API-nøkkel som query-parameter.
async function postnord(no) {
  const key = trkCfg('postnordKey');
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

// PostNord uten nøkkel (prompt 41, som ha-postnord): PostNords offentlige Track & Trace-endepunkt «recipientview» – det samme
// JSON-kallet som sporingssiden på postnord.no/postnord.se gjør i nettleseren, med den faste offentlige web-nøkkelen «web-ncp» i
// X-Bap-Key (ingen konto, ingen egen nøkkel). NB: endepunktet er IKKE offisielt dokumentert og kan endres uten varsel.
// Kopiert fra ha-postnord (custom_components/postnord/const.py + tracking/api.py): URL, query id + locale=en, header X-Bap-Key.
//   Tom shipments-liste = ikke skannet ennå (vanlig, ingen feil) → status unknown, notScanned:true, «Ikke skannet ennå».
//   401/403/429 = blokkert/nøkkelen trukket tilbake → vi venter dobbelt så lenge (15 → 30 → 60 min … maks 6 t) og viser «PostNord svarer ikke akkurat nå».
//   Maks ett oppslag per sending hvert 15. minutt (hurtigbuffer), aldri om leverte pakker (tracking.js), ingen bakgrunnskall 00–06 (tracking.js).
// Helsesjekk (postnordHealth41): uventet svarform (mangler TrackingInformationResponse) logges og admin varsles én gang per døgn.
export const POSTNORD_WEB_URL = 'https://api2.postnord.com/rest/shipment/v5/trackandtrace/recipientview';
export const POSTNORD_BAP_KEY = 'web-ncp';
// Maskinstatusene (shipment/items/events) → våre statuser. at_pickup_point = ready_for_pickup, returning = returned, problem = delayed.
export const POSTNORD_WEB_STATUS = {
  INFORMED: 'registered', CREATED: 'registered', PRE_ADVICE: 'registered', EXPECTED: 'registered',
  EN_ROUTE: 'in_transit', IN_TRANSIT: 'in_transit',
  DELIVERY: 'out_for_delivery',
  AVAILABLE_FOR_DELIVERY: 'ready_for_pickup', READY_FOR_PICKUP: 'ready_for_pickup', AVAILABLE_FOR_PICKUP: 'ready_for_pickup', AVAILABLE_FOR_DELIVERY_PAR_LOC: 'ready_for_pickup', NOTIFICATION_SENT: 'ready_for_pickup',
  DELIVERED: 'delivered', DELIVERED_TO_PICKUP_POINT: 'ready_for_pickup',
  RETURNED: 'returned', RETURN: 'returned', DELIVERY_REFUSED: 'returned',
  DELIVERY_IMPOSSIBLE: 'delayed', STOPPED: 'delayed', EXPECTED_DELAY: 'delayed', DELAYED: 'delayed',
};
// Felles statusnavn fra spesifikasjonen (registered · in_transit · out_for_delivery · at_pickup_point · delivered · returning · problem · unknown).
export const CANONICAL41 = { registered: 'registered', picked_up: 'in_transit', in_transit: 'in_transit', out_for_delivery: 'out_for_delivery', ready_for_pickup: 'at_pickup_point',
  delivered: 'delivered', returned: 'returning', delayed: 'problem', unknown: 'unknown' };
export const canonical41 = (s) => CANONICAL41[s] ?? 'unknown';
const PN_OUT_FOR_DELIVERY_EVENT = '113', PN_RETENTION_EVENTS = ['45', 'z2F'];
export const postnordWebStatus = (code, text) => POSTNORD_WEB_STATUS[String(code ?? '').toUpperCase().replace(/[\s-]+/g, '_')] ?? (String(code ?? '').toUpperCase() === 'OTHER' ? 'unknown' : normStatus(code || text));
export const PN_WEB_MS = 15 * 60_000;
const pnWebCache = new Map(); // nummer → { at, value }
const pnBlock = { until: 0, ms: 0 }; // backoff ved 401/403/429
const pnHealth = { ok: null, lastOkAt: null, lastErrorAt: null, lastError: null, shapeOk: true, shapeErrorAt: null, notifiedAt: 0, calls: 0, blockedUntil: null };
export const _clearPostnordWebCache = () => { pnWebCache.clear(); pnBlock.until = 0; pnBlock.ms = 0; pnVariantOk.clear(); pnFails.clear(); pnProfile46 = 'ha'; };
const pnFails = new Map(); // prompt 42: nummer → antall mislykkede PostNord-forsøk på rad (reserve etter 2)
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? String(v.displayName ?? v.locationName ?? v.name ?? v.header ?? v.text ?? v.city ?? '') : String(v));
let pnAdminNotify = null;
/** Bare for tester/oppstart: (tekst) → varsler admin. */
export const _setPostnordAdminNotify = (fn) => { pnAdminNotify = fn; };
function shapeChanged(why) {
  pnHealth.shapeOk = false; pnHealth.shapeErrorAt = Date.now();
  console.warn(`[sporing] PostNord (offentlig endepunkt): uventet svarform – ${why}`);
  if (Date.now() - pnHealth.notifiedAt > 86400_000) {
    pnHealth.notifiedAt = Date.now();
    const text = `PostNord-sporingen uten nøkkel fikk et uventet svar (${why}). Endepunktet er udokumentert og kan ha endret seg.`;
    (pnAdminNotify ? Promise.resolve(pnAdminNotify(text)) : import('./notify.js').then(({ notifyUser }) => notifyUser(OWNER, { title: 'Sporing · PostNord', body: text, category: 'pakker', tag: 'postnord-health', url: '/#/innstillinger/integrasjoner' }))).catch(() => {});
  }
}
/** Helsesjekk for det offentlige endepunktet. */
export const postnordHealth41 = () => ({ endpoint: POSTNORD_WEB_URL, unofficial: true, ...pnHealth, blockedUntil: pnBlock.until > Date.now() ? new Date(pnBlock.until).toISOString() : null,
  lastOkAt: pnHealth.lastOkAt ? new Date(pnHealth.lastOkAt).toISOString() : null, lastErrorAt: pnHealth.lastErrorAt ? new Date(pnHealth.lastErrorAt).toISOString() : null,
  shapeErrorAt: pnHealth.shapeErrorAt ? new Date(pnHealth.shapeErrorAt).toISOString() : null, text: pnBlock.until > Date.now() ? 'PostNord svarer ikke akkurat nå' : pnHealth.ok === false ? `Feil: ${pnHealth.lastError}` : 'OK · offentlig endepunkt' });
/* Prompt 42: feilsøkingslogg per PostNord-kall (URL, headere, status, 500 tegn svar, variant, lag), bare for admin (GET /api/tracking/debug/:id). */
const pnDebug = new Map(); // nummer → [kall]
export function pnLog42(no, entry) {
  const l = pnDebug.get(no) ?? [];
  l.unshift({ at: new Date().toISOString(), ...entry });
  pnDebug.set(no, l.slice(0, 30));
  if (pnDebug.size > 300) pnDebug.delete(pnDebug.keys().next().value);
}
export const pnDebugOf42 = (no) => pnDebug.get(normNo(no)) ?? [];
export const PN_HEADERS42 = { 'x-bap-key': POSTNORD_BAP_KEY, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Origin: 'https://www.postnord.no', Referer: 'https://www.postnord.no/' };
// Prompt 46 (DATA46) – ROTÅRSAK (PostNord), fra koden (ikke verifisert mot ekte svar herfra – utgående nett er stengt i byggemiljøet):
//  1) Med en lagret (gammel/ugyldig) postnordKey gikk alt til findByIdentifier.json → 401/403 → feilen ble kastet, og recipientview ble aldri prøvd.
//  2) Prompt 42 sendte seg ut som Safari (User-Agent + Origin/Referer postnord.no) fra Node. Bot-vern hos PostNord kan svare 403/«Access denied»
//     på en «nettleser» uten nettleserens TLS-fingeravtrykk, og én 403 satte en FELLES backoff for alle PostNord-oppslag (30 min → … 6 t).
// ha-postnord (MIT), som er bekreftet mot ekte svar, sender bare X-Bap-Key. Nå: samme headere som ha-postnord først; avvises de, prøves
// nettleser-headerne én gang før backoff, og profilen som virket huskes. Backoff er maks 1 t. Avvist nøkkel → recipientview (fetchStatus).
export const PN_HEADERS_HA46 = { 'x-bap-key': POSTNORD_BAP_KEY, Accept: 'application/json' };
const PN_PROFILES46 = { ha: PN_HEADERS_HA46, browser: PN_HEADERS42 };
let pnProfile46 = 'ha';
export const pnProfile46Of = () => pnProfile46;
const PN_BLOCK_MAX46 = 3600_000;
const pnVariantOk = new Map(); // nummer → varianten som virket sist
/** Nummervarianter i rekkefølge: slik det står (locale en, som ha-postnord) → locale no → uten ledende 00 (SSCC 20 → 18 sifre) → som itemId → som shipmentId. */
export function pnVariants42(no) {
  const v = [{ label: 'slik det står · en', id: no, locale: 'en' }, { label: 'slik det står · no', id: no, locale: 'no' }];
  if (/^00\d{18}$/.test(no)) v.push({ label: 'uten 00 · en', id: no.slice(2), locale: 'en' });
  v.push({ label: 'itemId · en', id: no, locale: 'en', param: 'itemId' }, { label: 'shipmentId · en', id: no, locale: 'en', param: 'shipmentId' });
  const ok = pnVariantOk.get(no);
  return ok ? [v.find((x) => x.label === ok), ...v.filter((x) => x.label !== ok)].filter(Boolean) : v;
}
const pnUrl = (v) => `${POSTNORD_WEB_URL}?${v.param ?? 'id'}=${encodeURIComponent(v.id)}&locale=${v.locale}`;
export async function postnordWeb(no) {
  const hit = pnWebCache.get(no);
  if (hit && Date.now() - hit.at < PN_WEB_MS) return hit.value;
  if (pnBlock.until > Date.now()) { pnLog42(no, { layer: 'backend', error: 'venter (backoff etter 403/429)', variant: null }); throw new CarrierError('PostNord svarer ikke akkurat nå', 429); }
  let empty = null, notFound = false;
  for (const v of pnVariants42(no)) {
    const url = pnUrl(v);
    let res, body = '';
    // Prompt 46: headerprofilen som virket sist først (standard ha-postnord), den andre bare ved 401/403.
    for (const prof of [pnProfile46, pnProfile46 === 'ha' ? 'browser' : 'ha']) {
      pnHealth.calls++;
      const headers = PN_PROFILES46[prof], t0 = Date.now();
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
        body = await res.text();
      } catch (e) {
        pnHealth.ok = false; pnHealth.lastError = e.message; pnHealth.lastErrorAt = Date.now();
        pnLog42(no, { layer: 'PostNord', url, headers: { ...headers }, status: null, body: null, variant: v.label, profile: prof, ms: Date.now() - t0, error: e.message });
        throw new CarrierError(`PostNord svarer ikke akkurat nå (${e.message})`, 503);
      }
      pnLog42(no, { layer: 'PostNord', url, headers: { ...headers }, status: res.status, body: body.slice(0, 500), variant: v.label, profile: prof, ms: Date.now() - t0 });
      if (![401, 403].includes(res.status)) { pnProfile46 = prof; break; }
    }
    if ([401, 403, 429].includes(res.status)) {
      pnBlock.ms = Math.min(PN_BLOCK_MAX46, pnBlock.ms ? pnBlock.ms * 2 : PN_WEB_MS); pnBlock.until = Date.now() + pnBlock.ms;
      pnHealth.ok = false; pnHealth.lastError = `HTTP ${res.status}`; pnHealth.lastErrorAt = Date.now();
      console.warn(`[sporing] PostNord (offentlig) svarte ${res.status} med begge headerprofiler – venter ${Math.round(pnBlock.ms / 60_000)} min`);
      throw new CarrierError('PostNord svarer ikke akkurat nå', res.status);
    }
    if (res.status === 404) { notFound = true; continue; }
    if (!res.ok) { pnHealth.ok = false; pnHealth.lastError = `HTTP ${res.status}`; pnHealth.lastErrorAt = Date.now(); throw new CarrierError('PostNord svarer ikke akkurat nå', res.status >= 500 ? 503 : res.status); }
    let d;
    try { d = JSON.parse(body); } catch { pnHealth.ok = false; pnHealth.lastError = 'ikke JSON'; pnHealth.lastErrorAt = Date.now(); shapeChanged('ikke JSON'); throw new CarrierError('PostNord (offentlig) svarte ikke med JSON'); }
    pnBlock.ms = 0;
    if (!d || typeof d !== 'object') { shapeChanged('ikke et JSON-objekt'); throw new CarrierError('PostNord (offentlig): uventet svar'); }
    const env = d.TrackingInformationResponse;
    if (!env && !Array.isArray(d.shipments) && !Array.isArray(d.items)) shapeChanged('mangler TrackingInformationResponse');
    else pnHealth.shapeOk = true;
    pnHealth.ok = true; pnHealth.lastOkAt = Date.now();
    const list = env ? env.shipments : d.shipments;
    if (env && (!Array.isArray(list) || !list.length)) {
      // Ikke skannet ennå (eller ukjent nummer): vanlig tilstand, ingen feil. Prøv neste variant først.
      empty = { status: 'unknown', canonical: 'unknown', notScanned: true, statusText: 'Ikke skannet ennå', rawStatus: null, eta: null, pickupPoint: null, pickup: null, events: [], via: 'postnord-web', source: 'postnord-web', unofficial: true, variant: v.label };
      continue;
    }
    const value = pnParse(d, list);
    if (!value) { notFound = true; continue; }
    value.variant = v.label;
    pnVariantOk.set(no, v.label);
    pnWebCache.set(no, { at: Date.now(), value });
    return value;
  }
  if (empty) { pnWebCache.set(no, { at: Date.now(), value: empty }); return empty; }
  throw new CarrierError(notFound ? 'Fant ikke nummeret hos PostNord' : 'PostNord (offentlig) fant ikke sendingen', 404);
}
function pnParse(d, list) {
  const sh = list?.[0] ?? d;
  const items = Array.isArray(sh?.items) ? sh.items : [];
  const rawEvents = items.flatMap((it) => (Array.isArray(it?.events) ? it.events : []));
  if (!items.length && !rawEvents.length && !sh.status) return null;
  const dated = rawEvents.map((e) => ({ e, t: Date.parse(e.eventTime ?? e.timestamp ?? '') || 0 })).sort((a, b) => b.t - a.t);
  const events = dated.map(({ e }) => ev(e.eventTime ?? e.timestamp, txt(e.eventDescription ?? e.description ?? e.status), txt(e.location)));
  const code = sh.status ?? items[0]?.status ?? sh.statusText?.status ?? null;
  const head = txt(sh.statusText?.header ?? items[0]?.statusText?.header ?? sh.statusText);
  let status = postnordWebStatus(typeof code === 'string' ? code : '', head || events[0]?.status);
  const newest = dated[0]?.e;
  if (status === 'in_transit' && String(newest?.eventCode) === PN_OUT_FOR_DELIVERY_EVENT) status = 'out_for_delivery'; // kode 113 = «delivery in progress»
  if (newest && PN_RETENTION_EVENTS.includes(String(newest.eventCode))) status = 'ready_for_pickup'; // forlenget hentefrist
  if (status === 'returned' && newest?.status === 'DELIVERED') status = 'delivered'; // returen er framme hos avsender
  if (status === 'unknown' && typeof code === 'string' && code && code.toUpperCase() !== 'OTHER') warnUnknownStatus46('postnord', code);
  if (status === 'unknown' && events[0]) status = normStatus(events[0].status);
  const dpObj = [sh.destinationDeliveryPoint, sh.deliveryPoint, items[0]?.deliveryPoint].find((x) => x && typeof x === 'object' && (x.name || x.displayName));
  const waiting = dated.find(({ e }) => e.status === 'AVAILABLE_FOR_DELIVERY')?.e;
  const pp = (dpObj ? txt(dpObj) : null) || (waiting ? txt(waiting.location) : null) || (typeof sh.deliveryPoint === 'string' ? sh.deliveryPoint : null);
  const addr = dpObj?.address ? [dpObj.address.street1 ?? dpObj.address.street, [dpObj.address.postCode, dpObj.address.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null;
  const etaRaw = sh.estimatedTimeOfArrival ?? items[0]?.estimatedTimeOfArrival ?? sh.deliveryDate ?? null;
  const eta = status !== 'delivered' && etaRaw && /^\d{4}-\d{2}-\d{2}/.test(String(etaRaw)) ? String(etaRaw).slice(0, 10) : null;
  const deadlineRaw = sh.returnDate ?? items[0]?.returnDate ?? dpObj?.lastPickupDate ?? null;
  const deadline = deadlineRaw && /^\d{4}-\d{2}-\d{2}/.test(String(deadlineRaw)) ? String(deadlineRaw).slice(0, 10) : null;
  return { status, canonical: canonical41(status), rawStatus: head || (typeof code === 'string' ? code : null), eta, etaWindow: etaRaw ? { from: String(etaRaw), to: sh.estimatedTimeOfArrivalTo ?? null } : null,
    pickupPoint: pp || null, pickup: status === 'ready_for_pickup' && pp ? { name: pp, deadline, ...(addr ? { address: addr } : {}) } : null, events, via: 'postnord-web', source: 'postnord-web', unofficial: true };
}

// DHL Shipment Tracking – Unified (developer.dhl.com). Header DHL-API-Key.
async function dhl(no) {
  const key = trkCfg('trk_dhl_key');
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
  const id = trkCfg('trk_ups_id'), sec = trkCfg('trk_ups_secret');
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
  const key = trkCfg('trk_17_key');
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
_setParcelsLimit(() => PARCELSAPP_LIMIT);
const monthKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' }).slice(0, 7);
export function parcelsappUsage() {
  const u = kv.get(activeUser() ?? OWNER, 'parcelsapp_usage', null); // per bruker (ISO2): hver bruker har sin egen nøkkel og kvote
  return { used: u?.month === monthKey() ? u.used : 0, limit: PARCELSAPP_LIMIT, month: monthKey(), configured: !!trkCfg('trk_parcelsapp_key') };
}
const countParcelsapp = () => { const u = parcelsappUsage(); kv.set(activeUser() ?? OWNER, 'parcelsapp_usage', { month: u.month, used: u.used + 1 }); };
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
// carrier-hint (prompt 26): transportøren brukeren har valgt eller som er gjenkjent, som ParcelsApp-navn.
const PARCELSAPP_CARRIER = { posten: 'Posten Norge', bring: 'Bring', postnord: 'PostNord', dhl: 'DHL', ups: 'UPS', fedex: 'FedEx', gls: 'GLS', schenker: 'DB Schenker', helthjem: 'Helthjem', budbee: 'Budbee', instabox: 'Instabox', porterbuddy: 'Porterbuddy' };
async function parcelsapp(no, hint = null) {
  const key = trkCfg('trk_parcelsapp_key');
  if (!key) throw new CarrierError('Mangler API-nøkkel for ParcelsApp');
  if (parcelsappUsage().used >= PARCELSAPP_LIMIT) throw new CarrierError(`ParcelsApp: månedskvoten (${PARCELSAPP_LIMIT} oppslag) er brukt opp`, 429);
  { const blk = quotaBlock37(PARCELSAPP_LIMIT); if (blk) throw new CarrierError(blk, 429); } // prompt 37: felles kvote, maks 50 % per bruker
  const base = 'https://parcelsapp.com/api/v3/shipments/tracking';
  countParcelsapp(); // telles før kallet, så et kall som henger ikke gir gratis forsøk
  let d = await getJson(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments: [{ trackingId: no, language: 'en', country: 'Norway', ...(PARCELSAPP_CARRIER[hint] ? { carrier: PARCELSAPP_CARRIER[hint] } : {}) }], apiKey: key }) });
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

// Prompt 42: AliExpress / Cainiao – offentlig sporing uten innlogging (som HA_aliexpress_package_tracker_sensor), fra serveren, cache 30 min.
export const CAINIAO_URL = 'https://global.cainiao.com/global/detail.json';
const cnCache = new Map();
export const _clearCainiaoCache = () => cnCache.clear();
/** Cainiao-/AliExpress-tekst → våre 5 steg. */
export function cainiaoStatus42(text) {
  const t = String(text ?? '').toLowerCase();
  if (/delivered|signed|levert/.test(t) && !/out for delivery|undelivered/.test(t)) return 'delivered';
  if (/pickup point|ready for (collection|pickup)|arrived at (the )?pick|klar for henting|awaiting collection/.test(t)) return 'ready_for_pickup';
  if (/out for delivery/.test(t)) return 'out_for_delivery';
  if (/export|customs|in transit|departed|arrived at destination|destination country|import|transit|hub|sorting|linehaul|flight/.test(t)) return 'in_transit';
  if (/accepted by carrier|picked up|received by|departed warehouse|left the warehouse|collected/.test(t)) return 'picked_up';
  if (/order placed|waiting for pickup|seller shipped|shipping label|created|pre-advice|awaiting/.test(t)) return 'registered';
  return 'unknown';
}
const LOCAL_NO = /\b([A-Z]{2}\d{9}NO|00370\d{15}|70\d{15}|3707\d{14}|[A-Z]{2}\d{9}(?:SE|DK|FI))\b/;
async function cainiao(no) {
  const hit = cnCache.get(no);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const d = await getJson(`${CAINIAO_URL}?mailNos=${encodeURIComponent(no)}&lang=en-US&language=en-US`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (homelab-os)' } });
  const m = Array.isArray(d?.module) ? d.module[0] : d?.data?.[0] ?? null;
  if (!m) throw new CarrierError('Cainiao har ikke data for nummeret ennå', 404);
  const list = m.detailList ?? m.details ?? m.section2?.detailList ?? [];
  const events = list.map((e) => ev(e.time ?? e.timeStr ?? e.eventTime, e.standerdDesc ?? e.desc ?? e.description, e.group?.nodeDesc ?? e.location ?? ''));
  if (!events.length && !m.statusDesc && !m.status) throw new CarrierError('Cainiao har ikke data for nummeret ennå', 404);
  const local = list.map((e) => `${e.desc ?? ''} ${e.standerdDesc ?? ''}`.match(LOCAL_NO)?.[1]).find(Boolean) ?? m.destCpInfo?.mailNo ?? null;
  const localNo = local && normNo(local) !== no ? normNo(local) : null;
  const value = { status: cainiaoStatus42(m.statusDesc ?? m.status ?? events[0]?.status), rawStatus: m.statusDesc ?? null, eta: m.globalEtaInfo?.deliveryMinTime ? String(m.globalEtaInfo.deliveryMinTime).slice(0, 10) : null,
    pickupPoint: null, events, via: 'cainiao', source: 'cainiao', ...(localNo ? { localNo, localCarrier: detect(localNo) } : {}) };
  cnCache.set(no, { at: Date.now(), value });
  return value;
}

const CLIENT = { posten: bring, bring, postnord, dhl, ups, aliexpress: cainiao };
export const configured = {
  posten: () => !!(trkCfg('mybringUid') && trkCfg('mybringKey')), bring: () => !!(trkCfg('mybringUid') && trkCfg('mybringKey')),
  aliexpress: () => true, // prompt 42: Cainiao krever ingen nøkkel
  postnord: () => !!trkCfg('postnordKey'), dhl: () => !!trkCfg('trk_dhl_key'), ups: () => !!(trkCfg('trk_ups_id') && trkCfg('trk_ups_secret')), other: () => !!trkCfg('trk_17_key'),
};
export const isConfigured = (carrier) => (configured[carrier] ?? configured.other)();
// Tydelig melding når selskapets egen nøkkel mangler (vises i Sporing og under Integrasjoner → Sporing).
export function missingKeyText(carrier) {
  // Prompt 46: uten Mybring-nøkkel brukes Posten-kontoen (hvis innlogget) og Postens offentlige sporingsside.
  if (carrier === 'posten' || carrier === 'bring') return configured.posten() ? null : 'Uten Mybring-nøkkel hentes status fra Posten-kontoen din (hvis innlogget) eller Postens offentlige sporingsside (uoffisielt), med ParcelsApp som reserve.';
  if (carrier === 'postnord') return configured.postnord() ? null : 'Uten PostNord-nøkkel hentes status fra PostNords offentlige sporingsside (uoffisielt), med ParcelsApp som reserve.';
  return null;
}

// Prompt 46: kontoene (tracking46.js) kan svare for et nummer de allerede har i innboksen: (carrier, nummer) → resultat | null.
let accountLookup46 = null;
export const setAccountLookup46 = (fn) => { accountLookup46 = fn; };
const NORDIC46 = ['posten', 'bring', 'postnord'];
const sibling46 = (c) => (c === 'postnord' ? 'posten' : 'postnord');
/** Prompt 46: SSCC-numre (18–20 sifre) sier ikke hvem som frakter (prefikset er avsenderens). Ett nøkkelfritt oppslag hos den andre. */
async function siblingTry46(carrier, n) {
  const sib = sibling46(carrier);
  try {
    const r = sib === 'postnord' ? await postnordWeb(n) : configured.posten() ? await bring(n).catch(() => postenWeb(n)) : await postenWeb(n);
    if (r && !r.notScanned) return { ...r, carrierFound: sib };
  } catch { /* ingen treff hos den andre heller */ }
  return null;
}

// Henter status fra transportøren. Mangler egen klient eller nøkkel, prøves 17TRACK, og til slutt ParcelsApp
// (bare når allowParcelsapp er satt, dvs. når brukeren selv ber om status).
// override (prompt 26): transportøren brukeren har valgt. «parcelsapp» går rett til ParcelsApp med hint (gjenkjent transportør);
// et selskap med egen klient (Posten/Bring, PostNord, DHL, UPS) bruker sitt API først, ellers reservene med selskapet som hint.
export async function fetchStatus(carrier, no, opts = {}) {
  const n = normNo(no);
  if (opts.override || !NORDIC46.includes(carrier) || !/^\d{18,20}$/.test(n)) return fetchStatus0(carrier, no, opts);
  let r;
  try { r = await fetchStatus0(carrier, no, opts); } catch (e) {
    if (e.status !== 404) throw e;
    const s = await siblingTry46(carrier, n);
    if (s) return s;
    throw e;
  }
  if (r?.notScanned) { const s = await siblingTry46(carrier, n); if (s) return s; }
  return r;
}
async function fetchStatus0(carrier, no, { allowParcelsapp: allow0 = false, override = null, hint = null } = {}) {
  let allowParcelsapp = allow0;
  const n = normNo(no);
  if (override === 'parcelsapp') {
    if (!trkCfg('trk_parcelsapp_key')) throw new CarrierError('Mangler API-nøkkel for ParcelsApp');
    return parcelsapp(n, hint ?? carrier);
  }
  if (override && override !== carrier) carrier = override;
  // Prompt 46: innlogget konto (Posten/Bring eller PostNord) som allerede kjenner nummeret.
  if (accountLookup46 && NORDIC46.includes(carrier)) { try { const a = await accountLookup46(carrier, n); if (a) return a; } catch { /* nummeret spores videre under */ } }
  const own = CLIENT[carrier];
  let err = null, err404 = null, keyRejected = false;
  // Selskapets eget API først. Feiler det (ikke «fant ikke»), prøves reservene (prompt 22).
  if (own && isConfigured(carrier)) {
    try { return await own(n); } catch (e) {
      // Prompt 46: avvist PostNord-/Mybring-nøkkel (401/403) skal ikke stoppe sporingen – de nøkkelfrie kildene prøves.
      keyRejected = [401, 403].includes(e.status) && NORDIC46.includes(carrier);
      if (!keyRejected && (e.status === 404 || !(isConfigured('other') || (allowParcelsapp && trkCfg('trk_parcelsapp_key'))))) throw e;
      err = e;
      if (keyRejected) console.warn(`[sporing] ${CARRIER[carrier]?.name ?? carrier}: nøkkelen ble avvist (${e.status}) – bruker offentlig sporing`);
    }
  }
  // Prompt 46: Posten/Bring uten (gyldig) Mybring-nøkkel: Postens offentlige sporingsside.
  if ((carrier === 'posten' || carrier === 'bring') && (!isConfigured(carrier) || keyRejected)) {
    try { return await postenWeb(n); } catch (e) {
      console.debug?.(`[sporing] posten-web: ${e.message}`);
      if (e.status === 404) err404 = e;
      else err ??= new CarrierError(`Fikk ikke status fra Postens offentlige sporing (${e.message}). Logg inn med Posten-kontoen eller legg inn Mybring-nøkkel under Integrasjoner → Sporing.`, e.status);
    }
  }
  // PostNord uten nøkkel: den offentlige sporingssiden (uoffisielt). Feil logges stille, og reservene prøves.
  if (carrier === 'postnord' && (!isConfigured('postnord') || keyRejected)) {
    try { const r = await postnordWeb(n); pnFails.delete(n); return r; } catch (e) {
      console.debug?.(`[sporing] postnord-web: ${e.message}`); if (e.status === 404) err404 = e; else if (!keyRejected) err ??= e; else err = e;
      // Prompt 42: etter 2 mislykkede PostNord-forsøk prøves ParcelsApp (nøkkel/kvote) og 17TRACK automatisk, også i bakgrunnen.
      const nf = (pnFails.get(n) ?? 0) + 1; pnFails.set(n, nf);
      if (nf >= 2) allowParcelsapp = true;
    }
  }
  if (allowParcelsapp && carrier === 'postnord' && trkCfg('trk_parcelsapp_key') && parcelsappUsage().used < PARCELSAPP_LIMIT) {
    try { return { ...(await parcelsapp(n, 'postnord')), viaLabel: 'via ParcelsApp' }; } catch (e) { err ??= e; }
  }
  if (isConfigured('other')) { try { const r = await track17(n); return carrier === 'postnord' ? { ...r, via: r.via ?? '17track', viaLabel: 'via 17TRACK' } : r; } catch (e) { err ??= e; } }
  if (allowParcelsapp && trkCfg('trk_parcelsapp_key') && parcelsappUsage().used < PARCELSAPP_LIMIT) return parcelsapp(n, override ? carrier : hint ?? carrier);
  if (err404) throw err404;
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
  if (trkCfg('trk_parcelsapp_key')) { const u = parcelsappUsage(); res.push(`ParcelsApp: nøkkel lagret (${u.used} av ${u.limit} oppslag brukt denne måneden, testes ikke for å spare kvoten)`); }
  if (!res.some((r) => /OK|ParcelsApp: nøkkel/.test(r))) throw new Error(res.join(' · ') + '. Legg inn minst én nøkkel.');
  return res.join(' · ');
}
