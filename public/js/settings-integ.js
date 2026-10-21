// Integrasjoner fra /api/integrations (prompt 24): integrasjonene som ikke allerede har en gruppe i /api/config
// (Google Kalender, AI, Bank, IMAP, Mybring, PostNord, ParcelsApp, Finn, Ikoner …) vises under «Flere integrasjoner»,
// med status, felt som kan redigeres, Test tilkobling og Fjern verdi. Hemmeligheter vises bare som «•••• lagret».
// ISO2: alle får sine egne personlige integrasjoner (scope 'personal'); servergruppene (scope 'server') kommer bare til admin.
// Eldre server (404): ingenting legges til, og alt annet er som før.
import { api, esc } from './util.js';

let list = null, loading = false;
// Prompt 43: Media-tjenestene har egen gruppe (settings-integ43.js).
const MEDIA43 = new Set(['sonarr', 'radarr', 'qbittorrent', 'qbit', 'prowlarr', 'jellyfin', 'plex']);
const msg = {}, test = {};
const DOMAIN = { ha: 'home-assistant.io', homeassistant: 'home-assistant.io', google: 'calendar.google.com', gcal: 'calendar.google.com', ai: 'gemini.google.com', gemini: 'gemini.google.com', t212: 'trading212.com', trading212: 'trading212.com', bank: 'sparebank1.no', imap: 'proton.me', entur: 'entur.org', mybring: 'bring.no', bring: 'bring.no', postnord: 'postnord.no', parcelsapp: 'parcelsapp.com', cloudflare: 'cloudflare.com', finn: 'finn.no', met: 'yr.no', map: 'maptiler.com', kart: 'maptiler.com', icons: 'iconify.design', ikoner: 'iconify.design', unsplash: 'unsplash.com', pexels: 'pexels.com', photos: 'unsplash.com' };

export async function loadInteg(rerender) {
  if (loading || list) return;
  loading = true;
  try { const r = await api('/integrations'); list = Array.isArray(r) ? r : r.items ?? r.integrations ?? []; } catch { list = []; }
  loading = false;
  rerender?.();
}
export const resetInteg = () => { list = null; };
/** Én integrasjon fra /api/integrations (null før listen er hentet eller hvis serveren ikke har den). */
export const integById = (id) => (Array.isArray(list) ? list.find((x) => String(x.id) === String(id)) ?? null : null);

/** Integrasjonene som ikke dekkes av en gruppe i /api/config (samme lagringsnøkler). */
function extra(cfg) {
  if (!Array.isArray(list) || !list.length) return [];
  const keys = new Set((cfg ?? []).flatMap((g) => g.fields.map((f) => f.key))), ids = new Set((cfg ?? []).map((g) => g.id).filter(Boolean));
  return list.filter((it) => !it.hidden && !ids.has(it.id) && !MEDIA43.has(String(it.id).toLowerCase()) && String(it.group ?? '').toLowerCase() !== 'media' && !(it.fields?.length && it.fields.every((f) => keys.has(f.key))));
}
const statusTxt = (it) => {
  const t = test[it.id];
  if (t?.st === 'run') return ['Tester …', '#b6bccb'];
  if (t) return t.ok ? ['✓ OK', '#8fe0b0'] : ['✕ Feilet', '#f59a8f'];
  return it.status === 'ok' ? ['Tilkoblet', undefined] : it.status === 'error' ? ['Feil', '#f59a8f'] : ['Mangler oppsett', '#f3b54a'];
};

const scopeOf = (it) => (it.scope === 'personal' ? 'personal' : 'server');
/** Rader til listen under Integrasjoner (scope: 'personal' | 'server' | utelatt = alle). */
export function integRows(cfg, row, scope) {
  return extra(cfg).filter((it) => !scope || scopeOf(it) === scope).map((it) => {
    const [v, vc] = statusTxt(it);
    return row({ t: it.name, s: it.group ?? '', k: (it.fields ?? []).map((f) => f.label).join(' '), logo: it.domain ?? DOMAIN[String(it.id).toLowerCase()] ?? null, ini: it.name, v, vc, btn: 'Oppsett', go: it.id === 'calendars' ? 'kal' : `int|i24:${it.id}` });
  });
}
export const integCount = (cfg) => extra(cfg).filter((it) => it.status !== 'ok').length;

/** Undersiden for én integrasjon. */
export function integSub(id, note) {
  const it = (list ?? []).find((x) => String(x.id) === String(id));
  if (!it) return null;
  const fields = (it.fields ?? []).map((f) => {
    const type = f.type === 'secret' ? 'password' : f.type === 'url' ? 'url' : 'text';
    const ph = f.type === 'secret' ? (f.saved ? '•••• lagret' : 'ikke satt') : f.placeholder ?? '';
    const val = f.type === 'secret' ? '' : f.value ?? '';
    return `<label class="sg-field"><span>${esc(f.label)}</span><input name="${esc(f.key)}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">${f.saved ? `<button type="button" class="sg-link red" data-i24-clear="${esc(f.key)}">Fjern</button>` : ''}</label>${f.help ? `<div class="sg-fhelp">${esc(f.help)}</div>` : ''}`;
  }).join('');
  const t = test[it.id], m = msg[it.id];
  const res = t && t.st !== 'run' ? `<div class="sg-res"><i style="background:${t.ok ? '#34c759' : '#f26b5e'}"></i><div><b>${t.ok ? 'Tilkoblet' : 'Tilkoblingen feilet'}</b><span>${esc(t.msg ?? '')}</span></div><span class="mono">${new Date(t.at).toLocaleTimeString('nb-NO')}${t.ms ? ` · ${t.ms} ms` : ''}</span></div>` : '';
  const [v, vc] = statusTxt(it);
  const head = `<div class="int-head"><span class="sg-v"${vc ? ` style="color:${vc}"` : ''}>${esc(v)}</span><div><b>${esc(it.name)}</b><span>${esc(it.group ?? '')}</span></div></div>`;
  return { title: it.name, sub: `Integrasjoner · ${it.group ?? ''}`, html: `${head}<form class="sg" data-i24="${esc(it.id)}"><h3 class="sg-t">Oppsett</h3><div class="sg-box">${fields || '<div class="sg-row">Ingen felt.</div>'}</div>${it.help ? note(esc(it.help)) : ''}</form>
    <div class="sg-acts">${it.canTest !== false ? `<button class="sg-btn pri" data-i24-test="${esc(it.id)}"${t?.st === 'run' ? ' disabled' : ''}>${t?.st === 'run' ? 'Tester …' : 'Test tilkobling'}</button>` : ''}
      <span class="${m ? (m.ok ? 'green' : 'red') : 'muted'}" style="font-size:13px">${esc(m?.text ?? 'Endringer lagres automatisk · hemmeligheter lagres kryptert på serveren')}</span></div>${res}` };
}

async function save(id, changes, render) {
  msg[id] = { text: 'Lagrer …', ok: true }; render();
  try {
    const r = await api(`/integrations/${encodeURIComponent(id)}`, { method: 'PUT', json: changes });
    const i = list.findIndex((x) => String(x.id) === String(id));
    if (r && r.fields && i >= 0) list[i] = r; else { list = null; await loadInteg(); }
    msg[id] = { text: 'Lagret ✓', ok: true }; delete test[id];
  } catch (e) { msg[id] = { text: e.message, ok: false }; }
  render();
}

export async function integClick(e, render) {
  const tb = e.target.closest('[data-i24-test]');
  if (tb) {
    e.preventDefault();
    const id = tb.dataset.i24Test; test[id] = { st: 'run' }; render();
    try { const r = await api(`/integrations/${encodeURIComponent(id)}/test`, { method: 'POST' }); test[id] = { ok: !!r.ok, msg: r.message ?? r.error ?? '', ms: r.ms, at: Date.now() }; }
    catch (er) { test[id] = { ok: false, msg: er.message, at: Date.now() }; }
    render(); return true;
  }
  const cl = e.target.closest('[data-i24-clear]');
  if (cl) {
    e.preventDefault();
    const id = cl.closest('[data-i24]').dataset.i24, key = cl.dataset.i24Clear;
    if (!confirm('Fjerne den lagrede verdien?')) return true;
    msg[id] = { text: 'Fjerner …', ok: true }; render();
    try { await api(`/integrations/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { method: 'DELETE' }); list = null; await loadInteg(); msg[id] = { text: 'Fjernet ✓', ok: true }; }
    catch (er) { msg[id] = { text: er.message, ok: false }; }
    render(); return true;
  }
  return false;
}

export function integChange(e, render) {
  const form = e.target.closest('[data-i24]');
  if (!form || !list) return false;
  const id = form.dataset.i24, it = list.find((x) => String(x.id) === String(id)), f = it?.fields?.find((x) => x.key === e.target.name);
  if (!f) return true;
  const v = e.target.value;
  if (f.type === 'secret' ? !v : v === (f.value ?? '')) return true;
  save(id, { [f.key]: v }, render);
  return true;
}
