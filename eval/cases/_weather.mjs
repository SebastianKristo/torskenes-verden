// Felles sjekk for værcasene (07, 16): to værkall med riktige steder og tidsvinduer, begge dekket i svaret, ingen kalenderdata.
import { plain, did } from '../lib/match.mjs';

export function checkWeather(h, s, ck) {
  ck('svarte', s.status === 200 && s.reply, `HTTP ${s.status} ${s.error ?? ''}`);
  const r = plain(s.reply);
  const acts = (s.actions ?? []).filter((a) => a.tool === 'weather.get');
  const placeOf = (a) => String(a.args?.place ?? a.result?.place?.name ?? a.result?.place ?? '');
  const oslo = acts.find((a) => /^oslo$/i.test(placeOf(a).trim()));
  const ny = acts.find((a) => /new york/i.test(placeOf(a)));
  ck('to værkall i planen (Oslo og New York)', oslo && ny, acts.length ? `værkall: ${acts.map((a) => `${placeOf(a) || '(eget sted)'} ${JSON.stringify(a.args?.when ?? null)}`).join(' | ')}` : did(s));
  const w = (a) => a?.args?.when ?? a?.result?.when ?? null;
  const ow = w(oslo), nw = w(ny);
  ck('Oslo: neste time (i dag, nå/time)', ow && ow.from === '2026-10-24' && (/now|hour/.test(ow.kind ?? '') || /time|nå/i.test(ow.label ?? '')), `Oslo-vindu ${JSON.stringify(ow)}`);
  ck('New York: i morgen (25.10 lokal dato)', nw && nw.from === '2026-10-25', `New York-vindu ${JSON.stringify(nw)}`);
  const fc = h.ext('weather').filter((x) => /forecast/.test(x.api));
  const places = [...new Set(fc.map((x) => x.place))];
  ck('hentet prognose for begge steder', places.includes('Oslo') && places.includes('New York'), `prognoser hentet for: ${places.join(', ') || 'ingen'}; geokoding: ${h.ext('weather').filter((x) => /geocode/.test(x.api)).map((x) => `«${x.q}»→${x.place ?? 'ukjent'}`).join(', ') || 'ingen'}`);
  ck('svaret dekker Oslo og New York', /oslo/i.test(r) && /new york/i.test(r), `svar «${r.slice(0, 220)}»`);
  ck('svaret har tallene fra prognosen (Oslo 7°, NY 9–16°)', /(?<!\d)7\s*°|(?<!\d)7\s*grader/i.test(r) && /(?<!\d)16\s*°|(?<!\d)16\s*grader|9\s*[–-]\s*16/i.test(r), `svar «${r.slice(0, 220)}»`);
  ck('ingen kalenderdata i værsvaret', !/TRE1400|forelesning|oslomet|kalender|avtale/i.test(r) && !(s.actions ?? []).some((a) => /^calendar\./.test(a.tool)) && !/^calendar/.test(s.legacyIntent ?? ''), did(s));
}
