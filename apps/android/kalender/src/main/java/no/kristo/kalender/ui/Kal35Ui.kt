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

/*
 * Prompt 35 (KALAND35): zoom mellom visningene, sidemenyen «Kalendere» (farger, vis/skjul, skjul fra menyen, + iCal /
 * Home Assistant / konto) og Innstillinger-siden nederst i sidemenyen. Fasit: Kalender App.dc.html → zoomTo/zoomStep/kzIn/kzOut,
 * pinch i ts/tmv/te, calRows/ac, setOn/genRows/optRows/notRows/linkRows.
 */

/* ---------------- Zoom ---------------- */

/**
 * Visningen med zoom-animasjonen: den nye visningen vokser fra trykk-/klypepunktet (inn: scale .55 → 1, ut: 1.6 → 1, fade inn
 * på de første 60 %), 0,38 s cubic-bezier(.2,.8,.2,1). «Reduser bevegelse»: bare fade.
 * Pinch: to fingre som spres > 1,22× zoomer inn ett steg, klyp < 0,82× zoomer ut. Første berøring lukker tastaturet.
 */
@Composable
fun ZoomBox35(vm: KalVm, reduce: Boolean, onTouch: () -> Unit, modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val anim = remember { Animatable(1f) }
    LaunchedEffect(vm.zN) {
        if (vm.zN > 0) { anim.snapTo(0f); anim.animateTo(1f, tween(380, easing = EASE)) }
    }
    Box(
        modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                onTouch()
                if (size.width > 0 && size.height > 0) vm.zoomOrigin(down.position.x / size.width, down.position.y / size.height)
                var d0 = 0f
                var ratio = 1f
                var cx = 0f
                var cy = 0f
                var pinch = false
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    val pr = ev.changes.filter { it.pressed }
                    if (pr.size >= 2) {
                        val p1 = pr[0].position
                        val p2 = pr[1].position
                        val dist = (p1 - p2).getDistance()
                        if (!pinch) { pinch = true; d0 = dist } else if (d0 > 0f) ratio = dist / d0
                        cx = (p1.x + p2.x) / 2f
                        cy = (p1.y + p2.y) / 2f
                        // To fingre er zoom, ikke rulling eller sveip.
                        ev.changes.forEach { it.consume() }
                    }
                    if (ev.changes.none { it.pressed }) break
                }
                if (pinch && size.width > 0 && size.height > 0) {
                    vm.zoomOrigin(cx / size.width, cy / size.height)
                    if (ratio > 1.22f) vm.zoomStep("in") else if (ratio < .82f) vm.zoomStep("out")
                }
            }
        },
    ) {
        val p = anim.value
        val from = if (vm.zDir == "in") .55f else 1.6f
        Box(
            Modifier.fillMaxSize().graphicsLayer {
                alpha = (p / .6f).coerceIn(0f, 1f)
                if (!reduce) {
                    val sc = from + (1f - from) * p
                    scaleX = sc; scaleY = sc
                    transformOrigin = TransformOrigin(vm.zOx, vm.zOy)
                }
            },
            content = content,
        )
    }
}

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
                    Tx("Kalendere", news(28.sp, k.ink), Modifier.weight(1f))
                    InkPill("Ferdig", { Hap.dismiss(); vm.cs = false; vm.calEd = false; vm.pickC = null })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Label("MINE KALENDERE", Modifier.weight(1f))
                    Box(Modifier.heightIn(min = 44.dp).tap(if (ed) "Ferdig med å redigere" else "Rediger") { Hap.tick(); vm.calEd = !ed; vm.pickC = null }, contentAlignment = Alignment.Center) {
                        Tx(if (ed) "Ferdig" else "Rediger", man(13.sp, FontWeight.Bold, k.acc))
                    }
                }
                Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                    cals.filter { ed || vm.showHid || !it.hidMenu }.forEach { c -> CalRow35(vm, c, c.count ?: counts[c.id] ?: 0) }
                }
                if (!ed && hidN > 0) Box(Modifier.heightIn(min = 36.dp).tap("Vis skjulte") { Hap.tick(); vm.showHid = !vm.showHid }, contentAlignment = Alignment.CenterStart) {
                    Tx(if (vm.showHid) "Skjul skjulte ($hidN)" else "Vis skjulte ($hidN)", man(12.5.sp, FontWeight.Bold, k.mut))
                }
                // «+ Legg til kalender» (stiplet kant).
                Box(
                    Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).drawBehind {
                        drawRoundRect(k.line, cornerRadius = CornerRadius(22.dp.toPx()), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))))
                    }.tap("Legg til kalender") { vm.openAddCal() },
                    contentAlignment = Alignment.Center,
                ) { Tx("+ Legg til kalender", man(13.5.sp, FontWeight.Bold, k.ink)) }
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
                    Tx("Innstillinger", man(14.5.sp, FontWeight.Bold, k.ink))
                    Tx("Visning, utseende, varsler og Glimt", man(12.sp, FontWeight.Medium, k.mut))
                }
                Tx("›", man(16.sp, FontWeight.Bold, k.mut))
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
                        Tx(c.n, man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f, fill = false))
                        c.badge?.let { b ->
                            Box(Modifier.clip(RoundedCornerShape(50)).background(k.chip).padding(horizontal = 6.dp, vertical = 1.dp)) { Tx(b, mono(9.5.sp, k.mut).copy(fontWeight = FontWeight.Bold)) }
                        }
                    }
                    val pre = when (c.src) { "ha" -> "Home Assistant · "; "ical" -> "Abonnement · "; "google" -> "Google · "; "caldav" -> "iCloud · "; else -> "" }
                    Tx(if (hm) "Skjult fra menyen" else "$pre$n de neste 30 dagene", man(12.sp, FontWeight.Medium, k.mut))
                }
                if (!ed) Toggle(on && !hm)
            }
            if (ed) {
                Box(Modifier.height(44.dp).tap(if (hm) "Vis i menyen" else "Skjul fra menyen") { vm.setHidMenu(c, !hm) }, contentAlignment = Alignment.Center) {
                    Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).border(1.dp, k.line, RoundedCornerShape(15.dp)).padding(horizontal = 11.dp), contentAlignment = Alignment.Center) {
                        Tx(if (hm) "Vis i menyen" else "Skjul fra menyen", man(12.sp, FontWeight.Bold, k.ink))
                    }
                }
                if (c.removable) Box(Modifier.size(36.dp, 44.dp).tap("Fjern ${c.n}") { vm.removeCal(c) }, contentAlignment = Alignment.Center) {
                    Tx("×", man(18.sp, FontWeight.Bold, k.acc))
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
                    Tx(n, man(12.sp, FontWeight.Bold, if (on) k.bg else k.ink))
                }
            }
        }
        when (x.tab) {
            "ics" -> {
                Input35(x.url, { u -> vm.ac = x.copy(url = u, name = x.name.ifBlank { icalName35(u) }) }, "webcal://… eller https://…/kalender.ics", true)
                Input35(x.name, { vm.ac = x.copy(name = it) }, "Navn, f.eks. Fotballkamper", false)
                Tx("Abonnerer og oppdateres hver time. Fungerer med Google, iCloud, Outlook, skole (Visma/itslearning), lag og ligaer.", man(12.sp, FontWeight.Medium, k.mut, 16.sp), maxLines = 4)
            }
            "ha" -> {
                val l = x.ha
                when {
                    x.haBusy || l == null -> Tx("Henter kalendere fra Home Assistant …", man(12.sp, FontWeight.Medium, k.mut))
                    l.error != null -> Tx(l.error, man(12.sp, FontWeight.Medium, k.acc), maxLines = 4)
                    !l.connected -> Tx("Home Assistant er ikke koblet til. Legg inn adresse og langtids-token i Homelab → Innstillinger → Integrasjoner.", man(12.sp, FontWeight.Medium, k.mut, 16.sp), maxLines = 4)
                    else -> {
                        Tx("Home Assistant · ${l.entities.size} kalendere funnet", man(12.sp, FontWeight.Medium, k.mut))
                        l.entities.forEach { e ->
                            val sel = e.id in x.sel
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).background(k.card).border(1.5.dp, if (sel) k.ink else k.line, RoundedCornerShape(12.dp))
                                    .tap(e.name, Role.Checkbox) { if (!e.added) { Hap.tick(); vm.ac = x.copy(sel = if (sel) x.sel - e.id else x.sel + e.id) } }.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Tx(e.name, man(13.5.sp, FontWeight.Bold, k.ink))
                                    Tx(e.id + if (e.added) " · lagt til" else "", mono(11.sp, k.mut))
                                }
                                Tx(if (sel || e.added) "✓" else "", man(14.sp, FontWeight.ExtraBold, k.acc))
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
                        Tx(n, man(13.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                        Tx(sub, man(12.sp, FontWeight.SemiBold, k.mut))
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
                InkPill(if (x.busy) "Legger til …" else if (x.tab == "ha") "Legg til " + (if (n > 0) "$n " else "") + (if (n == 1) "kalender" else "kalendere") else "Abonner", { if (ok) vm.acSave() }, enabled = ok, padH = 16.dp, fs = 13.sp)
            }
        }
    }
}

@Composable
private fun Input35(v: String, on: (String) -> Unit, hint: String, url: Boolean) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
        val st = if (url) mono(13.5.sp, k.ink).copy(fontWeight = FontWeight.Medium) else man(14.sp, FontWeight.Medium, k.ink)
        if (v.isEmpty()) Tx(hint, st.copy(color = k.mut2))
        BasicTextField(v, on, Modifier.fillMaxWidth().semantics { contentDescription = hint }, textStyle = st, singleLine = true, cursorBrush = SolidColor(Red),
            keyboardOptions = KeyboardOptions(keyboardType = if (url) KeyboardType.Uri else KeyboardType.Text, autoCorrectEnabled = !url))
    }
}

/* ---------------- Innstillinger ---------------- */

/** Fullskjermside som glir inn fra høyre (0,28 s) med Ferdig. Valgene lagres i profilen og synkes (PUT …/calendars/prefs). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsPage35(vm: KalVm) {
    val k = LocalK.current
    Column(Modifier.fillMaxSize().background(k.bg).tap(null) {}) {
        Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Tx("Innstillinger", news(32.sp, k.ink), Modifier.weight(1f))
            InkPill("Ferdig", { vm.closeSettings() })
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Label("GENERELT", Modifier.padding(top = 4.dp))
            Seg35("Uken starter", "", listOf("mon" to "Mandag", "sun" to "Søndag"), if (vm.sun) "sun" else "mon") { vm.setWeekStart(it == "sun") }
            Seg35("Åpne i", "Visningen appen starter i", listOf("mnd" to "Måned", "uke" to "Uke", "3d" to "3 dager", "dag" to "Dag", "liste" to "Liste"), vm.ov) { vm.setOpenView(it) }
            Seg35("Standard varighet", "For nye hendelser med klokkeslett", listOf("30" to "30 min", "60" to "1 t", "90" to "1,5 t", "120" to "2 t"), vm.dd.toString()) { vm.setDefDur(it.toInt()) }
            Seg35("Tidslinje starter", "Uke, 3 dager og Dag", listOf("now" to "Nå", "06" to "06", "08" to "08"), vm.tl) { vm.setTlStart(it) }

            Label("VISNING", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                OptRow("Ukenummer", "Vises i måned og uke", vm.sw) { vm.setWeekNo(!vm.sw) }
                OptRow("Vær", "Oslo · MET / Open-Meteo, 16 dager frem", vm.swx) { vm.setWx(!vm.swx) }
            }

            Label("UTSEENDE", Modifier.padding(top = 4.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.chip).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                listOf("system" to "System", "light" to "Lys", "dark" to "Mørk").forEach { (key, n) ->
                    val on = vm.th == key
                    Box(Modifier.weight(1f).height(36.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(50)) else Modifier).clip(RoundedCornerShape(50))
                        .background(if (on) k.card else Color.Transparent).tap(n, Role.RadioButton) { vm.setTheme(key) }, contentAlignment = Alignment.Center) {
                        Tx(n, man(12.5.sp, FontWeight.Bold, if (on) k.ink else k.mut))
                    }
                }
            }

            Label("STANDARDVARSEL FOR NYE HENDELSER", Modifier.padding(top = 4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                KREMS.forEach { (r, n) -> Chip(n, vm.drem == r, { vm.setDefRem(r) }) }
            }

            Label("VARSLER", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                OptRow("Bursdager", "Varsel kl. 09:00 samme dag", vm.nBd) { vm.setNotify("notifyBirthdays", !vm.nBd) }
                OptRow("Studiefrister", "3 dager og 1 dag før", vm.nFr) { vm.setNotify("notifyDeadlines", !vm.nFr) }
                OptRow("Glimt-brief", "Morgen og kveld (velg i Glimt)", vm.nBr) { vm.setNotify("notifyBrief", !vm.nBr) }
                OptRow("Reisetid", "Varsle når du må dra, basert på sted", vm.nTv) { vm.setNotify("travelTime", !vm.nTv) }
            }

            Label("GLIMT OG KONTO", Modifier.padding(top = 4.dp))
            Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
                LinkRow35("Glimt", "Figur, stemme og briefer") { vm.openGlimtSettings() }
                LinkRow35("Kontoer og synk", "Google, iCloud, Outlook, Home Assistant") { vm.openAccounts() }
                LinkRow35("Widgets", "Slik legger du til på Hjem- og låseskjerm") { Hap.tick(); vm.showToast("Hold inne på Hjem-skjermen → Widgets → Kalender") }
                LinkRow35("Om Kalender", "Versjon 1.0 · personvern") { Hap.tick(); vm.showToast("Kalender 1.0 · data ligger på hjemmeserveren din") }
            }

            Label("KONTO", Modifier.padding(top = 4.dp))
            val s = vm.session
            if (s != null) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Tx(s.name.ifBlank { s.username }, man(14.5.sp, FontWeight.Bold, k.ink))
                Tx(s.server.substringAfter("://") + if (s.via == "homelab") " · via Homelab-appen" else "", man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
                vm.syncErr?.let { Tx(it, man(12.sp, FontWeight.Medium, k.acc), maxLines = 3) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LinePill(if (vm.syncing) "Henter …" else "Oppdater", { Hap.tick(); vm.refresh() })
                LinePill("Logg ut", { vm.setOn = false; vm.logout() })
            }
            Tx("Kalender 1.0 · synket med Homelab " + syncAgo35(vm.data.at), man(12.sp, FontWeight.Medium, k.mut2).copy(textAlign = TextAlign.Center), Modifier.fillMaxWidth().padding(top = 8.dp))
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
            Tx(n, man(13.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
            if (sub.isNotEmpty()) Tx(sub, man(12.sp, FontWeight.Medium, k.mut))
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(k.chip).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            opts.forEach { (v, l) ->
                val on = v == cur
                Box(Modifier.weight(1f).height(36.dp).then(if (on) Modifier.shadow(1.5.dp, RoundedCornerShape(50)) else Modifier).clip(RoundedCornerShape(50))
                    .background(if (on) k.card else Color.Transparent).tap(l, Role.RadioButton) { if (!on) onPick(v) }.padding(horizontal = 4.dp), contentAlignment = Alignment.Center) {
                    Tx(l, man(12.sp, FontWeight.Bold, if (on) k.ink else k.mut))
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
            Tx(n, man(14.5.sp, FontWeight.Bold, k.ink))
            Tx(sub, man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Tx("›", man(16.sp, FontWeight.Bold, k.mut))
    }
}
