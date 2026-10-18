// Innstillinger → Varsler (prompt 17): alt om varsler samlet. Hovedbryter, stille timer, tillatelse på enheten,
// «Test varsel», varsellyd (fem innebygde, egen lyd eller stille) og volum, og gruppene Pakker, Finans og hjem,
// Familie, Reise og vær og Haptikk. Lagres per bruker på serveren (/api/me/notify); pakkevarslene er de samme
// som Sporing brukte (/api/tracking/prefs).
import { api, esc } from './util.js';

export const SOUNDS = [['klokke', 'Klokke'], ['pling', 'Pling'], ['papir', 'Papir'], ['dobbel', 'Dobbel'], ['dyp', 'Dyp'], ['egen', 'Egen lyd'], ['stille', 'Stille']];
const GROUPS = [['pakker', 'Pakker', 'Ny pakke, klar for henting, ute for levering og levert'], ['finans', 'Finans og hjem', 'Kvitteringer til gjennomgang, faste trekk og boliger'],
  ['familie', 'Familie', 'Når noen kommer til eller forlater en sone'], ['reise', 'Reise og vær', 'Avvik på avganger og farevarsler'], ['birthdays', 'Bursdager', 'Påminnelse kl. 09:00 før bursdager'], ['haptikk', 'Haptikk', 'Vibrasjon sammen med varslene (mobil)']];
const PKG = [['found', 'Ny pakke funnet', 'Fra Finn eller e-post'], ['pickup', 'Klar for henting', 'Med hentested og frist'], ['out', 'Ute for levering', 'Når budet er på vei'],
  ['delayed', 'Forsinket', 'Når ETA passeres eller transportøren melder avvik'], ['delivered', 'Levert', '']];
const DEF = { on: true, quietFrom: '22:00', quietTo: '07:00', quietOn: true, sound: 'pling', volume: 70, groups: { pakker: true, finans: true, familie: true, reise: true, birthdays: true, haptikk: true }, customSound: null };

const S = { n: null, pkg: null, err: null, msg: '', busy: false };
let rerender = () => {};

export async function loadNotify(onChange) {
  if (onChange) rerender = onChange;
  const [n, t] = await Promise.all([api('/me/notify').catch((e) => ({ __err: e })), api('/tracking').catch(() => null)]);
  if (n?.__err) { S.n = { ...DEF, groups: { ...DEF.groups } }; S.err = /404|finnes ikke|Not Found/i.test(n.__err.message) ? 'Serveren lagrer ikke varselinnstillinger ennå. Valgene gjelder bare denne nettleseren til Homelab er oppdatert.' : n.__err.message; }
  else { S.n = { ...DEF, ...n, groups: { ...DEF.groups, ...(n.groups ?? {}) } }; S.err = null; }
  S.pkg = t?.prefs ?? null;
  rerender();
}

async function save(patch) {
  Object.assign(S.n, patch);
  rerender();
  try { const r = await api('/me/notify', { method: 'PUT', json: patch }); if (r && typeof r === 'object') S.n = { ...S.n, ...r, groups: { ...S.n.groups, ...(r.groups ?? {}) } }; S.msg = ''; }
  catch (e) { S.msg = /404|Not Found/i.test(e.message) ? 'Lagret bare i denne økten (serveren mangler varsel-API-et).' : e.message; }
  rerender();
}

/* ---------- Lyd ---------- */

// Innebygd lyd fra serveren (/assets/sounds/<id>.wav). Mangler filen, lages en enkel tone med WebAudio.
const TONES = { klokke: [[880, 0, 0.18], [1320, 0.18, 0.32]], pling: [[1046, 0, 0.22]], papir: [[620, 0, 0.08], [520, 0.09, 0.16]], dobbel: [[988, 0, 0.12], [988, 0.18, 0.3]], dyp: [[220, 0, 0.45]] };
function synth(id, vol) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [f, a, b] of TONES[id] ?? TONES.pling) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = id === 'dyp' ? 'sine' : 'triangle';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + a);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.5), ctx.currentTime + a + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + b);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + a); o.stop(ctx.currentTime + b + 0.02);
    }
    setTimeout(() => ctx.close(), 1500);
  } catch { /* ingen lyd */ }
}

export async function playSound(id = S.n?.sound, volume = S.n?.volume ?? 70) {
  if (!id || id === 'stille') return;
  const vol = Math.max(0, Math.min(1, volume / 100));
  const src = id === 'egen' ? '/api/me/notify/sound' : `/assets/sounds/${id}.wav`;
  try {
    const a = new Audio(src);
    a.volume = vol;
    await a.play();
  } catch { if (id !== 'egen') synth(id, vol); }
}

async function testNotify() {
  const n = S.n;
  if (!n.on) { S.msg = 'Varsler er slått av. Slå dem på for å teste.'; return rerender(); }
  await playSound();
  if (n.groups.haptikk) navigator.vibrate?.([30, 60, 30]);
  if ('Notification' in window) {
    if (Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
    if (Notification.permission === 'granted') {
      try { new Notification('Testvarsel', { body: 'Slik ser varslene fra Homelab ut på denne enheten.', icon: document.querySelector('link[rel="icon"]')?.href, silent: true }); }
      catch { const sw = await navigator.serviceWorker?.getRegistration?.(); sw?.showNotification('Testvarsel', { body: 'Slik ser varslene fra Homelab ut på denne enheten.', silent: true }); }
      S.msg = 'Testvarsel sendt.';
    } else S.msg = Notification.permission === 'denied' ? 'Varsler er blokkert i nettleseren. Tillat dem i nettleserens innstillinger for denne siden.' : 'Varselet ble ikke vist: tillatelse mangler.';
  } else S.msg = 'Denne nettleseren støtter ikke varsler. Lyd og vibrasjon er testet.';
  rerender();
}

/* ---------- Visning ---------- */

const perm = () => (!('Notification' in window) ? ['Ikke støttet', ''] : Notification.permission === 'granted' ? ['Tillatt', 'var(--green)'] : Notification.permission === 'denied' ? ['Blokkert', '#f59a8f'] : ['Ikke spurt', '']);

/** Hovedsiden for Varsler. h = { group, row, note } fra settings.js. */
export function notifyView(h) {
  const n = S.n;
  if (!n) return { html: '<div class="skeleton" style="min-height:200px"></div>' };
  const [pt, pc] = perm();
  const sound = SOUNDS.find(([k]) => k === n.sound)?.[1] ?? 'Pling';
  const groups = [
    h.group('Varsler', [
      h.row({ t: 'Varsler', s: n.on ? 'Homelab kan varsle deg' : 'Ingen varsler sendes', tog: !!n.on, act: 'data-nf-tog="on"' }),
      h.row({ t: 'Stille timer', s: `${n.quietFrom}–${n.quietTo}: ingen lyd eller vibrasjon`, tog: n.quietOn !== false, act: 'data-nf-tog="quietOn"' }),
      n.quietOn !== false ? `<div class="sg-row"><span class="sg-txt"><b>Fra og til</b><span>Varsler kommer fortsatt, men stille</span></span><span class="nf-times"><input type="time" value="${esc(n.quietFrom)}" data-nf-time="quietFrom" aria-label="Stille fra"><span>–</span><input type="time" value="${esc(n.quietTo)}" data-nf-time="quietTo" aria-label="Stille til"></span></div>` : '',
      h.row({ t: 'Tillatelse på denne enheten', s: 'Nettleseren må tillate varsler fra Homelab', v: pt, vc: pc, btn: 'Notification' in window && Notification.permission === 'granted' ? false : 'Spør', act: 'data-nf-act="perm"' }),
      h.row({ t: 'Test varsel', s: 'Spiller lyden, vibrerer og viser et varsel', btn: 'Test', act: 'data-nf-act="test"' }),
    ], S.err ? esc(S.err) : S.msg ? esc(S.msg) : ''),
    h.group('Varsellyd', [
      `<div class="nf-sounds">${SOUNDS.map(([k, nm]) => `<button type="button" class="nf-sound${n.sound === k ? ' on' : ''}" data-nf-sound="${k}" aria-pressed="${n.sound === k}">${k === 'stille' ? '🔕' : k === 'egen' ? '♪' : '♫'} ${esc(nm)}</button>`).join('')}</div>`,
      `<label class="sg-row nf-vol"><span class="sg-txt"><b>Volum</b><span>${sound}</span></span><input type="range" min="0" max="100" step="5" value="${n.volume}" data-nf-vol aria-label="Volum"><span class="sg-v" data-nf-volv>${n.volume} %</span></label>`,
      `<label class="sg-row" style="cursor:pointer"><span class="sg-txt"><b>Egen lyd</b><span>${n.customSound ? `Lastet opp: ${esc(n.customSound.name ?? 'egen lyd')}` : 'MP3, WAV eller M4A under 1 MB'}</span></span><span class="sg-btn2">${n.customSound ? 'Bytt' : 'Last opp'}</span><input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a" data-nf-upload hidden></label>`,
      n.customSound ? h.row({ t: 'Fjern egen lyd', tc: '#f59a8f', btn: 'Fjern', act: 'data-nf-act="unsound"' }) : '',
    ]),
    h.group('Grupper', GROUPS.map(([k, t, s]) => h.row({ t, s, tog: n.groups[k] !== false, act: `data-nf-grp="${k}"` })), 'Slår du av en gruppe, kommer ingen varsler fra den på noen av enhetene dine.'),
  ];
  if (S.pkg && n.groups.pakker !== false) {
    groups.push(h.group('Pakker', PKG.map(([k, t, s]) => h.row({ t, s, tog: !!S.pkg[k], act: `data-nf-pkg="${k}"` })), 'Kilder (e-post, Finn og automatisk arkivering) velges på Sporing-siden.'));
  }
  return { groups };
}

export async function notifyClick(e) {
  const b = e.target.closest('[data-nf-tog],[data-nf-act],[data-nf-sound],[data-nf-grp],[data-nf-pkg]');
  if (!b || !S.n) return false;
  if (b.dataset.nfTog) { const k = b.dataset.nfTog; await save({ [k]: k === 'quietOn' ? S.n.quietOn === false : !S.n[k] }); return true; }
  if (b.dataset.nfSound) {
    const id = b.dataset.nfSound;
    if (id === 'egen' && !S.n.customSound) { S.msg = 'Last opp en lyd først.'; rerender(); return true; }
    await save({ sound: id }); playSound(id); return true;
  }
  if (b.dataset.nfGrp) { const k = b.dataset.nfGrp; await save({ groups: { ...S.n.groups, [k]: S.n.groups[k] === false } }); return true; }
  if (b.dataset.nfPkg) {
    const k = b.dataset.nfPkg;
    try { S.pkg = (await api('/tracking/prefs', { method: 'PUT', json: { [k]: !S.pkg[k] } })).prefs; } catch (er) { S.msg = er.message; }
    rerender(); return true;
  }
  switch (b.dataset.nfAct) {
    case 'test': await testNotify(); return true;
    case 'perm': if ('Notification' in window) await Notification.requestPermission().catch(() => {}); rerender(); return true;
    case 'unsound':
      try { await api('/me/notify/sound', { method: 'DELETE' }); S.n.customSound = null; if (S.n.sound === 'egen') await save({ sound: 'pling' }); } catch (er) { S.msg = er.message; }
      rerender(); return true;
  }
  return false;
}

export function notifyInput(e) {
  if (!e.target.matches?.('[data-nf-vol]')) return false;
  const v = +e.target.value;
  e.target.closest('.nf-vol')?.querySelector('[data-nf-volv]')?.replaceChildren(`${v} %`);
  return true;
}

export async function notifyChange(e) {
  const t = e.target;
  if (t.matches('[data-nf-vol]')) { await save({ volume: +t.value }); playSound(); return true; }
  if (t.matches('[data-nf-time]')) { await save({ [t.dataset.nfTime]: t.value || DEF[t.dataset.nfTime] }); return true; }
  if (t.matches('[data-nf-upload]')) {
    const f = t.files[0]; t.value = '';
    if (!f) return true;
    if (f.size > 1024 * 1024) { S.msg = 'Lyden må være under 1 MB'; rerender(); return true; }
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api('/me/notify/sound', { method: 'POST', body: fd }); S.n.customSound = r.customSound ?? { name: f.name }; await save({ sound: 'egen' }); playSound('egen'); }
    catch (er) { S.msg = er.message; rerender(); }
    return true;
  }
  return false;
}
