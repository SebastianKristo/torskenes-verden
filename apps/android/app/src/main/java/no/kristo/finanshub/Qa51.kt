package no.kristo.finanshub

import android.content.Context
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/*
 * Prompt 51 (APPAND51), punkt 2–4 (QA51, $S/SERVER51-API.md):
 *  - Krasjrapporter: Thread.setDefaultUncaughtExceptionHandler skriver én JSON-fil per krasj i filesDir/crash51 (ingen nettverk i
 *    håndtereren), og den forrige håndtereren kalles etterpå (systemets «appen stoppet»). Ved neste oppstart sendes køen som
 *    {reports:[…]} til POST /api/crash (maks 10 per kall, under 64 KB). Bare unntaksklasse, vasket melding og stack – aldri token,
 *    feltinnhold, beløp eller e-post (sitater, tall og e-post fjernes fra meldingene før de lagres).
 *  - Feature flags: GET /api/flags med X-Device-Id (DeviceIds51, Sec51Http) ved oppstart, når appen kommer i forgrunnen og hver time.
 *    Bufret per konto i prefs, så Flags51.on("navn") virker uten nett. Ukjent flagg = av.
 *  - «Nytt i denne versjonen»: GET /api/whatsnew → kort når show = true (ui/Sec51Ui.kt), «Fint» → POST /api/whatsnew/seen {version}.
 */

/* ---------------- Krasjrapporter ---------------- */

object Crash51 {
    private const val DIR = "crash51"
    private const val MAX_FILES = 20
    @Volatile private var installed = false

    private fun dir(ctx: Context) = File(ctx.applicationContext.filesDir, DIR)

    /** Kalles tidlig (MainActivity.onCreate, Ntfy51Service.onCreate). Trygt å kalle flere ganger. */
    fun install(ctx: Context) {
        if (installed) return
        installed = true
        val app = ctx.applicationContext
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try { write(app, e, t.name, "fatal") } catch (_: Throwable) {}
            if (prev != null) prev.uncaughtException(t, e) else { android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10) }
        }
    }

    /** Vasker en melding: sitater, e-post, lange tall, token-lignende strenger og adresser med spørring fjernes. */
    internal fun scrub(s: String?): String {
        if (s.isNullOrEmpty()) return ""
        var t = s
        t = Regex("\"[^\"]*\"|'[^']*'|«[^»]*»").replace(t, "\"…\"")
        t = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}").replace(t, "[e-post]")
        t = Regex("(?i)\\b(fh_[a-z_]*|hlr_|hdt_|bearer\\s+)[A-Za-z0-9._~+/=-]+").replace(t, "[fjernet]")
        t = Regex("\\b[A-Za-z0-9_-]{32,}\\b").replace(t, "[fjernet]")
        t = Regex("(https?://[^\\s?#]+)[?#][^\\s]*").replace(t) { it.groupValues[1] }
        t = Regex("\\d[\\d .,:-]{3,}\\d").replace(t, "#")
        return t.take(500)
    }

    private fun stackOf(e: Throwable): String {
        val sb = StringBuilder()
        var cur: Throwable? = e
        var depth = 0
        while (cur != null && depth < 4) {
            if (depth > 0) sb.append("Caused by: ")
            sb.append(cur.javaClass.name).append(": ").append(scrub(cur.message)).append('\n')
            cur.stackTrace.take(if (depth == 0) 40 else 15).forEach { f -> sb.append("    at ").append(f.className).append('.').append(f.methodName).append('(').append(f.fileName ?: "?").append(':').append(f.lineNumber).append(")\n") }
            cur = cur.cause?.takeIf { it !== cur }
            depth++
        }
        return sb.toString().take(6_000)
    }

    private fun version(ctx: Context): Pair<String, Long> = runCatching {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        (pi.versionName ?: "") to (if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong())
    }.getOrDefault("" to 0L)

    /** Synkront til fil (prosessen er på vei ned). */
    fun write(ctx: Context, e: Throwable, thread: String, level: String) {
        val d = dir(ctx)
        d.mkdirs()
        val (vn, vc) = version(ctx)
        val o = JSONObject()
            .put("platform", "android").put("level", level)
            .put("message", (e.javaClass.simpleName.ifBlank { e.javaClass.name } + ": " + scrub(e.message)).take(500))
            .put("stack", stackOf(e))
            .put("release", "finanshub-android@" + vn.ifBlank { "?" })
            .put("osVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            .put("model", ascii51("${Build.MANUFACTURER} ${Build.MODEL}").take(60))
            .put("tags", JSONObject().put("thread", if (thread == "main") "main" else "bakgrunn").put("versionCode", vc.toString()))
            .put("extra", JSONObject().put("at", System.currentTimeMillis()))
        File(d, "c${System.currentTimeMillis()}.json").writeText(o.toString())
        d.listFiles()?.sortedBy { it.name }?.dropLast(MAX_FILES)?.forEach { runCatching { it.delete() } }
    }

    fun pendingCount(ctx: Context): Int = dir(ctx).listFiles()?.count { it.name.endsWith(".json") } ?: 0

    /** Sender køen. Kaster ikke. Beholdes ved nettverksfeil/429, slettes når serveren har tatt imot (eller avviser formatet). */
    suspend fun flush(ctx: Context, base: String, token: String?) = withContext(Dispatchers.IO) {
        if (base.isBlank()) return@withContext
        val files = dir(ctx).listFiles()?.filter { it.name.endsWith(".json") }?.sortedBy { it.name } ?: return@withContext
        if (files.isEmpty()) return@withContext
        var i = 0
        while (i < files.size) {
            val batch = ArrayList<File>()
            val arr = JSONArray()
            var size = 20
            while (i < files.size && batch.size < 10) {
                val f = files[i]
                val o = runCatching { JSONObject(f.readText()) }.getOrNull()
                if (o == null) { runCatching { f.delete() }; i++; continue }
                val len = o.toString().length + 1
                if (batch.isNotEmpty() && size + len > 60_000) break
                arr.put(o); batch += f; size += len; i++
            }
            if (batch.isEmpty()) continue
            val body = JSONObject().put("reports", arr)
            val ok = try {
                try { Api(base, token).hlPost("/crash", body) } catch (e: ApiException) {
                    // Utløpt/avvist token: krasjrapporter tas imot uten innlogging også.
                    if (token != null && (e.status == 401 || e.status == 403)) Api(base, null).hlPost("/crash", body) else throw e
                }
                true
            } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                // 400/413: rapportene er ugyldige eller for store – ikke prøv igjen. 429/5xx/nett: behold.
                if (e.status == 400 || e.status == 413) true else return@withContext
            } catch (_: Exception) { return@withContext }
            if (ok) batch.forEach { runCatching { it.delete() } }
        }
    }
}

/* ---------------- Feature flags ---------------- */

object Flags51 {
    private const val PREFS = "flags51"
    @Volatile private var map: Map<String, Boolean> = emptyMap()
    @Volatile private var account: String? = null
    /** Økes når flaggene endres (for Compose). */
    var tick by mutableStateOf(0)
        private set

    /** Er flagget på for denne brukeren/enheten? Ukjent = av. */
    fun on(name: String): Boolean = map[name] == true

    /** Leser bufferen for kontoen (ved oppstart og kontobytte). */
    fun load(ctx: Context, accountId: String?) {
        account = accountId
        val raw = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("f_" + (accountId ?: "-"), null)
        map = parse(raw?.let { runCatching { JSONObject(it) }.getOrNull() })
        tick++
    }

    private fun parse(o: JSONObject?): Map<String, Boolean> {
        if (o == null) return emptyMap()
        val m = HashMap<String, Boolean>()
        o.keys().forEach { k -> m[k] = o.optBoolean(k, false) }
        return m
    }

    fun lastFetch(ctx: Context, accountId: String?): Long = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("t_" + (accountId ?: "-"), 0L)

    /** GET /api/flags. 404 (eldre server) = ingen flagg. Kaster ikke. */
    suspend fun refresh(ctx: Context, api: Api, accountId: String?) {
        val o = try { JSONObject(api.hlGet("/flags", timeout = 8_000)) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) JSONObject().put("flags", JSONObject()) else return
        } catch (_: Exception) { return }
        val f = o.optJSONObject("flags") ?: JSONObject()
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("f_" + (accountId ?: "-"), f.toString()).putLong("t_" + (accountId ?: "-"), System.currentTimeMillis()).apply()
        if (account == accountId) { map = parse(f); tick++ }
    }
}

/* ---------------- «Nytt i denne versjonen» ---------------- */

data class WhatsNew51(
    val version: String, val date: String, val title: String, val items: List<String>,
    /** Prompt 52 (AND52A): ett punkt per blokk – overskrift + kort tekst (claude-code-nytt-i-versjon-lesbar.md). */
    val points52: List<Pair<String, String>> = emptyList(),
)

class Qa51State {
    var whatsNew by mutableStateOf<WhatsNew51?>(null)
    /** Versjoner som er lukket i denne økta (også om POST /seen feilet). */
    internal val closed = HashSet<String>()
    internal var hourly: kotlinx.coroutines.Job? = null
    internal var startedFor: String? = null
}

fun AppViewModel.loadWhatsNew51() = launch51 {
    val o = try { JSONObject(api51 { hlGet("/whatsnew") }) } catch (e: ApiException) { return@launch51 }
    if (!o.optBoolean("show")) return@launch51
    val v = o.optString("version")
    if (v.isBlank() || v in qa51.closed) return@launch51
    val a = o.optJSONArray("items")
    val items = ArrayList<String>()
    if (a != null) for (i in 0 until a.length()) { if (a.optJSONObject(i) == null) a.optString(i).trim().takeIf { it.isNotEmpty() }?.let { items += it.take(400) } }
    val points = whatsPoints52(o) // prompt 52: strukturerte punkter (eller utledet fra items)
    if (items.isEmpty() && points.isEmpty()) return@launch51
    qa51.whatsNew = WhatsNew51(v, o.optString("date_label").ifBlank { o.optString("date") }, cleanTitle52(o.optString("title")).ifBlank { "Versjon $v" }, items.take(12), points.take(12))
}

fun AppViewModel.closeWhatsNew51() {
    val w = qa51.whatsNew ?: return
    qa51.whatsNew = null
    qa51.closed += w.version
    launch51 { runCatching { api51 { hlPost("/whatsnew/seen", JSONObject().put("version", w.version)) } } }
}

/* ---------------- Felles oppstart for prompt 51 ---------------- */

/** Fra AppViewModel.init: nøkler, flagg fra buffer, krasjkø, ntfy-tjenesten. */
fun AppViewModel.start51() {
    val ctx = appCtx51
    runCatching { DeviceIds51.init(ctx) }
    runCatching { Flags51.load(ctx, activeId) }
    runCatching {
        // Kontoen som eide ntfy-emnet er logget ut: slå av.
        if (Ntfy51.on(ctx) && accounts.none { it.id == Ntfy51.account(ctx) }) Ntfy51.save(ctx, false, null, null, null)
        Ntfy51.sync(ctx)
    }
    // Krasjer fra forrige gang (også før innlogging – uten token).
    launch51 {
        kotlinx.coroutines.delay(4_000L)
        val b = base.ifBlank { server }
        runCatching { Crash51.flush(ctx, b, account?.token) }
    }
}

/** Kontoen er klar (FinansApp, ved hver kontobytte) og når appen kommer i forgrunnen: flagg, «Nytt», ventende enheter. */
fun AppViewModel.refresh51(force: Boolean = false) {
    if (!loggedIn) return
    val ctx = appCtx51
    val acc = activeId
    if (qa51.startedFor != acc) { qa51.startedFor = acc; runCatching { Flags51.load(ctx, acc) } }
    launch51 {
        if (force || System.currentTimeMillis() - Flags51.lastFetch(ctx, acc) > 5 * 60_000L) Flags51.refresh(ctx, api51 { this }, acc)
    }
    loadWhatsNew51()
    loadApprovals51()
    // Timesoppdatering av flaggene mens appen lever.
    qa51.hourly?.cancel()
    qa51.hourly = launchJob51 {
        while (true) {
            kotlinx.coroutines.delay(60 * 60_000L)
            if (!loggedIn || activeId != acc) return@launchJob51
            Flags51.refresh(ctx, api51 { this }, acc)
        }
    }
}
