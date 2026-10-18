// Posisjonskortet på Hjem (prompt 20, claude-code-posisjon-kort.md): «POSISJON · FAMILIE» / «kart ›», to kolonner,
// avatar i personens egen farge med to bokstaver og statusprikk, og sone, strøk eller «Sist sett» på linje 2.
// Data fra /api/family/positions. Eldre server uten endepunktet: bygges fra /api/family.
import { api, esc, hm } from './util.js';
import { store, widget, refresh, on, emit } from './store.js';

const PALETTE = ['#b23a2a', '#2f5d8a', '#2f7a4f', '#c98a1b', '#6b4fa0', '#a03c8a', '#1f7a7a', '#8a5a2b'];
const STALE_MS = 15 * 60_000, MAX = 4;
const ACT = { walking: 'Går', running: 'Løper', cycling: 'Sykler', driving: 'I bil', still: null, går: 'Går', sykler: 'Sykler', 'i bil': 'I bil', stille: null };

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const stableColor = (id) => PALETTE[hash(id) % PALETTE.length];
export const twoLetters = (n) => { const l = String(n ?? '').match(/\p{L}|\p{N}/gu) ?? ['•']; return (l[0].toUpperCase() + (l[1] ?? '').toLowerCase()); };
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

/** Linje 2: sone → bevegelse · sted → sted → «Sist sett» → «Deler ikke posisjon». Aldri «Ukjent sted». */
export function line2(p) {
  if (p.linje2 && !/ukjent sted/i.test(p.linje2)) return p.linje2;
  if (p.status === 'off' || !p.oppdatert) return p.oppdatert && p.status !== 'off' ? `Sist sett ${hm(new Date(p.oppdatert))}` : 'Deler ikke posisjon';
  const act = ACT[p.aktivitet] ?? (p.aktivitet ? cap(p.aktivitet) : null);
  if (p.status === 'stale') return p.sone ?? `Sist sett ${hm(new Date(p.oppdatert))}`;
  if (p.sone) return p.sone;
  if (act) return p.sted ? `${act} · ${p.sted}` : act;
  return p.sted ?? `Oppdatert ${hm(new Date(p.oppdatert))}`;
}

// Eldre server: /api/family → samme form som /api/family/positions.
function fromFamily(d) {
  const seen = new Set(), used = new Set(), out = [];
  // Stabil farge per person, men to personer på kortet skal ikke få samme farge.
  const colorFor = (id) => { let i = hash(id) % PALETTE.length; for (let n = 0; n < PALETTE.length && used.has(PALETTE[i]); n++) i = (i + 1) % PALETTE.length; used.add(PALETTE[i]); return PALETTE[i]; };
  const members = [...(d?.members ?? [])].sort((a, b) => (b.self === true) - (a.self === true));
  for (const m of members) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    const ts = m.last?.ts ?? null, sharing = m.self ? 'on' : m.sharing;
    const status = !m.last || sharing !== 'on' ? 'off' : Date.now() - ts > STALE_MS ? 'stale' : 'fresh';
    out.push({ id: m.userId, navn: m.self ? 'Du' : m.name, farge: m.color ?? colorFor(m.userId), bilde: m.avatarUrl ?? null, sone: m.last?.place ?? null, aktivitet: m.last?.activity ?? null, sted: null, oppdatert: ts, status, self: !!m.self });
  }
  return out;
}

let loading = false, timer = null;
export async function loadPositions() {
  if (loading) return;
  loading = true;
  try {
    let list = await api('/family/positions').catch(() => null);
    if (!Array.isArray(list)) list = Array.isArray(list?.items) ? list.items : fromFamily(await api('/family'));
    // «Du» først og bare én gang, selv om serveren skulle gi duplikater.
    const seen = new Set();
    store.data.positions = list.filter((p) => !seen.has(p.id) && seen.add(p.id)).sort((a, b) => !!b.self - !!a.self);
    delete store.errors.positions;
  } catch (e) { store.errors.positions = e.message; }
  loading = false;
  emit('positions');
}
function ensure() {
  if (!store.data.positions && !store.errors.positions) loadPositions();
  timer ??= setInterval(() => { if (!document.hidden && document.querySelector('[data-w="d_pos"],[data-w="p_pos"]')) loadPositions(); }, 60_000);
}

const dotTitle = { fresh: 'Posisjon delt nå', stale: 'Eldre enn 15 minutter', off: 'Deler ikke posisjon' };
function person(p) {
  const st = ['fresh', 'stale', 'off'].includes(p.status) ? p.status : 'off';
  const ini = p.initialer || (p.self ? 'Du' : twoLetters(p.navn));
  const av = p.bilde ? `<img src="${esc(p.bilde)}" alt="">` : esc(ini);
  return `<div class="pos-p"><span class="pos-av" style="background:${esc(p.farge || stableColor(p.id))}">${av}<i class="pos-dot ${st}" title="${dotTitle[st]}"></i></span>
    <span class="pos-t"><b>${esc(p.self ? 'Du' : p.navn)}</b><span>${esc(line2(p))}</span></span></div>`;
}

function body() {
  ensure();
  const list = store.data.positions;
  const head = '<div class="pos-head"><span class="pos-lab">POSISJON · FAMILIE</span><span class="pos-more">kart ›</span></div>';
  if (!list) return head + (store.errors.positions ? `<div class="pos-empty">Familie: ${esc(store.errors.positions)}</div>` : '<div class="skeleton" style="min-height:84px"></div>');
  if (!list.length) return head + '<div class="pos-empty">Ingen i familien ennå.</div>';
  const shown = list.length > MAX ? list.slice(0, MAX - 1) : list;
  const extra = list.length - shown.length;
  return head + `<div class="pos-grid">${shown.map(person).join('')}${extra ? `<div class="pos-p pos-plus"><span class="pos-av">+${extra}</span><span class="pos-t"><b>Flere</b><span>Åpne Familie</span></span></div>` : ''}</div>`;
}

// Hele kortet er en lenke til Familie (kartfanen er standard der).
const wrap = () => `<a class="pos-card" href="#/familie" aria-label="Posisjon · familie – åpne kartet">${body()}</a>`;
widget('d_pos', { cls: 'card pos-host', render: wrap });
widget('p_pos', { cls: 'p-sec pos-host', render: wrap });
on('positions', () => refresh('d_pos', 'p_pos'));
