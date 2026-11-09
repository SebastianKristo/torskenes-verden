// Prompt 77 (SKJAIWEB): innstillingene for Glimt i Skjold Lab.
// - Innstillinger → Moduler → Skjold Lab: «Finn bilder på nett» og «Foreslå automatisk når jeg tar bilde» (begge på som standard).
// - Samme brytere ligger bak ⚙ i Skjold Lab (skjold77-ai.js bruker loadSet77/saveSet77 herfra).
// Lagres per bruker på serveren: GET|PUT /api/skjold/ai/settings {webImages, autoSuggestOnPhoto}. Speiles i localStorage
// «sk77_set» = {uid, webImages, autoSuggestOnPhoto}, så bryterne tegnes riktig med en gang.
import { api, esc } from './util.js';
import { TAB_IC } from './settings-search.js';

export const SKJ77_IC = 'M4 4h16v6H4zM4 14h16v6H4zM10 7h4M10 17h4';
TAB_IC.skjold = ['#5b6b3a', SKJ77_IC]; // ikon: skuffeskap (oliven)
/** Fanen (settes inn i TABS i settings.js): [id, navn, undertekst, seksjon, ikon]. */
export const TABS77 = [['skjold', 'Skjold Lab', 'Glimt foreslår navn, kategori og bilder for delene', 'Moduler', SKJ77_IC]];
export const ALIAS77 = { skjoldlab: 'skjold', 'skjold-lab': 'skjold', deler: 'skjold', komponenter: 'skjold', skuffeskap: 'skjold' };
export const SET77_DEF = Object.freeze({ webImages: true, autoSuggestOnPhoto: true });
const KW = 'skjold lab deler komponenter skuffer glimt forslag foreslå navn kategori bilde bilder nett søk automatisk kamera rydd opp';
const ROWS = [
  ['webImages', 'Finn bilder på nett', 'Søk etter bilde av delen (SearXNG, ellers Wikimedia Commons). Bildene hentes via serveren.', 'nett bilder søk searxng commons finn bilde'],
  ['autoSuggestOnPhoto', 'Foreslå automatisk når jeg tar bilde', 'Glimt kjenner igjen delen og foreslår navn, kategori og specs. Ingenting endres før du godkjenner.', 'automatisk bilde kamera foreslå gjenkjenning'],
];

const st = { set: null, loading: null, at: 0, err: '', busy: false };
let rr = () => {};
const uid = () => { try { return localStorage.getItem('hl_uid') || ''; } catch { return ''; } };
function local() {
  try { const o = JSON.parse(localStorage.getItem('sk77_set') || 'null'); if (o && (!o.uid || String(o.uid) === uid())) return o; } catch { /* privat modus */ }
  return null;
}
function norm(o) {
  const l = local() ?? {};
  const pick = (k) => (typeof o?.[k] === 'boolean' ? o[k] : typeof l[k] === 'boolean' ? l[k] : SET77_DEF[k]);
  return { webImages: pick('webImages'), autoSuggestOnPhoto: pick('autoSuggestOnPhoto') };
}
function saveLocal(s) { try { localStorage.setItem('sk77_set', JSON.stringify({ uid: uid(), ...s })); } catch { /* privat modus */ } }

/** Innstillingene nå (serverens svar, ellers speilet, ellers standard). */
export const set77 = () => st.set ?? norm(null);
/** Henter fra serveren (maks hvert 30. sekund uten force). */
export function loadSet77(force = false) {
  if (st.loading) return st.loading;
  if (!force && st.set && Date.now() - st.at < 30_000) return Promise.resolve(st.set);
  st.loading = api('/skjold/ai/settings')
    .then((d) => { st.set = norm(d?.settings ?? d); st.err = ''; saveLocal(st.set); })
    .catch((e) => { st.set = norm(null); st.err = e.status === 404 ? 'missing' : e.message; })
    .finally(() => { st.loading = null; st.at = Date.now(); rr(); });
  return st.loading.then(() => st.set);
}
/** Lagrer én eller flere brytere. Optimistisk: endres med en gang, rulles tilbake ved feil. Kaster videre ved feil. */
export async function saveSet77(patch) {
  const prev = set77(), next = { ...prev, ...patch };
  st.set = next; saveLocal(next); rr();
  try {
    const r = await api('/skjold/ai/settings', { method: 'PUT', json: patch });
    st.set = norm(r?.settings ?? r ?? next); saveLocal(st.set); st.err = '';
  } catch (e) { st.set = prev; saveLocal(prev); st.err = e.message; rr(); throw e; }
  rr();
  return st.set;
}

/** Siden i Innstillinger. H = { group, row } fra settings.js. */
export function skjView77(H, rerender) {
  const { group, row } = H;
  if (rerender) rr = rerender;
  loadSet77();
  const s = set77();
  const g = group('Glimt i Skjold Lab', ROWS.map(([k, t, sub, kw]) => row({ t, s: sub, tog: s[k], act: `data-skj77-set="${k}"`, k: `${KW} ${kw}` })),
    st.err && st.err !== 'missing' ? `Fikk ikke lagret: ${esc(st.err)}` : st.err === 'missing' ? 'Serveren har ikke Skjold Lab-AI ennå. Bryterne lagres på denne enheten til den er oppdatert.' : '');
  const g2 = group('Rydd opp', [row({ t: 'Rydd opp med Glimt', s: 'Åpnes fra ⋯ i Skjold Lab. Ingenting endres før du godkjenner.', k: `${KW} rydd opp gjennomgang` })]);
  return { groups: [g, g2] };
}
/** Klikk i Innstillinger. true = håndtert. */
export async function clickSkj77(e, render) {
  if (render) rr = render;
  const b = e.target.closest('[data-skj77-set]');
  if (!b) return false;
  const k = b.dataset.skj77Set;
  try { await saveSet77({ [k]: !set77()[k] }); } catch { /* st.err vises */ }
  return true;
}
