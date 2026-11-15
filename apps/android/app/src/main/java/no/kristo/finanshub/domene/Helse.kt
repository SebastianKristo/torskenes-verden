@file:JvmName("DomeneHelse")

package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject

/*
 * Helse: kode som lå i blandingsfilene (P42.kt) og ble flyttet hit uendret i Fase 5.
 * Navnene er de samme. Fila eies av MODULER-Android.
 */

/** En enhet fra Home Assistant-mobilappen (HA Companion). */
data class HaSensor42(val key: String, val entity: String, val label: String, val on: Boolean)

data class HaDevice42(
    val id: String, val name: String, val model: String?, val platform: String, val entities: Int,
    val sensors: List<HaSensor42>, val personId: String?, val updatedAt: String?, val unavailableSince: String?,
)

data class HaPerson42(val id: String, val name: String)

/** Sensorene som er forhåndsvalgt (claude-code-helse-fra-home-assistant.md). */
val HA_DEFAULT42 = setOf("steps", "heart_rate", "resting_heart_rate", "sleep_duration", "active_calories_burned", "activity")

private val HA_LABELS42 = mapOf(
    "steps" to "Skritt", "heart_rate" to "Puls", "resting_heart_rate" to "Hvilepuls", "sleep_duration" to "Søvn",
    "active_calories_burned" to "Aktive kalorier", "total_calories_burned" to "Kalorier totalt", "distance" to "Distanse",
    "floors_climbed" to "Etasjer", "floors_ascended" to "Etasjer opp", "floors_descended" to "Etasjer ned", "weight" to "Vekt",
    "body_fat" to "Fettprosent", "oxygen_saturation" to "Oksygenmetning", "respiratory_rate" to "Pustefrekvens", "blood_glucose" to "Blodsukker",
    "vo2_max" to "VO₂ maks", "average_active_pace" to "Snittempo", "activity" to "Aktivitet",
)

fun haLabel42(key: String): String = HA_LABELS42[key] ?: key.replace('_', ' ').replaceFirstChar { it.uppercase() }

/* ======================= Helse fra Home Assistant ======================= */

private fun parseHa42(raw: String): Pair<List<HaDevice42>, List<HaPerson42>> {
    val o = JSONObject(raw)
    val devs = (o.optJSONArray("devices") ?: JSONArray()).let { a ->
        (0 until a.length()).mapNotNull { i ->
            val d = a.optJSONObject(i) ?: return@mapNotNull null
            val id = d.optStr("id") ?: d.optStr("deviceId") ?: return@mapNotNull null
            val chosen = d.optJSONArray("enabled")?.let { e -> (0 until e.length()).map { e.optString(it) }.toSet() }
            val sensors = (d.optJSONArray("sensors") ?: JSONArray()).let { sa ->
                (0 until sa.length()).mapNotNull { k ->
                    val x = sa.opt(k)
                    val so = x as? JSONObject
                    val key = so?.optStr("key") ?: so?.optStr("metric") ?: (x as? String) ?: return@mapNotNull null
                    val on = so?.takeIf { it.has("enabled") }?.optBoolean("enabled") ?: chosen?.contains(key) ?: (key in HA_DEFAULT42)
                    HaSensor42(key, so?.optStr("entity") ?: so?.optStr("entity_id") ?: "", so?.optStr("label") ?: haLabel42(key), on)
                }
            }
            HaDevice42(id, d.optStr("name") ?: "Enhet", d.optStr("model"), (d.optStr("platform") ?: d.optStr("os") ?: "").lowercase(),
                d.optInt("entities", d.optInt("entityCount", 0)), sensors, d.optStr("personId") ?: d.optStr("userId"),
                d.optStr("updatedAt") ?: d.optStr("lastSeen"), d.optStr("unavailableSince"))
        }
    }
    val people = (o.optJSONArray("people") ?: o.optJSONArray("members") ?: JSONArray()).let { a ->
        (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { p -> HaPerson42(p.optStr("id") ?: p.optStr("userId") ?: return@let null, p.optStr("name") ?: "") } }
    }
    return devs to people
}

/** Forslag fra navnet: «Rune iPhone 13» → Rune. */
fun haGuess42(d: HaDevice42, people: List<HaPerson42>): HaPerson42? {
    val n = d.name.lowercase()
    return people.firstOrNull { p -> p.name.split(' ').firstOrNull()?.lowercase()?.takeIf { it.length > 1 }?.let { n.startsWith(it) || n.contains("$it ") || n.contains("${it}s ") } == true }
}

fun AppViewModel.loadHa42(force: Boolean = false) {
    val s = p42
    if (s.haBusy || (!force && (s.haDevices != null || s.haMissing))) return
    s.haBusy = true
    launch42 {
        try {
            // Prompt 45 (claude-code-helse-ha-opprydding.md): bare enheter fra mobile_app; Telefoner (standard) eller Alle mobilapp.
            val raw = try { api42 { hlGet("/family/health/ha?view=" + p45.haView, timeout = 12_000) } } catch (e: ApiException) {
                if (e.status == 404) api42 { hlGet("/health/ha/devices", timeout = 12_000) } else throw e
            }
            val (d, p) = parseHa42(raw)
            runCatching { org.json.JSONObject(raw) }.getOrNull()?.let { o ->
                p45.haHidden = o.optJSONObject("hidden")?.optString("text")?.takeIf { it.isNotBlank() }
                p45.haStatus = o.optJSONObject("status")?.optString("text")?.takeIf { it.isNotBlank() }
            }
            s.haDevices = d
            s.haPeople = p.ifEmpty { family?.members?.map { HaPerson42(it.userId, it.name) } ?: emptyList() }
            s.haMissing = false; s.haError = null
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404) s.haMissing = true
            else s.haError = if (e.status == 401 || e.status == 403) "Koble til Home Assistant på nytt (Innstillinger → Integrasjoner)." else e.message
        } catch (e: Exception) {
            s.haError = uiErr73(e, "Fikk ikke kontakt med Home Assistant")
        } finally { s.haBusy = false }
    }
}

/** Lagrer koblingen enhet → person og valgte sensorer. Første synk (30 dager historikk) gjøres av serveren. */
fun AppViewModel.saveHa42(d: HaDevice42, personId: String?, sensors: Set<String>) {
    val s = p42
    val nd = d.copy(personId = personId, sensors = d.sensors.map { it.copy(on = it.key in sensors) })
    s.haDevices = s.haDevices?.map { if (it.id == d.id) nd else it }
    launch42 {
        try {
            api42 {
                request("PUT", "/family/health/ha/devices/" + URLEncoder.encode(d.id, "UTF-8"),
                    JSONObject().put("personId", personId ?: JSONObject.NULL).put("sensors", JSONArray(sensors.toList())), prefix = Api.HOMELAB)
            }
            flash(if (personId == null) "${d.name} er koblet fra" else "Lagret · første synk henter 30 dager")
        } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            message = if (e.status == 404) "Serveren har ikke helse fra Home Assistant ennå. Oppdater Homelab." else e.message
        } catch (e: Exception) { message = uiErr73(e, "Fikk ikke lagret") }
    }
}
