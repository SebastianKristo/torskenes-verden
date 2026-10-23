// Prompt 46 (SERVER46), claude-code-claude-import-minne-markdown.md – Claude-import av MINNE-eksporten (mappe/ZIP med .md-filer).
//
// Årsak: importen (ai-import45.js) godtok bare samtale-eksporten og kastet «Fant ikke conversations.json i eksporten» så fort fila
// ikke hadde den – også for minne-eksporten `claude-memory-<dato>/areas/<tema>.md`, som er nettopp det Glimt skal huske.
// Nå gjenkjennes formatet på innholdet: conversations.json (samtaler), memories.json (minner), mange .md-filer (minneområder),
// eller begge. Det er bare feil når INGENTING kjennes igjen, og da sier feilen hva som ble funnet.
//
// Tolking: én fil = ett minneområde. Tittel = første «# Overskrift», ellers filnavnet («arild-kristo-estate» → «Arild Kristo Estate»).
// Mappenavnet (areas, projects, people …) = kategori. Punktene deles på «##»-overskrifter, punktlister og avsnitt; lenker og
// kodeblokker beholdes. Datoen i mappenavnet (2026-10-21) = kilde-dato. Kilde: claude-memory.
// Lagring: punktene legges i ai_memory43 (brukes av Chat og Glimt, src 'claude-memory'), koblet til området i ai_memory46_items
// (hash per punkt). Samme fil importert på nytt OPPDATERER området: nye punkter legges til, borte punkter fjernes, like beholdes –
// ingen kopier. Embeddings (nomic-embed-text via ai-run.js embed) lagres i ai_memory45_vec. Alt per bruker.
import { createHash } from 'node:crypto';
import { db } from './db.js';

const q = (sql) => db.prepare(sql);
db.exec(`CREATE TABLE IF NOT EXISTS ai_memory46_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, area_key TEXT NOT NULL, title TEXT NOT NULL, category TEXT, file TEXT,
  source TEXT NOT NULL DEFAULT 'claude-memory', src_date TEXT, points INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  UNIQUE(user_id, area_key)
);
CREATE TABLE IF NOT EXISTS ai_memory46_items (
  memory_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, area_key TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_memory46_items_area ON ai_memory46_items(user_id, area_key);`);

export const MEMORY_SRC46 = 'claude-memory';
export const LIMITS46 = { files: 2000, fileBytes: 4 * 1024 ** 2, pointsPerArea: 400, pointChars: 1000, totalPoints: 6000 };
const MEMORY_DIRS = /^(areas?|projects?|people|persons?|personer|topics?|tema|memories|memory|minner|notes?)$/i;

const base = (n) => String(n).split('/').pop();
const dirs = (n) => String(n).split('/').slice(0, -1);
/** Er dette en .md-fil fra en minne-eksport? strict=false: alle .md (når eksporten ikke har samtaler). */
export function isMemoryMd46(name, { strict = true } = {}) {
  const n = String(name ?? '');
  if (!/\.(md|markdown)$/i.test(n) || /(^|\/)(__MACOSX|\.)/.test(n)) return false;
  if (/^(memor(y|ies)|conversations_memory|user_memories?)[^/]*\.md$/i.test(base(n))) return false; // leses som før (én linje = ett punkt)
  if (!strict) return !/^(readme|license|changelog)\.md$/i.test(base(n));
  return dirs(n).some((d) => /^claude-memory/i.test(d) || MEMORY_DIRS.test(d));
}
/** «claude-memory-2026-10-21/areas/x.md» → '2026-10-21' (eller null). */
export function dateFromPath46(name) {
  const m = String(name ?? '').match(/(20\d{2})-(\d{2})-(\d{2})/);
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const titleFromFile = (n) => base(n).replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ').trim().replace(/\s+/g, ' ')
  .split(' ').map((w) => (w.length > 1 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase() === w && w.length <= 4 ? w : w[0]?.toUpperCase() + w.slice(1))).join(' ') || 'Minne';
const CAT_NB = { area: 'Områder', areas: 'Områder', project: 'Prosjekter', projects: 'Prosjekter', people: 'Personer', person: 'Personer', persons: 'Personer', topic: 'Tema', topics: 'Tema' };
const hashOf = (t) => createHash('sha1').update(String(t).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 20);
const tidy = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim();

/**
 * Én Markdown-fil → {key, title, category, categoryLabel, file, date, points:[{text, hash, section}]}.
 * Punkter: punktlister (underpunkter slås inn i forelderen), avsnitt og kodeblokker (med ```), med «##»-seksjonen foran.
 */
export function parseMemoryMd46(name, text) {
  let src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let fmTitle = null;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) { fmTitle = fm[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? null; src = src.slice(fm[0].length); }
  const lines = src.split('\n');
  let title = fmTitle, section = null, para = [], code = null, last = null;
  const points = [];
  const push = (t) => {
    let s = tidy(t);
    if (!s || /^[-–*:.\s]*$/.test(s)) return null;
    if (section && !s.startsWith('```')) s = `${section}: ${s}`;
    const p = { text: s.slice(0, LIMITS46.pointChars), section };
    if (points.length < LIMITS46.pointsPerArea) points.push(p);
    return p;
  };
  const flushPara = () => { if (para.length) { push(para.join(' ')); para = []; } last = null; };
  for (const raw of lines) {
    if (code) {
      if (/^\s*```/.test(raw)) { const body = code.lines.join('\n').trimEnd(); if (body) { const p = push(`\`\`\`${code.lang}\n${body}\n\`\`\``); if (p && section) p.text = `${section}:\n${p.text}`.slice(0, LIMITS46.pointChars); } code = null; }
      else code.lines.push(raw);
      continue;
    }
    const fence = raw.match(/^\s*```\s*([\w+-]*)/);
    if (fence) { flushPara(); code = { lang: fence[1] ?? '', lines: [] }; continue; }
    const h = raw.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      flushPara();
      const t = tidy(h[2].replace(/\*\*|__/g, ''));
      if (h[1].length === 1 && !title) title = t;
      else if (h[1].length >= 2) section = t || null;
      else if (h[1].length === 1) section = t || null;
      continue;
    }
    const sub = raw.match(/^(\s{2,}|\t+)(?:[-*+•]|\d+[.)])\s+(.*)$/);
    if (sub && last) { last.text = `${last.text} – ${tidy(sub[2])}`.slice(0, LIMITS46.pointChars); continue; }
    const li = raw.match(/^\s{0,1}(?:[-*+•]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (li) { if (para.length) { push(para.join(' ')); para = []; } last = push(li[1]); continue; }
    if (!raw.trim()) { flushPara(); continue; }
    if (/^\s*([-*_]\s*){3,}$/.test(raw)) { flushPara(); continue; } // skillelinje
    if (/^\s*>/.test(raw)) { para.push(raw.replace(/^\s*>\s?/, '')); continue; }
    if (last && /^\s{2,}\S/.test(raw)) { last.text = `${last.text} ${tidy(raw)}`.slice(0, LIMITS46.pointChars); continue; }
    para.push(raw);
  }
  if (code && code.lines.length) push(`\`\`\`${code.lang}\n${code.lines.join('\n').trimEnd()}\n\`\`\``);
  flushPara();
  const d = dirs(name).filter((x) => !/^claude-memory/i.test(x));
  const category = (d[d.length - 1] ?? 'areas').toLowerCase();
  const key = [...d.map((x) => x.toLowerCase()), base(name).replace(/\.(md|markdown)$/i, '').toLowerCase()].join('/').slice(0, 200);
  const seen = new Set();
  const uniq = points.filter((p) => { p.hash = hashOf(p.text); if (seen.has(p.hash)) return false; seen.add(p.hash); return true; });
  return { key, title: (title || titleFromFile(name)).slice(0, 120), category, categoryLabel: CAT_NB[category] ?? category.charAt(0).toUpperCase() + category.slice(1), file: String(name).slice(0, 300), date: dateFromPath46(name), points: uniq };
}

const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
export const dateText46 = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${+d.slice(8, 10)}. ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');

/** Forhåndsvisning: [{id, key, title, category, categoryLabel, points, file, date, exists, changed, selected}] + samlet tekst. */
export function areasPreview46(u, areas) {
  const have = new Map(q('SELECT area_key, points FROM ai_memory46_areas WHERE user_id=?').all(u).map((r) => [r.area_key, r.points]));
  const hashes = new Map();
  for (const r of q('SELECT area_key, hash FROM ai_memory46_items WHERE user_id=?').all(u)) { if (!hashes.has(r.area_key)) hashes.set(r.area_key, new Set()); hashes.get(r.area_key).add(r.hash); }
  const items = areas.map((a, i) => {
    const old = hashes.get(a.key);
    const fresh = old ? a.points.filter((p) => !old.has(p.hash)).length : a.points.length;
    const gone = old ? [...old].filter((h) => !a.points.some((p) => p.hash === h)).length : 0;
    return { id: `a${i + 1}`, key: a.key, title: a.title, category: a.category, categoryLabel: a.categoryLabel, points: a.points.length, file: a.file, date: a.date,
      exists: have.has(a.key), changed: !have.has(a.key) || fresh > 0 || gone > 0, newPoints: fresh, removedPoints: gone, selected: a.points.length > 0,
      sample: a.points.slice(0, 3).map((p) => p.text.slice(0, 160)) };
  });
  const dates = areas.map((a) => a.date).filter(Boolean).sort();
  const date = dates[dates.length - 1] ?? null;
  return { items, count: items.length, points: areas.reduce((s, a) => s + a.points.length, 0), date, dateText: dateText46(date),
    label: `Claude-minner · ${items.length} ${items.length === 1 ? 'område' : 'områder'}${date ? ` · ${dateText46(date)}` : ''}` };
}

/**
 * Lagrer områdene (bare de valgte). Samme område på nytt: nye punkter inn, borte punkter ut, like beholdes.
 * → {areas, added:[{id, text}], removed, kept, updatedAreas, newAreas}
 */
export function importAreas46(u, areas) {
  const now = Date.now();
  const added = [];
  let removed = 0, kept = 0, newAreas = 0, updatedAreas = 0;
  let total = q("SELECT count(*) FROM ai_memory43 WHERE user_id=? AND src=?").pluck().get(u, MEMORY_SRC46);
  const insMem = q('INSERT INTO ai_memory43(user_id, text, src, created, updated) VALUES(?,?,?,?,?) RETURNING id');
  const insItem = q('INSERT OR REPLACE INTO ai_memory46_items(memory_id, user_id, area_key, hash, created) VALUES(?,?,?,?,?)');
  const upArea = q(`INSERT INTO ai_memory46_areas(user_id, area_key, title, category, file, source, src_date, points, created, updated) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, area_key) DO UPDATE SET title=excluded.title, category=excluded.category, file=excluded.file, src_date=excluded.src_date, points=excluded.points, updated=excluded.updated`);
  db.transaction(() => {
    for (const a of areas) {
      const old = q('SELECT memory_id, hash FROM ai_memory46_items WHERE user_id=? AND area_key=?').all(u, a.key);
      const want = new Set(a.points.map((p) => p.hash)), keep = new Set();
      if (old.length) updatedAreas++; else newAreas++;
      for (const r of old) {
        if (want.has(r.hash) && !keep.has(r.hash) && q('SELECT 1 FROM ai_memory43 WHERE id=? AND user_id=?').get(r.memory_id, u)) { keep.add(r.hash); kept++; continue; }
        q('DELETE FROM ai_memory43 WHERE id=? AND user_id=?').run(r.memory_id, u);
        q('DELETE FROM ai_memory46_items WHERE memory_id=?').run(r.memory_id);
        try { q('DELETE FROM ai_memory45_vec WHERE memory_id=? AND user_id=?').run(r.memory_id, u); } catch { /* tabellen finnes ikke */ }
        if (!want.has(r.hash)) removed++;
      }
      for (const p of a.points) {
        if (keep.has(p.hash)) continue;
        if (total >= LIMITS46.totalPoints) break;
        const text = `${a.title}: ${p.text}`.slice(0, LIMITS46.pointChars);
        const id = insMem.get(u, text, MEMORY_SRC46, now, now).id;
        insItem.run(id, u, a.key, p.hash, now);
        added.push({ id, text, area: a.key });
        keep.add(p.hash);
        total++;
      }
      upArea.run(u, a.key, a.title, a.category, a.file, MEMORY_SRC46, a.date, a.points.length, now, now);
    }
  })();
  return { areas: areas.length, added, removed, kept, newAreas, updatedAreas };
}
/** Angre: fjerner punktene som ble lagt til (områdene som ble helt nye fjernes også). */
export function undoAreas46(u, memoryIds = [], areaKeys = []) {
  let n = 0;
  for (const id of memoryIds) {
    n += q('DELETE FROM ai_memory43 WHERE id=? AND user_id=?').run(id, u).changes;
    q('DELETE FROM ai_memory46_items WHERE memory_id=? AND user_id=?').run(id, u);
  }
  for (const k of areaKeys) if (!q('SELECT 1 FROM ai_memory46_items WHERE user_id=? AND area_key=? LIMIT 1').get(u, k)) q('DELETE FROM ai_memory46_areas WHERE user_id=? AND area_key=?').run(u, k);
  return n;
}
/** GET /api/ai/memory/areas → [{key, title, category, points, date, updated}] (AI-kontroll → Minne, filtrert på kilde). */
export const areasOf46 = (u) => q('SELECT * FROM ai_memory46_areas WHERE user_id=? ORDER BY category, title').all(u).map((r) => ({ key: r.area_key, title: r.title, category: r.category, file: r.file, source: r.source, date: r.src_date, points: r.points, updated: new Date(r.updated).toISOString() }));
/** Embeddings for nye punkter (bakgrunn, best effort). */
export async function embedAreas46(u, added) {
  if (!added.length) return 0;
  try {
    const { embed } = await import('./ai-run.js');
    const r = await embed(added.map((m) => m.text), { user: u, title: 'Glimt-minne · Claude-minner', background: true });
    const ins = q('INSERT OR REPLACE INTO ai_memory45_vec(memory_id, user_id, model, vec, src, created) VALUES(?,?,?,?,?,?)');
    db.transaction(() => { added.forEach((m, i) => { if (Array.isArray(r.vectors?.[i])) ins.run(m.id, u, r.model, JSON.stringify(r.vectors[i]), MEMORY_SRC46, Date.now()); }); })();
    return r.vectors?.length ?? 0;
  } catch (e) { console.warn(`[claude-memory] embeddings: ${e.message}`); return 0; }
}
