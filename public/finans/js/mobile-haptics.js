// Haptisk tilbakemelding i PWA-en (prompt 11): Innstillinger → App → Haptikk.
// Nettleseren har bare navigator.vibrate (Android/Chrome). iOS Safari har ingen vibrasjon, så der skjer ingenting;
// de native appene bruker UIImpactFeedbackGenerator / performHapticFeedback via window.__fhHaptic når de setter den.
import { pref, setPref } from './mobile.js';

// Typer: tap (knapper), tab (faner og chips), ok (fullført), err (feil og advarsler), pkg (pakke-varsler), tick (sveip tilbake).
export const HAP_TYPES = [['hapTap', 'Trykk på knapper', 'tap'], ['hapTab', 'Faner og valg', 'tab'], ['hapOk', 'Fullført handling', 'ok'], ['hapErr', 'Feil og advarsler', 'err'], ['hapPkg', 'Pakke-varsler', 'pkg']];
const PREF_OF = { tap: 'hapTap', tick: 'hapTab', tab: 'hapTab', ok: 'hapOk', err: 'hapErr', pkg: 'hapPkg' };
// Mønstre i ms for «Middels». Lett og Kraftig skalerer varigheten.
const PAT = { tap: [8], tick: [5], tab: [6], ok: [10, 40, 16], err: [20, 50, 20, 50, 20], pkg: [14, 60, 14, 60, 30] };
const MUL = { light: 0.6, medium: 1, strong: 1.8 };
export const HAP_DEF = { hap: true, hapStr: 'medium', hapTap: true, hapTab: true, hapOk: true, hapErr: true, hapPkg: true };
export const hpref = (k) => pref(k) ?? HAP_DEF[k];
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let last = 0;
export function haptic(kind = 'tap', { force = false } = {}) {
  if (!force && (!hpref('hap') || !hpref(PREF_OF[kind] ?? 'hapTap'))) return;
  const now = Date.now();
  if (!force && kind !== 'tick' && now - last < 35) return; // ett trykk gir ikke dobbel vibrasjon (pointerdown + klikk)
  last = now;
  const str = hpref('hapStr');
  // Native skall (Capacitor/WKWebView) kan sette en egen bro; ellers vibrate.
  if (typeof window.__fhNativeHaptic === 'function') { try { window.__fhNativeHaptic(kind, str); return; } catch {} }
  if (!canVibrate()) return;
  const m = MUL[str] ?? 1;
  try { navigator.vibrate((PAT[kind] ?? PAT.tap).map((v, i) => (i % 2 ? v : Math.max(1, Math.round(v * m))))); } catch {}
}
export const setHap = (k, v) => setPref(k, v);
// Designprototypene kaller window.__fhHaptic(k); samme navn her, så koden kan deles.
if (typeof window !== 'undefined') window.__fhHaptic = (k) => haptic(k);
