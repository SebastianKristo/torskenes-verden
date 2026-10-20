// Prompt 41 (claude-code-innlogging-uten-server.md): Innstillinger → Konto → SERVER.
// Lokal og ekstern adresse lagres per bruker på serveren (GET/PUT /api/me/server {local, external, auto}) og synkes til
// mobilappene og Kalender. «Bytt automatisk»: lokal når den svarer innen 300 ms, ellers ekstern. Eldre server (404): bare lokalt.
// Adressene er ikke hemmelige (GET /api/discovery viser dem uinnlogget), men nettsiden selv bruker alltid adressen den er åpnet fra.
import { api, esc, sheetBtn } from './util.js';

const S = { d: null, loaded: false, missing: false, now: null, sheet: null, test: null, msg: '', busy: false };
let rerender = () => {};

const okUrl = (u) => /^https?:\/\/[^\s/]+/i.test(String(u ?? '').trim());
const clean = (u) => String(u ?? '').trim().replace(/\/+$/, '');

export async function loadServer41(r) {
  if (r) rerender = r;
  if (S.loaded) return;
  S.loaded = true;
  const [me, disc] = await Promise.allSettled([api('/me/server'), api('/discovery')]);
  const D = disc.status === 'fulfilled' ? disc.value : null;
  if (me.status === 'fulfilled') S.d = { local: me.value.local ?? D?.local?.[0] ?? '', external: me.value.external ?? D?.external ?? '', auto: me.value.auto !== false };
  else { S.missing = me.reason?.status === 404; S.d = { local: D?.local?.[0] ?? '', external: D?.external ?? location.origin, auto: true }; }
  S.now = isLocalHost(location.hostname) ? 'Lokal' : 'Ekstern';
  rerender();
}
function isLocalHost(h) { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/i.test(h); }

/** Rader til Konto-siden. */
export function serverGroup41(row, group) {
  const d = S.d ?? { local: '', external: '', auto: true };
  return group('Server', [
    row({ t: 'Lokal adresse', s: 'Brukes når du er hjemme på Wi-Fi', v: d.local || 'ikke satt', act: 'data-srv41="local"', btn: 'Endre', k: 'server adresse lokal ip wifi' }),
    row({ t: 'Ekstern adresse', s: 'Brukes ellers, for eksempel på mobilnett', v: d.external || 'ikke satt', act: 'data-srv41="external"', btn: 'Endre', k: 'server adresse ekstern domene' }),
    row({ t: 'Bytt automatisk', s: `Lokal når den svarer innen 300 ms, ellers ekstern${S.now ? ` · nå: ${S.now}` : ''}`, tog: d.auto !== false, act: 'data-srv41-auto', k: 'server bytt automatisk lokal ekstern' }),
  ], `Appene spør ikke etter serveradresse ved innlogging. Adressene lagres på kontoen din og brukes av mobilappene og Kalender.${S.missing ? ' Serveren lagrer ikke adressene ennå, så endringer gjelder bare her.' : ''}`);
}

function sheetHtml() {
  const k = S.sheet;
  if (!k) return '';
  const d = S.d ?? {}, v = S.draft ?? d[k] ?? '';
  const t = S.test;
  return `<div class="srv41-ov" data-srv41-close><div class="srv41-sh" role="dialog" aria-modal="true" aria-labelledby="srv41-t">
    <div class="srv41-h"><b id="srv41-t">${k === 'local' ? 'Lokal adresse' : 'Ekstern adresse'}</b>${sheetBtn('Lukk', 'data-srv41-close', 'ghost')}</div>
    <label class="srv41-f"><span>Adresse</span><input type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" data-srv41-in value="${esc(v)}" placeholder="${k === 'local' ? 'http://192.168.1.40:8080' : 'https://home.kristo.no'}"></label>
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
  if (u.protocol === 'http:' && location.protocol === 'https:') return { ok: false, text: 'Kan ikke teste en http-adresse fra en https-side. Adressen lagres likevel, og appene tester den selv.' };
  return new Promise((res) => {
    const img = new Image(), to = setTimeout(() => { img.src = ''; res({ ok: false, text: `${u.host} svarte ikke innen 5 s` }); }, 5000);
    img.onload = () => { clearTimeout(to); res({ ok: true, text: `✓ Homelab svarer på ${u.host} · ${Math.round(performance.now() - t0)} ms` }); };
    img.onerror = () => { clearTimeout(to); res({ ok: false, text: `Fant ikke Homelab på ${u.host}` }); };
    img.src = `${u.origin}/assets/icons/icon.svg?t=${Date.now()}`;
  });
}

async function save(patch) {
  S.d = { ...(S.d ?? {}), ...patch };
  try { const r = await api('/me/server', { method: 'PUT', json: S.d }); if (r && typeof r === 'object') S.d = { ...S.d, ...r }; S.missing = false; return true; }
  catch (e) { if (e.status === 404) { S.missing = true; return true; } S.msg = e.message; return false; }
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const open = t.closest('[data-srv41]');
  if (open && open.closest('#settings')) { e.preventDefault(); e.stopPropagation(); S.sheet = open.dataset.srv41; S.draft = null; S.test = null; S.msg = ''; paintSheet(); return; }
  const auto = t.closest('[data-srv41-auto]');
  if (auto && auto.closest('#settings')) { e.preventDefault(); e.stopPropagation(); await save({ auto: !(S.d?.auto !== false) }); rerender(); return; }
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
    if (ok) { closeSheet(); rerender(); } else paintSheet();
  }
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) { e.stopPropagation(); closeSheet(); } }, true);
