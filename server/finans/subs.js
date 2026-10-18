// Subscription OS: kategorier, månedsgraf, abonnementshelse, AI-sparing, kommende trekk,
// «Pris økt» fra banktransaksjonene og kandidater (faste trekk som ikke er registrert ennå).
// Alt regnes ut fra fh_subscriptions og fh_transactions; ingenting her endrer data unntatt priceCheck().
import { db, me } from './db.js';

const q = (sql) => db.prepare(sql);
export const CYCLE_MONTHS = { monthly: 1, yearly: 12, biennial: 24 };

// Kategorier i grafen og kalenderen. Rekkefølgen er fargerekkefølgen i grensesnittet.
export const SUB_CATEGORIES = ['Underholdning', 'Produktivitet', 'Lagring og sky', 'Helse og trening', 'Transport', 'Mobil og internett', 'Nyheter og lesing', 'Annet'];
const CAT_RULES = [
  ['Underholdning', /netflix|viaplay|disney|hbo|\bmax\b|spotify|tidal|youtube|apple ?(music|tv)|plex|jellyfin|audible|storytel|tv ?2|nrk|crunchyroll|playstation|xbox|nintendo|steam|twitch|paramount|skyshowtime|amazon prime|deezer/i],
  ['Produktivitet', /microsoft|office|365|adobe|chatgpt|openai|claude|anthropic|notion|figma|github|jetbrains|1password|bitwarden|proton|nordvpn|mullvad|vpn|canva|grammarly|todoist|linear|slack|zoom|cloudflare|domene|domain/i],
  ['Lagring og sky', /icloud|google one|dropbox|onedrive|backblaze|pcloud|mega\b|box\.com|synology|hetzner|digitalocean/i],
  ['Helse og trening', /sats|evo\b|3t\b|fresh fitness|strava|garmin|whoop|fitbit|peloton|treningssenter|elixia|actic|headspace|calm/i],
  ['Transport', /ruter|vy\b|atb|skyss|kolumbus|bolt|voi|tier|ryde|flytoget|parkering|easypark|bompenger|autopass/i],
  ['Mobil og internett', /telia|telenor|ice\b|talkmore|onecall|altibox|nextgentel|get\b|fiber|bredbånd|mobil/i],
  ['Nyheter og lesing', /aftenposten|vg\+|dn\b|dagens næringsliv|e24|morgenbladet|klassekampen|schibsted|amedia|bookbeat|kindle|readly|medium|substack/i],
];
export function categoryFor(name, stored) {
  if (stored && SUB_CATEGORIES.includes(stored)) return stored;
  return CAT_RULES.find(([, re]) => re.test(String(name ?? '')))?.[0] ?? 'Annet';
}

const iso = (d) => d.toLocaleDateString('sv-SE');
const addMonths = (dateStr, n) => { const d = new Date(`${dateStr}T12:00:00`); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };

// Trekkdag: lagret dag, ellers dagen i neste trekk.
export const chargeDayOf = (s) => s.charge_day || (s.next_date ? +s.next_date.slice(8, 10) : null);

// Alle trekkdatoer for et abonnement i et år (projisert fra neste trekk og syklus). Dagen regnes fra neste trekk
// hver gang, så 31. blir 30. i april uten at mai også blir 30.
export function chargesInYear(s, year) {
  const step = CYCLE_MONTHS[s.cycle] ?? 1;
  const base = s.next_date ?? (s.charge_day ? `${year}-01-${String(Math.min(28, s.charge_day)).padStart(2, '0')}` : null);
  if (!base) return [];
  const [by, bm] = base.split('-').map(Number);
  const k0 = Math.ceil(((year - by) * 12 + 1 - bm) / step); // første k med måned ≥ januar i året
  const out = [];
  for (let k = k0; ; k++) { const d = addMonths(base, k * step); if (d > `${year}-12-31`) break; if (d >= `${year}-01-01`) out.push(d); }
  return out;
}

// Grafen «Forbruk per måned»: 12 måneder i året, stablet per kategori. Bare aktive abonnementer (oppsagte er ikke med).
export function byMonth(subs, year = new Date().getFullYear()) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, total: 0, byCategory: {} }));
  for (const s of subs) {
    if (!s.active) continue;
    const cat = categoryFor(s.name, s.category);
    for (const d of chargesInYear(s, year)) {
      const m = months[+d.slice(5, 7) - 1];
      m.total += s.price / 100;
      m.byCategory[cat] = (m.byCategory[cat] ?? 0) + s.price / 100;
    }
  }
  for (const m of months) { m.total = Math.round(m.total * 100) / 100; for (const k of Object.keys(m.byCategory)) m.byCategory[k] = Math.round(m.byCategory[k] * 100) / 100; }
  return months;
}

// Trekk i en gitt måned (kalenderen og «Trekk denne måneden»).
export function chargesInMonth(subs, ym) {
  const year = +ym.slice(0, 4);
  const out = [];
  for (const s of subs) if (s.active) for (const d of chargesInYear(s, year)) if (d.startsWith(ym)) out.push({ id: s.id, date: d, amount: s.price / 100 });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function upcoming(subs, days = 7, now = new Date()) {
  const from = iso(now), to = iso(new Date(now.getTime() + days * 86400_000));
  const out = [];
  for (const s of subs) {
    if (!s.active) continue;
    for (const y of new Set([+from.slice(0, 4), +to.slice(0, 4)])) for (const d of chargesInYear(s, y)) if (d >= from && d <= to) out.push({ id: s.id, name: s.name, date: d, amount: s.price / 100 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// «Pris økt» vises i 120 dager etter at prisen endret seg.
const recent = (d) => !d || d >= iso(new Date(Date.now() - 120 * 86400_000));
export const statusOf = (s) => (!s.active ? 'cancelled' : s.prev_price && s.price > s.prev_price && recent(s.price_changed) ? 'price_up' : s.low_use ? 'low_use' : 'active');
const monthly = (s) => s.price / 100 / (CYCLE_MONTHS[s.cycle] ?? 1);

// Abonnementshelse 0–100: trekk for lite brukte, prisøkninger og abonnementer uten neste trekk.
export function health(subs) {
  const act = subs.filter((s) => s.active);
  const low = act.filter((s) => statusOf(s) === 'low_use').length, up = act.filter((s) => statusOf(s) === 'price_up').length, nodate = act.filter((s) => !s.next_date && !s.charge_day).length;
  const score = Math.max(0, Math.min(100, Math.round(100 - low * 12 - up * 8 - nodate * 4 - Math.max(0, act.length - 12) * 2)));
  const notes = [];
  if (low) notes.push(`${low} abonnement${low === 1 ? '' : 'er'} brukes lite`);
  if (up) notes.push(`${up} har økt prisen`);
  if (nodate) notes.push(`${nodate} mangler trekkdato`);
  const label = score >= 85 ? 'Svært bra' : score >= 65 ? 'Bra' : score >= 45 ? 'Middels' : 'Dårlig';
  return { score, label, notes, text: notes.length ? `${notes.join(', og ').replace(/, og (?=.*, og )/g, ', ')}.` : 'Alle abonnementene ser ut til å være i bruk.' };
}

// ✦ Forslag: si opp lite brukte, se på prisøkninger. Beløpene er i kr per måned.
export function savings(subs) {
  const act = subs.filter((s) => s.active);
  const sug = [];
  for (const s of act.filter((x) => statusOf(x) === 'low_use')) sug.push({ id: s.id, kind: 'cancel', name: s.name, domain: s.domain, text: `Si opp ${s.name}.${s.usage_note ? ` ${s.usage_note}.` : ' Lite brukt i det siste.'}`.replace(/\.\./g, '.'), amount: Math.round(monthly(s)) });
  for (const s of act.filter((x) => statusOf(x) === 'price_up')) {
    const pct = Math.round(((s.price - s.prev_price) / s.prev_price) * 100);
    sug.push({ id: s.id, kind: 'price', name: s.name, domain: s.domain, text: `${s.name} har økt prisen ${pct} %. Sjekk om en billigere plan holder.`, amount: Math.round((s.price - s.prev_price) / 100 / (CYCLE_MONTHS[s.cycle] ?? 1)) });
  }
  sug.sort((a, b) => b.amount - a.amount);
  return { monthly: sug.reduce((a, x) => a + x.amount, 0), suggestions: sug };
}

// Navnet på et trekk, slik det står i banken («VISA 1234 NETFLIX.COM» → «netflix»).
const norm = (t) => String(t ?? '').toLowerCase().replace(/\b(visa|varekjøp|kjøp|betaling|giro|avtalegiro|efaktura|nettgiro|reservasjon|kortkjøp|vipps)\b/g, '').replace(/\*?\d{3,}\S*/g, '').replace(/https?:\/\/|www\.|\.(com|no|net|io|me)\b/g, '').replace(/[^a-zæøå0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (t) => norm(t).split(' ').slice(0, 2).join(' ');
const same = (a, b) => { const x = key(a), y = key(b); return !!x && !!y && (x === y || x.startsWith(y.split(' ')[0]) || y.startsWith(x.split(' ')[0])); };

// «Pris økt»: sammenlign de to siste banktrekkene for abonnementet. Når siste trekk er høyere,
// blir det den nye prisen og forrige trekk lagres som forrige pris.
export function priceCheck(subs, u = me()) {
  const txs = q("SELECT id, date, amount, COALESCE(NULLIF(merchant,''), description) AS name FROM fh_transactions WHERE user_id=? AND amount < 0 AND date >= date('now','-26 months') ORDER BY date DESC").all(u);
  const upd = q('UPDATE fh_subscriptions SET price=?, prev_price=?, price_changed=? WHERE id=? AND user_id=?');
  for (const s of subs) {
    if (!s.active) continue;
    const mine = txs.filter((t) => same(t.name, s.name));
    if (mine.length < 2) continue;
    const [last, prev] = mine;
    const a = Math.abs(last.amount), b = Math.abs(prev.amount);
    // Forrige trekk må være omtrent den lagrede prisen, og det nye høyst 50 % mer – ellers er det et annet kjøp hos samme butikk.
    if (Math.abs(b - s.price) > s.price * 0.05 || a > b * 1.5) continue;
    if (a > b * 1.01 && a - b >= 100 && s.price_changed !== last.date) { upd.run(a, b, last.date, s.id, u); s.price = a; s.prev_price = b; s.price_changed = last.date; }
  }
  return subs;
}

// ✦ Fra transaksjoner: faste trekk sett minst 3 ganger (ulike måneder), omtrent samme beløp, ikke registrert.
export function candidates(subs, { min = 3, u = me() } = {}) {
  // Overføringer, lønn og faste utgifter som husleie er ikke abonnementer.
  const txs = q(`SELECT t.id, t.date, t.amount, t.merchant, t.description, t.domain FROM fh_transactions t LEFT JOIN fh_categories c ON c.id = t.category_id
    WHERE t.user_id=? AND t.amount < 0 AND t.date >= date('now','-14 months') AND COALESCE(c.name,'') NOT IN ('Overføring','Inntekt','Sparing') ORDER BY t.date`).all(u);
  const fixed = q("SELECT r.name FROM fh_recurring r LEFT JOIN fh_categories c ON c.id = r.category_id WHERE r.user_id=? AND COALESCE(c.name,'') <> 'Abonnementer'").all(u).map((r) => r.name);
  const groups = new Map();
  for (const t of txs) {
    const name = t.merchant || t.description, k = key(name);
    if (!k || k.length < 3) continue;
    if (!groups.has(k)) groups.set(k, { name, items: [] });
    groups.get(k).items.push(t);
  }
  const out = [];
  for (const [, g] of groups) {
    const months = new Set(g.items.map((t) => t.date.slice(0, 7)));
    if (months.size < min) continue;
    const amts = g.items.map((t) => Math.abs(t.amount)).sort((x, y) => x - y);
    const median = amts[Math.floor(amts.length / 2)];
    // Samme beløp (±10 %) i de fleste trekkene – ellers er det vanlig handel (f.eks. dagligvarer).
    const steady = amts.filter((a) => Math.abs(a - median) <= median * 0.1).length / amts.length;
    if (steady < 0.75) continue;
    const dates = [...months].sort();
    const gaps = []; for (let i = 1; i < dates.length; i++) { const [y1, m1] = dates[i - 1].split('-').map(Number), [y2, m2] = dates[i].split('-').map(Number); gaps.push((y2 - y1) * 12 + m2 - m1); }
    const gap = gaps.sort((x, y) => x - y)[Math.floor(gaps.length / 2)] ?? 1;
    if (g.items.length > months.size * 2) continue; // flere kjøp per måned: ikke et abonnement
    if (subs.some((s) => same(s.name, g.name)) || fixed.some((n) => same(n, g.name))) continue;
    const last = g.items.at(-1);
    out.push({ merchant: g.name, amount: Math.round(median) / 100, cycle: gap >= 20 ? 'biennial' : gap >= 10 ? 'yearly' : 'monthly', count: g.items.length, lastDate: last.date, domain: last.domain || null, txId: last.id });
  }
  return out.sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 20);
}
