// Demodata fra designet, flyttet til inneværende måned. Lastes bare inn når det ikke finnes transaksjoner.
import { db } from './db.js';

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
  })();
}
