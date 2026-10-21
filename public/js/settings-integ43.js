// Prompt 43 (claude-code-integrasjoner-media.md): MEDIA-gruppen under Innstillinger → Integrasjoner på web
// (Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin, Plex) med felt, Lagre, Test tilkobling og «Slik setter du det opp».
// Data fra det eksisterende integrasjons-API-et (SERVER43): GET /api/integrations → [{id, name, sub, group:'Media', status,
// fields:[{key, label, type:'url'|'text'|'secret', value?, saved?, optional?, placeholder?}], steps:[{t, d, code?}]}],
// PUT /api/integrations/:id {key: verdi}, POST /api/integrations/:id/test → {ok, message, ms, version?}.
// Mangler serveren en tjeneste, brukes definisjonen under (samme tekst som spesifikasjonen), og lagring sier fra.
// Hemmeligheter (API-nøkler, passord, token) settes bare av admin, lagres kryptert på serveren og sendes aldri tilbake.
import { api, esc, logoImg } from './util.js';
import { integById, resetInteg, loadInteg } from './settings-integ.js';

const F = (key, label, type = 'text', placeholder = '', optional = false) => ({ key, label, type, placeholder, optional });
const DEF = [
  { id: 'sonarr', name: 'Sonarr', sub: 'Serier · kalender, kvalitet og søk', domain: 'sonarr.tv',
    fields: [F('url', 'Adresse', 'url', 'http://home.kristo.no:8989'), F('apiKey', 'API-nøkkel', 'secret'), F('rootFolder', 'Rotmappe for serier', 'text', '/data/media/tv'), F('qualityProfile', 'Standard kvalitetsprofil', 'text', 'HD-1080p', true)],
    steps: [['Finn API-nøkkelen', 'Sonarr → Settings → General → Security → API Key. Kopier og lim inn over.'],
      ['Adresse og port', 'Standardporten er 8989. Har du satt URL Base, ta den med.', 'http://192.168.1.20:8989/sonarr'],
      ['Samme mapper i alle containerne', 'Gi Sonarr, Radarr og qBittorrent samme volum, så flytting blir hardlinks (ingen kopiering).', 'volumes:\n  - /srv/data:/data\n# /data/downloads  /data/media/tv  /data/media/film'],
      ['Rotmappe', 'Settings → Media Management → Root Folders → legg til /data/media/tv.'],
      ['Koble til qBittorrent', 'Settings → Download Clients → + → qBittorrent, port 8080, kategori tv-sonarr.'],
      ['Standard kvalitetsprofil', 'Brukes når du legger til fra Media eller Glimt. «4K» i Glimt velger Ultra-HD.'],
      ['Webhook for varsler', 'Settings → Connect → + → Webhook. Huk av On Grab, On Import, On Upgrade og On Health Issue.', 'https://home.kristo.no/api/media/hook/sonarr']] },
  { id: 'radarr', name: 'Radarr', sub: 'Filmer · utgivelser, kvalitet og søk', domain: 'radarr.video',
    fields: [F('url', 'Adresse', 'url', 'http://home.kristo.no:7878'), F('apiKey', 'API-nøkkel', 'secret'), F('rootFolder', 'Rotmappe for filmer', 'text', '/data/media/film'), F('qualityProfile', 'Standard kvalitetsprofil', 'text', 'Ultra-HD', true)],
    steps: [['Finn API-nøkkelen', 'Radarr → Settings → General → Security → API Key.'],
      ['Adresse og port', 'Standardporten er 7878.', 'http://192.168.1.20:7878'],
      ['Rotmappe', 'Settings → Media Management → Root Folders → /data/media/film.'],
      ['Koble til qBittorrent', 'Settings → Download Clients → qBittorrent, port 8080, kategori radarr.'],
      ['Minimum Availability', 'Announced = Annonsert, In Cinemas = På kino, Released = «Utgitt digitalt» (anbefalt).'],
      ['Webhook for varsler', 'Settings → Connect → + → Webhook (On Grab, On Import, On Upgrade, On Health Issue).', 'https://home.kristo.no/api/media/hook/radarr']] },
  { id: 'qbittorrent', name: 'qBittorrent', sub: 'Nedlastinger · pause, kø, filer og alt-hastighet', domain: 'qbittorrent.org',
    fields: [F('url', 'Web UI-adresse', 'url', 'http://home.kristo.no:8080'), F('username', 'Brukernavn', 'text', 'admin'), F('password', 'Passord', 'secret'), F('savePath', 'Standard lagringsmappe', 'text', '/data/downloads', true)],
    steps: [['Slå på Web UI', 'Verktøy → Innstillinger → Web UI → port 8080. I Docker står et midlertidig passord i loggen:', 'docker logs qbittorrent | grep -i password'],
      ['Eget brukernavn og sterkt passord', 'Bytt fra standardbrukeren i Web UI-innstillingene.'],
      ['Bare Homelab-serveren', 'Tillat bare Homelab-serverens IP. Ikke åpne Web UI mot internett.'],
      ['Kategorier', 'tv-sonarr → /data/downloads/tv og radarr → /data/downloads/film.'],
      ['Varsel når ferdig', 'Innstillinger → Nedlastinger → «Kjør eksternt program når torrent er ferdig»:', 'curl -s -X POST https://home.kristo.no/api/media/hook/qbit -d "hash=%I&name=%N"'],
      ['Alt-hastighet', 'Fart → Alternative fartsgrenser, f.eks. 5 MB/s ned. Slås av og på fra Media.']] },
  { id: 'prowlarr', name: 'Prowlarr', sub: 'Indeksere · helse, test og synk', domain: 'prowlarr.com',
    fields: [F('url', 'Adresse', 'url', 'http://home.kristo.no:9696'), F('apiKey', 'API-nøkkel', 'secret'), F('flaresolverr', 'FlareSolverr (valgfri)', 'url', 'http://home.kristo.no:8191', true)],
    steps: [['Finn API-nøkkelen', 'Prowlarr → Settings → General → Security → API Key.'],
      ['Apper', 'Settings → Apps → + Sonarr og + Radarr med Full Sync.', 'Prowlarr: http://prowlarr:9696\nSonarr:   http://sonarr:8989\nRadarr:   http://radarr:7878'],
      ['Legg til indeksere', 'Fra Media → Prowlarr → «+ Legg til indekser», eller i Prowlarr.'],
      ['FlareSolverr (Cloudflare-beskyttede indeksere)', 'Start containeren og legg til en indekser-proxy med taggen flaresolverr.', 'docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr'],
      ['Webhook for helse', 'Settings → Connect → Webhook (On Health Issue).', 'https://home.kristo.no/api/media/hook/prowlarr']] },
  { id: 'jellyfin', name: 'Jellyfin', sub: 'Spill av · dyplenke til episode og film', domain: 'jellyfin.org',
    fields: [F('url', 'Adresse', 'url', 'http://home.kristo.no:8096'), F('apiKey', 'API-nøkkel', 'secret'), F('user', 'Bruker', 'text', 'sebastian', true)],
    steps: [['Lag en API-nøkkel', 'Dashbord → API-nøkler → + → kall den «Homelab».'],
      ['Bibliotek', 'Legg til bibliotek på /data/media/tv og /data/media/film.'],
      ['Oppdater biblioteket automatisk', 'Sonarr og Radarr → Settings → Connect → Emby / Jellyfin.'],
      ['Velg spiller', 'Media → ⚙ → Spill av med → Jellyfin.']] },
  { id: 'plex', name: 'Plex', sub: 'Spill av · dyplenke til episode og film', domain: 'plex.tv',
    fields: [F('url', 'Adresse', 'url', 'http://home.kristo.no:32400'), F('token', 'Plex-token', 'secret')],
    steps: [['Finn tokenet', 'Åpne en film i Plex Web → ⋯ → Hent info → Vis XML. Tokenet står i adressen etter X-Plex-Token=.'],
      ['Bibliotek', 'Bibliotek på de samme mappene: /data/media/tv og /data/media/film.'],
      ['Oppdater biblioteket automatisk', 'Sonarr og Radarr → Settings → Connect → Plex Media Server.'],
      ['Velg spiller', 'Media → ⚙ → Spill av med → Plex.']] },
];
export const MEDIA_IDS43 = DEF.map((d) => d.id);
const SYN = { qbit: 'qbittorrent', qbittorent: 'qbittorrent' };
const test = {}, msg = {};
let copied = '';

/** Tjenesten slik serveren har den (felter med verdier/status), ellers definisjonen. */
function svc(id) {
  const d = DEF.find((x) => x.id === id);
  const s = integById(id) ?? integById(Object.keys(SYN).find((k) => SYN[k] === id));
  if (!s) return { ...d, local: true, fields: d.fields.map((f) => ({ ...f })) };
  const fields = (s.fields?.length ? s.fields : d.fields).map((f) => ({ ...(d.fields.find((x) => x.key === f.key) ?? {}), ...f, optional: f.optional ?? /valgfri/i.test(f.label ?? '') ?? false }));
  const steps = Array.isArray(s.steps) && s.steps.length ? s.steps.map((x) => (Array.isArray(x) ? x : [x.t ?? x.title ?? '', x.d ?? x.text ?? x.body ?? '', x.code ?? ''])) : d.steps;
  return { ...d, ...s, sub: s.sub ?? d.sub, domain: s.domain ?? d.domain, fields, steps };
}
const isSecret = (f) => f.type === 'secret' || f.type === 'password' || f.secret;
const filled = (f) => (isSecret(f) ? !!(f.saved || f.set) : String(f.value ?? '').trim() !== '');
/** «Tilkoblet» (grønn) eller «Mangler <felt>» (rød). Valgfrie felt teller ikke. */
function status(s) {
  const t = test[s.id];
  if (t?.st === 'run') return ['Tester …', '#8a8478'];
  const miss = s.fields.filter((f) => !f.optional && !/valgfri/i.test(f.label) && !filled(f));
  if (miss.length) return [`Mangler ${miss[0].label.toLowerCase()}`, '#b23a2a'];
  if (t && !t.ok) return ['Feil ved test', '#b23a2a'];
  if (s.status === 'error') return ['Feil', '#b23a2a'];
  return ['Tilkoblet', '#2f6b4a'];
}

/* ---- Serveren har Media-tjenestene som grupper i /api/config (SERVER43: category 'Media'). Da brukes de, med
   status og steg herfra. Mangler en tjeneste der, brukes /api/integrations eller definisjonen over (egen underside). ---- */
const idOf = (g) => { const k = String(g?.id ?? g?.name ?? '').toLowerCase().replace(/\s+/g, ''); return SYN[k] ?? k; };
export const isMedia43 = (g) => MEDIA_IDS43.includes(idOf(g)) || String(g?.category ?? '').toLowerCase() === 'media';
const cfgSecret = (f) => !!(f.secret || f.type === 'password');
const cfgFilled = (f) => (cfgSecret(f) ? !!f.set : String(f.value ?? '').trim() !== '');
// Bare adresse og nøkkel/passord/token er påkrevd; rotmappe, profil, dager og bruker har standardverdier.
const cfgNeeded = (f) => !/valgfri|dager|profil|rotmappe|lagringsmappe|bruker(navn)? \(|flaresolverr/i.test(f.label ?? '') && (/url|adresse/i.test(`${f.key} ${f.label}`) || cfgSecret(f) || /brukernavn$/i.test(f.label ?? ''));
/** Status for en Media-gruppe fra /api/config: «Tilkoblet» eller «Mangler <felt>». t = testresultat fra settings.js. */
export function cfgStatus43(g, t) {
  if (t?.st === 'run') return ['Tester …', '#8a8478'];
  const miss = (g.fields ?? []).filter((f) => cfgNeeded(f) && !cfgFilled(f));
  if (miss.length) return [`Mangler ${String(miss[0].label).toLowerCase().replace(/^url$/, 'adresse')}`, '#b23a2a'];
  if (t?.st === 'err') return ['Feil ved test', '#b23a2a'];
  return ['Tilkoblet', '#2f6b4a'];
}
/** Rader for gruppen «Media»: grupper fra /api/config først, så tjenester serveren ikke har der. */
export function mediaRows43(cfgGroups, row, tests = {}, admin = true) {
  const have = new Set(cfgGroups.map(idOf));
  const order = (g) => { const i = MEDIA_IDS43.indexOf(idOf(g)); return i < 0 ? 99 : i; };
  const fromCfg = [...cfgGroups].sort((a, b) => order(a) - order(b)).map((g) => {
    const d = DEF.find((x) => x.id === idOf(g)), [v, vc] = cfgStatus43(g, tests[g.name]);
    return { i: order(g), r: row({ t: d?.name ?? g.name, s: d?.sub ?? g.help ?? '', k: `media ${(g.fields ?? []).map((f) => f.label).join(' ')}`, logo: g.domain ?? d?.domain, ini: g.name, v, vc, btn: 'Oppsett', go: `int|cfg:${g.name}` }) };
  });
  const rest = DEF.filter((d) => admin && !have.has(d.id)).map((d) => { const x = svc(d.id), [v, vc] = status(x); return { i: MEDIA_IDS43.indexOf(d.id), r: row({ t: x.name, s: x.sub, k: `media ${x.fields.map((f) => f.label).join(' ')}`, logo: x.domain, ini: x.name, v, vc, btn: 'Oppsett', go: `int|m43:${x.id}` }) }; });
  return [...fromCfg, ...rest].sort((a, b) => a.i - b.i).map((x) => x.r);
}
/** «Slik setter du det opp» for en Media-gruppe fra /api/config (spesifikasjonens tekst, kodeblokker kan kopieres). */
export function cfgGuide43(g) {
  const d = DEF.find((x) => x.id === idOf(g));
  if (!d) return '';
  return `<section class="sg m43i-how"><h3 class="sg-t">Slik setter du det opp</h3><ol class="m43i-steps">${stepsHtml(d.steps)}</ol></section>`;
}
const stepsHtml = (L) => L.map(([tt, dd, code], i) => `<li class="m43i-step"><span class="m43i-n">${i + 1}</span><div><b>${esc(tt)}</b>${dd ? `<span>${esc(dd)}</span>` : ''}${code ? `<div class="m43i-code"><pre>${esc(code)}</pre><button type="button" class="m43i-copy" data-m43i-copy="${esc(code)}">${copied === code ? '✓ Kopiert' : 'Kopier'}</button></div>` : ''}</div></li>`).join('');
export const mediaNote43 = (admin) => (admin ? 'Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin og Plex. Nøklene lagres kryptert på serveren; appene snakker bare med Homelab, som proxer videre.' : 'Settes opp av administrator. Du ser status her.');

export const mediaMissing43 = () => DEF.filter((d) => status(svc(d.id))[0] !== 'Tilkoblet').length;

/** Undersiden for én tjeneste. */
export function mediaSub43(id, admin) {
  const d = DEF.find((x) => x.id === id);
  if (!d) return null;
  const s = svc(id), [v, vc] = status(s), t = test[id], m = msg[id], ro = !admin;
  const fields = s.fields.map((f) => {
    const sec = isSecret(f), saved = sec && (f.saved || f.set);
    const ph = sec ? (saved ? '•••• lagret · skriv for å bytte' : 'ikke satt') : f.placeholder ?? '';
    return `<label class="sg-field"><span>${esc(f.label)}${f.optional && !/valgfri/i.test(f.label) ? ' <i class="m43i-opt">(valgfri)</i>' : ''}</span><input name="${esc(f.key)}" type="${sec ? 'password' : f.type === 'url' ? 'url' : 'text'}" value="${sec ? '' : esc(f.value ?? '')}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"${ro ? ' readonly' : ''}></label>`;
  }).join('');
  const res = t && t.st !== 'run' ? `<div class="sg-res"><i style="background:${t.ok ? '#34c759' : '#f26b5e'}"></i><div><b>${t.ok ? 'Tilkoblet' : 'Tilkoblingen feilet'}</b><span>${esc(t.msg)}</span></div><span class="mono">${new Date(t.at).toLocaleTimeString('nb-NO')}${t.ms ? ` · ${t.ms} ms` : ''}</span></div>` : '';
  const steps = stepsHtml(s.steps);
  const head = `<div class="int-head">${logoImg(s.domain, s.name, 'sg-lg big')}<div><b>${esc(s.name)}</b><span>${esc(s.sub)}</span></div><span class="sg-v m43i-st" style="color:${vc}">${esc(v)}</span></div>`;
  return { title: s.name, sub: `Integrasjoner · Media · ${s.sub}`, html: `${head}
    <form class="sg" data-m43i="${esc(id)}" autocomplete="off"><h3 class="sg-t">Oppsett</h3><div class="sg-box">${fields}</div></form>
    ${ro ? '<div class="sg-note">Settes opp av administrator.</div>' : `<div class="sg-acts"><button type="button" class="sg-btn" data-m43i-save="${esc(id)}">Lagre</button><button type="button" class="sg-btn pri" data-m43i-test="${esc(id)}"${t?.st === 'run' ? ' disabled' : ''}>${t?.st === 'run' ? 'Tester …' : 'Test tilkobling'}</button>
      <span class="${m ? (m.ok ? 'green' : 'red') : 'muted'}" style="font-size:13px">${esc(m?.text ?? 'Verdiene lagres kryptert på serveren og vises aldri i klartekst igjen.')}</span></div>`}${res}
    <section class="sg m43i-how"><h3 class="sg-t">Slik setter du det opp</h3><ol class="m43i-steps">${steps}</ol></section>` };
}

async function save(id, render) {
  const form = document.querySelector(`[data-m43i="${CSS.escape(id)}"]`);
  if (!form) return;
  const s = svc(id), ch = {};
  for (const f of s.fields) {
    const el = form.elements[f.key]; if (!el) continue;
    const val = el.value.trim();
    if (isSecret(f) ? val : val !== String(f.value ?? '')) ch[f.key] = val;
  }
  if (!Object.keys(ch).length) { msg[id] = { text: 'Ingen endringer', ok: true }; render(); return false; }
  msg[id] = { text: 'Lagrer …', ok: true }; render();
  try { await api(`/integrations/${encodeURIComponent(id)}`, { method: 'PUT', json: ch }); msg[id] = { text: 'Lagret ✓', ok: true }; delete test[id]; resetInteg(); await loadInteg(); }
  catch (e) { msg[id] = { text: e.status === 404 ? 'Serveren har ikke Media-integrasjonene ennå.' : e.message, ok: false }; }
  render(); return true;
}
/** Feilmelding fra testen gjort forståelig (401 = feil nøkkel, ECONNREFUSED = feil adresse/port). */
const why = (t) => { const x = String(t ?? ''); if (/401|unauthori[sz]ed|forbidden|403/i.test(x)) return `${x} · sjekk API-nøkkelen / passordet`; if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout|tidsavbrudd/i.test(x)) return `${x} · sjekk adresse og port`; return x; };
async function runTest(id, render) {
  const s = svc(id);
  const form = document.querySelector(`[data-m43i="${CSS.escape(id)}"]`);
  const typed = form ? s.fields.some((f) => form.elements[f.key]?.value.trim() && (isSecret(f) || form.elements[f.key].value.trim() !== String(f.value ?? ''))) : false;
  if (typed) await save(id, render);
  const s2 = svc(id), miss2 = s2.fields.filter((f) => !f.optional && !/valgfri/i.test(f.label) && !filled(f));
  if (miss2.length && !typed) { test[id] = { ok: false, msg: `Mangler ${miss2.map((f) => f.label.toLowerCase()).join(', ')}`, at: Date.now() }; render(); return; }
  test[id] = { st: 'run' }; render();
  try {
    const r = await api(`/integrations/${encodeURIComponent(id)}/test`, { method: 'POST' });
    test[id] = { ok: !!r.ok, msg: r.ok ? r.message ?? `✓ ${s2.name}${r.version ? ` v${r.version}` : ''} svarte${r.ms ? ` på ${r.ms} ms` : ''}` : why(r.message ?? r.error), ms: r.ms, at: Date.now() };
  } catch (e) { test[id] = { ok: false, msg: e.status === 404 ? 'Serveren har ikke test for denne tjenesten ennå.' : why(e.message), at: Date.now() }; }
  render();
}

/** Klikk på undersiden. Returnerer true når klikket er håndtert. */
export async function mediaClick43(e, render) {
  const c = e.target.closest('[data-m43i-copy]');
  if (c) { e.preventDefault(); const v = c.dataset.m43iCopy; try { await navigator.clipboard.writeText(v); copied = v; } catch { copied = ''; } render(); setTimeout(() => { if (copied === v) { copied = ''; render(); } }, 1800); return true; }
  const sv = e.target.closest('[data-m43i-save]');
  if (sv) { e.preventDefault(); await save(sv.dataset.m43iSave, render); return true; }
  const tb = e.target.closest('[data-m43i-test]');
  if (tb) { e.preventDefault(); await runTest(tb.dataset.m43iTest, render); return true; }
  return false;
}
/** Enter i et felt lagrer i stedet for å sende skjemaet. */
export function mediaSubmit43(e, render) {
  const f = e.target.closest?.('[data-m43i]');
  if (!f) return false;
  e.preventDefault(); save(f.dataset.m43i, render); return true;
}
