package no.kristo.finanshub

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.time.LocalDate

/*
 * Prompt 24 (ANDROID-B): Familie (én person = én oppføring, enheter og kilde), profiler (Standard · Finans + Boliger ·
 * Boliger-profil), Boliger (toppbilde per bolig, «Rediger bolig»), søk og ✦ AI-søk i Innstillinger, alle integrasjoner
 * (GET/PUT/DELETE /api/integrations) og forhåndslasting av ikonene i Nyhetsleser. Kodet mot kontrakten, med reserve ved 404.
 */

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

/* ---------- Profiler ---------- */

/** Et ferdig oppsett: startside, hovedlinja (homeNav) og Finans-linja (finNav), med serverens nøkler. */
data class Profile24(val key: String, val name: String, val sub: String, val startRoute: String, val homeNav: List<String>, val finNav: List<String>)

val PROFILES24: List<Profile24> = listOf(
    Profile24("standard", "Standard", "Hjem, Finans, Mat og Mer · vanlige Finans-faner", "hjem", emptyList(), listOf("oversikt", "liste", "finn", "sok")),
    Profile24("finans_boliger", "Finans + Boliger", "Åpner i Boliger · Boliger, Søk, Liste, Oversikt, Kvitteringer · Hjem under Mer", "finans/boliger",
        listOf("finans"), listOf("boliger", "sok", "liste", "oversikt", "kvitteringer")),
    Profile24("boliger", "Boliger-profil", "Bare Finans og Domener, med Boliger først", "finans/boliger",
        listOf("finans", "domener"), listOf("boliger", "kvitteringer", "oversikt", "sok")),
)

/** Serverens fanenøkler → appens (kvitteringer heter «kvitt» i appen). */
internal fun finKey24(k: String): String = when (k) { "kvitteringer", "kvittering" -> "kvitt"; "abonnementer" -> "abo"; else -> k }

/* ---------- Domene-pillen ---------- */

data class DomSum24(val visitsToday: Long, val domains: Int, val status: String)

/* ---------- Integrasjoner ---------- */

data class IntegField24(val key: String, val label: String, val type: String, val value: String?, val saved: Boolean, val help: String?)
/** scope: "personal" (brukerens egne, alle ser og endrer) eller "server" (serveroppsett, bare administrator). */
data class Integ24(val id: String, val name: String, val group: String?, val status: String, val fields: List<IntegField24>, val canTest: Boolean,
    val scope: String = "server",
    // Prompt 26: metadata som på web (kategori, merke, farge, kort beskrivelse, statustekst og nummererte steg). Se Mod26B.kt.
    val category: String? = null, val badge: String? = null, val color: String? = null, val description: String? = null,
    val statusText: String? = null, val guide: List<Pair<String, String>> = emptyList(), val hidden: Boolean = false) {
    val personal: Boolean get() = scope == "personal"
}

/** Personlige integrasjoner (ISO2), brukt når serveren ikke sier scope selv (eldre server eller reservelisten). */
private val PERSONAL24 = setOf("calendar", "school", "plex", "jellyfin", "sonarr", "radarr", "t212", "tracking", "mybring", "postnord", "parcelsapp",
    "dhl", "ups", "17track", "imap", "bank", "finn")

/** ISO2: om brukeren kan endre serveroppsettet i FinansHub (bootstrap.canEditServer; eldre server: admin-rollen). */
val AppViewModel.canEditServer: Boolean get() = boot?.canEditServer ?: userIsAdmin

internal fun parseIntegrations24(s: String): List<Integ24> {
    val t = s.trim()
    val a = if (t.startsWith("[")) JSONArray(t) else JSONObject(t).optJSONArray("items") ?: JSONObject(t).optJSONArray("integrations") ?: JSONArray()
    return a.map { o ->
        Integ24(
            o.optString("id"), o.optStr("name") ?: o.optString("id"), o.optStr("group"), o.optStr("status") ?: "missing",
            (o.optJSONArray("fields") ?: JSONArray()).map { f ->
                IntegField24(f.optString("key"), f.optStr("label") ?: f.optString("key"), f.optStr("type") ?: "text", f.optStr("value"),
                    f.optBoolean("saved", f.optStr("value") != null), f.optStr("help"))
            },
            o.optBoolean("canTest", true),
            o.optStr("scope")?.takeIf { it == "personal" || it == "server" } ?: if (o.optString("id") in PERSONAL24) "personal" else "server",
            category = o.optStr("category"), badge = o.optStr("badge"), color = o.optStr("color"), description = o.optStr("description"),
            statusText = o.optStr("statusText"), guide = parseGuide26(o.opt("guide")), hidden = o.optBoolean("hidden", false),
        )
    }
}

/** Når serveren ikke har /api/integrations ennå (404): samme liste som designet, uten verdier. */
val INTEG24_FALLBACK: List<Integ24> = listOf(
    Triple("ha", "Home Assistant", listOf(Triple("url", "Adresse", "url"), Triple("token", "Langtidstoken", "secret"))),
    Triple("google", "Google Kalender (bursdager)", listOf(Triple("googleClientId", "Client ID", "text"), Triple("googleClientSecret", "Client secret", "secret"))),
    Triple("ai", "AI (Gemini, Groq, Ollama)", listOf(Triple("geminiKey", "Gemini-nøkkel", "secret"), Triple("groqKey", "Groq-nøkkel", "secret"), Triple("ollamaUrl", "Ollama-adresse", "url"))),
    Triple("t212", "Trading 212", listOf(Triple("key", "API-nøkkel", "secret"))),
    Triple("bank", "Bankimport", listOf(Triple("format", "Format", "text"))),
    Triple("imap", "Kvitteringer på e-post (IMAP)", listOf(Triple("host", "IMAP-server", "text"), Triple("user", "Brukernavn", "text"), Triple("pass", "App-passord", "secret"))),
    Triple("entur", "Entur / Ruter", listOf(Triple("client", "ET-Client-Name", "text"))),
    Triple("mybring", "Mybring (Posten / Bring)", listOf(Triple("user", "API-bruker (e-post)", "text"), Triple("key", "API-nøkkel", "secret"), Triple("cust", "Kundenummer", "text"))),
    // Prompt 41: PostNord spores uten konto og uten nøkkel (offentlig Track & Trace som ha-postnord); nøkkelen er valgfri.
    Triple("postnord", "PostNord", listOf(Triple("key", "API-nøkkel (valgfri)", "secret"))),
    Triple("parcelsapp", "ParcelsApp (reserve)", listOf(Triple("key", "API-nøkkel", "secret"))),
    Triple("cloudflare", "Cloudflare (domener)", listOf(Triple("token", "API-token", "secret"), Triple("account", "Konto-ID", "text"))),
    Triple("finn", "Finn.no", listOf(Triple("mail", "Varsel-e-post", "text"))),
    Triple("met", "MET / Yr (vær)", listOf(Triple("ua", "User-Agent", "text"))),
    Triple("map", "Kart (MapTiler / Stadia)", listOf(Triple("maptiler", "MapTiler-nøkkel", "secret"), Triple("stadia", "Stadia-nøkkel", "secret"))),
    Triple("icons", "Ikoner", listOf(Triple("src", "Ikonkilde", "text"))),
    Triple("photos", "Unsplash / Pexels", listOf(Triple("unsplash", "Unsplash-nøkkel", "secret"), Triple("pexels", "Pexels-nøkkel", "secret"))),
).map { (id, n, fs) -> Integ24(id, n, null, "missing", fs.map { (k, l, ty) -> IntegField24(k, l, ty, null, false, null) }, false, if (id in PERSONAL24) "personal" else "server") }

/* ---------- Søk i Innstillinger ---------- */

/** Én innstilling som kan finnes i søket: id, tittel, hvor den ligger («Integrasjoner · Mybring»), undertekst og hvor den åpnes. */
data class SetItem24(val id: String, val title: String, val path: String, val sub: String, val page: String?, val extra: String = "")

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

/* ---------- Tilstand ---------- */

class B24State {
    // Profiler
    var profile by mutableStateOf("standard")
    var profiles by mutableStateOf(PROFILES24)
    internal var started = false
    var domFromBoliger by mutableStateOf(false)
    var domSum by mutableStateOf<DomSum24?>(null)
    internal var domSumAt = 0L
    // Innstillinger
    var sq by mutableStateOf("")
    var sqAi by mutableStateOf(false)
    var aiAnswer by mutableStateOf<String?>(null)
    var aiIds by mutableStateOf<List<String>?>(null)
    var aiBusy by mutableStateOf(false)
    internal var aiSeq = 0
    var integ by mutableStateOf<List<Integ24>?>(null)
    var integLegacy by mutableStateOf(false)
    var integError by mutableStateOf<String?>(null)
    var integEdit by mutableStateOf<Pair<String, String>?>(null)
    var integBusy by mutableStateOf<String?>(null)
    // Boliger
    var homes by mutableStateOf<List<Home24>?>(null)
    var cur by mutableStateOf<Int?>(null)
    val details = mutableStateMapOf<Int, HomeDetail24>()
    val bgBitmaps = mutableStateMapOf<String, Bitmap?>()
    var tab by mutableStateOf("ov")
    var q by mutableStateOf("")
    var fc by mutableStateOf("Alle")
    var sel by mutableStateOf<Int?>(null)
    var edit by mutableStateOf<Int?>(null)
    var newHome by mutableStateOf(false)
    var newEntry by mutableStateOf(false)
    var busy by mutableStateOf(false)
    internal var lastFolder: Any? = null
}

/* ---------- Hjelpere ---------- */

private fun AppViewModel.pk24(k: String) = "b24_" + k + "_" + (account?.id ?: "")

/** Kjører et kall; 404 gir null (eldre server). Andre feil går til meldingen. */
private suspend fun <T> AppViewModel.try404(f: suspend Api.() -> T): T? = try { api24b(f) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }

/* ---------- Profiler ---------- */

val AppViewModel.b24ProfileOn: Boolean get() = paper && b24.profile != "standard"

/** Leser profilen fra enheten (med en gang) og fra serveren, og åpner startsiden én gang per oppstart. */
fun AppViewModel.b24Start() {
    val s = b24
    s.profile = prefs.str(pk24("profile"), "standard")
    if (!loggedIn) return
    val first = !s.started
    s.started = true
    if (first && b24ProfileOn && screen == Screen.Homelab && paperPage == null) paperFinTab("boliger")
    launch24b {
        runCatching { api24b { hlGet("/me/profiles") } }.getOrNull()?.let { raw ->
            runCatching {
                val o = JSONObject(raw)
                s.profiles = PROFILES24.map { d ->
                    val p = o.optJSONObject(d.key) ?: return@map d
                    d.copy(startRoute = p.optStr("startRoute") ?: d.startRoute,
                        homeNav = p.optJSONArray("homeNav")?.strings() ?: d.homeNav,
                        finNav = p.optJSONArray("finNav")?.strings()?.ifEmpty { null } ?: d.finNav)
                }
            }
        }
        val raw = runCatching { api24b { hlGet("/me/layout") } }.getOrNull() ?: return@launch24b
        val v = runCatching { JSONObject(raw).optStr("profile") }.getOrNull() ?: return@launch24b
        if (v != s.profile && (v == "custom" || PROFILES24.any { it.key == v })) {
            s.profile = v
            prefs.set(pk24("profile"), v)
            if (first && b24ProfileOn && screen == Screen.Homelab && paperPage == null) paperFinTab("boliger")
        }
    }
}

/** Velger en profil: fanelinjene, startsiden og «Hjem under Mer». Lagres på serveren (synkes mellom enheter). */
fun AppViewModel.b24PickProfile(key: String) {
    val p = b24.profiles.firstOrNull { it.key == key } ?: return
    b24.profile = key
    prefs.set(pk24("profile"), key)
    updatePaperFinTabs(p.finNav.map(::finKey24))
    clearFinLabels26() // Prompt 26: profilen gir standardnavn og -ikoner i Finans-linja
    if (key == "standard" || p.homeNav.isEmpty()) resetTabBar()
    else saveTabBar(p.homeNav.mapNotNull { k -> MAIN_TABS.firstOrNull { it.id == k } } + MAIN_TABS.first { it.id == "mer" })
    launch24b {
        // Etter fanelagringen over (ellers setter serveren profilen til «custom»). PUT {profile} bruker serverens forhåndsoppsett.
        kotlinx.coroutines.delay(800)
        runCatching { api24b { hlPut("/me/layout", JSONObject().put("profile", key)) } }
    }
    flash(if (key == "standard") "Standard-oppsett er tilbake" else "${p.name} er valgt")
    if (key != "standard") paperFinTab("boliger")
}

/** Rotsider i profilen (Boliger og Finans-fanene, Finans → Mer): ingen tilbakeknapp. */
fun AppViewModel.b24IsRoot(): Boolean {
    if (!b24ProfileOn || selectedTx != null || original != null || editing != null || detail != null) return false
    if (paperPage == "fmer" && !paperFromFinMer) return true
    if (paperPage == "fsok") return paperFinTabs.contains("sok")
    if (paperPage != null || paperFromFinMer || paperFromMer || !paperFin) return false
    return paperFinTabs.any { finTabScreen(it) == screen }
}

/** «‹ Boliger» på Domener når profilen er på. */
fun AppViewModel.b24BackLabel(): String? = if (b24ProfileOn && screen == Screen.Domains && paperPage == null && !domainManager) "Boliger" else null

/**
 * Tilbake i profilen: der vanlig tilbake ville gått til Hjem, går den til Boliger (rot). På Boliger beholdes valgt bolig.
 * true = håndtert her.
 */
fun AppViewModel.b24Back(): Boolean {
    if (!paper) return false
    // Boliger: valgt bolig er en del av siden (pillene), ikke en underside.
    if (screen == Screen.Folders && folder != null && previewBack { screen == Screen.Folders && folder == null } == true) {
        val f = folder
        val keepId = b24.cur
        back()
        if (!b24ProfileOn || previewBack { screen to paperPage }?.let { it.first == Screen.Homelab && it.second == null } != true || b24IsRoot()) back()
        else { paperPage = null; paperFinTab("boliger") }
        if (screen == Screen.Folders) { folder = f; b24.cur = keepId }
        return true
    }
    if (!b24ProfileOn) return false
    if (b24IsRoot() && screen == Screen.Folders) return false
    val target = previewBack { screen to paperPage }
    if (target != null && target.first == Screen.Homelab && target.second == null) {
        paperPage = null
        b24.domFromBoliger = false
        paperFinTab("boliger")
        return true
    }
    return false
}

/** Domene-pillen: åpner Domener, og «‹ Boliger» går tilbake. */
fun AppViewModel.b24OpenDomains() {
    b24.domFromBoliger = true
    paperTab("dom")
}

fun AppViewModel.b24LoadDomSummary() {
    val s = b24
    if (!b24ProfileOn || System.currentTimeMillis() - s.domSumAt < 5 * 60_000) return
    s.domSumAt = System.currentTimeMillis()
    launch24b {
        val raw = runCatching { api24b { hlGet("/domains/summary") } }.getOrNull() ?: return@launch24b
        runCatching {
            val o = JSONObject(raw)
            s.domSum = DomSum24(o.optLong("visitsToday"), o.optInt("domains"), o.optStr("status") ?: "ok")
        }
    }
}

/* ---------- Nyhetsleser: forhåndslast ikonene ---------- */

/** Henter alle faneikonene (minne → disk → server) med en gang, og husker ID-ene så de er klare før /rss svarer. */
fun AppViewModel.b24PreloadNewsIcons() {
    val d = news
    val ids = if (d != null) {
        val l = d.categories.mapNotNull { c -> if (d.icOn) d.iconFor(c.id) else null }
        prefs.set(pk24("news_ic"), l.joinToString(","))
        l
    } else prefs.str(pk24("news_ic"), "").split(',').filter { it.contains(':') }.ifEmpty { NEWS_ICON_DEFAULTS.values.toList() }
    ids.distinct().forEach { loadIcon23(it) }
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

/* ---------- Innstillinger: integrasjoner ---------- */

fun AppViewModel.b24LoadIntegrations() {
    val s = b24
    launch24b {
        try {
            val raw = api24b { hlGet("/integrations") }
            s.integ = parseIntegrations24(raw)
            s.integLegacy = false
            s.integError = null
        } catch (e: ApiException) {
            s.integLegacy = e.status == 404
            s.integError = when (e.status) {
                404 -> "Serveren har ikke det nye integrasjonsoppsettet ennå. Oppdater homelab for å redigere her."
                403 -> "Serveren godtar ikke kontoen for integrasjoner ennå. Oppdater homelab."
                else -> e.message
            }
            if (s.integ == null) s.integ = INTEG24_FALLBACK
        }
    }
}

fun AppViewModel.b24SaveIntegField(id: String, key: String, value: String) {
    val s = b24
    s.integBusy = "$id.$key"
    launch24b {
        try {
            api24b { hlPut("/integrations/$id", JSONObject().put(key, value)) }
            s.integEdit = null
            flash("Lagret")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(if (e.status == 404) "Kunne ikke lagre: serveren støtter ikke dette ennå" else (e.message ?: "Kunne ikke lagre"))
        } finally { s.integBusy = null }
    }
}

fun AppViewModel.b24ClearIntegField(id: String, key: String) {
    val s = b24
    s.integBusy = "$id.$key"
    launch24b {
        try {
            api24b { hlDelete("/integrations/$id/$key") }
            s.integEdit = null
            flash("Verdien er fjernet")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(e.message ?: "Kunne ikke fjerne verdien")
        } finally { s.integBusy = null }
    }
}

fun AppViewModel.b24TestIntegration(i: Integ24) {
    val s = b24
    s.integBusy = i.id
    launch24b {
        try {
            val t0 = System.currentTimeMillis()
            val r = runCatching { JSONObject(api24b { hlPost("/integrations/${i.id}/test") }) }.getOrNull()
            val ok = r?.optBoolean("ok", true) ?: true
            val msg = r?.optStr("message") ?: r?.optStr("error")
            flash(if (ok) "✓ ${i.name} svarte på ${r?.optLong("ms", System.currentTimeMillis() - t0) ?: (System.currentTimeMillis() - t0)} ms" else "Feil: ${msg ?: "fikk ikke kontakt"}")
        } catch (e: ApiException) {
            flash("Feil: ${e.message ?: "fikk ikke kontakt"}")
        } finally { s.integBusy = null }
    }
}

/* ---------- Innstillinger: ✦ AI-søk ---------- */

/** POST /api/settings/ai-search {q, items} → {answer, ids}. Uten AI (eller 404) brukes lokal tekstmatch. */
fun AppViewModel.b24AiSearch(q: String, items: List<SetItem24>, local: (String) -> Pair<String?, List<String>>) {
    val s = b24
    val seq = ++s.aiSeq
    s.aiBusy = true
    p34.aiAnchor = null
    launch24b {
        try {
            val body = JSONObject().put("q", q).put("items", JSONArray().apply { items.forEach { put(JSONObject().put("id", it.id).put("title", it.title).put("path", it.path)) } })
            val raw = runCatching { api24b { request("POST", "/settings/ai-search", body, prefix = Api.HOMELAB, timeout = 8_000, read = 20_000) } }.getOrNull()
            val o = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
            if (seq != s.aiSeq) return@launch24b
            // Prompt 34: serverens mål-id ({anchor}, f.eks. «upd») valideres mot indeksen før navigering.
            p34.aiAnchor = o?.optStr("anchor")?.takeIf { a -> ANCHORS34.any { it.id == a } }
            val ids0 = o?.optJSONArray("ids").strings().filter { id -> items.any { it.id == id } }
            val ids = p34.aiAnchor?.let { a -> if (items.any { it.id == a }) listOf(a) + ids0.filter { it != a } else ids0 } ?: ids0
            if (o != null && (ids.isNotEmpty() || o.optStr("answer") != null)) {
                s.aiIds = ids; s.aiAnswer = o.optStr("answer")
            } else {
                val (a, l) = local(q)
                s.aiIds = l; s.aiAnswer = a
            }
        } finally { if (seq == s.aiSeq) s.aiBusy = false }
    }
}

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
    else flash("Kvitteringer på e-post hentes automatisk. Sett opp IMAP under Innstillinger → Integrasjoner.")
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
