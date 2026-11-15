// Fanelinjen: alle sider i Mer og «Rediger fanelinjen» (GET /api/app/pages). Montert fra server/index.js før /api/app.
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { bibleEnabled } from '../bibel/bible.js';

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
  ['brief', 'brief', 'Brief', '✧', 'sun.horizon', 'wb_twilight', '/brief', 'sheet'],
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
