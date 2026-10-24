// Prompt 51 (FIN51): Finans fase 2 – sparemål (fremdrift, bilde, «rund opp»), faste utgifter-kalender med saldoprognose,
// skattehjelp (fradragsposter, påminnelse, eksport), prishistorikk fra kvitteringsvarelinjer og abonnementsjeger
// (prisøkninger, doble, ubrukte, oppsigelsestekst fra lokal modell). Alt per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51fin-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51fin';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.PORT = '4611';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
delete process.env.MOCK_DATA;
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENWEBUI_URL', 'OPENWEBUI_KEY']) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
const fin = await import('../server/finans/fin51.js');
const tax = await import('../server/finans/fin51-tax.js');
const pr = await import('../server/finans/fin51-prices.js');
const ut = await import('../server/finans/fin51-util.js');

let ip = 30;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ip++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (cookie) => (path, method = 'GET', body, extra = {}) => req(path, { method, headers: { cookie, ...(extra.headers ?? {}) }, body, raw: extra.raw });
const A = as(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = as(await login('kari', 'kariPassord123'));
await A('/finans/api/transactions'); await K('/finans/api/transactions');
const SEB = db.prepare("SELECT user_id u FROM fh_categories WHERE user_id<>(SELECT id FROM users WHERE username='kari') LIMIT 1").get()?.u
  ?? db.prepare("SELECT id FROM users WHERE username='sebastian'").get().id;
const KARI = db.prepare("SELECT id FROM users WHERE username='kari'").get().id;

const T = ut.today51();
const D = (n) => ut.addDays51(T, n);
const acc = (u, name, type = 'checking', opening = 0) => db.prepare('INSERT INTO fh_accounts(name,bank,type,opening_balance,user_id) VALUES(?,?,?,?,?) RETURNING id').get(name, 'DNB', type, opening, u).id;
let ext = 0;
const tx = (u, date, kr, text, account = null) => db.prepare("INSERT INTO fh_transactions(account_id,date,amount,description,merchant,source,external_id,created,user_id) VALUES(?,?,?,?,?,'csv',?,?,?)")
  .run(account, date, Math.round(kr * 100), text, text, `p51fin-${ext++}`, Date.now(), u);
const sub = (u, o) => db.prepare('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,active,low_use,prev_price,price_changed,charge_day,usage_note,created,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
  .get(o.name, o.plan ?? '', Math.round(o.price * 100), o.cycle ?? 'monthly', o.next ?? null, o.active ?? 1, o.low ?? 0, o.prev != null ? Math.round(o.prev * 100) : null, o.changed ?? null, o.day ?? null, o.note ?? '', Date.now(), u).id;
let rcN = 0;
const receipt = (u, merchant, date, lines) => db.prepare("INSERT INTO fh_receipts(id,status,merchant,date,total,extraction,created,user_id) VALUES(?,'booked',?,?,?,?,?,?)")
  .run(`p51r${rcN++}`, merchant, date, Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100), JSON.stringify({ merchant, lines }), Date.now(), u);

test('uten innlogging: 401 på alle FIN51-rutene', async () => {
  for (const p of ['/finans/api/fin51/goals', '/finans/api/fin51/calendar', '/finans/api/fin51/tax', '/finans/api/fin51/prices', '/finans/api/fin51/hunter']) assert.equal((await req(p)).status, 401, p);
  assert.equal((await req('/finans/plan51')).status, 302);
});

test('hjelpere: datoer, nøkler og normaliserte varenavn', () => {
  assert.equal(ut.addMonths51('2026-01-31', 1), '2026-02-28');
  assert.equal(ut.addMonths51('2026-11-15', 3), '2027-02-15');
  assert.equal(ut.addMonths51('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(ut.key51('VISA 1234 NETFLIX.COM'), ut.key51('Netflix'));
  assert.equal(pr.itemKey51('TINE LETTMELK 1 L'), pr.itemKey51('Tine Lettmelk 1L'));
  assert.equal(pr.itemKey51('TINE LETTMELK 1,75 L'), 'tine lettmelk 1.75l');
  assert.equal(pr.itemKey51('BANANER 1,234 kg x 24,90'), 'bananer');
  assert.equal(pr.itemKey51('2 x GRANDIOSA'), 'grandiosa');
  assert.equal(pr.itemKey51('PANT'), null);
  assert.equal(pr.itemKey51('Totalt 123,40'), null);
  assert.deepEqual(pr.unitPrice51({ description: 'BANANER 1,234 kg x 24,90', amount: 30.73 }), { price: 24.9, unit: 'kg' });
  assert.deepEqual(pr.unitPrice51({ description: 'GRANDIOSA', qty: 2, amount: 100 }), { price: 50, unit: 'stk' });
  assert.equal(pr.storeOf51('REMA 1000 MAJORSTUEN'), 'REMA 1000');
  assert.equal(pr.storeOf51('Coop Extra Lambertseter'), 'Coop Extra');
  assert.equal(pr.storeOf51('EXTRA Bryn'), 'Extra');
});

test('sparemål: opprette, sette inn, fremdrift, frist, bilde, konto og per bruker', async () => {
  const r = await A('/finans/api/fin51/goals', 'POST', { name: 'Japan-tur', target: 30000, saved: 3000, deadline: ut.addMonths51(T, 6), color: '#2f7a4f' });
  assert.equal(r.status, 200, r.text);
  const g = r.body;
  assert.equal(g.saved, 3000); assert.equal(g.target, 30000); assert.equal(g.pct, 10); assert.equal(g.remaining, 27000);
  assert.equal(g.status, 'behind', 'startbeløpet teller ikke som tempo');
  assert.ok(g.perMonth > 4000 && g.perMonth < 5000, `perMonth ${g.perMonth}`);
  assert.match(g.statusText, /Spar .* i måneden/);
  const d = await A(`/finans/api/fin51/goals/${g.id}/deposit`, 'POST', { amount: 15000 });
  assert.equal(d.status, 200); assert.equal(d.body.saved, 18000); assert.equal(d.body.status, 'on_track', d.body.statusText);
  const w = await A(`/finans/api/fin51/goals/${g.id}/deposit`, 'POST', { amount: -500, note: 'Uttak' });
  assert.equal(w.body.saved, 17500);
  const mv = await A(`/finans/api/fin51/goals/${g.id}/moves`);
  assert.deepEqual(mv.body.items.map((m) => m.source).sort(), ['manual', 'manual', 'start']);
  // Bilde (PNG), og bare eieren får det.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  const im = await A(`/finans/api/fin51/goals/${g.id}/image`, 'PUT', undefined, { raw: png, headers: { 'content-type': 'image/png' } });
  assert.equal(im.status, 200, im.text); assert.match(im.body.imageUrl, /\/finans\/api\/fin51\/goals\/\d+\/image/);
  const got = await app.request(im.body.imageUrl, { headers: { cookie: (await login('sebastian', 'testpassord1')) } });
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal((await K(im.body.imageUrl)).status, 404);
  assert.equal((await A(`/finans/api/fin51/goals/${g.id}/image`, 'PUT', undefined, { raw: Buffer.from('ikke et bilde'), headers: { 'content-type': 'image/png' } })).status, 400);
  // Kari ser ikke målet og kan ikke endre det.
  assert.equal((await K('/finans/api/fin51/goals')).body.items.length, 0);
  assert.equal((await K(`/finans/api/fin51/goals/${g.id}`, 'PATCH', { name: 'Hacket' })).status, 404);
  assert.equal((await K(`/finans/api/fin51/goals/${g.id}/deposit`, 'POST', { amount: 1 })).status, 404);
  // Sparekonto: «spart» følger saldoen, og innskudd må gjøres i nettbanken.
  const sav = acc(SEB, 'Sparekonto', 'savings', 500000);
  tx(SEB, D(-10), 2000, 'Overføring til sparing', sav);
  const g2 = (await A('/finans/api/fin51/goals', 'POST', { name: 'Buffer', target: 50000, accountId: sav })).body;
  assert.equal(g2.followsAccount, true); assert.equal(g2.saved, 7000); assert.equal(g2.account, 'Sparekonto');
  assert.equal((await A(`/finans/api/fin51/goals/${g2.id}/deposit`, 'POST', { amount: 100 })).status, 409);
  assert.equal((await K('/finans/api/fin51/goals', 'POST', { name: 'X', target: 10, accountId: sav })).status, 400, 'andres konto');
  const list = await A('/finans/api/fin51/goals');
  assert.equal(list.body.items.length, 2); assert.equal(list.body.totals.target, 80000);
  assert.equal((await A(`/finans/api/fin51/goals/${g2.id}`, 'DELETE')).status, 200);
  assert.equal((await A('/finans/api/fin51/goals')).body.items.length, 1);
});

test('«rund opp»: forslag fra kjøpene, satt inn på målet, ikke talt to ganger', async () => {
  const goal = (await A('/finans/api/fin51/goals')).body.items[0];
  tx(SEB, D(-3), -43.2, 'REMA 1000 MAJORSTUEN');
  tx(SEB, D(-2), -99, 'KIWI 123');
  tx(SEB, D(-2), -100, 'Vinmonopolet'); // rundt beløp → 0
  tx(SEB, D(-1), 25000, 'Lønn'); // inntekt teller ikke
  const ru = await A('/finans/api/fin51/roundup?step=10');
  assert.equal(ru.status, 200);
  assert.equal(ru.body.count, 2, JSON.stringify(ru.body)); assert.equal(ru.body.amount, 7.8);
  assert.match(ru.body.text, /Rund opp 2 kjøp/);
  assert.equal((await A('/finans/api/fin51/roundup', 'PUT', { step: 7 })).status, 400);
  const st = await A('/finans/api/fin51/roundup', 'PUT', { step: 50, goalId: goal.id });
  assert.equal(st.body.step, 50); assert.equal(st.body.amount, 7.8, '50 − 43,20 + 100 − 99');
  assert.equal(st.body.goalId, goal.id);
  const ap = await A('/finans/api/fin51/roundup/apply', 'POST', { goalId: goal.id, step: 10 });
  assert.equal(ap.status, 200, ap.text);
  assert.equal(ap.body.applied.amount, 7.8); assert.equal(ap.body.goal.saved, goal.saved + 7.8);
  assert.equal((await A('/finans/api/fin51/roundup')).body.count, 0, 'samme kjøp foreslås ikke igjen');
  assert.equal((await A('/finans/api/fin51/roundup/apply', 'POST', { goalId: goal.id })).status, 409);
  assert.equal((await K('/finans/api/fin51/roundup')).body.count, 0, 'Kari har ingen kjøp');
});

test('kalender: abonnementer, faste utgifter, funne trekk og lønn de neste 30 dagene, med saldo dag for dag', async () => {
  const bk = acc(KARI, 'Brukskonto', 'checking', 1_000_000); // 10 000 kr
  const day = (n) => +D(n).slice(8, 10);
  sub(KARI, { name: 'Netflix', price: 129, next: D(5) });
  sub(KARI, { name: 'Gammel next_date', price: 50, next: ut.addMonths51(D(3), -2) }); // rulles fram
  db.prepare("INSERT INTO fh_recurring(name,amount,interval,day,account_id,active,user_id) VALUES('Husleie',1200000,'monthly',?,?,1,?)").run(day(10), bk, KARI);
  db.prepare("INSERT INTO fh_recurring(name,amount,interval,day,account_id,active,user_id) VALUES('Netflix dobbel',12900,'monthly',?,?,1,?)").run(day(5), bk, KARI);
  // Strømregning funnet i transaksjonene (hver måned, likt beløp) og lønn hver måned.
  for (let i = 4; i >= 1; i--) { tx(KARI, ut.addMonths51(D(7), -i), -800, 'Tibber strøm', bk); tx(KARI, ut.addMonths51(D(12), -i), 30000, 'ARBEIDSGIVER AS LØNN', bk); }
  const c = await K('/finans/api/fin51/calendar?days=30');
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.days.length, 30); assert.equal(c.body.from, T); assert.equal(c.body.to, D(29));
  const names = c.body.items.map((i) => `${i.date}:${i.kind}:${i.name}`);
  assert.ok(names.includes(`${D(5)}:sub:Netflix`), names.join(' | '));
  assert.ok(!names.some((n) => n.includes('Netflix dobbel')), 'samme tjeneste telles én gang');
  assert.ok(names.includes(`${D(10)}:recurring:Husleie`));
  const near = (n, kind) => [n - 1, n, n + 1].some((x) => names.some((m) => m.startsWith(`${D(x)}:${kind}`))); // ±1 dag ved månedsslutt
  assert.ok(near(7, 'detected:Tibber'), names.join(' | '));
  assert.ok(near(12, 'income:'), names.join(' | '));
  assert.ok(near(3, 'sub:Gammel next_date'), 'gammel next_date rulles fram');
  const a = c.body.accounts.find((x) => x.id === bk);
  const balAt = (n) => a.series.find((s) => s.date === D(n)).balance;
  const startBal = 10000 + 4 * (30000 - 800);
  assert.equal(a.start, startBal);
  assert.equal(balAt(4), startBal - 50);
  assert.equal(balAt(5), startBal - 50 - 129);
  assert.equal(balAt(14), startBal - 50 - 129 - 800 - 12000 + 30000);
  assert.ok(a.min <= balAt(10));
  assert.ok(c.body.total.out < 0 && c.body.total.in > 0);
  assert.equal(c.body.days.find((x) => x.date === D(5)).items[0].account, 'Brukskonto');
  // Sebastian ser ikke Karis trekk.
  assert.ok(!(await A('/finans/api/fin51/calendar')).body.items.some((i) => i.name === 'Husleie'));
  // Kontoen går i minus → varsel.
  db.prepare("INSERT INTO fh_recurring(name,amount,interval,day,account_id,active,user_id) VALUES('Stort trekk',50000000,'monthly',?,?,1,?)").run(day(20), bk, KARI);
  const c2 = await K('/finans/api/fin51/calendar');
  assert.ok(c2.body.warnings.some((w) => /går i minus/.test(w)), JSON.stringify(c2.body.warnings));
  assert.equal(c2.body.lowest.accountId, bk);
});

test('skattehjelp: fradragsposter fra transaksjonene og profilen, grenser, eksport og påminnelse', async () => {
  const Y = 2025;
  tx(SEB, `${Y}-02-15`, -4200, 'Lånerente DNB boliglån');
  tx(SEB, `${Y}-03-15`, -4300, 'Renter lån');
  tx(SEB, `${Y}-03-20`, 150, 'Renteinntekt sparekonto'); // ikke fradrag
  tx(SEB, `${Y}-05-01`, -600, 'Vipps*Redd Barna');
  tx(SEB, `${Y}-06-01`, -300, 'KIRKENS BYMISJON GAVE'); // under 500 kr
  for (let m = 1; m <= 12; m++) tx(SEB, `${Y}-${String(m).padStart(2, '0')}-05`, -700, 'Fagforbundet kontingent');
  tx(SEB, `${Y}-04-10`, -1500, 'Overføring IPS individuell pensjonssparing');
  const p = await A('/finans/api/fin51/tax/profile', 'PUT', { commuteKm: 20, workDays: 230, bsu: 27500, gifts: [{ org: 'Leger Uten Grenser', amount: 1000 }] });
  assert.equal(p.status, 200); assert.equal(p.body.profile.commuteKm, 20);
  const s = (await A(`/finans/api/fin51/tax?year=${Y}`)).body;
  assert.equal(s.year, Y);
  const it = Object.fromEntries(s.items.map((i) => [i.key, i]));
  assert.equal(it.interest.basis, 8500); assert.equal(it.interest.source, 'transaksjoner'); assert.equal(it.interest.value, 1870);
  assert.equal(it.travel.basis, 16836); assert.equal(it.travel.deduction, 4836); assert.equal(it.travel.source, 'registrert');
  assert.equal(it.gifts.basis, 1600, JSON.stringify(it.gifts.orgs)); assert.ok(it.gifts.orgs.some((o) => !o.counts && /bymisjon/i.test(o.org)));
  assert.equal(it.union.basis, 8400); assert.equal(it.union.deduction, 8000);
  assert.equal(it.bsu.kind, 'skattefradrag'); assert.equal(it.bsu.value, 2750); assert.equal(it.bsu.deduction, 0);
  assert.equal(it.ips.deduction, 1500);
  assert.ok(Math.abs(s.total.value - s.items.reduce((a, i) => a + i.value, 0)) < 0.01);
  assert.match(s.disclaimer, /ikke skatteråd/);
  // Kari har ingenting.
  const k = (await K(`/finans/api/fin51/tax?year=${Y}`)).body;
  assert.equal(k.total.value, 0); assert.ok(k.items.find((i) => i.key === 'travel').missing);
  // Eksport.
  const csv = await A(`/finans/api/fin51/tax/export.csv?year=${Y}`);
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.text.replace(/^\ufeff/, '').startsWith('Inntektsår;Post;'), csv.text.slice(0, 40));
  assert.ok(tax.taxCsv51((await A(`/finans/api/fin51/tax?year=${Y}`)).body).startsWith('\ufeff'), 'BOM for Excel');
  assert.match(csv.text, /Rentefradrag;fradrag;8500;8500;1870;transaksjoner/);
  assert.match(csv.text, /Forbehold/);
  const html = await A(`/finans/api/fin51/tax/export.html?year=${Y}`);
  assert.equal(html.status, 200); assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(html.text, /Skattehjelp for 2025/); assert.match(html.text, /Forbehold/); assert.ok(!/<script/i.test(html.text));
  // Påminnelse og standardår.
  assert.equal(tax.taxReminder51('2026-03-20').show, true); assert.match(tax.taxReminder51('2026-03-20').text, /fristen er 30\. april/);
  assert.equal(tax.taxReminder51('2026-02-20').show, true); assert.equal(tax.taxReminder51('2026-06-01').show, false);
  assert.equal(tax.defaultTaxYear51('2026-03-20'), 2025); assert.equal(tax.defaultTaxYear51('2026-10-20'), 2026);
  const n1 = await tax.taxReminderTick51('2026-03-16');
  assert.ok(n1 >= 1);
  assert.equal(await tax.taxReminderTick51('2026-03-17'), 0, 'én gang per år og type');
  assert.equal(await tax.taxReminderTick51('2026-06-01'), 0);
  const q = db.prepare("SELECT count(*) n FROM notify_queue WHERE user_id=? AND title='Skattemeldingen'").get(SEB).n;
  assert.equal(q, 1);
  await A('/finans/api/fin51/tax/profile', 'PUT', { remind: false });
  assert.equal(await tax.taxReminderTick51('2026-04-21'), 1, 'bare Kari (har transaksjoner) får fristvarselet');
});

test('prishistorikk: pris per butikk over tid, «har økt», billigste butikk', async () => {
  receipt(SEB, 'REMA 1000 MAJORSTUEN', '2025-03-04', [{ description: 'TINE LETTMELK 1 L', amount: 21.9 }, { description: 'BANANER 1,000 kg x 22,90', amount: 22.9 }, { description: 'GRANDIOSA', qty: 2, amount: 100 }, { description: 'PANT', amount: 2 }]);
  receipt(SEB, 'REMA 1000 Grünerløkka', '2026-09-01', [{ description: 'Tine Lettmelk 1L', amount: 24.9 }, { description: 'BANANER 0,812 kg x 26,90', amount: 21.84 }, { description: 'Grandiosa', amount: 55 }]);
  receipt(SEB, 'KIWI ULLEVÅL', '2026-09-10', [{ description: 'TINE LETTMELK 1L', amount: 23.5 }, { description: 'BANANER 1,1 kg x 24,90', amount: 27.39 }, { description: '2 x GRANDIOSA', amount: 98 }]);
  receipt(KARI, 'MENY', '2026-09-10', [{ description: 'TINE LETTMELK 1L', amount: 29.9 }]);
  const p = await A('/finans/api/fin51/prices');
  assert.equal(p.status, 200);
  const milk = p.body.items.find((i) => i.slug === 'tine lettmelk 1l');
  assert.ok(milk, p.body.items.map((i) => i.key).join(', '));
  assert.equal(milk.count, 3); assert.equal(milk.unit, 'stk');
  assert.equal(milk.changePct, 13.7); assert.match(milk.changeText, /Har økt 13,7 % siden mars 2025 hos REMA 1000/);
  assert.deepEqual(milk.stores.map((s) => s.store), ['Kiwi', 'REMA 1000']);
  assert.deepEqual(milk.cheapest, { store: 'Kiwi', price: 23.5, savingPct: 6 });
  const ban = p.body.items.find((i) => i.slug === 'bananer');
  assert.equal(ban.unit, 'kg'); assert.equal(ban.last.price, 24.9);
  const gr = p.body.items.find((i) => i.slug === 'grandiosa');
  assert.equal(gr.first.price, 50); assert.equal(gr.last.price, 49);
  assert.ok(!p.body.items.some((i) => i.slug === 'pant'));
  assert.equal(p.body.basket.cheapest, 'Kiwi', JSON.stringify(p.body.basket)); assert.match(p.body.basket.text, /Kiwi er billigst/);
  assert.equal(p.body.receipts, 3);
  const one = await A(`/finans/api/fin51/prices/item?key=${encodeURIComponent(milk.key)}`);
  assert.equal(one.status, 200); assert.equal(one.body.points.length, 3);
  assert.equal((await A('/finans/api/fin51/prices?q=kiwi')).body.items.length, 3);
  // Kari ser bare sin egen kvittering.
  const k = await K('/finans/api/fin51/prices');
  assert.equal(k.body.items.length, 1); assert.equal(k.body.items[0].stores[0].store, 'Meny');
  assert.equal((await K(`/finans/api/fin51/prices/item?key=${encodeURIComponent('bananer|kg')}`)).status, 404);
});

test('abonnementsjeger: prisøkninger, doble, ubrukte, avvis og oppsigelsestekst fra lokal modell', async () => {
  const spot = sub(SEB, { name: 'Spotify', plan: 'Premium', price: 139, prev: 119, changed: D(-20), next: D(4) });
  sub(SEB, { name: 'Tidal', price: 129, next: D(9) });
  sub(SEB, { name: 'Dropbox', price: 119, next: D(2) });
  sub(SEB, { name: 'Dropbox', plan: 'Ekstra konto', price: 119, next: D(12) });
  const hbo = sub(SEB, { name: 'HBO Max', price: 99, next: D(6) });
  const vpn = sub(SEB, { name: 'NordVPN', price: 59, next: D(15), low: 1, note: 'Ikke brukt siden sommeren' });
  for (const [i, kr] of [[4, 129], [3, 129], [2, 129], [1, 149]]) tx(SEB, ut.addMonths51(D(-1), -i + 1), -kr, 'NETFLIX.COM');
  const h0 = await A('/finans/api/fin51/hunter');
  assert.equal(h0.status, 200);
  const f = h0.body.findings;
  const kinds = (k) => f.filter((x) => x.kind === k);
  assert.ok(kinds('price_up').some((x) => x.subId === spot && x.pct === 16.8), JSON.stringify(kinds('price_up')));
  assert.ok(kinds('price_up').some((x) => /netflix/i.test(x.name) && x.from === 129 && x.to === 149 && x.source === 'transaksjoner'), JSON.stringify(kinds('price_up')));
  assert.ok(kinds('double').some((x) => /Musikk/.test(x.name) && x.saving === 139), JSON.stringify(kinds('double')));
  assert.ok(kinds('double').some((x) => x.name === 'Dropbox' && x.subIds.length === 2));
  assert.ok(kinds('unused').some((x) => x.subId === vpn), 'merket «Lite brukt»');
  assert.ok(!kinds('unused').some((x) => x.subId === hbo), 'uten bruk-signal vet vi ikke');
  // Bruk-signal: «Jeg bruker den» nå → ikke ubrukt; eldre enn N uker → ubrukt.
  assert.equal((await A('/finans/api/fin51/hunter/used', 'POST', { subId: hbo })).status, 200);
  assert.ok(!(await A('/finans/api/fin51/hunter')).body.findings.some((x) => x.kind === 'unused' && x.subId === hbo));
  db.prepare('UPDATE fin51_usage SET ts=? WHERE sub_id=?').run(Date.now() - 10 * 7 * 86400_000, hbo);
  const h1 = await A('/finans/api/fin51/hunter?weeks=6');
  const un = h1.body.findings.find((x) => x.kind === 'unused' && x.subId === hbo);
  assert.ok(un, JSON.stringify(h1.body.findings.map((x) => x.key))); assert.equal(un.weeks, 10); assert.match(un.title, /ikke brukt på 10 uker/);
  assert.ok(!(await A('/finans/api/fin51/hunter?weeks=12')).body.findings.some((x) => x.kind === 'unused' && x.subId === hbo));
  assert.ok(h1.body.summary.monthlySaving > 0); assert.match(h1.body.summary.text, /funn/);
  // Avvis skjuler funnet; DELETE viser alle igjen.
  assert.equal((await A('/finans/api/fin51/hunter/dismiss', 'POST', { key: un.key })).status, 200);
  assert.ok(!(await A('/finans/api/fin51/hunter')).body.findings.some((x) => x.key === un.key));
  await A('/finans/api/fin51/hunter/dismiss', 'DELETE');
  assert.ok((await A('/finans/api/fin51/hunter')).body.findings.some((x) => x.key === un.key));
  // Kari ser ingenting av dette og kan ikke markere Sebastians abonnement.
  assert.equal((await K('/finans/api/fin51/hunter')).body.findings.length, 0);
  assert.equal((await K('/finans/api/fin51/hunter/used', 'POST', { subId: hbo })).status, 404);
  assert.equal((await K('/finans/api/fin51/hunter/draft', 'POST', { subId: hbo })).status, 404);
  // Oppsigelsestekst: lokal modell (localOnly), ingen beløp i forespørselen, aldri sendt.
  const seen = [];
  fin._setDraftAi51(async (o) => { seen.push(o); return { provider: 'ollama', model: 'qwen3:8b', text: 'Hei,\n\nJeg vil med dette si opp abonnementet mitt på HBO Max. Vennligst bekreft oppsigelsen skriftlig med sluttdato.\n\nMed vennlig hilsen\nSebastian' }; });
  const d1 = await A('/finans/api/fin51/hunter/draft', 'POST', { subId: hbo });
  assert.equal(d1.status, 200); assert.equal(d1.body.engine, 'lokal'); assert.equal(d1.body.model, 'qwen3:8b'); assert.equal(d1.body.sent, false);
  assert.match(d1.body.subject, /Oppsigelse av HBO Max/); assert.match(d1.body.note, /sendes aldri automatisk/);
  assert.equal(seen[0].localOnly, true); assert.ok(!/\d+[,.]?\d*\s*kr/.test(seen[0].prompt), seen[0].prompt);
  fin._setDraftAi51(async () => { throw new Error('ECONNREFUSED'); });
  const d2 = await A('/finans/api/fin51/hunter/draft', 'POST', { subId: spot, reason: 'jeg bruker en annen tjeneste' });
  assert.equal(d2.body.engine, 'mal'); assert.match(d2.body.text, /Spotify \(Premium\)/); assert.match(d2.body.text, /Grunnen er at jeg bruker en annen tjeneste\./);
  assert.match(d2.body.notice, /lokale modellen svarte ikke/);
  fin._setDraftAi51(async () => ({ provider: 'gemini', model: 'sky', text: 'x'.repeat(200) }));
  assert.equal((await A('/finans/api/fin51/hunter/draft', 'POST', { subId: spot })).body.engine, 'mal', 'aldri tekst fra skyen');
  fin._setDraftAi51(null);
});

test('web: Planlegging-siden og skriptet finnes', async () => {
  const pg = await A('/finans/plan51');
  assert.equal(pg.status, 200); assert.match(pg.text, /plan51\.js/); assert.ok(!/<script>(?!<\/script>)/.test(pg.text), 'ingen innebygde skript (CSP)');
  const js = await req('/assets/finans/js/plan51.js');
  assert.equal(js.status, 200); assert.match(js.text, /fin51\/goals/);
});
