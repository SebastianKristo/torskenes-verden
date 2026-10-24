// Logoer og ✦ AI-sammendrag for transaksjoner og kvitteringer.
// Butikknavn → domene (fast liste, lærte koblinger, så AI) → favicon som caches på disk.
// Sammendrag: heuristikk straks, AI fyller inn kort og lang tekst i bakgrunnen.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db, OWNER, kv } from '../db.js';
import { config } from '../config.js';
import { settings, me } from './db.js';
import { runAsUser } from '../settings.js';
import { askJson } from './ai.js';
import { externalBlocked48 } from '../receipts48/settings.js'; // prompt 48: «Finansdata forlater aldri huset»
import { matchMerchant, fileForDomain, isManualDomain } from '../logos/match.js';

const q = (sql) => db.prepare(sql);

const DOMAINS = {
  ruter: 'ruter.no', 'lånekass': 'lanekassen.no', lanekass: 'lanekassen.no', vipps: 'vipps.no', akademika: 'akademika.no', proton: 'proton.me',
  biltema: 'biltema.no', bilema: 'biltema.no', rema: 'rema.no', 'clas ohlson': 'clasohlson.com', circle: 'circlek.no', fjordkraft: 'fjordkraft.no',
  kaffebrenneriet: 'kaffebrenneriet.no', netflix: 'netflix.com', spotify: 'spotify.com', icloud: 'apple.com', apple: 'apple.com', viaplay: 'viaplay.no',
  chatgpt: 'openai.com', openai: 'openai.com', claude: 'claude.ai', anthropic: 'anthropic.com', cloudflare: 'cloudflare.com', 'elkjøp': 'elkjop.no', elkjop: 'elkjop.no',
  ikea: 'ikea.com', 'power ': 'power.no', jysk: 'jysk.no', finn: 'finn.no', kiwi: 'kiwi.no', meny: 'meny.no', coop: 'coop.no', 'obs ': 'coop.no', 'extra ': 'coop.no',
  xxl: 'xxl.no', sats: 'sats.no', telenor: 'telenor.no', telia: 'telia.no', 'ice ': 'ice.no', hellofresh: 'hellofresh.no', peppes: 'peppes.no',
  'bank norwegian': 'banknorwegian.no', dnb: 'dnb.no', disney: 'disneyplus.com', 'hbo ': 'max.com', youtube: 'youtube.com', google: 'google.com',
  amazon: 'amazon.com', komplett: 'komplett.no', zalando: 'zalando.no', foodora: 'foodora.no', wolt: 'wolt.com', 'vy ': 'vy.no', flytoget: 'flytoget.no',
  norwegian: 'norwegian.no', 'sas ': 'flysas.com', tesla: 'tesla.com', 'mer ': 'mer.eco', recharge: 'recharge.no', 'kiwi ': 'kiwi.no', joker: 'joker.no',
  bunnpris: 'bunnpris.no', europris: 'europris.no', 'normal ': 'normal.no', 'apotek 1': 'apotek1.no', vitusapotek: 'vitusapotek.no', boots: 'boots.no',
  'tilbords': 'tilbords.no', 'kid ': 'kid.no', 'nille': 'nille.no', 'skeidar': 'skeidar.no', 'jernia': 'jernia.no', 'obs bygg': 'coop.no', 'byggmax': 'byggmax.no',
  'montér': 'monter.no', 'maxbo': 'maxbo.no', 'esso': 'esso.no', 'shell': 'shell.no', 'uno-x': 'unox.no', 'st1': 'st1.no', 'fjellsport': 'fjellsport.no',
  'g-sport': 'gsport.no', 'intersport': 'intersport.no', 'stormberg': 'stormberg.no', 'h&m': 'hm.com', 'cubus': 'cubus.com', 'dressmann': 'dressmann.com',
  'kaffe': null, 'lønn': null, 'husleie': null, 'overføring': null,
};
// Flere vanlige tjenester og butikker (strømming, programvare, aviser, levering, trening, telefon, strøm, forsikring, bank, transport, spill).
Object.assign(DOMAINS, {
  tv2: 'tv2.no', 'tv 2': 'tv2.no', nrk: 'nrk.no', 'max ': 'max.com', 'hbo max': 'max.com', 'disney+': 'disneyplus.com', 'prime video': 'primevideo.com', 'amazon prime': 'amazon.com',
  'apple tv': 'apple.com', 'apple music': 'apple.com', 'apple one': 'apple.com', 'app store': 'apple.com', 'itunes': 'apple.com', skyshowtime: 'skyshowtime.com', 'discovery+': 'discoveryplus.com',
  discovery: 'discoveryplus.com', strim: 'strim.no', 'allente': 'allente.no', 'riks': 'riks.no', 'paramount': 'paramountplus.com', crunchyroll: 'crunchyroll.com', twitch: 'twitch.tv',
  tidal: 'tidal.com', deezer: 'deezer.com', 'youtube premium': 'youtube.com', soundcloud: 'soundcloud.com', audible: 'audible.com', storytel: 'storytel.com', bookbeat: 'bookbeat.no', nextory: 'nextory.no',
  squarespace: 'squarespace.com', wix: 'wix.com', wordpress: 'wordpress.com', shopify: 'shopify.com', webflow: 'webflow.com', godaddy: 'godaddy.com', namecheap: 'namecheap.com', domeneshop: 'domeneshop.no', 'one.com': 'one.com',
  github: 'github.com', gitlab: 'gitlab.com', vercel: 'vercel.com', netlify: 'netlify.com', heroku: 'heroku.com', 'digitalocean': 'digitalocean.com', hetzner: 'hetzner.com', 'aws ': 'aws.amazon.com', 'amazon web services': 'aws.amazon.com',
  microsoft: 'microsoft.com', 'office 365': 'microsoft.com', 'microsoft 365': 'microsoft.com', onedrive: 'microsoft.com', xbox: 'xbox.com', adobe: 'adobe.com', figma: 'figma.com', canva: 'canva.com', notion: 'notion.so',
  dropbox: 'dropbox.com', 'google one': 'google.com', 'google play': 'play.google.com', 'google storage': 'google.com', gemini: 'gemini.google.com', perplexity: 'perplexity.ai', midjourney: 'midjourney.com', mistral: 'mistral.ai', groq: 'groq.com',
  jetbrains: 'jetbrains.com', '1password': '1password.com', bitwarden: 'bitwarden.com', lastpass: 'lastpass.com', nordvpn: 'nordvpn.com', mullvad: 'mullvad.net', expressvpn: 'expressvpn.com', surfshark: 'surfshark.com',
  grammarly: 'grammarly.com', todoist: 'todoist.com', slack: 'slack.com', zoom: 'zoom.us', discord: 'discord.com', linkedin: 'linkedin.com', duolingo: 'duolingo.com', 'chess.com': 'chess.com', strava: 'strava.com',
  plex: 'plex.tv', jellyfin: 'jellyfin.org', 'home assistant': 'home-assistant.io', nabu: 'nabucasa.com', unifi: 'ui.com', ubiquiti: 'ui.com', synology: 'synology.com', backblaze: 'backblaze.com', tailscale: 'tailscale.com',
  playstation: 'playstation.com', 'psn': 'playstation.com', nintendo: 'nintendo.com', steam: 'steampowered.com', 'epic games': 'epicgames.com', 'ea ': 'ea.com', ubisoft: 'ubisoft.com', blizzard: 'blizzard.com', 'battle.net': 'blizzard.com', 'riot': 'riotgames.com',
  aftenposten: 'aftenposten.no', 'vg+': 'vg.no', 'vg ': 'vg.no', dagbladet: 'dagbladet.no', e24: 'e24.no', 'dn ': 'dn.no', 'dagens næringsliv': 'dn.no', 'bergens tidende': 'bt.no', 'adresseavisen': 'adressa.no', 'stavanger aftenblad': 'aftenbladet.no',
  'morgenbladet': 'morgenbladet.no', 'klassekampen': 'klassekampen.no', 'finansavisen': 'finansavisen.no', 'tek.no': 'tek.no', 'schibsted': 'schibsted.com', 'amedia': 'amedia.no', 'nytimes': 'nytimes.com', 'the economist': 'economist.com',
  uber: 'uber.com', bolt: 'bolt.eu', 'voi ': 'voi.com', tier: 'tier.app', ryde: 'ryde.no', getaround: 'getaround.com', 'hertz': 'hertz.no', 'avis ': 'avis.no', 'sixt': 'sixt.no', 'easypark': 'easypark.no', 'apcoa': 'apcoa.no', 'onepark': 'onepark.no',
  'bompenger': 'autopass.no', autopass: 'autopass.no', 'fjellinjen': 'fjellinjen.no', skyss: 'skyss.no', atb: 'atb.no', kolumbus: 'kolumbus.no', 'entur': 'entur.no', widerøe: 'wideroe.no', wideroe: 'wideroe.no', 'klm': 'klm.com',
  'elixia': 'elixia.no', 'evo ': 'evofitness.no', 'fresh fitness': 'freshfitness.no', '3t': '3t.no', 'actic': 'actic.no', 'spenst': 'spenst.no', 'friskis': 'friskissvettis.no',
  talkmore: 'talkmore.no', chili: 'chilimobil.no', onecall: 'onecall.no', 'mycall': 'mycall.no', altibox: 'altibox.no', 'telia ': 'telia.no', 'get ': 'telia.no', 'nextgentel': 'nextgentel.no', 'starlink': 'starlink.com', 'fiberbredbånd': null,
  tibber: 'tibber.com', elvia: 'elvia.no', hafslund: 'hafslund.no', fortum: 'fortum.no', lyse: 'lyse.no', 'norgesenergi': 'norgesenergi.no', 'gudbrandsdal energi': 'ge.no', 'kraftriket': 'kraftriket.no', 'motkraft': 'motkraft.no',
  gjensidige: 'gjensidige.no', 'if skadeforsikring': 'if.no', 'if forsikring': 'if.no', tryg: 'tryg.no', frende: 'frende.no', fremtind: 'fremtind.no', storebrand: 'storebrand.no', 'codan': 'codan.no', 'eika forsikring': 'eika.no', 'landkreditt': 'landkreditt.no',
  nordea: 'nordea.no', 'sparebank 1': 'sparebank1.no', sparebank1: 'sparebank1.no', handelsbanken: 'handelsbanken.no', sbanken: 'sbanken.no', 'danske bank': 'danskebank.no', 'eika': 'eika.no', klarna: 'klarna.com', paypal: 'paypal.com',
  'santander': 'santander.no', 'komplett bank': 'komplettbank.no', 'instabank': 'instabank.no', 'resurs': 'resursbank.no', 'collector': 'collector.no', 'nordnet': 'nordnet.no', 'trading 212': 'trading212.com', 'firi': 'firi.com', 'kron': 'kron.no',
  'lånekassen': 'lanekassen.no', skatteetaten: 'skatteetaten.no', 'nav ': 'nav.no', 'posten': 'posten.no', 'bring': 'bring.no', 'postnord': 'postnord.no', 'dhl': 'dhl.com', 'helthjem': 'helthjem.no', 'budbee': 'budbee.com', 'instabox': 'instabox.io',
  'oda ': 'oda.com', 'oda.com': 'oda.com', 'morgenlevering': 'morgenlevering.no', 'adams matkasse': 'adamsmatkasse.no', 'godtlevert': 'godtlevert.no', 'just eat': 'just-eat.no', 'mcdonald': 'mcdonalds.no', 'burger king': 'burgerking.no',
  'max burger': 'max.se', 'starbucks': 'starbucks.no', 'espresso house': 'espressohouse.com', 'deli de luca': 'delideluca.no', '7-eleven': '7-eleven.no', 'narvesen': 'narvesen.no', 'vinmonopolet': 'vinmonopolet.no', 'spar ': 'spar.no',
  'prisma': 'prisma.no', 'mega ': 'coop.no', 'prix ': 'coop.no', 'rema 1000': 'rema.no', 'elkjop': 'elkjop.no', 'power.no': 'power.no', 'netonnet': 'netonnet.no', 'multicom': 'multicom.no', 'proshop': 'proshop.no', 'dustin': 'dustin.no',
  'clas ohlson': 'clasohlson.com', 'jula': 'jula.no', 'plantasjen': 'plantasjen.no', 'princess': 'princess.no', 'kitchn': 'kitchn.no', 'tilbords': 'tilbords.no', 'søstrene grene': 'sostrenegrene.com', 'flying tiger': 'flyingtiger.com',
  'zara': 'zara.com', 'lindex': 'lindex.com', 'kappahl': 'kappahl.com', 'bik bok': 'bikbok.com', 'carlings': 'carlings.com', 'vero moda': 'veromoda.com', 'jack & jones': 'jackjones.com', 'nike': 'nike.com', 'adidas': 'adidas.no',
  'sport 1': 'sport1.no', 'sport1': 'sport1.no', 'anton sport': 'antonsport.no', 'bergans': 'bergans.com', 'norrøna': 'norrona.com', 'boozt': 'boozt.com', 'nelly': 'nelly.com', 'ellos': 'ellos.no', 'temu': 'temu.com', 'aliexpress': 'aliexpress.com', 'ebay': 'ebay.com', 'etsy': 'etsy.com',
  'norli': 'norli.no', 'ark bokhandel': 'ark.no', 'adlibris': 'adlibris.com', 'cdon': 'cdon.no', 'apotek': null, 'legekontor': null, 'tannlege': null,
});
// ISO2: lærte koblinger butikk → domene er per bruker.
const learned = (u = me()) => kv.get(u, 'fh_domains', {}) ?? {};
const DOMAIN_RE = /^(?=.{3,80}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const validDomain = (d) => typeof d === 'string' && DOMAIN_RE.test(d.toLowerCase()) ? d.toLowerCase() : null;

const keyOf = (name) => String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
// Synkron oppslag: lærte koblinger først, så den faste listen. null = ukjent (vis initial).
export function domainFor(name) {
  const l = ' ' + keyOf(name) + ' ';
  if (l.trim().length < 2) return null;
  // Prompt 20: det interne logobiblioteket først (banktekster som «VIPPS*KIWI 123» og «IZ *RUTER»).
  const hit = matchMerchant(name);
  if (hit?.domene) return hit.domene;
  const L = learned();
  for (const [k, v] of Object.entries(L)) if (l.includes(' ' + k + ' ') || l.trim() === k) return v;
  let best, len = 0;
  for (const [k, v] of Object.entries(DOMAINS)) if (k.length > len && l.includes(' ' + k)) { best = v; len = k.length; }
  if (best !== undefined) return best;
  // Skrivefeil i ett ord (f.eks. «Claue», «Netflx»): ett tegn feil mot et kjent navn på minst fem bokstaver.
  for (const w of l.trim().split(' ').filter((x) => x.length >= 5)) {
    for (const [k, v] of Object.entries(DOMAINS)) if (v && k.length >= 5 && !k.includes(' ') && editsOne(w, k)) return v;
  }
  return null;
}
// true når a og b er like bortsett fra ett tegn (bytt, lagt til eller fjernet).
function editsOne(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
export function learnDomain(name, domain) {
  const k = keyOf(name).split(' ').slice(0, 3).join(' ');
  const d = domain === null ? null : validDomain(domain);
  if (!k || (domain !== null && !d)) return;
  const u = me();
  kv.set(u, 'fh_domains', { ...learned(u), [k]: d });
}

/* ---------------- Logo-cache ---------------- */

const LOGOS = resolve(config.dataDir, 'logos');
const MAX_AGE = 30 * 86400_000;
const inflight = new Map();
export async function logo(domain) {
  const d = validDomain(domain);
  if (!d) return null;
  // Prompt 20: ferdig nedlastet logo fra biblioteket (server/logos/files) før cache og nett.
  const bundled = fileForDomain(d);
  if (bundled) { try { return await readFile(bundled); } catch { /* fjernet etter oppstart */ } }
  if (isManualDomain(d)) return null; // prompt 22: manuelt kontrollert logo (f.eks. Posten) får aldri et tilfeldig favicon
  const file = join(LOGOS, d + '.png');
  try { const s = await stat(file); if (Date.now() - s.mtimeMs < MAX_AGE) return s.size ? await readFile(file) : null; } catch { /* mangler */ }
  // Prompt 48 (PRIV48): butikkdomenet sendes ikke til Googles favicon-tjeneste når sperren er på (klienten viser bokstavikon).
  // Ingen tom cachefil skrives, så logoen hentes når sperren slås av.
  if (externalBlocked48().blocked) return null;
  if (inflight.has(d)) return inflight.get(d);
  const p = (async () => {
    try {
      const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
      await mkdir(LOGOS, { recursive: true });
      await writeFile(file, buf.length < 200_000 ? buf : Buffer.alloc(0)); // tom fil = «ingen logo», prøves igjen etter 30 dager
      return buf.length ? buf : null;
    } catch { return null; } finally { inflight.delete(d); }
  })();
  inflight.set(d, p);
  return p;
}

/* ---------------- Sammendrag ---------------- */

const CAT_TEXT = {
  'Mat og dagligvarer': 'Dagligvarer', 'Restaurant og kafé': 'Mat ute', 'Transport og lading': 'Transport', Bolig: 'Bolig og faste boutgifter',
  Hjem: 'Til hjemmet', 'Fritid og hobby': 'Fritid', Abonnementer: 'Abonnement, fast trekk', Skole: 'Skole og studier', Inntekt: 'Innbetaling', Sparing: 'Overført til sparing',
  Overføring: 'Overføring mellom kontoer',
};
const HINTS = [[/lading|recharge|mer\b|circle k.*lad/i, 'Lading av elbil'], [/strøm|fjordkraft|tibber|kraft/i, 'Strømregning'], [/husleie/i, 'Husleie for måneden'],
  [/lønn/i, 'Lønnsutbetaling'], [/lånekass/i, 'Utbetaling fra Lånekassen'], [/vipps/i, 'Vipps-overføring'], [/ruter|vy\b|flytoget/i, 'Kollektivbillett'],
  [/kaffe|espresso/i, 'Kaffe og bakst'], [/netflix|viaplay|disney|hbo|max\b/i, 'Strømmetjeneste, månedlig trekk'], [/spotify/i, 'Musikkabonnement'],
  [/icloud/i, 'Lagringsplass i iCloud'], [/finn/i, 'Finn-handel'], [/nedbetaling|innbetaling fra/i, 'Nedbetaling av kredittkort']];

export function heuristic({ merchant, amount, lines, category }) {
  const name = String(merchant ?? '');
  const items = (lines ?? []).map((l) => l.description).filter(Boolean);
  let short;
  if (items.length) {
    short = items.slice(0, 3).join(', ') + (items.length > 3 ? ` + ${items.length - 3} til` : '');
  } else {
    short = HINTS.find(([r]) => r.test(name))?.[1] ?? CAT_TEXT[category] ?? null;
  }
  if (short && short.length > 60) short = short.slice(0, 57).trimEnd() + ' …';
  let long = null;
  if (short) {
    const kr = amount != null ? `${Math.abs(amount).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr` : '';
    long = `${amount != null && amount > 0 ? 'Innbetaling' : 'Kjøp'} hos ${name || 'ukjent'}${kr ? ' på ' + kr : ''}.`
      + (items.length ? ` Kvitteringen har ${items.length} varelinje${items.length === 1 ? '' : 'r'}: ${items.slice(0, 6).join(', ')}.` : '')
      + (category ? ` Kategorisert som ${category.toLowerCase()}.` : '');
  }
  return { short, long };
}

const SUM_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, short: { type: 'string' }, long: { type: 'string' }, domain: { type: 'string', nullable: true }, category: { type: 'string', nullable: true },
  }, required: ['id', 'short', 'long'] } } },
  required: ['items'],
};
const SUM_PROMPT = (rows, cats) => `Du skriver korte norske beskrivelser av banktransaksjoner og kvitteringer for en personlig økonomiapp.
For hver post:
- short: én linje, maks 60 tegn, hva kjøpet trolig var (ikke gjenta butikknavnet, ingen beløp).
- long: 2–3 setninger med mer detalj, basert på varelinjer hvis de finnes. Ikke dikt opp detaljer du ikke vet.
- domain: mest sannsynlige nettsted for butikken/tjenesten (f.eks. biltema.no), eller null for privatpersoner/ukjent.
- category: hvis "category" mangler, foreslå én fra: ${cats.join(', ')}. Ellers null.
Returner JSON {"items":[...]} med samme id.
Poster:
${JSON.stringify(rows)}`;

// Bakgrunnsjobb: henter poster uten AI-tekst i små batcher. Ved feil (AI nede) venter den lenger før neste forsøk.
let running = false, backoff = 0, timer = null;
export function kick(delay = 1500) {
  if (timer) return;
  timer = setTimeout(() => { timer = null; run(); }, delay);
  timer.unref?.();
}
// ISO2: jobben går per bruker (egne kategorier, egne lærte domener, egen AI-logg og brukerens eget aiSummaries-valg).
async function run() {
  if (running || process.env.MOCK_DATA === '1') return;
  if (Date.now() < backoff) return kick(backoff - Date.now());
  const users = q('SELECT DISTINCT user_id FROM fh_transactions WHERE ai_done=0 AND user_id IS NOT NULL').pluck().all().filter((u) => settings(u).aiSummaries);
  const u = users[0];
  if (!u) return;
  running = true;
  try { await runAsUser(u, () => runFor(u)); } finally { running = false; }
}
async function runFor(u) {
  try {
    const cats = q("SELECT id, name FROM fh_categories WHERE user_id=? ORDER BY sort").all(u);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const rows = q(`SELECT t.id, t.description, t.merchant, t.amount, t.category_id, r.extraction FROM fh_transactions t
      LEFT JOIN fh_receipts r ON r.transaction_id=t.id AND r.status='booked' WHERE t.ai_done=0 AND t.user_id=? ORDER BY t.date DESC LIMIT 15`).all(u);
    if (!rows.length) return;
    const input = rows.map((r) => ({ id: String(r.id), text: r.merchant || r.description, raw: r.description !== r.merchant ? r.description : undefined, amount: r.amount / 100,
      category: catName.get(r.category_id) ?? null, lines: r.extraction ? (JSON.parse(r.extraction).lines ?? []).slice(0, 15).map((l) => l.description) : undefined }));
    const res = await askJson(SUM_PROMPT(input, cats.map((c) => c.name)), SUM_SCHEMA, { timeout: 90_000, task: 'categorize' });
    const upd = q('UPDATE fh_transactions SET ai_short=?, ai_long=?, domain=COALESCE(domain, ?), category_id=COALESCE(category_id, ?), ai_done=1 WHERE id=? AND user_id=?');
    const byId = new Map((res.items ?? []).map((x) => [String(x.id), x]));
    db.transaction(() => {
      for (const r of rows) {
        const x = byId.get(String(r.id));
        const catId = x?.category ? cats.find((c) => c.name.toLowerCase() === String(x.category).toLowerCase())?.id ?? null : null;
        const dom = validDomain(x?.domain);
        if (dom && !domainFor(r.merchant || r.description)) learnDomain(r.merchant || r.description, dom);
        upd.run(x?.short?.slice(0, 80) || null, x?.long?.slice(0, 600) || null, dom, catId, r.id, u);
      }
    })();
    backoff = 0;
    kick(500);
  } catch (e) {
    console.warn('[finans] AI-sammendrag:', e.message);
    backoff = Date.now() + 10 * 60_000;
  }
}
setTimeout(() => kick(0), 8000).unref?.();

// Enkeltkall for en ferdig utlest kvittering (brukes rett etter AI-utlesingen).
export async function summarizeReceipt(d, category) {
  const h = heuristic({ merchant: d.merchant, amount: d.total != null ? -d.total : null, lines: d.lines, category });
  if (!settings().aiSummaries || process.env.MOCK_DATA === '1') return { ...h, domain: domainFor(d.merchant) };
  try {
    const res = await askJson(SUM_PROMPT([{ id: '1', text: d.merchant, amount: -(d.total ?? 0), category, lines: (d.lines ?? []).slice(0, 25).map((l) => `${l.description} ${l.amount}`) }], []), SUM_SCHEMA, { timeout: 45_000, task: 'categorize' });
    const x = res.items?.[0];
    const dom = validDomain(x?.domain) ?? domainFor(d.merchant);
    if (dom && d.merchant && !domainFor(d.merchant)) learnDomain(d.merchant, dom);
    return { short: x?.short?.slice(0, 80) || h.short, long: x?.long?.slice(0, 600) || h.long, domain: dom };
  } catch { return { ...h, domain: domainFor(d.merchant) }; }
}
