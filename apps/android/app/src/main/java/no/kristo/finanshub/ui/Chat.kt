package no.kristo.finanshub.ui

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import no.kristo.finanshub.ChatFact41

/* ======================= Chat → Legg ved ======================= */

/** «Legg ved»: grep-strek, tittel + ✕ på samme linje, tre fliser (Kamera · Bilder · Filer), kunnskapsbase-rad og fotnote. */
@Composable
internal fun ChatAttach28(vm: AppViewModel, v: ChatV27, close: () -> Unit, camera: () -> Unit, images: () -> Unit, files: () -> Unit, kb: () -> Unit) {
    val s = vm.chat27
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Box(Modifier.size(36.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(v.line)) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Legg ved", color = v.ink, fontFamily = v.head, fontWeight = FontWeight.Medium, fontSize = 24.sp, lineHeight = 26.sp, modifier = Modifier.weight(1f), maxLines = 1)
        Box(Modifier.size(36.dp).clip(CircleShape).background(v.card).press24(onClick = close).ch27Label("Lukk"), contentAlignment = Alignment.Center) {
            WxIcon(IC_X28, v.ink, 14.dp, stroke = 2.6f)
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple("Kamera", "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", camera),
            Triple("Bilder", "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9h.01", images),
            Triple("Filer", "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", files),
        ).forEach { (n, ic, go) ->
            Column(
                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(v.card).press24(onClick = go).ch27Label(n).padding(start = 6.dp, end = 6.dp, top = 16.dp, bottom = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(v.bg), contentAlignment = Alignment.Center) { WxIcon(ic, v.ink, 23.dp, stroke = 1.8f) }
                Text(n, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
            }
        }
    }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(18.dp)).background(v.card).press24(onClick = kb).padding(start = 9.dp, top = 9.dp, end = 14.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(v.bg), contentAlignment = Alignment.Center) {
            WxIcon("M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6", v.ink, 23.dp, stroke = 1.8f)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Fra kunnskapsbasen", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
            Text(s.kb?.let { "${it.size} dokumenter" } ?: "Dokumenter på serveren", color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 1)
        }
        WxIcon(IC_CHEV28, v.mut, 16.dp, stroke = 2.2f)
    }
    Text("Bilder leses av en bildemodell, f.eks. qwen2.5vl. Filer kan være PDF, Word, tekst eller CSV.", color = v.mut, fontFamily = v.sans, fontSize = 12.sp, lineHeight = 17.sp,
        modifier = Modifier.padding(horizontal = 4.dp))
}

/* ---------------- Chat: «Kvitteringer og skanninger» ---------------- */

/** Mappen øverst under MAPPER: rødt kvitteringsikon, antall og «· N til godkjenning». Lukket som standard; kan ikke slettes eller gis nytt navn. */
@Composable
internal fun ScanFolderRow34(vm: AppViewModel, ink: Color, sans: androidx.compose.ui.text.font.FontFamily, row: @Composable (ChatRow27) -> Unit) {
    val f = vm.p34.scanFolder ?: return
    val s = vm.chat27
    val open = s.folderOpen[f.id] ?: false
    Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).press24 { Haptics.select(); s.folderOpen = s.folderOpen + (f.id to !open) }.padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (open) "▾" else "▸", color = ink.copy(alpha = .6f), fontSize = 11.sp, modifier = Modifier.width(12.dp))
        WxIcon("M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4", Color(0xFFB23A2A), 17.dp, stroke = 1.9f)
        val rv = vm.p34.scanReview
        Text("${f.name} · ${f.chats.size}" + if (rv > 0) " · $rv til godkjenning" else "", color = ink, fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 14.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (open) f.chats.forEach { row(it) }
}

/* ======================= Chat: modellknappen ======================= */

/** ‹ · ☰ · [Modellnavn] [LOKAL/SKY] ▾ – minst 112 dp, navnet forkortes med «…», «· laster …» / rød prikk. */
@Composable
internal fun ChatModelPill39(vm: AppViewModel, v: ChatV27) {
    LaunchedEffect(Unit) { vm.loadChatRoute39() }
    val s = vm.chat27
    val m = vm.chatModelShow39()
    val label = m?.label ?: if (s.unavailable) "Ikke satt opp" else "Velg modell"
    Row(
        Modifier.widthIn(min = 112.dp).height(40.dp).clip(CircleShape).press24 { s.sheet = "model" }.padding(horizontal = 12.dp)
            .semantics { contentDescription = "Valgt modell: $label" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(label, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 16.sp,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        if (m != null) {
            if (m.state == "laster") Text("laster …", color = v.mut, fontFamily = v.sans, fontSize = 12.sp, maxLines = 1)
            Ch27Badge(m.sky)
            if (m.state == "feil") Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFFB23A2A)))
        }
        Text("▼", color = v.mut, fontSize = 11.sp)
    }
}

/** Under meldingsfeltet: «Svarer med Gemma 4 · lokal» (sky: hvor meldingen sendes). Trykk = modellvelgeren. */
@Composable
internal fun ChatAnswersWith39(vm: AppViewModel, v: ChatV27, m: ChatModel27?, modifier: Modifier) {
    val sh = vm.chatModelShow39() ?: return
    val where = if (sh.sky) "sky · sendes til ${if (m?.provider == "groq" || sh.label.contains("groq", true)) "Groq" else "Google"}" else "lokal"
    Text("Svarer med ${sh.label} · $where", color = v.mut, fontFamily = v.sans, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { vm.chat27.sheet = "model" }.padding(horizontal = 8.dp, vertical = 2.dp))
}

/* ======================= Søkepillen vokser inn i Chat ======================= */

/** Starter animasjonen fra pillens ramme (p38.ansRect). Uten ramme: rett til Chat. */
internal fun AppViewModel.growToChat41(q: String) {
    val r = p38.ansRect
    if (r == null) { openChatWith41(q); return }
    p41.grow = r to q
}

/**
 * Pillen vokser fra sin egen ramme til fullskjerm på 0,4 s (hjørner 26 → 0, mørk glass → appens bakgrunn). Pilleinnholdet tones ut
 * på 0,15 s, Chat-innholdet (Glimt-tittel, spørsmålet som din boble, «skriver»-prikker) tones inn etter 0,12 s. Ved 0,4 s: ekte Chat.
 * Redusert bevegelse: 0,2 s krysstoning.
 */
@Composable
internal fun PillGrow41(vm: AppViewModel) {
    val g = vm.p41.grow ?: return
    val p = PaperPal.current
    val reduce = reduceMotion31()
    val t = remember(g) { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(g) {
        t.animateTo(1f, tween(if (reduce) 200 else 400, easing = androidx.compose.animation.core.CubicBezierEasing(.2f, .8f, .2f, 1f)))
        vm.openChatWith41(g.second)
        delay(80)
        vm.p41.grow = null
    }
    val dens = androidx.compose.ui.platform.LocalDensity.current.density
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val W = constraints.maxWidth.toFloat(); val H = constraints.maxHeight.toFloat()
        val k = if (reduce) 1f else t.value
        val r = g.first
        val l = r.left * (1 - k); val tp = r.top * (1 - k); val w = r.width + (W - r.width) * k; val h = r.height + (H - r.height) * k
        val bg = androidx.compose.ui.graphics.lerp(Color(0xF0161412), p.bg, k)
        Box(Modifier.offset(x = (l / dens).dp, y = (tp / dens).dp).size((w / dens).dp, (h / dens).dp)
            .graphicsLayer { alpha = if (reduce) t.value else 1f }
            .clip(RoundedCornerShape((26f * (1 - k)).dp)).background(bg)) {
            Text("Åpner i Chat …", color = Color.White.copy(alpha = (1f - t.value / .375f).coerceIn(0f, 1f)), fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                modifier = Modifier.padding(18.dp))
            val inA = ((t.value - .3f) / .7f).coerceIn(0f, 1f)
            Column(Modifier.fillMaxSize().statusBarsPadding().padding(18.dp).graphicsLayer { alpha = inA }, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("✦ Glimt", color = p.ink, fontFamily = PaperFonts.serif, fontSize = 22.sp)
                Box(Modifier.align(Alignment.End).clip(RoundedCornerShape(18.dp)).background(p.ink).padding(14.dp, 10.dp)) {
                    Text(g.second, color = p.bg, fontSize = 15.sp)
                }
                Text("• • •", color = p.mut, fontSize = 18.sp)
            }
        }
    }
}

/** Fargene i Chat: Papir eller Nøytral (designets --cb, --cc, --ci, --cm, --cl, --ca, --cs, --cub, --cuI). */
internal class ChatV27(
    val bg: Color, val card: Color, val ink: Color, val mut: Color, val line: Color, val acc: Color, val side: Color, val ub: Color, val uI: Color,
    val sans: FontFamily, val head: FontFamily,
)

internal fun chatV27(theme: String): ChatV27 {
    val p = PaperPal.current
    return if (theme == "noytral") ChatV27(Color(0xFF212121), Color(0xFF2F2F2F), Color(0xFFECECEC), Color(0xFFA3A3A3), Color(0xFF3A3A3A), Color(0xFFECECEC),
        Color(0xFF171717), Color(0xFF303030), Color(0xFFECECEC), FontFamily.Default, FontFamily.Default)
    else ChatV27(p.bg, p.card, p.ink, p.mut, p.line, p.lab, if (Tone.paperDark) Color(0xFF1B1A15) else Color(0xFFEBE6DA), p.ink, p.bg, PaperFonts.sans, PaperFonts.serif)
}

internal val CH27_LOCAL = Color(0xFF2F7A4F)

internal val CH27_SKY = Color(0xFFB23A2A)

internal object ChIc27 {
    const val NEW = "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
    const val CLEAR = "M6 6l12 12M18 6L6 18"
    const val FOLDER = "M3 6h6l2 2h10v11H3z"
    const val MODELS = "M5 5h14v14H5zM9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"
    const val KB = "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"
    const val THEME = "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"
    const val MENU = "M4 7h16M4 12h16M4 17h10"
    const val PARAMS = "M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0"
    const val COPY = "M9 9h11v11H9zM5 15H4V4h11v1"
    const val REGEN = "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"
    const val SPEAK = "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7"
    const val PLUS = "M12 5v14M5 12h14"
    const val WEB = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"
    const val DATA = "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"
    const val MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"
    const val SEND = "M12 19V5M5 12l7-7 7 7"
    const val SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.6-3.6"
}

internal fun Modifier.ch27Label(label: String): Modifier = this.semantics { contentDescription = label }

@Composable
internal fun Ch27Mono(text: String, color: Color, size: androidx.compose.ui.unit.TextUnit = 10.5.sp, modifier: Modifier = Modifier) =
    Text(text, color = color, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = size, letterSpacing = 1.2.sp, maxLines = 1,
        overflow = TextOverflow.Ellipsis, modifier = modifier)

/** LOKAL (grønn) / SKY (rød). */
@Composable
internal fun Ch27Badge(sky: Boolean) {
    Box(Modifier.clip(RoundedCornerShape(6.dp)).background(if (sky) CH27_SKY else CH27_LOCAL).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text(if (sky) "SKY" else "LOKAL", color = Color.White, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 9.5.sp, letterSpacing = .8.sp, maxLines = 1)
    }
}

@Composable
private fun Ch27IconBtn(path: String, v: ChatV27, label: String, size: Dp = 44.dp, icon: Dp = 21.dp, onClick: () -> Unit) {
    Box(Modifier.size(size).clip(CircleShape).press24(onClick = onClick).ch27Label(label), contentAlignment = Alignment.Center) { WxIcon(path, v.ink, icon, stroke = 1.9f) }
}

/* ---------------- Siden ---------------- */

@Composable
internal fun ChatScreen27(vm: AppViewModel) {
    val s = vm.chat27
    val v = chatV27(s.theme)
    BackHandler { vm.closeChat27() }
    // Prompt 50: hele chatten tar imot filer som dras inn (Fold/nettbrett), se ui/Chat50Ui.kt.
    BoxWithConstraints(Modifier.fillMaxSize().background(v.bg).chatDrop50(vm)) {
        val wide = maxWidth >= 600.dp
        Row(Modifier.fillMaxSize()) {
            if (wide) Ch27Side(vm, v, true, Modifier.width(288.dp).fillMaxHeight().background(v.side).statusBarsPadding().navigationBarsPadding())
            if (wide) Box(Modifier.width(1.dp).fillMaxHeight().background(v.line))
            Ch27Main(vm, v, wide, Modifier.weight(1f).fillMaxHeight())
        }
        if (!wide && s.drawer) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .42f)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { s.drawer = false })
            Ch27Side(vm, v, false, Modifier.fillMaxHeight().widthIn(max = 320.dp).fillMaxWidth(.86f).background(v.side).statusBarsPadding().navigationBarsPadding())
        }
        Ch27Sheets(vm, v, wide)
        ChatDropLayer50(v) // prompt 50: «Slipp for å legge ved»
        ChatLightbox50(vm) // prompt 50: lysboks for bildene
        // Meldinger fra appen (eksport, deling, nedlasting) vises over chatten.
        vm.message?.let { msg ->
            LaunchedEffect(msg) { delay(2600); if (vm.message == msg) vm.message = null }
            Box(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 56.dp, start = 16.dp, end = 16.dp).shadow(12.dp, CircleShape).clip(CircleShape).background(v.ink).padding(16.dp, 10.dp)) {
                Text(msg, color = v.bg, fontFamily = v.sans, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
            }
        }
    }
}

/* ---------------- Historikken (sidepanel eller skuff) ---------------- */

@Composable
private fun Ch27Side(vm: AppViewModel, v: ChatV27, wide: Boolean, modifier: Modifier) {
    val s = vm.chat27
    Column(modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}) {
        Row(Modifier.fillMaxWidth().padding(start = if (wide) 6.dp else 16.dp, top = 8.dp, end = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (wide) Box(Modifier.size(40.dp).clip(CircleShape).press24 { vm.closeChatAll27() }.ch27Label("Tilbake"), contentAlignment = Alignment.Center) { Text("‹", color = v.ink, fontSize = 28.sp) }
            Text("Chat", color = v.ink, fontFamily = v.head, fontWeight = FontWeight.Medium, fontSize = 25.sp, modifier = Modifier.weight(1f))
            Ch27IconBtn(ChIc27.NEW, v, "Ny chat", 42.dp) { vm.newChat27() }
        }
        // Søk med ✕ til venstre (26 px sirkel), fokus blir i feltet.
        Row(Modifier.padding(start = 10.dp, end = 10.dp, bottom = 6.dp).fillMaxWidth().height(42.dp).clip(CircleShape).background(v.card).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (s.q.isEmpty()) WxIcon(ChIc27.SEARCH, v.mut, 17.dp, stroke = 2.2f)
            else Box(Modifier.offset(x = (-8).dp).size(36.dp).clip(CircleShape).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.searchChats27("") }.ch27Label("Tøm søket"),
                contentAlignment = Alignment.Center) {
                Box(Modifier.size(26.dp).clip(CircleShape).background(Color(0x387F7F7F)), contentAlignment = Alignment.Center) { WxIcon(ChIc27.CLEAR, v.ink, 11.dp, stroke = 3.2f) }
            }
            Box(Modifier.weight(1f).offset(x = if (s.q.isEmpty()) 0.dp else (-8).dp), contentAlignment = Alignment.CenterStart) {
                if (s.q.isEmpty()) Text("Søk i samtaler", color = v.mut, fontSize = 14.5.sp, fontFamily = v.sans, maxLines = 1)
                BasicTextField(s.q, { vm.searchChats27(it) }, singleLine = true, textStyle = TextStyle(color = v.ink, fontSize = 14.5.sp, fontFamily = v.sans),
                    cursorBrush = SolidColor(v.ink), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), modifier = Modifier.fillMaxWidth())
            }
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 8.dp, end = 8.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val found = s.found
            if (found != null) {
                Ch27Group("TREFF · ${found.size}", v)
                found.forEach { Ch27ChatRow(vm, v, it) }
            } else {
                if (s.pinned.isNotEmpty()) { Ch27Group("FESTET", v); s.pinned.forEach { Ch27ChatRow(vm, v, it) } }
                if (s.folders.isNotEmpty() || vm.p34.scanFolder != null) {
                    Ch27Group("MAPPER", v)
                    // Prompt 34: systemmappen «Kvitteringer og skanninger» øverst (ui/Ui34.kt).
                    ScanFolderRow34(vm, v.ink, v.sans) { Ch27ChatRow(vm, v, it) }
                    s.folders.forEach { f ->
                        val open = s.folderOpen[f.id] ?: f.open
                        Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(12.dp)).press24 { vm.toggleFolder27(f) }.padding(horizontal = 10.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (open) "▾" else "▸", color = v.mut, fontSize = 11.sp, modifier = Modifier.width(12.dp))
                            WxIcon(ChIc27.FOLDER, v.ink, 17.dp, stroke = 1.9f)
                            Text("${f.name} · ${f.chats.size}", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (open) f.chats.forEach { Ch27ChatRow(vm, v, it) }
                    }
                }
                chatGroups27(s.chats).forEach { (t, l) -> Ch27Group(t, v); l.forEach { Ch27ChatRow(vm, v, it) } }
                if (s.listLoaded && s.pinned.isEmpty() && s.folders.isEmpty() && s.chats.isEmpty() && vm.p34.scanFolder == null)
                    Text(if (s.unavailable) "Chat er ikke satt opp på serveren ennå." else "Ingen samtaler ennå.", color = v.mut, fontSize = 14.sp, fontFamily = v.sans, modifier = Modifier.padding(10.dp, 20.dp))
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(v.line))
        Column(Modifier.padding(start = 8.dp, top = 6.dp, end = 8.dp, bottom = 12.dp)) {
            val loc = s.models.count { !it.sky && it.installed }
            val sky = s.models.count { it.sky }
            // Prompt 34: Modeller åpner AI-kontroll på fanen Modeller (det gamle Modeller-arket brukes ikke lenger).
            Ch27SideRow(v, ChIc27.MODELS, "Modeller", "$loc lokale · $sky i skyen") { s.drawer = false; vm.openAiCtl34("mod") }
            Ch27SideRow(v, ChIc27.KB, "Kunnskapsbase", s.kb?.let { "${it.size} dokumenter" } ?: "Dokumenter") { s.drawer = false; vm.loadKb27(); s.sheet = "kb" }
            Ch27SideRow(v, ChIc27.THEME, "Tema", if (s.theme == "noytral") "Nøytral" else "Papir") { vm.setChatTheme27(if (s.theme == "noytral") "papir" else "noytral") }
            Text("Historikken synkes mellom mobil og web.", color = v.mut, fontSize = 11.5.sp, fontFamily = v.sans, modifier = Modifier.padding(start = 10.dp, top = 6.dp, end = 10.dp))
        }
    }
}

private fun AppViewModel.closeChatAll27() {
    val s = chat27
    s.sheet = null; s.drawer = false; s.editIdx = null
    closeChat27()
}

@Composable
private fun Ch27Group(t: String, v: ChatV27) = Ch27Mono(t, v.mut, modifier = Modifier.padding(start = 10.dp, top = 14.dp, end = 10.dp, bottom = 4.dp))

@Composable
private fun Ch27SideRow(v: ChatV27, ic: String, t: String, sub: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(12.dp)).press24(onClick = onClick).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        WxIcon(ic, v.ink, 19.dp, stroke = 1.9f)
        Text(t, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, modifier = Modifier.weight(1f))
        Text(sub, color = v.mut, fontFamily = v.sans, fontSize = 12.5.sp, maxLines = 1)
    }
}

@Composable
private fun Ch27ChatRow(vm: AppViewModel, v: ChatV27, r: ChatRow27) {
    val s = vm.chat27
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(RoundedCornerShape(14.dp)).background(if (r.id == s.curId) v.card else Color.Transparent)
            .press24 { vm.openChatId27(r.id) }.padding(start = 12.dp, top = 4.dp, end = 2.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(r.title, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOf(s.modelLabel27(r.model), chatRel27(r.updatedAt)).filter { it.isNotBlank() }.joinToString(" · "), color = v.mut, fontFamily = v.sans, fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.size(40.dp).clip(CircleShape).press24 { s.menuId = r.id; s.rn = r.title; s.delArm = false; s.nf = ""; s.sheet = "menu" }.ch27Label("Valg for samtalen"),
            contentAlignment = Alignment.Center) { Text("⋯", color = v.mut, fontSize = 18.sp) }
    }
}

/* ---------------- Samtalen ---------------- */

@Composable
private fun Ch27Main(vm: AppViewModel, v: ChatV27, wide: Boolean, modifier: Modifier) {
    val s = vm.chat27
    val m = s.curModel27()
    Column(modifier.statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 10.dp, top = 6.dp, end = 10.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (!wide) {
                Box(Modifier.size(44.dp).clip(CircleShape).press24 { vm.closeChatAll27() }.ch27Label("Tilbake"), contentAlignment = Alignment.Center) { Text("‹", color = v.ink, fontSize = 28.sp) }
                Ch27IconBtn(ChIc27.MENU, v, "Historikk") { s.drawer = true }
            }
            // Prompt 39 (claude-code-android-chat-modell.md): før delte modellknappen (weight 1, fill = false) og Spaceren (weight 1)
            // restplassen likt, så på 360 dp fikk knappen ~80 dp, og etter merket og ▼ ble navnet presset til 0 («…»). Nå fyller en
            // boks all restplass, knappen er minst 112 dp, og navnet vises med en gang (rutingen) mens listen hentes.
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) { ChatModelPill39(vm, v) }
            Ch27IconBtn(ChIc27.PARAMS, v, "Samtaleinnstillinger") { s.sheet = "params" }
            if (!wide && LocalContext.current.resources.configuration.screenWidthDp >= 340) Ch27IconBtn(ChIc27.NEW, v, "Ny chat") { vm.newChat27() }
        }
        Ch27Messages(vm, v, m, Modifier.weight(1f).fillMaxWidth())
        Ch27Composer(vm, v, m)
    }
}

/** Svaret delt i blokker: avsnitt, punkter («•», «1.»), overskrifter (fet) og kodeblokker (mono på kort). **fet** tekst støttes. */
private class Ch27Blk(val code: Boolean, val mk: String, val text: AnnotatedString, val table: List<String>? = null)

private fun ch27Inline(t: String, bold: Boolean): AnnotatedString = buildAnnotatedString {
    t.replace("`", "").split("**").forEachIndexed { i, x -> if (i % 2 == 1 || bold) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(x) } else append(x) }
}

private fun ch27Blocks(t: String): List<Ch27Blk> {
    val out = ArrayList<Ch27Blk>()
    var code: MutableList<String>? = null
    t.split('\n').forEach { l ->
        if (l.trimStart().startsWith("```")) {
            val c = code
            if (c != null) { out.add(Ch27Blk(true, "", AnnotatedString(c.joinToString("\n")))); code = null } else code = ArrayList()
            return@forEach
        }
        code?.let { it.add(l); return@forEach }
        // Prompt 50: markdown-tabeller (kvittering i chat: | Vare | Antall | Pris |) samles til én tabellblokk.
        if (isTableLine50(l)) {
            val last = out.lastOrNull()
            if (last?.table != null) out[out.lastIndex] = Ch27Blk(false, "", last.text, last.table + l) else out.add(Ch27Blk(false, "", AnnotatedString(""), listOf(l)))
            return@forEach
        }
        if (l.isBlank()) return@forEach
        val li = Regex("^\\s*[-*•]\\s+(.*)").find(l)
        val nu = Regex("^\\s*(\\d+)[.)]\\s+(.*)").find(l)
        val hd = Regex("^#+\\s+(.*)").find(l)
        when {
            li != null -> out.add(Ch27Blk(false, "•", ch27Inline(li.groupValues[1], false)))
            nu != null -> out.add(Ch27Blk(false, nu.groupValues[1] + ".", ch27Inline(nu.groupValues[2], false)))
            hd != null -> out.add(Ch27Blk(false, "", ch27Inline(hd.groupValues[1], true)))
            else -> out.add(Ch27Blk(false, "", ch27Inline(l, false)))
        }
    }
    code?.let { out.add(Ch27Blk(true, "", AnnotatedString(it.joinToString("\n")))) }
    return out
}

@Composable
private fun Ch27Body(v: ChatV27, text: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ch27Blocks(text).forEach { b ->
            if (b.table != null) ChatTable50(v, b.table)
            else if (b.code) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(v.card).horizontalScroll(rememberScrollState()).padding(12.dp, 10.dp)) {
                Text(b.text, color = v.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp, lineHeight = 20.sp, softWrap = false)
            } else Row(Modifier.padding(top = if (b.mk.isNotEmpty()) 0.dp else 0.dp).offset(y = if (b.mk.isNotEmpty()) (-6).dp else 0.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (b.mk.isNotEmpty()) Text(b.mk, color = v.mut, fontFamily = v.sans, fontSize = 15.5.sp, lineHeight = 25.sp, modifier = Modifier.widthIn(min = 16.dp))
                Text(b.text, color = v.ink, fontFamily = v.sans, fontSize = 15.5.sp, lineHeight = 25.sp, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Ch27Chips(v: ChatV27, prefix: String, l: List<String>) {
    l.forEach { n ->
        Box(Modifier.height(24.dp).clip(CircleShape).background(v.card).padding(horizontal = 9.dp), contentAlignment = Alignment.Center) {
            Text("$prefix $n", color = v.mut, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, maxLines = 1)
        }
    }
}

@Composable
private fun Ch27Act(v: ChatV27, icon: String?, label: String, onClick: () -> Unit) {
    Row(Modifier.height(34.dp).clip(CircleShape).press24(onClick = onClick).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        icon?.let { WxIcon(it, v.mut, 15.dp, stroke = 1.9f) }
        Text(label, color = v.mut, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Ch27Messages(vm: AppViewModel, v: ChatV27, m: ChatModel27?, modifier: Modifier) {
    val s = vm.chat27
    val clip = LocalClipboardManager.current
    val list = rememberLazyListState()
    val n = s.msgs.size + (if (s.busy) 1 else 0)
    LaunchedEffect(s.curId, n, s.stream.length / 80) { if (n > 0) runCatching { list.scrollToItem(n - 1, Int.MAX_VALUE / 2) } }
    // Prompt 30: skriveboksen ligger over tastaturet (imePadding på composeren); når tastaturet åpnes scrolles meldingene til bunnen.
    val imeUp = androidx.compose.foundation.layout.WindowInsets.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current) > 0
    LaunchedEffect(imeUp) { if (imeUp && n > 0) runCatching { list.animateScrollToItem(n - 1, Int.MAX_VALUE / 2) } }
    val lastA = s.msgs.indexOfLast { it.role == "assistant" }
    // Prompt 28: trykk hvor som helst i meldingsområdet skjuler tastaturet (knapper og lenker får trykket først).
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    val kb = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    LazyColumn(modifier.pointerInput(Unit) { detectTapGestures { focus.clearFocus(); kb?.hide() } }, state = list, contentPadding = PaddingValues(start = 18.dp, top = 10.dp, end = 18.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        if (s.msgs.isEmpty() && !s.busy) item(key = "empty") { Ch27Empty(vm, v, m) }
        itemsIndexed(s.msgs, key = { i, _ -> "${s.curId}:$i" }) { i, msg ->
            val key = "${s.curId}:$i"
            Box(Modifier.fillMaxWidth().widthIn(max = 760.dp)) {
                if (msg.role == "user") Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (msg.att.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        msg.att.forEach { a ->
                            Box(Modifier.height(28.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                                Text("# $a", color = v.mut, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1)
                            }
                        }
                    }
                    ChatThumbs52(vm, v, msg.files50) // prompt 52: miniatyrer 96 × 120 over boblen (trykk = lysboks)
                    if (s.editIdx == i) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(v.card).border(1.5.dp, v.ink, RoundedCornerShape(20.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            BasicTextField(s.editText, { s.editText = it }, textStyle = TextStyle(color = v.ink, fontSize = 15.5.sp, lineHeight = 22.sp, fontFamily = v.sans),
                                cursorBrush = SolidColor(v.ink), minLines = 3, modifier = Modifier.fillMaxWidth().padding(4.dp, 6.dp))
                            Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.height(38.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).press24 { s.editIdx = null }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                                    Text("Avbryt", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                                }
                                Box(Modifier.height(38.dp).clip(CircleShape).background(v.ink).press24 { vm.saveEditChat27() }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                                    Text("Lagre og send", color = v.bg, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                                }
                            }
                        }
                    } else {
                        if (msg.content.isNotBlank() || msg.files50.isEmpty()) Box(Modifier.fillMaxWidth(.84f).wrapContentWidth(Alignment.End).clip(RoundedCornerShape(22.dp, 22.dp, 6.dp, 22.dp)).background(v.ub).padding(16.dp, 11.dp)) {
                            Text(msg.content, color = v.uI, fontFamily = v.sans, fontSize = 15.5.sp, lineHeight = 22.sp)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            Ch27Act(v, null, "Rediger") { if (!s.busy) { s.editIdx = i; s.editText = msg.content } }
                            Ch27Act(v, null, if (s.copied == key) "Kopiert" else "Kopier") { clip.setText(AnnotatedString(msg.content)); vm.chatCopied27(key) }
                        }
                    }
                } else {
                  // Prompt 39: hold inne på svaret → modellen nederst («Gemma 4 · 1,2 s · lokal»).
                  var showModel by remember { mutableStateOf(false) }
                  Column(Modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures(onLongPress = { Haptics.select(); showModel = !showModel }) },
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        // Prompt 31: verktøysvar fra Glimt har merket (Ferdig) og verktøy-chip («Vær», «Kalender» …).
                        if (msg.tool != null || msg.model == "Glimt") Row(Modifier.align(Alignment.CenterVertically), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            GlimtMark31(18.dp, GLIMT_KLAR)
                            Ch27Mono("GLIMT", v.acc)
                        } else Ch27Mono("✦ " + (msg.model?.let { s.modelLabel27(it) } ?: "").uppercase(), v.acc, modifier = Modifier.align(Alignment.CenterVertically))
                        msg.tool?.let { Ch27Chips(v, "⚙", listOf(it)) }
                        // Prompt 50: bilder fra meldingen før blir en liten miniatyr + filnavn (trykk = lysboks).
                        val imgs50 = s.msgs.getOrNull(i - 1)?.takeIf { it.role == "user" }?.files50?.filter { it.isImage }.orEmpty()
                        val used50 = usedWithoutFacts41(msg.used, msg.facts)
                        imgs50.forEachIndexed { k, f -> if (f.name in used50 || msg.readWith50 != null) ChatFilePill50(vm, v, imgs50, k) }
                        Ch27Chips(v, "Brukte", used50.filter { n -> imgs50.none { it.name == n } })
                    }
                    ThinkSaved52(v, key, msg.think52, msg.thS52) // prompt 52: «✦ Tenkte i 2,1 s ›»
                    Ch27Body(v, msg.content)
                    ChatFinBtn50(vm, v, key, msg.finUrl50) // prompt 50: «Legg i Finans ›»
                    ChatReadWith50(v, msg.readWith50) // prompt 50: «Lest med …»
                    // Prompt 41: faktakort (vær, tid, sol) under svaret.
                    if (msg.facts.isNotEmpty()) ChatFacts41(v, msg.facts)
                    msg.card?.let { ChatCard31(vm, it, v) }
                    // Prompt 67: valgknapper og bekreftelse under det siste Glimt-svaret.
                    if (i == lastA && !s.busy) msg.choices67?.let { ch ->
                        // Prompt 70: «Velg dato» → datovelger i kortet; valgt dato sendes som ny tekst (uten choice).
                        Cal70Choices(ch, v.ink, v.card, v.line, v.sans, { vm.pickChat67(ch, it) }) { t -> vm.pickChat67(ch, no.kristo.finanshub.ChoiceItem67("", t, t)) }
                    }
                    if (i == lastA && !s.busy) msg.confirm67?.let { cf ->
                        if (cf.summary.isNotBlank() && cf.summary != "Ja, gjør det" && !msg.content.contains(cf.summary)) Text(cf.summary, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Confirm67Row(v.ink, v.bg, v.line, v.sans, { vm.confirmChat67(i, true) }, { vm.confirmChat67(i, false) })
                    }
                    if (showModel) {
                        val mm = msg.model?.let { k -> s.models.firstOrNull { it.id == k } }
                        val where = when { msg.model == "Glimt" || msg.tool != null -> "Glimt"; mm?.sky == true -> "sky"; mm != null -> "lokal"; else -> null }
                        Text(listOfNotNull(msg.model?.let { s.modelLabel27(it) } ?: "Ukjent modell", msg.stats?.takeIf { it.isNotBlank() }, where).joinToString(" · "),
                            color = v.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(v.card).padding(horizontal = 10.dp, vertical = 5.dp))
                    }
                    FlowRow(Modifier.offset(x = (-8).dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Ch27Act(v, ChIc27.COPY, if (s.copied == key) "Kopiert" else "Kopier") { clip.setText(AnnotatedString(msg.content)); vm.chatCopied27(key) }
                        if (i == lastA && !s.busy) Ch27Act(v, ChIc27.REGEN, "Nytt svar") { vm.regenChat27() }
                        Ch27Act(v, ChIc27.SPEAK, if (s.speaking == key) "Stopp" else "Les høyt") { vm.speakChat27(key, msg.content) }
                        // Prompt 67: tommel opp/ned på Glimt-svar (traceId), ikke på stoppede svar.
                        msg.trace67?.takeIf { msg.stats != "Stoppet" }?.let { Box(Modifier.align(Alignment.CenterVertically)) { Thumbs67(vm, it, v.mut, v.bg, v.ink, v.sans) } }
                        msg.stats?.takeIf { it.isNotBlank() }?.let {
                            Text(it, color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 11.sp, modifier = Modifier.align(Alignment.CenterVertically).padding(start = 6.dp))
                        }
                    }
                  }
                }
            }
        }
        if (s.busy) item(key = "busy") {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    // Prompt 31: Glimt-merket (Tenker / Svarer mens teksten strømmer inn) i stedet for «Tenker …»-teksten.
                    Row(Modifier.align(Alignment.CenterVertically), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        GlimtMark31(22.dp, if (s.stream.isEmpty()) GLIMT_TENKER else GLIMT_SVARER)
                        Ch27Mono((if (Glimt67.chatLive) "Glimt" else m?.label ?: "Glimt").uppercase(), v.acc)
                    }
                    Ch27Chips(v, "Leser", s.streamTools)
                }
                // Prompt 67: Glimt strømmer – statuslinja («Sjekker kalenderen …») i stedet for tankegangen.
                if (Glimt67.chatLive) GlimtStatus67(Glimt67.chatStatus ?: if (s.stream.isEmpty()) "Forstår spørsmålet …" else "Skriver svaret …", v.mut, v.sans)
                // Prompt 52: «✦ Tenker … 2,1 s ▾» med stegene (modellens egne, eller Glimts når modellen ikke tenker).
                else ThinkLive52(v, s.stream.isNotEmpty(), localSteps52(s.streamTools.isNotEmpty(), m?.label, s.data && s.myDataOn))
                if (s.stream.isNotEmpty()) Ch27Body(v, s.stream)
                ChatReadWith50(v, Chat50.busyReadWith) // prompt 50
            }
        }
        if (s.loadingChat && s.msgs.isEmpty()) item(key = "load") { Text("Henter samtalen …", color = v.mut, fontFamily = v.sans, fontSize = 14.sp) }
    }
}

fun AppViewModel.chatCopied27(key: String) {
    val s = chat27
    s.copied = key
    Haptics.success()
    launch27 { delay(1400); if (s.copied == key) s.copied = null }
}

@Composable
private fun Ch27Empty(vm: AppViewModel, v: ChatV27, m: ChatModel27?) {
    val s = vm.chat27
    Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val line = when {
                m == null -> if (s.unavailable) "CHAT ER IKKE SATT OPP" else "HENTER MODELLER …"
                m.sky -> (m.name + " · " + m.provider.replaceFirstChar { it.uppercase() } + " · sky").uppercase()
                else -> (m.id + " · lokalt på hjemmeserveren").uppercase()
            }
            Ch27Mono(line, v.acc)
            Text("Hva kan jeg hjelpe med?", color = v.ink, fontFamily = v.head, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 37.sp)
            if (s.unavailable) Text("Serveren har ikke Chat ennå. Oppdater Homelab-serveren.", color = v.mut, fontFamily = v.sans, fontSize = 13.sp)
            s.error?.let { Text(it, color = CH27_SKY, fontFamily = v.sans, fontSize = 13.sp) }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            CHAT27_PERSONAS.forEach { (k, n, _) ->
                val on = s.settings.persona == k
                Box(Modifier.height(36.dp).clip(CircleShape).background(if (on) v.ink else v.card).press24 { vm.setChatSettings27(s.settings.copy(persona = k)) }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center) {
                    Text(n, color = if (on) v.bg else v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CHAT27_SUGG.forEach { (t, sub, data) ->
                Column(
                    Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(18.dp)).border(1.dp, v.line, RoundedCornerShape(18.dp))
                        .press24 { if (data && s.myDataOn) s.data = true; vm.sendChat27(t) }.padding(16.dp, 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                ) {
                    Text(t, color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                    if (sub.isNotEmpty()) Text(sub, color = v.mut, fontFamily = v.sans, fontSize = 12.sp)
                }
            }
        }
    }
}

/* ---------------- Skrivefeltet ---------------- */

@Composable
private fun Ch27Composer(vm: AppViewModel, v: ChatV27, m: ChatModel27?) {
    val s = vm.chat27
    val ctx = LocalContext.current
    // Prompt 56 (AND56): forklaring før tillatelsesdialogen, trykk/hold og serveren som skriver ned (ui/Voice56Ui.kt, Voice56.kt).
    val askMic = rememberMic56(onDenied = { vm.chatToast27("Mikrofonen trenger tillatelse") }) { vm.micChat27(ctx) }
    LaunchedEffect(Unit) { vm.voice56Refresh() }
    val mic56 = s.rec || Voice56.on(Voice56.CHAT)
    Box(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 14.dp)) {
        Column(Modifier.fillMaxWidth().widthIn(max = 760.dp).align(Alignment.Center)) {
            Column(
                Modifier.fillMaxWidth().shadow(10.dp, RoundedCornerShape(26.dp), ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f))
                    .clip(RoundedCornerShape(26.dp)).background(v.card).border(1.dp, v.line, RoundedCornerShape(26.dp)).padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Prompt 50: miniatyrrad (64×64, ×, fremdrift) og «Lim inn bilde» (ui/Chat50Ui.kt).
                ChatAttRow50(vm, v)
                ChatPaste50(vm, v)
                if (Voice56.on(Voice56.CHAT)) VoiceBar56(vm, Voice56.CHAT, v.ink, v.mut, v.sans) // prompt 56
                else if (s.rec) Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(CH27_SKY))
                    Text(s.input.ifBlank { "Lytter … snakk nå" }, color = v.ink, fontFamily = v.sans, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Ch27Wave(s.rms)
                } else Box(Modifier.fillMaxWidth().padding(start = 8.dp, top = 6.dp, end = 8.dp, bottom = 2.dp)) {
                    if (s.input.isEmpty()) Text("Spør ${m?.label ?: "AI"} …", color = v.mut, fontFamily = v.sans, fontSize = 16.sp)
                    BasicTextField(s.input, { s.input = it }, textStyle = TextStyle(color = v.ink, fontSize = 16.sp, lineHeight = 23.sp, fontFamily = v.sans),
                        cursorBrush = SolidColor(v.ink), maxLines = 6, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default), modifier = Modifier.fillMaxWidth())
                }
                // Prompt 43 (claude-code-chat-send-knapp-tom.md): 4 dp luft til høyre / 2 dp under, så knappen og kanten står inne i kortet.
                Row(Modifier.fillMaxWidth().padding(end = 4.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(38.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).press24 { s.sheet = "plus" }.ch27Label("Legg ved"), contentAlignment = Alignment.Center) {
                        WxIcon(ChIc27.PLUS, v.ink, 18.dp, stroke = 2.2f)
                    }
                    // «Nettsøk» og «Mine data» krymper (ellipse) på smale skjermer i stedet for å skyve mikrofon og Send ut.
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Ch27Toggle(v, ChIc27.WEB, "Nettsøk", s.web) { s.web = !s.web; Haptics.select() }
                    Ch27Toggle(v, ChIc27.DATA, "Mine data", s.data && s.myDataOn) {
                        if (!s.myDataOn) vm.chatToast27("Slått av i Innstillinger → AI og tolkning") else { s.data = !s.data; Haptics.select() }
                    }
                    }
                    Box(Modifier.size(38.dp).clip(CircleShape).background(if (mic56) CH27_SKY else Color.Transparent).holdMic56("Snakk (hold inne, eller trykk for start og stopp)",
                        onTap = { Haptics.tap(); if (mic56) vm.micChat27(ctx) else askMic() },
                        onHold = { if (micOk56(ctx)) vm.micChat27(ctx, hold = true) else askMic() },
                        onRelease = { cancel -> vm.releaseChatMic56(cancel) },
                    ), contentAlignment = Alignment.Center) { WxIcon(ChIc27.MIC, if (mic56) Color.White else v.ink, 20.dp, stroke = 1.9f) }
                    if (s.busy) Box(Modifier.size(38.dp).clip(CircleShape).background(v.ink).press24 { vm.stopChat27() }.ch27Label("Stopp"), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(13.dp).clip(RoundedCornerShape(3.dp)).background(v.bg))
                    } else SendBtn43(v, (s.input.isNotBlank() || s.att.isNotEmpty()) && !s.uploading50) { s.voice?.stop(); if (Voice56.on(Voice56.CHAT)) vm.cancelMic56(); vm.sendChat27(s.input) } // prompt 50: av til alt er lastet opp
                }
            }
            if (s.toast.isNotEmpty()) Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp).clip(CircleShape).background(v.ink).padding(14.dp, 9.dp)) {
                Text(s.toast, color = v.bg, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 2)
            } else ChatAnswersWith39(vm, v, m, Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp)) // prompt 39: «Svarer med … · lokal»
        }
    }
}

@Composable
private fun Ch27Toggle(v: ChatV27, ic: String, label: String, on: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(modifier.widthIn(min = 38.dp).height(38.dp).clip(CircleShape).border(1.dp, if (on) v.ink else v.line, CircleShape).background(if (on) v.ink else Color.Transparent).press24(onClick = onClick).padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        WxIcon(ic, if (on) v.bg else v.ink, 15.dp, stroke = 1.9f)
        Text(label, color = if (on) v.bg else v.ink, fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Lydbølgen mens mikrofonen lytter: sju streker som følger lydnivået. */
@Composable
private fun Ch27Wave(rms: Float) = WaveBars71(rms, CH27_SKY, "wave") // prompt 71: én Canvas, pulsen leses i tegnefasen (ui/Anim71.kt)

/**
 * Prompt 43 (claude-code-chat-send-knapp-tom.md): Send-knappen. Tom: lys flate (line 70 % + card 30 %), pil i mut, 1,5 dp innvendig
 * kant i line, ikke trykkbar. Med tekst: ink med bg-pil. 150 ms overgang, ingen opasitet på hele knappen.
 */
@Composable
private fun SendBtn43(v: ChatV27, on: Boolean, onSend: () -> Unit) {
    val empty = androidx.compose.ui.graphics.lerp(v.card, v.line, .7f)
    val bg by androidx.compose.animation.animateColorAsState(if (on) v.ink else empty, tween(150), label = "sendBg")
    val fg by androidx.compose.animation.animateColorAsState(if (on) v.bg else v.mut, tween(150), label = "sendFg")
    Box(
        Modifier.size(38.dp).clip(CircleShape).background(bg).then(if (on) Modifier else Modifier.border(1.5.dp, v.line, CircleShape))
            .then(if (on) Modifier.press24 { onSend() } else Modifier.semantics { disabled() }).ch27Label("Send"),
        contentAlignment = Alignment.Center,
    ) { WxIcon(ChIc27.SEND, fg, 19.dp, stroke = 2.2f) }
}

/** Prompt 41: faktakort under Glimt-svaret i Papir-stil (mono-etikett, verdien, kilden). */
@Composable
internal fun ChatFacts41(v: ChatV27, facts: List<ChatFact41>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        facts.forEach { f ->
            val shape = RoundedCornerShape(12.dp)
            Column(
                Modifier.fillMaxWidth().clip(shape).background(v.card).border(1.dp, if (f.failed) v.line.copy(alpha = .6f) else v.line, shape)
                    .padding(horizontal = 12.dp, vertical = 9.dp)
                    .semantics { contentDescription = listOf(f.headLine, f.label, f.source).filter { it.isNotBlank() }.joinToString(", ") },
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(f.headLine.uppercase(), color = v.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp,
                    letterSpacing = 1.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(f.label, color = if (f.failed) v.mut else v.ink, fontFamily = v.sans, fontWeight = if (f.failed) FontWeight.Medium else FontWeight.SemiBold,
                    fontSize = 14.sp, lineHeight = 19.sp)
                if (f.source.isNotBlank()) Text(f.source, color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun rememberChatImg50(vm: AppViewModel, url: String?, maxPx: Int, local: Bitmap? = null): Bitmap? {
    val ctx = LocalContext.current.applicationContext
    var bmp by remember(url) { mutableStateOf(local ?: Img50.cached(vm.base, url)) }
    LaunchedEffect(url) { if (url != null && (bmp == null || bmp === local)) Img50.load(ctx, vm.base, vm.account?.token, url, maxPx)?.let { bmp = it } }
    return bmp
}

private fun ext50(n: String): String = Regex("\\.(\\w{1,5})$").find(n)?.groupValues?.get(1)?.uppercase() ?: "FIL"

/* ---------------- Vedlegg i feltet ---------------- */

@Composable
internal fun ChatAttRow50(vm: AppViewModel, v: ChatV27) {
    val s = vm.chat27
    if (s.att.isEmpty()) return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(start = 4.dp, top = 8.dp, end = 8.dp, bottom = 2.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        s.att.forEachIndexed { i, a ->
            Column(Modifier.width(64.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Box {
                    Box(Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)).background(v.bg).border(1.dp, v.line, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                        val bmp = if (a.kind == "img") rememberChatImg50(vm, a.thumb, 256, Chat50.previews[a.key]) else null
                        if (bmp != null) Image(bmp.asImageBitmap(), a.name, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                        else Text(if (a.kind == "doc") "KB" else ext50(a.name), color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = .7.sp)
                        if (a.up) Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(Color.Black.copy(alpha = .12f))) {
                            Box(Modifier.fillMaxHeight().fillMaxWidth((Chat50.pct[a.key] ?: .02f).coerceIn(.02f, 1f)).background(CH27_SKY))
                        }
                    }
                    Box(Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-6).dp).size(22.dp).clip(CircleShape).background(v.ink)
                        .press24 { s.att = s.att.filterIndexed { j, _ -> j != i }; Chat50.previews.remove(a.key) }.ch27Label("Fjern ${a.name}"), contentAlignment = Alignment.Center) {
                        Text("✕", color = v.bg, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (a.kind != "img") Text(a.name, color = v.mut, fontFamily = v.sans, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** «Lim inn bilde» når utklippstavlen har et bilde (telefon). */
@Composable
internal fun ChatPaste50(vm: AppViewModel, v: ChatV27) {
    val ctx = LocalContext.current
    val cm = remember { ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager }
    var has by remember { mutableStateOf(false) }
    fun check() { has = runCatching { cm?.primaryClipDescription?.let { d -> (0 until d.mimeTypeCount).any { d.getMimeType(it).startsWith("image/") } } == true }.getOrDefault(false) }
    DisposableEffect(cm) {
        check()
        val l = ClipboardManager.OnPrimaryClipChangedListener { check() }
        runCatching { cm?.addPrimaryClipChangedListener(l) }
        onDispose { runCatching { cm?.removePrimaryClipChangedListener(l) } }
    }
    LaunchedEffect(vm.chat27.input.isEmpty(), vm.chat27.att.size) { check() }
    if (!has) return
    Row(Modifier.padding(start = 4.dp, top = 4.dp).height(32.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).press24 {
        val clip = runCatching { cm?.primaryClip }.getOrNull()
        val uris = (0 until (clip?.itemCount ?: 0)).mapNotNull { clip?.getItemAt(it)?.uri }
        if (uris.isEmpty()) vm.chatToast27("Fant ikke bildet i utklippstavlen") else vm.addChat50(uris)
        has = false
    }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("▣", color = v.mut, fontSize = 12.sp)
        Text("Lim inn bilde", color = v.ink, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
    }
}

/* ---------------- Bilder i meldingene ---------------- */

@Composable
internal fun ChatBubbleImgs50(vm: AppViewModel, v: ChatV27, files: List<ChatFile50>) {
    val imgs = files.filter { it.isImage }
    if (imgs.isEmpty()) return
    if (imgs.size == 1) {
        val f = imgs[0]
        val bmp = rememberChatImg50(vm, f.thumb ?: f.url, 720)
        val ratio = (bmp?.let { it.width.toFloat() / it.height } ?: f.w?.let { w -> f.h?.let { h -> w.toFloat() / h } } ?: 1f).coerceIn(.4f, 2.5f)
        val w = if (ratio >= 1f) 240.dp else 240.dp * ratio
        val h = if (ratio >= 1f) 240.dp / ratio else 240.dp
        Box(Modifier.size(w, h).clip(RoundedCornerShape(16.dp)).background(v.card).press24 { Chat50.lightbox = imgs to 0 }.ch27Label("Åpne ${f.name}")) {
            bmp?.let { Image(it.asImageBitmap(), f.name, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        }
    } else Column(verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.End) {
        imgs.chunked(2).forEachIndexed { r, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                row.forEachIndexed { c, f ->
                    val bmp = rememberChatImg50(vm, f.thumb ?: f.url, 360)
                    Box(Modifier.size(120.dp).clip(RoundedCornerShape(12.dp)).background(v.card).press24 { Chat50.lightbox = imgs to (r * 2 + c) }.ch27Label("Åpne ${f.name}")) {
                        bmp?.let { Image(it.asImageBitmap(), f.name, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                    }
                }
            }
        }
    }
}

/** Filpillen ved svaret: liten miniatyr (28, radius 6) + filnavn; trykk åpner lysboksen. */
@Composable
internal fun ChatFilePill50(vm: AppViewModel, v: ChatV27, all: List<ChatFile50>, i: Int) {
    val f = all[i]
    val bmp = rememberChatImg50(vm, f.thumb ?: f.url, 96)
    Row(Modifier.height(28.dp).widthIn(max = 220.dp).clip(CircleShape).border(1.dp, v.line, CircleShape).press24 { Chat50.lightbox = all to i }.padding(end = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)).background(v.card)) { bmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) } }
        Text(f.name, color = v.mut, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** «Lest med gemma3:12b fordi gpt-oss ikke kan se bilder» / «Lest med lokal OCR» under svaret. */
@Composable
internal fun ChatReadWith50(v: ChatV27, label: String?) {
    if (label.isNullOrBlank()) return
    Text(label, color = v.mut, fontFamily = v.sans, fontSize = 12.sp, lineHeight = 16.sp)
}

/** «Legg i Finans ›» under kvitteringstabellen. */
@Composable
internal fun ChatFinBtn50(vm: AppViewModel, v: ChatV27, key: String, url: String?) {
    if (url.isNullOrBlank()) return
    val st = Chat50.fin[key]
    Box(Modifier.height(36.dp).clip(CircleShape).border(1.dp, v.ink, CircleShape).then(if (st == null) Modifier.press24 { vm.finans50(key, url) } else Modifier).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) {
        Text(when (st) { "ok" -> "Lagt i Finans ✓"; "busy" -> "Legger i Finans …"; else -> "Legg i Finans ›" }, color = v.ink.copy(alpha = if (st == null) 1f else .6f),
            fontFamily = v.sans, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
    }
}

/** «Ser bilder» i modellvelgeren (vision fra Ollama /api/show → capabilities). */
@Composable
internal fun ChatVisionBadge50(v: ChatV27) {
    Box(Modifier.clip(RoundedCornerShape(6.dp)).border(1.dp, v.line, RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text("SER BILDER", color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 9.5.sp, letterSpacing = .6.sp, maxLines = 1)
    }
}

/* ---------------- Tabeller (kvittering i chat) ---------------- */

internal fun isTableLine50(l: String): Boolean = l.trimStart().startsWith("|") && l.count { it == '|' } >= 2

private fun cells50(l: String): List<String> = l.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim() }

private fun cell50(t: String, bold: Boolean): AnnotatedString = buildAnnotatedString {
    t.replace("`", "").split("**").forEachIndexed { i, x -> if (i % 2 == 1 || bold) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(x) } else append(x) }
}

@Composable
internal fun ChatTable50(v: ChatV27, lines: List<String>) {
    val rows = lines.map(::cells50)
    val sepAt = rows.indexOfFirst { r -> r.isNotEmpty() && r.all { Regex("^:?-{2,}:?$").matches(it) } }
    val right = if (sepAt >= 0) rows[sepAt].map { it.endsWith(":") } else emptyList()
    val head = if (sepAt == 1) rows[0] else null
    val body = rows.filterIndexed { i, _ -> i != sepAt && !(head != null && i == 0) }
    val n = rows.maxOf { it.size }
    @Composable
    fun line(r: List<String>, bold: Boolean) {
        Row(Modifier.fillMaxWidth().drawBehind { drawLine(v.line, androidx.compose.ui.geometry.Offset(0f, size.height), androidx.compose.ui.geometry.Offset(size.width, size.height), 1.dp.toPx()) }
            .padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for (c in 0 until n) {
                val r0 = right.getOrElse(c) { false }
                Text(cell50(r.getOrElse(c) { "" }, bold), color = v.ink, fontFamily = v.sans, fontSize = 14.sp, lineHeight = 19.sp, textAlign = if (r0) TextAlign.End else TextAlign.Start,
                    modifier = Modifier.weight(if (c == 0) 2.2f else 1f))
            }
        }
    }
    Column(Modifier.fillMaxWidth()) {
        head?.let { line(it, true) }
        body.forEach { line(it, false) }
    }
}

/* ---------------- Lysboks ---------------- */

@Composable
internal fun ChatLightbox50(vm: AppViewModel) {
    val lb = Chat50.lightbox ?: return
    val (list, start) = lb
    val close = { Chat50.lightbox = null }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val pager = rememberPagerState(initialPage = start.coerceIn(0, (list.size - 1).coerceAtLeast(0)), pageCount = { list.size })
        val limit = with(LocalDensity.current) { 90.dp.toPx() }
        var dy by remember { mutableStateOf(0f) }
        Box(Modifier.fillMaxSize().background(Color(0xF00A0A0A))) {
            HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
                val f = list[i]
                val small = Img50.cached(vm.base, f.thumb)
                val bmp = rememberChatImg50(vm, f.url ?: f.thumb, 2048, small)
                Box(Modifier.fillMaxSize().pointerInput(i) {
                    detectVerticalDragGestures(onDragEnd = { if (dy > limit) close() else dy = 0f }, onDragCancel = { dy = 0f }) { _, d -> dy = (dy + d).coerceAtLeast(0f) }
                }.graphicsLayer { translationY = if (pager.currentPage == i) dy else 0f; alpha = 1f - (dy / (limit * 4)).coerceIn(0f, .5f) }, contentAlignment = Alignment.Center) {
                    bmp?.let { Image(it.asImageBitmap(), f.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize()) }
                }
            }
            val cur = list.getOrNull(pager.currentPage)
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(cur?.name ?: "", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                LbBtn50("Del") { cur?.let { vm.shareChatFile50(it) } }
                LbBtn50("Lukk", close)
            }
            if (list.size > 1) Text("${pager.currentPage + 1} av ${list.size}", color = Color.White.copy(alpha = .7f), fontSize = 12.sp,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 12.dp))
        }
    }
}

@Composable
private fun LbBtn50(t: String, onClick: () -> Unit) {
    Box(Modifier.height(40.dp).clip(CircleShape).background(Color.White.copy(alpha = .08f)).border(1.dp, Color.White.copy(alpha = .3f), CircleShape).press24(onClick = onClick)
        .padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(t, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

/* ---------------- Dra og slipp ---------------- */

private fun Context.activity50(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) { if (c is Activity) return c; c = c.baseContext }
    return null
}

private fun okMime50(m: String) = m.startsWith("image/") || m == "application/pdf" || m.startsWith("text/") || m.startsWith("application/")

/** Hele chatten tar imot filer som dras inn fra andre apper (Fold/nettbrett). Tekst uten fil legges i feltet. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.chatDrop50(vm: AppViewModel): Modifier {
    val ctx = LocalContext.current
    val target = remember(vm) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) { Chat50.dragging = true }
            override fun onExited(event: DragAndDropEvent) { Chat50.dragging = false }
            override fun onEnded(event: DragAndDropEvent) { Chat50.dragging = false }
            override fun onDrop(event: DragAndDropEvent): Boolean {
                Chat50.dragging = false
                val de = event.toAndroidDragEvent()
                runCatching { ctx.activity50()?.requestDragAndDropPermissions(de) }
                val clip = de.clipData ?: return false
                val uris = ArrayList<Uri>()
                val text = StringBuilder()
                for (i in 0 until clip.itemCount) {
                    val it = clip.getItemAt(i)
                    if (it.uri != null) uris.add(it.uri) else it.text?.let { t -> text.append(t) }
                }
                if (uris.isNotEmpty()) { vm.addChat50(uris.take(Chat50.MAX_FILES)); return true }
                if (text.isNotEmpty()) { vm.chat27.input = (vm.chat27.input + " " + text).trim(); return true }
                return false
            }
        }
    }
    return this.dragAndDropTarget(shouldStartDragAndDrop = { e ->
        val d = runCatching { e.toAndroidDragEvent().clipDescription }.getOrNull()
        d != null && (0 until d.mimeTypeCount).any { okMime50(d.getMimeType(it)) }
    }, target = target)
}

/** Laget mens man drar: papirfarge 92 %, stiplet ramme 2 dp (radius 24, innfelt 16) og «Slipp for å legge ved». */
@Composable
internal fun ChatDropLayer50(v: ChatV27) {
    if (!Chat50.dragging) return
    Box(Modifier.fillMaxSize().background(v.bg.copy(alpha = .92f)).padding(16.dp).drawBehind {
        drawRoundRect(v.ink, cornerRadius = CornerRadius(24.dp.toPx()), style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10.dp.toPx(), 7.dp.toPx()))))
    }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Slipp for å legge ved", color = v.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 28.sp)
            Text("Bilder, PDF, tekst · maks 20 MB", color = v.mut, fontFamily = v.sans, fontSize = 14.sp)
        }
    }
}
