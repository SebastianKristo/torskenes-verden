// Brukerskille i nettleseren (prompt 21): localStorage og sessionStorage deles av alle som logger inn på samme
// nettleser. Ved utlogging eller kontobytte tømmes alt som er brukerdata (kopier av serverdata, oppsett og historikk).
// Rene enhetsvalg beholdes: tema (hl_theme, fh_theme, fh_design, fh_compact, fh_ios_bg, fh_gate_bg), søkemodus, haptikk
// og det offentlige logoregisteret (fh_logoreg).
// Opplastingskøen i IndexedDB (fh-upload-queue) tømmes ikke: hvert element har userId, og bare eierens elementer sendes.
const USER_KEYS = ['hl_search_hist', 'fh_p17', 'fh_mlayout', 'fh_p15', 'fh_p16', 'fh_sub_done', 'fh_bol_meta', 'fh_wx_place', 'fh_trk_prefs', 'papir_fm_order', 'fh_ai_hist', 'hl_tabs52', 'papir_av_cache', 'glimt_lex'];
const USER_SESSION_KEYS = ['hl_dom_sel'];
const UID_KEY = 'hl_uid';

/** Tømmer alle brukerspesifikke cacher i nettleseren. */
export function clearUserCache() {
  try { for (const k of USER_KEYS) localStorage.removeItem(k); localStorage.removeItem(UID_KEY); } catch { /* privat modus */ }
  try { for (const k of USER_SESSION_KEYS) sessionStorage.removeItem(k); } catch { /* privat modus */ }
}

/** Kalles når vi vet hvem som er innlogget. Er det en annen enn sist, tømmes den forrige brukerens cacher. */
export function noteUser(id) {
  if (!id) return false;
  let prev = null;
  try { prev = localStorage.getItem(UID_KEY); } catch { return false; }
  if (prev === String(id)) return false;
  if (prev) clearUserCache();
  try { localStorage.setItem(UID_KEY, String(id)); } catch { /* privat modus */ }
  return !!prev;
}

/** Logger ut på serveren, tømmer cachene og går til innloggingen. */
export async function logout(next = '/login') {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  clearUserCache();
  location.href = next;
}
