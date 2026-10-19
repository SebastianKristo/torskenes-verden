package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/*
 * Prompt 29 (ANDROID29): Innstillinger → KONTO → Backup (claude-code-backup.md), bare admin. API fra SERVER29:
 * GET/PUT /api/backup/settings, POST /api/backup/run → 202 {id}, GET /api/backup/status (siste + pågående med pct),
 * GET /api/backup/list, POST /api/backup/key → {key} (vises én gang), POST /api/backup/restore {id, modules, password},
 * GET /api/backup/:id/download (økt i nettleseren: åpnes i nettleseren). Mangler API-et (404): «Ikke tilgjengelig».
 * Grensesnittet ligger i ui/Backup29Ui.kt.
 */

/** Modulene som kan tas med: nøkkel, navn og hva som ligger i dem (rekkefølgen fra fasiten). */
val BK29_MODULES = listOf(
    Triple("finans", "Finans", "Transaksjoner, kvitteringer, budsjett, abonnementer"),
    Triple("kalender", "Kalender", "Egne hendelser og påminnelser"),
    Triple("familie", "Familie", "Posisjoner, soner og helse"),
    Triple("mat", "Mat", "Oppskrifter og ukeplan"),
    Triple("sporing", "Sporing", "Pakker og historikk"),
    Triple("huske", "Huskeliste", "Lister og oppgaver"),
    Triple("bursdager", "Bursdager", ""),
    Triple("chat", "Chat", "Samtaler og kunnskapsbase"),
    Triple("domener", "Domener", "Oppsett og statistikk"),
    Triple("innstillinger", "Innstillinger og brukere", "Kontoer, tokens og regler"),
    Triple("filer", "Bilder og filer", "Kvitteringsbilder og vedlegg"),
)
val BK29_SCHEDULES = listOf("nightly" to "Hver natt 03:00", "6h" to "Hver 6. time", "weekly" to "Hver uke · søndag", "monthly" to "Hver måned")
val BK29_KEEP = listOf("7" to "7 siste", "30" to "30 siste", "90d" to "90 dager", "1y" to "1 år")
val BK29_SCOPES = listOf("all" to "Hele systemet", "finans" to "Bare Finans", "custom" to "Egendefinert")

data class Bk29Settings(
    val auto: Boolean = true, val schedule: String = "nightly", val keep: String = "30", val notifyFail: Boolean = true,
    val scope: String = "all", val modules: Set<String> = setOf("finans", "kalender"), val path: String = "/srv/backup",
    val cloud: Boolean = false, val provider: String = "b2", val cloudSupported: Boolean = true, val cloudStatus: String = "",
    val encrypt: Boolean = true, val keySet: Boolean = false,
    // Prompt 30: nettverksdisk (target.smb). smbKnown = serveren kjenner SMB-målet.
    val smbKnown: Boolean = false, val smbShare: String = "", val smbOn: Boolean = false, val smbLabel: String = "", val smbStatus: String = "",
)

data class Bk29Item(val id: String, val at: String, val size: String, val scope: String, val modules: List<String>, val ok: Boolean, val error: String, val encrypted: Boolean,
    // Prompt 36: kvitteringen {target, fullPath, method, bytes, sha256, verified, retention[], ms}. verified = null: serveren sender det ikke.
    val target: String = "", val fullPath: String = "", val method: String = "", val bytes: Long? = null, val sha256: String = "",
    val verified: Boolean? = null, val retention: List<String> = emptyList(), val ms: Long? = null)

class Bk29State {
    var loaded by mutableStateOf(false)
    var loading by mutableStateOf(false)
    /** Serveren har ikke /api/backup ennå (404). */
    var missing by mutableStateOf(false)
    var error by mutableStateOf("")
    var settings by mutableStateOf(Bk29Settings())
    var list by mutableStateOf<List<Bk29Item>>(emptyList())
    var last by mutableStateOf<Bk29Item?>(null)
    /** Fremdrift i % for jobben som kjører (null = ingen). */
    var runPct by mutableStateOf<Int?>(null)
    /** Nøkkelen som vises én gang. */
    var newKey by mutableStateOf<String?>(null)
    /** Gjenopprett-arket: backupen, valgte moduler, passord og status. */
    var restore by mutableStateOf<Bk29Item?>(null)
    var restoreAll by mutableStateOf(true)
    var restoreMods by mutableStateOf<Set<String>>(emptySet())
    var restorePw by mutableStateOf("")
    var restoreErr by mutableStateOf("")
    var restoring by mutableStateOf(false)
    internal var poll: Job? = null
}

private fun JSONObject.s29(k: String): String? = if (isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun strList29(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { a!!.optString(it).takeIf { s -> s.isNotBlank() } }

/** «2,4 GB» / «340 MB». */
fun bkSize29(o: JSONObject, k: String = "size"): String {
    if (o.isNull(k) || !o.has(k)) return ""
    val raw = o.opt(k)
    if (raw is String && raw.toDoubleOrNull() == null) return raw
    val b = o.optDouble(k, -1.0)
    if (b < 0) return ""
    val u = listOf("B", "kB", "MB", "GB", "TB")
    var v = b
    var i = 0
    while (v >= 1000 && i < u.size - 1) { v /= 1000; i++ }
    val txt = if (i >= 3) "%.1f".format(java.util.Locale("nb", "NO"), v) else Math.round(v).toString()
    return "$txt ${u[i]}"
}

/** «I natt 03:00», «I går 03:00», «19.10 03:00». */
fun bkWhen29(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    val inst = runCatching { Instant.parse(raw) }.getOrNull()
        ?: raw.toLongOrNull()?.let { Instant.ofEpochMilli(it) }
        ?: runCatching { java.time.LocalDateTime.parse(raw.take(19)).atZone(ZoneId.systemDefault()).toInstant() }.getOrNull()
        ?: return raw
    val t = inst.atZone(ZoneId.systemDefault())
    val hm = "%02d:%02d".format(t.hour, t.minute)
    val today = LocalDate.now()
    val d = t.toLocalDate()
    return when {
        d == today && t.hour < 6 -> "I natt $hm"
        d == today -> "I dag $hm"
        d == today.minusDays(1) -> "I går $hm"
        else -> "%02d.%02d %s".format(d.dayOfMonth, d.monthValue, hm)
    }
}

fun bkScopeName29(k: String): String = BK29_SCOPES.firstOrNull { it.first == k }?.second ?: if (k.isBlank()) "" else kalCap(k)

private fun itemOf29(o: JSONObject): Bk29Item = Bk29Item(
    o.s29("id") ?: "", o.s29("at") ?: o.s29("finishedAt") ?: o.s29("startedAt") ?: o.s29("start") ?: "", bkSize29(o).ifBlank { bkSize29(o, "bytes") }, o.s29("scope") ?: "",
    strList29(o.optJSONArray("modules")), o.optBoolean("ok", o.s29("error") == null) && (!o.has("verified") || o.isNull("verified") || o.optBoolean("verified")),
    o.s29("error") ?: "", o.optBoolean("encrypted", false),
    target = smbUrl36(o.optJSONObject("target")) ?: o.s29("target") ?: "",
    fullPath = o.s29("fullPath")?.let { fp -> if (fp.startsWith("smb://") || fp.startsWith("/")) fp else (smbUrl36(o.optJSONObject("target"))?.trimEnd('/')?.plus("/")?.plus(fp.trimStart('/')) ?: fp) } ?: "",
    method = o.s29("method") ?: "", bytes = if (o.has("bytes") && !o.isNull("bytes")) o.optLong("bytes") else null, sha256 = o.s29("sha256") ?: "",
    verified = if (o.has("verified") && !o.isNull("verified")) o.optBoolean("verified") else null,
    retention = (0 until (o.optJSONArray("retention")?.length() ?: 0)).mapNotNull { i ->
        val r = o.optJSONArray("retention")!!.opt(i)
        when (r) { is JSONObject -> listOfNotNull(r.s29("action") ?: "slettet", r.s29("file") ?: r.s29("name")).joinToString(" "); is String -> r; else -> null }
    },
    ms = if (o.has("ms") && !o.isNull("ms")) o.optLong("ms") else null,
)

private fun settingsOf29(o0: JSONObject): Bk29Settings {
    val o = o0.optJSONObject("settings") ?: o0
    val cloud = o.optJSONObject("cloud")
    val target = o.optJSONObject("target")
    val smb = target?.optJSONObject("smb")
    val prov = cloud?.s29("provider") ?: "b2"
    // cloud.providers: [{id, supported}] – Google Drive er «Kommer» til serveren støtter det.
    val provs = cloud?.optJSONArray("providers")
    val sup = (0 until (provs?.length() ?: 0)).mapNotNull { provs!!.optJSONObject(it) }.firstOrNull { it.s29("id") == prov }?.optBoolean("supported", true)
        ?: cloud?.optBoolean("supported", true) ?: true
    return Bk29Settings(
        o.optBoolean("auto", true), o.s29("schedule") ?: "nightly", o.s29("keep") ?: "30", o.optBoolean("notifyFail", true),
        o.s29("scope") ?: "all", strList29(o.optJSONArray("modules")).toSet(), target?.s29("path") ?: "/srv/backup",
        cloud?.optBoolean("enabled", false) ?: false, prov, sup,
        cloud?.s29("lastError")?.let { "Feilet: $it" } ?: cloud?.s29("lastUpload")?.let { "Sist lastet opp " + bkWhen29(it).replaceFirstChar { c -> c.lowercase() } } ?: "", o.optBoolean("encrypt", false), o.optBoolean("keySet", false),
        smbKnown = smb != null, smbShare = smb?.s29("share") ?: "", smbOn = smb?.optBoolean("enabled", false) ?: false, smbLabel = smb?.s29("label") ?: (smb?.s29("share") ?: ""),
        smbStatus = smb?.s29("lastError")?.let { "siste kopi feilet: $it" } ?: smb?.s29("lastUpload")?.let { "sist " + bkWhen29(it).replaceFirstChar { c -> c.lowercase() } } ?: "",
    )
}

private fun Bk29Settings.json29(): JSONObject = JSONObject().put("auto", auto).put("schedule", schedule).put("keep", keep).put("notifyFail", notifyFail)
    .put("scope", scope).put("modules", JSONArray(modules.toList())).put("cloud", JSONObject().put("enabled", cloud).put("provider", provider)).put("encrypt", encrypt)

private fun bkErr29(e: ApiException): String = when (e.status) {
    403 -> e.message?.takeIf { it.isNotBlank() && !Regex("^Feil \\d+$").matches(it) } ?: "Bare administratorer kan endre backup. Noen handlinger må gjøres i nettleseren."
    else -> e.message ?: "Noe gikk galt"
}

/** Henter oppsett, status og liste. */
fun AppViewModel.loadBk29() {
    val s = bk29
    if (s.loading || !userIsAdmin) return
    s.loading = true
    launch29 {
        try {
            s.settings = settingsOf29(JSONObject(api29 { hlGet("/backup/settings") }))
            s.missing = false
            s.error = ""
            s.loaded = true
            runCatching { readStatus29(JSONObject(api29 { hlGet("/backup/status") })) }
            runCatching {
                val raw = api29 { hlGet("/backup/list") }.trim()
                val a = if (raw.startsWith("[")) JSONArray(raw) else JSONObject(raw).let { it.optJSONArray("items") ?: it.optJSONArray("backups") ?: JSONArray() }
                s.list = (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(::itemOf29) }
                if (s.last == null) s.last = s.list.firstOrNull()
            }
            if (s.runPct != null) pollBk29()
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) { s.missing = true; s.error = "" } else s.error = bkErr29(e)
        } catch (e: Exception) {
            s.error = e.message ?: "Feil"
        } finally { s.loading = false }
    }
}

private fun AppViewModel.readStatus29(o: JSONObject) {
    val s = bk29
    (o.optJSONObject("last") ?: o.optJSONObject("latest"))?.let { s.last = itemOf29(it) }
    val run = o.optJSONObject("running") ?: o.optJSONObject("current") ?: o.optJSONObject("job")?.takeIf { it.s29("state") == "running" || it.s29("state") == "queued" }
    s.runPct = run?.let { r -> r.optInt("pct", o.optInt("pct", 0)).coerceIn(0, 100) }
}

/** Kortstatus til raden i Innstillinger: «Hver natt 03:00 · Hele systemet» eller «Automatisk av». */
fun bkSummary29(s: Bk29State): String = when {
    s.missing -> "Ikke tilgjengelig"
    !s.loaded -> "Hele systemet eller bare Finans"
    s.runPct != null -> "Tar backup … ${s.runPct} %"
    !s.settings.auto -> "Automatisk av"
    else -> (BK29_SCHEDULES.firstOrNull { it.first == s.settings.schedule }?.second ?: s.settings.schedule) + " · " + bkScopeName29(s.settings.scope)
}

/** Lagrer endringen (vises med en gang, tilbake ved feil). */
fun AppViewModel.saveBk29(n: Bk29Settings) {
    val s = bk29
    val old = s.settings
    s.settings = n
    Haptics.select()
    launch29 {
        try {
            val raw = api29 { hlPut("/backup/settings", n.json29()) }
            runCatching { s.settings = settingsOf29(JSONObject(raw)) }
        } catch (e: ApiException) { s.settings = old; flash("Fikk ikke lagret: " + bkErr29(e)) }
    }
}

/** Krypter backup: første gang lages nøkkelen, som vises én gang. */
fun AppViewModel.setBkEncrypt29(on: Boolean) {
    val s = bk29
    if (!on) {
        if (s.settings.cloud) { flash("Kopi til sky krever kryptering. Slå av sky først."); return }
        saveBk29(s.settings.copy(encrypt = false)); return
    }
    if (s.settings.keySet) { saveBk29(s.settings.copy(encrypt = true)); return }
    launch29 {
        try {
            val o = JSONObject(api29 { hlPost("/backup/key") })
            o.s29("key")?.let { s.newKey = it }
            s.settings = s.settings.copy(keySet = true)
            saveBk29(s.settings.copy(encrypt = true))
        } catch (e: ApiException) { flash("Fikk ikke laget nøkkel: " + bkErr29(e)) }
    }
}

fun AppViewModel.setBkCloud29(on: Boolean) {
    val s = bk29
    if (on && !s.settings.cloudSupported) { flash("Kopi til sky kommer snart"); return }
    if (on && !s.settings.encrypt) { flash("Slå på «Krypter backup» først. Ukryptert backup sendes aldri til sky."); return }
    saveBk29(s.settings.copy(cloud = on))
}

/** Ta backup nå: fremdrift i %, fortsetter på serveren selv om appen lukkes. */
fun AppViewModel.runBk29() {
    val s = bk29
    if (s.runPct != null) return
    s.runPct = 0
    Haptics.success()
    launch29 {
        try {
            val body = JSONObject().put("scope", s.settings.scope)
            if (s.settings.scope == "custom") body.put("modules", JSONArray(s.settings.modules.toList()))
            api29 { hlPost("/backup/run", body) }
            pollBk29()
        } catch (e: ApiException) {
            s.runPct = null
            flash(if (e.status == 404) "Serveren har ikke systembackup ennå. Oppdater Homelab-serveren." else "Fikk ikke startet backup: " + bkErr29(e))
        }
    }
}

private fun AppViewModel.pollBk29() {
    val s = bk29
    if (s.poll?.isActive == true) return
    s.poll = viewModelScope.launch {
        var n = 0
        while (s.runPct != null && n < 900) {
            delay(2000)
            n++
            val o = runCatching { JSONObject(api29 { hlGet("/backup/status") }) }.getOrNull() ?: continue
            readStatus29(o)
            if (s.runPct == null) {
                val l = s.last
                if (l != null && !l.ok) flash("Backup feilet: " + l.error.ifBlank { "ukjent feil" })
                else {
                    flash("✓ Backup ferdig")
                    if (inBackground29) Notify.post(appCtx29, "Backup ferdig", listOf(l?.size, bkScopeName29(l?.scope ?: "")).filter { !it.isNullOrBlank() }.joinToString(" · "), "bk29", group = "system")
                }
                s.loading = false
                loadBk29()
            }
        }
    }
}

/* ---------- Gjenopprett ---------- */

fun AppViewModel.openRestore29(b: Bk29Item) {
    val s = bk29
    s.restore = b
    s.restoreAll = true
    s.restoreMods = b.modules.toSet().ifEmpty { BK29_MODULES.map { it.first }.toSet() }
    s.restorePw = ""
    s.restoreErr = ""
}

fun AppViewModel.doRestore29() {
    val s = bk29
    val b = s.restore ?: return
    if (s.restorePw.isBlank()) { s.restoreErr = "Skriv passordet ditt for å bekrefte."; return }
    val mods = if (s.restoreAll) (b.modules.ifEmpty { BK29_MODULES.map { it.first } }) else s.restoreMods.toList()
    if (mods.isEmpty()) { s.restoreErr = "Velg minst én modul."; return }
    if (s.restoring) return
    s.restoring = true
    s.restoreErr = ""
    launch29 {
        try {
            val raw = api29 { hlPost("/backup/restore", JSONObject().put("id", b.id).put("modules", JSONArray(mods)).put("password", s.restorePw)) }
            val o = runCatching { JSONObject(raw) }.getOrNull()
            s.restore = null
            s.restorePw = ""
            flash(if (o?.optBoolean("restart") == true) "Gjenopprettet. Serveren starter på nytt – åpne appen igjen om litt." else "✓ Gjenopprettet. Sikkerhetskopi tatt først.")
            if (o?.optBoolean("reload") == true) refresh()
            s.loading = false
            loadBk29()
        } catch (e: ApiException) {
            s.restoreErr = when (e.status) { 401 -> "Feil passord."; 404 -> "Fant ikke backupen på serveren."; else -> bkErr29(e) }.let { m ->
                if (e.message?.contains("nøkkel", true) == true) e.message ?: m else m
            }
            Haptics.error()
        } finally { s.restoring = false }
    }
}

/** Nedlasting krever økt i nettleseren: åpnes der. */
fun AppViewModel.bkDownloadUrl29(b: Bk29Item): String =
    base.ifBlank { account?.server ?: "" }.trimEnd('/') + "/api/backup/" + URLEncoder.encode(b.id, "UTF-8") + "/download"
