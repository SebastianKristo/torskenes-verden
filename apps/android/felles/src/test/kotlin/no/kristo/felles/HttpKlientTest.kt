package no.kristo.felles

import com.sun.net.httpserver.HttpServer
import no.kristo.felles.nett.HttpFeil
import no.kristo.felles.nett.HttpKlient
import no.kristo.felles.nett.LokaltNett
import no.kristo.felles.nett.Nettfeil
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress

/** HttpKlient mot en lokal testserver (127.0.0.1, ingen nett). */
class HttpKlientTest {
    private lateinit var server: HttpServer
    private lateinit var base: String
    @Volatile private var sistAuth: String? = null

    @Before fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/ok") { x ->
            sistAuth = x.requestHeaders.getFirst("Authorization")
            val b = """{"ok":true,"metode":"${x.requestMethod}","kropp":${x.requestBody.readBytes().toString(Charsets.UTF_8).ifBlank { "null" }}}""".toByteArray()
            x.responseHeaders.add("Content-Type", "application/json"); x.sendResponseHeaders(200, b.size.toLong()); x.responseBody.use { it.write(b) }
        }
        server.createContext("/utlopt") { x ->
            val b = """{"error":"Innloggingen er utløpt","code":"TOKEN_EXPIRED","reason":"expired"}""".toByteArray()
            x.sendResponseHeaders(401, b.size.toLong()); x.responseBody.use { it.write(b) }
        }
        server.createContext("/side") { x ->
            val b = "<!doctype html><title>Logg inn</title>".toByteArray()
            x.sendResponseHeaders(200, b.size.toLong()); x.responseBody.use { it.write(b) }
        }
        server.start()
        base = "http://127.0.0.1:" + server.address.port
    }

    @After fun stopp() { server.stop(0) }

    @Test fun sendMedTokenOgJson() {
        val s = HttpKlient(base, "tok").send("POST", "/ok", """{"a":1}""")
        assertEquals(200, s.status)
        assertTrue(s.ok)
        assertTrue(s.body, s.body.contains("\"metode\":\"POST\"") && s.body.contains("\"a\":1"))
        assertEquals("Bearer tok", sistAuth)
    }

    @Test fun utloptTokenGirFeilsvar() {
        val s = HttpKlient(base, "gammelt").send("GET", "/utlopt")
        assertEquals(401, s.status)
        assertTrue(s.feil!!.tokenUgyldig(401))
        try { HttpKlient(base, "gammelt").sendOk("GET", "/utlopt"); fail() } catch (e: HttpFeil) {
            assertEquals(401, e.status)
            assertEquals("Innloggingen er utløpt", e.message)
            assertTrue(e.svar!!.utlopt)
        }
    }

    @Test fun nettsideIStedetForData() {
        try { HttpKlient(base, null).sendOk("GET", "/side"); fail() } catch (e: HttpFeil) { assertEquals(Nettfeil.NETTSIDE, e.message) }
    }

    @Test fun klartekstUtenforHjemmetSendesAldri() {
        try { HttpKlient("http://example.com", "tok").send("GET", "/x"); fail() } catch (e: HttpFeil) {
            assertEquals(0, e.status)
            assertEquals(LokaltNett.MSG, e.message)
        }
    }

    @Test fun ingenKontakt() {
        // Port 1 på loopback: ingen lytter.
        try { HttpKlient("http://127.0.0.1:1", null).send("GET", "/x", tilkobling = 2000); fail() } catch (e: HttpFeil) {
            assertEquals(0, e.status)
            assertTrue(e.message, e.message!!.startsWith("Fikk ikke kontakt med 127.0.0.1:1"))
        }
    }
}
