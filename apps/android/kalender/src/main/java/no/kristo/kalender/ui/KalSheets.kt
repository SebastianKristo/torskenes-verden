package no.kristo.kalender.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import no.kristo.kalender.Hap
import no.kristo.kalender.KREMS
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.WTXT
import no.kristo.kalender.dl
import no.kristo.kalender.hm
import no.kristo.kalender.wkd

/* Prompt 33: arkene (hendelse, ny hendelse), sidemenyen Kalendere og innloggingen. */

/** Felles arkramme: card-bakgrunn, radius 28 28 0 0, skygge, håndtak og plass til gestlinjen. */
@Composable
private fun SheetFrame(maxFrac: Float = .9f, behindIme: Boolean = false, content: @Composable () -> Unit) {
    val k = LocalK.current
    val h = LocalConfiguration.current.screenHeightDp.dp
    // Prompt 37 (Ny hendelse): arket går helt ned bak tastaturet og krymper ikke. Innholdet får padding = tastatur + 16 dp,
    // og arket kan bli nesten fullhøyde (100 % − 40 dp), så det aldri synes dimming rundt tastaturet.
    val imeH = WindowInsets.ime.getBottom(LocalDensity.current)
    val kbOn = behindIme && imeH > 0
    val outer = Modifier.fillMaxWidth().heightIn(max = if (kbOn) h - 40.dp else h * maxFrac).shadow(24.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
        .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(k.card).tap(null) {}
    Column(
        (if (behindIme) outer else outer.imePadding())
            .verticalScroll(rememberScrollState()).padding(start = 18.dp, end = 18.dp, top = 10.dp)
            .windowInsetsPadding(if (behindIme) WindowInsets.ime.union(WindowInsets.navigationBars) else WindowInsets.navigationBars),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Grip() }
        content()
        Spacer(Modifier.height(if (kbOn) 16.dp else 20.dp))
    }
}

@Composable
private fun InfoRow(label: String, content: @Composable () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Tx(label, man(14.sp, FontWeight.Medium, k.mut))
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { content() }
    }
}

/* ---------------- Hendelsen ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailSheet(vm: KalVm) {
    val k = LocalK.current
    val e = vm.find(vm.det) ?: return
    val c = vm.evCal(e)
    val wx = if (vm.swx) vm.data.wx[e.d] else null
    SheetFrame {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dot(c.col, 10.dp)
            Spacer(Modifier.width(6.dp))
            Tx(c.n, man(13.sp, FontWeight.Bold, c.fg(k)), Modifier.weight(1f))
            // Prompt 44: Rediger ved siden av Ferdig (ikke helligdager, trekk, Media og bursdager fra kontakter).
            if (vm.canEdit44(e)) { LinePill("Rediger", { vm.edit44(e) }); Spacer(Modifier.width(8.dp)) }
            InkPill("Ferdig", { vm.closeDet() })
        }
        // Prompt 42: trekk fra Abonnementer – eget innhold, ikke redigerbart (Endres i Finans → Abonnementer).
        if (e.ab != null) { AbDetail42(vm, e); return@SheetFrame }
        // Prompt 41: bursdager får eget kort (konfetti, avatar med festhatt, nedtelling, Gratuler · Gaveidé · Bursdager ›).
        if (no.kristo.kalender.Kal41.isBirthday(e, c.n)) BdCard41(vm, e, c.col) else Tx(e.t, news(28.sp, k.ink, 31.sp), maxLines = 4)
        Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }) {
            InfoRow("Når") {
                Tx(longDate(e.d) + if (e.all) (if (e.days > 1) " · ${e.days} dager" else " · hele dagen") else " · " + hm(e.s ?: 0) + "–" + hm(e.e ?: 0),
                    man(14.sp, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.End), maxLines = 2)
            }
            e.loc?.let { InfoRow("Sted") { Tx(it, man(14.sp, FontWeight.Bold, k.ink).copy(textAlign = TextAlign.End), maxLines = 2) } }
            // Prompt 37: kart med pin, full adresse, «Åpne i Kart» og «Veibeskrivelse ›».
            if (e.loc != null || e.lat != null) DetailMap37(vm, e)
            if (wx != null) InfoRow("Vær") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    WxIcon(wx, 16.dp)
                    Tx(WTXT[wkd(wx.c)] + " · ${wx.hi}° / ${wx.lo}°", man(14.sp, FontWeight.Bold, k.ink))
                }
            }
            e.src?.let { InfoRow("Lagt til av Glimt") { Tx("«$it»", man(14.sp, FontWeight.Medium, k.mut).copy(fontStyle = FontStyle.Italic, textAlign = TextAlign.End), maxLines = 3) } }
            if (!e.editable) InfoRow("Kilde") { Tx("Skrivebeskyttet kalender", man(14.sp, FontWeight.Medium, k.mut)) }
        }
        // Prompt 44: Media-utgivelse (status fra Media, «Åpne i Media») og deltakere.
        if (e.x44?.media == true) MediaInfo44(e)
        e.x44?.att?.let { AttList44(it) }
        FagPick37(vm, e)
        if (!e.all) {
            Label("VARSEL")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                KREMS.forEach { (r, n) -> Chip(n, e.rem == r, { vm.setRem(e, r) }) }
            }
        }
        if (e.editable || e.pending) Box(Modifier.height(44.dp).tap("Slett hendelse") { vm.delete(e) }, contentAlignment = Alignment.CenterStart) {
            Tx("Slett hendelse", man(14.sp, FontWeight.Bold, k.acc))
        }
        if (no.kristo.kalender.Kal41.isBirthday(e, c.n) && no.kristo.kalender.Kal41.fromGoogle(e))
            Tx("«Slett» fjerner bare bursdagen fra Kalender-visningen. Den ligger fortsatt i Google Kontakter.", man(12.sp, FontWeight.Medium, k.mut), maxLines = 3)
    }
}

/* ---------------- Ny hendelse ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewSheet(vm: KalVm) {
    val k = LocalK.current
    val f = vm.nf ?: return
    val ctx = LocalContext.current
    val fr = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { fr.requestFocus() } }
    val ok = f.t.isNotBlank()
    SheetFrame(behindIme = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // Prompt 44: Rediger åpner samme ark med «Rediger» og «Lagre». Avbryt går tilbake til detaljarket.
            LinePill("Avbryt", { val back = f.editId; vm.closeNew(); if (back != null) vm.det = back })
            Tx(if (f.editId != null) "Rediger" else "Ny hendelse", news(22.sp, k.ink).copy(textAlign = TextAlign.Center), Modifier.weight(1f))
            InkPill(if (f.editId != null) "Lagre" else "Legg til", { vm.saveForm44() }, enabled = ok)
        }
        Field(f.t, { vm.nf = vm.nf?.copy(t = it) }, "Tittel", news(24.sp, k.ink), 50, Modifier.focusRequester(fr))
        // Prompt 44: «Sted eller adresse» med forslag (Kartverket).
        AddrField44(vm, f)
        Column(Modifier.drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }) {
            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).tap("Hele dagen", Role.Switch) { Hap.tick(); vm.nf = f.copy(all = !f.all) }.padding(vertical = 10.dp, horizontal = 2.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Tx("Hele dagen", man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                Toggle(f.all)
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx("Dato", man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                PickBox(dl(f.d)) {
                    DatePickerDialog(ctx, { _, y, m, d -> vm.nf = vm.nf?.copy(d = java.time.LocalDate.of(y, m + 1, d)) }, f.d.year, f.d.monthValue - 1, f.d.dayOfMonth).show()
                }
            }
            if (!f.all) Row(Modifier.fillMaxWidth().padding(vertical = 8.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Tx("Fra – til", man(14.5.sp, FontWeight.Bold, k.ink), Modifier.weight(1f))
                PickBox(hm(f.s), mono = true) { TimePickerDialog(ctx, { _, h, m -> vm.nfStart(h * 60 + m) }, f.s / 60, f.s % 60, true).show() }
                Tx("  –  ", man(14.sp, FontWeight.Medium, k.mut2))
                PickBox(hm(f.e), mono = true) { TimePickerDialog(ctx, { _, h, m -> vm.nf = vm.nf?.copy(e = h * 60 + m) }, f.e / 60, f.e % 60, true).show() }
            }
        }
        Label("KALENDER")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            vm.cals.filter { it.writable && !it.hidMenu }.forEach { c -> Chip(c.n, f.cal == c.id, { Hap.tick(); vm.nf = f.copy(cal = c.id) }, dot = c.col) }
        }
        if (!f.all) {
            Label("VARSEL")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                KREMS.forEach { (r, n) -> Chip(n, f.rem == r, { Hap.tick(); vm.nf = f.copy(rem = r) }) }
            }
        }
        // Prompt 44: DELTAKERE (brukere i appen og e-post til andre).
        People44(vm, f)
        if (f.editId == null) Tx("Tips: skriv heller i feltet nederst, f.eks. «frisør 14.30 25.10», så fyller Glimt ut alt.", man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 3)
    }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, hint: String, style: TextStyle, h: Int, modifier: Modifier = Modifier) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(h.dp).drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(horizontal = 2.dp),
        contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Tx(hint, style.copy(color = k.mut2))
        BasicTextField(value, onChange, modifier.fillMaxWidth().semantics { contentDescription = hint }, textStyle = style, singleLine = true, cursorBrush = SolidColor(Red))
    }
}

@Composable
private fun PickBox(text: String, mono: Boolean = false, onClick: () -> Unit) {
    val k = LocalK.current
    Box(Modifier.height(44.dp).tap(text, onClick = onClick), contentAlignment = Alignment.Center) {
        Box(Modifier.height(36.dp).clip(RoundedCornerShape(10.dp)).background(k.chip).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
            Tx(text, if (mono) mono(14.sp, k.ink) else man(14.sp, FontWeight.SemiBold, k.ink))
        }
    }
}

/* ---------------- Sidemenyen Kalendere: se Kal35Ui.kt (prompt 35) ---------------- */

@Composable
fun OptRow(n: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val k = LocalK.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).tap(n, Role.Switch, onClick).drawBehind { drawLine(k.line2, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Tx(n, man(14.5.sp, FontWeight.Bold, k.ink))
            Tx(sub, man(12.sp, FontWeight.Medium, k.mut), maxLines = 2)
        }
        Toggle(on)
    }
}

/** Egen kalender (SERVER33 POST /api/kalender/calendars {name, color}). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewCalendarDialog(vm: KalVm) {
    val k = LocalK.current
    var name by remember { mutableStateOf("") }
    val pal = listOf(0xFFB23A2A, 0xFF2B5D8A, 0xFF2F7A4F, 0xFFA8661A, 0xFF3D7F8A, 0xFF8A3FA0, 0xFF5C5850, 0xFFC0562A)
    var col by remember { mutableLongStateOf(pal[1]) }
    Dialog(onDismissRequest = { vm.newCal = false }) {
        Column(Modifier.clip(RoundedCornerShape(24.dp)).background(k.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Tx("Ny kalender", news(22.sp, k.ink))
            Field(name, { name = it }, "Navn", man(16.sp, FontWeight.Medium, k.ink), 44)
            Label("FARGE")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                pal.forEach { c ->
                    Box(Modifier.size(44.dp).tap("Farge") { col = c }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(Color(c)).border(if (col == c) 3.dp else 0.dp, k.ink, CircleShape))
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LinePill("Avbryt", { vm.newCal = false })
                Spacer(Modifier.weight(1f))
                InkPill("Legg til", { if (name.isNotBlank()) vm.createCalendar(name, col) }, enabled = name.isNotBlank())
            }
        }
    }
}

/* ---------------- Innlogging ---------------- */

@Composable
fun LoginScreen(vm: KalVm) {
    val k = LocalK.current
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        // Ikonet: rød topp med ukedag, dato i Newsreader.
        val T = no.kristo.kalender.today()
        Column(Modifier.size(72.dp).shadow(6.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(k.card), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(20.dp).background(Red), contentAlignment = Alignment.Center) { Tx(no.kristo.kalender.WS[T.dayOfWeek.value % 7].uppercase(), mono(9.sp, Color.White, .1f)) }
            Tx("${T.dayOfMonth}", news(34.sp, k.ink, 48.sp))
        }
        Tx("Kalender", news(34.sp, k.ink))
        Tx("Samme konto og samme kalendere som Homelab. Logg inn med Homelab-appen, eller med serveradresse, brukernavn og passord.", man(14.sp, FontWeight.Medium, k.mut, 20.sp), maxLines = 5)
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).background(if (vm.homelab) k.ink else k.mut2)
                .tap("Logg inn med Homelab-appen") { vm.loginHomelab() }, contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (vm.hlBusy) Spark(20.dp, true)
                Tx(if (vm.hlBusy) "Spør Homelab-appen …" else "Logg inn med Homelab-appen", man(15.sp, FontWeight.Bold, k.bg))
            }
        }
        if (!vm.homelab) Tx("Homelab-appen er ikke installert på denne telefonen.", man(12.5.sp, FontWeight.Medium, k.mut2), maxLines = 2)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(k.line))
            Tx("  eller  ", man(12.sp, FontWeight.Medium, k.mut2))
            Box(Modifier.weight(1f).height(1.dp).background(k.line))
        }
        LoginField(vm.lServer, { vm.lServer = it }, "Serveradresse (f.eks. 192.168.1.10:4100)", KeyboardType.Uri)
        LoginField(vm.lUser, { vm.lUser = it }, "Brukernavn", KeyboardType.Text)
        LoginField(vm.lPass, { vm.lPass = it }, "Passord", KeyboardType.Password, password = true)
        if (vm.lTotp) LoginField(vm.lCode, { vm.lCode = it.filter(Char::isDigit).take(6) }, "6-sifret kode (2FA)", KeyboardType.NumberPassword)
        vm.lErr?.let { Tx(it, man(13.sp, FontWeight.SemiBold, k.acc), maxLines = 4) }
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).border(1.dp, k.line, RoundedCornerShape(25.dp)).tap("Logg inn") { vm.login() },
            contentAlignment = Alignment.Center,
        ) { Tx(if (vm.lBusy) "Logger inn …" else "Logg inn", man(15.sp, FontWeight.Bold, k.ink)) }
    }
}

@Composable
private fun LoginField(v: String, on: (String) -> Unit, hint: String, type: KeyboardType, password: Boolean = false) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart) {
        if (v.isEmpty()) Tx(hint, man(15.sp, FontWeight.Medium, k.mut2))
        BasicTextField(v, on, Modifier.fillMaxWidth().widthIn(min = 40.dp).semantics { contentDescription = hint }, textStyle = man(15.sp, FontWeight.Medium, k.ink), singleLine = true,
            cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(keyboardType = type, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
    }
}
