package no.kristo.kalender.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import no.kristo.kalender.Hap
import no.kristo.kalender.KalApiException
import no.kristo.kalender.KalAuth
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.hexIn
import no.kristo.kalender.str
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 36: Google Kalender i «+ Legg til kalender → Konto» (og Innstillinger → Kontoer og synk, som åpner samme fane).
 * GET /api/kalender/calendars/google → {connected, configured, email, main, calendars:[{id, googleId, name, primary, color,
 * writable, access, main, shown, appId}]}. PUT {main?, show?:[googleId…]} → samme (400 ikke skrivbar, 409 uten kobling).
 * Koblet til: e-posten, «Hovedkalender» (radioliste med skrivbare kalendere, primary først) og «Vis også» (brytere for de
 * andre, fargeprikk, «Bare lesing»). Ikke koblet: «Koble til Google» åpner Homelab-appen eller innloggingen i nettleseren.
 */

data class KGCal36(
    val id: String, val googleId: String, val name: String, val primary: Boolean, val color: Long?,
    val writable: Boolean, val access: String, val main: Boolean, val shown: Boolean, val appId: String?,
)

data class KGoogle36(
    val connected: Boolean = false, val configured: Boolean = false, val email: String? = null,
    val cals: List<KGCal36> = emptyList(), val error: String? = null,
) {
    /** Skrivbare (kan være hovedkalender), primary først. */
    val writable: List<KGCal36> get() = cals.filter { it.writable }.sortedBy { if (it.primary) 0 else 1 }
    /** De andre (ikke hovedkalenderen). */
    val others: List<KGCal36> get() = cals.filter { !it.main }
    val shownIds: List<String> get() = cals.filter { it.shown && !it.main }.map { it.googleId }
}

/** Tilstanden i panelet (ligger i KalVm, så den overlever at panelet lukkes og åpnes). */
class KGoogleUi36 {
    var g by mutableStateOf<KGoogle36?>(null)
    var busy by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    var waiting by mutableStateOf(false)
}

object KalGoogle36Repo {
    fun parse(body: String): KGoogle36 {
        val o = JSONObject(body)
        val a = o.optJSONArray("calendars") ?: JSONArray()
        val seen = HashSet<String>()
        val l = (0 until a.length()).mapNotNull { i ->
            val x = a.optJSONObject(i) ?: return@mapNotNull null
            val id = x.str("id") ?: return@mapNotNull null
            if (!seen.add(id)) return@mapNotNull null
            val gid = x.str("googleId") ?: id
            KGCal36(id, gid, x.str("name") ?: gid, x.optBoolean("primary", false), hexIn(x.str("color")),
                x.optBoolean("writable", false), x.str("access") ?: "", x.optBoolean("main", false), x.optBoolean("shown", false), x.str("appId"))
        }
        return KGoogle36(o.optBoolean("connected", false), o.optBoolean("configured", false), x(o, "email"), l)
    }

    private fun x(o: JSONObject, k: String): String? = o.str(k)

    suspend fun fetch(vm: KalVm): KGoogle36 {
        val s = vm.session ?: return KGoogle36(error = "Ikke logget inn")
        return try {
            parse(s.api.get("/api/kalender/calendars/google", timeout = 15_000))
        } catch (e: KalApiException) {
            KGoogle36(error = if (e.status == 404) "Serveren støtter ikke Google-kalendere ennå. Oppdater Homelab." else (e.message ?: "Kunne ikke hente Google-kalendere"))
        } catch (e: Exception) {
            KGoogle36(error = "Uventet svar fra serveren")
        }
    }

    suspend fun put(vm: KalVm, main: String?, show: List<String>?): KGoogle36 {
        val s = vm.session ?: throw KalApiException("Ikke logget inn")
        val b = JSONObject()
        if (main != null) b.put("main", main)
        if (show != null) b.put("show", JSONArray(show))
        return parse(s.api.request("PUT", "/api/kalender/calendars/google", b))
    }

    /** Engangs-URL (2 min) til Google-innloggingen i Homelab: POST /api/birthdays/google/start. */
    suspend fun loginUrl(vm: KalVm): String? {
        val s = vm.session ?: return null
        val root = s.server.trimEnd('/')
        return try {
            val u = JSONObject(s.api.post("/api/birthdays/google/start", JSONObject().put("return", "/"))).str("url") ?: return root
            if (u.startsWith("http")) u else root + u
        } catch (e: Exception) {
            root
        }
    }
}

fun KalVm.googleLoad(force: Boolean = false) {
    val st = g36
    if (st.g != null && !force) return
    viewModelScope.launch { st.g = KalGoogle36Repo.fetch(this@googleLoad) }
}

private fun KalVm.googleSave(main: String?, show: List<String>?) {
    val st = g36
    if (st.busy) return
    st.busy = true
    st.err = null
    viewModelScope.launch {
        try {
            st.g = KalGoogle36Repo.put(this@googleSave, main, show)
            refresh()
        } catch (e: KalApiException) {
            st.err = e.message ?: "Kunne ikke lagre"
        } catch (e: Exception) {
            st.err = "Uventet svar fra serveren"
        } finally {
            st.busy = false
        }
    }
}

fun KalVm.googleMain(c: KGCal36) {
    if (c.main || !c.writable) return
    Hap.tick()
    googleSave(c.id, null)
}

fun KalVm.googleShow(c: KGCal36) {
    val g = g36.g ?: return
    Hap.tick()
    val ids = g.shownIds.toMutableList()
    if (c.shown) ids.remove(c.googleId) else ids.add(c.googleId)
    googleSave(null, ids)
}

fun KalVm.googleLogin() {
    Hap.tick()
    val c = getApplication<Application>()
    g36.waiting = true
    val i = Intent(Intent.ACTION_VIEW, Uri.parse("finanshub://settings/kalendere")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (KalAuth.homelabInstalled(c) && runCatching { c.startActivity(i) }.isSuccess) {
        showToast("Logg inn med Google i Homelab, og kom tilbake hit")
        return
    }
    viewModelScope.launch {
        val u = KalGoogle36Repo.loginUrl(this@googleLogin)
        val ok = u != null && runCatching { c.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
        if (!ok) g36.err = "Fikk ikke åpnet innloggingen. Logg inn med Google i Homelab → Innstillinger → Kalendere."
    }
}

private fun accessText(c: KGCal36): String = when {
    !c.writable -> "Bare lesing"
    c.access == "owner" -> "Eier"
    else -> "Kan redigere"
}

/** Google-kortet i Konto-fanen. */
@Composable
fun Google36Panel(vm: KalVm) {
    val k = LocalK.current
    val st = vm.g36
    LaunchedEffect(Unit) { vm.googleLoad() }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(14.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Tx("Google Kalender", man(14.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
            if (st.busy) Tx("Lagrer …", man(12.sp, FontWeight.Medium, k.mut))
        }
        val g = st.g
        when {
            g == null -> Tx("Henter Google-kalendere …", man(12.sp, FontWeight.Medium, k.mut))
            !g.connected -> GoogleNotConnected36(vm, g)
            else -> GoogleConnected36(vm, g)
        }
        st.err?.let { Tx(it, man(12.sp, FontWeight.Medium, k.acc), maxLines = 4) }
    }
}

@Composable
private fun GoogleNotConnected36(vm: KalVm, g: KGoogle36) {
    val k = LocalK.current
    g.error?.let { Tx(it, man(12.sp, FontWeight.Medium, k.acc), maxLines = 4) }
    Tx(
        if (g.configured || g.error != null) "Logg inn med Google i Homelab. Deretter velger du hovedkalenderen her."
        else "Google Kalender er ikke satt opp på serveren ennå (Homelab → Innstillinger → Integrasjoner).",
        man(12.sp, FontWeight.Medium, k.mut, 16.sp), maxLines = 4,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        InkPill("Koble til Google", { vm.googleLogin() }, padH = 16.dp, fs = 13.sp)
        if (vm.g36.waiting) LinePill("Oppdater", { Hap.tick(); vm.g36.waiting = false; vm.googleLoad(force = true) })
    }
}

@Composable
private fun GoogleConnected36(vm: KalVm, g: KGoogle36) {
    val k = LocalK.current
    g.email?.let { Tx(it, mono(11.5.sp, k.mut)) }
    Tx("HOVEDKALENDER", mono(10.5.sp, k.mut, 1.2f))
    g.writable.forEach { c -> GoogleMainRow36(vm, c) }
    val rest = g.others
    if (rest.isNotEmpty()) {
        Tx("VIS OGSÅ", mono(10.5.sp, k.mut, 1.2f), Modifier.padding(top = 4.dp))
        rest.forEach { c -> GoogleShowRow36(vm, c) }
    }
}

@Composable
private fun GoogleMainRow36(vm: KalVm, c: KGCal36) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(c.name, Role.RadioButton) { vm.googleMain(c) },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(20.dp).clip(CircleShape).border(2.dp, if (c.main) k.acc else k.line, CircleShape), contentAlignment = Alignment.Center) {
            if (c.main) Box(Modifier.size(10.dp).clip(CircleShape).background(k.acc))
        }
        Column(Modifier.weight(1f)) {
            Tx(c.name, man(13.5.sp, FontWeight.Bold, k.ink))
            Tx(if (c.main) "Personlig · nye hendelser lagres her" else accessText(c), man(11.5.sp, FontWeight.Medium, k.mut))
        }
    }
}

@Composable
private fun GoogleShowRow36(vm: KalVm, c: KGCal36) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(c.name, Role.Switch) { vm.googleShow(c) },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(12.dp).clip(CircleShape).background(c.color?.let { Color(it) } ?: k.mut))
        }
        Column(Modifier.weight(1f)) {
            Tx(c.name, man(13.5.sp, FontWeight.Bold, k.ink))
            Tx(accessText(c), man(11.5.sp, FontWeight.Medium, k.mut))
        }
        Toggle(c.shown)
    }
}
