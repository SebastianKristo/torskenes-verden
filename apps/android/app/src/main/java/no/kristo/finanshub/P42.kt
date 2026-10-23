package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 42 (ANDROID42), kontrakten CONTRACT42.md og design_handoff_homelab/prompts/prompt-42-pakke/:
 *  - Material You-«Klassisk» er slettet. Papir er eneste design; «klassisk» migreres til Papir · lys/mørk i AppViewModel.init.
 *  - Fanelinja: valgfri Hjem-knapp (Standard / 1a / 1b / 1c / 1d), lagres per bruker (papir_navhome_<konto>) og synkes som
 *    `homeButton` i /api/me/layout (claude-code-navbar-hjem-knapp.md). Tegnes i ui/Ui42.kt og ui/Paper.kt (PaperNav).
 *  - Vel fremme (tidligere Hjemlys): egen fane i Familie, «Aktive i familien» og Glimt-forslaget (claude-code-vel-fremme.md).
 *  - Helse fra Home Assistant: HA-mobilappens enheter koblet til personer (claude-code-helse-fra-home-assistant.md).
 *    Klienten tåler 404: GET /api/family/health/ha → {devices:[…], people:[…]}, PUT /api/family/health/ha/devices/:id.
 *  - Fraktselskap normaliseres (carrierId42) før logo-oppslag, og PostNord-logoen er pakket med appen (claude-code-postnord-logo-fiks.md).
 *  - Gjøremål-Glimt: lokal forhåndsdeling uten tegnsetting (gjentatt stedsnavn, «og hent …»), begrunnelser blir notat
 *    (claude-code-huskeliste-glimt-del-opp.md).
 */

/** Hjem-knappen i fanelinja: verdiene som lagres og synkes. */
val NAV_HOME42: List<Triple<String, String, String>> = listOf(
    Triple("standard", "Standard", "«‹ Hjem» øverst, som i dag"),
    Triple("1a", "Egen Hjem-knapp", "Rund knapp til venstre for fanelinja"),
    Triple("1b", "Hjem først i linjen", "Hjem-ikon som første plass, skilt med en strek"),
    Triple("1c", "Hjem i midten", "Hevet rød knapp midt i fanelinja"),
    Triple("1d", "Modulvelger", "«kr Finans ▴» åpner Hjem og alle moduler"),
)

/** Godtar også designets «std». */
fun normNavHome42(s: String?): String? = when (s?.trim()?.lowercase()) {
    "standard", "std", "" -> "standard"
    "1a", "1b", "1c", "1d" -> s.trim().lowercase()
    else -> null
}

/** En enhet fra Home Assistant-mobilappen (HA Companion). */
data class HaSensor42(val key: String, val entity: String, val label: String, val on: Boolean)
data class HaDevice42(
    val id: String, val name: String, val model: String?, val platform: String, val entities: Int,
    val sensors: List<HaSensor42>, val personId: String?, val updatedAt: String?, val unavailableSince: String?,
)
data class HaPerson42(val id: String, val name: String)

/** Sensorene som er forhåndsvalgt (claude-code-helse-fra-home-assistant.md). */
val HA_DEFAULT42 = setOf("steps", "heart_rate", "resting_heart_rate", "sleep_duration", "active_calories_burned", "activity")

private val HA_LABELS42 = mapOf(
    "steps" to "Skritt", "heart_rate" to "Puls", "resting_heart_rate" to "Hvilepuls", "sleep_duration" to "Søvn",
    "active_calories_burned" to "Aktive kalorier", "total_calories_burned" to "Kalorier totalt", "distance" to "Distanse",
    "floors_climbed" to "Etasjer", "floors_ascended" to "Etasjer opp", "floors_descended" to "Etasjer ned", "weight" to "Vekt",
    "body_fat" to "Fettprosent", "oxygen_saturation" to "Oksygenmetning", "respiratory_rate" to "Pustefrekvens", "blood_glucose" to "Blodsukker",
    "vo2_max" to "VO₂ maks", "average_active_pace" to "Snittempo", "activity" to "Aktivitet",
)

fun haLabel42(key: String): String = HA_LABELS42[key] ?: key.replace('_', ' ').replaceFirstChar { it.uppercase() }

class P42State {
    /* Hjem-knappen */
    var navHome by mutableStateOf("standard")
    internal var navHomeFor: String? = "\u0000"
    var navHomeSheet by mutableStateOf(false)
    /** 1d: rutenettet med moduler er åpent. */
    var modPick by mutableStateOf(false)

    /* Familie → Vel fremme */
    var vfShowZone by mutableStateOf<String?>(null)

    /* Helse fra Home Assistant */
    var haDevices by mutableStateOf<List<HaDevice42>?>(null)
    var haPeople by mutableStateOf<List<HaPerson42>>(emptyList())
    var haMissing by mutableStateOf(false)
    var haError by mutableStateOf<String?>(null)
    var haBusy by mutableStateOf(false)
    var haOpen by mutableStateOf<String?>(null)
}

/* ======================= Hjem-knappen ======================= */

private fun AppViewModel.navHomeKey42() = "papir_navhome_" + (account?.id ?: "")

/** Gjeldende valg (lastes fra lagret verdi én gang per konto). */
fun AppViewModel.navHome42(): String {
    val s = p42
    val acct = account?.id
    if (s.navHomeFor != acct) {
        s.navHomeFor = acct
        s.navHome = normNavHome42(prefs.str(navHomeKey42(), "")) ?: "standard"
    }
    return s.navHome
}

fun AppViewModel.navHomeLabel42(): String = NAV_HOME42.firstOrNull { it.first == navHome42() }?.second ?: "Standard"

/** Fra GET /api/me/layout (homeButton, eller navHome fra eldre utkast). */
fun AppViewModel.applyNavHome42(raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val v = normNavHome42(o.optStr("homeButton") ?: o.optJSONObject("app")?.optStr("homeButton") ?: o.optStr("navHome")) ?: return
    navHome42()
    p42.navHome = v
    prefs.set(navHomeKey42(), v)
}

/** Endringen skjer med en gang (lett haptikk), lagres lokalt og synkes til de andre enhetene. */
fun AppViewModel.setNavHome42(v: String) {
    val k = normNavHome42(v) ?: return
    navHome42()
    if (p42.navHome == k) return
    p42.navHome = k
    p42.modPick = false
    prefs.set(navHomeKey42(), k)
    Haptics.select()
    launch42 { runCatching { api42 { hlPut("/me/layout", JSONObject().put("homeButton", k)) } } }
}

/** Hjem-knappen: alltid til Hjem, uansett modul og underside. */
fun AppViewModel.goHome42() {
    p42.modPick = false
    paperPage = null
    paperTab("hjem")
}

/* ======================= Helse fra Home Assistant ======================= */

private fun parseHa42(raw: String): Pair<List<HaDevice42>, List<HaPerson42>> {
    val o = JSONObject(raw)
    val devs = (o.optJSONArray("devices") ?: JSONArray()).let { a ->
        (0 until a.length()).mapNotNull { i ->
            val d = a.optJSONObject(i) ?: return@mapNotNull null
            val id = d.optStr("id") ?: d.optStr("deviceId") ?: return@mapNotNull null
            val chosen = d.optJSONArray("enabled")?.let { e -> (0 until e.length()).map { e.optString(it) }.toSet() }
            val sensors = (d.optJSONArray("sensors") ?: JSONArray()).let { sa ->
                (0 until sa.length()).mapNotNull { k ->
                    val x = sa.opt(k)
                    val so = x as? JSONObject
                    val key = so?.optStr("key") ?: so?.optStr("metric") ?: (x as? String) ?: return@mapNotNull null
                    val on = so?.takeIf { it.has("enabled") }?.optBoolean("enabled") ?: chosen?.contains(key) ?: (key in HA_DEFAULT42)
                    HaSensor42(key, so?.optStr("entity") ?: so?.optStr("entity_id") ?: "", so?.optStr("label") ?: haLabel42(key), on)
                }
            }
            HaDevice42(id, d.optStr("name") ?: "Enhet", d.optStr("model"), (d.optStr("platform") ?: d.optStr("os") ?: "").lowercase(),
                d.optInt("entities", d.optInt("entityCount", 0)), sensors, d.optStr("personId") ?: d.optStr("userId"),
                d.optStr("updatedAt") ?: d.optStr("lastSeen"), d.optStr("unavailableSince"))
        }
    }
    val people = (o.optJSONArray("people") ?: o.optJSONArray("members") ?: JSONArray()).let { a ->
        (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { p -> HaPerson42(p.optStr("id") ?: p.optStr("userId") ?: return@let null, p.optStr("name") ?: "") } }
    }
    return devs to people
}

/** Forslag fra navnet: «Rune iPhone 13» → Rune. */
fun haGuess42(d: HaDevice42, people: List<HaPerson42>): HaPerson42? {
    val n = d.name.lowercase()
    return people.firstOrNull { p -> p.name.split(' ').firstOrNull()?.lowercase()?.takeIf { it.length > 1 }?.let { n.startsWith(it) || n.contains("$it ") || n.contains("${it}s ") } == true }
}

fun AppViewModel.loadHa42(force: Boolean = false) {
    val s = p42
    if (s.haBusy || (!force && (s.haDevices != null || s.haMissing))) return
    s.haBusy = true
    launch42 {
        try {
            // Prompt 45 (claude-code-helse-ha-opprydding.md): bare enheter fra mobile_app; Telefoner (standard) eller Alle mobilapp.
            val raw = try { api42 { hlGet("/family/health/ha?view=" + p45.haView, timeout = 12_000) } } catch (e: ApiException) {
                if (e.status == 404) api42 { hlGet("/health/ha/devices", timeout = 12_000) } else throw e
            }
            val (d, p) = parseHa42(raw)
            runCatching { org.json.JSONObject(raw) }.getOrNull()?.let { o ->
                p45.haHidden = o.optJSONObject("hidden")?.optString("text")?.takeIf { it.isNotBlank() }
                p45.haStatus = o.optJSONObject("status")?.optString("text")?.takeIf { it.isNotBlank() }
            }
            s.haDevices = d
            s.haPeople = p.ifEmpty { family?.members?.map { HaPerson42(it.userId, it.name) } ?: emptyList() }
            s.haMissing = false; s.haError = null
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.haMissing = true
            else s.haError = if (e.status == 401 || e.status == 403) "Koble til Home Assistant på nytt (Innstillinger → Integrasjoner)." else e.message
        } catch (e: Exception) {
            s.haError = e.message ?: "Fikk ikke kontakt med Home Assistant"
        } finally { s.haBusy = false }
    }
}

/** Lagrer koblingen enhet → person og valgte sensorer. Første synk (30 dager historikk) gjøres av serveren. */
fun AppViewModel.saveHa42(d: HaDevice42, personId: String?, sensors: Set<String>) {
    val s = p42
    val nd = d.copy(personId = personId, sensors = d.sensors.map { it.copy(on = it.key in sensors) })
    s.haDevices = s.haDevices?.map { if (it.id == d.id) nd else it }
    launch42 {
        try {
            api42 {
                request("PUT", "/family/health/ha/devices/" + URLEncoder.encode(d.id, "UTF-8"),
                    JSONObject().put("personId", personId ?: JSONObject.NULL).put("sensors", JSONArray(sensors.toList())), prefix = Api.HOMELAB)
            }
            flash(if (personId == null) "${d.name} er koblet fra" else "Lagret · første synk henter 30 dager")
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            message = if (e.status == 404) "Serveren har ikke helse fra Home Assistant ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { message = e.message ?: "Fikk ikke lagret" }
    }
}

/* ======================= Fraktselskap ======================= */

/** «POSTNORD», «PostNord AB», «PostNord Norge», «postnord_no» → «postnord». Brukes til logo-oppslag i stedet for visningsnavnet. */
fun carrierId42(raw: String?): String? {
    var k = raw?.trim()?.lowercase() ?: return null
    if (k.isEmpty()) return null
    k = k.replace(Regex("[_\\-](no|se|dk|fi)$"), "")
    k = k.replace(Regex("\\s+(ab|as|asa|norge|norway|sverige|sweden|danmark|logistics)$"), "")
    k = k.replace(Regex("[^a-z0-9æøå]"), "")
    return when (k) {
        "postnord", "postnordno", "postnordnorge" -> "postnord"
        "posten", "postennorge" -> "posten"
        "bring", "bringno" -> "bring"
        "dhl", "dhlexpress", "dhlparcel", "dhlfreight" -> "dhl"
        "helthjem" -> "helthjem"
        "instabox" -> "instabox"
        "budbee" -> "budbee"
        "ups" -> "ups"
        "fedex", "fedexexpress" -> "fedex"
        "gls" -> "gls"
        "dbschenker", "schenker" -> "schenker"
        "porterbuddy" -> "porterbuddy"
        "aliexpress", "aliexpressstandardshipping", "cainiao" -> "aliexpress"
        else -> k
    }
}

/* ======================= Gjøremål-Glimt: lokal forhåndsdeling ======================= */

private val FILL42 = Regex("(?i)^(husk(e)?\\s+å|må\\s+huske\\s+å|jeg\\s+må(\\s+huske\\s+å)?|vi\\s+må|de\\s+må|må)\\s+")
private val REASON42 = Regex("(?i)\\s*,?\\s*\\b(siden|fordi|for at)\\b\\s+(.+)$")

/** Fjerner gjentatte ord («ha ha» → «ha») og fyllord i starten. */
private fun clean42(s: String): String {
    val w = s.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    val out = ArrayList<String>()
    for (x in w) if (out.isEmpty() || !out.last().equals(x, true)) out += x
    var t = out.joinToString(" ")
    repeat(3) { t = t.replace(FILL42, "") }
    return t.trim().trim(',', '.', ';')
}

/** «… siden vi skal ha med store ting opp til Toten» → notatet «Trengs til store ting opp til Toten» (tittelen uten begrunnelsen). */
fun reason42(s: String): String? = REASON42.find(s)?.groupValues?.get(2)?.trim()?.trim('.', ',')?.takeIf { it.split(' ').size >= 2 }?.let { r ->
    val x = r.replace(Regex("(?i)^(vi|jeg|de)\\s+(skal|må)\\s+(ha\\s+med\\s+)?"), "")
    "Trengs til " + x.replace(Regex("(?i)\\s+og\\s+da\\s+.*$"), "").trim()
}

fun stripReason42(s: String): String = REASON42.replace(s, "").trim()

/**
 * Deler en beskjed uten tegnsetting: grense ved gjentatt stedsnavn («… Strømstad Strømstad må …»), ved «og så» / «og husk»,
 * og ved «og» + verb («… brød og hent pakken …»). Fyllord fjernes. Gir minst to deler, ellers null.
 */
fun localSplit42(q: String): List<String>? {
    var t = q.trim()
    if (t.isEmpty()) return null
    // Gjentatt stort ord rett etter hverandre (stedsnavn) er en grense: «Strømstad Strømstad» → «Strømstad | …».
    t = t.replace(Regex("\\b([A-ZÆØÅ][\\wæøåÆØÅ-]{2,})\\s+\\1\\b"), "$1 ¦")
    t = t.replace(Regex("(?i)\\s+og\\s+(så|husk(e)?(\\s+å)?)\\s+"), " ¦ ")
    t = t.replace(Regex("(?i)\\s+og\\s+(?=(hent|kjøp|send|lever|ring|bestill|betal|kjør|pakk|ta med|vask|rydd|fiks|book|sjekk|bytt)\\b)"), " ¦ ")
    val parts = t.split('¦').map { clean42(it) }.filter { it.split(' ').size >= 2 }
    return parts.takeIf { it.size >= 2 }
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
        val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        c.connectTimeout = 6_000; c.readTimeout = 8_000
        return try { c.inputStream.bufferedReader().use { it.readText() } } finally { c.disconnect() }
    }
}
