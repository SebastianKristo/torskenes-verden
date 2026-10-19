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
data class KNewForm(val t: String = "", val loc: String = "", val d: LocalDate, val s: Int, val e: Int, val all: Boolean = false, val cal: String = "p", val rem: Int?)

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
    var v by mutableStateOf(KalPrefs.view(app).let { if (it in VIEWS.map { x -> x.first }) it else "mnd" })
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

    val cals: List<KCal> get() = data.cals
    val calMap: Map<String, KCal> get() = data.cals.associateBy { it.id }
    fun cal(id: String): KCal = calMap[id] ?: KCALS.firstOrNull { it.id == id } ?: KCALS[0]

    /** Alle hendelser (også skjulte kalendere), med lokale varsel-valg og hendelsen fra en lenke som ikke fantes. */
    val all: List<KEv> get() {
        val o = remO
        val l = data.events.map { e -> if (o.containsKey(e.id)) e.copy(rem = o[e.id]) else e }
        return ext?.let { x -> if (l.none { it.id == x.id }) l + x else l } ?: l
    }
    val visible: List<KEv> get() = all.filter { it.cal !in hid }
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
            if (err?.contains("utløpt") == true) { KalAuth.clear(ctx); session = null; lErr = err }
            changed()
        }
    }

    /** Etter endringer: widgetene og varslene. */
    private fun changed() {
        viewModelScope.launch { runCatching { KalSync.redraw(ctx) } }
        runCatching { KalNotify.reschedule(ctx) }
    }

    /* ---------- Visning ---------- */

    fun setView(k: String) {
        Hap.tick()
        v = k
        if (k == "liste") a = today()
        KalPrefs.setView(ctx, k)
    }

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

    /** Trykk på tittelen zoomer ut: Dag → Uke → Mnd → År. */
    fun titleTap() {
        Hap.tick()
        v = when (v) { "dag", "3d" -> "uke"; "uke" -> "mnd"; "mnd" -> "ar"; "liste" -> "mnd"; else -> "ar" }
        KalPrefs.setView(ctx, v)
    }

    fun openDay(d: LocalDate) { Hap.tick(); v = "dag"; a = d; ensureRange() }
    fun openMonth(d: LocalDate) { Hap.tick(); v = "mnd"; a = d.withDayOfMonth(1); ensureRange() }

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
        val T = today()
        val base = d0 ?: if (v == "mnd" || v == "ar" || v == "liste") T else a
        val nm = nowMin()
        val st = s0 ?: minOf(23 * 60, ((nm + 1 + 29) / 30) * 30)
        nf = KNewForm(d = if (base.isBefore(T)) T else base, s = st, e = e0 ?: minOf(1439, st + 60), cal = writableDefault(), rem = drem)
    }

    /** Personlig, eller første skrivbare kalender fra serveren. */
    private fun writableDefault(): String = cals.firstOrNull { it.id == "p" && it.writable }?.id ?: cals.firstOrNull { it.writable }?.id ?: "p"

    fun closeNew() { Hap.dismiss(); nf = null }

    /** Endrer man starttid, flyttes slutt med samme varighet. */
    fun nfStart(m: Int) { val f = nf ?: return; val dur = maxOf(15, f.e - f.s); nf = f.copy(s = m, e = minOf(1439, m + dur)) }

    fun saveNew() {
        val f = nf ?: return
        if (f.t.isBlank()) return
        val S = f.s; val E = maxOf(S + 15, f.e)
        val e = KEv("u" + System.currentTimeMillis(), f.t.trim(), f.cal, f.d, if (f.all) null else S, if (f.all) null else E,
            loc = f.loc.trim().ifBlank { null }, rem = if (f.all) null else f.rem)
        nf = null
        a = f.d
        add(e, "La til «${e.t}» · " + dl(f.d) + (if (f.all) "" else " " + hm(S)))
    }

    /* ---------- Skrivefeltet (Glimt) ---------- */

    val preview: KParsed? get() {
        val t = ct.trim()
        if (t.length < 3 || isQ(t)) return null
        return parseQuick(t, drem)
    }
    val isQuestion: Boolean get() = ct.trim().length >= 3 && isQ(ct)

    /** Enter / pil i skrivefeltet. */
    fun composerSend() {
        val t = ct.trim()
        if (t.length < 3) return
        if (isQ(t)) { ct = ""; glSend(t); return }
        val p = parseQuick(t, drem)
        // En innlimt melding (SMS/e-post) uten sikkert klokkeslett: Glimt (LLM) i bakgrunnen.
        if (looksPasted(t) && p.s == null) { ct = ""; quick(t); return }
        ct = ""
        val e = KEv("u" + System.currentTimeMillis(), p.t, p.cal, p.d, p.s, p.e, rem = p.rem, src = p.src)
        a = p.d
        add(e, "Glimt la til «${p.t}» · " + dl(p.d) + (if (p.all) "" else " " + hm(p.s ?: 0)))
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
                add(KEv("u" + System.currentTimeMillis(), p.t, p.cal, p.d, p.s, p.e, rem = p.rem, src = p.src), "Glimt la til «${p.t}» · " + dl(p.d))
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
        if (looksPasted(t) && parseQuick(t, drem).s == null) quick(t) else { ct = t; focusComposer++ }
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
        val local = KalAsk(visible, calMap, if (swx) data.wx else emptyMap(), drem).ask(qq)
        glJob = viewModelScope.launch {
            if (local != null) {
                m.steps = local.steps
                local.create?.let { ev ->
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
    private suspend fun glServer(m: KGMsg, qq: String) {
        val s = session
        m.steps = listOf("Spør Glimt", "Leser kalenderen", "Skriver svar")
        if (s == null) { tickSteps(m); stream(m, KalAsk.HELP); return }
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
            tickSteps(m)
            // Eldre server uten Glimt-ruteren: hjelpeteksten som før. Ellers den ekte feilen.
            if (missing || errT == null) { stream(m, KalAsk.HELP); return }
            m.err = true
            m.engine = "feil"
            stream(m, "Glimt fikk ikke svar fra " + (errModel ?: "modellen") + ": " + errT + ".")
            return
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
        (a0.opt("created") as? JSONObject)?.let { c ->
            val ev = parseServerEvent(c.optJSONObject("event") ?: c, calMap)
            m.undoId = ev?.id ?: c.optStrOrNull("id")
            refresh()
        } ?: (a0.opt("created") as? String)?.let { m.undoId = it; refresh() }
        stream(m, (a0.str("text", "txt") ?: KalAsk.HELP).replace("**", ""))
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
        Hap.tick()
        val on = c.id in hid
        hid = if (on) hid - c.id else hid + c.id
        KalPrefs.setHidden(ctx, hid)
        session?.let { s -> viewModelScope.launch { KalRepo.setVisible(s, data, c, on) } }
        changed()
    }

    fun setWeekNo(on: Boolean) { Hap.tick(); sw = on; KalPrefs.setWeekNo(ctx, on) }
    fun setWx(on: Boolean) { Hap.tick(); swx = on; KalPrefs.setWeather(ctx, on); changed() }
    fun setDefRem(r: Int?) { Hap.tick(); drem = r; KalPrefs.setDefRem(ctx, r) }
    fun setTheme(k: String) { Hap.tick(); th = k; KalPrefs.setTheme(ctx, k); KalTheme.apply(ctx, k) }

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
