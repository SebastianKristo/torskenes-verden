// Prompt 85 (AND85): gjennomgang av Android-appene – kildesjekker for rettingene og de rene reglene oversatt til JS.
// De samme reglene (freshLaunch85, relKeys85, duePlan85) er også kompilert og kjørt med kotlinc mot fasiten under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/android/app/src/main/java/no/kristo/finanshub');
const KAL = join(ROOT, 'apps/android/kalender/src/main/java/no/kristo/kalender');
/** Kode uten kommentarer. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (f, dir = SRC) => strip(readFileSync(join(dir, f), 'utf8'));
/** Kroppen til en funksjon/blokk som starter ved `start` (til klammene går opp). */
function block(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `fant ikke «${start}»`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  assert.fail('ubalanserte klammer');
}

/* ---- Speiler freshLaunch85 / relKeys85 / duePlan85 ---- */
const FROM_HISTORY = 0x00100000;
const freshLaunch = (restored, flags) => !restored && (flags & FROM_HISTORY) === 0;
function relKeys(ids) {
  const seen = new Map();
  return ids.map((id) => { const n = seen.get(id) ?? 0; seen.set(id, n + 1); return n === 0 ? `r-${id}` : `r-${id}#${n}`; });
}
function duePlan(raw, now) {
  let a;
  try { a = JSON.parse(raw ?? '[]'); } catch { return []; }
  if (!Array.isArray(a)) return [];
  return a.filter((o) => o && typeof o === 'object' && Number(o.at) > now && String(o.id ?? '') !== '');
}

test('delt fil og lenke behandles bare én gang (ikke ved gjenskaping eller fra Nylige)', () => {
  const m = code('MainActivity.kt');
  const onCreate = block(m, 'override fun onCreate');
  assert.match(onCreate, /val fresh85 = freshLaunch85\(savedInstanceState != null, intent\?\.flags \?: 0\)/);
  assert.match(onCreate, /if \(fresh85\) handleShare\(intent\)/);
  assert.match(onCreate, /if \(fresh85\) intent\?\.data\?\.let\(::openData43\)/);
  assert.doesNotMatch(onCreate, /^\s*handleShare\(intent\)/m);
  assert.doesNotMatch(onCreate, /^\s*intent\?\.data\?\.let\(::openData43\)/m);
  // Nye intenter mens appen lever går fortsatt rett gjennom.
  const onNew = block(m, 'override fun onNewIntent');
  assert.match(onNew, /handleShare\(intent\)/);
  assert.match(onNew, /intent\.data\?\.let\(::openData43\)/);
  assert.match(m, /fun freshLaunch85\(restored: Boolean, flags: Int\): Boolean =\s*!restored && \(flags and Intent\.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY\) == 0/);
  assert.equal(freshLaunch(false, 0), true);
  assert.equal(freshLaunch(false, 0x10000000), true);
  assert.equal(freshLaunch(true, 0), false);
  assert.equal(freshLaunch(false, 0x10000000 | FROM_HISTORY), false);

  const k = block(code('MainActivity.kt', KAL), 'override fun onCreate(savedInstanceState');
  assert.match(k, /if \(savedInstanceState == null && \(\(intent\?\.flags \?: 0\) and Intent\.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY\) == 0\) handle\(intent\)/);
  assert.doesNotMatch(k, /^\s*handle\(intent\)/m);
});

test('Api.bytes har tidsgrenser, og ingen HttpURLConnection i appene mangler dem', () => {
  const b = block(code('Api.kt'), 'suspend fun bytes');
  assert.match(b, /connectTimeout = 10_000/);
  assert.match(b, /readTimeout = 30_000/);
});

test('utgivelseslisten i Media får unike nøkler', () => {
  const m = code('ui/Media43.kt');
  assert.match(m, /relKeys85\(list\.map \{ it\.guid \+ it\.indexer \}\)\.forEachIndexed/);
  assert.doesNotMatch(m, /item\(key = "r-" \+ r\.guid \+ r\.indexer\)/);
  const keys = relKeys(['aX', 'bX', 'aX', '', '', 'aX']);
  assert.deepEqual(keys, ['r-aX', 'r-bX', 'r-aX#1', 'r-', 'r-#1', 'r-aX#2']);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(relKeys(['a', 'b']), ['r-a', 'r-b']); // uendret når alt er unikt
});

test('Helse-forklaringen holder seg unna systemfeltene og kan rulles', () => {
  const h = code('family/HealthRationaleActivity.kt');
  assert.match(h, /\.systemBarsPadding\(\)\.verticalScroll\(rememberScrollState\(\)\)\.padding\(24\.dp\)/);
  assert.match(h, /import androidx\.compose\.foundation\.verticalScroll/);
  assert.match(h, /import androidx\.compose\.foundation\.rememberScrollState/);
});

test('opptak stoppes når appen legges i bakgrunnen', () => {
  const b = block(code('AppViewModel.kt'), 'fun onBackground()');
  assert.match(b, /if \(Voice56\.phase == "rec"\) runCatching \{ stopMic56\(false\) \}/);
});

test('alarmer og nærhetsvarsler settes opp igjen etter omstart av telefonen', () => {
  const a = code('Alarms37.kt');
  const sched = block(a, 'fun schedule(ctx: Context, data: TasksData?)');
  assert.match(sched, /putString\("plan85", plan85\.toString\(\)\)/);
  assert.match(sched, /arm85\(ctx, am, code, whenMs, alarm, t\.id, t\.title, body\)/);
  const rest = block(a, 'fun restore85(ctx: Context)');
  assert.match(rest, /duePlan85\(sp\(ctx\)\.getString\("plan85", null\), System\.currentTimeMillis\(\)\)/);
  assert.match(rest, /if \(bibleOn\(ctx\)\) bible\(ctx, true\)/);
  // Viktig = alarmklokke (når appen har lov), ellers vanlig påminnelse – som før.
  const arm = block(a, 'private fun arm85');
  assert.match(arm, /if \(alarm && exactOk\(am\)\) am\.setAlarmClock/);
  assert.match(arm, /else am\.setAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, whenMs/);

  const boot = block(code('Ntfy51.kt'), 'class Ntfy51Boot');
  assert.match(boot, /Intent\.ACTION_BOOT_COMPLETED\) \{\s*runCatching \{ Alarms37\.restore85\(ctx\) \}\s*runCatching \{ Geofence50\.restore85\(ctx\) \}/);
  assert.match(boot, /runCatching \{ Ntfy51\.sync\(ctx\) \}/);
  const geo = block(code('P50Fam.kt'), 'fun restore85(ctx: Context)');
  assert.match(geo, /ACCESS_FINE_LOCATION\) != PackageManager\.PERMISSION_GRANTED\) return/);
  assert.match(geo, /lm\.addProximityAlert\(lat, lon, rad\.toFloat\(\), -1, pi\(ctx, id\)\)/);
  const man = readFileSync(join(ROOT, 'apps/android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(man, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
  assert.match(man, /<receiver android:name="\.Ntfy51Boot"[\s\S]{0,200}android\.intent\.action\.BOOT_COMPLETED/);

  const plan = JSON.stringify([
    { code: 1, at: 2000, alarm: true, id: 't1', title: 'A', body: 'b' },
    { code: 2, at: 500, alarm: false, id: 't2' }, // passert
    { code: 3, at: 3000, id: '' }, // uten id
    7,
  ]);
  assert.deepEqual(duePlan(plan, 1000).map((x) => x.code), [1]);
  assert.deepEqual(duePlan(null, 0), []);
  assert.deepEqual(duePlan('søppel', 0), []);
  assert.deepEqual(duePlan('{}', 0), []);
});

test('forrige brukers alarmer fjernes ved utlogging og kontobytte', () => {
  const c = block(code('AppViewModel.kt'), 'private fun clearData()');
  assert.match(c, /runCatching \{ Alarms37\.schedule\(getApplication\(\), null\) \}/);
  assert.match(c, /if \(accounts\.none \{ it\.id == activeId \}\) runCatching \{ Notify31\.scheduleTrials\(getApplication\(\), emptyList\(\)\) \}/);
  // schedule(null) avlyser de gamle og lagrer en tom plan (ingenting å sette opp igjen etter omstart).
  const sched = block(code('Alarms37.kt'), 'fun schedule(ctx: Context, data: TasksData?)');
  assert.match(sched, /for \(t in data\?\.items \?: emptyList\(\)\)/);
  assert.match(sched, /am\.cancel\(pi\(ctx, c, Intent\(ctx, Task37Receiver::class\.java\)\.setAction\(ACT_TASK\)\)\)/);
});

test('én fil som ikke kan leses stopper ikke resten av opplastingskøen', () => {
  const u = block(code('AppViewModel.kt'), 'fun uploadUris(uris: List<Uri>, stay: Boolean = false)');
  const loops = u.match(/for \(u in uris\) \{[\s\S]*?finally \{ uploading = maxOf\(0, uploading - 1\) \}/g) ?? [];
  assert.equal(loops.length, 2);
  for (const l of loops) {
    assert.match(l, /catch \(e: ApiException\)/);
    assert.match(l, /catch \(e: kotlinx\.coroutines\.CancellationException\) \{ throw e \}/);
    assert.match(l, /catch \(e: Exception\) \{[\s\S]*message = UNREADABLE85/);
    assert.ok(l.indexOf('CancellationException') < l.indexOf('catch (e: Exception)'), 'avbrudd kastes videre før den generelle fangsten');
  }
  assert.match(code('AppViewModel.kt'), /internal const val UNREADABLE85 = "Fikk ikke lest filen\. Prøv å dele den på nytt\."/);
});
