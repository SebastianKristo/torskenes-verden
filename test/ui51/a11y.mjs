// Prompt 51 (WEBX51): tilgjengelighetssjekk for hovedsidene i lys og mørk (npm run a11y). Egne, axe-lignende regler i nettleseren
// (ingen nye npm-pakker): kontrast (WCAG 2.1 AA: 4,5:1, stor tekst 3:1), bilder uten alt, knapper/lenker uten navn, skjemafelt uten
// etikett, lang på <html>, sidetittel, dupliserte id-er som aria-attributter peker på, og berøringsflater under 24 × 24 px (WCAG 2.2).
//
//   npm run a11y                       – sjekker alt, skriver test/a11y51/out/report.{json,md} og feiler bare på NYE brudd
//   npm run a11y -- --update-baseline  – lagrer dagens brudd som grunnlinje (test/a11y51/baseline.json)
//   npm run a11y -- --strict           – feiler på alle brudd (ikke bare nye)
//   A11Y51_PAGES=hjem,finans           – bare noen sider
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { start51, context51, open51, PAGES51, THEMES51, VIEWPORTS51, ROOT, args51 } from './common.mjs';

const OUT = join(ROOT, 'test', 'a11y51', 'out');
const BASELINE = join(ROOT, 'test', 'a11y51', 'baseline.json');
const A = args51();

/** Kjøres i siden. → [{rule, impact, selector, text, detail}] */
function audit() {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && !el.closest('[hidden],[aria-hidden="true"],[inert]'); };
  const sel = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement) {
      let p = n.tagName.toLowerCase();
      const cls = [...n.classList].filter((c) => !/^(on|active|sel)$/.test(c)).slice(0, 2);
      if (cls.length) p += `.${cls.map((c) => CSS.escape(c)).join('.')}`;
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean); return [Number(r), Number(g), Number(b), Number(a)]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  /** Effektiv bakgrunn: blander gjennomsiktige lag oppover til en ugjennomsiktig farge. null = bilde/gradient bak (kan ikke måles). */
  function bgOf(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      if (/blur|backdrop/.test(s.backdropFilter || '') && s.backdropFilter !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let base = [255, 255, 255, 1];
    const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg[3] > 0) base = blend(htmlBg, base);
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  }
  // 1) Kontrast
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || seen.has(el) || !visible(el) || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (el.closest('[disabled],[aria-disabled="true"]') || s.textShadow !== 'none') continue; // inaktive elementer er unntatt i WCAG; skygge kan ikke måles
    const fg = parse(s.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    const f = fg[3] < 1 ? blend(fg, bg) : fg;
    const L1 = lum(f), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio + 0.01 < need) out.push({ rule: 'kontrast', impact: ratio < need - 1.5 ? 'serious' : 'moderate', selector: sel(el), text: txt(el), detail: `${ratio.toFixed(2)}:1 (krav ${need}:1, ${Math.round(px)} px${bold ? ' fet' : ''})` });
  }
  // 2) Bilder uten alt
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation') out.push({ rule: 'bilde-alt', impact: 'serious', selector: sel(img), text: (img.getAttribute('src') || '').slice(0, 60), detail: 'mangler alt' });
  // 3) Navn på knapper og lenker
  const nameOf = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (t) return t; }
    return (el.getAttribute('aria-label') || txt(el) || el.getAttribute('title') || [...el.querySelectorAll('img[alt],svg title,[aria-label]')].map((x) => x.getAttribute?.('alt') || x.getAttribute?.('aria-label') || x.textContent).join(' ') || (el.tagName === 'INPUT' ? el.value : '')).trim();
  };
  for (const el of document.querySelectorAll('button,a[href],[role="button"],[role="link"],[role="tab"],[role="menuitem"],input[type="button"],input[type="submit"]')) {
    if (!visible(el)) continue;
    if (!nameOf(el)) out.push({ rule: el.tagName === 'A' || el.getAttribute('role') === 'link' ? 'lenke-navn' : 'knapp-navn', impact: 'serious', selector: sel(el), text: el.outerHTML.slice(0, 80), detail: 'mangler tilgjengelig navn' });
    // 4) Berøringsflate (WCAG 2.2 AA 2.5.8: 24 × 24 CSS-px; lenker inne i løpende tekst er unntatt)
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && txt(el.parentElement).length > txt(el).length + 10;
    if (!inline && (r.width < 24 || r.height < 24)) out.push({ rule: 'beroringsflate', impact: 'moderate', selector: sel(el), text: nameOf(el).slice(0, 40), detail: `${Math.round(r.width)} × ${Math.round(r.height)} px (min. 24 × 24)` });
  }
  // 5) Skjemafelt med etikett
  for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),select,textarea')) {
    if (!visible(el)) continue;
    const lab = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    if (!lab) out.push({ rule: 'etikett', impact: el.getAttribute('placeholder') ? 'moderate' : 'serious', selector: sel(el), text: el.getAttribute('placeholder') || el.name || '', detail: el.getAttribute('placeholder') ? 'bare plassholdertekst' : 'mangler etikett' });
  }
  // 6) Dokumentet
  if (!document.documentElement.getAttribute('lang')) out.push({ rule: 'html-lang', impact: 'serious', selector: 'html', text: '', detail: 'mangler lang' });
  if (!document.title.trim()) out.push({ rule: 'sidetittel', impact: 'serious', selector: 'title', text: '', detail: 'tom <title>' });
  // 7) Dupliserte id-er som aria-attributter eller label[for] peker på
  const refs = new Set();
  for (const el of document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls],[aria-activedescendant],label[for]')) for (const a of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-activedescendant', 'for']) for (const id of (el.getAttribute(a) || '').split(/\s+/).filter(Boolean)) refs.add(id);
  for (const id of refs) { const n = document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length; if (n > 1) out.push({ rule: 'duplisert-id', impact: 'serious', selector: `#${id}`, text: '', detail: `${n} elementer har id «${id}»` }); }
  return out;
}

const env = await start51();
if (!env) process.exit(0);
const only = (process.env.A11Y51_PAGES || '').split(',').filter(Boolean);
const results = [];
try {
  for (const p of PAGES51.filter((x) => !only.length || only.includes(x.name))) {
    for (const theme of THEMES51) {
      for (const vp of VIEWPORTS51) {
        const ctx = await context51(env, { viewport: vp, theme, auth: p.auth !== false });
        try {
          const { page } = await open51(ctx, p);
          const found = await page.evaluate(audit);
          results.push({ page: p.name, theme, viewport: vp.name, violations: found });
          const s = found.filter((x) => x.impact === 'serious').length;
          console.log(`${p.name.padEnd(16)} ${theme.padEnd(4)} ${vp.name.padEnd(4)}  ${String(found.length).padStart(3)} brudd (${s} alvorlige)`);
        } catch (e) { results.push({ page: p.name, theme, viewport: vp.name, error: e.message.split('\n')[0], violations: [] }); console.log(`${p.name} ${theme} ${vp.name}: feil – ${e.message.split('\n')[0]}`); }
        await ctx.close();
      }
    }
  }
} finally { await env.close(); }

// Grunnlinje: antall per side/tema/bredde/regel. Nye brudd = flere enn grunnlinjen.
const key = (r) => `${r.page}|${r.theme}|${r.viewport}`;
const counts = Object.fromEntries(results.map((r) => [key(r), r.violations.reduce((a, v) => ({ ...a, [v.rule]: (a[v.rule] ?? 0) + 1 }), {})]));
mkdirSync(OUT, { recursive: true });
if (A.has('--update-baseline')) {
  writeFileSync(BASELINE, `${JSON.stringify({ updated: new Date().toISOString(), counts }, null, 2)}\n`);
  console.log(`Grunnlinje lagret: ${BASELINE}`);
}
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).counts ?? {} : {};
const regressions = [];
for (const [k, c] of Object.entries(counts)) for (const [rule, n] of Object.entries(c)) { const b = base[k]?.[rule] ?? 0; if (n > b) regressions.push({ key: k, rule, now: n, baseline: b }); }
const total = results.reduce((a, r) => a + r.violations.length, 0);
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), total, regressions, results }, null, 2));
const md = ['# Tilgjengelighet (prompt 51)', '', `Kjørt ${new Date().toLocaleString('nb-NO')} · ${results.length} visninger · ${total} brudd · ${regressions.length} nye mot grunnlinjen`, '',
  '| Side | Tema | Bredde | Brudd | Alvorlige |', '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.page} | ${r.theme} | ${r.viewport} | ${r.error ? `feil: ${r.error}` : r.violations.length} | ${r.violations.filter((v) => v.impact === 'serious').length} |`), '',
  ...(regressions.length ? ['## Nye brudd', '', ...regressions.map((x) => `- **${x.key}** ${x.rule}: ${x.now} (grunnlinje ${x.baseline})`), ''] : []),
  '## Detaljer (de første 15 per visning)', '',
  ...results.flatMap((r) => (r.violations.length ? [`### ${r.page} · ${r.theme} · ${r.viewport}`, '', ...r.violations.slice(0, 15).map((v) => `- \`${v.rule}\` (${v.impact}) \`${v.selector}\` – ${v.detail}${v.text ? ` – «${v.text.replace(/`/g, '')}»` : ''}`), ''] : []))].join('\n');
writeFileSync(join(OUT, 'report.md'), md);
console.log(`\nRapport: ${join(OUT, 'report.md')}`);
const fail = A.has('--strict') ? total > 0 : regressions.length > 0 && !A.has('--update-baseline');
if (fail) { console.log(`${A.has('--strict') ? total : regressions.length} ${A.has('--strict') ? 'brudd' : 'nye brudd mot grunnlinjen'} – se rapporten.`); process.exit(1); }
console.log(A.has('--update-baseline') ? 'OK (grunnlinje oppdatert).' : 'OK – ingen nye brudd.');
