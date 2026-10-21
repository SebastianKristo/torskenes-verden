package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.TextStyle as JTextStyle
import java.util.Locale

/*
 * Prompt 43 (claude-code-finans-saldokort.md): saldokortet i Finans → Oversikt (4b i Papir-farger). Bare to tall:
 * saldo for alle kontoer (52 sp) og «Brukt i <måned> · dag D av N» med månedsring. Hele kortet åpner Kontoer.
 * Ingen hardkodede farger: card/bg/ink/mut/line/lab fra PaperPal (lys og mørk).
 */
@Composable
internal fun SaldoCard43(saldo: Double, spent: Double, onOpen: () -> Unit) {
    val p = PaperPal.current
    val today = LocalDate.now()
    val d = today.dayOfMonth
    val dm = today.lengthOfMonth()
    val month = today.month.getDisplayName(JTextStyle.FULL_STANDALONE, NB43).lowercase(NB43)
    val shape = RoundedCornerShape(26.dp)
    Column(
        Modifier.fillMaxWidth().shadow(14.dp, shape, ambientColor = Color(0x731B1A17), spotColor = Color(0x731B1A17)).clip(shape).background(p.card)
            .border(1.dp, p.line.copy(alpha = .7f), shape).clickable(role = Role.Button, onClickLabel = "Åpne Kontoer", onClick = onOpen).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            PLabel("Saldo · alle kontoer", modifier = Modifier.weight(1f))
            Box(Modifier.size(30.dp).clip(CircleShape).background(p.bg), contentAlignment = Alignment.Center) {
                Text("›", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(neg0(saldo), color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 52.sp, lineHeight = 52.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Text("kr", color = p.mut, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 30.sp, maxLines = 1, modifier = Modifier.padding(bottom = 4.dp))
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.bg).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            MonthRing43(d, dm)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text("Brukt i $month · dag $d av $dm", color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${n0(spent)} kr", color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 27.sp, maxLines = 1)
            }
        }
    }
}

/** Månedsringen (46 dp): lab for andelen av måneden som har gått, resten line. «21.» på én linje i midten. */
@Composable
private fun MonthRing43(d: Int, dm: Int) {
    val p = PaperPal.current
    val frac = (d.toFloat() / dm).coerceIn(0f, 1f)
    Box(Modifier.size(46.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val sw = 5.dp.toPx()
            val inset = sw / 2
            val sz = Size(size.width - sw, size.height - sw)
            drawArc(p.line.copy(alpha = .8f), 0f, 360f, false, Offset(inset, inset), sz, style = Stroke(sw))
            drawArc(p.lab, -90f, 360f * frac, false, Offset(inset, inset), sz, style = Stroke(sw))
        }
        Text("$d.", color = p.ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 11.sp, maxLines = 1, softWrap = false)
    }
}
private val NB43 = Locale("nb", "NO")

/**
 * Prompt 43 (claude-code-finans-liste-maned-topp.md): månedstoppen i Finans → Liste. «OKTOBER · 19» (mono 600 10,5, lab) til venstre,
 * «Netto +25 518,09 kr» (12 sp, mut) til høyre, 2 dp strek i ink 6 dp under. Med kategorifilter: «MAT OG DAGLIGVARER · OKT · 7».
 * Bakgrunn bg så den kan stå sticky over radene.
 */
@Composable
internal fun MonthHead43(ym: String, cat: String, count: Int, net: Double, top: androidx.compose.ui.unit.Dp) {
    val p = PaperPal.current
    val m = runCatching { java.time.YearMonth.parse(ym) }.getOrNull()
    val now = java.time.YearMonth.now()
    val full = m?.month?.getDisplayName(JTextStyle.FULL_STANDALONE, NB43)?.uppercase(NB43) ?: ym
    val short = m?.month?.getDisplayName(JTextStyle.SHORT_STANDALONE, NB43)?.uppercase(NB43)?.trimEnd('.') ?: ym
    val yr = if (m != null && m.year != now.year) " ${m.year}" else ""
    val label = if (cat == "Alle") "$full$yr · $count" else "${cat.uppercase(NB43)} · $short$yr · $count"
    val netTxt = (if (net > 0) "+" else if (net < 0) "−" else "") + money2_43(kotlin.math.abs(net))
    Column(Modifier.fillMaxWidth().background(p.bg).padding(top = top)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.26.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("Netto $netTxt kr", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, maxLines = 1)
        }
        Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(2.dp).background(p.ink))
    }
}

private fun money2_43(v: Double): String = if (Privacy.hidden) "•••" else
    java.text.NumberFormat.getNumberInstance(NB43).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(v).replace(' ', ' ')
