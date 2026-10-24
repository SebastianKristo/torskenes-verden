// Felles sjekk for kalenderopprettelse (04–06): ser på den LAGREDE hendelsen, ikke svarteksten.
import { newEvents, norm, did, plain } from '../lib/match.mjs';

export function checkCreated(h, s, ck, before, want) {
  ck('svarte', s.status === 200, `HTTP ${s.status} ${s.error ?? ''}`);
  const evs = newEvents(before.calendar, h.calendar());
  const tasks = h.tasks().filter((t) => !before.tasks.some((b) => b.id === t.id));
  if (!ck('nøyaktig én ny hendelse lagret', evs.length === 1, `${evs.length} nye hendelser${tasks.length ? `, ${tasks.length} nye gjøremål («${tasks.map((t) => t.title).join('», «')}»)` : ''} · ${did(s)}`)) return;
  const e = evs[0];
  const full = norm(s.text);
  ck('tittel', want.title(e.title ?? '') && norm(e.title) !== full && (e.title ?? '').length <= 60, `lagret tittel «${e.title}»`);
  ck('dato', e.date === want.date, `lagret ${e.date}`);
  ck('starttid', e.start === want.start, `lagret ${e.start ?? '(heldags)'}`);
  if (want.location) ck('sted', want.location(e.location ?? ''), `lagret sted «${e.location ?? ''}»`);
  ck.info('slutt', `${e.endDate && e.endDate !== e.date ? `${e.endDate} ` : ''}${e.end ?? '–'}`);
  ck.info('bekreftelse', plain(s.reply).slice(0, 200));
}
