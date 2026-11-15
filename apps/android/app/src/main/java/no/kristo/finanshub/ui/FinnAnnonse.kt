package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.DsPalette
import androidx.compose.ui.graphics.lerp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.ui.semantics.Role
import no.kristo.felles.tid.OsloDato

/*
 * Prompt 23: Finn-annonsen i appen (Mobil Papir App.dc.html → Finans → Finn → trykk på et kort). Fullskjerm over alt:
 * bildekarusell (sveip, prikker, «1 / 4»), «‹ Finn» og ✎, status og dato, tittel, pris, «Kjøpt fra / Solgt til»,
 * Fiks ferdig-steg, «Om annonsen», beskrivelse, «Åpne annonsen i Finn ›», E-poster (trykk for å lese) og Meldinger.
 */

/** Plassholderne i bildefeltet (alltid mørkt): kategorifargene, mørknet. */
private val TINT23: List<Color> = DsPalette.Category.let { listOf(it.purple, it.blue, it.brown, it.green, it.neutral, it.teal) }.map { lerp(it, Color.Black, .62f) }
private val SCRIM = DsPalette.PapirLys.textPrimary.copy(alpha = .6f)

private fun mailTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val t = runCatching { java.time.OffsetDateTime.parse(iso).atZoneSameInstant(OsloDato.SONE).toLocalDateTime() }.getOrNull()
        ?: runCatching { java.time.Instant.parse(iso).atZone(OsloDato.SONE).toLocalDateTime() }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(iso.take(19)) }.getOrNull()
        ?: return if (iso.length >= 10) ddmm(iso) else iso
    return "%02d.%02d %02d:%02d".format(t.dayOfMonth, t.monthValue, t.hour, t.minute)
}

private fun finnUrl(d: FinnDeal, ad: FinnAd23?, old: FinnAd?): String? =
    ad?.url ?: old?.url ?: d.adUrl ?: d.code?.takeIf { c -> c.all(Char::isDigit) }?.let { "https://www.finn.no/recommerce/forsale/item/$it" }

/** Fullskjerm-annonsen. Vises når vm.m23.finnAdFor er satt (fra PaperApp, over fanelinjen). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FinnAdScreen23(vm: AppViewModel) {
    val id = vm.m23.finnAdFor ?: return
    val p = HomelabTheme.colors
    val ctx = LocalContext.current
    val s = vm.m23
    val detail = vm.finnDetail?.takeIf { it.deal.id == id }
    val deal = detail?.deal ?: vm.finn?.items?.firstOrNull { it.id == id }
    BackHandler { vm.closeFinnAd23() }
    LaunchedEffect(vm.finnSel) { if (vm.finnSel != id) s.finnAdFor = null }
    if (deal == null) return
    val ad = s.finnAd
    val imgs = (ad?.images?.takeIf { it.isNotEmpty() } ?: detail?.images?.takeIf { it.isNotEmpty() } ?: listOfNotNull(deal.image))
    val slides: List<String?> = imgs.ifEmpty { listOf(null, null, null) }
    val pager = rememberPagerState { slides.size }
    val url = finnUrl(deal, ad, detail?.ad)
    val other = deal.counterpart?.ifBlank { null } ?: "motparten"
    val st = (deal.level - 1).coerceIn(0, 3)
    val done = deal.finished
    val ini = deal.item.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase()
    BoxWithConstraints(Modifier.fillMaxSize().background(p.surface).clickable(remember { MutableInteractionSource() }, null) {}) {
        val screenH = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val h = minOf(this.maxWidth, screenH * 0.62f)
                Box(Modifier.fillMaxWidth().height(h).background(DsPalette.PapirMork.surface)) {
                    HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
                        val u = slides[i]
                        Box(Modifier.fillMaxSize().background(TINT23[Math.floorMod(deal.id + i, TINT23.size)]), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(ini, color = Color.White.copy(alpha = .4f), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, style = HomelabType.largeTitle)
                                Text("Bilde ${i + 1}", color = Color.White.copy(alpha = .4f), fontWeight = FontWeight.SemiBold, style = HomelabType.footnote)
                            }
                            if (u != null) FitImage23(vm, u, Modifier.matchParentSize())
                        }
                    }
                    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 14.dp, end = 14.dp, top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Row(Modifier.minimumInteractiveComponentSize().height(38.dp).clip(CircleShape).background(SCRIM).clickable(role = Role.Button, onClickLabel = "Tilbake til Finn") { vm.closeFinnAd23() }.padding(start = 6.dp, end = 14.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Text("Finn", color = Color.White, fontWeight = FontWeight.SemiBold, style = HomelabType.subheadline, modifier = Modifier.padding(start = 4.dp))
                        }
                        Box(Modifier.minimumInteractiveComponentSize().size(38.dp).clip(CircleShape).background(SCRIM).clickable(role = Role.Button, onClickLabel = "Rediger") { vm.closeFinnAd23(); vm.finnEdit = id },
                            contentAlignment = Alignment.Center) { Icon(Icons.Filled.Edit, contentDescription = "Rediger", tint = Color.White, modifier = Modifier.size(18.dp)) }
                    }
                    Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        slides.indices.forEach { i -> Box(Modifier.size(7.dp).clip(CircleShape).background(if (i == pager.currentPage) Color.White else Color.White.copy(alpha = .45f))) }
                    }
                    Box(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 10.dp).clip(RoundedCornerShape(10.dp)).background(DsPalette.PapirLys.textPrimary.copy(alpha = .65f)).padding(9.dp, 3.dp)) {
                        Text("${pager.currentPage + 1} / ${slides.size}", color = Color.White, fontWeight = FontWeight.Bold, style = HomelabType.caption)
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(16.dp, 18.dp, 16.dp, 40.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PLabel("${if (done) "Fullført" else deal.points[st]} · ${ddmm(deal.date)}", if (done) p.success else p.accent)
                    PSerif(ad?.title ?: detail?.ad?.title ?: deal.item, HomelabType.title2.fontSize, p.textPrimary)
                    PSerif(n0(deal.amount) + " kr", HomelabType.title2.fontSize, p.textPrimary, weight = FontWeight.Normal, maxLines = 1)
                    Text((if (deal.sold) "Solgt til " else "Kjøpt fra ") + other, color = p.textTertiary, style = HomelabType.subheadline)
                }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PLabel("Fiks ferdig", p.accent)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        deal.points.forEachIndexed { j, n ->
                            val c = when { j < st -> p.textPrimary; j == st && !done -> p.accent; done -> p.success; else -> p.line }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)).background(c))
                                Text(n, color = if (j <= st) p.textPrimary else p.textTertiary, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, maxLines = 1)
                            }
                        }
                    }
                }
                // Om annonsen
                val spec = ad?.attrs?.takeIf { it.isNotEmpty() } ?: listOfNotNull(detail?.ad?.place?.let { "Sted" to it })
                val desc = ad?.description ?: detail?.ad?.description
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PLabel("Om annonsen", p.accent)
                    if (spec.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).padding(horizontal = 14.dp, vertical = 2.dp)) {
                        spec.forEachIndexed { i, (a, b) ->
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(a, color = p.textTertiary, style = HomelabType.callout)
                                Text(b, color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    when {
                        desc != null -> Text(desc, color = p.textPrimary, style = HomelabType.callout, lineHeight = 23.sp, modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 4.dp))
                        s.finnAdBusy -> Text("Henter annonsen …", color = p.textTertiary, style = HomelabType.subheadline)
                        else -> Text("Annonsen er ikke lagret ennå.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.clickable { vm.refreshFinnAd23(id) })
                    }
                    if (ad?.removed == true) Text("Annonsen er fjernet fra Finn · viser lagret kopi", color = p.textTertiary, style = HomelabType.footnote)
                    if (url != null) Text("Åpne annonsen i Finn ›", color = p.accent, fontWeight = FontWeight.Bold, style = HomelabType.subheadline, textDecoration = TextDecoration.Underline,
                        modifier = Modifier.clickable { openLink(ctx, url) })
                }
                // E-poster (Proton Mail)
                val mails = s.finnMails ?: detail?.emails ?: emptyList()
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        PLabel("E-poster · ${mails.size}", p.accent, modifier = Modifier.weight(1f))
                        Text("Proton Mail", color = p.textTertiary, style = HomelabType.footnote)
                    }
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.surfaceRaised).padding(horizontal = 14.dp, vertical = 2.dp)) {
                        if (mails.isEmpty()) Text(if (s.finnAdBusy) "Henter e-poster …" else "Ingen e-poster koblet til handelen.", color = p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(vertical = 12.dp))
                        mails.forEachIndexed { i, m ->
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            val from = m.from ?: ""
                            val fl = from.lowercase()
                            val (lbl, lc) = when { "finn" in fl -> "F" to DsPalette.Category.blue; "posten" in fl || "bring" in fl -> "P" to DsPalette.Category.red; else -> from.trim().take(1).uppercase().ifEmpty { "@" } to p.textPrimary }
                            val open = s.finnMailOpen == m.id
                            Row(Modifier.fillMaxWidth().clickable { vm.toggleFinnMail23(id, m) }.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(lc), contentAlignment = Alignment.Center) {
                                    Text(lbl, color = if (lc == p.textPrimary) p.surface else Color.White, fontWeight = FontWeight.ExtraBold, style = HomelabType.subheadline)
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(m.subject ?: "(uten emne)", color = p.textPrimary, fontWeight = FontWeight.Bold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                        Text(mailTime(m.date), color = p.textTertiary, style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 1)
                                    }
                                    Text(from.substringBefore('<').trim().ifBlank { from }, color = p.textTertiary, style = HomelabType.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    if (open) Text(s.finnMailBody[m.id] ?: m.body ?: m.snippet ?: "Henter …", color = p.textPrimary, style = HomelabType.callout, lineHeight = 21.sp, modifier = Modifier.padding(top = 6.dp))
                                }
                            }
                        }
                    }
                }
                // Meldinger med motparten (fra e-postvarsler). Svar skjer i Finn (dyplenke).
                val chatUrl = s.finnChatUrl ?: url
                var msg by remember(id) { mutableStateOf("") }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        PLabel("Meldinger · $other", p.accent, modifier = Modifier.weight(1f))
                        if (chatUrl != null) Text("Åpne i Finn ›", color = p.textTertiary, style = HomelabType.footnote, modifier = Modifier.clickable { openLink(ctx, chatUrl) })
                    }
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.surface).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        val chat = s.finnChat ?: emptyList()
                        if (chat.isEmpty()) Text(if (s.finnChat == null && s.finnAdBusy) "Henter meldinger …" else "Ingen meldinger hentet ennå. Meldinger fra Finn-varsler i e-posten vises her.",
                            color = p.textTertiary, style = HomelabType.subheadline)
                        chat.forEach { c ->
                            Column(Modifier.fillMaxWidth(), horizontalAlignment = if (c.mine) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                val shape = if (c.mine) RoundedCornerShape(18.dp, 18.dp, 6.dp, 18.dp) else RoundedCornerShape(18.dp, 18.dp, 18.dp, 6.dp)
                                Box(Modifier.fillMaxWidth(.8f).wrapContentWidth(if (c.mine) Alignment.End else Alignment.Start)) {
                                    Text(c.text, color = if (c.mine) p.surface else p.textPrimary, style = HomelabType.callout, lineHeight = 20.sp,
                                        modifier = Modifier.clip(shape).background(if (c.mine) p.textPrimary else p.surfaceRaised).padding(13.dp, 9.dp))
                                }
                                c.time?.let { Text(mailTime(it).ifBlank { it }, color = p.textTertiary, style = HomelabType.caption, fontWeight = FontWeight.Normal, modifier = Modifier.padding(horizontal = 6.dp)) }
                            }
                        }
                        val send = {
                            val t = msg.trim()
                            if (t.isNotEmpty()) runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Melding", t)) }
                            openLink(ctx, chatUrl ?: "https://www.finn.no/messages")
                            if (t.isNotEmpty()) vm.flash("Meldingen er kopiert · lim den inn i Finn")
                            msg = ""
                        }
                        Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            BasicTextField(
                                msg, { msg = it }, singleLine = true,
                                textStyle = HomelabType.callout.copy(color = p.textPrimary, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium),
                                cursorBrush = SolidColor(p.accent),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }),
                                modifier = Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.surfaceRaised).border(1.dp, p.line, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
                                decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (msg.isEmpty()) Text("Skriv en melding …", color = p.textTertiary, style = HomelabType.callout); inner() } },
                            )
                            Box(Modifier.minimumInteractiveComponentSize().size(44.dp).clip(CircleShape).background(p.textPrimary).clickable(onClickLabel = "Send i Finn") { send() }, contentAlignment = Alignment.Center) {
                                Text("↑", color = p.surface, style = HomelabType.body)
                            }
                        }
                    }
                    Text("Finn har ikke åpent chat-API: Send kopierer meldingen og åpner samtalen i Finn.", color = p.textTertiary, style = HomelabType.footnote, lineHeight = 17.sp)
                }
            }
        }
    }
}

/** Bilde fra serveren, tilpasset (contain) som i annonsen. */
@Composable
private fun FitImage23(vm: AppViewModel, path: String, modifier: Modifier) {
    var bmp by remember(path) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(path) { if (path.startsWith("/")) bmp = vm.image(path) }
    bmp?.let { androidx.compose.foundation.Image(it.asImageBitmap(), null, contentScale = androidx.compose.ui.layout.ContentScale.Fit, modifier = modifier) }
}
