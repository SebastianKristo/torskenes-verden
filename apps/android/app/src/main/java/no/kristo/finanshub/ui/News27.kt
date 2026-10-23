package no.kristo.finanshub.ui

import android.content.Intent
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 27 (ANDROID-B): Nyhetsleser med bilde ved hver sak (76 × 76, kildefarge + initialer uten bilde) og artikkelvisning i appen
 * (16:9-bilde, kategori · kilde, tittel, «I dag 09:12 · ca. 3 min å lese», ✦ AI-sammendrag med 3 punkter, «Les hele saken hos … ↗»,
 * Del og «Mer om …»). Fasit: Nyhetsleser.dc.html (mobil). Data: /api/rss (image, readMin) og /api/rss/article.
 */

private val NEWS_COLORS27 = listOf(0xFF1F3A5F, 0xFFB23A2A, 0xFF2F7A4F, 0xFF6D4AFF, 0xFFC85A26, 0xFF0B6E99, 0xFF7A5C2E, 0xFF3A4252)

/** Fast farge per kilde (NRK alltid samme farge). */
internal fun newsColor27(src: String): Color = Color(NEWS_COLORS27[(src.lowercase().hashCode() and 0x7fffffff) % NEWS_COLORS27.size])

internal fun newsInitials27(src: String): String =
    src.split(' ', '-', '.').filter { it.isNotBlank() }.let { w -> if (w.size >= 2) w.take(2).joinToString("") { it.take(1) } else src.take(3) }.uppercase()

/** Bilde fra nettet (eller /api-sti) beskåret til flaten, ellers kildefarge og initialer. */
@Composable
internal fun NewsImage27(vm: AppViewModel, url: String?, src: String, modifier: Modifier, radius: Dp, iniSize: Int = 13) {
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { if (!url.isNullOrBlank()) bmp = vm.img27(url) }
    Box(modifier.clip(RoundedCornerShape(radius)).background(newsColor27(src)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Text(newsInitials27(src), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = iniSize.sp, maxLines = 1)
    }
}

private val HM27 = DateTimeFormatter.ofPattern("HH:mm")

/** «I dag 09:12 · ca. 3 min å lese». */
private fun articleMeta27(published: String?, readMin: Int?): String {
    val t = published?.let { s -> runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull() }
    val day = t?.let {
        val d = it.toLocalDate(); val today = LocalDate.now()
        when (d) { today -> "I dag " + it.format(HM27); today.minusDays(1) -> "I går " + it.format(HM27); else -> it.format(DateTimeFormatter.ofPattern("d. MMM HH:mm", Locale("nb", "NO"))) }
    } ?: published?.take(16)
    return listOfNotNull(day, readMin?.let { "ca. $it min å lese" }).joinToString(" · ")
}

/** Saken i appen. Tilbake lukker saken (ikke hele leseren). */
@Composable
internal fun NewsArticle27(vm: AppViewModel, p: PaperPal, cats: List<NewsCategory>) {
    val s = vm.b27
    val x = s.articleFor ?: return
    val a = s.article
    val ctx = LocalContext.current
    BackHandler { Haptics.back(); vm.closeArticle27() } // prompt 46: haptikk ved fullført tilbake (også prediktiv tilbake)
    val src = a?.source ?: x.feed
    val catId = a?.category ?: x.category
    val cat = catId?.let { c -> cats.firstOrNull { it.id == c }?.name ?: c.replaceFirstChar { it.uppercase() } } ?: "Nyheter"
    val scroll = rememberScrollState()
    LaunchedEffect(x.url) { scroll.scrollTo(0) }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(18.dp, 14.dp, 18.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.height(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Tilbake") { Haptics.back(); vm.closeArticle27() }.padding(start = 12.dp, end = 16.dp),
                    contentAlignment = Alignment.Center) { Text("‹ Siste nytt", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp) }
                Spacer(Modifier.weight(1f))
                Box(Modifier.height(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Del") {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, a?.title ?: x.title).putExtra(Intent.EXTRA_TEXT, (a?.title ?: x.title) + "\n" + (a?.url ?: x.url))
                    runCatching { ctx.startActivity(Intent.createChooser(send, "Del saken").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) { Text("Del", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp) }
            }
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll).padding(18.dp, 4.dp, 18.dp, 36.dp).widthIn(max = 720.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                NewsImage27(vm, a?.image ?: x.image, src, Modifier.fillMaxWidth().aspectRatio(16f / 9f), 18.dp, 28)
                PLabel("$cat · $src", p.lab)
                PSerif(a?.title ?: x.title, 28.sp, p.ink)
                articleMeta27(a?.published ?: x.published, a?.readMin ?: x.readMin).takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 13.sp) }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PLabel("✦ AI-sammendrag", p.lab)
                    val sum = a?.summary
                    val pts = a?.points ?: emptyList()
                    when {
                        s.articleBusy -> Text("Leser saken …", color = p.mut, fontSize = 15.sp)
                        sum != null -> {
                            PSerif(sum, 19.sp, p.ink, weight = FontWeight.Normal)
                            if (pts.isNotEmpty()) {
                                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                pts.forEachIndexed { i, t ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text("${i + 1}", color = p.lab, fontWeight = FontWeight.ExtraBold, fontSize = 14.5.sp)
                                        Text(t, color = p.ink, fontSize = 14.5.sp, lineHeight = 21.sp, modifier = Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                        else -> Text(s.articleError ?: x.excerpt ?: "Fant ikke noe sammendrag for denne saken.", color = p.mut, fontSize = 14.5.sp, lineHeight = 21.sp)
                    }
                    if (!s.articleBusy && sum != null) Text(a?.aiNote ?: "✦ Laget av AI fra saken. Kan inneholde feil.", color = p.mut, fontSize = 12.sp)
                }
                Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).background(p.ink).clickable { openLink(ctx, a?.url ?: x.url) }, contentAlignment = Alignment.Center) {
                    Text("Les hele saken hos $src ↗", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                val rel = a?.related ?: vm.news?.items?.filter { it.url != x.url && it.category == x.category }?.take(4) ?: emptyList()
                if (rel.isNotEmpty()) {
                    Column {
                        PLabel("Mer om $cat", p.lab, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
                        Box(Modifier.fillMaxWidth().height(2.dp).background(p.ink))
                        rel.forEach { r ->
                            Row(Modifier.fillMaxWidth().clickable { vm.openArticle27(r) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(r.title, color = p.ink, fontSize = 15.sp, lineHeight = 20.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                    Text(listOf(r.feed, newsTime(r.published)).filter(String::isNotBlank).joinToString(" · "), color = p.mut, fontSize = 12.sp)
                                }
                                NewsImage27(vm, r.image, r.feed, Modifier.size(64.dp), 12.dp, 12)
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        }
                    }
                }
            }
        }
    }
}
