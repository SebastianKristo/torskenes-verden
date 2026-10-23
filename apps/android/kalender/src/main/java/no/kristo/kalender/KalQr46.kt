package no.kristo.kalender

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
