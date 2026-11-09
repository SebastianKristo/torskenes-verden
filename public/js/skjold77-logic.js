// Prompt 77 (SKJAIWEB): rene hjelpere for Glimt i Skjold Lab (ingen DOM, testes i test/p77-web.test.js).
// Brukes av skjold77-ai.js: slå sammen specs/tags fra forslaget, sikkerhet, dekodet tekst (fargebånd/SMD/kondensator),
// radene i forslagskortet og avkrysning i Rydd opp.
/** Specs-objekt fra skjemaets rader ([[k, v], …]), uten tomme. */
export const specsObj77 = (rows) => Object.fromEntries((rows ?? []).map(([k, v]) => [String(k ?? '').trim(), String(v ?? '').trim()]).filter(([k, v]) => k && v));
/** Slår forslagets specs inn i skjemaets rader: samme nøkkel (uten store/små) får ny verdi, nye nøkler legges til, tomme rader fjernes. */
export function mergeSpecs77(rows, specs) {
  const out = (rows ?? []).filter(([k, v]) => String(k ?? '').trim() || String(v ?? '').trim()).map(([k, v]) => [k, v]);
  for (const [k, v] of Object.entries(specs ?? {})) {
    if (v == null || v === '') continue;
    const i = out.findIndex(([a]) => String(a).trim().toLowerCase() === String(k).trim().toLowerCase());
    if (i >= 0) out[i] = [out[i][0], String(v)]; else out.push([k, String(v)]);
  }
  return out.length ? out : [['verdi', '']];
}
/** Tags-teksten («a, b») med forslagets tags lagt til (uten dubletter, uten store/små). */
export function mergeTags77(str, tags) {
  const cur = String(str ?? '').split(',').map((x) => x.trim()).filter(Boolean), seen = new Set(cur.map((x) => x.toLowerCase()));
  for (const t of tags ?? []) { const x = String(t ?? '').trim(); if (x && !seen.has(x.toLowerCase())) { cur.push(x); seen.add(x.toLowerCase()); } }
  return cur.join(', ');
}
/** Sikkerhet 0–1 → «82 %» og et ord. */
export function conf77(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return { pct: null, word: '', lvl: 'mid' };
  const p = Math.round(Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) * 100);
  return { pct: p, word: p >= 80 ? 'ganske sikker' : p >= 50 ? 'litt usikker' : 'usikker', lvl: p >= 80 ? 'hi' : p >= 50 ? 'mid' : 'lo' };
}
const BAND = { black: 'svart', brown: 'brun', red: 'rød', orange: 'oransje', yellow: 'gul', green: 'grønn', blue: 'blå', violet: 'fiolett', purple: 'fiolett', grey: 'grå', gray: 'grå', white: 'hvit', gold: 'gull', silver: 'sølv' };
const bandNo = (b) => BAND[String(b ?? '').toLowerCase()] ?? String(b ?? '');
/** Linjer som forklarer hva koden regnet ut (fargebånd, SMD-kode, kondensatorkode). */
export function decodedLines77(d) {
  if (!d || typeof d !== 'object') return [];
  const out = [];
  const val = (x, extra = []) => (typeof x === 'string' ? x : x?.text ?? x?.label ?? [x?.value, ...extra.map((k) => x?.[k])].filter(Boolean).join(' '));
  const r = d.resistor;
  if (r) {
    const bands = Array.isArray(r.bands) ? r.bands.map(bandNo).join('–') : '';
    const v = val(r, ['tolerance', 'tempco']);
    out.push(`Fargebånd${bands ? ` ${bands}` : ''}${v ? ` = ${v}` : ''}`);
  }
  if (d.smd) { const v = val(d.smd); out.push(`SMD-kode${d.smd.code ? ` ${d.smd.code}` : ''}${v ? ` = ${v}` : ''}`); }
  if (d.cap) { const v = val(d.cap, ['tolerance', 'voltage']); out.push(`Kondensatorkode${d.cap.code ? ` ${d.cap.code}` : ''}${v ? ` = ${v}` : ''}`); }
  return out;
}
/** Radene i forslagskortet: [{k, label, cur, val, same}]. F = skjemaet ({name, category, specs, tags}). */
export function suggRows77(F, s) {
  if (!s) return [];
  const rows = [];
  const nm = String(s.name ?? '').trim();
  if (nm) rows.push({ k: 'name', label: 'Navn', cur: F.name, val: nm, same: nm === String(F.name ?? '').trim() });
  const cat = String(s.category ?? '').trim();
  if (cat) rows.push({ k: 'category', label: 'Kategori', cur: F.category, val: cat, isNew: !!s.categoryNew, same: cat.toLowerCase() === String(F.category ?? '').trim().toLowerCase() });
  const sp = Object.entries(s.specs && typeof s.specs === 'object' ? s.specs : {}).filter(([, v]) => v != null && v !== '');
  if (sp.length) {
    const cur = specsObj77(F.specs), lc = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k.toLowerCase(), v]));
    rows.push({ k: 'specs', label: 'Specs', val: sp, same: sp.every(([k, v]) => lc[String(k).toLowerCase()] === String(v)) });
  }
  const tg = (Array.isArray(s.tags) ? s.tags : []).map(String).filter(Boolean);
  if (tg.length) rows.push({ k: 'tags', label: 'Tags', val: tg, same: mergeTags77(F.tags, tg) === mergeTags77(F.tags, []) });
  return rows;
}
/** Er noe endret i et Rydd opp-forslag? */
export function tidyChanged77(it) {
  if (!it?.after || ['pending', 'error', 'unchanged'].includes(it.status)) return false;
  if (typeof it.changed === 'boolean') return it.changed;
  const b = it.before ?? {}, a = it.after;
  if (a.name && a.name !== b.name) return true;
  if (a.category && a.category !== b.category) return true;
  const bs = b.specs ?? {}, as = a.specs ?? {};
  if (Object.entries(as).some(([k, v]) => v != null && v !== '' && String(bs[k] ?? '') !== String(v))) return true;
  const bt = new Set((b.tags ?? []).map((x) => String(x).toLowerCase()));
  return (a.tags ?? []).some((t) => !bt.has(String(t).toLowerCase()));
}
/** Avkrysset som standard: endret og minst 50 % sikker. */
export const tidyDefaultOn77 = (it) => tidyChanged77(it) && (!it.status || it.status === 'ready') && (conf77(it?.confidence).pct ?? 100) >= 50;
const DONE = new Set(['done', 'ferdig', 'finished', 'completed', 'complete', 'error', 'failed', 'feil', 'cancelled', 'canceled', 'avbrutt']);
/** Kjører jobben fortsatt? Alt som ikke er en kjent slutt-tilstand regnes som i gang. */
export const tidyRunning77 = (st) => !DONE.has(String(st ?? '').toLowerCase());

