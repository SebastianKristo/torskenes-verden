// Prompt 33 (PWA): Innstillinger → AI → GLIMT HUSKER. Listen over det brukeren har lært Glimt (navn → type/tittel),
// Slett, «Legg til» (navn + type + valgfri tittel) og «Endre tittel på N avtaler?» etter lagring.
// API: GET/POST /api/glimt/memory, DELETE /api/glimt/memory/:id, POST /api/glimt/memory/:id/apply (via /assets/js/glimt-memory.js).
// «Lær Glimt hva dette er…» i detaljarket ligger i mobile-kal.js.
import { esc } from './core.js';
import { draw, flash } from './mobile.js';
import { haptic } from './mobile-haptics.js';
import { RELEASES, WIDGET_STEPS, WIDGET_NOTE, KAL_APP } from '/assets/js/widget-help.js';
import { LEARN_TYPES, typeName, memoryLine, loadMemory, addMemory, deleteMemory, applyMemory } from '/assets/js/glimt-memory.js';

const GM = { list: null, err: '', loading: false, add: false, type: 'frisør', busy: false, ask: null, msg: '' };
function load(force = false) {
  if (GM.loading || (GM.list && !force)) return;
  GM.loading = true;
  loadMemory(force).then((l) => { GM.list = l; GM.err = ''; }).catch((e) => { GM.err = e.message; GM.list = []; }).finally(() => { GM.loading = false; draw(); });
}

export function memSection() {
  load();
  const rows = GM.list === null ? '<div class="opt-row"><span class="m-grow pp-mut">Laster …</span></div>'
    : GM.list.length ? GM.list.map((x) => `<div class="opt-row p17-row"><span class="m-grow p17-rt"><b>${esc(x.match)}</b><small>${esc(memoryLine(x))}</small></span><button type="button" class="p33-del" data-p33="del" data-id="${esc(x.id)}" aria-label="Slett ${esc(x.match)}">Slett</button></div>`).join('')
      : '<div class="opt-row"><span class="m-grow pp-mut">Glimt husker ingenting ennå. Skriv f.eks. «husk at Påhåret er frisøren min» til Glimt.</span></div>';
  const ask = GM.ask ? `<div class="opt-row p33-ask"><span class="m-grow p17-rt"><b>Endre tittel på ${GM.ask.count} ${GM.ask.count === 1 ? 'avtale' : 'avtaler'}?</b><small>Til «${esc(GM.ask.title)}»</small></span><button type="button" class="p33-del" data-p33="noapply">Nei</button><button type="button" class="p33-del ink" data-p33="apply"${GM.busy ? ' disabled' : ''}>Endre</button></div>` : '';
  const form = GM.add ? `<form class="p33-form" data-p33f>
      <input class="k27-in" name="match" placeholder="Navn, f.eks. Påhåret" autocomplete="off" required minlength="2" maxlength="80">
      <div class="k27-chips">${LEARN_TYPES.map(([v, n]) => `<button type="button" class="${GM.type === v ? 'on' : ''}" data-p33="type" data-v="${v}" aria-pressed="${GM.type === v}">${n}</button>`).join('')}</div>
      <input class="k27-in" name="title" placeholder="Tittel (valgfri), f.eks. Frisør · Påhåret" autocomplete="off" maxlength="120">
      <div class="k27-btns"><button type="button" data-p33="cancel">Avbryt</button><button type="submit" class="ink"${GM.busy ? ' disabled' : ''}>${GM.busy ? 'Lagrer …' : 'Lagre'}</button></div></form>`
    : '<button class="opt-row p17-row" data-p33="add"><span class="m-grow p17-rt"><b>Legg til</b><small>Navn på avsender og hva det er</small></span><span class="p17-chev" aria-hidden="true">+</span></button>';
  return `<span class="pp-lab p17-gl">GLIMT HUSKER</span><div class="list p17-list p27-set p33-list">${rows}${ask}${form}${GM.msg ? `<div class="opt-row"><span class="m-grow pp-mut">${esc(GM.msg)}</span></div>` : ''}</div>
    <div class="snote">Det du lærer Glimt, f.eks. at «Påhåret» er frisøren din. Brukes når du legger inn timer og spør «når er neste frisørtime». Lagres bare for deg og sendes aldri til sky.${GM.err ? ` (${esc(GM.err)})` : ''}</div>`;
}

export async function bind33(e, t) {
  const x = t.closest?.('[data-p33]');
  if (!x) return false;
  e.preventDefault(); e.stopPropagation();
  switch (x.dataset.p33) {
    case 'add': GM.add = true; GM.msg = ''; draw(); setTimeout(() => document.querySelector('[data-p33f] [name=match]')?.focus({ preventScroll: true }), 40); return true;
    case 'cancel': GM.add = false; break;
    case 'type': GM.type = x.dataset.v; haptic('tab'); {
      // Behold det som er skrevet når chipsene tegnes på nytt.
      const f = x.closest('form'), mt = f?.match?.value ?? '', tt = f?.title?.value ?? '';
      draw(); const f2 = document.querySelector('[data-p33f]'); if (f2) { f2.match.value = mt; f2.title.value = tt; }
      return true;
    }
    case 'del': {
      const id = Number(x.dataset.id);
      try { await deleteMemory(id); GM.list = (GM.list ?? []).filter((m) => m.id !== id); GM.msg = 'Slettet ✓'; haptic('ok'); } catch (err) { GM.msg = `Kunne ikke slette: ${err.message}`; }
      break;
    }
    case 'noapply': GM.ask = null; break;
    case 'apply': {
      const a = GM.ask; if (!a) return true;
      GM.busy = true; draw();
      try { const d = await applyMemory(a.id); flash(`${d.count} ${d.count === 1 ? 'avtale' : 'avtaler'} fikk nytt navn ✓`); } catch (err) { GM.msg = `Kunne ikke endre: ${err.message}`; }
      GM.busy = false; GM.ask = null; break;
    }
    default: return true;
  }
  draw(); return true;
}

export async function submit33(e, t) {
  if (!t.matches?.('[data-p33f]')) return false;
  e.preventDefault();
  const match = String(t.match?.value ?? '').trim(), title = String(t.title?.value ?? '').trim();
  if (match.length < 2) { GM.msg = 'Skriv navnet på avsenderen.'; draw(); return true; }
  GM.busy = true; draw();
  try {
    const d = await addMemory({ match, type: GM.type, title: title || null });
    GM.list = await loadMemory(true); GM.add = false; GM.msg = 'Lagret ✓'; haptic('ok');
    GM.ask = d.matches ? { id: d.item.id, count: d.matches, title: d.item.title || `${typeName(GM.type)} · ${match}` } : null;
  } catch (err) { GM.msg = `Kunne ikke lagre: ${err.message}`; }
  GM.busy = false; draw(); return true;
}

/* ---------- Prompt 33: Innstillinger → Widgets og Kalender-appen ---------- */
const stepList = (l) => `<ol class="p33-steps" style="margin:0;padding:2px 0 2px 20px;display:flex;flex-direction:column;gap:7px;font-size:14.5px;line-height:1.5;flex:1;min-width:0">${l.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
/** «Slik legger du til widget» med steg for iPhone, Samsung og Android. */
export function widgetsPage() {
  return `<div class="snote">Widgets krever Homelab- eller Kalender-appen fra App Store/APK. En nettapp (PWA) lagt på Hjem-skjermen kan ikke ha widgets.</div>
    ${WIDGET_STEPS.map(([, n, l]) => `<span class="pp-lab p17-gl">${esc(n.toUpperCase())}</span><div class="list p17-list p33-list"><div class="opt-row">${stepList(l)}</div></div>`).join('')}
    <div class="snote">${esc(WIDGET_NOTE)}</div>`;
}
/** Kalender-appen: forklaring og lenke til release (IPA/APK). PWA-en beholder sin egen kalender. */
export function kalAppPage() {
  return `<div class="list p17-list p33-list"><div class="opt-row"><span class="m-grow p17-rt"><b>Kalender</b><small>${esc(KAL_APP.lead)}</small></span></div><div class="opt-row">${stepList(KAL_APP.points)}</div></div>
    <span class="pp-lab p17-gl">LAST NED</span><div class="list p17-list p33-list"><a class="opt-row p17-row" href="${RELEASES}" target="_blank" rel="noopener"><span class="m-grow p17-rt"><b>Siste versjon på GitHub</b><small>Kalender-…-unsigned.ipa · Kalender-….apk</small></span><span class="p17-chev" aria-hidden="true">↗</span></a>
    <a class="opt-row p17-row" href="#/kal"><span class="m-grow p17-rt"><b>Åpne kalenderen her</b><small>Kalenderen i denne appen</small></span><span class="p17-chev" aria-hidden="true">›</span></a></div>
    <div class="snote">${esc(KAL_APP.pwa)}</div>`;
}
