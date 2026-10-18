// Home OS: bolig (verdi, lån, faste utgifter) og inventar med garanti. Per bruker (ISO2): kv(user,'home_property'/'home_inventory').
// Eierens data ligger fortsatt under OWNER (samme nøkler), så ingenting flyttes.
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { kv } from './db.js';
import { userGuard, readJson, bad, str, num, MOCK, domainFor } from './homeos-common.js';

const DEMO_PROPERTY = { value: 4850000, valueDate: '2026-10', loan: 3120000, bank: 'DNB', rate: 5.24, payment: 18400,
  costs: [{ name: 'Fellesk.', amount: 3450 }, { name: 'strøm', amount: 1284 }, { name: 'forsikring', amount: 556 }, { name: 'nett', amount: 1000 }] };
const DEMO_ITEMS = [['Oppvaskmaskin Bosch', 'Kjøkken', '2024-03-12', 'Elkjøp', 7990, '2029-03-12', 'PDF-kvittering'], ['Sofa Söderhamn', 'Stue', '2023-08-02', 'IKEA', 8995, '2033-08-02', 'PDF-kvittering'],
  ['MacBook Air M3', 'Kontor', '2025-01-15', 'Power', 14990, '2027-01-15', 'Foto-kvittering'], ['Hjulsett vinter', 'Bod', '2025-10-20', 'Biltema', 3290, '2027-10-20', 'Foto-kvittering'],
  ['TV LG C3 55"', 'Stue', '2024-11-24', 'Elkjøp', 12990, '2026-11-24', 'PDF-kvittering'], ['Skjøteledning', 'Bod', '2026-10-15', 'Clas Ohlson', 199, '2028-10-15', 'Foto-kvittering']]
  .map(([name, room, date, store, price, warrantyUntil, receipt], i) => ({ id: 'd' + i, name, room, date, store, price, warrantyUntil, receipt }));

const EMPTY = { value: 0, valueDate: '', loan: 0, bank: '', rate: 0, payment: 0, costs: [] };
// Standardverdien kopieres, så en endring aldri havner i det felles standardobjektet (og dermed hos andre brukere).
const property = (u) => kv.get(u, 'home_property', null) ?? structuredClone(MOCK ? DEMO_PROPERTY : EMPTY);
const items = (u) => kv.get(u, 'home_inventory', null) ?? structuredClone(MOCK ? DEMO_ITEMS : []);
const withDomain = (i) => ({ ...i, domain: i.domain || domainFor(i.store) });
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : '');

function cleanItem(b, old = {}) {
  return {
    ...old,
    name: b.name !== undefined ? str(b.name, 80) : old.name, room: b.room !== undefined ? str(b.room, 30) || 'Annet' : old.room ?? 'Annet',
    store: b.store !== undefined ? str(b.store, 60) : old.store ?? '', date: b.date !== undefined ? date(b.date) : old.date ?? '',
    price: b.price !== undefined ? Math.max(0, num(b.price)) : old.price ?? 0, warrantyUntil: b.warrantyUntil !== undefined ? date(b.warrantyUntil) : old.warrantyUntil ?? '',
    receipt: b.receipt !== undefined ? str(b.receipt, 40) : old.receipt ?? '', domain: b.domain !== undefined ? str(b.domain, 80) || null : old.domain ?? null,
  };
}

const api = new Hono();
api.use('*', userGuard);

api.get('/property', (c) => c.json(property(c.get('user'))));
api.put('/property', async (c) => {
  const b = await readJson(c), p = property(c.get('user'));
  for (const k of ['value', 'loan', 'rate', 'payment']) if (b[k] !== undefined) p[k] = Math.max(0, num(b[k]));
  if (b.bank !== undefined) p.bank = str(b.bank, 40);
  if (b.valueDate !== undefined) p.valueDate = str(b.valueDate, 20);
  if (Array.isArray(b.costs)) p.costs = b.costs.slice(0, 20).map((x) => ({ name: str(x?.name, 30), amount: Math.max(0, num(x?.amount)) })).filter((x) => x.name);
  kv.set(c.get('user'), 'home_property', p);
  return c.json(p);
});

api.get('/inventory', (c) => c.json(items(c.get('user')).map(withDomain)));
api.post('/inventory', async (c) => {
  const it = cleanItem(await readJson(c));
  if (!it.name) return bad(c, 'Navn mangler');
  it.id = randomBytes(6).toString('hex');
  const list = items(c.get('user')); list.push(it); kv.set(c.get('user'), 'home_inventory', list);
  return c.json(withDomain(it), 201);
});
api.patch('/inventory/:id', async (c) => {
  const list = items(c.get('user')), i = list.findIndex((x) => x.id === c.req.param('id'));
  if (i < 0) return bad(c, 'Fant ikke gjenstanden', 404);
  list[i] = cleanItem(await readJson(c), list[i]);
  if (!list[i].name) return bad(c, 'Navn mangler');
  kv.set(c.get('user'), 'home_inventory', list);
  return c.json(withDomain(list[i]));
});
api.delete('/inventory/:id', (c) => {
  kv.set(c.get('user'), 'home_inventory', items(c.get('user')).filter((x) => x.id !== c.req.param('id')));
  return c.json({ ok: true });
});

export default api;
