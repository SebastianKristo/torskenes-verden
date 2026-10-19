package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.roundToLong
import kotlin.math.sin

/*
 * Prompt 36 (ANDROID36), filer med «36» (P36.kt, ui/Glimt36.kt, ui/Ui36.kt):
 *  - Matplanen er felles for husstanden: «Felles for husstanden · Endret av Nina 18.42» (sharedNote / updatedBy + updatedAt fra /week),
 *    sanntid «meal:changed» over /api/ws laster uka på nytt og viser «Oppdatert av Nina». Ingen dele-/privat-valg.
 *  - Nordlys OS: endringsnotater som faktisk finnes (fallback GET /api/system/changelog?limit=1), TIDLIGERE VERSJONER
 *    (GET /api/system/changelog?limit=20&before= → {items:[{version, date, notes[], installedAt?, failed?}], more}, «Vis flere»),
 *    Sherlock-Glimt ved «Se etter» og snekker-Glimt på fremdriftslinja mens den oppdaterer (ui/Glimt36.kt).
 *  - «Starter opp»-skjerm med Glimt mens serveren starter på nytt etter oppdateringen: GET /api/health hvert 1,5 s →
 *    {ready, version, steps:[{id, label, status:'wait'|'run'|'ok', ms}]}. 404 (eldre server) = svarer = klar.
 *  - Glimt: spørsmål vs. handling (spørsmålsvakt før avtaletolkning, aldri både pille og kort), dagslys/soloppgang/solnedgang lokalt (suncalc).
 *  - Brief-kortet på Hjem kan sveipes bort (venstre → høyre) til neste brief, med hint de 2 første gangene og «Now Brief» øverst i Mer.
 *  - Profilbilde i Konto (512 × 512 JPEG, POST /api/me/avatar som før – serveren cache-buster med ?v=), ikon på radene i Innstillinger.
 *  - Backup: mappeleser med undermapper (POST /api/smb/list, 🔒, Bruk denne mappen, Ny mappe, skriv sti) og kvittering
 *    {target, fullPath, method, bytes, sha256, verified, retention[], ms, error} i siste kjøring.
 */

private val OSLO36: ZoneId = ZoneId.of("Europe/Oslo")

data class Ver36(val version: String, val date: String, val notes: List<String>, val installedAt: String?, val failed: Boolean, val commit: String?)

data class HealthStep36(val id: String, val label: String, val status: String, val ms: Long?)

class P36State {
    /* Matplan */
    var mealNote by mutableStateOf<String?>(null)

    /* Nordlys: tidligere versjoner og notater for den nye versjonen */
    var hist by mutableStateOf<List<Ver36>>(emptyList())
    var histMore by mutableStateOf(false)
    var histBusy by mutableStateOf(false)
    var histMissing by mutableStateOf(false)
    var histOpen by mutableStateOf<String?>(null)
    var latestNotes by mutableStateOf<List<String>>(emptyList())
    internal var histFor: String? = null

    /* Sherlock-Glimt («Se etter») */
    var sherSeq by mutableIntStateOf(0)
    var sherOn by mutableStateOf(false)

    /* «Starter opp» */
    var startOn by mutableStateOf(false)
    var startReady by mutableStateOf(false)
    var startSteps by mutableStateOf<List<HealthStep36>>(emptyList())
    var startAt by mutableLongStateOf(0L)
    var startVer by mutableStateOf("")
    /** Brukeren lukket skjermen («Vis logg»): ikke vis den igjen for denne oppdateringen. */
    var startDismissed by mutableStateOf(false)
    internal var startJob: Job? = null

    /* Brief-kortet på Hjem */
    var briefHidden by mutableStateOf<String?>(null)
    var briefToast by mutableIntStateOf(0)
    var briefHint by mutableStateOf(false)
    internal var briefFor: String? = null

    /* Profilbilde */
    var avatarBusy by mutableStateOf(false)
    var avatarAsk by mutableStateOf(false)
}

private fun JSONObject.s36(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

/* ======================= Matplan (felles) ======================= */

private fun hm36(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val inst = runCatching { Instant.parse(raw) }.getOrNull() ?: raw.toLongOrNull()?.let { Instant.ofEpochMilli(it) } ?: return null
    val t = inst.atZone(OSLO36)
    val today = LocalDate.now(OSLO36)
    val hm = "%02d.%02d".format(t.hour, t.minute)
    return when (t.toLocalDate()) {
        today -> hm
        today.minusDays(1) -> "i går $hm"
        else -> "%d.%d. %s".format(t.dayOfMonth, t.monthValue, hm)
    }
}

/** «Felles for husstanden · Endret av Nina 18.42» fra /week (sharedNote, eller updatedBy + updatedAt). */
fun mealNote36(raw: String): String {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return "Felles for husstanden"
    o.s36("sharedNote")?.let { return it }
    val by = o.s36("updatedByName") ?: o.optJSONObject("updatedBy")?.let { it.s36("name") ?: it.s36("username") } ?: o.s36("updatedBy")
    val at = hm36(o.s36("updatedAt"))
    return listOfNotNull("Felles for husstanden", by?.let { "Endret av $it" + (at?.let { a -> " $a" } ?: "") }).joinToString(" · ")
}

/** Sanntid: «meal:changed» → uka lastes på nytt, og «Oppdatert av Nina» hvis det var en annen. */
fun AppViewModel.onMealChanged36(msg: JSONObject) {
    val by = msg.s36("byName") ?: msg.optJSONObject("by")?.s36("name") ?: msg.s36("updatedBy") ?: msg.s36("by")
    val mine = by != null && (by.equals(me?.username, true) || by.equals(displayName, true) || by == account?.id)
    launch36 {
        runCatching { loadWeek() }
        if (!mine && by != null) flash(msg.s36("text") ?: "Oppdatert av $by")
    }
}

/* ======================= Nordlys: notater og tidligere versjoner ======================= */

private fun notes36(a: org.json.JSONArray?): List<String> {
    val out = ArrayList<String>()
    for (i in 0 until (a?.length() ?: 0)) {
        val x = a!!.opt(i)
        val t = when (x) { is JSONObject -> x.s36("text") ?: x.s36("t") ?: x.s36("title"); is String -> x; else -> null }?.trim() ?: continue
        // Tomme punkter og bare-overskrift-linjer («Kalender:») hoppes over.
        if (t.isEmpty() || Regex("^[^:]{1,30}:\\s*$").matches(t)) continue
        out += t.removePrefix("- ").removePrefix("* ")
    }
    return out
}

private fun ver36(o: JSONObject): Ver36? {
    val v = (o.s36("version") ?: o.s36("tag") ?: return null).removePrefix("v")
    return Ver36(v, o.s36("date") ?: o.s36("publishedAt") ?: "", notes36(o.optJSONArray("notes") ?: o.optJSONArray("items") ?: o.optJSONArray("changes")),
        o.s36("installedAt"), o.optBoolean("failed", false) || o.s36("status") == "failed", o.s36("commit") ?: o.s36("sha"))
}

/** TIDLIGERE VERSJONER (før [before]). more = «Vis flere» (fortsetter fra den siste i listen). */
fun AppViewModel.loadHist36(before: String, more: Boolean = false) {
    val s = p36
    if (s.histBusy) return
    if (!more && s.histFor == before && s.hist.isNotEmpty()) return
    s.histBusy = true
    launch36 {
        try {
            val from = if (more) s.hist.lastOrNull()?.version ?: before else before
            val q = "/system/changelog?limit=20" + if (from.isNotBlank()) "&before=" + URLEncoder.encode(from, "UTF-8") else ""
            val raw = api36 { hlGet(q, timeout = 10_000) }
            val o = raw.trim().let { if (it.startsWith("[")) JSONObject().put("items", org.json.JSONArray(it)) else JSONObject(it) }
            val items = objs34(o.optJSONArray("items")).mapNotNull { ver36(it) }.filter { it.version != before.removePrefix("v") }
            s.hist = if (more) (s.hist + items).distinctBy { it.version } else items
            s.histMore = o.optBoolean("more", false) && items.isNotEmpty()
            s.histFor = before
            s.histMissing = false
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.histMissing = true
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
        } finally { s.histBusy = false }
    }
}

/** «Ingen endringsnotater»: hent punktene for den nye versjonen fra changelog-API-et når /system/version mangler dem. */
fun AppViewModel.loadLatestNotes36(version: String) {
    val s = p36
    if (version.isBlank() || p30.upd.notes.isNotEmpty()) return
    launch36 {
        val raw = runCatching { api36 { hlGet("/system/changelog?limit=3", timeout = 10_000) } }.getOrNull() ?: return@launch36
        val o = runCatching { raw.trim().let { if (it.startsWith("[")) JSONObject().put("items", org.json.JSONArray(it)) else JSONObject(it) } }.getOrNull() ?: return@launch36
        val v = version.removePrefix("v")
        objs34(o.optJSONArray("items")).mapNotNull { ver36(it) }.firstOrNull { it.version == v }?.let { s.latestNotes = it.notes }
    }
}

/** «Se etter oppdatering»: Glimt i Sherlock-drakt flyr inn og leter mens serveren sjekker GitHub. */
fun AppViewModel.check36() {
    if (p31.checking || p30.upd.phase == "run") return
    Haptics.tap()
    p36.sherSeq++
    p36.sherOn = true
    checkNordlys31()
}

fun relDate36(v: String): String = runCatching { LocalDate.parse(v.take(10)) }.getOrNull()?.let { "%02d.%02d.%d".format(it.dayOfMonth, it.monthValue, it.year) } ?: v

/** «Installert 19.10 kl. 21.40». */
fun installed36(v: String?): String? {
    if (v.isNullOrBlank()) return null
    val t = runCatching { Instant.parse(v).atZone(OSLO36) }.getOrNull() ?: return "Installert"
    return "Installert %02d.%02d kl. %02d.%02d".format(t.dayOfMonth, t.monthValue, t.hour, t.minute)
}

/* ======================= «Starter opp» ======================= */

val START_STEPS36 = listOf(
    "db" to "Starter databasen", "migrate" to "Kjører migrasjoner", "api" to "Starter web og API",
    "ai" to "Vekker Glimt og AI-modellene", "integrations" to "Kobler til integrasjoner",
)

private fun parseHealth36(raw: String): Pair<Boolean, List<HealthStep36>> {
    val o = JSONObject(raw)
    val got = objs34(o.optJSONArray("steps")).mapNotNull { x ->
        val id = x.s36("id") ?: return@mapNotNull null
        val st = when (x.s36("status") ?: x.s36("state")) { "ok", "done" -> "ok"; "run", "running", "active" -> "run"; else -> "wait" }
        HealthStep36(id, x.s36("label") ?: START_STEPS36.firstOrNull { it.first == id }?.second ?: id, st, if (x.has("ms") && !x.isNull("ms")) x.optLong("ms") else null)
    }
    val ready = o.optBoolean("ready", got.isNotEmpty() && got.all { it.status == "ok" })
    val steps = if (got.isEmpty()) START_STEPS36.map { (id, l) -> HealthStep36(id, l, if (ready) "ok" else "wait", null) } else got
    return ready to steps
}

/** Viser «Starter opp» og poller /api/health til serveren er klar. Ingen svar = første steg er aktivt. */
fun AppViewModel.startScreen36() {
    val s = p36
    if (s.startOn || s.startDismissed) return
    s.startOn = true
    s.startReady = false
    s.startAt = System.currentTimeMillis()
    s.startVer = p30.upd.latest.ifBlank { p30.upd.current }
    s.startSteps = START_STEPS36.mapIndexed { i, (id, l) -> HealthStep36(id, l, if (i == 0) "run" else "wait", null) }
    pollHealth36()
}

fun AppViewModel.pollHealth36() {
    val s = p36
    s.startJob?.cancel()
    s.startJob = launchJob36 {
        while (s.startOn) {
            val r = try { parseHealth36(api36 { request("GET", "/health", null, prefix = Api.HOMELAB, timeout = 3000, read = 4000) }) } catch (e: ApiException) {
                // Eldre server uten /api/health: svarer den med 404, kjører den.
                if (e.status == 404) true to START_STEPS36.map { (id, l) -> HealthStep36(id, l, "ok", null) } else null
            } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            if (r != null) {
                s.startSteps = r.second
                if (r.first) {
                    s.startReady = true
                    Haptics.success()
                    delay(800)
                    // Mobil: hent versjonen på nytt og fjern skjermen.
                    loadUpd30(force = true)
                    loadNordlys31()
                    delay(300)
                    s.startOn = false
                    break
                }
            }
            delay(1500)
        }
    }
}

fun AppViewModel.closeStart36(dismiss: Boolean) {
    val s = p36
    s.startJob?.cancel()
    s.startOn = false
    if (dismiss) s.startDismissed = true
}

/* ======================= Brief-kortet: sveip bort ======================= */

/** Perioden briefen hører til (morgen < 11, dag < 17, kveld < 21, natt). */
fun briefPeriod36(h: Int = LocalTime.now(OSLO36).hour): String = when { h < 11 -> "morgen"; h < 17 -> "dag"; h < 21 -> "kveld"; else -> "natt" }

fun briefKey36(): String = LocalDate.now(OSLO36).toString() + "|" + briefPeriod36()

/** «kveldsbriefen kl. 17». */
fun briefNext36(h: Int = LocalTime.now(OSLO36).hour): String = when { h < 11 -> "dagsbriefen kl. 11"; h < 17 -> "kveldsbriefen kl. 17"; h < 21 -> "nattbriefen kl. 21"; else -> "morgenbriefen kl. 07" }

private fun AppViewModel.briefHideKey36() = "glimt_brief_hide36_" + (account?.id ?: "")
private fun AppViewModel.briefHintKey36() = "glimt_brief_swhint36_" + (account?.id ?: "")

fun AppViewModel.loadBriefHide36() {
    val s = p36
    val k = briefHideKey36()
    if (s.briefFor == k) return
    s.briefFor = k
    s.briefHidden = prefs.str(k, "").ifBlank { null }
}

fun AppViewModel.briefHiddenNow36(): Boolean { loadBriefHide36(); return p36.briefHidden == briefKey36() }

fun AppViewModel.hideBrief36() {
    val k = briefKey36()
    p36.briefHidden = k
    prefs.set(briefHideKey36(), k)
    p36.briefToast++
}

fun AppViewModel.undoBrief36() {
    Haptics.select()
    p36.briefHidden = null
    prefs.set(briefHideKey36(), "")
    p36.briefToast = 0
}

/** Hintet («Sveip → for å skjule») de 2 første gangene Hjem åpnes. */
fun AppViewModel.takeBriefHint36(): Boolean {
    val n = prefs.int(briefHintKey36(), 0)
    if (n >= 2) return false
    prefs.set(briefHintKey36(), n + 1)
    return true
}

/* ======================= Glimt: spørsmål vs. handling ======================= */

private val Q_START36 = Regex("^\\s*(spørsmål|hva|hvor|hvem|hvilke?n?|hvordan|hvorfor|når|kan du|vet du|fortell|what|when|where|how|who|why)\\b", RegexOption.IGNORE_CASE)
private val Q_ANY36 = Regex("\\b(hvor mange|hvor mye|hvor lenge|hvor langt|hva er|hva blir|når går|når er|hvordan blir)\\b", RegexOption.IGNORE_CASE)
private val DO36 = Regex("\\b(legg til|book|bestill|påminn)\\b", RegexOption.IGNORE_CASE)

/** Spørsmålsvakt før avtaletolkning: «?», spørreord først eller «hvor mange / hva er …», uten «legg til / book / bestill / påminn». */
fun isQuestion36(t: String): Boolean = (t.contains('?') || Q_START36.containsMatchIn(t) || Q_ANY36.containsMatchIn(t)) && !DO36.containsMatchIn(t)

/* ---------- Dagslys, soloppgang og solnedgang (suncalc, lokalt) ---------- */

private val SUN36 = Regex("dagslys|soloppgang|solnedgang|sola\\s+(står|går)\\s+(opp|ned)|lyst\\s+ute|sunrise|sunset|daylight", RegexOption.IGNORE_CASE)
private val MONTHS36 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")

fun isSunQ36(t: String): Boolean = SUN36.containsMatchIn(t)

/** Datoen i spørsmålet: 29.06.2027, 29/6, «29. juni 2027», «i morgen». Ellers i dag. */
fun dateIn36(t: String, today: LocalDate = LocalDate.now(OSLO36)): LocalDate {
    Regex("\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b").find(t)?.let { m ->
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it } ?: today.year
        runCatching { LocalDate.of(y, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()?.let { return it }
    }
    Regex("\\b(\\d{1,2})\\.?\\s+(" + MONTHS36.joinToString("|") + ")(?:\\s+(\\d{4}))?", RegexOption.IGNORE_CASE).find(t)?.let { m ->
        val mo = MONTHS36.indexOf(m.groupValues[2].lowercase()) + 1
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt() ?: today.year
        runCatching { LocalDate.of(y, mo, m.groupValues[1].toInt()) }.getOrNull()?.let { return it }
    }
    if (Regex("i\\s*overmorgen", RegexOption.IGNORE_CASE).containsMatchIn(t)) return today.plusDays(2)
    if (Regex("i\\s*morgen|imorgen|tomorrow", RegexOption.IGNORE_CASE).containsMatchIn(t)) return today.plusDays(1)
    return today
}

/** Stedet i spørsmålet («… i Bergen»), ellers null. */
fun sunPlaceIn36(t: String): String? {
    val skip = setOf("dag", "morgen", "overmorgen", "kveld", "natt", "år", "fjor", "sommer", "vinter") + MONTHS36
    for (m in Regex("(?:^|\\s)(?:i|på|in|for)\\s+([A-Za-zÆØÅæøåÜüÉé][\\wÆØÅæøåÜüÉé-]+(?:\\s+[A-ZÆØÅ][\\wæøå-]+)?)").findAll(t)) {
        val p = m.groupValues[1].trim()
        if (p.lowercase() in skip || p.first().isLowerCase()) continue
        return p
    }
    return null
}

data class Sun36(val rise: ZonedDateTime?, val set: ZonedDateTime?, val dayMin: Int)

/** Soloppgang/solnedgang (suncalc, h0 = −0,833°). Midnattssol: dayMin = 1440, mørketid: 0 (rise/set null). */
fun sunTimes36(date: LocalDate, lat: Double, lon: Double, zone: ZoneId = OSLO36): Sun36 {
    val rad = PI / 180
    val dayMs = 86_400_000.0
    val j1970 = 2440588.0; val j2000 = 2451545.0; val j0 = 0.0009
    val ms = date.atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
    val d = ms / dayMs - 0.5 + j1970 - j2000
    val lw = rad * -lon
    val phi = rad * lat
    val n = Math.round(d - j0 - lw / (2 * PI)).toDouble()
    val ds = j0 + lw / (2 * PI) + n
    val m = rad * (357.5291 + 0.98560028 * ds)
    val c = rad * (1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m))
    val l = m + c + rad * 102.9372 + PI
    val dec = asin(sin(l) * sin(rad * 23.4397))
    val jNoon = j2000 + ds + 0.0053 * sin(m) - 0.0069 * sin(2 * l)
    val x = (sin(-0.833 * rad) - sin(phi) * sin(dec)) / (cos(phi) * cos(dec))
    if (x <= -1) return Sun36(null, null, 1440)
    if (x >= 1) return Sun36(null, null, 0)
    val w = acos(x)
    val a = j0 + (w + lw) / (2 * PI) + n
    val jSet = j2000 + a + 0.0053 * sin(m) - 0.0069 * sin(2 * l)
    val jRise = jNoon - (jSet - jNoon)
    fun at(j: Double): ZonedDateTime = Instant.ofEpochMilli(((j + 0.5 - j1970) * dayMs).roundToLong()).atZone(zone)
    val r = at(jRise); val s = at(jSet)
    return Sun36(r, s, ((s.toEpochSecond() - r.toEpochSecond()) / 60).toInt())
}

private fun hhmm36(t: ZonedDateTime) = "%02d:%02d".format(t.hour, t.minute)

/** «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.» */
fun sunText36(date: LocalDate, place: String, s: Sun36): String {
    val ds = "${date.dayOfMonth}. ${MONTHS36[date.monthValue - 1]}" + if (date.year != LocalDate.now(OSLO36).year) " ${date.year}" else ""
    if (s.rise == null || s.set == null) return if (s.dayMin >= 1440) "$ds i $place: midnattssol, sola går ikke ned (24 t dagslys)." else "$ds i $place: mørketid, sola står ikke opp."
    return "$ds i $place: soloppgang ${hhmm36(s.rise)}, solnedgang ${hhmm36(s.set)}, **${s.dayMin / 60} t ${s.dayMin % 60} min** dagslys."
}

private suspend fun geocode36(place: String): Triple<Double, Double, String>? = withContext(Dispatchers.IO) {
    runCatching {
        val c = URL("https://geocoding-api.open-meteo.com/v1/search?count=1&language=nb&name=" + URLEncoder.encode(place, "UTF-8")).openConnection() as HttpURLConnection
        c.connectTimeout = 6000; c.readTimeout = 8000
        val raw = try { c.inputStream.bufferedReader().use { it.readText() } } finally { c.disconnect() }
        val g = JSONObject(raw).optJSONArray("results")?.optJSONObject(0) ?: return@runCatching null
        Triple(g.getDouble("latitude"), g.getDouble("longitude"), g.optString("name", place))
    }.getOrNull()
}

/** Hjem-søket: dagslys/sol for en dato besvares lokalt i kortet under søkefeltet (med Åpne Vær ›). true = tatt. */
fun AppViewModel.askSun36(q: String): Boolean {
    if (!isSunQ36(q)) return false
    val s = p31
    val seq = ++s.ansSeq
    s.ans = HomeAns31(q, busy = true)
    Haptics.tap()
    launch36 {
        val date = dateIn36(q)
        val wanted = sunPlaceIn36(q)
        val home = mobileHome?.weather
        val loc: Triple<Double, Double, String> = wanted?.let { geocode36(it) }
            ?: if (home?.lat != null && home.lon != null && wanted == null) Triple(home.lat, home.lon, home.place.ifBlank { "Oslo" }) else Triple(59.9139, 10.7522, "Oslo")
        val sun = sunTimes36(date, loc.first, loc.second)
        if (s.ansSeq != seq) return@launch36
        s.ans = HomeAns31(q, false, sunText36(date, loc.third, sun), "Glimt · beregnet lokalt", wxGeo = "geo:${loc.first},${loc.second},${loc.third}")
        Haptics.success()
    }
    return true
}

/* ======================= Profilbilde ======================= */

/** Kvadrat 512 × 512 (JPEG 85), lastes opp og vises med en gang i meny, hilsen og Konto. */
fun AppViewModel.uploadAvatar36(uri: Uri) {
    val s = p36
    s.avatarBusy = true
    launch36 {
        try {
            val ctx = appCtx35
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val jpeg = withContext(Dispatchers.Default) { squareJpeg36(data, 512, 85) } ?: run { flash("Kunne ikke lese bildet"); return@launch36 }
            api36 { upload("/me/avatar", listOf(Api.Part("file", "avatar.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB) }
            setAvatar36(android.graphics.BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size))
            reloadMe36()
            flash("Profilbildet er oppdatert")
        } finally { s.avatarBusy = false }
    }
}

/* ======================= Backup-kvittering ======================= */

/** «smb://truenas.local/backup/homelab» fra {host, share, path} eller en ferdig tekst. */
fun smbUrl36(o: JSONObject?): String? {
    if (o == null) return null
    o.s36("url")?.let { return it }
    val host = o.s36("host") ?: return o.s36("label")
    val share = o.s36("share") ?: return "smb://$host"
    val path = (o.s36("path") ?: "").trim('/')
    return "smb://$host/$share" + if (path.isNotEmpty()) "/$path" else ""
}

/* ======================= Innstillinger → Kalendere → Google: Hovedkalender og «Vis også i Kalender» ======================= */

/** Én Google-kalender fra GET /api/kalender/calendars/google. id = 'primary' eller googleId. */
data class GCal36(val id: String, val googleId: String, val name: String, val primary: Boolean, val color: Long?, val writable: Boolean,
    val access: String, val main: Boolean, val shown: Boolean)

data class GCals36(val connected: Boolean, val configured: Boolean, val email: String?, val mainId: String?, val mainName: String?, val cals: List<GCal36>)

class GCal36State {
    var data by mutableStateOf<GCals36?>(null)
    var busy by mutableStateOf<String?>(null)
    var missing by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
}

private fun color36(v: String?): Long? {
    val h = v?.trim()?.removePrefix("#") ?: return null
    return when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000L or it }; 8 -> h.toLongOrNull(16); else -> null }
}

fun parseGCals36(raw: String): GCals36 {
    val o = JSONObject(raw)
    val m = o.optJSONObject("main")
    val cals = objs34(o.optJSONArray("calendars")).mapNotNull { c ->
        val gid = c.s36("googleId") ?: c.s36("id") ?: return@mapNotNull null
        val primary = c.optBoolean("primary", false) || c.s36("id") == "primary"
        GCal36(c.s36("id") ?: gid, gid, c.s36("name") ?: c.s36("summary") ?: gid, primary, color36(c.s36("color")),
            c.optBoolean("writable", primary), c.s36("access") ?: "", c.optBoolean("main", false), c.optBoolean("shown", false))
    }
    return GCals36(o.optBoolean("connected", false), o.optBoolean("configured", true), o.s36("email"), m?.s36("id"), m?.s36("name"), cals)
}

/** Verdien PUT tar for en kalender: 'primary' for primærkalenderen, ellers googleId. */
fun GCal36.key(): String = if (primary) "primary" else googleId

fun AppViewModel.loadGCals36() {
    val s = gcal36
    launch36 {
        try { s.data = parseGCals36(api36 { hlGet("/kalender/calendars/google", timeout = 12_000) }); s.missing = false; s.err = null }
        catch (e: ApiException) { if (e.status == 404 || e.status == 405) s.missing = true else s.err = e.message }
        catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

private fun AppViewModel.putGCals36(body: JSONObject, tag: String, rollback: GCals36?) {
    val s = gcal36
    s.busy = tag
    launch36 {
        try {
            s.data = parseGCals36(api36 { hlPut("/kalender/calendars/google", body) })
            s.err = null
            Haptics.success()
            runCatching { reloadKal27() }
        } catch (e: ApiException) {
            s.data = rollback
            s.err = if (e.status == 400) (e.message ?: "Kalenderen kan ikke brukes som hovedkalender (bare lesing).") else "Fikk ikke lagret: ${e.message}"
            Haptics.error()
        } finally { s.busy = null }
    }
}

/** Hovedkalender: nye hendelser lagres her (bare skrivbare). */
fun AppViewModel.setGMain36(c: GCal36) {
    val d = gcal36.data ?: return
    if (!c.writable || c.main) return
    Haptics.select()
    gcal36.data = d.copy(mainId = c.id, mainName = c.name, cals = d.cals.map { it.copy(main = it.googleId == c.googleId) })
    putGCals36(JSONObject().put("main", c.key()), "main", d)
}

/** «Vis også i Kalender»: de andre kalenderne av/på. */
fun AppViewModel.toggleGShow36(c: GCal36) {
    val d = gcal36.data ?: return
    Haptics.select()
    val nd = d.copy(cals = d.cals.map { if (it.googleId == c.googleId) it.copy(shown = !it.shown) else it })
    gcal36.data = nd
    val show = org.json.JSONArray()
    nd.cals.filter { it.shown && !it.main }.forEach { show.put(it.googleId) }
    putGCals36(JSONObject().put("show", show), "show:" + c.googleId, d)
}
