package no.kristo.finanshub.wear

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Prompt 86 (AND86): klartekst (http://, ws://) er bare tillatt på lokalt nett.
 *
 * Android kan ikke uttrykke private IP-områder i network_security_config, så konfigurasjonen tillater klartekst, og regelen
 * håndheves her – før noe kobles til. Alle HTTP-kall i modulen går gjennom [open86] (HttpURLConnection), [Lokal86.ok]
 * (OkHttp, WebView, kartfliser) eller har en fast https-adresse. Samme fil ligger i :app, :kalender og :wear (bare pakkenavnet
 * er ulikt); test/p86-and.test.js sjekker at de er like og kjører fasiten.
 *
 * Lokalt nett = loopback, privat IPv4 (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10), CGNAT 100.64/10
 * (Tailscale), IPv6 ULA (fc00::/7), eller et navn uten punktum eller som slutter på .local/.lan/.home.arpa/.internal.
 * Tallformer som ikke er vanlig a.b.c.d (heltall, heksadesimalt, oktalt, korte former) avvises – de kan peke hvor som helst.
 */
object Lokal86 {
    const val MSG = "Usikret tilkobling (http) er bare tillatt på lokalt nett. Bruk https."

    private val ENDELSER = listOf(".local", ".lan", ".home.arpa", ".internal")

    /** true når [skjema] ikke er klartekst, eller [vert] er på lokalt nett. */
    fun ok(skjema: String?, vert: String?): Boolean = when (skjema?.lowercase()) {
        "http", "ws" -> lokalVert(vert)
        else -> true
    }

    fun ok(u: URL): Boolean = ok(u.protocol, u.host)

    /** Full adresse som tekst. Klartekst som ikke lar seg tolke, avvises. */
    fun ok(url: String?): Boolean {
        val s = (url ?: "").trim()
        val i = s.indexOf("://")
        val skjema = if (i > 0) s.substring(0, i).lowercase() else return true
        if (skjema != "http" && skjema != "ws") return true
        val vert = try { URL("http" + s.substring(i)).host } catch (e: Exception) { return false }
        return lokalVert(vert)
    }

    /** true når [vert] (navn, IPv4 eller IPv6 – med eller uten klammer) er på lokalt nett. Slår aldri opp i DNS. */
    fun lokalVert(vert: String?): Boolean {
        var h = (vert ?: "").trim().lowercase()
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length - 1)
        h = h.substringBefore('%').trimEnd('.')
        if (h.isEmpty()) return false
        if (h.contains(':')) {
            val g = v6(h) ?: return false
            if (g.take(5).all { it == 0 } && g[5] == 0xffff) return lokalV4(g[6] shr 8, g[6] and 0xff) // ::ffff:a.b.c.d
            if (g.take(7).all { it == 0 } && g[7] == 1) return true // ::1
            return (g[0] and 0xfe00) == 0xfc00 || (g[0] and 0xffc0) == 0xfe80 // ULA, link-local
        }
        val deler = h.split('.')
        if (deler.any { it.isEmpty() }) return false
        if (deler.all { d -> d.all { it in '0'..'9' } || d.startsWith("0x") }) {
            val a = v4(h) ?: return false
            return lokalV4(a[0], a[1])
        }
        if (!h.all { it.isLetterOrDigit() || it == '-' || it == '_' || it == '.' }) return false
        return deler.size == 1 || ENDELSER.any { h.endsWith(it) }
    }

    private fun lokalV4(a: Int, b: Int): Boolean =
        a == 10 || a == 127 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 169 && b == 254) || (a == 100 && b in 64..127)

    /** Streng a.b.c.d (desimalt, uten ledende nuller) → fire tall, ellers null. */
    private fun v4(s: String): List<Int>? {
        val p = s.split('.')
        if (p.size != 4) return null
        val out = ArrayList<Int>(4)
        for (d in p) {
            if (d.isEmpty() || d.length > 3 || !d.all { it in '0'..'9' } || (d.length > 1 && d[0] == '0')) return null
            val n = d.toInt()
            if (n > 255) return null
            out.add(n)
        }
        return out
    }

    /** IPv6-adresse som tekst (med «::» og ev. a.b.c.d til slutt) → åtte grupper, ellers null. */
    private fun v6(h: String): List<Int>? {
        var s = h
        if (s.contains('.')) {
            val i = s.lastIndexOf(':')
            val a = v4(s.substring(i + 1)) ?: return null
            s = s.substring(0, i + 1) + Integer.toHexString(a[0] * 256 + a[1]) + ":" + Integer.toHexString(a[2] * 256 + a[3])
        }
        val dbl = s.indexOf("::")
        if (dbl != s.lastIndexOf("::")) return null
        if (dbl < 0) return grupper(s)?.takeIf { it.size == 8 }
        val a = grupper(s.substring(0, dbl)) ?: return null
        val b = grupper(s.substring(dbl + 2)) ?: return null
        if (a.size + b.size > 7) return null
        return a + List(8 - a.size - b.size) { 0 } + b
    }

    private fun grupper(s: String): List<Int>? {
        if (s.isEmpty()) return emptyList()
        val out = ArrayList<Int>()
        for (g in s.split(':')) {
            if (g.isEmpty() || g.length > 4 || !g.all { it in '0'..'9' || it in 'a'..'f' }) return null
            out.add(g.toInt(16))
        }
        return out
    }
}

/** Kastes i stedet for å koble til når adressen er http:// utenfor lokalt nett. */
class UsikretHttp86 : IOException(Lokal86.MSG)

/**
 * Erstatter `openConnection() as HttpURLConnection`. For http:// utenfor lokalt nett returneres en forbindelse som aldri
 * kobler til og kaster [UsikretHttp86] der en vanlig forbindelse ville feilet (connect/les/skriv), så eksisterende
 * feilhåndtering rundt kallene gjelder uendret.
 */
fun URL.open86(): HttpURLConnection = if (Lokal86.ok(this)) openConnection() as HttpURLConnection else Sperret86(this)

private class Sperret86(u: URL) : HttpURLConnection(u) {
    override fun connect() { throw UsikretHttp86() }
    override fun disconnect() {}
    override fun usingProxy(): Boolean = false
    override fun setRequestMethod(method: String?) {}
    override fun getInputStream(): InputStream = throw UsikretHttp86()
    override fun getOutputStream(): OutputStream = throw UsikretHttp86()
    override fun getResponseCode(): Int = throw UsikretHttp86()
}
