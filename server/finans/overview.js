// Prompt 43 (SERVER43): Finans – saldokortet (4b, claude-code-finans-saldokort.md) og månedstopp i Liste (claude-code-finans-liste-maned-topp.md).
//   GET /finans/api/overview?month=YYYY-MM → alt fra /summary + {balance, spentMonth, day, daysInMonth, monthName, spentLabel, ring}
//   GET /finans/api/summary                → får de samme feltene når de mangler (routes.js, withSaldo43 i month-fields.js)
//   GET /finans/api/transactions/months?category=&account=&type=&from=&to= → {months:[{month, label, labelShort, count, net, inn, ut, netText}]}
//   GET /finans/api/transactions           → får months:[…] for månedene i svaret (routes.js og glimt-routes.js, withMonths43)
import { Hono } from 'hono';
import { auth42 } from './glimt-routes.js';
import finansApi from './routes.js';
import { saldoFields43, monthsOf43 } from './month-fields.js';

const R = auth42('finance:read');

export const finans43Api = new Hono();
finans43Api.get('/overview', R, async (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month') : '';
  const h = {}; for (const k of ['cookie', 'authorization']) { const v = c.req.header(k); if (v) h[k] = v; }
  const r = await finansApi.request(`/summary${month ? `?month=${month}` : ''}`, { headers: h }, c.env);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return c.json(j, r.status);
  return c.json({ ...j, ...saldoFields43(j) });
});
finans43Api.get('/transactions/months', R, (c) => c.json({ months: monthsOf43(c.get('user'), c.req.query()) }));
