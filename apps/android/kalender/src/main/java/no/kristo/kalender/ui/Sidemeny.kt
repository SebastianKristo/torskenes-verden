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
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KCal
import no.kristo.kalender.KREMS
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.SWC35
import no.kristo.kalender.icalName35
import no.kristo.kalender.icalOk35

/* Sidemenyen «Kalendere» (prompt 35, KALAND35): farger, vis/skjul, skjul fra menyen og «+ Legg til kalender» (iCal,
 * Home Assistant, konto). Fasit: Kalender App.dc.html → calRows/ac. */

/* ---------------- Sidemenyen Kalendere ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Drawer(vm: KalVm) {
    val k = LocalK.current
    val w = LocalConfiguration.current.screenWidthDp.dp
    val T = no.kristo.kalender.today()
    val counts = remember(vm.all) { vm.all.filter { !it.d.isBefore(T) && !it.d.isAfter(T.plusDays(30)) }.groupingBy { it.cal }.eachCount() }
    val ed = vm.calEd
    val cals = vm.cals
    val hidN = cals.count { it.hidMenu }
    Box(Modifier.fillMaxHeight().width(minOf(w * .86f, 340.dp))) {
        Column(
            Modifier.fillMaxSize().shadow(20.dp, RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)).clip(RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)).background(k.card)
                .tap(null) {}.pointerInput(Unit) {
                    var acc = 0f
                    detectHorizontalDragGestures(onDragStart = { acc = 0f }, onDragEnd = { if (acc < -50.dp.toPx()) { Hap.dismiss(); vm.cs = false } }, onHorizontalDrag = { ch, a -> acc += a; ch.consume() })
                },
        ) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Går helt til toppen (dekker statuslinjen); innholdet starter under kamerahullet.
                Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Tx("Kalendere", news(KType.title2, k.ink), Modifier.weight(1f))
                    InkPill("Ferdig", { Hap.dismiss(); vm.cs = false; vm.calEd = false; vm.pickC = null })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Label("MINE KALENDERE", Modifier.weight(1f))
                    Box(Modifier.heightIn(min = 44.dp).tap(if (ed) "Ferdig med å redigere" else "Rediger") { Hap.tick(); vm.calEd = !ed; vm.pickC = null }, contentAlignment = Alignment.Center) {
                        Tx(if (ed) "Ferdig" else "Rediger", man(KType.subheadline, FontWeight.Bold, k.acc))
                    }
                }
                Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                    cals.filter { ed || vm.showHid || !it.hidMenu }.forEach { c -> CalRow35(vm, c, c.count ?: counts[c.id] ?: 0) }
                }
                if (!ed && hidN > 0) Box(Modifier.heightIn(min = 36.dp).tap("Vis skjulte") { Hap.tick(); vm.showHid = !vm.showHid }, contentAlignment = Alignment.CenterStart) {
                    Tx(if (vm.showHid) "Skjul skjulte ($hidN)" else "Vis skjulte ($hidN)", man(KType.footnote, FontWeight.Bold, k.mut))
                }
                // «+ Legg til kalender» (stiplet kant).
                Box(
                    Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).drawBehind {
                        drawRoundRect(k.line, cornerRadius = CornerRadius(22.dp.toPx()), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))))
                    }.tap("Legg til kalender") { vm.ac = null; vm.k39.openAdd() }, // Prompt 39: arket 1c
                    contentAlignment = Alignment.Center,
                ) { Tx("+ Legg til kalender", man(KType.subheadline, FontWeight.Bold, k.ink)) }
                if (vm.ac != null) AddCalPanel35(vm)
                Spacer(Modifier.height(8.dp))
            }
            // Innstillinger helt nederst (plassen over fylles av lista).
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp).drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
                    .tap("Innstillinger") { vm.openSettings() }.padding(top = 14.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(k.chip), contentAlignment = Alignment.Center) { Svg(Ic.GEAR, 17.dp, k.ink, 2.1f) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Tx("Innstillinger", man(KType.callout, FontWeight.Bold, k.ink))
                    Tx("Visning, utseende, varsler og Glimt", man(KType.footnote, FontWeight.Medium, k.mut))
                }
                Chevron(k.mut)
            }
            Spacer(Modifier.height(14.dp).windowInsetsPadding(WindowInsets.navigationBars))
        }
    }
}

/** Én kalender: fargeprikk (åpner fargevelgeren), navn med merke, antall, bryter – eller Skjul fra menyen / × i Rediger. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CalRow35(vm: KalVm, c: KCal, n: Int) {
    val k = LocalK.current
    val ed = vm.calEd
    val on = c.id !in vm.hid
    val hm = c.hidMenu
    Column(Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }) {
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(40.dp).tap("Velg farge for ${c.n}") { Hap.tick(); vm.pickC = if (vm.pickC == c.id) null else c.id }, contentAlignment = Alignment.Center) {
                Box(Modifier.size(16.dp).clip(CircleShape).border(2.5.dp, c.col, CircleShape).background(if (on && !hm) c.col else Color.Transparent))
            }
            Row(
                Modifier.weight(1f).heightIn(min = 44.dp).then(if (!ed) Modifier.tap(c.n, Role.Switch) { vm.toggleCal(c) } else Modifier),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.weight(1f).graphicsLayer { alpha = if (hm) .45f else 1f }, verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Tx(c.n, man(KType.callout, FontWeight.Bold, k.ink), Modifier.weight(1f, fill = false))
                        c.badge?.let { b ->
                            Box(Modifier.clip(RoundedCornerShape(50)).background(k.chip).padding(horizontal = 6.dp, vertical = 1.dp)) { Tx(b, mono(KType.caption, k.mut).copy(fontWeight = FontWeight.Bold)) }
                        }
                    }
                    // Prompt 44: Media-kalenderen (Sonarr/Radarr) – «Media · N de neste 30 dagene».
                    val pre = if (c.id == "media") "Media · " else when (c.src) { "ha" -> "Home Assistant · "; "ical" -> "Abonnement · "; "google" -> "Google · "; "caldav" -> "iCloud · "; else -> "" }
                    Tx(if (hm) "Skjult fra menyen" else "$pre$n de neste 30 dagene", man(KType.footnote, FontWeight.Medium, k.mut))
                }
                if (!ed) Toggle(on && !hm)
            }
            if (ed) {
                Box(Modifier.height(44.dp).tap(if (hm) "Vis i menyen" else "Skjul fra menyen") { vm.setHidMenu(c, !hm) }, contentAlignment = Alignment.Center) {
                    Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).border(1.dp, k.line, RoundedCornerShape(15.dp)).padding(horizontal = 11.dp), contentAlignment = Alignment.Center) {
                        Tx(if (hm) "Vis i menyen" else "Skjul fra menyen", man(KType.footnote, FontWeight.Bold, k.ink))
                    }
                }
                if (c.removable) Box(Modifier.size(48.dp).tap("Fjern ${c.n}") { vm.removeCal(c) }, contentAlignment = Alignment.Center) {
                    Svg(Ic.CLOSE, 15.dp, k.acc, 2.6f)
                }
            }
        }
        if (vm.pickC == c.id) FlowRow(Modifier.padding(start = 40.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SWC35.forEach { col -> Swatch35(col, col == c.c, 28.dp, k.card) { vm.pickColor(c, col) } }
        }
    }
}

/** Fargeprikk i velgeren; valgt farge har ring (0 0 0 2px bakgrunn, 0 0 0 4px fargen). 44 dp treffflate. */
@Composable
private fun Swatch35(col: Long, on: Boolean, d: Dp, gap: Color, onClick: () -> Unit) {
    Box(Modifier.size(maxOf(d + 8.dp, 36.dp)).tap("Farge", onClick = onClick), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(d + 8.dp).clip(CircleShape).background(if (on) Color(col) else Color.Transparent).padding(2.dp).clip(CircleShape).background(if (on) gap else Color.Transparent)
                .padding(2.dp).clip(CircleShape).background(Color(col)),
        )
    }
}

/** «+ Legg til kalender»: faner iCal-lenke · Home Assistant · Konto, farge og Abonner / Legg til N kalendere. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddCalPanel35(vm: KalVm) {
    val k = LocalK.current
    val x = vm.ac ?: return
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(k.chip).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.card).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            listOf("ics" to "iCal-lenke", "ha" to "Home Assistant", "acc" to "Konto").forEach { (t, n) ->
                val on = x.tab == t
                Box(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(50)).background(if (on) k.ink else Color.Transparent).tap(n, Role.Tab) { vm.acTab(t) }, contentAlignment = Alignment.Center) {
                    Tx(n, man(KType.footnote, FontWeight.Bold, if (on) k.bg else k.ink))
                }
            }
        }
        when (x.tab) {
            "ics" -> {
                Input35(x.url, { u -> vm.ac = x.copy(url = u, name = x.name.ifBlank { icalName35(u) }) }, "webcal://… eller https://…/kalender.ics", true)
                Input35(x.name, { vm.ac = x.copy(name = it) }, "Navn, f.eks. Fotballkamper", false)
                Tx("Abonnerer og oppdateres hver time. Fungerer med Google, iCloud, Outlook, skole (Visma/itslearning), lag og ligaer.", man(KType.footnote, FontWeight.Medium, k.mut, 16.sp), maxLines = 4)
            }
            "ha" -> {
                val l = x.ha
                when {
                    x.haBusy || l == null -> Tx("Henter kalendere fra Home Assistant …", man(KType.footnote, FontWeight.Medium, k.mut))
                    l.error != null -> Tx(l.error, man(KType.footnote, FontWeight.Medium, k.acc), maxLines = 4)
                    !l.connected -> Tx("Home Assistant er ikke koblet til. Legg inn adresse og langtids-token i Homelab → Innstillinger → Tilkoblinger.", man(KType.footnote, FontWeight.Medium, k.mut, 16.sp), maxLines = 4)
                    else -> {
                        Tx("Home Assistant · ${l.entities.size} kalendere funnet", man(KType.footnote, FontWeight.Medium, k.mut))
                        l.entities.forEach { e ->
                            val sel = e.id in x.sel
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(k.card).border(1.5.dp, if (sel) k.ink else k.line, RoundedCornerShape(12.dp))
                                    .tap(e.name, Role.Checkbox) { if (!e.added) { Hap.tick(); vm.ac = x.copy(sel = if (sel) x.sel - e.id else x.sel + e.id) } }.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Tx(e.name, man(KType.subheadline, FontWeight.Bold, k.ink))
                                    Tx(e.id + if (e.added) " · lagt til" else "", mono(KType.caption, k.mut))
                                }
                                Tx(if (sel || e.added) "✓" else "", man(KType.callout, FontWeight.ExtraBold, k.acc))
                            }
                        }
                    }
                }
            }
            else -> {
                Google36Panel(vm)
                listOf("iCloud" to "App-spesifikt passord", "Outlook / Microsoft 365" to "Koble til").forEach { (n, sub) ->
                    Row(
                        Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(12.dp)).tap(n) { vm.openAccount(n) }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Tx(n, man(KType.subheadline, FontWeight.Bold, k.ink), Modifier.weight(1f))
                        Tx(sub, man(KType.footnote, FontWeight.SemiBold, k.mut))
                    }
                }
            }
        }
        if (x.tab != "acc") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                SWC35.forEach { col -> Swatch35(col, col == x.c, 26.dp, k.chip) { Hap.tick(); vm.ac = x.copy(c = col) } }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            LinePill("Avbryt", { Hap.tick(); vm.ac = null })
            if (x.tab != "acc") {
                val ok = !x.busy && ((x.tab == "ics" && icalOk35(x.url) && x.name.isNotBlank()) || (x.tab == "ha" && x.sel.isNotEmpty()))
                val n = x.sel.size
                InkPill(if (x.busy) "Legger til …" else if (x.tab == "ha") "Legg til " + (if (n > 0) "$n " else "") + (if (n == 1) "kalender" else "kalendere") else "Abonner", { if (ok) vm.acSave() }, enabled = ok, padH = 16.dp, fs = KType.subheadline)
            }
        }
    }
}

@Composable
private fun Input35(v: String, on: (String) -> Unit, hint: String, url: Boolean) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
        val st = if (url) mono(KType.subheadline, k.ink).copy(fontWeight = FontWeight.Medium) else man(KType.callout, FontWeight.Medium, k.ink)
        if (v.isEmpty()) Tx(hint, st.copy(color = k.mut2))
        BasicTextField(v, on, Modifier.fillMaxWidth().semantics { contentDescription = hint }, textStyle = st, singleLine = true, cursorBrush = SolidColor(Red),
            keyboardOptions = KeyboardOptions(keyboardType = if (url) KeyboardType.Uri else KeyboardType.Text, autoCorrectEnabled = !url))
    }
}
