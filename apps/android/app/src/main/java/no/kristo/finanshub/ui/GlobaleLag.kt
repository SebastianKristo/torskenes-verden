package no.kristo.finanshub.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitVerticalTouchSlopOrCancellation
import androidx.compose.foundation.gestures.verticalDrag
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/* ======================= Felles lag ======================= */

/** Lag over alt i Papir: onboarding med profil, Bibel-siden og -arket, Pakker-arket, og økter (bibelverset «lest»). */
@Composable
internal fun Global37(vm: AppViewModel) {
    val s = vm.p37
    val life = LocalLifecycleOwner.current
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_STOP -> vm.appStopped37()
                Lifecycle.Event.ON_START -> vm.appStarted37()
                else -> {}
            }
        }
        life.lifecycle.addObserver(o)
        onDispose { life.lifecycle.removeObserver(o) }
    }
    if (s.h2Menu) H2Sheet37(vm)
    if (s.biblePage) { if (vm.bibleAllowed37()) BiblePage37(vm) else if (s.bibleOn == false) s.biblePage = false }
    if (s.bibleSheet && vm.bibleAllowed37()) BibleSheet37(vm)
    if (s.obOpen) Onboard37(vm)
}

internal val RED38 = Color(0xFFB23A2A)

internal val BLUE38 = Color(0xFF2B5D8A)

internal val GREEN38 = Color(0xFF2F7A4F)

internal val OSLO38: ZoneId = ZoneId.of("Europe/Oslo")

private val WD38 = listOf("man", "tir", "ons", "tor", "fre", "lør", "søn")

private val MS38 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** «tir 23. okt» fra «2026-10-23…»; ellers teksten som den er. */
internal fun day38(iso: String?): String? {
    val d = iso?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return iso
    return "${WD38[d.dayOfWeek.value - 1]} ${d.dayOfMonth}. ${MS38[d.monthValue - 1]}"
}

internal tailrec fun Context.activity38(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.activity38()
    else -> null
}

/** Fingeravtrykk/ansikt (PIN/mønster som reserve). Uten skjermlås på telefonen kan det ikke godkjennes. */
internal fun confirm38(ctx: Context, title: String, sub: String, onOk: () -> Unit, onFail: (String) -> Unit) {
    val act = ctx.activity38() ?: return onFail("Fikk ikke åpnet bekreftelsen")
    val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(act).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) return onFail("Sett opp skjermlås (fingeravtrykk, ansikt eller PIN) på telefonen for å godkjenne.")
    val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { onOk() }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_CANCELED) onFail(errString.toString())
        }
    })
    prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(sub).setAllowedAuthenticators(auth).build())
}

/* ======================= Globalt (Paper.kt) ======================= */

@Composable
internal fun Global38(vm: AppViewModel) {
    val s = vm.p38
    val life = LocalLifecycleOwner.current
    LaunchedEffect(vm.account?.id) {
        vm.qrAfterLogin38()
        vm.prefetchDomains38(force = true)
    }
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_START) vm.prefetchDomains38() }
        life.lifecycle.addObserver(o)
        onDispose { life.lifecycle.removeObserver(o) }
    }
    if (s.qrOpen) QrSheet38(vm)
    s.qrAsk?.let { QrAskSheet38(vm, it) }
    s.qrResult?.let { QrResultSheet38(vm, it) }
    if (s.outAsk) AlertDialog(
        onDismissRequest = { s.outAsk = false },
        title = { Text("Logge ut?") },
        text = { Text("Logge ut av Homelab på denne enheten?") },
        confirmButton = { TextButton(onClick = { s.outAsk = false; vm.logout() }) { Text("Logg ut", color = RED38, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = { s.outAsk = false }) { Text("Avbryt") } },
    )
    if (s.allOpen) LogoutAllSheet38(vm)
}

/**
 * Usynlig lag rundt Glimt-boblen på Hjem (fire flater rundt et hull der boblen står). Første berøring lukker boblen og fanges,
 * så kortet under (f.eks. Vær) ikke åpnes; også scroll lukker. Legges under fullskjermsflatene (Nyheter, Brief …) i Paper.kt.
 */
@Composable
internal fun AnsScrim38(vm: AppViewModel) {
    val r = vm.p38.ansRect ?: return
    if (vm.p31.ans == null) return
    var origin by remember { mutableStateOf(Offset.Zero) }
    val d = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
        val w = constraints.maxWidth.toFloat()
        val h = constraints.maxHeight.toFloat()
        val rr = Rect(r.left - origin.x, r.top - origin.y, r.right - origin.x, r.bottom - origin.y)
        val catcher = Modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                down.consume()
                vm.closeAns31()
                Haptics.dismiss()
                // Resten av berøringen (slipp/dra) fanges også.
                do {
                    val ev = awaitPointerEvent()
                    ev.changes.forEach { it.consume() }
                } while (ev.changes.any { it.pressed })
            }
        }
        with(d) {
            val top = rr.top.coerceIn(0f, h)
            val bottom = rr.bottom.coerceIn(0f, h)
            Box(catcher.offset(0.dp, 0.dp).size(w.toDp(), top.toDp()))
            Box(catcher.offset(0.dp, bottom.toDp()).size(w.toDp(), (h - bottom).coerceAtLeast(0f).toDp()))
            Box(catcher.offset(0.dp, top.toDp()).size(rr.left.coerceIn(0f, w).toDp(), (bottom - top).coerceAtLeast(0f).toDp()))
            Box(catcher.offset(rr.right.coerceIn(0f, w).toDp(), top.toDp()).size((w - rr.right).coerceAtLeast(0f).toDp(), (bottom - top).coerceAtLeast(0f).toDp()))
        }
    }
}

/**
 * Rammen rundt Glimt-boblen: ✕ oppe til høyre (30 dp, glass), sveip opp > 40 dp lukker med glid og fade (under terskelen spretter den
 * tilbake), lite håndtak nederst. Posisjonen meldes til AnsScrim38, og nullstilles når boblen forsvinner.
 */
@Composable
internal fun AnsBox38(vm: AppViewModel, onPull41: (() -> Unit)? = null, content: @Composable () -> Unit) {
    var drag by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val limit = with(LocalDensity.current) { 40.dp.toPx() }
    // Prompt 41 (claude-code-sok-pille-dra-til-chat.md): dra ned = åpne i Chat. Terskel 70 dp, motstand 0,4 etter terskelen,
    // pillen flytter seg 0,35 × dra og bunnen vokser 0,65 × dra; håndtaket blir bredere (34 → 80) og lysere, lett haptikk ved terskelen.
    val open41 = with(LocalDensity.current) { 70.dp.toPx() }
    val dens41 = LocalDensity.current.density
    // Prompt 71: dra-verdien leses i laget (graphicsLayer under). pull41 er derivedStateOf, så kortet bygges bare på nytt når man drar
    // ned mot Chat (bunnen vokser) – ikke hvert bilde mens kortet sveipes opp eller fjærer tilbake.
    val hasPull41 by rememberUpdatedState(onPull41 != null)
    val pull41State = remember { derivedStateOf { if (hasPull41 && drag > 0f) (if (drag <= open41) drag else open41 + (drag - open41) * .4f) else 0f } }
    val pull41 by pull41State
    var armed41 by remember { mutableStateOf(false) }
    LaunchedEffect(pull41 >= open41) { if ((pull41 >= open41) != armed41) { armed41 = pull41 >= open41; Haptics.tap() } }
    DisposableEffect(Unit) { onDispose { vm.p38.ansRect = null } }
    val close: () -> Unit = { Haptics.dismiss(); vm.closeAns31() }
    Box(
        Modifier.fillMaxWidth()
            .onGloballyPositioned { vm.p38.ansRect = it.boundsInRoot() }
            .graphicsLayer { translationY = if (onPull41 != null && drag > 0f) pull41 * .35f else drag; alpha = (1f + minOf(drag, 0f) / (limit * 3f)).coerceIn(0f, 1f) }
            .pointerInput(Unit) {
                // Prompt 70 (claude-code-hjem-scroll-mens-ai.md): sveip opp / dra ned bare fra grepet nederst (30 dp), med mus fra hele
                // kortet. Ellers får siden sveipet, så Hjem kan scrolles med fingeren på kortet (før tok detectVerticalDragGestures alt).
                val gripPx = 30.dp.toPx()
                val onEnd70: (Float) -> Unit = { vy ->
                        scope.launch {
                            if (onPull41 != null && drag > 0f && (if (drag <= open41) drag else open41 + (drag - open41) * .4f) >= open41) {
                                Haptics.select(); armed41 = false; drag = 0f; onPull41()
                            } else if (swipeClose74(-drag, -vy, 60.dp.toPx(), 600.dp.toPx())) { // prompt 74: > 60 dp og raskt
                                animate(drag, -size.height.toFloat() * .6f, animationSpec = tween(170)) { v, _ -> drag = v }
                                close()
                                drag = 0f
                            } else animate(drag, 0f, animationSpec = if (drag > 0f && onPull41 != null) tween(250, easing = androidx.compose.animation.core.CubicBezierEasing(.2f, .8f, .2f, 1f)) else spring(dampingRatio = .6f)) { v, _ -> drag = v }
                        }
                    Unit
                }
                val onDrag70: (Float) -> Unit = { amt ->
                    val n = drag + amt
                    drag = if (n > 0f) (if (onPull41 != null) n else minOf(n * .5f, limit * .3f)) else n
                }
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    if (!gripHit70(down.type, down.position.y, size.height, gripPx)) return@awaitEachGesture
                    var over = 0f
                    val first = awaitVerticalTouchSlopOrCancellation(down.id) { ch, o -> ch.consume(); over = o } ?: return@awaitEachGesture
                    onDrag70(over)
                    // Prompt 74: farten måles på dra-verdien (kortet flytter seg med fingeren, så lokale posisjoner er ikke stødige).
                    val vt = androidx.compose.ui.input.pointer.util.VelocityTracker()
                    vt.addPosition(first.uptimeMillis, Offset(0f, drag))
                    val ok = verticalDrag(first.id) { ch -> onDrag70(ch.positionChange().y); ch.consume(); vt.addPosition(ch.uptimeMillis, Offset(0f, drag)) }
                    if (ok) onEnd70(vt.calculateVelocity().y) else scope.launch { animate(drag, 0f, animationSpec = spring()) { v, _ -> drag = v } }
                }
            },
    ) {
        Column {
            content()
            if (pull41 > 0f) Box(Modifier.fillMaxWidth().height((pull41 * .65f / dens41).dp), contentAlignment = Alignment.Center) {
                Text(if (pull41 >= open41) "Slipp for å åpne i Chat" else "Dra ned for å åpne i Chat", color = Color.White.copy(alpha = (pull41 / open41).coerceIn(0f, 1f) * .85f),
                    fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
            }
        }
        Box(
            Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 10.dp).size(30.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f))
                .border(1.dp, Color.White.copy(alpha = .14f), CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk svaret") { close() },
            contentAlignment = Alignment.Center,
        ) { Text("✕", modifier = Modifier.semantics { contentDescription = "Lukk svaret" }, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        // Håndtaket (36 → 80 dp bredt): tegnes i tegnefasen i en fast flate, så bredden ikke måles på nytt hvert bilde.
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).size(80.dp, 4.dp).drawBehind {
            val pl = pull41State.value
            val w = (36f + 44f * (pl / open41).coerceIn(0f, 1f)).dp.toPx()
            drawRoundRect(Color.White.copy(alpha = if (pl >= open41) .6f else .28f), Offset((size.width - w) / 2f, 0f), Size(w, size.height), CornerRadius(size.height / 2f))
        })
    }
}

/** Prompt 74: sveip opp lukker bare fra grepet, og bare når det er tydelig: mer enn [minPx] opp og raskere enn [minV] px/s. */
internal fun swipeClose74(up: Float, speed: Float, minPx: Float, minV: Float): Boolean = up > minPx && speed > minV

/* ======================= Felles lag ======================= */

/** Fullskjermsflatene og arkene fra prompt 40 (legges øverst i Papir). */
@Composable
internal fun Global40(vm: AppViewModel) {
    val s = vm.p40
    if (s.newsGl && vm.newsOpen) NewsGlimt40Page(vm)
    if (s.ngPick) NgPicker40(vm)
    if (s.tfOpen) TwoFa40Screen(vm)
    if (s.hlSheet) HjemlysPage40(vm) // 1a/1b/1c (ui/Hjemlys40Ui.kt)
    s.editAll?.let { id -> vm.txDetail?.takeIf { it.tx.id == id }?.let { EditAll40Sheet(vm, it) } ?: run { s.editAll = null } }
}

/* ======================= Globalt (Paper.kt) ======================= */

@Composable
internal fun Global41(vm: AppViewModel) {
    val s = vm.p41
    LaunchedEffect(Unit) { vm.initP41() }
    LaunchedEffect(vm.account?.id) {
        if (vm.account == null) return@LaunchedEffect
        vm.appAuthAfterLogin41()
        vm.loadServer41()
        vm.loadJourney41()
        vm.loadZones41() // skolesonene registreres som geofence (Live41.kt)
    }
    // Oslo-bakgrunnen: sjekk hvert minutt om timen/tidsrommet er endret; Min reise: sanntid hvert 30. s mens kortet vises.
    LaunchedEffect(Unit) { while (true) { delay(60_000); vm.osloTick41(); if (s.journey != null) vm.loadJourney41() } }
    LaunchedEffect(s.journey?.leftAt) { while (s.journey != null) { vm.loadTrip41(); delay(30_000) } }
    s.appAuth?.let { AppAuthSheet41(vm, it) }
    Link86Dialog(vm) // prompt 86: bekreftelse før en lenke utenfra utfører en handling
    s.srvSheet?.let { ServerSheet41(vm, it) }
    s.sfKind?.let { SiFraSheet41(vm, it) }
    TripToast41(vm)
    PillGrow41(vm)
    Confetti41(vm)
    if (s.srcOpen) SourcesSheet41(vm)
}

private tailrec fun Context.activity41(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.activity41()
    else -> null
}

/** Fingeravtrykk/ansikt (PIN som reserve). */
internal fun confirm41(ctx: Context, title: String, sub: String, onOk: () -> Unit, onFail: (String) -> Unit) {
    val act = ctx.activity41() ?: return onFail("Fikk ikke åpnet bekreftelsen")
    val auth = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(act).canAuthenticate(auth) != BiometricManager.BIOMETRIC_SUCCESS) return onFail("Sett opp skjermlås (fingeravtrykk, ansikt eller PIN) på telefonen for å godkjenne.")
    val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { onOk() }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            if (errorCode != BiometricPrompt.ERROR_USER_CANCELED && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_CANCELED) onFail(errString.toString())
        }
    })
    prompt.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(sub).setAllowedAuthenticators(auth).build())
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun Sheet41(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = onClose, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
internal fun Pill41(text: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) p.ink else Color.Transparent)
            .border(1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button) { Haptics.select(); onClick() }.padding(horizontal = 15.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/* ---------------- Felles lag ---------------- */

/** Over hele appen: stripa for «Logg inn som», toasten etter «Gå ut», Logger og Studie-dokumenter. */
@Composable
internal fun BoxScope.Global44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    if (t.logsOpen) LoggerScreen44(vm)
    if (t.studyOpen) StudyScreen44(vm)
    AsStripe44(vm, Modifier.align(Alignment.TopCenter))
    t.asToast?.let { msg ->
        LaunchedEffect(msg) { delay(4500); t.asToast = null }
        val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = navB + 96.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(14.dp)).background(p.ink).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text(msg, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f, fill = false).padding(vertical = 10.dp))
            if (t.asUndo != null) Text("Angre", color = Color(0xFFE5A00D), fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                .clickable { vm.undoAs44() }.padding(horizontal = 12.dp).wrapContentHeight())
        }
    }
}

/** Globalt (Paper.kt): standardverdier fra /api/config etter innlogging, og ML Kit-arket. */
@Composable
internal fun Global47(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { if (vm.account != null) vm.loadConfig47() }
    ReceiptSheet48(vm) // prompt 48: kvitteringsskanning (ui/Receipt48Ui.kt)
}
