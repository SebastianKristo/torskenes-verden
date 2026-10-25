// Prompt 52 (claude-code-chat-tankegang-bildeminiatyr.md, claude-code-chat-velg-modell-scroll.md): Chat på web og PWA.
//  - Tankegang: pille «✦ Tenker … 2,1 s ▾» mens modellen tenker (listen åpen), «✦ Tenkte i 2,1 s ›» (lukket) når svaret strømmer
//    og på lagrede meldinger (m.think / m.thS fra SRV52). Trykk viser/skjuler stegene. Tankegangen sendes aldri tilbake til modellen.
//  - Miniatyr: 96 × 120 over brukerens boble (radius 16/16/6/16), og attTh (JPEG maks 220 px, kvalitet 0,72) på meldingen.
//  - Velg modell: arket scroller (ingen krymping), overscroll-behavior: contain.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sec = (s) => `${(Math.round((+s || 0) * 10) / 10).toFixed(1).replace('.', ',')} s`;

const CSS = `
.ch-thk52{margin:2px 0 8px}
.ch-thk52 .ch-thp{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--cl,rgba(127,127,127,.25));background:transparent;color:var(--cm,#6b665c);border-radius:999px;padding:5px 12px;min-height:30px;font:600 13px/1.2 Manrope,Geist,system-ui,sans-serif;cursor:pointer}
.ch-thk52 .ch-thp:hover{color:var(--ct,inherit)}
.ch-thk52 .ch-thp:focus-visible{outline:2px solid #b23a2a;outline-offset:2px}
.ch-thk52 .ch-thp i{font-style:normal;color:#b23a2a}
.ch-thk52 .ch-thp .ar{font-size:11px;transition:transform .18s}
.ch-thk52 .ch-thp[aria-expanded=true] .ar.r{transform:rotate(90deg)}
.ch-thk52.live .ch-thp b{font-weight:600;animation:thk52 1.4s ease-in-out infinite}
@keyframes thk52{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.ch-thk52.live .ch-thp b{animation:none}}
.ch-thk52 ol{margin:8px 0 0 6px;padding:2px 0 2px 14px;border-left:2px solid var(--cl,rgba(127,127,127,.25));list-style:none;counter-reset:thk}
.ch-thk52 li{counter-increment:thk;margin:0 0 5px;color:var(--cm,#6b665c);font:400 13.5px/1.5 Manrope,Geist,system-ui,sans-serif}
.ch-thk52 li::before{content:counter(thk) ". ";font:600 11.5px 'IBM Plex Mono','JetBrains Mono',monospace;opacity:.8}
.ch-thk52 .src{display:block;margin-top:2px;font:500 11.5px Manrope,Geist,system-ui,sans-serif;color:var(--cm,#6b665c);opacity:.85}
/* Miniatyrer over brukerens boble */
.ch-uimg50.one img,.ch-uimg50.grid button,.ch-uimg50.grid img{width:96px;height:120px;max-width:none;max-height:none;object-fit:cover}
.ch-uimg50{flex-wrap:wrap;gap:6px}
.ch-uimg50.grid{display:flex;justify-content:flex-end;grid-template-columns:none}
.ch-uimg50 button{border-radius:16px 16px 6px 16px;border:1px solid var(--cl,rgba(127,127,127,.3));box-shadow:0 4px 14px -6px rgba(0,0,0,.35);overflow:hidden}
.ch-uimg50 button img{border-radius:0!important;display:block}
/* Velg modell: ett scrollbart ark, ingenting krympes */
.ch-sheet{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.ch-sheet>*{flex:none!important}
@media (max-width:767px){.ch-sheet{padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}}
`;
export function css52() { if (!document.getElementById('chat52-css')) { const s = document.createElement('style'); s.id = 'chat52-css'; s.textContent = CSS; document.head.appendChild(s); } }

/** Tankegangen til en lagret melding. → {steps, s, source} eller null. */
export function thinkOf52(m) {
  const t = m?.think ?? m?.meta?.think;
  if (!Array.isArray(t) || !t.length) return null;
  return { steps: t.map(String), s: m.thS ?? m.meta?.thS ?? 0, source: m.thinkSource ?? m.meta?.thinkSource ?? '' };
}

/** Pillen + stegene. live = modellen tenker nå (teller, listen åpen som standard). */
export function thinkHtml52({ key, steps = [], s = 0, live = false, open, source = '' }) {
  const isOpen = open ?? live;
  const label = live ? `<b>Tenker …</b> <span data-ch-ths>${sec(s)}</span>` : `Tenkte i ${sec(s)}`;
  const src = source === 'glimt' ? '<span class="src">Glimts egne steg (modellen viser ikke tankegang)</span>' : '';
  return `<div class="ch-thk52${live ? ' live' : ''}"><button type="button" class="ch-thp" data-ch-thk="${esc(key)}" aria-expanded="${isOpen}"><i aria-hidden="true">✦</i>${label}<span class="ar${live ? '' : ' r'}" aria-hidden="true">${live ? '▾' : '›'}</span></button>${isOpen && steps.length ? `<ol aria-label="Tankegang">${steps.map((x) => `<li data-no-i18n>${esc(x)}</li>`).join('')}</ol>${src}` : ''}</div>`;
}

/** Nedskalert JPEG (maks 220 px, kvalitet 0,72) som data-URL, for attTh på meldingen. */
export async function thumbDataUrl52(file, max = 220) {
  try {
    if (!file?.type?.startsWith('image/') || /heic|heif/i.test(file.type)) return null;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const u = c.toDataURL('image/jpeg', 0.72);
    return u.length < 60_000 ? u : c.toDataURL('image/jpeg', 0.5);
  } catch { return null; }
}
