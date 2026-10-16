import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { db, kv, OWNER } from './db.js';
import { verifyPassword } from './password.js';
import { createSession, destroySession, sessionUser, requireAuth, clientIp, loginBlocked, loginFailed, loginSucceeded } from './auth.js';
import * as integrations from './integrations.js';

const api = process.env.MOCK_DATA === '1' ? await import('./mock.js') : integrations;
if (api !== integrations) console.warn('[mock] MOCK_DATA=1 – viser eksempeldata.');

const app = new Hono();
const UPLOADS = resolve(config.dataDir, 'uploads');
const PUBLIC = resolve('public');

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://upload.wikimedia.org', 'https://commons.wikimedia.org', 'https://apod.nasa.gov', 'https://images-assets.nasa.gov', 'https://img.youtube.com'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
  },
  crossOriginEmbedderPolicy: false,
}));

/* ---------------- Sider ---------------- */

const page = (name) => readFile(join(PUBLIC, name), 'utf8');
const html = (c, body) => c.html(body, 200, { 'Cache-Control': 'no-store' });

app.get('/', async (c) => sessionUser(c) ? html(c, await page('app.html')) : c.redirect('/login'));
app.get('/login', async (c) => sessionUser(c) ? c.redirect('/') : html(c, await page('login.html')));
app.get('/cv', async (c) => html(c, await page('cv.html')));

app.use('/assets/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace(/^\/assets/, '') }));
app.use('/vendor/satellite/*', serveStatic({ root: './node_modules/satellite.js/dist', rewriteRequestPath: (p) => p.replace(/^\/vendor\/satellite/, '') }));
app.get('/manifest.webmanifest', async (c) => c.body(await page('manifest.webmanifest'), 200, { 'Content-Type': 'application/manifest+json' }));
app.get('/sw.js', async (c) => c.body(await page('sw.js'), 200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' }));
app.get('/healthz', (c) => c.text('ok'));

/* ---------------- Innlogging ---------------- */

app.post('/api/login', async (c) => {
  const ip = clientIp(c);
  const wait = loginBlocked(ip);
  if (wait) return c.json({ error: `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60)} min.` }, 429);
  const { password } = await c.req.json().catch(() => ({}));
  if (!config.passwordHash || !verifyPassword(password ?? '', config.passwordHash)) {
    loginFailed(ip);
    await new Promise((r) => setTimeout(r, 400));
    return c.json({ error: 'Feil passord' }, 401);
  }
  loginSucceeded(ip);
  createSession(c);
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => { destroySession(c); return c.json({ ok: true }); });

/* ---------------- CV (offentlig lesing) ---------------- */

export const CV_DEFAULT = {
  name: 'Benjamin Kristoffersen', title: 'Elev · IT og homelab-entusiast', email: 'benjamin@kristo.no', phone: '+47 900 00 000', place: 'Oslo',
  about: 'Elev med stor interesse for nettverk, servere og automatisering. Driver eget homelab med Proxmox, Home Assistant og Pi-hole.',
  work: '2025 – nå | Deltid, Komplett | Kundeservice og produktveiledning\n2024 | Sommerjobb, Oslo kommune | IT-support for skoler',
  edu: '2024 – nå | Videregående, studiespesialisering | Matematikk R2, Fysikk 2\n2021 – 2024 | Ungdomsskole | ',
  skills: 'Linux, Proxmox, Docker, Home Assistant, Nettverk, Python, Norsk, Engelsk',
};
const CV_KEYS = Object.keys(CV_DEFAULT);

app.get('/api/cv', (c) => c.json({ cv: { ...CV_DEFAULT, ...kv.get(OWNER, 'cv', {}) }, canEdit: !!sessionUser(c) }));

/* ---------------- Alt under er innlogget ---------------- */

const authed = new Hono();
authed.use('*', requireAuth);

authed.put('/cv', async (c) => {
  const body = await c.req.json();
  const cv = {};
  for (const k of CV_KEYS) if (typeof body[k] === 'string') cv[k] = body[k].slice(0, 5000);
  kv.set(OWNER, 'cv', cv);
  return c.json({ cv: { ...CV_DEFAULT, ...cv } });
});
authed.delete('/cv', (c) => { kv.del(OWNER, 'cv'); return c.json({ cv: CV_DEFAULT }); });

const DEFAULT_CATS = [
  { name: 'Mat', color: '#8fe0b0' }, { name: 'Transport', color: '#a8d4fb' }, { name: 'Bolig', color: '#f3d38a' },
  { name: 'Fritid', color: '#e8a6d8' }, { name: 'Skole', color: '#9fb4ff' }, { name: 'Annet', color: '#8a93a6' },
];
const DEFAULT_LOAN = { debt: 46120, grantMonthly: 3860, nextPayout: '2026-11-15', progress: 62 };

authed.get('/state', (c) => {
  const u = c.get('user');
  const layouts = Object.fromEntries(db.prepare("SELECT key, value FROM kv WHERE user=? AND key LIKE 'layout_%'").all(u).map((r) => [r.key.slice(7), JSON.parse(r.value)]));
  return c.json({
    user: config.userName,
    place: config.location.name,
    bg: kv.get(u, 'bg', 'mane'),
    bgCustom: kv.get(u, 'bg_custom', {}),
    budget: kv.get(u, 'budget', 8000),
    categories: kv.get(u, 'categories', DEFAULT_CATS),
    loan: kv.get(u, 'loan', DEFAULT_LOAN),
    city: kv.get(u, 'city', 'Oslo'),
    schoolUrl: config.schoolUrl,
    layouts,
  });
});

const SETTINGS = {
  bg: (v) => typeof v === 'string' && /^[a-z]{2,10}$/.test(v),
  budget: (v) => Number.isFinite(v) && v >= 0,
  city: (v) => typeof v === 'string' && v.length < 40,
  categories: (v) => Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x.name === 'string' && x.name.length <= 30 && /^#[0-9a-f]{6}$/i.test(x.color)),
  loan: (v) => v && typeof v === 'object' && ['debt', 'grantMonthly', 'progress'].every((k) => Number.isFinite(v[k])) && typeof v.nextPayout === 'string',
};
authed.put('/settings/:key', async (c) => {
  const key = c.req.param('key');
  const { value } = await c.req.json();
  if (key.startsWith('layout_')) {
    if (!/^layout_[a-z_]{1,20}$/.test(key) || !Array.isArray(value) || !value.every(Number.isInteger)) return c.json({ error: 'Ugyldig' }, 400);
  } else if (!SETTINGS[key]?.(value)) return c.json({ error: 'Ugyldig verdi' }, 400);
  kv.set(c.get('user'), key, value);
  return c.json({ ok: true });
});
authed.delete('/layouts', (c) => { kv.delPrefix(c.get('user'), 'layout_'); return c.json({ ok: true }); });

/* --- Filer (kvitteringer og bakgrunner) --- */

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
async function saveFile(file, allowPdf = true) {
  if (!(file instanceof File)) return null;
  const ext = MIME_EXT[file.type];
  if (!ext || (!allowPdf && ext === 'pdf')) throw new Error('Filtypen støttes ikke');
  const name = `${randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(join(UPLOADS, name), Buffer.from(await file.arrayBuffer()));
  return { name, mime: file.type };
}
const removeFile = (name) => name && unlink(join(UPLOADS, name)).catch(() => {});

authed.get('/files/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-f0-9]{24}(_t)?\.[a-z]{3,4}$/.test(name)) return c.notFound();
  const ext = name.split('.').pop();
  const mime = Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  try {
    return c.body(await readFile(join(UPLOADS, name)), 200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  } catch { return c.notFound(); }
});

const upload = bodyLimit({ maxSize: 20 * 1024 * 1024, onError: (c) => c.json({ error: 'Filen er for stor (maks 20 MB)' }, 413) });

const BG_SLOTS = ['oslo', 'egen', 'vaer_sol', 'vaer_sky', 'vaer_regn'];
authed.post('/backgrounds/:slot', upload, async (c) => {
  const slot = c.req.param('slot');
  if (!BG_SLOTS.includes(slot)) return c.json({ error: 'Ukjent plass' }, 400);
  const body = await c.req.parseBody();
  let saved;
  try { saved = await saveFile(body.file, false); } catch (e) { return c.json({ error: e.message }, 400); }
  if (!saved) return c.json({ error: 'Mangler fil' }, 400);
  const u = c.get('user');
  const custom = kv.get(u, 'bg_custom', {});
  if (slot === 'oslo') custom.oslo = [...(custom.oslo ?? []), saved.name].slice(-8);
  else { removeFile(custom[slot]); custom[slot] = saved.name; }
  kv.set(u, 'bg_custom', custom);
  return c.json({ bgCustom: custom });
});
authed.delete('/backgrounds/:slot', (c) => {
  const u = c.get('user'), slot = c.req.param('slot');
  const custom = kv.get(u, 'bg_custom', {});
  [custom[slot]].flat().forEach(removeFile);
  delete custom[slot];
  kv.set(u, 'bg_custom', custom);
  return c.json({ bgCustom: custom });
});

/* --- Kvitteringer --- */

const receiptOut = (r) => ({ id: r.id, store: r.store, date: r.date, category: r.category, amount: r.amount, file: r.file, thumb: r.thumb, mime: r.mime });

authed.get('/receipts', (c) => c.json(db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date DESC, id DESC').all(c.get('user')).map(receiptOut)));

authed.post('/receipts', upload, async (c) => {
  const body = await c.req.parseBody();
  let file, thumb;
  try { file = await saveFile(body.file); thumb = await saveFile(body.thumb, false); } catch (e) { return c.json({ error: e.message }, 400); }
  const today = new Date().toLocaleDateString('sv-SE');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
  const r = db.prepare('INSERT INTO receipts(user,store,date,category,amount,file,thumb,mime,created) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *')
    .get(c.get('user'), String(body.store ?? '').slice(0, 120), date, String(body.category ?? 'Annet').slice(0, 30), Number(body.amount) || 0, file?.name ?? null, thumb?.name ?? null, file?.mime ?? null, Date.now());
  return c.json(receiptOut(r));
});

authed.patch('/receipts/:id', async (c) => {
  const b = await c.req.json();
  const cur = db.prepare('SELECT * FROM receipts WHERE id=? AND user=?').get(c.req.param('id'), c.get('user'));
  if (!cur) return c.notFound();
  const next = {
    store: typeof b.store === 'string' ? b.store.slice(0, 120) : cur.store,
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : cur.date,
    category: typeof b.category === 'string' ? b.category.slice(0, 30) : cur.category,
    amount: b.amount !== undefined && Number.isFinite(Number(b.amount)) ? Number(b.amount) : cur.amount,
  };
  const r = db.prepare('UPDATE receipts SET store=?, date=?, category=?, amount=? WHERE id=? RETURNING *').get(next.store, next.date, next.category, next.amount, cur.id);
  return c.json(receiptOut(r));
});

authed.delete('/receipts/:id', (c) => {
  const r = db.prepare('DELETE FROM receipts WHERE id=? AND user=? RETURNING file, thumb').get(c.req.param('id'), c.get('user'));
  if (r) { removeFile(r.file); removeFile(r.thumb); }
  return c.json({ ok: true });
});

authed.get('/receipts.csv', (c) => {
  const rows = db.prepare('SELECT * FROM receipts WHERE user=? ORDER BY date').all(c.get('user'));
  const q = (v) => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = '﻿' + ['Dato;Butikk;Kategori;Beløp', ...rows.map((r) => [r.date.split('-').reverse().join('.'), r.store, r.category, String(r.amount).replace('.', ',')].map(q).join(';'))].join('\r\n');
  return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kvitteringer.csv"' });
});

/* --- Karakterer og prøver --- */

authed.get('/grades', (c) => c.json(db.prepare('SELECT id, subject, grade, tests FROM grades WHERE user=? ORDER BY sort, id').all(c.get('user'))));
authed.post('/grades', async (c) => {
  const b = await c.req.json();
  const r = db.prepare('INSERT INTO grades(user,subject,grade,tests,sort) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM grades)) RETURNING id, subject, grade, tests')
    .get(c.get('user'), String(b.subject || 'Nytt fag').slice(0, 60), gradeVal(b.grade), String(b.tests ?? '').slice(0, 100));
  return c.json(r);
});
const gradeVal = (g) => { const n = parseInt(g, 10); return n >= 1 && n <= 6 ? n : null; };
authed.patch('/grades/:id', async (c) => {
  const b = await c.req.json();
  const cur = db.prepare('SELECT * FROM grades WHERE id=? AND user=?').get(c.req.param('id'), c.get('user'));
  if (!cur) return c.notFound();
  const r = db.prepare('UPDATE grades SET subject=?, grade=?, tests=? WHERE id=? RETURNING id, subject, grade, tests').get(
    typeof b.subject === 'string' ? b.subject.slice(0, 60) : cur.subject, 'grade' in b ? gradeVal(b.grade) : cur.grade,
    typeof b.tests === 'string' ? b.tests.slice(0, 100) : cur.tests, cur.id);
  return c.json(r);
});
authed.delete('/grades/:id', (c) => { db.prepare('DELETE FROM grades WHERE id=? AND user=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });

authed.get('/tests', (c) => c.json(db.prepare('SELECT id, date, title, note FROM tests WHERE user=? ORDER BY date').all(c.get('user'))));
authed.post('/tests', async (c) => {
  const b = await c.req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.title) return c.json({ error: 'Dato og tittel må fylles ut' }, 400);
  return c.json(db.prepare('INSERT INTO tests(user,date,title,note) VALUES(?,?,?,?) RETURNING id, date, title, note')
    .get(c.get('user'), b.date, String(b.title).slice(0, 100), String(b.note ?? '').slice(0, 200)));
});
authed.delete('/tests/:id', (c) => { db.prepare('DELETE FROM tests WHERE id=? AND user=?').run(c.req.param('id'), c.get('user')); return c.json({ ok: true }); });

/* --- Integrasjoner --- */

const proxy = (fn) => async (c) => {
  try { return c.json(await fn(c)); } catch (e) {
    console.warn(`[${c.req.path}]`, e.message);
    return c.json({ error: e.message }, 502);
  }
};
authed.get('/ruter', proxy(api.getRuter));
authed.get('/weather', proxy(api.getWeather));
authed.get('/school', proxy(api.getSchool));
// Trading 212 gir ikke dagsendring direkte: lagre første totalverdi hver dag og sammenlign.
authed.get('/trading', proxy(async () => {
  const t = await api.getTrading();
  if (!t.configured || !Number.isFinite(t.total)) return t;
  const today = new Date().toLocaleDateString('sv-SE');
  let base = kv.get(OWNER, 't212_day');
  if (base?.date !== today) { base = { date: today, total: t.total }; kv.set(OWNER, 't212_day', base); }
  // Merk: innskudd/uttak samme dag regnes med i endringen.
  const dayChange = t.total - base.total;
  return { ...t, dayChange, dayPct: base.total ? (dayChange / base.total) * 100 : 0 };
}));
authed.get('/energy', proxy(api.getEnergy));
authed.get('/health', proxy(api.getHealth));
authed.get('/space/tle', proxy(api.getTle));
authed.get('/space/apod', proxy(api.getApod));
authed.get('/space/gallery/:key', proxy((c) => {
  const key = c.req.param('key');
  if (!api.GALLERIES[key]) throw new Error('Ukjent galleri');
  return api.getGallery(key);
}));

app.route('/api', authed);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Intern feil' }, 500);
});

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`OS kjører på http://localhost:${info.port}`));
}

export default app;
