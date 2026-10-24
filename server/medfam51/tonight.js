// Prompt 51 (MEDFAM51): «Hva skal vi se i kveld?» – forslag fra eget bibliotek (Radarr/Sonarr) og egen historikk (Plex/Jellyfin via
// plays44 i playback44.js), tilpasset hvem som er hjemme (Familie › Steder, stedet med type hjem) og ønsket sjanger/lengde.
// Rangeringen er regler i koden (forklaringen per forslag bygges herfra); den lokale modellen brukes BARE til å formulere teksten
// (ai-run med localOnly – aldri skyen), og forslagene virker likt uten modell.
import { db, kv } from '../db.js';
import { userInfo } from '../auth.js';
import { family50 as F } from '../family.js';
import * as M from '../media43.js';
import { run as aiRun } from '../ai-run.js';
import { HOUR, DAY, clean, minText } from './common.js';

const q = (sql) => db.prepare(sql);
const SEEN_PCT = 85;
export const GENRES51 = { Action: 'Action', Adventure: 'Eventyr', Animation: 'Animasjon', Comedy: 'Komedie', Crime: 'Krim', Documentary: 'Dokumentar', Drama: 'Drama', Family: 'Familie',
  Fantasy: 'Fantasy', History: 'Historie', Horror: 'Skrekk', Music: 'Musikk', Mystery: 'Mysterium', Romance: 'Romantikk', 'Science Fiction': 'Sci-fi', 'Sci-Fi': 'Sci-fi', Thriller: 'Thriller',
  War: 'Krig', Western: 'Western', Reality: 'Reality', 'Talk Show': 'Talkshow', Kids: 'Barn', Sport: 'Sport', Children: 'Barn' };
const gNo = (g) => GENRES51[g] ?? g;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9æøå]+/g, '');

/* ---------------- Hvem er hjemme ---------------- */

/** Navnet personen har i Plex/Jellyfin (kv medfam51_plex_user), ellers visningsnavn/brukernavn. */
export const plexNameOf51 = (id) => { const own = kv.get(id, 'medfam51_plex_user', null); const u = userInfo(id); return [own, u?.displayName, u?.name, u?.username, F.nameOf(id)].filter(Boolean).map((x) => String(x)); };
export function whoHome51(v, now = Date.now()) {
  const homes = F.zonesFor(v).filter((z) => z.place_type === 'hjem');
  const members = F.members(v);
  const home = [];
  for (const m of members) {
    const l = m.last;
    if (!l || now - l.ts > 2 * HOUR || (m.sharing !== 'on' && !m.self)) continue;
    if (homes.some((z) => (l.approx ? l.place === z.name : F.inPlace(l, z)))) home.push(m.userId);
  }
  return { ids: home, source: homes.length ? 'familie' : 'ingen-hjem', note: homes.length ? null : 'Legg inn et sted med type hjem i Familie › Steder for å se hvem som er hjemme' };
}

/* ---------------- Historikk ---------------- */

function history(names) {
  let rows = [];
  try { rows = q('SELECT user, title, subtitle, kind, percent, started FROM plays44 WHERE started>? ORDER BY started DESC LIMIT 5000').all(Date.now() - 730 * DAY); } catch { rows = []; }
  const want = new Map(); // brukernavn i Plex (lowercase) → family-id
  for (const [id, list] of names) for (const n of list) { want.set(n.toLowerCase(), id); want.set(n.toLowerCase().split(/\s+/)[0], id); }
  const out = new Map(); // norm(tittel) → {seen:Set(id), partial:Map(id→pct), last:Map(id→{code, at}), plays}
  for (const r of rows) {
    const id = want.get(String(r.user ?? '').toLowerCase()) ?? want.get(String(r.user ?? '').toLowerCase().split(/\s+/)[0]);
    const k = norm(r.title);
    if (!k) continue;
    const h = out.get(k) ?? { seen: new Set(), partial: new Map(), last: new Map(), plays: 0, lastAt: 0, anyone: new Set() };
    h.plays++; h.lastAt = Math.max(h.lastAt, r.started);
    h.anyone.add(String(r.user ?? ''));
    if (id) {
      if (r.percent >= SEEN_PCT) h.seen.add(id); else if (r.percent >= 5) h.partial.set(id, Math.max(h.partial.get(id) ?? 0, r.percent));
      const code = String(r.subtitle ?? '').match(/S(\d{1,2})E(\d{1,3})/i);
      if (code && !h.last.has(id)) h.last.set(id, { s: +code[1], e: +code[2], at: r.started, done: r.percent >= SEEN_PCT });
    }
    out.set(k, h);
  }
  return out;
}
export const _history51 = history;

/* ---------------- Forslag ---------------- */

const name = (v, id) => (id === v ? 'du' : F.nameOf(id));
const join = (a) => (a.length <= 1 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} og ${a.at(-1)}`);
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const ratingOf = (x) => { const r = x.ratings; const v = r?.imdb?.value ?? r?.tmdb?.value ?? r?.value ?? null; return Number.isFinite(+v) && +v > 0 ? +v : null; };

async function library() {
  const out = { movies: [], series: [], errors: [] };
  const [mv, sr] = await Promise.all([
    M.svcConf43('radarr').on ? M.movieList43().catch((e) => { out.errors.push(`Radarr: ${e.message}`); return []; }) : [],
    M.svcConf43('sonarr').on ? M.seriesList43().catch((e) => { out.errors.push(`Sonarr: ${e.message}`); return []; }) : [],
  ]);
  out.movies = (Array.isArray(mv) ? mv : []).filter((x) => x.hasFile);
  out.series = (Array.isArray(sr) ? sr : []).filter((x) => (x.statistics?.episodeFileCount ?? 0) > 0);
  out.configured = M.svcConf43('radarr').on || M.svcConf43('sonarr').on;
  return out;
}

/**
 * Forslag for kvelden. o = {minutes?, genre?, kind?: 'movie'|'series'|'any', who?: [ids], limit?, phrase?: bool}
 * → {who:{people, source, note}, items:[Forslag], genres:[{id,label}], filters, configured, phrased, model?}
 */
export async function tonight51(v, o = {}, now = Date.now()) {
  const auto = whoHome51(v, now);
  const everyone = F.everyone(v);
  let ids = Array.isArray(o.who) && o.who.length ? o.who.filter((id) => everyone.some((p) => p.id === id)) : auto.ids;
  const source = Array.isArray(o.who) && o.who.length ? 'valgt' : ids.length ? auto.source : 'meg';
  if (!ids.length) ids = [v];
  if (!ids.includes(v) && source !== 'valgt') ids = [v, ...ids];
  const names = new Map(ids.map((id) => [id, plexNameOf51(id)]));
  const hist = history(names);
  const lib = await library();
  const minutes = o.minutes ? Math.max(20, Math.min(400, Math.round(+o.minutes))) : null;
  const genre = clean(o.genre, 40);
  const kind = ['movie', 'series'].includes(o.kind) ? o.kind : 'any';
  const people = ids.map((id) => ({ userId: id, name: id === v ? 'Du' : F.nameOf(id), self: id === v }));
  const cands = [];
  const allGenres = new Map();
  const addG = (gs) => { for (const g of gs ?? []) allGenres.set(g, gNo(g)); };

  if (kind !== 'series') for (const x of lib.movies) {
    addG(x.genres);
    const h = hist.get(norm(x.title));
    const seen = ids.filter((id) => h?.seen.has(id)), partial = ids.filter((id) => h?.partial.has(id) && !h?.seen.has(id));
    const reasons = [];
    let score = 50;
    if (seen.length === ids.length) continue; // alle hjemme har sett den
    if (partial.length) { score += 25; reasons.push(`${cap(join(partial.map((id) => name(v, id))))} har begynt på den (${Math.max(...partial.map((id) => h.partial.get(id)))} %)`); }
    else if (!seen.length) { score += 15; reasons.push(ids.length > 1 ? 'Ingen av dere har sett den' : 'Du har ikke sett den'); }
    else { score -= 20; reasons.push(`${cap(join(seen.map((id) => name(v, id))))} har sett den før`); }
    const rt = +x.runtime || null;
    if (minutes && rt) { if (rt > minutes + 10) continue; score += 10; reasons.push(`${minText(rt)} – passer innen ${minText(minutes)}`); } else if (rt) reasons.push(minText(rt));
    const gs = (x.genres ?? []).map(gNo);
    if (genre) { if (!(x.genres ?? []).some((g) => norm(g) === norm(genre) || norm(gNo(g)) === norm(genre))) continue; score += 15; }
    if (gs.length) reasons.push(gs.slice(0, 2).join(', '));
    const r = ratingOf(x); if (r) { score += Math.round(r * 2); if (r >= 7.5) reasons.push(`godt likt (${String(r).replace('.', ',')})`); }
    const added = Date.parse(x.added ?? '') || 0;
    if (added && now - added < 30 * DAY) { score += 8; reasons.push('nylig lagt til'); }
    cands.push({ kind: 'movie', id: x.id, title: x.title, year: x.year ?? null, genres: gs, runtime: rt, runtimeText: rt ? minText(rt) : null, poster: M.posterOf43('radarr', x.images, x.id), score, reasons, seenBy: seen, startedBy: partial, open: `/#/media/radarr/m/${x.id}`, deepLink: `papir://media/radarr/${x.id}` });
  }
  if (kind !== 'movie') for (const x of lib.series) {
    addG(x.genres);
    const h = hist.get(norm(x.title));
    const watching = ids.filter((id) => h?.last.has(id));
    const reasons = [];
    let score = 45, next = null;
    const rt = +x.runtime || null;
    if (minutes && rt && rt > minutes + 5) continue;
    if (genre) { if (!(x.genres ?? []).some((g) => norm(g) === norm(genre) || norm(gNo(g)) === norm(genre))) continue; score += 15; }
    if (watching.length) {
      const l = watching.map((id) => ({ id, ...h.last.get(id) })).sort((a, b) => b.at - a.at)[0];
      next = l.done ? { season: l.s, episode: l.e + 1 } : { season: l.s, episode: l.e };
      const code = `S${String(next.season).padStart(2, '0')}E${String(next.episode).padStart(2, '0')}`;
      const recent = now - l.at < 21 * DAY;
      score += recent ? 30 : 12;
      reasons.push(`${cap(join(watching.map((id) => name(v, id))))} ${l.done ? 'så sist' : 'stoppet midt i'} S${String(l.s).padStart(2, '0')}E${String(l.e).padStart(2, '0')} – neste: ${code}`);
      if (watching.length < ids.length && ids.length > 1) { score -= 10; reasons.push(`${cap(join(ids.filter((id) => !watching.includes(id)).map((id) => name(v, id))))} har ikke sett den`); }
    } else { score += 10; reasons.push(ids.length > 1 ? 'Ny serie for dere' : 'Ny serie for deg'); }
    if (rt) reasons.push(`${minText(rt)} per episode`);
    const gs = (x.genres ?? []).map(gNo);
    if (gs.length) reasons.push(gs.slice(0, 2).join(', '));
    const r = ratingOf(x); if (r) score += Math.round(r * 2);
    cands.push({ kind: 'series', id: x.id, title: x.title, year: x.year ?? null, genres: gs, runtime: rt, runtimeText: rt ? `${minText(rt)} per episode` : null, poster: M.posterOf43('sonarr', x.images, x.id), score, reasons,
      next: next ? { ...next, code: `S${String(next.season).padStart(2, '0')}E${String(next.episode).padStart(2, '0')}` } : null, watching, open: `/#/media/sonarr/s/${x.id}`, deepLink: `papir://media/sonarr/${x.id}` });
  }
  cands.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'nb'));
  const limit = Math.max(1, Math.min(20, +o.limit || 8));
  const items = cands.slice(0, limit).map((x) => ({ ...x, reason: x.reasons.join(' · '), text: x.reasons.join(' · ') }));
  let phrased = false, model = null;
  if (o.phrase && items.length) {
    try {
      const prompt = `Skriv én kort, vennlig setning på norsk bokmål per forslag om hvorfor det passer i kveld. Bruk BARE fakta fra «grunner». Ikke finn på noe. Svar som JSON {"items":[{"i":0,"text":"…"}]}.\n\n${JSON.stringify(items.map((x, i) => ({ i, tittel: x.title, type: x.kind === 'movie' ? 'film' : 'serie', grunner: x.reasons })))}`;
      const r = await aiRun('sok', { user: v, prompt, json: true, localOnly: true, background: true, temperature: 0.4, numPredict: 400, title: 'Media · i kveld (formulering)', timeoutMs: 25_000 });
      const list = Array.isArray(r?.data?.items) ? r.data.items : [];
      for (const p of list) { const it = items[+p?.i]; const t = clean(p?.text, 240); if (it && t && t.length > 8) { it.text = t; phrased = true; } }
      if (phrased) model = r.model;
    } catch { /* uten modell: regeltekst */ }
  }
  return {
    who: { people, source, note: source === 'meg' ? auto.note ?? 'Fant ingen hjemme nå – forslag for deg' : source === 'familie' ? `${join(people.map((p) => p.name))} er hjemme` : null },
    items, count: items.length, genres: [...new Set(allGenres.values())].sort((a, b) => a.localeCompare(b, 'nb')).map((g) => ({ id: g, label: g })),
    filters: { minutes, genre: genre || null, kind }, configured: lib.configured, ...(lib.errors.length ? { errors: lib.errors } : {}), phrased, ...(model ? { model } : {}),
    empty: !items.length ? (lib.configured ? 'Fant ingenting som passer – prøv en annen sjanger eller lengde' : 'Koble til Radarr eller Sonarr under Innstillinger → Integrasjoner → Media') : null,
  };
}
