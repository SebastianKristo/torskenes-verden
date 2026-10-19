package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 29 (ANDROID29): Nå/Neste-kortet i Kalender, arket «Legg til time» (✦ AI · RASK TIME), pillen
 * «✦ Legger til i kalenderen …» og banneret «✓ Nina frisør · fre 25. sep · 14:30» med Angre og Vis (Kalender.dc.html, mobil).
 * Arket, pillen og banneret ligger i eget lag øverst i PaperApp (Quick29Overlay), så de vises både i Kalender og på Hjem.
 */

private const val K29_CLOCK = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V12l3 2"
private const val K29_PASTE = "M9 4h6v3H9zM7 5H5v16h14V5h-2"
private val K29_STAR = Color(0xFFF08A76)

/* ---------------- Nå / Neste ---------------- */

/** Lyst Papir-kort: ikonflis i fagets farge, NÅ/NESTE + tid, tittel + rom, stort tall til høyre og fremdriftslinje når det pågår. */
@Composable
internal fun K29NowCard(vm: AppViewModel, nx: KalNow29) {
    val p = PaperPal.current
    val c = Color(nx.color)
    Box(
        Modifier.padding(start = 12.dp, end = 12.dp, bottom = 10.dp).fillMaxWidth()
            .shadow(10.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
            .press24 { nx.ev?.let { vm.kal26.sel = it; vm.kal26.mini = false } }
            .semantics { contentDescription = listOf(nx.k, nx.title, nx.tm, nx.day, nx.big, nx.small).filter { it.isNotBlank() }.joinToString(", ") },
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(start = 12.dp, top = 10.dp, end = 18.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(lerp(p.card, c, .16f)), contentAlignment = Alignment.Center) {
                WxIcon(K29_CLOCK, c, 20.dp, stroke = 2f)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (nx.k.isNotEmpty()) Text(nx.k, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, maxLines = 1)
                    Text(listOf(nx.tm, nx.day).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold,
                        fontSize = 10.5.sp, letterSpacing = .4.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PSerif(nx.title, 20.sp, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                    // Prompt 31: stedspillen kan aldri gjøre kortet bredere (maks ~45 %, ellipse; URL-er er fjernet).
                    if (nx.place.isNotEmpty()) Box(Modifier.weight(.8f, fill = false).clip(CircleShape).background(p.bg).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        Text(nx.place, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            if (nx.big.isNotEmpty()) Column(horizontalAlignment = Alignment.End) {
                PSerif(nx.big, 24.sp, maxLines = 1)
                Text(nx.small, color = p.mut, fontSize = 11.5.sp, maxLines = 1, modifier = Modifier.padding(top = 3.dp))
            }
        }
        nx.progress?.let { f ->
            Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(p.line)) {
                Box(Modifier.fillMaxWidth(f).fillMaxHeight().background(c))
            }
        }
    }
}

/* ---------------- Laget øverst: arket, pillen og banneret ---------------- */

@Composable
internal fun Quick29Overlay(vm: AppViewModel) {
    val q = vm.q29
    Box(Modifier.fillMaxSize()) {
        if (q.open) Quick29Sheet(vm)
        val top = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 14.dp)
        // Prompt 31: Glimt-toasten (animert merke, trykk → glassboble med steg) for raske timer og alle andre AI-jobber.
        if (q.toast == null) AiToast31(vm, Modifier.align(Alignment.TopCenter))
        val t = q.toast
        AnimatedVisibility(t != null, top.padding(horizontal = 12.dp), enter = fadeIn() + slideInVertically { -it }, exit = fadeOut() + slideOutVertically { -it }) {
            // Siste verdi beholdes mens banneret glir ut.
            var last by remember { mutableStateOf(t) }
            if (t != null) last = t
            last?.let { Quick29Toast(vm, it) }
        }
        if (t != null) LaunchedEffect(q.toastSeq) { kotlinx.coroutines.delay(6000); q.toast = null }
    }
}

@Composable
private fun Quick29Pill(n: Int) {
    val p = PaperPal.current
    Row(
        Modifier.height(36.dp).shadow(14.dp, CircleShape).clip(CircleShape).background(p.ink).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("✦", color = K29_STAR, fontSize = 13.sp)
        Text(if (n > 1) "Legger til $n timer …" else "Legger til i kalenderen …", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
    }
}

@Composable
private fun Quick29Toast(vm: AppViewModel, j: Quick29Job) {
    val p = PaperPal.current
    Row(
        Modifier.widthIn(max = 440.dp).fillMaxWidth().shadow(18.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(p.ink)
            .padding(start = 14.dp, top = 10.dp, end = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("✓ " + j.title.ifBlank { "Lagt i kalenderen" }, color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (j.label.isNotBlank()) Text(j.label, color = p.bg.copy(alpha = .8f), fontSize = 12.5.sp, maxLines = 1)
            if (j.start.isNullOrBlank() && j.date != null) Text("Fant ikke klokkeslett, lagt inn som hele dagen.", color = p.bg.copy(alpha = .8f), fontSize = 12.sp, maxLines = 2)
        }
        Box(Modifier.height(34.dp).clip(CircleShape).press24 { vm.undoQuick29() }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text("Angre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Box(Modifier.height(34.dp).clip(CircleShape).background(p.bg).press24 { vm.showQuick29() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Vis", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

/* ---------------- Arket «Legg til time» ---------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Quick29Sheet(vm: AppViewModel) {
    val p = PaperPal.current
    val q = vm.q29
    val clip = LocalClipboardManager.current
    val focus = remember { FocusRequester() }
    BackHandler { vm.closeQuick29() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    BoxWithConstraints(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { vm.closeQuick29() },
        contentAlignment = Alignment.BottomCenter,
    ) {
        val wide = maxWidth >= 600.dp
        val shape = if (wide) RoundedCornerShape(24.dp) else RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp)
        Column(
            Modifier.align(if (wide) Alignment.Center else Alignment.BottomCenter).then(if (wide) Modifier.widthIn(max = 480.dp) else Modifier).fillMaxWidth()
                .fillMaxHeight(.9f).wrapContentHeight(if (wide) Alignment.CenterVertically else Alignment.Bottom).imePadding()
                .clip(shape).background(p.bg).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .verticalScroll(rememberScrollState()).padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = if (wide) 22.dp else navB + 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.align(Alignment.CenterHorizontally).size(36.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(p.line))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("✦ AI · RASK TIME", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp, maxLines = 1)
                    PSerif("Legg til time", 24.sp, maxLines = 1)
                }
                Box(Modifier.size(36.dp).clip(CircleShape).background(p.card).press24 { vm.closeQuick29() }.semantics { contentDescription = "Lukk" }, contentAlignment = Alignment.Center) {
                    Text("✕", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            Box(
                Modifier.fillMaxWidth().heightIn(min = 96.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, p.line, RoundedCornerShape(16.dp)).background(p.card)
                    .padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                if (q.text.isEmpty()) Text("F.eks. «time hos Nina frisør 14.30 25.09» eller lim inn meldingen fra legekontoret", color = p.mut, fontSize = 16.sp, lineHeight = 23.sp)
                BasicTextField(
                    q.text, { vm.setQuickText29(it) }, minLines = 3,
                    textStyle = TextStyle(color = p.ink, fontSize = 16.sp, lineHeight = 23.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans),
                    cursorBrush = SolidColor(p.ink), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                )
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    Modifier.height(34.dp).clip(CircleShape).background(p.ink).press24 {
                        val v = runCatching { clip.getText()?.text }.getOrNull()
                        if (!v.isNullOrBlank()) vm.setQuickText29(v) else vm.flash("Utklippstavlen er tom")
                    }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    WxIcon(K29_PASTE, p.bg, 13.dp, stroke = 2.2f)
                    Text("Lim inn melding", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, maxLines = 1)
                }
                listOf("Frisør", "Lege", "Tannlege", "Fysio").forEach { n ->
                    Box(Modifier.height(34.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).press24 { vm.setQuickText29("Time hos ${n.lowercase()} ") }.padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center) {
                        Text(n, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
                    }
                }
            }
            val pv = q.preview?.takeIf { q.text.trim().length > 3 }
            if (pv != null && pv.ok) Quick29Preview(pv)
            if (pv != null && !pv.ok) Text(
                if (pv.why.contains("Skriv")) pv.why else pv.why.ifBlank { "Fant ikke dato." } + " Skriv f.eks. «25.09» eller «tirsdag».",
                color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp),
            )
            val can = q.text.isNotBlank()
            Box(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp)).background(p.lab).alpha(if (can) 1f else .45f)
                    .press24(enabled = can) { vm.submitQuick29() },
                contentAlignment = Alignment.Center,
            ) { Text("Legg til i kalenderen", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
            Box(Modifier.fillMaxWidth().heightIn(min = 44.dp).clip(RoundedCornerShape(14.dp)).press24 { vm.quickManual29() }, contentAlignment = Alignment.Center) {
                Text("Fyll ut selv", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Text("Du kan lukke appen. Timen legges til i bakgrunnen.", color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun Quick29Preview(r: Quick29Parse) {
    val p = PaperPal.current
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(Color(0xFF6B4FA0)))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.title.ifBlank { "Avtale" }, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(quickPreviewDate29(r), color = p.mut, fontSize = 13.sp, maxLines = 1)
            if (r.place.isNotBlank()) Text(r.place, color = p.mut, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("Privat · varsel 1 time før", color = p.mut, fontSize = 12.sp)
        }
    }
}
