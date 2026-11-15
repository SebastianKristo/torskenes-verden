package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.*

/* ======================= Integrasjoner: logoer ======================= */

/**
 * Ekte logo (hvit rute, radius 10, tynn innerkant, logo 22 px) i stedet for bokstavmerket. Logoen hentes én gang via serverens
 * logo-cache (/finans/api/logo/<domene>). Bokstavmerket vises mens den lastes, og hvis den feiler eller er standardgloben.
 */
@Composable
internal fun IntegLogo32b(vm: AppViewModel, id: String, badge: String, color: Long, size: Int = 34) {
    val dom = integDomain32b(id)
    val bmp by produceState<Bitmap?>(null, dom) { value = dom?.let { d -> runCatching { vm.logo(d) }.getOrNull()?.takeIf { it.width > 16 && it.height > 16 } } }
    val b = bmp
    if (b == null) { IntegBadge26(badge, color, size); return }
    val r = (size * 10f / 34f).dp
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(r)).background(Color.White).border(1.dp, Color(0x141B1A17), RoundedCornerShape(r)),
        contentAlignment = Alignment.Center,
    ) {
        // MET / Yr fyller hele ruten.
        val inner: Dp = if (id == "met") size.dp else (size * 22f / 34f).dp
        Image(b.asImageBitmap(), null, Modifier.size(inner).clip(RoundedCornerShape(if (id == "met") r else 4.dp)), contentScale = ContentScale.Fit)
    }
}
