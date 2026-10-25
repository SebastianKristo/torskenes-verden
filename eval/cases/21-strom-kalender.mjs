// Prompt 49 del 4: strømming (SSE, POST /api/glimt/agent/stream) for et kalendersvar fra kodemalen: start → status («Sjekker
// kalenderen …») → tekstbiter → done, og done er samme svar som det ikke-strømmende API-et (Nina-casen 01).
import { checkNextNina } from './_nina.mjs';
export default {
  id: '21-strom-kalender', title: 'Strømming: neste gang til Nina (statuslinje + ord for ord)', area: 'kalender+minne', intent: 'calendar_query (strøm)',
  seed: { memory: ['nina'], calendar: ['frisor', 'frisor-forbi', 'forelesning-oslomet'] },
  async run(h, ck) {
    const s = await h.askStream('Når er neste gang jeg skal til Nina?');
    ck('SSE 200', s.status === 200, `HTTP ${s.status} ${s.error ?? ''}`);
    const ev = s.events ?? [];
    ck('start først, done sist', ev[0]?.event === 'start' && ev.at(-1)?.event === 'done', ev.map((e) => e.event).join(','));
    ck('statuslinje fra kalenderverktøyet', ev.some((e) => e.event === 'status' && e.stage === 'tool' && /kalender/i.test(e.text ?? '')), ev.filter((e) => e.event === 'status').map((e) => e.text).join(' | '));
    const toks = ev.filter((e) => e.event === 'token');
    ck('tekstbiter før done', toks.length > 1 && toks[0].at <= ev.at(-1).at, `${toks.length} biter`);
    ck('bitene blir svaret (done.reply er fasit)', toks.map((t) => t.t).join('') === s.reply, `«${toks.map((t) => t.t).join('').slice(0, 120)}» / «${String(s.reply).slice(0, 120)}»`);
    checkNextNina(s, ck);
    ck.info('første status / første tekst / ferdig', `${s.firstStatusMs} ms / ${s.firstTokenMs} ms / ${s.msTotal} ms`);
  },
};
