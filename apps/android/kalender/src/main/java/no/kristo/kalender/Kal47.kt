package no.kristo.kalender

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/*
 * Prompt 47: Innstillinger → Server (claude-code-standard-serveradresser.md).
 * Standard: ekstern https://os.smarthjemexperten.no, lokal http://10.69.1.39:3000 (Kal41.DEFAULT_BASE / DEFAULT_LOCAL). Serveren kan
 * overstyre via PUBLIC_URL/LOCAL_URL («defaults» i GET /api/me/server). Lagres på enheten (k41_external / k41_local, som Kal41 leser)
 * og synkes til kontoen med PUT /api/me/server {external, local, device}; 404/405 (eldre server) → bare på denne enheten.
 * Klartekst-HTTP er bare tillatt til 10.69.1.39 (res/xml/network_security_config.xml).
 */
object Kal47Srv {
    fun stdExternal(ctx: Context): String = Kal41.plain(ctx).getString("k47_def_ext", "")?.takeIf { it.startsWith("http") } ?: Kal41.DEFAULT_BASE
    fun stdLocal(ctx: Context): String = Kal41.plain(ctx).getString("k47_def_loc", "")?.takeIf { it.startsWith("http") } ?: Kal41.DEFAULT_LOCAL

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
