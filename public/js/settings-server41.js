// Prompt 41 (claude-code-innlogging-uten-server.md): Innstillinger → Konto → SERVER.
// Lokal og ekstern adresse lagres per bruker på serveren (GET/PUT /api/me/server {local, external, auto}) og synkes til
// mobilappene og Kalender. «Bytt automatisk»: lokal når den svarer innen 300 ms, ellers ekstern. Eldre server (404): bare lokalt.
// Adressene er ikke hemmelige (GET /api/discovery viser dem uinnlogget), men nettsiden selv bruker alltid adressen den er åpnet fra.
// Prompt 47 (claude-code-standard-serveradresser.md): forhåndsutfylt med standardadressene (settings-srv47.js, env-overstyrt via
// /api/config), status «Svarer · 34 ms» / «Svarer ikke» og «Test» under hver adresse, og «Tilbakestill til standard».
// En https-side prøver aldri en http-adresse.
import { api, esc, sheetBtn } from './util.js';
import { defaults47, probe47, tone47 } from './settings-srv47.js';

const S = { d: null, loaded: false, missing: false, now: null, sheet: null, test: null, msg: '', busy: false, def: null, st: {} };
let rerender = () => {};

const okUrl = (u) => /^https?:\/\/[^\s/]+/i.test(String(u ?? '').trim());
const clean = (u) => String(u ?? '').trim().replace(/\/+$/, '');

export async function loadServer41(r) {
  if (r) rerender = r;
  if (S.loaded) return;
  S.loaded = true;
  const [me, def] = await Promise.allSettled([api('/me/server'), defaults47()]);
  S.def = def.status === 'fulfilled' ? def.value : { external: 'https://os.smarthjemexperten.no', local: 'http://10.69.1.39:3000' };
  useDef(me.status === 'fulfilled' ? me.value : null);
  // Prompt 47: tomme felt fylles med standardadressene (ikke lenger den oppdagede/Docker-adressen).
  if (me.status === 'fulfilled') S.d = { local: me.value.local || S.def.local, external: me.value.external || S.def.external, auto: me.value.auto !== false };
  else { S.missing = me.reason?.status === 404; S.d = { local: S.def.local, external: S.def.external, auto: true }; }
  S.now = isLocalHost(location.hostname) ? 'Lokal' : 'Ekstern';
  rerender();
  probeAll();
}
/** Serveren (prompt 47) sender sine standardverdier i /api/me/server → defaults. */
function useDef(r) { const x = r?.defaults; if (x?.local && x?.external) S.def = { local: x.local, external: x.external }; }
/** Tester begge adressene (http fra https hoppes over) og tegner på nytt. */
async function probeAll() {
  const d = S.d ?? {};
  await Promise.all(['local', 'external'].map(async (k) => { if (!d[k]) return; S.st[k] = { state: 'run', text: 'Tester …' }; S.st[k] = await probe47(d[k]); }));
  rerender();
}
async function probeOne(k) {
  const v = (S.d ?? {})[k];
  if (!v) return;
  S.st[k] = { state: 'run', text: 'Tester …' }; rerender();
  S.st[k] = await probe47(v); rerender();
}
function isLocalHost(h) { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/i.test(h); }

/** Rader til Konto-siden. */
export function serverGroup41(row, group) {
  const d = S.d ?? { local: '', external: '', auto: true }, def = S.def ?? {};
  const isDef = d.local === def.local && d.external === def.external;
  return group('Server', [
    addrRow('external', 'Ekstern adresse', 'Brukes ellers, for eksempel på mobilnett', d.external, 'server adresse ekstern domene'),
    addrRow('local', 'Lokal adresse', 'Brukes når du er hjemme på Wi-Fi', d.local, 'server adresse lokal ip wifi'),
    row({ t: 'Bytt automatisk', s: `Lokal når den svarer innen 1,5 s, ellers ekstern${S.now ? ` · nå: ${S.now}` : ''}`, tog: d.auto !== false, act: 'data-srv41-auto', k: 'server bytt automatisk lokal ekstern' }),
    row({ t: 'Tilbakestill til standard', s: isDef ? 'Begge adressene er standard' : `${hostOf(def.external)} og ${hostOf(def.local)}`, act: 'data-srv47-reset', btn: 'Tilbakestill', disabled: isDef || S.busy, k: 'server tilbakestill standard adresse' }),
  ], `Appene spør ikke etter serveradresse ved innlogging. Adressene lagres på kontoen din og brukes av mobilappene og Kalender. Nettsiden bruker alltid adressen den er åpnet fra${location.protocol === 'https:' ? ', og prøver aldri en http-adresse fra https' : ''}.${S.missing ? ' Serveren lagrer ikke adressene ennå, så endringer gjelder bare her.' : ''}`);
}
const hostOf = (u) => { try { return new URL(u).host; } catch { return u ?? ''; } };
/** Adresserad med status og to knapper (Test, Endre). Egen HTML fordi row() har bare én knapp. */
function addrRow(k, t, sub, v, kw) {
  const st = S.st[k], col = tone47(st);
  const stat = st ? `<span data-srv47-st="${k}" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-weight:600;${col ? `color:${col}` : 'opacity:.7'}">${col ? `<i style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></i>` : ''}${esc(st.text)}</span>` : '';
  const html = `<div class="sg-row" data-srv47-row="${k}"><span class="sg-txt"><b>${esc(t)}</b><span>${esc(sub)}</span>${stat}</span><span class="sg-v" style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(v || 'ikke satt')}</span>`
    + `<button type="button" class="sg-btn2" data-srv47-test="${k}" style="cursor:pointer"${st?.state === 'run' || !v ? ' disabled' : ''}>Test</button><button type="button" class="sg-btn2" data-srv41="${k}" style="cursor:pointer">Endre</button></div>`;
  return { html, q: [t, sub, v, kw].join(' ') };
}

function sheetHtml() {
  const k = S.sheet;
  if (!k) return '';
  const d = S.d ?? {}, v = S.draft ?? d[k] ?? '';
  const t = S.test;
  return `<div class="srv41-ov" data-srv41-close><div class="srv41-sh" role="dialog" aria-modal="true" aria-labelledby="srv41-t">
    <div class="srv41-h"><b id="srv41-t">${k === 'local' ? 'Lokal adresse' : 'Ekstern adresse'}</b>${sheetBtn('Lukk', 'data-srv41-close', 'ghost')}</div>
    <label class="srv41-f"><span>Adresse</span><input type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" data-srv41-in value="${esc(v)}" placeholder="${esc((S.def ?? {})[k] ?? (k === 'local' ? 'http://10.69.1.39:3000' : 'https://os.smarthjemexperten.no'))}"></label>
    <span class="srv41-hint">${k === 'local' ? 'Brukes når du er hjemme på Wi-Fi.' : 'Brukes når den lokale adressen ikke svarer.'} Må starte med http:// eller https://.</span>
    ${t ? `<span class="srv41-res ${t.ok ? 'ok' : t.run ? '' : 'err'}" role="status">${esc(t.text)}</span>` : ''}
    ${S.msg ? `<span class="srv41-res err" role="status">${esc(S.msg)}</span>` : ''}
    <div class="srv41-acts"><button type="button" class="sg-btn" data-srv41-test${t?.run ? ' disabled' : ''}>${t?.run ? 'Tester …' : 'Test'}</button><button type="button" class="sg-btn pri" data-srv41-save${S.busy ? ' disabled' : ''}>${S.busy ? 'Lagrer …' : 'Lagre'}</button></div>
  </div></div>`;
}
function paintSheet() {
  let host = document.getElementById('srv41-host');
  if (!host) { host = document.createElement('div'); host.id = 'srv41-host'; document.body.appendChild(host); }
  host.innerHTML = sheetHtml();
  host.querySelector('[data-srv41-in]')?.focus({ preventScroll: true });
}
function closeSheet() { S.sheet = null; S.test = null; S.msg = ''; S.draft = null; paintSheet(); }

/** Test: samme opphav → GET /api/discovery med tid. Andre https-adresser: last appikonet som bilde (CSP tillater ikke fetch dit). */
async function test(url) {
  const t0 = performance.now();
  const u = new URL(url);
  if (u.origin === location.origin) {
    const r = await fetch('/api/discovery', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    const ms = Math.round(performance.now() - t0);
    if (r && (r.ok || r.status === 404)) return { ok: true, text: `✓ Homelab svarer på ${u.host} · ${ms} ms` };
    return { ok: false, text: `Fikk ikke svar fra ${u.host}${r ? ` (HTTP ${r.status})` : ''}` };
  }
  if (u.protocol === 'http:' && location.protocol === 'https:') return { ok: false, text: 'Testes ikke: en https-side prøver aldri en http-adresse. Adressen lagres likevel, og appene tester den selv.' };
  return new Promise((res) => {
    const img = new Image(), to = setTimeout(() => { img.src = ''; res({ ok: false, text: `${u.host} svarte ikke innen 5 s` }); }, 5000);
    img.onload = () => { clearTimeout(to); res({ ok: true, text: `✓ Homelab svarer på ${u.host} · ${Math.round(performance.now() - t0)} ms` }); };
    img.onerror = () => { clearTimeout(to); res({ ok: false, text: `Fant ikke Homelab på ${u.host}` }); };
    img.src = `${u.origin}/assets/icons/icon.svg?t=${Date.now()}`;
  });
}

async function save(patch) {
  S.d = { ...(S.d ?? {}), ...patch };
  try { const r = await api('/me/server', { method: 'PUT', json: S.d }); if (r && typeof r === 'object') { S.d = { ...S.d, local: r.local ?? S.d.local, external: r.external ?? S.d.external, auto: r.auto ?? S.d.auto }; useDef(r); } S.missing = false; return true; }
  catch (e) { if (e.status === 404) { S.missing = true; return true; } S.msg = e.message; return false; }
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const open = t.closest('[data-srv41]');
  if (open && open.closest('#settings')) { e.preventDefault(); e.stopPropagation(); S.sheet = open.dataset.srv41; S.draft = null; S.test = null; S.msg = ''; paintSheet(); return; }
  const auto = t.closest('[data-srv41-auto]');
  if (auto && auto.closest('#settings')) { e.preventDefault(); e.stopPropagation(); await save({ auto: !(S.d?.auto !== false) }); rerender(); return; }
  const tst = t.closest('[data-srv47-test]');
  if (tst && tst.closest('#settings')) { e.preventDefault(); e.stopPropagation(); probeOne(tst.dataset.srv47Test); return; }
  const rst = t.closest('[data-srv47-reset]');
  if (rst && rst.closest('#settings')) {
    e.preventDefault(); e.stopPropagation();
    const def = S.def ?? await defaults47();
    S.busy = true; rerender();
    await save({ local: def.local, external: def.external, reset: true, device: 'Nettleser' }); // reset:true = serverens standard (SERVER47)
    delete S.d.reset; delete S.d.device;
    S.busy = false; S.st = {}; rerender(); probeAll(); return;
  }
  if (!t.closest('#srv41-host')) return;
  const cl = t.closest('[data-srv41-close]');
  if (cl && (cl === t || cl.tagName === 'BUTTON')) { closeSheet(); return; }
  const inp = document.querySelector('[data-srv41-in]'), v = clean(inp?.value);
  if (t.closest('[data-srv41-test]')) {
    S.draft = v;
    if (!okUrl(v)) { S.test = { ok: false, text: 'Adressen må starte med http:// eller https://' }; paintSheet(); return; }
    S.test = { run: true, text: 'Tester …' }; paintSheet();
    try { S.test = await test(v); } catch { S.test = { ok: false, text: 'Ugyldig adresse' }; }
    paintSheet(); return;
  }
  if (t.closest('[data-srv41-save]')) {
    S.draft = v;
    if (v && !okUrl(v)) { S.msg = 'Adressen må starte med http:// eller https://'; paintSheet(); return; }
    S.busy = true; S.msg = ''; paintSheet();
    const ok = await save({ [S.sheet]: v });
    S.busy = false;
    if (ok) { const k = S.sheet; if (!v) S.d[k] = (S.def ?? {})[k] ?? ''; closeSheet(); rerender(); probeOne(k); } else paintSheet();
  }
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) { e.stopPropagation(); closeSheet(); } }, true);
