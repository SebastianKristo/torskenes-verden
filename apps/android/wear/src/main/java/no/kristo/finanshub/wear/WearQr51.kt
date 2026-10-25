package no.kristo.finanshub.wear

// Prompt 51 (ANDPLAT51): QR-tegning for innloggingen på klokka – samme algoritme som Qr46 i :app (port av public/js/qr38.js:
// byte-modus, feilretting M, versjon 1–10). Kopiert hit fordi :wear ikke avhenger av :app (ingen nye avhengigheter).

object WearQr51 {
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
