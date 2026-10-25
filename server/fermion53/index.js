// Prompt 53 (FERMION53): Fermion Research på Mac mini-en – Neutrino-1 8B (tekst, valgfri) og Phonon (tale→tekst for voice53).
// Brukerveiledning: docs/fermion-53.md. API-formene: SERVER53-API.md (seksjon FERMION53).
//
//   GET  /api/admin/fermion53/health[?fresh=1]  → {neutrino:{…}, phonon:{…}}                     (bare admin)
//   GET  /api/admin/fermion53/config            → {neutrinoUrl, neutrinoKeySet, phononUrl, phononKeySet, phononModel}
//   PUT  /api/admin/fermion53/config            {neutrinoUrl?, neutrinoKey?, phononUrl?, phononKey?, phononModel?}
//   POST /api/admin/fermion53/test              {service:'neutrino'|'phonon'} → {ok, text, ms, model, error?}
//
// Sikkerhet: alt her er serverinfrastruktur → bare admin. Nøklene sendes aldri ut og logges aldri. Adressene må være i huset.
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { isAdmin } from '../auth.js';
import { defineFlagOn53 } from '../flags53.js';
import { confOut53, saveConf53 } from './config.js';
import { FLAG_NEUTRINO53, FLAG_PHONON53, healthOut53, probe53, startHealth53, state53, neutrinoReady53, phononReady53 } from './health.js';
import { NEUTRINO_ID53, chatModels53, testNeutrino53 } from './neutrino.js';
import { phononModel53, phononLanguages53, testPhonon53 } from './asr.js';

export { chatModels53, neutrinoChatStream53, isNeutrino53, NEUTRINO_ID53, NEUTRINO_BACKEND53 } from './neutrino.js';
export { phononAsr53 } from './asr.js';

defineFlagOn53(FLAG_NEUTRINO53, 'Neutrino-1 8B (Fermion Research) på Mac mini-en i modellvalget når den svarer. Aldri standardmodell.');
defineFlagOn53(FLAG_PHONON53, 'Phonon (Fermion Research) på Mac mini-en som tale→tekst for stemme (ikke norsk).');

/** Til AI-kontroll (GET /api/ai/models → external). Viser tjenestene som er satt opp, med status. */
export function externalModels53() {
  const h = healthOut53(), out = [];
  if (h.neutrino.configured) out.push({ id: NEUTRINO_ID53, name: 'Neutrino-1 8B', provider: 'fermion', host: 'Mac mini', kind: 'tekst', ok: neutrinoReady53(), status: h.neutrino.status, flag: h.neutrino.flag,
    desc: 'Fermion Research · Qwen3-8B ternær · 3,9 GB · valgfri i Chat', sizeGb: 3.9 });
  if (h.phonon.configured) out.push({ id: phononModel53(), name: phononModel53() === 'phonon-2.5' ? 'Phonon-2.5' : phononModel53() === 'phonon-2' ? 'Phonon-2' : 'Phonon-2.5 English', provider: 'fermion', host: 'Mac mini', kind: 'tale',
    ok: phononReady53(), status: h.phonon.status, flag: h.phonon.flag, desc: `Tale→tekst · ${phononLanguages53().length} språk (ikke norsk)`, sizeGb: 0.2 });
  return out;
}

export const fermion53Api = new Hono();
const adminOnly = async (c, next) => {
  if (!isAdmin(c.get('user'))) return c.json({ error: 'Bare administratorer kan gjøre dette' }, 403);
  await next();
};
const body = async (c) => { try { const b = await c.req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } };
const healthFull = () => {
  const h = healthOut53();
  return { neutrino: { ...h.neutrino, model: NEUTRINO_ID53, upstreamModel: h.neutrino.info?.model ?? null, backend: h.neutrino.info?.backend ?? null, context: h.neutrino.info?.context ?? null },
    phonon: { ...h.phonon, model: phononModel53(), languages: phononLanguages53(), norwegian: false } };
};

fermion53Api.use('/admin/fermion53/*', authOrToken, adminOnly);
fermion53Api.get('/admin/fermion53/health', async (c) => {
  if (c.req.query('fresh') === '1') await Promise.all([probe53('neutrino'), probe53('phonon')]);
  return c.json(healthFull(), 200, { 'Cache-Control': 'no-store' });
});
fermion53Api.get('/admin/fermion53/config', (c) => c.json(confOut53(), 200, { 'Cache-Control': 'no-store' }));
fermion53Api.put('/admin/fermion53/config', async (c) => {
  const r = saveConf53(await body(c));
  if (!r.ok) return c.json({ error: r.error }, 400);
  // Ny adresse/nøkkel: sjekk på nytt med en gang (i bakgrunnen – svaret venter ikke på Mac-en).
  for (const svc of ['neutrino', 'phonon']) { state53(svc).ok = false; probe53(svc).catch(() => {}); }
  return c.json(confOut53());
});
fermion53Api.post('/admin/fermion53/test', async (c) => {
  const { service } = await body(c);
  if (service === 'neutrino') return c.json(await testNeutrino53());
  if (service === 'phonon') return c.json(await testPhonon53());
  return c.json({ error: 'service må være neutrino eller phonon' }, 400);
});

export function mountFermion53(app) {
  app.route('/api', fermion53Api);
  startHealth53();
}
