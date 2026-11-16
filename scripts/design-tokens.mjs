#!/usr/bin/env node
// Generator for designtokens: leser shared/design/tokens.json og skriver plattformfilene.
//   node scripts/design-tokens.mjs           skriv alle genererte filer (npm run tokens)
//   node scripts/design-tokens.mjs --check   feil (exit 1) hvis en generert fil mangler, avviker eller er til overs (npm run tokens:check)
// Ren Node uten avhengigheter. generate() er ren (ingen filsystem), så testen kan kjøre den i minnet.
// Se docs/designsystem.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_PATH = 'shared/design/tokens.json';
const HEADER = 'GENERERT av scripts/design-tokens.mjs fra shared/design/tokens.json – ikke rediger';

/** Stiler og moduser i fast rekkefølge. */
export const STILER = ['papir', 'glass'];
export const MODUSER = ['lys', 'mork'];

/** Fargetokenene som hver stil/modus må ha (rekkefølgen styrer rekkefølgen i genererte filer). */
export const FARGER = [
  'surface', 'surfaceRaised', 'surfaceSunken', 'line',
  'textPrimary', 'textSecondary', 'textTertiary',
  'accent', 'onAccent', 'success', 'onSuccess', 'warning', 'onWarning', 'danger', 'onDanger',
  'focus', 'scrim',
  'surfaceField', 'surfaceChip', 'surfaceOverlay', 'lineSubtle',
  'info', 'onInfo', 'successSoft', 'warningSoft', 'dangerSoft',
];
/** Tokenene som kan ha en egen verdi ved økt kontrast. */
export const HOY_KONTRAST = ['textSecondary', 'textTertiary', 'line'];

/** Stier til de genererte filene (relativt til rotmappen). */
export const PATHS = {
  css: 'public/css/tokens.css',
  swift: 'apps/ios/Shared/DesignTokens.swift',
  xcassets: 'apps/ios/Shared/DesignTokens.xcassets',
  kotlinApp: 'apps/android/app/src/main/java/no/kristo/finanshub/ui/designsystem/DesignTokens.kt',
  kotlinKalender: 'apps/android/kalender/src/main/java/no/kristo/kalender/ui/designsystem/DesignTokens.kt',
  kotlinWear: 'apps/android/wear/src/main/java/no/kristo/finanshub/wear/ui/designsystem/DesignTokens.kt',
};

/* ---------------------------------------------------------------- Hjelpere */

/** Fjerner $-nøkler (kommentarer og metadata). */
const plain = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('$')));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const num = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

/** «#rrggbb» eller «rgba(r,g,b,a)» → { r, g, b, a } (0–255, alfa 0–1). */
export function parseColor(s) {
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\)$/.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if ([r, g, b].some((v) => v > 255)) throw new Error(`ugyldig farge: ${s}`);
    return { r, g, b, a: Number(m[4]) };
  }
  throw new Error(`ugyldig farge (bruk #rrggbb eller rgba(r,g,b,a)): ${s}`);
}

/** Legger en farge med alfa over en ugjennomsiktig bunn. */
export function composite(top, bottom) {
  const a = top.a;
  const mix = (t, b) => Math.round(t * a + b * (1 - a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** Relativ luminans etter WCAG 2.x. */
export function luminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Kontrastforhold (1–21) mellom to ugjennomsiktige farger. */
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const hex2 = (n) => n.toString(16).padStart(2, '0');
const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/* ---------------------------------------------------------------- Oppløsning */

/**
 * Løser opp alias ({ "$alias": "papir.lys" }) og gir en flat tabell:
 * { papir: { lys: { farger, hoyKontrast, alias }, mork: … }, glass: … }.
 */
export function resolveColors(tokens) {
  const out = {};
  for (const stil of STILER) {
    out[stil] = {};
    for (const modus of MODUSER) {
      let node = tokens.color?.[stil]?.[modus];
      let alias = null;
      const seen = new Set();
      while (node && typeof node.$alias === 'string') {
        if (seen.has(node.$alias)) throw new Error(`alias-løkke: ${node.$alias}`);
        seen.add(node.$alias);
        alias = node.$alias;
        const [s, m] = node.$alias.split('.');
        node = tokens.color?.[s]?.[m];
      }
      if (!node) throw new Error(`color.${stil}.${modus} mangler`);
      const { highContrast = {}, ...rest } = plain(node);
      out[stil][modus] = { farger: rest, hoyKontrast: plain(highContrast), alias };
    }
  }
  return out;
}

/** Ugjennomsiktig versjon av en fargetoken (alfa lagt over stilens surface). */
export function opaque(farger, navn) {
  const c = parseColor(farger[navn]);
  if (c.a === 1) return c;
  return composite(c, parseColor(farger.surface));
}

export function categories(tokens) {
  // onCategoryLight (M9): tekst på en lys farge brukeren har valgt selv. Klienten velger den eller onCategory etter luminansen.
  const { onCategory, onCategoryLight, ...rest } = plain(tokens.category);
  return { onCategory, onCategoryLight, farger: rest };
}

/* ---------------------------------------------------------------- Validering */

/** Nøkler som ser ut som verdier eller nyansenummer i stedet for semantiske navn. */
const IKKE_SEMANTISK = [
  /^#/, /^[0-9a-f]{3,8}$/i, /^(rgb|hsl)/i, /^\d/, /\d{2,}$/, /^(c|col|color|farge)\d+$/i,
  /^(white|black|hvit|svart|grey|gray|gra)$/i,
];

/** Alle nøkkelstier i tokens.json som ikke er semantiske (tom liste = ok). */
export function nonSemanticKeys(tokens) {
  const bad = [];
  const walk = (o, path) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      const p = path ? `${path}.${k}` : k;
      if (IKKE_SEMANTISK.some((re) => re.test(k))) bad.push(p);
      walk(v, p);
    }
  };
  walk(tokens, '');
  return bad;
}

/** Strukturfeil i tokens.json (tom liste = ok). */
export function validate(tokens) {
  const errors = [];
  let colors;
  try {
    colors = resolveColors(tokens);
  } catch (e) {
    return [e.message];
  }
  for (const stil of STILER) {
    for (const modus of MODUSER) {
      const { farger, hoyKontrast } = colors[stil][modus];
      for (const f of FARGER) if (!(f in farger)) errors.push(`color.${stil}.${modus}.${f} mangler`);
      for (const f of Object.keys(farger)) if (!FARGER.includes(f)) errors.push(`color.${stil}.${modus}.${f} er ukjent (legg den i FARGER i generatoren)`);
      for (const f of Object.keys(hoyKontrast)) if (!HOY_KONTRAST.includes(f)) errors.push(`color.${stil}.${modus}.highContrast.${f} støttes ikke`);
      for (const [f, v] of [...Object.entries(farger), ...Object.entries(hoyKontrast)]) {
        try { parseColor(v); } catch (e) { errors.push(`color.${stil}.${modus}.${f}: ${e.message}`); }
      }
      if (farger.surface && parseColor(farger.surface).a !== 1) errors.push(`color.${stil}.${modus}.surface må være ugjennomsiktig`);
    }
  }
  const cat = categories(tokens);
  if (!cat.onCategory) errors.push('category.onCategory mangler');
  if (!cat.onCategoryLight) errors.push('category.onCategoryLight mangler');
  for (const [k, v] of Object.entries({ onCategory: cat.onCategory, onCategoryLight: cat.onCategoryLight, ...cat.farger })) {
    try { if (parseColor(v).a !== 1) errors.push(`category.${k} må være ugjennomsiktig`); } catch (e) { errors.push(`category.${k}: ${e.message}`); }
  }
  for (const [k, s] of Object.entries(plain(tokens.textStyle))) {
    for (const f of ['size', 'lineHeight', 'weight', 'ios', 'm3']) if (!(f in s)) errors.push(`textStyle.${k}.${f} mangler`);
    if (!(s.weight in plain(tokens.font.weight))) errors.push(`textStyle.${k}.weight «${s.weight}» finnes ikke i font.weight`);
  }
  const m3 = Object.values(plain(tokens.textStyle)).flatMap((s) => s.m3 ?? []);
  if (new Set(m3).size !== m3.length) errors.push('textStyle: samme M3-stil er brukt flere ganger');
  errors.push(...nonSemanticKeys(tokens).map((p) => `ikke-semantisk nøkkel: ${p}`));
  return errors;
}

/* ---------------------------------------------------------------- Web (CSS) */

function cssValue(v) {
  const c = parseColor(v);
  return c.a === 1 ? toHex(c) : `rgba(${c.r}, ${c.g}, ${c.b}, ${num(c.a)})`;
}

function cssColorBlock(tokens, stil, modus, { hoy = false } = {}) {
  const { farger, hoyKontrast } = resolveColors(tokens)[stil][modus];
  const lines = [];
  if (hoy) {
    for (const [k, v] of Object.entries(hoyKontrast)) lines.push(`  --ds-${kebab(k)}: ${cssValue(v)};`);
    return lines;
  }
  lines.push(`  --ds-color-scheme: ${modus === 'mork' ? 'dark' : 'light'};`);
  for (const f of FARGER) lines.push(`  --ds-${kebab(f)}: ${cssValue(farger[f])};`);
  const fam = tokens.font.family[stil];
  for (const [k, v] of Object.entries(plain(fam))) lines.push(`  --ds-font-${kebab(k)}: ${v};`);
  lines.push(`  --ds-blur-raised: ${tokens.effect.blurRaised[stil]}px;`);
  return lines;
}

/**
 * Selektorer som matcher dagens temaattributter (settes av hl-boot.js, hltheme.js, mode.js/sok-tema-offline.js og FinansHub):
 *   papir lys:  :root (standard), html[data-hl="2c"], FinansHub html[data-theme="lys"]
 *   papir mørk: html[data-hl="2c"][data-mode="dark"], FinansHub html[data-theme="mork"] (Q15),
 *               Kalender.app (html[data-kal-app], følger systemet) under prefers-color-scheme: dark
 *   glass mørk: html[data-hl="cur"] (standard i Homelab), FinansHub html[data-theme="glod"] (Q15)
 * glass lys finnes ikke (Q13): data-mode ignoreres i glass.
 */
export const CSS_SELECTORS = {
  'papir.lys': [':root', ':root[data-hl="2c"]', ':root[data-theme="lys"]'],
  'papir.mork': [':root[data-hl="2c"][data-mode="dark"]', ':root[data-theme="mork"]'],
  'papir.mork.system': [':root[data-kal-app]'],
  'glass.mork': [':root[data-hl="cur"]', ':root[data-theme="glod"]'],
};

export function generateCss(tokens) {
  const L = [];
  L.push(`/* ${HEADER}. */`);
  L.push('/* Designtokens for web (--ds-*). Se docs/designsystem.md. Stil = data-hl (2c = papir, cur = glass), modus = data-mode. */');
  L.push('');
  // Felles verdier (uavhengig av stil og modus).
  L.push(':root {');
  const cat = categories(tokens);
  L.push(`  --ds-on-category: ${cssValue(cat.onCategory)};`);
  L.push(`  --ds-on-category-light: ${cssValue(cat.onCategoryLight)};`);
  for (const [k, v] of Object.entries(cat.farger)) L.push(`  --ds-category-${kebab(k)}: ${cssValue(v)};`);
  for (const [k, v] of Object.entries(plain(tokens.font.weight))) L.push(`  --ds-weight-${kebab(k)}: ${v};`);
  for (const [k, s] of Object.entries(plain(tokens.textStyle))) {
    L.push(`  --ds-text-${kebab(k)}-size: ${s.size}px;`);
    L.push(`  --ds-text-${kebab(k)}-line: ${s.lineHeight}px;`);
    L.push(`  --ds-text-${kebab(k)}-weight: ${tokens.font.weight[s.weight]};`);
  }
  for (const [k, v] of Object.entries(plain(tokens.space))) L.push(`  --ds-space-${kebab(k)}: ${v}px;`);
  for (const [k, v] of Object.entries(plain(tokens.radius))) L.push(`  --ds-radius-${kebab(k)}: ${v}px;`);
  for (const [k, s] of Object.entries(plain(tokens.shadow))) L.push(`  --ds-shadow-${kebab(k)}: 0 ${s.y}px ${s.blur}px rgba(0, 0, 0, ${num(s.alpha)});`);
  for (const [k, v] of Object.entries(plain(tokens.z))) L.push(`  --ds-z-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(plain(tokens.motion.duration))) L.push(`  --ds-motion-${kebab(k)}: ${v}ms;`);
  for (const [k, v] of Object.entries(plain(tokens.motion.easing))) L.push(`  --ds-ease-${kebab(k)}: cubic-bezier(${v.map(num).join(', ')});`);
  L.push('}');
  L.push('');
  const block = (sel, lines, indent = '') => {
    L.push(`${indent}${sel.join(`,\n${indent}`)} {`);
    for (const l of lines) L.push(indent + l);
    L.push(`${indent}}`);
  };
  L.push('/* Papir lys (standard) */');
  block(CSS_SELECTORS['papir.lys'], cssColorBlock(tokens, 'papir', 'lys'));
  L.push('');
  L.push('/* Glass mørk («cur»). Glass har ingen lys modus (Q13), så data-mode ignoreres her. */');
  block(CSS_SELECTORS['glass.mork'], cssColorBlock(tokens, 'glass', 'mork'));
  L.push('');
  L.push('/* Papir mørk */');
  block(CSS_SELECTORS['papir.mork'], cssColorBlock(tokens, 'papir', 'mork'));
  L.push('');
  L.push('/* Kalender.app (data-kal-app) setter ikke data-mode, men følger systemet. */');
  L.push('@media (prefers-color-scheme: dark) {');
  block(CSS_SELECTORS['papir.mork.system'], cssColorBlock(tokens, 'papir', 'mork'), '  ');
  L.push('}');
  L.push('');
  L.push('/* Økt kontrast */');
  L.push('@media (prefers-contrast: more) {');
  block(CSS_SELECTORS['papir.lys'], cssColorBlock(tokens, 'papir', 'lys', { hoy: true }), '  ');
  block(CSS_SELECTORS['glass.mork'], cssColorBlock(tokens, 'glass', 'mork', { hoy: true }), '  ');
  block(CSS_SELECTORS['papir.mork'], cssColorBlock(tokens, 'papir', 'mork', { hoy: true }), '  ');
  L.push('}');
  L.push('@media (prefers-contrast: more) and (prefers-color-scheme: dark) {');
  block(CSS_SELECTORS['papir.mork.system'], cssColorBlock(tokens, 'papir', 'mork', { hoy: true }), '  ');
  L.push('}');
  L.push('');
  L.push('/* Reduser bevegelse: alle varigheter blir 0. */');
  L.push('@media (prefers-reduced-motion: reduce) {');
  L.push('  :root {');
  for (const k of Object.keys(plain(tokens.motion.duration))) L.push(`    --ds-motion-${kebab(k)}: ${tokens.motion.reduced}ms;`);
  L.push('  }');
  L.push('}');
  return L.join('\n') + '\n';
}

/* ---------------------------------------------------------------- iOS (Swift + asset-katalog) */

const swiftNum = (n) => (Number.isInteger(n) ? `${n}` : num(n));
const SWIFT_WEIGHT = { regular: '.regular', medium: '.medium', semibold: '.semibold', bold: '.bold' };

/** Navnet på fargesettet i asset-katalogen. Stil i navnet, modus som utseende (Any/Dark). */
export const assetName = (stil, farge) => `DS${cap(stil)}${cap(farge)}`;
export const categoryAssetName = (navn) => `DSCategory${cap(navn)}`;

function colorEntry(value, appearances) {
  const c = parseColor(value);
  const comp = (n) => `0x${hex2(n).toUpperCase()}`;
  const e = {};
  if (appearances.length) e.appearances = appearances;
  e.color = {
    'color-space': 'srgb',
    components: { alpha: c.a.toFixed(3), blue: comp(c.b), green: comp(c.g), red: comp(c.r) },
  };
  e.idiom = 'universal';
  return e;
}

const DARK = { appearance: 'luminosity', value: 'dark' };
const HIGH = { appearance: 'contrast', value: 'high' };
const assetJson = (o) => JSON.stringify(o, null, 2) + '\n';

export function generateXcassets(tokens) {
  const files = {};
  const base = PATHS.xcassets;
  files[`${base}/Contents.json`] = assetJson({ info: { author: 'xcode', version: 1 } });
  const colors = resolveColors(tokens);
  for (const stil of STILER) {
    const lys = colors[stil].lys;
    const mork = colors[stil].mork;
    for (const f of FARGER) {
      const entries = [colorEntry(lys.farger[f], []), colorEntry(mork.farger[f], [DARK])];
      if (HOY_KONTRAST.includes(f)) {
        entries.push(colorEntry(lys.hoyKontrast[f] ?? lys.farger[f], [HIGH]));
        entries.push(colorEntry(mork.hoyKontrast[f] ?? mork.farger[f], [DARK, HIGH]));
      }
      files[`${base}/${assetName(stil, f)}.colorset/Contents.json`] = assetJson({ colors: entries, info: { author: 'xcode', version: 1 } });
    }
  }
  const cat = categories(tokens);
  for (const [k, v] of [['onCategory', cat.onCategory], ['onCategoryLight', cat.onCategoryLight], ...Object.entries(cat.farger)]) {
    const name = k === 'onCategory' ? 'DSOnCategory' : k === 'onCategoryLight' ? 'DSOnCategoryLight' : categoryAssetName(k);
    files[`${base}/${name}.colorset/Contents.json`] = assetJson({ colors: [colorEntry(v, [])], info: { author: 'xcode', version: 1 } });
  }
  return files;
}

export function generateSwift(tokens) {
  const cat = categories(tokens);
  const styles = Object.entries(plain(tokens.textStyle));
  const L = [];
  L.push(`// ${HEADER}.`);
  L.push('// Designtokens for iOS. Fargene ligger i DesignTokens.xcassets (Any/Dark og økt kontrast); modus følger colorScheme,');
  L.push('// stilen (papir/glass) velges i kode. Se docs/designsystem.md.');
  L.push('//');
  L.push('// Bruk:');
  L.push('//   .foregroundStyle(DS.color(.textPrimary, stil: .papir))');
  L.push('//   .background(DSFyll(.surfaceRaised))          // stilen hentes fra miljøet (.environment(\\.dsStil, .glass))');
  L.push('//   .font(.ds(.body))                             // systemfont, skalerer med Dynamic Type');
  L.push('//   .padding(DS.Space.lg)');
  L.push('');
  L.push('import SwiftUI');
  L.push('');
  L.push('enum DS {');
  L.push('    /// Visuell stil. Glass har bare mørk modus (Q13): i lys modus gir glass samme farger som papir.');
  L.push('    enum Stil: String, CaseIterable, Sendable {');
  for (const s of STILER) L.push(`        case ${s}`);
  L.push('');
  L.push('        fileprivate var assetPrefix: String {');
  L.push('            switch self {');
  for (const s of STILER) L.push(`            case .${s}: return "DS${cap(s)}"`);
  L.push('            }');
  L.push('        }');
  L.push('    }');
  L.push('');
  L.push('    /// Semantiske farger.');
  L.push('    enum Farge: String, CaseIterable, Sendable {');
  for (const f of FARGER) L.push(`        case ${f}`);
  L.push('');
  L.push('        fileprivate var assetSuffix: String {');
  L.push('            switch self {');
  for (const f of FARGER) L.push(`            case .${f}: return "${cap(f)}"`);
  L.push('            }');
  L.push('        }');
  L.push('    }');
  L.push('');
  L.push('    /// Kategorifarger (fyll). Tekst og ikon oppå bruker DS.onCategory (≥ 4.5:1).');
  L.push('    enum Kategori: String, CaseIterable, Sendable {');
  for (const k of Object.keys(cat.farger)) L.push(`        case ${k}`);
  L.push('');
  L.push('        fileprivate var assetName: String {');
  L.push('            switch self {');
  for (const k of Object.keys(cat.farger)) L.push(`            case .${k}: return "${categoryAssetName(k)}"`);
  L.push('            }');
  L.push('        }');
  L.push('    }');
  L.push('');
  L.push('    /// Fargen for en token i en stil. Lys/mørk og økt kontrast velges av systemet (asset-katalogen).');
  L.push('    static func color(_ farge: Farge, stil: Stil) -> Color {');
  L.push('        Color(stil.assetPrefix + farge.assetSuffix, bundle: nil)');
  L.push('    }');
  L.push('');
  L.push('    static func category(_ kategori: Kategori) -> Color {');
  L.push('        Color(kategori.assetName, bundle: nil)');
  L.push('    }');
  L.push('');
  L.push('    static var onCategory: Color { Color("DSOnCategory", bundle: nil) }');
  L.push('    /// Tekst på en lys farge brukeren har valgt selv (velges etter luminansen i stedet for onCategory).');
  L.push('    static var onCategoryLight: Color { Color("DSOnCategoryLight", bundle: nil) }');
  L.push('');
  L.push('    /// Tekststiler. size/lineHeight er tokenverdiene i pt; textStyle er iOS-stilen som styrer Dynamic Type.');
  L.push('    enum Tekst: String, CaseIterable, Sendable {');
  for (const [k] of styles) L.push(`        case ${k}`);
  L.push('');
  const sw = (prop, type, fn) => {
    L.push(`        var ${prop}: ${type} {`);
    L.push('            switch self {');
    for (const [k, s] of styles) L.push(`            case .${k}: return ${fn(s)}`);
    L.push('            }');
    L.push('        }');
  };
  sw('size', 'CGFloat', (s) => swiftNum(s.size));
  L.push('');
  sw('lineHeight', 'CGFloat', (s) => swiftNum(s.lineHeight));
  L.push('');
  sw('weight', 'Font.Weight', (s) => SWIFT_WEIGHT[s.weight]);
  L.push('');
  sw('textStyle', 'Font.TextStyle', (s) => `.${s.ios}`);
  L.push('');
  L.push('        /// Ekstra linjeavstand for å nå lineHeight (SwiftUI legger den mellom linjene).');
  L.push('        var lineSpacing: CGFloat { max(0, lineHeight - size * 1.2) }');
  L.push('    }');
  L.push('');
  L.push('    enum Space {');
  for (const [k, v] of Object.entries(plain(tokens.space))) L.push(`        static let ${k}: CGFloat = ${swiftNum(v)}`);
  L.push('    }');
  L.push('');
  L.push('    enum Radius {');
  for (const [k, v] of Object.entries(plain(tokens.radius))) L.push(`        static let ${k}: CGFloat = ${swiftNum(v)}`);
  L.push('    }');
  L.push('');
  L.push('    struct Skygge: Sendable {');
  L.push('        let y: CGFloat');
  L.push('        let blur: CGFloat');
  L.push('        let alpha: Double');
  L.push('');
  for (const [k, s] of Object.entries(plain(tokens.shadow))) L.push(`        static let ${k} = Skygge(y: ${swiftNum(s.y)}, blur: ${swiftNum(s.blur)}, alpha: ${swiftNum(s.alpha)})`);
  L.push('    }');
  L.push('');
  L.push('    /// Lag (zIndex).');
  L.push('    enum Z {');
  for (const [k, v] of Object.entries(plain(tokens.z))) L.push(`        static let ${k}: Double = ${swiftNum(v)}`);
  L.push('    }');
  L.push('');
  L.push('    /// Bevegelse. Varigheter i sekunder. animation(…, reduce:) gir nil når «Reduser bevegelse» er på.');
  L.push('    enum Motion {');
  for (const [k, v] of Object.entries(plain(tokens.motion.duration))) L.push(`        static let ${k}: Double = ${swiftNum(v / 1000)}`);
  L.push(`        static let reduced: Double = ${swiftNum(tokens.motion.reduced / 1000)}`);
  L.push('');
  L.push('        enum Easing: Sendable {');
  for (const k of Object.keys(plain(tokens.motion.easing))) L.push(`            case ${k}`);
  L.push('        }');
  L.push('');
  L.push('        static func animation(_ duration: Double, easing: Easing = .standard, reduce: Bool = false) -> Animation? {');
  L.push('            if reduce { return nil }');
  L.push('            switch easing {');
  for (const [k, v] of Object.entries(plain(tokens.motion.easing))) L.push(`            case .${k}: return Animation.timingCurve(${v.map(swiftNum).join(', ')}, duration: duration)`);
  L.push('            }');
  L.push('        }');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('extension Font {');
  L.push('    /// Systemfonten i en tokenstil (skalerer med Dynamic Type).');
  L.push('    static func ds(_ stil: DS.Tekst) -> Font {');
  L.push('        .system(stil.textStyle, design: .default, weight: stil.weight)');
  L.push('    }');
  L.push('');
  L.push('    /// En egen font (f.eks. Papir-fontene) i tokenstørrelsen, skalert relativt til tekststilen.');
  L.push('    static func ds(_ stil: DS.Tekst, custom navn: String) -> Font {');
  L.push('        .custom(navn, size: stil.size, relativeTo: stil.textStyle).weight(stil.weight)');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('private struct DSStilKey: EnvironmentKey {');
  L.push('    static let defaultValue: DS.Stil = .papir');
  L.push('}');
  L.push('');
  L.push('extension EnvironmentValues {');
  L.push('    /// Valgt stil (papir/glass) for DSFyll. Modus følger colorScheme.');
  L.push('    var dsStil: DS.Stil {');
  L.push('        get { self[DSStilKey.self] }');
  L.push('        set { self[DSStilKey.self] = newValue }');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/// En fargetoken som ShapeStyle: stilen leses fra miljøet (\\.dsStil).');
  L.push('struct DSFyll: ShapeStyle {');
  L.push('    let farge: DS.Farge');
  L.push('');
  L.push('    init(_ farge: DS.Farge) {');
  L.push('        self.farge = farge');
  L.push('    }');
  L.push('');
  L.push('    func resolve(in environment: EnvironmentValues) -> Color {');
  L.push('        DS.color(farge, stil: environment.dsStil)');
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('extension View {');
  L.push('    /// Skygge fra tokenene.');
  L.push('    func dsShadow(_ skygge: DS.Skygge) -> some View {');
  L.push('        shadow(color: Color.black.opacity(skygge.alpha), radius: skygge.blur / 2, x: 0, y: skygge.y)');
  L.push('    }');
  L.push('}');
  return L.join('\n') + '\n';
}

/* ---------------------------------------------------------------- Android (Compose) */

const KT_WEIGHT = { regular: 'FontWeight.Normal', medium: 'FontWeight.Medium', semibold: 'FontWeight.SemiBold', bold: 'FontWeight.Bold' };

function ktColor(v) {
  const c = parseColor(v);
  const a = Math.round(c.a * 255);
  return `Color(0x${[a, c.r, c.g, c.b].map((n) => hex2(n).toUpperCase()).join('')})`;
}
const ktOpaque = (farger, navn) => ktColor(toHex(opaque(farger, navn)));
const ktFloat = (n) => `${num(n)}${Number.isInteger(n) ? '.0' : ''}f`;
const objName = (stil, modus) => `${cap(stil)}${cap(modus)}`;

function ktColorsBlocks(tokens, L) {
  const colors = resolveColors(tokens);
  const cat = categories(tokens);
  L.push('/** Visuell stil. Glass har bare mørk modus (Q13): i lys modus gir glass samme farger som papir. */');
  L.push('enum class DsStil { Papir, Glass }');
  L.push('');
  L.push('/** Kategorifarger (fyll). Tekst og ikon oppå bruker onCategory (≥ 4.5:1). Like i alle stiler og moduser. */');
  L.push('@Immutable');
  L.push('data class DsCategoryColors(');
  L.push('    val onCategory: Color,');
  L.push('    val onCategoryLight: Color,');
  for (const k of Object.keys(cat.farger)) L.push(`    val ${k}: Color,`);
  L.push(')');
  L.push('');
  L.push('/** Alle semantiske farger for én stil og modus (også de som ikke finnes i Material 3). Alfa er beholdt. */');
  L.push('@Immutable');
  L.push('data class DsColors(');
  L.push('    val isDark: Boolean,');
  for (const f of FARGER) L.push(`    val ${f}: Color,`);
  L.push('    val category: DsCategoryColors,');
  L.push(')');
  L.push('');
  L.push('object DsPalette {');
  L.push('    val Category = DsCategoryColors(');
  L.push(`        onCategory = ${ktColor(cat.onCategory)},`);
  L.push(`        onCategoryLight = ${ktColor(cat.onCategoryLight)},`);
  for (const [k, v] of Object.entries(cat.farger)) L.push(`        ${k} = ${ktColor(v)},`);
  L.push('    )');
  for (const stil of STILER) {
    for (const modus of MODUSER) {
      const { farger, alias } = colors[stil][modus];
      L.push('');
      if (alias) {
        const [s, m] = alias.split('.');
        L.push(`    /** Peker til ${alias} (Q13). */`);
        L.push(`    val ${objName(stil, modus)}: DsColors get() = ${objName(s, m)}`);
        continue;
      }
      L.push(`    val ${objName(stil, modus)} = DsColors(`);
      L.push(`        isDark = ${modus === 'mork'},`);
      for (const f of FARGER) L.push(`        ${f} = ${ktColor(farger[f])},`);
      L.push('        category = Category,');
      L.push('    )');
    }
  }
  L.push('');
  L.push('    fun colors(stil: DsStil, dark: Boolean): DsColors = when (stil) {');
  for (const stil of STILER) L.push(`        DsStil.${cap(stil)} -> if (dark) ${objName(stil, 'mork')} else ${objName(stil, 'lys')}`);
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/** Gjeldende DsColors. Settes av DsTheme. */');
  L.push('val LocalDsColors = staticCompositionLocalOf { DsPalette.PapirLys }');
  L.push('');
  L.push('object DsSpace {');
  for (const [k, v] of Object.entries(plain(tokens.space))) L.push(`    val ${k}: Dp = ${v}.dp`);
  L.push('}');
  L.push('');
  L.push('object DsRadius {');
  for (const [k, v] of Object.entries(plain(tokens.radius))) L.push(`    val ${k}: Dp = ${v}.dp`);
  L.push('}');
  L.push('');
  L.push('/** Skygger som elevation. */');
  L.push('object DsElevation {');
  for (const [k, s] of Object.entries(plain(tokens.shadow))) L.push(`    val ${k}: Dp = ${s.elevation}.dp`);
  L.push('}');
  L.push('');
  L.push('/** Lag (Modifier.zIndex). */');
  L.push('object DsZ {');
  for (const [k, v] of Object.entries(plain(tokens.z))) L.push(`    const val ${k.toUpperCase()}: Float = ${ktFloat(v)}`);
  L.push('}');
  L.push('');
  L.push('/** Bevegelse. Varigheter i ms; duration(…, reduced = true) gir 0 når animasjoner er slått av. */');
  L.push('object DsMotion {');
  for (const [k, v] of Object.entries(plain(tokens.motion.duration))) L.push(`    const val ${k.toUpperCase()}: Int = ${v}`);
  L.push(`    const val REDUCED: Int = ${tokens.motion.reduced}`);
  for (const [k, v] of Object.entries(plain(tokens.motion.easing))) L.push(`    val ${cap(k)}Easing: Easing = CubicBezierEasing(${v.map(ktFloat).join(', ')})`);
  L.push('');
  L.push('    fun duration(ms: Int, reduced: Boolean): Int = if (reduced) REDUCED else ms');
  L.push('}');
  L.push('');
  L.push('/** Tokenstilene som TextStyle (systemfont). size/lineHeight i sp. */');
  L.push('object DsText {');
  for (const [k, s] of Object.entries(plain(tokens.textStyle))) {
    L.push(`    val ${k} = TextStyle(fontFamily = FontFamily.Default, fontWeight = ${KT_WEIGHT[s.weight]}, fontSize = ${s.size}.sp, lineHeight = ${s.lineHeight}.sp)`);
  }
  L.push('}');
}

function ktM3(tokens, L) {
  const colors = resolveColors(tokens);
  L.push('');
  L.push('/**');
  L.push(' * Material 3-fargeskjema fra tokenene. Flater med alfa (glass) er lagt over surface, så ark og menyer blir ugjennomsiktige.');
  L.push(' * Dynamic color brukes ikke (Q16: fast designspråk).');
  L.push(' */');
  L.push('object DsSchemes {');
  for (const stil of STILER) {
    for (const modus of MODUSER) {
      const { farger, alias } = colors[stil][modus];
      if (alias) {
        const [s, m] = alias.split('.');
        L.push(`    /** Peker til ${alias} (Q13). */`);
        L.push(`    val ${objName(stil, modus)}: ColorScheme get() = ${objName(s, m)}`);
        L.push('');
        continue;
      }
      const o = (n) => ktOpaque(farger, n);
      const fn = modus === 'mork' ? 'darkColorScheme' : 'lightColorScheme';
      L.push(`    val ${objName(stil, modus)}: ColorScheme = ${fn}(`);
      const rows = [
        ['primary', o('accent')], ['onPrimary', o('onAccent')],
        ['primaryContainer', o('surfaceSunken')], ['onPrimaryContainer', o('textPrimary')],
        ['secondary', o('textSecondary')], ['onSecondary', o('surface')],
        ['secondaryContainer', o('surfaceSunken')], ['onSecondaryContainer', o('textPrimary')],
        ['tertiary', o('success')], ['onTertiary', o('onSuccess')],
        ['background', o('surface')], ['onBackground', o('textPrimary')],
        ['surface', o('surface')], ['onSurface', o('textPrimary')],
        ['surfaceVariant', o('surfaceSunken')], ['onSurfaceVariant', o('textSecondary')],
        ['surfaceTint', o('surface')],
        ['inverseSurface', o('textPrimary')], ['inverseOnSurface', o('surface')],
        ['error', o('danger')], ['onError', o('onDanger')],
        ['errorContainer', o('surfaceSunken')], ['onErrorContainer', o('danger')],
        ['outline', o('line')], ['outlineVariant', o('line')],
        ['scrim', ktColor(farger.scrim)],
        ['surfaceBright', o('surfaceRaised')], ['surfaceDim', o('surfaceSunken')],
        ['surfaceContainer', o('surfaceRaised')], ['surfaceContainerHigh', o('surfaceRaised')],
        ['surfaceContainerHighest', o('surfaceSunken')], ['surfaceContainerLow', o('surfaceRaised')],
        ['surfaceContainerLowest', o('surfaceRaised')],
      ];
      for (const [k, v] of rows) L.push(`        ${k} = ${v},`);
      L.push('    )');
      L.push('');
    }
  }
  L.push('    fun scheme(stil: DsStil, dark: Boolean): ColorScheme = when (stil) {');
  for (const stil of STILER) L.push(`        DsStil.${cap(stil)} -> if (dark) ${objName(stil, 'mork')} else ${objName(stil, 'lys')}`);
  L.push('    }');
  L.push('}');
  L.push('');
  L.push('/** Material 3-typografi fra tokenstilene (systemfont). */');
  L.push('val DsTypography = Typography(');
  for (const [k, s] of Object.entries(plain(tokens.textStyle))) for (const m of s.m3) L.push(`    ${m} = DsText.${k},`);
  L.push(')');
  L.push('');
  const r = plain(tokens.radius);
  L.push('/** Material 3-former fra radiene. */');
  L.push('val DsShapes = Shapes(');
  L.push(`    extraSmall = RoundedCornerShape(DsRadius.sm),`);
  L.push(`    small = RoundedCornerShape(DsRadius.sm),`);
  L.push(`    medium = RoundedCornerShape(DsRadius.md),`);
  L.push(`    large = RoundedCornerShape(DsRadius.lg),`);
  L.push(`    extraLarge = RoundedCornerShape(DsRadius.xl),`);
  L.push(')');
  if (!r.sm || !r.md || !r.lg || !r.xl) throw new Error('radius.sm/md/lg/xl trengs for Android-formene');
  L.push('');
  L.push('/**');
  L.push(' * Tema fra tokenene: MaterialTheme + LocalDsColors. Stil er et appvalg; dark følger systemet som standard.');
  L.push(' * (Ikke tatt i bruk ennå – Fase 5.)');
  L.push(' */');
  L.push('@Composable');
  L.push('fun DsTheme(stil: DsStil, dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {');
  L.push('    CompositionLocalProvider(LocalDsColors provides DsPalette.colors(stil, dark)) {');
  L.push('        MaterialTheme(colorScheme = DsSchemes.scheme(stil, dark), typography = DsTypography, shapes = DsShapes, content = content)');
  L.push('    }');
  L.push('}');
}

export function generateKotlin(tokens, pkg, { material3 = true } = {}) {
  const L = [];
  L.push(`// ${HEADER}.`);
  L.push('// Designtokens for Compose. Se docs/designsystem.md.');
  L.push(`package ${pkg}`);
  L.push('');
  const imports = [
    'androidx.compose.animation.core.CubicBezierEasing',
    'androidx.compose.animation.core.Easing',
    'androidx.compose.runtime.Immutable',
    'androidx.compose.runtime.staticCompositionLocalOf',
    'androidx.compose.ui.graphics.Color',
    'androidx.compose.ui.text.TextStyle',
    'androidx.compose.ui.text.font.FontFamily',
    'androidx.compose.ui.text.font.FontWeight',
    'androidx.compose.ui.unit.Dp',
    'androidx.compose.ui.unit.dp',
    'androidx.compose.ui.unit.sp',
  ];
  if (material3) {
    imports.push(
      'androidx.compose.foundation.isSystemInDarkTheme',
      'androidx.compose.foundation.shape.RoundedCornerShape',
      'androidx.compose.material3.ColorScheme',
      'androidx.compose.material3.MaterialTheme',
      'androidx.compose.material3.Shapes',
      'androidx.compose.material3.Typography',
      'androidx.compose.material3.darkColorScheme',
      'androidx.compose.material3.lightColorScheme',
      'androidx.compose.runtime.Composable',
      'androidx.compose.runtime.CompositionLocalProvider',
    );
  } else {
    imports.push('androidx.wear.compose.material.Colors');
  }
  for (const i of imports.sort()) L.push(`import ${i}`);
  L.push('');
  ktColorsBlocks(tokens, L);
  if (material3) {
    ktM3(tokens, L);
  } else {
    const colors = resolveColors(tokens);
    L.push('');
    L.push('/** Wear Compose Material-farger (klokka er alltid mørk). Flater med alfa er lagt over surface. */');
    L.push('object DsWearColors {');
    for (const stil of STILER) {
      const { farger } = colors[stil].mork;
      const o = (n) => ktOpaque(farger, n);
      L.push(`    val ${cap(stil)}: Colors = Colors(`);
      const rows = [
        ['primary', o('accent')], ['primaryVariant', o('accent')],
        ['secondary', o('textSecondary')], ['secondaryVariant', o('textSecondary')],
        ['background', o('surface')], ['surface', o('surfaceRaised')],
        ['error', o('danger')], ['onPrimary', o('onAccent')], ['onSecondary', o('surface')],
        ['onBackground', o('textPrimary')], ['onSurface', o('textPrimary')],
        ['onSurfaceVariant', o('textSecondary')], ['onError', o('onDanger')],
      ];
      for (const [k, v] of rows) L.push(`        ${k} = ${v},`);
      L.push('    )');
    }
    L.push('');
    L.push('    fun colors(stil: DsStil): Colors = when (stil) {');
    for (const stil of STILER) L.push(`        DsStil.${cap(stil)} -> ${cap(stil)}`);
    L.push('    }');
    L.push('}');
  }
  return L.join('\n') + '\n';
}

/* ---------------------------------------------------------------- Samlet */

/** Alle genererte filer: { relativSti: innhold }. Kaster ved ugyldige tokens. */
export function generate(tokens) {
  const errors = validate(tokens);
  if (errors.length) throw new Error('tokens.json er ugyldig:\n  ' + errors.join('\n  '));
  return {
    [PATHS.css]: generateCss(tokens),
    [PATHS.swift]: generateSwift(tokens),
    ...generateXcassets(tokens),
    [PATHS.kotlinApp]: generateKotlin(tokens, 'no.kristo.finanshub.ui.designsystem'),
    [PATHS.kotlinKalender]: generateKotlin(tokens, 'no.kristo.kalender.ui.designsystem'),
    [PATHS.kotlinWear]: generateKotlin(tokens, 'no.kristo.finanshub.wear.ui.designsystem', { material3: false }),
  };
}

export function loadTokens(root = ROOT) {
  return JSON.parse(readFileSync(join(root, TOKENS_PATH), 'utf8'));
}

/** Filer på disk i asset-katalogen (for å finne fargesett som er til overs). */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Avvik mellom generert innhold og filene på disk: [{ path, problem }]. */
export function diff(files, root = ROOT) {
  const problems = [];
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    if (!existsSync(p)) problems.push({ path: rel, problem: 'mangler' });
    else if (readFileSync(p, 'utf8') !== content) problems.push({ path: rel, problem: 'avviker' });
  }
  for (const p of listFiles(join(root, PATHS.xcassets))) {
    const rel = relative(root, p).split('\\').join('/');
    if (!(rel in files)) problems.push({ path: rel, problem: 'til overs' });
  }
  return problems;
}

function main(argv) {
  const files = generate(loadTokens());
  if (argv.includes('--check')) {
    const problems = diff(files);
    if (problems.length) {
      console.error('Designtokens er utdatert. Kjør «npm run tokens» og commit filene:');
      for (const { path, problem } of problems) console.error(`  ${problem}: ${path}`);
      process.exit(1);
    }
    console.log(`Designtokens er oppdatert (${Object.keys(files).length} filer).`);
    return;
  }
  // Fjern fargesett som ikke lenger finnes i tokens.json.
  for (const p of listFiles(join(ROOT, PATHS.xcassets))) {
    const rel = relative(ROOT, p).split('\\').join('/');
    if (!(rel in files)) rmSync(dirname(p), { recursive: true, force: true });
  }
  let changed = 0;
  for (const [rel, content] of Object.entries(files)) {
    const p = join(ROOT, rel);
    if (existsSync(p) && readFileSync(p, 'utf8') === content) continue;
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    changed++;
  }
  console.log(`Designtokens: ${changed} av ${Object.keys(files).length} filer skrevet.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
