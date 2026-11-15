// Prompt 82 (CHKWEB): rene hjelpere for «Sjekk ut / Sjekk inn» og Produkter i Skjold Lab (testes i Node, test/p82-web.test.js).
// Ingen import og ingen DOM.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc82 = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const MAX_NAME82 = 80;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** «2 stk», «1,5 m». */
export const qtyFmt82 = (n, unit = 'stk') => `${String(r3(+n || 0)).replace('.', ',')} ${unit || 'stk'}`;
/** «245,50 kr» (null → ''). */
export const money82 = (n) => (n == null || !Number.isFinite(+n) ? '' : `${(+n).toLocaleString('nb-NO', { minimumFractionDigits: +n % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr`);

/** Antall i arket: 1 … lager (desimaler for m/g osv. når lageret er under 1). */
export function clampQty82(v, max) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : +v;
  const hi = Number.isFinite(+max) ? Math.max(0, +max) : Infinity;
  const lo = Math.min(1, hi);
  if (!Number.isFinite(n)) return lo;
  return r3(Math.min(hi, Math.max(lo, n)));
}

/** Valget i produktlista: '' = ingen, 'new' = nytt (navnefelt), ellers id. → {} | {projectId} | {projectName} | {error} */
export function target82(choice, newName = '') {
  const c = String(choice ?? '');
  if (!c) return {};
  if (c === 'new') {
    const n = String(newName ?? '').replace(/\s+/g, ' ').trim();
    if (!n) return { error: 'Skriv navnet på det nye produktet' };
    if (n.length > MAX_NAME82) return { error: `Navnet kan være maks ${MAX_NAME82} tegn` };
    return { projectName: n };
  }
  return /^\d+$/.test(c) ? { projectId: Number(c) } : { error: 'Velg et produkt' };
}

/** Body til POST /checkout. → {body} | {error} */
export function checkoutBody82({ partId, qty, max, choice, newName, note }) {
  const t = target82(choice, newName);
  if (t.error) return { error: t.error };
  if (!t.projectId && !t.projectName) return { error: 'Velg et produkt' };
  const q = clampQty82(qty, max);
  if (!(q > 0)) return { error: 'Ingen igjen på lager' };
  const n = String(note ?? '').trim().slice(0, 500);
  return { body: { ...t, items: [{ partId: /^\d+$/.test(String(partId)) ? Number(partId) : partId, qty: q }], ...(n ? { note: n } : {}) } };
}

/** Lista fra serveren: aktive først (serveren sorterer også), ukjente felt tåles. */
export function normProjects82(list) {
  const L = (Array.isArray(list) ? list : list?.items ?? []).filter((p) => p && p.id != null).map((p) => ({
    id: String(p.id), name: String(p.name ?? ''), status: p.status === 'ferdig' ? 'ferdig' : 'aktiv', notes: p.notes ?? null,
    parts: +p.parts || 0, units: +p.units || 0, cost: p.cost == null ? null : +p.cost, updated: p.updated ?? null,
  }));
  return L.sort((a, b) => (a.status === b.status ? 0 : a.status === 'aktiv' ? -1 : 1));
}
export const activeProjects82 = (list) => normProjects82(list).filter((p) => p.status === 'aktiv');

/** «3 deler · 12 stk · 245 kr». */
export function summary82(p) {
  const parts = +p?.parts || 0;
  return [parts === 1 ? '1 del' : `${parts} deler`, `${String(r3(+p?.units || 0)).replace('.', ',')} stk`, money82(p?.cost)].filter(Boolean).join(' · ');
}

/** Linjene i et produkt: aktive (netto > 0) og ferdig innsjekkede. */
export function lines82(project) {
  const items = (Array.isArray(project?.items) ? project.items : []).map((x) => ({ ...x, net: x.net != null ? +x.net : r3((+x.qty || 0) - (+x.returnedQty || 0)) }));
  return { live: items.filter((x) => x.net > 1e-9), done: items.filter((x) => !(x.net > 1e-9)) };
}
export const hasActive82 = (project) => lines82(project).live.length > 0;

/** «Brukt i»: [{projectId, name, qty, status}] → tekstlinjer. */
export const usedIn82 = (p) => (Array.isArray(p?.usedIn) ? p.usedIn : []).filter((x) => x && +x.qty > 0);

/** Historikk-linja på delen: serverens tekst («Sjekket ut 3 stk til «Værstasjon»») eller handling + fra → til. */
export function historyText82(h) {
  if (h?.to && typeof h.to === 'object' && typeof h.to.text === 'string') return h.to.text;
  const v = (x) => (x == null ? '' : typeof x === 'object' ? (x.qty != null ? `${x.qty}` : x.text ?? '') : String(x));
  const ft = [v(h?.from), v(h?.to)].filter(Boolean).join(' → ');
  return `${h?.action ?? ''}${ft ? ` ${ft}` : ''}`.trim();
}

/** CSV (semikolon, norsk desimalkomma) for stykklista. */
export function csv82(project) {
  const cell = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = (n) => (n == null || n === '' ? '' : String(r3(+n)).replace('.', ','));
  const rows = [['Del', 'Antall', 'Enhet', 'Sjekket inn', 'I bruk', 'Pris', 'Sum', 'Plassering', 'Dato', 'Notat']];
  for (const x of Array.isArray(project?.items) ? project.items : []) {
    const net = x.net != null ? +x.net : (+x.qty || 0) - (+x.returnedQty || 0);
    rows.push([x.name, num(x.qty), x.unit || 'stk', num(x.returnedQty || 0), num(net), num(x.price), x.price != null ? num(Math.round(net * x.price * 100) / 100) : '', x.loc ?? '', String(x.at ?? '').slice(0, 10), x.note ?? '']);
  }
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
/** Filnavn: «produkt-vaerstasjon.csv». */
export const csvName82 = (name) => `produkt-${String(name ?? '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'uten-navn'}.csv`;

/** Feilsvar 409 (for lite på lager) → kort melding. */
export function shortText82(err) {
  const s = Array.isArray(err?.short) ? err.short : [];
  if (!s.length) return err?.error ?? err?.message ?? 'Fikk ikke sjekket ut';
  return s.length === 1 ? `Ikke nok «${s[0].name}» på lager (${qtyFmt82(s[0].have, s[0].unit)})` : `Ikke nok på lager for ${s.length} deler`;
}
