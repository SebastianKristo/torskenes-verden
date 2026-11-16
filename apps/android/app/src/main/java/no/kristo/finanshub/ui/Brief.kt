package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.Card52
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.Screen
import no.kristo.finanshub.loadBrief52
import no.kristo.finanshub.openBirthdays24
import no.kristo.finanshub.openKal26
import no.kristo.finanshub.startService52
import org.json.JSONArray
import org.json.JSONObject
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight

/* ======================= Brief-kortet: sveip mot høyre ======================= */

private val EASE_OUT36 = CubicBezierEasing(.4f, 0f, .6f, 1f)

/**
 * Brief-kortet på Hjem med sveip venstre → høyre. Prompt 39: selve gesten og animasjonen ligger i SwipeDismiss39 (ui/Ui39.kt,
 * myk og uten rekomponering under draget), og hint-animasjonen («Sveip → for å skjule») er fjernet helt.
 * Skjult: kortet kollapser; Angre i toasten viser det igjen (glir inn).
 */
@Composable
internal fun SwipeBrief36(vm: AppViewModel, content: @Composable () -> Unit) {
    val hidden = vm.briefHiddenNow36()
    AnimatedVisibility(!hidden, enter = expandVertically(tween(300, easing = EASE_OUT36)) + fadeIn(tween(260)), exit = ExitTransition.None) {
        SwipeDismiss39(enabled = true, radius = 24.dp, idle = "Sveip for å skjule", armed = "Slipp for å skjule", done = "Brief skjult",
            sub = "Kommer tilbake med ${briefNext36()}", onGone = { vm.hideBrief36() }) { content() }
    }
}

/** «Brief skjult til kveldsbriefen kl. 17» + Angre (4,5 s), nederst over fanelinja. */
@Composable
internal fun BriefToast36(vm: AppViewModel, modifier: Modifier = Modifier) {
    val s = vm.p36
    val seq = s.briefToast
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(seq) { if (seq > 0) { show = true; delay(4500); show = false } else show = false }
    AnimatedVisibility(show, modifier, enter = fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 2 }, exit = fadeOut(tween(200))) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17)).padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Brief skjult til ${briefNext36()}", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { show = false; vm.undoBrief36() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
    }
}

/* ======================= Brief: nye kort ======================= */

@Composable
private fun BxCard38(title: String, kick: String, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.card).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(kick, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.1.sp, maxLines = 1)
        }
        content()
    }
}

@Composable
private fun BxRow38(lead: @Composable () -> Unit, title: String, sub: String, right: String?, rightUnit: String?, rightRed: Boolean, mono: Boolean, onClick: (() -> Unit)?) {
    val p = PaperPal.current
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).then(if (onClick != null) Modifier.clickable(role = Role.Button) { Haptics.tap(); onClick() } else Modifier).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            lead()
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (right != null) Column(horizontalAlignment = Alignment.End) {
                if (mono) Text(right, color = if (rightRed) RED38 else p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                else Text(right, color = if (rightRed) RED38 else p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                if (rightUnit != null) Text(rightUnit, color = p.mut, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun Badge38(text: String, color: Color, round: Boolean, dot: Color? = null) {
    val p = PaperPal.current
    Box(Modifier.size(36.dp)) {
        Box(Modifier.fillMaxSize().clip(if (round) CircleShape else RoundedCornerShape(11.dp)).background(color), contentAlignment = Alignment.Center) {
            Text(text, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp, maxLines = 1)
        }
        if (dot != null) Box(Modifier.align(Alignment.BottomEnd).size(13.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(dot))
    }
}

private fun carrier38(c: String): Pair<String, Color> {
    val l = c.lowercase()
    return when {
        "postnord" in l -> "PN" to Color(0xFF00A0D6)
        "posten" in l || "bring" in l -> "P" to Color(0xFFE32D22)
        "dhl" in l -> "DHL" to Color(0xFFD40511)
        "helthjem" in l -> "HH" to Color(0xFF2F7A4F)
        "ups" in l -> "UPS" to Color(0xFF5B3A1A)
        "dao" in l -> "DAO" to Color(0xFF1B1A17)
        c.isBlank() -> "📦" to Color(0xFF6B665C)
        else -> c.take(2).uppercase() to Color(0xFF6B665C)
    }
}

private fun famDot38(state: String): Color {
    val l = state.lowercase()
    return when { "hjemme" in l -> GREEN38; "vei" in l -> Color(0xFFD9A400); "skole" in l || "jobb" in l -> BLUE38; else -> Color(0xFF8F897C) }
}

/** Prompt 73: har kortet noe å vise? (pakker, familie, skole, bursdager, nordlys). Ellers viser briefen en kort tomtekst. */
internal fun hasBriefCard38(vm: AppViewModel, id: String, kind: String): Boolean {
    val x = vm.p38.bx
    return when (id) {
        "packages" -> !x?.packages.isNullOrEmpty()
        "family" -> !x?.family.isNullOrEmpty()
        "school" -> !x?.school.isNullOrEmpty()
        "birthdays" -> (x?.birthdays ?: vm.localBirthdays38()).isNotEmpty()
        "aurora" -> x?.aurora?.let { a -> val h = LocalTime.now(OSLO38).hour; a.show && (kind == "evening" || kind == "night" || h >= 15 || h < 4) && (a.kp ?: 0.0) >= 3.0 } == true
        else -> false
    }
}

/** Prompt 73: ett av kortene over (rekkefølgen kommer fra «Innhold i briefen», ui/Brief35.kt BriefStack73). */
@Composable
internal fun BriefCard38One(vm: AppViewModel, id: String, kind: String) {
    val x = vm.p38.bx
    if (!hasBriefCard38(vm, id, kind)) return
    when (id) {
        "packages" -> x?.packages?.let { BxPackages38(vm, it, x.pkLabel) }
        "family" -> x?.family?.let { BxFamily38(it, x.famLabel) }
        "school" -> x?.school?.let { BxSchool38(vm, it) }
        "birthdays" -> BxBirthdays38(vm, x?.birthdays ?: vm.localBirthdays38())
        "aurora" -> x?.aurora?.let { BxAurora38(it) }
    }
}

@Composable
private fun BxPackages38(vm: AppViewModel, l: List<BxPkg38>, label: String?) = BxCard38("Pakker", label ?: "${l.size} PÅ VEI") {
    l.take(4).forEach { k ->
        val (ini, col) = carrier38(k.carrier)
        BxRow38({ Badge38(ini, col, round = false) }, k.name, k.status, day38(k.due)?.let { if (k.due?.length ?: 0 >= 10) "Hent innen $it" else it }, null, k.dueRed, mono = true) {
            vm.stopSay35(); vm.closeBrief34(); vm.go(Screen.Tracking)
        }
    }
}

@Composable
private fun BxFamily38(l: List<BxFam38>, label: String?) {
    val p = PaperPal.current
    BxCard38("Familie", label ?: if (l.size == 1) "1 DELER POSISJON" else "${l.size} DELER POSISJON") {
        l.take(6).chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                row.forEach { f ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Badge38(f.name.take(1).uppercase(), f.color?.let { Color(it) } ?: BLUE38, round = true, dot = f.dot?.let { Color(it) } ?: famDot38(f.state))
                        Column(Modifier.weight(1f)) {
                            Text(f.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                            Text(listOfNotNull(f.state.takeIf { it.isNotBlank() }, f.place ?: f.since).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun BxSchool38(vm: AppViewModel, l: List<BxSchool38>) = BxCard38("Skole og jobb", "NESTE 7 DAGER") {
    l.take(5).forEach { k ->
        BxRow38({ Box(Modifier.width(6.dp).height(34.dp).clip(RoundedCornerShape(3.dp)).background(k.color?.let { Color(it) } ?: GREEN38)) },
            k.title, listOfNotNull(day38(k.date), k.kind?.let { when (it) { "prove" -> "Prøve"; "frist" -> "Frist"; "mote", "møte" -> "Møte"; else -> null } }).joinToString(" · "),
            k.daysLeft?.toString(), k.daysLeft?.let { if (it == 1) "dag" else "dager" }, k.red, mono = false) {
            vm.stopSay35(); vm.closeBrief34(); vm.openKal26()
        }
    }
}

@Composable
private fun BxBirthdays38(vm: AppViewModel, l: List<BxBd38>) {
    val p = PaperPal.current
    val first = l.first()
    val added = first.name in vm.p38.gifts
    BxCard38("Bursdager", "NESTE") {
        l.take(3).forEach { b ->
            BxRow38({ Badge38(b.name.take(1).uppercase(), b.color?.let { Color(it) } ?: BLUE38, round = true) }, b.name,
                b.text ?: listOfNotNull(b.age?.let { "Fyller $it" }, day38(b.date)).joinToString(" · "), b.daysLeft?.toString(), b.daysLeft?.let { if (it == 1) "dag" else "dager" },
                b.red ?: ((b.daysLeft ?: 99) <= 3), mono = false) { vm.stopSay35(); vm.closeBrief34(); vm.openBirthdays24() }
        }
        Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).clickable(enabled = !added, role = Role.Button) { vm.addGift38(first) }
            .padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
            Text(if (added) "✓ Lagt i Gjøremål" else "+ Gave til ${first.name} i Gjøremål", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
    }
}

@Composable
private fun BxAurora38(a: BxAurora38) {
    val kp = a.kp ?: 0.0
    val good = kp >= 4
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(Color(0xFF0F1A2E), Color(0xFF1B2340))))
            .drawBehind {
                drawRect(Brush.radialGradient(listOf(Color(0xE69C6AE0), Color.Transparent), Offset(size.width * .85f, 0f), size.width * .7f))
                drawRect(Brush.radialGradient(listOf(Color(0xD93FC79A), Color.Transparent), Offset(size.width * .1f, size.height), size.width * .6f))
            }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Nordlys i natt", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(a.label ?: "KP ${fmt38(kp)} · ${if (good) "GODE" else "MULIGE"} SJANSER", color = Color(0xFFBFF5DF), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.1.sp, maxLines = 1)
        }
        Text(a.text ?: if (good) "Glimt anbefaler å se nordover etter kl. 22." else "Nordlys er mulig lavt i nord om det klarner. Følg med på varselet.",
            color = Color.White.copy(alpha = .9f), fontSize = 14.5.sp, lineHeight = 21.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("KP-INDEKS" to fmt38(kp), "SKYDEKKE" to (a.cloud?.let { "$it %" } ?: "–"), "BEST" to (a.best ?: "–")).forEach { (k, v) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .1f)).padding(12.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(k, color = Color.White.copy(alpha = .7f), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.sp, maxLines = 1)
                    Text(v, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1)
                }
            }
        }
        Text(a.source ?: "Kilde: NOAA SWPC · MET (skydekke)", color = Color.White.copy(alpha = .65f), fontSize = 12.sp)
    }
}

private fun fmt38(d: Double): String = if (d % 1.0 == 0.0) d.toInt().toString() else String.format(java.util.Locale("nb", "NO"), "%.1f", d)

/* ======================= Brief-kortene ======================= */

internal fun JSONObject.s(k: String): String? = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() && it != "null" }

private fun JSONArray?.objs(): List<JSONObject> = this?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } } ?: emptyList()

/** De ni kortene i briefen for den som er logget inn (fast rekkefølge fra serveren; kort uten tilgang kommer ikke). */
@Composable
internal fun BriefCards52(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadBrief52() }
    val b = vm.p52b.brief ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        b.cards.forEach { c -> BriefCard52(vm, c) }
    }
}

@Composable
internal fun BriefCard52(vm: AppViewModel, c: Card52) { // prompt 73: brukes per kort av Card52Slot73 (ui/Brief73Ui.kt)
    val p = PaperPal.current
    val d = c.data
    val dark = c.id == "homelab" || c.id == "focus"
    val bg = if (dark) p.ink else p.card
    val ink = if (dark) p.bg else p.ink
    val mut = if (dark) p.bg.copy(alpha = .7f) else p.mut
    val open: (() -> Unit)? = when (c.id) {
        "todo" -> { { vm.openTasks() } }
        "trip" -> { { vm.openRuter() } }
        "bills" -> { { vm.openFromMer(Screen.Sub) } }
        "tonight" -> { { vm.p43.mediaOpen = true } }
        "domains" -> { { vm.domSection = "oversikt"; vm.go(Screen.Domains) } }
        "stocks" -> { { vm.go(Screen.Stocks) } }
        "clothes" -> { { vm.openWeather() } }
        else -> null
    }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(bg).then(if (open != null) Modifier.clickable(role = Role.Button, onClickLabel = c.title) { Haptics.tap(); open() } else Modifier)
            .padding(16.dp, 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        TLabel52(c.title, if (dark) Color(0xFFF29A8A) else p.lab)
        if (d == null) { Text(c.error ?: "Ingen data akkurat nå", color = mut, fontSize = 13.sp); return@Column }
        when (c.id) {
            "focus" -> {
                PSerif(d.s("text") ?: "En rolig dag.", 20.sp, ink, maxLines = 4)
                d.optJSONObject("next")?.let { n -> Text(listOfNotNull(n.s("time"), n.s("title"), n.s("place")).joinToString(" · "), color = mut, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                d.s("free_from")?.let { Text("Fri fra $it", color = mut, fontSize = 12.5.sp) }
            }
            "trip" -> {
                val l = d.optJSONArray("items").objs()
                d.s("stop")?.let { Text(it, color = mut, fontSize = 12.5.sp, maxLines = 1) }
                if (l.isEmpty()) Text("Ingen avganger nå", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(listOfNotNull(x.s("line"), x.s("dest")).joinToString(" "), x.optInt("in_min", -1).takeIf { it >= 0 }?.let { if (it == 0) "nå" else "$it min" } ?: x.s("dep") ?: "", ink, mut) }
            }
            "todo" -> {
                val l = d.optJSONArray("top").objs()
                if (l.isEmpty()) Text("Ingenting på lista", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52("☐ " + (x.s("title") ?: ""), x.s("due") ?: "", if (x.optBoolean("overdue")) p.lab else ink, mut) }
                d.optInt("open", 0).takeIf { it > 3 }?.let { Text("${it - 3} til på lista ›", color = mut, fontSize = 12.5.sp) }
            }
            "bills" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Ingen regninger denne uka", color = mut, fontSize = 13.sp)
                l.take(4).forEach { x -> Row52(x.s("name") ?: "", listOfNotNull(x.s("amount_text"), x.optInt("days", -99).takeIf { it != -99 }?.let { if (it <= 0) "i dag" else "om $it d" }).joinToString(" · "), ink, mut) }
                d.s("sum_text")?.let { PSerif("Sum $it", 18.sp, ink, maxLines = 1) }
            }
            "clothes" -> {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PSerif(d.optDouble("temp").takeIf { !it.isNaN() }?.let { "${it.roundToInt()}°" } ?: "–", 34.sp, ink, maxLines = 1)
                    d.optDouble("feels").takeIf { !it.isNaN() }?.let { Text("føles som ${it.roundToInt()}°", color = mut, fontSize = 12.5.sp, modifier = Modifier.padding(bottom = 6.dp)) }
                }
                PSerif(d.s("text") ?: "", 17.sp, ink, maxLines = 3)
            }
            "tonight" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Ingenting nytt i kveld", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(listOfNotNull(x.s("title"), x.s("subtitle")).joinToString(" · "), x.s("time") ?: "", ink, mut) }
            }
            "homelab" -> {
                val ok = d.optInt("ok", 0); val down = d.optInt("down", 0)
                PSerif(if (down == 0) "Alt kjører · $ok tjenester" else "$down nede · $ok kjører", 20.sp, ink, maxLines = 1)
                d.optJSONArray("services").objs().filter { it.s("state") != "running" }.take(4).forEach { sv ->
                    val id = sv.s("id") ?: return@forEach
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (sv.s("state") == "unhealthy") Color(0xFFE0A030) else Color(0xFFF08A76)))
                        Column(Modifier.weight(1f)) {
                            Text(sv.s("name") ?: id, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                            Text(if (sv.s("state") == "unhealthy") "svarer ikke" else "stoppet", color = mut, fontSize = 12.sp)
                        }
                        if (sv.optBoolean("can_start") && vm.userIsAdmin) {
                            val busy = id in vm.p52b.starting
                            Box(Modifier.height(32.dp).clip(CircleShape).background(p.bg).clickable(enabled = !busy, role = Role.Button, onClickLabel = "Start ${sv.s("name") ?: id}") { vm.startService52(id) }
                                .padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                                Text(if (busy) "Starter …" else if (sv.s("state") == "unhealthy") "Start på nytt" else "Start", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                            }
                        }
                    }
                }
            }
            "domains" -> {
                val l = d.optJSONArray("items").objs()
                if (l.isEmpty()) Text("Alle domener er i orden", color = mut, fontSize = 13.sp)
                l.take(3).forEach { x -> Row52(x.s("name") ?: "", listOfNotNull(x.optInt("days", -1).takeIf { it >= 0 }?.let { "fornyes om $it d" }, x.optInt("ssl_days", -1).takeIf { it >= 0 }?.let { "SSL $it d" }).joinToString(" · "), ink, mut) }
            }
            "stocks" -> {
                PSerif(d.s("value_text") ?: "–", 24.sp, ink, maxLines = 1)
                d.optDouble("change_pct").takeIf { !it.isNaN() }?.let { ch -> Text((if (ch >= 0) "+" else "−") + "%.1f".format(abs(ch)).replace('.', ',') + " % i dag", color = if (ch >= 0) p.pos else p.lab, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                d.optJSONArray("items").objs().take(3).forEach { x ->
                    val ch = x.optDouble("change_pct")
                    Row52(x.s("name") ?: x.s("ticker") ?: "", if (ch.isNaN()) "" else (if (ch >= 0) "+" else "−") + "%.1f".format(abs(ch)).replace('.', ',') + " %", ink, mut)
                }
            }
            else -> d.s("text")?.let { PSerif(it, 17.sp, ink, maxLines = 4) }
        }
    }
}

@Composable
private fun Row52(left: String, right: String, ink: Color, mut: Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(left, color = ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (right.isNotBlank()) Text(right, color = mut, fontSize = 12.5.sp, maxLines = 1)
    }
}

private val INK34 = Color(0xFF1B1A17)

private val CREAM34 = Color(0xFFFFFDF8)

private val RED34 = Color(0xFFB23A2A)

private val BLUE34 = Color(0xFF22476B)

private val RING34 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF7A5AD6), Color(0xFFB23A2A))

/** Glimt-figuren. size = bredden (høyden er 1,12 × size). mood: idle | talk | point | wave. lean: helning i grader. */
@Composable
internal fun GlimtFigure34(size: Dp, mood: String = "idle", lean: Float = 0f, modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val t = rememberInfiniteTransition(label = "glimt34")
    val talk = mood == "talk"
    val bob by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(if (talk) 1600 else 6000, easing = LinearEasing)), label = "spin")
    val blink by t.animateFloat(1f, 1f, infiniteRepeatable(keyframes { durationMillis = 4000; 1f at 3680; .1f at 3800; 1f at 3920 }), label = "blink")
    val tw by t.animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tw")
    val wave by t.animateFloat(-10f, 28f, infiniteRepeatable(tween(800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "wave")
    val mouth by t.animateFloat(.45f, 1f, infiniteRepeatable(tween(160, easing = LinearEasing), RepeatMode.Reverse), label = "mouth")
    val leanA by animateFloatAsState(lean, tween(400), label = "lean")
    Canvas(modifier.size(size, size * 1.12f).semantics { contentDescription = "Glimt" }) {
        val S = this.size.width
        val dy = if (reduce) 0f else -5.dp.toPx() * bob * (S / 76.dp.toPx()).coerceIn(.4f, 1f)
        translate(top = dy) {
            rotate(leanA, Offset(S / 2, this.size.height / 2)) {
                drawGlimt34(S, mood, if (reduce) 0f else spin, if (reduce) 1f else blink, if (reduce) .7f else tw,
                    if (mood == "point") -28f else if (reduce) 0f else wave, if (talk && !reduce) mouth else 1f)
            }
        }
    }
}

/** Selve tegningen (samme mål som prototypen). */
private fun DrawScope.drawGlimt34(S: Float, mood: String, spin: Float, blink: Float, tw: Float, waveDeg: Float, mouthY: Float) {
    // Stjerne over hodet.
    val st = S * .2f
    val sc = .6f + .5f * tw
    translate(left = S / 2 - st / 2, top = -S * .02f) {
        scale(sc, sc, Offset(st / 2, st / 2)) {
            rotate(45f * tw, Offset(st / 2, st / 2)) {
                val k = st / 24f
                val p = Path().apply {
                    moveTo(12f * k, 1.5f * k)
                    cubicTo(12.6f * k, 6.4f * k, 16.6f * k, 10.4f * k, 21.5f * k, 11f * k); lineTo(21.5f * k, 13f * k)
                    cubicTo(16.6f * k, 13.6f * k, 12.6f * k, 17.6f * k, 12f * k, 22.5f * k)
                    cubicTo(11.4f * k, 17.6f * k, 7.4f * k, 13.6f * k, 2.5f * k, 13f * k); lineTo(2.5f * k, 11f * k)
                    cubicTo(7.4f * k, 10.4f * k, 11.4f * k, 6.4f * k, 12f * k, 1.5f * k); close()
                }
                drawPath(p, Color(0xFFFF7A52).copy(alpha = .3f + .7f * tw))
            }
        }
    }
    // Venstre arm (vinker), høyre arm.
    val aw = S * .22f; val ah = S * .1f
    rotate(waveDeg, Offset(-S * .06f + aw * .9f, S * .56f + ah / 2)) {
        drawRoundRect(INK34, Offset(-S * .06f, S * .56f), Size(aw, ah), CornerRadius(S * .05f, S * .05f))
    }
    val bw = S * .2f
    rotate(12f, Offset(S + S * .06f - bw / 2, S * .6f + ah / 2)) {
        drawRoundRect(INK34, Offset(S + S * .06f - bw, S * .6f), Size(bw, ah), CornerRadius(S * .05f, S * .05f))
    }
    // Regnbueringen (roterer).
    val ringW = maxOf(2.5f * density, S * .07f)
    rotate(spin, Offset(S / 2, S * .14f + S / 2)) {
        drawCircle(Brush.sweepGradient(RING34, Offset(S / 2, S * .14f + S / 2)), radius = S / 2 - ringW / 2, center = Offset(S / 2, S * .14f + S / 2), style = Stroke(ringW))
    }
    // Fjeset.
    val fx = S * .08f; val fy = S * .22f; val fs = S * .84f
    drawCircle(CREAM34, fs / 2, Offset(fx + fs / 2, fy + fs / 2))
    drawArc(Color(0x0F1B1A17), 20f, 140f, false, Offset(fx + fs * .06f, fy + fs * .06f), Size(fs * .88f, fs * .88f), style = Stroke(S * .03f))
    // Øynene (blunker).
    val ew = S * .1f; val eh = S * .14f * blink
    val ey = fy + fs * .36f + (S * .14f - eh) / 2
    drawRoundRect(INK34, Offset(fx + fs * .27f, ey), Size(ew, eh), CornerRadius(S * .06f, S * .06f))
    drawRoundRect(INK34, Offset(fx + fs - fs * .27f - ew, ey), Size(ew, eh), CornerRadius(S * .06f, S * .06f))
    // Kinn.
    val ch = Color(0x59E8794A)
    drawOval(ch, Offset(fx + fs * .16f, fy + fs * .56f), Size(S * .1f, S * .06f))
    drawOval(ch, Offset(fx + fs - fs * .16f - S * .1f, fy + fs * .56f), Size(S * .1f, S * .06f))
    // Munnen (halvsirkel; beveger seg når den snakker).
    val mw = S * .22f; val mh = S * .12f * mouthY
    val mx = fx + fs / 2 - mw / 2; val my = fy + fs * .6f
    val mp = Path().apply {
        moveTo(mx, my); lineTo(mx + mw, my)
        arcTo(androidx.compose.ui.geometry.Rect(mx, my - mh, mx + mw, my + mh), 0f, 180f, false)
        close()
    }
    drawPath(mp, RED34)
}

/* ---------------- Hjem-kortet (h12) ---------------- */

@Composable
internal fun HomeBrief34(vm: AppViewModel, modifier: Modifier = Modifier) { // prompt 43: modifier (Fold: min. 148 dp høy)
    val b = vm.p34.brief
    LaunchedEffect(vm.base, vm.account?.id) { vm.loadGlimt35(); vm.loadBrief34(); vm.prefetchBrief73() } // prompt 73: kortene hentes når Hjem vises
    // Prompt 73: og når appen kommer i forgrunnen (maks hvert 5. min), så briefen er klar før den åpnes.
    val life73 = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(life73) {
        val o = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) vm.prefetchBrief73() }
        life73.lifecycle.addObserver(o)
        onDispose { life73.lifecycle.removeObserver(o) }
    }
    val kind = b?.kind ?: briefKind34()
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(BLUE34, Color(0xFF2E5A7F))))
            .clickable(role = Role.Button, onClickLabel = "Åpne briefen") { vm.openBrief34() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(briefTitle34(kind).uppercase() + " · GLIMT", color = Color(0xFFFFC7B8), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.4.sp, maxLines = 1)
            Text(b?.summary ?: "Glimt lager briefen din …", color = Color.White, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 23.sp,
                maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (b != null) Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                b.chips.take(3).forEach { c ->
                    Text(c, color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .14f)).padding(horizontal = 9.dp, vertical = 4.dp))
                }
            }
        }
        if (vm.p35.set.briefGlimt) GlimtFig35(b?.host ?: hostChar35(vm.p35.set.char), 56.dp) // prompt 35: verten; prompt 39: kan slås av
    }
}

/* ---------------- Brief-siden (fullskjerm) ---------------- */

/** Pulserende rød ring rundt kortet Glimt peker på (gbRing 1,3 s). */
internal fun Modifier.ring34(on: Boolean, radius: Dp): Modifier = if (!on) this else this.ringAnim34(radius)

@Composable
private fun ringAlpha34(): Float {
    val t = rememberInfiniteTransition(label = "ring34")
    val v by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "ring34v")
    return v
}

private fun Modifier.ringAnim34(radius: Dp): Modifier = this.composed {
    val v = ringAlpha34()
    this.drawWithContent {
        drawContent()
        // Prompt 36: «outline» som følger kortets radius nøyaktig: 2,5 dp, offset 4 → 8 → 4 dp (1,3 s), farge 100 % ↔ 45 %.
        val r = radius.toPx()
        val wave = (0.5f - 0.5f * kotlin.math.cos(2f * Math.PI.toFloat() * v))
        val sw = 2.5.dp.toPx()
        val o = (4.dp.toPx() + 4.dp.toPx() * wave) + sw / 2
        drawRoundRect(RED34.copy(alpha = 1f - .55f * wave), Offset(-o, -o), Size(size.width + 2 * o, size.height + 2 * o), CornerRadius(r + o, r + o), style = Stroke(sw))
    }
}

/** Ikonene i værkortet (fra prototypen, 24 × 24). */
internal val WX_PATH34: Map<String, String> = mapOf(
    "sol" to "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    "delvis" to "M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M5.4 10.4A3 3 0 1 1 10.8 7.2M9 20h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13.4A3.3 3.3 0 0 0 9 20z",
    "sky" to "M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.1A3.5 3.5 0 0 0 7 18z",
    "regn" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3",
    "sno" to "M7 14h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 7.1A3.5 3.5 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01",
)

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
        // Prompt 39: ikke når Glimt er slått av i briefen.
        if (g.set.guide && g.set.briefGlimt && !vm.tourWasSeen34()) { delay(900); if (s.tour == 0) { s.tour = 1; vm.tourSeen34() } }
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
            // Prompt 73: kortene i rekkefølgen fra Innstillinger → Glimt → Innhold i briefen (ui/Brief73Ui.kt, P73Brief.kt).
            // Alle kort som er på har plassen sin fra første bilde: cache, ellers skjelett i full høyde; tomt → kort tomtekst.
            BriefStack73(vm, b, kind, trials, pos, ring)
            if (b == null) return@Column
            Text("Laget av Glimt ${b.generatedAt ?: ""} · Vær: MET / Open-Meteo · Nyheter: ${b.news.map { it.src }.distinct().filter { it.isNotBlank() }.ifEmpty { listOf("NRK", "VG", "E24") }.take(4).joinToString(", ")}",
                color = p.mut, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            b.note?.let { Text(it, color = p.mut, fontSize = 11.5.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) }
        }
        // Figuren og boblen nederst til høyre. Prompt 39: ingen figur, bobler eller guide når «Glimt i briefen» er av.
        if (set.briefGlimt) Row(
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

/** Prompt 73: kortene som er på, i lagret rekkefølge. Kort fra /api/brief (Vær, Kalender, Nyheter …) vises med siste brief
 *  (cache) eller skjelett; kortene fra /api/brief52 hentes hvert for seg (Card52Slot73). */
@Composable
private fun BriefStack73(vm: AppViewModel, b: Brief34?, kind: String, trials: List<BriefTrial35>, pos: MutableMap<String, Float>, ring: (String) -> Boolean) {
    LaunchedEffect(vm.account?.id) { vm.loadBriefCards73(); vm.fetchBriefCards73(force = true) }
    B73.onKeys.forEach { k ->
        key(k) {
            when {
                B73.B52.containsKey(k) -> Card52Slot73(vm, k)
                b == null -> Skeleton73(k)
                else -> BriefCard34Slot73(vm, b, k, kind, trials, pos, ring)
            }
        }
    }
}

@Composable
private fun BriefCard34Slot73(vm: AppViewModel, b: Brief34, k: String, kind: String, trials: List<BriefTrial35>, pos: MutableMap<String, Float>, ring: (String) -> Boolean) {
    when (k) {
        // Prompt 37: hele Vær-kortet er trykkbart og åpner Vær over briefen (✕ går tilbake hit, på samme sted). Talen stoppes.
        "vaer" -> {
            val w = b.wx
            if (w == null) Empty73("Vær", "Ingen værdata akkurat nå") else {
                val src = remember { MutableInteractionSource() }
                val down by src.collectIsPressedAsState()
                Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["vaer"] = it.positionInParent().y }
                    .graphicsLayer { val sc = if (down) .985f else 1f; scaleX = sc; scaleY = sc }
                    .clickable(src, null, role = Role.Button, onClickLabel = "Åpne Vær") { vm.stopSay35(); Haptics.tap(); vm.openWeather() }) { BriefWx35(w, ring("vaer")) }
            }
            // Prompt 41: Skiføre · NORDMARKA i briefen når skikortet er relevant (og «Skiføre» ikke er slått av i Rediger Vær).
            if (b.skiText != null && vm.vaerLay41().ski) BriefSki41(b.skiText, b.skiItems)
        }
        "kal" -> Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["kal"] = it.positionInParent().y }) { BriefKal35(vm, b, ring("kal")) }
        "nyheter" -> Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["nyh"] = it.positionInParent().y }) { BriefNews35(vm, b, ring("nyh")) }
        "abo" -> if (trials.isNotEmpty()) Box(Modifier.fillMaxWidth().onGloballyPositioned { pos["abo"] = it.positionInParent().y }) { BriefTrials35(vm, trials, ring("abo")) }
            else Empty73("Prøveperioder", "Ingen prøveperioder slutter snart")
        // Prompt 37: dagens bibelvers (bare med modulen).
        "bibel" -> if (vm.bibleAllowed37()) BriefBible37(vm, if (vm.bibleAtBottom37()) biblePeriod37() else if (kind == "morning") "morning" else "evening")
            else Empty73("Bibelvers", "Ingen bibelvers akkurat nå")
        "pakker", "familie", "skole", "bursdager", "nordlys" -> {
            val id = mapOf("pakker" to "packages", "familie" to "family", "skole" to "school", "bursdager" to "birthdays", "nordlys" to "aurora").getValue(k)
            if (hasBriefCard38(vm, id, kind)) BriefCard38One(vm, id, kind)
            else Empty73(B73.title(k), mapOf("pakker" to "Ingen pakker på vei", "familie" to "Ingen deler posisjon nå", "skole" to "Ingen prøver eller frister neste 7 dager",
                "bursdager" to "Ingen bursdager den nærmeste tiden", "nordlys" to "Ikke nordlys i natt").getValue(k))
        }
    }
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
        // Prompt 71: fire streker (3 dp, 2 dp mellomrom, nederst, høyde 14 dp × verdi, radius 2) i én Canvas – før animert
        // fillMaxHeight (layout hvert bilde), nå lest i tegnefasen.
        Canvas(Modifier.width((4 * 3 + 3 * 2).dp).height(14.dp)) {
            val bw = 3.dp.toPx(); val gap = 2.dp.toPx(); val r = CornerRadius(2.dp.toPx())
            vals.forEachIndexed { i, v ->
                val h = size.height * v.value
                drawRoundRect(Color(0xFFFF7A52), Offset(i * (bw + gap), size.height - h), Size(bw, h), r)
            }
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
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Nyheter", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, modifier = Modifier.weight(1f))
            // Prompt 40: lukker briefen og åpner Nyhetsleseren rett på Glimt-siden.
            Text("✦ Glimt-sammendrag ›", color = RED35, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button) { vm.stopSay35(); vm.p34.briefOpen = false; vm.openNewsGlimt40() }.padding(8.dp, 4.dp))
        }
        if (b.news.isEmpty()) Text("Ingen saker ennå. Legg til kilder i Nyheter.", color = p.mut, fontSize = 13.5.sp)
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
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = p.mut, modifier = Modifier.size(16.dp))
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
                                    Box(Modifier.height(66.dp), contentAlignment = Alignment.Center) { GlimtFig35(id, 50.dp, if (on) "glad" else "idle", noJul = true) } // prompt 40: figurvelgeren uten antrekk
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
        // Prompt 52 (AND52B): standardfigur per bruker (admin) – prompt 68: flyttet til Husstand → Brukere og familie (ui/Users68Ui.kt).
        if (figures && vm.userIsAdmin) Users68Link(vm, "Standardfigur per bruker (admin) ligger under Husstand") {
            vm.closeGlimt35(); vm.openPaperPage("set"); vm.settingsPage = USERS68
        }
        // Prompt 40 (claude-code-glimt-jul.md): Julemodus rett under figurvalget og teksten om vennene, før Glimt-brief-bryteren.
        Jul40Card(vm)
        Mai41Card(vm) // Prompt 41: Høytider → 17. mai
        PCard {
            PToggle("Glimt-brief", "Lag briefer gjennom dagen", set.brief) { v -> vm.setGlimt35(JSONObject().put("brief", v)) { it.copy(brief = v) } }
            // Prompt 39: slå av Glimt (figuren) i Now Brief.
            PToggle("Glimt i briefen", "Vis Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets", set.briefGlimt, top = true) { v ->
                vm.setGlimt35(JSONObject().put("briefGlimt", v)) { it.copy(briefGlimt = v) }
                runCatching { no.kristo.finanshub.widget.Brief34Store.redrawAsync(vm.appCtx35) }
            }
            PToggle("Les opp", "Glimt og vennene leser briefen høyt", set.readAloud, top = true) { v ->
                vm.setGlimt35(JSONObject().put("readAloud", v)) { it.copy(readAloud = v) }
                if (v) vm.say35("Lyden er på. Jeg leser briefen for deg.", host, force = true) else vm.stopSay35()
            }
            PToggle("Vis meg rundt automatisk", "Starter guide-runden når briefen åpnes", set.guide, top = true) { v -> vm.setGlimt35(JSONObject().put("guide", v)) { it.copy(guide = v) } }
            Box(Modifier.graphicsLayer { alpha = if (set.briefGlimt) 1f else .45f }) {
                PToggle("Venner av Glimt", "Sky, Dråpe, Ugle og Gris tar over når temaet passer", set.friends, top = true) { v -> if (set.briefGlimt) vm.setGlimt35(JSONObject().put("friends", v)) { it.copy(friends = v) } }
            }
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
        // Prompt 73: INNHOLD I BRIEFEN – hvilke kort og rekkefølgen (ui/Brief73Ui.kt). Både på siden og i ⚙-arket.
        Brief73Settings(vm)
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

private val HM73: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@Composable
private fun Switch73(on: Boolean) {
    Box(Modifier.size(44.dp, 26.dp).clip(RoundedCornerShape(13.dp)).background(if (on) Color(0xFF2F7A4F) else Color(0xFFDDD5C5)).padding(3.dp),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White)) }
}

@Composable
private fun Arrow73(up: Boolean, dim: Boolean, label: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(28.dp, 22.dp).clip(RoundedCornerShape(6.dp)).background(p.surf2).graphicsLayer { alpha = if (dim) .35f else 1f }
        .clickable(enabled = !dim, role = Role.Button, onClickLabel = label) { onClick() }, contentAlignment = Alignment.Center) {
        Text(if (up) "⌃" else "⌄", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 13.sp)
    }
}

/** «INNHOLD I BRIEFEN · 8 av 11 på»: pil opp/ned, tittel + kilde, bryter. Hele raden slår av/på; langt trykk + dra flytter. */
@Composable
internal fun Brief73Settings(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { vm.loadBriefCards73(force = true) }
    val items = B73.items
    val rowPx = with(LocalDensity.current) { 53.dp.toPx() }
    var dragKey by remember { mutableStateOf<String?>(null) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var slot by remember { mutableIntStateOf(0) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp, end = 4.dp), verticalAlignment = Alignment.Bottom) {
            Text("INNHOLD I BRIEFEN", color = Color(0xFFA39D90), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
            Text(B73.countText, color = Color(0xFF8A8478), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
        }
        Text("Velg hvilke kort som er med og rekkefølgen de vises i. Gjelder Brief på mobil, web og widgets.", color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp,
            modifier = Modifier.padding(horizontal = 4.dp))
        PCard {
            items.forEachIndexed { i, it ->
                key(it.key) {
                    val dragging = dragKey == it.key
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp)
                            .graphicsLayer { translationY = if (dragging) dragY else 0f; shadowElevation = if (dragging) 8f else 0f }
                            .background(if (dragging) p.card else Color.Transparent)
                            .pointerInput(it.key, i) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { _ -> dragKey = it.key; dragY = 0f; slot = 0; Haptics.tap() },
                                    onDrag = { ch, d -> ch.consume(); dragY += d.y; val s = Math.round(dragY / rowPx); if (s != slot) { slot = s; Haptics.tap() } },
                                    onDragEnd = { vm.placeBriefCard73(it.key, i + Math.round(dragY / rowPx)); dragKey = null; dragY = 0f; slot = 0 },
                                    onDragCancel = { dragKey = null; dragY = 0f; slot = 0 },
                                )
                            }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Arrow73(true, i == 0, "Flytt ${it.title} opp") { vm.moveBriefCard73(it.key, -1) }
                            Arrow73(false, i == items.size - 1, "Flytt ${it.title} ned") { vm.moveBriefCard73(it.key, 1) }
                        }
                        Row(Modifier.weight(1f).clickable(role = Role.Switch, onClickLabel = if (it.on) "Skjul ${it.title}" else "Vis ${it.title}") { vm.toggleBriefCard73(it.key) },
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Column(Modifier.weight(1f).graphicsLayer { alpha = if (it.on) 1f else .45f }) {
                                Text(it.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(it.sub, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Switch73(it.on)
                        }
                    }
                }
            }
        }
        Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).border(1.dp, Color(0xFFDDD5C5), RoundedCornerShape(17.dp))
            .clickable(role = Role.Button) { vm.resetBriefCards73() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Tilbakestill", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
        B73.err?.let { Text(it, color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
    }
}

/** Skjelett i full høyde: tittel og grå linjer i papirstil. Ingen spinner, ingen innfading. */
@Composable
internal fun Skeleton73(key: String) {
    val p = PaperPal.current
    val title = B73.title(key)
    Column(Modifier.fillMaxWidth().heightIn(min = B73.height(key).dp).clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 14.dp)
        .semantics { contentDescription = "$title lastes" }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        PSerif(title, 20.sp, p.ink, maxLines = 1)
        listOf(.72f, .54f, .63f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(12.dp).clip(RoundedCornerShape(6.dp)).background(p.line)) }
    }
}

/** Kort uten innhold (eller som ikke kunne hentes): kort tomtekst, kortet blir stående. */
@Composable
internal fun Empty73(title: String, text: String, minH: Int = 0, retry: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().heightIn(min = minH.dp).clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PSerif(title, 20.sp, p.ink, maxLines = 1)
        Text(text, color = p.mut, fontSize = 13.5.sp)
        if (retry != null) Box(Modifier.height(32.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Color(0xFFDDD5C5), RoundedCornerShape(16.dp))
            .clickable(role = Role.Button) { retry() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Prøv igjen", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
        }
    }
}

/** Et kort fra /api/brief52: cache → innhold (+ «Oppdatert kl. …» ved tidsavbrudd), ellers skjelett eller «Klarte ikke hente». */
@Composable
internal fun Card52Slot73(vm: AppViewModel, key: String) {
    val p = PaperPal.current
    val id = B73.B52[key] ?: return
    val c = B73.cards[id]
    val st = B73.state[id]
    when {
        c != null -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            BriefCard52(vm, c)
            if (st == "stale") Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                val t = B73.at[id]?.takeIf { it > 0 }?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(HM73) }
                Text(if (t != null) "Oppdatert kl. $t" else "Klarte ikke hente", color = p.mut, fontSize = 12.sp)
                Text("Prøv igjen", color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold, fontSize = 12.sp, textDecoration = TextDecoration.Underline,
                    modifier = Modifier.clickable(role = Role.Button) { vm.retryBriefCard73(id) })
            }
        }
        st == "fail" -> Empty73(B73.title(key), "Klarte ikke hente", B73.height(key)) { vm.retryBriefCard73(id) }
        else -> Skeleton73(key)
    }
}
