package no.kristo.felles

import no.kristo.felles.moduler.Fanenokler
import no.kristo.felles.moduler.Modulliste
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Modullisten (Fase 6): den innebygde kopien er lik shared/schemas/moduler.json, tolkingen tåler både kilden og svaret fra
 * GET /api/moduler (eksemplet i shared/schemas/eksempler/moduler.json), og fanenøklene appene lagrer peker på moduler som finnes.
 */
class ModullisteTest {
    private val kilde: Modulliste get() = Modulliste.fra(Repo.fil("shared/schemas/moduler.json").readText())!!

    @Test fun innebygdKopiErLikKilden() {
        val tekst = Modulliste.innebygdTekst()
        assertNotNull("moduler.json er ikke bygd inn i :felles (processResources)", tekst)
        assertEquals(Repo.fil("shared/schemas/moduler.json").readText(), tekst)
        assertEquals(kilde, Modulliste.innebygd())
    }

    @Test fun tolkerKilden() {
        val l = kilde
        assertTrue(l.versjon >= 1)
        assertEquals(listOf("oversikt", "kalender", "finans", "media", "familie", "mat", "gjoremal", "skjold"), l.toppmeny)
        assertEquals("Oversikt", l.navn("oversikt"))
        assertEquals("Gjøremål", l.navn("gjoremal"))
        assertEquals("Økonomi", l.navn("finans"))
        assertEquals("Reise", l.navn("reise"))
        assertEquals("Konto og sikkerhet", l.innstillinger.first().navn)
        assertEquals("Server", l.innstillinger.last().navn)
        assertTrue(l.innstillinger.last().adminOnly)
        // Hver modul har en gruppe som finnes, og et tegn og et Material-navn til Android.
        val grupper = l.grupper.map { it.id }.toSet()
        for (m in l.moduler) {
            assertTrue("${m.id}: ukjent gruppe ${m.gruppe}", m.gruppe in grupper)
            assertTrue("${m.id}: mangler ikon", m.ikon.tegn.isNotBlank() && m.ikon.material.isNotBlank())
        }
    }

    @Test fun eksempletFraServeren() {
        val l = Modulliste.fra(Repo.fil("shared/schemas/eksempler/moduler.json").readText())
        assertNotNull(l)
        assertTrue(l!!.moduler.isNotEmpty())
        // Rundtur: det appen bufrer, kan leses tilbake likt.
        assertEquals(l, Modulliste.fra(l.tilJson().toString()))
        assertNull(Modulliste.fra("<html>"))
        assertNull(Modulliste.fra("""{"versjon":0,"moduler":[]}"""))
    }

    @Test fun forPlattformOgAdmin() {
        val a = kilde.forPlattform("android")
        assertTrue(a.moduler.all { "android" in it.plattformer })
        assertNull("Smarthjem finnes bare på web", a.modul("smarthjem"))
        assertNull(kilde.utenAdmin().modul("domener"))
        assertNull(kilde.utenAdmin().innstilling("server"))
    }

    @Test fun kalendervisningerOgFiltre() {
        val k = kilde.modul("kalender")!!
        assertEquals(listOf("ar", "mnd", "uke", "3d", "dag", "liste"), k.undersider("visning").map { it.id })
        assertEquals(listOf("År", "Mnd", "Uke", "3 d", "Dag", "Liste"), k.undersider("visning").map { it.kort })
        assertEquals(listOf("alle", "familie", "bursdager", "skole"), k.undersider("filter").map { it.id })
    }

    @Test fun gamleRuter() {
        val l = kilde
        assertEquals("gjoremal", l.finnRute("#/huskeliste")?.modul?.id)
        assertEquals("oversikt", l.finnRute("#/dash")?.modul?.id)
        assertEquals("bursdager", l.finnRute("#/bursdager")?.underside?.id)
        assertEquals("kalender", l.finnRute("#/familiekalender")?.modul?.id)
        assertEquals("familie", l.finnRute("#/familiekalender")?.underside?.id)
        assertEquals("kart", l.finnRute("#/kart")?.underside?.id)
        assertEquals("reise", l.finnRute("#/avganger")?.modul?.id)
        assertEquals("finans", l.finnRute("/finans/")?.modul?.id)
        assertEquals("nyheter", l.finnRute("#/nyhetsleser")?.modul?.id)
        assertEquals("gjoremal", l.finnRute("homelab://gjoremal")?.modul?.id)
        // Kalender selv, ikke en underside med samme rute.
        assertNull(l.finnRute("#/kalender")?.underside)
        assertNull(l.finnRute("#/finnes-ikke"))
        assertEquals("konto", l.innstilling("sikkerhet")?.id)
        assertEquals("enheter", l.innstilling("widgets")?.id)
    }

    @Test fun fanenoklerPekerPaModulerSomFinnes() {
        val l = kilde
        for ((nokkel, id) in Fanenokler.TIL_MODUL) assertNotNull("$nokkel → $id finnes ikke i moduler.json", l.modul(id))
        for ((gammel, ny) in Fanenokler.ALIAS) assertEquals(ny, Fanenokler.norm(gammel))
        assertEquals("gjoremal", Fanenokler.modul("huske"))
        assertEquals("nyheter", Fanenokler.modul("rss"))
        assertEquals("huske", Fanenokler.fra("gjoremal"))
        assertEquals("avganger", Fanenokler.fra("reise"))
        assertNull(Fanenokler.modul("aksjer"))
        // Nøklene appene lagrer, er de serveren godtar (server/mobile.js TAB_IDS).
        val tabIds = Regex("""TAB_IDS = \[([^\]]*)]""").find(Repo.fil("server/mobile.js").readText())!!.groupValues[1]
            .let { Regex("'([a-z]+)'").findAll(it).map { m -> m.groupValues[1] }.toSet() }
        for (k in Fanenokler.TIL_MODUL.keys) assertTrue("$k mangler i TAB_IDS", k in tabIds)
    }

    @Test fun normRute() {
        assertEquals("gjoremal", Modulliste.normRute("#/gjoremal/"))
        assertEquals("finans", Modulliste.normRute("/finans/"))
        assertEquals("reise/kart", Modulliste.normRute("homelab://reise/kart"))
        assertEquals("", Modulliste.normRute("  "))
        assertTrue(JSONObject(kilde.tilJson().toString()).has("innstillinger"))
    }
}
