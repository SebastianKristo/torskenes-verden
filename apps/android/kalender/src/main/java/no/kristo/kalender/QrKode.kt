package no.kristo.kalender

import no.kristo.felles.nett.openSikker

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/*
 * Prompt 46 (KAL46): en liten QR-koder (byte-modus, feilretting M, versjon 1–15) for «Logg inn med QR-kode» i Kalender for
 * Android. Ingen nye avhengigheter (iOS/Mac bruker CoreImage). Etter ISO/IEC 18004 – samme oppsett som Nayukis referansekoder:
 * funksjonsmønstre, data + Reed–Solomon per blokk, fletting, sikksakk-plassering og den maskeringen som gir lavest straff.
 */
object KalQr46 {
    private val ECC_M = intArrayOf(10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24)
    private val BLOCKS_M = intArrayOf(1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10)

    /** Modulene (true = mørk), størrelse × størrelse. null når teksten er for lang. */
    fun encode(text: String, forceMask: Int = -1, forceVersion: Int = 0): Array<BooleanArray>? {
        val data = text.toByteArray(Charsets.UTF_8)
        var ver = 0
        for (v in 1..15) {
            if (forceVersion > 0 && v != forceVersion) continue
            val bits = 4 + (if (v < 10) 8 else 16) + data.size * 8
            if (bits <= dataCodewords(v) * 8) { ver = v; break }
        }
        if (ver == 0) return null
        val cap = dataCodewords(ver)
        // Bitstrøm: modus 0100, lengde, bytene, avslutning og fyll.
        val bb = ArrayList<Boolean>()
        fun put(v: Int, n: Int) { for (i in n - 1 downTo 0) bb += ((v ushr i) and 1) != 0 }
        put(4, 4)
        put(data.size, if (ver < 10) 8 else 16)
        for (b in data) put(b.toInt() and 0xFF, 8)
        put(0, minOf(4, cap * 8 - bb.size))
        put(0, (8 - bb.size % 8) % 8)
        var pad = 0xEC
        while (bb.size < cap * 8) { put(pad, 8); pad = pad xor 0xEC xor 0x11 }
        val cw = ByteArray(cap)
        for (i in bb.indices) if (bb[i]) cw[i ushr 3] = (cw[i ushr 3].toInt() or (1 shl (7 - (i and 7)))).toByte()
        val all = interleave(ver, cw)
        val q = Grid(ver)
        q.functions()
        q.codewords(all)
        var mask = forceMask
        if (mask < 0) {
            var best = Int.MAX_VALUE
            for (m in 0 until 8) {
                q.mask(m); q.format(m)
                val p = q.penalty()
                if (p < best) { best = p; mask = m }
                q.mask(m)
            }
        }
        q.mask(mask); q.format(mask)
        return q.m
    }

    private fun rawModules(ver: Int): Int {
        var r = (16 * ver + 128) * ver + 64
        if (ver >= 2) {
            val n = ver / 7 + 2
            r -= (25 * n - 10) * n - 55
            if (ver >= 7) r -= 36
        }
        return r
    }

    private fun dataCodewords(ver: Int): Int = rawModules(ver) / 8 - ECC_M[ver - 1] * BLOCKS_M[ver - 1]

    private fun gfMul(x: Int, y: Int): Int {
        var z = 0
        for (i in 7 downTo 0) {
            z = (z shl 1) xor ((z ushr 7) * 0x11D)
            z = z xor (((y ushr i) and 1) * x)
        }
        return z and 0xFF
    }

    private fun divisor(deg: Int): IntArray {
        val r = IntArray(deg)
        r[deg - 1] = 1
        var root = 1
        for (i in 0 until deg) {
            for (j in 0 until deg) {
                r[j] = gfMul(r[j], root)
                if (j + 1 < deg) r[j] = r[j] xor r[j + 1]
            }
            root = gfMul(root, 0x02)
        }
        return r
    }

    private fun remainder(data: ByteArray, div: IntArray): IntArray {
        val r = IntArray(div.size)
        for (b in data) {
            val f = (b.toInt() and 0xFF) xor r[0]
            for (i in 0 until r.size - 1) r[i] = r[i + 1]
            r[r.size - 1] = 0
            for (i in r.indices) r[i] = r[i] xor gfMul(div[i], f)
        }
        return r
    }

    private fun interleave(ver: Int, data: ByteArray): ByteArray {
        val nb = BLOCKS_M[ver - 1]
        val ecl = ECC_M[ver - 1]
        val raw = rawModules(ver) / 8
        val nShort = nb - raw % nb
        val shortLen = raw / nb
        val div = divisor(ecl)
        val blocks = ArrayList<IntArray>()
        var k = 0
        for (i in 0 until nb) {
            val len = shortLen - ecl + (if (i < nShort) 0 else 1)
            val dat = data.copyOfRange(k, k + len)
            k += len
            val ecc = remainder(dat, div)
            val block = IntArray(shortLen + 1)
            for (j in dat.indices) block[j] = dat[j].toInt() and 0xFF
            for (j in ecc.indices) block[block.size - ecl + j] = ecc[j]
            blocks += block
        }
        val out = ByteArray(raw)
        var o = 0
        for (i in 0 until shortLen + 1) for (j in 0 until nb) {
            if (i != shortLen - ecl || j >= nShort) { out[o++] = blocks[j][i].toByte() }
        }
        return out
    }

    private class Grid(val ver: Int) {
        val n = ver * 4 + 17
        val m = Array(n) { BooleanArray(n) }
        val fn = Array(n) { BooleanArray(n) }

        fun set(x: Int, y: Int, d: Boolean) { m[y][x] = d; fn[y][x] = true }

        fun functions() {
            for (i in 0 until n) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0) }
            finder(3, 3); finder(n - 4, 3); finder(3, n - 4)
            val pos = align()
            val c = pos.size
            for (i in 0 until c) for (j in 0 until c) {
                if ((i == 0 && j == 0) || (i == 0 && j == c - 1) || (i == c - 1 && j == 0)) continue
                for (dy in -2..2) for (dx in -2..2) set(pos[i] + dx, pos[j] + dy, maxOf(Math.abs(dx), Math.abs(dy)) != 1)
            }
            format(0)
            if (ver >= 7) {
                var r = ver
                for (i in 0 until 12) r = (r shl 1) xor ((r ushr 11) * 0x1F25)
                val bits = (ver shl 12) or r
                for (i in 0 until 18) {
                    val b = ((bits ushr i) and 1) != 0
                    val a = n - 11 + i % 3
                    val bb = i / 3
                    set(a, bb, b); set(bb, a, b)
                }
            }
        }

        private fun finder(x: Int, y: Int) {
            for (dy in -4..4) for (dx in -4..4) {
                val xx = x + dx; val yy = y + dy
                if (xx !in 0 until n || yy !in 0 until n) continue
                val d = maxOf(Math.abs(dx), Math.abs(dy))
                set(xx, yy, d != 2 && d != 4)
            }
        }

        private fun align(): IntArray {
            if (ver == 1) return IntArray(0)
            val c = ver / 7 + 2
            val step = (ver * 8 + c * 3 + 5) / (c * 4 - 4) * 2
            val r = IntArray(c)
            r[0] = 6
            var p = n - 7
            for (i in c - 1 downTo 1) { r[i] = p; p -= step }
            return r
        }

        /** Formatbitene (feilretting M = 00) for masken. */
        fun format(mask: Int) {
            val d = (0 shl 3) or mask
            var r = d
            for (i in 0 until 10) r = (r shl 1) xor ((r ushr 9) * 0x537)
            val bits = ((d shl 10) or r) xor 0x5412
            fun b(i: Int) = ((bits ushr i) and 1) != 0
            for (i in 0..5) set(8, i, b(i))
            set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8))
            for (i in 9 until 15) set(14 - i, 8, b(i))
            for (i in 0 until 8) set(n - 1 - i, 8, b(i))
            for (i in 8 until 15) set(8, n - 15 + i, b(i))
            set(8, n - 8, true)
        }

        fun codewords(data: ByteArray) {
            var i = 0
            var right = n - 1
            while (right >= 1) {
                if (right == 6) right = 5
                for (vert in 0 until n) for (j in 0..1) {
                    val x = right - j
                    val up = ((right + 1) and 2) == 0
                    val y = if (up) n - 1 - vert else vert
                    if (!fn[y][x] && i < data.size * 8) {
                        m[y][x] = (((data[i ushr 3].toInt() and 0xFF) ushr (7 - (i and 7))) and 1) != 0
                        i++
                    }
                }
                right -= 2
            }
        }

        fun mask(k: Int) {
            for (y in 0 until n) for (x in 0 until n) {
                if (fn[y][x]) continue
                val inv = when (k) {
                    0 -> (x + y) % 2 == 0
                    1 -> y % 2 == 0
                    2 -> x % 3 == 0
                    3 -> (x + y) % 3 == 0
                    4 -> (x / 3 + y / 2) % 2 == 0
                    5 -> x * y % 2 + x * y % 3 == 0
                    6 -> (x * y % 2 + x * y % 3) % 2 == 0
                    else -> ((x + y) % 2 + x * y % 3) % 2 == 0
                }
                if (inv) m[y][x] = !m[y][x]
            }
        }

        /** Forenklet straff (rekker, 2×2-blokker, balanse) – nok til å velge en lettlest maske. */
        fun penalty(): Int {
            var p = 0
            for (y in 0 until n) {
                var run = 1
                for (x in 1 until n) { if (m[y][x] == m[y][x - 1]) { run++; if (run == 5) p += 3 else if (run > 5) p++ } else run = 1 }
            }
            for (x in 0 until n) {
                var run = 1
                for (y in 1 until n) { if (m[y][x] == m[y - 1][x]) { run++; if (run == 5) p += 3 else if (run > 5) p++ } else run = 1 }
            }
            for (y in 0 until n - 1) for (x in 0 until n - 1) {
                val c = m[y][x]
                if (c == m[y][x + 1] && c == m[y + 1][x] && c == m[y + 1][x + 1]) p += 3
            }
            var dark = 0
            for (row in m) for (c in row) if (c) dark++
            val total = n * n
            val k = (Math.abs(dark * 20 - total * 10) + total - 1) / total - 1
            p += k * 10
            return p
        }
    }
}

/**
 * Prompt 46: «Skann QR-kode» (innlogget Kalender godkjenner en annen Kalender-enhet). Google Code Scanner (play-services-code-scanner):
 * Google Play-tjenester viser kamerabildet, så appen trenger ikke CAMERA-tillatelse. Uten Google Play-tjenester eller mens modulen lastes
 * ned vises en rolig melding, og innliming er reserve. Teksten går til samme håndtering som innlimt kode (Kal46Qr.scan).
 */
object KalScan46 {
    fun start(ctx: android.content.Context, onRaw: (String) -> Unit, onMsg: (String) -> Unit) {
        try {
            val opts = com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build()
            com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(ctx, opts).startScan()
                .addOnSuccessListener { b ->
                    val v = b.rawValue?.trim()
                    if (v.isNullOrEmpty()) onMsg("Fant ingen tekst i QR-koden. Lim inn koden i stedet.") else onRaw(v)
                }
                .addOnCanceledListener { /* lukket – ingen melding */ }
                .addOnFailureListener { e -> msgOf(e)?.let(onMsg) }
        } catch (t: Throwable) {
            onMsg("Skanneren er ikke tilgjengelig på denne telefonen (krever Google Play-tjenester). Lim inn koden i stedet.")
        }
    }

    /** null = avbrutt (ingen melding). */
    private fun msgOf(e: Exception): String? {
        val code = (e as? com.google.mlkit.common.MlKitException)?.errorCode
        val m = e.message.orEmpty().lowercase()
        return when {
            code == com.google.mlkit.common.MlKitException.CODE_SCANNER_CANCELLED -> null
            code == com.google.mlkit.common.MlKitException.CODE_SCANNER_TASK_IN_PROGRESS -> "Skanneren er allerede åpen."
            code == com.google.mlkit.common.MlKitException.UNAVAILABLE || code == com.google.mlkit.common.MlKitException.CODE_SCANNER_UNAVAILABLE ||
                "download" in m || "module" in m -> "Skanneren lastes ned fra Google Play … prøv igjen om litt. Du kan også lime inn koden."
            code == com.google.mlkit.common.MlKitException.CODE_SCANNER_GOOGLE_PLAY_SERVICES_VERSION_TOO_OLD -> "Google Play-tjenester må oppdateres for å skanne. Lim inn koden i stedet."
            else -> "Kunne ikke skanne nå. Prøv igjen, eller lim inn koden."
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
            val c = java.net.URL(url).openSikker()
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
