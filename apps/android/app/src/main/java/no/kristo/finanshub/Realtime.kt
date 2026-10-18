package no.kristo.finanshub

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Sanntid fra serveren: én WebSocket mot /api/ws?token=… Meldingene er {type: 'tasks' | 'family' | 'tracking', …}.
 * Kobler til på nytt med økende pause (2–60 s) når forbindelsen faller, og stoppes når appen går i bakgrunnen.
 */
class Realtime(private val onMessage: (String, JSONObject) -> Unit) {
    private val client = OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build()
    private var ws: WebSocket? = null
    private var url: String? = null
    private var wanted = false
    private var retry = 2_000L
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    val connected: Boolean get() = ws != null

    fun start(base: String, token: String?) {
        if (base.isBlank() || token.isNullOrBlank()) return
        val u = base.trimEnd('/').replaceFirst(Regex("^http", RegexOption.IGNORE_CASE), "ws") + "/api/ws?token=" + URLEncoder.encode(token, "UTF-8")
        if (wanted && u == url && ws != null) return
        stop()
        url = u
        wanted = true
        retry = 2_000L
        open()
    }

    fun stop() {
        wanted = false
        handler.removeCallbacksAndMessages(null)
        ws?.close(1000, null)
        ws = null
    }

    private fun open() {
        val u = url ?: return
        val req = runCatching { Request.Builder().url(u).build() }.getOrNull() ?: return
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { retry = 2_000L }
            override fun onMessage(webSocket: WebSocket, text: String) {
                val o = runCatching { JSONObject(text) }.getOrNull() ?: return
                val type = o.optString("type", "")
                if (type.isNotBlank()) handler.post { onMessage(type, o) }
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { again(webSocket) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { again(webSocket) }
        })
    }

    private fun again(s: WebSocket) {
        handler.post {
            if (ws === s) ws = null
            if (!wanted) return@post
            val wait = retry
            retry = (retry * 2).coerceAtMost(60_000L)
            handler.postDelayed({ if (wanted && ws == null) open() }, wait)
        }
    }
}
