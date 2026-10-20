// Prompt 42 (SERVER42): Sporing – AliExpress fra e-postmappen «AliExpress» + Cainiao (tracking-carriers.js), og PostNord-feilsøking.
// claude-code-sporing-aliexpress.md, claude-code-postnord-fortsatt-feil.md.
//
//   GET  /api/tracking/debug/:id        (bare admin) → {shipment, trackingNo, carrier, variants:[…], calls:[{at, layer, url, headers, status, body, variant, ms, error}], health, curl}
//   POST /api/tracking/debug/:id/test   (bare admin) → «Test nå»: ett nytt oppslag fra serveren nå (uten cache) → samme svar + result
//   GET  /api/tracking/aliexpress       → {folder, lastRun, found, seen}
//   PUT  /api/tracking/aliexpress {folder} → mappenavn (standard «AliExpress»)
//   POST /api/tracking/aliexpress/check → «Sjekk nå» for AliExpress-mappen → {ok, scanned, found}
//   POST /api/tracking/aliexpress/mail {raw|text, subject?, from?, uid?} → legg inn én AliExpress-e-post (test/import) → {found, shipments}
import { Hono } from 'hono';
import { simpleParser } from 'mailparser';
import { db, kv } from './db.js';
import { isAdmin, sessionUser } from './auth.js';
import { userGuard } from './homeos-common.js';
import { runAsUser } from './settings.js';
import { upsertShipment, setAliHook42, trk42 } from './tracking.js';
import { normNo, detect, pnDebugOf42, pnVariants42, postnordHealth41, POSTNORD_WEB_URL, PN_HEADERS42, _clearPostnordWebCache, _clearCainiaoCache } from './tracking-carriers.js';
import { mailCfg42, mailConnect42, resolveFolder, mailText } from './finans/mail.js';

const q = (sql) => db.prepare(sql);
db.exec('CREATE TABLE IF NOT EXISTS track_mail_seen (user_id TEXT NOT NULL, folder TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, folder, uid))');

/* ---------------- Gjenkjenning ---------------- */

const ALI_FROM = /@(?:[\w-]+\.)*aliexpress\.com\b/i;
const ORDER_RE = /(?:order|ordre|bestilling)(?:\s*(?:no\.?|number|nr\.?|id|nummer))?\s*[:#]?\s*(\d{15,19})\b/i;
const TRACK_RE = /\b(LP\d{12,}|AEG?\d{10,}|CN[A-Z0-9]{10,}|[A-Z]{2}\d{9}(?:CN|NO|SE))\b/g;
/** Én AliExpress-e-post → {kind:'order'|'shipped'|'update', orderId, trackingNos[], items[], localNos[], status} */
export function parseAliMail42({ subject = '', text = '', from = '' } = {}) {
  const t = `${subject}\n${text}`;
  const kind = /shipped|has been sent|er sendt|pakken din er sendt|on its way|på vei/i.test(t) ? 'shipped' : /order (confirmed|placed)|ordrebekreftelse|thank you for your order|takk for bestillingen/i.test(t) ? 'order' : 'update';
  const orderId = t.match(ORDER_RE)?.[1] ?? t.match(/\b(\d{16,19})\b/)?.[1] ?? null;
  const nos = [...new Set([...t.toUpperCase().matchAll(TRACK_RE)].map((m) => normNo(m[1])))];
  const trackingNos = nos.filter((n) => detect(n) === 'aliexpress' || /^LP|^AE|^CN/.test(n));
  const localNos = nos.filter((n) => !trackingNos.includes(n));
  const items = [];
  for (const m of t.matchAll(/(?:^|\n)\s*(?:item|vare|product|produkt)\s*[:-]\s*([^\n]{3,80})/gi)) items.push(m[1].trim());
  if (!items.length) { const m = t.match(/(?:^|\n)\s*([A-ZÆØÅ0-9][^\n]{6,70}?(?:kabel|kabler|lader|deksel|case|cable|charger|adapter|lampe|batteri|holder|stand|sett|set)[^\n]{0,30})\n/i); if (m) items.push(m[1].trim()); }
  const status = /delivered|levert/i.test(subject) ? 'delivered' : /arrived in|kommet til norge|import customs/i.test(t) ? 'in_transit' : /pick ?up point|klar for henting/i.test(t) ? 'ready_for_pickup' : kind === 'shipped' ? 'picked_up' : 'registered';
  return { kind, orderId, trackingNos, localNos, items, status, isAli: ALI_FROM.test(from) || /aliexpress/i.test(t) };
}
const pending = (u) => kv.get(u, 'ali42_orders', {}) ?? {};
const short = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
const orderShort = (id) => (id && id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);
/** Legger inn sendinger fra én AliExpress-e-post (én sending per sporingsnummer). → antall nye */
export function fromAliMail42(parsed, u, { uid = null, folder = 'AliExpress' } = {}) {
  const text = parsed.text ?? mailText(parsed);
  const from = parsed.from?.text ?? parsed.from?.value?.[0]?.address ?? parsed.from ?? '';
  const m = parseAliMail42({ subject: parsed.subject ?? '', text, from });
  if (!m.isAli) return { found: 0, shipments: [] };
  const orders = pending(u);
  if (m.orderId && m.items.length) { orders[m.orderId] = { items: m.items, at: Date.now() }; kv.set(u, 'ali42_orders', Object.fromEntries(Object.entries(orders).slice(-200))); }
  const items = m.items.length ? m.items : orders[m.orderId]?.items ?? [];
  const date = parsed.date ? new Date(parsed.date).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Oslo' }) : '';
  let found = 0;
  const out = [];
  m.trackingNos.forEach((no, i) => {
    const name = items.length ? `AliExpress · ${short(items[0])}${items.length > 1 ? ` + ${items.length - 1} til` : ''}` : 'AliExpress-pakke';
    const note = `Funnet i e-postmappen ${folder}${date ? `, ${date}` : ''}${m.orderId ? ` · ordre ${orderShort(m.orderId)}` : ''}${m.trackingNos.length > 1 ? ` · pakke ${i + 1} av ${m.trackingNos.length}` : ''}`;
    const { shipment, created } = upsertShipment({ user: u, trackingNo: no, carrier: 'aliexpress', name, shop: 'AliExpress', shopDomain: 'aliexpress.com', source: 'email', sourceRef: parsed.messageId ?? null, sourceNote: note, status: m.status, sourceDate: parsed.date ?? null });
    q('UPDATE hl_shipments SET order_id=COALESCE(order_id, ?), items=COALESCE(items, ?), mail_uid=COALESCE(mail_uid, ?), local_no=COALESCE(local_no, ?), local_carrier=COALESCE(local_carrier, ?) WHERE id=?')
      .run(m.orderId, items.length ? JSON.stringify(items) : null, uid, m.localNos[0] ?? null, m.localNos[0] ? detect(m.localNos[0]) : null, shipment.id);
    if (created) found++;
    out.push(shipment.id);
  });
  return { found, shipments: out };
}

/* ---------------- IMAP: mappen «AliExpress» ---------------- */

const folderOf = (u) => kv.get(u, 'ali42_folder', 'AliExpress') || 'AliExpress';
/** Leser bare mappen (SEARCH SINCE siste kjøring − 1 d); UID-ene som er behandlet huskes (track_mail_seen). */
export async function scanAliExpress42(u, { max = 100 } = {}) {
  return runAsUser(u, async () => {
    const c = mailCfg42();
    if (!c.host || !c.user || !c.pass) return { ok: false, scanned: 0, found: 0, message: 'E-post er ikke satt opp' };
    let client, scanned = 0, found = 0;
    try {
      ({ client } = await mailConnect42(c, { allowPin: true }));
      const folders = (await client.list()).map((f) => f.path);
      const box = resolveFolder(folders, folderOf(u));
      if (!box) return { ok: false, scanned: 0, found: 0, message: `Fant ikke mappen «${folderOf(u)}»` };
      const lock = await client.getMailboxLock(box);
      try {
        const last = kv.get(u, 'ali42_last', 0) || Date.now() - 60 * 86400_000;
        const uids = ((await client.search({ since: new Date(last - 86400_000) }, { uid: true })) || []).slice(-max);
        for (const uid of uids) {
          if (q('SELECT 1 FROM track_mail_seen WHERE user_id=? AND folder=? AND uid=?').get(u, box, String(uid))) continue;
          try {
            const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
            scanned++; found += fromAliMail42(await simpleParser(msg.source), u, { uid: String(uid), folder: folderOf(u) }).found;
            q('INSERT OR IGNORE INTO track_mail_seen(user_id, folder, uid, at) VALUES(?,?,?,?)').run(u, box, String(uid), Date.now());
          } catch { /* hopp over én e-post */ }
        }
      } finally { lock.release(); }
      kv.set(u, 'ali42_last', Date.now());
      kv.set(u, 'ali42_status', { at: Date.now(), scanned, found });
      return { ok: true, scanned, found };
    } catch (e) { return { ok: false, scanned, found, message: e.message }; }
    finally { await client?.logout().catch(() => client?.close()); }
  });
}
setAliHook42((u) => scanAliExpress42(u));

/* ---------------- Ruter ---------------- */

export const tracking42Api = new Hono();
tracking42Api.use('*', userGuard);
const adminOnly = async (c, next) => { if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer ser feilsøkingen', restricted: true }, 403); await next(); };
const debugOut = (r) => {
  const no = normNo(r.tracking_no);
  const variants = pnVariants42(no).map((v) => ({ ...v, url: `${POSTNORD_WEB_URL}?${v.param ?? 'id'}=${encodeURIComponent(v.id)}&locale=${v.locale}` }));
  return { shipment: trk42.view(r), trackingNo: no, carrier: r.carrier_override ?? r.carrier, lastError: r.last_error, via: r.via ?? null, variants, calls: pnDebugOf42(no), health: postnordHealth41(),
    curl: `curl -sS '${variants[0].url}' -H 'x-bap-key: ${PN_HEADERS42['x-bap-key']}' -H 'Accept: application/json' -H 'Origin: ${PN_HEADERS42.Origin}' -H 'Referer: ${PN_HEADERS42.Referer}' -A '${PN_HEADERS42['User-Agent']}'`,
    title: 'Detaljer for feilsøking' };
};
const mine = (c) => q('SELECT * FROM hl_shipments WHERE id=? AND user_id=?').get(+c.req.param('id'), c.get('user'));
tracking42Api.get('/debug/:id{[0-9]+}', adminOnly, (c) => { const r = mine(c); return r ? c.json(debugOut(r)) : c.json({ error: 'Fant ikke sendingen' }, 404); });
tracking42Api.post('/debug/:id{[0-9]+}/test', adminOnly, async (c) => {
  const r = mine(c);
  if (!r) return c.json({ error: 'Fant ikke sendingen' }, 404);
  _clearPostnordWebCache(); _clearCainiaoCache();
  const ok = await runAsUser(c.get('user'), () => trk42.refresh(r, { allowParcelsapp: false }));
  const r2 = trk42.byId(r.id);
  return c.json({ ...debugOut(r2), result: { ok, status: r2.status, error: r2.last_error, via: r2.via } });
});
tracking42Api.get('/aliexpress', (c) => { const u = c.get('user'); return c.json({ folder: folderOf(u), lastRun: kv.get(u, 'ali42_last', null), status: kv.get(u, 'ali42_status', null), seen: q('SELECT count(*) FROM track_mail_seen WHERE user_id=?').pluck().get(u) }); });
tracking42Api.put('/aliexpress', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const f = String(b.folder ?? '').trim().slice(0, 80);
  if (!f || /[\u0000-\u001f]/.test(f)) return c.json({ error: 'Skriv navnet på mappen' }, 400);
  kv.set(c.get('user'), 'ali42_folder', f);
  return c.json({ folder: f });
});
tracking42Api.post('/aliexpress/check', async (c) => c.json(await scanAliExpress42(c.get('user'))));
tracking42Api.post('/aliexpress/mail', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  let parsed;
  if (b.raw) { try { parsed = await simpleParser(String(b.raw)); } catch { return c.json({ error: 'Kunne ikke lese e-posten' }, 400); } }
  else parsed = { subject: String(b.subject ?? ''), text: String(b.text ?? ''), from: { text: String(b.from ?? 'transaction@notice.aliexpress.com'), value: [{ address: String(b.from ?? 'transaction@notice.aliexpress.com') }] }, date: b.date ?? new Date(), messageId: b.messageId ?? null };
  const u = c.get('user');
  if (b.uid && q('SELECT 1 FROM track_mail_seen WHERE user_id=? AND folder=? AND uid=?').get(u, 'api', String(b.uid))) return c.json({ found: 0, shipments: [], duplicate: true });
  const r = fromAliMail42(parsed, u, { uid: b.uid ? String(b.uid) : null, folder: folderOf(u) });
  if (b.uid) q('INSERT OR IGNORE INTO track_mail_seen(user_id, folder, uid, at) VALUES(?,?,?,?)').run(u, 'api', String(b.uid), Date.now());
  return c.json({ ...r, items: r.shipments.map((id) => trk42.view(trk42.byId(id))) });
});
export { sessionUser };
