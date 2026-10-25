// Prompt 51 (WEBX51): visuelle regresjonstester (npm run test:visual). Skjermbilder av hovedsidene på 1440 og 390 px i lys og mørk,
// sammenlignet med lagrede referanser i test/visual51/ref/. Sammenligningen skjer i nettleseren (canvas), så ingen nye npm-pakker.
//
//   npm run test:visual                 – sammenligner; skriver test/visual51/out/ (bilder, diff, report.html) og feiler over terskelen
//   npm run test:visual -- --update     – lagrer dagens skjermbilder som nye referanser
//   VISUAL51_THRESHOLD=0.01             – største andel ulike piksler før det regnes som endret (standard 1 %)
//   VISUAL51_PIXEL=40                   – hvor stor fargeforskjell (0–255 per kanal) som teller som en ulik piksel (standard 40)
//   VISUAL51_PAGES=hjem,finans          – bare noen sider
// Mangler en referanse, regnes visningen som «ny» (ikke feil) og skjermbildet ligger i out/ – kjør med --update for å lagre den.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { start51, context51, open51, PAGES51, THEMES51, VIEWPORTS51, ROOT, slug51, args51 } from './common.mjs';

const REF = join(ROOT, 'test', 'visual51', 'ref');
const OUT = join(ROOT, 'test', 'visual51', 'out');
const A = args51();
const THRESHOLD = Number(process.env.VISUAL51_THRESHOLD || 0.01);
const PIXEL = Number(process.env.VISUAL51_PIXEL || 40);
mkdirSync(OUT, { recursive: true });
mkdirSync(REF, { recursive: true });

/** Sammenligner to PNG-er i en tom side. → {ratio, diffPng, w, h, sizeMismatch} */
async function compare(page, a, b) {
  return page.evaluate(async ({ a, b, PIXEL }) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
    const ctx = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h); };
    const da = ctx(A), db = ctx(B);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const go = out.getContext('2d'); const od = go.createImageData(w, h);
    let diff = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > PIXEL) { diff++; od.data[i] = 230; od.data[i + 1] = 30; od.data[i + 2] = 60; od.data[i + 3] = 255; }
      else { const g = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3; od.data[i] = od.data[i + 1] = od.data[i + 2] = 200 + g * 0.2; od.data[i + 3] = 255; }
    }
    go.putImageData(od, 0, 0);
    return { ratio: diff / (w * h), diffPng: out.toDataURL('image/png'), w, h, sizeMismatch: A.width !== B.width || A.height !== B.height };
  }, { a, b, PIXEL });
}

const env = await start51();
if (!env) process.exit(0);
const only = (process.env.VISUAL51_PAGES || '').split(',').filter(Boolean);
const rows = [];
try {
  const cmpCtx = await env.browser.newContext();
  const cmpPage = await cmpCtx.newPage();
  for (const p of PAGES51.filter((x) => !only.length || only.includes(x.name))) {
    for (const vp of VIEWPORTS51) {
      for (const theme of THEMES51) {
        const name = slug51(p, vp, theme);
        const ctx = await context51(env, { viewport: vp, theme, auth: p.auth !== false, freeze: true });
        try {
          const { page } = await open51(ctx, p);
          const file = join(OUT, `${name}.png`);
          await page.screenshot({ path: file, fullPage: false, animations: 'disabled', caret: 'hide', mask: (p.mask ?? []).map((s) => page.locator(s)), maskColor: '#888888' });
          const ref = join(REF, `${name}.png`);
          if (A.has('--update')) { copyFileSync(file, ref); rows.push({ name, state: 'oppdatert' }); console.log(`${name.padEnd(34)} referanse lagret`); }
          else if (!existsSync(ref)) { rows.push({ name, state: 'ny' }); console.log(`${name.padEnd(34)} ny (ingen referanse)`); }
          else {
            const toUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
            const r = await compare(cmpPage, toUrl(ref), toUrl(file));
            writeFileSync(join(OUT, `${name}.diff.png`), Buffer.from(r.diffPng.split(',')[1], 'base64'));
            const state = r.ratio > THRESHOLD || r.sizeMismatch ? 'endret' : 'lik';
            rows.push({ name, state, ratio: r.ratio, sizeMismatch: r.sizeMismatch });
            console.log(`${name.padEnd(34)} ${state.padEnd(7)} ${(r.ratio * 100).toFixed(2)} %${r.sizeMismatch ? ' (annen størrelse)' : ''}`);
          }
        } catch (e) { rows.push({ name, state: 'feil', error: e.message.split('\n')[0] }); console.log(`${name}: feil – ${e.message.split('\n')[0]}`); }
        await ctx.close();
      }
    }
  }
  await cmpCtx.close();
} finally { await env.close(); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><html lang="nb"><meta charset="utf-8"><title>Visuelle tester · prompt 51</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:24px;background:#f3efe6;color:#17150f}h1{font-size:22px}table{border-collapse:collapse}td,th{padding:6px 10px;border-bottom:1px solid #ccc;text-align:left}
.endret,.feil{color:#a8231a;font-weight:700}.ny{color:#7a5a00}figure{display:inline-block;margin:0 12px 12px 0;vertical-align:top}figure img{max-width:420px;border:1px solid #bbb}figcaption{font-size:12px}</style>
<h1>Visuelle tester</h1><p>Terskel ${(THRESHOLD * 100).toFixed(1)} % piksler · pikselgrense ${PIXEL} · ${new Date().toLocaleString('nb-NO')}</p>
<table><tr><th>Visning</th><th>Status</th><th>Ulike piksler</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="${r.state}">${esc(r.state)}${r.error ? ` – ${esc(r.error)}` : ''}</td><td>${r.ratio != null ? `${(r.ratio * 100).toFixed(2)} %` : ''}</td></tr>`).join('')}</table>
${rows.filter((r) => r.state === 'endret').map((r) => `<h2>${esc(r.name)}</h2><figure><img src="../ref/${esc(r.name)}.png" alt="Referanse"><figcaption>Referanse</figcaption></figure><figure><img src="${esc(r.name)}.png" alt="Nå"><figcaption>Nå</figcaption></figure><figure><img src="${esc(r.name)}.diff.png" alt="Forskjell"><figcaption>Forskjell</figcaption></figure>`).join('')}`;
writeFileSync(join(OUT, 'report.html'), html);
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), threshold: THRESHOLD, pixel: PIXEL, rows }, null, 2));
console.log(`\nRapport: ${join(OUT, 'report.html')}`);
const bad = rows.filter((r) => r.state === 'endret' || r.state === 'feil');
if (bad.length) { console.log(`${bad.length} visning(er) er endret eller feilet.`); process.exit(1); }
console.log(`OK – ${rows.filter((r) => r.state === 'lik').length} like, ${rows.filter((r) => r.state === 'ny').length} nye, ${rows.filter((r) => r.state === 'oppdatert').length} oppdatert.`);
