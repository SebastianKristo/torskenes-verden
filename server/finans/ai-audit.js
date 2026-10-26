// Prompt 27: AI-logg for personvern. Hver gang noe sendes til en sky-motor (Gemini/Groq) eller Wikidata (prompt 69) for logo-oppslag eller Chat,
// lagres tid, motor, formål og nøyaktig hvilke felt som ble sendt. Brukeren ser sine egne rader i Innstillinger
// (GET /finans/api/ai-audit). Tabellen er ny (CREATE IF NOT EXISTS); ingenting slettes utover de eldste radene per bruker.
import { db, me } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS ai_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, ts INTEGER NOT NULL, engine TEXT NOT NULL, purpose TEXT NOT NULL, fields_sent TEXT NOT NULL DEFAULT '{}')`);
db.exec('CREATE INDEX IF NOT EXISTS ai_audit_user ON ai_audit(user_id, id)');

const ins = db.prepare('INSERT INTO ai_audit(user_id, ts, engine, purpose, fields_sent) VALUES(?,?,?,?,?)');
let n = 0;
/** Logger et kall. fields = objektet (eller listen) med det som faktisk ble sendt. */
export function audit(engine, purpose, fields, u = me()) {
  try {
    ins.run(u, Date.now(), String(engine).slice(0, 40), String(purpose).slice(0, 40), JSON.stringify(fields ?? {}).slice(0, 4000));
    if (++n % 100 === 0) db.prepare('DELETE FROM ai_audit WHERE user_id=? AND id <= (SELECT max(id) - 1000 FROM ai_audit WHERE user_id=?)').run(u, u);
  } catch (e) { console.warn('[ai-audit]', e.message); }
}

const PURPOSE = { logo: 'Finn logo', chat: 'Chat', subscreenshot: 'Abonnement fra skjermbilde' };
const ENGINE = { gemini: 'Gemini', groq: 'Groq', openwebui: 'Open WebUI', wikidata: 'Wikidata' };
/** Brukerens egne rader, nyeste først: [{id, ts, at, engine, engineName, purpose, purposeName, fieldsSent, fields}]. */
export function auditList(u = me(), limit = 100) {
  return db.prepare('SELECT * FROM ai_audit WHERE user_id=? ORDER BY id DESC LIMIT ?').all(u, Math.min(500, Math.max(1, limit))).map((r) => {
    let sent = {};
    try { sent = JSON.parse(r.fields_sent); } catch { /* ugyldig */ }
    return { id: r.id, ts: r.ts, at: new Date(r.ts).toISOString(), engine: r.engine, engineName: ENGINE[r.engine] ?? r.engine, purpose: r.purpose, purposeName: PURPOSE[r.purpose] ?? r.purpose,
      fieldsSent: sent, fields: Array.isArray(sent) ? sent : Object.keys(sent ?? {}) };
  });
}
