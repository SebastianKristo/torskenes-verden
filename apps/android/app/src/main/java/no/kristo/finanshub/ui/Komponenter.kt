package no.kristo.finanshub.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/* ======================= Felles småting ======================= */

/** Små overlappende avatarer (initial + farge, 18 dp). */
@Composable
internal fun Avatars37(people: List<Pair<String, Long?>>, size: Dp = 18.dp, ring: Color = PaperPal.current.card) {
    Row {
        people.take(3).forEachIndexed { i, (n, c) ->
            Box(Modifier.offset(x = -(size.value * .3f * i).dp).size(size).clip(CircleShape).background(ring).padding(1.5.dp).clip(CircleShape).background(Color(c ?: avatarColor37(n))),
                contentAlignment = Alignment.Center) {
                Text(n.take(1).uppercase(), color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * .5f).sp)
            }
        }
    }
}

private val AV37 = listOf(0xFF2B5D8A, 0xFFB23A2A, 0xFFA8661A, 0xFF2F6B45, 0xFF7A5AD6, 0xFFC2477A, 0xFF3D7F8A)

internal fun avatarColor37(n: String): Long = AV37[Math.floorMod(n.lowercase().hashCode(), AV37.size)]

@Composable
internal fun Toggle37(on: Boolean) {
    val p = PaperPal.current
    Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
        Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
    }
}
