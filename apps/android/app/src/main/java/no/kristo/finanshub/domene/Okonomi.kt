@file:JvmName("DomeneOkonomi")

package no.kristo.finanshub

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.viewModelScope
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.net.URLEncoder
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import org.json.JSONArray
import org.json.JSONObject

/*
 * Økonomi: kode som lå i blandingsfilene (P30.kt, P31.kt, P32b.kt, P34.kt, P37.kt, P38.kt, P39.kt, P40.kt, P46.kt, P46b.kt, P52B.kt, Mod23.kt, Mod24B.kt, Mod26B.kt, Mod27B.kt, Mod28B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av ØKONOMI-Android.
 */

/* ---------------- Finans → Mer: skjulte sider ---------------- */

/** Android-nøkler → nøklene serveren bruker (MER_KEYS.fin). */
private fun finKeyOut30(k: String) = when (k) { "sok" -> "fsok"; "liste" -> "fliste"; else -> k }

private fun finKeyIn30(k: String) = when (k) { "fsok" -> "sok"; "fliste" -> "liste"; "abonnementer" -> "abo"; else -> k }

private fun AppViewModel.finHidKey30() = "fin_more_hidden30_" + (account?.id ?: "")

fun AppViewModel.loadFinHidden30() {
    val s = p30
    val key = finHidKey30()
    if (s.finHiddenFor == key) return
    s.finHiddenFor = key
    s.finHidden = prefs.str(key, "").split(',').filter { it.isNotBlank() }
}

/** Fra GET /api/me/layout (finance_more_hidden). */
fun AppViewModel.applyLayout30(raw: String) {
    val o0 = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val o = o0.optJSONObject("layout") ?: o0
    val a = o.optJSONArray("finance_more_hidden") ?: return
    val l = a.strings().map(::finKeyIn30).filter { it.isNotBlank() && it != "innst" }.distinct()
    p30.finHidden = l
    prefs.set(finHidKey30(), l.joinToString(","))
}

fun AppViewModel.setFinHidden30(l: List<String>) {
    val v = l.filter { it != "innst" }.distinct()
    p30.finHidden = v
    prefs.set(finHidKey30(), v.joinToString(","))
    launch30 { runCatching { api30 { hlPut("/me/layout", JSONObject().put("finance_more_hidden", JSONArray(v.map(::finKeyOut30)))) } } }
}

/* ---------------- Kvitteringsmarkering ---------------- */

/** Små bokstaver uten aksenter («Tomater» → «tomater», «Crème» → «creme»). Lengden er uendret for vanlig norsk tekst. */
internal fun fold30(s: String): String {
    val keep = setOf('æ', 'ø', 'å', 'Æ', 'Ø', 'Å')
    val sb = StringBuilder()
    for (ch in s) {
        if (ch in keep) { sb.append(ch.lowercaseChar()); continue }
        val n = Normalizer.normalize(ch.toString(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
        sb.append(if (n.length == 1) n.lowercase() else ch.lowercase())
    }
    return sb.toString()
}

/** Ordene i søket som skal markeres (stoppord og korte ord utelatt). */
internal fun hlTerms30(q: String): List<String> {
    val stop = setOf("hva", "hvor", "mye", "brukte", "jeg", "på", "i", "og", "en", "et", "til", "for", "med", "av", "har", "kjøpte", "når")
    return fold30(q).split(Regex("[^\\p{L}\\p{N}]+")).filter { it.length >= 3 && it !in stop }.distinct().take(4)
}

/** Første treff i linja: [start, slutt) eller null. */
internal fun hlMatch30(line: String, terms: List<String>): IntRange? {
    if (terms.isEmpty()) return null
    val f = fold30(line)
    // Sjeldne tegn som endrer lengden: hele linja markeres (tomt område), uten egen ordmarkering.
    if (f.length != line.length) return if (terms.any { f.contains(it) }) IntRange.EMPTY else null
    for (t in terms) { val i = f.indexOf(t); if (i >= 0) return i until (i + t.length) }
    return null
}

/** Åpne en transaksjon fra Søk eller Liste med søkeordet (?hl=). */
fun AppViewModel.openTxHl30(id: Int, q: String?) {
    val t = q?.trim().orEmpty()
    val s = p30
    if (t.isNotEmpty() && hlTerms30(t).isNotEmpty()) { s.hl = t; s.hlTx = id; s.hlSeq++ } else { s.hl = null; s.hlTx = null }
    s.boxes = null; s.boxesFor = null; s.hlIdx = null
    openTx(id)
    if (s.hl != null) loadBoxes30(id)
}

fun AppViewModel.clearHl30() { p30.hl = null; p30.hlTx = null; Haptics.select() }

/** Linjene med bbox for kvitteringen (fra GET /transactions/:id). Eldre servere: ingen bbox. */
fun AppViewModel.loadBoxes30(txId: Int) {
    val s = p30
    if (s.boxesFor == txId) return
    s.boxesFor = txId
    s.hlIdx = null
    val q = s.hl?.takeIf { s.hlTx == txId }
    launch30 {
        val path = "/transactions/$txId" + (q?.let { "?hl=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: "")
        val raw = runCatching { api30 { get(path) } }.getOrNull() ?: return@launch30
        val r = runCatching { JSONObject(raw).optJSONObject("receipt") }.getOrNull() ?: return@launch30
        r.optJSONObject("highlight")?.optJSONArray("lineIndex")?.let { a -> s.hlIdx = (0 until a.length()).map { a.optInt(it, -1) }.filter { it >= 0 } }
        val a = r.optJSONArray("lines") ?: return@launch30
        val out = ArrayList<RcLine30>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val b = o.optJSONArray("bbox")
            val box = if (b != null && b.length() == 4) (0 until 4).map { b.optDouble(it, 0.0).toFloat() } else null
            out += RcLine30(o.s30("text") ?: o.s30("name") ?: o.s30("description") ?: "", if (o.has("price")) o.optDouble("price") else null, box)
        }
        if (s.boxesFor == txId) s.boxes = out
    }
}

/** «Les kvitteringen på nytt» for å få posisjoner. */
fun AppViewModel.rereadReceipt30(receiptId: String, txId: Int) {
    val s = p30
    if (s.rereading) return
    s.rereading = true
    launch30 {
        try {
            api30 { request("POST", "/receipts/$receiptId/reread", JSONObject(), read = 150_000) }
            s.boxesFor = null
            loadTxDetail(txId)
            loadBoxes30(txId)
            flash("Kvitteringen er lest på nytt")
        } catch (e: ApiException) {
            flash("Kunne ikke lese på nytt: " + glimtErr50(e, "reread30").text) // prompt 50: ikke «Feil 502»
        } finally { s.rereading = false }
    }
}

/* ---------------- Boliger: del med brukere og rediger utgift ---------------- */

fun AppViewModel.loadShareable30(homeId: Int) {
    val s = p30
    if (s.shareFor == homeId && s.shareUsers != null) return
    s.shareFor = homeId; s.shareUsers = null; s.shareSel = emptySet(); s.shareErr = ""
    launch30 {
        val raw = try { api30 { get("/users/shareable?home=$homeId") } } catch (e: ApiException) {
            s.shareErr = if (e.status == 404) "old" else (e.message ?: "")
            s.shareUsers = emptyList()
            return@launch30
        }
        val a = runCatching { JSONObject(raw).optJSONArray("users") }.getOrNull() ?: runCatching { JSONArray(raw) }.getOrNull() ?: JSONArray()
        val out = ArrayList<ShareUser30>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val id = o.s30("id") ?: continue
            val name = o.s30("name") ?: continue
            val col = o.s30("color")?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000 or it }
            out += ShareUser30(id, name, o.s30("initial") ?: name.take(1).uppercase(), col, o.s30("relation"))
        }
        if (s.shareFor == homeId) s.shareUsers = out
    }
}

fun AppViewModel.shareHome30(homeId: Int) {
    val s = p30
    val ids = s.shareSel.toList()
    if (ids.isEmpty() || s.shareBusy) return
    val names = s.shareUsers.orEmpty().filter { it.id in ids }.map { it.name }
    s.shareBusy = true
    launch30 {
        try {
            val arr = JSONArray(ids)
            val raw = try {
                api30 { post("/folders/$homeId/members", JSONObject().put("userIds", arr).put("role", s.shareRole)) }
            } catch (e: ApiException) {
                // Eldre server: én bruker per kall ({userId}).
                if (e.status != 400) throw e
                var last = ""
                for (x in ids) last = api30 { post("/folders/$homeId/members", JSONObject().put("userId", x).put("role", s.shareRole)) }
                last
            }
            applyDetail24(raw)
            s.shareUsers = s.shareUsers.orEmpty().filter { it.id !in ids }
            s.shareSel = emptySet()
            flash("Delt med " + share30Names(names))
        } catch (e: ApiException) {
            flash("Kunne ikke dele: ${e.message}")
        } finally { s.shareBusy = false }
    }
}

/** «Ingrid og Pål» / «3 personer». */
internal fun share30Names(n: List<String>): String = when (n.size) {
    0 -> ""
    1 -> n[0].substringBefore(' ')
    2 -> n[0].substringBefore(' ') + " og " + n[1].substringBefore(' ')
    else -> "${n.size} personer"
}

/** Lagre butikk/beskrivelse, beløp og dato (kalles med debounce 400 ms fra arket). */
fun AppViewModel.patchEntry30(homeId: Int, eid: Int, merchant: String?, amount: Double?, date: String?) {
    val body = JSONObject()
    merchant?.trim()?.takeIf { it.isNotEmpty() }?.let { body.put("merchant", it).put("description", it) }
    amount?.let { body.put("amount", it) }
    date?.let { body.put("date", it) }
    if (body.length() == 0) return
    launch30 {
        try { applyDetail24(api30 { patch("/folders/$homeId/entries/$eid", body) }) }
        catch (e: ApiException) { flash("Kunne ikke lagre: ${e.message}") }
    }
}

data class Trial31(
    val id: String, val service: String, val endsAt: LocalDate, val priceAfter: String, val offsets: List<Int>, val status: String,
    val cancelUrl: String?, val reminders: List<Pair<Long, Pair<String, String>>>,
)

/** Resultatet av tolkningen i «✦ Skriv det med egne ord». */
data class TrialParse31(val service: String, val endsAt: LocalDate, val price: String)

/* ---------------- Prøveperioder ---------------- */

/** Kjente tjenester (spec + fasiten), i rekkefølgen de sjekkes. */
private val TRIAL_KN31 = listOf(
    "Viaplay", "Netflix", "HBO Max", "Max", "Disney+", "Spotify", "TV 2 Play", "Storytel", "BookBeat", "Apple TV+", "Apple Music", "YouTube Premium",
    "Amazon Prime", "Audible", "Strava", "Tidal", "Duolingo", "ChatGPT", "Adobe", "Canva", "Discovery+", "SkyShowtime", "Nextory",
)

/** Kjente oppsigelseslenker (brukes når serveren ikke sender cancel_url). */
internal val TRIAL_CANCEL31 = mapOf(
    "viaplay" to "https://viaplay.no/account", "netflix" to "https://www.netflix.com/cancelplan", "hbo max" to "https://auth.max.com/subscription",
    "max" to "https://auth.max.com/subscription", "disney+" to "https://www.disneyplus.com/account/subscription", "spotify" to "https://www.spotify.com/no/account/subscription/",
    "tv 2 play" to "https://play.tv2.no/konto", "storytel" to "https://www.storytel.com/no/account", "bookbeat" to "https://www.bookbeat.com/no/account",
    "apple tv+" to "https://apps.apple.com/account/subscriptions", "apple music" to "https://apps.apple.com/account/subscriptions",
    "youtube premium" to "https://www.youtube.com/paid_memberships", "amazon prime" to "https://www.amazon.com/mc", "audible" to "https://www.audible.com/account/overview",
    "strava" to "https://www.strava.com/account", "tidal" to "https://account.tidal.com/subscription", "duolingo" to "https://www.duolingo.com/settings/subscription",
    "chatgpt" to "https://chatgpt.com/#settings/Subscription", "adobe" to "https://account.adobe.com/plans", "canva" to "https://www.canva.com/settings/billing-and-teams",
    "discovery+" to "https://www.discoveryplus.com/no/account", "skyshowtime" to "https://www.skyshowtime.com/no/account", "nextory" to "https://www.nextory.no/konto",
)

/** Tolker «Viaplay gratis i 14 dager, påminn meg» / «Storytel prøve til 25.11, 179 kr» (TRP() i fasiten). */
fun parseTrial31(txt: String, today: LocalDate = LocalDate.now(OSLO31)): TrialParse31? {
    val raw = txt.trim()
    if (raw.isEmpty()) return null
    val t = raw.lowercase()
    var end: LocalDate? = null
    Regex("(\\d+)\\s*(dager|dag|døgn|uker|uke|måneder|måned|mnd)").find(t)?.let { m ->
        val n = m.groupValues[1].toLong()
        val u = m.groupValues[2]
        end = when { u.startsWith("uke") -> today.plusWeeks(n); u.startsWith("mån") || u == "mnd" -> today.plusMonths(n); else -> today.plusDays(n) }
    }
    if (end == null) Regex("(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?").find(t)?.let { m ->
        val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it }
        val d = runCatching { LocalDate.of(y ?: today.year, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()
        end = if (d != null && y == null && d.isBefore(today)) d.plusYears(1) else d
    }
    if (end == null && Regex("en måned|1 måned|månedlig prøve").containsMatchIn(t)) end = today.plusMonths(1)
    if (end == null && Regex("\\ben uke\\b").containsMatchIn(t)) end = today.plusWeeks(1)
    val e = end ?: return null
    var n = TRIAL_KN31.firstOrNull { t.contains(it.lowercase()) }
    if (n == null) {
        val skip = setOf("gratis", "påminn", "prøve", "prøveperiode", "minn", "husk", "jeg", "si")
        n = raw.split(Regex("\\s+")).firstOrNull { w -> w.firstOrNull()?.let { it.isUpperCase() } == true && w.lowercase().trim(',', '.', ':', '!') !in skip }?.replace(Regex("[,.:!]"), "")
    }
    if (n.isNullOrBlank()) return null
    val pm = Regex("(\\d+[.,]?\\d*)\\s*(kr|,-)", RegexOption.IGNORE_CASE).find(raw)
    return TrialParse31(n, e, pm?.let { it.groupValues[1] + " kr/mnd" } ?: "")
}

/** Varseltidene på enheten: ends_at − offset kl. 09:00 Europe/Oslo og siste varsel kl. 18:00 på sluttdagen. */
fun trialTimes31(t: Trial31): List<Pair<Long, Pair<String, String>>> {
    if (t.reminders.isNotEmpty()) return t.reminders
    val out = ArrayList<Pair<Long, Pair<String, String>>>()
    val price = t.priceAfter.ifBlank { "å betale" }
    val body = "Avslutt før ${dShort31(t.endsAt)} for å slippe $price. Trykk for å åpne oppsigelsessiden."
    for (d in t.offsets.distinct().sorted()) {
        val at = t.endsAt.minusDays(d.toLong()).atTime(LocalTime.of(9, 0)).atZone(OSLO31).toInstant().toEpochMilli()
        val ti = t.service + "-prøven " + when (d) { 0 -> "slutter i dag"; 1 -> "slutter i morgen"; else -> "slutter om $d dager" }
        out += at to (ti to body)
    }
    val last = t.endsAt.atTime(LocalTime.of(18, 0)).atZone(OSLO31).toInstant().toEpochMilli()
    out += last to ("${t.service}-prøven slutter i dag" to "Siste sjanse: avslutt i dag for å slippe $price.")
    return out
}

internal fun parseTrials31(raw: String): List<Trial31> {
    val tr = raw.trim()
    val a = runCatching { if (tr.startsWith("[")) JSONArray(tr) else JSONObject(tr).let { it.optJSONArray("trials") ?: it.optJSONArray("items") } }.getOrNull() ?: return emptyList()
    val out = ArrayList<Trial31>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val id = o.s31("id") ?: continue
        val end = (o.s31("ends_at") ?: o.s31("endsAt"))?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: continue
        val offs = (o.optJSONArray("remind_offsets_days") ?: o.optJSONArray("remindOffsetsDays"))?.let { x -> (0 until x.length()).map { x.optInt(it) } }
            ?: runCatching { JSONArray(o.optString("remind_offsets_days")).let { x -> (0 until x.length()).map { x.optInt(it) } } }.getOrNull() ?: listOf(1)
        val price = o.opt("price_after").let { v -> when (v) { is Number -> "${v.toInt()} kr/mnd"; is String -> v; else -> "" } }
        val rem = ArrayList<Pair<Long, Pair<String, String>>>()
        (o.optJSONArray("reminders") ?: o.optJSONArray("notifications") ?: o.optJSONArray("notify_at"))?.let { x ->
            for (k in 0 until x.length()) {
                val r = x.optJSONObject(k) ?: continue
                val at = r.opt("at").let { v -> when (v) { is Number -> v.toLong(); is String -> runCatching { java.time.OffsetDateTime.parse(v).toInstant().toEpochMilli() }.getOrNull(); else -> null } } ?: continue
                rem += at to ((r.s31("title") ?: "${o.s31("service")}-prøven slutter snart") to (r.s31("body") ?: ""))
            }
        }
        val svc = o.s31("service") ?: o.s31("name") ?: "Prøve"
        out += Trial31(id, svc, end, price, offs, o.s31("status") ?: "active", o.s31("cancel_url") ?: o.s31("cancelUrl") ?: TRIAL_CANCEL31[svc.lowercase()], rem)
    }
    return out
}

fun AppViewModel.loadTrials31() {
    val s = p31
    launch31 {
        val raw = try { api31 { get("/subscriptions/trials") } } catch (e: ApiException) {
            if (e.status == 404) s.trialsMissing = true
            return@launch31
        } catch (e: Exception) { return@launch31 }
        s.trialsMissing = false
        s.trials = parseTrials31(raw)
        Notify31.scheduleTrials(appCtx29, s.trials)
        trialMeta32b(raw) // prompt 32: startdato (fremdrift) og widgetene (widget/Trials32bWidgets.kt)
    }
}

/** «Fyll ut»: tolker teksten og fyller feltene. */
fun AppViewModel.fillTrial31() {
    val s = p31
    val r = parseTrial31(s.tai)
    if (r == null) { s.trialErr = "Fant ikke tjeneste eller dato"; Haptics.error(); return }
    s.tn = r.service; s.te = r.endsAt; if (r.price.isNotBlank()) s.tp = r.price
    s.trialErr = ""
    Haptics.select()
}

fun AppViewModel.resetTrialForm31() { val s = p31; s.tn = ""; s.te = null; s.tp = ""; s.tai = ""; s.trem = setOf(1); s.trialErr = "" }

/** «Lagre påminnelse». */
fun AppViewModel.saveTrial31(done: () -> Unit) {
    val s = p31
    val end = s.te
    if (s.tn.isBlank() || end == null) { s.trialErr = "Fyll inn tjeneste og sluttdato"; Haptics.error(); return }
    if (s.trialBusy) return
    s.trialBusy = true; s.trialErr = ""
    val price = s.tp.trim()
    val pNum = Regex("(\\d+[.,]?\\d*)").find(price)?.groupValues?.get(1)?.replace(',', '.')?.toDoubleOrNull()
    val body = JSONObject().put("service", s.tn.trim()).put("ends_at", end.toString()).put("remind_offsets_days", JSONArray(s.trem.sorted()))
        .put("price_after", pNum ?: JSONObject.NULL).put("price_text", price)
    launch31 {
        try {
            api31 { post("/subscriptions/trials", body) }
            flash("Påminnelse lagret · ${s.tn.trim()}")
            Haptics.success()
            resetTrialForm31()
            loadTrials31()
            done()
        } catch (e: ApiException) {
            s.trialErr = if (e.status == 404) "Serveren har ikke prøveperioder ennå. Oppdater Nordlys OS." else (e.message ?: "Kunne ikke lagre")
            Haptics.error()
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { s.trialErr = uiErr73(e, "Fikk ikke kontakt med serveren") }
        finally { s.trialBusy = false }
    }
}

/** Behold (blir vanlig abonnement) / Avsluttet / Minn meg i morgen. */
fun AppViewModel.patchTrial31(id: String, status: String?, snooze: Boolean = false) {
    launch31 {
        try {
            api31 { patch("/subscriptions/trials/" + URLEncoder.encode(id, "UTF-8"), if (snooze) JSONObject().put("snooze", "tomorrow") else JSONObject().put("status", status)) }
            loadTrials31()
            if (status == "kept") loadSubs()
        } catch (e: ApiException) { flash("Kunne ikke lagre: ${e.message}") }
    }
}

/** «Prøve · 12 dager igjen» */
fun trialLeft31(t: Trial31, today: LocalDate = LocalDate.now(OSLO31)): String {
    val d = java.time.temporal.ChronoUnit.DAYS.between(today, t.endsAt)
    return when { d < 0 -> "Prøven er over"; d == 0L -> "Prøve · slutter i dag"; d == 1L -> "Prøve · 1 dag igjen"; else -> "Prøve · $d dager igjen" }
}

/* ---------------- Prøveperioder ---------------- */

/** Startdatoen per prøve (start, started_at eller created), for fremdriften i Hjem-widgeten og widgetene. */
fun AppViewModel.trialMeta32b(raw: String) {
    val tr = raw.trim()
    val a = runCatching { if (tr.startsWith("[")) JSONArray(tr) else JSONObject(tr).let { it.optJSONArray("trials") ?: it.optJSONArray("items") } }.getOrNull() ?: return
    val m = HashMap<String, LocalDate>()
    for (i in 0 until a.length()) {
        val o = a.optJSONObject(i) ?: continue
        val id = o.optStr("id") ?: continue
        trialStartOf32b(o)?.let { m[id] = it }
    }
    p32b.trialStart = m
    runCatching { no.kristo.finanshub.widget.Trials32bStore.saveRaw(appCtx29, raw, account?.id) }
    runCatching { no.kristo.finanshub.widget.Trials32bWidgets.refreshNow(appCtx29) }
}

/** start / startAt / started_at (dato) eller created (ms eller ISO). */
fun trialStartOf32b(o: JSONObject): LocalDate? {
    (o.optStr("start") ?: o.optStr("startAt") ?: o.optStr("started_at") ?: o.optStr("startsAt"))?.let { s -> runCatching { LocalDate.parse(s.take(10)) }.getOrNull()?.let { return it } }
    val c = o.opt("created") ?: o.opt("created_at") ?: o.opt("createdAt")
    return when (c) {
        is Number -> runCatching { Instant.ofEpochMilli(c.toLong()).atZone(ZoneId.of("Europe/Oslo")).toLocalDate() }.getOrNull()
        is String -> runCatching { LocalDate.parse(c.take(10)) }.getOrNull()
        else -> null
    }
}

/** Domener for logoene (samme som fasiten), ellers navnet + .com. */
private val TRIAL_DOM32B = mapOf(
    "viaplay" to "viaplay.no", "netflix" to "netflix.com", "hbo max" to "max.com", "max" to "max.com", "disney+" to "disneyplus.com", "spotify" to "spotify.com",
    "tv 2 play" to "tv2.no", "storytel" to "storytel.com", "bookbeat" to "bookbeat.com", "apple tv+" to "tv.apple.com", "apple music" to "music.apple.com",
    "youtube premium" to "youtube.com", "amazon prime" to "amazon.com", "audible" to "audible.com", "strava" to "strava.com", "tidal" to "tidal.com",
    "chatgpt" to "openai.com", "duolingo" to "duolingo.com", "adobe" to "adobe.com", "canva" to "canva.com", "discovery+" to "discoveryplus.com",
    "skyshowtime" to "skyshowtime.com", "nextory" to "nextory.no",
)

fun trialDomain32b(name: String): String = TRIAL_DOM32B[name.trim().lowercase()] ?: (name.trim().lowercase().replace(Regex("[^a-z0-9æøå]+"), "") + ".com")

/** Dager igjen (0 = siste dag). */
fun trialDays32b(end: LocalDate, today: LocalDate = LocalDate.now(OSLO31)): Int = ChronoUnit.DAYS.between(today, end).toInt()

/** Andel av prøven som er brukt (4–100 %). Uten startdato regnes 14 dager. */
fun trialPct32b(end: LocalDate, start: LocalDate?, today: LocalDate = LocalDate.now(OSLO31)): Float {
    val st = start ?: end.minusDays(14)
    val tot = maxOf(1L, ChronoUnit.DAYS.between(st, end))
    val left = maxOf(0L, ChronoUnit.DAYS.between(today, end))
    return ((tot - left).toFloat() / tot).coerceIn(.04f, 1f)
}

/** ≤ 2 dager rød, ≤ 7 oransje, ellers null (tekstfarge). */
fun trialColor32b(days: Int): Long? = when { days <= 2 -> 0xFFB23A2A; days <= 7 -> 0xFFA8661A; else -> null }

/* ---------------- Kvitteringer under AI-analyse ---------------- */

data class RcAi34(
    val id: String, val file: String, val thumb: String?, val model: String?, val pct: Int, val step: Int, val steps: List<String>,
    val store: String?, val sum: Double?, val lines: Int?, val category: String?, val confidence: Int?, val chatId: String?, val status: String,
)

private val RC_KEYS34 = listOf("upload", "read", "fields", "lines", "category")

val RC_STEPS34 = listOf("Lastet opp", "Leser bildet", "Finner butikk, dato og sum", "Leser varelinjer", "Foreslår kategori")

internal fun parseRcAi34(o: JSONObject): RcAi34? {
    val id = s34(o, "receiptId", "id") ?: return null
    val st = s34(o, "status", "state") ?: return null
    if (st !in setOf("pending", "processing", "running", "queued", "analyzing")) return null
    val pct = (n34(o, "progress", "pct") ?: 0.0).toInt().coerceIn(0, 99)
    val p = o.optJSONObject("partial") ?: JSONObject()
    val steps = arr34(o, "steps")?.let { a -> (0 until a.length()).mapNotNull { i -> when (val x = a.opt(i)) { is JSONObject -> s34(x, "label", "t", "name"); is String -> x; else -> null } } }?.takeIf { it.isNotEmpty() } ?: RC_STEPS34
    val doneSteps = arr34(o, "steps")?.let { a -> (0 until a.length()).count { i -> (a.opt(i) as? JSONObject)?.let { s34(it, "state") == "done" } == true } }
    // step er en nøkkel (upload | read | fields | lines | category) fra /receipts/analyzing, et tall, eller regnes ut fra fremdriften.
    val keyIdx = s34(o, "step")?.let { k -> RC_KEYS34.indexOf(k).takeIf { it >= 0 } }
    val doneN = arr34(o, "steps")?.let { a -> (0 until a.length()).count { i -> (a.opt(i) as? JSONObject)?.let { b34(it, "done") == true } == true } }
    val step = (keyIdx ?: n34(o, "stepIndex")?.toInt() ?: doneSteps?.takeIf { it > 0 } ?: doneN?.takeIf { it > 0 } ?: if (st == "pending" || st == "queued") 1 else (1 + pct / 25).coerceAtMost(steps.size - 1)).coerceIn(0, steps.size)
    return RcAi34(
        id, s34(o, "file", "name", "filename") ?: "Kvittering", s34(o, "thumb"), s34(o, "model", "engine"), pct, step, steps,
        s34(p, "store", "merchant") ?: s34(o, "merchant"), n34(p, "sum", "total") ?: n34(o, "total"), n34(p, "lines", "items")?.toInt(),
        s34(p, "category", "cat"), (n34(p, "confidence", "conf"))?.let { if (it <= 1.0) (it * 100).toInt() else it.toInt() }, s34(o, "chatId", "chat_id"), st,
    )
}

/* ---------------- Kvitteringer under AI-analyse ---------------- */

fun AppViewModel.loadRcAi34() {
    val s = p34
    if (s.rcPoll?.isActive == true) return
    s.rcPoll = launchJob34 {
        var idle = 0
        while (idle < 2) {
            // SERVER34: GET /finans/api/receipts/analyzing → {count, items:[…]}; eldre server: /receipts/jobs.
            val raw = runCatching { api34 { get("/receipts/analyzing") } }.getOrNull() ?: runCatching { api34 { get("/receipts/jobs") } }.getOrNull()
            if (raw != null) {
                val l = runCatching { list34(raw, "items", "jobs") }.getOrDefault(emptyList()).mapNotNull(::parseRcAi34)
                val gone = s.rcAi.filter { o -> l.none { it.id == o.id } }
                s.rcAi = l
                if (gone.isNotEmpty()) {
                    // Ferdig: bokført eller til godkjenning. Toast og dobbel haptikk.
                    val g = gone.first()
                    flash("✦ Kvittering lest · " + (g.store ?: g.file))
                    Haptics.success(); delay(140); Haptics.success()
                    runCatching { refreshReceipts34() }
                }
                if (l.isEmpty()) idle++ else idle = 0
            } else idle++
            delay(1500)
        }
    }
}

fun AppViewModel.cancelRcAi34(r: RcAi34) {
    val s = p34
    Haptics.select()
    s.rcAi = s.rcAi.filter { it.id != r.id }
    launch34 {
        val ok = runCatching { api34 { post("/receipts/${r.id}/cancel-ai", JSONObject()) } }.isSuccess ||
            runCatching { api34 { request("POST", "/ai/jobs/" + enc34(r.id) + "/cancel", JSONObject(), prefix = Api.HOMELAB) } }.isSuccess
        flash(if (ok) "Analysen er stoppet" else "Fikk ikke stoppet analysen")
        runCatching { refreshReceipts34() }
    }
}

/** «Følg i Chat ›»: samtalen i mappen «Kvitteringer og skanninger». */
fun AppViewModel.followRcChat34(r: RcAi34) {
    Haptics.tap()
    openChat()
    val id = r.chatId
    if (id != null) openChatId27(id)
    else {
        val f = p34.scanFolder
        if (f != null) chat27.folderOpen = chat27.folderOpen + (f.id to true)
        chat27.drawer = true
    }
}

/* ======================= Delte abonnementer ======================= */

data class SubMember37(val userId: String, val name: String, val color: Long?)

internal fun subMembers37(a: JSONArray?): List<SubMember37> = objs34(a).mapNotNull { m ->
    SubMember37(m.s37("userId") ?: m.s37("id") ?: return@mapNotNull null, m.s37("name") ?: m.s37("username") ?: "", hex37(m.s37("color")))
}

/* ======================= Subscription OS ======================= */

private fun AppViewModel.subHidKey37() = "sub_home_hid37_" + acct37()

fun AppViewModel.loadSubHid37() {
    val s = p37
    val k = subHidKey37()
    if (s.subHidFor == k) return
    s.subHidFor = k
    s.subHid = prefs.str(k, "").split(',').filter { it.isNotBlank() }
    launch37 {
        val raw = runCatching { api37 { hlGet("/me/layout") } }.getOrNull() ?: return@launch37
        val a = runCatching { JSONObject(raw).optJSONArray("subHomeHid") }.getOrNull() ?: return@launch37
        if (s.subHidFor != k) return@launch37
        s.subHid = strs37(a)
        prefs.set(k, s.subHid.joinToString(","))
    }
}

fun AppViewModel.setSubHid37(l: List<String>) {
    val v = l.distinct()
    p37.subHid = v
    prefs.set(subHidKey37(), v.joinToString(","))
    launch37 { runCatching { api37 { hlPut("/me/layout", JSONObject().put("subHomeHid", JSONArray(v))) } } }
}

/** Del med husstanden: medlemmer (userId), lik deling eller «jeg betaler». */
fun AppViewModel.shareSub37(id: Int, members: List<String>, split: String, payerId: String?) {
    val s = p37
    s.subShareBusy = true
    launch37 {
        try {
            api37 { put("/subscriptions/$id/members", JSONObject().put("members", JSONArray(members)).put("split", split).put("payerId", payerId ?: JSONObject.NULL)) }
            loadSubs()
            Haptics.success()
        } catch (e: ApiException) {
            flash(when (e.status) { 404, 405 -> "Serveren kan ikke dele abonnementer ennå"; 403 -> "Bare eier og betaler kan endre delingen"; else -> "Fikk ikke delt: ${e.message}" })
        } catch (e: CancellationException) { throw e } catch (e: Exception) { flash("Fikk ikke delt") } finally { s.subShareBusy = false }
    }
}

fun AppViewModel.leaveSub37(id: Int) = launch37 {
    try { api37 { post("/subscriptions/$id/leave") }; loadSubs(); m23.subEditId = null; flash("Du har forlatt abonnementet") }
    catch (e: ApiException) { flash("Fikk ikke forlatt: ${e.message}") }
}

/** Din del per måned (lik deling = pris / antall; «jeg betaler» = hele hos betaleren, 0 hos de andre). */
fun AppViewModel.myShare37(s: SubItem): Double {
    s.myShare?.let { return it }
    if (!s.shared) return s.monthly
    return when (s.split) {
        "payer" -> if (s.payerId != null && s.payerId == p37.myId) s.monthly else 0.0
        else -> s.monthly / s.members.size.coerceAtLeast(1)
    }
}

/* ======================= Mer → Subscription OS ======================= */

/** Åpnet fra Mer (hovedmenyen): tilbake går til Mer, ikke til Finans → Mer. */
fun AppViewModel.openSubFromMer38() { openFromMer(Screen.Sub); paperFin = false }

/* ======================= Kvitteringer: «✦ På nytt» med fremdrift ======================= */

/** Jobben for én kvittering: steg (upload | ocr | llm | verify | done | error), prosent og tekst. */
data class Re39(
    val jobId: String?, val step: String, val pct: Int, val msg: String?, val engine: String,
    val error: Boolean = false, val done: Boolean = false, val cancelled: Boolean = false,
) {
    val running: Boolean get() = !error && !done
}

/** Stegene i panelet (claude-code-kvittering-pa-nytt-fremdrift.md). */
val RE_STEPS39 = listOf("upload" to "Laster opp bildet", "ocr" to "Leser teksten (OCR)", "llm" to "✦ {motor} tolker butikk, linjer og beløp", "verify" to "Sjekker sum og dato")

private fun AppViewModel.setRe39(id: String, f: (Re39?) -> Re39?) {
    val n = f(p39.re[id])
    p39.re = if (n == null) p39.re - id else p39.re + (id to n)
}

/**
 * POST /finans/api/receipts/:id/reanalyze {engine, async:true} → {jobId}; fremdriften kommer som «job» i sanntid og fra
 * GET /finans/api/jobs/:id (hvert sekund). Eldre server: svarer synkront ({candidateId, result}) – da tas resultatet i bruk
 * direkte. Mangler endepunktet (404): kvitteringen legges i køen som før (reprocess).
 */
fun AppViewModel.reanalyze39(id: String, engine: String = "ollama") { // prompt 52: Gemini er fjernet fra kvitteringslesingen
    if (p39.re[id]?.running == true) return
    val label = if (engine == "tesseract") "Lokal OCR" else "Lokal AI"
    Haptics.tap()
    setRe39(id) { Re39(null, "upload", 2, "Laster opp bildet", label) }
    launch39 {
        val raw = try {
            api39 { request("POST", "/receipts/$id/reanalyze", JSONObject().put("engine", engine).put("async", true), read = 120_000) }
        } catch (e: ApiException) {
            if (e.status == 404 && e.code != "bilde_mangler") { // prompt 50: 404 bilde_mangler er ikke «gammel server»
                setRe39(id) { null }
                runCatching { api39 { post("/receipts/$id/reprocess") } }
                message = "✦ Glimt leser lokalt på nytt"
                runCatching { loadReceipts(); loadJobs() }
            } else setRe39(id) { (it ?: Re39(null, "upload", 0, null, label)).copy(step = "error", error = true, msg = glimtErr50(e, "reanalyze39").text) } // prompt 50
            return@launch39
        }
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
        // Synkront svar (server uten async): ta i bruk det nye resultatet.
        o.optStr("candidateId")?.let { cand ->
            runCatching { api39 { post("/receipts/$id/reanalyze/apply", JSONObject().put("candidateId", cand).put("keep", "new")) } }
            val conf = o.optJSONObject("result")?.optDouble("confidence", Double.NaN) ?: Double.NaN
            finishRe39(id, conf, emptyList())
            return@launch39
        }
        val job = o.optStr("jobId") ?: run { setRe39(id) { it?.copy(step = "error", error = true, msg = "✕ $label svarte ikke") }; return@launch39 }
        setRe39(id) { (it ?: Re39(job, "upload", 5, null, label)).copy(jobId = job, pct = maxOf(it?.pct ?: 0, 5)) }
        var misses = 0
        while (true) {
            kotlinx.coroutines.delay(1000)
            val cur = p39.re[id] ?: return@launch39
            if (cur.jobId != job || !cur.running) return@launch39
            val j = runCatching { JSONObject(api39 { get("/jobs/$job") }) }.getOrNull()
            if (j == null) { if (++misses > 90) { setRe39(id) { it?.copy(step = "error", error = true, msg = "✕ Fikk ikke svar fra serveren") }; return@launch39 }; continue }
            misses = 0
            if (jobUpdate39(id, j)) return@launch39
        }
    }
}

/** Oppdaterer fra jobben (GET /jobs/:id). true = ferdig (bra eller feil). */
private suspend fun AppViewModel.jobUpdate39(id: String, j: JSONObject): Boolean {
    val status = j.optStr("status") ?: "running"
    val step = j.optStr("step")
    val pct = if (j.has("pct")) j.optInt("pct") else null
    when {
        status == "done" || step == "done" -> {
            val r = j.optJSONObject("result")
            if (r != null && !r.optBoolean("applied", false)) r.optStr("candidateId")?.let { cand ->
                runCatching { api39 { post("/receipts/$id/reanalyze/apply", JSONObject().put("candidateId", cand).put("keep", "new")) } }
            }
            val ch = r?.optJSONArray("changed")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
            finishRe39(id, r?.optDouble("confidence", Double.NaN) ?: Double.NaN, ch)
            return true
        }
        status == "cancelled" -> { cancelledRe39(id); return true }
        status == "error" || step == "error" -> {
            setRe39(id) { it?.copy(step = "error", error = true, msg = j.optStr("melding") ?: j.optStr("msg") ?: j.optStr("error") ?: "✕ ${it.engine} svarte ikke") } // prompt 50: «melding»
            return true
        }
        else -> setRe39(id) { it?.copy(step = step ?: it.step, pct = maxOf(it.pct, pct ?: it.pct), msg = j.optStr("msg") ?: it.msg) }
    }
    return false
}

/** Sanntid «job» {jobId, kind:'reanalyze', receiptId, step, pct, msg}: fremdriften vises med en gang (pollingen tar slutten). */
fun AppViewModel.onJob39(msg: JSONObject) {
    if ((msg.optStr("kind") ?: "reanalyze") != "reanalyze") return
    val id = msg.optStr("receiptId") ?: p39.re.entries.firstOrNull { it.value.jobId == msg.optStr("jobId") }?.key ?: return
    val cur = p39.re[id] ?: return
    if (!cur.running) return
    val step = msg.optStr("step") ?: return
    if (step == "done" || step == "error") return
    setRe39(id) { it?.copy(step = step, pct = maxOf(it.pct, msg.optInt("pct", it.pct)), msg = msg.optStr("msg") ?: it.msg) }
}

private suspend fun AppViewModel.finishRe39(id: String, conf: Double, changed: List<String>) {
    val pct = if (conf.isNaN()) null else Math.round(if (conf <= 1.0) conf * 100 else conf).toInt()
    setRe39(id) { (it ?: Re39(null, "done", 100, null, "Lokal AI")).copy(step = "done", pct = 100, done = true, msg = "✦ Glimt har analysert på nytt") }
    Haptics.success()
    message = "✦ Glimt har analysert på nytt" + (pct?.let { " · $it % sikker" } ?: "")
    // Raden markeres i 2 s (endrede felt: ${changed.joinToString()}; eldre server sier ikke hvilke).
    p39.reFlash = p39.reFlash + (id to System.currentTimeMillis())
    runCatching { loadReceipts(); loadJobs() }
    kotlinx.coroutines.delay(2200)
    if (p39.re[id]?.done == true) setRe39(id) { null }
    p39.reFlash = p39.reFlash - id
}

private suspend fun AppViewModel.cancelledRe39(id: String) {
    setRe39(id) { it?.copy(step = "error", error = true, cancelled = true, msg = "Avbrutt · ingenting ble endret") }
    kotlinx.coroutines.delay(3000)
    if (p39.re[id]?.cancelled == true) setRe39(id) { null }
}

/** Avbryt: POST …/reanalyze/:jobId/cancel (eldre: DELETE /jobs/:id). */
fun AppViewModel.cancelRe39(id: String) {
    val job = p39.re[id]?.jobId
    Haptics.select()
    launch39 {
        if (job != null) {
            val ok = runCatching { api39 { post("/receipts/$id/reanalyze/$job/cancel") } }.isSuccess
            if (!ok) runCatching { api39 { delete("/jobs/$job") } }
        }
        cancelledRe39(id)
    }
}

/* ======================= Finans: lagt til, les på nytt, rediger alt ======================= */

/** «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian» og «Sist endret … av Ingrid». */
data class Added40(val line: String, val edited: String?)

internal val OSLO40: ZoneId = ZoneId.of("Europe/Oslo")

private fun when40(raw: String?): String? {
    raw ?: return null
    val z = runCatching { java.time.Instant.parse(raw).atZone(OSLO40) }.getOrNull()
        ?: runCatching { java.time.OffsetDateTime.parse(raw).atZoneSameInstant(OSLO40) }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(raw.replace(' ', 'T').take(19)).atZone(OSLO40) }.getOrNull()
        ?: raw.toLongOrNull()?.let { java.time.Instant.ofEpochMilli(if (it < 10_000_000_000L) it * 1000 else it).atZone(OSLO40) }
        ?: return null
    return "%02d.%02d.%d kl. %02d.%02d".format(z.dayOfMonth, z.monthValue, z.year, z.hour, z.minute)
}

private fun via40(source: String?, label: String?): String? = label?.takeIf { it.isNotBlank() } ?: when (source) {
    "scan" -> "skannet kvittering"; "bank", "bank_import" -> "bankimport"; "manual" -> "lagt inn manuelt"; "email" -> "fra e-post"
    "import" -> "importert"; "glimt" -> "lagt til av Glimt fra chat"; "shortcut" -> "via iOS Snarvei"; "api" -> "via API-nøkkel"
    else -> null
}

/** Leser `added:{at, by, byName, source, sourceLabel}` (+ `history` / `updated_*`) fra transaksjonen eller kvitteringen. */
fun added40(o: JSONObject?): Added40? {
    o ?: return null
    val a = o.optJSONObject("added")
    val at = when40(a?.s37("at") ?: o.s37("createdAt") ?: o.s37("created_at")) ?: return null
    val src = a?.s37("source") ?: o.s37("createdVia") ?: o.s37("created_via")
    val by = a?.s37("byName") ?: a?.s37("by")?.takeIf { !it.matches(Regex("[0-9a-f-]{20,}")) } ?: o.s37("createdByName")
    val line = listOfNotNull("Lagt til $at", via40(src, a?.s37("sourceLabel")), by?.takeIf { src != "bank" && src != "bank_import" }).joinToString(" · ")
    val h = o.optJSONArray("history")
    val last = h?.optJSONObject(h.length() - 1)
    val edAt = when40(last?.s37("at") ?: o.s37("updatedAt") ?: o.s37("updated_at"))
    val edBy = last?.let { it.s37("byName") ?: it.s37("by") } ?: o.s37("updatedByName")
    val edited = if (edAt != null && (h != null || o.has("updatedBy") || o.has("updatedByName"))) "Sist endret $edAt" + (edBy?.let { " av $it" } ?: "") else null
    return Added40(line, edited)
}

/** Rå detaljsvar per transaksjon (for «Lagt til»-linjene). */
fun AppViewModel.loadAdded40(id: Int, cb: (Added40?, Added40?) -> Unit) {
    launch40 {
        val raw = runCatching { api40 { get("/transactions/$id") } }.getOrNull() ?: return@launch40
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch40
        val tx = o.optJSONObject("tx") ?: o
        cb(added40(tx), added40(o.optJSONObject("receipt")))
    }
}

data class Change40(val field: String, val old: String, val new: String)

data class Reread40(val receiptId: String, val busy: Boolean, val changes: List<Change40>, val candidateId: String?, val text: String?, val sumOk: Boolean?, val error: String?,
    /** Prompt 50: hva slags feil (SLOW gir «Les mindre versjon»), når lesingen startet (fremdrift «Leser … 12 s») og om det var mindre versjon. */
    val kind50: GlimtErrKind50? = null, val started50: Long = 0L, val small50: Boolean = false)

private fun nok40(v: Double?): String = v?.let { String.format(java.util.Locale("nb", "NO"), "%,.2f", it).replace(',', ' ').replace('.', ',').replace(' ', ' ') + " kr" } ?: "–"

/**
 * «✦ La Glimt lese kvitteringen på nytt»: POST /finans/api/receipts/:id/reanalyze {engine, async:true, apply:false} → jobb →
 * {previous, result, candidateId}. Endringene vises som «gammelt → nytt»; ingenting lagres før «Bruk endringene».
 */
fun AppViewModel.reread40(txId: Int, receiptId: String, engine: String = "gemini", small: Boolean = false) {
    val s = p40
    if (s.rr[txId]?.busy == true) return
    Haptics.tap()
    s.rr = s.rr + (txId to Reread40(receiptId, true, emptyList(), null, null, null, null, started50 = System.currentTimeMillis(), small50 = small))
    launch40 {
        // Prompt 50: tydelige meldinger i stedet for «Feil 502» (GlimtErr50.kt).
        fun fail(e: GlimtErr50) { s.rr = s.rr + (txId to Reread40(receiptId, false, emptyList(), null, null, null, e.text, kind50 = e.kind, small50 = small)) }
        fun fail(m: String) = fail(GlimtErr50(m, GlimtErrKind50.OTHER))
        try {
            val body = JSONObject().put("engine", engine).put("async", true).put("apply", false)
            if (small) body.put("small", true).put("maxSide", 1024) // «Les mindre versjon»
            val first = JSONObject(api40 { request("POST", "/receipts/$receiptId/reanalyze", body, read = 120_000) })
            var res: JSONObject? = if (first.has("result") || first.has("candidateId")) first else null
            val job = first.s37("jobId")
            var n = 0
            while (res == null && job != null && n++ < 180) {
                delay(1000)
                val j = runCatching { JSONObject(api40 { get("/jobs/$job") }) }.getOrNull() ?: continue
                val st = j.s37("status") ?: "running"
                if (st == "done" || j.s37("step") == "done") res = j.optJSONObject("result") ?: JSONObject()
                else if (st == "error" || st == "cancelled" || j.s37("step") == "error") { fail(glimtJobErr50(j)); return@launch40 }
            }
            val r = res ?: run { fail(glimtErr50(504, "timeout", "jobben ble ikke ferdig", "reread40")); return@launch40 }
            val prev = r.optJSONObject("previous") ?: JSONObject()
            val now = r.optJSONObject("result") ?: JSONObject()
            val ch = ArrayList<Change40>()
            r.optJSONArray("changes")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { c -> ch += Change40(c.optString("field"), c.optString("old"), c.optString("new")) } }
            if (ch.isEmpty()) {
                fun cmp(label: String, a: String?, b: String?) { if (b != null && a != b) ch += Change40(label, a ?: "–", b) }
                cmp("Butikk", prev.s37("merchant"), now.s37("merchant"))
                cmp("Dato", prev.s37("date"), now.s37("date"))
                val pt = prev.optDouble("total", Double.NaN).takeIf { !it.isNaN() }
                val nt = now.optDouble("total", Double.NaN).takeIf { !it.isNaN() }
                if (nt != null && (pt == null || kotlin.math.abs(pt - nt) > 0.004)) ch += Change40("Beløp", nok40(pt), nok40(nt))
                val pl = prev.optJSONArray("items"); val nl = now.optJSONArray("items")
                if (nl != null) for (i in 0 until nl.length()) {
                    val b = nl.optJSONObject(i) ?: continue
                    val a = pl?.optJSONObject(i)
                    val bt = "${b.optString("description")} ${nok40(b.optDouble("amount", 0.0))}"
                    val at = a?.let { "${it.optString("description")} ${nok40(it.optDouble("amount", 0.0))}" }
                    if (at != bt) ch += Change40("Linje ${i + 1}", at ?: "–", bt)
                }
            }
            val lines = now.optJSONArray("items")
            val sumLines = lines?.let { a -> (0 until a.length()).sumOf { a.optJSONObject(it)?.optDouble("amount", 0.0) ?: 0.0 } }
            val total = now.optDouble("total", Double.NaN).takeIf { !it.isNaN() }
            val sumOk = if (sumLines != null && total != null && (lines?.length() ?: 0) > 0) kotlin.math.abs(sumLines - total) < 0.6 else null
            val nLines = lines?.length() ?: 0
            val text = when {
                sumOk == false -> "Summen av linjene (${nok40(sumLines)}) stemmer ikke med beløpet (${nok40(total)}). Rett i «Rediger alt»."
                ch.isEmpty() -> "Ingen endringer. Butikk, dato og alle $nLines linjer stemmer" + (total?.let { ", og summen er ${nok40(it)}." } ?: ".")
                else -> "Glimt fant ${ch.size} ${if (ch.size == 1) "endring" else "endringer"}."
            }
            s.rr = s.rr + (txId to Reread40(receiptId, false, ch, r.s37("candidateId"), text, sumOk, null))
            Haptics.success()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            fail(glimtErr50(e, "reread40"))
        } catch (e: Exception) { fail(uiErr73(e, "Glimt fikk ikke lest kvitteringen")) }
    }
}

/** «Bruk endringene» (keep:new) eller «Behold som før» (keep:old). */
fun AppViewModel.rereadApply40(txId: Int, keep: Boolean) {
    val s = p40
    val r = s.rr[txId] ?: return
    s.rr = s.rr - txId
    val cand = r.candidateId ?: return
    launch40 {
        try {
            api40 { post("/receipts/${r.receiptId}/reanalyze/apply", JSONObject().put("candidateId", cand).put("keep", if (keep) "new" else "old")) }
            if (keep) { flash("Endringene er lagret"); loadTxDetail40(txId) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { message = e.message }
    }
}

data class EditLine40(val name: String, val price: String)

/**
 * «Rediger alt»: PATCH /finans/api/transactions/:id med alle felt (dato, beløp med fortegn, beskrivelse, motpart, kategori, konto,
 * notat) og varelinjene. Oppdaterer detaljen, lista og Hjem etterpå.
 */
fun AppViewModel.saveAll40(t: Tx, desc: String, merchant: String, date: String, amount: String, income: Boolean, categoryId: Int?, accountId: Int?,
    note: String, lines: List<EditLine40>?, done: () -> Unit) {
    val a = amount.replace(" ", "").replace(" ", "").replace(',', '.').toDoubleOrNull()
    if (desc.isBlank() || a == null || a == 0.0) { message = "Skriv beskrivelse og beløp"; return }
    if (!Regex("""^\d{4}-\d{2}-\d{2}$""").matches(date)) { message = "Velg en gyldig dato"; return }
    val s = p40
    if (s.editBusy) return
    s.editBusy = true
    launch40 {
        try {
            val body = JSONObject().put("type", if (income) "income" else "expense").put("description", desc.trim()).put("amount", kotlin.math.abs(a))
                .put("date", date).put("note", note).put("categoryId", categoryId ?: JSONObject.NULL).put("accountId", accountId ?: JSONObject.NULL)
            if (merchant.isNotBlank()) body.put("merchant", merchant.trim()).put("counterparty", merchant.trim())
            lines?.let { ls ->
                body.put("lines", JSONArray().apply {
                    ls.filter { it.name.isNotBlank() }.forEach { l -> put(JSONObject().put("description", l.name.trim()).put("name", l.name.trim()).put("amount", l.price.replace(',', '.').toDoubleOrNull() ?: 0.0)) }
                })
            }
            api40 { patch("/transactions/${t.id}", body) }
            Haptics.success()
            flash("Transaksjonen er lagret")
            loadTxDetail40(t.id)
            refreshFinance40()
            done()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { message = e.message } finally { s.editBusy = false }
    }
}

/* ======================= Finans → Søk: Glimt-kort ======================= */

data class AskKpi40(val label: String, val value: String, val sub: String?)

data class AskItem40(val kind: String, val id: String?, val name: String, val domain: String?, val logo: String?, val amount: Double?, val cycle: String?, val next: String?, val note: String?)

data class Ask40(val q: String, val text: String, val source: String?, val kpis: List<AskKpi40>, val items: List<AskItem40>, val action: Pair<String, String>?)

private val STD_SUB40 = Regex("(?i)\\b(abonnement(er)?|abo|faste trekk|hva betaler jeg for|strømmetjenester)\\b")

/** Spørsmål som alltid skal gi Glimt-svar med kort (også uten ✦ Glimt slått på). */
fun isStdAsk40(q: String): Boolean = STD_SUB40.containsMatchIn(q)

/** Fjerner markdown og kildemarkører (`**`, `[n]`, `#`, `*`). */
fun clean40(s: String): String = s.replace(Regex("\\*\\*|__|`"), "").replace(Regex("\\[\\d+]"), "").replace(Regex("(?m)^\\s*[#>*-]+\\s*"), "")
    .replace(Regex("\\s{2,}"), " ").trim()

fun AppViewModel.ask40(q0: String) {
    val q = q0.trim()
    val s = p40
    if (q.isBlank() || (s.askFor == q && (s.ask != null || s.askBusy))) return
    s.askFor = q; s.ask = null; s.askBusy = true
    launch40 {
        try {
            val o = try { JSONObject(api40 { request("POST", "/search/ask", JSONObject().put("q", q), read = 60_000) }) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }
            val a = o?.let { parseAsk40(q, it) } ?: localAsk40(q)
            if (s.askFor == q) s.ask = a
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (s.askFor == q) s.ask = localAsk40(q)
        } finally { if (s.askFor == q) s.askBusy = false }
    }
}

private fun parseAsk40(q: String, o: JSONObject): Ask40? {
    val text = clean40(o.s37("text") ?: o.s37("summary") ?: return null)
    val kpis = ArrayList<AskKpi40>()
    val items = ArrayList<AskItem40>()
    o.optJSONArray("kpis")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { k -> kpis += AskKpi40(k.optString("label").uppercase(), k.optString("value"), k.s37("sub")) } }
    val cards = o.optJSONArray("cards") ?: o.optJSONArray("items")
    if (cards != null) for (i in 0 until cards.length()) {
        val c = cards.optJSONObject(i) ?: continue
        val kind = c.s37("kind") ?: c.s37("type") ?: "sub"
        if (kind == "stat") { kpis += AskKpi40((c.s37("label") ?: "").uppercase(), c.s37("value") ?: "", c.s37("sub")); continue }
        items += AskItem40(kind, c.s37("id"), c.s37("name") ?: c.s37("title") ?: c.s37("merchant") ?: "", c.s37("domain"), c.s37("logo") ?: c.s37("logoUrl"),
            c.optDouble("amount", Double.NaN).takeIf { !it.isNaN() } ?: c.optDouble("monthly", Double.NaN).takeIf { !it.isNaN() },
            c.s37("cycle"), c.s37("next") ?: c.s37("next_date") ?: c.s37("nextDate") ?: c.s37("date"), c.s37("note") ?: c.s37("sub"))
    }
    val act = o.optJSONObject("action")?.let { (it.s37("label") ?: "Åpne ›") to (it.s37("target") ?: "subs") }
        ?: o.s37("open")?.let { (if (it.contains("sub")) "Åpne Abonnementer ›" else "Åpne ›") to it }
    return Ask40(q, text, o.s37("source"), kpis.take(3), items.sortedBy { it.next ?: "9999" }, act)
}

/** Lokalt svar for abonnementer (Subscription OS-dataene appen allerede har). */
private suspend fun AppViewModel.localAsk40(q: String): Ask40? {
    if (!isStdAsk40(q)) return null
    if (subsX == null) runCatching { loadSubs40() }
    val x = subsX ?: return null
    val act = x.items.filter { it.active }
    if (act.isEmpty()) return Ask40(q, "Du har ingen aktive abonnementer.", "Abonnementer", emptyList(), emptyList(), "Åpne Abonnementer ›" to "subs")
    val today = LocalDate.now(OSLO40)
    val sorted = act.sortedBy { it.nextCharge ?: it.nextDate.ifBlank { "9999" } }
    val next = sorted.firstOrNull()
    val nextD = next?.let { runCatching { LocalDate.parse((it.nextCharge ?: it.nextDate).take(10)) }.getOrNull() }
    val days = nextD?.let { java.time.temporal.ChronoUnit.DAYS.between(today, it).toInt() }
    val monthly = act.sumOf { it.monthly }
    val text = "Du har ${act.size} abonnementer. Til sammen ${nok40(monthly)} i måneden." + (next?.let { n -> " Neste trekk er ${n.name}" + (days?.let { d -> if (d == 0) " i dag." else if (d == 1) " i morgen." else " om $d dager." } ?: ".") } ?: "")
    val kpis = listOf(AskKpi40("PER MÅNED", nok40(monthly), null), AskKpi40("PER ÅR", nok40(monthly * 12), null),
        AskKpi40("NESTE TREKK", nextD?.let { "${it.dayOfMonth}. ${MON40[it.monthValue - 1]}" } ?: "–", next?.let { "${it.name} · ${nok40(it.price)}" }))
    val items = sorted.map { s -> AskItem40("sub", s.id.toString(), s.name, s.domain, s.logoUrl, s.price, s.cycle, (s.nextCharge ?: s.nextDate).takeIf { it.isNotBlank() }?.take(10), s.plan.takeIf { it.isNotBlank() }) }
    return Ask40(q, text, "Abonnementer", kpis, items, "Åpne Abonnementer ›" to "subs")
}

internal val MON40 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/* ======================= Prøveperioder ======================= */

/** Minst én aktiv prøveperiode (ikke avsluttet, sluttdato i dag eller senere). */
fun AppViewModel.activeTrials46(): Boolean {
    val today = LocalDate.now(OSLO31)
    return p31.trials.any { it.status == "active" && !it.endsAt.isBefore(today) }
}

/* ======================= Subscription OS: logg ======================= */

data class SubEvent46(
    val id: String, val service: String, val type: String, val amount: Double?, val date: LocalDate, val account: String?, val source: String?,
    val oldPrice: Double?, val days: Int?, val saved: Double?,
)

class SubLog46State {
    var events by mutableStateOf<List<SubEvent46>?>(null)
    var missing by mutableStateOf(false)
    var filter by mutableStateOf("alle") // alle · fakturaer · prove
    var months by mutableStateOf(3)
    var busy by mutableStateOf(false)
}

fun AppViewModel.loadSubLog46() {
    val s = p46.subLog
    if (s.busy) return
    s.busy = true
    launch46 {
        try {
            val raw = try { api46 { get("/subscriptions/log?months=24") } } catch (e: ApiException) {
                if (e.status == 404) api46 { hlGet("/subscriptions/log?months=24") } else throw e
            }
            val o = JSONObject(raw)
            s.events = objs34(o.optJSONArray("events") ?: o.optJSONArray("items")).mapNotNull { e ->
                val d = e.s43("date")?.take(10)?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return@mapNotNull null
                SubEvent46(e.opt("id")?.toString() ?: "${e.s43("service")}-$d", e.s43("service", "name") ?: "Abonnement", e.s43("type") ?: "charge", e.d43("amount"), d,
                    e.s43("account"), e.s43("source"), e.d43("oldPrice", "old_price"), e.i43("days"), e.d43("saved"))
            }.sortedByDescending { it.date }
            s.missing = false
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.missing = true
        } catch (_: Exception) {
        } finally { s.busy = false }
    }
}

fun subLogCsv46(list: List<SubEvent46>): String {
    val type = mapOf("charge" to "Faktura", "trial_start" to "Prøveperiode startet", "trial_end" to "Prøveperiode slutt", "trial_converted" to "Gikk over til betalt",
        "trial_cancelled" to "Sagt opp i tide", "price_change" to "Prisendring", "cancelled" to "Sagt opp")
    fun q(s: String) = if (s.contains(';') || s.contains('"') || s.contains('\n')) "\"" + s.replace("\"", "\"\"") + "\"" else s
    return "Dato;Tjeneste;Type;Beløp\n" + list.joinToString("\n") { e ->
        listOf(e.date.toString(), q(e.service), q(type[e.type] ?: e.type), e.amount?.let { a -> String.format(java.util.Locale("nb", "NO"), "%.2f", if (e.type == "charge" || e.type == "trial_converted") -kotlin.math.abs(a) else kotlin.math.abs(a)) } ?: "0").joinToString(";")
    }
}

/* ======================= Butikklogoer (bare lokal logo-cache på serveren) ======================= */

data class Logo52(val url: String?, val initial: String, val color: Long?)

private fun hex52(s: String?): Long? = s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000 or it }

/** Henter logoene for navnene som ikke er spurt om ennå (maks 200 per kall). Ingen eksterne oppslag. */
fun AppViewModel.logos52(names: List<String>) {
    val s = p52b
    val want = names.map { it.trim() }.filter { it.isNotEmpty() && it !in s.logoAsked }.distinct().take(200)
    if (want.isEmpty()) return
    s.logoAsked.addAll(want)
    launch52b {
        val raw = runCatching { api52b { request("POST", "/logos52/batch", JSONObject().put("names", JSONArray(want)), timeout = 6_000, read = 10_000) } }.getOrNull() ?: return@launch52b
        val items = runCatching { JSONObject(raw).optJSONObject("items") }.getOrNull() ?: return@launch52b
        val out = HashMap<String, Logo52>()
        items.keys().forEach { k ->
            val o = items.optJSONObject(k) ?: return@forEach
            out[k] = Logo52(o.s52("url"), o.s52("initial") ?: k.take(1).uppercase(), hex52(o.s52("color")))
        }
        if (out.isNotEmpty()) s.logos = s.logos + out
    }
}

/** Annonsen fra GET /finans/api/finn/:id/ad. */
data class FinnAd23(
    val title: String?, val price: Double?, val description: String?, val attrs: List<Pair<String, String>>, val images: List<String>,
    val url: String?, val fetchedAt: String?, val removed: Boolean,
)

/** Én melding med motparten (hentet fra e-postvarsler). */
data class FinnMsg23(val mine: Boolean, val text: String, val time: String?)

/** Kortene på Abonnementer → Hjem, i standardrekkefølge (layout-feltet subHomeOrder). */
/** Prompt 37: «trials» (Gratis prøveperioder) øverst. */
val SUB_HOME_DEFAULT = listOf("trials", "ai", "next7", "check", "list")

/* ---------- Abonnementer: rekkefølgen på Hjem ---------- */

internal fun normalizeSubOrder(l: List<String>): List<String> {
    val known = l.map { if (it == "next") "next7" else it }.filter { it in SUB_HOME_DEFAULT }.distinct()
    // Prompt 37: eldre oppsett uten prøveperiode-kortet får det øverst.
    val head = if ("trials" !in known) listOf("trials") else emptyList()
    return head + known + SUB_HOME_DEFAULT.filter { it !in known && it !in head }
}

/** Leser subHomeOrder fra /api/me/layout én gang (per bruker; lokalt lagret rekkefølge brukes til svaret kommer). */
fun AppViewModel.loadSubOrder23() {
    val s = m23
    if (s.subOrderLoaded) return
    s.subOrderLoaded = true
    val key = "sub_home_order" + (account?.id ?: "")
    prefs.str(key, "").takeIf { it.isNotBlank() }?.let { s.subOrder = normalizeSubOrder(it.split(',')) }
    launch23 {
        val raw = runCatching { api23 { hlGet("/me/layout") } }.getOrNull() ?: return@launch23
        val a = runCatching { JSONObject(raw).optJSONArray("subHomeOrder") }.getOrNull() ?: return@launch23
        s.subOrder = normalizeSubOrder((0 until a.length()).map { a.optString(it) })
        prefs.set(key, s.subOrder.joinToString(","))
    }
}

fun AppViewModel.saveSubOrder23(l: List<String>) {
    val o = normalizeSubOrder(l)
    m23.subOrder = o
    prefs.set("sub_home_order" + (account?.id ?: ""), o.joinToString(","))
    launch23 { runCatching { api23 { hlPut("/me/layout", JSONObject().put("subHomeOrder", JSONArray(o))) } } }
}

/** Flytter et kort ett steg opp (-1) eller ned (+1). */
fun AppViewModel.moveSubCard23(id: String, dir: Int) {
    val l = m23.subOrder.toMutableList()
    val i = l.indexOf(id)
    val j = i + dir
    if (i < 0 || j !in l.indices) return
    l.removeAt(i); l.add(j, id)
    Haptics.select()
    saveSubOrder23(l)
}

/* ---------- Finn-annonsen ---------- */

private fun JSONObject.strList(k: String): List<String> = optJSONArray(k)?.let { a ->
    (0 until a.length()).mapNotNull { i -> a.optString(i).takeIf { it.isNotBlank() && !it.startsWith("{") } ?: a.optJSONObject(i)?.optStr("url") }
} ?: emptyList()

fun parseFinnAd23(s: String): FinnAd23 {
    val o = JSONObject(s).let { it.optJSONObject("ad") ?: it }
    val attrs = o.optJSONArray("attrs")?.map { (it.optStr("label") ?: "") to (it.optStr("value") ?: "") }?.filter { it.first.isNotBlank() && it.second.isNotBlank() } ?: emptyList()
    return FinnAd23(o.optStr("title"), o.optDoubleOrNull("price"), o.optStr("description"), attrs, o.strList("images"), o.optStr("url"), o.optStr("fetchedAt") ?: o.optStr("saved"), o.optBoolean("removed"))
}

private fun parseMails23(s: String): List<FinnMail> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("emails") ?: it.optJSONArray("items") } ?: JSONArray()
    return a.map { m -> FinnMail(m.optStr("id") ?: "", m.optStr("date"), m.optStr("from"), m.optStr("subject"), m.optStr("snippet"), m.optStr("body") ?: m.optStr("text")) }
}

/** Åpner annonsen i appen: henter annonse, e-poster og meldinger. 404 fra en eldre server: bruk det handelen allerede har. */
fun AppViewModel.openFinnAd23(id: Int) {
    val s = m23
    s.finnAdFor = id; s.finnAd = null; s.finnMails = null; s.finnChat = null; s.finnChatUrl = null; s.finnMailOpen = null
    openFinn(id)
    launch23 {
        s.finnAdBusy = true
        try {
            s.finnAd = runCatching { parseFinnAd23(api23 { get("/finn/$id/ad") }) }.getOrNull()
            if (s.finnAdFor != id) return@launch23
            s.finnMails = runCatching { parseMails23(api23 { get("/finn/$id/emails") }) }.getOrNull()
            // {items:[{id, from:'me'|'them', text, time}], chatUrl} (eldre form: bar liste eller «messages»).
            val chat = runCatching { JSONObject(api23 { get("/finn/$id/messages") }.let { if (it.trimStart().startsWith("[")) "{\"items\":$it}" else it }) }.getOrNull()
            s.finnChat = (chat?.optJSONArray("items") ?: chat?.optJSONArray("messages"))?.map { FinnMsg23(it.optStr("from") == "me", it.optStr("text") ?: "", it.optStr("time")) } ?: emptyList()
            s.finnChatUrl = chat?.optStr("chatUrl")
        } finally { s.finnAdBusy = false }
    }
}

fun AppViewModel.closeFinnAd23() {
    Haptics.back() // prompt 34
    m23.finnAdFor = null
    finnSel = null
    finnDetail = null
}

/** Trykk på en e-post: åpner eller lukker den, og henter hele teksten første gang. */
fun AppViewModel.toggleFinnMail23(id: Int, m: FinnMail) {
    val s = m23
    s.finnMailOpen = if (s.finnMailOpen == m.id) null else m.id
    if (s.finnMailOpen == null || m.id.isBlank() || s.finnMailBody.containsKey(m.id)) return
    launch23 {
        val body = runCatching { JSONObject(api23 { get("/finn/$id/emails/${m.id}") }).let { it.optStr("body") ?: it.optStr("text") ?: it.optStr("html")?.replace(Regex("<[^>]+>"), " ") } }.getOrNull()
        s.finnMailBody[m.id] = body ?: m.body ?: m.snippet ?: ""
    }
}

fun AppViewModel.refreshFinnAd23(id: Int) = launch23 {
    m23.finnAdBusy = true
    try {
        m23.finnAd = runCatching { parseFinnAd23(api23 { post("/finn/$id/ad/refresh") }) }.getOrNull()
            ?: runCatching { parseFinnAd23(api23 { get("/finn/$id/ad") }) }.getOrNull() ?: m23.finnAd
        flash(if (m23.finnAd?.removed == true) "Annonsen er fjernet fra Finn · viser den lagrede kopien" else "✦ Annonsen er hentet på nytt")
    } finally { m23.finnAdBusy = false }
}

/* ---------- Boliger ---------- */

data class Home24(
    val id: Int, val name: String, val address: String?, val budget: Double?, val color: String?, val background: String?, val backgroundUrl: String?,
    val total: Double, val review: Int, val autoCat: Boolean, val notify: Boolean, val myRole: String?,
)

data class HomeEntry24(
    val id: Int, val description: String, val date: String, val amount: Double, val paidBy: String?, val category: String, val color: String?,
    /** ok | review | ai (Gemini leser fortsatt kvitteringen). */
    val status: String, val receiptId: String?, val aiShort: String?,
)

data class HomeMember24(val id: Int, val name: String, val role: String, val roleName: String, val you: Boolean)

data class HomeDetail24(val home: Home24, val entries: List<HomeEntry24>, val members: List<HomeMember24>, val isOwner: Boolean, val canEdit: Boolean, val cats: List<String>)

internal fun parseHome24(o: JSONObject): Home24 = Home24(
    o.optInt("id"), o.optString("name"), o.optStr("address"), o.optDoubleOrNull("budget"), o.optStr("color"), o.optStr("background"), o.optStr("backgroundUrl"),
    if (o.has("total")) o.num("total") else o.num("yearTotal"), o.optInt("review"), o.optBoolean("autoCat", true), o.optBoolean("notify", true), o.optStr("role"),
)

internal fun parseHomes24(s: String): List<Home24> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONArray()
    return a.map(::parseHome24)
}

internal fun parseHomeDetail24(s: String): HomeDetail24 {
    val o = JSONObject(s)
    val entries = (o.optJSONArray("entries") ?: JSONArray()).map { e ->
        val cat = e.optStr("category") ?: e.optStr("categoryLabel") ?: "Annet"
        HomeEntry24(
            e.optInt("id"), e.optString("description"), e.optString("date"), e.num("amount"), e.optStr("paidBy"), cat.substringBefore('›').trim(), e.optStr("color"),
            if (e.optBoolean("pending")) "ai" else if (e.optStr("status") == "review") "review" else "ok", e.optStr("receiptId"), e.optStr("aiShort"),
        )
    }
    val members = (o.optJSONArray("members") ?: JSONArray()).map { m ->
        HomeMember24(m.optInt("id"), m.optString("name"), m.optStr("role") ?: "editor", m.optStr("roleName") ?: "Kan redigere", m.optBoolean("you"))
    }
    val cats = o.optJSONArray("catOptions").strings().filter { it.isNotBlank() }
    return HomeDetail24(parseHome24(o), entries, members, o.optBoolean("isOwner"), o.optBoolean("canEdit", true), cats)
}

/** Bakgrunnen for en bolig: lagret valg, ellers Strømstad-bildet når «Strømstad» står i navn eller adresse, ellers farge. */
internal fun homeBg24(h: Home24, local: String?): String {
    val v = h.background ?: local
    if (!v.isNullOrBlank()) return v
    return if (Regex("strømstad|stromstad", RegexOption.IGNORE_CASE).containsMatchIn(h.name + " " + (h.address ?: ""))) "preset:stromstad" else "color"
}

/** Fargene i «Rediger bolig» (7 + fri). */
val HOME24_COLORS = listOf("#2f6b45", "#2b5d8a", "#b23a2a", "#a8661a", "#7a3b6b", "#2e6f75", "#5c5850")

/* ---------- Boliger ---------- */

/** Henter boligene (med bakgrunn, budsjett og farge) og detaljene for alle, så pillene viser «… kr i okt». */
fun AppViewModel.b24LoadHomes(open: Int? = null) {
    val s = b24
    launch24b {
        val raw = api24b { get("/folders") }
        val hs = parseHomes24(raw)
        s.homes = hs
        folders = runCatching { parseFolders(raw) }.getOrNull() ?: folders
        val id = open ?: s.cur?.takeIf { c -> hs.any { it.id == c } } ?: hs.firstOrNull()?.id
        if (id != null) b24OpenHome(id)
        hs.filter { it.id != id }.forEach { h -> runCatching { s.details[h.id] = parseHomeDetail24(api24b { get("/folders/${h.id}") }) } }
    }
}

/** Velger bolig: detaljene til appens egen tilstand (opplasting havner i valgt bolig) og til Boliger-siden. */
fun AppViewModel.b24OpenHome(id: Int) {
    val s = b24
    s.cur = id
    launch24b {
        val raw = api24b { get("/folders/$id") }
        s.details[id] = parseHomeDetail24(raw)
        val f = runCatching { parseFolderDetail(raw) }.getOrNull()
        s.lastFolder = f
        if (screen == Screen.Folders) folder = f
    }
}

/** Kalles når appen har hentet boligen på nytt (f.eks. etter opplasting): oppdater siden også. */
fun AppViewModel.b24SyncFolder() {
    val f = folder ?: return
    if (f === b24.lastFolder) return
    b24.lastFolder = f
    val id = f.folder.id
    launch24b { runCatching { b24.details[id] = parseHomeDetail24(api24b { get("/folders/$id") }) } }
}

internal fun AppViewModel.applyDetail24(raw: String) {
    val d = parseHomeDetail24(raw)
    b24.details[d.home.id] = d
    b24.homes = b24.homes?.map { if (it.id == d.home.id) d.home else it }
    val f = runCatching { parseFolderDetail(raw) }.getOrNull()
    b24.lastFolder = f
    if (screen == Screen.Folders && b24.cur == d.home.id) folder = f
}

/** Lokal reserve for bakgrunnen (eldre server uten «background»). */
fun AppViewModel.b24LocalBg(id: Int): String? = prefs.str(pk24("bg_$id"), "").ifBlank { null }

internal fun AppViewModel.b24BgFile(id: Int): File = File(File(getApplication<Application>().filesDir, "boliger24").apply { mkdirs() }, "$id.jpg")

/** Lagrer navn, adresse, budsjett, farge og bakgrunn (PATCH /finans/api/folders/:id). */
fun AppViewModel.b24SaveHome(id: Int, name: String, address: String, budget: String, color: String, bg: String) {
    val s = b24
    s.busy = true
    launch24b {
        try {
            val body = JSONObject().put("name", name.trim()).put("address", address.trim()).put("color", color.lowercase())
            // «local:» = eget bilde bare på denne telefonen (serveren støttet ikke opplasting).
            if (!bg.startsWith("local:")) body.put("background", bg)
            body.put("budget", budget.filter { it.isDigit() }.ifBlank { null } ?: JSONObject.NULL)
            prefs.set(pk24("bg_$id"), bg)
            applyDetail24(api24b { patch("/folders/$id", body) })
            loadFolders()
            s.edit = null
            flash("Lagret ${name.trim().ifBlank { "bolig" }}")
        } finally { s.busy = false }
    }
}

/** Eget bilde: skaleres til 1200 px og lastes opp (PUT /finans/api/folders/:id/bg). Uten støtte på serveren: bare på denne telefonen. */
fun AppViewModel.b24UploadBg(id: Int, uri: Uri, done: (String) -> Unit) {
    launch24b {
        val app = getApplication<Application>()
        val jpeg = withContext(Dispatchers.IO) {
            runCatching {
                val data = app.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                val b = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return@runCatching null
                val sc = minOf(1f, 1200f / maxOf(b.width, b.height))
                val o = if (sc < 1f) Bitmap.createScaledBitmap(b, (b.width * sc).toInt(), (b.height * sc).toInt(), true) else b
                ByteArrayOutputStream().also { o.compress(Bitmap.CompressFormat.JPEG, 82, it) }.toByteArray()
            }.getOrNull()
        }
        if (jpeg == null) { flash("Kunne ikke lese bildet"); return@launch24b }
        withContext(Dispatchers.IO) { runCatching { b24BgFile(id).writeBytes(jpeg) } }
        b24.bgBitmaps.remove("local:$id")
        b24.bgBitmaps.remove("srv:$id")
        val b64 = android.util.Base64.encodeToString(jpeg, android.util.Base64.NO_WRAP)
        val r = try {
            try404 { request("PUT", "/folders/$id/bg", JSONObject().put("image", "data:image/jpeg;base64,$b64"), timeout = 15_000, read = 30_000) }
        } catch (e: ApiException) { null }
        val key = r?.let { runCatching { JSONObject(it).optStr("background") }.getOrNull() } ?: if (r != null) "upload:$id" else "local:$id"
        done(key)
    }
}

fun AppViewModel.b24DeleteHome(id: Int) {
    val s = b24
    launch24b {
        api24b { delete("/folders/$id") }
        s.edit = null
        s.details.remove(id)
        s.cur = null
        flash("Boligen er slettet")
        b24LoadHomes()
        loadFolders()
    }
}

fun AppViewModel.b24CreateHome(name: String, address: String, budget: String) {
    val s = b24
    s.busy = true
    launch24b {
        try {
            val raw = api24b { post("/folders", JSONObject().put("name", name.trim()).put("address", address.trim()).put("type", "Bolig")) }
            val d = parseHomeDetail24(raw)
            budget.filter { it.isDigit() }.takeIf { it.isNotBlank() }?.let { b -> runCatching { api24b { patch("/folders/${d.home.id}", JSONObject().put("budget", b)) } } }
            s.newHome = false
            s.tab = "ov"
            flash("${d.home.name} er opprettet")
            b24LoadHomes(d.home.id)
            loadFolders()
        } finally { s.busy = false }
    }
}

fun AppViewModel.b24AddEntry(id: Int, what: String, amount: Double, cat: String?) {
    val s = b24
    s.busy = true
    launch24b {
        try {
            val body = JSONObject().put("description", what.trim()).put("amount", amount).put("date", LocalDate.now().toString())
            if (cat != null && cat != "Annet") body.put("category", cat)
            applyDetail24(api24b { post("/folders/$id/entries", body) })
            s.newEntry = false
            flash("Lagt til i ${s.details[id]?.home?.name ?: "boligen"}")
        } finally { s.busy = false }
    }
}

fun AppViewModel.b24PatchEntry(id: Int, eid: Int, status: String? = null, category: String? = null, msg: String? = null) = launch24b {
    val body = JSONObject()
    status?.let { body.put("status", it) }
    category?.let { body.put("category", it) }
    applyDetail24(api24b { patch("/folders/$id/entries/$eid", body) })
    msg?.let { flash(it) }
}

fun AppViewModel.b24ApproveAll(id: Int) = launch24b {
    val d = b24.details[id] ?: return@launch24b
    var raw: String? = null
    d.entries.filter { it.status == "review" }.forEach { e -> raw = api24b { patch("/folders/$id/entries/${e.id}", JSONObject().put("status", "ok")) } }
    raw?.let { applyDetail24(it) }
    flash("Alle er godkjent")
}

fun AppViewModel.b24DeleteEntry(id: Int, eid: Int) = launch24b {
    applyDetail24(api24b { delete("/folders/$id/entries/$eid") })
    b24.sel = null
    flash("Utgiften er slettet")
}

fun AppViewModel.b24PatchHome(id: Int, body: JSONObject) = launch24b { applyDetail24(api24b { patch("/folders/$id", body) }) }

fun AppViewModel.b24SetRole(id: Int, mid: Int, role: String) = launch24b { applyDetail24(api24b { patch("/folders/$id/members/$mid", JSONObject().put("role", role)) }) }

fun AppViewModel.b24RemoveMember(id: Int, m: HomeMember24) = launch24b {
    val r = api24b { delete("/folders/$id/members/${m.id}") }
    if (r.trim().startsWith("{") && r.contains("\"entries\"")) applyDetail24(r) else b24OpenHome(id)
    flash("${m.name} har ikke lenger tilgang")
}

fun AppViewModel.b24Invite(id: Int, who: String, role: String) = launch24b {
    val raw = api24b { post("/folders/$id/invite", JSONObject().put("emails", JSONArray(listOf(who.trim())))) }
    applyDetail24(raw)
    if (role != "editor") {
        val nm = who.trim().substringBefore('@')
        b24.details[id]?.members?.lastOrNull { it.name.equals(nm, true) || it.name.equals(who.trim(), true) }?.let { m ->
            applyDetail24(api24b { patch("/folders/$id/members/${m.id}", JSONObject().put("role", role)) })
        }
    }
    flash("Invitasjon sendt til ${who.trim()}")
}

/** «Fra e-post»: henter nye kvitteringer fra innboksen nå (krever innlogget økt på serveren; ellers hentes de automatisk). */
fun AppViewModel.b24MailNow(id: Int) = launch24b {
    val r = runCatching { api24b { post("/mail/run") } }
    if (r.isSuccess) { flash("Innboksen er sjekket"); b24OpenHome(id) }
    else flash("Kvitteringer på e-post hentes automatisk. Sett opp IMAP under Innstillinger → Tilkoblinger.")
}

/** Bildet for en bakgrunn: Strømstad pakkes med appen, egne bilder fra serveren eller fra telefonen. */
suspend fun AppViewModel.b24BgBitmap(h: Home24, key: String): Bitmap? {
    val cacheKey = when {
        key.startsWith("upload:") -> "srv:${h.id}"
        key.startsWith("local:") -> "local:${h.id}"
        else -> return null
    }
    if (b24.bgBitmaps.containsKey(cacheKey)) return b24.bgBitmaps[cacheKey]
    val b = if (cacheKey.startsWith("srv:")) {
        (h.backgroundUrl ?: "/finans/api/folders/${h.id}/bg").let { p -> image(if (p.startsWith("/")) p else "/$p") }
            ?: withContext(Dispatchers.IO) { runCatching { BitmapFactory.decodeFile(b24BgFile(h.id).path) }.getOrNull() }
    } else withContext(Dispatchers.IO) { runCatching { BitmapFactory.decodeFile(b24BgFile(h.id).path) }.getOrNull() }
    b24.bgBitmaps[cacheKey] = b
    return b
}

/* ---------- Finans-fanelinja: navn og ikon ---------- */

private fun AppViewModel.finLblKey26() = "b26_finlbl_" + (account?.id ?: "")

/** Egne navn og ikoner (lagres på enheten og som finNav-objekter på serveren). */
fun AppViewModel.finLabels26(): Map<String, Pair<String?, String?>> {
    val id = account?.id ?: ""
    if (b26.finLblFor != id) {
        b26.finLblFor = id
        b26.finLbl = runCatching {
            val o = JSONObject(prefs.str(finLblKey26(), "{}"))
            o.keys().asSequence().associateWith { k -> o.getJSONObject(k).let { v -> v.optStr("label") to v.optStr("icon") } }
        }.getOrDefault(emptyMap())
    }
    return b26.finLbl
}

private fun AppViewModel.saveFinLabels26(m: Map<String, Pair<String?, String?>>) {
    b26.finLbl = m
    b26.finLblFor = account?.id ?: ""
    prefs.set(finLblKey26(), JSONObject().apply { m.forEach { (k, v) -> put(k, JSONObject().put("label", v.first ?: JSONObject.NULL).put("icon", v.second ?: JSONObject.NULL)) } }.toString())
}

fun AppViewModel.clearFinLabels26() = saveFinLabels26(emptyMap())

fun AppViewModel.finTabLabel26(k: String, def: String): String = finLabels26()[k]?.first?.takeIf { it.isNotBlank() } ?: def

fun AppViewModel.finTabIcon26(k: String, def: String): String = finLabels26()[k]?.second?.takeIf { it.isNotBlank() } ?: def

/** Nøkkelen serveren bruker i finNav (kvitteringer, abonnementer). */
private fun finServerKey26(k: String): String = when (k) { "kvitt" -> "kvitteringer"; "abo" -> "abonnementer"; else -> k }

/** Én fane i editoren: nøkkel, navn og ikon (tegn). */
data class FinItem26(val key: String, val label: String, val icon: String)

/** Lagrer Finans-linja: rekkefølge (finTabs og finNav), navn og ikoner. Profilen blir «Egendefinert». */
fun AppViewModel.saveFinNav26(items: List<FinItem26>, defLabel: (String) -> String, defIcon: (String) -> String) {
    val list = items.filter { it.key != "fmer" && it.key != "mer" }.distinctBy { it.key }.take(5)
    if (list.isEmpty()) return
    updatePaperFinTabs(list.map { it.key })
    saveFinLabels26(list.associate { t ->
        t.key to (t.label.trim().takeIf { it.isNotEmpty() && it != defLabel(t.key) } to t.icon.takeIf { it != defIcon(t.key) })
    }.filterValues { it.first != null || it.second != null })
    b24.profile = "custom"
    val objs = JSONArray().apply {
        list.forEach { t ->
            val o = JSONObject().put("key", finServerKey26(t.key))
            if (t.label.trim().isNotEmpty() && t.label != defLabel(t.key)) o.put("label", t.label.trim())
            if (t.icon != defIcon(t.key)) o.put("icon", tabIconName25(t.icon))
            put(o)
        }
    }
    launch24b {
        try { api24b { hlPut("/me/layout", JSONObject().put("finNav", objs)) } }
        catch (e: ApiException) {
            // Eldre server: bare listen med nøkler.
            if (e.status == 400) runCatching { api24b { hlPut("/me/layout", JSONObject().put("finNav", JSONArray(list.map { finServerKey26(it.key) }))) } }
        }
    }
}

/** «Tilbakestill til standard»: Oversikt, Transaksjoner, Budsjett og Faste betalinger, uten egne navn. */
fun AppViewModel.resetFinNav26() {
    updatePaperFinTabs(FIN_TABS_DEFAULT)
    saveFinLabels26(emptyMap())
    launch24b { runCatching { api24b { hlPut("/me/layout", JSONObject().put("finNav", JSONObject.NULL)) } } }
}

/** Fra GET /api/me/layout: finNav som liste med nøkler eller {key, label?, icon?}. */
fun AppViewModel.applyLayout26b(raw: String) {
    val a = runCatching { JSONObject(raw).optJSONArray("finNav") }.getOrNull() ?: return
    val keys = mutableListOf<String>()
    val lbl = mutableMapOf<String, Pair<String?, String?>>()
    for (i in 0 until a.length()) {
        val x = a.opt(i)
        val k = finKey24((x as? JSONObject)?.optStr("key") ?: (x as? JSONObject)?.optStr("id") ?: (x as? String) ?: continue)
        if (k == "mer" || k == "fmer" || FIN_TABS.none { it.first == k }) continue
        keys += k
        (x as? JSONObject)?.let { o ->
            val l = o.optStr("label")
            val ic = o.optStr("icon")?.let { r -> if (r in TAB_ICONS) r else iconNameGlyph25(r) }
            if (l != null || ic != null) lbl[k] = l to ic
        }
    }
    if (keys.isEmpty()) return
    val v = keys.distinct().take(5)
    if (v != paperFinTabs) updatePaperFinTabs(v)
    if (a.length() > 0 && (0 until a.length()).any { a.opt(it) is JSONObject }) saveFinLabels26(lbl)
}

/** Ett forslag under Finans-søket (GET /finans/api/forslag). sum i kroner (negativ for utgift). */
data class FinSug27(val type: String, val name: String, val count: Int, val sum: Double, val icon: String, val color: Long, val logoUrl: String?)

/** «Velg logo» for en butikk uten logo. */
data class LogoPick27(val name: String, val domain: String?, val receiptId: String?)

/** Resultatet av «Fra skjermbilde» (pris i kroner). check = felt med lav sikkerhet («Sjekk»). */
data class SubShot27(
    val service: String, val plan: String, val price: Double, val currency: String, val priceOriginal: String?, val cycle: String,
    val next: String?, val category: String, val logoUrl: String?, val domain: String?, val check: Set<String>, val existingId: Int?,
)

/* ---------- Normalisering og uklar matching (samme regler som serveren) ---------- */

/** Små bokstaver, uten diakritiske tegn, men æøå beholdes. */
fun norm27(s: String): String {
    val keep = s.lowercase().replace('æ', '\u0001').replace('ø', '\u0002').replace('å', '\u0003')
    val n = Normalizer.normalize(keep, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
    return n.replace('\u0001', 'æ').replace('\u0002', 'ø').replace('\u0003', 'å')
}

private fun lev27(a: String, b: String): Int {
    val d = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        var prev = d[0]; d[0] = i
        for (j in 1..b.length) {
            val t = d[j]
            d[j] = minOf(d[j] + 1, d[j - 1] + 1, prev + if (a[i - 1] == b[j - 1]) 0 else 1)
            prev = t
        }
    }
    return d[b.length]
}

/** 4 = starter med q, 3 = et ord starter med q, 2 = inneholder q, 1 = ett tegn feil mot starten av et ord (q ≥ 4), 0 = ingen. */
fun score27(name: String, q: String): Int {
    val n = norm27(name); val k = norm27(q.trim())
    if (k.isEmpty()) return 0
    if (n.startsWith(k)) return 4
    val words = n.split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }
    if (words.any { it.startsWith(k) }) return 3
    if (n.contains(k)) return 2
    if (k.length >= 4 && words.any { w -> lev27(w.take(k.length), k) <= 1 || lev27(w.take(k.length + 1), k) <= 1 }) return 1
    return 0
}

/** Delen som ble skrevet (start, slutt) i navnet, for «skrevet del normal, resten fet». null = uklart treff. */
fun typedRange27(name: String, q: String): IntRange? {
    val k = norm27(q.trim())
    if (k.isEmpty()) return null
    val n = norm27(name)
    val i = n.indexOf(k)
    // Normaliseringen kan endre lengden (sjelden); da markeres ingenting.
    if (i < 0 || n.length != name.length) return null
    return i until (i + k.length)
}

private fun colorHex27(s: String?): Long? = s?.trim()?.removePrefix("#")?.let { h ->
    when (h.length) { 6 -> h.toLongOrNull(16)?.let { 0xFF000000 or it }; 8 -> h.toLongOrNull(16); else -> null }
}

private fun parseSugs27(raw: String): List<FinSug27> {
    val t = raw.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).let { it.optJSONArray("items") ?: it.optJSONArray("forslag") ?: JSONArray() }
    return a.map { o ->
        val name = o.optStr("navn") ?: o.optStr("name") ?: ""
        FinSug27(
            o.optStr("type") ?: "butikk", name, o.optInt("antall", o.optInt("count", 0)),
            // sum i øre fra serveren (negativ for utgift).
            (o.optDoubleOrNull("sum") ?: 0.0) / 100.0,
            o.optStr("ikon") ?: o.optStr("icon") ?: name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() },
            colorHex27(o.optStr("farge") ?: o.optStr("color")) ?: 0xFF5B6478, o.optStr("logoUrl"),
        )
    }.filter { it.name.isNotBlank() }
}

/** Reserve uten /forslag: butikker og kategorier fra transaksjonene som allerede er lastet. */
private fun localSugs27(txs: List<Tx>, q: String): List<FinSug27> {
    val shops = txs.groupBy { (it.merchant ?: it.description).trim() }.filterKeys { it.isNotBlank() }
        .map { (n, l) -> Triple(FinSug27("butikk", n, l.size, l.sumOf { it.amount }, n.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }, l.first().color, null), score27(n, q), 0) }
    val cats = txs.groupBy { it.category.trim() }.filterKeys { it.isNotBlank() }
        .map { (n, l) -> Triple(FinSug27("kategori", n, l.size, l.sumOf { it.amount }, n.take(2).uppercase(), l.first().color, null), score27(n, q), 1) }
    return (shops + cats).filter { it.second > 0 }
        .sortedWith(compareByDescending<Triple<FinSug27, Int, Int>> { it.second }.thenBy { it.third }.thenByDescending { it.first.count })
        .take(6).map { it.first }
}

/* ---------- Finans-søkeforslag ---------- */

/** Ny tekst i Finans → Søk: debounce 120 ms og avbryt forrige. Ingen forslag når ✦ AI er på, feltet er tomt eller etter valg/Enter. */
fun AppViewModel.finSug27(q: String) {
    val s = b27
    s.sugJob?.cancel()
    val t = q.trim()
    if (t.isEmpty() || finSearchAi || s.sugHidden) { s.sug = emptyList(); return }
    s.sugJob = viewModelScope.launch {
        delay(120)
        val l = try {
            if (s.sugLocal) localSugs27(txs ?: emptyList(), t)
            else parseSugs27(api27b { get("/forslag?q=" + URLEncoder.encode(t, "UTF-8") + "&limit=6") })
        } catch (e: ApiException) {
            if (e.status == 404) { s.sugLocal = true; localSugs27(txs ?: emptyList(), t) } else emptyList()
        } catch (e: Exception) { emptyList() }
        if (isActive && finSearchQ.trim() == t && !s.sugHidden && !finSearchAi) s.sug = l
    }
}

/** Tøm forslagene (✕, Enter, valg). */
fun AppViewModel.finSugClear27(hide: Boolean) {
    b27.sugJob?.cancel()
    b27.sug = emptyList()
    b27.sugHidden = hide
}

/** Logo fra en sti på serveren («/finans/api/…») eller en full adresse. */
suspend fun AppViewModel.img27(url: String?): Bitmap? {
    if (url.isNullOrBlank()) return null
    val s = b27
    s.imgCache.get(url)?.let { return it }
    s.imgMiss[url]?.let { if (System.currentTimeMillis() - it < 5 * 60_000) return null }
    val b = if (url.startsWith("/")) image(url) else runCatching {
        withContext(Dispatchers.IO) {
            val c = URL(url).openSikker()
            c.connectTimeout = 6000; c.readTimeout = 8000
            c.setRequestProperty("User-Agent", "FinansHub-Android")
            try {
                val bytes = c.inputStream.use { it.readBytes() }
                // Nedskalert, så store artikkelbilder ikke fyller minnet.
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                var sample = 1
                while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 1000) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            } finally { c.disconnect() }
        }
    }.getOrNull()
    if (b != null) s.imgCache.put(url, b) else s.imgMiss[url] = System.currentTimeMillis()
    return b
}

private fun logoResult27(vm: AppViewModel, name: String, raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull()
    val s = vm.b27
    if (o == null || o.optBoolean("none")) { s.logoMsg = "Fant ingen logo. Last opp et bilde eller lim inn domenet."; return }
    val url = o.optStr("logoUrl") ?: o.optStr("url")
    val src = o.optStr("source")
    vm.launch27b {
        val b = vm.img27(url) ?: o.optStr("domain")?.let { vm.logo(it) }
        if (b != null) s.logoDone = s.logoDone + (name.lowercase() to b)
        s.logoMsg = null
        s.logoPick = null
        vm.flash("Logo lagret" + (src?.let { " · $it" } ?: ""))
    }
}

/** «Finn logo»: den nye kjeden på serveren (egen tabell → Brreg → Gemini med bare navnet → domene → ikon → kvitteringen). */
fun AppViewModel.findLogo27(pk: LogoPick27) {
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try {
            val body = JSONObject().put("name", pk.name)
            pk.receiptId?.let { body.put("receiptId", it) }
            logoResult27(this, pk.name, api27b { request("POST", "/merchants/logo", body, read = 60_000) })
        } catch (e: ApiException) {
            s.logoMsg = if (e.status == 404) "Logo-oppslag trenger en nyere Homelab-server." else e.message
        } finally { s.logoBusy = false }
    }
}

fun AppViewModel.logoDomain27(pk: LogoPick27, domain: String) {
    val d = domain.trim().removePrefix("https://").removePrefix("http://").removePrefix("www.").substringBefore('/').lowercase()
    if (!d.contains('.')) { b27.logoMsg = "Skriv et domene, f.eks. blomsterlandet.no"; return }
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try { logoResult27(this, pk.name, api27b { request("POST", "/merchants/logo/manual", JSONObject().put("name", pk.name).put("domain", d), read = 30_000) }) }
        catch (e: ApiException) { s.logoMsg = if (e.status == 404) "Trenger en nyere Homelab-server." else e.message }
        finally { s.logoBusy = false }
    }
}

fun AppViewModel.logoUpload27(ctx: Context, pk: LogoPick27, uri: Uri) {
    val s = b27
    s.logoBusy = true; s.logoMsg = null
    launch27b {
        try {
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return@launch27b
            val mime = ctx.contentResolver.getType(uri) ?: "image/png"
            val raw = api27b { upload("/merchants/logo/manual", listOf(Api.Part.text("name", pk.name), Api.Part("file", "logo." + mime.substringAfter('/'), mime, data))) }
            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(data, 0, data.size) }?.let { s.logoDone = s.logoDone + (pk.name.lowercase() to it) }
            logoResult27(this, pk.name, raw)
        } catch (e: ApiException) { s.logoMsg = if (e.status == 404) "Trenger en nyere Homelab-server." else e.message }
        finally { s.logoBusy = false }
    }
}

/* ---------- Abonnement fra skjermbilde ---------- */

internal fun parseShot27(raw: String): SubShot27 {
    val o = JSONObject(raw)
    val sik = o.optJSONObject("sikkerhet")
    val unsure = sik?.let { j -> j.keys().asSequence().filter { k -> j.optDouble(k, 1.0) < 0.8 }.toList() } ?: emptyList()
    val check = (o.optJSONArray("check").strings() + unsure).toSet()
    val cyc = when ((o.optStr("syklus") ?: o.optStr("cycle") ?: "mnd").lowercase()) { "år", "ar", "yearly", "year", "årlig" -> "yearly"; else -> "monthly" }
    val price = (o.optDoubleOrNull("pris") ?: o.optDoubleOrNull("price") ?: 0.0) / 100.0
    val next = o.optStr("neste_trekk") ?: o.optStr("next")
    return SubShot27(
        o.optStr("tjeneste") ?: o.optStr("service") ?: "Abonnement", o.optStr("plan") ?: "", price, o.optStr("valuta") ?: "NOK",
        o.optJSONObject("prisOriginal")?.optStr("tekst") ?: o.optStr("prisOriginal"), cyc, next, o.optStr("kategori") ?: o.optStr("category") ?: "Annet", o.optStr("logoUrl"), o.optStr("domain"),
        check, o.optIntOrNull("existingId")?.takeIf { it > 0 },
    )
}

/** Velg skjermbilde → Ollama (bildemodell, lokalt) leser tjeneste, plan, pris, syklus og neste trekk. Bildet slettes på serveren. */
fun AppViewModel.subFromShot27(ctx: Context, uri: Uri) {
    val s = b27
    s.shotOpen = true; s.shot = null; s.shotError = null; s.shotBusy = true
    s.shotName = runCatching { ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: "Skjermbilde"
    launch27b {
        try {
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: throw ApiException("Fikk ikke lest bildet")
            s.shotThumb = withContext(Dispatchers.Default) {
                runCatching {
                    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(data, 0, data.size, o)
                    var sample = 1
                    while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 400) sample *= 2
                    BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
                }.getOrNull()
            }
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val raw = api27b { upload("/subscriptions/from-screenshot", listOf(Api.Part("image", "skjermbilde." + mime.substringAfter('/'), mime, data))) }
            val r = parseShot27(raw)
            // Finnes tjenesten allerede: tilby oppdatering.
            val have = r.existingId ?: subsX?.items?.firstOrNull { it.name.equals(r.service, ignoreCase = true) }?.id
            s.shot = r.copy(existingId = have)
        } catch (e: ApiException) {
            s.shotError = when (e.status) { 404 -> "Fra skjermbilde trenger en nyere Homelab-server."; 501 -> "Ingen bildemodell i Ollama på serveren (f.eks. qwen2.5vl:7b)."; else -> e.message }
        } finally { s.shotBusy = false }
    }
}

/** Dag i måneden og måned for neste trekk (mangler den: i dag + syklus). */
fun shotDay27(r: SubShot27): Pair<Int, Int> {
    val d = runCatching { LocalDate.parse(r.next?.take(10)) }.getOrNull() ?: LocalDate.now().let { if (r.cycle == "yearly") it.plusYears(1) else it.plusMonths(1) }
    return d.dayOfMonth to d.monthValue
}

fun AppViewModel.addShot27(r: SubShot27) {
    val (day, mon) = shotDay27(r)
    val old = r.existingId?.let { id -> subsX?.items?.firstOrNull { it.id == id } }
    saveSub(old?.id, old?.name ?: r.service, r.plan, r.price, r.cycle, day, if (r.cycle == "monthly") null else mon, old?.category ?: r.category, if (old != null && !old.active) "cancelled" else "active")
    b27.shot = null; b27.shotOpen = false; b27.shotThumb = null
}

fun AppViewModel.editShot27(r: SubShot27) {
    b27.shotOpen = false
    b27.shot = null
    val old = r.existingId?.let { id -> subsX?.items?.firstOrNull { it.id == id } }
    if (old != null) { b27.subPrefill = r; m23.subEditId = old.id } else { b27.subPrefill = r; m23.subEditNew = true }
    subAdding = false
}

/** Feil fra «Fra skjermbilde»: code = ollama_down | no_vision | timeout | not_found | bad_image | no_gemini | gemini_failed | null (annet). */
data class ShotErr28(val code: String?, val message: String, val canGemini: Boolean)

/* ---------- Abonnement fra skjermbilde ---------- */

/** JPEG ≤ max px på lengste side (HEIC via ImageDecoder), med EXIF-rotasjon. Aldri HEIC/PNG til serveren. */
internal fun jpeg28(data: ByteArray, max: Int = 1600, quality: Int = 85): ByteArray? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, o)
    var sample = 1
    while (o.outWidth > 0 && maxOf(o.outWidth, o.outHeight) / (sample * 2) >= max) sample *= 2
    val bmp: Bitmap = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: (if (Build.VERSION.SDK_INT >= 28) runCatching {
            android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data))) { dec, info, _ ->
                val big = maxOf(info.size.width, info.size.height)
                if (big > max) { val k = max.toFloat() / big; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
                dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }.getOrNull() else null) ?: return null
    val rot = runCatching {
        when (ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f
        }
    }.getOrDefault(0f)
    val k = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
    val m = Matrix().apply { postScale(k, k); postRotate(rot) }
    val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    ByteArrayOutputStream().use { b -> out.compress(Bitmap.CompressFormat.JPEG, quality, b); b.toByteArray() }
}.getOrNull()

private fun thumb28(jpeg: ByteArray): Bitmap? = runCatching {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, o)
    var sample = 1
    while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 400) sample *= 2
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = sample })
}.getOrNull()

/** Velg skjermbilde → JPEG ≤ 1600 px → Ollama (bildemodell) på serveren. Feil gir et kort med konkrete knapper. */
fun AppViewModel.subFromShot28(ctx: Context, uri: Uri) {
    val s = b27
    val t = b28
    subAdding = false
    s.shotOpen = true; s.shot = null; s.shotError = null; s.shotThumb = null
    t.shotErr = null; t.shotJpeg = null
    s.shotName = runCatching { ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull() ?: "Skjermbilde"
    s.shotBusy = true
    launch28b {
        val raw = runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } }.getOrNull()
        val jpeg = raw?.let { withContext(Dispatchers.Default) { jpeg28(it) } }
        if (jpeg == null) {
            s.shotBusy = false
            t.shotErr = ShotErr28("bad_image", "Bildet kunne ikke leses. Prøv et skjermbilde som JPEG eller PNG.", false)
            return@launch28b
        }
        t.shotJpeg = jpeg
        s.shotThumb = withContext(Dispatchers.Default) { thumb28(jpeg) }
        readShot28("ollama")
    }
}

/** Les bildet på nytt (Prøv igjen) eller med Gemini (bare når brukeren trykker «Les med Gemini»). */
fun AppViewModel.retryShot28(engine: String = "ollama") {
    if (b28.shotJpeg == null) { b28.shotErr = ShotErr28(null, "Velg skjermbildet på nytt.", false); return }
    launch28b { readShot28(engine) }
}

private suspend fun AppViewModel.readShot28(engine: String) {
    val s = b27
    val t = b28
    val jpeg = t.shotJpeg ?: return
    s.shotBusy = true; s.shot = null; s.shotError = null; t.shotErr = null
    t.shotEngine = engine
    t.shotStart = System.currentTimeMillis()
    try {
        val path = "/subscriptions/from-screenshot" + if (engine == "gemini") "?engine=gemini" else ""
        // Første kall laster bildemodellen (30–60 s); serveren gir opp etter 120 s.
        val body = api28b { upload(path, listOf(Api.Part("image", "skjermbilde.jpg", "image/jpeg", jpeg)), read = 135_000) }
        val o = runCatching { JSONObject(body) }.getOrNull()
        if (o == null || (o.optStr("code") != null && o.optStr("error") != null)) {
            t.shotErr = ShotErr28(o?.optStr("code") ?: "not_found", o?.optStr("error") ?: "Fant ikke et abonnement i bildet.", o?.optBoolean("canGemini") == true)
            return
        }
        val r = parseShot27(body)
        if (r.service.isBlank() || r.price <= 0.0) { t.shotErr = ShotErr28("not_found", "Fant ikke et abonnement i bildet.", o.optBoolean("canGemini")); return }
        val have = r.existingId ?: subsX?.items?.firstOrNull { it.name.equals(r.service, ignoreCase = true) }?.id
        s.shot = r.copy(existingId = have)
    } catch (e: ApiException) {
        t.shotErr = when {
            e.code != null -> ShotErr28(e.code, e.message ?: "", e.canGemini)
            e.status == 404 -> ShotErr28(null, "Fra skjermbilde trenger en nyere Homelab-server.", false)
            e.status == 501 -> ShotErr28("no_vision", "Ingen bildemodell installert.", false)
            e.message == "Serveren svarte ikke i tide." -> ShotErr28("timeout", "Bildemodellen brukte for lang tid.", false)
            else -> ShotErr28(null, e.message ?: "Noe gikk galt", false)
        }
    } finally { s.shotBusy = false }
}

fun AppViewModel.closeShot28() {
    b27.shotOpen = false; b27.shot = null; b27.shotThumb = null; b27.shotBusy = false
    b28.shotErr = null; b28.shotJpeg = null
}

/** «Skriv inn selv» fra feilkortet: lukk kortet og åpne arket på skjemaet. */
fun AppViewModel.shotManual28() {
    closeShot28()
    b28.addStep = "form"
    subAdding = true
}

/** POST /finans/api/ai/vision/install (SSE): ollama pull qwen2.5vl:7b med fremdrift, så leses bildet på nytt. */
fun AppViewModel.installVision28() {
    val t = b28
    if (t.installing) return
    t.installing = true; t.installText = "Starter nedlastingen …"; t.installPct = null
    val url = base.trimEnd('/') + Api.FINANS + "/ai/vision/install"
    val token = account?.token
    launch28b {
        var ok = false
        var err: String? = null
        try {
            withContext(Dispatchers.IO) {
                val conn = URL(url).openSikker()
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 10_000
                    conn.readTimeout = 180_000
                    conn.doOutput = true
                    conn.setRequestProperty("Accept", "text/event-stream")
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                    conn.outputStream.use { it.write("{}".toByteArray()) }
                    val code = conn.responseCode
                    if (code >= 400) {
                        val b = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                        err = runCatching { JSONObject(b).optStr("error") }.getOrNull() ?: "Feil $code"
                        return@withContext
                    }
                    val rd = conn.inputStream.bufferedReader()
                    var event = "message"
                    while (true) {
                        val line = rd.readLine() ?: break
                        when {
                            line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                            line.startsWith("data:") -> {
                                val o = runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull() ?: continue
                                if (event == "done") {
                                    ok = o.optBoolean("ok"); err = o.optStr("error")
                                } else {
                                    val pct = if (o.has("pct") && !o.isNull("pct")) (o.optDouble("pct") / 100.0).toFloat()
                                        else o.optLong("total").takeIf { it > 0 }?.let { tot -> (o.optLong("completed").toDouble() / tot).toFloat() }
                                    val st = o.optStr("status") ?: "Laster ned"
                                    withContext(Dispatchers.Main) {
                                        t.installPct = pct?.coerceIn(0f, 1f)
                                        t.installText = "qwen2.5vl: $st" + (pct?.let { " · ${Math.round(it * 100)} %" } ?: "")
                                    }
                                    o.optStr("error")?.let { err = it }
                                    if (o.optBoolean("done") && o.optStr("error") == null) ok = true
                                }
                            }
                            line.isEmpty() -> event = "message"
                        }
                    }
                } finally { conn.disconnect() }
            }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { err = uiErr73(e, "Nettverksfeil") }
        t.installing = false
        if (ok && err == null) {
            t.installText = null; t.installPct = null
            Haptics.success()
            retryShot28("ollama")
        } else {
            t.installText = "Installeringen feilet: " + (err ?: "ukjent feil")
            Haptics.error()
        }
    }
}

/* ---------- «Skriv inn selv» i arket ---------- */

/** Uke regnes om til månedspris (52/12), siden abonnementene har månedlig eller årlig syklus (som serveren). */
fun AppViewModel.addManualSub28(name: String, amount: Double, day: Int?, cycle: String) {
    val d = day?.coerceIn(1, 31)
    val today = java.time.LocalDate.now()
    val month = if (cycle == "år") (if (d == null || d >= today.dayOfMonth) today.monthValue else today.plusMonths(1).monthValue) else null
    val price = if (cycle == "uke") Math.round(amount * 52.0 / 12.0 * 100.0) / 100.0 else amount
    val plan = if (cycle == "uke") "Ukepris " + String.format(java.util.Locale("nb", "NO"), "%.2f", amount).replace('.', ',') + " kr" else ""
    saveSub(null, name, plan, price, if (cycle == "år") "yearly" else "monthly", d, month, "Annet", "active")
    b28.addStep = "menu"
    subAdding = false
}
