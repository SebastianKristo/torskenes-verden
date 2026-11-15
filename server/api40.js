// Prompt 40 (SERVER40): kobler sammen modulene for prompt 40 (montert i index.js).
//   AI-selvtester (to tidsgrenser, oppvarming, én modell om gangen, minnesjekk, helsesjekk, vakthund), Jobber-gruppering  → ai-run.js, ai/control.js, ai39.js
//   SMB: validering etter SMB-reglene, feiltype per kind, POST /api/smb/shares {host, user, pass}                       → finans/backup.js, smb-browse.js
//   «Starter opp» bare ved ekte omstart: /api/health {restarting, updating, state} + X-Homelab-State                      → index.js, system-update.js
//   2FA i appen: /api/auth/2fa/*                                                                                       → auth/two-factor.js (montert fra auth/login.js)
//   Gjøremål-Glimt: flere punkter med rekkefølge, sted og person (placeName/after i POST og PATCH)                    → server/gjoremal/
//   Nyheter Glimt-side: /api/news/glimt, /api/news/glimt/sources, /api/glimt/news-digest                               → nyheter/ (mountNyheter)
//   Julemodus: /api/glimt/settings jul*, julActive; brief.jul                                                         → jul40.js (+ glimt/settings.js), mellomvaren under
//   Hjemlys: /api/hjemlys/*                                                                                           → server/familie/ (mountFamilie)
//   Fanelinje: GET /api/app/pages + alle nøklene i homeNav                                                            → under (+ mobile.js TAB_IDS)
import { Hono } from 'hono';
import { authOrToken } from './mobile.js';
import { bibleEnabled } from './bibel/bible.js';
import { glimtSettingsOf } from './glimt/settings.js';
import { julBrief } from './jul40.js';
import { db } from './db.js';
import { startHungSweeper } from './ai-run.js';
import { sessionUser } from './auth/session.js';


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

export function startApi40() { startHungSweeper(); }
