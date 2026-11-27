package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import no.kristo.finanshub.ui.designsystem.LocalDsColors

/* ---------------- Mer → Tailnet (Tailscale, bare admin) ----------------
 * Prompt 57: 2×2 stat-rutenett, søk, vannrett rullende filterpiller, rader på 60 dp (maks 8 + «Vis alle N»), Vedlikehold som én
 * rad med antall. Trykk på en enhet folder ut detaljen i lista: feltene, latens 24 t, oppetid 30 d, Ping nå (full bredde),
 * Kopier IP og Kopier SSH. Grønn bare i statusprikkene. Data og tekster fra serveren (Tailnet.kt).
 */

@Composable
internal fun TailnetSide(vm: AppViewModel) {
    val p = PaperPal.current
    val t = TailnetTilstand
    BackHandler { t.open = false }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val all = t.shown()
    val list = if (t.showAll) all else all.take(8)
    Column(Modifier.fillMaxSize().background(p.bg).statusBarsPadding()) {
        NewsTop50("Tailscale", "Tailnet", Modifier.padding(start = 16.dp, end = 12.dp, top = 8.dp), onBack = { t.open = false }) {
            RoundBtn50("↻", "Hent på nytt") { vm.loadTailnet() }
        }
        Text(
            if (t.loaded) "${t.online} av ${t.total} enheter online" else "Enheter, latens og oppetid",
            color = p.mut, fontSize = 14.sp, maxLines = 1, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 2.dp, bottom = 12.dp),
        )
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp + navB), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            t.error?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp) } }
            if (t.stats.isNotEmpty()) item { TsStats(t.stats.take(4)) }
            item { TsSearch() }
            item { TsPills() }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
                    if (all.isEmpty()) Text(if (t.loading) "Henter …" else "Ingen enheter passer.", color = p.mut, fontSize = 13.5.sp, modifier = Modifier.padding(16.dp))
                    list.forEachIndexed { i, d ->
                        TsRow(vm, d)
                        if (i < list.size - 1) Box(Modifier.padding(start = 60.dp).fillMaxWidth().height(1.dp).background(p.line))
                    }
                }
            }
            if (all.size > 8) item {
                Text(if (t.showAll) "Vis færre" else "Vis alle ${all.size}", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                    modifier = Modifier.heightIn(min = 44.dp).clickable(role = Role.Button) { Haptics.select(); t.showAll = !t.showAll }.padding(vertical = 12.dp))
            }
            if (t.maintenance > 0) item { TsMaint(t.maintenance) }
        }
    }
}

@Composable
private fun TsStats(stats: List<TsStat>) {
    val p = PaperPal.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        stats.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { s ->
                    Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                        Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
                        Text(s.label, color = p.lab, fontFamily = PaperFonts.mono, fontSize = 10.sp, letterSpacing = 1.sp, modifier = Modifier.padding(top = 6.dp))
                        Text(s.value, color = p.ink, fontFamily = PaperFonts.serif, fontSize = 28.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(s.sub, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TsSearch() {
    val p = PaperPal.current
    val t = TailnetTilstand
    Row(Modifier.fillMaxWidth().height(44.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("⌕", color = p.mut, fontSize = 16.sp)
        Box(Modifier.weight(1f)) {
            if (t.query.isEmpty()) Text("Søk navn eller IP", color = p.mut, fontSize = 15.sp)
            BasicTextField(t.query, { t.query = it.take(80); t.showAll = false }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp),
                cursorBrush = SolidColor(p.ink), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Søk i tailnetet" })
        }
    }
}

@Composable
private fun TsPills() {
    val p = PaperPal.current
    val t = TailnetTilstand
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        t.filters.forEach { f ->
            val on = t.filter == f.id
            Box(Modifier.heightIn(min = 44.dp).clickable(role = Role.Tab, onClickLabel = f.navn) { Haptics.select(); t.filter = f.id; t.showAll = false }, contentAlignment = Alignment.Center) {
                Row(Modifier.height(34.dp).clip(CircleShape).background(if (on) p.ink else Color.Transparent).border(1.dp, if (on) p.ink else p.line, CircleShape).padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(f.navn, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                    Text("${f.count}", color = if (on) p.bg else p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp)
                }
            }
        }
    }
}

private fun kindTegn(kind: String): String = when (kind) { "server" -> "▤"; "laptop" -> "⌨"; "mobile" -> "▯"; "tablet" -> "▭"; "iot" -> "◇"; else -> "▣" }

@Composable
private fun TsRow(vm: AppViewModel, d: TsEnhet) {
    val p = PaperPal.current
    val ds = LocalDsColors.current
    val t = TailnetTilstand
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClickLabel = "Vis ${d.name}") { Haptics.select(); vm.toggleTailnet(d.id) }
                .semantics(mergeDescendants = true) { contentDescription = "${d.name}, ${d.statusLabel}, ${d.latencyLabel}" }
                .alpha(if (d.online) 1f else 0.55f).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(p.bg), contentAlignment = Alignment.Center) { Text(kindTegn(d.kind), color = p.mut, fontSize = 14.sp) }
            Column(Modifier.weight(1f)) {
                Text(d.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(d.ip, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp, maxLines = 1)
            }
            Text(d.latencyLabel, color = if (d.online && d.latencyKnown) p.ink else p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, maxLines = 1)
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (d.online) ds.success else p.mut.copy(alpha = 0.5f)))
        }
        if (t.expanded == d.id) TsDetail(vm, d)
    }
}

@Composable
private fun TsDetail(vm: AppViewModel, d: TsEnhet) {
    val p = PaperPal.current
    val ds = LocalDsColors.current
    val t = TailnetTilstand
    val clip = LocalClipboardManager.current
    val x = t.detail[d.id]
    Column(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (x == null) { Text("Henter …", color = p.mut, fontSize = 13.sp); return@Column }
        x.fakta.forEach { f ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(f.label, color = p.mut, fontSize = 13.sp)
                Spacer(Modifier.weight(1f))
                Text(f.value, color = p.ink, fontSize = if (f.mono) 12.sp else 13.sp, fontFamily = if (f.mono) PaperFonts.mono else PaperFonts.sans)
            }
        }
        Text("LATENS 24 T", color = p.lab, fontFamily = PaperFonts.mono, fontSize = 10.sp, letterSpacing = 1.sp)
        TsSpark(x.spark, p.ink)
        Text(x.latensTekst, color = p.mut, fontSize = 12.sp)
        Text("OPPETID 30 D", color = p.lab, fontFamily = PaperFonts.mono, fontSize = 10.sp, letterSpacing = 1.sp)
        Row(Modifier.fillMaxWidth().height(22.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            x.stripe.forEach { s ->
                val c = when (s) { "oppe" -> p.ink; "delvis" -> ds.warning; "nede" -> ds.accent; else -> p.line }
                Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c))
            }
        }
        Text(x.oppetidTekst, color = p.mut, fontSize = 12.sp)
        if (x.canPing) {
            Box(Modifier.fillMaxWidth().height(46.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) { Haptics.tap(); vm.pingTailnet(d.id) }, contentAlignment = Alignment.Center) {
                Text("Ping nå", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            }
        }
        t.ping[d.id]?.let { Text(it, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (d.ip.isNotEmpty()) TsSmall("Kopier IP", Modifier.weight(1f)) { clip.setText(AnnotatedString(d.ip)); Haptics.success(); vm.p44.asToast = "Kopierte IP-en" }
            TsSmall("Kopier SSH", Modifier.weight(1f)) { clip.setText(AnnotatedString(d.ssh)); Haptics.success(); vm.p44.asToast = "Kopierte SSH-kommandoen" }
        }
    }
}

@Composable
private fun TsSmall(text: String, modifier: Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.height(44.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button, onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

/** Latens per time siste 24 t; null = ingen måling (linja brytes der). */
@Composable
private fun TsSpark(values: List<Double?>, color: Color) {
    val top = (values.filterNotNull().maxOrNull() ?: 1.0).coerceAtLeast(1.0)
    Canvas(Modifier.fillMaxWidth().height(36.dp)) {
        val n = (values.size - 1).coerceAtLeast(1)
        val path = Path()
        var pen = false
        values.forEachIndexed { i, v ->
            if (v == null) { pen = false; return@forEachIndexed }
            val pt = Offset(size.width * i / n, size.height - (v / top).toFloat() * (size.height - 4f) - 2f)
            if (pen) path.lineTo(pt.x, pt.y) else { path.moveTo(pt.x, pt.y); pen = true }
        }
        drawPath(path, color, style = Stroke(width = 1.5.dp.toPx()))
    }
}

@Composable
private fun TsMaint(n: Int) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(18.dp)).background(p.card).padding(horizontal = 14.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(p.bg), contentAlignment = Alignment.Center) { Text("⚒", color = p.mut, fontSize = 14.sp) }
        Column(Modifier.weight(1f)) {
            Text("Vedlikehold", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text("Nøkler, oppdateringer og gamle enheter · se web", color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("$n", color = p.ink, fontFamily = PaperFonts.mono, fontSize = 14.sp)
    }
}
