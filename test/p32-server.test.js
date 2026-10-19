// Prompt 32 (SERVER32): cache-fiks, AI-søk med abonnementer, Glimt-snarveier/handoff, søkehistorikk, Kalender med Glimt,
// prøveperiode-widgets, Domener (Glimt-oppsummering + Google Search Console, mock), Rom, Huskeliste-arkiv og Vær-forhold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'hl-p32-'));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-32s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
delete process.env.OLLAMA_URL;
delete process.env.APP_BUILD;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');

const { default: app } = await import('../server/index.js');
const cb = await import('../server/cache-bust.js');
const assist = await import('../server/assist.js');
const calG = await import('../server/calendar-glimt.js');
const domG = await import('../server/domains-glimt.js');
const { db } = await import('../server/db.js');
const { osloTodayISO } = await import('../public/js/quick-time.js');
const { addDaysISO } = await import('../public/js/trial-parse.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (h) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, redirect: 'manual', headers: { ...h, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* tekst */ }
  return { status: r.status, body: json, text, headers: r.headers };
};
const A = client({ cookie: await login('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'kari', password: 'kariPassord123', role: 'bruker', name: 'Kari' })).status, 200);
const K = client({ cookie: await login('kari', 'kariPassord123') });
const tokW = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read', 'finance:write'] })).body.token;
const TW = client({ authorization: `Bearer ${tokW}` });
const SEB = (await A('/api/me')).body.id;
const TODAY = osloTodayISO();

/* ---------------- 1. Cache-fiks ---------------- */

test('cache: /version.json, HTML no-cache med ?v=<build>, JS-importer versjonert, immutable bare med riktig v, /api no-store', async () => {
  const v = await A('/version.json');
  assert.equal(v.status, 200);
  assert.match(v.headers.get('cache-control'), /no-cache, must-revalidate/);
  assert.ok(v.body.build && v.body.time);
  assert.match(v.body.version, /^\d+\.\d+/);
  const B = v.body.build;
  const page = await A('/');
  assert.match(page.headers.get('cache-control'), /no-cache, must-revalidate/);
  assert.ok(page.text.includes(`/assets/js/app.js?v=${B}`), 'skript får ?v');
  assert.ok(page.text.includes(`/assets/css/app.css?v=${B}`), 'stilark får ?v');
  assert.ok(page.text.includes(`<meta name="nordlys-build" content="${B}">`));
  assert.ok(!page.text.includes('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500;600&display=swap?v='), 'eksterne lenker røres ikke');
  const js = await A('/assets/js/app.js');
  assert.equal(js.headers.get('cache-control'), 'no-cache');
  assert.match(js.text, new RegExp(`from '\\./util\\.js\\?v=${B}'`));
  assert.ok(js.headers.get('etag'));
  assert.equal((await app.request('/assets/js/app.js', { headers: { 'if-none-match': js.headers.get('etag') } })).status, 304);
  assert.match((await A(`/assets/js/app.js?v=${B}`)).headers.get('cache-control'), /max-age=31536000, immutable/);
  assert.equal((await A('/assets/js/app.js?v=gammel')).headers.get('cache-control'), 'no-cache');
  assert.match((await A(`/assets/css/app.css?v=${B}`)).headers.get('cache-control'), /immutable/);
  assert.equal((await A('/assets/css/app.css')).headers.get('cache-control'), 'no-cache');
  assert.match((await A('/sw.js')).headers.get('cache-control'), /no-cache, must-revalidate/);
  assert.match((await A('/finans/sw.js')).headers.get('cache-control'), /no-cache, must-revalidate/);
  assert.match((await A('/manifest.webmanifest')).headers.get('cache-control'), /no-cache/);
  assert.equal((await A('/api/me')).headers.get('cache-control'), 'no-store');
  assert.equal((await A('/assets/%2e%2e/server/config.js')).status, 404, 'ingen sti ut av public/');
  // Ren funksjon: relative og /assets-importer, dynamisk import og sideeffekt-import.
  const out = cb.versionJs("import a from './a.js';\nimport './b.js';\nexport * from '../c.js';\nconst m = await import('/assets/js/d.js');\nimport x from 'https://cdn/x.js';", 'B1');
  assert.ok(out.includes("'./a.js?v=B1'") && out.includes("'./b.js?v=B1'") && out.includes("'../c.js?v=B1'") && out.includes("'/assets/js/d.js?v=B1'") && out.includes("'https://cdn/x.js'"));
});

/* ---------------- 6. AI-søk med abonnementer ---------------- */

test('AI-søk: abonnementer og prøver som kilde, inkluderer[], Ja/Nei først, uten [n]', async () => {
  const ins = db.prepare('INSERT INTO fh_subscriptions(name,plan,price,cycle,next_date,usage_note,domain,created,user_id,category) VALUES(?,?,?,?,?,?,?,?,?,?)');
  ins.run('YouTube Premium', 'Individuell', 13900, 'monthly', addDaysISO(TODAY, 15), '', 'youtube.com', Date.now(), SEB, 'Underholdning');
  ins.run('Google One', '100 GB', 2500, 'monthly', addDaysISO(TODAY, 9), '', 'google.com', Date.now(), SEB, 'Lagring og sky');
  const music = (await A('/finans/api/search/ai', 'POST', { q: 'har jeg et abonnement for musikk' })).body;
  assert.equal(music.intent, 'subscriptions');
  assert.equal(music.yesNo, 'ja');
  assert.match(music.answer, /^\*\*Ja\.\*\*/);
  assert.match(music.answer, /\*\*YouTube Premium\*\* \(139 kr\/mnd, neste trekk [^)]+\), som inkluderer YouTube Music/);
  assert.ok(!/\[\d+\]|\[n\]/.test(music.answer));
  const yt = music.subscriptions.find((s) => s.name === 'YouTube Premium');
  assert.ok(yt.includes.includes('YouTube Music') && yt.matched.includes('musikk'));
  assert.equal(yt.openLabel, 'Åpne i Abonnement ›');
  assert.ok(yt.logoUrl);
  assert.equal(music.noMoreSureText, 'Ingen flere sikre treff');
  assert.ok(music.sources.some((s) => s.type === 'abonnement' && s.title === 'YouTube Premium'));
  const stream = (await A('/finans/api/search/ai', 'POST', { q: 'hva betaler jeg for strømming' })).body;
  const names = stream.subscriptions.map((s) => s.name);
  for (const n of ['YouTube Premium', 'Netflix', 'Viaplay', 'Spotify']) assert.ok(names.includes(n), n);
  assert.match(stream.answer, /Til sammen [\d ,]+ kr\/mnd\./);
  assert.ok(stream.monthlyTotal > 0);
  const storage = (await A('/finans/api/search/ai', 'POST', { q: 'betaler jeg for lagring' })).body;
  assert.equal(storage.yesNo, 'ja');
  assert.deepEqual(storage.subscriptions.map((s) => s.name).sort(), ['Google One', 'iCloud+']);
  const none = (await A('/finans/api/search/ai', 'POST', { q: 'har jeg abonnement på lydbøker' })).body;
  assert.equal(none.yesNo, 'nei');
  assert.match(none.answer, /^Nei, jeg finner ingen lydbokabonnement i Abonnement eller i transaksjonene de siste 12 månedene\.$/);
  // Prøveperioder teller også, og andre brukere ser ikke dine abonnementer.
  assert.equal((await TW('/finans/api/subscriptions/trials', 'POST', { service: 'Storytel', endsAt: addDaysISO(TODAY, 10), priceAfter: 179 })).status, 201);
  const books = (await A('/finans/api/search/ai', 'POST', { q: 'har jeg abonnement på lydbøker' })).body;
  assert.equal(books.yesNo, 'ja');
  assert.equal(books.subscriptions[0].kind, 'prøve');
  const kari = (await K('/finans/api/search/ai', 'POST', { q: 'har jeg et abonnement for musikk' })).body;
  assert.ok(!kari.subscriptions?.some((s) => s.name === 'YouTube Premium'));
  const { stripMarkers } = await import('../server/finans/subs-ask32.js');
  assert.equal(stripMarkers('Du brukte 200 kr [1] på mat [n] [2, 3].'), 'Du brukte 200 kr på mat.');
  assert.ok((await A('/finans/api/subscriptions/knowledge')).body.items.some((k) => k.service === 'YouTube Premium'));
});

/* ---------------- 4. Søk: snarveier, hs_timeout_s, handoff ---------------- */

test('Glimt: side-snarveier (intent nav) før verktøyene', async () => {
  const d = (s) => assist.detectIntent(s, TODAY);
  assert.equal(d('Vis meg oppdatering'), 'nav');
  assert.equal(d('kalender'), 'nav');
  assert.equal(d('gå til huskelisten'), 'nav');
  assert.equal(d('hvor er pakkene mine?'), 'packages', 'spørsmål går fortsatt til verktøyet');
  assert.equal(d('vær'), 'weather');
  assert.equal(d('hvordan er været?'), 'weather');
  const r = await A('/api/assist', 'POST', { q: 'Vis meg oppdatering' });
  assert.equal(r.status, 200);
  assert.equal(r.body.intent, 'nav');
  assert.equal(r.body.target, 'nordlys');
  assert.equal(r.body.text, 'Åpner **Nordlys OS · oppdatering**.');
  assert.equal(r.body.source, 'Snarvei');
  assert.deepEqual(r.body.nav, { target: 'nordlys', label: 'Nordlys OS · oppdatering', web: '/#/innstillinger/system', deepLink: 'finanshub://nordlys', delayMs: 450 });
});

test('hs_timeout_s i layout (5/8/15/30, standard 8)', async () => {
  assert.equal((await A('/api/me/layout')).body.hs_timeout_s, 8);
  assert.equal((await A('/api/me/layout', 'PUT', { hs_timeout_s: 15 })).body.hs_timeout_s, 15);
  assert.equal((await A('/api/me/layout')).body.hs_timeout_s, 15);
  assert.equal((await A('/api/me/layout', 'PUT', { hs_timeout_s: 9 })).status, 400);
  assert.equal((await K('/api/me/layout')).body.hs_timeout_s, 8, 'per bruker');
  assert.deepEqual((await A('/api/me/layout', 'PUT', { secNav: { dom: ['oversikt', 'publikum'] } })).body.secNav, { dom: ['oversikt', 'publikum'] });
  assert.deepEqual((await A('/api/me/layout', 'PUT', { secNav: { abo: ['hjem', 'liste'] } })).body.secNav, { dom: ['oversikt', 'publikum'], abo: ['hjem', 'liste'] }, 'flettes per seksjon');
  assert.equal((await A('/api/me/layout', 'PUT', { secNav: { mat: ['a'] } })).status, 400);
  assert.equal((await A('/api/me/layout', 'PUT', { secNav: { dom: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } })).status, 400);
});

test('handoff: tregt Glimt-svar flyttes til Chat-tråd med samme jobb, svaret havner der', async () => {
  let release;
  assist._setAssistLlm(() => new Promise((r) => { release = () => r('Peru har **Lima** som hovedstad.'); }));
  assist._setDirectMs(10);
  const keep = setInterval(() => {}, 50); // tidtakerne i jobbene er unref-et
  try {
    const r = await A('/api/assist', 'POST', { q: 'hva er hovedstaden i Peru?' });
    assert.equal(r.status, 202);
    const h = await A(`/api/assist/${r.body.jobId}/handoff`, 'POST', {});
    assert.equal(h.status, 200);
    assert.ok(h.body.chatId);
    assert.equal(h.body.jobId, r.body.jobId);
    let chat = (await A(`/api/chat/chats/${h.body.chatId}`)).body;
    assert.deepEqual((chat.messages ?? chat.chat?.messages).map((m) => m.role), ['user']);
    assert.equal((await K(`/api/assist/${r.body.jobId}/handoff`, 'POST', {})).status, 404, 'andres jobber');
    release();
    await assist._drainAssist();
    chat = (await A(`/api/chat/chats/${h.body.chatId}`)).body;
    const msgs = chat.messages ?? chat.chat?.messages;
    assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant']);
    assert.match(msgs[1].content, /Lima/);
    assert.equal((await A(`/api/assist/${r.body.jobId}/handoff`, 'POST', {})).body.chatId, h.body.chatId, 'idempotent');
  } finally { clearInterval(keep); assist._setAssistLlm(null); assist._setDirectMs(null); }
});

/* ---------------- 5. Søkehistorikk ---------------- */

test('søkehistorikk: mobil logger, web leser (per bruker, uten duplikater, uten hemmeligheter), slett én/alle + angre', async () => {
  const H = '/api/search-history';
  assert.equal((await TW(H, 'POST', { q: 'hvordan er været', engine: 'glimt' })).body.item.device, 'mobil');
  assert.equal((await A(H, 'POST', { q: 'Paris opera', engine: 'google', device: 'web' })).status, 201);
  await TW(H, 'POST', { q: 'ørn', engine: 'ddg' });
  await TW(H, 'POST', { q: 'Hvordan er været', engine: 'glimt' });
  assert.deepEqual((await TW(H, 'POST', { q: 'kort 4111 1111 1111 1111' })).body, { saved: false, reason: 'sensitive' });
  assert.equal((await TW(H, 'POST', { q: 'passordet mitt er hemmelig' })).body.reason, 'sensitive');
  assert.equal((await TW(H, 'POST', { q: '01019912345' })).body.reason, 'sensitive');
  const list = (await A(`${H}?limit=8`)).body;
  assert.equal(list.enabled, true);
  assert.deepEqual(list.items.map((x) => [x.q, x.device]), [['Hvordan er været', 'mobil'], ['ørn', 'mobil'], ['Paris opera', 'web']]);
  assert.deepEqual((await K(H)).body.items, [], 'andre ser aldri dine søk');
  // Den eldre /api/search/history speiles hit.
  await A('/api/search/history', 'POST', { q: 'nrk' });
  assert.equal((await A(H)).body.items[0].q, 'nrk');
  assert.equal((await A('/api/search/history')).body.entries[0].q, 'nrk');
  const id = list.items[1].id;
  assert.deepEqual((await A(`${H}/${id}`, 'DELETE')).body, { ok: true });
  assert.equal((await K(`${H}/${list.items[0].id}`, 'DELETE')).status, 404);
  assert.ok(!(await A(H)).body.items.some((x) => x.q === 'ørn'));
  const del = (await A(H, 'DELETE')).body;
  assert.equal(del.ok, true);
  assert.ok(del.deleted >= 3);
  assert.deepEqual((await A(H)).body.items, []);
  assert.deepEqual((await A('/api/search/history')).body.items, [], 'tømmer også den gamle listen');
  assert.equal((await A(`${H}/restore`, 'POST', { items: del.items })).body.restored, del.items.length);
  assert.equal((await A(H)).body.items.length, new Set(del.items.map((x) => x.q.toLowerCase())).size, 'uten duplikater');
  // Lagre søkehistorikk av: ingenting logges, og web skjuler listen.
  await A('/api/search/settings', 'PUT', { save: false });
  assert.deepEqual((await TW(H, 'POST', { q: 'noe nytt' })).body, { saved: false, reason: 'off' });
  assert.deepEqual((await A(H)).body, { enabled: false, items: [] });
  await A('/api/search/settings', 'PUT', { save: true });
  assert.equal((await client({})(H)).status, 401);
});

/* ---------------- 7. Kalender med Glimt ---------------- */

test('Kalender: Beskriv med Glimt fyller ut skjemaet (lagrer ingenting)', async () => {
  const r = (await A('/api/kalender/describe', 'POST', { text: 'Tannlege hos Dr. Berg tirsdag 10.30, Bogstadveien 12, minn meg dagen før' })).body;
  assert.equal(r.ok, true);
  assert.equal(r.event.title, 'Tannlege hos Dr. Berg');
  assert.equal(r.event.start, '10:30');
  assert.equal(r.event.location, 'Bogstadveien 12');
  assert.equal(r.event.reminder, 'day');
  assert.equal(r.event.calendar, 'privat');
  assert.match(r.note, /^Fylte ut tittel, dato, tid, sted og varsel$/);
  assert.ok(r.event.note.length > 60, 'lang tekst blir merknad');
  const fam = (await A('/api/kalender/describe', 'POST', { text: 'Svømming med barna hver tirsdag kl 18 i morgen' })).body;
  assert.equal(fam.event.calendar, 'familie');
  assert.equal(fam.event.repeat, 'weekly');
  // Uten dato: lokal modell (mock) får spørre; svarer den ikke, vises feilen.
  calG._setCalendarGlimtLlm(async () => '{"t":"Middag hos mormor","k":"' + addDaysISO(TODAY, 3) + '","s":"17:00","e":"","all":false,"r":"Bærum"}');
  const ai = (await A('/api/kalender/describe', 'POST', { text: 'middag hos mormor på søndag om tre dager' })).body;
  calG._setCalendarGlimtLlm(async () => { throw new Error('nede'); });
  const none = (await A('/api/kalender/describe', 'POST', { text: 'middag med familien' })).body;
  calG._setCalendarGlimtLlm(null);
  assert.ok(ai.ok && ai.event.date);
  assert.equal(none.ok, false);
  assert.equal(none.error, 'Fant ikke dato. Velg dato under.');
  assert.equal(none.event.title, 'Middag med familien');
  assert.equal((await A('/api/kalender/describe', 'POST', {})).status, 400);
});

test('Kalender: ?ai=1 svarer lokalt (dag, ledig, prøver, måned, sist), ellers gamle søket', async () => {
  const s = async (q) => (await A(`/api/kalender/search?ai=1&q=${encodeURIComponent(q)}`)).body;
  const t = await s('hva skjer i morgen');
  assert.equal(t.ai, true);
  assert.equal(t.answer.kind, 'day');
  assert.match(t.answer.text, /^I morgen har du \d+ ting|^Du har ingenting i kalenderen i morgen\.$/);
  assert.equal((await s('når er neste prøve')).answer.kind, 'tests');
  const free = (await s('er jeg ledig fredag ettermiddag')).answer;
  assert.equal(free.kind, 'free');
  assert.ok(Array.isArray(free.free));
  const nov = (await s('alle prøver i november')).answer;
  assert.equal(nov.kind, 'month');
  assert.ok(nov.items.every((e) => e.type === 'prove' || e.type === 'innl'));
  // «sist»: lag en tidligere tannlegetime.
  assert.equal((await A('/api/kalender/events', 'POST', { title: 'Tannlege', date: addDaysISO(TODAY, -20), start: '10:00', end: '11:00', calendar: 'privat' })).status < 300, true);
  const last = (await s('når hadde jeg tannlege sist')).answer;
  assert.equal(last.kind, 'last');
  assert.match(last.text, /^Tannlege var sist .+ kl\. 10:00 \(20 dager siden\)\.$/);
  calG._setCalendarGlimtLlm(async (prompt) => (prompt.includes('Kalender (neste 14 dager)') ? 'Du har en rolig uke. Ingen konflikter.' : ''));
  const llm = (await s('blir det en travel uke for meg')).answer;
  calG._setCalendarGlimtLlm(null);
  assert.equal(llm.kind, 'llm');
  assert.equal(llm.engine, 'ollama');
  const plain = (await A('/api/kalender/search?q=tannlege')).body;
  assert.ok(plain.total >= 1 && !plain.ai, 'uten ai=1: det gamle søket');
});

/* ---------------- 10. Prøveperiode-widgets ---------------- */

test('widgets/trials: neste prøve + 2 neste, farger, fremdrift; «Avsluttet» med app-token', async () => {
  for (const [s, d, p] of [['Viaplay', 2, 149], ['Netflix', 6, 129], ['HBO Max', 20, 99], ['Tidal', 25, null]]) assert.equal((await TW('/finans/api/subscriptions/trials', 'POST', { service: s, endsAt: addDaysISO(TODAY, d), priceAfter: p })).status, 201);
  const w = (await TW('/api/widgets/trials')).body;
  assert.equal(w.empty, false);
  assert.equal(w.next.name, 'Viaplay');
  assert.equal(w.next.daysLeft, 2);
  assert.equal(w.next.tone, 'red');
  assert.equal(w.next.color, '#b23a2a');
  assert.equal(w.next.priceLabel, '149 kr/mnd');
  assert.match(w.next.cancelBefore, /^Avslutt før (søn|man|tir|ons|tor|fre|lør) \d+\. [a-z]{3}$/);
  assert.ok(w.next.progress >= 0 && w.next.progress <= 1);
  assert.ok(w.next.cancelUrl);
  assert.equal(w.more.length, 2);
  assert.equal(w.more[0].tone, 'orange');
  assert.equal(w.count, 5, 'inkl. Storytel fra AI-søk-testen');
  const done = (await TW(`/api/widgets/trials/${w.next.id}`, 'POST', {})).body;
  assert.equal(done.ok, true);
  assert.equal(done.next.name, 'Netflix');
  assert.equal((await K(`/api/widgets/trials/${w.more[0].id}`, 'POST', {})).status, 404);
  assert.equal((await K('/api/widgets/trials')).body.empty, true);
  assert.equal((await K('/api/widgets/trials')).body.emptyText, 'Ingen aktive prøver');
  const kept = (await TW(`/api/widgets/trials/${done.next.id}`, 'POST', { status: 'kept' })).body;
  assert.equal(kept.next.name, 'Storytel');
});

/* ---------------- 2–3. Domener: Glimt-oppsummering og Google Search Console ---------------- */

test('Domener: Glimt-oppsummering per domene/alle, lokal modell eller regler, lagret per bruker', async () => {
  const s = (await A('/api/domains/kristo.no/summary')).body;
  assert.equal(s.domain, 'kristo.no');
  assert.equal(s.daily, true);
  assert.ok(s.head && s.pts.length >= 3 && s.pts.length <= 4);
  assert.ok(s.pts.every((p) => ['pos', 'neg', 'warn', 'info', 'neutral'].includes(p.tone) && /^#[0-9a-f]{6}$/.test(p.color)));
  assert.match(s.meta, /^Daglig · i dag kl\. \d\d:\d\d · kristo\.no$/);
  assert.equal((await A('/api/domains/kristo.no/summary')).body.createdAt, s.createdAt, 'samme oppsummering hele dagen');
  domG._setSummaryLlm(async () => '{"head":"Mer trafikk enn vanlig på kristo.no.","pts":[{"t":"Trafikken økte.","tone":"pos"},{"t":"Cache 87 %.","tone":"info"},{"t":"Sertifikat om 82 dager.","tone":"warn"}]}');
  const m = (await A('/api/domains/kristo.no/summary', 'POST')).body;
  domG._setSummaryLlm(null);
  assert.equal(m.manual, true);
  assert.equal(m.ai, true);
  assert.equal(m.head, 'Mer trafikk enn vanlig på kristo.no.');
  assert.match(m.meta, /^Laget nå kl\. \d\d:\d\d · kristo\.no$/);
  const all = (await A('/api/domains/alle/summary')).body;
  assert.equal(all.domain, '*');
  assert.equal(all.label, 'Alle domener');
  assert.equal((await A('/api/domains/ukjent.no/summary')).status, 404);
  assert.equal((await K('/api/domains/kristo.no/summary')).status, 403, 'bare admin');
  const loc = domG.sumLocal([{ name: 'x.no', req: 100, vis: 10, ch: 2, thr: 1, cache: 80, ms: 40, certD: 12, expD: 300 }], false);
  assert.equal(loc.head, 'Sertifikatet for x.no går ut om 12 dager.');
});

test('Google Search Console: kobling (mock), kryptert token per bruker, KPI-er, søkeord, sider, koble fra', async () => {
  const off = (await A('/api/domains/kristo.no/gsc')).body;
  assert.equal(off.connected, false);
  assert.equal(off.scopeNote, 'Kun lesetilgang · webmasters.readonly');
  assert.equal(off.steps.length, 3);
  const a = await A('/api/gsc/auth?return=/%23/domener');
  assert.equal(a.status, 302);
  const cbk = await A(a.headers.get('location'));
  assert.equal(cbk.status, 302);
  assert.match(cbk.headers.get('location'), /gsc=ok/);
  const kvRow = db.prepare("SELECT value FROM kv WHERE user=? AND key='gsc'").get(SEB);
  assert.ok(kvRow && !kvRow.value.includes('mock-refresh') && JSON.parse(kvRow.value).refresh.startsWith('gsc1:'), 'refresh-token kryptert');
  const st = (await A('/api/gsc')).body;
  assert.equal(st.connected, true);
  assert.equal(st.selected['kristo.no'], 'sc-domain:kristo.no');
  const g = (await A('/api/domains/kristo.no/gsc?period=28')).body;
  assert.equal(g.connected, true);
  assert.equal(g.period, 28);
  assert.equal(g.series.length, 28);
  assert.ok(g.kpi.clicks.value > 0 && g.kpi.impressions.value > g.kpi.clicks.value);
  assert.ok(g.kpi.ctr.value > 0 && g.kpi.ctr.value < 1);
  assert.equal(g.kpi.position.better, 'lower');
  assert.equal(typeof g.kpi.clicks.changePct, 'number');
  assert.equal(g.queries.length, 8);
  assert.ok(g.pages.length <= 6 && g.pages[0].path.startsWith('/'));
  assert.match(g.footer, /^Koblet til som sebastian@kristo\.no · sc-domain:kristo\.no · sist hentet i dag \d\d:\d\d · data til \d+\. [a-z]{3}$/);
  assert.equal((await A('/api/domains/kristo.no/gsc?period=7')).body.series.length, 7);
  assert.equal((await A('/api/domains/*/gsc')).status, 400);
  assert.ok(domG.gscFacts(SEB, 'kristo.no').clicks > 0);
  assert.equal((await A('/api/gsc/site', 'POST', { domain: 'kristo.no', siteUrl: 'sc-domain:ikke-min.no' })).status, 400);
  assert.equal((await A('/api/gsc', 'DELETE')).body.ok, true);
  assert.equal((await A('/api/domains/kristo.no/gsc')).body.connected, false);
  assert.equal(db.prepare('SELECT count(*) FROM gsc_daily WHERE user_id=?').pluck().get(SEB), 0);
});

/* ---------------- 8. Rom ---------------- */

test('Rom: APOD 7 dager, Mars-rovere, satellitter med SGP4 (mock, ingen nett), NASA-nøkkel aldri ut', async () => {
  const ap = (await A('/api/space/apod?days=7')).body;
  assert.equal(ap.items.length, 7);
  assert.ok(ap.items[0].title && ap.items[0].date === TODAY && ap.items[0].media_type === 'image');
  const mars = (await A('/api/space/mars')).body;
  assert.deepEqual(mars.rovers.map((r) => r.key), ['perseverance', 'curiosity']);
  assert.ok(mars.rovers[0].sol > 0 && mars.rovers[0].count > 0 && mars.rovers[0].photos.length === 6 && mars.rovers[0].photos[0].img);
  const tle = (await A('/api/space/tle?group=active')).body;
  assert.match(tle.text, /^ISS \(ZARYA\)\n1 /);
  const s = (await A('/api/rom/satellites?city=bergen')).body;
  assert.ok(s.count > 1000);
  assert.equal(s.city.name, 'Bergen');
  assert.equal(s.categories.find((c) => c.id === 'starlink').count, 720);
  assert.ok(s.iss && Math.abs(s.iss.lat) <= 52 && s.iss.altKm > 350 && s.iss.altKm < 500 && s.iss.speedKmS > 7);
  assert.equal(s.iss.track.length, 31);
  assert.ok(s.overhead.every((o) => o.elevationDeg > 10 && /^(N|NØ|Ø|SØ|S|SV|V|NV)$/.test(o.dir)));
  const all = JSON.stringify([ap, mars, s, (await A('/api/rom/apod')).body]);
  assert.ok(!all.includes('DEMO_KEY') && !all.includes('api_key'));
  assert.equal((await A('/api/rom/settings', 'PUT', { marsNotify: false })).body.marsNotify, false);
  assert.equal((await client({})('/api/rom/mars')).status, 401);
});

/* ---------------- 9. Huskeliste: arkiv ---------------- */

test('Huskeliste: arkiver/gjenopprett, ?archived=1, auto etter 7 dager, telles ikke', async () => {
  const t = (await A('/api/tasks', 'POST', { title: 'Kjøp lyspærer', list: 'hjem' })).body.item;
  await A(`/api/tasks/${t.id}`, 'PATCH', { done: true });
  const a = (await A(`/api/tasks/${t.id}`, 'PATCH', { archived: true })).body.item;
  assert.equal(a.archived, true);
  assert.ok(a.archivedAt);
  assert.ok(!(await A('/api/tasks')).body.items.some((x) => x.id === t.id));
  const arch = (await A('/api/tasks?archived=1')).body;
  assert.ok(arch.items.some((x) => x.id === t.id) && arch.items.every((x) => x.archived));
  assert.ok(arch.archivedCount >= 1);
  const r = (await A(`/api/tasks/${t.id}`, 'PATCH', { archived: false, done: false })).body.item;
  assert.equal(r.archived, false);
  assert.equal(r.done, false);
  assert.ok((await A('/api/tasks')).body.items.some((x) => x.id === t.id));
  // Automatisk: fullført for over 7 dager siden.
  const old = (await A('/api/tasks', 'POST', { title: 'Gammel oppgave', list: 'hjem' })).body.item;
  await A(`/api/tasks/${old.id}`, 'PATCH', { done: true });
  db.prepare('UPDATE hl_tasks SET done_at=? WHERE id=?').run(Date.now() - 8 * 86_400_000, old.id);
  assert.ok(!(await A('/api/tasks')).body.items.some((x) => x.id === old.id));
  assert.ok((await A('/api/tasks?archived=1')).body.items.some((x) => x.id === old.id));
  // «Arkiver alle» og «Tøm arkivet».
  const d = (await A('/api/tasks', 'POST', { title: 'Ferdig ting', list: 'hjem' })).body.item;
  await A(`/api/tasks/${d.id}`, 'PATCH', { done: true });
  assert.ok((await A('/api/tasks/archive-done', 'POST', { list: 'hjem' })).body.archived >= 1);
  assert.ok((await A('/api/tasks/archived', 'DELETE')).body.removed >= 2);
  assert.equal((await A('/api/tasks?archived=1')).body.items.length, 0);
});

/* ---------------- 11. Vær: Forhold-data ---------------- */

test('Vær: dagene har 12 blokker à 2 t med mm/vind/kast og min–maks kast', async () => {
  const { buildFull } = await import('../server/weather-full.js');
  const times = Array.from({ length: 48 }, (_, i) => `2026-10-19T${String(i % 24).padStart(2, '0')}:00`).map((t, i) => (i >= 24 ? t.replace('19T', '20T') : t));
  const raw = { hourly: { time: times, precipitation: times.map((_, i) => (i % 3 ? 0 : 0.6)), wind_speed_10m: times.map(() => 4), wind_gusts_10m: times.map((_, i) => 5 + (i % 24) / 4) },
    daily: { time: ['2026-10-19', '2026-10-20'] }, current: {} };
  const out = buildFull(raw, { name: 'Oslo', lat: 59.9, lon: 10.7 }, '2026-10-19T10:00');
  const d0 = out.days[0];
  assert.equal(d0.blocks2h.length, 12);
  assert.deepEqual(d0.blocks2h[0], { h: 0, mm: 0.6, wind: 4, gust: 5.3, day: false });
  assert.equal(d0.blocks2h[3].day, true);
  assert.equal(d0.gustMin, 5.3);
  assert.equal(d0.gustMax, 10.8);
});
