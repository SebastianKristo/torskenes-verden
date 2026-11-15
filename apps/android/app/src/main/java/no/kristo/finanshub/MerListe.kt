package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/** Mer: rekkefølge (o) og skjulte (h). Nøkler som ikke står i o legges sist i standardrekkefølge. */
data class MerPref28(val o: List<String> = emptyList(), val h: List<String> = emptyList())

class B28State {
    /* Mer */
    var mer by mutableStateOf(MerPref28())
    var merEdit by mutableStateOf(false)
    internal var merFor: String? = null

    /* Abonnement: «Legg til abonnement»-arket og skjermbilde */
    /** «menu», «form» (Skriv inn selv) eller «tx» (Fra transaksjon). */
    var addStep by mutableStateOf("menu")
    var shotErr by mutableStateOf<ShotErr28?>(null)
    /** Når lesingen startet (ms), for «Laster bildemodellen …» etter 5 s. */
    var shotStart by mutableStateOf(0L)
    var shotEngine by mutableStateOf("ollama")
    internal var shotJpeg: ByteArray? = null
    /** Installering av qwen2.5vl: tekst og andel (0–1, null = ukjent). */
    var installing by mutableStateOf(false)
    var installText by mutableStateOf<String?>(null)
    var installPct by mutableStateOf<Float?>(null)

    /* Hjem: «Legg til widget» */
    var addWidgetFor by mutableStateOf<String?>(null)
    /** Kortene per side (nøkkel → navn), registrert når siden tegnes i redigeringsmodus. */
    internal val pageSecs = HashMap<String, List<Pair<String, String>>>()
}

/* ---------- Mer ---------- */

private fun merKey28(vm: AppViewModel) = "mer28_" + (vm.account?.id ?: "")

/** Gamle/alternative navn fra andre klienter. */
private fun merAlias28(k: String) = when (k) { "abonnementer", "subscriptions", "sub" -> "abo"; "innstillinger" -> "innst"; else -> k }

private fun parseMer28(raw: String): MerPref28? = runCatching {
    val o0 = JSONObject(raw)
    val o = o0.optJSONObject("mer") ?: o0.optJSONObject("merOrder") ?: o0
    if (!o.has("o") && !o.has("h")) return@runCatching null
    MerPref28(o.optJSONArray("o").strings().map(::merAlias28).filter { it.isNotBlank() }.distinct(), o.optJSONArray("h").strings().map(::merAlias28).filter { it.isNotBlank() && it != "innst" }.distinct())
}.getOrNull()

private fun MerPref28.json() = JSONObject().put("o", JSONArray(o)).put("h", JSONArray(h))

/** Lokal reserve først, så serveren (følger brukeren mellom enheter). */
fun AppViewModel.loadMer28() {
    val s = b28
    val key = merKey28(this)
    if (s.merFor == key) return
    s.merFor = key
    s.mer = parseMer28(prefs.str(key, "")) ?: MerPref28()
    launch28b {
        val raw = runCatching { api28b { hlGet("/prefs/mer") } }.getOrNull() ?: return@launch28b
        val srv = parseMer28(raw) ?: return@launch28b
        if (s.merFor != key) return@launch28b
        // Aldri lagret på serveren (updated = null), men lokalt: send det lokale opp i stedet for å tømme det.
        val never = runCatching { JSONObject(raw).isNull("updated") }.getOrDefault(false)
        if (never && srv.o.isEmpty() && srv.h.isEmpty() && (s.mer.o.isNotEmpty() || s.mer.h.isNotEmpty())) { saveMer28(s.mer); return@launch28b }
        s.mer = srv; prefs.set(key, srv.json().toString())
    }
}

fun AppViewModel.saveMer28(v: MerPref28) {
    val nv = v.copy(o = v.o.distinct(), h = v.h.filter { it != "innst" }.distinct())
    b28.mer = nv
    prefs.set(merKey28(this), nv.json().toString())
    launch28b { runCatching { api28b { hlPut("/prefs/mer", nv.json()) } } }
}

/** Radene sortert etter lagret rekkefølge; nye nøkler sist i standardrekkefølgen. */
fun <T> merSort28(pref: MerPref28, rows: List<T>, key: (T) -> String): List<T> {
    val idx = rows.mapIndexed { i, r -> key(r) to i }.toMap()
    return rows.sortedBy { r -> val i = pref.o.indexOf(key(r)); if (i < 0) 999 + (idx[key(r)] ?: 0) else i }
}
