package no.kristo.finanshub

import android.app.Application
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.ConnectivityManager
import android.net.Network
import no.kristo.finanshub.upload.PendingUpload
import no.kristo.finanshub.upload.PendingUploads
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
import kotlinx.coroutines.sync.withLock
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
 * sammen med Mat og Domener.
 */
enum class Screen(val label: String) {
    Homelab("Homelab"),
    Home("Oversikt"), List("Liste"), Budget("Budsjett"), Search("Søk"), More("Mer"),
    Scan("Kvitteringer"), Fast("Faste utgifter"), Accounts("Kontoer"), Stocks("Aksjer"), Reports("Rapporter"), Import("Import"),
    Sub("Subscription OS"), Folders("Boliger"), Finn("Finn-handler"),
    Mat("Mat"), Domains("Domener"), Settings("Innstillinger"), Tracking("Sporing");

    /** Fanelinja for Finans vises (Mer er markert på undersidene). */
    val isFinance get() = this in FINANCE
    val isMorePage get() = this in MORE_PAGES

    companion object {
        val FINANCE = setOf(Home, List, Budget, Search, More, Scan, Fast, Accounts, Stocks, Reports, Import, Sub, Folders, Finn)
        /** Under Mer. Budsjett og Finn er egne faner, men ligger under Mer når de er skjult som fane. */
        val MORE_PAGES = setOf(Scan, Fast, Accounts, Stocks, Reports, Import, Sub, Folders)
        /** Faner i Finans og på Homelab, med ID-ene som lagres i oppsettet. */
        val FIN_TAB = mapOf("home" to Home, "list" to List, "finn" to Finn, "bud" to Budget, "ai" to Search, "mer" to More)
        val HL_TAB = mapOf("hl" to Homelab, "home" to Home, "trk" to Tracking, "dom" to Domains, "mat" to Mat)
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
    /** Valgt dag i Mat (indeks 0–6), null = i dag. «Hele uka og alle retter» er åpen. */
    var matDay by mutableStateOf<Int?>(null)
    var matFull by mutableStateOf(false)
    /** Verdenskartet til Domener → Besøk (lastes én gang). */
    var worldMap by mutableStateOf<List<MapCountry>?>(null)
    /** Melding over søkeresultatet, f.eks. at AI er av og vanlig søk ble brukt. */
    var aiNote by mutableStateOf<String?>(null)
    var suggestGroups by mutableStateOf<List<SuggestGroup>>(emptyList())

    /* ---------- Sporing, vær, aksjer og abonnement (prompt 11) ---------- */

    var tracking by mutableStateOf<TrackingData?>(null)
    /** De 2 viktigste pakkene på Homelab-hjem. */
    var homePackages by mutableStateOf<List<Shipment>?>(null)
    /** Åpen sending (kortet er utvidet med tidslinjen). */
    var trkSel by mutableStateOf<String?>(null)
    /** active | pickup | out | done */
    var trkFilter by mutableStateOf("active")
    var trkChecking by mutableStateOf(false)
    var stocksX by mutableStateOf<StocksX?>(null)
    /** ov | det | tx (Portefølje, Aksjedetaljer, Transaksjoner) */
    var stockScreen by mutableStateOf("ov")
    var stockSel by mutableStateOf<String?>(null)
    var stockFrom by mutableStateOf<String?>(null)
    var subsX by mutableStateOf<SubsX?>(null)
    /** home | ins | hist */
    var subTab by mutableStateOf("home")
    var subCandidates by mutableStateOf<List<SubCandidate>?>(null)

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

    fun onBackground() { backgroundAt = System.currentTimeMillis(); stopTrackingPoll(); onBackground31() }
    fun onForeground() {
        if (loggedIn) { startTrackingPoll(); viewModelScope.launch { loadReviewCount() } }
        if (loggedIn) { onForeground31(); refreshMe39(); loadAiIn39() } // prompt 39: nytt profilbilde fra web vises uten å logge ut
        val at = backgroundAt ?: return
        backgroundAt = null
        if (loggedIn && prefs.bool(AppPrefs.LOCK) && System.currentTimeMillis() - at >= prefs.int(AppPrefs.LOCK_AFTER, 0) * 60_000L) locked = true
        if (prefs.bool(AppPrefs.HIDE_AMOUNTS)) Privacy.hidden = true
    }

    private val logos = mutableMapOf<String, Bitmap?>()
    private val api get() = Api(base, account?.token)
    private var pollJob: kotlinx.coroutines.Job? = null
    private var jobPoll: kotlinx.coroutines.Job? = null


    /* ---------- Venter på opplasting (prompt 18) ---------- */

    /** Kvitteringer som ikke kom fram (uten nett, tapt forbindelse eller serverfeil). Lagres på telefonen til de er lastet opp. */
    var pendingUploads by mutableStateOf<List<PendingUpload>>(emptyList())
        private set
    var pendingBusy by mutableStateOf(false)
        private set
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    /** Bare den innloggede kontoens kø vises og sendes (prompt 21). */
    fun refreshPending() {
        val id = account?.id
        pendingUploads = if (id == null) emptyList() else runCatching { PendingUploads.listFor(getApplication(), id, accounts.size <= 1) }.getOrDefault(emptyList())
    }

    /** Nettet kom tilbake: last opp det som venter (bare på Wi-Fi hvis det er valgt). */
    private fun watchNetwork() {
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (pendingUploads.isNotEmpty() && loggedIn) viewModelScope.launch { delay(1500); if (canUpload()) flushPending(quiet = true) }
            }
        }
        runCatching { cm.registerDefaultNetworkCallback(cb); netCallback = cb }
    }

    override fun onCleared() {
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        netCallback?.let { cb -> runCatching { cm?.unregisterNetworkCallback(cb) } }
        super.onCleared()
    }

    /** «Prøv igjen»: laster opp alt som venter nå. */
    fun retryPending() = viewModelScope.launch { flushPending(quiet = false) }

    private suspend fun flushPending(quiet: Boolean) {
        if (pendingBusy || !loggedIn) return
        if (!canUpload()) { if (!quiet) message = "Venter på Wi-Fi (Innstillinger → Skanning)"; return }
        pendingBusy = true
        try {
            val id = account?.id ?: return
            val n = withContext(Dispatchers.IO) { PendingUploads.flush(getApplication(), api, id, accounts.size <= 1) }
            refreshPending()
            if (n > 0) { message = if (n == 1) "1 kvittering som ventet er lastet opp" else "$n kvitteringer som ventet er lastet opp"; loadReceipts(); loadJobs() }
            else if (!quiet && pendingUploads.isNotEmpty()) message = pendingUploads.first().lastError ?: "Fikk ikke lastet opp ennå"
        } finally { pendingBusy = false }
    }

    fun removePending(id: String) { PendingUploads.remove(getApplication(), id); refreshPending() }

    private suspend fun queuePending(path: String, parts: List<Api.Part>, name: String, error: String?) {
        withContext(Dispatchers.IO) { PendingUploads.add(getApplication(), path, name, parts, error, account?.id ?: "") }
        refreshPending()
        PendingUploads.schedule(getApplication(), prefs.bool(AppPrefs.WIFI_ONLY))
        message = "Ingen forbindelse med serveren. Kvitteringen venter på opplasting og sendes når nettet er tilbake."
    }

    private fun nameOf(uri: Uri): String = runCatching {
        getApplication<Application>().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: "Kvittering"

    private fun startScreen() = when (prefs.str(AppPrefs.START, "homelab")) {
        "home" -> Screen.Home; "list" -> Screen.List; "budget" -> Screen.Budget; else -> Screen.Homelab
    }

    /* ---------- Startside og tilbakevei ---------- */

    /** Startsiden som skjerm: Homelab eller en Finans-fane. */
    val startPage: Screen get() = if (prefTick >= 0) startScreen() else Screen.Homelab
    /** Finans som startside: appen åpner der, og Homelab og modulene ligger i profilmenyen. */
    val financeStart: Boolean get() = startPage != Screen.Homelab
    val startLabel: String get() = if (financeStart) "Finans" else "Homelab"
    fun goStart() { Haptics.back(); go(startPage) } // prompt 34: «‹ Homelab / ‹ Finans» med lett haptikk
    /** Startsiden har ikke lenger egen knapp i fanelinja (prompt 14): pila øverst til venstre går hjem. */
    val homeInBar: Boolean get() = false

    /** «‹ Homelab» / «‹ Finans» øverst med profilbildet til høyre på samme rad. null = ingen topprad. */
    fun topRowTitle(compact: Boolean): String? {
        if (editing != null || detail != null || original != null || editHome) return null
        // Mat er en egen flate uten fanelinje: pilen vises alltid der.
        if (screen == Screen.Mat) return if (matFull) null else startLabel
        if (!compact) return null
        return when (screen) {
            Screen.Domains -> startLabel
            Screen.Homelab, Screen.Tracking -> if (financeStart) "Finans" else null
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
            if (e.status == 403 && e.message?.startsWith(Api.TOKEN_REFUSED) == true) return@launch
            if (e.status == 401 && loggedIn && !e.needsTotp) expired() else { message = e.message; Haptics.error() }
        } catch (e: Exception) { message = e.message ?: "Noe gikk galt"; Haptics.error() }
    }

    /** Kort melding med haptikk: feil gir REJECT, ellers CONFIRM. */
    fun flash(text: String) {
        if (listOf("Kunne ikke", "Fikk ikke", "Feil", "Skriv inn", "Ugyldig").any { text.startsWith(it) }) Haptics.error() else Haptics.success()
        message = text
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
        clearUserFiles()
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
        news = null; homeNews = emptyList(); newsOpen = false; photo = null; media = null; matFolders = emptyList(); recipeJobs = emptyList()
        recipePreview = null; dishOpen = null; paperPage = null
        logos.clear()
        // Prompt 21 (brukerskille): alt som tilhører brukeren tømmes ved kontobytte og utlogging.
        tasks = null; taskNext = emptyList(); tasksOpen = false; family = null; famTrack = emptyList(); famSel = null; familyOpen = false
        famPositions = null; tracking = null; homePackages = null; myStops = emptyList(); stopDeps = emptyMap(); stopSel = null; ruterOpen = false
        photoThumbs = emptyMap(); photoFailed = emptySet(); bgInfo = null; depOpen = null; shareListId = null; taskUsers = emptyList()
        kal26.open = false; kal26.events = null; kal26.loadedFor = null; kal26.layoutFor = null
        chat27.open = false; chat27.loadedFor = null
        scopeToAccount()
    }

    /**
     * Brukerskille på telefonen (prompt 21): widgetcachen, familie- og helsevalgene og opplastingskøen følger den
     * aktive kontoen. Posisjon og helse sendes bare for kontoen som selv har slått på deling.
     */
    private fun scopeToAccount() {
        val ctx = getApplication<Application>()
        val id = accounts.firstOrNull { it.id == activeId }?.id
        runCatching { no.kristo.finanshub.family.FamilyPrefs.useAccount(ctx, id) }
        runCatching { no.kristo.finanshub.family.FamilyService.sync(ctx) }
        runCatching {
            if (no.kristo.finanshub.family.FamilyPrefs.health(ctx).isEmpty()) no.kristo.finanshub.family.HealthSync.cancel(ctx)
            else no.kristo.finanshub.family.HealthSync.schedule(ctx)
        }
        runCatching { no.kristo.finanshub.widget.WidgetStore.useAccount(ctx, id); no.kristo.finanshub.widget.TasksStore.useAccount(ctx, id) }
        viewModelScope.launch { runCatching { no.kristo.finanshub.widget.WidgetSync.redraw(ctx) }; runCatching { no.kristo.finanshub.widget.TasksWidgetSync.redraw(ctx) } }
        if (id != null) runCatching { no.kristo.finanshub.widget.WidgetSync.refresh(ctx) }
        refreshPending()
    }

    /** Utlogging: skannede kvitteringer og bakgrunnsbilder i cachen tilhører brukeren og slettes. */
    private fun clearUserFiles() {
        val ctx = getApplication<Application>()
        runCatching { File(ctx.cacheDir, "scans").deleteRecursively() }
        runCatching { File(ctx.cacheDir, "bg").deleteRecursively() }
        photo = null
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
        // Navnet på appen, ikonet og varselvalgene (stille timer, lyd) hentes fra serveren.
        loadAppInfo()
        if (!notifyLoaded) loadNotify()
        lastSync = System.currentTimeMillis()
        if (offline.isNotEmpty() && canUpload()) { val q = offline; offline = emptyList(); uploadUris(q) }
        if (pendingUploads.isNotEmpty()) launch { flushPending(quiet = true) }
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

    /** Prompt 39: signert/relativ URL, disk-cache, logg og reserve (P39.kt). */
    private suspend fun loadAvatar(url: String?) = avatar39(url)

    private suspend fun loadFor(s: Screen) {
        moduleError = null
        try {
            when (s) {
                Screen.Homelab -> loadHome()
                Screen.Home -> { summary = parseSummary(api.get("/summary")); loadReviewCount(); loadRecent15() }
                Screen.List, Screen.Budget -> if (txs == null || s == Screen.List) loadTx()
                Screen.Search -> { loadAiHistory(); loadSuggestGroups() }
                Screen.More -> loadMore()
                Screen.Scan -> { loadReceipts(); loadJobs() }
                Screen.Fast -> recurring = parseRecurring(api.get("/recurring"))
                Screen.Accounts -> boot = parseBoot(api.get("/bootstrap"))
                Screen.Stocks -> { val d = api.get("/stocks"); stocks = runCatching { parseStocks(d) }.getOrNull(); stocksX = parseStocksX(d) }
                Screen.Reports -> loadReport()
                Screen.Mat -> loadWeek()
                Screen.Sub -> loadSubs()
                Screen.Tracking -> loadTracking()
                Screen.Folders -> folders = parseFolders(api.get("/folders"))
                Screen.Finn -> { finn = parseFinn(api.get("/finn")); finnSel?.let { loadFinnDetail(it) } }
                Screen.Domains -> loadDomains()
                else -> {}
            }
        } catch (e: ApiException) {
            if (e.status == 401 || e.status == 403) moduleError = "${s.label} er ikke tilgjengelig for denne kontoen (${e.message})."
            else if (e.status == 404) moduleError = "${s.label} finnes ikke på serveren ennå. Oppdater homelab."
            else if (e.status == 502) moduleError = "${s.label}: ${e.message}"
            else throw e
        } catch (e: org.json.JSONException) {
            moduleError = "${s.label}: uventet svar fra serveren (${e.message?.take(80)}). Oppdater homelab."
        }
    }

    /** Fanebytte (fanelinje, meny): ingen egen tilbakevei. */
    fun go(s: Screen) = navigate(s, null)

    /** Underside (f.eks. fra Mer): tilbakeknappen fører hit igjen. */
    fun open(s: Screen) = navigate(s, screen)

    private fun navigate(s: Screen, from: Screen?) {
        if (s != screen) { selectedTx = null; folder = null; detail = null; detailTx = null; editing = null; original = null; editHome = false; matFull = false; matDay = null }
        // Trykk på Finn-fanen fra en åpen handel går tilbake til listen.
        // Prompt 34: Hjem fra en annen side (fanen eller ‹ Homelab) gir samme lette haptikk som tilbake.
        if (!navDry && s == Screen.Homelab && screen != Screen.Homelab) Haptics.back()
        if (s != screen || s == Screen.Finn) { finnSel = null; finnDetail = null }
        if (s != Screen.Tracking) trkSel = null
        if (s != Screen.Stocks) { stockScreen = "ov"; stockSel = null }
        backTo = from?.takeIf { it != s }
        screen = s
        menuOpen = false
        paperPage = null; paperFromMer = false; paperFromFinMer = false; scanTarget = "receipt"; dishOpen = null
        if (s == Screen.Homelab || s == Screen.Mat || s == Screen.Tracking || s == Screen.Domains) paperFin = false
        if (s != Screen.Finn) finnEdit = null
        trkEdit = false
        // Prompt 23: forhåndsvisningen av tilbake (previewBack) kjører navigasjonen på prøve uten å hente data.
        if (!navDry) launch { loadFor(s) }
    }

    /** Tilbake: lukker det som er åpent, ellers til forrige side (undersider av Mer → Mer, Finans og moduler → Homelab). */
    fun back(): Boolean {
        if (!navDry) navBackSeq++
        // Prompt 34: lett haptikk på all tilbake (knapp, sveip, systemets tilbake). Ikke når forhåndsvisningen prøvekjører.
        if (!navDry) Haptics.back()
        when {
            // Prompt 27: en åpen sak lukkes først (artikkelvisningen i Nyhetsleser).
            newsOpen -> { if (b27.articleFor != null) closeArticle27() else if (newsSettings) newsSettings = false else newsOpen = false }
            original != null -> original = null
            editing != null -> editing = null
            detail != null -> { detail = null; detailTx = null }
            editHome -> editHome = false
            screen == Screen.Settings && settingsPage != null -> settingsBack26()
            paper && paperPage == "set" && settingsPage != null -> settingsBack26()
            tasksOpen -> closeTasks()
            chat27.open -> closeChat27()
            kal26.open -> closeKal26()
            bd24.open -> closeBirthdays24()
            compareOpen -> compareOpen = false
            screen == Screen.Folders && folder != null -> folder = null
            screen == Screen.Scan && selectedReceipt != null -> selectedReceipt = null
            screen == Screen.Finn && finnSel != null -> { finnSel = null; finnDetail = null }
            screen == Screen.Tracking && trkSel != null -> trkSel = null
            screen == Screen.Stocks && stockScreen != "ov" -> { stockScreen = if (stockScreen == "det" && stockFrom == "tx") "tx" else "ov"; stockFrom = null }
            selectedTx != null -> selectedTx = null
            screen == Screen.Domains && domainManager -> domainManager = false
            screen == Screen.Mat && matFull -> matFull = false
            screen == Screen.Mat && dishOpen != null -> dishOpen = null
            paper && paperPage == "fmer" -> { paperPage = null; navigate(Screen.Homelab, null) }
            paper && paperFromFinMer -> { navigate(Screen.Home, null); paperFin = true; paperPage = "fmer" }
            paper && paperPage == "fsok" -> { paperPage = null; navigate(Screen.Homelab, null) }
            paper && paperFin && screen in PAPER_FIN_SCREENS -> navigate(Screen.Homelab, null)
            // Domener i Papir: pila og kantsveipet går alltid til Hjem, også når siden ble åpnet fra Mer.
            paper && screen == Screen.Domains -> { domAll = false; navigate(Screen.Homelab, null) }
            paper && paperPage != null && paperPage != "mer" -> paperPage = "mer"
            paper && paperPage == "mer" -> { paperPage = null; navigate(Screen.Homelab, null) }
            paper && paperFromMer -> { paperFromMer = false; paperPage = "mer" }
            paper && screen == Screen.Homelab && backTo == null -> return false
            paper && screen != Screen.Homelab && backTo == null -> navigate(Screen.Homelab, null)
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

    /* ---------- Lenker fra widgetene (finanshub://<side>) ---------- */

    /** «camera» eller «files»: FinansApp åpner kameraet eller filvelgeren når denne settes. */
    var pendingScan by mutableStateOf<String?>(null)

    fun deepLink(uri: Uri) {
        // Prompt 38: homelab://login?c=… / https://<vert>/l/… (QR-innlogging på ny enhet).
        if (qrLink38(uri)) return
        if (uri.scheme != "finanshub" || !loggedIn) return
        menuOpen = false
        when (uri.host ?: "") {
            "homelab" -> go(Screen.Homelab)
            // Vær-widgetene åpner værappen i Papir (Klassisk: Homelab-forsiden).
            "weather", "vaer" -> { go(Screen.Homelab); if (paper) openWeather() }
            "tracking", "packages" -> go(Screen.Tracking)
            "budget" -> go(Screen.Budget)
            "finance", "home" -> go(Screen.Home)
            "list" -> go(Screen.List)
            "review" -> open(Screen.Scan)
            // Prompt 32: «+» i prøveperiode-widgetene (finanshub://subs/trial) åpner arket Prøveperiode.
            "subs" -> { open(Screen.Sub); if (uri.path?.trim('/') == "trial") { resetTrialForm31(); b28.addStep = "trial"; subAdding = true } }
            "stocks" -> open(Screen.Stocks)
            "domains" -> go(Screen.Domains)
            "mat" -> go(Screen.Mat)
            "news", "rss", "nyheter" -> openNews()
            "huske", "tasks" -> openTasks(newTask = uri.path?.trim('/') == "new")
            "bursdager", "birthdays" -> birthdaysLink24(uri)
            "kalender", "calendar" -> kalLink26(uri)
            "avganger", "ruter" -> { go(Screen.Homelab); openRuter() }
            "familie", "family" -> openFamily()
            "finn" -> go(Screen.Finn)
            "boliger" -> open(Screen.Folders)
            "search" -> go(Screen.Search)
            // Prompt 31: varslene fra Glimt (svar i søkefeltet / Chat), System-siden og prøveperioder.
            "glimt" -> { openedFromNotify31(); go(Screen.Homelab) }
            "chat" -> { openedFromNotify31(); val id = uri.path?.trim('/').orEmpty(); openChat(); if (id.isNotEmpty()) openChatId27(id) }
            "nordlys", "system" -> openNordlys31()
            // Prompt 34: Glimt-brief-widgetene (finanshub://brief) og «Åpne AI-kontroll» (finanshub://ai/<fane>).
            "brief" -> { go(Screen.Homelab); openBrief34() }
            // Prompt 37: bibelvers-widgetene og påminnelsen åpner Bibel-siden (bare med modulen).
            "bibel", "bible" -> { go(Screen.Homelab); loadBible37(); p37.biblePage = true }
            "ai" -> openAiCtl34(uri.path?.trim('/')?.takeIf { it in setOf("ov", "mod", "rt", "job", "use", "api") } ?: "ov")
            "scan" -> { open(Screen.Scan); pendingScan = when (uri.path?.trim('/')) { "camera" -> "camera"; "files" -> "files"; else -> null } }
            // Prompt 35: Kalender-appen åpner finanshub://settings/glimt og finanshub://settings/kalendere.
            "settings", "innstillinger" -> settingsLink35(uri.path?.trim('/').orEmpty())
        }
    }

    /* ---------- ✦ Analyser på nytt med Gemini ---------- */

    var reanalysis by mutableStateOf<Reanalysis?>(null)
    var reanalyzing by mutableStateOf<String?>(null)

    /** Sender originalbildet til Gemini (modell fra innstillingene) og viser resultatet side om side med det forrige. */
    fun reanalyze(id: String) = launch {
        if (reanalyzing != null) return@launch
        reanalyzing = id
        try {
            val res = api.request("POST", "/receipts/$id/reanalyze", JSONObject().put("engine", "gemini"), read = 90_000)
            reanalysis = parseReanalysis(id, res)
            Haptics.success()
        } finally { reanalyzing = null }
    }

    /** keep = "new" bruker Gemini-resultatet, "old" beholder det forrige. */
    fun applyReanalysis(keep: String) = launch {
        val r = reanalysis ?: return@launch
        api.post("/receipts/${r.receiptId}/reanalyze/apply", JSONObject().put("candidateId", r.candidateId).put("keep", keep))
        reanalysis = null
        message = if (keep == "new") "Gemini-resultatet er lagret" else "Beholdt forrige tolkning"
        loadReceipts()
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
        try {
            val raw = api.hlGet("/mobile/home")
            mobileHome = parseMobileHome(raw); mobileHome?.packages?.let { homePackages = it }
            homeNews = runCatching { parseNewsItems(org.json.JSONObject(raw).optJSONArray("news")) }.getOrDefault(homeNews)
        } catch (e: ApiException) {
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
        syncDesignFromServer()
        if (paper && photo == null && photoKind != "cur") loadPhotoNow()
        pollTracking()
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
        // Prompt 32: logges med device «mobil» (vises i «Nylige søk» på web, ikke i appen). Passord og kortnummer logges ikke.
        if (t.isNotBlank()) logSearch32b(t, "google")
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
    /** force: «✦ Spør AI likevel» (serveren svarer ellers med vanlig søk for 1–2 ord som gir treff). */
    fun ask(q: String, force: Boolean = false) {
        val t = q.trim()
        if (t.isBlank()) return
        aiQuery = t
        aiBusy = true
        aiNote = null
        launch {
            try {
                ai = if (searchMode == "plain" && !force) plainSearch(t) else {
                    // ✦ AI på: be alltid om AI (force). Serveren forklarer feil i aiErrorText (nøkkel, tilgang, tidsavbrudd, modell …).
                    val body = JSONObject().put("q", t).put("force", force || searchMode != "plain")
                    var why: String? = null
                    val a = try {
                        // Prompt 25: jobbmodus med fremdrift og Avbryt, og lesegrense fra /ai/limits (ikke fast 30 s).
                        val raw = aiSearchRaw25(body)
                        runCatching { JSONObject(raw) }.getOrNull()?.let { o -> if (o.optStr("aiErrorKind") != null) why = o.optStr("aiErrorText") ?: o.optStr("notice") }
                        parseAi(raw, t)
                    } catch (e: ApiException) {
                        if (e.status == 401) throw e
                        why = e.message
                        null
                    } catch (e: AiCancelled25) { why = AI_CANCELLED25; null } catch (e: Exception) { why = e.message; null }
                    if (a == null || a.aiUnavailable) {
                        aiNote = if (why == AI_CANCELLED25) "✦ AI-søket ble avbrutt. Viser vanlig søk."
                            else (why?.let { "✦ AI svarte ikke: $it" } ?: "AI-søket er ikke tilgjengelig nå.") + " Viser vanlig søk."
                        plainSearch(t)
                    } else { if (why != null) aiNote = "✦ $why"; a }
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
        try { val d = api.post("/stocks/sync"); stocks = runCatching { parseStocks(d) }.getOrNull(); stocksX = parseStocksX(d); flash("Synket med Trading 212") } finally { busy = false }
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
    fun uploadUris(uris: List<Uri>, stay: Boolean = false) {
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
        else if (screen != Screen.Scan && !stay) this.open(Screen.Scan)
        if (!canUpload()) {
            launch { for (u in uris) runCatching { queuePending("/receipts", receiptParts(u), nameOf(u), "Venter på Wi-Fi") } }
            message = "${uris.size} kvittering(er) venter på Wi-Fi"; return
        }
        uploading += uris.size
        launch {
            try {
                for (u in uris) {
                    try { uploadOne(u) } catch (e: ApiException) {
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
        val parts = receiptParts(uri)
        try {
            api.upload(path, parts)
        } catch (e: ApiException) {
            // Uten nett, tapt forbindelse eller feil på serveren: legg kvitteringen i «Venter på opplasting».
            if (e.status == 0 || e.status >= 500) { queuePending(path, parts, nameOf(uri), e.message); return }
            throw e
        }
        loadJobs()
    }

    /** Delene som sendes: originalen (eller skannekopien), JPEG-kopi og miniatyr. */
    private suspend fun receiptParts(uri: Uri): List<Api.Part> {
        val ctx = getApplication<Application>()
        val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
        val original = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
        val image = mime.startsWith("image/")
        val parts = mutableListOf<Api.Part>()
        // «Lagre originalbildet» av: send bare skanneversjonen som fil.
        val scan = if (image) withContext(Dispatchers.Default) { scaled(original, 1600, 85) } else null
        // Filnavnet må passe til filtypen (HEIC sendes som .heic, ikke som .jpg), og JPEG-kopien lages alltid lokalt.
        val ext = when (mime.lowercase()) {
            "application/pdf" -> "pdf"; "image/heic" -> "heic"; "image/heif" -> "heif"; "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg"
        }
        if (!image || prefs.bool(AppPrefs.KEEP_ORIGINAL, true) || scan == null) parts += Api.Part("file", "kvittering.$ext", if (ext == "jpg") "image/jpeg" else mime, original)
        else parts += Api.Part("file", "kvittering.jpg", "image/jpeg", scan)
        if (image) withContext(Dispatchers.Default) {
            scan?.let { parts += Api.Part("scan", "scan.jpg", "image/jpeg", it) }
            scaled(original, 240, 75)?.let { parts += Api.Part("thumb", "thumb.jpg", "image/jpeg", it) }
        }
        return parts
    }

    // Butikklogoer: hentes én gang og huskes. En logo som ikke kom (uten nett, eller serveren hadde ikke rukket å hente den)
    // prøves igjen etter to minutter i stedet for å vises som bokstav resten av økten.
    private val logoMiss = mutableMapOf<String, Long>()
    suspend fun logo(domain: String?): Bitmap? {
        if (domain.isNullOrBlank()) return null
        logos[domain]?.let { return it }
        logoMiss[domain]?.let { if (System.currentTimeMillis() - it < 120_000) return null }
        val b = image("/finans/api/logo/" + URLEncoder.encode(domain.trim().lowercase(), "UTF-8"))
        if (b != null) { logos[domain] = b; logoMiss.remove(domain) } else logoMiss[domain] = System.currentTimeMillis()
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
        // HEIC/HEIF som BitmapFactory ikke klarer: ImageDecoder (Android 9+) med nedskalering.
        val bmp = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: (if (Build.VERSION.SDK_INT >= 28) runCatching {
                android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data))) { dec, info, _ ->
                    val big = maxOf(info.size.width, info.size.height)
                    if (big > max) { val k = max.toFloat() / big; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
                    dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
                }
            }.getOrNull() else null) ?: return null
        val rot = rotation(data)
        val s = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height))
        val m = Matrix().apply { postScale(s, s); postRotate(rot) }
        val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        ByteArrayOutputStream().use { o -> out.compress(Bitmap.CompressFormat.JPEG, quality, o); o.toByteArray() }
    }.getOrNull()

    /* ---------- Mat ---------- */

    suspend fun loadWeek() {
        val raw = api.matGet("/week")
        week = parseWeek(raw)
        p36.mealNote = runCatching { mealNote36(raw) }.getOrNull()
        // Mapper og skannekø finnes bare på nyere servere; feil her stopper ikke uka. /week har også «folders».
        val inWeek = runCatching { org.json.JSONObject(raw).optJSONArray("folders")?.let { parseMatFolders(it.toString()) } }.getOrNull()
        matFolders = inWeek?.takeIf { it.isNotEmpty() } ?: runCatching { parseMatFolders(api.matGet("/folders")) }.getOrDefault(matFolders)
        recipeJobs = runCatching { parseRecipeJobs(api.matGet("/recipes/jobs")) }.getOrDefault(recipeJobs)
    }

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
        loadSubs(); flash("$name lagt til")
    }
    fun setSubActive(s: Sub, active: Boolean) = launch {
        api.patch("/subscriptions/${s.id}", JSONObject().put("active", active))
        loadSubs()
    }

    /* ---------- Boliger (delte mapper) ---------- */

    fun openFolder(id: Int?) = launch {
        uploadFolder = null
        if (id == null) { folder = null; folderExtra = null; return@launch }
        val raw = api.get("/folders/$id")
        folder = parseFolderDetail(raw)
        folderExtra = runCatching { parseFolderExtra(raw) }.getOrNull()
    }
    /** Kommende forfall og kvitteringer i boligen (nyere server). */
    var folderExtra by mutableStateOf<FolderExtra?>(null)
        private set
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

    /* ---------- Sporing ---------- */

    suspend fun loadTracking() {
        val t = parseTracking(api.hlGet("/tracking"))
        tracking = t
        notifyTracking(t)
    }

    /** Henter status i bakgrunnen (forsiden, og hvert 5. minutt mens appen er åpen). Feil vises ikke. */
    suspend fun pollTracking() {
        if (!loggedIn || locked) return
        val t = runCatching { parseTracking(api.hlGet("/tracking", timeout = 15_000)) }.getOrNull() ?: return
        tracking = t
        homePackages = t.top(2)
        notifyTracking(t)
    }

    private var trackPoll: kotlinx.coroutines.Job? = null
    /** Startes når appen kommer i forgrunnen og stoppes i bakgrunnen (ekte push fra serveren er ikke bygget). */
    fun startTrackingPoll() {
        startRealtime()
        if (trackPoll?.isActive == true) return
        trackPoll = viewModelScope.launch { while (true) { delay(300_000); pollTracking() } }
    }
    fun stopTrackingPoll() { trackPoll?.cancel(); trackPoll = null; stopRealtime() }

    fun addTracking(no: String, name: String, carrier: String?, out: Boolean) = launch {
        val n = no.trim()
        if (n.isEmpty()) { flash("Skriv inn et sporingsnummer"); return@launch }
        val body = JSONObject().put("trackingNo", n).put("direction", if (out) "out" else "in")
        if (name.isNotBlank()) body.put("name", name.trim())
        if (carrier != null && carrier != "other") body.put("carrier", carrier)
        val o = JSONObject(api.request("POST", "/tracking", body, prefix = Api.HOMELAB, timeout = 30_000))
        o.optJSONObject("item")?.let { trkSel = parseShipment(it).id }
        loadTracking()
        trkFilter = if (out) "out" else "active"
        flash(o.optStr("message") ?: "Sendingen spores")
    }

    fun archiveTracking(s: Shipment, on: Boolean) = launch {
        api.request("PATCH", "/tracking/${s.id}", JSONObject().put("archived", on), prefix = Api.HOMELAB)
        if (on) trkSel = null
        loadTracking()
        flash(if (on) "${s.name} er arkivert" else "${s.name} er hentet tilbake")
    }

    fun deleteTracking(s: Shipment) = launch {
        api.request("DELETE", "/tracking/${s.id}", prefix = Api.HOMELAB)
        trkSel = null
        loadTracking()
        flash("${s.name} er slettet")
    }

    /** «Sjekk nå»: leser e-post og Finn, og henter status hos transportørene. */
    fun checkTracking() {
        if (trkChecking) return
        trkChecking = true
        launch {
            try {
                val d = api.request("POST", "/tracking/check", prefix = Api.HOMELAB, timeout = 60_000)
                val o = JSONObject(d)
                if (o.has("items")) { val t = parseTracking(d); tracking = t; notifyTracking(t) } else loadTracking()
                flash(o.optStr("message") ?: "Sporing er oppdatert")
            } finally { trkChecking = false }
        }
    }

    fun setTrackingPref(k: String, on: Boolean) {
        tracking = tracking?.let { it.copy(prefs = it.prefs + (k to on)) }
        launch { api.hlPut("/tracking/prefs", JSONObject().put(k, on)) }
    }

    /** k: finn | email */
    fun setTrackingSource(k: String, on: Boolean) {
        tracking = tracking?.let {
            when (k) {
                "finn" -> it.copy(finn = it.finn.copy(on = on))
                "autoArchive" -> it.copy(autoArchive = it.autoArchive.copy(on = on))
                else -> it.copy(email = it.email.copy(on = on))
            }
        }
        launch { api.hlPut("/tracking/sources", JSONObject().put(k, on)) }
    }

    /** Lokale varsler for nye hendelser (serverens varselliste, ellers statusendringer til «Klar for henting» og «Levert»).
     *  Første gang huskes bare det som finnes, så det ikke kommer en bølge av gamle varsler. */
    private fun notifyTracking(t: TrackingData) {
        val key = "trk_seen_" + (account?.id ?: "")
        val raw = prefs.str(key, "")
        val first = raw.isEmpty()
        val seen = raw.split('\n').filter { it.isNotEmpty() }.toMutableList()
        val fresh = mutableListOf<Triple<String, String, String>>()
        t.notices?.reversed()?.forEach { n ->
            if ("n:${n.id}" in seen) return@forEach
            seen += "n:${n.id}"
            val title = mapOf("pickup" to "Klar for henting", "delivered" to "Levert", "out" to "Ute for levering", "delayed" to "Forsinket", "found" to "Ny sending")[n.kind] ?: "Sporing"
            fresh += Triple(title, n.text, "trk-n-${n.id}")
        }
        for (s in t.items) {
            if (s.archived || !(s.ready || s.done)) continue
            val k = "s:${s.id}:${s.status}"
            if (k in seen) continue
            seen += k
            if (t.notices != null) continue
            if (!(t.prefs[if (s.ready) "pickup" else "delivered"] ?: true)) continue
            fresh += if (s.ready) Triple("Klar for henting", s.name + if (s.pickupPoint.isBlank()) "" else " hos ${s.pickupPoint}", "trk-${s.id}-pickup")
            else Triple("Levert", "${s.name} er levert", "trk-${s.id}-delivered")
        }
        prefs.set(key, seen.takeLast(400).joinToString("\n").ifEmpty { "-" })
        if (first || fresh.isEmpty()) return
        fresh.takeLast(3).forEach { Notify.post(getApplication<Application>(), it.first, it.second, it.third) }
        Haptics.pkg()
    }

    /* ---------- Subscription OS (nytt design) ---------- */

    suspend fun loadSubs() {
        val d = api.get("/subscriptions")
        subs = runCatching { parseSubs(d) }.getOrNull()
        subsX = parseSubsX(d)
    }

    fun setSubItemActive(s: SubItem, active: Boolean) = launch {
        api.patch("/subscriptions/${s.id}", JSONObject().put("active", active))
        loadSubs()
        flash(if (active) "${s.name} er aktivert igjen" else "${s.name} er markert som sagt opp")
    }

    /** «Skriv inn selv»: tjeneste, plan, beløp, syklus og trekkdag. */
    fun addSubManual(name: String, plan: String, price: String, cycle: String, day: Int?) = launch {
        val body = JSONObject().put("name", name).put("plan", plan).put("price", price.replace(" ", "").replace(',', '.')).put("cycle", cycle)
        if (day != null && day in 1..31) {
            val now = LocalDate.now()
            var d = now.withDayOfMonth(minOf(day, now.lengthOfMonth()))
            if (d.isBefore(now)) { val m = now.plusMonths(1); d = m.withDayOfMonth(minOf(day, m.lengthOfMonth())) }
            body.put("chargeDay", day).put("nextDate", d.toString())
        }
        api.post("/subscriptions", body)
        loadSubs()
        flash("$name lagt til")
    }

    /** «Fra transaksjoner»: faste trekk sett minst 3 ganger som ikke er registrert. */
    fun loadSubCandidates() { subCandidates = null; launch { subCandidates = parseSubCandidates(api.get("/subscriptions/candidates")) } }

    fun addSubCandidate(c: SubCandidate) = launch {
        api.post("/subscriptions", JSONObject().put("fromCandidate", c.toJson()))
        subCandidates = subCandidates?.filter { it.key != c.key }
        loadSubs()
        flash("${c.merchant} lagt til")
    }

    /** «Fra kvittering»: ✦ AI leser bildet eller PDF-en og lager abonnementet. */
    fun uploadSubReceipt(uri: Uri) = launch {
        busy = true
        try {
            val ctx = getApplication<Application>()
            val mime = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: throw ApiException("Fikk ikke lest filen")
            val pdf = mime.contains("pdf")
            val bytes = if (pdf) data else scaled(data, 2400, 85) ?: data
            api.upload("/subscriptions/receipts", listOf(Api.Part("file", if (pdf) "kvittering.pdf" else "kvittering.jpg", if (pdf) "application/pdf" else "image/jpeg", bytes)))
            flash("✦ AI leser kvitteringen. Abonnementet dukker opp om litt.")
        } finally { busy = false }
        repeat(4) { delay(5_000); runCatching { loadSubs() } }
    }

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

    /* ---------- Prompt 13: mobildesign Papir, fotovindu, nyhetsleser, media og Mat ---------- */

    /** Innstillinger → Utseende → Mobildesign: «klassisk» (Material You) eller «papir». */
    val paper: Boolean get() = option(AppPrefs.MOBILE_DESIGN, "klassisk") == "papir"
    /** Papir: «auto» (følger systemet), «lys» eller «mork». */
    val paperMode: String get() = option(AppPrefs.PAPER_MODE, "auto")
    /** Bakgrunnen i fotovinduet: cur (gradient), oslo, weather, planets eller custom. */
    val photoKind: String get() = option(AppPrefs.PHOTO, "oslo")

    /** Papir-sider uten egen Screen: «mer», «set» (Papir-innstillinger) og «media». null = vm.screen vises. */
    var paperPage by mutableStateOf<String?>(null)
    /** Siden ble åpnet fra Mer: tilbake går til Mer (og Mer er markert i fanelinjen). */
    var paperFromMer by mutableStateOf(false)
        private set
    var photo by mutableStateOf<Bitmap?>(null)
        private set
    var photoGradient by mutableStateOf<List<Long>>(emptyList())
        private set
    var photoCredit by mutableStateOf<String?>(null)
        private set
    var photoMenu by mutableStateOf(false)

    fun setMobileDesign(d: String) {
        setPref(AppPrefs.MOBILE_DESIGN, d)
        paperPage = null
        if (d == "papir") loadPhoto()
        pushDesign()
    }
    fun setPaperMode(m: String) { setPref(AppPrefs.PAPER_MODE, m); pushDesign() }
    fun setPhotoKind(k: String) { setPref(AppPrefs.PHOTO, k); photoMenu = false; loadPhoto(); pushDesign() }

    /** Papir-fanene: Hjem, Finans, Mat, Sporing og Mer. */
    fun paperTab(t: String) {
        when (t) {
            "hjem" -> go(Screen.Homelab)
            "fin" -> { go(Screen.Home); paperFin = true }
            "mat" -> go(Screen.Mat)
            "trk" -> go(Screen.Tracking)
            "dom" -> { domSection = "oversikt"; go(Screen.Domains) }
            "sok" -> { paperFinTab("sok"); return }
            "mer" -> { if (screen !in setOf(Screen.Homelab, Screen.Home, Screen.Mat, Screen.Tracking)) go(Screen.Homelab); paperPage = "mer" }
        }
        Haptics.select()
    }
    /** Fra Mer: en side (Screen) eller en Papir-side («media», «set»). */
    fun openFromMer(s: Screen) { go(s); paperFromMer = true }
    fun openPaperPage(p: String) {
        paperPage = p
        if (p == "set") settingsPage = null
        if (p == "media") loadMedia()
    }

    private fun pushDesign() {
        viewModelScope.launch {
            runCatching {
                api.hlPut("/me/layout", JSONObject().put("mobileDesign", option(AppPrefs.MOBILE_DESIGN, "klassisk")).put("paperMode", paperMode)
                    .put("photo", if (photoKind == "none") "cur" else photoKind).put("bgType", photoKind))
            }
        }
    }

    /** Første gang: valgene fra serveren (satt på en annen enhet eller på nett) tas i bruk. */
    private suspend fun syncDesignFromServer() {
        val raw = runCatching { api.hlGet("/me/layout") }.getOrNull() ?: return
        val x = runCatching { parseLayoutExtras(raw) }.getOrNull() ?: return
        // Rekkefølgen på Sporing og onboarding følger brukeren, så de leses hver gang.
        if (x.trkOrder.isNotEmpty()) trkOrder = normalizeTrkOrder(x.trkOrder)
        applyLayout15(raw)
        applyLayout16(raw)
        applyLayout19(raw)
        applyLayout20(raw)
        applyLayout24a(raw)
        applyLayout26b(raw)
        applyLayout32b(raw) // prompt 32: secNav, hs_timeout_s og search_history
        val obKey = AppPrefs.ONBOARDED + (account?.id ?: "")
        onboardNeeded = x.onboarded == false && !prefs.bool(obKey)
        if (prefs.bool(AppPrefs.DESIGN_SYNCED)) return
        // Ny installasjon står i Papir: serverens standardverdi «klassisk» skal ikke bytte tilbake.
        x.mobileDesign?.takeIf { it == "papir" || (it == "klassisk" && !prefs.bool(AppPrefs.FRESH_PAPIR)) }?.let { prefs.set(AppPrefs.MOBILE_DESIGN, it) }
        // Ny enhet starter i «lys» (prompt 22): serverens standardverdi «auto» skal ikke bytte tilbake, et eget valg (lys/mørk) gjelder.
        x.paperMode?.takeIf { it in setOf("lys", "mork") || (it == "auto" && !prefs.bool(AppPrefs.FRESH_PAPIR)) }?.let { prefs.set(AppPrefs.PAPER_MODE, it) }
        x.photo?.takeIf { it in setOf("cur", "oslo", "weather", "planets", "custom") }?.let { prefs.set(AppPrefs.PHOTO, it) }
        runCatching { parseBgSettings(raw).type }.getOrNull()?.takeIf { it in BG_KINDS }?.let { prefs.set(AppPrefs.PHOTO, it) }
        prefs.set(AppPrefs.DESIGN_SYNCED, true)
        prefTick++
    }

    fun loadPhoto() = launch { loadPhotoNow() }

    private suspend fun loadPhotoNow() {
        val kind = photoKind
        if (kind == "cur" || kind == "none") { photo = null; photoGradient = emptyList(); photoCredit = null; photoError = null; bgInfo = null; return }
        // Prompt 19: felles bakgrunnstjeneste. Eldre servere uten /api/background faller tilbake til /api/photo-window.
        val bg = backgroundFor(kind)
        if (bg != null) {
            val (info, bmp) = bg
            bgInfo = info
            photoGradient = info.colors
            photoCredit = info.credit?.line
            photo = bmp
            photoThumbs = photoThumbs + (kind to bmp)
            if (bmp == null && info.imageUrl != null) {
                photoFailed = photoFailed + kind
                photoError = if (bgCacheOnly()) "Nye bilder lastes bare ned på Wi-Fi" else "Fikk ikke lastet bildet · trykk for å prøve igjen"
            } else { photoFailed = photoFailed - kind; photoError = null }
            return
        }
        bgInfo = null
        val (pw, bmp) = photoFor(kind)
        photoGradient = pw?.gradient ?: emptyList()
        photoCredit = pw?.credit
        photo = bmp
        photoThumbs = photoThumbs + (kind to bmp)
        if (bmp == null && (pw?.url != null || pw?.fallbacks?.isNotEmpty() == true)) {
            photoFailed = photoFailed + kind
            photoError = "Fikk ikke lastet bildet · trykk for å prøve igjen"
            android.util.Log.w("FinansHub", "Bakgrunn «$kind»: ingen av bildene kunne lastes (${pw?.url})")
        } else { photoFailed = photoFailed - kind; photoError = null }
    }

    /** Bilde fra en annen tjeneste (f.eks. Wikimedia). Tokenet sendes ikke dit. */
    private suspend fun externalImage(url: String): Bitmap? = runCatching {
        withContext(Dispatchers.IO) {
            val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            c.connectTimeout = 6000; c.readTimeout = 10000
            c.setRequestProperty("User-Agent", "FinansHub-Android")
            try { c.inputStream.use { it.readBytes() } } finally { c.disconnect() }
        }.let { b -> withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(b, 0, b.size) } }
    }.getOrNull()

    /** «Eget bilde»: skaleres til maks 1600 px og lagres per bruker på serveren. */
    fun uploadPhoto(uri: Uri) = launch {
        busy = true
        try {
            val ctx = getApplication<Application>()
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val jpeg = withContext(Dispatchers.Default) { scaled(data, 1600, 85) } ?: run { message = "Kunne ikke lese bildet"; return@launch }
            api.upload("/me/photo-window", listOf(Api.Part("file", "bakgrunn.jpg", "image/jpeg", jpeg)), prefix = Api.HOMELAB)
            photoMenu = false
            setPref(AppPrefs.PHOTO, "custom")
            pushDesign()
            photo = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
            photoGradient = emptyList()
            flash("Bakgrunnen er oppdatert")
        } finally { busy = false }
    }

    /* ---------- Prompt 19: dynamiske bakgrunner (GET /api/background) ---------- */

    /** Siste svar fra bakgrunnstjenesten (tema-hint, partikler, kreditering). null = gammel server eller ingen bakgrunn. */
    var bgInfo by mutableStateOf<BgInfo?>(null)
        private set
    /** Forhåndsvisningene i Innstillinger → Bakgrunn (kreditering og tema-hint per type). */
    var bgPreviewInfo by mutableStateOf<Map<String, BgInfo>>(emptyMap())
        private set
    val bgPlanet: String get() = option(AppPrefs.BG_PLANET, "auto")
    val bgRotate: String get() = option(AppPrefs.BG_ROTATE, "daily")
    val bgBlur: Int get() = optionInt(AppPrefs.BG_BLUR, 0).coerceIn(0, 20)
    val bgDim: Int get() = optionInt(AppPrefs.BG_DIM, 0).coerceIn(0, 60)
    val bgWifiOnly: Boolean get() = flag(AppPrefs.BG_WIFI, false)
    val bgAnimate: Boolean get() = flag(AppPrefs.BG_ANIMATE, true)

    /** Lagrer ett bakgrunnsvalg lokalt og på serveren (synkes til web). Planet og bytte henter et nytt bilde. */
    fun updateBgSetting(key: String, value: Any) {
        setPref(key, value)
        viewModelScope.launch {
            runCatching {
                api.hlPut("/me/layout", JSONObject().put("bgType", photoKind).put("bgPlanet", bgPlanet).put("bgRotate", bgRotate)
                    .put("bgBlur", bgBlur).put("bgDim", bgDim).put("bgWifiOnly", bgWifiOnly).put("bgAnimate", bgAnimate))
            }
        }
        if (key == AppPrefs.BG_PLANET || key == AppPrefs.BG_ROTATE) { photoThumbs = photoThumbs - "planets"; if (photoKind == "planets") loadPhoto() else loadPhotoThumbs() }
        if (key == AppPrefs.BG_WIFI && value == false) loadPhoto()
    }

    /** Valgene fra serveren (satt på web eller en annen enhet). */
    fun applyLayout19(raw: String) {
        val b = runCatching { parseBgSettings(raw) }.getOrNull() ?: return
        b.planet?.takeIf { it in BG_PLANETS.map { p -> p.first } }?.let { prefs.set(AppPrefs.BG_PLANET, it) }
        b.rotate?.takeIf { it == "daily" || it == "hourly" }?.let { prefs.set(AppPrefs.BG_ROTATE, it) }
        b.blur?.let { prefs.set(AppPrefs.BG_BLUR, it.coerceIn(0, 20)) }
        b.dim?.let { prefs.set(AppPrefs.BG_DIM, it.coerceIn(0, 60)) }
        b.wifiOnly?.let { prefs.set(AppPrefs.BG_WIFI, it) }
        b.animate?.let { prefs.set(AppPrefs.BG_ANIMATE, it) }
        prefTick++
    }

    /** På mobildata med «Kun på Wi-Fi»: ingen nye nedlastinger, bare hurtigbufferen. */
    fun bgCacheOnly(): Boolean {
        if (!bgWifiOnly) return false
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return true
        return !caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    /** Batterisparing eller «Fjern animasjoner» i systemet: ingen regn/snø over bakgrunnen. */
    fun bgReduceMotion(): Boolean {
        val ctx = getApplication<Application>()
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        val scale = runCatching { android.provider.Settings.Global.getFloat(ctx.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }.getOrDefault(1f)
        return pm?.isPowerSaveMode == true || scale == 0f
    }

    private fun withSize(url: String, w: Int): String =
        if (url.contains("/api/background/img/")) url + (if (url.contains('?')) "&" else "?") + "w=$w" else url

    /** Bakgrunnen fra den felles tjenesten: svaret og bildet (skalert til skjermbredden). null = serveren mangler tjenesten. */
    private suspend fun backgroundFor(kind: String): Pair<BgInfo, Bitmap?>? {
        val dm = getApplication<Application>().resources.displayMetrics
        val w = minOf(dm.widthPixels, 2560)
        val q = "type=" + URLEncoder.encode(kind, "UTF-8") + "&w=$w&h=${minOf(dm.heightPixels, 2560)}&dpr=1"
        val info = runCatching { parseBackground(api.hlGet("/background?$q", timeout = 8000)) }.getOrNull() ?: return null
        for (u in listOfNotNull(info.imageUrl) + info.fallbacks) {
            if (u.isBlank() || u.substringBefore('?').endsWith(".svg", true)) continue
            bgImage(u)?.let { return info to it }
        }
        return info to null
    }

    /* ---------- Nyhetsleser (/api/rss) ---------- */

    var news by mutableStateOf<NewsData?>(null)
    /** De 5 sakene på forsiden (fra /api/mobile/home). */
    var homeNews by mutableStateOf<List<NewsItem>>(emptyList())
    var newsOpen by mutableStateOf(false)
    var newsSettings by mutableStateOf(false)
    var newsCat by mutableStateOf("siste")
    var newsBusy by mutableStateOf(false)
    var newsError by mutableStateOf<String?>(null)

    fun openNews(settings: Boolean = false) { newsOpen = true; newsSettings = settings; menuOpen = false; loadNews() }

    fun loadNews(cat: String = newsCat) = launch {
        newsCat = cat
        newsBusy = true
        try {
            news = parseNews(api.hlGet("/rss?cat=" + URLEncoder.encode(cat, "UTF-8") + "&limit=40", timeout = 8000))
            newsError = null
        } catch (e: ApiException) {
            newsError = if (e.status == 404) "Nyhetsleseren finnes ikke på serveren ennå. Oppdater homelab." else e.message
        } finally { newsBusy = false }
    }

    fun addFeed(url: String) = launch {
        val u = url.trim().let { if (it.startsWith("http")) it else "https://$it" }
        if (u.length < 10) return@launch
        newsBusy = true
        try { api.hlPost("/rss/feeds", JSONObject().put("url", u)); flash("Kilden er lagt til"); news = parseNews(api.hlGet("/rss?cat=$newsCat&limit=40")) } finally { newsBusy = false }
    }
    fun setFeedCategory(id: String, cat: String) = launch {
        api.request("PATCH", "/rss/feeds/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("category", cat), prefix = Api.HOMELAB)
        news = parseNews(api.hlGet("/rss?cat=$newsCat&limit=40"))
    }
    fun removeFeed(id: String) = launch {
        api.hlDelete("/rss/feeds/" + URLEncoder.encode(id, "UTF-8"))
        news = parseNews(api.hlGet("/rss?cat=$newsCat&limit=40"))
    }
    fun setNewsSetting(key: String, on: Boolean) = launch {
        news = news?.let { if (key == "aiSummary") it.copy(aiSummary = on) else it.copy(aiCategorize = on) }
        api.hlPut("/rss/settings", JSONObject().put(key, on))
        news = parseNews(api.hlGet("/rss?cat=$newsCat&limit=40"))
    }
    fun refreshNews() = launch {
        newsBusy = true
        try { api.request("POST", "/rss/refresh", JSONObject(), prefix = Api.HOMELAB, read = 60_000); news = parseNews(api.hlGet("/rss?cat=$newsCat&limit=40")) } finally { newsBusy = false }
    }

    /* ---------- Media (Plex og Jellyfin) ---------- */

    var media by mutableStateOf<MediaData?>(null)

    fun loadMedia() = launch {
        val now = runCatching { api.hlGet("/media/now") }
        val hist = runCatching { api.hlGet("/media/history") }
        val n = parseMediaItems(now.getOrNull())
        val h = parseMediaItems(hist.getOrNull())
        val err = (hist.exceptionOrNull() ?: now.exceptionOrNull())?.let { e ->
            if (e is ApiException && (e.status == 401 || e.status == 403)) "Media godtar ikke app-tokenet ennå. Oppdater homelab." else e.message
        }
        media = MediaData(n.first || h.first, n.second, h.second, if (hist.isFailure && now.isFailure) err else null)
    }

    /* ---------- Mat: mapper, skann oppskrift, import fra nettside, lenker og filer ---------- */

    var matFolders by mutableStateOf<List<MatFolder>>(emptyList())
    /** Valgt mappe i rettlisten (null = Alle). */
    var matFolderSel by mutableStateOf<String?>(null)
    var recipeJobs by mutableStateOf<List<RecipeJob>>(emptyList())
    var recipePreview by mutableStateOf<RecipePreview?>(null)
    var recipeBusy by mutableStateOf(false)
    /** Åpen rett (detaljark med oppskrift, mappe, lenker og filer). */
    var dishOpen by mutableStateOf<String?>(null)
    /** Skann fra «+»: «receipt» (kvittering) eller «recipe» (oppskrift på Mat-siden). */
    var scanTarget by mutableStateOf("receipt")
    private var recipePoll: kotlinx.coroutines.Job? = null

    /** Kamera/filer fra skannearket: kvittering eller oppskrift etter hvor brukeren er. */
    fun scanUris(uris: List<Uri>) { if (scanTarget == "recipe") scanRecipes(uris) else uploadUris(uris) }

    fun importRecipe(url: String) = launch {
        val u = url.trim().let { if (it.startsWith("http")) it else "https://$it" }
        recipeBusy = true
        try { recipePreview = parseRecipePreview(api.request("POST", "/recipes/import", JSONObject().put("url", u), prefix = Api.MAT, read = 90_000)) }
        finally { recipeBusy = false }
    }

    fun saveRecipe(folderId: String?) = launch {
        val p = recipePreview ?: return@launch
        recipeBusy = true
        try {
            api.matPost("/recipes/import/save", JSONObject().put("preview", JSONObject(p.raw)).put("folderId", folderId ?: JSONObject.NULL))
            recipePreview = null
            loadWeek()
            flash("${p.name.ifBlank { "Retten" }} er lagret")
        } finally { recipeBusy = false }
    }

    /** Skann oppskrift: bilder skaleres ned lokalt (HEIC blir JPEG), PDF sendes som den er. */
    fun scanRecipes(uris: List<Uri>) = launch {
        if (uris.isEmpty()) return@launch
        val ctx = getApplication<Application>()
        for (u in uris) {
            val mime = ctx.contentResolver.getType(u) ?: "image/jpeg"
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(u)?.use { it.readBytes() } } ?: continue
            val pdf = mime.contains("pdf")
            val bytes = if (pdf) data else withContext(Dispatchers.Default) { scaled(data, 2400, 85) } ?: data
            api.upload("/recipes/scan", listOf(Api.Part("file", if (pdf) "oppskrift.pdf" else "oppskrift.jpg", if (pdf) "application/pdf" else "image/jpeg", bytes)), prefix = Api.MAT)
        }
        flash(if (uris.size == 1) "✦ Oppskriften leses i bakgrunnen" else "✦ ${uris.size} oppskrifter leses i bakgrunnen")
        recipeJobs = runCatching { parseRecipeJobs(api.matGet("/recipes/jobs")) }.getOrDefault(recipeJobs)
        pollRecipes()
    }

    private fun pollRecipes() {
        if (recipePoll?.isActive == true) return
        recipePoll = viewModelScope.launch {
            repeat(60) {
                delay(3000)
                val j = runCatching { parseRecipeJobs(api.matGet("/recipes/jobs")) }.getOrNull() ?: return@launch
                val before = recipeJobs.count { it.active }
                recipeJobs = j
                if (j.count { it.active } < before) runCatching { loadWeek() }
                if (j.none { it.active }) return@launch
            }
        }
    }

    fun retryRecipeJob(id: String) = launch {
        api.matPost("/recipes/jobs/" + URLEncoder.encode(id, "UTF-8") + "/retry")
        recipeJobs = parseRecipeJobs(api.matGet("/recipes/jobs"))
        pollRecipes()
    }
    fun removeRecipeJob(id: String) = launch {
        api.request("DELETE", "/recipes/jobs/" + URLEncoder.encode(id, "UTF-8"), prefix = Api.MAT)
        recipeJobs = parseRecipeJobs(api.matGet("/recipes/jobs"))
    }

    fun addMatFolder(name: String) = launch {
        val n = name.trim().takeIf { it.isNotEmpty() } ?: return@launch
        api.matPost("/folders", JSONObject().put("name", n.take(40)))
        matFolders = parseMatFolders(api.matGet("/folders"))
    }
    fun renameMatFolder(id: String, name: String) = launch {
        api.matPatch("/folders/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("name", name.trim().take(40)))
        matFolders = parseMatFolders(api.matGet("/folders"))
    }
    fun deleteMatFolder(id: String) = launch {
        api.request("DELETE", "/folders/" + URLEncoder.encode(id, "UTF-8"), prefix = Api.MAT)
        if (matFolderSel == id) matFolderSel = null
        loadWeek()
    }
    fun setDishFolder(dishId: String, folderId: String?) = launch {
        api.matPatch("/dishes/" + URLEncoder.encode(dishId, "UTF-8"), JSONObject().put("folderId", folderId ?: JSONObject.NULL))
        loadWeek()
    }
    fun addDishLink(dishId: String, title: String, url: String) = launch {
        val u = url.trim().let { if (it.startsWith("http")) it else "https://$it" }
        api.matPost("/dishes/" + URLEncoder.encode(dishId, "UTF-8") + "/links", JSONObject().put("title", title.trim().ifBlank { u }).put("url", u))
        loadWeek()
    }
    fun uploadDishFile(dishId: String, uri: Uri) = launch {
        val ctx = getApplication<Application>()
        val mime = ctx.contentResolver.getType(uri) ?: "application/octet-stream"
        val name = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "fil"
        val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return@launch
        busy = true
        try {
            api.upload("/dishes/" + URLEncoder.encode(dishId, "UTF-8") + "/links",
                listOf(Api.Part("file", name, mime, data), Api.Part.text("title", name.substringBeforeLast('.'))), prefix = Api.MAT)
            loadWeek()
            flash("$name er lagt til")
        } finally { busy = false }
    }
    fun removeDishLink(dishId: String, linkId: String) = launch {
        api.request("DELETE", "/dishes/" + URLEncoder.encode(dishId, "UTF-8") + "/links/" + URLEncoder.encode(linkId, "UTF-8"), prefix = Api.MAT)
        loadWeek()
    }

    /** Åpner en lagret fil (krever token): lastes ned og vises i en app som kan åpne filtypen. */
    fun openDishFile(l: DishLink) = launch {
        val path = l.fileUrl ?: return@launch
        val data = api.bytes(if (path.startsWith("/")) path else "/mat/api/" + path)
        val ctx = getApplication<Application>()
        val ext = l.title.substringAfterLast('.', "").ifBlank { when (l.kind) { "pdf" -> "pdf"; "sheet" -> "xlsx"; "doc" -> "docx"; "image" -> "jpg"; else -> "bin" } }
        val f = File(File(ctx.cacheDir, "scans").apply { mkdirs() }, "mat-${l.id}.$ext").apply { writeBytes(data) }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        val mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { ctx.startActivity(view) }.onFailure { shareFile(f.name, mime, data) }
    }

    /* ---------- Prompt 14: Papir – Finans-fanelinja, Finn, Sporing, bakgrunn, onboarding og abonnementer ---------- */

    /** Papir: Finans har egen fanelinje (Oversikt, Liste, Finn, Mer). true mens brukeren er inne i Finans. */
    var paperFin by mutableStateOf(false)
    /** Siden ble åpnet fra Finans → Mer: tilbake går dit. */
    var paperFromFinMer by mutableStateOf(false)
        private set
    /** Domener i Papir: oversikt | publikum | ytelse | infra (egen fanelinje). */
    var domSection by mutableStateOf("oversikt")
    /** Første gang etter innlogging på en ny installasjon: design, bakgrunn og tilganger (3 steg). */
    var onboardNeeded by mutableStateOf(false)
    /** Rekkefølgen på kortene i Sporing (lagres per bruker som trkOrder), og redigeringsmodus (langt trykk). */
    var trkOrder by mutableStateOf(TRK_CARDS.map { it.first })
    var trkEdit by mutableStateOf(false)
    /** Papir → Sporing: fane og arket «Varsler og kilder». */
    var trkTab by mutableStateOf("active")
    var trkSettings by mutableStateOf(false)
    /** Papir → Finn: filter, åpen redigering og skjemaet «Legg til kjøp eller salg». */
    var finnSeg by mutableStateOf("all")
    var finnEdit by mutableStateOf<Int?>(null)
    var finnAdding by mutableStateOf(false)
    /** Kort hint over +-knappen («Velg filer å laste opp») etter et langt trykk. */
    var plusHint by mutableStateOf<String?>(null)
    /** Bakgrunnsvelgeren: miniatyrer per valg, valg som ikke kunne lastes, og feilmeldingen for det valgte. */
    var photoThumbs by mutableStateOf<Map<String, Bitmap?>>(emptyMap())
        private set
    var photoFailed by mutableStateOf<Set<String>>(emptySet())
        private set
    var photoError by mutableStateOf<String?>(null)
        private set

    /** Fanene i Finans-linja: ov (Oversikt), liste, finn og mer. */
    fun paperFinTab(k: String) {
        when (k) {
            "liste" -> go(Screen.List)
            "finn" -> go(Screen.Finn)
            "budsjett" -> go(Screen.Budget)
            "kvitt" -> go(Screen.Scan)
            "aksjer" -> go(Screen.Stocks)
            "abo" -> go(Screen.Sub)
            "kontoer" -> go(Screen.Accounts)
            "boliger" -> go(Screen.Folders)
            "sok" -> { if (!screen.isFinance) go(Screen.Home); paperPage = "fsok" }
            "mer", "fmer" -> { if (!screen.isFinance) go(Screen.Home); paperPage = "fmer" }
            "chat" -> { openChat(); Haptics.select(); return }
            else -> go(Screen.Home)
        }
        paperFin = true
        Haptics.select()
    }

    /** Fra Finans → Mer: siden åpnes inne i Finans, og tilbake går til Mer. */
    fun openFromFinMer(s: Screen) { go(s); paperFin = true; paperFromFinMer = true }
    fun openFinMerPage(p: String) { paperPage = p; paperFin = true; if (p == "media") loadMedia() }

    /** Domener i Papir: en av de fire seksjonene. */
    fun domainSection(k: String) { domSection = k; Haptics.select() }

    /** Bildet for et bakgrunnsvalg: serverens bilde, så reservene, med lokal hurtigbuffer. SVG hoppes over (gradienten brukes). */
    private suspend fun photoFor(kind: String): Pair<PhotoWindow?, Bitmap?> {
        val pw = runCatching { parsePhotoWindow(api.hlGet("/photo-window?kind=$kind")) }.getOrNull() ?: return null to null
        for (u in listOfNotNull(pw.url) + pw.fallbacks) {
            if (u.isBlank() || u.substringBefore('?').endsWith(".svg", true)) continue
            bgImage(u)?.let { return pw to it }
        }
        return pw to null
    }

    /** Henter et bakgrunnsbilde én gang og legger det i cacheDir/bg (bildene byttes ikke ofte). */
    private suspend fun bgImage(url: String): Bitmap? {
        val ctx = getApplication<Application>()
        val dir = File(ctx.cacheDir, "bg").apply { mkdirs() }
        val f = File(dir, Integer.toHexString(url.hashCode()) + ".img")
        // «Kun på Wi-Fi»: på mobildata brukes bare det som allerede ligger i hurtigbufferen.
        val fresh = f.exists() && (bgCacheOnly() || System.currentTimeMillis() - f.lastModified() < 3_600_000L)
        if (!f.exists() && bgCacheOnly()) return null
        val data: ByteArray? = if (fresh) withContext(Dispatchers.IO) { runCatching { f.readBytes() }.getOrNull() } else runCatching {
            val b = base.trimEnd('/')
            when {
                url.startsWith("/") -> api.bytes(url)
                b.isNotEmpty() && url.startsWith(b) -> api.bytes(url.removePrefix(b))
                else -> withContext(Dispatchers.IO) {
                    val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                    c.connectTimeout = 6000; c.readTimeout = 10000
                    c.setRequestProperty("User-Agent", "FinansHub-Android")
                    try { if (c.responseCode >= 400) null else c.inputStream.use { it.readBytes() } } finally { c.disconnect() }
                }
            }
        }.getOrNull()?.also { bytes -> withContext(Dispatchers.IO) { runCatching { f.writeBytes(bytes) } } }
            ?: if (f.exists()) withContext(Dispatchers.IO) { runCatching { f.readBytes() }.getOrNull() } else null
        if (data == null || data.isEmpty()) return null
        return withContext(Dispatchers.Default) {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, opts)
            var sample = 1
            while (maxOf(opts.outWidth, opts.outHeight) / (sample * 2) >= 1400) sample *= 2
            BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }

    /** Miniatyrene i bakgrunnsvelgeren (hentes når menyen åpnes). */
    fun loadPhotoThumbs() {
        viewModelScope.launch {
            val pv = runCatching { parseBgPreviews(api.hlGet("/background/previews", timeout = 8000)) }.getOrNull()
            if (pv.isNullOrEmpty()) { loadPhotoThumbsOld(); return@launch }
            bgPreviewInfo = pv
            for ((k, info) in pv) {
                if (photoThumbs[k] != null && k !in photoFailed) continue
                viewModelScope.launch {
                    var b: Bitmap? = null
                    for (u in listOfNotNull(info.imageUrl) + info.fallbacks) { if (u.isBlank() || u.substringBefore('?').endsWith(".svg", true)) continue; b = bgImage(withSize(u, 320)); if (b != null) break }
                    photoThumbs = photoThumbs + (k to b)
                    photoFailed = if (b == null && info.imageUrl != null) photoFailed + k else photoFailed - k
                }
            }
            if (photoKind == "custom" && photo != null) photoThumbs = photoThumbs + ("custom" to photo)
        }
    }

    private fun loadPhotoThumbsOld() {
        for (k in listOf("oslo", "weather", "planets")) {
            if (photoThumbs.containsKey(k) && k !in photoFailed) continue
            viewModelScope.launch {
                val (_, b) = photoFor(k)
                photoThumbs = photoThumbs + (k to b)
                photoFailed = if (b == null) photoFailed + k else photoFailed - k
            }
        }
        if (photoKind == "custom" && photo != null) photoThumbs = photoThumbs + ("custom" to photo)
    }

    /** «Fikk ikke lastet bildet · trykk for å prøve igjen». */
    fun retryPhoto(k: String) {
        val ctx = getApplication<Application>()
        File(ctx.cacheDir, "bg").listFiles()?.forEach { it.setLastModified(0) }
        photoFailed = photoFailed - k
        photoThumbs = photoThumbs - k
        if (k == photoKind) loadPhoto() else loadPhotoThumbs()
    }

    /** Flytter et kort i Sporing opp (−1) eller ned (+1). Lagres per bruker på serveren. */
    fun moveTrk(id: String, dir: Int) {
        val l = trkOrder.toMutableList()
        val i = l.indexOf(id)
        val j = i + dir
        if (i < 0 || j !in l.indices) return
        l.removeAt(i); l.add(j, id)
        trkOrder = l
        Haptics.select()
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("trkOrder", JSONArray(l))) } }
    }

    /** Onboarding (3 steg) er ferdig: lagres på enheten og på serveren. */
    fun finishOnboarding() {
        onboardNeeded = false
        prefs.set(AppPrefs.ONBOARDED + (account?.id ?: ""), true)
        prefs.set(AppPrefs.FRESH_PAPIR, false)
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("onboarded", true)) } }
    }

    /* Finn i Papir: legg til, rediger, steg, slett og vedlegg. */

    /** «+ Legg til kjøp eller salg»: med Finn-lenke henter serveren tittel, pris, tekst og bilder (✦ AI). */
    fun finnCreate(role: String, link: String, title: String, price: String, who: String) = launch {
        val amount = parseAmountNo(price)
        val r = if (role == "sold") "sold" else "bought"
        val url = link.trim().takeIf { it.contains("finn.no") || Regex("""^\d{6,12}$""").matches(it) }
            ?.let { if (it.all(Char::isDigit)) "https://www.finn.no/recommerce/forsale/item/$it" else if (it.startsWith("http")) it else "https://$it" }
        if (url == null && (title.isBlank() || amount == null || amount <= 0)) { flash("Skriv inn tittel og pris, eller lim inn en Finn-lenke"); return@launch }
        // Med adUrl kan tittel og pris stå tomme: serveren henter annonsen selv (✦ AI), og handelen lages selv om hentingen feiler.
        val body = JSONObject().put("role", r).put("item", title.trim()).put("counterpart", who.trim())
        if (amount != null) body.put("amount", amount)
        if (url != null) body.put("adUrl", url)
        busy = true
        try {
            val res = JSONObject(api.request("POST", "/finn", body, read = 90_000))
            finn = parseFinn(api.get("/finn"))
            finnAdding = false
            finnSeg = "all"
            val err = res.optStr("adError")
            flash(if (err != null) "Lagret, men annonsen kunne ikke hentes: $err" else if (r == "sold") "Salget er lagt til" else "Kjøpet er lagt til")
        } finally { busy = false }
    }

    /** Lagrer tittel, pris, person og status (steg 1–4). */
    fun finnSave(id: Int, title: String, price: String, who: String, stage: Int?) = launch {
        val body = JSONObject().put("item", title.trim()).put("counterpart", who.trim())
        parseAmountNo(price)?.let { body.put("amount", it) }
        if (stage != null) body.put("stage", stage)
        api.patch("/finn/$id", body)
        finn = parseFinn(api.get("/finn"))
        finnEdit = null
        flash("Handelen er lagret")
    }

    fun finnStage(id: Int, stage: Int) = launch {
        api.patch("/finn/$id", JSONObject().put("stage", stage))
        finn = parseFinn(api.get("/finn"))
        Haptics.select()
    }

    fun finnDelete(id: Int) = launch {
        api.delete("/finn/$id")
        finnEdit = null
        finn = parseFinn(api.get("/finn"))
        flash("Handelen er slettet")
    }

    /** Kvittering og bilder til en handel fra Papir-rutenettet. */
    fun finnUploadFor(id: Int, kind: String, uris: List<Uri>) { finnSel = id; finnUpload(kind, uris) }

    /* Abonnementer: rediger og legg til (prompt 14). */

    /**
     * Lagrer et abonnement: navn, plan, pris, syklus (monthly | yearly | biennial), faktureringsdato (dag + måned),
     * kategori og status (active | paused | cancelled). id = null lager et nytt. Returnerer id-en via onSaved.
     */
    fun saveSub(id: Int?, name: String, plan: String, price: Double, cycle: String, billDay: Int?, billMonth: Int?, category: String, status: String, logo: Uri? = null) = launch {
        val body = JSONObject().put("name", name.trim()).put("plan", plan.trim()).put("price", price).put("cycle", cycle).put("category", category)
            .put("status", status).put("active", status != "cancelled")
            .put("billDay", billDay ?: JSONObject.NULL).put("billMonth", billMonth ?: JSONObject.NULL)
        if (billDay != null) body.put("chargeDay", billDay)
        busy = true
        try {
            val res = if (id == null) api.post("/subscriptions", body) else api.patch("/subscriptions/$id", body)
            val newId = id ?: runCatching { JSONObject(res).let { it.optJSONObject("item")?.optInt("id") ?: it.optInt("id") } }.getOrNull()?.takeIf { it > 0 }
            if (logo != null && newId != null) uploadSubLogo(newId, logo)
            loadSubs()
            flash(if (id == null) "${name.trim()} er lagt til" else "${name.trim()} er lagret")
        } finally { busy = false }
    }

    fun deleteSub(id: Int) = launch {
        api.delete("/subscriptions/$id")
        loadSubs()
        flash("Abonnementet er slettet")
    }

    private suspend fun uploadSubLogo(id: Int, uri: Uri) {
        val ctx = getApplication<Application>()
        val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } } ?: return
        val png = withContext(Dispatchers.Default) { scaled(data, 512, 92) } ?: data
        api.upload("/subscriptions/$id/logo", listOf(Api.Part("file", "logo.jpg", "image/jpeg", png)))
    }

    /** «Last opp logo» på et lagret abonnement. */
    fun subLogoUpload(id: Int, uri: Uri) = launch {
        busy = true
        try { uploadSubLogo(id, uri); loadSubs(); flash("Logoen er lagret") } finally { busy = false }
    }

    /** «✦ Finn logo med AI»: serveren slår opp tjenestens domene og henter logoen. */
    fun subLogoAi(id: Int) = launch {
        busy = true
        try {
            val r = JSONObject(api.request("POST", "/subscriptions/$id/logo/ai", JSONObject(), read = 60_000))
            loadSubs()
            flash(if (r.optStr("logoUrl") != null) "✦ Fant logoen${r.optStr("domain")?.let { " ($it)" } ?: ""}" else "Fant ingen logo. Last opp en selv.")
        } catch (e: ApiException) {
            flash(if (e.status == 404) "Fant ingen logo. Last opp en selv." else "Kunne ikke finne logo: ${e.message}")
        } finally { busy = false }
    }

    /** Logo lastet opp eller funnet av AI (krever token). */
    suspend fun subLogo(url: String): Bitmap? = if (url.startsWith("/")) image(url) else null

    /** «1 234,50», «1234.5» eller «−200» som tall. */
    private fun parseAmountNo(s: String): Double? = s.replace(" ", "").replace("\u00a0", "").replace("kr", "").replace("−", "-").replace(',', '.').trim().toDoubleOrNull()

    /* ---------- Prompt 15: tilpassede sider, Finans-fanelinja, fjerde fane, flytende skann, vær og detaljer ---------- */

    /** Rekkefølge og skjulte kort per side (layout.pages). Lagres per bruker; serveren fletter én side om gangen. */
    var pageLayouts by mutableStateOf<Map<String, PageLay>>(emptyMap())
        private set
    /** Siden som er i redigeringsmodus (langt trykk på et kort), ellers null. */
    var editPage by mutableStateOf<String?>(null)

    fun pageOrder(page: String, keys: List<String>): List<String> {
        val saved = (pageLayouts[page]?.order ?: emptyList()).filter { it in keys }.distinct()
        // Prompt 24: nye kort (f.eks. Bursdager h9) legges inn etter nærmeste kort foran dem i standardrekkefølgen,
        // i tillegg til den lagrede rekkefølgen. Ingenting erstattes eller faller ut.
        val out = saved.toMutableList()
        keys.forEachIndexed { i, k ->
            if (k in out) return@forEachIndexed
            // Prompt 26: Kalender (h10) legges nederst når brukeren har et lagret oppsett (ellers etter Avganger).
            if (page == "hjem" && k == "h10" && saved.isNotEmpty()) { out.add(k); return@forEachIndexed }
            val prev = keys.subList(0, i).lastOrNull { it in out }
            out.add(if (prev == null) 0 else out.indexOf(prev) + 1, k)
        }
        return out
    }
    fun pageHidden(page: String): Set<String> {
        val h = pageLayouts[page]?.hidden?.toSet() ?: emptySet()
        // Prompt 24: Pakker (h2) vises alltid på Hjem, også om en eldre migrering skjulte den. Skjuler brukeren den selv etterpå, gjelder det.
        return if (page == "hjem" && "h2" in h && !prefs.bool("p24_h2_user")) h - "h2" else h
    }

    /** Flytter et synlig kort opp (−1) eller ned (+1) forbi nabokortet som vises. */
    /** Prompt 37: live = under dra (bare state, ingen disk/nett/haptikk); lagres én gang ved slipp (commitPage37). */
    fun movePageItem(page: String, keys: List<String>, key: String, dir: Int, live: Boolean = false) {
        val order = pageOrder(page, keys).toMutableList()
        val hid = pageHidden(page)
        val vis = order.filter { it !in hid }
        val v = vis.indexOf(key)
        val other = vis.getOrNull(v + dir) ?: return
        val a = order.indexOf(key); val b = order.indexOf(other)
        order[a] = other; order[b] = key
        if (live) { pageLayouts = pageLayouts + (page to PageLay(order, hid.toList())); p37.dirty.add(page); return }
        savePage(page, PageLay(order, hid.toList()))
    }
    fun hidePageItem(page: String, keys: List<String>, key: String) {
        if (page == "hjem" && key == "h2") prefs.set("p24_h2_user", true)
        savePage(page, PageLay(pageOrder(page, keys), (pageHidden(page) + key).toList()))
    }
    fun showPageItem(page: String, keys: List<String>, key: String) {
        savePage(page, PageLay(pageOrder(page, keys), (pageHidden(page) - key).toList()))
    }
    fun resetPage(page: String) { savePage(page, PageLay()) }

    private fun savePage(page: String, l: PageLay) {
        pageLayouts = pageLayouts + (page to l)
        Haptics.select()
        prefs.set(AppPrefs.PAGES_LAYOUT + (account?.id ?: ""), JSONObject().apply { pageLayouts.forEach { (k, v) -> put(k, v.toJson()) } }.toString())
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("pages", JSONObject().put(page, l.toJson()))) } }
    }

    /** Fanene i Finans-linja (opptil 4, «Mer» er alltid sist). */
    var paperFinTabs by mutableStateOf(FIN_TABS_DEFAULT)
        private set
    fun updatePaperFinTabs(l: List<String>) {
        val v = l.distinct().filter { k -> FIN_TABS.any { it.first == k } }.take(5).ifEmpty { listOf("oversikt") }
        paperFinTabs = v
        prefs.set(AppPrefs.FIN_TABS + (account?.id ?: ""), v.joinToString(","))
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("finTabs", JSONArray(v))) } }
    }

    /** Fjerde fane i hovedlinja: «auto» (Domener, eller Sporing når pakker er på vei), «domener» eller «sporing». */
    val fourthTab: String get() = option(AppPrefs.FOURTH_TAB, "auto")
    fun setFourthTab(v: String) {
        setPref(AppPrefs.FOURTH_TAB, v)
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("fourthTab", v)) } }
    }
    /** Pakker som er hentet, i transport eller klar for henting. */
    val packagesOnWay: Int get() = (tracking?.items ?: homePackages ?: emptyList()).count { !it.archived && !it.done && it.step in 1..3 }
    /** Hvilken modul som står i fanelinja: «sporing» eller «domener». */
    val tab4: String get() = when (fourthTab) { "sporing" -> "sporing"; "domener" -> "domener"; else -> if (packagesOnWay > 0) "sporing" else "domener" }

    /** Skanneknappen: «float» (flytende over linja, Søk i linja) eller «inline» (+ i linja). */
    val fabStyle: String get() = option(AppPrefs.FAB_STYLE, "float")
    fun setFabStyle(v: String) {
        setPref(AppPrefs.FAB_STYLE, v)
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("fab", v)) } }
    }

    /** Leses fra layout ved oppstart (og fra enheten først, så siden ikke hopper). */
    fun applyLayout15(raw: String) {
        val l = runCatching { parseLayout15(raw) }.getOrNull() ?: return
        if (l.pages.isNotEmpty()) pageLayouts = pageLayouts + l.pages
        if (l.finTabs.isNotEmpty()) paperFinTabs = l.finTabs
        l.fourthTab?.let { prefs.set(AppPrefs.FOURTH_TAB, it) }
        l.fab?.let { prefs.set(AppPrefs.FAB_STYLE, it) }
    }
    fun loadLocalLayout15() {
        val id = account?.id ?: ""
        prefs.str(AppPrefs.PAGES_LAYOUT + id, "").takeIf { it.isNotBlank() }?.let { raw ->
            runCatching {
                val o = JSONObject(raw)
                pageLayouts = o.keys().asSequence().associateWith { k -> o.getJSONObject(k).let { v -> PageLay(v.optJSONArray("order").strings(), v.optJSONArray("hidden").strings()) } }
            }
        }
        prefs.str(AppPrefs.FIN_TABS + id, "").takeIf { it.isNotBlank() }?.let { paperFinTabs = it.split(',').filter { k -> FIN_TABS.any { t -> t.first == k } }.ifEmpty { FIN_TABS_DEFAULT } }
    }

    /* Antall kvitteringer til gjennomgang (banneret i Finans → Oversikt). */
    var reviewCount by mutableStateOf<Int?>(null)
        private set
    suspend fun loadReviewCount() {
        if (!loggedIn) return
        runCatching { JSONObject(api.get("/receipts?status=needs_review&count=1")).optInt("count", -1) }.getOrNull()?.takeIf { it >= 0 }?.let { reviewCount = it }
    }
    /** Banneret: trykk på teksten åpner køen filtrert på «Til gjennomgang». */
    fun openReview() {
        reviewFilter = true
        if (paper) openFromFinMer(Screen.Scan) else open(Screen.Scan)
        // Køen åpnes på første kvittering som er lest av AI og venter på bekreftelse.
        launch { if (receipts == null) loadReceipts(); selectedReceipt = receipts?.firstOrNull { it.status == "needs_review" }?.id }
    }
    var reviewFilter by mutableStateOf(false)

    /** De 15 siste transaksjonene i Finans → Oversikt. */
    var recent15 by mutableStateOf<List<Tx>?>(null)
        private set
    suspend fun loadRecent15() { runCatching { parseTxList(api.get("/transactions?limit=15")) }.getOrNull()?.let { recent15 = it.take(15) } }

    /* Transaksjonsdetaljer i Papir (Finans → Liste → trykk på en rad). */
    var txDetail by mutableStateOf<TxDetail?>(null)
        private set
    var txDetailError by mutableStateOf<String?>(null)
        private set
    var txCatSheet by mutableStateOf(false)
    var txBankSheet by mutableStateOf(false)
    var receiptFull by mutableStateOf<Bitmap?>(null)

    /** Åpner detaljene for en transaksjon (fra Liste, Oversikt eller Søk). */
    fun openTx(id: Int) {
        selectedTx = id
        if (txDetail?.tx?.id != id) txDetail = null
        txDetailError = null
        launch { loadTxDetail(id) }
    }
    suspend fun loadTxDetail(id: Int) {
        try {
            txDetail = parseTxDetail(api.get("/transactions/$id"))
        } catch (e: ApiException) {
            // Eldre server uten GET /transactions/:id: bygg detaljene av listen og originalen.
            val t = (txs ?: emptyList()).firstOrNull { it.id == id } ?: recent15?.firstOrNull { it.id == id } ?: summary?.recent?.firstOrNull { it.id == id }
            if (t == null) { txDetailError = e.message; return }
            val orig = runCatching { parseOriginal(api.get("/transactions/$id/original")) }.getOrNull()
            txDetail = TxDetail(t, t.aiLong ?: t.aiShort,
                if (t.receipt == null && orig?.receipt == null) null else TxReceipt(orig?.receipt?.id ?: t.receiptId, if (t.receipt == "booked") "attached" else "needs_review",
                    orig?.receipt?.fileUrl, orig?.receipt?.mime, t.lines, null, t.aiShort),
                orig?.bankRow?.let { b -> TxBank(b.bookingDate, b.valueDate, b.description, null, b.amount, b.account, b.archiveReference) })
        }
    }
    /** «Endre kategori», eventuelt med en regel for fremtidige transaksjoner fra samme butikk. */
    fun setTxCategoryRule(id: Int, categoryId: Int, rule: Boolean) = launch {
        api.patch("/transactions/$id", JSONObject().put("categoryId", categoryId))
        val t = txDetail?.tx
        if (rule && t != null) {
            val pattern = (t.merchant ?: t.description).trim().uppercase().split(Regex("\\s+")).take(2).joinToString(" ").take(60)
            runCatching { api.post("/rules", JSONObject().put("pattern", pattern).put("categoryId", categoryId)) }
        }
        txCatSheet = false
        loadTxDetail(id)
        runCatching { loadTx() }
        summary = runCatching { parseSummary(api.get("/summary")) }.getOrDefault(summary)
        flash(if (rule) "Kategori endret, og regelen gjelder fremover" else "Kategori endret")
    }
    /** Originalbildet av kvitteringen i fullskjerm (med zoom). PDF åpnes i en annen app. */
    fun openReceiptFull(r: TxReceipt) = launch {
        val url = r.fileUrl ?: return@launch
        if (r.mime?.contains("pdf") == true) {
            val data = api.bytes(url)
            val ctx = getApplication<Application>()
            val f = File(File(ctx.cacheDir, "scans").apply { mkdirs() }, "kvittering-${r.id ?: "x"}.pdf").apply { writeBytes(data) }
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
            val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { ctx.startActivity(view) }.onFailure { shareFile(f.name, "application/pdf", data) }
            return@launch
        }
        receiptFull = image(url) ?: run { flash("Fikk ikke hentet kvitteringen"); null }
    }

    /* Finans → Søk i Papir: vanlig søk, eller ✦ AI med svar-kort øverst. */
    var finSearchQ by mutableStateOf("")
    var finSearchAi by mutableStateOf(false)
    var finSearch by mutableStateOf<AiAnswer?>(null)
        private set
    var finSearchBusy by mutableStateOf(false)
        private set
    fun runFinSearch(q: String = finSearchQ, ai: Boolean = finSearchAi) {
        val t = q.trim()
        if (t.isBlank()) { finSearch = null; return }
        finSearchBusy = true
        launch {
            try {
                // Enkle enkeltord søkes alltid vanlig først.
                val simple = !t.contains(' ') && t.length < 20
                finSearch = if (!ai || simple) plainSearchPublic(t).let { a -> if (ai && a.hits.isEmpty()) aiSearch(t) ?: a else a } else aiSearch(t) ?: plainSearchPublic(t)
            } finally { finSearchBusy = false }
        }
    }
    private suspend fun aiSearch(q: String): AiAnswer? = runCatching {
        parseAi(aiSearchRaw25(JSONObject().put("q", q).put("force", true)), q)
    }.getOrNull()?.takeIf { !it.aiUnavailable }
    private suspend fun plainSearchPublic(q: String): AiAnswer {
        val enc = URLEncoder.encode(q, "UTF-8")
        return try { parsePlain(api.get("/search?q=$enc"), q) } catch (e: ApiException) {
            val list = parseTxList(api.get("/transactions?limit=40&q=$enc"))
            AiAnswer(q, if (list.isEmpty()) "Ingen treff." else "${list.size} treff.",
                list.map { SearchHit("tx", it.id, it.receiptId, it.merchant ?: it.description, it.date, it.amount, it.source, "${it.category} · navn") },
                null, emptyList(), mode = "plain")
        }
    }

    /* Vær i appen (trykk på temperaturen på Hjem). */
    var weatherOpen by mutableStateOf(false)
    var weatherFull by mutableStateOf<WeatherFull?>(null)
        private set
    var weatherError by mutableStateOf<String?>(null)
        private set
    var weatherPlace by mutableStateOf("oslo")
        private set
    /** «Forhold»-arket: valgt dag (0 = i dag), null = lukket. */
    var weatherSheetDay by mutableStateOf<Int?>(null)
    fun openWeather() { weatherOpen = true; if (weatherFull == null || weatherFull?.placeId != weatherPlace) loadWeather(weatherPlace) }
    fun loadWeather(place: String) {
        weatherPlace = place
        weatherError = null
        launch {
            try {
                // Prompt 35: «geo:lat,lon,navn» = midlertidig sted fra AI-søket («været i New York»).
                val q = if (place.startsWith("geo:")) place.removePrefix("geo:").split(',', limit = 3).let { g ->
                    "lat=" + g.getOrElse(0) { "" } + "&lon=" + g.getOrElse(1) { "" } + "&name=" + URLEncoder.encode(g.getOrElse(2) { "" }, "UTF-8")
                } else "place=" + URLEncoder.encode(place, "UTF-8")
                val raw = api.hlGet("/weather/full?$q", timeout = 15_000)
                weatherFull = parseWeatherFull(raw)
                loadWxCmp22(place, raw)
            }
            catch (e: ApiException) { weatherError = if (e.status == 404) "Værappen trenger en nyere Homelab-server." else e.message }
        }
    }

    /* Ny sending (den flytende knappen på Sporing). */
    var trkAddOpen by mutableStateOf(false)

    /* Domener i Papir: «Alle domener» som kort, ett per domene. */
    var domAll by mutableStateOf(false)
    var domAllStats by mutableStateOf<Map<String, Analytics?>>(emptyMap())
        private set
    fun showAllDomains() {
        domAll = true
        val list = domains ?: return
        for (d in list) if (!domAllStats.containsKey(d.name)) viewModelScope.launch {
            val a = runCatching { parseAnalytics(api.domGet("/" + URLEncoder.encode(d.name, "UTF-8") + "/analytics?range=$domRange")) }.getOrNull()
            domAllStats = domAllStats + (d.name to a)
        }
    }
    fun pickDomainPaper(name: String) { domAll = false; pickDomain(name) }
    fun setRangePaper(r: String) { domAllStats = emptyMap(); setRange(r); if (domAll) showAllDomains() }

    /* ---------- Prompt 16: fanelinja, ikonfarger, vær-steder, avganger, Boliger og Familie ---------- */

    /** Papir-hovedlinja slik brukeren har satt den opp (tom = standard). «Hjem» kommer bare på Hjem, og bare én linje vises. */
    var tabBar by mutableStateOf<List<TabItem>>(emptyList())
        private set
    var tabEdit by mutableStateOf(false)
    fun tabBarItems(): List<TabItem> = tabBar.ifEmpty {
        MAIN_TABS_DEFAULT.map { id -> if (id == "domener" && tab4 == "sporing") "sporing" else id }.mapNotNull { id -> MAIN_TABS.firstOrNull { it.id == id } }
    }
    fun saveTabBar(list: List<TabItem>) {
        val v = list.distinctBy { it.id }.filter { t -> MAIN_TABS.any { it.id == t.id } }.let { l -> l.filter { it.id != "mer" } + (l.firstOrNull { it.id == "mer" } ?: MAIN_TABS.first { it.id == "mer" }) }.take(6)
        tabBar = v
        Haptics.select()
        prefs.set(AppPrefs.TAB_BAR + (account?.id ?: ""), JSONArray().apply { v.forEach { put(it.toJson()) } }.toString())
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("tabBar", JSONObject().put("items", JSONArray().apply { v.forEach { put(it.toJson()) } }))) } }
    }
    fun resetTabBar() {
        tabBar = emptyList()
        prefs.set(AppPrefs.TAB_BAR + (account?.id ?: ""), "")
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("tabBar", JSONObject().put("items", JSONArray()))) } }
    }

    /** Fargetema for ikonene i Innstillinger («standard» er dagens farger). */
    val iconTheme: String get() = option(AppPrefs.ICON_THEME, "standard")
    fun updateIconTheme(v: String) {
        setPref(AppPrefs.ICON_THEME, v)
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("iconTheme", v)) } }
    }

    fun applyLayout16(raw: String) {
        val l = runCatching { parseLayout16(raw) }.getOrNull() ?: return
        if (l.tabBar.isNotEmpty()) tabBar = l.tabBar
        l.iconTheme?.let { prefs.set(AppPrefs.ICON_THEME, it); prefTick++ }
        applyNavStyle25(raw)
        applySearchEngine29(raw)
        applyLayout30(raw)
    }
    fun loadLocalLayout16() {
        loadNavStyle25()
        loadSearchEngine29()
        loadHsTimeout32b()
        prefs.str(AppPrefs.TAB_BAR + (account?.id ?: ""), "").takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { tabBar = parseLayout16(JSONObject().put("tabBar", JSONObject().put("items", JSONArray(raw))).toString()).tabBar }
        }
    }

    /* Vær: egne steder (søk, legg til, fjern). Data fra MET/yr.no via serveren. */
    var wxPlaces by mutableStateOf<List<WxPlace>>(emptyList())
        private set
    var wxSearch by mutableStateOf<List<WxPlace>>(emptyList())
        private set
    var wxSearchBusy by mutableStateOf(false)
        private set
    var wxPlacesSheet by mutableStateOf(false)
    fun loadWxPlaces() = launch {
        wxPlaces = runCatching { parseWxPlaces(api.hlGet("/weather/places")) }.getOrNull()
            ?: WX_PLACES.map { (id, n) -> WxPlace(id, n, 0.0, 0.0, "") }
    }
    /** Prompt 28: søket feilet (nett/server), og søket svarene gjelder (så «Fant ingen» ikke vises før søket er ferdig). */
    var wxSearchFailed by mutableStateOf(false)
        private set
    var wxSearchDoneQ by mutableStateOf("")
        private set
    private var wxSearchJob: kotlinx.coroutines.Job? = null
    /**
     * Stedssøk (prompt 28): GET /api/weather/places?q= (Open-Meteo + foldet variant + Nominatim, slått sammen på serveren).
     * Reserve: eldre server svarer 404, eller ignorerer q og gir lagrede steder – da brukes /weather/search som før.
     * Debounce 250 ms, minst 2 tegn.
     */
    fun searchWxPlaces(q: String) {
        wxSearchJob?.cancel()
        val t = q.trim()
        if (t.length < 2) { wxSearch = emptyList(); wxSearchFailed = false; wxSearchDoneQ = ""; wxSearchBusy = false; return }
        wxSearchJob = viewModelScope.launch {
            kotlinx.coroutines.delay(250)
            wxSearchBusy = true
            val enc = URLEncoder.encode(t, "UTF-8")
            try {
                val res = try { parseWxSearch28(api.hlGet("/weather/places?q=$enc", timeout = 15_000)) }
                    catch (e: ApiException) { if (e.status == 404) null else throw e }
                wxSearch = res ?: parseWxPlaces(api.hlGet("/weather/search?q=$enc"))
                wxSearchFailed = false
                wxSearchDoneQ = t
                wxSearchBusy = false
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                wxSearch = emptyList()
                wxSearchFailed = true
                wxSearchDoneQ = t
                wxSearchBusy = false
            }
        }
    }
    fun addWxPlace(p: WxPlace) = launch {
        val body = JSONObject().put("name", p.name).put("lat", p.lat).put("lon", p.lon).put("region", p.region)
        val r = runCatching { api.hlPost("/weather/places", body) }.getOrNull()
        wxPlaces = runCatching { parseWxPlaces(api.hlGet("/weather/places")) }.getOrNull() ?: (wxPlaces + p)
        wxSearch = emptyList()
        flash(if (r != null) "${p.name} er lagt til" else "Kunne ikke lagre ${p.name}")
        wxPlaces.lastOrNull { it.name == p.name }?.let { loadWeatherAt(it) }
    }
    fun removeWxPlace(id: String) = launch {
        runCatching { api.hlDelete("/weather/places/" + URLEncoder.encode(id, "UTF-8")) }
        wxPlaces = wxPlaces.filter { it.id != id }
        if (weatherPlace == id) wxPlaces.firstOrNull()?.let { loadWeatherAt(it) }
    }
    /** Været for et sted: kjente steder med ID, egne steder med koordinater. */
    fun loadWeatherAt(p: WxPlace) = loadWeather(p.id)

    /* ---------- Prompt 22: Yr og Pent, steder i egen rekkefølge, Huskeliste ↔ HA, logo for fraktselskap ---------- */

    /** «Yr og Pent» på værsiden: lastes automatisk når værsiden åpnes eller stedet byttes. */
    var wxCmp22 by mutableStateOf<WxCmp22?>(null)
        private set
    var wxCmp22Busy by mutableStateOf(false)
        private set
    var wxCmp22Failed by mutableStateOf(false)
        private set
    private var wxCmp22Place: String? = null
    /** compare i /weather/full (ny server), ellers /weather/compare (eldre). 404 på begge: kortet sier at Pent ikke svarte. */
    private fun loadWxCmp22(place: String, raw: String?) {
        val fromFull = raw?.let { r -> runCatching { parseWxCmp22(JSONObject(r).optJSONObject("compare")) }.getOrNull() }
        if (fromFull != null) { wxCmp22 = fromFull; wxCmp22Place = place; wxCmp22Failed = false; return }
        if (wxCmp22Place == place && wxCmp22 != null) return
        wxCmp22 = null
        wxCmp22Failed = false
        wxCmp22Busy = true
        viewModelScope.launch {
            val c = runCatching { parseWxCmp22(JSONObject(api.hlGet("/weather/compare?" + (if (place.startsWith("geo:")) place.removePrefix("geo:").split(',', limit = 3).let { g -> "lat=" + g.getOrElse(0) { "" } + "&lon=" + g.getOrElse(1) { "" } + "&name=" + URLEncoder.encode(g.getOrElse(2) { "" }, "UTF-8") } else "place=" + URLEncoder.encode(place, "UTF-8")), timeout = 15_000))) }.getOrNull()
            if (weatherPlace == place) {
                wxCmp22 = c
                wxCmp22Place = place
                wxCmp22Failed = c == null
            }
            wxCmp22Busy = false
        }
    }

    /** Steder: hold inne og dra for å endre rekkefølgen. Lagres med PUT /weather/places/order. */
    fun reorderWxPlaces(list: List<WxPlace>) {
        wxPlaces = list
        viewModelScope.launch { runCatching { api.hlPut("/weather/places/order", JSONObject().put("ids", JSONArray(list.map { it.id }))) } }
    }

    /** Bare admin ser og endrer synken med Home Assistant To-do. */
    val userIsAdmin: Boolean get() = (me?.role ?: account?.role) == "admin"
    var tasksHa by mutableStateOf<TasksHa?>(null)
        private set
    var tasksHaBusy by mutableStateOf(false)
        private set
    /** GET /api/tasks/ha. Eldre server (404) eller ikke admin: seksjonen vises ikke. */
    fun loadTasksHa() {
        if (!userIsAdmin) { tasksHa = null; return }
        viewModelScope.launch { tasksHa = runCatching { parseTasksHa(api.hlGet("/tasks/ha")) }.getOrNull() }
    }
    fun setTasksHaOn(on: Boolean) {
        tasksHa = tasksHa?.copy(enabled = on, status = if (on) "connecting" else "off")
        tasksHaCall { api.hlPut("/tasks/ha", JSONObject().put("enabled", on)) }
    }
    fun mapTasksHa(listId: String, entityId: String?) {
        tasksHa = tasksHa?.let { h -> h.copy(maps = if (entityId == null) h.maps - listId else h.maps + (listId to entityId)) }
        tasksHaCall { api.hlPut("/tasks/ha/map", JSONObject().put("listId", listId).put("entityId", entityId ?: JSONObject.NULL)) }
    }
    fun syncTasksHa() = tasksHaCall { api.hlPost("/tasks/ha/sync") }
    /** «+ Lag ny liste i HA»: lager listen i HA og kobler den til listen i appen. */
    fun createTasksHaList(listId: String, name: String) = tasksHaCall {
        val r = JSONObject(api.hlPost("/tasks/ha/create", JSONObject().put("name", name)))
        val id = r.optStr("entity_id") ?: r.optStr("entityId") ?: r.optJSONObject("entity")?.optStr("entity_id")
        if (id != null) api.hlPut("/tasks/ha/map", JSONObject().put("listId", listId).put("entityId", id))
    }
    private fun tasksHaCall(f: suspend () -> Unit) {
        viewModelScope.launch {
            tasksHaBusy = true
            try {
                f()
                Haptics.success()
            } catch (e: ApiException) {
                message = if (e.status == 404) "Synk med Home Assistant trenger en nyere Homelab-server." else e.message
            } catch (e: Exception) {
                message = e.message ?: "Home Assistant svarte ikke"
            } finally {
                tasksHa = runCatching { parseTasksHa(api.hlGet("/tasks/ha")) }.getOrNull() ?: tasksHa
                runCatching { loadTasksNow() }
                tasksHaBusy = false
            }
        }
    }

    /**
     * Logo for fraktselskap: bare manuelt kontrollerte filer fra logobiblioteket (/finans/api/logos/file/:id).
     * Aldri et tilfeldig favicon; mangler filen, viser appen fargefyll med selskapsnavnet.
     */
    suspend fun carrierRegLogo(domain: String?, name: String?): Bitmap? {
        val item = logoItem(domain, name)?.takeIf { it.hasFile } ?: return null
        val key = "reg:" + item.id
        logos[key]?.let { return it }
        val f = java.io.File(java.io.File(appCtx.cacheDir, "logos").apply { mkdirs() }, item.id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".png")
        val b = withContext(Dispatchers.IO) { runCatching { if (f.exists() && System.currentTimeMillis() - f.lastModified() < 7L * 24 * 3600_000) BitmapFactory.decodeFile(f.path) else null }.getOrNull() }
            ?: runCatching {
                val bytes = api.bytes("/finans/api/logos/file/" + URLEncoder.encode(item.id, "UTF-8"))
                withContext(Dispatchers.IO) { runCatching { f.writeBytes(bytes) } }
                withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
            }.getOrNull()
        if (b != null) logos[key] = b
        return b
    }

    /* Avganger: egen side i nyhetsleser-stil. Egne stopp med ekte sanntid fra Entur. */
    var ruterOpen by mutableStateOf(false)
    var myStops by mutableStateOf<List<StopRef>>(emptyList())
        private set
    var stopDeps by mutableStateOf<Map<String, StopDeps>>(emptyMap())
        private set
    var stopSel by mutableStateOf<String?>(null)
    /** Prompt 21: avgangen som er utvidet med stoppliste (bare én om gangen). */
    var depOpen by mutableStateOf<String?>(null)
    /** Ruter-bildet øverst i Avganger (GET /api/background?type=ruter). null = gradient. */
    var ruterPhoto by mutableStateOf<Bitmap?>(null)
        private set
    private var ruterPhotoTried = false
    fun loadRuterPhoto() {
        if (ruterPhoto != null || ruterPhotoTried) return
        ruterPhotoTried = true
        viewModelScope.launch { runCatching { backgroundFor("ruter")?.second }.getOrNull()?.let { ruterPhoto = it } }
    }
    var stopEdit by mutableStateOf(false)
    var stopAddOpen by mutableStateOf(false)
    var stopSearch by mutableStateOf<List<StopRef>>(emptyList())
        private set
    var stopSearchBusy by mutableStateOf(false)
        private set
    var stopsError by mutableStateOf<String?>(null)
        private set
    private var ruterJob: kotlinx.coroutines.Job? = null
    fun openRuter() {
        ruterOpen = true
        stopEdit = false
        ruterJob?.cancel()
        ruterJob = viewModelScope.launch {
            loadStopsNow()
            // Sanntid: nye tider hvert 30. sekund mens siden er åpen.
            while (ruterOpen) { kotlinx.coroutines.delay(30_000); if (ruterOpen) refreshDeps() }
        }
    }
    fun closeRuter() { ruterOpen = false; stopEdit = false; ruterJob?.cancel() }
    private suspend fun loadStopsNow() {
        stopsError = null
        try {
            myStops = parseStopList(api.hlGet("/me/stops"))
            if (stopSel == null || myStops.none { it.id == stopSel }) stopSel = myStops.firstOrNull()?.id
            refreshDeps()
        } catch (e: ApiException) {
            stopsError = if (e.status == 404) "Avganger med egne stopp trenger en nyere Homelab-server." else e.message
        }
    }
    private suspend fun refreshDeps() {
        val out = stopDeps.toMutableMap()
        for (st in myStops) {
            runCatching { parseStopDeps(api.hlGet("/ruter/departures?stop=" + URLEncoder.encode(st.id, "UTF-8") + "&n=20", timeout = 12_000)) }
                .getOrNull()?.let { out[st.id] = it.copy(stop = it.stop.copy(name = st.name.ifBlank { it.stop.name })) }
        }
        stopDeps = out
    }
    fun refreshStops() = launch { refreshDeps() }
    private var stopSearchJob: kotlinx.coroutines.Job? = null
    fun searchStops(q: String) {
        stopSearchJob?.cancel()
        if (q.trim().length < 2) { stopSearch = emptyList(); return }
        stopSearchJob = viewModelScope.launch {
            kotlinx.coroutines.delay(250)
            stopSearchBusy = true
            try { stopSearch = runCatching { parseStopList(api.hlGet("/ruter/search?q=" + URLEncoder.encode(q.trim(), "UTF-8"))) }.getOrDefault(emptyList()) }
            finally { stopSearchBusy = false }
        }
    }
    private fun saveStops(list: List<StopRef>) {
        myStops = list
        viewModelScope.launch { runCatching { api.hlPut("/me/stops", JSONObject().put("stops", JSONArray().apply { list.forEach { put(it.toJson()) } })) } }
    }
    fun addStop(st: StopRef) {
        if (myStops.any { it.id == st.id }) { stopSel = st.id; stopAddOpen = false; return }
        saveStops(myStops + st)
        stopSel = st.id
        stopAddOpen = false
        stopSearch = emptyList()
        Haptics.success()
        launch { refreshDeps() }
    }
    fun removeStop(id: String) { saveStops(myStops.filter { it.id != id }); if (stopSel == id) stopSel = myStops.firstOrNull()?.id; Haptics.select() }
    fun moveStop(id: String, dir: Int) {
        val l = myStops.toMutableList()
        val i = l.indexOfFirst { it.id == id }
        val j = i + dir
        if (i < 0 || j !in l.indices) return
        val t = l[i]; l[i] = l[j]; l[j] = t
        saveStops(l)
        Haptics.select()
    }

    fun loadFolders() = launch { folders = parseFolders(api.get("/folders")) }

    /** En fane i Papir-hovedlinja (ID-ene i layout.tabBar). */
    fun mainTab(id: String) {
        when (id) {
            "finans" -> paperTab("fin")
            "mat" -> paperTab("mat")
            "domener" -> paperTab("dom")
            "sporing" -> paperTab("trk")
            "sok" -> paperTab("sok")
            "mer" -> paperTab("mer")
            "familie" -> openFamily()
            "avganger" -> openRuter()
            "vaer" -> openWeather()
            "nyheter" -> openNews()
            "aksjer" -> { paperPage = null; openFromMer(Screen.Stocks) }
            "boliger" -> { paperPage = null; openFromMer(Screen.Folders) }
            "abonnementer" -> { paperPage = null; openFromMer(Screen.Sub) }
            "media" -> openPaperPage("media")
            "chat" -> openChat()
            else -> paperTab("hjem")
        }
        Haptics.select()
    }

    /* Boliger i Papir: valgt bolig og søk i utgiftene. */
    var bolSearch by mutableStateOf("")
    var bolTab by mutableStateOf("oversikt")

    /* Abonnementer: «+» i fanelinja åpner legg til-arket. */
    var subAdding by mutableStateOf(false)

    /* Familie og kart: posisjon, soner, hendelser, personvern og helse. */
    var familyOpen by mutableStateOf(false)
    var family by mutableStateOf<Family?>(null)
        private set
    var familyError by mutableStateOf<String?>(null)
        private set
    var famSel by mutableStateOf<String?>(null)
    var famTrack by mutableStateOf<List<TrackPt>>(emptyList())
        private set
    /** Ny sone: punktet brukeren trykket på i kartet. */
    var famZoneDraft by mutableStateOf<Pair<Double, Double>?>(null)
    var famZoneEdit by mutableStateOf<FamZone?>(null)
    var famPrivacy by mutableStateOf(false)
    var famTab by mutableStateOf("kart")
    private var famJob: kotlinx.coroutines.Job? = null
    private var famSeen = mutableSetOf<String>()
    private val appCtx: Context get() = getApplication<Application>()

    fun openFamily() {
        familyOpen = true
        menuOpen = false
        famJob?.cancel()
        famJob = viewModelScope.launch {
            loadFamilyNow(first = true)
            while (familyOpen) { kotlinx.coroutines.delay(30_000); if (familyOpen) loadFamilyNow(first = false) }
        }
    }
    fun closeFamily() { familyOpen = false; famJob?.cancel(); famZoneDraft = null; famZoneEdit = null }
    fun loadFamily() = launch { loadFamilyNow(first = false) }
    private suspend fun loadFamilyNow(first: Boolean) {
        try {
            val f = parseFamily(api.hlGet("/family", timeout = 12_000))
            family = f
            familyError = null
            no.kristo.finanshub.family.FamilyPrefs.setZones(appCtx, f.zones.map { Triple(it.id, it.lat to it.lon, it.radius) })
            f.me?.let { me ->
                no.kristo.finanshub.family.FamilyPrefs.setSharing(appCtx, me.sharing == "on")
                no.kristo.finanshub.family.FamilyPrefs.setPrecise(appCtx, me.precision != "approx")
            }
            // Varsel for hendelser (kom til / forlot en sone) som ikke er vist før.
            val fresh = f.events.filter { it.id !in famSeen }
            if (!first) for (e in fresh) {
                val who = f.members.firstOrNull { it.userId == e.userId }?.name?.split(' ')?.firstOrNull() ?: "Noen"
                val zone = e.zoneName ?: f.zones.firstOrNull { it.id == e.zoneId }?.name ?: "sonen"
                Notify.post(appCtx, "Familie", if (e.kind == "leave") "$who forlot $zone" else "$who kom til $zone", "fam-${e.id}", "familie")
            }
            famSeen.addAll(f.events.map { it.id })
            if (famSel == null) famSel = f.members.firstOrNull { it.last != null }?.userId
            famSel?.let { loadTrack(it) }
        } catch (e: ApiException) {
            familyError = if (e.status == 404) "Familie trenger en nyere Homelab-server." else e.message
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Før fanget vi bare ApiException: en JSON-feil eller SecurityException her drepte appen (viewModelScope har ingen handler).
            android.util.Log.w("FinansHub", "Familie: kunne ikke lese /api/family", e)
            familyError = "Kunne ikke lese Familie fra serveren."
        }
    }
    fun famSelect(userId: String) { famSel = userId; Haptics.select(); launch { loadTrack(userId) } }
    private suspend fun loadTrack(userId: String) {
        famTrack = runCatching { parseTrack(api.hlGet("/family/track/" + URLEncoder.encode(userId, "UTF-8") + "?hours=24")) }.getOrDefault(emptyList())
    }
    /** «on», «paused» eller «off». Tjenesten i bakgrunnen startes eller stoppes med en gang. */
    fun famSetSharing(v: String) = launch {
        api.hlPut("/family/me", JSONObject().put("sharing", v))
        no.kristo.finanshub.family.FamilyPrefs.setSharing(appCtx, v == "on")
        no.kristo.finanshub.family.FamilyService.sync(appCtx)
        loadFamilyNow(first = false)
        flash(when (v) { "on" -> "Deling er på"; "paused" -> "Delingen er satt på pause"; else -> "Deling er slått av" })
    }
    fun famSetPrecision(v: String) = launch {
        api.hlPut("/family/me", JSONObject().put("precision", v))
        no.kristo.finanshub.family.FamilyPrefs.setPrecise(appCtx, v != "approx")
        no.kristo.finanshub.family.FamilyService.sync(appCtx)
        loadFamilyNow(first = false)
    }
    /** Helsefeltene som deles. Sammendraget sendes hvert 15. minutt (WorkManager). */
    fun famSetHealth(keys: Set<String>) = launch {
        val sh = JSONObject().apply { HEALTH_KEYS.forEach { (k, _) -> put(k, k in keys) } }
        api.hlPut("/family/me", JSONObject().put("shareHealth", sh))
        no.kristo.finanshub.family.FamilyPrefs.setHealth(appCtx, keys)
        if (keys.isEmpty()) no.kristo.finanshub.family.HealthSync.cancel(appCtx)
        else { no.kristo.finanshub.family.HealthSync.schedule(appCtx); no.kristo.finanshub.family.HealthSync.now(appCtx) }
        loadFamilyNow(first = false)
    }
    fun famSaveZone(id: String?, name: String, lat: Double, lon: Double, radius: Double, colorHex: String, shared: Boolean = false) = launch {
        val body = JSONObject().put("name", name.ifBlank { "Sone" }).put("lat", lat).put("lon", lon).put("radius", radius).put("color", colorHex)
            .put("shared", shared)
        if (id == null) api.hlPost("/family/zones", body) else api.request("PATCH", "/family/zones/" + URLEncoder.encode(id, "UTF-8"), body, prefix = Api.HOMELAB)
        famZoneDraft = null; famZoneEdit = null
        loadFamilyNow(first = false)
        flash("Sonen er lagret")
    }
    fun famDeleteZone(id: String) = launch {
        api.hlDelete("/family/zones/" + URLEncoder.encode(id, "UTF-8"))
        famZoneEdit = null
        loadFamilyNow(first = false)
    }
    fun famZoneNotify(zoneId: String, userId: String, enter: Boolean, leave: Boolean) = launch {
        api.hlPut("/family/zones/" + URLEncoder.encode(zoneId, "UTF-8") + "/notify", JSONObject().put("userId", userId).put("enter", enter).put("leave", leave))
        loadFamilyNow(first = false)
    }

    /* ---------- Prompt 20: kartfliser, posisjonskortet, helse og posisjon, Finans-fliser og logoregisteret ---------- */

    /** /api/config/map. mapConfigMissing = eldre server (404/401/403): kartet bruker Kartverket topo direkte. */
    var mapConfig by mutableStateOf<MapConfig?>(null)
        private set
    var mapConfigMissing by mutableStateOf(false)
        private set
    private var mapConfigAt = 0L
    fun loadMapConfig() {
        if (mapConfig != null || mapConfigMissing || System.currentTimeMillis() - mapConfigAt < 60_000) return
        mapConfigAt = System.currentTimeMillis()
        viewModelScope.launch {
            try { mapConfig = parseMapConfig(api.hlGet("/config/map")) }
            catch (e: ApiException) { if (e.status == 404 || e.status == 401 || e.status == 403) mapConfigMissing = true }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { mapConfigMissing = true }
        }
    }
    fun mapTiles(style: String, retina: Boolean): MapTiles = mapTilesFor(mapConfig, mapConfigMissing, base, style, retina)
    /** App-tokenet som sendes som Bearer til /tiles. */
    val mapToken: String? get() = account?.token

    /** Posisjonskortet på Hjem: /api/family/positions, eller bygget fra /api/family på eldre server. */
    var famPositions by mutableStateOf<List<PosCard>?>(null)
        private set
    private var positionsOld = false
    fun loadPositions() {
        viewModelScope.launch {
            try {
                if (!positionsOld) {
                    try { famPositions = parsePositions(api.hlGet("/family/positions")); return@launch }
                    catch (e: ApiException) { if (e.status == 404) positionsOld = true else return@launch }
                }
                val f = family ?: parseFamily(api.hlGet("/family"))
                famPositions = positionsFromFamily(f)
            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { }
        }
    }
    /** Personens farge på kartet (fra posisjonskortet), ellers en stabil farge. */
    fun famColor(userId: String): Long = famPositions?.firstOrNull { it.id == userId }?.color ?: posColorFor(userId)

    /** Helse og posisjon: «Del helsedata» av stopper synken og sletter egne helsedata på serveren. */
    fun healthMasterOff() = launch {
        no.kristo.finanshub.family.FamilyPrefs.setHealth(appCtx, emptySet())
        no.kristo.finanshub.family.HealthSync.stopAndDelete(appCtx)
        runCatching { api.hlPut("/family/me", JSONObject().put("shareHealth", JSONObject().apply { HEALTH_KEYS.forEach { (k, _) -> put(k, false) } })) }
        loadFamilyNow(first = false)
        flash("Helsedata deles ikke lenger, og er slettet fra serveren")
    }
    fun healthAskedNow() { no.kristo.finanshub.family.FamilyPrefs.putHealthAsked(appCtx) }

    /** Rekkefølgen på Finans-flisene (hold inne for å flytte). Lagres lokalt (papir_fm_order) og som fmOrder i /api/me/layout. */
    var fmOrder by mutableStateOf(normalizeFmOrder(prefs.str(FM_ORDER_KEY, "").split(',').filter { it.isNotBlank() }))
        private set
    fun saveFmOrder(order: List<String>) {
        fmOrder = normalizeFmOrder(order)
        prefs.set(FM_ORDER_KEY, fmOrder.joinToString(","))
        viewModelScope.launch { runCatching { api.hlPut("/me/layout", JSONObject().put("fmOrder", JSONArray(fmOrder))) } }
    }
    fun resetFmOrder() = saveFmOrder(FM_DEFAULT_ORDER)
    fun applyLayout20(raw: String) {
        val a = runCatching { JSONObject(raw).optJSONArray("fmOrder") }.getOrNull() ?: return
        val l = a.strings().filter { it.isNotBlank() }
        if (l.isNotEmpty()) { fmOrder = normalizeFmOrder(l); prefs.set(FM_ORDER_KEY, fmOrder.joinToString(",")) }
    }

    /** Logoregisteret: hentes én gang per døgn og ligger på disk, filene caches på disk per id. */
    private var logoIndex: LogoIndex? = null
    private var logoRegAt = 0L
    private val logoRegMutex = kotlinx.coroutines.sync.Mutex()
    private suspend fun logoRegistry(): LogoIndex? = logoRegMutex.withLock {
        logoIndex?.let { if (System.currentTimeMillis() - logoRegAt < 24 * 3600_000L) return@withLock it }
        val file = java.io.File(appCtx.filesDir, "logo-registry.json")
        if (logoIndex == null) runCatching { withContext(Dispatchers.IO) { if (file.exists()) LogoIndex(parseLogoRegistry(file.readText())) else null } }.getOrNull()?.let { logoIndex = it }
        if (System.currentTimeMillis() - logoRegAt > 10 * 60_000L) {
            logoRegAt = System.currentTimeMillis()
            runCatching {
                val raw = api.get("/logos/registry")
                val idx = LogoIndex(parseLogoRegistry(raw))
                withContext(Dispatchers.IO) { file.writeText(raw) }
                logoIndex = idx
            }
        }
        logoIndex
    }
    /** Registertreff for et domene eller en butikktekst (brukes også for bokstavfargen). */
    suspend fun logoItem(domain: String?, name: String?): LogoRegItem? = runCatching { logoRegistry()?.find(domain, name) }.getOrNull()
    /** Logo fra registeret (/finans/api/logos/file/:id, cachet på disk), ellers serverens favicon-cache som før. */
    suspend fun logoFor(domain: String?, name: String?): Bitmap? {
        val item = logoItem(domain, name)
        if (item != null && item.hasFile) {
            val key = "reg:" + item.id
            logos[key]?.let { return it }
            val f = java.io.File(java.io.File(appCtx.cacheDir, "logos").apply { mkdirs() }, item.id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".png")
            val b = withContext(Dispatchers.IO) { runCatching { if (f.exists() && System.currentTimeMillis() - f.lastModified() < 30L * 24 * 3600_000) BitmapFactory.decodeFile(f.path) else null }.getOrNull() }
                ?: runCatching {
                    val bytes = api.bytes("/finans/api/logos/file/" + URLEncoder.encode(item.id, "UTF-8"))
                    withContext(Dispatchers.IO) { runCatching { f.writeBytes(bytes) } }
                    withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
                }.getOrNull()
            if (b != null) { logos[key] = b; return b }
        }
        return logo(domain ?: item?.domain)
    }

    /* ---------- Prompt 16–17: huskeliste, varsler, appnavn og -ikon, vær sammenlignet, sanntid, dra for å oppdatere ---------- */

    var appNameEdit by mutableStateOf(false)
    var appIconEdit by mutableStateOf(false)
    var taskEditId by mutableStateOf<String?>(null)

    // Huskeliste: egen side (åpnes fra Mer, Hjem-kortet og widgeten). Delt med alle på serveren, oppdateres via WebSocket.
    var tasksOpen by mutableStateOf(false)
    var tasks by mutableStateOf<TasksData?>(null)
        private set
    var tasksError by mutableStateOf<String?>(null)
    var taskFilter by mutableStateOf("alle")
    /** + i widgeten: siden åpnes med feltet for ny oppgave i fokus. */
    var taskFocus by mutableStateOf(false)
    var taskNext by mutableStateOf<List<TaskItem>>(emptyList())
        private set

    fun openTasks(newTask: Boolean = false) {
        tasksOpen = true
        taskFocus = newTask
        loadTasks()
    }
    fun closeTasks() { tasksOpen = false; taskFocus = false }
    fun loadTasks() = launch {
        try {
            val t = withListSharing(parseTasks(api.hlGet("/tasks")))
            tasks = t
            tasksError = null
            taskNext = nextTasks(t)
            // Prompt 37: Viktig = alarm, tidlig påminnelse = varsel (planlegges på nytt hver gang listen hentes).
            runCatching { Alarms37.schedule(appCtx, t) }
        } catch (e: ApiException) {
            tasksError = if (e.status == 404) "Gjøremål trenger en nyere Homelab-server." else e.message
        }
    }
    private fun nextTasks(t: TasksData): List<TaskItem> =
        t.items.filter { !it.done }.sortedWith(compareBy<TaskItem> { it.due ?: "9999" }.thenBy { it.title.lowercase() }).take(3)
    /** De tre neste oppgavene til Hjem-kortet (hentes sammen med forsiden). */
    fun loadTaskNext() = viewModelScope.launch {
        runCatching { parseTasks(api.hlGet("/tasks")) }.getOrNull()?.let { tasks = it; taskNext = nextTasks(it) }
    }
    fun addTask(title: String, list: String?, due: String?, assignee: String?) = launch {
        if (title.isBlank()) return@launch
        val body = JSONObject().put("title", title.trim()).put("list", list).put("due", due).put("assignee", assignee)
        api.hlPost("/tasks", body)
        Haptics.success()
        loadTasksNow()
    }
    /** Avkryssing vises med en gang, og serveren oppdateres etterpå. */
    fun toggleTask(id: String) {
        val t = tasks ?: return
        val it0 = t.items.firstOrNull { it.id == id } ?: return
        val done = !it0.done
        tasks = t.copy(items = t.items.map { if (it.id == id) it.copy(done = done) else it })
        taskNext = nextTasks(tasks!!)
        if (done) Haptics.success() else Haptics.select()
        launch {
            api.request("PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"), JSONObject().put("done", done), prefix = Api.HOMELAB)
            loadTasksNow()
            no.kristo.finanshub.widget.TasksWidgetSync.refresh(appCtx)
        }
    }
    fun updateTask(id: String, title: String, list: String?, due: String?, assignee: String?) = launch {
        api.request("PATCH", "/tasks/" + URLEncoder.encode(id, "UTF-8"),
            JSONObject().put("title", title.trim()).put("list", list).put("due", due).put("assignee", assignee), prefix = Api.HOMELAB)
        loadTasksNow()
    }
    fun deleteTask(id: String) = launch {
        api.hlDelete("/tasks/" + URLEncoder.encode(id, "UTF-8"))
        loadTasksNow()
        flash("Oppgaven er slettet")
    }
    private suspend fun loadTasksNow() {
        runCatching { withListSharing(parseTasks(api.hlGet("/tasks"))) }.getOrNull()?.let { tasks = it; taskNext = nextTasks(it) }
    }

    /* ---------- Prompt 21: deling av huskelister (eier, «Delt med …», «Del liste») ---------- */

    /** Listen som deles nå (arket «Del liste»). */
    var shareListId by mutableStateOf<String?>(null)
    /** Personene man kan dele med (/api/users: bare id, navn og avatar). */
    var taskUsers by mutableStateOf<List<TaskMember>>(emptyList())
        private set
    var shareBusy by mutableStateOf(false)
        private set

    /** Eier og medlemmer fra GET /api/tasks/lists når /api/tasks ikke har dem. Eldre server (404): som før. */
    private suspend fun withListSharing(t: TasksData): TasksData {
        if (t.lists.any { it.owner != null || it.members.isNotEmpty() }) return t
        val extra = runCatching { parseTaskLists(api.hlGet("/tasks/lists")) }.getOrNull() ?: return t
        if (extra.isEmpty()) return t
        val by = extra.associateBy { it.id }
        return t.copy(lists = t.lists.map { l -> by[l.id]?.let { e -> l.copy(owner = e.owner, ownerName = e.ownerName, members = e.members, mine = e.mine) } ?: l } +
            extra.filter { e -> t.lists.none { it.id == e.id } })
    }

    fun openShareList(id: String) {
        shareListId = id
        viewModelScope.launch {
            val u = runCatching { parseUserList(api.hlGet("/users")) }.getOrNull()
            taskUsers = (u ?: tasks?.members ?: emptyList()).filter { it.id != family?.me?.userId && it.id != tasks?.lists?.firstOrNull { l -> l.id == id }?.owner }
        }
    }

    /** PUT /api/tasks/lists/:id/members {userIds}. Bare eieren kan dele; listen oppdateres etterpå. */
    fun shareList(id: String, userIds: List<String>) = viewModelScope.launch {
        shareBusy = true
        try {
            api.hlPut("/tasks/lists/" + URLEncoder.encode(id, "UTF-8") + "/members", JSONObject().put("userIds", JSONArray(userIds)))
            shareListId = null
            loadTasksNow()
            flash(if (userIds.isEmpty()) "Listen er ikke delt lenger" else "Listen er delt")
        } catch (e: ApiException) {
            message = when (e.status) {
                404 -> "Deling av lister trenger en nyere Homelab-server."
                403 -> "Bare eieren kan dele listen."
                else -> e.message ?: "Kunne ikke dele listen"
            }
        } catch (e: kotlinx.coroutines.CancellationException) { throw e
        } catch (e: Exception) { message = e.message ?: "Kunne ikke dele listen"
        } finally { shareBusy = false }
    }

    // Varsler: alt samlet i Innstillinger → Varsler (lagres per bruker på serveren, og lokalt for lyd og stille timer).
    var notifyPrefs by mutableStateOf(NotifyPrefs())
        private set
    var notifyLoaded by mutableStateOf(false)
        private set
    fun loadNotify() = launch {
        val n = runCatching { parseNotifyPrefs(api.hlGet("/me/notify")) }.getOrNull()
        if (n != null) { val m = fixNotify39(n); notifyPrefs = m; Notify.applyPrefs(appCtx, m) }
        notifyLoaded = true
    }
    fun saveNotify(n: NotifyPrefs) {
        val old = notifyPrefs
        notifyPrefs = n
        Notify.applyPrefs(appCtx, n)
        Haptics.select()
        putNotify39(old, n) // prompt 39: «draape» lagres lokalt hvis serveren ikke kjenner den ennå
    }
    /** Egen varsellyd (MP3/WAV/M4A under 1 MB): lastes opp til serveren og lagres lokalt for varslene på denne telefonen. */
    fun uploadSound(uri: Uri) = launch {
        val ctx = appCtx
        val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
        if (data.size > 1_000_000) { flash("Kunne ikke bruke lyden: filen må være under 1 MB"); return@launch }
        val mime = ctx.contentResolver.getType(uri) ?: "audio/mpeg"
        val ext = when { mime.contains("wav") -> "wav"; mime.contains("mp4") || mime.contains("m4a") || mime.contains("aac") -> "m4a"; else -> "mp3" }
        api.upload("/me/notify/sound", listOf(Api.Part("file", "varsel.$ext", mime, data)), prefix = Api.HOMELAB)
        withContext(Dispatchers.IO) { Notify.saveCustomSound(ctx, data, ext) }
        saveNotify(notifyPrefs.copy(sound = "egen", customSound = true))
        flash("Egen varsellyd er lagret")
    }
    fun deleteSound() = launch {
        runCatching { api.hlDelete("/me/notify/sound") }
        Notify.deleteCustomSound(appCtx)
        saveNotify(notifyPrefs.copy(sound = "klokke", customSound = false))
    }
    /** «Test varsel»: spiller lyden, vibrerer og viser et varsel. */
    fun testNotify() {
        Haptics.test()
        if (!Notify.allowed(appCtx)) { message = "Varsler er ikke tillatt. Slå det på i Android-innstillingene for appen."; return }
        Notify.test(appCtx, notifyPrefs)
    }

    // Appnavn og -ikon (Innstillinger → Navn på appen / App-ikon). Prompt 24: navnet og ikonet følger brukeren (/api/me/layout
    // appName/appIcon, maks 20 tegn), med /api/app som reserve. Navnet under ikonet er et av de ferdige navnene (activity-alias).
    var appInfo by mutableStateOf(AppInfo("Homelab", "hus"))
        private set
    val appName: String get() = appInfo.name.ifBlank { "Homelab" }
    /** Etiketten under ikonet i appskuffen: et av APP_LABELS, eller null (standardnavnet). */
    val launcherLabel: String? get() = prefs.str("app_label24", "").takeIf { it in APP_LABELS }
    fun loadAppInfo() = viewModelScope.launch {
        val local = prefs.str("app_name24", "")
        runCatching { parseAppInfo(api.hlGet("/app")) }.getOrNull()?.let { a ->
            appInfo = a.copy(name = local.ifBlank { a.name }, icon = prefs.str("app_icon", a.icon))
        } ?: run { if (local.isNotBlank()) appInfo = appInfo.copy(name = local, icon = prefs.str("app_icon", appInfo.icon)) }
    }
    /** layout.appName / layout.appIcon fra serveren (satt på en annen enhet eller på web). */
    fun applyLayout24a(raw: String) {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
        o.optStr("appName")?.take(20)?.let { n -> prefs.set("app_name24", n); appInfo = appInfo.copy(name = n) }
        o.optStr("appIcon")?.takeIf { k -> APP_ICONS.any { it.first == k } }?.let { k ->
            if (k != appInfo.icon) { prefs.set("app_icon", k); appInfo = appInfo.copy(icon = k); runCatching { applyLauncher24(appCtx, launcherAlias24(k, launcherLabel)) } }
        }
    }
    fun saveAppName(name: String) = launch {
        val v = name.trim().take(20).ifBlank { "Homelab" }
        appInfo = appInfo.copy(name = v)
        prefs.set("app_name24", v)
        // Ferdig navn: etiketten under ikonet byttes også (nytt alias slås på før det gamle slås av).
        val label = v.takeIf { it in APP_LABELS }
        if (label != launcherLabel) {
            prefs.set("app_label24", label ?: "")
            runCatching { applyLauncher24(appCtx, launcherAlias24(appInfo.icon, label)) }
        }
        runCatching { api.hlPut("/me/layout", JSONObject().put("appName", v)) }
        // Eldre server: navnet for hele homelab (bare administrator).
        runCatching { api.hlPut("/app", JSONObject().put("name", v)) }
        flash(if (label != null || v == "Homelab") "Appen heter nå «$v». Det kan ta noen sekunder før hjemskjermen viser det."
            else "Appen heter nå «$v» inne i appen. Navnet under ikonet på hjemskjermen kan bare være et av de ferdige navnene på Android.")
    }
    /** Bytter ikonet i appskuffen (activity-alias): det nye aliaset slås på før det gamle slås av, så appen aldri forsvinner. */
    fun setAppIcon(key: String) {
        val ok = runCatching { applyLauncher24(appCtx, launcherAlias24(key, launcherLabel)) }.getOrDefault(false)
        if (!ok) { message = "Fikk ikke byttet ikonet."; Haptics.error(); return }
        prefs.set("app_icon", key)
        appInfo = appInfo.copy(icon = key)
        Haptics.success()
        message = "Ikonet byttes. Det kan ta noen sekunder før hjemskjermen oppdateres. Snarveier på hjemskjermen kan bli fjernet, og må legges til på nytt."
        viewModelScope.launch {
            runCatching { api.hlPut("/me/layout", JSONObject().put("appIcon", key)) }
            runCatching { api.hlPut("/app", JSONObject().put("icon", key)) }
        }
    }

    // Vær: «Sammenlign Yr og Storm» (Yr fra MET, Storm har ikke åpent API, så ECMWF fra Open-Meteo brukes).
    var compareOpen by mutableStateOf(false)
    var wxCompare by mutableStateOf<WxCompare?>(null)
        private set
    var wxCompareError by mutableStateOf<String?>(null)
        private set
    fun openCompare() {
        compareOpen = true
        wxCompare = null
        wxCompareError = null
        val place = weatherPlace
        viewModelScope.launch {
            try { wxCompare = parseWxCompare(api.hlGet("/weather/compare?place=" + URLEncoder.encode(place, "UTF-8"), timeout = 15_000)) }
            catch (e: ApiException) { wxCompareError = if (e.status == 404) "Sammenligning trenger en nyere Homelab-server." else e.message }
            catch (e: Exception) { wxCompareError = e.message ?: "Fikk ikke hentet sammenligningen" }
        }
    }

    // Sporing: velg flere (hold inne på en pakke), og arkiver, gjenopprett eller slett dem samlet.
    var trkPicked by mutableStateOf<Set<String>>(emptySet())
    var trkPicking by mutableStateOf(false)
    var trkConfirmDelete by mutableStateOf(false)
    fun trkPick(id: String) {
        trkPicking = true
        trkPicked = if (id in trkPicked) trkPicked - id else trkPicked + id
        Haptics.select()
        if (trkPicked.isEmpty()) trkPicking = false
    }
    fun trkPickAll(ids: List<String>) { trkPicked = if (trkPicked.containsAll(ids)) emptySet() else ids.toSet(); trkPicking = trkPicked.isNotEmpty() }
    fun trkPickDone() { trkPicked = emptySet(); trkPicking = false; trkConfirmDelete = false }
    fun trkBulk(action: String) = launch {
        val ids = trkPicked.toList()
        if (ids.isEmpty()) return@launch
        api.hlPost("/tracking/bulk", JSONObject().put("ids", JSONArray(ids)).put("action", action))
        trkPickDone()
        loadTracking()
        flash(when (action) {
            "archive" -> if (ids.size == 1) "Sendingen er arkivert" else "${ids.size} sendinger er arkivert"
            "unarchive" -> if (ids.size == 1) "Sendingen er gjenopprettet" else "${ids.size} sendinger er gjenopprettet"
            else -> if (ids.size == 1) "Sendingen er slettet" else "${ids.size} sendinger er slettet"
        })
    }

    // Hjem: kortene Posisjon (familien) og Bolig (forbruk denne måneden, til gjennomgang og neste faste utgift).
    var homeBolig by mutableStateOf<HomeBolig?>(null)
        private set
    fun loadHomeExtras() = viewModelScope.launch {
        if (family == null) runCatching { family = parseFamily(api.hlGet("/family", timeout = 8_000)) }
        runCatching {
            val list = folders ?: parseFolders(api.get("/folders")).also { folders = it }
            val f = list.firstOrNull() ?: return@runCatching
            val o = JSONObject(api.get("/folders/${f.id}"))
            val kpi = o.optJSONObject("kpi")
            val up = o.optJSONArray("upcoming")?.optJSONObject(0)
            val month = java.time.LocalDate.now().toString().take(7)
            val months = o.optJSONArray("months")
            var spent = kpi?.optDoubleOrNull("month") ?: kpi?.optDoubleOrNull("thisMonth") ?: 0.0
            if (spent == 0.0 && months != null) for (i in 0 until months.length()) {
                val m = months.optJSONObject(i) ?: continue
                if ((m.optStr("month") ?: "").startsWith(month)) spent = m.optDoubleOrNull("total") ?: m.optDoubleOrNull("amount") ?: 0.0
            }
            val receipts = o.optJSONArray("receipts")
            var review = 0
            if (receipts != null) for (i in 0 until receipts.length()) if (receipts.optJSONObject(i)?.optBoolean("pending") == true) review++
            if (kpi?.has("review") == true) review = kpi.optInt("review", review)
            homeBolig = HomeBolig(f.id.toString(), f.name, spent, kpi?.optDoubleOrNull("budget") ?: o.optDoubleOrNull("budget"), review,
                up?.optStr("title"), up?.optDoubleOrNull("amount"), up?.optStr("date"))
        }
        loadTaskNext()
    }

    // Dra for å oppdatere (fra toppen når siden står øverst): henter siden på nytt.
    var pullRefreshing by mutableStateOf(false)
        private set
    fun pullRefresh() {
        if (pullRefreshing) return
        pullRefreshing = true
        Haptics.tap()
        viewModelScope.launch {
            try {
                // Sporing: be serveren sjekke status hos fraktselskapene først (prompt 22). Eldre server (404): bare last på nytt.
                if (screen == Screen.Tracking) runCatching { api.request("POST", "/tracking/refresh", JSONObject(), prefix = Api.HOMELAB, timeout = 30_000) }
                runCatching { loadFor(screen) }
                if (screen == Screen.Homelab) { runCatching { loadHome() }; loadHomeExtras() }
                if (tasksOpen) loadTasksNow()
                if (familyOpen) loadFamily()
            } finally { delay(350); pullRefreshing = false }
        }
    }

    // Sanntid: én WebSocket mot /api/ws mens appen er i forgrunnen.
    private val realtime = Realtime { type, msg ->
        when (type) {
            // Prompt 37: «todo:changed» (Gjøremål, delte lister) som «tasks».
            "tasks", "todo", "todo:changed" -> if (tasks != null) viewModelScope.launch { loadTasksNow(); no.kristo.finanshub.widget.TasksWidgetSync.refresh(appCtx) }
            "family" -> if (msg.optString("kind") == "ping") {
                // Noen i familien ber denne telefonen spille av lyd.
                Notify.test(appCtx, notifyPrefs.copy(sound = notifyPrefs.sound.takeIf { it != "stille" } ?: "klokke"))
                Haptics.test()
                message = "${msg.optString("fromName").ifBlank { "Noen" }} ber telefonen spille av lyd"
            } else if (familyOpen || family != null) loadFamily()
            "tracking" -> viewModelScope.launch { pollTracking() }
            "calendar-quick" -> { onQuickEvent31(msg); onQuickEvent29(msg) }
            // Prompt 31: Glimt-jobbene (steg, felt, fremdrift og svaret).
            "assist" -> onAssistEvent31(msg)
            // Prompt 30: ny versjon / status for oppdateringen (bare admin bryr seg).
            "system-update-available", "system-update" -> onUpdEvent30()
            // Prompt 36: matplanen er felles – endringer fra andre i husstanden vises med en gang.
            "meal:changed", "meal" -> onMealChanged36(msg)
            // Prompt 39: nytt profilbilde (eller navn) fra web/iPhone vises med en gang.
            "me", "me:changed", "avatar", "profile" -> refreshMe39(force = true)
            "job" -> onJob39(msg) // prompt 39: «✦ På nytt» på kvitteringer (steg og prosent)
        }
    }
    fun startRealtime() { if (loggedIn && !locked) realtime.start(base.ifBlank { account?.server ?: "" }, account?.token) }
    fun stopRealtime() = realtime.stop()

    // Sporing → Arkiv: arkiverte sendinger hentes for seg (GET /api/tracking?archived=1).
    var trkArchived by mutableStateOf<List<Shipment>?>(null)
        private set
    fun loadArchived() = viewModelScope.launch {
        trkArchived = runCatching { parseTracking(api.hlGet("/tracking?archived=1", timeout = 15_000)).items.filter { it.archived } }.getOrNull() ?: trkArchived
    }

    /** «Spill av lyd» på en annens telefon: serveren sender meldingen videre via sanntid når appen er åpen der. */
    fun famPing(userId: String, name: String) = launch {
        try {
            val r = JSONObject(api.hlPost("/family/ping/" + URLEncoder.encode(userId, "UTF-8")))
            if (r.optBoolean("delivered", true)) flash("Ber $name sin telefon spille av lyd")
            else message = "Åpne Homelab-appen på $name sin telefon for å spille av lyd."
        } catch (e: ApiException) {
            message = if (e.status == 404) "Åpne Homelab-appen på $name sin telefon for å spille av lyd." else e.message
        }
    }

    /** Strekkode eller QR på pakkelappen: bildet sendes til serveren (Roboflow). 501 = ikke satt opp, skriv eller lim inn selv. */
    var barcodeBusy by mutableStateOf(false)
        private set
    fun scanBarcode(uri: Uri, onCode: (String) -> Unit) = launch {
        barcodeBusy = true
        try {
            val ctx = appCtx
            val data = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } }
            val jpeg = withContext(Dispatchers.Default) { scaled(data, 1600, 85) } ?: data
            val r = JSONObject(api.upload("/scan/barcode", listOf(Api.Part("file", "pakkelapp.jpg", "image/jpeg", jpeg))))
            val codes = r.optJSONArray("codes")
            val v = (0 until (codes?.length() ?: 0)).mapNotNull { codes!!.optJSONObject(it)?.optStr("value") }
                .maxByOrNull { c -> if (Carrier.detect(c.uppercase()) != "other") 100 + c.length else c.length }
            if (v == null) flash("Fant ingen strekkode i bildet. Skriv inn eller lim inn nummeret.") else { onCode(v.uppercase()); Haptics.success() }
        } catch (e: ApiException) {
            message = if (e.status == 501) "Strekkodelesing er ikke satt opp på serveren (Roboflow). Skriv inn eller lim inn nummeret." else e.message
        } finally { barcodeBusy = false }
    }

    /* ---------- Prompt 23 (MOD): Abonnementer, Finn-annonse, ikoner i Nyhetsleser, AI-tidsgrenser (Mod23.kt) ---------- */
    /** Tilstanden for prompt 23-modulene. Kallene ligger som utvidelser i Mod23.kt; api og launch er private, så de deles her. */
    val m23 = Mod23State()
    internal suspend fun <T> api23(f: suspend Api.() -> T): T = api.f()
    internal fun launch23(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 23 (NAV): sveip tilbake med forrige side bak, scrollposisjon per side (Nav23.kt) ---------- */
    /** true mens previewBack kjører back() på prøve: ingen lasting og ingen telling. */
    private var navDry = false
    /** Øker ved hvert ekte back(). Nav23 skiller slik tilbake fra ny side (scrollposisjonen huskes bare ved tilbake). */
    var navBackSeq by mutableStateOf(0)
        private set

    /**
     * Hvor tilbake fører, uten å gå dit: back() kjøres i et eget Compose-snapshot som kastes etterpå,
     * og read() leser tilstanden slik den ville blitt. null når tilbake ikke gjør noe (rotsiden).
     */
    fun <T> previewBack(read: () -> T): T? {
        val savedBackTo = backTo
        val snap = androidx.compose.runtime.snapshots.Snapshot.takeMutableSnapshot()
        navDry = true
        return try {
            snap.enter { if (back()) read() else null }
        } catch (_: Exception) {
            null
        } finally {
            navDry = false
            backTo = savedBackTo
            snap.dispose()
        }
    }

    /** Kall mot serveren og bakgrunnsjobber for Nav23/Receipts23 (api og launch er private). */
    internal suspend fun <T> apiNav(f: suspend Api.() -> T): T = api.f()
    internal fun launchNav(block: suspend () -> Unit) = launch(block)
    /** Kvitteringer i Papir (Receipts23.kt): bokførte, åpen rad og «Klar» som er sett. */
    val rc23 = no.kristo.finanshub.ui.Receipts23State()

    /* ---------- Prompt 24 (ANDROID-B): Familie, profiler, Boliger, søk i Innstillinger og integrasjoner (Mod24B.kt) ---------- */
    val b24 = B24State()
    internal suspend fun <T> api24b(f: suspend Api.() -> T): T = api.f()
    internal fun launch24b(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 24 (A): Bursdager (Birthdays24.kt), Ruter (Ruter24.kt) og app-ikon/navn (AppIcon24.kt) ---------- */
    val bd24 = Bd24State()
    internal suspend fun <T> api24a(f: suspend Api.() -> T): T = api.f()
    internal fun launch24a(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 25: fanelinje-stil, AI-søk som jobb og «Ta meg dit →» (P25.kt) ---------- */
    val p25 = P25State()
    internal suspend fun <T> api25(f: suspend Api.() -> T): T = api.f()
    internal fun launch25(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 26 (ANDROID-B): Kalendere, Integrasjoner, Sporing, Finans-fanelinja og aktiv fane (Mod26B.kt) ---------- */
    val b26 = B26State()

    /* ---------- Prompt 26 (A): Kalender med skoletimeplan, widgets og Hjem-kortet (Calendar26.kt) ---------- */
    val kal26 = Kal26State()
    internal suspend fun <T> api26a(f: suspend Api.() -> T): T = api.f()
    internal fun launch26a(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 27 (ANDROID-B): søkeforslag, personvern og logoer, nyheter, Ruter på Hjem, abonnement fra skjermbilde (Mod27B.kt) ---------- */
    val b27 = B27State()
    internal suspend fun <T> api27b(f: suspend Api.() -> T): T = api.f()
    internal fun launch27b(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 27 (ANDROID-A): Chat (Chat27.kt) og Kalender v2 (Calendar27.kt, tilstanden i kal26) ---------- */
    val chat27 = Chat27State()
    internal suspend fun <T> api27(f: suspend Api.() -> T): T = api.f()
    internal fun launch27(block: suspend () -> Unit) = launch(block)
    /** Åpner Chat. Med tekst (✦ AI på Hjem, ANDROID-B) startes en ny samtale som sendes med en gang. */
    fun openChat(prompt: String = "") = openChat27(prompt)

    /* ---------- Prompt 28 (ANDROID-B): Mer-rekkefølge, abonnement fra skjermbilde og «Legg til widget» (Mod28B.kt, ui/Ui28B.kt) ---------- */
    val b28 = B28State()
    internal suspend fun <T> api28b(f: suspend Api.() -> T): T = api.f()
    internal fun launch28b(block: suspend () -> Unit) = launch(block)
    /** «Legg til widget»: viser kortet igjen og legger det sist. */
    fun showPageItemLast28(page: String, keys: List<String>, key: String) {
        savePage(page, PageLay(pageOrder(page, keys).filter { it != key } + key, (pageHidden(page) - key).toList()))
    }

    /* ---------- Prompt 28: Innstillinger → System → Oppdatering (ui/Update28.kt) ---------- */
    val upd28 = no.kristo.finanshub.ui.Upd28State()
    internal suspend fun <T> apiUpd28(f: suspend Api.() -> T): T = api.f()
    internal fun launchUpd28(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 29 (ANDROID29): rask time, søkemotor på Hjem og systembackup (Calendar29.kt, Backup29.kt og ui-filene med 29) ---------- */
    val q29 = Quick29State()
    val bk29 = Bk29State()
    /** Prompt 30: SMB-veiviseren «Sett opp nettverksdisk» (Smb30.kt, ui/Smb30Ui.kt). */
    val smb30 = Smb30State()
    internal suspend fun <T> api29(f: suspend Api.() -> T): T = api.f()
    internal fun launch29(block: suspend () -> Unit) = launch(block)
    internal val appCtx29: Context get() = appCtx
    /** true mens appen er i bakgrunnen (varsel når en rask time eller backup blir ferdig). */
    internal val inBackground29: Boolean get() = backgroundAt != null

    /* ---------- Prompt 30 (ANDROID30): oppdatering fra appen, Finans → Mer skjult, Boliger, kvitteringsmarkering (P30.kt, ui/Ui30.kt) ---------- */
    val p30 = P30State()
    internal suspend fun <T> api30(f: suspend Api.() -> T): T = api.f()
    internal fun launch30(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 31 (ANDROID31): Glimt, Nordlys OS, prøveperioder og varsler når appen er lukket (P31.kt, Notify31.kt og ui-filene med 31) ---------- */
    val p31 = P31State()
    internal suspend fun <T> api31(f: suspend Api.() -> T): T = api.f()
    internal fun launch31(block: suspend () -> Unit) = launch(block)
    internal fun launchJob31(block: suspend () -> Unit): kotlinx.coroutines.Job = launch(block)

    /* ---------- Prompt 33 (GLIMT-MEMORY): «Glimt husker» – alias per bruker (Memory33.kt, ui/Memory33Ui.kt) ---------- */
    val mem33 = Mem33State()
    internal suspend fun <T> api33(f: suspend Api.() -> T): T = api.f()
    internal fun launch33(block: suspend () -> Unit) = launch(block)

    /* ---------- Prompt 32 (ANDROID32): fanelinjer på andre sider, Glimt i søkefeltet, søkehistorikk, Huskeliste-arkiv, Kalender-Glimt (P32b.kt og ui-filene med 32b) ---------- */
    val p32b = P32bState()
    internal suspend fun <T> api32b(f: suspend Api.() -> T): T = api.f()
    internal fun launch32b(block: suspend () -> Unit) = launch(block)
    /** Huskeliste: oppgaver flyttet til Arkivert forsvinner fra listen med en gang. */
    internal fun setTasks32b(t: TasksData) { tasks = t; taskNext = nextTasks(t) }

    /* ---------- Prompt 34 (ANDROID34): Glimt-brief, AI-kontroll, kvitteringer under AI-analyse, skanninger i Chat, markering i Innstillinger (P34.kt og ui-filene med 34) ---------- */
    val p34 = P34State()
    internal suspend fun <T> api34(f: suspend Api.() -> T): T = api.f()
    internal fun launch34(block: suspend () -> Unit) = launch(block)
    internal fun launchJob34(block: suspend () -> Unit): kotlinx.coroutines.Job = launch(block)
    internal val appCtx34: Context get() = appCtx
    /** Kvitteringer og køen hentes på nytt (en AI-analyse ble ferdig eller stoppet). */
    internal fun refreshReceipts34() = launch { loadReceipts(); loadJobs() }

    /* ---------- Prompt 35 (ANDROID35): Glimt-figurene, Glimt-innstillinger, brief med venner/opplesning/bilder/prøver, vær for sted (P35.kt og ui-filene med 35) ---------- */
    val p35 = P35State()
    internal suspend fun <T> api35(f: suspend Api.() -> T): T = api.f()
    internal fun launch35(block: suspend () -> Unit) = launch(block)
    internal val appCtx35: Context get() = appCtx

    /* ---------- Prompt 36 (ANDROID36): felles matplan, Nordlys-notater/tidligere versjoner, Sherlock-/snekker-Glimt, «Starter opp», brief-sveip, profilbilde, Google-hovedkalender (P36.kt og ui-filene med 36) ---------- */
    val p36 = P36State()
    val gcal36 = GCal36State()
    internal suspend fun <T> api36(f: suspend Api.() -> T): T = api.f()
    internal fun launch36(block: suspend () -> Unit) = launch(block)
    internal fun launchJob36(block: suspend () -> Unit): kotlinx.coroutines.Job = launch(block)
    internal fun squareJpeg36(data: ByteArray, size: Int, quality: Int): ByteArray? = squareJpeg(data, size, quality)
    internal suspend fun reloadMe36() = loadMe()
    internal fun setAvatar36(b: android.graphics.Bitmap?) { avatar = b }

    /* ---------- Prompt 37 (ANDROID37): wiggle uten bytte-storm, Pakker-widget, onboarding med profil, Gjøremål, sporingsnøkler, delte abonnementer, bibelvers, «hvor er» (P37.kt og ui-filene med 37) ---------- */
    val p37 = P37State()
    internal suspend fun <T> api37(f: suspend Api.() -> T): T = api.f()
    internal fun launch37(block: suspend () -> Unit) = launch(block)
    internal suspend fun loadFamily37() = loadFamilyNow(first = true)
    /** Wiggle: rekkefølgen fra draget lagres én gang (disk + server) når kortet slippes. */
    fun commitPage37(page: String) { pageLayouts[page]?.let { savePage(page, it) } }

    /* ---------- Prompt 38 (ANDROID38): QR-innlogging på ny enhet, Konto → ØKT, svarboblen, nye brief-kort, Domener-Glimt, Mac mini i AI-kontroll (P38.kt, ui/Ui38.kt) ---------- */
    val p38 = P38State()
    internal suspend fun <T> api38(f: suspend Api.() -> T): T = api.f()
    internal fun launch38(block: suspend () -> Unit) = launch(block)
    internal suspend fun loadDomains38() = loadDomains()

    /* ---------- Prompt 39 (ANDROID39): myk varsellyd, profilbilde, valgt modell i Chat, sveip bort, Glimt-varsel (P39.kt, Sound39.kt, ui/Ui39.kt) ---------- */
    val p39 = P39State()
    internal suspend fun <T> api39(f: suspend Api.() -> T): T = api.f()
    internal fun launch39(block: suspend () -> Unit) = launch(block)
    internal val appCtx39: Context get() = appCtx
    internal val base39: String get() = base
    internal val token39: String? get() = account?.token
    internal fun setAvatar39(b: Bitmap?) { avatar = b }

    // Oppstart ligger nederst i klassen: Kotlin kjører init og feltinitialisering i rekkefølgen de står i filen.
    // Sto den øverst, ble felt lenger nede (f.eks. pendingUploads, fmOrder) brukt før de fantes, og appen krasjet ved oppstart.
    init {
        // Ny installasjon: Papir er standard (prompt 14). Eksisterende installasjoner beholder det de har.
        if (prefs.str(AppPrefs.MOBILE_DESIGN, "").isEmpty()) {
            prefs.set(AppPrefs.MOBILE_DESIGN, if (accounts.isEmpty()) "papir" else "klassisk")
            if (accounts.isEmpty()) prefs.set(AppPrefs.FRESH_PAPIR, true)
            // Prompt 22: «Lys hovedbok» er standard på nye enheter. Lagrede valg (fra serveren eller brukeren) overskrives ikke.
            if (prefs.str(AppPrefs.PAPER_MODE, "").isEmpty()) prefs.set(AppPrefs.PAPER_MODE, "lys")
            if (prefs.str(AppPrefs.MODE, "").isEmpty()) prefs.set(AppPrefs.MODE, "light")
        }
        Privacy.hidden = prefs.bool(AppPrefs.HIDE_AMOUNTS)
        layout = localLayout()
        loadLocalLayout15()
        loadLocalLayout16()
        refreshPending()
        watchNetwork()
        if (loggedIn) refresh()
    }

}
