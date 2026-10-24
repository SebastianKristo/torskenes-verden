package no.kristo.finanshub.ui

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import no.kristo.finanshub.*

/*
 * Prompt 50 (MEDAND50, claude-code-chat-slipp-filer-og-miniatyr.md, fasit public/js/chat50.js):
 *  - ChatAttRow50: miniatyrer 64×64 (radius 12, beskåret) med rund ×-knapp (22) og tynn fremdriftslinje mens filen lastes opp;
 *    PDF/andre filer som kort med filtypen i mono og navnet under.
 *  - ChatBubbleImgs50: bildene over teksten i brukerens boble – ett bilde maks 240×240 (radius 16), flere i rutenett 2 × 120 med 4 mellomrom.
 *  - ChatLightbox50: fullskjerm med Lukk og Del, sveip mellom bildene, sveip ned lukker. Originalen hentes først her.
 *  - ChatDropLayer50 + Modifier.chatDrop50: dra og slipp fra andre apper (Fold/nettbrett i delt skjerm) med laget «Slipp for å legge ved».
 *  - ChatPaste50: «Lim inn bilde» når utklippstavlen har et bilde. Deling til appen mens Chat er åpen legger ved (MainActivity).
 *  - «Lest med …», «Legg i Finans ›», «Ser bilder»-merket og markdown-tabeller (kvittering: Vare | Antall | Pris).
 */

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
