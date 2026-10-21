package no.kristo.kalender

import java.time.LocalDate

/*
 * Prompt 33: lokal tolking av «frisør 14.30 25.10» (fasit: Kalender App.dc.html → parse(), guessCal(), isQ()). Funker uten nett.
 *  - Klokkeslett: 14.30, 14:30, kl 9, 14.30–15.15 · dato: 25.10, 25.10.27, 25. okt, i dag / i morgen / overmorgen / i kveld,
 *    fredag, neste fredag · varighet: «i 2 timer» / «i 45 min» · varsel: «varsle 30 min før» / «påminn meg 1 dag før».
 *  - «14.30 25.09»: tall med minutter > 12 eller kolon = tid, dag > 23 = dato. To tvetydige tall gir først tid, så dato.
 *  - Uten dato: i dag, eller i morgen hvis tiden har passert. Uten tid: heldag.
 */

data class KParsed(val t: String, val cal: String, val d: LocalDate, val s: Int?, val e: Int?, val rem: Int?, val src: String) {
    val all: Boolean get() = s == null
}

/** Kalenderen gjettes fra ord (lege → Helse, frist → Studie, møte → Jobb, mormor → Familie, bursdag → Bursdager). */
/** Prompt 39: fire kalendere – helse, jobb og familie havner i Personlig (CNORM i fasiten). */
fun guessCal(s: String): String = when {
    Regex("(forelesning|eksamen|frist|oblig|innlevering|kollokvie|studie)").containsMatchIn(s) -> "s"
    Regex("(bursdag|\\d+\\s*år\\b)").containsMatchIn(s) -> "b"
    else -> "p"
}

/** Spørsmål til Glimt (slutter på «?» eller starter med hva/når/hvem/hvor/finn/oppsummer/har jeg …). */
fun isQ(t: String): Boolean {
    val s = t.trim().lowercase()
    return Regex("\\?\\s*$").containsMatchIn(s) ||
        Regex("^(hva|når|hvem|hvor|hvordan|hvilke|hvilken|har jeg|er jeg|finn|oppsummer|kan jeg|skal jeg|blir det)(?![a-zæøå])").containsMatchIn(s)
}

private val MX = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** Gyldig dato (31.02 → null). */
private fun safeDate(y: Int, m: Int, d: Int): LocalDate? = runCatching { LocalDate.of(y, m, d) }.getOrNull()

fun parseQuick(txt: String, defRem: Int?, T: LocalDate = today(), nm: Int = nowMin(), defDur: Int = 60): KParsed {
    // Prompt 44: 1600, kl1600, 16h, 16-17 og «frisør 16» skrives om til 16:00 først (KalTime44).
    var s = " " + KalTime44.normalize(txt).lowercase().replace(Regex("\\s+"), " ") + " "
    var date: LocalDate? = null
    var time: Int? = null
    var end: Int? = null
    var rem: Int? = null
    var remSet = false
    var dur: Int? = null

    Regex("(\\d{1,2})\\.?\\s+(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\\.?(\\s+\\d{4})?").find(s)?.let { m ->
        val mo = MX.indexOf(m.groupValues[2]) + 1
        val y = m.groupValues[3].trim().toIntOrNull() ?: T.year
        var d = safeDate(y, mo, m.groupValues[1].toInt())
        if (d != null && m.groupValues[3].isBlank() && d.isBefore(T)) d = safeDate(y + 1, mo, m.groupValues[1].toInt())
        if (d != null) { date = d; s = s.replaceFirst(m.value, " ") }
    }
    Regex("(?:påminn(?:else)?|varsle?|varsel)\\s*(?:meg\\s*)?(\\d+)\\s*(min|minutter|t|time|timer|dag|dager|døgn)\\s*før").find(s)?.let { m ->
        val n = m.groupValues[1].toInt()
        val u = m.groupValues[2]
        rem = if (u.startsWith("d")) n * 1440 else if (u.startsWith("t")) n * 60 else n
        remSet = true
        s = s.replaceFirst(m.value, " ")
    }
    Regex("(?<![\\w])i\\s+(\\d+(?:[.,]5)?)\\s*(t|timer|time|min|minutter)(?![\\wæøå])").find(s)?.let { m ->
        val n = m.groupValues[1].replace(',', '.').toDouble()
        dur = if (m.groupValues[2].startsWith("m")) n.toInt() else (n * 60).toInt()
        s = s.replaceFirst(m.value, " ")
    }
    Regex("(?<!\\d)(\\d{1,2})[.:](\\d{2})\\s*[-–]\\s*(\\d{1,2})[.:](\\d{2})(?!\\d)").find(s)?.let { m ->
        time = m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
        end = m.groupValues[3].toInt() * 60 + m.groupValues[4].toInt()
        s = s.replaceFirst(m.value, " ")
    }
    Regex("(?<![\\wæøå])(?:kl\\.?|klokka|klokken)\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?!\\d)").find(s)?.let { m ->
        if (time == null) {
            time = m.groupValues[1].toInt() * 60 + (m.groupValues[2].toIntOrNull() ?: 0)
            s = s.replaceFirst(m.value, " ")
        }
    }
    // Tall som «14.30» og «25.10(.27)»: klassifiser først de sikre, så de tvetydige (tid først, så dato).
    val tk = Regex("(?<!\\d)(\\d{1,2})[.:/](\\d{1,2})(?:[./](\\d{2,4}))?(?!\\d)").findAll(s).toList()
    val cls = tk.map { t ->
        val a = t.groupValues[1].toInt(); val b = t.groupValues[2].toInt()
        when {
            t.groupValues[3].isNotEmpty() -> 'd'
            t.value.contains(':') -> 't'
            a > 23 -> 'd'
            b > 12 -> 't'
            else -> ' '
        }
    }
    fun applyD(t: MatchResult) {
        val a = t.groupValues[1].toInt(); val b = t.groupValues[2].toInt()
        if (date != null || b < 1 || b > 12) return
        val yr = t.groupValues[3].toIntOrNull()?.let { if (it < 100) 2000 + it else it } ?: T.year
        var d = safeDate(yr, b, a) ?: return
        if (t.groupValues[3].isEmpty() && d.isBefore(T)) d = safeDate(yr + 1, b, a) ?: d
        date = d
        s = s.replaceFirst(t.value, " ")
    }
    fun applyT(t: MatchResult) {
        if (time != null) return
        val h = t.groupValues[1].toInt(); val m = t.groupValues[2].toInt()
        if (h > 23 || m > 59) return
        time = h * 60 + m
        s = s.replaceFirst(t.value, " ")
    }
    tk.forEachIndexed { i, t -> if (cls[i] == 'd') applyD(t); if (cls[i] == 't') applyT(t) }
    tk.forEachIndexed { i, t -> if (cls[i] != ' ') return@forEachIndexed; if (time == null) applyT(t) else applyD(t) }

    // Prompt 35: samme dag-ord som parseDay35 (i morra, imorgo, tomorrow, overimorgen).
    for ((w, n) in listOf("i overmorgen" to 2, "overmorgen" to 2, "overimorgen" to 2, "i morgen" to 1, "imorgen" to 1, "i morra" to 1, "imorra" to 1, "imorgo" to 1, "tomorrow" to 1, "i dag" to 0, "idag" to 0, "i kveld" to 0)) {
        if (date == null && s.contains(" $w ")) {
            date = T.plusDays(n.toLong())
            s = s.replaceFirst(" $w ", " ")
            if (w == "i kveld" && time == null) time = 19 * 60
        }
    }
    Regex("(?<![\\wæøå])(neste\\s+)?(?:på\\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)(?![\\wæøå])").find(s)?.let { m ->
        if (date == null) {
            val w = WD.indexOf(m.groupValues[2])
            var df = ((w - T.jsDay + 7) % 7).let { if (it == 0) 7 else it }
            if (m.groupValues[1].isNotEmpty() && df < 7) df += 7
            date = T.plusDays(df.toLong())
            s = s.replaceFirst(m.value, " ")
        }
    }
    val cal = guessCal(txt.lowercase())
    var t = s.replace(Regex("^\\s*(legg\\s+(til|inn)|lag|ny|opprett|sett\\s+opp|book|booke)\\s+"), " ")
        .replace(Regex("^\\s*(en\\s+|et\\s+)?(time|avtale|hendelse)\\s+(hos|på|til|med)\\s+"), " ")
        .replace(Regex("^\\s*(en\\s+|et\\s+)?(time|avtale|hendelse)\\s+"), " ")
    repeat(3) {
        t = t.replace(Regex("\\s(den|kl\\.?|klokka|fra|på|i|til|og)\\s*$"), " ").replace(Regex("^\\s*(den|kl\\.?|på)\\s"), " ")
    }
    t = t.replace(Regex("[,.:;]+\\s*$"), "").replace(Regex("\\s+"), " ").trim()
    // Behold skrivemåten fra teksten («IN2010», «Ola»): ordene finnes igjen i originalen uten hensyn til store/små bokstaver.
    val orig = txt.trim().split(Regex("\\s+"))
    t = t.split(' ').filter { it.isNotEmpty() }.joinToString(" ") { w -> orig.firstOrNull { it.lowercase().trimEnd(',', '.', ':', ';') == w }?.trimEnd(',', '.', ':', ';') ?: w }
    t = if (t.isNotEmpty()) cap(t) else "Ny hendelse"
    val tm = time
    val d = date ?: if (tm != null && tm <= nm) T.plusDays(1) else T
    val all = tm == null
    val e = if (all) null else (end ?: (tm!! + (dur ?: KalTime44.typeDur(txt.lowercase()) ?: defDur))).coerceAtMost(24 * 60 - 1)
    val r = if (remSet) rem else if (all) null else defRem
    return KParsed(t, cal, d, tm, e, if (all) null else r, txt.trim())
}
