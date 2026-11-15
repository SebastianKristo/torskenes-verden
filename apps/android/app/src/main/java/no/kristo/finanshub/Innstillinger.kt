package no.kristo.finanshub

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Job
import org.json.JSONArray
import org.json.JSONObject

/* ---------- Innstillinger: «Ta meg dit →» ---------- */

/** Fremhev en rad i ca. 3 s (scroll fram, lys rød bakgrunn og rød strek som toner ut). */
fun AppViewModel.highlight25(key: String, index: Int? = null) {
    p25.hl = key
    p25.hlIndex = index
    p25.hlSeq++
}

/* ---------------- Innstillinger: mål-id-er (IDX) ---------------- */

/** Mål for AI-søket i Innstillinger: [nøkkelord, tittel, sti, boble] per mål-id. */
data class Anchor34(val id: String, val title: String, val path: String, val words: String, val bubble: String? = null, val admin: Boolean = false)

val ANCHORS34: List<Anchor34> = listOf(
    Anchor34("upd", "Oppdater nå", "System", "oppdater oppdatere oppdaterer update nordlys installer ny versjon", "✦ Trykk her for å oppdatere", admin = true),
    Anchor34("chk", "Se etter oppdatering", "System", "se etter oppdatering versjon sjekk ny"),
    Anchor34("pw", "Krev passord for å oppdatere", "System", "krev passord fingeravtrykk oppdater oppdatering", admin = true),
    Anchor34("theme", "Tema", "Utseende", "tema mørk lys mørkt modus farge"),
    Anchor34("bg", "Bakgrunn", "Utseende", "bakgrunn bilde forside bakgrunnsbilde"),
    Anchor34("quiet", "Stille timer", "Varsler", "stille timer natt lyd av forstyrr"),
    Anchor34("push", "Varsler", "Varsler", "push varsel varsler lyd"),
    Anchor34("haptic", "Haptikk", "Varsler", "haptikk vibrasjon vibrer haptisk"),
    Anchor34("2fa", "Totrinnsbekreftelse", "Sikkerhet", "2fa totrinn tofaktor autentisering kode"),
    Anchor34("bk-now", "Ta backup nå", "Backup", "backup nå sikkerhetskopi ta", admin = true),
    Anchor34("bk-auto", "Automatisk backup", "Backup", "automatisk backup hver natt", admin = true),
    Anchor34("glimt", "Glimt", "Glimt", "glimt brief briefer stemme stemmer figur figurer opplesning les opp venner sky dråpe ugle gris morgenbrief kveldsbrief nattbrief tts openai elevenlabs azure"),
    Anchor34("ai-mod", "AI og modeller", "Glimt og AI → AI", "ai modell modeller ollama gemini groq nøkkel tokens jobber glimt"),
)

/* ---------------- Innstillinger: markering ---------------- */

/** Markerer et mål (rød ring som pulserer) i 6 s eller til første trykk. Lett haptikk. */
fun AppViewModel.hl34(anchor: String) {
    p34.hl = anchor
    p34.hlSeq++
    Haptics.select()
}

/** Går til siden for målet og markerer kontrollen. */
fun AppViewModel.goAnchor34(id: String): Boolean {
    when (id) {
        "upd", "chk", "pw" -> { b24.sq = ""; openNordlys31() }
        "theme", "bg" -> settingsPage = "look"
        "quiet", "push" -> settingsPage = "notify"
        "haptic" -> settingsPage = "notify"
        "2fa" -> settingsPage = "security"
        "bk-now", "bk-auto" -> settingsPage = "sysbackup"
        "ai-mod" -> { settingsPage = null; b24.sq = ""; openAiCtl34("ov"); return true }
        "glimt" -> { settingsPage = null; b24.sq = ""; b24.aiAnswer = null; b24.aiIds = null; openGlimt35(); hl34(id); return true }
        else -> return false
    }
    b24.sq = ""; b24.aiAnswer = null; b24.aiIds = null
    hl34(id)
    return true
}

/* ---------- Appnavn og -ikon (/api/app) ---------- */

data class AppInfo(val name: String, val icon: String)

/** Ikonene i Innstillinger → App-ikon: nøkkel (serveren), navn og alias i manifestet. */
val APP_ICONS = listOf(
    Triple("hus", "Homelab H· (standard)", "IconHus"), // prompt 39: nytt standardikon fra app-icon-maskable-512.png
    Triple("monogram", "Papir-monogram", "IconMonogram"),
    Triple("rom", "Fire rom", "IconRom"),
)

fun parseAppInfo(s: String): AppInfo {
    val o = JSONObject(s).let { it.optJSONObject("app") ?: it }
    return AppInfo(o.optStr("name")?.take(40) ?: "Homelab", o.optStr("icon")?.takeIf { k -> APP_ICONS.any { it.first == k } } ?: "hus")
}

/* ---------- Søk i Innstillinger ---------- */

/** Én innstilling som kan finnes i søket: id, tittel, hvor den ligger («Integrasjoner · Mybring»), undertekst og hvor den åpnes. */
data class SetItem24(val id: String, val title: String, val path: String, val sub: String, val page: String?, val extra: String = "")

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

/* ---------- Tilstand ---------- */

class B26State {
    /** Økes når aktiv fane trykkes på rotsiden: siden bygges på nytt og står øverst. */
    var topSeq by mutableStateOf(0)
    internal var topDone = 0
    /** «Rediger fanelinjen» for Finans (hold inne på Finans-linja). */
    var finEdit by mutableStateOf(false)
    /** Egne navn og ikoner i Finans-linja: nøkkel → (navn, ikon-tegn). */
    var finLbl by mutableStateOf<Map<String, Pair<String?, String?>>>(emptyMap())
    internal var finLblFor: String? = null
    /** Kalendere ble åpnet fra: «integ» (Integrasjoner), «bd» (Bursdager) eller null (Innstillinger). */
    var kalFrom by mutableStateOf<String?>(null)
    internal var kalBackPage: String? = null
    /** «Fjern alle verdier» er trykket én gang for denne integrasjonen (trykk igjen for å bekrefte). */
    var clearArm by mutableStateOf<String?>(null)
    /** Sporing: lokale overstyringer når serveren ikke kan lagre dem ennå (sporingsnummer → transportør). */
    var trkOvr by mutableStateOf<Map<String, String>>(emptyMap())
    internal var trkOvrFor: String? = null
}

/* ---------- Innstillinger: tilbake og titler ---------- */

/** Tilbake fra en underside i Innstillinger (kalles fra back()): integrasjonssider → Integrasjoner, Kalendere → der den ble åpnet. */
fun AppViewModel.settingsBack26() {
    val pg = settingsPage
    when {
        pg?.startsWith("integ:") == true -> settingsPage = "integ"
        pg == "kal" && b26.kalFrom == "integ" -> { settingsPage = "integ"; b26.kalFrom = null }
        pg == "kal" && b26.kalFrom == "bd" -> { settingsPage = null; b26.kalFrom = null; paperPage = b26.kalBackPage; bd24.open = true }
        no.kristo.finanshub.ui.parent67(pg) != null -> settingsPage = no.kristo.finanshub.ui.parent67(pg) // prompt 67: Glimt/App/Finans-undersider
        else -> settingsPage = null
    }
}

fun AppViewModel.settingsBackLabel26(): String = when {
    settingsPage?.startsWith("integ:") == true -> "Integrasjoner"
    settingsPage == "kal" && b26.kalFrom == "integ" -> "Integrasjoner"
    settingsPage == "kal" && b26.kalFrom == "bd" -> "Bursdager"
    no.kristo.finanshub.ui.parent67(settingsPage) != null -> no.kristo.finanshub.ui.SET67_TITLES[no.kristo.finanshub.ui.parent67(settingsPage)] ?: "Alle innstillinger"
    else -> "Alle innstillinger"
}

/** Åpner Innstillinger → Kalendere (fra Integrasjoner, Bursdager eller Innstillinger). */
fun AppViewModel.openKalSettings26(from: String?) {
    if (from == "bd") {
        b26.kalBackPage = paperPage
        bd24.open = false
        openPaperPage("set")
    }
    b26.kalFrom = from
    settingsPage = "kal"
}

/** Åpner siden for én integrasjon (Kalendere har sin egen side). */
fun AppViewModel.openInteg26(id: String) {
    b26.clearArm = null
    if (id in INTEG26_ON_KAL) openKalSettings26("integ") else settingsPage = "integ:$id"
}

/** «Fjern alle verdier»: fjerner hvert lagret felt, og henter listen på nytt. */
fun AppViewModel.b26ClearAll(i: Integ24) {
    val s = b24
    s.integBusy = i.id
    b26.clearArm = null
    launch24b {
        try {
            for (f in i.fields) if (f.saved || !f.value.isNullOrBlank()) api24b { hlDelete("/integrations/${i.id}/${f.key}") }
            flash("${i.name} er nullstilt")
            s.integ = parseIntegrations24(api24b { hlGet("/integrations") })
        } catch (e: ApiException) {
            flash(e.message ?: "Kunne ikke fjerne verdiene")
        } finally { s.integBusy = null }
    }
}

/* ---------- Modeller ---------- */

data class AiAudit27(val id: String, val ts: String?, val engine: String, val purpose: String, val fields: String)

class B27State {
    /* Finans-forslag */
    var sug by mutableStateOf<List<FinSug27>>(emptyList())
    /** Etter valg av forslag eller Enter: ingen forslag før brukeren skriver igjen. */
    var sugHidden by mutableStateOf(false)
    internal var sugJob: Job? = null
    internal var sugLocal = false

    /* Personvern og logoer */
    var privacy by mutableStateOf<Map<String, Boolean>>(emptyMap())
    internal var privacyLoaded = false
    var audit by mutableStateOf<List<AiAudit27>?>(null)
    var auditOpen by mutableStateOf(false)
    var auditError by mutableStateOf<String?>(null)
    var logoPick by mutableStateOf<LogoPick27?>(null)
    var logoBusy by mutableStateOf(false)
    var logoMsg by mutableStateOf<String?>(null)
    /** Logoer valgt i denne økten (navn → bilde), vises med en gang. */
    var logoDone by mutableStateOf<Map<String, Bitmap>>(emptyMap())

    /* Nyheter */
    var articleFor by mutableStateOf<NewsItem?>(null)
    var article by mutableStateOf<Article27?>(null)
    var articleBusy by mutableStateOf(false)
    var articleError by mutableStateOf<String?>(null)
    internal val articleCache = mutableMapOf<String, Article27>()
    internal val imgCache = android.util.LruCache<String, Bitmap>(80)
    internal val imgMiss = mutableMapOf<String, Long>()

    /* Ruter på Hjem */
    var homeDep by mutableStateOf(HomeDep27(emptyList(), 3))
    internal var homeDepFor: String? = null
    var homeStops by mutableStateOf<List<StopRef>?>(null)
    var homeDeps by mutableStateOf<Map<String, StopDeps>>(emptyMap())
    var homeSheet by mutableStateOf(false)

    /* Abonnement fra skjermbilde */
    var shot by mutableStateOf<SubShot27?>(null)
    var shotOpen by mutableStateOf(false)
    var shotBusy by mutableStateOf(false)
    var shotError by mutableStateOf<String?>(null)
    var shotThumb by mutableStateOf<Bitmap?>(null)
    var shotName by mutableStateOf("")
    /** «Rediger først»: skjemaet for nytt abonnement fylles ut med dette. */
    var subPrefill by mutableStateOf<SubShot27?>(null)

}

/* ---------- Personvern og logoer ---------- */

val PRIVACY27 = listOf(
    Triple("logo_local_receipts", "Les kvitteringer lokalt", "Ollama på hjemmeserveren leser hele kvitteringen. Ingenting sendes ut"),
    Triple("logo_gemini", "Finn logo med Gemini", "Gemini får bare butikknavnet, f.eks. «Blomsterlandet»"),
    Triple("logo_verify", "Sjekk logoen før den lagres", "Domenet må svare, og bildet må være et ekte bilde"),
)

fun AppViewModel.loadPrivacy27() {
    val s = b27
    if (s.privacyLoaded) return
    s.privacyLoaded = true
    launch27b {
        val o = runCatching { JSONObject(api27b { get("/settings") }) }.getOrNull() ?: return@launch27b
        val u = o.optJSONObject("user")
        s.privacy = PRIVACY27.associate { (k, _, _) ->
            k to when {
                o.has(k) && !o.isNull(k) -> o.opt(k).let { it == true || it == "true" || it == 1 || it == "1" }
                u != null && u.has(k) && !u.isNull(k) -> u.opt(k).let { it == true || it == "true" || it == 1 || it == "1" }
                else -> true
            }
        }
    }
}

fun AppViewModel.setPrivacy27(key: String, on: Boolean) {
    val s = b27
    s.privacy = s.privacy + (key to on)
    launch27b {
        // Personlig innstilling: FinansHub-innstillingene (per bruker), og Homelab-oppsettet hvis serveren har nøkkelen der.
        val ok = runCatching { api27b { put("/settings", JSONObject().put(key, on)) } }.isSuccess
        val ok2 = runCatching { api27b { request("PUT", "/config", JSONObject().put(key, on.toString()), prefix = Api.HOMELAB) } }.isSuccess
        if (!ok && !ok2) flash("Kunne ikke lagre innstillingen")
    }
}

private fun fieldsText27(v: Any?): String = when (v) {
    null, JSONObject.NULL -> ""
    is JSONArray -> (0 until v.length()).joinToString(", ") { v.opt(it).toString() }
    is JSONObject -> v.keys().asSequence().joinToString(", ") { k -> "$k: ${v.opt(k)}" }
    is String -> v.trim().let { t ->
        when {
            t.startsWith("[") -> runCatching { fieldsText27(JSONArray(t)) }.getOrDefault(t)
            t.startsWith("{") -> runCatching { fieldsText27(JSONObject(t)) }.getOrDefault(t)
            else -> t
        }
    }
    else -> v.toString()
}

fun AppViewModel.loadAiAudit27() {
    val s = b27
    s.auditError = null
    launch27b {
        try {
            val raw = api27b { get("/ai-audit") }.trim()
            val a = if (raw.startsWith("[")) JSONArray(raw) else JSONObject(raw).let { it.optJSONArray("items") ?: it.optJSONArray("rows") ?: JSONArray() }
            s.audit = a.map { o ->
                AiAudit27(o.opt("id")?.toString() ?: "", o.optStr("ts") ?: o.optStr("at"), o.optStr("engine") ?: "AI", o.optStr("purpose") ?: "",
                    fieldsText27(o.opt("fields_sent") ?: o.opt("fieldsSent") ?: o.opt("fields")))
            }
        } catch (e: ApiException) {
            s.audit = emptyList()
            s.auditError = if (e.status == 404) "AI-loggen trenger en nyere Homelab-server." else e.message
        }
    }
}
