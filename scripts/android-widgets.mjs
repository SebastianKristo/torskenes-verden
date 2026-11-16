#!/usr/bin/env node
// Q31: widgetene i Android-appen defineres ett sted, apps/android/app/widgets.json (én definisjon per widget med
// variantene standard, One UI, Samsung og låseskjerm). Herfra genereres
//   - <receiver>-blokken i apps/android/app/src/main/AndroidManifest.xml (mellom widgets:start og widgets:end)
//   - apps/android/app/src/main/java/no/kristo/finanshub/widget/WidgetKatalog.kt (galleriet og Samsung-mottakerne)
// `npm run widgets` skriver filene, `npm run widgets:check` feiler når de ikke stemmer med definisjonen.
// Mottakernavnene står fast: et nytt navn gjør at widgets brukerne allerede har plassert, forsvinner.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/android/app');
export const DEF = join(APP, 'widgets.json');
export const MANIFEST = join(APP, 'src/main/AndroidManifest.xml');
export const KATALOG = join(APP, 'src/main/java/no/kristo/finanshub/widget/WidgetKatalog.kt');
const START = '<!-- widgets:start · generert fra apps/android/app/widgets.json med «npm run widgets», ikke rediger for hånd -->';
const END = '<!-- widgets:end -->';
const TYPER = { standard: 'standard', oneui: 'One UI', samsung: 'Samsung', laaseskjerm: 'låseskjerm' };

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ktStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$') + '"';

/** Sjekker definisjonen: unike id-er og mottakere, kjente typer, gyldige navn. Kaster ved feil. */
export function validate(def) {
  const ids = new Set(), recs = new Set();
  for (const w of def.widgets) {
    if (!/^[a-z][a-z0-9-]*$/.test(w.id)) throw new Error(`ugyldig id: ${w.id}`);
    if (ids.has(w.id)) throw new Error(`dobbel id: ${w.id}`);
    ids.add(w.id);
    if (!w.navn || !w.gruppe || !w.varianter?.length) throw new Error(`${w.id}: mangler navn, gruppe eller varianter`);
    for (const v of w.varianter) {
      if (!TYPER[v.type]) throw new Error(`${w.id}: ukjent type ${v.type}`);
      if (!/^[A-Z][A-Za-z0-9]*$/.test(v.mottaker)) throw new Error(`${w.id}: ugyldig mottaker ${v.mottaker}`);
      if (recs.has(v.mottaker)) throw new Error(`dobbel mottaker: ${v.mottaker}`);
      recs.add(v.mottaker);
      if (!/^[a-z][a-z0-9_]*$/.test(v.xml)) throw new Error(`${v.mottaker}: ugyldig xml ${v.xml}`);
      if (!v.etikett) throw new Error(`${v.mottaker}: mangler etikett`);
      if (v.galleri && !v.storrelse) throw new Error(`${v.mottaker}: galleri krever storrelse`);
      if (v.samsungPaa && v.type !== 'samsung') throw new Error(`${v.mottaker}: samsungPaa gjelder bare Samsung-varianter`);
    }
  }
  return def;
}

export function manifestBlock(def, indent = '        ') {
  const out = [indent + START];
  for (const w of def.widgets) {
    const typer = [...new Set(w.varianter.map((v) => TYPER[v.type]))].join(', ');
    out.push(`${indent}<!-- ${xmlEsc(w.navn)} (${typer}) -->`);
    for (const v of w.varianter) {
      const en = v.aktiv === undefined ? '' : ` android:enabled="${v.aktiv ? 'true' : 'false'}"`;
      out.push(`${indent}<receiver android:name=".widget.${v.mottaker}" android:exported="true"${en} android:label="${xmlEsc(v.etikett)}">`);
      out.push(`${indent}    <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>`);
      out.push(`${indent}    <meta-data android:name="android.appwidget.provider" android:resource="@xml/${v.xml}" />`);
      out.push(`${indent}</receiver>`);
    }
  }
  out.push(indent + END);
  return out.join('\n');
}

export function katalog(def) {
  const rows = [];
  for (const w of def.widgets) {
    for (const v of w.varianter) {
      const args = [ktStr(w.id), ktStr(w.gruppe), ktStr(v.type), ktStr(v.mottaker), ktStr(v.etikett), v.galleri ? ktStr(v.galleri) : 'null', v.storrelse ? ktStr(v.storrelse) : 'null', v.samsungPaa ? 'true' : 'false'];
      rows.push(`        WidgetVariant(${args.join(', ')}),`);
    }
  }
  return `// Generert fra apps/android/app/widgets.json med «npm run widgets» (scripts/android-widgets.mjs). Ikke rediger for hånd.
package no.kristo.finanshub.widget

/** Én variant av en widget (Q31): standard, oneui, samsung eller laaseskjerm. [mottaker] er klassenavnet i widget-pakken. */
data class WidgetVariant(
    val widget: String,
    val gruppe: String,
    val type: String,
    val mottaker: String,
    val etikett: String,
    val galleri: String?,
    val storrelse: String?,
    /** Av i manifestet eller ikke: appen slår den på på Samsung-telefoner (S24.enableProviders). */
    val samsungPaa: Boolean,
) {
    val klasse: String get() = "no.kristo.finanshub.widget.$mottaker"
    val samsung: Boolean get() = type == "samsung"
}

object WidgetKatalog {
    /** Alle variantene, i samme rekkefølge som definisjonen. */
    val alle: List<WidgetVariant> = listOf(
${rows.join('\n')}
    )

    /** Innstillinger → App → Widgets: variantene med navn i galleriet. */
    val galleri: List<WidgetVariant> get() = alle.filter { it.galleri != null }

    /** Samsung-variantene appen slår på når telefonen er en Samsung. */
    val slaasPaaSamsung: List<WidgetVariant> get() = alle.filter { it.samsungPaa }
}
`;
}

export function render(def, manifest) {
  const a = manifest.indexOf(START), b = manifest.indexOf(END);
  if (a < 0 || b < a) throw new Error('fant ikke widgets:start/widgets:end i AndroidManifest.xml');
  const lineStart = manifest.lastIndexOf('\n', a) + 1;
  const indent = manifest.slice(lineStart, a);
  return manifest.slice(0, lineStart) + manifestBlock(def, indent) + manifest.slice(b + END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const def = validate(JSON.parse(readFileSync(DEF, 'utf8')));
  const man = readFileSync(MANIFEST, 'utf8');
  const nyMan = render(def, man);
  const nyKat = katalog(def);
  if (process.argv.includes('--check')) {
    const feil = [];
    if (nyMan !== man) feil.push('AndroidManifest.xml');
    let kat = '';
    try { kat = readFileSync(KATALOG, 'utf8'); } catch { /* mangler */ }
    if (nyKat !== kat) feil.push('widget/WidgetKatalog.kt');
    if (feil.length) { console.error(`Ikke i takt med widgets.json: ${feil.join(', ')}. Kjør «npm run widgets».`); process.exit(1); }
    console.log('Widgetene stemmer med widgets.json.');
  } else {
    writeFileSync(MANIFEST, nyMan);
    writeFileSync(KATALOG, nyKat);
    console.log('Skrev AndroidManifest.xml og widget/WidgetKatalog.kt fra widgets.json.');
  }
}
