package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import org.json.JSONObject

/* ---------------- Innstillinger → Varsler: AI-svar i bakgrunnen ---------------- */

private fun AppViewModel.aiBgKey31() = "ai_bg_notify31_" + (account?.id ?: "")

fun AppViewModel.loadAiBg31() {
    val s = p31
    val key = aiBgKey31()
    if (s.aiBgFor == key) return
    s.aiBgFor = key
    s.aiBg = prefs.bool(key, true)
    Notify31.setAiBg(appCtx29, s.aiBg)
    launch31 {
        val raw = runCatching { api31 { hlGet("/me/notify") } }.getOrNull() ?: return@launch31
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch31
        val x = o.optJSONObject("prefs") ?: o
        if (x.has("ai_bg_notify")) { s.aiBg = x.optBoolean("ai_bg_notify", true); prefs.set(key, s.aiBg); Notify31.setAiBg(appCtx29, s.aiBg) }
    }
}

fun AppViewModel.setAiBg31(on: Boolean) {
    p31.aiBg = on
    prefs.set(aiBgKey31(), on)
    Notify31.setAiBg(appCtx29, on)
    Haptics.select()
    launch31 { runCatching { api31 { hlPut("/me/notify", notifyPrefs.toJson().put("ai_bg_notify", on)) } } }
}

/* ======================= Varsellyd ======================= */

private fun AppViewModel.nsp39() = appCtx39.getSharedPreferences("notify_prefs", android.content.Context.MODE_PRIVATE)

/**
 * Serverens svar → det appen bruker: egen lokal lyd (når serveren ikke godtok «draape»), og de myke standardverdiene
 * så lenge brukeren ikke har valgt lyd/volum selv på denne telefonen.
 */
internal fun AppViewModel.fixNotify39(n: NotifyPrefs): NotifyPrefs {
    val sp = nsp39()
    var x = n
    sp.getString("snd39_local", null)?.takeIf { k -> NOTIFY_SOUNDS.any { it.first == k } }?.let { x = x.copy(sound = it) }
    if (!sp.getBoolean("snd39_picked", false) && x.sound == "klokke") x = x.copy(sound = Sound39.DEFAULT)
    if (!sp.getBoolean("vol39_picked", false) && (x.volume == 70 || x.volume == 80)) x = x.copy(volume = Sound39.DEFAULT_VOLUME)
    return x
}

/** Lagrer valget på serveren. Godtas ikke lyden (eldre server uten «draape»), sendes resten og lyden huskes lokalt. */
internal fun AppViewModel.putNotify39(old: NotifyPrefs, n: NotifyPrefs) {
    val sp = nsp39()
    val e = sp.edit()
    if (old.sound != n.sound) e.putBoolean("snd39_picked", true)
    if (old.volume != n.volume) e.putBoolean("vol39_picked", true)
    e.apply()
    launch39 {
        val ok = runCatching { api39 { hlPut("/me/notify", n.toJson()) } }.isSuccess
        if (ok) { sp.edit().remove("snd39_local").apply(); return@launch39 }
        val j = n.toJson().apply { remove("sound") }
        if (runCatching { api39 { hlPut("/me/notify", j) } }.isSuccess) sp.edit().putString("snd39_local", n.sound).apply()
    }
}

/* ======================= Glimt-varsel: vis svaret i appen også ======================= */

private fun AppViewModel.aiInKey39() = "n_ai_in39_" + (account?.id ?: "")

fun AppViewModel.loadAiIn39() {
    val s = p39
    val key = aiInKey39()
    if (s.aiInFor == key) return
    s.aiInFor = key
    s.aiIn = prefs.bool(key, true)
    launch39 {
        val raw = runCatching { api39 { hlGet("/me/notify") } }.getOrNull() ?: return@launch39
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch39
        val x = o.optJSONObject("prefs") ?: o
        if (x.has("n_ai_in")) { s.aiIn = x.optBoolean("n_ai_in", true); prefs.set(key, s.aiIn) }
    }
}

fun AppViewModel.setAiIn39(on: Boolean) {
    p39.aiIn = on
    prefs.set(aiInKey39(), on)
    Haptics.select()
    launch39 { runCatching { api39 { hlPut("/me/notify", notifyPrefs.toJson().put("ai_bg_notify", p31.aiBg).put("n_ai_in", on)) } } }
}

/* ---------- Varsler (/api/me/notify) ---------- */

data class NotifyPrefs(
    val on: Boolean = true, val quietFrom: String = "22:00", val quietTo: String = "07:00", val quiet: Boolean = true,
    val sound: String = "draape", val volume: Int = 50, val groups: Map<String, Boolean> = NOTIFY_GROUPS.associate { it.first to true },
    val customSound: Boolean = false,
) {
    fun toJson(): JSONObject = JSONObject().put("on", on).put("quietOn", quiet).put("quietFrom", quietFrom).put("quietTo", quietTo)
        .put("sound", sound).put("volume", volume).put("groups", JSONObject().apply { groups.forEach { (k, v) -> put(k, v) } })
}

/** Gruppene i Innstillinger → Varsler. */
val NOTIFY_GROUPS = listOf(
    "pakker" to "Pakker", "finans" to "Finans og hjem", "familie" to "Familie", "reise" to "Reise og vær", "haptikk" to "Haptikk",
)

/** Varsellydene: seks innebygde (prompt 39: «Dråpe (myk)» er standard, res/raw/glimt_draape.ogg og varsel_<id>.wav), egen lyd og stille. */
val NOTIFY_SOUNDS = listOf(
    "draape" to "Dråpe (myk)", "klokke" to "Klokke", "pling" to "Pling", "papir" to "Papir", "dobbel" to "Dobbel", "dyp" to "Dyp", "egen" to "Egen lyd", "stille" to "Stille",
)

fun parseNotifyPrefs(s: String): NotifyPrefs {
    val o = JSONObject(s).let { it.optJSONObject("notify") ?: it }
    val g = o.optJSONObject("groups")
    return NotifyPrefs(
        on = o.optBoolean("on", true),
        quietFrom = o.optStr("quietFrom") ?: "22:00", quietTo = o.optStr("quietTo") ?: "07:00", quiet = o.optBoolean("quietOn", true),
        sound = o.optStr("sound")?.takeIf { k -> NOTIFY_SOUNDS.any { it.first == k } } ?: "draape",
        volume = o.optInt("volume", 50).coerceIn(0, 100),
        groups = NOTIFY_GROUPS.associate { (k, _) -> k to (g?.optBoolean(k, true) ?: true) },
        customSound = o.optBoolean("customSound", false) || o.optStr("customSoundUrl") != null,
    )
}
