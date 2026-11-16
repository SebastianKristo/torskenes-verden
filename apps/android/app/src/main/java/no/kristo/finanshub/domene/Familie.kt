@file:JvmName("DomeneFamilie")

package no.kristo.finanshub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import no.kristo.felles.nett.openSikker
import no.kristo.finanshub.family.FamilyPrefs
import org.json.JSONArray
import org.json.JSONObject

/*
 * Familie: kode som lå i blandingsfilene (P41.kt, P42.kt, P45.kt, P45b.kt, Models.kt, Models.kt, Mod24B.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

data class Zone41(val id: String, val name: String, val lat: Double, val lon: Double, val radius: Int, val label: String)

/* ======================= Skolesoner og «forlot skolen» ======================= */

fun AppViewModel.loadZones41() {
    val s = p41
    launch41 {
        runCatching {
            val o = JSONObject(api41 { hlGet("/ruter/school-zones") })
            s.zones = objs34(o.optJSONArray("zones")).mapNotNull { z ->
                val id = z.s37("id") ?: return@mapNotNull null
                Zone41(id, z.s37("name") ?: "Skole", z.optDouble("lat"), z.optDouble("lon"), z.optInt("radius_m", 150), z.s37("label") ?: "${z.s37("name") ?: "Skole"} ${z.optInt("radius_m", 150)} m")
            }
        }
        // Prompt 50 (P50Fam.kt): én region per område fra Familie › Steder (skolen er et sted med type skole). Eldre server: som før.
        refreshRegions50()
        if (!fam50.regionsOk) runCatching { SchoolZones41.save(appCtx40, s.zones ?: emptyList(), base39, token39) }
    }
}

fun AppViewModel.addZone41(name: String, lat: Double, lon: Double, radius: Int) {
    val s = p41
    if (radius !in 50..300) { s.zoneErr = "Radius må være 50–300 m"; return }
    launch41 {
        try {
            api41 { hlPost("/ruter/school-zones", JSONObject().put("name", name.ifBlank { "Skole" }).put("lat", lat).put("lon", lon).put("radius_m", radius)) }
            s.zoneAdd = false; s.zoneErr = null
            loadZones41()
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { s.zoneErr = uiErr73(e, "Fikk ikke lagret sonen") }
    }
}

fun AppViewModel.deleteZone41(z: Zone41) {
    val s = p41
    if ((s.zones?.size ?: 0) <= 1) { message = "Den siste skolesonen kan ikke slettes"; return }
    launch41 {
        runCatching { api41 { hlDelete("/ruter/school-zones/" + URLEncoder.encode(z.id, "UTF-8")) } }.onFailure { message = it.message }
        loadZones41()
    }
}

/** Huskebeskjed fra Hjem-søk: samme Glimt-animasjon som for avtaler (AI-toasten med stjerne), så bakgrunnsjobben. */
private val HUSKE_STEPS41 = listOf("Leser beskjeden", "Deler opp i punkter", "Finner rekkefølge og steder", "Lagrer i Gjøremål")

fun AppViewModel.huskeHome41(text: String) {
    val q = text.trim()
    if (q.isEmpty()) return
    Haptics.tap()
    val id = "huske41-" + System.currentTimeMillis()
    val t0 = System.currentTimeMillis()
    val list = "Gjøremål"
    fun job(cur: Int, state: String, fields: List<Pair<String, String>>) = AiJob31(id, "huske", "Legger til i Gjøremål", "Glimt", q,
        HUSKE_STEPS41.mapIndexed { i, l -> AiStep31(l, if (i < cur || state == "done") "done" else if (i == cur) "active" else "pending") }, fields, ((cur + 1) * 100 / HUSKE_STEPS41.size).coerceAtMost(95), state, t0)
    val baseFields = listOf("Beskjed" to q.take(60), "Liste" to list, "Original" to "lagres i «Laget med Glimt»")
    fun put(j: AiJob31) { p31.jobs = p31.jobs.filter { it.id != id } + j }
    put(job(0, "running", baseFields))
    var started = false
    huskeFromHome41(q) { ok -> started = ok }
    launch41 {
        for (i in 1 until HUSKE_STEPS41.size) { delay(650); put(job(i, "running", baseFields)) }
        delay(650)
        val before = p41.glimtJobs.any { it.text == q }
        p31.jobs = p31.jobs.filter { it.id != id }
        p31.toastMsg = when {
            !started && !before -> "Fikk ikke lagt beskjeden i Gjøremål"
            p41.glimtJobs.any { it.text == q } -> "✦ Glimt deler opp i bakgrunnen …"
            else -> p41.glimtDone ?: "✓ Glimt la beskjeden i Gjøremål"
        }
        p31.toastSeq++
    }
}

/* ======================= Familie → Soner: ikonsøk (innebygde + Lucide/Tabler via Iconify) ======================= */

/** Norske søkeord og synonymer for de innebygde sone-ikonene (nøkkel → ord). */
val ICON_SYN42: Map<String, List<String>> = mapOf(
    "home" to listOf("hjem", "hus", "bolig", "leilighet"), "work" to listOf("jobb", "arbeid", "kontor"), "school" to listOf("skole", "universitet", "studie"),
    "heart" to listOf("familie", "mormor", "farmor", "besteforeldre", "kjæreste"), "cabin" to listOf("hytte", "hytta", "fritidsbolig"),
    "gym" to listOf("trening", "treningssenter", "styrke", "vekter"), "shop" to listOf("butikk", "handel", "senter"), "ball" to listOf("sport", "fotball", "bane", "idrett"),
    "coffee" to listOf("kafé", "kafe", "kaffe"), "tree" to listOf("natur", "skog", "park", "tur"), "plane" to listOf("reise", "fly", "flyplass", "ferie"),
    "star" to listOf("favoritt", "stjerne"), "pin" to listOf("sted", "punkt", "markør"), "car" to listOf("bil", "parkering", "garasje"), "bus" to listOf("buss", "holdeplass"),
    "train" to listOf("tog", "stasjon", "t-bane", "trikk"), "bike" to listOf("sykkel", "sykle"), "boat" to listOf("båt", "seil", "ferje", "brygge"),
    "hospital" to listOf("sykehus", "legevakt"), "doctor" to listOf("lege", "helse", "tannlege"), "pill" to listOf("apotek", "medisin"), "church" to listOf("kirke", "menighet"),
    "book" to listOf("bibliotek", "bok", "lesing"), "music" to listOf("musikk", "korps", "kor", "konsert"), "film" to listOf("kino", "film"),
    "food" to listOf("restaurant", "mat", "spise"), "cart" to listOf("matbutikk", "dagligvare", "kiwi", "rema", "meny", "coop"), "fuel" to listOf("bensin", "drivstoff", "stasjon"),
    "bolt" to listOf("lading", "strøm", "elbil"), "paw" to listOf("dyr", "hund", "katt", "veterinær", "stall", "hest"), "baby" to listOf("barnehage", "barn", "baby"),
    "swim" to listOf("svømmehall", "svømming", "bad", "basseng"), "ski" to listOf("ski", "slalåm", "langrenn", "løype"), "tent" to listOf("camping", "telt"),
    "mountain" to listOf("fjell", "topp", "fjelltur"), "beach" to listOf("strand", "sjø", "bading"), "sun" to listOf("sol", "sommer"), "gift" to listOf("gave", "jul", "høytid"),
    "cake" to listOf("bursdag", "kake", "selskap", "fest"), "game" to listOf("spill", "gaming"), "laptop" to listOf("kontor", "data", "pc", "hjemmekontor"),
    "tool" to listOf("verksted", "verktøy", "bilverksted"), "key" to listOf("utleie", "nøkkel", "airbnb"), "bed" to listOf("hotell", "overnatting", "seng"),
    "flag" to listOf("mål", "flagg"), "bell" to listOf("varsel", "bjelle"), "camera" to listOf("foto", "kamera"), "anchor" to listOf("havn", "anker", "marina"),
    "leaf" to listOf("hage", "kolonihage", "blad"),
)

/** Norsk → engelsk før søket i Iconify (båt → boat, kirke → church, hytte → cabin, trening → barbell …). */
val ICON_EN42: Map<String, String> = mapOf(
    "båt" to "boat", "kirke" to "church", "hytte" to "cabin", "trening" to "barbell", "ski" to "ski", "fjell" to "mountain", "skog" to "trees", "hus" to "house",
    "hjem" to "home", "skole" to "school", "jobb" to "briefcase", "bil" to "car", "sykkel" to "bike", "buss" to "bus", "tog" to "train", "fly" to "plane",
    "hund" to "dog", "katt" to "cat", "hest" to "horse", "fotball" to "soccer", "musikk" to "music", "kino" to "film", "mat" to "utensils", "kaffe" to "coffee",
    "sykehus" to "hospital", "lege" to "stethoscope", "apotek" to "pill", "butikk" to "store", "strand" to "beach", "telt" to "tent", "fisk" to "fish", "fiske" to "fishing",
    "golf" to "golf", "tennis" to "tennis", "basseng" to "pool", "svømming" to "swimming", "bibliotek" to "library", "bok" to "book", "gave" to "gift", "kake" to "cake",
    "seil" to "sailboat", "brygge" to "anchor", "havn" to "anchor", "slott" to "castle", "museum" to "museum", "teater" to "theater", "barnehage" to "baby", "hage" to "flower",
)

/** Treff i de innebygde ikonene på navn, nøkkel og synonymer. */
fun iconHit42(key: String, name: String, q: String): Boolean {
    val t = q.trim().lowercase()
    if (t.isEmpty()) return true
    return name.lowercase().contains(t) || key.contains(t) || (ICON_SYN42[key]?.any { it.startsWith(t) || t.startsWith(it) } == true)
}

/** Iconify-ikoner (lucide / tabler) lagres som «ify:<sett>:<navn>» med SVG-banen, så sonen vises uten nett. */
object Ify42 {
    val paths = androidx.compose.runtime.mutableStateMapOf<String, String>()
    private var loaded = false
    private fun sp(ctx: android.content.Context) = ctx.getSharedPreferences("ify42", android.content.Context.MODE_PRIVATE)

    fun load(ctx: android.content.Context) {
        if (loaded) return
        loaded = true
        runCatching { sp(ctx).all.forEach { (k, v) -> if (v is String && k !in paths) paths[k] = v } }
    }

    fun put(ctx: android.content.Context?, key: String, path: String) {
        paths[key] = path
        ctx?.let { c -> runCatching { sp(c).edit().putString(key, path).apply() } }
    }

    /** Alle d-attributtene i en Iconify-«body» slått sammen til én bane (strekikoner i 24 × 24). */
    fun pathOf(body: String): String? = Regex("\\sd=\"([^\"]+)\"").findAll(body).map { it.groupValues[1] }.joinToString(" ").takeIf { it.isNotBlank() }

    /** Søk i Lucide og Tabler (api.iconify.design). Gir (nøkkel, bane), maks 36. Tom liste uten nett. */
    suspend fun search(q0: String): List<Pair<String, String>> = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        val q = q0.trim().lowercase().let { ICON_EN42[it] ?: it }
        if (q.length < 2) return@withContext emptyList()
        runCatching {
            val enc = URLEncoder.encode(q, "UTF-8")
            val names = JSONObject(get("https://api.iconify.design/search?query=$enc&prefixes=lucide,tabler&limit=36")).optJSONArray("icons") ?: JSONArray()
            val bySet = LinkedHashMap<String, MutableList<String>>()
            for (i in 0 until names.length()) { val n = names.optString(i); val c = n.indexOf(':'); if (c > 0) bySet.getOrPut(n.substring(0, c)) { ArrayList() } += n.substring(c + 1) }
            val out = ArrayList<Pair<String, String>>()
            for ((set, l) in bySet) {
                val o = JSONObject(get("https://api.iconify.design/$set.json?icons=" + URLEncoder.encode(l.joinToString(","), "UTF-8")))
                val icons = o.optJSONObject("icons") ?: continue
                for (n in l) { val b = icons.optJSONObject(n)?.optString("body") ?: continue; pathOf(b)?.let { out += "ify:$set:$n" to it } }
            }
            out.forEach { (k, v) -> paths[k] = v }
            out
        }.getOrDefault(emptyList())
    }

    private fun get(url: String): String {
        val c = java.net.URL(url).openSikker()
        c.connectTimeout = 6_000; c.readTimeout = 8_000
        return try { c.inputStream.bufferedReader().use { it.readText() } } finally { c.disconnect() }
    }
}

/*
 * Prompt 45 (ANDROID45), kontrakten CONTRACT45.md og design_handoff_homelab/prompts/prompt-45-pakke/:
 *  - Fold/brett: felles LayoutMode (≥ 700 dp), sidelinja med skann, Hjem-animasjon og wiggle-knapper (ui/Fold45.kt),
 *    søkefeltet over tastaturet (ui/Fold41.kt), Familie og Gjøremål på stor skjerm (ui/Family45.kt, ui/Tasks45.kt).
 *  - Wiggle-dra på Android: rotårsaken og fiksen står i ui/Wiggle.kt.
 *  - Felles mobilpunkter (Glimt-agent, Ruter antall, sonevarsler, Glimt-svar bare som systemvarsel …) i P45b.kt.
 * Serverformene lages parallelt (SERVER45/GLIMT45); 404 = «finnes ikke på serveren ennå», og appen faller tilbake til det gamle.
 */
class P45State {
    /** Hjem-knappen i sidelinja er på vei ut (animasjonen spilles før sidebyttet). */
    var homeLeaving by mutableStateOf(false)
    /** Doble trykk på Hjem ignoreres mens animasjonen pågår. */
    internal var homeBusy = false
    /** Sist viste redigering i sidelinja (så knappene kan animeres ut med riktig innhold). */
    internal var lastEdit: String? = null
    /** ✓ i sidelinja for Finans → Mer (redigeringen er lokal i rutenettet). */
    var fmDoneSeq by mutableIntStateOf(0)
    /** Familie på brett: valgt person (høyre kolonne) og en forespørsel om å zoome kartet til personen. */
    var famSel by mutableStateOf<String?>(null)
    var famZoomSeq by mutableIntStateOf(0)
    /** Gjøremål på brett: filterpillene (alle · idag · imorgen · uke · udato) og personvelgeren (null = alle). */
    var taskWhen by mutableStateOf("alle")
    var taskWho by mutableStateOf<String?>(null)
    /** Ruter: antall anbefalte reiser (1–3, standard 2), per bruker på serveren. */
    var recoCount by mutableIntStateOf(2)
    internal var recoFor: String? = null
    /** Glimt-agenten: null = ukjent, false = serveren mangler /api/glimt/agent (404), bruk /api/assist. */
    internal var agentOk: Boolean? = null
    /** «Bekreft» for en handling Glimt foreslo (POST /api/glimt/agent/confirm {token}). */
    var agentConfirm by mutableStateOf<Pair<String, String>?>(null)
    /** Sonevarsler (GET/PUT /api/family/zone-alerts): hovedbryter og av/på per person. null = ikke hentet / eldre server. */
    var zoneAlerts by mutableStateOf<ZoneAlerts45?>(null)
    internal var zoneAlertsFor: String? = null
    /** Vær: «Min posisjon» (GET /api/weather/here). */
    var here by mutableStateOf<WxHere45?>(null)
    var hereState by mutableStateOf("idle") // idle · loading · denied · ok · error · missing
    internal var hereAt = 0L
    /** Innstillinger → Helse → Home Assistant: «phones» (Telefoner) eller «all» (Alle mobilapp), og serverens tekster. */
    var haView by mutableStateOf("phones")
    var haHidden by mutableStateOf<String?>(null)
    var haStatus by mutableStateOf<String?>(null)
}

data class ZoneAlertPerson45(val id: String, val name: String, val initials: String, val color: Long?, val on: Boolean)

data class ZoneAlerts45(val on: Boolean, val people: List<ZoneAlertPerson45>)

/* ======================= Sonevarsler: av/på ======================= */

private fun parseZoneAlerts45(o: JSONObject): ZoneAlerts45 {
    val a = o.optJSONArray("people") ?: JSONArray()
    val people = (0 until a.length()).mapNotNull { i ->
        val x = a.optJSONObject(i) ?: return@mapNotNull null
        val id = x.s45("id") ?: return@mapNotNull null
        val name = x.s45("name") ?: "?"
        ZoneAlertPerson45(id, name, x.s45("initials") ?: name.take(2), hexColor45(x.s45("color")), x.optBoolean("on", true))
    }
    return ZoneAlerts45(o.optBoolean("on", true), people)
}

fun AppViewModel.loadZoneAlerts45(force: Boolean = false) {
    val s = p45
    val k = account?.id ?: ""
    if (!force && s.zoneAlertsFor == k) return
    s.zoneAlertsFor = k
    launch45 {
        val raw = try { api45 { hlGet("/family/zone-alerts") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch45
        val z = runCatching { parseZoneAlerts45(JSONObject(raw)) }.getOrNull() ?: return@launch45
        s.zoneAlerts = z
        ZoneNotify45.remember(appCtx45, z)
    }
}

/** Hovedbryter ([person] = null) eller én person. Vises med en gang og lagres på serveren (per bruker = mottakeren). */
fun AppViewModel.setZoneAlert45(person: String?, on: Boolean) {
    val s = p45
    val cur = s.zoneAlerts ?: return
    Haptics.select()
    val next = if (person == null) cur.copy(on = on) else cur.copy(people = cur.people.map { if (it.id == person) it.copy(on = on) else it })
    s.zoneAlerts = next
    ZoneNotify45.remember(appCtx45, next)
    val body = if (person == null) JSONObject().put("on", on) else JSONObject().put("people", JSONObject().put(person, on))
    launch45 {
        val raw = try { api45 { hlPut("/family/zone-alerts", body) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.zoneAlerts = cur; ZoneNotify45.remember(appCtx45, cur); flash("Kunne ikke lagre sonevarslene"); null
        } ?: return@launch45
        runCatching { parseZoneAlerts45(JSONObject(raw)) }.getOrNull()?.let { s.zoneAlerts = it; ZoneNotify45.remember(appCtx45, it) }
    }
}

/** «Vis eksempel på varsel»: et ekte systemvarsel med soneikonet (første sone), slik det ser ut når noen forlater en sone. */
fun AppViewModel.sampleZoneNotify45() {
    val z = family?.zones?.firstOrNull()
    val who = family?.members?.firstOrNull { it.userId != family?.me?.userId }?.name?.split(' ')?.firstOrNull() ?: "Ingrid"
    val zone = z?.name ?: "Hjem"
    launch45 {
        val api = FamilyPrefs.api(appCtx45)
        val icon = ZoneNotify45.icon(api, z?.id, null)
        ZoneNotify45.post(appCtx45, zone, "$who forlot $zone", "zone45-sample", z?.color?.toInt(), icon)
    }
}

/* ======================= Sonevarsler: selve varselet ======================= */

object ZoneNotify45 {
    private const val CHANNEL = "sonevarsler45"

    private fun sp(ctx: Context) = ctx.getSharedPreferences("zone45", Context.MODE_PRIVATE)

    /** Valgene lagres lokalt også, så varsler fra bakgrunnstjenesten følger dem uten nett. */
    fun remember(ctx: Context, z: ZoneAlerts45) {
        sp(ctx).edit().putBoolean("on", z.on).putStringSet("off", z.people.filter { !it.on }.map { it.id }.toSet()).apply()
    }

    fun allowed(ctx: Context, personId: String?): Boolean {
        val p = sp(ctx)
        if (!p.getBoolean("on", true)) return false
        return personId == null || personId !in (p.getStringSet("off", emptySet()) ?: emptySet())
    }

    private fun channel(ctx: Context): String {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Sonevarsler", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Når noen i familien kommer til eller forlater en sone" },
            )
        }
        return CHANNEL
    }

    /** Soneikonet som PNG fra serveren (hvitt ikon på sonefarge, sirkel). null uten nett/eldre server. */
    suspend fun icon(api: Api?, zoneId: String?, iconUrl: String?): Bitmap? {
        if (api == null) return null
        val path = iconUrl?.takeIf { it.startsWith("/") } ?: zoneId?.let { "/api/family/zones/" + URLEncoder.encode(it, "UTF-8") + "/icon.png?size=128&shape=circle" } ?: return null
        return try { api.bytes(path).let { b -> BitmapFactory.decodeByteArray(b, 0, b.size) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
    }

    /** Lite ikon (monokromt): bare de hvite pikslene i soneikonet (selve symbolet), resten gjennomsiktig. */
    private fun mono(b: Bitmap): Bitmap? = runCatching {
        val w = b.width; val h = b.height
        val px = IntArray(w * h)
        b.getPixels(px, 0, w, 0, 0, w, h)
        for (i in px.indices) {
            val c = px[i]
            val a = c ushr 24; val r = (c shr 16) and 255; val g = (c shr 8) and 255; val bl = c and 255
            px[i] = if (a > 128 && r > 215 && g > 215 && bl > 215) -0x1 else 0
        }
        Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }.getOrNull()

    /** Reserve når serveren ikke har ikonet: farget sirkel med sonens forbokstav. */
    private fun letter(name: String, color: Int?): Bitmap {
        val s = 128
        val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawCircle(s / 2f, s / 2f, s / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color ?: 0xFF2F6B4A.toInt() })
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = android.graphics.Color.WHITE; textSize = 64f; textAlign = Paint.Align.CENTER; isFakeBoldText = true }
        c.drawText(name.take(1).uppercase(), s / 2f, s / 2f - (tp.descent() + tp.ascent()) / 2, tp)
        return bmp
    }

    /** Tittel = sonenavn, tekst = «Ingrid forlot Hjem», stort ikon = soneikonet, lite ikon = monokromt soneikon, farge = sonens farge. */
    fun post(ctx: Context, title: String, body: String, tag: String, color: Int?, icon: Bitmap?) {
        if (!Notify.allowed(ctx)) return
        val large = icon ?: letter(title, color)
        val b = Notification.Builder(ctx, channel(ctx))
        val small = icon?.let { mono(it) }
        if (small != null && Build.VERSION.SDK_INT >= 23) b.setSmallIcon(android.graphics.drawable.Icon.createWithBitmap(small))
        else b.setSmallIcon(ctx.resources.getIdentifier("ic_launcher_monochrome", "drawable", ctx.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_map)
        b.setLargeIcon(large).setContentTitle(title).setContentText(body).setAutoCancel(true)
            .setStyle(Notification.BigTextStyle().bigText(body))
        color?.let { b.setColor(it) }
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(tag.hashCode(), b.build()) } catch (_: SecurityException) {}
    }

    /** Hendelser fra POST /api/family/location (eller køen): ett varsel per hendelse, bare når bryterne er på. */
    suspend fun postEvents(ctx: Context, api: Api?, a: JSONArray?) {
        if (a == null) return
        for (i in 0 until a.length()) {
            val e = a.optJSONObject(i) ?: continue
            val pid = e.s45("personId") ?: e.s45("userId")
            if (!allowed(ctx, pid)) continue
            val who = (e.s45("person") ?: e.s45("name") ?: e.s45("username") ?: "Noen").split(' ').first()
            val zone = e.s45("zone") ?: e.s45("zoneName") ?: "sonen"
            val leave = (e.s45("event") ?: e.s45("kind")) == "leave"
            val icon = icon(api, e.s45("zoneId"), e.s45("iconUrl") ?: e.s45("icon")?.takeIf { it.startsWith("/") })
            post(ctx, zone, if (leave) "$who forlot $zone" else "$who kom til $zone", "fam-" + (e.s45("id") ?: "$zone-$who-$leave"), hexColor45(e.s45("color"))?.toInt(), icon)
        }
    }

    /** Et varsel fra /api/notify/pending med data.kind == "zone". */
    suspend fun postPending(ctx: Context, api: Api, title: String, body: String, tag: String, data: JSONObject) {
        if (!allowed(ctx, data.s45("personId"))) return
        val icon = icon(api, data.s45("zoneId"), data.s45("iconUrl"))
        post(ctx, data.s45("zone") ?: title, body, tag, hexColor45(data.s45("color"))?.toInt(), icon)
    }
}

/* ---------- Familie og kart ---------- */

data class FamPos(
    val lat: Double, val lon: Double, val acc: Double?, val speed: Double?, val heading: Double?, val ts: String?,
    val battery: Int?, val charging: Boolean?, val activity: String?, val place: String?,
    /** Telefonen som sendte posisjonen (f.eks. «Pixel 8»), når serveren har den. */
    val device: String? = null,
)

data class FamHealthDay(val date: String, val steps: Int?, val sleepMin: Int?, val activeKcal: Int?, val restingHr: Int?)

data class FamHealth(val steps: Int?, val restingHr: Int?, val hr: Int?, val sleepMin: Int?, val activeKcal: Int?, val week: List<FamHealthDay>, val updatedAt: String?)

data class FamMember(
    val userId: String, val name: String, val username: String, val avatarUrl: String?,
    val sharing: String, val precision: String, val last: FamPos?, val health: FamHealth?,
    /** Prompt 22: bildet seeren har valgt for personen (ellers avataren), og personens farge fra serveren. */
    val photoUrl: String? = null, val color: Long? = null,
    /** Prompt 24: én person = én oppføring. Enhetene (devices), valgt kilde (null = automatisk) og antall enheter. */
    val devices: List<FamDevice> = emptyList(), val sourceDevice: String? = null, val deviceCount: Int = 0,
)

data class FamZone(
    val id: String, val name: String, val lat: Double, val lon: Double, val radius: Double, val color: Long, val notify: Map<String, Pair<Boolean, Boolean>>,
    /** Prompt 21 (brukerskille): delt med familien (av som standard), hvem som lagde sonen, og om den er min (bare eieren kan endre). */
    val shared: Boolean = false, val owner: String? = null, val mine: Boolean = true, val ownerName: String? = null,
    /** Prompt 22: ikonnøkkel (home, work, school …). Null på eldre server: standard etter navn. */
    val icon: String? = null,
)

data class FamEvent(val id: String, val userId: String, val zoneId: String, val zoneName: String?, val kind: String, val ts: String?)

data class FamMe(val userId: String, val sharing: String, val precision: String, val shareHealth: Map<String, Boolean>)

data class Family(val me: FamMe?, val members: List<FamMember>, val zones: List<FamZone>, val events: List<FamEvent>)

data class TrackPt(val lat: Double, val lon: Double, val ts: String?, val speed: Double?)

/** Helsefeltene brukeren kan velge å dele (Health Connect). */
val HEALTH_KEYS = listOf("steps" to "Skritt", "restingHr" to "Hvilepuls", "hr" to "Puls", "sleep" to "Søvn", "activeKcal" to "Aktive kalorier", "week" to "Siste 7 dager")

/** Tidspunkt som ISO-tekst, også når serveren sender millisekunder eller sekunder. */
internal fun JSONObject.tsIso(k: String): String? {
    if (!has(k) || isNull(k)) return null
    val v = opt(k)
    if (v is Number) { val n = v.toLong(); return java.time.Instant.ofEpochMilli(if (n < 100_000_000_000L) n * 1000 else n).toString() }
    return optStr(k)
}

private fun parseHealth(h: JSONObject?): FamHealth? {
    if (h == null) return null
    // {today: {...}, week, updatedAt}; eldre format har tallene rett i objektet.
    val o = h.optJSONObject("today") ?: h
    val w = h.optJSONArray("week") ?: JSONArray()
    return FamHealth(
        o.optIntOrNull("steps"), o.optIntOrNull("restingHr"), o.optIntOrNull("hr"), o.optIntOrNull("sleepMin"), o.optIntOrNull("activeKcal"),
        (0 until w.length()).mapNotNull { i ->
            val d = w.optJSONObject(i) ?: return@mapNotNull null
            FamHealthDay(d.optStr("date") ?: "", d.optIntOrNull("steps"), d.optIntOrNull("sleepMin"), d.optIntOrNull("activeKcal"), d.optIntOrNull("restingHr"))
        },
        h.tsIso("updatedAt"),
    )
}

private fun parsePos(o: JSONObject?): FamPos? {
    if (o == null) return null
    val lat = o.optDoubleOrNull("lat") ?: return null
    val lon = o.optDoubleOrNull("lon") ?: return null
    return FamPos(lat, lon, o.optDoubleOrNull("acc"), o.optDoubleOrNull("speed"), o.optDoubleOrNull("heading"), o.tsIso("ts"),
        o.optIntOrNull("battery"), o.optBoolOrNull("charging"), o.optStr("activity"), o.optStr("place"), o.optStr("device") ?: o.optStr("model"))
}

fun parseFamEvents(a: JSONArray?): List<FamEvent> = if (a == null) emptyList() else (0 until a.length()).mapNotNull { i ->
    val e = a.optJSONObject(i) ?: return@mapNotNull null
    FamEvent(e.optStr("id") ?: "$i", e.optStr("userId") ?: "", e.optStr("zoneId") ?: "", e.optStr("zoneName") ?: e.optStr("zone"), e.optStr("kind") ?: "enter", e.tsIso("ts"))
}

fun parseFamily(s: String): Family {
    val o = JSONObject(s)
    val me = o.optJSONObject("me")?.let { m ->
        val sh = m.optJSONObject("shareHealth")
        FamMe(m.optStr("userId") ?: "", m.optStr("sharing") ?: "off", m.optStr("precision") ?: "exact",
            HEALTH_KEYS.associate { (k, _) -> k to (sh?.optBoolean(k, false) ?: false) })
    }
    val ms = o.optJSONArray("members") ?: JSONArray()
    val members = (0 until ms.length()).mapNotNull { i ->
        val m = ms.optJSONObject(i) ?: return@mapNotNull null
        FamMember(m.optStr("userId") ?: "$i", m.optStr("name") ?: m.optStr("username") ?: "Person", m.optStr("username") ?: "", m.optStr("avatarUrl"),
            m.optStr("sharing") ?: "off", m.optStr("precision") ?: "exact", parsePos(m.optJSONObject("last")), parseHealth(m.optJSONObject("health")),
            photoUrl = m.optStr("photoUrl"), color = m.optStr("color")?.takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) }?.let(::color),
            devices = parseFamDevices24(m), sourceDevice = parseFamSource24(m), deviceCount = m.optInt("deviceCount", 0))
    }.let(::dedupeFamily24)
    val zs = o.optJSONArray("zones") ?: JSONArray()
    val zones = (0 until zs.length()).mapNotNull { i ->
        val z = zs.optJSONObject(i) ?: return@mapNotNull null
        val notify = mutableMapOf<String, Pair<Boolean, Boolean>>()
        z.optJSONObject("notify")?.let { n -> n.keys().forEach { k -> n.optJSONObject(k)?.let { v -> notify[k] = v.optBoolean("enter") to v.optBoolean("leave") } } }
        val owner = z.optStr("owner") ?: z.optStr("createdBy") ?: z.optStr("created_by")
        val mine = if (z.has("mine") && !z.isNull("mine")) z.optBoolean("mine") else (owner == null || owner == me?.userId)
        // Prompt 42: ikon fra Lucide/Tabler («ify:…») kommer med banen (icp), så sonen ser lik ut på iOS, Android og web.
        z.optStr("icon")?.takeIf { it.startsWith("ify:") }?.let { k -> z.optStr("icp")?.let { Ify42.paths[k] = it } }
        FamZone(z.optStr("id") ?: "$i", z.optStr("name") ?: "Sone", z.optDouble("lat", 0.0), z.optDouble("lon", 0.0), z.optDouble("radius", 150.0),
            z.optStr("color")?.let(::color) ?: 0xFFB23A2A, notify,
            shared = z.optBoolean("shared", false) || z.optInt("shared", 0) == 1, owner = owner, mine = mine, ownerName = z.optStr("ownerName"),
            icon = z.optStr("icon"))
    }
    return Family(me, members, zones, parseFamEvents(o.optJSONArray("events")))
}

fun parseTrack(s: String): List<TrackPt> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("points") ?: JSONArray()
    return (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        TrackPt(o.optDoubleOrNull("lat") ?: return@mapNotNull null, o.optDoubleOrNull("lon") ?: return@mapNotNull null, o.tsIso("ts"), o.optDoubleOrNull("speed"))
    }
}

/** Norsk tekst for aktiviteten fra mobilen. */
fun activityText(a: String?): String = when (a) {
    "still" -> "I ro"; "walking" -> "Går"; "running" -> "Løper"; "cycling" -> "Sykler"; "driving" -> "Kjører"; null, "" -> "Ukjent"; else -> a
}

/* ---------- Kartfliser ---------- */

/**
 * GET /api/config/map → {tiles:{topo:'/tiles/topo/{z}/{x}/{y}.png', …}, attribution, default:'topo', maxZoom, paperFilter, darkFilter}.
 * Prompt 21: standard er Kartverket topo (gratis, ingen nøkkel). CARTO krever nå nøkkel og brukes ikke som standard.
 */
data class MapConfig(
    val tiles: Map<String, String>, val attribution: String?, val defaultStyle: String, val maxZoom: Int,
    /** CSS-filteret serveren anbefaler i mørkt tema (f.eks. «invert(1) hue-rotate(180deg) …»). Appen bruker sin egen matrise. */
    val darkFilter: String? = null,
)

/** Fliskilden kartet bruker: navn (cache-nøkkel), URL-mal med {s} {z} {x} {y} {r}, og om app-tokenet skal sendes. */
data class MapTiles(val name: String, val template: String, val auth: Boolean, val attribution: String, val maxZoom: Int, val retina: Boolean)

fun parseMapConfig(s: String): MapConfig {
    val o = JSONObject(s)
    val t = o.optJSONObject("tiles")
    val tiles = mutableMapOf<String, String>()
    t?.keys()?.forEach { k -> (t.optStr(k) ?: t.optJSONObject(k)?.optStr("url"))?.let { tiles[k] = it } }
    return MapConfig(tiles, o.optStr("attribution"), o.optStr("default") ?: "topo", o.optIntOrNull("maxZoom")?.coerceIn(10, 22) ?: 18, o.optStr("darkFilter"))
}

private const val KARTVERKET_ATTR = "© Kartverket"

/** Kartverket topo direkte (merk rekkefølgen {y}/{x}). Brukes når serveren ikke har topo-proxyen. */
private const val KARTVERKET_TOPO = "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"

/**
 * Hvilken kilde kartet skal bruke. Ny server: homelab-proxyen (/tiles/topo) med app-token. Eldre server uten topo i
 * /api/config/map (404, eller bare CARTO, som nå krever nøkkel): Kartverket topo direkte. Aldri tile.openstreetmap.org.
 * Mørkt tema er de samme flisene med mørkt fargefilter i kartet.
 */
fun mapTilesFor(cfg: MapConfig?, missing: Boolean, base: String, style: String, retina: Boolean): MapTiles {
    val r = if (retina) "2x" else "1x"
    val tpl = cfg?.tiles?.get(style) ?: cfg?.tiles?.get("topo")
    if (missing || base.isBlank() || tpl == null) return MapTiles("kartverket-topo", KARTVERKET_TOPO, false, KARTVERKET_ATTR, 18, retina)
    val full = if (tpl.startsWith("/")) base.trimEnd('/') + tpl else tpl
    val own = full.startsWith(base.trimEnd('/'))
    val attr = cfg?.attribution?.takeIf { it.isNotBlank() && !it.contains("CARTO") } ?: KARTVERKET_ATTR
    return MapTiles("homelab-topo-$r", full, own, attr, cfg?.maxZoom ?: 18, retina)
}

/** Gyldig punkt på kartet (osmdroid tåler ikke NaN eller breddegrader utenfor Web Mercator). */
fun validLatLon(lat: Double, lon: Double): Boolean = lat.isFinite() && lon.isFinite() && lat in -85.05..85.05 && lon in -180.0..180.0

/* ---------- Posisjonskortet ---------- */

/** Én person på posisjonskortet. status: «fresh» (< 15 min), «stale» eller «off». */
data class PosCard(
    val id: String, val name: String, val color: Long, val photo: String?, val initials: String,
    val line2: String, val status: String, val self: Boolean,
    /** Prompt 50: kjent sone personen er i (null = ikke i en sone). Brukes av Familie-flisen på Hjem («Alle på plass»). */
    val zone: String? = null,
)

/** Fargene som brukes når Familie ikke har en egen farge for personen (stabil per id). */
val POS_COLORS = listOf(0xFFB23A2A, 0xFF2F5D8A, 0xFF2F7A4F, 0xFFC9A227, 0xFF5B4A8A, 0xFFE07A5F, 0xFF2A8A8A, 0xFF7A3B69)

fun posColorFor(id: String): Long = POS_COLORS[Math.floorMod(id.hashCode(), POS_COLORS.size)]

/** To bokstaver: «Du», «In» (Ingrid), «På» (Pål). */
fun posInitials(name: String): String {
    val n = name.trim()
    if (n.isEmpty()) return "?"
    val first = n.split(' ').first()
    return first.take(2).lowercase().replaceFirstChar { it.titlecase(Locale("nb")) }
}

fun parsePositions(s: String): List<PosCard> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("positions") ?: JSONObject(t).optJSONArray("items") ?: JSONArray()
    val seen = mutableSetOf<String>()
    val out = (0 until a.length()).mapNotNull { i ->
        val o = a.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optStr("id") ?: o.optStr("userId") ?: "$i"
        if (!seen.add(id)) return@mapNotNull null
        val self = o.optBoolean("self", false)
        val name = if (self) "Du" else o.optStr("navn") ?: o.optStr("name") ?: "Person"
        val status = (o.optStr("status") ?: "off").let { if (it in setOf("fresh", "stale", "off")) it else "off" }
        val line2 = o.optStr("linje2")?.takeIf { it != "Ukjent sted" }
            ?: listOfNotNull(o.optStr("sone"), o.optStr("sted")).firstOrNull()
            ?: lastSeen(o.optStr("oppdatert")) ?: "Deler ikke posisjon"
        PosCard(id, name, o.optStr("farge")?.let(::color) ?: o.optStr("color")?.let(::color) ?: posColorFor(id), o.optStr("bilde"),
            o.optStr("initialer") ?: posInitials(name), line2, status, self, zone = o.optStr("sone") ?: o.optStr("zone"))
    }
    // «Du» først, og bare én gang.
    return out.filter { it.self }.take(1) + out.filter { !it.self }
}

/** «Sist sett 14:32» (i dag) eller «Sist sett 12.10.». */
fun lastSeen(iso: String?): String? {
    val t = runCatching { Instant.parse(iso!!) }.getOrNull() ?: return null
    val z = t.atZone(ZoneId.systemDefault())
    val today = java.time.LocalDate.now(ZoneId.systemDefault())
    return "Sist sett " + if (z.toLocalDate() == today) z.format(DateTimeFormatter.ofPattern("HH:mm")) else z.format(DateTimeFormatter.ofPattern("d.M."))
}

private fun activityShort(a: String?): String? = when (a) {
    "walking", "går" -> "Går"; "running" -> "Løper"; "cycling", "sykler" -> "Sykler"; "driving", "i bil" -> "I bil"; else -> null
}

/** Eldre server uten /api/family/positions: kortet bygges fra /api/family. Deg selv først som «Du», uten duplikat. */
fun positionsFromFamily(f: Family, now: Instant = Instant.now()): List<PosCard> {
    val selfId = f.me?.userId
    val seen = mutableSetOf<String>()
    val ordered = f.members.filter { it.userId == selfId } + f.members.filter { it.userId != selfId }
    return ordered.mapNotNull { m ->
        if (!seen.add(m.userId)) return@mapNotNull null
        val self = m.userId == selfId
        val l = m.last
        val age = l?.ts?.let { runCatching { Duration.between(Instant.parse(it), now).toMinutes() }.getOrNull() }
        val status = when {
            m.sharing != "on" || l == null -> "off"
            age != null && age < 15 -> "fresh"
            else -> "stale"
        }
        val zone = if (l == null) null else f.zones.firstOrNull { z -> distM(l.lat, l.lon, z.lat, z.lon) <= z.radius }?.name
        val line2 = when {
            m.sharing != "on" && l?.ts != null -> lastSeen(l.ts) ?: "Deler ikke posisjon"
            m.sharing != "on" || l == null -> "Deler ikke posisjon"
            zone != null -> zone
            activityShort(l.activity) != null -> listOfNotNull(activityShort(l.activity), l.place).joinToString(" · ")
            l.place != null -> l.place
            else -> lastSeen(l.ts) ?: "Deler ikke posisjon"
        }
        val name = if (self) "Du" else m.name.split(' ').first()
        PosCard(m.userId, name, posColorFor(m.userId), m.avatarUrl, posInitials(name), line2, status, self, zone = zone)
    }
}

/** Avstand i meter (haversine), så modellene ikke trenger android.location. */
fun distM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ---------- Familie: enheter ---------- */

/** En av personens enheter (GET /api/family → members[].devices). isSource = posisjonen kommer fra denne. */
data class FamDevice(
    val id: String, val name: String, val platform: String?, val battery: Int?, val lastSeen: String?, val accuracy: Double?, val isSource: Boolean,
)

internal fun parseFamDevices24(m: JSONObject): List<FamDevice> {
    val a = m.optJSONArray("devices") ?: return emptyList()
    return (0 until a.length()).mapNotNull { i ->
        val d = a.optJSONObject(i) ?: return@mapNotNull null
        FamDevice(
            d.optStr("id") ?: d.optStr("deviceId") ?: "$i", d.optStr("name") ?: d.optStr("model") ?: "Enhet", d.optStr("platform"),
            d.optIntOrNull("battery"), d.tsIso("lastSeen") ?: d.tsIso("ts"), d.optDoubleOrNull("accuracy") ?: d.optDoubleOrNull("acc"),
            d.optBoolean("isSource", false),
        )
    }
}

/** Kilden personen har valgt selv (null = automatisk). */
internal fun parseFamSource24(m: JSONObject): String? = m.optStr("sourceDevice") ?: m.optStr("source_device")

/**
 * Eldre server sender én post per enhet. Grupper på userId: posisjonen fra mest nøyaktige enhet siste 5 min, ellers nyeste.
 * Enhetene fra postene blir enhetslisten (når serveren ikke sender den selv).
 */
internal fun dedupeFamily24(list: List<FamMember>): List<FamMember> {
    if (list.map { it.userId }.distinct().size == list.size) return list
    fun ms(p: FamPos?): Long = runCatching { Instant.parse(p!!.ts).toEpochMilli() }.getOrDefault(0L)
    return list.groupBy { it.userId }.map { (_, g) ->
        if (g.size == 1) return@map g[0]
        val newest = g.maxOf { ms(it.last) }
        val fresh = g.filter { it.last != null && newest - ms(it.last) <= 5 * 60_000 }
        val best = fresh.minByOrNull { it.last?.acc ?: Double.MAX_VALUE } ?: g.maxBy { ms(it.last) }
        val devs = g.flatMap { m ->
            m.devices.ifEmpty {
                listOf(FamDevice(m.last?.device ?: "dev-${g.indexOf(m)}", m.last?.device ?: "Enhet ${g.indexOf(m) + 1}", null, m.last?.battery, m.last?.ts, m.last?.acc, m === best))
            }
        }.distinctBy { it.id }
        best.copy(devices = devs, deviceCount = devs.size, health = g.mapNotNull { it.health }.maxByOrNull { it.steps ?: 0 } ?: best.health)
    }
}

/* ---------- Familie: valg av kilde ---------- */

fun AppViewModel.b24SetSource(deviceId: String?) = launch24b {
    try {
        api24b { request("PUT", "/family/me/source", JSONObject().put("deviceId", deviceId ?: JSONObject.NULL), prefix = Api.HOMELAB) }
        loadFamily().join()
        flash(if (deviceId == null) "Kilde: automatisk" else "Kilden er byttet")
    } catch (e: ApiException) {
        flash(if (e.status == 404) "Serveren støtter ikke valg av kilde ennå" else (e.message ?: "Kunne ikke bytte kilde"))
    }
}
