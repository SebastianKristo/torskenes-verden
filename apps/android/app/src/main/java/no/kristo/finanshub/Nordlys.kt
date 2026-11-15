package no.kristo.finanshub

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

/* ---------------- Nordlys OS ---------------- */

fun AppViewModel.openNordlys31() {
    p31.nordOpen = true
    Haptics.select()
    loadUpd30(force = true)
    loadUpdSettings30()
    loadNordlys31()
}

fun AppViewModel.closeNordlys31() { Haptics.back(); p31.nordOpen = false; p31.bioAsk = false } // prompt 34: haptikk på Tilbake

fun AppViewModel.loadNordlys31() {
    val s = p31
    s.bioOn = Nordlys31Keys.has(appCtx29, account?.id)
    launch31 {
        runCatching { JSONObject(api31 { hlGet("/system/version") }) }.getOrNull()?.let { o ->
            o.s31("name")?.let { s.osName = it }
            o.s31("tagline")?.let { s.tagline = it }
            s.sizeBytes = if (o.has("sizeBytes") && !o.isNull("sizeBytes")) o.optLong("sizeBytes") else null
            val l = o.optJSONObject("latest")
            s.sha = (l?.s31("sha") ?: o.s31("sha") ?: "").take(7)
            s.relDate = l?.s31("date") ?: l?.s31("publishedAt") ?: o.s31("date") ?: ""
        }
        runCatching { JSONObject(api31 { hlGet("/system/update/settings") }) }.getOrNull()?.let { o0 ->
            val o = o0.optJSONObject("settings") ?: o0
            s.reqPw = o.optBoolean("require_password", o.optBoolean("requirePassword", false))
            s.reqPwLoaded = true
        }
    }
}

/** «Se etter»: henter fra GitHub via serveren. */
fun AppViewModel.checkNordlys31() {
    val s = p31
    if (s.checking || p30.upd.phase == "run") return
    s.checking = true
    Haptics.select()
    launch31 {
        runCatching { api31 { request("POST", "/system/update/check", JSONObject(), prefix = Api.HOMELAB, read = 20_000) } }
        loadUpd30(force = true)
        delay(1100)
        loadNordlys31()
        s.checking = false
    }
}

/** Bryteren «Krev fingeravtrykk eller passord» (require_password, bare admin). */
fun AppViewModel.setReqPw31(on: Boolean) {
    val s = p31
    s.reqPw = on
    Haptics.select()
    launch31 {
        try { api31 { hlPut("/system/update/settings", JSONObject().put("require_password", on)) } }
        catch (e: ApiException) { s.reqPw = !on; flash(if (e.status == 404) "Kunne ikke lagre: serveren har ikke denne innstillingen ennå" else "Kunne ikke lagre: ${e.message}") }
    }
}

/** «Bruk fingeravtrykk»: passordet kontrolleres hos serveren (POST /api/auth/reauth) og lagres kryptert på enheten. */
fun AppViewModel.saveBioPw31(pw: String) {
    val s = p31
    if (pw.isBlank()) { s.bioErr = "Skriv inn passordet ditt"; return }
    s.bioBusy = true; s.bioErr = ""
    launch31 {
        try {
            api31 { request("POST", "/auth/reauth", JSONObject().put("password", pw), prefix = Api.HOMELAB) }
            Nordlys31Keys.save(appCtx29, account?.id, pw)
            s.bioOn = true; s.bioAsk = false
            Haptics.success()
        } catch (e: ApiException) {
            s.bioErr = if (e.status == 404) "Serveren støtter ikke dette ennå." else if (e.status == 401 || e.status == 403) "Feil passord" else (e.message ?: "Noe gikk galt")
            Haptics.error()
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { s.bioErr = uiErr73(e, "Fikk ikke kontakt med serveren") }
        finally { s.bioBusy = false }
    }
}

fun AppViewModel.clearBioPw31() { Nordlys31Keys.clear(appCtx29, account?.id); p31.bioOn = false; Haptics.select() }

/**
 * «Oppdater nå» (System-siden, banneret, PROGRAMVARE). Standard: ett trykk, uten passord. Med require_password på:
 * fingeravtrykk/PIN → lagret passord → reauthToken; uten lagret passord: passord-arket (prompt 30).
 */
fun AppViewModel.startUpd31(ctx: Context, action: String = "start") {
    val s = p31
    if (s.startBusy) return
    if (s.reqPw) {
        val pw = Nordlys31Keys.get(appCtx29, account?.id)
        if (pw == null) { askUpd30(action); return }
        Bio31.confirm(ctx, if (action == "rollback") "Gjenopprett forrige versjon" else "Oppdater Nordlys OS", displayName.ifBlank { appName },
            onOk = { postUpd31(action, pw) }, onFail = { askUpd30(action) })
        return
    }
    postUpd31(action, null)
}

private fun AppViewModel.postUpd31(action: String, pw: String?) {
    val s = p31
    val u = p30.upd
    s.startBusy = true
    launch31 {
        try {
            val body = JSONObject()
            if (pw != null) {
                val tok = runCatching { JSONObject(api31 { request("POST", "/auth/reauth", JSONObject().put("password", pw), prefix = Api.HOMELAB) }) }.getOrNull()
                    ?.let { it.s31("reauthToken") ?: it.s31("token") }
                if (tok != null) body.put("reauthToken", tok) else body.put("password", pw)
            }
            val path = if (action == "rollback") "/system/update/rollback" else "/system/update/start"
            api31 { request("POST", path, body, prefix = Api.HOMELAB, read = 60_000) }
            u.action = action
            u.phase = "run"; u.pct = 2; u.error = ""; u.notesOpen = false
            u.stepText = if (action == "rollback") "Laster ned forrige versjon …" else updStepText30(0, u.latest)
            Haptics.success()
            // Følg med på fremdriften (samme poll som prompt 30).
            pollUpd30()
        } catch (e: ApiException) {
            // Eldre server eller passord kreves likevel: passord-arket.
            if (e.status == 400 || e.status == 401 || e.status == 403) askUpd30(action)
            else flash(if (e.status == 404 || e.status == 405) "Serveren støtter ikke oppdatering fra appen." else "Kunne ikke starte: ${e.message}")
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { flash("Kunne ikke starte: ${e.message}") }
        finally { s.startBusy = false }
    }
}

/** «4.22» av «4.22.0». */
fun bigVer31(v: String): String = v.split('.').take(2).joinToString(".").ifBlank { "–" }

fun sizeText31(b: Long?): String? = b?.takeIf { it > 0 }?.let { if (it >= 1_000_000) "${Math.round(it / 1_000_000.0)} MB" else "${Math.max(1, Math.round(it / 1000.0))} kB" }

data class Ver36(val version: String, val date: String, val notes: List<String>, val installedAt: String?, val failed: Boolean, val commit: String?)

/* ======================= Nordlys: notater og tidligere versjoner ======================= */

private fun notes36(a: org.json.JSONArray?): List<String> {
    val out = ArrayList<String>()
    for (i in 0 until (a?.length() ?: 0)) {
        val x = a!!.opt(i)
        val t = when (x) { is JSONObject -> x.s36("text") ?: x.s36("t") ?: x.s36("title"); is String -> x; else -> null }?.trim() ?: continue
        // Tomme punkter og bare-overskrift-linjer («Kalender:») hoppes over.
        if (t.isEmpty() || Regex("^[^:]{1,30}:\\s*$").matches(t)) continue
        out += t.removePrefix("- ").removePrefix("* ")
    }
    return out
}

private fun ver36(o: JSONObject): Ver36? {
    val v = (o.s36("version") ?: o.s36("tag") ?: return null).removePrefix("v")
    return Ver36(v, o.s36("date") ?: o.s36("publishedAt") ?: "", notes36(o.optJSONArray("notes") ?: o.optJSONArray("items") ?: o.optJSONArray("changes")),
        o.s36("installedAt"), o.optBoolean("failed", false) || o.s36("status") == "failed", o.s36("commit") ?: o.s36("sha"))
}

/** TIDLIGERE VERSJONER (før [before]). more = «Vis flere» (fortsetter fra den siste i listen). */
fun AppViewModel.loadHist36(before: String, more: Boolean = false) {
    val s = p36
    if (s.histBusy) return
    if (!more && s.histFor == before && s.hist.isNotEmpty()) return
    s.histBusy = true
    launch36 {
        try {
            val from = if (more) s.hist.lastOrNull()?.version ?: before else before
            val q = "/system/changelog?limit=20" + if (from.isNotBlank()) "&before=" + URLEncoder.encode(from, "UTF-8") else ""
            val raw = api36 { hlGet(q, timeout = 10_000) }
            val o = raw.trim().let { if (it.startsWith("[")) JSONObject().put("items", org.json.JSONArray(it)) else JSONObject(it) }
            val items = objs34(o.optJSONArray("items")).mapNotNull { ver36(it) }.filter { it.version != before.removePrefix("v") }
            s.hist = if (more) (s.hist + items).distinctBy { it.version } else items
            s.histMore = o.optBoolean("more", false) && items.isNotEmpty()
            s.histFor = before
            s.histMissing = false
        } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.histMissing = true
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
        } finally { s.histBusy = false }
    }
}

/** «Ingen endringsnotater»: hent punktene for den nye versjonen fra changelog-API-et når /system/version mangler dem. */
fun AppViewModel.loadLatestNotes36(version: String) {
    val s = p36
    if (version.isBlank() || p30.upd.notes.isNotEmpty()) return
    launch36 {
        val raw = runCatching { api36 { hlGet("/system/changelog?limit=3", timeout = 10_000) } }.getOrNull() ?: return@launch36
        val o = runCatching { raw.trim().let { if (it.startsWith("[")) JSONObject().put("items", org.json.JSONArray(it)) else JSONObject(it) } }.getOrNull() ?: return@launch36
        val v = version.removePrefix("v")
        objs34(o.optJSONArray("items")).mapNotNull { ver36(it) }.firstOrNull { it.version == v }?.let { s.latestNotes = it.notes }
    }
}

/** «Se etter oppdatering»: Glimt i Sherlock-drakt flyr inn og leter mens serveren sjekker GitHub. */
fun AppViewModel.check36() {
    if (p31.checking || p30.upd.phase == "run") return
    Haptics.tap()
    p36.sherSeq++
    p36.sherOn = true
    checkNordlys31()
}

fun relDate36(v: String): String = runCatching { LocalDate.parse(v.take(10)) }.getOrNull()?.let { "%02d.%02d.%d".format(it.dayOfMonth, it.monthValue, it.year) } ?: v

/** «Installert 19.10 kl. 21.40». */
fun installed36(v: String?): String? {
    if (v.isNullOrBlank()) return null
    val t = runCatching { Instant.parse(v).atZone(OSLO36) }.getOrNull() ?: return "Installert"
    return "Installert %02d.%02d kl. %02d.%02d".format(t.dayOfMonth, t.monthValue, t.hour, t.minute)
}
