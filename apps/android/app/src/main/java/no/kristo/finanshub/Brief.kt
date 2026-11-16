package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.ui.Fig35
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Glimt-brief ---------------- */

data class BriefWx34(
    val now: Int?, val hi: Int?, val lo: Int?, val cond: String, val code: Int?, val rain: List<Double>, val vsYesterday: String?, val sunset: String?, val place: String,
    val rainSoon: String,
)

data class BriefEv34(val id: String?, val title: String, val date: LocalDate, val start: String?, val loc: String?, val color: Long?, val startMin: Int?)

data class BriefNews34(val src: String, val title: String, val url: String?, val time: String?, val image: String? = null, val lead: String? = null) // prompt 35: bilde og ingress

data class Brief34(
    val kind: String, val title: String, val summary: String, val wx: BriefWx34?, val events: List<BriefEv34>, val news: List<BriefNews34>,
    val generatedAt: String?, val local: Boolean, val mood: String? = null, val note: String? = null,
    /** Prompt 35: prøver som slutter innen 7 dager, guide-runden fra serveren og verten (figur-id). */
    val trials: List<BriefTrial35> = emptyList(), val guide: List<Guide35> = emptyList(), val host: String? = null,
    /** Prompt 41: brief.ski {text, chip:'Ski: blå', …} når skiføret er relevant (snø ≥ 15 cm og «Skiføre» på). */
    val skiText: String? = null, val skiChip: String? = null, val skiItems: List<String> = emptyList(),
) {
    val next: BriefEv34? get() = events.firstOrNull()
    /** «8° lettskyet · Tannlege 15:15 · 3 nyheter». */
    val chips: List<String> get() = listOfNotNull(
        wx?.let { w -> (w.now?.let { "$it° " } ?: "") + w.cond },
        next?.let { e -> e.title + (e.start?.let { " $it" } ?: "") } ?: "Fri",
        if (news.isNotEmpty()) "${news.size} nyheter" else null,
        skiChip,
    )
    /** «NESTE OM 40 MIN» / «NESTE I MORGEN 06:15» / «FRI». */
    fun nextLabel(today: LocalDate = LocalDate.now(OSLO34), nowMin: Int = LocalTime.now(OSLO34).let { it.hour * 60 + it.minute }): String {
        val e = next ?: return "FRI"
        if (e.date == today && e.startMin != null) {
            val m = e.startMin - nowMin
            if (m >= 0) return "NESTE OM " + if (m < 60) "$m MIN" else "${Math.round(m / 60.0)} T"
        }
        return if (e.date == today.plusDays(1)) "NESTE I MORGEN " + (e.start ?: "") else "NESTE " + (e.start ?: "")
    }
}

fun briefKind34(h: Int = LocalTime.now(OSLO34).hour): String = if (h < 11) "morning" else if (h < 17) "day" else "evening"

fun briefTitle34(kind: String): String = when (kind) { "morning" -> "Morgenbrief"; "day" -> "Dagsbrief"; "night" -> "Nattbrief"; else -> "Kveldsbrief" }

/** WMO-kode → sol | delvis | regn | sno | sky (som wk() i prototypen). */
fun wxKind34(c: Int?): String = when {
    c == null -> "delvis"
    c <= 1 -> "sol"
    c == 2 -> "delvis"
    c in 51..67 || c in 80..82 -> "regn"
    c in 71..77 || c == 85 || c == 86 -> "sno"
    else -> "sky"
}

private fun wxText34(k: String) = when (k) { "sol" -> "klart"; "delvis" -> "lettskyet"; "regn" -> "regn"; "sno" -> "snø"; else -> "skyet" }

private fun pad34(n: Int) = n.toString().padStart(2, '0')

internal fun hm34(m: Int) = pad34((m / 60) % 24) + ":" + pad34(m % 60)

private fun cap34(s: String) = s.replaceFirstChar { it.uppercase() }

/** «15:15» fra «15:15», «2026-10-21T15:15:00+02:00» eller minutter. */
private fun timeOf34(v: Any?): Pair<String?, Int?> {
    when (v) {
        null -> return null to null
        is Number -> { val m = v.toInt(); return hm34(m) to m }
        else -> {
            val t = v.toString().trim()
            Regex("(\\d{1,2})[:.](\\d{2})").find(if (t.contains('T')) t.substringAfter('T') else t)?.let { m ->
                val h = m.groupValues[1].toInt(); val mi = m.groupValues[2].toInt()
                return pad34(h) + ":" + pad34(mi) to h * 60 + mi
            }
            return null to null
        }
    }
}

/** «20:31» i Oslo-tid fra ISO (UTC eller med sone) eller «20:31». */
private fun clock34(s: String): String =
    runCatching { java.time.OffsetDateTime.parse(s).atZoneSameInstant(OSLO34).toLocalTime().let { hm34(it.hour * 60 + it.minute) } }.getOrNull()
        ?: runCatching { java.time.Instant.parse(s).atZone(OSLO34).toLocalTime().let { hm34(it.hour * 60 + it.minute) } }.getOrNull()
        ?: timeOf34(s).first ?: s

private fun dateOf34(o: JSONObject): LocalDate {
    val raw = s34(o, "date", "d", "day") ?: s34(o, "start", "startAt", "s")?.takeIf { it.length >= 10 && it[4] == '-' }
    raw?.let { r -> runCatching { return LocalDate.parse(r.take(10)) } }
    return when (s34(o, "when", "rel")) { "i morgen", "tomorrow" -> LocalDate.now(OSLO34).plusDays(1); else -> LocalDate.now(OSLO34) }
}

private fun parseBriefWx34(w: JSONObject?): BriefWx34? {
    if (w == null) return null
    val nowO = w.optJSONObject("now")
    val now = (n34(w, "now", "temp", "t") ?: n34(nowO, "temp", "t", "temperature"))?.let { Math.round(it).toInt() }
    val code = (n34(w, "code", "weatherCode", "weather_code") ?: n34(nowO, "code"))?.toInt()
    val cond = s34(w, "cond", "text", "condition", "txt") ?: s34(nowO, "cond", "text") ?: wxText34(wxKind34(code))
    val rain = (arr34(w, "rain12h", "rain", "precip", "precipitation"))?.let { a ->
        (0 until a.length()).map { i -> when (val x = a.opt(i)) { is Number -> x.toDouble(); is JSONObject -> n34(x, "mm", "v", "value", "precipitation") ?: 0.0; else -> 0.0 } }
    } ?: emptyList()
    val vs = when (val v = w.opt("vsYesterday")) {
        is Number -> { val d = v.toInt(); if (d == 0) "Like varmt som i går" else "${Math.abs(d)} grader ${if (d < 0) "kaldere" else "varmere"} enn i går" }
        is String -> v.takeIf { it.isNotBlank() }
        is JSONObject -> s34(v, "text", "t") ?: n34(v, "diff", "delta")?.toInt()?.let { d -> if (d == 0) "Like varmt som i går" else "${Math.abs(d)} grader ${if (d < 0) "kaldere" else "varmere"} enn i går" }
        else -> null
    }
    val sunset = s34(w, "sunset", "solnedgang")?.let { timeOf34(it).first ?: it }
    val first = rain.indexOfFirst { it >= .2 }
    val h = LocalTime.now(OSLO34).hour
    val soon = s34(w, "rainSoon") ?: s34(w, "rainFrom")?.let { "regn fra ca. " + it.take(2) } ?: when { rain.isEmpty() -> "oppholdsvær"; first < 0 -> "oppholdsvær de neste 12 timene"; first == 0 -> "regn nå"; else -> "regn fra ca. " + pad34((h + first) % 24) }
    return BriefWx34(now, n34(w, "hi", "max", "high")?.let { Math.round(it).toInt() }, n34(w, "lo", "min", "low")?.let { Math.round(it).toInt() },
        cond, code, rain.take(12), vs, sunset, s34(w, "place", "sted", "name") ?: "Oslo", soon)
}

fun parseBrief34(raw: String, kind: String): Brief34? {
    val o0 = JSONObject(raw.trim())
    val o = o0.optJSONObject("brief") ?: o0
    val summary = s34(o, "summary", "text", "sum") ?: return null
    val k = s34(o, "kind") ?: kind
    val evs = objs34(arr34(o, "events", "calendar", "ev")).mapNotNull { e ->
        val t = s34(e, "title", "t", "summary") ?: return@mapNotNull null
        val tRaw = e.opt("time")?.takeIf { it is String && Regex("^\\d{1,2}[:.]\\d{2}$").matches(it.trim()) } ?: e.opt("start")?.let { v -> if (v is String && v.length > 16) clock34(v) else v } ?: e.opt("s") ?: e.opt("tm")
        val (tm, mi) = if (b34(e, "allDay") == true) (null to null) else timeOf34(tRaw)
        BriefEv34(s34(e, "id"), t, dateOf34(e), tm, s34(e, "location", "loc", "place", "sted"), hexColor34(s34(e, "color", "c")), mi)
    }
    val news = objs34(arr34(o, "news", "nyheter")).mapNotNull { n ->
        val t = s34(n, "title", "t") ?: return@mapNotNull null
        BriefNews34(s34(n, "source", "s", "feed") ?: "", t, s34(n, "url", "u", "link"), s34(n, "timeLabel", "time", "tm") ?: s34(n, "published")?.let { clock34(it) },
            s34(n, "image", "img", "thumb"), s34(n, "lead", "description", "d", "summary"))
    }
    return Brief34(k, s34(o, "title") ?: briefTitle34(k), summary, parseBriefWx34(o.optJSONObject("weather") ?: o.optJSONObject("wx")), evs.take(3), news.take(7),
        s34(o, "generatedAt", "madeAt", "generated")?.let { clock34(it) }, false, s34(o.optJSONObject("figure"), "mood") ?: s34(o, "mood", "state"), s34(o, "note", "warning"),
        parseTrials35(o.optJSONArray("trials")), parseGuide35(o.optJSONArray("guide")), s34(o, "host"),
        o.optJSONObject("ski")?.let { s34(it, "text") }, o.optJSONObject("ski")?.let { s34(it, "chip") },
        o.optJSONObject("ski")?.let { sk -> (sk.optJSONArray("chips") ?: sk.optJSONArray("items"))?.let { a -> (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { s34(it, "label", "text") } ?: a.optString(i).takeIf { it.isNotBlank() } } } } ?: emptyList())
}

/** Prototypens mal: «God kveld, Sebastian. Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply.» */
fun briefSummary34(kind: String, name: String, wx: BriefWx34?, next: BriefEv34?, today: LocalDate): String {
    val first = name.trim().substringBefore(' ')
    val hi = when (kind) { "morning" -> "God morgen" + (if (first.isNotBlank()) ", $first" else "") + ". "; "evening" -> "God kveld" + (if (first.isNotBlank()) ", $first" else "") + ". "; else -> "" }
    val w = wx?.let { cap34(it.cond) + (it.now?.let { t -> " og $t°" } ?: "") + " i ${it.place}, ${it.rainSoon}. " } ?: ""
    val e = when {
        next == null -> "Kalenderen er fri."
        next.date != today -> "I morgen starter du med ${next.title}" + (next.start?.let { " kl. $it" } ?: "") + "."
        else -> "Neste er ${next.title}" + (next.start?.let { " kl. $it" } ?: "") + "."
    }
    val umb = if (wx != null && wx.rainSoon.startsWith("regn")) " Ta med paraply." else ""
    return hi + w + e + umb
}

/* ---------------- Glimt-brief: henting ---------------- */

fun AppViewModel.loadBrief34(force: Boolean = false) {
    val s = p34
    val kind = briefKind35(p35.set.takeIf { p35.setLoaded }) // prompt 35: siste valgte brief (Innstillinger → Glimt)
    val acct = account?.id
    if (!force && s.briefFor == acct && s.brief?.kind == kind && System.currentTimeMillis() - s.briefAt < 10 * 60_000L) return
    if (s.briefFor != acct) { s.brief = null; s.tour = 0 }
    s.briefFor = acct
    // Prompt 73: siste brief (og kortene fra prompt 38) fra disk, så briefen vises med en gang.
    if (s.brief == null) cachedBrief73(kind)?.let { (cb, bx) -> s.brief = cb; if (bx != null) p38.bx = bx }
    s.briefBusy = true
    launch34 {
        try {
            loadGlimt35()
            // Prompt 73: 6 s. Svarer ikke serveren, blir den bufrede briefen stående (kortene forsvinner ikke).
            val raw = runCatching { api34 { hlGet("/brief?kind=$kind", timeout = 6_000) } }.getOrNull()
            val b = raw?.let { runCatching { parseBrief34(it, kind) }.getOrNull() }
            s.brief = b ?: s.brief ?: localBrief34(kind)
            // Prompt 38: pakker, familie, skole/jobb, bursdager og nordlys fra samme svar.
            raw?.let { r -> runCatching { parseBx38(r) }.getOrNull()?.let { p38.bx = it } }
            if (b != null && raw != null) saveBrief73(raw, kind)
            s.briefAt = System.currentTimeMillis()
            // Widgetene (Glance) får samme brief.
            runCatching { no.kristo.finanshub.widget.Brief34Store.save(appCtx34, s.brief!!, acct) }
        } finally { s.briefBusy = false }
    }
}

/** Uten /api/brief: briefen bygges av været, kalenderen og nyhetene appen allerede har. */
fun AppViewModel.localBrief34(kind: String = briefKind34()): Brief34 {
    val today = LocalDate.now(OSLO34)
    val nm = LocalTime.now(OSLO34).let { it.hour * 60 + it.minute }
    val w = mobileHome?.weather
    val wx = w?.let {
        val k = wxKind34(it.code)
        BriefWx34(it.temp?.let { t -> Math.round(t).toInt() }, it.max?.let { t -> Math.round(t).toInt() }, it.min?.let { t -> Math.round(t).toInt() },
            it.text?.lowercase()?.takeIf { t -> t.isNotBlank() } ?: wxText34(k), it.code, emptyList(), null, null, it.place.ifBlank { "Oslo" },
            if (k == "regn") "regn i dag" else "oppholdsvær")
    }
    val evs = (kal26.events ?: emptyList()).filter { e ->
        (e.date == today && (e.allDay || (e.end ?: e.start)?.let { t -> t.hour * 60 + t.minute > nm } != false)) || e.date == today.plusDays(1)
    }.sortedWith(compareBy({ it.date }, { it.start ?: LocalTime.MIN })).take(3).map { e ->
        BriefEv34(e.id, e.title, e.date, e.start?.let { hm34(it.hour * 60 + it.minute) }, e.room, e.color, e.start?.let { it.hour * 60 + it.minute })
    }
    val news = homeNews.ifEmpty { news?.items ?: emptyList() }.take(7).map { n -> BriefNews34(n.feed, n.title, n.url, n.published?.let { timeOf34(it).first }, n.image, n.excerpt) }
    return Brief34(kind, briefTitle34(kind), briefSummary34(kind, displayName, wx, evs.firstOrNull(), today), wx, evs, news,
        hm34(nm), true, note = "Laget på telefonen (serveren har ikke Glimt-brief ennå)")
}

fun AppViewModel.openBrief34() {
    Haptics.tap()
    p34.briefOpen = true
    loadBrief34()
}

fun AppViewModel.closeBrief34() {
    Haptics.back()
    p34.briefOpen = false
    stopSay35()
    if (p34.tour in 1..98) p34.tour = 99
}

/** Guide-runden: «Vis meg» → Vær → Kalender → Nyheter → slutt. Lett haptikk ved hvert steg. */
fun AppViewModel.tourNext34() {
    val s = p34
    Haptics.select()
    s.tour = if (s.tour >= 5) 99 else s.tour + 1
    s.tourSeq++
}

fun AppViewModel.tourTap34() {
    val s = p34
    Haptics.tap()
    s.tour = if (s.tour in 1..98) 99 else 1
    s.tourSeq++
}

fun AppViewModel.tourAutoKey34() = "brief34_tour_" + (account?.id ?: "")

fun AppViewModel.tourAuto34(): Boolean = prefs.bool(tourAutoKey34(), true)

fun AppViewModel.setTourAuto34(on: Boolean) {
    prefs.set(tourAutoKey34(), on); Haptics.select()
    launch34 { runCatching { api34 { hlPut("/brief/settings", JSONObject().put("guide", on)) } } }
}

fun AppViewModel.tourSeen34() { if (prefs.bool(tourAutoKey34() + "_seen", false)) return; prefs.set(tourAutoKey34() + "_seen", true) }

fun AppViewModel.tourWasSeen34(): Boolean = prefs.bool(tourAutoKey34() + "_seen", false)

fun AppViewModel.briefNotifyKey34() = "brief34_notify"

fun AppViewModel.briefNotify34(): Boolean = prefs.bool(briefNotifyKey34(), true)

fun AppViewModel.setBriefNotify34(on: Boolean) {
    prefs.set(briefNotifyKey34(), on)
    runCatching { appCtx34.getSharedPreferences("brief34_widgets", android.content.Context.MODE_PRIVATE).edit().putBoolean("notify", on).apply() }
    Haptics.select()
    launch34 { runCatching { api34 { hlPut("/brief/settings", JSONObject().put("notify", on)) } } }
}

/* ---------------- Guide-runden og prøveperioder i briefen ---------------- */

/** Ett steg i guide-runden: hvem som snakker (figur-id), kortet (vaer | kal | abo | nyh | null), tekst og knapp. */
data class Guide35(val target: String?, val text: String, val textEn: String?, val action: String, val char: String)

/** Prøve som slutter innen 7 dager (GET /api/brief → trials[]). */
data class BriefTrial35(val id: String, val service: String, val logo: String?, val endsAt: LocalDate?, val endsLabel: String, val daysLeft: Int, val priceLabel: String?,
    val progress: Float, val cancelUrl: String?)

private val WD35 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")

private fun endsLabel35(d: LocalDate) = WD35[d.dayOfWeek.value - 1] + " " + d.dayOfMonth + "."

internal fun parseGuide35(a: JSONArray?): List<Guide35> = objs34(a).mapNotNull { g ->
    val text = s35(g, "text", "t") ?: return@mapNotNull null
    val tg = s35(g, "target", "k")?.takeIf { it in setOf("vaer", "kal", "abo", "nyh") }
    Guide35(tg, text, s35(g, "textEn", "en"), s35(g, "action", "next", "button") ?: "Neste", Fig35.norm(s35(g, "char", "who")))
}

internal fun parseTrials35(a: JSONArray?, today: LocalDate = LocalDate.now(OSLO35)): List<BriefTrial35> = objs34(a).mapNotNull { t ->
    val id = s35(t, "id") ?: return@mapNotNull null
    val svc = s35(t, "service", "name", "n") ?: return@mapNotNull null
    val end = s35(t, "endsAt", "ends_at", "end")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    val days = n34(t, "daysLeft", "dd")?.toInt() ?: end?.let { trialDays32b(it, today) } ?: 0
    val prog = n34(t, "progress", "pc")?.toFloat()?.let { if (it > 1f) it / 100f else it } ?: end?.let { trialPct32b(it, null, today) } ?: .5f
    BriefTrial35(id, svc, s35(t, "logo"), end, s35(t, "endsLabel") ?: end?.let { endsLabel35(it) } ?: "", days,
        s35(t, "priceLabel") ?: n34(t, "price", "p", "price_after")?.let { "${it.toInt()} kr/mnd" }, prog.coerceIn(.04f, 1f), s35(t, "cancelUrl", "cancel_url"))
}

/** Prøvene i briefen: fra serveren, ellers fra Abonnementer (aktive, slutter innen 7 dager). */
fun AppViewModel.briefTrials35(b: Brief34?): List<BriefTrial35> {
    if (b != null && b.trials.isNotEmpty()) return b.trials.filter { it.id !in p35.trialsDone }
    val today = LocalDate.now(OSLO35)
    return p31.trials.filter { it.status == "active" && it.id !in p35.trialsDone }.mapNotNull { t ->
        val d = trialDays32b(t.endsAt, today)
        if (d < 0 || d > 7) null else BriefTrial35(t.id, t.service, null, t.endsAt, endsLabel35(t.endsAt), d, t.priceAfter.ifBlank { null },
            trialPct32b(t.endsAt, p32b.trialStart[t.id], today), t.cancelUrl)
    }.sortedBy { it.daysLeft }.take(3)
}

/** «✓ Jeg har avsluttet Viaplay»: markerer prøven avsluttet og fjerner påminnelsene. */
fun AppViewModel.trialDone35(t: BriefTrial35) {
    Haptics.success()
    p35.trialsDone = p35.trialsDone + t.id
    launch35 {
        val ok = runCatching { api35 { hlPost("/brief/trials/" + URLEncoder.encode(t.id, "UTF-8") + "/done") } }.isSuccess
        if (!ok) patchTrial31(t.id, "cancelled") else loadTrials31()
        flash("${t.service} er markert som avsluttet")
    }
}

internal fun cap35(s: String) = s.replaceFirstChar { it.uppercase() }

private fun n35no(n: Int) = when (n) { 1 -> "én"; 2 -> "to"; 3 -> "tre"; 4 -> "fire"; 5 -> "fem"; 6 -> "seks"; 7 -> "sju"; else -> n.toString() }

/** Guide-runden: fra serveren (guide[]) når den finnes, ellers samme replikker som fasiten (G0). */
fun AppViewModel.guide35(b: Brief34): List<Guide35> {
    val set = p35.set
    val host = b.host?.let { Fig35.norm(it) } ?: hostChar35(set.char)
    val list0 = b.guide.ifEmpty { localGuide35(b, host) }
    if (set.friends) return list0
    // Uten venner: bare verten, og tekstene skrives om uten vennene.
    return list0.map { g ->
        val t = g.text.replace(Regex("^Hei, det er (Sky|Dråpe)! "), "Været: ").replace(Regex("^(Og Sky her|Sky her igjen): "), "")
            .replace(Regex(" Nå (gir vi ordet tilbake til Glimt|tar Glimt over)!"), "").replace(Regex("^Uhu, Ugle her med kalenderen\\. "), "I kalenderen: ")
            .replace(Regex("^Nøff! Gris her\\. "), "").replace(Regex("^Glimt igjen! "), "")
        g.copy(text = t, action = g.action.replace(Regex("^Takk, (Sky|Dråpe|Gris)$"), "Neste"), char = host)
    }
}

private fun AppViewModel.localGuide35(b: Brief34, host: String): List<Guide35> {
    val w = b.wx
    val today = LocalDate.now(OSLO35)
    val wet = w != null && (w.cond.contains("regn") || w.cond.contains("snø") || w.rainSoon.startsWith("regn"))
    val wch = if (wet) "drape" else "sky"
    val wn = if (wet) "Dråpe" else "Sky"
    val wnEn = if (wet) "Drop" else "Sky"
    val out = ArrayList<Guide35>()
    out += Guide35(null, "Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din? Vennene mine hjelper til.", "Hi! I'm Glimt. Shall I show you your day? My friends will help.", "Vis meg", host)
    if (w != null) {
        val now = w.now?.let { "$it°" } ?: ""
        out += Guide35("vaer", "Hei, det er $wn! ${cap35(w.cond)}, $now nå og ${w.rainSoon}." + if (wet) " Jeg drypper litt, så ta med paraply!" else " Søylene viser nedbøren time for time.",
            "Hi, it's $wnEn! ${cap35(enCond35(w.cond))}, $now right now." + if (wet) " I'm dripping a bit, so bring an umbrella!" else " The bars show rain hour by hour.", "Takk, $wn", wch)
        if (!wet && w.sunset != null) out += Guide35("vaer", "Sky her igjen: sola går ned ${w.sunset}. Nå tar Glimt over!", "Sky again: the sun sets at ${w.sunset}. Back to Glimt!", "Neste", "sky")
    } else out += Guide35("vaer", "Jeg har ikke fått været ennå.", "I haven't got the weather yet.", "Neste", host)
    val n = b.next
    out += Guide35("kal",
        "Uhu, Ugle her med kalenderen. " + if (n != null) "${n.title} ${if (n.date == today) "i dag" else "i morgen"}" + (n.start?.let { " kl. $it" } ?: "") + ". Trykk på en avtale for å åpne Kalender." else "Kalenderen din er helt fri.",
        "Hoo, Owl here with your calendar. " + if (n != null) "${n.title} ${if (n.date == today) "today" else "tomorrow"}" + (n.start?.let { " at $it" } ?: "") + ". Tap an event to open Calendar." else "Your calendar is completely free.",
        "Neste", "ugle")
    briefTrials35(b).firstOrNull()?.takeIf { it.daysLeft <= 7 }?.let { t ->
        val whenNo = when (t.daysLeft) { 0 -> "i dag"; 1 -> "i morgen"; else -> "om ${t.daysLeft} dager" }
        val whenEn = when (t.daysLeft) { 0 -> "today"; 1 -> "tomorrow"; else -> "in ${t.daysLeft} days" }
        val price = t.priceLabel?.let { Regex("\\d+").find(it)?.value }
        out += Guide35("abo", "Nøff! Gris her. Prøveperioden på ${t.service} slutter $whenNo. Husk å avslutte den før ${t.endsLabel}" + (price?.let { ", ellers koster den $it kroner i måneden." } ?: "."),
            "Oink! Piggy here. Your ${t.service} trial ends $whenEn. Remember to cancel it" + (price?.let { ", or it will cost $it kroner a month." } ?: "."), "Takk, Gris", "gris")
    }
    out += Guide35("nyh", if (b.news.isNotEmpty()) "Glimt igjen! Her er de ${n35no(minOf(b.news.size, 7))} viktigste nyhetene. Trykk for å lese hele." else "Glimt igjen! Ingen nyheter akkurat nå.",
        "Glimt again! Here are the top stories. Tap to read more.", "Neste", host)
    out += Guide35(null, "Det var alt for nå. Trykk på meg når du vil ha en ny runde.", "That's all for now. Tap me whenever you want another round.", "Takk, Glimt", host)
    return out
}

private fun enCond35(c: String) = when (c.lowercase()) { "klart" -> "clear"; "lettskyet" -> "partly cloudy"; "skyet" -> "cloudy"; "regn" -> "rain"; "snø" -> "snow"; else -> c }

/* ---------------- Guide-runden ---------------- */

fun AppViewModel.tourNext35() {
    val s = p34
    Haptics.select()
    s.tour = if (s.tour >= p35.tourLen) 99 else s.tour + 1
    s.tourSeq++
}

fun AppViewModel.tourSkip35() { Haptics.select(); stopSay35(); p34.tour = 99; p34.tourSeq++ }

/* ======================= Brief-kortet: sveip bort ======================= */

/** Perioden briefen hører til (morgen < 11, dag < 17, kveld < 21, natt). */
fun briefPeriod36(h: Int = LocalTime.now(OSLO36).hour): String = when { h < 11 -> "morgen"; h < 17 -> "dag"; h < 21 -> "kveld"; else -> "natt" }

fun briefKey36(): String = LocalDate.now(OSLO36).toString() + "|" + briefPeriod36()

/** «kveldsbriefen kl. 17». */
fun briefNext36(h: Int = LocalTime.now(OSLO36).hour): String = when { h < 11 -> "dagsbriefen kl. 11"; h < 17 -> "kveldsbriefen kl. 17"; h < 21 -> "nattbriefen kl. 21"; else -> "morgenbriefen kl. 07" }

private fun AppViewModel.briefHideKey36() = "glimt_brief_hide36_" + (account?.id ?: "")

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

/* ======================= Modeller ======================= */

data class BxPkg38(val carrier: String, val logo: String?, val name: String, val status: String, val due: String?, val dueRed: Boolean)

data class BxFam38(val name: String, val avatar: String?, val color: Long?, val state: String, val place: String?, val since: String?, val dot: Long? = null)

data class BxSchool38(val title: String, val kind: String?, val date: String?, val daysLeft: Int?, val color: Long?, val red: Boolean)

data class BxBd38(val name: String, val age: Int?, val date: String?, val daysLeft: Int?, val text: String? = null, val red: Boolean? = null, val color: Long? = null)

data class BxAurora38(val kp: Double?, val cloud: Int?, val best: String?, val text: String?, val show: Boolean, val label: String? = null, val source: String? = null)

data class BriefX38(
    val packages: List<BxPkg38>?, val family: List<BxFam38>?, val school: List<BxSchool38>?, val birthdays: List<BxBd38>?, val aurora: BxAurora38?,
    /** Rekkefølge og av/på fra briefen (cards:[{id, on}]); tom = bruk Innstillinger → Glimt. */
    val cards: List<Pair<String, Boolean>> = emptyList(), val pkLabel: String? = null, val famLabel: String? = null,
)

class P38State {
    // QR-innlogging
    var qrOpen by mutableStateOf(false)
    var qrCode by mutableStateOf("")
    var qrBusy by mutableStateOf(false)
    var qrErr by mutableStateOf<String?>(null)
    var qrAsk by mutableStateOf<QrAsk38?>(null)
    var qrResult by mutableStateOf<QrResult38?>(null)
    /** Kode fra en deep link før appen er logget inn (brukes etter innlogging). */
    var qrPending: String? = null

    // Konto → ØKT
    var outAsk by mutableStateOf(false)
    var allOpen by mutableStateOf(false)
    var allPw by mutableStateOf("")
    var allBusy by mutableStateOf(false)
    var allErr by mutableStateOf<String?>(null)
    var sessions by mutableStateOf<Int?>(null)

    // Hjem: svarboblen (posisjon i roten) for laget som fanger trykk utenfor
    var ansRect by mutableStateOf<Rect?>(null)

    // Brief
    var bx by mutableStateOf<BriefX38?>(null)
    var cards by mutableStateOf<List<Pair<String, Boolean>>>(emptyList())
    val gifts = mutableStateListOf<String>()

    // Domener
    var domSumOpen by mutableStateOf(false)
    var domSum by mutableStateOf<DomSum38?>(null)
    var domSumBusy by mutableStateOf(false)
    var domPrefAt = 0L

    // AI-kontroll
    var hw by mutableStateOf<Hw38?>(null)
    var recommend by mutableStateOf<List<AiRec38>>(emptyList())
    var finRt by mutableStateOf<List<FinRt38>?>(null)
    /** Serveren sier at ingen modeller er installert eller tilkoblet (empty:true). */
    var finEmpty by mutableStateOf(false)

    // «Starter opp»
    var startClosedAt = 0L
}

/* ======================= Brief: nye kort ======================= */

private fun int38(o: JSONObject?, vararg k: String): Int? = k.firstNotNullOfOrNull { key -> o?.let { if (it.has(key) && !it.isNull(key)) it.optDouble(key).takeIf { d -> !d.isNaN() }?.toInt() else null } }

private fun items38(o: JSONObject, k: String): List<JSONObject>? {
    val v = o.opt(k) ?: return null
    return when (v) {
        is JSONObject -> objs34(v.optJSONArray("items"))
        is JSONArray -> objs34(v)
        else -> null
    }
}

fun parseBx38(raw: String): BriefX38 {
    val o0 = JSONObject(raw.trim())
    val o = o0.optJSONObject("brief") ?: o0
    val pk = items38(o, "packages")?.mapNotNull { x ->
        val n = x.s37("name") ?: x.s37("title") ?: return@mapNotNull null
        BxPkg38(x.s37("carrier") ?: "", x.s37("logo"), n, x.s37("status") ?: "", x.s37("due"), x.b37("dueRed") ?: false)
    }
    val fam = items38(o, "family")?.mapNotNull { x ->
        val n = x.s37("name") ?: return@mapNotNull null
        BxFam38(n, x.s37("avatar"), hex37(x.s37("color")), x.s37("state") ?: "", x.s37("place"), x.s37("since"), hex37(x.s37("dot")))
    }
    val sk = items38(o, "school")?.mapNotNull { x ->
        val t = x.s37("title") ?: return@mapNotNull null
        val dl = int38(x, "daysLeft")
        BxSchool38(t, x.s37("kind"), x.s37("date"), dl, hex37(x.s37("color")), x.b37("red") ?: (dl != null && dl <= 4))
    }
    val bd = items38(o, "birthdays")?.mapNotNull { x ->
        val n = x.s37("name") ?: return@mapNotNull null
        BxBd38(n, int38(x, "age"), x.s37("date"), int38(x, "daysLeft"), x.s37("text"), x.b37("red"), hex37(x.s37("color")))
    }
    val au = o.optJSONObject("aurora")?.let { a ->
        BxAurora38(a.d37("kp"), int38(a, "cloud"), a.s37("best"), a.s37("text"), a.b37("show") ?: true, a.s37("label"), a.s37("source"))
    }
    val cards = objs34(o.optJSONArray("cards")).mapNotNull { c -> c.s37("id")?.let { it to (c.b37("on") ?: true) } }
    return BriefX38(pk, fam, sk, bd, au, cards, o.optJSONObject("packages")?.s37("label"), o.optJSONObject("family")?.s37("label"))
}

/** Kortrekkefølge og av/på (Innstillinger → Glimt → Brief). Tom liste = standard. */
fun AppViewModel.loadBriefCards38() = launch38 {
    try {
        val o = JSONObject(api38 { hlGet("/glimt/settings", timeout = 6_000) })
        val a = (o.optJSONObject("settings") ?: o).optJSONArray("cards")
        if (a != null) p38.cards = objs34(a).mapNotNull { c -> c.s37("id")?.let { it to (c.b37("on") ?: true) } }
    } catch (e: CancellationException) { throw e } catch (_: Exception) {}
}

/** Reserve uten serverdata: bursdagene appen allerede har (neste 30 dager). */
fun AppViewModel.localBirthdays38(): List<BxBd38> = (bd24.items ?: emptyList()).filter { it.daysLeft in 0..30 }.sortedBy { it.daysLeft }.take(3)
    .map { BxBd38(it.name, it.age, it.next.toString(), it.daysLeft) }

/** «+ Gave til X i Gjøremål»: «Kjøp gave til X» i Mine to dager før (#gave). */
fun AppViewModel.addGift38(b: BxBd38) {
    val s = p38
    if (b.name in s.gifts) return
    s.gifts.add(b.name)
    Haptics.success()
    launch38 {
        try {
            api38 { hlPost("/brief/gift", JSONObject().put("name", b.name).put("date", b.date ?: JSONObject.NULL)) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            if (e is ApiException && (e.status == 404 || e.status == 405)) {
                val d = b.date?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: LocalDate.now().plusDays(((b.daysLeft ?: 2)).toLong())
                val due = d.minusDays(2).let { if (it.isBefore(LocalDate.now())) LocalDate.now() else it }
                addTask("Kjøp gave til ${b.name} #gave", null, due.toString(), null)
            } else { s.gifts.remove(b.name); message = "Fikk ikke lagt til gaven" }
        }
    }
}

/* ======================= Brief-kortene per innlogget bruker ======================= */

data class Card52(val id: String, val variant: String, val title: String, val data: JSONObject?, val error: String?)

data class Brief52(val name: String, val greeting: String, val dateLabel: String, val char: String?, val cards: List<Card52>, val admin: Boolean)

internal fun parseBrief52(raw: String): Brief52? = runCatching {
    val o = JSONObject(raw)
    val u = o.optJSONObject("user")
    val a = o.optJSONArray("cards") ?: JSONArray()
    Brief52(
        u?.s52("first") ?: u?.s52("name") ?: "", o.s52("greeting") ?: "", o.s52("date_label") ?: "", o.s52("glimt_char"),
        (0 until a.length()).mapNotNull { i ->
            val c = a.optJSONObject(i) ?: return@mapNotNull null
            Card52(c.s52("id") ?: return@mapNotNull null, c.s52("variant") ?: "", c.s52("title") ?: "", c.optJSONObject("data"), c.s52("error"))
        },
        u?.optBoolean("admin", false) == true,
    )
}.getOrNull()

/** Kortene for den som er logget inn (ingen velger). Eldre server (404): ingen kort, briefen ellers som før. */
fun AppViewModel.loadBrief52(force: Boolean = false) {
    val s = p52b
    val a = account?.id
    if (!force && s.briefFor == a && s.brief != null) return
    if (s.briefFor != a) { s.brief = null; s.briefFor = a }
    if (s.briefBusy) return
    s.briefBusy = true
    launch52b {
        try { runCatching { api52b { hlGet("/brief52", timeout = 10_000) } }.getOrNull()?.let(::parseBrief52)?.let { s.brief = it } }
        finally { s.briefBusy = false }
    }
}

/** Homelab-kortet: Start (stoppet) eller omstart (unhealthy) via serverens trygge handling. Bare admin. */
fun AppViewModel.startService52(id: String) {
    val s = p52b
    if (id in s.starting) return
    s.starting = s.starting + id
    Haptics.tap()
    launch52b {
        try {
            api52b { hlPost("/brief52/homelab/" + URLEncoder.encode(id, "UTF-8") + "/start") }
            Haptics.success()
            flash("Starter tjenesten …")
            delay(2_500)
            loadBrief52(force = true)
            retryBriefCard73("homelab") // prompt 73: kortet i briefen hentes per kort
        } catch (e: ApiException) {
            flash(if (e.status == 403) "Bare admin kan starte tjenester" else e.message ?: "Fikk ikke startet tjenesten")
        } catch (e: Exception) {
            flash("Fikk ikke kontakt med serveren")
        } finally { s.starting = s.starting - id }
    }
}

data class Item73(val key: String, val title: String, val sub: String, val on: Boolean)

object B73 {
    /** [key, tittel, kilde, på] – samme som server/glimt/brief-content.js CATALOG73 (reserve uten server). */
    val CATALOG = listOf(
        Item73("vaer", "Vær", "Nå, i dag og varsel", true), Item73("kal", "Kalender", "Første avtale og resten av dagen", true),
        Item73("fokus", "Dagens fokus", "Det viktigste i dag, valgt av Glimt", true), Item73("gjore", "Gjøremål · 3 viktigste", "Fra Gjøremål", true),
        Item73("reise", "Min reise", "Ruter: neste avgang og når du må gå", true), Item73("regn", "Regninger denne uka", "Fra Finans", true),
        Item73("kveld", "Nytt i kveld", "Nye episoder og filmer fra Media", true), Item73("nyheter", "Nyheter", "Sammendrag fra Nyheter", true),
        Item73("pakker", "Pakker", "Sporing på vei", false), Item73("homelab", "Homelab-status", "Varsler fra serveren", false),
        Item73("domener", "Domener og SSL", "Utløper snart", false), Item73("klaer", "Klær i dag", "Hva du bør ha på deg, fra Vær", true),
        Item73("abo", "Prøveperioder", "Fra Abonnementer", true), Item73("bibel", "Bibelvers", "Dagens vers", true),
        Item73("familie", "Familie", "De som deler posisjon", true), Item73("skole", "Skole og jobb", "Prøver og frister neste 7 dager", true),
        Item73("bursdager", "Bursdager", "Neste bursdager", true), Item73("nordlys", "Nordlys i natt", "Når Kp er høy nok", true),
        Item73("aksjer", "Aksjer", "Porteføljen fra Finans", false),
    )
    /** Nøkkel → id i /api/brief52. */
    val B52 = mapOf("fokus" to "focus", "gjore" to "todo", "reise" to "trip", "regn" to "bills", "kveld" to "tonight",
        "homelab" to "homelab", "domener" to "domains", "klaer" to "clothes", "aksjer" to "stocks")
    /** Kortets høyde ferdig (dp) – skjelettet tar samme plass. */
    val HEIGHT = mapOf("vaer" to 280, "kal" to 150, "fokus" to 190, "gjore" to 230, "reise" to 180, "regn" to 250, "kveld" to 146, "nyheter" to 760,
        "pakker" to 150, "homelab" to 200, "domener" to 200, "klaer" to 150, "abo" to 160, "bibel" to 260, "familie" to 120, "skole" to 160,
        "bursdager" to 140, "nordlys" to 100, "aksjer" to 130)

    var items by mutableStateOf(CATALOG)
    var err by mutableStateOf<String?>(null)
    internal var who: String? = "-"
    internal var listAt = 0L

    /** Kortdata fra /api/brief52 per id, status ("loading", "ok", "stale", "fail") og tidspunkt. */
    val cards = mutableStateMapOf<String, Card52>()
    val state = mutableStateMapOf<String, String>()
    val at = mutableStateMapOf<String, Long>()
    internal val raw = HashMap<String, JSONObject>()
    internal var cardsFor: String? = "-"
    internal var fetchAt = 0L

    val onKeys: List<String> get() = items.filter { it.on }.map { it.key }
    val countText: String get() = "${items.count { it.on }} av ${items.size} på"
    fun title(key: String): String = items.firstOrNull { it.key == key }?.title ?: CATALOG.firstOrNull { it.key == key }?.title ?: key
    fun height(key: String): Int = HEIGHT[key] ?: 150
}

private fun sp73(ctx: Context) = ctx.getSharedPreferences("brief73", Context.MODE_PRIVATE)

private fun JSONObject.s73(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun parseItems73(raw: String): List<Item73>? = runCatching {
    val a = JSONObject(raw).optJSONArray("cards") ?: JSONArray(raw)
    (0 until a.length()).mapNotNull { i ->
        val c = a.optJSONObject(i) ?: return@mapNotNull null
        val k = c.s73("key") ?: return@mapNotNull null
        Item73(k, c.s73("title") ?: k, c.s73("sub") ?: "", c.optBoolean("on", false))
    }.takeIf { it.isNotEmpty() }
}.getOrNull()

private fun itemsJson73(l: List<Item73>): JSONArray = JSONArray().apply { l.forEach { put(JSONObject().put("key", it.key).put("title", it.title).put("sub", it.sub).put("on", it.on)) } }

/** Lista og kortcachen fra disk for kontoen som er logget inn. */
fun AppViewModel.hydrateBrief73() {
    val a = account?.id
    val ctx = appCtx52b
    if (B73.who != a) {
        B73.who = a
        B73.listAt = 0L
        B73.items = sp73(ctx).getString("list_${a ?: ""}", null)?.let(::parseItems73) ?: B73.CATALOG
    }
    if (B73.cardsFor != a) {
        B73.cardsFor = a
        B73.cards.clear(); B73.state.clear(); B73.at.clear(); B73.raw.clear(); B73.fetchAt = 0L
        sp73(ctx).getString("c52_${a ?: ""}", null)?.let { s ->
            runCatching {
                val o = JSONObject(s)
                o.keys().forEach { id ->
                    val c = o.optJSONObject(id) ?: return@forEach
                    B73.raw[id] = c
                    B73.at[id] = c.optLong("_at", 0L)
                    B73.cards[id] = card73(id, c)
                }
            }
        }
    }
}

private fun card73(id: String, c: JSONObject) = Card52(id, c.s73("variant") ?: "", c.s73("title") ?: id, c.optJSONObject("data"), c.s73("error"))

private fun AppViewModel.persistCards73() {
    val o = JSONObject()
    B73.raw.forEach { (id, c) -> o.put(id, JSONObject(c.toString()).put("_at", B73.at[id] ?: 0L)) }
    sp73(appCtx52b).edit().putString("c52_${account?.id ?: ""}", o.toString()).apply()
}

private fun AppViewModel.persistList73() {
    sp73(appCtx52b).edit().putString("list_${account?.id ?: ""}", itemsJson73(B73.items).toString()).apply()
}

/** Henter lista (høyst hvert minutt uten force). */
fun AppViewModel.loadBriefCards73(force: Boolean = false) {
    hydrateBrief73()
    if (!force && System.currentTimeMillis() - B73.listAt < 60_000L) return
    B73.listAt = System.currentTimeMillis()
    launch52b {
        try {
            parseItems73(api52b { hlGet("/brief-cards", timeout = 6_000) })?.let { B73.items = it; B73.err = null; persistList73() }
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status != 404) B73.err = "Fikk ikke hentet lista. Viser den lagrede."
        } catch (_: Exception) { /* uten nett: lista fra disk gjelder */ }
    }
}

private fun AppViewModel.saveBriefCards73(l: List<Item73>) {
    B73.items = l
    persistList73()
    val body = JSONObject().put("cards", JSONArray().apply { l.forEach { put(JSONObject().put("key", it.key).put("on", it.on)) } })
    launch52b {
        try {
            parseItems73(api52b { hlPut("/brief-cards", body) })?.let { B73.items = it; persistList73() }
            B73.err = null
            loadBrief34(force = true) // Glimts oppsummering tar bare med kortene som er på
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            B73.err = "Lagret på telefonen. Synkes når nettet er tilbake."
        }
    }
    fetchBriefCards73(force = true)
}

fun AppViewModel.toggleBriefCard73(key: String) {
    Haptics.tap()
    saveBriefCards73(B73.items.map { if (it.key == key) it.copy(on = !it.on) else it })
}

fun AppViewModel.moveBriefCard73(key: String, by: Int) {
    val l = B73.items.toMutableList()
    val i = l.indexOfFirst { it.key == key }
    val j = i + by
    if (i < 0 || j < 0 || j >= l.size) return
    Haptics.tap()
    val x = l[i]; l[i] = l[j]; l[j] = x
    saveBriefCards73(l)
}

/** Dra-for-å-flytte: legger kortet på plass `to`. */
fun AppViewModel.placeBriefCard73(key: String, to: Int) {
    val l = B73.items.toMutableList()
    val i = l.indexOfFirst { it.key == key }
    if (i < 0) return
    val j = to.coerceIn(0, l.size - 1)
    if (i == j) return
    l.add(j, l.removeAt(i))
    saveBriefCards73(l)
}

fun AppViewModel.resetBriefCards73() {
    Haptics.tap()
    launch52b {
        try {
            parseItems73(api52b { hlPost("/brief-cards/reset") })?.let { B73.items = it; persistList73() }
            B73.err = null
            fetchBriefCards73(force = true)
            loadBrief34(force = true)
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            B73.err = "Fikk ikke tilbakestilt. Prøv igjen."
        }
    }
}

/** Alle kortene fra /api/brief52 som er på – samtidig, 6 s hver. Ett tregt kort holder ikke igjen de andre. */
fun AppViewModel.fetchBriefCards73(force: Boolean = true) {
    hydrateBrief73()
    if (!force && System.currentTimeMillis() - B73.fetchAt < 5 * 60_000L) return
    B73.fetchAt = System.currentTimeMillis()
    val ids = B73.onKeys.mapNotNull { B73.B52[it] }.filter { B73.state[it] != "loading" }
    if (ids.isEmpty()) return
    ids.forEach { B73.state[it] = "loading" }
    launch52b {
        coroutineScope {
            ids.map { id -> async { id to fetchOne73(id) } }.awaitAll()
        }.forEach { (id, res) -> applyCard73(id, res) }
        persistCards73()
    }
}

/** Ett kort på nytt («Prøv igjen»). */
fun AppViewModel.retryBriefCard73(id: String) {
    Haptics.tap()
    B73.state[id] = "loading"
    launch52b { applyCard73(id, fetchOne73(id)); persistCards73() }
}

/** Forhåndshenting (forgrunn, Hjem vises): maks hvert 5. minutt. */
fun AppViewModel.prefetchBrief73() {
    loadBriefCards73()
    fetchBriefCards73(force = false)
}

/** null = feil/tidsavbrudd; JSONObject.NULL-lignende tomt objekt = kortet finnes ikke for brukeren. */
private suspend fun AppViewModel.fetchOne73(id: String): Pair<Boolean, JSONObject?>? = try {
    withTimeoutOrNull(6_000L) {
        val raw = api52b { hlGet("/brief52?only=" + URLEncoder.encode(id, "UTF-8"), timeout = 6_000) }
        val a = JSONObject(raw).optJSONArray("cards") ?: JSONArray()
        true to (0 until a.length()).mapNotNull { a.optJSONObject(it) }.firstOrNull { it.s73("id") == id }
    }
} catch (e: CancellationException) { throw e } catch (e: ApiException) {
    if (e.status == 404) (true to null) else null
} catch (_: Exception) { null }

private fun applyCard73(id: String, res: Pair<Boolean, JSONObject?>?) {
    val c = res?.second
    when {
        res == null -> B73.state[id] = if (B73.raw[id]?.optJSONObject("data") != null) "stale" else "fail"
        c == null -> { B73.raw.remove(id); B73.cards.remove(id); B73.state[id] = "ok" }
        c.optJSONObject("data") == null && c.s73("error") != null && !c.optBoolean("empty", false) ->
            B73.state[id] = if (B73.raw[id]?.optJSONObject("data") != null) "stale" else "fail"
        else -> { B73.raw[id] = c; B73.at[id] = System.currentTimeMillis(); B73.cards[id] = card73(id, c); B73.state[id] = "ok" }
    }
}

/** Prompt 73: siste svar fra /api/brief per bruker (for Vær, Kalender, Nyheter, Pakker … fra første bilde). */
internal fun AppViewModel.saveBrief73(raw: String, kind: String) {
    sp73(appCtx52b).edit().putString("b34_${account?.id ?: ""}", raw).putString("b34kind_${account?.id ?: ""}", kind).apply()
}

internal fun AppViewModel.cachedBrief73(kind: String): Pair<Brief34, BriefX38?>? {
    val sp = sp73(appCtx52b)
    val a = account?.id ?: ""
    val raw = sp.getString("b34_$a", null) ?: return null
    val b = runCatching { parseBrief34(raw, sp.getString("b34kind_$a", null) ?: kind) }.getOrNull() ?: return null
    return b to runCatching { parseBx38(raw) }.getOrNull()
}
