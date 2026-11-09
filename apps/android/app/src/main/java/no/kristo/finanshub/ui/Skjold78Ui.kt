package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 78 (LEDAND): LED over hver skuff – UI. Tilstand og API i Skjold78.kt.
 *  - LocateButton78: «💡 Vis i skapet» på detaljsiden; RowLed78: 💡 i trefflista; HitsLed78: «Vis treffene i skapet» (maks 10).
 *  - LitBar78: «Lyser i skapet · 24 s igjen» med «Slå av» nederst på siden.
 *  - LedPill78 / StatusBadge78: «💡 LED» med statusprikk på skapsiden; DrawerLed78 i skuffkortet.
 *  - LedScreen78: LED-oppsett per skap (vert, farge, varighet, lysstyrke, blink, geometri, rader, test) og kalibreringsveiviseren.
 *  - LedSettings78: «Lys opp automatisk når jeg åpner et treff» og «Lys opp når Glimt svarer».
 */

private fun hexColor78(h: String): Color = runCatching { Color(android.graphics.Color.parseColor(normColor78(h) ?: LED_COLOR78)) }.getOrDefault(Color(0xFF2F6BFF))

/* ---------------- Vis i skapet ---------------- */

/** «💡 Vis i skapet» (detaljsiden). Uten LED på skapet: lenke til oppsettet. */
@Composable
internal fun LocateButton78(vm: AppViewModel, pt: SkjPart76) {
    val s = Skjold78
    val p = PaperPal.current
    if (!pt.loc.placed) return
    val cabId = pt.loc.cabinetId ?: return
    val l = s.leds[cabId]
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (ledReady78(l)) {
            val on = s.lit.any { (it.cabinetId == null || it.cabinetId == cabId) && it.row == pt.loc.row && it.col == pt.loc.col } && s.litUntil > 0
            PButton(if (s.locBusy) "Tenner …" else if (on) "💡 Lyser – slå av" else "💡 Vis i skapet", Modifier.fillMaxWidth().semantics { contentDescription = "Vis i skapet: lys opp skuffen" },
                kind = if (on) "line" else "ink") { if (on) vm.locateOff78() else if (!s.locBusy) vm.locateParts78(listOf(pt.id)) }
            l?.let { ledIndex78(it, pt.loc.row!!, pt.loc.col!!) }?.let {
                Text("LED $it over ${drawerText76(pt.loc.row!!, pt.loc.col!!)}", color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono)
            }
        } else Text("💡 Sett opp LED for skapet, så lyser skuffen når du søker ›", color = p.sub, fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button) { vm.openLeds78(cabId) }.padding(vertical = 8.dp))
        s.locErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
    }
}

/** 💡 i en rad i trefflista (bare når delen ligger i et skap med LED). */
@Composable
internal fun RowLed78(vm: AppViewModel, pt: SkjPart76) {
    val s = Skjold78
    val p = PaperPal.current
    if (!pt.loc.placed || !ledReady78(pt.loc.cabinetId?.let { s.leds[it] })) return
    val on = s.litUntil > 0 && s.lit.any { it.cabinetId == pt.loc.cabinetId && it.row == pt.loc.row && it.col == pt.loc.col }
    Box(Modifier.size(40.dp).clip(CircleShape).background(if (on) hexColor78(s.leds[pt.loc.cabinetId]?.color ?: LED_COLOR78).copy(alpha = .25f) else Color.Transparent)
        .clickable(role = Role.Button) { if (on) vm.locateOff78() else vm.locateParts78(listOf(pt.id)) }
        .semantics { contentDescription = if (on) "Slå av lyset" else "Vis ${pt.name} i skapet" }, contentAlignment = Alignment.Center) {
        Text("💡", fontSize = 17.sp, color = p.ink)
    }
}

/** «💡 Vis treffene i skapet (n)» over trefflista når det søkes. */
@Composable
internal fun HitsLed78(vm: AppViewModel) {
    val s6 = Skjold76
    val s = Skjold78
    if (s6.q.isBlank()) return
    val hits = locatable78(s6.items.orEmpty()) { ledReady78(s.leds[it]) }
    if (hits.size < 2) return
    PButton("💡 Vis treffene i skapet (${hits.size})", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { vm.locateParts78(hits.map { it.id }) }
}

/** Nedtelling og «Slå av» nederst mens skuffer lyser. */
@Composable
internal fun LitBar78(vm: AppViewModel, modifier: Modifier) {
    val s = Skjold78
    val p = PaperPal.current
    if (s.litUntil <= 0 || s.lit.isEmpty()) return
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(s.litUntil) {
        while (true) {
            now = System.currentTimeMillis()
            if (now >= s.litUntil) { s.lit = emptyList(); s.litUntil = 0L; break }
            delay(1_000)
        }
    }
    val secs = ((s.litUntil - now + 999) / 1000).coerceAtLeast(0)
    val col = hexColor78(s.lit.firstNotNullOfOrNull { l -> l.cabinetId?.let { s.leds[it]?.color } } ?: LED_COLOR78)
    Row(modifier.navigationBarsPadding().padding(16.dp).fillMaxWidth().widthIn(max = 560.dp).shadow(10.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp))
        .background(p.ink).padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(12.dp).clip(CircleShape).background(col))
        Column(Modifier.weight(1f)) {
            Text(litText78(s.lit.size, secs), color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(s.lit.take(3).joinToString(" · ") { short76(it.row, it.col) + (it.index?.let { i -> " (LED $i)" } ?: "") }, color = p.bg.copy(alpha = .7f), fontSize = 12.sp,
                fontFamily = PaperFonts.mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("Slå av", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
            modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape).border(1.dp, p.bg.copy(alpha = .5f), CircleShape).clickable(role = Role.Button) { vm.locateOff78() }.wrapContentHeight().padding(horizontal = 14.dp))
    }
}

/* ---------------- Skapsiden ---------------- */

/** «💡 LED» med statusprikk (grønn = WLED svarer). */
@Composable
internal fun LedPill78(vm: AppViewModel, cab: SkjCab76) {
    val s = Skjold78
    val p = PaperPal.current
    val st = s.status[cab.id]
    LaunchedEffect(cab.id) { if (ledReady78(s.leds[cab.id]) && st == null) vm.refreshStatus78(cab.id) }
    Row(Modifier.heightIn(min = 40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { vm.openLeds78(cab.id) }
        .semantics { contentDescription = "LED-oppsett. " + statusText78(st) }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (ledReady78(s.leds[cab.id])) Box(Modifier.size(8.dp).clip(CircleShape).background(if (st?.ok == true) Color(0xFF2E9D57) else if (st == null) p.mut else p.lab))
        Text("💡 LED", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    }
}

/** «💡 Lys opp skuffen» i skuffkortet. */
@Composable
internal fun DrawerLed78(vm: AppViewModel, cab: SkjCab76, r: Int, c: Int) {
    val s = Skjold78
    val p = PaperPal.current
    val l = s.leds[cab.id]
    if (!ledReady78(l)) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PButton("💡 Lys opp skuffen", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.locateDrawer78(cab.id, r, c) }
        ledIndex78(l!!, r, c)?.let { Text("LED $it", color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono) }
    }
}

/** Statusmerket: om WLED svarer. */
@Composable
internal fun StatusBadge78(vm: AppViewModel, cabId: String) {
    val s = Skjold78
    val p = PaperPal.current
    val st = s.status[cabId]
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (st?.ok == true) Color(0xFF2E9D57).copy(alpha = .14f) else p.surf2).padding(start = 12.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (st?.ok == true) Color(0xFF2E9D57) else if (st == null) p.mut else p.lab))
        Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
            Text(statusText78(st), color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            st?.version?.let { Text("WLED $it", color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono) }
        }
        if (s.statusBusy) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        Text("Sjekk", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
            .clickable(role = Role.Button) { vm.refreshStatus78(cabId) }.wrapContentHeight().padding(horizontal = 12.dp))
    }
}

/* ---------------- Innstillinger ---------------- */

@Composable
internal fun LedSettings78(vm: AppViewModel) {
    val s = Skjold78
    LaunchedEffect(Unit) { if (!s.settingsLoaded) vm.loadLedSettings78() }
    Toggle78("Lys opp automatisk når jeg åpner et treff", "Skuffen lyser når du åpner en del som ligger i et skap med LED.", s.autoOpen) { vm.putLedSettings78(autoOpen = it) }
    Toggle78("Lys opp når Glimt svarer", "«Hvor er M3-skruene?» tenner skuffen også.", s.autoGlimt) { vm.putLedSettings78(autoGlimt = it) }
}

@Composable
private fun Toggle78(t: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clickable(role = Role.Switch) { onChange(!on) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(t, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = p.mut, fontSize = 12.5.sp)
        }
        Switch(on, onChange)
    }
}

/* ---------------- LED-oppsett ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LedScreen78(vm: AppViewModel) {
    val s = Skjold78
    val p = PaperPal.current
    val d = s.draft
    val cab = Skjold76.cabinets.firstOrNull { it.id == d?.cabId }
    if (d == null || cab == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) }; return }
    val num = KeyboardOptions(keyboardType = KeyboardType.Decimal)
    val int = KeyboardOptions(keyboardType = KeyboardType.Number)
    val cur = draftLeds78(d)
    val dirty = cur != s.leds[cab.id]
    /** Test og kalibrering bruker det lagrede oppsettet: lagre først når noe er endret. */
    fun saved(then: () -> Unit) { if (dirty) vm.saveLeds78(then) else then() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(cab.name + " · ${cab.rows} rader × ${cab.cols} skuffer", color = p.mut, fontSize = 13.sp)
        StatusBadge78(vm, cab.id)
        if (s.calOn) { Calibrate78(vm, cab, cur); return@Column }
        PCard(shadow = true) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Toggle78("LED i dette skapet", "Adresserbar stripe over hver rad, styrt av WLED (ESP32).", d.enabled) { d.enabled = it }
                PField("WLED-adresse", d.host, { d.host = it.trim() }, placeholder = "192.168.1.50 eller wled-skap.local")
                if (d.host.isNotBlank() && !hostLocal78(d.host)) Text("Bare adresser i hjemmenettet virker (192.168.x.x, 10.x.x.x, 172.16–31.x.x, .local, .lan).", color = p.lab, fontSize = 12.5.sp)
                PLabel("Farge", p.mut, 10.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    LED_COLORS78.forEach { (hex, name) ->
                        val on = normColor78(d.color) == hex
                        Box(Modifier.size(40.dp).clip(CircleShape).border(if (on) 3.dp else 1.dp, if (on) p.ink else p.line, CircleShape).padding(5.dp).clip(CircleShape).background(hexColor78(hex))
                            .clickable(role = Role.RadioButton) { d.color = hex; Haptics.select() }.semantics { contentDescription = "Farge $name" })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PField("Farge (hex)", d.color, { d.color = it.take(7) }, Modifier.weight(1f), placeholder = LED_COLOR78)
                    PField("Lyser i (s)", d.duration, { d.duration = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), keyboard = int)
                }
                PLabel("Lysstyrke", p.mut, 10.sp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(32 to "Lav", 80 to "Middels", 128 to "Høy", 255 to "Maks").forEach { (v, t) -> PChip(t, d.brightness == v, "$v") { d.brightness = v } }
                }
                Toggle78("Blink", "Skuffen blinker i stedet for å lyse fast.", d.blink) { d.blink = it }
            }
        }
        PHead("Skuffene")
        Text("Midten av skuff n = midten av første skuff + (n − 1) × skuffavstand, målt fra venstre kant. Raaco: 300 mm / 5 = 60 mm, første skuff 30 mm.", color = p.mut, fontSize = 12.5.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PField("Skuffavstand (mm)", d.drawerPitch, { d.drawerPitch = it.take(7) }, Modifier.weight(1f), placeholder = num78(defPitch78(cab.kind)), keyboard = num)
            PField("Første skuff, midt (mm)", d.firstX, { d.firstX = it.take(7) }, Modifier.weight(1f), placeholder = "30", keyboard = num)
        }
        PField("LED-avstand (mm)", d.ledPitch, { d.ledPitch = it.take(7) }, placeholder = "16,667 (60 LED/m)", keyboard = num)
        PHead("Rader", "${ledTotal78(cur.rows)} LED")
        Text("Hver rad har sin del av stripa. 60 LED/m gir 16,67 mm mellom LED-ene. «Baklengs» når stripa går fra høyre mot venstre.", color = p.mut, fontSize = 12.5.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PChip("Fyll ut: serpentine", false) { fillRows78(d, cab, serpentine = true) }
            PChip("Fyll ut: samme retning", false) { fillRows78(d, cab, serpentine = false) }
        }
        d.rows.forEach { r -> LedRow78(vm, cab, r, int, num) { saved { vm.testLeds78(cab.id, "row", row = r.row) } } }
        PHead("Test")
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Test alle", Modifier.weight(1f), kind = "line", height = 44.dp) { saved { vm.testLeds78(cab.id, "all") } }
            PField("LED nr.", s.testIndex, { s.testIndex = it.filter(Char::isDigit).take(4) }, Modifier.weight(.7f), keyboard = int)
            PButton("Test LED", Modifier.weight(1f), kind = "line", height = 44.dp) { saved { vm.testLeds78(cab.id, "index", index = s.testIndex.toIntOrNull() ?: 0) } }
        }
        PHead("Kalibrering", if (d.overrides.isEmpty()) null else "${d.overrides.size} skuffer")
        Text("Én LED lyser om gangen. Trykk på skuffen som lyser, så husker Skjold Lab det. Bruk «Neste» for LED-er mellom skuffene.", color = p.mut, fontSize = 12.5.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("Start veiviseren", Modifier.weight(1f), kind = "line", height = 44.dp) { saved { vm.startCal78() } }
            if (d.overrides.isNotEmpty()) PButton("Fjern overstyringer", Modifier.weight(1f), kind = "line", height = 44.dp) { clearOverrides78() }
        }
        PHead("Lys opp")
        LedSettings78(vm)
        s.ledsErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        PButton(if (s.ledsBusy) "Lagrer …" else if (dirty) "Lagre" else "Lagret", Modifier.fillMaxWidth(), kind = if (dirty) "ink" else "line") { if (!s.ledsBusy) vm.saveLeds78() }
        Text("Se tools/skjoldlab-led/README.md for innkjøpsliste, kobling og WLED-oppsett.", color = p.mut, fontSize = 12.sp)
    }
}

@Composable
private fun LedRow78(vm: AppViewModel, cab: SkjCab76, r: SkjLedRowDraft78, int: KeyboardOptions, num: KeyboardOptions, onTest: () -> Unit) {
    val p = PaperPal.current
    PCard {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Rad ${r.row}", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                PChip(if (r.reverse) "← baklengs" else "fremover →", r.reverse) { r.reverse = !r.reverse }
                Text("Test", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.heightIn(min = 40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape)
                    .clickable(role = Role.Button) { onTest() }.wrapContentHeight().padding(horizontal = 12.dp).semantics { contentDescription = "Test rad ${r.row}" })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PField("Start", r.start, { r.start = it.filter(Char::isDigit).take(4) }, Modifier.weight(1f), keyboard = int)
                PField("Antall", r.count, { r.count = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), keyboard = int)
                PField("Pitch mm", r.pitch, { r.pitch = it.take(6) }, Modifier.weight(1f), keyboard = num)
                PField("Offset mm", r.offset, { r.offset = it.take(6) }, Modifier.weight(1f), keyboard = num)
            }
        }
    }
}

/** Veiviseren: «trykk på skuffen som lyser», forrige/neste LED. */
@Composable
private fun Calibrate78(vm: AppViewModel, cab: SkjCab76, cur: SkjLeds78) {
    val s = Skjold78
    val p = PaperPal.current
    val guess = remember(s.calIndex, cur) {
        (1..cab.rows).asSequence().flatMap { r -> (1..cab.cols).asSequence().map { c -> r to c } }.firstOrNull { (r, c) -> ledIndex78(cur, r, c) == s.calIndex }
    }
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PLabel("Kalibrering")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(14.dp).clip(CircleShape).background(hexColor78(cur.color)))
                PSerif("LED ${s.calIndex} lyser", 22.sp, modifier = Modifier.weight(1f))
                if (s.calBusy) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            }
            Text("Trykk på skuffen som lyser." + (guess?.let { " Beregnet: ${drawerText76(it.first, it.second)}." } ?: ""), color = p.sub, fontSize = 14.sp)
            if (s.calDone.isNotEmpty()) Text("Satt nå: " + s.calDone.entries.joinToString(" · ") { "${it.key} = ${it.value}" }, color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("‹ Forrige", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.calStep78(-1) }
                PButton("Neste ›", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.calStep78(1) }
            }
        }
    }
    CabView76(vm, cab, guess, maxH = 460.dp) { r, c -> vm.calPick78(r, c) }
    PButton("Ferdig", Modifier.fillMaxWidth()) { vm.stopCal78() }
}
