// Innstillinger → AI og Glimt-delen av Innstillinger → Glimt (prompt 65, prompt 50b «samle innstillingene»).
// AI-siden er nå bare AI-kontrollen (ai-control.js) med horisontale faner: Oversikt · Modeller · Oppgaver · Kvitteringer ·
// Tjenester · Jobber · Forbruk. Det som før lå som løse grupper under den, er flyttet (ingenting er fjernet):
//   - «Chat» (La Chat lese mine data, Spør før sky-modeller, standardmodell) og AI-logg → AI → Oppgaver → Regler
//   - «Personvern og logoer» (Les kvitteringer lokalt, Finn logo med Gemini, Sjekk logoen) → AI → Kvitteringer
//   - «Open WebUI · serveroppsett» → AI → Tjenester → Open WebUI (samme lagring: openwebui_url/openwebui_key)
//   - «Glimt i søkefeltet», «Glimt husker» (+ forslag/motstrid), Entitetsregister og «Glimt lærer» → Innstillinger → Glimt
//     (glimtAiView: ai-control med only:'glimt', sammen med Personlighet og nettsøk-rekkefølgen)
// Tilstanden og hendelsene for disse ligger i ai-glimt65.js (samme API-er og lagrede felt som før).
import { store } from './store.js';
import { mountAiControl, aiTabKey65 } from './ai-control.js';
import { is2c } from './hltheme.js';
import { load65 } from './ai-glimt65.js';

const isAdmin = () => store.me?.me?.role === 'admin';
const theme = () => ((document.documentElement.dataset.hlTheme ? document.documentElement.dataset.hlTheme === '2c' : is2c()) ? 'papir' : 'mork');
const variant = () => (matchMedia('(max-width: 767px)').matches ? 'mobile' : 'web');

/** Laster Glimt/Chat-dataene (begge sidene). reload kalles når de er klare. */
export async function loadAi(reload, force = false) {
  await load65(force).catch(() => {});
  reload?.();
}

// Fanen huskes mens innstillingene er åpne; settings-search kan be om en bestemt fane (gamle nøkler mappes: rt → task, api/imp → svc).
let acTab = null;
export function setAiTab(t) { acTab = aiTabKey65(t) || null; }
const acMount = (el) => mountAiControl(el, { variant: variant(), scope: 'alle', theme: theme(), tab: acTab ?? undefined, admin: isAdmin(), embedded: true, onTab: (t) => { acTab = t; }, onPaint: () => document.dispatchEvent(new Event('hl:reapply')),
  // Prompt 39: statuslinjen («5 lokale modeller · 5 i skyen · 2 jobber kjører») står i undertittelen til Innstillinger-toppen.
  onStatus: (st) => { const el = document.querySelector('#settings .set-ps'); if (el && st && document.getElementById('set-title')?.textContent === 'AI' && el.textContent !== st) el.textContent = st; } });

export function aiView() {
  const pre = '<div class="set-aictl" data-mount-host data-hl="ai-mod"></div>';
  return { pre, mount: (slot) => acMount(slot), groups: [] };
}

/** Innstillinger → Glimt: Personlighet, Send til Chat etter, Nettsøk, Glimt husker, Entitetsregister og Glimt lærer (ingen faner, ingen tittel). */
export function glimtAiView() {
  const html = '<div class="set-aiglimt" data-mount-host="aiglimt" data-ai-glimt65 data-hl="glimt-ai65"></div>';
  const mount = (slot) => mountAiControl(slot, { variant: variant(), scope: 'alle', theme: theme(), admin: isAdmin(), only: 'glimt', embedded: true, onPaint: () => document.dispatchEvent(new Event('hl:reapply')) });
  return { html, pre: html, mount, groups: [] };
}
export const aiGlimtView = glimtAiView;

// Hendelsene ligger nå i ai-control.js og ai-glimt65.js (document-lyttere). Beholdt så settings.js kan kalle dem som før.
export async function aiClick() { return false; }
export async function aiChange() { return false; }
export async function aiSubmit() { return false; }
