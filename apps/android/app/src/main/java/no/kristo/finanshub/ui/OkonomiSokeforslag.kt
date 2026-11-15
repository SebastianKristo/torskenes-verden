package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.HomelabType
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize

/*
 * Prompt 27 (ANDROID-B): Finans-søkeforslag (Google-stil), Innstillinger → AI og tolkning → PERSONVERN OG LOGOER med AI-logg,
 * «Velg logo» der logo mangler, og «Fra skjermbilde» i Legg til abonnement. Logikken ligger i Mod27B.kt.
 */

private val nb27 = Locale("nb", "NO")

private fun kr27(v: Double): String = (if (v < 0) "−" else "") + String.format(nb27, "%,.0f", kotlin.math.abs(v)).replace(',', ' ').replace(' ', ' ') + " kr"

/** «Butikk · 2 kjøp · −618 kr». */
private fun sugSub27(s: FinSug27): String {
    val t = when (s.type) { "kategori" -> "Kategori"; "vare" -> "Vare"; else -> "Butikk" }
    val n = if (s.count == 1) "1 kjøp" else "${s.count} kjøp"
    return listOfNotNull(t, n.takeIf { s.count > 0 }, kr27(s.sum).takeIf { s.sum != 0.0 }).joinToString(" · ")
}

/** Forslagslisten under Finans → Søk: rad ≥ 52 dp, ikon i merkefarge, skrevet del normal og resten fet, ↖ (44 dp) fyller inn. */
@Composable
internal fun FinSuggest27(vm: AppViewModel) {
    val p = HomelabTheme.colors
    val s = vm.b27
    val q = vm.finSearchQ
    if (s.sug.isEmpty() || s.sugHidden || vm.finSearchAi || q.isBlank()) return
    Column(
        Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).padding(6.dp),
    ) {
        s.sug.forEach { g ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp))
                    .clickable(role = Role.Button, onClickLabel = "Søk på ${g.name}") {
                        Haptics.select()
                        vm.finSearchQ = g.name
                        vm.finSugClear27(hide = true)
                        vm.runFinSearch(g.name, false)
                    }.padding(start = 10.dp, top = 4.dp, bottom = 4.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SugIcon27(vm, g)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    val r = typedRange27(g.name, q)
                    val txt = buildAnnotatedString {
                        if (r == null) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name) }
                        else {
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name.substring(0, r.first)) }
                            withStyle(SpanStyle(fontWeight = FontWeight.Normal)) { append(g.name.substring(r.first, r.last + 1)) }
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name.substring(r.last + 1)) }
                        }
                    }
                    Text(txt, color = p.textPrimary, style = HomelabType.callout, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(sugSub27(g), color = p.textTertiary, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(
                    Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fyll inn i søket") {
                        Haptics.select()
                        vm.finSearchQ = g.name
                        vm.b27.sugHidden = false
                        vm.finSug27(g.name)
                    },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.NorthWest, contentDescription = null, tint = p.textTertiary, modifier = Modifier.size(20.dp)) }
            }
        }
    }
}

@Composable
private fun SugIcon27(vm: AppViewModel, g: FinSug27) {
    var bmp by remember(g.logoUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(g.logoUrl) { if (g.logoUrl != null) bmp = vm.img27(g.logoUrl) }
    val b = bmp
    if (b != null) Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Color.White).padding(4.dp)) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    } else Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Color(g.color)), contentAlignment = Alignment.Center) {
        Text(g.icon.take(2), color = Color.White, fontWeight = FontWeight.ExtraBold, style = HomelabType.caption, maxLines = 1)
    }
}
