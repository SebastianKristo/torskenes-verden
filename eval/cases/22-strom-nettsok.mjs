// Prompt 49 del 4: strømming for svarformuleringen (modellen skriver token for token) med statuslinje mens nettsøket jobber.
// Samme fasit som case 12 (mocket søk med det oppdiktede navnet Eleanor Whitcombe).
import { plain } from '../lib/match.mjs';
export default {
  id: '22-strom-nettsok', title: 'Strømming: statsminister (nettsøk + svar token for token)', area: 'nettsøk', intent: 'web_search (strøm)',
  seed: {},
  async run(h, ck) {
    const s = await h.askStream('Hvem er statsminister i Storbritannia?');
    const fx = h.fixture('search.json').uk_pm;
    ck('SSE 200', s.status === 200, `HTTP ${s.status} ${s.error ?? ''}`);
    const ev = s.events ?? [];
    ck('statuslinje: søker på nettet', ev.some((e) => e.event === 'status' && e.tool === 'web.search'), ev.filter((e) => e.event === 'status').map((e) => e.text).join(' | '));
    ck('svaret skrives av modellen (source model)', ev.some((e) => e.event === 'token' && e.source === 'model'), ev.filter((e) => e.event === 'token').map((e) => e.source).join(','));
    ck(`done bygger på søket (${fx.expectName})`, plain(s.reply).includes(fx.expectName), `svar «${plain(s.reply).slice(0, 200)}»`);
    ck('done sist', ev.at(-1)?.event === 'done', ev.map((e) => e.event).join(','));
    ck.info('første status / første tekst / ferdig', `${s.firstStatusMs} ms / ${s.firstTokenMs} ms / ${s.msTotal} ms`);
  },
};
