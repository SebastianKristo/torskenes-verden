package no.kristo.finanshub.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

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
