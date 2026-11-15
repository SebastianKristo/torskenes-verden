package no.kristo.finanshub

import no.kristo.felles.nett.Klartekstvakt
import no.kristo.felles.nett.LokaltNett
import no.kristo.felles.nett.UsikretHttp
import okhttp3.Interceptor
import okhttp3.Response

/**
 * OkHttp-klientene (bilder i Img50, sanntid i Realtime): http:// og ws:// bare på lokalt nett (:felles, LokaltNett).
 * Brukes både som vanlig interceptor (før tilkobling) og som nettverksinterceptor (hvert hopp ved omdirigering).
 * Som nettverksinterceptor er forbindelsen åpnet: klartekst må da også ha gått til en lokal IP-adresse (S3, Klartekstvakt),
 * så et lokalt navn som peker ut på nettet (falsk DNS) aldri får tokenet.
 */
object LokalOkHttp : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val u = chain.request().url
        if (!u.isHttps && !LokaltNett.lokalVert(u.host)) throw UsikretHttp()
        val c = chain.connection()
        // Via en proxy er adressen proxyens; da gjelder bare navneregelen over.
        if (c != null && c.route().proxy.type() == java.net.Proxy.Type.DIRECT && !Klartekstvakt.tillattAdresse(u.isHttps, c.route().socketAddress.address)) throw UsikretHttp()
        return chain.proceed(chain.request())
    }
}

/** Kartfliser (osmdroid henter selv): en http://-mal utenfor lokalt nett hentes over https i stedet. */
fun httpsUtenforHjemmet(url: String): String = if (LokaltNett.ok(url)) url else "https" + url.substring(url.indexOf("://"))

/**
 * WebView (værkartet, etikettutskrift): sider og ressurser over http:// utenfor lokalt nett lastes ikke, heller ikke når en
 * side lenker eller omdirigerer dit.
 */
open class LokalWebKlient : android.webkit.WebViewClient() {
    override fun shouldInterceptRequest(view: android.webkit.WebView, request: android.webkit.WebResourceRequest): android.webkit.WebResourceResponse? {
        val u = request.url
        if (u != null && !LokaltNett.ok(u.scheme, u.host)) {
            return android.webkit.WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), java.io.ByteArrayInputStream(LokaltNett.MSG.toByteArray()))
        }
        return super.shouldInterceptRequest(view, request)
    }
}
