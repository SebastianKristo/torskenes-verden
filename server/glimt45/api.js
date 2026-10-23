// Prompt 45 (GLIMT45): /api/glimt/agent – én inngang for alle Glimt-felt. Sesjon eller app-token, alt per bruker.
// Se $S/SERVER45-API.md (seksjon «Glimt») for formene.
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { runAsUser } from '../settings.js';
import { agent45, confirm45, logOf45, busyOf45 } from './engine.js';
import { registryOut45 } from './tools.js';
import { modelInfo45, MODULES45 } from './plan.js';
import { personalityOf, setPersonality, PERSONALITIES, PERSONALITY_LABELS } from './personality.js';

export const agentApi45 = new Hono();
agentApi45.use('*', authOrToken);
const RID = /^[A-Za-z0-9_-]{8,80}$/;
const settingsOut = (u) => ({ personality: personalityOf(u), options: PERSONALITIES, labels: PERSONALITY_LABELS });

agentApi45.post('/', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {text, module, context?, requestId}' }, 400);
  const text = typeof (b.text ?? b.q) === 'string' ? String(b.text ?? b.q).trim() : '';
  if (!text) return c.json({ error: 'Skriv noe til Glimt' }, 400);
  if (text.length > 1000) return c.json({ error: 'Teksten er for lang (maks 1000 tegn)' }, 400);
  if (b.requestId != null && !RID.test(String(b.requestId))) return c.json({ error: 'Ugyldig requestId (8–80 tegn: bokstaver, tall, - og _)' }, 400);
  if (busyOf45(u) >= 4) return c.json({ error: 'Glimt jobber allerede med flere ting. Vent litt.' }, 429);
  const module = MODULES45.includes(b.module) ? b.module : 'home';
  try {
    // Prompt 46: preview:true = bare forstå og validere (Kalender «Skriv en time»), webSearch:false = ingen nettverktøy.
    const out = await runAsUser(u, () => agent45(u, text, { module, context: b.context, requestId: b.requestId ?? null, preview: b.preview === true, ...(typeof b.webSearch === 'boolean' ? { webSearch: b.webSearch } : {}) }));
    return c.json(out, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.warn('[glimt45]', String(e?.message ?? e).slice(0, 200));
    return c.json({ error: 'Glimt fikk ikke gjort det akkurat nå. Prøv igjen.' }, 502);
  }
});
// Prompt 46 (KAL46): forhåndsvisning mens man skriver («Skriv en time» → GLIMT FORSTÅR). Utfører ALDRI noe: samme forståelse og
// validering som POST /, men ingen lagring, ingen gamle svar (vær, prøveperioder …) og ingen idempotens-cache mot den ekte lagringen.
// Lokal tolkning først; modellen brukes bare hvis den svarer innen 1,5 s. Svarform: flate felt + preview + actions (se SERVER46-API.md «Glimt»).
const REM_MIN46 = { none: 0, '15m': 15, '1h': 60, day: 1440 };
agentApi45.post('/preview', async (c) => {
  const u = c.get('user');
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Forventet {text, module, context?}' }, 400);
  const text = typeof (b.text ?? b.q) === 'string' ? String(b.text ?? b.q).trim() : '';
  if (!text) return c.json({ error: 'Skriv noe til Glimt' }, 400);
  if (text.length > 1000) return c.json({ error: 'Teksten er for lang (maks 1000 tegn)' }, 400);
  const module = MODULES45.includes(b.module) ? b.module : 'calendar';
  try {
    const out = await runAsUser(u, () => agent45(u, text, { module, context: b.context, requestId: null, preview: true, previewMs: 1500 }));
    const pv = out.preview && typeof out.preview === 'object' ? out.preview : null;
    const flat = pv ? { title: pv.title, location: pv.location ?? null, address: pv.place?.address ?? null, date: pv.date, start: pv.start, end: pv.end, allDay: pv.allDay,
      calendarId: pv.calendarId, calendarName: pv.calendarName, reminder: REM_MIN46[pv.reminder] ?? 60, poster: pv.movie?.poster ?? null, runtime: pv.movie?.runtime ?? null } : {};
    return c.json({ ...flat, engine: out.engine, preview: pv, event: pv ? flat : null, ask: out.ask ?? null, reply: out.reply, actions: out.actions ?? [], saved: false, ms: out.ms }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.warn('[glimt46] preview', String(e?.message ?? e).slice(0, 200));
    return c.json({ error: 'Glimt fikk ikke tolket teksten akkurat nå.' }, 502);
  }
});
agentApi45.post('/confirm', async (c) => {
  const b = await c.req.json().catch(() => null);
  const r = await runAsUser(c.get('user'), () => confirm45(c.get('user'), b?.token));
  if (r.error) return c.json({ error: r.error }, r.status ?? 400);
  return c.json(r);
});
agentApi45.get('/settings', (c) => c.json(settingsOut(c.get('user'))));
agentApi45.put('/settings', async (c) => {
  const b = await c.req.json().catch(() => null);
  const v = b?.personality ?? b?.glimt_personality;
  try { setPersonality(c.get('user'), v); } catch (e) { return c.json({ error: e.message }, 400); }
  return c.json(settingsOut(c.get('user')));
});
agentApi45.get('/tools', async (c) => { const m = await modelInfo45(c.get('user')); return c.json({ tools: registryOut45(), toolMode: m.mode, model: m.model }); });
agentApi45.get('/log', (c) => c.json({ items: logOf45(c.get('user')) }));
// Prompt 46: kalenderne Glimt kan legge avtaler i (skrivbare), og standardkalenderen. Klientene viser valget når Glimt spør.
agentApi45.get('/calendars', async (c) => {
  const { writableCalendars46, calendarLabel46 } = await import('./calendar46.js');
  const r = await writableCalendars46(c.get('user'));
  return c.json({ calendars: r.calendars.map((x) => ({ id: x.id, name: x.name, label: calendarLabel46(x), source: x.source, google: !!x.google, default: x.id === r.defaultId })), defaultCalendar: r.defaultId, google: r.google, readOnly: r.readOnly });
});
