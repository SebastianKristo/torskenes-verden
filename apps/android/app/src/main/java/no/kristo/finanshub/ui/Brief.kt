package no.kristo.finanshub.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalTime
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
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

private val CARD_IDS38 = listOf("packages", "family", "school", "birthdays", "aurora")

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

/** De nye kortene (etter Abonnementer, før Nyheter), i rekkefølgen fra Innstillinger → Glimt → Brief. */
@Composable
internal fun BriefCards38(vm: AppViewModel, kind: String) {
    val s = vm.p38
    LaunchedEffect(vm.account?.id) { vm.loadBriefCards38() }
    val x = s.bx
    val cards = x?.cards?.takeIf { it.isNotEmpty() } ?: s.cards
    val order = if (cards.isEmpty()) CARD_IDS38 else cards.filter { it.second }.map { it.first }.filter { it in CARD_IDS38 } +
        CARD_IDS38.filter { id -> cards.none { it.first == id } }
    order.forEach { id ->
        when (id) {
            "packages" -> x?.packages?.takeIf { it.isNotEmpty() }?.let { BxPackages38(vm, it, x.pkLabel) }
            "family" -> x?.family?.takeIf { it.isNotEmpty() }?.let { BxFamily38(it, x.famLabel) }
            "school" -> x?.school?.takeIf { it.isNotEmpty() }?.let { BxSchool38(vm, it) }
            "birthdays" -> (x?.birthdays ?: vm.localBirthdays38()).takeIf { it.isNotEmpty() }?.let { BxBirthdays38(vm, it) }
            "aurora" -> x?.aurora?.let { a ->
                val h = LocalTime.now(OSLO38).hour
                val evening = kind == "evening" || kind == "night" || h >= 15 || h < 4
                if (a.show && evening && (a.kp ?: 0.0) >= 3.0) BxAurora38(a)
            }
        }
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
