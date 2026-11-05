// Prompt 73 (NEWS73): Nyheter – lagre hele artikler offline (claude-code-nyheter-lagre-artikkel.md, fasit «Lagre og logo.dc.html» 1c/1d/1e).
//
// Per bruker. Montert under /api/news/saved (sesjon eller app-token):
//   GET    /api/news/saved                 → {items:[{id, url, title, lead, source, image, savedAt, status, statusText, reason, words, images}], count}
//   POST   /api/news/saved {url, title?, lead?, image?, source?, published?, wait?} → {id, status} (201 ny, 200 finnes fra før)
//            status: 'pending' («Laster ned…») → 'ok' («Lagret») | 'summary' («Kun sammendrag»). Nedlastingen går i bakgrunnen;
//            wait:true venter på resultatet (tester og klienter som vil ha svaret med en gang).
//   GET    /api/news/saved/:id              → hele artikkelen {…, html (sanert), blocks:[{t:'p'|'h'|'quote'|'li'|'img'|'pre', x, src?, cap?}]}
//            ?offline=1: bildene som data:-URI-er (mobilene lagrer svaret lokalt og leser uten nett).
//   POST   /api/news/saved/:id/retry        → {id, status} («Prøv å laste ned på nytt»)
//   DELETE /api/news/saved/:id              → {ok}
//   GET    /api/news/saved/:id/img/:n       → bildet (lagret på serveren, aldri hotlink)
//
// Uttrekk: Readability-lignende (egen liten HTML-parser, ingen nye avhengigheter): poeng per avsnitt til forelder/besteforelder,
// klasse/id-vekter, lenketetthet og søsken-fletting. Meta fra og:/article:/JSON-LD. Er teksten kort (< 800 tegn eller < 1,5 ×
// RSS-sammendraget) prøves JSON-LD articleBody og så AMP-versjonen (<link rel="amphtml">). Feiler alt: «Kun sammendrag».
// Headless nettleser er ikke med (ingen nye avhengigheter) – står i rapporten.
//
// SSRF-vern (kontrakten): bare http/https uten brukernavn/passord; DNS-oppslag der private, loopback, link-local, CGNAT, multicast
// og LAN (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, fe80::/10, IPv4-mappet) avvises – før hver forespørsel,
// etter hver redirect og ved selve tilkoblingen (undici-agent med egen lookup, så DNS-rebinding ikke slipper gjennom).
// Maks 5 redirecter, maks 5 MB, tidsavbrudd 12 s, streng Content-Type (text/html|application/xhtml+xml for sider,
// image/jpeg|png|gif|webp|avif for bilder – ikke SVG).
//
// Lagret HTML bygges av tekstblokker (alt escapes) og saneres i tillegg ved visning (sanitize73): ingen script, iframe, on*-attributter,
// style eller javascript:-lenker. Glimt/felles søk: webx51.js leser news73_saved (type 'article').
import { Hono } from 'hono';
import { Agent, fetch as undiciFetch } from 'undici';
import { lookup as dnsLookupCb } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { authOrToken } from './mobile.js';

const MOCK = () => process.env.MOCK_DATA === '1';
export const MAX_BYTES73 = 5 * 1024 * 1024;
export const MAX_REDIRECTS73 = 5;
const TIMEOUT = 12_000;
const MAX_IMAGES = 12;
const DIR = () => resolve(config.dataDir, 'media', 'news73');
const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)\b/i;
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };

db.exec(`CREATE TABLE IF NOT EXISTS news73_saved (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  lead TEXT NOT NULL DEFAULT '',
  author TEXT,
  published TEXT,
  source TEXT NOT NULL DEFAULT '',
  image TEXT,
  rss TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  blocks TEXT NOT NULL DEFAULT '[]',
  words INTEGER NOT NULL DEFAULT 0,
  images INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  via TEXT,
  saved_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS news73_saved_user ON news73_saved(user_id, saved_at);`);

/* =====================================================================================================================
   SSRF-vern
   ===================================================================================================================== */

/** Privat, lokal, delt eller reservert adresse (IPv4 og IPv6, også IPv4-mappet IPv6). Ikke en IP → true. */
export function blockedIp73(ip) {
  const s = String(ip ?? '').toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v = isIP(s);
  if (v === 4) {
    const [a, b] = s.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    if (s === '::' || s === '::1') return true;
    const m = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return blockedIp73(m[1]);
    const mh = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mh) { const hi = parseInt(mh[1], 16), lo = parseInt(mh[2], 16); return blockedIp73(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
    const h = parseInt(s.split(':')[0] || '0', 16);
    return (h & 0xfe00) === 0xfc00 || (h & 0xffc0) === 0xfe80 || (h & 0xff00) === 0xff00 || s.startsWith('64:ff9b:') || s.startsWith('2001:db8:');
  }
  return true;
}
const ssrf = (msg) => Object.assign(new Error(msg), { code: 'ESSRF' });

let resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((x) => x.address);
function safeLookup(host, opts, cb) {
  dnsLookupCb(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: opts?.family ?? 4 }];
    if (!list.length || list.some((a) => blockedIp73(a.address))) return cb(ssrf(`Avvist adresse for ${host}`));
    if (opts?.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}
const agent = new Agent({ connect: { lookup: safeLookup, timeout: TIMEOUT } });
let F = (u, i) => undiciFetch(u, { ...i, dispatcher: agent });
let injected = false;
/** Bare for tester: {fetch(url, init) → Response, resolve(host) → [ip]}. null tilbakestiller. */
export function _setNet73(o) {
  F = o?.fetch ?? ((u, i) => undiciFetch(u, { ...i, dispatcher: agent }));
  resolver = o?.resolve ?? (async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((x) => x.address));
  injected = !!o;
}

/** Sjekker én adresse: http/https, ingen innlogging i URL-en, og alle DNS-svar er offentlige. → URL */
export async function checkUrl73(input) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { throw ssrf('Ugyldig adresse'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw ssrf('Bare http og https');
  if (u.username || u.password) throw ssrf('Adresse med brukernavn er ikke tillatt');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home\.arpa$/i.test(host)) throw ssrf('Intern adresse');
  if (isIP(host)) { if (blockedIp73(host)) throw ssrf('Intern adresse'); return u; }
  let ips = [];
  try { ips = await resolver(host); } catch { throw ssrf('Fant ikke adressen'); }
  if (!ips?.length || ips.some((ip) => blockedIp73(ip))) throw ssrf('Intern adresse');
  return u;
}

/** GET med SSRF-sjekk per hopp, maks 5 redirecter, maks 5 MB og streng Content-Type. → {buf, type, finalUrl} */
export async function guardedGet73(url, { kind = 'html', maxBytes = MAX_BYTES73 } = {}) {
  let cur = await checkUrl73(url);
  for (let hop = 0; hop <= MAX_REDIRECTS73; hop++) {
    if (hop) cur = await checkUrl73(cur.href);
    const accept = kind === 'html' ? 'text/html,application/xhtml+xml;q=0.9' : 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8';
    const res = await F(cur.href, { redirect: 'manual', headers: { Accept: accept, 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5', 'User-Agent': 'Mozilla/5.0 (homelab-nyhetsleser; lagret artikkel)' }, signal: AbortSignal.timeout(TIMEOUT) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      try { await res.body?.cancel?.(); } catch { /* */ }
      if (!loc) throw new Error('Redirect uten adresse');
      if (hop === MAX_REDIRECTS73) break;
      cur = new URL(loc, cur);
      continue;
    }
    if (!res.ok) { try { await res.body?.cancel?.(); } catch { /* */ } throw Object.assign(new Error(`Siden svarte ${res.status}`), { status: res.status }); }
    const type = String(res.headers.get('content-type') ?? '').toLowerCase().trim();
    const okType = kind === 'html' ? HTML_TYPES.test(type) : !!IMG_TYPES[type.split(';')[0].trim()];
    if (!okType) { try { await res.body?.cancel?.(); } catch { /* */ } throw Object.assign(new Error(`Feil innholdstype: ${type || 'ingen'}`), { code: 'ETYPE' }); }
    const len = Number(res.headers.get('content-length'));
    if (len && len > maxBytes) { try { await res.body?.cancel?.(); } catch { /* */ } throw Object.assign(new Error('For stor'), { code: 'ESIZE' }); }
    const chunks = []; let n = 0;
    if (res.body && typeof res.body.getReader === 'function') {
      const rd = res.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        n += value.length;
        if (n > maxBytes) { try { await rd.cancel(); } catch { /* */ } throw Object.assign(new Error('For stor'), { code: 'ESIZE' }); }
        chunks.push(Buffer.from(value));
      }
    } else {
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length > maxBytes) throw Object.assign(new Error('For stor'), { code: 'ESIZE' });
      chunks.push(b);
    }
    return { buf: Buffer.concat(chunks), type, finalUrl: cur.href };
  }
  throw Object.assign(new Error('For mange redirecter'), { code: 'EREDIR' });
}

/* =====================================================================================================================
   Liten HTML-parser (tolerant, lineær)
   ===================================================================================================================== */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template', 'iframe', 'xmp', 'noembed', 'noframes', 'svg', 'math', 'object']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bdquo: '„', aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', eacute: 'é', Eacute: 'É', egrave: 'è', aacute: 'á', oacute: 'ó', uuml: 'ü', ouml: 'ö', auml: 'ä', Ouml: 'Ö', Auml: 'Ä', Uuml: 'Ü', copy: '©', reg: '®', deg: '°', middot: '·', bull: '•', times: '×', euro: '€', zwj: '', zwnj: '', thinsp: ' ', ensp: ' ', emsp: ' ' };
export const decode73 = (s) => String(s ?? '').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,9});?/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return cp > 0 && cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : ''; } catch { return ''; } }
  return ENT[e] ?? ENT[e.toLowerCase()] ?? m;
});
const NAME_RE = /[a-zA-Z][\w:-]*/y;

function parseAttrs(s, i, n) {
  const attrs = {};
  let selfClose = false;
  while (i < n) {
    const ch = s[i];
    if (ch === '>') return { attrs, end: i + 1, selfClose };
    if (ch === '/' ) { selfClose = s[i + 1] === '>'; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    let j = i;
    while (j < n && !/[\s=>/]/.test(s[j])) j++;
    const name = s.slice(i, j).toLowerCase();
    i = j;
    while (i < n && /\s/.test(s[i])) i++;
    let val = '';
    if (s[i] === '=') {
      i++;
      while (i < n && /\s/.test(s[i])) i++;
      const q = s[i];
      if (q === '"' || q === "'") { const k = s.indexOf(q, i + 1); const e = k < 0 ? n : k; val = s.slice(i + 1, e); i = e + 1; }
      else { let k = i; while (k < n && !/[\s>]/.test(s[k])) k++; val = s.slice(i, k); i = k; }
    }
    if (name && !(name in attrs) && Object.keys(attrs).length < 60) attrs[name] = decode73(val);
  }
  return { attrs, end: n, selfClose };
}

/** HTML → tre {tag, attrs, kids, parent} / {text}. Samler også meta, link og JSON-LD. */
export function parseHtml73(html) {
  const s = String(html ?? '').slice(0, MAX_BYTES73);
  const n = s.length;
  const root = { tag: '#root', attrs: {}, kids: [], parent: null };
  const out = { root, meta: [], links: [], ld: [], title: '' };
  let cur = root, i = 0;
  const open = (tag) => { for (let x = cur, d = 0; x && d < 80; x = x.parent, d++) if (x.tag === tag) return x; return null; };
  const closeTo = (node) => { cur = node.parent ?? root; };
  while (i < n) {
    const j = s.indexOf('<', i);
    if (j < 0) { cur.kids.push({ text: decode73(s.slice(i)) }); break; }
    if (j > i) cur.kids.push({ text: decode73(s.slice(i, j)) });
    i = j;
    if (s.startsWith('<!--', i)) { const k = s.indexOf('-->', i + 4); i = k < 0 ? n : k + 3; continue; }
    const c1 = s[i + 1];
    if (c1 === '!' || c1 === '?') { const k = s.indexOf('>', i); i = k < 0 ? n : k + 1; continue; }
    if (c1 === '/') {
      NAME_RE.lastIndex = i + 2;
      const m = NAME_RE.exec(s);
      const k = s.indexOf('>', i);
      i = k < 0 ? n : k + 1;
      if (!m) continue;
      const tag = m[0].toLowerCase();
      const node = open(tag);
      if (node) closeTo(node);
      continue;
    }
    NAME_RE.lastIndex = i + 1;
    const m = NAME_RE.exec(s);
    if (!m) { cur.kids.push({ text: '<' }); i++; continue; }
    const tag = m[0].toLowerCase();
    const a = parseAttrs(s, i + 1 + m[0].length, n);
    i = a.end;
    if (RAW.has(tag)) {
      const re = new RegExp(`</${tag}\\s*>`, 'ig');
      re.lastIndex = i;
      const e = re.exec(s);
      const inner = s.slice(i, e ? e.index : n);
      i = e ? re.lastIndex : n;
      if (tag === 'title' && !out.title) out.title = decode73(inner).replace(/\s+/g, ' ').trim();
      if (tag === 'script' && /ld\+json/i.test(a.attrs.type ?? '')) out.ld.push(inner);
      if (tag === 'noscript' && /<img\b/i.test(inner)) { // lat-lastede bilder har ofte ekte <img> i <noscript>
        const sub = parseHtml73(inner).root;
        for (const k of sub.kids) { k.parent = cur; cur.kids.push(k); }
      }
      continue;
    }
    if (tag === 'meta') { out.meta.push(a.attrs); continue; }
    if (tag === 'link') { out.links.push(a.attrs); continue; }
    if (BLOCK.has(tag) && cur.tag === 'p') closeTo(cur);
    if (tag === 'li' && cur.tag === 'li') closeTo(cur);
    const node = { tag, attrs: a.attrs, kids: [], parent: cur };
    cur.kids.push(node);
    if (!VOID.has(tag) && !a.selfClose) cur = node;
  }
  return out;
}

const textOf = (node) => {
  if (!node) return '';
  if ('text' in node) return node.text;
  let t = '';
  const st = [node];
  const parts = [];
  while (st.length) {
    const x = st.pop();
    if ('text' in x) { parts.push(x.text); continue; }
    if (x.tag === 'br') parts.push('\n');
    for (let k = x.kids.length - 1; k >= 0; k--) st.push(x.kids[k]);
    if (BLOCK.has(x.tag)) parts.push(' ');
  }
  t = parts.join('');
  return t;
};
const clean = (t) => String(t ?? '').replace(/[ \t\r\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const linkText = (node) => { let n = 0; walk(node, (x) => { if (x.tag === 'a') { n += clean(textOf(x)).length; return false; } return true; }); return n; };
function walk(node, fn) { const st = [node]; while (st.length) { const x = st.pop(); if ('text' in x) continue; if (fn(x) === false) continue; for (let k = x.kids.length - 1; k >= 0; k--) st.push(x.kids[k]); } }

/* =====================================================================================================================
   Uttrekk (Readability-lignende)
   ===================================================================================================================== */

const UNLIKELY = /banner|breadcrumb|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|share|newsletter|cookie|consent|promo|teaser|recommend|advert|subscribe|login|toolbar|byline-?share|tags?-?list|most-?read|mest-?lest|les-?ogsa/i;
const MAYBE = /and|article|body|column|content|main|shadow|story|text/i;
const POSITIVE = /article|body|content|entry|hentry|h-entry|main|page|post|text|blog|story|brodtekst|artikkel/i;
const NEGATIVE = /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget|teaser|recommend|newsletter|paywall-?promo/i;
const JUNK_P = /^(les også|les mer|annonse|annonsørinnhold|del artikkelen|del saken|abonner|logg inn|kjøp abonnement|publisert:?|oppdatert:?|foto:|følg oss|tips oss)\b/i;
const DROP_TAGS = new Set(['nav', 'aside', 'footer', 'header', 'form', 'button', 'select', 'input', 'canvas', 'dialog', 'menu']);
const cls = (n) => `${n.attrs?.class ?? ''} ${n.attrs?.id ?? ''}`;

function classWeight(n) {
  let w = 0;
  const c = n.attrs?.class ?? '', id = n.attrs?.id ?? '';
  if (c) { if (NEGATIVE.test(c)) w -= 25; if (POSITIVE.test(c)) w += 25; }
  if (id) { if (NEGATIVE.test(id)) w -= 25; if (POSITIVE.test(id)) w += 25; }
  return w;
}
function prune(root) {
  walk(root, (x) => {
    x.kids = x.kids.filter((k) => {
      if ('text' in k) return true;
      if (DROP_TAGS.has(k.tag)) return false;
      if (k.attrs?.hidden !== undefined || /display\s*:\s*none/i.test(k.attrs?.style ?? '') || k.attrs?.['aria-hidden'] === 'true' && k.tag !== 'img') return false;
      const c = cls(k);
      if (k.tag !== 'body' && k.tag !== 'article' && k.tag !== 'main' && k.attrs?.itemprop !== 'articleBody' && c.trim() && UNLIKELY.test(c) && !MAYBE.test(c)) return false;
      return true;
    });
    return true;
  });
}
function topCandidate(root) {
  const score = new Map();
  const init = (n) => {
    if (score.has(n)) return;
    let s = classWeight(n);
    if (n.tag === 'div' || n.tag === 'article' || n.tag === 'section' || n.tag === 'main') s += 5;
    if (n.tag === 'article') s += 5;
    if (n.tag === 'pre' || n.tag === 'td' || n.tag === 'blockquote') s += 3;
    if (['form', 'ol', 'ul', 'dl', 'li', 'th'].includes(n.tag)) s -= 3;
    if (/^h[1-6]$/.test(n.tag)) s -= 5;
    if (n.attrs?.itemprop === 'articleBody') s += 40;
    score.set(n, s);
  };
  walk(root, (x) => {
    if (x.tag !== 'p' && x.tag !== 'pre') return true;
    const t = clean(textOf(x));
    if (t.length < 25) return false;
    const pts = 1 + (t.match(/,/g)?.length ?? 0) + Math.min(3, Math.floor(t.length / 100));
    const p1 = x.parent, p2 = p1?.parent;
    if (p1 && p1.tag !== '#root') { init(p1); score.set(p1, score.get(p1) + pts); }
    if (p2 && p2.tag !== '#root') { init(p2); score.set(p2, score.get(p2) + pts / 2); }
    return false;
  });
  let best = null, bestS = -Infinity;
  for (const [n, s0] of score) {
    const len = clean(textOf(n)).length || 1;
    const s = s0 * (1 - Math.min(1, linkText(n) / len));
    score.set(n, s);
    if (s > bestS) { best = n; bestS = s; }
  }
  return { best, bestS, score };
}

/** Bildekilde fra src / lat-lastede attributter / srcset (største). */
function imgSrc(n, base) {
  const a = n.attrs ?? {};
  let cand = [a['data-src'], a['data-original'], a['data-lazy-src'], a['data-url'], a.src].find((v) => v && !/^data:/i.test(v));
  const set = a['data-srcset'] || a.srcset;
  if (set) {
    const best = set.split(',').map((x) => x.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseFloat(w) || 1 })).filter((x) => x.u && !/^data:/i.test(x.u)).sort((x, y) => y.w - x.w)[0];
    if (best && (!cand || best.w >= 300)) cand = best.u;
  }
  if (!cand) return null;
  try { const u = new URL(cand, base ?? undefined); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

/** Kandidaten (og gode søsken) → blokker [{t, x, src, cap}]. */
function blocksOf(nodes, base) {
  const out = [];
  let inline = [];
  const flush = () => { const t = clean(inline.join('')); inline = []; if (t) out.push({ t: 'p', x: t }); };
  const visit = (x, ctx) => {
    if ('text' in x) { inline.push(x.text); return; }
    const tag = x.tag;
    if (tag === 'br') { inline.push('\n'); return; }
    if (tag === 'img' || tag === 'picture') {
      const img = tag === 'img' ? x : null;
      let src = img ? imgSrc(img, base) : null;
      if (!src && tag === 'picture') { walk(x, (y) => { if (!src && (y.tag === 'img' || y.tag === 'source')) src = imgSrc(y, base); return !src; }); }
      if (src && !ctx.inFigure) { flush(); out.push({ t: 'img', src, cap: clean(img?.attrs?.alt ?? '').slice(0, 300) }); }
      else if (src) ctx.figImg ??= { src, alt: clean(img?.attrs?.alt ?? '') };
      return;
    }
    if (tag === 'figure') {
      flush();
      const f = { inFigure: true, figImg: null };
      let cap = '';
      for (const k of x.kids) { if (k.tag === 'figcaption') cap = clean(textOf(k)); else if (!('text' in k)) visitFig(k, f); }
      if (f.figImg) out.push({ t: 'img', src: f.figImg.src, cap: (cap || f.figImg.alt).slice(0, 300) });
      return;
    }
    if (/^h[1-6]$/.test(tag)) { flush(); const t = clean(textOf(x)); if (t && t.length < 200) out.push({ t: 'h', x: t }); return; }
    if (tag === 'p' || tag === 'pre' || tag === 'blockquote' || tag === 'li') {
      flush();
      const hasBlockKid = x.kids.some((k) => k.tag && (BLOCK.has(k.tag) && k.tag !== 'li') || k.tag === 'figure' || k.tag === 'img');
      if (hasBlockKid && tag !== 'pre') { for (const k of x.kids) visit(k, ctx); flush(); return; }
      const t = clean(textOf(x));
      if (!t) return;
      const ld = linkText(x) / (t.length || 1);
      if (ld > 0.5 && t.length < 160) return;
      if (JUNK_P.test(t) && t.length < 160) return;
      out.push({ t: tag === 'blockquote' ? 'quote' : tag === 'li' ? 'li' : tag === 'pre' ? 'pre' : 'p', x: tag === 'pre' ? String(textOf(x)).replace(/\s+$/, '').slice(0, 8000) : t });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      const t = clean(textOf(x));
      if (t && linkText(x) / t.length > 0.5) return; // lenkelister (relaterte saker)
      for (const k of x.kids) visit(k, ctx);
      flush();
      return;
    }
    if (tag === 'table') { flush(); for (const k of x.kids) visit(k, ctx); flush(); return; }
    if (tag === 'tr') { flush(); const t = clean(textOf(x)).replace(/\s+/g, ' '); if (t) out.push({ t: 'p', x: t }); return; }
    const block = BLOCK.has(tag) || tag === 'section';
    if (block) flush();
    for (const k of x.kids) visit(k, ctx);
    if (block) flush();
  };
  const visitFig = (x, f) => {
    if (x.tag === 'img' || x.tag === 'source') { const s = imgSrc(x, base); if (s && !f.figImg) f.figImg = { src: s, alt: clean(x.attrs?.alt ?? '') }; return; }
    for (const k of x.kids ?? []) if (!('text' in k)) visitFig(k, f);
  };
  for (const n of nodes) visit(n, { inFigure: false });
  flush();
  // Duplikater (samme avsnitt to ganger) og tomme bildetekster.
  const seen = new Set();
  return out.filter((b) => { const k = b.t === 'img' ? `i:${b.src}` : `${b.t}:${b.x}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 600);
}

const metaGet = (doc, ...names) => {
  for (const nm of names) {
    const m = doc.meta.find((a) => (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase() === nm && a.content);
    if (m) return clean(m.content);
  }
  return null;
};
function ldArticle(doc) {
  const want = /^(NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|BlogPosting|OpinionNewsArticle|LiveBlogPosting|Report|WebPage)$/;
  const found = [];
  const scan = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 6) return;
    if (Array.isArray(o)) { o.forEach((x) => scan(x, d + 1)); return; }
    const t = [].concat(o['@type'] ?? []);
    if (t.some((x) => want.test(String(x)))) found.push(o);
    if (o['@graph']) scan(o['@graph'], d + 1);
    if (o.mainEntity) scan(o.mainEntity, d + 1);
  };
  for (const raw of doc.ld) { try { scan(JSON.parse(raw.trim())); } catch { /* ugyldig JSON-LD */ } }
  return found.sort((a, b) => (String(b.articleBody ?? '').length - String(a.articleBody ?? '').length) || ((/WebPage/.test(String(a['@type'])) ? 1 : 0) - (/WebPage/.test(String(b['@type'])) ? 1 : 0)))[0] ?? null;
}
const nameOf = (v) => (Array.isArray(v) ? v.map(nameOf).filter(Boolean).join(', ') : typeof v === 'string' ? v : v?.name ? String(v.name) : '');
const httpOnly = (u, base) => { try { const x = new URL(String(u ?? ''), base ?? undefined); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null; } catch { return null; } };

export const textLen73 = (blocks) => blocks.filter((b) => b.t !== 'img').reduce((n, b) => n + (b.x?.length ?? 0), 0);
/** Kort-tekst-regelen: brødteksten regnes som mislykket når den er < 800 tegn eller < 1,5 × RSS-sammendraget. */
export const isShort73 = (len, rssLen = 0) => len < 800 || (rssLen > 0 && len < 1.5 * rssLen);

/** Artikkelside → {title, lead, author, published, source, image, blocks, text, words, amp, paywall}. */
export function extract73(html, baseUrl = null) {
  const doc = parseHtml73(html);
  const ld = ldArticle(doc);
  let host = '';
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { /* */ }
  const site = metaGet(doc, 'og:site_name', 'application-name') ?? '';
  let title = metaGet(doc, 'og:title', 'twitter:title') ?? (ld?.headline ? clean(ld.headline) : null) ?? doc.title ?? '';
  if (!metaGet(doc, 'og:title', 'twitter:title') && site && title.includes(site)) title = title.replace(new RegExp(`\\s*[-–|·:]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '');
  const lead = metaGet(doc, 'og:description', 'description', 'twitter:description') ?? (ld?.description ? clean(ld.description) : '') ?? '';
  let author = metaGet(doc, 'author', 'article:author', 'dc.creator', 'byl') ?? (nameOf(ld?.author) || null);
  if (author && /^https?:\/\//i.test(author)) author = nameOf(ld?.author) || null;
  const published = metaGet(doc, 'article:published_time', 'og:article:published_time', 'datepublished', 'pubdate', 'publishdate', 'date', 'dc.date', 'dc.date.issued') ?? (ld?.datePublished ? String(ld.datePublished) : null);
  const ldImg = (() => { const im = ld?.image; const v = Array.isArray(im) ? im[0] : im; return typeof v === 'string' ? v : v?.url ?? null; })();
  const image = httpOnly(metaGet(doc, 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src') ?? ldImg, baseUrl);
  const ampHref = doc.links.find((l) => /(^|\s)amphtml(\s|$)/i.test(l.rel ?? '') && l.href)?.href;
  const amp = ampHref ? httpOnly(ampHref, baseUrl) : null;
  const paywall = ld?.isAccessibleForFree === false || String(ld?.isAccessibleForFree).toLowerCase() === 'false';

  // Selve brødteksten.
  const body = (() => { let b = null; walk(doc.root, (x) => { if (!b && x.tag === 'body') b = x; return !b; }); return b ?? doc.root; })();
  prune(body);
  let blocks = [];
  let direct = null;
  walk(body, (x) => { if (!direct && x.attrs?.itemprop === 'articleBody') direct = x; return !direct; });
  const { best, bestS, score } = topCandidate(body);
  let top = direct ?? best;
  if (top) {
    // Søsken som også ser ut som brødtekst flettes inn (artikler delt over flere <div>-er).
    const nodes = [];
    const par = top.parent;
    if (par && !direct) {
      const thr = Math.max(10, bestS * 0.2);
      for (const sib of par.kids) {
        if ('text' in sib) continue;
        if (sib === top) { nodes.push(sib); continue; }
        const s = score.get(sib) ?? 0;
        let ok = s >= thr;
        if (!ok && sib.tag === 'p') { const t = clean(textOf(sib)); const ld2 = linkText(sib) / (t.length || 1); ok = (t.length > 80 && ld2 < 0.25) || (t.length > 0 && t.length <= 80 && ld2 === 0 && /\.( |$)/.test(t)); }
        if (ok) nodes.push(sib);
      }
    } else nodes.push(top);
    blocks = blocksOf(nodes, baseUrl);
  }
  // Fjern tittelen og ingressen hvis de står først i brødteksten.
  const norm = (t) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  while (blocks.length && blocks[0].t !== 'img' && (norm(blocks[0].x) === norm(title) || (lead && norm(blocks[0].x) === norm(lead)))) blocks.shift();
  // JSON-LD articleBody når den er lengre (mange norske aviser har hele teksten der).
  const ldBody = clean(decode73(String(ld?.articleBody ?? '').replace(/<[^>]+>/g, '\n')));
  let via = 'page';
  if (ldBody.length > textLen73(blocks) * 1.2 && ldBody.length >= 400) {
    const imgs = blocks.filter((b) => b.t === 'img');
    blocks = [...imgs.slice(0, 1), ...ldBody.split(/\n{1,}/).map((x) => clean(x)).filter((x) => x.length > 1).map((x) => ({ t: 'p', x })), ...imgs.slice(1)];
    via = 'jsonld';
  }
  const text = blocks.filter((b) => b.t !== 'img').map((b) => b.x).join('\n\n');
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return { title: clean(title).slice(0, 400), lead: clean(lead).slice(0, 1200), author: author ? clean(author).slice(0, 200) : null, published, source: clean(site) || host, image, blocks, text, words, amp, paywall, via };
}

/* =====================================================================================================================
   Sanering og HTML
   ===================================================================================================================== */

export const esc73 = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Blokker → HTML (alt escapes; bilder bare fra egen rute eller data:image). */
export function htmlOf73(blocks) {
  const out = [];
  let list = false;
  for (const b of blocks) {
    if (b.t === 'li' && !list) { out.push('<ul>'); list = true; }
    if (b.t !== 'li' && list) { out.push('</ul>'); list = false; }
    if (b.t === 'p') out.push(`<p>${esc73(b.x)}</p>`);
    else if (b.t === 'h') out.push(`<h2>${esc73(b.x)}</h2>`);
    else if (b.t === 'quote') out.push(`<blockquote><p>${esc73(b.x)}</p></blockquote>`);
    else if (b.t === 'li') out.push(`<li>${esc73(b.x)}</li>`);
    else if (b.t === 'pre') out.push(`<pre>${esc73(b.x)}</pre>`);
    else if (b.t === 'img' && b.src) out.push(`<figure><img src="${esc73(b.src)}" alt="${esc73(b.cap ?? '')}" loading="lazy">${b.cap ? `<figcaption>${esc73(b.cap)}</figcaption>` : ''}</figure>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

const SAFE_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'figure', 'figcaption', 'img', 'a', 'strong', 'b', 'em', 'i', 'br', 'hr', 'span', 'sub', 'sup']);
const DROP_ALL = new Set(['script', 'style', 'iframe', 'object', 'embed', 'frame', 'frameset', 'svg', 'math', 'template', 'noscript', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base', 'title', 'head', 'audio', 'video', 'canvas', 'applet']);
const safeHref = (v) => { const t = String(v ?? '').replace(/[\u0000- \u007f-\u009f]/g, ''); if (/^(javascript|vbscript|data|file|blob):/i.test(t)) return null; return /^(https?:|mailto:|\/(?!\/)|#)/i.test(t) ? String(v).trim() : null; };
const safeSrc = (v) => { const t = String(v ?? '').trim(); if (/^\/api\/news\/saved\/[\w-]+\/img\/\d+$/.test(t)) return t; if (/^data:image\/(jpeg|png|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(t)) return t; return null; };

/** Sanering ved visning: hvitliste av tagger og attributter. Ingen script/iframe/style, ingen on*-attributter, ingen javascript:. */
export function sanitize73(html) {
  const doc = parseHtml73(String(html ?? '').replace(/<(script|style|iframe|object|embed|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi, ''));
  const out = [];
  const emit = (x) => {
    if ('text' in x) { out.push(esc73(x.text)); return; }
    const tag = x.tag;
    if (DROP_ALL.has(tag)) return;
    if (!SAFE_TAGS.has(tag)) { for (const k of x.kids) emit(k); return; }
    let attrs = '';
    if (tag === 'a') { const h = safeHref(x.attrs.href); if (h) attrs = ` href="${esc73(h)}" target="_blank" rel="noopener noreferrer nofollow"`; }
    if (tag === 'img') { const s = safeSrc(x.attrs.src); if (!s) return; attrs = ` src="${esc73(s)}" alt="${esc73(x.attrs.alt ?? '')}" loading="lazy"`; }
    if (VOID.has(tag)) { out.push(`<${tag}${attrs}>`); return; }
    out.push(`<${tag}${attrs}>`);
    for (const k of x.kids) emit(k);
    out.push(`</${tag}>`);
  };
  for (const k of doc.root.kids) emit(k);
  return out.join('');
}

/* =====================================================================================================================
   Lagring
   ===================================================================================================================== */

const q = (sql) => db.prepare(sql);
const userDir = (user) => join(DIR(), createHash('sha256').update(String(user)).digest('hex').slice(0, 16));
const artDir = (user, id) => join(userDir(user), String(id).replace(/[^\w-]/g, ''));
const STATUS_TEXT = { pending: 'Laster ned…', ok: 'Lagret · uten nett', summary: 'Kun sammendrag', error: 'Kun sammendrag' };
const REASON_TEXT = { paywall: 'betalingsmur', blocked: 'blokkert', short: 'fant ikke hele teksten', network: 'fikk ikke kontakt', type: 'ikke en nettside' };
const plain = (s, max) => clean(decode73(String(s ?? '').replace(/<[^>]+>/g, ' '))).slice(0, max);

function rowOut(r, { full = false } = {}) {
  const reason = r.reason ? REASON_TEXT[r.reason] ?? r.reason : null;
  const o = { id: r.id, url: r.url, title: r.title, lead: r.lead, author: r.author, published: r.published, source: r.source, image: r.image, savedAt: new Date(r.saved_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(), status: r.status, statusText: r.status === 'summary' && reason ? `Kun sammendrag · ${reason}` : STATUS_TEXT[r.status] ?? r.status, reason, words: r.words, images: r.images, via: r.via ?? null };
  if (full) {
    let blocks = [];
    try { blocks = JSON.parse(r.blocks) ?? []; } catch { blocks = []; }
    o.blocks = blocks;
    o.html = sanitize73(r.html);
  }
  return o;
}
export const savedList73 = (user) => q('SELECT * FROM news73_saved WHERE user_id=? ORDER BY saved_at DESC LIMIT 500').all(user).map((r) => rowOut(r));
export const savedGet73 = (user, id) => { const r = q('SELECT * FROM news73_saved WHERE user_id=? AND id=?').get(user, String(id)); return r ? rowOut(r, { full: true }) : null; };
/** For felles søk (webx51.js): tekst per lagret artikkel. */
export const savedDocs73 = (user) => q('SELECT id, title, lead, source, html, status, saved_at FROM news73_saved WHERE user_id=? ORDER BY saved_at DESC LIMIT 500').all(user)
  .map((r) => ({ id: r.id, title: r.title, source: r.source, status: r.status, savedAt: r.saved_at, body: `${r.lead} ${r.source} ${plain(r.html, 6000)}` }));
export const savedSig73 = (user) => { const r = q("SELECT count(*) AS n, ifnull(max(updated_at),0) AS t FROM news73_saved WHERE user_id=?").get(user); return `${r.n}:${r.t}`; };

/** RSS-saken fra brukerens egne kilder (metadata og fallback), hvis den finnes. */
function rssItemOf(user, url) {
  try {
    return q(`SELECT i.title, i.excerpt, i.image, i.published, f.name AS feed FROM rss_item i JOIN rss_feed f ON f.id=i.feed_id WHERE f.user=? AND i.url=? ORDER BY i.published DESC LIMIT 1`).get(user, url) ?? null;
  } catch { return null; }
}

export function createSaved73(user, body) {
  const url = String(body?.url ?? '').trim().slice(0, 2000);
  let u;
  try { u = new URL(url); } catch { throw Object.assign(new Error('Ugyldig adresse'), { status: 400 }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('Bare http og https'), { status: 400 });
  const have = q('SELECT * FROM news73_saved WHERE user_id=? AND url=?').get(user, u.href);
  if (have) return { row: have, created: false };
  const it = rssItemOf(user, u.href) ?? rssItemOf(user, url);
  const rss = plain(body?.content ?? body?.description ?? it?.excerpt ?? body?.lead ?? body?.excerpt ?? '', 8000);
  const now = Date.now();
  const id = randomUUID();
  q(`INSERT INTO news73_saved (id, user_id, url, title, lead, source, published, rss, status, saved_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?)`)
    .run(id, user, u.href, plain(it?.title ?? body?.title ?? '', 400) || u.hostname, plain(body?.lead ?? body?.excerpt ?? it?.excerpt ?? '', 1200), plain(it?.feed ?? body?.source ?? body?.feed ?? '', 120) || u.hostname.replace(/^www\./, ''),
      String(it?.published ?? body?.published ?? '').slice(0, 40) || null, rss, now, now);
  return { row: q('SELECT * FROM news73_saved WHERE id=?').get(id), created: true, rssImage: it?.image ?? body?.image ?? null };
}

/** Bildene lastes ned til serveren (guardedGet73, kind 'img'). → {blocks, image, count} */
async function storeImages(user, id, blocks, heroUrl) {
  const dir = artDir(user, id);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const save = async (src) => {
    if (n >= MAX_IMAGES || !src) return null;
    try {
      const r = await guardedGet73(src, { kind: 'img' });
      const ext = IMG_TYPES[r.type.split(';')[0].trim()];
      if (!ext || r.buf.length < 64) return null;
      const k = ++n;
      writeFileSync(join(dir, `${k}.${ext}`), r.buf);
      return `/api/news/saved/${id}/img/${k}`;
    } catch { return null; }
  };
  const seen = new Map();
  const out = [];
  for (const b of blocks) {
    if (b.t !== 'img') { out.push(b); continue; }
    if (!seen.has(b.src)) seen.set(b.src, await save(b.src));
    const local = seen.get(b.src);
    if (local) out.push({ ...b, src: local });
  }
  let image = null;
  if (heroUrl) { if (!seen.has(heroUrl)) seen.set(heroUrl, await save(heroUrl)); image = seen.get(heroUrl); }
  const used = new Set(out.filter((b) => b.t === 'img').map((b) => b.src));
  return { blocks: out, image: image ?? out.find((b) => b.t === 'img')?.src ?? null, count: new Set([...used, ...(image ? [image] : [])]).size };
}

const running = new Map(); // id → Promise
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
/** Henter artikkelen (side → JSON-LD → AMP), bildene, og lagrer. Kaster aldri: feil gir «Kun sammendrag». */
export function download73(user, id, extra = {}) {
  if (running.has(id)) return running.get(id);
  const p = (async () => {
    const row = q('SELECT * FROM news73_saved WHERE user_id=? AND id=?').get(user, id);
    if (!row) return null;
    q("UPDATE news73_saved SET status='pending', updated_at=? WHERE id=?").run(Date.now(), id);
    const rssLen = row.rss.length;
    let ext = null, reason = null, via = null;
    if (MOCK() && !injected) {
      const { mockArticle } = await import('./mock.js');
      const m = mockArticle(row.title, 'norge', row.source || 'NRK');
      const paras = m.text.split(/\n\n+/).map((x) => ({ t: 'p', x: x.trim() })).filter((b) => b.x);
      ext = { title: row.title, lead: row.lead || '', author: null, published: row.published, source: row.source, image: null, blocks: paras, text: m.text, words: m.text.split(/\s+/).length, amp: null, paywall: false, via: 'page' };
      via = 'mock';
    } else {
      try {
        const r = await guardedGet73(row.url, { kind: 'html' });
        ext = extract73(r.buf.toString('utf8'), r.finalUrl);
        via = ext.via;
        if (isShort73(textLen73(ext.blocks), rssLen) && ext.amp) {
          try {
            const a = await guardedGet73(ext.amp, { kind: 'html' });
            const e2 = extract73(a.buf.toString('utf8'), a.finalUrl);
            if (textLen73(e2.blocks) > textLen73(ext.blocks)) { ext = { ...e2, title: ext.title || e2.title, lead: ext.lead || e2.lead, author: ext.author ?? e2.author, published: ext.published ?? e2.published, image: ext.image ?? e2.image, source: ext.source || e2.source, paywall: ext.paywall || e2.paywall }; via = 'amp'; }
          } catch { /* AMP feilet: vurder det vi har */ }
        }
        if (isShort73(textLen73(ext.blocks), rssLen)) reason = ext.paywall ? 'paywall' : 'short';
      } catch (e) {
        reason = e.code === 'ESSRF' ? 'blocked' : e.code === 'ETYPE' ? 'type' : [401, 402, 403].includes(e.status) ? (e.status === 403 ? 'blocked' : 'paywall') : 'network';
      }
    }
    const status = reason ? 'summary' : 'ok';
    let blocks = ext?.blocks ?? [];
    if (status === 'summary') {
      // Det som finnes: tittel, ingress, bilde, lenke + RSS-teksten (eller den korte brødteksten hvis den er lengre).
      const rssBlocks = row.rss ? row.rss.split(/\n{2,}/).map((x) => ({ t: 'p', x: clean(x) })).filter((b) => b.x) : [];
      blocks = textLen73(blocks) > rssLen ? blocks : [...blocks.filter((b) => b.t === 'img').slice(0, 1), ...rssBlocks];
    }
    let img = { blocks, image: null, count: 0 };
    try { img = await storeImages(user, id, blocks, ext?.image ?? extra.rssImage ?? null); } catch { /* bilder er ikke kritiske */ }
    const text = img.blocks.filter((b) => b.t !== 'img').map((b) => b.x).join(' ');
    const now = Date.now();
    q(`UPDATE news73_saved SET title=?, lead=?, author=?, published=?, source=?, image=?, html=?, blocks=?, words=?, images=?, status=?, reason=?, via=?, updated_at=? WHERE id=? AND user_id=?`).run(
      (row.title && row.title !== hostOf(row.url) ? row.title : ext?.title) || ext?.title || row.title,
      row.lead || ext?.lead || '', ext?.author ?? row.author ?? null, row.published ?? ext?.published ?? null, (row.source && row.source !== hostOf(row.url).replace(/^www\./, '') ? row.source : ext?.source) || row.source || '',
      img.image, htmlOf73(img.blocks), JSON.stringify(img.blocks), text ? text.split(/\s+/).filter(Boolean).length : 0, img.count, status, reason, via, now, id, user);
    return q('SELECT * FROM news73_saved WHERE id=?').get(id);
  })().catch((e) => { console.warn('[news73] nedlasting:', e.message); try { q("UPDATE news73_saved SET status='summary', reason='network', updated_at=? WHERE id=? AND status='pending'").run(Date.now(), id); } catch { /* */ } return null; })
    .finally(() => running.delete(id));
  running.set(id, p);
  return p;
}

export function deleteSaved73(user, id) {
  const r = q('DELETE FROM news73_saved WHERE user_id=? AND id=?').run(user, String(id));
  if (r.changes) { try { rmSync(artDir(user, id), { recursive: true, force: true }); } catch { /* */ } }
  return r.changes > 0;
}

/** Bildene som data:-URI-er (mobilenes offline-kopi). */
function inlineImages(user, id, o) {
  const dir = artDir(user, id);
  const MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
  const cache = new Map();
  let total = 0;
  const data = (src) => {
    const m = String(src ?? '').match(/\/img\/(\d+)$/);
    if (!m) return null;
    if (cache.has(m[1])) return cache.get(m[1]);
    let v = null;
    for (const [ext, mime] of Object.entries(MIME)) {
      const f = join(dir, `${m[1]}.${ext}`);
      if (existsSync(f)) { const b = readFileSync(f); if (total + b.length <= 12 * 1024 * 1024) { total += b.length; v = `data:${mime};base64,${b.toString('base64')}`; } break; }
    }
    cache.set(m[1], v);
    return v;
  };
  o.blocks = o.blocks.map((b) => (b.t === 'img' ? { ...b, src: data(b.src) } : b)).filter((b) => b.t !== 'img' || b.src);
  o.image = o.image ? data(o.image) : null;
  o.html = sanitize73(htmlOf73(o.blocks));
  o.offline = true;
  return o;
}

/* =====================================================================================================================
   Ruter
   ===================================================================================================================== */

export const news73Api = new Hono();
news73Api.use('*', authOrToken);
news73Api.get('/', (c) => { const items = savedList73(c.get('user')); return c.json({ items, count: items.length }); });
news73Api.post('/', async (c) => {
  const user = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  let made;
  try { made = createSaved73(user, b); } catch (e) { return c.json({ error: e.message }, e.status ?? 400); }
  const { row, created } = made;
  if (created || row.status !== 'ok') {
    const p = download73(user, row.id, { rssImage: made.rssImage });
    if (b?.wait) { const r = await p; return c.json({ id: row.id, status: r?.status ?? 'summary', item: r ? rowOut(r) : null }, created ? 201 : 200); }
  }
  return c.json({ id: row.id, status: created ? 'pending' : row.status, item: rowOut(q('SELECT * FROM news73_saved WHERE id=?').get(row.id)) }, created ? 201 : 200);
});
news73Api.get('/:id', (c) => {
  const user = c.get('user'), id = c.req.param('id');
  const o = savedGet73(user, id);
  if (!o) return c.json({ error: 'Fant ikke artikkelen' }, 404);
  return c.json(c.req.query('offline') === '1' ? inlineImages(user, id, o) : o);
});
news73Api.post('/:id/retry', async (c) => {
  const user = c.get('user'), id = c.req.param('id');
  if (!q('SELECT 1 FROM news73_saved WHERE user_id=? AND id=?').get(user, id)) return c.json({ error: 'Fant ikke artikkelen' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const p = download73(user, id);
  if (b?.wait) { const r = await p; return c.json({ id, status: r?.status ?? 'summary', item: r ? rowOut(r) : null }); }
  return c.json({ id, status: 'pending' });
});
news73Api.delete('/:id', (c) => (deleteSaved73(c.get('user'), c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Fant ikke artikkelen' }, 404)));
news73Api.get('/:id/img/:n', (c) => {
  const user = c.get('user'), id = c.req.param('id'), n = c.req.param('n');
  if (!/^\d{1,3}$/.test(n) || !q('SELECT 1 FROM news73_saved WHERE user_id=? AND id=?').get(user, id)) return c.json({ error: 'Fant ikke bildet' }, 404);
  const dir = artDir(user, id);
  const MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
  for (const [ext, mime] of Object.entries(MIME)) {
    const f = join(dir, `${n}.${ext}`);
    if (existsSync(f)) return new Response(readFileSync(f), { headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=2592000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  }
  return c.json({ error: 'Fant ikke bildet' }, 404);
});
