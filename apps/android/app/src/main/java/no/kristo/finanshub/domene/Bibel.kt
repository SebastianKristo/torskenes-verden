@file:JvmName("DomeneBibel")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

/*
 * Bibel: kode som lå i blandingsfilene (P37.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class Verse37(val ref: String, val text: String, val period: String, val date: String?, val before: List<String>, val after: List<String>)

data class BibleSet37(val enabled: Boolean, val morning: Boolean = true, val evening: Boolean = true, val notify: Boolean = false, val translation: String = "1930")

/** Lokal Hjem-tilstand for dagens vers (per bruker og enhet, synkes ikke): lest i økt s, eller sveipet bort. */
data class BibleHome37(val d: String, val read: Boolean, val gone: Boolean, val s: Long)

/* ======================= Bibelvers ======================= */

/** Reserve (Bibelen 1930, fri bruk) når serveren ikke har /api/bible: ett vers per dag og periode, deterministisk. */
private val VERSES37 = listOf(
    Triple("Det er Herrens miskunn at det ikke er ute med oss; for hans barmhjertighet har ennu ikke ende; den er ny hver morgen, din trofasthet er stor.", "Klagesangene 3,22–23", "morning"),
    Triple("Dette er dagen som Herren har gjort; la oss fryde og glede oss på den!", "Salme 118,24", "morning"),
    Triple("Alt formår jeg i ham som gjør mig sterk.", "Filipperne 4,13", "morning"),
    Triple("Frykt ikke, for jeg er med dig; se dig ikke engstelig om, for jeg er din Gud; jeg styrker dig, ja, jeg hjelper dig.", "Jesaja 41,10", "morning"),
    Triple("Herren er min hyrde, jeg skal intet mangle.", "Salme 23,1", "morning"),
    Triple("I fred vil jeg både legge mig ned og sove; for du, Herre, du alene lar mig bo i trygghet.", "Salme 4,9", "evening"),
    Triple("Kom til mig, alle I som strever og har tungt å bære, og jeg vil gi eder hvile!", "Matteus 11,28", "evening"),
    Triple("Kast all eders bekymring på ham! for han har omsorg for eder.", "1. Peter 5,7", "evening"),
    Triple("For så har Gud elsket verden at han gav sin Sønn, den enbårne, forat hver den som tror på ham, ikke skal fortapes, men ha evig liv.", "Johannes 3,16", "evening"),
    Triple("Fred efterlater jeg eder, min fred gir jeg eder.", "Johannes 14,27", "evening"),
)

/** Morgen 05–17, ellers kveld (samme som serveren, så alle enheter viser samme vers). */
fun biblePeriod37(h: Int = LocalTime.now(OSLO37).hour): String = if (h in 5..16) "morning" else "evening"

fun localVerse37(period: String = biblePeriod37(), extra: Int = 0, date: LocalDate = LocalDate.now(OSLO37)): Verse37 {
    val l = VERSES37.filter { it.third == period }
    val v = l[Math.floorMod(date.dayOfYear + extra, l.size)]
    return Verse37(v.second, v.first, period, date.toString(), emptyList(), emptyList())
}

internal fun parseVerse37(o: JSONObject): Verse37? {
    val ref = o.s37("ref") ?: return null
    val ctx = o.optJSONObject("context")
    fun lines(a: JSONArray?): List<String> = (0 until (a?.length() ?: 0)).mapNotNull { i -> when (val x = a!!.opt(i)) { is JSONObject -> x.s37("text")?.let { t -> ((x.s37("v") ?: x.s37("ref"))?.let { "$it " } ?: "") + t }; is String -> x; else -> null } }
    return Verse37(ref, o.s37("text") ?: "", o.s37("period") ?: biblePeriod37(), o.s37("date"), lines(ctx?.optJSONArray("before")), lines(ctx?.optJSONArray("after")))
}

private fun AppViewModel.bibleKey37(k: String) = "bibel37_${k}_" + acct37()

/** Modulen er på (serveren sier enabled). 404 = eldre server: standard bare for brukeren sebastian, med lokale vers. */
fun AppViewModel.loadBible37(force: Boolean = false) {
    val s = p37
    val k = acct37()
    val now = System.currentTimeMillis()
    if (!force && s.bibleFor == k && now - s.bibleAt < 10 * 60_000 && s.verse?.period == biblePeriod37()) return
    if (s.bibleFor != k) { s.bibleOn = null; s.verse = null; loadBibleLocal37() }
    s.bibleFor = k
    s.bibleAt = now
    launch37 {
        try {
            val o = JSONObject(api37 { hlGet("/bible/today?period=" + biblePeriod37()) })
            val on = o.optBoolean("enabled", o.has("ref"))
            s.bibleOn = on
            s.bibleMissing = false
            s.verse = if (on) parseVerse37(o) ?: localVerse37() else null
            if (on) {
                runCatching { JSONObject(api37 { hlGet("/bible/settings") }) }.getOrNull()?.let { st ->
                    s.bibleSet = BibleSet37(st.optBoolean("enabled", true), st.optBoolean("morning", true), st.optBoolean("evening", true), st.optBoolean("notify", false), st.s37("translation") ?: "1930")
                    s.remind = s.bibleSet.notify
                }
                loadBibleStats37()
            }
        } catch (e: ApiException) {
            when (e.status) {
                403 -> { s.bibleOn = false; s.verse = null }
                404, 405 -> {
                    s.bibleMissing = true
                    val on = (me?.username ?: account?.username ?: "").equals("sebastian", true)
                    s.bibleOn = on
                    s.verse = if (on) localVerse37() else null
                    s.bibleSet = BibleSet37(on, notify = s.remind)
                }
            }
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            if (s.bibleOn == null) { val on = (me?.username ?: "").equals("sebastian", true); s.bibleOn = on; if (on) s.verse = localVerse37() }
        }
        Alarms37.bible(appCtx35, s.bibleOn == true && s.remind)
        no.kristo.finanshub.widget.Bible37Store.save(appCtx35, if (s.bibleOn == true) s.verse else null, s.bibleOn == true, acct37())
    }
}

fun AppViewModel.bibleAllowed37(): Boolean = p37.bibleOn == true

/** ↻ nytt vers bare for denne visningen. */
fun AppViewModel.nextVerse37() {
    val s = p37
    s.verseOff++
    val n = s.verseOff
    Haptics.select()
    launch37 {
        val v = if (s.bibleMissing) null else runCatching { parseVerse37(JSONObject(api37 { hlGet("/bible/next?offset=$n&period=" + biblePeriod37()) })) }.getOrNull()
        if (s.verseOff == n) s.verseAlt = v ?: localVerse37(extra = n)
    }
}

fun AppViewModel.shownVerse37(): Verse37? = if (p37.verseOff > 0) p37.verseAlt ?: p37.verse else p37.verse

fun AppViewModel.putBibleSet37(f: (BibleSet37) -> BibleSet37) {
    val s = p37
    val n = f(s.bibleSet)
    s.bibleSet = n
    s.remind = n.notify
    prefs.set(bibleKey37("remind"), n.notify)
    Alarms37.bible(appCtx35, n.notify && n.enabled)
    launch37 {
        runCatching { api37 { hlPut("/bible/settings", JSONObject().put("enabled", n.enabled).put("morning", n.morning).put("evening", n.evening).put("notify", n.notify).put("translation", n.translation)) } }
        runCatching { api37 { hlPut("/bible/reminder", JSONObject().put("on", n.notify)) } }
        if (!n.enabled) { s.bibleOn = false; no.kristo.finanshub.widget.Bible37Store.save(appCtx35, null, false, acct37()) }
    }
}

/* ---------- Hjem: lest / sveipet bort ---------- */

private fun today37() = LocalDate.now(OSLO37).toString()

private fun AppViewModel.loadBibleLocal37() {
    val s = p37
    s.bibleHome = runCatching { JSONObject(prefs.str(bibleKey37("home"), "")) }.getOrNull()?.let { BibleHome37(it.optString("d"), it.optBoolean("read"), it.optBoolean("gone"), it.optLong("s")) }
    s.readDays = prefs.str(bibleKey37("days"), "").split(',').filter { it.length == 10 }.toSet()
    s.best = prefs.int(bibleKey37("best"), 0)
    s.saved = runCatching { JSONArray(prefs.str(bibleKey37("saved"), "[]")).let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { (it.optString("ref")) to it.optString("text") } } } }.getOrDefault(emptyList())
    s.plan = prefs.str(bibleKey37("plan"), "joh")
    s.planDay = prefs.int(bibleKey37("pday"), 0)
    s.planDone = prefs.str(bibleKey37("pdone"), "").ifBlank { null }
    s.remind = prefs.bool(bibleKey37("remind"))
}

private fun AppViewModel.saveBibleHome37(h: BibleHome37) {
    p37.bibleHome = h
    prefs.set(bibleKey37("home"), JSONObject().put("d", h.d).put("read", h.read).put("gone", h.gone).put("s", h.s).toString())
}

/** Skjult på Hjem i dag: sveipet bort, eller lest i en tidligere økt. */
fun AppViewModel.bibleHomeHidden37(): Boolean {
    val h = p37.bibleHome ?: return false
    if (h.d != today37()) return false
    return h.gone || (h.read && h.s != p37.sess)
}

/** Verset står nederst i briefen resten av dagen når det er lest eller sveipet bort. */
fun AppViewModel.bibleAtBottom37(): Boolean { val h = p37.bibleHome ?: return false; return h.d == today37() && (h.gone || h.read) }

fun AppViewModel.bibleRead37() {
    val h = p37.bibleHome
    if (h?.d == today37() && h.read) return
    saveBibleHome37(BibleHome37(today37(), true, h?.takeIf { it.d == today37() }?.gone ?: false, p37.sess))
}

fun AppViewModel.bibleGone37() {
    val h = p37.bibleHome?.takeIf { it.d == today37() }
    saveBibleHome37(BibleHome37(today37(), h?.read ?: false, true, p37.sess))
}

/** Ny økt: appen kom fra bakgrunnen etter > 5 min. */
fun AppViewModel.appStopped37() { p37.bgAt = System.currentTimeMillis() }

fun AppViewModel.appStarted37() {
    val s = p37
    if (s.bgAt > 0 && System.currentTimeMillis() - s.bgAt > 5 * 60_000) s.sess = System.currentTimeMillis()
    s.bgAt = 0
}

/* ---------- Bibel-siden: rekke, leseplan, lagrede vers ---------- */

fun AppViewModel.loadBibleStats37() = launch37 {
    val s = p37
    val o = runCatching { JSONObject(api37 { hlGet("/bible/stats") }) }.getOrNull() ?: return@launch37
    val days = strs37(o.optJSONArray("readDays")).map { it.take(10) }.toSet()
    s.readDays = s.readDays + days
    s.best = maxOf(s.best, o.optInt("best", 0))
    o.optJSONObject("plan")?.let { p ->
        p.s37("id")?.let { s.plan = it }
        if (p.has("day")) s.planDay = p.optInt("day", s.planDay)
        p.s37("doneDate")?.let { s.planDone = it }
        if (p.optBoolean("doneToday", false)) s.planDone = LocalDate.now(OSLO37).toString()
    }
    if (o.has("saved")) s.saved = objs34(o.optJSONArray("saved")).mapNotNull { x -> x.s37("ref")?.let { it to (x.s37("text") ?: "") } }
    if (o.has("reminder") && !o.isNull("reminder")) s.remind = o.optBoolean("reminder", s.remind)
    persistBible37()
}

private fun AppViewModel.persistBible37() {
    val s = p37
    prefs.set(bibleKey37("days"), s.readDays.sorted().takeLast(800).joinToString(","))
    prefs.set(bibleKey37("best"), s.best)
    prefs.set(bibleKey37("saved"), JSONArray().apply { s.saved.forEach { (r, t) -> put(JSONObject().put("ref", r).put("text", t)) } }.toString())
    prefs.set(bibleKey37("plan"), s.plan)
    prefs.set(bibleKey37("pday"), s.planDay)
    prefs.set(bibleKey37("pdone"), s.planDone ?: "")
}

/** Rekken: dager på rad til og med i dag (eller i går, hvis dagens ikke er lest ennå). */
fun streak37(days: Set<String>, today: LocalDate = LocalDate.now(OSLO37)): Int {
    var d = if (today.toString() in days) today else today.minusDays(1)
    var n = 0
    while (d.toString() in days) { n++; d = d.minusDays(1) }
    return n
}

/** «Jeg har lest» eller «Ferdig» i leseplanen: teller i rekken. */
fun AppViewModel.markBibleRead37() {
    val s = p37
    val t = today37()
    if (t in s.readDays) return
    s.readDays = s.readDays + t
    s.best = maxOf(s.best, streak37(s.readDays))
    Haptics.success()
    persistBible37()
    bibleRead37()
    launch37 { runCatching { api37 { hlPost("/bible/read", JSONObject().put("date", t).put("period", biblePeriod37())) } } }
}

val PLANS37 = listOf(Triple("joh", "Johannes på 21 dager", 21), Triple("sal", "Salmene på 30 dager", 30), Triple("ord", "Ordspråkene på 31 dager", 31), Triple("mark", "Markus på 16 dager", 16))

/** «Johannes 8», «Salme 36–40» … og lenken på bibel.no. */
fun planChapter37(plan: String, day: Int): Pair<String, String> {
    val txt = when (plan) { "sal" -> "Salme ${day * 5 - 4}–${day * 5}"; "ord" -> "Ordspråkene $day"; "mark" -> "Markus $day"; else -> "Johannes $day" }
    return txt to "https://www.bibel.no/nettbibelen?parse=" + URLEncoder.encode(txt, "UTF-8")
}

fun AppViewModel.setPlan37(id: String) { val s = p37; if (s.plan == id) return; s.plan = id; s.planDay = 0; s.planDone = null; Haptics.select(); persistBible37(); syncPlan37() }

fun AppViewModel.planDoneToday37() {
    val s = p37
    if (s.planDone == today37()) return
    val total = PLANS37.firstOrNull { it.first == s.plan }?.third ?: 21
    s.planDay = (s.planDay + 1).coerceAtMost(total)
    s.planDone = today37()
    persistBible37()
    markBibleRead37()
    syncPlan37(done = true)
}

/** Leseplanen: PUT /api/bible/plan {plan}; «Ferdig» = POST /api/bible/plan/done (teller i rekken). */
private fun AppViewModel.syncPlan37(done: Boolean = false) = launch37 {
    val s = p37
    runCatching { api37 { if (done) hlPost("/bible/plan/done") else hlPut("/bible/plan", JSONObject().put("plan", s.plan)) } }
}

fun AppViewModel.toggleSaved37(v: Verse37) {
    val s = p37
    s.saved = if (s.saved.any { it.first == v.ref }) s.saved.filter { it.first != v.ref } else listOf(v.ref to v.text) + s.saved
    Haptics.select()
    persistBible37()
    syncSaved37()
}

private fun AppViewModel.syncSaved37() {
    val s = p37
    launch37 { runCatching { api37 { hlPut("/bible/saved", JSONObject().put("saved", JSONArray().apply { s.saved.forEach { (r, t) -> put(JSONObject().put("ref", r).put("text", t)) } })) } } }
}

fun AppViewModel.removeSaved37(ref: String) { p37.saved = p37.saved.filter { it.first != ref }; persistBible37(); syncSaved37() }

/** ✦ Forklar: Glimt (assist) gir 3–4 setninger, med lokal reserve. */
fun AppViewModel.explainVerse37(v: Verse37) {
    val s = p37
    if (s.explain != null) { s.explain = null; return }
    s.explain = "Glimt tenker …"
    launch37 {
        val srv = runCatching { JSONObject(api37 { hlPost("/bible/explain", JSONObject().put("ref", v.ref).put("text", v.text).put("period", v.period)) }).s37("text") }.getOrNull()
        val q = "Forklar kort (3–4 setninger, norsk bokmål) sammenhengen og betydningen av bibelverset ${v.ref}: «${v.text}»"
        val r = if (srv != null) null else runCatching { assist31(q, "bible") }.getOrNull()
        s.explain = srv ?: r?.text?.takeIf { it.isNotBlank() }
            ?: "«${v.ref}»: verset handler om å stole på Gud i hverdagen. Les gjerne versene rundt for sammenhengen, og tenk over hva det betyr for deg i dag."
    }
}
