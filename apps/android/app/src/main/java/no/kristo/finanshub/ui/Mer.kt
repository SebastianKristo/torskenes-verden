package no.kristo.finanshub.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check

/** Manrope 600 12,5 med linjehøyde 12,5 og uten fontpadding, så teksten står på samme høyde som ikonet. */
internal val TAB_TEXT24: TextStyle = TextStyle(
    fontFamily = PaperFonts.sans, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, lineHeight = 12.5.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
)

/**
 * Én fane i Papir-linjene (Hjem, Finans, Domener, Abonnementer, Familie).
 * Prompt 25: stilen (Innstillinger → Fanelinje-stil) gjelder alle linjene:
 *  - «text»: navn på alle, ikon (16) bare på valgt
 *  - «icons»: ikon (20) på alle i like brede felt, ingen navn (navnet er contentDescription)
 *  - «icons_active_label»: ikon (20) på alle, valgt fane viser ikon (16) og navn i pillen
 */
@Composable
internal fun RowScope.PaperTab24(
    label: String, icon: String, on: Boolean, ink: Color, actInk: Color, act: Color, serif: Boolean = false,
    style: String = NavStyle25.v, onClick: () -> Unit,
) {
    val showIcon = style != "text" || on
    val showLabel = style == "text" || (style == "icons_active_label" && on)
    val glyph = if (showLabel) 16 else 20
    val equal = style == "icons" || !on
    Row(
        (if (equal) Modifier.weight(1f) else Modifier).height(46.dp).clip(CircleShape).background(if (on) act else Color.Transparent)
            .clickable(role = Role.Tab, onClickLabel = label, onClick = onClick)
            .then(if (showLabel) Modifier else Modifier.semantics { contentDescription = label })
            .padding(horizontal = if (on && showLabel) 16.dp else 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
    ) {
        // Tegn-ikoner (◎ ◌ ♡ ⋯ i Familie) i Newsreader 500, ellers vektorikon.
        if (showIcon) Box(Modifier.size((glyph + 2).dp).offset(y = if (showLabel) 1.5.dp else 0.dp), contentAlignment = Alignment.Center) {
            val c = if (on) actInk else ink
            if (serif && icon != "◌" && icon != "♡") Text(icon, color = c, style = TAB_TEXT24.copy(fontFamily = PaperFonts.serif, fontWeight = FontWeight.Medium, fontSize = glyph.sp, lineHeight = glyph.sp), maxLines = 1)
            else GlyphIcon(icon, c, glyph.dp)
        }
        if (showLabel) Text(label, color = if (on) actInk else ink, style = TAB_TEXT24, maxLines = 1, overflow = TextOverflow.Clip)
    }
}

/** En rad i Mer: ikon (40-boks, strekikon i palettfarge), tittel (Newsreader 500 19), undertekst og «›». */
@Composable
private fun MerRow24(vm: AppViewModel, i: Int, icon: String, title: String, sub: String, top: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().press24 { Haptics.select(); onClick() }.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MerIcon25(vm, i, icon)
            Column(Modifier.weight(1f)) {
                PSerif(title, 19.sp, maxLines = 1)
                Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = p.mut, modifier = Modifier.size(20.dp))
        }
    }
}

private class MerItem24(val icon: String, val title: String, val sub: String, val go: () -> Unit)

/**
 * Mer (side «mer»): Sporing (eller Domener når Sporing er en fane), Bursdager, Huskeliste, Familie og kart, Media, Finans,
 * Nyhetsleser og Innstillinger. Faner som allerede står i fanelinja tas ut. I en profil (Finans + Boliger) står Hjem først.
 * Prompt 25: ikon til venstre på hver rad (som i Innstillinger).
 */
@Composable
internal fun PaperMore24(vm: AppViewModel, navBottom: Dp, barSpace: Dp) {
    val inBar = vm.tabBarItems().map { it.id }.toSet()
    val onWay = vm.packagesOnWay
    val sporingInBar = "sporing" in inBar || (vm.tabBar.isEmpty() && vm.tab4 == "sporing")
    // Prompt 28: hold inne → redigeringsmodus (MerList28), rekkefølge og skjulte per konto; Subscription OS etter Finans.
    var n = 0
    val rows = buildList {
        fun row(key: String, title: String, sub: String, go: () -> Unit) { add(MerItem28(key, title, sub, n++, go)) }
        // Prompt 36: Now Brief øverst (kan flyttes og skjules som de andre). Sveipet bort på Hjem: «Skjult på Hjem · trykk for å åpne».
        row("brief", "Now Brief", if (vm.briefHiddenNow36()) "Skjult på Hjem · trykk for å åpne" else "Glimt oppsummerer dagen") { vm.openBrief34() }
        if (vm.b24ProfileOn) row("hjem", "Hjem", "Pakker, avganger og widgets") { vm.paperTab("hjem") }
        if (sporingInBar) { if ("domener" !in inBar) row("domener", "Domener", "Trafikk, besøk og oppetid") { vm.domSection = "oversikt"; vm.openFromMer(Screen.Domains) } }
        else row("sporing", "Sporing", if (onWay > 0) "$onWay pakker på vei" else "Pakker og sendinger") { vm.openFromMer(Screen.Tracking) }
        row("bursdag", "Bursdager", "Hvem har bursdag snart") { vm.openBirthdays24() }
        if ("chat" !in inBar) row("chat", "Chat", "Ollama lokalt, Gemini og Groq") { vm.openChat() }
        row("kalender", "Kalender", "Timeplan, prøver og frister") { vm.openKal26() }
        row("studie", "Studie", "Dokumenter, vitnemål og karakterer") { vm.openStudy44() } // prompt 44
        // Prompt 37: Gjøremål (tidligere Huskeliste) og Bibel (bare for brukere med bibelvers-modulen).
        row("huske", "Gjøremål", "To-do for hele familien") { vm.openTasks() }
        if (vm.bibleAllowed37()) row("bibel", "Bibel", "Dagens vers, rekke og leseplan") { vm.p37.biblePage = true }
        if ("familie" !in inBar) row("kart", "Familie og kart", "Posisjon, soner og helse") { vm.openFamily() }
        // Prompt 46 (claude-code-kart-side.md): Mer → Kart (side-nøkkel tkart), fullskjerm som Media/Kalender.
        row("tkart", "Kart", "Holdeplasser, sanntid og soner") { vm.openKart46() }
        row("skjold", "Skjold Lab", "Deler, skuffer og skap") { vm.openSkjold76() } // prompt 76
        if ("media" !in inBar) row("media", "Media", "Sonarr, Radarr, qBittorrent og Prowlarr") { vm.openMedia43() } // prompt 43
        if ("finans" !in inBar) row("finans", "Finans", "Oversikt, liste, Finn og mer") { vm.paperTab("fin") }
        row("abo", "Subscription OS", "Abonnementer og faste trekk") { vm.openSubFromMer38() }
        if ("nyheter" !in inBar) row("rss", "Nyhetsleser", "RSS med AI-sammendrag") { vm.openNews() }
        // Prompt 46 (claude-code-qr-innlogging-finans-kalender.md): snarvei til skanneren (godkjenn innlogging på Mac, nettbrett, Kalender …).
        row("qrlogin", "Logg inn på annen enhet", "Skann QR-koden på den andre skjermen") { vm.openQr38() }
        row("innst", "Innstillinger", "Tema, bakgrunn og konto") { vm.openPaperPage("set") }
    }
    // Prompt 37: én gangs migrering – Gjøremål var skjult i Mer-oppsettet; vis den (brukeren kan skjule den igjen selv).
    androidx.compose.runtime.LaunchedEffect(vm.account?.id) { vm.loadBible37(); kotlinx.coroutines.delay(2500); vm.merHuske37(); vm.mediaMigrate43() } // prompt 43: papir_mer_media_v2
    MerList28(vm, rows, navBottom, barSpace)
}

private val DAILY44 = listOf("kalender", "huske", "bursdag", "kart")

internal object Mer44 {
    var q by mutableStateOf("")
    fun key(vm: AppViewModel) = "papir_mer_tsz_" + (vm.account?.id ?: "")
    fun low(vm: AppViewModel): Boolean = vm.prefs.str(key(vm), "store") == "lave"
}

/** Levende undertekst; aldri plassholdere. */
internal fun liveSub44(vm: AppViewModel, key: String, def: String): String = when (key) {
    "kalender" -> nextEv44(vm)?.let { (t, w) -> "Neste: $t · $w" } ?: "Ingen hendelser i dag"
    "huske" -> vm.tasks?.items?.count { !it.done }?.let { "$it åpne for familien" } ?: def
    "bursdag" -> nextBd44(vm)?.let { (n, d) -> "$n ${dLabel44(d)}" } ?: if (vm.bd24.items != null) "Ingen bursdager de neste 30 dagene" else def
    "kart" -> home44(vm)?.let { (h, n) -> "$h av $n hjemme" } ?: def
    "media" -> {
        val dl = vm.p43.torrents?.count { it.progress < 1f && it.state == "dl" } ?: 0
        val nx = vm.p43.upcoming?.firstOrNull { it.day >= LocalDate.now().toString() }?.title
        listOfNotNull(if (dl > 0) "$dl lastes ned" else null, nx?.let { "neste: $it" }).joinToString(" · ").ifBlank { def }
    }
    else -> def
}

private fun dLabel44(d: Long) = when (d) { 0L -> "i dag"; 1L -> "i morgen"; else -> "om $d dager" }

private fun nextEv44(vm: AppViewModel): Pair<String, String>? {
    val now = LocalTime.now(); val today = LocalDate.now()
    val e = vm.kal26.events.orEmpty().filter { (it.date == today && (it.allDay || (it.end ?: it.start ?: LocalTime.MAX) >= now)) || it.date.isAfter(today) }
        .sortedWith(compareBy({ it.date }, { it.start ?: LocalTime.MIN })).firstOrNull() ?: return null
    val day = when (e.date) { today -> "i dag"; today.plusDays(1) -> "i morgen"; else -> "${e.date.dayOfMonth}.${e.date.monthValue}." }
    return e.title to (day + (e.start?.let { " " + it.toString().take(5) } ?: ""))
}

private fun nextBd44(vm: AppViewModel): Pair<String, Long>? {
    val today = LocalDate.now()
    val b = vm.bd24.items.orEmpty().minByOrNull { it.next } ?: return null
    val d = ChronoUnit.DAYS.between(today, b.next)
    return if (d > 30) null else firstName37(b.name) to d
}

private fun home44(vm: AppViewModel): Pair<Int, Int>? {
    val m = vm.family?.members?.takeIf { it.isNotEmpty() } ?: return null
    return m.count { it.last?.place?.contains("hjem", ignoreCase = true) == true } to m.size
}

/** Ikke-redigering: søkefelt, kort/rader og Innstillinger. Kalles fra MerList28. */
internal fun LazyListScope.mer44(vm: AppViewModel, vis: List<MerItem28>, wide: Boolean, onLong: () -> Unit) {
    val (sok52, tit52, vkt52) = Mer52.vis(vm, "mer") // prompt 52: skjul søkefelt og titler (wiggle)
    if (sok52) item(key = "mer44-q") { MerSearch44() }
    val q = norm44(Mer44.q)
    val rows = vis.filter { it.key != "innst" }.map { MerItem28(it.key, it.title, liveSub44(vm, it.key, it.sub), it.index, it.go) }
        .filter { q.isEmpty() || norm44(it.title).contains(q) || norm44(it.sub).contains(q) }
    val low = Mer44.low(vm)
    // Prompt 45 (claude-code-mer-tittel-og-store-bokser.md): brukeren velger de fire store boksene og kan skjule/gi nytt navn til tittelen.
    val big = Mer45.big(vm)
    val cards = if (low) emptyList() else big.mapNotNull { k -> rows.firstOrNull { it.key == k } }
    val tools = if (low) rows else rows.filter { it.key !in big }
    if (cards.isNotEmpty()) {
        if (tit52 && Mer45.showTitle(vm)) item(key = "mer44-hl") { PLabel(Mer45.title(vm), modifier = Modifier.padding(start = 4.dp, top = 4.dp)) }
        cards.chunked(if (wide) 4 else 2).forEachIndexed { i, ch ->
            item(key = "mer44-c$i") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ch.forEach { r -> MerCard44(vm, r, Modifier.weight(1f), onLong) }
                    repeat((if (wide) 4 else 2) - ch.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
    if (tools.isNotEmpty()) {
        if (!low && vkt52) item(key = "mer44-tl") { PLabel("Verktøy", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
        item(key = "mer-card") { PCard(shadow = true) { tools.forEachIndexed { i, r -> MerRowNormal28(vm, r, top = i > 0, onLong = onLong) } } }
    }
    if (rows.isEmpty()) item(key = "mer44-none") { Text("Ingen moduler heter «${Mer44.q}».", color = PaperPal.current.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) }
    vis.firstOrNull { it.key == "innst" }?.takeIf { q.isEmpty() || norm44(it.title).contains(q) }?.let { st ->
        item(key = "mer44-set") {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (PaperPal.current.bg.luminance44() > .5f) Color(0xFFE9E2D4) else PaperPal.current.card)) {
                MerRowNormal28(vm, st, top = false, onLong = onLong)
            }
        }
    }
    item(key = "mer-hint") {
        Text("Hold inne for å endre rekkefølgen, skjule moduler eller velge Store · Lave.", color = PaperPal.current.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(4.dp, 2.dp))
    }
}

private fun Color.luminance44(): Float = .2126f * red + .7152f * green + .0722f * blue

@Composable
private fun MerSearch44() {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp).shadow(6.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(p.card)
        .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("⌕", color = p.mut, fontSize = 17.sp)
        Box(Modifier.weight(1f).padding(start = 8.dp)) {
            if (Mer44.q.isEmpty()) Text("Søk i moduler", color = p.mut, fontSize = 15.sp)
            BasicTextField(Mer44.q, { Mer44.q = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
        }
        if (Mer44.q.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Tøm søket" }.size(40.dp).clip(CircleShape).clickable { Mer44.q = "" }.wrapContentSize())
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MerCard44(vm: AppViewModel, r: MerItem28, modifier: Modifier, onLong: () -> Unit) {
    val p = PaperPal.current
    Column(modifier.height(150.dp).shadow(8.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black.copy(alpha = .25f), spotColor = Color.Black.copy(alpha = .25f))
        .clip(RoundedCornerShape(22.dp)).background(p.card)
        .combinedClickable(role = Role.Button, onClickLabel = r.title, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); r.go() }.padding(14.dp),
        verticalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(30.dp)) { MerIcon25(vm, r.index, r.key) }
            Text(r.title, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            when (r.key) {
                "kalender" -> {
                    val e = nextEv44(vm)
                    Text(if (e != null) "Neste" else "I dag", color = p.mut, fontSize = 12.sp)
                    PSerif(e?.first ?: "Ingen hendelser i dag", 20.sp, maxLines = 2)
                    e?.let { Text(it.second.replaceFirstChar { c -> c.uppercase() }, color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1) }
                }
                "huske" -> {
                    val n = vm.tasks?.items?.count { !it.done }
                    PSerif(n?.toString() ?: "–", 40.sp, maxLines = 1)
                    Text("åpne for familien", color = p.mut, fontSize = 12.sp, maxLines = 1)
                }
                "bursdag" -> {
                    val b = nextBd44(vm)
                    Text("Snart", color = p.mut, fontSize = 12.sp)
                    PSerif(b?.first ?: "Ingen de neste 30 dagene", 20.sp, maxLines = 2)
                    b?.let { Text(dLabel44(it.second), color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 12.sp) }
                }
                "kart" -> {
                    val m = vm.family?.members.orEmpty()
                    if (m.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
                        m.take(4).forEach { x ->
                            Box(Modifier.size(28.dp).clip(CircleShape).background(x.color?.let { Color(it) } ?: p.ink).border(2.dp, p.card, CircleShape), contentAlignment = Alignment.Center) {
                                Text(x.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                    Text(home44(vm)?.let { (h, n) -> "$h av $n hjemme" } ?: r.sub, color = p.mut, fontSize = 12.sp, maxLines = 2)
                }
                // Prompt 45: andre moduler valgt som stor boks viser den levende underteksten.
                else -> PSerif(r.sub, 18.sp, maxLines = 3)
            }
        }
    }
}

/** I wiggle-redigering: Store · Lave (ved Ferdig). */
@Composable
internal fun MerSize44(vm: AppViewModel) {
    val p = PaperPal.current
    var low by remember(vm.account?.id) { mutableStateOf(Mer44.low(vm)) }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
        Row(Modifier.clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(3.dp)) {
            listOf(false to "Store", true to "Lave").forEach { (v, n) ->
                Box(Modifier.heightIn(min = 40.dp).clip(CircleShape).background(if (low == v) p.ink else Color.Transparent)
                    .clickable(role = Role.Tab) { Haptics.select(); low = v; vm.prefs.set(Mer44.key(vm), if (v) "lave" else "store") }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                    Text(n, color = if (low == v) p.bg else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
    }
}

/** Data til kortene hentes stille når Mer åpnes. */
@Composable
internal fun MerLoad44(vm: AppViewModel) {
    LaunchedEffect(vm.account?.id) {
        if (vm.kal26.events == null) runCatching { vm.loadKal26(quiet = true) }
        if (vm.bd24.items == null) runCatching { vm.loadBirthdays24(quiet = true) }
        if (vm.tasks == null) runCatching { vm.refreshTasks37() }
        if (vm.family == null) runCatching { vm.loadFamily() }
    }
}

internal object Mer45 {
    val DEF_BIG = listOf("kalender", "huske", "bursdag", "kart")
    private const val DEF_TITLE = "Hverdag og familie"
    /** Lest én gang per konto; endres i arket/redigeringen. */
    private var forAcct by mutableStateOf<String?>(null)
    private var titleV by mutableStateOf(DEF_TITLE)
    private var hideV by mutableStateOf(false)
    private var bigV by mutableStateOf(DEF_BIG)
    var pickFor by mutableStateOf<Int?>(null)

    private fun key(vm: AppViewModel) = "papir_mer45_" + (vm.account?.id ?: "")

    private fun ensure(vm: AppViewModel) {
        val k = key(vm)
        if (forAcct == k) return
        forAcct = k
        apply(runCatching { JSONObject(vm.prefs.str(k, "")) }.getOrNull())
        vm.launch45 {
            val raw = runCatching { vm.api45 { hlGet("/me/layout") } }.getOrNull() ?: return@launch45
            val o = runCatching { JSONObject(raw).optJSONObject("mer45") }.getOrNull() ?: return@launch45
            if (forAcct != k) return@launch45
            apply(o); vm.prefs.set(k, o.toString())
        }
    }

    private fun apply(o: JSONObject?) {
        if (o == null) return
        // Prompt 46: tom tittel (teksten slettet) er et gyldig valg – raden tegnes da ikke utenfor wiggle (ingen tomrom).
        titleV = if (o.has("title")) o.optString("title").trim() else DEF_TITLE
        hideV = o.optBoolean("hide", o.optBoolean("titleHidden", false)) // prompt 52: iOS skriver titleHidden
        val a = o.optJSONArray("big")
        if (a != null && a.length() == 4) bigV = (0 until 4).map { a.optString(it) }.filter { it.isNotBlank() }.takeIf { it.size == 4 } ?: DEF_BIG
    }

    private fun save(vm: AppViewModel) {
        // Prompt 52: fmerVis/merVis/salsty følger med i samme objekt (serveren lagrer mer45 som ett objekt, som iOS).
        val o = runCatching { Mer52.into(vm, JSONObject().put("title", titleV).put("hide", hideV).put("titleHidden", hideV).put("big", JSONArray(bigV))) }
            .getOrElse { JSONObject().put("title", titleV).put("hide", hideV).put("big", JSONArray(bigV)) }
        vm.prefs.set(key(vm), o.toString())
        vm.launch45 { runCatching { vm.api45 { hlPut("/me/layout", JSONObject().put("mer45", o)) } } }
    }

    fun title(vm: AppViewModel): String { ensure(vm); return titleV }
    fun titleHidden(vm: AppViewModel): Boolean { ensure(vm); return hideV }
    fun big(vm: AppViewModel): List<String> { ensure(vm); return bigV }
    fun setTitle(vm: AppViewModel, t: String) { titleV = t.trim(); save(vm) }
    /** Prompt 46 (claude-code-mer-tittel-fjern-mellomrom.md): skjult eller tom tittel → ingen tittelrad (heller ikke mellomrom). */
    fun showTitle(vm: AppViewModel): Boolean { ensure(vm); return !hideV && titleV.isNotBlank() }
    fun setHidden(vm: AppViewModel, h: Boolean) { Haptics.select(); hideV = h; save(vm) }
    /** Bytter boks [i] til [k]; ligger [k] allerede i en annen boks, bytter de plass. */
    fun setBig(vm: AppViewModel, i: Int, k: String) {
        val l = bigV.toMutableList()
        val j = l.indexOf(k)
        if (j >= 0 && j != i) l[j] = l[i]
        l[i] = k
        bigV = l; Haptics.select(); save(vm)
    }
}

/** I wiggle-redigering: tittelen (− / nytt navn / + Legg til tittel) og de fire store boksene med «⇄ Bytt». */
@Composable
internal fun MerEdit45(vm: AppViewModel, rows: List<MerItem28>) {
    val p = PaperPal.current
    if (Mer44.low(vm)) return
    val hidden = Mer45.titleHidden(vm)
    var text by remember(vm.account?.id) { mutableStateOf(Mer45.title(vm)) }
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (hidden) Box(
            Modifier.height(36.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { Mer45.setHidden(vm, false) }.padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { Text("+ Legg til tittel", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        else Box(Modifier.fillMaxWidth().padding(start = 10.dp, top = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(start = 22.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BasicTextField(
                    text, { text = it; Mer45.setTitle(vm, it) }, singleLine = true,
                    textStyle = TextStyle(color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 1.3.sp),
                    cursorBrush = SolidColor(p.lab), modifier = Modifier.weight(1f).semantics { contentDescription = "Tittel – trykk for å gi nytt navn" },
                )
                Text("✎", color = p.mut, fontSize = 14.sp)
            }
            MinusDot28("tittelen", Modifier.align(Alignment.TopStart)) { Mer45.setHidden(vm, true) }
        }
        val big = Mer45.big(vm)
        big.chunked(2).forEachIndexed { ri, ch ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ch.forEachIndexed { ci, k ->
                    val i = ri * 2 + ci
                    val r = rows.firstOrNull { it.key == k }
                    Row(
                        Modifier.weight(1f).height(64.dp).shadow(6.dp, RoundedCornerShape(18.dp)).clip(RoundedCornerShape(18.dp)).background(p.card)
                            .clickable(role = Role.Button, onClickLabel = "Bytt boks") { Haptics.select(); Mer45.pickFor = i }.padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (r != null) Box(Modifier.size(30.dp)) { MerIcon25(vm, r.index, r.key) }
                        Text(r?.title ?: k, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Box(Modifier.clip(CircleShape).background(p.ink).padding(horizontal = 8.dp, vertical = 3.dp)) { Text("⇄", color = p.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }
    }
    Mer45.pickFor?.let { i -> PickBoxSheet45(vm, i, rows) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PickBoxSheet45(vm: AppViewModel, i: Int, rows: List<MerItem28>) {
    val p = PaperPal.current
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val cur = Mer45.big(vm).getOrNull(i)
    val close = { Mer45.pickFor = null }
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PSerif("Velg boks", 24.sp, modifier = Modifier.weight(1f), maxLines = 1)
                SheetButton30("Ferdig", onClick = close)
            }
            Column(Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()).clip(RoundedCornerShape(20.dp)).background(p.card)) {
                rows.filter { it.key != "innst" }.forEachIndexed { n, r ->
                    if (n > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 60.dp).clickable(role = Role.Button, onClickLabel = r.title) { Mer45.setBig(vm, i, r.key); close() }.padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        MerIcon25(vm, r.index, r.key)
                        Column(Modifier.weight(1f)) {
                            Text(r.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                            Text(liveSub44(vm, r.key, r.sub), color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (r.key == cur) Icon(Icons.Filled.Check, contentDescription = "Valgt", tint = p.pos, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
    }
}

/* ======================= Finans → Mer i samme design (claude-code-finans-mer-samme-design.md) ======================= */

private var finQ45 by mutableStateOf("")

private val FIN_BIG45 = listOf("kontoer", "budsjett", "kvitt", "faste")

/**
 * Finans → Mer som hoved-Mer: «Søk i moduler», tittel FINANS, fire store kort (Saldo · Budsjett · Kvitteringer · Faste trekk, ekte tall
 * fra FinansHub), «Verktøy»-liste (ikon, navn, kort status) og Innstillinger-raden nederst. Hold inne → wiggle (flytt/skjul, som før).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun FinMer45(vm: AppViewModel, tiles: List<FinTile>, navBottom: androidx.compose.ui.unit.Dp, wide: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    val q = finQ45.trim().lowercase()
    fun hit(t: FinTile) = q.isEmpty() || t.title.lowercase().contains(q) || t.value.lowercase().contains(q)
    val byKey = tiles.associateBy { it.key }
    val big = FIN_BIG45.mapNotNull { byKey[it] }.filter(::hit)
    val tools = tiles.filter { it.key !in FIN_BIG45 && it.key != "innst" && hit(it) }
    val sm = vm.summary
    val accts = vm.boot?.accounts
    val review = vm.reviewCount ?: vm.boot?.reviewCount ?: 0
    val nextFast = vm.recurring?.filter { it.active && it.next != null }?.minByOrNull { it.next!! }
    val (sok52, tit52, vkt52) = Mer52.vis(vm, "fmer") // prompt 52: søkefelt og titler kan skjules i wiggle
    androidx.compose.foundation.lazy.LazyColumn(
        Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 16.dp + navBottom), verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (sok52) item(key = "fm45-q") {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 48.dp).shadow(6.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(p.card)
                .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("⌕", color = p.mut, fontSize = 17.sp)
                Box(Modifier.weight(1f).padding(start = 8.dp)) {
                    if (finQ45.isEmpty()) Text("Søk i moduler", color = p.mut, fontSize = 15.sp)
                    BasicTextField(finQ45, { finQ45 = it }, singleLine = true, textStyle = TextStyle(color = p.ink, fontSize = 15.sp), cursorBrush = SolidColor(p.lab), modifier = Modifier.fillMaxWidth())
                }
                if (finQ45.isNotEmpty()) Text("✕", color = p.mut, modifier = Modifier.semantics { contentDescription = "Tøm søket" }.size(40.dp).clip(CircleShape).clickable { finQ45 = "" }.wrapContentSize())
            }
        }
        if (big.isNotEmpty()) {
            if (tit52) item(key = "fm45-hl") { PLabel("Finans", modifier = Modifier.padding(start = 4.dp, top = 4.dp)) }
            big.chunked(if (wide) 4 else 2).forEachIndexed { i, ch ->
                item(key = "fm45-c$i") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ch.forEach { t ->
                            val (lab, main, sub) = when (t.key) {
                                "kontoer" -> Triple("Saldo", accts?.let { "${neg0(it.sumOf { a -> a.balance })} kr" } ?: "–", accts?.let { "${it.size} ${if (it.size == 1) "konto" else "kontoer"}" } ?: "Kontoer")
                                "budsjett" -> Triple("Budsjett", sm?.takeIf { it.budgetTotal > 0 }?.let { "${Math.round(it.budgetUsed / it.budgetTotal * 100)} %" } ?: "–",
                                    sm?.let { "brukt · ${it.daysLeft} dager igjen" } ?: "Per kategori")
                                "kvitt" -> Triple("Kvitteringer", "$review", if (review > 0) "til gjennomgang" else "alt er gjennomgått")
                                else -> Triple("Faste trekk", nextFast?.name ?: "–", nextFast?.let { f -> "neste ${f.next.orEmpty().take(10)} · ${n0(f.amount)} kr" } ?: "Ingen kommende")
                            }
                            Column(
                                Modifier.weight(1f).height(150.dp).shadow(8.dp, RoundedCornerShape(22.dp), ambientColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = .25f), spotColor = androidx.compose.ui.graphics.Color.Black.copy(alpha = .25f))
                                    .clip(RoundedCornerShape(22.dp)).background(merTint52(t.key)) // prompt 52: modulfargen 13 % i kortet
                                    .combinedClickable(role = Role.Button, onClickLabel = lab, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); t.go() }.padding(14.dp),
                                verticalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    val tint = merColor52(t.key)
                                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(tint), contentAlignment = Alignment.Center) {
                                        androidx.compose.material3.Icon(t.icon, null, tint = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(17.dp))
                                    }
                                    Text(lab, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    PSerif(main, if (main.length <= 9) 30.sp else 20.sp, maxLines = 2)
                                    Text(sub, color = if (t.key == "kvitt" && review > 0) p.lab else p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        repeat((if (wide) 4 else 2) - ch.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
        if (tools.isNotEmpty()) {
            if (vkt52) item(key = "fm45-tl") { PLabel("Verktøy", modifier = Modifier.padding(start = 4.dp, top = 6.dp)) }
            item(key = "fm45-tools") { PCard(shadow = true) { tools.forEachIndexed { i, t -> FinMerRow45(t, i > 0, onLong) } } }
        }
        tiles.firstOrNull { it.key == "innst" }?.takeIf(::hit)?.let { st ->
            item(key = "fm45-set") { Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) { FinMerRow45(st, false, onLong) } }
        }
        if (big.isEmpty() && tools.isEmpty()) item(key = "fm45-none") { Text("Ingen moduler heter «$finQ45».", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp)) }
        item(key = "fm45-hint") {
            Text("Hold inne for å endre rekkefølgen eller skjule sider.", color = p.mut, fontFamily = PaperFonts.sans, fontSize = 12.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(4.dp, 2.dp))
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun FinMerRow45(t: FinTile, top: Boolean, onLong: () -> Unit) {
    val p = PaperPal.current
    val tint = merColor52(t.key) // prompt 52: helfylt ikonbrikke i modulfargen med hvitt symbol
    Column {
        if (top) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().combinedClickable(role = Role.Button, onClickLabel = t.title, onLongClick = { Haptics.tap(); onLong() }) { Haptics.select(); t.go() }
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(tint), contentAlignment = Alignment.Center) {
                androidx.compose.material3.Icon(t.icon, null, tint = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(21.dp))
            }
            Column(Modifier.weight(1f)) {
                PSerif(t.title, 19.sp, maxLines = 1)
                Text(t.value, color = if (t.pos) p.pos else p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            t.badge?.let { b -> Box(Modifier.clip(CircleShape).background(p.lab).padding(8.dp, 2.dp)) { Text(b, color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold) } }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = p.mut, modifier = Modifier.size(20.dp))
        }
    }
}
