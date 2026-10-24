// Prompt 51 (FIN51): skattehjelp. Samler fradragsposter for et inntektsår fra brukerens egne transaksjoner og det brukeren har
// registrert: rentefradrag (renter på lån; ellers anslag fra Hjem → Bolig), reisefradrag-anslag (avstand × arbeidsdager),
// gaver til godkjente organisasjoner, fagforeningskontingent, BSU og IPS. Påminnelse før skattemeldingen (mars/april) og eksport
// som CSV og utskriftsvennlig HTML (lagre som PDF fra nettleseren). Alt er anslag – med forbehold-tekst i svaret.
//
//   GET  /fin51/tax?year=2025        → {year, items:[TaxItem], total:{deduction, value}, reminder, disclaimer, profile, rates, ratesNote}
//   PUT  /fin51/tax/profile {commuteKm?, workDays?, bsu?, ips?, loanInterest?, union?, gifts?:[{org, amount}], remind?}
//                                    → {profile}
//   GET  /fin51/tax/export.csv?year= → text/csv (semikolon, UTF-8 med BOM)
//   GET  /fin51/tax/export.html?year=→ text/html (utskriftsvennlig)
//   TaxItem: {key:'interest'|'travel'|'gifts'|'union'|'bsu'|'ips', title, kind:'fradrag'|'skattefradrag', basis, deduction, value,
//             source:'transaksjoner'|'registrert'|'anslag'|'mangler', sources:[{date, name, amount}], note, missing?:string}
import { kv } from './db.js';
import { notifyUser } from '../notify.js';
import { q51 as q, today51, kr51, krText51, ore51, str51, bad51 as bad, r2, tx51, csvCell51, esc51, dayLabel51 } from './fin51-util.js';

// Satser og grenser per inntektsår (kr). Anslag – kontroller alltid hos Skatteetaten. Ukjent år bruker siste kjente.
export const TAX_RATES51 = {
  2024: { tax: 22, travelRate: 1.83, travelFloor: 15250, giftMin: 500, giftMax: 25000, unionMax: 8000, bsuMax: 27500, bsuPct: 10, ipsMax: 15000 },
  2025: { tax: 22, travelRate: 1.83, travelFloor: 12000, giftMin: 500, giftMax: 25000, unionMax: 8000, bsuMax: 27500, bsuPct: 10, ipsMax: 15000 },
  2026: { tax: 22, travelRate: 1.83, travelFloor: 12000, giftMin: 500, giftMax: 25000, unionMax: 8000, bsuMax: 27500, bsuPct: 10, ipsMax: 15000, provisional: true },
};
const ratesFor = (y) => TAX_RATES51[y] ?? { ...TAX_RATES51[Math.max(...Object.keys(TAX_RATES51).map(Number))], provisional: true };
export const DISCLAIMER51 = 'Dette er et anslag ut fra transaksjonene dine og det du har registrert, ikke skatteråd. Satser og grenser kan endre seg, og mange poster '
  + '(renter, fagforening, gaver, BSU) er ofte forhåndsutfylt fra banken eller arbeidsgiveren. Kontroller alltid i skattemeldingen på skatteetaten.no.';

// Et utvalg organisasjoner som har vært godkjent for gavefradrag. Listen er ikke fullstendig – sjekk Skatteetatens liste.
export const GIFT_ORGS51 = ['Redd Barna', 'Kirkens Bymisjon', 'Leger Uten Grenser', 'Røde Kors', 'Kreftforeningen', 'Amnesty', 'UNICEF', 'SOS-barnebyer', 'Frelsesarmeen',
  'Plan International', 'Flyktninghjelpen', 'WWF', 'Kirkens Nødhjelp', 'Norsk Folkehjelp', 'Blå Kors', 'Fransiskushjelpen', 'CARE Norge', 'Regnskogfondet',
  'Nasjonalforeningen', 'LHL', 'Redningsselskapet', 'Blindeforbundet', 'Dyrebeskyttelsen', 'Kirkens SOS', 'Mental Helse', 'Naturvernforbundet', 'Misjonsalliansen',
  'Normisjon', 'Det Norske Misjonsselskap', 'Hjernerådet', 'Barnekreftforeningen', 'Foreningen for hjertesyke barn', 'Hjelpekilden', 'Stiftelsen Kirkens Familievern'];
export const UNIONS51 = ['Fagforbundet', 'Fellesforbundet', 'Handel og Kontor', 'NITO', 'Tekna', 'Utdanningsforbundet', 'Sykepleierforbund', 'Delta', 'Parat', 'Negotia', 'Econa',
  'Juristforbundet', 'Legeforeningen', 'El og IT', 'Samfunnsviterne', 'Lederne', 'Forskerforbundet', 'Naturviterne', 'Psykologforeningen', 'Politiets Fellesforbund', 'NTL',
  'Industri Energi', 'Fellesorganisasjonen', 'Journalistlag', 'Musikernes fellesorganisasjon', 'Arkitektforbund', 'Skolenes landsforbund', 'Bibliotekarforbundet', 'Akademikerforbundet'];
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
const reOf = (list) => new RegExp(`(?:^|[^a-z0-9])(${list.map((x) => fold(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]*')).join('|')})(?:$|[^a-z0-9])`);
const GIFT_RE = reOf(GIFT_ORGS51), UNION_RE = reOf(UNIONS51);
const INTEREST_RE = /(^|[^a-z])(renter|rente|lanerente|renteutgift\w*|gjeldsrente\w*|renter lan)([^a-z]|$)/;
const NOT_INTEREST = /renteinntekt|innskuddsrente|rente inn|kredittrente inn/;
const BSU_RE = /(^|[^a-z])bsu([^a-z]|$)|boligsparing for ungdom/;
const IPS_RE = /(^|[^a-z])ips([^a-z]|$)|individuell pensjonssparing/;
const orgOf = (text, list) => list.find((o) => reOf([o]).test(fold(text))) ?? null;

const PROFILE0 = { commuteKm: 0, workDays: 230, bsu: 0, ips: 0, loanInterest: 0, union: 0, gifts: [], remind: true };
export const taxProfile51 = (u) => ({ ...PROFILE0, ...(kv.get(u, 'fin51_tax', null) ?? {}) });
/** Standard inntektsår: før juni gjelder det fjoråret (skattemeldingen), ellers året som går. */
export const defaultTaxYear51 = (today = today51()) => (+today.slice(5, 7) <= 5 ? +today.slice(0, 4) - 1 : +today.slice(0, 4));

/** Påminnelse før skattemeldingen: vises fra 15. februar til 30. april. */
export function taxReminder51(today = today51()) {
  const y = +today.slice(0, 4), md = today.slice(5);
  if (md < '02-15' || md > '04-30') return { show: false };
  const deadline = `${y}-04-30`;
  const left = Math.round((Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000);
  const text = md < '03-10'
    ? `Skattemeldingen for ${y - 1} kommer i midten av mars. Gå gjennom fradragene under, så er du klar.`
    : `Skattemeldingen for ${y - 1} er klar – fristen er 30. april (${left === 0 ? 'i dag' : left === 1 ? 'i morgen' : `om ${left} dager`}). Sjekk at fradragene under er med.`;
  return { show: true, year: y - 1, deadline, daysLeft: left, text, url: 'https://www.skatteetaten.no/person/skatt/skattemelding/' };
}

/** Alle fradragspostene for et år. */
export function taxSummary51(u, { year, today = today51() } = {}) {
  const Y = Number.isInteger(+year) && +year >= 2000 && +year <= 2100 ? +year : defaultTaxYear51(today);
  const R = ratesFor(Y), p = taxProfile51(u), pct = R.tax / 100;
  const rows = tx51(u, `${Y}-01-01`, { to: `${Y}-12-31`, transfers: true });
  const text = (t) => fold(`${t.name ?? ''} ${t.description ?? ''} ${t.category ?? ''}`);
  const src = (list) => list.slice(-40).map((t) => ({ date: t.date, name: t.name, amount: kr51(t.amount) }));
  const items = [];
  // Rentefradrag
  {
    const list = rows.filter((t) => t.amount < 0 && INTEREST_RE.test(text(t)) && !NOT_INTEREST.test(text(t)));
    const sum = list.reduce((a, t) => a - t.amount, 0) / 100;
    let basis = sum, source = list.length ? 'transaksjoner' : 'mangler', note = 'Renter på lån trekkes fra i alminnelig inntekt (verdi 22 %). Banken rapporterer dem normalt selv.';
    if (!list.length && p.loanInterest > 0) { basis = p.loanInterest; source = 'registrert'; }
    else if (!list.length) {
      const prop = kv.get(u, 'home_property', null);
      if (prop?.loan > 0 && prop?.rate > 0) { basis = Math.round(prop.loan * (prop.rate / 100)); source = 'anslag'; note = `Anslag fra Hjem → Bolig: lån ${krText51(prop.loan)} × ${String(prop.rate).replace('.', ',')} %. ${note}`; }
    }
    items.push({ key: 'interest', title: 'Rentefradrag', kind: 'fradrag', basis: r2(basis), deduction: r2(basis), value: r2(basis * pct), source, sources: src(list), note,
      ...(source === 'mangler' ? { missing: 'Fant ingen renter på lån – registrer beløpet hvis du har lån' } : {}) });
  }
  // Reisefradrag (anslag)
  {
    const km = Math.max(0, +p.commuteKm || 0), dd = Math.max(0, Math.min(366, +p.workDays || 0));
    const total = km * 2 * dd * R.travelRate, ded = Math.max(0, total - R.travelFloor);
    items.push({ key: 'travel', title: 'Reisefradrag (anslag)', kind: 'fradrag', basis: r2(total), deduction: r2(ded), value: r2(ded * pct), source: km ? 'registrert' : 'mangler', sources: [],
      note: `${km ? `${String(km).replace('.', ',')} km hver vei × 2 × ${dd} dager × ${String(R.travelRate).replace('.', ',')} kr/km = ${krText51(Math.round(total))}, minus bunnbeløpet ${krText51(R.travelFloor)}.` : ''} Gjelder reise mellom hjem og fast arbeidssted.`.trim(),
      ...(km ? {} : { missing: 'Legg inn avstanden til jobben for å få et anslag' }) });
  }
  // Gaver til godkjente organisasjoner (minst 500 kr per organisasjon, maks 25 000 kr)
  {
    const list = rows.filter((t) => t.amount < 0 && GIFT_RE.test(text(t)));
    const per = new Map();
    for (const t of list) { const o = orgOf(`${t.name} ${t.description}`, GIFT_ORGS51) ?? t.name; per.set(o, (per.get(o) ?? 0) - t.amount / 100); }
    for (const g of Array.isArray(p.gifts) ? p.gifts : []) if (g?.org && +g.amount > 0) per.set(g.org, (per.get(g.org) ?? 0) + +g.amount);
    const orgs = [...per.entries()].map(([org, amount]) => ({ org, amount: r2(amount), counts: amount >= R.giftMin })).sort((a, b) => b.amount - a.amount);
    const basis = orgs.filter((o) => o.counts).reduce((a, o) => a + o.amount, 0), ded = Math.min(basis, R.giftMax);
    items.push({ key: 'gifts', title: 'Gaver til frivillige organisasjoner', kind: 'fradrag', basis: r2(basis), deduction: r2(ded), value: r2(ded * pct),
      source: list.length ? 'transaksjoner' : (p.gifts?.length ? 'registrert' : 'mangler'), sources: src(list), orgs,
      note: `Minst ${krText51(R.giftMin)} per organisasjon i året, maks ${krText51(R.giftMax)}. Organisasjonen må være godkjent og ha fødselsnummeret ditt.${orgs.some((o) => !o.counts) ? ' Gaver under grensen er ikke med i summen.' : ''}`,
      ...(!orgs.length ? { missing: 'Fant ingen gaver til kjente organisasjoner' } : {}) });
  }
  // Fagforeningskontingent (maks 8 000 kr)
  {
    const list = rows.filter((t) => t.amount < 0 && UNION_RE.test(text(t)));
    const sum = list.reduce((a, t) => a - t.amount, 0) / 100 + Math.max(0, +p.union || 0);
    const ded = Math.min(sum, R.unionMax);
    items.push({ key: 'union', title: 'Fagforeningskontingent', kind: 'fradrag', basis: r2(sum), deduction: r2(ded), value: r2(ded * pct),
      source: list.length ? 'transaksjoner' : p.union > 0 ? 'registrert' : 'mangler', sources: src(list),
      note: `Maks ${krText51(R.unionMax)}. Trekkes kontingenten i lønnen, er den vanligvis forhåndsutfylt.`, ...(sum ? {} : { missing: 'Ingen fagforeningskontingent funnet' }) });
  }
  // BSU (skattefradrag 10 % av innskudd, maks 27 500 kr i året) – innskudd til en BSU-konto eller trekk merket BSU.
  {
    const bsuAcc = q("SELECT id FROM fh_accounts WHERE user_id=? AND (lower(name) LIKE '%bsu%' OR lower(note) LIKE '%bsu%')").all(u).map((a) => a.id);
    const list = rows.filter((t) => (bsuAcc.includes(t.account_id) ? t.amount > 0 : t.amount < 0 && BSU_RE.test(text(t))));
    const sum = list.reduce((a, t) => a + Math.abs(t.amount), 0) / 100 + Math.max(0, +p.bsu || 0);
    const basis = Math.min(sum, R.bsuMax);
    items.push({ key: 'bsu', title: 'BSU (boligsparing for ungdom)', kind: 'skattefradrag', basis: r2(basis), deduction: 0, value: r2(basis * (R.bsuPct / 100)),
      source: list.length ? 'transaksjoner' : p.bsu > 0 ? 'registrert' : 'mangler', sources: src(list),
      note: `${R.bsuPct} % skattefradrag av innskudd opptil ${krText51(R.bsuMax)} i året, til og med året du fyller 33. Forhåndsutfylt av banken.`, ...(sum ? {} : { missing: 'Ingen BSU registrert' }) });
  }
  // IPS (fradrag inntil 15 000 kr i året)
  {
    const list = rows.filter((t) => t.amount < 0 && IPS_RE.test(text(t)));
    const sum = list.reduce((a, t) => a - t.amount, 0) / 100 + Math.max(0, +p.ips || 0);
    const ded = Math.min(sum, R.ipsMax);
    items.push({ key: 'ips', title: 'IPS (individuell pensjonssparing)', kind: 'fradrag', basis: r2(sum), deduction: r2(ded), value: r2(ded * pct),
      source: list.length ? 'transaksjoner' : p.ips > 0 ? 'registrert' : 'mangler', sources: src(list),
      note: `Fradrag for innskudd opptil ${krText51(R.ipsMax)} i året (verdi ${R.tax} %). Forhåndsutfylt av banken.`, ...(sum ? {} : { missing: 'Ingen IPS registrert' }) });
  }
  const total = { deduction: r2(items.reduce((a, i) => a + i.deduction, 0)), value: r2(items.reduce((a, i) => a + i.value, 0)) };
  return { year: Y, items, total, totalText: `Anslått skatteverdi ${krText51(Math.round(total.value))}`, reminder: taxReminder51(today), disclaimer: DISCLAIMER51, profile: p,
    rates: R, ratesNote: R.provisional ? `Satsene for ${Y} er foreløpige (samme som ${Math.max(...Object.keys(TAX_RATES51).map(Number).filter((y) => !TAX_RATES51[y].provisional))}).` : null };
}
function cleanProfile(b, cur) {
  const p = { ...cur };
  const num = (v, max) => { const n = ore51(v); return n == null ? null : Math.max(0, Math.min(max, n / 100)); };
  if (b.commuteKm !== undefined) p.commuteKm = num(b.commuteKm, 1000) ?? 0;
  if (b.workDays !== undefined) p.workDays = Math.round(num(b.workDays, 366) ?? 230);
  for (const k of ['bsu', 'ips', 'loanInterest', 'union']) if (b[k] !== undefined) p[k] = num(b[k], 10_000_000) ?? 0;
  if (Array.isArray(b.gifts)) p.gifts = b.gifts.slice(0, 30).map((g) => ({ org: str51(g?.org, 80), amount: num(g?.amount, 1_000_000) ?? 0 })).filter((g) => g.org && g.amount > 0);
  if (b.remind !== undefined) p.remind = !!b.remind;
  return p;
}
const yearOf = (c) => c.req.query('year');
const nb = (v) => String(r2(v)).replace('.', ',');
export function taxCsv51(s) {
  const lines = [['Inntektsår', 'Post', 'Type', 'Grunnlag (kr)', 'Fradrag (kr)', 'Anslått skatteverdi (kr)', 'Kilde', 'Merknad'].map(csvCell51).join(';')];
  for (const i of s.items) lines.push([s.year, i.title, i.kind, nb(i.basis), nb(i.deduction), nb(i.value), i.source, i.note].map(csvCell51).join(';'));
  lines.push([s.year, 'Sum', '', '', nb(s.total.deduction), nb(s.total.value), '', ''].map(csvCell51).join(';'));
  lines.push('');
  lines.push(['Forbehold', s.disclaimer].map(csvCell51).join(';'));
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
export function taxHtml51(s, who = '') {
  const money = (v) => esc51(krText51(v, true));
  const rows = s.items.map((i) => `<tr><td><b>${esc51(i.title)}</b><div class="n">${esc51(i.note)}</div>${i.orgs?.length ? `<div class="n">${i.orgs.map((o) => `${esc51(o.org)}: ${money(o.amount)}${o.counts ? '' : ' (under grensen)'}`).join(' · ')}</div>` : ''}</td>
    <td>${esc51(i.kind)}</td><td class="r">${money(i.basis)}</td><td class="r">${money(i.deduction)}</td><td class="r">${money(i.value)}</td><td>${esc51(i.source)}</td></tr>`).join('');
  const src = s.items.filter((i) => i.sources?.length).map((i) => `<h3>${esc51(i.title)}</h3><table><tr><th>Dato</th><th>Tekst</th><th class="r">Beløp</th></tr>${i.sources.map((t) => `<tr><td>${esc51(t.date)}</td><td>${esc51(t.name)}</td><td class="r">${money(t.amount)}</td></tr>`).join('')}</table>`).join('');
  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skattehjelp ${s.year} – FinansHub</title>
<style>body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1b19;background:#fff;margin:32px auto;max-width:860px;padding:0 20px}h1{font:400 30px Georgia,serif;margin:0 0 4px}
h2{font-size:16px;margin:28px 0 8px}h3{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border-bottom:1px solid #e2ddd2;padding:7px 6px;text-align:left;vertical-align:top}
th{font-size:12px;color:#5c5850;font-weight:600}.r{text-align:right;white-space:nowrap}.n{color:#5c5850;font-size:12px;margin-top:2px}.sum td{font-weight:700;border-top:2px solid #1c1b19}
.box{background:#f4f1ea;border:1px solid #e2ddd2;border-radius:10px;padding:12px 14px;margin:16px 0;font-size:13px}.mut{color:#8a8478;font-size:12px}@media print{body{margin:0}.noprint{display:none}}</style></head>
<body><h1>Skattehjelp for ${s.year}</h1><div class="mut">FinansHub · ${esc51(who)} · laget ${esc51(dayLabel51(today51()))} ${today51().slice(0, 4)}</div>
<p class="noprint mut">Skriv ut siden, eller velg «Lagre som PDF» i utskriftsvinduet.</p>
<div class="box"><b>Forbehold:</b> ${esc51(s.disclaimer)}${s.ratesNote ? ` ${esc51(s.ratesNote)}` : ''}</div>
<h2>Fradragsposter</h2><table><tr><th>Post</th><th>Type</th><th class="r">Grunnlag</th><th class="r">Fradrag</th><th class="r">Skatteverdi</th><th>Kilde</th></tr>${rows}
<tr class="sum"><td>Sum</td><td></td><td></td><td class="r">${money(s.total.deduction)}</td><td class="r">${money(s.total.value)}</td><td></td></tr></table>
${src ? `<h2>Grunnlag fra transaksjonene</h2>${src}` : ''}</body></html>`;
}

export function mountTax51(api, { R, W }) {
  api.get('/fin51/tax', R, (c) => c.json(taxSummary51(c.get('user'), { year: yearOf(c) })));
  api.put('/fin51/tax/profile', W, async (c) => {
    const u = c.get('user'), b = await c.req.json().catch(() => null);
    if (!b || typeof b !== 'object') return bad(c, 'Ugyldig profil');
    const p = cleanProfile(b, taxProfile51(u));
    kv.set(u, 'fin51_tax', p);
    return c.json({ profile: p });
  });
  api.get('/fin51/tax/export.csv', R, (c) => {
    const s = taxSummary51(c.get('user'), { year: yearOf(c) });
    return c.body(taxCsv51(s), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="skattehjelp-${s.year}.csv"`, 'Cache-Control': 'no-store' });
  });
  api.get('/fin51/tax/export.html', R, async (c) => {
    const u = c.get('user'), s = taxSummary51(u, { year: yearOf(c) });
    let who = '';
    try { who = (await import('../auth.js')).userInfo(u)?.name ?? ''; } catch { /* */ }
    return c.body(taxHtml51(s, who), 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="skattehjelp-${s.year}.html"` });
  });
}

/* ---------------- Påminnelse som varsel (én gang per år og type) ---------------- */

/** Sender påminnelsen til brukere med regnskap: 15. mars («skattemeldingen er klar») og 20. april («fristen nærmer seg»). */
export async function taxReminderTick51(today = today51()) {
  const md = today.slice(5), y = +today.slice(0, 4);
  const kind = md >= '04-20' && md <= '04-30' ? 'frist' : md >= '03-15' && md <= '04-30' ? 'klar' : null;
  if (!kind) return 0;
  let n = 0;
  for (const { user_id: u } of q('SELECT DISTINCT user_id FROM fh_transactions WHERE user_id IS NOT NULL').all()) {
    const p = taxProfile51(u);
    if (p.remind === false) continue;
    const sent = kv.get(u, 'fin51_tax_sent', {}) ?? {};
    const tag = `${y}:${kind}`;
    if (sent[tag]) continue;
    sent[tag] = Date.now();
    kv.set(u, 'fin51_tax_sent', sent);
    const s = taxSummary51(u, { year: y - 1, today });
    const body = kind === 'frist' ? `Fristen for skattemeldingen er 30. april. FinansHub fant fradrag med anslått skatteverdi ${krText51(Math.round(s.total.value))}.`
      : `Skattemeldingen for ${y - 1} er klar. Sjekk fradragene FinansHub har samlet (anslått skatteverdi ${krText51(Math.round(s.total.value))}).`;
    await notifyUser(u, { title: 'Skattemeldingen', body, url: '/finans/plan51#skatt', tag: `fin51-tax-${tag}`, category: 'finans' }).catch(() => {});
    n++;
  }
  return n;
}
let timer51 = null;
export function startTax51() {
  if (timer51) return;
  const tick = () => { taxReminderTick51().catch(() => {}); };
  setTimeout(tick, 60_000).unref?.();
  timer51 = setInterval(tick, 3 * 3600_000);
  timer51.unref?.();
}
