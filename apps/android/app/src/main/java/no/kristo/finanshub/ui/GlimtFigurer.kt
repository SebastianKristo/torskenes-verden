package no.kristo.finanshub.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.loadCharAdmin52
import no.kristo.finanshub.setCharDefault52

/* ======================= Glimt i prestedrakt ======================= */

private fun DrawScope.path38(d: String, vw: Float, vh: Float, fill: Color?, stroke: Color? = null, sw: Float = 1.5f) {
    scale(size.width / vw, size.height / vh, pivot = Offset.Zero) {
        val path = wxPath(d)
        if (fill != null) drawPath(path, fill)
        if (stroke != null) drawPath(path, stroke, style = Stroke(sw, cap = StrokeCap.Round))
    }
}

/**
 * Glimt i lys kjortel med rød stola og brunt belte, en liten bibel med gyllent ✝ og en pulserende gylden glorie (Bibelvers.dc.html → priest()).
 * Dupper rolig (3 s). Reduser bevegelse: ingen dupping og fast glorie.
 */
@Composable
internal fun PriestFig38(S: Dp, mood: String = "idle", modifier: Modifier = Modifier) {
    val reduce = reduceMotion31()
    val inf = rememberInfiniteTransition(label = "prest38")
    val bob = inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "bob")
    val halo = inf.animateFloat(.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "halo")
    Box(modifier.size(S * 1.32f, S * 1.6f).graphicsLayer { translationY = if (reduce) 0f else -S.toPx() * .04f * bob.value }.semantics38("Glimt i prestedrakt")) {
        val ox = S * .16f
        val oy = S * .22f
        // Glorie.
        Canvas(Modifier.offset(ox + S * .11f, oy - S * .2f).size(S * .78f, S * .22f)) {
            val a = if (reduce) 1f else halo.value
            val w = S.toPx() * .05f
            drawOval(Color(0xFFF2C14E).copy(alpha = .35f * a), style = Stroke(w * 3f))
            drawOval(Color(0xFFF2C14E).copy(alpha = .6f + .4f * a), style = Stroke(w))
        }
        Box(Modifier.offset(ox, oy)) { GlimtFig35("glimt", S, mood, still = reduce) }
        // Kjortel med stola og belte.
        Canvas(Modifier.offset(ox + S * .5f - S * .58f, oy + S * .72f).size(S * 1.16f, S * .62f)) {
            path38("M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z", 116f, 62f, Color(0xFFF6F1E7), Color(0xFFC9BFA9), 1.6f)
            path38("M44 12 L40 60 L50 60 L54 16 Z", 116f, 62f, RED38)
            path38("M72 12 L76 60 L66 60 L62 16 Z", 116f, 62f, RED38)
            path38("M42 34 h8 M66 34 h8", 116f, 62f, null, Color(0xFFF2C14E), 2f)
            path38("M24 40 Q58 48 92 40", 116f, 62f, null, Color(0xFFA8661A), 3f)
        }
        // Bibelen med ✝.
        Box(Modifier.offset(ox + S * .8f, oy + S * .92f).size(S * .36f, S * .28f).graphicsLayer { rotationZ = -10f }.clip(RoundedCornerShape(3.dp))
            .background(Color(0xFF3B2A1A)).border(2.dp, Color(0xFF6B4A2A), RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
            Text("✝", color = Color(0xFFF2C14E), fontWeight = FontWeight.ExtraBold, fontSize = (S.value * .16f).sp, lineHeight = (S.value * .18f).sp)
        }
    }
}

private fun Modifier.semantics38(label: String): Modifier = this.semantics { contentDescription = label }

/* ======================= Glimt-figur per bruker (admin) ======================= */

/** Innstillinger → Glimt (admin): standardfiguren per bruker, f.eks. Blekksprut. Gjelder til brukeren velger selv. */
@Composable
internal fun CharAdmin52(vm: AppViewModel) {
    if (!vm.userIsAdmin) return
    val p = PaperPal.current
    val s = vm.p52b
    LaunchedEffect(s.charAdminOpen) { if (s.charAdminOpen && s.charAdmin == null) vm.loadCharAdmin52() }
    PCard {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { s.charAdminOpen = !s.charAdminOpen }.padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Standardfigur per bruker", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text("Figuren brukeren ser til hen velger selv", color = p.mut, fontSize = 12.5.sp)
            }
            Text(if (s.charAdminOpen) "▴" else "▾", color = p.mut, fontSize = 14.sp)
        }
        if (s.charAdminOpen) {
            val l = s.charAdmin
            if (l == null) Text("Henter brukerne …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(16.dp, 0.dp, 16.dp, 14.dp))
            else l.forEach { u ->
                Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(u.name + if (u.source == "user") " · har valgt ${Fig35.name(u.char)}" else "", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (listOf<String?>(null) + Fig35.IDS).forEach { id ->
                            val on = u.default == id
                            Box(Modifier.height(32.dp).clip(CircleShape).background(if (on) p.ink else p.bg).clickable(role = Role.RadioButton) { vm.setCharDefault52(u.id, id) }.padding(horizontal = 12.dp),
                                contentAlignment = Alignment.Center) { Text(id?.let { Fig35.name(it) } ?: "Ingen", color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
                        }
                    }
                }
            }
        }
    }
}
