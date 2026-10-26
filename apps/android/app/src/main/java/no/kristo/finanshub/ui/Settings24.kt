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
    // Prompt 39: profilene ligger på undersiden «Appprofil» (APP-gruppen).
    // Prompt 67: stiene følger den nye menyen (Generelt · Husstand · Glimt og AI · Tilkoblinger · Moduler · Server).
    add(SetItem24("glimt67", "Glimt", "Glimt og AI", "Figur, brief, stemme, Send til Chat etter, Glimt husker og Glimt lærer", "glimt67", "glimt personlighet stemme figur brief send til chat søkefelt"))
    add(SetItem24("g67mem", "Glimt husker", "Glimt og AI → Glimt", "Det du har lært Glimt, forslag, motstrid og ikke brukt på lenge", "g67mem", "glimt husker minne alias forslag motstrid ubrukte fakta nattlig oppsummering"))
    add(SetItem24("g67ent", "Entitetsregister", "Glimt og AI → Glimt", "Personer, steder, butikker og abonnementer med aliaser", "g67ent", "entitetsregister entiteter alias personer steder hytta jobben"))
    add(SetItem24("g67rec", "Glimt lærer", "Glimt og AI → Glimt", "Oppskrifter fra vellykkede kjøringer og rettelser", "g67rec", "glimt lærer oppskrifter skills hurtigvei rettelser tommel"))
    add(SetItem24("g67sch", "Faste oppgaver", "Glimt og AI → Glimt", "Planlagte oppgaver og varsler · Lag fra tekst · Kjør nå", "g67sch", "faste oppgaver planlagte påminnelse strømpris brief lag fra tekst"))
    add(SetItem24("g67q", "Kvalitet", "Glimt og AI → Glimt", if (vm.userIsAdmin) "Ukerapport og nattlige eval-kjøringer" else "Ukerapporten din", "g67q", "kvalitet ukerapport eval regresjon"))
    add(SetItem24("app67", "App", "Generelt", "Appprofil, widgets, skanning, server, data og oppdatering", "app67", "app widgets oppdater appen"))
    add(SetItem24("fin67", "Finans", "Moduler", "Kategorier, regler, bankimport, aksjer, fanelinje og abonnementer", "fin67", "finans økonomi"))
    add(SetItem24("profil", "Appprofil", "Generelt → App", "Standard, Finans + Boliger eller Boliger-profil", "profil", "profil boliger oppsett"))
    vm.b24.profiles.forEach { add(SetItem24("profile:${it.key}", it.name, "App → Appprofil", it.sub, null, "profil oppsett")) }
    add(SetItem24("accounts", "Konto", "Generelt", "Profil, kontoer, økter og logg ut", "accounts", "bruker brukere kontoer"))
    add(SetItem24("security", "Sikkerhet", "Generelt", "Totrinnsbekreftelse, passord, fingeravtrykk og aktive økter", "security", "2fa passord face logg"))
    if (vm.userIsAdmin) add(SetItem24("sysbackup", "Backup", "Server", "Backup av hele systemet: automatisk, hva som tas med, sky og gjenoppretting", "sysbackup", "backup sikkerhetskopi gjenopprett restore"))
    add(SetItem24("tokens", "API-tokens", "Generelt", "Snarveier og integrasjoner", "tokens", "token nøkkel"))
    // Prompt 44: Logger (Docker), Gjøremål-synk, Logg inn som / Overfør eier, Tidligere versjoner.
    if (vm.userIsAdmin) add(SetItem24("logger44", "Logger", "Server", "Docker-logger, feil og feilsøking", null, "logg logger docker feil feilsøking container"))
    add(SetItem24("huske", "Gjøremål", "Tilkoblinger → Kalender og gjøremål", "Synk med Home Assistant", "kal", "gjøremål synk home assistant todo"))
    add(SetItem24("nyheter", "Nyheter", "Moduler", "Kilder, kategorier, For deg og Glimt-sammendrag", "nyheter", "nyheter rss kilder kategori for deg sammendrag favicon")) // prompt 46
    if (vm.userIsAdmin) add(SetItem24("as44", "Logg inn som", "Generelt → Konto", "Rediger oppsettet til et familiemedlem · overfør eierskap", "accounts", "logg inn som impersonering eier overfør familie oppsett"))
    if (vm.userIsAdmin) add(SetItem24("rollback44", "Tidligere versjoner", "System", "Rull tilbake til en tidligere versjon", null, "rull tilbake rollback versjon nedgrader"))
    add(SetItem24("ai", "AI", "Glimt og AI", "AI og modeller · kvitteringer · chat · tale · tidsgrenser", "ai", "gemini groq ollama roboflow ocr tolkning modeller"))
    add(SetItem24("cats", "Kategorier og budsjett", "Moduler → Finans", "Farger og typer", "cats", "budsjett kategori"))
    add(SetItem24("rules", "Regler", "Moduler → Finans", "Automatisk kategorisering", "rules", "regel"))
    add(SetItem24("import", "Bankimport", "Moduler → Finans", "DNB · CSV · ✦ AI", null, "bank csv excel"))
    add(SetItem24("stocks", "Aksjer · Trading 212", "Moduler → Finans", "Nøkkel, miljø og synk", "stocks", "aksje trading"))
    add(SetItem24("fin", "Fanelinje og Mer i Finans", "Moduler → Finans", "Fanene i Finans", "fin", "fane faner"))
    add(SetItem24("sub", "Subscription OS", "Moduler → Finans", "Abonnementer og AI-sparing", null, "abonnement"))
    add(SetItem24("appname", "Navn på appen", vm.appName, vm.appName, null, "navn"))
    add(SetItem24("appicon", "App-ikon", vm.appName, "Bytt ikon på appen", null, "ikon logo"))
    add(SetItem24("navstyle", "Fanelinje-stil", vm.appName, "Tekst, bare ikoner eller ikoner + navn på valgt", null, "fane faner ikon ikoner stil navbar"))
    add(SetItem24("tabedit", "Fanelinje i Hjem", vm.appName, "Fjern, flytt, gi nytt navn og ikon", null, "fane faner"))
    add(SetItem24("modules", "Moduler", "Moduler", "Familie, Gjøremål, Avganger, Vær", "modules", "widget modul"))
    add(SetItem24("news", "Nyhetsleser", "Moduler → Moduler", "Kilder og AI", null, "nyheter rss"))
    add(SetItem24("look", "Utseende", "Generelt", "Navn, ikon, tema, farger, bakgrunn og fanelinje", "tilpass", "tema mørk lys farge farger ikon navn fanelinje bakgrunn tilpass utseende"))
    add(SetItem24("notify", "Varsler", "Generelt", "Lyd, stille timer, vibrasjon og test", "notify", "varsel lyd vibr push"))
    add(SetItem24("kal", "Kalender og gjøremål", "Tilkoblinger", "Google Kalender, Home Assistant, Skole-iCal og Canvas", "kal", "kalender google ha skole canvas ical timeplan bursdag"))
    add(SetItem24("integ", "Integrasjoner", "Tilkoblinger", if (vm.userIsAdmin) "Dine og serverens: Plex, Bring, IMAP, Home Assistant og flere" else "Dine egne: kalender, Plex, Trading 212, Bring, IMAP og flere", "integ", "integrasjon"))
    add(SetItem24("healthpos", "Helse og posisjon", "Husstand", "Health Connect, skritt, puls, søvn og posisjonsdeling", "healthpos", "helse posisjon skritt kart"))
    add(SetItem24("scan", "Skanning", "Generelt → App", "Kamera, beskjæring og opplasting", "scan", "kamera skann"))
    add(SetItem24("server", "Server og synk", "Generelt → App", "Lokal og ekstern adresse", "server", "server adresse"))
    add(SetItem24("backup", "Backup og data", "Generelt → App", "Nedlasting og lagring", "backup", "backup eksport"))
    // Prompt 32: «oppdatering», «versjon» og «update» treffer Nordlys OS (Oppdatering-raden er fjernet).
    add(SetItem24("nordlys", "Nordlys OS", "Server → System", "Oppdatering, versjon og hva er nytt", null, "oppdatering oppdater versjon update system programvare"))
    // Prompt 34: mål-id-er for konkrete kontroller (Oppdater nå, Tema, Haptikk …): treffet går til siden og markerer kontrollen.
    ANCHORS34.filter { vm.userIsAdmin || !it.admin }.forEach { a -> add(SetItem24(a.id, a.title, a.path, "Markeres på siden", null, a.words)) }
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
    "bilde" to listOf("integ:photos", "look"), "oppdat" to listOf("upd", "nordlys"), "versjon" to listOf("chk", "nordlys"), "update" to listOf("upd", "nordlys"),
    "haptikk" to listOf("haptic"), "vibrer" to listOf("haptic"), "stille" to listOf("quiet"), "2fa" to listOf("2fa"), "totrinn" to listOf("2fa"),
    "modell" to listOf("ai-mod"), "ollama" to listOf("ai-mod"), "backup" to listOf("bk-now", "bk-auto"), "bakgrunn" to listOf("bg"), "unsplash" to listOf("integ:photos"), "pexels" to listOf("integ:photos"),
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
        words.forEach { w -> if (txt.contains(w)) x += 3 else if (w.length >= 6 && txt.contains(w.dropLast(2))) x += 2 } // prompt 34: bøyning («oppdaterer»)
        if (words.any { w -> a.title.lowercase().contains(w) || (w.length >= 6 && a.title.lowercase().contains(w.dropLast(2))) }) x += 1
        if (ai) words.forEach { w -> SYN24.forEach { (k, l) -> if (w.startsWith(k) || (k.startsWith(w) && w.length > 2)) if (a.id in l) x += 6 } }
        a to x
    }.filter { it.second > 0 }.sortedByDescending { it.second }.take(if (ai) 6 else 12).map { it.first }
}

private fun localAnswer24(items: List<SetItem24>, q: String): Pair<String?, List<String>> {
    val hits = score24(items, q, true)
    val h = hits.firstOrNull() ?: return "Fant ingen innstilling som passer. Prøv med andre ord, f.eks. «bytte ikon» eller «Bring-nøkkel»." to emptyList()
    // Prompt 34: mål med egen kontroll: «Gå til System og trykk «Oppdater nå» … Jeg tar deg dit og viser knappen …».
    if (ANCHORS34.any { it.id == h.id }) return (if (h.id == "upd") "Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter. Jeg tar deg dit og viser knappen …"
        else "Gå til ${h.path} → «${h.title}». Jeg tar deg dit og viser deg hvor den er …") to hits.map { it.id }
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
        "backup", "sysbackup" -> Icons.Filled.Backup
        "glimt67", "g67rec" -> Icons.Filled.AutoAwesome; "g67mem" -> Icons.Filled.Psychology; "g67ent" -> Icons.Filled.People; "g67sch" -> Icons.Filled.Schedule
        "g67q" -> Icons.Filled.Insights; "app67" -> Icons.Filled.PhoneAndroid; "fin67" -> Icons.Filled.AccountBalance; else -> Icons.Filled.Settings
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
    // Prompt 34: mål med egen kontroll (Oppdater nå, Tema, Haptikk …) åpnes og markeres med rød ring.
    if (ANCHORS34.any { a -> a.id == it.id } && vm.goAnchor34(it.id)) return
    when {
        it.id.startsWith("profile:") -> { vm.settingsPage = "profil"; vm.highlight25(it.id, 1) } // prompt 39: egen underside
        // Prompt 26: hver integrasjon har egen side (Kalendere for skole, Google og HA).
        it.id.startsWith("integ:") -> vm.openInteg26(it.id.removePrefix("integ:"))
        it.id == "kal" -> vm.openKalSettings26(null)
        it.id == "nordlys" -> vm.openNordlys31()
        it.id == "logger44" -> vm.openLogs44() // prompt 44
        it.id == "rollback44" -> vm.openNordlys31() // prompt 44: TIDLIGERE VERSJONER ligger på System-siden
        // Prompt 39: PROFIL er borte fra hovedsiden (to plasser færre), og navn/ikon/fanelinje ligger i Tilpass.
        // Prompt 67: Bankimport og Subscription OS står på siden Moduler → Finans.
        it.id == "import" -> { vm.settingsPage = "fin67"; vm.highlight25(rowKey25("Bankimport"), 0) }
        it.id == "sub" -> { vm.settingsPage = "fin67"; vm.highlight25(rowKey25("Subscription OS"), 0) }
        it.id == "appname" || it.id == "appicon" || it.id == "navstyle" || it.id == "tabedit" -> {
            vm.settingsPage = "tilpass"
            vm.highlight25(rowKey25(when (it.id) { "appname" -> "Navn på appen"; "appicon" -> "App-ikon"; "navstyle" -> "Fanelinje-stil"; else -> "Fanelinje i Hjem" }), 1)
        }
        it.id == "news" -> { vm.settingsPage = "modules"; vm.highlight25(rowKey25("Nyhetsleser"), 0) }
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
            // Prompt 27: ✕ til venstre (høyre-× er fjernet), fokus beholdes.
            SearchLead27(s.sq.isNotEmpty(), p.ink, p.mut, idle = { Icon(Icons.Filled.Search, null, tint = p.mut, modifier = Modifier.size(18.dp)) }) { s.sq = ""; s.aiAnswer = null; s.aiIds = null }
            BasicTextField(
                s.sq, { s.sq = it }, singleLine = true, modifier = Modifier.weight(1f),
                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.ink),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    if (s.sqAi && s.sq.isNotBlank()) vm.b24AiSearch(s.sq.trim(), items) { q -> localAnswer24(items, q) }
                    // Prompt 34: vanlig søk + Enter går rett til beste treff med markering.
                    else if (s.sq.isNotBlank()) score24(items, s.sq, false).firstOrNull()?.let { open24(vm, it) }
                }),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (s.sq.isEmpty()) Text(if (s.sqAi) "Spør, f.eks. «hvor bytter jeg ikon?»" else "Søk i innstillinger", color = p.mut, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        inner()
                    }
                },
            )
        }
        Box(
            Modifier.height(46.dp).shadow(12.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .3f), spotColor = Color.Black.copy(alpha = .3f)).clip(CircleShape)
                .background(if (s.sqAi) p.lab else p.card).clickable(role = Role.Switch, onClickLabel = "AI-søk") { s.sqAi = !s.sqAi }.padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text("✦ AI", color = if (s.sqAi) p.onLab else p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp) } // Prompt 28: onLab, ikke hvit på mørk-aksenten
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
                        // Prompt 34: har svaret et mål (mål-id), går den dit automatisk etter 1,6 s og markerer kontrollen («Vis meg nå ›»).
                        val anchor = (vm.p34.aiAnchor ?: first?.id)?.takeIf { id -> ANCHORS34.any { it.id == id } }
                        if (anchor != null && s.aiAnswer != null && !s.aiBusy) ShowMeNow34(vm, anchor)
                        else if (first != null && s.aiAnswer != null && !s.aiBusy) Box(
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
