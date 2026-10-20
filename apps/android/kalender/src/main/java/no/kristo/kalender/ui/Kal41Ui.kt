package no.kristo.kalender.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate as rotateDraw
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.kalender.Hap
import no.kristo.kalender.KEv
import no.kristo.kalender.Kal41
import no.kristo.kalender.KalVm
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red
import no.kristo.kalender.reduceMotion

/*
 * Prompt 41 (Android Kalender): innloggingsskjermen uten serverfelt (auVals i Kalender App.dc.html), bursdagskortet i
 * hendelsesarket (R.dt.bd), svarkortet for søk med Glimt (sAi), «Send testvarsel» og banneret (notTest / ntBan).
 */

/* ---------------- Innlogging ---------------- */

@Composable
fun LoginScreen41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    LaunchedEffect(Unit) { s.loadWho() }
    val title = when (s.phase) { "wait" -> "Godkjenn i Homelab"; "err" -> "Fikk ikke logget inn"; else -> "Velkommen til Kalender" }
    val sub = when (s.phase) {
        "wait" -> "Homelab åpnes og spør om Kalender får logge inn. Du kommer tilbake hit av deg selv."
        "err" -> ""
        else -> "Bruk samme konto som i Homelab. Kalendere, bursdager og frister synkes med en gang."
    }
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically),
    ) {
        val T = no.kristo.kalender.today()
        Column(Modifier.size(84.dp).shadow(10.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(Color(0xFFFFFDF8)), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(24.dp).background(Red), contentAlignment = Alignment.Center) {
                Tx(no.kristo.kalender.WS[T.dayOfWeek.value % 7].uppercase(), man(11.sp, FontWeight.ExtraBold, Color.White))
            }
            Box(Modifier.fillMaxWidth().height(60.dp), contentAlignment = Alignment.Center) { Tx("${T.dayOfMonth}", news(40.sp, Color(0xFF1B1A17), 44.sp)) }
        }
        Column(Modifier.widthIn(max = 320.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Tx(title, news(30.sp, k.ink, 33.sp).copy(textAlign = TextAlign.Center), maxLines = 2)
            if (sub.isNotEmpty()) Tx(sub, man(14.5.sp, FontWeight.Medium, k.mut, 21.sp).copy(textAlign = TextAlign.Center), maxLines = 4)
        }
        Column(Modifier.widthIn(max = 340.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (s.phase) {
                "wait" -> Wait41(vm)
                "err" -> Err41(vm)
                "pw" -> Pw41(vm)
                else -> Start41(vm)
            }
        }
    }
}

@Composable
private fun Start41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    s.whoName?.let { n ->
        Row(
            Modifier.fillMaxWidth().height(62.dp).clip(RoundedCornerShape(20.dp)).background(k.ink).tap("Fortsett som $n") { s.quick() }.padding(start = 10.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(Red), contentAlignment = Alignment.Center) { Tx(n.take(1).uppercase(), man(15.sp, FontWeight.ExtraBold, Color.White)) }
            Column(Modifier.weight(1f)) {
                Tx("Fortsett som $n", man(15.5.sp, FontWeight.Bold, k.bg))
                Tx("Innlogget i Homelab på denne enheten", man(12.5.sp, FontWeight.Medium, k.bg.copy(alpha = .75f)))
            }
            Tx("›", man(18.sp, FontWeight.Bold, k.bg))
        }
    }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(26.dp)).tap("Logg inn med Homelab-appen") { s.viaApp() },
        contentAlignment = Alignment.Center) { Tx("Logg inn med Homelab-appen", man(14.5.sp, FontWeight.Bold, k.ink)) }
    Box(Modifier.fillMaxWidth().height(44.dp).tap("Bruk brukernavn og passord") { s.password() }, contentAlignment = Alignment.Center) {
        Tx("Bruk brukernavn og passord", man(13.5.sp, FontWeight.Bold, k.mut))
    }
}

@Composable
private fun Wait41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Spark(34.dp, true)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("Åpner Homelab", "Godkjenn i Homelab (Face ID / fingeravtrykk)", "Sender deg tilbake til Kalender", "Henter kalenderne dine").forEachIndexed { i, n ->
            val c = if (i <= s.step) k.ink else k.mut
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Tx(if (i < s.step) "✓" else if (i == s.step) "•" else "·", man(13.5.sp, FontWeight.Bold, c), Modifier.width(16.dp))
                Tx(n, man(13.5.sp, if (i == s.step) FontWeight.Bold else FontWeight.Medium, c))
            }
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp)).tap("Åpne Homelab igjen") { s.viaApp() }, contentAlignment = Alignment.Center) {
            Tx("Åpne Homelab igjen", man(13.5.sp, FontWeight.Bold, k.ink))
        }
        Box(Modifier.weight(1f).height(44.dp).tap("Avbryt") { s.cancel() }, contentAlignment = Alignment.Center) { Tx("Avbryt", man(13.5.sp, FontWeight.Bold, k.mut)) }
    }
}

@Composable
private fun Err41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).border(1.5.dp, Red, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 12.dp)) {
        Tx(s.err.ifBlank { "Homelab svarte ikke. Sjekk at Homelab-appen er installert og innlogget, og prøv igjen." }, man(13.5.sp, FontWeight.Medium, k.ink, 19.sp), maxLines = 6)
    }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.ink).tap("Prøv igjen") { s.viaApp() }, contentAlignment = Alignment.Center) {
        Tx("Prøv igjen", man(14.5.sp, FontWeight.Bold, k.bg))
    }
    if (s.webOffer) Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, k.line, RoundedCornerShape(22.dp)).tap("Godkjenn i nettleseren") { s.approveInBrowser() },
        contentAlignment = Alignment.Center) { Tx("Godkjenn i nettleseren", man(13.5.sp, FontWeight.Bold, k.ink)) }
    Box(Modifier.fillMaxWidth().height(44.dp).tap("Bruk brukernavn og passord") { s.password() }, contentAlignment = Alignment.Center) {
        Tx("Bruk brukernavn og passord", man(13.5.sp, FontWeight.Bold, k.mut))
    }
    if (s.offerServer) ServerFix41(vm)
}

@Composable
private fun Pw41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    Field41(vm.lUser, { vm.lUser = it }, "Brukernavn", KeyboardType.Text)
    Field41(vm.lPass, { vm.lPass = it }, "Passord", KeyboardType.Password, password = true)
    if (vm.lTotp) Field41(vm.lCode, { vm.lCode = it.filter(Char::isDigit).take(6) }, "6-sifret kode (2FA)", KeyboardType.NumberPassword)
    vm.lErr?.let { Tx(it, man(13.sp, FontWeight.SemiBold, k.acc), Modifier.fillMaxWidth(), maxLines = 4) }
    Box(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(26.dp)).background(k.ink).tap("Logg inn") { s.submitPassword() }, contentAlignment = Alignment.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (vm.lBusy) Spark(20.dp, true)
            Tx(if (vm.lBusy) "Logger inn …" else "Logg inn", man(14.5.sp, FontWeight.Bold, k.bg))
        }
    }
    if (s.offerServer) ServerFix41(vm)
    Box(Modifier.height(40.dp).tap("Tilbake") { Hap.tick(); vm.lErr = null; s.phase = "start" }, contentAlignment = Alignment.Center) {
        Tx("‹ Tilbake", man(13.sp, FontWeight.Bold, k.mut))
    }
}

/** «Endre serveradresse» – bare når ingen adresse svarer. */
@Composable
private fun ServerFix41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    if (!s.serverOpen) {
        Box(Modifier.height(36.dp).tap("Endre serveradresse") { Hap.tick(); s.serverOpen = true }, contentAlignment = Alignment.Center) {
            Tx("Endre serveradresse", man(13.sp, FontWeight.SemiBold, k.acc))
        }
        return
    }
    Field41(s.serverText, { s.serverText = it }, "https://home.kristo.no", KeyboardType.Uri)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LinePill("Avbryt", { s.serverOpen = false })
        InkPill("Lagre", { s.saveServer() })
    }
}

@Composable
private fun Field41(v: String, on: (String) -> Unit, hint: String, type: KeyboardType, password: Boolean = false) {
    val k = LocalK.current
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
        contentAlignment = Alignment.CenterStart) {
        if (v.isEmpty()) Tx(hint, man(15.sp, FontWeight.Medium, k.mut2))
        BasicTextField(v, on, Modifier.fillMaxWidth().semantics { contentDescription = hint }, textStyle = man(15.sp, FontWeight.Medium, k.ink), singleLine = true,
            cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(keyboardType = type, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None)
    }
}

/* ---------------- Bursdagskortet ---------------- */

private val CONF = listOf(Color(0xFFF2C14E), Color(0xFFFFFFFF), Color(0xFF3FBF9A), Color(0xFFA8D4FB), Color(0xFFFFD2C2))

@Composable
fun BdCard41(vm: KalVm, e: KEv, color: Color) {
    val s = vm.k41
    LaunchedEffect(e.id) { s.loadPeople() }
    val name = Kal41.bdName(e.t)
    val p = Kal41.match(name, s.people)
    LaunchedEffect(p?.id) { p?.let { s.loadPhoto(it) } }
    val (kicker, big, unit) = Kal41.counter(e.d)
    val isToday = e.d == no.kristo.kalender.today()
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(color)) {
        // 16 faste konfettibiter (gul, hvit, mint, lyseblå, fersken).
        Canvas(Modifier.matchParentSize()) {
            for (i in 0 until 16) {
                val w = (5 + Kal41.rr(i + 3) * 5).dp.toPx()
                val h = (8 + Kal41.rr(i + 4) * 6).dp.toPx()
                val x = (Kal41.rr(i) * size.width).toFloat()
                val y = (Kal41.rr(i + 9) * size.height).toFloat()
                val a = (Kal41.rr(i + 6) * 180).toFloat()
                rotateDraw(a, Offset(x, y)) {
                    if (Kal41.rr(i + 2) > .6) drawOval(CONF[i % CONF.size].copy(alpha = .9f), Offset(x - w / 2, y - h / 2), androidx.compose.ui.geometry.Size(w, h))
                    else drawRect(CONF[i % CONF.size].copy(alpha = .9f), Offset(x - w / 2, y - h / 2), androidx.compose.ui.geometry.Size(w, h))
                }
            }
        }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(64.dp)) {
                    Box(Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = .22f)).border(3.dp, Color.White.copy(alpha = .85f), CircleShape), contentAlignment = Alignment.Center) {
                        val img = p?.let { s.photos[it.id] }
                        if (img != null) Image(img, null, Modifier.size(64.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                        else Tx(name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase(), man(22.sp, FontWeight.ExtraBold, Color.White))
                    }
                    PartyHat41(Modifier.size(30.dp, 32.dp).offset(x = 34.dp, y = (-22).dp).rotate(18f))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Tx(kicker, mono(10.5.sp, Color.White.copy(alpha = .9f), .14f))
                    Tx(name, news(30.sp, Color.White, 32.sp), maxLines = 2)
                    Tx(Kal41.bdSub(e.d, p?.year), man(14.sp, FontWeight.Medium, Color.White.copy(alpha = .92f)), maxLines = 2)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Tx(big, news(if (isToday) 30.sp else 44.sp, Color.White, if (isToday) 32.sp else 46.sp, FontWeight.Normal))
                    if (unit.isNotEmpty()) Tx(unit, man(12.5.sp, FontWeight.Medium, Color.White.copy(alpha = .9f)))
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White).tap("Gratuler") { s.congratulate(name, p) }, contentAlignment = Alignment.Center) {
                    Tx("Gratuler", man(13.sp, FontWeight.Bold, Color(0xFF1B1A17)))
                }
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = .2f)).tap("Gaveidé") { s.gift(name, e.d) }, contentAlignment = Alignment.Center) {
                    Tx("Gaveidé", man(13.sp, FontWeight.Bold, Color.White))
                }
                Box(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White.copy(alpha = .2f)).tap("Bursdager") { s.openBirthdays(name, p) }, contentAlignment = Alignment.Center) {
                    Tx("Bursdager ›", man(13.sp, FontWeight.Bold, Color.White))
                }
            }
            if (isToday) Jenka41()
        }
    }
}

/** Festhatten (viewBox 60×62). */
@Composable
private fun PartyHat41(modifier: Modifier) {
    Canvas(modifier) {
        val sx = size.width / 60f
        val sy = size.height / 62f
        val cone = Path().apply { moveTo(8 * sx, 56 * sy); lineTo(30 * sx, 4 * sy); lineTo(52 * sx, 56 * sy); close() }
        drawPath(cone, Color(0xFF1B1A17))
        val y = Color(0xFFF2C14E)
        drawLine(y, Offset(14 * sx, 42 * sy), Offset(46 * sx, 42 * sy), 3 * sx)
        drawLine(y, Offset(19 * sx, 30 * sy), Offset(41 * sx, 30 * sy), 3 * sx)
        drawLine(y, Offset(24 * sx, 18 * sy), Offset(36 * sx, 18 * sy), 3 * sx)
        drawCircle(y, 5 * sx, Offset(30 * sx, 4 * sy))
    }
}

/** Jenka-toget på bursdagsdagen: Glimt-stjerner som hopper i takt langs bunnen av kortet. */
@Composable
private fun Jenka41() {
    val reduce = reduceMotion()
    val inf = androidx.compose.animation.core.rememberInfiniteTransition(label = "jenka")
    val t by inf.animateFloat(0f, 1f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(7000, easing = androidx.compose.animation.core.LinearEasing)), label = "t")
    BoxWithConstraints(Modifier.fillMaxWidth().height(28.dp)) {
        val w = maxWidth.value
        val head = if (reduce) w * .6f else (t * (w + 160f)) - 80f
        for (i in 0 until 5) {
            val hop = if (reduce) 0f else (kotlin.math.abs(kotlin.math.sin((t * 60f + i * .9f).toDouble())) * 6).toFloat()
            Box(Modifier.offset(x = (head - i * 22f).dp, y = (8f - hop).dp)) { Spark(16.dp, false) }
        }
    }
}

/* ---------------- Søk med Glimt ---------------- */

@Composable
fun GlimtButton41(vm: KalVm) {
    val k = LocalK.current
    val on = vm.k41.aiOn
    Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(if (on) Red else k.chip).tap("Søk med Glimt") { vm.k41.aiGo(vm.q) }.padding(horizontal = 11.dp),
        contentAlignment = Alignment.Center) { Tx("✦ Glimt", man(12.5.sp, FontWeight.ExtraBold, if (on) Color.White else k.ink)) }
}

@Composable
fun AiCard41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    if (!s.aiOn) return
    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(18.dp)).background(k.card).border(1.5.dp, Red, RoundedCornerShape(18.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(18.dp).clip(CircleShape).background(Red), contentAlignment = Alignment.Center) { Tx("✦", man(10.sp, FontWeight.Bold, Color.White)) }
            Tx("GLIMT · " + if (s.aiLocal) "UTEN AI" else "OLLAMA", mono(10.sp, Red, .14f))
        }
        if (s.aiBusy) Tx("Leser kalenderen din med Ollama …", man(14.sp, FontWeight.Medium, k.mut))
        else {
            Tx(s.aiText, man(14.5.sp, FontWeight.Medium, k.ink, 21.sp), maxLines = 6)
            s.aiHits.forEach { e ->
                val c = vm.evCal(e)
                Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min).tap(e.t) { vm.openEv(e) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.width(4.dp).height(34.dp).clip(RoundedCornerShape(2.dp)).background(c.col))
                    Column(Modifier.weight(1f)) {
                        Tx(Kal41.listTitle(e, c.n), man(14.sp, FontWeight.Bold, k.ink))
                        Tx(no.kristo.kalender.cap(no.kristo.kalender.WD[e.d.dayOfWeek.value % 7]) + " " + e.d.dayOfMonth + ". " + no.kristo.kalender.MN[e.d.monthValue - 1] +
                            if (e.all) " · hele dagen" else " · " + no.kristo.kalender.hm(e.s ?: 0), man(12.sp, FontWeight.Medium, k.mut))
                    }
                }
            }
        }
    }
}

/* ---------------- Testvarsel ---------------- */

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TestRow41(vm: KalVm) {
    val k = LocalK.current
    val s = vm.k41
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> s.permissionResult(ok) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(k.card).border(1.dp, k.line, RoundedCornerShape(16.dp))
                .combinedClickable(remember { MutableInteractionSource() }, indication = null, onClickLabel = "Send testvarsel", onLongClickLabel = "Send push fra serveren",
                    onLongClick = { s.pushTest() }, onClick = { s.test { runCatching { ask.launch(android.Manifest.permission.POST_NOTIFICATIONS) } } })
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Red), contentAlignment = Alignment.Center) {
                Svg("M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0", 17.dp, Color.White, 2.2f)
            }
            Column(Modifier.weight(1f)) {
                Tx("Send testvarsel", man(14.5.sp, FontWeight.Bold, k.ink))
                Tx("Kommer om 5 sekunder · lås skjermen for å se det", man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 2)
            }
            Tx("Test", man(13.sp, FontWeight.Bold, Red))
        }
        if (s.denied) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tx("Varsler er slått av for Kalender", man(13.sp, FontWeight.SemiBold, k.acc), Modifier.weight(1f), maxLines = 2)
            LinePill("Åpne Innstillinger", { s.openNotifSettings() }, h = 32.dp)
        }
        if (s.pushText.isNotEmpty()) Tx(s.pushText, man(12.5.sp, FontWeight.Medium, k.mut), maxLines = 2)
    }
}

/** Banneret når testvarselet kommer mens appen er åpen. */
@Composable
fun TestBanner41(vm: KalVm) {
    if (!vm.k41.banner) return
    Row(
        Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(start = 10.dp, end = 10.dp, top = 6.dp).fillMaxWidth()
            .shadow(16.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(Color(0xF5F5F0E6)).tap("Lukk") { vm.k41.banner = false }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.size(36.dp).clip(RoundedCornerShape(9.dp)).background(Color(0xFFFFFDF8)), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(11.dp).background(Red))
            Tx("${no.kristo.kalender.today().dayOfMonth}", news(18.sp, Color(0xFF1B1A17), 24.sp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row { Tx(Kal41.TEST_TITLE, man(12.sp, FontWeight.Bold, Color(0xFF1B1A17)), Modifier.weight(1f)); Tx("nå", man(12.sp, FontWeight.Medium, Color(0xFF6B665C))) }
            Tx("Tannlege kl. 17:30 · om 15 min", man(14.sp, FontWeight.Bold, Color(0xFF1B1A17)))
            Tx("Varsler virker.", man(13.sp, FontWeight.Medium, Color(0xFF3D3A33)))
        }
    }
}
