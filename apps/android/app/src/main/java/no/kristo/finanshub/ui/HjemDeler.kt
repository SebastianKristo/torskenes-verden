package no.kristo.finanshub.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add

/* ======================= Skanneknapp på Hjem ======================= */

/** Rad med rødt skanne-ikon, «Skanneknapp på Hjem» og bryter (samme valg i Tilpass og i «Rediger fanelinjen»). */
@Composable
internal fun ScanHomeRow41(vm: AppViewModel, top: Boolean = false) {
    val p = PaperPal.current
    val on = vm.p41.scanHome
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().clickable(role = Role.Switch) { vm.setScanHome41(!on) }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.lab), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Add, contentDescription = "Legg til", tint = p.onLab, modifier = Modifier.size(22.dp)) }
            Column(Modifier.weight(1f)) {
                Text("Skanneknapp på Hjem", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1)
                Text(if (on) "Vises på Hjem" else "Skjult på Hjem · vises i de andre fanene", color = p.mut, fontSize = 12.5.sp, maxLines = 2)
            }
            Box(Modifier.size(42.dp, 24.dp).clip(CircleShape).background(if (on) p.pos else p.line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                Box(Modifier.size(18.dp).clip(CircleShape).background(Color.White))
            }
        }
    }
}

/* ======================= Brett: jevn overgang til Hjem ======================= */

/**
 * Modulen skalerer ned (1 → 0,92) og tones ut mens Hjem-knappen går (190 ms), og Hjem tones inn fra 1,03 → 1,0 med fjær
 * (0,85 / 380). Kun transform + opacity i et eget lag (graphicsLayer), ingen layout-animasjon. «Fjern animasjoner»: crossfade 200 ms.
 */
@Composable
internal fun homeTx46(vm: AppViewModel, home: Boolean, wide: Boolean): Modifier {
    if (!wide) return Modifier
    val reduce = reduceMotion45()
    val leave by animateFloatAsState(if (vm.p45.homeLeaving && !home) 1f else 0f, tween(if (reduce) 200 else 190), label = "leave46")
    val enter = remember { Animatable(1f) }
    LaunchedEffect(home) {
        if (home && vm.p46.homeFromRail) {
            vm.p46.homeFromRail = false
            enter.snapTo(0f)
            enter.animateTo(1f, if (reduce) tween(200) else spring(dampingRatio = .85f, stiffness = 380f))
        }
    }
    return Modifier.graphicsLayer {
        val e = enter.value.coerceIn(0f, 1.05f)
        val k = if (reduce) 1f else (1f - .08f * leave) * (1.03f - .03f * e)
        scaleX = k; scaleY = k
        alpha = ((1f - leave) * e.coerceIn(0f, 1f)).coerceIn(0f, 1f)
    }
}
