// Prompt 49 del 3 (eval-test 8 i oppdraget): «og i Bergen?» etter et værspørsmål i SAMME samtale → riktig sted, samme tidsrom.
// To meldinger med samme conversationId (Glimt-søket på Hjem). Planleggeren får samtaletilstanden og setter refers_to_previous;
// koden fyller inn tidsrommet fra forrige tur.
import { plain, did } from '../lib/match.mjs';
export default {
  id: '23-samtale-vaer-bergen', title: '«og i Bergen?» etter været i Oslo i morgen → Bergen, i morgen', area: 'samtale', intent: 'weather (oppfølging)',
  seed: {},
  async run(h, ck) {
    const conv = { conversationId: `home-eval23-${process.pid}` };
    const a = await h.ask('Hvordan er været i Oslo i morgen?', 'home', conv);
    const wa = (a.actions ?? []).find((x) => x.tool === 'weather.get');
    ck('første: vær for Oslo i morgen', a.status === 200 && wa?.status === 'done' && /^oslo$/i.test(String(wa.args?.place ?? '').trim()) && wa.args?.when?.from === '2026-10-25', did(a));
    const b = await h.ask('og i Bergen?', 'home', conv);
    const wb = (b.actions ?? []).filter((x) => x.tool === 'weather.get');
    ck('andre: ett værkall, for Bergen', b.status === 200 && wb.length === 1 && /bergen/i.test(String(wb[0].args?.place ?? '')) && wb[0].status === 'done', did(b));
    ck('samme tidsrom som forrige tur (i morgen = 25.10)', wb[0]?.args?.when?.from === '2026-10-25' && wb[0]?.args?.when?.to === '2026-10-25', JSON.stringify(wb[0]?.args?.when ?? null));
    ck('prognose hentet for Bergen', h.ext('weather').some((x) => /forecast/.test(x.api) && x.place === 'Bergen'), h.ext('weather').map((x) => `${x.api}:${x.place ?? x.q ?? ''}`).join(', '));
    const r = plain(b.reply);
    ck('svaret gjelder Bergen (ikke Oslo, ikke kalender)', /bergen/i.test(r) && !/oslo/i.test(r) && !(b.actions ?? []).some((x) => /^calendar\./.test(x.tool)), `svar «${r.slice(0, 200)}»`);
    ck('samtale-id i svaret', b.conversationId === conv.conversationId, String(b.conversationId));
    const t = h.glimtTrace(b);
    ck.info('oppfølging (spor)', JSON.stringify({ convo: t?.convo ?? null, followUp: b.followUp ?? null }));
  },
};
