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
import java.util.UUID

/** Finans-fanene (Hjem, Liste, Budsjett), opplasting, modulene under «Andre OS» og innstillinger. */
enum class Screen(val label: String) {
    Home("Hjem"), List("Liste"), Budget("Budsjett"), Scan("Last opp"),
    Mat("Matplan"), Domains("Domener"), Sub("Subscription OS"), Folders("Delte mapper"), Finn("Finn-handler"),
    Settings("Innstillinger");

    val isFinance get() = this == Home || this == List || this == Budget || this == Scan
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
    val displayName: String get() = me?.name?.takeIf { it.isNotBlank() } ?: account?.name?.takeIf { it.isNotBlank() } ?: boot?.settings?.name ?: ""

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

    /* ---------- Moduler ---------- */

    var week by mutableStateOf<Week?>(null)
    var subs by mutableStateOf<SubList?>(null)
    var folders by mutableStateOf<List<Folder>?>(null)
    var folder by mutableStateOf<FolderDetail?>(null)
    var finn by mutableStateOf<FinnList?>(null)
    var tokens by mutableStateOf<List<TokenInfo>?>(null)
    var tokenError by mutableStateOf<String?>(null)
    var newToken by mutableStateOf<String?>(null)
    var domains by mutableStateOf<List<DomainRef>?>(null)
    var domain by mutableStateOf<String?>(null)
    var analytics by mutableStateOf<Analytics?>(null)
    var domTab by mutableStateOf(DomTab.Traffic)
    var domRange by mutableStateOf("24h")
    var moduleError by mutableStateOf<String?>(null)

    /* ---------- Valg (observerbare for Compose) ---------- */

    private var prefTick by mutableStateOf(0)
    fun flag(k: String, def: Boolean = false): Boolean = if (prefTick >= 0) prefs.bool(k, def) else def
    fun option(k: String, def: String): String = if (prefTick >= 0) prefs.str(k, def) else def
    fun optionInt(k: String, def: Int): Int = if (prefTick >= 0) prefs.int(k, def) else def
    fun setPref(k: String, v: Any) {
        prefs.set(k, v); prefTick++
        if (k == AppPrefs.HIDE_AMOUNTS) Privacy.hidden = v == true
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
        if (loggedIn) refresh()
    }

    private fun startScreen() = when (prefs.str(AppPrefs.START, "home")) { "list" -> Screen.List; "budget" -> Screen.Budget; else -> Screen.Home }

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
        summary = parseSummary(api.get("/summary"))
        me = runCatching { parseMe(api.get("/me")) }.getOrNull()
        val m = me
        val a = account
        if (m != null && a != null && (a.name != m.name || a.username != m.username) && m.username.isNotBlank()) {
            accounts = accounts.map { if (it.id == a.id) it.copy(name = m.name, username = m.username, role = m.role) else it }
            store.save(accounts, activeId)
        }
        lastSync = System.currentTimeMillis()
        if (offline.isNotEmpty() && canUpload()) { val q = offline; offline = emptyList(); uploadUris(q) }
        loadFor(screen)
    }

    private suspend fun loadFor(s: Screen) {
        moduleError = null
        try {
            when (s) {
                Screen.List, Screen.Budget -> loadTx()
                Screen.Scan -> { loadReceipts(); loadJobs() }
                Screen.Mat -> loadWeek()
                Screen.Sub -> subs = parseSubs(api.get("/subscriptions"))
                Screen.Folders -> folders = parseFolders(api.get("/folders"))
                Screen.Finn -> finn = parseFinn(api.get("/finn"))
                Screen.Domains -> loadDomains()
                else -> {}
            }
        } catch (e: ApiException) {
            if (e.status == 401 || e.status == 403) moduleError = "${s.label} er ikke tilgjengelig for denne kontoen (${e.message})."
            else if (e.status == 404) moduleError = "${s.label} finnes ikke på serveren ennå. Oppdater homelab."
            else throw e
        }
    }

    fun go(s: Screen) {
        if (s != screen) { selectedTx = null; folder = null }
        screen = s
        menuOpen = false
        launch {
            if (s == Screen.Home) summary = parseSummary(api.get("/summary"))
            else if ((s != Screen.List && s != Screen.Budget) || txs == null) loadFor(s)
        }
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
        screen = Screen.Scan
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

    private suspend fun uploadOne(uri: Uri) {
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
        val r = runCatching { parseReceipt(JSONObject(api.upload("/receipts", parts))) }
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
        val rot = when (ExifInterface(data.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
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

    /* ---------- Subscription OS ---------- */

    fun addSub(name: String, plan: String, price: String, cycle: String, next: String) = launch {
        api.post("/subscriptions", JSONObject().put("name", name).put("plan", plan).put("price", price.replace(" ", "").replace(',', '.')).put("cycle", cycle).put("nextDate", next))
        subs = parseSubs(api.get("/subscriptions")); message = "$name lagt til"
    }
    fun setSubActive(s: Sub, active: Boolean) = launch {
        api.patch("/subscriptions/${s.id}", JSONObject().put("active", active))
        subs = parseSubs(api.get("/subscriptions"))
    }

    /* ---------- Delte mapper ---------- */

    fun openFolder(id: Int?) = launch { folder = if (id == null) null else parseFolderDetail(api.get("/folders/$id")) }
    fun addFolderEntry(desc: String, amount: String, paidBy: String?) = launch {
        val f = folder ?: return@launch
        val body = JSONObject().put("description", desc).put("amount", amount.replace(" ", "").replace(',', '.'))
        paidBy?.let { body.put("paidBy", it) }
        folder = parseFolderDetail(api.post("/folders/${f.folder.id}/entries", body))
        folders = parseFolders(api.get("/folders"))
        message = "Lagt til i ${f.folder.name}"
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
            val ctx = getApplication<Application>()
            val f = withContext(Dispatchers.IO) { File(File(ctx.cacheDir, "scans").apply { mkdirs() }, "finanshub-transaksjoner.csv").apply { writeText(csv) } }
            val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
            val send = Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            ctx.startActivity(Intent.createChooser(send, "Eksporter som CSV").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } finally { busy = false }
    }
}
