package no.kristo.finanshub

import android.app.Application
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.ui.Privacy
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLEncoder
import java.time.LocalDate
import java.util.UUID

/**
 * Skjermer. Homelab er forsiden; Finans (Oversikt, Liste, Budsjett, Søk, Mer) og sidene under Mer er «Andre OS»
 * sammen med Matplan og Domener.
 */
enum class Screen(val label: String) {
    Homelab("Homelab"),
    Home("Oversikt"), List("Liste"), Budget("Budsjett"), Search("Søk"), More("Mer"),
    Scan("Kvitteringer"), Fast("Faste utgifter"), Accounts("Kontoer"), Stocks("Aksjer"), Reports("Rapporter"), Import("Import"),
    Sub("Subscription OS"), Folders("Boliger"), Finn("Finn-handler"),
    Mat("Matplan"), Domains("Domener"), Settings("Innstillinger");

    /** Fanelinja for Finans vises (Mer er markert på undersidene). */
    val isFinance get() = this in FINANCE
    val isMorePage get() = this in MORE_PAGES

    companion object {
        val FINANCE = setOf(Home, List, Budget, Search, More, Scan, Fast, Accounts, Stocks, Reports, Import, Sub, Folders, Finn)
        /** Under Mer. Budsjett og Finn er egne faner, men ligger under Mer når de er skjult som fane. */
        val MORE_PAGES = setOf(Scan, Fast, Accounts, Stocks, Reports, Import, Sub, Folders)
        /** Faner i Finans og på Homelab, med ID-ene som lagres i oppsettet. */
        val FIN_TAB = mapOf("home" to Home, "list" to List, "finn" to Finn, "bud" to Budget, "ai" to Search, "mer" to More)
        val HL_TAB = mapOf("hl" to Homelab, "home" to Home, "dom" to Domains, "mat" to Mat)
    }
}

enum class DomTab(val label: String) { Traffic("Trafikk"), Visits("Besøk"), Perf("Ytelse"), Security("Sikkerhet") }

/** Login i to steg: brukernavn og passord, så eventuelt 2FA-kode. */
data class PendingLogin(val server: String, val username: String, val password: String)

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val store = AccountStore(app)
    val prefs = AppPrefs(app)

    /* ---------- Kontoer ---------- */

    var accounts by mutableStateOf(store.load())
        private set
    var activeId by mutableStateOf(store.active() ?: accounts.firstOrNull()?.id)
        private set
    val account: UserAccount? get() = accounts.firstOrNull { it.id == activeId } ?: accounts.firstOrNull()
    val loggedIn get() = account != null
    val server: String get() = account?.server ?: store.lastServer()
    val displayName: String get() = me?.name?.takeIf { it.isNotBlank() } ?: mobileHome?.name?.takeIf { it.isNotBlank() }
        ?: account?.name?.takeIf { it.isNotBlank() } ?: boot?.settings?.name ?: ""

    /** Adressen som faktisk brukes (lokal hjemme, ellers ekstern/standard). */
    var base by mutableStateOf(account?.server ?: "")
        private set
    var route by mutableStateOf("–")
        private set
    var lastSync by mutableStateOf<Long?>(null)
        private set

    var addingAccount by mutableStateOf(false)
    var pending by mutableStateOf<PendingLogin?>(null)
        private set

    /* ---------- App-tilstand ---------- */

    var screen by mutableStateOf(startScreen())
        private set
    /** Hvor tilbakeknappen fører (null = standard for skjermen). */
    private var backTo: Screen? = null
    var boot by mutableStateOf<Boot?>(null)
    var summary by mutableStateOf<Summary?>(null)
    var me by mutableStateOf<Me?>(null)
    var txs by mutableStateOf<List<Tx>?>(null)
    var receipts by mutableStateOf<List<Receipt>?>(null)
    var query by mutableStateOf("")
    var filter by mutableStateOf("")
    var selectedTx by mutableStateOf<Int?>(null)
    var selectedBudget by mutableStateOf<Int?>(null)
    var selectedReceipt by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)
    var jobs by mutableStateOf<List<Job>>(emptyList())
    var uploading by mutableStateOf(0)
    var offline by mutableStateOf<List<Uri>>(emptyList())
        private set
    var menuOpen by mutableStateOf(false)
    var scanSheet by mutableStateOf(false)
    var settingsPage by mutableStateOf<String?>(null)

    /* ---------- Homelab (forsiden) ---------- */

    var mobileHome by mutableStateOf<MobileHome?>(null)
    var homeError by mutableStateOf<String?>(null)
    var layout by mutableStateOf(HomeLayout.DEFAULT)
        private set
    var editHome by mutableStateOf(false)
    var widgetGallery by mutableStateOf(false)
    var history by mutableStateOf<List<String>>(emptyList())
    var suggestions by mutableStateOf<List<String>>(emptyList())
    var todayMeal by mutableStateOf<String?>(null)
    var domainToday by mutableStateOf<Pair<String, Double>?>(null)
    var avatar by mutableStateOf<Bitmap?>(null)
        private set
    private var suggestJob: kotlinx.coroutines.Job? = null

    /* ---------- Finans: søk, redigering og originaler ---------- */

    var ai by mutableStateOf<AiAnswer?>(null)
    var aiQuery by mutableStateOf("")
    var aiBusy by mutableStateOf(false)
    var aiHistory by mutableStateOf<List<String>>(emptyList())
    var editing by mutableStateOf<TxDraft?>(null)
    var original by mutableStateOf<Original?>(null)
    var originalTab by mutableStateOf("receipt")
    var originalTxId by mutableStateOf<Int?>(null)
    var detail by mutableStateOf<DetailInfo?>(null)
    var detailTx by mutableStateOf<List<Tx>?>(null)

    /* ---------- Mer ---------- */

    var recurring by mutableStateOf<List<Recurring>?>(null)
    var stocks by mutableStateOf<Stocks?>(null)
    var stockPeriod by mutableStateOf("1M")
    var report by mutableStateOf<Report?>(null)
    var reportYear by mutableStateOf(false)
    var importUris by mutableStateOf<List<Uri>>(emptyList())
    var importText by mutableStateOf("")
    var importResult by mutableStateOf<ImportResult?>(null)

    /* ---------- Moduler ---------- */

    var week by mutableStateOf<Week?>(null)
    var subs by mutableStateOf<SubList?>(null)
    var folders by mutableStateOf<List<Folder>?>(null)
    var folder by mutableStateOf<FolderDetail?>(null)
    var finn by mutableStateOf<FinnList?>(null)
    /** Åpen Finn-handel (id) og detaljene fra GET /finn/:id. */
    var finnSel by mutableStateOf<Int?>(null)
    var finnDetail by mutableStateOf<FinnDetail?>(null)
    var finnBusy by mutableStateOf<String?>(null)
    var tokens by mutableStateOf<List<TokenInfo>?>(null)
    var tokenError by mutableStateOf<String?>(null)
    var newToken by mutableStateOf<String?>(null)
    var domains by mutableStateOf<List<DomainRef>?>(null)
    var domain by mutableStateOf<String?>(null)
    var analytics by mutableStateOf<Analytics?>(null)
    var domTab by mutableStateOf(DomTab.Traffic)
    var domRange by mutableStateOf("24h")
    var moduleError by mutableStateOf<String?>(null)
    /** «Administrer domener» er åpen. */
    var domainManager by mutableStateOf(false)
    /** Valgt dag i Matplan (indeks 0–6), null = i dag. «Hele uka og alle retter» er åpen. */
    var matDay by mutableStateOf<Int?>(null)
    var matFull by mutableStateOf(false)
    /** Verdenskartet til Domener → Besøk (lastes én gang). */
    var worldMap by mutableStateOf<List<MapCountry>?>(null)
    /** Melding over søkeresultatet, f.eks. at AI er av og vanlig søk ble brukt. */
    var aiNote by mutableStateOf<String?>(null)
    var suggestGroups by mutableStateOf<List<SuggestGroup>>(emptyList())

    /* ---------- Valg (observerbare for Compose) ---------- */

    private var prefTick by mutableStateOf(0)
    fun flag(k: String, def: Boolean = false): Boolean = if (prefTick >= 0) prefs.bool(k, def) else def
    fun option(k: String, def: String): String = if (prefTick >= 0) prefs.str(k, def) else def
    fun optionInt(k: String, def: Int): Int = if (prefTick >= 0) prefs.int(k, def) else def
    fun setPref(k: String, v: Any) {
        prefs.set(k, v); prefTick++
        if (k == AppPrefs.HIDE_AMOUNTS) Privacy.hidden = v == true
        if (k == AppPrefs.START) saveLayout(layout.copy(start = startKey(v.toString())))
    }

    /* ---------- Lås ---------- */

    var locked by mutableStateOf(loggedIn && prefs.bool(AppPrefs.LOCK))
    private var backgroundAt: Long? = null

    fun onBackground() { backgroundAt = System.currentTimeMillis() }
    fun onForeground() {
        val at = backgroundAt ?: return
        backgroundAt = null
        if (loggedIn && prefs.bool(AppPrefs.LOCK) && System.currentTimeMillis() - at >= prefs.int(AppPrefs.LOCK_AFTER, 0) * 60_000L) locked = true
        if (prefs.bool(AppPrefs.HIDE_AMOUNTS)) Privacy.hidden = true
    }

    private val logos = mutableMapOf<String, Bitmap?>()
    private val api get() = Api(base, account?.token)
    private var pollJob: kotlinx.coroutines.Job? = null
    private var jobPoll: kotlinx.coroutines.Job? = null

    init {
        Privacy.hidden = prefs.bool(AppPrefs.HIDE_AMOUNTS)
        layout = localLayout()
        if (loggedIn) refresh()
    }

    private fun startScreen() = when (prefs.str(AppPrefs.START, "homelab")) {
        "home" -> Screen.Home; "list" -> Screen.List; "budget" -> Screen.Budget; else -> Screen.Homelab
    }

    /* ---------- Startside og tilbakevei ---------- */

    /** Startsiden som skjerm: Homelab eller en Finans-fane. */
    val startPage: Screen get() = if (prefTick >= 0) startScreen() else Screen.Homelab
    /** Finans som startside: appen åpner der, og Homelab og modulene ligger i profilmenyen. */
    val financeStart: Boolean get() = startPage != Screen.Homelab
    val startLabel: String get() = if (financeStart) "Finans" else "Homelab"
    fun goStart() = go(startPage)
    /** Knapp i fanelinja i stedet for pil øverst. */
    val homeInBar: Boolean get() = layout.backStyle == "bar"

    /** «‹ Homelab» / «‹ Finans» øverst med profilbildet til høyre på samme rad. null = ingen topprad. */
    fun topRowTitle(compact: Boolean): String? {
        if (editing != null || detail != null || original != null || editHome) return null
        // Matplan er en egen flate uten fanelinje: pilen vises alltid der.
        if (screen == Screen.Mat) return if (matFull) null else startLabel
        if (!compact || layout.backStyle != "arrow") return null
        return when (screen) {
            Screen.Domains -> startLabel
            Screen.Homelab -> if (financeStart) "Finans" else null
            Screen.Home, Screen.List, Screen.Budget, Screen.Search, Screen.More -> if (financeStart || selectedTx != null) null else "Homelab"
            Screen.Finn -> if (financeStart || finnSel != null) null else "Homelab"
            else -> null
        }
    }

    /** Fanenavn fra oppsettet (eget navn eller standard). Nøkler: «fin.<id>» og «hl.<id>». */
    fun finName(s: Screen): String = Screen.FIN_TAB.entries.firstOrNull { it.value == s }?.key?.let { layout.names["fin.$it"] } ?: if (s == Screen.Finn) "Finn" else s.label
    /** Er fanen synlig i fanelinja (Budsjett og Finn vises ellers under Mer)? */
    fun finTabShown(s: Screen): Boolean = s in finTabs
    fun hlName(s: Screen): String = Screen.HL_TAB.entries.firstOrNull { it.value == s }?.key?.let { layout.names["hl.$it"] } ?: if (s == Screen.Home) "Finans" else s.label

    /** Nytt navn på en fane (tomt = standardnavnet). */
    fun rename(key: String, name: String) {
        val n = name.trim()
        saveLayout(layout.copy(names = if (n.isEmpty()) layout.names - key else layout.names + (key to n.take(30))))
    }
    fun setBackStyle(b: String) = saveLayout(layout.copy(backStyle = b))
    fun setMatTheme(t: String) = saveLayout(layout.copy(matTheme = t))

    private fun startKey(p: String) = when (p) { "home" -> "fin-hjem"; "list" -> "fin-liste"; "budget" -> "fin-budsjett"; else -> "homelab" }
    private fun startPref(k: String) = when (k) { "fin-hjem" -> "home"; "fin-liste" -> "list"; "fin-budsjett" -> "budget"; else -> "homelab" }

    private fun launch(block: suspend () -> Unit) = viewModelScope.launch {
        try { block() } catch (e: ApiException) {
            if (e.status == 401 && loggedIn && !e.needsTotp) expired() else message = e.message
        } catch (e: Exception) { message = e.message ?: "Noe gikk galt" }
    }

    /* ---------- Innlogging og kontoer ---------- */

    fun login(url: String, username: String, password: String, code: String? = null) = launch {
        busy = true
        try {
            val srv = Api.normalizeServer(url)
            if (srv.isBlank()) { message = "Skriv inn serveradressen"; return@launch }
            val r = try {
                Api.login(srv, username, password, code, "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            } catch (e: ApiException) {
                if (e.needsTotp) {
                    if (pending != null && !code.isNullOrBlank()) message = e.message ?: "Feil kode"
                    pending = PendingLogin(srv, username, password); return@launch
                }
                throw e
            }
            pending = null
            store.rememberServer(srv)
            // Samme server og bruker erstatter den gamle innloggingen.
            val same = accounts.firstOrNull { it.server == srv && it.username.equals(r.username, true) }
            val acc = UserAccount(same?.id ?: UUID.randomUUID().toString(), srv, r.username, r.name, r.role, r.token, same?.local ?: "", same?.external ?: "")
            accounts = accounts.filter { it.id != acc.id } + acc
            addingAccount = false
            switchTo(acc.id)
            message = "Logget inn som ${r.name}"
        } finally { busy = false }
    }

    fun cancelTotp() { pending = null }

    fun switchTo(id: String) {
        activeId = id
        store.save(accounts, id)
        clearData()
        base = account?.server ?: ""
        menuOpen = false
        screen = startScreen()
        backTo = null
        layout = localLayout()
        refresh()
    }

    /** Logger ut én konto (trekker tilbake tokenet på serveren). */
    fun logout(id: String? = activeId) = launch {
        val a = accounts.firstOrNull { it.id == id } ?: return@launch
        runCatching { Api(if (a.id == activeId) base else a.server, a.token).post("/auth/logout") }
        removeAccount(a.id)
    }

    fun logoutOthers() = launch {
        accounts.filter { it.id != activeId }.forEach { a -> runCatching { Api(a.server, a.token).post("/auth/logout") } }
        accounts = accounts.filter { it.id == activeId }
        store.save(accounts, activeId)
        message = "Andre kontoer er logget ut"
    }

    private fun removeAccount(id: String) {
        accounts = accounts.filter { it.id != id }
        if (activeId == id) {
            val next = accounts.firstOrNull()
            activeId = next?.id
            clearData()
            base = next?.server ?: ""
            layout = localLayout()
            if (next != null) refresh()
        }
        store.save(accounts, activeId)
    }

    private fun expired() {
        val name = account?.name ?: ""
        account?.let { removeAccount(it.id) }
        message = "Innloggingen for $name er utløpt. Logg inn igjen."
    }

    private fun clearData() {
        boot = null; summary = null; me = null; txs = null; receipts = null; jobs = emptyList(); selectedTx = null; selectedReceipt = null
        week = null; subs = null; folders = null; folder = null; finn = null; tokens = null; domains = null; analytics = null; domain = null
        mobileHome = null; homeError = null; history = emptyList(); suggestions = emptyList(); todayMeal = null; domainToday = null; avatar = null
        ai = null; aiHistory = emptyList(); editing = null; original = null; detail = null; detailTx = null
        recurring = null; stocks = null; report = null; importResult = null; importUris = emptyList(); importText = ""
        editHome = false; domainManager = false; matDay = null; matFull = false; aiNote = null; suggestGroups = emptyList()
        logos.clear()
    }

    fun updateAddresses(local: String, external: String) {
        val a = account ?: return
        val n = a.copy(local = local.trim().let { if (it.isBlank()) "" else Api.normalizeServer(it) }, external = external.trim().let { if (it.isBlank()) "" else Api.normalizeServer(it) })
        accounts = accounts.map { if (it.id == n.id) n else it }
        store.save(accounts, activeId)
        refresh()
    }

    /** Velger lokal adresse når den svarer (og «Bruk lokal adresse hjemme» er på), ellers ekstern. */
    private suspend fun resolveBase() {
        val a = account ?: return
        if (prefs.bool(AppPrefs.USE_LOCAL, true) && a.local.isNotBlank() && reachable(a.local, a.token)) { base = a.local; route = "Lokal"; return }
        base = a.external.ifBlank { a.server }
        route = if (Api.isLocalHost(base.substringAfter("://").substringBefore('/').substringBefore(':'))) "Lokal" else "Ekstern"
    }

    private suspend fun reachable(url: String, token: String?): Boolean = try {
        Api(url, token).request("GET", "/me", timeout = 1500); true
    } catch (e: ApiException) { e.status > 0 }

    fun testConnection(url: String) = launch {
        val u = Api.normalizeServer(url.ifBlank { base })
        val t0 = System.currentTimeMillis()
        val ok = reachable(u, account?.token)
        message = if (ok) "Svar fra ${u.substringAfter("://")} på ${System.currentTimeMillis() - t0} ms" else "Fikk ikke kontakt med ${u.substringAfter("://")}"
    }

    /* ---------- Data ---------- */

    fun refresh() = launch {
        resolveBase()
        boot = parseBoot(api.get("/bootstrap"))
        summary = runCatching { parseSummary(api.get("/summary")) }.getOrNull() ?: summary
        loadMe()
        lastSync = System.currentTimeMillis()
        if (offline.isNotEmpty() && canUpload()) { val q = offline; offline = emptyList(); uploadUris(q) }
        loadFor(screen)
        if (screen != Screen.Homelab) launch { loadHome() }
    }

    private suspend fun loadMe() {
        val fin = runCatching { parseMe(api.get("/me")) }.getOrNull()
        // Profilbilde og servernavn kommer fra Homelab hvis FinansHub ikke sender dem.
        val hl = if (fin?.avatarUrl == null) runCatching { parseMe(api.hlGet("/me")) }.getOrNull() else null
        val m = when {
            fin == null -> hl
            hl == null -> fin
            else -> fin.copy(avatarUrl = hl.avatarUrl, serverName = fin.serverName ?: hl.serverName, isMainAdmin = fin.isMainAdmin || hl.isMainAdmin)
        }
        me = m
        val a = account
        if (m != null && a != null && (a.name != m.name || a.username != m.username) && m.username.isNotBlank()) {
            accounts = accounts.map { if (it.id == a.id) it.copy(name = m.name, username = m.username, role = m.role) else it }
            store.save(accounts, activeId)
        }
        loadAvatar(m?.avatarUrl ?: mobileHome?.avatarUrl)
    }

    private suspend fun loadAvatar(url: String?) {
        avatar = if (url.isNullOrBlank()) null else image(url)
    }

    private suspend fun loadFor(s: Screen) {
        moduleError = null
        try {
            when (s) {
                Screen.Homelab -> loadHome()
                Screen.Home -> summary = parseSummary(api.get("/summary"))
                Screen.List, Screen.Budget -> if (txs == null || s == Screen.List) loadTx()
                Screen.Search -> { loadAiHistory(); loadSuggestGroups() }
                Screen.More -> loadMore()
                Screen.Scan -> { loadReceipts(); loadJobs() }
                Screen.Fast -> recurring = parseRecurring(api.get("/recurring"))
                Screen.Accounts -> boot = parseBoot(api.get("/bootstrap"))
                Screen.Stocks -> stocks = parseStocks(api.get("/stocks"))
                Screen.Reports -> loadReport()
                Screen.Mat -> loadWeek()
                Screen.Sub -> subs = parseSubs(api.get("/subscriptions"))
                Screen.Folders -> folders = parseFolders(api.get("/folders"))
                Screen.Finn -> { finn = parseFinn(api.get("/finn")); finnSel?.let { loadFinnDetail(it) } }
                Screen.Domains -> loadDomains()
                else -> {}
            }
        } catch (e: ApiException) {
            if (e.status == 401 || e.status == 403) moduleError = "${s.label} er ikke tilgjengelig for denne kontoen (${e.message})."
            else if (e.status == 404) moduleError = "${s.label} finnes ikke på serveren ennå. Oppdater homelab."
            else throw e
        }
    }

    /** Fanebytte (fanelinje, meny): ingen egen tilbakevei. */
    fun go(s: Screen) = navigate(s, null)

    /** Underside (f.eks. fra Mer): tilbakeknappen fører hit igjen. */
    fun open(s: Screen) = navigate(s, screen)

    private fun navigate(s: Screen, from: Screen?) {
        if (s != screen) { selectedTx = null; folder = null; detail = null; detailTx = null; editing = null; original = null; editHome = false; matFull = false; matDay = null }
        // Trykk på Finn-fanen fra en åpen handel går tilbake til listen.
        if (s != screen || s == Screen.Finn) { finnSel = null; finnDetail = null }
        backTo = from?.takeIf { it != s }
        screen = s
        menuOpen = false
        launch { loadFor(s) }
    }

    /** Tilbake: lukker det som er åpent, ellers til forrige side (undersider av Mer → Mer, Finans og moduler → Homelab). */
    fun back(): Boolean {
        when {
            original != null -> original = null
            editing != null -> editing = null
            detail != null -> { detail = null; detailTx = null }
            editHome -> editHome = false
            screen == Screen.Settings && settingsPage != null -> settingsPage = null
            screen == Screen.Folders && folder != null -> folder = null
            screen == Screen.Scan && selectedReceipt != null -> selectedReceipt = null
            screen == Screen.Finn && finnSel != null -> { finnSel = null; finnDetail = null }
            selectedTx != null -> selectedTx = null
            screen == Screen.Domains && domainManager -> domainManager = false
            screen == Screen.Mat && matFull -> matFull = false
            screen == startPage && backTo == null -> return false
            else -> navigate(backTo ?: if (screen.isMorePage || (screen in setOf(Screen.Finn, Screen.Budget) && !finTabShown(screen))) Screen.More else startPage, null)
        }
        return true
    }

    suspend fun loadTx() {
        val p = buildList {
            if (query.isNotBlank()) add("q=" + URLEncoder.encode(query, "UTF-8"))
            if (filter.isNotBlank()) add("type=$filter")
        }.joinToString("&")
        txs = parseTxList(api.get("/transactions?$p"))
    }

    fun search() = launch { loadTx() }

    suspend fun loadReceipts() {
        val list = parseReceipts(api.get("/receipts?status=queue"))
        receipts = list
        if (selectedReceipt != null && list.none { it.id == selectedReceipt }) selectedReceipt = null
        if (list.any { it.status == "pending" || it.status == "processing" }) {
            if (pollJob?.isActive != true) pollJob = viewModelScope.launch { delay(2000); pollJob = null; runCatching { loadReceipts() } }
        }
    }

    fun updateReceipt(id: String, field: String, value: Any?) = launch {
        val r = parseReceipt(JSONObject(api.patch("/receipts/$id", JSONObject().put(field, value ?: JSONObject.NULL))))
        receipts = receipts?.map { if (it.id == id) r else it }
    }

    fun book(id: String) = launch { api.post("/receipts/$id/book"); message = "Bokført ✓"; afterReceiptAction(id) }
    fun reject(id: String) = launch { api.post("/receipts/$id/reject"); message = "Kvittering avvist"; afterReceiptAction(id) }

    private suspend fun afterReceiptAction(id: String) {
        selectedReceipt = receipts?.firstOrNull { it.id != id && it.status == "needs_review" }?.id
        loadReceipts()
        boot = parseBoot(api.get("/bootstrap"))
        summary = parseSummary(api.get("/summary"))
    }

    fun setTxCategory(id: Int, categoryId: Int) = launch {
        api.patch("/transactions/$id", JSONObject().put("categoryId", categoryId))
        loadTx(); summary = parseSummary(api.get("/summary"))
        message = "Kategori endret"
    }

    fun saveSetting(key: String, value: Any) = launch {
        api.put("/settings", JSONObject().put(key, value))
        boot = parseBoot(api.get("/bootstrap"))
    }

    /* ---------- Homelab: forside, søk og oppsett ---------- */

    suspend fun loadHome() {
        homeError = null
        // Feil her logger aldri ut: finans-tokenet kan være gyldig selv om en eldre server ikke kjenner forsiden.
        try { mobileHome = parseMobileHome(api.hlGet("/mobile/home")) } catch (e: ApiException) {
            homeError = when (e.status) {
                404 -> "Homelab-forsiden finnes ikke på serveren ennå. Oppdater homelab."
                401, 403 -> "Homelab godtar ikke app-tokenet ennå. Oppdater homelab-serveren."
                else -> e.message
            }
        }
        if (summary == null) summary = runCatching { parseSummary(api.get("/summary")) }.getOrNull()
        if (prefs.str(AppPrefs.LAYOUT + (account?.id ?: ""), "").isBlank()) {
            val l = mobileHome?.layout ?: runCatching { parseLayout(api.hlGet("/me/layout")) }.getOrNull()
            if (l != null) {
                layout = l
                l.start?.let { st -> if (startPref(st) != prefs.str(AppPrefs.START, "homelab")) { prefs.set(AppPrefs.START, startPref(st)); prefTick++ } }
            }
        }
        history = runCatching { parseStrings(api.hlGet("/search/history")) }.getOrDefault(history)
        todayMeal = runCatching {
            val w = parseWeek(api.matGet("/week"))
            w.days.firstOrNull { it.date == LocalDate.now().toString() }?.name
        }.getOrNull()
        domainToday = runCatching {
            val d = parseDomains(api.domGet("/domains")).firstOrNull() ?: return@runCatching null
            val a = parseAnalytics(api.domGet("/" + URLEncoder.encode(d.name, "UTF-8") + "/analytics?range=today"))
            d.name to a.visitors
        }.getOrNull()
        if (avatar == null) loadAvatar(me?.avatarUrl ?: mobileHome?.avatarUrl)
    }

    private fun localLayout(): HomeLayout {
        val raw = prefs.str(AppPrefs.LAYOUT + (account?.id ?: ""), "")
        return if (raw.isBlank()) HomeLayout.DEFAULT else runCatching { HomeLayout.from(JSONObject(raw)) }.getOrDefault(HomeLayout.DEFAULT)
    }

    /** Lagres lokalt (per bruker og enhet) og på serveren. */
    fun saveLayout(l: HomeLayout) {
        layout = l
        prefs.set(AppPrefs.LAYOUT + (account?.id ?: ""), l.toJson().toString())
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("mobile", l.toJson())) } }
    }

    fun setHidden(id: String, hidden: Boolean) = saveLayout(layout.copy(hide = layout.hide + (id to hidden)))

    /** Flytter en seksjon eller fane ett hakk opp (-1) eller ned (+1). */
    fun move(list: String, id: String, dir: Int) {
        fun mv(l: List<String>): List<String> {
            val i = l.indexOf(id)
            val j = i + dir
            if (i < 0 || j < 0 || j >= l.size) return l
            return l.toMutableList().also { val t = it[i]; it[i] = it[j]; it[j] = t }
        }
        saveLayout(when (list) {
            "sec" -> layout.copy(sec = mv(layout.sec))
            "hlTabs" -> layout.copy(hlTabs = mv(layout.hlTabs))
            else -> layout.copy(finTabs = mv(layout.finTabs))
        })
    }

    fun resetLayout() = saveLayout(HomeLayout.DEFAULT)

    /** Faner som vises (skjulte fjernes, faste kan ikke skjules). */
    val hlTabs: List<Screen> get() = layout.hlTabs.filter { it in HomeLayout.FIXED_HL || layout.visible(it) }.mapNotNull { Screen.HL_TAB[it] }
    val finTabs: List<Screen> get() = layout.finTabs.filter { it in HomeLayout.FIXED_FIN || layout.visible(it) }.mapNotNull { Screen.FIN_TAB[it] }

    /** Google-forslag mens man skriver (150 ms debounce, via serveren). */
    fun suggest(q: String) {
        suggestJob?.cancel()
        if (q.isBlank()) { suggestions = emptyList(); return }
        suggestJob = viewModelScope.launch {
            delay(150)
            suggestions = runCatching { parseStrings(api.hlGet("/search/suggest?q=" + URLEncoder.encode(q, "UTF-8"), timeout = 3000)).take(8) }.getOrDefault(emptyList())
        }
    }

    /** Returnerer adressen som skal åpnes: adresser (f.eks. vg.no) åpnes direkte, resten søkes på Google. */
    fun googleUrl(q: String): String {
        val t = q.trim()
        val looksLikeUrl = t.startsWith("http://") || t.startsWith("https://") || (!t.contains(' ') && Regex("""^[\w-]+(\.[\w-]+)+(:\d+)?(/\S*)?$""").matches(t))
        if (t.isNotBlank()) viewModelScope.launch {
            runCatching { api.hlPost("/search/history", JSONObject().put("q", t)) }
            history = (listOf(t) + history.filter { it != t }).take(100)
        }
        suggestions = emptyList()
        return when {
            t.startsWith("http://") || t.startsWith("https://") -> t
            looksLikeUrl -> "https://$t"
            else -> "https://www.google.com/search?q=" + URLEncoder.encode(t, "UTF-8")
        }
    }

    fun removeHistory(q: String) = launch {
        history = history.filter { it != q }
        api.hlDelete("/search/history/" + URLEncoder.encode(q, "UTF-8").replace("+", "%20"))
    }

    fun clearHistory() = launch { history = emptyList(); api.hlDelete("/search/history"); message = "Søkehistorikken er tømt" }

    /* ---------- Profilbilde ---------- */

    /** Beskjæres til kvadrat, skaleres til 256 × 256 og lagres som JPEG (kvalitet 0,85). */
    fun uploadAvatar(uri: Uri) = launch {
        busy = true
        try {
            val ctx = getApplication<Application>()
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val jpeg = withContext(Dispatchers.Default) { squareJpeg(data, 256, 85) } ?: run { message = "Kunne ikke lese bildet"; return@launch }
            api.upload("/me/avatar", listOf(Api.Part("file", "avatar.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB)
            avatar = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
            loadMe()
            message = "Profilbildet er oppdatert"
        } finally { busy = false }
    }

    fun removeAvatar() = launch {
        api.hlDelete("/me/avatar")
        avatar = null
        loadMe()
        message = "Profilbildet er fjernet"
    }

    private fun squareJpeg(data: ByteArray, size: Int, quality: Int): ByteArray? = runCatching {
        val bmp = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return null
        val rot = rotation(data)
        val side = minOf(bmp.width, bmp.height)
        val m = Matrix().apply { postScale(size.toFloat() / side, size.toFloat() / side); postRotate(rot) }
        val out = Bitmap.createBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, m, true)
        ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, quality, o); o.toByteArray() }
    }.getOrNull()

    private fun rotation(data: ByteArray): Float = runCatching {
        when (ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    }.getOrDefault(0f)

    /* ---------- ✦ AI-søk ---------- */

    /** «ai» eller «plain» (Vanlig søk). Lagres per enhet. */
    val searchMode: String get() = option(AppPrefs.SEARCH_MODE, "ai")

    /** Søk: ✦ AI først (med mindre Vanlig søk er valgt). Er AI av eller nede, brukes vanlig søk med en melding om det. */
    fun ask(q: String) {
        val t = q.trim()
        if (t.isBlank()) return
        aiQuery = t
        aiBusy = true
        aiNote = null
        launch {
            try {
                ai = if (searchMode == "plain") plainSearch(t) else {
                    val a = try { parseAi(api.request("POST", "/search/ai", JSONObject().put("q", t), timeout = 25_000), t) } catch (e: ApiException) {
                        if (e.status == 401) throw e
                        null
                    } catch (e: Exception) { null }
                    if (a == null || a.aiUnavailable) {
                        aiNote = "AI-søket er ikke tilgjengelig nå. Viser vanlig søk."
                        plainSearch(t)
                    } else a
                }
                aiHistory = (listOf(t) + aiHistory.filter { it != t }).take(20)
                loadAiHistory()
            } finally { aiBusy = false }
        }
    }

    /** Vanlig søk (GET /search). Eldre servere uten /search: søk i transaksjonene. */
    private suspend fun plainSearch(q: String): AiAnswer {
        val enc = URLEncoder.encode(q, "UTF-8")
        return try { parsePlain(api.get("/search?q=$enc"), q) } catch (e: ApiException) {
            if (e.status != 404) throw e
            val list = parseTxList(api.get("/transactions?limit=30&q=$enc"))
            AiAnswer(q, if (list.isEmpty()) "Ingen treff." else "${list.size} treff i transaksjonene.",
                list.map { SearchHit("tx", it.id, it.receiptId, it.description, it.date, it.amount, it.source, it.category.takeIf(String::isNotBlank)?.let { c -> "Kategori · $c" }) },
                null, emptyList(), mode = "plain")
        }
    }

    private suspend fun loadSuggestGroups() {
        if (suggestGroups.isEmpty()) runCatching { parseSuggestGroups(api.get("/search/suggestions")) }.getOrNull()?.let { suggestGroups = it }
    }

    private suspend fun loadAiHistory() {
        runCatching { parseStrings(api.get("/search/history")) }.getOrNull()?.let { aiHistory = it.take(20) }
    }

    fun clearAiHistory() = launch { aiHistory = emptyList(); runCatching { api.delete("/search/history") } }

    /** Åpner transaksjonen fra et treff (søk, Mer-detaljer). hint = beskrivelsen, brukes til å finne den i listen. */
    fun showTx(id: Int, hint: String? = null) = launch {
        val known = txs?.any { it.id == id } == true || summary?.recent?.any { it.id == id } == true || detailTx?.any { it.id == id } == true
        if (!known) {
            val found = runCatching { parseTxOne(api.get("/transactions/$id")) }.getOrNull()
                ?: hint?.let { h -> runCatching { parseTxList(api.get("/transactions?limit=50&q=" + URLEncoder.encode(h, "UTF-8"))) }.getOrNull()?.firstOrNull { it.id == id } }
            found?.let { t -> txs = (txs ?: emptyList()).filter { it.id != t.id } + t }
        }
        selectedTx = id
    }

    /** Alle transaksjoner som er lastet (liste, siste, detaljlister). */
    val txPool: List<Tx> get() = (txs ?: emptyList()) + (summary?.recent ?: emptyList()) + (detailTx ?: emptyList())

    /* ---------- Transaksjoner: legg til, rediger, slett ---------- */

    fun newTx() {
        if (folders == null) launch { folders = runCatching { parseFolders(api.get("/folders")) }.getOrNull() }
        editing = TxDraft(null, false, "", "", LocalDate.now().toString(), null, boot?.accounts?.firstOrNull()?.id, null, "", null)
    }

    fun editTx(t: Tx) {
        if (folders == null) launch { folders = runCatching { parseFolders(api.get("/folders")) }.getOrNull() }
        editing = TxDraft(t.id, t.amount > 0, t.description, String.format(java.util.Locale("nb", "NO"), "%.2f", kotlin.math.abs(t.amount)), t.date, t.categoryId, t.accountId,
            t.folderId ?: folders?.firstOrNull { it.name == t.folder }?.id, t.note, t.receipt)
    }

    fun saveTx(d: TxDraft) {
        val a = d.amount.replace(" ", "").replace(" ", "").replace(',', '.').toDoubleOrNull()
        if (d.description.isBlank() || a == null || a == 0.0) { message = "Skriv beskrivelse og beløp"; return }
        if (!Regex("""^\d{4}-\d{2}-\d{2}$""").matches(d.date)) { message = "Dato må skrives som ÅÅÅÅ-MM-DD"; return }
        launch {
            busy = true
            try {
                val body = JSONObject().put("type", if (d.income) "income" else "expense").put("description", d.description.trim())
                    .put("amount", kotlin.math.abs(a)).put("date", d.date).put("note", d.note)
                    .put("categoryId", d.categoryId ?: JSONObject.NULL).put("accountId", d.accountId ?: JSONObject.NULL).put("folderId", d.folderId ?: JSONObject.NULL)
                val res = if (d.id == null) api.post("/transactions", body) else api.patch("/transactions/${d.id}", body)
                val id = parseTxOne(res)?.id ?: d.id
                editing = null
                loadTx()
                summary = parseSummary(api.get("/summary"))
                if (id != null) selectedTx = id
                message = if (d.id == null) "Transaksjon lagt til" else "Endringer lagret"
            } finally { busy = false }
        }
    }

    fun deleteTx(id: Int) = launch {
        api.delete("/transactions/$id")
        editing = null
        selectedTx = null
        txs = txs?.filter { it.id != id }
        summary = parseSummary(api.get("/summary"))
        message = "Transaksjonen er slettet"
    }

    /* ---------- Original kvittering og banktransaksjon ---------- */

    fun openOriginal(txId: Int, tab: String) = launch {
        originalTab = tab
        originalTxId = txId
        original = parseOriginal(api.get("/transactions/$txId/original"))
    }

    suspend fun bytes(path: String): ByteArray? = runCatching { api.bytes(path) }.getOrNull()

    /** Lagrer en midlertidig kopi og åpner delingsarket. */
    fun shareFile(name: String, mime: String, data: ByteArray) {
        val ctx = getApplication<Application>()
        val f = File(File(ctx.cacheDir, "scans").apply { mkdirs() }, name).apply { writeBytes(data) }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        ctx.startActivity(Intent.createChooser(send, "Del").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** «Last ned»: skriver filen dit brukeren valgte i Filer. */
    fun writeTo(uri: Uri, data: ByteArray) = launch {
        withContext(Dispatchers.IO) { getApplication<Application>().contentResolver.openOutputStream(uri)?.use { it.write(data) } }
        message = "Lagret"
    }

    /* ---------- Mer ---------- */

    /* ---------- Finn-handler (design 2a) ---------- */

    fun openFinn(id: Int) {
        finnSel = id
        finnDetail = finn?.items?.firstOrNull { it.id == id }?.let { FinnDetail(it, null, emptyList(), emptyList(), emptyList(), it.summary, emptyList()) }
        launch { loadFinnDetail(id) }
    }

    private suspend fun loadFinnDetail(id: Int) {
        try { val d = parseFinnDetail(api.get("/finn/$id")); if (finnSel == id) finnDetail = d }
        catch (e: ApiException) { if (e.status != 404) throw e } // Eldre server uten detaljside: listedataene vises.
    }

    /**
     * Laster opp filer til handelen: «receipts» (PDF/bilde/.eml) og «photos» (bilder) går til POST /finn/:id/files med kind,
     * «emails» (.eml) til POST /finn/:id/emails. Filene ligger i feltet «file», og svaret er hele handelen.
     */
    fun finnUpload(kind: String, uris: List<Uri>) {
        val id = finnSel ?: return
        if (uris.isEmpty()) return
        launch {
            val ctx = getApplication<Application>()
            finnBusy = kind
            try {
                val parts = withContext(Dispatchers.IO) {
                    uris.mapNotNull { u ->
                        val name = fileName(u) ?: "fil"
                        val mime = ctx.contentResolver.getType(u) ?: if (name.endsWith(".eml", true)) "message/rfc822" else "application/octet-stream"
                        ctx.contentResolver.openInputStream(u)?.use { Api.Part("file", name, mime, it.readBytes()) }
                    }
                }
                val res = if (kind == "emails") api.upload("/finn/$id/emails", parts)
                    else api.upload("/finn/$id/files", parts + Api.Part.text("kind", if (kind == "photos") "photo" else "receipt"))
                message = when (kind) {
                    "photos" -> if (parts.size == 1) "1 bilde lagt til" else "${parts.size} bilder lagt til"
                    "emails" -> "E-posten er lagt ved"
                    else -> if (parts.size == 1) "Kvitteringen er lagt ved" else "Kvitteringene er lagt ved"
                }
                finnDetail = runCatching { parseFinnDetail(res) }.getOrNull()?.takeIf { it.deal.id == id } ?: finnDetail
                if (finnDetail?.deal?.id != id) loadFinnDetail(id)
                runCatching { finn = parseFinn(api.get("/finn")) }
            } catch (e: ApiException) {
                message = if (e.status == 404) "Serveren støtter ikke opplasting til Finn-handler ennå. Oppdater homelab." else e.message
            } finally { finnBusy = null }
        }
    }

    fun finnRemove(kind: String, fileId: String) {
        val id = finnSel ?: return
        launch {
            // Kvitteringer og bilder er filer i handelen; e-postene har egen rute.
            val res = api.delete("/finn/$id/${if (kind == "emails") "emails" else "files"}/" + URLEncoder.encode(fileId, "UTF-8"))
            finnDetail = runCatching { parseFinnDetail(res) }.getOrNull()?.takeIf { it.deal.id == id } ?: finnDetail
            if (finnDetail?.deal?.id != id) loadFinnDetail(id)
        }
    }

    /** ✦ Hent annonsen fra finn.no (serveren henter tittel, pris, sted, beskrivelse og bildene og lagrer dem). */
    fun finnFetchAd(url: String? = null) {
        val id = finnSel ?: return
        if (finnBusy != null) return
        launch {
            finnBusy = "ad"
            try {
                val res = api.post("/finn/$id/ad", JSONObject().apply { url?.takeIf { it.isNotBlank() }?.let { put("url", it.trim()) } })
                finnDetail = runCatching { parseFinnDetail(res) }.getOrNull()?.takeIf { it.deal.id == id } ?: run { loadFinnDetail(id); finnDetail }
                message = runCatching { JSONObject(res).optStr("message") }.getOrNull()
                    ?: ("✦ Annonsen er lagret" + (finnDetail?.ad?.images?.size?.takeIf { it > 0 }?.let { " med $it bilder" } ?: ""))
            } catch (e: ApiException) {
                message = if (e.status == 404) "Serveren kan ikke hente annonser ennå. Oppdater homelab." else e.message
            } finally { finnBusy = null }
        }
    }

    private suspend fun loadMore() {
        runCatching { boot = parseBoot(api.get("/bootstrap")) }
        runCatching { recurring = parseRecurring(api.get("/recurring")) }
        runCatching { subs = parseSubs(api.get("/subscriptions")) }
        runCatching { folders = parseFolders(api.get("/folders")) }
        runCatching { finn = parseFinn(api.get("/finn")) }
        runCatching { stocks = parseStocks(api.get("/stocks")) }
    }

    fun openDetail(info: DetailInfo) {
        detail = info
        detailTx = null
        val q = info.txQuery ?: return
        launch { detailTx = parseTxList(api.get("/transactions?limit=30&q=" + URLEncoder.encode(q, "UTF-8"))) }
    }

    fun setRecurringActive(r: Recurring, active: Boolean) = launch {
        api.patch("/recurring/${r.id}", JSONObject().put("active", active))
        recurring = parseRecurring(api.get("/recurring"))
    }

    fun syncStocks() = launch {
        busy = true
        try { stocks = parseStocks(api.post("/stocks/sync")); message = "Synket med Trading 212" } finally { busy = false }
    }

    private suspend fun loadReport() { report = parseReport(api.get("/reports?mode=" + if (reportYear) "year" else "month")) }
    fun pickReportYear(y: Boolean) { reportYear = y; report = null; launch { loadReport() } }

    /** Kontoutskrift: filer (CSV, XLSX, tekst) og/eller innlimt tekst → forhåndsvisning → importer. */
    fun runImport(commit: Boolean) = launch {
        val ctx = getApplication<Application>()
        if (importUris.isEmpty() && importText.isBlank()) { message = "Velg filer eller lim inn tekst"; return@launch }
        busy = true
        try {
            val parts = mutableListOf<Api.Part>()
            withContext(Dispatchers.IO) {
                importUris.forEach { u ->
                    val name = fileName(u) ?: "kontoutskrift.csv"
                    val mime = ctx.contentResolver.getType(u) ?: "application/octet-stream"
                    ctx.contentResolver.openInputStream(u)?.use { parts += Api.Part("files", name, mime, it.readBytes()) }
                }
            }
            if (importText.isNotBlank()) parts += Api.Part.text("text", importText)
            val r = parseImport(api.upload("/import" + if (commit) "?commit=1" else "", parts))
            importResult = r
            if (commit) {
                message = "${r.imported} poster importert"
                importUris = emptyList(); importText = ""; importResult = null
                txs = null
                summary = parseSummary(api.get("/summary"))
            }
        } finally { busy = false }
    }

    fun fileName(u: Uri): String? = runCatching {
        getApplication<Application>().contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull()

    /* ---------- Opplasting ---------- */

    private fun canUpload(): Boolean {
        if (!prefs.bool(AppPrefs.WIFI_ONLY)) return true
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    /** Flere filer legges i kø og lastes opp én og én; AI-en leser dem i bakgrunnen på serveren. Uten nett (eller utenfor Wi-Fi) venter de. */
    fun uploadUris(uris: List<Uri>) {
        if (uris.isEmpty()) return
        // Skann/opplasting inne i en bolig: kvitteringen havner i valgt bolig, og AI velger kategori og underkategori.
        val bolig = if (screen == Screen.Folders && editing == null) (uploadFolder ?: folder?.folder?.id) else null
        if (bolig != null) {
            val name = folders?.firstOrNull { it.id == bolig }?.name ?: folder?.folder?.name ?: "boligen"
            message = if (uris.size == 1) "Kvitteringen lastes opp til $name" else "${uris.size} kvitteringer lastes opp til $name"
            uploading += uris.size
            launch {
                try {
                    for (u in uris) {
                        try { uploadOne(u, "/folders/$bolig/receipts") } catch (e: ApiException) { message = e.message }
                        finally { uploading = maxOf(0, uploading - 1) }
                    }
                } finally { folder?.let { runCatching { folder = parseFolderDetail(api.get("/folders/${it.folder.id}")) } } }
            }
            return
        }
        // Fra «Legg ved kvittering» i skjemaet: bli stående, kvitteringen kobles når den bokføres.
        if (editing != null) message = "Kvitteringen er lagt i opplastingskøen"
        else if (screen != Screen.Scan) this.open(Screen.Scan)
        if (!canUpload()) { offline = offline + uris; message = "${uris.size} kvittering(er) venter på Wi-Fi"; return }
        uploading += uris.size
        launch {
            try {
                for (u in uris) {
                    try { uploadOne(u) } catch (e: ApiException) {
                        if (e.status == 0) offline = offline + u // uten nett: prøv igjen ved neste synk
                        message = e.message
                    } finally { uploading = maxOf(0, uploading - 1) }
                }
            } finally { loadReceipts(); loadJobs() }
        }
    }

    fun uploadUri(uri: Uri) = uploadUris(listOf(uri))

    suspend fun loadJobs() {
        jobs = runCatching { parseJobs(api.get("/receipts/jobs")) }.getOrDefault(jobs)
        if (jobs.any { it.status == "pending" || it.status == "processing" } || uploading > 0) {
            if (jobPoll?.isActive != true) jobPoll = viewModelScope.launch {
                delay(2000); jobPoll = null
                runCatching { loadJobs(); if (jobs.none { it.status == "pending" || it.status == "processing" }) { loadReceipts(); summary = parseSummary(api.get("/summary")) } }
            }
        }
    }

    private suspend fun uploadOne(uri: Uri, path: String = "/receipts") {
        val ctx = getApplication<Application>()
        val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
        val original = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
        val image = mime.startsWith("image/")
        val parts = mutableListOf<Api.Part>()
        // «Lagre originalbildet» av: send bare skanneversjonen som fil.
        val scan = if (image) withContext(Dispatchers.Default) { scaled(original, 1600, 85) } else null
        if (!image || prefs.bool(AppPrefs.KEEP_ORIGINAL, true) || scan == null) parts += Api.Part("file", if (mime == "application/pdf") "kvittering.pdf" else "kvittering.jpg", mime, original)
        else parts += Api.Part("file", "kvittering.jpg", "image/jpeg", scan)
        if (image) withContext(Dispatchers.Default) {
            scan?.let { parts += Api.Part("scan", "scan.jpg", "image/jpeg", it) }
            scaled(original, 240, 75)?.let { parts += Api.Part("thumb", "thumb.jpg", "image/jpeg", it) }
        }
        val r = runCatching { parseReceipt(JSONObject(api.upload(path, parts))) }
        r.exceptionOrNull()?.let { if (it is ApiException) throw it }
        loadJobs()
    }

    suspend fun logo(domain: String?): Bitmap? {
        if (domain.isNullOrBlank()) return null
        if (logos.containsKey(domain)) return logos[domain]
        val b = image("/finans/api/logo/" + URLEncoder.encode(domain, "UTF-8"))
        logos[domain] = b
        return b
    }

    /** Favicon for en snarvei (Googles favicon-tjeneste, som i designet). */
    suspend fun favicon(url: String): Bitmap? {
        val host = runCatching { Uri.parse(url).host }.getOrNull() ?: return null
        val key = "fav:$host"
        if (logos.containsKey(key)) return logos[key]
        val b = runCatching {
            withContext(Dispatchers.IO) {
                val c = java.net.URL("https://www.google.com/s2/favicons?sz=64&domain=" + URLEncoder.encode(host, "UTF-8")).openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 4000; c.readTimeout = 4000
                try { c.inputStream.use { it.readBytes() } } finally { c.disconnect() }
            }.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        }.getOrNull()
        logos[key] = b
        return b
    }

    suspend fun image(path: String): Bitmap? = runCatching {
        val b = api.bytes(path)
        withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(b, 0, b.size) }
    }.getOrNull()

    private fun scaled(data: ByteArray, max: Int, quality: Int): ByteArray? = runCatching {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, opts)
        var sample = 1
        while (maxOf(opts.outWidth, opts.outHeight) / (sample * 2) >= max) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val rot = rotation(data)
        val s = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
        val m = Matrix().apply { postScale(s, s); postRotate(rot) }
        val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, quality, o); o.toByteArray() }
    }.getOrNull()

    /* ---------- Matplan ---------- */

    suspend fun loadWeek() { week = parseWeek(api.matGet("/week")) }

    fun planWeek() = launch {
        busy = true
        try { api.matPost("/plan", JSONObject().put("scope", "week")); loadWeek(); message = "Ny ukeplan klar ✦" } finally { busy = false }
    }
    fun planDay(date: String) = launch { api.matPost("/plan", JSONObject().put("scope", "day").put("date", date)); loadWeek() }
    fun setCook(date: String, cook: String) = launch { api.matPatch("/day/$date", JSONObject().put("cook", cook)); loadWeek() }
    fun toggleFixed(d: Day) = launch { api.matPatch("/day/${d.date}", JSONObject().put("fixed", !d.fixed)); loadWeek() }
    fun toggleShop(id: String) = launch { api.matPost("/shopping/$id/toggle"); loadWeek() }
    /** Legger ingrediensene som mangler i handlelisten. */
    fun addToShop(items: List<String>) = launch {
        val have = week?.shopping?.map { it.text.lowercase() }?.toSet() ?: emptySet()
        val add = items.filter { it.lowercase() !in have }
        for (i in add) api.matPost("/shopping", JSONObject().put("text", i).apply { week?.start?.takeIf(String::isNotBlank)?.let { put("start", it) } })
        loadWeek()
        message = if (add.isEmpty()) "Alt står allerede i handlelisten" else "${add.size} lagt i handlelisten"
    }

    /* ---------- Subscription OS ---------- */

    fun addSub(name: String, plan: String, price: String, cycle: String, next: String) = launch {
        api.post("/subscriptions", JSONObject().put("name", name).put("plan", plan).put("price", price.replace(" ", "").replace(',', '.')).put("cycle", cycle).put("nextDate", next))
        subs = parseSubs(api.get("/subscriptions")); message = "$name lagt til"
    }
    fun setSubActive(s: Sub, active: Boolean) = launch {
        api.patch("/subscriptions/${s.id}", JSONObject().put("active", active))
        subs = parseSubs(api.get("/subscriptions"))
    }

    /* ---------- Boliger (delte mapper) ---------- */

    fun openFolder(id: Int?) = launch { uploadFolder = null; folder = if (id == null) null else parseFolderDetail(api.get("/folders/$id")) }
    /** Boligkategorier med underkategorier (Innstillinger → Boliger på PC). Tom liste på eldre servere. */
    var boligCats by mutableStateOf<List<BoligCategory>>(emptyList())
    /** «Legg i bolig»: målet for skann og opplasting mens man står i Boliger (null = boligen som er åpen). */
    var uploadFolder by mutableStateOf<Int?>(null)

    fun loadBoligCategories() = launch {
        boligCats = runCatching { parseBoligCategories(api.get("/boliger/categories")) }.getOrDefault(boligCats)
    }

    fun addFolderEntry(desc: String, amount: String, paidBy: String?, targetId: Int? = null, categoryId: Int? = null) = launch {
        val f = folder ?: return@launch
        val id = targetId ?: f.folder.id
        val body = JSONObject().put("description", desc).put("amount", amount.replace(" ", "").replace(',', '.'))
        paidBy?.let { body.put("paidBy", it) }
        categoryId?.let { body.put("categoryId", it) }
        val res = parseFolderDetail(api.post("/folders/$id/entries", body))
        // Lagt i en annen bolig: den åpne boligen lastes på nytt.
        folder = if (id == f.folder.id) res else parseFolderDetail(api.get("/folders/${f.folder.id}"))
        folders = parseFolders(api.get("/folders"))
        message = "Lagt til i ${res.folder.name}"
    }

    /* ---------- Domener ---------- */

    private suspend fun loadDomains() {
        val list = parseDomains(api.domGet("/domains"))
        domains = list
        if (domain == null || list.none { it.name == domain }) domain = list.firstOrNull()?.name
        loadAnalytics()
    }

    private suspend fun loadAnalytics() {
        val d = domain ?: return
        analytics = parseAnalytics(api.domGet("/" + URLEncoder.encode(d, "UTF-8") + "/analytics?range=$domRange"))
    }

    fun pickDomain(name: String) { domain = name; analytics = null; launch { loadAnalytics() } }
    fun setRange(r: String) { domRange = r; launch { loadAnalytics() } }
    fun reloadDomain() = launch { loadDomains(); message = "Oppdatert fra Cloudflare" }

    /** Administrer domener: samme liste som i Homelab. API-token legges inn på web. */
    fun addDomain(name: String, source: String) = launch {
        val n = name.trim().lowercase().removePrefix("https://").removePrefix("http://").trimEnd('/')
        if (n.isBlank()) return@launch
        api.domPost("/domains", JSONObject().put("name", n).put("source", source))
        domain = n
        loadDomains()
        message = if (source in DOMAIN_NEEDS_TOKEN) "$n lagt til. Legg inn API-token på web." else "$n lagt til"
    }
    fun removeDomain(d: DomainRef) = launch {
        api.domDelete("/domains/" + URLEncoder.encode(d.id, "UTF-8"))
        if (domain == d.name) { domain = null; analytics = null }
        loadDomains()
        message = "${d.name} fjernet"
    }

    /** Landene til kartet: fra serveren, ellers world-atlas på jsDelivr. */
    fun loadWorldMap() {
        if (worldMap != null) return
        viewModelScope.launch {
            suspend fun parse(b: ByteArray?) = b?.let { withContext(Dispatchers.Default) { MapCountry.parse(String(it)) } }.orEmpty()
            val local = parse(runCatching { api.bytes("/domains/api/vendor/countries-110m.json") }.getOrNull())
            worldMap = local.ifEmpty { parse(runCatching { withContext(Dispatchers.IO) { java.net.URL(WORLD_ATLAS).openStream().use { it.readBytes() } } }.getOrNull()) }
        }
    }

    /* ---------- API-tokens ---------- */

    fun loadTokens() = launch {
        tokenError = null
        try { tokens = parseTokens(api.get("/tokens")) } catch (e: ApiException) {
            tokens = emptyList()
            tokenError = if (e.status == 401 || e.status == 403) "Tokens kan bare administreres fra FinansHub i nettleseren for denne kontoen." else e.message
        }
    }

    fun createToken(name: String, scopes: List<String>, days: Int?) = launch {
        val body = JSONObject().put("name", name).put("scopes", JSONArray(scopes))
        if (days != null) body.put("expiresDays", days).put("expires", days)
        newToken = JSONObject(api.post("/tokens", body)).optString("token")
        loadTokens()
    }

    fun revokeToken(id: String) = launch { api.delete("/tokens/$id"); message = "Token trukket tilbake"; loadTokens() }

    /* ---------- Data og lagring ---------- */

    fun clearCache() {
        logos.clear()
        File(getApplication<Application>().cacheDir, "scans").listFiles()?.forEach { it.delete() }
        message = "Hurtigbuffer tømt"
    }

    /** Eksporterer alle transaksjoner som CSV (semikolon, UTF-8 med BOM) og åpner delingsarket. */
    fun exportCsv() = launch {
        busy = true
        try {
            val all = parseTxList(api.get("/transactions?limit=100000"))
            val esc = { s: String -> if (s.contains(';') || s.contains('"') || s.contains('\n')) "\"" + s.replace("\"", "\"\"") + "\"" else s }
            val csv = buildString {
                append('﻿').append("Dato;Beskrivelse;Beløp;Kategori;Konto;Notat\r\n")
                all.forEach { t -> append(listOf(t.date, esc(t.description), t.amount.toString().replace('.', ','), esc(t.category), esc(t.account), esc(t.note)).joinToString(";")).append("\r\n") }
            }
            shareFile("finanshub-transaksjoner.csv", "text/csv", csv.toByteArray())
        } finally { busy = false }
    }
}
