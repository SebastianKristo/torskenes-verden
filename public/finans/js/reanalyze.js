// «✦ Analyser på nytt med Gemini»: sender originalbildet til Gemini og viser resultatet side om side med det forrige.
// Brukes av desktop (bekreftelsessiden og køen) og PWA-en. Brukeren velger hvilket resultat som beholdes.
import { api, esc, n2, dd } from './core.js';

/** Knappene: «✦ Analyser på nytt med Gemini» (når det trengs) og «Les med lokal OCR» (Tesseract, uten AI).
 *  Gemini-knappen er deaktivert med årsak når Gemini ikke er satt opp. Tom streng når ingen trengs. */
export function reanalyzeBtn(r, cls = 'btn ghost', style = '') {
  if (!r) return '';
  const st = style ? ` style="${esc(style)}"` : '';
  let out = '';
  if (r.canReanalyze) out += `<button type="button" class="${cls} ra-btn"${st} data-reanalyze="${esc(r.id)}">✦ Analyser på nytt med Gemini</button>`;
  else if (r.reanalyzeReason) out += `<button type="button" class="${cls} ra-btn"${st} disabled title="${esc(r.reanalyzeReason)}">✦ Analyser på nytt med Gemini</button>`;
  if (r.canOcr) out += `<button type="button" class="${cls} ra-btn"${st} data-reanalyze="${esc(r.id)}" data-engine="tesseract" title="Leser bildet lokalt på serveren med Tesseract, uten AI">Les med lokal OCR</button>`;
  return out;
}

/** Klikk på [data-reanalyze] innenfor root åpner dialogen. onDone(kvittering) kalles når et valg er gjort.
 *  Bind før sidens egen klikkhåndterer på samme element: klikket stoppes, så f.eks. et omsluttende køkort ikke åpnes. */
export function bindReanalyze(root, onDone) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-reanalyze]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault(); e.stopImmediatePropagation();
    openReanalyze(b.dataset.reanalyze, { onDone, engine: b.dataset.engine === 'tesseract' ? 'tesseract' : 'gemini' });
  });
}

const CSS = `
.ra-ov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ra-box{width:min(760px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--card,#141418);color:var(--text,#F2F2F4);border:1px solid var(--line,#24242A);border-radius:20px;padding:20px;font:14px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.ra-box h3{margin:0 0 4px;font-size:18px;font-weight:650}
.ra-sub{color:var(--muted,#8C8C96);font-size:13px;margin-bottom:16px}
.ra-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:560px){.ra-cols{grid-template-columns:1fr}}
.ra-col{background:var(--inner,#1B1B20);border:1px solid var(--line,#24242A);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}
.ra-col.new{border-color:#4F6BFF66;box-shadow:inset 0 0 0 1px #4F6BFF33}
.ra-h{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600}
.ra-tag{font-size:11.5px;padding:2px 8px;border-radius:99px;background:#24242A;color:var(--text2,#B9B9C2);font-weight:500}
.ra-col.new .ra-tag{background:#1C2450;color:#B6C3FF}
.ra-row{display:flex;justify-content:space-between;gap:8px;font-size:13.5px}
.ra-row span:first-child{color:var(--muted,#8C8C96)}
.ra-row b{font-weight:600;text-align:right}
.ra-row b.diff{color:#FFD27A}
.ra-items{border-top:1px solid var(--line,#24242A);padding-top:8px;font-size:12.5px;color:var(--text2,#B9B9C2);display:flex;flex-direction:column;gap:3px;max-height:180px;overflow:auto}
.ra-items div{display:flex;justify-content:space-between;gap:8px}
.ra-err{color:#FF8A80;font-size:12.5px}
.ra-act{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
.ra-act button{height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--line2,#2A2A31);background:var(--inner,#1B1B20);color:inherit;font:inherit;font-weight:600;cursor:pointer}
.ra-act button.pri{background:#4F6BFF;border-color:#4F6BFF;color:#fff}
.ra-act button:disabled{opacity:.5;cursor:default}
.ra-diff{display:flex;flex-direction:column;border:1px solid var(--line,#24242A);border-radius:14px;overflow:hidden}
.ra-diff>div{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(0,1fr);gap:10px;padding:9px 12px;border-bottom:1px solid var(--line,#24242A);font-size:13.5px}
.ra-diff>div:last-child{border-bottom:0}.ra-diff span{color:var(--muted,#8C8C96)}.ra-diff s{color:var(--muted,#8C8C96);overflow-wrap:anywhere}.ra-diff b{font-weight:600;color:#FFD27A;overflow-wrap:anywhere}
.ra-ok{padding:14px;border-radius:14px;background:rgba(61,214,140,.1);color:var(--pos,#3DD68C);font-weight:600}
.ra-more{margin-top:12px;font-size:13px}.ra-more summary{cursor:pointer;color:var(--muted,#8C8C96);margin-bottom:10px}
.ra-load{display:flex;align-items:center;gap:12px;padding:28px 4px;color:var(--text2,#B9B9C2)}
.ra-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid #4F6BFF44;border-top-color:#4F6BFF;animation:ra-s .8s linear infinite}
@keyframes ra-s{to{transform:rotate(360deg)}}`;

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)} %`);
const money = (v) => (v == null ? '–' : `${n2(v)} kr`);

function column(x, other, title, isNew) {
  const row = (label, v, ov) => `<div class="ra-row"><span>${label}</span><b class="${isNew && String(v) !== String(ov) ? 'diff' : ''}">${esc(v)}</b></div>`;
  const items = (x.items ?? []).map((l) => `<div><span>${esc(l.description || '–')}</span><span>${money(l.amount)}</span></div>`).join('');
  return `<div class="ra-col${isNew ? ' new' : ''}">
    <div class="ra-h"><span>${esc(title)}</span><span class="ra-tag">${esc(x.engine ?? 'Ukjent motor')}</span></div>
    ${row('Butikk', x.merchant ?? '–', other.merchant ?? '–')}
    ${row('Dato', x.date ? dd(x.date) + '.' + x.date.slice(0, 4) : '–', other.date ? dd(other.date) + '.' + other.date.slice(0, 4) : '–')}
    ${row('Total', money(x.total), money(other.total))}
    ${row('Kategori', x.category ?? '–', other.category ?? '–')}
    ${row('Sikkerhet', pct(x.confidence), pct(other.confidence))}
    ${row('Varelinjer', String((x.items ?? []).length), String((other.items ?? []).length))}
    ${x.error ? `<div class="ra-err">${esc(x.error)}</div>` : ''}
    ${items ? `<div class="ra-items">${items}</div>` : ''}
  </div>`;
}

/** Endringer felt for felt og linje for linje (butikk, dato, beløp, kategori, linjer). */
function diff40(a, b) {
  const out = [], ds = (d) => (d ? `${dd(d)}.${d.slice(0, 4)}` : '–');
  const f = (n, x, y) => { if (String(x ?? '') !== String(y ?? '')) out.push({ f: n, o: x ?? '–', n: y ?? '–' }); };
  f('Butikk', a.merchant, b.merchant); f('Dato', ds(a.date), ds(b.date)); f('Beløp', money(a.total), money(b.total)); if (b.category) f('Kategori', a.category, b.category);
  const A = a.items ?? [], B = b.items ?? [], n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i], y = B[i];
    const t = (l) => (l ? `${l.description || '–'} ${money(l.amount)}` : '–');
    if (!x || !y || x.description !== y.description || Math.abs((x.amount ?? 0) - (y.amount ?? 0)) > 0.005) out.push({ f: `Linje ${i + 1}`, o: t(x), n: y ? t(y) : '(fjernet)' });
  }
  const va = JSON.stringify(a.vat ?? null), vb = JSON.stringify(b.vat ?? null); if (b.vat && va !== vb) out.push({ f: 'MVA', o: (a.vat ?? []).map((v) => `${v.rate} %: ${money(v.amount)}`).join(', ') || '–', n: (b.vat ?? []).map((v) => `${v.rate} %: ${money(v.amount)}`).join(', ') });
  return out;
}

/** Åpner dialogen og starter analysen. Returnerer et løfte med kvitteringen etter valget (eller null ved avbryt). */
export function openReanalyze(id, { onDone, engine = 'gemini' } = {}) {
  const ocr = engine === 'tesseract', name = ocr ? 'Lokal OCR' : 'Gemini';
  // Prompt 40 (claude-code-finans-les-pa-nytt-rediger.md): «✦ La Glimt lese kvitteringen på nytt» – endringene vises som
  // «gammelt → nytt», og lagres bare når du trykker «Bruk endringene».
  const title = ocr ? 'Les med lokal OCR' : '✦ Glimt leser kvitteringen på nytt';
  const sub = ocr ? 'Originalbildet leses på serveren med Tesseract, uten AI og uten at noe sendes ut. Du velger selv hvilket resultat som beholdes.' : 'Glimt leser originalbildet i full oppløsning på nytt. Endringene lagres bare hvis du trykker «Bruk endringene».';
  const loading = ocr ? 'Tesseract leser kvitteringen …' : 'Glimt leser kvitteringen på nytt … Sjekker butikk, dato, hver linje og at summen stemmer';
  if (!document.getElementById('ra-css')) { const s = document.createElement('style'); s.id = 'ra-css'; s.textContent = CSS; document.head.appendChild(s); }
  const ov = document.createElement('div');
  ov.className = 'ra-ov';
  ov.innerHTML = `<div class="ra-box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
    <div class="ra-sub">${esc(sub)}</div>
    <div class="ra-body"><div class="ra-load"><span class="ra-spin"></span>${esc(loading)}</div></div>
    <div class="ra-act"><button type="button" data-ra="cancel">Avbryt</button></div></div>`;
  document.body.appendChild(ov);
  let busy = true, data = null, resolve;
  const done = new Promise((r) => { resolve = r; });
  const close = (r = null) => { ov.remove(); document.removeEventListener('keydown', key); resolve(r); if (r) onDone?.(r); };
  const key = (e) => { if (e.key === 'Escape' && !busy) close(); };
  document.addEventListener('keydown', key);
  const body = ov.querySelector('.ra-body'), act = ov.querySelector('.ra-act');
  ov.addEventListener('click', async (e) => {
    if (e.target === ov && !busy) return close();
    const b = e.target.closest('[data-ra]');
    if (!b) return;
    const k = b.dataset.ra;
    if (k === 'cancel') return close();
    if (k === 'retry') return run();
    if (k === 'old' || k === 'new') {
      act.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      try { close(await api(`/receipts/${encodeURIComponent(id)}/reanalyze/apply`, { method: 'POST', json: { candidateId: data.candidateId, keep: k } })); }
      catch (err) { body.insertAdjacentHTML('beforeend', `<div class="ra-err" style="margin-top:10px">${esc(err.message)}</div>`); act.querySelectorAll('button').forEach((x) => { x.disabled = false; }); }
    }
  });
  async function run() {
    busy = true;
    body.innerHTML = `<div class="ra-load"><span class="ra-spin"></span>${esc(loading)}</div>`;
    act.innerHTML = '<button type="button" data-ra="cancel">Avbryt</button>';
    try {
      data = await api(`/receipts/${encodeURIComponent(id)}/reanalyze`, { method: 'POST', json: { engine } });
      const ch = diff40(data.previous ?? {}, data.result ?? {}), R = data.result ?? {};
      const items = R.items ?? [], sum = items.reduce((t, l) => t + (Number(l.amount) || 0), 0), sumOk = !items.length || R.total == null || Math.abs(sum - R.total) < 0.01;
      const sumNote = sumOk ? '' : `<div class="ra-err" style="margin-top:10px">Summen av linjene (${money(sum)}) stemmer ikke med totalen (${money(R.total)}). Bruk «Rediger alt» i transaksjonen for å rette.</div>`;
      if (!ch.length && !R.error) {
        body.innerHTML = `<div class="ra-ok">Ingen endringer. Butikk, dato og alle ${items.length} linjer stemmer${R.total != null && sumOk ? `, og summen er ${money(R.total)}` : ''}.</div>${sumNote}`;
        act.innerHTML = '<button type="button" class="pri" data-ra="old">OK</button>';
      } else {
        body.innerHTML = `${R.error ? `<div class="ra-err">${esc(R.error)}</div>` : `<div class="ra-sub" style="margin:0 0 8px">${ch.length} ${ch.length === 1 ? 'endring' : 'endringer'} funnet:</div><div class="ra-diff">${ch.map((c) => `<div><span>${esc(c.f)}</span><s>${esc(c.o)}</s><b>→ ${esc(c.n)}</b></div>`).join('')}</div>`}${sumNote}
          <details class="ra-more"><summary>Vis begge side om side</summary><div class="ra-cols">${column(data.previous, data.result, 'Forrige', false)}${column(data.result, data.previous, name, true)}</div></details>`;
        act.innerHTML = `<button type="button" data-ra="old">Behold som før</button><button type="button" class="pri" data-ra="new"${R.error ? ' disabled' : ''}>Bruk endringene</button>`;
      }
    } catch (err) {
      body.innerHTML = `<div class="ra-err" style="padding:12px 0">${esc(err.message)}</div>`;
      act.innerHTML = '<button type="button" data-ra="cancel">Lukk</button><button type="button" class="pri" data-ra="retry">Prøv igjen</button>';
    } finally { busy = false; }
  }
  run();
  return done;
}
