package no.kristo.kalender

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.kalender.widget.KalSync
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate

/*
 * Prompt 33 (KAL-ANDROID): tilstanden i Kalender-appen (fasit: Kalender App.dc.html → state, step(), applyLink(), glSend(), renderVals()).
 * Én skjerm: toppfelt, visning (År · Mnd · Uke · 3 d · Dag · Liste), Søk, hendelsesark, Ny hendelse-ark, sidemenyen Kalendere,
 * Glimt-feltet med forhåndsvisning og Glimt-panelet.
 */

/** Ny hendelse-arket. s/e i minutter. */
data class KNewForm(val t: String = "", val loc: String = "", val d: LocalDate, val s: Int, val e: Int, val all: Boolean = false, val cal: String = "p", val rem: Int?,
    /** Prompt 44: Rediger (id-en som endres), koordinater fra adresseforslaget og deltakere. */
    val editId: String? = null, val lat: Double? = null, val lon: Double? = null, val att: List<KAtt44> = emptyList())

class KToast(val t: String, val undo: (() -> Unit)?)

/** Én melding i Glimt-panelet. Assistent-svar: tenker-steg som hukes av, så teksten ord for ord, så kort, ledige tider og Angre. */
class KGMsg(val id: Long, val user: Boolean, val text: String) {
    var steps by mutableStateOf<List<String>>(emptyList())
    var step by mutableIntStateOf(0)
    var thinking by mutableStateOf(!user)
    var full by mutableStateOf("")
    var shown by mutableIntStateOf(0)
    var cards by mutableStateOf<List<KEv>>(emptyList())
    var slots by mutableStateOf<List<KSlot>>(emptyList())
    var undoId by mutableStateOf<String?>(null)
    var engine by mutableStateOf("lokal")
    /** Prompt 34: Glimt fikk ikke svar – svaret viser feilen med Prøv igjen og Åpne AI-kontroll. */
    var err by mutableStateOf(false)
    /** Prompt 70: kort C (card70) og spørsmål med knapper (ask) fra Glimt, ui/KalCal70Ui.kt. */
    var c70 by mutableStateOf<JSONObject?>(null)
    var ask70 by mutableStateOf<JSONObject?>(null)
    var q: String = ""
    val words: List<String> get() = full.split(' ').filter { it.isNotEmpty() }
    val done: Boolean get() = !thinking && shown >= words.size
}

class KalVm(app: Application) : AndroidViewModel(app) {
    private val ctx get() = getApplication<Application>()

    /* ---------- Konto ---------- */
    var session by mutableStateOf(KalAuth.session(app))
    var lServer by mutableStateOf(KalAuth.lastServer(app))
    var lUser by mutableStateOf("")
    var lPass by mutableStateOf("")
    var lCode by mutableStateOf("")
    var lTotp by mutableStateOf(false)
    var lBusy by mutableStateOf(false)
    var lErr by mutableStateOf<String?>(null)
    var hlBusy by mutableStateOf(false)
    val homelab: Boolean get() = KalAuth.homelabInstalled(ctx)

    /* ---------- Data ---------- */
    var data by mutableStateOf(KalStore.current(app))
    var remO by mutableStateOf(KalPrefs.remOverrides(app))
    var syncing by mutableStateOf(false)
    var syncErr by mutableStateOf<String?>(null)

    /* ---------- Visning ---------- */
    // Prompt 35: appen åpner i «Åpne i» fra Innstillinger (ikke sist brukte visning).
    var v by mutableStateOf(Kal35Prefs.openView(app).let { if (it in VIEWS.map { x -> x.first }) it else "mnd" })
    var a by mutableStateOf(today())
    var hid by mutableStateOf(KalPrefs.hidden(app))
    var sw by mutableStateOf(KalPrefs.weekNo(app))
    var swx by mutableStateOf(KalPrefs.weather(app))
    var drem by mutableStateOf(KalPrefs.defRem(app))
    var th by mutableStateOf(KalPrefs.theme(app))
    var so by mutableStateOf(false)
    var q by mutableStateOf("")
    var sf by mutableStateOf<String?>(null)
    var det by mutableStateOf<String?>(null)
    var ext by mutableStateOf<KEv?>(null)
    var cs by mutableStateOf(false)
    var nf by mutableStateOf<KNewForm?>(null)
    var ct by mutableStateOf("")
    var cf by mutableStateOf(false)
    var focusComposer by mutableIntStateOf(0)
    var toast by mutableStateOf<KToast?>(null)
    var back by mutableStateOf(false)
    var newCal by mutableStateOf(false)

    /* ---------- Prompt 35: Innstillinger, kalendere og zoom ---------- */
    /** Uken starter på søndag. */
    var sun by mutableStateOf(Kal35Prefs.sunStart(app))
    var ov by mutableStateOf(Kal35Prefs.openView(app))
    var dd by mutableIntStateOf(Kal35Prefs.defDur(app))
    var tl by mutableStateOf(Kal35Prefs.tlStart(app))
    var nBd by mutableStateOf(Kal35Prefs.notifyBirthdays(app))
    var nFr by mutableStateOf(Kal35Prefs.notifyDeadlines(app))
    var nBr by mutableStateOf(Kal35Prefs.notifyBrief(app))
    var nTv by mutableStateOf(Kal35Prefs.travelTime(app))
    /** Innstillinger-siden (glir inn fra høyre). */
    var setOn by mutableStateOf(false)
    /** «Rediger» i MINE KALENDERE, «Vis skjulte (N)», kalenderen med åpen fargevelger. */
    var calEd by mutableStateOf(false)
    var showHid by mutableStateOf(false)
    var pickC by mutableStateOf<String?>(null)
    /** «+ Legg til kalender»-panelet (null = lukket). */
    var ac by mutableStateOf<KAdd35?>(null)
    /** Prompt 36: Google-kortet i Konto-fanen (hovedkalender og flere Google-kalendere). */
    val g36 = no.kristo.kalender.ui.KGoogleUi36()
    /** Prompt 39: Kalendere (1a), Rediger (1b), Legg til (1c) og Google-velgeren (1d). */
    val k39 = no.kristo.kalender.ui.K39State(this)
    /** Prompt 41: innlogging uten adresse (Fortsett som / PKCE), bursdagskort, Glimt-søk og testvarsel (Kal41.kt). */
    val k41 = K41State(this)
    /** Prompt 51: ventende enheter (Sikkerhet), «Nytt i denne versjonen», flagg og krasjrapporter (Kal51.kt). */
    val k51 = K51State(this)
    /** Prompt 43: oppsett på Fold/nettbrett (tlf | delt | full) og om steg 2 av 2 er vist (Kal43.kt). */
    val k43 = K43State(app)
    /** Prompt 43: «Full skjerm» med dagspanel – trykk på en dag i måneden bytter bare dag (Wide43 setter den). */
    var full43 by mutableStateOf(false)
    var colO by mutableStateOf(Kal35Prefs.colors(app))
    var hmO by mutableStateOf(Kal35Prefs.hidMenu(app))
    /** Zoom-animasjonen: retning (in/out), teller (ny animasjon) og punktet den vokser fra (andel av visningen). */
    var zDir by mutableStateOf("in")
    var zN by mutableIntStateOf(0)
    var zOx by mutableStateOf(.5f)
    var zOy by mutableStateOf(.4f)
    private var calsMemo: Triple<List<KCal>, Map<String, Long>, Map<String, Boolean>>? = null
    private var calsOut: List<KCal> = emptyList()

    /* ---------- Glimt ---------- */
    val gm = mutableStateListOf<KGMsg>()
    var glOpen by mutableStateOf(false)
    var gq by mutableStateOf("")
    val thinking: Boolean get() = gm.any { it.thinking }
    var foreground = true

    private var toastJob: Job? = null
    private var glJob: Job? = null

    init {
        viewModelScope.launch { KalStore.data.collect { d -> if (d != null) data = d } }
        if (session != null) refresh()
    }

    /* ---------- Avledet ---------- */

    /** Prompt 35: kalenderne med lokale farger og «Skjul fra menyen» lagt på. */
    val cals: List<KCal> get() {
        val key = Triple(data.cals, colO, hmO)
        val m = calsMemo
        if (m == null || m.first !== key.first || m.second !== key.second || m.third !== key.third) {
            calsOut = data.cals.map { c ->
                var x = c
                colO[c.id]?.let { x = x.withColor35(it) }
                hmO[c.id]?.let { x = x.copy(hidMenu = it) }
                x
            }
            calsMemo = key
        }
        return calsOut
    }
    val calMap: Map<String, KCal> get() = cals.associateBy { it.id }
    fun cal(id: String): KCal = calMap[id] ?: cals.firstOrNull { it.key == id } ?: KCALS.firstOrNull { it.id == id } ?: KCALS[0]
    /** Fasitens korte nøkkel (p/j/s/f/h/b fra Glimt-tolkningen) → kalenderens id hos serveren. */
    fun resolveCal(k: String): String = if (calMap.containsKey(k)) k else cals.firstOrNull { it.key == k }?.id ?: k
    /** Kalendere skjult fra menyen forsvinner også fra visningene. */
    val hidMenuIds: Set<String> get() = cals.filter { it.hidMenu }.map { it.id }.toSet()

    /** Alle hendelser (også skjulte kalendere), med lokale varsel-valg og hendelsen fra en lenke som ikke fantes. */
    val all: List<KEv> get() {
        val o = remO
        val l = data.events.map { e -> if (o.containsKey(e.id)) e.copy(rem = o[e.id]) else e }
        return ext?.let { x -> if (l.none { it.id == x.id }) l + x else l } ?: l
    }
    val visible: List<KEv> get() { val hm = hidMenuIds; return all.filter { it.cal !in hid && it.cal !in hm } }
    fun find(id: String?): KEv? = id?.let { i -> all.firstOrNull { it.id == i } }

    /* ---------- Innlogging ---------- */

    fun login() {
        if (lBusy) return
        val srv = KalApi.normalizeServer(lServer)
        if (srv.isBlank() || lPass.isBlank()) { lErr = "Fyll inn serveradresse og passord."; return }
        lBusy = true; lErr = null
        viewModelScope.launch {
            try {
                val s = KalApi.login(srv, lUser, lPass, lCode.takeIf { lTotp })
                KalAuth.rememberServer(ctx, srv)
                signedIn(s)
            } catch (e: KalApiException) {
                if (e.needsTotp) { lTotp = true; lErr = if (lCode.isBlank()) null else e.message } else lErr = e.message
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                lErr = e.message ?: "Innloggingen feilet"
            } finally { lBusy = false }
        }
    }

    /** «Logg inn med Homelab-appen». auto = ved oppstart (ingen feilmelding hvis Homelab mangler). */
    fun loginHomelab(auto: Boolean = false) {
        if (hlBusy || session != null) return
        if (auto && (!homelab || KalPrefs.asked(ctx, "homelab_auto"))) return
        if (auto) KalPrefs.setAsked(ctx, "homelab_auto")
        hlBusy = true
        viewModelScope.launch {
            val (s, err) = KalAuth.fromHomelab(ctx)
            hlBusy = false
            if (s != null) signedIn(s) else if (!auto) lErr = err
        }
    }

    /** Prompt 41: brukes av K41State etter Fortsett som / Homelab-appen / passord. */
    fun signedIn41(s: KalSession) = signedIn(s)

    private fun signedIn(s: KalSession) {
        val prev = KalStore.current(ctx)
        if (prev.acct != null && prev.acct != s.acct) KalStore.clear(ctx)
        KalAuth.save(ctx, s)
        session = s
        lPass = ""; lCode = ""; lTotp = false; lErr = null
        KalSync.schedule(ctx)
        refresh()
    }

    fun logout() {
        val s = session
        KalAuth.clear(ctx)
        KalStore.clear(ctx)
        Kal41.forget(ctx)
        k41.phase = "start"
        // Prompt 43: oppsettsteget vises igjen etter neste innlogging.
        k43.reset()
        session = null
        cs = false
        // Tokenet fra Homelab trekkes tilbake på serveren (vises ellers i Innstillinger → Enheter til det slettes der).
        if (s != null) viewModelScope.launch { runCatching { s.api.post("/finans/api/logout") } }
        viewModelScope.launch { KalSync.redraw(ctx); runCatching { KalNotify.reschedule(ctx) } }
    }

    /* ---------- Synk ---------- */

    fun refresh() {
        val s = session ?: return
        if (syncing) return
        syncing = true
        viewModelScope.launch {
            val t = today()
            val from = minOf(t.minusDays(42), a.withDayOfMonth(1).minusDays(7))
            val to = maxOf(t.plusDays(84), a.withDayOfMonth(1).plusMonths(1).plusDays(7))
            val err = runCatching { KalRepo.sync(ctx, s, from, to) }.getOrElse { it.message }
            syncing = false
            syncErr = err
            // Prompt 44: fornyelsen (Kal44.recover) kan ha lagret et nytt token eller en annen adresse.
            KalAuth.session(ctx)?.let { ns -> if (session != null && (ns.token != session?.token || ns.server != session?.server)) session = ns }
            if (err == null) viewModelScope.launch { Kal44.log(ctx, "cal.syncDone", mapOf("ms" to KalRepo.lastSyncMs44.toString())) }
            reloadPrefs35()
            if (err?.contains("utløpt") == true) { KalAuth.clear(ctx); session = null; lErr = err }
            changed()
            if (err == null) k39.announce() // Prompt 39: «Vi ryddet kalenderne: 12 → 4» (én gang, med Angre)
        }
    }

    /** Etter endringer: widgetene og varslene. */
    private fun changed() {
        viewModelScope.launch { runCatching { KalSync.redraw(ctx) } }
        runCatching { KalNotify.reschedule(ctx) }
    }

    /* ---------- Visning ---------- */

    /** Visningsvelgeren: samme zoom-animasjon som kjeden, retning etter rekkefølgen År · Mnd · Uke · 3 d · Dag · Liste. */
    fun setView(k: String) {
        if (k == v) return
        val L = VIEWS.map { it.first }
        zoomOrigin(.5f, .4f)
        zoomTo(k, if (k == "liste") today() else null, if (L.indexOf(k) > L.indexOf(v)) "in" else "out")
    }

    /** Prompt 35: zoom til en visning (fasit: zoomTo). Den nye visningen vokser fra punktet man trykket/klypte (zOx/zOy). */
    fun zoomTo(nv: String, d: LocalDate? = null, dir: String) {
        Hap.tick()
        // Inn fra Måned/År uten valgt dag: i dag når den er i perioden, ellers første dag.
        val from = v
        var na = d ?: a
        if (d == null && dir == "in" && (from == "mnd" || from == "ar") && nv != "mnd") {
            val T = today()
            if (T.year == a.year && (from == "ar" || T.monthValue == a.monthValue)) na = T
        }
        if (nv == "mnd" && d != null) na = d.withDayOfMonth(1)
        v = nv
        a = na
        zDir = dir
        zN++
        KalPrefs.setView(ctx, nv)
        ensureRange()
    }

    /** Pinch / ctrl+hjul: ett steg i kjeden År → Måned → Uke → 3 dager → Dag (fasit: zoomStep). */
    fun zoomStep(dir: String) {
        val L = listOf("ar", "mnd", "uke", "3d", "dag")
        val i = L.indexOf(if (v == "liste") "mnd" else v)
        val j = (i + if (dir == "in") 1 else -1).coerceIn(0, L.size - 1)
        if (j == i) return
        zoomTo(L[j], null, dir)
    }

    /** Hvor neste zoom vokser fra (andel 0–1 av visningen). */
    fun zoomOrigin(x: Float, y: Float) { zOx = x.coerceIn(0f, 1f); zOy = y.coerceIn(0f, 1f) }

    /** ‹ › og sveip: én periode frem eller tilbake. */
    fun step(dir: Int) {
        Hap.tick()
        a = when (v) {
            "mnd" -> a.withDayOfMonth(1).plusMonths(dir.toLong())
            "ar" -> a.withDayOfMonth(1).plusYears(dir.toLong())
            "uke" -> a.plusDays(7L * dir)
            "3d" -> a.plusDays(3L * dir)
            else -> a.plusDays(dir.toLong())
        }
        ensureRange()
    }

    fun goToday() { Hap.tick(); a = today() }

    /** Trykk på tittelen zoomer ut: Dag → 3 dager → Uke → Mnd → År (Liste → Mnd). */
    fun titleTap() {
        val nv = when (v) { "dag" -> "3d"; "3d" -> "uke"; "uke" -> "mnd"; "mnd" -> "ar"; "liste" -> "mnd"; else -> "ar" }
        if (nv == v) return
        zoomOrigin(.5f, .1f)
        zoomTo(nv, if (nv == "mnd" && v != "liste") a.withDayOfMonth(1) else null, "out")
    }

    /** Trykk på en dag: Måned → Uke, Uke → 3 dager, 3 dager → Dag. */
    fun openDay(d: LocalDate) {
        // Prompt 44: trykket som kom med et sveip åpner ikke uke.
        if (swRecent44) return
        if (full43 && v == "mnd") { Hap.tick(); a = d; return }
        when (v) {
            "mnd" -> zoomTo("uke", d, "in")
            "uke" -> zoomTo("3d", d, "in")
            "3d" -> zoomTo("dag", d, "in")
            else -> zoomTo("dag", d, "in")
        }
    }
    fun openMonth(d: LocalDate) { zoomTo("mnd", d.withDayOfMonth(1), "in") }

    /** Navigerer man utenfor det som er hentet: hent på nytt rundt den nye datoen. */
    private fun ensureRange() {
        val evs = data.events
        if (evs.isEmpty()) return
        val min = evs.minOf { it.d }; val max = evs.maxOf { it.d }
        if (a.isBefore(min.plusDays(7)) || a.isAfter(max.minusDays(7))) refresh()
    }

    fun openEv(e: KEv) { Hap.tick(); det = e.id }
    fun closeDet() { Hap.dismiss(); det = null }

    /* ---------- Toast ---------- */

    fun showToast(t: String, undo: (() -> Unit)? = null) {
        toastJob?.cancel()
        toast = KToast(t, undo)
        toastJob = viewModelScope.launch { delay(4500); toast = null }
    }

    fun undoToast() { val u = toast?.undo; toast = null; u?.invoke() }

    /* ---------- Hendelser ---------- */

    private fun add(e: KEv, msg: String) {
        val s = session ?: return
        Hap.done()
        val tmpId = e.id
        var savedId = tmpId
        viewModelScope.launch {
            try {
                savedId = KalRepo.create(ctx, s, e).id
                e.x44?.att?.takeIf { it.isNotEmpty() && savedId != tmpId }?.let { Kal44.invite(s, savedId, it) }
                changed()
            } catch (x: KalApiException) {
                Hap.error()
                showToast(x.message ?: "Fikk ikke lagt til hendelsen")
            }
        }
        showToast(msg) { removeById(savedId) }
    }

    private fun removeById(id: String) {
        val s = session ?: return
        val e = find(id) ?: return
        viewModelScope.launch { runCatching { KalRepo.delete(ctx, s, e) }; changed() }
    }

    fun delete(e: KEv) {
        val s = session ?: return
        Hap.tick()
        det = null
        if (ext?.id == e.id) { ext = null; return }
        viewModelScope.launch {
            try { KalRepo.delete(ctx, s, e); changed(); showToast("«${e.t}» slettet") } catch (x: KalApiException) {
                showToast(x.message ?: "Kunne ikke slette")
            }
        }
    }

    fun setRem(e: KEv, r: Int?) {
        val s = session ?: return
        Hap.tick()
        remO = remO + (e.id to r)
        viewModelScope.launch { KalRepo.setRem(ctx, s, e, r); remO = KalPrefs.remOverrides(ctx); changed() }
    }

    /* ---------- Ny hendelse-arket ---------- */

    fun openNew(d0: LocalDate? = null, s0: Int? = null, e0: Int? = null) {
        Hap.tick()
        // Prompt 46: valgt dag/tidsluke, ellers i dag (Uke/3 d/Dag: første synlige dag når i dag ikke vises), neste hele time.
        val base = d0 ?: newDay46()
        val st = (s0 ?: nextHour46()).coerceIn(0, 23 * 60 + 45)
        // Prompt 35: «Standard varighet» fra Innstillinger.
        var en = e0 ?: minOf(1439, st + dd)
        if (en <= st) en = minOf(1439, st + dd)
        val f = KNewForm(d = base, s = st, e = en, cal = writableDefault(), rem = drem)
        nf = f
        // Prompt 46: aldri grå skjerm – arket må melde fra innen 1,5 s, ellers «Kunne ikke åpne ny hendelse» + Prøv igjen.
        Kal46Guard.arm(this, f)
    }

    /** Personlig, eller første skrivbare kalender fra serveren. */
    /** Prompt 46: standardkalenderen (Innstillinger → Standardkalender), ellers Google, ellers Personlig, ellers første skrivbare. */
    fun writableDefault(): String = Kal46Prefs.pick(cals, Kal46Prefs.defCal(ctx))

    fun closeNew() { Hap.dismiss(); nf = null }

    /** Endrer man starttid, flyttes slutt med samme varighet. */
    fun nfStart(m: Int) { val f = nf ?: return; val dur = maxOf(15, f.e - f.s); nf = f.copy(s = m, e = minOf(1439, m + dur)) }

    /* ---------- Prompt 44: hold inne / trykk for ny, Rediger, sveip ---------- */

    /** Sist et sveip startet (> 12 dp) – trykk innen 450 ms etterpå åpner ikke uke/ark. */
    var swAt44 = 0L
    val swRecent44: Boolean get() = System.currentTimeMillis() - swAt44 < 450
    /** Konflikt etter Lagre: «Endret et annet sted. Behold din eller deres?» (hendelses-id). */
    var conflict44 by mutableStateOf<String?>(null)
    /** Spør om gjentakende: «Bare denne / Denne og fremtidige / Alle». */
    var askScope44 by mutableStateOf(false)
    private val before44 = HashMap<String, KEv>()

    /** Hold inne en dag (Måned) eller trykk på et tidspunkt (Uke · 3 d · Dag). */
    fun newOn44(d: LocalDate, at: Int? = null) {
        if (swRecent44) return
        Hap.tick()
        val st = Kal44.startFor(d, at)
        val f = KNewForm(d = d, s = st, e = minOf(1439, st + dd), cal = writableDefault(), rem = drem)
        nf = f
        Kal46Guard.arm(this, f)
    }

    fun canEdit44(e: KEv): Boolean = !Kal44.readOnly(e) && (e.editable || e.pending) && !no.kristo.kalender.Kal41.isBirthday(e, cal(e.cal).n)

    /** Detaljarket → Rediger: samme ark som Ny hendelse, utfylt. */
    fun edit44(e: KEv) {
        Hap.tick()
        val st = e.s ?: 9 * 60
        det = null
        nf = KNewForm(t = e.t, loc = e.address ?: e.loc ?: "", d = e.d, s = st, e = minOf(1439, e.e ?: (st + 60)), all = e.all, cal = e.cal,
            rem = if (e.all) drem else e.rem, editId = e.id, lat = e.lat, lon = e.lon, att = e.x44?.att ?: emptyList())
    }

    /** «Lagre» (Rediger) eller «Legg til». scope for gjentakende: this | future | all. */
    fun saveForm44(scope: String? = null) {
        val f = nf ?: return
        if (f.t.isBlank()) return
        val id = f.editId
        if (id == null) { saveNew(); return }
        val old = find(id) ?: run { nf = null; return }
        if (scope == null && old.x44?.rec == true) { askScope44 = true; return }
        askScope44 = false
        val S = f.s; val E = maxOf(S + 15, f.e)
        val x = (old.x44 ?: KX44()).copy(att = f.att)
        val ne = old.copy(t = f.t.trim(), loc = f.loc.trim().ifBlank { null }, address = if (f.lat != null) f.loc.trim() else null, lat = f.lat, lon = f.lon,
            d = f.d, s = if (f.all) null else S, e = if (f.all) null else E, cal = f.cal, rem = if (f.all) null else f.rem, x44 = x)
        before44[id] = old
        replace44(ne)
        nf = null
        a = f.d
        det = id
        Hap.done()
        val newAtt = f.att.filter { it !in (old.x44?.att ?: emptyList()) }
        showToast("Lagret «${ne.t}»" + if (newAtt.isEmpty()) "" else " · invitasjon sendt til ${newAtt.size}") { undoEdit44(id) }
        if (ne.pending) return
        val s = session ?: return
        viewModelScope.launch { patch44(s, ne, scope, force = false, invite = newAtt) }
    }

    private fun replace44(e: KEv) {
        val d = KalStore.current(ctx)
        KalStore.save(ctx, d.copy(events = d.events.map { if (it.id == e.id) e else it }))
        changed()
    }

    private suspend fun patch44(s: KalSession, e: KEv, scope: String?, force: Boolean, invite: List<KAtt44>) {
        val d = KalStore.current(ctx)
        try {
            val raw = s.api.patch("/api/kalender/events/" + URLEncoder.encode(e.id, "UTF-8"), Kal44.patchBody(e, KalRepo.writeCal(d, e.cal), scope, force))
            runCatching { JSONObject(raw).optJSONObject("event")?.let { parseServerEvent(it, d.cals.associateBy { c -> c.id }) } }.getOrNull()?.let { m ->
                if (m.id == e.id) replace44(m.copy(cal = e.cal, lat = m.lat ?: e.lat, lon = m.lon ?: e.lon, x44 = m.x44 ?: e.x44))
            }
            if (invite.isNotEmpty()) Kal44.invite(s, e.id, invite)
        } catch (x: KalApiException) {
            when {
                x.status == 409 || x.status == 412 -> conflict44 = e.id
                x.status == 0 -> {}
                else -> { showToast(x.message ?: "Kunne ikke lagre"); refresh() }
            }
        }
    }

    /** «Behold din» lagrer på nytt uten versjonssjekk, «Bruk deres» henter på nytt. */
    fun resolveConflict44(keepMine: Boolean) {
        val id = conflict44 ?: return
        conflict44 = null
        Hap.tick()
        if (!keepMine) { refresh(); return }
        val s = session ?: return
        val e = find(id) ?: return
        viewModelScope.launch { patch44(s, e, null, force = true, invite = emptyList()) }
    }

    private fun undoEdit44(id: String) {
        val old = before44.remove(id) ?: return
        replace44(old)
        if (old.pending) return
        val s = session ?: return
        viewModelScope.launch { patch44(s, old, null, force = true, invite = emptyList()) }
    }

    fun saveNew() {
        val f = nf ?: return
        if (f.t.isBlank()) return
        val S = f.s; val E = maxOf(S + 15, f.e)
        val e = KEv("u" + System.currentTimeMillis(), f.t.trim(), f.cal, f.d, if (f.all) null else S, if (f.all) null else E,
            loc = f.loc.trim().ifBlank { null }, rem = if (f.all) null else f.rem,
            // Prompt 44: koordinater fra adresseforslaget og deltakere (invitasjonen sendes når hendelsen er lagret).
            address = if (f.lat != null) f.loc.trim() else null, lat = f.lat, lon = f.lon, x44 = if (f.att.isEmpty()) null else KX44(att = f.att))
        nf = null
        a = f.d
        add(e, "La til «${e.t}» · " + dl(f.d) + (if (f.all) "" else " " + hm(S)) + (if (f.att.isEmpty()) "" else " · invitasjon sendt til ${f.att.size}"))
    }

    /* ---------- Skrivefeltet (Glimt) ---------- */

    val preview: KParsed? get() {
        val t = ct.trim()
        if (t.length < 3 || isQ(t)) return null
        return parseQuick(t, drem, defDur = dd)
    }
    val isQuestion: Boolean get() = ct.trim().length >= 3 && isQ(ct)

    /** Enter / pil i skrivefeltet. */
    fun composerSend() {
        val t = ct.trim()
        if (t.length < 3) return
        if (isQ(t)) { ct = ""; glSend(t); return }
        val p = parseQuick(t, drem, defDur = dd)
        // En innlimt melding (SMS/e-post) uten sikkert klokkeslett: Glimt (LLM) i bakgrunnen.
        if (looksPasted(t) && p.s == null) { ct = ""; quick(t); return }
        ct = ""
        // Prompt 46: Glimt (module:'calendar') tolker tittel/sted og lagrer i standardkalenderen; lokal lagring som reserve.
        a = Kal46Rask.merged(this, p, t).first.d
        Kal46Rask.send(this, t, p) { m, loc ->
            val e = KEv("u" + System.currentTimeMillis(), m.t, resolveCal(m.cal), m.d, m.s, m.e, loc = loc.ifBlank { null }, rem = m.rem, src = m.src)
            add(e, "Glimt la til «${m.t}» · " + dl(m.d) + (if (m.all) "" else " " + hm(m.s ?: 0)))
        }
    }

    private fun looksPasted(t: String) = t.contains('\n') || t.length > 90

    /**
     * Innlimt melding → POST /api/kalender/quick (Glimt henter tittel, tid og sted). Kjører på serveren; vi følger jobben og
     * varsler når hendelsen er lagt til. Eldre server uten /quick: lokal tolkning.
     */
    fun quick(text: String) {
        val s = session ?: return
        showToast("Glimt leser meldingen …")
        viewModelScope.launch {
            val job = try { JSONObject(s.api.post("/api/kalender/quick", JSONObject().put("text", text))).optString("jobId").ifBlank { null } } catch (e: KalApiException) {
                if (e.status == 404) null else { showToast(e.message ?: "Glimt svarte ikke"); return@launch }
            }
            if (job == null) {
                val p = parseQuick(text, drem)
                add(KEv("u" + System.currentTimeMillis(), p.t, resolveCal(p.cal), p.d, p.s, p.e, rem = p.rem, src = p.src), "Glimt la til «${p.t}» · " + dl(p.d))
                return@launch
            }
            repeat(60) {
                delay(2000)
                val l = runCatching { JSONArray(s.api.get("/api/kalender/quick/jobs", timeout = 6000)) }.getOrNull() ?: return@repeat
                val j = (0 until l.length()).mapNotNull { l.optJSONObject(it) }.firstOrNull { it.optString("id") == job } ?: return@repeat
                when (j.optString("state")) {
                    "done" -> {
                        val title = j.optJSONObject("result")?.optString("title")?.ifBlank { null } ?: "hendelsen"
                        refresh()
                        val msg = "Glimt la til «$title»"
                        if (foreground) showToast(msg) { viewModelScope.launch { runCatching { s.api.post("/api/kalender/quick/" + URLEncoder.encode(job, "UTF-8") + "/undo") }; refresh() } }
                        else KalNotify.glimt(ctx, "Lagt i kalenderen", msg)
                        return@launch
                    }
                    "failed", "cancelled" -> {
                        val err = j.optString("error").ifBlank { "Fant ikke tid og dato i meldingen." }
                        if (foreground) showToast(err) else KalNotify.glimt(ctx, "Fikk ikke lagt til", err)
                        return@launch
                    }
                }
            }
        }
    }

    /** Lenker og deling: kalender://ny?text=… eller Del → Kalender. */
    fun incomingText(t: String) {
        if (t.isBlank()) { focusComposer++; return }
        if (looksPasted(t) && parseQuick(t, drem, defDur = dd).s == null) quick(t) else { ct = t; focusComposer++ }
    }

    /* ---------- Glimt-panelet ---------- */

    fun openGlimt() { Hap.tick(); glOpen = true }
    fun closeGlimt() {
        Hap.dismiss()
        glJob?.cancel()
        gm.forEach { if (!it.user) { it.thinking = false; it.shown = it.words.size } }
        glOpen = false
    }

    fun glSend(q0: String) {
        val qq = q0.trim()
        if (qq.isEmpty()) return
        Hap.tick()
        glJob?.cancel()
        gm.forEach { if (!it.user) { it.thinking = false; it.shown = it.words.size } }
        val id = System.currentTimeMillis()
        gm += KGMsg(id, true, qq)
        val m = KGMsg(id + 1, false, "")
        m.q = qq
        gm += m
        gq = ""
        glOpen = true
        val local = KalAsk(visible, calMap, if (swx) data.wx else emptyMap(), drem, all, sun).ask(qq)
        glJob = viewModelScope.launch {
            // Prompt 70: nye avtaler går til serveren (standardkalenderen + kort C) når vi er logget inn; uten svar lokalt som før.
            if (local?.create != null && session != null && glServer(m, qq, fallback = true)) return@launch
            if (local != null) {
                m.steps = local.steps
                local.create?.let { ev0 ->
                    val ev = ev0.copy(cal = resolveCal(ev0.cal))
                    val s = session
                    if (s != null) runCatching { KalRepo.create(ctx, s, ev) }.onSuccess { saved -> m.undoId = saved.id; m.cards = listOf(saved); changed() }
                        .onFailure { m.cards = listOf(ev) }
                } ?: run { m.cards = local.cards }
                m.slots = local.slots
                tickSteps(m)
                stream(m, local.txt)
            } else glServer(m, qq)
        }
    }

    private suspend fun tickSteps(m: KGMsg) {
        delay(380)
        while (m.step < m.steps.size) { m.step++; delay(if (m.step < m.steps.size) 420 else 260) }
    }

    /** Teksten strømmes ord for ord (2 ord per 45 ms) med rød markør; haptikk når svaret er ferdig. */
    private suspend fun stream(m: KGMsg, txt: String) {
        m.full = txt
        m.thinking = false
        m.shown = 0
        val n = m.words.size
        while (m.shown < n) { delay(45); m.shown = minOf(n, m.shown + 2) }
        if (m.err) Hap.error() else Hap.done()
        if (!foreground) KalNotify.glimt(ctx, "Glimt", txt)
    }

    /**
     * Serverens Glimt (POST /api/assist {q, source:'calendar', context}). SERVER33 svarer {text, steps[], events[], slots[], created?}
     * direkte (200) eller som jobb (202 {jobId} → GET /api/assist/:id med steps[] underveis). 404 / uten nett: hjelpeteksten.
     */
    private suspend fun glServer(m: KGMsg, qq: String, fallback: Boolean = false): Boolean {
        val s = session
        m.steps = listOf("Spør Glimt", "Leser kalenderen", "Skriver svar")
        if (s == null) { if (fallback) return false; tickSteps(m); stream(m, KalAsk.HELP); return true }
        m.engine = "server"
        val ctxO = JSONObject().put("date", a.toString()).put("view", v).put("today", today().toString())
        det?.let { ctxO.put("eventId", it) }
        val body = JSONObject().put("q", qq).put("source", "calendar").put("context", ctxO)
        var ans: JSONObject? = null
        // Prompt 34 (claude-code-glimt-virker-ikke.md): feil vises i svaret («Glimt fikk ikke svar fra {modell}: {feil}»), ikke hjelpeteksten.
        var errT: String? = null
        var errModel: String? = null
        var missing = false
        try {
            val o = JSONObject(s.api.post("/api/assist", body, read = 30_000))
            if (!o.optBoolean("ok", true) || (o.optStrOrNull("text") == null && o.optStrOrNull("error") != null && o.optStrOrNull("jobId") == null)) {
                errT = o.optStrOrNull("error"); errModel = o.optStrOrNull("model")
                throw KalApiException(errT ?: "tomt svar")
            }
            val jobId = o.optStrOrNull("jobId")
            if (o.optStrOrNull("text") != null || o.has("answer")) ans = o.optJSONObject("answer") ?: o
            else if (jobId != null) {
                m.step = 1
                for (i in 0 until 100) {
                    delay(700)
                    val j = runCatching { JSONObject(s.api.get("/api/assist/" + URLEncoder.encode(jobId, "UTF-8"), timeout = 6000)) }.getOrNull() ?: continue
                    j.optJSONArray("steps")?.let { a -> val l = (0 until a.length()).mapNotNull { a.optJSONObject(it)?.str("label", "key") }; if (l.isNotEmpty()) { m.steps = l; m.step = (0 until a.length()).count { a.optJSONObject(it)?.optString("state") == "done" } } }
                    when (j.optString("state")) {
                        "done" -> { ans = j.optJSONObject("answer") ?: j; break }
                        "failed", "cancelled" -> { errT = j.optStrOrNull("error") ?: if (j.optString("state") == "cancelled") "avbrutt" else "jobben feilet"; errModel = j.optStrOrNull("model"); break }
                    }
                }
                if (ans == null && errT == null) errT = "tidsavbrudd etter 70 s"
            }
        } catch (e: CancellationException) { throw e } catch (e: KalApiException) {
            ans = null
            if (e.status == 404 || e.status == 405) missing = true else if (errT == null) errT = e.message
        } catch (e: Exception) { ans = null; if (errT == null) errT = e.message ?: "fikk ikke kontakt med serveren" }
        if (ans == null) {
            if (fallback) { m.engine = "lokal"; m.step = 0; return false } // prompt 70: den lokale tolkningen tar over
            tickSteps(m)
            // Eldre server uten Glimt-ruteren: hjelpeteksten som før. Ellers den ekte feilen.
            if (missing || errT == null) { stream(m, KalAsk.HELP); return true }
            m.err = true
            m.engine = "feil"
            stream(m, "Glimt fikk ikke svar fra " + (errModel ?: "modellen") + ": " + errT + ".")
            return true
        }
        val a0 = ans!!
        a0.optJSONArray("steps")?.let { arr -> val l = (0 until arr.length()).mapNotNull { arr.opt(it).let { x -> if (x is JSONObject) x.str("label", "key") else x?.toString() } }; if (l.isNotEmpty()) m.steps = l }
        m.step = m.steps.size
        val cards = ArrayList<KEv>()
        a0.optJSONArray("events")?.let { arr -> for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { parseServerEvent(it, calMap) }?.let(cards::add) }
        a0.optJSONObject("card")?.takeIf { it.optString("k") == "calendar" }?.let { c ->
            val d = c.optStrOrNull("date")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: today()
            c.optJSONArray("items")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val it = arr.optJSONObject(i) ?: continue
                    val id = it.optStrOrNull("id")
                    cards += find(id) ?: KEv(id ?: "a$i", it.optString("title"), "p", d, it.optStrOrNull("time")?.let(::hmIn), null, loc = it.optStrOrNull("place"), color = hexIn(it.optStrOrNull("color")))
                }
            }
        }
        m.cards = cards.map { c -> find(c.id) ?: c }
        val slots = ArrayList<KSlot>()
        a0.optJSONArray("slots")?.let { arr ->
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val d = o.str("date", "d")?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: continue
                val st = o.opt("start") ?: o.opt("s"); val en = o.opt("end") ?: o.opt("e")
                val sm = (st as? Number)?.toInt() ?: (st as? String)?.let(::hmIn) ?: continue
                val em = (en as? Number)?.toInt() ?: (en as? String)?.let(::hmIn) ?: (sm + 60)
                slots += KSlot(d, sm, minOf(em, sm + 60))
            }
        }
        m.slots = slots
        // Prompt 70: kort C og spørsmålet med knapper (kortet har egen Angre).
        m.c70 = K70.of(a0)
        m.ask70 = a0.optJSONObject("agent")?.optJSONObject("ask")
        if (m.c70 != null) { m.cards = emptyList(); refresh(); stream(m, (a0.str("text", "txt") ?: "").replace("**", "")); return true }
        (a0.opt("created") as? JSONObject)?.let { c ->
            val ev = parseServerEvent(c.optJSONObject("event") ?: c, calMap)
            m.undoId = ev?.id ?: c.optStrOrNull("id")
            refresh()
        } ?: (a0.opt("created") as? String)?.let { m.undoId = it; refresh() }
        stream(m, (a0.str("text", "txt") ?: KalAsk.HELP).replace("**", ""))
        return true
    }

    /** Prompt 34: «Prøv igjen» på et feilet Glimt-svar. */
    fun glRetry(m: KGMsg) { if (m.q.isNotBlank()) glSend(m.q) }

    /** Prompt 34: «Åpne AI-kontroll» – i Homelab-appen (finanshub://ai), ellers Homelab på web. */
    fun openAiCtl() {
        Hap.tick()
        val c = ctx
        val i = android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse("finanshub://ai/ov")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val ok = KalAuth.homelabInstalled(c) && runCatching { c.startActivity(i) }.isSuccess
        if (!ok) session?.server?.let { s -> runCatching { c.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(s.trimEnd('/') + "/")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }

    private fun hmIn(s: String): Int? = Regex("^(\\d{1,2})[:.](\\d{2})").find(s.trim())?.let { it.groupValues[1].toInt() * 60 + it.groupValues[2].toInt() }

    fun glUndo(m: KGMsg) {
        val id = m.undoId ?: return
        Hap.tick()
        m.undoId = null
        removeById(id)
    }

    /** Grønn ledig tid → Ny hendelse-arket ferdig utfylt. */
    fun slot(sl: KSlot) {
        Hap.tick()
        nf = KNewForm(d = sl.d, s = sl.s, e = sl.e, cal = writableDefault(), rem = drem)
    }

    /* ---------- Sidemenyen ---------- */

    fun toggleCal(c: KCal) {
        if (calEd) return
        Hap.tick()
        val on = c.id in hid
        hid = if (on) hid - c.id else hid + c.id
        KalPrefs.setHidden(ctx, hid)
        // Prompt 44: Media-kalenderen henter utgivelsene bare når den er på (samme bryter som «Vis i Kalender» i Media).
        session?.let { s -> viewModelScope.launch { KalRepo.setVisible(s, data, c, on); if (c.id == "media" && on) refresh() } }
        changed()
    }

    fun setWeekNo(on: Boolean) { Hap.tick(); sw = on; KalPrefs.setWeekNo(ctx, on); pushPref("weekNumbers", on) }
    fun setWx(on: Boolean) { Hap.tick(); swx = on; KalPrefs.setWeather(ctx, on); changed(); pushPref("weather", on) }
    fun setDefRem(r: Int?) { Hap.tick(); drem = r; KalPrefs.setDefRem(ctx, r); pushPref("defaultReminder", Kal35Prefs.remToPref(r)) }
    fun setTheme(k: String) { Hap.tick(); th = k; KalPrefs.setTheme(ctx, k); KalTheme.apply(ctx, k); pushPref("theme", k) }

    /* ---------- Prompt 35: Innstillinger ---------- */

    private fun pushPref(k: String, value: Any) {
        val s = session ?: return
        viewModelScope.launch { Kal35Repo.putPref(ctx, s, k, value) }
    }

    fun setWeekStart(sunday: Boolean) { Hap.tick(); sun = sunday; Kal35Prefs.setStr(ctx, "p35_ws", if (sunday) "sun" else "mon"); changed(); pushPref("weekStart", if (sunday) "sun" else "mon") }
    fun setOpenView(k: String) { Hap.tick(); ov = k; Kal35Prefs.setStr(ctx, "p35_ov", k); pushPref("openView", k) }
    fun setDefDur(m: Int) { Hap.tick(); dd = m; Kal35Prefs.setInt(ctx, "p35_dd", m); pushPref("defaultDuration", m) }
    fun setTlStart(k: String) { Hap.tick(); tl = k; Kal35Prefs.setStr(ctx, "p35_tl", k); pushPref("timelineStart", k) }
    fun setNotify(k: String, on: Boolean) {
        Hap.tick()
        when (k) {
            "notifyBirthdays" -> { nBd = on; Kal35Prefs.setBool(ctx, "p35_nbd", on) }
            "notifyDeadlines" -> { nFr = on; Kal35Prefs.setBool(ctx, "p35_nfr", on) }
            "notifyBrief" -> { nBr = on; Kal35Prefs.setBool(ctx, "p35_nbr", on) }
            "travelTime" -> { nTv = on; Kal35Prefs.setBool(ctx, "p35_ntv", on) }
        }
        runCatching { KalNotify.reschedule(ctx) }
        pushPref(k, on)
    }

    /** Etter synk: valgene fra profilen inn i skjermen. */
    private fun reloadPrefs35() {
        sun = Kal35Prefs.sunStart(ctx); ov = Kal35Prefs.openView(ctx); dd = Kal35Prefs.defDur(ctx); tl = Kal35Prefs.tlStart(ctx)
        nBd = Kal35Prefs.notifyBirthdays(ctx); nFr = Kal35Prefs.notifyDeadlines(ctx); nBr = Kal35Prefs.notifyBrief(ctx); nTv = Kal35Prefs.travelTime(ctx)
        sw = KalPrefs.weekNo(ctx); swx = KalPrefs.weather(ctx); drem = KalPrefs.defRem(ctx)
        val t = KalPrefs.theme(ctx)
        if (t != th) { th = t; KalTheme.apply(ctx, t) }
    }

    fun openSettings() { Hap.tick(); setOn = true }
    fun closeSettings() { Hap.dismiss(); setOn = false }

    /** «Glimt» i Innstillinger: Glimt-innstillingene i Homelab (samme som Homelab → Innstillinger → Glimt). */
    fun openGlimtSettings() {
        Hap.tick()
        val c = ctx
        val i = android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse("finanshub://settings/glimt")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val ok = KalAuth.homelabInstalled(c) && runCatching { c.startActivity(i) }.isSuccess
        if (!ok) session?.server?.let { s -> runCatching { c.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(s.trimEnd('/') + "/#innstillinger/glimt")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) } }
            ?: showToast("Glimt-innstillingene ligger i Homelab → Innstillinger → Glimt")
    }

    /** «Kontoer og synk»: sidemenyen med «Legg til kalender → Konto» åpen. */
    fun openAccounts() { Hap.tick(); setOn = false; cs = true; ac = KAdd35(tab = "acc", c = SWC35[6]) }

    /* ---------- Prompt 35: kalendere (farge, skjul fra menyen, iCal, Home Assistant) ---------- */

    fun pickColor(c: KCal, col: Long) {
        Hap.tick()
        pickC = null
        colO = colO + (c.id to col)
        Kal35Prefs.setColor(ctx, c.id, col)
        val s = session
        changed()
        if (s != null && data.serverCals) viewModelScope.launch {
            // Lagret på serveren: den lokale overstyringen trengs ikke lenger (serverens farge kommer ved neste synk).
            if (Kal35Repo.patchCal(s, c, JSONObject().put("color", hexOut(col)))) {
                val d = KalStore.current(ctx)
                KalStore.save(ctx, d.copy(cals = d.cals.map { if (it.id == c.id) it.withColor35(col) else it }))
                Kal35Prefs.setColor(ctx, c.id, null); colO = Kal35Prefs.colors(ctx)
            }
        }
    }

    fun setHidMenu(c: KCal, hide: Boolean) {
        Hap.tick()
        hmO = hmO + (c.id to hide)
        Kal35Prefs.setHidMenu(ctx, c.id, hide)
        changed()
        val s = session
        if (s != null && data.serverCals) viewModelScope.launch {
            if (Kal35Repo.patchCal(s, c, JSONObject().put("hidMenu", hide))) {
                val d = KalStore.current(ctx)
                KalStore.save(ctx, d.copy(cals = d.cals.map { if (it.id == c.id) it.copy(hidMenu = hide) else it }))
                Kal35Prefs.setHidMenu(ctx, c.id, null); hmO = Kal35Prefs.hidMenu(ctx)
            }
        }
    }

    fun removeCal(c: KCal) {
        Hap.tick()
        val s = session ?: return
        viewModelScope.launch {
            try { KalRepo.deleteCalendar(s, c); showToast("«${c.n}» fjernet"); refresh() } catch (e: KalApiException) { showToast(e.message ?: "Kunne ikke fjerne kalenderen") }
        }
    }

    fun openAddCal() { Hap.tick(); ac = if (ac != null) null else KAdd35(c = SWC35[(cals.size * 3) % SWC35.size]) }

    fun acTab(t: String) {
        Hap.tick()
        val x = ac ?: return
        ac = x.copy(tab = t)
        if (t == "ha" && x.ha == null) loadHa()
    }

    private fun loadHa() {
        val s = session ?: return
        ac = ac?.copy(haBusy = true)
        viewModelScope.launch {
            val l = Kal35Repo.haList(s)
            ac = ac?.copy(ha = l, haBusy = false)
        }
    }

    fun acSave() {
        val x = ac ?: return
        val s = session ?: return
        when (x.tab) {
            "ics" -> {
                if (!icalOk35(x.url) || x.name.isBlank()) return
                Hap.done()
                ac = x.copy(busy = true)
                viewModelScope.launch {
                    try {
                        Kal35Repo.addIcal(s, x.url, x.name, x.c)
                        ac = null
                        showToast("Abonnerer på «${x.name.trim()}»")
                        refresh()
                    } catch (e: KalApiException) {
                        ac = ac?.copy(busy = false)
                        showToast(if (e.status == 404 || e.status == 405) "Serveren støtter ikke iCal-abonnement ennå. Oppdater Homelab." else (e.message ?: "Fikk ikke abonnert"))
                    }
                }
            }
            "ha" -> {
                if (x.sel.isEmpty()) return
                Hap.done()
                ac = x.copy(busy = true)
                viewModelScope.launch {
                    try {
                        Kal35Repo.addHa(s, x.sel, x.c)
                        ac = null
                        showToast("${x.sel.size} kalender" + (if (x.sel.size > 1) "e" else "") + " fra Home Assistant lagt til")
                        refresh()
                    } catch (e: KalApiException) {
                        ac = ac?.copy(busy = false)
                        showToast(e.message ?: "Fikk ikke lagt til kalenderne")
                    }
                }
            }
        }
    }

    /** Konto (Google, iCloud, Outlook): innloggingen skjer i Homelab (Innstillinger → Kalendere). */
    fun openAccount(n: String) {
        Hap.tick()
        val c = ctx
        val i = android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse("finanshub://settings/kalendere")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val ok = KalAuth.homelabInstalled(c) && runCatching { c.startActivity(i) }.isSuccess
        showToast(if (ok) "$n: logg inn i Homelab, så velger du kalenderne der" else "$n kobles til i Homelab → Innstillinger → Kalendere")
    }

    fun createCalendar(name: String, color: Long) {
        val s = session ?: return
        newCal = false
        viewModelScope.launch {
            try { KalRepo.createCalendar(s, name.trim(), color); showToast("La til kalenderen «${name.trim()}»"); refresh() } catch (e: KalApiException) {
                showToast(if (e.status == 404) "Serveren støtter ikke egne kalendere ennå. Oppdater Homelab." else (e.message ?: "Fikk ikke lagt til kalenderen"))
            }
        }
    }

    fun deleteCalendar(c: KCal) {
        val s = session ?: return
        viewModelScope.launch {
            try { KalRepo.deleteCalendar(s, c); showToast("Slettet «${c.n}»"); refresh() } catch (e: KalApiException) { showToast(e.message ?: "Kunne ikke slette") }
        }
    }

    /* ---------- Søk ---------- */

    fun openSearch() { Hap.tick(); so = true; q = ""; sf = null }
    fun closeSearch() { Hap.dismiss(); so = false }

    /* ---------- Lenker (fasit: applyLink) ---------- */

    /**
     * kalender:// (i dag) · kalender://dag/2026-10-21 · kalender://hendelse?id=…&date=…&t=…&s=…&e=… · kalender://liste ·
     * kalender://ny?text=… · https://kalender.kristo.no/d/2026-10-21. ?src=homelab (eller åpnet fra Homelab) viser «◀ Homelab».
     */
    fun applyLink(uri: Uri, fromHomelab: Boolean) {
        // Prompt 41: kalender://auth?code=…&state=… fra Homelab (PKCE).
        if (uri.scheme == "kalender" && (uri.host ?: "").lowercase() == "auth") { k41.handleRedirect(uri); return }
        if (fromHomelab || uri.getQueryParameter("src") == "homelab" || uri.getQueryParameter("from") == "homelab") back = true
        so = false; cs = false; nf = null; det = null
        val host = (uri.host ?: "").lowercase()
        val path = uri.pathSegments
        val T = today()
        fun date(s: String?): LocalDate? = s?.let { if (it == "idag" || it == "i-dag") T else runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
        when {
            uri.scheme == "https" -> { if (path.size >= 2 && path[0] == "d") date(path[1])?.let { v = "dag"; a = it } }
            host == "dag" -> { v = "dag"; a = date(path.firstOrNull()) ?: date(uri.getQueryParameter("date")) ?: T }
            host == "liste" -> { v = "liste"; a = T }
            // Prompt 43: varselet «Kalender 1.1 er klar» → Programvareoppdatering.
            host == "oppdatering" -> Kal43Upd.pageOpen = true
            // Prompt 51: varselet «Ny enhet vil logge inn» → Innstillinger (SIKKERHET).
            host == "sikkerhet" || host == "innstillinger" -> { if (session != null) { setOn = true; k51.loadPending() } }
            host == "maned" || host == "mnd" -> { v = "mnd"; a = date(path.firstOrNull()) ?: T }
            host == "ny" -> incomingText(uri.getQueryParameter("text").orEmpty())
            host == "hendelse" -> {
                val id = uri.getQueryParameter("id") ?: path.firstOrNull()
                val d = date(uri.getQueryParameter("date"))
                val t = uri.getQueryParameter("t")
                val s = uri.getQueryParameter("s")?.let(::hmIn)
                val e = uri.getQueryParameter("e")?.let(::hmIn)
                v = "dag"
                val byId = find(id)
                val f = byId ?: if (t != null && d != null) {
                    val low = t.lowercase()
                    all.firstOrNull { x -> x.d == d && (x.t.lowercase().contains(low) || low.contains(x.t.lowercase())) && (s == null || x.s == s) }
                } else null
                a = f?.d ?: d ?: T
                if (f != null) det = f.id
                else if (t != null && d != null) {
                    // Finner den ikke noe, viser arket data fra lenken.
                    val x = KEv("x" + (id ?: System.currentTimeMillis().toString()), t, "s", d, s, e ?: s?.let { it + 60 }, loc = "Fra Homelab", editable = false, pending = true)
                    ext = x; det = x.id
                } else if (id != null) pendingId = id
            }
            else -> { a = T }
        }
        KalPrefs.setView(ctx, v)
        ensureRange()
    }

    /** Hendelse fra en lenke som ikke var hentet ennå (åpnes når dataene kommer). */
    var pendingId: String? = null
    fun resolvePending() {
        val id = pendingId ?: return
        find(id)?.let { e -> pendingId = null; a = e.d; det = e.id }
    }

    companion object {
        val VIEWS = listOf("ar" to "År", "mnd" to "Mnd", "uke" to "Uke", "3d" to "3 d", "dag" to "Dag", "liste" to "Liste")
    }
}
