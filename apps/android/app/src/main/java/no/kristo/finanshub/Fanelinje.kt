package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/* ---------- Fanelinje-stil ---------- */

/** Stilene i fanelinja: «text» (navn på alle, ikon på valgt), «icons» (bare ikoner) og «icons_active_label» (ikoner, navn på valgt). */
val NAV_STYLES25: List<Triple<String, String, String>> = listOf(
    Triple("text", "Tekst", "Navn på alle · ikon på valgt fane"),
    Triple("icons", "Bare ikoner", "Ikoner uten navn"),
    Triple("icons_active_label", "Ikoner + navn på valgt", "Ikoner · valgt fane viser også navn"),
)

/** Stilen alle fanelinjene tegnes med. Ligger utenfor ViewModel så fanene (PaperTab24) kan lese den uten vm. */
object NavStyle25 {
    var v by mutableStateOf("text")
}

private const val NAV_STYLE_PREF = "nav_style_25"

/** Godtar også verdiene fra designet (tekst / ikon / ikonNavn). */
fun normNavStyle25(s: String?): String? = when (s?.trim()) {
    "text", "tekst" -> "text"
    "icons", "ikon" -> "icons"
    "icons_active_label", "ikonNavn" -> "icons_active_label"
    else -> null
}

fun AppViewModel.loadNavStyle25() {
    normNavStyle25(prefs.str(NAV_STYLE_PREF, ""))?.let { NavStyle25.v = it }
}

/** Fra GET /api/me/layout (navStyle, eller nav_style_labels fra eldre utkast). */
fun AppViewModel.applyNavStyle25(raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val v = normNavStyle25(o.optStr("navStyle") ?: o.optStr("nav_style_labels")) ?: return
    NavStyle25.v = v
    prefs.set(NAV_STYLE_PREF, v)
}

fun AppViewModel.setNavStyle25(v: String) {
    val s = normNavStyle25(v) ?: return
    NavStyle25.v = s
    prefs.set(NAV_STYLE_PREF, s)
    Haptics.select()
    launch25 { runCatching { api25 { hlPut("/me/layout", JSONObject().put("navStyle", s)) } } }
}

/* ---------- Ikonnavn i fanelinja ---------- */

/*
 * Feilen på Fold («cre», «for», «squ», «mag», «ell»): iOS og web lagrer layout.tabBar med SF Symbol-navn
 * («creditcard», «fork.knife», «square.grid.2x2», «magnifyingglass», «ellipsis»). parseLayout16 kuttet ikonet til 3 tegn,
 * og GlyphIcon tegnet ukjente ikoner som tekst. Skinnen på Fold viser ikon på alle faner, så det ble synlig der.
 * Nå oversettes navnene til appens ikoner, og ukjente ikoner får fanens standardikon, aldri tekst.
 */
private val ICON_NAMES25: Map<String, String> = mapOf(
    "house" to "⌂", "home" to "⌂", "house.fill" to "⌂", "building.2" to "⌂", "building" to "⌂",
    "creditcard" to "kr", "credit_card" to "kr", "wallet" to "kr", "banknote" to "kr", "account_balance_wallet" to "kr", "payments" to "kr",
    "fork.knife" to "◐", "fork_knife" to "◐", "restaurant" to "◐", "food" to "◐",
    "globe" to "◎", "language" to "◎", "public" to "◎", "square.grid.2x2" to "◎", "square.grid.3x3.fill" to "◎",
    "shippingbox" to "▣", "package" to "▣", "local_shipping" to "▣", "inventory_2" to "▣",
    "person.2" to "◉", "people" to "◉", "group" to "◉", "family" to "◉", "map" to "◉", "mappin" to "◉",
    "tram" to "⇄", "bus" to "⇄", "directions_bus" to "⇄", "train" to "⇄", "tram.fill" to "⇄",
    "cloud.sun" to "☀", "sun.max" to "☀", "wb_sunny" to "☀", "weather" to "☀",
    "newspaper" to "▤", "news" to "▤", "rss" to "▤",
    "chart.line.uptrend.xyaxis" to "↗", "show_chart" to "↗", "trending_up" to "↗", "chart" to "↗", "chart.bar" to "↗",
    "repeat" to "↻", "autorenew" to "↻", "arrow.clockwise" to "↻", "arrow.triangle.2.circlepath" to "↻",
    "music.note" to "♪", "music" to "♪", "play" to "♪", "play.circle" to "♪", "music_note" to "♪",
    "magnifyingglass" to "⌕", "search" to "⌕",
    "ellipsis" to "⋯", "more" to "⋯", "more_horiz" to "⋯", "ellipsis.circle" to "⋯",
    "star" to "★", "heart" to "♥", "favorite" to "♥", "envelope" to "✉", "mail" to "✉", "flag" to "⚑", "diamond" to "◆",
    "checklist" to "✓", "checkmark" to "✓", "bolt" to "⚡", "leaf" to "☘", "bag" to "◘", "cart" to "◘", "calendar" to "▦",
    "sparkles" to "✦", "sparkle" to "✦", "auto_awesome" to "✦", "chat" to "✦", "bubble.left" to "✦",
)

/** Ikonet fanen skal tegnes med: tegnet appen kjenner, oversatt navn, eller fanens standardikon. Aldri et avkuttet navn. */
fun tabGlyph25(id: String, raw: String?): String {
    val def = MAIN_TABS.firstOrNull { it.id == id }?.icon ?: "⋯"
    val r = raw?.trim().orEmpty()
    if (r.isEmpty()) return def
    if (r in TAB_ICONS) return r
    return iconNameGlyph25(r) ?: def
}

/** Ikonnavn (SF Symbol / Material) → tegnet appen tegner med, eller null. */
fun iconNameGlyph25(raw: String): String? {
    val k = raw.trim().lowercase()
    return ICON_NAMES25[k] ?: ICON_NAMES25[k.substringBefore(".fill")] ?: ICON_NAMES25[k.substringBefore('.')]
}

/** SF Symbol-navnet som lagres på serveren, så iOS og web forstår ikonet appen har valgt. */
fun tabIconName25(glyph: String): String = when (glyph) {
    "kr" -> "creditcard"; "◐" -> "fork.knife"; "◎" -> "globe"; "▣" -> "shippingbox"; "◉" -> "person.2"; "⇄" -> "tram"; "☀" -> "cloud.sun"
    "▤" -> "newspaper"; "↗" -> "chart.line.uptrend.xyaxis"; "⌂" -> "house"; "↻" -> "repeat"; "♪" -> "music.note"; "⌕" -> "magnifyingglass"
    "⋯" -> "ellipsis"; "★" -> "star"; "♥" -> "heart"; "✉" -> "envelope"; "⚑" -> "flag"; "◆" -> "diamond"; "✓" -> "checklist"
    "⚡" -> "bolt"; "☘" -> "leaf"; "◘" -> "bag"; "▦" -> "calendar"; "✦" -> "sparkles"
    "☑" -> "checklist"; "✿" -> "gift"; "✧" -> "sun.horizon"; "≣" -> "dot.radiowaves.up.forward"; "✝" -> "book"; "≈" -> "wave.3.right"; "⚙" -> "gearshape" // prompt 40
    else -> glyph
}

/** iOS kaller den automatiske fjerde fanen «Domener/Sporing». */
fun isAutoTab25(t: TabItem): Boolean = t.id == "domener" && t.label.contains('/')

/* ---------------- Tilstand ---------------- */

/** Én fane i en side-fanelinje: nøkkel, eget navn og eget ikon (tegn). */
data class SecTab32b(val k: String, val n: String? = null, val ic: String? = null)

class P32bState {
    /* Fanelinjer på Domener (dom), Abonnement (abo) og Familie (kart) */
    var secNav by mutableStateOf<Map<String, List<SecTab32b>>>(emptyMap())
    internal var secNavFor: String? = null
    /** Arket «Rediger fanelinjen» for en side (dom | abo | kart), ellers null. */
    var secEdit by mutableStateOf<String?>(null)
    /* Glimt i søkefeltet */
    var hsTimeout by mutableStateOf(8)
    var searchHist by mutableStateOf(true)
    /* Finans → Mer i redigeringsmodus (klipping under ＋/✓) */
    var fmEdit by mutableStateOf(false)
    /* Vær: Forhold-visning (temp | rain | wind), huskes i økten */
    var wxMode by mutableStateOf("temp")
    /* Huskeliste: Arkivert */
    var taskArch by mutableStateOf(false)
    var archived by mutableStateOf<List<TaskItem>?>(null)
    var archBusy by mutableStateOf(false)
    var archClearArm by mutableStateOf(false)
    /* Kalender: Beskriv med Glimt */
    var kAi by mutableStateOf("")
    var kAiBusy by mutableStateOf(false)
    var kAiNote by mutableStateOf("")
    var kAiErr by mutableStateOf("")
    /* Kalender: søket */
    var kFilter by mutableStateOf("alle")
    var kAsk by mutableStateOf<KalAsk32b?>(null)
    internal var kAskSeq = 0
    /* Prøveperioder: startdato per prøve (fremdriften), fra serverens created/start */
    var trialStart by mutableStateOf<Map<String, LocalDate>>(emptyMap())
}

/* ---------------- Fanelinjer på andre sider ---------------- */

/** Sidene med egen fanelinje: overskrift og alle faner (nøkkel, navn, ikon). */
val SEC32B: Map<String, Pair<String, List<Triple<String, String, String>>>> = mapOf(
    "dom" to ("Domener" to listOf(Triple("oversikt", "Oversikt", "◎"), Triple("publikum", "Publikum", "◍"), Triple("ytelse", "Ytelse", "⚡"), Triple("infra", "Infra", "▤"))),
    "abo" to ("Abonnement" to listOf(Triple("home", "Hjem", "⌂"), Triple("ins", "Innsikt", "◔"), Triple("hist", "Historikk", "↻"))),
    // Prompt 42: Vel fremme (tidligere Hjemlys) er en fane i Familie.
    // Prompt 50: Familie i nytt design – Folk · Steder · Helse · Sjekk inn (ui/Family50.kt).
    "kart" to ("Familie" to listOf(Triple("folk", "Folk", "◎"), Triple("steder", "Steder", "◌"), Triple("helse", "Helse", "♡"), Triple("sjekk", "Sjekk inn", "●"))),
)

private fun AppViewModel.secKey32b(sec: String) = "papir_nav_${sec}_" + (account?.id ?: "")

private fun secParse32b(sec: String, a: JSONArray?): List<SecTab32b>? {
    if (a == null) return null
    val all = SEC32B[sec]?.second ?: return null
    val out = ArrayList<SecTab32b>()
    for (i in 0 until a.length()) {
        val x = a.opt(i)
        val o = x as? JSONObject
        val k = o?.optStr("k") ?: o?.optStr("key") ?: (x as? String) ?: continue
        if (all.none { it.first == k } || out.any { it.k == k }) continue
        val ic = o?.optStr("ic")?.let { r -> if (glyphOk32b(r)) r else iconNameGlyph25(r) ?: r }
        out += SecTab32b(k, o?.optStr("n")?.take(18), ic)
    }
    return out.takeIf { it.isNotEmpty() }
}

/** Tegnet er et av appens fane-ikoner (ellers et SF Symbol-navn fra iOS/web). */
private fun glyphOk32b(s: String): Boolean = s.length <= 2

private fun secJson32b(l: List<SecTab32b>): JSONArray = JSONArray().apply {
    l.forEach { t -> put(JSONObject().put("k", t.k).apply { t.n?.let { put("n", it) }; t.ic?.let { put("ic", it) } }) }
}

/** Lagret oppsett (lokalt per bruker) lastes én gang per konto. */
private fun AppViewModel.ensureSecNav32b() {
    val s = p32b
    val acct = account?.id
    if (s.secNavFor == acct) return
    s.secNavFor = acct
    val m = HashMap<String, List<SecTab32b>>()
    SEC32B.keys.forEach { sec ->
        prefs.str(secKey32b(sec), "").takeIf { it.isNotBlank() }?.let { raw -> secParse32b(sec, runCatching { JSONArray(raw) }.getOrNull())?.let { m[sec] = it } }
    }
    s.secNav = m
}

/** Fanene som vises for en side: (nøkkel, navn, ikon) i valgt rekkefølge. */
fun AppViewModel.secTabs32b(sec: String): List<Triple<String, String, String>> {
    ensureSecNav32b()
    val all = SEC32B[sec]?.second ?: return emptyList()
    val saved = p32b.secNav[sec] ?: return all
    val l = saved.mapNotNull { t -> all.firstOrNull { it.first == t.k }?.let { d -> Triple(d.first, t.n?.takeIf { it.isNotBlank() } ?: d.second, t.ic?.takeIf { it.isNotBlank() } ?: d.third) } }
    return l.ifEmpty { all }
}

/** Lagrer en sides fanelinje (minst én fane). Navn og ikon som er lik standard lagres ikke. */
fun AppViewModel.saveSecNav32b(sec: String, items: List<Triple<String, String, String>>) {
    val all = SEC32B[sec]?.second ?: return
    val l = items.distinctBy { it.first }.filter { t -> all.any { it.first == t.first } }
    if (l.isEmpty()) return
    val tabs = l.map { (k, n, ic) ->
        val d = all.first { it.first == k }
        SecTab32b(k, n.trim().takeIf { it.isNotEmpty() && it != d.second }, ic.takeIf { it != d.third })
    }
    ensureSecNav32b()
    p32b.secNav = p32b.secNav + (sec to tabs)
    prefs.set(secKey32b(sec), secJson32b(tabs).toString())
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("secNav", JSONObject().put(sec, secJson32b(tabs)))) } } }
}

/** «Tilbakestill»: sletter nøkkelen. */
fun AppViewModel.resetSecNav32b(sec: String) {
    ensureSecNav32b()
    p32b.secNav = p32b.secNav - sec
    prefs.set(secKey32b(sec), "")
    launch32b { runCatching { api32b { hlPut("/me/layout", JSONObject().put("secNav", JSONObject().put(sec, JSONObject.NULL))) } } }
}

/** Fra GET /api/me/layout: secNav, hs_timeout_s og search_history. */
fun AppViewModel.applyLayout32b(raw: String) {
    val o0 = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val o = o0.optJSONObject("layout") ?: o0
    if (o.has("hs_timeout_s")) o.optInt("hs_timeout_s", 8).takeIf { it in HS_TIMEOUTS32B }?.let { p32b.hsTimeout = it; prefs.set("hs_timeout32b_" + (account?.id ?: ""), "$it") }
    if (o.has("search_history") && !o.isNull("search_history")) p32b.searchHist = o.optBoolean("search_history", true)
    val sn = o.optJSONObject("secNav") ?: return
    ensureSecNav32b()
    var m = p32b.secNav
    SEC32B.keys.forEach { sec ->
        if (!sn.has(sec)) return@forEach
        val l = if (sn.isNull(sec)) null else secParse32b(sec, sn.optJSONArray(sec))
        m = if (l == null) m - sec else m + (sec to l)
        prefs.set(secKey32b(sec), l?.let { secJson32b(it).toString() } ?: "")
    }
    p32b.secNav = m
}

class P40State {
    /* 2FA */
    var tfOpen by mutableStateOf(false)
    var tf by mutableStateOf<Tf40?>(null)
    var tfStep by mutableIntStateOf(0)
    var tfSetup by mutableStateOf<TfSetup40?>(null)
    var tfCodes by mutableStateOf<List<String>>(emptyList())
    var tfBusy by mutableStateOf(false)
    var tfErr by mutableStateOf<String?>(null)
    var tfNeedPw by mutableStateOf(false)
    /** Administrer: «setup» (bytt app), «disable» (slå av, krever passord) eller «codes» (nye reservekoder). */
    var tfManage by mutableStateOf<String?>(null)

    /* Finans: les på nytt, rediger alt, søk */
    var rr by mutableStateOf<Map<Int, Reread40>>(emptyMap())
    var editAll by mutableStateOf<Int?>(null)
    var editBusy by mutableStateOf(false)
    var ask by mutableStateOf<Ask40?>(null)
    var askFor by mutableStateOf<String?>(null)
    var askBusy by mutableStateOf(false)

    /* Nyheter: Glimt-siden */
    var newsGl by mutableStateOf(false)
    var ng by mutableStateOf<NewsGl40?>(null)
    var ngBusy by mutableStateOf(false)
    var ngErr by mutableStateOf<String?>(null)
    var ngSel by mutableStateOf(NgSel40())
    var ngPick by mutableStateOf(false)
    internal var ngKey: String? = null

    /* Julemodus (lokalt speil av /api/glimt/settings) */
    internal var julLoadedFor: String? = null

    /* Hjemlys */
    var hl by mutableStateOf<Hjemlys40?>(null)
    var hlMissing by mutableStateOf(false)
    var hlSheet by mutableStateOf(false)
    var hlBusy by mutableStateOf(false)
    var hlSuggest by mutableStateOf<HlSuggest40?>(null)
    /** 1a: ruten og valgt reisemåte; 1b: loggen; mottakers visning når noen er sen (userId). */
    var hlRoute by mutableStateOf<HlRoute40?>(null)
    var hlMode by mutableStateOf<String?>(null)
    var hlLog by mutableStateOf<List<HlLog40>>(emptyList())
    var hlLateFor by mutableStateOf<String?>(null)
    internal var hlAt = 0L
}

/* ======================= Fanelinja og Gjøremål ======================= */

/** Prompt 40: fanene for sidene fra Mer (samme nøkler som HNAV_ALL i fasiten). */
fun AppViewModel.mainTab40(id: String) {
    when (id) {
        "huske" -> openTasks()
        "kalender" -> openKal26()
        "bursdag" -> openBirthdays24()
        "brief" -> openBrief34()
        "rss" -> openNews()
        "bibel" -> if (bibleAllowed37()) { loadBible37(); p37.biblePage = true }
        "nordlys" -> p31.nordOpen = true
        "innst" -> openPaperPage("set")
    }
}

/** Gjøremål → «‹ Hjem»: lukker Gjøremål og går til Hjem uansett hvor siden ble åpnet fra (historikken nullstilles). */
fun AppViewModel.closeTasksHome40() {
    closeTasks()
    p37.detail = null; p37.listSheet = null; p37.glimtOpen = false
    if (screen != Screen.Homelab || paperPage != null) go(Screen.Homelab)
}

/** Hjem-knappen i fanelinja: verdiene som lagres og synkes. */
val NAV_HOME42: List<Triple<String, String, String>> = listOf(
    Triple("standard", "Standard", "«‹ Hjem» øverst, som i dag"),
    Triple("1a", "Egen Hjem-knapp", "Rund knapp til venstre for fanelinja"),
    Triple("1b", "Hjem først i linjen", "Hjem-ikon som første plass, skilt med en strek"),
    Triple("1c", "Hjem i midten", "Hevet rød knapp midt i fanelinja"),
    Triple("1d", "Modulvelger", "«kr Finans ▴» åpner Hjem og alle moduler"),
)

/** Godtar også designets «std». */
fun normNavHome42(s: String?): String? = when (s?.trim()?.lowercase()) {
    "standard", "std", "" -> "standard"
    "1a", "1b", "1c", "1d" -> s.trim().lowercase()
    else -> null
}

class P42State {
    /* Hjem-knappen */
    var navHome by mutableStateOf("standard")
    internal var navHomeFor: String? = "\u0000"
    var navHomeSheet by mutableStateOf(false)
    /** 1d: rutenettet med moduler er åpent. */
    var modPick by mutableStateOf(false)

    /* Familie → Vel fremme */
    var vfShowZone by mutableStateOf<String?>(null)

    /* Helse fra Home Assistant */
    var haDevices by mutableStateOf<List<HaDevice42>?>(null)
    var haPeople by mutableStateOf<List<HaPerson42>>(emptyList())
    var haMissing by mutableStateOf(false)
    var haError by mutableStateOf<String?>(null)
    var haBusy by mutableStateOf(false)
    var haOpen by mutableStateOf<String?>(null)
}

/* ======================= Hjem-knappen ======================= */

private fun AppViewModel.navHomeKey42() = "papir_navhome_" + (account?.id ?: "")

/** Gjeldende valg (lastes fra lagret verdi én gang per konto). */
fun AppViewModel.navHome42(): String {
    val s = p42
    val acct = account?.id
    if (s.navHomeFor != acct) {
        s.navHomeFor = acct
        s.navHome = normNavHome42(prefs.str(navHomeKey42(), "")) ?: "standard"
    }
    return s.navHome
}

fun AppViewModel.navHomeLabel42(): String = NAV_HOME42.firstOrNull { it.first == navHome42() }?.second ?: "Standard"

/** Fra GET /api/me/layout (homeButton, eller navHome fra eldre utkast). */
fun AppViewModel.applyNavHome42(raw: String) {
    val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
    val v = normNavHome42(o.optStr("homeButton") ?: o.optJSONObject("app")?.optStr("homeButton") ?: o.optStr("navHome")) ?: return
    navHome42()
    p42.navHome = v
    prefs.set(navHomeKey42(), v)
}

/** Endringen skjer med en gang (lett haptikk), lagres lokalt og synkes til de andre enhetene. */
fun AppViewModel.setNavHome42(v: String) {
    val k = normNavHome42(v) ?: return
    navHome42()
    if (p42.navHome == k) return
    p42.navHome = k
    p42.modPick = false
    prefs.set(navHomeKey42(), k)
    Haptics.select()
    launch42 { runCatching { api42 { hlPut("/me/layout", JSONObject().put("homeButton", k)) } } }
}

/** Hjem-knappen: alltid til Hjem, uansett modul og underside. */
fun AppViewModel.goHome42() {
    p42.modPick = false
    paperPage = null
    paperTab("hjem")
}

/* ---------------- Prompt 16: fanelinje, ikonfarger, steder for vær, avganger og Familie ---------------- */

/** En fane i Papir-hovedlinja (layout.tabBar.items): id fra kjente faner, eget navn og ikon (tegn). */
data class TabItem(val id: String, val label: String, val icon: String) {
    // Prompt 25: ikonet lagres med SF Symbol-navnet (som iOS og web bruker), ikke tegnet appen tegner med.
    fun toJson(): JSONObject = JSONObject().put("id", id).put("label", label).put("icon", tabIconName25(icon))
}

/** Fanene hovedlinja kan ha (ID-ene serveren godtar i layout.tabBar), med standardnavn og -ikon. «Mer» står alltid sist. */
val MAIN_TABS: List<TabItem> = listOf(
    TabItem("finans", "Finans", "kr"),
    TabItem("mat", "Mat", "◐"),
    TabItem("domener", "Domener", "◎"),
    TabItem("sporing", "Sporing", "▣"),
    TabItem("familie", "Familie", "◉"),
    TabItem("avganger", "Avganger", "⇄"),
    TabItem("vaer", "Vær", "☀"),
    TabItem("nyheter", "Nyheter", "▤"),
    TabItem("aksjer", "Aksjer", "↗"),
    TabItem("boliger", "Boliger", "⌂"),
    TabItem("abonnementer", "Abonnementer", "↻"),
    TabItem("media", "Media", "♪"),
    TabItem("chat", "Chat", "✦"),
    // Prompt 40 (claude-code-fanelinje-alle-sider.md): alt fra Mer kan legges i fanelinja (samme nøkler som HNAV_ALL i fasiten).
    TabItem("huske", "Gjøremål", "☑"),
    TabItem("kalender", "Kalender", "▦"),
    TabItem("bursdag", "Bursdager", "✿"),
    TabItem("brief", "Now Brief", "✧"),
    TabItem("rss", "Nyhetsleser", "≣"),
    TabItem("bibel", "Bibel", "✝"),
    TabItem("nordlys", "Nordlys", "≈"),
    TabItem("innst", "Innstillinger", "⚙"),
    TabItem("sok", "Søk", "⌕"),
    TabItem("mer", "Mer", "⋯"),
)

/** Standard når brukeren ikke har endret linja: fjerde fane er Domener, eller Sporing når pakker er på vei. */
val MAIN_TABS_DEFAULT = listOf("finans", "mat", "domener", "sok", "mer")

/** Ikonene brukeren kan velge mellom for en fane. */
val TAB_ICONS = listOf("kr", "◐", "◎", "▣", "◉", "⇄", "☀", "▤", "↗", "⌂", "↻", "♪", "⌕", "⋯", "★", "♥", "✉", "⚑", "◆")

/** Fargetema for ikonene i Innstillinger: hver rad har sin farge fra paletten. */
val ICON_THEMES: List<Pair<String, String>> = listOf(
    "standard" to "Standard", "varm" to "Varm", "kjolig" to "Kjølig", "mono" to "Mono", "fargerik" to "Fargerik",
)

fun iconPalette(theme: String): List<Long> = when (theme) {
    "varm" -> listOf(0xFFB23A2A, 0xFFD9822B, 0xFFC9A227, 0xFF9C4A2F, 0xFFE07A5F, 0xFF8A5A44)
    "kjolig" -> listOf(0xFF2F5D8A, 0xFF3FA7D6, 0xFF4F7C6F, 0xFF5B4A8A, 0xFF2E8B8B, 0xFF6C7A88)
    "mono" -> listOf(0xFF1B1A17, 0xFF3A3830, 0xFF55524A, 0xFF6B665C, 0xFF8F897C, 0xFF2A2821)
    "fargerik" -> listOf(0xFFE05A7A, 0xFF4A8FE0, 0xFF3FBF8A, 0xFFE0B33A, 0xFF9A7BE0, 0xFFE8833A)
    else -> listOf(0xFFB23A2A, 0xFF2F7A4F, 0xFF2F5D8A, 0xFFC9A227, 0xFF5B4A8A, 0xFF8A5A44)
}

data class Layout16(val tabBar: List<TabItem>, val iconTheme: String?)

fun parseLayout16(s: String): Layout16 {
    val o = JSONObject(s)
    // tabBar er null til brukeren endrer linja; da brukes standarden (med automatisk fjerde fane).
    val items = o.optJSONObject("tabBar")?.optJSONArray("items") ?: o.optJSONArray("tabBar")
    val list = mutableListOf<TabItem>()
    if (items != null) for (i in 0 until items.length()) {
        val t = items.optJSONObject(i) ?: continue
        val id = t.optStr("id") ?: continue
        val def = MAIN_TABS.firstOrNull { it.id == id } ?: continue
        // Prompt 25: ikonet kan være et navn fra iOS/web («creditcard», «fork.knife»). Før ble det kuttet til 3 tegn («cre»)
        // og tegnet som tekst. Nå oversettes det til appens ikon, eller fanens standardikon.
        list += TabItem(id, (t.optStr("label") ?: def.label).take(18), tabGlyph25(id, t.optStr("icon")))
    }
    return Layout16(list.distinctBy { it.id }.take(6), o.optStr("iconTheme")?.takeIf { k -> ICON_THEMES.any { it.first == k } })
}
