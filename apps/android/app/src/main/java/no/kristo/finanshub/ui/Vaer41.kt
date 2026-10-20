package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/*
 * Prompt 41 (claude-code-vaer-rediger-ski-julfigur.md, fasit Vaer.dc.html voVals/skiVals):
 *  - Rediger kort: hold inne et kort 0,6 s (uten bevegelse, > 8 dp avbryter) eller «Rediger kort» nederst → kortene vugger (±0,6°) og
 *    arket «Rediger Vær» kommer opp: alle kort med ↑ ↓ og vis/skjul, «Glimt-kortet øverst / nederst», Nullstill og Ferdig.
 *    Scroll virker hele tiden (bare hold-inne starter redigering). Lagres per bruker (vaer_layout).
 *  - Skiføre · NORDMARKA (Spire, «✦ GLIMT ANBEFALER», smøring, forklaring, fire tall, Feste/Glid, «Løyper ↗»), bare ved snø ≥ 15 cm.
 */

private val GLASS41 = Color.White.copy(alpha = .12f)

/** Ramme rundt hvert kort i Vær: hold inne 0,6 s → redigering (passivt lyttende, så scroll og trykk i kortet virker som før). */
@Composable
internal fun VaerWrap41(vm: AppViewModel, index: Int, content: @Composable () -> Unit) {
    val edit = vm.p41.vaerEdit
    val angle = wobbleAngle(edit, index, 0.6f)
    Box(
        Modifier.fillMaxWidth().graphicsLayer { rotationZ = angle }
            .pointerInput(Unit) {
                val slop = 8.dp.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    var moved = false
                    val up = withTimeoutOrNull(600) {
                        while (true) {
                            val e = awaitPointerEvent(PointerEventPass.Initial)
                            val c = e.changes.firstOrNull { it.id == down.id } ?: break
                            if ((c.position - down.position).getDistance() > slop) { moved = true; break }
                            if (!c.pressed) break
                        }
                        true
                    }
                    if (up == null && !moved && !vm.p41.vaerEdit) { Haptics.tap(); vm.p41.vaerEdit = true }
                }
            },
    ) { content() }
}

@Composable
internal fun VaerEditButton41(vm: AppViewModel) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text("Rediger kort", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
            modifier = Modifier.clip(CircleShape).background(GLASS41).clickable(role = Role.Button) { Haptics.tap(); vm.p41.vaerEdit = true }.padding(16.dp, 9.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VaerEditSheet41(vm: AppViewModel) {
    val p = PaperPal.current
    val l = vm.vaerLay41()
    fun set(n: VaerLay41) { vm.setVaerLay41(n); Haptics.select() }
    ModalBottomSheet(onDismissRequest = { vm.p41.vaerEdit = false }, containerColor = p.bg, contentColor = p.ink, scrimColor = Color.Black.copy(alpha = .25f),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(18.dp, 0.dp, 18.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Rediger Vær", 24.sp, modifier = Modifier.weight(1f))
                Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
                    modifier = Modifier.clip(CircleShape).background(p.ink).clickable(role = Role.Button) { vm.p41.vaerEdit = false }.padding(14.dp, 8.dp))
            }
            PCard {
                l.ord.forEachIndexed { i, k ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    val (n, sub) = VAER_NAMES41[k] ?: (k to "")
                    val on = if (k == "ski") l.ski && k !in l.hid else k !in l.hid
                    Row(Modifier.fillMaxWidth().padding(12.dp, 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                            if (sub.isNotBlank()) Text(sub, color = p.mut, fontSize = 12.sp, maxLines = 2)
                        }
                        Arrow41("↑", i > 0) { set(l.copy(ord = l.ord.toMutableList().also { m -> m[i] = m[i - 1]; m[i - 1] = k })) }
                        Arrow41("↓", i < l.ord.size - 1) { set(l.copy(ord = l.ord.toMutableList().also { m -> m[i] = m[i + 1]; m[i + 1] = k })) }
                        Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line)
                            .clickable(role = Role.Switch) {
                                if (k == "ski") set(l.copy(ski = !on, hid = l.hid - k)) else set(l.copy(hid = if (on) l.hid + k else l.hid - k))
                            }.padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                            Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Glimt-kortet øverst", Modifier.weight(1f), kind = "line", height = 42.dp) { set(l.copy(ord = listOf("glimt") + l.ord.filter { it != "glimt" })) }
                PButton("… nederst", Modifier.weight(1f), kind = "line", height = 42.dp) { set(l.copy(ord = l.ord.filter { it != "glimt" } + "glimt")) }
            }
            PButton("Nullstill", Modifier.fillMaxWidth(), kind = "line", height = 42.dp) { set(VaerLay41(VAER_KEYS41, emptySet(), true)) }
        }
    }
}

@Composable
private fun Arrow41(t: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(enabled = on, role = Role.Button, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(t, color = if (on) p.ink else p.line, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

/** SKIFØRE · NORDMARKA: Spire, «✦ GLIMT ANBEFALER», smøring stort, forklaring, fire tall, Feste/Glid og «Løyper ↗». */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SkiCard41(vm: AppViewModel) {
    val x = vm.p41.ski ?: return
    val ctx = LocalContext.current
    val (kick, wax, txt, glide) = skiAdvice41(x)
    val at = java.time.Instant.ofEpochMilli(x.at).atZone(java.time.ZoneId.systemDefault())
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(GLASS41).border(1.dp, GLASS41, RoundedCornerShape(24.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("SKIFØRE · NORDMARKA", color = Color.White.copy(alpha = .75f), fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp, letterSpacing = 1.2.sp, modifier = Modifier.weight(1f))
            Text("oppdatert %02d:%02d".format(at.hour, at.minute), color = Color.White.copy(alpha = .6f), fontSize = 11.5.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            GlimtFig35("spire", 54.dp, "glad")
            Column(Modifier.weight(1f)) {
                Text("✦ GLIMT ANBEFALER", color = Color(0xFFFFC7B8), fontWeight = FontWeight.ExtraBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
                Text(wax, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 24.sp)
            }
        }
        Text(txt, color = Color.White.copy(alpha = .9f), fontSize = 14.sp, lineHeight = 19.sp)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Snødybde" to "${Math.round(x.depth * 100)} cm", "Ny snø" to "${Math.round(x.fresh)} cm", "Temp." to "${Math.round(x.t)}°", "Fukt" to "${Math.round(x.rh)} %").forEach { (l, v) ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .08f)).padding(8.dp)) {
                    Text(l, color = Color.White.copy(alpha = .65f), fontSize = 11.sp, maxLines = 1)
                    Text(v, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Feste: $kick", "Glid: $glide").forEach { c ->
                Text(c, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = .14f)).padding(12.dp, 6.dp))
            }
            Text("Løyper ↗", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.5.sp,
                modifier = Modifier.clip(CircleShape).border(1.dp, Color.White.copy(alpha = .3f), CircleShape).clickable { openLink(ctx, "https://skisporet.no/") }.padding(12.dp, 6.dp))
        }
    }
}

/** Briefen: «Skiføre · NORDMARKA» – «Nysnø i Nordmarka: 42 cm snø og −4°. Glimt anbefaler blå (V30) i festesonen.» + brikker. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun BriefSki41(text: String, items: List<String>) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlimtFig35("spire", 40.dp, "glad")
            Column(Modifier.weight(1f)) {
                Text("Skiføre", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
                Text("NORDMARKA", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
            }
        }
        Text(text, color = p.ink, fontSize = 14.5.sp, lineHeight = 20.sp)
        if (items.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items.take(4).forEach { c -> Text(c, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, modifier = Modifier.clip(CircleShape).border(1.dp, p.line, CircleShape).padding(12.dp, 6.dp)) }
        }
    }
}
