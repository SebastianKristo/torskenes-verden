// Prompt 30: AI-søk i web-innstillingene (fasit «Innstillinger Web.dc.html»).
// - Indeksen over alle innstillingssidene hentes fra GET /api/settings/index ({id, title, path, keywords[], description,
//   route:{web, mobile}}). Mangler API-et (eldre server), brukes en innebygd indeks med de samme sidene.
// - Vanlig skriving gir treffliste (ikon + navn + sti). ✦ AI på, eller tekst med mellomrom/spørsmålstegn + Enter:
//   POST /api/settings/ask {q} → {answer, targetId}. Bare spørsmålet sendes (serveren legger ved indeksen, aldri brukerdata).
//   Feiler kallet, svarer en enkel nøkkelordmatch lokalt.
import { glimt } from './glimt.js';
import { api, esc } from './util.js';

/** Fargede ikoner per side (samme farger som mobilens Innstillinger-liste). [nøkkel i settings.js, farge, sti] */
export const TAB_IC = {
  konto: ['#2b5d8a', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
  look: ['#7a5ad6', 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5h2a4.5 4.5 0 0 0 4.5-4.5C21 6.6 17 3 12 3zM7.5 11.5h.01M10.5 7.5h.01M15 7.5h.01'],
  top: ['#3f7a6e', 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6'],
  dom: ['#c0562a', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'],
  varsel: ['#b23a2a', 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8zM10 20a2 2 0 0 0 4 0'],
  app: ['#5b6470', 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2'],
  int: ['#4a5bbf', 'M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5'],
  kal: ['#2f7d4f', 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4'],
  ai: ['#7a3b6b', 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  users: ['#a8661a', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 6'],
  login: ['#1f6f78', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  system: ['#6b6558', 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01'],
  backup: ['#2f6b45', 'M12 3a9 9 0 1 1-8.5 6M3 4v5h5M12 8v4l3 2'],
};
export const icBox = (k, size = 30, icon = 16) => {
  const [c, d] = TAB_IC[k] ?? TAB_IC.app;
  return `<span class="set-ic" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px;background:${c}" aria-hidden="true"><svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`;
};

// Innebygd indeks (brukes når serveren ikke har /api/settings/index). route.web = «fane/underside» i web-innstillingene.
const LOCAL = [
  ['bakgrunn', 'Bakgrunn på forsiden', 'Utseende → Bakgrunn', 'look/bg', 'bilde foto planeter oslo vær uskarphet mørklegging'],
  ['tema', 'Mørkt og lyst tema', 'Utseende → Tema', 'look', 'tema papir vindu mørk lys farger'],
  ['sokebar', 'Søkebar', 'Utseende → Søkebar', 'look', 'søk google historikk stil'],
  ['kategorier', 'Kategorier for kvitteringer', 'Utseende → Kvitteringer', 'look/cats', 'kategori farge kvittering'],
  ['widgets', 'Widgets på forsiden', 'Startside → Forsiden', 'top/dash', 'widget kort rekkefølge forside dashboard'],
  ['faner', 'Faner i menyen', 'Startside → Faner', 'top/tabs', 'fane meny rekkefølge skjul'],
  ['nyhetslinje', 'Nyhetslinje', 'Startside → Nyhetsbar', 'top/speed', 'nyheter ticker fart hastighet'],
  ['snarveier', 'Snarveier', 'Startside → Snarveier', 'top/sc', 'lenker snarvei'],
  ['domener', 'Legg til domene', 'Domener', 'dom', 'domene cloudflare token statistikk plausible umami'],
  ['cloudflare', 'Cloudflare API-token', 'Domener → Legg til domene', 'dom', 'token api cloudflare tillatelser'],
  ['varsler', 'Push-varsler', 'Varsler', 'varsel', 'push varsel lyd'],
  ['stille', 'Stille timer', 'Varsler → Stille timer', 'varsel', 'natt stille forstyrr'],
  ['appnavn', 'Navn og ikon på appen', 'App', 'app', 'app ikon navn'],
  ['sprak', 'Språk', 'Profilmenyen → Språk', 'app', 'språk engelsk english norsk'],
  ['integrasjoner', 'API-nøkler', 'Integrasjoner', 'int', 'nøkkel api token tjeneste sonarr radarr ruter home assistant'],
  ['kalendere', 'Google Kalender', 'Kalendere → Google', 'kal', 'google kalender ical canvas skole timeplan'],
  ['ai', 'Lokal modell (Ollama) og Gemini', 'AI → Modeller', 'ai', 'ollama gemini groq modell chat personvern'],
  ['brukere', 'Inviter bruker', 'Brukere → Legg til', 'users/add', 'bruker rolle tilgang ny'],
  ['passord', 'Bytt passord', 'Konto → Passord', 'konto/pw', 'passord endre bytt'],
  ['profilbilde', 'Profilbilde og navn', 'Konto → Profil', 'konto/me', 'bilde avatar navn profil'],
  ['2fa', 'Totrinnsbekreftelse', 'Konto → Innlogging → 2FA', 'konto/tfa', '2fa totp kode tofaktor sikkerhet'],
  ['enheter', 'Pålitelige enheter', 'Konto → Innlogging', 'konto/devices', 'enhet lokalt nett lan'],
  // Prompt 32: «oppdatering», «versjon», «update» treffer Nordlys OS (den gamle Oppdatering-raden er borte).
  ['oppdatering', 'Nordlys OS', 'System → Nordlys OS', 'system', 'oppdatering oppdater versjon update build installert ny programvare rollback gjenopprett nordlys'],
  ['backup', 'Automatisk backup', 'Backup → Automatisk', 'backup', 'backup sikkerhetskopi gjenopprett nas smb'],
].map(([id, title, path, web, kw]) => ({ id, title, path, keywords: kw.split(' '), description: '', route: { web } }));

const X = { index: null, loading: null, ai: false, askQ: '', busy: false, ans: null, ctl: null };
export const SQ = X;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');

/** Henter indeksen én gang. Kaller redraw når den er klar. */
export function loadIndex(redraw) {
  if (X.index || X.loading) return;
  X.loading = api('/settings/index').then((r) => {
    const list = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : null;
    X.index = list?.length ? list : LOCAL;
  }).catch(() => { X.index = LOCAL; }).finally(() => { X.loading = null; redraw?.(); });
}
const index = () => X.index ?? LOCAL;

/** «#/innstillinger/look/bg», «/innstillinger/utseende» eller «look|bg» → { tab, sub }. */
export function routeOf(item) {
  let r = String(item?.route?.web ?? item?.route ?? '').trim();
  r = r.replace(/^[#/]+/, '').replace(/^\/?#?\/?/, '').replace(/^innstillinger\/?/, '').replace(/\|/g, '/');
  const [tab, sub] = r.split('/').filter(Boolean);
  return { tab: tab || 'konto', sub: sub || null };
}

/** Treff for vanlig søk: ord som matcher tittel, sti eller nøkkelord (uavhengig av aksenter). */
const STOP = new Set(['hvor', 'hva', 'hvordan', 'jeg', 'kan', 'man', 'det', 'den', 'er', 'en', 'et', 'pa', 'til', 'for', 'med', 'og', 'av', 'min', 'mitt', 'mine', 'meg', 'vil', 'skal', 'finner', 'endre', 'bytte', 'bytter', 'the', 'how', 'where', 'do', 'can', 'my']);
export function hits(q) {
  const words = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];
  const scored = index().map((it) => {
    const t = norm(it.title), p = norm(it.path), kw = (it.keywords ?? []).map(norm), d = norm(it.description);
    let s = 0;
    for (const w of words) {
      if (t.includes(w)) s += 3; if (p.includes(w)) s += 2;
      if (kw.some((k) => k.startsWith(w) || (k.length > 2 && w.startsWith(k)))) s += 2;
      if (d.includes(w)) s += 1;
    }
    return [s, it];
  }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 8).map(([, it]) => it);
}

export const wantsAi = (q) => X.ai || /\s/.test(q.trim()) || /\?\s*$/.test(q);

/** Spør serveren (lokal modell først). Reserve: beste nøkkelordtreff. */
export async function ask(q, redraw) {
  X.askQ = q; X.busy = true; X.ans = null; redraw();
  X.ctl?.abort(); const ctl = new AbortController(); X.ctl = ctl;
  let ans = null;
  try {
    const r = await api('/settings/ask', { method: 'POST', json: { q }, signal: ctl.signal });
    if (r && (r.answer || r.targetId)) ans = { answer: String(r.answer ?? ''), target: index().find((x) => x.id === r.targetId) ?? null };
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!ans) {
    const top = hits(q)[0];
    ans = top ? { answer: `Det finner du under ${top.path}.${routeOf(top).tab === 'dom' ? ' Trykk på ? ved API-token for en steg-for-steg-guide.' : ' Trykk under for å gå rett dit.'}`, target: top }
      : { answer: `Jeg fant ikke en innstilling som passer «${q}». Prøv å beskrive hva du vil endre.`, target: null };
  }
  if (X.ctl !== ctl || X.askQ !== q) return;
  X.busy = false; X.ans = ans; redraw();
}
export function resetAsk() { X.ctl?.abort(); X.askQ = ''; X.busy = false; X.ans = null; }

/** Sidepanelet under søkefeltet: AI-svar-kort og treffliste. tabName(k) gir sidenavnet til «Åpne … ›». */
export function sideResults(q, tabName) {
  const qq = q.trim();
  if (!qq) return '';
  const showAi = X.askQ && X.askQ === qq;
  const list = hits(qq);
  // Prompt 31: Glimt-merket (Tenker mens den leter, Ferdig med svaret).
  const ai = showAi ? `<div class="set-aians" role="status" aria-live="polite"><span class="set-cap">${glimt(18, X.busy ? 'tenker' : 'klar')}GLIMT · SVAR</span>${X.busy ? '<span class="set-aibusy">Leter i innstillingene …</span>'
    : `<span class="set-aitxt">${esc(X.ans?.answer ?? '')}</span>${X.ans?.target ? `<button type="button" class="set-aigo" data-setgo="${esc(X.ans.target.id)}">Åpne ${esc(tabName(routeOf(X.ans.target).tab))} ›</button>` : ''}`}</div>` : '';
  const hl = list.length ? `<div class="set-hits"><span class="set-cap">TREFF</span>${list.map((h) => `<button type="button" class="set-hit" data-setgo="${esc(h.id)}">${icBox(routeOf(h).tab, 28, 15)}<span class="set-hit-t"><b>${esc(h.title)}</b><span>${esc(h.path)}</span></span></button>`).join('')}</div>`
    : showAi ? '' : '<span class="set-nohit">Ingen treff. Slå på ✦ AI og spør med egne ord.</span>';
  return ai + hl;
}
export const byId = (id) => index().find((x) => x.id === id);
export const topHit = (q) => hits(q)[0] ?? null;
