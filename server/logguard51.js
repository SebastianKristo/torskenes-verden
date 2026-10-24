// Prompt 51 (SEC51): vakt mot nøkler i loggene.
// 1. console.log/info/warn/error/debug formateres som før (util.format), men kjente hemmeligheter (verdiene fra sec51-inventaret:
//    API-nøkler, SESSION_SECRET …) og app-tokens (fh_pat_…, hlr_…, hdt_…) byttes ut med «••••» før linjen skrives.
// 2. De siste linjene (etter maskering) ligger i en ringbuffer i minnet, som logg-skanneren i sec51.js sjekker.
// Andre moduler kan melde inn egne ringbuffere med registerRing51(navn, () => [tekst | objekt]) – skanneren leser dem også.
import { format } from 'node:util';

const RING_MAX = 1500;
const ring = [];
const rings = new Map(); // navn → () => array
let provider = null, values = [], valuesAt = 0, refreshing = false;
const REFRESH_MS = 10 * 60_000;

// Tokens vi lager selv, og som aldri skal stå i klartekst i en logg.
export const TOKEN_PATTERNS51 = [
  [/\bfh_pat_[A-Za-z0-9_-]{16,}/g, 'fh_pat_••••'],
  [/\bhlr_[A-Za-z0-9_-]{30,}/g, 'hlr_••••'],
  [/\bhdt_[A-Za-z0-9_-]{20,}/g, 'hdt_••••'],
];

/** fn() → [{label, value}] – kjente hemmeligheter (settes av sec51.js). */
export function setSecretProvider51(fn) { provider = fn; valuesAt = 0; }
export const _refreshNow51 = () => { valuesAt = 0; refresh(); };
function refresh() {
  if (!provider || refreshing || Date.now() - valuesAt < REFRESH_MS) return;
  refreshing = true;
  try {
    values = [...new Set((provider() ?? []).map((x) => String(x?.value ?? '')).filter((v) => v.length >= 12))].sort((a, b) => b.length - a.length);
  } catch { /* beholder forrige liste */ }
  valuesAt = Date.now();
  refreshing = false;
}

/** Fjerner kjente hemmeligheter og egne tokens fra en tekst. */
export function redact51(text) {
  let s = String(text ?? '');
  if (!s) return s;
  refresh();
  for (const v of values) if (s.includes(v)) s = s.split(v).join('••••');
  for (const [re, to] of TOKEN_PATTERNS51) s = s.replace(re, to);
  return s;
}

export function registerRing51(name, fn) { if (typeof fn === 'function') rings.set(String(name).slice(0, 40), fn); }
/** [{name, lines:[tekst]}] – egen ringbuffer og de som er meldt inn. */
export function ringsOf51() {
  const out = [{ name: 'Serverens egen logg (minne)', lines: ring.map((r) => r.line) }];
  for (const [name, fn] of rings) {
    let list = [];
    try { list = fn() ?? []; } catch { list = []; }
    out.push({ name, lines: (Array.isArray(list) ? list : []).slice(-5000).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) });
  }
  return out;
}
export const ownRing51 = () => ring.slice();

let installed = false;
/** Pakker inn console-metodene (én gang). */
export function installLogGuard51() {
  if (installed || globalThis.__logGuard51) return;
  installed = true; globalThis.__logGuard51 = true;
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[m].bind(console);
    console[m] = (...args) => {
      let line;
      try { line = redact51(format(...args)); } catch { return orig(...args); }
      ring.push({ at: Date.now(), lv: m, line: line.slice(0, 2000) });
      if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
      return orig(line);
    };
  }
}
