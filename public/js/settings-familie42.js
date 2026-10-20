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

function haView(H) {
  const { note } = H;
  if (!F.fam && !F.loading) loadFam42();
  const base = { title: 'Home Assistant · Mobilapp', sub: 'Familie · Helse (Familie)' };
  if (F.haMissing) return { ...base, html: `<div class="sg-empty">Serveren har ikke Home Assistant-helse ennå. Oppdater Homelab, så vises HA-enhetene her.</div>` };
  if (F.haErr) return { ...base, html: `<div class="sg-empty">${esc(F.haErr)}</div>` };
  if (!F.ha) return { ...base, html: '<div class="sg-empty">Henter enhetene fra Home Assistant …</div>' };
  if (F.ha.connected === false) return { ...base, html: `<div class="sg-empty">${esc(F.ha.error === 'token' ? 'Tokenet til Home Assistant er utløpt. Koble til Home Assistant på nytt under Integrasjoner.' : F.ha.message || 'Home Assistant er ikke satt opp. Legg inn adresse og token under Integrasjoner.')}</div><button type="button" class="sbtn" data-go="int">Åpne Integrasjoner</button>` };
  const devs = devicesOf(F.ha);
  F.draft ??= Object.fromEntries(devs.map((d) => [d.id, { personId: d.personId ?? suggest(d), sensors: d.selected ?? (d.personId ? d.sensors : d.sensors.filter((k) => DEF_SENS.includes(k))) }]));
  const opts = (cur) => `<option value="">Ingen</option>${members().map((m) => `<option value="${esc(m.userId)}"${cur === m.userId ? ' selected' : ''}>${esc(m.name)}${m.self ? ' (deg)' : ''}</option>`).join('')}`;
  const card = (d) => {
    const dr = F.draft[d.id] ?? { personId: null, sensors: [] }, none = !d.sensors.length;
    const stale = d.unavailableSince ? `Ingen data fra ${d.name} siden ${new Date(d.unavailableSince).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}` : '';
    return `<section class="f42-dev${none ? ' none' : ''}"><div class="f42-dh"><b>${esc(d.name || d.id)}</b><span>${esc([d.model, d.entities != null ? `${d.entities} entiteter` : '', none ? 'Ingen helsesensorer' : `${d.sensors.length} helsesensorer`].filter(Boolean).join(' · '))}</span></div>
      ${none ? '' : `<label class="f42-person"><span>Koble til person</span><select data-f42-person="${esc(d.id)}" aria-label="Person for ${esc(d.name)}">${opts(dr.personId)}</select></label>
      <div class="f42-sens" role="group" aria-label="Sensorer">${d.sensors.map((k) => `<label class="f42-sen"><input type="checkbox" data-f42-sensor="${esc(d.id)}" value="${esc(k)}"${dr.sensors.includes(k) ? ' checked' : ''}><span>${esc(SENS[k] ?? k.replace(/_/g, ' '))}</span></label>`).join('')}</div>
      ${d.platform === 'ios' ? '<span class="f42-warn">Begrenset på iPhone: bare skritt, etasjer og aktivitet fra HA. Puls og søvn krever Homelab-appen (Apple Health).</span>' : ''}
      ${stale ? `<span class="f42-warn">${esc(stale)}</span>` : ''}`}</section>`;
  };
  const html = `${devs.length ? devs.map(card).join('') : '<div class="sg-empty">Fant ingen enheter fra Mobilapp-integrasjonen i Home Assistant.</div>'}
    ${note('Én person kan ha flere enheter. Da slås dataene sammen (Health Connect før iPhone-skritteller, høyeste skritt per dag, ingen dobbelttelling). Hver person må godkjenne deling første gang, og kan trekke den tilbake når som helst.')}
    <div class="f42-save"><button type="button" class="sbtn pri" data-f42="hasave"${F.busy || !devs.length ? ' disabled' : ''}>${F.busy ? 'Lagrer …' : 'Lagre'}</button><span>Første synk henter 30 dager historikk.</span></div>`;
  return { ...base, html };
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
  const b = e.target.closest('[data-f42]');
  if (!b) return false;
  const a = b.dataset.f42;
  if (a === 'apple') { toast('Apple Health: endre tilgang i Helse-appen → Deling → Apper → Homelab', { ms: 4000 }); return true; }
  if (a === 'hc') { toast('Health Connect: endre tilgang i Innstillinger → Health Connect → Apper → Homelab', { ms: 4000 }); return true; }
  if (a === 'hasave') {
    const devices = Object.entries(F.draft ?? {}).map(([id, d]) => ({ id, personId: d.personId || null, sensors: d.personId ? d.sensors : [] }));
    F.busy = true; render();
    try { F.ha = await api('/family/health/ha', { method: 'PUT', json: { devices } }); F.draft = null; toast('Lagret. Helsedata hentes fra Home Assistant.'); }
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
