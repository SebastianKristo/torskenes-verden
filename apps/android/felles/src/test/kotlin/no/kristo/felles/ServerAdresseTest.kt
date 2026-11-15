package no.kristo.felles

import no.kristo.felles.nett.Klartekstvakt
import no.kristo.felles.nett.LokaltNett
import no.kristo.felles.nett.ServerAdresse
import no.kristo.felles.nett.UsikretHttp
import no.kristo.felles.nett.openSikker
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.net.InetAddress
import java.net.URL
import java.net.UnknownHostException

/** shared/testvektorer/serveradresse.json mot ServerAdresse og LokaltNett (samme fil som iOS ServerAddressTests). */
class ServerAdresseTest {
    private val standardOppslag = Klartekstvakt.oppslag

    @After fun tilbake() { Klartekstvakt.oppslag = standardOppslag }

    private fun JSONObject.tekstEllerNull(k: String): String? = if (isNull(k)) null else getString(k)

    @Test fun vektorene() {
        val liste = Repo.vektorer("serveradresse")
        assertTrue(liste.size >= 25)
        for (v in liste) {
            val id = v.getString("id")
            val inn = v.getString("inn")
            val n = ServerAdresse.normaliser(inn)
            assertEquals("$id normalisert («$inn»)", v.tekstEllerNull("normalisert"), n)
            val lokal = n?.let { ServerAdresse.lokal(ServerAdresse.vert(it)) } ?: false
            assertEquals("$id lokal", v.getBoolean("lokal"), lokal)
            assertEquals("$id lokal (erLokalAdresse)", v.getBoolean("lokal"), ServerAdresse.erLokalAdresse(inn))
            assertEquals("$id tillatt", v.getBoolean("tillatt"), ServerAdresse.tillatt(inn))
            // Samme svar som klartekstregelen for den normaliserte adressen.
            if (n != null) assertEquals("$id LokaltNett.ok", v.getBoolean("tillatt"), LokaltNett.ok(n))
            if (v.has("paaliteligEnhet")) assertEquals("$id paaliteligEnhet", v.getBoolean("paaliteligEnhet"), ServerAdresse.paaliteligEnhet(ServerAdresse.vert(n!!)))
            if (v.optBoolean("gammelStandard")) {
                assertTrue("$id gammel standard", ServerAdresse.erGammelStandard(inn))
                assertEquals(ServerAdresse.STANDARD, ServerAdresse.migrer(inn))
            } else {
                assertFalse("$id ikke gammel standard", ServerAdresse.erGammelStandard(inn))
                assertEquals(inn, ServerAdresse.migrer(inn))
            }
        }
    }

    /** Samme fasit som test/p86-and.test.js (godtas / avvises av klartekstregelen). */
    @Test fun klartekstregelen() {
        val godtas = listOf(
            "http://10.0.0.5", "http://192.168.1.2", "http://192.168.1.2:3000/finans", "http://172.16.0.1", "http://172.31.255.255", "http://100.64.1.1",
            "http://127.0.0.1", "http://[::1]", "http://[::1]:3000/", "http://[fd00::1]", "http://[fe80::1]/", "http://169.254.10.1",
            "http://nas.local", "http://homelab", "http://homelab:3000", "http://localhost", "http://srv.lan", "http://x.home.arpa", "http://x.internal",
            "http://[::ffff:10.0.0.1]/", "HTTP://NAS.LOCAL/", "http://bruker:pw@10.0.0.5/", "ws://192.168.1.2/api/ws",
            "https://example.com", "https://8.8.8.8", "https://10.0.0.5", "wss://example.com/api/ws",
        )
        val avvises = listOf(
            "http://172.32.0.1", "http://172.15.0.1", "http://example.com", "http://8.8.8.8", "http://100.63.0.1", "http://100.128.0.1",
            "http://[2001:db8::1]/", "http://[::ffff:8.8.8.8]/", "ws://example.com/ws",
            "http://10.0.0.1.evil.com/", "http://192.168.1.2@evil.com/", "http://nas.local.evil.com", "http://evil.com/?a=10.0.0.1", "http://evil.com#.local",
            "http://2130706433/", "http://134744072/", "http://0x7f.0.0.1/", "http://010.0.0.1/", "http://10.1/", "http://256.1.1.1", "http://",
        )
        for (u in godtas) assertTrue("skal godtas: $u", LokaltNett.ok(u))
        for (u in avvises) assertFalse("skal avvises: $u", LokaltNett.ok(u))
    }

    @Test fun sperretForbindelseKoblerAldriTil() {
        val c = URL("http://example.com/x").openSikker()
        c.requestMethod = "PATCH"; c.connectTimeout = 5; c.doOutput = true; c.setRequestProperty("A", "b")
        for (f in listOf<() -> Any?>({ c.responseCode }, { c.inputStream }, { c.outputStream }, { c.connect() })) {
            try { f(); fail("kastet ikke") } catch (e: UsikretHttp) { assertEquals(LokaltNett.MSG, e.message) }
        }
        c.disconnect()
        assertFalse(URL("http://127.0.0.1:1/").openSikker().javaClass.name.contains("Sperret"))
        assertFalse(URL("https://example.com/").openSikker().javaClass.name.contains("Sperret"))
    }

    /** S3: et lokalt navn over http må peke til en lokal adresse. */
    @Test fun lokaltNavnMaPekeLokalt() {
        fun ip(s: String): ByteArray = InetAddress.getByName(s).address // bare IP-litteraler, ingen DNS
        Klartekstvakt.oppslag = { navn ->
            when (navn) {
                "nas.lan" -> listOf(ip("192.168.1.20"))
                "homelab" -> listOf(ip("10.69.1.39"), ip("fd00::5"))
                "tailnet" -> listOf(ip("100.101.1.2"))
                "falsk.lan" -> listOf(ip("203.0.113.7"))
                "blandet.local" -> listOf(ip("192.168.1.2"), ip("8.8.8.8"))
                else -> throw UnknownHostException(navn)
            }
        }
        assertTrue(Klartekstvakt.tillatt("http", "nas.lan"))
        assertTrue(Klartekstvakt.tillatt("ws", "homelab"))
        assertTrue(Klartekstvakt.tillatt("http", "tailnet"))
        assertFalse("falsk DNS på offentlig nett", Klartekstvakt.tillatt("http", "falsk.lan"))
        assertFalse("én offentlig adresse er nok til å stoppe", Klartekstvakt.tillatt("http", "blandet.local"))
        assertTrue("finnes ikke: tilkoblingen feiler uansett", Klartekstvakt.tillatt("http", "ukjent.lan"))
        assertTrue("IP trenger ikke oppslag", Klartekstvakt.tillatt("http", "192.168.1.2"))
        assertTrue("https røres ikke", Klartekstvakt.tillatt("https", "falsk.lan"))
        assertFalse("ikke-lokale navn stoppes uten oppslag", Klartekstvakt.tillatt("http", "example.com"))
        assertTrue(URL("http://falsk.lan/x").openSikker().javaClass.name.contains("Sperret"))
        assertFalse(URL("http://nas.lan/x").openSikker().javaClass.name.contains("Sperret"))
        Klartekstvakt.oppslag = { throw IllegalStateException("hovedtråden") }
        assertFalse("ukjent feil ved oppslag: ingen klartekst", Klartekstvakt.tillatt("http", "nas.lan"))
        assertTrue(Klartekstvakt.tillattAdresse(false, InetAddress.getByName("10.0.0.2")))
        assertFalse(Klartekstvakt.tillattAdresse(false, InetAddress.getByName("8.8.8.8")))
        assertFalse(Klartekstvakt.tillattAdresse(false, null))
        assertTrue(Klartekstvakt.tillattAdresse(true, null))
    }
}
