package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 24: Innstillinger (Mobil Papir App → Innstillinger). Søk øverst («Søk i innstillinger») med treff i alle
 * innstillinger og undersider, ✦ AI som gjør om søket til et spørsmål, gruppen PROFIL, og Integrasjoner med alle
 * oppsett (status, redigering rett under raden, test og fjern) via /api/integrations.
 */

/* ---------------- Indeksen ---------------- */

private fun setIndex24(vm: AppViewModel): List<SetItem24> = buildList {
    vm.b24.profiles.forEach { add(SetItem24("profile:${it.key}", it.name, "Profil", it.sub, null)) }
    add(SetItem24("accounts", "Kontoer og brukere", "Konto", "Bytt konto, legg til og logg ut", "accounts", "bruker brukere"))
    add(SetItem24("security", "Sikkerhet", "Konto", "Totrinnsbekreftelse, passord, fingeravtrykk og aktive økter", "security", "2fa passord face logg"))
    add(SetItem24("tokens", "API-tokens", "Konto", "Snarveier og integrasjoner", "tokens", "token nøkkel"))
    add(SetItem24("ai", "AI og tolkning", "Finans", "Gemini · Groq · Roboflow · Ollama · tidsgrenser", "ai", "gemini groq ollama roboflow ocr"))
    add(SetItem24("cats", "Kategorier og budsjett", "Finans", "Farger og typer", "cats", "budsjett kategori"))
    add(SetItem24("rules", "Regler", "Finans", "Automatisk kategorisering", "rules", "regel"))
    add(SetItem24("import", "Bankimport", "Finans", "DNB · CSV · ✦ AI", null, "bank csv excel"))
    add(SetItem24("stocks", "Aksjer · Trading 212", "Finans", "Nøkkel, miljø og synk", "stocks", "aksje trading"))
    add(SetItem24("fin", "Fanelinje og Mer i Finans", "Finans", "Fanene i Finans", "fin", "fane faner"))
    add(SetItem24("sub", "Subscription OS", "Finans", "Abonnementer og AI-sparing", null, "abonnement"))
    add(SetItem24("appname", "Navn på appen", vm.appName, vm.appName, null, "navn"))
    add(SetItem24("appicon", "App-ikon", vm.appName, "Bytt ikon på appen", null, "ikon logo"))
    add(SetItem24("navstyle", "Fanelinje-stil", vm.appName, "Tekst, bare ikoner eller ikoner + navn på valgt", null, "fane faner ikon ikoner stil navbar"))
    add(SetItem24("tabedit", "Fanelinje i Hjem", vm.appName, "Fjern, flytt, gi nytt navn og ikon", null, "fane faner"))
    add(SetItem24("modules", "Moduler", vm.appName, "Familie, Huskeliste, Avganger, Vær", "modules", "widget modul"))
    add(SetItem24("news", "Nyhetsleser", vm.appName, "Kilder og AI", null, "nyheter rss"))
    add(SetItem24("look", "Utseende og fanelinje", "App", "Tema (lys og mørk), bakgrunn og ikonfarger", "look", "tema mørk lys farge bakgrunn"))
    add(SetItem24("notify", "Varsler og haptikk", "App", "Lyd, stille timer, vibrasjon og test", "notify", "varsel lyd vibr push"))
    add(SetItem24("kal", "Kalendere", "App", "Google Kalender, Home Assistant, Skole-iCal og Canvas", "kal", "kalender google ha skole canvas ical timeplan bursdag"))
    add(SetItem24("integ", "Integrasjoner", "App", if (vm.userIsAdmin) "Dine og serverens: Plex, Bring, IMAP, Home Assistant og flere" else "Dine egne: kalender, Plex, Trading 212, Bring, IMAP og flere", "integ", "integrasjon"))
    add(SetItem24("healthpos", "Helse og posisjon", "App", "Health Connect, skritt, puls, søvn og posisjonsdeling", "healthpos", "helse posisjon skritt kart"))
    add(SetItem24("scan", "Skanning", "App", "Kamera, beskjæring og opplasting", "scan", "kamera skann"))
    add(SetItem24("server", "Server og synk", "App", "Lokal og ekstern adresse", "server", "server adresse"))
    add(SetItem24("backup", "Backup og data", "App", "Nedlasting og lagring", "backup", "backup eksport"))
    (vm.b24.integ ?: INTEG24_FALLBACK).filter { vm.userIsAdmin || it.personal }.forEach { i ->
        add(SetItem24("integ:${i.id}", i.name, "Integrasjoner", i.fields.joinToString(", ") { it.label }, "integ", i.id))
    }
}

/** Synonymer for ✦ AI uten serverens AI (ord → innstillinger), som i designet. */
private val SYN24: Map<String, List<String>> = mapOf(
    "ikon" to listOf("appicon"), "logo" to listOf("appicon"), "navn" to listOf("appname"), "mørk" to listOf("look"), "lys" to listOf("look"), "tema" to listOf("look"),
    "farge" to listOf("look"), "passord" to listOf("security"), "logg" to listOf("security"), "face" to listOf("security"), "finger" to listOf("security"),
    "varsel" to listOf("notify"), "lyd" to listOf("notify"), "vibr" to listOf("notify"), "token" to listOf("tokens"), "nøkkel" to listOf("tokens", "integ:ai"),
    "pakk" to listOf("integ:mybring", "integ:postnord", "integ:parcelsapp"), "post" to listOf("integ:mybring", "integ:postnord"), "bring" to listOf("integ:mybring"),
    "spor" to listOf("integ:mybring", "integ:parcelsapp"), "buss" to listOf("integ:entur"), "trikk" to listOf("integ:entur"), "ruter" to listOf("integ:entur"),
    "avgang" to listOf("integ:entur"), "kalend" to listOf("kal", "integ:google"), "bursdag" to listOf("kal", "integ:google"), "google" to listOf("kal", "integ:google"), "canvas" to listOf("kal"), "skole" to listOf("kal"),
    "gemini" to listOf("ai", "integ:ai"), "ai" to listOf("ai", "integ:ai"), "aksje" to listOf("stocks", "integ:t212"), "bank" to listOf("import", "integ:bank"),
    "budsjett" to listOf("cats"), "kategori" to listOf("cats"), "regel" to listOf("rules"), "home" to listOf("integ:ha"), "ha" to listOf("integ:ha"),
    "domene" to listOf("integ:cloudflare"), "cloudflare" to listOf("integ:cloudflare"), "vær" to listOf("integ:met"), "yr" to listOf("integ:met"),
    "kart" to listOf("integ:map", "healthpos"), "posisjon" to listOf("healthpos"), "helse" to listOf("healthpos"), "skritt" to listOf("healthpos"),
    "kvitter" to listOf("integ:imap"), "epost" to listOf("integ:imap"), "e-post" to listOf("integ:imap"), "mail" to listOf("integ:imap"), "finn" to listOf("integ:finn"),
    "profil" to listOf("profile:standard", "profile:finans_boliger", "profile:boliger"), "bolig" to listOf("profile:finans_boliger", "profile:boliger"),
    "fane" to listOf("tabedit", "fin"), "widget" to listOf("modules"), "modul" to listOf("modules"), "bruker" to listOf("accounts"),
    "bilde" to listOf("integ:photos", "look"), "unsplash" to listOf("integ:photos"), "pexels" to listOf("integ:photos"),
)
private val STOP24 = Regex("^(hvor|hvordan|kan|jeg|du|meg|min|mitt|mine|en|et|den|det|på|i|til|for|å|og|er|med|endre|bytte|bytter|skru|slå|av|finner|finne|legge|sette|hva|vil)$")

private fun score24(items: List<SetItem24>, q0: String, ai: Boolean): List<SetItem24> {
    val q = q0.trim().lowercase()
    if (q.isEmpty()) return emptyList()
    val words = q.split(Regex("[^a-zæøå0-9-]+")).filter { it.length > 1 && !STOP24.matches(it) }
    return items.map { a ->
        val txt = "${a.path} ${a.title} ${a.sub} ${a.extra}".lowercase()
        var x = 0
        if (txt.contains(q)) x += 10
        words.forEach { w -> if (txt.contains(w)) x += 3 }
        if (ai) words.forEach { w -> SYN24.forEach { (k, l) -> if (w.startsWith(k) || (k.startsWith(w) && w.length > 2)) if (a.id in l) x += 6 } }
        a to x
    }.filter { it.second > 0 }.sortedByDescending { it.second }.take(if (ai) 6 else 12).map { it.first }
}

private fun localAnswer24(items: List<SetItem24>, q: String): Pair<String?, List<String>> {
    val hits = score24(items, q, true)
    val h = hits.firstOrNull() ?: return "Fant ingen innstilling som passer. Prøv med andre ord, f.eks. «bytte ikon» eller «Bring-nøkkel»." to emptyList()
    return "Du finner «${h.title}» under Innstillinger → ${h.path}. Trykk på raden for å åpne." to hits.map { it.id }
}

private fun iconFor24(id: String): ImageVector = when {
    id.startsWith("profile:") -> Icons.Filled.People
    id.startsWith("integ:") -> Icons.Filled.Extension
    else -> when (id) {
        "accounts" -> Icons.Filled.People; "security" -> Icons.Filled.Lock; "tokens" -> Icons.Filled.Key; "ai" -> Icons.Filled.AutoAwesome
        "cats" -> Icons.Filled.Category; "rules" -> Icons.Filled.Tune; "import" -> Icons.Filled.AccountBalance; "stocks" -> Icons.AutoMirrored.Filled.ShowChart
        "fin", "tabedit" -> Icons.Filled.ViewWeek; "sub" -> Icons.Filled.Autorenew; "appname" -> Icons.Filled.Edit; "appicon" -> Icons.Filled.Image
        "modules" -> Icons.Filled.Dashboard; "news" -> Icons.Filled.Newspaper; "look" -> Icons.Filled.Palette; "notify" -> Icons.Filled.Notifications
        "integ" -> Icons.Filled.Home; "healthpos" -> Icons.Filled.MonitorHeart; "scan" -> Icons.Filled.DocumentScanner; "server" -> Icons.Filled.Dns
        "backup" -> Icons.Filled.Backup; else -> Icons.Filled.Settings
    }
}

/**
 * Prompt 25: «Ta meg dit →» og trykk på et søketreff. Åpner riktig underside, scroller til raden og fremhever den i ca. 3 s
 * (dyplenke settings/<side>#<rad-id>). Rader på hovedsiden (profiler, navn, ikon, fanelinje …) fremheves der de står.
 */
private fun open24(vm: AppViewModel, it: SetItem24) {
    vm.b24.sq = ""; vm.b24.aiAnswer = null; vm.b24.aiIds = null
    // Plassen til gruppekortet på hovedsiden: søk 0, profilkort 1, PROFIL 2–3, KONTO 4–5, FINANS 6–7, appnavn 8–9, APP 10–11.
    fun main(key: String, index: Int) { vm.settingsPage = null; vm.highlight25(key, index) }
    when {
        it.id.startsWith("profile:") -> main(it.id, 3)
        // Prompt 26: hver integrasjon har egen side (Kalendere for skole, Google og HA).
        it.id.startsWith("integ:") -> vm.openInteg26(it.id.removePrefix("integ:"))
        it.id == "kal" -> vm.openKalSettings26(null)
        it.id == "import" -> main(rowKey25("Bankimport"), 7)
        it.id == "sub" -> main(rowKey25("Subscription OS"), 7)
        it.id == "appname" -> main(rowKey25("Navn på appen"), 9)
        it.id == "appicon" -> main(rowKey25("App-ikon"), 9)
        it.id == "navstyle" -> main(rowKey25("Fanelinje-stil"), 9)
        it.id == "tabedit" -> main(rowKey25("Fanelinje i Hjem"), 9)
        it.id == "news" -> main(rowKey25("Nyhetsleser"), 9)
        it.page != null -> { vm.settingsPage = it.page; vm.highlight25("page:${it.page}", 0) }
    }
}

/* ---------------- Søk øverst ---------------- */

/**
 * Søkefeltet og ✦ AI øverst i Innstillinger. Med tekst i feltet vises bare treffene (true = resten av siden skal ikke vises).
 */
internal fun LazyListScope.settingsSearch24(vm: AppViewModel): Boolean {
    val s = vm.b24
    item { SearchBar24(vm) }
    if (s.sq.isBlank()) return false
    item { SearchResults24(vm) }
    return true
}

@Composable
private fun SearchBar24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    val items = setIndex24(vm)
    LaunchedEffect(Unit) { if (s.integ == null) vm.b24LoadIntegrations() }
    // ✦ AI: spørsmålet sendes når man slutter å skrive (eller trykker Søk).
    LaunchedEffect(s.sq, s.sqAi) {
        s.aiAnswer = null; s.aiIds = null
        if (!s.sqAi || s.sq.isBlank()) return@LaunchedEffect
        delay(700)
        vm.b24AiSearch(s.sq.trim(), items) { q -> localAnswer24(items, q) }
    }
    Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.weight(1f).height(46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f))
                .clip(CircleShape).background(p.card).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Filled.Search, null, tint = p.mut, modifier = Modifier.size(18.dp))
            BasicTextField(
                s.sq, { s.sq = it }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.ink),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { if (s.sqAi && s.sq.isNotBlank()) vm.b24AiSearch(s.sq.trim(), items) { q -> localAnswer24(items, q) } }),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (s.sq.isEmpty()) Text(if (s.sqAi) "Spør, f.eks. «hvor bytter jeg ikon?»" else "Søk i innstillinger", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        inner()
                    }
                },
            )
            if (s.sq.isNotEmpty()) Box(
                Modifier.size(26.dp).clip(CircleShape).background(p.line).clickable(onClickLabel = "Tøm") { s.sq = "" },
                contentAlignment = Alignment.Center,
            ) { Text("×", color = p.ink, fontSize = 13.sp) }
        }
        Box(
            Modifier.height(46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f)).clip(CircleShape)
                .background(if (s.sqAi) p.lab else p.card).clickable(role = Role.Switch, onClickLabel = "AI-søk") { s.sqAi = !s.sqAi }.padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text("✦ AI", color = if (s.sqAi) Color.White else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) }
    }
}

@Composable
private fun SearchResults24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    val items = setIndex24(vm)
    val ai = s.sqAi
    val hits = if (ai && s.aiIds != null) s.aiIds!!.mapNotNull { id -> items.firstOrNull { it.id == id } } else score24(items, s.sq, ai)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (ai) {
            val ans = s.aiAnswer ?: if (s.aiBusy) "Tenker …" else null
            ans?.let {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card).padding(14.dp, 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("✦", color = p.lab, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(it, color = p.ink, fontSize = 13.5.sp, lineHeight = 19.6.sp)
                        // Prompt 25: «Ta meg dit →» åpner undersiden, scroller til innstillingen og fremhever den.
                        val first = hits.firstOrNull()
                        if (first != null && s.aiAnswer != null && !s.aiBusy) Box(
                            Modifier.height(36.dp).clip(CircleShape).background(p.ink)
                                .clickable(role = Role.Button, onClickLabel = "Ta meg dit") { Haptics.select(); open24(vm, first) }.padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("Ta meg dit →", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                    }
                }
            }
        }
        if (hits.isNotEmpty()) {
            PLabel((if (ai) "✦ AI-forslag · " else "Treff · ") + hits.size, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            PCard {
                hits.forEachIndexed { i, it ->
                    SetRow(vm, i, iconFor24(it.id), it.title, it.path + if (it.sub.isNotBlank()) " · ${it.sub}" else "", "›", top = i > 0) { open24(vm, it) }
                }
            }
        } else if (!ai) Text("Ingen treff. Prøv ✦ AI, f.eks. «hvor legger jeg inn Bring-nøkkelen?»", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp))
    }
}

/* ---------------- PROFIL ---------------- */

internal fun LazyListScope.profileGroup24(vm: AppViewModel) {
    item { PLabel("Profil", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        val p = PaperPal.current
        PCard {
            vm.b24.profiles.forEachIndexed { i, pr ->
                val on = vm.b24.profile == pr.key
                Column {
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 60.dp).height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().hl25(vm, "profile:${pr.key}").clickable { if (!on) vm.b24PickProfile(pr.key) }.padding(14.dp, 11.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        IconTile(vm, i, Icons.Filled.People)
                        Column(Modifier.weight(1f)) {
                            Text(pr.name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                            Text(pr.sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Text(if (on) "✓ Valgt" else "Velg", color = if (on) p.pos else p.mut, fontSize = 13.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
                    }
                }
            }
            if (vm.b24.profile == "custom") Text("Egendefinert: du har endret fanene etter at profilen ble valgt.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(14.dp, 0.dp, 14.dp, 12.dp))
        }
    }
}

/* ---------------- Integrasjoner ---------------- */

@Composable
internal fun IntegrationsPage24(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(Unit) { vm.b24LoadIntegrations() }
    // ISO2: «Dine integrasjoner» (personlige, alle roller) først, «Server (administrator)» under og bare for admin.
    val all = s.integ ?: emptyList()
    val mine = all.filter { it.personal }
    val server = if (vm.userIsAdmin) all.filter { !it.personal } else emptyList()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        s.integError?.let { Text(it, color = if (s.integLegacy) p.mut else p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) }
        if (s.integ == null) Text("Henter integrasjonene …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
        if (mine.isNotEmpty()) {
            Text("Dine integrasjoner", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(start = 4.dp, top = 8.dp))
            Text("Bare du ser og bruker disse. Kalender, media, Trading 212, sporing, e-post, bank og Finn.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
            mine.forEach { i -> IntegCard24(vm, i) }
        }
        if (server.isNotEmpty()) {
            Text("Server (administrator)", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(start = 4.dp, top = 18.dp))
            Text("Felles oppsett for alle brukere på serveren.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp))
            server.forEach { i -> IntegCard24(vm, i) }
        }
        if (s.integ != null) Text("Hemmelige verdier lagres kryptert på serveren og vises aldri i appen.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
        // Synk med Home Assistant (Huskeliste) som før. Serveroppsett: bare for admin.
        if (vm.userIsAdmin) IntegrationsPage23(vm)
    }
}

@Composable
private fun IntegCard24(vm: AppViewModel, i: Integ24) {
    val p = PaperPal.current
    val s = vm.b24
    val missing = i.fields.filter { !it.saved && it.value.isNullOrBlank() }
    PLabel(i.name, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard(Modifier.hl25(vm, "integ:${i.id}")) {
        val (stTxt, stCol) = when (i.status) { "ok" -> "Tilkoblet" to p.pos; "error" -> "Feil" to p.lab; else -> "Ikke koblet" to p.mut }
        IRow24(vm, 0, Icons.Filled.Extension, "Status", if (missing.isEmpty()) "Alle felt er fylt ut" else "Mangler " + missing.joinToString(", ") { it.label.lowercase() }, stTxt, stCol, top = false, onClick = null)
        i.fields.forEach { f ->
            val editing = s.integEdit == (i.id to f.key)
            val shown = when {
                f.type == "secret" && f.saved -> "•••• lagret"
                !f.value.isNullOrBlank() -> f.value
                f.saved -> "•••• lagret"
                else -> "Ikke satt"
            }
            IRow24(vm, -1, null, f.label, f.help, "$shown ›", if (f.saved || !f.value.isNullOrBlank()) p.ink else p.lab, top = true) {
                s.integEdit = if (editing) null else i.id to f.key
            }
            if (editing) IntegEditor24(vm, i, f)
        }
        if (i.canTest) IRow24(vm, -1, null, if (s.integBusy == i.id) "Tester …" else "Test tilkobling", null, "", p.lab, top = true, titleColor = p.lab) {
            if (s.integBusy == null) vm.b24TestIntegration(i)
        }
    }
}

@Composable
internal fun IntegEditor24(vm: AppViewModel, i: Integ24, f: IntegField24) {
    val p = PaperPal.current
    val s = vm.b24
    var v by remember(i.id, f.key) { mutableStateOf(if (f.type == "secret") "" else f.value ?: "") }
    val busy = s.integBusy == "${i.id}.${f.key}"
    Column(Modifier.fillMaxWidth().background(p.card).padding(14.dp, 4.dp, 14.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BasicTextField(
            v, { v = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(color = p.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.mono), cursorBrush = SolidColor(p.ink),
            visualTransformation = if (f.type == "secret") PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = when (f.type) { "secret" -> KeyboardType.Password; "url" -> KeyboardType.Uri; else -> KeyboardType.Text }, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (v.isNotBlank()) vm.b24SaveIntegField(i.id, f.key, v.trim()) }),
            decorationBox = { inner ->
                Box(
                    Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (v.isEmpty()) Text(if (f.type == "secret" && f.saved) "Ny verdi (lagret verdi vises ikke)" else f.label, color = p.mut, fontSize = 14.5.sp, fontFamily = PaperFonts.mono, maxLines = 1)
                    inner()
                }
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).border(1.dp, p.line, RoundedCornerShape(22.dp)).clickable(role = Role.Button) { s.integEdit = null },
                contentAlignment = Alignment.Center,
            ) { Text("Avbryt", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp)).background(p.ink).clickable(role = Role.Button) { if (v.isNotBlank() && !busy) vm.b24SaveIntegField(i.id, f.key, v.trim()) },
                contentAlignment = Alignment.Center,
            ) { Text(if (busy) "Lagrer …" else "Lagre", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
        }
        if (f.saved || !f.value.isNullOrBlank()) Box(
            Modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(18.dp)).clickable(role = Role.Button) { if (!busy) vm.b24ClearIntegField(i.id, f.key) },
            contentAlignment = Alignment.Center,
        ) { Text("Fjern verdi", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
    }
}

/** Rad som SetRow, men med farge på verdien (grønn «Tilkoblet», rød «Ikke satt») og valgfritt ikon. */
@Composable
internal fun IRow24(
    vm: AppViewModel, i: Int, icon: ImageVector?, title: String, sub: String?, value: String, valueColor: Color, top: Boolean,
    titleColor: Color = PaperPal.current.ink, onClick: (() -> Unit)?,
) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = if (icon != null) 60.dp else 14.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (icon != null) IconTile(vm, i, icon)
            Column(Modifier.weight(1f)) {
                Text(title, color = titleColor, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (value.isNotEmpty()) Text(value, color = valueColor, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 170.dp))
        }
    }
}
