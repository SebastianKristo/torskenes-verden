package no.kristo.kalender.ui

import android.app.Application
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import no.kristo.kalender.Hap
import no.kristo.kalender.KCal
import no.kristo.kalender.KGMap39
import no.kristo.kalender.KIcs39
import no.kristo.kalender.KInfo39
import no.kristo.kalender.Kal39
import no.kristo.kalender.Kal39Repo
import no.kristo.kalender.KalStore
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.reduceMotion
import no.kristo.kalender.hexOut
import no.kristo.kalender.hm
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/*
 * Prompt 39 (KAL39): Innstillinger → Kalendere (1a), Rediger (1b), Legg til (1c) og «Hvilken kalender er hva?» (1d som ark)
 * etter Kalendere Oppsett.dc.html. 1a: fargeboksen viser/skjuler, navnet åpner Rediger, merke GOOGLE/URL/INNEBYGD + kilde og antall.
 * 1b: fargeflate + type + navn, Lagre; Navn, Farge (10), KILDE, VIS OG VARSLE, Fjern kalenderen (ikke Personlig).
 * 1c: Google-kalender · Abonner med URL (hentes én gang: navn, antall, fag) · Helligdager (land) · «lag en egen kalender».
 */

/** Det som endres i Rediger. */
data class KDraft39(
    val name: String, val c: Long, val visible: Boolean, val notify: Boolean, val brief: Boolean, val fag: Boolean,
    val interval: String, val country: String,
)

class K39State(private val vm: KalVm) {
    var listOn by mutableStateOf(false)
    var edit by mutableStateOf<String?>(null)
    var draft by mutableStateOf<KDraft39?>(null)
    var addOn by mutableStateOf(false)
    var addMode by mutableStateOf("url")
    var url by mutableStateOf("")
    var preview by mutableStateOf<KIcs39?>(null)
    var ownName by mutableStateOf("")
    var ownC by mutableStateOf(Kal39.PALETTE[5])
    var country by mutableStateOf("NO")
    var gmapOn by mutableStateOf(false)
    var gmap by mutableStateOf<KGMap39?>(null)
    var gNames by mutableStateOf("")
    var busy by mutableStateOf(false)
    var err by mutableStateOf<String?>(null)
    var confirmDel by mutableStateOf(false)
    var migSeen by mutableStateOf(false)

    private val ctx: Application get() = vm.getApplication()

    fun open() { Hap.tick(); listOn = true }
    fun close() { Hap.dismiss(); edit = null; listOn = false }

    fun openEdit(c: KCal) {
        Hap.tick()
        err = null
        confirmDel = false
        gNames = ""
        val i = c.p39
        draft = KDraft39(c.n, c.c, c.id !in vm.hid, i?.notify ?: (Kal39.role(c) != "h"), i?.brief ?: true,
            i?.fag ?: fagPref(), i?.interval?.ifEmpty { "1h" } ?: "1h", i?.country?.ifEmpty { "NO" } ?: "NO")
        edit = c.id
        val s = vm.session ?: return
        if (i?.badge == "GOOGLE" && (Kal39.role(c) == "p" || Kal39.role(c) == "b")) vm.viewModelScope.launch {
            val m = Kal39Repo.fetchMap(s)
            gNames = m.names(Kal39.role(c)).joinToString(" + ")
        }
    }

    fun closeEdit() { Hap.dismiss(); edit = null; draft = null; confirmDel = false }

    fun openAdd() { Hap.tick(); err = null; preview = null; addOn = true }
    fun closeAdd() { Hap.dismiss(); addOn = false }

    fun openGMap() {
        Hap.tick()
        addOn = false
        gmapOn = true
        gmap = null
        err = null
        val s = vm.session ?: return
        vm.viewModelScope.launch { gmap = Kal39Repo.fetchMap(s) }
    }

    fun closeGMap() { Hap.dismiss(); gmapOn = false }

    private fun fagPref(): Boolean = ctx.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE).getBoolean("fag39", true)

    /** Lagre i Rediger: farge og vis/skjul via de eksisterende funksjonene, resten med PATCH. */
    fun save(c: KCal) {
        val d = draft ?: return
        val s = vm.session ?: return
        val i = c.p39 ?: KInfo39()
        if (d.c != c.c) vm.pickColor(c, d.c)
        if (d.visible != (c.id !in vm.hid)) { vm.calEd = false; vm.toggleCal(c) }
        val body = JSONObject()
        if (d.name.isNotBlank() && d.name.trim() != c.n) body.put("name", d.name.trim())
        if (d.notify != (i.notify ?: (Kal39.role(c) != "h"))) body.put("notify", d.notify)
        if (d.brief != (i.brief ?: true)) body.put("showInBrief", d.brief)
        if (Kal39.role(c) == "s" && d.interval != i.interval.ifEmpty { "1h" }) body.put("interval", d.interval)
        if (Kal39.role(c) == "h" && d.country != i.country.ifEmpty { "NO" }) body.put("country", d.country)
        // Lokalt med en gang (så lista og varslene stemmer før neste synk).
        val st = KalStore.current(ctx)
        val ni = i.copy(notify = d.notify, brief = d.brief, fag = d.fag,
            interval = if (Kal39.role(c) == "s") d.interval else i.interval,
            country = if (Kal39.role(c) == "h") d.country else i.country,
            sourceLabel = if (Kal39.role(c) == "h") Kal39.countryName(d.country) else i.sourceLabel)
        KalStore.save(ctx, st.copy(cals = st.cals.map { if (it.id == c.id) it.copy(n = if (d.name.isBlank()) it.n else d.name.trim(), p39 = ni) else it }))
        if (d.fag != (i.fag ?: fagPref())) {
            ctx.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE).edit().putBoolean("fag39", d.fag).apply()
            vm.viewModelScope.launch { Kal39Repo.save(s, c.serverId ?: c.id, JSONObject().put("subjectColors", d.fag)) }
        }
        if (body.length() == 0 || !vm.data.serverCals || i.localHolidays) { Hap.done(); closeEdit(); return }
        busy = true
        vm.viewModelScope.launch {
            val e = Kal39Repo.save(s, c.serverId ?: c.id, body)
            busy = false
            if (e == null) { Hap.done(); closeEdit(); vm.refresh() } else err = e
        }
    }

    fun pasteUrl(c: KCal, raw: String?) {
        val s = vm.session ?: return
        val u = raw?.trim().orEmpty()
        if (!Kal39.validIcs(u)) { err = "Kopier en webcal:// eller https://-adresse først."; return }
        busy = true
        vm.viewModelScope.launch {
            val e = Kal39Repo.save(s, c.serverId ?: c.id, JSONObject().put("url", u))
            busy = false
            if (e == null) { vm.showToast("Ny adresse for «${c.n}» lagret"); vm.refresh() } else err = e
        }
    }

    fun refreshCal(c: KCal) {
        val s = vm.session ?: return
        busy = true
        vm.viewModelScope.launch {
            val e = Kal39Repo.refresh(s, c.serverId ?: c.id)
            busy = false
            if (e == null) { vm.showToast("«${c.n}» er oppdatert"); vm.refresh() } else err = e
        }
    }

    /** Skole uten adresse: «Legg til Skole» (PATCH url). Ellers et nytt abonnement (POST /ical). */
    val schoolEmpty: Boolean get() = Kal39.serverKnows && vm.cals.firstOrNull { Kal39.role(it) == "s" }?.p39?.url.isNullOrEmpty() && vm.cals.any { Kal39.role(it) == "s" }

    fun urlAction() {
        val s = vm.session ?: return
        val u = url.trim()
        err = null
        busy = true
        vm.viewModelScope.launch {
            val p = preview
            if (p == null) {
                val r = Kal39Repo.preview(u)
                busy = false
                if (r.error == null) preview = r else err = r.error
                return@launch
            }
            val sk = vm.cals.firstOrNull { Kal39.role(it) == "s" }
            val e: String? = if (schoolEmpty && sk != null) Kal39Repo.save(s, sk.serverId ?: sk.id, JSONObject().put("url", u))
            else try { no.kristo.kalender.Kal35Repo.addIcal(s, u, p.name.ifEmpty { Kal39.host(u) }, Kal39.COLORS["s"] ?: 0xFF2F7A4F); null }
            catch (x: no.kristo.kalender.KalApiException) { if (x.status == 404) "Serveren støtter ikke iCal-abonnement ennå. Oppdater Homelab." else x.message }
            busy = false
            if (e == null) { vm.showToast("Abonnerer på «${p.name.ifEmpty { Kal39.host(u) }}»"); url = ""; preview = null; addOn = false; vm.refresh() } else err = e
        }
    }

    fun useHolidays() {
        val h = vm.cals.firstOrNull { Kal39.role(it) == "h" } ?: return
        openEdit(h)
        draft = draft?.copy(visible = true, country = country)
        edit = null
        save(h)
        vm.showToast("Helligdager for ${Kal39.countryName(country)} vises")
        addOn = false
    }

    fun makeOwn() {
        val n = ownName.trim()
        if (n.isEmpty()) return
        vm.createCalendar(n, ownC)
        ownName = ""
        addOn = false
    }

    fun setRole(gid: String, r: String) {
        Hap.tick()
        val m = gmap ?: return
        gmap = m.copy(calendars = m.calendars.map { if (it.googleId == gid) it.copy(role = r) else it })
    }

    fun saveGMap() {
        val s = vm.session ?: return
        val m = gmap ?: return
        busy = true
        err = null
        vm.viewModelScope.launch {
            val e = Kal39Repo.saveMap(s, m)
            busy = false
            if (e == null) { vm.showToast("Lagret – Google synkes i bakgrunnen"); gmapOn = false; vm.refresh() } else err = e
        }
    }

    /** «Vi ryddet kalenderne: 12 → 4» (én gang). */
    val migText: String get() {
        if (migSeen) return ""
        val m = Kal39.migration
        val p = ctx.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE)
        val seen = p.getString("mig39", "") ?: ""
        if (m.done && m.from > m.to) return if (seen == "s:" + m.undoUntil) "" else "Vi ryddet kalenderne: ${m.from} → ${m.to}."
        if (!Kal39.serverKnows && Kal39.mergedFrom > 0 && seen.isEmpty()) return "Vi ryddet kalenderne: ${Kal39.mergedFrom} → 4. Hendelsene ligger i Personlig og Skole."
        return ""
    }

    /** Én gang etter oppryddingen på serveren: toast med Angre. */
    fun announce() {
        val m = Kal39.migration
        if (!m.done || m.from <= m.to) return
        val p = ctx.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE)
        val mark = m.undoUntil.ifEmpty { "done" }
        if (p.getString("mig39toast", "") == mark) return
        p.edit().putString("mig39toast", mark).apply()
        vm.showToast("Vi ryddet kalenderne: ${m.from} → ${m.to}", if (m.canUndo) ({ undoMig() }) else null)
    }

    fun dismissMig() {
        val m = Kal39.migration
        ctx.getSharedPreferences("kalender_prefs", android.content.Context.MODE_PRIVATE).edit().putString("mig39", if (m.done) "s:" + m.undoUntil else "local").apply()
        migSeen = true
    }

    fun undoMig() {
        val s = vm.session ?: return
        vm.viewModelScope.launch {
            val e = Kal39Repo.undoMigration(s)
            if (e == null) { vm.showToast("Kalenderne er satt tilbake som før"); dismissMig(); vm.refresh() } else vm.showToast(e)
        }
    }

    fun syncText(): String {
        val at = vm.data.at
        if (at <= 0) return "Ikke synket ennå"
        val t = Instant.ofEpochMilli(at).atZone(ZoneId.of("Europe/Oslo"))
        return "Sist synket " + hm(t.hour * 60 + t.minute)
    }
}

/* ---------------- Lag over alt (kalles nederst i KalApp) ---------------- */

@Composable
fun BoxScope.Kal39Layer(vm: KalVm) {
    val st = vm.k39
    val reduce = reduceMotion()
    BackHandler(st.listOn || st.edit != null || st.addOn || st.gmapOn) {
        when {
            st.gmapOn -> st.closeGMap()
            st.addOn -> st.closeAdd()
            st.edit != null -> st.closeEdit()
            else -> st.close()
        }
    }
    AnimatedVisibility(st.listOn, enter = if (reduce) fadeIn() else slideInHorizontally(tween(280, easing = EASE)) { it }, exit = if (reduce) fadeOut() else slideOutHorizontally(tween(240, easing = EASE)) { it }) {
        Cals39Page(vm)
    }
    val ec = st.edit?.let { id -> vm.cals.firstOrNull { it.id == id } }
    AnimatedVisibility(ec != null, enter = if (reduce) fadeIn() else slideInHorizontally(tween(280, easing = EASE)) { it }, exit = if (reduce) fadeOut() else slideOutHorizontally(tween(240, easing = EASE)) { it }) {
        if (ec != null) CalEdit39Page(vm, ec)
    }
    val k = LocalK.current
    val dimOn = st.addOn || st.gmapOn
    val a by animateFloatAsState(if (dimOn) 1f else 0f, tween(280), label = "dim39")
    if (a > 0.01f) Box(Modifier.matchParentSize().background(k.dim.copy(alpha = k.dim.alpha * a)).tap("Lukk") { if (st.gmapOn) st.closeGMap() else st.closeAdd() })
    AnimatedVisibility(st.addOn, Modifier.align(Alignment.BottomCenter),
        enter = if (reduce) fadeIn() else slideInVertically(tween(340, easing = EASE)) { it },
        exit = if (reduce) fadeOut() else slideOutVertically(tween(260, easing = EASE)) { it }) { CalAdd39Sheet(vm) }
    AnimatedVisibility(st.gmapOn, Modifier.align(Alignment.BottomCenter),
        enter = if (reduce) fadeIn() else slideInVertically(tween(340, easing = EASE)) { it },
        exit = if (reduce) fadeOut() else slideOutVertically(tween(260, easing = EASE)) { it }) { GMap39Sheet(vm) }
}

/* ---------------- 1a: Kalendere ---------------- */

@Composable
fun Cals39Page(vm: KalVm) {
    val k = LocalK.current
    val st = vm.k39
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx(if (vm.setOn) "‹ Innstillinger" else "‹ Kalender", man(15.sp, FontWeight.SemiBold, k.ink), Modifier.weight(1f).heightIn(min = 44.dp).tap("Tilbake") { st.close() }.padding(top = 12.dp))
                InkPill("Ferdig", { st.close() })
            }
            Tx("Kalendere", news(34.sp, k.ink))
            val mt = st.migText
            if (mt.isNotEmpty()) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tx(mt, man(13.sp, FontWeight.Medium, k.ink), Modifier.weight(1f), maxLines = 3)
                if (Kal39.migration.canUndo) Tx("Angre", man(13.sp, FontWeight.Bold, Red), Modifier.tap("Angre") { st.undoMig() }.padding(8.dp))
                Tx("×", man(17.sp, FontWeight.Bold, k.mut), Modifier.tap("Lukk") { st.dismissMig() }.padding(8.dp))
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 2.dp)) {
                vm.cals.forEachIndexed { i, c -> CalRow39(vm, c, i == 0) }
            }
            Box(
                Modifier.fillMaxWidth().height(50.dp).drawBehind {
                    drawRoundRect(k.line, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2))
                }.tap("Legg til kalender") { st.openAdd() },
                contentAlignment = Alignment.Center,
            ) { Tx("+ Legg til kalender", man(15.sp, FontWeight.Bold, k.ink)) }
            Column(Modifier.padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Tx("Trykk på fargen for å vise eller skjule. Trykk på navnet for å redigere.", man(12.5.sp, FontWeight.Medium, k.mut2), maxLines = 3)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Tx(st.syncText() + " · ", man(12.5.sp, FontWeight.Medium, k.mut2))
                    Tx(if (vm.syncing) "Synker …" else "Synk nå", man(12.5.sp, FontWeight.Bold, Red), Modifier.tap("Synk nå") { Hap.tick(); vm.refresh() })
                }
                vm.syncErr?.let { Tx(it, man(12.sp, FontWeight.Medium, k.acc), maxLines = 3) }
            }
            Spacer(Modifier.height(24.dp))
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
    }
}

@Composable
fun Badge39(badge: String) {
    val k = LocalK.current
    val fg = when (badge) { "GOOGLE" -> if (k.dark) Color(0xFF9CC2EE) else Color(0xFF2B5D8A); "URL" -> if (k.dark) Color(0xFF8FD4A8) else Color(0xFF2F7A4F); else -> k.mut }
    val bg = when (badge) { "GOOGLE" -> Color(0x1F4285F4); "URL" -> Color(0x1F2F7A4F); else -> k.chip }
    Box(Modifier.clip(RoundedCornerShape(5.dp)).background(bg).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Tx(badge, mono(10.sp, fg, .06f).copy(fontWeight = FontWeight.Bold))
    }
}

@Composable
private fun CalRow39(vm: KalVm, c: KCal, first: Boolean) {
    val k = LocalK.current
    val on = c.id !in vm.hid
    val bad = c.p39?.status?.lowercase()?.let { "feil" in it || it == "error" } == true
    var sub = c.p39?.sourceLabel.orEmpty()
    if (bad) sub = "Feil · sjekk URL"
    else if (Kal39.role(c) == "s" && !c.p39?.url.isNullOrEmpty() && "·" !in sub) sub = Kal39.host(c.p39?.url.orEmpty()) + " · " + Kal39.intervalName(c.p39?.interval.orEmpty()).lowercase()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 66.dp).drawBehind { if (!first) drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(34.dp, 44.dp).tap(if (on) "Skjul ${c.n}" else "Vis ${c.n}", Role.Checkbox) { vm.calEd = false; vm.toggleCal(c) }, contentAlignment = Alignment.Center) {
            Box(Modifier.size(26.dp).clip(RoundedCornerShape(8.dp)).background(if (on) c.col else Color.Transparent).border(2.dp, c.col, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                if (on) Tx("✓", man(13.sp, FontWeight.Bold, Color.White))
            }
        }
        Row(Modifier.weight(1f).tap("Rediger ${c.n}") { vm.k39.openEdit(c) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Tx(c.n, man(16.sp, FontWeight.Bold, k.ink))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Badge39(c.p39?.badge?.ifEmpty { "EGEN" } ?: "EGEN")
                    Tx(sub, man(12.5.sp, FontWeight.Medium, if (bad) k.acc else k.mut))
                }
            }
            Tx((c.count ?: 0).toString(), mono(12.sp, k.mut2))
            Tx("›", man(18.sp, FontWeight.Medium, k.mut2))
        }
    }
}

/* ---------------- 1b: Rediger ---------------- */

@Composable
fun CalEdit39Page(vm: KalVm, c: KCal) {
    val k = LocalK.current
    val st = vm.k39
    val d = st.draft ?: return
    val role = Kal39.role(c)
    val badge = c.p39?.badge.orEmpty()
    val clip = LocalClipboardManager.current
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}.imePadding()) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx("‹ Kalendere", man(15.sp, FontWeight.SemiBold, k.ink), Modifier.weight(1f).heightIn(min = 44.dp).tap("Tilbake") { st.closeEdit() }.padding(top = 12.dp))
                InkPill(if (st.busy) "Lagrer …" else "Lagre", { if (!st.busy) st.save(c) }, enabled = !st.busy)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Color(d.c)))
                Column {
                    Tx(Kal39.kicker(c), mono(10.5.sp, Red, .12f))
                    Tx(d.name.ifBlank { c.n }, news(30.sp, k.ink))
                }
            }
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
                    Tx("Navn", man(15.sp, FontWeight.Medium, k.ink), Modifier.width(80.dp))
                    BasicTextField(d.name, { st.draft = d.copy(name = it) }, Modifier.weight(1f), singleLine = true, cursorBrush = SolidColor(Red),
                        textStyle = man(15.sp, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.End))
                }
                Column(Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Tx("Farge", man(15.sp, FontWeight.Medium, k.ink))
                    Swatches39(d.c) { st.draft = d.copy(c = it) }
                }
            }
            Label("KILDE", Modifier.padding(horizontal = 6.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 4.dp)) {
                when (badge) {
                    "GOOGLE" -> {
                        SrcRow39("Type", "Google Kalender", true)
                        SrcRow39("Konto", c.p39?.sourceLabel?.ifEmpty { "Google" } ?: "Google")
                        SrcRow39("Google-kalender", st.gNames.ifEmpty { if (role == "b") "Bursdager" else c.n })
                        SrcRow39("Endre kobling", "Velg ›", link = true) { st.openGMap() }
                    }
                    "URL" -> {
                        SrcRow39("Type", "Abonnement (iCal-URL)", true)
                        SrcRow39("Adresse", c.p39?.url?.ifEmpty { "Ingen adresse ennå" } ?: "Ingen adresse ennå", mono = true)
                        SrcRow39("Oppdateres", Kal39.intervalName(d.interval) + " ▾") {
                            val i = Kal39.INTERVALS.indexOfFirst { it.first == d.interval }
                            st.draft = d.copy(interval = Kal39.INTERVALS[(i + 1) % Kal39.INTERVALS.size].first)
                        }
                        val lf = c.p39?.lastFetched.orEmpty()
                        SrcRow39("Sist hentet", (if (lf.isEmpty()) "–" else Kal39.shortTime(lf)) + " · ${c.count ?: 0} hendelser")
                        val s0 = c.p39?.status.orEmpty()
                        if (s0.isNotEmpty() && s0.lowercase() != "ok") SrcRow39("Status", if (s0.lowercase() == "error") "Feil · sjekk URL" else s0)
                    }
                    "INNEBYGD" -> {
                        SrcRow39("Type", "Innebygd", true)
                        SrcRow39("Land", Kal39.countryName(d.country) + " ▾") {
                            val i = Kal39.COUNTRIES.indexOfFirst { it.first == d.country }
                            st.draft = d.copy(country = Kal39.COUNTRIES[(i + 1) % Kal39.COUNTRIES.size].first)
                        }
                        SrcRow39("Viser", "Fridager og merkedager")
                    }
                    else -> {
                        SrcRow39("Type", if (badge == "HA") "Home Assistant" else "Egen kalender", true)
                        SrcRow39("Lagres", c.p39?.sourceLabel?.ifEmpty { "I Homelab" } ?: "I Homelab")
                    }
                }
            }
            if (badge == "URL") Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(k.card).tap("Lim inn ny URL") { st.pasteUrl(c, clip.getText()?.text) }, contentAlignment = Alignment.Center) {
                    Tx("Lim inn ny URL", man(13.sp, FontWeight.Bold, k.ink))
                }
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(k.card).tap("Oppdater nå") { st.refreshCal(c) }, contentAlignment = Alignment.Center) {
                    Tx("↻ Oppdater nå", man(13.sp, FontWeight.Bold, k.ink))
                }
            }
            Label("VIS OG VARSLE", Modifier.padding(horizontal = 6.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 4.dp)) {
                TogRow39("Vis i kalenderen", "", d.visible, true) { st.draft = d.copy(visible = !d.visible) }
                TogRow39("Vis i Glimt-brief", if (role == "h") "Bare fridager" else "", d.brief) { st.draft = d.copy(brief = !d.brief) }
                TogRow39("Varsel", Kal39.notifyText(c), d.notify) { st.draft = d.copy(notify = !d.notify) }
                if (role == "s") TogRow39("Farge per fag", "Hvert fag får sin farge", d.fag) { st.draft = d.copy(fag = !d.fag) }
            }
            st.err?.let { Tx(it, man(12.5.sp, FontWeight.Medium, k.acc), maxLines = 4) }
            if (Kal39.canRemove(c)) {
                if (st.confirmDel) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                    Tx("Fjerne «${c.n}»?", man(13.5.sp, FontWeight.Bold, k.ink))
                    LinePill("Avbryt", { st.confirmDel = false })
                    Box(Modifier.height(36.dp).clip(RoundedCornerShape(50)).background(Red).tap("Fjern") { vm.removeCal(c); st.closeEdit() }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Tx("Fjern", man(13.5.sp, FontWeight.Bold, Color.White))
                    }
                } else Tx("Fjern kalenderen", man(14.sp, FontWeight.Bold, Red), Modifier.align(Alignment.CenterHorizontally).tap("Fjern kalenderen") { Hap.tick(); st.confirmDel = true }.padding(10.dp))
            }
            Spacer(Modifier.height(24.dp))
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Swatches39(sel: Long, onPick: (Long) -> Unit) {
    val k = LocalK.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Kal39.PALETTE.forEach { col ->
            val on = (col and 0xFFFFFF) == (sel and 0xFFFFFF)
            Box(Modifier.size(42.dp).then(if (on) Modifier.border(2.dp, k.ink, CircleShape) else Modifier).padding(5.dp).clip(CircleShape).background(Color(col))
                .tap("Farge ${hexOut(col)}", Role.RadioButton) { Hap.tick(); onPick(col) })
        }
    }
}

@Composable
private fun SrcRow39(key: String, v: String, first: Boolean = false, mono: Boolean = false, link: Boolean = false, onClick: (() -> Unit)? = null) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).drawBehind { if (!first) drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .then(if (onClick != null) Modifier.tap(key) { Hap.tick(); onClick() } else Modifier),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Tx(key, man(15.sp, FontWeight.Medium, k.ink))
        Tx(v, (if (mono) mono(13.sp, k.ink) else man(14.sp, FontWeight.SemiBold, if (link) Red else k.ink)).copy(textAlign = TextAlign.End), Modifier.weight(1f).padding(start = 8.dp), maxLines = 1)
    }
}

@Composable
private fun TogRow39(n: String, sub: String, on: Boolean, first: Boolean = false, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).drawBehind { if (!first) drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .tap(n, Role.Switch) { Hap.tick(); onClick() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Tx(n, man(15.sp, FontWeight.Medium, k.ink))
            if (sub.isNotEmpty()) Tx(sub, man(12.sp, FontWeight.Medium, k.mut2))
        }
        Toggle(on)
    }
}

/* ---------------- 1c: Legg til ---------------- */

@Composable
fun CalAdd39Sheet(vm: KalVm) {
    val k = LocalK.current
    val st = vm.k39
    val clip = LocalClipboardManager.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(k.bg).tap(null) {}.imePadding()
            .padding(start = 18.dp, end = 18.dp, top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Grip() }
        Row(verticalAlignment = Alignment.Bottom) {
            Tx("Legg til kalender", news(28.sp, k.ink), Modifier.weight(1f))
            Tx("Avbryt", man(15.sp, FontWeight.SemiBold, k.mut), Modifier.tap("Avbryt") { st.closeAdd() }.padding(8.dp))
        }
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            AddOpt39("g", "Google-kalender", "Velg en kalender fra Google-kontoen din, f.eks. Personlig eller Bursdager.", "G", Color(0x244285F4), Color(0xFF2B5D8A), st.addMode == "g") { st.openGMap() }
            AddOpt39("url", "Abonner med URL", "iCal/webcal-lenke, f.eks. timeplanen fra skolen.", "⧉", Color(0x242F7A4F), Color(0xFF2F7A4F), st.addMode == "url") { st.addMode = "url"; st.err = null }
            if (st.addMode == "url") Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label("ICAL-ADRESSE")
                Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(k.bg).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
                    if (st.url.isEmpty()) Tx("webcal://tp.uio.no/ical?…", mono(13.sp, k.mut2))
                    BasicTextField(st.url, { st.url = it; st.preview = null }, Modifier.fillMaxWidth(), singleLine = true, cursorBrush = SolidColor(Red),
                        textStyle = mono(13.sp, k.ink), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                }
                Tx("Finnes i timeplanen på skolens side under «Abonner» eller «Eksporter til kalender». Lim inn, så henter vi navn og fag.", man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 4)
                st.preview?.let { p ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(k.chip).padding(10.dp)) {
                        Tx(p.name.ifEmpty { "Kalender" }, man(14.sp, FontWeight.Bold, k.ink))
                        Tx("${p.count} hendelser" + (if (p.subjects.isEmpty()) "" else " · " + p.subjects.take(5).joinToString(", ")), man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LinePill("Lim inn", { st.url = clip.getText()?.text?.trim().orEmpty(); st.preview = null }, h = 44.dp)
                    val label = when {
                        st.busy -> "Henter …"
                        st.preview == null -> "Hent"
                        st.schoolEmpty -> "Legg til Skole"
                        else -> "Legg til «${st.preview?.name ?: ""}»"
                    }
                    Box(Modifier.weight(1f)) { InkPill(label, { if (!st.busy && Kal39.validIcs(st.url)) st.urlAction() }, enabled = !st.busy && Kal39.validIcs(st.url), h = 44.dp) }
                }
            }
            AddOpt39("h", "Helligdager", "Fridager for Norge eller et annet land.", "★", k.chip, k.mut, st.addMode == "h") { st.addMode = "h"; st.err = null }
            if (st.addMode == "h") Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Label("LAND")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Kal39.COUNTRIES.forEach { (c, n) -> Chip(n, st.country == c, { st.country = c }) } }
                Tx("Fridager og merkedager vises som heldag. Beregnes i appen – ingen nett.", man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
                InkPill("Bruk ${Kal39.countryName(st.country)}", { st.useHolidays() }, h = 44.dp)
            }
            if (st.addMode == "own") Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Label("EGEN KALENDER")
                Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(k.bg).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
                    if (st.ownName.isEmpty()) Tx("Navn", man(15.sp, FontWeight.Medium, k.mut2))
                    BasicTextField(st.ownName, { st.ownName = it }, Modifier.fillMaxWidth(), singleLine = true, cursorBrush = SolidColor(Red), textStyle = man(15.sp, FontWeight.SemiBold, k.ink))
                }
                Swatches39(st.ownC) { st.ownC = it }
                InkPill("Lag kalenderen", { st.makeOwn() }, enabled = st.ownName.isNotBlank(), h = 44.dp)
            } else Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).tap("Lag en egen kalender") { Hap.tick(); st.addMode = "own" }, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Tx("Eller ", man(13.sp, FontWeight.Medium, k.mut2))
                Tx("lag en egen kalender", man(13.sp, FontWeight.Bold, k.ink))
                Tx(" som bare finnes i appen", man(13.sp, FontWeight.Medium, k.mut2))
            }
            st.err?.let { Tx(it, man(12.5.sp, FontWeight.Medium, k.acc), maxLines = 4) }
            Spacer(Modifier.height(20.dp))
        }
        Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
    }
}

@Composable
private fun AddOpt39(key: String, n: String, sub: String, g: String, ib: Color, ic: Color, sel: Boolean, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(k.card).border(2.dp, if (sel) k.ink else Color.Transparent, RoundedCornerShape(20.dp))
            .tap(n) { Hap.tick(); onClick() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(13.dp)).background(ib), contentAlignment = Alignment.Center) { Tx(g, man(16.sp, FontWeight.ExtraBold, ic)) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Tx(n, man(16.sp, FontWeight.Bold, k.ink))
            Tx(sub, man(13.sp, FontWeight.Medium, k.mut), maxLines = 3)
        }
        Tx("›", man(18.sp, FontWeight.Medium, k.mut2))
    }
}

/* ---------------- 1d (ark): Hvilken kalender er hva? ---------------- */

@Composable
fun GMap39Sheet(vm: KalVm) {
    val k = LocalK.current
    val st = vm.k39
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(k.bg).tap(null) {}.padding(start = 18.dp, end = 18.dp, top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Grip() }
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Tx("GOOGLE KALENDER", mono(10.5.sp, Red, .12f))
                Tx("Hvilken kalender er hva?", news(26.sp, k.ink))
            }
            Tx("Avbryt", man(15.sp, FontWeight.SemiBold, k.mut), Modifier.tap("Avbryt") { st.closeGMap() }.padding(8.dp))
        }
        Column(Modifier.heightIn(max = 600.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val m = st.gmap
            when {
                m == null -> Tx("Henter Google-kalendere …", man(13.sp, FontWeight.Medium, k.mut))
                !m.connected -> {
                    Tx(m.error ?: "Google er ikke koblet til ennå.", man(13.5.sp, FontWeight.Medium, k.mut), maxLines = 4)
                    InkPill("Koble til Google", { vm.googleLogin() }, h = 44.dp)
                }
                else -> {
                    if (m.email.isNotEmpty()) Tx(m.email, man(13.sp, FontWeight.SemiBold, k.mut))
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 4.dp)) {
                        m.calendars.forEachIndexed { i, g ->
                            Column(Modifier.fillMaxWidth().drawBehind { if (i > 0) drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Box(Modifier.size(12.dp).clip(CircleShape).background(Color(g.color)))
                                    Column {
                                        Tx(g.name, man(14.5.sp, FontWeight.Bold, k.ink))
                                        if (g.access.isNotEmpty()) Tx(g.access, man(12.sp, FontWeight.Medium, k.mut2))
                                    }
                                }
                                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(k.chip).padding(3.dp)) {
                                    listOf("p" to "Personlig", "b" to "Bursdager", "x" to "Ikke bruk").forEach { (r, n) ->
                                        val on = g.role == r
                                        Box(Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(8.dp)).background(if (on) (if (r == "x") k.card else k.ink) else Color.Transparent)
                                            .tap("${g.name}: $n", Role.RadioButton) { st.setRole(g.googleId, r) }, contentAlignment = Alignment.Center) {
                                            Tx(n, man(12.5.sp, FontWeight.Bold, if (on) (if (r == "x") k.ink else k.bg) else k.mut))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Label("SLIK BLIR DET I APPEN", Modifier.padding(top = 4.dp))
                    val pn = m.names("p")
                    val bn = m.names("b")
                    val sk = vm.cals.firstOrNull { Kal39.role(it) == "s" }
                    val hd = vm.cals.firstOrNull { Kal39.role(it) == "h" }
                    val surl = m.schoolUrl.ifEmpty { sk?.p39?.url.orEmpty() }
                    Sum39(vm.cals.firstOrNull { Kal39.role(it) == "p" }?.c ?: 0xFFB23A2A, "Personlig", if (pn.isEmpty()) "Ingen valgt" else pn.joinToString(" + ") + if (pn.size > 1) " · slått sammen" else "")
                    Sum39(vm.cals.firstOrNull { Kal39.role(it) == "b" }?.c ?: 0xFF8A3FA0, "Bursdager", if (bn.isEmpty()) "Ingen valgt" else bn.joinToString(" + "))
                    Sum39(sk?.c ?: 0xFF2F7A4F, "Skole", if (surl.isEmpty()) "Ingen URL ennå" else "Abonnement fra " + Kal39.host(surl))
                    Sum39(hd?.c ?: 0xFFA39D90, "Helligdager", Kal39.countryName(m.country) + " · innebygd")
                    Tx("Ikke brukt-kalendere hentes ikke. Nye hendelser du lager i appen havner i Personlig (din primære Google-kalender).", man(12.sp, FontWeight.Medium, k.mut2), maxLines = 4)
                    st.err?.let { Tx(it, man(12.5.sp, FontWeight.Medium, k.acc), maxLines = 4) }
                    InkPill(if (st.busy) "Lagrer …" else "Lagre", { if (!st.busy) st.saveGMap() }, enabled = !st.busy, h = 44.dp)
                }
            }
            Spacer(Modifier.height(20.dp))
        }
        Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
    }
}

@Composable
private fun Sum39(c: Long, n: String, s: String) {
    val k = LocalK.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(k.card).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.padding(top = 5.dp).size(10.dp).clip(CircleShape).background(Color(c)))
        Column {
            Tx(n, man(14.5.sp, FontWeight.Bold, k.ink))
            Tx(s, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
        }
    }
}
