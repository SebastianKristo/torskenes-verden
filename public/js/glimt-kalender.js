// Prompt 52 (claude-code-glimt-kalender-kontekst.md): kalenderbeskjeder i Glimt-søket forstås med AI-tilkoblingen.
// Regelparseren (quick-time.js) svarer med en gang; etter 450 ms pause med minst 3 ord spørres serveren
// (POST /api/glimt/quickparse52, SRV52: regel + lokal tolkemodell via ai-gate med kontekst, 5 s tidsavbrudd → regel).
// Svaret caches per tekst og overstyrer regelparseren: kalender → «Møte med Laila · i dag · Olivia», huske → Huskeliste,
// spørsmål/annet → vanlig svar. Mens AI tenker står «✦ tolker …» på forslaget. Enter før svaret venter opptil 2,5 s.
const C = new Map(); // tekst → {state:'pending'|'done'|'fail', r, p}
let timer = 0;
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const key = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function fetchParse(text) {
  const k = key(text);
  if (C.has(k)) return C.get(k).p;
  const ent = { state: 'pending', r: null, p: null };
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 6000);
  ent.p = fetch('/api/glimt/quickparse52', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.trim(), now: new Date().toISOString(), ai: true }), signal: ctl.signal })
    .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); ent.r = await r.json(); ent.state = 'done'; })
    .catch(() => { ent.state = 'fail'; })
    .finally(() => clearTimeout(to));
  C.set(k, ent);
  if (C.size > 60) C.delete(C.keys().next().value);
  return ent.p;
}

/**
 * Gjeldende tolkning for teksten. → null (ikke aktuelt / feilet), {pending:true}, eller {type, title, date, start, end, location, …}.
 * Starter et kall etter 450 ms pause; redraw kalles når svaret kommer.
 */
export function aiParse52(text, redraw) {
  const t = String(text ?? '').trim();
  if (words(t) < 3 || t.length > 300 || /^https?:\/\//i.test(t)) return null;
  const ent = C.get(key(t));
  if (ent) return ent.state === 'pending' ? { pending: true } : ent.state === 'done' ? norm(ent.r) : null;
  clearTimeout(timer);
  timer = setTimeout(() => { fetchParse(t).then(() => redraw?.()); redraw?.(); }, 450);
  return { pending: true, waiting: true };
}
function norm(r) {
  const x = r?.result ?? r?.ai ?? r?.rule;
  if (!x || !x.type) return null;
  return { ...x, source: r.source, fixes: r.rule?.fixes ?? [] };
}
/** Venter på svaret (Enter før AI er ferdig), maks ms. → tolkning eller null. */
export async function waitParse52(text, ms = 2500) {
  const t = String(text ?? '').trim();
  if (words(t) < 3) return null;
  const p = fetchParse(t);
  await Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  const ent = C.get(key(t));
  return ent?.state === 'done' ? norm(ent.r) : null;
}
/** Teksten som sendes til hurtig-timen (serveren tolker den med regelparseren): tittel, sted, dato og klokkeslett. */
export function apptText52(x) {
  const [y, m, d] = String(x.date ?? '').split('-');
  const date = y && m && d ? `${+d}.${+m}.${y}` : '';
  const tm = x.start ? ` kl ${x.start}${x.end ? `-${x.end}` : ''}` : '';
  return `${x.title}${x.location ? ` på ${x.location}` : ''}${date ? ` ${date}` : ''}${tm}`.trim();
}
/** «i dag · 11:30–12:30 · Olivia» */
export function apptLabel52(x, fallback = '') {
  const parts = [x.date_label || fallback, x.time_label || (x.start ? `${x.start}${x.end ? `–${x.end}` : ''}` : ''), x.location].filter(Boolean);
  return parts.join(' · ');
}
