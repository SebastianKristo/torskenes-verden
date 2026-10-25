@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package no.kristo.finanshub.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Prompt 50 (FAMAND50): Familie i nytt design – fasit design/Familie App.dc.html og Familie Redesign.dc.html 2a.
 *  - Fanelinje nederst (mørk pille): Folk · Steder · Helse · Sjekk inn. Folk er startsiden, «‹ Hjem» øverst.
 *  - Folk: 2×2-kort per person (batteripille, rød kant under 25 %), kartstripe med «Åpne kart», «I DAG» med profilbilder.
 *  - Kart: fyller skjermen, «‹ Familie» og «finn meg», ark som dras opp/ned, merkelapp i kanten for personer utenfor utsnittet.
 *  - Personside: kart med nøyaktighetssirkel, Ring · Melding · Veibeskrivelse, 2×2-kort, skritt siste 7 dager (bare når personen deler).
 *  - Steder: kort per sted med områdene som brikker; redigering (4b) med alle områdene på kartet, radius 25–1000 m, type og varsler.
 *  - Helse (5) og Helse for personen (5b). Sjekk inn (6) og etter sending (6b), «I dag i familien».
 *  - Fold/brett (LocalWide45): to kolonner – venstre fanen, høyre kart, personside, sted eller helse for personen.
 *  - Tilbake (BackHandler på flaten) går dit du kom fra: Personside → Folk, Kart eller Helse.
 * Fargene kommer fra PaperPal (lys/mørk/glass); designets faste farger er bare brukt for personfargene og grønn/rød status.
 */

private val GREEN50 = Color(0xFF2F7D4F)
private val RED50 = Color(0xFFB23A2A)

internal fun fam50Tab(t: String): String = when (t) {
    "kart", "folk" -> "folk"; "soner", "steder" -> "steder"; "helse" -> "helse"; "velfremme", "sjekk", "hjemlys" -> "sjekk"; else -> "folk"
}

private fun first50(n: String) = n.trim().split(' ').firstOrNull()?.ifBlank { n } ?: n
private fun join50(a: List<String>): String = if (a.size <= 1) a.joinToString("") else a.dropLast(1).joinToString(", ") + " og " + a.last()
private fun iconFor50(type: String, icon: String?): String = icon?.takeIf { it.isNotBlank() } ?: when (type) { "hjem" -> "home"; "skole" -> "school"; "jobb" -> "work"; else -> "pin" }
private fun typeName50(t: String) = when (t) { "hjem" -> "Hjem"; "skole" -> "Skole"; "jobb" -> "Jobb"; else -> "Annet" }
private fun fmt50(n: Int?): String = n?.let { String.format(java.util.Locale.forLanguageTag("nb-NO"), "%,d", it).replace(',', ' ').replace(' ', ' ') } ?: "–"

private const val IC_CALL = "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"
private const val IC_MSG = "M4 5h16v11H8l-4 4z"
private const val IC_ROUTE = "M3 11l18-8-8 18-2-8z"
private const val IC_BELL = "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"
private const val IC_PIN = "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
private const val IC_LOCATE = "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3"

/* ======================= Små byggeklosser ======================= */

@Composable
private fun T50(
    text: String, size: TextUnit, color: Color, weight: FontWeight = FontWeight.Normal, family: FontFamily = PaperFonts.sans,
    modifier: Modifier = Modifier, maxLines: Int = 1, align: TextAlign? = null, lineHeight: TextUnit = TextUnit.Unspecified, spacing: TextUnit = TextUnit.Unspecified,
) = Text(text, modifier, color = color, fontSize = size, fontWeight = weight, fontFamily = family, maxLines = maxLines, overflow = TextOverflow.Ellipsis,
    textAlign = align, lineHeight = lineHeight, letterSpacing = spacing)

/** IBM Plex Mono 600 med sperring (etiketter som «I DAG», «SKRITT I DAG»). */
@Composable
private fun Lab50(text: String, color: Color = PaperPal.current.sub, size: TextUnit = 10.5.sp, modifier: Modifier = Modifier) =
    T50(text, size, color, FontWeight.SemiBold, PaperFonts.mono, modifier, spacing = size * 0.12f)

@Composable
private fun Ic50(path: String, size: Dp, color: Color, stroke: Float = 2f) {
    val pth = remember(path) { runCatching { PathParser().parsePathString(path).toPath() }.getOrNull() }
    Canvas(Modifier.size(size)) {
        val pp = pth ?: return@Canvas
        val k = this.size.minDimension / 24f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) { drawPath(pp, color, style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
    }
}

/** Rund avatar: profilbilde (cache), ellers initialer i personens farge. */
@Composable
private fun Av50(vm: AppViewModel, av: FamAv50?, size: Dp, font: TextUnit, ring: Color? = null, modifier: Modifier = Modifier) {
    val url = av?.photoUrl
    val bmp by produceState<Bitmap?>(url?.let { vm.fam50.photoCache.get(it) }, url) { value = vm.photo50(url) }
    Box(
        modifier.size(size).then(if (ring != null) Modifier.border(2.dp, ring, CircleShape) else Modifier).clip(CircleShape).background(Color(av?.color ?: 0xFF5C5850)),
        contentAlignment = Alignment.Center,
    ) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        else T50(av?.initials ?: "?", font, Color.White, FontWeight.Bold)
    }
}

@Composable
private fun Pill50(text: String, dark: Boolean = false, height: Dp = 36.dp, shadow: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.height(height).then(if (shadow) Modifier.shadow(10.dp, CircleShape) else Modifier).clip(CircleShape)
            .background(if (dark) p.ink else p.card).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { T50(text, 13.sp, if (dark) p.bg else p.ink, FontWeight.Bold) }
}

/** Stiplet knapp («+ Nytt sted», «+ Legg til område på kartet»). */
@Composable
private fun Dashed50(text: String, height: Dp, onClick: () -> Unit) {
    val p = PaperPal.current
    val line = p.line
    Box(
        Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(height / 2)).drawBehind {
            drawRoundRect(line, cornerRadius = CornerRadius(size.height / 2), style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))))
        }.clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { T50(text, 14.sp, p.ink, FontWeight.Bold) }
}

/** Liten statistikk-rute: etikett, verdi, undertekst. */
@Composable
private fun Stat50(k: String, v: String, sub: String?, modifier: Modifier) {
    val p = PaperPal.current
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Lab50(k, p.sub, 10.sp)
        T50(v, 20.sp, p.ink, FontWeight.Bold)
        if (!sub.isNullOrBlank()) T50(sub, 12.sp, p.sub)
    }
}

@Composable
private fun Grid50(items: List<@Composable (Modifier) -> Unit>, gap: Dp = 8.dp) {
    Column(verticalArrangement = Arrangement.spacedBy(gap)) {
        items.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap)) {
                row.forEach { it(Modifier.weight(1f).fillMaxHeight()) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Søyler for 7 dager: i dag i personens farge, resten lyse. goal = mållinje (stiplet) når satt. */
@Composable
private fun Bars50(week: List<FamDay50>, color: Color, height: Dp, gap: Dp, radius: Dp, goal: Int? = null, light: Boolean = false) {
    val p = PaperPal.current
    val mx = maxOf(goal?.times(1.3)?.toInt() ?: 0, week.maxOfOrNull { it.steps ?: 0 } ?: 0, 1)
    Box(Modifier.fillMaxWidth().height(height)) {
        Row(Modifier.matchParentSize(), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.Bottom) {
            week.forEach { d ->
                val f = ((d.steps ?: 0).toFloat() / mx).coerceIn(.08f, 1f)
                val c = if (d.today) color else if (light && d.goalReached) color.copy(alpha = .45f).compositeOver(p.card) else color.copy(alpha = .28f).compositeOver(p.card)
                Box(Modifier.weight(1f).fillMaxHeight(f).clip(RoundedCornerShape(radius)).background(c))
            }
        }
        if (goal != null && goal > 0) {
            val gf = goal.toFloat() / mx
            val line = p.mut
            Canvas(Modifier.matchParentSize()) {
                val y = size.height * (1 - gf)
                drawLine(line, Offset(0f, y), Offset(size.width, y), 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 5f)))
            }
            T50("MÅL ${fmt50(goal)}", 10.sp, p.mut, FontWeight.SemiBold, PaperFonts.mono,
                Modifier.align(BiasAlignment(1f, (1 - gf) * 2 - 1)).offset(y = (-10).dp))
        }
    }
}

/* ======================= Skjermen ======================= */

/** Tilbake: Personside → der den ble åpnet fra (Kart eller Helse for personen), andre undersider → fanen, ellers lukk Familie. */
internal fun back50(vm: AppViewModel) {
    val s = vm.fam50
    when {
        s.sub == "person" && (s.from == "kart" || s.from == "helsep") -> { s.sub = s.from; s.from = null }
        s.sub != null -> { s.sub = null; s.from = null; s.placeSel = null }
        else -> vm.closeFamily()
    }
}

private fun openPerson50(vm: AppViewModel, userId: String, from: String?) {
    val s = vm.fam50
    Haptics.tap()
    s.sel = userId
    s.from = from
    s.sub = "person"
    vm.loadPersonHealth50(userId)
}

@Composable
internal fun Family50Screen(vm: AppViewModel, startSharing: () -> Unit) {
    val p = PaperPal.current
    val s = vm.fam50
    val tab = fam50Tab(vm.famTab)
    LaunchedEffect(vm.account?.id, tab) {
        while (true) { vm.loadFam50(tab); delay(30_000) }
    }
    BackHandler { back50(vm) }
    val wide = LocalWide45.current
    Box(Modifier.fillMaxSize().background(p.bg)) {
        if (wide) Wide50(vm, tab, startSharing) else Phone50(vm, tab, startSharing)
        vm.message?.let { t ->
            Box(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp, start = 24.dp, end = 24.dp)
                    .shadow(12.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(p.ink).padding(18.dp, 11.dp),
            ) { T50(t, 14.sp, p.bg, FontWeight.SemiBold, maxLines = 3, align = TextAlign.Center) }
        }
    }
}

@Composable
private fun Phone50(vm: AppViewModel, tab: String, startSharing: () -> Unit) {
    val s = vm.fam50
    Box(Modifier.fillMaxSize()) {
        when (s.sub) {
            "kart" -> Kart50(vm, embedded = false)
            "person" -> Person50(vm, embedded = false)
            "sted" -> Sted50(vm)
            else -> Page50 {
                when {
                    s.sub == "helsep" -> HealthPerson50(vm)
                    tab == "steder" -> Steder50(vm)
                    tab == "helse" -> Helse50(vm, wide = false)
                    tab == "sjekk" -> Sjekk50(vm)
                    else -> Folk50(vm, wide = false, startSharing)
                }
            }
        }
        if (s.sub == null || s.sub == "helsep") TabBar50(vm, tab, Modifier.align(Alignment.BottomCenter))
    }
}

/** Fold/brett: venstre = fanen (Folk-kortene eller listen), høyre = kart, personside, sted eller helse for personen. */
@Composable
private fun Wide50(vm: AppViewModel, tab: String, startSharing: () -> Unit) {
    val s = vm.fam50
    Row(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 12.dp)) {
        Box(Modifier.weight(1f).widthIn(min = 320.dp).fillMaxHeight()) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 96.dp)) {
                when (tab) {
                    "steder" -> Steder50(vm)
                    "helse" -> Helse50(vm, wide = true)
                    "sjekk" -> Sjekk50(vm)
                    else -> Folk50(vm, wide = true, startSharing)
                }
            }
            TabBar50(vm, tab, Modifier.align(Alignment.BottomCenter), inset = false)
        }
        Spacer(Modifier.width(20.dp))
        Box(Modifier.weight(1.3f).fillMaxHeight().clip(RoundedCornerShape(24.dp)).background(PaperPal.current.surf2)) {
            when (s.sub) {
                "person" -> Person50(vm, embedded = true)
                "sted" -> Sted50(vm)
                "helsep" -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) { HealthPerson50(vm) }
                else -> Kart50(vm, embedded = true)
            }
        }
    }
}

/** Rullende side med plass til statuslinja øverst og fanelinja nederst. */
@Composable
private fun Page50(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(bottom = 96.dp), content = content)
}

@Composable
private fun TabBar50(vm: AppViewModel, tab: String, modifier: Modifier, inset: Boolean = true) {
    val p = PaperPal.current
    val all = listOf("folk" to "Folk", "steder" to "Steder", "helse" to "Helse", "sjekk" to "Sjekk inn")
    val order = vm.secTabs32b("kart").mapNotNull { t -> all.firstOrNull { it.first == t.first }?.let { it.first to t.second } }.ifEmpty { all }
    Row(
        modifier.then(if (inset) Modifier.navigationBarsPadding() else Modifier).padding(start = 14.dp, end = 14.dp, bottom = 14.dp).fillMaxWidth().height(62.dp)
            .shadow(16.dp, CircleShape).clip(CircleShape).background(p.nav).padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        order.forEach { (k, n) ->
            val on = tab == k
            Box(
                Modifier.weight(1f).fillMaxHeight().clip(CircleShape).background(if (on) p.navAct else Color.Transparent)
                    .clickable(role = Role.Tab, onClickLabel = n) { Haptics.select(); vm.famTab = k; vm.fam50.sub = null; vm.fam50.from = null; vm.fam50.placeSel = null },
                contentAlignment = Alignment.Center,
            ) { T50(n, 12.5.sp, if (on) p.navActInk else p.navInk, FontWeight.Bold) }
        }
    }
}

/* ======================= 1 · Folk ======================= */

@Composable
private fun Folk50(vm: AppViewModel, wide: Boolean, startSharing: () -> Unit) {
    val p = PaperPal.current
    val s = vm.fam50
    var plus by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp, 16.dp, 0.dp), verticalAlignment = Alignment.CenterVertically) {
        Pill50("‹ Hjem") { vm.closeFamily() }
        Spacer(Modifier.weight(1f))
        Box {
            Box(Modifier.size(40.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button, onClickLabel = "Nytt sted eller deling") { plus = true },
                contentAlignment = Alignment.Center) { T50("+", 22.sp, p.bg, FontWeight.Medium) }
            DropdownMenu(plus, { plus = false }) {
                DropdownMenuItem({ Text("Nytt sted") }, { plus = false; vm.famTab = "steder"; s.newType = "annet"; s.placeSel = "new"; s.sub = "sted" })
                DropdownMenuItem({ Text("Personvern og deling") }, { plus = false; vm.famPrivacy = true })
            }
        }
    }
    Column(Modifier.padding(20.dp, 6.dp, 20.dp, 14.dp)) {
        T50(s.title, 38.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 38.sp)
        Spacer(Modifier.height(6.dp))
        T50(s.subtitle.ifBlank { if (s.people == null) "Henter familien …" else "" }, 13.5.sp, p.sub)
    }
    s.error?.let { T50(it, 13.sp, p.lab, modifier = Modifier.padding(horizontal = 20.dp), maxLines = 3) }
    val people = s.people ?: emptyList()
    Column(Modifier.padding(horizontal = 14.dp)) {
        Grid50(people.map { pr -> @Composable { m: Modifier -> PersonCard50(vm, pr, m) { openPerson50(vm, pr.userId, null) } } }, 10.dp)
    }
    FamCalEntry51(vm) // prompt 51 (ANDFEAT51): familiekalender med «hvem kjører?» (ui/FamCal51Ui.kt)
    if (!wide && people.any { it.hasPos }) {
        Box(Modifier.padding(14.dp, 12.dp, 14.dp, 0.dp).fillMaxWidth().height(120.dp).clip(RoundedCornerShape(22.dp)).background(p.surf2)) {
            val ctl = remember { Fam22MapCtl() }
            val data = famGuard52("kartet") { mapData50(vm, people, emptyList(), null, false) }
            if (data == null) FamCardErr52("kartet", Modifier.matchParentSize()) else FamilyMapSafe(vm, Modifier.matchParentSize(), data, ctl, onPin = {}) { _, _ -> }
            LaunchedEffect(people.count { it.hasPos }) { delay(250); ctl.fit(people.filter { it.hasPos }.map { it.lat!! to it.lon!! }); ctl.zoomOut() }
            // Stripa er bare en forhåndsvisning: trykk åpner kartet (ingen panorering inne i rullelisten).
            Box(Modifier.matchParentSize().clickable(role = Role.Button, onClickLabel = "Åpne kart") { s.sub = "kart" })
            Box(Modifier.align(Alignment.BottomEnd).padding(10.dp)) { Pill50("Åpne kart", dark = true) { s.sub = "kart" } }
        }
    }
    Lab50("I DAG", p.lab, 11.sp, Modifier.padding(20.dp, 14.dp, 20.dp, 6.dp))
    ItemList50(vm, s.today, empty = "Ingen hendelser i dag ennå") { e -> if (e.checkinId != null) { vm.famTab = "sjekk"; s.sub = null } }
    vm.family?.me?.let { me ->
        val t = when (me.sharing) { "on" -> "Du deler posisjonen · " + if (me.precision == "approx") "omtrentlig" else "nøyaktig"; "paused" -> "Delingen er satt på pause"; else -> "Du deler ikke posisjonen" }
        Row(
            Modifier.padding(14.dp, 10.dp, 14.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
                .clickable(role = Role.Button) { if (me.sharing == "on") vm.famPrivacy = true else startSharing() }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            T50(t, 13.sp, p.sub, modifier = Modifier.weight(1f))
            T50(if (me.sharing == "on") "Personvern ›" else "Del ›", 13.sp, p.ink, FontWeight.Bold)
        }
    }
}

@Composable
private fun PersonCard50(vm: AppViewModel, pr: FamPerson50, modifier: Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    val shape = RoundedCornerShape(22.dp)
    Column(
        modifier.clip(shape).background(p.card).then(if (pr.lowBattery) Modifier.border(2.dp, RED50, shape) else Modifier)
            .clickable(role = Role.Button, onClickLabel = "Åpne ${pr.name}", onClick = onClick).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Av50(vm, pr.av, 38.dp, 14.sp)
            Spacer(Modifier.weight(1f))
            pr.battery?.let { BatPill50(it, pr.charging == true, pr.lowBattery) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T50(if (pr.av.self) "Du" else pr.name, 14.sp, p.ink, FontWeight.Bold)
            T50(pr.place, 23.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 24.sp)
            T50(pr.sub ?: " ", 12.5.sp, p.sub)
        }
    }
}

@Composable
private fun BatPill50(b: Int, charging: Boolean, low: Boolean) {
    val fg = if (low) RED50 else GREEN50
    Box(Modifier.height(24.dp).clip(RoundedCornerShape(12.dp)).background(fg.copy(alpha = .14f)).padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
        T50("$b %" + if (charging) " ⚡" else "", 12.sp, fg, FontWeight.Bold)
    }
}

/** Liste med avatar (28 dp) foran teksten: «I DAG» og «I dag i familien». Ubesvart = «Venter» i rødt. */
@Composable
private fun ItemList50(vm: AppViewModel, items: List<FamItem50>, empty: String, onClick: ((FamItem50) -> Unit)? = null) {
    val p = PaperPal.current
    Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
        if (items.isEmpty()) T50(empty, 13.5.sp, p.sub, modifier = Modifier.padding(14.dp, 12.dp), maxLines = 2)
        items.forEachIndexed { i, e ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line.copy(alpha = .6f)))
            Row(
                Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable { onClick(e) } else Modifier).padding(14.dp, 9.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Av50(vm, e.avatar, 28.dp, 10.5.sp)
                Column(Modifier.weight(1f)) {
                    T50(e.title, 14.sp, if (e.alert && e.kind == "pickup") RED50 else p.ink, FontWeight.SemiBold)
                    if (!e.sub.isNullOrBlank()) T50(e.sub, 12.sp, p.sub)
                }
                e.right?.let { T50(it, 12.5.sp, if (e.pending) RED50 else p.sub, if (e.pending) FontWeight.Bold else FontWeight.Medium) }
            }
        }
    }
}

/* ======================= Kartdata ======================= */

/** Prompt 52: ren utregning (ikke @Composable), så den kan ligge i krasjgrensen famGuard52. */
private fun mapData50(vm: AppViewModel, people: List<FamPerson50>, places: List<FamPlace50>, sel: String?, placing: Boolean, acc: FamPerson50? = null): Fam22MapData {
    val zones = places.flatMap { pl ->
        pl.areas.map { a -> Fam22ZoneDraw("${pl.id}:${a.id}", a.name, a.lat, a.lon, a.radius.toDouble(), pl.color.toInt(), iconFor50(pl.type, pl.icon), false) }
    } + listOfNotNull(acc?.takeIf { it.hasPos }?.let { a ->
        Fam22ZoneDraw("acc", "", a.lat!!, a.lon!!, (a.acc ?: 30.0).coerceIn(10.0, 3000.0), a.av.color.toInt(), "pin", false, plain = true)
    })
    val pins = people.filter { it.hasPos }.map { pr ->
        val v = pr.speedKmh
        Fam22PinDraw(pr.userId, pr.lat!!, pr.lon!!, pr.av.color.toInt(), if (pr.av.self) "Du" else pr.av.initials,
            pr.av.photoUrl?.let { vm.fam50.photoCache.get(it) }, sel == pr.userId, if (v != null && v > 1.0) "${Math.round(v)}" else null)
    }
    return Fam22MapData(zones, pins, emptyList(), 0, placing)
}

/* ======================= 2 · Kart ======================= */

private data class Edge50(val pr: FamPerson50, val bx: Float, val by: Float, val arrow: String)

@Composable
private fun Kart50(vm: AppViewModel, embedded: Boolean) {
    val p = PaperPal.current
    val s = vm.fam50
    val ctx = LocalContext.current
    val people = s.people ?: emptyList()
    val ctl = remember { Fam22MapCtl() }
    // Prompt 52: dårlige data for én person/ett sted gir «Kunne ikke laste kartet» i stedet for krasj.
    val data = famGuard52("kartet") { mapData50(vm, people, s.places ?: emptyList(), null, false) } ?: Fam22MapData(emptyList(), emptyList(), emptyList(), 0, false)
    var bb by remember { mutableStateOf<DoubleArray?>(null) }
    LaunchedEffect(Unit) {
        delay(250)
        ctl.fit(people.filter { it.hasPos }.map { it.lat!! to it.lon!! })
        // Utsnittet leses jevnlig, så personer utenfor får en merkelapp i kanten.
        while (true) {
            ctl.view?.let { v -> runCatching { v.boundingBox }.getOrNull()?.let { b -> bb = doubleArrayOf(b.latNorth, b.latSouth, b.lonEast, b.lonWest) } }
            delay(500)
        }
    }
    var open by remember { mutableStateOf(true) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val sheetH by animateDpAsState(if (embedded) 0.dp else if (open) minOf(430.dp, maxHeight * .55f) else 150.dp, label = "ark50")
        FamilyMapSafe(vm, Modifier.matchParentSize(), data, ctl, onPin = { id -> openPerson50(vm, id, if (embedded) null else "kart") }) { _, _ -> }
        // Personer utenfor utsnittet: «Kari · 7,4 km sør ↓» i kanten; trykk sentrerer.
        val edges = bb?.let { b ->
            val cLat = (b[0] + b[1]) / 2; val cLon = (b[2] + b[3]) / 2
            val hLat = (b[0] - b[1]) / 2; val hLon = (b[2] - b[3]) / 2
            if (hLat <= 0 || hLon <= 0) emptyList() else people.filter { it.hasPos && !it.av.self }.mapNotNull { pr ->
                val dx = (pr.lon!! - cLon) / hLon; val dy = (cLat - pr.lat!!) / hLat
                if (kotlin.math.abs(dx) <= 1 && kotlin.math.abs(dy) <= 1) null else {
                    val k = maxOf(kotlin.math.abs(dx), kotlin.math.abs(dy))
                    val arrow = if (kotlin.math.abs(dy) >= kotlin.math.abs(dx)) (if (dy > 0) "↓" else "↑") else (if (dx > 0) "→" else "←")
                    Edge50(pr, (dx / k).toFloat() * .92f, (dy / k).toFloat() * .92f, arrow)
                }
            }
        } ?: emptyList()
        Box(Modifier.matchParentSize().padding(top = if (embedded) 64.dp else 110.dp, bottom = sheetH + 12.dp, start = 8.dp, end = 8.dp)) {
            edges.forEach { e ->
                val fm = e.pr.fromMe
                Row(
                    Modifier.align(BiasAlignment(e.bx, e.by)).shadow(6.dp, CircleShape).clip(CircleShape).background(p.card)
                        .clickable { ctl.pick(e.pr.lat!!, e.pr.lon!!) }.padding(start = 4.dp, end = 12.dp).height(32.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Av50(vm, e.pr.av, 24.dp, 10.sp)
                    T50(first50(e.pr.name) + (fm?.let { " · ${it.text} ${it.dir}" } ?: "") + " " + e.arrow, 12.5.sp, p.ink, FontWeight.Bold)
                }
            }
        }
        Row(Modifier.then(if (embedded) Modifier else Modifier.statusBarsPadding()).padding(14.dp, 8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (!embedded) Pill50("‹ Familie", height = 40.dp, shadow = true) { back50(vm) }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.size(40.dp).shadow(10.dp, CircleShape).clip(CircleShape).background(p.card).clickable(role = Role.Button, onClickLabel = "Finn meg") {
                    val me = people.firstOrNull { it.av.self && it.hasPos }
                    val fix = lastFix50(ctx)
                    if (fix != null) ctl.pick(fix.latitude, fix.longitude) else if (me != null) ctl.pick(me.lat!!, me.lon!!) else vm.flash("Fant ikke posisjonen din")
                },
                contentAlignment = Alignment.Center,
            ) { Ic50(IC_LOCATE, 18.dp, p.ink, 2.2f) }
        }
        if (!embedded) Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(sheetH).shadow(20.dp, RoundedCornerShape(30.dp, 30.dp, 0.dp, 0.dp))
                .clip(RoundedCornerShape(30.dp, 30.dp, 0.dp, 0.dp)).background(p.bg),
        ) {
            // Bare håndtaket og tittelen kan dras (listen under ruller som vanlig).
            Column(
                Modifier.fillMaxWidth().pointerInput(Unit) {
                    detectVerticalDragGestures { _, dy -> if (dy > 6) open = false else if (dy < -6) open = true }
                }.clickable { open = !open },
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp, bottom = 10.dp).size(40.dp, 5.dp).clip(CircleShape).background(p.line))
                T50("${people.size} personer", 24.sp, p.ink, FontWeight.Medium, PaperFonts.serif, Modifier.padding(horizontal = 20.dp))
            }
            Column(
                Modifier.padding(14.dp, 12.dp, 14.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).verticalScroll(rememberScrollState())
                    .navigationBarsPadding(),
            ) {
                people.forEachIndexed { i, pr ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line.copy(alpha = .6f)))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable { openPerson50(vm, pr.userId, "kart") }.padding(14.dp, 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Av50(vm, pr.av, 42.dp, 14.sp)
                        Column(Modifier.weight(1f)) {
                            T50(if (pr.av.self) "Du" else pr.name, 15.5.sp, p.ink, FontWeight.Bold)
                            T50(listOfNotNull(pr.place, pr.sub).joinToString(" · "), 13.sp, p.sub)
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            pr.battery?.let { T50("$it %" + if (pr.charging == true) " ⚡" else "", 13.sp, if (pr.lowBattery) RED50 else GREEN50, FontWeight.Bold) }
                            T50(if (pr.av.self) "Her" else pr.fromMe?.text ?: "", 12.sp, p.sub)
                        }
                    }
                }
            }
        }
    }
}

/* ======================= 3 · Personside ======================= */

@Composable
private fun Person50(vm: AppViewModel, embedded: Boolean) {
    val p = PaperPal.current
    val s = vm.fam50
    val ctx = LocalContext.current
    val pr = s.people?.firstOrNull { it.userId == s.sel }
    if (pr == null) { LaunchedEffect(Unit) { s.sub = null }; return }
    val h = s.personHealth[pr.userId]
    val ctl = remember(pr.userId) { Fam22MapCtl() }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val sheetH = minOf(480.dp, maxHeight * .62f)
        val data = famGuard52("kartet") { mapData50(vm, listOf(pr), emptyList(), pr.userId, false, acc = pr) } ?: Fam22MapData(emptyList(), emptyList(), emptyList(), 0, false)
        FamilyMapSafe(vm, Modifier.fillMaxWidth().height(maxHeight - sheetH + 30.dp), data, ctl, onPin = {}) { _, _ -> }
        LaunchedEffect(pr.userId, pr.hasPos) { if (pr.hasPos) { delay(250); ctl.center(pr.lat!!, pr.lon!!, 15.0) } }
        Row(Modifier.then(if (embedded) Modifier else Modifier.statusBarsPadding()).padding(14.dp, 8.dp)) {
            Pill50(when (s.from) { "kart" -> "‹ Kart"; "helsep" -> "‹ Helse"; else -> if (embedded) "‹ Kart" else "‹ Folk" }, height = 40.dp, shadow = true) { back50(vm) }
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(sheetH).shadow(20.dp, RoundedCornerShape(30.dp, 30.dp, 0.dp, 0.dp))
                .clip(RoundedCornerShape(30.dp, 30.dp, 0.dp, 0.dp)).background(p.bg).verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp).padding(bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp).size(40.dp, 5.dp).clip(CircleShape).background(p.line))
            Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Av50(vm, pr.av, 52.dp, 17.sp)
                Column(Modifier.weight(1f)) {
                    T50(if (pr.av.self) "Du" else pr.name, 28.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 30.sp)
                    T50(pr.statusLine ?: pr.place, 13.5.sp, p.sub, maxLines = 2)
                }
            }
            if (!pr.av.self) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Act50("Ring", IC_CALL, Modifier.weight(1f)) { dial50(ctx, pr.phone); if (pr.phone == null) vm.flash("Fant ikke telefonnummeret til ${first50(pr.name)}") }
                Act50("Melding", IC_MSG, Modifier.weight(1f)) {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + (pr.phone ?: ""))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
                Act50("Veibeskrivelse", IC_ROUTE, Modifier.weight(1f)) {
                    if (!pr.hasPos) vm.flash("${first50(pr.name)} deler ikke posisjon") else runCatching {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(String.format(java.util.Locale.US, "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", pr.lat, pr.lon)))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
            }
            val shared = h?.shared == true
            Grid50(listOf(
                { m -> Stat50("BATTERI", pr.battery?.let { "$it %" } ?: "–", if (pr.charging == true) "Lader" else "Lader ikke", m) },
                { m -> Stat50("NØYAKTIGHET", pr.acc?.let { "${Math.round(it)} m" } ?: if (pr.approx) "≈ 1 km" else "–", pr.device ?: if (pr.approx) "Omtrentlig" else null, m) },
                { m -> Stat50("SKRITT I DAG", if (shared) h?.stepsText ?: fmt50(h?.steps) else "–", if (shared) h?.badge ?: h?.goalText else "Ikke delt", m) },
                { m -> Stat50("SØVN", if (shared) h?.sleepText ?: "–" else "–", if (shared) h?.restingHr?.let { "Hvilepuls $it" } else "Ikke delt", m) },
            ))
            if (shared && h != null && h.week.isNotEmpty()) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Lab50("SKRITT · SISTE 7 DAGER", p.sub)
                    Bars50(h.week, Color(pr.av.color), 44.dp, 8.dp, 5.dp)
                }
            } else if (!pr.av.self) {
                T50(h?.text ?: "${first50(pr.name)} deler ikke helse med deg", 13.sp, p.sub, modifier = Modifier.padding(horizontal = 4.dp), maxLines = 2)
            }
            if (pr.av.self) T50("Dette er deg. Personvern og deling ›", 13.sp, p.ink, FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 4.dp).clickable { vm.famPrivacy = true })
        }
    }
}

@Composable
private fun Act50(label: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Column(
        modifier.height(56.dp).clip(RoundedCornerShape(18.dp)).background(p.card).clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        Ic50(icon, 18.dp, p.ink)
        T50(label, 12.5.sp, p.ink, FontWeight.Bold)
    }
}

/* ======================= 4 · Steder ======================= */

@Composable
private fun Steder50(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.fam50
    Column(Modifier.padding(20.dp, 40.dp, 20.dp, 16.dp)) {
        T50("Steder", 38.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 38.sp)
        Spacer(Modifier.height(6.dp))
        T50("Få beskjed når noen kommer eller drar", 13.5.sp, p.sub)
    }
    Column(Modifier.padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val places = s.places
        if (places == null) T50("Henter stedene …", 13.sp, p.sub, modifier = Modifier.padding(horizontal = 6.dp))
        else if (places.isEmpty()) T50("Ingen steder ennå. Legg til Hjem, Skole eller Jobb.", 13.sp, p.sub, modifier = Modifier.padding(horizontal = 6.dp), maxLines = 3)
        places?.forEach { pl -> PlaceCard50(vm, pl) { s.placeSel = pl.id; s.sub = "sted" } }
        Dashed50("+ Nytt sted", 52.dp) { s.newType = "annet"; s.placeSel = "new"; s.sub = "sted" }
        Spacer(Modifier.height(4.dp))
        ZoneAlertsCard45(vm) // Posisjonsvarsler: hovedbryter og per person (prompt 45)
    }
}

@Composable
private fun PlaceIcon50(pl: FamPlace50?, type: String, size: Dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size * .32f)).background(Color(pl?.color ?: 0xFF2B5D8A)), contentAlignment = Alignment.Center) {
        Ic50(fam22IconPath(iconFor50(pl?.type ?: type, pl?.icon)), size * .5f, Color.White)
    }
}

@Composable
private fun PlaceCard50(vm: AppViewModel, pl: FamPlace50, onClick: () -> Unit) {
    val p = PaperPal.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).clickable(role = Role.Button, onClickLabel = "Endre ${pl.name}", onClick = onClick)
            .padding(14.dp, 11.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PlaceIcon50(pl, pl.type, 44.dp)
            Column(Modifier.weight(1f)) {
                T50(pl.name, 16.sp, p.ink, FontWeight.Bold)
                T50(pl.hereText + if (pl.areas.size > 1) " · ${pl.areaText}" else "", 12.5.sp, p.sub)
            }
            Row {
                pl.here.take(4).forEachIndexed { i, w -> Av50(vm, w, 30.dp, 11.sp, ring = p.card, modifier = Modifier.offset(x = (-8 * i).dp)) }
            }
        }
        if (pl.areas.size > 1) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            pl.areas.forEach { a ->
                Row(Modifier.height(28.dp).clip(CircleShape).background(p.bg).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    T50(a.name, 12.sp, p.ink, FontWeight.SemiBold)
                    T50("${a.radius} m", 12.sp, p.mut, FontWeight.SemiBold)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().drawBehind { drawLine(p.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Ic50(IC_BELL, 15.dp, p.sub)
            T50(pl.notifyText ?: "Ingen varsler", 13.sp, p.sub, modifier = Modifier.weight(1f), maxLines = 2)
            T50("Endre", 13.sp, RED50, FontWeight.Bold)
        }
    }
}

/* ----- 4b · Sted med flere områder ----- */

private data class AreaEdit50(val placeId: String?, val areaId: String?, val name: String, val r: Int, val lat: Double, val lon: Double)

@Composable
private fun Sted50(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.fam50
    val isNew = s.placeSel == "new"
    val pl = if (isNew) null else s.places?.firstOrNull { it.id == s.placeSel }
    if (!isNew && pl == null) {
        if (s.places != null) LaunchedEffect(Unit) { s.sub = null; s.placeSel = null }
        return
    }
    val canEdit = isNew || pl?.canEdit == true
    val wide = LocalWide45.current
    var name by remember(s.placeSel) { mutableStateOf(pl?.name ?: typeName50(s.newType)) }
    var type by remember(s.placeSel) { mutableStateOf(pl?.type ?: s.newType) }
    val draft = remember(s.placeSel) { mutableStateListOf<FamArea50>() }
    val areas = if (isNew) draft.toList() else pl!!.areas
    var placing by remember(s.placeSel) { mutableStateOf(isNew) }
    var edit by remember { mutableStateOf<AreaEdit50?>(null) }
    var delArm by remember { mutableStateOf(false) }
    val ctl = remember(s.placeSel) { Fam22MapCtl() }
    val shown = FamPlace50(pl?.id ?: "new", name, type, pl?.color ?: 0xFFA8661A, pl?.icon, true, false, emptyMap(), areas, "", emptyList(), "", null, null, true, true)
    val data = famGuard52("kartet") { mapData50(vm, emptyList(), listOf(shown), null, placing && canEdit) } ?: Fam22MapData(emptyList(), emptyList(), emptyList(), 0, false)
    LaunchedEffect(s.placeSel, areas.size) {
        delay(250)
        if (areas.isEmpty()) {
            val f = lastFix50(vm.appCtx50)
            if (f != null) ctl.center(f.latitude, f.longitude, 16.0)
        } else if (areas.size == 1) ctl.showZone(areas[0].lat, areas[0].lon, areas[0].radius.toDouble(), 300f)
        else { ctl.fit(areas.map { it.lat to it.lon }); ctl.zoomOut() }
    }
    fun save() {
        if (isNew) {
            if (draft.isEmpty()) { vm.flash("Legg til minst ett område på kartet"); placing = true; return }
            vm.createPlace50(name, type, draft.toList()) { s.sub = null; s.placeSel = null }
        } else {
            if (pl != null && canEdit && name.trim() != pl.name && name.isNotBlank()) vm.patchPlace50(pl.id, JSONObject().put("name", name.trim()))
            s.sub = null; s.placeSel = null
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 30.dp)) {
        Box(Modifier.fillMaxWidth().height(300.dp).background(p.surf2)) {
            FamilyMapSafe(vm, Modifier.matchParentSize(), data, ctl, onPin = {}) { la, lo ->
                placing = false
                edit = AreaEdit50(pl?.id, null, if (areas.isEmpty()) name.ifBlank { "Område" } else "Område ${areas.size + 1}", 100, la, lo)
            }
            Row(Modifier.then(if (wide) Modifier else Modifier.statusBarsPadding()).padding(14.dp, 8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Pill50("‹ Steder", height = 38.dp, shadow = true) { back50(vm) }
                Spacer(Modifier.weight(1f))
                if (canEdit) Pill50("Lagre", dark = true, height = 38.dp) { save() }
            }
            if (placing && canEdit) Box(
                Modifier.align(Alignment.BottomCenter).padding(12.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.ink).padding(14.dp, 10.dp),
                contentAlignment = Alignment.Center,
            ) { T50("Trykk på kartet der området skal være", 13.sp, p.bg, FontWeight.SemiBold) }
        }
        Column(Modifier.padding(20.dp, 14.dp, 20.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (canEdit) BasicTextField(name, { name = it.take(60) }, singleLine = true, cursorBrush = SolidColor(p.ink),
                textStyle = TextStyle(color = p.ink, fontSize = 32.sp, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium))
            else T50(name, 32.sp, p.ink, FontWeight.Medium, PaperFonts.serif)
            val n = areas.size
            T50(
                if (n == 0) "Legg til ett eller flere områder. Er du i ett av dem, er du på ${name.ifBlank { "stedet" }}."
                else if (n == 1) "Ett sted med ett område. Legg til flere om stedet er spredt." else "Ett sted med $n områder. Er du i ett av dem, er du på ${name.ifBlank { "stedet" }}.",
                13.sp, p.sub, maxLines = 3,
            )
            if (!canEdit) T50("Delt av en annen i familien – bare den som lagde stedet kan endre det.", 12.5.sp, p.lab, maxLines = 2)
        }
        Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
            val c = Color(pl?.color ?: 0xFFA8661A)
            if (areas.isEmpty()) T50("Ingen områder ennå", 13.5.sp, p.sub, modifier = Modifier.padding(14.dp, 14.dp))
            areas.forEachIndexed { i, a ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line.copy(alpha = .6f)))
                Row(Modifier.fillMaxWidth().heightIn(min = 50.dp).padding(start = 14.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(c.copy(alpha = .25f)).border(2.dp, c, CircleShape))
                    T50(a.name, 14.5.sp, p.ink, FontWeight.Bold, modifier = Modifier.weight(1f).then(if (canEdit) Modifier.clickable {
                        edit = AreaEdit50(pl?.id, a.id, a.name, a.radius, a.lat, a.lon)
                    } else Modifier))
                    Box(
                        Modifier.height(30.dp).clip(CircleShape).background(p.bg).then(if (canEdit) Modifier.clickable(onClickLabel = "Endre radius") {
                            edit = AreaEdit50(pl?.id, a.id, a.name, a.radius, a.lat, a.lon)
                        } else Modifier).padding(horizontal = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) { T50("${a.radius} m", 12.5.sp, p.ink, FontWeight.Bold) }
                    if (canEdit) Box(
                        Modifier.size(36.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fjern ${a.name}") {
                            if (isNew) draft.remove(a)
                            else if (areas.size <= 1) vm.message = "Det siste området kan ikke fjernes. Slett heller stedet."
                            else vm.deleteArea50(pl!!, a)
                        },
                        contentAlignment = Alignment.Center,
                    ) { T50("✕", 13.sp, if (!isNew && areas.size <= 1) p.line else p.mut, FontWeight.Bold) }
                }
            }
        }
        if (canEdit) Box(Modifier.padding(14.dp, 8.dp, 14.dp, 0.dp)) {
            Dashed50(if (placing) "Avbryt" else "+ Legg til område på kartet", 44.dp) { placing = !placing }
        }
        Lab50("TYPE", p.sub, modifier = Modifier.padding(20.dp, 14.dp, 20.dp, 6.dp))
        Row(Modifier.padding(horizontal = 14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            s.placeTypes.forEach { t ->
                val on = type == t
                Box(
                    Modifier.weight(1f).height(36.dp).clip(CircleShape).background(if (on) p.ink else p.card)
                        .then(if (canEdit) Modifier.clickable(role = Role.RadioButton) {
                            type = t
                            if (!isNew && pl != null) vm.patchPlace50(pl.id, JSONObject().put("type", t))
                        } else Modifier),
                    contentAlignment = Alignment.Center,
                ) { T50(typeName50(t), 12.5.sp, if (on) p.bg else p.ink, FontWeight.Bold) }
            }
        }
        if (pl != null) {
            Lab50("VARSLER", p.sub, modifier = Modifier.padding(20.dp, 16.dp, 20.dp, 6.dp))
            val members = vm.family?.members ?: emptyList()
            Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                if (members.isEmpty()) T50("Ingen i familien ennå", 13.sp, p.sub, modifier = Modifier.padding(14.dp))
                members.forEachIndexed { i, m ->
                    val on = pl.notify[m.userId]?.let { it.first || it.second } == true
                    PToggle(m.name, "Varsel når ${first50(m.name)} kommer og drar", on, top = i > 0) { v -> vm.notifyPlace50(pl.id, m.userId, v) }
                }
            }
            if (canEdit) Column(Modifier.padding(14.dp, 8.dp, 14.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
                PToggle("Del med familien", "De andre ser stedet og kan få varsler", pl.shared) { v -> vm.patchPlace50(pl.id, JSONObject().put("shared", v)) }
            }
        }
        val used = pl?.usedByText ?: if (type == "skole") "Brukes av Ruter (Min reise starter når du forlater ${name.ifBlank { "Skole" }})." else null
        if (used != null) T50(used, 12.5.sp, p.sub, maxLines = 3, lineHeight = 18.sp,
            modifier = Modifier.padding(14.dp, 10.dp, 14.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).padding(14.dp, 10.dp))
        if (pl != null && canEdit) {
            Box(Modifier.padding(14.dp, 16.dp, 14.dp, 0.dp).fillMaxWidth()) {
                PButton(if (delArm) "Trykk igjen for å slette ${pl.name}" else "Slett stedet", Modifier.fillMaxWidth(), kind = if (delArm) "lab" else "line", height = 44.dp) {
                    if (!delArm) delArm = true else vm.deletePlace50(pl) { s.sub = null; s.placeSel = null }
                }
            }
            LaunchedEffect(delArm) { if (delArm) { delay(3000); delArm = false } }
        }
    }
    edit?.let { e ->
        AreaDialog50(e, onDismiss = { edit = null }) { nm, r ->
            edit = null
            when {
                isNew && e.areaId == null -> draft.add(FamArea50("d${System.nanoTime()}", nm, e.lat, e.lon, r, "$nm $r m"))
                isNew -> draft.indexOfFirst { it.id == e.areaId }.takeIf { it >= 0 }?.let { idx -> draft[idx] = draft[idx].copy(name = nm, radius = r, label = "$nm $r m") }
                e.areaId == null && pl != null -> vm.addArea50(pl.id, nm, e.lat, e.lon, r)
                pl != null && e.areaId != null -> vm.patchArea50(pl.id, e.areaId, nm, r)
            }
        }
    }
}

/** Navn og radius (25–1000 m) for et område. */
@Composable
private fun AreaDialog50(e: AreaEdit50, onDismiss: () -> Unit, onSave: (String, Int) -> Unit) {
    val p = PaperPal.current
    var name by remember { mutableStateOf(e.name) }
    var r by remember { mutableFloatStateOf(e.r.toFloat()) }
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.bg).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            T50(if (e.areaId == null) "Nytt område" else "Endre område", 24.sp, p.ink, FontWeight.Medium, PaperFonts.serif)
            Lab50("NAVN", p.sub)
            BasicTextField(name, { name = it.take(60) }, singleLine = true, cursorBrush = SolidColor(p.ink),
                textStyle = TextStyle(color = p.ink, fontSize = 16.sp, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp, 12.dp))
            Lab50("RADIUS · ${r.toInt()} M", p.sub)
            Slider(r, { v -> r = (Math.round(v / 5f) * 5).toFloat().coerceIn(25f, 1000f) }, valueRange = 25f..1000f,
                colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line", height = 44.dp) { onDismiss() }
                PButton("Lagre", Modifier.weight(1f), height = 44.dp) { onSave(name.trim().ifBlank { "Område" }, r.toInt()) }
            }
        }
    }
}

/* ======================= 5 · Helse ======================= */

@Composable
private fun Helse50(vm: AppViewModel, wide: Boolean) {
    val p = PaperPal.current
    val s = vm.fam50
    Column(Modifier.padding(20.dp, 40.dp, 20.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        T50("Helse", 38.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 38.sp)
        s.healthSummary?.let { T50(it, 19.sp, p.sub, FontWeight.Medium, PaperFonts.serif, maxLines = 3, lineHeight = 23.sp) }
    }
    Column(Modifier.padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val list = s.health
        if (list == null) T50("Henter helse …", 13.sp, p.sub, modifier = Modifier.padding(horizontal = 6.dp))
        list?.forEach { h -> HealthCard50(vm, h) }
        Spacer(Modifier.height(4.dp))
        T50("Din deling: Personvern og helse ›", 13.sp, p.ink, FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 6.dp).clickable { vm.famPrivacy = true })
    }
}

@Composable
private fun HealthCard50(vm: AppViewModel, h: FamHealth50) {
    val p = PaperPal.current
    val s = vm.fam50
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)
            .clickable(enabled = h.shared, role = Role.Button) {
                Haptics.tap(); s.sel = h.av.userId; s.personHealth = s.personHealth + (h.av.userId to h); s.sub = "helsep"; vm.loadPersonHealth50(h.av.userId)
            }.padding(14.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.alpha(if (h.shared) 1f else .5f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(Modifier.width(100.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Av50(vm, h.av, 26.dp, 10.sp)
                    T50(if (h.av.self) "Du" else first50(h.av.name), 14.sp, p.ink, FontWeight.Bold)
                }
                T50(if (h.shared) h.stepsText ?: fmt50(h.steps) else "—", 19.sp, p.ink, FontWeight.Bold)
            }
            Box(Modifier.weight(1f)) {
                if (h.shared && h.week.isNotEmpty()) Bars50(h.week, Color(h.av.color), 46.dp, 5.dp, 4.dp)
                else Bars50(List(7) { FamDay50("", it == 6, 0, false) }, p.line, 46.dp, 5.dp, 4.dp)
            }
            if (h.shared) T50("›", 18.sp, p.mut)
        }
        if (h.shared) Row(
            Modifier.fillMaxWidth().drawBehind { drawLine(p.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Mini50("SØVN", h.sleepText ?: "–", Modifier.weight(1f))
            Mini50("HVILEPULS", h.restingHr?.let { "$it bpm" } ?: "–", Modifier.weight(1f))
            Mini50("AKTIV", h.activeKcal?.let { "$it kcal" } ?: "–", Modifier.weight(1f))
        } else T50(
            "Deler ikke helse med deg · " + (h.actionLabel ?: "Be om deling ›"), 12.5.sp, p.sub,
            modifier = Modifier.clickable(enabled = !h.av.self) { vm.requestHealth50(h) }, maxLines = 2,
        )
    }
}

@Composable
private fun Mini50(k: String, v: String, modifier: Modifier) {
    val p = PaperPal.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Lab50(k, p.mut, 9.5.sp)
        T50(v, 13.5.sp, p.ink, FontWeight.Bold)
    }
}

/* ----- 5b · Helse for personen ----- */

@Composable
private fun HealthPerson50(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.fam50
    val h = s.personHealth[s.sel] ?: s.health?.firstOrNull { it.av.userId == s.sel }
    Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp, 16.dp, 0.dp), verticalAlignment = Alignment.CenterVertically) {
        Pill50("‹ Helse") { back50(vm) }
        Spacer(Modifier.weight(1f))
        if (s.people?.any { it.userId == s.sel } == true) Pill50("Posisjon ›") { s.sel?.let { openPerson50(vm, it, "helsep") } }
    }
    if (h == null) { T50("Henter …", 13.sp, p.sub, modifier = Modifier.padding(20.dp)); return }
    Row(Modifier.padding(20.dp, 12.dp, 20.dp, 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Av50(vm, h.av, 52.dp, 17.sp)
        Column {
            T50(if (h.av.self) "Du" else h.av.name, 30.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 32.sp)
            T50(h.sourceText ?: "I dag", 13.sp, p.sub)
        }
    }
    if (!h.shared) {
        T50(h.text ?: "Deler ikke helse med deg", 14.sp, p.sub, modifier = Modifier.padding(horizontal = 20.dp), maxLines = 3)
        if (!h.av.self) Box(Modifier.padding(14.dp, 12.dp)) { PButton(h.actionLabel ?: "Be om deling ›", Modifier.fillMaxWidth(), height = 44.dp) { vm.requestHealth50(h) } }
        return
    }
    Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Lab50("SKRITT I DAG", p.sub)
                T50(h.stepsText ?: fmt50(h.steps), 34.sp, p.ink, FontWeight.ExtraBold, lineHeight = 36.sp)
            }
            h.badge?.let { b ->
                Box(Modifier.height(28.dp).clip(CircleShape).background(if (h.goalReached) GREEN50.copy(alpha = .14f) else p.bg).padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center) { T50(b, 12.5.sp, if (h.goalReached) GREEN50 else p.ink, FontWeight.Bold) }
            }
        }
        if (h.week.isNotEmpty()) {
            Bars50(h.week, Color(h.av.color), 96.dp, 8.dp, 6.dp, goal = h.goal, light = true)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                h.week.forEach { d -> T50(d.day.replaceFirstChar { it.uppercase() }, 11.sp, if (d.today) p.ink else p.mut, FontWeight.SemiBold, modifier = Modifier.weight(1f), align = TextAlign.Center) }
            }
        }
        h.weekText?.let { T50(it, 12.5.sp, p.sub, maxLines = 2) }
    }
    Box(Modifier.padding(14.dp, 8.dp, 14.dp, 0.dp)) {
        Grid50(listOf(
            { m -> Stat50("SØVN I NATT", h.sleepText ?: "–", h.sleepRange, m) },
            { m -> Stat50("HVILEPULS", h.restingHr?.let { "$it bpm" } ?: "–", h.hr?.let { "Puls nå $it" }, m) },
            { m -> Stat50("AKTIVE KALORIER", h.activeKcal?.let { "$it kcal" } ?: "–", "I dag", m) },
            { m -> Stat50("BATTERI", h.battery?.let { "$it %" } ?: "–", if (h.charging == true) "Lader" else "Lader ikke", m) },
        ))
    }
    Row(
        Modifier.padding(14.dp, 8.dp, 14.dp, 0.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .clickable { if (h.av.self) vm.famPrivacy = true else vm.flash(h.shareText ?: "${first50(h.av.name)} velger selv hva som deles") }.padding(14.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        T50(h.shareText ?: "${h.av.name} deler helse med deg.", 13.sp, p.sub, modifier = Modifier.weight(1f), maxLines = 2)
        T50("Deling ›", 13.sp, p.ink, FontWeight.Bold)
    }
}

/* ======================= 6 · Sjekk inn ======================= */

private val REMIND50 = listOf<Int?>(null, 30, 60, 120, 180)

private fun remindText50(m: Int?): String = if (m == null) "Av" else {
    val t = java.time.LocalTime.now(ZoneId.of("Europe/Oslo")).plusMinutes(m.toLong())
    "kl. " + t.format(DateTimeFormatter.ofPattern("HH:mm"))
}

@Composable
private fun Sjekk50(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.fam50
    val c = s.checkin
    LaunchedEffect(vm.account?.id) { vm.loadCheckin50(); vm.loadHjemlys40(force = true) }
    // 6b etter oppstart når siste innsjekk er fersk (under 2 t).
    var opened by remember { mutableStateOf(false) }
    LaunchedEffect(c?.latest?.id) {
        val l = c?.latest
        if (!opened && l != null) {
            opened = true
            val age = runCatching { Duration.between(Instant.parse(l.createdAt), Instant.now()).toMinutes() }.getOrNull()
            if (age != null && age < 120 && s.replyTo == null) s.showSent = true
        }
    }
    Column(Modifier.padding(20.dp, 40.dp, 20.dp, 12.dp)) {
        T50("Sjekk inn", 38.sp, p.ink, FontWeight.Medium, PaperFonts.serif, lineHeight = 38.sp)
        if (!(s.showSent && c?.latest != null)) { Spacer(Modifier.height(6.dp)); T50("Si fra hvor du er og at alt er bra", 13.5.sp, p.sub) }
    }
    if (c == null) { T50("Henter …", 13.sp, p.sub, modifier = Modifier.padding(horizontal = 20.dp)); return }
    // «På vei hjem» (Vel fremme) som pågår.
    val trip = famGuard52("«På vei hjem»") { vm.p40.hl?.mine?.takeIf { it.state != "home" && it.state != "ended" } }
    if (trip != null) Box(Modifier.padding(horizontal = 14.dp).padding(bottom = 10.dp)) { HjemlysCard40(vm, compact = true) }
    c.requests.forEach { r -> Request50(vm, r) }
    val latest = c.latest
    if (s.showSent && latest != null) Sent50(vm, latest) else Form50(vm, c)
    Lab50(c.logTitle, p.sub, modifier = Modifier.padding(20.dp, 16.dp, 20.dp, 6.dp))
    ItemList50(vm, c.log, empty = "Ingen innsjekker i dag ennå")
}

@Composable
private fun Request50(vm: AppViewModel, r: FamCheckin50) {
    val p = PaperPal.current
    val s = vm.fam50
    Column(
        Modifier.padding(horizontal = 14.dp).padding(bottom = 10.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)
            .border(1.5.dp, RED50.copy(alpha = .5f), RoundedCornerShape(20.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Av50(vm, r.from, 30.dp, 11.sp)
            Column(Modifier.weight(1f)) {
                T50(r.title, 14.sp, p.ink, FontWeight.Bold, maxLines = 2)
                T50(listOfNotNull(r.text, r.time).joinToString(" · "), 12.sp, p.sub)
            }
            T50("Venter", 12.sp, RED50, FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton("👍 Alt bra", Modifier.weight(1f), kind = "line", height = 40.dp) { vm.replyCheckin50(r.id, "ok") }
            PButton("Sjekk inn", Modifier.weight(1f), height = 40.dp) { s.replyTo = r.id; s.showSent = false; vm.seenCheckin50(r.id) }
        }
    }
}

@Composable
private fun Form50(vm: AppViewModel, c: FamCheckinTab50) {
    val p = PaperPal.current
    val s = vm.fam50
    var placeIdx by remember { mutableIntStateOf(0) }
    var placeOpen by remember { mutableStateOf(false) }
    var custom by remember { mutableStateOf("") }
    var quick by remember { mutableStateOf(c.quick.firstOrNull()?.id) }
    var own by remember { mutableStateOf("") }
    var ownOn by remember { mutableStateOf(false) }
    val replyFrom = s.replyTo?.let { id -> c.requests.firstOrNull { it.id == id } }
    var to by remember(c.people.size, s.replyTo) {
        mutableStateOf(replyFrom?.from?.userId?.let { setOf(it) } ?: c.people.map { it.userId }.toSet())
    }
    var remind by remember { mutableIntStateOf(0) }
    val sugg = c.suggestions.ifEmpty { listOfNotNull(c.suggestion) }
    val place: FamSuggest50? = if (custom.isNotBlank()) FamSuggest50("custom", custom.trim(), null, custom.trim(), null, null, null, null) else sugg.getOrNull(placeIdx)
    if (s.replyTo != null) Row(
        Modifier.padding(horizontal = 14.dp).padding(bottom = 8.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.surf2).padding(14.dp, 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        T50("Svarer på forespørselen" + (replyFrom?.from?.let { " fra ${first50(it.name)}" } ?: ""), 13.sp, p.ink, FontWeight.SemiBold, modifier = Modifier.weight(1f))
        T50("✕", 14.sp, p.mut, FontWeight.Bold, modifier = Modifier.clickable { s.replyTo = null })
    }
    Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFF7A3B6B)), contentAlignment = Alignment.Center) { Ic50(IC_PIN, 22.dp, Color.White) }
            Column(Modifier.weight(1f)) {
                T50(place?.title ?: "Ukjent sted", 16.sp, p.ink, FontWeight.Bold)
                T50(place?.let { pl -> (if (pl.source == "calendar") "Fra kalenderen · " else "") + (pl.label.removePrefix(pl.title).removePrefix(" · ").ifBlank { pl.detail ?: "" }) } ?: "Fant ingen posisjon", 12.5.sp, p.sub)
            }
            T50("Endre", 13.sp, RED50, FontWeight.Bold, modifier = Modifier.clickable { placeOpen = !placeOpen })
        }
        if (placeOpen) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            sugg.forEachIndexed { i, sg ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (i == placeIdx && custom.isBlank()) p.bg else Color.Transparent)
                    .clickable { placeIdx = i; custom = ""; placeOpen = false }.padding(10.dp, 8.dp)) {
                    T50(sg.label, 13.5.sp, p.ink, FontWeight.SemiBold, maxLines = 2)
                }
            }
            BasicTextField(custom, { custom = it.take(80) }, singleLine = true, cursorBrush = SolidColor(p.ink),
                textStyle = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.bg).padding(12.dp, 10.dp),
                decorationBox = { inner -> if (custom.isEmpty()) T50("Skriv et sted eller en adresse", 14.sp, p.mut); inner() })
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Lab50("HVA VIL DU SI?", p.sub)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                c.quick.forEach { q ->
                    val on = !ownOn && quick == q.id
                    Chip50(q.text, on, if (q.high) RED50 else null) { quick = q.id; ownOn = false }
                }
                Chip50("Egen tekst", ownOn, null) { ownOn = true }
            }
            if (ownOn) BasicTextField(own, { own = it.take(200) }, cursorBrush = SolidColor(p.ink),
                textStyle = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.bg).padding(12.dp, 10.dp),
                decorationBox = { inner -> if (own.isEmpty()) T50("Skriv hva du vil si", 14.sp, p.mut); inner() })
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Lab50("TIL", p.sub)
            if (c.people.isEmpty()) T50("Ingen andre i familien ennå", 13.sp, p.sub)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                c.people.forEach { a ->
                    val on = a.userId in to
                    Column(Modifier.alpha(if (on) 1f else .45f).clickable(role = Role.Checkbox, onClickLabel = a.name) { to = if (on) to - a.userId else to + a.userId },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box {
                            Av50(vm, a, 46.dp, 14.sp)
                            if (on) Box(Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp).size(20.dp).clip(CircleShape).background(GREEN50).border(2.dp, p.card, CircleShape),
                                contentAlignment = Alignment.Center) { T50("✓", 11.sp, Color.White, FontWeight.ExtraBold) }
                        }
                        T50(first50(a.name), 12.5.sp, p.ink, FontWeight.SemiBold)
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().drawBehind { drawLine(p.line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            T50("Minn meg på å sjekke inn igjen", 13.5.sp, p.ink, FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 2)
            Box(Modifier.height(30.dp).clip(CircleShape).background(p.bg).clickable(onClickLabel = "Endre påminnelse") { remind = (remind + 1) % REMIND50.size }
                .padding(horizontal = 12.dp), contentAlignment = Alignment.Center) { T50(remindText50(REMIND50[remind]), 12.5.sp, p.ink, FontWeight.Bold) }
        }
    }
    val names = c.people.filter { it.userId in to }.map { first50(it.name) }
    val pickup = !ownOn && quick == "pickup"
    Box(
        Modifier.padding(14.dp, 12.dp, 14.dp, 0.dp).fillMaxWidth().height(56.dp).clip(CircleShape).background(if (pickup) RED50 else p.ink)
            .clickable(enabled = !s.sending, role = Role.Button) {
                vm.sendCheckin50(to.toList(), if (ownOn) null else quick, if (ownOn) own else null, place, REMIND50[remind])
            },
        contentAlignment = Alignment.Center,
    ) {
        T50(
            if (s.sending) "Sender …" else if (names.isEmpty()) "Velg hvem som får beskjed" else (if (pickup) "Send «Hent meg» til " else "Sjekk inn til ") + join50(names),
            16.sp, if (pickup) Color.White else p.bg, FontWeight.ExtraBold,
        )
    }
    Row(Modifier.padding(14.dp, 8.dp, 14.dp, 0.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("På vei hjem", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.p40.hlSheet = true }
        PButton("Be noen sjekke inn", Modifier.weight(1f), kind = "line", height = 44.dp) { vm.requestCheckin50(to.toList()) }
    }
}

@Composable
private fun Chip50(text: String, on: Boolean, accent: Color?, onClick: () -> Unit) {
    val p = PaperPal.current
    val bg = if (on) accent ?: p.ink else p.card
    Box(
        Modifier.height(38.dp).clip(CircleShape).background(bg).border(1.5.dp, if (on) bg else p.line, CircleShape)
            .clickable(role = Role.RadioButton, onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { T50(text, 13.sp, if (on) (if (accent != null) Color.White else p.bg) else p.ink, FontWeight.Bold) }
}

/** 6b: «Sjekket inn 19:42 · Sett av Ingrid», meldingen og stedet, påminnelse, «Hent meg» og «Sjekk inn igjen». */
@Composable
private fun Sent50(vm: AppViewModel, l: FamCheckin50) {
    val p = PaperPal.current
    val s = vm.fam50
    Column(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.ink).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(if (l.kind == "pickup") RED50 else GREEN50), contentAlignment = Alignment.Center) {
                T50(if (l.kind == "pickup") "!" else "✓", 14.sp, Color.White, FontWeight.ExtraBold)
            }
            T50(l.title, 16.sp, p.bg, FontWeight.Bold, modifier = Modifier.weight(1f))
            l.seenText?.let { T50(it, 12.5.sp, p.bg.copy(alpha = .7f)) }
        }
        T50("«${l.text ?: ""}»" + (l.placeName?.let { " · $it" } ?: ""), 22.sp, p.bg, FontWeight.Medium, PaperFonts.serif, maxLines = 3, lineHeight = 26.sp)
        l.reminderText?.let { T50(it, 12.5.sp, p.bg.copy(alpha = .75f)) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f).height(44.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) { vm.pickup50(l) }, contentAlignment = Alignment.Center) {
                T50("Hent meg", 13.5.sp, p.ink, FontWeight.Bold)
            }
            Box(Modifier.weight(1f).height(44.dp).clip(CircleShape).border(1.5.dp, p.bg.copy(alpha = .35f), CircleShape).clickable(role = Role.Button) { s.showSent = false },
                contentAlignment = Alignment.Center) { T50("Sjekk inn igjen", 13.5.sp, p.bg, FontWeight.Bold) }
        }
    }
}

/* ======================= Ruter › Min reise ======================= */

/**
 * «SKOLE · FRA FAMILIE › STEDER»: områdene i stedet med type skole, bare som visning (ingen ✕ eller + Sone).
 * «Endre i Steder ›» åpner Familie på Steder med skolen. Ingen skole: «Ingen skole valgt · Legg til i Steder ›».
 * Eldre server (404 på /ruter/school50): de gamle skolesonene (Zones41).
 */
@Composable
internal fun School50(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.fam50
    LaunchedEffect(vm.account?.id) { vm.loadSchool50() }
    if (s.schoolMissing) { Zones41(vm); return }
    val sc = s.school
    PLabel(sc?.title ?: "SKOLE · FRA FAMILIE › STEDER", p.mut)
    if (sc == null) { Text("Henter skolen …", color = p.mut, fontSize = 12.5.sp); return }
    if (sc.placeId == null) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(sc.emptyText ?: "Ingen skole valgt", color = p.mut, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(sc.emptyAction ?: "Legg til i Steder ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(CircleShape).clickable(role = Role.Button) { vm.openSteder50(null, "skole") }.padding(8.dp, 6.dp))
        }
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        sc.areas.forEach { a ->
            Text(a.label, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp,
                modifier = Modifier.clip(CircleShape).border(1.dp, p.line, CircleShape).padding(12.dp, 7.dp))
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Når du forlater alle områdene (ute i 2 min, hverdager 07–18) vises Min reise.", color = p.mut, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.weight(1f))
        Text(sc.editLabel ?: "Endre i Steder ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.clip(CircleShape).clickable(role = Role.Button) { vm.openSteder50(sc.placeId) }.padding(8.dp, 6.dp))
    }
}
