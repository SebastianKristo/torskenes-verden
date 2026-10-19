// Prompt 37 (SERVER37): «Hvor er Ingrid?» i Glimt (Homelab-søket, Chat, Brief) – claude-code-sok-hvor-er.md.
// whereIntent(text) → {kind:'where'|'is'|'self', name, zone?} | null
// whereAnswer(viewer, text) → {intent:'family.where', text, person, place, open:{route:'familie', person}, source:'Familie · posisjon', card:{k:'where', …}}
//   Personvern som Familie: bare personer som deler posisjon med deg (familyPeople37). Ellers «Pål deler ikke posisjon med deg.»
import { familyPeople37, placeFor, dist } from './family.js';
import { listUsers } from './auth.js';

const NAME = "([\\p{L}][\\p{L}'-]{1,30})";
const PATTERNS = [
  [new RegExp(`^(?:hvor|kor|where)\\s+(?:er|e|is)\\s+${NAME}\\s*(?:nå|now)?\\s*\\??$`, 'iu'), 'where'],
  [new RegExp(`^(?:hvor|kor)\\s+(?:befinner|holder)\\s+${NAME}\\s+seg(?:\\s+nå)?\\s*\\??$`, 'iu'), 'where'],
  [new RegExp(`^(?:hva er\\s+)?posisjonen\\s+til\\s+${NAME}\\s*\\??$`, 'iu'), 'where'],
  [new RegExp(`^${NAME}s\\s+posisjon\\s*\\??$`, 'iu'), 'where'],
  [new RegExp(`^er\\s+${NAME}\\s+(hjemme|på skolen|på skole|på jobb|på jobben|på hytta|hos mormor|på trening)\\s*\\??$`, 'iu'), 'is'],
];
const SELF = /^(?:hvor|kor|where)\s+(?:er|e|am)\s+(?:jeg|i)\s*(?:nå|now)?\s*\??$/i;
const STOP = new Set(['du', 'det', 'den', 'dette', 'pakken', 'pakkene', 'bussen', 'trikken', 'toget', 'neste', 'nærmeste', 'jeg', 'vi', 'dere', 'de', 'han', 'hun', 'mine', 'min', 'mitt']);

export function whereIntent(text) {
  const t = String(text ?? '').trim().replace(/[.!]+$/, '');
  if (SELF.test(t)) return { kind: 'self', name: null };
  for (const [re, kind] of PATTERNS) {
    const m = t.match(re);
    if (m && !STOP.has(m[1].toLowerCase())) return { kind, name: m[1], zone: m[2] ?? null };
  }
  return null;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
const AKT = { walking: 'på vei til fots', running: 'ute og løper', cycling: 'på sykkel', driving: 'i bil' };
const ZONE_WORD = { hjemme: /^hjem/, 'på skolen': /^skole/, 'på skole': /^skole/, 'på jobb': /^jobb|kontor/, 'på jobben': /^jobb|kontor/, 'på hytta': /^hytt/, 'hos mormor': /^mormor/, 'på trening': /trening|gym|sats/ };
const kmText = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const ago = (ms) => { const min = Math.max(0, Math.round(ms / 60_000)); return min < 1 ? 'akkurat nå' : min < 60 ? `${min} min siden` : `${Math.round(min / 60)} t siden`; };
const joinNo = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} og ${a[a.length - 1]}`);
const zoneText = (z) => (/^hjem/i.test(z) ? 'hjemme' : `på ${z}`);

/** Svar på «hvor er X». null hvis teksten ikke er et slikt spørsmål. */
export async function whereAnswer(viewer, text, { now = Date.now() } = {}) {
  const it = whereIntent(text);
  if (!it) return null;
  const people = familyPeople37(viewer);
  const me = people.find((p) => p.self);
  const base = { intent: 'family.where', source: 'Familie · posisjon', tool: 'Familie' };
  let p = it.kind === 'self' ? me : people.find((x) => !x.self && (norm(x.name).split(' ')[0] === norm(it.name) || norm(x.name) === norm(it.name) || norm(x.username) === norm(it.name)));
  if (!p && it.kind !== 'self' && me && (norm(me.name).split(' ')[0] === norm(it.name) || norm(me.username) === norm(it.name))) p = me;
  if (!p) {
    // Profiler uten bruker (Pål, Mormor) finnes i husstanden, men har ingen posisjon.
    let profiles = [];
    try { const { profilesFor } = await import('./profiles37.js'); profiles = profilesFor(viewer).profiles; } catch { /* */ }
    const pr = profiles.find((x) => norm(x.name) === norm(it.name));
    if (pr) return { ...base, text: `**${pr.name}** deler ikke posisjon med deg.`, person: { profileId: pr.id, name: pr.name, color: pr.color }, place: null, open: { route: 'familie', person: null } };
    const sharing = people.filter((x) => !x.self && x.visible && x.last).map((x) => x.name.split(' ')[0]);
    return { ...base, notFound: true, text: `Jeg finner ikke ${it.name} i Familie.${sharing.length ? ` Personer med deling: ${joinNo(sharing)}.` : ' Ingen deler posisjon med deg ennå.'}`, person: null, place: null, open: { route: 'familie', person: null } };
  }
  const first = p.self ? 'Du' : p.name.split(' ')[0];
  const person = { userId: p.userId, name: p.name, color: p.color, photoUrl: p.photoUrl, self: p.self };
  const open = { route: 'familie', person: p.userId };
  if (!p.visible || !p.last) return { ...base, text: p.self ? 'Telefonen din har ikke sendt noen posisjon ennå.' : `**${first}** deler ikke posisjon med deg.`, person, place: null, open };
  const L = p.last, age = now - L.ts;
  const sted = await placeFor(L.lat, L.lon, { waitMs: L.place ? 300 : 2500 }).catch(() => null);
  const d = !p.self && me?.last ? dist(me.last, L) : null;
  const akt = age < 15 * 60_000 ? AKT[L.activity] ?? null : null;
  const where = L.place ? zoneText(L.place) : sted ? `ved ${sted}` : 'et ukjent sted';
  const verb = p.self ? 'er' : 'er';
  const details = [sted && sted !== L.place ? `${sted}, Oslo` : null, d != null ? `${kmText(d)} fra deg` : null].filter(Boolean);
  const meta = `Oppdatert ${ago(age)}${L.battery != null ? ` · batteri ${L.battery} %` : ''}.`;
  let t;
  if (it.kind === 'is' && it.zone) {
    const re = ZONE_WORD[it.zone.toLowerCase()];
    const yes = !!L.place && !!re && re.test(L.place.toLowerCase());
    t = yes ? `Ja, **${first}** er **${zoneText(L.place)}**. ${meta}` : `Nei, **${first}** er **${where}**${details.length ? ` (${details.join(', ')})` : ''}. ${meta}`;
  } else if (age > 3_600_000) {
    t = `**${first}** ble sist sett for ${ago(age).replace(' siden', '')} siden **${where}**${details.length ? ` (${details.join(', ')})` : ''}.${L.battery != null ? ` Batteri ${L.battery} %.` : ''}`;
  } else {
    t = `**${first}** ${verb} **${akt ? `${akt} ` : ''}${where}**${details.length ? ` (${details.join(', ')})` : ''}. ${meta}`;
  }
  const place = { zone: L.place ?? null, name: sted ?? null, label: L.place ?? sted ?? null, lat: L.lat, lon: L.lon, approx: !!L.approx, distanceM: d != null ? Math.round(d) : null, battery: L.battery ?? null,
    activity: L.activity ?? null, updatedAt: new Date(L.ts).toISOString(), ageMin: Math.round(age / 60_000) };
  return { ...base, text: t, person, place, open,
    card: { k: 'where', name: first, color: p.color, photoUrl: p.photoUrl, line: t.replace(/\*\*/g, ''), place, action: { label: 'Vis på kart', open } } };
}
export const _people = () => listUsers();
