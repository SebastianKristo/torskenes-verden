package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import java.time.LocalDate
import kotlin.math.abs

/*
 * Prompt 37 (ANDROID37): dagens bibelvers (claude-code-bibelvers.md, Bibelvers.dc.html) – bare for brukere med modulen (standard sebastian).
 *  - Now Brief: MORGENVERS / KVELDSVERS · GLIMT (fersken / indigo med gyllen glød), Kopier og ↻. Ikke i dagsbriefen. Lest eller sveipet
 *    bort på Hjem → nederst i briefen resten av dagen.
 *  - Hjem: «DAGENS BIBELVERS» (h13). Lest (≥ 60 % synlig i 4 s + 45 ms per tegn, maks 14 s) → borte neste økt; sveip → bort for i dag.
 *  - Bibel-siden (Mer → Bibel og trykk på Hjem-kortet): rekke, uke-prikker, Jeg har lest, Lagre, ✦ Forklar, leseplan, statistikk,
 *    lagrede vers, daglig påminnelse. Arket med hele verset og sammenhengen (Del, Kopier).
 */

private val MORN_BG37 = Brush.linearGradient(listOf(Color(0xFFFBE9D6), Color(0xFFF6D6B8)), Offset(0f, 0f), Offset(300f, 900f))
private val EVE_BG37 = Brush.linearGradient(listOf(Color(0xFF1F2B4A), Color(0xFF2B2350)), Offset(0f, 0f), Offset(300f, 900f))
private val NIGHT_PAGE37 = Brush.linearGradient(listOf(Color(0xFF2B2350), Color(0xFF1F2B4A)), Offset(0f, 0f), Offset(300f, 900f))

private class VerseLook37(val bg: Brush, val fg: Color, val lab: Color, val mut: Color, val chip: Color, val glow: Color, val kick: String)

private fun look37(period: String): VerseLook37 = if (period == "morning")
    VerseLook37(MORN_BG37, Color(0xFF3B2A1A), Color(0xFFB23A2A), Color(0xFF8A6A4A), Color(0x143B2A1A), Color(0x66FFFFFF), "MORGENVERS · GLIMT")
else VerseLook37(EVE_BG37, Color(0xFFF3EFE6), Color(0xFFFFD9C2), Color(0x99F3EFE6), Color(0x1FFFFFFF), Color(0x40FFC878), "KVELDSVERS · GLIMT")

private val WD37 = listOf("Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag")
private val MS37 = listOf("januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember")
private fun dateText37(d: LocalDate = LocalDate.now(OSLO37)) = "${WD37[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MS37[d.monthValue - 1]}"

private fun copy37(ctx: Context, v: Verse37) {
    runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Bibelvers", "«${v.text}» ${v.ref}")) }
}

/* ======================= Now Brief ======================= */

/** Kortet i briefen (morgen- og kveldsbrief; nederst resten av dagen når det er lest eller sveipet bort på Hjem). */
@Composable
internal fun BriefBible37(vm: AppViewModel, period: String) {
    val v = vm.shownVerse37() ?: return
    val ctx = LocalContext.current
    val l = look37(period)
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(l.bg).drawBehind {
        drawCircle(l.glow, radius = 70.dp.toPx(), center = Offset(size.width - 40.dp.toPx(), 40.dp.toPx()))
    }.clickable(role = Role.Button, onClickLabel = "Les verset") { vm.p37.bibleSheet = true }.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(l.kick, color = l.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.5.sp)
                    Text(dateText37(), color = l.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                }
                // Prompt 38: Glimt i prestedrakt (46 dp) oppe til høyre, ved dato og etikett.
                PriestFig38(46.dp, if (vm.p35.speaking != null) "talk" else "idle")
            }
            Text("«${v.text}»", color = l.fg, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 22.sp, lineHeight = 30.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(v.ref, color = l.fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).background(l.chip).clickable(role = Role.Button) { copy37(ctx, v); copied = true; Haptics.select() }.padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center) { Text(if (copied) "Kopiert" else "Kopier", color = l.fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                Box(Modifier.size(32.dp).clip(CircleShape).background(l.chip).clickable(role = Role.Button, onClickLabel = "Nytt vers") { vm.nextVerse37() }, contentAlignment = Alignment.Center) {
                    Text("↻", color = l.fg, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}

/* ======================= Hjem ======================= */

/** «DAGENS BIBELVERS» på Hjem: les-måling, sveip bort (venstre → høyre) og trykk → Bibel-siden. */
@Composable
internal fun BibleHome37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    val v = s.verse ?: return
    if (!vm.bibleAllowed37()) return
    val life = LocalLifecycleOwner.current
    var vis by remember { mutableFloatStateOf(0f) }
    // Lest: synlig ≥ 60 % (og appen i forgrunnen) i 4 s + 45 ms per tegn (maks 14 s). Blir stående resten av økten.
    LaunchedEffect(v.ref) {
        val need = minOf(14_000L, 4_000L + v.text.length * 45L)
        var acc = 0L
        while (acc < need) {
            delay(250)
            if (vis >= .6f && life.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) acc += 250
        }
        vm.bibleRead37()
    }
    val edit = vm.editPage == "hjem"
    SwipeAway37(enabled = !edit, title = { ph, pr -> when { ph -> "Skjult"; pr -> "Slipp for å skjule"; else -> "Sveip for å skjule" } },
        sub = "Nederst i briefen resten av dagen", radius = 22, onGone = { vm.bibleGone37() }, onTap = { if (!edit) { Haptics.tap(); vm.p37.biblePage = true } }) {
        Column(Modifier.fillMaxWidth().onGloballyPositioned { c ->
            val b = c.boundsInWindow()
            val h = c.size.height.toFloat().coerceAtLeast(1f)
            vis = (b.height / h).coerceIn(0f, 1f)
        }.clip(RoundedCornerShape(22.dp)).background(p.card).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("DAGENS BIBELVERS", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f))
                Text(v.ref, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, maxLines = 1)
            }
            Text("«${v.text}»", color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 19.sp, lineHeight = 26.sp)
        }
    }
}

/**
 * Sveip mot høyre (samme gest og animasjon som brief-kortet). Prompt 39: SwipeDismiss39 (ui/Ui39.kt) – myk, uten
 * rekomponering under draget, fartsstyrt utflyging og kollaps med målt høyde. Trykk uten dra kaller onTap
 * (klikk < 350 ms etter et sveip ignoreres). title(ferdig, over terskel) gir etikettene.
 */
@Composable
internal fun SwipeAway37(enabled: Boolean, title: (Boolean, Boolean) -> String, sub: String, radius: Int, onGone: () -> Unit, onTap: () -> Unit, content: @Composable () -> Unit) {
    SwipeDismiss39(enabled = enabled, radius = radius.dp, idle = "✓ " + title(false, false), armed = "✓ " + title(false, true), done = "✓ " + title(true, false),
        sub = sub, onGone = onGone, onTap = onTap) { content() }
}

/* ======================= Arket: hele verset med sammenheng ======================= */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BibleSheet37(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val v = vm.shownVerse37() ?: return
    val close = { vm.p37.bibleSheet = false }
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif(v.ref, 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            v.before.forEach { Text(it, color = p.mut, fontFamily = PaperFonts.serif, fontSize = 16.sp, lineHeight = 23.sp) }
            Text("«${v.text}»", color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 21.sp, lineHeight = 29.sp)
            v.after.forEach { Text(it, color = p.mut, fontFamily = PaperFonts.serif, fontSize = 16.sp, lineHeight = 23.sp) }
            if (v.before.isEmpty() && v.after.isEmpty()) Text("Sammenhengen hentes fra serveren når den har bibelteksten.", color = p.mut, fontSize = 12.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PButton("Del", Modifier.weight(1f), kind = "line") {
                    runCatching { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "«${v.text}» ${v.ref}"), "Del verset").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
                PButton(if (copied) "Kopiert" else "Kopier", Modifier.weight(1f)) { copy37(ctx, v); copied = true; Haptics.select() }
            }
            Text("Tekst: Bibelen 1930 (fri bruk).", color = p.mut, fontSize = 11.5.sp)
        }
    }
}

/* ======================= Bibel-siden ======================= */

@Composable
internal fun BiblePage37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    val ctx = LocalContext.current
    BackHandler { s.biblePage = false }
    LaunchedEffect(Unit) { vm.loadBible37(); vm.loadBibleStats37() }
    val v = vm.shownVerse37() ?: s.verse
    val period = v?.period ?: biblePeriod37()
    val l = look37(period)
    val today = LocalDate.now(OSLO37)
    val readToday = today.toString() in s.readDays
    val n = streak37(s.readDays, today)
    val best = maxOf(s.best, n)
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(34.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { s.biblePage = false }.padding(start = 10.dp, end = 14.dp),
                    contentAlignment = Alignment.Center) { Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                Spacer(Modifier.weight(1f))
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                PSerif("Rekke, leseplan og lagrede vers", 15.sp, p.mut, italic = true, weight = FontWeight.Normal)
                PSerif("Bibel", 40.sp)
            }
            // Rekke-kortet (indigo, gyllen glød).
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(NIGHT_PAGE37).drawBehind {
                drawCircle(Brush.radialGradient(listOf(Color(0x59FFC878), Color.Transparent), center = Offset(size.width - 20.dp.toPx(), 20.dp.toPx()), radius = 100.dp.toPx()),
                    radius = 100.dp.toPx(), center = Offset(size.width - 20.dp.toPx(), 20.dp.toPx()))
            }.padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        val wob = rememberInfiniteTransition(label = "flame37").animateFloat(-2f, 2f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "f")
                        Box(Modifier.size(54.dp).graphicsLayer { if (readToday) { rotationZ = wob.value; val k = 1f + abs(wob.value) * .018f; scaleX = k; scaleY = k } }.clip(RoundedCornerShape(18.dp))
                            .background(if (readToday) Brush.linearGradient(listOf(Color(0xFFFFB067), Color(0xFFE8573A))) else Brush.linearGradient(listOf(Color(0x1FF3EFE6), Color(0x1FF3EFE6)))),
                            contentAlignment = Alignment.Center) {
                            WxIcon("M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5z", if (readToday) Color.White else Color(0x99F3EFE6), 28.dp, fill = true)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("$n", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 40.sp, lineHeight = 40.sp)
                            Text(if (n == 1) "dag på rad" else "dager på rad", color = Color(0xCCF3EFE6), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("LENGSTE", color = Color(0x99F3EFE6), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.2.sp)
                            Text("$best dager", color = Color(0xFFF3EFE6), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                    val mon = today.minusDays((today.dayOfWeek.value - 1).toLong())
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("M", "T", "O", "T", "F", "L", "S").forEachIndexed { i, wl ->
                            val d = mon.plusDays(i.toLong())
                            val on = d.toString() in s.readDays
                            val isT = d == today
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Text(wl, color = if (isT) Color(0xFFFFD9C2) else Color(0x99F3EFE6), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp)
                                Box(Modifier.size(30.dp).clip(CircleShape).background(if (on) Color(0xFFFFD9C2) else Color.Transparent)
                                    .border(1.5.dp, if (on || isT) Color(0xFFFFD9C2) else Color(0x40F3EFE6), CircleShape), contentAlignment = Alignment.Center) {
                                    if (on) Text("✓", color = Color(0xFF2B2350), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                    Text(when { readToday -> "Bra! Kom tilbake i morgen for å holde rekken."; n > 0 -> "Les dagens vers for å holde rekken på $n dager."; else -> "Les dagens vers for å starte en ny rekke." },
                        color = Color(0xBFF3EFE6), fontSize = 12.5.sp)
                }
            }
            // Dagens vers.
            if (v != null) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(l.bg).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row {
                    Text("DAGENS VERS", color = l.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f))
                    Text(dateText37(), color = l.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                }
                // Prompt 38: Glimt i prestedrakt (72 dp) leser verset med deg.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PriestFig38(72.dp, if (vm.p35.speaking != null) "talk" else "idle")
                    Text("Glimt leser dagens vers med deg", color = l.mut, fontSize = 13.sp, modifier = Modifier.weight(1f))
                }
                Text("«${v.text}»", color = l.fg, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 22.sp, lineHeight = 30.sp,
                    modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Les i sammenheng") { s.bibleSheet = true })
                Text(v.ref, color = l.fg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                val saved = s.saved.any { it.first == v.ref }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.height(38.dp).clip(RoundedCornerShape(19.dp)).background(if (readToday) Color(0xFF2F7A4F) else l.fg).clickable(role = Role.Button) { vm.markBibleRead37() }.padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center) { Text(if (readToday) "✓ Lest i dag" else "Jeg har lest", color = if (readToday) Color.White else if (period == "morning") Color.White else Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
                    Chip37(if (saved) "♥ Lagret" else "♡ Lagre", l) { vm.toggleSaved37(v) }
                    Chip37("✦ Forklar", l) { vm.explainVerse37(v) }
                    Chip37(if (copied) "Kopiert" else "Kopier", l) { copy37(ctx, v); copied = true; Haptics.select() }
                }
                s.explain?.let { ex ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(l.chip).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("GLIMT", color = l.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.4.sp)
                        Text(ex, color = l.fg, fontSize = 14.sp, lineHeight = 21.sp)
                    }
                }
            }
            // Leseplan.
            PLabel("LESEPLAN", p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            val plan = PLANS37.firstOrNull { it.first == s.plan } ?: PLANS37.first()
            val pdone = s.planDone == today.toString()
            val pd = (if (pdone) s.planDay else s.planDay + 1).coerceIn(1, plan.third)
            val (chap, url) = planChapter37(plan.first, pd)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    PSerif(plan.second, 22.sp, modifier = Modifier.weight(1f), maxLines = 1)
                    Text("Dag $pd av ${plan.third}", color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                }
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
                    Box(Modifier.fillMaxWidth((s.planDay.toFloat() / plan.third).coerceIn(0f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(Color(0xFFB23A2A)))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("I DAG", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.2.sp)
                        Text(chap, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                        Text(if (pdone) "Fullført i dag · neste i morgen" else "Ca. 5 minutter", color = p.mut, fontSize = 12.5.sp)
                    }
                    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button) { openLink(ctx, url) }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center) { Text("Les ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (pdone) Color(0xFF2F7A4F) else p.ink).clickable(role = Role.Button) { vm.planDoneToday37() }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center) { Text(if (pdone) "✓ Lest" else "Ferdig", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PLANS37.forEach { (k, name, _) -> PChip(name, k == s.plan) { vm.setPlan37(k) } }
                }
            }
            // Statistikk.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("DAGER LEST" to "${s.readDays.size}", "LAGREDE" to "${s.saved.size}", "LESEPLAN" to "${Math.round(s.planDay * 100f / plan.third)} %").forEach { (k, x) ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(k, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.1.sp, maxLines = 1)
                        PSerif(x, 24.sp, maxLines = 1)
                    }
                }
            }
            // Lagrede vers.
            PLabel("LAGREDE VERS · ${s.saved.size}", p.mut, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
            if (s.saved.isEmpty()) Text("Trykk «Lagre» på et vers for å samle det her.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(horizontal = 6.dp))
            s.saved.forEach { (ref, text) ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp, 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("«$text»", color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 16.5.sp, lineHeight = 23.sp)
                        Text(ref, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    Box(Modifier.size(30.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fjern $ref") { Haptics.select(); vm.removeSaved37(ref) }, contentAlignment = Alignment.Center) {
                        Text("×", color = p.mut, fontSize = 20.sp)
                    }
                }
            }
            // Daglig påminnelse.
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                PToggle("Daglig påminnelse", if (s.remind) "Kl. 07:00 · «Dagens vers er klart»" else "Av", s.remind) { on -> vm.putBibleSet37 { it.copy(notify = on) } }
            }
            Text("Tekst: Bibelen 1930 (fri bruk). «Les ›» åpner kapitlet på bibel.no.", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.padding(horizontal = 6.dp))
        }
    }
}

@Composable
private fun Chip37(t: String, l: VerseLook37, onClick: () -> Unit) {
    Box(Modifier.height(38.dp).clip(RoundedCornerShape(19.dp)).background(l.chip).clickable(role = Role.Button) { onClick() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(t, color = l.fg, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
    }
}

/* ======================= Innstillinger → Glimt → Bibelvers ======================= */

/** Bare for brukere med modulen: på/av, morgen- og kveldsbrief, varsel kl. 07:00, oversettelse. */
@Composable
internal fun BibleSettings37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    LaunchedEffect(vm.account?.id) { vm.loadBible37() }
    if (!vm.bibleAllowed37() && !s.bibleSet.enabled) return
    val st = s.bibleSet
    Text("BIBELVERS", color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 4.dp, start = 4.dp))
    PCard {
        PToggle("Dagens bibelvers", "I Now Brief, på Hjem og i widgets", st.enabled || vm.bibleAllowed37()) { on -> vm.putBibleSet37 { it.copy(enabled = on) }; if (on) vm.loadBible37(force = true) }
        PToggle("I morgenbriefen", "05–11", st.morning, top = true) { on -> vm.putBibleSet37 { it.copy(morning = on) } }
        PToggle("I kveldsbriefen", "17–05", st.evening, top = true) { on -> vm.putBibleSet37 { it.copy(evening = on) } }
        PToggle("Varsel", "Kl. 07:00 «Dagens vers er klart»", st.notify, top = true) { on -> vm.putBibleSet37 { it.copy(notify = on) } }
        PRow("Oversettelse", "Bibelen 1930 (fri bruk)", "1930", serif = false, top = true)
        PRow("Bibel-siden", "Rekke, leseplan og lagrede vers", "›", serif = false, top = true) { s.biblePage = true }
    }
}
