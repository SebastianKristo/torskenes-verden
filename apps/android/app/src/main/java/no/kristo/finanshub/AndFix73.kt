package no.kristo.finanshub

import android.util.Log
import kotlinx.coroutines.CancellationException

/*
 * Prompt 73 (ANDFIX73) – claude-code-android-coroutine-melding.md: «StandaloneCoroutine was cancelled» skal aldri vises.
 *  - Avbrudd er ikke en feil: CancellationException kastes videre (catch (e: CancellationException) { throw e } foran
 *    catch (e: Exception) i coroutines), og AppViewModel.launch gjør det samme.
 *  - Ingen rå exception-tekst i UI: uiErr73(e, "Norsk reserve") gir serverens melding (ApiException) eller en kort norsk
 *    tekst, og detaljene logges med Log.w. vm.message går gjennom cleanErr73, som dropper avbrudd og bytter ut rå tekst.
 */

private const val TAG73 = "Feil73"

/** Generell reserve når feilen ikke har en brukbar norsk tekst. */
internal const val ERR_GENERIC73 = "Noe gikk galt. Prøv igjen."

/** Avbrutt jobb/coroutine (også pakket inn som årsak). */
internal fun isCancel73(t: Throwable?): Boolean {
    var c = t
    var n = 0
    while (c != null && n < 6) {
        if (c is CancellationException) return true
        c = c.cause; n++
    }
    return false
}

private val CANCEL_TEXT73 = Regex("""(?i)(standalonecoroutine|job was cancel|was cancelled|coroutine scope left the composition|cancellationexception)""")

/** Teknisk tekst som ikke skal vises (klassenavn, engelske nettverks-/JSON-feil, stakkspor). */
private val RAW73 = Regex(
    """(\b[a-z]+(\.[a-z0-9_]+)+\.[A-Z]\w*\b)|(\b\w*(Exception|Error)\b)|Unable to resolve host|[Ff]ailed to connect|timed out|Connection (reset|refused|closed)|""" +
        """Broken pipe|No value for|cannot be cast|out of bounds|Unterminated|End of input|Expected BEGIN_|Software caused connection abort|""" +
        """Chain validation failed|Trust anchor|CLEARTEXT communication|Read error|Write error|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH""",
)

internal fun isCancelText73(s: String?): Boolean = s != null && CANCEL_TEXT73.containsMatchIn(s)

internal fun isRawErr73(s: String?): Boolean = s != null && RAW73.containsMatchIn(s)

/**
 * Tekst til brukeren for en feil: serverens/appens egen norske melding, ellers [fallback]. Avbrudd gir [fallback] også,
 * men kalleren skal ha kastet CancellationException videre før dette (og vm.message dropper avbrudd uansett).
 */
internal fun uiErr73(e: Throwable, fallback: String = ERR_GENERIC73): String {
    if (!isCancel73(e)) Log.w(TAG73, fallback, e)
    val m = e.message?.trim()
    if (m.isNullOrEmpty() || isCancel73(e) || isCancelText73(m) || isRawErr73(m)) return fallback
    return m
}

/**
 * Filter for meldingsfelt i UI (vm.message): null ved avbrudd, og rå exception-tekst byttes ut.
 * «Kunne ikke lagre: java.io.IOException …» blir «Kunne ikke lagre.», ren teknisk tekst blir [ERR_GENERIC73].
 */
internal fun cleanErr73(s: String?): String? {
    if (s == null) return null
    if (isCancelText73(s)) { Log.w(TAG73, "Skjult avbrudd: $s"); return null }
    if (!isRawErr73(s)) return s
    Log.w(TAG73, "Skjult teknisk feiltekst: $s")
    val head = s.substringBefore(':', "").trim()
    return if (head.isNotEmpty() && !isRawErr73(head)) "$head." else ERR_GENERIC73
}
