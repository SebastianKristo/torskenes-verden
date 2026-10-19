package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import no.kristo.finanshub.*

/*
 * Prompt 37 (ANDROID37): wiggle-hjelpere (holdDrag37, auto-scroll), Pakker-widgeten (h2) med «Rediger widget»,
 * onboarding med profil, husstandens sporingsnøkler, «Vis på kart ›» for «hvor er …» og felles lag (Global37).
 */

/* ======================= Wiggle ======================= */

/**
 * Som holdDrag (500 ms, 8 dp slop, resten av berøringen spises), men gir pekerens posisjon i rotkoordinater (x og y),
 * så midtre 30 %-testen også virker i to kolonner på Fold.
 */
internal fun Modifier.holdDrag37(
    enabled: Boolean,
    onLong: () -> Unit,
    onDrag: (Offset) -> Unit,
    onEnd: () -> Unit,
    toRoot: (Offset) -> Offset,
): Modifier = if (!enabled) this else this.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val slop = 8.dp.toPx()
        var moved = false
        val released = withTimeoutOrNull(500L) {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull true
                if (!ch.pressed) return@withTimeoutOrNull true
                if ((ch.position - down.position).getDistance() > slop) { moved = true; return@withTimeoutOrNull true }
            }
            @Suppress("UNREACHABLE_CODE") true
        }
        if (released != null || moved) return@awaitEachGesture
        onLong()
        try {
            while (true) {
                val ev = awaitPointerEvent(PointerEventPass.Initial)
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                ev.changes.forEach { it.consume() }
                if (!ch.pressed) break
                if (ch.positionChange() != Offset.Zero) onDrag(runCatching { toRoot(ch.position) }.getOrDefault(ch.position))
            }
        } finally { onEnd() }
    }
}

/** Grensene til Hjem-listen (for auto-scroll nær topp og bunn). */
internal fun Modifier.gridBounds37(vm: AppViewModel): Modifier = this.onGloballyPositioned { c ->
    val y = c.positionInRoot().y
    vm.p37.gridTop = y
    vm.p37.gridBottom = y + c.size.height
}

/** Auto-scroll mens et kort dras nær kanten: maks 12 dp per bilde. */
@Composable
internal fun WiggleScroll37(vm: AppViewModel, state: LazyGridState) {
    val on = vm.p37.edgeDir != 0f
    val dens = androidx.compose.ui.platform.LocalDensity.current.density
    LaunchedEffect(on) {
        if (!on) return@LaunchedEffect
        while (true) {
            val d = vm.p37.edgeDir
            if (d == 0f) break
            runCatching { state.scrollBy(d * 12f * dens) }
            withFrameNanos { }
        }
    }
}

private val GRAY37 = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) }

/** Gråtone (kort som er skjult utenfor redigeringsmodus). */
internal fun Modifier.gray37(on: Boolean): Modifier = if (!on) this else this.drawWithContent {
    drawIntoCanvas { c -> c.saveLayer(Rect(Offset.Zero, size), GRAY37); drawContent(); c.restore() }
}

/* ======================= Pakker (h2) ======================= */

/**
 * Pakker-widgeten: én pakke (som før, [single]) eller 2–3 rader. Med «vis bare når det er pakker» og 0 aktive pakker vises den
 * bare i wiggle-modus, dempet (gråtone, 65 %) med merket «Skjult når ingen pakker». Kommer den tilbake, glir den mykt inn.
 */
@Composable
internal fun Packages37(vm: AppViewModel, wide: Boolean, single: @Composable () -> Unit) {
    val p = PaperPal.current
    val s = vm.p37
    val hidden = vm.h2Hidden37()
    val edit = vm.editPage == "hjem"
    LaunchedEffect(hidden) { if (hidden) s.h2WasHidden = true }
    val vis = remember { MutableTransitionState(!s.h2WasHidden) }
    LaunchedEffect(Unit) { vis.targetState = true }
    AnimatedVisibility(vis, enter = fadeIn(tween(320)) + expandVertically(tween(320))) {
        Box(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().gray37(edit && hidden).graphicsLayer { alpha = if (edit && hidden) .65f else 1f }) {
                val list = (vm.tracking?.top(3) ?: vm.homePackages ?: emptyList())
                if (s.h2N <= 1 || list.size <= 1) single()
                else PCard(onClick = { vm.paperTab("trk") }) {
                    Column(Modifier.padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PLabel("Pakker · ${vm.packagesOnWay}")
                        list.take(s.h2N).forEach { pk ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                PackageLogo(vm, pk, 38)
                                Column(Modifier.weight(1f)) {
                                    Text(pk.cardTitle, color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(listOf(if (pk.ready) "Hent i dag" else pk.statusText.ifBlank { "På vei" }, pk.etaText, pk.carrierName).filter { it.isNotBlank() }.joinToString(" · "),
                                        color = if (pk.ready) p.lab else p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }
            if (edit && hidden) Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp).shadow(4.dp, RoundedCornerShape(9.dp)).clip(RoundedCornerShape(9.dp)).background(p.card).padding(9.dp, 3.dp)) {
                Text("Skjult når ingen pakker", color = p.mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
            }
        }
    }
}

/** «Rediger widget» på Pakker: Vis bare når det er pakker (på), status, Pakker som vises 1/2/3, Ferdig. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun H2Sheet37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    val n = vm.activePackages37() ?: 0
    val close = { s.h2Menu = false }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Pakker", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            PCard {
                PToggle("Vis bare når det er pakker", when {
                    !s.h2Auto -> "Vises alltid"
                    n == 1 -> "1 pakke på vei nå"
                    n > 1 -> "$n pakker på vei nå"
                    else -> "Ingen pakker nå · widgeten er skjult"
                }, s.h2Auto) { vm.setH2Opt37(auto = it) }
            }
            PLabel("PAKKER SOM VISES", p.mut)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..3).forEach { k -> PChip("$k", s.h2N == k) { vm.setH2Opt37(n = k) } }
            }
            Text("Andre ser aldri pakkene dine. Widgeten viser bare egne pakker.", color = p.mut, fontSize = 12.5.sp)
        }
    }
}

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

/* ======================= Onboarding: koble bruker til profil ======================= */

private val OB_LINKS37 = listOf(
    listOf("location", "Posisjon og Familie-kart", "Del posisjonen din med husstanden", "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z", "2f6b45"),
    listOf("lists", "Gjøremål", "Delte lister: Hjem, Handel", "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2", "b23a2a"),
    listOf("subs", "Delte abonnementer", "Abonnementer som deles med deg", "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", "a8661a"),
    listOf("calendars", "Kalendere", "Familie og felles kalender", "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4", "2b5d8a"),
    listOf("health", "Helse", "Health Connect på denne enheten", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", "c2477a"),
)

/** Steg 2–4 av onboardingen (steg 1, innloggingen, er den vanlige innloggingen). Mobil først, maks 440 dp. */
@Composable
private fun Onboard37(vm: AppViewModel) {
    val s = vm.p37
    val bg = Color(0xFFF3EFE6); val ink = Color(0xFF1B1A17); val mut = Color(0xFF6B665C); val card = Color(0xFFFFFDF8); val line = Color(0xFFDDD5C5)
    val user = (vm.me?.username ?: vm.account?.username ?: "bruker").lowercase()
    BackHandler { if (s.obStep in 2..2) s.obStep-- else vm.closeOnboard37(skip = s.obStep == 3) }
    val sel = s.profiles.firstOrNull { it.id == s.obSel }
    val me = if (s.obNew) Profile37("ny", s.obNewName.trim().ifBlank { "Ny bruker" }, 0xFF3D7F8A, null, null, null, false, false, false, false)
        else s.obLinked ?: sel ?: s.profiles.firstOrNull { it.id == s.obMine }
    Box(Modifier.fillMaxSize().background(bg).clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 440.dp).fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 22.dp)) {
            Row(Modifier.fillMaxWidth().height(44.dp), verticalAlignment = Alignment.CenterVertically) {
                if (s.obStep == 2) Box(Modifier.size(40.dp).clip(CircleShape).border(1.dp, line, CircleShape).background(card).clickable(role = Role.Button, onClickLabel = "Tilbake") { s.obStep = 1 },
                    contentAlignment = Alignment.Center) { WxIcon("M15 6l-6 6 6 6", ink, 16.dp, stroke = 2.6f) }
                else if (s.obStep == 1) Box(Modifier.height(40.dp).clip(CircleShape).clickable(role = Role.Button) { vm.closeOnboard37(skip = false) }.padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                    Text("Senere", color = mut, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                } else Spacer(Modifier.size(40.dp))
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally)) {
                    (0..3).forEach { i ->
                        val w by animateDpAsState(if (i == s.obStep) 26.dp else 6.dp, tween(300), label = "obDot")
                        Box(Modifier.size(w, 6.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= s.obStep) ink else line))
                    }
                }
                Spacer(Modifier.size(40.dp))
            }
            AnimatedContent(s.obStep, transitionSpec = { (fadeIn(tween(300)) + slideInHorizontally(tween(350)) { it / 20 }) togetherWith fadeOut(tween(150)) }, label = "ob37", modifier = Modifier.weight(1f)) { st ->
                when (st) {
                    1 -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("STEG 2 AV 3", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.8.sp)
                        Text("Hvem er du?", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 36.sp, lineHeight = 38.sp)
                        if (s.obLocked && s.obMine != null) {
                            Text("Admin har koblet deg til ${me?.name ?: "en profil"}. Bekreft at det er deg.", color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp)
                            me?.let { ProfileRow37(it, true, false, null) {} }
                        } else {
                            Text("Koble brukeren @$user til en profil. Profilen har posisjon, gjøremål, delte abonnementer og kalendere som allerede finnes.", color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp)
                            val sug = s.profiles.firstOrNull { it.id == s.obSel && it.userId == null }
                            if (sug != null && !s.obNew) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(card).border(1.dp, line, RoundedCornerShape(14.dp)).padding(12.dp, 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("✦", color = Color(0xFFB23A2A), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                                Text("Glimt tror du er ${sug.name} (samme navn som brukeren).", color = Color(0xFF3D3A33), fontSize = 13.sp, modifier = Modifier.weight(1f))
                            }
                            s.profiles.forEach { pr ->
                                val taken = pr.other || (pr.userId != null && pr.id != s.obMine && !pr.username.equals(user, true))
                                ProfileRow37(pr, !s.obNew && s.obSel == pr.id, taken, if (taken) "Koblet til @${pr.username ?: "en annen"}" else null) {
                                    if (!taken) { Haptics.select(); s.obSel = pr.id; s.obNew = false }
                                }
                            }
                            Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clip(RoundedCornerShape(18.dp)).border(2.dp, if (s.obNew) ink else line, RoundedCornerShape(18.dp))
                                .clickable(role = Role.Button) { s.obNew = true; s.obSel = null }.padding(14.dp, 10.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(Color(0xFFE9E2D3)), contentAlignment = Alignment.Center) { Text("+", color = ink, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp) }
                                Column(Modifier.weight(1f)) {
                                    Text("Jeg er ny i husstanden", color = ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text("Lag en ny profil for meg", color = mut, fontSize = 12.5.sp)
                                }
                            }
                            if (s.obNew) BasicTextField(s.obNewName, { s.obNewName = it.take(40) }, singleLine = true,
                                textStyle = TextStyle(color = ink, fontSize = 16.sp, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium), cursorBrush = SolidColor(Color(0xFFB23A2A)),
                                modifier = Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, line, RoundedCornerShape(14.dp)).background(card).padding(horizontal = 14.dp),
                                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (s.obNewName.isEmpty()) Text("Navnet ditt", color = mut, fontSize = 16.sp); inner() } })
                        }
                        s.obErr?.let { Text(it, color = Color(0xFFB23A2A), fontSize = 13.sp) }
                    }
                    2 -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("STEG 3 AV 3", color = Color(0xFFB23A2A), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.8.sp)
                        Text("Dette kobles til deg", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 36.sp, lineHeight = 38.sp)
                        me?.let { m ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(card).padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(44.dp).clip(CircleShape).background(Color(m.color)), contentAlignment = Alignment.Center) { Text(m.name.take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
                                Column(Modifier.weight(1f)) {
                                    Text(m.name, color = ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Text("@$user ⟷ profil", color = mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                }
                            }
                        }
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(card).padding(horizontal = 14.dp)) {
                            OB_LINKS37.filter { !s.obNew || it[0] != "subs" }.forEachIndexed { i, l ->
                                val on = s.obConsent[l[0]] == true
                                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE6DFD1)))
                                Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clickable(role = Role.Switch) { Haptics.select(); s.obConsent = s.obConsent + (l[0] to !on) },
                                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    val c = Color(0xFF000000L or l[4].toLong(16))
                                    Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = .12f)), contentAlignment = Alignment.Center) { WxIcon(l[3], c, 16.dp, stroke = 2.2f) }
                                    Column(Modifier.weight(1f)) {
                                        Text(l[1], color = ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                                        Text(if (s.obNew && l[0] == "lists") "Du blir lagt til i felles lister" else l[2], color = mut, fontSize = 12.sp)
                                    }
                                    Box(Modifier.size(46.dp, 28.dp).clip(RoundedCornerShape(14.dp)).background(if (on) Color(0xFF2F7A4F) else line).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
                                        Box(Modifier.size(22.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
                                    }
                                }
                            }
                        }
                        Text("Du kan endre koblingen senere i Innstillinger → Konto → Profil. Admin får beskjed om nye koblinger.", color = mut, fontSize = 12.5.sp)
                        s.obErr?.let { Text(it, color = Color(0xFFB23A2A), fontSize = 13.sp) }
                    }
                    else -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)) {
                        val m = me
                        val sc = remember { Animatable(.6f) }
                        LaunchedEffect(Unit) { sc.animateTo(1f, spring(.45f, 300f)) }
                        Box(Modifier.size(96.dp).graphicsLayer { scaleX = sc.value; scaleY = sc.value }.shadow(18.dp, CircleShape).clip(CircleShape).background(Color(m?.color ?: 0xFF3D7F8A)), contentAlignment = Alignment.Center) {
                            Text((m?.name ?: "?").take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp)
                        }
                        Text("Hei, ${firstName37(m?.name ?: vm.displayName)}!", color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 38.sp, textAlign = TextAlign.Center)
                        val n = s.obConsent.count { (k, v) -> v && (!s.obNew || k != "subs") }
                        Text("@$user er nå koblet til ${m?.name ?: "profilen"}. $n ting er satt opp for deg, og resten av husstanden ser deg som ${firstName37(m?.name ?: "")}.",
                            color = Color(0xFF3D3A33), fontSize = 15.sp, lineHeight = 22.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
                    }
                }
            }
            val ok = when (s.obStep) { 1 -> if (s.obLocked && s.obMine != null) true else if (s.obNew) s.obNewName.isNotBlank() else s.obSel != null; else -> true }
            val label = when (s.obStep) { 1 -> if (s.obLocked && s.obMine != null) "Bekreft" else if (s.obNew) "Lag profil" else "Dette er meg"; 2 -> if (s.obBusy) "Kobler …" else "Koble og fortsett"; else -> "Gå til Hjem" }
            Box(Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(27.dp)).background(if (ok) ink else Color(0xFFA39D90)).clickable(enabled = ok && !s.obBusy, role = Role.Button) {
                Haptics.tap()
                when (s.obStep) {
                    1 -> if (s.obLocked && s.obMine != null) vm.linkProfile37() else { s.obErr = null; s.obStep = 2 }
                    2 -> vm.linkProfile37()
                    else -> { vm.closeOnboard37(skip = true); vm.paperTab("hjem") }
                }
            }, contentAlignment = Alignment.Center) { Text(label, color = bg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
        }
    }
}

@Composable
private fun ProfileRow37(pr: Profile37, on: Boolean, taken: Boolean, sub: String?, onClick: () -> Unit) {
    val ink = Color(0xFF1B1A17)
    val has = sub ?: listOfNotNull(if (pr.hasLoc) "Posisjon" else null, if (pr.hasLists) "Delte lister" else null, if (pr.hasSubs) "Abonnementer" else null).joinToString(" · ").ifBlank { "Profil i husstanden" }
    Row(Modifier.fillMaxWidth().heightIn(min = 66.dp).alpha(if (taken) .45f else 1f).clip(RoundedCornerShape(18.dp)).border(2.dp, if (on) ink else Color.Transparent, RoundedCornerShape(18.dp))
        .background(Color(0xFFFFFDF8)).clickable(enabled = !taken, role = Role.RadioButton) { onClick() }.padding(14.dp, 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(Color(pr.color)), contentAlignment = Alignment.Center) { Text(pr.name.take(1), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp) }
        Column(Modifier.weight(1f)) {
            Text(pr.name, color = ink, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(has, color = Color(0xFF6B665C), fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.size(24.dp).clip(CircleShape).border(2.dp, if (on) ink else Color(0xFFDDD5C5), CircleShape).background(if (on) ink else Color.Transparent), contentAlignment = Alignment.Center) {
            if (on) Text("✓", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
        }
    }
}

/* ======================= Sporing: husstandens nøkler ======================= */

/** Innstillinger → Integrasjoner → SPORING · DELT I HUSSTANDEN: én rad per leverandør, maskert nøkkel, Endre/Fjern for admin. */
@Composable
internal fun TrkKeys37Section(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    LaunchedEffect(vm.account?.id) { vm.loadTrkKeys37() }
    val k = s.trk ?: return
    if (s.trkMissing || k.providers.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.Bottom) {
            Text("SPORING · DELT I HUSSTANDEN", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.26.sp, modifier = Modifier.weight(1f))
            if (!k.admin) Text("Administreres av admin", color = p.mut, fontSize = 12.sp)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card)) {
            k.providers.forEachIndexed { i, pr ->
                if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().heightIn(min = 58.dp).clickable(enabled = k.admin) { s.trkEdit = pr.id }.padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val dot = when { !pr.set -> p.line; pr.status == "ok" -> p.pos; pr.status == "quota" -> Color(0xFFC88A1E); else -> p.lab }
                    Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
                    Column(Modifier.weight(1f)) {
                        Text(pr.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp, maxLines = 1)
                        Text(if (!pr.set) "Ikke satt opp" else "Delt i husstanden" + (pr.addedBy?.let { " · lagt inn av $it" } ?: ""), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (pr.set) Text("••••" + (pr.tail ?: ""), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                    if (k.admin) Text("Endre ›", color = p.mut, fontSize = 13.sp)
                }
            }
        }
        val q = k.quotaText?.let { "$it." } ?: if (k.limit != null && k.mine != null) "Du har brukt ${k.mine} av husstandens ${k.limit} oppslag denne måneden" + (k.perUserPct?.let { " · maks $it % per bruker" } ?: "") + "." else null
        Text(listOfNotNull("Nøklene deles i husstanden, så alle kan spore uten egne nøkler. Sporingsnumre og pakker er alltid private.", q).joinToString(" "),
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
    s.trkEdit?.let { id -> k.providers.firstOrNull { it.id == id }?.let { TrkKeySheet37(vm, it) } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrkKeySheet37(vm: AppViewModel, pr: TrkKey37) {
    val p = PaperPal.current
    var key by remember(pr.id) { mutableStateOf("") }
    var sure by remember(pr.id) { mutableStateOf(false) }
    val close = { vm.p37.trkEdit = null }
    ModalBottomSheet(onDismissRequest = close, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(18.dp, 0.dp, 18.dp, 26.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif(pr.name, 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Lukk", "secondary", onClick = close)
            }
            Text(if (pr.set) "Nåværende nøkkel: ••••${pr.tail ?: ""}. Den vises aldri i klartekst." else "Legg inn nøkkelen én gang, så kan alle i husstanden spore.", color = p.mut, fontSize = 13.sp)
            PField("Ny API-nøkkel", key, { key = it.trim() }, placeholder = "Lim inn nøkkelen", password = true, keyboard = KeyboardOptions.Default)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (pr.set) PButton(if (sure) "Trykk igjen for å fjerne" else "Fjern", Modifier.weight(1f), kind = "line") { if (sure) vm.putTrkKey37(pr.id, null) else sure = true }
                PButton(if (vm.p37.trkBusy) "Lagrer …" else "Lagre", Modifier.weight(1f)) { if (key.isNotBlank() && !vm.p37.trkBusy) vm.putTrkKey37(pr.id, key) }
            }
        }
    }
}

/** Sporing-siden: «Bruker husstandens ParcelsApp-nøkkel · 17 oppslag igjen». */
@Composable
internal fun TrkLine37(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { if (vm.p37.trk == null) vm.loadTrkKeys37() }
    val t = vm.trkLine37() ?: return
    Text(t, color = PaperPal.current.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(8.dp, 6.dp))
}

/* ======================= «Hvor er …» ======================= */

/** «Vis på kart ›» i svarboblen (åpner Familie med personen valgt). */
@Composable
internal fun WhereOpen37(vm: AppViewModel, person: String) {
    Box(Modifier.height(32.dp).clip(CircleShape).background(Color.White.copy(alpha = .14f)).clickable(role = Role.Button) { Haptics.select(); vm.openWhere37(person) }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text("Vis på kart ›", color = Color.White, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
    }
}

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

/* ======================= Konto → Profil ======================= */

@Composable
internal fun ProfileLink37(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p37
    LaunchedEffect(vm.account?.id) { vm.loadProfiles37() }
    if (profilesMissing37 && s.profiles.isEmpty()) return
    val mine = s.profiles.firstOrNull { it.id == s.obMine }
    PCard(Modifier.padding(top = 8.dp)) {
        PRow("Profil", when {
            mine != null -> "Koblet til ${mine.name}" + if (s.obLocked) " · admin styrer koblingen" else ""
            s.obLocked -> "Ikke koblet · admin kobler deg til en profil"
            else -> "Ikke koblet til en profil i husstanden"
        }, if (mine == null && !s.obLocked) "Koble ›" else "", serif = false) { if (mine == null && !s.obLocked) vm.reopenOnboard37() }
    }
}
