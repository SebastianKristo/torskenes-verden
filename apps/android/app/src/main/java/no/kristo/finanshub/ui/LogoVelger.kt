package no.kristo.finanshub.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Rect
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import no.kristo.finanshub.Api
import no.kristo.finanshub.AppViewModel
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import no.kristo.finanshub.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import no.kristo.finanshub.ui.designsystem.HomelabTheme
import no.kristo.finanshub.ui.designsystem.HomelabType
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.minimumInteractiveComponentSize

/* ---------------- Prompt 73 (LOGO73): «Endre logo» for en butikk i Finans ----------------
 * Fasit: «Lagre og logo.dc.html» 1a (mobil-ark fra transaksjon). Papir-design: bakgrunn #f3efe6, kort #fff, kant #d8d1c2,
 * tekst #1b1a17, dempet #8f897c, aksent #b23a2a. Newsreader, Manrope og IBM Plex Mono. Ikke mørkt glass.
 * Søk:   GET /finans/api/logos?q= (debounce 250 ms) → [{id, name, domain, logoUrl}] – hele logobiblioteket på serveren.
 * Lagre: PUT /finans/api/merchants/:navn/logo {logoId | uploadId | initials:true | null = tilbakestill}.
 * Bilde: beskjæres til kvadrat på maks 512 px på telefonen, så POST /finans/api/merchants/logo/upload (serveren beskjærer også).
 * Overstyringene (GET /finans/api/merchants/logo-overrides → names) brukes av Logo() og StoreLogo52 overalt i Finans.
 * CancellationException kastes alltid videre; rå feiltekst vises aldri. */


/** Brukerens egne logovalg: navn (små bokstaver) → url, "" = initialer. */
object LogoOv73 {
    var names by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    /** Øker når kartet endres, så logoene tegnes på nytt. */
    var version by mutableIntStateOf(0)
        private set
    private var loadedAt = 0L
    private var loading = false

    fun key(s: String?): String = s?.trim()?.lowercase() ?: ""

    /** null = ingen overstyring, "" = initialer, ellers serverstien til logoen. */
    fun value(name: String?): String? {
        val k = key(name)
        return if (k.isEmpty()) null else names[k]
    }

    /** Lokalt med en gang etter et valg. url null = fjern. */
    fun set(list: List<String>, url: String?) {
        val m = names.toMutableMap()
        for (n in list) { val k = key(n); if (k.isEmpty()) continue; if (url == null) m.remove(k) else m[k] = url }
        names = m
        version++
    }

    /** Henter kartet høyst hvert minutt (eller med force). */
    suspend fun ensure(vm: AppViewModel, force: Boolean = false) {
        if (loading) return
        val now = System.currentTimeMillis()
        if (!force && now - loadedAt < 60_000) return
        loading = true
        loadedAt = now
        try {
            val raw = vm.api52b { request("GET", "/merchants/logo-overrides", timeout = 6_000, read = 10_000) }
            val o = JSONObject(raw).optJSONObject("names") ?: return
            val next = HashMap<String, String>()
            o.keys().forEach { k -> next[key(k)] = o.optString(k, "") }
            if (next != names) { names = next; version++ }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Eldre server eller ikke nett: ingen overstyringer, prøv igjen senere.
        } finally { loading = false }
    }
}

data class LogoHit73(val id: String, val name: String, val domain: String, val logoUrl: String, val uploadId: String = "")

private fun enc73(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

private fun parseHits73(raw: String): List<LogoHit73> {
    val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    val out = ArrayList<LogoHit73>()
    for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val id = o.optString("id", "")
        if (id.isEmpty()) continue
        out.add(LogoHit73(id, o.optString("name", id), if (o.isNull("domain")) "" else o.optString("domain", ""), if (o.isNull("logoUrl")) "" else o.optString("logoUrl", "")))
    }
    return out
}

/** Kvadrat i midten, maks 512 px, som PNG. */
internal fun squarePng73(ctx: Context, uri: Uri): ByteArray? {
    val data = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    val src = BitmapFactory.decodeByteArray(data, 0, data.size) ?: return null
    val side = minOf(src.width, src.height)
    if (side <= 0) return null
    val t = minOf(side, 512)
    val out = Bitmap.createBitmap(t, t, Bitmap.Config.ARGB_8888)
    val x = (src.width - side) / 2
    val y = (src.height - side) / 2
    Canvas(out).drawBitmap(src, Rect(x, y, x + side, y + side), Rect(0, 0, t, t), null)
    val bos = ByteArrayOutputStream()
    out.compress(Bitmap.CompressFormat.PNG, 100, bos)
    return bos.toByteArray()
}

/** Liten logo fra serveren i en hvit rute; forbokstaven når den mangler. */
@Composable
private fun LogoThumb73(vm: AppViewModel, url: String, name: String, size: Int = 40, radius: Int = 11) {
    var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(url) { bmp = if (url.startsWith("/")) vm.image(url) else null }
    val shape = RoundedCornerShape(radius.dp)
    Box(Modifier.size(size.dp).clip(shape).background(Color.White).border(1.dp, HomelabTheme.colors.surfaceChip, shape), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding((size * 0.16f).dp))
        else Text(name.trim().take(1).uppercase(), color = HomelabTheme.colors.textPrimary, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = (size * 0.45f).sp)
    }
}

/** Logoen som knapp: trykk åpner «Endre logo». */
@Composable
internal fun LogoTap73(vm: AppViewModel, name: String, names: List<String> = emptyList(), content: @Composable () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(
        Modifier.clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button, onClickLabel = "Endre logo") { open = true }
            .semantics { contentDescription = "Endre logo for $name" },
    ) {
        content()
        Box(
            Modifier.align(Alignment.BottomEnd).offset(x = 5.dp, y = 5.dp).size(20.dp).clip(CircleShape).background(HomelabTheme.colors.surface).padding(2.dp).clip(CircleShape).background(HomelabTheme.colors.textPrimary),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Edit, contentDescription = null, tint = HomelabTheme.colors.surface, modifier = Modifier.size(11.dp)) }
    }
    if (open) LogoSheet73(vm, name, names) { open = false }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LogoSheet73(vm: AppViewModel, name: String, names: List<String> = emptyList(), onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var q by remember(name) { mutableStateOf(name) }
    var hits by remember { mutableStateOf<List<LogoHit73>>(emptyList()) }
    var searching by remember { mutableStateOf(true) }
    var sel by remember { mutableStateOf<LogoHit73?>(null) }
    var manual by remember { mutableStateOf(false) }
    var initials by remember { mutableStateOf(false) }
    var curUrl by remember { mutableStateOf("") }
    var count by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }
    val path = "/merchants/" + enc73(name) + "/logo"

    LaunchedEffect(name) {
        try {
            val o = JSONObject(vm.api52b { request("GET", path, timeout = 6_000, read = 10_000) })
            manual = o.optBoolean("manual", false)
            initials = o.optBoolean("initials", false)
            curUrl = if (o.isNull("logoUrl")) "" else o.optString("logoUrl", "")
            count = o.optInt("count", 0)
        } catch (e: CancellationException) { throw e } catch (e: Exception) { /* eldre server: arket virker uten tilstanden */ }
    }
    // Debounce 250 ms: et nytt tegn avbryter forrige søk.
    LaunchedEffect(q) {
        searching = true
        delay(250)
        hits = try {
            parseHits73(vm.api52b { request("GET", "/logos?q=" + enc73(q) + "&limit=60", timeout = 6_000, read = 10_000) })
        } catch (e: CancellationException) { throw e } catch (e: Exception) { emptyList() }
        searching = false
    }

    fun save(body: JSONObject?, msg: String) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                val o = JSONObject(vm.api52b { request("PUT", path, body, timeout = 8_000, read = 15_000) })
                val isManual = o.optBoolean("manual", false)
                LogoOv73.set(listOf(name) + names, if (isManual) (if (o.isNull("logoUrl")) "" else o.optString("logoUrl", "")) else null)
                LogoOv73.ensure(vm, force = true)
                vm.flash(msg)
                onDismiss()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                err = "Kunne ikke lagre logoen"
            } finally { busy = false }
        }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            busy = true
            try {
                val png = withContext(Dispatchers.IO) { squarePng73(ctx, uri) }
                if (png == null) { err = "Kunne ikke lese bildet"; return@launch }
                val o = JSONObject(vm.api52b { upload("/merchants/logo/upload", listOf(Api.Part("file", "logo.png", "image/png", png))) })
                val uid = o.optString("uploadId", "")
                if (uid.isNotEmpty()) { sel = LogoHit73("upload:$uid", "Eget bilde", "", o.optString("url", ""), uid); err = "" }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                err = "Kunne ikke laste opp bildet"
            } finally { busy = false }
        }
    }

    val preview = sel?.logoUrl ?: if (manual) (if (initials) "" else curUrl) else curUrl

    ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = state, containerColor = HomelabTheme.colors.surface, contentColor = HomelabTheme.colors.textPrimary,
        shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 38.dp, height = 5.dp, color = HomelabTheme.colors.line) },
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).navigationBarsPadding().imePadding().padding(start = 22.dp, end = 22.dp, bottom = 16.dp)) {
            Row(Modifier.padding(top = 6.dp, bottom = 16.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("FINANS · BUTIKKLOGO", color = HomelabTheme.colors.accent, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, letterSpacing = 1.2.sp)
                    Text("Endre logo", color = HomelabTheme.colors.textPrimary, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, style = HomelabType.title2, lineHeight = 31.sp)
                }
                LogoThumb73(vm, preview, name, 44, 12)
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(HomelabTheme.colors.surfaceField).border(1.dp, HomelabTheme.colors.line, CircleShape).clickable(role = Role.Button, onClickLabel = "Lukk") { onDismiss() }
                        .semantics { contentDescription = "Lukk" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Close, contentDescription = null, tint = HomelabTheme.colors.textPrimary, modifier = Modifier.size(20.dp)) }
            }
            Row(
                Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, HomelabTheme.colors.line, RoundedCornerShape(24.dp)).padding(start = 16.dp, end = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Filled.Search, contentDescription = null, tint = HomelabTheme.colors.textTertiary, modifier = Modifier.size(20.dp))
                BasicTextField(
                    q, { q = it }, singleLine = true, modifier = Modifier.weight(1f).semantics { contentDescription = "Søk etter butikk" },
                    textStyle = HomelabType.body.copy(color = HomelabTheme.colors.textPrimary, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(HomelabTheme.colors.accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (q.isEmpty()) Text("Søk etter butikk", color = HomelabTheme.colors.textTertiary, style = HomelabType.body, maxLines = 1); inner() } },
                )
                if (q.isNotEmpty()) Box(
                    Modifier.minimumInteractiveComponentSize().size(28.dp).clip(CircleShape).background(HomelabTheme.colors.surfaceSunken).clickable(role = Role.Button, onClickLabel = "Tøm søket") { q = "" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Close, contentDescription = "Tøm søket", tint = HomelabTheme.colors.textPrimary, modifier = Modifier.size(14.dp)) }
            }
            Text(
                "LOGODATABASEN · ${hits.size} TREFF", color = HomelabTheme.colors.textTertiary, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, style = HomelabType.caption, letterSpacing = 1.2.sp,
                modifier = Modifier.padding(start = 2.dp, top = 16.dp, bottom = 8.dp),
            )
            Box(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(18.dp)).background(Color.White).border(1.dp, HomelabTheme.colors.surfaceChip, RoundedCornerShape(18.dp))) {
                if (hits.isEmpty()) Text(if (searching) "Søker …" else "Ingen butikker funnet", color = HomelabTheme.colors.textTertiary, style = HomelabType.callout, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp))
                LazyColumn(Modifier.fillMaxSize()) {
                    items(hits, key = { it.id }) { h ->
                        val on = sel?.id == h.id
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 60.dp).background(if (on) HomelabTheme.colors.surfaceSunken else HomelabTheme.colors.surfaceField)
                                .clickable(role = Role.Button, onClickLabel = h.name) { sel = h }.semantics { selected = on }.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            LogoThumb73(vm, h.logoUrl, h.name)
                            Column(Modifier.weight(1f)) {
                                Text(h.name, color = HomelabTheme.colors.textPrimary, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (h.domain.isNotEmpty()) Text(h.domain, color = HomelabTheme.colors.textTertiary, style = HomelabType.subheadline, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (on) Box(Modifier.size(24.dp).clip(CircleShape).background(HomelabTheme.colors.textPrimary), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Check, contentDescription = "Valgt", tint = HomelabTheme.colors.surface, modifier = Modifier.size(16.dp)) }
                        }
                        Box(Modifier.fillMaxWidth().height(1.dp).background(HomelabTheme.colors.lineSubtle))
                    }
                }
            }
            Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Line73Button("Last opp bilde", Modifier.weight(1f)) { if (!busy) pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                Line73Button("Bruk initialer", Modifier.weight(1f)) { save(JSONObject().put("initials", true), "Viser initialer") }
            }
            val canApply = sel != null && !busy
            Box(
                Modifier.padding(top = 10.dp).fillMaxWidth().height(54.dp).clip(RoundedCornerShape(27.dp)).background(if (canApply) HomelabTheme.colors.textPrimary else HomelabTheme.colors.textPrimary.copy(alpha = .4f))
                    .clickable(enabled = canApply, role = Role.Button) {
                        val s = sel ?: return@clickable
                        save(if (s.uploadId.isNotEmpty()) JSONObject().put("uploadId", s.uploadId) else JSONObject().put("logoId", s.id), "Logo oppdatert")
                    },
                contentAlignment = Alignment.Center,
            ) { Text("Bruk denne logoen", color = HomelabTheme.colors.surface, fontFamily = PaperFonts.sans, fontWeight = FontWeight.Bold, style = HomelabType.body) }
            Text(
                if (count > 0) "Gjelder alle $count kjøp fra $name" else "Gjelder alle kjøp fra $name", color = HomelabTheme.colors.textTertiary, style = HomelabType.subheadline, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            )
            if (err.isNotEmpty()) Text(err, color = HomelabTheme.colors.accent, style = HomelabType.subheadline, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
            if (manual) Box(
                Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Button) { save(null, "Tilbake til automatisk logo") },
                contentAlignment = Alignment.Center,
            ) { Text("Tilbakestill til automatisk", color = HomelabTheme.colors.textSecondary, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout) }
        }
    }
}

@Composable
private fun Line73Button(text: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, HomelabTheme.colors.line, RoundedCornerShape(24.dp)).clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = HomelabTheme.colors.textPrimary, fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, style = HomelabType.callout) }
}

/* ---------------- Innstillinger → AI og tolkning → PERSONVERN OG LOGOER ---------------- */

private val AUDIT_FMT = DateTimeFormatter.ofPattern("d. MMM HH:mm", Locale("nb", "NO"))

private fun auditTime27(ts: String?): String = ts?.let { t ->
    runCatching { java.time.OffsetDateTime.parse(t).atZoneSameInstant(java.time.ZoneId.systemDefault()).format(AUDIT_FMT) }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(t.replace(' ', 'T').take(19)).format(AUDIT_FMT) }.getOrNull()
        ?: t.take(16)
} ?: ""

@Composable
internal fun PrivacyLogos27(vm: AppViewModel) {
    val p = HomelabTheme.colors
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
                    Text("AI-logg", color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.callout)
                    Text("Hva som ble sendt til hvilken motor, og når", color = p.textTertiary, style = HomelabType.footnote, maxLines = 2)
                }
                Text(if (s.auditOpen) "Skjul" else "Vis ›", color = p.textTertiary, style = HomelabType.subheadline)
            }
            if (s.auditOpen) {
                val a = s.audit
                when {
                    a == null -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.textPrimary, modifier = Modifier.size(20.dp), strokeWidth = 2.dp) }
                    a.isEmpty() -> Text(s.auditError ?: "Ingenting er sendt til AI ennå.", color = if (s.auditError != null) p.accent else p.textTertiary, style = HomelabType.subheadline, modifier = Modifier.padding(14.dp, 4.dp, 14.dp, 14.dp))
                    else -> a.take(40).forEach { r ->
                        Box(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(p.line))
                        Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(r.engine, color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.callout, modifier = Modifier.weight(1f), maxLines = 1)
                                Text(auditTime27(r.ts), color = p.textTertiary, fontFamily = PaperFonts.mono, style = HomelabType.caption, fontWeight = FontWeight.Normal)
                            }
                            if (r.purpose.isNotBlank()) Text(r.purpose, color = p.textTertiary, style = HomelabType.footnote, maxLines = 2)
                            if (r.fields.isNotBlank()) Text("Sendt: ${r.fields}", color = p.textPrimary, fontFamily = PaperFonts.mono, style = HomelabType.caption, fontWeight = FontWeight.Normal, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Text("Ollama leser kvitteringen på hjemmeserveren. Gemini får bare det ryddede butikknavnet, aldri bildet, varelinjer, beløp, org.nr. eller kortdata.",
            color = p.textTertiary, style = HomelabType.footnote, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/* ---------------- «Velg logo» der logo mangler ---------------- */

/** Vises bare når butikken ikke har logo: «Velg logo» åpner Finn logo · Last opp · Lim inn domene. */
@Composable
internal fun VelgLogo27(vm: AppViewModel, domain: String?, name: String, receiptId: String?) {
    val p = HomelabTheme.colors
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
                Text("Ny logo er lagret", color = p.success, style = HomelabType.footnote, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            } else {
                Text("Ingen logo", color = p.textTertiary, style = HomelabType.footnote, modifier = Modifier.weight(1f))
            }
            Box(
                Modifier.minimumInteractiveComponentSize().height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { s.logoPick = if (open) null else LogoPick27(name, domain, receiptId); s.logoMsg = null }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (open) "Lukk" else "Velg logo", color = p.textPrimary, fontWeight = FontWeight.SemiBold, style = HomelabType.footnote) }
        }
        if (open) {
            val pk = LogoPick27(name, domain, receiptId)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PButton(if (s.logoBusy) "Leter …" else "✦ Finn logo", Modifier.weight(1f), height = 40.dp) { if (!s.logoBusy) vm.findLogo27(pk) }
                PButton("↑ Last opp", Modifier.weight(1f), kind = "line", height = 40.dp) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
            Row(
                Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(14.dp)).background(p.surface).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(start = 12.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BasicTextField(
                    dom, { dom = it }, singleLine = true, modifier = Modifier.weight(1f),
                    textStyle = HomelabType.callout.copy(color = p.textPrimary, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { vm.logoDomain27(pk, dom) }),
                    decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (dom.isEmpty()) Text("Lim inn domene, f.eks. blomsterlandet.no", color = p.textTertiary, style = HomelabType.subheadline, maxLines = 1); inner() } },
                )
                Box(Modifier.minimumInteractiveComponentSize().height(34.dp).clip(CircleShape).background(p.textPrimary).clickable { vm.logoDomain27(pk, dom) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Bruk", color = p.surface, fontWeight = FontWeight.Bold, style = HomelabType.footnote)
                }
            }
            s.logoMsg?.let { Text(it, color = p.accent, style = HomelabType.footnote) }
            Text("Gemini får bare butikknavnet «$name». Koden henter og sjekker logoen.", color = p.textTertiary, style = HomelabType.caption, fontWeight = FontWeight.Normal)
        }
    }
}

/* ---------------- Abonnement: «Fra skjermbilde» ---------------- */
