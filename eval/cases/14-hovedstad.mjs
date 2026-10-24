// Oppdrag test 14: svarer direkte uten unødvendige verktøykall (ingen kalender/finans/nettsøk/vær).
import { plain, did } from '../lib/match.mjs';
export default {
  id: '14-hovedstad', title: 'Hovedstaden i Frankrike (ingen verktøy)', area: 'prat',
  seed: { calendar: ['frisor'], subscriptions: true },
  async run(h, ck) {
    const s = await h.ask('Hva er hovedstaden i Frankrike?');
    ck('svarer Paris', /paris/i.test(plain(s.reply)), did(s));
    const tools = (s.actions ?? []).map((a) => a.tool).filter((t) => !['chat.answer', 'app.answer'].includes(t));
    ck('ingen datakall (kalender/finans/oppgaver/vær)', !tools.length && !/^(calendar|finance|tasks|weather)/.test(s.legacyIntent ?? ''), tools.join(', ') || s.legacyIntent || '');
    const ext = h.ext().filter((x) => !['blocked', 'sonarr'].includes(x.kind)); // Sonarr leses av kalenderkilden i alle caser
    ck('ingen eksterne oppslag (nettsøk/vær)', !ext.length, ext.map((x) => `${x.kind}:${x.api ?? x.host} «${x.q ?? ''}»`).join(', '));
  },
};
