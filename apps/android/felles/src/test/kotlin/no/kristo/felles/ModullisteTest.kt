package no.kristo.felles

import no.kristo.felles.moduler.Dyplenker
import no.kristo.felles.moduler.Fanenokler
import no.kristo.felles.moduler.Modulliste
import no.kristo.felles.moduler.Tilkoblinger
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

    /** Grupperingen av integrasjonene er bygd inn og lik shared/schemas/tilkoblinger.json (samme grupper som på web). */
    @Test fun tilkoblinger() {
        val t = Tilkoblinger.innebygd()
        assertNotNull("tilkoblinger.json er ikke bygd inn i :felles (processResources)", t)
        assertEquals(Tilkoblinger.fra(Repo.fil("shared/schemas/tilkoblinger.json").readText()), t)
        assertEquals("Smarthjem", t!!.grupper.first())
        assertEquals("Generelt", t.grupper.last())
        assertEquals("Smarthjem", t.gruppe("ha"))
        assertEquals("Kalender og e-post", t.gruppe("google"))
        assertEquals("Reise og pakker", t.gruppe("entur"))
        assertEquals("Generelt", t.gruppe("finnes-ikke"))
        assertEquals("Media", t.gruppe("sonarr", "Annet"))
        assertEquals("Økonomi", t.gruppe("sonarr", "Økonomi"))
    }

    /** Dyplenker: nye modul-id-er og gamle ruter går til appens sider; vertene appen kjenner fra før, er uendret. */
    @Test fun dyplenker() {
        val l = kilde.forPlattform("android")
        fun m(v: String, s: String = ""): String = Dyplenker.mal(l, v, s).let { if (it.sti.isEmpty()) it.vert else it.vert + "/" + it.sti }
        assertEquals("homelab", m("oversikt"))
        assertEquals("homelab", m("dash"))
        assertEquals("huske", m("gjoremal"))
        assertEquals("huske", m("huskeliste"))
        assertEquals("huske/new", m("gjoremal", "/new"))
        assertEquals("avganger", m("reise"))
        assertEquals("kart", m("reise", "kart"))
        assertEquals("kart/sone-1", m("kart", "/sone-1"))
        assertEquals("familiekalender", m("kalender", "familie"))
        assertEquals("bursdager", m("kalender", "bursdager"))
        assertEquals("kalender/2026-11-20", m("kalender", "2026-11-20"))
        assertEquals("familie/steder", m("familie", "steder"))
        assertEquals("finance", m("okonomi"))
        assertEquals("finance", m("finans"))
        assertEquals("media/snart", m("media", "kommer"))
        assertEquals("media/qbit", m("media", "qbit"))
        assertEquals("kveld/lyd", m("mediakveld", "lyd"))
        assertEquals("nyheter", m("nyhetsleser"))
        assertEquals("tracking", m("sporing"))
        assertEquals("domains", m("domener"))
        assertEquals("faste/abonnementer", m("abonnementer"))
        assertEquals("faste/planlagte", m("faste-betalinger", "planlagte"))
        assertEquals("list", m("transaksjoner"))
        // Vertene appen kjente fra før, er uendret (widgets, varsler og snarveier).
        for (v in listOf("homelab", "tracking", "budget", "finance", "home", "list", "review", "subs", "stocks", "domains", "mat", "news",
            "rss", "huske", "tasks", "bursdager", "kalender", "avganger", "familie", "kart", "skjold", "hjemlys", "finn", "boliger",
            "search", "glimt", "chat", "nordlys", "system", "brief", "media", "widgets", "bibel", "ai", "scan", "settings", "plan", "kveld", "sok")) {
            assertEquals("$v skal være uendret", v, Dyplenker.mal(l, v, "").vert)
        }
        assertEquals("avganger", Dyplenker.mal(l, "ruter", "").vert)
        // Stabilt: målet gir seg selv igjen.
        for (v in listOf("oversikt", "gjoremal", "reise", "okonomi", "sporing", "domener", "abonnementer")) {
            val a = Dyplenker.mal(l, v, "")
            assertEquals(a, Dyplenker.mal(l, a.vert, a.sti))
        }
        assertEquals("finanshub://gjoremal/new", Dyplenker.fraHomelab("homelab://gjoremal/new"))
        assertNull(Dyplenker.fraHomelab("homelab://login?c=1"))
        assertNull(Dyplenker.fraHomelab("finanshub://huske"))
    }
}
