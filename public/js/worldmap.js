// Verdenskart over besøk per land: d3-geo (Natural Earth) og world-atlas countries-110m, levert av serveren.
// Fargen går logaritmisk fra #24406b (få) til #a8d4fb (mange); land uten besøk er #1d2738.
// Mobilappen sender egne farger (rosa skala) via opts { lo, hi, empty, stroke }. Trykk på et land viser navn og antall.
const V = '/domains/api/vendor/';
let ready = null;

function script(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kunne ikke laste ' + src)); document.head.appendChild(s); });
}

function load() {
  ready ??= (async () => {
    await script(V + 'd3-array.min.js');
    await Promise.all([script(V + 'd3-geo.min.js'), script(V + 'topojson-client.min.js')]);
    const topo = await fetch(V + 'countries-110m.json', { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('Kartdata svarte ' + r.status); return r.json(); });
    return window.topojson.feature(topo, topo.objects.countries).features.filter((f) => f.id !== '010'); // uten Antarktis
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Tegner kartet i `el`. countries: [{iso3n, name, visitors}] */
export async function drawMap(el, countries, opts = {}) {
  const A = hex(opts.lo ?? '#24406b'), B = hex(opts.hi ?? '#a8d4fb'), EMPTY = opts.empty ?? '#1d2738';
  const mix = (t) => `rgb(${A.map((a, i) => Math.round(a + (B[i] - a) * t)).join(',')})`;
  if (!load.done) el.innerHTML = '<div class="wm-msg">Laster kart …</div>';
  let feats;
  try { feats = await load(); load.done = true; } catch (e) { el.innerHTML = `<div class="wm-msg">${e.message}</div>`; return; }
  const by = new Map(countries.filter((c) => c.iso3n).map((c) => [c.iso3n, c]));
  const max = Math.max(2, ...countries.map((c) => c.visitors || 0));
  const color = (v) => (v > 0 ? mix(Math.log(Math.max(1, v)) / Math.log(max)) : EMPTY);
  const tip = document.createElement('div');
  tip.className = 'wm-tip';
  const paint = () => {
    const W = el.clientWidth || 600, H = el.clientHeight || 340;
    const proj = window.d3.geoNaturalEarth1().fitExtent([[2, 2], [W - 2, H - 2]], { type: 'FeatureCollection', features: feats });
    const path = window.d3.geoPath(proj);
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verdenskart over besøk per land">${feats.map((f) => {
      const c = by.get(f.id);
      return `<path d="${path(f) ?? ''}" fill="${color(c?.visitors ?? 0)}"${opts.stroke ? ` stroke="${opts.stroke}"` : ''} data-id="${f.id}" data-n="${(c?.name ?? f.properties.name).replace(/"/g, '&quot;')}" data-v="${c?.visitors ?? 0}"></path>`;
    }).join('')}</svg>`;
    el.appendChild(tip);
  };
  paint();
  const show = (e) => {
    const p = e.target.closest('path');
    el.querySelectorAll('path.hl').forEach((x) => x !== p && x.classList.remove('hl'));
    if (!p) { tip.style.display = 'none'; return; }
    p.classList.add('hl'); p.parentNode.appendChild(p);
    const v = +p.dataset.v, r = el.getBoundingClientRect();
    const b = document.createElement('b');
    b.textContent = p.dataset.n;
    tip.replaceChildren(b, ` · ${v ? v.toLocaleString('nb-NO') + ' besøk' : 'ingen besøk'}`);
    tip.style.display = 'block';
    tip.style.left = Math.max(4, Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 6)) + 'px';
    tip.style.top = Math.min(e.clientY - r.top + 14, r.height - 36) + 'px';
  };
  el.onmousemove = (e) => { if (!opts.tap) show(e); };
  // Trykk (mobil): vis navn og antall for landet man trykker på.
  el.onpointerdown = (e) => { if (e.pointerType !== 'mouse' || opts.tap) show(e); };
  el.onmouseleave = () => { tip.style.display = 'none'; el.querySelectorAll('path.hl').forEach((x) => x.classList.remove('hl')); };
  el._ro?.disconnect();
  let w = el.clientWidth;
  el._ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; paint(); } });
  el._ro.observe(el);
}
