// POST /api/dates/parse {text, now?} → {date, time, allDay, rest, …}: den felles datotolkeren (dates/parse.js) for klientene, så web,
// iOS og Android viser samme dato som serveren lagrer (Q17). Klientene tar det i bruk i Fase 3–5.
//
//   text  Det brukeren skrev (maks 500 tegn).
//   now   Valgfritt referansetidspunkt (ISO 8601 med sone, eller ms). Standard er nå. «I dag» er Oslo-datoen for det.
//
// GET /api/dates/holidays?year= → helligdager og merkedager med type (Q18), så appene kan bufre dem.
//
// Svar: {date:'YYYY-MM-DD'|null, time:'HH:MM'|null, end:'HH:MM'|null, allDay, rest, label, today, dateText, timeText, errors:[{field, message}]}
import { whenOf, relDate } from './parse.js';
import { osloParts, isIsoDate } from './oslo.js';
import { holidaysBetween } from './holidays.js';

const MAX_TEXT = 500;

/** Ren funksjon bak endepunktet (også for tester). → {status, body} */
export function parseDatesRequest(body = {}) {
  const text = typeof body.text === 'string' ? body.text : null;
  if (text == null || !text.trim()) return { status: 400, body: { error: 'Mangler text', code: 'TEXT_REQUIRED' } };
  if (text.length > MAX_TEXT) return { status: 400, body: { error: `text kan ha maks ${MAX_TEXT} tegn`, code: 'TEXT_TOO_LONG' } };
  let at = Date.now();
  if (body.now != null) {
    at = typeof body.now === 'number' ? body.now : Date.parse(String(body.now));
    if (!Number.isFinite(at)) return { status: 400, body: { error: 'now må være et ISO 8601-tidspunkt', code: 'INVALID_NOW' } };
  }
  const p = osloParts(at);
  const w = whenOf(text, p.date, { prefer: 'future', nowMin: p.minutes });
  const label = w.date ? `${relDate(w.date, p.date)}${w.start ? ` kl. ${w.start}${w.end ? `–${w.end}` : ''}` : ''}` : null;
  return {
    status: 200,
    body: { date: w.date, time: w.start, end: w.end, allDay: !!w.date && !w.start, rest: w.rest, label, today: p.date, dateText: w.dateRaw, timeText: w.timeRaw, errors: w.errors },
  };
}

/** GET /api/dates/holidays?year=2026 eller ?from=&to= → {from, to, items:[{date, name, type:'helligdag'|'merkedag', fri}]} (Q18). */
export function holidaysRequest(query = {}) {
  let from = query.from, to = query.to;
  if (query.year != null) {
    const y = Number(query.year);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) return { status: 400, body: { error: 'year må være et årstall', code: 'INVALID_YEAR' } };
    from = `${y}-01-01`; to = `${y}-12-31`;
  }
  if (from == null && to == null) { const y = osloParts().year; from = `${y}-01-01`; to = `${y}-12-31`; }
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return { status: 400, body: { error: 'from og to må være datoer (YYYY-MM-DD)', code: 'INVALID_RANGE' } };
  return { status: 200, body: { from, to, items: holidaysBetween(from, to) } };
}

export function mountDates(app, authOrToken) {
  app.get('/api/dates/holidays', authOrToken, (c) => { const r = holidaysRequest(c.req.query()); return c.json(r.body, r.status); });
  app.post('/api/dates/parse', authOrToken, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const r = parseDatesRequest(body && typeof body === 'object' ? body : {});
    return c.json(r.body, r.status);
  });
}
