package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/*
 * Prompt 24 (A): Bursdager. Per bruker på serveren (/api/birthdays), med Google Kalender (OAuth styrt av serveren,
 * åpnes i Custom Tab) og Home Assistant (calendar.*). Svarer serveren 404 (eldre versjon), lagres bursdagene bare
 * på denne enheten for kontoen, og Google/HA vises som utilgjengelig.
 */

/* ---------- Modeller ---------- */

data class Bd24(
    val id: String, val name: String, val month: Int, val day: Int, val year: Int?, val relation: String, val reminderDays: Int?,
    val source: String, val avatarUrl: String?, val googleEventId: String?, val googleUrl: String? = null,
) {
    val next: LocalDate get() = bdNext(month, day, LocalDate.now())
    val daysLeft: Int get() = ChronoUnit.DAYS.between(LocalDate.now(), next).toInt()
    /** Alderen personen fyller neste gang (null uten fødselsår). */
    val age: Int? get() = year?.takeIf { it > 1800 }?.let { next.year - it }
    val initials: String get() = name.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase().ifBlank { "?" }
    val relLabel: String get() = BD_RELS.firstOrNull { it.first == relation }?.second ?: "Annet"
    val color: Long get() = bdRelColor(relation)
    /** «2. nov» */
    val short: String get() = "${next.dayOfMonth}. ${BD_MS[next.monthValue - 1]}"
    val whenText: String get() = bdWhen(daysLeft)

    fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name).put("month", month).put("day", day)
        .put("year", year ?: JSONObject.NULL).put("relation", relation).put("reminderDays", reminderDays ?: JSONObject.NULL).put("source", source)
}

data class BdGoogle24(val connected: Boolean = false, val calendarId: String? = null, val email: String? = null, val writeNew: Boolean = true, val contacts: Boolean = true,
    val syncedAt: String? = null, val configured: Boolean = true, val error: String? = null)
/** allowed = false for andre enn administrator (HA-import er bare for admin). */
data class BdHa24(val entityId: String? = null, val twoWay: Boolean = true, val syncedAt: String? = null, val allowed: Boolean = true, val error: String? = null)
data class BdCal24(val id: String, val name: String)

val BD_MN = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")
val BD_MS = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")
val BD_WD = listOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")
val BD_RELS = listOf("familie" to "Familie", "venn" to "Venn", "jobb" to "Jobb", "annet" to "Annet")
/** Påminnelse: dager før (null = ingen). */
val BD_REMS: List<Pair<Int?, String>> = listOf(0 to "Samme dag", 1 to "1 dag før", 7 to "1 uke før", null to "Ingen")
val BD_SRC = mapOf("google" to "GOOGLE", "ha" to "HOME ASSISTANT", "local" to "LOKAL")

fun bdRelColor(rel: String): Long = when (rel.lowercase()) {
    "familie" -> 0xFFB23A2A; "venn" -> 0xFF2B5D8A; "jobb" -> 0xFF2E6F75; "annet" -> 0xFFA8661A; else -> 0xFF5C5850
}
fun bdWhen(days: Int): String = when { days <= 0 -> "I dag"; days == 1 -> "I morgen"; else -> "om $days d" }

/** Neste dato for måned/dag (i dag teller som i dag). 29. februar blir 28. februar i vanlige år. */
fun bdNext(month: Int, day: Int, today: LocalDate): LocalDate {
    fun make(y: Int): LocalDate {
        val m = month.coerceIn(1, 12)
        val len = java.time.YearMonth.of(y, m).lengthOfMonth()
        return LocalDate.of(y, m, day.coerceIn(1, len))
    }
    val t = make(today.year)
    return if (t.isBefore(today)) make(today.year + 1) else t
}

/** «Lørdag 2. november» */
fun bdLong(d: LocalDate): String = "${BD_WD[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${BD_MN[d.monthValue - 1]}"

private fun relKey(s: String?): String = s?.lowercase()?.takeIf { k -> BD_RELS.any { it.first == k } } ?: "annet"

fun parseBd24(o: JSONObject): Bd24? {
    var m = o.optIntOrNull("month") ?: 0
    var d = o.optIntOrNull("day") ?: 0
    if (m == 0 || d == 0) o.optStr("date")?.split('-')?.mapNotNull { it.toIntOrNull() }?.let { p ->
        if (p.size == 3) { m = p[1]; d = p[2] } else if (p.size == 2) { m = p[0]; d = p[1] }
    }
    if (m !in 1..12 || d !in 1..31) return null
    val name = o.optStr("name") ?: return null
    val rk = if (o.has("reminderDays")) "reminderDays" else if (o.has("reminder_days")) "reminder_days" else null
    val rem: Int? = if (rk == null) 1 else if (o.isNull(rk)) null else o.optInt(rk, 1)
    return Bd24(
        o.optStr("id") ?: "$name-$m-$d", name, m, d, o.optIntOrNull("year")?.takeIf { it > 0 }, relKey(o.optStr("relation")), rem?.takeIf { it in setOf(0, 1, 7) },
        o.optStr("source")?.lowercase()?.takeIf { it in BD_SRC } ?: "local", o.optStr("avatarUrl"), o.optStr("googleEventId") ?: o.optStr("google_event_id"), o.optStr("googleUrl"),
    )
}

fun parseBdList24(raw: String): List<Bd24> {
    val t = raw.trim()
    val a: JSONArray? = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { o ->
        o.optJSONArray("items") ?: o.optJSONArray("next3") ?: o.optJSONArray("upcoming") ?: o.optJSONArray("birthdays")
            ?: o.optJSONObject("next")?.let { JSONArray().put(it) }
    }
    val out = (0 until (a?.length() ?: 0)).mapNotNull { i -> a?.optJSONObject(i)?.let(::parseBd24) }
    return bdSort(out)
}

fun bdSort(l: List<Bd24>): List<Bd24> = l.sortedWith(compareBy<Bd24> { it.daysLeft }.thenBy { it.name.lowercase() })

private fun parseCals(raw: String, idKeys: List<String>): List<BdCal24> {
    val t = raw.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("items") ?: it.optJSONArray("calendars") ?: JSONArray() }
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i)
        if (o == null) a.optString(i).takeIf { it.isNotBlank() }?.let { BdCal24(it, it) }
        else idKeys.firstNotNullOfOrNull { k -> o.optStr(k) }?.let { id -> BdCal24(id, o.optStr("summary") ?: o.optStr("name") ?: o.optStr("title") ?: o.optStr("friendly_name") ?: id) }
    }
}

/* ---------- Tilstand ---------- */

class Bd24State {
    var open by mutableStateOf(false)
    var items by mutableStateOf<List<Bd24>?>(null)
    var google by mutableStateOf(BdGoogle24())
    var ha by mutableStateOf(BdHa24())
    /** true når serveren ikke har /api/birthdays (404): lagres bare på enheten. */
    var localOnly by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var q by mutableStateOf("")
    var sel by mutableStateOf<String?>(null)
    var adding by mutableStateOf(false)
    var editId by mutableStateOf<String?>(null)
    var delArm by mutableStateOf<String?>(null)
    /** «g», «ha», «save», «sync» mens noe pågår. */
    var busy by mutableStateOf("")
    var gCals by mutableStateOf<List<BdCal24>>(emptyList())
    var haCals by mutableStateOf<List<BdCal24>>(emptyList())
    /** Tidspunkt da Google-innloggingen ble åpnet i nettleseren (0 = ingen). Siden spør serveren til den er koblet til. */
    var authAt by mutableStateOf(0L)
    internal var loadedFor: String? = null
}

/* ---------- Kall ---------- */

private fun AppViewModel.localKey() = "bd24_local_" + (account?.id ?: "")

private fun AppViewModel.loadLocal24(): List<Bd24> = runCatching { parseBdList24(prefs.str(localKey(), "[]")) }.getOrDefault(emptyList())
private fun AppViewModel.saveLocal24(l: List<Bd24>) {
    prefs.set(localKey(), JSONArray().apply { l.forEach { put(it.toJson()) } }.toString())
}

/** Bursdagene til widgetene (telefonen) og Hjem-kortet. */
private fun AppViewModel.pushWidgets24(l: List<Bd24>) {
    val ctx = getApplication<android.app.Application>()
    runCatching { no.kristo.finanshub.widget.Bd24WidgetStore.save(ctx, l) }
}

fun AppViewModel.openBirthdays24(new: Boolean = false) {
    val s = bd24
    s.open = true
    s.sel = null; s.delArm = null
    if (new) { s.adding = true; s.editId = null }
    loadBirthdays24()
}

fun AppViewModel.closeBirthdays24() {
    val s = bd24
    if (s.adding) { s.adding = false; s.editId = null; return }
    s.open = false; s.authAt = 0L
}

/** Henter listen (og Google/HA-status). quiet = Hjem-kortet: ingen feilmelding. */
fun AppViewModel.loadBirthdays24(quiet: Boolean = false) {
    val s = bd24
    val acct = account?.id
    if (s.loadedFor != acct) { s.items = null; s.loadedFor = acct; s.localOnly = false; s.google = BdGoogle24(); s.ha = BdHa24() }
    launch24a {
        try {
            val raw = api24a { hlGet("/birthdays") }
            val o = runCatching { JSONObject(raw) }.getOrNull()
            s.items = parseBdList24(raw)
            s.localOnly = false
            s.error = null
            o?.optJSONObject("google")?.let { g ->
                s.google = BdGoogle24(g.optBoolean("connected", false), g.optStr("calendarId"), g.optStr("email"), g.optBoolean("writeNew", true), g.optBoolean("contacts", true),
                    g.optStr("syncedAt"), g.optBoolean("configured", true), g.optStr("error"))
            }
            o?.optJSONObject("ha")?.let { h -> s.ha = BdHa24(h.optStr("entityId"), h.optBoolean("twoWay", true), h.optStr("syncedAt"), h.optBoolean("allowed", true), h.optStr("error")) }
                ?: run { if (o != null && !o.has("ha")) s.ha = s.ha.copy(allowed = false) }
            pushWidgets24(s.items ?: emptyList())
        } catch (e: ApiException) {
            if (e.status == 404) {
                s.localOnly = true
                s.items = bdSort(loadLocal24())
                pushWidgets24(s.items ?: emptyList())
            } else if (!quiet) s.error = e.message
        } catch (e: Exception) {
            if (!quiet) s.error = e.message ?: "Fikk ikke hentet bursdagene"
        }
    }
}

/** Skjemaet «Ny / Rediger bursdag». dest: google | ha | local. */
data class BdForm24(val name: String, val day: Int, val month: Int, val year: String, val rel: String, val rem: Int?, val dest: String)

fun AppViewModel.saveBirthday24(f: BdForm24) {
    val s = bd24
    val n = f.name.trim()
    if (n.isEmpty()) { flash("Skriv inn navn"); return }
    val y = f.year.trim().takeIf { it.length == 4 }?.toIntOrNull()
    val editId = s.editId
    val body = JSONObject().put("name", n).put("month", f.month).put("day", f.day).put("year", y ?: JSONObject.NULL)
        .put("relation", f.rel).put("reminderDays", f.rem ?: JSONObject.NULL)
    if (s.localOnly) {
        val cur = s.items ?: emptyList()
        val item = Bd24(editId ?: "l" + System.currentTimeMillis(), n, f.month, f.day, y, f.rel, f.rem, "local", null, null)
        val l = bdSort(if (editId != null) cur.map { if (it.id == editId) item.copy(avatarUrl = it.avatarUrl) else it } else cur + item)
        s.items = l; saveLocal24(l); pushWidgets24(l)
        s.adding = false; s.editId = null; s.q = ""
        flash("$n er lagret")
        return
    }
    s.busy = "save"
    launch24a {
        try {
            val r = if (editId != null) api24a { request("PATCH", "/birthdays/" + URLEncoder.encode(editId, "UTF-8"), body, prefix = Api.HOMELAB) }
            else api24a { hlPost("/birthdays", body.put("saveTo", f.dest)) }
            s.adding = false; s.editId = null; s.q = ""
            val warn = runCatching { JSONObject(r).optStr("warning") }.getOrNull()
            flash(warn ?: (n + when { editId != null -> " er oppdatert"; f.dest == "google" -> " er lagt i Google Kalender"; f.dest == "ha" -> " er lagt i Home Assistant"; else -> " er lagret" }))
            loadBirthdays24()
        } finally { s.busy = "" }
    }
}

fun AppViewModel.deleteBirthday24(b: Bd24) {
    val s = bd24
    if (s.delArm != b.id) { s.delArm = b.id; Haptics.tap(); return }
    s.delArm = null; s.sel = null
    val l = (s.items ?: emptyList()).filter { it.id != b.id }
    s.items = l
    if (s.localOnly) { saveLocal24(l); pushWidgets24(l); flash("${b.name} er slettet"); return }
    pushWidgets24(l)
    launch24a {
        api24a { hlDelete("/birthdays/" + URLEncoder.encode(b.id, "UTF-8")) }
        flash("${b.name} er slettet")
    }
}

fun AppViewModel.setReminder24(b: Bd24, days: Int?) {
    val s = bd24
    val l = (s.items ?: emptyList()).map { if (it.id == b.id) it.copy(reminderDays = days) else it }
    s.items = l
    Haptics.select()
    if (s.localOnly) { saveLocal24(l); return }
    launch24a { api24a { request("PATCH", "/birthdays/" + URLEncoder.encode(b.id, "UTF-8"), JSONObject().put("reminderDays", days ?: JSONObject.NULL), prefix = Api.HOMELAB) } }
}

/** Åpner en adresse i Custom Tab når nettleseren støtter det (uten ekstra bibliotek: protokollens SESSION-ekstra), ellers vanlig nettleser. */
fun openCustomTab24(ctx: Context, url: String) {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    i.putExtras(Bundle().apply { putBinder("android.support.customtabs.extra.SESSION", null) })
    i.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1)
    runCatching { ctx.startActivity(i) }.onFailure { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
}

private const val BD_RETURN = "finanshub://bursdager"

/**
 * «Logg inn med Google»: POST /api/birthdays/google/start {return} gir en engangs-URL (2 min) som åpnes i Custom Tab.
 * Serveren sender til finanshub://bursdager?ok=1 (eller ?error=…), som deepLink tar imot. Eldre server: auth?token=…&return=….
 * Siden spør i tillegg serveren til kontoen er koblet til, i tilfelle nettleseren ikke sender oss tilbake.
 */
fun AppViewModel.googleLogin24(ctx: Context) {
    val s = bd24
    if (s.localOnly) { flash("Google Kalender trenger en nyere Homelab-server"); return }
    if (!s.google.configured) { flash("Google Kalender er ikke satt opp. Administrator legger det inn under Integrasjoner → Google Kalender."); return }
    val tok = account?.token ?: return
    val root = base.trimEnd('/')
    s.authAt = System.currentTimeMillis()
    launch24a {
        val u = runCatching { JSONObject(api24a { hlPost("/birthdays/google/start", JSONObject().put("return", BD_RETURN)) }).optStr("url") }.getOrNull()
        val url = when {
            u == null -> "$root/api/birthdays/google/auth?token=" + URLEncoder.encode(tok, "UTF-8") + "&return=" + URLEncoder.encode(BD_RETURN, "UTF-8")
            u.startsWith("http") -> u
            else -> root + (if (u.startsWith("/")) u else "/$u")
        }
        openCustomTab24(ctx, url)
    }
}

/** finanshub://bursdager[?ok=1&google=ok | ?error=…&google=error | /new]: fra widgetene og etter Google-innloggingen. */
fun AppViewModel.birthdaysLink24(uri: Uri) {
    val new = uri.path?.trim('/') == "new"
    // Prompt 26: Google-innloggingen startes fra Innstillinger → Kalendere; da blir man stående der.
    if (new || settingsPage != "kal") openBirthdays24(new)
    val s = bd24
    val err = uri.getQueryParameter("error")
    when {
        err != null || uri.getQueryParameter("google") == "error" -> { s.authAt = 0L; flash("Fikk ikke koblet til Google" + (err?.let { ": $it" } ?: "")) }
        uri.getQueryParameter("ok") == "1" || uri.getQueryParameter("google") == "ok" -> { s.authAt = 0L; flash("Koblet til Google"); loadGoogleCals24() }
    }
}

/** Kalles hvert 3. sekund i to minutter etter innloggingen: henter status til Google er koblet til. */
fun AppViewModel.pollGoogle24() {
    val s = bd24
    if (s.authAt == 0L) return
    if (s.google.connected || System.currentTimeMillis() - s.authAt > 120_000) { if (s.google.connected) { s.authAt = 0L; flash("Koblet til Google"); loadGoogleCals24() }; return }
    loadBirthdays24(quiet = true)
}

fun AppViewModel.loadGoogleCals24() {
    if (bd24.localOnly || !bd24.google.connected) return
    launch24a { bd24.gCals = runCatching { parseCals(api24a { hlGet("/birthdays/google/calendars") }, listOf("id", "calendarId")) }.getOrDefault(emptyList()) }
}

fun AppViewModel.googleSettings24(calendarId: String? = null, writeNew: Boolean? = null, contacts: Boolean? = null) {
    val s = bd24
    val g = s.google.copy(calendarId = calendarId ?: s.google.calendarId, writeNew = writeNew ?: s.google.writeNew, contacts = contacts ?: s.google.contacts)
    s.google = g
    Haptics.select()
    launch24a {
        api24a { hlPut("/birthdays/google", JSONObject().put("calendarId", g.calendarId ?: JSONObject.NULL).put("writeNew", g.writeNew).put("contacts", g.contacts)) }
    }
}

fun AppViewModel.googleSync24() {
    val s = bd24
    if (s.busy.isNotEmpty()) return
    s.busy = "sync"
    launch24a {
        try { api24a { hlPost("/birthdays/google/sync") }; flash("Synket med Google Kalender"); loadBirthdays24() } finally { s.busy = "" }
    }
}

fun AppViewModel.googleLogout24() {
    val s = bd24
    launch24a {
        api24a { hlDelete("/birthdays/google") }
        s.google = BdGoogle24(); s.gCals = emptyList()
        flash("Logget ut av Google")
        loadBirthdays24()
    }
}

fun AppViewModel.loadHaCals24() {
    if (bd24.localOnly) return
    launch24a { bd24.haCals = runCatching { parseCals(api24a { hlGet("/birthdays/ha/calendars") }, listOf("entity_id", "entityId", "id")) }.getOrDefault(emptyList()) }
}

fun AppViewModel.haSettings24(entityId: String? = null, twoWay: Boolean? = null) {
    val s = bd24
    val h = s.ha.copy(entityId = entityId ?: s.ha.entityId, twoWay = twoWay ?: s.ha.twoWay)
    s.ha = h
    Haptics.select()
    launch24a { api24a { hlPut("/birthdays/ha", JSONObject().put("entityId", h.entityId ?: JSONObject.NULL).put("twoWay", h.twoWay)) } }
}

fun AppViewModel.haImport24() {
    val s = bd24
    if (s.localOnly) { flash("Import fra Home Assistant trenger en nyere Homelab-server"); return }
    if (s.busy.isNotEmpty()) return
    val ent = s.ha.entityId ?: s.haCals.firstOrNull()?.id
    if (ent == null) { flash("Fant ingen kalender i Home Assistant"); return }
    s.busy = "ha"
    launch24a {
        try {
            if (s.ha.entityId == null) api24a { hlPut("/birthdays/ha", JSONObject().put("entityId", ent).put("twoWay", s.ha.twoWay)) }
            val r = runCatching { JSONObject(api24a { hlPost("/birthdays/ha/import", JSONObject().put("entityId", ent)) }) }.getOrNull()
            val n = r?.optIntOrNull("imported") ?: r?.optIntOrNull("added")
            flash(if (n == null) "Importert fra $ent" else if (n == 0) "Ingen nye bursdager i $ent" else "$n bursdager importert fra $ent")
            loadBirthdays24()
        } finally { s.busy = "" }
    }
}
