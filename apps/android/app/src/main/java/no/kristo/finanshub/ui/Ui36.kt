package no.kristo.finanshub.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.expandVertically
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*
import kotlin.math.abs

/*
 * Prompt 36 (ANDROID36): sveip bort brief-kortet (claude-code-glimt-brief.md → «Sveip bort brief-kortet»), toasten med Angre,
 * trykk/hold på temperaturen, profilbildet i Konto, ikon på radene i Innstillinger, Google → Hovedkalender og «Vis også i Kalender»,
 * og kvitteringen for siste backup.
 */

/* ======================= Brief-kortet: sveip mot høyre ======================= */

private val EASE_OUT36 = CubicBezierEasing(.4f, 0f, .6f, 1f)

/**
 * Brief-kortet på Hjem med sveip venstre → høyre. Prompt 39: selve gesten og animasjonen ligger i SwipeDismiss39 (ui/Ui39.kt,
 * myk og uten rekomponering under draget), og hint-animasjonen («Sveip → for å skjule») er fjernet helt.
 * Skjult: kortet kollapser; Angre i toasten viser det igjen (glir inn).
 */
@Composable
internal fun SwipeBrief36(vm: AppViewModel, content: @Composable () -> Unit) {
    val hidden = vm.briefHiddenNow36()
    AnimatedVisibility(!hidden, enter = expandVertically(tween(300, easing = EASE_OUT36)) + fadeIn(tween(260)), exit = ExitTransition.None) {
        SwipeDismiss39(enabled = true, radius = 24.dp, idle = "Sveip for å skjule", armed = "Slipp for å skjule", done = "Brief skjult",
            sub = "Kommer tilbake med ${briefNext36()}", onGone = { vm.hideBrief36() }) { content() }
    }
}

/** «Brief skjult til kveldsbriefen kl. 17» + Angre (4,5 s), nederst over fanelinja. */
@Composable
internal fun BriefToast36(vm: AppViewModel, modifier: Modifier = Modifier) {
    val s = vm.p36
    val seq = s.briefToast
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(seq) { if (seq > 0) { show = true; delay(4500); show = false } else show = false }
    AnimatedVisibility(show, modifier, enter = fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 2 }, exit = fadeOut(tween(200))) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(18.dp)).background(Color(0xFF1B1A17)).padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Brief skjult til ${briefNext36()}", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            Box(Modifier.height(34.dp).clip(RoundedCornerShape(17.dp)).background(Color(0xFFF3EFE6)).clickable(role = Role.Button) { show = false; vm.undoBrief36() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("Angre", color = Color(0xFF1B1A17), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        }
    }
}

/* ======================= Trykk / hold ======================= */

/** Kort trykk → [onTap], hold inne ≥ [holdMs] → [onHold] (lett haptikk, klikket etterpå ignoreres). pressed: mens fingeren er nede. */
internal fun Modifier.tapHold36(holdMs: Long = 550, pressed: (Boolean) -> Unit, onTap: () -> Unit, onHold: () -> Unit): Modifier = this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        pressed(true)
        val slop = 10.dp.toPx()
        val r = withTimeoutOrNull(holdMs) {
            while (true) {
                val ev = awaitPointerEvent()
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull 2
                if (!ch.pressed) { ch.consume(); return@withTimeoutOrNull 1 }
                if ((ch.position - down.position).getDistance() > slop) return@withTimeoutOrNull 2
            }
            @Suppress("UNREACHABLE_CODE") 2
        }
        when (r) {
            null -> {
                Haptics.tap()
                onHold()
                while (true) { val ev = awaitPointerEvent(); ev.changes.forEach { it.consume() }; if (ev.changes.none { it.pressed }) break }
            }
            1 -> onTap()
            else -> {}
        }
        pressed(false)
    }
}

/* ======================= Konto: profilbildet ======================= */

/** Toppen av Konto: profilbildet (88 dp, ring) sentrert over navnet, «Endre bilde», og Last opp nytt · Ta bilde · Fjern. */
@Composable
internal fun KontoAvatar36(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.p36
    var shot by remember { mutableStateOf<android.net.Uri?>(null) }
    var actions by remember { mutableStateOf(false) }
    var press by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { vm.uploadAvatar36(it) } }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) shot?.let { vm.uploadAvatar36(it) } }
    val choose = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.size(96.dp).clip(CircleShape).background(Color(0xFFD8D1C2)).padding(1.dp).clip(CircleShape).background(Color(0xFFF3EFE6)).padding(3.dp).clip(CircleShape)
                .tapHold36(pressed = { press = it }, onTap = { Haptics.tap(); choose() }, onHold = { actions = true }),
            contentAlignment = Alignment.Center,
        ) {
            val b = vm.avatar
            if (b != null) Image(b.asImageBitmap(), "Profilbilde", contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().clip(CircleShape))
            else Box(Modifier.matchParentSize().background(Color(0xFF2B5D8A)), contentAlignment = Alignment.Center) {
                Text(initial(vm.displayName.ifBlank { "•" }), color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 32.sp)
            }
            if (press || s.avatarBusy) Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = .45f)), contentAlignment = Alignment.Center) {
                if (s.avatarBusy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    WxIcon("M3 8h3l2-3h8l2 3h3v11H3zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8", Color.White, 20.dp, stroke = 2f)
                    Text("Endre", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                }
            }
        }
        PSerif(vm.displayName.ifBlank { "Konto" }, 22.sp, maxLines = 1)
        val user = vm.me?.username?.takeIf { it.isNotBlank() } ?: vm.account?.username
        if (!user.isNullOrBlank()) Text("@$user", color = p.mut, fontSize = 13.sp)
        Text(if (actions) "Skjul" else "Endre bilde", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button) { Haptics.select(); actions = !actions }.padding(10.dp, 6.dp))
        AnimatedVisibility(actions) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AvBtn36("Last opp nytt", p.ink) { actions = false; choose() }
                AvBtn36("Ta bilde", p.ink) {
                    actions = false
                    val f = java.io.File(java.io.File(ctx.cacheDir, "scans").apply { mkdirs() }, "profil-${System.currentTimeMillis()}.jpg")
                    val u = androidx.core.content.FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
                    shot = u; camera.launch(u)
                }
                if (vm.avatar != null) AvBtn36("Fjern", Color(0xFFB23A2A)) { s.avatarAsk = true }
            }
        }
    }
    if (s.avatarAsk) AlertDialog(
        onDismissRequest = { s.avatarAsk = false },
        title = { Text("Fjern profilbildet?") },
        text = { Text("Bildet fjernes fra menyen, hilsenen og appen. Initialene vises i stedet.") },
        confirmButton = { TextButton({ s.avatarAsk = false; actions = false; vm.removeAvatar() }) { Text("Fjern", color = Color(0xFFB23A2A), fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton({ s.avatarAsk = false }) { Text("Avbryt") } },
    )
}

@Composable
private fun AvBtn36(text: String, fg: Color, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) { Text(text, color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/** Miniatyr (40 dp rund) til høyre på raden «Profilbilde». */
@Composable
internal fun AvatarThumb36(vm: AppViewModel) {
    val b = vm.avatar ?: return
    Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(CircleShape))
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

/* ======================= Google: Hovedkalender og «Vis også i Kalender» ======================= */

@Composable
internal fun GoogleCals36(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.gcal36
    LaunchedEffect(vm.bd24.google.connected, vm.account?.id) { if (vm.bd24.google.connected) vm.loadGCals36() }
    if (s.missing) return
    val d = s.data ?: return
    if (!d.connected) return
    val mainCal = d.cals.firstOrNull { it.main } ?: d.cals.firstOrNull { it.id == d.mainId || it.googleId == d.mainId }
    val writable = d.cals.filter { it.writable }.sortedWith(compareBy({ !it.primary }, { it.name.lowercase() }))
    val others = d.cals.filter { it.googleId != mainCal?.googleId }.sortedWith(compareBy({ !it.primary }, { it.name.lowercase() }))
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Text("HOVEDKALENDER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 8.dp))
        Text("Nye hendelser fra Kalender og Glimt lagres her.", color = p.mut, fontSize = 12.sp)
        writable.forEach { c ->
            val on = c.googleId == mainCal?.googleId
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(enabled = s.busy == null, role = Role.RadioButton) { vm.setGMain36(c) }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(22.dp).clip(CircleShape).border(2.dp, if (on) p.ink else p.line, CircleShape), contentAlignment = Alignment.Center) {
                    if (on) Box(Modifier.size(11.dp).clip(CircleShape).background(p.ink))
                }
                Column(Modifier.weight(1f)) {
                    Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(when { c.primary -> "Personlig · nye hendelser lagres her".let { if (on) it else "Personlig" }; on -> "Nye hendelser lagres her"; else -> "Kan skrives til" },
                        color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                if (s.busy == "main" && on) CircularProgressIndicator(color = p.mut, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            }
        }
        if (others.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(1.dp).background(p.line))
            Text("VIS OGSÅ I KALENDER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, modifier = Modifier.padding(top = 8.dp))
            others.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(enabled = s.busy == null, role = Role.Switch) { vm.toggleGShow36(c) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(Color(c.color ?: 0xFF7A7468)))
                    Column(Modifier.weight(1f)) {
                        Text(c.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (c.writable) (if (c.primary) "Personlig" else "Kan skrives til") else "Bare lesing", color = p.mut, fontSize = 12.sp, maxLines = 1)
                    }
                    Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (c.shown) p.pos else p.line).padding(3.dp),
                        contentAlignment = if (c.shown) Alignment.CenterEnd else Alignment.CenterStart) { Box(Modifier.size(22.dp).clip(CircleShape).background(Color.White)) }
                }
            }
        }
        s.err?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
    }
}

/* ======================= Backup: kvittering for siste kjøring ======================= */

/** «✓ 2,4 GB · smb://truenas.local/backup/homelab/homelab-2026-10-19_2130-hele.tar.zst · verifisert» + Åpne mappe › og Vis logg. */
@Composable
internal fun BackupReceipt36(vm: AppViewModel, b: Bk29Item) {
    val p = PaperPal.current
    if (b.fullPath.isBlank() && b.verified == null) return
    var log by remember { mutableStateOf(false) }
    val ok = b.ok && b.verified != false
    Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(listOfNotNull(if (ok) "✓" else "✗", b.size.takeIf { it.isNotBlank() }, b.fullPath.takeIf { it.isNotBlank() },
            when (b.verified) { true -> "verifisert"; false -> "ikke verifisert"; null -> null }).joinToString(" · ").replace("✓ · ", "✓ ").replace("✗ · ", "✗ "),
            color = if (ok) p.pos else p.lab, fontFamily = PaperFonts.mono, fontSize = 12.sp, lineHeight = 17.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            if (b.fullPath.startsWith("smb://")) Text("Åpne mappe ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.openSmb30(finans = false, system = true) }.padding(vertical = 4.dp))
            Text(if (log) "Skjul logg" else "Vis logg", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.select(); log = !log }.padding(vertical = 4.dp))
        }
        if (log) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.bg).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            listOfNotNull(
                b.target.takeIf { it.isNotBlank() }?.let { "Mål: $it" }, b.method.takeIf { it.isNotBlank() }?.let { "Metode: $it" },
                b.bytes?.let { "Skrevet: $it byte" }, b.sha256.takeIf { it.isNotBlank() }?.let { "SHA-256: ${it.take(16)}…" },
                b.verified?.let { "Verifisert: " + if (it) "ja (størrelse og liste stemmer)" else "nei" }, b.ms?.let { "Tid: %.1f s".format(java.util.Locale("nb", "NO"), it / 1000.0) },
                b.error.takeIf { it.isNotBlank() }?.let { "Feil: $it" },
            ).plus(b.retention.map { "Retention: $it" }).ifEmpty { listOf("Ingen logg for denne kjøringen.") }.forEach {
                Text(it, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 16.sp)
            }
        }
    }
}
