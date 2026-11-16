package no.kristo.finanshub.ui

import android.os.Build
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.AppViewModel

/*
 * Prompt 50 (ANDROID50B, claude-code-utseende-liquid-glass.md, fasit Innstillinger → Utseende → TEMA og «s.mode==='Glass'» i _rv0()):
 *  - Tredje tema «Liquid Glass» (paper_mode = "glass"): bakgrunn #07070A, hvit tekst, dempet rgba(255,255,255,.66), linjer .16,
 *    kort rgba(255,255,255,.09) med glasskant (1 dp rgba(255,255,255,.18) og lys toppkant), aksent #FF8A4C, positiv #5fd18b.
 *  - Tre fargeskyer bak alt innhold (oransje, blå, brent oransje). På API 31+ blurres de med RenderEffect.createBlurEffect
 *    (Modifier.blur bruker den på Android 12+); eldre enheter får myke radialgradienter uten blur, og kortene er rene
 *    gjennomsiktige flater.
 *  - Fanelinjen er glass med aktiv fane hvit og mørk tekst (PaperPal.nav/navAct).
 *  - Valget slår også på «Hjem som fliser». Serveren kjenner bare auto/lys/mork, så Glass lagres per enhet og sendes som «mork».
 */

/** Papir-paletten i Liquid Glass. Flatene i egne menyer (pop/popSel) er tette så tekst over innhold alltid er lesbar. */
internal val GLASS_PAL50 = PaperPal(
    ink = Color.White, bg = Color(0xFF07070A), card = Color(0x17FFFFFF), line = Color(0x29FFFFFF), lab = Color(0xFFFF8A4C),
    mut = Color(0xA8FFFFFF), pos = Color(0xFF5FD18B), sub = Color(0xA8FFFFFF),
    surf2 = Color(0x1FFFFFFF), container = Color(0x24FFFFFF), tertiary = Color(0x24FFB08A), posSoft = Color(0x295FD18B),
    nav = Color(0xE01A1A20), navInk = Color(0xB3FFFFFF), navAct = Color.White, navActInk = Color(0xFF07070A),
    onLab = Color(0xFF1B1A17), pop = Color(0xFF17171C), popSel = Color(0xFF26262D),
)

/** Nøkkelen for «Hjem som fliser» (standard på; av = de gamle minikortene). */
internal const val HOME_TILES50 = "papir_home_tiles"

/** true når Liquid Glass er valgt (leses i komposisjonen). */
internal val glass50: Boolean get() = Tone.glass

internal fun AppViewModel.homeTiles50(): Boolean = flag(HOME_TILES50, true)

/** «Liquid Glass» i Innstillinger → Utseende: temaet og fliser på Hjem. */
internal fun AppViewModel.setGlass50() {
    setPref(HOME_TILES50, true)
    setPaperMode("glass")
}

private val EDGE50 = Brush.verticalGradient(0f to Color(0x40FFFFFF), .18f to Color(0x2EFFFFFF), 1f to Color(0x2EFFFFFF))

/** Glasskanten (1 dp rgba(255,255,255,.18), litt lysere øverst som «inset 0 1px 0 rgba(255,255,255,.25)»). Ingenting i Papir. */
internal fun glassEdge50(shape: Shape): Modifier = if (Tone.glass) Modifier.border(BorderStroke(1.dp, EDGE50), shape) else Modifier

/** Fargeskyene bak alt innhold i Glass (pointer-events: none – de tegnes bare, uten klikk). */
@Composable
internal fun GlassBackdrop50(modifier: Modifier = Modifier) {
    if (!Tone.glass) return
    BoxWithConstraints(modifier.fillMaxSize()) {
        val w = maxWidth
        val h = maxHeight
        Blob50(Color(0xFFFF7A3D), 300.dp, (-80).dp, 260.dp, 90.dp, .5f)
        Blob50(Color(0xFF4D6BFF), 260.dp, w - 260.dp + 90.dp, 520.dp, 90.dp, .42f)
        Blob50(Color(0xFFC24E17), 220.dp, 40.dp, h - 220.dp + 40.dp, 80.dp, .38f)
    }
}

@Composable
private fun Blob50(c: Color, size: Dp, x: Dp, y: Dp, blur: Dp, a: Float) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // RenderEffect.createBlurEffect (Modifier.blur på API 31+).
        Box(Modifier.offset(x, y).size(size).blur(blur, BlurredEdgeTreatment.Unbounded).alpha(a).clip(CircleShape).background(c))
    } else {
        // Eldre Android: ingen RenderEffect – en myk radialgradient gir samme sky uten blur.
        val big = size + blur * 2
        Box(Modifier.offset(x - blur, y - blur).size(big).alpha(a).background(Brush.radialGradient(listOf(c, c.copy(alpha = .55f), Color.Transparent))))
    }
}
