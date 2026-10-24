package no.kristo.kalender

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.time.Instant
import java.time.OffsetDateTime

/*
 * Prompt 51 (KAL51): Kalender Android – ny enhet godkjennes, krasjrapporter, feature flags, «Nytt i denne versjonen».
 * Server-API: SERVER51-API.md (SEC51 og QA51). Ingen nye avhengigheter (HttpURLConnection, org.json, security-crypto).
 *
 *  1. Enhetsnøkkel: fast, tilfeldig X-Device-Key (43 tegn base64url) i EncryptedSharedPreferences (Android Keystore), sendt på
 *     innlogging, token-kall og godkjenningskall (KalApi.request). 403 {code:'DEVICE_APPROVAL_REQUIRED', approvalId, pollKey,
 *     statusUrl, finishUrl} → KalApiException.approval51 → «Venter på godkjenning» (poll hvert 2,5 s, finish når godkjent).
 *     pollKey og token vises aldri og logges aldri.
 *  2. Innstillinger → SIKKERHET: ventende enheter med Godkjenn (fingeravtrykk/PIN først) og Avvis, og varsel (kanal «Sikkerhet»)
 *     når en ny enhet venter – sjekkes mens appen er åpen (hvert 90. sekund).
 *  3. Krasj: Thread.setDefaultUncaughtExceptionHandler skriver rapporten til en fil (filesDir/crash51), og den sendes som
 *     {reports:[…]} til /api/crash ved neste oppstart. Ingen persondata, tokens eller feltinnhold – bare unntakstype, melding og stakk.
 *  4. Flagg: GET /api/flags med X-Device-Id (fast tilfeldig id), bufret, hentet ved oppstart/forgrunn og hver time. Kal51Flags.on("navn").
 *  5. «Nytt i denne versjonen»: GET /api/whatsnew (show) → kort; «Fint» → POST /api/whatsnew/seen {version}.
 */

object Kal51 {
    @Volatile private var app: Context? = null
    @Volatile private var key: String? = null
    const val CH_SEC = "sikkerhet"

    /** KalApplication.onCreate: kontekst for nøkkelen og krasjfangeren. */
    fun init(a: Application) {
        app = a.applicationContext
        Kal51Crash.install(a)
        if (Build.VERSION.SDK_INT >= 26) runCatching {
            a.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
                NotificationChannel(CH_SEC, "Sikkerhet", NotificationManager.IMPORTANCE_HIGH).apply { description = "Nye enheter som vil logge inn på kontoen din" })
        }
    }

    private fun prefs(ctx: Context): SharedPreferences = runCatching {
        EncryptedSharedPreferences.create(
            "kalender_sec51", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), ctx.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrElse { ctx.applicationContext.getSharedPreferences("kalender_sec51_plain", Context.MODE_PRIVATE) }

    internal fun plain(ctx: Context): SharedPreferences = ctx.applicationContext.getSharedPreferences("kalender_prefs", Context.MODE_PRIVATE)

    fun random(n: Int): String = ByteArray(n).also { SecureRandom().nextBytes(it) }.let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }

    private val KEY_RE = Regex("^[A-Za-z0-9_-]{16,128}$")

    /** Enhetsnøkkelen (lages første gang). null før init (f.eks. i widget-prosessen uten Application). */
    fun deviceKey(): String? {
        key?.let { return it }
        val c = app ?: return null
        synchronized(this) {
            key?.let { return it }
            val p = prefs(c)
            val v = p.getString("devkey51", null)?.takeIf { KEY_RE.matches(it) } ?: random(32).also { p.edit().putString("devkey51", it).apply() }
            key = v
            return v
        }
    }

    /** Installasjons-id for feature flags (ikke en sikkerhetsfaktor). */
    fun deviceId(): String? {
        val c = app ?: return null
        val p = plain(c)
        p.getString("k51_devid", null)?.takeIf { KEY_RE.matches(it) }?.let { return it }
        return ("kal" + random(18)).also { p.edit().putString("k51_devid", it).apply() }
    }

    private val KEY_PATHS = listOf("/finans/api/login", "/finans/api/auth/", "/api/auth/", "/api/security51/")
    private val QA_PATHS = listOf("/api/flags", "/api/crash", "/api/whatsnew")

    /** Ekstra headere per sti (KalApi.request). */
    fun headers(path: String): Map<String, String> {
        if (app == null) return emptyMap()
        val out = HashMap<String, String>()
        if (KEY_PATHS.any { path.startsWith(it) }) deviceKey()?.let { out["X-Device-Key"] = it }
        if (QA_PATHS.any { path.startsWith(it) }) {
            deviceId()?.let { out["X-Device-Id"] = it }
            out["X-Client-Platform"] = "android"
            // Bare ASCII i headere (HttpURLConnection/OkHttp avviser f.eks. «·»).
            out["X-Device-Name"] = "Kalender (Android ${KalApi.device})".filter { it in ' '..'~' }.take(60)
        }
        return out
    }

    fun parseTime(s: String?): Long = if (s.isNullOrBlank()) 0L else runCatching { Instant.parse(s).toEpochMilli() }.getOrElse {
        runCatching { OffsetDateTime.parse(s).toInstant().toEpochMilli() }.getOrDefault(0L)
    }

    fun hm(ms: Long): String = Instant.ofEpochMilli(ms).atZone(OSLO).let { "%02d:%02d".format(it.hour, it.minute) }

    fun release(ctx: Context): String {
        val v = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "1.0"
        return "kalender-android@$v"
    }
}

/* ---------------- Godkjenning av ny enhet (innloggingen) ---------------- */

/** Svaret 403 DEVICE_APPROVAL_REQUIRED. pollKey vises aldri. */
data class Kal51Approval(
    val id: String, val pollKey: String, val statusUrl: String, val finishUrl: String,
    val expires: Long, val device: String, val base: String,
) {
    override fun toString(): String = "Kal51Approval($id)"

    companion object {
        private const val PRE = "/api/security51/approvals/"

        /** null når svaret ikke er en godkjenningsforespørsel (nøkkelen sendes bare til security51-stiene). */
        fun parse(o: JSONObject?, base: String): Kal51Approval? {
            o ?: return null
            if (o.optString("code") != "DEVICE_APPROVAL_REQUIRED") return null
            val id = o.optString("approvalId")
            val key = o.optString("pollKey")
            val st = o.optString("statusUrl").ifBlank { "$PRE$id/status" }
            val fin = o.optString("finishUrl").ifBlank { "$PRE$id/finish" }
            if (id.isBlank() || key.isBlank() || !st.startsWith(PRE) || !fin.startsWith(PRE)) return null
            val exp = Kal51.parseTime(o.optString("expiresAt")).takeIf { it > 0 } ?: (System.currentTimeMillis() + 900_000)
            return Kal51Approval(id, key, st, fin, exp, o.optString("device"), base.trimEnd('/'))
        }
    }
}

sealed class Kal51Outcome {
    data class Done(val s: KalSession) : Kal51Outcome()
    object Denied : Kal51Outcome()
    object Expired : Kal51Outcome()
    object Cancelled : Kal51Outcome()
    data class Failed(val msg: String) : Kal51Outcome()
}

object Kal51Approve {
    /** Ett kall mot godkjenningsendepunktene (uten Authorization). → (HTTP-kode, JSON). 0 = fikk ikke kontakt. */
    private suspend fun call(method: String, ap: Kal51Approval, path: String): Pair<Int, JSONObject> = withContext(Dispatchers.IO) {
        runCatching {
            val conn = URL(ap.base + path).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = method
                conn.connectTimeout = 10_000
                conn.readTimeout = 15_000
                conn.useCaches = false
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("X-Client", "kalender-android")
                conn.setRequestProperty("X-Approval-Key", ap.pollKey)
                Kal51.deviceKey()?.let { conn.setRequestProperty("X-Device-Key", it) }
                if (method == "POST") {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    conn.outputStream.use { it.write("{}".toByteArray()) }
                }
                val code = conn.responseCode
                val body = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                code to (runCatching { JSONObject(body) }.getOrNull() ?: JSONObject())
            } finally { conn.disconnect() }
        }.getOrElse { 0 to JSONObject() }
    }

    /** pending | approved | denied | expired | offline */
    suspend fun status(ap: Kal51Approval): String {
        val (code, o) = call("GET", ap, ap.statusUrl)
        if (code == 0 || code >= 500) return "offline"
        if (code == 404) return "expired"
        if (code !in 200..299) return o.optString("state").ifBlank { "offline" }
        return o.optString("state").ifBlank { "pending" }
    }

    /** Venter på godkjenningen (poll hvert 2,5 s) og fullfører. Avbrytes når cancelled() svarer true. */
    suspend fun run(ap: Kal51Approval, cancelled: () -> Boolean): Kal51Outcome {
        while (true) {
            if (cancelled()) return Kal51Outcome.Cancelled
            if (System.currentTimeMillis() > ap.expires + 30_000) return Kal51Outcome.Expired
            val st = status(ap)
            if (cancelled()) return Kal51Outcome.Cancelled
            when (st) {
                "denied" -> return Kal51Outcome.Denied
                "expired" -> return Kal51Outcome.Expired
                "approved" -> {
                    val (code, o) = call("POST", ap, ap.finishUrl)
                    if (cancelled()) return Kal51Outcome.Cancelled
                    if (code in 200..299) {
                        val token = o.optString("token").takeIf { it.isNotBlank() } ?: return Kal51Outcome.Failed("Uventet svar fra serveren.")
                        val u = o.optJSONObject("user")
                        val uname = u?.optString("username").orEmpty()
                        val name = u?.optString("name")?.takeIf { it.isNotBlank() } ?: uname
                        return Kal51Outcome.Done(KalSession(ap.base, token, uname, name, "login"))
                    }
                    if (code == 403) return Kal51Outcome.Denied
                    if (code == 410 || code == 404) return Kal51Outcome.Expired
                    if (code == 409 && o.optString("state") == "done") return Kal51Outcome.Failed("Innloggingen er allerede fullført. Logg inn på nytt.")
                }
            }
            delay(2_500)
        }
    }

    fun message(r: Kal51Outcome): String = when (r) {
        is Kal51Outcome.Denied -> "Innloggingen ble avvist fra en annen enhet. Var det deg, kan du prøve igjen."
        is Kal51Outcome.Expired -> "Godkjenningen er utløpt (15 min). Logg inn på nytt."
        is Kal51Outcome.Failed -> r.msg
        else -> ""
    }
}

/* ---------------- Feature flags ---------------- */

object Kal51Flags {
    @Volatile private var cache: Map<String, Boolean>? = null

    /** Av når flagget er ukjent eller ikke er hentet ennå. */
    fun on(ctx: Context, name: String): Boolean = load(ctx)[name] ?: false

    private fun load(ctx: Context): Map<String, Boolean> {
        cache?.let { return it }
        val raw = Kal51.plain(ctx).getString("k51_flags", "") ?: ""
        val m = runCatching { JSONObject(raw).let { o -> o.keys().asSequence().associateWith { o.optBoolean(it, false) } } }.getOrDefault(emptyMap())
        cache = m
        return m
    }

    fun fetchedAt(ctx: Context): Long = Kal51.plain(ctx).getLong("k51_flags_at", 0L)

    suspend fun refresh(ctx: Context, s: KalSession) {
        val body = runCatching { s.api.get("/api/flags", timeout = 10_000) }.getOrNull() ?: return
        val f = runCatching { JSONObject(body).optJSONObject("flags") }.getOrNull() ?: return
        val out = JSONObject()
        val m = HashMap<String, Boolean>()
        for (k in f.keys()) { val v = f.optBoolean(k, false); out.put(k, v); m[k] = v }
        Kal51.plain(ctx).edit().putString("k51_flags", out.toString()).putLong("k51_flags_at", System.currentTimeMillis()).apply()
        cache = m
    }
}

/* ---------------- Krasjrapporter ---------------- */

object Kal51Crash {
    private var installed = false

    private fun dir(ctx: Context): File = File(ctx.filesDir, "crash51").also { it.mkdirs() }

    /** Fanger ukontrollerte unntak (alle tråder), skriver rapporten til fil og lar systemet avslutte som før. */
    fun install(a: Application) {
        if (installed) return
        installed = true
        val ctx = a.applicationContext
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching { record(ctx, t, e) }
            if (prev != null) prev.uncaughtException(t, e) else { android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10) }
        }
    }

    /** Unntakstype + melding (kortet ned) + stakken. Aldri feltinnhold eller data fra skjermen. */
    private fun record(ctx: Context, t: Thread, e: Throwable) {
        val root = generateSequence(e) { it.cause?.takeIf { c -> c !== it } }.take(5).last()
        val msg = (e.javaClass.name + (e.message?.takeIf { it.isNotBlank() }?.let { ": " + it.take(300) } ?: "")).take(500)
        val stack = android.util.Log.getStackTraceString(e).take(8000)
        val r = report(ctx, msg, stack, "exception")
        r.optJSONObject("tags")?.put("thread", if (t.name == "main") "main" else "background")
        if (root !== e) r.optJSONObject("extra")?.put("cause", root.javaClass.name)
        File(dir(ctx), "exc-${System.currentTimeMillis()}.json").writeText(r.toString())
    }

    fun report(ctx: Context, message: String, stack: String?, kind: String): JSONObject = JSONObject()
        .put("platform", "android")
        .put("message", message.take(500))
        .put("level", "fatal")
        .put("release", Kal51.release(ctx))
        .put("osVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        .put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(60))
        .put("tags", JSONObject().put("app", "kalender").put("kind", kind))
        .put("extra", JSONObject().put("at", Instant.now().toString()))
        .apply { if (!stack.isNullOrBlank()) put("stack", stack) }

    /** Sender rapportene fra forrige økt (maks 10 per kall). Beholdes ved feil (ingen nett, 429). */
    suspend fun flush(ctx: Context, s: KalSession) = withContext(Dispatchers.IO) {
        val files = dir(ctx).listFiles { f -> f.name.startsWith("exc-") && f.name.endsWith(".json") }?.sortedBy { it.name }?.takeLast(20) ?: return@withContext
        // Eldre enn de siste 20 kastes.
        dir(ctx).listFiles { f -> f.name.startsWith("exc-") }?.filter { f -> files.none { it.name == f.name } }?.forEach { it.delete() }
        for (batch in files.chunked(10)) {
            val arr = JSONArray()
            val ok = batch.mapNotNull { f -> runCatching { JSONObject(f.readText()) }.getOrNull()?.let { arr.put(it); f } }
            batch.filter { it !in ok }.forEach { it.delete() }
            if (arr.length() == 0) continue
            try {
                s.api.post("/api/crash", JSONObject().put("reports", arr), read = 15_000)
                ok.forEach { it.delete() }
            } catch (e: KalApiException) {
                // 400/413 blir aldri godtatt – kast. Andre feil: prøv igjen neste gang.
                if (e.status == 400 || e.status == 413) ok.forEach { it.delete() } else return@withContext
            }
        }
    }
}

/* ---------------- Ventende enheter, «Nytt i denne versjonen» og oppfriskning (eies av KalVm) ---------------- */

data class Kal51Pending(val id: String, val device: String, val place: String, val method: String, val created: Long, val userName: String)

data class Kal51News(val version: String, val title: String, val date: String, val items: List<String>)

class K51State(private val vm: KalVm) {
    private val ctx: Application get() = vm.getApplication()

    var pending by mutableStateOf<List<Kal51Pending>>(emptyList())
    var busyId by mutableStateOf("")
    var msg by mutableStateOf("")
    var news by mutableStateOf<Kal51News?>(null)

    private var last = 0L
    private var loop: Job? = null

    /** Oppstart / forgrunn / etter innlogging. Maks én henting per 60 s; løkken (hvert 90. s) går mens appen er i forgrunnen. */
    fun active() {
        if (vm.session == null) return
        if (loop?.isActive != true) loop = vm.viewModelScope41 {
            while (isActive) {
                delay(90_000)
                val s = vm.session ?: continue
                loadPendingNow(s)
                if (System.currentTimeMillis() - Kal51Flags.fetchedAt(ctx) > 3_600_000) Kal51Flags.refresh(ctx, s)
            }
        }
        if (System.currentTimeMillis() - last < 60_000) return
        last = System.currentTimeMillis()
        vm.viewModelScope41 {
            val s = vm.session ?: return@viewModelScope41
            runCatching { Kal51Crash.flush(ctx, s) }
            Kal51Flags.refresh(ctx, s)
            loadPendingNow(s)
            loadNews(s, false)
        }
    }

    fun inactive() { loop?.cancel(); loop = null }

    fun didLogin() { last = 0L; active() }

    fun loadPending() { val s = vm.session ?: return; vm.viewModelScope41 { loadPendingNow(s) } }

    private suspend fun loadPendingNow(s: KalSession) {
        val body = try { s.api.get("/api/security51/approvals", timeout = 12_000) } catch (e: CancellationException) { throw e } catch (e: Exception) { return }
        val arr = runCatching { JSONObject(body).optJSONArray("approvals") }.getOrNull() ?: JSONArray()
        val now = System.currentTimeMillis()
        val out = ArrayList<Kal51Pending>()
        for (i in 0 until arr.length()) {
            val a = arr.optJSONObject(i) ?: continue
            if (a.optString("state") != "pending") continue
            val exp = Kal51.parseTime(a.optString("expiresAt"))
            if (exp in 1 until now) continue
            val place = listOf(a.optString("countryName").ifBlank { a.optString("country") }, a.optString("ip")).filter { it.isNotBlank() && it != "null" }.joinToString(" · ")
            out.add(Kal51Pending(a.optString("id"), a.optString("device").ifBlank { "Ukjent enhet" }, place, a.optString("methodLabel"),
                Kal51.parseTime(a.optString("createdAt")), a.optString("userName")))
        }
        if (out != pending) pending = out
        notifyNew(out)
    }

    /** Varsel én gang per ventende enhet (kanal «Sikkerhet», åpner Innstillinger). */
    private fun notifyNew(list: List<Kal51Pending>) {
        if (list.isEmpty() || !KalNotify.canPost(ctx)) return
        val p = Kal51.plain(ctx)
        val seen = (p.getString("k51_notified", "") ?: "").split('\n').filter { it.isNotBlank() }.toMutableList()
        var changed = false
        for (x in list) {
            if (x.id in seen) continue
            seen.add(x.id); changed = true
            val text = x.device + (if (x.place.isNotBlank()) " · " + x.place else "") + ". Godkjenn eller avvis i Kalender → Innstillinger → Sikkerhet."
            val id = x.id.hashCode() and 0x7fffffff
            val n = NotificationCompat.Builder(ctx, Kal51.CH_SEC).setSmallIcon(R.drawable.ic_kal_notif).setColor(0xFFB23A2A.toInt())
                .setContentTitle("Ny enhet vil logge inn").setContentText(text).setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true).setContentIntent(KalNotify.openIntent(ctx, "kalender://sikkerhet", id)).build()
            runCatching { NotificationManagerCompat.from(ctx).notify("sec51", id, n) }
        }
        if (changed) p.edit().putString("k51_notified", seen.takeLast(50).joinToString("\n")).apply()
    }

    /** Godkjenn (etter fingeravtrykk/PIN i UI-et) eller avvis. */
    fun decide(x: Kal51Pending, approve: Boolean) {
        val s = vm.session ?: return
        if (busyId.isNotEmpty()) return
        busyId = x.id; msg = ""
        vm.viewModelScope41 {
            msg = try {
                s.api.post("/api/security51/approvals/" + android.net.Uri.encode(x.id), JSONObject().put("approve", approve), read = 15_000)
                if (approve) "✓ ${x.device} er godkjent." else "${x.device} ble avvist."
            } catch (e: KalApiException) {
                when (e.status) { 409 -> "Allerede behandlet."; 410 -> "Forespørselen er utløpt."; else -> e.message ?: "Feil" }
            }
            busyId = ""
            pending = pending.filter { it.id != x.id }
            loadPendingNow(s)
        }
    }

    /* ---------- «Nytt i denne versjonen» ---------- */

    fun openNews() { val s = vm.session ?: return; vm.viewModelScope41 { loadNews(s, true) } }

    private suspend fun loadNews(s: KalSession, force: Boolean) {
        val body = try { s.api.get("/api/whatsnew", timeout = 12_000) } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (force) msg = "Fant ikke nyhetene for denne versjonen."
            return
        }
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return
        val version = o.optString("version")
        val arr = o.optJSONArray("items") ?: JSONArray()
        val items = (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { t -> t.isNotBlank() } }.take(12)
        if (version.isBlank() || items.isEmpty()) return
        val seenHere = Kal51.plain(ctx).getString("k51_wn_seen", "") ?: ""
        if (!force && (!o.optBoolean("show", false) || seenHere == version)) return
        news = Kal51News(version, o.optString("title"), o.optString("date"), items)
    }

    fun dismissNews() {
        val n = news ?: return
        news = null
        Kal51.plain(ctx).edit().putString("k51_wn_seen", n.version).apply()
        val s = vm.session ?: return
        vm.viewModelScope41 { runCatching { s.api.post("/api/whatsnew/seen", JSONObject().put("version", n.version)) } }
    }
}
