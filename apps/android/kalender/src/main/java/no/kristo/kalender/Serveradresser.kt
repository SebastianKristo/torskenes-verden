package no.kristo.kalender

import no.kristo.felles.nett.LokaltNett
import no.kristo.felles.nett.ServerAdresse
import no.kristo.felles.nett.UsikretHttp
import no.kristo.felles.nett.openSikker

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL

/* Serveradressene i Kalender: adressen appen er logget inn med (Kal46Srv), Innstillinger → Server (Kal47Srv) og
 * omskrivingen av den gamle standardadressen ved oppstart (Kal89). */

/*
 * Prompt 46 (KAL46): serveradressen appen er logget inn med (oppdatering, interne Docker-adresser).
 * Spesifikasjon: claude-code-mac-oppdatering-intern-ip.md (gjelder også Android-APK-en).
 *  - Sjekken går mot adressen appen er logget inn med (Innstillinger → Server), 15 s per forsøk, og domenet står i teksten.
 *  - Manifest-URL-er: relative løses mot serveradressen, og en intern IP (172.16/12, 10/8, 127/8) byttes ut med serveradressen
 *    (APK-en sjekkes uansett mot SHA-256 og signeringssertifikatet).
 */
object Kal46Srv {
    const val TIMEOUT = 15_000

    private fun ipv4(h: String): List<Int>? {
        val p = h.split('.')
        if (p.size != 4) return null
        val out = p.map { it.toIntOrNull() ?: return null }
        return if (out.all { it in 0..255 }) out else null
    }

    /** Docker-nett, loopback og link-local: kan aldri nås fra telefonen. */
    fun isContainerIp(host: String): Boolean {
        val h = host.lowercase()
        if (h == "localhost") return true
        val ip = ipv4(h) ?: return false
        return ip[0] == 127 || (ip[0] == 172 && ip[1] in 16..31) || (ip[0] == 169 && ip[1] == 254)
    }

    fun isInternalIp(host: String): Boolean = isContainerIp(host) || ipv4(host.lowercase())?.let { it[0] == 10 } == true

    fun host(base: String): String {
        val b = if (base.startsWith("http")) base else "https://$base"
        return runCatching { Uri.parse(b).host }.getOrNull() ?: ""
    }

    /** «home.kristo.no» – aldri en intern IP i teksten. */
    fun display(base: String): String {
        val h = host(base)
        return when {
            h.isBlank() -> "serveren"
            else -> h
        }
    }

    /** Relativ → mot serveradressen. Absolutt med intern IP som ikke er serverens egen vert → samme sti mot serveradressen. */
    fun resolve(raw: String, base: String): String {
        val b = base.trimEnd('/')
        val v = raw.trim()
        if (v.isEmpty()) return v
        if (!v.lowercase().startsWith("http")) return b + (if (v.startsWith("/")) v else "/$v")
        val u = runCatching { Uri.parse(v) }.getOrNull() ?: return v
        val h = u.host ?: return v
        if (h == host(b) || !isInternalIp(h)) return v
        val path = (u.encodedPath ?: "") + (u.encodedQuery?.let { "?$it" } ?: "")
        return b + path
    }

    fun details(url: String, status: Int, err: String): String =
        "URL: $url\nFeilkode: " + (if (status == 0) "ingen svar (tidsavbrudd eller ingen forbindelse)" else status.toString()) + (if (err.isNotBlank()) "\n$err" else "")
}

/*
 * Prompt 47: Innstillinger → Server (claude-code-standard-serveradresser.md).
 * Standard: ekstern https://os.smarthjemeksperten.no (Kal41.DEFAULT_BASE). Lokal adresse har ingen fast standard (C-S4/D-B5). Serveren
 * sender sine via PUBLIC_URL/LOCAL_URL («defaults» i GET /api/me/server). Lagres på enheten (k41_external / k41_local, som Kal41 leser)
 * og synkes til kontoen med PUT /api/me/server {external, local, device}; 404/405 (eldre server) → bare på denne enheten.
 * Klartekst-HTTP er bare tillatt på lokalt nett (prompt 86: LokaltNett.kt håndhever, res/xml/network_security_config.xml tillater).
 */
object Kal47Srv {
    fun stdExternal(ctx: Context): String = Kal41.plain(ctx).getString("k47_def_ext", "")?.takeIf { it.startsWith("http") } ?: Kal41.DEFAULT_BASE
    fun stdLocal(ctx: Context): String = Kal41.plain(ctx).getString("k47_def_loc", "")?.takeIf { it.startsWith("http") } ?: ""

    fun localOnly(ctx: Context): Boolean = Kal41.plain(ctx).getBoolean("k47_local_only", false)
    private fun setLocalOnly(ctx: Context, v: Boolean) { Kal41.plain(ctx).edit().putBoolean("k47_local_only", v).apply() }

    /** Serverens standardverdier fra GET /api/me/server. */
    fun noteServer(ctx: Context, o: JSONObject) {
        val d = o.optJSONObject("defaults") ?: return
        val e = d.optString("external").trimEnd('/')
        val l = d.optString("local").trimEnd('/')
        val ed = Kal41.plain(ctx).edit()
        if (e.startsWith("http")) ed.putString("k47_def_ext", e)
        if (l.startsWith("http")) ed.putString("k47_def_loc", l)
        ed.apply()
    }

    /** «https://…»/«http://…» uten sti, ellers null. Uten skjema: lokal IP → http, ellers https. */
    fun normalize(raw: String): String? {
        val s = KalApi.normalizeServer(raw)
        if (!(s.startsWith("http://") || s.startsWith("https://"))) return null
        return s.takeIf { it.substringAfter("://").isNotBlank() }
    }

    /** Svartid i ms, eller null når adressen ikke svarer innen fristen. */
    suspend fun ping(base: String, timeoutMs: Int): Long? {
        val t0 = System.currentTimeMillis()
        if (!Kal41.reachable(base, timeoutMs)) return null
        return (System.currentTimeMillis() - t0).coerceAtLeast(1)
    }

    private fun store(ctx: Context, external: String, local: String) {
        Kal41.plain(ctx).edit().putString("k41_external", external).putString("k41_local", local).apply()
    }

    /** Lagrer på enheten og på kontoen. Returnerer meldingen til brukeren. */
    suspend fun save(ctx: Context, external: String, local: String): String = withContext(Dispatchers.IO) {
        store(ctx, external, local)
        val s = KalAuth.session(ctx) ?: return@withContext "Lagret på denne enheten"
        val body = JSONObject().put("external", external).put("local", local).put("device", "Kalender (Android · ${KalApi.device})")
        try {
            runCatching { noteServer(ctx, JSONObject(s.api.request("PUT", "/api/me/server", body))) }
            setLocalOnly(ctx, false)
            "Lagret · synkes til dine andre enheter"
        } catch (e: KalApiException) {
            when (e.status) {
                404, 405 -> { setLocalOnly(ctx, true); "Lagret på denne enheten (serveren støtter ikke synk ennå)" }
                400 -> e.message ?: "Ugyldig adresse"
                else -> "Lagret på denne enheten · fikk ikke synket"
            }
        }
    }

    /** «Tilbakestill til standard» ({reset:true} på kontoen). Returnerer (melding, ekstern, lokal). */
    suspend fun reset(ctx: Context): Triple<String, String, String> = withContext(Dispatchers.IO) {
        var e = stdExternal(ctx); var l = stdLocal(ctx)
        store(ctx, e, l); setLocalOnly(ctx, false)
        val s = KalAuth.session(ctx) ?: return@withContext Triple("Tilbakestilt til standard", e, l)
        try {
            val o = JSONObject(s.api.request("PUT", "/api/me/server", JSONObject().put("reset", true).put("device", "Kalender (Android · ${KalApi.device})")))
            noteServer(ctx, o)
            o.optString("external").trimEnd('/').takeIf { it.startsWith("http") }?.let { e = it }
            o.optString("local").trimEnd('/').takeIf { it.startsWith("http") }?.let { l = it }
            store(ctx, e, l)
            Triple("Tilbakestilt til standard", e, l)
        } catch (x: Exception) {
            Triple("Tilbakestilt på denne enheten", e, l)
        }
    }

    /** «Svarer · 34 ms» / «Svarer ikke» / «Tester …». ms: null = ikke testet, -1 = tester, 0 = svarer ikke. */
    fun status(ms: Long?): String = when {
        ms == null -> "Ikke testet"
        ms < 0 -> "Tester …"
        ms == 0L -> "Svarer ikke"
        else -> "Svarer · $ms ms"
    }
}

/*
 * Prompt 89 (AND89): riktig standarddomene os.smarthjemeksperten.no (Kal41.DEFAULT_BASE). Ved oppstart skrives lagrede adresser som er
 * nøyaktig den gamle, feilstavede standarden om til den nye: innloggingen (KalAuth), Innstillinger → Server (k41_external, k41_manual),
 * serverens standardverdi (k47_def_ext) og forrige server (last_server). Egendefinerte adresser røres ikke.
 * Tannhjulet på innloggingsskjermen åpner samme Server-ark som Innstillinger → Server (ui/Serverdialog.kt ServerDialog47, samme lagring).
 */
object Kal89 {
    /** Nøyaktig den gamle, feilstavede standarden (:felles, ServerAdresse). */
    fun isOld(s: String?): Boolean = ServerAdresse.erGammelStandard(s)

    fun migrate(ctx: Context) {
        runCatching {
            val p = Kal41.plain(ctx)
            val ed = p.edit()
            var changed = false
            for (k in listOf("k41_external", "k41_manual", "k47_def_ext", "last_server")) {
                if (isOld(p.getString(k, null))) { ed.putString(k, Kal41.DEFAULT_BASE); changed = true }
            }
            if (changed) ed.apply()
        }
        runCatching { KalAuth.session(ctx)?.let { s -> if (isOld(s.server)) KalAuth.save(ctx, s.copy(server = Kal41.DEFAULT_BASE)) } }
    }

    /** «Server: os.smarthjemeksperten.no» under innloggingsknappen. */
    fun hostLabel(url: String?): String =
        url?.trim().orEmpty().ifBlank { Kal41.DEFAULT_BASE }.substringAfter("://").substringBefore('/').ifBlank { Kal41.DEFAULT_BASE.substringAfter("://") }

    /** «Test tilkobling» i tannhjul-arket: GET /api/health → (true, «Tilkoblet») eller (false, feilmelding). */
    suspend fun health(base: String?): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        if (base == null) return@withContext false to "Adressen må starte med http:// eller https://"
        val host = base.substringAfter("://").substringBefore('/')
        try {
            val c = URL(base.trimEnd('/') + "/api/health").openSikker()
            c.connectTimeout = 5000; c.readTimeout = 5000
            try {
                val code = c.responseCode
                if (code in 200..299) (true to "Tilkoblet · $host") else (false to "Svarer ikke som Homelab (HTTP $code)")
            } finally { c.disconnect() }
        } catch (e: UsikretHttp) { false to LokaltNett.MSG } catch (_: Exception) { false to "Fikk ikke kontakt med $host" }
    }
}
