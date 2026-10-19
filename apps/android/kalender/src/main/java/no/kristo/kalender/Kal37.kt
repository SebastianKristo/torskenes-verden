package no.kristo.kalender

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.location.Geocoder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

/*
 * Prompt 37: Kalender-appen (fasit: prompt-37-pakke/design/Kalender App.dc.html → fagKey(), CC(), FAGP, ask(), geoFor(), mapOf()).
 *  • Fag37: egen farge per fag i Studie (emnekode «MEK1300» eller første ord etter «Frist:/Prøve ·/Eksamen …»), 8 farger,
 *    nye fag får neste ledige. Lagres lokalt og i profilen (PUT /api/me/layout {subjectColors}) så alle enheter blir like.
 *  • School37: «Neste prøve på skolen» = skoleprøve i Studie, aldri «Viaplay-prøven slutter». Skole-ordene avgrenser og er
 *    ikke søkeord; stoppord, ingen «-en/-et»-stripping og alle søkeordene må treffe.
 *  • Place37: stedet i teksten Glimt legger inn («hos Nina frisør», «på Majorstuen legesenter», «Hoffsveien 4»).
 *  • Geo37: geokoding (Android Geocoder → Nominatim), cache (treff permanent, bom {fail} prøves igjen etter 1 t) og
 *    statisk kart av OpenStreetMap-fliser (ingen nye avhengigheter).
 */

/** lat/lon som tall eller tekst. */
fun optD37(o: JSONObject, k: String): Double? = if (!o.has(k) || o.isNull(k)) null else when (val v = o.opt(k)) {
    is Number -> v.toDouble(); is String -> v.toDoubleOrNull(); else -> null
}

/** {lat, lon} eller {map:{lat, lon}} → par, eller null. */
fun geoOf37(o: JSONObject): Pair<Double, Double>? {
    val m = o.optJSONObject("map")
    val la = optD37(o, "lat") ?: m?.let { optD37(it, "lat") } ?: return null
    val lo = optD37(o, "lon") ?: m?.let { optD37(it, "lon") ?: optD37(it, "lng") } ?: return null
    if (kotlin.math.abs(la) > 90 || kotlin.math.abs(lo) > 180 || (la == 0.0 && lo == 0.0)) return null
    return la to lo
}

/* ---------------- Farge per fag ---------------- */

class Fag37Row(val key: String, val label: String, val c: Long, val own: Boolean)

object Fag37 {
    /** FAGP: c, tx (lyst tema), lt (mørkt tema). */
    val PAL: List<Triple<Long, Long, Long>> = listOf(
        Triple(0xFF2F7A4F, 0xFF235C3B, 0xFF8FD4A8), Triple(0xFF2B5D8A, 0xFF1F4568, 0xFF9CC2EE), Triple(0xFFA8661A, 0xFF7A4A12, 0xFFECBB74),
        Triple(0xFF8A3FA0, 0xFF6A2F7C, 0xFFD6A8E6), Triple(0xFF3D7F8A, 0xFF2A5C64, 0xFF8FCDD6), Triple(0xFFC2477A, 0xFF8F2F58, 0xFFF0A6C4),
        Triple(0xFF5B4FC4, 0xFF40368F, 0xFFB3ABF2), Triple(0xFF7A8A2A, 0xFF55611C, 0xFFC9D685),
    )
    private val STUDY = setOf("s", "studie", "timeplan", "prover", "skole", "canvas", "study")

    /** Øker når en farge endres (Compose tegner på nytt). */
    var rev by mutableIntStateOf(0)
    private var prefs: SharedPreferences? = null
    private val idx = HashMap<String, Int>()
    private val own = HashMap<String, Long>()
    /** Nye tildelinger og egne valg som skal til profilen (null = fjern). */
    val pending = HashMap<String, Long?>()

    @Synchronized fun attach(ctx: Context) {
        if (prefs != null) return
        val p = ctx.applicationContext.getSharedPreferences("kal_fag37", Context.MODE_PRIVATE)
        prefs = p
        runCatching { JSONObject(p.getString("idx", "{}") ?: "{}").let { o -> o.keys().forEach { k -> idx[k] = o.optInt(k) } } }
        runCatching { JSONObject(p.getString("own", "{}") ?: "{}").let { o -> o.keys().forEach { k -> hexIn(o.optString(k))?.let { own[k] = it } } } }
    }

    private fun save() {
        val p = prefs ?: return
        val a = JSONObject(); idx.forEach { (k, v) -> a.put(k, v) }
        val b = JSONObject(); own.forEach { (k, v) -> b.put(k, hexOut(v)) }
        p.edit().putString("idx", a.toString()).putString("own", b.toString()).apply()
    }

    /** MEK1300 / «TRE 1400» → «TRE1400»; ellers første ord etter prefiksene (små bokstaver). */
    fun key(t: String): String {
        Regex("\\b([A-ZÆØÅ]{2,5}\\s?\\d{3,4})\\b").find(t)?.let { return it.groupValues[1].replace(" ", "") }
        val rest = t.trim().replace(Regex("^(Frist:|Prøve ·|Prøve:|Eksamen|Forelesning|Øving|Lab|Seminar)\\s*", RegexOption.IGNORE_CASE), "")
        val w = rest.split(Regex("[\\s·–-]+")).firstOrNull { it.isNotBlank() }?.lowercase()?.trim { !it.isLetterOrDigit() } ?: return ""
        return if (w.length >= 2) w else ""
    }

    fun label(k: String): String = if (k.any { it.isDigit() }) k.uppercase() else cap(k)

    fun isStudy(e: KEv, c: KCal?): Boolean {
        if (School37.isTrialEv(e)) return false
        if (e.cal.lowercase() in STUDY || c?.key == "s" || (c?.serverId?.lowercase() in STUDY)) return true
        val n = c?.n?.lowercase().orEmpty()
        return n == "studie" || n == "skole" || n == "timeplan"
    }

    @Synchronized fun index(k: String): Int {
        idx[k]?.let { return it }
        val used = idx.values.map { it % PAL.size }.toSet()
        val next = (0 until PAL.size).firstOrNull { it !in used } ?: (idx.size % PAL.size)
        idx[k] = next
        save()
        if (own[k] == null) pending[k] = PAL[next].first
        return next
    }

    fun ownOf(k: String): Long? = own[k]

    fun color(k: String): Long = own[k] ?: PAL[index(k) % PAL.size].first

    /** Kalenderen med fagfargen (bare hendelser i Studie). Sidemenyen og filteret beholder kalenderens farge. */
    fun tint(c: KCal, e: KEv): KCal {
        @Suppress("UNUSED_VARIABLE") val r = rev
        if (!isStudy(e, c)) return c
        val k = key(e.t)
        val sh = e.subjectHex
        if (sh != null && (k.isEmpty() || own[k] == null)) return apply(c, sh)
        if (k.isEmpty()) return c
        return apply(c, color(k))
    }

    fun apply(c: KCal, col: Long): KCal {
        val p = PAL.firstOrNull { (it.first and 0xFFFFFF) == (col and 0xFFFFFF) }
        if (p != null) return c.copy(c = p.first, tx = p.second, lt = p.third)
        return c.copy(c = col or 0xFF000000, tx = mix37(col, 0xFF000000, .28f), lt = mix37(col, 0xFFFFFFFF, .45f))
    }

    /** Brukerens eget valg (null = tilbake til fast palettfarge). */
    @Synchronized fun set(k: String, col: Long?) {
        if (k.isEmpty()) return
        if (col == null) own.remove(k) else own[k] = col or 0xFF000000
        save()
        pending[k] = col
        rev++
    }

    fun rows(evs: List<KEv>, cal: (String) -> KCal?): List<Fag37Row> {
        val seen = LinkedHashMap<String, Fag37Row>()
        evs.forEach { e ->
            if (!isStudy(e, cal(e.cal))) return@forEach
            val k = key(e.t)
            if (k.isEmpty() || seen.containsKey(k)) return@forEach
            seen[k] = Fag37Row(k, label(k), color(k), own[k] != null)
        }
        return seen.values.sortedBy { it.label.lowercase() }
    }

    /** GET /api/me/layout → subjectColors (serverens valg vinner), og PUT de nye (flettes per nøkkel på serveren). */
    suspend fun sync(api: KalApi) {
        runCatching {
            val o = JSONObject(api.get("/api/me/layout")).optJSONObject("subjectColors")
            if (o != null) synchronized(this) {
                o.keys().forEach { k -> hexIn(o.optString(k))?.let { own[k] = it or 0xFF000000; if (k.lowercase() != k) own[k.lowercase()] = it or 0xFF000000 } }
                save()
            }
        }
        val body = JSONObject()
        synchronized(this) {
            pending.forEach { (k, v) -> if (k.length <= 40) body.put(k, v?.let(::hexOut) ?: JSONObject.NULL) }
            pending.clear()
        }
        if (body.length() > 0) runCatching { api.request("PUT", "/api/me/layout", JSONObject().put("subjectColors", body)) }
        rev++
    }
}

fun mix37(a: Long, b: Long, t: Float): Long {
    fun ch(v: Long, s: Int) = ((v shr s) and 0xFF).toInt()
    fun m(s: Int) = (ch(a, s) + (ch(b, s) - ch(a, s)) * t).toInt().coerceIn(0, 255).toLong()
    return 0xFF000000 or (m(16) shl 16) or (m(8) shl 8) or m(0)
}

/* ---------------- «Neste prøve på skolen» ---------------- */

object School37 {
    fun isTrialQ(ql: String) = Regex("prøveperiode|prøvetid|gratis ?periode|abonnement|trial|viaplay|netflix|hbo|disney|spotify|storytel|tv ?2 play").containsMatchIn(ql)
    fun isSchoolQ(ql: String) = Regex(" (skole|skolen|skola|universitet|universitetet|uni|uio|ntnu|oslomet|høgskole|høgskolen|studie|studiet|studier|klassen|fag|faget) ").containsMatchIn(ql)
    fun isTestQ(ql: String) = Regex(" (prøve|prøva|prøven|prøver|prøvene|eksamen|eksamenen|eksamener|test|testen|quiz|quizen|midtveis|midtveiseksamen|tentamen|heldagsprøve|heldagsprøven) ").containsMatchIn(ql)

    fun isExamQ(ql: String) = Regex(" (eksamen|eksamenen|eksamener|midtveiseksamen) ").containsMatchIn(ql) && !Regex(" (prøve|prøva|prøven|prøver|test|testen|quiz) ").containsMatchIn(ql)

    fun isTrialEv(e: KEv): Boolean = e.kind == "trial" || e.cal.lowercase() == "trials" ||
        Regex("prøven slutter|prøveperiode|prøvetid|abonnement|gratisperiode", RegexOption.IGNORE_CASE).containsMatchIn(e.t)

    fun isTestEv(e: KEv): Boolean = !isTrialEv(e) && (e.kind == "prove" || e.kind == "eksamen" ||
        Regex("prøve|eksamen|\\btest\\b|quiz|midtveis|tentamen", RegexOption.IGNORE_CASE).containsMatchIn(e.t))

    fun what(t: String) = t.replace(Regex("^Prøve ·\\s*"), "prøve i ").replace(Regex("^Prøve:\\s*"), "prøve i ").replace(Regex("^Eksamen\\s+"), "eksamen i ")

    /** null = ikke et skoleprøve-spørsmål. */
    fun answer(ql: String, up: List<KEv>, cal: (String) -> KCal?, rel: (LocalDate) -> String, T: LocalDate): KAns? {
        if (!isTestQ(ql) || isTrialQ(ql)) return null
        val school = isSchoolQ(ql)
        val l0 = up.filter { isTestEv(it) && (!school || Fag37.isStudy(it, cal(it.cal))) }.distinctBy { it.id }
        // «Neste eksamen»: eksamener først (ellers alle prøver).
        val examQ = isExamQ(ql)
        val exams = l0.filter { Regex("eksamen", RegexOption.IGNORE_CASE).containsMatchIn(it.t) || it.kind == "eksamen" }
        val l = if (examQ && exams.isNotEmpty()) exams else l0
        val noun = if (examQ && exams.isNotEmpty()) "eksamen" else "prøve"
        if (l.isNotEmpty()) {
            val m = l[0]
            val days = daysBetween(T, m.d)
            val sb = StringBuilder("Neste " + noun + (if (school) " på skolen" else "") + " er " + what(m.t) + " " + rel(m.d))
            if (!m.all) sb.append(" kl. ").append(hm(m.s ?: 0))
            m.loc?.let { sb.append(", ").append(it) }
            sb.append(".")
            if (days > 1) sb.append(" Det er om $days dager.")
            if (l.size > 1) sb.append(" Etter det: ").append(l.drop(1).take(2).joinToString(", ") { it.t.replace(Regex("^Prøve ·\\s*"), "") + " " + rel(it.d) }).append(".")
            return KAns(listOf("Ser i Studie-kalenderen", "Fant " + l.size + (if (l.size == 1) " prøve" else " prøver/eksamener")), sb.toString(), l.take(3))
        }
        val nf = up.firstOrNull { it.kind == "frist" && !isTrialEv(it) && Fag37.isStudy(it, cal(it.cal)) }
        val txt = "Jeg finner ingen prøver eller eksamener i Studie-kalenderen." + (nf?.let { " Neste frist er " + it.t.replace(Regex("^Frist:\\s*"), "") + " " + rel(it.d) + "." } ?: "")
        return KAns(listOf("Ser i Studie-kalenderen", "Ingen prøver funnet"), txt, listOfNotNull(nf))
    }

    val STOP = setOf("når", "er", "neste", "min", "mitt", "mine", "har", "jeg", "skal", "må", "time", "timen", "timer", "hos", "til", "på", "i", "en", "et", "ei",
        "den", "det", "avtale", "avtalen", "hva", "meg", "kommer", "blir", "om", "skole", "skolen", "skola", "universitet", "universitetet", "uni", "studie",
        "studiet", "studier", "klassen", "høgskole", "høgskolen", "uio", "ntnu", "oslomet", "fag", "faget")

    /** «når er neste frisørtime» → [frisør]. Ingen «-en/-et»-stripping. */
    fun terms(q: String): List<String> = q.lowercase().replace(Regex("[?!.,:;«»\"]"), " ").split(Regex("\\s+"))
        .filter { it.length >= 3 && it !in STOP }.map { it.replace(Regex("(timen|timer|time|avtalen|avtale|økta|økt)$"), "") }
        .filter { it.length >= 3 && it !in STOP }

    /** Hele ordet, eller felles begynnelse på minst 4 tegn begge veier («frisøren» ↔ «frisør»). */
    fun hit(hay: String, w: String): Boolean {
        if (hay.contains(w)) return true
        val wp = w.take(maxOf(4, w.length - 2))
        return hay.split(Regex("[^\\p{L}\\p{N}]+")).any { x -> x.length >= 4 && (w.startsWith(x) || (wp.length >= 4 && x.startsWith(wp))) }
    }

    fun all(hay: String, terms: List<String>) = terms.all { hit(hay, it) }
}

/* ---------------- Sted i teksten ---------------- */

object Place37 {
    private val NOT = setOf("kl", "klokka", "klokken", "i", "på", "fra", "til", "og", "med", "om", "den", "neste", "denne", "mandag", "tirsdag", "onsdag", "torsdag",
        "fredag", "lørdag", "søndag", "morgen", "dag", "kveld", "januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober",
        "november", "desember", "varsle", "varsel", "påminn", "for", "før", "etter", "uke", "uka", "ca")
    private val STREET = Regex("([A-Za-zÆØÅæøåé.\\-]+(?:veien|vegen|vei|veg|gata|gate|gaten|plass|plassen|allé|alle|stien|bakken|svingen|ringen|torget|torg|kaia|brygge|terrasse)\\s+\\d{1,4}[A-Za-z]?\\b(?:\\s*,\\s*\\d{4}\\s+[A-ZÆØÅ][a-zæøå]+)?)", RegexOption.IGNORE_CASE)

    fun extract(text: String): String? {
        Regex("adresse\\s*:\\s*([^.;\\n]{4,80})", RegexOption.IGNORE_CASE).find(text)?.let { return it.groupValues[1].trim() }
        val t = text.replace('\n', ' ')
        STREET.find(t)?.let { return cap(it.groupValues[1].trim()) }
        for (trig in listOf("hos", "på", "ved")) after(trig, t)?.let { return it }
        return null
    }

    private fun after(trig: String, t: String): String? {
        val w = t.split(' ').filter { it.isNotEmpty() }
        for (i in 0 until w.size - 1) {
            if (w[i].lowercase() != trig) continue
            val first = w[i + 1].trim { it in ",.;:!?«»\"" }
            if (first.isEmpty() || !first[0].isUpperCase() || !first[0].isLetter() || first.lowercase() in NOT) continue
            val out = arrayListOf(first)
            var j = i + 2
            while (j < w.size && out.size < 3) {
                val raw = w[j]
                val x = raw.trim { it in ",.;:!?«»\"" }
                if (x.isEmpty() || !x.all { it.isLetter() || it == '-' } || x.lowercase() in NOT) break
                out += x
                if (raw.endsWith(",") || raw.endsWith(".")) break
                j++
            }
            return out.joinToString(" ")
        }
        return null
    }
}

/* ---------------- Geokoding og kart ---------------- */

class Geo37Hit(val la: Double, val lo: Double, val a: String)

object Geo37 {
    var rev by mutableIntStateOf(0)
    private var prefs: SharedPreferences? = null
    private val hits = HashMap<String, Geo37Hit>()
    private val fails = HashMap<String, Long>()
    private val busy = HashSet<String>()
    private val tiles = HashMap<String, Bitmap>()
    private val maps = HashMap<String, Bitmap>()

    @Synchronized fun attach(ctx: Context) {
        if (prefs != null) return
        val p = ctx.applicationContext.getSharedPreferences("kal_geo37", Context.MODE_PRIVATE)
        prefs = p
        runCatching {
            val o = JSONObject(p.getString("hits", "{}") ?: "{}")
            o.keys().forEach { k -> o.optJSONObject(k)?.let { h -> hits[k] = Geo37Hit(h.optDouble("la"), h.optDouble("lo"), h.optString("a")) } }
            val f = JSONObject(p.getString("fails", "{}") ?: "{}")
            f.keys().forEach { k -> fails[k] = f.optLong(k) }
        }
    }

    private fun save() {
        val p = prefs ?: return
        val o = JSONObject(); hits.forEach { (k, h) -> o.put(k, JSONObject().put("la", h.la).put("lo", h.lo).put("a", h.a)) }
        val f = JSONObject(); fails.forEach { (k, v) -> f.put(k, v) }
        p.edit().putString("hits", o.toString()).putString("fails", f.toString()).apply()
    }

    private fun norm(s: String) = s.trim().lowercase()

    /** Stedet som slås opp (full adresse når serveren har den). */
    fun place(e: KEv): String = e.address?.takeIf { it.isNotBlank() } ?: e.loc.orEmpty()

    /** Serverens koordinater først, så cachen. need = true når stedet bør slås opp (ukjent, eller bom eldre enn 1 t). */
    @Synchronized fun peek(e: KEv): Pair<Geo37Hit?, Boolean> {
        @Suppress("UNUSED_VARIABLE") val r = rev
        if (e.lat != null && e.lon != null) return Geo37Hit(e.lat, e.lon, e.address ?: e.loc.orEmpty()) to false
        val p = place(e)
        if (p.length < 3) return null to false
        val k = norm(p)
        hits[k]?.let { return it to false }
        val f = fails[k]
        val need = (f == null || System.currentTimeMillis() - f > 3_600_000L) && k !in busy
        return null to need
    }

    @Synchronized private fun begin(k: String): Boolean = busy.add(k)

    suspend fun resolve(ctx: Context, loc: String) {
        val k = norm(loc)
        if (k.length < 3 || !begin(k)) return
        val h = withContext(Dispatchers.IO) { tries(loc).firstNotNullOfOrNull { geocoder(ctx, it, loc) } ?: tries(loc).firstNotNullOfOrNull { nominatim(it, loc) } }
        synchronized(this) {
            busy.remove(k)
            if (h != null) { hits[k] = h; fails.remove(k) } else fails[k] = System.currentTimeMillis()
            save()
        }
        rev++
    }

    /** stedet → «…, Oslo» → delen etter komma + by → uten første ledd. */
    fun tries(loc: String, city: String = "Oslo"): List<String> {
        val l = loc.trim()
        if (l.length < 3) return emptyList()
        return listOf(l, "$l, $city", l.split(',').last().trim() + ", " + city, l.replace(Regex("^[^,]*,\\s*"), "")).filter { it.length > 2 }.distinct()
    }

    fun label(road: String?, no: String?, area: String?, name: String?, fallback: String): String = when {
        !road.isNullOrBlank() -> road + (if (!no.isNullOrBlank()) " $no" else "") + (if (!area.isNullOrBlank()) ", $area" else "")
        !name.isNullOrBlank() -> if (area.isNullOrBlank() || area == name) name else "$name, $area"
        else -> fallback
    }

    @Suppress("DEPRECATION")
    private fun geocoder(ctx: Context, q: String, orig: String): Geo37Hit? = runCatching {
        if (!Geocoder.isPresent()) return null
        val a = Geocoder(ctx, Locale("nb", "NO")).getFromLocationName(q, 1, 57.5, 4.0, 71.5, 31.5)?.firstOrNull() ?: return null
        Geo37Hit(a.latitude, a.longitude, label(a.thoroughfare, a.subThoroughfare, a.subLocality ?: a.locality, a.featureName, orig))
    }.getOrNull()

    private fun nominatim(q: String, orig: String): Geo37Hit? = runCatching {
        val u = URL("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=no&accept-language=nb&q=" + URLEncoder.encode(q, "UTF-8"))
        val c = (u.openConnection() as HttpURLConnection).apply { connectTimeout = 8000; readTimeout = 10000; setRequestProperty("User-Agent", "Kalender-Android/4 (Homelab; kristo.no)") }
        val body = c.inputStream.bufferedReader().use { it.readText() }
        val x = org.json.JSONArray(body).optJSONObject(0) ?: return null
        val ad = x.optJSONObject("address") ?: JSONObject()
        val area = listOf("suburb", "neighbourhood", "quarter", "city_district", "city", "town", "village").firstNotNullOfOrNull { ad.optStrOrNull(it) }
        Geo37Hit(x.optString("lat").toDouble(), x.optString("lon").toDouble(),
            label(ad.optStrOrNull("road") ?: ad.optStrOrNull("pedestrian"), ad.optStrOrNull("house_number"), area, x.optStrOrNull("name"), orig))
    }.getOrNull()

    /* ---------- Statisk kart (OSM-fliser, z 16) ---------- */

    @Synchronized fun mapCached(la: Double, lo: Double): Bitmap? = maps[key(la, lo)]

    private fun key(la: Double, lo: Double) = "%.5f,%.5f".format(Locale.ROOT, la, lo)

    /** 768 × 384 px rundt punktet (pinnen tegnes av Compose i midten). */
    suspend fun map(la: Double, lo: Double): Bitmap? {
        mapCached(la, lo)?.let { return it }
        val bmp = withContext(Dispatchers.IO) {
            runCatching {
                val z = 16
                val n = 1 shl z
                val px = (lo + 180.0) / 360.0 * n * 256.0
                val lr = la * PI / 180.0
                val py = (1.0 - ln(tan(lr) + 1.0 / cos(lr)) / PI) / 2.0 * n * 256.0
                val w = 768; val h = 384
                val x0 = px - w / 2.0; val y0 = py - h / 2.0
                val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                val cv = android.graphics.Canvas(out)
                cv.drawColor(0xFFE9E2D3.toInt())
                var got = 0
                for (tx in floor(x0 / 256).toInt()..floor((x0 + w) / 256).toInt()) for (ty in floor(y0 / 256).toInt()..floor((y0 + h) / 256).toInt()) {
                    val t = tile(z, tx, ty) ?: continue
                    cv.drawBitmap(t, (tx * 256 - x0).toFloat(), (ty * 256 - y0).toFloat(), null)
                    got++
                }
                if (got == 0) null else out
            }.getOrNull()
        } ?: return null
        synchronized(this) { if (maps.size > 30) maps.clear(); maps[key(la, lo)] = bmp }
        return bmp
    }

    private fun tile(z: Int, x: Int, y: Int): Bitmap? {
        val k = "$z/$x/$y"
        synchronized(this) { tiles[k]?.let { return it } }
        val b = runCatching {
            val c = (URL("https://tile.openstreetmap.org/$k.png").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000; readTimeout = 10000; setRequestProperty("User-Agent", "Kalender-Android/4 (Homelab; kristo.no)")
            }
            c.inputStream.use { BitmapFactory.decodeStream(it) }
        }.getOrNull() ?: return null
        synchronized(this) { if (tiles.size > 120) tiles.clear(); tiles[k] = b }
        return b
    }

    fun geoUri(h: Geo37Hit, label: String): String = "geo:${h.la},${h.lo}?q=${h.la},${h.lo}(" + URLEncoder.encode(label, "UTF-8") + ")"
    fun dirUrl(h: Geo37Hit): String = "https://www.google.com/maps/dir/?api=1&destination=${h.la},${h.lo}"
}
