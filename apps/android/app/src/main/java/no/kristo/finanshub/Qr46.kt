package no.kristo.finanshub

import android.os.Build
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.net.URLEncoder

/*
 * Prompt 46 (claude-code-qr-innlogging-finans-kalender.md): «Logg inn med QR-kode» på innloggingen i Finans (Android).
 * Denne enheten ber serveren om en innloggingsøkt (POST /api/auth/qr {app:'finans'}), viser QR-en (bare sessionId + engangskode +
 * offentlig server-URL – aldri et token), poller GET /api/auth/qr/:sid (X-QR-Key) og fullfører med POST /api/auth/qr/finish
 * {sid, key, app:'finans'} → {token, user}: serveren utsteder en EGEN enhetsøkt (ikke en kopi av skannerens token).
 * Koden gjelder 2 min og fornyes automatisk. Skanneren er en innlogget Finans-mobil (P38: «Logg inn på annen enhet»).
 *
 * QR-tegningen er en port av public/js/qr38.js (byte-modus, feilretting M, versjon 1–10) – ingen nye avhengigheter.
 */

/* ======================= QR-koder uten avhengigheter ======================= */

object Qr46 {
    private val ECC_M = intArrayOf(0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26)
    private val BLOCKS_M = intArrayOf(0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5)

    private fun rawModules(ver: Int): Int {
        var r = (16 * ver + 128) * ver + 64
        if (ver >= 2) { val n = ver / 7 + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36 }
        return r
    }
    private fun dataCodewords(ver: Int) = rawModules(ver) / 8 - ECC_M[ver] * BLOCKS_M[ver]

    private fun gfMul(x: Int, y: Int): Int {
        var z = 0
        for (i in 7 downTo 0) { z = (z shl 1) xor ((z ushr 7) * 0x11d); z = z xor (((y ushr i) and 1) * x) }
        return z and 0xff
    }
    private fun rsDivisor(degree: Int): IntArray {
        val r = IntArray(degree); r[degree - 1] = 1
        var root = 1
        repeat(degree) {
            for (j in r.indices) { r[j] = gfMul(r[j], root); if (j + 1 < r.size) r[j] = r[j] xor r[j + 1] }
            root = gfMul(root, 2)
        }
        return r
    }
    private fun rsRemainder(data: List<Int>, div: IntArray): List<Int> {
        val r = IntArray(div.size).toMutableList()
        for (b in data) {
            val f = b xor r.removeAt(0); r.add(0)
            div.forEachIndexed { i, c -> r[i] = r[i] xor gfMul(c, f) }
        }
        return r
    }
    private fun alignPositions(ver: Int, size: Int): List<Int> {
        if (ver == 1) return emptyList()
        val n = ver / 7 + 2
        val step = ((ver * 4 + 4) + (n * 2 - 2) - 1) / (n * 2 - 2) * 2
        val r = mutableListOf(6)
        var pos = size - 7
        while (r.size < n) { r.add(1, pos); pos -= step }
        return r
    }
    private fun mask(m: Int, x: Int, y: Int): Boolean = when (m) {
        0 -> (x + y) % 2 == 0; 1 -> y % 2 == 0; 2 -> x % 3 == 0; 3 -> (x + y) % 3 == 0
        4 -> (x / 3 + y / 2) % 2 == 0; 5 -> (x * y) % 2 + (x * y) % 3 == 0
        6 -> ((x * y) % 2 + (x * y) % 3) % 2 == 0; else -> (((x + y) % 2) + (x * y) % 3) % 2 == 0
    }

    /** Matrise (rader av Boolean, true = mørk) for teksten. Kaster for tekst over versjon 10. */
    fun matrix(text: String): Array<BooleanArray> {
        val bytes = text.toByteArray(Charsets.UTF_8).map { it.toInt() and 0xff }
        var ver = 1
        fun need(v: Int) = 4 + (if (v < 10) 8 else 16) + bytes.size * 8
        while (ver <= 10 && need(ver) > dataCodewords(ver) * 8) ver++
        require(ver <= 10) { "For lang tekst for QR-kode" }
        val cap = dataCodewords(ver) * 8
        val bits = ArrayList<Int>()
        fun put(v: Int, len: Int) { for (i in len - 1 downTo 0) bits.add((v ushr i) and 1) }
        put(4, 4); put(bytes.size, if (ver < 10) 8 else 16)
        bytes.forEach { put(it, 8) }
        put(0, minOf(4, cap - bits.size))
        put(0, (8 - bits.size % 8) % 8)
        var pad = 0xec
        while (bits.size < cap) { put(pad, 8); pad = pad xor 0xec xor 0x11 }
        val data = (0 until bits.size step 8).map { i -> (0 until 8).fold(0) { a, k -> (a shl 1) or bits[i + k] } }

        val nb = BLOCKS_M[ver]; val ecl = ECC_M[ver]; val raw = rawModules(ver) / 8
        val nShort = nb - raw % nb; val shortLen = raw / nb; val div = rsDivisor(ecl)
        val blocks = ArrayList<MutableList<Int>>()
        var k = 0
        for (i in 0 until nb) {
            val len = shortLen - ecl + if (i < nShort) 0 else 1
            val d = data.subList(k, k + len).toMutableList(); k += len
            val e = rsRemainder(d, div)
            if (i < nShort) d.add(0)
            blocks.add((d + e).toMutableList())
        }
        val cw = ArrayList<Int>()
        for (i in blocks[0].indices) blocks.forEachIndexed { j, b -> if (i != shortLen - ecl || j >= nShort) cw.add(b[i]) }

        val size = ver * 4 + 17
        val mod = Array(size) { BooleanArray(size) }
        val fn = Array(size) { BooleanArray(size) }
        fun set(x: Int, y: Int, dark: Boolean) { mod[y][x] = dark; fn[y][x] = true }
        for (i in 0 until size) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0) }
        for ((cx, cy) in listOf(3 to 3, size - 4 to 3, 3 to size - 4)) for (dy in -4..4) for (dx in -4..4) {
            val x = cx + dx; val y = cy + dy; val d = maxOf(kotlin.math.abs(dx), kotlin.math.abs(dy))
            if (x in 0 until size && y in 0 until size) set(x, y, d != 2 && d != 4)
        }
        val al = alignPositions(ver, size); val last = al.size - 1
        al.forEachIndexed { i, ax -> al.forEachIndexed { j, ay ->
            if (!((i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0)))
                for (dy in -2..2) for (dx in -2..2) set(ax + dx, ay + dy, maxOf(kotlin.math.abs(dx), kotlin.math.abs(dy)) != 1)
        } }
        fun drawFormat(m: Int) {
            val d = m // M = 00
            var r = d
            repeat(10) { r = (r shl 1) xor ((r ushr 9) * 0x537) }
            val b = ((d shl 10) or r) xor 0x5412
            fun bit(i: Int) = ((b ushr i) and 1) == 1
            for (i in 0..5) set(8, i, bit(i))
            set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
            for (i in 9 until 15) set(14 - i, 8, bit(i))
            for (i in 0 until 8) set(size - 1 - i, 8, bit(i))
            for (i in 8 until 15) set(8, size - 15 + i, bit(i))
            set(8, size - 8, true)
        }
        drawFormat(0)
        if (ver >= 7) {
            var r = ver
            repeat(12) { r = (r shl 1) xor ((r ushr 11) * 0x1f25) }
            val b = (ver shl 12) or r
            for (i in 0 until 18) { val dark = ((b ushr i) and 1) == 1; val a = size - 11 + i % 3; val c = i / 3; set(a, c, dark); set(c, a, dark) }
        }
        var i = 0
        var right = size - 1
        while (right >= 1) {
            if (right == 6) right = 5
            for (v in 0 until size) for (j in 0 until 2) {
                val x = right - j; val up = ((right + 1) and 2) == 0; val y = if (up) size - 1 - v else v
                if (!fn[y][x] && i < cw.size * 8) { mod[y][x] = ((cw[i ushr 3] ushr (7 - (i and 7))) and 1) == 1; i++ }
            }
            right -= 2
        }
        fun apply(m: Int) { for (y in 0 until size) for (x in 0 until size) if (!fn[y][x] && mask(m, x, y)) mod[y][x] = !mod[y][x] }
        fun penalty(): Int {
            var p = 0; var dark = 0
            for (a in 0 until 2) for (y in 0 until size) {
                var run = 1
                for (x in 1..size) {
                    val same = x < size && (if (a == 1) mod[x][y] == mod[x - 1][y] else mod[y][x] == mod[y][x - 1])
                    if (same) run++ else { if (run >= 5) p += run - 2; run = 1 }
                }
            }
            for (y in 0 until size - 1) for (x in 0 until size - 1) { val c = mod[y][x]; if (c == mod[y][x + 1] && c == mod[y + 1][x] && c == mod[y + 1][x + 1]) p += 3 }
            for (row in mod) for (c in row) if (c) dark++
            return p + kotlin.math.abs(dark * 20 - size * size * 10) / (size * size) * 10
        }
        var best = 0; var bestP = Int.MAX_VALUE
        for (m in 0 until 8) { apply(m); drawFormat(m); val p = penalty(); if (p < bestP) { bestP = p; best = m }; apply(m) }
        apply(best); drawFormat(best)
        return mod
    }
}

/* ======================= Vis QR (enheten som skal logges inn) ======================= */

private const val QR_TTL46 = 120_000L

/** Samme server som mobilen er logget inn på (vert uten www., uten port-forskjell for https). */
internal fun AppViewModel.qrSameServer46(srv: String): Boolean {
    fun h(u: String) = u.substringAfter("://").substringBefore('/').removePrefix("www.").lowercase()
    if (h(srv) == h(base)) return true
    return accounts.any { a -> h(a.server) == h(srv) } && h(account?.server ?: "") == h(srv)
}

private fun qrDevice46() = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android" }

/** Åpner QR-visningen på innloggingsskjermen og starter en ny økt mot [server]. */
fun AppViewModel.openQrLogin46(server: String) {
    val srv = Api.normalizeServer(server)
    if (srv.isBlank()) { message = "Skriv inn serveradressen"; return }
    p46.qrShowOpen = true
    p46.qrShowErr = null
    p46.qrSrv = srv
    startQrLogin46(srv)
}

fun AppViewModel.closeQrLogin46() {
    p46.qrJob?.cancel(); p46.qrJob = null
    p46.qrShowOpen = false; p46.qrShow = null; p46.qrShowErr = null
}

private fun qrErr46(e: Exception): String = when {
    e is ApiException && (e.status == 404 || e.status == 405) -> "Serveren har ikke QR-innlogging for appen ennå. Oppdater Homelab, eller logg inn med passord."
    e is ApiException && e.status == 429 -> "For mange QR-koder. Vent litt og prøv igjen."
    e is ApiException -> e.message ?: "Noe gikk galt"
    else -> e.message ?: "Ingen nettforbindelse"
}

private fun AppViewModel.startQrLogin46(srv: String) {
    val s = p46
    s.qrJob?.cancel()
    s.qrJob = launchJob46 {
        while (s.qrShowOpen) {
            val api = Api(srv, null)
            val body = JSONObject().put("app", "finans").put("platform", "android").put("device", qrDevice46()).put("deviceName", qrDevice46())
            // SERVER46: POST /api/auth/qr/session (token kommer i pollingen ved state done). Eldre server: POST /api/auth/qr + /finish.
            var v46 = true
            val o = try {
                val raw = try { api.request("POST", "/auth/qr/session", body, prefix = Api.HOMELAB, timeout = 15_000, read = 15_000) } catch (e: ApiException) {
                    if (e.status != 404 && e.status != 405) throw e
                    v46 = false
                    api.request("POST", "/auth/qr", body, prefix = Api.HOMELAB, timeout = 15_000, read = 15_000)
                }
                JSONObject(raw)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                s.qrShowErr = qrErr46(e); s.qrShow = null; return@launchJob46
            }
            val sid = o.s43("sessionId", "sid") ?: run { s.qrShowErr = "Uventet svar fra serveren"; return@launchJob46 }
            val nonce = o.s43("nonce", "code")?.let { if (it.contains('.')) it.substringAfter('.') else it }
            val key = o.s43("clientKey", "key")
            val pub = o.s43("publicUrl", "server", "srv") ?: srv
            // Serverens eget QR-innhold brukes når det finnes (papir://login?s=…&c=…&srv=…); ellers bygges det her. Aldri et token.
            val payload = o.s43("qr", "payload", "qrText") ?: if (nonce != null) "papir://login?s=${URLEncoder.encode(sid, "UTF-8")}&c=${URLEncoder.encode(nonce, "UTF-8")}&srv=${URLEncoder.encode(pub, "UTF-8")}"
                else o.s43("deepLink", "url") ?: run { s.qrShowErr = "Uventet svar fra serveren"; return@launchJob46 }
            val ttl = (o.optLong("ttl", 0L).takeIf { it > 0 }?.times(1000) ?: QR_TTL46).coerceAtMost(QR_TTL46)
            val exp = System.currentTimeMillis() + ttl
            s.qrShow = QrShow46(sid, payload, key, exp, "pending", null, null)
            s.qrShowErr = null
            // Poll hvert 1,5 s til godkjent/avvist/utløpt.
            var done = false
            while (s.qrShowOpen && !done) {
                delay(1_500)
                val st = try {
                    val raw = qrGet46(srv, (if (v46) "/auth/qr/session/" else "/auth/qr/") + URLEncoder.encode(sid, "UTF-8"), key)
                    JSONObject(raw)
                } catch (e: CancellationException) { throw e } catch (e: ApiException) {
                    if (e.status == 404 || e.status == 410) JSONObject().put("state", "expired") else null
                } catch (e: Exception) { null }
                val state = st?.s43("state", "status", "type") ?: if (System.currentTimeMillis() > exp) "expired" else continue
                val cur = s.qrShow ?: break
                // SERVER46: ved godkjenning kommer et NYTT token for denne enheten én gang i pollingen ({state:'done', token, user}).
                st?.s43("token", "accessToken")?.let { tok -> if (useToken46(srv, tok, st.optJSONObject("user"))) return@launchJob46 }
                when (state) {
                    "scanned" -> s.qrShow = cur.copy(state = "scanned", match = st?.s43("match"), who = st?.optJSONObject("user")?.s43("name", "displayName"))
                    "approved" -> { s.qrShow = cur.copy(state = "approved"); if (!v46) { if (finishQr46(srv, sid, key)) return@launchJob46; done = true } }
                    "denied" -> { s.qrShow = cur.copy(state = "denied"); delay(2_500); done = true }
                    "expired", "done" -> done = true
                }
                if (System.currentTimeMillis() > exp + 90_000) done = true
            }
            // Utløpt eller avvist: ny kode automatisk.
        }
    }
}

private suspend fun qrGet46(srv: String, path: String, key: String?): String = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
    val c = java.net.URL(srv.trimEnd('/') + "/api" + path).openConnection() as java.net.HttpURLConnection
    try {
        c.connectTimeout = 8_000; c.readTimeout = 8_000
        c.setRequestProperty("Accept", "application/json")
        key?.let { c.setRequestProperty("X-QR-Key", it) }
        val code = c.responseCode
        val body = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (code >= 400) throw ApiException(runCatching { JSONObject(body).optString("error") }.getOrNull()?.ifBlank { null } ?: "Feil $code", code)
        body
    } finally { c.disconnect() }
}

/** Fullfører: serveren utsteder et eget app-token for denne enheten. true = innlogget. */
private suspend fun AppViewModel.finishQr46(srv: String, sid: String, key: String?): Boolean {
    val s = p46
    val body = JSONObject().put("sid", sid).put("app", "finans").put("platform", "android").put("device", qrDevice46()).put("deviceName", qrDevice46())
    key?.let { body.put("key", it) }
    val o = try { JSONObject(Api(srv, null).request("POST", "/auth/qr/finish", body, prefix = Api.HOMELAB, timeout = 15_000, read = 15_000)) } catch (e: CancellationException) { throw e } catch (e: Exception) {
        s.qrShowErr = qrErr46(e); return false
    }
    val token = o.s43("token", "accessToken")
    if (token == null) {
        s.qrShowErr = if (o.optBoolean("needs2fa")) "Kontoen har totrinnsbekreftelse. Logg inn med passord og kode denne gangen."
            else "Serveren ga ikke noe app-token for QR-innloggingen. Oppdater Homelab, eller logg inn med passord."
        return false
    }
    return useToken46(srv, token, o.optJSONObject("user"))
}

private fun AppViewModel.useToken46(srv: String, token: String, u: JSONObject?): Boolean {
    val uname = u?.s43("username") ?: ""
    val name = u?.s43("displayName", "name") ?: uname.ifBlank { "Homelab" }
    addQrAccount46(srv, LoginResult(token, uname, name, u?.s43("role") ?: "bruker"))
    Haptics.success()
    closeQrLogin46()
    return true
}

/* ======================= Skann QR-kode (Googles skanner-UI, ingen kameratillatelse) ======================= */

/**
 * Prompt 46: «Skann QR-kode» i «Logg inn på annen enhet». Bruker Google Code Scanner (play-services-code-scanner): Google Play-tjenester
 * viser kamerabildet, så appen trenger ikke CAMERA-tillatelse og får bare teksten tilbake. Mangler Google Play-tjenester eller modulen,
 * vises en rolig melding og innliming står som reserve. Resultatet går til samme håndtering som innlimt kode ([qrScanned46]).
 */
object QrScan46 {
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
                .addOnCanceledListener { /* brukeren lukket skanneren – ingen melding */ }
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

/** Skannet eller innlimt tekst → samme sjekk som deep linken (riktig server) → [scanQr38] (godkjenn-arket med biometri). */
fun AppViewModel.qrScanned46(raw: String) {
    val s = p38
    val code = qrCodeOf38(raw)
    if (code == null) { s.qrErr = "Fant ingen gyldig kode. Skann QR-koden på nytt eller lim inn hele lenken."; Haptics.error(); return }
    val srv = runCatching { android.net.Uri.parse(raw.trim()).getQueryParameter("srv") }.getOrNull()?.let { Api.normalizeServer(it) }
    if (srv != null && srv.isNotBlank() && !qrSameServer46(srv)) {
        s.qrErr = "QR-koden er for ${srv.substringAfter("://")}, men du er logget inn på ${base.substringAfter("://")}"; Haptics.error(); return
    }
    scanQr38(code)
}
