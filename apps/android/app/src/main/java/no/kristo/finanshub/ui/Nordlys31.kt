package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Prompt 31 (ANDROID31): System-siden «Nordlys OS» (Mobil Papir App.dc.html, side «nordlys»): ren visning uten bakgrunnsbilde,
 * bunnmeny eller skann. Papirfarget topp (128 dp) med ‹ Tilbake, «Programvareoppdatering» og «System». Hero-kortet med
 * nordlys-gradient og stort versjonstall, Programvareversjon + «Krev fingeravtrykk eller passord», punktlisten fra CHANGELOG,
 * og «Oppdater nå» fast helt nederst med fade (innholdet har 120 dp ekstra luft). Også: prøveperiode-arket og -kortet.
 */

private val BLUE31 = Color(0xFF2B5D8A)
private val GREEN31 = Color(0xFF2F7D4F)

@Composable
internal fun NordlysPage31(vm: AppViewModel) {
    val p = PaperPal.current
    val u = vm.p30.upd
    val s = vm.p31
    val ctx = LocalContext.current
    BackHandler { vm.closeNordlys31() }
    LaunchedEffect(Unit) { vm.loadNordlys31() }
    val avail = u.phase == "avail" || (u.available && u.phase == "none")
    val run = u.phase == "run"
    val done = u.phase == "done"
    val failed = u.phase == "failed"
    val nv = u.latest.ifBlank { u.current }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Toppen: papirfarget, mørk tekst, 128 dp.
            Column(Modifier.fillMaxWidth().height(128.dp).padding(start = 8.dp, end = 16.dp, top = 4.dp), verticalArrangement = Arrangement.SpaceBetween) {
                SheetButton30("Tilbake", "back") { vm.closeNordlys31() }
                Column(Modifier.padding(start = 8.dp, bottom = 10.dp)) {
                    PLabel("Programvareoppdatering")
                    PSerif("System", 34.sp, maxLines = 1)
                }
            }
            Column(
                Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // Prompt 36: Sherlock-Glimt flyr inn i kortet ved «Se etter» (ui/Glimt36.kt).
                val sher = vm.p36.sherOn
                Box(Modifier.fillMaxWidth().then(if (sher) Modifier.clip(RoundedCornerShape(26.dp)) else Modifier)) {
                    NordHero31(vm, nv, avail, run, done, failed)
                    if (sher) Sherlock36(vm, Modifier.align(Alignment.TopEnd))
                }
                // Programvareversjon og bryteren.
                Column(Modifier.fillMaxWidth().shadow(12.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                    .clip(RoundedCornerShape(22.dp)).background(p.card)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("Programvareversjon", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            val line = listOfNotNull(nv.ifBlank { "–" }, s.sha.takeIf { it.isNotBlank() }, if (done || !avail) null else sizeText31(s.sizeBytes)).joinToString(" · ")
                            Text(line, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        val inst = done || !avail
                        Text(if (inst) "Installert" else "Du har ${u.current.ifBlank { "–" }}", color = if (inst) GREEN31 else p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Box(Modifier.hl34(vm, "pw", 0.dp)) { // prompt 34: mål «pw»
                        NordToggle31("Krev fingeravtrykk eller passord",
                            if (s.reqPw) "Fingeravtrykk eller passord før oppdateringen starter" else "Av · oppdater med ett trykk", s.reqPw) { vm.setReqPw31(it) }
                    }
                    if (s.reqPw) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        NordToggle31("Bruk fingeravtrykk", if (s.bioOn) "Passordet ligger kryptert på denne telefonen" else "Av · skriv passordet hver gang", s.bioOn) { on ->
                            if (on) { s.bioAsk = true; s.bioErr = "" } else vm.clearBioPw31()
                        }
                    }
                }
                Text("Oppdateringen gjøres av updater-containeren på serveren. .env, data/ og proton/ røres ikke.", color = p.mut, fontFamily = PaperFonts.sans,
                    fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
                Column(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    val big = bigVer31(nv)
                    PSerif("Dette er Nordlys $big. ${s.tagline}", 22.sp)
                    Text("NYTT I ${nv.ifBlank { "–" }}" + (relDate31(s.relDate)?.let { " · $it" } ?: ""), color = p.lab, fontFamily = PaperFonts.mono,
                        fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
                    // Prompt 36: notatene for den nye versjonen (fallback fra /system/changelog når /system/version mangler dem).
                    LaunchedEffect(nv, u.notes.isEmpty()) { if (u.notes.isEmpty()) vm.loadLatestNotes36(nv) }
                    u.notes.ifEmpty { vm.p36.latestNotes }.filter { it.isNotBlank() && !Regex("^[^:]{1,30}:\\s*$").matches(it.trim()) }.ifEmpty { listOf("Feilrettinger og forbedringer.") }.forEach { n ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("•", color = p.lab, fontSize = 14.sp)
                            Text(n, color = p.ink, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 21.sp)
                        }
                    }
                    // Prompt 36: TIDLIGERE VERSJONER (én åpen om gangen, «Vis flere»).
                    NordHist36(vm, nv)
                    // Prompt 32: fra den gamle Oppdatering-siden (Installert · build, Kopier, Se etter oppdatering, Logg).
                    Spacer(Modifier.height(6.dp))
                    NordlysInstalled32b(vm)
                }
            }
        }
        // «Oppdater nå» fast nederst med fade fra bakgrunnen.
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(0f to p.bg.copy(alpha = 0f), .38f to p.bg, 1f to p.bg))
                .navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val label = when { run -> "Oppdaterer … ${u.pct} %"; done -> "Ferdig"; failed -> "Prøv igjen"; avail -> if (s.startBusy) "Starter …" else "Oppdater nå"; else -> "Du har siste versjon" }
            val bg = when { done -> GREEN31; avail || run || failed -> BLUE31; else -> Color(0xFFB0A998) }
            Hl34Bubble(vm, "upd") // prompt 34: «✦ Trykk her for å oppdatere» over knappen når AI-søket viser den
            Box(
                Modifier.widthIn(max = 520.dp).fillMaxWidth().height(54.dp).hl34(vm, "upd", 27.dp).alpha(if (run) .75f else 1f)
                    .shadow(16.dp, RoundedCornerShape(27.dp), ambientColor = BLUE31.copy(alpha = .6f), spotColor = BLUE31.copy(alpha = .6f))
                    .clip(RoundedCornerShape(27.dp)).background(bg)
                    .clickable(enabled = !run, role = Role.Button) {
                        when {
                            done -> vm.doneUpd30()
                            failed -> vm.startUpd31(ctx, u.action)
                            avail -> vm.startUpd31(ctx, "start")
                            else -> vm.check36()
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Text(label, color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1) }
            Text(
                when { run -> "Du kan bruke appen mens den oppdateres."; done -> "Endringene er aktive i appen og på web."; failed -> u.error.ifBlank { "Noe gikk galt under oppdateringen." }
                    avail -> "Tar backup først · ca. 2 minutter"; else -> "Sist sjekket nå" },
                color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 2,
            )
        }
    }
    if (s.bioAsk) BioPwDialog31(vm)
    if (u.pwFor != null) UpdPwSheet30(vm)
}

private fun relDate31(v: String): String? = runCatching { LocalDate.parse(v.take(10)) }.getOrNull()?.let { "%02d.%02d.%d".format(it.dayOfMonth, it.monthValue, it.year) }

/** Hero-kortet: nordlys-gradient på mørk natt-bunn, «4.22» med gradient-tekst, status, NordlysOS og «Se etter». */
@Composable
private fun NordHero31(vm: AppViewModel, nv: String, avail: Boolean, run: Boolean, done: Boolean, failed: Boolean) {
    val u = vm.p30.upd
    val s = vm.p31
    val violet = Color(0xFF9864D6)
    val green = Color(0xFF2CBF8E)
    val warm = Color(0xFFD5493A)
    Column(
        Modifier.fillMaxWidth().heightIn(min = 300.dp)
            .shadow(18.dp, RoundedCornerShape(26.dp), ambientColor = Color(0xFF101A2E).copy(alpha = .7f), spotColor = Color(0xFF101A2E).copy(alpha = .7f))
            .clip(RoundedCornerShape(26.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF101A2E), Color(0xFF1B2340)), Offset.Zero, Offset(600f, 1100f)))
            .drawBehind {
                val w = size.width; val h = size.height
                drawRect(Brush.radialGradient(listOf(violet.copy(alpha = .95f), Color.Transparent), Offset(w * .9f, 0f), w * .75f))
                drawRect(Brush.radialGradient(listOf(green.copy(alpha = .9f), Color.Transparent), Offset(0f, h), w * .7f))
                drawRect(Brush.radialGradient(listOf(warm.copy(alpha = .85f), Color.Transparent), Offset(w, h), w * .5f))
                // To tynne buer for dybde.
                rotate(-18f, Offset(w * .7f, h * .3f)) {
                    drawOval(Color.White.copy(alpha = .16f), Offset(w * .15f, -h * .2f), Size(w * 1.1f, h * 1.2f), style = Stroke(1.5.dp.toPx()))
                    drawOval(Color.White.copy(alpha = .1f), Offset(w * .35f, -h * .05f), Size(w * .9f, h), style = Stroke(1.dp.toPx()))
                }
            }
            .padding(22.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                bigVer31(nv), modifier = Modifier.weight(1f), maxLines = 1,
                style = TextStyle(
                    brush = Brush.verticalGradient(0f to Color.White, .45f to Color(0xFFFFD9C2), 1f to Color(0xFFFF8A5C)),
                    fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 104.sp, lineHeight = 90.sp, letterSpacing = (-4).sp,
                ),
            )
            Box(
                Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = .12f)).border(1.dp, Color.White.copy(alpha = .3f), RoundedCornerShape(16.dp))
                    .clickable(enabled = !run, role = Role.Button) { vm.check36() }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (s.checking) "Ser etter …" else "Se etter", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1) }
        }
        Spacer(Modifier.height(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                when { run -> "Oppdaterer …"; done -> "Oppdatert"; failed -> "Oppdateringen feilet"; s.checking -> "Ser etter oppdatering …"; avail -> "Oppdatering tilgjengelig"; else -> "Du har siste versjon" },
                color = Color.White.copy(alpha = .88f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 16.sp,
            )
            val name = s.osName.removeSuffix(" OS").ifBlank { "Nordlys" }
            Text(buildAnnotatedString { append(name); withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = Color.White.copy(alpha = .75f))) { append("OS") } },
                color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 36.sp, lineHeight = 38.sp, letterSpacing = (-.7).sp)
            Text("Homelab · " + vm.base.substringAfter("://").substringBefore('/').ifBlank { "home.kristo.no" }, color = Color.White.copy(alpha = .75f),
                fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
            if (run) {
                val f by animateFloatAsState(u.pct.coerceIn(0, 100) / 100f, tween(400), label = "nord31")
                Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    // Prompt 36: snekker-Glimt står på linja ved enden av fyllet og hamrer.
                    Carp36(vm, u.pct, 30.dp)
                    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = .22f))) {
                        Box(Modifier.fillMaxWidth(f).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(Color.White))
                    }
                    Row(Modifier.fillMaxWidth()) {
                        Text(u.stepText.ifBlank { "Starter …" }, color = Color.White.copy(alpha = .85f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
                        Text("${u.pct} %", color = Color.White.copy(alpha = .85f), fontFamily = PaperFonts.mono, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun NordToggle31(title: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Switch) { onChange(!on) }.padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(sub, color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (on) GREEN31 else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(22.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
        }
    }
}

/** «Bruk fingeravtrykk»: passordet én gang, kontrollert hos serveren og lagret kryptert. */
@Composable
private fun BioPwDialog31(vm: AppViewModel) {
    val s = vm.p31
    var pw by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!s.bioBusy) s.bioAsk = false },
        title = { Text("Bruk fingeravtrykk") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Skriv passordet ditt én gang. Det lagres kryptert på denne telefonen og brukes bare når fingeravtrykket godkjenner en oppdatering.", fontSize = 14.sp, lineHeight = 20.sp)
                val p = PaperPal.current
                BasicTextField(
                    pw, { pw = it; s.bioErr = "" }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { vm.saveBioPw31(pw) }),
                    textStyle = TextStyle(color = p.ink, fontSize = 17.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.lab),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(12.dp),
                )
                if (s.bioErr.isNotBlank()) Text(s.bioErr, color = p.lab, fontSize = 13.sp)
            }
        },
        confirmButton = { TextButton({ vm.saveBioPw31(pw) }, enabled = !s.bioBusy) { Text(if (s.bioBusy) "Sjekker …" else "Lagre") } },
        dismissButton = { TextButton({ s.bioAsk = false }) { Text("Avbryt") } },
    )
}

/* ======================= Gratis prøveperiode ======================= */

/** Arket «Prøveperiode» (Abonnement Legg til ark.dc.html): ✦ Skriv det med egne ord · felt · VARSLE MEG · forhåndsvisning · Lagre. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TrialForm31(vm: AppViewModel, done: () -> Unit) {
    val p = PaperPal.current
    val s = vm.p31
    val edge = Color(0xFFE4DDCF).let { if (p.bg.red < .5f) p.line else it }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.5.dp, p.lab, RoundedCornerShape(20.dp)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("✦ SKRIV DET MED EGNE ORD", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(
                    s.tai, { s.tai = it; s.trialErr = "" }, singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go), keyboardActions = KeyboardActions(onGo = { vm.fillTrial31() }),
                    textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 15.sp), cursorBrush = SolidColor(p.lab),
                    modifier = Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp)).background(p.bg).border(1.dp, edge, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp),
                    decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (s.tai.isEmpty()) Text("Viaplay gratis i 14 dager, påminn meg", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); inner() } },
                )
                Box(Modifier.height(44.dp).clip(RoundedCornerShape(12.dp)).background(p.ink).clickable(role = Role.Button) { vm.fillTrial31() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text("Fyll ut", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, edge, RoundedCornerShape(20.dp))) {
            TrialField31("Tjeneste", s.tn, "Viaplay", KeyboardType.Text, top = false) { s.tn = it }
            val dateText = s.te?.let { "%02d.%02d.%d".format(it.dayOfMonth, it.monthValue, it.year) } ?: ""
            var dtxt by remember(s.te) { mutableStateOf(dateText) }
            TrialField31("Prøven slutter", dtxt, "dd.mm.åååå", KeyboardType.Number) { v ->
                dtxt = v
                Regex("^(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?$").find(v.trim())?.let { m ->
                    val y = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()?.let { if (it < 100) 2000 + it else it } ?: LocalDate.now().year
                    runCatching { LocalDate.of(y, m.groupValues[2].toInt(), m.groupValues[1].toInt()) }.getOrNull()?.let { s.te = it }
                }
            }
            TrialField31("Pris etterpå", s.tp, "149 kr/mnd", KeyboardType.Text) { s.tp = it }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("VARSLE MEG", color = p.lab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp, modifier = Modifier.padding(horizontal = 4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(0 to "Samme dag", 1 to "1 dag før", 3 to "3 dager før", 7 to "1 uke før").forEach { (d, n) ->
                    val on = d in s.trem
                    Box(
                        Modifier.height(38.dp).clip(RoundedCornerShape(19.dp)).background(if (on) p.ink else Color.Transparent).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(19.dp))
                            .clickable(role = Role.Checkbox) { Haptics.select(); s.trem = if (on) s.trem - d else s.trem + d }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(n, color = if (on) p.bg else p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
                }
            }
        }
        // Forhåndsvisning av varselet.
        val first = s.trem.maxOrNull() ?: 0
        val end = s.te
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card.copy(alpha = .7f)).border(1.dp, edge, RoundedCornerShape(18.dp)).padding(14.dp, 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(p.ink), contentAlignment = Alignment.Center) {
                Text(vm.appName.take(1).uppercase(), color = p.bg, fontFamily = PaperFonts.serif, fontSize = 15.sp)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Row {
                    Text(vm.appName.uppercase(), color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
                    Text(end?.let { dShort31(it.minusDays(first.toLong())) + " 09:00" } ?: "", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp)
                }
                Text(s.tn.ifBlank { "Tjenesten" } + "-prøven " + when (first) { 0 -> "slutter i dag"; 1 -> "slutter i morgen"; else -> "slutter om $first dager" },
                    color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Avslutt før ${end?.let { dShort31(it) } ?: "sluttdato"} for å slippe ${s.tp.ifBlank { "å betale" }}. Trykk for å åpne oppsigelsessiden.",
                    color = p.sub, fontFamily = PaperFonts.sans, fontSize = 13.sp, lineHeight = 18.sp)
            }
        }
        if (s.trialErr.isNotBlank()) Text(s.trialErr, color = p.lab, fontFamily = PaperFonts.sans, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Box(
            Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(p.lab).clickable(role = Role.Button) { vm.saveTrial31(done) },
            contentAlignment = Alignment.Center,
        ) { Text(if (s.trialBusy) "Lagrer …" else "Lagre påminnelse", color = p.onLab, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
    }
}

@Composable
private fun TrialField31(label: String, value: String, ph: String, kb: KeyboardType, top: Boolean = true, onChange: (String) -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line.copy(alpha = .5f)))
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(label, color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.width(120.dp))
            BasicTextField(
                value, onChange, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = kb),
                textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, textAlign = TextAlign.End), cursorBrush = SolidColor(p.lab),
                modifier = Modifier.weight(1f).heightIn(min = 44.dp),
                decorationBox = { inner -> Box(Modifier.heightIn(min = 44.dp), contentAlignment = Alignment.CenterEnd) { if (value.isEmpty()) Text(ph, color = p.mut.copy(alpha = .7f), fontSize = 15.sp); inner() } },
            )
        }
    }
}

/** Subscription OS: aktive prøver med «Prøve · 12 dager igjen», Behold og Avslutt. */
@Composable
internal fun TrialsCard31(vm: AppViewModel, card: Color, fg: Color, mut: Color) {
    val ctx = LocalContext.current
    val l = vm.p31.trials.filter { it.status == "active" }
    if (l.isEmpty()) return
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("PRØVEPERIODER", color = Color(0xFFB23A2A), fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.4.sp)
        l.sortedBy { it.endsAt }.forEach { t ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(t.service, color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("Slutter ${dShort31(t.endsAt)}" + (t.priceAfter.takeIf { it.isNotBlank() }?.let { " · deretter $it" } ?: ""), color = mut, fontFamily = PaperFonts.sans, fontSize = 12.5.sp, maxLines = 1)
                }
                Box(Modifier.clip(CircleShape).background(Color(0xFFB23A2A).copy(alpha = .14f)).padding(horizontal = 9.dp, vertical = 3.dp)) {
                    Text(trialLeft31(t), color = Color(0xFFB23A2A), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.height(32.dp).clip(CircleShape).background(fg).clickable(role = Role.Button) { Haptics.select(); t.cancelUrl?.let { openLink(ctx, it) } ?: vm.flash("Fant ingen oppsigelsesside for ${t.service}") }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Avslutt nå", color = card, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                }
                Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, mut.copy(alpha = .5f), CircleShape).clickable(role = Role.Button) { Haptics.select(); vm.patchTrial31(t.id, "kept") }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Behold", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                }
                // Sagt opp: ingen flere varsler.
                Box(Modifier.height(32.dp).clip(CircleShape).border(1.dp, mut.copy(alpha = .5f), CircleShape).clickable(role = Role.Button) { Haptics.success(); vm.patchTrial31(t.id, "cancelled") }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Avsluttet ✓", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                }
            }
        }
    }
}

/** Innstillinger → Varsler: «AI-svar i bakgrunnen» (følger hovedbryteren). */
@Composable
internal fun AiBgToggle31(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadAiBg31() }
    val on = vm.notifyPrefs.on
    PToggle("AI-svar i bakgrunnen", if (on) "Får du svar mens du er ute av appen, kommer det som varsel" else "Slått av sammen med Varsler", vm.p31.aiBg && on, top = true) {
        if (on) vm.setAiBg31(it)
    }
}

