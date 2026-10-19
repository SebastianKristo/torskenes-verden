package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/*
 * Prompt 35 (ANDROID35): brief-siden med Glimt og vennene (Glimt Brief.dc.html mode page), ⚙-arket og Innstillinger → Glimt
 * (mode settings, claude-code-innst-glimt.md). Samme data begge steder (vm.p35.set).
 *  - Guide-runden: verten og vennene spretter inn (gbPop 0,45 s), boblen viser hvem som snakker (GLIMT / SKY / DRÅPE / UGLE / GRIS),
 *    opplesning via /api/tts med «▮▮▮ Sky snakker · Nora · Stopp», høyttaler-knapp i toppen og ⚙.
 *  - Nyheter: toppsak med bilde 16:9 + 6 saker med miniatyr 76 × 56. Abonnementer: rosa kort når en prøve slutter innen 7 dager.
 */

private val INK35 = Color(0xFF1B1A17)
private val RED35 = Color(0xFFB23A2A)
private val BLUE35 = Color(0xFF22476B)
private val OSLO35Z: ZoneId = ZoneId.of("Europe/Oslo")

/* ---------------- Brief-siden ---------------- */

@Composable
internal fun BriefPage35(vm: AppViewModel) {
    val s = vm.p34
    val g = vm.p35
    val p = PaperPal.current
    val ctx = LocalContext.current
    val dens = LocalDensity.current
    val life = LocalLifecycleOwner.current
    BackHandler { vm.stopSay35(); vm.closeBrief34() }
    // Lyd stopper når appen går i bakgrunnen og når siden lukkes.
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) vm.stopSay35() }
        life.lifecycle.addObserver(o)
        onDispose { life.lifecycle.removeObserver(o); vm.stopSay35() }
    }
    LaunchedEffect(Unit) {
        vm.loadGlimt35()
        vm.loadBrief34()
        vm.loadBible37()
        if (vm.p31.trials.isEmpty()) vm.loadTrials31()
        // Guide-runden starter automatisk første gang briefen åpnes («Vis meg rundt automatisk»).
        if (g.set.guide && !vm.tourWasSeen34()) { delay(900); if (s.tour == 0) { s.tour = 1; vm.tourSeen34() } }
    }
    val b = s.brief
    val set = g.set
    val en = set.lang == "en"
    val host = b?.host?.let { Fig35.norm(it) } ?: hostChar35(set.char)
    val steps = remember(b, set.friends, set.char, g.trialsDone) { b?.let { vm.guide35(it) } ?: emptyList() }
    LaunchedEffect(steps.size) { g.tourLen = steps.size }
    val scroll = rememberScrollState()
    val pos = remember { mutableStateMapOf<String, Float>() }
    val step = if (s.tour in 1..steps.size) s.tour - 1 else -1
    val cur = if (step >= 0) steps.getOrNull(step) else null
    val ch = cur?.let { if (set.friends) it.char else host } ?: host
    val curText = cur?.let { if (en) it.textEn ?: it.text else it.text }
    // Prompt 36: ringen starter først når scrollen til kortet er ferdig (så den ikke hopper).
    var ringOn by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(s.tour, s.tourSeq) {
        ringOn = null
        val c = cur ?: return@LaunchedEffect
        delay(60)
        c.target?.let { tg -> pos[tg]?.let { y -> scroll.animateScrollTo((y - with(dens) { 90.dp.toPx() }).toInt().coerceAtLeast(0)) } }
        ringOn = c.target
        delay(40)
        vm.say35(if (en) c.textEn ?: c.text else c.text, ch)
    }
    val ring = { k: String -> cur?.target == k && ringOn == k }
    val dark = Tone.paperDark
    val trials = vm.briefTrials35(b)
    // Prompt 36: fast bredde – flaten klipper, så figuren og boblen aldri gjør siden bredere.
    Box(Modifier.fillMaxSize().clipToBounds().background(if (dark) Brush.verticalGradient(listOf(p.bg, p.bg)) else Brush.verticalGradient(0f to Color(0xFFE6ECEF), .46f to p.bg))
        .clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scroll).statusBarsPadding().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 190.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val kind = b?.kind ?: briefKind35(set)
            // Prompt 38: tittelen og Ferdig på samme linje; 🔇 og ⚙ er fjernet (opplesning og brief-valg ligger i Innstillinger → Glimt).
            BriefTop35(vm, kind, host)
            if (g.speaking != null) SpeakingPill35(vm)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(b?.summary ?: if (s.briefBusy) "Glimt lager briefen …" else "Fikk ikke laget briefen.", color = if (dark) p.ink else Color(0xFF3D3A33),
                    fontFamily = PaperFonts.serif, fontSize = 17.sp, lineHeight = 24.5.sp)
            }
            if (b == null) return@Column
            // Prompt 37: hele Vær-kortet er trykkbart og åpner Vær over briefen (✕ går tilbake hit, på samme sted). Talen stoppes.
            b.wx?.let { w ->
                val src = remember { MutableInteractionSource() }
                val down by src.collectIsPressedAsState()
                Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["vaer"] = it.positionInParent().y }
                    .graphicsLayer { val k = if (down) .985f else 1f; scaleX = k; scaleY = k }
                    .clickable(src, null, role = Role.Button, onClickLabel = "Åpne Vær") { vm.stopSay35(); Haptics.tap(); vm.openWeather() }) { BriefWx35(w, ring("vaer")) }
            }
            // Prompt 37: dagens bibelvers i morgen- og kveldsbriefen (bare med modulen), øverst til det er lest eller sveipet bort på Hjem.
            val bibleTop = vm.bibleAllowed37() && !vm.bibleAtBottom37() && when (kind) { "morning" -> vm.p37.bibleSet.morning || vm.p37.bibleMissing; "evening", "night" -> vm.p37.bibleSet.evening || vm.p37.bibleMissing; else -> false }
            if (bibleTop) BriefBible37(vm, if (kind == "morning") "morning" else "evening")
            Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["kal"] = it.positionInParent().y }) { BriefKal35(vm, b, ring("kal")) }
            // Prompt 37: Gjøremål · 3 gjøremål i dag (forfalt + i dag), avkrysning i briefen.
            BriefTodos37(vm)
            if (trials.isNotEmpty()) Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["abo"] = it.positionInParent().y }) { BriefTrials35(vm, trials, ring("abo")) }
            // Prompt 38: Pakker, Familie, Skole og jobb, Bursdager og Nordlys i natt (etter Abonnementer, før Nyheter).
            BriefCards38(vm, kind)
            Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["nyh"] = it.positionInParent().y }) { BriefNews35(vm, b, ring("nyh")) }
            if (vm.bibleAllowed37() && vm.bibleAtBottom37()) BriefBible37(vm, biblePeriod37())
            Text("Laget av Glimt ${b.generatedAt ?: ""} · Vær: MET / Open-Meteo · Nyheter: ${b.news.map { it.src }.distinct().filter { it.isNotBlank() }.ifEmpty { listOf("NRK", "VG", "E24") }.take(4).joinToString(", ")}",
                color = p.mut, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            b.note?.let { Text(it, color = p.mut, fontSize = 11.5.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) }
        }
        // Figuren og boblen nederst til høyre.
        Row(
            Modifier.align(Alignment.BottomEnd).fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
        ) {
            AnimatedVisibility(cur != null, Modifier.weight(1f, fill = false), enter = fadeIn(tween(280)) + slideInVertically(tween(280)) { it / 6 }, exit = fadeOut(tween(160))) {
                var last by remember { mutableStateOf(cur) }
                var lastCh by remember { mutableStateOf(ch) }
                if (cur != null) { last = cur; lastCh = ch }
                val c = last ?: return@AnimatedVisibility
                val txt = if (en) c.textEn ?: c.text else c.text
                Column(
                    Modifier.widthIn(max = 290.dp).clip(RoundedCornerShape(18.dp, 18.dp, 4.dp, 18.dp)).background(INK35).padding(14.dp, 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(Fig35.who(lastCh), color = Fig35.whoColor(lastCh), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.4.sp)
                    Text(txt, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 20.sp)
                    Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (step in 1 until steps.size - 1) Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).clickable(role = Role.Button) { vm.tourSkip35() }.padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center) { Text(if (en) "Skip" else "Hopp over", color = Color(0xFFC9C1B1), fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                        Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { vm.stopSay35(); vm.tourNext35() }.padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center) { Text(actionLabel35(c.action, en), color = INK35, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1) }
                    }
                }
            }
            val h = LocalTime.now(OSLO35Z).hour
            val mood = when { cur != null -> "talk"; h >= 23 || h < 6 -> "sov"; else -> "idle" }
            Box(Modifier.clickable(remember { MutableInteractionSource() }, null, role = Role.Button, onClickLabel = "Glimt") {
                vm.stopSay35(); Haptics.tap(); s.tour = if (s.tour in 1..98) 99 else 1; s.tourSeq++
            }) { PopFig35(ch, 76.dp, mood) }
        }
    }
    if (g.cfgSheet) GlimtSheet35(vm)
}

private fun actionLabel35(a: String, en: Boolean): String = if (!en) a else when {
    a == "Vis meg" -> "Show me"; a.startsWith("Takk, ") -> "Thanks, " + when (a.removePrefix("Takk, ")) { "Dråpe" -> "Drop"; "Ugle" -> "Owl"; "Gris" -> "Piggy"; else -> a.removePrefix("Takk, ") }
    a == "Neste" -> "Next"; else -> a
}

/** Figuren spretter inn når den bytter (gbPop: skala .4 → 1.08 → 1, 0,45 s), lett haptikk. */
@Composable
internal fun PopFig35(id: String, size: Dp, mood: String) {
    key(id) {
        val sc = remember { Animatable(.4f) }
        val al = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
            Haptics.select()
            launch { al.animateTo(1f, tween(200)) }
            sc.animateTo(1f, keyframes { durationMillis = 450; .4f at 0; 1.08f at 315; 1f at 450 })
        }
        Box(Modifier.graphicsLayer { scaleX = sc.value; scaleY = sc.value; alpha = al.value; translationY = (1f - al.value) * 20f * density }) { GlimtFig35(id, size, mood) }
    }
}

@Composable
private fun BriefTop35(vm: AppViewModel, kind: String, @Suppress("UNUSED_PARAMETER") host: String) {
    val p = PaperPal.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(briefTitle34(kind), color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 40.sp, lineHeight = 41.sp,
            modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(p.ink).clickable(role = Role.Button) { vm.stopSay35(); vm.closeBrief34() }.padding(horizontal = 18.dp),
            contentAlignment = Alignment.Center) { Text("Ferdig", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
    }
}

/** «▮▮▮ Sky snakker · Nora · Stopp». */
@Composable
private fun SpeakingPill35(vm: AppViewModel) {
    val g = vm.p35
    val who = Fig35.who(g.speaking ?: "glimt").lowercase().replaceFirstChar { it.uppercase() }
    val voice = VOICES35.firstOrNull { it.first == g.set.voice }?.second?.substringBefore(" · ") ?: "Nora"
    val t = rememberInfiniteTransition(label = "bars35")
    val durs = listOf(420, 300, 500, 360)
    val vals = durs.map { d -> t.animateFloat(.4f, 1f, infiniteRepeatable(tween(d, easing = LinearEasing), RepeatMode.Reverse), label = "b$d") }
    Row(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(INK35).padding(start = 12.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.height(14.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            vals.forEach { v -> Box(Modifier.width(3.dp).fillMaxHeight(v.value).clip(RoundedCornerShape(2.dp)).background(Color(0xFFFF7A52))) }
        }
        Text("$who snakker · $voice", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1)
        Box(Modifier.height(30.dp).clickable(role = Role.Button) { Haptics.select(); vm.stopSay35() }.padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
            Text("Stopp", color = Color(0xFFC9C1B1), fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
    }
}

@Composable
private fun BriefWx35(w: BriefWx34, on: Boolean) {
    Column(
        Modifier.fillMaxWidth().ring34(on, 24.dp).clip(RoundedCornerShape(24.dp)).background(BLUE35).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val k = wxKind34(w.code)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            WxIcon(WX_PATH34[k] ?: WX_PATH34.getValue("delvis"), if (k == "sol") Color(0xFFFFD27A) else if (k == "regn") Color(0xFF9CC8FF) else Color(0xFFE6EEF7), 44.dp)
            Column(Modifier.weight(1f)) {
                Text(w.now?.let { "$it°" } ?: "–", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 38.sp, lineHeight = 38.sp)
                Text("${w.place} · ${w.cond}", color = Color.White.copy(alpha = .85f), fontSize = 13.sp, maxLines = 1)
            }
            Text("↑${w.hi ?: "–"}° ↓${w.lo ?: "–"}°", color = Color.White.copy(alpha = .9f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
        }
        if (w.rain.isNotEmpty()) {
            val mx = maxOf(.6, w.rain.maxOrNull() ?: 0.0)
            Row(Modifier.fillMaxWidth().height(46.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                w.rain.forEach { r ->
                    Box(Modifier.weight(1f).fillMaxHeight((r / mx).toFloat().coerceIn(.06f, 1f)).clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                        .background(Color.White.copy(alpha = if (r >= .2) .9f else .3f)))
                }
            }
            Row(Modifier.fillMaxWidth()) {
                listOf("nå", "nedbør neste 12 t", "+12 t").forEachIndexed { i, l ->
                    Text(l, color = Color.White.copy(alpha = .75f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp,
                        modifier = Modifier.weight(1f), textAlign = when (i) { 0 -> TextAlign.Start; 1 -> TextAlign.Center; else -> TextAlign.End })
                }
            }
        }
        val notes = listOfNotNull(w.vsYesterday?.let { "Sammenlignet med i går" to it }, w.sunset?.let { "Solnedgang" to "Sola går ned $it" })
        if (notes.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = .18f)))
            notes.forEach { (k2, v) ->
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(k2, color = Color.White.copy(alpha = .75f), fontSize = 12.sp)
                    Text(v, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
private fun BriefKal35(vm: AppViewModel, b: Brief34, on: Boolean) {
    val p = PaperPal.current
    Column(
        Modifier.fillMaxWidth().ring34(on, 24.dp).clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Kalender", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, modifier = Modifier.weight(1f))
            Text(b.nextLabel(), color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        if (b.events.isEmpty()) Text("Ingenting i dag eller i morgen.", color = p.mut, fontSize = 13.5.sp)
        val today = LocalDate.now(OSLO35Z)
        b.events.forEach { e ->
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().height(IntrinsicSize.Min).clickable(role = Role.Button) { Haptics.tap(); vm.stopSay35(); if (!vm.openKalApp33(e.id, e.date)) vm.openKal26(e.id) }.padding(vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.width(46.dp)) {
                    Text(e.start ?: "Hele", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp)
                    Text(if (e.date == today) "i dag" else if (e.date == today.plusDays(1)) "i morgen" else e.date.dayOfMonth.toString() + ".", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                }
                Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(e.color?.let { Color(it) } ?: RED35))
                Column(Modifier.weight(1f)) {
                    Text(e.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    e.loc?.let { Text(it, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
    }
}

/** Rosa kort «Abonnementer»: logo, navn, «Prøve · avslutt før tir 21. · deretter 149 kr/mnd», fremdrift og dager igjen. */
@Composable
private fun BriefTrials35(vm: AppViewModel, trials: List<BriefTrial35>, on: Boolean) {
    val dark = Tone.paperDark
    val p = PaperPal.current
    val bg = if (dark) Color(0xFF3A2328) else Color(0xFFFBE9EC)
    val row = if (dark) p.card else Color(0xFFFFFDF8)
    val ink = p.ink
    val t1 = trials.first()
    Column(Modifier.fillMaxWidth().ring34(on, 24.dp).clip(RoundedCornerShape(24.dp)).background(bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Abonnementer", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, modifier = Modifier.weight(1f))
            Text(if (t1.daysLeft <= 2) "AVSLUTT SNART" else "PRØVEPERIODER", color = RED35, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        trials.forEach { t ->
            val c = trialColor32b(t.daysLeft)?.let { Color(it) } ?: ink
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(row).padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val logo = t.logo ?: ("https://www.google.com/s2/favicons?sz=64&domain=" + trialDomain32b(t.service))
                NewsImage27(vm, logo, t.service, Modifier.size(40.dp).border(1.dp, Color(0xFFECDFE2), RoundedCornerShape(11.dp)), 11.dp, 12)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(t.service, color = ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                    Text("Prøve · avslutt før ${t.endsLabel}" + (t.priceLabel?.let { " · deretter $it" } ?: ""), color = p.sub, fontSize = 12.5.sp, maxLines = 2)
                    Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFF1E3E6))) {
                        Box(Modifier.fillMaxWidth(t.progress).fillMaxHeight().background(c))
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(t.daysLeft.toString(), color = c, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 26.sp)
                    Text(if (t.daysLeft == 1) "dag igjen" else "dager igjen", color = p.sub, fontSize = 11.sp)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(INK35).clickable(role = Role.Button) { vm.trialDone35(t1) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("✓ Jeg har avsluttet ${t1.service}", color = Color(0xFFF3EFE6), fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, Color(0xFFE6C9CF), RoundedCornerShape(18.dp))
                .clickable(role = Role.Button) { vm.stopSay35(); vm.closeBrief34(); vm.openFromMer(Screen.Sub) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Åpne Abonnement ›", color = ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
        }
    }
}

/** Toppsak med bilde (16:9, radius 16) og 6 saker med miniatyr (76 × 56, radius 10). */
@Composable
private fun BriefNews35(vm: AppViewModel, b: Brief34, on: Boolean) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Column(
        Modifier.fillMaxWidth().ring34(on, 24.dp).clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Nyheter", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
        if (b.news.isEmpty()) Text("Ingen saker ennå. Legg til kilder i Nyhetsleser.", color = p.mut, fontSize = 13.5.sp)
        val top = b.news.firstOrNull()
        if (top != null) Column(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = top.url != null) { top.url?.let { vm.stopSay35(); openLink(ctx, it) } },
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            NewsImage27(vm, top.image, top.src, Modifier.fillMaxWidth().aspectRatio(16f / 9f), 16.dp, 26)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(top.src, color = RED35, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                top.time?.let { Text(it, color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp) }
            }
            Text(top.title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 20.sp, lineHeight = 24.sp)
            top.lead?.takeIf { it.isNotBlank() }?.let { Text(it, color = p.sub, fontSize = 13.sp, lineHeight = 18.8.sp, maxLines = 4, overflow = TextOverflow.Ellipsis) }
        }
        b.news.drop(1).take(6).forEach { n ->
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().clickable(role = Role.Button, enabled = n.url != null) { n.url?.let { vm.stopSay35(); openLink(ctx, it) } }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NewsImage27(vm, n.image, n.src, Modifier.size(76.dp, 56.dp), 10.dp, 12)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(n.src, color = RED35, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, maxLines = 1)
                        n.time?.let { Text(it, color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp) }
                    }
                    Text(n.title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 19.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/* ---------------- ⚙-arket i briefen ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GlimtSheet35(vm: AppViewModel) {
    val p = PaperPal.current
    val st = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = { vm.p35.cfgSheet = false }, sheetState = st, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Brief-innstillinger", 24.sp, modifier = Modifier.weight(1f))
                SheetButton30("Ferdig", "secondary") { vm.p35.cfgSheet = false }
            }
            GlimtSettings35(vm, figures = false)
        }
    }
}

/* ---------------- Innstillinger → Glimt (fullskjerm med Ferdig) ---------------- */

@Composable
internal fun GlimtPage35(vm: AppViewModel) {
    val p = PaperPal.current
    BackHandler { vm.closeGlimt35() }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PLabel("GLIMT")
                    PSerif("Glimt", 34.sp)
                    Text("Figur, brief, stemme og venner", color = p.mut, fontSize = 13.sp)
                }
                Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(p.ink).clickable(role = Role.Button) { vm.closeGlimt35() }.padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center) { Text("Ferdig", color = p.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
            }
            GlimtSettings35(vm, figures = true)
        }
    }
}

/** Raden i Innstillinger → GLIMT. */
@Composable
internal fun GlimtSettingsRow35(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { vm.loadGlimt35() }
    val set = vm.p35.set
    Row(Modifier.fillMaxWidth().hl34(vm, "glimt", 0.dp).clickable(onClickLabel = "Åpne Glimt-innstillinger") { vm.openGlimt35() }.padding(14.dp, 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(9.dp)).background(RED35), contentAlignment = Alignment.Center) { Text("✦", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
        Column(Modifier.weight(1f)) {
            Text("Glimt", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text("Figur, brief, stemme og venner · ${Fig35.name(set.char)}", color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        GlimtFig35(set.char, 28.dp, still = true)
        Text("›", color = p.mut, fontSize = 13.sp)
    }
}

@Composable
private fun Toggle35(on: Boolean) {
    Box(Modifier.size(44.dp, 26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) Color(0xFF2F7A4F) else Color(0xFFDDD5C5)).padding(3.dp),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White)) }
}

@Composable
private fun Lab35(t: String) = Text(t, color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 4.dp, start = 4.dp))

@Composable
private fun Seg35(items: List<Pair<String, String>>, sel: String, onPick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(CircleShape).background(p.surf2).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        items.forEach { (k, n) ->
            val on = k == sel
            Box(Modifier.weight(1f).height(30.dp).clip(CircleShape).background(if (on) p.card else Color.Transparent).clickable(role = Role.RadioButton) { onPick(k) },
                contentAlignment = Alignment.Center) { Text(n, color = if (on) p.ink else p.sub, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
        }
    }
}

/** Innholdet (felles for ⚙ og Innstillinger → Glimt). figures = rutenettet med alle 13 figurene øverst. */
@Composable
internal fun GlimtSettings35(vm: AppViewModel, figures: Boolean) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val g = vm.p35
    val set = g.set
    val host = hostChar35(set.char)
    LaunchedEffect(Unit) { vm.loadGlimt35() }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (figures) {
            Lab35("GLIMT-FIGUR")
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val cols = maxOf(3, (maxWidth / 104.dp).toInt())
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Fig35.IDS.chunked(cols).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { id ->
                                val on = set.char == id
                                val night = id == "natt"
                                Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(if (night) INK35 else p.card).border(2.dp, if (on) RED35 else Color.Transparent, RoundedCornerShape(18.dp))
                                    .clickable(role = Role.RadioButton, onClickLabel = "Velg ${Fig35.name(id)}") { vm.setChar35(id) }.padding(top = 12.dp, bottom = 10.dp, start = 6.dp, end = 6.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(Modifier.height(66.dp), contentAlignment = Alignment.Center) { GlimtFig35(id, 50.dp, if (on) "glad" else "idle") }
                                    Text(Fig35.name(id), color = if (night) Color(0xFFF3EFE6) else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                                }
                            }
                            repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
            Text("Figuren er verten i briefen, på Hjem-kortet, i widgets og i Glimt-chat. Vennene (Sky, Dråpe, Ugle, Gris …) tar over når temaet passer, om det er slått på under. Er «Glimt» valgt, blir verten Glimt Natt mellom 21 og 06.",
                color = p.mut, fontSize = 12.5.sp, lineHeight = 17.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
        }
        PCard {
            PToggle("Glimt-brief", "Lag briefer gjennom dagen", set.brief) { v -> vm.setGlimt35(JSONObject().put("brief", v)) { it.copy(brief = v) } }
            PToggle("Les opp", "Glimt og vennene leser briefen høyt", set.readAloud, top = true) { v ->
                vm.setGlimt35(JSONObject().put("readAloud", v)) { it.copy(readAloud = v) }
                if (v) vm.say35("Lyden er på. Jeg leser briefen for deg.", host, force = true) else vm.stopSay35()
            }
            PToggle("Vis meg rundt automatisk", "Starter guide-runden når briefen åpnes", set.guide, top = true) { v -> vm.setGlimt35(JSONObject().put("guide", v)) { it.copy(guide = v) } }
            PToggle("Venner av Glimt", "Sky, Dråpe, Ugle og Gris tar over når temaet passer", set.friends, top = true) { v -> vm.setGlimt35(JSONObject().put("friends", v)) { it.copy(friends = v) } }
            PToggle("Varsel når briefen er klar", "Push til mobilen på klokkeslettet", set.notify, top = true) { v -> vm.setGlimt35(JSONObject().put("notify", v)) { it.copy(notify = v) } }
        }
        Lab35("BRIEFER GJENNOM DAGEN")
        PCard {
            listOf(Triple("morning", "Morgenbrief", "Vær, dagen og første avtale"), Triple("day", "Dagsbrief", "Resten av dagen og nyheter"),
                Triple("evening", "Kveldsbrief", "I morgen, vær og det du ikke rakk"), Triple("night", "Nattbrief", "Kort oppsummering før du legger deg")).forEachIndexed { i, (k, n, sub) ->
                val b = set.briefs[k] ?: BRIEFS35_DEFAULT.getValue(k)
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().graphicsLayer { alpha = if (set.brief) 1f else .45f }.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f).clickable(role = Role.Switch) { vm.setBriefSlot35(k, on = !b.on) }) {
                        Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                        Text(sub, color = p.mut, fontSize = 12.sp)
                    }
                    // Klokkeslett: trykk åpner tidsvelgeren.
                    Box(Modifier.height(34.dp).clip(RoundedCornerShape(10.dp)).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Endre tid for $n") {
                        val hm = b.at.split(':')
                        android.app.TimePickerDialog(ctx, { _, h, m -> vm.setBriefSlot35(k, at = "%02d:%02d".format(h, m)) },
                            hm.getOrNull(0)?.toIntOrNull() ?: 7, hm.getOrNull(1)?.toIntOrNull() ?: 0, true).show()
                    }.padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                        Text(b.at, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }
                    Box(Modifier.clickable(role = Role.Switch, onClickLabel = n) { vm.setBriefSlot35(k, on = !b.on) }) { Toggle35(b.on) }
                }
            }
        }
        Text("Bare valgte briefer lages og varsles. Widgets og Hjem-kortet viser siste valgte brief.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        // Prompt 37: Bibelvers (bare for brukere med modulen).
        if (figures) BibleSettings37(vm)
        Lab35("STEMMEMOTOR")
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ENGINES35.forEach { e -> EngineRow35(vm, e) }
        }
        g.ttsErr?.let { Text(it, color = RED35, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
        Lab35("STEMME")
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            VOICES35.forEach { (k, n, sub) ->
                val on = set.voice == k
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(14.dp))
                    .clickable(role = Role.RadioButton) { vm.setTts35(voice = k) }.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(sub, color = p.mut, fontSize = 12.sp)
                    }
                    Box(Modifier.height(30.dp).clip(RoundedCornerShape(15.dp)).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Hør $n") {
                        vm.setTts35(voice = k)
                        vm.say35(if (set.lang == "en") "Hi, I'm Glimt. This is how I sound." else "Hei, jeg er Glimt. Slik høres jeg ut.", "glimt", force = true)
                    }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) { Text("▶ Hør", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            Text("Språk for opplesning", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(if (set.lang == "en") "English" else "Norsk", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
        Seg35(listOf("no" to "Norsk", "en" to "English"), set.lang) { k ->
            vm.setTts35(lang = k)
            vm.say35(if (k == "en") "Hi, I'm Glimt. This is how I sound in English." else "Hei, jeg er Glimt. Slik høres jeg ut på norsk.", "glimt", force = true)
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            Text("Tempo", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(when (set.rate) { "calm" -> "×0,85"; "fast" -> "×1,15"; else -> "×1" }, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
        Seg35(listOf("calm" to "Rolig", "normal" to "Normal", "fast" to "Rask"), set.rate) { k -> vm.setTts35(rate = k) }
        Text("Nøklene ligger kryptert på serveren (AI-kontroll → API og nøkler), aldri på telefonen. Lyden caches i 30 dager, så samme brief koster ingenting å spille av igjen.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(role = Role.Button) {
            vm.p35.cfgSheet = false; vm.openAiCtl34("api")
        }, contentAlignment = Alignment.Center) { Text("Modeller, nøkler og forbruk ligger under AI ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
    }
}

@Composable
private fun EngineRow35(vm: AppViewModel, e: EngInfo35) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val g = vm.p35
    val on = g.set.engine == e.id
    val srv = g.set.engines.firstOrNull { it.id == e.id }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(14.dp))
        .clickable(role = Role.RadioButton) { vm.setTts35(engine = e.id) }.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(srv?.name?.takeIf { it.isNotBlank() && it != e.id } ?: e.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f, fill = false), maxLines = 2)
            if (e.tag.isNotEmpty()) Box(Modifier.clip(CircleShape).background(Color(e.tagBg)).padding(horizontal = 7.dp, vertical = 1.dp)) {
                Text(e.tag, color = Color(e.tagFg), fontWeight = FontWeight.ExtraBold, fontSize = 10.sp, letterSpacing = .6.sp)
            }
        }
        Text(e.desc, color = p.mut, fontSize = 12.sp)
        if (e.id != "browser") {
            val st = when {
                srv == null -> "Status hentes fra serveren"
                srv.ready -> "Klar" + (srv.tail?.let { " · nøkkel …$it" } ?: "")
                srv.keySet -> "Nøkkel lagt inn" + (srv.tail?.let { " · …$it" } ?: "")
                else -> "Mangler nøkkel"
            }
            Text(st, color = if (srv?.ready == true) p.pos else p.sub, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
        if (on && e.id != "browser") {
            if (vm.userIsAdmin) {
                val v = g.keyEdit[e.id] ?: ""
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(when (e.id) { "openai" -> "OpenAI API-nøkkel"; "elevenlabs" -> "ElevenLabs API-nøkkel"; else -> "Azure-nøkkel@region (f.eks. …@norwayeast)" }, color = p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
                    e.keyUrl?.let { u -> Text("Hent nøkkel ↗", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.clickable(role = Role.Button) { openLink(ctx, u) }) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    BasicTextField(v, { g.keyEdit = g.keyEdit + (e.id to it) }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        textStyle = TextStyle(color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.5.sp), cursorBrush = SolidColor(p.lab),
                        modifier = Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(12.dp)).background(p.surf2).padding(horizontal = 12.dp),
                        decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (v.isEmpty()) Text(if (e.id == "openai") "sk-…" else if (e.id == "elevenlabs") "xi-…" else "nøkkel@region", color = p.mut, fontSize = 13.5.sp); inner() } })
                    Box(Modifier.height(44.dp).clip(RoundedCornerShape(12.dp)).background(p.ink).clickable(role = Role.Button, enabled = v.isNotBlank()) { vm.saveTtsKey35(e.id, v) }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center) { Text(if (g.keyBusy == e.id) "Lagrer …" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
            } else Text("Bare administrator kan legge inn nøkler. Alle ser statusen her.", color = p.mut, fontSize = 12.sp)
        }
    }
}

/* ---------------- AI-søk: «Åpne Vær ›» ---------------- */

@Composable
internal fun WxOpen35(geo: String, onClick: () -> Unit) {
    val name = geo.removePrefix("geo:").split(',', limit = 3).getOrNull(2)?.takeIf { it.isNotBlank() }
    Box(Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f)).clickable(role = Role.Button) { onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text("Åpne Vær" + (name?.let { " for $it" } ?: "") + " ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}
