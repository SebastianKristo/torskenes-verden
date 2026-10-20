package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/*
 * Prompt 40 (ANDROID40) – design_handoff_homelab/prompts/prompt-40-pakke/:
 *  - Fanelinja: alle sider fra Mer (huske, kalender, bursdag, brief, rss, bibel, nordlys, innst) – mainTab40.
 *  - Gjøremål: tilbake går alltid til Hjem; Glimt deler setninger i flere punkter med rekkefølge, sted, @person og tagger.
 *  - 2FA i appen (GET/POST /api/auth/2fa/…), aldri via nettleseren.
 *  - Finans: «Lagt til …»-linja, «✦ La Glimt lese kvitteringen på nytt» (reanalyze med apply:false → endringer → Bruk/Behold),
 *    «Rediger alt» (PATCH /finans/api/transactions/:id med alle felt og linjer) og Søk med Glimt-kort (POST /finans/api/search/ask).
 *  - Nyheter: egen Glimt-side (POST /api/news/glimt), valg av kilder/temaer/periode/lengde.
 *  - Julemodus (Jul40): Auto/Av/På + fase, figurbiblioteket legger selv på antrekket (GlimtFigs35.drawFig35).
 *  - Hjemlys: se Hjemlys40.kt.
 * Alle nye endepunkter tåler 404 (eldre server): da brukes lokale reserver eller valget skjules.
 */

class P40State {
    /* 2FA */
    var tfOpen by mutableStateOf(false)
    var tf by mutableStateOf<Tf40?>(null)
    var tfStep by mutableIntStateOf(0)
    var tfSetup by mutableStateOf<TfSetup40?>(null)
    var tfCodes by mutableStateOf<List<String>>(emptyList())
    var tfBusy by mutableStateOf(false)
    var tfErr by mutableStateOf<String?>(null)
    var tfNeedPw by mutableStateOf(false)
    /** Administrer: «setup» (bytt app), «disable» (slå av, krever passord) eller «codes» (nye reservekoder). */
    var tfManage by mutableStateOf<String?>(null)

    /* Finans: les på nytt, rediger alt, søk */
    var rr by mutableStateOf<Map<Int, Reread40>>(emptyMap())
    var editAll by mutableStateOf<Int?>(null)
    var editBusy by mutableStateOf(false)
    var ask by mutableStateOf<Ask40?>(null)
    var askFor by mutableStateOf<String?>(null)
    var askBusy by mutableStateOf(false)

    /* Nyheter: Glimt-siden */
    var newsGl by mutableStateOf(false)
    var ng by mutableStateOf<NewsGl40?>(null)
    var ngBusy by mutableStateOf(false)
    var ngErr by mutableStateOf<String?>(null)
    var ngSel by mutableStateOf(NgSel40())
    var ngPick by mutableStateOf(false)
    internal var ngKey: String? = null

    /* Julemodus (lokalt speil av /api/glimt/settings) */
    internal var julLoadedFor: String? = null

    /* Hjemlys */
    var hl by mutableStateOf<Hjemlys40?>(null)
    var hlMissing by mutableStateOf(false)
    var hlSheet by mutableStateOf(false)
    var hlBusy by mutableStateOf(false)
    var hlSuggest by mutableStateOf<HlSuggest40?>(null)
    /** 1a: ruten og valgt reisemåte; 1b: loggen; mottakers visning når noen er sen (userId). */
    var hlRoute by mutableStateOf<HlRoute40?>(null)
    var hlMode by mutableStateOf<String?>(null)
    var hlLog by mutableStateOf<List<HlLog40>>(emptyList())
    var hlLateFor by mutableStateOf<String?>(null)
    internal var hlAt = 0L
}

/* ======================= Fanelinja og Gjøremål ======================= */

/** Prompt 40: fanene for sidene fra Mer (samme nøkler som HNAV_ALL i fasiten). */
fun AppViewModel.mainTab40(id: String) {
    when (id) {
        "huske" -> openTasks()
        "kalender" -> openKal26()
        "bursdag" -> openBirthdays24()
        "brief" -> openBrief34()
        "rss" -> openNews()
        "bibel" -> if (bibleAllowed37()) { loadBible37(); p37.biblePage = true }
        "nordlys" -> p31.nordOpen = true
        "innst" -> openPaperPage("set")
    }
}

/** Gjøremål → «‹ Hjem»: lukker Gjøremål og går til Hjem uansett hvor siden ble åpnet fra (historikken nullstilles). */
fun AppViewModel.closeTasksHome40() {
    closeTasks()
    p37.detail = null; p37.listSheet = null; p37.glimtOpen = false
    if (screen != Screen.Homelab || paperPage != null) go(Screen.Homelab)
}

/* ======================= Gjøremål-Glimt: flere punkter ======================= */

/** Punktene fra POST /api/tasks/glimt: rekkefølge (after = id/indeks/tittel), sted, @person og tagger. */
internal fun glimtItems40(objs: List<JSONObject>): List<GItem37> {
    val titles = objs.map { x -> x.s37("title") ?: x.s37("n") ?: "" }
    val ids = objs.map { it.s37("id") }
    return objs.mapIndexed { i, x ->
        val afterRaw = x.opt("after").takeIf { it != null && it != JSONObject.NULL }
        val after = when (afterRaw) {
            is Number -> titles.getOrNull(afterRaw.toInt())?.takeIf { afterRaw.toInt() != i }
            is String -> ids.indexOf(afterRaw).takeIf { it >= 0 }?.let { titles[it] } ?: afterRaw.toIntOrNull()?.let { titles.getOrNull(it) } ?: afterRaw.takeIf { it.isNotBlank() }
            is JSONObject -> afterRaw.s37("title") ?: afterRaw.s37("n")
            else -> null
        }
        val place = x.optJSONObject("place")?.s37("name") ?: x.s37("placeName") ?: x.s37("place")?.takeIf { it !in setOf("store", "home", "cabin", "work") }
        val who = x.optJSONObject("who")?.let { it.s37("name") ?: it.s37("username") } ?: x.s37("whoName")
        val tags = x.optJSONArray("tags")?.let { a -> (0 until a.length()).mapNotNull { a.optString(it).takeIf { s -> s.isNotBlank() }?.removePrefix("#") } } ?: emptyList()
        GItem37(ids[i], titles[i], x.s37("list") ?: x.s37("l"), x.s37("due"), x.s37("time"), x.s37("note") ?: x.s37("text"),
            step = x.optInt("step", if (objs.size > 1) i + 1 else 0), after = after, place = place, who = who, tags = tags)
    }
}

/** Metalinja i lista: «etter «Lever pakken»» til det forrige punktet er huket av. */
fun afterLabel40(vm: AppViewModel, t: TaskItem): String? {
    if (t.done) return null
    val a = t.after ?: return null
    val prev = vm.tasks?.items?.firstOrNull { it.id == a } ?: return null
    return if (prev.done) null else "etter «${prev.title}»"
}

private val BEFORE40 = Regex("(?i)[,.;]?\\s*\\b(men aller først|men først|aller først|før det|først)\\b\\s*")
private val AFTER40 = Regex("(?i)[,.;]?\\s*\\b(deretter|etterpå|etter det|og så|til slutt)\\b\\s*")
private val MUST40 = Regex("(?i)\\b(må|skal)\\b")
private val WD40 = setOf("mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag")
private val IMP40 = mapOf(
    "levere" to "Lever", "hente" to "Hent", "ringe" to "Ring", "kjøpe" to "Kjøp", "sende" to "Send", "bestille" to "Bestill", "kjøre" to "Kjør",
    "betale" to "Betal", "vaske" to "Vask", "rydde" to "Rydd", "lage" to "Lag", "pakke" to "Pakk", "skrive" to "Skriv", "svare" to "Svar",
    "huske" to "Husk", "booke" to "Book", "sjekke" to "Sjekk", "fikse" to "Fiks", "bytte" to "Bytt", "gi" to "Gi", "ta" to "Ta", "handle" to "Handle",
    "møte" to "Møt", "spørre" to "Spør", "legge" to "Legg", "flytte" to "Flytt", "låne" to "Lån", "selge" to "Selg", "kaste" to "Kast",
)
private val FIX40 = mapOf("møbeler" to "møbler")

/** «Jeg må huske å levere pakken» → «Lever pakken» (fjerner «jeg må (huske å)», «husk å», «påminn meg om å», «må jeg» …). */
internal fun imperative40(s0: String): String {
    var s = s0.trim().trim(',', '.', ';')
    s = s.replace(Regex("(?i)^(og|men|så)\\s+"), "")
    s = s.replace(Regex("(?i)^(jeg\\s+)?(må|skal)\\s+(jeg\\s+)?(huske\\s+å\\s+|huske\\s+)?"), "")
    s = s.replace(Regex("(?i)^(husk|påminn meg om|minn meg på)\\s+(å\\s+)?"), "")
    s = s.replace(Regex("(?i)^å\\s+"), "")
    val words = s.split(Regex("\\s+")).filter { it.isNotEmpty() }.map { w -> FIX40[w.lowercase()] ?: w }.toMutableList()
    if (words.isEmpty()) return s0.trim()
    val first = words[0].lowercase()
    words[0] = IMP40[first] ?: if (first.length > 5 && first.endsWith("ere")) first.dropLast(1).replaceFirstChar { it.uppercase() } else words[0].replaceFirstChar { it.uppercase() }
    return words.joinToString(" ")
}

/** Sted: «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager eller personer). */
internal fun place40(s: String, members: List<TaskMember>): String? {
    val names = members.map { firstName37(it.name).lowercase() }.toSet()
    return Regex("\\b(?:til|i|på|hos|ved|fra)\\s+([A-ZÆØÅ][\\wæøåÆØÅ-]{1,})").findAll(s).map { it.groupValues[1] }
        .firstOrNull { w -> w.lowercase() !in WD40 && w.lowercase() !in names }
}

/** Er dette flere handlinger i én tekst (signalord for rekkefølge eller flere setninger med «må/skal»)? */
internal fun isMulti40(q: String): Boolean {
    if (BEFORE40.containsMatchIn(q) && Regex("(?i)\\b(men|først)\\b").containsMatchIn(q) && q.split(Regex("\\s+")).size >= 5) return true
    if (AFTER40.containsMatchIn(q)) return true
    val sent = q.split(Regex("(?<=[.!?])\\s+")).filter { it.isNotBlank() }
    return sent.size >= 2 && sent.count { MUST40.containsMatchIn(it) } >= 2
}

/** Del i deler i riktig rekkefølge: (tekst, før-flagg). «A men først B» → B, A. «A. Deretter B» → A, B. */
internal fun splitMulti40(q: String): List<String> {
    val parts = ArrayList<Pair<String, Boolean>>() // tekst, skal før forrige
    val sentences = q.split(Regex("(?<=[.!?])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
    for (sen in sentences) {
        var rest = sen
        var before = false
        // Signalord i starten av setningen gjelder hele setningen.
        Regex("(?i)^(men\\s+)?(aller\\s+)?(først|før det)\\b\\s*").find(rest)?.let { rest = rest.substring(it.range.last + 1); before = true }
        Regex("(?i)^(deretter|etterpå|etter det|og så|til slutt)\\b\\s*").find(rest)?.let { rest = rest.substring(it.range.last + 1) }
        // Inni setningen.
        val tokens = Regex("(?i)\\s*[,;]?\\s*\\b(men aller først|men først|aller først|før det|deretter|etterpå|etter det|og så|til slutt)\\b\\s*").split(rest)
        val seps = Regex("(?i)\\b(men aller først|men først|aller først|før det|deretter|etterpå|etter det|og så|til slutt)\\b").findAll(rest).map { it.value.lowercase() }.toList()
        tokens.forEachIndexed { i, tk ->
            val t = tk.trim().trim(',', '.', ';', '!', '?')
            if (t.isEmpty()) return@forEachIndexed
            val b = if (i == 0) before else seps.getOrNull(i - 1)?.let { it.contains("først") || it == "før det" } ?: false
            parts += t to b
        }
    }
    // Bygg rekkefølgen: et «før»-ledd settes foran leddet det står etter.
    val out = ArrayList<String>()
    for ((t, b) in parts) { if (b && out.isNotEmpty()) out.add(out.size - 1, t) else out += t }
    return out
}

/**
 * Lokal tolker (når serveren ikke har /api/tasks/glimt med flere punkter): «Jeg må huske å ta med noen pakker og møbeler til
 * Strømstad men først må jeg levere pakken» → 1 «Lever pakken» (#pakke #strømstad, først), 2 «Ta med noen pakker og møbler til
 * Strømstad» (Strømstad, #strømstad, etter «Lever pakken»). null = ikke flere handlinger (vanlig tolkning).
 */
internal suspend fun AppViewModel.localMulti40(q: String, list: String?, lists: List<TaskList>, members: List<TaskMember>): TaskGlimt37? {
    if (!isMulti40(q)) return null
    val parts = splitMulti40(q).takeIf { it.size >= 2 } ?: return null
    val place = place40(q, members)
    val trip = place?.lowercase()
    val parsed = parts.map { part -> parseGlimt37(imperative40(part), lists, members).first() }
    // Dato og tid fra samme forespørsel gjelder alle punktene.
    val due = parsed.firstNotNullOfOrNull { it.s37("due") }
    val time = parsed.firstNotNullOfOrNull { it.s37("time") }
    val priv = lists.firstOrNull { it.priv == true }?.id ?: lists.first().id
    val ids = ArrayList<String>()
    val out = ArrayList<GItem37>()
    var prevId: String? = null
    var prevTitle: String? = null
    parsed.forEachIndexed { i, o ->
        val title = imperative40(o.s37("title") ?: parts[i])
        val myPlace = place?.takeIf { parts[i].contains(it) }
        val tags = LinkedHashSet<String>()
        o.optJSONArray("tags")?.let { a -> for (k in 0 until a.length()) tags += a.optString(k) }
        if (Regex("(?i)\\bpakken?\\b").containsMatchIn(parts[i])) tags += "pakke"
        trip?.let { tags += it }
        val who = o.s37("who")?.let { id -> members.firstOrNull { it.id == id } }
        // Nevnt person: i en liste dere begge er med i (Hjem) hvis den valgte ikke er delt.
        val l = o.s37("list") ?: list?.takeIf { who == null || lists.firstOrNull { x -> x.id == it }?.priv != true }
            ?: (if (who != null) lists.firstOrNull { it.name.equals("Hjem", true) }?.id else null) ?: list ?: priv
        val extra = JSONObject(o.toString()).apply {
            remove("title"); remove("list")
            put("tags", JSONArray(tags.toList()))
            if (!has("due") && due != null) put("due", due)
            if (!has("time") && time != null) put("time", time)
            prevId?.let { put("after", it) }
            myPlace?.let { put("placeName", it) }
        }
        val id = runCatching { createTask37(title, l, extra) }.getOrElse {
            // Eldre server som ikke godtar de nye feltene: prøv uten (rekkefølgen står da i notatet).
            val e2 = JSONObject(extra.toString()).apply { remove("after"); remove("placeName"); prevTitle?.let { pt -> put("notes", "Etter «$pt»") } }
            runCatching { createTask37(title, l, e2) }.getOrNull()
        }
        id?.let { ids += it }
        out += GItem37(id, title, l, extra.s37("due"), extra.s37("time"), null, step = i + 1, after = prevTitle, place = myPlace,
            who = who?.let { firstName37(it.name) }, tags = tags.toList())
        prevId = id; prevTitle = title
    }
    val txt = "Lagde ${out.size} punkter" + (place?.let { " for $it" } ?: "") + ", i riktig rekkefølge."
    return TaskGlimt37("add", txt, out, null, local = true, localIds = ids)
}

/* ======================= 2FA i appen ======================= */

data class Tf40(val enabled: Boolean, val method: String?, val backupLeft: Int?, val enabledAt: String?)
data class TfSetup40(val secret: String, val otpauth: String, val qrPng: String?, val issuer: String, val account: String)

/** Hemmeligheten i grupper på 4 («JBSW Y3DP …»). */
fun tfGroups40(secret: String): String = secret.replace(" ", "").chunked(4).joinToString(" ")

fun AppViewModel.loadTf40() {
    launch40 {
        val raw = try { api40 { hlGet("/auth/2fa/status", timeout = 8_000) } } catch (e: ApiException) { null } catch (e: Exception) { null }
        p40.tf = raw?.let { r -> runCatching { JSONObject(r) }.getOrNull()?.let { o ->
            Tf40(o.optBoolean("enabled", me?.totp == true), o.s37("method") ?: "totp", if (o.has("backupLeft")) o.optInt("backupLeft") else null, o.s37("enabledAt"))
        } } ?: Tf40(me?.totp == true, if (me?.totp == true) "totp" else null, null, null)
    }
}

fun AppViewModel.openTf40() {
    val s = p40
    s.tfOpen = true; s.tfErr = null; s.tfCodes = emptyList(); s.tfNeedPw = false
    s.tfManage = null
    s.tfStep = if (s.tf?.enabled == true || me?.totp == true) 10 else 0
    loadTf40()
}

/** Steg 2: POST /api/auth/2fa/setup (krever kanskje passord / fersk økt) → hemmelighet, otpauth-URI og QR. */
fun AppViewModel.setupTf40(password: String? = null) {
    val s = p40
    if (s.tfBusy) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val body = JSONObject().apply { password?.takeIf { it.isNotBlank() }?.let { put("password", it) } }
            val o = JSONObject(api40 { hlPost("/auth/2fa/setup", body) })
            val secret = o.s37("secret") ?: throw IllegalStateException("Serveren sendte ingen nøkkel")
            val acct = o.s37("account") ?: account?.username ?: "bruker"
            val issuer = o.s37("issuer") ?: "Nordlys OS"
            val uri = o.s37("otpauth") ?: o.s37("otpauth_uri") ?: o.s37("uri")
                ?: "otpauth://totp/${java.net.URLEncoder.encode("$issuer:$acct", "UTF-8").replace("+", "%20")}?secret=$secret&issuer=${java.net.URLEncoder.encode(issuer, "UTF-8").replace("+", "%20")}&digits=6&period=30"
            s.tfSetup = TfSetup40(secret, uri, o.s37("qrPng")?.takeIf { it.startsWith("data:image") }, issuer, acct)
            s.tfNeedPw = false
            s.tfStep = 1
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            when {
                e.status == 404 -> s.tfErr = "Serveren støtter ikke oppsett fra appen ennå. Oppdater Homelab."
                e.status == 401 || e.status == 403 || (e.message ?: "").contains("passord", true) -> { s.tfNeedPw = true; s.tfErr = if (password != null) "Feil passord. Prøv igjen." else null }
                else -> s.tfErr = e.message
            }
        } catch (e: Exception) { s.tfErr = e.message ?: "Fikk ikke kontakt med serveren" } finally { s.tfBusy = false }
    }
}

/** Steg 3: koden fra appen. Riktig kode slår på 2FA og gir reservekodene (steg 4). Serveren tillater ±1 tidsvindu. */
fun AppViewModel.enableTf40(code: String) {
    val s = p40
    val c = code.filter { it.isDigit() }
    if (c.length != 6 || s.tfBusy) { if (c.length != 6) s.tfErr = "Skriv de 6 sifrene fra autentiseringsappen."; return }
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val o = JSONObject(api40 { hlPost("/auth/2fa/enable", JSONObject().put("code", c)) })
            if (o.has("ok") && !o.optBoolean("ok")) { s.tfErr = "Koden stemmer ikke. Prøv den neste som vises."; Haptics.error(); return@launch40 }
            s.tfCodes = codes40(o.optJSONArray("backupCodes") ?: o.optJSONArray("codes"))
            s.tfStep = 3
            Haptics.success()
            reloadMe40()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.tfErr = if (e.status == 400 || e.status == 401 || e.status == 422) "Koden stemmer ikke. Prøv den neste som vises." else e.message
            Haptics.error()
        } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

private fun codes40(a: JSONArray?): List<String> = a?.let { (0 until it.length()).mapNotNull { i -> it.optString(i).takeIf { c -> c.isNotBlank() } } }?.map { c ->
    val x = c.replace("-", "").replace(" ", "")
    if (x.length == 8) x.substring(0, 4) + "-" + x.substring(4) else c
} ?: emptyList()

fun AppViewModel.regenTf40() {
    val s = p40
    if (s.tfBusy) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val o = JSONObject(api40 { hlPost("/auth/2fa/backup/regenerate") })
            s.tfCodes = codes40(o.optJSONArray("backupCodes") ?: o.optJSONArray("codes"))
            s.tfManage = "codes"
            loadTf40()
        } catch (e: CancellationException) { throw e } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

/** Slå av: krever passord (eller en kode). */
fun AppViewModel.disableTf40(secret: String) {
    val s = p40
    if (s.tfBusy || secret.isBlank()) return
    s.tfBusy = true; s.tfErr = null
    launch40 {
        try {
            val body = if (secret.filter { it.isDigit() }.length == 6 && secret.length <= 7) JSONObject().put("code", secret.filter { it.isDigit() }) else JSONObject().put("password", secret)
            api40 { hlPost("/auth/2fa/disable", body) }
            s.tfManage = null; s.tfStep = 0
            s.tf = Tf40(false, null, null, null)
            flash("Totrinnsbekreftelse er slått av")
            reloadMe40()
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.tfErr = if (e.status == 400 || e.status == 401 || e.status == 403) "Feil passord eller kode." else e.message
        } catch (e: Exception) { s.tfErr = e.message } finally { s.tfBusy = false }
    }
}

/* ======================= Finans: lagt til, les på nytt, rediger alt ======================= */

/** «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian» og «Sist endret … av Ingrid». */
data class Added40(val line: String, val edited: String?)

private val OSLO40: ZoneId = ZoneId.of("Europe/Oslo")

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
data class Reread40(val receiptId: String, val busy: Boolean, val changes: List<Change40>, val candidateId: String?, val text: String?, val sumOk: Boolean?, val error: String?)

private fun nok40(v: Double?): String = v?.let { String.format(java.util.Locale("nb", "NO"), "%,.2f", it).replace(',', ' ').replace('.', ',').replace(' ', ' ') + " kr" } ?: "–"

/**
 * «✦ La Glimt lese kvitteringen på nytt»: POST /finans/api/receipts/:id/reanalyze {engine, async:true, apply:false} → jobb →
 * {previous, result, candidateId}. Endringene vises som «gammelt → nytt»; ingenting lagres før «Bruk endringene».
 */
fun AppViewModel.reread40(txId: Int, receiptId: String, engine: String = "gemini") {
    val s = p40
    if (s.rr[txId]?.busy == true) return
    Haptics.tap()
    s.rr = s.rr + (txId to Reread40(receiptId, true, emptyList(), null, null, null, null))
    launch40 {
        fun fail(m: String) { s.rr = s.rr + (txId to Reread40(receiptId, false, emptyList(), null, null, null, m)) }
        try {
            val first = JSONObject(api40 { request("POST", "/receipts/$receiptId/reanalyze", JSONObject().put("engine", engine).put("async", true).put("apply", false), read = 120_000) })
            var res: JSONObject? = if (first.has("result") || first.has("candidateId")) first else null
            val job = first.s37("jobId")
            var n = 0
            while (res == null && job != null && n++ < 180) {
                delay(1000)
                val j = runCatching { JSONObject(api40 { get("/jobs/$job") }) }.getOrNull() ?: continue
                val st = j.s37("status") ?: "running"
                if (st == "done" || j.s37("step") == "done") res = j.optJSONObject("result") ?: JSONObject()
                else if (st == "error" || st == "cancelled" || j.s37("step") == "error") { fail(j.s37("error") ?: j.s37("msg") ?: "Glimt fikk ikke lest kvitteringen"); return@launch40 }
            }
            val r = res ?: run { fail("Glimt brukte for lang tid. Prøv igjen."); return@launch40 }
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
            fail(if (e.status == 404) "Serveren kan ikke lese kvitteringen på nytt ennå. Oppdater Homelab." else e.message ?: "Glimt fikk ikke lest kvitteringen")
        } catch (e: Exception) { fail(e.message ?: "Glimt fikk ikke lest kvitteringen") }
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
        ?: o.s37("open")?.let { (if (it.contains("sub")) "Åpne Subscription OS ›" else "Åpne ›") to it }
    return Ask40(q, text, o.s37("source"), kpis.take(3), items.sortedBy { it.next ?: "9999" }, act)
}

/** Lokalt svar for abonnementer (Subscription OS-dataene appen allerede har). */
private suspend fun AppViewModel.localAsk40(q: String): Ask40? {
    if (!isStdAsk40(q)) return null
    if (subsX == null) runCatching { loadSubs40() }
    val x = subsX ?: return null
    val act = x.items.filter { it.active }
    if (act.isEmpty()) return Ask40(q, "Du har ingen aktive abonnementer.", "Subscription OS", emptyList(), emptyList(), "Åpne Subscription OS ›" to "subs")
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
    return Ask40(q, text, "Subscription OS", kpis, items, "Åpne Subscription OS ›" to "subs")
}

internal val MON40 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/* ======================= Nyheter: Glimt-siden ======================= */

data class NgSel40(val sources: Set<String> = emptySet(), val topics: Set<String> = emptySet(), val period: String = "dag", val length: String = "kort")
data class NgRef40(val n: Int, val title: String, val source: String, val url: String?, val image: String?, val time: String?)
data class NgSec40(val h: String, val text: List<Pair<String, List<Int>>>, val image: String?, val imageRef: Int?)
data class NewsGl40(val title: String, val lead: String, val sections: List<NgSec40>, val refs: List<NgRef40>, val updatedAt: String?, val local: Boolean, val count: Int)

val NG_TOPICS40 = listOf("norge" to "Norge", "verden" to "Verden", "okonomi" to "Økonomi", "sport" to "Sport", "teknologi" to "Teknologi", "kultur" to "Kultur")

private fun ngPrefKey40(vm: AppViewModel) = "news_glimt40_" + (vm.account?.id ?: "")

fun AppViewModel.loadNgSel40() {
    val raw = prefs.str(ngPrefKey40(this), "").takeIf { it.isNotBlank() } ?: return
    runCatching {
        val o = JSONObject(raw)
        fun set(k: String) = o.optJSONArray(k)?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
        p40.ngSel = NgSel40(set("sources"), set("topics"), o.optString("period", "dag"), o.optString("length", "kort"))
    }
}

fun AppViewModel.setNgSel40(sel: NgSel40) {
    p40.ngSel = sel
    prefs.set(ngPrefKey40(this), JSONObject().put("sources", JSONArray(sel.sources.toList())).put("topics", JSONArray(sel.topics.toList()))
        .put("period", sel.period).put("length", sel.length).toString())
}

/** Sakene som passer valgene (lokalt, for «Lag sammendrag (N saker)» og reserven). */
fun AppViewModel.ngItems40(sel: NgSel40 = p40.ngSel): List<NewsItem> {
    val all = news?.items ?: emptyList()
    val since = when (sel.period) { "uke" -> 7L * 24; "24t" -> 24L; else -> 18L }
    val now = System.currentTimeMillis()
    return all.filter { x ->
        (sel.sources.isEmpty() || x.feedId in sel.sources || x.feed in sel.sources) &&
            (sel.topics.isEmpty() || (x.category ?: "norge") in sel.topics) &&
            (x.published?.let { p -> runCatching { java.time.Instant.parse(p).toEpochMilli() }.getOrNull() }?.let { now - it < since * 3_600_000L } ?: true)
    }.take(30)
}

fun AppViewModel.openNewsGlimt40() {
    loadNgSel40()
    if (news == null) openNews() else newsOpen = true
    p40.newsGl = true
    runNewsGlimt40()
}

fun AppViewModel.runNewsGlimt40(force: Boolean = false) {
    val s = p40
    val sel = s.ngSel
    val key = "$sel"
    if (!force && s.ngKey == key && s.ng != null) return
    s.ngKey = key; s.ngBusy = true; s.ngErr = null
    launch40 {
        try {
            if (news == null) runCatching { loadNews40() }
            val body = JSONObject().put("length", if (sel.length == "lang") "lang" else "kort").put("period", sel.period)
            if (sel.sources.isNotEmpty()) body.put("sources", JSONArray(sel.sources.toList()))
            if (sel.topics.isNotEmpty()) body.put("topics", JSONArray(sel.topics.toList()))
            val o = try { JSONObject(api40 { request("POST", "/news/glimt", body, prefix = Api.HOMELAB, read = 90_000) }) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }
            s.ng = o?.let { parseNg40(it) } ?: localNg40(sel)
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.ng = localNg40(sel)
            if (s.ng == null) s.ngErr = e.message ?: "Glimt fikk ikke laget sammendraget"
        } finally { s.ngBusy = false }
    }
}

private fun parseNg40(o: JSONObject): NewsGl40? {
    val refs = ArrayList<NgRef40>()
    o.optJSONArray("refs")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { r ->
        refs += NgRef40(r.optInt("n", i + 1), r.optString("title"), r.optString("source"), r.s37("url"), r.s37("image"), r.s37("time"))
    } }
    val imgs = HashMap<Int, String>()
    o.optJSONArray("images")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { im -> im.s37("url")?.let { u -> imgs[im.optInt("ref", -1)] = u } } }
    val secs = ArrayList<NgSec40>()
    (o.optJSONArray("sections") ?: o.optJSONArray("seksjoner"))?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { sx ->
        val parts = ArrayList<Pair<String, List<Int>>>()
        val av = sx.optJSONArray("avsnitt")
        if (av != null) for (k in 0 until av.length()) av.optJSONObject(k)?.let { p -> parts += clean40(p.optString("tekst")) to ints40(p.optJSONArray("ref")) }
        else parts += clean40(sx.optString("text")) to ints40(sx.optJSONArray("refs"))
        val refN = parts.flatMap { it.second }.firstOrNull { imgs.containsKey(it) } ?: sx.optInt("bilde", -1).takeIf { it > 0 }
        val img = refN?.let { imgs[it] ?: refs.firstOrNull { r -> r.n == it }?.image }
        // Referanser som ikke peker på en sak fjernes.
        val valid = refs.map { it.n }.toSet()
        secs += NgSec40(sx.s37("h") ?: sx.s37("tittel") ?: "", parts.map { (t, r) -> t to r.filter { it in valid } }, img, refN)
    } }
    val lead = clean40(o.s37("lead") ?: o.s37("ingress") ?: "")
    if (secs.isEmpty() && lead.isBlank()) return null
    return NewsGl40(o.s37("title") ?: "Dette skjer i dag", lead, secs, refs, o.s37("updatedAt"), false, refs.size)
}

private fun ints40(a: JSONArray?): List<Int> = a?.let { (0 until it.length()).map { i -> it.optInt(i, -1) }.filter { n -> n > 0 } } ?: emptyList()

/** Reserve: titlene gruppert per tema, med referanser og bilder fra sakene. */
private fun AppViewModel.localNg40(sel: NgSel40): NewsGl40? {
    val items = ngItems40(sel)
    if (items.isEmpty()) return null
    val refs = items.mapIndexed { i, x -> NgRef40(i + 1, x.title, x.feed, x.url, x.image, x.published?.let { p -> runCatching { java.time.Instant.parse(p).atZone(OSLO40).let { "%02d:%02d".format(it.hour, it.minute) } }.getOrNull() }) }
    val long = sel.length == "lang"
    val secs = NG_TOPICS40.mapNotNull { (k, name) ->
        val idx = items.indices.filter { (items[it].category ?: "norge") == k }.take(if (long) 5 else 3)
        if (idx.isEmpty()) null else NgSec40(name, idx.map { i ->
            val x = items[i]
            "${x.feed} melder: ${x.title}." + (x.excerpt?.takeIf { long && it.isNotBlank() }?.let { " " + it.take(220) } ?: "") to listOf(i + 1)
        }, idx.firstNotNullOfOrNull { items[it].image }, idx.firstOrNull { items[it].image != null }?.plus(1))
    }
    val title = when (sel.period) { "uke" -> "Uka i nyheter"; "24t" -> "Siste døgn"; else -> "Dette skjer i dag" }
    return NewsGl40(title, "${items.size} saker fra ${items.map { it.feed }.distinct().take(4).joinToString(", ")}. Glimt har samlet titlene per tema.", secs, refs, null, true, items.size)
}

/* ======================= Julemodus ======================= */

/**
 * Julemodus (claude-code-glimt-jul.md): Auto (1. des–13. jan, Europe/Oslo) / Av / På med fase. Lagres lokalt (også for widgets i
 * samme prosess) og synkes til /api/glimt/settings {jul, julPhase, snow, julSound}. Figurbiblioteket leser [phase] selv.
 */
object Jul40 {
    var mode by mutableStateOf("auto")
    var manual by mutableStateOf("advent")
    var snow by mutableStateOf(true)
    var sound by mutableStateOf("av")
    /** Øker ved hver endring (Flow-erstatning: skjermene som leser den tegnes på nytt). */
    var tick by mutableIntStateOf(0)
    private var loaded = false

    val PHASES = listOf("advent" to "Advent", "jul" to "Jul", "nyttar" to "Nyttår", "vinter" to "Vinter")

    fun autoPhase(d: LocalDate = ZonedDateTime.now(ZoneId.of("Europe/Oslo")).toLocalDate()): String? = when {
        d.monthValue == 12 && d.dayOfMonth <= 23 -> "advent"
        d.monthValue == 12 && d.dayOfMonth <= 30 -> "jul"
        d.monthValue == 12 -> "nyttar"
        d.monthValue == 1 && d.dayOfMonth == 1 -> "nyttar"
        d.monthValue == 1 && d.dayOfMonth <= 13 -> "vinter"
        else -> null
    }

    /** Fasen som gjelder nå, eller null (av). */
    val phase: String? get() = when (mode) { "av" -> null; "pa" -> manual; else -> autoPhase() }

    fun ensure(ctx: Context) {
        if (loaded) return
        loaded = true
        val sp = ctx.applicationContext.getSharedPreferences("jul40", Context.MODE_PRIVATE)
        mode = sp.getString("glimt_jul", "auto") ?: "auto"
        manual = sp.getString("glimt_jul_p", "advent") ?: "advent"
        snow = sp.getBoolean("snow", true)
        sound = sp.getString("julSound", "av") ?: "av"
    }

    fun store(ctx: Context) {
        ctx.applicationContext.getSharedPreferences("jul40", Context.MODE_PRIVATE).edit()
            .putString("glimt_jul", mode).putString("glimt_jul_p", manual).putBoolean("snow", snow).putString("julSound", sound).apply()
        tick++
    }

    fun statusText(): String {
        val ph = phase
        val name = PHASES.firstOrNull { it.first == ph }?.second
        return when (mode) {
            "av" -> "Av hele året"
            "pa" -> "På · ${name ?: "Advent"}"
            else -> if (ph != null) "På nå · slås av 13. januar" else "Slås på 1. desember"
        }
    }
}

fun AppViewModel.loadJul40() {
    Jul40.ensure(appCtx40)
    val acct = account?.id
    if (p40.julLoadedFor == acct) return
    p40.julLoadedFor = acct
    launch40 {
        val raw = runCatching { api40 { hlGet("/glimt/settings", timeout = 8_000) } }.getOrNull() ?: return@launch40
        runCatching { applyJul40(JSONObject(raw)) }
    }
}

/** Fra serveren (GET-svaret eller sanntid «glimt:settings»). */
fun AppViewModel.applyJul40(o: JSONObject) {
    val s = o.optJSONObject("settings") ?: o
    var ch = false
    s.s37("jul")?.takeIf { it in setOf("auto", "av", "pa") }?.let { if (it != Jul40.mode) { Jul40.mode = it; ch = true } }
    s.s37("julPhase")?.takeIf { k -> Jul40.PHASES.any { it.first == k } }?.let { if (it != Jul40.manual) { Jul40.manual = it; ch = true } }
    if (s.has("snow")) s.optBoolean("snow").let { if (it != Jul40.snow) { Jul40.snow = it; ch = true } }
    s.s37("julSound")?.let { if (it != Jul40.sound) { Jul40.sound = it; ch = true } }
    if (ch) { Jul40.store(appCtx40); redrawWidgets40() }
}

fun AppViewModel.setJul40(mode: String? = null, phase: String? = null, snow: Boolean? = null, sound: String? = null) {
    Jul40.ensure(appCtx40)
    mode?.let { Jul40.mode = it }
    phase?.let { Jul40.manual = it }
    snow?.let { Jul40.snow = it }
    sound?.let { Jul40.sound = it }
    Jul40.store(appCtx40)
    Haptics.select()
    redrawWidgets40()
    val patch = JSONObject().put("jul", Jul40.mode).put("julPhase", if (Jul40.mode == "pa") Jul40.manual else JSONObject.NULL).put("snow", Jul40.snow).put("julSound", Jul40.sound)
    launch40 { runCatching { api40 { hlPut("/glimt/settings", patch) } } }
}

/** Widgets på hjemskjermen tegnes på nytt (figuren med eller uten lue). */
fun AppViewModel.redrawWidgets40() {
    val app = appCtx40
    launch40 { runCatching { no.kristo.finanshub.widget.WidgetSync.redraw(app) } }
}
