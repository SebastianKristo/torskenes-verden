// Prompt 38 (SERVER38): kobler sammen modulene for prompt 38 (montert i index.js).
//   /api/auth/qr*, /api/auth/app-session, /api/auth/logout-all, /api/me/sessions, GET /l/:code   → qr38.js
//   /api/brief (nye kort) og POST /api/brief/gift, nordlys-push kl. 20                         → brief38.js
//   cards/auroraNotify i /api/glimt/settings                                                     → cards38.js (+ glimt35.js)
//   AI-maskinen (server.hw, fit, recommend, tidsavbrudd) og /api/ai/routing?scope=finans        → aihw38.js (+ ai-api.js, ai-run.js)
//   /api/domains/overview?all=1                                                                  → domains-glimt.js
export { qrAuthApi, meSessionsApi, qrLinkHandler, preAuthTicket, qrAfter2fa, assetLinksHandler, appleAssociationHandler } from './qr38.js';
export { brief38Api } from './brief38.js';
import { startBrief38 } from './brief38.js';

export function startApi38() { startBrief38(); }
