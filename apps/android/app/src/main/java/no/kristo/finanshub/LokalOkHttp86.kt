package no.kristo.finanshub

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Prompt 86 (AND86): OkHttp-klientene (bilder i Img50, sanntid i Realtime) – http:// og ws:// bare på lokalt nett (Lokal86.kt).
 * Brukes både som vanlig interceptor (før tilkobling) og som nettverksinterceptor (hvert hopp ved omdirigering).
 */
object LokalOkHttp86 : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val u = chain.request().url
        if (!u.isHttps && !Lokal86.lokalVert(u.host)) throw UsikretHttp86()
        return chain.proceed(chain.request())
    }
}

/** Kartfliser (osmdroid henter selv): en http://-mal utenfor lokalt nett hentes over https i stedet. */
fun https86(url: String): String = if (Lokal86.ok(url)) url else "https" + url.substring(url.indexOf("://"))

/**
 * WebView (værkartet, etikettutskrift): sider og ressurser over http:// utenfor lokalt nett lastes ikke, heller ikke når en
 * side lenker eller omdirigerer dit.
 */
open class WebKlient86 : android.webkit.WebViewClient() {
    override fun shouldInterceptRequest(view: android.webkit.WebView, request: android.webkit.WebResourceRequest): android.webkit.WebResourceResponse? {
        val u = request.url
        if (u != null && !Lokal86.ok(u.scheme, u.host)) {
            return android.webkit.WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), java.io.ByteArrayInputStream(Lokal86.MSG.toByteArray()))
        }
        return super.shouldInterceptRequest(view, request)
    }
}
