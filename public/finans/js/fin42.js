// Prompt 42 (FinansHub web): felles småting – Glimt-orben, ny FinansHub-logo (Økonomi-ikon 3c), fargede menyikoner,
// abonnement-/aksjelogoer og «Glimt tenker … 1,4 s» med tankesteg. Stilene ligger i css/fin42.css.
import { S, api, esc, n0, n2, logoMatch } from './core.js';

/* ---------- Glimt-orben (glOrb i FinansHub v3 Temaer / Boliger Web) ---------- */
// Konisk fargering (#b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6), kremfarget innside og en rød, fylt firetakket stjerne.
// Roterer på 4 s, 1,1 s når Glimt jobber (busy).
let orbN = 0;
export function orb(size = 24, busy = false, cls = '') {
  const id = `g42s${++orbN}`, ring = Math.max(2, Math.round(size * 0.1)), st = Math.round(size * 0.5);
  return `<span class="g42-orb${busy ? ' busy' : ''}${cls ? ` ${cls}` : ''}" style="--o:${size}px;--r:${ring}px" aria-hidden="true"><i></i><b><svg width="${st}" height="${st}" viewBox="0 0 24 24"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f07a4a"/><stop offset="1" stop-color="#d8402e"/></linearGradient></defs><path d="M12 1.5C13 8 16 11 22.5 12C16 13 13 16 12 22.5C11 16 8 13 1.5 12C8 11 11 8 12 1.5Z" fill="url(#${id})"/></svg></b></span>`;
}

/* ---------- FinansHub-logoen: Økonomi-ikonet 3c (mørk blå lommebok med budsjettring) ---------- */
export const LOGO42 = (sz = 28) => `<svg width="${sz}" height="${sz}" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="7" y="14" width="32" height="23" rx="5" stroke="#ffffff" stroke-width="3.2"/><path d="M12 14 L28 8 L31 14" stroke="#ffffff" stroke-width="3.2" stroke-linejoin="round"/><circle cx="34" cy="25.5" r="6.5" fill="#1b2a40" stroke="#ffffff" stroke-width="2.5"/><path d="M34 21 A4.5 4.5 0 0 1 38.3 26.8" stroke="#f2c14e" stroke-width="3"/><path d="M38.3 26.8 A4.5 4.5 0 0 1 31 28.9" stroke="#7fd4c1" stroke-width="3"/><path d="M31 28.9 A4.5 4.5 0 0 1 34 21" stroke="#f6b7c8" stroke-width="3"/></svg>`;
export const brandMark = () => `<span class="brand-ic b42-logo" title="Økonomi">${LOGO42(28)}</span>`;

/* ---------- Fargede menyikoner (claude-code-finanshub-ny-logo.md) ---------- */
export const NAVC = { ov: '#2f6b4a', tx: '#2b5d8a', ai: '#7a5ad6', filter: '#2b7a8a', kv: '#c27a1e', aks: '#2f8a6a', dir: '#b23a2a', finn: '#1f6feb', imp: '#5b4fc4', sub: '#c2477a', konto: '#1b2a40', inn: '#6b665c', bud: '#a8661a', fast: '#3d7f8a', rap: '#8a3fa0' };
export const navTile = (p, on, svg) => (p === 'ai'
  ? `<span class="n42-tile g${on ? ' on' : ''}">${orb(22, on)}</span>`
  : `<span class="n42-tile${on ? ' on' : ''}" style="--nc:${NAVC[p] ?? 'var(--acc)'}">${svg}</span>`);

/* ---------- Abonnement-logoer (claude-code-abonnement-logoer-web.md) ---------- */
// Brikke 44 × 44, radius 12, object-fit: contain med 6 px luft. Registeret kan ha bg (f.eks. Starlink #000) og fill (app-ikon).
// Kjente logoer uten registerfelt får riktig bakgrunn her. Fallback: forbokstav i brikkefarge.
const DARK_BG = /starlink|apple|tesla|x\.com|twitter|tidal|uber/i;
const FILL = /tv ?2|claude|anthropic|youtube|netflix|spotify|viaplay|max\b|hbo|disney|chatgpt|openai/i;
export function subLogo(x, size = 44) {
  const name = String(x?.name ?? x?.merchant ?? x?.description ?? ''), dom = String(x?.domain ?? '');
  const reg = logoMatch({ name, merchant: name, description: name, domain: dom || null });
  const bg = reg?.bg ?? (DARK_BG.test(`${name} ${dom}`) ? '#1b1a17' : null);
  const fill = reg?.fill ?? FILL.test(`${name} ${dom}`);
  const own = x?.logoUrl ?? null;
  const src = own ?? (reg && reg.hasFile !== false ? `/finans/api/logos/file/${encodeURIComponent(reg.id)}?size=128` : dom || reg?.domene ? `/finans/api/logo/${encodeURIComponent(dom || reg.domene)}` : null);
  const fb = !own && reg && reg.hasFile !== false && (dom || reg.domene) ? ` data-fb42="/finans/api/logo/${encodeURIComponent(dom || reg.domene)}"` : '';
  const col = x?.color ?? reg?.farge ?? '#6b665c', ini = esc((name.replace(/^[^A-Za-zÆØÅæøå0-9]+/, '')[0] ?? '•').toUpperCase());
  return `<span class="s42-logo${fill && !own ? ' fill' : ''}" style="--s:${size}px;border-radius:${Math.max(6, Math.round(size * 0.27))}px;${bg ? `background:${bg};` : ''}"><i style="color:${esc(bg ? '#fff' : col)}">${ini}</i>${src ? `<img src="${esc(src)}"${fb} alt="" loading="lazy" decoding="async">` : ''}</span>`;
}

/* ---------- Aksjer og fond (claude-code-finans-aksje-logoer.md) ---------- */
const EXCH = { l: 'London', d: 'Xetra', p: 'Paris', a: 'Amsterdam', s: 'Sveits', m: 'Milano', e: 'Madrid', b: 'Brussel', o: 'Oslo' };
/** «VUAGl_EQ» → { ticker: 'VUAG', exchange: 'London' }; «AAPL_US_EQ» → USA; «EQNR.OL» → Oslo. */
export function parseInstrument(raw) {
  const s = String(raw ?? '');
  let m;
  if ((m = s.match(/^([A-Z0-9.]+)_US_EQ$/))) return { ticker: m[1], exchange: 'USA' };
  if ((m = s.match(/^([A-Z0-9]+)([a-z])_EQ$/))) return { ticker: m[1], exchange: EXCH[m[2]] ?? m[2].toUpperCase() };
  if ((m = s.match(/^([A-Z0-9]+)\.OL$/i))) return { ticker: m[1].toUpperCase(), exchange: 'Oslo' };
  return { ticker: s.replace(/_EQ$/, ''), exchange: '' };
}
export const instrSub = (p) => { const i = parseInstrument(p.ticker ?? p.id ?? p.instrument); return [i.ticker, p.exchange ?? i.exchange, p.currency].filter(Boolean).map(esc).join(' · '); };
// Utstedere for ETF-er og fond (navn → domene for logo-oppslaget i logobiblioteket).
const ISSUERS = [[/vanguard/i, 'vanguard.com'], [/ishares|blackrock/i, 'ishares.com'], [/xtrackers|dws/i, 'dws.com'], [/spdr|state street/i, 'ssga.com'], [/amundi/i, 'amundi.com'], [/invesco/i, 'invesco.com'], [/\bdnb\b/i, 'dnb.no'], [/\bklp\b/i, 'klp.no'], [/storebrand/i, 'storebrand.no'], [/nordnet/i, 'nordnet.no'], [/handelsbanken/i, 'handelsbanken.no'], [/odin/i, 'odinfond.no'], [/holberg/i, 'holberg.no'], [/skagen/i, 'skagenfondene.no'], [/alfred berg/i, 'alfredberg.no']];
const TICK_DOM = { VUAG: 'vanguard.com', VHYL: 'vanguard.com', VWRL: 'vanguard.com', VUSA: 'vanguard.com', VWCE: 'vanguard.com', EQNR: 'equinor.com', DNB: 'dnb.no', AAPL: 'apple.com', NVDA: 'nvidia.com', MSFT: 'microsoft.com', GOOGL: 'google.com', AMZN: 'amazon.com', TSLA: 'tesla.com', META: 'meta.com', NHY: 'hydro.com', TEL: 'telenor.com', ORK: 'orkla.com', MOWI: 'mowi.com', YAR: 'yara.com', KOG: 'kongsberg.com', AKRBP: 'akerbp.com' };
/** Logo for en posisjon: serverens logoUrl / ISIN-endepunktet, ellers domene via logobiblioteket. Monogram til bildet er lastet. */
export function stockLogo(p, size = 48) {
  const i = parseInstrument(p.ticker ?? p.id ?? p.instrument), name = p.name ?? i.ticker;
  const dom = p.domain ?? ISSUERS.find(([re]) => re.test(name))?.[1] ?? TICK_DOM[i.ticker] ?? null;
  const src = p.logoUrl ?? (p.isin ? `/finans/api/aksjer/logo/${encodeURIComponent(p.isin)}` : dom ? `/finans/api/logo/${encodeURIComponent(dom)}` : null);
  const fb = p.isin && dom && !p.logoUrl ? ` data-fb42="/finans/api/logo/${encodeURIComponent(dom)}"` : '';
  const isFund = /etf|fond|ucits|index|indeks|acc\b|dist\b/i.test(name) || ISSUERS.some(([re]) => re.test(name));
  const mono = esc(i.ticker.slice(0, 4));
  return `<span class="k42-logo" style="--k:${size}px;--kc:${esc(p.color ?? '#2f8a6a')}"><i>${mono}</i>${src ? `<img src="${esc(src)}"${fb} alt="${esc(name)}" loading="lazy" decoding="async">` : ''}${isFund && src ? `<em>${mono}</em>` : ''}</span>`;
}
// Tone inn logoen når den er lastet; ved feil prøves domenet, så monogrammet.
document.addEventListener('load', (e) => { const t = e.target; if (t?.tagName === 'IMG' && t.parentNode?.classList?.contains('k42-logo')) t.classList.add('on'); if (t?.tagName === 'IMG' && t.parentNode?.classList?.contains('s42-logo')) t.classList.add('on'); }, true);
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t?.tagName !== 'IMG') return;
  const p = t.parentNode?.classList;
  if (!p || !(p.contains('k42-logo') || p.contains('s42-logo'))) return;
  if (t.dataset.fb42) { t.src = t.dataset.fb42; delete t.dataset.fb42; return; }
  t.parentNode.querySelector('em')?.remove();
  t.remove();
}, true);

/* ---------- Glimt tenker … (claude-code-glimt-sokedatabase.md § 7) ---------- */
// «Glimt tenker … 1,4 s» med tiendeler fra startedAt (settes én gang) og tankestegene som hukes av.
export const secs = (ms) => `${(Math.max(0, ms) / 1000).toFixed(ms < 1000 ? 2 : 1).replace('.', ',')} s`;
export function thinkHtml(T) {
  if (!T) return '';
  const now = T.done ? T.ms ?? (T.end - T.t0) : Date.now() - T.t0;
  const steps = (T.steps ?? []).map((s) => `<li class="${s.done === false ? 'run' : 'ok'}"><span>${s.done === false ? '◌' : '✓'}</span>${esc(s.label)}${s.detail ? ` <em>${esc(s.detail)}</em>` : ''}${s.ms != null ? ` · ${secs(s.ms)}` : ''}</li>`).join('');
  const open = T.done ? !!S.ui.thinkOpen : true;
  const head = T.done ? `Glimt tenkte i ${secs(now)} · ${T.engine === 'ollama' ? `Ollama${T.model ? ` (${esc(T.model)})` : ''}` : 'lokalt søk'}` : `Glimt tenker … ${secs(now)}`;
  return `<div class="t42${T.done ? ' done' : ''}" data-t42>${orb(20, !T.done)}<div class="t42-b"><div class="t42-h"><b data-t42-h>${head}</b>${T.done && steps ? `<button type="button" class="link-btn" data-t42-tog>${open ? 'Skjul hvordan Glimt tenkte ▴' : 'Vis hvordan Glimt tenkte ▾'}</button>` : ''}</div>${steps && open ? `<ol class="t42-s">${steps}</ol>` : ''}${T.done ? '' : `<div class="t42-bar"><i style="width:${Math.min(96, ((T.steps ?? []).filter((s) => s.done !== false).length / 4) * 100)}%"></i></div>`}</div></div>`;
}
/**
 * Strømmer tankestegene fra POST /search/ask/stream (SSE: step, result, ping). Uten strømming: POST /search/ask.
 * onStep(T) kalles for hvert steg. Gir svaret ({text, cards, hits, steps, ms, engine}) eller null ved 404.
 */
export async function askStream(q, { scope = null, signal, onStep } = {}) {
  const T = { t0: Date.now(), steps: [], done: false };
  onStep?.(T);
  const body = JSON.stringify({ q, ...(scope ? { scope } : {}) });
  try {
    const res = await fetch('/finans/api/search/ask/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body, signal });
    if (res.ok && res.headers.get('content-type')?.includes('event-stream')) {
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = '', out = null, last = Date.now();
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: *(.+)$/m.exec(chunk)?.[1]?.trim() ?? 'message', data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          let j = null; try { j = data ? JSON.parse(data) : null; } catch { /* ping */ }
          last = Date.now();
          if (ev === 'step' && j) { const k = T.steps.findIndex((s) => s.label === j.label || (s.done === false && j.done !== false)); if (k >= 0 && T.steps[k].done === false) T.steps[k] = j; else T.steps.push(j); onStep?.(T); }
          if ((ev === 'result' || ev === 'done' || ev === 'answer') && j) out = j;
          if (ev === 'error') throw new Error(j?.error || 'Glimt svarte ikke');
        }
        if (Date.now() - last > 10000) break;
      }
      if (out) { Object.assign(T, { done: true, end: Date.now(), ms: out.ms ?? Date.now() - T.t0, engine: out.engine, model: out.model, steps: out.steps?.length ? out.steps : T.steps }); onStep?.(T); return { ...out, think: T }; }
    }
  } catch (e) { if (e.name === 'AbortError') throw e; }
  // Ingen strømming (eldre server): vanlig kall, stegene kommer i svaret.
  try {
    const r = await api('/search/ask', { method: 'POST', json: { q, ...(scope ? { scope } : {}) }, signal });
    Object.assign(T, { done: true, end: Date.now(), ms: r?.ms ?? Date.now() - T.t0, engine: r?.engine, model: r?.model, steps: r?.steps ?? T.steps });
    onStep?.(T);
    return r ? { ...r, think: T } : null;
  } catch (e) {
    if (e.status === 404 || e.status === 405) { T.done = true; T.end = Date.now(); return null; }
    throw e;
  }
}

/* ---------- Små formattere ---------- */
export const kr = (v) => `${n0(v)} kr`;
export const kr2 = (v) => `${v < 0 ? '−' : ''}${n2(v)} kr`;
