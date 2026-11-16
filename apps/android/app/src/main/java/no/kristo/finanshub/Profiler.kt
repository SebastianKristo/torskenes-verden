package no.kristo.finanshub

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONObject

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
/** Serverens nøkler i finNav → appens. Fase 6: serveren sender «transaksjoner» og «faste» (alias for «liste» og «abonnementer»). */
internal fun finKey24(k: String): String = when (k) { "kvitteringer", "kvittering" -> "kvitt"; "abonnementer", "faste" -> "abo"; "transaksjoner" -> "liste"; else -> k }

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

internal fun AppViewModel.pk24(k: String) = "b24_" + k + "_" + (account?.id ?: "")

/** Kjører et kall; 404 gir null (eldre server). Andre feil går til meldingen. */
internal suspend fun <T> AppViewModel.try404(f: suspend Api.() -> T): T? = try { api24b(f) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }

/* ---------- Profiler ---------- */

val AppViewModel.b24ProfileOn: Boolean get() = b24.profile != "standard"

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
