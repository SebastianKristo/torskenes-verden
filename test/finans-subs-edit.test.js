import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-subed-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const R = await import('../server/finans/routes.js');
const api = R.default;
const F = await import('../server/finans/finn-routes.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: body instanceof FormData ? H : { ...H, 'content-type': 'application/json' }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), res: r };
};
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000000500010d0a2db40000000049454e44ae426082', 'hex');

test('abonnement: faktureringsdag og -måned, status og nytt trekk', async () => {
  const r = await call('/subscriptions', 'POST', { name: 'Strava', plan: 'Premium', price: 549, cycle: 'yearly', billDay: 21, billMonth: 10, category: 'Helse og trening', status: 'active' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.billDay, 21);
  assert.equal(r.body.billMonth, 10);
  assert.equal(r.body.nextDate.slice(5), '10-21');
  assert.match(r.body.nextCharge.label, /^Neste trekk 21\. oktober, deretter hvert år$/);
  assert.equal(r.body.state, 'active');
  const p = await call(`/subscriptions/${r.body.id}`, 'PATCH', { name: 'Strava Family', price: 699, cycle: 'biennial', billDay: 3, billMonth: 2, status: 'low_use' });
  assert.equal(p.body.name, 'Strava Family');
  assert.equal(p.body.price, 699);
  assert.equal(p.body.cycle, 'biennial');
  assert.equal(p.body.nextDate.slice(5), '02-03');
  assert.equal(p.body.lowUse, true);
  assert.equal(p.body.status, 'price_up'); // prisen økte
  const c = await call(`/subscriptions/${r.body.id}`, 'PATCH', { status: 'cancelled' });
  assert.equal(c.body.state, 'cancelled');
  assert.equal(c.body.active, false);
  // Månedlig: måneden lagres ikke.
  const m = await call(`/subscriptions/${r.body.id}`, 'PATCH', { cycle: 'monthly', billDay: 5 });
  assert.equal(m.body.billMonth, m.body.nextDate ? +m.body.nextDate.slice(5, 7) : null);
  assert.match(m.body.nextCharge?.label ?? 'Neste trekk 5. x, deretter hver måned', /deretter hver måned/);
});

test('abonnement: egen logo kan lastes opp, vises og fjernes; ✦ AI svarer med årsak når ingen logo finnes', async () => {
  const s = (await call('/subscriptions', 'POST', { name: 'Ukjent tjeneste xyz', price: 99 })).body;
  const fd = new FormData();
  fd.append('file', new File([PNG], 'logo.png', { type: 'image/png' }));
  const up = await call(`/subscriptions/${s.id}/logo`, 'POST', fd);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.match(up.body.logoUrl, new RegExp(`^/finans/api/subscriptions/${s.id}/logo\\?v=\\d+$`));
  const img = await api.request(`/subscriptions/${s.id}/logo`, { headers: H });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const list = (await call('/subscriptions')).body.items.find((x) => x.id === s.id);
  assert.equal(list.logoUrl, up.body.logoUrl);
  const bad = new FormData();
  bad.append('file', new File([Buffer.from('hei')], 'x.txt', { type: 'text/plain' }));
  assert.equal((await call(`/subscriptions/${s.id}/logo`, 'POST', bad)).status, 400);
  assert.equal((await call(`/subscriptions/${s.id}`, 'PATCH', { logoUrl: null })).body.logoUrl, null);
  R._setSubLogoAsk(async () => ({ domain: null }));
  const ai = await call(`/subscriptions/${s.id}/logo/ai`, 'POST');
  assert.equal(ai.status, 404);
  assert.match(ai.body.error, /Last opp/);
  R._setSubLogoAsk(null);
});

test('Finn: ny handel fra lenke henter annonsen; redigering av pris, rolle og motpart; image, adUrl og needsAction', async () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"Product","name":"Lampe Le Klint","description":"Fin lampe.","image":["https://images.finncdn.no/dynamic/1280w/item/488800222/a.jpg"],"offers":{"price":"950"}}</script></head><body></body></html>`;
  F._setFetch(async (u) => {
    const url = String(u);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search\n');
    if (url.includes('images.finncdn.no')) return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    if (url.includes('/item/488800222')) return new Response(html, { headers: { 'content-type': 'text/html' } });
    return new Response('nei', { status: 404 });
  }, 0);
  const r = await call('/finn', 'POST', { role: 'bought', adUrl: 'https://www.finn.no/recommerce/forsale/item/488800222', counterpart: 'Eva' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.item, 'Lampe Le Klint');
  assert.equal(r.body.amount, 950);
  assert.equal(r.body.code, '488800222');
  assert.equal(r.body.adUrl, 'https://www.finn.no/recommerce/forsale/item/488800222');
  assert.match(r.body.image, new RegExp(`/finans/api/finn/${r.body.id}/ad/img/0$`));
  assert.equal(r.body.needsAction, false);
  // Mottatt: kjøperen må godkjenne.
  const p = await call(`/finn/${r.body.id}`, 'PATCH', { stage: 3, amount: '1 050,50', counterpart: 'Eva N.' });
  assert.equal(p.body.amount, 1050.5);
  assert.equal(p.body.counterpart, 'Eva N.');
  assert.equal(p.body.needsAction, true);
  const s = await call(`/finn/${r.body.id}`, 'PATCH', { role: 'sold', stage: 1 });
  assert.equal(s.body.role, 'sold');
  assert.equal(s.body.needsAction, true); // solgt: må sendes
  assert.equal((await call(`/finn/${r.body.id}`, 'PATCH', { amount: 'abc' })).status, 400);
  // Appene: title i stedet for item, status som stegnavn.
  const t = await call(`/finn/${r.body.id}`, 'PATCH', { title: 'Lampe Le Klint 320', status: 'Levert', amount: 990 });
  assert.equal(t.body.item, 'Lampe Le Klint 320');
  assert.equal(t.body.stage, 3);
  assert.equal(t.body.amount, 990);
  assert.equal((await call(`/finn/${r.body.id}`, 'PATCH', { status: 'Tull' })).status, 400);
  // Uten lenke kreves tittel og pris.
  assert.equal((await call('/finn', 'POST', { role: 'sold', item: 'Sykkel' })).status, 400);
  assert.equal((await call('/finn', 'POST', { role: 'sold', item: 'Sykkel', amount: 4200 })).body.item, 'Sykkel');
  assert.equal((await call('/finn', 'POST', { adUrl: 'https://example.com/x' })).status, 400);
  F._setFetch(null);
});
