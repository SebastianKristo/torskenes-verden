// Prompt 51 (QA51): mock-server for ende-til-ende-testene. Starter Hono-appen med MOCK_DATA=1 og NODE_ENV=test
// (ingen bakgrunnsjobber), egen tom DATA_DIR og fast port (E2E_PORT, standard 4605). Alle utgående kall stoppes,
// så testene aldri når internett. Brukes av lib.mjs; kan også startes for hånd: node test/e2e/server.mjs
import { writeFileSync } from 'node:fs';

// lib.mjs gir DATA_DIR og sletter den selv. Startes serveren for hånd, lager den sin egen, som slettes når den stoppes.
if (!process.env.DATA_DIR) {
  const { lagMidlertidig } = await import('../lib/midlertidig.mjs');
  process.env.DATA_DIR = lagMidlertidig('hl-e2e-');
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(0)); // «exit» rydder mappa
}
process.env.SESSION_SECRET ||= 'e2e51-secret-e2e51-secret-e2e51-secret';
process.env.USER_NAME ||= 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = process.env.E2E_PORT || '4605';
// C-S4: serveren har ingen fast lokal adresse lenger. Uten LOCAL_URL ville den oppdage maskinens egen LAN-adresse, og
// skjermbildene av Innstillinger → Konto ville variert mellom maskiner. Et fast eksempel holder dem like.
process.env.LOCAL_URL ||= 'http://192.168.1.10:3000';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.GLITCHTIP_DSN;
const { hashPassword } = await import('../../server/auth/password.js');
// Prompt 90: E2E_FRESH=1 gir en helt ny installasjon (ingen brukere, førstegangsoppsettet vises på /login).
if (process.env.E2E_FRESH === '1') delete process.env.APP_PASSWORD_HASH;
else process.env.APP_PASSWORD_HASH = hashPassword(process.env.E2E_PASSWORD || 'testpassord1');

// E2E_CLOCK=<ISO-tid>: serverens klokke starter der og går 1000 ganger saktere enn vanlig (de visuelle testene fryser
// klokka i nettleseren på samme tidspunkt, så avganger, nedtellinger og «i dag» blir like fra kjøring til kjøring).
// Den står ikke helt stille, så kode som venter på at tiden skal gå, kommer seg videre.
if (process.env.E2E_CLOCK) {
  const RealDate = Date, t0 = RealDate.now(), start = new RealDate(process.env.E2E_CLOCK).getTime();
  const now = () => start + Math.floor((RealDate.now() - t0) / 1000);
  class ClockDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  globalThis.Date = ClockDate;
}

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  const u = typeof url === 'string' ? url : url?.url ?? String(url);
  if (local.test(u)) return realFetch(url, opt);
  throw new TypeError('fetch failed (e2e: ingen utgående kall)');
};

const { serve } = await import('@hono/node-server');
const { default: app, wsUser } = await import('../../server/index.js');
const { attachRealtime } = await import('../../server/realtime.js');
const port = Number(process.env.PORT);
const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  if (process.env.E2E_READY_FILE) writeFileSync(process.env.E2E_READY_FILE, String(port));
  console.log(`[e2e] mock-server på http://127.0.0.1:${port} (data ${process.env.DATA_DIR})`);
});
attachRealtime(server, wsUser); // /api/ws som i produksjon (Familie og Sjekk inn oppdateres live)
