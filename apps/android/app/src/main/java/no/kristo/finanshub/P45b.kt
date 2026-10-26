package no.kristo.finanshub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.UUID
import no.kristo.finanshub.family.FamilyPrefs

/*
 * Prompt 45 (ANDROID45) – felles mobilpunkter (formene i SERVER45-API.md; alt tåler 404 fra eldre server):
 *  - Glimt-agenten (claude-code-glimt-intelligent-agent.md): Hjem-feltet går til POST /api/glimt/agent {text, module, context, requestId}
 *    med idempotensnøkkel per forespørsel; svar med `confirm` får «Bekreft» (POST /api/glimt/agent/confirm {token}). 404 → /api/assist som før.
 *  - Ruter: antall anbefalte reiser 1 · 2 · 3 (GET/PUT /api/ruter/settings recoCount, standard 2).
 *  - Sonevarsler (claude-code-sonevarsler-ikon-bryter.md): hovedbryter + av/på per person (GET/PUT /api/family/zone-alerts), og varselet med
 *    soneikonet i sonefargen (stort ikon), monokromt soneikon som lite ikon, sonens farge og egen kanal «Sonevarsler».
 *  - Vær: «Min posisjon» (GET /api/weather/here) fra telefonens egen posisjon.
 */

private fun JSONObject.s45(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun hexColor45(s: String?): Long? = s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { 0xFF000000L or it }

/* ======================= Glimt-agenten ======================= */

/** Modulen for en inngang i appen (source i assist31). */
internal fun agentModule45(source: String): String = when (source) { "search", "hjem", "home" -> "home"; "kalender" -> "calendar"; "huske", "tasks" -> "tasks"; else -> source }

/**
 * POST /api/glimt/agent. null = serveren mangler agenten (404/405 → husket for økten) eller kallet feilet; da brukes /api/assist.
 * Svaret gjøres om til Assist31 (reply → tekst, module.intent → intent), og `confirm` legges i p45.agentConfirm.
 */
internal suspend fun AppViewModel.agent45(q: String, source: String): Assist31? {
    val s = p45
    val module = agentModule45(source)
    // Prompt 67 (ANDCHAT67): Glimt-søket strømmer (POST /api/glimt/agent/stream) med statuslinje og Stopp, i samme samtale
    // (conversationId «home-…», kind search). Valgknappen som ble trykket sendes som choice. Eldre server → POST /api/glimt/agent som før.
    val g = Glimt67
    val pick = g.pendingPick?.takeIf { it.text.trim() == q.trim() }
    g.pendingPick = null
    val conv = if (module == "home") g.homeConv() else null
    val rid = Glimt67.rid()
    val body = agentBody67(q, module, rid, conv, if (conv != null) "search" else null, pick)
    g.homeChoices = null; g.homeTrace = null
    var o: JSONObject? = null
    if (module == "home" && g.streamOn()) {
        g.homeRid = rid; g.homeStop = false; g.homeStatus = null; g.homeText = ""
        try {
            o = stream67(body, { g.homeStop }, { g.homeConn = it }, { g.homeStatus = it }, { g.homeText = it })
        } catch (e: CancellationException) { g.homeRid = null; g.homeStatus = null; g.homeText = ""; throw e } catch (e: Stopped67) {
            g.homeRid = null; g.homeStatus = null; g.homeText = ""
            return Assist31(if (e.partial.isBlank()) "Stoppet." else e.partial + " …", "Glimt · Stoppet", "home.stopped", null, null, null, null, null, kind = "question")
        } catch (e: ApiException) {
            g.homeRid = null; g.homeStatus = null; g.homeText = ""
            if (e.status == 429) return Assist31(e.message ?: "Glimt jobber med mye nå. Prøv igjen om litt.", "Glimt", "home.busy", null, null, null, null, null, kind = "question")
            return null
        } catch (e: Exception) { g.homeRid = null; g.homeStatus = null; g.homeText = ""; return null }
        g.homeRid = null; g.homeStatus = null; g.homeText = ""
        if (o != null) s.agentOk = true
    }
    if (o == null) {
        if (s.agentOk == false) return null
        val raw = try { api45 { request("POST", "/glimt/agent", body, prefix = Api.HOMELAB, timeout = 6000, read = 45_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            if (e.status == 404 || e.status == 405) s.agentOk = false
            return null
        } catch (e: Exception) { return null }
        o = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        s.agentOk = true
    }
    val a = agentView67(o)
    val reply = a.text.takeIf { it.isNotBlank() } ?: return null
    // Prompt 67: valgknappene (choices) vises i boblen; spørsmålet står allerede i svaret.
    val text = reply
    val intent = o.s45("intent") ?: "ask"
    val mod = o.s45("module") ?: module
    val tool = a.toolName
    s.agentConfirm = a.confirm?.let { it.token to it.summary.ifBlank { "Bekreft" } }
    g.homeChoices = a.choices
    g.homeTrace = a.traceId
    // Intent som resten av appen kjenner igjen (reloadKal27 ved «calendar.create», trial.* osv.).
    val legacy = when {
        mod == "calendar" && intent in setOf("create", "update", "delete") -> "calendar.$intent"
        intent == "ask" || intent == "summarize" || intent == "search" -> "$mod.$intent"
        else -> "$mod.$intent"
    }
    // Spørsmål med valg eller bekreftelse vises alltid i boblen (ikke som pille), så knappene kan trykkes.
    val kind = if (a.choices != null || a.confirm != null) "question" else if (intent in setOf("create", "update", "delete", "multi")) "action" else "question"
    return Assist31(text, a.cacheNote()?.let { "Glimt · $it" } ?: "Glimt", legacy, a.card ?: o.optJSONObject("card"), tool, a.ms, null, null, null, a.open, kind)
}

/** Prompt 67: valgknapp i boblen → item.text + choice {setId, id} i samme samtale (søket på Hjem). */
fun AppViewModel.pickHome67(ch: Choices67, item: ChoiceItem67) {
    if (p31.ans?.busy == true) return
    Haptics.select()
    Glimt67.pendingPick = pick67(ch, item)
    Glimt67.homeChoices = null
    askHome32b(item.text)
}

/** «Bekreft» på en handling Glimt foreslo. Svaret erstatter teksten i boblen. */
fun AppViewModel.confirmAgent45() {
    val (token, _) = p45.agentConfirm ?: return
    p45.agentConfirm = null
    Haptics.tap()
    launch45 {
        val raw = try { api45 { hlPost("/glimt/agent/confirm", JSONObject().put("token", token)) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            flash("Glimt fikk ikke gjort det: ${e.message ?: "ukjent feil"}"); Haptics.error(); return@launch45
        }
        val o = runCatching { JSONObject(raw) }.getOrNull()
        val reply = o?.s45("reply") ?: o?.s45("text") ?: "Gjort."
        p31.ans = p31.ans?.copy(text = reply, busy = false)
        Haptics.success()
        reloadKal27()
    }
}

fun AppViewModel.cancelAgent45() { p45.agentConfirm = null; p31.ans = p31.ans?.copy(text = "Greit, jeg lot det være.") }

/* ======================= Ruter: antall anbefalte reiser ======================= */

fun AppViewModel.loadRecoCount45() {
    val s = p45
    val k = account?.id ?: ""
    if (s.recoFor == k) return
    s.recoFor = k
    s.recoCount = prefs.str("p45_reco_$k", "2").toIntOrNull()?.coerceIn(1, 3) ?: 2
    launch45 {
        val raw = runCatching { api45 { hlGet("/ruter/settings") } }.getOrNull() ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch45
        val n = (o.optJSONObject("settings") ?: o).optInt("recoCount", 0)
        if (n in 1..3) { s.recoCount = n; prefs.set("p45_reco_$k", n.toString()) }
    }
}

fun AppViewModel.setRecoCount45(n: Int) {
    val v = n.coerceIn(1, 3)
    p45.recoCount = v
    Haptics.select()
    prefs.set("p45_reco_" + (account?.id ?: ""), v.toString())
    launch45 { runCatching { api45 { hlPut("/ruter/settings", JSONObject().put("recoCount", v)) } } }
}

/* ======================= Sonevarsler: av/på ======================= */

private fun parseZoneAlerts45(o: JSONObject): ZoneAlerts45 {
    val a = o.optJSONArray("people") ?: JSONArray()
    val people = (0 until a.length()).mapNotNull { i ->
        val x = a.optJSONObject(i) ?: return@mapNotNull null
        val id = x.s45("id") ?: return@mapNotNull null
        val name = x.s45("name") ?: "?"
        ZoneAlertPerson45(id, name, x.s45("initials") ?: name.take(2), hexColor45(x.s45("color")), x.optBoolean("on", true))
    }
    return ZoneAlerts45(o.optBoolean("on", true), people)
}

fun AppViewModel.loadZoneAlerts45(force: Boolean = false) {
    val s = p45
    val k = account?.id ?: ""
    if (!force && s.zoneAlertsFor == k) return
    s.zoneAlertsFor = k
    launch45 {
        val raw = try { api45 { hlGet("/family/zone-alerts") } } catch (e: CancellationException) { throw e } catch (e: Exception) { null } ?: return@launch45
        val z = runCatching { parseZoneAlerts45(JSONObject(raw)) }.getOrNull() ?: return@launch45
        s.zoneAlerts = z
        ZoneNotify45.remember(appCtx45, z)
    }
}

/** Hovedbryter ([person] = null) eller én person. Vises med en gang og lagres på serveren (per bruker = mottakeren). */
fun AppViewModel.setZoneAlert45(person: String?, on: Boolean) {
    val s = p45
    val cur = s.zoneAlerts ?: return
    Haptics.select()
    val next = if (person == null) cur.copy(on = on) else cur.copy(people = cur.people.map { if (it.id == person) it.copy(on = on) else it })
    s.zoneAlerts = next
    ZoneNotify45.remember(appCtx45, next)
    val body = if (person == null) JSONObject().put("on", on) else JSONObject().put("people", JSONObject().put(person, on))
    launch45 {
        val raw = try { api45 { hlPut("/family/zone-alerts", body) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            s.zoneAlerts = cur; ZoneNotify45.remember(appCtx45, cur); flash("Kunne ikke lagre sonevarslene"); null
        } ?: return@launch45
        runCatching { parseZoneAlerts45(JSONObject(raw)) }.getOrNull()?.let { s.zoneAlerts = it; ZoneNotify45.remember(appCtx45, it) }
    }
}

/** «Vis eksempel på varsel»: et ekte systemvarsel med soneikonet (første sone), slik det ser ut når noen forlater en sone. */
fun AppViewModel.sampleZoneNotify45() {
    val z = family?.zones?.firstOrNull()
    val who = family?.members?.firstOrNull { it.userId != family?.me?.userId }?.name?.split(' ')?.firstOrNull() ?: "Ingrid"
    val zone = z?.name ?: "Hjem"
    launch45 {
        val api = FamilyPrefs.api(appCtx45)
        val icon = ZoneNotify45.icon(api, z?.id, null)
        ZoneNotify45.post(appCtx45, zone, "$who forlot $zone", "zone45-sample", z?.color?.toInt(), icon)
    }
}

/* ======================= Sonevarsler: selve varselet ======================= */

object ZoneNotify45 {
    private const val CHANNEL = "sonevarsler45"

    private fun sp(ctx: Context) = ctx.getSharedPreferences("zone45", Context.MODE_PRIVATE)

    /** Valgene lagres lokalt også, så varsler fra bakgrunnstjenesten følger dem uten nett. */
    fun remember(ctx: Context, z: ZoneAlerts45) {
        sp(ctx).edit().putBoolean("on", z.on).putStringSet("off", z.people.filter { !it.on }.map { it.id }.toSet()).apply()
    }

    fun allowed(ctx: Context, personId: String?): Boolean {
        val p = sp(ctx)
        if (!p.getBoolean("on", true)) return false
        return personId == null || personId !in (p.getStringSet("off", emptySet()) ?: emptySet())
    }

    private fun channel(ctx: Context): String {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Sonevarsler", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Når noen i familien kommer til eller forlater en sone" },
            )
        }
        return CHANNEL
    }

    /** Soneikonet som PNG fra serveren (hvitt ikon på sonefarge, sirkel). null uten nett/eldre server. */
    suspend fun icon(api: Api?, zoneId: String?, iconUrl: String?): Bitmap? {
        if (api == null) return null
        val path = iconUrl?.takeIf { it.startsWith("/") } ?: zoneId?.let { "/api/family/zones/" + URLEncoder.encode(it, "UTF-8") + "/icon.png?size=128&shape=circle" } ?: return null
        return try { api.bytes(path).let { b -> BitmapFactory.decodeByteArray(b, 0, b.size) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
    }

    /** Lite ikon (monokromt): bare de hvite pikslene i soneikonet (selve symbolet), resten gjennomsiktig. */
    private fun mono(b: Bitmap): Bitmap? = runCatching {
        val w = b.width; val h = b.height
        val px = IntArray(w * h)
        b.getPixels(px, 0, w, 0, 0, w, h)
        for (i in px.indices) {
            val c = px[i]
            val a = c ushr 24; val r = (c shr 16) and 255; val g = (c shr 8) and 255; val bl = c and 255
            px[i] = if (a > 128 && r > 215 && g > 215 && bl > 215) -0x1 else 0
        }
        Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }.getOrNull()

    /** Reserve når serveren ikke har ikonet: farget sirkel med sonens forbokstav. */
    private fun letter(name: String, color: Int?): Bitmap {
        val s = 128
        val bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawCircle(s / 2f, s / 2f, s / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color ?: 0xFF2F6B4A.toInt() })
        val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = android.graphics.Color.WHITE; textSize = 64f; textAlign = Paint.Align.CENTER; isFakeBoldText = true }
        c.drawText(name.take(1).uppercase(), s / 2f, s / 2f - (tp.descent() + tp.ascent()) / 2, tp)
        return bmp
    }

    /** Tittel = sonenavn, tekst = «Ingrid forlot Hjem», stort ikon = soneikonet, lite ikon = monokromt soneikon, farge = sonens farge. */
    fun post(ctx: Context, title: String, body: String, tag: String, color: Int?, icon: Bitmap?) {
        if (!Notify.allowed(ctx)) return
        val large = icon ?: letter(title, color)
        val b = Notification.Builder(ctx, channel(ctx))
        val small = icon?.let { mono(it) }
        if (small != null && Build.VERSION.SDK_INT >= 23) b.setSmallIcon(android.graphics.drawable.Icon.createWithBitmap(small))
        else b.setSmallIcon(ctx.resources.getIdentifier("ic_launcher_monochrome", "drawable", ctx.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_map)
        b.setLargeIcon(large).setContentTitle(title).setContentText(body).setAutoCancel(true)
            .setStyle(Notification.BigTextStyle().bigText(body))
        color?.let { b.setColor(it) }
        try { (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(tag.hashCode(), b.build()) } catch (_: SecurityException) {}
    }

    /** Hendelser fra POST /api/family/location (eller køen): ett varsel per hendelse, bare når bryterne er på. */
    suspend fun postEvents(ctx: Context, api: Api?, a: JSONArray?) {
        if (a == null) return
        for (i in 0 until a.length()) {
            val e = a.optJSONObject(i) ?: continue
            val pid = e.s45("personId") ?: e.s45("userId")
            if (!allowed(ctx, pid)) continue
            val who = (e.s45("person") ?: e.s45("name") ?: e.s45("username") ?: "Noen").split(' ').first()
            val zone = e.s45("zone") ?: e.s45("zoneName") ?: "sonen"
            val leave = (e.s45("event") ?: e.s45("kind")) == "leave"
            val icon = icon(api, e.s45("zoneId"), e.s45("iconUrl") ?: e.s45("icon")?.takeIf { it.startsWith("/") })
            post(ctx, zone, if (leave) "$who forlot $zone" else "$who kom til $zone", "fam-" + (e.s45("id") ?: "$zone-$who-$leave"), hexColor45(e.s45("color"))?.toInt(), icon)
        }
    }

    /** Et varsel fra /api/notify/pending med data.kind == "zone". */
    suspend fun postPending(ctx: Context, api: Api, title: String, body: String, tag: String, data: JSONObject) {
        if (!allowed(ctx, data.s45("personId"))) return
        val icon = icon(api, data.s45("zoneId"), data.s45("iconUrl"))
        post(ctx, data.s45("zone") ?: title, body, tag, hexColor45(data.s45("color"))?.toInt(), icon)
    }
}

/* ======================= Vær: Min posisjon ======================= */

/**
 * Været der telefonen er. [lat]/[lon] fra telefonens siste kjente posisjon (aldri fra serveren eller en annen enhet).
 * Maks hvert 10. minutt (force = trykk på «Tillat»/oppdater).
 */
fun AppViewModel.loadHere45(lat: Double, lon: Double, selLat: Double?, selLon: Double?, force: Boolean = false) {
    val s = p45
    if (!force && s.hereState == "ok" && System.currentTimeMillis() - s.hereAt < 600_000L) return
    s.hereAt = System.currentTimeMillis()
    if (s.here == null) s.hereState = "loading"
    launch45 {
        val q = String.format(java.util.Locale.US, "/weather/here?lat=%.4f&lon=%.4f", lat, lon) +
            (if (selLat != null && selLon != null) String.format(java.util.Locale.US, "&selLat=%.4f&selLon=%.4f", selLat, selLon) else "")
        val raw = try { api45 { hlGet(q, timeout = 12_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            s.hereState = if (e.status == 404) "missing" else "error"; null
        } catch (e: Exception) { s.hereState = "error"; null } ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: run { s.hereState = "error"; return@launch45 }
        val now = o.optJSONObject("now")
        val today = o.optJSONObject("today")
        fun d(x: JSONObject?, k: String): Double? = x?.takeIf { it.has(k) && !it.isNull(k) }?.optDouble(k)?.takeIf { !it.isNaN() }
        s.here = WxHere45(o.optJSONObject("place")?.s45("name") ?: "Her", d(now, "temp"), now?.s45("text"), d(today, "hi"), d(today, "lo"), o.optBoolean("sameAsSelected", false))
        s.hereState = "ok"
    }
}
