package no.kristo.kalender

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/*
 * Prompt 46 (KAL46): serveradressen appen er logget inn med (oppdatering, interne Docker-adresser).
 * Spesifikasjon: claude-code-mac-oppdatering-intern-ip.md (gjelder også Android-APK-en).
 *  - Sjekken går mot adressen appen er logget inn med (Innstillinger → Server), 15 s per forsøk, og domenet står i teksten.
 *  - Manifest-URL-er: relative løses mot serveradressen, og en intern IP (172.16/12, 10/8, 127/8) byttes ut med serveradressen
 *    (APK-en sjekkes uansett mot SHA-256 og signeringssertifikatet).
 */
object Kal46Srv {
    const val TIMEOUT = 15_000

    private fun ipv4(h: String): List<Int>? {
        val p = h.split('.')
        if (p.size != 4) return null
        val out = p.map { it.toIntOrNull() ?: return null }
        return if (out.all { it in 0..255 }) out else null
    }

    /** Docker-nett, loopback og link-local: kan aldri nås fra telefonen. */
    fun isContainerIp(host: String): Boolean {
        val h = host.lowercase()
        if (h == "localhost") return true
        val ip = ipv4(h) ?: return false
        return ip[0] == 127 || (ip[0] == 172 && ip[1] in 16..31) || (ip[0] == 169 && ip[1] == 254)
    }

    fun isInternalIp(host: String): Boolean = isContainerIp(host) || ipv4(host.lowercase())?.let { it[0] == 10 } == true

    fun host(base: String): String {
        val b = if (base.startsWith("http")) base else "https://$base"
        return runCatching { Uri.parse(b).host }.getOrNull() ?: ""
    }

    /** «home.kristo.no» – aldri en intern IP i teksten. */
    fun display(base: String): String {
        val h = host(base)
        return when {
            h.isBlank() -> "serveren"
            else -> h
        }
    }

    /** Relativ → mot serveradressen. Absolutt med intern IP som ikke er serverens egen vert → samme sti mot serveradressen. */
    fun resolve(raw: String, base: String): String {
        val b = base.trimEnd('/')
        val v = raw.trim()
        if (v.isEmpty()) return v
        if (!v.lowercase().startsWith("http")) return b + (if (v.startsWith("/")) v else "/$v")
        val u = runCatching { Uri.parse(v) }.getOrNull() ?: return v
        val h = u.host ?: return v
        if (h == host(b) || !isInternalIp(h)) return v
        val path = (u.encodedPath ?: "") + (u.encodedQuery?.let { "?$it" } ?: "")
        return b + path
    }

    fun details(url: String, status: Int, err: String): String =
        "URL: $url\nFeilkode: " + (if (status == 0) "ingen svar (tidsavbrudd eller ingen forbindelse)" else status.toString()) + (if (err.isNotBlank()) "\n$err" else "")
}

/* ---------------- Standardkalender (claude-code-glimt-kalender-standardkalender.md) ---------------- */

/**
 * Serveren har hatt prefs.defaultCalendar siden prompt 33, men appen brukte alltid «Personlig/første skrivbare».
 * Nå: valgt standardkalender → første skrivbare Google-kalender → Personlig → første skrivbare.
 */
object Kal46Prefs {
    private fun p(ctx: android.content.Context) = ctx.applicationContext.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE)
    fun defCal(ctx: android.content.Context): String = p(ctx).getString("p46_dc", "") ?: ""
    fun setDefCal(ctx: android.content.Context, v: String) = p(ctx).edit().putString("p46_dc", v).apply()

    fun usable(c: KCal) = c.writable && !c.hidMenu

    /** Id-en (appens) til kalenderen nye hendelser havner i. */
    fun pick(cals: List<KCal>, preferred: String): String {
        if (preferred.isNotBlank()) cals.firstOrNull { usable(it) && (it.id == preferred || it.serverId == preferred || it.key == preferred) }?.let { return it.id }
        cals.firstOrNull { usable(it) && it.src == "google" }?.let { return it.id }
        cals.firstOrNull { usable(it) && (it.id == "p" || it.key == "p") }?.let { return it.id }
        return cals.firstOrNull { usable(it) }?.id ?: "p"
    }

    /** Serverens id for kalenderen (PUT prefs {defaultCalendar}). */
    fun serverId(cals: List<KCal>, id: String): String = cals.firstOrNull { it.id == id }?.let { it.serverId ?: it.id } ?: id
}

/* ---------------- «+» gir aldri grå skjerm (claude-code-kalender-ny-hendelse-graa-skjerm.md) ---------------- */

/**
 * Arket melder fra når innholdet er lagt ut (høyde > 80 dp). Skjer ikke det innen 1,5 s, lukkes bakteppet og
 * «Kunne ikke åpne ny hendelse» vises med «Prøv igjen», og hendelsen logges (cal.new46.fail).
 */
object Kal46Guard {
    var shown by mutableStateOf(false)
    var failed by mutableStateOf<KNewForm?>(null)
    private var seq = 0

    fun arm(vm: KalVm, f: KNewForm) {
        seq++
        val g = seq
        shown = false
        failed = null
        vm.viewModelScope.launch {
            kotlinx.coroutines.delay(1500)
            if (g != seq || shown || vm.nf == null) return@launch
            android.util.Log.w("Kalender46", "Ny hendelse kom ikke fram (view=${vm.v}, cals=${vm.cals.size})")
            vm.nf = null
            failed = f
        }
    }

    fun seen(heightPx: Int, density: Float) { if (!shown && heightPx > 80 * density) shown = true }

    fun retry(vm: KalVm) { val f = failed ?: return; failed = null; vm.nf = f; arm(vm, f) }
}

/** Dagen «+» starter på: i dag i Måned/År/Liste, ellers i dag hvis den vises, ellers første synlige dag. */
fun KalVm.newDay46(): java.time.LocalDate {
    val t = today()
    if (v == "mnd" || v == "ar" || v == "liste") return t
    val first = if (v == "uke") wkStart35(a, sun) else a
    val n = if (v == "uke") 7 else if (v == "3d") 3 else 1
    for (i in 0 until n) if (first.plusDays(i.toLong()) == t) return t
    return first
}

/** Neste hele time (14:20 → 15:00), maks 23:00. */
fun nextHour46(): Int = minOf(23 * 60, (nowMin() / 60 + 1) * 60)

/* ---------------- Rask time via Glimt (claude-code-kalender-rask-time-glimt.md) ---------------- */

data class KRaskHit46(val title: String, val location: String, val address: String, val date: String, val start: Int?, val end: Int?, val cal: String, val engine: String)

/**
 * Årsak: «Skriv en time» brukte bare den lokale tolkeren og kalte aldri Glimt – tittelen ble hele setningen minus dato/tid.
 * Nå: lokal rydding med en gang (fyllord ut, «på X kino» / «hos X» → sted), Glimt-forhåndsvisning 400 ms etter siste
 * tastetrykk (POST /api/glimt/agent/preview, 3 s, 404 = bare lokal), og Enter → POST /api/glimt/agent {module:'calendar'}.
 * Svarer ikke Glimt, lagres hendelsen lokalt som før (aldri dobbelt: tidsavbrudd prøves én gang til med samme requestId).
 */
object Kal46Rask {
    var hit by mutableStateOf<KRaskHit46?>(null)
    var hitFor by mutableStateOf("")
    var thinking by mutableStateOf(false)
    @Volatile var noPreview = false
    @Volatile var noAgent = false

    private val LEAD = Regex("^(?:(?:vi|jeg|du|dere|de|han|hun|me|eg)\\s+(?:skal|må|vil|burde|bør)\\s+|(?:skal|må)\\s+)", RegexOption.IGNORE_CASE)
    private val SEE = Regex("^(?:(?:gå\\s+)?(?:og\\s+)?se\\s+på|på|til)\\s+", RegexOption.IGNORE_CASE)
    private val KINO = Regex("^(.+?)\\s+på\\s+(.+?\\s*kino)$", RegexOption.IGNORE_CASE)
    private val HOS = Regex("^(.+?)\\s+hos\\s+(.+)$", RegexOption.IGNORE_CASE)

    private fun cap(s: String) = s.trim().replaceFirstChar { it.uppercase() }

    /** «vi skal se på dune på coluseum kino» → («Dune», «Coluseum kino»). «tannlege hos Nina» → («Tannlege», «Nina»). */
    fun tidy(raw: String): Pair<String, String> {
        var t = raw.trim().replace(Regex("\\s+"), " ")
        t = t.replace(LEAD, "").replace(SEE, "")
        var loc = ""
        val m = KINO.find(t) ?: HOS.find(t)
        if (m != null && m.groupValues[1].isNotBlank() && m.groupValues[2].isNotBlank()) { t = m.groupValues[1]; loc = m.groupValues[2] }
        t = t.replace(Regex("^(?:se\\s+på|se)\\s+", RegexOption.IGNORE_CASE), "")
        return cap(t) to cap(loc)
    }

    private fun minutes(v: String?): Int? {
        val p = v?.split(':') ?: return null
        if (p.size < 2) return null
        val h = p[0].toIntOrNull() ?: return null
        val mi = p[1].take(2).toIntOrNull() ?: return null
        return if (h in 0..23 && mi in 0..59) h * 60 + mi else null
    }

    fun parseHit(raw: String): KRaskHit46? {
        val o0 = runCatching { org.json.JSONObject(raw) }.getOrNull() ?: return null
        val o = o0.optJSONObject("event") ?: o0.optJSONObject("preview") ?: o0.optJSONArray("actions")?.optJSONObject(0)?.optJSONObject("args") ?: o0
        val loc = o.optJSONObject("location")?.optString("name") ?: o.optString("location")
        val h = KRaskHit46(o.optString("title"), loc.orEmpty(), o.optString("address").ifBlank { o.optJSONObject("place")?.optString("address").orEmpty() },
            o.optString("date"), minutes(o.optString("start")), minutes(o.optString("end")), o.optString("calendarId").ifBlank { o.optString("calendar") },
            o0.optString("engine").ifBlank { o.optString("engine") })
        return if (h.title.isBlank() && h.location.isBlank()) null else h
    }

    fun context(vm: KalVm, p: KParsed): org.json.JSONObject {
        val local = org.json.JSONObject().put("date", p.d.toString()).put("title", p.t)
        p.s?.let { local.put("start", hm(it)) }
        p.e?.let { local.put("end", hm(it)) }
        val ctx = vm.getApplication<android.app.Application>()
        return org.json.JSONObject().put("today", today().toString()).put("tz", "Europe/Oslo")
            .put("defaultCalendarId", Kal46Prefs.serverId(vm.cals, Kal46Prefs.pick(vm.cals, Kal46Prefs.defCal(ctx)))).put("local", local)
    }

    private val TIME = Regex("\\b(kl\\.?\\s*\\d|\\d{1,2}[:.]\\d{2}|\\d{3,4}\\b)", RegexOption.IGNORE_CASE)
    private val DATEW = Regex("\\b(i dag|i morgen|i overmorgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|neste uke|\\d{1,2}\\.\\s?\\d{1,2}|\\d{1,2}\\.\\s?(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des))", RegexOption.IGNORE_CASE)

    /** Forhåndsvisningen: lokal dato/tid (når entydig), tittel/sted fra Glimt eller den lokale ryddingen. → (parsed, sted, adresse, glimt) */
    fun merged(vm: KalVm, p: KParsed, text: String): Pair<KParsed, Triple<String, String, Boolean>> {
        val (t0, l0) = tidy(p.t)
        val ctx = vm.getApplication<android.app.Application>()
        var out = p.copy(t = t0.ifBlank { p.t })
        if (out.cal == "p" || out.cal.isBlank()) out = out.copy(cal = Kal46Prefs.pick(vm.cals, Kal46Prefs.defCal(ctx)))
        var loc = l0; var address = ""; var used = false
        val h = hit
        if (h != null && hitFor == text.trim()) {
            if (h.title.isNotBlank()) out = out.copy(t = h.title)
            if (h.location.isNotBlank()) loc = h.location
            address = h.address
            used = h.engine != "lokal"
            if (!TIME.containsMatchIn(text) && h.start != null) out = out.copy(s = h.start, e = h.end ?: minOf(1439, h.start + vm.dd))
            else if (out.s != null && h.start == out.s && (h.end ?: 0) > (out.s ?: 0)) out = out.copy(e = h.end)
            if (h.date.isNotBlank() && !DATEW.containsMatchIn(text) && out.d == today()) runCatching { java.time.LocalDate.parse(h.date) }.getOrNull()?.let { out = out.copy(d = it) }
            if (h.cal.isNotBlank()) vm.cals.firstOrNull { it.id == h.cal || it.serverId == h.cal }?.let { out = out.copy(cal = it.id) }
        }
        return out to Triple(loc, address, used)
    }

    /** 400 ms etter siste tastetrykk (kalles fra LaunchedEffect(tekst) i skrivefeltet). */
    suspend fun preview(vm: KalVm, text: String) {
        val q = text.trim()
        if (q != hitFor) hit = null
        val p = vm.preview
        if (q.length < 3 || noPreview || p == null) { thinking = false; return }
        kotlinx.coroutines.delay(400)
        val s = vm.session ?: return
        thinking = true
        try {
            val body = org.json.JSONObject().put("text", q).put("module", "calendar").put("context", context(vm, p)).put("requestId", "kp" + java.util.UUID.randomUUID().toString().replace("-", ""))
            val raw = s.api.request("POST", "/api/glimt/agent/preview", body, timeout = 3000, read = 3000)
            hit = parseHit(raw); hitFor = q
        } catch (e: KalApiException) {
            if (e.status == 404 || e.status == 405) noPreview = true
        } finally { thinking = false }
    }

    sealed class R { data class Created(val id: String, val reply: String) : R(); object Ask : R(); object Unsupported : R(); object Failed : R() }

    private fun result(raw: String): R {
        val o = runCatching { org.json.JSONObject(raw) }.getOrNull() ?: return R.Failed
        if (o.optJSONObject("ask") != null || o.optJSONObject("confirm") != null) return R.Ask
        val reply = o.optString("reply").ifBlank { o.optString("text") }
        val acts = o.optJSONArray("actions") ?: return R.Failed
        for (i in 0 until acts.length()) {
            val a = acts.optJSONObject(i) ?: continue
            if (a.optString("tool") != "calendar.create" || a.optString("status") != "done") continue
            val res = a.optJSONObject("result") ?: org.json.JSONObject()
            val ev = res.optJSONObject("event") ?: res
            return R.Created(ev.optString("id").ifBlank { res.optString("id") }, reply)
        }
        return R.Failed
    }

    /** Enter i skrivefeltet. local = lagre lokalt (tittel, sted) som før – brukes når Glimt ikke kan. */
    fun send(vm: KalVm, text: String, p: KParsed, local: (KParsed, String) -> Unit) {
        val (m, extra) = merged(vm, p, text)
        val loc = if (extra.second.isBlank()) extra.first else extra.first + ", " + extra.second
        hit = null; hitFor = ""; thinking = false
        val s = vm.session
        if (noAgent || s == null) { local(m, loc); return }
        vm.showToast("Glimt legger inn «${m.t}» …")
        vm.viewModelScope.launch {
            val body = org.json.JSONObject().put("text", text).put("module", "calendar").put("requestId", "kr" + java.util.UUID.randomUUID().toString().replace("-", ""))
                .put("context", context(vm, p))
            var r: R = R.Failed
            for (attempt in 0..1) {
                try {
                    r = result(s.api.request("POST", "/api/glimt/agent", body, timeout = Kal46Srv.TIMEOUT, read = Kal46Srv.TIMEOUT)); break
                } catch (e: KalApiException) {
                    if (e.status == 404 || e.status == 405) { r = R.Unsupported; break }
                    if (e.status != 0) break
                }
            }
            when (r) {
                is R.Created -> {
                    vm.refresh()
                    val cal = vm.cal(m.cal).n
                    val msg = if (r.reply.isNotBlank()) r.reply.replace("**", "").replace('\n', ' ') else "Lagt inn i $cal · " + dl(m.d) + (if (m.all) "" else " " + hm(m.s ?: 0)) + " · " + m.t
                    val id = r.id
                    vm.showToast(msg) { if (id.isNotBlank()) vm.viewModelScope.launch { runCatching { s.api.delete("/api/kalender/events/" + java.net.URLEncoder.encode(id, "UTF-8")) }; vm.refresh() } }
                }
                is R.Ask -> vm.glSend(text)
                is R.Unsupported -> { noAgent = true; local(m, loc) }
                is R.Failed -> local(m, loc)
            }
        }
    }
}

/* ---------------- QR-innlogging (claude-code-qr-innlogging-finans-kalender.md) ---------------- */

/**
 * Vis (ikke innlogget): POST /api/auth/qr/session {app:'kalender', platform:'android', device} → {sessionId, code, qr, clientKey,
 * expiresAt, ttl}. QR-en (papir://login?s=…&c=…&srv=<offentlig URL>) har aldri et token. Appen poller
 * GET /api/auth/qr/session/:id (X-QR-Key) hvert 2. sekund; når en innlogget mobil har godkjent, kommer ÉN gang et eget, nytt
 * token for denne enheten. Ny kode ved utløp (2 min).
 * Skann (innlogget): koden limes inn eller kommer fra en lenke → POST /api/auth/qr/scan {code} → bekreftelse med enhet, sted og
 * matchkode → fingeravtrykk/PIN → POST /api/auth/qr/approve {sid, approve, biometric:true, match}. Koden sendes bare til
 * serveren denne appen er logget inn på – aldri til adressen i QR-en.
 */
object Kal46Qr {
    /** idle | loading | pending | scanned | done | expired | err */
    var phase by mutableStateOf("idle")
    var matrix by mutableStateOf<Array<BooleanArray>?>(null)
    var secondsLeft by mutableStateOf(0)
    var match by mutableStateOf("")
    var err by mutableStateOf("")
    private var job: kotlinx.coroutines.Job? = null

    private suspend fun http(method: String, url: String, body: org.json.JSONObject?, key: String?, token: String?): Pair<Int, String> =
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            try {
                c.requestMethod = method
                c.connectTimeout = Kal46Srv.TIMEOUT; c.readTimeout = Kal46Srv.TIMEOUT
                c.setRequestProperty("Accept", "application/json")
                c.setRequestProperty("X-Client", "kalender-android")
                key?.let { c.setRequestProperty("X-QR-Key", it) }
                token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
                if (body != null) {
                    c.doOutput = true
                    c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    c.outputStream.use { it.write(body.toString().toByteArray()) }
                }
                val code = c.responseCode
                val txt = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                code to txt
            } catch (e: java.io.IOException) { 0 to "" } finally { c.disconnect() }
        }

    fun stop() { job?.cancel(); job = null; phase = "idle"; matrix = null }

    /** Lager en ny økt og viser QR-en. base = adressen appen kan nå (ingen Docker-/loopback-adresse). */
    fun start(vm: KalVm) {
        job?.cancel()
        phase = "loading"; err = ""; match = ""; matrix = null
        val ctx = vm.getApplication<android.app.Application>()
        job = vm.viewModelScope.launch {
            val cands = Kal41.candidates(ctx).filter { !Kal46Srv.isContainerIp(Kal46Srv.host(it)) }
            val base = Kal41.firstReachable(cands.take(3)) ?: cands.firstOrNull() ?: Kal41.DEFAULT_BASE
            val dev = "Kalender (Android · ${KalApi.device})"
            val (st, raw) = http("POST", base.trimEnd('/') + "/api/auth/qr/session",
                org.json.JSONObject().put("app", "kalender").put("platform", "android").put("device", dev), null, null)
            if (st == 404 || st == 405) { phase = "err"; err = "Serveren har ikke QR-innlogging ennå. Oppdater Homelab-serveren."; return@launch }
            if (st == 429) { phase = "err"; err = "For mange forsøk. Vent litt og prøv igjen."; return@launch }
            if (st == 0) { phase = "err"; err = "Fikk ikke kontakt med serveren (${Kal46Srv.display(base)})."; return@launch }
            val o = runCatching { org.json.JSONObject(raw) }.getOrNull()
            val id = o?.optString("sessionId").orEmpty()
            val key = o?.optString("clientKey").orEmpty()
            val qr = o?.optString("qr").orEmpty().ifBlank {
                "papir://login?s=$id&c=" + (o?.optString("code").orEmpty()) + "&srv=" + Uri.encode(base)
            }
            if (st >= 400 || id.isBlank()) { phase = "err"; err = o?.optString("error")?.ifBlank { null } ?: "Kunne ikke lage en QR-kode."; return@launch }
            matrix = KalQr46.encode(qr)
            val ttl = o?.optInt("ttl", 120) ?: 120
            val until = System.currentTimeMillis() + ttl * 1000L
            phase = "pending"
            while (true) {
                secondsLeft = ((until - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0)
                if (secondsLeft <= 0) { start(vm); return@launch }
                kotlinx.coroutines.delay(2000)
                val (ps, pr) = http("GET", base.trimEnd('/') + "/api/auth/qr/session/" + Uri.encode(id), null, key, null)
                if (ps == 404 || ps == 410) { start(vm); return@launch }
                if (ps != 200) continue
                val p = runCatching { org.json.JSONObject(pr) }.getOrNull() ?: continue
                when (p.optString("state")) {
                    "scanned" -> { phase = "scanned"; match = p.optString("match") }
                    "denied" -> { phase = "err"; err = "Innloggingen ble avvist på mobilen."; return@launch }
                    "expired" -> { start(vm); return@launch }
                    "done", "approved" -> {
                        val tok = p.optString("token")
                        if (tok.isBlank()) continue
                        p.optString("refresh").takeIf { it.isNotBlank() }?.let { Kal41.saveRefresh(ctx, it) }
                        val u = p.optJSONObject("user")
                        val un = u?.optString("username").orEmpty()
                        val s = KalSession(base.trimEnd('/'), tok, un, u?.optString("name")?.ifBlank { null } ?: un, "qr")
                        KalAuth.rememberServer(ctx, base.trimEnd('/'))
                        phase = "done"; matrix = null
                        vm.signedIn41(s)
                        vm.showToast("✓ Logget inn som " + s.name.ifBlank { "Homelab-kontoen" })
                        return@launch
                    }
                }
            }
        }
    }

    /* ---------- Skann (innlogget) ---------- */

    var scanOpen by mutableStateOf(false)
    /** input | busy | ask | done | err */
    var scanPhase by mutableStateOf("input")
    var scanText by mutableStateOf("")
    var scanMsg by mutableStateOf("")
    var askSid by mutableStateOf("")
    var askDevice by mutableStateOf("")
    var askPlace by mutableStateOf("")
    var askAccount by mutableStateOf("")
    var askMatch by mutableStateOf("")

    private val CODE = Regex("^[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]{4,}$")

    /** «s.c» fra papir://login?s=…&c=…, homelab://login?c=…, https://<server>/l/<s.c> eller koden selv. null = ikke en kode. */
    fun codeOf(raw: String): String? {
        val t = raw.trim()
        if (CODE.matches(t)) return t
        val u = runCatching { Uri.parse(t) }.getOrNull() ?: return null
        val s = runCatching { u.getQueryParameter("s") }.getOrNull().orEmpty()
        val c = runCatching { u.getQueryParameter("c") }.getOrNull().orEmpty()
        if (s.isNotBlank() && c.isNotBlank() && CODE.matches("$s.$c")) return "$s.$c"
        if (CODE.matches(c)) return c
        val segs = u.pathSegments ?: emptyList()
        val i = segs.indexOf("l")
        if (i >= 0 && i + 1 < segs.size && CODE.matches(segs[i + 1])) return segs[i + 1]
        return segs.lastOrNull()?.takeIf { CODE.matches(it) }
    }

    fun openScan() { scanOpen = true; scanPhase = "input"; scanText = ""; scanMsg = "" }

    private fun msgFor(e: KalApiException): String = when (e.status) {
        0 -> "Fikk ikke kontakt med serveren. Prøv igjen."
        403 -> "Denne innloggingen kan ikke godkjenne andre enheter. Bruk Papir Finans på mobilen, eller logg inn på nytt."
        404, 405 -> "Serveren har ikke QR-innlogging ennå. Oppdater Homelab-serveren."
        409, 410 -> "Koden er allerede brukt eller utløpt. Be om en ny kode på den andre enheten."
        429 -> "For mange forsøk. Vent litt og prøv igjen."
        else -> e.message ?: "Kunne ikke lese koden."
    }

    fun scan(vm: KalVm, raw: String) {
        val s = vm.session ?: return
        val code = codeOf(raw) ?: run { scanMsg = "Det er ikke en innloggingskode. Lim inn lenken eller koden som den andre enheten viser."; return }
        val srv = runCatching { Uri.parse(raw.trim()).getQueryParameter("srv") }.getOrNull().orEmpty()
        if (srv.isNotBlank() && Kal46Srv.host(srv).isNotBlank() && Kal46Srv.host(srv) != Kal46Srv.host(s.server)) {
            scanPhase = "err"; scanMsg = "Koden er fra en annen server (${Kal46Srv.host(srv)}). Logg inn der i stedet."; return
        }
        scanPhase = "busy"; scanMsg = ""
        vm.viewModelScope.launch {
            try {
                val o = org.json.JSONObject(s.api.post("/api/auth/qr/scan", org.json.JSONObject().put("code", code)))
                val d = o.optJSONObject("device")
                val name = d?.optString("name").orEmpty().ifBlank { d?.optString("os").orEmpty().ifBlank { "Ny enhet" } }
                val os = d?.optString("os").orEmpty()
                askDevice = if (os.isNotBlank() && !name.contains(os)) "$name · $os" else name
                askPlace = listOf(d?.optString("place").orEmpty(), d?.optString("ip").orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
                askAccount = o.optJSONObject("account")?.let { it.optString("name").ifBlank { it.optString("username") } }.orEmpty().ifBlank { s.name }
                askMatch = o.optString("match")
                askSid = o.optString("sid")
                scanPhase = "ask"
            } catch (e: KalApiException) { scanPhase = "err"; scanMsg = msgFor(e) } catch (e: org.json.JSONException) { scanPhase = "err"; scanMsg = "Uventet svar fra serveren." }
        }
    }

    /** Etter fingeravtrykk/PIN (approve = true) eller Avbryt. */
    fun answer(vm: KalVm, approve: Boolean) {
        val s = vm.session ?: return
        scanPhase = "busy"
        vm.viewModelScope.launch {
            try {
                val body = org.json.JSONObject().put("sid", askSid).put("approve", approve).put("biometric", approve).put("match", askMatch)
                val o = runCatching { org.json.JSONObject(s.api.post("/api/auth/qr/approve", body)) }.getOrNull() ?: org.json.JSONObject()
                scanPhase = "done"
                scanMsg = when {
                    !approve -> "Innloggingen ble avvist. Den andre enheten får en ny kode."
                    o.optBoolean("needs2fa") -> "Godkjent. Skriv koden fra autentiseringsappen på den andre enheten for å fullføre."
                    else -> "$askDevice er logget inn som $askAccount. Du finner den under Innstillinger → Enheter i Homelab."
                }
            } catch (e: KalApiException) { scanPhase = "err"; scanMsg = msgFor(e) }
        }
    }
}

/** Ett valg til profilen (PUT /api/kalender/calendars/prefs). */
fun KalVm.setPref46(k: String, v: Any) {
    val s = session ?: return
    val ctx = getApplication<android.app.Application>()
    viewModelScope.launch { Kal35Repo.putPref(ctx, s, k, v) }
}
