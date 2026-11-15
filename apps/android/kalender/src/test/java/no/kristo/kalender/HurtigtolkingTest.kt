package no.kristo.kalender

import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.OffsetDateTime
import java.time.ZoneId

/**
 * shared/testvektorer/datoer.json (Q17, Q36–Q38) mot den lokale hurtigtolkingen i Kalender (KalParse.kt parseQuick).
 *
 * Serveren er fasit for datoen (POST /api/dates/parse og Glimt). parseQuick er bare forhåndsvisningen mens man skriver, og
 * reserven uten nett. Den avviker fortsatt på noen regler («om 3 dager», «neste fredag», «halv tre» …). Avvikene skrives ut,
 * men testen feiler bare hvis færre vektorer stemmer enn i dag (målt i Fase 5: 44 av 63). Samme ordning som iOS
 * (DateVectorTests, ikke strenge). Når regelen rettes eller byttes ut med serverens svar, heves [MINST].
 */
class HurtigtolkingTest {
    private val rot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .firstOrNull { File(it, "shared/testvektorer/datoer.json").isFile } ?: error("Fant ikke shared/testvektorer")

    @Test fun datoVektorene() {
        val a = JSONObject(File(rot, "shared/testvektorer/datoer.json").readText()).getJSONArray("vektorer")
        assertTrue(a.length() >= 30)
        var ok = 0
        val avvik = ArrayList<String>()
        for (i in 0 until a.length()) {
            val v = a.getJSONObject(i)
            val naa = OffsetDateTime.parse(v.getString("naa")).atZoneSameInstant(ZoneId.of("Europe/Oslo")).toLocalDateTime()
            val p = parseQuick(v.getString("tekst"), null, naa.toLocalDate(), naa.hour * 60 + naa.minute)
            val tid: String? = p.s?.let { "%02d:%02d".format(it / 60, it % 60) }
            val ventetTid: String? = if (v.isNull("tid")) null else v.getString("tid")
            if (p.d.toString() == v.getString("dato") && tid == ventetTid) ok++
            else avvik.add(v.getString("id") + " «" + v.getString("tekst") + "»: fikk " + p.d + " " + (tid ?: "–") + ", ventet " + v.getString("dato") + " " + (ventetTid ?: "–"))
        }
        println("HurtigtolkingTest: parseQuick stemmer med $ok av ${a.length()} vektorer i datoer.json")
        avvik.forEach { println("  kjent avvik (serveren er fasit): $it") }
        assertTrue("parseQuick stemmer med $ok av ${a.length()}, færre enn $MINST (regresjon)", ok >= MINST)
    }

    companion object {
        /** Antall vektorer som stemmer i dag. Heves når avvik rettes. */
        const val MINST: Int = 44
    }
}
