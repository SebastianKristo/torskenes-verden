package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/*
 * Prompt 51 (ANDFEAT51): appklienten for fase 2 og 4 og appfunksjonene i fase 5 – felles kjerne.
 *  - Sider i fullskjerm over Papir-skallet (ui/Feat51Ui.kt → Pages51): «plan» (Planlegging: sparemål, kalender med saldoprognose,
 *    skatt, priser, abonnementsjeger – ui/Plan51Ui.kt), «famcal» (familiekalender med «hvem kjører?» – ui/FamCal51Ui.kt),
 *    «kveld», «lyd», «subs», «lagring» (Media – ui/Media51Ui.kt), «sok» (felles søk – ui/Search51Ui.kt) og «tema» (ui/Theme51Ui.kt).
 *  - Data hentes som rå JSON fra API-ene i $S/SERVER51-API.md (FIN51, MEDFAM51, WEBX51) og leses i grensesnittet med s43/i43/d43,
 *    samme felt som web (public/finans/js/plan51.js, public/js/medfam51.js). Alt følger kontoen (nullstilles ved kontobytte).
 *  - Dyplenker: finanshub://plan[/spar|kal|skatt|pris|jakt], finanshub://famcal[/<taskId>], finanshub://kveld, finanshub://sok.
 */

/** Hvor en nøkkel hentes fra: prefiks (FINANS eller HOMELAB) og stien (kan avhenge av valg på siden). */
class Src51(val prefix: String, val path: () -> String)

object F51 {
    /** Åpne sider (stabel): siste er synlig. Tom = ingen side. */
    val pages = mutableStateListOf<String>()
    val page: String? get() = pages.lastOrNull()
    val data = mutableStateMapOf<String, JSONObject>()
    val busy = mutableStateMapOf<String, Boolean>()
    val err = mutableStateMapOf<String, String>()
    /** Valg på sidene (fane, periode, konto, søk …) – tekst, så alt ligger i ett kart. */
    val ui = mutableStateMapOf<String, String>()
    /** Handling som pågår (knappen viser «…»). */
    var acting by mutableStateOf<String?>(null)
    /** Kort melding nederst på siden (egen, så den ligger over sidene og ikke under dem). */
    var toast by mutableStateOf<String?>(null)
    internal var accountKey: String? = null

    fun opt(k: String, def: String): String = ui[k] ?: def

    val src: Map<String, Src51> = mapOf(
        "goals" to Src51(Api.FINANS) { "/fin51/goals" },
        "cal" to Src51(Api.FINANS) { "/fin51/calendar?days=" + opt("cal.days", "30") },
        "tax" to Src51(Api.FINANS) { "/fin51/tax" + (ui["tax.year"]?.let { "?year=$it" } ?: "") },
        "prices" to Src51(Api.FINANS) { "/fin51/prices?sort=" + opt("pris.sort", "change") + (ui["pris.q"]?.takeIf { it.isNotBlank() }?.let { "&q=" + enc51(it) } ?: "") },
        "priceItem" to Src51(Api.FINANS) { "/fin51/prices/item?key=" + enc51(opt("pris.open", "")) },
        "hunter" to Src51(Api.FINANS) { "/fin51/hunter?weeks=" + opt("jakt.weeks", "6") },
        "famEvents" to Src51(Api.HOMELAB) { "/famcal51/events?from=" + java.time.LocalDate.now() + "&to=" + java.time.LocalDate.now().plusDays(28) },
        "famDrives" to Src51(Api.HOMELAB) { "/famcal51/drives" },
        "famSettings" to Src51(Api.HOMELAB) { "/famcal51/settings" },
        "mStatus" to Src51(Api.HOMELAB) { "/media51/status" },
        "tonight" to Src51(Api.HOMELAB) {
            "/media51/tonight?minutes=" + opt("kv.min", "120") + "&kind=" + opt("kv.kind", "any") + "&limit=8&phrase=1" +
                (ui["kv.genre"]?.takeIf { it.isNotBlank() }?.let { "&genre=" + enc51(it) } ?: "") +
                (ui["kv.who"]?.takeIf { it.isNotBlank() }?.let { "&who=" + enc51(it) } ?: "")
        },
        "audio" to Src51(Api.HOMELAB) { "/media51/audio/continue?limit=12" },
        "subsWanted" to Src51(Api.HOMELAB) { "/media51/subs/wanted" },
        "subsStatus" to Src51(Api.HOMELAB) { "/media51/subs/status" },
        "storage" to Src51(Api.HOMELAB) { "/media51/storage" },
    )

    fun reset() {
        data.clear(); busy.clear(); err.clear(); ui.clear(); pages.clear(); acting = null; toast = null
    }
}

internal fun enc51(s: String): String = URLEncoder.encode(s, "UTF-8")

/* ---------------- JSON-hjelpere ---------------- */

internal fun JSONObject?.arr51(k: String): List<JSONObject> = this?.optJSONArray(k).objs51()
internal fun JSONArray?.objs51(): List<JSONObject> = (0 until (this?.length() ?: 0)).mapNotNull { this!!.optJSONObject(it) }
internal fun JSONArray?.strs51(): List<String> = (0 until (this?.length() ?: 0)).mapNotNull { i -> this!!.opt(i)?.let { v -> (v as? String) ?: (v as? Number)?.toString() } }
internal fun JSONObject.num51(k: String, def: Double = 0.0): Double = d43(k) ?: def
internal fun JSONObject.str51(k: String, def: String = ""): String = s43(k) ?: def
internal fun JSONObject.obj51(k: String): JSONObject? = if (has(k) && !isNull(k)) optJSONObject(k) else null

/* ---------------- Sider ---------------- */

/** Åpner en side (legges øverst i stabelen; samme side to ganger blir ikke to lag). */
fun AppViewModel.open51(page: String) {
    sync51()
    menuOpen = false
    if (F51.page != page) { F51.pages.remove(page); F51.pages.add(page) }
    Haptics.tap()
}

/** Tilbake: lukker øverste side. */
fun close51() { if (F51.pages.isNotEmpty()) F51.pages.removeAt(F51.pages.lastIndex) }

/** Nullstiller alt når kontoen byttes (data er per bruker). */
fun AppViewModel.sync51() {
    val k = (account?.id ?: "") + "|" + base
    if (F51.accountKey != k) { F51.reset(); F51.accountKey = k }
}

/** Henter en nøkkel fra F51.src. Uten force brukes det som allerede er hentet. */
fun AppViewModel.load51(key: String, force: Boolean = false) {
    sync51()
    val s = F51.src[key] ?: return
    if (F51.busy[key] == true || (!force && F51.data[key] != null)) return
    F51.busy[key] = true
    F51.err.remove(key)
    launch51 {
        try {
            val o = JSONObject(api51 { request("GET", s.path(), prefix = s.prefix) })
            F51.data[key] = o
        } catch (e: ApiException) {
            F51.err[key] = e.message ?: "Kunne ikke hente"
        } catch (e: Exception) {
            F51.err[key] = e.message ?: "Kunne ikke hente"
        } finally { F51.busy[key] = false }
    }
}

/**
 * Endring mot API-et: metode, prefiks, sti og JSON. Etterpå hentes [reload] på nytt, [ok] vises som melding og [then] får svaret.
 * Feil vises som melding på siden (serverens `error`).
 */
fun AppViewModel.act51(
    id: String, method: String, prefix: String, path: String, json: JSONObject? = null, ok: String? = null,
    reload: List<String> = emptyList(), then: (JSONObject) -> Unit = {},
) {
    if (F51.acting != null) return
    F51.acting = id
    launch51 {
        try {
            val raw = api51 { request(method, path, json, prefix = prefix) }
            val o = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
            then(o)
            ok?.let { F51.toast = it; Haptics.success() }
            reload.forEach { load51(it, force = true) }
        } catch (e: ApiException) {
            F51.toast = e.message ?: "Noe gikk galt"; Haptics.error()
        } catch (e: Exception) {
            F51.toast = e.message ?: "Noe gikk galt"; Haptics.error()
        } finally { F51.acting = null }
    }
}

/** Rå bytes ut (bilde til sparemål): PUT med Content-Type, samme token som resten. */
internal suspend fun AppViewModel.putBytes51(path: String, bytes: ByteArray, type: String): String = withContext(Dispatchers.IO) {
    val conn = URL(base.trimEnd('/') + Api.FINANS + path).openConnection() as HttpURLConnection
    try {
        conn.requestMethod = "PUT"
        conn.connectTimeout = 10_000
        conn.readTimeout = 60_000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", type)
        conn.setRequestProperty("Accept", "application/json")
        account?.token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        conn.outputStream.use { it.write(bytes) }
        val code = conn.responseCode
        val body = (if (code >= 400) conn.errorStream else conn.inputStream)?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
        if (code >= 400) throw ApiException(runCatching { JSONObject(body).optString("error") }.getOrNull()?.ifBlank { null } ?: "Feil $code", code)
        body
    } finally { conn.disconnect() }
}

/** Last opp bilde til et sparemål (fra fotovelgeren). Maks 4 MB (serverens grense). */
fun AppViewModel.goalImage51(goalId: String, uri: Uri) {
    if (F51.acting != null) return
    F51.acting = "img$goalId"
    launch51 {
        try {
            val cr = appCtx51.contentResolver
            val type = cr.getType(uri)?.takeIf { it in setOf("image/jpeg", "image/png", "image/webp") } ?: "image/jpeg"
            val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: throw ApiException("Fant ikke bildet")
            if (bytes.size > 4 * 1024 * 1024) throw ApiException("Bildet er større enn 4 MB")
            putBytes51("/fin51/goals/$goalId/image", bytes, type)
            F51.toast = "Bildet er lagret"
            load51("goals", force = true)
        } catch (e: Exception) {
            F51.toast = e.message ?: "Kunne ikke laste opp bildet"
        } finally { F51.acting = null }
    }
}

/** Laster ned eksporten (CSV/HTML) til cache/scans og deler den (FileProvider), så den kan lagres eller skrives ut. */
fun AppViewModel.shareExport51(path: String, name: String, mime: String) {
    if (F51.acting != null) return
    F51.acting = "export"
    launch51 {
        try {
            val bytes = api51 { bytes(Api.FINANS + path) }
            val ctx = appCtx51
            val f = withContext(Dispatchers.IO) {
                val dir = java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }
                java.io.File(dir, name).apply { writeBytes(bytes) }
            }
            val uri = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
            val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType(mime).putExtra(android.content.Intent.EXTRA_STREAM, uri)
                .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(android.content.Intent.createChooser(send, name).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            F51.toast = e.message ?: "Kunne ikke laste ned"
        } finally { F51.acting = null }
    }
}

/** finanshub://plan/…, famcal/…, kveld, sok – fra varsler, snarveier og Glimt. */
fun AppViewModel.deepLink51(uri: Uri) {
    val sub = uri.path?.trim('/').orEmpty()
    when (uri.host ?: "") {
        "plan", "planlegging" -> { if (sub in setOf("spar", "kal", "skatt", "pris", "jakt")) F51.ui["plan.tab"] = sub; open51("plan") }
        "famcal", "familiekalender" -> { if (sub.isNotBlank()) F51.ui["fam.focus"] = sub; open51("famcal"); load51("famEvents", true); load51("famDrives", true) }
        "kveld", "mediakveld" -> open51(if (sub in setOf("lyd", "subs", "lagring")) sub else "kveld")
        "sok", "search51" -> open51("sok")
    }
}

/** Varsel-URL fra serveren (/#/familiekalender, /finans/plan51#skatt) → appens dyplenke, eller null. */
fun url51(u: String): String? = when {
    u.contains("familiekalender") -> "finanshub://famcal"
    u.contains("plan51") -> "finanshub://plan/" + u.substringAfter('#', "spar").ifBlank { "spar" }
    u.contains("mediakveld") -> "finanshub://kveld"
    else -> null
}
