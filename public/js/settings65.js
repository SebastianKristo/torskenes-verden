// Prompt 65 (prompt 50b, claude-code-innstillinger-samlet.md): ny sidemeny i Innstillinger og samling av relaterte sider.
// - MENU65: gruppene og sidene i sidemenyen (GENERELT · HUSSTAND · GLIMT OG AI · TILKOBLINGER · MODULER · SERVER).
// - PARENT65: sider som ikke står i menyen selv, men under en annen side (Faste oppgaver og Kvalitet under Glimt).
// - ALIAS65: gamle sider som er slått sammen (Startside, Familie, Gjøremål, Sikkerhet) → nye sider. Gamle lenker virker.
// - SUB65: undersider som har flyttet til en annen side (Startside → Faner → App, Widgets → Utseende …).
// - combine65(): én side satt sammen av flere visninger (grupper, html og monterte moduler med hver sin plass).
// - moved65(): den lille oransje «FLYTTET FRA …»-taggen (første versjon etter flyttingen).
// - System: faner (Oversikt · Oppdateringer · Ytelse · Selvreparasjon · Mer). Backup er egen side.
// Ingen innstilling finnes to steder: de gamle plassene viser bare en rad med status og lenke («… ›»).
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MENU65 = [
  ['Generelt', ['konto', 'look', 'varsel', 'app']],
  ['Husstand', ['users']],
  ['Glimt og AI', ['glimt', 'ai']],
  ['Tilkoblinger', ['int', 'kal']],
  ['Moduler', ['dom', 'finans', 'media', 'nyheter', 'ruter', 'sporing', 'studie', 'vaer']], // prompt 70: Sporing mellom Ruter og Studie
  ['Server', ['system', 'backup', 'logger']],
];
/** Side som vises under en annen i menyen (menyen markerer forelderen, tilbakeknappen går dit). */
export const PARENT65 = { 'faste-oppgaver': 'glimt', kvalitet: 'glimt' };
/** Sammenslåtte sider → ny side. Gjelder hash (#/innstillinger/<side>), openSettings(), søkeindeksen og knapper. */
export const ALIAS65 = {
  top: 'look', startside: 'look', layout: 'look', forside: 'look',
  familie: 'users', family: 'users', fam: 'users', helse: 'users', husstand: 'users', 'brukere-og-familie': 'users', barn: 'users',
  huske: 'kal', gjoremal: 'kal', 'gjøremål': 'kal', huskeliste: 'kal', tasks: 'kal', todo: 'kal', 'kalender-og-gjoremal': 'kal',
  sikkerhet: 'konto', security: 'konto', passkey: 'konto', passkeys: 'konto', revisjonslogg: 'konto', revisjon: 'konto', sperrer: 'konto',
  enheter51: 'konto', nokler: 'konto', hemmeligheter: 'konto', '2fa': 'konto', totp: 'konto', innlogging: 'konto', login: 'konto',
  'glimt-husker': 'glimt', minne: 'glimt', personlighet: 'glimt', nettsok: 'glimt', 'glimt-og-chat': 'glimt',
  ai: 'ai', modeller: 'ai', tjenester: 'ai',
  sikkerhetskopi: 'backup', backups: 'backup', gjenoppretting: 'backup', database: 'backup',
  kalendere: 'kal', kalender: 'kal', calendars: 'kal',
};
/** Undersider som har byttet side (fanen bestemmes av undersiden, så «top/tabs» åpner App → Faner). */
export const SUB65 = { tabs: 'app', head: 'app', speed: 'look', dash: 'look', mob: 'look', sc: 'look', hahealth: 'users' };

/** System-fanene: [nøkkel, navn, 15 px strek-ikon]. Gamle nøkler (helse, oppdatering …) mappes i SYS_ALIAS65. */
export const SYS_TABS65 = [
  ['ov', 'Oversikt', 'M22 12h-4l-3 9L9 3l-3 9H2'],
  ['upd', 'Oppdateringer', 'M21 12a9 9 0 0 1-15.3 6.4L3 16M3 12a9 9 0 0 1 15.3-6.4L21 8M21 3v5h-5M3 21v-5h5'],
  ['perf', 'Ytelse', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'],
  ['heal', 'Selvreparasjon', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'],
  ['mer', 'Mer', 'M5 12h.01M12 12h.01M19 12h.01'],
];
export const SYS_ALIAS65 = { oversikt: 'ov', helse: 'ov', health: 'ov', oppdateringer: 'upd', oppdatering: 'upd', update: 'upd', updates: 'upd', versjoner: 'upd', staging: 'upd',
  ytelse: 'perf', trege: 'perf', performance: 'perf', selvreparasjon: 'heal', heal: 'heal', mer: 'mer', kvalitet51: 'mer', flags: 'mer', krasj: 'mer' };
export const sysTabOf65 = (k) => (SYS_TABS65.some(([id]) => id === k) ? k : SYS_ALIAS65[k] ?? null);

const tagHtml = (from) => `<span class="set-moved" data-moved65>FLYTTET FRA ${esc(String(from).toUpperCase())}</span>`;
/** Legger «FLYTTET FRA …» på den første seksjonsoverskriften i html (eller som egen linje øverst om den mangler). */
export function moved65(html, from) {
  if (!from) return html;
  let done = false;
  const out = String(html).replace(/(<h3 class="sg-[th][^"]*"[^>]*>)([\s\S]*?)(<\/h3>)/, (m, a, b, c) => { done = true; return `${a}${b}${tagHtml(from)}${c}`; });
  return done ? out : `<div class="set-moved-row">${tagHtml(from)}</div>${html}`;
}
/** Merker en group()-seksjon som flyttet. */
export const movedGroup65 = (g, from) => (g ? { ...g, moved: from } : g);
export const movedTitle65 = (g) => (g.moved ? tagHtml(g.moved) : '');

/**
 * Setter sammen én side av flere visninger. parts: [{ v, moved?, sel? }] der v er en vanlig visning ({ pre, groups, html, extra,
 * mount, mounts, search }). Hver montert modul får sin egen plass (data-mh65="n"), så flere moduler kan stå på samme side.
 * groupHtml kommer fra settings.js. Svaret har html, mounts ([[velger, fn]]) og search (alle gruppene, for søket).
 */
export function combine65(parts, groupHtml) {
  const mounts = [], search = [];
  let html = '';
  parts.filter((p) => p && p.v).forEach((p, i) => {
    const v = p.v;
    const gs = v.groups?.length ? v.groups.filter(Boolean) : null;
    let h = (v.pre ?? '') + (gs ? gs.map((g) => groupHtml(p.moved && !g.moved ? { ...g, moved: p.moved } : g)).join('') : v.pre && v.groups ? '' : v.html ?? '') + (v.extra ?? '');
    if (!gs && p.moved) h = moved65(h, p.moved);
    if (v.mount) {
      if (p.sel) mounts.push([p.sel, v.mount]);
      else if (/data-mount-host/.test(h)) { h = h.replace(/data-mount-host(="[^"]*")?/, (m) => `${m} data-mh65="${i}"`); mounts.push([`[data-mh65="${i}"]`, v.mount]); }
    }
    for (const m of v.mounts ?? []) mounts.push(m);
    html += h;
    search.push(...(v.groups ?? v.search ?? []).filter(Boolean));
  });
  return { html, mounts, search };
}

/** Fanerad (System). active = nøkkel, attr = data-attributtet knappene får. */
export function tabBar65(tabs, active, attr = 'data-sys65') {
  const ic = (d) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  return `<div class="set-tabs65" role="tablist">${tabs.map(([k, n, d, badge]) => `<button type="button" role="tab" class="set-tab65" ${attr}="${esc(k)}" aria-selected="${k === active}">${ic(d)}<span>${esc(n)}</span>${badge ? `<i class="set-tab65-b">${esc(badge)}</i>` : ''}</button>`).join('')}</div>`;
}

/** Rad med chevron som bare lenker til et annet sted (regelen «status + lenke, aldri en kopi av kontrollen»). */
export const linkRow65 = (row, o) => row({ ...o, btn: o.btn ?? o.to });
