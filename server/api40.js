// Prompt 40 (SERVER40): kobler sammen modulene for prompt 40 (montert i index.js).
//   AI-selvtester (to tidsgrenser, oppvarming, én modell om gangen, minnesjekk, helsesjekk, vakthund), Jobber-gruppering  → ai-run.js, ai-api.js, ai39.js
//   SMB: validering etter SMB-reglene, feiltype per kind, POST /api/smb/shares {host, user, pass}                       → finans/backup.js, smb-browse.js
//   «Starter opp» bare ved ekte omstart: /api/health {restarting, updating, state} + X-Homelab-State                      → index.js, system-update.js
//   2FA i appen: /api/auth/2fa/*                                                                                       → auth40.js (+ auth.js issuer)
//   Finans: added, PATCH alt + historikk, Les på nytt, POST /finans/api/search/ask                                    → finans/added40.js, finans/p40.js (+ routes.js txOut/receiptOut)
//   Gjøremål-Glimt: flere punkter med rekkefølge, sted og person                                                      → tasks-glimt40.js (+ tasks-glimt37.js, tasks.js itemOut)
//   Nyheter Glimt-side: /api/news/glimt, /api/news/glimt/sources, /api/glimt/news-digest                               → news40.js
//   Julemodus: /api/glimt/settings jul*, julActive; brief.jul                                                         → jul40.js (+ glimt35.js), mellomvaren under
//   Hjemlys: /api/hjemlys/*                                                                                           → hjemlys40.js
//   Fanelinje: GET /api/app/pages + alle nøklene i homeNav                                                            → under (+ mobile.js TAB_IDS)
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { bibleEnabled } from './bible37.js';
import { glimtSettingsOf } from './glimt35.js';
import { julBrief } from './jul40.js';
import { afterDone40, migrate40 } from './tasks-glimt40.js';
import { db } from './db.js';
import { startHjemlys40 } from './hjemlys40.js';
import { startHungSweeper } from './ai-run.js';
import { sessionUser } from './auth.js';

export { twofa40Api } from './auth40.js';
export { finans40Api } from './finans/p40.js';
export { news40Api, newsDigestApi } from './news40.js';
export { hjemlys40Api } from './hjemlys40.js';

/* ---------------- Fanelinje: alle sider i Mer ---------------- */
// Én kilde for Mer-menyen og «Rediger fanelinjen» (fasit HNAV_ALL). key = nøkkelen i designet, id = nøkkelen i homeNav/tabBar (mobile.js TAB_IDS).
// kind 'sheet' = åpnes som ark (Now Brief, Nyhetsleser), ellers navigeres det til route.
export const PAGES40 = [
  ['hjem', 'hjem', 'Hjem', '⌂', 'house', 'home', '/hjem'],
  ['finans', 'finans', 'Finans', 'kr', 'creditcard', 'account_balance_wallet', '/finans'],
  ['mat', 'mat', 'Mat', '◐', 'fork.knife', 'restaurant', '/mat'],
  ['sporing', 'sporing', 'Sporing', '▣', 'shippingbox', 'local_shipping', '/sporing'],
  ['domener', 'domener', 'Domener', '◎', 'globe', 'language', '/domener'],
  ['media', 'media', 'Media', '▶', 'play.rectangle', 'play_circle', '/media'],
  ['abo', 'abonnementer', 'Abonnement', '↻', 'arrow.triangle.2.circlepath', 'autorenew', '/abonnement'],
  ['kart', 'familie', 'Familie', '◉', 'person.2', 'groups', '/familie'],
  ['huske', 'huske', 'Gjøremål', '☑', 'checklist', 'checklist', '/huske'],
  ['chat', 'chat', 'Chat', '✦', 'sparkles', 'auto_awesome', '/chat'],
  ['fsok', 'sok', 'Søk', '⌕', 'magnifyingglass', 'search', '/sok'],
  ['vaer', 'vaer', 'Vær', '☼', 'sun.max', 'wb_sunny', '/vaer'],
  ['nyheter', 'nyheter', 'Nyheter', '¶', 'newspaper', 'newspaper', '/nyheter'],
  ['kalender', 'kalender', 'Kalender', '▦', 'calendar', 'calendar_month', '/kalender'],
  ['bursdag', 'bursdager', 'Bursdager', '✿', 'gift', 'cake', '/bursdager'],
  ['brief', 'brief', 'Now Brief', '✧', 'sun.horizon', 'wb_twilight', '/brief', 'sheet'],
  ['rss', 'nyhetsleser', 'Nyhetsleser', '≣', 'list.bullet.rectangle', 'rss_feed', '/nyhetsleser', 'sheet'],
  ['bibel', 'bibel', 'Bibel', '✝', 'book.closed', 'menu_book', '/bibel', 'page', 'bible'],
  ['aksjer', 'aksjer', 'Aksjer', '↗', 'chart.line.uptrend.xyaxis', 'trending_up', '/aksjer'],
  ['nordlys', 'nordlys', 'Nordlys', '≈', 'sparkle', 'auto_awesome_motion', '/nordlys'],
  ['innst', 'innstillinger', 'Innstillinger', '⚙', 'gearshape', 'settings', '/innstillinger'],
].map(([key, id, name, icon, sf, material, route, kind = 'page', module = null]) => ({ key, id, name, icon, sf, material, route, kind, ...(module ? { module } : {}) }));
/** Nøklene homeNav/tabBar godtar (både designnøkler og de gamle id-ene). */
export const PAGE_KEYS40 = [...new Set(PAGES40.flatMap((p) => [p.key, p.id]))];
export const pagesFor40 = (u) => PAGES40.filter((p) => p.module !== 'bible' || bibleEnabled(u));

export const pages40Api = new Hono();
pages40Api.use('*', authOrToken);
// GET /api/app/pages → {pages:[{key, id, name, icon, sf, material, route, kind:'page'|'sheet', module?}], maxTabs:5, more:'mer'}
pages40Api.get('/', (c) => c.json({ pages: pagesFor40(c.get('user')), maxTabs: 5, more: { key: 'mer', id: 'mer', name: 'Mer', icon: '⋯', sf: 'ellipsis', material: 'more_horiz' } }));

/* ---------------- Brief i julemodus ---------------- */
// GET /api/brief (og /api/brief?kind=…) får jul:{phase, label, outfit, countdown, countdownText, luke:{n, text}|null, aaret?, snow} når julemodus er på.
export async function briefJul40(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/^\/api\/brief\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user') ?? sessionUser(c);
    if (!u) return;
    const j = await c.res.clone().json();
    const jul = julBrief(glimtSettingsOf(u), Date.now(), { aaret: { title: 'Året ditt', text: 'Glimt oppsummerer året ditt: økonomi, trening, serier og steder.' } });
    if (jul) c.res = c.json({ ...j, jul }, 200, { 'Cache-Control': 'no-store' });
  } catch { /* briefen står */ }
}

/* ---------------- Gjøremål: «Nå kan du: …» når punktet før er gjort ---------------- */
export async function tasksAfter40(c, next) {
  let b = null;
  if (c.req.method === 'PATCH') { try { b = await c.req.json(); } catch { b = null; } }
  if (b && (('placeName' in b && b.placeName !== null && typeof b.placeName !== 'string') || ('after' in b && b.after !== null && !Number.isInteger(b.after)))) return c.json({ error: 'placeName må være tekst og after en oppgave-id' }, 400);
  await next();
  if (c.res.status !== 200 || !b) return;
  const id = +c.req.param('id');
  if ('placeName' in b || 'after' in b) await setExtra40(c, id, b);
  if (b.done === true) { try { await afterDone40(id, c.get('user')); } catch { /* best effort */ } }
}
/** placeName (fritt sted) og after (oppgave-id som må gjøres først) på en oppgave; svaret {item} oppdateres. */
async function setExtra40(c, id, b) {
  migrate40();
  const after = 'after' in b ? (b.after && b.after !== id && db.prepare('SELECT 1 FROM hl_tasks WHERE id=?').get(b.after) ? b.after : null) : undefined;
  if ('placeName' in b) db.prepare('UPDATE hl_tasks SET place_name=? WHERE id=?').run(b.placeName ? String(b.placeName).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) || null : null, id);
  if (after !== undefined) db.prepare('UPDATE hl_tasks SET after_id=? WHERE id=?').run(after, id);
  try { const j = await c.res.clone().json(); if (j?.item) { const r = db.prepare('SELECT place_name, after_id FROM hl_tasks WHERE id=?').get(id); c.res = c.json({ ...j, item: { ...j.item, placeName: r?.place_name ?? null, after: r?.after_id ?? null } }, c.res.status); } } catch { /* */ }
}
// POST /api/tasks godtar også placeName og after (prompt 40).
export async function tasksCreate40(c, next) {
  let b = null;
  if (c.req.method === 'POST') { try { b = await c.req.json(); } catch { b = null; } }
  if (b && (('placeName' in b && b.placeName !== null && typeof b.placeName !== 'string') || ('after' in b && b.after !== null && !Number.isInteger(b.after)))) return c.json({ error: 'placeName må være tekst og after en oppgave-id' }, 400);
  await next();
  if (!b || ![200, 201].includes(c.res.status) || !('placeName' in b || 'after' in b)) return;
  try { const j = await c.res.clone().json(); if (j?.item?.id) await setExtra40(c, j.item.id, b); } catch { /* */ }
}

export function startApi40() { startHjemlys40(); startHungSweeper(); }
