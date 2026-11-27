// Tailscale i Homelab (prompt 57): oversikt over tailnetet på Nettverk, Hjem-flis, Glimt, ⌘K-søk og varsler. Bare administratorer.
// server/index.js kaller mountTailscale(app). Filene:
//   kilde.js       LocalAPI (unix-socket, lesende) eller Tailscale-API-et, normalisert til én modell, cache 30 s
//   tilstand.js    siste latens, sanntid «tailscale.node» og siste endring
//   statistikk.js  tailscale_samples i SQLite (hvert 5. min, slettes etter 90 d), oppetid, latens, trafikk, vedlikehold
//   etiketter.js   tekstene klientene viser (latens, «sist sett», fakta, filtre, grupper)
//   api.js         /api/tailscale/* (requireAdmin, økt eller app-token)
//   varsler.js     varslene til administratorene (notify.js), av/på globalt og per enhet
//   glimt.js       Glimt-verktøyet tailscale.status (bare lesing) og enhetene i ⌘K-søket
//   demo.js        eksempeldata (MOCK_DATA=1)
// Bakgrunnsjobbene går i den felles planleggeren (server/jobs/), så de ikke kjører i test eller sandkassen.
import { registerJob } from '../jobs/index.js';
import { kv, OWNER } from '../db.js';
import { cfg } from '../settings.js';
import { osloParts, osloDate } from '../dates/oslo.js';
import { chooseSource } from './kilde.js';
import { hent, pingAlle } from './tilstand.js';
import { lagreProver, slettGamle, forsteRunde } from './statistikk.js';
import { sjekkVarsler } from './varsler.js';
import { tailscaleApi } from './api.js';
import './glimt.js'; // registrerer Glimt-verktøyet tailscale.status og den lokale planen

const MIN = 60_000;
const pingMin = () => { const n = Math.round(Number(cfg('ts_ping_min'))); return n >= 1 && n <= 60 ? n : 3; };

/** Én prøve per enhet (jobben hvert 5. minutt). → {antall, nye} eller null uten kilde. */
export async function taProver(now = Date.now()) {
  if (!chooseSource()) return null;
  const t = await hent(now);
  const forste = forsteRunde();
  const r = lagreProver(t.devices, now);
  await sjekkVarsler(t.devices, { nye: r.nye, forste, now }); // offline > 10 min, nøkkel om 7 d, ny enhet, DERP > 1 t
  return { antall: t.devices.length, nye: r.nye, devices: t.devices };
}

let sistPing = 0;
async function pingJobb(now = Date.now()) {
  if (now - sistPing < pingMin() * MIN - 5_000) return;
  sistPing = now;
  await pingAlle(now);
}

/** Nattlig opprydding: én gang per Oslo-døgn, etter kl. 03. */
async function ryddJobb(now = Date.now()) {
  const p = osloParts(now), day = osloDate(now);
  if (p.hour < 3 || kv.get(OWNER, 'ts_ryddet', null) === day) return;
  slettGamle(now);
  kv.set(OWNER, 'ts_ryddet', day);
}

registerJob('tailscale.prover', 5 * MIN, () => taProver(), { note: 'Tailscale: én prøve per enhet (oppetid, latens, trafikk)', firstRunAfterMs: 90_000 });
registerJob('tailscale.ping', MIN, () => pingJobb(), { note: 'Tailscale: latens til online-enheter (ikke mobil), hvert 3. minutt som standard' });
registerJob('tailscale.rydd', 30 * MIN, () => ryddJobb(), { note: 'Tailscale: sletter prøver eldre enn 90 dager (nattlig)' });

export function mountTailscale(app) {
  app.route('/api/tailscale', tailscaleApi);
}
