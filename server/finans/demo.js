// Demodata fra designet, flyttet til inneværende måned. Lastes bare inn når det ikke finnes transaksjoner.
import { db, OWNER, settings } from './db.js';

export function loadDemo() {
  const q = (sql) => db.prepare(sql);
  const cat = (n) => q('SELECT id FROM fh_categories WHERE name=?').get(n)?.id ?? null;
  const now = new Date();
  const day = (offsetMonths, d) => { const x = new Date(now.getFullYear(), now.getMonth() + offsetMonths, Math.min(d, 28)); return x.toLocaleDateString('sv-SE'); };
  db.transaction(() => {
    q("INSERT OR IGNORE INTO fh_categories(name,color,kind,sort) VALUES('Overføring','#6B6B75','transfer',99)").run();
    const acc = {};
    for (const [n, bank, type, l4, open, note] of [['Brukskonto', 'DNB', 'checking', '4821', 4000000, 'Hovedkonto'], ['Kredittkort', 'Bank Norwegian', 'credit', '9384', 0, 'Ramme 20 000 kr'],
      ['Sparekonto', 'DNB', 'savings', '1177', 7995000, '3,9 % rente'], ['Kontanter', 'Lommebok', 'cash', null, 65000, 'Manuell']]) {
      acc[n] = q('INSERT INTO fh_accounts(name,bank,type,last4,opening_balance,note) VALUES(?,?,?,?,?,?) RETURNING id').get(n, bank, type, l4, open, note).id;
    }
    const tx = q("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,category_id,source,created) VALUES(?,?,?,?,?,?,'manual',?)");
    const cur = [[16, 'REMA 1000 Bislett', 'Brukskonto', 'Mat og dagligvarer', -386.5], [15, 'Clas Ohlson', 'Kredittkort', 'Hjem', -349], [15, 'Circle K Lading', 'Kredittkort', 'Transport og lading', -612.4],
      [14, 'Fjordkraft strøm', 'Brukskonto', 'Bolig', -1284], [13, 'Kaffebrenneriet', 'Kredittkort', 'Restaurant og kafé', -89], [12, 'Lønn', 'Brukskonto', 'Inntekt', 41200],
      [11, 'Overføring sparekonto', 'Brukskonto', 'Sparing', -5000], [10, 'Ruter månedskort', 'Brukskonto', 'Transport og lading', -518], [9, 'Akademika', 'Kredittkort', 'Skole', -649],
      [8, 'Kiwi Majorstuen', 'Brukskonto', 'Mat og dagligvarer', -512.3], [6, 'Spotify', 'Kredittkort', 'Abonnementer', -129], [5, 'Peppes Pizza', 'Kredittkort', 'Restaurant og kafé', -436],
      [3, 'XXL', 'Kredittkort', 'Fritid og hobby', -620], [2, 'Meny Bislett', 'Brukskonto', 'Mat og dagligvarer', -874.9], [1, 'Husleie', 'Brukskonto', 'Bolig', -9500]];
    for (const [d, desc, a, c, amt] of cur) if (d <= now.getDate() || d <= 3) tx.run(acc[a], day(0, d), Math.round(amt * 100), desc, desc, cat(c), Date.now());
    // Historikk for grafer og oppdagelse av faste trekk.
    const UT = [36.8, 33.1, 38.4, 31.9, 35.2, 44.7, 39.9, 34.6, 32.8];
    for (let i = 1; i <= 9; i++) {
      tx.run(acc.Brukskonto, day(-i, 12), 4120000, 'Lønn', 'Lønn', cat('Inntekt'), Date.now());
      tx.run(acc.Brukskonto, day(-i, 1), -950000, 'Husleie', 'Husleie', cat('Bolig'), Date.now());
      tx.run(acc.Kredittkort, day(-i, 6), -12900, 'Spotify', 'Spotify', cat('Abonnementer'), Date.now());
      tx.run(acc.Brukskonto, day(-i, 10), -51800, 'Ruter månedskort', 'Ruter månedskort', cat('Transport og lading'), Date.now());
      tx.run(acc.Kredittkort, day(-i, 28), -27900, 'Netflix', 'Netflix', cat('Abonnementer'), Date.now());
      // Kredittkortet betales ned fra brukskontoen hver måned (overføring, telles ikke som utgift).
      const cardSpend = 12900 + 27900 + Math.round((UT[i - 1] * 1000 - 9500 - 129 - 518 - 279) * 100 * 0.45);
      tx.run(acc.Brukskonto, day(-i + 1, 2), -cardSpend, 'Nedbetaling kredittkort', 'Bank Norwegian', cat('Overføring'), Date.now());
      tx.run(acc.Kredittkort, day(-i + 1, 2), cardSpend, 'Innbetaling fra brukskonto', 'Bank Norwegian', cat('Overføring'), Date.now());
      const rest = Math.round((UT[i - 1] * 1000 - 9500 - 129 - 518 - 279) * 100);
      tx.run(acc.Brukskonto, day(-i, 18), -Math.round(rest * 0.55), 'REMA 1000', 'REMA 1000', cat('Mat og dagligvarer'), Date.now());
      tx.run(acc.Kredittkort, day(-i, 21), -Math.round(rest * 0.25), 'Peppes Pizza', 'Peppes Pizza', cat('Restaurant og kafé'), Date.now());
      tx.run(acc.Kredittkort, day(-i, 24), -Math.round(rest * 0.2), 'XXL', 'XXL', cat('Fritid og hobby'), Date.now());
    }
    // Bankrader slik de ser ut i en DNB-/Bank Norwegian-eksport (vises under «Original banktransaksjon»).
    const accs = Object.fromEntries(q('SELECT id, name, bank FROM fh_accounts').all().map((x) => [x.id, x]));
    const setRaw = q("UPDATE fh_transactions SET raw_bank_row=?, source='csv', external_id=? WHERE id=?");
    const mmdd = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
    for (const t of q("SELECT * FROM fh_transactions WHERE source='manual'").all()) {
      const a = accs[t.account_id];
      if (!a || a.bank === 'Lommebok') continue;
      const ref = String(80000000 + t.id * 7919).slice(0, 8);
      const card = a.bank === 'Bank Norwegian';
      const text = t.amount > 0 ? (/lønn/i.test(t.description) ? 'Lønn 36310 Arbeidsgiver AS' : `Overføring ${t.description}`)
        : /overføring|nedbetaling/i.test(t.description) ? `Nettbank til: ${t.description}` : /husleie/i.test(t.description) ? 'Avtalegiro Husleie Bislett Eiendom'
        : `${card ? 'Kortkjøp' : 'Visa 100021 Varekjøp'} ${t.description.toUpperCase()} Dato ${mmdd(t.date)} kl. ${String(9 + (t.id % 11)).padStart(2, '0')}.${String((t.id * 7) % 60).padStart(2, '0')}`;
      const nb = (v) => (Math.abs(v) / 100).toFixed(2).replace('.', ',');
      const raw = card ? { TransactionDate: t.date, Text: text, Type: t.amount < 0 ? 'Kjøp' : 'Innbetaling', 'Currency Amount': nb(t.amount), Amount: (t.amount < 0 ? '-' : '') + nb(t.amount) }
        : { Dato: t.date.split('-').reverse().join('.'), Forklaring: text, Rentedato: t.date.split('-').reverse().join('.'), 'Ut fra konto': t.amount < 0 ? nb(t.amount) : '', 'Inn på konto': t.amount > 0 ? nb(t.amount) : '', Arkivref: ref };
      for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
      setRaw.run(JSON.stringify({ bookingDate: card ? t.date : raw.Dato, valueDate: card ? null : raw.Rentedato, description: text, amount: t.amount / 100, archiveReference: card ? null : ref,
        raw, account: a.name, bank: a.bank, source: `CSV · ${a.bank}`, file: card ? 'transaksjoner.xlsx' : 'Kontoutskrift.csv', importedAt: Date.now() }), `demo:${t.id}`, t.id);
    }
    const bud = q("INSERT OR REPLACE INTO fh_budgets(category_id,month,amount) VALUES(?, 'default', ?)");
    for (const [c, v] of Object.entries({ 'Mat og dagligvarer': 6000, 'Restaurant og kafé': 1800, 'Transport og lading': 1500, Bolig: 11000, Hjem: 1000, 'Fritid og hobby': 1500, Abonnementer: 750, Skole: 1000 })) bud.run(cat(c), v * 100);
    const rec = q('INSERT INTO fh_recurring(name,amount,interval,day,category_id,account_id) VALUES(?,?,?,?,?,?)');
    for (const [n, a, d, c] of [['Husleie', 9500, 1, 'Bolig'], ['Spotify', 129, 6, 'Abonnementer'], ['Ruter månedskort', 518, 10, 'Transport og lading'], ['Mobilabonnement', 399, 20, 'Abonnementer'],
      ['Innboforsikring', 214, 25, 'Bolig'], ['Netflix', 279, 28, 'Abonnementer'], ['Treningssenter', 549, 1, 'Fritid og hobby']]) rec.run(n, a * 100, 'monthly', d, cat(c), acc.Brukskonto);
    const goal = q('INSERT INTO fh_goals(name,saved,target,color) VALUES(?,?,?,?)');
    for (const [n, s, t, c] of [['Bufferkonto', 52000, 60000, '#5FD3A8'], ['Sommer 2027', 8400, 20000, '#7AA7FF'], ['Ny PC', 24550, 40000, '#FF7A3D']]) goal.run(n, s * 100, t * 100, c);
    // To kvitteringer i gjennomgangskøen, matchet mot kortkjøpene.
    const rc = q("INSERT INTO fh_receipts(id,status,provider,model,seconds,extraction,merchant,date,total,category_id,account_id,confidence,transaction_id,created) VALUES(?,'needs_review',?,?,?,?,?,?,?,?,?,?,(SELECT id FROM fh_transactions WHERE description=? LIMIT 1),?)");
    rc.run('demo-1', 'ollama', 'qwen2.5vl:7b', 11.4, JSON.stringify({ merchant: 'Clas Ohlson', lines: [{ description: 'Skjøteledning', amount: 199 }, { description: 'Lyspære E27 ×2', amount: 150 }], vat: [{ rate: 25, amount: 69.8 }], confidence: { total: 0.97 } }), 'Clas Ohlson', day(0, 15), 34900, cat('Hjem'), acc.Kredittkort, 0.97, 'Clas Ohlson', Date.now());
    rc.run('demo-2', 'gemini', 'gemini-2.5-flash', 2.1, JSON.stringify({ merchant: 'Circle K Lading', lines: [], vat: [], confidence: { total: 0.72 } }), 'Circle K Lading', day(0, 15), 61240, cat('Transport og lading'), acc.Kredittkort, 0.72, 'Circle K Lading', Date.now() - 1000);
    q("UPDATE fh_receipts SET ai_short='Skjøteledning og to lyspærer til hjemmet', ai_long='Kjøp hos Clas Ohlson: en skjøteledning og to E27-lyspærer. Kategorisert som hjem.', domain='clasohlson.com' WHERE id='demo-1'").run();
    q("UPDATE fh_receipts SET ai_short='Hurtiglading av elbil', domain='circlek.no' WHERE id='demo-2'").run();
    // FinansHub v2: abonnementer, delte mapper og Finn-handler.
    const sub = q('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,low_use,domain,ai_short,created) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const [n, p, v, cyc, nd, use, low, dom, ai] of [['Netflix', 'Standard', 149, 'monthly', 17, 'Sett 2 t siste 30 d', 1, 'netflix.com', 'Strømmetjeneste, månedlig trekk'],
      ['Spotify', 'Familie', 239, 'monthly', 5, 'Daglig', 0, 'spotify.com', 'Musikkabonnement, familieplan'], ['iCloud+', '200 GB', 39, 'monthly', 12, '86 % brukt', 0, 'apple.com', 'Lagringsplass i iCloud'],
      ['Proton', 'Mail Plus · EUR 1', 11, 'monthly', 25, 'Ukentlig', 0, 'proton.me', 'Proton Mail Plus, betalt i euro'], ['ChatGPT', 'Plus', 229, 'monthly', 19, 'Ikke åpnet på 26 d', 1, 'openai.com', 'AI-abonnement, lite brukt siste måned'],
      ['Viaplay', 'Total', 449, 'monthly', 15, 'Sett 1 t siste 30 d', 1, 'viaplay.no', 'Strømmetjeneste, månedlig trekk'], ['Cloudflare', 'Domene', 108, 'yearly', 150, 'Årlig 108 kr', 0, 'cloudflare.com', 'Domenefornyelse'],
      ['Ruter', '30-dagers', 518, 'monthly', 23, 'Daglig', 0, 'ruter.no', 'Kollektivbillett i Ruter-appen']]) {
      const x = new Date(now); x.setDate(x.getDate() + nd);
      sub.run(n, p, v * 100, cyc, x.toLocaleDateString('sv-SE'), use, low, dom, ai, Date.now());
    }
    sub.run('NordVPN', '2-årsplan', 120000, 'biennial', (() => { const x = new Date(now); x.setMonth(x.getMonth() + 14); return x.toLocaleDateString('sv-SE'); })(), 'Ukentlig', 0, 'nordvpn.com', 'VPN, betalt for to år om gangen', Date.now());
    // Delte mapper: boliger med prosjekter, faste regninger og strøm hver måned (fra designet).
    const users = new Map(db.prepare('SELECT id, username, name FROM users').all().map((u) => [(u.name || u.username).toLowerCase(), u.id]));
    const me = settings().name;
    const Y = now.getFullYear(), M = now.getMonth() + 1;
    const ym = (m, d) => `${Y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const folder = q('INSERT INTO fh_folders(name,type,address,owner_id,created) VALUES(?,?,?,?,?) RETURNING id');
    const mem = q('INSERT INTO fh_folder_members(folder_id,name,email,role,status,user_id) VALUES(?,?,?,?,?,?)');
    const ent = q('INSERT INTO fh_folder_entries(folder_id,description,date,amount,paid_by,category,project_id,created) VALUES(?,?,?,?,?,?,?,?)');
    const proj = q('INSERT INTO fh_folder_projects(folder_id,name,vendor,budget,category,created) VALUES(?,?,?,?,?,?) RETURNING id');
    const inst = q('INSERT INTO fh_project_installments(project_id,label,due,amount,paid_at,sort) VALUES(?,?,?,?,?,?)');
    const bill = q('INSERT INTO fh_folder_bills(folder_id,name,category,freq,payer,next_due) VALUES(?,?,?,?,?,?)');
    const EL = (vals, who) => vals.slice(0, M).map((v, i) => [`Fjordkraft · strøm ${['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'][i]}`, ym(i + 1, 2), who[i % who.length], v, 'Strøm']);
    const HOMES = [
      { name: 'Huset Bislett', type: 'Enebolig', addr: 'Bislettgata 8, 0170 Oslo', mem: [[me, 'owner'], ['Ingrid', 'owner']],
        rows: [['Plantasjen · blomster til uteplassen', ym(10, 12), 'Ingrid', 1289, 'Hage og uteområde'], ['Oslo kommune · vann og avløp Q3', ym(9, 20), 'Ingrid', 3120, 'Vann og avløp'], ['Plantasjen · jord og gjødsel', ym(9, 14), 'Ingrid', 640, 'Hage og uteområde'],
          ['Pool & Spa · pumpe og sandfilter', ym(8, 30), me, 7490, 'Basseng'], ['Mester Grønn · sommerblomster', ym(6, 5), 'Ingrid', 980, 'Hage og uteområde'], ['Oslo kommune · eiendomsskatt', ym(4, 15), me, 4210, 'Kommunale avgifter'],
          ...EL([3480, 3120, 2650, 1980, 1420, 1180, 1090, 1240, 1960, 2380, 2900, 3300], [me, 'Ingrid'])],
        projects: [{ name: 'Badebasseng', vendor: 'Snekker Hansen AS', budget: 180000, cat: 'Basseng', pay: [['Forskudd 30 %', ym(9, 3), 54000, true], ['Avdrag 2 · grunnarbeid', ym(10, 5), 45000, true], ['Avdrag 3 · terrasse rundt bassenget', ym(11, 15), 45000, false], ['Sluttoppgjør etter befaring', 'ca. 15.12', 36000, false]] }],
        bills: [['Fjordkraft', 'Strøm', 'Månedlig', me, ym(11, 2)], ['Oslo kommune', 'Vann og avløp', 'Kvartalsvis', 'Ingrid', ym(12, 20)], ['Oslo kommune', 'Kommunale avgifter', 'Årlig', me, `${Y + 1}-04-15`], ['Gjensidige', 'Forsikring', 'Årlig', 'Ingrid', `${Y + 1}-08-01`]] },
      { name: 'Hytta Geilo', type: 'Hytte', addr: 'Fjellvegen 12, 3580 Geilo', mem: [[me, 'owner'], ['Ingrid', 'editor'], ['Pål', 'editor']],
        rows: [['Ved og pellets · Biltema', ym(9, 28), 'Pål', 1290, 'Vedlikehold'], ['Hol kommune · vann og avløp', ym(9, 15), me, 2140, 'Vann og avløp'], ['Hol kommune · renovasjon og feiing', ym(9, 15), me, 3420, 'Kommunale avgifter'],
          ['Gjensidige · hytteforsikring', ym(7, 1), 'Ingrid', 5890, 'Forsikring'], ...EL([2860, 2540, 2100, 880, 420, 310, 520, 380, 1320, 1840, 2300, 2700], [me, 'Ingrid', 'Pål'])],
        projects: [{ name: 'Nytt vedskjul', vendor: 'Geilo Bygg AS', budget: 24000, cat: 'Håndverker', pay: [['Materialer og arbeid', ym(8, 22), 14500, true], ['Tak og beis', ym(11, 1), 9500, false]] }],
        bills: [['Fjordkraft', 'Strøm', 'Månedlig', me, ym(11, 2)], ['Hol kommune', 'Vann og avløp', 'Halvårlig', me, `${Y + 1}-03-15`], ['Gjensidige', 'Forsikring', 'Årlig', 'Ingrid', `${Y + 1}-07-01`]] },
      { name: 'Felles husholdning', type: 'Annet', addr: 'Daglige felleskjøp', mem: [[me, 'owner'], ['Ingrid', 'owner']],
        rows: [['Rema 1000 Bislett', ym(M, Math.min(16, now.getDate())), me, 386, 'Dagligvarer'], ['IKEA', ym(M, Math.min(5, now.getDate())), 'Ingrid', 1499, 'Vedlikehold']], projects: [], bills: [] },
    ];
    for (const h of HOMES) {
      const id = folder.get(h.name, h.type, h.addr, OWNER, Date.now()).id;
      for (const [n, role] of h.mem) mem.run(id, n, null, role, 'active', n === me ? OWNER : users.get(n.toLowerCase()) ?? null);
      for (const p of h.projects) {
        const pid = proj.get(id, p.name, p.vendor, p.budget * 100, p.cat, Date.now()).id;
        p.pay.forEach(([label, due, v, paid], i) => {
          inst.run(pid, label, due, v * 100, paid ? Date.now() : null, i);
          if (paid) ent.run(id, `${p.vendor} · ${label.toLowerCase()}`, due, v * 100, me, p.cat, pid, Date.now());
        });
      }
      for (const [d, date, who, v, cat] of h.rows) if (date <= now.toLocaleDateString('sv-SE')) ent.run(id, d, date, v * 100, who, cat, null, Date.now());
      for (const b of h.bills) bill.run(id, ...b);
    }
    const finn = q('INSERT INTO fh_finn(role,item,counterpart,date,amount,steps,created) VALUES(?,?,?,?,?,?,?)');
    for (const [role, item, who, dd, v, steps, done] of [['bought', 'Sykkel Trek FX 3', 'selger Kari N.', 12, 4500, ['Trygg betaling', 'Fiks ferdig · sendt', 'Tillit forsikring', 'Ikke mottatt'], 2],
      ['sold', 'iPhone 13 128 GB', 'kjøper Ola H.', 8, 3200, ['Trygg betaling', 'Fiks ferdig · levert', 'Utbetalt'], 3], ['bought', 'Kontorstol HÅG', 'selger Mona L.', 1, 1200, ['Trygg betaling', 'Fiks ferdig · levert', 'Godkjent'], 3],
      ['sold', 'PS5-kontroller', 'kjøper Jonas B.', -2, 450, ['Trygg betaling', 'Venter på sending'], 1]]) {
      finn.run(role, item, who, dd > 0 ? day(0, dd) : day(-1, 28 + dd), v * 100, JSON.stringify(steps.map((t, i) => ({ t, done: i < done }))), Date.now());
    }
  })();
}
