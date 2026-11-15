package no.kristo.kalender.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import no.kristo.kalender.Hap
import no.kristo.kalender.KCal
import no.kristo.kalender.KREMS
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.SWC35
import no.kristo.kalender.icalName35
import no.kristo.kalender.icalOk35
import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Kal46Guard
import no.kristo.kalender.Kal46Prefs
import no.kristo.kalender.Kal46Qr
import no.kristo.kalender.Kal46Rask
import no.kristo.kalender.setPref46

/* Innstillinger-siden nederst i sidemenyen (prompt 35, KALAND35) og STANDARDKALENDER (prompt 46).
 * Fasit: Kalender App.dc.html → setOn/genRows/optRows/notRows/linkRows. */

/* ---------------- Innstillinger ---------------- */

/** Fullskjermside som glir inn fra høyre (0,28 s) med Ferdig. Valgene lagres i profilen og synkes (PUT …/calendars/prefs). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsPage35(vm: KalVm) {
    val k = LocalK.current
    // Prompt 47: Innstillinger → Server (ekstern/lokal med standardverdier).
    var srv47 by remember { androidx.compose.runtime.mutableStateOf(false) }
    if (srv47) ServerDialog47(onClose = { srv47 = false })
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Tx("Innstillinger", news(KType.title2, k.ink), Modifier.weight(1f))
            InkPill("Ferdig", { vm.closeSettings() })
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // Prompt 39: Kalendere (1a) – fire kalendere, rediger og legg til.
            Label("KALENDERE", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                LinkRow35("Kalendere", vm.cals.take(4).joinToString(", ") { it.n }) { vm.k39.open() }
            }
            // Prompt 46: standardkalenderen for «+», rask time og Glimt.
            DefCal46(vm)
            Label("GENERELT", Modifier.padding(top = 4.dp))
            Seg35("Uken starter", "", listOf("mon" to "Mandag", "sun" to "Søndag"), if (vm.sun) "sun" else "mon") { vm.setWeekStart(it == "sun") }
            Seg35("Åpne i", "Visningen appen starter i", listOf("mnd" to "Måned", "uke" to "Uke", "3d" to "3 dager", "dag" to "Dag", "liste" to "Liste"), vm.ov) { vm.setOpenView(it) }
            Seg35("Standard varighet", "For nye hendelser med klokkeslett", listOf("30" to "30 min", "60" to "1 t", "90" to "1,5 t", "120" to "2 t"), vm.dd.toString()) { vm.setDefDur(it.toInt()) }
            Seg35("Tidslinje starter", "Uke, 3 dager og Dag", listOf("now" to "Nå", "06" to "06", "08" to "08"), vm.tl) { vm.setTlStart(it) }
            // Prompt 43: per enhet (Fold, nettbrett ≥ 600 dp), ikke i profilen.
            Seg35("Oppsett på iPad og Fold", "Når skjermen er bred", listOf("tlf" to "Telefon", "delt" to "Delt", "full" to "Full skjerm"), vm.k43.wideLay) { vm.k43.choose(it) }

            Label("VISNING", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                OptRow("Ukenummer", "Vises i måned og uke", vm.sw) { vm.setWeekNo(!vm.sw) }
                OptRow("Vær", "Oslo · MET / Open-Meteo, 16 dager frem", vm.swx) { vm.setWx(!vm.swx) }
            }

            // Prompt 70: Widgets – kalendere som tas med, «Skjul fullførte i dag» og «Legg til widget».
            Label("WIDGETS", Modifier.padding(top = 4.dp))
            Widgets70Section(vm)

            // Prompt 37: Kalendere → Studie → Fag (egen farge per fag; trykk gir fargevelger).
            Label("STUDIE · FAG", Modifier.padding(top = 4.dp))
            FagSettings37(vm)

            Label("UTSEENDE", Modifier.padding(top = 4.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.chip).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                listOf("system" to "System", "light" to "Lys", "dark" to "Mørk").forEach { (key, n) ->
                    val on = vm.th == key
                    Box(Modifier.weight(1f).height(36.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(50)) else Modifier).clip(RoundedCornerShape(50))
                        .background(if (on) k.card else Color.Transparent).tap(n, Role.RadioButton) { vm.setTheme(key) }, contentAlignment = Alignment.Center) {
                        Tx(n, man(KType.footnote, FontWeight.Bold, if (on) k.ink else k.mut))
                    }
                }
            }

            Label("STANDARDVARSEL FOR NYE HENDELSER", Modifier.padding(top = 4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                KREMS.forEach { (r, n) -> Chip(n, vm.drem == r, { vm.setDefRem(r) }) }
            }

            Label("VARSLER", Modifier.padding(top = 4.dp))
            // Prompt 41: «Send testvarsel» øverst (lang-trykk = push fra serveren).
            TestRow41(vm)
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                OptRow("Bursdager", "Varsel kl. 09:00 samme dag", vm.nBd) { vm.setNotify("notifyBirthdays", !vm.nBd) }
                OptRow("Studiefrister", "3 dager og 1 dag før", vm.nFr) { vm.setNotify("notifyDeadlines", !vm.nFr) }
                // Prompt 42: trekk fra Finans → Abonnementer (standard: prøveperioder 2 d og 1 d før, årlige 7 d før).
                val app42 = vm.getApplication<android.app.Application>()
                Box(Modifier.padding(vertical = 10.dp)) {
                    Seg35("Abonnementer", "Trekk fra Finans", listOf("off" to "Av", "day" to "Dagen før", "special" to "Prøve og årlige"), no.kristo.kalender.Ab42.mode(app42)) {
                        Hap.tick()
                        no.kristo.kalender.Ab42.setMode(app42, it)
                        runCatching { no.kristo.kalender.KalNotify.reschedule(app42) }
                    }
                }
                OptRow("Glimt-brief", "Morgen og kveld (velg i Glimt)", vm.nBr) { vm.setNotify("notifyBrief", !vm.nBr) }
                OptRow("Reisetid", "Varsle når du må dra, basert på sted", vm.nTv) { vm.setNotify("travelTime", !vm.nTv) }
            }

            // Prompt 51: nye enheter som venter på godkjenning (Godkjenn med fingeravtrykk/PIN · Avvis) og «Nytt i denne versjonen».
            Label("SIKKERHET", Modifier.padding(top = 4.dp))
            Sec51Section(vm)
            Label("GLIMT OG KONTO", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                // Prompt 41: Server (lesbar, endres i Homelab) og Logg ut øverst.
                LinkRow35("Server", no.kristo.kalender.Kal41.summary(vm.getApplication())) { Hap.tick(); srv47 = true }
                LinkRow35("Logg ut", "Logg inn igjen med Homelab-appen") { Hap.tick(); vm.setOn = false; vm.logout() }
                LinkRow35("Glimt", "Figur, stemme og briefer") { vm.openGlimtSettings() }
                // Prompt 46: godkjenn QR-koden en annen enhet viser (fingeravtrykk/PIN først).
                ScanRow46(vm)
                LinkRow35("Kontoer og synk", "Google, iCloud, Outlook, Home Assistant") { vm.openAccounts() }
                // Prompt 43: oppdater Kalender fra appen (APK fra GitHub-releasen via serveren, SHA-256 og samme signatur).
                LinkRow35("Programvareoppdatering", updSub43(vm.getApplication())) { Hap.tick(); no.kristo.kalender.Kal43Upd.pageOpen = true }
                LinkRow35("Om Kalender", "Versjon 1.0 · personvern") { Hap.tick(); vm.showToast("Kalender 1.0 · data ligger på hjemmeserveren din") }
            }

            Label("KONTO", Modifier.padding(top = 4.dp))
            val s = vm.session
            if (s != null) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Tx(s.name.ifBlank { s.username }, man(KType.callout, FontWeight.Bold, k.ink))
                Tx(s.server.substringAfter("://") + if (s.via == "homelab") " · via Homelab-appen" else "", man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 2)
                vm.syncErr?.let { Tx(it, man(KType.footnote, FontWeight.Medium, k.acc), maxLines = 3) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LinePill(if (vm.syncing) "Henter …" else "Oppdater", { Hap.tick(); vm.refresh() })
            }
            Tx("Kalender 1.0 · synket med Homelab " + syncAgo35(vm.data.at), man(KType.footnote, FontWeight.Medium, k.mut2).copy(textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(top = 8.dp))
            Spacer(Modifier.height(30.dp).windowInsetsPadding(WindowInsets.navigationBars))
        }
    }
}

private fun syncAgo35(at: Long): String {
    if (at <= 0) return "aldri"
    val min = ((System.currentTimeMillis() - at) / 60_000).toInt()
    return when {
        min < 2 -> "nå"
        min < 60 -> "for $min min siden"
        else -> "kl. " + java.time.Instant.ofEpochMilli(at).atZone(no.kristo.kalender.OSLO).let { "%02d:%02d".format(it.hour, it.minute) }
    }
}

/** Segmentvalg (fasitens seg()): navn + undertekst, pille med valgene. */
@Composable
private fun Seg35(n: String, sub: String, opts: List<Pair<String, String>>, cur: String, onPick: (String) -> Unit) {
    val k = LocalK.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Tx(n, man(KType.subheadline, FontWeight.Bold, k.ink), Modifier.weight(1f))
            if (sub.isNotEmpty()) Tx(sub, man(KType.footnote, FontWeight.Medium, k.mut))
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.chip).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            opts.forEach { (v, l) ->
                val on = v == cur
                Box(Modifier.weight(1f).height(36.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(50)) else Modifier).clip(RoundedCornerShape(50))
                    .background(if (on) k.card else Color.Transparent).tap(l, Role.RadioButton) { if (!on) onPick(v) }.padding(horizontal = 4.dp), contentAlignment = Alignment.Center) {
                    Tx(l, man(KType.footnote, FontWeight.Bold, if (on) k.ink else k.mut))
                }
            }
        }
    }
}

@Composable
private fun LinkRow35(n: String, sub: String, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(n, onClick = onClick).drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Tx(n, man(KType.callout, FontWeight.Bold, k.ink))
            Tx(sub, man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Chevron(k.mut)
    }
}

/** Innstillinger → STANDARDKALENDER (skrivbare kalendere, lagres i profilen). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DefCal46(vm: KalVm) {
    val k = LocalK.current
    val ctx = vm.getApplication<android.app.Application>()
    var pref by remember { mutableStateOf(Kal46Prefs.defCal(ctx)) }
    val cur = Kal46Prefs.pick(vm.cals, pref)
    Label("STANDARDKALENDER", Modifier.padding(top = 4.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        vm.cals.filter { Kal46Prefs.usable(it) }.forEach { c ->
            Chip(c.n, cur == c.id, {
                Hap.tick()
                val sid = Kal46Prefs.serverId(vm.cals, c.id)
                Kal46Prefs.setDefCal(ctx, sid)
                pref = sid
                vm.setPref46("defaultCalendar", sid)
            }, dot = c.col)
        }
    }
    Tx("Nye hendelser fra «+», rask time og Glimt havner her, med mindre du nevner en annen kalender.", man(KType.footnote, FontWeight.Medium, k.mut), maxLines = 3)
}
