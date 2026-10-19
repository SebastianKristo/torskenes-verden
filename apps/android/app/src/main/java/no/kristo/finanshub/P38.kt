package no.kristo.finanshub

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 38 (ANDROID38), filer med «38» (P38.kt, ui/Ui38.kt):
 *  - Logg inn på ny enhet (QR, claude-code-qr-innlogging.md): koden kommer inn som deep link (homelab://login?c=<sid>.<nonce> eller
 *    https://<vert>/l/<sid>.<nonce>, f.eks. fra systemkameraet) eller limes inn. POST /api/auth/qr/scan {code} → enhet, konto og matchkode.
 *    Godkjenning krever fingeravtrykk/ansikt (BiometricPrompt, PIN/mønster som reserve) og sendes som POST /api/auth/qr/approve
 *    {sid, approve, biometric:true}. Koden inneholder aldri en token; 2FA fullføres på den nye enheten. Ingen ny avhengighet (ingen kamera-
 *    bibliotek): skanning skjer med systemkameraet, som åpner lenken.
 *  - Konto → ØKT: Lås skjermen, Logg ut (bekreftelse) og Logg ut av alle enheter (POST /api/auth/logout-all {password} → {ok, count},
 *    antall fra GET /api/me/sessions). «Logg ut» er fjernet nederst i Innstillinger.
 *  - Hjem: Glimt-boblen lukkes med ✕, sveip opp (> 40 dp) eller trykk utenfor (fanges, så kortet under ikke åpnes).
 *  - Now Brief: tittel og Ferdig på én linje (uten 🔇/⚙), nye kort Pakker, Familie, Skole og jobb, Bursdager (+ gave → POST /api/brief/gift)
 *    og Nordlys i natt. Rekkefølge/av-på fra GET /api/glimt/settings → cards. Glimt i prestedrakt ved bibelverset.
 *  - Domener (mobil): +-knappen er Glimt (oppsummering, GET /api/domains/:d/summary), og domenene hentes i bakgrunnen ved oppstart
 *    og når appen kommer fram (maks hvert 5. min), så siden er klar når den åpnes.
 *  - AI-kontroll: Mac mini-kortet (GET /api/ai/status → server.hw), PASSER/TRANGT/FOR STOR, anbefalinger, og «Hvilken modell gjør hva i
 *    Finans» (GET /api/ai/routing?scope=finans, 4 rader, tom tilstand). Tilbake fra Subscription OS åpnet fra Mer går til Mer.
 *  - «Starter opp»: åpnes ikke igjen rett etter «Klar» (ingen flimring), og toner ut.
 *  Alle nye endepunkter tåler 404 (eldre server).
 */

/* ======================= Modeller ======================= */

data class QrAsk38(val sid: String, val device: String, val place: String, val account: String, val match: String)
data class QrResult38(val title: String, val text: String, val ok: Boolean)

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

data class DomSum38(val domain: String, val head: String, val pts: List<Pair<String, Long?>>, val meta: String?)

data class Hw38(
    val model: String, val chip: String?, val memGb: Double?, val gpuBudgetGb: Double?, val gpuUsedGb: Double?,
    val diskName: String?, val diskTotalGb: Double?, val diskFreeGb: Double?, val external: Boolean, val mounted: Boolean?,
    val diskUsedGb: Double? = null, val label: String? = null, val warnings: List<String> = emptyList(),
)
data class AiRec38(val key: String, val text: String, val env: String?)
data class FinOpt38(val id: String, val label: String, val local: Boolean)
data class FinRt38(val key: String, val name: String, val sub: String, val model: String, val fallback: String, val options: List<FinOpt38>, val warning: String?)

/** Standardene (claude-code-ai-kontroll-modellvalg-fiks.md) når serveren ikke har scope=finans. */
val FIN_RT38 = listOf(
    FinRt38("rc", "Kvitteringer (bilde)", "Leser butikk, beløp og varelinjer", "qwen2.5vl:7b", "gemini-2.5-flash", emptyList(), null),
    FinRt38("kat", "Kategorisering", "Foreslår kategori for transaksjoner", "llama3.2:3b", "llama-3.3-70b-versatile", emptyList(), null),
    FinRt38("fsok", "Finans · spør", "«Har jeg et musikkabonnement?»", "gemma4:latest", "gemini-2.5-flash", emptyList(), null),
    FinRt38("bar", "Strekkoder og pakkelapper", "Bildefelt fra kamera", "roboflow/kvittering/1", "qwen2.5vl:7b", emptyList(), null),
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

/* ======================= QR-innlogging ======================= */

private val QR_CODE38 = Regex("^[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}$")

/** «homelab://login?c=a.b», «https://vert/l/a.b», «…?c=a.b» eller bare «a.b» → «a.b». */
fun qrCodeOf38(raw: String): String? {
    val t = raw.trim()
    if (t.isEmpty()) return null
    if (QR_CODE38.matches(t)) return t
    val u = runCatching { Uri.parse(t) }.getOrNull() ?: return null
    runCatching { u.getQueryParameter("c") }.getOrNull()?.trim()?.takeIf { QR_CODE38.matches(it) }?.let { return it }
    val segs = u.pathSegments ?: emptyList()
    val i = segs.indexOf("l")
    if (i >= 0 && i + 1 < segs.size && QR_CODE38.matches(segs[i + 1])) return segs[i + 1]
    return null
}

/** Deep link fra systemkameraet eller en annen app. true = håndtert her. */
fun AppViewModel.qrLink38(uri: Uri): Boolean {
    val isLogin = (uri.scheme == "homelab" && uri.host == "login") || (uri.scheme == "https" && uri.pathSegments?.firstOrNull() == "l") ||
        (uri.scheme == "finanshub" && uri.host == "login")
    if (!isLogin) return false
    val code = qrCodeOf38(uri.toString())
    if (code == null) { message = "Ugyldig innloggingskode"; return true }
    if (!loggedIn) { p38.qrPending = code; message = "Logg inn på mobilen først, så godkjenner du den nye enheten"; return true }
    scanQr38(code)
    return true
}

fun AppViewModel.openQr38() {
    Haptics.tap()
    val s = p38
    s.qrOpen = true
    s.qrErr = null
    s.qrResult = null
    s.qrCode = ""
}

private fun qrError38(e: Exception): String = when {
    e is ApiException && (e.status == 404 || e.status == 405) -> "Serveren har ikke QR-innlogging ennå. Oppdater Homelab-serveren."
    e is ApiException && (e.status == 410 || e.status == 409) -> "Koden er utløpt eller brukt. Vis en ny kode på den nye enheten."
    e is ApiException && e.status == 429 -> "For mange forsøk. Vent litt og prøv igjen."
    e is ApiException && (e.status == 401 || e.status == 403) -> "Mobilen må være logget inn for å godkjenne."
    e is ApiException && e.status == 400 -> e.message?.takeIf { it.isNotBlank() } ?: "Ugyldig kode"
    else -> e.message ?: "Fikk ikke kontakt med serveren"
}

/** Skannet/limt inn kode → enhetsinfo og matchkode (godkjenn-arket). */
fun AppViewModel.scanQr38(code: String) {
    val s = p38
    if (s.qrBusy) return
    s.qrBusy = true
    s.qrErr = null
    s.qrResult = null
    launch38 {
        try {
            val raw = api38 { hlPost("/auth/qr/scan", JSONObject().put("code", code)) }
            val o = JSONObject(raw)
            val d = o.optJSONObject("device")
            val dev = listOfNotNull(d?.s37("name"), listOfNotNull(d?.s37("os"), d?.s37("browser")).joinToString(" · ").takeIf { it.isNotBlank() })
                .distinct().joinToString(" · ").ifBlank { o.s37("device") ?: "Ny enhet" }
            val place = listOfNotNull(d?.s37("place"), d?.s37("ip")).joinToString(" · ").ifBlank { "Ukjent sted" }
            val acct = o.optJSONObject("account")?.let { it.s37("name") ?: it.s37("username") } ?: o.s37("account") ?: displayName
            val match = o.s37("match") ?: ""
            val sid = o.s37("sid") ?: code.substringBefore('.')
            s.qrAsk = QrAsk38(sid, dev, place, acct, match)
            s.qrOpen = false
            Haptics.select()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.qrErr = qrError38(e)
            s.qrOpen = true
            Haptics.error()
        } finally { s.qrBusy = false }
    }
}

/** Godkjenn (etter fingeravtrykk/ansikt) eller avvis. */
fun AppViewModel.answerQr38(approve: Boolean) {
    val s = p38
    val a = s.qrAsk ?: return
    if (s.qrBusy) return
    s.qrBusy = true
    launch38 {
        try {
            val body = JSONObject().put("sid", a.sid).put("approve", approve).put("biometric", approve)
            if (a.match.isNotBlank()) body.put("match", a.match)
            val raw = api38 { hlPost("/auth/qr/approve", body) }
            val o = runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject()
            s.qrAsk = null
            if (!approve) {
                s.qrResult = QrResult38("Avvist", "Innloggingen ble avvist. Den nye enheten får en ny kode.", false)
                Haptics.dismiss()
            } else {
                val two = o.b37("needs2fa") ?: (me?.totp == true)
                s.qrResult = if (two) QrResult38("Godkjent", "Skriv koden fra autentiseringsappen på den nye enheten for å fullføre.", true)
                else QrResult38("Logget inn", "${a.device} er logget inn som ${a.account} og lagt til under Pålitelige enheter.", true)
                Haptics.success()
            }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.qrAsk = null
            s.qrResult = QrResult38("Ikke godkjent", qrError38(e), false)
            Haptics.error()
        } finally { s.qrBusy = false }
    }
}

/** Etter innlogging: en kode fra en deep link som kom før, åpnes nå. */
fun AppViewModel.qrAfterLogin38() {
    val c = p38.qrPending ?: return
    p38.qrPending = null
    if (loggedIn) scanQr38(c)
}

/* ======================= Konto → ØKT ======================= */

fun AppViewModel.loadSessions38() = launch38 {
    p38.sessions = try {
        val o = JSONObject(api38 { hlGet("/me/sessions", timeout = 6_000) })
        n34(o, "count", "total") ?.toInt() ?: o.optJSONArray("sessions")?.length()
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}

fun AppViewModel.logoutAll38() {
    val s = p38
    if (s.allBusy) return
    if (s.allPw.isBlank()) { s.allErr = "Skriv inn passordet"; Haptics.error(); return }
    s.allBusy = true
    s.allErr = null
    launch38 {
        try {
            val o = runCatching { JSONObject(api38 { hlPost("/auth/logout-all", JSONObject().put("password", s.allPw)) }) }.getOrElse { e -> throw e }
            val n = n34(o, "count", "sessions")?.toInt()
            s.allOpen = false
            s.allPw = ""
            Haptics.success()
            message = if (n != null) "Logget ut av $n ${if (n == 1) "enhet" else "enheter"}" else "Logget ut av alle enheter"
            // Denne økten er også ugyldig nå.
            logout()
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.allErr = when {
                e is ApiException && (e.status == 404 || e.status == 405) -> "Serveren støtter ikke dette ennå. Oppdater Homelab-serveren."
                e is ApiException && (e.status == 401 || e.status == 403) -> "Feil passord"
                e is ApiException && e.status == 429 -> "For mange forsøk. Vent litt."
                else -> e.message ?: "Fikk ikke kontakt med serveren"
            }
            Haptics.error()
        } finally { s.allBusy = false }
    }
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

/* ======================= Domener ======================= */

/** Domenene og statistikken hentes i bakgrunnen (oppstart og forgrunn, maks hvert 5. min), så siden er klar når den åpnes. */
fun AppViewModel.prefetchDomains38(force: Boolean = false) {
    val s = p38
    val now = System.currentTimeMillis()
    if (!loggedIn || (!force && now - s.domPrefAt < 5 * 60_000L)) return
    s.domPrefAt = now
    launch38 {
        try { loadDomains38() } catch (e: CancellationException) { throw e } catch (_: Exception) {}
    }
}

/** Glimt-knappen på Domener: Oversikt, åpner oppsummeringen (lages hvis dagens mangler) og ruller til toppen. */
fun AppViewModel.domGlimt38() {
    Haptics.tap()
    if (domSection != "oversikt") domSection = "oversikt"
    domAll = false
    p38.domSumOpen = true
    b26.topSeq++
    loadDomSum38()
}

fun AppViewModel.loadDomSum38(fresh: Boolean = false) {
    val s = p38
    val d = domain ?: "*"
    if (!fresh && s.domSum?.domain == d) return
    if (s.domSumBusy) return
    s.domSumBusy = true
    launch38 {
        try {
            val path = "/domains/" + URLEncoder.encode(d, "UTF-8") + "/summary"
            val o = JSONObject(api38 { if (fresh) hlPost(path) else hlGet(path, timeout = 20_000) })
            val pts = objs34(o.optJSONArray("pts") ?: o.optJSONArray("points")).mapNotNull { p -> p.s37("t")?.let { it to hex37(p.s37("color")) } }
            s.domSum = DomSum38(d, o.s37("head") ?: "Ingen oppsummering ennå.", pts, o.s37("meta"))
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.domSum = DomSum38(d, if (e is ApiException && e.status == 404) "Serveren har ikke Glimt-oppsummering for domener ennå." else "Fikk ikke laget oppsummeringen nå.", emptyList(), null)
        } finally { s.domSumBusy = false }
    }
}

/* ======================= AI-kontroll ======================= */

/** Fra GET /api/ai/status (kalles fra loadAiStatus34): maskinen (server.hw) og anbefalingene. */
fun AppViewModel.parseAiHw38(o: JSONObject) {
    val srv = o.optJSONObject("server") ?: o
    val hw = srv.optJSONObject("hw") ?: o.optJSONObject("hw")
    p38.hw = hw?.let { h ->
        val d = h.optJSONObject("disk")
        val g = h.optJSONObject("gpu")
        Hw38(h.s37("model") ?: "AI-maskin", h.s37("chip"), h.d37("memGb"), h.d37("gpuBudgetGb") ?: g?.d37("budgetGb"),
            g?.d37("usedGb") ?: h.d37("gpuUsedGb") ?: srv.d37("vramUsedGb") ?: n34(srv.optJSONObject("vram"), "used", "usedGb"),
            d?.s37("name"), d?.d37("totalGb"), d?.d37("freeGb"), d?.b37("external") ?: false, d?.b37("mounted"),
            d?.d37("usedGb") ?: srv.d37("diskGb"), h.s37("label"), strs37(h.optJSONArray("warnings")))
    }
    val rec = o.optJSONArray("recommend") ?: srv.optJSONArray("recommend")
    p38.recommend = objs34(rec).mapNotNull { r -> r.s37("text")?.let { AiRec38(r.s37("key") ?: it, it, r.s37("env") ?: r.s37("cmd")) } }
}

/** PASSER ≤ ¾ av GPU-budsjettet (8 av 10,7 GB), TRANGT ≤ budsjettet − 0,2 (10,5), ellers FOR STOR. null = uten maskininfo. */
fun AppViewModel.fit38(gb: Double): String? {
    val b = p38.hw?.gpuBudgetGb ?: return null
    return when { gb <= b * .75 -> "PASSER"; gb <= b - .2 -> "TRANGT"; else -> "FOR STOR" }
}

fun AppViewModel.loadFinRouting38() = launch38 {
    p38.finRt = try {
        val o = JSONObject(api38 { hlGet("/ai/routing?scope=finans", timeout = 8_000) })
        p38.finEmpty = o.b37("empty") == true
        val rows = objs34(o.optJSONArray("rows") ?: o.optJSONArray("tasks") ?: o.optJSONArray("items")).ifEmpty {
            o.optJSONObject("tasks")?.let { t -> t.keys().asSequence().mapNotNull { k -> t.optJSONObject(k)?.put("key", k) }.toList() } ?: emptyList()
        }
        val list = rows.mapNotNull { r ->
            val k = r.s37("key") ?: r.s37("task") ?: r.s37("id") ?: return@mapNotNull null
            val def = FIN_RT38.firstOrNull { it.key == k }
            FinRt38(k, r.s37("name") ?: r.s37("label") ?: def?.name ?: k, r.s37("sub") ?: r.s37("desc") ?: def?.sub ?: "",
                r.s37("model") ?: def?.model ?: "", r.s37("fallback") ?: def?.fallback ?: "",
                objs34(r.optJSONArray("options")).mapNotNull { x -> x.s37("id")?.let { id -> FinOpt38(id, x.s37("label") ?: id, x.b37("local") ?: false) } },
                r.s37("warning"))
        }
        list.ifEmpty { null }
    } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
}

/** Valgene for en rad: serverens options, ellers installerte lokale + påslåtte sky-modeller. */
fun AppViewModel.finOptions38(r: FinRt38): List<FinOpt38> = r.options.ifEmpty {
    (p34.aiModels ?: emptyList()).map { FinOpt38(it.id, it.id, true) } + p34.aiCloud.filter { it.on }.map { FinOpt38(it.id, it.id, false) }
}

fun AppViewModel.setFinRoute38(key: String, model: String?, fallback: String?) {
    p38.finRt = (p38.finRt ?: FIN_RT38).map { if (it.key == key) it.copy(model = model ?: it.model, fallback = fallback ?: it.fallback, warning = null) else it }
    setRoute34(key, model, fallback)
}

/* ======================= Mer → Subscription OS ======================= */

/** Åpnet fra Mer (hovedmenyen): tilbake går til Mer, ikke til Finans → Mer. */
fun AppViewModel.openSubFromMer38() { openFromMer(Screen.Sub); paperFin = false }
