// AI: monterer rutene i domenet. server/index.js kaller funksjonene der de gamle monteringene sto, fordi rekkefølgen er bærende
// (Hono kjører handlere og mellomvare i registreringsrekkefølge):
//   mountAiEngines(app) – motorene på Mac mini-en (bare admin): Neutrino/Phonon, NB-Whisper, VoxCPM (+ /api/voices57) og oMLX
//   mountAi(app)        – /api/ai: AI-minnet, ✦ Glimt anbefaler modeller (ai39.js) og AI-kontrollen, i den rekkefølgen
//   mountChat(app)      – /api/chat: Claude-importen før Chat
// Alle AI-kall går fortsatt gjennom server/ai-gate.js og server/ai-run.js (kø, ruting, nøkler); filene her bruker dem.
// Filene:
//   control.js        – AI-kontrollen (/api/ai: status, modeller, ruting, jobber, forbruk, nøkler, selvtest) og POST /api/glimt
//   memory.js         – AI-minnet per bruker (/api/ai/memory)
//   import.js         – import av samtaler og minner fra Claude, ChatGPT og Gemini (/api/ai/import, montert fra api45.js)
//   claude-import.js  – Claude-importen i Chat (/api/chat/import/claude); claude-memory.js – minne-eksporten (.md-filer)
//   ollama-options.js – felles Ollama-valg for korte oppgaver (think:false, lite kontekstvindu)
//   tool-router.js    – rutingssteget før hovedmodellen (web, vær, tid, strøm, Mine data)
//   chat/             – Chat: routes.js (ruter og motorer), auto-model.js (✦ Auto), attachments.js (vedlegg og miniatyr),
//                       images.js (bilder til riktig modell), thinking.js (tankegangen), tools.js (faktaverktøy), scans.js
//                       (mappen «Kvitteringer og skanninger»)
//   fermion/, whisper/, voxcpm/, omlx/ – motorene på Mac mini-en (oppsett, helse, klient)
// Importrekkefølgen følger den gamle rekkefølgen i server/index.js.
import chatApi from './chat/routes.js';
import aiApi from './control.js';
import { rec39Api } from '../ai39.js';
import { claudeImport43Api } from './claude-import.js';
import { aiMemory43Api } from './memory.js';
import { mountFermion53 } from './fermion/index.js';
import { mountWhisper54 } from './whisper/index.js';
import { mountVoxcpm57 } from './voxcpm/index.js';
import { mountOmlx58 } from './omlx/index.js';

/** Motorene på Mac mini-en: /api/admin/{fermion53,whisper54,voxcpm57,omlx58}/* (bare admin) og /api/voices57 (per bruker). */
export function mountAiEngines(app) {
  mountFermion53(app); // Neutrino-1 8B og Phonon
  mountWhisper54(app); // NB-Whisper (norsk tale til tekst i /api/voice53/*)
  mountVoxcpm57(app); // VoxCPM2: stemmer per bruker og opplesning
  mountOmlx58(app); // oMLX som motor bak AI-gaten
}

/** /api/ai: AI-minnet, modellanbefalingene og AI-kontrollen (sesjon eller app-token; serveroppsettet bare admin). */
export function mountAi(app) {
  app.route('/api/ai/memory', aiMemory43Api); // AI-minne per bruker
  app.route('/api/ai', rec39Api); // ✦ Glimt anbefaler modeller (før AI-kontrollen)
  app.route('/api/ai', aiApi); // AI-kontroll
}

/** /api/chat: Claude-importen og Chat (Open WebUI eller Ollama/Gemini/Groq direkte), sesjon eller app-token. */
export function mountChat(app) {
  app.route('/api/chat/import', claudeImport43Api);
  app.route('/api/chat', chatApi);
}
