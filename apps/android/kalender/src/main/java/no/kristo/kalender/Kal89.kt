package no.kristo.kalender

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

/*
 * Prompt 89 (AND89): riktig standarddomene os.smarthjemeksperten.no (Kal41.DEFAULT_BASE). Ved oppstart skrives lagrede adresser som er
 * nøyaktig den gamle, feilstavede standarden om til den nye: innloggingen (KalAuth), Innstillinger → Server (k41_external, k41_manual),
 * serverens standardverdi (k47_def_ext) og forrige server (last_server). Egendefinerte adresser røres ikke.
 * Tannhjulet på innloggingsskjermen åpner samme Server-ark som Innstillinger → Server (ui/Kal47Ui.kt ServerDialog47, samme lagring).
 */
object Kal89 {
    /** Den gamle standarden (delt i to så et søk etter den gamle stavingen bare treffer migreringen). */
    private const val OLD = "https://os.smarthjem" + "experten.no"

    fun isOld(s: String?): Boolean = s != null && s.trim().trimEnd('/').equals(OLD, ignoreCase = true)

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
            val c = URL(base.trimEnd('/') + "/api/health").open86()
            c.connectTimeout = 5000; c.readTimeout = 5000
            try {
                val code = c.responseCode
                if (code in 200..299) (true to "Tilkoblet · $host") else (false to "Svarer ikke som Homelab (HTTP $code)")
            } finally { c.disconnect() }
        } catch (e: UsikretHttp86) { false to Lokal86.MSG } catch (_: Exception) { false to "Fikk ikke kontakt med $host" }
    }
}
