// Prompt 45 (SERVER45): alle serverdelene unntatt Glimt-motoren (GLIMT45, server/glimt/) og Media (server/media/: uovervåkede
// filer og Avspilling-sammendraget monteres i mountMedia). Formene står i SERVER45-API.md.
// Monteres tidlig i index.js (før de eldre rutene på samme stier), så mellomvarene kan etterbehandle svarene deres.
import { docker45Api, dockerSetupMw45 } from './docker45.js';
import { gsc45Api, gscInfoMw45 } from './domener/gsc-service-account.js';
import { aiImport45Api } from './ai/import.js';
import { settings45Api } from './misc45.js';

export function mountApi45(app) {
  // Docker-logger uten oppsett: «Sett opp nå» + tomtilstand med setup.state.
  app.route('/api/system/docker', docker45Api);
  for (const p of ['/api/system/containers', '/api/system/containers/*', '/api/system/logs', '/api/system/logs/*']) app.use(p, dockerSetupMw45);
  // Search Console: servicekonto, normalisert eiendom, auth-type.
  app.use('/api/gsc', gscInfoMw45);
  app.route('/api/gsc', gsc45Api);
  // AI-import (Claude · ChatGPT · Gemini).
  app.route('/api/ai/import', aiImport45Api);
  // Innstillinger samlet. (Vær «Min posisjon» og Gjøremål-synkraden monteres i server/vaer/ og server/gjoremal/.)
  app.route('/api/settings', settings45Api);
}
