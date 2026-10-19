package no.kristo.kalender

import java.time.LocalDate

/*
 * Prompt 33: Glimt i Kalender – lokale svar (fasit: Kalender App.dc.html → ask()). Raskt og uten nett:
 *  ledig tid (hull ≥ 45 min 08–21), bursdager, frister/eksamen, oppsummer dag/uke, vær, «når er neste X?» og «legg til …».
 * Alt annet (eller når den lokale tolkningen ikke er sikker) går til serverens /api/assist {source:'calendar'} (KalVm.glServer).
 */

data class KSlot(val d: LocalDate, val s: Int, val e: Int)

/** steps = tenker-stegene, cards = hendelseskort, slots = ledige tider, create = hendelse som skal legges inn (kan angres). */
data class KAns(val steps: List<String>, val txt: String, val cards: List<KEv> = emptyList(), val slots: List<KSlot> = emptyList(), val create: KEv? = null)

class KalAsk(private val all: List<KEv>, private val cals: Map<String, KCal>, private val wx: Map<LocalDate, KWx>, private val defRem: Int?) {
    private val T = today()
    private val nm = nowMin()
    private fun calName(c: String) = cals[c]?.n ?: KCALS.firstOrNull { it.id == c }?.n ?: "Personlig"

    private val up: List<KEv> = all.filter { it.d.isAfter(T) || (it.d == T && (it.all || (it.e ?: 0) > nm)) }
        .sortedWith(compareBy<KEv> { it.d }.thenBy { it.s ?: 0 })

    private fun rel(d: LocalDate): String = when (d) { T -> "i dag"; T.plusDays(1) -> "i morgen"; T.minusDays(1) -> "i går"; T.plusDays(2) -> "i overmorgen"; else -> fd(d) }

    private fun on(d: LocalDate): List<KEv> = all.filter { it.d == d || (it.days > 1 && !it.d.isAfter(d) && !it.d.plusDays((it.days - 1).toLong()).isBefore(d)) }
        .sortedWith(compareBy<KEv> { if (it.all) 0 else 1 }.thenBy { it.s ?: 0 })

    private fun wxD(d: LocalDate): String {
        val w = wx[d] ?: return ""
        val k = wkd(w.c)
        return " Været: " + WTXT.getValue(k).lowercase() + ", " + w.lo + "–" + w.hi + " grader" + (if (k == "regn") ", så ta med paraply." else ".")
    }

    /** Prompt 35: felles dag-tolkning (parseDay35) – «i morgen?», «imorgen», «i morra», «tomorrow», «i går» … */
    private fun dayOf(ql: String): LocalDate? = parseDay35(ql, T)

    private fun stripFrist(t: String) = t.replace(Regex("^Frist: "), "")

    /** null = vet ikke lokalt → spør serveren. */
    fun ask(q: String): KAns? {
        // Prompt 35 (FEIL: svarte for i dag): normaliser først – små bokstaver, uten ? ! . , : ; « » ", ett mellomrom, polstret.
        val ql = norm35(q)
        if (Regex("ledig|fri tid|finn tid|når kan jeg|har jeg tid").containsMatchIn(ql)) {
            val d = dayOf(ql) ?: T.plusDays(1)
            val ev = on(d).filter { !it.all }
            var t0 = if (d == T) maxOf(480, ((nm + 29) / 30) * 30) else 480
            val gaps = ArrayList<Pair<Int, Int>>()
            ev.forEach { e -> if ((e.s ?: 0) - t0 >= 45) gaps += t0 to (e.s ?: 0); t0 = maxOf(t0, e.e ?: t0) }
            if (1260 - t0 >= 45) gaps += t0 to 1260
            val list = gaps.map { hm(it.first) + "–" + hm(it.second) }
            val joined = if (list.size > 1) list.dropLast(1).joinToString(", ") + " og " + list.last() else list.firstOrNull().orEmpty()
            return KAns(
                listOf("Leser " + rel(d) + " i kalenderen", "Finner hull på minst 45 min", "Foreslår tider"),
                if (gaps.isNotEmpty()) cap(rel(d)) + " er du ledig " + joined + ". Trykk på en tid for å booke den." else cap(rel(d)) + " er det fullt mellom 08 og 21.",
                slots = gaps.take(4).map { KSlot(d, it.first, minOf(it.second, it.first + 60)) },
            )
        }
        if (Regex("bursdag").containsMatchIn(ql)) {
            val l = up.filter { it.cal == "b" || it.kind == "bursdag" }.take(3)
            return KAns(listOf("Ser i Bursdager"), if (l.isNotEmpty()) "De neste bursdagene: " + l.joinToString(", ") { it.t + " " + rel(it.d) } + "." else "Ingen bursdager de neste ukene.", l)
        }
        // Prompt 37: intensjon før tekstsøk – «Neste prøve på skolen» er en skoleprøve i Studie, aldri «Viaplay-prøven slutter».
        School37.answer(ql, up, { cals[it] ?: KCALS.firstOrNull { c -> c.id == it } }, ::rel, T)?.let { return it }
        if (Regex("frist|eksamen|innlevering|oblig").containsMatchIn(ql)) {
            val l = up.filter { it.kind == "frist" && !School37.isTrialEv(it) }.take(4)
            val txt = if (l.isEmpty()) "Ingen frister fremover." else "Neste frist er " + stripFrist(l[0].t) + " " + rel(l[0].d) + "." +
                (if (l.size > 1) " Etter det: " + l.drop(1).joinToString(", ") { stripFrist(it.t) + " " + rel(it.d) } + "." else "")
            return KAns(listOf("Ser i Studie", "Sorterer frister"), txt, l)
        }
        // «i morgen?» / «fredag?» alene, eller «what's on tomorrow»: oppsummer den dagen.
        val dayOnly = dayOf(ql) != null && !Regex("\\d{1,2}[.:]\\d{2}|kl ?\\d").containsMatchIn(ql) &&
            ql.replace(Regex(" (i ?morgen|i ?morra|imorgo|tomorrow|i ?dag|i ?kveld|i ?natt|today|tonight|i ?går|overmorgen|i overmorgen|neste|på|on|what|whats|is|do|i|have|har|jeg|skjer|da|så|søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)(?= )"), " ").isBlank()
        if (dayOnly || Regex("(oppsummer|hva skjer|hva har jeg|program|plan|hvordan ser|hva står|whats on|what is on|what do i have|what have i got|skjer)").containsMatchIn(ql)) {
            if (Regex("uka|uke|denne uken|neste uke").containsMatchIn(ql)) {
                val d0 = if (ql.contains("neste uke")) mon(T).plusDays(7) else T
                val days = (0 until 7).map { d0.plusDays(it.toLong()) }
                val l = days.flatMap { d -> on(d).filter { it.d == d } }
                val busy = days.map { d -> d to on(d).size }.maxByOrNull { it.second } ?: (T to 0)
                val fr = l.firstOrNull { it.kind == "frist" }
                val bd = l.firstOrNull { it.cal == "b" || it.kind == "bursdag" }
                return KAns(
                    listOf("Leser 7 dager", "Finner travleste dag", "Skriver oppsummering"),
                    "Du har ${l.size} hendelser de neste 7 dagene. Travlest er " + rel(busy.first) + " med " + busy.second + "." +
                        (fr?.let { " Husk fristen: " + stripFrist(it.t) + "." } ?: "") + (bd?.let { " Bursdag: " + it.t + "." } ?: ""),
                    l.filter { it.kind != null || it.cal == "b" || (it.rem ?: 0) >= 60 }.take(4),
                )
            }
            val d = dayOf(ql) ?: T
            val l = on(d)
            val tm = l.filter { !it.all }
            val txt = if (l.isNotEmpty()) cap(rel(d)) + " har du " + l.size + (if (l.size == 1) " hendelse" else " hendelser") + "." +
                (if (tm.isNotEmpty()) " Første er " + tm[0].t + " kl. " + hm(tm[0].s ?: 0) + ", og dagen er ferdig " + hm(tm.maxOf { it.e ?: 0 }) + "." else "") + wxD(d)
            else cap(rel(d)) + " er helt fri." + wxD(d)
            return KAns(listOf("Leser " + rel(d), "Sjekker været", "Skriver oppsummering"), txt, l.take(5))
        }
        if (Regex("vær|regn|paraply").containsMatchIn(ql)) {
            val d = dayOf(ql) ?: T
            val w = wxD(d).trim()
            return KAns(listOf("Henter værvarsel"), if (w.isEmpty()) "Har ikke værvarsel for den dagen ennå." else w.replaceFirst("Været:", cap(rel(d)) + ":"))
        }
        if (Regex("neste|når er|når har|når skal|når må").containsMatchIn(ql)) {
            // Prompt 37: skole-ordene er stoppord (kontekst), ingen «-en/-et»-stripping, og alle søkeordene må treffe.
            val terms = School37.terms(ql)
            fun hay(e: KEv) = (e.t + " " + e.loc.orEmpty() + " " + calName(e.cal) + " " + e.note.orEmpty()).lowercase()
            val school = School37.isSchoolQ(ql)
            val trialQ = School37.isTrialQ(ql)
            val pool = up.filter { e -> (!School37.isTrialEv(e) || trialQ) && (!school || Fag37.isStudy(e, cals[e.cal])) }
            val m = if (terms.isNotEmpty()) pool.firstOrNull { e -> !e.all && School37.all(hay(e), terms) } ?: pool.firstOrNull { e -> School37.all(hay(e), terms) }
            else pool.firstOrNull { !it.all }
            if (m != null) {
                val days = daysBetween(T, m.d)
                val txt = (if (terms.isNotEmpty()) "Neste " + terms.joinToString(" ") + " er " + m.t + " " else "Neste er " + m.t + " ") + rel(m.d) +
                    (if (m.all) "" else " kl. " + hm(m.s ?: 0)) + (m.loc?.let { ", $it" } ?: "") + "." + (if (days > 1) " Det er om $days dager." else "") +
                    (if (m.rem != null) " Du får varsel " + remL(m.rem) + "." else "")
                return KAns(listOf("Søker etter «" + (terms.joinToString(" ").ifBlank { "neste" }) + "»", "Fant " + m.t), txt, listOf(m))
            }
            // Fant ingenting lokalt: serveren kan ha mer (Google, skole, flere måneder frem).
            return null
        }
        val p = parseQuick(q, defRem, T, nm)
        if (p.s != null || Regex("\\d").containsMatchIn(q) || q.length > 50) {
            // Prompt 37: stedet i teksten lagres på hendelsen (adresse og kart vises under kortet).
            val place = Place37.extract(q)
            val ev = KEv("u" + System.currentTimeMillis(), p.t, p.cal, p.d, p.s, p.e, loc = place, rem = p.rem, src = p.src)
            return KAns(
                listOf("Leser teksten", "Finner dato og tid", "Legger inn i " + calName(p.cal)),
                "Jeg la til «" + p.t + "» " + rel(p.d) + (if (p.all) "" else " kl. " + hm(p.s ?: 0)) + " i " + calName(p.cal) + (if (p.all) "." else ", med varsel " + remL(p.rem) + ".") +
                    (place?.let { " Sted: $it." } ?: ""),
                listOf(ev), create = ev,
            )
        }
        return null
    }

    companion object {
        const val HELP = "Jeg kan svare på ting som «Hva skjer i morgen?», «Når er neste frisørtime?» og «Finn ledig tid fredag», eller legge inn hendelser du skriver eller limer inn."
        val SUG = listOf("Hva skjer i morgen?", "Når er neste frisørtime?", "Finn ledig tid fredag", "Oppsummer uka", "Neste frist?", "Neste bursdag?")
    }
}

/** «Glimt · dagen din» øverst i Liste (fasitens sumTxt). */
fun daySummary(all: List<KEv>, wx: Map<LocalDate, KWx>): String {
    val T = today(); val nm = nowMin(); val tmr = T.plusDays(1)
    val up = all.filter { it.d.isAfter(T) || (it.d == T && (it.all || (it.e ?: 0) > nm)) }.sortedWith(compareBy<KEv> { it.d }.thenBy { it.s ?: 0 })
    val tm = all.filter { it.d == T && !it.all && (it.e ?: 0) > nm }.sortedBy { it.s }
    val nb = up.firstOrNull { it.cal == "b" || it.kind == "bursdag" }
    val nf = up.firstOrNull { it.kind == "frist" }
    val w = wx[T]
    val sb = StringBuilder(if (tm.isNotEmpty()) "Du har ${tm.size} igjen i dag. Neste er ${tm[0].t} kl. ${hm(tm[0].s ?: 0)}." else "Resten av dagen er fri.")
    if (w != null) { val k = wkd(w.c); sb.append(" ").append(WTXT[k]).append(", ").append(w.lo).append("–").append(w.hi).append("°").append(if (k == "regn") ", ta med paraply." else ".") }
    if (nf != null) sb.append(" Frist: ").append(nf.t.replace(Regex("^Frist: "), "")).append(" ").append(if (nf.d == tmr) "i morgen" else dl(nf.d).lowercase()).append(".")
    if (nb != null && !nb.d.isAfter(T.plusDays(7))) sb.append(" ").append(nb.t).append(" ").append(when (nb.d) { T -> "i dag"; tmr -> "i morgen"; else -> dl(nb.d).lowercase() }).append(".")
    return sb.toString()
}
