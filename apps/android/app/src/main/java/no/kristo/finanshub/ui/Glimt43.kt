package no.kristo.finanshub.ui

import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.domGlimt38

/*
 * Prompt 43: Glimt-orben (ikke figuren) – konisk fargering #b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6, kremfarget innside
 * og rød firetakket stjerne. Roterer sakte (9 s), raskere (1,4 s) mens Glimt svarer. Brukes i Finans → Søk/Liste og i domenekortet.
 */
private val ORB43 = listOf(Color(0xFFB23A2A), Color(0xFFE8794A), Color(0xFFF2C14E), Color(0xFF3FBF9A), Color(0xFF7A5AD6), Color(0xFFB23A2A))
internal val GLIMT_RED43 = Color(0xFFB23A2A)

@Composable
internal fun GlimtOrb43(size: Dp, busy: Boolean = false, modifier: Modifier = Modifier) {
    val tr = rememberInfiniteTransition(label = "orb43")
    val deg by tr.animateFloat(0f, 360f, infiniteRepeatable(tween(if (busy) 1400 else 9000, easing = LinearEasing)), label = "orb43r")
    // Prompt 71: fargeringen er et ferdig lag som roteres (graphicsLayer.rotationZ rundt midten = rotate() i tegningen før);
    // innsiden og stjernen står stille og tegnes ikke på nytt hvert bilde.
    Box(modifier.size(size)) {
    Canvas(Modifier.matchParentSize().graphicsLayer { rotationZ = deg }) {
        val c = Offset(this.size.width / 2, this.size.height / 2)
        drawCircle(Brush.sweepGradient(ORB43, c), this.size.minDimension / 2, c)
    }
    Canvas(Modifier.matchParentSize()) {
        val c = Offset(this.size.width / 2, this.size.height / 2)
        val r = this.size.minDimension / 2
        drawCircle(Color(0xFFF6F0E4), r * .68f, c)
        // Firetakket stjerne (✦) i rødt.
        val s = r * .5f
        val k = s * .28f
        val path = Path().apply {
            moveTo(c.x, c.y - s); lineTo(c.x + k, c.y - k); lineTo(c.x + s, c.y); lineTo(c.x + k, c.y + k)
            lineTo(c.x, c.y + s); lineTo(c.x - k, c.y + k); lineTo(c.x - s, c.y); lineTo(c.x - k, c.y - k); close()
        }
        drawPath(path, GLIMT_RED43)
    }
    }
}

/**
 * Rød Glimt-pille: [orb på hvit brikke] Glimt. [on] = rød fylt med hvit tekst; av = rød kant, rød tekst og 12 % rød bakgrunn.
 * Trykkflaten er minst 44 dp høy selv om pillen er [height].
 */
@Composable
internal fun GlimtPill43(on: Boolean, busy: Boolean = false, height: Dp = 34.dp, label: String = "Glimt", onClick: () -> Unit) {
    Box(Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Row(
            Modifier.height(height).clip(CircleShape).background(if (on) GLIMT_RED43 else GLIMT_RED43.copy(alpha = .12f))
                .then(if (on) Modifier else Modifier.border(1.dp, GLIMT_RED43, CircleShape)).padding(start = 5.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(Modifier.size(height - 10.dp).clip(CircleShape).background(Color.White.copy(alpha = .92f)), contentAlignment = Alignment.Center) { GlimtOrb43(20.dp.coerceAtMost(height - 12.dp), busy) }
            Text(label, color = if (on) Color.White else GLIMT_RED43, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
        }
    }
}

/** Prompt 43: Glimt-raden i domenekortet. Mørk flate, orben (30 dp), «GLIMT · SISTE DØGN» og «Oppsummering av siste døgn ›». */
@Composable
internal fun DomGlimtRow43(vm: no.kristo.finanshub.AppViewModel) {
    val (up, low) = when (vm.domRange) { "1h" -> "SISTE TIME" to "siste time"; "7d" -> "SISTE 7 DAGER" to "siste 7 dager"; "30d" -> "SISTE 30 DAGER" to "siste 30 dager"; else -> "SISTE DØGN" to "siste døgn" }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp)).background(Color(0xFF1B1A17))
            .clickable(role = Role.Button, onClickLabel = "Oppsummering av $low") { vm.domGlimt38() }.padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        GlimtOrb43(30.dp, busy = vm.p38.domSumBusy)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("GLIMT · $up", color = Color(0xFFE8A593), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.2.sp, maxLines = 1)
            Text("Oppsummering av $low", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
        }
        Text("›", color = Color.White, fontSize = 20.sp)
    }
}
