// Sporing: pakker på vei fra Finn-handler, e-post (Proton Mail via Bridge) og manuelt innlagte sporingsnumre.
// - Tabellene hl_shipments og hl_shipment_events (én rad per sporingsnummer; duplikater slås sammen).
// - Status hentes fra transportøren (se tracking-carriers.js) straks pakken er funnet, deretter hvert 30. minutt for
//   aktive pakker og hver 6. time når den har stått som «Registrert» i mer enn 3 dager (prompt 22). Levert og
//   Returnert sjekkes ikke mer. Gamle e-postpakker som er levert (eller ikke funnet etter 30 dager) går rett i Arkiv.
// - Nye sporingsnumre i e-post og Finn plukkes opp av samme jobb, og varsler («notices») lages etter brukerens valg.
// - Per bruker (ISO2): hver sending har user_id, og sporingsnummeret er unikt per bruker. Kilder, varsler, varselvalg,
//   transportørnøkler (cfg i brukerens kontekst) og e-postskanning er brukerens egne. Sanntid sendes bare til eieren.
//   Ekte push er ikke bygget: appene og nettsiden viser varslene lokalt når de henter /api/tracking.
import { Hono } from 'hono';
import { db, kv, OWNER } from './db.js';
import { runAsUser } from './settings.js';
import { config } from './config.js'; // prompt 41: fast forskyvning per installasjon
import { sessionUser } from './auth.js';
import { userGuard, readJson, bad, str, MOCK, aiJson } from './homeos-common.js';
import * as mailMod from './finans/mail.js';
import { scanShippingMails, mailConfig, mailText } from './finans/mail.js';
import { stageOf } from './finans/finn-routes.js';
import { CARRIERS, CARRIER, detect, normNo, trackUrl, findTrackingNumbers, normStatus, STATUS_TEXT, STEPS_IN, STEPS_OUT, stepOf, fetchStatus, isConfigured, testCarriers, parcelsappUsage, FINAL, missingKeyText, canonical41 } from './tracking-carriers.js';
import { broadcast } from './realtime.js';
import { matchMerchant, itemForDomain, filePath as logoFile, isManual } from './logos/match.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hl_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_no TEXT NOT NULL,
  user_id TEXT,
  carrier TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',      -- finn | email | manual
  source_ref TEXT,                            -- Finn-handel-ID eller Message-ID
  source_note TEXT NOT NULL DEFAULT '',       -- «Funnet i e-post fra Komplett.no, 13.10»
  direction TEXT NOT NULL DEFAULT 'in',       -- in | out
  status TEXT NOT NULL DEFAULT 'registered',
  eta TEXT,
  pickup_point TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  checked_at INTEGER,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, tracking_no)
);
CREATE TABLE IF NOT EXISTS hl_shipment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES hl_shipments(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  status TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  raw TEXT,
  UNIQUE(shipment_id, ts, status)
);
CREATE INDEX IF NOT EXISTS hl_shipment_events_s ON hl_shipment_events(shipment_id, ts);
`);
// Prompt 21: butikkens domene (fra e-postavsender, Finn eller ParcelsApp) til logoen. Idempotent.
if (!db.prepare('PRAGMA table_info(hl_shipments)').all().some((c) => c.name === 'shop_domain')) db.exec("ALTER TABLE hl_shipments ADD COLUMN shop_domain TEXT NOT NULL DEFAULT ''");
// Prompt 22: datoen på e-posten (gamle e-poster går rett i Arkiv), siste vellykkede oppslag og frist på hentestedet. Idempotent.
// Prompt 26: carrier_override = transportøren brukeren har valgt (null = automatisk gjenkjent, som i carrier).
// Prompt 41: raw_status = transportørens egen statustekst (PostNord statusText.header), not_scanned = «Ikke skannet ennå».
for (const [col, type] of [['source_date', 'INTEGER'], ['ok_at', 'INTEGER'], ['pickup_deadline', 'TEXT'], ['carrier_override', 'TEXT'], ['raw_status', 'TEXT'], ['not_scanned', 'INTEGER']]) {
  if (!db.prepare('PRAGMA table_info(hl_shipments)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE hl_shipments ADD COLUMN ${col} ${type}`);
}

// ISO2: user_id på sendingene. Eksisterende sendinger tilhører OWNER. Den gamle tabellen hadde UNIQUE(tracking_no);
// den bygges om (rad for rad, samme id-er, så hendelsene beholdes) til UNIQUE(user_id, tracking_no). Idempotent.
{
  const cols = () => db.prepare('PRAGMA table_info(hl_shipments)').all().map((c) => c.name);
  if (!cols().includes('user_id')) db.exec('ALTER TABLE hl_shipments ADD COLUMN user_id TEXT');
  db.prepare('UPDATE hl_shipments SET user_id=? WHERE user_id IS NULL').run(OWNER);
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hl_shipments'").get().sql;
  if (/tracking_no\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql)) {
    const next = sql.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?"?hl_shipments"?/i, 'CREATE TABLE hl_shipments_iso2')
      .replace(/tracking_no\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i, 'tracking_no TEXT NOT NULL').replace(/\)\s*$/, ',\n  UNIQUE(user_id, tracking_no)\n)');
    const list = cols().map((c) => `"${c}"`).join(',');
    const before = { s: db.prepare('SELECT COUNT(*) n FROM hl_shipments').get().n, e: db.prepare('SELECT COUNT(*) n FROM hl_shipment_events').get().n };
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS hl_shipments_iso2');
        db.exec(next);
        db.exec(`INSERT INTO hl_shipments_iso2(${list}) SELECT ${list} FROM hl_shipments`);
        if (db.prepare('SELECT COUNT(*) n FROM hl_shipments_iso2').get().n !== before.s) throw new Error('Sporing: kopien har ikke like mange rader');
        db.exec('DROP TABLE hl_shipments');
        db.exec('ALTER TABLE hl_shipments_iso2 RENAME TO hl_shipments');
        if (db.prepare('SELECT COUNT(*) n FROM hl_shipment_events').get().n !== before.e) throw new Error('Sporing: hendelsene ble endret');
      })();
    } finally { db.pragma('foreign_keys = ON'); }
  }
  db.exec('CREATE INDEX IF NOT EXISTS hl_shipments_user ON hl_shipments(user_id, archived, updated_at)');
}

const q = (sql) => db.prepare(sql);
const now = () => Date.now();

/* ---------------- Overstyrt transportør (prompt 26) ---------------- */
// Valgene i appene: Posten, Bring, PostNord, DHL, Helthjem, UPS, Budbee, Instabox og ParcelsApp. null = Auto (gjenkjent).
export const OVERRIDES = ['posten', 'bring', 'postnord', 'dhl', 'helthjem', 'ups', 'budbee', 'instabox', 'parcelsapp'];
const PARCELSAPP = { id: 'parcelsapp', name: 'ParcelsApp' };
/** Transportøren som brukes: overstyringen først (ParcelsApp er en tjeneste, ikke et selskap: da vises den gjenkjente). */
const carrierOf = (r) => (r.carrier_override && r.carrier_override !== 'parcelsapp' && CARRIER[r.carrier_override] ? r.carrier_override : r.carrier);
const overrideName = (o) => (o === 'parcelsapp' ? PARCELSAPP.name : CARRIER[o]?.name ?? o);
/** {carrierDetected, carrierOverride, carrierLabel} – «Bring · valgt» eller «Auto · Bring». */
export function carrierInfo(r) {
  const o = OVERRIDES.includes(r.carrier_override) ? r.carrier_override : null;
  const det = r.carrier;
  return { carrierDetected: det, carrierDetectedName: (CARRIER[det] ?? CARRIER.other).name, carrierOverride: o,
    carrierLabel: o ? `${overrideName(o)} · valgt` : `Auto · ${(CARRIER[det] ?? CARRIER.other).name}` };
}
/** Gyldig verdi for carrierOverride: id, null (auto) eller undefined (ugyldig). «auto» og tom streng = null. */
const overrideVal = (v) => (v === null || v === '' || v === 'auto' ? null : typeof v === 'string' && OVERRIDES.includes(v.toLowerCase()) ? v.toLowerCase() : undefined);
const ACTIVE = ['registered', 'picked_up', 'in_transit', 'ready_for_pickup', 'out_for_delivery', 'delayed', 'unknown'];
const DAY_MS = 86400_000;
// Hvor ofte statusen sjekkes. null = aldri mer (Levert/Returnert).
// Prompt 41 (dynamisk polling som ha-postnord, for alle transportører): hvert 15. min når pakken er ute for levering (fra 1 t før
// forventet levering, eller uten forventet tid), ellers hvert 45. min; «Registrert» > 3 dager hver 6. time. Ingen bakgrunnskall 00–06
// (bare én runde rett etter midnatt), se checkUser. En fast liten forskyvning per installasjon (0–6 min) legges på i nextCheckAt.
export const HOT_MS = 15 * 60_000, MID_MS = 45 * 60_000;
export function checkInterval(r, t = Date.now()) {
  if (FINAL.includes(r.status)) return null;
  if (r.status === 'registered' && t - (r.created_at ?? t) > 3 * DAY_MS) return 6 * 3600_000;
  if (r.status === 'out_for_delivery') {
    const eta = r.eta && /^\d{4}-\d{2}-\d{2}T/.test(r.eta) ? Date.parse(r.eta) : null;
    if (!eta || t >= eta - 3600_000) return HOT_MS;
  }
  return MID_MS;
}
/** Fast forskyvning per installasjon (0–6 min), så ikke alle spør transportørene samtidig. */
export const stagger41 = () => { const s = String(config.dataDir ?? ''); let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 7) * 60_000; };
export function nextCheckAt(r, t = Date.now()) {
  const iv = checkInterval(r, t);
  if (iv == null || r.archived) return null;
  return r.checked_at ? r.checked_at + iv + stagger41() : t;
}
const osloHour41 = (t = now()) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const osloDay41 = (t = now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
/** Stille vindu 00–06: false bortsett fra én runde etter midnatt (ankeret). Kl. 06 går det som vanlig igjen. */
export function pollAllowed41(u, t = now()) {
  if (osloHour41(t) >= 6) return true;
  const day = osloDay41(t);
  if (kv.get(u, 'trk41_anchor', null) === day) return false;
  kv.set(u, 'trk41_anchor', day);
  return true;
}
const PREF_DEFAULT = { found: true, out: true, pickup: true, delivered: true, delayed: false };
// Varselvalgene er per bruker (prompt 14, ISO2: ingen arv fra hovedadmin).
const prefs = (uid) => ({ ...PREF_DEFAULT, ...kv.get(uid, 'trk_prefs', {}) });
// Kildene (e-post, Finn) per bruker (ISO2). autoArchive: leverte pakker arkiveres etter 3 dager.
const sources = (u) => ({ finn: { on: true, lastCheck: null }, email: { on: true, lastCheck: null }, autoArchive: { on: false }, ...kv.get(u, 'trk_sources', {}) });
const uidOf = (c) => c.get('user') ?? sessionUser(c);
const setSource = (u, k, patch) => { const s = sources(u); s[k] = { ...s[k], ...patch }; kv.set(u, 'trk_sources', s); };

/* ---------------- Varsler ---------------- */

// Varsler lagres som en kort liste (de 30 siste). Klientene viser dem lokalt (web Notification, lokalt varsel i appene).
function notify(u, kind, text, shipmentId) {
  // Alle varsler lagres; hver bruker ser bare de typene de har slått på (listOut).
  const key = { found: 'found', out_for_delivery: 'out', ready_for_pickup: 'pickup', delivered: 'delivered', delayed: 'delayed' }[kind];
  if (!key) return;
  const list = kv.get(u, 'trk_notices', []);
  list.unshift({ id: `${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: now(), kind: key, text, shipmentId });
  kv.set(u, 'trk_notices', list.slice(0, 30));
}

/* ---------------- Logo og tittel (prompt 21) ---------------- */

const POSTAL_DOMAIN = /(^|\.)(posten|bring|postnord|dhl|ups|fedex|gls-group|dbschenker|helthjem|budbee|instabox|porterbuddy|17track)\.[a-z.]+$/i;
/** Domene fra en e-postadresse eller URL, uten underdomener som mail./e./info. («ordre@mail.komplett.no» → «komplett.no»). */
export function domainOf(v) {
  let d = String(v ?? '').trim().toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return '';
  const parts = d.split('.');
  // Behold to ledd (komplett.no), eller tre for co.uk/com.au o.l.
  const keep = /^(co|com|org|net)$/.test(parts[parts.length - 2]) && parts.length > 2 ? 3 : 2;
  d = parts.slice(-keep).join('.');
  return POSTAL_DOMAIN.test(d) ? '' : d;
}
/** Butikkens domene fra navn eller lagret domene, via logobiblioteket. */
function shopDomainFor(shop, stored) {
  if (stored) return stored;
  if (!shop) return '';
  if (/^finn$/i.test(shop)) return 'finn.no';
  return matchMerchant(shop)?.domene ?? '';
}
const ini = (name) => (String(name ?? '').trim().match(/[A-Za-zÆØÅæøå0-9]/)?.[0] ?? '?').toUpperCase();
const fileUrl = (id) => `/finans/api/logos/file/${id}`;
/** Én logo: registeroppføring med fil først, så favicon for domenet, ellers bokstav. */
function logoOf({ name, domain, color }) {
  const it = (domain && itemForDomain(domain)) || (name && matchMerchant(name)) || null;
  const id = it?.id ?? null, dom = domain || it?.domene || null;
  const has = !!(id && logoFile(id));
  // Manuelt kontrollert logo (prompt 22): uten den kontrollerte filen gis ingen URL (aldri favicon), bare farge og navn.
  const manual = !!(id && isManual(id));
  return { id: has || manual ? id : null, domain: dom, name: it?.navn ?? name ?? null, url: has ? fileUrl(id) : dom && !manual ? `/finans/api/logo/${dom}` : null, letter: ini(it?.navn ?? name),
    color: it?.farge ?? color ?? '#3A4252', hasFile: has, ...(manual ? { manual: true, label: it?.navn ?? name ?? null } : {}) };
}
/**
 * Logoen på pakkekortet: 1) butikken, 2) fraktselskapet når butikken er ukjent, 3) bokstav med selskapets farge.
 * Når butikken vises, ligger fraktselskapet i carrierLogo (liten merkelapp).
 */
export function packageLogo(r) {
  const c = CARRIER[r.carrier] ?? CARRIER.other;
  const base = logoOf({ name: c.id === 'other' ? null : c.name, domain: c.id === 'other' ? null : c.domain, color: c.color });
  const carrier = { ...base, letter: c.ini, color: c.color, fg: c.fg, label: c.name, svg: c.manual ? (base.hasFile ? base.url : null) : c.logo };
  const sd = shopDomainFor(r.shop, r.shop_domain);
  const shop = r.shop || sd ? logoOf({ name: r.shop || null, domain: sd || null }) : null;
  if (shop && (shop.hasFile || shop.domain)) return { kind: 'shop', ...shop, carrierLogo: carrier };
  if (c.id !== 'other') return { kind: 'carrier', ...carrier, carrierLogo: null };
  return { kind: 'letter', id: null, domain: null, name: r.shop || null, url: null, letter: ini(r.shop || r.name || 'P'), color: c.color, hasFile: false, carrierLogo: null };
}
/** Tittel: varenavn eller butikk, ellers «Pakke fra Bring». Aldri sporingsnummeret. */
export function packageTitle(r) {
  const c = CARRIER[r.carrier] ?? CARRIER.other;
  const no = normNo(r.tracking_no);
  const name = String(r.name ?? '').trim();
  // Eldre klienter lagret «Bring · 0750» (fraktselskap + del av sporingsnummeret) som navn; det regnes som tomt.
  if (name && name !== `${c.name} · ${no.slice(-4)}`) return name;
  if (r.shop) return r.shop;
  return c.id === 'other' ? 'Pakke' : `Pakke fra ${c.name}`;
}

/* ---------------- Lagring ---------------- */

// Hendelser vi har laget selv (ikke fra transportøren). De vises i listen, men ikke som «siste hendelse».
const LOCAL_EVENT = /^(Lagt til i Sporing|Funnet i e-post|Funnet i Finn-handel)$|· Oppdatert fra (Finn-handelen|e-post)$|^Ikke funnet hos transportøren|^Spores (nå )?via /;
const hhmm = (t) => new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
const ddmm = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return `${p.day}.${p.month}`; };
/** Siste hendelse fra transportøren: {text, place, time, line} – «Ankommet terminal · Oslo · 18.10 06:12». */
function lastEventOf(events) {
  const e = events.find((x) => x.raw === 'api' || (x.raw == null && !LOCAL_EVENT.test(x.status)));
  if (!e) return null;
  const place = e.location || null;
  return { text: e.status, place, time: new Date(e.ts).toISOString(), line: [e.status, place, `${ddmm(e.ts)} ${hhmm(e.ts)}`].filter(Boolean).join(' · ') };
}
/** Tidslinjen: ett steg per etappe, faktisk status markert, med tidspunkt fra hendelsene (siste steg: siste hendelse). */
function timelineOf(r, labels, step, events) {
  const first = new Map();
  for (const e of [...events].reverse()) { const st = LOCAL_EVENT.test(e.status) ? (e.status.startsWith('Lagt til') || e.status.startsWith('Funnet') ? 'registered' : null) : normStatus(e.status); if (!st || st === 'unknown') continue; const i = stepOf(st); if (!first.has(i)) first.set(i, e.ts); }
  const keys = r.direction === 'out' ? ['registered', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] : ['registered', 'picked_up', 'in_transit', r.status === 'out_for_delivery' ? 'out_for_delivery' : 'ready_for_pickup', r.status === 'returned' ? 'returned' : 'delivered'];
  return labels.map((label, i) => {
    const ts = i === step ? (events.find((e) => !LOCAL_EVENT.test(e.status))?.ts ?? first.get(i) ?? null) : first.get(i) ?? null;
    return { key: keys[i], label, done: i <= step, current: i === step, time: i <= step && ts ? new Date(ts).toISOString() : null, timeText: i <= step && ts ? `${ddmm(ts)} ${hhmm(ts)}` : null };
  });
}

function view(r0) {
  const r = { ...r0, carrier: carrierOf(r0) }; // logo, lenke og navn følger valgt transportør
  const c = CARRIER[r.carrier] ?? CARRIER.other;
  const events = q('SELECT ts, status, location, raw FROM hl_shipment_events WHERE shipment_id=? ORDER BY ts DESC, id DESC LIMIT 40').all(r.id);
  const out = r.direction === 'out';
  const late = !!r.eta && /^\d{4}-\d{2}-\d{2}/.test(r.eta) && r.eta.slice(0, 10) < new Date().toLocaleDateString('sv-SE') && !['delivered', 'ready_for_pickup'].includes(r.status);
  const status = late && r.status !== 'delivered' ? 'delayed' : r.status;
  let statusText = STATUS_TEXT[status] ?? STATUS_TEXT.unknown;
  if (status === 'delivered' && out) statusText = 'Levert til mottaker';
  const logo = packageLogo(r);
  const steps = out ? STEPS_OUT : r.status === 'out_for_delivery' ? [...STEPS_IN.slice(0, 3), 'Ute for levering', 'Levert'] : r.status === 'returned' ? [...STEPS_IN.slice(0, 4), 'Returnert'] : STEPS_IN;
  const step = stepOf(r.status);
  const next = nextCheckAt(r);
  // Feil fra API-et: «Kunne ikke oppdatere · prøver igjen 20:15». Uten et eneste vellykket oppslag er statusen ikke bekreftet.
  const updateError = r.last_error ? { text: next ? `Kunne ikke oppdatere · prøver igjen ${hhmm(Math.max(next, now()))}` : 'Kunne ikke oppdatere', reason: r.last_error, retryAt: next ? new Date(Math.max(next, now())).toISOString() : null } : null;
  return {
    id: r.id, trackingNo: r.tracking_no, carrier: r.carrier, ...carrierInfo(r0), carrierName: c.name, carrierIni: c.ini, carrierColor: c.color, carrierFg: c.fg, carrierLogo: c.manual ? logo.kind === 'carrier' ? logo.svg : logo.carrierLogo?.svg ?? null : c.logo,
    name: packageTitle(r), title: packageTitle(r), shop: r.shop, shopDomain: shopDomainFor(r.shop, r.shop_domain) || null, logo, source: r.source, sourceRef: r.source_ref, sourceNote: r.source_note,
    direction: r.direction, status, statusText, step, steps, timeline: timelineOf(r, steps, step, events),
    eta: r.eta, estimatedDelivery: r.eta ?? null, pickupPoint: r.pickup_point,
    pickup: r.pickup_point || r.pickup_deadline ? { name: r.pickup_point ?? null, deadline: r.pickup_deadline ?? null } : null,
    lastEvent: lastEventOf(events), updateError, statusUnverified: !!r.last_error && !r.ok_at && r.source !== 'finn',
    noEtaText: status === 'registered' && !r.eta ? 'Ingen leveringsdato ennå' : null,
    archived: !!r.archived, delayed: status === 'delayed', updatedAt: r.updated_at, checkedAt: r.checked_at, nextCheckAt: next ? new Date(next).toISOString() : null,
    rawStatus: r.raw_status ?? null, canonicalStatus: canonical41(status), notScanned: !!r.not_scanned, ...(r.not_scanned ? { notScannedText: 'Ikke skannet ennå' } : {}), // prompt 41
    lastError: r.last_error, url: trackUrl(r.carrier, r.tracking_no), keyed: isConfigured(r.carrier), keyMissing: missingKeyText(r.carrier), events: events.map(({ ts, status: st, location }) => ({ ts, status: st, location })),
  };
}
const byId = (id) => q('SELECT * FROM hl_shipments WHERE id=?').get(id);
/* ---------------- Prompt 41: push ved endring ---------------- */
// Hendelser (som ha-postnord): parcel_registered, status_changed {old, new}, delivered, delivery_time_changed. Ingen hendelser ved første
// oppdatering av en pakke etter oppstart. Push (Varsler → Pakker) for delivered, at_pickup_point (ready_for_pickup) og delivery_time_changed,
// og sanntid «tracking:event» {kind, shipmentId, old?, new?, eta?}. Glimt-briefen leser statusen som før.
const seen41 = new Set();
export const _resetSeen41 = () => seen41.clear();
function pushChange41(r, status, res) {
  const first = !seen41.has(r.id);
  seen41.add(r.id);
  if (first || !r.user_id) return;
  const name = r.name || r.tracking_no;
  const evs = [];
  if (status !== r.status) evs.push({ kind: r.status === 'unknown' && r.not_scanned ? 'parcel_registered' : 'status_changed', old: r.status, new: status });
  if (status !== r.status && status === 'delivered') evs.push({ kind: 'delivered' });
  if (res.eta && r.eta && res.eta !== r.eta && !FINAL.includes(status)) evs.push({ kind: 'delivery_time_changed', old: r.eta, new: res.eta });
  if (!evs.length) return;
  for (const e of evs) { try { broadcast('tracking:event', { ...e, shipmentId: r.id, trackingNo: r.tracking_no }, [r.user_id]); } catch { /* */ } }
  const p = prefs(r.user_id);
  const msg = status !== r.status && status === 'delivered' && p.delivered ? `Levert: ${name}`
    : status !== r.status && status === 'ready_for_pickup' && p.pickup ? `Klar for henting${res.pickupPoint || r.pickup_point ? ` hos ${res.pickupPoint || r.pickup_point}` : ''}: ${name}`
      : status !== r.status && status === 'out_for_delivery' && p.out ? `Ute for levering: ${name}`
        : evs.some((e) => e.kind === 'delivery_time_changed') && p.out ? `Ny leveringstid for ${name}: ${String(res.eta).slice(0, 10).split('-').reverse().slice(0, 2).join('.')}` : null;
  if (msg) import('./notify.js').then(({ notifyUser }) => notifyUser(r.user_id, { title: 'Sporing', body: msg, url: '/#/sporing', tag: `pakke-${r.id}`, category: 'pakker', data: { kind: `tracking.${evs.at(-1).kind}`, shipmentId: r.id } })).catch(() => {});
}
// Brukerens egen sending (andres gir undefined, som en ukjent id).
const mineById = (u, id) => q('SELECT * FROM hl_shipments WHERE id=? AND user_id=?').get(id, u);

// Legger til eller slår sammen på sporingsnummer. Eksisterende felt overskrives bare når de er tomme,
// slik at et navn du har gitt selv ikke byttes ut av e-posten.
export function upsertShipment({ user = OWNER, trackingNo, carrier, carrierOverride = null, name = '', shop = '', shopDomain = '', source = 'manual', sourceRef = null, sourceNote = '', direction = 'in', status, eta = null, pickupPoint = null, sourceDate = null }) {
  const no = normNo(trackingNo);
  if (no.length < 6 || no.length > 40) throw new Error('Ugyldig sporingsnummer');
  const car = CARRIER[carrier] ? carrier : detect(no);
  const ex = q('SELECT * FROM hl_shipments WHERE tracking_no=? AND user_id=?').get(no, user);
  if (ex) {
    q(`UPDATE hl_shipments SET name=CASE WHEN name='' THEN ? ELSE name END, shop=CASE WHEN shop='' THEN ? ELSE shop END,
       shop_domain=CASE WHEN shop_domain='' THEN ? ELSE shop_domain END,
       source_ref=COALESCE(source_ref, ?), source_note=CASE WHEN source_note='' THEN ? ELSE source_note END, source_date=COALESCE(source_date, ?), updated_at=? WHERE id=?`)
      .run(str(name, 120), str(shop, 80), str(shopDomain, 120), sourceRef, str(sourceNote, 200), validDate(sourceDate), now(), ex.id);
    // En kilde som vet at pakken er kommet lenger (Finn-handelen, e-post «Pakken er levert») flytter statusen fremover, aldri bakover.
    if (status && promote(ex, status, source === 'finn' ? 'Oppdatert fra Finn-handelen' : source === 'email' ? 'Oppdatert fra e-post' : '')) return { shipment: byId(ex.id), created: false, promoted: true };
    return { shipment: byId(ex.id), created: false };
  }
  // E-post og Finn sender aldri carrierOverride; en eksisterende sending (over) får aldri byttet transportør herfra.
  const r = q(`INSERT INTO hl_shipments(user_id,tracking_no,carrier,carrier_override,name,shop,shop_domain,source,source_ref,source_note,direction,status,eta,pickup_point,source_date,updated_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(user, no, car, overrideVal(carrierOverride) ?? null, str(name, 120), str(shop, 80), str(shopDomain || shopDomainFor(shop, ''), 120), source, sourceRef, str(sourceNote, 200), direction === 'out' ? 'out' : 'in',
    status && STATUS_TEXT[status] ? status : 'registered', eta, pickupPoint, validDate(sourceDate), now(), now());
  addEvent(r.id, now(), source === 'manual' ? 'Lagt til i Sporing' : source === 'finn' ? 'Funnet i Finn-handel' : 'Funnet i e-post', '');
  if (source !== 'manual') notify(user, 'found', `Nytt sporingsnummer: ${r.name || r.tracking_no} (${(CARRIER[car] ?? CARRIER.other).name})`, r.id);
  return { shipment: r, created: true };
}
const validDate = (d) => { const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d ?? ''); return Number.isFinite(t) && t > 0 ? t : null; };
// Rangering for «bare fremover»: forsinket teller som underveis.
const RANK = { unknown: -1, registered: 0, picked_up: 1, in_transit: 2, delayed: 2, ready_for_pickup: 3, out_for_delivery: 3, delivered: 4, returned: 4 };
function promote(r, status, note) {
  if (!STATUS_TEXT[status] || (RANK[status] ?? -1) <= (RANK[r.status] ?? -1)) return false;
  applyResult(r, { status, events: note ? [{ ts: now(), status: `${STATUS_TEXT[status]} · ${note}`, location: '' }] : [] });
  return true;
}
const insEvent = q('INSERT OR IGNORE INTO hl_shipment_events(shipment_id, ts, status, location, raw) VALUES(?,?,?,?,?)');
const addEvent = (id, ts, status, location, raw = null) => insEvent.run(id, ts, String(status).slice(0, 200), String(location ?? '').slice(0, 120), raw);

// Ny status fra transportøren: lagre hendelser, og varsle hvis statusen har endret seg.
function applyResult(r, res, { api = false } = {}) {
  for (const e of res.events ?? []) addEvent(r.id, e.ts, e.status, e.location, api ? 'api' : null);
  // Butikk fra ParcelsApp fyller bare tomme felt.
  if (res.shop || res.shopDomain) q("UPDATE hl_shipments SET shop=CASE WHEN shop='' THEN ? ELSE shop END, shop_domain=CASE WHEN shop_domain='' THEN ? ELSE shop_domain END WHERE id=?").run(str(res.shop ?? '', 80), str(res.shopDomain || shopDomainFor(res.shop, ''), 120), r.id);
  const status = res.status && res.status !== 'unknown' ? res.status : r.status;
  q(`UPDATE hl_shipments SET status=?, eta=COALESCE(?, eta), pickup_point=COALESCE(?, pickup_point), pickup_deadline=COALESCE(?, pickup_deadline), last_error=NULL, checked_at=?,
      ok_at=CASE WHEN ? THEN ? ELSE ok_at END, updated_at=CASE WHEN status<>? THEN ? ELSE updated_at END WHERE id=?`)
    .run(status, res.eta ?? null, res.pickupPoint ?? res.pickup?.name ?? null, res.pickup?.deadline ?? null, now(), api ? 1 : 0, now(), status, now(), r.id);
  if ('rawStatus' in res || 'notScanned' in res) q('UPDATE hl_shipments SET raw_status=COALESCE(?, raw_status), not_scanned=? WHERE id=?').run(res.rawStatus ?? null, res.notScanned ? 1 : 0, r.id); // prompt 41
  pushChange41(r, status, res);
  archiveIfOld(byId(r.id));
  if (status !== r.status) {
    const name = r.name || r.tracking_no;
    if (status === 'ready_for_pickup') notify(r.user_id, 'ready_for_pickup', `Klar for henting${res.pickupPoint || r.pickup_point ? ` hos ${res.pickupPoint || r.pickup_point}` : ''}: ${name}`, r.id);
    else if (status === 'out_for_delivery') notify(r.user_id, 'out_for_delivery', `Ute for levering: ${name}`, r.id);
    else if (status === 'delivered') notify(r.user_id, 'delivered', `Levert: ${name}`, r.id);
    else if (status === 'delayed') notify(r.user_id, 'delayed', `Forsinket: ${name}`, r.id);
  }
}

// Gamle pakker (prompt 22): e-post eldre enn 14 dager som er levert, går rett i Arkiv.
const ageOf = (r) => now() - (r.source_date ?? r.created_at ?? now());
function archiveIfOld(r) {
  if (!r || r.archived || r.source !== 'email' || r.status !== 'delivered' || ageOf(r) <= 14 * DAY_MS) return false;
  q('UPDATE hl_shipments SET archived=1 WHERE id=?').run(r.id);
  return true;
}

// allowParcelsapp: bare når brukeren selv ber om status (ny sending, «Oppdater»), så ParcelsApp-kvoten spares.
async function refresh(r, { allowParcelsapp = false } = {}) {
  if (MOCK) return mockAdvance(r);
  // Overstyringen først (prompt 26): valgt selskaps API, eller ParcelsApp direkte med den gjenkjente transportøren som hint.
  const o = OVERRIDES.includes(r.carrier_override) ? r.carrier_override : null;
  // ParcelsApp har bare 3 oppslag i måneden: valgt ParcelsApp spores når du selv ber om det (ny, «Spor via», «Oppdater»), ikke i bakgrunnen.
  if (o === 'parcelsapp' && !allowParcelsapp) { q('UPDATE hl_shipments SET checked_at=? WHERE id=?').run(now(), r.id); return false; }
  const opts = { allowParcelsapp, ...(o ? { override: o, hint: r.carrier } : {}) };
  try { applyResult(r, await fetchStatus(carrierOf(r), r.tracking_no, opts), { api: true }); return true; }
  catch (e) {
    // Ikke funnet hos transportøren etter 30 dager: regnes som levert og arkiveres (ikke aktiv «Registrert» for alltid).
    if (e.status === 404 && ageOf(r) > 30 * DAY_MS && !FINAL.includes(r.status)) {
      addEvent(r.id, now(), 'Ikke funnet hos transportøren etter 30 dager · flyttet til Arkiv', '');
      q("UPDATE hl_shipments SET status='delivered', archived=1, last_error=NULL, checked_at=?, updated_at=? WHERE id=?").run(now(), now(), r.id);
      return true;
    }
    q('UPDATE hl_shipments SET last_error=?, checked_at=? WHERE id=?').run(String(e.message).slice(0, 200), now(), r.id); return false;
  }
}

/* ---------------- Automatisk innhenting ---------------- */

// Butikk fra avsender («Komplett <ordre@komplett.no>» → Komplett).
function shopOf(parsed) {
  const f = parsed.from?.value?.[0] ?? {};
  const name = String(f.name ?? '').replace(/\b(kundeservice|noreply|no-reply|ordre|order|info)\b/gi, '').replace(/[|·–-]\s*$/, '').trim();
  if (name && !/@/.test(name)) return name.slice(0, 60);
  const dom = String(f.address ?? '').split('@')[1] ?? '';
  return dom.replace(/^(mail|email|e|info|news)\./, '').replace(/\.(no|com|se|dk|de|net)$/, '').replace(/^./, (x) => x.toUpperCase()).slice(0, 60);
}
const POSTAL = /posten|bring|postnord|dhl|ups|fedex|gls|schenker|helthjem|budbee|instabox|porterbuddy|17track/i;

// Én e-post: finn sporingsnumre (regex, deretter AI som reserve) og lagre dem med butikk og vare.
export async function fromMail(parsed, u = OWNER) {
  if (!sources(u).email.on) return 0;
  const text = `${parsed.subject ?? ''}\n${mailText(parsed)}`;
  let nos = findTrackingNumbers(text), item = '', shop = shopOf(parsed);
  if (!nos.length && /sendt|shipped|på vei|on its way|sporing|tracking/i.test(parsed.subject ?? '')) {
    try {
      const { data } = await aiJson(`Dette er en ordre- eller fraktbekreftelse. Finn sporingsnummer (ikke ordrenummer), butikk og hva som ble sendt. Returner JSON.\n"""\n${text.slice(0, 6000)}\n"""`,
        { type: 'OBJECT', properties: { trackingNumbers: { type: 'ARRAY', items: { type: 'STRING' } }, shop: { type: 'STRING' }, item: { type: 'STRING' } }, required: ['trackingNumbers'] });
      nos = (data.trackingNumbers ?? []).map(normNo).filter((n) => n.length >= 8 && /\d{6,}/.test(n)).slice(0, 3);
      item = str(data.item ?? '', 80); shop = str(data.shop ?? '', 60) || shop;
    } catch { /* ingen AI – bare regex */ }
  }
  if (!nos.length) return 0;
  if (POSTAL.test(shop)) shop = '';
  const shopDomain = shop ? domainOf(parsed.from?.value?.[0]?.address) : '';
  const date = parsed.date ? new Date(parsed.date).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }) : '';
  // Emnet sier ofte hvor pakken er («Pakken din er levert», «Klar for henting»). Brødteksten er for full av ord som «levering».
  const st = normStatus(parsed.subject ?? '');
  const status = st === 'unknown' ? undefined : st;
  let n = 0;
  for (const no of nos) {
    const name = item || (shop ? `${shop}` : '');
    const { created } = upsertShipment({ user: u, trackingNo: no, name, shop, shopDomain, source: 'email', sourceRef: parsed.messageId ?? null, status, sourceDate: parsed.date ?? null,
      sourceNote: `Funnet i e-post${shop ? ` fra ${shop}` : ''}${date ? `, ${date}` : ''}` });
    if (created) n++;
  }
  return n;
}

// Finn-handler med Fiks ferdig: sporingsnummeret ligger på handelen (fh_finn.tracking).
// Per bruker: fh_finn.user_id når kolonnen finnes (ISO-FIN), ellers bare eieren (alle gamle handler er eierens).
const hasCol = (t, c) => { try { return db.prepare(`SELECT 1 FROM pragma_table_info('${t}') WHERE name=?`).get(c); } catch { return false; } };
export function syncFinn(u = OWNER) {
  if (!sources(u).finn.on) return 0;
  let rows = [];
  try {
    if (hasCol('fh_finn', 'user_id')) rows = q("SELECT * FROM fh_finn WHERE tracking IS NOT NULL AND tracking<>'' AND (user_id=? OR (user_id IS NULL AND ?=?))").all(u, u, OWNER);
    else if (u === OWNER) rows = q("SELECT * FROM fh_finn WHERE tracking IS NOT NULL AND tracking<>''").all();
  } catch { return 0; }
  let n = 0;
  for (const f of rows) {
    try {
      const sold = f.role === 'sold';
      // Steget i handelen (Sendt → Mottatt/Levert) gir status også når transportøren ikke har nøkkel.
      let emails = [];
      try { emails = q('SELECT subject, body FROM fh_finn_emails WHERE finn_id=?').all(f.id); } catch { /* eldre database */ }
      const stage = stageOf(f, emails);
      const status = stage >= 3 ? 'delivered' : stage === 2 ? 'in_transit' : undefined;
      const { created } = upsertShipment({ user: u, trackingNo: f.tracking, name: f.item, shop: 'Finn', shopDomain: 'finn.no', source: 'finn', sourceRef: String(f.id), direction: sold ? 'out' : 'in', status,
        sourceNote: `${sold ? 'Solgt til' : 'Kjøpt fra'} ${f.counterpart?.replace(/^(selger|kjøper)\s+/i, '') || 'motpart'} på Finn · Fiks ferdig` });
      if (created) n++;
    } catch { /* ugyldig nummer */ }
  }
  setSource(u, 'finn', { lastCheck: now() });
  return n;
}

// E-postskanning med brukerens egen IMAP. Eieren bruker scanShippingMails (FinansHub-oppsettet). Andre brukere skannes bare
// når finans/mail.js har scanShippingMailsFor(user, onMail) – ellers aldri (den gamle funksjonen leser eierens innboks).
async function scanMailFor(u) {
  if (u === OWNER) return mailConfig().host ? scanShippingMails((p) => fromMail(p, u)) : null;
  if (typeof mailMod.scanShippingMailsFor === 'function') return mailMod.scanShippingMailsFor(u, (p) => fromMail(p, u));
  return null;
}

// Én runde for én bruker: nye numre fra Finn og e-post, deretter status for aktive pakker som er «på tur».
// Kjøres i brukerens kontekst, så transportørnøklene (cfg) er brukerens egne.
const running = new Map();
function checkUser(u, { force = false } = {}) {
  if (running.has(u)) return running.get(u);
  const p = runAsUser(u, async () => {
    let found = 0, mail = null;
    found += syncFinn(u);
    if (sources(u).email.on) {
      if (MOCK) found += mockMail(u);
      else { mail = await scanMailFor(u).catch((e) => ({ ok: false, message: e.message })); found += mail?.found ?? 0; }
      setSource(u, 'email', { lastCheck: now(), ...(mail && !mail.ok ? { error: mail.message } : { error: null }) });
    }
    // Nye pakker (aldri sjekket) straks, ellers etter checkInterval (2 min slingringsmonn mot 15-minutters takten).
    // Prompt 41: ingen bakgrunnskall 00–06 (bare én runde rett etter midnatt).
    const allowed = force || pollAllowed41(u);
    const due = !allowed ? [] : q(`SELECT * FROM hl_shipments WHERE user_id=? AND archived=0 AND status IN (${ACTIVE.map(() => '?').join(',')}) ORDER BY checked_at IS NOT NULL, checked_at`).all(u, ...ACTIVE)
      .filter((r) => force || !r.checked_at || nextCheckAt(r) - 2 * 60_000 <= now());
    let updated = 0;
    for (const r of due.slice(0, 40)) if (await refresh(r)) updated++;
    if (sources(u).autoArchive?.on) q("UPDATE hl_shipments SET archived=1 WHERE user_id=? AND archived=0 AND status IN ('delivered','returned') AND updated_at < ?").run(u, now() - 3 * 86400_000);
    for (const r of q("SELECT * FROM hl_shipments WHERE user_id=? AND archived=0 AND source='email' AND status='delivered'").all(u)) archiveIfOld(r);
    kv.set(u, 'trk_last_run', now());
    if (found || updated) broadcast('tracking', { action: 'checked', found, updated }, [u]);
    return { found, updated, mail };
  }).finally(() => { running.delete(u); });
  running.set(u, p);
  return p;
}
/** Én runde. Med user: bare den brukeren; uten: alle brukere etter tur. */
export async function checkAll({ force = false, user } = {}) {
  if (user) return checkUser(user, { force });
  const total = { found: 0, updated: 0, mail: null };
  for (const { id } of q('SELECT id FROM users ORDER BY is_main_admin DESC, created').all()) {
    try { const r = await checkUser(id, { force }); total.found += r.found; total.updated += r.updated; if (id === OWNER) total.mail = r.mail; } catch { /* neste bruker */ }
  }
  return total;
}

let timer = null;
export function startTrackingWorker() {
  if (timer) return;
  if (MOCK) seedMock(OWNER);
  timer = setInterval(() => { checkAll().catch(() => {}); }, 15 * 60_000);
  timer.unref?.();
  setTimeout(() => checkAll().catch(() => {}), 20_000).unref?.();
}

/* ---------------- Utdrag til widget og mobil ---------------- */

const rank = (s) => (s.status === 'ready_for_pickup' ? 0 : s.status === 'out_for_delivery' ? 1 : 2);
export function activeShipments(u, limit = 3) {
  return q(`SELECT * FROM hl_shipments WHERE user_id=? AND archived=0 AND status NOT IN ('delivered','returned') ORDER BY updated_at DESC`).all(u).map(view)
    .sort((a, b) => rank(a) - rank(b) || b.step - a.step).slice(0, limit);
}
const activeCount = (u) => q("SELECT COUNT(*) n FROM hl_shipments WHERE user_id=? AND archived=0 AND status NOT IN ('delivered','returned')").get(u).n;
// moreCount: antall andre aktive pakker («+12 pakker ›»), dvs. alle aktive minus denne.
const brief = (s, total) => ({ id: s.id, trackingNo: s.trackingNo, name: s.name, title: s.title, shop: s.shop, shopDomain: s.shopDomain, logo: s.logo,
  moreCount: Math.max(0, (total ?? 1) - 1), activeCount: total ?? null, carrier: s.carrier, carrierName: s.carrierName, carrierIni: s.carrierIni, carrierColor: s.carrierColor, carrierFg: s.carrierFg,
  status: s.status, statusText: s.statusText, step: s.step, eta: s.eta, pickupPoint: s.pickupPoint, direction: s.direction, carrierLogo: s.carrierLogo,
  lastEvent: s.lastEvent, updateError: s.updateError, estimatedDelivery: s.estimatedDelivery, pickup: s.pickup });
/** De viktigste aktive pakkene til brukeren u (mobilforside og widgets). */
export function packagesFor(limit = 2, u) {
  if (!u) return [];
  try { if (MOCK) seedMock(u); const n = activeCount(u); return runAsUser(u, () => activeShipments(u, limit).map((s) => brief(s, n))); } catch { return []; }
}

/* ---------------- Integrasjonstest ---------------- */

export const hasTrackingTest = (group) => group === 'tracking' || group === 'Sporing';
export async function testTracking() {
  const t0 = now();
  if (MOCK) return { ok: true, message: 'Demodata (MOCK_DATA=1): ingen ekte kall ble gjort.', ms: 0, mock: true };
  try { return { ok: true, message: await testCarriers(), ms: now() - t0 }; }
  catch (e) { return { ok: false, message: e.message, ms: now() - t0 }; }
}

/* ---------------- API (/api/tracking) ---------------- */

const api = new Hono();
api.use('*', userGuard);

// Sanntid bare til eieren av sendingene (ISO2).
const changed = (u, action, extra = {}) => broadcast('tracking', { action, ...extra }, [u]);
// archived: 'all' (standard, som før), '0' = bare aktive/ikke arkiverte, '1' = bare Arkiv.
const listOut = (uid, archived = 'all') => {
  if (MOCK) seedMock(uid);
  const where = archived === '1' || archived === '0';
  const all = q('SELECT * FROM hl_shipments WHERE user_id=? ORDER BY archived, updated_at DESC').all(uid);
  const items = (where ? all.filter((r) => (archived === '1' ? r.archived : !r.archived)) : all).map(view);
  const p = prefs(uid);
  return {
    items, sources: sources(uid), prefs: p, notices: kv.get(uid, 'trk_notices', []).filter((n) => p[n.kind] !== false).slice(0, 20), lastRun: kv.get(uid, 'trk_last_run', null),
    carriers: CARRIERS.map((c) => { const lg = c.manual ? packageLogo({ carrier: c.id, shop: '', shop_domain: '' }) : null;
      return { id: c.id, name: c.name, ini: c.ini, color: c.color, fg: c.fg, logo: c.manual ? lg.svg : c.logo, manual: !!c.manual, configured: isConfigured(c.id), keyMissing: missingKeyText(c.id) }; }),
    counts: { active: all.filter((s) => !s.archived && !FINAL.includes(s.status)).length, pickup: all.filter((s) => !s.archived && s.status === 'ready_for_pickup' && s.direction === 'in').length,
      delivered: all.filter((s) => s.archived || FINAL.includes(s.status)).length, archived: all.filter((s) => s.archived).length },
    parcelsapp: parcelsappUsage(),
    // Prompt 26: valgene under «Spor via» / ny pakke (null = Auto).
    overrides: OVERRIDES.map((id) => (id === 'parcelsapp' ? { id, name: PARCELSAPP.name, ini: 'PA', color: '#4B5BD6', fg: '#fff' } : { id, name: CARRIER[id].name, ini: CARRIER[id].ini, color: CARRIER[id].color, fg: CARRIER[id].fg })),
    moreCount: Math.max(0, all.filter((s) => !s.archived && !FINAL.includes(s.status)).length - 1),
  };
};

api.get('/', (c) => c.json(listOut(uidOf(c), ['0', '1'].includes(c.req.query('archived')) ? c.req.query('archived') : 'all')));
api.get('/widget', (c) => { const u = uidOf(c), out = listOut(u), n = activeCount(u); return c.json({ items: activeShipments(u, 3).map((s) => brief(s, n)), moreCount: Math.max(0, n - 1), count: out.counts }); });
api.get('/detect', (c) => { const no = normNo(c.req.query('no')); const id = no ? detect(no) : 'other'; return c.json({ carrier: id, name: CARRIER[id].name, configured: isConfigured(id) }); });

api.post('/', async (c) => {
  const b = await readJson(c);
  const no = normNo(b.trackingNo);
  if (no.length < 6) return bad(c, 'Skriv inn et sporingsnummer');
  const u = uidOf(c);
  if (q('SELECT 1 FROM hl_shipments WHERE tracking_no=? AND user_id=?').get(no, u)) return bad(c, 'Sendingen spores allerede', 409);
  let r;
  const ov = 'carrierOverride' in b ? overrideVal(b.carrierOverride) : null;
  if (ov === undefined) return bad(c, `carrierOverride må være ${OVERRIDES.join(', ')} eller null`);
  try { ({ shipment: r } = upsertShipment({ user: u, trackingNo: no, carrier: b.carrier, carrierOverride: ov, name: str(b.name, 120), direction: b.direction })); } catch (e) { return bad(c, e.message); }
  if (ov) addEvent(r.id, now(), `Spores via ${overrideName(ov)} (valgt)`, '');
  await refresh(r, { allowParcelsapp: true });
  const v = view(byId(r.id));
  changed(u, 'created', { id: v.id });
  return c.json({ item: v, message: v.lastError ? `Lagt til. Statusen kan ikke hentes ennå: ${v.lastError}` : `✦ Fant sendingen hos ${v.carrierName} · ${v.statusText}` });
});

api.patch('/:id', async (c) => {
  const r = mineById(uidOf(c), +c.req.param('id'));
  if (!r) return bad(c, 'Fant ikke sendingen', 404);
  const b = await readJson(c);
  if ('name' in b) q('UPDATE hl_shipments SET name=? WHERE id=?').run(str(b.name, 120), r.id);
  if ('carrier' in b && CARRIER[b.carrier]) q('UPDATE hl_shipments SET carrier=?, checked_at=NULL WHERE id=?').run(b.carrier, r.id);
  if ('archived' in b) q('UPDATE hl_shipments SET archived=? WHERE id=?').run(b.archived ? 1 : 0, r.id);
  if ('direction' in b) q('UPDATE hl_shipments SET direction=? WHERE id=?').run(b.direction === 'out' ? 'out' : 'in', r.id);
  // Prompt 26: «Spor via». Endringen gir et nytt oppslag med en gang (ParcelsApp tillatt, som når du legger til en sending).
  let message;
  if ('carrierOverride' in b) {
    const ov = overrideVal(b.carrierOverride);
    if (ov === undefined) return bad(c, `carrierOverride må være ${OVERRIDES.join(', ')} eller null`);
    if (ov !== (r.carrier_override ?? null)) {
      q('UPDATE hl_shipments SET carrier_override=?, checked_at=NULL, last_error=NULL WHERE id=?').run(ov, r.id);
      addEvent(r.id, now(), ov ? `Spores via ${overrideName(ov)} (valgt)` : `Spores via ${(CARRIER[r.carrier] ?? CARRIER.other).name} (auto)`, '');
      await refresh(byId(r.id), { allowParcelsapp: true });
      const v = view(byId(r.id));
      message = v.lastError ? `Spores via ${ov ? overrideName(ov) : 'Auto'}. Statusen kan ikke hentes ennå: ${v.lastError}` : `Spores via ${ov ? overrideName(ov) : `Auto (${v.carrierDetectedName})`} · ${v.statusText}`;
    }
  }
  q('UPDATE hl_shipments SET updated_at=? WHERE id=?').run(now(), r.id);
  changed(r.user_id, 'updated', { id: r.id });
  return c.json({ item: view(byId(r.id)), ...(message ? { message } : {}) });
});

// Hent status for én sending nå. Her kan ParcelsApp brukes som siste reserve (teller mot månedskvoten).
api.post('/:id{[0-9]+}/refresh', async (c) => {
  const r = mineById(uidOf(c), +c.req.param('id'));
  if (!r) return bad(c, 'Fant ikke sendingen', 404);
  await refresh(r, { allowParcelsapp: true });
  const v = view(byId(r.id));
  changed(r.user_id, 'updated', { id: r.id });
  return c.json({ item: v, parcelsapp: parcelsappUsage(), message: v.lastError ? `Fikk ikke hentet status: ${v.lastError}` : `${v.carrierName} · ${v.statusText}` });
});

// Velg flere (prompt 17): arkiver, gjenopprett eller slett mange sendinger på én gang.
api.post('/bulk', async (c) => {
  const b = await readJson(c);
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500) : [];
  if (!ids.length) return bad(c, 'Velg minst én sending');
  if (!['archive', 'unarchive', 'delete'].includes(b.action)) return bad(c, 'action må være archive, unarchive eller delete');
  const marks = ids.map(() => '?').join(','), u = uidOf(c);
  const n = b.action === 'delete'
    ? q(`DELETE FROM hl_shipments WHERE user_id=? AND id IN (${marks})`).run(u, ...ids).changes
    : q(`UPDATE hl_shipments SET archived=?, updated_at=? WHERE user_id=? AND id IN (${marks})`).run(b.action === 'archive' ? 1 : 0, now(), u, ...ids).changes;
  changed(u, 'bulk', { ids, bulkAction: b.action });
  const word = { archive: 'arkivert', unarchive: 'gjenopprettet', delete: 'slettet' }[b.action];
  return c.json({ ok: true, changed: n, message: `${n} ${n === 1 ? 'sending' : 'sendinger'} ${word}`, ...listOut(uidOf(c)) });
});

api.delete('/:id', (c) => {
  const id = +c.req.param('id'), u = uidOf(c);
  if (q('DELETE FROM hl_shipments WHERE id=? AND user_id=?').run(id, u).changes) changed(u, 'deleted', { id });
  return c.json({ ok: true });
});

// Pull-to-refresh (prompt 22): henter status for alle aktive pakker nå (og nye numre fra Finn og e-post).
api.post('/refresh', async (c) => {
  const u = uidOf(c), r = await checkAll({ force: true, user: u });
  const failed = q('SELECT COUNT(*) n FROM hl_shipments WHERE user_id=? AND archived=0 AND last_error IS NOT NULL').get(u).n;
  const msg = `${r.updated} oppdatert${r.found ? ` · ${r.found} ny${r.found === 1 ? '' : 'e'}` : ''}${failed ? ` · ${failed} kunne ikke oppdateres` : ''}`;
  return c.json({ ...listOut(uidOf(c)), refreshed: r.updated, found: r.found, failed, message: msg });
});

api.post('/check', async (c) => {
  const r = await checkAll({ force: true, user: uidOf(c) });
  const msg = r.found ? `✦ Fant ${r.found} nytt sporingsnummer${r.found === 1 ? '' : ''} · ${r.updated} oppdatert` : r.mail && !r.mail.ok ? `E-post: ${r.mail.message}` : `Alt er oppdatert. Ingen nye sporingsnumre${r.updated ? ` · ${r.updated} oppdatert` : ''}.`;
  return c.json({ ...listOut(uidOf(c)), message: msg });
});

api.put('/prefs', async (c) => {
  const b = await readJson(c);
  const p = Object.fromEntries(Object.keys(PREF_DEFAULT).filter((k) => k in b).map((k) => [k, !!b[k]]));
  const uid = uidOf(c);
  kv.set(uid, 'trk_prefs', { ...prefs(uid), ...p });
  return c.json({ prefs: prefs(uid) });
});

api.put('/sources', async (c) => {
  const b = await readJson(c);
  const u = uidOf(c);
  for (const k of ['finn', 'email', 'autoArchive']) if (k in b) setSource(u, k, { on: !!(b[k] && typeof b[k] === 'object' ? b[k].on : b[k]) });
  return c.json({ sources: sources(u) });
});

api.delete('/notices', (c) => { kv.set(uidOf(c), 'trk_notices', []); return c.json({ ok: true }); });

export default api;

/* ---------------- Demodata (MOCK_DATA=1) ---------------- */

const DAY = 86400_000;
// Demo per bruker: én gang, og bare når brukeren ikke har noen sendinger.
function seedMock(u) {
  if (!u || kv.get(u, 'trk_mock_seeded') || q('SELECT 1 FROM hl_shipments WHERE user_id=? LIMIT 1').get(u)) { if (u && !kv.get(u, 'trk_mock_seeded')) kv.set(u, 'trk_mock_seeded', 1); return; }
  kv.set(u, 'trk_mock_seeded', 1);
  const d = (n, h = '09:12') => { const t = new Date(now() - n * DAY); const [hh, mm] = h.split(':'); t.setHours(+hh, +mm, 0, 0); return t.getTime(); };
  const etaIn = (n) => new Date(now() + n * DAY).toLocaleDateString('sv-SE');
  const seed = [
    ['CV704411234NO', 'posten', 'iPhone 14 Pro 256 GB', 'Finn', 'finn', 'Kjøpt fra Ola N. på Finn · Trygg betaling', 'in', 'in_transit', etaIn(1), null, [['Avsender: Trondheim', 3], ['Mottatt av Posten i Trondheim', 2], ['Ankommet terminal Oslo', 0]]],
    ['CV704418877NO', 'posten', 'PS5 + 2 kontroller', 'Finn', 'finn', 'Solgt til Jonas B. · Fiks ferdig-etikett fra Finn', 'out', 'registered', etaIn(2), null, [['Etikett laget i Finn', 1]]],
    ['00370726201234567890', 'postnord', 'Komplett · skjerm', 'Komplett', 'email', 'Funnet i e-post fra Komplett.no', 'in', 'ready_for_pickup', etaIn(7), 'Kiwi Pilestredet', [['Avsender: Sandefjord', 4], ['Mottatt av PostNord i Sandefjord', 3], ['Ankommet terminal Oslo', 2], ['Hentested: Kiwi Pilestredet', 0]]],
    ['JJD000390007882034', 'dhl', 'Zalando · jakke', 'Zalando', 'email', 'Funnet i e-post fra Zalando', 'in', 'in_transit', etaIn(3), null, [['Avsender: Tyskland', 2], ['Mottatt av DHL i Leipzig', 1], ['Ankommet terminal Oslo', 0]]],
    ['LP005123456789012', 'posten', 'AliExpress · USB-C-kabler', 'AliExpress', 'email', 'Funnet i e-post fra AliExpress', 'in', 'in_transit', etaIn(6), null, [['Avsender: Kina', 11], ['Mottatt av Posten i Oslo', 2]]],
    ['HH40211873', 'helthjem', 'Elkjøp · støvsuger', 'Elkjøp', 'email', 'Funnet i e-post fra Elkjøp', 'in', 'delivered', etaIn(-2), null, [['Avsender: Jessheim', 5], ['I transport', 4], ['Ute for levering', 2], ['Levert', 2]]],
    ['70712345678901234', 'bring', '', '', 'email', 'Funnet i e-post', 'in', 'registered', etaIn(4), null, [['Avsender: Oslo', 0]]],
    ['1Z999AA10123456784', 'ups', 'Apple · AirPods', 'Apple', 'email', 'Funnet i e-post fra Apple', 'in', 'delivered', etaIn(-6), null, [['Avsender: Nederland', 9], ['I transport', 7], ['Levert', 6]]],
  ];
  for (const [no, car, name, shop, src, note, dir, status, eta, pick, evs] of seed) {
    const r = q(`INSERT INTO hl_shipments(user_id,tracking_no,carrier,name,shop,source,source_ref,source_note,direction,status,eta,pickup_point,checked_at,updated_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(u, no, car, name, shop, src, src === 'finn' ? 'demo' : null, note, dir, status, eta, pick, now(), now() - evs[evs.length - 1][1] * DAY, d(evs[0][1]));
    evs.forEach(([t, n], i) => addEvent(r.id, d(n, ['09:12', '14:40', '06:55', '11:30', '16:05'][i] ?? '12:00'), t.split(':')[0].replace(/^Avsender$/, 'Registrert'), t.includes(':') ? t.split(': ')[1] : ''));
  }
}
function mockMail(u) {
  const no = '00370726209876543210';
  if (q('SELECT 1 FROM hl_shipments WHERE tracking_no=? AND user_id=?').get(no, u)) return 0;
  return upsertShipment({ user: u, trackingNo: no, name: 'Clas Ohlson · lyspærer', shop: 'Clas Ohlson', source: 'email', sourceNote: 'Funnet i e-post fra Clas Ohlson, i dag', eta: new Date(now() + 4 * DAY).toLocaleDateString('sv-SE') }).created ? 1 : 0;
}
// Demo: manuelle sendinger får en plausibel status ut fra nummeret, så siden har noe å vise uten nøkler.
function mockAdvance(r) {
  if (r.source !== 'manual' || r.checked_at) { q('UPDATE hl_shipments SET checked_at=? WHERE id=?').run(now(), r.id); return true; }
  const hsh = [...r.tracking_no].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const status = hsh % 2 ? 'in_transit' : 'picked_up';
  applyResult(r, { status, eta: new Date(now() + (2 + (hsh % 3)) * DAY).toLocaleDateString('sv-SE'), events: [{ ts: now() - DAY, status: 'Mottatt av transportøren', location: 'Oslo' }, ...(status === 'in_transit' ? [{ ts: now() - 3600_000, status: 'I transport', location: 'Oslo terminal' }] : [])] });
  return true;
}

export { normStatus };
