package no.kristo.finanshub

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.security.SecureRandom

/**
 * Prompt 86 (AND86): lenker som utfører handlinger (finanshub://hjemlys/start|home|ok, …/familie/sjekk?id=…&act=…,
 * …/act51/add, …/kart/<sone>?live=1) kan startes av en nettside eller en annen app (BROWSABLE). Derfor skilles det mellom:
 *
 *  - appens egne varsler, widgeter og dynamiske snarveier: intentet bærer [EXTRA] med en tilfeldig nøkkel som bare ligger
 *    i appens private lagring ([intern86]). Ingen utenfor appen kan sette den. Handlingen utføres som før.
 *  - alt annet (ACTION_VIEW uten nøkkelen): [linkAsk86] avgjør om lenken endrer noe. Da vises «Vil du … ?» med
 *    Avbryt / Utfør (ui/Link86Ui.kt) før noe skjer. Lenker som bare åpner en side, åpnes som før.
 */
object Link86 {
    const val EXTRA = "no.kristo.finanshub.INTERN86"
    private const val SP = "link86"
    @Volatile private var cached: String? = null

    /** Nøkkelen lages første gang (SecureRandom, 192 bit) og forlater aldri appen. */
    fun key(ctx: Context): String = cached ?: synchronized(this) {
        cached ?: run {
            val sp = ctx.applicationContext.getSharedPreferences(SP, Context.MODE_PRIVATE)
            val k = sp.getString("k", null)?.takeIf { it.length >= 32 }
                ?: ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }.also { sp.edit().putString("k", it).commit() }
            cached = k
            k
        }
    }

    /** true når intentet kommer fra appens egne varsler/widgeter/snarveier (bærer nøkkelen). */
    fun internal(ctx: Context, intent: Intent?): Boolean =
        runCatching { intent?.getStringExtra(EXTRA)?.let { it == key(ctx) } == true }.getOrDefault(false)

    /** Spørsmålet for en lenke utenfra, eller null når den bare åpner en side. */
    fun ask(uri: Uri): Ask86? = runCatching {
        if (uri.scheme != "finanshub") return null
        val host = uri.host ?: return null
        val path = uri.path?.trim('/').orEmpty()
        val q = HashMap<String, String?>()
        for (k in listOf("id", "act", "live", "zone")) q[k] = uri.getQueryParameter(k)
        val varer = if (host != "act51") emptyList() else when (path) {
            "add" -> listOf(uri.getQueryParameter("item")?.takeIf { it.isNotBlank() } ?: Shortcuts51.DEFAULT_ITEM)
            "q" -> Shortcuts51.itemsOf(uri.getQueryParameter("q").orEmpty())
            else -> emptyList()
        }
        linkAsk86(host, path, q, varer)
    }.getOrNull()
}

/** Merker et intent som appens eget (varsler, widgeter, dynamiske snarveier) – se [Link86]. */
fun Intent.intern86(ctx: Context): Intent = putExtra(Link86.EXTRA, Link86.key(ctx))
