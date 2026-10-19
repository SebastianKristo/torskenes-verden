// Prompt 32 (SERVER32): ✦ AI-søk i FinansHub tar med abonnementer (Subscription OS) og prøveperioder som kilde,
// med en lokal tabell over hva tjenestene inneholder (YouTube Premium → YouTube Music osv.).
//
// POST /finans/api/search/ai {q} – når spørsmålet gjelder abonnement/tjeneste/kategori, svares det direkte herfra
//   (ingen sky, ingen tall fra modellen):
//   {mode:'ai', intent:'subscriptions', engine:'Abonnement', q, yesNo:'ja'|'nei'|null,
//    answer:'**Ja.** Du har **YouTube Premium** (139 kr/mnd, neste trekk 3. nov), som inkluderer YouTube Music.',
//    categories:['musikk'], monthlyTotal:139,
//    subscriptions:[{id, kind:'abonnement'|'prøve', name, plan, price, perLabel, monthly, nextDate, nextLabel, category,
//                    status:'aktiv'|'prøve'|'pauset'|'avsluttet', includes:[], matched:['musikk'], domain, logoUrl,
//                    url:'/finans/#/abonnement/12', openLabel:'Åpne i Abonnement ›', daysLeft?}],
//    sources:[{type:'abonnement'|'prøve'|'tx', title, sub, amount, date, subscriptionId?, txId?}],
//    hits:[…transaksjoner fra kjente selgere siste 12 mnd (samme form som vanlig søk)…],
//    noMoreSure:true, noMoreSureText:'Ingen flere sikre treff', followUps, suggestions, history}
//   Andre AI-svar: «[n]»/«[1]»-markører fjernes fra answer (search.js), og vektortreff under 0,70 likhet kuttes.
// GET /finans/api/subscriptions/knowledge → {items:[{service, includes:[], categories:[]}], custom:[…]}
// PUT /finans/api/subscriptions/knowledge {items:[{service, includes:[], categories:[]}]} → samme (egne rader per bruker)
import { db, me } from './db.js';
import { kv } from '../db.js';
import { osloTodayISO } from '../../public/js/quick-time.js';

const q = (sql) => db.prepare(sql);
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

// Kategorier: nøkkel → ord i spørsmålet som peker på den.
export const CATS = {
  musikk: { label: 'musikk', words: /\b(musikk\w*|music|sang\w*|spilleliste\w*|lytte\w*)\b/ },
  'film/TV': { label: 'film/TV', words: /\b(film\w*|tv|serie\w*|video\w*|strommetjenest\w*|tv-\w*)\b/ },
  lydbok: { label: 'lydbøker', words: /\b(lydbok\w*|lydbøk\w*|lydbok|bok|boker|bøker|podkast\w*)\b/ },
  lagring: { label: 'lagring', words: /\b(lagring\w*|sky|skyen|cloud|backup|lagringsplass)\b/ },
  AI: { label: 'AI', words: /\b(ai|kunstig intelligens|chatbot\w*|språkmodell\w*)\b/ },
  trening: { label: 'trening', words: /\b(trening\w*|treningssenter\w*|gym|fitness|trene)\b/ },
  programvare: { label: 'programvare', words: /\b(programvare|software|app-abonnement\w*|lisens\w*)\b/ },
  spill: { label: 'spill', words: /\b(spill|gaming|arcade)\b/ },
  frakt: { label: 'frakt', words: /\b(frakt|levering)\b/ },
};
const STREAM = /\b(strom\w*|streaming)\b/; // «strømming» = musikk + film/TV

// Lokal kunnskapstabell. includes = hva tjenesten inneholder (vises i svaret), cats = kategorier den teller som treff på.
export const KNOWLEDGE = [
  { re: /youtube ?premium/, service: 'YouTube Premium', includes: ['video uten reklame', 'YouTube Music'], cats: ['film/TV', 'musikk'] },
  { re: /youtube ?music/, service: 'YouTube Music', includes: ['YouTube Music'], cats: ['musikk'] },
  { re: /spotify/, service: 'Spotify', includes: ['musikk', 'podkaster'], cats: ['musikk'] },
  { re: /tidal/, service: 'Tidal', includes: ['musikk'], cats: ['musikk'] },
  { re: /apple ?music/, service: 'Apple Music', includes: ['musikk'], cats: ['musikk'] },
  { re: /deezer/, service: 'Deezer', includes: ['musikk'], cats: ['musikk'] },
  { re: /apple ?one/, service: 'Apple One', includes: ['Apple Music', 'Apple TV+', 'iCloud+', 'Apple Arcade'], cats: ['musikk', 'film/TV', 'lagring', 'spill'] },
  { re: /amazon ?prime|prime ?video/, service: 'Amazon Prime', includes: ['Prime Video', 'Prime Music (begrenset)', 'frakt'], cats: ['film/TV', 'musikk', 'frakt'] },
  { re: /netflix/, service: 'Netflix', includes: ['film og serier'], cats: ['film/TV'] },
  { re: /hbo|\bmax\b/, service: 'Max', includes: ['film og serier'], cats: ['film/TV'] },
  { re: /disney/, service: 'Disney+', includes: ['film og serier'], cats: ['film/TV'] },
  { re: /viaplay/, service: 'Viaplay', includes: ['film, serier og sport'], cats: ['film/TV'] },
  { re: /tv ?2 ?play|tv2/, service: 'TV 2 Play', includes: ['TV, serier og sport'], cats: ['film/TV'] },
  { re: /\bnrk\b/, service: 'NRK', includes: ['TV og radio (gratis)'], cats: ['film/TV'] },
  { re: /apple ?tv/, service: 'Apple TV+', includes: ['film og serier'], cats: ['film/TV'] },
  { re: /skyshowtime|paramount|crunchyroll/, service: 'Strømmetjeneste', includes: ['film og serier'], cats: ['film/TV'] },
  { re: /storytel/, service: 'Storytel', includes: ['lydbøker', 'e-bøker'], cats: ['lydbok'] },
  { re: /bookbeat/, service: 'BookBeat', includes: ['lydbøker', 'e-bøker'], cats: ['lydbok'] },
  { re: /audible/, service: 'Audible', includes: ['lydbøker'], cats: ['lydbok'] },
  { re: /icloud/, service: 'iCloud+', includes: ['lagring i iCloud'], cats: ['lagring'] },
  { re: /google ?one/, service: 'Google One', includes: ['lagring i Google Disk', 'Gmail og Foto'], cats: ['lagring'] },
  { re: /dropbox/, service: 'Dropbox', includes: ['lagring'], cats: ['lagring'] },
  { re: /onedrive|microsoft ?365|office ?365/, service: 'Microsoft 365', includes: ['Office', 'OneDrive-lagring'], cats: ['lagring', 'programvare'] },
  { re: /chatgpt|openai/, service: 'ChatGPT Plus', includes: ['AI-assistent'], cats: ['AI', 'programvare'] },
  { re: /claude|anthropic/, service: 'Claude Pro', includes: ['AI-assistent'], cats: ['AI', 'programvare'] },
  { re: /adobe|figma|notion|jetbrains|github|1password|bitwarden|canva/, service: 'Programvare', includes: ['programvare'], cats: ['programvare'] },
  { re: /sats|\bevo\b|3t\b|fresh fitness|elixia|actic|strava|treningssenter/, service: 'Trening', includes: ['trening'], cats: ['trening'] },
  { re: /playstation|xbox|nintendo|steam/, service: 'Spill', includes: ['spill'], cats: ['spill'] },
];
// Selgernavn i banken → tjeneste (koble transaksjoner til abonnementet).
const MERCHANT = [[/google \*?youtube ?premium|youtubepremium|youtube premium/, 'youtube premium'], [/spotify/, 'spotify'], [/netflix/, 'netflix'], [/apple\.com\/bill|itunes/, 'apple'],
  [/storytel/, 'storytel'], [/viaplay/, 'viaplay'], [/disney/, 'disney'], [/tidal/, 'tidal'], [/google \*?one|google storage/, 'google one'], [/openai|chatgpt/, 'chatgpt']];

const KN_KEY = 'fh_service_knowledge';
const customOf = (u) => { const v = kv.get(u, KN_KEY, []); return Array.isArray(v) ? v : []; };
function knowledgeFor(name, u) {
  const n = fold(name);
  const c = customOf(u).find((x) => x && fold(x.service) && n.includes(fold(x.service)));
  if (c) return { service: c.service, includes: (c.includes ?? []).map(String), cats: (c.categories ?? []).map(String) };
  return KNOWLEDGE.find((k) => k.re.test(n)) ?? null;
}

const SUB_WORDS = /\b(abonnement\w*|abonement\w*|abb\w*|tjeneste\w*|betaler jeg|betaler for|betaler\b|medlemskap\w*|prøveperiode\w*|proveperiode\w*|prøve\w*|trial)\b/;
/** Gjelder spørsmålet abonnementer? → {cats:[…], general} eller null. */
export function subIntent(text) {
  const t = fold(text).replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae');
  const raw = fold(text);
  const cats = Object.entries(CATS).filter(([, v]) => v.words.test(raw) || v.words.test(t)).map(([k]) => k);
  if (STREAM.test(t)) { for (const k of ['film/TV', 'musikk']) if (!cats.includes(k)) cats.push(k); }
  const subWord = SUB_WORDS.test(raw) || SUB_WORDS.test(t);
  if (!subWord && !(cats.length && /\b(har jeg|betaler|abonn|hva bruker jeg|hvilke)\b/.test(t)) && !STREAM.test(t)) return null;
  return { cats, general: !cats.length, stream: STREAM.test(t) };
}

const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const dLabel = (iso) => (iso ? `${+iso.slice(8, 10)}. ${MON[+iso.slice(5, 7) - 1]}` : null);
const krS = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ','); };
const CYC = { monthly: 1, yearly: 12, biennial: 24 };
const PER = { monthly: '/mnd', yearly: '/år', biennial: '/2 år' };
const daysTo = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400_000);
const incCat = (i) => { const t = fold(i);
  return /music|musikk/.test(t) ? 'musikk' : /lydbøk|lydbok|e-bøk|bøker/.test(t) ? 'lydbok' : /tv|video|film|serier/.test(t) ? 'film/TV' : /lagring|icloud|onedrive|disk/.test(t) ? 'lagring' : /arcade|spill/.test(t) ? 'spill' : /frakt/.test(t) ? 'frakt' : /ai/.test(t) ? 'AI' : null; };
const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);

/** Abonnementer + aktive prøver for brukeren, med inkluderer[] og kategorier. */
export function subscriptionSources(u = me()) {
  const today = osloTodayISO();
  const subs = q('SELECT * FROM fh_subscriptions WHERE user_id=? AND active=1 ORDER BY name').all(u).map((s) => {
    const k = knowledgeFor(s.name, u);
    const domain = s.domain || null;
    return { id: s.id, kind: 'abonnement', name: s.name, plan: s.plan || '', price: s.price / 100, perLabel: PER[s.cycle] ?? '/mnd', monthly: Math.round(s.price / (CYC[s.cycle] ?? 1)) / 100,
      nextDate: s.next_date ?? null, nextLabel: dLabel(s.next_date), category: s.category ?? null, status: s.low_use ? 'aktiv' : 'aktiv', includes: k?.includes ?? [], cats: k?.cats ?? [],
      domain, logoUrl: s.logo_url || (domain ? `/finans/api/logo/${domain}` : null), url: `/finans/#/abonnement/${s.id}`, openLabel: 'Åpne i Abonnement ›' };
  });
  let trials = [];
  try { trials = q("SELECT * FROM trials WHERE user_id=? AND status='active' ORDER BY ends_at").all(u); } catch { /* tabellen finnes ikke ennå */ }
  for (const t of trials) {
    if (subs.some((s) => fold(s.name) === fold(t.service))) continue;
    const k = knowledgeFor(t.service, u);
    subs.push({ id: `trial-${t.id}`, trialId: t.id, kind: 'prøve', name: t.service, plan: 'Gratis prøveperiode', price: t.price_after ?? 0, perLabel: '/mnd', monthly: t.price_after ?? 0,
      nextDate: t.ends_at, nextLabel: dLabel(t.ends_at), category: null, status: 'prøve', includes: k?.includes ?? [], cats: k?.cats ?? [], daysLeft: daysTo(today, t.ends_at),
      domain: null, logoUrl: null, url: '/finans/#/abonnement', openLabel: 'Åpne i Abonnement ›' });
  }
  return subs;
}

/** Transaksjoner fra kjente selgere siste 12 mnd som hører til et av abonnementene. */
function linkedTx(u, subs) {
  const from = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const rows = q('SELECT id, date, amount, description, merchant FROM fh_transactions WHERE user_id=? AND amount<0 AND date>=? ORDER BY date DESC LIMIT 2000').all(u, from);
  const out = [];
  for (const t of rows) {
    const name = fold(`${t.merchant ?? ''} ${t.description ?? ''}`);
    const key = MERCHANT.find(([re]) => re.test(name))?.[1];
    const sub = subs.find((s) => (key && fold(s.name).includes(key.split(' ')[0])) || name.includes(fold(s.name)));
    if (sub) out.push({ t, sub });
  }
  return out;
}

/** Svar på et abonnementsspørsmål. null når spørsmålet ikke gjelder abonnementer. */
export function subscriptionAnswer(text, u = me()) {
  const intent = subIntent(text);
  if (!intent) return null;
  const all = subscriptionSources(u);
  const catLabel = intent.stream ? 'strømming' : intent.cats.map((c) => CATS[c]?.label ?? c).join(' eller ');
  const nameHit = all.filter((s) => fold(text).includes(fold(s.name)));
  let matched;
  if (nameHit.length) matched = nameHit.map((s) => ({ ...s, matched: ['navn'] }));
  else if (intent.general) matched = all.map((s) => ({ ...s, matched: [] }));
  else matched = all.map((s) => ({ ...s, matched: s.cats.filter((c) => intent.cats.includes(c)) })).filter((s) => s.matched.length);
  // Rangering: abonnementer først (aktive før prøver), så etter pris per måned.
  matched.sort((a, b) => (a.kind === b.kind ? b.monthly - a.monthly : a.kind === 'abonnement' ? -1 : 1));
  const txs = linkedTx(u, matched.length ? matched : []).slice(0, 8);
  const sum = Math.round(matched.filter((s) => s.kind === 'abonnement').reduce((a, s) => a + s.monthly, 0) * 100) / 100;
  const desc = (s) => {
    const bits = [s.kind === 'prøve' ? `prøve, ${s.daysLeft} dager igjen${s.price ? `, deretter ${krS(s.price)} kr/mnd` : ''}` : `${krS(s.price)} kr${s.perLabel}`];
    if (s.nextLabel && s.kind !== 'prøve') bits.push(`neste trekk ${s.nextLabel}`);
    let show = [];
    if (s.matched.includes('navn')) show = s.includes;
    else if (s.matched.length) show = s.includes.filter((i) => s.matched.includes(incCat(i)) && incCat(i) !== s.cats[0]); // bare det som ikke er hovedtjenesten (YouTube Premium → YouTube Music)
    return `**${s.name}** (${bits.join(', ')})${show.length ? `, som inkluderer ${listJoin(show)}` : ''}`;
  };
  let answer, yesNo;
  if (!matched.length) {
    yesNo = 'nei';
    const NOUN = { musikk: 'musikkabonnement', 'film/TV': 'film- eller TV-abonnement', lydbok: 'lydbokabonnement', lagring: 'lagringsabonnement', AI: 'AI-abonnement', trening: 'treningsabonnement',
      programvare: 'programvareabonnement', spill: 'spillabonnement', frakt: 'fraktabonnement' };
    const noun = intent.stream ? 'strømmeabonnementer' : intent.cats.map((c) => NOUN[c] ?? `${c}abonnement`).join(' eller ');
    answer = intent.general ? 'Nei, jeg finner ingen aktive abonnementer i Abonnement.'
      : `Nei, jeg finner ingen ${noun} i Abonnement eller i transaksjonene de siste 12 månedene.`;
  } else if (intent.stream || intent.general || /\bhva\b|\bhvilke\b|\bliste\b/.test(fold(text))) {
    yesNo = /^(har|betaler|er)\b/.test(fold(text).trim()) ? 'ja' : null;
    const what = intent.general ? 'abonnement' : catLabel;
    answer = `${yesNo ? '**Ja.** ' : ''}Du betaler for ${matched.length} ${what === 'abonnement' ? (matched.length === 1 ? 'abonnement' : 'abonnementer') : `${what}tjeneste${matched.length === 1 ? '' : 'r'}`}: ${listJoin(matched.map(desc))}.`
      + (matched.filter((s) => s.kind === 'abonnement').length > 1 ? ` Til sammen ${krS(sum)} kr/mnd.` : '');
    answer = answer.replace('strømmingtjeneste', 'strømmetjeneste').replace('film/TVtjeneste', 'film/TV-tjeneste').replace('AItjeneste', 'AI-tjeneste');
  } else {
    yesNo = 'ja';
    answer = `**Ja.** Du har ${listJoin(matched.map(desc))}.` + (matched.filter((s) => s.kind === 'abonnement').length > 1 ? ` Til sammen ${krS(sum)} kr/mnd.` : '');
  }
  const subsOut = matched.map(({ cats, ...s }) => s);
  const sources = [
    ...subsOut.map((s) => ({ type: s.kind, title: s.name, sub: s.kind === 'prøve' ? `Prøve · ${s.daysLeft} dager igjen` : `${krS(s.price)} kr${s.perLabel}${s.nextLabel ? ` · neste trekk ${s.nextLabel}` : ''}`, amount: -s.price, date: s.nextDate, subscriptionId: s.kind === 'abonnement' ? s.id : null })),
    ...txs.map(({ t, sub }) => ({ type: 'tx', title: t.merchant || t.description, sub: `Transaksjon · ${sub.name}`, amount: t.amount / 100, date: t.date, txId: t.id, subscriptionId: typeof sub.id === 'number' ? sub.id : null })),
  ];
  const hits = txs.map(({ t, sub }) => ({ type: 'tx', id: String(t.id), txId: t.id, receiptId: null, description: t.merchant || t.description, date: t.date, amount: t.amount / 100, source: 'Transaksjon', reason: `Trekk for ${sub.name}`, category: 'Abonnementer', color: '#A0A0AA' }));
  return { mode: 'ai', intent: 'subscriptions', engine: 'Abonnement', yesNo, answer, categories: intent.stream ? ['strømming', ...intent.cats] : intent.cats, monthlyTotal: sum,
    subscriptions: subsOut, sources, hits, noMoreSure: true, noMoreSureText: 'Ingen flere sikre treff', facts: { count: hits.length } };
}

/** Fjerner kildemarkører som «[n]», «[1]», «[1, 2]» og «[1][2]» fra et AI-svar. */
export const stripMarkers = (s) => String(s ?? '').replace(/\s*\[(?:n|\d+(?:\s*[,–-]\s*\d+)*)\]/gi, '').replace(/\s+([.,!?])/g, '$1').trim();

export function mountSubsAsk(api, { R, W }) {
  const view = (u) => ({ items: KNOWLEDGE.map((k) => ({ service: k.service, includes: k.includes, categories: k.cats })), custom: customOf(u) });
  api.get('/subscriptions/knowledge', R, (c) => c.json(view(c.get('user'))));
  api.put('/subscriptions/knowledge', W, async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!Array.isArray(b?.items) || b.items.length > 200) return c.json({ error: 'Forventet {items:[{service, includes[], categories[]}]}' }, 400);
    const items = b.items.map((x) => ({ service: String(x?.service ?? '').trim().slice(0, 60), includes: (Array.isArray(x?.includes) ? x.includes : []).map((s) => String(s).slice(0, 60)).slice(0, 12),
      categories: (Array.isArray(x?.categories) ? x.categories : []).map(String).filter((k) => k in CATS) })).filter((x) => x.service);
    kv.set(c.get('user'), KN_KEY, items);
    return c.json(view(c.get('user')));
  });
}
