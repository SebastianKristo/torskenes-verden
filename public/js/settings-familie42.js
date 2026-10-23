// Prompt 42 (WEB42): Innstillinger → Familie → «Helse (Familie)» (claude-code-familie-helsekilder-innstillinger.md og
// claude-code-helse-fra-home-assistant.md, fasit Mobil Papir App.dc.html → HELSE (FAMILIE)). Kildekortene står ikke lenger øverst i
// Familie → Helse. På web: samme gruppe med status per enhet:
//   Apple Health · Health Connect (leses av Homelab-appen på telefonen; status fra enhetene dine i GET /api/family)
//   Home Assistant · Mobilapp → underside: HA-enhetene, koble til person, velg sensorer, Lagre (første synk henter 30 dager).
//   Hva deles med familien → skritt, søvn, puls og aktivitet (PUT /api/family/me {shareHealth}).
// API (SERVER42, tåles 404):
//   GET /api/family/health/ha → {connected, error?, message?, devices:[{id, name, model, platform:'android'|'ios', entities, sensors:[{key, entity}],
//                                 personId|null, suggestedPersonId?, selected:[key], lastSeen?, unavailableSince?}]}
//   PUT /api/family/health/ha {devices:[{id, personId, sensors:[key]}]} → samme som GET
import { api, esc } from './util.js';
import { toast } from './toast.js';

const F = { fam: null, ha: null, haMissing: false, haErr: '', loading: null, draft: null, busy: false };
const SENS = {
  steps: 'Skritt', heart_rate: 'Puls', resting_heart_rate: 'Hvilepuls', sleep_duration: 'Søvn', active_calories_burned: 'Aktive kalorier', total_calories_burned: 'Kalorier totalt',
  distance: 'Distanse', floors_climbed: 'Etasjer', floors_ascended: 'Etasjer opp', floors_descended: 'Etasjer ned', weight: 'Vekt', body_fat: 'Fettprosent', oxygen_saturation: 'Oksygenmetning',
  respiratory_rate: 'Pustefrekvens', blood_glucose: 'Blodsukker', vo2_max: 'VO₂ maks', average_active_pace: 'Tempo', activity: 'Aktivitet',
};
const DEF_SENS = ['steps', 'heart_rate', 'resting_heart_rate', 'sleep_duration', 'active_calories_burned', 'activity'];
const SHARE = [['steps', 'Skritt'], ['sleep', 'Søvn'], ['hr', 'Puls'], ['restingHr', 'Hvilepuls'], ['activeKcal', 'Aktivitet'], ['week', 'Siste 7 dager']];

const ago = (ts) => {
  const t = typeof ts === 'number' ? ts : Date.parse(ts ?? '');
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? 'nå' : s < 3600 ? `${Math.round(s / 60)} min siden` : s < 86400 ? `${Math.round(s / 3600)} t siden` : new Date(t).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
};
const keyOf = (s) => (typeof s === 'string' ? s : s?.key ?? String(s?.entity ?? '').replace(/^sensor\.[^_]+_/, ''));
/** Gjør enhetslista robust mot små avvik i svaret (items/devices, person/userId, sensorer som strenger). */
function devicesOf(ha) {
  const L = Array.isArray(ha?.devices) ? ha.devices : Array.isArray(ha?.items) ? ha.items : [];
  return L.filter((d) => d && d.id).map((d) => {
    const sensors = (Array.isArray(d.sensors) ? d.sensors : []).map(keyOf).filter(Boolean);
    const plat = d.platform ?? (/iphone|ipad|ios/i.test(`${d.model ?? ''} ${d.name ?? ''}`) ? 'ios' : /android|pixel|galaxy|oneplus|samsung/i.test(`${d.model ?? ''} ${d.name ?? ''}`) ? 'android' : 'other');
    return { ...d, sensors, platform: plat, personId: d.personId ?? d.userId ?? d.person ?? null, selected: Array.isArray(d.selected) ? d.selected.map(keyOf) : null };
  });
}
const members = () => (F.fam?.members ?? []).filter((m) => m.userId);
/** Forslag fra navnet: «Rune iPhone 13» → Rune. */
function suggest(d) {
  if (d.suggestedPersonId) return d.suggestedPersonId;
  const w = String(d.name ?? '').toLowerCase().split(/[\s'’]+/)[0];
  return members().find((m) => String(m.name ?? '').toLowerCase().split(' ')[0] === w)?.userId ?? null;
}

export function loadFam42(onChange) {
  if (F.loading) return F.loading;
  F.loading = (async () => {
    const [fam, ha] = await Promise.all([api('/family').catch(() => null), api('/family/health/ha').then((r) => ({ r })).catch((e) => ({ e }))]);
    F.fam = fam;
    if (ha.e) { F.haMissing = ha.e.status === 404 || ha.e.status === 405; F.haErr = F.haMissing ? '' : ha.e.message; F.ha = null; }
    else { F.ha = ha.r; F.haMissing = false; F.haErr = ''; }
    F.loading = null;
    onChange?.();
  })();
  return F.loading;
}

function platformStatus(kind) {
  const self = members().find((m) => m.self), devs = Array.isArray(self?.devices) ? self.devices : [];
  const want = kind === 'apple' ? /ios|iphone|ipad|apple/i : /android|pixel|galaxy|oneplus|samsung/i;
  const mine = devs.filter((d) => want.test(`${d.platform ?? ''} ${d.name ?? ''}`) && !/ipad/i.test(d.name ?? ''));
  const h = self?.health, src = String(h?.source ?? h?.sourceLabel ?? '');
  const on = mine.length > 0 && (!src || (kind === 'apple' ? /apple|healthkit|ios/i.test(src) : /connect|android/i.test(src)) || !!h);
  const dev = mine[0];
  return { on, s: dev ? `Koblet til via appen · ${dev.name}${h?.updatedAt ? ` · synket ${ago(h.updatedAt)}` : ''}` : `Ingen ${kind === 'apple' ? 'iPhone' : 'Android-telefon'} med Homelab-appen`, devs: mine };
}

/** Familie-fanen i Innstillinger. H = {group, row, note}. */
export function fam42View(H, sub) {
  if (sub === 'hahealth') return haView(H);
  const { group, row } = H;
  if (!F.fam && !F.loading) loadFam42();
  const ap = platformStatus('apple'), hc = platformStatus('hc');
  const devs = devicesOf(F.ha), linked = devs.filter((d) => d.personId).length;
  const haS = F.haMissing ? 'Serveren har ikke Home Assistant-helse ennå' : F.haErr ? F.haErr : !F.ha ? 'Henter …' : F.ha.connected === false
    ? (F.ha.error === 'token' ? 'Koble til Home Assistant på nytt (tokenet er utløpt)' : F.ha.message || 'Home Assistant er ikke satt opp under Integrasjoner')
    : `Hent helsesensorer fra HA Companion · ${devs.length} ${devs.length === 1 ? 'enhet' : 'enheter'}`;
  const sh = F.fam?.me?.shareHealth ?? {};
  const chips = `<div class="f42-chips" role="group" aria-label="Hva deles med familien">${SHARE.map(([k, n]) => `<button type="button" class="f42-chip${sh[k] ? ' on' : ''}" data-f42-share="${k}" aria-pressed="${!!sh[k]}">${esc(n)}</button>`).join('')}</div>`;
  const devRows = [...ap.devs.map((d) => ['Apple Health', d]), ...hc.devs.map((d) => ['Health Connect', d])].map(([k, d]) => row({ t: d.name || 'Enhet', s: `${k} · Homelab-appen${d.lastSeen ? ` · sist sett ${ago(d.lastSeen)}` : ''}`, v: d.battery != null ? `${Math.round(d.battery)} %` : '', k: 'enhet telefon helse' }));
  return {
    groups: [
      group('Helse (Familie)', [
        row({ t: 'Apple Health', s: ap.s, v: ap.on ? '✓ Koblet' : 'Koble til', vc: ap.on ? '#2f7a4f' : '', act: 'data-f42="apple"', btn: false, k: 'healthkit iphone helse apple' }),
        row({ t: 'Health Connect', s: hc.s, v: hc.on ? '✓ Koblet' : 'Koble til', vc: hc.on ? '#2f7a4f' : '', act: 'data-f42="hc"', btn: false, k: 'android helse google' }),
        row({ t: 'Home Assistant · Mobilapp', s: haS, v: linked ? `${linked} koblet` : '', btn: 'Velg', go: 'familie|hahealth', k: 'home assistant ha companion sensorer skritt puls søvn' }),
        row({ t: 'Hva deles med familien', s: 'Skritt, søvn, puls og aktivitet. Hver person velger selv i sin app eller her.', k: 'deling helse personvern' }),
        chips,
      ], 'Apple Health og Health Connect kan bare leses av Homelab-appen på telefonen. Den sender et sammendrag hit hvert 15. minutt, og bare det du har valgt å dele.'),
      devRows.length ? group('Dine enheter', devRows) : null,
    ].filter(Boolean),
  };
}

// Prompt 45 (claude-code-helse-ha-opprydding.md, fasit Helse Home Assistant.dc.html): bare enheter fra Mobilapp-integrasjonen,
// Telefoner · Alle mobilapp, statuskort, gruppert per person («RUNE · 2», IKKE KOBLET sist), personvelger med avatarer og forslag,
// sensorer som chips med hake, og Lagre (→ ✓ Lagret).  GET /api/family/health/ha?view=phones|all.
const OSC = { android: ['#e3eee5', '#2f6b4a', 'Android'], ios: ['#e6ecf5', '#2b5d8a', 'iPhone'], tablet: ['#ece6da', '#6b665c', 'iPad'], other: ['#ece6da', '#6b665c', 'Enhet'] };
function haView(H) {
  const { note } = H;
  if (!F.fam && !F.loading) loadFam42();
  const base = { title: 'Home Assistant', sub: 'Helse fra mobilappen · les skritt, puls og søvn fra Home Assistant-appen på telefonene. Hver person godkjenner delingen første gang.' };
  if (F.haMissing) return { ...base, html: `<div class="sg-empty">Serveren har ikke Home Assistant-helse ennå. Oppdater Homelab, så vises HA-enhetene her.</div>` };
  if (F.haErr) return { ...base, html: `<div class="sg-empty">${esc(F.haErr)}</div>` };
  if (!F.ha) return { ...base, html: '<div class="sg-empty">Henter enhetene fra Home Assistant …</div>' };
  if (F.ha.connected === false) return { ...base, html: `<div class="sg-empty">${esc(F.ha.error === 'token' ? 'Tokenet til Home Assistant er utløpt. Koble til Home Assistant på nytt under Integrasjoner.' : F.ha.message || 'Home Assistant er ikke satt opp. Legg inn adresse og token under Integrasjoner.')}</div><button type="button" class="sbtn" data-go="int">Åpne Integrasjoner</button>` };
  const all = devicesOf(F.ha), view = F.view ?? 'phones';
  const kindOf = (d) => d.kind ?? (/ipad|tab\b|tablet/i.test(`${d.model ?? ''} ${d.name ?? ''}`) ? 'tablet' : 'phone');
  const devs = view === 'all' ? all : all.filter((d) => kindOf(d) !== 'tablet');
  F.draft ??= Object.fromEntries(all.map((d) => [d.id, { personId: d.personId ?? null, sensors: d.selected ?? (d.personId ? d.sensors : d.sensors.filter((k) => DEF_SENS.includes(k))) }]));
  const mem = members(), mOf = (id) => mem.find((m) => m.userId === id);
  const pcol = (m) => m?.color ?? '#2b5d8a';
  const st = F.ha.status ?? {}, linked = all.filter((d) => F.draft[d.id]?.personId).length;
  const counts = F.ha.counts ?? { phones: all.filter((d) => kindOf(d) !== 'tablet').length, all: all.length };
  const statusCard = `<div class="ha45-st"><i class="${st.connected === false ? 'off' : ''}"></i><span class="ha45-stt"><b>${st.connected === false ? 'Ikke tilkoblet' : 'Tilkoblet'}</b><span>${esc([st.url ?? F.ha.url ?? '', 'Mobilapp-integrasjonen'].filter(Boolean).join(' · '))}</span></span><b class="ha45-stn">${esc(`${linked} av ${all.length} koblet`)}</b></div>`;
  const seg = `<div class="ha45-seg" role="radiogroup" aria-label="Vis">${[['phones', `Telefoner · ${counts.phones ?? 0}`], ['all', `Alle mobilapp · ${counts.all ?? all.length}`]].map(([k, n]) => `<button type="button" role="radio" aria-checked="${view === k}" data-f45-view="${k}">${esc(n)}</button>`).join('')}</div>`;
  const row = (d, i) => {
    const dr = F.draft[d.id] ?? { personId: null, sensors: [] }, has = d.sensors.length > 0, m = mOf(dr.personId);
    const os = kindOf(d) === 'tablet' ? 'tablet' : d.platform === 'ios' ? 'ios' : d.platform === 'android' ? 'android' : 'other', [ib, ic, osn] = OSC[os];
    const icon = os === 'tablet' ? '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M11 18h2"/>' : '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>';
    const chips = has && m ? `<div class="ha45-chips">${d.sensors.map((k) => { const on = dr.sensors.includes(k); return `<button type="button" class="ha45-chip${on ? ' on' : ''}" data-f45-sen="${esc(d.id)}" data-k="${esc(k)}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(SENS[k] ?? k.replace(/_/g, ' '))}</button>`; }).join('')}</div>${os === 'ios' ? '<span class="ha45-ios">Begrenset på iPhone: bare skritt, etasjer og aktivitet. Puls og søvn krever Homelab-appen.</span>' : ''}` : '';
    const stale = d.unavailableSince ? `<span class="ha45-ios">Ingen data fra ${esc(d.name)} siden ${new Date(d.unavailableSince).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>` : '';
    return `<div class="ha45-r${has ? '' : ' none'}${i ? ' bt' : ''}"><div class="ha45-rm"><span class="ha45-ic" style="background:${ib};color:${ic}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span>
      <span class="ha45-rt"><b>${esc(d.name || d.id)}</b><span><em class="${has ? 'ok' : ''}">${esc(d.healthText ?? (has ? `${d.sensors.length} helsesensorer` : 'Ingen helsesensorer'))}</em>${esc(d.os ?? osn)}${d.model ? ` · ${esc(d.model)}` : ''}</span></span>
      <button type="button" class="ha45-pick" data-f45-pick="${esc(d.id)}" aria-label="Hvem bruker ${esc(d.name)}?"><span class="ha45-pav" style="background:${m ? esc(pcol(m)) : '#8f897c'}">${m ? esc(String(m.name ?? '?')[0]) : '+'}</span>${m ? esc(m.name) : 'Velg'} ▾</button></div>${chips}${stale}</div>`;
  };
  const groups = {};
  for (const d of devs) { const k = F.draft[d.id]?.personId ?? '_'; (groups[k] ??= []).push(d); }
  const gHtml = [...mem.filter((m) => groups[m.userId]).map((m) => [m.name.toUpperCase(), pcol(m), groups[m.userId]]), ...(groups._ ? [['IKKE KOBLET', '#8f897c', groups._]] : [])]
    .map(([h, c, L]) => `<div class="ha45-g"><span class="ha45-gh" style="color:${esc(c)}">${esc(h)} · ${L.length}</span><div class="ha45-gb">${L.map(row).join('')}</div></div>`).join('');
  const hidden = F.ha.hidden?.text ?? (F.ha.hidden?.count ? `${F.ha.hidden.count} andre enheter fra Home Assistant vises ikke her. De har ingen helsedata.` : '');
  const sd = F.sheet && all.find((d) => d.id === F.sheet);
  const sheet = sd ? (() => {
    const cur = F.draft[sd.id]?.personId ?? null, sug = sd.suggestedPersonName ?? (mOf(sd.suggestedPersonId ?? suggest(sd))?.name ?? '');
    return `<div class="ha45-sbg" data-f45-sclose><div class="ha45-sh" role="dialog" aria-modal="true" aria-label="Hvem bruker telefonen?"><div class="ha45-shh"><span><b>Hvem bruker telefonen?</b><span>${esc(sd.name)}</span></span><button type="button" class="ha45-x" data-f45-sclose aria-label="Lukk">✕</button></div>
      <div class="ha45-ppl">${[...mem.map((m) => [m.userId, m.name, pcol(m), String(m.name ?? '?')[0]]), [null, 'Ingen', '#8f897c', '–']].map(([id, n, c, i]) => `<button type="button" class="ha45-pp${cur === id ? ' on' : ''}" data-f45-set="${esc(sd.id)}" data-p="${esc(id ?? '')}"><span style="background:${esc(c)}">${esc(i)}</span><b>${esc(n)}</b></button>`).join('')}</div>
      ${sug ? `<span class="ha45-sug">✦ Foreslått ut fra navnet: ${esc(sug)}</span>` : ''}</div></div>`;
  })() : '';
  const html = `${statusCard}${seg}${devs.length ? gHtml : '<div class="sg-empty">Fant ingen enheter fra Mobilapp-integrasjonen i Home Assistant.</div>'}
    ${hidden ? `<span class="ha45-hid">${esc(hidden)}</span>` : ''}
    ${note('Én person kan ha flere enheter. Da slås dataene sammen (Health Connect før iPhone-skritteller, høyeste skritt per dag, ingen dobbelttelling). Første synk henter 30 dager historikk.')}
    <div class="ha45-save"><button type="button" class="sbtn pri" data-f42="hasave"${F.busy || !all.length ? ' disabled' : ''}>${F.busy ? 'Lagrer …' : F.saved ? '✓ Lagret' : 'Lagre'}</button></div>${sheet}`;
  return { ...base, html };
}
function reloadHa(view) {
  F.view = view;
  return api(`/family/health/ha?view=${view === 'all' ? 'all' : 'phones'}`).then((r) => { F.ha = r; }).catch(() => {});
}

/** Klikk i Familie-fanen. Returnerer true når klikket hørte hit. */
export async function fam42Click(e, render) {
  const sb = e.target.closest('[data-f42-share]');
  if (sb) {
    const k = sb.dataset.f42Share, cur = F.fam?.me?.shareHealth ?? {}, want = !cur[k];
    if (F.fam?.me) F.fam.me.shareHealth = { ...cur, [k]: want };
    render();
    try { const r = await api('/family/me', { method: 'PUT', json: { shareHealth: { [k]: want } } }); if (r?.me && F.fam) F.fam.me = r.me; }
    catch (er) { if (F.fam?.me) F.fam.me.shareHealth = cur; toast(er.message); render(); }
    return true;
  }
  const v45 = e.target.closest('[data-f45-view]');
  if (v45) { F.view = v45.dataset.f45View; render(); reloadHa(F.view).then(render); return true; }
  const pk = e.target.closest('[data-f45-pick]');
  if (pk) { F.sheet = pk.dataset.f45Pick; render(); return true; }
  if (e.target.closest('[data-f45-set]')) { const b2 = e.target.closest('[data-f45-set]'); const d = (F.draft ??= {})[b2.dataset.f45Set] ??= { personId: null, sensors: [] }; d.personId = b2.dataset.p || null; if (d.personId && !d.sensors.length) { const dv = devicesOf(F.ha).find((x) => x.id === b2.dataset.f45Set); d.sensors = (dv?.sensors ?? []).filter((k) => DEF_SENS.includes(k)); } F.sheet = null; F.saved = false; render(); return true; }
  if (e.target.closest('[data-f45-sclose]') && (e.target.matches('[data-f45-sclose]') || e.target.closest('.ha45-x'))) { F.sheet = null; render(); return true; }
  const sn = e.target.closest('[data-f45-sen]');
  if (sn) { const d = (F.draft ??= {})[sn.dataset.f45Sen] ??= { personId: null, sensors: [] }, k = sn.dataset.k; d.sensors = d.sensors.includes(k) ? d.sensors.filter((x) => x !== k) : [...d.sensors, k]; F.saved = false; render(); return true; }
  const b = e.target.closest('[data-f42]');
  if (!b) return false;
  const a = b.dataset.f42;
  if (a === 'apple') { toast('Apple Health: endre tilgang i Helse-appen → Deling → Apper → Homelab', { ms: 4000 }); return true; }
  if (a === 'hc') { toast('Health Connect: endre tilgang i Innstillinger → Health Connect → Apper → Homelab', { ms: 4000 }); return true; }
  if (a === 'hasave') {
    const devices = Object.entries(F.draft ?? {}).map(([id, d]) => ({ id, personId: d.personId || null, sensors: d.personId ? d.sensors : [] }));
    F.busy = true; render();
    try { F.ha = await api('/family/health/ha', { method: 'PUT', json: { devices } }); F.draft = null; F.saved = true; toast('Lagret. Helsedata hentes fra Home Assistant.'); if (F.view === 'all') await reloadHa('all'); }
    catch (er) { toast(er.status === 404 ? 'Serveren har ikke Home Assistant-helse ennå' : er.message); }
    F.busy = false; render();
    return true;
  }
  return false;
}
export function fam42Change(e) {
  const t = e.target;
  if (t.matches('[data-f42-person]')) { const d = (F.draft ??= {})[t.dataset.f42Person] ??= { personId: null, sensors: [] }; d.personId = t.value || null; return true; }
  if (t.matches('[data-f42-sensor]')) {
    const d = (F.draft ??= {})[t.dataset.f42Sensor] ??= { personId: null, sensors: [] };
    d.sensors = t.checked ? [...new Set([...d.sensors, t.value])] : d.sensors.filter((x) => x !== t.value);
    return true;
  }
  return false;
}
