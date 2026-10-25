package no.kristo.finanshub.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.InputType
import android.util.Base64
import android.view.View
import android.widget.EditText
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import no.kristo.finanshub.*
import kotlin.math.PI
import kotlin.math.sin

/*
 * Prompt 40 (ANDROID40) – skjermene og småbitene: Vær-✕, julemodus (antrekk + Innstillinger-kortet), økonomi-ikon 3c,
 * 2FA i appen, Finans (lagt til, les på nytt, rediger alt, Glimt-kort i søk), Nyheter-Glimt-siden og Hjemlys (kort og start).
 */

/* ======================= Vær ======================= */

/**
 * Den ene lukkeknappen i Vær: 42 dp sirkel, hvit 22 % glass (mørk glass `rgba(10,20,35,.62)` over kart), hvit ✕ 17 dp med
 * strek 2,8 og runde ender, trykkflate 44 dp, «Lukk» for skjermleser og samme haptikk som hovedsiden.
 * Brukes på hovedsiden, i Yr mot Storm, kartet, Steder og alle detaljark.
 */
@Composable
internal fun VaerCloseButton(dark: Boolean = false, onClick: () -> Unit) {
    Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(42.dp).clip(CircleShape).background(if (dark) Color(0x9E0A1423) else Color.White.copy(alpha = .22f))
                .clickable(role = Role.Button, onClickLabel = "Lukk") { Haptics.dismiss(); onClick() }
                .semantics { contentDescription = "Lukk" },
            contentAlignment = Alignment.Center,
        ) { WxIcon("M6 6l12 12M18 6L6 18", Color.White, 17.dp, stroke = 2.8f) }
    }
}

/** Glass-stripen bak statuslinja + topplinja i Vær: `rgba(34,58,92,.62 → 0)`, tones inn med bynavnet (alpha = a). */
@Composable
internal fun WxTopGlass40(a: Float) {
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    Box(
        Modifier.fillMaxWidth().height(top + 74.dp).graphicsLayer { alpha = a }
            .background(Brush.verticalGradient(0f to Color(0x9E223A5C), .72f to Color(0x7A223A5C), 1f to Color(0x00223A5C))),
    )
}

/* ======================= Julemodus: antrekket ======================= */

private val pathCache40 = HashMap<String, androidx.compose.ui.graphics.Path>()
private fun svgPath40(d: String): androidx.compose.ui.graphics.Path = synchronized(pathCache40) {
    pathCache40.getOrPut(d) { PathParser().parsePathString(d).toPath() }
}

/** Tegner en SVG-sti fra en viewBox (vbW × vbH) inn i en boks (x, y, w, h). */
private fun DrawScope.svg40(d: String, x: Float, y: Float, w: Float, h: Float, vbW: Float, vbH: Float, fill: Color? = null, stroke: Color? = null, sw: Float = 0f) {
    translate(x, y) {
        scale(w / vbW, h / vbH, Offset.Zero) {
            val p = svgPath40(d)
            fill?.let { drawPath(p, it) }
            stroke?.let { drawPath(p, it, style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        }
    }
}

/**
 * Antrekket fra glimt-figurer.js (dress): Advent = rød nisselue + grønt skjerf, Jul = lue + skjerf + gave, Nyttår = svart festhatt
 * med gull, Vinter = blå strikkelue + rødt skjerf. S = figurens bredde, H = høyden. Vugger rolig (3 s); «Reduser bevegelse» = stille.
 */
internal fun DrawScope.drawJul40(S: Float, H: Float, phase: String, t: Float, anim: Boolean, id: String = "") {
    val sway = if (anim) (sin(2 * PI * (t % 3f) / 3f).toFloat() * 3f) else 0f
    // Prompt 41: ankerpunkter per figur (hT hatt-topp, hX hatt-senter, hS hattskala, sB skjerf-bunn, sW skjerf-bredde, gB/gR gave).
    val an = figAnchor41(id)
    val hT = an.hT; val hX = an.hX; val hS = an.hS; val sB = an.sB; val sW = an.sW; val gB = an.gB; val gR = an.gR
    val scarf = phase == "advent" || phase == "jul" || phase == "vinter"
    val sc = if (phase == "vinter") Color(0xFFB23A2A) else Color(0xFF2F7A4F)
    if (scarf) {
        // bottom −S·0,2: toppen ligger på H − S·0,5 + S·0,2.
        val w = S * sW; val h = S * .5f * sW / 1.05f
        val x = S / 2 - w / 2; val y = H - S * sB - h
        svg40("M8 10 Q52 26 97 10 L95 24 Q52 40 10 24 Z", x, y, w, h, 105f, 50f, fill = sc)
        svg40("M22 16 l4 12 M40 20 l3 13 M58 20 l-1 13 M76 17 l-3 12", x, y, w, h, 105f, 50f, stroke = Color(0xFFF6F1E7), sw = 3f)
        svg40("M70 22 L80 48 L68 50 L62 26 Z", x, y, w, h, 105f, 50f, fill = sc)
    }
    when (phase) {
        "advent", "jul" -> {
            val w = S * .95f * hS; val h = S * .7f * hS
            val x = S * hX - S * .42f * hS; val y = S * hT
            rotate(-14f + sway, Offset(x + w / 2, y + h / 2)) {
                svg40("M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z", x, y, w, h, 95f, 70f, fill = Color(0xFFC8302A))
                drawCircle(Color(0xFFFBF7EE), 8f * w / 95f, Offset(x + 89f * w / 95f, y + 22f * h / 70f))
                drawRoundRect(Color(0xFFFBF7EE), Offset(x + 6f * w / 95f, y + 50f * h / 70f), Size(70f * w / 95f, 15f * h / 70f),
                    androidx.compose.ui.geometry.CornerRadius(7.5f * w / 95f))
            }
        }
        "vinter" -> {
            val w = S * .9f * hS; val h = S * .6f * hS
            val x = S * hX - S * .45f * hS; val y = S * (hT + .08f)
            rotate(sway * .6f, Offset(x + w / 2, y + h)) {
                svg40("M10 50 Q10 10 45 10 Q80 10 80 50 Z", x, y, w, h, 90f, 60f, fill = Color(0xFF3B6FB0))
                drawRoundRect(Color(0xFF2B5D8A), Offset(x + 6f * w / 90f, y + 42f * h / 60f), Size(78f * w / 90f, 14f * h / 60f), androidx.compose.ui.geometry.CornerRadius(6f * w / 90f))
                drawCircle(Color(0xFFFBF7EE), 8f * w / 90f, Offset(x + 45f * w / 90f, y + 8f * h / 60f))
            }
        }
        "nyttar" -> {
            val w = S * .6f; val h = S * .62f
            val x = S / 2 - S * .22f; val y = -S * .48f
            rotate(12f + sway, Offset(x + w / 2, y + h / 2)) {
                svg40("M8 56 L30 4 L52 56 Z", x, y, w, h, 60f, 62f, fill = Color(0xFF1B1A17))
                svg40("M14 42 L46 42 M19 30 L41 30 M24 18 L36 18", x, y, w, h, 60f, 62f, stroke = Color(0xFFF2C14E), sw = 3f)
                drawCircle(Color(0xFFF2C14E), 5f * w / 60f, Offset(x + 30f * w / 60f, y + 4f * h / 62f))
            }
            // Gnister (ikke med «Reduser bevegelse»).
            if (anim) listOf(Offset(-S * .08f, S * .05f), Offset(S * 1.02f, S * .18f), Offset(S * .9f, -S * .12f)).forEachIndexed { i, o ->
                val a = ((sin(2 * PI * ((t + i * .5f) % 1.6f) / 1.6f).toFloat() + 1f) / 2f)
                drawCircle(Color(0xFFF2C14E).copy(alpha = .3f + .6f * a), S * .03f * (.6f + a), o)
            }
        }
    }
    if (phase == "jul") {
        val w = S * .34f; val h = S * .3f
        val x = S - S * gR - w; val y = H - S * gB - h
        rotate(8f, Offset(x + w / 2, y + h / 2)) {
            drawRoundRect(Color(0xFFB23A2A), Offset(x, y), Size(w, h), androidx.compose.ui.geometry.CornerRadius(4f * density))
            drawRect(Color(0xFFF2C14E), Offset(x + w * .44f, y), Size(w * .12f, h))
            drawRect(Color(0xFFF2C14E), Offset(x, y + h * .4f), Size(w, h * .14f))
        }
    }
}

/** Innstillinger → Glimt → «Julemodus»: rød lue-rute, status, Auto · Av · På og fasevalg når På er valgt, snø og julelyd. */
@Composable
internal fun Jul40Card(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { vm.loadJul40() }
    @Suppress("UNUSED_VARIABLE") val tick = Jul40.tick
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFFFBE3DF)), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(28.dp)) {
                    svg40("M14 56 Q40 4 74 8 Q86 10 88 20 Q70 18 66 56 Z", 0f, 0f, size.width, size.height * .74f, 95f, 70f, fill = Color(0xFFC8302A))
                    drawCircle(Color.White, size.width * .085f, Offset(size.width * .93f, size.height * .24f))
                    drawRoundRect(Color.White, Offset(0f, size.height * .54f), Size(size.width * .8f, size.height * .16f), androidx.compose.ui.geometry.CornerRadius(size.width * .08f))
                }
            }
            Column(Modifier.weight(1f)) {
                Text("Julemodus", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                Text(Jul40.statusText(), color = if (Jul40.phase != null) p.pos else p.mut, fontSize = 12.5.sp)
            }
            GlimtFig35("glimt", 30.dp, "idle", still = true)
        }
        Seg40(listOf("auto" to "Auto", "av" to "Av", "pa" to "På"), Jul40.mode) { vm.setJul40(mode = it) }
        if (Jul40.mode == "pa") Seg40(Jul40.PHASES, Jul40.manual) { vm.setJul40(phase = it) }
        Text("Auto: 1. desember–13. januar. Glimt får lue og skjerf overalt (brief, chat, varsler, søk og widgets), med varmere tone og nedtelling til jul.",
            color = p.mut, fontSize = 12.sp, lineHeight = 16.5.sp)
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        PToggle("Snø i Vær og brief", "Når det snør eller er minus", Jul40.snow) { vm.setJul40(snow = it) }
        PToggle("Julelyd på varsler", if (Jul40.sound == "bjelle") "Myk bjelle (lav og kort)" else "Av", Jul40.sound == "bjelle", top = true) { vm.setJul40(sound = if (it) "bjelle" else "av") }
    }
}

/** Segmentvalg i Papir-stil (runde hjørner). */
@Composable
internal fun Seg40(opts: List<Pair<String, String>>, cur: String, pick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().height(38.dp).clip(RoundedCornerShape(19.dp)).background(p.surf2).padding(3.dp)) {
        opts.forEach { (k, n) ->
            val on = k == cur
            Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(16.dp)).background(if (on) p.card else Color.Transparent)
                .clickable(role = Role.RadioButton) { if (!on) pick(k) }, contentAlignment = Alignment.Center) {
                Text(n, color = if (on) p.ink else p.mut, fontWeight = if (on) FontWeight.Bold else FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
            }
        }
    }
}

/* ======================= Økonomi-ikon 3c ======================= */

/** 3c: hvit lommebok med budsjettringen (gull, mint, rosa) som lås, på mørk blå #1B2A40. size = rutas side. */
@Composable
internal fun Okonomi40Icon(size: Dp, radius: Dp = size * .26f) {
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(Color(0xFF1B2A40)).semantics { contentDescription = "Økonomi" }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size * .78f)) { drawOkonomi40(this.size.width) }
    }
}

internal fun DrawScope.drawOkonomi40(px: Float) {
    val k = px / 48f
    val w = Color.White
    drawRoundRect(w, Offset(7 * k, 14 * k), Size(32 * k, 23 * k), androidx.compose.ui.geometry.CornerRadius(5 * k), style = Stroke(3.2f * k))
    svg40("M12 14 L28 8 L31 14", 0f, 0f, px, px, 48f, 48f, stroke = w, sw = 3.2f)
    drawCircle(Color(0xFF1B2A40), 6.5f * k, Offset(34 * k, 25.5f * k))
    drawCircle(w, 6.5f * k, Offset(34 * k, 25.5f * k), style = Stroke(2.5f * k))
    svg40("M34 21 A4.5 4.5 0 0 1 38.3 26.8", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFFF2C14E), sw = 3f)
    svg40("M38.3 26.8 A4.5 4.5 0 0 1 31 28.9", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFF7FD4C1), sw = 3f)
    svg40("M31 28.9 A4.5 4.5 0 0 1 34 21", 0f, 0f, px, px, 48f, 48f, stroke = Color(0xFFF6B7C8), sw = 3f)
}

/* ======================= Felles lag ======================= */

/** Fullskjermsflatene og arkene fra prompt 40 (legges øverst i Papir). */
@Composable
internal fun Global40(vm: AppViewModel) {
    val s = vm.p40
    if (s.newsGl && vm.newsOpen) NewsGlimt40Page(vm)
    if (s.ngPick) NgPicker40(vm)
    if (s.tfOpen) TwoFa40Screen(vm)
    if (s.hlSheet) HjemlysPage40(vm) // 1a/1b/1c (ui/Hjemlys40Ui.kt)
    s.editAll?.let { id -> vm.txDetail?.takeIf { it.tx.id == id }?.let { EditAll40Sheet(vm, it) } ?: run { s.editAll = null } }
}

/* ======================= 2FA i appen ======================= */

/** Raden i Innstillinger → Sikkerhet. Av: «Sett opp ›», på: «Endre ›». Åpner oppsettet i appen (ikke nettleseren). */
@Composable
internal fun TfRow40(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) { vm.loadTf40() }
    val on = vm.p40.tf?.enabled ?: (vm.me?.totp == true)
    val left = vm.p40.tf?.backupLeft
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { vm.openTf40() }.padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text("Totrinnsbekreftelse", color = C.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(if (on) "På · autentiseringsapp" + (left?.let { " · $it reservekoder igjen" } ?: "") else "Av · sett opp i appen på 1 minutt", color = C.text2, fontSize = 12.5.sp)
        }
        Text(if (on) "Endre ›" else "Sett opp ›", color = C.primary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@Composable
internal fun TwoFa40Screen(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    val ctx = LocalContext.current
    fun back() {
        when {
            s.tfManage != null && s.tfStep == 10 -> s.tfManage = null
            s.tfStep in 1..2 -> s.tfStep -= 1
            else -> s.tfOpen = false
        }
    }
    BackHandler { back() }
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(18.dp, 10.dp, 18.dp, 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(34.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { back() }.padding(start = 10.dp, end = 14.dp),
                    contentAlignment = Alignment.Center) { Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
                Spacer(Modifier.weight(1f))
                if (s.tfStep in 0..3) Text("Steg ${s.tfStep + 1} av 4", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
            }
            if (s.tfStep in 0..3) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(4) { i -> Box(Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(2.dp)).background(if (i <= s.tfStep) p.lab else p.line)) }
            }
            PLabel("SIKKERHET · TOTRINNSBEKREFTELSE", p.mut)
            when (s.tfStep) {
                0 -> TfMethod40(vm)
                1 -> TfConnect40(vm, ctx)
                2 -> TfCode40(vm)
                3 -> TfCodes40(vm, ctx, final = true)
                4 -> TfDone40(vm)
                else -> TfManage40(vm, ctx)
            }
            s.tfErr?.let { Text(it, color = p.lab, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold) }
            if (s.tfBusy) CircularProgressIndicator(color = p.ink, modifier = Modifier.size(26.dp))
        }
    }
}

@Composable
private fun TfOption40(title: String, sub: String, badge: String?, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
        .clickable(enabled = enabled, role = Role.Button) { onClick() }.padding(16.dp).graphicsLayer { alpha = if (enabled) 1f else .55f },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
                badge?.let { Text(it, color = p.pos, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(p.posSoft).padding(6.dp, 2.dp)) }
            }
            Text(sub, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
        }
        Text("›", color = p.mut, fontSize = 18.sp)
    }
}

@Composable
private fun TfMethod40(vm: AppViewModel) {
    val p = PaperPal.current
    var pw by remember { mutableStateOf("") }
    PSerif("Velg metode", 30.sp)
    Text("Koden fra en autentiseringsapp gjør kontoen din tryggere. Alt skjer her i appen.", color = p.mut, fontSize = 14.sp)
    TfOption40("Autentiseringsapp", "Passord (iOS), Google Authenticator, 1Password, Aegis … på denne telefonen", "Anbefalt", true) { vm.setupTf40() }
    TfOption40("Passnøkkel med fingeravtrykk", "Raskest · kommer når serveren støtter passnøkler", "Raskest", false) {}
    if (vm.p40.tfNeedPw) {
        Text("Bekreft med passordet ditt for å fortsette.", color = p.ink, fontSize = 13.5.sp)
        PField("Passord", pw, { pw = it }, password = true, onDone = { vm.setupTf40(pw) })
        PButton("Fortsett", Modifier.fillMaxWidth()) { vm.setupTf40(pw) }
    }
}

@Composable
private fun TfConnect40(vm: AppViewModel, ctx: Context) {
    val p = PaperPal.current
    val su = vm.p40.tfSetup ?: return
    var qr by remember { mutableStateOf(false) }
    var copied by remember { mutableStateOf(false) }
    PSerif("Koble til", 30.sp)
    Text("Trykk knappen: autentiseringsappen på denne telefonen åpnes og legger til «${su.issuer}» av seg selv. Ingen QR å skanne.", color = p.mut, fontSize = 14.sp, lineHeight = 20.sp)
    PButton("Åpne i autentiseringsappen", Modifier.fillMaxWidth(), height = 54.dp) {
        val ok = runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(su.otpauth)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
        if (!ok) vm.message = "Fant ingen autentiseringsapp. Installer f.eks. Google Authenticator eller Aegis, eller kopier nøkkelen."
        else vm.p40.tfStep = 2
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("HEMMELIG NØKKEL", p.mut)
        Text(tfGroups40(su.secret), color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, letterSpacing = 1.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (copied) "Kopiert" else "Kopier", Modifier.weight(1f), kind = "line", height = 40.dp) {
                copy40(ctx, "Nøkkel", su.secret); copied = true; Haptics.select()
            }
            PButton(if (qr) "Skjul QR" else "Vis QR-kode", Modifier.weight(1f), kind = "line", height = 40.dp) { qr = !qr }
        }
        if (qr) {
            val bmp = remember(su.qrPng) { su.qrPng?.substringAfter("base64,", "")?.takeIf { it.isNotBlank() }?.let { b ->
                runCatching { Base64.decode(b, Base64.DEFAULT).let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) } }.getOrNull()
            } }
            if (bmp != null) Image(bmp.asImageBitmap(), "QR-kode for en annen enhet", Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Color.White).padding(12.dp))
            else Text("Serveren sendte ingen QR-kode som bilde. Skriv inn nøkkelen over i appen på den andre enheten.", color = p.mut, fontSize = 12.5.sp)
        }
    }
    PButton("Jeg har lagt den til ›", Modifier.fillMaxWidth(), kind = "line") { vm.p40.tfStep = 2 }
}

@Composable
private fun TfCode40(vm: AppViewModel) {
    val p = PaperPal.current
    var code by remember { mutableStateOf("") }
    PSerif("Skriv koden", 30.sp)
    Text("Skriv de 6 sifrene autentiseringsappen viser nå. Koden kan også fylles inn automatisk.", color = p.mut, fontSize = 14.sp)
    // EditText med autofill-hint for engangskoder (SMS_OTP / ONE_TIME_CODE), så koden kan autofylles.
    AndroidView(
        factory = { c: Context ->
            EditText(c).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                textSize = 28f
                letterSpacing = .4f
                hint = "000000"
                filters = arrayOf<android.text.InputFilter>(android.text.InputFilter.LengthFilter(6))
                if (Build.VERSION.SDK_INT >= 26) {
                    setAutofillHints("smsOTPCode", "oneTimeCode", "2faAppOTPCode")
                    importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_YES
                }
                addTextChangedListener(object : android.text.TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                    override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c2: Int) {}
                    override fun afterTextChanged(e: android.text.Editable?) {
                        code = e?.toString() ?: ""
                        if (code.length == 6) vm.enableTf40(code)
                    }
                })
                requestFocus()
            }
        },
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(horizontal = 14.dp),
    )
    PButton("Bekreft", Modifier.fillMaxWidth()) { vm.enableTf40(code) }
}

@Composable
private fun TfCodes40(vm: AppViewModel, ctx: Context, final: Boolean) {
    val p = PaperPal.current
    val codes = vm.p40.tfCodes
    var saved by remember { mutableStateOf(false) }
    PSerif("Reservekoder", 30.sp)
    Text("Bruk en av disse hvis du mister telefonen. Hver kode virker én gang. Lagre dem et trygt sted.", color = p.mut, fontSize = 14.sp, lineHeight = 20.sp)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        codes.chunked(2).forEach { r ->
            Row(Modifier.fillMaxWidth()) { r.forEach { c -> Text(c, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.weight(1f)) } }
        }
        if (codes.isEmpty()) Text("Serveren sendte ingen reservekoder.", color = p.mut, fontSize = 13.sp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PButton("Kopier alle", Modifier.weight(1f), kind = "line", height = 44.dp) { copy40(ctx, "Reservekoder", codes.joinToString("\n")); Haptics.select(); vm.flash("Kopiert") }
        PButton("Lagre / Del", Modifier.weight(1f), kind = "line", height = 44.dp) {
            runCatching {
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "Reservekoder · Nordlys OS").putExtra(Intent.EXTRA_TEXT, codes.joinToString("\n")), "Lagre reservekodene").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }
    if (final) {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { saved = !saved }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (saved) p.pos else Color.Transparent).border(2.dp, if (saved) p.pos else p.line, RoundedCornerShape(7.dp)),
                contentAlignment = Alignment.Center) { if (saved) Text("✓", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            Text("Jeg har lagret reservekodene", color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold)
        }
        PButton("Fullfør", Modifier.fillMaxWidth().graphicsLayer { alpha = if (saved) 1f else .45f }) { if (saved) { vm.p40.tfStep = 4; Haptics.success() } }
    } else PButton("Ferdig", Modifier.fillMaxWidth()) { vm.p40.tfManage = null }
}

@Composable
private fun TfDone40(vm: AppViewModel) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(p.posSoft), contentAlignment = Alignment.Center) { Text("✓", color = p.pos, fontSize = 34.sp, fontWeight = FontWeight.Bold) }
        PSerif("Totrinnsbekreftelse er på", 28.sp)
        Text("Denne telefonen er merket som pålitelig enhet. Fra internett ber Homelab om koden når du logger inn.", color = p.mut, fontSize = 14.sp, textAlign = TextAlign.Center)
        PButton("Ferdig", Modifier.fillMaxWidth()) { vm.p40.tfOpen = false; vm.loadTf40() }
    }
}

@Composable
private fun TfManage40(vm: AppViewModel, ctx: Context) {
    val p = PaperPal.current
    val s = vm.p40
    var pw by remember { mutableStateOf("") }
    when (s.tfManage) {
        "codes" -> { TfCodes40(vm, ctx, final = false); return }
        "disable" -> {
            PSerif("Slå av", 30.sp)
            Text("Skriv passordet ditt (eller en kode fra appen) for å slå av totrinnsbekreftelse.", color = p.mut, fontSize = 14.sp)
            PField("Passord eller kode", pw, { pw = it }, password = true, onDone = { vm.disableTf40(pw) })
            PButton("Slå av totrinnsbekreftelse", Modifier.fillMaxWidth(), kind = "lab") { vm.disableTf40(pw) }
            return
        }
    }
    PSerif("Totrinnsbekreftelse", 30.sp)
    val t = s.tf
    Text("På · autentiseringsapp" + (t?.backupLeft?.let { " · $it reservekoder igjen" } ?: ""), color = p.pos, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    PCard {
        PRow("Nye reservekoder", "De gamle slutter å virke", "›", serif = false) { vm.regenTf40() }
        PRow("Bytt autentiseringsapp", "Ny nøkkel til en annen app", "›", serif = false, top = true) { s.tfStep = 0; vm.setupTf40() }
        PRow("Legg til passnøkkel", "Kommer når serveren støtter passnøkler", "", serif = false, top = true)
        PRow("Slå av", "Krever passord", "›", p.lab, serif = false, top = true) { s.tfManage = "disable" }
    }
}

private fun copy40(ctx: Context, label: String, text: String) {
    runCatching { (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, text)) }
}

/* ======================= Finans ======================= */

/** «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian» (+ «Sist endret …») nederst i detaljen og på kvitteringen. */
@Composable
internal fun TxAdded40(vm: AppViewModel, txId: Int, receipt: Boolean = false) {
    val p = PaperPal.current
    var a by remember(txId) { mutableStateOf<Added40?>(null) }
    var r by remember(txId) { mutableStateOf<Added40?>(null) }
    LaunchedEffect(txId, vm.txDetail) { vm.loadAdded40(txId) { x, y -> a = x; r = y } }
    val v = (if (receipt) r ?: a else a) ?: return
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(v.line, color = p.sub, fontSize = 12.5.sp, textAlign = TextAlign.Center)
        v.edited?.let { Text(it, color = p.sub, fontSize = 12.5.sp, textAlign = TextAlign.Center) }
    }
}

/** «✦ La Glimt lese kvitteringen på nytt» + jobbkortet + resultatet (endringer / ingen endringer / summen stemmer ikke). */
@Composable
internal fun Reread40Section(vm: AppViewModel, t: Tx, receiptId: String?) {
    val p = PaperPal.current
    receiptId ?: return
    val r = vm.p40.rr[t.id]
    when {
        r == null -> Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(p.ink).clickable(role = Role.Button) { vm.reread40(t.id, receiptId) },
            contentAlignment = Alignment.Center) { Text("✦ La Glimt lese kvitteringen på nytt", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.5.sp) }
        r.busy -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            GlimtFig35("glimt", 34.dp, "talk")
            Column(Modifier.weight(1f)) {
                Text("Glimt leser kvitteringen på nytt …", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Sjekker butikk, dato, hver linje og at summen stemmer", color = p.mut, fontSize = 12.5.sp)
                ReadSecs50(r.started50, r.small50) // prompt 50: «Leser … 12 s» så det ikke ser hengt ut
            }
        }
        else -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp)).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PLabel("✦ GLIMT", p.lab)
            Text(r.error ?: r.text ?: "", color = if (r.error != null || r.sumOk == false) p.lab else p.ink, fontSize = 14.sp, lineHeight = 20.sp)
            r.changes.forEach { c ->
                Column {
                    Text(c.field, color = p.mut, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(c.old, color = p.mut, fontSize = 13.sp, textDecoration = TextDecoration.LineThrough, modifier = Modifier.weight(1f, fill = false))
                        Text("→", color = p.mut, fontSize = 13.sp)
                        Text(c.new, color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f, fill = false))
                    }
                }
            }
            if (r.error != null) RereadErr50Buttons(vm, t.id, receiptId, r) // prompt 50: Prøv igjen · Les mindre versjon · Lukk
            else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (r.changes.isNotEmpty() && r.candidateId != null) {
                    PButton("Bruk endringene", Modifier.weight(1f), height = 42.dp) { vm.rereadApply40(t.id, keep = true) }
                    PButton("Behold som før", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.rereadApply40(t.id, keep = false) }
                } else if (r.sumOk == false) {
                    PButton("Rediger alt", Modifier.weight(1f), height = 42.dp) { vm.rereadApply40(t.id, keep = false); vm.p40.editAll = t.id }
                } else PButton("OK", Modifier.weight(1f), kind = "line", height = 42.dp) { if (r.candidateId != null) vm.rereadApply40(t.id, keep = false) else vm.p40.rr = vm.p40.rr - t.id }
            }
        }
    }
}

/** «Rediger alt»: alle felt, varelinjer med live sumkontroll og «Tilbakestill til slik Glimt leste den». */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun EditAll40Sheet(vm: AppViewModel, d: TxDetail) {
    val p = PaperPal.current
    val t = d.tx
    val nb = java.util.Locale("nb", "NO")
    val orig = remember(t.id) { (d.receipt?.lines?.ifEmpty { null } ?: t.lines).map { (n, v) -> EditLine40(n, String.format(nb, "%.2f", v)) } }
    var desc by remember(t.id) { mutableStateOf(t.description) }
    var merchant by remember(t.id) { mutableStateOf(t.merchant ?: "") }
    var date by remember(t.id) { mutableStateOf(t.date.take(10)) }
    var amount by remember(t.id) { mutableStateOf(String.format(nb, "%.2f", kotlin.math.abs(t.amount))) }
    var income by remember(t.id) { mutableStateOf(t.amount > 0) }
    var cat by remember(t.id) { mutableStateOf(t.categoryId) }
    var acc by remember(t.id) { mutableStateOf(t.accountId) }
    var note by remember(t.id) { mutableStateOf(t.note) }
    val lines = remember(t.id) { mutableStateListOf<EditLine40>().apply { addAll(orig) } }
    var linesTouched by remember(t.id) { mutableStateOf(false) }
    val ctx = LocalContext.current
    ModalBottomSheet(onDismissRequest = { vm.p40.editAll = null }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Rediger alt", 26.sp)
            PField("Butikk / beskrivelse", desc, { desc = it })
            PField("Motpart", merchant, { merchant = it }, placeholder = "F.eks. Rema 1000")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f)) {
                    PField("Dato", date, { date = it }, placeholder = "ÅÅÅÅ-MM-DD")
                }
                PButton("Velg", height = 44.dp, kind = "line") {
                    val cur = runCatching { java.time.LocalDate.parse(date) }.getOrDefault(java.time.LocalDate.now())
                    android.app.DatePickerDialog(ctx, { _, y, m, dd -> date = "%04d-%02d-%02d".format(y, m + 1, dd) }, cur.year, cur.monthValue - 1, cur.dayOfMonth).show()
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f)) { PField("Beløp", amount, { amount = it }, keyboard = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal)) }
                Seg40Small(listOf("ut" to "Utgift", "inn" to "Inntekt"), if (income) "inn" else "ut") { income = it == "inn" }
            }
            PLabel("KATEGORI", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (vm.boot?.categories ?: emptyList()).filter { it.kind == (if (income) "income" else "expense") || it.kind.isBlank() }.forEach { c -> PChip(c.name, c.id == cat) { cat = c.id } }
            }
            PLabel("KONTO", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                (vm.boot?.accounts ?: emptyList()).forEach { a -> PChip(a.name, a.id == acc) { acc = a.id } }
            }
            PField("Notat", note, { note = it })
            PLabel("VARELINJER", p.mut)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                lines.forEachIndexed { i, l ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.weight(1f)) { PField("", l.name, { v -> lines[i] = l.copy(name = v); linesTouched = true }, placeholder = "Vare") }
                        Box(Modifier.width(96.dp)) { PField("", l.price, { v -> lines[i] = l.copy(price = v); linesTouched = true }, placeholder = "0,00",
                            keyboard = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal)) }
                        Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClickLabel = "Fjern linje") { lines.removeAt(i); linesTouched = true }, contentAlignment = Alignment.Center) {
                            Text("×", modifier = Modifier.semantics { contentDescription = "Fjern linje" }, color = p.mut, fontSize = 20.sp)
                        }
                    }
                }
                Text("+ Legg til linje", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp,
                    modifier = Modifier.clip(CircleShape).clickable { lines.add(EditLine40("", "")); linesTouched = true }.padding(8.dp, 6.dp))
            }
            val sum = lines.sumOf { it.price.replace(',', '.').replace(" ", "").toDoubleOrNull() ?: 0.0 }
            val amt = amount.replace(',', '.').replace(" ", "").replace(" ", "").toDoubleOrNull() ?: 0.0
            if (lines.isNotEmpty()) {
                val ok = kotlin.math.abs(sum - amt) < 0.6
                Text("Sum linjer ${n2(sum)} kr · " + if (ok) "stemmer" else "stemmer ikke med beløpet", color = if (ok) p.pos else p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            if (orig.isNotEmpty()) Text("Tilbakestill til slik Glimt leste den", color = p.mut, fontSize = 13.sp, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clickable { lines.clear(); lines.addAll(orig); linesTouched = false; amount = String.format(nb, "%.2f", kotlin.math.abs(t.amount)); desc = t.description; date = t.date.take(10) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line") { vm.p40.editAll = null }
                PButton(if (vm.p40.editBusy) "Lagrer …" else "Lagre", Modifier.weight(1f)) {
                    vm.saveAll40(t, desc, merchant, date, amount, income, cat, acc, note, if (linesTouched) lines.toList() else null) { vm.p40.editAll = null }
                }
            }
        }
    }
}

@Composable
private fun Seg40Small(opts: List<Pair<String, String>>, cur: String, pick: (String) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.surf2).padding(3.dp)) {
        opts.forEach { (k, n) ->
            val on = k == cur
            Box(Modifier.fillMaxHeight().clip(RoundedCornerShape(19.dp)).background(if (on) p.card else Color.Transparent).clickable { pick(k) }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center) { Text(n, color = if (on) p.ink else p.mut, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
    }
}

/** Finans → Søk: Glimt-svaret i tre deler (oppsummering, tre nøkkeltall, kort per element) og «Åpne Subscription OS ›». */
@Composable
internal fun FinAsk40(vm: AppViewModel, a: Ask40) {
    val p = PaperPal.current
    val today = java.time.LocalDate.now()
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("✦ GLIMT", p.lab, modifier = Modifier.weight(1f))
            Text(a.source?.let { if (it.contains("Subscription", true)) "fra $it" else it } ?: "leste transaksjoner og kvitteringer", color = p.mut, fontSize = 11.5.sp, maxLines = 1)
        }
        PSerif(a.text, 19.sp, p.ink, weight = FontWeight.Normal)
        if (a.kpis.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            a.kpis.forEach { k ->
                Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(k.label, color = p.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 9.5.sp, letterSpacing = 1.sp, maxLines = 1)
                    Text(k.value, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    k.sub?.let { Text(it, color = p.mut, fontSize = 11.sp, maxLines = 2, lineHeight = 14.sp) }
                }
            }
        }
        if (a.items.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.bg)) {
            a.items.forEachIndexed { i, it0 ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                val nd = it0.next?.let { n -> runCatching { java.time.LocalDate.parse(n.take(10)) }.getOrNull() }
                val days = nd?.let { java.time.temporal.ChronoUnit.DAYS.between(today, it).toInt() }
                Row(Modifier.fillMaxWidth().clickable { if (it0.kind == "sub") vm.openSubFromMer38() else it0.id?.toIntOrNull()?.let { id -> vm.openTxHl30(id, null) } }.padding(12.dp, 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Logo(vm, it0.domain, it0.name, 0xFF2B5D8A, 36, RoundedCornerShape(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(it0.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val nx = nd?.let { "Neste trekk ${it.dayOfMonth}. ${MON40[it.monthValue - 1]}" + (days?.let { d -> if (d == 0) " · i dag" else if (d > 0) " · om $d ${if (d == 1) "dag" else "dager"}" else "" } ?: "") }
                        (nx ?: it0.note)?.let { Text(it, color = if (days != null && days in 0..7) p.lab else p.mut, fontSize = 12.sp, maxLines = 1) }
                    }
                    it0.amount?.let { v ->
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${if (v % 1.0 == 0.0) n0(v) else n2(v)} kr", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            val yearly = it0.cycle?.lowercase()?.let { c -> c.startsWith("year") || c.startsWith("år") } == true
                            Text(if (yearly) "per år · ${n0(v / 12)}/mnd" else "per mnd", color = p.mut, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        a.action?.let { (label, target) ->
            PButton(label, Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { if (target.contains("sub")) vm.openSubFromMer38() }
        }
    }
}


/* ======================= Nyheter: Glimt-siden ======================= */

/** Øverste kort i Nyhetsleseren: «✦ GLIMT · SAMMENDRAG» (kort ingress) → «Les hele sammendraget med kilder og bilder ›». */
@Composable
internal fun NewsGlimtEntry40(vm: AppViewModel, lead: String?) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(18.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(18.dp))
        .clickable(role = Role.Button, onClickLabel = "Åpne Glimt-sammendraget") { Haptics.tap(); vm.openNewsGlimt40() }.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("✦ GLIMT · SAMMENDRAG", p.lab)
        lead?.takeIf { it.isNotBlank() }?.let { PSerif(it, 18.sp, p.ink, italic = true, weight = FontWeight.Normal, maxLines = 4) }
        Text("Les hele sammendraget med kilder og bilder ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
    }
}

@Composable
internal fun NewsGlimt40Page(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    val ctx = LocalContext.current
    BackHandler { if (s.ngPick) s.ngPick = false else { vm.stopSay35(); s.newsGl = false } }
    LaunchedEffect(Unit) { vm.runNewsGlimt40() }
    val g = s.ng
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(18.dp, 10.dp, 18.dp, 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill40("‹ Nyheter") { vm.stopSay35(); s.newsGl = false }
                Spacer(Modifier.weight(1f))
                if (g != null) Pill40(if (vm.p35.speaking != null) "■ Stopp" else "▶ Les opp") {
                    if (vm.p35.speaking != null) vm.stopSay35() else vm.say35(listOf(g.title, g.lead).plus(g.sections.flatMap { sx -> listOf(sx.h) + sx.text.map { it.first } }).joinToString(". "), "glimt", force = true)
                }
                Pill40("Innhold") { s.ngPick = true }
            }
            PLabel("✦ GLIMT · NYHETSOPPSUMMERING", p.lab)
            if (s.ngBusy && g == null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GlimtFig35("glimt", 40.dp, "talk"); Text("Glimt leser sakene …", color = p.mut, fontSize = 14.sp)
            }
            s.ngErr?.let { Text(it, color = p.lab, fontSize = 13.5.sp) }
            if (g == null && !s.ngBusy && s.ngErr == null) Text("Ingen saker passer valgene. Trykk «Innhold» og velg flere kilder eller en lengre periode.", color = p.mut, fontSize = 14.sp)
            if (g != null) {
                PSerif(g.title, 34.sp)
                val now = java.time.LocalDate.now()
                Text(listOf("${now.dayOfMonth}. ${MON40[now.monthValue - 1]}", "${g.count} saker", "${g.refs.map { it.source }.distinct().size} kilder", if (s.ngSel.length == "lang") "langt" else "kort").joinToString(" · "),
                    color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
                if (g.lead.isNotBlank()) PSerif(g.lead, 19.sp, p.sub, italic = true, weight = FontWeight.Normal)
                val long = s.ngSel.length == "lang"
                g.sections.forEachIndexed { i, sx ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(sx.h, color = p.ink, fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = 22.sp)
                        if (sx.image != null && (long || i < 3)) {
                            NewsImage27(vm, sx.image, g.refs.firstOrNull { it.n == sx.imageRef }?.source ?: "", Modifier.fillMaxWidth().aspectRatio(if (i == 0) 16f / 9f else 3f / 2f), 14.dp, 22)
                            sx.imageRef?.let { n -> Text("Bilde fra saken [$n] · ${g.refs.firstOrNull { it.n == n }?.source ?: ""}", color = p.mut, fontSize = 11.5.sp) }
                        }
                        sx.text.forEach { (tx, refs) ->
                            FlowRow40 {
                                Text(tx, color = p.ink, fontSize = 15.sp, lineHeight = 22.sp)
                                refs.forEach { n -> RefChip40(n) { openRef40(vm, ctx, g.refs.firstOrNull { it.n == n }) } }
                            }
                        }
                    }
                }
                if (g.refs.isNotEmpty()) {
                    PLabel("KILDER", p.mut)
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card)) {
                        g.refs.forEachIndexed { i, r ->
                            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                            Row(Modifier.fillMaxWidth().clickable { openRef40(vm, ctx, r) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("[${r.n}]", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                NewsImage27(vm, r.image, r.source, Modifier.size(44.dp), 8.dp, 13)
                                Column(Modifier.weight(1f)) {
                                    Text(r.title, color = p.ink, fontSize = 13.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(listOfNotNull(r.source, r.time).joinToString(" · "), color = p.mut, fontSize = 11.5.sp)
                                }
                            }
                        }
                    }
                }
                Text("Laget av Glimt kl. ${hlClock40(g.updatedAt) ?: java.time.LocalTime.now().let { "%02d:%02d".format(it.hour, it.minute) }} fra kildene du har valgt. Trykk på et tall for å lese saken." +
                    if (g.local) " (Uten AI: titlene gruppert per tema.)" else "", color = p.mut, fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun Pill40(t: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(34.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { onClick() }.padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center) { Text(t, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1) }
}

@Composable
private fun RefChip40(n: Int, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.padding(start = 3.dp, top = 2.dp).height(20.dp).clip(RoundedCornerShape(6.dp)).background(p.surf2).clickable(role = Role.Button, onClickLabel = "Les sak $n") { onClick() }.padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center) { Text("$n", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRow40(content: @Composable () -> Unit) {
    FlowRow(verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
}

private fun openRef40(vm: AppViewModel, ctx: Context, r: NgRef40?) {
    r ?: return
    val item = vm.news?.items?.firstOrNull { it.url == r.url || it.title == r.title }
    if (item != null) vm.openArticle27(item) else r.url?.let { openLink(ctx, it) }
}

/** «Innhold»: kilder, temaer, periode og lengde → «✦ Lag sammendrag (N saker)». */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun NgPicker40(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p40
    var sel by remember { mutableStateOf(s.ngSel) }
    val feeds = vm.news?.feeds?.filter { it.enabled } ?: emptyList()
    ModalBottomSheet(onDismissRequest = { s.ngPick = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 34.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Innhold", 26.sp)
            PLabel("KILDER", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Alle", sel.sources.isEmpty()) { sel = sel.copy(sources = emptySet()) }
                feeds.forEach { f -> PChip(f.name, f.id in sel.sources) { sel = sel.copy(sources = if (f.id in sel.sources) sel.sources - f.id else sel.sources + f.id) } }
            }
            PLabel("TEMAER", p.mut)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PChip("Alle", sel.topics.isEmpty()) { sel = sel.copy(topics = emptySet()) }
                NG_TOPICS40.forEach { (k, n) -> PChip(n, k in sel.topics) { sel = sel.copy(topics = if (k in sel.topics) sel.topics - k else sel.topics + k) } }
            }
            PLabel("PERIODE", p.mut)
            Seg40(listOf("dag" to "I dag", "24t" to "24 t", "uke" to "Uke"), sel.period) { sel = sel.copy(period = it) }
            PLabel("LENGDE", p.mut)
            Seg40(listOf("kort" to "Kort", "lang" to "Lang"), sel.length) { sel = sel.copy(length = it) }
            val n = vm.ngItems40(sel).size
            PButton("✦ Lag sammendrag ($n saker)", Modifier.fillMaxWidth(), kind = "lab") {
                vm.setNgSel40(sel); s.ngPick = false; vm.runNewsGlimt40(force = true)
            }
        }
    }
}

/* ======================= Hjemlys ======================= */

private val HL_GREEN40 = Color(0xFF2F9E5B)
private val HL_RED40 = Color(0xFFD9412E)
private val HL_GOLD40 = Color(0xFFF2A93B)

/** Den glødende prikken (#FFE7A3 → #F2A93B) med ring i tilstandsfargen. */
@Composable
internal fun HlDot40(state: String?, size: Dp = 34.dp) {
    val ring = when (state) { "late" -> HL_RED40; "home" -> HL_GOLD40; "onTheWay" -> HL_GREEN40; else -> Color(0x33F2A93B) }
    Box(Modifier.size(size).clip(CircleShape).background(ring.copy(alpha = .18f)).border(2.dp, ring, CircleShape), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * .46f).clip(CircleShape).background(Brush.radialGradient(listOf(Color(0xFFFFE7A3), Color(0xFFF2A93B)))))
    }
}

private fun hlStateText40(state: String, eta: String?): String {
    val m = hlMinutes40(eta)
    return when (state) {
        "late" -> "Sen" + (m?.takeIf { it < 0 }?.let { " · ${-it} min over" } ?: "")
        "home" -> "Hjemme"
        "ended" -> "Avsluttet"
        else -> "På vei hjem" + (hlClock40(eta)?.let { " · ca. $it" } ?: "")
    }
}

/**
 * Familie-kortet og Hjem-kortet: egen økt (tid, «+ 10 min», «Jeg er hjemme», «Alt OK» når sen), husstanden (bare at Hjemlys er
 * aktivt, delingsdata først når noen er sen), Glimt-forslaget og «Start Hjemlys».
 */
@Composable
internal fun HjemlysCard40(vm: AppViewModel, compact: Boolean = false) {
    val p = PaperPal.current
    val s = vm.p40
    LaunchedEffect(vm.account?.id) { vm.loadHjemlys40() }
    if (s.hlMissing) return
    val h = s.hl
    val mine = h?.mine?.takeIf { it.state != "ended" && it.state != "home" }
    val meId = vm.myUserId40()
    val others = h?.household?.filter { it.userId != meId && it.userId != h.mine?.userId && it.state != "ended" } ?: emptyList()
    if (compact && mine == null && others.isEmpty() && s.hlSuggest?.suggest != true) {
        // Hjem: liten rad når ingenting er aktivt.
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).clickable(role = Role.Button) { s.hlSheet = true }.padding(14.dp, 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HlDot40(null, 30.dp)
            Column(Modifier.weight(1f)) {
                Text("Vel fremme", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
                Text("Si fra til familien når du er hjemme", color = p.mut, fontSize = 12.5.sp, maxLines = 1)
            }
            Text("Start ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
        }
        return
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(22.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HlDot40(mine?.state)
            Column(Modifier.weight(1f)) {
                PLabel("FAMILIE · VEL FREMME", p.mut)
                Text(mine?.let { hlStateText40(it.state, it.eta) } ?: "Si fra når du er hjemme", color = if (mine?.state == "late") HL_RED40 else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.5.sp)
            }
            mine?.let { m -> hlMinutes40(m.eta)?.takeIf { it >= 0 }?.let { Text("$it min", color = HL_GREEN40, fontFamily = PaperFonts.serif, fontSize = 24.sp) } }
        }
        if (mine != null) {
            Text("Åpne Vel fremme ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable { s.hlSheet = true })
            Text(if (mine.state == "late") "Familien har fått beskjed med posisjonen din." else "Husstanden ser at Vel fremme er på. Ingenting deles før du er sen.",
                color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (mine.state == "late") {
                    PButton("Alt OK", Modifier.weight(1f), height = 42.dp) { vm.hjemlysAct40("ok") }
                    PButton("+ 15 min", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.hjemlysAct40("plus15") }
                } else {
                    PButton("+ 10 min", Modifier.weight(1f), kind = "line", height = 42.dp) { vm.hjemlysAct40("plus") }
                    PButton("Jeg er hjemme", Modifier.weight(1f), height = 42.dp) { vm.hjemlysAct40("home") }
                }
            }
            Text("Avslutt", color = p.mut, fontSize = 12.5.sp, textDecoration = TextDecoration.Underline, modifier = Modifier.clickable { vm.hjemlysAct40("end") })
        }
        others.forEach { m ->
            // Trykk: mottakers visning (1a rolig / 1c rød om natten) når personen er sen, ellers Hjemlys-siden.
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { s.hlLateFor = m.userId.takeIf { m.state == "late" }; s.hlSheet = true },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HlDot40(m.state, 26.dp)
                Column(Modifier.weight(1f)) {
                    Text(firstName37(m.name), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text(hlStateText40(m.state, m.eta), color = if (m.state == "late") HL_RED40 else p.mut, fontSize = 12.5.sp)
                    // Delingsdataene finnes bare når personen er sen (serveren sender dem ikke ellers).
                    m.share?.takeIf { m.state == "late" }?.let { sh ->
                        val pos = sh.optJSONObject("pos")
                        val bat = sh.optJSONObject("battery")?.optInt("level", -1)?.takeIf { it >= 0 } ?: sh.optInt("battery", -1).takeIf { it >= 0 }
                        Text(listOfNotNull(sh.optString("place").takeIf { it.isNotBlank() } ?: pos?.let { "%.4f, %.4f".format(it.optDouble("lat"), it.optDouble("lon")) },
                            bat?.let { "batteri $it %" }, sh.optString("with").takeIf { it.isNotBlank() }?.let { "var med $it" }).joinToString(" · "), color = p.sub, fontSize = 12.sp)
                    }
                }
            }
        }
        // 1b: Glimt foreslår («Ja, start» / «Ikke nå»).
        if (mine == null) Suggest40(vm, false)
        if (mine == null) PButton("Start Vel fremme", Modifier.fillMaxWidth(), kind = "lab", height = 44.dp) { s.hlSheet = true }
    }
}
