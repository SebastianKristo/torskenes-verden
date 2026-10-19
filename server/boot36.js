// Prompt 36: oppstartsstatus for «Starter opp»-siden (public/starting.html) og appene.
// GET /api/health (index.js) svarer {ready, version, steps:[{id, label, status:'wait'|'run'|'ok', ms}], startedAt, uptimeMs}.
// Stegene skrives mens serveren starter: db (db.js lastet), migrate (alle moduler og migreringer lastet), api (HTTP-serveren
// lytter), ai (Ollama/AI-motoren svarer eller er ikke satt opp) og integrations (integrasjonene er lastet). ready = alle ok.
// Status speiles til DATA_DIR/update/boot.json, så updateren/proxyen kan lese den mens appen ikke svarer.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BOOT_STEPS = [
  ['db', 'Starter databasen'],
  ['migrate', 'Kjører migrasjoner'],
  ['api', 'Starter web og API'],
  ['ai', 'Vekker Glimt og AI-modellene'],
  ['integrations', 'Kobler til integrasjoner'],
];
const T0 = Math.round(performance.timeOrigin || Date.now());
const steps = new Map(BOOT_STEPS.map(([id, label]) => [id, { id, label, status: 'wait', ms: null, at: null }]));
let version = null;

function changelogVersion() {
  try {
    const m = readFileSync(resolve(process.env.CHANGELOG_PATH || 'CHANGELOG.md'), 'utf8').match(/^##\s*\[?\s*v?(\d+\.\d+\.\d+)/im);
    return m ? m[1] : null;
  } catch { return null; }
}

function mirror() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const dir = join(resolve(process.env.DATA_DIR || './data'), 'update');
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, '.boot.json.tmp');
    writeFileSync(tmp, JSON.stringify(bootState()));
    renameSync(tmp, join(dir, 'boot.json'));
  } catch { /* bare speiling */ }
}

/** Setter et steg til 'run' eller 'ok'. ms = tid fra steget startet (eller fra prosessstart) til ok. */
export function bootStep(id, status = 'ok', now = Date.now()) {
  const s = steps.get(id);
  if (!s || !['wait', 'run', 'ok'].includes(status)) return;
  if (status === 'run' && s.status === 'wait') { s.status = 'run'; s.at = now; }
  else if (status === 'ok' && s.status !== 'ok') {
    // Et steg starter når det forrige ble ferdig (eller ved prosessstart).
    const prev = [...steps.values()].filter((x) => x.status === 'ok' && x.done).map((x) => x.done);
    const from = s.at ?? (prev.length ? Math.max(...prev) : T0);
    s.status = 'ok'; s.ms = Math.max(0, now - from); s.done = now;
    const next = BOOT_STEPS.map(([k]) => steps.get(k)).find((x) => x.status === 'wait');
    if (next && id !== 'ai' && id !== 'integrations') { next.status = 'run'; next.at = now; }
  } else if (status === 'wait') { s.status = 'wait'; s.ms = null; s.at = null; s.done = null; }
  mirror();
}

/** {ready, version, steps, startedAt, uptimeMs} */
export function bootState(now = Date.now()) {
  version ??= changelogVersion();
  const list = BOOT_STEPS.map(([id]) => { const s = steps.get(id); return { id, label: s.label, status: s.status, ms: s.ms }; });
  return { ready: list.every((s) => s.status === 'ok'), version, steps: list, startedAt: new Date(T0).toISOString(), uptimeMs: now - T0 };
}
export const bootReady = () => bootState().ready;

/** Bare for tester. */
export const _resetBoot = () => { for (const s of steps.values()) Object.assign(s, { status: 'wait', ms: null, at: null, done: null }); };

/**
 * Etter at HTTP-serveren lytter: AI og integrasjoner sjekkes i bakgrunnen, med tidsgrense, så siden aldri blir stående.
 * aiCheck/intCheck: async () => noe (feil teller som ferdig – serveren er oppe uansett).
 */
export async function bootFinish({ aiCheck = null, intCheck = null, timeoutMs = 5000 } = {}) {
  const lim = (p) => Promise.race([Promise.resolve().then(p).catch(() => null), new Promise((r) => setTimeout(r, timeoutMs).unref?.())]);
  bootStep('ai', 'run');
  bootStep('integrations', 'run');
  await Promise.all([
    lim(aiCheck ?? (() => null)).then(() => bootStep('ai', 'ok')),
    lim(intCheck ?? (() => null)).then(() => bootStep('integrations', 'ok')),
  ]);
  return bootState();
}

// Databasen er første steg: den starter når prosessen starter.
bootStep('db', 'run', T0);
