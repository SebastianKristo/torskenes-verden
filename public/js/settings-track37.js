// Prompt 37 (claude-code-sporing-delte-nokler.md → UI): Innstillinger → Integrasjoner → Sporing (alle brukere).
// API-nøkler for sporing er delt i husstanden (admin legger dem inn). Pakker og sporingsnumre er alltid private.
// GET /api/tracking/keys → {providers:[{id, name, set, tail, status, addedBy, updatedAt}], quota:{used, mine, limit, perUserPct}, admin}
// PUT /api/tracking/keys/:id {key} (admin), DELETE /api/tracking/keys/:id fjerner. Test: POST …/:id/test (valgfri). Eldre server (404): ingen seksjon.
import { api, esc } from './util.js';

const K = { d: null, loading: false, err: null, msg: {}, test: {} };
const DOM = { parcelsapp: 'parcelsapp.com', postnord: 'postnord.no', posten: 'posten.no', bring: 'bring.no', mybring: 'bring.no', helthjem: 'helthjem.no', dhl: 'dhl.com', ups: 'ups.com', instabox: 'instabox.se', porterbuddy: 'porterbuddy.com', '17track': '17track.net', budbee: 'budbee.com', imap: 'proton.me', gmail: 'mail.google.com', webhook: null };
const ST = { ok: ['OK', '#34c759'], error: ['Feil', '#f26b5e'], quota: ['Kvote brukt opp', '#f3b54a'], missing: ['Ikke satt', '#8f897c'] };

export async function loadTrackKeys(rerender, force = false) {
  if (K.loading || (K.d && !force) || K.err === 404) return;
  K.loading = true;
  try { K.d = await api('/tracking/keys'); K.err = null; } catch (e) { K.err = e.status ?? e.message; K.d = null; }
  K.loading = false;
  rerender?.();
}
export const trackKeys = () => K.d;
const mask = (p) => (p.set ? p.masked ?? `••••${p.tail ?? ''}` : 'ikke satt');
const byName = (p) => (typeof p.addedBy === 'object' ? p.addedBy?.name : p.addedBy) ?? '';
// Prompt 41 (claude-code-postnord-uten-nokkel.md): PostNord sporer uten konto og uten nøkkel (offentlig Track & Trace). Nøkkelen er valgfri.
const keyless41 = (p) => p.id === 'postnord' && !p.set;
const stOf = (p) => (keyless41(p) ? (p.status === 'error' || p.health === 'error' ? ['PostNord svarer ikke akkurat nå', '#f26b5e'] : ['OK · offentlig endepunkt', '#34c759']) : ST[p.set ? (p.status ?? 'ok') : 'missing'] ?? ST.ok);
const byLine = (p) => (keyless41(p) ? 'Sporing uten konto og uten nøkkel · nøkkel er valgfri' : p.set ? `Delt i husstanden${byName(p) ? ` · lagt inn av ${byName(p)}` : ''}` : 'Ikke satt opp');

/** Linjen på Sporing-siden: «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
export function quotaLine(d = K.d) {
  const pa = d?.providers?.find((p) => p.set && (p.id === 'parcelsapp' || p.quota)) ?? d?.providers?.find((p) => p.set);
  if (!pa) return '';
  const q = d.quota ?? {};
  if (q.text) return String(q.text).replace(/[.]$/, '');
  const left = q.limit != null ? Math.max(0, q.limit - (q.used ?? 0)) : null;
  const mine = q.limit != null && q.mine != null ? ` · du har brukt ${q.mine} av husstandens ${q.limit} oppslag denne måneden` : '';
  return `Bruker husstandens ${pa.name}-nøkkel${left != null ? ` · ${left} oppslag igjen` : ''}${mine}`;
}

/** Gruppen i Integrasjoner-oversikten (null før data / på eldre server). */
export function trackGroup(row, group) {
  const d = K.d;
  if (!d?.providers?.length) return null;
  const rows = d.providers.map((p) => {
    const [v, vc] = stOf(p);
    return row({ t: p.name, s: p.set ? `${byLine(p)} · ${mask(p)}` : keyless41(p) ? byLine(p) : 'Ikke satt opp', k: 'sporing api nøkkel', logo: DOM[p.id] ?? null, ini: p.name, v, vc, btn: d.admin ? 'Endre' : 'Vis', go: `int|trk37:${p.id}` });
  });
  const q = quotaLine(d);
  return group('Sporing · delt i husstanden', rows, `${d.admin ? 'Nøklene gjelder alle i husstanden, så ingen trenger egne nøkler.' : 'Administreres av admin. Du kan spore uten å legge inn egne nøkler.'} Pakker og sporingsnumre er alltid private.${q ? ` ${esc(q)}.` : ''}`);
}

/** Undersiden for én leverandør. */
export function trackSub(id, note) {
  const p = K.d?.providers?.find((x) => String(x.id) === String(id));
  if (!p) return null;
  const admin = !!K.d.admin, [v, vc] = stOf(p), t = K.test[id], m = K.msg[id];
  const upd = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const head = `<div class="int-head"><span class="sg-v" style="color:${vc}">${esc(v)}</span><div><b>${esc(p.name)}</b><span>${esc(byLine(p))}${upd ? ` · ${esc(upd)}` : ''}</span></div></div>`;
  const F = (Array.isArray(p.fields) && p.fields.length ? p.fields : [{ key: 'key', label: 'API-nøkkel', set: p.set, tail: p.tail, masked: p.masked }]).map((f) => (p.id === 'postnord' && !/valgfri/i.test(f.label) ? { ...f, label: `${f.label} (valgfri)` } : f));
  const fm = (f) => (f.set ? f.masked ?? `••••${f.tail ?? ''}` : 'ikke satt');
  const field = admin
    ? `<form class="sg" data-trk37="${esc(p.id)}"><h3 class="sg-t">Nøkler</h3><div class="sg-box">${F.map((f) => `<label class="sg-field"><span>${esc(f.label)}</span><input name="${esc(f.key)}" type="password" value="" placeholder="${esc(f.set ? `${fm(f)} lagret` : 'ikke satt')}" autocomplete="off" spellcheck="false"></label>`).join('')}</div></form>
      <div class="sg-acts">${p.set ? `<button class="sg-btn" data-trk37-del="${esc(p.id)}">Fjern</button>` : ''}<button class="sg-btn pri" data-trk37-test="${esc(p.id)}"${t === 'run' || (!p.set && p.id !== 'postnord') ? ' disabled' : ''}>${t === 'run' ? 'Tester …' : 'Test'}</button><span class="${m ? (m.ok ? 'green' : 'red') : 'muted'}" style="font-size:13px">${esc(m?.text ?? 'Lagres når du forlater feltet · kryptert på serveren, vises aldri i klartekst')}</span></div>`
    : `<div class="sg"><div class="sg-box">${F.map((f) => `<div class="sg-row"><span class="sg-txt"><b>${esc(f.label)}</b><span>Administreres av admin</span></span><span class="sg-v mono">${esc(fm(f))}</span></div>`).join('')}</div></div>`;
  const q = quotaLine(K.d);
  const pn = p.id === 'postnord' ? note('Sporing uten konto og uten nøkkel. Homelab spør PostNords offentlige sporing (det samme som postnord.no bruker) med bare sporingsnummeret, maks én gang per pakke per 15 minutter og aldri om natta (00–06). Pakker som ikke er skannet ennå står som «Ikke skannet ennå». Med egen nøkkel fra PostNord Developer brukes det offisielle API-et først.') : '';
  return { title: p.name, sub: 'Integrasjoner · Sporing', html: `${head}${pn}${field}${note(`Delt i husstanden. Alle kan spore pakker med denne nøkkelen, men pakker og sporingsnumre er private for hver bruker.${q ? ` ${esc(q)}.` : ''}`)}` };
}

async function put(id, key, render, field = null) {
  K.msg[id] = { text: key ? 'Lagrer …' : 'Fjerner …', ok: true }; render();
  try { await (key ? api(`/tracking/keys/${encodeURIComponent(id)}`, { method: 'PUT', json: field && field !== 'key' ? { fields: { [field]: key } } : { key } }) : api(`/tracking/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => (e.status === 404 ? api(`/tracking/keys/${encodeURIComponent(id)}`, { method: 'PUT', json: { key: null } }) : Promise.reject(e)))); K.msg[id] = { text: key ? 'Lagret ✓' : 'Fjernet ✓', ok: true }; await loadTrackKeys(null, true); }
  catch (e) { K.msg[id] = { text: e.status === 403 ? 'Bare admin kan endre nøklene' : e.message, ok: false }; }
  render();
}

export async function trackClick(e, render) {
  const tb = e.target.closest('[data-trk37-test]');
  if (tb) {
    const id = tb.dataset.trk37Test; K.test[id] = 'run'; render();
    try { const r = await api(`/tracking/keys/${encodeURIComponent(id)}/test`, { method: 'POST' }); K.msg[id] = { text: r.ok === false ? `Feilet: ${r.message ?? r.error ?? ''}` : `✓ OK${r.message ? ` · ${r.message}` : ''}`, ok: r.ok !== false }; }
    catch (er) { K.msg[id] = { text: er.status === 404 ? 'Serveren kan ikke teste nøkkelen ennå' : er.message, ok: false }; }
    delete K.test[id]; render(); return true;
  }
  const del = e.target.closest('[data-trk37-del]');
  if (del) { if (confirm('Fjerne nøkkelen for hele husstanden?')) await put(del.dataset.trk37Del, null, render); return true; }
  return false;
}
export function trackChange(e, render) {
  const f = e.target.closest('[data-trk37]');
  if (!f) return false;
  const v = e.target.value.trim();
  if (v) put(f.dataset.trk37, v, render, e.target.name);
  return true;
}
