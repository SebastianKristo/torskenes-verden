// Prompt 30 (SERVER30): søk og ✦ AI-søk i Innstillinger (web og mobil), claude-code-innst-web-ai-ikoner-cloudflare.md.
//   GET  /api/settings/index → [{id, title, path:'Utseende → Bakgrunn', keywords[], description, route:{web, mobile}, icon, color}]
//        En statisk indeks over innstillingssidene. route.web er hash-lenken på web (#/innstillinger/<fane>[/<underside>]),
//        route.mobile er PWA-ruten (#/set/<side>), som iOS/Android oversetter til sine egne sider. Sider som bare admin
//        kan åpne (System, Backup, Domener, Brukere → Ny bruker) tas ut for andre brukere.
//   POST /api/settings/ask {q} → {answer, targetId, ids[], provider, mode:'ai'|'text', quick?, anchor, goMs:1600,
//        target:{id, route:{web, mobile}, anchor:'upd', tip?:'✦ Trykk her for å oppdatere', title, path}|null}   (prompt 34)
//        Hver oppføring i /index har anchor (mål-id, data-hl på elementet) og eventuelt tip (boblen).
//        Lokal modell først (Ollama, JSON-format, temperatur 0), ellers Gemini hvis en nøkkel finnes, ellers enkel nøkkelordmatch.
//        Bare spørsmålet og indeksen (id, tittel, sti, nøkkelord) sendes – aldri brukerdata. Gemini-kall logges i ai_audit.
// Sesjon eller app-token (finance:read holder, søket endrer ingenting).
import { Hono } from 'hono';
import { sessionUser, userInfo, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';

const MOCK = process.env.MOCK_DATA === '1';

// [id, tittel, sti, nøkkelord, beskrivelse, web-rute, mobil-rute, bare admin]
const W = (tab, sub) => `#/innstillinger/${tab}${sub ? `/${sub}` : ''}`;
const M = (p) => `#/set${p ? `/${p}` : ''}`;
const RAW = [
  ['konto', 'Konto', 'Konto', 'profil navn brukernavn rolle konto', 'Navn, rolle, profilbilde og innlogging.', W('konto'), M('profil')],
  ['konto.navn', 'Navn og profilbilde', 'Konto → Profil', 'navn profilbilde avatar bilde', 'Endre navnet ditt og profilbildet som vises i menyen og appene.', W('konto', 'me'), M('profil')],
  ['konto.2fa', 'Totrinnsbekreftelse', 'Konto → Innlogging', '2fa totp tofaktor kode autentisering sikkerhet', 'Krev en kode fra autentiseringsappen når du logger inn.', W('konto', 'tfa'), M('sik')],
  ['konto.passord', 'Passord', 'Konto → Innlogging', 'passord bytt endre glemt', 'Bytt passord for nettsiden og mobilappene.', W('konto', 'pw'), M('sik')],
  ['konto.enheter', 'Pålitelige enheter', 'Konto → Innlogging', 'enhet enheter lan lokalt nett pålitelig økter', 'Enheter som slipper passord på lokalt nett.', W('konto', 'devices'), M('sik')],
  ['konto.tokens', 'API-tokens', 'Konto → API-tokens', 'token nøkkel app-token langtidstoken api', 'Tokens for appene og snarveier.', W('konto'), M('tok')],
  ['konto.server', 'Navn på serveren', 'Konto → Server', 'server navn homelab', 'Navnet som vises i menyen og i mobilappen.', W('konto', 'server'), M('srv'), true],
  ['utseende', 'Utseende', 'Utseende', 'tema mørk lys farge papir utseende', 'Tema, bakgrunnsbilde, søkebar og kategorier.', W('look'), M('look')],
  ['utseende.bakgrunn', 'Bakgrunn på forsiden', 'Utseende → Bakgrunn', 'bakgrunn bilde planeter vær oslo foto uskarphet demping', 'Bakgrunnsbildet på Dashboard og Hjem.', W('look', 'bg'), M('bakgrunn')],
  ['utseende.sokebar', 'Stil på søkebar', 'Utseende → Søkebar', 'søkebar søk stil google ai ddg søkemotor', 'Hvordan søkebaren ser ut og hvilken søkemotor den bruker.', W('look', 'style'), M('sokbar')],
  ['utseende.sokehistorikk', 'Søkehistorikk', 'Utseende → Søkebar', 'historikk søk forslag slett', 'Lagrede søk og forslag.', W('look', 'hist'), M('sokbar')],
  ['utseende.kategorier', 'Kategorier', 'Utseende → Kvitteringer', 'kategori kategorier kvittering budsjett', 'Kategoriene som brukes på kvitteringene.', W('look', 'cats'), M('kat')],
  ['utseende.ikonfarger', 'Ikonfarger', 'Utseende → Ikonfarger', 'ikon ikoner farge fargetema', 'Fargetema for ikonene i Innstillinger.', W('look'), M('look')],
  ['startside', 'Startside', 'Startside', 'startside forside topplinje', 'Topplinje, faner, nyhetsbar og forsiden.', W('top'), M('fanelinje')],
  ['startside.faner', 'Faner i topplinjen', 'Startside → Topplinje', 'fane faner meny navigasjon rekkefølge skjul navn fanelinje', 'Navn, rekkefølge og skjulte faner.', W('top', 'tabs'), M('fanelinje')],
  ['startside.avstand', 'Avstand og faner', 'Startside → Topplinje', 'avstand topplinje høyde', 'Avstand i topplinjen.', W('top', 'head'), M('fanelinje')],
  ['startside.nyhetsbar', 'Nyhetsbar', 'Startside → Nyhetsbar', 'nyhetsbar nyhetslinje ticker hastighet rss', 'Hastighet og innhold i nyhetslinjen.', W('top', 'speed'), M('look')],
  ['startside.widgets', 'Widgets på dashboardet', 'Startside → Forside', 'widget widgets kort dashboard forside', 'Hvilke kort som vises på Dashboard.', W('top', 'dash'), M('mod')],
  ['startside.mobil', 'Widgets på mobil', 'Startside → Forside', 'widget mobil hjem kort', 'Hvilke kort som vises på Hjem i appen.', W('top', 'mob'), M('mod')],
  ['startside.snarveier', 'Snarveier', 'Startside → Forside', 'snarvei snarveier lenker bokmerker', 'Snarveier på forsiden.', W('top', 'sc'), M('mod')],
  ['domener', 'Domener', 'Domener', 'domene domener cloudflare statistikk verdenskart api-token token', 'Domener, statistikkilder, Cloudflare-token og verdenskart.', W('dom'), M('integ/cloudflare'), true],
  ['domener.liste', 'Legg til og fjern domener', 'Domener → Domener', 'domene legg til fjern statistikkilde cloudflare test token', 'Legg til domener og test Cloudflare-tokenet.', W('dom', 'doms'), M('integ/cloudflare'), true],
  ['varsler', 'Varsler', 'Varsler', 'varsel varsler push lyd stille timer grupper test', 'Lyd, stille timer, grupper og test av varsler.', W('varsel'), M('varsler')],
  ['varsler.haptikk', 'Haptikk', 'Varsler → Haptikk', 'haptikk vibrasjon vibrer', 'Vibrasjon ved trykk og varsler i appen.', W('varsel'), M('hap')],
  ['app', 'App', 'App', 'app navn ikon', 'Navn på appen og app-ikon.', W('app'), M('look')],
  ['app.navn', 'Navn på appen', 'App → Navn', 'navn app tittel appnavn', 'Hva appen heter på hjemskjermen og i menyen.', W('app'), M('look')],
  ['app.ikon', 'App-ikon', 'App → Ikon', 'ikon logo app-ikon', 'Velg app-ikon.', W('app'), M('look')],
  ['integrasjoner', 'Integrasjoner', 'Integrasjoner', 'integrasjon nøkkel api adresse tjeneste sonarr radarr plex jellyfin home assistant entur met kart', 'Adresser og API-nøkler for tjenestene.', W('int'), M('integ')],
  ['integrasjoner.mail', 'Proton Mail', 'Integrasjoner → Proton Mail', 'proton mail epost e-post bridge imap kvittering', 'Kvitteringer fra e-post via Bridge.', W('int', 'mail'), M('integ/imap')],
  ['integrasjoner.cloudflare', 'Cloudflare', 'Integrasjoner → Cloudflare', 'cloudflare token domene statistikk', 'Standard-token for domenestatistikk.', W('int', 'cfg:Cloudflare'), M('integ/cloudflare'), true],
  ['kalendere', 'Kalendere', 'Kalendere', 'kalender kalendere ical canvas google home assistant skole timeplan synk', 'Skolens iCal, Canvas, Google Kalender og Home Assistant.', W('kal'), M('kal')],
  ['ai', 'AI', 'AI', 'ai chat personvern logoer ollama gemini groq modell motor', 'Chat, personvern og logoer.', W('ai'), M('fai')],
  ['ai.motor', 'AI-motor', 'AI → Motor', 'ai motor ollama gemini groq modell kvittering tolkning ocr', 'Hvilken AI som tolker kvitteringer og svarer i søket.', W('ai'), M('fai')],
  ['brukere', 'Brukere', 'Brukere', 'bruker brukere rolle tilgang familie', 'Hvem som har tilgang, og hvilken rolle de har.', W('users'), M('konto')],
  ['brukere.ny', 'Ny bruker', 'Brukere → Ny bruker', 'ny bruker legg til opprett', 'Brukernavn, passord og rolle for en ny bruker.', W('users', 'add'), M('konto'), true],
  ['system', 'System', 'System', 'system oppdater oppdatering versjon programvare server', 'Oppdater serveren til nyeste versjon.', W('system'), M('oppd'), true],
  // Prompt 34: egne oppføringer for kontrollene på System-siden (mål-id i ANCHOR under).
  ['system.oppdater', 'Oppdater nå', 'System → Programvare', 'oppdater oppdatere oppdaterer oppdatering update nordlys oppgrader installer nyeste', 'Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter.', W('system'), M('oppd'), true],
  ['system.sjekk', 'Se etter oppdatering', 'System → Programvare', 'se etter sjekk oppdatering versjon ny', 'Sjekker om det finnes en ny versjon.', W('system'), M('oppd'), true],
  ['system.passord', 'Krev passord for å oppdatere', 'System → Programvare', 'krev passord oppdater oppdatering bekreft', 'Ber om passordet før en oppdatering starter.', W('system'), M('oppd'), true],
  ['backup.na', 'Ta backup nå', 'Backup → Status', 'ta backup nå sikkerhetskopi start manuell', 'Starter en backup av hele systemet med en gang.', W('backup'), M('sysbk'), true],
  ['backup.auto', 'Automatisk backup', 'Backup → Automatisk', 'automatisk backup hver natt planlagt behold', 'Hvor ofte backup tas, og hvor mange som beholdes.', W('backup'), M('sysbk'), true],
  ['varsler.push', 'Push-varsler', 'Varsler → Push', 'push varsel varsler slå på mobil nettleser', 'Slå på varsler i nettleseren og appen.', W('varsel'), M('varsler')],
  ['varsler.stille', 'Stille timer', 'Varsler → Stille timer', 'stille timer natt ikke forstyrr', 'Når varsler skal være stille.', W('varsel'), M('varsler')],
  ['utseende.tema', 'Tema', 'Utseende → Tema', 'tema mørk lys papir farger modus', 'Lyst, mørkt eller Papir-tema.', W('look'), M('look')],
  ['ai.kontroll', 'AI-kontroll', 'AI', 'ai kontroll modeller jobber forbruk tokens nøkler selvtest glimt', 'Modeller, jobber, forbruk og nøkler.', W('ai'), M('ai')],
  ['ai.modeller', 'Modeller', 'AI → Modeller', 'modell modeller last ned ollama installer slett vram', 'Installerte modeller, nedlasting og hvilken som brukes.', W('ai', 'mod'), M('ai/mod')],
  ['ai.gemini', 'Gemini-nøkkel', 'AI → API og nøkler → Gemini', 'gemini nøkkel api key google', 'API-nøkkelen for Gemini.', W('ai', 'api'), M('ai/api'), true],
  ['system.oppdatering', 'Programvareoppdatering', 'System → Programvare', 'oppdater oppdatering ny versjon automatisk varsle rollback gjenopprett', 'Oppdater nå, automatiske oppdateringer og varsel om nye versjoner.', W('system'), M('oppd'), true],
  ['backup', 'Backup', 'Backup', 'backup sikkerhetskopi gjenopprett automatisk smb nas sky kryptering', 'Backup av hele systemet: automatisk, hva som tas med, hvor og gjenoppretting.', W('backup'), M('sysbk'), true],
  ['finans.regler', 'Regler', 'Finans → Regler', 'regel regler automatisk kategorisering', 'Regler for automatisk kategorisering.', W('look', 'cats'), M('regel')],
  ['finans.bank', 'Bank og import', 'Finans → Bank og import', 'bank import csv dnb', 'Import av kontoutskrifter.', W('int'), M('bank')],
  ['finans.aksjer', 'Aksjer · Trading 212', 'Finans → Aksjer', 'aksje aksjer trading212 t212 fond', 'Kobling til Trading 212.', W('int'), M('t212')],
  ['nyheter', 'Nyhetsleser', 'Nyhetsleser', 'rss nyheter kilder nyhetsleser', 'Kilder, kategorier og AI-sammendrag.', W('top', 'speed'), '#/nyheter'],
];
const ICON = { konto: ['user', '#2b5d8a'], utseende: ['look', '#7a5ad6'], startside: ['top', '#3f7a6e'], domener: ['map', '#c0562a'], varsler: ['bell', '#b23a2a'], app: ['app', '#5b6470'],
  integrasjoner: ['plug', '#4a5bbf'], kalendere: ['cal', '#2f7d4f'], ai: ['ai', '#7a3b6b'], brukere: ['users', '#a8661a'], system: ['sys', '#6b6558'], backup: ['backup', '#2f6b45'],
  finans: ['bank', '#2f7a4f'], nyheter: ['rss', '#c0562a'] };

// Prompt 34: mål-id (anchor) per handling: klienten går til siden, scroller målet (data-hl="<anchor>") midt i innholdet og markerer det.
// tip = boblen over målet. answer = fast svar (Glimt) for akkurat denne handlingen.
export const ANCHOR = {
  'system.oppdater': { anchor: 'upd', tip: '✦ Trykk her for å oppdatere', answer: 'Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter. Jeg tar deg dit og viser knappen …' },
  'system.sjekk': { anchor: 'chk', tip: '✦ Trykk her for å se etter oppdatering' }, 'system.passord': { anchor: 'pw' }, 'system.oppdatering': { anchor: 'upd' }, system: { anchor: 'upd' },
  'utseende.bakgrunn': { anchor: 'bg' }, 'utseende.tema': { anchor: 'theme' }, utseende: { anchor: 'theme' }, 'varsler.push': { anchor: 'push' }, varsler: { anchor: 'push' }, 'varsler.stille': { anchor: 'quiet' },
  'konto.2fa': { anchor: '2fa' }, 'konto.passord': { anchor: 'pw-change' }, 'backup.auto': { anchor: 'bk-auto' }, backup: { anchor: 'bk-auto' }, 'backup.na': { anchor: 'bk-now', tip: '✦ Trykk her for å ta backup nå' },
  'domener.liste': { anchor: 'cf-token' }, 'integrasjoner.cloudflare': { anchor: 'cf-token' }, 'ai.motor': { anchor: 'ai-mod' }, 'ai.modeller': { anchor: 'ai-mod' }, 'ai.kontroll': { anchor: 'ai-mod' },
  'ai.gemini': { anchor: 'ai-key-gemini' }, 'brukere.ny': { anchor: 'invite' }, brukere: { anchor: 'invite' }, 'varsler.haptikk': { anchor: 'haptic' }, 'konto.tokens': { anchor: 'tokens' },
  'utseende.sokebar': { anchor: 'search-style' }, 'startside.faner': { anchor: 'tabs' }, kalendere: { anchor: 'cal-ical' }, 'app.navn': { anchor: 'app-name' }, 'app.ikon': { anchor: 'app-icon' },
};
export const SETTINGS_INDEX = RAW.map(([id, title, path, kw, description, web, mobile, admin]) => {
  const [icon, color] = ICON[id.split('.')[0]] ?? ['gear', '#6b6558'];
  const a = ANCHOR[id] ?? {};
  return { id, title, path, keywords: kw.split(/\s+/).filter(Boolean), description, route: { web, mobile }, icon, color, anchor: a.anchor ?? null, ...(a.tip ? { tip: a.tip } : {}), ...(admin ? { admin: true } : {}) };
});
export const indexFor = (admin) => SETTINGS_INDEX.filter((x) => admin || !x.admin).map(({ admin: _a, ...x }) => x);

/* ---------------- Nøkkelordmatch ---------------- */
const fold = (s) => String(s ?? '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').normalize('NFKD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['hvor', 'hva', 'hvordan', 'jeg', 'kan', 'man', 'en', 'et', 'ei', 'det', 'den', 'de', 'pa', 'i', 'til', 'for', 'av', 'med', 'min', 'mitt', 'mine', 'bytter', 'endre', 'endrer', 'bytte',
  'finner', 'er', 'og', 'a', 'skal', 'vil', 'gjor', 'gjore', 'slar', 'sla', 'pa', 'der', 'som', 'meg', 'seg', 'ny', 'nye']);
export function keywordMatch(q, items, limit = 8, withScore = false) {
  // Enkel stamme: passordet → passord, bakgrunnsbilde → bakgrunnsbild, varslene → varsl.
  const stem = (w) => { for (const suf of ['ene', 'ane', 'et', 'en', 'er', 'a', 'e']) if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length); return w; };
  const words = [...new Set(fold(q).split(/[^a-z0-9-]+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem))];
  if (!words.length) return [];
  return items.map((it) => {
    const t = fold(it.title), p = fold(it.path), k = it.keywords.map(fold), d = fold(it.description);
    let s = 0;
    for (const w of words) {
      if (t.includes(w)) s += 4; else if (k.some((x) => x === w)) s += 3; else if (k.some((x) => x.includes(w) || (w.length > 4 && x.startsWith(w.slice(0, -1))))) s += 2;
      else if (p.includes(w)) s += 1; else if (d.includes(w)) s += 0.5;
    }
    return { it, s: s - it.id.split('.').length * 0.01 };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => (withScore ? { ...x.it, score: x.s } : x.it));
}
const answerFor = (it) => (it && ANCHOR[it.id]?.answer ? ANCHOR[it.id].answer : it ? `Det finner du under ${it.path}${it.path.endsWith(it.title) ? '' : ` → ${it.title}`}. ${it.description}` : 'Fant ingen innstilling som passer. Prøv med andre ord.');

/* ---------------- AI ---------------- */
// Testkrok: (prompt, schema, {engine}) → {data, provider} eller kast. engine er 'ollama' eller 'gemini'.
let aiImpl = null;
export const _setAsk30 = (fn) => { aiImpl = fn; };

async function realAi(prompt, schema, { engine }) {
  const ai = await import('./finans/ai.js');
  if (engine === 'gemini') {
    const { hasGemini } = await import('./finans/gemini-keys.js');
    if (!hasGemini()) throw new Error('Ingen Gemini-nøkkel');
  }
  const r = await ai.textJson(prompt, schema, { force: engine, temperature: 0, task: 'search' });
  return { data: r.data, provider: r.provider };
}

const readAuth = async (c, next) => {
  let id = sessionUser(c);
  if (!id && bearerOk(c, 'finance:read')) id = c.get('user');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  c.set('user', id);
  await next();
};

const api = new Hono();
api.get('/index', readAuth, (c) => c.json(indexFor(isAdmin(c.get('user')))));
api.post('/ask', readAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const q = String(b?.q ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!q) return c.json({ error: 'Skriv hva du leter etter' }, 400);
  const u = c.get('user'), items = indexFor(isAdmin(u)), known = new Set(items.map((x) => x.id));
  // Prompt 34: målet for klienten (gå til siden etter goMs og marker anchor).
  const target = (id) => { const it = items.find((x) => x.id === id); return it ? { target: { id: it.id, route: it.route, anchor: it.anchor, ...(it.tip ? { tip: it.tip } : {}), title: it.title, path: it.path }, anchor: it.anchor, goMs: 1600 } : { target: null, anchor: null }; };
  const text = (extra = {}) => { const hits = keywordMatch(q, items); return { answer: answerFor(hits[0]), targetId: hits[0]?.id ?? null, ids: hits.map((x) => x.id), provider: null, mode: 'text', ...target(hits[0]?.id), ...extra }; };
  // Sterkt treff i indeksen (tittel + nøkkelord, f.eks. «hvordan oppdaterer jeg»): svar med en gang uten AI.
  { const top = keywordMatch(q, items, 1, true)[0]; if (top && top.score >= 7 && ANCHOR[top.id]?.anchor) return c.json(text({ quick: true })); }
  const run = aiImpl ?? (MOCK ? null : realAi);
  if (!run) return c.json(text());
  // Bare spørsmålet og indeksen (uten ruter) går til modellen.
  const slim = items.map(({ id, title, path, keywords }) => ({ id, title, path, keywords: keywords.join(' ') }));
  const schema = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, targetId: { type: 'STRING' } }, required: ['answer', 'targetId'] };
  const prompt = 'Du hjelper brukeren å finne riktig innstilling i Homelab. Under er alle innstillingene som JSON (id, title, path, keywords).\n'
    + 'Svar på norsk bokmål med JSON {"answer": én eller to korte setninger om hvor innstillingen ligger (bruk path), "targetId": id-en til det beste treffet}. '
    + 'Bruk bare id-er fra listen. Finnes ingen, gi targetId "".\n'
    + `Innstillinger: ${JSON.stringify(slim)}\nSpørsmål: «${q}»`;
  const errors = [];
  for (const engine of ['ollama', 'gemini']) {
    try {
      const r = await Promise.race([run(prompt, schema, { engine }), new Promise((_, rej) => setTimeout(() => rej(new Error('AI svarte ikke i tide')), 25_000).unref?.())]);
      if (engine === 'gemini') {
        try { const { audit } = await import('./finans/ai-audit.js'); audit('gemini', 'settings', { q, index: `${slim.length} innstillinger (id, tittel, sti, nøkkelord)` }, u); } catch { /* logg er best effort */ }
      }
      const tid = String(r?.data?.targetId ?? '').trim();
      const answer = String(r?.data?.answer ?? '').trim().slice(0, 600);
      const targetId = known.has(tid) ? tid : null;
      if (!answer && !targetId) throw new Error('Tomt svar');
      const rest = keywordMatch(q, items).map((x) => x.id).filter((x) => x !== targetId);
      return c.json({ answer: answer || answerFor(items.find((x) => x.id === targetId)), targetId, ids: [...(targetId ? [targetId] : []), ...rest].slice(0, 8), provider: r?.provider ?? engine, mode: 'ai', ...target(targetId) });
    } catch (e) { errors.push(`${engine}: ${e.message}`); }
  }
  return c.json(text({ fallback: true, reason: errors.join(' · ').slice(0, 300) }));
});

export default api;
