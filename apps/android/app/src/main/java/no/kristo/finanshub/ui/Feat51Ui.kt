package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.text.NumberFormat
import java.util.Locale

/*
 * Prompt 51 (ANDFEAT51): skallet for sidene i Feat51.kt (Pages51) og felles byggeklosser.
 *  - Sidene ligger i fullskjerm over Papir-skallet (som Familie og Media), med «‹ Tilbake», serif-tittel og egen melding nederst.
 *  - Fold/brett (LocalWide45): innholdet er sentrert med maks 980 dp, og sidene bruker to kolonner der det passer (Cols51).
 *  - Farger fra PaperPal (lys/mørk/glass). Berøringsflater ≥ 48 dp og TalkBack-etiketter på knapper uten tekst.
 */

private val nb51f = Locale("nb", "NO")

/** «1 234 kr» / «−1 234 kr» (to desimaler når beløpet har øre og [dec] er sann). Beløp skjules med «Skjul beløp». */
internal fun kr51(v: Double, dec: Boolean = false): String {
    if (Privacy.hidden) return "••• kr"
    val f = NumberFormat.getNumberInstance(nb51f).apply {
        val d = if (dec && Math.abs(v) % 1.0 > 0.004) 2 else 0
        minimumFractionDigits = d; maximumFractionDigits = d
    }
    return (if (v < -0.004) "−" else "") + f.format(Math.abs(v)).replace(' ', ' ').replace(' ', ' ') + " kr"
}

/** «+120 kr» / «−99 kr». */
internal fun krS51(v: Double): String = if (Privacy.hidden) "••• kr" else (if (v > 0.004) "+" else "") + kr51(v, dec = true)

internal fun num51(v: Double, dec: Int = 0): String = NumberFormat.getNumberInstance(nb51f).apply { minimumFractionDigits = dec; maximumFractionDigits = dec }.format(v).replace(' ', ' ')

private val MON51 = listOf("jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des.")

/** «2025-10-29» → «29. okt.». */
internal fun dl51(iso: String?): String {
    if (iso == null || iso.length < 10) return ""
    val m = iso.substring(5, 7).toIntOrNull() ?: return iso
    val d = iso.substring(8, 10).toIntOrNull() ?: return iso
    return "$d. ${MON51.getOrElse(m - 1) { "" }}"
}

/* ---------------- Skallet ---------------- */

@Composable
internal fun Pages51(vm: AppViewModel) {
    val page = F51.page ?: return
    if (!vm.loggedIn) return
    val p = PaperPal.current
    BackHandler { close51() }
    LaunchedEffect(F51.toast) { if (F51.toast != null) { delay(3200); F51.toast = null } }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}) {
        when (page) {
            "plan" -> Plan51Page(vm)
            "famcal" -> FamCal51Page(vm)
            "kveld" -> Tonight51Page(vm)
            "lyd" -> Audio51Page(vm)
            "subs" -> Subs51Page(vm)
            "lagring" -> Storage51Page(vm)
            "sok" -> Search51Page(vm)
            "tema" -> Theme51Page(vm)
            else -> Page51("Ukjent side", "") { Text("Siden finnes ikke i denne versjonen.", color = p.mut) }
        }
        F51.toast?.let { t ->
            Box(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 28.dp, start = 24.dp, end = 24.dp).widthIn(max = 560.dp)
                    .shadow(12.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(p.ink).padding(18.dp, 11.dp)
                    .semantics { contentDescription = t },
            ) { Text(t, color = p.bg, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 4) }
        }
    }
}

/** En side: «‹ Tilbake», liten etikett, serif-tittel og innhold som ruller. [right] er valgfri knapp oppe til høyre. */
@Composable
internal fun Page51(
    title: String, kicker: String, right: (@Composable () -> Unit)? = null, onRefresh: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = PaperPal.current
    val wide = LocalWide45.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier.fillMaxHeight().widthIn(max = if (wide) 980.dp else 640.dp).fillMaxWidth().verticalScroll(rememberScrollState())
                .statusBarsPadding().navigationBarsPadding().padding(start = 18.dp, end = 18.dp, top = 6.dp, bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button, onClickLabel = "Tilbake") { close51() }.padding(end = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) { Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                Spacer(Modifier.weight(1f))
                if (onRefresh != null) Box(
                    Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Oppdater") { Haptics.tap(); onRefresh() }
                        .semantics { contentDescription = "Oppdater" },
                    contentAlignment = Alignment.Center,
                ) { Text("↻", color = p.ink, fontSize = 20.sp) }
                right?.invoke()
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (kicker.isNotBlank()) PLabel(kicker)
                PSerif(title, 34.sp, modifier = Modifier.semantics { heading() })
            }
            content()
        }
    }
}

/** Faner som piller i en rad som kan rulles sidelengs. */
@Composable
internal fun Tabs51(tabs: List<Pair<String, String>>, sel: String, onSel: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        tabs.forEach { (k, n) -> Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.Center) { PChip(n, k == sel) { onSel(k) } } }
    }
}

/** To kolonner på brett, én på telefon. */
@Composable
internal fun Cols51(left: @Composable ColumnScope.() -> Unit, right: @Composable ColumnScope.() -> Unit) {
    if (LocalWide45.current) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1.2f), verticalArrangement = Arrangement.spacedBy(12.dp), content = left)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp), content = right)
    } else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) { left(); right() }
}

/** Laster: lite hjul og tekst. */
@Composable
internal fun Loading51(text: String = "Henter …") {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(Modifier.size(20.dp), color = p.lab, strokeWidth = 2.dp)
        Text(text, color = p.mut, fontSize = 14.sp)
    }
}

/** Feil med «Prøv igjen». */
@Composable
internal fun Err51(text: String, retry: () -> Unit) {
    val p = PaperPal.current
    PCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(text, color = p.lab, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            PButton("Prøv igjen", kind = "line", height = 48.dp) { retry() }
        }
    }
}

/** Standardflyt for en nøkkel: laster, feil eller innhold. */
@Composable
internal fun Keyed51(vm: AppViewModel, key: String, content: @Composable (org.json.JSONObject) -> Unit) {
    LaunchedEffect(key, vm.activeId) { vm.load51(key) }
    val d = F51.data[key]
    val e = F51.err[key]
    when {
        d != null -> content(d)
        e != null -> Err51(e) { vm.load51(key, force = true) }
        else -> Loading51()
    }
}

/** Kort med polstring og mellomrom. */
@Composable
internal fun Card51(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    PCard(modifier, onClick = onClick) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content) }
}

/** Liten merkelapp: «ok» (grønn), «warn» (rød) eller dempet. */
@Composable
internal fun Tag51(text: String, tone: String) {
    val p = PaperPal.current
    val c = when (tone) { "ok" -> p.pos; "warn" -> p.lab; else -> p.mut }
    Box(Modifier.clip(CircleShape).background(c.copy(alpha = .14f)).padding(horizontal = 10.dp, vertical = 3.dp)) {
        Text(text, color = c, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Fremdriftslinje 0–100. */
@Composable
internal fun Bar51(pct: Double, color: Color = PaperPal.current.pos, label: String? = null) {
    val p = PaperPal.current
    val f = (pct / 100.0).coerceIn(0.0, 1.0).toFloat()
    Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(p.surf2).semantics { contentDescription = label ?: "${num51(pct)} prosent" }) {
        Box(Modifier.fillMaxWidth(f).fillMaxHeight().clip(CircleShape).background(color))
    }
}

/** Rad: tekst til venstre (tittel + undertekst), verdi til høyre. */
@Composable
internal fun Line51(title: String, sub: String?, value: String?, valueColor: Color = PaperPal.current.ink, top: Boolean = true, onClick: (() -> Unit)? = null) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (!value.isNullOrBlank()) Text(value, color = valueColor, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

/** Mindre knapp i en rad (≥ 48 dp høy berøringsflate). */
@Composable
internal fun Btn51(text: String, kind: String = "line", busy: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    PButton(if (busy) "…" else text, modifier, kind = kind, height = 48.dp) { if (!busy && F51.acting == null) onClick() }
}

/** Valg i en rad av piller (f.eks. 30/60/90 dager). */
@Composable
internal fun Choice51(opts: List<Pair<String, String>>, sel: String, onSel: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        opts.forEach { (k, n) -> Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.Center) { PChip(n, k == sel) { onSel(k) } } }
    }
}

/** Saldoprognose som linje med laveste punkt og nullstrek. */
@Composable
internal fun Spark51(values: List<Double>, label: String, modifier: Modifier = Modifier.fillMaxWidth().height(120.dp)) {
    if (values.size < 2) return
    val p = PaperPal.current
    val ink = p.ink
    val lab = p.lab
    val line = p.line
    Canvas(modifier.semantics { contentDescription = label }) {
        val mn = values.min(); val mx = values.max()
        val pad = maxOf(1.0, (mx - mn) * 0.12)
        val lo = mn - pad; val hi = mx + pad
        fun x(i: Int) = i.toFloat() / (values.size - 1) * size.width
        fun y(b: Double) = (size.height - 8f - ((b - lo) / (hi - lo)).toFloat() * (size.height - 16f))
        if (lo < 0 && hi > 0) drawLine(line, Offset(0f, y(0.0)), Offset(size.width, y(0.0)), 2f)
        val path = Path()
        values.forEachIndexed { i, v -> if (i == 0) path.moveTo(x(i), y(v)) else path.lineTo(x(i), y(v)) }
        drawPath(path, ink, style = Stroke(width = 4f))
        val minI = values.indexOf(mn)
        drawCircle(lab, 7f, Offset(x(minI), y(mn)))
    }
}

/** Tom tilstand med forklaring. */
@Composable
internal fun Empty51(title: String, text: String) {
    val p = PaperPal.current
    Card51 {
        PSerif(title, 20.sp)
        Text(text, color = p.mut, fontSize = 13.5.sp)
    }
}

/** Initialer i farget sirkel (familiemedlem). */
@Composable
internal fun Ini51(name: String, color: Color? = null, size: Dp = 34.dp) {
    val p = PaperPal.current
    Box(Modifier.size(size).clip(CircleShape).background(color ?: p.surf2).border(1.dp, p.line, CircleShape), contentAlignment = Alignment.Center) {
        Text(initials39(name).ifBlank { "?" }, color = if (color != null) Color.White else p.ink, fontSize = (size.value * 0.36f).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** #rrggbb → farge (null ved ugyldig). */
internal fun hex51(s: String?): Color? = s?.trim()?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

/** Bilde fra serveren (med token), med plassholder til det er hentet. */
@Composable
internal fun NetImg51(vm: AppViewModel, url: String?, desc: String?, modifier: Modifier, placeholder: @Composable () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current.applicationContext
    var bmp by remember(url) { mutableStateOf(no.kristo.finanshub.Img50.cached(vm.base, url)) }
    LaunchedEffect(url) { if (bmp == null && !url.isNullOrBlank()) bmp = no.kristo.finanshub.Img50.load(ctx, vm.base, vm.account?.token, url, 640) }
    val b = bmp
    Box(modifier, contentAlignment = Alignment.Center) {
        if (b != null) androidx.compose.foundation.Image(
            b.asImageBitmap51(), desc, contentScale = androidx.compose.ui.layout.ContentScale.Crop, modifier = Modifier.fillMaxSize(),
        ) else placeholder()
    }
}

private fun android.graphics.Bitmap.asImageBitmap51() = this.asImageBitmap()

/** Bekreftelse før noe slettes. [onOk] kjøres bare ved «Ja». */
@Composable
internal fun Confirm51(title: String, text: String, ok: String, onDismiss: () -> Unit, onOk: () -> Unit) {
    val p = PaperPal.current
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss, containerColor = p.card,
        title = { Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
        text = { Text(text, color = p.ink, fontSize = 14.sp) },
        confirmButton = { androidx.compose.material3.TextButton({ onDismiss(); onOk() }, Modifier.heightIn(min = 48.dp)) { Text(ok, color = p.lab, fontWeight = FontWeight.Bold) } },
        dismissButton = { androidx.compose.material3.TextButton(onDismiss, Modifier.heightIn(min = 48.dp)) { Text("Avbryt", color = p.ink) } },
    )
}

/** Tall fra felt: «1 234,50», «−200». */
internal fun parse51(s: String): Double? = s.replace(" ", "").replace(" ", "").replace(" ", "").replace("−", "-").replace(',', '.').toDoubleOrNull()

/** Id fra JSON som tall når det går (serverens id-er er heltall), ellers tekst. */
internal fun id51(s: String): Any = s.toLongOrNull() ?: s
