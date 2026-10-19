package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 34 (ANDROID34): AI-kontroll i fullskjerm (AI Kontroll.dc.html, variant mobile, theme papir/mørk).
 * Åpnes fra Innstillinger → App → AI og modeller, fra Chat (Modeller / «Full AI-kontroll ›») og fra AI-feil («Åpne AI-kontroll»).
 * Faner: Oversikt · Modeller · Valg · Jobber · Forbruk · API og nøkler. Haptikk ved alle valg, toast nederst, Ferdig-pillen.
 */

internal class AcT34(val bg: Color, val card: Color, val fld: Color, val line: Color, val ink: Color, val mut: Color, val acc: Color, val ok: Color, val warn: Color, val bad: Color)

private val PAPIR34 = AcT34(Color(0xFFF3EFE6), Color(0xFFFFFDF8), Color(0xFFECE6DA), Color(0xFFDDD5C5), Color(0xFF1B1A17), Color(0xFF6B665C), Color(0xFFB23A2A), Color(0xFF2F7A4F), Color(0xFFA8661A), Color(0xFFB23A2A))
private val MORK34 = AcT34(Color(0xFF161513), Color(0xFF211F1B), Color(0xFF2B2824), Color(0xFF3B3731), Color(0xFFEFE9DE), Color(0xFFA49D91), Color(0xFFEC7A64), Color(0xFF6FC28F), Color(0xFFE0A85A), Color(0xFFEC7A64))

private val TABS34 = listOf("ov" to "Oversikt", "mod" to "Modeller", "rt" to "Valg", "job" to "Jobber", "use" to "Forbruk", "api" to "API og nøkler")

private fun nb34(v: Double, d: Int = 1): String = String.format(java.util.Locale("nb", "NO"), "%.${d}f", v)
private fun kr34(v: Double): String = String.format(java.util.Locale("nb", "NO"), "%.2f kr", v)
private fun tk34(n: Long): String = when { n >= 1_000_000 -> nb34(n / 1e6) + " M"; n >= 1000 -> "${Math.round(n / 1e3)} k"; else -> "$n" }

@Composable
internal fun AiControl34(vm: AppViewModel) {
    val s = vm.p34
    val T = if (Tone.paperDark) MORK34 else PAPIR34
    BackHandler { vm.closeAiCtl34() }
    val scroll = rememberScrollState()
    LaunchedEffect(s.aiTab) { scroll.scrollTo(0) }
    Box(Modifier.fillMaxSize().background(T.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Hode: kicker, «AI», statuslinje og Ferdig.
            Column(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("GLIMT · AI-KONTROLL", color = T.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.4.sp, modifier = Modifier.weight(1f))
                    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(T.ink).clickable(role = Role.Button) { vm.closeAiCtl34() }.padding(horizontal = 18.dp),
                        contentAlignment = Alignment.Center) { Text("Ferdig", color = T.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
                }
                Text("AI", color = T.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 34.sp)
                val loc = s.aiModels?.size
                val sky = s.aiCloud.count { it.on }
                val run = (s.aiJobs ?: emptyList()).count { it.st == "run" }.takeIf { s.aiJobs != null } ?: s.aiStatus?.running ?: 0
                Text((loc?.let { "$it lokale modeller · " } ?: "") + "$sky i skyen · " + if (run > 0) "$run jobb${if (run > 1) "er" else ""} kjører" else "ingen jobber kjører",
                    color = T.mut, fontFamily = PaperFonts.sans, fontSize = 13.sp, maxLines = 2)
            }
            // Fanepiller.
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TABS34.forEach { (k, n) ->
                    val on = s.aiTab == k
                    val badge = if (k == "job") (s.aiJobs ?: emptyList()).count { it.st == "run" || it.st == "fail" } else 0
                    Row(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) T.ink else Color.Transparent).border(1.dp, if (on) T.ink else T.line, RoundedCornerShape(18.dp))
                        .clickable(role = Role.Tab) { vm.setAiTab34(k) }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(n, color = if (on) T.bg else T.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                        if (badge > 0) Text("$badge", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(T.acc).padding(horizontal = 6.dp, vertical = 1.dp))
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll).padding(start = 16.dp, end = 16.dp, bottom = 40.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                s.aiErr?.let { e -> Text(e, color = T.bad, fontFamily = PaperFonts.sans, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(T.card).padding(14.dp)) }
                when (s.aiTab) {
                    "ov" -> AcOverview34(vm, T)
                    "mod" -> AcModels34(vm, T)
                    "rt" -> AcRouting34(vm, T)
                    "job" -> AcJobs34(vm, T)
                    "use" -> AcUsage34(vm, T)
                    else -> AcApi34(vm, T)
                }
            }
        }
        s.aiToast?.let { t ->
            Text(t, color = T.bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 2,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 34.dp, start = 16.dp, end = 16.dp).clip(CircleShape).background(T.ink).padding(16.dp, 10.dp))
        }
    }
}

/* ---------------- Felles biter ---------------- */

@Composable
private fun AcCard34(T: AcT34, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(T.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)

@Composable
private fun AcHead34(T: AcT34, t: String, right: String? = null) = Row(Modifier.fillMaxWidth().padding(start = 4.dp, top = 4.dp), verticalAlignment = Alignment.Bottom) {
    Text(t, color = T.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.weight(1f))
    right?.let { Text(it, color = T.mut, fontSize = 12.sp) }
}

@Composable
private fun AcPill34(T: AcT34, t: String, solid: Boolean = false, color: Color? = null, enabled: Boolean = true, onClick: () -> Unit) =
    Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(if (solid) T.ink else Color.Transparent)
        .then(if (solid) Modifier else Modifier.border(1.dp, T.line, RoundedCornerShape(17.dp))).clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 13.dp),
        contentAlignment = Alignment.Center) { Text(t, color = if (solid) T.bg else color ?: T.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }

@Composable
private fun AcSwitch34(T: AcT34, on: Boolean) = Box(Modifier.size(44.dp, 26.dp).clip(CircleShape).background(if (on) T.ok else T.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
    Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
}

@Composable
private fun AcToggle34(T: AcT34, n: String, sub: String, on: Boolean, top: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = Role.Switch) { onChange(!on) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(n, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(sub, color = T.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        AcSwitch34(T, on)
    }
}

@Composable
private fun AcSeg34(T: AcT34, opts: List<Pair<String, String>>, cur: String, onPick: (String) -> Unit) {
    Row(Modifier.clip(CircleShape).background(T.fld).padding(3.dp)) {
        opts.forEach { (v, l) ->
            val on = v == cur
            Box(Modifier.height(30.dp).clip(CircleShape).background(if (on) T.card else Color.Transparent).clickable(role = Role.RadioButton) { onPick(v) }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center) { Text(l, color = if (on) T.ink else T.mut, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1) }
        }
    }
}

@Composable
private fun AcBar34(T: AcT34, frac: Float, color: Color, h: Dp = 6.dp) = Box(Modifier.fillMaxWidth().height(h).clip(RoundedCornerShape(h / 2)).background(T.fld)) {
    Box(Modifier.fillMaxHeight().fillMaxWidth(frac.coerceIn(0f, 1f)).clip(RoundedCornerShape(h / 2)).background(color))
}

@Composable
private fun AcSpin34(T: AcT34, size: Dp = 18.dp) {
    val t = rememberInfiniteTransition(label = "acspin")
    val a by t.animateFloat(0f, 360f, infiniteRepeatable(tween(850, easing = LinearEasing)), label = "a")
    Canvas(Modifier.size(size).rotate(a)) {
        drawCircle(T.line, style = Stroke(2.5f * density))
        drawArc(T.acc, 0f, 90f, false, style = Stroke(2.5f * density))
    }
}

private fun stateColor34(T: AcT34, st: String) = when (st) { "ok" -> T.ok; "warn" -> T.warn; else -> T.line }

/* ---------------- Oversikt ---------------- */

@Composable
private fun AcOverview34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val st = s.aiStatus
    // Selvtest.
    AcCard34(T, Modifier.border(if (s.aiSelf?.any { it.ok == false } == true) 2.dp else 0.dp, if (s.aiSelf?.any { it.ok == false } == true) T.bad.copy(alpha = .4f) else Color.Transparent, RoundedCornerShape(20.dp))) {
        val rows = s.aiSelf
        val bad = rows?.count { it.ok == false } ?: 0
        val done = rows != null && !s.aiSelfBusy
        Text(when { rows == null -> "Selvtest"; !done -> "Tester AI-funksjoner …"; bad > 0 -> "$bad av ${rows.size} AI-funksjoner virker ikke"; else -> "Alt virker · ${rows.size} av ${rows.size} svarte" },
            color = T.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 20.sp)
        Text("Sender en liten prompt gjennom hver funksjon (chat, AI-søk, Glimt, kvitteringer …) og sjekker at modellen faktisk svarer, ikke bare at serveren kan nås.",
            color = T.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        rows?.forEach { r ->
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when (r.ok) {
                    null -> if (s.aiSelfBusy) AcSpin34(T) else Box(Modifier.size(18.dp).border(1.5.dp, T.line, CircleShape))
                    true -> Box(Modifier.size(18.dp).clip(CircleShape).background(T.ok), contentAlignment = Alignment.Center) { Text("✓", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold) }
                    false -> Box(Modifier.size(18.dp).clip(CircleShape).background(T.bad), contentAlignment = Alignment.Center) { Text("!", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold) }
                }
                Column(Modifier.weight(1f)) {
                    Text(r.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    val sub = when (r.ok) {
                        null -> if (s.aiSelfBusy) "Sender testprompt til ${r.model} …" else "Venter"
                        true -> "${r.model} svarte «ok» på ${r.ms ?: "?"} ms"
                        false -> r.error ?: "Svarte ikke"
                    }
                    Text(sub, color = if (r.ok == false) T.bad else T.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
                }
                if (r.ok == false) {
                    val (l, tab) = when (r.fix) { "api", "key" -> "Legg inn" to "api"; else -> "Bytt modell" to "rt" }
                    AcPill34(T, l) { vm.setAiTab34(tab) }
                }
            }
        }
        AcPill34(T, if (s.aiSelfBusy) "Tester …" else "Kjør selvtest", solid = true, enabled = !s.aiSelfBusy) { vm.runSelftest34() }
    }
    // Fire kort.
    val jobs = s.aiJobs ?: emptyList()
    val run = jobs.count { it.st == "run" }.takeIf { s.aiJobs != null } ?: st?.running ?: 0
    val q = jobs.count { it.st == "queue" }.takeIf { s.aiJobs != null } ?: st?.queued ?: 0
    val fail = jobs.count { it.st == "fail" }.takeIf { s.aiJobs != null } ?: st?.failed ?: 0
    val loaded = s.aiModels?.filter { it.loaded }?.map { it.id.substringBefore(':') } ?: st?.loaded ?: emptyList()
    val kpi = listOf(
        Triple("KJØRER NÅ", "$run", "$q i kø" + if (fail > 0) " · $fail feilet" else "") to "job",
        Triple("LASTET I VRAM", "${loaded.size}", loaded.joinToString(", ").ifBlank { "ingen" }) to "mod",
        Triple("TOKENS 30 D", st?.tokens30?.let(::tk34) ?: "–", "lokalt er gratis") to "use",
        Triple("SKY-KOSTNAD", st?.cost30?.let(::kr34) ?: "–", st?.budget?.let { "av ${it.toInt()} kr budsjett" } ?: "budsjett i Forbruk") to "use",
    )
    kpi.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { (k, tab) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(T.card).clickable { vm.setAiTab34(tab) }.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(k.first, color = T.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp, letterSpacing = 1.sp)
                    Text(k.second, color = T.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, maxLines = 1)
                    Text(k.third, color = if (k.first == "KJØRER NÅ" && fail > 0) T.bad else T.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
    // Hjemmeserveren.
    AcHead34(T, "HJEMMESERVER")
    AcCard34(T) {
        Text(st?.gpu ?: "GPU ukjent", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
        val vu = st?.vramUsed; val vt = st?.vramTotal
        if (vt != null && vt > 0) {
            Row { Text("VRAM i bruk", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${nb34(vu ?: 0.0)} / ${nb34(vt, 0)} GB", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, ((vu ?: 0.0) / vt).toFloat(), if ((vu ?: 0.0) / vt > .88) T.warn else T.ok)
        }
        val du = st?.diskUsed ?: s.aiModels?.sumOf { it.gb ?: 0.0 }
        if (du != null) {
            val dt = st?.diskTotal
            Row { Text("Modeller på disk", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text(nb34(du) + (dt?.let { " / ${nb34(it, 0)} GB" } ?: " GB"), color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            if (dt != null && dt > 0) AcBar34(T, (du / dt).toFloat(), T.ink)
        }
        val cost = st?.cost30; val bud = st?.budget
        if (cost != null && bud != null && bud > 0) {
            Row { Text("Sky-budsjett denne måneden", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f)); Text("${kr34(cost)} / ${bud.toInt()} kr", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
            AcBar34(T, (cost / bud).toFloat(), T.acc)
        }
    }
    // Leverandører.
    AcHead34(T, "LEVERANDØRER")
    AcCard34(T) {
        val provs = st?.providers ?: emptyList()
        if (provs.isEmpty()) Text(if (st == null) "Henter status …" else "Ingen leverandører satt opp.", color = T.mut, fontSize = 13.sp)
        provs.forEachIndexed { i, pv ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Row(Modifier.fillMaxWidth().clickable { vm.setAiTab34("api") }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(stateColor34(T, pv.state)))
                Column(Modifier.weight(1f)) {
                    Text(pv.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    val sub = when (pv.state) { "ok" -> "Svarer"; "warn" -> "Nås, men genererer ikke"; else -> "Ikke tilkoblet" } +
                        (pv.last4?.let { " · nøkkel …$it" } ?: "") + (pv.detail.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
                    Text(sub, color = T.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (pv.state == "warn" && pv.error != null) Text(pv.error, color = T.warn, fontSize = 12.sp, maxLines = 3)
                }
                Text(pv.ms?.let { "$it ms" } ?: "–", color = T.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp)
            }
        }
    }
}

/* ---------------- Modeller ---------------- */

@Composable
private fun AcModels34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val models = s.aiModels
    val def = s.aiTasks.firstOrNull { it.key == "chat" }?.model
    val vram = s.aiStatus?.vramTotal ?: 8.0
    AcHead34(T, "INSTALLERT LOKALT · ${models?.size ?: "…"}", models?.let { "${nb34(it.sumOf { m -> m.gb ?: 0.0 })} GB på disk" })
    AcCard34(T) {
        if (models == null) Text("Henter modellene fra Ollama …", color = T.mut, fontSize = 13.sp)
        else if (models.isEmpty()) Text("Ingen lokale modeller. Last ned en under.", color = T.mut, fontSize = 13.sp)
        models?.forEachIndexed { i, m ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (m.loaded) T.ok else T.line))
                    Text(m.id, color = T.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (m.id == def) Text("STANDARD", color = T.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp)
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOfNotNull(m.desc.takeIf { it != m.id }, m.gb?.let { nb34(it) + " GB" }, m.quant, m.ctx?.let { "$it kontekst" }, m.kind).forEach { t ->
                        Text(t, color = T.mut, fontSize = 11.5.sp, modifier = Modifier.clip(CircleShape).background(T.fld).padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                val keep = s.aiParams["keep"] ?: "30m"
                Text(if (m.loaded) "Lastet i VRAM · holdes " + when (keep) { "aldri" -> "til den ikke brukes"; "alltid" -> "alltid"; else -> "i " + keep.replace("m", " min") } + " etter bruk"
                    else "Ikke lastet" + (m.last?.let { " · sist brukt $it" } ?: ""), color = T.mut, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (m.kind != "embedding") AcPill34(T, if (m.loaded) "Last ut" else "Last inn") { vm.loadModel34(m) }
                    if (m.id != def && m.kind != "embedding" && m.kind != "bilde") AcPill34(T, "Bruk som standard") { vm.setDefaultChat34(m.id) }
                    if (vm.userIsAdmin) AcPill34(T, if (s.aiDelArm == m.id) "Slette ${m.gb?.let { nb34(it) + " GB" } ?: ""}?" else "Slett", color = T.bad) { vm.deleteModel34(m) }
                }
            }
        }
    }
    if (s.aiPulls.isNotEmpty()) {
        AcHead34(T, "LASTER NED")
        AcCard34(T) {
            s.aiPulls.values.forEach { pl ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(pl.id, color = T.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Text("${pl.pct} %", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp)
                }
                StripeBar34(T, pl.pct / 100f)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(listOfNotNull(if (pl.done != null && pl.total != null) "${nb34(pl.done)} av ${nb34(pl.total)} GB" else pl.status, pl.mbs?.let { "${it.toInt()} MB/s" }).joinToString(" · "),
                        color = T.mut, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    AcPill34(T, "Avbryt", color = T.bad) { vm.cancelPull34(pl.id) }
                }
            }
        }
    }
    AcHead34(T, "LAST NED FRA OLLAMA")
    AcCard34(T) {
        val q = s.aiQ.trim().lowercase()
        Row(Modifier.fillMaxWidth().height(44.dp).clip(CircleShape).background(T.fld).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (s.aiQ.isEmpty()) Text("Søk i biblioteket eller skriv et modellnavn", color = T.mut, fontSize = 14.sp, maxLines = 1)
                BasicTextField(s.aiQ, { s.aiQ = it }, singleLine = true, textStyle = TextStyle(color = T.ink, fontSize = 14.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(T.ink),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = {
                        val l = s.aiLib.filter { it.id.contains(q) }
                        if (l.size == 1) vm.pullModel34(l[0].id) else if (Regex("^[a-z0-9._/-]+(:[a-z0-9._-]+)?$", RegexOption.IGNORE_CASE).matches(s.aiQ.trim())) vm.pullModel34(s.aiQ)
                    }), modifier = Modifier.fillMaxWidth())
            }
        }
        val canPull = q.isNotEmpty() && Regex("^[a-z0-9._/-]+(:[a-z0-9._-]+)?$").matches(q) && s.aiLib.none { it.id == q } && models?.none { it.id == q } != false
        if (canPull) AcPill34(T, "Last ned «$q»", solid = true) { vm.pullModel34(q) }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("alle" to "Alle", "tekst" to "Tekst", "bilde" to "Bilde", "resonnering" to "Resonnering", "embedding" to "Embeddings").forEach { (k, n) ->
                val on = s.aiCat == k
                Box(Modifier.height(30.dp).clip(CircleShape).background(if (on) T.ink else Color.Transparent).border(1.dp, if (on) T.ink else T.line, CircleShape)
                    .clickable { s.aiCat = k; Haptics.select() }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text(n, color = if (on) T.bg else T.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
        s.aiLib.filter { (s.aiCat == "alle" || it.kind == s.aiCat) && (q.isEmpty() || (it.id + " " + it.desc).lowercase().contains(q)) }.forEachIndexed { i, l ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            val has = models?.any { it.id == l.id } == true
            val pulling = l.id in s.aiPulls
            // Som serveren (fitOf): PASSER ≤ VRAM − 0,5 GB, DELVIS CPU ≤ 2 × VRAM, ellers FOR STOR.
            val fit = if (l.gb <= vram - .5) "PASSER" else if (l.gb <= vram * 2) "DELVIS CPU" else "FOR STOR"
            val fc = when (fit) { "PASSER" -> T.ok; "FOR STOR" -> T.bad; else -> T.warn }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(l.id, color = T.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                        Text(fit, color = fc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, modifier = Modifier.clip(CircleShape).background(fc.copy(alpha = .16f)).padding(horizontal = 6.dp, vertical = 1.dp))
                    }
                    Text(l.desc + " · " + nb34(l.gb) + " GB", color = T.mut, fontSize = 12.sp, maxLines = 2)
                }
                AcPill34(T, if (has) "Installert" else if (pulling) "Laster …" else "Last ned", enabled = !has && !pulling) { vm.pullModel34(l.id) }
            }
        }
    }
    if (s.aiCloud.isNotEmpty()) {
        AcHead34(T, "SKY-MODELLER")
        AcCard34(T) {
            Text("Bare modellene som er på kan velges i Valg.", color = T.mut, fontSize = 12.5.sp)
            s.aiCloud.forEachIndexed { i, c ->
                AcToggle34(T, c.id, c.desc + " · " + c.provider, c.on, i > 0, enabled = vm.userIsAdmin) { vm.setCloud34(c.id, it) }
            }
        }
    }
}

@Composable
private fun StripeBar34(T: AcT34, frac: Float) {
    val t = rememberInfiniteTransition(label = "stripe")
    val x by t.animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "x")
    Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(T.fld)) {
        Canvas(Modifier.fillMaxHeight().fillMaxWidth(frac.coerceIn(.02f, 1f)).clip(CircleShape)) {
            drawRect(T.acc)
            val w = 10.dp.toPx()
            var i = -2
            while (i * w < size.width + w * 2) {
                val x0 = i * w + x * w * 2
                drawLine(Color.White.copy(alpha = .25f), Offset(x0, size.height), Offset(x0 + size.height, 0f), strokeWidth = w / 2)
                i += 2
            }
        }
    }
}

/* ---------------- Valg (ruting) ---------------- */

@Composable
private fun AcRouting34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val models = s.aiModels ?: emptyList()
    val local = models.map { it.id to "${it.id} · lokal" }
    val cloud = s.aiCloud.filter { it.on }.map { it.id to "${it.id} · ${it.provider}" }
    val all = s.aiRtModels.ifEmpty { local + cloud }
    val fin = s.aiRules["finLocal"] == true
    AcHead34(T, "HVILKEN MODELL GJØR HVA")
    AcCard34(T) {
        s.aiTasks.forEachIndexed { i, t ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Text(t.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(t.sub, color = T.mut, fontSize = 12.sp)
            val missing = models.isNotEmpty() && t.model.isNotBlank() && all.none { it.first == t.model }
            val cloudPick = cloud.any { it.first == t.model || it.first == t.fallback }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AcDrop34(T, "Modell", t.model, all, Modifier.weight(1f)) { vm.setRoute34(t.key, it, null) }
                AcDrop34(T, "Reserve", t.fallback, listOf("" to "Ingen") + all, Modifier.weight(1f)) { vm.setRoute34(t.key, null, it) }
            }
            t.warning?.let { w -> Text(w, color = T.warn, fontSize = 12.sp, lineHeight = 17.sp) }
            if (missing && t.warning == null) Text("Modellen «${t.model}» finnes ikke · bytt. Ruteren bruker reserven til du velger en annen.", color = T.warn, fontSize = 12.sp, lineHeight = 17.sp)
            if (t.fin && fin && cloudPick) Text("Finansdata skal holdes lokalt, men denne bruker en sky-modell. Bytt til en lokal modell.", color = T.bad, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
    AcHead34(T, "REGLER")
    AcCard34(T) {
        listOf(
            Triple("local1", "Lokalt først", "Prøv hjemmeserveren før skyen, bytt bare ved feil eller timeout"),
            Triple("finLocal", "Finansdata forlater aldri huset", "Gjelder kvitteringer, transaksjoner og Finans · spør"),
            Triple("think", "Vis tenking", "Vis stegene mens modellen jobber"),
        ).forEachIndexed { i, (k, n, sub) -> AcToggle34(T, n, sub, s.aiRules[k] == true, i > 0) { vm.setRule34(k, it) } }
    }
    AcHead34(T, "PARAMETRE")
    AcCard34(T) {
        listOf(
            Triple("keep", "Hold modell lastet", "Hvor lenge modellen blir i VRAM etter bruk (keep_alive)") to listOf("5m" to "5 min", "30m" to "30 min", "alltid" to "Alltid", "aldri" to "Aldri"),
            Triple("ctx", "Kontekst", "Standard kontekstlengde (num_ctx)") to listOf("8k" to "8k", "32k" to "32k", "128k" to "128k"),
            Triple("temp", "Temperatur", "Lav = presis, høy = kreativ") to listOf("0.2" to "0,2", "0.7" to "0,7", "1.0" to "1,0"),
            Triple("par", "Samtidige jobber", "Maks jobber som kjører på serveren samtidig") to listOf("1" to "1", "2" to "2", "3" to "3", "4" to "4"),
        ).forEachIndexed { i, (h, opts) ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Text(h.second, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(h.third, color = T.mut, fontSize = 12.sp)
            val cur = s.aiParams[h.first] ?: ""
            AcSeg34(T, opts, opts.firstOrNull { it.first == cur || it.first.toDoubleOrNull() == cur.toDoubleOrNull() && cur.toDoubleOrNull() != null }?.first ?: cur) { vm.setParam34(h.first, it) }
        }
    }
    if (!vm.userIsAdmin) Text("Valgene lagres for deg. Serverens standard endres bare av administrator.", color = T.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
}

@Composable
private fun AcDrop34(T: AcT34, label: String, cur: String, opts: List<Pair<String, String>>, modifier: Modifier, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val shown = opts.firstOrNull { it.first == cur }?.second ?: if (cur.isBlank()) "Ingen" else "$cur · ikke tilgjengelig"
    Box(modifier) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(T.fld).clickable(role = Role.DropdownList) { open = true }.padding(10.dp, 7.dp)) {
            Text(label.uppercase(), color = T.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp)
            Text(shown + " ▾", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(open, { open = false }) {
            if (opts.isEmpty()) DropdownMenuItem(text = { Text("Ingen modeller ennå") }, onClick = { open = false })
            opts.forEach { (v, n) -> DropdownMenuItem(text = { Text((if (v == cur) "✓ " else "") + n, fontSize = 13.sp) }, onClick = { open = false; onPick(v) }) }
        }
    }
}

/* ---------------- Jobber ---------------- */

@Composable
private fun AcJobs34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val jobs = s.aiJobs
    val run = jobs?.filter { it.st == "run" } ?: emptyList()
    val q = jobs?.filter { it.st == "queue" } ?: emptyList()
    val last = jobs?.filter { it.st == "done" || it.st == "fail" } ?: emptyList()
    Text("${run.size} kjører · ${q.size} i kø · maks ${s.aiParams["par"] ?: "2"} samtidig" + if (s.aiPaused) " · køen er pauset" else "", color = T.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AcPill34(T, if (s.aiPaused) "Fortsett kø" else "Pause kø") { vm.pauseQueue34() }
        AcPill34(T, "Tøm historikk") { vm.clearJobs34() }
    }
    if (jobs == null) Text("Henter jobbene …", color = T.mut, fontSize = 13.sp)
    else if (jobs.isEmpty()) Text("Ingen AI-jobber ennå.", color = T.mut, fontSize = 13.sp)
    listOf("KJØRER" to run, "I KØ" to q, "SISTE" to last).filter { it.second.isNotEmpty() }.forEach { (h, l) ->
        AcHead34(T, h)
        AcCard34(T) {
            l.forEachIndexed { i, j ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    when (j.st) {
                        "run" -> AcSpin34(T)
                        "queue" -> Box(Modifier.size(18.dp).border(1.5.dp, T.mut, CircleShape))
                        "done" -> Box(Modifier.size(18.dp).clip(CircleShape).background(T.ok), contentAlignment = Alignment.Center) { Text("✓", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold) }
                        else -> Box(Modifier.size(18.dp).clip(CircleShape).background(T.bad), contentAlignment = Alignment.Center) { Text("!", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold) }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(j.title, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val sub = listOfNotNull(j.model.takeIf { it.isNotBlank() }, if (j.st == "run") "${j.pct} %" else null, if (j.st == "queue") (j.whenT ?: "venter") else null, j.dur, j.tok, j.err).joinToString(" · ")
                        Text(sub, color = if (j.st == "fail") T.bad else T.mut, fontSize = 12.sp, lineHeight = 16.sp)
                        if (j.st == "run") AcBar34(T, j.pct / 100f, T.acc, 4.dp)
                    }
                    if (j.st != "done") AcPill34(T, if (j.st == "fail") "Prøv igjen" else "Avbryt", color = if (j.st == "fail") T.ink else T.bad) { vm.jobAction34(j) }
                }
            }
        }
    }
}

/* ---------------- Forbruk ---------------- */

@Composable
private fun AcUsage34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val u = s.aiUsage
    AcSeg34(T, listOf("1" to "I dag", "7" to "7 dager", "30" to "30 dager"), s.aiDays) { vm.setDays34(it) }
    if (u == null) { Text("Henter forbruket …", color = T.mut, fontSize = 13.sp); return }
    val tot = u.tokIn + u.tokOut
    val kpi = listOf(
        Triple("TOKENS", tk34(tot), "inn ${tk34(u.tokIn)} · ut ${tk34(u.tokOut)}"),
        Triple("SKY-KOSTNAD", kr34(u.cost), u.costBy.entries.joinToString(" · ") { "${it.key.replaceFirstChar { c -> c.uppercase() }} ${kr34(it.value)}" }.ifBlank { "Gemini · Groq" }),
        Triple("LOKALT", u.localPct?.let { "$it %" } ?: "–", "av alle tokens, gratis"),
        Triple("SNITT SVARTID", u.avgMs?.let { nb34(it / 1000.0) + " s" } ?: "–", "alle funksjoner"),
    )
    kpi.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { k ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(T.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(k.first, color = T.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp)
                    Text(k.second, color = T.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, maxLines = 1)
                    Text(k.third, color = T.mut, fontSize = 11.5.sp, maxLines = 2)
                }
            }
        }
    }
    if (u.days.isNotEmpty()) AcCard34(T) {
        val mx = u.days.maxOf { it.first + it.second }.coerceAtLeast(1)
        Row(Modifier.fillMaxWidth().height(110.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            u.days.forEach { (l, c) ->
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Bottom) {
                    if (c > 0) Box(Modifier.fillMaxWidth().weight((c.toFloat() / mx).coerceAtLeast(.001f)).clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)).background(T.acc))
                    if (l > 0) Box(Modifier.fillMaxWidth().weight((l.toFloat() / mx).coerceAtLeast(.001f)).background(T.ok))
                    val rest = 1f - (l + c).toFloat() / mx
                    if (rest > 0f) Spacer(Modifier.weight(rest))
                }
            }
        }
        Row { Text("● lokalt", color = T.ok, fontSize = 11.5.sp); Spacer(Modifier.width(12.dp)); Text("● sky", color = T.acc, fontSize = 11.5.sp) }
    }
    if (u.feats.isNotEmpty()) {
        AcHead34(T, "PER FUNKSJON")
        AcCard34(T) {
            val mx = u.feats.maxOf { it.tokens }.coerceAtLeast(1)
            u.feats.forEachIndexed { i, f ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
                Row { Text(f.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f)); Text(if (f.kr > 0) kr34(f.kr) else "Gratis", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp) }
                Text(listOf(f.sub, tk34(f.tokens) + " tok").filter { it.isNotBlank() }.joinToString(" · "), color = T.mut, fontSize = 12.sp)
                AcBar34(T, f.tokens.toFloat() / mx, T.ink, 4.dp)
            }
        }
    }
    AcHead34(T, "BUDSJETT FOR SKY-AI")
    AcCard34(T) {
        var bud by remember(u.budget) { mutableFloatStateOf(u.budget.toFloat()) }
        Row { Text("Grense per måned", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, modifier = Modifier.weight(1f)); Text(if (bud <= 0f) "Ingen grense" else "${bud.toInt()} kr", color = T.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp) }
        Slider(bud, { bud = it }, valueRange = 0f..500f, steps = 49, enabled = vm.userIsAdmin, onValueChangeFinished = { vm.setBudget34(limit = bud.toDouble()) },
            colors = SliderDefaults.colors(thumbColor = T.ink, activeTrackColor = T.ink, inactiveTrackColor = T.fld))
        if (bud > 0f) {
            AcBar34(T, (u.used / bud).toFloat(), if (u.used / bud > .8) T.warn else T.ok)
            Text("${kr34(u.used)} brukt denne måneden." + (u.forecast?.let { " Prognose: ${kr34(it)} ved månedsslutt." } ?: ""), color = T.mut, fontSize = 12.sp)
        } else Text("0 = ingen grense. Sky-kall blokkeres aldri av budsjettet.", color = T.mut, fontSize = 12.sp)
        AcToggle34(T, "Stopp sky-AI ved grensen", "Bytter til lokale modeller resten av måneden", u.hardStop, true, enabled = vm.userIsAdmin) { vm.setBudget34(hardStop = it) }
        AcToggle34(T, "Varsle ved 80 %", "Push til mobilen", u.warn80, true, enabled = vm.userIsAdmin) { vm.setBudget34(warn80 = it) }
    }
}

/* ---------------- API og nøkler ---------------- */

@Composable
private fun AcApi34(vm: AppViewModel, T: AcT34) {
    val s = vm.p34
    val ctx = LocalContext.current
    val clip = LocalClipboardManager.current
    val admin = vm.userIsAdmin
    val provs = s.aiStatus?.providers ?: emptyList()
    if (!admin) Text("Bare administrator kan endre nøkler og adresser. Du ser status.", color = T.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
    val defs = listOf(
        listOf("ollama", "Ollama · hjemmeserver", "url", "Adresse", "http://192.168.1.40:11434", ""),
        listOf("gemini", "Google Gemini", "key", "API-nøkkel", "AIza…", "https://aistudio.google.com/apikey"),
        listOf("groq", "Groq", "key", "API-nøkkel", "gsk_…", "https://console.groq.com/keys"),
        listOf("openrouter", "OpenRouter (valgfri)", "key", "API-nøkkel", "sk-or-…", "https://openrouter.ai/keys"),
        listOf("roboflow", "Roboflow", "key", "API-nøkkel", "Private API Key", "https://app.roboflow.com"),
    )
    defs.forEach { d ->
        val id = d[0]
        val pv = provs.firstOrNull { it.id.equals(id, true) || it.name.lowercase().startsWith(id) }
        val kp = s.aiKeys.firstOrNull { it.id.equals(id, true) }
        AcCard34(T) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(stateColor34(T, pv?.state ?: "off")))
                Text(d[1], color = T.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                val tst = s.aiTest[id]
                Text(when { tst == "busy" -> "Tester …"; tst != null -> tst; pv?.state == "ok" -> "Svarer"; pv?.state == "warn" -> "Nås, men genererer ikke"; (kp ?: pv)?.set == true -> "Satt"; else -> "Ikke koblet til" },
                    color = if (pv?.state == "ok") T.ok else if (pv?.state == "warn") T.warn else T.mut, fontSize = 12.sp, maxLines = 2)
            }
            pv?.error?.let { Text(it, color = T.warn, fontSize = 12.sp) }
            val field = d[2]
            val key = "$id.$field"
            val editing = s.aiKeyEdit[key]
            val shown = if (field == "url") kp?.url ?: pv?.url ?: "" else (kp?.last4 ?: pv?.last4)?.let { "••••••••$it" } ?: if (kp?.set == true) "Satt" else ""
            if (admin) {
                var eye by remember { mutableStateOf(false) }
                Text(d[3].uppercase(), color = T.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp)
                Row(Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(12.dp)).background(T.fld).padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                        val v = editing ?: ""
                        if (v.isEmpty()) Text(shown.ifBlank { d[4] }, color = T.mut, fontFamily = PaperFonts.mono, fontSize = 13.sp, maxLines = 1)
                        BasicTextField(v, { s.aiKeyEdit = s.aiKeyEdit + (key to it) }, singleLine = true, textStyle = TextStyle(color = T.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp),
                            cursorBrush = SolidColor(T.ink), visualTransformation = if (field == "key" && !eye) PasswordVisualTransformation() else VisualTransformation.None, modifier = Modifier.fillMaxWidth())
                    }
                    if (field == "key") Text(if (eye) "Skjul" else "Vis", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.clickable { eye = !eye }.padding(10.dp))
                }
                if (!editing.isNullOrBlank()) AcPill34(T, "Lagre", solid = true) { vm.saveKey34(id, field, editing) }
            } else if (shown.isNotBlank()) Text(shown, color = T.mut, fontFamily = PaperFonts.mono, fontSize = 12.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AcPill34(T, if (s.aiTest[id] == "busy") "Tester …" else "Test") { vm.testKey34(id) }
                if (d[5].isNotBlank()) Text(d[5].removePrefix("https://").substringBefore('/') + " ↗", color = T.acc, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { openLink(ctx, d[5]) }.padding(6.dp))
            }
        }
    }
    AcHead34(T, "GLIMT-API FOR EGNE SKRIPT")
    AcCard34(T) {
        s.aiFresh?.let { f ->
            Text("Ny nøkkel (vises bare nå):", color = T.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(f, color = T.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(T.fld).padding(10.dp))
            AcPill34(T, "Kopier") { clip.setText(AnnotatedString(f)); vm.aiToast34("Kopiert") }
        }
        if (s.aiTokens.isEmpty()) Text("Ingen personlige nøkler.", color = T.mut, fontSize = 13.sp)
        s.aiTokens.forEachIndexed { i, t ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(T.line))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.name, color = T.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(t.sub, color = T.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                }
                AcPill34(T, "Trekk tilbake", color = T.bad) { vm.revokeToken34(t.id) }
            }
        }
        AcPill34(T, "+ Ny nøkkel", solid = true) { vm.newToken34() }
    }
    Text("Nøklene lagres kryptert på serveren. Appen får bare de siste 4 tegnene.", color = T.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
}
