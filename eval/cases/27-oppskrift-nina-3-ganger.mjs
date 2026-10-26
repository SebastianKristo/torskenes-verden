// Prompt 49 del 1, eval-test 6: samme spørsmål om Nina stilt 3 ganger → en oppskrift lagres, tredje gang brukes den som eksempel
// (synlig i sporet: trace.recipe.use = fewshot), og den blir `active` (2 vellykkede bruk – vellykket først når de neste 2 meldingene
// ikke retter/angrer/omformulerer; derfor én melding til etter de tre).
import { checkNextNina } from './_nina.mjs';
import { did } from '../lib/match.mjs';
export default {
  id: '27-oppskrift-nina-3-ganger', title: 'Nina-spørsmålet 3 ganger → oppskrift som eksempel → aktiv', area: 'oppskrift', intent: 'calendar_query',
  seed: { memory: ['nina'], calendar: ['frisor', 'frisor-forbi', 'forelesning-oslomet'] },
  async run(h, ck) {
    const Q = 'Når er neste gang jeg skal til Nina?';
    const s1 = await h.ask(Q);
    checkNextNina(s1, ck);
    ck('1. gang: ny oppskrift (kandidat)', s1.recipe?.use === 'new' && s1.recipe?.status === 'candidate', JSON.stringify(s1.recipe));
    const s2 = await h.ask(Q);
    const s3 = await h.ask(Q);
    checkNextNina(s3, ck);
    const t3 = h.glimtTrace(s3);
    ck('3. gang: oppskriften brukt som eksempel (sporet)', t3?.recipe?.use === 'fewshot' && t3.recipe.fewshot?.[0]?.id === s1.recipe?.id, `${JSON.stringify(t3?.recipe ?? null).slice(0, 300)} · ${did(s3)}`);
    ck('én oppskrift, ikke tre', h.recipes().length === 1, JSON.stringify(h.recipes().map((r) => r.query_template)));
    await h.ask('Takk!');
    const r = h.recipes()[0];
    ck('oppskriften er aktiv (2 vellykkede bruk)', r?.status === 'active' && r.success_count >= 2, JSON.stringify(r ?? null).slice(0, 300));
    ck('malen har {person}', /\{person\}/.test(r?.query_template ?? ''), r?.query_template);
    ck.info('2. gang', `${s2.recipe?.use ?? '-'} · ${did(s2)}`);
  },
};
