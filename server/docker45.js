// Prompt 45 (SERVER45): Docker-logger uten manuelt oppsett (claude-code-docker-logger-automatisk.md, Logger.dc.html).
//
// Proxyen homelab-docker (tecnativa/docker-socket-proxy med fast tag, POST=0, bare ALLOW_START/STOP/RESTARTS) er nå en del av
// docker-compose.yml. Updateren legger den til etter neste oppdatering (ensure_docker_proxy i deploy/updater/updater.sh), fra SIN EGEN
// validerte compose. Serveren har fortsatt ingen Docker-tilgang selv: «Sett opp nå» skriver bare {id, requestedBy, at, action:'docker-setup'}
// i data/update/request.json – aldri compose, kommandoer, image eller navn. Updateren skriver status i data/update/docker.json.
//
//   GET  /api/system/docker/setup (admin) → {state, error, at, updater, canRun, proxy, host, source, available}
//   POST /api/system/docker/setup (admin, JSON) → 202 {ok, id, state:'requested', message} · 409 {error, state:'no-updater'|'running'}
//   Mellomvare på /api/system/containers og /api/system/logs*: available:false får setup:{auto:true, state, error, …} (tomtilstanden
//   «Får ikke tilgang til Docker. Homelab prøver å sette dette opp automatisk …» med «Sett opp nå» og «Vis detaljer»).
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionUser, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { updaterAvailable, readStatus, _paths } from './system-update.js';
import { dockerTarget45, SETUP44, _resetDockerTarget45 } from './logs44.js';

const UPD = () => _paths.UPD;
const readJ = (f) => { try { return JSON.parse(readFileSync(join(UPD(), f), 'utf8')); } catch { return null; } };
const STATES = new Set(['idle', 'requested', 'running', 'done', 'failed']);
const REQUEST_TTL = 2 * 60_000;

/** Updaterens status for Docker-oppsettet (+ en forespørsel som venter). */
export function dockerSetupState45() {
  const d = readJ('docker.json');
  const req = readJ('request.json');
  const pending = req?.action === 'docker-setup' && req.id && req.id !== d?.id && Date.now() - Number(req.at || 0) < REQUEST_TTL;
  const updater = updaterAvailable();
  let state = pending ? 'requested' : STATES.has(d?.state) ? d.state : 'idle';
  if (!updater && !pending && state !== 'done') state = state === 'failed' ? 'failed' : 'no-updater';
  const p = d?.proxy && typeof d.proxy === 'object' ? { name: String(d.proxy.name ?? '').slice(0, 128), image: String(d.proxy.image ?? '').slice(0, 200), reused: d.proxy.reused === true } : null;
  const t = dockerTarget45();
  const host = t ? (t.socketPath ? `unix://${t.socketPath}` : `tcp://${t.host}:${t.port}`) : null;
  return { state, error: typeof d?.error === 'string' ? d.error.slice(0, 600) : null, at: Number(d?.at) ? new Date(Number(d.at)).toISOString() : null, updater,
    canRun: updater && !['requested', 'running'].includes(state), proxy: p, host, source: t?.source ?? null };
}

/** Tomtilstanden for Logger når Docker ikke svarer. */
export function setup45(err = null) {
  const s = dockerSetupState45();
  const running = ['requested', 'running'].includes(s.state);
  return { ...SETUP44, auto: true, state: s.state, error: s.error, at: s.at, updater: s.updater, canRun: s.canRun, proxy: s.proxy, host: s.host,
    title: 'Får ikke tilgang til Docker',
    text: running ? 'Homelab setter opp Docker-tilgangen nå …' : s.updater ? 'Homelab prøver å sette dette opp automatisk ved neste oppdatering. Trykk «Sett opp nå» for å gjøre det med en gang.'
      : 'Homelab prøver å sette dette opp automatisk, men oppdateringstjenesten (updater) kjører ikke. Kjør update.sh én gang fra serveren.',
    button: 'Sett opp nå', action: { method: 'POST', path: '/api/system/docker/setup' },
    details: [err, s.error, s.host ? `Adresse: ${s.host}` : null, s.proxy ? `Proxy: ${s.proxy.name} (${s.proxy.image})${s.proxy.reused ? ', din egen' : ''}` : null].filter(Boolean).join('\n') || null,
    steps: ['Homelab legger til docker-socket-proxy (homelab-docker) i stacken – bare lesetilgang + start/stopp/omstart.', 'Har du lagt inn en proxy selv, brukes den (ingen duplikat).', 'Logger viser containerne når proxyen svarer.'] };
}

const guard = async (c, next) => {
  let u = sessionUser(c);
  if (!u && bearerOk(c, c.req.method === 'GET' ? 'finance:read' : 'finance:write')) u = c.get('user');
  if (!u) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(u)) return c.json({ error: 'Bare administratorer kan sette opp Docker-tilgangen', restricted: true }, 403);
  if (c.get('actor')) return c.json({ error: 'Ikke tilgjengelig mens du er logget inn som en annen bruker' }, 403);
  c.set('user', u);
  await next();
};

export const docker45Api = new Hono();
docker45Api.use('*', guard);
docker45Api.get('/setup', (c) => c.json({ ...dockerSetupState45(), available: !!dockerTarget45() }, 200, { 'Cache-Control': 'no-store' }));
docker45Api.post('/setup', async (c) => {
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ error: 'Forventet JSON' }, 415);
  const s = dockerSetupState45();
  if (!s.updater) return c.json({ error: 'Oppdateringstjenesten (updater) kjører ikke. Kjør update.sh én gang fra serveren for å slå den på.', state: 'no-updater' }, 409);
  if (['requested', 'running'].includes(s.state)) return c.json({ error: 'Docker-oppsettet pågår allerede', state: 'running' }, 409);
  const st = readStatus();
  if (['downloading', 'building', 'restarting'].includes(st.state)) return c.json({ error: 'En oppdatering pågår. Docker-tilgangen settes opp når den er ferdig.', state: 'running' }, 409);
  const cur = readJ('request.json');
  if (cur?.id && cur.id !== st.id && cur.action !== 'docker-setup' && Date.now() - Number(cur.at || 0) < REQUEST_TTL) return c.json({ error: 'En oppdatering venter på å starte', state: 'running' }, 409);
  // Bare id, hvem, når og action. Updateren bestemmer resten selv.
  const req = { id: randomUUID(), requestedBy: String(c.get('user')).slice(0, 64), at: Date.now(), action: 'docker-setup' };
  mkdirSync(UPD(), { recursive: true });
  const tmp = join(UPD(), `.request-${req.id}.tmp`);
  writeFileSync(tmp, JSON.stringify(req), { mode: 0o644 });
  renameSync(tmp, join(UPD(), 'request.json'));
  _resetDockerTarget45();
  console.warn(`docker.setup requested id=${req.id} by=${req.requestedBy}`);
  return c.json({ ok: true, id: req.id, state: 'requested', message: 'Homelab setter opp Docker-tilgangen …' }, 202);
});

/** Mellomvare: available:false-svar fra Logger-rutene får setup45. */
export async function dockerSetupMw45(c, next) {
  await next();
  if (c.req.method !== 'GET' || !(c.res.headers.get('content-type') ?? '').includes('json')) return;
  try {
    const j = await c.res.clone().json();
    if (j?.available !== false) return;
    c.res = c.json({ ...j, setup: setup45(j.error ?? null) }, c.res.status, { 'Cache-Control': 'no-store' });
  } catch { /* svaret står */ }
}
