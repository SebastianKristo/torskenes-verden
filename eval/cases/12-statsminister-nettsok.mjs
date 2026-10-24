// Oppdrag test 12 (og kjent feil 6): svaret skal bygge på søkeresultatet, ikke treningsdata.
// Søket er mocket med et oppdiktet navn (Eleanor Whitcombe), så et svar fra hukommelsen avsløres.
import { plain, did } from '../lib/match.mjs';
export default {
  id: '12-statsminister-nettsok', title: 'Statsminister i Storbritannia (mocket søk)', area: 'nettsøk',
  seed: {},
  async run(h, ck) {
    const s = await h.ask('Hvem er statsminister i Storbritannia?');
    const fx = h.fixture('search.json').uk_pm;
    const r = plain(s.reply);
    ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
    const searches = h.ext('search');
    ck('nettsøk ble kalt', searches.length > 0, `søk: ${searches.map((x) => `${x.api} «${x.q}»`).join(', ') || 'ingen'} · ${did(s)}`);
    ck(`svaret bygger på søket (${fx.expectName})`, r.includes(fx.expectName), `svar «${r.slice(0, 220)}»`);
    const bad = fx.forbidden.filter((n) => new RegExp(`\\b${n}\\b`).test(r));
    ck('ingen navn fra treningsdata', !bad.length, bad.length ? `nevner ${bad.join(', ')}` : '');
  },
};
