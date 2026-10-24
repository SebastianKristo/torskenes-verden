// Ekstra (kartlegging 2.7): «Last ned siste episode fra 9-1-1» i Media. Forventet: serien 9-1-1 (ikke Lone Star/Nashville),
// siste sendte episode S09E06 (id 9106) søkes ned (Sonarr EpisodeSearch) eller tilbys som konkret handling.
import { plain, did } from '../lib/match.mjs';
export default {
  id: '15-media-911', title: 'Last ned siste episode fra 9-1-1 (Media)', area: 'media',
  seed: {},
  async run(h, ck) {
    const { agent, media } = await h.askMedia('Last ned siste episode fra 9-1-1');
    const exp = h.fixture('sonarr.json').expected;
    const reply = plain(media?.reply ?? agent.reply);
    const son = h.ext('sonarr');
    const cmd = son.find((x) => x.method === 'POST' && x.path === '/command' && /EpisodeSearch/i.test(x.body?.name ?? '') && (x.body?.episodeIds ?? []).includes(exp.episodeId));
    const offered = JSON.stringify([agent.actions, media?.actions, media?.results]).includes(String(exp.episodeId));
    ck('søker etter siste episode (S09E06) i Sonarr', cmd || offered,
      `Sonarr-kall: ${son.map((x) => `${x.method} ${x.path}${x.query?.term ? ` term=«${x.query.term}»` : ''}${x.body?.name ? ` ${x.body.name}` : ''}`).join(', ') || 'ingen'} · ${media ? `Media-Glimt: «${reply.slice(0, 160)}»` : did(agent)}`);
    ck('riktig serie (9-1-1, ikke Lone Star/Nashville)', /9-1-1|911/.test(reply) && !/lone star|nashville/i.test(reply), `svar «${reply.slice(0, 200)}»`);
    ck('la ikke til en ny serie', !son.some((x) => x.method === 'POST' && x.path === '/series'), '');
  },
};
