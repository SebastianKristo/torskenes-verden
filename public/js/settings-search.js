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
  glimt: ['#b23a2a', 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z'],
  familie: ['#2f7a4f', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'], // prompt 42
  backup: ['#2f6b45', 'M12 3a9 9 0 1 1-8.5 6M3 4v5h5M12 8v4l3 2'],
  logger: ['#3d4a5c', 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5'], // prompt 44
  huske: ['#a0671a', 'M5 6h2M5 12h2M5 18h2M10 6h9M10 12h9M10 18h9'], // prompt 44
  sikkerhet: ['#1f6f78', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4'], // prompt 51 (SEC51)
};
export const icBox = (k, size = 30, icon = 16) => {
  const [c, d] = TAB_IC[k] ?? TAB_IC.app;
  return `<span class="set-ic" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px;background:${c}" aria-hidden="true"><svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`;
};

// Innebygd indeks (brukes når serveren ikke har /api/settings/index). route.web = «fane/underside» i web-innstillingene.
const LOCAL = [
  ['bakgrunn', 'Bakgrunn på forsiden', 'Utseende → Bakgrunn', 'look', 'bakgrunn bilde foto planeter oslo vær uskarphet mørklegging', 'bg'],
  ['tema', 'Mørkt og lyst tema', 'Utseende → Tema', 'look', 'tema papir vindu mørk lys farger', 'theme'],
  ['sokebar', 'Søkebar', 'Utseende → Søkebar', 'look', 'søk google historikk stil'],
  ['kategorier', 'Kategorier for kvitteringer', 'Utseende → Kvitteringer', 'look/cats', 'kategori farge kvittering'],
  ['widgets', 'Widgets på forsiden', 'Startside → Forsiden', 'top/dash', 'widget kort rekkefølge forside dashboard'],
  ['faner', 'Faner i menyen', 'Startside → Faner', 'top/tabs', 'fane meny rekkefølge skjul'],
  ['nyhetslinje', 'Nyhetslinje', 'Startside → Nyhetsbar', 'top/speed', 'nyheter ticker fart hastighet'],
  ['snarveier', 'Snarveier', 'Startside → Snarveier', 'top/sc', 'lenker snarvei'],
  ['domener', 'Legg til domene', 'Domener', 'dom', 'domene cloudflare token statistikk plausible umami'],
  ['cloudflare', 'Cloudflare API-token', 'Domener → Legg til domene', 'dom', 'token api cloudflare tillatelser'],
  ['varsler', 'Push-varsler', 'Varsler → Push', 'varsel', 'push varsel varsler lyd', 'push'],
  ['stille', 'Stille timer', 'Varsler → Stille timer', 'varsel', 'natt stille forstyrr', 'quiet'],
  ['appnavn', 'Navn og ikon på appen', 'App', 'app', 'app ikon navn'],
  ['sprak', 'Språk', 'Profilmenyen → Språk', 'app', 'språk engelsk english norsk'],
  ['integrasjoner', 'API-nøkler', 'Integrasjoner', 'int', 'nøkkel api token tjeneste sonarr radarr ruter home assistant'],
  ['kalendere', 'Google Kalender', 'Kalendere → Google', 'kal', 'google kalender ical canvas skole timeplan'],
  ['ai', 'Modeller (Ollama)', 'AI → Modeller', 'ai', 'ollama modell modeller laste ned lokal chat ai-kontroll vram', 'ai-mod'],
  ['ai-gemini', 'Gemini-nøkkel', 'AI → API og nøkler → Gemini', 'ai', 'gemini groq nøkkel api-nøkkel openrouter roboflow nasa', 'ai-key-gemini'],
  ['brukere', 'Inviter bruker', 'Brukere → Legg til', 'users', 'bruker rolle tilgang ny inviter', 'invite'],
  ['passord', 'Bytt passord', 'Konto → Passord', 'konto/pw', 'passord endre bytt'],
  ['profilbilde', 'Profilbilde og navn', 'Konto → Profil', 'konto/me', 'bilde avatar navn profil'],
  ['2fa', 'Totrinnsbekreftelse', 'Konto → Innlogging → 2FA', 'konto', '2fa totp kode tofaktor sikkerhet totrinn', '2fa'],
  ['enheter', 'Pålitelige enheter', 'Konto → Innlogging', 'konto/devices', 'enhet lokalt nett lan'],
  // Prompt 34 (claude-code-innst-ai-sok-highlight.md): mål-id per handling, så søket tar deg til knappen og markerer den.
  ['upd', 'Oppdater Homelab', 'System → Oppdater nå', 'system', 'oppdater oppdatere update nordlys installer', 'upd'],
  ['chk', 'Se etter oppdatering', 'System → Se etter oppdatering', 'system', 'oppdatering versjon sjekk ny build programvare', 'chk'],
  ['pw', 'Krev passord for å oppdatere', 'System → Krev passord', 'system', 'krev passord oppdater sikkerhet', 'pw'],
  ['logg44', 'Logger', 'Server → Logger', 'logger', 'logg logger log docker feil feilsøking container'],
  ['rb44', 'Tidligere versjoner', 'System → Tidligere versjoner', 'system', 'tilbake rull tilbake rollback tidligere versjon installer eldre'],
  ['lm44', 'Lys og mørk', 'Utseende → Lys og mørk', 'look', 'lys mørk mørkt dark light system følg systemet'],
  ['hk44', 'Synk med Home Assistant', 'Gjøremål → Synk', 'huske', 'gjøremål huskeliste synk home assistant todo'],
  ['ow44', 'Overfør eierskap', 'Brukere → Server · eier', 'users', 'eier overfør eierskap owner'],
  ['as44', 'Logg inn som', 'Brukere → Familie · logg inn som', 'users', 'logg inn som impersonering rediger oppsett familie'],
  ['backup', 'Automatisk backup', 'Backup → Automatisk', 'backup', 'backup sikkerhetskopi automatisk gjenopprett nas smb', 'bk-auto'],
  // Prompt 35: GLIMT → Glimt (figur, brief, stemme og venner).
  ['glimt', 'Glimt', 'Glimt', 'glimt', 'glimt brief morgenbrief kveldsbrief dagsbrief nattbrief venner guide', 'glimt'],
  ['glimt-figur', 'Glimt-figur', 'Glimt → Glimt-figur', 'glimt', 'figur figurer karakter maskot gris ugle sky dråpe stjerne spire halo boble blekksprut', 'glimt-fig'],
  ['glimt-stemme', 'Stemme og opplesning', 'Glimt → Stemmemotor', 'glimt', 'stemme stemmer opplesning les opp tts tale openai elevenlabs azure engelsk tempo', 'glimt-voice'],
  ['backup-now', 'Ta backup nå', 'Backup → Ta backup nå', 'backup', 'backup nå manuell kjør start', 'bk-now'],
  ['faste-oppgaver', 'Faste oppgaver', 'Glimt → Faste oppgaver', 'faste-oppgaver', 'faste oppgaver planlagte planlagt påminnelse minn meg strømpris varsel betinget hver morgen kjør nå pause prisområde'], // prompt 62
].map(([id, title, path, web, kw, anchor]) => ({ id, title, path, keywords: kw.split(' '), description: '', route: { web }, ...(anchor ? { anchor } : {}) }));

/** Mål-id → velger når elementet ikke har data-hl selv (eller fanen i AI-kontroll som må åpnes først). */
export const ANCHORS = {
  upd: { sel: '[data-hl="upd"],.ny-act .ny-btn', tip: '✦ Trykk her for å oppdatere' }, chk: { sel: '[data-upd="check"]' }, pw: { sel: '[data-upd-set="require_password"]' },
  theme: { sel: '.sg-theme .sg-box' }, bg: { title: /^Bakgrunnsbilde$/ }, push: { title: /^Varsler på denne enheten$/ }, quiet: { title: /^Stille timer$/ }, '2fa': { title: /^Totrinnsbekreftelse$/ },
  'bk-auto': { title: /^(Backup|Automatisk backup)$/ }, 'bk-now': { title: /^Ta backup nå$/, sel: '[data-bk="run"]' }, invite: { title: /^Ny bruker$/ },
  glimt: { sel: '[data-gs] .gs-list' }, 'glimt-fig': { sel: '[data-gs] .gs-figs' }, 'glimt-voice': { sel: '[data-gs] .gs-opts' },
  'cf-token': { sel: '.cfg-tokrow' }, 'ai-mod': { sel: '.set-aictl', acTab: 'mod' }, 'ai-key-gemini': { sel: '[data-ac-key="gemini"]', up: '.ac-card', acTab: 'api' },
};

const X = { index: null, loading: null, ai: false, askQ: '', busy: false, ans: null, ctl: null };
export const SQ = X;
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');

/** Henter indeksen én gang. Kaller redraw når den er klar. */
export function loadIndex(redraw) {
  if (X.index || X.loading) return;
  X.loading = api('/settings/index').then((r) => {
    const list = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : null;
    if (list?.length) {
      // Mål-id fra den innebygde indeksen når serveren ikke har dem, og mål som serveren mangler helt.
      const loc = new Map(LOCAL.map((x) => [x.id, x])), has = new Set(list.map((x) => x.anchor).filter(Boolean));
      X.index = [...list.map((x) => (x.anchor || !loc.get(x.id)?.anchor ? x : { ...x, anchor: loc.get(x.id).anchor })), ...LOCAL.filter((x) => x.anchor && !has.has(x.anchor) && !list.some((y) => y.id === x.id))];
    } else X.index = LOCAL;
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
export function hits(q, list = index(), scores = false) {
  const words = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];
  const scored = list.map((it) => {
    const t = norm(it.title), p = norm(it.path), kw = (it.keywords ?? []).map(norm), d = norm(it.description);
    // Poengsum (prompt 34): helt ord = 3, prefiks (begge veier) = 2, treff i tittel/sti/beskrivelse = 1.
    let s = 0;
    for (const w of words) {
      if (kw.includes(w) || t.split(/[^a-z0-9]+/).includes(w)) s += 3;
      else if (kw.some((k) => (k.length > 3 && w.startsWith(k)) || (w.length > 2 && k.startsWith(w)))) s += 2;
      if (t.includes(w)) s += 1; if (p.includes(w)) s += 1; if (d.includes(w)) s += 1;
    }
    return [s, it];
  }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 8).map(([sc, it]) => (scores ? { s: sc, it } : it));
}

export const wantsAi = (q) => X.ai || /\s/.test(q.trim()) || /\?\s*$/.test(q);

/** Spør serveren (lokal modell først). Reserve: beste nøkkelordtreff. */
const ANS = {
  upd: 'Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter. Jeg tar deg dit og viser knappen …',
  chk: 'Trykk «Se etter oppdatering» i System, så sjekker serveren om det finnes en ny NordlysOS-versjon. Jeg viser deg knappen …',
  pw: 'Bryteren «Krev passord for å oppdatere» ligger i System. Jeg tar deg dit …',
};
export const anchorOf = (it) => it?.anchor ?? null;
/** Siden der målet ligger (den innebygde indeksen vet hvor knappen faktisk er, f.eks. Konto-listen for 2FA-raden). */
export const routeForAnchor = (a) => { const it = LOCAL.find((x) => x.anchor === a); return it ? routeOf(it) : null; };
/** Mål-id for et treff. Har ikke treffet (fra serveren) mål-id, brukes beste treff i den innebygde indeksen på samme side. */
export function anchorFor(it, q) {
  if (anchorOf(it)) return anchorOf(it);
  const tab = routeOf(it).tab, best = hits(q, LOCAL.filter((x) => x.anchor)).find((x) => routeOf(x).tab === tab);
  return best?.anchor ?? null;
}
/** Spør serveren (lokal modell først). Reserve: beste nøkkelordtreff. onDone(ans) får svaret (for automatisk navigering). */
export async function ask(q, redraw, onDone) {
  X.askQ = q; X.busy = true; X.ans = null; redraw();
  X.ctl?.abort(); const ctl = new AbortController(); X.ctl = ctl;
  let ans = null;
  // Indeksen først: et tydelig treff på en konkret knapp (helt ord + mer) svarer lokalt med en gang (prompt 34).
  const la = hits(q, LOCAL.filter((x) => x.anchor), true)[0];
  if (la && la.s >= 5) {
    await new Promise((r) => setTimeout(r, 420));
    if (X.ctl !== ctl || X.askQ !== q) return;
    X.busy = false; X.ans = { answer: ANS[la.it.anchor] ?? `Det finner du under ${la.it.path}. Jeg tar deg dit og viser deg hvor …`, target: la.it }; redraw(); onDone?.(X.ans);
    return;
  }
  try {
    const r = await api('/settings/ask', { method: 'POST', json: { q }, signal: ctl.signal });
    // SERVER34: svaret kan ha anchor (element-id). Målet valideres mot indeksen før navigering.
    if (r && (r.answer || r.targetId)) {
      const tg = index().find((x) => x.id === r.targetId) ?? (r.anchor ? index().find((x) => anchorOf(x) === r.anchor) : null) ?? null;
      const an = tg ? (r.anchor ?? anchorFor(tg, q)) : null;
      ans = { answer: String(r.answer ?? ''), target: tg && an && !anchorOf(tg) ? { ...tg, anchor: an } : tg };
      if (ans.target?.anchor && ANS[ans.target.anchor] && !r.anchor) ans.answer = ANS[ans.target.anchor];
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!ans) {
    const top = hits(q)[0];
    ans = top ? { answer: ANS[anchorOf(top)] ?? `Det finner du under ${top.path}.${anchorOf(top) ? ' Jeg tar deg dit og viser deg hvor …' : routeOf(top).tab === 'dom' ? ' Trykk på ? ved API-token for en steg-for-steg-guide.' : ' Trykk under for å gå rett dit.'}`, target: top }
      : { answer: `Jeg fant ikke en innstilling som passer «${q}». Prøv å beskrive hva du vil endre.`, target: null };
  }
  if (X.ctl !== ctl || X.askQ !== q) return;
  X.busy = false; X.ans = ans; redraw();
  onDone?.(ans);
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
    : `<span class="set-aitxt">${esc(X.ans?.answer ?? '')}</span>${X.ans?.target ? `<button type="button" class="set-aigo" data-setgo="${esc(X.ans.target.id)}"${X.ans.target.anchor ? ` data-setanchor="${esc(X.ans.target.anchor)}"` : ''}>${anchorOf(X.ans.target) ? 'Vis meg nå ›' : `Åpne ${esc(tabName(routeOf(X.ans.target).tab))} ›`}</button>` : ''}`}</div>` : '';
  const hl = list.length ? `<div class="set-hits"><span class="set-cap">TREFF</span>${list.map((h) => `<button type="button" class="set-hit" data-setgo="${esc(h.id)}">${icBox(routeOf(h).tab, 28, 15)}<span class="set-hit-t"><b>${esc(h.title)}</b><span>${esc(h.path)}</span></span></button>`).join('')}</div>`
    : showAi ? '' : '<span class="set-nohit">Ingen treff. Slå på ✦ AI og spør med egne ord.</span>';
  return ai + hl;
}
export const byId = (id) => index().find((x) => x.id === id);
export const topHit = (q) => hits(q)[0] ?? null;
