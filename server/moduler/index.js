// Moduler: GET /api/moduler, modullisten per bruker (shared/schemas/moduler.json, kontrakt i shared/schemas/api/moduler.schema.json).
// server/index.js kaller mountModuler(app) sammen med de andre domenene, før /api/app og de autentiserte /api-rutene.
//   liste.js  leser modullisten og grupperingen av integrasjoner (tilkoblinger.json) og filtrerer per bruker
import { Hono } from 'hono';
import { authOrToken } from '../mobile.js';
import { modulerFor } from './liste.js';

const PLATTFORMER = new Set(['web', 'ios', 'android']);

export const modulerApi = new Hono();
modulerApi.use('*', authOrToken);
// GET /api/moduler[?plattform=web|ios|android] → {versjon, grupper, toppmeny, bunnmeny, moduler, innstillinger}
modulerApi.get('/', (c) => {
  const p = c.req.query('plattform');
  if (p && !PLATTFORMER.has(p)) return c.json({ error: 'plattform må være web, ios eller android', code: 'BAD_REQUEST' }, 400);
  return c.json(modulerFor(c.get('user'), { plattform: p || undefined }), 200, { 'Cache-Control': 'private, no-cache' });
});

export function mountModuler(app) {
  app.route('/api/moduler', modulerApi);
}
