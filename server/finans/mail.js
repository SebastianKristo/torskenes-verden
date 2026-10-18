// Kvitteringer fra e-post. Laget for Proton Mail via Proton Mail Bridge (IMAP med STARTTLS og selvsignert sertifikat),
// men virker mot vanlige IMAP-servere også.
// - Uleste e-poster i mappen (standard «Folders/Kvitteringer») leses med BODY.PEEK, så de ikke merkes lest før importen er ferdig.
// - Vedlegg (PDF, JPG, PNG, HEIC) blir kvitteringsjobber i samme kø som opplastinger. Uten vedlegg sendes teksten til AI-en.
// - Duplikatsjekk på Message-ID + sha256 (tabellen fh_mail_imports). Ferdige e-poster flyttes til «Lest»-mappen, ellers merkes de lest.
// - Sertifikatet pinnes ved første tilkobling (SHA-256), i stedet for å slå av sertifikatsjekken.
import net from 'node:net';
import tls from 'node:tls';
import { createHash } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db, kv, OWNER, settings, saveSettings, secret } from './db.js';

const q = (sql) => db.prepare(sql);
const MOCK = process.env.MOCK_DATA === '1';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const RECEIPT_MIME = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' };
const EXT_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif' };

export function mailConfig() {
  const st = settings();
  return { on: !!st.mailOn, host: st.imapHost, port: st.imapPort, security: st.imapSecurity, user: st.imapUser, folder: st.imapFolder,
    doneFolder: st.imapDoneFolder, poll: st.imapPollMinutes, finnFolder: st.imapFinnFolder, passSet: !!secret('imapPass'),
    pin: st.imapPin ? { fingerprint: st.imapPin.fingerprint, subject: st.imapPin.subject, at: st.imapPin.at } : null };
}
export const mailStatus = () => ({ running, ...kv.get(OWNER, 'fh_mail_status', { lastCheck: null, imported: 0, lastImported: 0, lastError: null, unseen: null }) });
const setStatus = (patch) => kv.set(OWNER, 'fh_mail_status', { ...mailStatus(), ...patch, running: undefined });

/* ---------------- Sertifikat ---------------- */

const toPem = (raw) => `-----BEGIN CERTIFICATE-----\n${raw.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;

// Leser sertifikatet serveren viser (direkte TLS eller etter STARTTLS) uten å stole på det.
export function probeCert({ host, port, security }, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, v) => { if (done) return; done = true; clearTimeout(timer); try { sock?.destroy(); plain?.destroy(); } catch { /* lukket */ } err ? reject(err) : resolve(v); };
    const timer = setTimeout(() => finish(Object.assign(new Error('Tidsavbrudd'), { code: 'ETIMEDOUT' })), timeout);
    let sock, plain;
    const upgrade = (opts) => {
      sock = tls.connect({ ...opts, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false }, () => {
        const c = sock.getPeerCertificate(true);
        if (!c?.raw) return finish(new Error('Serveren viste ikke noe sertifikat'));
        finish(null, { pem: toPem(c.raw), fingerprint: c.fingerprint256, subject: c.subject?.CN ?? '', issuer: c.issuer?.CN ?? '', authorized: sock.authorized, error: sock.authorizationError ? String(sock.authorizationError) : null, validTo: c.valid_to });
      });
      sock.on('error', finish);
    };
    if (security === 'tls') return upgrade({ host, port });
    plain = net.connect({ host, port });
    let buf = '', stage = 'greet';
    plain.on('error', finish);
    plain.on('data', (d) => {
      buf += d.toString('latin1');
      if (!buf.includes('\r\n')) return;
      if (stage === 'greet') { buf = ''; stage = 'starttls'; plain.write('a1 STARTTLS\r\n'); return; }
      if (stage === 'starttls' && /a1 /.test(buf)) {
        if (!/a1 OK/i.test(buf)) return finish(Object.assign(new Error('Serveren støtter ikke STARTTLS'), { code: 'NOSTARTTLS' }));
        plain.removeAllListeners('data'); stage = 'tls';
        upgrade({ socket: plain, host, port });
      }
    });
  });
}

// TLS-oppsett for ImapFlow: vanlig sjekk for offentlige sertifikater, pinnet sertifikat for selvsignerte (Bridge).
function tlsOptions(pin) {
  if (!pin?.pem) return {};
  return { ca: [pin.pem], checkServerIdentity: (_host, cert) => (cert.fingerprint256 === pin.fingerprint ? undefined : Object.assign(new Error('Sertifikatet stemmer ikke med det som er pinnet'), { code: 'PIN_MISMATCH' })) };
}

/* ---------------- Feilmeldinger ---------------- */

export function mailError(e, cfg = {}) {
  const code = e?.code ?? e?.cause?.code ?? '';
  const txt = `${e?.message ?? ''} ${e?.responseText ?? ''} ${e?.serverResponseCode ?? ''}`;
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(txt))
    return { code: 'auth', message: 'Innloggingen ble avvist (AUTHENTICATIONFAILED). Bruk Bridge-passordet fra «info» i Bridge, ikke Proton-passordet – eller Bridge er logget ut og må logges inn igjen.' };
  if (code === 'ECONNREFUSED') return { code: 'refused', message: `Tilkoblingen ble nektet på ${cfg.host}:${cfg.port}. Kjører Bridge? Fra en annen container er porten 143 (ikke 1143); med Bridge-appen på samme maskin er det 127.0.0.1:1143.` };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code: 'host', message: `Fant ikke verten «${cfg.host}». Fra Docker heter den vanligvis «protonmail-bridge» (samme nettverk som appen).` };
  if (code === 'ETIMEDOUT' || /timeout/i.test(txt)) return { code: 'timeout', message: `Ingen svar fra ${cfg.host}:${cfg.port} innen tidsfristen. Sjekk vert, port og at containerne er på samme nettverk.` };
  if (/NONEXISTENT|Mailbox doesn't exist|Unknown Mailbox|no such mailbox/i.test(txt))
    return { code: 'folder', message: `Fant ikke mappen «${cfg.folder}». I Proton heter egne mapper «Folders/<navn>» og etiketter «Labels/<navn>».` };
  if (code === 'PIN_MISMATCH') return { code: 'cert', message: 'Sertifikatet til serveren er endret siden det ble pinnet. Har du satt opp Bridge på nytt? Trykk «Glem sertifikat» og test igjen.' };
  if (/CERT|SELF_SIGNED|certificate/i.test(code + txt)) return { code: 'cert', message: `Sertifikatet kunne ikke verifiseres (${code || 'TLS'}). Bridge bruker et selvsignert sertifikat: test tilkoblingen én gang for å pinne det.` };
  if (code === 'NOSTARTTLS') return { code: 'starttls', message: 'Serveren støtter ikke STARTTLS. Velg «TLS» for port 993, eller «Ingen» bare på et lukket lokalnett.' };
  return { code: 'other', message: e?.message || 'Ukjent feil' };
}

/* ---------------- Tilkobling ---------------- */

function cfgWith(override = {}) {
  const c = mailConfig();
  return { ...c, ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined && v !== '')), pass: override.pass || secret('imapPass') };
}

// Pinner sertifikatet ved første tilkobling hvis det ikke kan verifiseres på vanlig måte (selvsignert, som hos Bridge).
async function ensurePin(c, { allowPin = true } = {}) {
  if (c.security === 'none') return null;
  const pin = settings().imapPin;
  if (pin?.pem && pin.host === `${c.host}:${c.port}`) return pin;
  const cert = await probeCert(c);
  if (cert.authorized) return null;                 // offentlig sertifikat: vanlig sjekk holder
  if (!allowPin) throw Object.assign(new Error(cert.error ?? 'Sertifikatet er ikke pinnet'), { code: 'CERT_NOT_PINNED' });
  const p = { host: `${c.host}:${c.port}`, pem: cert.pem, fingerprint: cert.fingerprint, subject: cert.subject, at: Date.now() };
  saveSettings({ imapPin: p });
  return { ...p, fresh: true };
}

async function connect(c, opts) {
  const pin = await ensurePin(c, opts);
  const client = new ImapFlow({
    host: c.host, port: +c.port, secure: c.security === 'tls', doSTARTTLS: c.security === 'starttls' ? true : c.security === 'none' ? false : undefined,
    auth: { user: c.user, pass: c.pass }, logger: false, tls: tlsOptions(pin), connectionTimeout: 10_000, greetingTimeout: 8_000, socketTimeout: 60_000,
  });
  client.on('error', () => { /* håndteres av kallene */ });
  await client.connect();
  return { client, pin };
}

// «Test tilkobling»: koble til, STARTTLS, LOGIN, LIST, SELECT mappen og tell uleste.
export async function testMail(override = {}) {
  const c = cfgWith(override);
  if (MOCK && !c.host) return { ok: true, mock: true, message: 'Demodata (MOCK_DATA=1) – ingen ekte tilkobling', unseen: 3, folders: ['INBOX', 'Folders/Kvitteringer', 'Folders/Kvitteringer/Lest'] };
  if (!c.host || !c.user) return { ok: false, code: 'missing', message: 'Fyll inn vert og brukernavn.' };
  if (!c.pass) return { ok: false, code: 'missing', message: 'Bridge-passordet mangler.' };
  let client;
  try {
    const r = await connect(c);
    client = r.client;
    const folders = (await client.list()).map((f) => f.path);
    const st = await client.status(c.folder, { unseen: true, messages: true });
    const done = c.doneFolder && !folders.includes(c.doneFolder) ? ` Mappen «${c.doneFolder}» finnes ikke – e-poster merkes bare som lest.` : '';
    setStatus({ unseen: st.unseen });
    return { ok: true, unseen: st.unseen, messages: st.messages, folders: folders.slice(0, 60),
      pinned: r.pin ? { fingerprint: r.pin.fingerprint, fresh: !!r.pin.fresh } : null,
      message: `Tilkoblet ${c.host}:${c.port}. ${st.unseen} uleste av ${st.messages} i «${c.folder}».${r.pin?.fresh ? ' Sertifikatet er pinnet.' : ''}${done}` };
  } catch (e) {
    return { ok: false, ...mailError(e, c), folders: undefined };
  } finally { await client?.logout().catch(() => client?.close()); }
}

/* ---------------- Import ---------------- */

const htmlText = (html) => String(html ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
export const mailText = (parsed) => (parsed.text?.trim() ? parsed.text : htmlText(parsed.html)).slice(0, 20000);

export function receiptAttachments(parsed) {
  return (parsed.attachments ?? []).map((a) => {
    const ext = String(a.filename ?? '').split('.').pop().toLowerCase();
    const mime = RECEIPT_MIME[a.contentType?.toLowerCase()] ? (a.contentType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : a.contentType.toLowerCase())
      : a.contentType === 'application/octet-stream' && EXT_MIME[ext] ? EXT_MIME[ext] : null;
    return mime && a.content?.length > 200 && a.related !== true ? { mime, name: a.filename || `vedlegg.${RECEIPT_MIME[mime]}`, content: a.content } : null;
  }).filter(Boolean);
}

const seen = q('SELECT 1 FROM fh_mail_imports WHERE message_id=? AND sha256=?');
const logImport = q('INSERT OR IGNORE INTO fh_mail_imports(message_id,sha256,receipt_id,folder,sender,subject,received_at,status,error,created) VALUES(?,?,?,?,?,?,?,?,?,?)');

// Behandler én e-post. ingest({buffer, mime, name, meta}) lager kvitteringsjobben og gir id-en tilbake.
export async function importMessage(source, { folder, ingest }) {
  const parsed = await simpleParser(source);
  const messageId = parsed.messageId || `sha:${sha256(source)}`;
  const meta = { from: parsed.from?.text ?? '', subject: parsed.subject ?? '', messageId, date: parsed.date?.toISOString() ?? null };
  const recv = parsed.date?.getTime() ?? Date.now();
  const atts = receiptAttachments(parsed);
  let imported = 0, skipped = 0;
  const items = atts.length ? atts : (() => { const t = mailText(parsed); return t.length >= 30 ? [{ mime: 'text/plain', name: `${(meta.subject || 'e-post').slice(0, 60)}.txt`, content: Buffer.from(`Fra: ${meta.from}\nEmne: ${meta.subject}\nDato: ${meta.date ?? ''}\n\n${t}`, 'utf8') }] : []; })();
  for (const it of items) {
    const h = sha256(it.content);
    if (seen.get(messageId, h)) { skipped++; continue; }
    const id = await ingest({ buffer: it.content, mime: it.mime, name: it.name, meta });
    logImport.run(messageId, h, id, folder, meta.from.slice(0, 200), meta.subject.slice(0, 200), recv, 'imported', null, Date.now());
    imported++;
  }
  return { messageId, imported, skipped, empty: !items.length, meta };
}

// Finn-e-poster (Trygg betaling, Fiks ferdig, Tillit) som havner i kvitteringsmappen går til Finn-handler i stedet.
export function looksLikeFinn(parsed) {
  const from = String(parsed.from?.text ?? '').toLowerCase();
  const t = `${parsed.subject ?? ''} ${mailText(parsed)}`;
  return /@(\w+\.)?finn\.no\b/.test(from) || (/\bfinn(\.no)?\b/i.test(t) && /fiks ferdig|trygg betaling|tillit forsikring/i.test(t));
}

// Kobler e-poster fra FINN, Posten/Bring og Tillit til Finn-handlene (Finn-kode, ordre-/sporingsnummer eller varenavn).
// Leser «All Mail» hvis Bridge viser den (ellers INBOX), bare nye UID-er siden forrige runde; første gang de siste 120 dagene.
const FINN_FROM = ['finn.no', 'posten', 'bring', 'tillit'];
async function scanFinnMails(client, folders, finnLink) {
  if (!q('SELECT 1 FROM fh_finn LIMIT 1').get()) return 0;
  const box = folders.includes('All Mail') ? 'All Mail' : 'INBOX';
  const state = kv.get(OWNER, 'fh_finn_scan', {});
  const lock = await client.getMailboxLock(box);
  let linked = 0;
  try {
    const mb = client.mailbox, prev = state[box];
    const fresh = !prev || String(prev.validity) !== String(mb.uidValidity);
    const crit = { or: FINN_FROM.map((from) => ({ from })) };
    if (fresh) crit.since = new Date(Date.now() - 120 * 86400_000); else crit.uid = `${prev.lastUid + 1}:*`;
    const uids = ((await client.search(crit, { uid: true })) || []).filter((u) => fresh || u > prev.lastUid).slice(-200);
    for (const uid of uids) {
      try { const msg = await client.fetchOne(String(uid), { source: true }, { uid: true }); linked += finnLink(await simpleParser(msg.source)); } catch { /* hopp over */ }
    }
    kv.set(OWNER, 'fh_finn_scan', { ...state, [box]: { validity: String(mb.uidValidity), lastUid: Math.max(prev && !fresh ? prev.lastUid : 0, Number(mb.uidNext ?? 1) - 1, ...uids) } });
  } finally { lock.release(); }
  return linked;
}

// Import av tidligere Finn-e-poster (Innstillinger → Import → Finn.no): henter ALLE e-poster fra FINN, Posten/Bring og
// Tillit i «All Mail» (ellers INBOX), eldste først, uten å endre noe i postkassen. Gir de rå kildene tilbake (maks `max`).
export async function fetchAllFinnMails({ max = 400 } = {}) {
  const c = cfgWith();
  if (!c.host || !c.user || !c.pass) return { ok: false, sources: [], message: 'E-post er ikke satt opp. Fyll inn Proton Mail Bridge under «Kvitteringer fra e-post».' };
  let client;
  const sources = [];
  try {
    ({ client } = await connect(c, { allowPin: true }));
    const folders = (await client.list()).map((f) => f.path);
    const box = folders.includes('All Mail') ? 'All Mail' : 'INBOX';
    const lock = await client.getMailboxLock(box);
    try {
      const uids = ((await client.search({ or: FINN_FROM.map((from) => ({ from })) }, { uid: true })) || []).sort((a, b) => a - b).slice(-max);
      for (const uid of uids) {
        try { const msg = await client.fetchOne(String(uid), { source: true }, { uid: true }); if (msg?.source) sources.push(msg.source); } catch { /* hopp over én e-post */ }
      }
    } finally { lock.release(); }
    return { ok: true, sources, box };
  } catch (e) {
    return { ok: false, sources, message: mailError(e, c).message };
  } finally {
    await client?.logout().catch(() => client?.close());
  }
}

// Sporing: leser nye e-poster i «All Mail» (ellers INBOX) som ligner ordre- eller fraktbekreftelser, og gir dem
// til onMail(parsed). Første gang de siste 30 dagene, deretter bare nye UID-er. Endrer ingenting i postkassen.
const SHIP_SUBJECT = ['sendt', 'sporing', 'pakke', 'levering', 'på vei', 'shipped', 'tracking', 'delivery', 'ordre', 'order', 'hentes', 'hentested', 'forsendelse'];
export async function scanShippingMails(onMail, { max = 150 } = {}) {
  const c = cfgWith();
  if (!c.host || !c.user || !c.pass) return { ok: false, scanned: 0, message: 'E-post er ikke satt opp' };
  let client, scanned = 0, found = 0;
  try {
    ({ client } = await connect(c, { allowPin: true }));
    const folders = (await client.list()).map((f) => f.path);
    const box = folders.includes('All Mail') ? 'All Mail' : 'INBOX';
    const state = kv.get(OWNER, 'trk_mail_scan', {});
    const lock = await client.getMailboxLock(box);
    try {
      const mb = client.mailbox, prev = state[box];
      const fresh = !prev || String(prev.validity) !== String(mb.uidValidity);
      const crit = { or: SHIP_SUBJECT.map((subject) => ({ subject })) };
      if (fresh) crit.since = new Date(Date.now() - 30 * 86400_000); else crit.uid = `${prev.lastUid + 1}:*`;
      const uids = ((await client.search(crit, { uid: true })) || []).filter((u) => fresh || u > prev.lastUid).slice(-max);
      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          scanned++; found += (await onMail(await simpleParser(msg.source))) || 0;
        } catch { /* hopp over én e-post */ }
      }
      kv.set(OWNER, 'trk_mail_scan', { ...state, [box]: { validity: String(mb.uidValidity), lastUid: Math.max(prev && !fresh ? prev.lastUid : 0, Number(mb.uidNext ?? 1) - 1, ...uids) } });
    } finally { lock.release(); }
    return { ok: true, scanned, found };
  } catch (e) {
    return { ok: false, scanned, found, message: mailError(e, c).message };
  } finally {
    await client?.logout().catch(() => client?.close());
  }
}

let running = false;
// Én runde: hent e-post fra kvitteringsmappen (og uleste fra Finn-mappen), importer og flytt/merk.
export async function runMail({ ingest, finn, finnLink } = {}) {
  if (running) return { ...mailStatus(), busy: true, ok: false, message: 'En henting pågår allerede – vent litt og prøv igjen' };
  const c = cfgWith();
  if (!c.host || !c.user || !c.pass) return { ok: false, message: 'E-post er ikke satt opp' };
  running = true;
  let client, imported = 0, errors = 0, lastError = null;
  try {
    ({ client } = await connect(c, { allowPin: true }));
    const folders = (await client.list()).map((f) => f.path);
    const jobs = [[c.folder, 'receipt'], ...(c.finnFolder && finn ? [[c.finnFolder, 'finn']] : [])];
    for (const [folder, kind] of jobs) {
      const lock = await client.getMailboxLock(folder);
      try {
        // Med «Lest»-mappe flyttes ferdige e-poster ut, så alt som ligger i mappen hentes – også e-post du har åpnet.
        // Duplikater stoppes av fh_mail_imports. Uten ferdig-mappe brukes «ulest» som markør.
        const all = kind === 'receipt' && folders.includes(c.doneFolder);
        const uids = (await client.search(all ? { all: true } : { seen: false }, { uid: true })) || [];
        for (const uid of uids.slice(0, 50)) {
          try {
            const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
            const parsed = kind === 'receipt' && finn ? await simpleParser(msg.source) : null;
            if (kind === 'finn' || (parsed && looksLikeFinn(parsed))) { const p = parsed ?? await simpleParser(msg.source); await finn(mailText(p), p); imported++; }
            else imported += (await importMessage(msg.source, { folder, ingest })).imported;
            const target = kind === 'receipt' ? c.doneFolder : null;
            if (target && folders.includes(target)) await client.messageMove(String(uid), target, { uid: true });
            else await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          } catch (e) {
            errors++; lastError = `${folder} #${uid}: ${e.message}`;
            logImport.run(`uid:${folder}:${uid}`, sha256(lastError), null, folder, '', '', Date.now(), 'error', e.message.slice(0, 300), Date.now());
          }
        }
      } finally { lock.release(); }
    }
    let linked = 0;
    if (finnLink) { try { linked = await scanFinnMails(client, folders, finnLink); } catch (e) { lastError ??= `Finn-e-poster: ${e.message}`; } }
    const st = mailStatus();
    setStatus({ lastCheck: Date.now(), imported: (st.imported ?? 0) + imported, lastImported: imported, lastError, unseen: null, finnLinked: (st.finnLinked ?? 0) + linked });
    const msg = (imported ? `${imported} e-post${imported === 1 ? '' : 'er'} importert` : errors ? 'Ingenting importert' : 'Ingen nye e-poster') + (linked ? ` · ${linked} e-post${linked === 1 ? '' : 'er'} koblet til Finn-handler` : '');
    return { ok: !errors || imported > 0, imported, errors, linked, lastError, message: errors ? `${msg} – ${errors} feilet: ${lastError}` : msg };
  } catch (e) {
    const m = mailError(e, c);
    setStatus({ lastCheck: Date.now(), lastError: m.message });
    return { ok: false, ...m };
  } finally {
    running = false;
    await client?.logout().catch(() => client?.close());
  }
}

export const recentImports = () => q('SELECT message_id AS messageId, receipt_id AS receiptId, folder, sender, subject, received_at AS receivedAt, status, error, created FROM fh_mail_imports ORDER BY created DESC LIMIT 20').all();

// Bakgrunnsjobb: sjekker hvert minutt om det er tid for en ny runde (IMAP_POLL_MINUTES).
let timer = null;
export function startMailWorker(deps) {
  if (timer || MOCK) return;
  timer = setInterval(() => {
    const c = mailConfig();
    if (!c.on || !c.host) return;
    const last = mailStatus().lastCheck ?? 0;
    if (Date.now() - last >= Math.max(1, c.poll) * 60_000) runMail(deps).catch(() => {});
  }, 60_000);
  timer.unref?.();
}
