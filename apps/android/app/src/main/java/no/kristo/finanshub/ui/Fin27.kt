package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 27 (ANDROID-B): Finans-søkeforslag (Google-stil), Innstillinger → AI og tolkning → PERSONVERN OG LOGOER med AI-logg,
 * «Velg logo» der logo mangler, og «Fra skjermbilde» i Legg til abonnement. Logikken ligger i Mod27B.kt.
 */

private val nb27 = Locale("nb", "NO")

private fun kr27(v: Double): String = (if (v < 0) "−" else "") + String.format(nb27, "%,.0f", kotlin.math.abs(v)).replace(',', ' ').replace(' ', ' ') + " kr"

/** «Butikk · 2 kjøp · −618 kr». */
private fun sugSub27(s: FinSug27): String {
    val t = when (s.type) { "kategori" -> "Kategori"; "vare" -> "Vare"; else -> "Butikk" }
    val n = if (s.count == 1) "1 kjøp" else "${s.count} kjøp"
    return listOfNotNull(t, n.takeIf { s.count > 0 }, kr27(s.sum).takeIf { s.sum != 0.0 }).joinToString(" · ")
}

/** Forslagslisten under Finans → Søk: rad ≥ 52 dp, ikon i merkefarge, skrevet del normal og resten fet, ↖ (44 dp) fyller inn. */
@Composable
internal fun FinSuggest27(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b27
    val q = vm.finSearchQ
    if (s.sug.isEmpty() || s.sugHidden || vm.finSearchAi || q.isBlank()) return
    Column(
        Modifier.fillMaxWidth().shadow(14.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
            .clip(RoundedCornerShape(22.dp)).background(p.card).padding(6.dp),
    ) {
        s.sug.forEach { g ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(16.dp))
                    .clickable(role = Role.Button, onClickLabel = "Søk på ${g.name}") {
                        Haptics.select()
                        vm.finSearchQ = g.name
                        vm.finSugClear27(hide = true)
                        vm.runFinSearch(g.name, false)
                    }.padding(start = 10.dp, top = 4.dp, bottom = 4.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SugIcon27(vm, g)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    val r = typedRange27(g.name, q)
                    val txt = buildAnnotatedString {
                        if (r == null) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name) }
                        else {
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name.substring(0, r.first)) }
                            withStyle(SpanStyle(fontWeight = FontWeight.Normal)) { append(g.name.substring(r.first, r.last + 1)) }
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g.name.substring(r.last + 1)) }
                        }
                    }
                    Text(txt, color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(sugSub27(g), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(
                    Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Fyll inn i søket") {
                        Haptics.select()
                        vm.finSearchQ = g.name
                        vm.b27.sugHidden = false
                        vm.finSug27(g.name)
                    },
                    contentAlignment = Alignment.Center,
                ) { Text("↖", color = p.mut, fontSize = 17.sp) }
            }
        }
    }
}

@Composable
private fun SugIcon27(vm: AppViewModel, g: FinSug27) {
    var bmp by remember(g.logoUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(g.logoUrl) { if (g.logoUrl != null) bmp = vm.img27(g.logoUrl) }
    val b = bmp
    if (b != null) Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Color.White).padding(4.dp)) {
        Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    } else Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Color(g.color)), contentAlignment = Alignment.Center) {
        Text(g.icon.take(2), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, maxLines = 1)
    }
}

/* ---------------- Innstillinger → AI og tolkning → PERSONVERN OG LOGOER ---------------- */

private val AUDIT_FMT = DateTimeFormatter.ofPattern("d. MMM HH:mm", nb27)

private fun auditTime27(ts: String?): String = ts?.let { t ->
    runCatching { java.time.OffsetDateTime.parse(t).atZoneSameInstant(java.time.ZoneId.systemDefault()).format(AUDIT_FMT) }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(t.replace(' ', 'T').take(19)).format(AUDIT_FMT) }.getOrNull()
        ?: t.take(16)
} ?: ""

@Composable
internal fun PrivacyLogos27(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b27
    LaunchedEffect(Unit) { vm.loadPrivacy27() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Personvern og logoer", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRIVACY27.forEachIndexed { i, (k, n, sub) ->
                PToggle(n, sub, s.privacy[k] ?: true, top = i > 0) { vm.setPrivacy27(k, it) }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(
                Modifier.fillMaxWidth().clickable { s.auditOpen = !s.auditOpen; if (s.auditOpen) vm.loadAiAudit27() }.padding(14.dp, 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text("AI-logg", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                    Text("Hva som ble sendt til hvilken motor, og når", color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                }
                Text(if (s.auditOpen) "Skjul" else "Vis ›", color = p.mut, fontSize = 13.sp)
            }
            if (s.auditOpen) {
                val a = s.audit
                when {
                    a == null -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink, modifier = Modifier.size(20.dp), strokeWidth = 2.dp) }
                    a.isEmpty() -> Text(s.auditError ?: "Ingenting er sendt til AI ennå.", color = if (s.auditError != null) p.lab else p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp, 4.dp, 14.dp, 14.dp))
                    else -> a.take(40).forEach { r ->
                        Box(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(p.line))
                        Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(r.engine, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1)
                                Text(auditTime27(r.ts), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                            }
                            if (r.purpose.isNotBlank()) Text(r.purpose, color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                            if (r.fields.isNotBlank()) Text("Sendt: ${r.fields}", color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Text("Ollama leser kvitteringen på hjemmeserveren. Gemini får bare det ryddede butikknavnet, aldri bildet, varelinjer, beløp, org.nr. eller kortdata.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/* ---------------- «Velg logo» der logo mangler ---------------- */

/** Vises bare når butikken ikke har logo: «Velg logo» åpner Finn logo · Last opp · Lim inn domene. */
@Composable
internal fun VelgLogo27(vm: AppViewModel, domain: String?, name: String, receiptId: String?) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.b27
    var missing by remember(domain, name) { mutableStateOf(false) }
    LaunchedEffect(domain, name) { missing = vm.logoFor(domain, name) == null }
    val done = s.logoDone[name.lowercase()]
    if (!missing && done == null) return
    val open = s.logoPick?.name == name
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) vm.logoUpload27(ctx, LogoPick27(name, domain, receiptId), uri) }
    var dom by remember(name) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (done != null) {
                Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).padding(3.dp)) {
                    Image(done.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                }
                Text("Ny logo er lagret", color = p.pos, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            } else {
                Text("Ingen logo", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(1f))
            }
            Box(
                Modifier.height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { s.logoPick = if (open) null else LogoPick27(name, domain, receiptId); s.logoMsg = null }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (open) "Lukk" else "Velg logo", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp) }
        }
        if (open) {
            val pk = LogoPick27(name, domain, receiptId)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PButton(if (s.logoBusy) "Leter …" else "✦ Finn logo", Modifier.weight(1f), height = 40.dp) { if (!s.logoBusy) vm.findLogo27(pk) }
                PButton("↑ Last opp", Modifier.weight(1f), kind = "line", height = 40.dp) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
            Row(
                Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(start = 12.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BasicTextField(
                    dom, { dom = it }, singleLine = true, modifier = Modifier.weight(1f),
                    textStyle = TextStyle(color = p.ink, fontSize = 14.sp, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.lab),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { vm.logoDomain27(pk, dom) }),
                    decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (dom.isEmpty()) Text("Lim inn domene, f.eks. blomsterlandet.no", color = p.mut, fontSize = 13.sp, maxLines = 1); inner() } },
                )
                Box(Modifier.height(34.dp).clip(CircleShape).background(p.ink).clickable { vm.logoDomain27(pk, dom) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Bruk", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                }
            }
            s.logoMsg?.let { Text(it, color = p.lab, fontSize = 12.5.sp) }
            Text("Gemini får bare butikknavnet «$name». Koden henter og sjekker logoen.", color = p.mut, fontSize = 11.5.sp)
        }
    }
}

/* ---------------- Abonnement: «Fra skjermbilde» ---------------- */

private val SK_CARD = Color(0xFF141418)
private val SK_LINE = Color(0xFF2A2A31)
private val SK_MUT = Color(0xFFA0A0AA)
private val SK_OK = Color(0xFF9FE3C6)
private val SK_CHECK = Color(0xFFFFB08A)
private val SK_ORANGE = Color(0xFFFF7A3D)
private val MON27 = listOf("jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des")

/** «✦ Ollama leser skjermbildet»: miniatyr, rader med ✓ / «Sjekk», «+ Legg til …» og «Rediger først». */
@Composable
internal fun SubShotCard27(vm: AppViewModel, card: Color = SK_CARD, fg: Color = Color.White, mut: Color = SK_MUT, line: Color = SK_LINE, check: Color = SK_CHECK, ok: Color = SK_OK) {
    val s = vm.b27
    if (!s.shotOpen) return
    val r = s.shot
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(card).border(1.dp, Color(0x55FF7A3D), RoundedCornerShape(24.dp)).padding(18.dp, 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("✦ Ollama leser skjermbildet", color = fg, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, fontFamily = PaperFonts.sans, modifier = Modifier.weight(1f))
            SheetButton30("Lukk", "secondary", dark = card.luminance() < .5f) { s.shotOpen = false; s.shot = null; s.shotThumb = null } // Prompt 30
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(76.dp, 130.dp).clip(RoundedCornerShape(12.dp)).background(line).border(1.dp, line, RoundedCornerShape(12.dp))) {
                s.shotThumb?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, alignment = Alignment.TopCenter, modifier = Modifier.fillMaxSize()) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                when {
                    s.shotBusy -> {
                        Text("Finner tjeneste, plan, pris og trekkdato …", color = fg, fontSize = 14.sp, lineHeight = 20.sp)
                        Spacer(Modifier.height(8.dp))
                        androidx.compose.material3.LinearProgressIndicator(color = SK_ORANGE, trackColor = line, modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)))
                        Spacer(Modifier.height(6.dp))
                        Text(s.shotName, color = mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    s.shotError != null -> Text(s.shotError ?: "", color = check, fontSize = 13.5.sp, lineHeight = 19.sp)
                    r != null -> {
                        val (day, mon) = shotDay27(r)
                        val price = (if (r.currency.uppercase() != "NOK") "≈ " else "") + kr27(r.price).removePrefix("−") + (r.priceOriginal?.let { " ($it)" } ?: "")
                        listOf(
                            Triple("Tjeneste", r.service, "tjeneste"), Triple("Plan", r.plan.ifBlank { "–" }, "plan"), Triple("Pris", price, "pris"),
                            Triple("Syklus", if (r.cycle == "yearly") "Årlig" else "Månedlig", "syklus"), Triple("Neste trekk", "$day. ${MON27[(mon - 1).coerceIn(0, 11)]}", "neste_trekk"),
                            Triple("Kategori", r.category, "kategori"),
                        ).forEach { (k, v, key) ->
                            val unsure = key in r.check || (key == "pris" && r.currency.uppercase() != "NOK" && "valuta" in r.check)
                            Column {
                                Row(Modifier.fillMaxWidth().heightIn(min = 34.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(k, color = mut, fontSize = 12.5.sp, modifier = Modifier.width(92.dp))
                                    Text(v, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Text(if (unsure) "Sjekk" else "✓", color = if (unsure) check else ok, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                                }
                                Box(Modifier.fillMaxWidth().height(1.dp).background(line))
                            }
                        }
                    }
                }
            }
        }
        if (r != null && !s.shotBusy) {
            if (r.existingId != null) Text("${r.service} finnes allerede. Du kan oppdatere plan og pris.", color = check, fontSize = 12.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(SK_ORANGE).clickable { Haptics.tap(); vm.addShot27(r) }, contentAlignment = Alignment.Center) {
                    Text(if (r.existingId != null) "Oppdater ${r.service}" else "+ Legg til ${r.service}", color = Color(0xFF1A0C04), fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, line, RoundedCornerShape(22.dp)).clickable { vm.editShot27(r) }, contentAlignment = Alignment.Center) {
                    Text("Rediger først", color = fg, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                }
            }
        }
        Text("Leses lokalt av qwen2.5vl på hjemmeserveren. Bildet slettes etter lesing. Felt merket «Sjekk» var utydelige.", color = mut, fontSize = 12.sp, lineHeight = 17.sp)
    }
}

/** Valgknappen «Fra skjermbilde» i Legg til-kortet (photo picker, bare bilder). */
@Composable
internal fun rememberShotPicker27(vm: AppViewModel): () -> Unit {
    val ctx = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) { vm.subAdding = false; vm.subFromShot27(ctx, uri) } }
    return { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

/** Første trekk-dato i skjemaet fra et skjermbilde (dag, måned). */
internal fun prefillDay27(r: SubShot27): Pair<Int, Int> = shotDay27(r)
