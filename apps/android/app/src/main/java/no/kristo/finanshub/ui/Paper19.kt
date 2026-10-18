package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.AppPrefs
import no.kristo.finanshub.Haptics
import no.kristo.finanshub.AppViewModel
import no.kristo.finanshub.BG_PLANETS
import no.kristo.finanshub.BG_TYPES
import kotlin.random.Random

/*
 * Prompt 19: bildelaget i fotovinduet. Bildet (cover, blur og Papir-desaturering) ligger nederst.
 * Over det kommer demping, scrim, papirtekstur og eventuelt regn eller snø.
 */

/** Papir: bildet desatureres litt (saturate .75), så det passer med papiruttrykket. */
private val PAPER_SATURATION = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(.75f) })

/** Mørk tekst (#1B1A17) på lyse bilder, hvit på mørke. */
internal fun bgForeground(vm: AppViewModel, hasImage: Boolean): Color =
    if (hasImage && vm.bgInfo?.themeHint == "light") Color(0xFF1B1A17) else Color.White

@Composable
internal fun BoxScope.BgLayer(vm: AppViewModel, bmp: Bitmap?) {
    val light = bmp != null && vm.bgInfo?.themeHint == "light"
    if (bmp != null) {
        val blur = vm.bgBlur
        Image(
            bmp.asImageBitmap(), null, contentScale = ContentScale.Crop, colorFilter = PAPER_SATURATION,
            modifier = Modifier.matchParentSize().then(if (blur > 0) Modifier.blur(blur.dp) else Modifier),
        )
        val dim = vm.bgDim
        if (dim > 0) Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = dim / 100f)))
    }
    // Scrim øverst og nederst så teksten alltid kan leses. Lyse bilder får lys scrim (mørk tekst), andre bilder mørk.
    val s = if (light) Color.White else Color.Black
    Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to s.copy(alpha = if (light) .35f else .25f), .35f to Color.Transparent, 1f to s.copy(alpha = if (light) .55f else .45f))))
    if (bmp != null) PaperGrain(Modifier.matchParentSize())
    val kind = vm.bgInfo?.particles
    if (kind != null && vm.bgAnimate && !vm.bgReduceMotion()) BgParticles(kind, Modifier.matchParentSize())
}

/** Svak papirtekstur: faste prikker med lav opasitet. */
@Composable
private fun PaperGrain(modifier: Modifier) {
    val dots = remember { Random(19).let { r -> List(700) { Triple(r.nextFloat(), r.nextFloat(), r.nextBoolean()) } } }
    Canvas(modifier) {
        val rad = 1.dp.toPx() * .7f
        for ((x, y, dark) in dots) {
            drawCircle(if (dark) Color(0x0F1B1A17) else Color(0x14FFFFFF), rad, Offset(x * size.width, y * size.height))
        }
    }
}

/** Diskret regn eller snø. Slås av ved batterisparing og når animasjoner er skrudd av i systemet. */
@Composable
private fun BgParticles(kind: String, modifier: Modifier) {
    val snow = kind == "snow"
    val drops = remember(kind) { Random(kind.hashCode()).let { r -> List(if (snow) 46 else 60) { floatArrayOf(r.nextFloat(), r.nextFloat(), .6f + r.nextFloat() * .8f) } } }
    val t by rememberInfiniteTransition(label = "bg").animateFloat(
        0f, 1f, infiniteRepeatable(tween(if (snow) 9000 else 1400, easing = LinearEasing), RepeatMode.Restart), label = "bgT",
    )
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        for (d in drops) {
            val speed = d[2]
            val y = ((d[1] + t * speed) % 1f) * (h + 20f) - 10f
            if (snow) {
                val x = (d[0] * w + kotlin.math.sin((t * 6.283f + d[1] * 10f).toDouble()).toFloat() * 8.dp.toPx() + w) % w
                drawCircle(Color.White.copy(alpha = .55f), (1.2f + speed) * 1.dp.toPx(), Offset(x, y))
            } else {
                val x = d[0] * w
                val len = 9.dp.toPx() * speed
                drawLine(Color.White.copy(alpha = .28f), Offset(x, y), Offset(x - len * .18f, y + len), 1.dp.toPx(), StrokeCap.Round)
            }
        }
    }
}

/**
 * Innstillinger → Bakgrunn på Hjem: fem forhåndsvisningskort (Vær, Planeter, Oslo, Eget bilde, Ingen), planetvalg,
 * uskarphet og mørklegging, «Kun på Wi-Fi» og «Animasjon». Kortene ruller sideveis, så det virker likt på Fold.
 */
@Composable
internal fun PaperBgSettings(vm: AppViewModel, pickOwn: () -> Unit) {
    val p = PaperPal.current
    val kind = vm.photoKind
    PCard {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BG_TYPES.forEach { (k, name) ->
                val on = kind == k || (k == "none" && kind == "cur")
                val failed = k in vm.photoFailed
                val thumb = if (k == "none") null else vm.photoThumbs[k]
                Column(
                    Modifier.width(112.dp).clip(RoundedCornerShape(14.dp)).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(14.dp))
                        .clickable(onClickLabel = name) {
                            Haptics.select()
                            when {
                                k == "custom" && thumb == null -> pickOwn()
                                failed -> { vm.retryPhoto(k); vm.setPhotoKind(k) }
                                else -> vm.setPhotoKind(k)
                            }
                        },
                ) {
                    Box(Modifier.fillMaxWidth().height(72.dp).background(Brush.linearGradient(listOf(Color(0xFF4A5A6A), Color(0xFF2A3440), Color(0xFF1D242C))))) {
                        thumb?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, colorFilter = PAPER_SATURATION, modifier = Modifier.matchParentSize()) }
                        if (k == "custom" && thumb == null) Text("+", color = Color.White, fontSize = 26.sp, modifier = Modifier.align(Alignment.Center))
                        if (on) Text("✓", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp, 4.dp))
                    }
                    Column(Modifier.padding(8.dp, 6.dp)) {
                        Text(name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
                        val sub = when {
                            failed -> "Prøv igjen"
                            k == "none" -> "Bare gradient"
                            else -> vm.bgPreviewInfo[k]?.credit?.line ?: when (k) { "weather" -> "MET · Wikimedia Commons"; "planets" -> "NASA / JPL · Wikimedia Commons"; "oslo" -> "Wikimedia Commons"; else -> "Last opp" }
                        }
                        Text(sub, color = if (failed) p.lab else p.mut, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        if (vm.photoThumbs["custom"] != null) BgRow("Eget bilde", "Last opp nytt ›") { pickOwn() }
        if (kind == "planets") {
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Planet", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BG_PLANETS.forEach { (k, n) -> PChip(n, vm.bgPlanet == k) { vm.updateBgSetting(AppPrefs.BG_PLANET, k) } }
                }
                if (vm.bgPlanet == "auto") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PChip("Daglig", vm.bgRotate == "daily") { vm.updateBgSetting(AppPrefs.BG_ROTATE, "daily") }
                    PChip("Hver time", vm.bgRotate == "hourly") { vm.updateBgSetting(AppPrefs.BG_ROTATE, "hourly") }
                }
            }
        }
        BgSlider("Uskarphet", vm.bgBlur, 20, "px") { vm.updateBgSetting(AppPrefs.BG_BLUR, it) }
        BgSlider("Mørklegging", vm.bgDim, 60, "%") { vm.updateBgSetting(AppPrefs.BG_DIM, it) }
        PToggle("Kun på Wi-Fi", "Nye bilder lastes bare ned på Wi-Fi. Ellers vises det siste lagrede bildet.", vm.bgWifiOnly, top = true) { vm.updateBgSetting(AppPrefs.BG_WIFI, it) }
        PToggle("Animasjon", "Diskret regn og snø. Slås av ved batterisparing.", vm.bgAnimate, top = true) { vm.updateBgSetting(AppPrefs.BG_ANIMATE, it) }
        vm.bgInfo?.credit?.line?.let { Text(it, color = p.mut, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(14.dp, 0.dp, 14.dp, 12.dp)) }
    }
}

@Composable
private fun BgRow(title: String, value: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Text(value, color = p.mut, fontSize = 13.sp)
    }
}

/** Slider som viser verdien mens man drar, og lagrer først når man slipper (unngår mange kall til serveren). */
@Composable
private fun BgSlider(title: String, value: Int, max: Int, unit: String, onDone: (Int) -> Unit) {
    val p = PaperPal.current
    var v by remember(value) { mutableFloatStateOf(value.toFloat()) }
    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
    Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp, 14.dp, 2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
            Text("${v.toInt()} $unit", color = p.mut, fontSize = 13.sp)
        }
        Slider(
            v, { v = it }, valueRange = 0f..max.toFloat(), steps = max - 1, onValueChangeFinished = { onDone(v.toInt()) },
            colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent),
        )
    }
}
