// Logoer og ✦ AI-sammendrag for transaksjoner og kvitteringer.
// Butikknavn → domene (fast liste, lærte koblinger, så AI) → favicon som caches på disk.
// Sammendrag: heuristikk straks, AI fyller inn kort og lang tekst i bakgrunnen.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db, OWNER, kv } from '../db.js';
import { config } from '../config.js';
import { settings } from './db.js';
import { askJson } from './ai.js';

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
const learned = () => kv.get(OWNER, 'fh_domains', {});
const DOMAIN_RE = /^(?=.{3,80}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const validDomain = (d) => typeof d === 'string' && DOMAIN_RE.test(d.toLowerCase()) ? d.toLowerCase() : null;

const keyOf = (name) => String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
// Synkron oppslag: lærte koblinger først, så den faste listen. null = ukjent (vis initial).
export function domainFor(name) {
  const l = ' ' + keyOf(name) + ' ';
  if (l.trim().length < 2) return null;
  const L = learned();
  for (const [k, v] of Object.entries(L)) if (l.includes(' ' + k + ' ') || l.trim() === k) return v;
  let best = null, len = 0;
  for (const [k, v] of Object.entries(DOMAINS)) if (k.length > len && l.includes(' ' + k)) { best = v; len = k.length; }
  return best;
}
export function learnDomain(name, domain) {
  const k = keyOf(name).split(' ').slice(0, 3).join(' ');
  const d = domain === null ? null : validDomain(domain);
  if (!k || (domain !== null && !d)) return;
  kv.set(OWNER, 'fh_domains', { ...learned(), [k]: d });
}

/* ---------------- Logo-cache ---------------- */

const LOGOS = resolve(config.dataDir, 'logos');
const MAX_AGE = 30 * 86400_000;
const inflight = new Map();
export async function logo(domain) {
  const d = validDomain(domain);
  if (!d) return null;
  const file = join(LOGOS, d + '.png');
  try { const s = await stat(file); if (Date.now() - s.mtimeMs < MAX_AGE) return s.size ? await readFile(file) : null; } catch { /* mangler */ }
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
async function run() {
  if (running || !settings().aiSummaries || process.env.MOCK_DATA === '1') return;
  if (Date.now() < backoff) return kick(backoff - Date.now());
  running = true;
  try {
    const cats = q("SELECT id, name FROM fh_categories ORDER BY sort").all();
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const rows = q(`SELECT t.id, t.description, t.merchant, t.amount, t.category_id, r.extraction FROM fh_transactions t
      LEFT JOIN fh_receipts r ON r.transaction_id=t.id AND r.status='booked' WHERE t.ai_done=0 ORDER BY t.date DESC LIMIT 15`).all();
    if (!rows.length) return;
    const input = rows.map((r) => ({ id: String(r.id), text: r.merchant || r.description, raw: r.description !== r.merchant ? r.description : undefined, amount: r.amount / 100,
      category: catName.get(r.category_id) ?? null, lines: r.extraction ? (JSON.parse(r.extraction).lines ?? []).slice(0, 15).map((l) => l.description) : undefined }));
    const res = await askJson(SUM_PROMPT(input, cats.map((c) => c.name)), SUM_SCHEMA, { timeout: 90_000 });
    const upd = q('UPDATE fh_transactions SET ai_short=?, ai_long=?, domain=COALESCE(domain, ?), category_id=COALESCE(category_id, ?), ai_done=1 WHERE id=?');
    const byId = new Map((res.items ?? []).map((x) => [String(x.id), x]));
    db.transaction(() => {
      for (const r of rows) {
        const x = byId.get(String(r.id));
        const catId = x?.category ? cats.find((c) => c.name.toLowerCase() === String(x.category).toLowerCase())?.id ?? null : null;
        const dom = validDomain(x?.domain);
        if (dom && !domainFor(r.merchant || r.description)) learnDomain(r.merchant || r.description, dom);
        upd.run(x?.short?.slice(0, 80) || null, x?.long?.slice(0, 600) || null, dom, catId, r.id);
      }
    })();
    backoff = 0;
    kick(500);
  } catch (e) {
    console.warn('[finans] AI-sammendrag:', e.message);
    backoff = Date.now() + 10 * 60_000;
  } finally { running = false; }
}
setTimeout(() => kick(0), 8000).unref?.();

// Enkeltkall for en ferdig utlest kvittering (brukes rett etter AI-utlesingen).
export async function summarizeReceipt(d, category) {
  const h = heuristic({ merchant: d.merchant, amount: d.total != null ? -d.total : null, lines: d.lines, category });
  if (!settings().aiSummaries || process.env.MOCK_DATA === '1') return { ...h, domain: domainFor(d.merchant) };
  try {
    const res = await askJson(SUM_PROMPT([{ id: '1', text: d.merchant, amount: -(d.total ?? 0), category, lines: (d.lines ?? []).slice(0, 25).map((l) => `${l.description} ${l.amount}`) }], []), SUM_SCHEMA, { timeout: 45_000 });
    const x = res.items?.[0];
    const dom = validDomain(x?.domain) ?? domainFor(d.merchant);
    if (dom && d.merchant && !domainFor(d.merchant)) learnDomain(d.merchant, dom);
    return { short: x?.short?.slice(0, 80) || h.short, long: x?.long?.slice(0, 600) || h.long, domain: dom };
  } catch { return { ...h, domain: domainFor(d.merchant) }; }
}
