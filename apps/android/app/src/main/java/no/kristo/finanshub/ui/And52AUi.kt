@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.TextStyle as JTextStyle
import java.util.Locale

/*
 * Prompt 52 (AND52A) – grensesnittet (fasit Homelab.dc.html og prompt-52-pakken):
 *  - Chat: tankegangspillen «✦ Tenker … 2,1 s ▾» / «✦ Tenkte i 2,1 s ›» med nummererte steg, og miniatyrer 96 × 120 over boblen.
 *  - Familie: krasjgrense per kort («Kunne ikke laste») – brukes rundt kart, helse og «På vei hjem».
 *  - Finans → Mer (og vanlig Mer): bryterne Søkefelt · Finans/tittel · Verktøy i wiggle, farget bakgrunn og helfylte ikonbrikker.
 *  - Saldokortet: Standard · Glass · Kvittering · Fargebunn, hold inne 0,5 s → arket «Utseende på saldokortet».
 *  - Finans → Liste: månedslinja blir en avrundet, flytende pille når den er festet.
 *  - Kvitteringen: samme hode (logo, butikk, «kategori · dato · bolig», beløp, ✦ Glimt) i Transaksjoner og Boliger.
 *  - «Nytt i versjon»: ugjennomsiktig papirkort med fast hode og bunn, ett punkt per blokk, mørk Ok-knapp.
 */

private val NB52 = Locale("nb", "NO")

/* ======================= Chat: tankegang ======================= */

/** Pillen mens svaret lages. Sekundene teller opp; listen er åpen til svaret begynner å strømme. */
@Composable
internal fun ThinkLive52(v: ChatV27, hasStream: Boolean, fallback: List<String>) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Think52.t0, Think52.t1) { while (Think52.t1 == 0L) { now = System.currentTimeMillis(); delay(100) } }
    val lines = Think52.lines.ifEmpty { if (!hasStream) fallback else emptyList() }
    val done = Think52.t1 > 0L || hasStream
    if (done && lines.isEmpty()) return
    val secs = Think52.secs(now)
    ThinkPill52(v, if (done) "✦ Tenkte i ${secs52(secs)}" else "✦ Tenker … ${secs52(secs)}", Think52.openLive, live = !done) { Think52.openLive = !Think52.openLive }
    if (Think52.openLive) ThinkLines52(v, lines)
}

/** Lagret tankegang på et svar (åpnes igjen senere, også etter omstart). */
@Composable
internal fun ThinkSaved52(v: ChatV27, key: String, lines: List<String>, secs: Double?) {
    if (lines.isEmpty()) return
    val open = Think52.open[key] == true
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ThinkPill52(v, if (secs != null && secs > 0) "✦ Tenkte i ${secs52(secs)}" else "✦ Tankegang", open, live = false) { Think52.open[key] = !open }
        if (open) ThinkLines52(v, lines)
    }
}

@Composable
private fun ThinkPill52(v: ChatV27, text: String, open: Boolean, live: Boolean, onClick: () -> Unit) {
    val arrow = if (live) (if (open) " ▾" else " ▸") else (if (open) " ▾" else " ›")
    Row(
        Modifier.height(30.dp).clip(CircleShape).background(v.card).border(1.dp, v.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = if (open) "Skjul tankegangen" else "Vis tankegangen", onClick = onClick).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text + arrow, color = if (live) v.acc else v.mut, fontFamily = v.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
    }
}

@Composable
private fun ThinkLines52(v: ChatV27, lines: List<String>) {
    Column(
        Modifier.fillMaxWidth().padding(start = 6.dp).drawBehind { drawLine(v.line, Offset(0f, 0f), Offset(0f, size.height), 1.5.dp.toPx()) }
            .padding(start = 12.dp, top = 2.dp, bottom = 2.dp).animateContentSize(),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        lines.forEachIndexed { i, l ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${i + 1}.", color = v.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, modifier = Modifier.width(22.dp))
                Text(l, color = v.mut, fontFamily = v.sans, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.weight(1f))
            }
        }
    }
}

/* ======================= Chat: miniatyrer over boblen ======================= */

/** Bildene som miniatyrer 96 × 120 (radius 16/16/6/16, 1 dp kontur, myk skygge), høyrejustert og på rad med linjeskift. */
@Composable
internal fun ChatThumbs52(vm: AppViewModel, v: ChatV27, files: List<ChatFile50>) {
    val imgs = files.filter { it.isImage }
    if (imgs.isEmpty()) return
    val ctx = LocalContext.current.applicationContext
    val shape = RoundedCornerShape(16.dp, 16.dp, 6.dp, 16.dp)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        imgs.forEachIndexed { i, f ->
            val url = f.thumb ?: f.url
            var bmp by remember(url) { mutableStateOf(Img50.cached(vm.base, url)) }
            LaunchedEffect(url) { if (url != null && bmp == null) Img50.load(ctx, vm.base, vm.account?.token, url, 360)?.let { bmp = it } }
            Box(
                Modifier.size(96.dp, 120.dp).shadow(6.dp, shape, ambientColor = Color.Black.copy(alpha = .18f), spotColor = Color.Black.copy(alpha = .18f))
                    .clip(shape).background(v.card).border(1.dp, v.line, shape)
                    .clickable(role = Role.Button, onClickLabel = "Åpne ${f.name}") { Chat50.lightbox = imgs to i },
            ) {
                bmp?.let { Image(it.asImageBitmap(), f.name, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
                    ?: Text("▣", color = v.mut, fontSize = 18.sp, modifier = Modifier.align(Alignment.Center))
            }
        }
    }
}

/* ======================= Familie: krasjgrense per kort ======================= */

/** «Kunne ikke laste» i kortet som feilet; resten av siden virker. */
@Composable
internal fun FamCardErr52(what: String, modifier: Modifier = Modifier, retry: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp, 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Kunne ikke laste $what", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text("Resten av Familie virker som vanlig.", color = p.sub, fontSize = 12.5.sp)
        retry?.let { r -> Text("Prøv igjen ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(role = Role.Button, onClick = r)) }
    }
}

/** Regner ut data for et kort; feiler det (dårlige data fra serveren), gis null og kortet viser FamCardErr52. */
internal inline fun <T> famGuard52(what: String, block: () -> T): T? = try { block() } catch (e: Exception) {
    android.util.Log.w("Homelab", "Familie: $what feilet", e); null
}

/* ======================= Mer: skjul søkefelt og titler ======================= */

/** Synlighet per side: sok (søkefelt), tit (tittel «Finans»/«Hverdag og familie»), vkt (tittel «Verktøy»). false = skjult. */
internal object Mer52 {
    private val cache = mutableStateMapOf<String, Triple<Boolean, Boolean, Boolean>>()
    private fun key(vm: AppViewModel, page: String) = "papir_${page}_hid_vis_" + (vm.account?.id ?: "")

    fun vis(vm: AppViewModel, page: String): Triple<Boolean, Boolean, Boolean> {
        val k = key(vm, page)
        cache[k]?.let { return it }
        val o = runCatching { JSONObject(vm.prefs.str(k, "")) }.getOrNull()
        val t = Triple(o?.optBoolean("sok", true) ?: true, o?.optBoolean("tit", true) ?: true, o?.optBoolean("vkt", true) ?: true)
        cache[k] = t
        return t
    }

    fun set(vm: AppViewModel, page: String, t: Triple<Boolean, Boolean, Boolean>, push: Boolean = true) {
        val k = key(vm, page)
        cache[k] = t
        val o = JSONObject().put("sok", t.first).put("tit", t.second).put("vkt", t.third)
        vm.prefs.set(k, o.toString())
        // Synkes i layout.mer45 {fmerVis, merVis, salsty} som iOS (PUT /api/me/layout avviser ukjente toppnøkler).
        if (push) pushMer45(vm)
    }

    /** Legger fmerVis/merVis/salsty inn i mer45-objektet (Mer45.save sender hele objektet). */
    fun into(vm: AppViewModel, o: JSONObject): JSONObject {
        for ((page, f) in listOf("fmer" to "fmerVis", "mer" to "merVis")) {
            val t = vis(vm, page)
            o.put(f, JSONObject().put("sok", t.first).put("tit", t.second).put("vkt", t.third))
        }
        o.put("salsty", Sal52.style(vm))
        return o
    }

    /** PUT /api/me/layout {mer45: {…lagret mer45 (Mer45.kt)…, fmerVis, merVis, salsty}}. */
    fun pushMer45(vm: AppViewModel) {
        val k = "papir_mer45_" + (vm.account?.id ?: "")
        val o = into(vm, runCatching { JSONObject(vm.prefs.str(k, "")) }.getOrNull() ?: JSONObject())
        vm.prefs.set(k, o.toString())
        vm.launch50 { runCatching { vm.api50 { hlPut("/me/layout", JSONObject().put("mer45", o)) } } }
    }

    /** Fra GET /api/me/layout (annen enhet eller web). */
    fun apply(vm: AppViewModel, raw: String) {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val m = o.optJSONObject("mer45")
        for (page in listOf("fmer", "mer")) {
            val j = m?.optJSONObject(if (page == "fmer") "fmerVis" else "merVis") ?: o.optJSONObject("papir_${page}_hid_vis") ?: continue
            set(vm, page, Triple(j.optBoolean("sok", true), j.optBoolean("tit", true), j.optBoolean("vkt", true)), push = false)
        }
    }
}

/** Raden med tre brytere øverst i wiggle: Søkefelt · Finans (tittel) · Verktøy. På = svart pille med ✓, av = kontur med +. */
@Composable
internal fun MerHideRow52(vm: AppViewModel, page: String, titLabel: String) {
    val (sok, tit, vkt) = Mer52.vis(vm, page)
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        HidePill52("Søkefelt", sok) { Mer52.set(vm, page, Triple(!sok, tit, vkt)) }
        HidePill52(titLabel, tit) { Mer52.set(vm, page, Triple(sok, !tit, vkt)) }
        HidePill52("Verktøy", vkt) { Mer52.set(vm, page, Triple(sok, tit, !vkt)) }
    }
}

@Composable
private fun HidePill52(label: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.height(36.dp).clip(CircleShape).then(if (on) Modifier.background(p.ink) else Modifier.border(1.5.dp, p.line, CircleShape))
            .clickable(role = Role.Switch, onClickLabel = if (on) "Skjul $label" else "Vis $label") { Haptics.select(); onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text((if (on) "✓ " else "+ ") + label, color = if (on) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
}

/** Modulfargene fra claude-code-finans-mer-farge-skjul.md. */
internal fun merColor52(key: String): Color = Color(when (key) {
    "kontoer", "aksjer", "abo", "saldo" -> 0xFF2F6B4A
    "budsjett", "boliger" -> 0xFFB23A2A
    "kvitt", "finn" -> 0xFFA0671A
    "faste", "konto" -> 0xFF2B5D8A
    "fimport" -> 0xFF7A5AD6
    "rapp", "liste", "innst" -> 0xFF6B665C
    else -> FM_COLORS[key] ?: 0xFF6B665C
})

/** Kortbakgrunn: modulfargen 13 % blandet inn i kortfargen (følger lyst/mørkt tema). */
@Composable
internal fun merTint52(key: String): Color = lerp(PaperPal.current.card, merColor52(key), .13f)

/* ======================= Saldokortet: utseender ======================= */

internal object Sal52 {
    private val cache = mutableStateMapOf<String, String>()
    var sheet by mutableStateOf(false)
    private fun key(vm: AppViewModel) = "papir_salsty_" + (vm.account?.id ?: "")
    fun style(vm: AppViewModel): String = cache.getOrPut(key(vm)) { vm.prefs.str(key(vm), "std").takeIf { s -> SALSTY52.any { it.first == s } } ?: "std" }
    fun set(vm: AppViewModel, s: String, push: Boolean = true) {
        cache[key(vm)] = s
        vm.prefs.set(key(vm), s)
        if (push) Mer52.pushMer45(vm) // layout.mer45.salsty (samme felt som iOS)
    }
    fun apply(vm: AppViewModel, raw: String) {
        val s = runCatching { JSONObject(raw).let { o -> o.optJSONObject("mer45")?.optString("salsty", "")?.takeIf { it.isNotBlank() } ?: o.optString("papir_salsty", "") } }.getOrDefault("")
        if (SALSTY52.any { it.first == s }) set(vm, s, push = false)
    }
}

/** Saldokortet i valgt utseende. Kort trykk åpner Kontoer; hold inne 0,5 s åpner arket (ikke Kontoer, ikke wiggle). */
@Composable
internal fun SaldoCard52(vm: AppViewModel, saldo: Double, spent: Double, onOpen: () -> Unit) {
    val style = Sal52.style(vm)
    val gest = Modifier.pointerInput(Unit) {
        detectTapGestures(onLongPress = { Haptics.tap(); Sal52.sheet = true }, onTap = { onOpen() })
    }
    SaldoBody52(style, saldo, spent, gest)
    if (Sal52.sheet) SalSheet52(vm, saldo, spent)
}

@Composable
private fun SaldoBody52(style: String, saldo: Double, spent: Double, gest: Modifier, small: Boolean = false) {
    val p = PaperPal.current
    val today = LocalDate.now()
    val d = today.dayOfMonth
    val dm = today.lengthOfMonth()
    val month = today.month.getDisplayName(JTextStyle.FULL_STANDALONE, NB52).lowercase(NB52)
    val k = if (small) .42f else 1f
    val glass = style == "glass"
    val ink = if (glass) Color.White else p.ink
    val mut = if (glass) Color.White.copy(alpha = .72f) else p.mut
    val labC = if (glass) Color(0xFFFFD2C8) else p.lab
    val r = when (style) { "glass" -> 28.dp; "kvitt" -> 18.dp; "farge" -> 32.dp; else -> 26.dp } * k
    val shape = RoundedCornerShape(r)
    val shadowC = if (style == "farge") p.lab.copy(alpha = .55f) else Color(0x731B1A17)
    val base = Modifier.fillMaxWidth().shadow(14.dp * k, shape, ambientColor = shadowC, spotColor = shadowC).clip(shape).then(gest)
    val top: @Composable ColumnScope.() -> Unit = {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("SALDO · ALLE KONTOER", color = labC, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp * k, letterSpacing = 1.2.sp * k,
                maxLines = 1, modifier = Modifier.weight(1f))
            if (style == "kvitt") Text("›", color = ink, fontWeight = FontWeight.Bold, fontSize = 17.sp * k)
            else Box(Modifier.size(30.dp * k).clip(CircleShape).background(if (glass) Color.White.copy(alpha = .16f) else p.bg), contentAlignment = Alignment.Center) {
                Text("›", color = ink, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp * k)
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp * k)) {
            Text(neg0(saldo), color = ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 52.sp * k, lineHeight = 52.sp * k, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Text("kr", color = mut, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 30.sp * k, maxLines = 1, modifier = Modifier.padding(bottom = 4.dp * k))
        }
    }
    @Composable
    fun spentRow(fg: Color, sub: Color, ring: Color, track: Color, bg: Color?) {
        Row(
            Modifier.fillMaxWidth().then(if (bg != null) Modifier.clip(RoundedCornerShape(18.dp * k)).background(bg) else Modifier).padding(horizontal = 14.dp * k, vertical = 12.dp * k),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp * k),
        ) {
            Ring52(d, dm, ring, track, fg, 46.dp * k)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text("Brukt i $month · dag $d av $dm", color = sub, fontSize = 12.5.sp * k, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${n0(spent)} kr", color = fg, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 26.sp * k, lineHeight = 27.sp * k, maxLines = 1)
            }
        }
    }
    when (style) {
        "glass" -> Column(
            base.background(Color(0x801B1A17)).border(1.dp, Color.White.copy(alpha = .22f), shape)
                .drawBehind { drawLine(Color.White.copy(alpha = .4f), Offset(r.toPx(), .5f), Offset(size.width - r.toPx(), .5f), 1.dp.toPx()) }.padding(20.dp * k),
            verticalArrangement = Arrangement.spacedBy(16.dp * k),
        ) { top(); spentRow(Color.White, Color.White.copy(alpha = .72f), Color(0xFFF08A76), Color.White.copy(alpha = .25f), Color.White.copy(alpha = .1f)) }
        "kvitt" -> Column(base.background(p.card).border(1.dp, p.line.copy(alpha = .7f), shape)) {
            Column(Modifier.padding(20.dp * k, 20.dp * k, 20.dp * k, 14.dp * k), verticalArrangement = Arrangement.spacedBy(16.dp * k)) { top() }
            // Stiplet skillelinje med halvsirkel-hakk (Ø 20) i bakgrunnsfarge på hver side.
            val bg = p.bg; val line = p.line
            Box(Modifier.fillMaxWidth().height(20.dp * k).drawBehind {
                val rr = size.height / 2
                drawLine(line, Offset(rr + 6f, rr), Offset(size.width - rr - 6f, rr), 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 7f)))
                drawCircle(bg, rr, Offset(0f, rr)); drawCircle(bg, rr, Offset(size.width, rr))
            })
            Box(Modifier.padding(6.dp * k, 4.dp * k, 6.dp * k, 10.dp * k)) { spentRow(p.ink, p.mut, p.lab, p.line.copy(alpha = .8f), null) }
        }
        "farge" -> Column(base.background(p.lab)) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(r, r, 28.dp * k, 28.dp * k)).background(p.card).padding(20.dp * k),
                verticalArrangement = Arrangement.spacedBy(16.dp * k),
            ) { top() }
            Box(Modifier.padding(6.dp * k, 6.dp * k, 6.dp * k, 10.dp * k)) { spentRow(p.onLab, p.onLab.copy(alpha = .82f), p.onLab, p.onLab.copy(alpha = .3f), null) }
        }
        else -> Column(base.background(p.card).border(1.dp, p.line.copy(alpha = .7f), shape).padding(20.dp * k), verticalArrangement = Arrangement.spacedBy(16.dp * k)) {
            top(); spentRow(p.ink, p.mut, p.lab, p.line.copy(alpha = .8f), p.bg)
        }
    }
}

@Composable
private fun Ring52(d: Int, dm: Int, ring: Color, track: Color, fg: Color, size: Dp) {
    val frac = (d.toFloat() / dm).coerceIn(0f, 1f)
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val sw = this.size.minDimension * .11f
            val inset = sw / 2
            val sz = Size(this.size.width - sw, this.size.height - sw)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), sz, style = Stroke(sw))
            drawArc(ring, -90f, 360f * frac, false, Offset(inset, inset), sz, style = Stroke(sw))
        }
        Text("$d.", color = fg, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = (size.value * .24f).sp, maxLines = 1, softWrap = false)
    }
}

/** «Utseende på saldokortet»: 2 × 2 forhåndsvisninger, valgt har rød kant og ✓. Trykk velger straks; Ferdig eller utenfor lukker. */
@Composable
private fun SalSheet52(vm: AppViewModel, saldo: Double, spent: Double) {
    val p = PaperPal.current
    val close = { Sal52.sheet = false }
    BackHandler { close() }
    androidx.compose.ui.window.Dialog(onDismissRequest = close, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = close), contentAlignment = Alignment.BottomCenter) {
            Column(
                Modifier.widthIn(max = 560.dp).fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(p.bg)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                    .navigationBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp, 10.dp, 16.dp, 22.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(36.dp, 5.dp).clip(CircleShape).background(p.line))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PSerif("Utseende på saldokortet", 22.sp, modifier = Modifier.weight(1f), maxLines = 2)
                    SheetButton30("Ferdig", onClick = close)
                }
                val cur = Sal52.style(vm)
                SALSTY52.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { (k, n) ->
                            val on = k == cur
                            Column(
                                Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.surf2)
                                    .border(if (on) 2.dp else 1.dp, if (on) p.lab else p.line, RoundedCornerShape(18.dp))
                                    .clickable(role = Role.RadioButton, onClickLabel = n) { Haptics.select(); Sal52.set(vm, k) }.padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                SaldoBody52(k, saldo, spent, Modifier, small = true)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(n, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                                    if (on) Text("✓", color = p.lab, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ======================= Finans → Liste: avrundet månedslinje ======================= */

/** Som MonthHead43, men festet øverst blir den en flytende pille (radius 16, kort 88 %, kontur, skygge, uten svart strek). */
@Composable
internal fun MonthHead52(ym: String, cat: String, count: Int, net: Double, top: Dp, pinned: Boolean) {
    val p = PaperPal.current
    val m = runCatching { java.time.YearMonth.parse(ym) }.getOrNull()
    val now = java.time.YearMonth.now()
    val full = m?.month?.getDisplayName(JTextStyle.FULL_STANDALONE, NB52)?.uppercase(NB52) ?: ym
    val short = m?.month?.getDisplayName(JTextStyle.SHORT_STANDALONE, NB52)?.uppercase(NB52)?.trimEnd('.') ?: ym
    val yr = if (m != null && m.year != now.year) " ${m.year}" else ""
    val label = if (cat == "Alle") "$full$yr · $count" else "${cat.uppercase(NB52)} · $short$yr · $count"
    val netTxt = (if (net > 0) "+" else if (net < 0) "−" else "") + (if (Privacy.hidden) "•••" else
        java.text.NumberFormat.getNumberInstance(NB52).apply { minimumFractionDigits = 2; maximumFractionDigits = 2 }.format(kotlin.math.abs(net)).replace(' ', ' '))
    val spec = tween<Dp>(220)
    val radius by animateDpAsState(if (pinned) 16.dp else 0.dp, spec, label = "r52")
    val padV by animateDpAsState(if (pinned) 10.dp else 0.dp, spec, label = "v52")
    val padH by animateDpAsState(if (pinned) 14.dp else 0.dp, spec, label = "h52")
    val out by animateDpAsState(if (pinned) 6.dp else 0.dp, spec, label = "o52")
    val gap by animateDpAsState(if (pinned) 10.dp else top, spec, label = "g52")
    val elev by animateDpAsState(if (pinned) 12.dp else 0.dp, spec, label = "e52")
    val lineA by animateFloatAsState(if (pinned) 0f else 1f, tween(220), label = "l52")
    val shape = RoundedCornerShape(radius)
    Box(Modifier.fillMaxWidth().padding(top = gap)) {
        Column(
            Modifier.fillMaxWidth().offset(x = -out).requiredWidthIn(min = 0.dp).layoutWider52(out)
                .shadow(elev, shape, ambientColor = Color(0x731B1A17), spotColor = Color(0x731B1A17)).clip(shape)
                .background(if (pinned) p.card.copy(alpha = .88f).compositeOverSafe52(p.bg) else p.bg)
                .then(if (pinned) Modifier.border(1.dp, p.line, shape) else Modifier).padding(horizontal = padH, vertical = padV),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.26.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text("Netto $netTxt kr", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp, maxLines = 1)
            }
            if (lineA > 0.01f) Box(Modifier.fillMaxWidth().padding(top = 6.dp * lineA).height(2.dp * lineA).background(p.ink.copy(alpha = lineA)))
        }
    }
}

/** Gjør elementet 2 × extra bredere enn foreldrene (6 dp utenfor listen på hver side). */
private fun Modifier.layoutWider52(extra: Dp): Modifier = this.then(Modifier.layout { measurable, constraints ->
    val ex = (extra.roundToPx() * 2)
    val c = if (constraints.hasBoundedWidth) constraints.copy(minWidth = constraints.maxWidth + ex, maxWidth = constraints.maxWidth + ex) else constraints
    val pl = measurable.measure(c)
    layout(constraints.maxWidth.takeIf { constraints.hasBoundedWidth } ?: pl.width, pl.height) { pl.place(0, 0) }
})

private fun Color.compositeOverSafe52(bg: Color): Color = this.compositeOver(bg)

/* ======================= Kvitteringen: samme hode i Transaksjoner og Boliger ======================= */

/** Logo + butikk + «kategori · dato · bolig/konto» + stort beløp + ✦ Glimt-tekst. Samme komponent i Finans og Boliger. */
@Composable
internal fun ReceiptHead52(
    vm: AppViewModel, domain: String?, merchant: String, color: Long, sub: String, amount: String, amountColor: Color? = null,
    glimt: String? = null, logoUrl: String? = null, extra: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val p = PaperPal.current
    PCard(shadow = true) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (logoUrl != null && logoUrl.startsWith("/")) ServerImage(vm, logoUrl, Modifier.size(46.dp).clip(RoundedCornerShape(13.dp)).background(p.surf2)) {
                    Text(merchant.trim().take(1).uppercase(), color = p.ink, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.align(Alignment.Center))
                } else Logo(vm, domain, merchant, color, 46, RoundedCornerShape(13.dp))
                Column(Modifier.weight(1f)) {
                    PSerif(merchant, 22.sp, maxLines = 2)
                    Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            extra?.invoke(this)
            PSerif(amount, 40.sp, amountColor ?: p.ink, weight = FontWeight.Normal, maxLines = 1)
            glimt?.takeIf { it.isNotBlank() }?.let { Text("✦ $it", color = p.lab, fontSize = 14.sp, lineHeight = 20.sp) }
        }
    }
}

/** Papir-gjengivelsen av kvitteringen (varelinjer, stiplet linje, TOTAL), som i Transaksjoner. */
@Composable
internal fun ReceiptSlip52(merchant: String, date: String, lines: List<Pair<String, Double?>>, total: Double?, onOpen: (() -> Unit)?) {
    val slip = Color(0xFFFBF8F1)
    val ink = Color(0xFF2A2822)
    Column(
        Modifier.fillMaxWidth().shadow(6.dp, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(slip)
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier).padding(18.dp, 16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(merchant.uppercase(), color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, textAlign = TextAlign.Center)
        Text("${ddmm(date)} · KVITTERING", color = ink.copy(alpha = .7f), fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
        Dash52(ink)
        if (lines.isEmpty()) Text("Varelinjene er ikke lest ennå", color = ink.copy(alpha = .6f), fontFamily = PaperFonts.mono, fontSize = 12.sp)
        lines.forEach { (n, v) ->
            Row(Modifier.fillMaxWidth()) {
                Text(n, color = ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(v?.let { n2(it) } ?: "", color = ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp)
            }
        }
        Dash52(ink)
        Row(Modifier.fillMaxWidth()) {
            Text("TOTAL", color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            Text(total?.let { n2(it) } ?: "–", color = ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
        }
        if (onOpen != null) Text("Trykk for originalen", color = ink.copy(alpha = .55f), fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun Dash52(c: Color) = Canvas(Modifier.fillMaxWidth().height(9.dp)) {
    drawLine(c.copy(alpha = .5f), Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 5f)))
}

/** Detaljen fra GET /finans/api/homes/:id/expenses/:eid (kvitteringspanelet), hentet når arket åpnes. */
internal class BoligRc52(val logoUrl: String?, val domain: String?, val lines: List<Pair<String, Double?>>, val glimt: String?, val fileUrl: String?, val thumbUrl: String?, val isPdf: Boolean, val category: String?)

internal fun parseBoligRc52(o: JSONObject): BoligRc52 {
    val la = o.optJSONArray("lines")
    val lines = (0 until (la?.length() ?: 0)).mapNotNull { i -> la?.optJSONObject(i)?.let { l -> (l.optStr("name") ?: return@let null) to l.optDouble("amount").takeIf { !it.isNaN() } } }
    val rc = o.optJSONObject("receipt")
    val logo = o.optJSONObject("logo") ?: o.optJSONObject("merchant_logo")
    return BoligRc52(logo?.optStr("url"), null, lines, o.optStr("aiLong") ?: o.optStr("aiShort"), rc?.optStr("fileUrl") ?: o.optStr("fileUrl"),
        rc?.optStr("thumbUrl") ?: o.optStr("thumbUrl"), rc?.optBoolean("isPdf") == true, o.optStr("categoryName") ?: o.optStr("category"))
}

/* ======================= «Nytt i versjon» ======================= */

private val WN_BG = Color(0xFFFBF8F2)
private val WN_INK = Color(0xFF1B1A17)
private val WN_BODY = Color(0xFF3D3A34)
private val WN_SUB = Color(0xFF6B665C)
private val WN_LINE = Color(0xFFD8D1C2)
private val WN_SEP = Color(0xFFE6DFD2)
private val WN_RED = Color(0xFFB23A2A)

/** Ugjennomsiktig papirkort med slør bak; på mobil bunnark i full bredde. Hode og Ok-knapp står fast, bare listen scroller. */
@Composable
internal fun WhatsNew52Card(w: WhatsNew51, onClose: () -> Unit) {
    BackHandler { onClose() }
    val pts = w.points52.ifEmpty { w.items.map { cleanTitle52(it) to "" } }
    Box(
        Modifier.fillMaxSize().background(Color(0x591B1A17)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val wide = maxWidth >= 600.dp
            val shape = if (wide) RoundedCornerShape(24.dp) else RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
            Column(
                Modifier.align(Alignment.BottomCenter).then(if (wide) Modifier.padding(bottom = 24.dp).widthIn(max = 440.dp) else Modifier).fillMaxWidth()
                    .heightIn(max = 640.dp).shadow(24.dp, shape, ambientColor = Color(0x731B1A17), spotColor = Color(0x731B1A17)).clip(shape).background(WN_BG)
                    .border(1.dp, WN_LINE, shape).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
            ) {
                // Hode (fast)
                Column(Modifier.fillMaxWidth().padding(24.dp, 22.dp, 24.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("NYTT I HOMELAB", color = WN_RED, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.26.sp)
                    Text("Versjon ${w.version}", color = WN_INK, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 28.sp, lineHeight = 31.sp)
                    val date = whatsDate52(w.date)
                    if (date.isNotBlank()) Text(date, color = WN_SUB, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WN_LINE))
                // Innhold (scroller), fade nederst
                Box(Modifier.weight(1f, fill = false)) {
                    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp, 16.dp, 24.dp, 22.dp)) {
                        pts.forEachIndexed { i, (h, t) ->
                            if (i > 0) Box(Modifier.padding(vertical = 14.dp).fillMaxWidth().height(1.dp).background(WN_SEP))
                            Text(h, color = WN_INK, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp)
                            if (t.isNotBlank()) Text(t, color = WN_BODY, fontFamily = PaperFonts.sans, fontSize = 14.sp, lineHeight = 21.7.sp, maxLines = 4,
                                overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(28.dp).background(Brush.verticalGradient(listOf(WN_BG.copy(alpha = 0f), WN_BG))))
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(WN_LINE))
                // Bunn (fast)
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(24.dp, 14.dp, 24.dp, 20.dp), horizontalArrangement = Arrangement.End) {
                    var focused by remember { mutableStateOf(false) }
                    Box(
                        Modifier.height(46.dp).onFocusChanged { focused = it.isFocused }
                            .then(if (focused) Modifier.border(2.dp, WN_RED, RoundedCornerShape(26.dp)).padding(3.dp) else Modifier)
                            .clip(RoundedCornerShape(23.dp)).background(WN_INK).clickable(role = Role.Button, onClick = onClose).padding(horizontal = 26.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Ok", color = Color(0xFFF3EFE6), fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, fontSize = 14.5.sp) }
                }
            }
        }
    }
}
