package no.kristo.finanshub.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material3.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/* ---------------- Markering i Innstillinger ---------------- */

/**
 * Målet for AI-søket: scrolles fram og får en rød ring som pulserer (3 dp #b23a2a + utvidende glød, 1,4 s × 4).
 * Forsvinner etter 6 s eller ved første trykk.
 */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.hl34(vm: AppViewModel, anchor: String, radius: Dp = 20.dp): Modifier = composed {
    val on = vm.p34.hl == anchor
    val seq = vm.p34.hlSeq
    val req = remember { BringIntoViewRequester() }
    LaunchedEffect(on, seq) {
        if (!on) return@LaunchedEffect
        delay(380)
        runCatching { req.bringIntoView() }
        delay(5600)
        if (vm.p34.hl == anchor && vm.p34.hlSeq == seq) vm.p34.hl = null
    }
    val base = this.bringIntoViewRequester(req)
    if (!on) return@composed base
    val red = Color(0xFFB23A2A)
    val t = rememberInfiniteTransition(label = "hl34")
    val v by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "hl34v")
    base
        .pointerInput(seq) {
            awaitPointerEventScope {
                while (true) {
                    val ev = awaitPointerEvent(PointerEventPass.Initial)
                    if (ev.changes.any { it.pressed }) { vm.p34.hl = null; break }
                }
            }
        }
        .drawWithContent {
            drawContent()
            val r = radius.toPx()
            val w = 3.dp.toPx()
            val g = 14.dp.toPx() * v
            drawRoundRect(red.copy(alpha = .45f * (1f - v)), topLeft = Offset(-g, -g), size = Size(size.width + 2 * g, size.height + 2 * g),
                cornerRadius = CornerRadius(r + g, r + g), style = Stroke(width = 6.dp.toPx() * (1f - v) + 1f))
            drawRoundRect(red, topLeft = Offset(w / 2, w / 2), size = Size(size.width - w, size.height - w), cornerRadius = CornerRadius(r, r), style = Stroke(w))
        }
}

/** Mørk boble over målet («✦ Trykk her for å oppdatere»), bare mens markeringen står. */
@Composable
internal fun Hl34Bubble(vm: AppViewModel, anchor: String) {
    if (vm.p34.hl != anchor) return
    val text = ANCHORS34.firstOrNull { it.id == anchor }?.bubble ?: return
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(text, color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Color(0xFF1B1A17)).padding(horizontal = 14.dp, vertical = 8.dp))
    }
}

/* ======================= Innstillinger: ikon på hver rad ======================= */

/** true inne i Innstillinger: PRow og PToggle får ikonbrikke etter tittelen. Fargen er sidens farge. */
internal val LocalSetIcons36 = compositionLocalOf<Color?> { null }

/** Sidens farge (samme som i sidemenyen). */
internal fun setTint36(page: String?): Color = Color(when (page) {
    "sysbackup", "backup", "data" -> 0xFF2B5D8A
    "notify" -> 0xFFB8860B
    "accounts", "security", "tokens" -> 0xFF5B4BB2
    "ai" -> 0xFF8A4FB8
    "kal", "integ" -> 0xFF2F7D4F
    "look", "haptics" -> 0xFFB2602A
    else -> 0xFF2B5D8A
})

@Composable
internal fun SetIcons36(page: String?, content: @Composable () -> Unit) = CompositionLocalProvider(LocalSetIcons36 provides setTint36(page), content = content)

/** Lucide-ikoner (24 × 24, strek 2). */
private object Luc36 {
    const val user = "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8"
    const val at = "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"
    const val shield = "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
    const val shieldCheck = shield + "M9 12l2 2 4-4"
    const val image = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4a2 2 0 0 0 0-4M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21"
    const val keyRound = "M2.6 18.4A2 2 0 0 0 2 19.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4zM16.5 7a.5.5 0 1 0 0 1a.5.5 0 0 0 0-1"
    const val key = "M15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4M21 2l-9.6 9.6M7.5 10a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11"
    const val laptop = "M4 5h16v10H4zM2 19h20"
    const val lock = "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4"
    const val lockKeyhole = lock + "M12 15v2"
    const val history = "M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"
    const val logOut = "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
    const val sunMoon = "M12 8a2.83 2.83 0 0 0 4 4a4 4 0 1 1-4-4M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"
    const val palette = "M12 22a1 1 0 0 1 0-20a10 9 0 0 1 10 9a5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM13.5 6.5h.01M17.5 10.5h.01M6.5 12.5h.01M8.5 7.5h.01"
    const val type = "M4 7V4h16v3M9 20h6M12 4v16"
    const val languages = "M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"
    const val move = "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"
    const val appWindow = "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 4v4M2 8h20M6 4v4"
    const val grid = "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"
    const val grip = "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"
    const val columns = "M3 3h18v18H3zM9 3v18M15 3v18"
    const val news = "M15 18h-5M18 14h-8M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2M10 6h8v4h-8z"
    const val hand = "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
    const val globe = "M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20M2 12h20"
    const val cloud = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"
    const val search = "M11 3a8 8 0 1 0 0 16a8 8 0 0 0 0-16M21 21l-4.3-4.3"
    const val sparkles = "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0zM20 3v4M22 5h-4"
    const val activity = "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
    const val bell = "M10.27 21a2 2 0 0 0 3.46 0M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"
    const val bellRing = bell + "M22 8c0-2.3-.8-4.3-2-6M4 2C2.8 3.7 2 5.7 2 8"
    const val mail = "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
    const val moon = "M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9z"
    const val calendar = "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18"
    const val calendarClock = "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5M16 2v4M8 2v4M3 10h5M17.5 17.5L16 16.3V14M16 10a6 6 0 1 0 0 12a6 6 0 0 0 0-12"
    const val pkg = "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.3 7L12 12l8.7-5M7.5 4.27l9 5.15"
    const val timer = "M10 2h4M12 14l3-3M12 6a8 8 0 1 0 0 16a8 8 0 0 0 0-16"
    const val hardDrive = "M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"
    const val download = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
    const val downloadCloud = "M12 13v8l-4-4M12 21l4-4M4.39 15.56A7 7 0 1 1 15.71 9h1.79a4.5 4.5 0 0 1 2.5 8.24"
    const val scanFace = "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"
    const val vibrate = "M2 8l2 2-2 2 2 2-2 2M22 8l-2 2 2 2-2 2 2 2M8 5h8v14H8z"
    const val phone = "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01"
    const val refresh = "M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"
    const val keyboard = "M2 6h20v12H2zM10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"
    const val link = "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
    const val eyeOff = "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24"
    const val check = "M21.8 10A10 10 0 1 1 17 3.34M9 11l3 3L22 4"
    const val play = "M6 3l14 9-14 9z"
    const val repeat = "M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"
    const val archive = "M2 3h20v5H2zM4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"
    const val server = "M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01"
    const val listChecks = "M3 17l2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"
    const val rotate = "M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"
    const val cpu = "M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"
    const val coins = "M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"
    const val listTodo = "M3 5h6v6H3zM3 17l2 2 4-4M13 6h8M13 12h8M13 18h8"
    const val audio = "M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"
    const val sunrise = "M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"
    const val smile = "M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"
    const val info = "M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20M12 16v-4M12 8h.01"
    const val scroll = "M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
    const val network = "M16 16h6v6h-6zM2 16h6v6H2zM9 2h6v6H9zM5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"
    const val power = "M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04"
    const val trash = "M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
    const val users = "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
    const val folder = "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
    const val sliders = "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"
    const val map = "M14.1 5.9L9 3 3 6v15l6-3 6 3 6-3V3z M9 3v15M15 6v15"
    const val camera = "M3 8h3l2-3h8l2 3h3v11H3zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8"
    const val wifi = "M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"
}

private val RX36: List<Pair<Regex, String>> = listOf(
    "logg ut" to Luc36.logOut, "slett|fjern|tilbakestill" to Luc36.trash, "start på nytt|omstart" to Luc36.power,
    "siste backup" to Luc36.check, "ta backup" to Luc36.play, "automatisk backup" to Luc36.calendarClock, "hvor ofte|frekvens" to Luc36.repeat,
    "behold" to Luc36.archive, "nettverksdisk|smb|nas|lagres på|mål" to Luc36.server, "omfang|hva tas med|moduler" to Luc36.listChecks,
    "gjenopprett" to Luc36.rotate, "krypter|gjenopprettingsnøkkel" to Luc36.lockKeyhole, "kopi til sky|sky" to Luc36.cloud, "last ned modell" to Luc36.downloadCloud,
    "last ned" to Luc36.download, "varsle meg|backup feiler" to Luc36.bellRing,
    "^navn$|visningsnavn" to Luc36.user, "brukernavn" to Luc36.at, "rolle" to Luc36.shield, "profilbilde" to Luc36.image,
    "totrinn|2fa|engangskode" to Luc36.keyRound, "pålitelige enheter" to Luc36.phone, "pålitelig" to Luc36.laptop, "passord|krev" to Luc36.lock,
    "økter|historikk" to Luc36.history, "konto|bruker" to Luc36.users,
    "fingeravtrykk|face id|biometri|ansikt|lås med" to Luc36.scanFace, "lås" to Luc36.lock,
    "tema|papir|mørk|lys" to Luc36.sunMoon, "farge" to Luc36.palette, "bakgrunn|bilde" to Luc36.image, "tekststørrelse|skrift" to Luc36.type,
    "språk|language" to Luc36.languages, "bevegelse|animasjon" to Luc36.move, "app-ikon|ikon|appnavn" to Luc36.appWindow,
    "widget" to Luc36.grid, "rekkefølge|fanelinje" to Luc36.grip, "kolonne" to Luc36.columns, "nyhet|rss" to Luc36.news, "hilsen" to Luc36.hand,
    "domene" to Luc36.globe, "cloudflare" to Luc36.cloud, "search console|søk" to Luc36.search, "nedetid|oppetid" to Luc36.activity,
    "e-post|epost|mail" to Luc36.mail, "stille" to Luc36.moon, "push|varsel|varsl|lyd" to Luc36.bell,
    "kalender|google|ical|timeplan|canvas" to Luc36.calendar, "pakke|sporing|frakt" to Luc36.pkg, "prøve" to Luc36.timer,
    "backup|lagring|disk" to Luc36.hardDrive, "oppdater|versjon tilgjengelig" to Luc36.download,
    "haptikk|vibr" to Luc36.vibrate, "bakgrunnsoppdatering|synk|oppdater" to Luc36.refresh, "hurtigtast|tastatur" to Luc36.keyboard,
    "home assistant|lenke|url|adresse" to Luc36.link, "skjul|vis " to Luc36.eyeOff,
    "modell|ollama|gpu" to Luc36.cpu, "token" to Luc36.coins, "nøkkel|api" to Luc36.key, "jobb|kø" to Luc36.listTodo,
    "stemme|opplesning|les opp|tts" to Luc36.audio, "brief" to Luc36.sunrise, "figur|glimt" to Luc36.smile, "personvern|logo" to Luc36.shieldCheck,
    "ai|tolkning|gemini|groq|oppsummer" to Luc36.sparkles, "versjon|om appen|info" to Luc36.info, "logg" to Luc36.scroll, "nettverk|server" to Luc36.network,
    "posisjon|kart|sone" to Luc36.map, "kamera|skann" to Luc36.camera, "wifi" to Luc36.wifi, "mappe|kategori" to Luc36.folder,
).map { (k, v) -> Regex(k, RegexOption.IGNORE_CASE) to v }

private val DANGER36 = Regex("logg ut|slett|fjern|tilbakestill|start på nytt", RegexOption.IGNORE_CASE)

/** Ikonet for raden (Lucide-sti), etter tittelen. */
internal fun setIconPath36(title: String): String = RX36.firstOrNull { it.first.containsMatchIn(title.trim()) }?.second ?: Luc36.sliders

internal fun setDanger36(title: String): Boolean = DANGER36.containsMatchIn(title)

/** Ikonbrikken (30 × 30, radius 10, sidens farge 12 % / 18 % i mørk). Status (✓ OK / Feilet) gir grønn eller rød brikke. */
@Composable
internal fun SetChip36(title: String, value: String = "") {
    val tint = LocalSetIcons36.current ?: return
    val dark = Tone.paperDark
    val c = when {
        setDanger36(title) -> Color(0xFFB23A2A)
        value.contains("Feilet", true) -> Color(0xFFB23A2A)
        value.startsWith("✓") && Regex("siste|status|test", RegexOption.IGNORE_CASE).containsMatchIn(title) -> Color(0xFF2F7D4F)
        else -> tint
    }
    val ic = if (dark) Color(
        (c.red + (1f - c.red) * .35f).coerceIn(0f, 1f), (c.green + (1f - c.green) * .35f).coerceIn(0f, 1f), (c.blue + (1f - c.blue) * .35f).coerceIn(0f, 1f),
    ) else c
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = if (dark) .18f else .12f)), contentAlignment = Alignment.Center) {
        WxIcon(setIconPath36(title), ic, 18.dp, stroke = 2f)
    }
}

/** Skillelinjen starter under teksten (iOS-stil) når radene har ikon. */
@Composable
internal fun SetRule36() {
    val p = PaperPal.current
    val on = LocalSetIcons36.current != null
    Box(Modifier.fillMaxWidth().padding(start = if (on) 56.dp else 0.dp).height(1.dp).background(p.line))
}

internal fun setTitleColor36(title: String, def: Color): Color = if (setDanger36(title)) Color(0xFFB23A2A) else def

@Composable
internal fun setIconsOn36(): Boolean = LocalSetIcons36.current != null

/* ---------------- Innstillinger: fremheving («Ta meg dit →» og søketreff) ---------------- */

/**
 * Raden med denne nøkkelen fremheves når vm.p25.hl peker på den: scrolles fram, lys rød bakgrunn og rød strek
 * til venstre i ca. 3 s, som så toner ut.
 */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.hl25(vm: AppViewModel, key: String): Modifier = composed {
    val p = PaperPal.current
    val on = vm.p25.hl == key
    val req = remember { BringIntoViewRequester() }
    val a = remember { Animatable(0f) }
    val seq = vm.p25.hlSeq
    LaunchedEffect(on, seq) {
        if (!on) { a.snapTo(0f); return@LaunchedEffect }
        a.snapTo(1f)
        delay(350)
        runCatching { req.bringIntoView() }
        delay(2300)
        a.animateTo(0f, tween(700))
        if (vm.p25.hl == key && vm.p25.hlSeq == seq) vm.p25.hl = null
    }
    // Tegnes over innholdet (et kort har egen bakgrunn): svak rød flate og rød strek til venstre.
    this.bringIntoViewRequester(req).drawWithContent {
        drawContent()
        val v = a.value
        if (v > 0f) {
            drawRect(p.lab.copy(alpha = .12f * v))
            drawRect(p.lab.copy(alpha = v), size = Size(3.dp.toPx(), size.height))
        }
    }
}

/** Nøkkelen for en vanlig rad i Innstillinger (SetRow) er tittelen. */
internal fun rowKey25(title: String): String = "row:$title"

private val when_ = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale("nb", "NO"))

private fun time(t: Long?) = t?.let { when_.format(Date(it)) } ?: "–"

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun Group(content: @Composable ColumnScope.() -> Unit) =
    // Papir: hvite kort med 20 dp runding (samme som PCard).
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.surface1).padding(vertical = 4.dp), content = content)

@Composable
private fun Toggle(label: String, sub: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    PToggle(label, sub, on, onChange = onChange)
}

@Composable
private fun Choice(label: String, sub: String? = null, on: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(label); sub?.let { Text(it, color = C.text2, fontSize = 12.sp) } }
        RadioButton(selected = on, onClick = onClick, colors = RadioButtonDefaults.colors(selectedColor = C.primary))
    }
}

@Composable
private fun Info(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp)) { Text(k, Modifier.weight(1f), color = C.text2); Text(v, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

@Composable
private fun Note(text: String) = Text(text, color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp))

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { SectionLabel(title); content() }
}

@Composable
private fun Pages(content: @Composable ColumnScope.() -> Unit) = Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)

private fun homelab(vm: AppViewModel) = vm.base.trimEnd('/') + "/"

/* ---------------- Sider ---------------- */

@Composable
internal fun AccountsPage(vm: AppViewModel) = Pages {
    // Prompt 28 (konto-farger): i Papir ligger innholdet 23 dp opp i toppbildet; etiketten PROFILBILDE skal stå under bildet.
    Spacer(Modifier.height(28.dp))
    // Prompt 36: Konto viser profilbildet sentrert (88–96 dp) over navnet, med «Endre bilde» (ui/Ui36.kt).
    // Prompt 37: Konto → Profil (koblingen bruker ⟷ profil i husstanden).
    KontoAvatar36(vm); ProfileLink37(vm)
    Note("Hver konto har egne data, tokens og varsler. Bytt raskt ved å holde inne profilbildet.")
    Group {
        vm.accounts.forEach { a ->
            Row(Modifier.fillMaxWidth().clickable { if (a.id != vm.activeId) vm.switchTo(a.id) }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(if (a.id == vm.activeId) C.primary else C.surface3), contentAlignment = Alignment.Center) {
                    Text(initial(a.name.ifBlank { a.username.ifBlank { "K" } }), color = if (a.id == vm.activeId) C.onPrimary else C.text, fontWeight = FontWeight.Bold)
                }
                Column(Modifier.weight(1f)) {
                    Text(a.name.ifBlank { a.username.ifBlank { "Konto" } } + if (a.id == vm.activeId) " · aktiv" else "", fontWeight = FontWeight.Medium)
                    Text("${a.username.ifBlank { "–" }} · ${a.role} · ${host(a.server)}", color = C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                TextButton(onClick = { vm.logout(a.id) }) { Text("Logg ut", color = PaperPal.current.lab, fontWeight = FontWeight.Bold) }
            }
        }
    }
    // Primærknapp: lab-bakgrunn med onLab-tekst i Papir (aldri hvit på lys rosa); ikonet følger tekstfargen.
    Button(onClick = { vm.addingAccount = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = PaperPal.current.lab, contentColor = PaperPal.current.onLab)) { Icon(Icons.Filled.PersonAdd, null); Spacer(Modifier.width(8.dp)); Text("Legg til konto", fontWeight = FontWeight.Bold) }
    if (vm.accounts.size > 1) OutlinedButton(onClick = { vm.logoutOthers() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Logg ut andre kontoer") }
    Note("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.")
    // Prompt 44: FAMILIE · LOGG INN SOM og SERVER · EIER – prompt 68: flyttet til Husstand → Brukere og familie (ui/Users68Ui.kt).
    Users68Link(vm, if (vm.userIsAdmin) "Brukerne, Logg inn som og eier av serveren · Familie, helse og posisjon" else "Familie, helse og posisjon")
    // Prompt 38: ENHETER (Logg inn på ny enhet) og ØKT (Lås skjermen, Logg ut, Logg ut av alle enheter) nederst på Konto.
    ServerLink47(vm); Session38(vm) // Prompt 41/47: Konto → SERVER åpner Innstillinger → Server (lokal, ekstern, status, Tilbakestill)
}

@Composable
internal fun SecurityPage(vm: AppViewModel, onPrivacyChanged: () -> Unit) = Pages {
    val uri = LocalUriHandler.current
    Group {
        Toggle("Lås med fingeravtrykk eller ansikt", "Kreves når appen åpnes. PIN/mønster kan brukes som reserve.", vm.flag(AppPrefs.LOCK)) { vm.setPref(AppPrefs.LOCK, it) }
    }
    if (vm.flag(AppPrefs.LOCK)) Section("Lås etter") {
        Group {
            listOf(0 to "Umiddelbart", 1 to "1 min", 5 to "5 min", 15 to "15 min").forEach { (m, n) ->
                Choice(n, on = vm.optionInt(AppPrefs.LOCK_AFTER, 0) == m) { vm.setPref(AppPrefs.LOCK_AFTER, m) }
            }
        }
    }
    Group {
        Toggle("Skjul beløp i appveksleren", "Viser et blankt bilde i oversikten over åpne apper", vm.flag(AppPrefs.HIDE_SWITCHER)) { vm.setPref(AppPrefs.HIDE_SWITCHER, it); onPrivacyChanged() }
    }
    Section("Tofaktor (2FA)") {
        Group {
            // Prompt 40 (claude-code-2fa-i-appen.md): hele oppsettet skjer i appen (ui/Ui40.kt), aldri i nettleseren.
            Box(Modifier.fillMaxWidth().hl34(vm, "2fa", 0.dp)) { TfRow40(vm) } // prompt 34: mål «2fa»
        }
        Note("Autentiseringsappen på denne telefonen (Google Authenticator, 1Password, Aegis …) åpnes med ett trykk. Reservekodene får du til slutt.")
    }
    Section("Pålitelige enheter") {
        Group {
            Info("Denne enheten", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
            Row(Modifier.fillMaxWidth().clickable { uri.openUri(homelab(vm)) }.padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Administrer i Homelab", Modifier.weight(1f), color = C.primary)
                Icon(Icons.Filled.OpenInBrowser, null, tint = C.text2)
            }
        }
        Note("Appen bruker et eget token. Fra internett kreves alltid passord, og 2FA hvis det er på.")
    }
}

private val allScopes = listOf(
    "receipts:write" to "Last opp kvitteringer", "read:transactions" to "Les transaksjoner", "read:summary" to "Les sammendrag",
    "read:budget" to "Les budsjett", "write:transactions" to "Endre transaksjoner", "finance:read" to "Les alt i FinansHub",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TokensPage(vm: AppViewModel) = Pages {
    val clip = LocalClipboardManager.current
    Note("Tokens brukes av iOS-snarveien for kvitteringer, Home Assistant, Excel Power Query og skript. De gir bare tilgangen du velger og kan trekkes tilbake når som helst.")
    vm.newToken?.let { t ->
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.positiveBg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Kopier nå – tokenet vises bare én gang", color = C.positive, fontWeight = FontWeight.SemiBold)
            Text(t, fontFamily = Mono, fontSize = 13.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { clip.setText(AnnotatedString(t)); vm.message = "Kopiert" }, colors = ButtonDefaults.buttonColors(containerColor = C.positive, contentColor = C.positiveBg)) { Text("Kopier") }
                TextButton(onClick = { vm.newToken = null }) { Text("Ferdig", color = C.positive) }
            }
        }
    }
    vm.tokenError?.let { Note(it) }
    val list = vm.tokens
    if (list == null) Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    else if (list.isNotEmpty()) Group {
        list.forEach { t ->
            Row(Modifier.fillMaxWidth().padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.name, fontWeight = FontWeight.Medium)
                    Text(t.scopes.joinToString(", "), color = C.text2, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("Laget ${time(t.created)} · sist brukt ${time(t.lastUsed)} · utløper ${t.expires?.let { time(it) } ?: "aldri"}", color = C.text2, fontSize = 11.sp)
                }
                TextButton(onClick = { vm.revokeToken(t.id) }) { Text("Trekk tilbake", color = C.primary) }
            }
        }
    } else if (vm.tokenError == null) Note("Ingen tokens ennå.")
    if (vm.tokenError == null) Section("Lag nytt token") {
        var name by remember { mutableStateOf("") }
        var scopes by remember { mutableStateOf(setOf("receipts:write")) }
        var days by remember { mutableStateOf<Int?>(90) }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.surface1).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(name, { name = it }, label = { Text("Navn, f.eks. iOS-snarvei") }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
            Text("Tilganger", color = C.text2, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                allScopes.forEach { (k, n) ->
                    FilterChip(selected = k in scopes, onClick = { scopes = if (k in scopes) scopes - k else scopes + k }, label = { Text(n) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = C.container, selectedLabelColor = C.onContainer))
                }
            }
            Text("Utløper", color = C.text2, fontSize = 13.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(30 to "30 d", 90 to "90 d", 365 to "1 år", null to "Aldri").forEach { (d, n) ->
                    FilterChip(selected = days == d, onClick = { days = d }, label = { Text(n) })
                }
            }
            Button(onClick = { vm.createToken(name.ifBlank { "Token" }, scopes.toList(), days); name = "" }, enabled = scopes.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Lag token", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
internal fun ScanPage(vm: AppViewModel) = Pages {
    Section("Skanneknappen") {
        Group {
            Choice("Trykk åpner kameraet", "Hold inne for å velge fra Bilder eller Filer", vm.option(AppPrefs.SCAN_TAP, "camera") == "camera") { vm.setPref(AppPrefs.SCAN_TAP, "camera") }
            Choice("Trykk viser valg", "Hold inne for å åpne kameraet direkte", vm.option(AppPrefs.SCAN_TAP, "camera") == "choices") { vm.setPref(AppPrefs.SCAN_TAP, "choices") }
        }
    }
    Group {
        Toggle("Beskjær automatisk", "Finner kantene på kvitteringen før AI-en leser den", vm.flag(AppPrefs.AUTO_CROP, true)) { vm.setPref(AppPrefs.AUTO_CROP, it) }
        Toggle("Lagre originalbildet", "Lagres sammen med kvitteringen på serveren", vm.flag(AppPrefs.KEEP_ORIGINAL, true)) { vm.setPref(AppPrefs.KEEP_ORIGINAL, it) }
        Toggle("Last opp bare på Wi-Fi", "Ellers settes filer i kø til du er på Wi-Fi", vm.flag(AppPrefs.WIFI_ONLY)) { vm.setPref(AppPrefs.WIFI_ONLY, it) }
        // Prompt 48: begge valgene er av som standard. ML Kit og dokumentskanneren kjører på telefonen (Play-tjenester); bildet og
        // den lokale OCR-teksten sendes bare til din egen Glimt-server (POST /finans/api/receipts/scan), som tolker og kontrollerer.
        Toggle("Les teksten på telefonen", "Google ML Kit leser teksten lokalt. Teksten sendes til Glimt sammen med bildet, og Glimt kontrollerer alt.", vm.flag(PREF_OCR_LOCAL47, false)) { vm.setPref(PREF_OCR_LOCAL47, it) }
        Toggle("Dokumentskanner", "Googles skanner på telefonen retter opp perspektivet og beskjærer kvitteringen før den sendes", vm.flag(PREF_DOCSCAN48, false)) { vm.setPref(PREF_DOCSCAN48, it) }
    }
    val st = vm.boot?.settings
    Section("AI-motor (på serveren)") {
        Group {
            // Prompt 52 (AND52A): kvitteringer leses bare lokalt – Gemini er fjernet fra kjeden, også som reserve.
            if (!vm.canEditServer) Info("Kvitteringer", engineName(st)) else {
                // Eneste valg: lokal kjede. Et gammelt «gemini»/«ollama + reserve» lagres som ollama uten reserve ved trykk (serveren migrerer også).
                Choice("Glimt leser lokalt", "Telefon → Mac Vision → Tesseract → lokal modell → kø. Bildet forlater aldri huset.", true) {
                    if (st?.provider != "ollama" || st.fallback) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
                }
            }
        }
        if (!vm.canEditServer) Note(SERVER_LOCKED)
    }
}

/** Innstillinger → App → Haptikk: hovedbryter, styrke, brytere per type og test. */
@Composable
internal fun HapticsPage(vm: AppViewModel) = Pages {
    val on = vm.flag(Haptics.ON, true)
    Group { Toggle("Haptisk tilbakemelding", "Vibrasjon ved trykk, fullførte handlinger og varsler", on) { vm.setPref(Haptics.ON, it) } }
    if (on) {
        Section("Styrke") {
            Group {
                val st = vm.option(Haptics.STRENGTH, "medium")
                listOf("light" to "Lett", "medium" to "Middels", "heavy" to "Kraftig").forEach { (k, l) ->
                    Choice(l, on = st == k) { vm.setPref(Haptics.STRENGTH, k); Haptics.tap() }
                }
            }
        }
        Section("Gi tilbakemelding ved …") {
            Group {
                Toggle("Trykk på knapper og faner", null, vm.flag(Haptics.TAP, true)) { vm.setPref(Haptics.TAP, it) }
                Toggle("Fullført handling", "Lagret, bokført, synket", vm.flag(Haptics.DONE, true)) { vm.setPref(Haptics.DONE, it) }
                Toggle("Feil og advarsler", null, vm.flag(Haptics.ERROR, true)) { vm.setPref(Haptics.ERROR, it) }
                Toggle("Pakke-varsler", "Klar for henting, levert", vm.flag(Haptics.PKG, true)) { vm.setPref(Haptics.PKG, it) }
            }
        }
        FilledTonalButton(onClick = { Haptics.test() }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Test haptikk") }
    }
    Note("Følger «Vibrasjon og haptikk» i Android-innstillingene. Er berøringsvibrasjon av der, vibrerer ikke appen heller.")
}

@Composable
internal fun DataPage(vm: AppViewModel) = Pages {
    Group {
        Row(Modifier.fillMaxWidth().clickable { vm.clearCache() }.padding(16.dp, 14.dp)) { Text("Tøm hurtigbuffer", Modifier.weight(1f)); Text("Logoer og bilder", color = C.text2, fontSize = 13.sp) }
        Row(Modifier.fillMaxWidth().clickable { vm.refresh() }.padding(16.dp, 14.dp)) { Text("Synk nå", Modifier.weight(1f)); Text(time(vm.lastSync), color = C.text2, fontSize = 13.sp) }
        Row(Modifier.fillMaxWidth().clickable { vm.exportCsv() }.padding(16.dp, 14.dp)) { Text("Eksporter som CSV", Modifier.weight(1f)); Icon(Icons.Filled.IosShare, null, tint = C.text2) }
    }
    Note("Full backup og Excel-database lages i FinansHub på PC under Innstillinger → Backup og data.")
}

@Composable
internal fun AboutPage(vm: AppViewModel) = Pages {
    val ctx = LocalContext.current
    val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "–" }
    Group {
        Info("Appversjon", "Homelab $version")
        Info("Serverversjon", vm.me?.version ?: "–")
        Info("Plattform", "Android ${android.os.Build.VERSION.RELEASE}")
    }
    Section("Personvern") {
        Note("Appen snakker bare med din egen homelab-server. Tokenet lagres kryptert i Android Keystore, og passordet lagres ikke. Ingen data sendes til tredjeparter fra appen.")
    }
    Section("Lisenser") {
        Note("Jetpack Compose, Material 3, AndroidX Biometric og Security Crypto (Apache 2.0).")
        // Prompt 56 (AND56): modellene på serveren og Mac mini-en (docs/lisenser-tredjepart.md).
        Note("Inneholder modeller fra Desert Ant Labs (license.desertant.com): Eye, Redact, Gist, Tongue, Emo, Moderator, Clear og Voz. Desert Ant Labs Source-Available License 1.0. Copyright © 2026 Desert Ant Labs B.V.")
        Note("Fermion Research: Phonon (tale til tekst) © Fermion Research, CC-BY-4.0. Neutrino-1 © Fermion Research, Apache-2.0 (Qwen3 © Alibaba Cloud, Apache-2.0).")
        Note("NB-Whisper fra Nasjonalbiblioteket (Apache-2.0): tale til tekst på norsk og engelsk. Finjustert fra OpenAI Whisper (MIT).")
    }
}

/* ---------------- Finans ---------------- */

@Composable
internal fun AiPage(vm: AppViewModel) = Pages {
    val st = vm.boot?.settings
    Group {
        if (!vm.canEditServer) Info("Kvitteringer", engineName(st)) else {
            // Eneste valg: lokal kjede. Et gammelt «gemini»/«ollama + reserve» lagres som ollama uten reserve ved trykk (serveren migrerer også).
            Choice("Glimt leser lokalt", "Telefon → Mac Vision → Tesseract → lokal modell → kø. Bildet forlater aldri huset.", true) {
                if (st?.provider != "ollama" || st.fallback) { vm.saveSetting("provider", "ollama"); vm.saveSetting("fallback", false) }
            }
        }
    }
    if (!vm.canEditServer) Note("AI-motor, modeller og minimum sikkerhet: $SERVER_LOCKED")
    Group {
        Info("Minimum sikkerhet", "${st?.minConf ?: 85} %")
        Toggle("Kategoriser automatisk", "Regler først, deretter AI", st?.autoCat == true) { vm.saveSetting("autoCat", it) }
    }
    Note(if (vm.canEditServer) "Glimt leser kvitteringer lokalt (telefon, Mac Vision, Tesseract og lokal modell). Kvitteringsbilder sendes aldri til skytjenester. Modeller settes i FinansHub på PC."
        else "Glimt leser kvitteringer lokalt. Modellene er felles for serveren. $SERVER_LOCKED")
}

/** ISO2: serveroppsettet (AI-motorer, modeller, tidsgrenser, SMB) kan bare endres når canEditServer er true. */
internal const val SERVER_LOCKED = "Settes opp av administrator."

internal fun engineName(st: no.kristo.finanshub.Settings?): String = when {
    st == null -> "–"
    // Prompt 52: Gemini leser ikke kvitteringer lenger – gamle verdier (gemini, ollama + reserve) vises som lokal AI.
    st.provider == "gemini" || st.provider == "ollama" -> "Lokal AI"
    else -> st.provider.replaceFirstChar { it.uppercase() }
}

@Composable
internal fun CategoriesPage(vm: AppViewModel) = Pages {
    val cats = vm.boot?.categories.orEmpty()
    if (cats.isEmpty()) Note("Ingen kategorier.") else Group {
        cats.forEach { c ->
            Row(Modifier.fillMaxWidth().padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(14.dp).clip(CircleShape).background(androidx.compose.ui.graphics.Color(c.color)))
                Text(c.name, Modifier.weight(1f))
                Text(when (c.kind) { "income" -> "Inntekt"; "transfer" -> "Overføring"; else -> "Utgift" }, color = C.text2, fontSize = 13.sp)
            }
        }
    }
    Note("Nye kategorier, farger og budsjett settes i FinansHub på PC.")
}

@Composable
internal fun RulesPage(vm: AppViewModel) = Pages {
    val rules = vm.boot?.rules.orEmpty()
    if (rules.isEmpty()) Note("Ingen regler ennå. Regler lages når du retter en kategori, eller i FinansHub på PC.") else Group {
        rules.forEach { r -> Info(r.pattern, r.category ?: "–") }
    }
    Note("* kan brukes som jokertegn og treffer starten på et hvilket som helst ord.")
}

@Composable
internal fun StocksPrefsPage(vm: AppViewModel) = Pages {
    LaunchedEffect(Unit) { if (vm.stocks == null) vm.syncStocks() }
    val s = vm.stocks
    Group {
        Info("Status", if (s == null) "–" else if (s.configured) "Koblet til" else if (s.mock) "Eksempeldata" else "Ikke koblet til")
        Info("Miljø", when (s?.env) { "demo" -> "Demo"; null -> "–"; else -> "Live" })
        s?.status?.let { Info("Siste synk", it) }
    }
    Button(onClick = { vm.open(Screen.Stocks) }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) { Text("Åpne Aksjer", fontWeight = FontWeight.Bold) }
    Note("Lag nøkkelen hos Trading 212 under Innstillinger → API (Beta), med bare lesetilgang. Legg din egen nøkkel og secret inn under Innstillinger → Integrasjoner → Trading 212. De lagres kryptert på serveren.")
}

@Composable
internal fun BackupPage(vm: AppViewModel) = Pages {
    val uri = LocalUriHandler.current
    // ISO2: backup av hele databasen og SMB er bare for hovedadministrator (canSmb). Eldre server uten flagget: admin-rollen.
    val canSmb = vm.me?.isMainAdmin == true || (vm.boot?.canEditServer == null && vm.userIsAdmin)
    Group {
        Row(Modifier.fillMaxWidth().clickable { vm.exportCsv() }.padding(16.dp, 14.dp)) { Text("Eksporter transaksjoner som CSV", Modifier.weight(1f)); Icon(Icons.Filled.IosShare, null, tint = C.text2) }
        Row(Modifier.fillMaxWidth().clickable { runCatching { uri.openUri(vm.base.trimEnd('/') + "/finans/?desktop=1#/inn") } }.padding(16.dp, 14.dp)) {
            Text(if (canSmb) "Full backup, Excel og SMB-share" else "Eksporter og gjenopprett dine data", Modifier.weight(1f)); Icon(Icons.Filled.OpenInBrowser, null, tint = C.text2)
        }
    }
    Note(if (canSmb) "Full backup (.json), Excel-databasen og backup til SMB-share settes opp i FinansHub på PC under Innstillinger → Backup og data."
        else "Du kan eksportere og gjenopprette dine egne data i FinansHub på PC under Innstillinger → Backup og data. Backup av hele databasen og SMB-share: $SERVER_LOCKED")
}

private val ON_TIMEOUT = listOf("next" to "Prøv neste motor", "ocr" to "Bruk lokal OCR", "queue" to "Legg i kø og prøv senere")

private fun nextStep(v: Int): Int = AI_TO_STEPS.getOrNull(AI_TO_STEPS.indexOf(v) + 1) ?: AI_TO_STEPS.firstOrNull { it > v } ?: AI_TO_STEPS.first()

/** «TIDSGRENSER»: trykk på en motor blar gjennom 5 · 10 · 15 · 20 · 30 · 45 · 60 · 90 · 120 s. */
@Composable
internal fun AiTimeouts23(vm: AppViewModel) {
    LaunchedEffect(Unit) { vm.loadAiTimeouts23() }
    val t = vm.m23.aiTo ?: AiTimeouts23()
    // ISO2: tidsgrensene er serveroppsett. Uten canEditServer vises de skrivebeskyttet.
    val lock = !vm.canEditServer
    val tap = if (lock) "skrivebeskyttet" else "trykk for å endre"
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Tidsgrenser", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            var i = 0
            listOf(Triple("gemini", "Gemini", "Logo og chat (aldri kvitteringer)"), Triple("groq", "Groq", "AI-søk og kategorier"), Triple("roboflow", "Roboflow", "Strekkoder"),
                Triple("ollama", "Ollama (lokal)", "Reserve på hjemmeserveren")).forEach { (k, n, sd) ->
                val v = when (k) { "gemini" -> t.gemini; "groq" -> t.groq; "roboflow" -> t.roboflow; else -> t.ollama }
                SetRow(vm, i, Icons.Filled.AutoAwesome, n, "$sd · $tap", "$v s", top = i > 0) {
                    if (lock) return@SetRow
                    val nv = nextStep(v)
                    vm.saveAiTimeouts23(when (k) { "gemini" -> t.copy(gemini = nv); "groq" -> t.copy(groq = nv); "roboflow" -> t.copy(roboflow = nv); else -> t.copy(ollama = nv) })
                }
                i++
            }
            SetRow(vm, i++, Icons.Filled.Replay, "Nye forsøk", "Før den gir opp en motor",
                when (t.retries) { 0 -> "Ingen"; 1 -> "1 gang"; else -> "${t.retries} ganger" }, top = true) { if (!lock) vm.saveAiTimeouts23(t.copy(retries = (t.retries + 1) % 4)) }
            SetRow(vm, i, Icons.Filled.NotificationsActive, "Ved tidsavbrudd", "Hva som skjer når grensen er nådd",
                (ON_TIMEOUT.firstOrNull { it.first == t.onTimeout } ?: ON_TIMEOUT[0]).second, top = true) {
                if (lock) return@SetRow
                val j = ON_TIMEOUT.indexOfFirst { it.first == t.onTimeout }
                vm.saveAiTimeouts23(t.copy(onTimeout = ON_TIMEOUT[(j + 1) % ON_TIMEOUT.size].first))
            }
        }
        if (lock) Text("Tidsgrenser for AI: $SERVER_LOCKED", color = PaperPal.current.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Text("Nye forsøk venter 1 s, 2 s og 4 s. Køen viser hvilken motor som svarte for sent, f.eks. «✦ Gemini svarte ikke innen ${t.gemini} s · prøver Groq …».",
            color = PaperPal.current.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/** Innstillinger → App → Integrasjoner: Home Assistant (tilkobling) og «SYNK MED HOME ASSISTANT» (samme lagring som Huskeliste). */
@Composable
internal fun IntegrationsPage23(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) {
        vm.loadTasksHa()
        if (vm.tasks == null) vm.loadTasks()
    }
    val ha = vm.tasksHa
    val lists = vm.tasks?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Home Assistant", modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        PCard {
            val conn = ha?.connText() ?: if (vm.userIsAdmin) "Henter …" else "Administrator"
            SetRow(vm, 0, Icons.Filled.Home, "Tilkobling", ha?.error?.takeIf { ha.entities.isEmpty() } ?: "Adresse og token fra Homelab-serveren · ${ha?.entities?.size ?: 0} To-do-lister", conn) { vm.loadTasksHa() }
        }
        if (!vm.userIsAdmin) Text("Settes opp av administrator.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        if (vm.userIsAdmin && ha != null) TasksHaSection(vm, lists, pad = 0.dp)
    }
}

/* ---------------- Indeksen ---------------- */

private fun setIndex24(vm: AppViewModel): List<SetItem24> = buildList {
    // Prompt 39: profilene ligger på undersiden «Appprofil» (APP-gruppen).
    // Prompt 67: stiene følger den nye menyen (Generelt · Husstand · Glimt og AI · Tilkoblinger · Moduler · Server).
    add(SetItem24("glimt67", "Glimt", "Glimt og AI", "Figur, brief, stemme, Send til Chat etter, Glimt husker og Glimt lærer", "glimt67", "glimt personlighet stemme figur brief send til chat søkefelt"))
    add(SetItem24("g67mem", "Glimt husker", "Glimt og AI → Glimt", "Det du har lært Glimt, forslag, motstrid og ikke brukt på lenge", "g67mem", "glimt husker minne alias forslag motstrid ubrukte fakta nattlig oppsummering"))
    add(SetItem24("g67ent", "Entitetsregister", "Glimt og AI → Glimt", "Personer, steder, butikker og abonnementer med aliaser", "g67ent", "entitetsregister entiteter alias personer steder hytta jobben"))
    add(SetItem24("g67rec", "Glimt lærer", "Glimt og AI → Glimt", "Oppskrifter fra vellykkede kjøringer og rettelser", "g67rec", "glimt lærer oppskrifter skills hurtigvei rettelser tommel"))
    add(SetItem24("g67sch", "Faste oppgaver", "Glimt og AI → Glimt", "Planlagte oppgaver og varsler · Lag fra tekst · Kjør nå", "g67sch", "faste oppgaver planlagte påminnelse strømpris brief lag fra tekst"))
    add(SetItem24("g67q", "Kvalitet", "Glimt og AI → Glimt", if (vm.userIsAdmin) "Ukerapport og nattlige eval-kjøringer" else "Ukerapporten din", "g67q", "kvalitet ukerapport eval regresjon nattlig eval kjøringer per case tidsgrense lagre rapporter"))
    add(SetItem24("app67", "App", "Generelt", "Appprofil, widgets, skanning, server, data og oppdatering", "app67", "app widgets oppdater appen"))
    add(SetItem24("fin67", "Finans", "Moduler", "Kategorier, regler, bankimport, aksjer, fanelinje og abonnementer", "fin67", "finans økonomi"))
    add(SetItem24("profil", "Appprofil", "Generelt → App", "Standard, Finans + Boliger eller Boliger-profil", "profil", "profil boliger oppsett"))
    vm.b24.profiles.forEach { add(SetItem24("profile:${it.key}", it.name, "App → Appprofil", it.sub, null, "profil oppsett")) }
    add(SetItem24("accounts", "Konto", "Generelt", "Profil, kontoer, økter og logg ut", "accounts", "bruker brukere kontoer"))
    add(SetItem24("security", "Sikkerhet", "Generelt", "Totrinnsbekreftelse, passord, fingeravtrykk og aktive økter", "security", "2fa passord face logg"))
    if (vm.userIsAdmin) add(SetItem24("sysbackup", "Backup", "Server", "Backup av hele systemet: automatisk, hva som tas med, sky og gjenoppretting", "sysbackup", "backup sikkerhetskopi gjenopprett restore"))
    add(SetItem24("tokens", "API-tokens", "Generelt", "Snarveier og integrasjoner", "tokens", "token nøkkel"))
    // Prompt 44: Logger (Docker), Gjøremål-synk, Logg inn som / Overfør eier, Tidligere versjoner.
    if (vm.userIsAdmin) add(SetItem24("logger44", "Logger", "Server", "Docker-logger, feil og feilsøking", null, "logg logger docker feil feilsøking container"))
    add(SetItem24("huske", "Gjøremål", "Tilkoblinger → Kalender og gjøremål", "Synk med Home Assistant", "kal", "gjøremål synk home assistant todo"))
    add(SetItem24("nyheter", "Nyheter", "Moduler", "Kilder, kategorier, For deg og Glimt-sammendrag", "nyheter", "nyheter rss kilder kategori for deg sammendrag favicon")) // prompt 46
    // Prompt 68: brukerne og Logg inn som ligger under Husstand → Brukere og familie (ui/Users68Ui.kt).
    if (vm.userIsAdmin) add(SetItem24("as44", "Logg inn som", "Husstand → Brukere og familie", "Rediger oppsettet til et familiemedlem · overfør eierskap", USERS68, "logg inn som impersonering eier overfør familie oppsett brukere"))
    if (vm.userIsAdmin) add(SetItem24("char52", "Glimt-figur per bruker", "Husstand → Brukere og familie", "Standardfiguren hver bruker starter med", USERS68, "brief figur glimt-figur standard per bruker blekksprut"))
    if (vm.userIsAdmin) add(SetItem24("rollback44", "Tidligere versjoner", "System", "Rull tilbake til en tidligere versjon", null, "rull tilbake rollback versjon nedgrader"))
    add(SetItem24("ai", "AI", "Glimt og AI", "AI og modeller · kvitteringer · chat · tale · tidsgrenser", "ai", "gemini groq ollama roboflow ocr tolkning modeller"))
    add(SetItem24("cats", "Kategorier og budsjett", "Moduler → Finans", "Farger og typer", "cats", "budsjett kategori"))
    add(SetItem24("rules", "Regler", "Moduler → Finans", "Automatisk kategorisering", "rules", "regel"))
    add(SetItem24("import", "Bankimport", "Moduler → Finans", "DNB · CSV · ✦ AI", null, "bank csv excel"))
    add(SetItem24("stocks", "Aksjer · Trading 212", "Moduler → Finans", "Nøkkel, miljø og synk", "stocks", "aksje trading"))
    add(SetItem24("fin", "Fanelinje og Mer i Finans", "Moduler → Finans", "Fanene i Finans", "fin", "fane faner"))
    add(SetItem24("sub", "Subscription OS", "Moduler → Finans", "Abonnementer og AI-sparing", null, "abonnement"))
    add(SetItem24("appname", "Navn på appen", vm.appName, vm.appName, null, "navn"))
    add(SetItem24("appicon", "App-ikon", vm.appName, "Bytt ikon på appen", null, "ikon logo"))
    add(SetItem24("navstyle", "Fanelinje-stil", vm.appName, "Tekst, bare ikoner eller ikoner + navn på valgt", null, "fane faner ikon ikoner stil navbar"))
    add(SetItem24("tabedit", "Fanelinje i Hjem", vm.appName, "Fjern, flytt, gi nytt navn og ikon", null, "fane faner"))
    add(SetItem24("modules", "Moduler", "Moduler", "Familie, Gjøremål, Avganger, Vær", "modules", "widget modul"))
    add(SetItem24("news", "Nyhetsleser", "Moduler → Moduler", "Kilder og AI", null, "nyheter rss"))
    add(SetItem24("look", "Utseende", "Generelt", "Navn, ikon, tema, farger, bakgrunn og fanelinje", "tilpass", "tema mørk lys farge farger ikon navn fanelinje bakgrunn tilpass utseende"))
    add(SetItem24("notify", "Varsler", "Generelt", "Lyd, stille timer, vibrasjon og test", "notify", "varsel lyd vibr push"))
    add(SetItem24("kal", "Kalender og gjøremål", "Tilkoblinger", "Google Kalender, Home Assistant, Skole-iCal og Canvas", "kal", "kalender google ha skole canvas ical timeplan bursdag"))
    add(SetItem24("integ", "Integrasjoner", "Tilkoblinger", if (vm.userIsAdmin) "Dine og serverens: Plex, Bring, IMAP, Home Assistant og flere" else "Dine egne: kalender, Plex, Trading 212, Bring, IMAP og flere", "integ", "integrasjon"))
    add(SetItem24(USERS68, "Brukere og familie", "Husstand", users68Sub(vm.userIsAdmin), USERS68, "brukere bruker familie husstand barn roller logg inn som helse posisjon"))
    add(SetItem24("healthpos", "Helse og posisjon", "Husstand → Brukere og familie", "Health Connect, skritt, puls, søvn og posisjonsdeling", USERS68, "helse posisjon skritt kart"))
    add(SetItem24("scan", "Skanning", "Generelt → App", "Kamera, beskjæring og opplasting", "scan", "kamera skann"))
    add(SetItem24("server", "Server og synk", "Generelt → App", "Lokal og ekstern adresse", "server", "server adresse"))
    add(SetItem24("backup", "Backup og data", "Generelt → App", "Nedlasting og lagring", "backup", "backup eksport"))
    // Prompt 32: «oppdatering», «versjon» og «update» treffer Nordlys OS (Oppdatering-raden er fjernet).
    add(SetItem24("nordlys", "Nordlys OS", "Server → System", "Oppdatering, versjon og hva er nytt", null, "oppdatering oppdater versjon update system programvare"))
    // Prompt 34: mål-id-er for konkrete kontroller (Oppdater nå, Tema, Haptikk …): treffet går til siden og markerer kontrollen.
    ANCHORS34.filter { vm.userIsAdmin || !it.admin }.forEach { a -> add(SetItem24(a.id, a.title, a.path, "Markeres på siden", null, a.words)) }
    (vm.b24.integ ?: INTEG24_FALLBACK).filter { vm.userIsAdmin || it.personal }.forEach { i ->
        add(SetItem24("integ:${i.id}", i.name, "Integrasjoner", i.fields.joinToString(", ") { it.label }, "integ", i.id))
    }
}

/** Synonymer for ✦ AI uten serverens AI (ord → innstillinger), som i designet. */
private val SYN24: Map<String, List<String>> = mapOf(
    "ikon" to listOf("appicon"), "logo" to listOf("appicon"), "navn" to listOf("appname"), "mørk" to listOf("look"), "lys" to listOf("look"), "tema" to listOf("look"),
    "farge" to listOf("look"), "passord" to listOf("security"), "logg" to listOf("security"), "face" to listOf("security"), "finger" to listOf("security"),
    "varsel" to listOf("notify"), "lyd" to listOf("notify"), "vibr" to listOf("notify"), "token" to listOf("tokens"), "nøkkel" to listOf("tokens", "integ:ai"),
    "pakk" to listOf("integ:mybring", "integ:postnord", "integ:parcelsapp"), "post" to listOf("integ:mybring", "integ:postnord"), "bring" to listOf("integ:mybring"),
    "spor" to listOf("integ:mybring", "integ:parcelsapp"), "buss" to listOf("integ:entur"), "trikk" to listOf("integ:entur"), "ruter" to listOf("integ:entur"),
    "avgang" to listOf("integ:entur"), "kalend" to listOf("kal", "integ:google"), "bursdag" to listOf("kal", "integ:google"), "google" to listOf("kal", "integ:google"), "canvas" to listOf("kal"), "skole" to listOf("kal"),
    "gemini" to listOf("ai", "integ:ai"), "ai" to listOf("ai", "integ:ai"), "aksje" to listOf("stocks", "integ:t212"), "bank" to listOf("import", "integ:bank"),
    "budsjett" to listOf("cats"), "kategori" to listOf("cats"), "regel" to listOf("rules"), "home" to listOf("integ:ha"), "ha" to listOf("integ:ha"),
    "domene" to listOf("integ:cloudflare"), "cloudflare" to listOf("integ:cloudflare"), "vær" to listOf("integ:met"), "yr" to listOf("integ:met"),
    "kart" to listOf("integ:map", "healthpos"), "posisjon" to listOf("healthpos"), "helse" to listOf("healthpos"), "skritt" to listOf("healthpos"),
    "famil" to listOf(USERS68), "husstand" to listOf(USERS68), "barn" to listOf(USERS68), "impersoner" to listOf("as44"),
    "kvitter" to listOf("integ:imap"), "epost" to listOf("integ:imap"), "e-post" to listOf("integ:imap"), "mail" to listOf("integ:imap"), "finn" to listOf("integ:finn"),
    "profil" to listOf("profile:standard", "profile:finans_boliger", "profile:boliger"), "bolig" to listOf("profile:finans_boliger", "profile:boliger"),
    "fane" to listOf("tabedit", "fin"), "widget" to listOf("modules"), "modul" to listOf("modules"), "bruker" to listOf(USERS68, "accounts"),
    "bilde" to listOf("integ:photos", "look"), "oppdat" to listOf("upd", "nordlys"), "versjon" to listOf("chk", "nordlys"), "update" to listOf("upd", "nordlys"),
    "haptikk" to listOf("haptic"), "vibrer" to listOf("haptic"), "stille" to listOf("quiet"), "2fa" to listOf("2fa"), "totrinn" to listOf("2fa"),
    "modell" to listOf("ai-mod"), "ollama" to listOf("ai-mod"), "backup" to listOf("bk-now", "bk-auto"), "bakgrunn" to listOf("bg"), "unsplash" to listOf("integ:photos"), "pexels" to listOf("integ:photos"),
)

private val STOP24 = Regex("^(hvor|hvordan|kan|jeg|du|meg|min|mitt|mine|en|et|den|det|på|i|til|for|å|og|er|med|endre|bytte|bytter|skru|slå|av|finner|finne|legge|sette|hva|vil)$")

private fun score24(items: List<SetItem24>, q0: String, ai: Boolean): List<SetItem24> {
    val q = q0.trim().lowercase()
    if (q.isEmpty()) return emptyList()
    val words = q.split(Regex("[^a-zæøå0-9-]+")).filter { it.length > 1 && !STOP24.matches(it) }
    return items.map { a ->
        val txt = "${a.path} ${a.title} ${a.sub} ${a.extra}".lowercase()
        var x = 0
        if (txt.contains(q)) x += 10
        words.forEach { w -> if (txt.contains(w)) x += 3 else if (w.length >= 6 && txt.contains(w.dropLast(2))) x += 2 } // prompt 34: bøyning («oppdaterer»)
        if (words.any { w -> a.title.lowercase().contains(w) || (w.length >= 6 && a.title.lowercase().contains(w.dropLast(2))) }) x += 1
        if (ai) words.forEach { w -> SYN24.forEach { (k, l) -> if (w.startsWith(k) || (k.startsWith(w) && w.length > 2)) if (a.id in l) x += 6 } }
        a to x
    }.filter { it.second > 0 }.sortedByDescending { it.second }.take(if (ai) 6 else 12).map { it.first }
}

private fun localAnswer24(items: List<SetItem24>, q: String): Pair<String?, List<String>> {
    val hits = score24(items, q, true)
    val h = hits.firstOrNull() ?: return "Fant ingen innstilling som passer. Prøv med andre ord, f.eks. «bytte ikon» eller «Bring-nøkkel»." to emptyList()
    // Prompt 34: mål med egen kontroll: «Gå til System og trykk «Oppdater nå» … Jeg tar deg dit og viser knappen …».
    if (ANCHORS34.any { it.id == h.id }) return (if (h.id == "upd") "Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter. Jeg tar deg dit og viser knappen …"
        else "Gå til ${h.path} → «${h.title}». Jeg tar deg dit og viser deg hvor den er …") to hits.map { it.id }
    return "Du finner «${h.title}» under Innstillinger → ${h.path}. Trykk på raden for å åpne." to hits.map { it.id }
}

private fun iconFor24(id: String): ImageVector = when {
    id.startsWith("profile:") -> Icons.Filled.People
    id.startsWith("integ:") -> Icons.Filled.Extension
    else -> when (id) {
        "accounts" -> Icons.Filled.People; "security" -> Icons.Filled.Lock; "tokens" -> Icons.Filled.Key; "ai" -> Icons.Filled.AutoAwesome
        "cats" -> Icons.Filled.Category; "rules" -> Icons.Filled.Tune; "import" -> Icons.Filled.AccountBalance; "stocks" -> Icons.AutoMirrored.Filled.ShowChart
        "fin", "tabedit" -> Icons.Filled.ViewWeek; "sub" -> Icons.Filled.Autorenew; "appname" -> Icons.Filled.Edit; "appicon" -> Icons.Filled.Image
        "modules" -> Icons.Filled.Dashboard; "news" -> Icons.Filled.Newspaper; "look" -> Icons.Filled.Palette; "notify" -> Icons.Filled.Notifications
        "integ" -> Icons.Filled.Home; "healthpos" -> Icons.Filled.MonitorHeart; USERS68, "as44" -> Icons.Filled.Groups; "char52" -> Icons.Filled.AutoAwesome; "scan" -> Icons.Filled.DocumentScanner; "server" -> Icons.Filled.Dns
        "backup", "sysbackup" -> Icons.Filled.Backup
        "glimt67", "g67rec" -> Icons.Filled.AutoAwesome; "g67mem" -> Icons.Filled.Psychology; "g67ent" -> Icons.Filled.People; "g67sch" -> Icons.Filled.Schedule
        "g67q" -> Icons.Filled.Insights; "app67" -> Icons.Filled.PhoneAndroid; "fin67" -> Icons.Filled.AccountBalance; else -> Icons.Filled.Settings
    }
}

/**
 * Prompt 25: «Ta meg dit →» og trykk på et søketreff. Åpner riktig underside, scroller til raden og fremhever den i ca. 3 s
 * (dyplenke settings/<side>#<rad-id>). Rader på hovedsiden (profiler, navn, ikon, fanelinje …) fremheves der de står.
 */
private fun open24(vm: AppViewModel, it: SetItem24) {
    vm.b24.sq = ""; vm.b24.aiAnswer = null; vm.b24.aiIds = null
    // Plassen til gruppekortet på hovedsiden: søk 0, profilkort 1, PROFIL 2–3, KONTO 4–5, FINANS 6–7, appnavn 8–9, APP 10–11.
    fun main(key: String, index: Int) { vm.settingsPage = null; vm.highlight25(key, index) }
    // Prompt 34: mål med egen kontroll (Oppdater nå, Tema, Haptikk …) åpnes og markeres med rød ring.
    if (ANCHORS34.any { a -> a.id == it.id } && vm.goAnchor34(it.id)) return
    when {
        it.id.startsWith("profile:") -> { vm.settingsPage = "profil"; vm.highlight25(it.id, 1) } // prompt 39: egen underside
        // Prompt 26: hver integrasjon har egen side (Kalendere for skole, Google og HA).
        it.id.startsWith("integ:") -> vm.openInteg26(it.id.removePrefix("integ:"))
        it.id == "kal" -> vm.openKalSettings26(null)
        it.id == "nordlys" -> vm.openNordlys31()
        it.id == "logger44" -> vm.openLogs44() // prompt 44
        it.id == "rollback44" -> vm.openNordlys31() // prompt 44: TIDLIGERE VERSJONER ligger på System-siden
        // Prompt 39: PROFIL er borte fra hovedsiden (to plasser færre), og navn/ikon/fanelinje ligger i Tilpass.
        // Prompt 67: Bankimport og Subscription OS står på siden Moduler → Finans.
        it.id == "import" -> { vm.settingsPage = "fin67"; vm.highlight25(rowKey25("Bankimport"), 0) }
        it.id == "sub" -> { vm.settingsPage = "fin67"; vm.highlight25(rowKey25("Subscription OS"), 0) }
        it.id == "appname" || it.id == "appicon" || it.id == "navstyle" || it.id == "tabedit" -> {
            vm.settingsPage = "tilpass"
            vm.highlight25(rowKey25(when (it.id) { "appname" -> "Navn på appen"; "appicon" -> "App-ikon"; "navstyle" -> "Fanelinje-stil"; else -> "Fanelinje i Hjem" }), 1)
        }
        it.id == "news" -> { vm.settingsPage = "modules"; vm.highlight25(rowKey25("Nyhetsleser"), 0) }
        it.page != null -> { vm.settingsPage = it.page; vm.highlight25("page:${it.page}", 0) }
    }
}

/* ---------------- Søk øverst ---------------- */

/**
 * Søkefeltet og ✦ AI øverst i Innstillinger. Med tekst i feltet vises bare treffene (true = resten av siden skal ikke vises).
 */
internal fun LazyListScope.settingsSearch24(vm: AppViewModel): Boolean {
    val s = vm.b24
    item { SearchBar24(vm) }
    if (s.sq.isBlank()) return false
    item { SearchResults24(vm) }
    return true
}

@Composable
private fun SearchBar24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    val items = setIndex24(vm)
    LaunchedEffect(Unit) { if (s.integ == null) vm.b24LoadIntegrations() }
    // ✦ AI: spørsmålet sendes når man slutter å skrive (eller trykker Søk).
    LaunchedEffect(s.sq, s.sqAi) {
        s.aiAnswer = null; s.aiIds = null
        if (!s.sqAi || s.sq.isBlank()) return@LaunchedEffect
        delay(700)
        vm.b24AiSearch(s.sq.trim(), items) { q -> localAnswer24(items, q) }
    }
    Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.weight(1f).height(46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                .clip(CircleShape).background(p.card).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Prompt 27: ✕ til venstre (høyre-× er fjernet), fokus beholdes.
            SearchLead27(s.sq.isNotEmpty(), p.ink, p.mut, idle = { Icon(Icons.Filled.Search, null, tint = p.mut, modifier = Modifier.size(18.dp)) }) { s.sq = ""; s.aiAnswer = null; s.aiIds = null }
            BasicTextField(
                s.sq, { s.sq = it }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.ink),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    if (s.sqAi && s.sq.isNotBlank()) vm.b24AiSearch(s.sq.trim(), items) { q -> localAnswer24(items, q) }
                    // Prompt 34: vanlig søk + Enter går rett til beste treff med markering.
                    else if (s.sq.isNotBlank()) score24(items, s.sq, false).firstOrNull()?.let { open24(vm, it) }
                }),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (s.sq.isEmpty()) Text(if (s.sqAi) "Spør, f.eks. «hvor bytter jeg ikon?»" else "Søk i innstillinger", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        inner()
                    }
                },
            )
        }
        Box(
            Modifier.height(46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f)).clip(CircleShape)
                .background(if (s.sqAi) p.lab else p.card).clickable(role = Role.Switch, onClickLabel = "AI-søk") { s.sqAi = !s.sqAi }.padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text("✦ AI", color = if (s.sqAi) p.onLab else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) } // Prompt 28: onLab, ikke hvit på mørk-aksenten
    }
}

@Composable
private fun SearchResults24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    val items = setIndex24(vm)
    val ai = s.sqAi
    val hits = if (ai && s.aiIds != null) s.aiIds!!.mapNotNull { id -> items.firstOrNull { it.id == id } } else score24(items, s.sq, ai)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (ai) {
            val ans = s.aiAnswer ?: if (s.aiBusy) "Tenker …" else null
            ans?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("✦", color = p.lab, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(it, color = p.ink, fontSize = 13.5.sp, lineHeight = 19.6.sp)
                        // Prompt 25: «Ta meg dit →» åpner undersiden, scroller til innstillingen og fremhever den.
                        val first = hits.firstOrNull()
                        // Prompt 34: har svaret et mål (mål-id), går den dit automatisk etter 1,6 s og markerer kontrollen («Vis meg nå ›»).
                        val anchor = (vm.p34.aiAnchor ?: first?.id)?.takeIf { id -> ANCHORS34.any { it.id == id } }
                        if (anchor != null && s.aiAnswer != null && !s.aiBusy) ShowMeNow34(vm, anchor)
                        else if (first != null && s.aiAnswer != null && !s.aiBusy) Box(
                            Modifier.height(36.dp).clip(CircleShape).background(p.ink)
                                .clickable(role = Role.Button, onClickLabel = "Ta meg dit") { Haptics.select(); open24(vm, first) }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("Ta meg dit →", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                    }
                }
            }
        }
        if (hits.isNotEmpty()) {
            PLabel((if (ai) "✦ AI-forslag · " else "Treff · ") + hits.size, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            PCard {
                hits.forEachIndexed { i, it ->
                    SetRow(vm, i, iconFor24(it.id), it.title, it.path + if (it.sub.isNotBlank()) " · ${it.sub}" else "", "›", top = i > 0) { open24(vm, it) }
                }
            }
        } else if (!ai) Text("Ingen treff. Prøv ✦ AI, f.eks. «hvor legger jeg inn Bring-nøkkelen?»", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
    }
}

/* ---------------- PROFIL ---------------- */

internal fun LazyListScope.profileGroup24(vm: AppViewModel) {
    item { PLabel("Profil", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        val p = PaperPal.current
        PCard {
            vm.b24.profiles.forEachIndexed { i, pr ->
                val on = vm.b24.profile == pr.key
                Column {
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().hl25(vm, "profile:${pr.key}").clickable { if (!on) vm.b24PickProfile(pr.key) }.padding(14.dp, 11.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        IconTile(vm, i, Icons.Filled.People)
                        Column(Modifier.weight(1f)) {
                            Text(pr.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                            Text(pr.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Text(if (on) "✓ Valgt" else "Velg", color = if (on) p.pos else p.mut, fontSize = 13.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
                    }
                }
            }
            if (vm.b24.profile == "custom") Text("Egendefinert: du har endret fanene etter at profilen ble valgt.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(14.dp, 0.dp, 14.dp, 12.dp))
        }
    }
}

/* ---------------- Integrasjoner ---------------- */

@Composable
internal fun IntegEditor24(vm: AppViewModel, i: Integ24, f: IntegField24) {
    val p = PaperPal.current
    val s = vm.b24
    var v by remember(i.id, f.key) { mutableStateOf(if (f.type == "secret") "" else f.value ?: "") }
    val busy = s.integBusy == "${i.id}.${f.key}"
    Column(Modifier.fillMaxWidth().background(p.card).padding(14.dp, 4.dp, 14.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BasicTextField(
            v, { v = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.ink),
            visualTransformation = if (f.type == "secret") PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = when (f.type) { "secret" -> KeyboardType.Password; "url" -> KeyboardType.Uri; else -> KeyboardType.Text }, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (v.isNotBlank()) vm.b24SaveIntegField(i.id, f.key, v.trim()) }),
            decorationBox = { inner ->
                Box(
                    Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (v.isEmpty()) Text(if (f.type == "secret" && f.saved) "Ny verdi (lagret verdi vises ikke)" else f.label, color = p.mut, fontSize = 14.5.sp, fontFamily = PaperFonts.mono, maxLines = 1)
                    inner()
                }
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(role = Role.Button) { s.integEdit = null },
                contentAlignment = Alignment.Center,
            ) { Text("Avbryt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.ink).clickable(role = Role.Button) { if (v.isNotBlank() && !busy) vm.b24SaveIntegField(i.id, f.key, v.trim()) },
                contentAlignment = Alignment.Center,
            ) { Text(if (busy) "Lagrer …" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        }
        if (f.saved || !f.value.isNullOrBlank()) Box(
            Modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(18.dp)).clickable(role = Role.Button) { if (!busy) vm.b24ClearIntegField(i.id, f.key) },
            contentAlignment = Alignment.Center,
        ) { Text("Fjern verdi", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
    }
}

/** Rad som SetRow, men med farge på verdien (grønn «Tilkoblet», rød «Ikke satt») og valgfritt ikon. */
@Composable
internal fun IRow24(
    vm: AppViewModel, i: Int, icon: ImageVector?, title: String, sub: String?, value: String, valueColor: Color, top: Boolean,
    titleColor: Color = PaperPal.current.ink, onClick: (() -> Unit)?,
) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = if (icon != null) 60.dp else 14.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (icon != null) IconTile(vm, i, icon)
            Column(Modifier.weight(1f)) {
                Text(title, color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (value.isNotEmpty()) Text(value, color = valueColor, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 170.dp))
        }
    }
}

/** Tittelen i fotovinduet for en underside i Innstillinger. */
internal fun settingsTitle26(vm: AppViewModel): String {
    val pg = vm.settingsPage ?: return "Innstillinger"
    if (pg == "kal") return "Kalender og gjøremål" // prompt 67: som på web
    if (pg.startsWith("integ:")) {
        val id = pg.removePrefix("integ:")
        return (vm.b24.integ ?: INTEG24_FALLBACK).firstOrNull { it.id == id }?.name ?: "Integrasjon"
    }
    return PAPER_SET_TITLES[pg] ?: "Innstillinger"
}

/** Kort undertekst for Kalendere (Google og HA), som i designet. */
private fun kalSummary26(vm: AppViewModel): Pair<String, Boolean> {
    val g = vm.bd24.google.connected
    val h = vm.bd24.ha.entityId != null && vm.bd24.ha.syncedAt != null
    return if (g || h) listOfNotNull(if (g) "Google" else null, if (h) "HA" else null).joinToString(" + ") to true else "Ikke koblet" to false
}

/* ---------------- Merket (farget rute med kort tekst) ---------------- */

@Composable
internal fun IntegBadge26(text: String, color: Long, size: Int = 34) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * .3f).dp)).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (if (text.length > 2) size * .3f else size * .36f).sp, maxLines = 1, fontFamily = PaperFonts.mono)
    }
}

@Composable
private fun IntegRow26(vm: AppViewModel, id: String, badge: String, color: Long, title: String, sub: String?, value: String, valueColor: Color, top: Boolean, chev: Boolean = true, onClick: (() -> Unit)?) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 62.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IntegLogo32b(vm, id, badge, color) // prompt 32: ekte logo, bokstavmerket mens den lastes
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (value.isNotEmpty()) Text(value, color = valueColor, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
            if (chev) Text("›", color = p.mut, fontSize = 17.sp)
        }
    }
}

/* ---------------- Listen ---------------- */

@Composable
internal fun IntegList26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(Unit) { vm.b24LoadIntegrations(); vm.loadBirthdays24(quiet = true) }
    val all = (s.integ ?: emptyList()).filter { vm.userIsAdmin || it.personal }
    val cal = all.firstOrNull { it.id == "calendars" }
    // Én rad for Kalendere (Informasjon), uansett om serveren har «calendars» ennå.
    val rows = all.filter { it.id !in INTEG26_ON_KAL && !it.hidden }.map { it to integMeta26(it) } +
        listOfNotNull((cal ?: Integ24("calendars", "Kalendere", null, "missing", emptyList(), false, "personal")).let { it to integMeta26(it) })
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        s.integError?.let { Text(it, color = if (s.integLegacy) p.mut else p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) }
        if (s.integ == null) Text("Henter integrasjonene …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
        INTEG26_CATS.forEach { cat ->
            val list = rows.filter { it.second.category == cat }
            if (list.isEmpty()) return@forEach
            PLabel(cat, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            PCard {
                list.forEachIndexed { idx, (i, m) ->
                    val (st, ok) = if (i.id == "calendars" && cal?.statusText == null) kalSummary26(vm) else integStatus26(i)
                    Box(Modifier.hl25(vm, "integ:${i.id}")) {
                        IntegRow26(vm, i.id, m.badge, m.color, if (i.id == "calendars") "Kalendere" else i.name, m.description, st, if (ok) p.pos else p.lab, top = idx > 0) { vm.openInteg26(i.id) }
                    }
                }
            }
        }
        if (s.integ != null) Text(
            if (vm.userIsAdmin) "Dine integrasjoner og serverens felles oppsett. Hemmelige verdier lagres kryptert og vises aldri i appen."
            else "Bare du ser og bruker disse. Hemmelige verdier lagres kryptert og vises aldri i appen.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp),
        )
    }
}

/* ---------------- Én integrasjon ---------------- */

@Composable
internal fun IntegPage26(vm: AppViewModel, id: String) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(id) { if (s.integ == null) vm.b24LoadIntegrations() }
    val i = (s.integ ?: INTEG24_FALLBACK).firstOrNull { it.id == id }
    if (i == null) {
        Text(if (s.integ == null) "Henter …" else "Fant ikke integrasjonen.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(8.dp))
        return
    }
    val m = integMeta26(i)
    val (st, ok) = integStatus26(i)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PCard(shadow = true) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IntegLogo32b(vm, i.id, m.badge, m.color, 46)
                Column(Modifier.weight(1f)) {
                    PSerif(i.name, 22.sp, maxLines = 2)
                    Text(m.description, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(st, color = if (ok) p.pos else p.lab, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.widthIn(max = 120.dp))
            }
        }
        IntegFields26(vm, i, "Oppsett")
        // Egne sider for Trading 212, bank og AI (som designet), og synk av lister for Home Assistant.
        when (id) {
            "t212" -> LinkCard26("Aksjer · Trading 212", "Miljø, synk og visning") { vm.settingsPage = "stocks" }
            "bank" -> LinkCard26("Bankimport", "DNB · CSV · ✦ AI") { vm.openFromMer(Screen.Import) }
            "ai" -> LinkCard26("AI og tolkning", "Motorer, rekkefølge og tidsgrenser") { vm.settingsPage = "ai" }
            "ha" -> if (vm.userIsAdmin) IntegrationsPage23(vm)
        }
        GuideCard26(m.guide)
        IntegActions26(vm, i)
    }
}

/** OPPSETT: én rad per felt, og feltet redigeres rett under raden (hemmeligheter vises aldri). */
@Composable
internal fun IntegFields26(vm: AppViewModel, i: Integ24, title: String) {
    val p = PaperPal.current
    val s = vm.b24
    if (i.fields.isEmpty()) return
    PLabel(title, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        i.fields.forEachIndexed { idx, f ->
            val editing = s.integEdit == (i.id to f.key)
            val shown = when {
                f.type == "secret" && f.saved -> "•••• lagret"
                !f.value.isNullOrBlank() -> f.value
                f.saved -> "•••• lagret"
                else -> "Ikke satt"
            }
            IRow24(vm, -1, null, f.label, f.help, "$shown ›", if (f.saved || !f.value.isNullOrBlank()) p.ink else p.lab, top = idx > 0) {
                s.integEdit = if (editing) null else i.id to f.key
            }
            if (editing) IntegEditor24(vm, i, f)
        }
    }
}

/** SLIK GJØR DU: nummererte steg. */
@Composable
internal fun GuideCard26(guide: List<Pair<String, String>>) {
    val p = PaperPal.current
    if (guide.isEmpty()) return
    PLabel("Slik gjør du", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        guide.forEachIndexed { n, (t, d) ->
            Column {
                if (n > 0) Box(Modifier.fillMaxWidth().padding(start = 58.dp).height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.ink), contentAlignment = Alignment.Center) {
                        Text("${n + 1}", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp, fontFamily = PaperFonts.mono)
                    }
                    Column(Modifier.weight(1f)) {
                        if (t.isNotBlank()) Text(t, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                        // Prompt 43: teksten (med kodelinjer) kan merkes og kopieres.
                        if (d.isNotBlank()) androidx.compose.foundation.text.selection.SelectionContainer { Text(d, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp) }
                    }
                }
            }
        }
    }
}

/** Test tilkobling og Fjern alle verdier (trykk to ganger). */
@Composable
private fun IntegActions26(vm: AppViewModel, i: Integ24) {
    val p = PaperPal.current
    val s = vm.b24
    val any = i.fields.any { it.saved || !it.value.isNullOrBlank() }
    if (!i.canTest && !any) return
    Spacer(Modifier.height(4.dp))
    PCard {
        var top = false
        if (i.canTest) {
            IRow24(vm, -1, null, if (s.integBusy == i.id) "Tester …" else "Test tilkobling", null, "", p.lab, top = false, titleColor = p.lab) {
                if (s.integBusy == null) vm.b24TestIntegration(i)
            }
            top = true
        }
        if (any) {
            val armed = vm.b26.clearArm == i.id
            IRow24(vm, -1, null, if (armed) "Trykk igjen for å fjerne alt" else "Fjern alle verdier", if (armed) "Feltene for ${i.name} blir tomme" else null, "", p.lab, top = top, titleColor = p.lab) {
                if (s.integBusy != null) return@IRow24
                if (armed) vm.b26ClearAll(i) else vm.b26.clearArm = i.id
            }
        }
    }
    LaunchedEffect(vm.b26.clearArm) { if (vm.b26.clearArm != null) { delay(4_000); vm.b26.clearArm = null } }
}

@Composable
private fun LinkCard26(title: String, sub: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Spacer(Modifier.height(4.dp))
    PCard(onClick = onClick) {
        Row(Modifier.fillMaxWidth().padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text(sub, color = p.mut, fontSize = 12.5.sp)
            }
            Text("Åpne ›", color = p.mut, fontSize = 13.sp)
        }
    }
}

/* ---------------- Kalendere ---------------- */

/** Innstillinger → Kalendere: Google Kalender og Home Assistant (fra Bursdager), Skole-iCal og Canvas, og Google-klienten (admin). */
@Composable
internal fun KalSettings26(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.bd24
    LaunchedEffect(Unit) { vm.loadBirthdays24(quiet = true); vm.loadHaCals24(); vm.b24LoadIntegrations() }
    LaunchedEffect(s.google.connected) { if (s.google.connected) vm.loadGoogleCals24() }
    // Etter «Logg inn med Google» i Custom Tab: spør serveren til kontoen er koblet til (som på Bursdager).
    LaunchedEffect(s.authAt) { while (s.authAt != 0L) { delay(3_000); vm.pollGoogle24() } }
    val list = vm.b24.integ ?: emptyList()
    val cals = list.firstOrNull { it.id == "calendars" }
    val school = cals ?: list.firstOrNull { it.id == "calendar" }
    val google = list.firstOrNull { it.id == "google" }?.takeIf { vm.userIsAdmin }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { BdCalendars(vm, ctx) }
        if (school != null) {
            IntegFields26(vm, school, "Skole og Canvas")
            if (cals == null) Text("Canvas-iCal kommer når serveren er oppdatert. Skole-iCal brukes av Kalender-siden.", color = p.mut, fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 4.dp))
            if (school.canTest) PCard {
                IRow24(vm, -1, null, if (vm.b24.integBusy == school.id) "Tester …" else "Test kalenderne", null, "", p.lab, top = false, titleColor = p.lab) {
                    if (vm.b24.integBusy == null) vm.b24TestIntegration(school)
                }
            }
        }
        if (google != null) IntegFields26(vm, google, "Google-klient (server)")
        GuideCard26((cals ?: Integ24("calendars", "Kalendere", null, "missing", emptyList(), false)).let { integMeta26(it).guide })
    }
}

/** Tilpass: IDENTITET og FANELINJE øverst i lista. */
internal fun LazyListScope.tilpassHead39(vm: AppViewModel) {
    item { PLabel("Identitet", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        PCard {
            SetRow(vm, 0, Icons.Filled.Edit, "Navn på appen", vm.appName, "Endre ›") { vm.appNameEdit = true }
            SetRow(vm, 1, Icons.Filled.Image, "App-ikon", APP_ICONS.firstOrNull { it.first == vm.appInfo.icon }?.second ?: "Homelab H· (standard)", "Endre ›", top = true) { vm.appIconEdit = true }
        }
    }
    item { PLabel("Fanelinje", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        PCard {
            ScanHomeRow41(vm) // Prompt 41: «Skanneknapp på Hjem» øverst i FANELINJE
            SetRow(vm, 2, Icons.Filled.ViewWeek, "Fanelinje-stil", navStyleSub25(), navStyleName25() + " ›", top = true) { vm.setNavStyle25(nextNavStyle25()) }
            SetRow(vm, 3, Icons.Filled.ViewWeek, "Fanelinje i Hjem", "Fjern, flytt, gi nytt navn og ikon · eller hold inne på fanelinjen", top = true) { vm.tabEdit = true }
            // Prompt 42: Hjem-knapp (Standard / 1a–1d) med forhåndsvisning i et ark (ui/Ui42.kt).
            SetRow(vm, 4, Icons.Filled.Home, "Hjem-knapp", NAV_HOME42.firstOrNull { it.first == vm.navHome42() }?.third, vm.navHomeLabel42() + " ›", top = true) { vm.p42.navHomeSheet = true }
        }
    }
}

/** Undertekst på raden «Appprofil»: valgt profil. */
internal fun profileName39(vm: AppViewModel): String =
    if (vm.b24.profile == "custom") "Egendefinert" else vm.b24.profiles.firstOrNull { it.key == vm.b24.profile }?.name ?: "Standard"

/** Undersiden «Appprofil»: VELG PROFIL (samme valg og logikk som før) og forklaringen. */
internal fun LazyListScope.profilPage39(vm: AppViewModel) {
    profileGroup24(vm)
    item {
        val p = PaperPal.current
        Text("En profil bestemmer hvilke faner og sider appen viser og hvor den åpner. Dataene dine endres ikke.",
            color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
    }
}

/** Varsler: «Varsle om nye versjoner» (Nordlys OS · banner på Hjem og push). Bare admin har oppdateringsvalgene. */
@Composable
internal fun UpdNotifyToggle39(vm: AppViewModel) {
    if (!vm.userIsAdmin) return
    LaunchedEffect(Unit) { vm.loadUpdSettings30() }
    Column {
        PToggle("Varsle om nye versjoner", "Nordlys OS · banner på Hjem og push", vm.p30.upd.notifyUpdates, top = true) { vm.setUpdSetting30("notify_updates", it) }
    }
}

internal const val SET_SUB50 = "papir_set_sub"

/** Innstillinger vises i to kolonner nå (brett/Fold ≥ 700 dp og Innstillinger er siden som vises). */
internal fun setWide50(vm: AppViewModel, wide: Boolean): Boolean =
    wide && (vm.paperPage == "set" || vm.screen == Screen.Settings) && vm.original == null && vm.editing == null && vm.detail == null

/** Hvilken rad i venstre liste en underside hører til (nivå 2 markerer forelderen). */
private fun navKey50(vm: AppViewModel, page: String?): String? = when {
    page == null -> null
    page.startsWith("integ:") -> "integ"
    parent67(page) != null -> parent67(page) // prompt 67: undersider av Glimt, App og Finans markerer forelderen
    page == "huske" -> "kal"
    page == "kal" && vm.b26.kalFrom == "integ" -> "integ"
    page == "look" -> "tilpass"
    page == "haptics" -> "notify"
    page == "healthpos" -> USERS68 // prompt 68: Helse og posisjon ligger på Brukere og familie
    else -> page
}

private class Row50(val key: String?, val title: String, val icon: ImageVector, val value: String? = null, val go: () -> Unit)

private class Group50(val title: String, val rows: List<Row50>)

/** Prompt 67: samme grupper som på telefon og web (menu67 i ui/Set67Ui.kt), uten undertekst. */
private fun groups50(vm: AppViewModel): List<Group50> =
    menu67(vm).map { g -> Group50(g.title, g.rows.map { r -> Row50(r.key, r.title, r.icon, r.value, r.go) }) }

/** Sider som kan gjenopprettes fra papir_set_sub (ikke «update», som sender videre til Nordlys, og ikke Kalendere fra Bursdager). */
private fun restorable50(k: String): Boolean = k.startsWith("integ:") || (k in PAPER_SET_TITLES && k != "update") || k == "kal"

/**
 * To kolonner: venstre liste (300 dp) og høyre innhold ([right] er den vanlige Innstillinger-listen for vm.settingsPage).
 * Begge kolonnene har egen scroll, så venstre liste står fast mens høyre side scrolles.
 */
@Composable
internal fun SettingsSplit50(vm: AppViewModel, navBottom: Dp, right: @Composable () -> Unit) {
    LaunchedEffect(Unit) {
        if (vm.settingsPage == null) vm.prefs.str(SET_SUB50, "").takeIf { it.isNotBlank() && restorable50(it) }?.let { k ->
            if (k == "kal") vm.openKalSettings26(null) else vm.settingsPage = k
        }
    }
    LaunchedEffect(vm.settingsPage) { runCatching { vm.prefs.set(SET_SUB50, vm.settingsPage ?: "") } }
    Row(Modifier.fillMaxSize().padding(start = 28.dp, end = 12.dp)) {
        LazyColumn(
            Modifier.width(300.dp).fillMaxHeight(),
            contentPadding = PaddingValues(top = 0.dp, bottom = PAPER_BAR + 30.dp + navBottom),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            // Søk og ✦ AI som på telefon; med tekst i feltet viser listen bare treffene.
            if (!settingsSearch24(vm)) {
                val act = navKey50(vm, vm.settingsPage)
                groups50(vm).forEach { g ->
                    item(key = "g50-" + g.title) { GroupHead50(g.title) }
                    g.rows.forEach { r -> item(key = "r50-" + g.title + r.title) { NavRow50(vm, r, r.key != null && r.key == act) } }
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(Modifier.weight(1f).fillMaxHeight()) { right() }
    }
}

/** Gruppetittel med prikket skillelinje over (border-top: 1px dotted). */
@Composable
private fun GroupHead50(title: String) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).drawBehind {
            drawLine(p.line, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())))
        })
        Text(title.uppercase(java.util.Locale("nb", "NO")), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp,
            letterSpacing = 1.2.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 4.dp))
    }
}

/** Rad i venstre liste: rundt farget ikon (hvitt symbol), navn, ev. rød status. Valgt: kort-bakgrunn, fet og myk skygge. */
@Composable
private fun NavRow50(vm: AppViewModel, r: Row50, on: Boolean) {
    val p = PaperPal.current
    val pal = iconPalette(vm.iconTheme)
    val c = Color(setColor30(r.title) ?: pal[(r.title.hashCode() and 0x7fffffff) % pal.size])
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp)
            .then(if (on) Modifier.shadow(10.dp, shape, ambientColor = Color.Black.copy(alpha = .35f), spotColor = Color.Black.copy(alpha = .35f)) else Modifier)
            .clip(shape).background(if (on) p.card else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = r.title) { Haptics.select(); vm.b24.sq = ""; r.go() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
            Icon(r.icon, null, tint = Color.White, modifier = Modifier.size(17.dp))
        }
        Text(r.title, color = p.ink, fontSize = 15.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f))
        r.value?.let { Text(it, color = p.lab, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
    }
}

/** Øverst i høyre kolonne: «‹ Integrasjoner» på nivå 2, og tittel-pillen for valgt side. */
internal fun LazyListScope.settingsHead50(vm: AppViewModel) {
    val sub = vm.settingsPage ?: return
    val lvl2 = vm.settingsBackLabel26().takeIf { it != "Alle innstillinger" }
    item(key = "head50") {
        val p = PaperPal.current
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 6.dp)) {
            if (lvl2 != null) Box(
                Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClickLabel = "Tilbake til $lvl2") { Haptics.back(); vm.settingsBack26() },
                contentAlignment = Alignment.CenterStart,
            ) {
                Box(Modifier.height(36.dp).clip(CircleShape).background(p.card).padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                    Text("‹ $lvl2", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                }
            }
            Box(
                Modifier.heightIn(min = 46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                    .clip(CircleShape).background(p.card).padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterStart,
            ) { PSerif(settingsTitle26(vm), 24.sp, maxLines = 1) }
        }
    }
}

/** Høyre kolonne uten valgt side: oppdateringskortet (når det finnes noe) og profilkortet. */
internal fun LazyListScope.settingsHome50(vm: AppViewModel) {
    if (upd30Show(vm, home = false)) item { UpdateBanner30(vm, home = false) }
    profileCard17(vm)
}

/**
 * Innstillinger → System (prompt 67; før «Programvare»): Nordlys OS med automatiske oppdateringer (admin).
 * App-oppdateringen står under App (App67Page) og Logger har egen rad under SERVER. Uten admin (f.eks. en gammel lagret side) vises appen.
 */
@Composable
internal fun Programvare50(vm: AppViewModel) {
    PCard { if (vm.userIsAdmin) Programvare30(vm) else AppUpdateRow32(vm) }
}

/**
 * Glimt- og AI-flatene som åpnes fra Innstillinger på brett: sentrert med maks 820 dp bredde over et dempet lag, i stedet
 * for over hele skjermen. Trykk på laget utenfor lukker ikke (flatene har egen Ferdig og tilbake).
 */
@Composable
internal fun Centered50(on: Boolean, content: @Composable () -> Unit) {
    if (!on) { content(); return }
    // Laget fanger trykk, så Innstillinger bak ikke kan trykkes mens flaten er åpen.
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .32f)).clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
        Box(Modifier.widthIn(max = 820.dp).fillMaxWidth().fillMaxHeight().padding(vertical = 18.dp).clip(RoundedCornerShape(26.dp))) { content() }
    }
}
