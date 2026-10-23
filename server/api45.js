// Prompt 45 (SERVER45): alle serverdelene unntatt Glimt-motoren (GLIMT45, server/glimt45/). Formene står i SERVER45-API.md.
// Monteres tidlig i index.js (før de eldre rutene på samme stier), så mellomvarene kan etterbehandle svarene deres.
import { docker45Api, dockerSetupMw45 } from './docker45.js';
import { gsc45Api, gscInfoMw45 } from './gsc45.js';
import { aiImport45Api } from './ai-import45.js';
import { media45Api, playback45Api } from './media45.js';
import { zone45Api } from './zone45.js';
import { haHealthMw45 } from './health45.js';
import { weather45Api, tasks45Api, settings45Api } from './misc45.js';

export function mountApi45(app) {
  // Docker-logger uten oppsett: «Sett opp nå» + tomtilstand med setup.state.
  app.route('/api/system/docker', docker45Api);
  for (const p of ['/api/system/containers', '/api/system/containers/*', '/api/system/logs', '/api/system/logs/*']) app.use(p, dockerSetupMw45);
  // Search Console: servicekonto, normalisert eiendom, auth-type.
  app.use('/api/gsc', gscInfoMw45);
  app.route('/api/gsc', gsc45Api);
  // AI-import (Claude · ChatGPT · Gemini).
  app.route('/api/ai/import', aiImport45Api);
  // Media: uovervåkede filer; Avspilling for mobil.
  app.route('/api/media', media45Api);
  app.route('/api/playback', playback45Api);
  // Familie: sonevarsler + soneikon; HA-helse bare mobile_app.
  app.route('/api/family', zone45Api);
  app.use('/api/family/health/ha', haHealthMw45);
  // Vær Min posisjon, Gjøremål-synkraden, Innstillinger samlet.
  app.route('/api/weather', weather45Api);
  app.route('/api/tasks', tasks45Api);
  app.route('/api/settings', settings45Api);
}
