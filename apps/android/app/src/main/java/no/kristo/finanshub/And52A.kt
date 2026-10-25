package no.kristo.finanshub

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 52 (AND52A) – logikk uten UI:
 *  - decodeScaled52: bilder dekodes nedskalert (inSampleSize + endelig skalering), aldri i full størrelse (Familie-krasjet).
 *  - Think52: tankegangen i Chat (claude-code-chat-tankegang-bildeminiatyr.md). Kilder: SSE-hendelsen «thinking»/«think» ({text}),
 *    «step» ({text}) for Glimts egne steg, `thinking` på «delta», `<think>…</think>` i teksten (Open WebUI) og
 *    `reasoning_content` (OpenAI-format). Lagres på meldingen som think: string[] + thS (sekunder). Sendes aldri tilbake i konteksten.
 *  - Saldokort-utseende (papir_salsty), Finans → Mer-skjuling (papir_fmer_hid_vis / papir_mer_hid_vis) lagres per bruker i prefs.
 */

/** Dekoder med inSampleSize slik at lengste side blir maks maxPx (pluss endelig skalering). null hvis bildet ikke kan leses. */
internal fun decodeScaled52(data: ByteArray, maxPx: Int): Bitmap? {
    if (data.isEmpty()) return null
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, o)
    val big = maxOf(o.outWidth, o.outHeight)
    var sample = 1
    if (big > 0) while (big / (sample * 2) >= maxPx) sample *= 2
    val bmp = runCatching {
        BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })
    }.getOrNull() ?: (if (Build.VERSION.SDK_INT >= 28) runCatching {
        android.graphics.ImageDecoder.decodeBitmap(android.graphics.ImageDecoder.createSource(java.nio.ByteBuffer.wrap(data))) { dec, info, _ ->
            val b = maxOf(info.size.width, info.size.height)
            if (b > maxPx) { val k = maxPx.toFloat() / b; dec.setTargetSize((info.size.width * k).toInt().coerceAtLeast(1), (info.size.height * k).toInt().coerceAtLeast(1)) }
            dec.allocator = android.graphics.ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }.getOrNull() else null) ?: return null
    val m = maxOf(bmp.width, bmp.height)
    if (m <= maxPx) return bmp
    val k = maxPx.toFloat() / m
    return runCatching { Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true) }.getOrDefault(bmp)
}

/* ======================= Chat: tankegang ======================= */

object Think52 {
    /** Tankestegene som vises (én linje per avsnitt/setning). */
    var lines by mutableStateOf<List<String>>(emptyList())
    /** Når tenkingen startet og når svaret begynte å strømme (0 = ikke ennå). */
    var t0 by mutableLongStateOf(0L)
    var t1 by mutableLongStateOf(0L)
    /** Mens den tenker er listen åpen; brukeren kan lukke den. */
    var openLive by mutableStateOf(true)
    /** Åpne/lukkede piller på lagrede meldinger (nøkkel = chatId:indeks). */
    val open = mutableStateMapOf<String, Boolean>()
    /** Modellen sendte ekte tankegang (ellers vises Glimts egne steg). */
    var real by mutableStateOf(false)

    private val raw = StringBuilder()
    private val steps = ArrayList<String>()
    private var inTag = false

    fun reset() {
        raw.setLength(0); steps.clear(); inTag = false
        lines = emptyList(); t0 = System.currentTimeMillis(); t1 = 0L; openLive = true; real = false
    }

    /** Fri tankegangstekst (Ollama message.thinking, reasoning_content, innholdet i <think>). */
    fun addText(t: String?) {
        if (t.isNullOrEmpty()) return
        real = true
        raw.append(t)
        rebuild()
    }

    /** Ett ferdig steg (Glimts egne steg for modeller uten tenkning). */
    fun addStep(t: String?) {
        val s = t?.trim().orEmpty()
        if (s.isEmpty() || steps.lastOrNull() == s) return
        steps.add(s)
        rebuild()
    }

    /** Lagret/ferdig liste fra serveren (done.think). */
    fun setAll(a: List<String>) { if (a.isNotEmpty()) { raw.setLength(0); steps.clear(); steps.addAll(a); rebuild() } }

    private fun rebuild() { lines = steps + split52(raw.toString()) }

    /** Svarteksten uten <think>…</think>; innholdet i taggen går til tankegangen. */
    fun filter(delta: String): String {
        if (delta.isEmpty()) return delta
        val out = StringBuilder()
        var rest = delta
        while (rest.isNotEmpty()) {
            if (inTag) {
                val e = rest.indexOf("</think>")
                if (e < 0) { addText(rest); rest = "" } else { addText(rest.substring(0, e)); rest = rest.substring(e + 8); inTag = false }
            } else {
                val b = rest.indexOf("<think>")
                if (b < 0) { out.append(rest); rest = "" } else { out.append(rest.substring(0, b)); rest = rest.substring(b + 7); inTag = true }
            }
        }
        val o = out.toString()
        if (o.isNotBlank()) markAnswer()
        return o
    }

    /** Første svartekst: «Tenkte i 2,1 s», og listen lukkes. */
    fun markAnswer() { if (t1 == 0L && t0 > 0L) { t1 = System.currentTimeMillis(); openLive = false } }

    fun secs(now: Long = System.currentTimeMillis()): Double = if (t0 <= 0L) 0.0 else ((if (t1 > 0L) t1 else now) - t0) / 1000.0
}

/** Avsnitt, deretter setninger: én linje per steg. */
internal fun split52(t: String): List<String> =
    t.split(Regex("\\n\\s*\\n|\\r?\\n")).flatMap { p -> p.split(Regex("(?<=[.!?])\\s+(?=[A-ZÆØÅ0-9«])")) }.map { it.trim() }.filter { it.isNotEmpty() }

/** «2,1 s». */
internal fun secs52(s: Double): String = String.format(java.util.Locale.forLanguageTag("nb-NO"), "%.1f s", s.coerceAtLeast(0.0))

/** think/thS fra en lagret melding (toppnivå eller meta). */
internal fun parseThink52(o: JSONObject): Pair<List<String>, Double?> {
    val meta = o.optJSONObject("meta")
    val a: JSONArray? = o.optJSONArray("think") ?: meta?.optJSONArray("think")
    val list = (0 until (a?.length() ?: 0)).mapNotNull { i -> a?.optString(i)?.trim()?.takeIf { it.isNotEmpty() } }
    val s = (if (o.has("thS")) o.optDouble("thS") else meta?.optDouble("thS") ?: Double.NaN).takeIf { !it.isNaN() && it >= 0 }
    // Eldre lagring: <think> inne i innholdet.
    if (list.isEmpty()) {
        val c = o.optString("content", "")
        val m = Regex("<think>([\\s\\S]*?)</think>").find(c)
        if (m != null) return split52(m.groupValues[1]) to s
    }
    return list to s
}

/** Innhold uten <think>-blokk (eldre meldinger fra Open WebUI). */
internal fun stripThink52(c: String): String = if (!c.contains("<think>")) c else c.replace(Regex("<think>[\\s\\S]*?(</think>|$)"), "").trimStart()

/** Glimts egne steg når modellen ikke tenker selv (vises bare mens svaret lages, til serveren sender sine). */
internal fun localSteps52(hasAtt: Boolean, model: String?, useData: Boolean): List<String> = listOfNotNull(
    "Leser spørsmålet",
    if (hasAtt) "Ser på vedlegget" else null,
    if (useData) "Henter data fra Finans, Kalender og Gjøremål" else null,
    model?.let { "Velger modell: $it" },
    "Planlegger svaret",
)

/* ======================= Layoutvalg per bruker ======================= */

/** Saldokortet i Finans: std · glass · kvitt · farge (papir_salsty). */
internal val SALSTY52 = listOf("std" to "Standard", "glass" to "Glass", "kvitt" to "Kvittering", "farge" to "Fargebunn")

/* ======================= «Nytt i versjon» ======================= */

/** Fjerner interne merknader («prompt 51», «(p52)», «runde 3») fra titler og overskrifter. */
internal fun cleanTitle52(t: String?): String = (t ?: "")
    .replace(Regex("\\s*[(\\[]?\\b(prompt|p)\\s*\\d{1,3}[a-z]?\\b[)\\]]?\\s*[:·–-]?\\s*", RegexOption.IGNORE_CASE), " ")
    .replace(Regex("\\s*[(\\[]?\\brunde\\s*\\d\\b[)\\]]?", RegexOption.IGNORE_CASE), "")
    .replace(Regex("\\s{2,}"), " ").trim().trim('·', '–', '-', ':', ',').trim()

/**
 * Punktene: points/sections [{title|heading, text|body}] (SRV52), items som objekter, eller items som tekst
 * («Overskrift: tekst», «**Overskrift** – tekst»; ellers første setning som overskrift).
 */
internal fun whatsPoints52(o: JSONObject): List<Pair<String, String>> {
    val out = ArrayList<Pair<String, String>>()
    val arr = o.optJSONArray("points") ?: o.optJSONArray("sections") ?: o.optJSONArray("items") ?: return out
    for (i in 0 until arr.length()) {
        val j = arr.optJSONObject(i)
        if (j != null) {
            val h = cleanTitle52(j.optStr("title") ?: j.optStr("heading") ?: j.optStr("h"))
            val t = (j.optStr("text") ?: j.optStr("body") ?: j.optStr("t") ?: "").trim()
            if (h.isNotEmpty() || t.isNotEmpty()) out += (h.ifEmpty { t.take(60) }) to (if (h.isEmpty()) "" else t)
            continue
        }
        val raw = arr.optString(i).trim().removePrefix("-").removePrefix("•").trim()
        if (raw.isEmpty()) continue
        val bold = Regex("^\\*\\*(.+?)\\*\\*\\s*[:–—-]?\\s*(.*)$").find(raw)
        val colon = Regex("^([^:.]{3,60}):\\s+(.+)$").find(raw)
        val pair = when {
            bold != null -> bold.groupValues[1] to bold.groupValues[2]
            colon != null -> colon.groupValues[1] to colon.groupValues[2]
            else -> {
                val m = Regex("^(.{8,80}?[.!?])\\s+(.+)$").find(raw)
                if (m != null) m.groupValues[1].trimEnd('.') to m.groupValues[2] else raw to ""
            }
        }
        out += cleanTitle52(pair.first) to pair.second.replace("**", "").trim()
    }
    return out
}

/** «25. oktober 2026» fra ISO-dato (ellers teksten som den er, uten interne merknader). */
internal fun whatsDate52(d: String): String {
    val iso = Regex("(\\d{4})-(\\d{2})-(\\d{2})").find(d) ?: Regex("(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})").find(d)?.let { m ->
        return runCatching { java.time.LocalDate.of(m.groupValues[3].toInt(), m.groupValues[2].toInt(), m.groupValues[1].toInt())
            .format(java.time.format.DateTimeFormatter.ofPattern("d. MMMM yyyy", java.util.Locale.forLanguageTag("nb-NO"))) }.getOrDefault(cleanTitle52(d))
    } ?: return cleanTitle52(d.substringBefore("·"))
    return runCatching { java.time.LocalDate.of(iso.groupValues[1].toInt(), iso.groupValues[2].toInt(), iso.groupValues[3].toInt())
        .format(java.time.format.DateTimeFormatter.ofPattern("d. MMMM yyyy", java.util.Locale.forLanguageTag("nb-NO"))) }.getOrDefault(d)
}
